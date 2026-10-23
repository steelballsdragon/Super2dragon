import readline from 'node:readline';
import type { ApprovalRequest, ApprovalResponse, EngineEvent, TaskReport } from '@localcode/core';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);
export const c = {
  dim: wrap('2'),
  bold: wrap('1'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
};

function firstLines(text: string, n: number, width = 160): string {
  const lines = text.split('\n');
  const shown = lines.slice(0, n).map((l) => (l.length > width ? `${l.slice(0, width)}…` : l));
  if (lines.length > n) shown.push(c.gray(`… (${lines.length - n} more lines)`));
  return shown.join('\n');
}

/** Streams agent events to the terminal in a compact, readable form. */
export class TerminalRenderer {
  private atLineStart = true;
  private streamingText = false;
  private streamingThinking = false;
  private toolStreamed = new Set<string>();

  constructor(private readonly opts: { verbose?: boolean; showThinking?: boolean } = {}) {}

  private write(s: string) {
    if (!s) return;
    process.stdout.write(s);
    this.atLineStart = s.endsWith('\n');
  }

  private line(s = '') {
    if (!this.atLineStart) this.write('\n');
    this.write(`${s}\n`);
  }

  private endStreams() {
    if (this.streamingText || this.streamingThinking) {
      this.streamingText = this.streamingThinking = false;
      if (!this.atLineStart) this.write('\n');
    }
  }

  handle(e: EngineEvent): void {
    switch (e.type) {
      case 'task.started':
        this.line(c.gray(`${e.resumed ? 'Resuming' : 'Starting'} task ${e.taskId}`));
        break;
      case 'model.call':
        if (this.opts.verbose) this.line(c.gray(`· step ${e.step}: ${e.model} (${e.mode} tools, ~${e.estimatedPromptTokens} prompt tokens)`));
        break;
      case 'model.result':
        if (this.opts.verbose) {
          const u = e.usage;
          this.endStreams();
          this.line(
            c.gray(
              `· ${u.completionTokens ?? '?'} tokens${u.evalTokensPerSec ? ` @ ${u.evalTokensPerSec.toFixed(1)} tok/s` : ''}${u.timeToFirstTokenMs ? `, first token ${(u.timeToFirstTokenMs / 1000).toFixed(1)}s` : ''}${e.salvaged ? ', tool call recovered from text' : ''}`,
            ),
          );
        }
        break;
      case 'assistant.delta':
        if (e.channel === 'thinking') {
          if (!this.opts.showThinking) break;
          if (!this.streamingThinking) {
            this.endStreams();
            this.streamingThinking = true;
          }
          this.write(c.gray(e.text));
        } else {
          if (!this.streamingText) {
            this.endStreams();
            this.streamingText = true;
          }
          this.write(e.text);
        }
        break;
      case 'assistant.message':
        this.endStreams();
        break;
      case 'tool.start':
        this.endStreams();
        this.line(`${c.cyan('●')} ${c.bold(e.tool)} ${c.dim(e.summary.replace(new RegExp(`^${e.tool}\\s*`), ''))}`);
        break;
      case 'tool.output':
        if (!this.toolStreamed.has(e.callId)) this.toolStreamed.add(e.callId);
        this.write(c.gray(e.chunk));
        break;
      case 'tool.end': {
        this.endStreams();
        const streamed = this.toolStreamed.has(e.callId);
        if (streamed && !this.atLineStart) this.write('\n');
        const mark = e.ok ? c.green('  ✓') : c.red('  ✗');
        const body = streamed ? e.output.split('\n').slice(0, 2).join(' ').slice(0, 160) : firstLines(e.output, this.opts.verbose ? 30 : 6);
        this.line(`${mark} ${c.gray(`(${(e.durationMs / 1000).toFixed(1)}s)`)} ${e.ok ? c.dim(body) : c.red(body)}`.replace(/\n/g, '\n    '));
        break;
      }
      case 'plan.update':
        this.endStreams();
        this.line(c.magenta('Plan:'));
        for (const p of e.plan) {
          const mark = p.status === 'done' ? c.green('[x]') : p.status === 'in_progress' ? c.yellow('[~]') : p.status === 'blocked' ? c.red('[!]') : '[ ]';
          this.line(`  ${mark} ${p.title}${p.acceptance ? c.gray(` — ${p.acceptance}`) : ''}`);
        }
        break;
      case 'checkpoint.created':
        if (this.opts.verbose) this.line(c.gray(`· checkpoint ${e.checkpoint.commitHash.slice(0, 8)} ${e.checkpoint.label}`));
        break;
      case 'context.summarized':
        this.line(c.gray('· older conversation summarized to fit the context window'));
        break;
      case 'log':
        this.line(e.level === 'warn' ? c.yellow(`! ${e.message}`) : e.level === 'error' ? c.red(`✗ ${e.message}`) : c.gray(e.message));
        break;
      case 'task.status':
        if (e.status === 'failed' && e.error) this.line(c.red(`Task failed: ${e.error}`));
        break;
      case 'pull.progress': {
        const p = e.progress;
        const pct = p.total ? ` ${((100 * (p.completed ?? 0)) / p.total).toFixed(0)}%` : '';
        if (process.stdout.isTTY) process.stdout.write(`\r${c.gray(`${p.status}${pct}`)}\u001b[K`);
        else if (!p.total) this.line(p.status);
        break;
      }
      default:
        break;
    }
  }

  report(r: TaskReport, error?: string, taskId?: string): void {
    this.endStreams();
    this.line();
    const color = r.status === 'completed' ? c.green : r.status === 'cancelled' ? c.yellow : c.red;
    this.line(color(c.bold(`■ Task ${r.status}`)) + c.gray(`  ${r.steps} model calls, ${(r.durationMs / 1000).toFixed(0)}s, ${r.usage.completionTokens} tokens generated`));
    if (error) this.line(c.red(`  ${error}`));
    if (r.filesChanged.length) {
      this.line(c.bold('  Files changed:'));
      for (const f of r.filesChanged) this.line(`    ${f.status.padEnd(8)} ${f.path} ${c.green(`+${f.additions}`)} ${c.red(`-${f.deletions}`)}`);
    } else this.line(c.gray('  No files changed.'));
    if (r.commands.length) {
      this.line(c.bold('  Commands (actual exit codes):'));
      for (const cmd of r.commands.slice(-10)) {
        const code = cmd.timedOut ? c.red('timeout') : cmd.exitCode === 0 ? c.green('0') : cmd.exitCode === null ? c.gray('bg') : c.red(String(cmd.exitCode));
        this.line(`    [${code}] ${cmd.command.slice(0, 120)}`);
      }
    }
    for (const t of r.tests) {
      this.line(`  Tests: ${t.ok ? c.green('passed') : c.red('failed')} ${c.gray(`${t.passed ?? '?'} passed, ${t.failed ?? '?'} failed — ${t.command}`)}`);
    }
    for (const w of r.warnings) this.line(c.yellow(`  ! ${w}`));
    if (r.checkpointBefore && r.filesChanged.length) this.line(c.gray(`  Undo with: localcode undo --task ${taskId ?? '<task-id>'}`));
  }
}

/** Interactive approval prompt on the terminal. */
export function terminalApprovals(opts: { autoApprove?: boolean }): (req: ApprovalRequest, signal: AbortSignal) => Promise<ApprovalResponse> {
  return async (req, signal) => {
    const riskColor = ['destructive', 'privileged'].includes(req.risk) ? c.red : req.risk === 'network' ? c.yellow : c.cyan;
    process.stdout.write(`\n${riskColor(c.bold(`⚠ Approval needed (${req.risk})`))}: ${req.summary}\n`);
    process.stdout.write(c.gray(`  ${req.decisionReason}${req.reasons.length ? ` — ${req.reasons.join('; ')}` : ''}\n`));
    if (req.tool === 'write_file' || req.tool === 'edit_file') {
      const preview = JSON.stringify(req.args).slice(0, 400);
      process.stdout.write(c.gray(`  ${preview}\n`));
    }
    if (opts.autoApprove) {
      process.stdout.write(c.yellow('  auto-approved (--yes)\n'));
      return { answer: 'allow_once' };
    }
    if (!process.stdin.isTTY) {
      process.stdout.write(c.red('  denied (no interactive terminal; use --yes to approve automatically)\n'));
      return { answer: 'deny', message: 'Not approved: running non-interactively.' };
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) =>
      new Promise<string>((resolve, reject) => {
        const onAbort = () => {
          rl.close();
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        rl.question(q, (a) => {
          signal.removeEventListener('abort', onAbort);
          resolve(a);
        });
      });
    try {
      const keyHint = req.ruleKey ? ` / [a]lways allow "${req.ruleKey}"` : ' / [a]lways';
      const a = (await ask(`  Allow? [y]es / [n]o${keyHint} / or type instructions to deny with guidance: `)).trim();
      if (/^(y|yes)$/i.test(a)) return { answer: 'allow_once' };
      if (/^(a|always)$/i.test(a)) return { answer: 'allow_always' };
      if (/^(n|no|)$/i.test(a)) return { answer: 'deny' };
      return { answer: 'deny', message: a };
    } finally {
      rl.close();
    }
  };
}
