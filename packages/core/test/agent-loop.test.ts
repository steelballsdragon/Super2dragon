import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EngineEvent } from '../src/engine/engine.js';
import { makeEngine, makeWorkspace } from './helpers.js';

const unix = process.platform !== 'win32';
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function setup(script: Parameters<typeof makeEngine>[0], files: Record<string, string>, opts?: Parameters<typeof makeEngine>[1]) {
  const dir = makeWorkspace(files);
  const t = makeEngine(script, opts);
  cleanups.push(t.cleanup, () => rmSync(dir, { recursive: true, force: true }));
  const ws = t.engine.openWorkspace(dir);
  const conv = t.engine.createConversation(ws.id);
  const events: EngineEvent[] = [];
  t.engine.on('event', (e: EngineEvent) => events.push(e));
  return { engine: t.engine, provider: t.provider, dir, ws, conv, events };
}

describe('agent loop', () => {
  it.skipIf(!unix)('reads, edits, runs a real command and reports actual results', async () => {
    const { engine, dir, ws, conv, provider, events } = setup(
      [
        { calls: [{ name: 'read_file', arguments: { path: 'math.js' } }] },
        { calls: [{ name: 'edit_file', arguments: { path: 'math.js', old_string: 'return a - b;', new_string: 'return a + b;' } }] },
        { calls: [{ name: 'run_command', arguments: { command: 'node -e "const m=require(\'./math.js\'); if (m.add(2,3)!==5) process.exit(3); console.log(\'sum ok\')"' } }] },
        { text: 'Fixed add() and verified: the check printed "sum ok".' },
      ],
      { 'math.js': 'exports.add = (a, b) => {\n  return a - b;\n};\n' },
    );
    engine.setPermissionMode(ws.id, 'autonomous');
    const task = await engine.runTask({ conversationId: conv.id, prompt: 'Fix add()' });
    expect(task.status).toBe('completed');
    expect(readFileSync(path.join(dir, 'math.js'), 'utf8')).toContain('return a + b;');
    const report = task.report!;
    expect(report.commands).toHaveLength(1);
    expect(report.commands[0].exitCode).toBe(0);
    expect(report.filesChanged.map((f) => f.path)).toEqual(['math.js']);
    expect(report.summary).toContain('verified');
    // The real command output was fed back to the model.
    const toolMsgs = provider.requests[3].messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.at(-1)!.content).toContain('sum ok');
    expect(toolMsgs.at(-1)!.content).toContain('exit code 0');
    expect(events.some((e) => e.type === 'tool.output')).toBe(true);
    // Persisted conversation contains the whole exchange.
    const roles = engine.store.listMessages(conv.id).map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant', 'tool', 'assistant']);
  });

  it('reports failing commands as failures, never as success', async () => {
    const { engine, ws, conv, provider } = setup(
      [{ calls: [{ name: 'run_command', arguments: { command: 'node -e "process.exit(7)"' } }] }, { text: 'It failed with exit code 7.' }],
      { 'a.txt': 'x' },
    );
    engine.setPermissionMode(ws.id, 'autonomous');
    const task = await engine.runTask({ conversationId: conv.id, prompt: 'run it' });
    expect(task.report!.commands[0].exitCode).toBe(7);
    expect(task.report!.warnings.join(' ')).toMatch(/still failing/);
    const last = provider.requests[1].messages.at(-1)!;
    expect(last.content).toMatch(/^ERROR: /);
    expect(last.content).toContain('exit code 7 (FAILED)');
  });

  it('enforces read-before-edit and feeds validation errors back to the model', async () => {
    const { engine, dir, conv, provider } = setup(
      [
        { calls: [{ name: 'edit_file', arguments: { path: 'a.txt', old_string: 'x', new_string: 'y' } }] },
        { calls: [{ name: 'read_file', arguments: { file_path: 'a.txt' } }] },
        { calls: [{ name: 'edit_file', arguments: { path: 'a.txt', old_string: 'x', new_string: 'y' } }] },
        { text: 'done' },
      ],
      { 'a.txt': 'x\n' },
    );
    await engine.runTask({ conversationId: conv.id, prompt: 'change x to y' });
    expect(provider.requests[1].messages.at(-1)!.content).toMatch(/Read a\.txt with read_file before editing/);
    // Alias file_path -> path was accepted.
    expect(provider.requests[2].messages.at(-1)!.content).toContain('a.txt (lines 1-1 of 1)');
    expect(readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('y\n');
  });

  it('asks for approval on risky commands and respects a denial', async () => {
    const { engine, dir, conv, provider, events } = setup(
      [{ calls: [{ name: 'run_command', arguments: { command: 'rm -rf data' } }] }, { text: 'The user did not allow deletion.' }],
      { 'data/file.txt': 'keep me' },
    );
    engine.approvalHandler = async (req) => {
      expect(req.risk).toBe('destructive');
      return { answer: 'deny', message: 'keep the data folder' };
    };
    const task = await engine.runTask({ conversationId: conv.id, prompt: 'clean up' });
    expect(task.status).toBe('completed');
    expect(existsSync(path.join(dir, 'data/file.txt'))).toBe(true);
    expect(provider.requests[1].messages.at(-1)!.content).toContain('keep the data folder');
    expect(events.some((e) => e.type === 'approval.request')).toBe(true);
  });

  it('strict mode requires approval for every write', async () => {
    const { engine, ws, dir, conv } = setup(
      [{ calls: [{ name: 'write_file', arguments: { path: 'new.txt', content: 'hello' } }] }, { text: 'ok' }],
      { 'a.txt': '' },
    );
    engine.setPermissionMode(ws.id, 'strict');
    const asked: string[] = [];
    engine.approvalHandler = async (req) => {
      asked.push(req.tool);
      return { answer: 'allow_once' };
    };
    await engine.runTask({ conversationId: conv.id, prompt: 'write' });
    expect(asked).toEqual(['write_file']);
    expect(readFileSync(path.join(dir, 'new.txt'), 'utf8')).toBe('hello');
  });

  it('"always allow" stores a rule so the next identical request is not asked', async () => {
    const { engine, ws, conv } = setup(
      [
        { calls: [{ name: 'run_command', arguments: { command: 'node -e "1"' } }] },
        { calls: [{ name: 'run_command', arguments: { command: 'node -e "2"' } }] },
        { text: 'ok' },
      ],
      { 'a.txt': '' },
    );
    let asks = 0;
    engine.approvalHandler = async () => {
      asks++;
      return { answer: 'allow_always' };
    };
    await engine.runTask({ conversationId: conv.id, prompt: 'go' });
    expect(asks).toBe(1);
    expect(engine.store.listRules(ws.id).map((r) => r.pattern)).toEqual(['node']);
  });

  it('stops repeated failing calls instead of looping forever', async () => {
    const bad = { calls: [{ name: 'read_file', arguments: { path: 'missing.txt' } }] };
    const { engine, conv } = setup([bad, bad, bad, bad, bad, bad, bad, bad], { 'a.txt': '' });
    const task = await engine.runTask({ conversationId: conv.id, prompt: 'read it' });
    expect(task.status).toBe('blocked');
    expect(task.error).toMatch(/failed 4 times/);
    expect(task.steps).toBe(4);
  });

  it('can be cancelled while a command is running', async () => {
    const { engine, conv } = setup([{ calls: [{ name: 'run_command', arguments: { command: 'sleep 30' } }] }], { 'a.txt': '' });
    const task = await engine.startTask({ conversationId: conv.id, prompt: 'wait' });
    await new Promise((r) => setTimeout(r, 1200));
    engine.cancelTask(task.id);
    const done = await engine.waitForTask(task.id);
    expect(done.status).toBe('cancelled');
    expect(done.report!.commands[0].exitCode).toBeNull();
  }, 20_000);

  it.skipIf(!unix)('undo restores files changed by tools and by commands', async () => {
    const { engine, dir, conv } = setup(
      [
        { calls: [{ name: 'write_file', arguments: { path: 'created.txt', content: 'new' } }] },
        { calls: [{ name: 'run_command', arguments: { command: 'echo changed > existing.txt' } }] },
        { text: 'done' },
      ],
      { 'existing.txt': 'original\n' },
    );
    const task = await engine.runTask({ conversationId: conv.id, prompt: 'change things' });
    expect(readFileSync(path.join(dir, 'existing.txt'), 'utf8')).toBe('changed\n');
    const r = await engine.undoTask(task.id);
    expect(r.restored).toContain('existing.txt');
    expect(r.removed).toContain('created.txt');
    expect(readFileSync(path.join(dir, 'existing.txt'), 'utf8')).toBe('original\n');
    expect(existsSync(path.join(dir, 'created.txt'))).toBe(false);
  });

  it('recovers tool calls a model writes as text and uses prompted mode for models without tool support', async () => {
    const { engine, dir, conv, provider } = setup(
      [{ text: 'Creating it.', calls: [{ name: 'write_file', arguments: { path: 'hello.txt', content: 'hi' } }] }, { text: 'Created hello.txt.' }],
      { 'a.txt': '' },
      { capabilities: ['completion'], textMode: true },
    );
    const task = await engine.runTask({ conversationId: conv.id, prompt: 'make hello.txt' });
    expect(task.status).toBe('completed');
    expect(readFileSync(path.join(dir, 'hello.txt'), 'utf8')).toBe('hi');
    // Prompted mode: tools described in the system prompt, not sent through the API.
    expect(provider.requests[0].tools).toBeUndefined();
    expect(provider.requests[0].messages[0].content).toContain('<tool_call>');
    // Tool result came back as a user turn.
    expect(provider.requests[1].messages.at(-1)!.content).toContain('<tool_result name="write_file">');
  });

  it('nudges once when the model stops with unfinished plan steps', async () => {
    const { engine, conv, provider } = setup(
      [
        { calls: [{ name: 'update_plan', arguments: { items: [{ title: 'step one', status: 'in_progress' }, { title: 'step two' }] } }] },
        { text: 'I am done.' },
        { calls: [{ name: 'update_plan', arguments: { items: [{ title: 'step one', status: 'done' }, { title: 'step two', status: 'done' }] } }] },
        { text: 'All steps complete.' },
      ],
      { 'a.txt': '' },
    );
    const task = await engine.runTask({ conversationId: conv.id, prompt: 'two steps' });
    expect(task.status).toBe('completed');
    expect(provider.requests[2].messages.at(-1)!.content).toContain('unfinished steps');
    expect(task.plan.every((p) => p.status === 'done')).toBe(true);
  });

  it('resumes an interrupted task with its history and plan', async () => {
    const { engine, conv, provider } = setup([{ text: 'first run' }, { text: 'resumed and finished' }], { 'a.txt': '' });
    const t1 = await engine.runTask({ conversationId: conv.id, prompt: 'do work' });
    engine.store.updateTask(t1.id, { status: 'interrupted' });
    const resumed = await engine.resumeTask(t1.id);
    const done = await engine.waitForTask(resumed.id);
    expect(done.status).toBe('completed');
    const lastReq = provider.requests.at(-1)!;
    expect(lastReq.messages.some((m) => m.content === 'do work')).toBe(true);
    expect(lastReq.messages.at(-1)!.content).toMatch(/Resumed after the application was restarted/);
  });

  it('redacts secrets in tool output before it reaches the model', async () => {
    const { engine, ws, conv, provider } = setup(
      [{ calls: [{ name: 'read_file', arguments: { path: 'config.js' } }] }, { text: 'ok' }],
      { 'config.js': 'const key = "AKIAABCDEFGHIJKLMNOP";\nmodule.exports = { password: "correcthorsebattery" };\n' },
    );
    void ws;
    await engine.runTask({ conversationId: conv.id, prompt: 'read config' });
    const content = provider.requests[1].messages.at(-1)!.content;
    expect(content).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(content).not.toContain('correcthorsebattery');
  });

  it('refuses to write redaction placeholders back into files', async () => {
    const { engine, dir, conv } = setup(
      [
        { calls: [{ name: 'read_file', arguments: { path: 'cfg.js' } }] },
        { calls: [{ name: 'write_file', arguments: { path: 'cfg.js', content: 'password: "[REDACTED]"' } }] },
        { text: 'ok' },
      ],
      { 'cfg.js': 'password: "correcthorsebattery"' },
    );
    await engine.runTask({ conversationId: conv.id, prompt: 'rewrite' });
    expect(readFileSync(path.join(dir, 'cfg.js'), 'utf8')).toContain('correcthorsebattery');
  });

  it('marks tasks left running by a crashed process as interrupted', async () => {
    const { engine, conv } = setup([{ text: 'x' }], { 'a.txt': '' });
    const t = engine.store.createTask({ conversationId: conv.id, workspaceId: conv.workspaceId, prompt: 'p' });
    expect(engine.store.markOrphanedTasksInterrupted()).toBe(1);
    expect(engine.store.getTask(t.id)!.status).toBe('interrupted');
  });

  it('detects files changed outside the agent before editing', async () => {
    let dirRef = '';
    const { engine, conv, provider, dir } = setup(
      [
        { calls: [{ name: 'read_file', arguments: { path: 'a.txt' } }] },
        () => {
          writeFileSync(path.join(dirRef, 'a.txt'), 'changed externally\n');
          return { calls: [{ name: 'edit_file', arguments: { path: 'a.txt', old_string: 'one', new_string: 'two' } }] };
        },
        { text: 'stop' },
      ],
      { 'a.txt': 'one\n' },
    );
    dirRef = dir;
    await new Promise((r) => setTimeout(r, 20));
    await engine.runTask({ conversationId: conv.id, prompt: 'edit' });
    expect(provider.requests[2].messages.at(-1)!.content).toMatch(/changed since you last read it/);
  });
});

describe('task launch failures', () => {
  it('reports a missing model as a failed task with a finished event', async () => {
    const dir = makeWorkspace({ 'a.txt': '' });
    const t = makeEngine([{ text: 'never used' }]);
    cleanups.push(t.cleanup, () => rmSync(dir, { recursive: true, force: true }));
    const ws = t.engine.openWorkspace(dir);
    const conv = t.engine.createConversation(ws.id);
    const events: EngineEvent[] = [];
    t.engine.on('event', (e: EngineEvent) => events.push(e));
    t.provider.showModel = async () => {
      throw Object.assign(new (await import('../src/util/errors.js')).LocalCodeError('model_not_found', 'Model not found: nope'), {});
    };
    const task = await t.engine.runTask({ conversationId: conv.id, prompt: 'x', model: { providerId: 'test', model: 'nope' } });
    expect(task.status).toBe('failed');
    expect(task.error).toMatch(/Model not found/);
    expect(events.some((e) => e.type === 'task.finished')).toBe(true);
  });
});
