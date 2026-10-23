import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Mutex } from '../util/async.js';
import { LocalCodeError } from '../util/errors.js';
import { execFileText } from '../util/exec.js';
import { nonce } from '../util/ids.js';

export interface CommandResult {
  command: string;
  exitCode: number | null;
  /** Interleaved stdout+stderr in arrival order. */
  output: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  /** Working directory after the command finished. */
  cwd: string;
  /** True if the output exceeded the capture limit and was cut. */
  truncated: boolean;
}

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  cwd?: string;
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}

const MAX_CAPTURE = 4 * 1024 * 1024;

function findBash(): string | null {
  for (const p of ['/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash', '/opt/homebrew/bin/bash']) if (existsSync(p)) return p;
  return null;
}

function quoteSh(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * A persistent, managed shell. On Unix a single bash process keeps state
 * (cwd, exported variables, activated virtualenvs) between commands; each
 * command's completion and exit code are detected with a random sentinel.
 * Timeouts and cancellation kill the whole process group, after which the
 * shell is transparently restarted in the last known working directory.
 *
 * On Windows (or without bash) commands run one at a time through PowerShell
 * with the working directory carried over between commands.
 */
export class PersistentShell {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private readonly mutex = new Mutex();
  private cwdValue: string;
  private readonly bash: string | null;
  private disposed = false;

  constructor(
    private readonly opts: { cwd: string; env: NodeJS.ProcessEnv; root: string },
  ) {
    this.cwdValue = opts.cwd;
    this.bash = process.platform === 'win32' ? null : findBash() ?? (existsSync('/bin/sh') ? '/bin/sh' : null);
  }

  get cwd(): string {
    return this.cwdValue;
  }

  get kind(): 'bash' | 'sh' | 'powershell' {
    if (!this.bash) return 'powershell';
    return this.bash.endsWith('bash') ? 'bash' : 'sh';
  }

  run(command: string, opts: RunOptions = {}): Promise<CommandResult> {
    if (this.disposed) return Promise.reject(new LocalCodeError('internal', 'Shell has been disposed'));
    return this.mutex.run(() => (this.bash ? this.runUnix(command, opts) : this.runWindows(command, opts)));
  }

  private ensureProc(): ChildProcessWithoutNullStreams {
    if (this.proc && this.proc.exitCode === null && !this.proc.killed) return this.proc;
    const cwd = existsSync(this.cwdValue) ? this.cwdValue : this.opts.root;
    this.cwdValue = cwd;
    const args = this.bash!.endsWith('bash') ? ['--noprofile', '--norc'] : [];
    const proc = spawn(this.bash!, args, {
      cwd,
      env: { ...this.opts.env, PS1: '', PS2: '', TERM: 'dumb', NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', GIT_TERMINAL_PROMPT: '0', PAGER: 'cat', GIT_PAGER: 'cat' },
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.on('error', () => {
      /* surfaced through exit handling */
    });
    this.proc = proc;
    return proc;
  }

  private killGroup(proc: ChildProcessWithoutNullStreams) {
    const pid = proc.pid;
    if (!pid) return;
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }, 1500).unref();
  }

  private async runUnix(command: string, opts: RunOptions): Promise<CommandResult> {
    const started = Date.now();
    // Reject syntax errors up front: an unterminated quote would otherwise swallow the sentinel.
    if (this.bash!.endsWith('bash')) {
      const check = await execFileText(this.bash!, ['-n', '-c', command], { timeoutMs: 5000 });
      if (check.code !== 0) {
        const msg = (check.stderr || check.stdout).replace(/^.*?-c: /gm, '').trim();
        return {
          command,
          exitCode: 2,
          output: `Shell syntax error: ${msg}`,
          stdout: '',
          stderr: `Shell syntax error: ${msg}`,
          durationMs: Date.now() - started,
          timedOut: false,
          cancelled: false,
          cwd: this.cwdValue,
          truncated: false,
        };
      }
    }
    if (opts.cwd) this.cwdValue = opts.cwd;
    const proc = this.ensureProc();
    const id = nonce(8);
    const endMarker = `__LC_END_${id}__`;
    const errMarker = `__LC_ERR_${id}__`;
    const script =
      `cd -- ${quoteSh(this.cwdValue)} 2>/dev/null || cd -- ${quoteSh(this.opts.root)}\n` +
      `{\n${command}\n} < /dev/null\n` +
      `__lc_ec=$?\nprintf '\\n${endMarker}%s__%s\\n' "$__lc_ec" "$PWD"\nprintf '\\n${errMarker}\\n' >&2\n`;

    return new Promise<CommandResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let combined = '';
      let truncated = false;
      let outDone = false;
      let errDone = false;
      let exitCode: number | null = null;
      let finished = false;
      let timedOut = false;
      let cancelled = false;
      const endRe = new RegExp(`\\n?${endMarker}(\\d+)__(.*)\\n`);
      const errRe = new RegExp(`\\n?${errMarker}\\n`);
      let emittedOut = 0;
      let emittedErr = 0;

      const append = (which: 'stdout' | 'stderr', text: string) => {
        if (combined.length < MAX_CAPTURE) combined += text;
        else truncated = true;
        opts.onOutput?.(which, text);
      };

      const onStdout = (d: Buffer) => {
        stdout += d.toString('utf8');
        const m = endRe.exec(stdout);
        if (m) {
          const visible = stdout.slice(0, m.index);
          if (visible.length > emittedOut) append('stdout', visible.slice(emittedOut));
          emittedOut = visible.length;
          exitCode = Number(m[1]);
          this.cwdValue = m[2] || this.cwdValue;
          stdout = visible;
          outDone = true;
          // If the command closed stderr, the stderr marker never arrives: do not wait forever.
          setTimeout(() => maybeFinish(true), 1500).unref();
          maybeFinish();
          return;
        }
        // Emit everything except the (possibly partial) marker line at the end.
        const markerAt = stdout.indexOf(endMarker, emittedOut);
        const safe = markerAt >= 0 ? Math.max(emittedOut, markerAt - 1) : Math.max(emittedOut, stdout.length - endMarker.length - 1);
        if (safe > emittedOut) {
          append('stdout', stdout.slice(emittedOut, safe));
          emittedOut = safe;
        }
        if (stdout.length > MAX_CAPTURE * 2) {
          // Keep memory bounded for very chatty commands.
          const drop = stdout.length - MAX_CAPTURE;
          stdout = stdout.slice(drop);
          emittedOut = Math.max(0, emittedOut - drop);
          truncated = true;
        }
      };
      const onStderr = (d: Buffer) => {
        stderr += d.toString('utf8');
        const m = errRe.exec(stderr);
        if (m) {
          const visible = stderr.slice(0, m.index);
          if (visible.length > emittedErr) append('stderr', visible.slice(emittedErr));
          emittedErr = visible.length;
          stderr = visible;
          errDone = true;
          maybeFinish();
          return;
        }
        const safe = Math.max(emittedErr, stderr.length - errMarker.length - 2);
        if (safe > emittedErr) {
          append('stderr', stderr.slice(emittedErr, safe));
          emittedErr = safe;
        }
        if (stderr.length > MAX_CAPTURE * 2) {
          const drop = stderr.length - MAX_CAPTURE;
          stderr = stderr.slice(drop);
          emittedErr = Math.max(0, emittedErr - drop);
          truncated = true;
        }
      };
      const onExit = (code: number | null) => {
        // The command called `exit` or the shell was killed.
        if (finished) return;
        exitCode = timedOut || cancelled ? null : code;
        outDone = errDone = true;
        this.proc = null;
        // Let any buffered output drain before resolving.
        setTimeout(() => maybeFinish(true), 100);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        this.killGroup(proc);
      }, opts.timeoutMs ?? 300_000);
      const onAbort = () => {
        cancelled = true;
        this.killGroup(proc);
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
        proc.stdout.off('data', onStdout);
        proc.stderr.off('data', onStderr);
        proc.off('exit', onExit);
      };

      const maybeFinish = (force = false) => {
        if (finished || (!force && !(outDone && errDone))) return;
        finished = true;
        cleanup();
        // Flush anything held back (only non-empty when a marker never arrived).
        if (stdout.length > emittedOut) append('stdout', stdout.slice(emittedOut));
        if (stderr.length > emittedErr) append('stderr', stderr.slice(emittedErr));
        if (timedOut || cancelled) this.proc = null;
        resolve({
          command,
          exitCode,
          output: combined,
          stdout,
          stderr,
          durationMs: Date.now() - started,
          timedOut,
          cancelled,
          cwd: this.cwdValue,
          truncated,
        });
      };

      proc.stdout.on('data', onStdout);
      proc.stderr.on('data', onStderr);
      proc.once('exit', onExit);
      if (opts.signal?.aborted) onAbort();
      else proc.stdin.write(script);
    });
  }

  private async runWindows(command: string, opts: RunOptions): Promise<CommandResult> {
    const started = Date.now();
    if (opts.cwd) this.cwdValue = opts.cwd;
    const id = nonce(8);
    const marker = `__LC_CWD_${id}__`;
    const script = `$ErrorActionPreference='Continue'; Set-Location -LiteralPath '${this.cwdValue.replace(/'/g, "''")}'; ${command}; $__lc=$LASTEXITCODE; if ($__lc -eq $null) { if ($?) { $__lc = 0 } else { $__lc = 1 } }; Write-Output "${marker}$((Get-Location).Path)"; exit $__lc`;
    return new Promise<CommandResult>((resolve) => {
      const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        cwd: this.cwdValue,
        env: { ...this.opts.env, NO_COLOR: '1', CI: '1' },
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let combined = '';
      let timedOut = false;
      let cancelled = false;
      child.stdout.on('data', (d: Buffer) => {
        const t = d.toString('utf8');
        stdout += t;
        if (!t.includes(marker)) {
          combined += t;
          opts.onOutput?.('stdout', t);
        }
      });
      child.stderr.on('data', (d: Buffer) => {
        const t = d.toString('utf8');
        stderr += t;
        combined += t;
        opts.onOutput?.('stderr', t);
      });
      const timer = setTimeout(() => {
        timedOut = true;
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      }, opts.timeoutMs ?? 300_000);
      const onAbort = () => {
        cancelled = true;
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      child.on('close', (code) => {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
        const idx = stdout.lastIndexOf(marker);
        if (idx >= 0) {
          this.cwdValue = stdout.slice(idx + marker.length).split(/\r?\n/)[0].trim() || this.cwdValue;
          stdout = stdout.slice(0, idx);
          combined = combined.replace(new RegExp(`${marker}.*\\r?\\n?`), '');
        }
        resolve({
          command,
          exitCode: timedOut || cancelled ? null : code,
          output: combined,
          stdout,
          stderr,
          durationMs: Date.now() - started,
          timedOut,
          cancelled,
          cwd: this.cwdValue,
          truncated: false,
        });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          command,
          exitCode: null,
          output: `Failed to start PowerShell: ${err.message}`,
          stdout: '',
          stderr: err.message,
          durationMs: Date.now() - started,
          timedOut: false,
          cancelled: false,
          cwd: this.cwdValue,
          truncated: false,
        });
      });
    });
  }

  /** Kill the current shell (if any). The next command starts a fresh one. */
  reset(): void {
    if (this.proc) this.killGroup(this.proc);
    this.proc = null;
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
  }
}
