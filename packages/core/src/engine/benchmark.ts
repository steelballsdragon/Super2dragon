import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ModelRef } from '../models/types.js';
import type { ProbeResult } from '../models/probe.js';
import { execFileText } from '../util/exec.js';
import { errorMessage } from '../util/errors.js';
import type { Engine } from './engine.js';

export interface BenchmarkTaskResult {
  id: string;
  title: string;
  passed: boolean;
  steps: number;
  durationMs: number;
  status: string;
  detail: string;
}

export interface BenchmarkResult {
  model: ModelRef;
  toolMode: string;
  probe: ProbeResult;
  tasks: BenchmarkTaskResult[];
  score: number;
  tokensPerSec?: number;
  timeToFirstTokenMs?: number;
  totalMs: number;
  runAt: string;
}

interface BenchTask {
  id: string;
  title: string;
  prompt: string;
  setup: (dir: string) => void;
  /** Verify with real execution, independent of what the model claims. */
  verify: (dir: string) => Promise<{ ok: boolean; detail: string }>;
}

async function nodeCheck(dir: string, script: string): Promise<{ ok: boolean; detail: string }> {
  const file = path.join(dir, '.bench-verify.mjs');
  writeFileSync(file, script);
  const r = await execFileText(process.execPath, [file], { cwd: dir, timeoutMs: 20_000 });
  rmSync(file, { force: true });
  return { ok: r.code === 0, detail: (r.stdout + r.stderr).trim().slice(0, 300) || `exit ${r.code}` };
}

const TASKS: BenchTask[] = [
  {
    id: 'fix-bug',
    title: 'Find and fix a bug so the test passes',
    prompt: 'The test in test.mjs fails. Run it with `node test.mjs`, fix the bug in math.mjs (do not change test.mjs), and run the test again to confirm it passes.',
    setup: (dir) => {
      writeFileSync(path.join(dir, 'math.mjs'), 'export function average(values) {\n  let total = 0;\n  for (const v of values) total += v;\n  return total / (values.length + 1);\n}\n');
      writeFileSync(
        path.join(dir, 'test.mjs'),
        "import assert from 'node:assert/strict';\nimport { average } from './math.mjs';\nassert.equal(average([2, 4, 6]), 4);\nassert.equal(average([10]), 10);\nconsole.log('ok');\n",
      );
    },
    verify: (dir) => nodeCheck(dir, "import { average } from './math.mjs';\nif (average([2,4,6]) !== 4 || average([5]) !== 5 || average([1,2]) !== 1.5) { console.error('wrong result'); process.exit(1); }\nconsole.log('verified');\n"),
  },
  {
    id: 'implement',
    title: 'Implement a function in a new file',
    prompt:
      'Create a file slugify.mjs that exports a function slugify(text) which lowercases the text, replaces every run of non-alphanumeric characters with a single "-", and trims leading/trailing "-". Example: slugify("  Hello, World!  ") returns "hello-world". Verify it by running a quick node command.',
    setup: () => {},
    verify: (dir) =>
      nodeCheck(
        dir,
        "import { slugify } from './slugify.mjs';\nconst cases = [['  Hello, World!  ', 'hello-world'], ['Already-slug', 'already-slug'], ['A  B__C', 'a-b-c']];\nfor (const [i, o] of cases) { const got = slugify(i); if (got !== o) { console.error(`slugify(${JSON.stringify(i)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(o)}`); process.exit(1); } }\nconsole.log('verified');\n",
      ),
  },
  {
    id: 'multi-file',
    title: 'Rename a function across files',
    prompt: 'Rename the function getUserName to getDisplayName everywhere in this project (definition and all call sites), then run `node main.mjs` to confirm it still works.',
    setup: (dir) => {
      mkdirSync(path.join(dir, 'lib'), { recursive: true });
      writeFileSync(path.join(dir, 'lib', 'users.mjs'), "export function getUserName(user) {\n  return `${user.first} ${user.last}`;\n}\n");
      writeFileSync(path.join(dir, 'lib', 'greet.mjs'), "import { getUserName } from './users.mjs';\nexport const greet = (u) => `Hello, ${getUserName(u)}!`;\n");
      writeFileSync(path.join(dir, 'main.mjs'), "import { greet } from './lib/greet.mjs';\nimport { getUserName } from './lib/users.mjs';\nconst u = { first: 'Ada', last: 'Lovelace' };\nconsole.log(greet(u), getUserName(u));\n");
    },
    verify: async (dir) => {
      const grep = await execFileText(process.execPath, ['-e', "const fs=require('fs');const p=require('path');let bad=[];for(const f of ['lib/users.mjs','lib/greet.mjs','main.mjs']){if(fs.readFileSync(p.join(process.argv[1],f),'utf8').includes('getUserName'))bad.push(f)}if(bad.length){console.error('still uses getUserName: '+bad.join(','));process.exit(1)}", dir], { timeoutMs: 10_000 });
      if (grep.code !== 0) return { ok: false, detail: grep.stderr.trim() };
      const run = await execFileText(process.execPath, ['main.mjs'], { cwd: dir, timeoutMs: 10_000 });
      return { ok: run.code === 0 && /Hello, Ada Lovelace!/.test(run.stdout), detail: (run.stdout + run.stderr).trim().slice(0, 200) };
    },
  },
];

/**
 * Benchmark a model on representative coding tasks. Each task runs the real
 * agent loop in a throwaway sandbox folder (autonomous mode, network denied)
 * and success is verified by executing code, not by trusting the model.
 */
export async function runBenchmark(
  engine: Engine,
  ref: ModelRef,
  opts: { signal?: AbortSignal; onProgress?: (msg: string) => void; taskIds?: string[]; maxSteps?: number } = {},
): Promise<BenchmarkResult> {
  const started = Date.now();
  const say = opts.onProgress ?? (() => {});
  say(`Probing tool calling for ${ref.model}...`);
  const probe = await engine.probeModel(ref, opts.signal);
  say(`Probe: ${probe.recommended} - ${probe.explanation}`);
  const { Engine: EngineClass } = await import('./engine.js');
  const results: BenchmarkTaskResult[] = [];
  let tokensPerSec: number | undefined;
  let ttft: number | undefined;
  const tasks = TASKS.filter((t) => !opts.taskIds || opts.taskIds.includes(t.id));
  if (probe.recommended === 'none') {
    for (const t of tasks) results.push({ id: t.id, title: t.title, passed: false, steps: 0, durationMs: 0, status: 'skipped', detail: 'Model cannot call tools.' });
  } else {
    for (const t of tasks) {
      if (opts.signal?.aborted) break;
      const dir = mkdtempSync(path.join(os.tmpdir(), `localcode-bench-${t.id}-`));
      const dataDir = mkdtempSync(path.join(os.tmpdir(), 'localcode-bench-data-'));
      const bench = new EngineClass({ dbFile: ':memory:', dataDir, skipRecovery: true });
      try {
        t.setup(dir);
        const base = engine.settings();
        bench.updateSettings({
          providers: base.providers,
          generation: base.generation,
          toolModeOverrides: { [`${ref.providerId}/${ref.model}`]: probe.recommended },
          agent: { ...base.agent, maxSteps: opts.maxSteps ?? 16, maxTaskMinutes: 20 },
          permissions: { mode: 'autonomous', envPassthrough: [] },
          index: { ...base.index, watch: false },
        });
        bench.approvalHandler = async () => ({ answer: 'deny', message: 'Benchmark sandbox: network access and destructive actions are not allowed.' });
        const ws = bench.openWorkspace(dir);
        const conv = bench.createConversation(ws.id, { model: ref });
        const unsub = (e: { type: string; usage?: { evalTokensPerSec?: number; timeToFirstTokenMs?: number } }) => {
          if (e.type === 'model.result' && e.usage) {
            tokensPerSec ??= e.usage.evalTokensPerSec;
            ttft ??= e.usage.timeToFirstTokenMs;
          }
        };
        bench.on('event', unsub);
        say(`Task "${t.title}"...`);
        const t0 = Date.now();
        const task = await bench.runTask({ conversationId: conv.id, prompt: t.prompt, model: ref });
        const v = await t.verify(dir);
        results.push({ id: t.id, title: t.title, passed: v.ok, steps: task.steps, durationMs: Date.now() - t0, status: task.status, detail: v.detail });
        say(`  ${v.ok ? 'PASS' : 'FAIL'} (${task.status}, ${task.steps} steps, ${((Date.now() - t0) / 1000).toFixed(0)}s) ${v.ok ? '' : v.detail}`);
      } catch (err) {
        results.push({ id: t.id, title: t.title, passed: false, steps: 0, durationMs: 0, status: 'error', detail: errorMessage(err) });
      } finally {
        await bench.dispose();
        rmSync(dir, { recursive: true, force: true });
        rmSync(dataDir, { recursive: true, force: true });
      }
    }
  }
  const passed = results.filter((r) => r.passed).length;
  const probePoints = (probe.native?.callOk || probe.prompted?.callOk ? 1 : 0) + (probe.native?.roundTripOk || probe.prompted?.roundTripOk ? 1 : 0);
  const score = Math.round(((passed * 3 + probePoints) / (tasks.length * 3 + 2)) * 100);
  const result: BenchmarkResult = {
    model: ref,
    toolMode: probe.recommended,
    probe,
    tasks: results,
    score,
    tokensPerSec,
    timeToFirstTokenMs: ttft,
    totalMs: Date.now() - started,
    runAt: new Date().toISOString(),
  };
  engine.store.upsertModelProfile(ref.providerId, ref.model, { benchmark: result });
  return result;
}
