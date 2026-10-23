import { LocalCodeError } from '../util/errors.js';
import { newId } from '../util/ids.js';
import { httpJson, httpStreamLines } from './http.js';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ModelDetails,
  ModelInfo,
  ModelProvider,
  ProviderConfig,
  ProviderHealth,
  StreamEvent,
  ToolCall,
} from './types.js';

/**
 * Provider for OpenAI-compatible local inference servers: llama.cpp's
 * llama-server (run with --jinja for tool calls), LM Studio, LocalAI, vLLM,
 * llama-cpp-python and others. The base URL should include the /v1 suffix.
 */
export class OpenAICompatProvider implements ModelProvider {
  constructor(readonly config: ProviderConfig) {}

  private get base(): string {
    return this.config.baseUrl.replace(/\/+$/, '');
  }

  /** Server root (without /v1) for non-OpenAI endpoints such as llama.cpp's /props. */
  private get root(): string {
    return this.base.replace(/\/v1$/, '');
  }

  private headers(): Record<string, string> {
    return this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {};
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const t = Date.now();
    try {
      await httpJson(`${this.base}/models`, { signal, timeoutMs: 4000, headers: this.headers() });
      // llama.cpp answers /v1/models while still loading weights; /health tells the truth (503 while loading).
      try {
        await httpJson(`${this.root}/health`, { timeoutMs: 2000, headers: this.headers() });
      } catch (err) {
        if (err instanceof LocalCodeError && (err.details as { status?: number } | undefined)?.status === 503) {
          return { ok: false, error: 'Server is still loading the model; try again shortly.', latencyMs: Date.now() - t };
        }
      }
      let version: string | undefined;
      try {
        const props = await httpJson<{ build_info?: string }>(`${this.root}/props`, { timeoutMs: 2000, headers: this.headers() });
        version = props.build_info ? `llama.cpp ${props.build_info}` : undefined;
      } catch {
        /* not llama.cpp */
      }
      return { ok: true, version, latencyMs: Date.now() - t };
    } catch (err) {
      return { ok: false, error: (err as Error).message, latencyMs: Date.now() - t };
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const r = await httpJson<{ data?: { id: string; created?: number; owned_by?: string }[] }>(`${this.base}/models`, {
      signal,
      timeoutMs: 10_000,
      headers: this.headers(),
    });
    return (r.data ?? []).map((m) => ({
      name: m.id,
      providerId: this.config.id,
      modifiedAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
    }));
  }

  async showModel(name: string, signal?: AbortSignal): Promise<ModelDetails> {
    const details: ModelDetails = {
      name,
      providerId: this.config.id,
      capabilities: ['completion'],
      capabilitiesReported: false,
    };
    // llama.cpp server exposes /props with the context size and chat template capabilities.
    try {
      const props = await httpJson<{
        default_generation_settings?: { n_ctx?: number };
        n_ctx?: number;
        chat_template?: string;
        chat_template_caps?: Record<string, boolean>;
        modalities?: { vision?: boolean };
      }>(`${this.root}/props`, { signal, timeoutMs: 4000, headers: this.headers() });
      details.contextLength = props.default_generation_settings?.n_ctx ?? props.n_ctx;
      const caps = props.chat_template_caps;
      if (caps) {
        details.capabilitiesReported = true;
        if (caps.supports_tools || caps.supports_tool_calls) details.capabilities.push('tools');
      } else if (props.chat_template && /tool/i.test(props.chat_template)) {
        // Template mentions tools: likely supported when the server runs with --jinja.
        details.capabilities.push('tools');
      }
      if (props.modalities?.vision) details.capabilities.push('vision');
      return details;
    } catch {
      /* not llama.cpp */
    }
    // LM Studio exposes richer model metadata under /api/v0/models.
    try {
      const m = await httpJson<{ capabilities?: string[]; max_context_length?: number; type?: string; arch?: string; quantization?: string }>(
        `${this.root}/api/v0/models/${encodeURIComponent(name)}`,
        { signal, timeoutMs: 4000, headers: this.headers() },
      );
      details.contextLength = m.max_context_length;
      details.architecture = m.arch;
      details.quantization = m.quantization;
      if (Array.isArray(m.capabilities)) {
        details.capabilitiesReported = true;
        if (m.capabilities.includes('tool_use')) details.capabilities.push('tools');
      }
      if (m.type === 'embeddings') details.capabilities = ['embedding'];
    } catch {
      /* unknown server: capabilities stay unreported and are determined by probing */
    }
    return details;
  }

  async chat(req: ChatRequest, onEvent?: (e: StreamEvent) => void): Promise<ChatResponse> {
    const o = req.options ?? {};
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAIMessages(req.messages),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (o.temperature !== undefined) body.temperature = o.temperature;
    if (o.topP !== undefined) body.top_p = o.topP;
    if (o.maxTokens !== undefined) body.max_tokens = o.maxTokens;
    if (o.seed !== undefined) body.seed = o.seed;
    if (o.stop?.length) body.stop = o.stop;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = 'auto';
    }

    const started = Date.now();
    let firstTokenAt: number | undefined;
    let content = '';
    let thinking = '';
    let finishReason: string | undefined;
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
    let timings: { prompt_per_second?: number; predicted_per_second?: number } | undefined;
    const partial = new Map<number, { id?: string; name: string; args: string }>();

    for await (const line of httpStreamLines(`${this.base}/chat/completions`, {
      body,
      signal: req.signal,
      idleTimeoutSec: req.idleTimeoutSec,
      headers: this.headers(),
    })) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') break;
      let chunk: {
        choices?: {
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
          };
          finish_reason?: string | null;
        }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        timings?: { prompt_per_second?: number; predicted_per_second?: number };
        error?: { message?: string };
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new LocalCodeError('http', chunk.error.message ?? 'Server error');
      if (chunk.usage) usage = chunk.usage;
      if (chunk.timings) timings = chunk.timings;
      for (const choice of chunk.choices ?? []) {
        const d = choice.delta ?? {};
        if (d.reasoning_content) {
          thinking += d.reasoning_content;
          onEvent?.({ type: 'thinking', text: d.reasoning_content });
        }
        if (d.content) {
          firstTokenAt ??= Date.now();
          content += d.content;
          onEvent?.({ type: 'text', text: d.content });
        }
        for (const tc of d.tool_calls ?? []) {
          firstTokenAt ??= Date.now();
          const idx = tc.index ?? 0;
          const cur = partial.get(idx) ?? { name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          partial.set(idx, cur);
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }

    const toolCalls: ToolCall[] = [...partial.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, p]) => {
        let args: Record<string, unknown> = {};
        let parseError: string | undefined;
        if (p.args.trim()) {
          try {
            args = JSON.parse(p.args);
          } catch {
            parseError = p.args;
          }
        }
        return { id: p.id ?? newId('call_'), name: p.name, arguments: args, ...(parseError ? { parseError } : {}) };
      });

    return {
      content,
      thinking: thinking || undefined,
      toolCalls,
      finishReason,
      usage: {
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalDurationMs: Date.now() - started,
        promptTokensPerSec: timings?.prompt_per_second,
        evalTokensPerSec: timings?.predicted_per_second,
        timeToFirstTokenMs: firstTokenAt ? firstTokenAt - started : undefined,
      },
    };
  }

  async embed(model: string, input: string[], signal?: AbortSignal): Promise<number[][]> {
    const r = await httpJson<{ data: { embedding: number[]; index: number }[] }>(`${this.base}/embeddings`, {
      body: { model, input },
      signal,
      timeoutMs: 300_000,
      headers: this.headers(),
    });
    return [...r.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}
