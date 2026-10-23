import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  type Engine,
  type EngineEvent,
  type ModelRef,
  type PermissionMode,
  type Settings,
  LocalCodeError,
  PERMISSION_MODES,
  errorMessage,
  runBenchmark,
  runDoctor,
} from '@localcode/core';
import { VERSION } from './version.js';

export interface ServerOptions {
  host: string;
  port: number;
  token: string;
  uiDir?: string;
  allowedOrigins?: string[];
}

type Params = Record<string, unknown>;
type Handler = (p: Params, ctx: { opSignal: (opId?: string) => AbortSignal }) => Promise<unknown> | unknown;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function str(p: Params, key: string): string {
  const v = p[key];
  if (typeof v !== 'string' || !v) throw new LocalCodeError('invalid_argument', `Missing parameter "${key}"`);
  return v;
}

function optStr(p: Params, key: string): string | undefined {
  const v = p[key];
  return typeof v === 'string' && v ? v : undefined;
}

function modelRef(p: Params): ModelRef | undefined {
  const m = p.model as ModelRef | undefined;
  return m && typeof m.providerId === 'string' && typeof m.model === 'string' ? m : undefined;
}

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Fetch the Ollama registry manifest to disclose download size before pulling (explicit user request only). */
async function ollamaDownloadInfo(model: string): Promise<{ model: string; sizeBytes: number; source: string }> {
  const [repo, tag = 'latest'] = model.includes(':') ? model.split(':') : [model, 'latest'];
  const name = repo.includes('/') ? repo : `library/${repo}`;
  const url = `https://registry.ollama.ai/v2/${name}/manifests/${tag}`;
  const res = await fetch(url, { headers: { accept: 'application/vnd.docker.distribution.manifest.v2+json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new LocalCodeError('not_found', `Model "${model}" not found in the Ollama registry (${res.status}).`);
  const manifest = (await res.json()) as { layers?: { size: number }[]; config?: { size: number } };
  const size = (manifest.layers ?? []).reduce((s, l) => s + (l.size ?? 0), 0) + (manifest.config?.size ?? 0);
  return { model, sizeBytes: size, source: 'registry.ollama.ai' };
}

export async function startServer(engine: Engine, opts: ServerOptions): Promise<{ port: number; close: () => Promise<void> }> {
  const ops = new Map<string, AbortController>();
  const opSignal = (opId?: string) => {
    const c = new AbortController();
    if (opId) ops.set(opId, c);
    return c.signal;
  };

  const handlers: Record<string, Handler> = {
    'app.info': () => ({ version: VERSION, dataDir: engine.dataDir, platform: process.platform, node: process.version }),
    'app.doctor': () => runDoctor({ dataDir: engine.dataDir, settings: engine.settings(), providers: engine.providers() }),
    'system.info': () => engine.systemInfo(),
    'settings.get': () => engine.settings(),
    'settings.update': (p) => engine.updateSettings((p.patch ?? {}) as Partial<Settings>),
    'models.list': () => engine.listModels(),
    'models.probe': (p, ctx) => engine.probeModel({ providerId: str(p, 'providerId'), model: str(p, 'model') }, ctx.opSignal(optStr(p, 'opId'))),
    'models.downloadInfo': (p) => ollamaDownloadInfo(str(p, 'model')),
    'models.pull': async (p, ctx) => {
      await engine.pullModel(str(p, 'providerId'), str(p, 'model'), ctx.opSignal(optStr(p, 'opId')));
      return { ok: true };
    },
    'models.unload': async (p) => {
      await engine.provider(str(p, 'providerId')).unload?.(str(p, 'model'));
      return { ok: true };
    },
    'models.benchmark': (p, ctx) => {
      const ref = { providerId: str(p, 'providerId'), model: str(p, 'model') };
      return runBenchmark(engine, ref, {
        signal: ctx.opSignal(optStr(p, 'opId')),
        onProgress: (message) => broadcast({ type: 'log', level: 'info', message: `[benchmark ${ref.model}] ${message}` } as EngineEvent),
      });
    },
    'workspaces.list': () => engine.store.listWorkspaces(),
    'workspaces.open': async (p) => {
      const session = engine.openWorkspace(str(p, 'path'));
      await session.index.ensureFresh();
      return { workspace: session.record, project: await session.index.project(), index: session.index.stats, permissionMode: session.permissionMode() };
    },
    'workspace.project': async (p) => {
      const s = engine.session(str(p, 'workspaceId'));
      return { project: await s.index.project(), index: s.index.stats, permissionMode: s.permissionMode() };
    },
    'workspace.listDir': async (p) => {
      const s = engine.session(str(p, 'workspaceId'));
      await s.index.ensureFresh();
      const dir = (optStr(p, 'dir') ?? '').replace(/^\.\/?/, '').replace(/\/+$/, '');
      const prefix = dir ? `${dir}/` : '';
      const dirs = new Map<string, number>();
      const files: { name: string; path: string; size: number }[] = [];
      for (const f of s.index.files) {
        if (!f.path.startsWith(prefix)) continue;
        const rest = f.path.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash >= 0) {
          const name = rest.slice(0, slash);
          dirs.set(name, (dirs.get(name) ?? 0) + 1);
        } else files.push({ name: rest, path: f.path, size: f.size });
      }
      return {
        dir,
        dirs: [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, path: prefix + name, count })),
        files: files.sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
    'workspace.readFile': (p) => {
      const s = engine.session(str(p, 'workspaceId'));
      const { abs, rel } = s.guard.resolve(str(p, 'path'));
      const st = statSync(abs);
      if (st.size > 2 * 1024 * 1024) return { path: rel, content: null, tooLarge: true, size: st.size };
      const buf = readFileSync(abs);
      const binary = buf.subarray(0, 8192).includes(0);
      return { path: rel, content: binary ? null : buf.toString('utf8'), binary, size: st.size };
    },
    'workspace.setPermissionMode': (p) => {
      const mode = optStr(p, 'mode') as PermissionMode | undefined;
      if (mode && !PERMISSION_MODES.includes(mode)) throw new LocalCodeError('invalid_argument', `Unknown mode ${mode}`);
      engine.setPermissionMode(str(p, 'workspaceId'), mode);
      return { mode: engine.session(str(p, 'workspaceId')).permissionMode() };
    },
    'workspace.refreshIndex': async (p) => {
      const s = engine.session(str(p, 'workspaceId'));
      await s.index.refresh();
      return s.index.stats;
    },
    'rules.list': (p) => engine.store.listRules(str(p, 'workspaceId')),
    'rules.delete': (p) => {
      engine.store.deleteRule(str(p, 'ruleId'));
      return { ok: true };
    },
    'conversations.list': (p) => engine.store.listConversations(str(p, 'workspaceId')),
    'conversations.create': (p) => engine.createConversation(str(p, 'workspaceId'), { title: optStr(p, 'title'), model: modelRef(p) }),
    'conversations.get': (p) => {
      const id = str(p, 'conversationId');
      const conversation = engine.store.getConversation(id);
      if (!conversation) throw new LocalCodeError('not_found', 'Conversation not found');
      const tasks = engine.store.listTasks(id).map((t) => ({ ...t, running: engine.isRunning(t.id) }));
      return { conversation, messages: engine.store.listMessages(id), tasks, pendingApprovals: engine.pendingApprovals().filter((a) => tasks.some((t) => t.id === a.taskId)) };
    },
    'conversations.rename': (p) => {
      engine.store.updateConversation(str(p, 'conversationId'), { title: str(p, 'title') });
      return { ok: true };
    },
    'conversations.delete': (p) => {
      const id = str(p, 'conversationId');
      for (const t of engine.store.listTasks(id)) engine.cancelTask(t.id);
      engine.store.deleteConversation(id);
      return { ok: true };
    },
    'conversations.setModel': (p) => {
      const ref = modelRef(p);
      if (!ref) throw new LocalCodeError('invalid_argument', 'model is required');
      engine.setConversationModel(str(p, 'conversationId'), ref);
      return { ok: true };
    },
    'tasks.start': (p) => engine.startTask({ conversationId: str(p, 'conversationId'), prompt: str(p, 'prompt'), model: modelRef(p) }),
    'tasks.cancel': (p) => ({ cancelled: engine.cancelTask(str(p, 'taskId')) }),
    'tasks.resume': (p) => engine.resumeTask(str(p, 'taskId'), { model: modelRef(p) }),
    'tasks.get': (p) => engine.store.getTask(str(p, 'taskId')),
    'tasks.events': (p) => engine.store.listEvents({ taskId: str(p, 'taskId'), afterId: Number(p.afterId ?? 0) }),
    'tasks.diff': (p) => engine.taskDiff(str(p, 'taskId')),
    'tasks.undo': (p) => engine.undoTask(str(p, 'taskId')),
    'activity.list': (p) => engine.store.listEvents({ conversationId: str(p, 'conversationId'), afterId: Number(p.afterId ?? 0), limit: 3000 }),
    'approvals.pending': () => engine.pendingApprovals(),
    'approvals.respond': (p) => {
      const answer = str(p, 'answer');
      if (!['allow_once', 'allow_always', 'deny'].includes(answer)) throw new LocalCodeError('invalid_argument', 'answer must be allow_once, allow_always or deny');
      return { ok: engine.respondApproval(str(p, 'requestId'), { answer: answer as 'allow_once', message: optStr(p, 'message') }) };
    },
    'checkpoints.list': (p) => engine.listCheckpoints(str(p, 'workspaceId')),
    'checkpoints.diff': (p) => {
      const ws = str(p, 'workspaceId');
      const cp = engine.store.getCheckpoint(str(p, 'checkpointId'));
      if (!cp) throw new LocalCodeError('not_found', 'Checkpoint not found');
      return engine.diffSince(ws, cp.commitHash);
    },
    'checkpoints.restore': (p) => engine.restoreCheckpoint(str(p, 'workspaceId'), str(p, 'checkpointId'), Array.isArray(p.paths) ? (p.paths as string[]) : undefined),
    'terminal.run': (p, ctx) => engine.runTerminalCommand(str(p, 'workspaceId'), str(p, 'command'), ctx.opSignal(optStr(p, 'opId'))),
    'ops.cancel': (p) => {
      const c = ops.get(str(p, 'opId'));
      c?.abort();
      return { cancelled: !!c };
    },
    'embeddings.update': async (p, ctx) => {
      const s = engine.session(str(p, 'workspaceId'));
      const emb = engine.settings().models.embedding;
      if (!emb) throw new LocalCodeError('invalid_argument', 'Select an embedding model in Settings first.');
      s.search.embeddings.configure(engine.provider(emb.providerId), emb.model);
      return s.search.embeddings.update(ctx.opSignal(optStr(p, 'opId')), (done, total) =>
        broadcast({ type: 'log', level: 'info', message: `Embedding index: ${done}/${total} files` } as EngineEvent),
      );
    },
  };

  const allowed = new Set([
    `http://127.0.0.1:${opts.port}`,
    `http://localhost:${opts.port}`,
    'tauri://localhost',
    'http://tauri.localhost',
    'https://tauri.localhost',
    ...(opts.allowedOrigins ?? []),
  ]);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: VERSION }));
      return;
    }
    if (!opts.uiDir || req.method !== 'GET') {
      res.writeHead(404).end('Not found');
      return;
    }
    const root = path.resolve(opts.uiDir);
    let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(root, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('UI not built. Run: npm run build');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
  const clients = new Set<WebSocket>();
  const broadcast = (e: EngineEvent) => {
    const msg = JSON.stringify({ event: e });
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  };
  engine.on('event', broadcast);

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    const token = url.searchParams.get('token') ?? '';
    if (url.pathname !== '/ws' || !tokensEqual(token, opts.token) || (origin && !allowed.has(origin))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.on('close', () => clients.delete(ws));
      ws.on('message', async (raw) => {
        let msg: { id?: number | string; method?: string; params?: Params };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const handler = msg.method ? handlers[msg.method] : undefined;
        if (!handler) {
          ws.send(JSON.stringify({ id: msg.id, error: { code: 'not_found', message: `Unknown method ${msg.method}` } }));
          return;
        }
        try {
          const result = await handler(msg.params ?? {}, { opSignal });
          ws.send(JSON.stringify({ id: msg.id, result: result ?? null }));
        } catch (err) {
          const code = err instanceof LocalCodeError ? err.code : 'internal';
          ws.send(JSON.stringify({ id: msg.id, error: { code, message: errorMessage(err) } }));
        } finally {
          const opId = msg.params?.opId;
          if (typeof opId === 'string') ops.delete(opId);
        }
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;
  allowed.add(`http://127.0.0.1:${port}`);
  allowed.add(`http://localhost:${port}`);
  return {
    port,
    close: async () => {
      engine.off('event', broadcast);
      for (const ws of clients) ws.close();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
