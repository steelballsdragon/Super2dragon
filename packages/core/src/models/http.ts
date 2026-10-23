import { LocalCodeError } from '../util/errors.js';

export interface HttpOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Total timeout for non-streaming requests (ms). */
  timeoutMs?: number;
}

function networkError(url: string, err: unknown, signal?: AbortSignal): LocalCodeError {
  if (signal?.aborted) return new LocalCodeError('aborted', 'Request cancelled');
  const e = err as { name?: string; cause?: { code?: string }; message?: string };
  if (e?.name === 'TimeoutError') return new LocalCodeError('timeout', `Request to ${url} timed out`, { retryable: true });
  if (e?.name === 'AbortError') return new LocalCodeError('aborted', 'Request cancelled');
  const code = e?.cause?.code;
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'UND_ERR_SOCKET') {
    return new LocalCodeError('unreachable', `Cannot reach inference server at ${new URL(url).origin} (${code}). Is it running?`, {
      retryable: true,
      cause: err,
    });
  }
  return new LocalCodeError('unreachable', `Request to ${url} failed: ${e?.message ?? String(err)}`, { retryable: true, cause: err });
}

/** Classify server error text into actionable error codes. */
export function classifyServerError(status: number, text: string): LocalCodeError {
  const lower = text.toLowerCase();
  if (/requires more system memory|out of memory|insufficient memory|cudamalloc failed|failed to allocate|not enough memory|oom/.test(lower)) {
    return new LocalCodeError('out_of_memory', `Model could not be loaded: ${text.trim()}`, { details: { status } });
  }
  if (/context (length|window|size)|exceeds the context|too many tokens|n_ctx|prompt is too long/.test(lower)) {
    return new LocalCodeError('context_overflow', `Context limit exceeded: ${text.trim()}`, { details: { status } });
  }
  if (status === 404 || /model .*not found|no such model|pull the model/.test(lower)) {
    return new LocalCodeError('model_not_found', `Model not found: ${text.trim()}`, { details: { status } });
  }
  if (/does not support tools|tools are not supported|tools? (param|parameter)?.*(not supported|unsupported)|requires --jinja|--jinja flag/.test(lower)) {
    return new LocalCodeError('unsupported', `Model does not support native tool calling: ${text.trim()}`, { details: { status } });
  }
  return new LocalCodeError('http', `Server error ${status}: ${text.trim().slice(0, 500)}`, {
    retryable: status >= 500 || status === 429,
    details: { status },
  });
}

export async function httpJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const signals = [opts.signal, AbortSignal.timeout(opts.timeoutMs ?? 30_000)].filter(Boolean) as AbortSignal[];
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...opts.headers },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.any(signals),
    });
  } catch (err) {
    throw networkError(url, err, opts.signal);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.error?.message ?? j.error ?? text;
    } catch {
      /* keep raw text */
    }
    throw classifyServerError(res.status, String(msg));
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch (err) {
    throw new LocalCodeError('bad_response', `Invalid JSON from ${url}: ${text.slice(0, 200)}`, { cause: err });
  }
}

/**
 * POST and iterate over a streaming response line by line. An idle timer aborts
 * the request if no bytes arrive for idleTimeoutSec (local models on CPU can be
 * slow to process long prompts, so the default is generous).
 */
export async function* httpStreamLines(
  url: string,
  opts: HttpOptions & { idleTimeoutSec?: number },
): AsyncGenerator<string> {
  const idleMs = (opts.idleTimeoutSec ?? 600) * 1000;
  const controller = new AbortController();
  let idleTimer: NodeJS.Timeout | undefined;
  let idleFired = false;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleFired = true;
      controller.abort();
    }, idleMs);
  };
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  resetIdle();
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'POST',
      headers: { 'content-type': 'application/json', ...opts.headers },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (idleTimer) clearTimeout(idleTimer);
    opts.signal?.removeEventListener('abort', onAbort);
    if (idleFired) throw new LocalCodeError('timeout', `No response from model server for ${idleMs / 1000}s`, { retryable: true });
    throw networkError(url, err, opts.signal);
  }
  try {
    if (!res.ok || !res.body) {
      const text = await res.text();
      let msg = text;
      try {
        const j = JSON.parse(text);
        msg = j.error?.message ?? j.error ?? text;
      } catch {
        /* raw */
      }
      throw classifyServerError(res.status, String(msg));
    }
    const decoder = new TextDecoder();
    let buffer = '';
    const reader = res.body.getReader();
    while (true) {
      let chunk: { done: boolean; value?: Uint8Array };
      try {
        chunk = await reader.read();
      } catch (err) {
        if (idleFired) throw new LocalCodeError('timeout', `Model server stalled for ${idleMs / 1000}s`, { retryable: true });
        throw networkError(url, err, opts.signal);
      }
      if (chunk.done) break;
      resetIdle();
      buffer += decoder.decode(chunk.value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line.trim()) yield line;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer.trim();
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
