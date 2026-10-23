/**
 * Integration tests against a real local Ollama server. Run with:
 *   LOCALCODE_INTEGRATION=1 npx vitest run --project integration
 * Optional: LOCALCODE_TEST_MODEL (default qwen3.5:4b), LOCALCODE_TEST_EMBED_MODEL (default nomic-embed-text).
 */
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { OllamaProvider } from '../src/models/ollama.js';
import { execFileText } from '../src/util/exec.js';

const MODEL = process.env.LOCALCODE_TEST_MODEL ?? 'qwen3.5:4b';
const EMBED = process.env.LOCALCODE_TEST_EMBED_MODEL ?? 'nomic-embed-text';
const BASE = process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434';

const provider = new OllamaProvider({ id: 'ollama', kind: 'ollama', label: 'Ollama', baseUrl: BASE, enabled: true });
let available = false;
let installed: string[] = [];

beforeAll(async () => {
  if (!process.env.LOCALCODE_INTEGRATION) return;
  const h = await provider.health();
  if (!h.ok) return;
  installed = (await provider.listModels()).map((m) => m.name);
  available = installed.some((n) => n === MODEL || n === `${MODEL}:latest`);
});

const maybe = (name: string, fn: () => Promise<void>, timeout = 600_000) =>
  it(name, async (ctx) => {
    if (!available) ctx.skip();
    await fn();
  }, timeout);

describe('Ollama provider (real server)', () => {
  maybe('reports version, models and capabilities', async () => {
    const h = await provider.health();
    expect(h.ok).toBe(true);
    expect(h.version).toMatch(/\d+\.\d+/);
    const d = await provider.showModel(MODEL);
    expect(d.capabilities).toContain('completion');
    expect(d.capabilitiesReported).toBe(true);
    expect(d.contextLength).toBeGreaterThan(2048);
    expect(d.layers).toBeGreaterThan(0);
  });

  maybe('streams a chat completion with usage statistics', async () => {
    const chunks: string[] = [];
    const r = await provider.chat(
      { model: MODEL, messages: [{ role: 'user', content: 'Reply with exactly the word: pong' }], options: { temperature: 0, numCtx: 4096, maxTokens: 64, think: false } },
      (e) => e.type === 'text' && chunks.push(e.text),
    );
    expect(r.content.toLowerCase()).toContain('pong');
    expect(chunks.join('')).toBe(r.content);
    expect(r.usage.completionTokens).toBeGreaterThan(0);
  });

  maybe('returns a structured error for unknown models', async () => {
    await expect(provider.chat({ model: 'definitely-not-installed:0b', messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ code: 'model_not_found' });
  });

  it('computes embeddings and semantic search with a local embedding model', async (ctx) => {
    if (!process.env.LOCALCODE_INTEGRATION || !installed.some((n) => n.startsWith(EMBED))) ctx.skip();
    const [v] = await provider.embed(EMBED, ['function add(a, b) { return a + b; }']);
    expect(v.length).toBeGreaterThan(100);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'lc-embed-'));
    cpSync(path.resolve(import.meta.dirname, '../../../examples/sample-project'), dir, { recursive: true });
    const engine = new Engine({ dbFile: ':memory:', dataDir: mkdtempSync(path.join(os.tmpdir(), 'lc-embed-data-')), skipRecovery: true });
    try {
      const ws = engine.openWorkspace(dir);
      ws.search.embeddings.configure(provider, EMBED);
      const r = await ws.search.embeddings.update();
      expect(r.chunks).toBeGreaterThan(0);
      const hits = await ws.search.embeddings.query('format money as dollars and cents', 3);
      expect(hits[0].path).toBe('src/format.js');
    } finally {
      await engine.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});

describe('agent with a real model', () => {
  let engine: Engine;
  let dataDir: string;
  beforeAll(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'lc-int-data-'));
    engine = new Engine({ dataDir, dbFile: ':memory:', skipRecovery: true });
    engine.updateSettings({ index: { watch: false }, models: { coding: { providerId: 'ollama', model: MODEL } } });
  });
  afterAll(async () => {
    await engine.dispose();
    rmSync(dataDir, { recursive: true, force: true });
  });

  maybe('probes real tool-calling ability', async () => {
    const r = await engine.probeModel({ providerId: 'ollama', model: MODEL });
    expect(['native', 'prompted', 'none']).toContain(r.recommended);
    expect(r.explanation.length).toBeGreaterThan(10);
    expect(engine.store.getModelProfile('ollama', MODEL)?.toolMode).toBe(r.recommended);
  });

  maybe(
    'fixes the sample project bug and the tests really pass afterwards',
    async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'lc-int-ws-'));
      cpSync(path.resolve(import.meta.dirname, '../../../examples/sample-project'), dir, { recursive: true });
      try {
        const before = await execFileText(process.execPath, ['--test'], { cwd: dir, timeoutMs: 60_000 });
        expect(before.code).not.toBe(0);
        const ws = engine.openWorkspace(dir);
        engine.setPermissionMode(ws.id, 'standard');
        engine.approvalHandler = async () => ({ answer: 'deny', message: 'Not needed for this task.' });
        const conv = engine.createConversation(ws.id);
        const task = await engine.runTask({
          conversationId: conv.id,
          prompt: 'Run the tests, find out why they fail, fix the bug in src/, and re-run the tests until they pass.',
        });
        // Verify independently of what the model or the report claims.
        const after = await execFileText(process.execPath, ['--test'], { cwd: dir, timeoutMs: 60_000 });
        expect(task.status).toBe('completed');
        expect(after.code).toBe(0);
        expect(task.report!.filesChanged.map((f) => f.path)).toContain('src/cart.js');
        expect(task.report!.tests.at(-1)?.ok).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    1_200_000,
  );
});
