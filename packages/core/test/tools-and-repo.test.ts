import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PersistentShell } from '../src/exec/shell.js';
import { ProcessManager } from '../src/exec/processes.js';
import { parseDiagnostics, parseTestOutput } from '../src/parsers/output.js';
import { detectProject } from '../src/repo/detect.js';
import { listWorkspaceFiles } from '../src/repo/files.js';
import { RepoIndex } from '../src/repo/index.js';
import { CodeSearch } from '../src/repo/search.js';
import { extractSymbols } from '../src/repo/symbols.js';
import { WorkspaceGuard } from '../src/security/paths.js';
import { SecretRedactor } from '../src/security/secrets.js';
import { Store } from '../src/storage/store.js';
import { DEFAULT_SETTINGS } from '../src/engine/settings.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { FileStateTracker, type ToolContext } from '../src/tools/types.js';
import { makeWorkspace } from './helpers.js';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function toolEnv(files: Record<string, string>) {
  const root = makeWorkspace(files);
  dirs.push(root);
  const store = new Store(':memory:');
  const index = new RepoIndex(root, { ...DEFAULT_SETTINGS.index, watch: false });
  const shell = new PersistentShell({ cwd: root, env: process.env, root });
  let plan: never[] = [];
  const ctx: ToolContext = {
    workspaceId: 'w',
    taskId: 't',
    guard: new WorkspaceGuard(root),
    shell,
    processes: new ProcessManager({ env: process.env }),
    index,
    checkpoints: null,
    fileState: new FileStateTracker(),
    redactor: new SecretRedactor({}),
    settings: DEFAULT_SETTINGS,
    signal: new AbortController().signal,
    search: new CodeSearch(root, index, () => [], store, 'w'),
    emitOutput: () => {},
    recordCommand: () => {},
    recordTest: () => {},
    setLastFailure: () => {},
    getPlan: () => plan,
    setPlan: (p) => (plan = p as never[]),
    resolveCheckpoint: () => undefined,
    onFilesChanged: () => index.markDirty(),
  };
  const registry = new ToolRegistry();
  const call = async (name: string, args: Record<string, unknown>) => {
    const v = registry.validate(name, args);
    if (!v.ok) return { ok: false, output: v.error };
    try {
      return await registry.get(name)!.execute(v.args as never, ctx);
    } catch (err) {
      // The agent runner turns thrown tool errors into failed results the same way.
      return { ok: false, output: (err as Error).message };
    }
  };
  return { root, ctx, call, registry, cleanup: () => shell.dispose() };
}

describe('file tools', () => {
  it('read_file numbers lines, paginates and reports missing files with suggestions', async () => {
    const t = toolEnv({ 'src/app.js': Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n') });
    const r = await t.call('read_file', { path: 'src/app.js', offset: 3, limit: 2 });
    expect(r.output).toContain('src/app.js (lines 3-4 of 10) - more available, use offset=5');
    expect(r.output).toContain('    3\tline 3');
    const missing = await t.call('read_file', { path: 'app.js' });
    expect(missing.ok).toBe(false);
    expect(missing.output).toContain('Did you mean: src/app.js');
    t.cleanup();
  });

  it('edit_file handles exact, line-number-prefixed and whitespace-different snippets', async () => {
    const t = toolEnv({ 'a.py': 'def f():\n    x = 1\n    return x\n' });
    await t.call('read_file', { path: 'a.py' });
    // Copied with read_file line numbers.
    let r = await t.call('edit_file', { path: 'a.py', old_string: '    2\t    x = 1', new_string: '    2\t    x = 2' });
    expect(r.ok).toBe(true);
    expect(readFileSync(path.join(t.root, 'a.py'), 'utf8')).toContain('    x = 2');
    // Wrong indentation in old_string: matched ignoring whitespace, indentation preserved.
    r = await t.call('edit_file', { path: 'a.py', old_string: 'x = 2\nreturn x', new_string: 'x = 3\nreturn x * 2' });
    expect(r.ok).toBe(true);
    expect(readFileSync(path.join(t.root, 'a.py'), 'utf8')).toBe('def f():\n    x = 3\n    return x * 2\n');
    t.cleanup();
  });

  it('edit_file refuses ambiguous matches and shows the closest text when not found', async () => {
    const t = toolEnv({ 'b.js': 'a();\na();\nfunction compute(total) { return total; }\n' });
    await t.call('read_file', { path: 'b.js' });
    const amb = await t.call('edit_file', { path: 'b.js', old_string: 'a();', new_string: 'b();' });
    expect(amb.ok).toBe(false);
    expect(amb.output).toMatch(/matches 2 places \(lines 1, 2\)/);
    const all = await t.call('edit_file', { path: 'b.js', old_string: 'a();', new_string: 'b();', replace_all: 'true' });
    expect(all.ok).toBe(true);
    const nf = await t.call('edit_file', { path: 'b.js', old_string: 'function compute(sum) {', new_string: 'x' });
    expect(nf.output).toMatch(/Closest match is around line 3/);
    t.cleanup();
  });

  it('edit_file preserves CRLF line endings', async () => {
    const t = toolEnv({ 'w.txt': 'one\r\ntwo\r\n' });
    await t.call('read_file', { path: 'w.txt' });
    await t.call('edit_file', { path: 'w.txt', old_string: 'two', new_string: 'TWO' });
    expect(readFileSync(path.join(t.root, 'w.txt'), 'utf8')).toBe('one\r\nTWO\r\n');
    t.cleanup();
  });

  it('write_file creates folders, guards overwrites and move/delete work within the workspace', async () => {
    const t = toolEnv({ 'keep.txt': 'k' });
    expect((await t.call('write_file', { path: 'deep/new/file.txt', content: 'hi' })).ok).toBe(true);
    expect((await t.call('write_file', { path: 'keep.txt', content: 'x' })).output).toMatch(/already exists/);
    expect((await t.call('write_file', { path: '../escape.txt', content: 'x' })).ok).toBe(false);
    expect((await t.call('move_file', { from: 'deep/new/file.txt', to: 'moved.txt' })).ok).toBe(true);
    expect(readFileSync(path.join(t.root, 'moved.txt'), 'utf8')).toBe('hi');
    expect((await t.call('delete_file', { path: 'deep' })).output).toMatch(/recursive=true/);
    expect((await t.call('delete_file', { path: '.' })).ok).toBe(false);
    expect((await t.call('delete_file', { path: 'deep', recursive: true })).ok).toBe(true);
    t.cleanup();
  });

  it('list_files and search_code respect .gitignore', async () => {
    const t = toolEnv({ '.gitignore': 'dist/\n', 'src/main.ts': 'export function startServer() {}\n// TODO: port', 'dist/bundle.js': 'startServer()', 'node_modules/x/index.js': 'startServer' });
    const tree = await t.call('list_files', {});
    expect(tree.output).toContain('main.ts');
    expect(tree.output).not.toContain('bundle.js');
    expect(tree.output).not.toContain('node_modules');
    const s = await t.call('search_code', { query: 'startServer' });
    expect(s.output).toContain('src/main.ts:1:');
    expect(s.output).not.toContain('dist/');
    const sym = await t.call('search_code', { query: 'startserver', mode: 'symbol' });
    expect(sym.output).toContain('src/main.ts:1  function startServer');
    const files = await t.call('search_code', { query: 'main', mode: 'files' });
    expect(files.output).toContain('src/main.ts');
    const re = await t.call('search_code', { query: 'TODO:\\s+\\w+', mode: 'regex' });
    expect(re.output).toContain('TODO: port');
    const bad = await t.call('search_code', { query: '(unclosed', mode: 'regex' });
    expect(bad.ok).toBe(false);
    t.cleanup();
  });

  it('run_tests detects the project test command and parses results', async () => {
    const t = toolEnv({
      'package.json': JSON.stringify({ name: 'x', type: 'module', scripts: { test: 'node --test' } }),
      'a.test.js': "import {test} from 'node:test'; import assert from 'node:assert'; test('ok', () => assert.ok(true)); test('bad', () => assert.equal(1, 2));",
    });
    const r = await t.call('run_tests', {});
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/TESTS FAILED \(node:test: 1 passed, 1 failed\)/);
    t.cleanup();
  });

  it('inspect_errors parses diagnostics from a failing command', async () => {
    const t = toolEnv({ 'bad.js': 'const x = ;\n' });
    const r = await t.call('inspect_errors', { command: 'node bad.js' });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/exit code 1/);
    t.cleanup();
  });

  it('validation errors explain what is wrong', () => {
    const reg = new ToolRegistry();
    const v = reg.validate('read_file', { path: { type: 'string', description: 'x' } });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.error).toMatch(/schema instead of values/);
    const u = reg.validate('nope', {});
    expect(!u.ok && u.error).toMatch(/Unknown tool "nope"/);
    const ok = reg.validate('read_file', { filename: 'a', limit: '20' });
    expect(ok.ok && ok.args).toEqual({ path: 'a', limit: 20 });
  });

  it('exposes all required tools with JSON schemas', () => {
    const names = new ToolRegistry().names;
    for (const n of ['list_files', 'read_file', 'search_code', 'write_file', 'edit_file', 'move_file', 'delete_file', 'run_command', 'run_tests', 'git_status', 'git_diff', 'git_commit', 'inspect_errors', 'undo_changes']) {
      expect(names).toContain(n);
    }
    const spec = new ToolRegistry().toolSpecs().find((s) => s.name === 'edit_file')!;
    expect(spec.parameters).toMatchObject({ type: 'object', required: ['path', 'old_string', 'new_string'] });
  });
});

describe('output parsers', () => {
  it('parses test runner summaries', () => {
    expect(parseTestOutput(' Test Files  1 failed (1)\n      Tests  2 failed | 5 passed (7)\n')).toMatchObject({ failed: 2, passed: 5 });
    expect(parseTestOutput('Tests:       1 failed, 4 passed, 5 total')).toMatchObject({ framework: 'js', failed: 1, passed: 4 });
    expect(parseTestOutput('FAILED tests/test_a.py::test_x - assert 1\n==== 1 failed, 3 passed in 0.12s ====')).toMatchObject({ framework: 'pytest', failed: 1, passed: 3, failures: ['tests/test_a.py::test_x'] });
    expect(parseTestOutput('test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured')).toMatchObject({ framework: 'cargo', passed: 3, failed: 1 });
    expect(parseTestOutput('# tests 4\n# pass 3\n# fail 1\n')).toMatchObject({ framework: 'node:test', passed: 3, failed: 1 });
    expect(parseTestOutput('--- FAIL: TestAdd (0.00s)\nFAIL\nFAIL\texample.com/m\t0.002s')).toMatchObject({ framework: 'go', failed: 1, failures: ['TestAdd'] });
  });
  it('parses compiler and runtime diagnostics', () => {
    const tsc = parseDiagnostics("src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.");
    expect(tsc[0]).toMatchObject({ file: 'src/a.ts', line: 3, column: 5, code: 'TS2322', source: 'tsc' });
    const rust = parseDiagnostics('error[E0425]: cannot find value `x` in this scope\n  --> src/main.rs:2:13\n');
    expect(rust[0]).toMatchObject({ file: 'src/main.rs', line: 2, code: 'E0425' });
    const py = parseDiagnostics('Traceback (most recent call last):\n  File "app.py", line 7, in <module>\n    main()\nNameError: name \'main\' is not defined');
    expect(py[0]).toMatchObject({ file: 'app.py', line: 7, message: "NameError: name 'main' is not defined" });
    const gcc = parseDiagnostics('main.c:4:10: error: expected expression');
    expect(gcc[0]).toMatchObject({ file: 'main.c', line: 4, column: 10, severity: 'error' });
  });
});

describe('repository intelligence', () => {
  it('detects languages, frameworks, entry points and commands', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ main: 'src/index.ts', scripts: { test: 'vitest run', build: 'tsc', dev: 'vite' }, dependencies: { react: '1', express: '1' }, devDependencies: { typescript: '1', vitest: '1' } }),
      'tsconfig.json': '{}',
      'pnpm-lock.yaml': '',
      'src/index.ts': '',
      'src/App.tsx': '',
      'AGENTS.md': '# notes',
    });
    dirs.push(root);
    const { files } = await listWorkspaceFiles(root);
    const p = detectProject(root, files);
    expect(p.languages[0].name).toBe('TypeScript');
    expect(p.frameworks).toEqual(expect.arrayContaining(['React', 'Express', 'Vitest', 'TypeScript']));
    expect(p.packageManagers).toEqual(['pnpm']);
    expect(p.testCommand).toBe('pnpm test');
    expect(p.buildCommand).toBe('pnpm run build');
    expect(p.checkCommands).toContain('npx tsc --noEmit');
    expect(p.entryPoints).toContain('src/index.ts');
    expect(p.instructionsFile).toBe('AGENTS.md');
  });

  it('extracts symbols with tree-sitter for several languages', async () => {
    const ts = await extractSymbols('export class A { m() {} }\nexport const f = () => 1;\ninterface I {}', 'x.ts');
    expect(ts.engine).toBe('tree-sitter');
    expect(ts.symbols.map((s) => `${s.kind}:${s.container ? `${s.container}.` : ''}${s.name}`)).toEqual(['class:A', 'method:A.m', 'function:f', 'interface:I']);
    const py = await extractSymbols('class C:\n    def go(self):\n        pass\n\ndef top():\n    pass\n', 'x.py');
    expect(py.symbols.map((s) => `${s.kind}:${s.name}`)).toEqual(['class:C', 'method:go', 'function:top']);
    const rs = await extractSymbols('struct S;\nimpl S { fn new() -> S { S } }\nfn main() {}\n', 'main.rs');
    expect(rs.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(['S', 'new', 'main']));
    const go = await extractSymbols('package main\nfunc Hello() {}\ntype T struct{}\n', 'a.go');
    expect(go.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(['Hello', 'T']));
    const kt = await extractSymbols('class Foo {\n  fun bar() {}\n}\n', 'a.kt');
    expect(kt.engine).toBe('regex');
    expect(kt.symbols.map((s) => s.name)).toEqual(['Foo', 'bar']);
  });

  it('ranks relevant files by name match', async () => {
    const root = makeWorkspace({ 'src/cart.js': '', 'src/format.js': '', 'test/cart.test.js': '', 'README.md': '' });
    dirs.push(root);
    const idx = new RepoIndex(root, { ...DEFAULT_SETTINGS.index, watch: false });
    const r = await idx.relevantFiles('Fix the discount bug in the cart total');
    expect(r[0]).toMatch(/cart/);
    expect(r).not.toContain('README.md');
  });

  it('walks non-git folders honouring nested .gitignore files', async () => {
    const root = makeWorkspace({ 'a/.gitignore': 'secret.txt\n', 'a/secret.txt': '', 'a/ok.txt': '', 'b/node_modules/x.js': '', 'b/c.txt': '' });
    dirs.push(root);
    mkdirSync(path.join(root, 'empty'));
    const { files, source } = await listWorkspaceFiles(root);
    expect(source).toBe('walk');
    expect(files.map((f) => f.path).sort()).toEqual(['a/.gitignore', 'a/ok.txt', 'b/c.txt']);
  });
});

describe('Store', () => {
  it('persists conversations, messages, tasks, settings and rules', () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'lc-db-')), 'db.sqlite');
    dirs.push(path.dirname(file));
    let store = new Store(file);
    const ws = store.upsertWorkspace('/tmp/project');
    const conv = store.createConversation(ws.id, 'Hello');
    store.appendMessage(conv.id, { role: 'user', content: 'hi' });
    store.appendMessage(conv.id, { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'read_file', arguments: { path: 'a' } }] });
    const task = store.createTask({ conversationId: conv.id, workspaceId: ws.id, prompt: 'p' });
    store.updateTask(task.id, { plan: [{ id: '1', title: 'x', status: 'done' }], steps: 3 });
    store.updateSettings({ generation: { numCtx: 8192 } });
    store.addRule(ws.id, 'run_command', 'npm install');
    store.close();

    store = new Store(file);
    expect(store.listConversations(ws.id)[0].title).toBe('Hello');
    const msgs = store.listMessages(conv.id);
    expect(msgs.map((m) => m.seq)).toEqual([1, 2]);
    expect(msgs[1].toolCalls![0].name).toBe('read_file');
    expect(store.getTask(task.id)).toMatchObject({ steps: 3, plan: [{ title: 'x' }] });
    expect(store.getSettings().generation.numCtx).toBe(8192);
    expect(store.getSettings().generation.temperature).toBe(DEFAULT_SETTINGS.generation.temperature);
    expect(store.listRules(ws.id)).toHaveLength(1);
    expect(store.upsertWorkspace('/tmp/project').id).toBe(ws.id);
    store.close();
  });
});
