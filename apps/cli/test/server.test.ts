import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer } from '../src/server.js';
import { makeEngine, makeWorkspace } from '../../../packages/core/test/helpers.js';

const TOKEN = 'test-token-123';

describe('local server', () => {
  const dir = makeWorkspace({ 'notes.txt': 'hello\n' });
  const t = makeEngine([
    { calls: [{ name: 'run_command', arguments: { command: 'echo from-agent > out.txt' } }] },
    { text: 'Wrote out.txt.' },
  ]);
  let port = 0;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const srv = await startServer(t.engine, { host: '127.0.0.1', port: 0, token: TOKEN });
    port = srv.port;
    close = srv.close;
  });
  afterAll(async () => {
    await close();
    await t.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const connect = (token = TOKEN, origin?: string) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`, origin ? { origin } : {});
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });

  function rpc(ws: WebSocket) {
    let id = 0;
    const events: Record<string, unknown>[] = [];
    const pending = new Map<number, (m: { result?: unknown; error?: { message: string } }) => void>();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event) events.push(msg.event);
      else pending.get(msg.id)?.(msg);
    });
    const call = <T>(method: string, params: Record<string, unknown> = {}) =>
      new Promise<T>((resolve, reject) => {
        const n = ++id;
        pending.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result as T)));
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    return { call, events };
  }

  it('serves a health endpoint', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    expect(await r.json()).toMatchObject({ ok: true });
  });

  it('rejects connections without the right token', async () => {
    await expect(connect('wrong')).rejects.toThrow(/401/);
  });

  it('rejects browser connections from foreign origins (cross-site WebSocket hijacking)', async () => {
    await expect(connect(TOKEN, 'https://evil.example')).rejects.toThrow(/401/);
    const ok = await connect(TOKEN, `http://127.0.0.1:${port}`);
    ok.close();
  });

  it('runs a task end to end over RPC, with approvals and streamed events', async () => {
    const ws = await connect();
    const { call, events } = rpc(ws);
    const opened = await call<{ workspace: { id: string }; project: { fileCount: number } }>('workspaces.open', { path: dir });
    expect(opened.project.fileCount).toBe(1);
    const conv = await call<{ id: string }>('conversations.create', { workspaceId: opened.workspace.id });
    await call('workspace.setPermissionMode', { workspaceId: opened.workspace.id, mode: 'strict' });
    const task = await call<{ id: string }>('tasks.start', { conversationId: conv.id, prompt: 'write a file' });

    // Strict mode: the command needs approval, which arrives as an event.
    for (let i = 0; i < 100 && !events.some((e) => e.type === 'approval.request'); i++) await new Promise((r) => setTimeout(r, 50));
    const req = events.find((e) => e.type === 'approval.request')!.request as { id: string; risk: string };
    expect(req.risk).toBe('write');
    expect((await call<{ requestId: string }[]>('approvals.pending')).length).toBe(1);
    await call('approvals.respond', { requestId: req.id, answer: 'allow_once' });

    for (let i = 0; i < 200 && !events.some((e) => e.type === 'task.finished'); i++) await new Promise((r) => setTimeout(r, 50));
    const finished = events.find((e) => e.type === 'task.finished') as { report: { status: string; commands: { exitCode: number }[] } };
    expect(finished.report.status).toBe('completed');
    expect(finished.report.commands[0].exitCode).toBe(0);
    expect(readFileSync(path.join(dir, 'out.txt'), 'utf8')).toBe('from-agent\n');
    expect(events.some((e) => e.type === 'tool.end')).toBe(true);

    const convData = await call<{ messages: unknown[]; tasks: { status: string }[] }>('conversations.get', { conversationId: conv.id });
    expect(convData.tasks[0].status).toBe('completed');
    const diff = await call<{ path: string; before: string | null; after: string }[]>('tasks.diff', { taskId: task.id });
    expect(diff).toEqual([expect.objectContaining({ path: 'out.txt', before: null, after: 'from-agent\n' })]);
    const activity = await call<{ type: string }[]>('activity.list', { conversationId: conv.id });
    expect(activity.map((a) => a.type)).toEqual(expect.arrayContaining(['task.started', 'tool.start', 'tool.end', 'approval.request', 'task.finished']));

    const undo = await call<{ removed: string[] }>('tasks.undo', { taskId: task.id });
    expect(undo.removed).toEqual(['out.txt']);
    ws.close();
  });

  it('reports errors for unknown methods and bad parameters', async () => {
    const ws = await connect();
    const { call } = rpc(ws);
    await expect(call('nope')).rejects.toThrow(/Unknown method/);
    await expect(call('tasks.get', {})).rejects.toThrow(/Missing parameter "taskId"/);
    const outside = await call<{ workspace: { id: string } }>('workspaces.open', { path: dir });
    await expect(call('workspace.readFile', { workspaceId: outside.workspace.id, path: '../../etc/passwd' })).rejects.toThrow(/outside the workspace/);
    ws.close();
  });
});
