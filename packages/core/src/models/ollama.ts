import { LocalCodeError } from '../util/errors.js';
import { newId } from '../util/ids.js';
import { classifyServerError, httpJson, httpStreamLines } from './http.js';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  LoadedModel,
  ModelDetails,
  ModelInfo,
  ModelProvider,
  ProviderConfig,
  ProviderHealth,
  PullProgress,
  StreamEvent,
  ToolCall,
} from './types.js';

interface OllamaTag {
  name: string;
  model: string;
  size: number;
  modified_at: string;
  details?: { family?: string; parameter_size?: string; quantization_level?: string };
}

interface OllamaChatChunk {
  message?: {
    role: string;
    content?: string;
    thinking?: string;
    tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[];
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
  load_duration?: number;
  error?: string;
}

function toOllamaMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', content: m.content, tool_name: m.toolName };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

export class OllamaProvider implements ModelProvider {
  constructor(readonly config: ProviderConfig) {}

  private url(path: string): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const t = Date.now();
    try {
      const v = await httpJson<{ version: string }>(this.url('/api/version'), { signal, timeoutMs: 4000 });
      return { ok: true, version: v.version, latencyMs: Date.now() - t };
    } catch (err) {
      return { ok: false, error: (err as Error).message, latencyMs: Date.now() - t };
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const r = await httpJson<{ models: OllamaTag[] }>(this.url('/api/tags'), { signal, timeoutMs: 10_000 });
    return (r.models ?? []).map((m) => ({
      name: m.name,
      providerId: this.config.id,
      sizeBytes: m.size,
      family: m.details?.family,
      parameterSize: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
      modifiedAt: m.modified_at,
    }));
  }

  async showModel(name: string, signal?: AbortSignal): Promise<ModelDetails> {
    const r = await httpJson<{
      capabilities?: string[];
      details?: OllamaTag['details'];
      model_info?: Record<string, unknown>;
      modified_at?: string;
    }>(this.url('/api/show'), { body: { model: name }, signal, timeoutMs: 15_000 });
    const info = r.model_info ?? {};
    const arch = String(info['general.architecture'] ?? r.details?.family ?? '');
    const num = (k: string): number | undefined => {
      const v = info[`${arch}.${k}`];
      return typeof v === 'number' ? v : undefined;
    };
    const headCount = num('attention.head_count');
    const embedding = num('embedding_length');
    const keyLen = num('attention.key_length') ?? (headCount && embedding ? embedding / headCount : undefined);
    const valueLen = num('attention.value_length') ?? keyLen;
    let sizeBytes: number | undefined;
    try {
      sizeBytes = (await this.listModels(signal)).find((m) => m.name === name)?.sizeBytes;
    } catch {
      /* size is optional */
    }
    return {
      name,
      providerId: this.config.id,
      sizeBytes,
      family: r.details?.family,
      parameterSize: r.details?.parameter_size,
      quantization: r.details?.quantization_level,
      modifiedAt: r.modified_at,
      capabilities: r.capabilities ?? ['completion'],
      capabilitiesReported: Array.isArray(r.capabilities),
      contextLength: num('context_length'),
      architecture: arch || undefined,
      layers: num('block_count'),
      kvHeads: num('attention.head_count_kv') ?? headCount,
      kvDimPerHead: keyLen !== undefined && valueLen !== undefined ? keyLen + valueLen : undefined,
      embeddingLength: embedding,
    };
  }

  async listLoaded(signal?: AbortSignal): Promise<LoadedModel[]> {
    const r = await httpJson<{
      models: { name: string; size: number; size_vram: number; expires_at: string; context_length?: number }[];
    }>(this.url('/api/ps'), { signal, timeoutMs: 5000 });
    return (r.models ?? []).map((m) => ({
      name: m.name,
      sizeBytes: m.size,
      vramBytes: m.size_vram,
      expiresAt: m.expires_at,
      contextLength: m.context_length,
    }));
  }

  async chat(req: ChatRequest, onEvent?: (e: StreamEvent) => void): Promise<ChatResponse> {
    const o = req.options ?? {};
    const options: Record<string, unknown> = {};
    if (o.temperature !== undefined) options.temperature = o.temperature;
    if (o.topP !== undefined) options.top_p = o.topP;
    if (o.numCtx !== undefined) options.num_ctx = o.numCtx;
    if (o.maxTokens !== undefined) options.num_predict = o.maxTokens;
    if (o.numGpu !== undefined) options.num_gpu = o.numGpu;
    if (o.seed !== undefined) options.seed = o.seed;
    if (o.stop?.length) options.stop = o.stop;
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOllamaMessages(req.messages),
      stream: true,
      options,
    };
    if (o.keepAlive) body.keep_alive = o.keepAlive;
    if (o.think !== undefined) body.think = o.think;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const started = Date.now();
    let firstTokenAt: number | undefined;
    let content = '';
    let thinking = '';
    const toolCalls: ToolCall[] = [];
    let final: OllamaChatChunk | undefined;

    for await (const line of httpStreamLines(this.url('/api/chat'), {
      body,
      signal: req.signal,
      idleTimeoutSec: req.idleTimeoutSec,
    })) {
      let chunk: OllamaChatChunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        continue;
      }
      if (chunk.error) throw classifyServerError(500, chunk.error);
      const msg = chunk.message;
      if (msg?.thinking) {
        thinking += msg.thinking;
        onEvent?.({ type: 'thinking', text: msg.thinking });
      }
      if (msg?.content) {
        firstTokenAt ??= Date.now();
        content += msg.content;
        onEvent?.({ type: 'text', text: msg.content });
      }
      for (const tc of msg?.tool_calls ?? []) {
        firstTokenAt ??= Date.now();
        let args = tc.function.arguments;
        let parseError: string | undefined;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            parseError = args as string;
            args = {};
          }
        }
        toolCalls.push({
          id: newId('call_'),
          name: tc.function.name,
          arguments: (args ?? {}) as Record<string, unknown>,
          ...(parseError ? { parseError } : {}),
        });
      }
      if (chunk.done) final = chunk;
    }
    if (!final) throw new LocalCodeError('bad_response', 'Model stream ended without completion marker', { retryable: true });
    const ns = 1e9;
    return {
      content,
      thinking: thinking || undefined,
      toolCalls,
      finishReason: final.done_reason,
      usage: {
        promptTokens: final.prompt_eval_count,
        completionTokens: final.eval_count,
        totalDurationMs: final.total_duration ? final.total_duration / 1e6 : Date.now() - started,
        loadDurationMs: final.load_duration ? final.load_duration / 1e6 : undefined,
        promptTokensPerSec:
          final.prompt_eval_count && final.prompt_eval_duration ? final.prompt_eval_count / (final.prompt_eval_duration / ns) : undefined,
        evalTokensPerSec: final.eval_count && final.eval_duration ? final.eval_count / (final.eval_duration / ns) : undefined,
        timeToFirstTokenMs: firstTokenAt ? firstTokenAt - started : undefined,
      },
    };
  }

  async pull(name: string, onProgress: (p: PullProgress) => void, signal?: AbortSignal): Promise<void> {
    for await (const line of httpStreamLines(this.url('/api/pull'), {
      body: { model: name, stream: true },
      signal,
      idleTimeoutSec: 300,
    })) {
      let p: { status?: string; completed?: number; total?: number; digest?: string; error?: string };
      try {
        p = JSON.parse(line);
      } catch {
        continue;
      }
      if (p.error) throw new LocalCodeError('http', `Pull failed: ${p.error}`);
      onProgress({ status: p.status ?? '', completed: p.completed, total: p.total, digest: p.digest });
    }
  }

  async deleteModel(name: string): Promise<void> {
    await httpJson(this.url('/api/delete'), { method: 'DELETE', body: { model: name } });
  }

  async embed(model: string, input: string[], signal?: AbortSignal): Promise<number[][]> {
    const r = await httpJson<{ embeddings: number[][] }>(this.url('/api/embed'), {
      body: { model, input },
      signal,
      timeoutMs: 300_000,
    });
    return r.embeddings;
  }

  async unload(name: string): Promise<void> {
    await httpJson(this.url('/api/generate'), { body: { model: name, keep_alive: 0 }, timeoutMs: 15_000 });
  }
}
