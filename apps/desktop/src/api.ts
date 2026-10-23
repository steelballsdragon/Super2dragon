import type { ServerEvent } from './types';

export interface BackendInfo {
  port: number;
  token: string;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

/**
 * Find the local server. In the desktop app the Tauri shell starts it and
 * hands over port + token; in browser mode the token arrives in the URL
 * fragment (never sent over the network) and is kept in sessionStorage.
 */
export async function discoverBackend(): Promise<BackendInfo> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<BackendInfo>('backend_info');
  }
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = hash.get('token');
  if (fromHash) {
    sessionStorage.setItem('localcode.token', fromHash);
    if (hash.get('port')) sessionStorage.setItem('localcode.port', hash.get('port')!);
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  const token = fromHash ?? sessionStorage.getItem('localcode.token');
  if (!token) throw new Error('No access token. Open the URL printed by "localcode serve" (it contains #token=...).');
  const port = Number(hash.get('port') ?? sessionStorage.getItem('localcode.port') ?? import.meta.env.VITE_BACKEND_PORT ?? window.location.port ?? 4317);
  return { port, token };
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; method: string };

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** JSON-RPC-over-WebSocket client with automatic reconnect. */
export class Backend {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly eventListeners = new Set<(e: ServerEvent) => void>();
  private readonly statusListeners = new Set<(s: 'connecting' | 'open' | 'closed', error?: string) => void>();
  private info: BackendInfo | null = null;
  private retry = 0;
  private closedByUser = false;
  status: 'connecting' | 'open' | 'closed' = 'connecting';

  async connect(): Promise<void> {
    this.closedByUser = false;
    this.setStatus('connecting');
    try {
      this.info ??= await discoverBackend();
    } catch (err) {
      this.setStatus('closed', (err as Error).message);
      setTimeout(() => this.connect(), 2000);
      return;
    }
    const url = `ws://127.0.0.1:${this.info.port}/ws?token=${encodeURIComponent(this.info.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
    };
    ws.onmessage = (ev) => {
      let msg: { id?: number; result?: unknown; error?: { code: string; message: string }; event?: ServerEvent };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.event) {
        for (const l of this.eventListeners) l(msg.event);
        return;
      }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new RpcError(msg.error.message, msg.error.code));
        else p.resolve(msg.result);
      }
    };
    ws.onclose = () => {
      this.ws = null;
      for (const [id, p] of this.pending) {
        p.reject(new RpcError('Connection to the LocalCode engine was lost', 'unreachable'));
        this.pending.delete(id);
      }
      this.setStatus('closed', 'Disconnected from the LocalCode engine; reconnecting...');
      if (!this.closedByUser) {
        const delay = Math.min(10_000, 500 * 2 ** this.retry++);
        // A changed port/token (engine restarted) is rediscovered on the next attempt in Tauri.
        if (isTauri()) this.info = null;
        setTimeout(() => this.connect(), delay);
      }
    };
  }

  private setStatus(s: 'connecting' | 'open' | 'closed', error?: string) {
    this.status = s;
    for (const l of this.statusListeners) l(s, error);
  }

  onEvent(fn: (e: ServerEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  onStatus(fn: (s: 'connecting' | 'open' | 'closed', error?: string) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new RpcError('Not connected to the LocalCode engine', 'unreachable'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}

export const backend = new Backend();

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ directory: true, multiple: false, title: 'Open workspace folder' });
  return typeof r === 'string' ? r : null;
}
