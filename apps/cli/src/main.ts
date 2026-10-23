import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  Engine,
  type EngineEvent,
  type ModelRef,
  type PermissionMode,
  PERMISSION_MODES,
  errorMessage,
  formatBytes,
  runBenchmark,
  runDoctor,
} from '@localcode/core';
import { TerminalRenderer, c, terminalApprovals } from './render.js';
import { startServer } from './server.js';
import { VERSION } from './version.js';

interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      else {
        const key = a.slice(2);
        const next = argv[i + 1];
        const isBool = ['yes', 'verbose', 'json', 'thinking', 'help', 'no-ui', 'all', 'deny'].includes(key);
        if (!isBool && next !== undefined && !next.startsWith('-')) {
          out.flags[key] = next;
          i++;
        } else out.flags[key] = true;
      }
    } else if (a.startsWith('-') && a.length === 2) {
      const map: Record<string, string> = { w: 'workspace', m: 'model', y: 'yes', v: 'verbose', h: 'help', p: 'port' };
      const key = map[a[1]] ?? a[1];
      const next = argv[i + 1];
      if (['yes', 'verbose', 'help'].includes(key)) out.flags[key] = true;
      else if (next !== undefined) {
        out.flags[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

const HELP = `${c.bold('LocalCode AI')} ${VERSION} — a local coding agent for open-weight models

${c.bold('Usage')}
  localcode run "<task>"     Run a task in a workspace and stream progress
  localcode chat             Interactive session (conversation persists)
  localcode serve            Start the local server for the desktop/browser UI
  localcode doctor           Check dependencies, hardware and inference servers
  localcode models           List installed models, capabilities and memory fit
  localcode probe <model>    Test whether a model can really call tools
  localcode bench <model>    Benchmark a model on real coding tasks
  localcode pull <model>     Download a model through Ollama (network access)
  localcode tasks            List recent tasks in the workspace
  localcode resume <taskId>  Resume an interrupted/failed/blocked task
  localcode undo             Restore files from a checkpoint (--task <id> | --checkpoint <id>)
  localcode checkpoints      List checkpoints for the workspace
  localcode config show      Print all settings as JSON (config import <file> | config set <path> <json>)

${c.bold('Options')}
  -w, --workspace <dir>      Workspace folder (default: current directory)
  -m, --model <name>         Model, e.g. qwen2.5-coder:7b or llamacpp/model-name
  --mode <m>                 Permission mode: strict | standard | autonomous
  -y, --yes                  Approve all approval prompts automatically
  -v, --verbose              Show model calls, token speed and checkpoints
  --thinking                 Show model reasoning (for models that support it)
  --ctx <tokens>             Context window to request (num_ctx)
  --port <n>, --host <h>     Server address for "serve" (default 127.0.0.1:4317)
`;

async function pickModel(engine: Engine, spec?: string): Promise<ModelRef | undefined> {
  if (!spec) return undefined;
  if (spec.includes('/') && !spec.includes(':')) {
    const [providerId, ...rest] = spec.split('/');
    if (engine.settings().providers.some((p) => p.id === providerId)) return { providerId, model: rest.join('/') };
  }
  const slash = spec.indexOf('/');
  if (slash > 0 && engine.settings().providers.some((p) => p.id === spec.slice(0, slash))) {
    return { providerId: spec.slice(0, slash), model: spec.slice(slash + 1) };
  }
  // Find the provider that has this model installed.
  for (const p of engine.providers()) {
    const models = await p.listModels().catch(() => []);
    const hit = models.find((m) => m.name === spec || m.name === `${spec}:latest`);
    if (hit) return { providerId: p.config.id, model: hit.name };
  }
  throw new Error(`Model "${spec}" is not installed on any running inference server. Run "localcode models" to see installed models.`);
}

function applyCommonFlags(engine: Engine, args: Args, workspaceId?: string) {
  const mode = args.flags.mode as PermissionMode | undefined;
  if (mode) {
    if (!PERMISSION_MODES.includes(mode)) throw new Error(`--mode must be one of ${PERMISSION_MODES.join(', ')}`);
    if (workspaceId) engine.setPermissionMode(workspaceId, mode);
  }
  if (args.flags.ctx) engine.updateSettings({ generation: { numCtx: Number(args.flags.ctx) } });
  if (args.flags.thinking) engine.updateSettings({ generation: { thinking: true } });
}

async function cmdRun(engine: Engine, args: Args) {
  const prompt = args._.slice(1).join(' ').trim();
  if (!prompt) throw new Error('Usage: localcode run "<task description>"');
  const ws = engine.openWorkspace(String(args.flags.workspace ?? process.cwd()));
  applyCommonFlags(engine, args, ws.id);
  const model = await pickModel(engine, args.flags.model as string | undefined);
  const conv = engine.createConversation(ws.id, { model });
  await executeTask(engine, args, () => engine.startTask({ conversationId: conv.id, prompt, model }));
}

async function executeTask(engine: Engine, args: Args, start: () => Promise<{ id: string }>) {
  const renderer = new TerminalRenderer({ verbose: !!args.flags.verbose, showThinking: !!args.flags.thinking });
  engine.approvalHandler = terminalApprovals({ autoApprove: !!args.flags.yes });
  const onEvent = (e: EngineEvent) => renderer.handle(e);
  engine.on('event', onEvent);
  let taskId: string | undefined;
  const onSigint = () => {
    if (taskId && engine.isRunning(taskId)) {
      process.stdout.write(c.yellow('\nStopping task (Ctrl+C again to force quit)...\n'));
      engine.cancelTask(taskId);
      process.once('SIGINT', () => process.exit(130));
    } else process.exit(130);
  };
  process.once('SIGINT', onSigint);
  try {
    const task = await start();
    taskId = task.id;
    const done = await engine.waitForTask(task.id);
    if (done.report) renderer.report(done.report, done.error, done.id);
    else if (done.error) console.error(c.red(done.error));
    console.log(c.gray(`  Task id: ${done.id}`));
    process.exitCode = done.status === 'completed' ? 0 : done.status === 'cancelled' ? 130 : 1;
    return done;
  } finally {
    engine.off('event', onEvent);
    process.off('SIGINT', onSigint);
  }
}

async function cmdChat(engine: Engine, args: Args) {
  const ws = engine.openWorkspace(String(args.flags.workspace ?? process.cwd()));
  applyCommonFlags(engine, args, ws.id);
  const model = await pickModel(engine, args.flags.model as string | undefined);
  let conv = args.flags.resume
    ? engine.store.getConversation(String(args.flags.resume))
    : (engine.store.listConversations(ws.id)[0] && args.flags.continue ? engine.store.listConversations(ws.id)[0] : undefined);
  conv ??= engine.createConversation(ws.id, { model });
  console.log(c.bold(`LocalCode chat — ${ws.record.path}`));
  console.log(c.gray(`Conversation ${conv.id}. Commands: /model <name>, /mode <m>, /undo, /exit. Empty line = nothing.`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const question = () => new Promise<string | null>((resolve) => {
    rl.question(c.cyan('\n› '), resolve);
    rl.once('close', () => resolve(null));
  });
  let currentModel = model;
  for (;;) {
    const line = await question();
    if (line === null) break;
    const text = line.trim();
    if (!text) continue;
    if (text === '/exit' || text === '/quit') break;
    if (text.startsWith('/model ')) {
      currentModel = await pickModel(engine, text.slice(7).trim());
      if (currentModel) engine.setConversationModel(conv.id, currentModel);
      console.log(c.gray(`Model: ${currentModel?.model}`));
      continue;
    }
    if (text.startsWith('/mode ')) {
      const mode = text.slice(6).trim() as PermissionMode;
      if (!PERMISSION_MODES.includes(mode)) console.log(c.red(`Mode must be one of ${PERMISSION_MODES.join(', ')}`));
      else engine.setPermissionMode(ws.id, mode);
      continue;
    }
    if (text === '/undo') {
      const last = engine.store.listTasks(conv.id).pop();
      if (!last) console.log('Nothing to undo.');
      else {
        const r = await engine.undoTask(last.id);
        console.log(`Restored ${r.restored.length} file(s), removed ${r.removed.length}.`);
      }
      continue;
    }
    rl.pause();
    await executeTask(engine, args, () => engine.startTask({ conversationId: conv!.id, prompt: text, model: currentModel }));
    rl.resume();
  }
  rl.close();
}

async function cmdDoctor(engine: Engine, args: Args) {
  const report = await runDoctor({ dataDir: engine.dataDir, settings: engine.settings(), providers: engine.providers() });
  if (args.flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const s = report.system;
  console.log(c.bold('LocalCode doctor'));
  console.log(c.gray(`${s.osRelease} ${s.arch}, ${s.cpuModel}`));
  for (const ch of report.checks) {
    const mark = ch.status === 'ok' ? c.green('✓') : ch.status === 'warn' ? c.yellow('!') : c.red('✗');
    console.log(`${mark} ${ch.label.padEnd(28)} ${ch.detail}`);
    if (ch.fix) console.log(`  ${c.gray('→')} ${ch.fix}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}

async function cmdModels(engine: Engine, args: Args) {
  const listing = await engine.listModels();
  if (args.flags.json) {
    console.log(JSON.stringify(listing, null, 2));
    return;
  }
  for (const l of listing) {
    console.log(`${c.bold(l.provider.label)} ${c.gray(l.provider.baseUrl)} ${l.health.ok ? c.green(`online${l.health.version ? ` ${l.health.version}` : ''}`) : c.red(`offline (${l.health.error})`)}`);
    for (const m of l.models) {
      const caps = m.details?.capabilities.join(',') ?? '?';
      const tools = m.chatCapable ? `${m.toolMode}${m.toolModeSource === 'probe' ? ' (probed)' : m.toolModeSource === 'override' ? ' (override)' : ' (unverified)'}` : 'embedding only';
      const loaded = l.loaded.find((x) => x.name === m.name);
      console.log(
        `  ${m.name.padEnd(30)} ${(m.parameterSize ?? '').padEnd(6)} ${formatBytes(m.sizeBytes).padStart(7)}  tools: ${tools.padEnd(22)} caps: ${caps}${loaded ? c.cyan(' [loaded]') : ''}`,
      );
      if (m.fit) console.log(`    ${c.gray(`memory @ ${m.memory?.numCtx} ctx: ${m.fit.message}`)}`);
      if (m.probe) console.log(`    ${c.gray(`probe: ${m.probe.explanation}`)}`);
    }
    if (l.health.ok && !l.models.length) console.log(c.gray('  (no models installed)'));
  }
}

async function cmdProbe(engine: Engine, args: Args) {
  const ref = await pickModel(engine, args._[1]);
  if (!ref) throw new Error('Usage: localcode probe <model>');
  console.log(c.gray(`Probing ${ref.model} (native tool calls, then the prompted fallback)...`));
  const r = await engine.probeModel(ref, undefined, (m) => console.log(c.gray(m)));
  const show = (label: string, p?: { callOk: boolean; roundTripOk: boolean; salvaged: boolean; latencyMs: number; error?: string; detail?: string }) => {
    if (!p) return;
    console.log(`  ${label.padEnd(9)} call: ${p.callOk ? c.green('ok') : c.red('fail')}  use result: ${p.roundTripOk ? c.green('ok') : c.red('fail')}${p.salvaged ? c.yellow('  (recovered from text)') : ''}  ${c.gray(`${(p.latencyMs / 1000).toFixed(1)}s`)}`);
    if (p.error || p.detail) console.log(c.gray(`            ${p.error ?? p.detail}`));
  };
  show('native', r.native);
  show('prompted', r.prompted);
  console.log(`${c.bold('Recommended mode:')} ${r.recommended} — ${r.explanation}`);
}

async function cmdBench(engine: Engine, args: Args) {
  const ref = await pickModel(engine, args._[1]);
  if (!ref) throw new Error('Usage: localcode bench <model>');
  const r = await runBenchmark(engine, ref, { onProgress: (m) => console.log(c.gray(m)) });
  console.log(c.bold(`\nBenchmark ${ref.model}: score ${r.score}/100 (tool mode: ${r.toolMode})`));
  for (const t of r.tasks) console.log(`  ${t.passed ? c.green('PASS') : c.red('FAIL')} ${t.title} ${c.gray(`(${t.status}, ${t.steps} steps, ${(t.durationMs / 1000).toFixed(0)}s)`)}`);
  if (r.tokensPerSec) console.log(c.gray(`  generation speed ~${r.tokensPerSec.toFixed(1)} tokens/s; total ${(r.totalMs / 1000).toFixed(0)}s`));
}

async function cmdPull(engine: Engine, args: Args) {
  const model = args._[1];
  if (!model) throw new Error('Usage: localcode pull <model>');
  const providerId = String(args.flags.provider ?? 'ollama');
  console.log(c.yellow(`This downloads "${model}" from the Ollama registry (registry.ollama.ai) — network access is required.`));
  const renderer = new TerminalRenderer();
  const on = (e: EngineEvent) => renderer.handle(e);
  engine.on('event', on);
  try {
    await engine.pullModel(providerId, model);
    console.log(c.green(`\nInstalled ${model}. Test it with: localcode probe ${model}`));
  } finally {
    engine.off('event', on);
  }
}

async function cmdTasks(engine: Engine, args: Args) {
  const ws = engine.openWorkspace(String(args.flags.workspace ?? process.cwd()));
  for (const t of engine.store.recentTasks(ws.id, 20)) {
    const color = t.status === 'completed' ? c.green : t.status === 'running' ? c.cyan : c.yellow;
    console.log(`${t.id}  ${color(t.status.padEnd(11))} ${t.createdAt.slice(0, 16).replace('T', ' ')}  ${t.prompt.slice(0, 70).replace(/\s+/g, ' ')}`);
  }
}

async function cmdResume(engine: Engine, args: Args) {
  const id = args._[1];
  if (!id) throw new Error('Usage: localcode resume <taskId>');
  const model = await pickModel(engine, args.flags.model as string | undefined);
  await executeTask(engine, args, () => engine.resumeTask(id, { model }));
}

async function cmdUndo(engine: Engine, args: Args) {
  const ws = engine.openWorkspace(String(args.flags.workspace ?? process.cwd()));
  let r;
  if (args.flags.task) r = await engine.undoTask(String(args.flags.task));
  else if (args.flags.checkpoint) r = await engine.restoreCheckpoint(ws.id, String(args.flags.checkpoint));
  else {
    const last = engine.store.recentTasks(ws.id, 1)[0];
    if (!last) throw new Error('No tasks in this workspace.');
    console.log(c.gray(`Undoing last task: ${last.prompt.slice(0, 80)}`));
    r = await engine.undoTask(last.id);
  }
  for (const f of r.restored) console.log(`  restored ${f}`);
  for (const f of r.removed) console.log(`  removed  ${f}`);
  console.log(c.green(`Done (${r.restored.length + r.removed.length} files). The previous state was saved as a checkpoint.`));
}

async function cmdCheckpoints(engine: Engine, args: Args) {
  const ws = engine.openWorkspace(String(args.flags.workspace ?? process.cwd()));
  for (const cp of engine.listCheckpoints(ws.id).slice(0, 30)) {
    console.log(`${cp.id}  ${cp.commitHash.slice(0, 8)}  ${cp.createdAt.slice(0, 19).replace('T', ' ')}  ${cp.label}`);
  }
}

async function cmdConfig(engine: Engine, args: Args) {
  const sub = args._[1] ?? 'show';
  if (sub === 'show') {
    console.log(JSON.stringify(engine.settings(), null, 2));
    return;
  }
  if (sub === 'import') {
    const file = args._[2];
    if (!file) throw new Error('Usage: localcode config import <settings.json>');
    const { readFileSync } = await import('node:fs');
    const patch = JSON.parse(readFileSync(file, 'utf8'));
    engine.updateSettings(patch);
    console.log(c.green(`Imported settings from ${file}.`));
    return;
  }
  if (sub === 'set') {
    const [key, raw] = [args._[2], args._.slice(3).join(' ')];
    if (!key || !raw) throw new Error('Usage: localcode config set <dotted.path> <json value>   e.g. config set generation.numCtx 8192');
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
    const patch: Record<string, unknown> = {};
    const parts = key.split('.');
    let cur = patch;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = value;
      else cur = (cur[p] = {}) as Record<string, unknown>;
    });
    engine.updateSettings(patch);
    console.log(c.green(`${key} = ${JSON.stringify(value)}`));
    return;
  }
  throw new Error('Usage: localcode config show | import <file> | set <path> <value>');
}

function defaultUiDir(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.join(here, 'ui'), path.join(here, '..', '..', 'desktop', 'dist'), path.resolve('apps/desktop/dist')]) {
    if (existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return undefined;
}

async function cmdServe(engine: Engine, args: Args) {
  const host = String(args.flags.host ?? '127.0.0.1');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    console.log(c.yellow(`Warning: binding to ${host} exposes the agent beyond this machine. Only do this on trusted networks.`));
  }
  const token = String(args.flags.token ?? process.env.LOCALCODE_TOKEN ?? randomBytes(24).toString('base64url'));
  const uiDir = args.flags['no-ui'] ? undefined : ((args.flags.ui as string | undefined) ?? defaultUiDir());
  const origins = typeof args.flags.origin === 'string' ? args.flags.origin.split(',') : [];
  const srv = await startServer(engine, { host, port: Number(args.flags.port ?? 4317), token, uiDir, allowedOrigins: origins });
  // Machine-readable line used by the desktop shell to discover the port and token.
  console.log(`LOCALCODE_READY ${JSON.stringify({ port: srv.port, token })}`);
  if (uiDir) console.log(`LocalCode UI: http://127.0.0.1:${srv.port}/#token=${token}`);
  else console.log(`LocalCode server listening on ws://127.0.0.1:${srv.port}/ws`);
  const shutdown = async () => {
    await srv.close();
    await engine.dispose();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Exit when the parent (desktop shell) closes our stdin.
  if (args.flags['exit-with-stdin']) {
    process.stdin.on('end', shutdown);
    process.stdin.resume();
  }
  await new Promise(() => {});
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (!cmd || args.flags.help || cmd === 'help') {
    console.log(HELP);
    return;
  }
  if (cmd === 'version' || cmd === '--version') {
    console.log(VERSION);
    return;
  }
  const engine = new Engine({ dataDir: args.flags['data-dir'] ? path.resolve(String(args.flags['data-dir'])) : undefined });
  try {
    switch (cmd) {
      case 'run':
        await cmdRun(engine, args);
        break;
      case 'chat':
        await cmdChat(engine, args);
        break;
      case 'serve':
        await cmdServe(engine, args);
        break;
      case 'doctor':
        await cmdDoctor(engine, args);
        break;
      case 'models':
        await cmdModels(engine, args);
        break;
      case 'probe':
        await cmdProbe(engine, args);
        break;
      case 'bench':
      case 'benchmark':
        await cmdBench(engine, args);
        break;
      case 'pull':
        await cmdPull(engine, args);
        break;
      case 'tasks':
        await cmdTasks(engine, args);
        break;
      case 'resume':
        await cmdResume(engine, args);
        break;
      case 'undo':
        await cmdUndo(engine, args);
        break;
      case 'checkpoints':
        await cmdCheckpoints(engine, args);
        break;
      case 'config':
        await cmdConfig(engine, args);
        break;
      default:
        console.error(`Unknown command "${cmd}".\n`);
        console.log(HELP);
        process.exitCode = 2;
    }
  } catch (err) {
    console.error(c.red(`Error: ${errorMessage(err)}`));
    process.exitCode = 1;
  } finally {
    if (cmd !== 'serve') await engine.dispose();
  }
}

main().then(() => {
  // Background handles (watchers, shells) are disposed; make sure the CLI exits promptly.
  if (process.argv[2] !== 'serve') setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
});
