import { errorMessage } from '../util/errors.js';
import { ModelClient, type ToolMode } from './adapter.js';
import type { ChatMessage, GenerationOptions, ModelProvider, ToolSpec } from './types.js';

export interface ModeProbe {
  /** Model emitted a correct call for the right tool with the right argument. */
  callOk: boolean;
  /** The call was recovered from text rather than returned as a structured call. */
  salvaged: boolean;
  /** Model used the tool result to answer correctly in a second turn. */
  roundTripOk: boolean;
  latencyMs: number;
  error?: string;
  detail?: string;
}

export interface ProbeResult {
  native?: ModeProbe;
  prompted?: ModeProbe;
  recommended: ToolMode;
  explanation: string;
  testedAt: string;
}

const PROBE_TOOLS: ToolSpec[] = [
  {
    name: 'read_file',
    description: 'Read a text file from the workspace.',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Workspace-relative file path' } }, required: ['path'] },
  },
  {
    name: 'run_command',
    description: 'Run a shell command.',
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'The command' } }, required: ['command'] },
  },
];

const SYSTEM = 'You are a coding agent. You can only learn about files by calling tools. Always call a tool when the user asks about file contents.';
const QUESTION = 'What port number is configured in the file config/server.json? Use the read_file tool to find out.';
const FILE_CONTENT = '{\n  "host": "127.0.0.1",\n  "port": 8317\n}';

async function probeMode(provider: ModelProvider, model: string, capabilities: string[], generation: GenerationOptions, mode: ToolMode, signal?: AbortSignal): Promise<ModeProbe> {
  const client = new ModelClient({ provider, model, toolMode: mode, capabilities, generation: { ...generation, temperature: 0, maxTokens: 512 }, maxRetries: 0, idleTimeoutSec: 300 });
  const started = Date.now();
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: QUESTION },
  ];
  try {
    const first = await client.complete({ messages, tools: PROBE_TOOLS, signal });
    const call = first.toolCalls.find((c) => c.name === 'read_file');
    // In prompted mode every call is parsed from text by design; "salvaged" only matters for native mode.
    const salvaged = mode === 'native' && !!call?.salvaged;
    const path = typeof call?.arguments.path === 'string' ? call.arguments.path : '';
    const callOk = !!call && /config[/\\]server\.json$/.test(path.replace(/^\.\//, ''));
    if (!callOk) {
      return {
        callOk: false,
        salvaged,
        roundTripOk: false,
        latencyMs: Date.now() - started,
        detail: call ? `called read_file with ${JSON.stringify(call.arguments).slice(0, 160)}` : `no tool call; replied: ${first.content.slice(0, 160)}`,
      };
    }
    const second = await client.complete({
      messages: [
        ...messages,
        { role: 'assistant', content: first.content, toolCalls: [call] },
        { role: 'tool', content: FILE_CONTENT, toolCallId: call.id, toolName: 'read_file' },
      ],
      tools: PROBE_TOOLS,
      signal,
    });
    const roundTripOk = /8317/.test(second.content) && second.toolCalls.length === 0;
    return {
      callOk,
      salvaged,
      roundTripOk,
      latencyMs: Date.now() - started,
      detail: roundTripOk ? undefined : `follow-up reply: ${second.content.slice(0, 160) || `(tool calls: ${second.toolCalls.map((c) => c.name).join(', ')})`}`,
    };
  } catch (err) {
    return { callOk: false, salvaged: false, roundTripOk: false, latencyMs: Date.now() - started, error: errorMessage(err) };
  }
}

/**
 * Test whether a model can actually use tools, natively and with the
 * prompted fallback, instead of trusting advertised capabilities.
 */
export async function probeToolCalling(
  provider: ModelProvider,
  model: string,
  capabilities: string[],
  generation: GenerationOptions,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const testedAt = new Date().toISOString();
  const nativeAdvertised = capabilities.includes('tools');
  const native = await probeMode(provider, model, capabilities, generation, 'native', signal);
  if (native.callOk && native.roundTripOk && !native.salvaged) {
    return { native, recommended: 'native', explanation: 'Native tool calling works (structured calls and tool-result round trip).', testedAt };
  }
  const prompted = await probeMode(provider, model, capabilities, generation, 'prompted', signal);
  const score = (p: ModeProbe) => (p.callOk ? 2 : 0) + (p.roundTripOk ? 1 : 0) + (p.salvaged ? 0 : 0.5);
  if (prompted.callOk && score(prompted) >= score(native)) {
    return {
      native,
      prompted,
      recommended: 'prompted',
      explanation: `${nativeAdvertised ? 'The model advertises tool support, but native' : 'Native'} tool calling ${native.callOk ? 'was unreliable' : 'failed'}; the prompted fallback (tool calls parsed from text) works better.`,
      testedAt,
    };
  }
  if (native.callOk) {
    return {
      native,
      prompted,
      recommended: 'native',
      explanation: native.salvaged
        ? 'The model writes tool calls as text instead of structured calls; LocalCode recovers them automatically. Expect reduced reliability.'
        : 'Native tool calling works, but the model struggled to use tool results.',
      testedAt,
    };
  }
  return {
    native,
    prompted,
    recommended: 'none',
    explanation:
      native.error && prompted.error
        ? `The model could not be queried: ${native.error}`
        : 'The model could not produce valid tool calls in either mode. It can only be used in chat-only mode; choose a tool-capable model (e.g. qwen2.5-coder:7b, qwen3, llama3.1) for agent work.',
    testedAt,
  };
}
