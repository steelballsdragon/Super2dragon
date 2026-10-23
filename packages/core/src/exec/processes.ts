import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { newId } from '../util/ids.js';

export interface BackgroundProcessInfo {
  id: string;
  command: string;
  cwd: string;
  pid?: number;
  status: 'running' | 'exited' | 'killed';
  exitCode: number | null;
  startedAt: string;
  endedAt?: string;
}

interface Entry extends BackgroundProcessInfo {
  child: ChildProcess;
  output: string;
  /** Total characters ever produced (output keeps only a tail). */
  produced: number;
}

const MAX_BUFFER = 256 * 1024;

/**
 * Long-running processes such as development servers and watchers. They run
 * outside the persistent shell so they do not block it, keep a ring buffer of
 * output, and are all terminated when the session ends.
 */
export class ProcessManager {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly opts: { env: NodeJS.ProcessEnv; onOutput?: (id: string, chunk: string) => void }) {}

  start(command: string, cwd: string): BackgroundProcessInfo {
    const isWin = process.platform === 'win32';
    const shell = isWin ? 'powershell.exe' : existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    const args = isWin ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
    const child = spawn(shell, args, {
      cwd,
      env: { ...this.opts.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', BROWSER: 'none' },
      detached: !isWin,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const entry: Entry = {
      id: newId('proc_'),
      command,
      cwd,
      pid: child.pid,
      status: 'running',
      exitCode: null,
      startedAt: new Date().toISOString(),
      child,
      output: '',
      produced: 0,
    };
    const onData = (d: Buffer) => {
      const t = d.toString('utf8');
      entry.output = (entry.output + t).slice(-MAX_BUFFER);
      entry.produced += t.length;
      this.opts.onOutput?.(entry.id, t);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', (code) => {
      if (entry.status === 'running') entry.status = 'exited';
      entry.exitCode = code;
      entry.endedAt = new Date().toISOString();
    });
    child.on('error', (err) => {
      entry.output += `\n[failed to start: ${err.message}]`;
      entry.status = 'exited';
      entry.endedAt = new Date().toISOString();
    });
    this.entries.set(entry.id, entry);
    return this.info(entry);
  }

  private info(e: Entry): BackgroundProcessInfo {
    const { child: _c, output: _o, produced: _p, ...rest } = e;
    return { ...rest };
  }

  list(): BackgroundProcessInfo[] {
    return [...this.entries.values()].map((e) => this.info(e));
  }

  output(id: string, tailChars = 8000): { info: BackgroundProcessInfo; output: string } | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    return { info: this.info(e), output: e.output.slice(-tailChars) };
  }

  stop(id: string): BackgroundProcessInfo | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    if (e.status === 'running') {
      e.status = 'killed';
      this.kill(e);
    }
    return this.info(e);
  }

  private kill(e: Entry) {
    const pid = e.child.pid;
    if (!pid) return;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
      return;
    }
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      /* gone */
    }
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }, 2000).unref();
  }

  disposeAll(): void {
    for (const e of this.entries.values()) if (e.status === 'running') this.kill(e);
  }
}
