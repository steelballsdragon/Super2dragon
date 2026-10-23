import { sleep } from '../util/async.js';
import { LocalCodeError, isAbortError } from '../util/errors.js';
import { newId } from '../util/ids.js';
import { ToolCallStreamFilter, extractToolCalls } from './toolcall-parser.js';
import type { ChatMessage, ChatResponse, GenerationOptions, ModelProvider, StreamEvent, ToolSpec } from './types.js';

/**
 * How tools are exposed to a model:
 *  - native:   structured tool calling via the server API (`tools` parameter).
 *  - prompted: tool descriptions in the system prompt; calls parsed from text.
 *              A clearly labelled fallback for models without working native support.
 *  - none:     chat only; the model cannot act on the workspace.
 */
export type ToolMode = 'native' | 'prompted' | 'none';

export interface ModelClientOptions {
  provider: ModelProvider;
  model: string;
  toolMode: ToolMode;
  capabilities: string[];
  generation: GenerationOptions;
  idleTimeoutSec?: number;
  maxRetries?: number;
}

export interface CompletionResult extends ChatResponse {
  modeUsed: ToolMode;
  /** True when native mode failed and the call was retried in prompted mode. */
  fellBack?: boolean;
  attempts: number;
}

function schemaType(s: Record<string, unknown> | undefined): string {
  if (!s) return 'any';
  if (Array.isArray(s.enum)) return s.enum.map((v) => JSON.stringify(v)).join('|');
  const t = s.type;
  if (t === 'array') {
    const items = s.items as Record<string, unknown> | undefined;
    if (items?.type === 'object' && items.properties) {
      const props = items.properties as Record<string, Record<string, unknown>>;
      const req = new Set((items.required as string[]) ?? []);
      return `[{${Object.entries(props)
        .map(([k, v]) => `${k}${req.has(k) ? '' : '?'}: ${schemaType(v)}`)
        .join(', ')}}]`;
    }
    return `${schemaType(items)}[]`;
  }
  if (Array.isArray(t)) return t.join('|');
  if (s.anyOf && Array.isArray(s.anyOf)) return (s.anyOf as Record<string, unknown>[]).map(schemaType).join('|');
  return typeof t === 'string' ? t : 'any';
}

/** Compact, token-efficient tool documentation for prompted mode. */
export function renderToolInstructions(tools: ToolSpec[]): string {
  const lines: string[] = [];
  for (const t of tools) {
    const props = (t.parameters.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = new Set((t.parameters.required as string[]) ?? []);
    const sig = Object.entries(props)
      .map(([k, v]) => `${k}${required.has(k) ? '' : '?'}: ${schemaType(v)}`)
      .join(', ');
    lines.push(`- ${t.name}(${sig}): ${t.description}`);
    for (const [k, v] of Object.entries(props)) {
      if (typeof v.description === 'string') lines.push(`    ${k}: ${v.description}`);
    }
  }
  return [
    '# Tool calling',
    'You act by calling tools. To call a tool, write a block in exactly this format:',
    '<tool_call>',
    '{"name": "TOOL_NAME", "arguments": {"ARG": "VALUE"}}',
    '</tool_call>',
    'Rules: the JSON must be valid; use real values, never the schema; you may write several blocks;',
    'after your tool calls STOP and wait - results come back inside <tool_result> blocks.',
    'When the task is finished, reply normally with no <tool_call> block.',
    'Example:',
    '<tool_call>',
    '{"name": "read_file", "arguments": {"path": "src/index.js"}}',
    '</tool_call>',
    '',
    '## Available tools',
    ...lines,
  ].join('\n');
}

/** Convert a tool-using history into plain chat messages for prompted mode. */
export function toPromptedMessages(messages: ChatMessage[], tools: ToolSpec[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const instructions = renderToolInstructions(tools);
  let injected = false;
  for (const m of messages) {
    if (m.role === 'system') {
      out.push({ role: 'system', content: injected ? m.content : `${m.content}\n\n${instructions}` });
      injected = true;
      continue;
    }
    if (m.role === 'assistant') {
      const calls = (m.toolCalls ?? [])
        .map((c) => `<tool_call>\n${JSON.stringify({ name: c.name, arguments: c.arguments })}\n</tool_call>`)
        .join('\n');
      out.push({ role: 'assistant', content: [m.content, calls].filter(Boolean).join('\n') });
      continue;
    }
    if (m.role === 'tool') {
      const block = `<tool_result name="${m.toolName ?? 'tool'}">\n${m.content}\n</tool_result>`;
      const prev = out[out.length - 1];
      if (prev?.role === 'user' && prev.content.startsWith('<tool_result')) prev.content += `\n${block}`;
      else out.push({ role: 'user', content: block });
      continue;
    }
    const prev = out[out.length - 1];
    if (prev?.role === 'user') prev.content += `\n\n${m.content}`;
    else out.push({ role: 'user', content: m.content });
  }
  if (!injected) out.unshift({ role: 'system', content: instructions });
  return out;
}

/** Collapse tool history into plain text for chat-only models. */
function toChatOnlyMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.role !== 'tool')
    .map((m) => ({ role: m.role, content: m.content }))
    .filter((m) => m.content.trim().length > 0);
}

/**
 * Wraps a provider + model and translates between the application's internal
 * tool-call schema and whatever the model actually supports.
 */
export class ModelClient {
  constructor(private readonly opts: ModelClientOptions) {}

  get model(): string {
    return this.opts.model;
  }

  get provider(): ModelProvider {
    return this.opts.provider;
  }

  get toolMode(): ToolMode {
    return this.opts.toolMode;
  }

  get supportsThinking(): boolean {
    return this.opts.capabilities.includes('thinking');
  }

  get generation(): GenerationOptions {
    return this.opts.generation;
  }

  async complete(params: {
    messages: ChatMessage[];
    tools: ToolSpec[];
    signal?: AbortSignal;
    onEvent?: (e: StreamEvent) => void;
    /** Override generation options (e.g. for summarization). */
    options?: Partial<GenerationOptions>;
  }): Promise<CompletionResult> {
    const maxRetries = this.opts.maxRetries ?? 2;
    let mode: ToolMode = params.tools.length === 0 ? 'none' : this.opts.toolMode;
    let fellBack = false;
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const res = await this.once(mode, params);
        return { ...res, modeUsed: mode, fellBack, attempts: attempt };
      } catch (err) {
        if (isAbortError(err) || params.signal?.aborted) throw err;
        if (err instanceof LocalCodeError && err.code === 'unsupported' && mode === 'native') {
          mode = 'prompted';
          fellBack = true;
          continue;
        }
        const retryable = err instanceof LocalCodeError && err.retryable;
        if (!retryable || attempt > maxRetries) throw err;
        await sleep(1000 * 3 ** (attempt - 1), params.signal);
      }
    }
  }

  private async once(
    mode: ToolMode,
    params: { messages: ChatMessage[]; tools: ToolSpec[]; signal?: AbortSignal; onEvent?: (e: StreamEvent) => void; options?: Partial<GenerationOptions> },
  ): Promise<ChatResponse> {
    const options: GenerationOptions = { ...this.opts.generation, ...params.options };
    // Only send `think` to models that report the capability; others reject the flag.
    if (!this.supportsThinking) delete options.think;
    else options.think = options.think ?? false;
    const toolNames = params.tools.map((t) => t.name);

    if (mode === 'native') {
      const res = await this.opts.provider.chat(
        {
          model: this.opts.model,
          messages: params.messages,
          tools: params.tools,
          options,
          signal: params.signal,
          idleTimeoutSec: this.opts.idleTimeoutSec,
        },
        params.onEvent,
      );
      if (res.toolCalls.length === 0 && res.content) {
        // The model "supports tools" but wrote the call as text: recover it.
        const parsed = extractToolCalls(res.content, toolNames);
        if (parsed.calls.length) return { ...res, content: parsed.cleanedText, toolCalls: parsed.calls };
      }
      return { ...res, toolCalls: res.toolCalls.map((c) => ({ ...c, id: c.id || newId('call_') })) };
    }

    if (mode === 'prompted') {
      const filter = new ToolCallStreamFilter();
      const res = await this.opts.provider.chat(
        {
          model: this.opts.model,
          messages: toPromptedMessages(params.messages, params.tools),
          options: { ...options, stop: [...(options.stop ?? []), '<tool_result'] },
          signal: params.signal,
          idleTimeoutSec: this.opts.idleTimeoutSec,
        },
        (e) => {
          if (e.type === 'text') {
            const visible = filter.push(e.text);
            if (visible) params.onEvent?.({ type: 'text', text: visible });
          } else params.onEvent?.(e);
        },
      );
      const tail = filter.flush();
      if (tail) params.onEvent?.({ type: 'text', text: tail });
      const parsed = extractToolCalls(res.content, toolNames);
      return { ...res, content: parsed.cleanedText, toolCalls: parsed.calls };
    }

    const res = await this.opts.provider.chat(
      {
        model: this.opts.model,
        messages: toChatOnlyMessages(params.messages),
        options,
        signal: params.signal,
        idleTimeoutSec: this.opts.idleTimeoutSec,
      },
      params.onEvent,
    );
    return { ...res, toolCalls: [] };
  }
}
