import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ShadowGit } from '../src/checkpoints/shadow-git.js';
import { ProcessManager } from '../src/exec/processes.js';
import { PersistentShell } from '../src/exec/shell.js';

const tmp = (p: string) => mkdtempSync(path.join(os.tmpdir(), p));
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('PersistentShell', () => {
  const root = tmp('lc-shell-');
  dirs.push(root);
  const shell = new PersistentShell({ cwd: root, env: { ...process.env }, root });
  afterAll(() => shell.dispose());

  it('returns real exit codes and output', async () => {
    const ok = await shell.run('echo hello');
    expect(ok.exitCode).toBe(0);
    expect(ok.output).toBe('hello\n');
    const bad = await shell.run('echo oops >&2; exit_code_test() { return 4; }; exit_code_test');
    expect(bad.exitCode).toBe(4);
    expect(bad.stderr).toContain('oops');
  });

  it('keeps state between commands (cwd and variables)', async () => {
    await shell.run('mkdir -p sub && cd sub && export LC_TEST_VAR=42');
    const r = await shell.run('pwd; echo $LC_TEST_VAR');
    expect(r.output.trim().split('\n')).toEqual([path.join(shell.cwd), '42']);
    expect(shell.cwd.endsWith('sub')).toBe(true);
    await shell.run(`cd ${JSON.stringify(root)}`);
  });

  it('streams output while running', async () => {
    const chunks: string[] = [];
    const r = await shell.run('for i in 1 2 3; do echo line$i; sleep 0.05; done', { onOutput: (_s, c) => chunks.push(c) });
    expect(r.exitCode).toBe(0);
    expect(chunks.join('')).toBe('line1\nline2\nline3\n');
  });

  it('does not hang on commands waiting for stdin', async () => {
    const r = await shell.run('read x; echo "got:$x"', { timeoutMs: 5000 });
    expect(r.timedOut).toBe(false);
    expect(r.output).toContain('got:');
  });

  it('rejects syntax errors without hanging', async () => {
    const r = await shell.run('echo "unterminated');
    expect(r.exitCode).toBe(2);
    expect(r.output).toMatch(/syntax error|unexpected EOF/i);
  });

  it('kills timed-out commands (including children) and recovers', async () => {
    const r = await shell.run('sleep 20 & sleep 20', { timeoutMs: 800 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
    const after = await shell.run('echo alive');
    expect(after.output).toBe('alive\n');
  });

  it('supports cancellation through an AbortSignal', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 300);
    const r = await shell.run('sleep 10', { signal: ac.signal });
    expect(r.cancelled).toBe(true);
  });

  it('survives the command calling exit', async () => {
    const r = await shell.run('exit 3');
    expect(r.exitCode).toBe(3);
    expect((await shell.run('echo back')).output).toBe('back\n');
  });

  it('handles output without a trailing newline and heredocs', async () => {
    expect((await shell.run('printf abc')).output).toBe('abc');
    const r = await shell.run("cat <<'EOF'\nline one\nline two\nEOF");
    expect(r.output).toBe('line one\nline two\n');
  });
});

describe('ProcessManager', () => {
  it('runs background processes, captures output and stops them', async () => {
    const pm = new ProcessManager({ env: process.env });
    const info = pm.start('echo started; sleep 30', os.tmpdir());
    await new Promise((r) => setTimeout(r, 300));
    expect(pm.output(info.id)!.output).toContain('started');
    expect(pm.list()[0].status).toBe('running');
    pm.stop(info.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(pm.list()[0].status).toBe('killed');
    pm.disposeAll();
  });
});

describe('ShadowGit checkpoints', () => {
  const work = tmp('lc-work-');
  const data = tmp('lc-cpdata-');
  dirs.push(work, data);
  const cp = new ShadowGit(work, data);

  it('snapshots, lists changes and restores, including deletions and new files', async () => {
    writeFileSync(path.join(work, 'a.txt'), 'one\n');
    writeFileSync(path.join(work, 'b.txt'), 'bee\n');
    writeFileSync(path.join(work, '.gitignore'), 'ignored.log\n');
    writeFileSync(path.join(work, 'ignored.log'), 'noise');
    const c1 = await cp.snapshot('first');
    expect(await cp.snapshot('same again')).toBe(c1);

    writeFileSync(path.join(work, 'a.txt'), 'one\ntwo\n');
    rmSync(path.join(work, 'b.txt'));
    writeFileSync(path.join(work, 'c.txt'), 'new\n');
    const changes = await cp.changes(c1);
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c]));
    expect(byPath['a.txt']).toMatchObject({ status: 'modified', additions: 1, deletions: 0 });
    expect(byPath['b.txt'].status).toBe('deleted');
    expect(byPath['c.txt'].status).toBe('added');
    expect(byPath['ignored.log']).toBeUndefined();
    expect(await cp.fileAt(c1, 'a.txt')).toBe('one\n');

    const r = await cp.restore(c1);
    expect(r.restored.sort()).toEqual(['a.txt', 'b.txt']);
    expect(r.removed).toEqual(['c.txt']);
    expect(readFileSync(path.join(work, 'a.txt'), 'utf8')).toBe('one\n');
    expect(existsSync(path.join(work, 'b.txt'))).toBe(true);
    expect(existsSync(path.join(work, 'c.txt'))).toBe(false);
    expect(existsSync(path.join(work, 'ignored.log'))).toBe(true);

    // The restore itself is undoable via its safety checkpoint.
    await cp.restore(r.safetyCheckpoint);
    expect(readFileSync(path.join(work, 'a.txt'), 'utf8')).toBe('one\ntwo\n');
    expect(existsSync(path.join(work, 'c.txt'))).toBe(true);
  });

  it('restores selected paths only', async () => {
    const base = await cp.snapshot('base');
    writeFileSync(path.join(work, 'a.txt'), 'A changed\n');
    writeFileSync(path.join(work, 'c.txt'), 'C changed\n');
    await cp.restore(base, ['a.txt']);
    expect(readFileSync(path.join(work, 'c.txt'), 'utf8')).toBe('C changed\n');
    expect(readFileSync(path.join(work, 'a.txt'), 'utf8')).toBe('one\ntwo\n');
  });

  it('does not touch the user repository', async () => {
    expect(existsSync(path.join(work, '.git'))).toBe(false);
  });
});
