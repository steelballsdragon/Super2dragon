import { z } from 'zod';
import type { CommandResult } from '../exec/shell.js';
import { parseDiagnostics, parseTestOutput } from '../parsers/output.js';
import { assessCommand } from '../security/commands.js';
import { stripAnsi, truncateMiddle } from '../util/text.js';
import { boolArg, intArg } from './args.js';
import { defineTool, type ToolContext } from './types.js';

function formatResult(r: CommandResult, maxChars: number): string {
  const status = r.timedOut
    ? `TIMED OUT after ${Math.round(r.durationMs / 1000)}s (process killed)`
    : r.cancelled
      ? 'CANCELLED'
      : `exit code ${r.exitCode}${r.exitCode === 0 ? ' (success)' : ' (FAILED)'}`;
  const out = stripAnsi(r.output).trim();
  return `$ ${r.command}\n[${status}, ${(r.durationMs / 1000).toFixed(1)}s, cwd: ${r.cwd}]\n${out ? truncateMiddle(out, maxChars, 'chars') : '(no output)'}`;
}

async function runInShell(ctx: ToolContext, command: string, timeoutSec: number, tool: string, cwd?: string): Promise<CommandResult> {
  const r = await ctx.shell.run(command, {
    timeoutMs: timeoutSec * 1000,
    signal: ctx.signal,
    cwd,
    onOutput: (stream, chunk) => ctx.emitOutput(stream, chunk),
  });
  ctx.recordCommand({ command, exitCode: r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut, tool });
  ctx.setLastFailure(r.exitCode === 0 ? undefined : r);
  // Commands may change files behind our back.
  ctx.index.markDirty();
  return r;
}

function cwdFor(ctx: ToolContext, cwd?: string): string | undefined {
  return cwd ? ctx.guard.resolve(cwd).abs : undefined;
}

export const runCommandTool = defineTool({
  name: 'run_command',
  description:
    'Run a shell command in the workspace (persistent shell: cd and exported variables persist). Returns the real exit code and output. For servers/watchers set background=true, then use the process tool.',
  category: 'execute',
  schema: z.object({
    command: z.string().min(1).describe('The shell command to run'),
    cwd: z.string().optional().describe('Working directory relative to the workspace root'),
    timeout_sec: intArg('Kill the command after this many seconds (default from settings)').optional(),
    background: boolArg('Start as a long-running background process (dev servers)').optional(),
  }),
  mutates: (a) => {
    const level = assessCommand(a.command).level;
    return level !== 'read';
  },
  assess: (a, ctx) => {
    const r = assessCommand(a.command, ctx.guard.root);
    return {
      risk: r.level,
      summary: `${a.background ? 'Start background process' : 'Run'}: ${a.command}`,
      reasons: r.reasons,
      ruleKey: r.prefix,
      blocked: r.blocked,
    };
  },
  async execute(a, ctx) {
    const max = ctx.settings.agent.toolOutputMaxChars;
    if (a.background) {
      const cwd = cwdFor(ctx, a.cwd) ?? ctx.shell.cwd;
      const info = ctx.processes.start(a.command, cwd);
      ctx.recordCommand({ command: a.command, exitCode: null, durationMs: 0, timedOut: false, tool: 'run_command (background)' });
      // Give it a moment so early failures (port in use, syntax errors) are visible.
      await new Promise((r) => setTimeout(r, 2500));
      const snap = ctx.processes.output(info.id, 3000);
      const status = snap?.info.status === 'running' ? 'running' : `exited with code ${snap?.info.exitCode}`;
      return {
        ok: snap?.info.status === 'running' || snap?.info.exitCode === 0,
        output: `Started background process ${info.id} (pid ${info.pid}) - ${status}.\nInitial output:\n${stripAnsi(snap?.output ?? '').trim() || '(none yet)'}\nUse the process tool with id "${info.id}" to read output or stop it.`,
        data: { processId: info.id },
      };
    }
    const timeout = Math.max(1, Math.min(a.timeout_sec ?? ctx.settings.agent.commandTimeoutSec, 3600));
    const r = await runInShell(ctx, a.command, timeout, 'run_command', cwdFor(ctx, a.cwd));
    return {
      ok: r.exitCode === 0,
      output: formatResult(r, max),
      data: { exitCode: r.exitCode, timedOut: r.timedOut, durationMs: r.durationMs },
    };
  },
});

export const processTool = defineTool({
  name: 'process',
  description: 'Manage background processes started with run_command background=true: list them, read recent output, or stop one.',
  category: 'execute',
  schema: z.object({
    action: z.enum(['list', 'output', 'stop']).describe('What to do'),
    id: z.string().optional().describe('Process id (for output/stop)'),
  }),
  mutates: false,
  assess: (a) => ({ risk: a.action === 'stop' ? 'build' : 'read', summary: `Process ${a.action}${a.id ? ` ${a.id}` : ''}`, reasons: [] }),
  async execute(a, ctx) {
    if (a.action === 'list') {
      const list = ctx.processes.list();
      if (!list.length) return { ok: true, output: 'No background processes.' };
      return { ok: true, output: list.map((p) => `${p.id}  ${p.status}${p.exitCode !== null ? ` (exit ${p.exitCode})` : ''}  ${p.command}`).join('\n') };
    }
    if (!a.id) return { ok: false, output: 'id is required.' };
    if (a.action === 'stop') {
      const p = ctx.processes.stop(a.id);
      return p ? { ok: true, output: `Stopped ${a.id}.` } : { ok: false, output: `No process ${a.id}.` };
    }
    const o = ctx.processes.output(a.id, 6000);
    if (!o) return { ok: false, output: `No process ${a.id}.` };
    return { ok: true, output: `${o.info.id} ${o.info.status}${o.info.exitCode !== null ? ` (exit ${o.info.exitCode})` : ''}\n${stripAnsi(o.output).trim() || '(no output yet)'}` };
  },
});

export const runTestsTool = defineTool({
  name: 'run_tests',
  description:
    'Run the project test suite (auto-detected: npm/pnpm/yarn test, pytest, cargo test, go test, ...) or a given test command. Returns pass/fail counts and failure output.',
  category: 'execute',
  schema: z.object({
    command: z.string().optional().describe('Test command to run instead of the detected one'),
    filter: z.string().optional().describe('Test name or file to focus on (appended to the detected command)'),
    timeout_sec: intArg('Timeout in seconds (default 600)').optional(),
  }),
  mutates: false,
  assess: (a, ctx) => {
    const cmd = a.command ?? '(detected test command)';
    const r = a.command ? assessCommand(a.command, ctx.guard.root) : { level: 'build' as const, reasons: [], prefix: 'run_tests', blocked: undefined };
    return { risk: r.level, summary: `Run tests: ${cmd}${a.filter ? ` (${a.filter})` : ''}`, reasons: r.reasons, ruleKey: r.prefix, blocked: r.blocked };
  },
  async execute(a, ctx) {
    const project = await ctx.index.project();
    let command = a.command ?? project.testCommand;
    if (!command) {
      return {
        ok: false,
        output: 'No test command detected for this project (no test script, pytest, cargo, go test...). Pass command explicitly, e.g. run_tests command="node --test".',
      };
    }
    if (a.filter && !a.command) {
      if (/pytest/.test(command)) command += ` -k ${JSON.stringify(a.filter)}`;
      else if (/^(npm|pnpm|yarn|bun) (run )?test/.test(command)) command += ` -- ${JSON.stringify(a.filter)}`;
      else if (/cargo test|go test/.test(command)) command += /go test/.test(command) ? ` -run ${JSON.stringify(a.filter)}` : ` ${JSON.stringify(a.filter)}`;
      else command += ` ${JSON.stringify(a.filter)}`;
    }
    const r = await runInShell(ctx, command, Math.min(a.timeout_sec ?? 600, 3600), 'run_tests');
    const summary = parseTestOutput(r.output);
    const ok = r.exitCode === 0;
    ctx.recordTest({ command, ok, exitCode: r.exitCode, passed: summary.passed, failed: summary.failed, skipped: summary.skipped });
    const counts =
      summary.passed !== undefined || summary.failed !== undefined
        ? `${summary.framework ?? 'tests'}: ${summary.passed ?? '?'} passed, ${summary.failed ?? 0} failed${summary.skipped ? `, ${summary.skipped} skipped` : ''}`
        : 'could not parse test counts';
    const failures = summary.failures.length ? `\nFailing: ${summary.failures.join('; ')}` : '';
    return {
      ok,
      output: `TESTS ${ok ? 'PASSED' : 'FAILED'} (${counts})${failures}\n${formatResult(r, ctx.settings.agent.toolOutputMaxChars)}`,
      data: { exitCode: r.exitCode, ...summary },
    };
  },
});

export const inspectErrorsTool = defineTool({
  name: 'inspect_errors',
  description:
    'Collect compiler, type-check, lint, test and runtime errors as a structured list (file:line message). Runs the given command, or the project check command, or analyses the last failed command.',
  category: 'execute',
  schema: z.object({
    command: z.string().optional().describe('Command to run and analyse (e.g. "npx tsc --noEmit"). Omit to use the project check or the last failure.'),
  }),
  mutates: false,
  assess: (a, ctx) => {
    if (!a.command) return { risk: 'build', summary: 'Inspect errors (project checks / last failure)', reasons: [], ruleKey: 'inspect_errors' };
    const r = assessCommand(a.command, ctx.guard.root);
    return { risk: r.level, summary: `Inspect errors: ${a.command}`, reasons: r.reasons, ruleKey: r.prefix, blocked: r.blocked };
  },
  async execute(a, ctx) {
    let result: CommandResult | undefined;
    let origin: string;
    if (a.command) {
      result = await runInShell(ctx, a.command, ctx.settings.agent.commandTimeoutSec, 'inspect_errors');
      origin = a.command;
    } else {
      const project = await ctx.index.project();
      const check = project.checkCommands[0] ?? project.buildCommand;
      if (check) {
        result = await runInShell(ctx, check, ctx.settings.agent.commandTimeoutSec, 'inspect_errors');
        origin = check;
      } else if (ctx.lastFailure) {
        result = ctx.lastFailure;
        origin = `last failed command: ${ctx.lastFailure.command}`;
      } else {
        return { ok: true, output: 'No check command detected and no failed command to analyse. Pass a command (e.g. a build or type-check).' };
      }
    }
    const diags = parseDiagnostics(result.output);
    const errors = diags.filter((d) => d.severity === 'error');
    const header = `${origin}\nexit code ${result.exitCode}${result.timedOut ? ' (timed out)' : ''}; ${errors.length} error(s), ${diags.length - errors.length} warning(s) parsed`;
    const list = diags
      .slice(0, 50)
      .map((d) => `${d.severity.toUpperCase()} ${d.file ?? '?'}${d.line ? `:${d.line}${d.column ? `:${d.column}` : ''}` : ''} ${d.code ? `[${d.code}] ` : ''}${d.message}`)
      .join('\n');
    const raw = diags.length ? '' : `\nRaw output:\n${truncateMiddle(stripAnsi(result.output).trim(), 6000, 'chars')}`;
    return {
      ok: result.exitCode === 0,
      output: `${header}\n${list}${raw}`.trim(),
      data: { exitCode: result.exitCode, diagnostics: diags.slice(0, 50) },
    };
  },
});
