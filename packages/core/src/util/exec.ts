import { spawn } from 'node:child_process';
import { LocalCodeError } from './errors.js';

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Run a program with an argument array (never through a shell), so arguments
 * coming from the model cannot inject shell syntax.
 */
export function execFileText(
  file: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; signal?: AbortSignal; input?: string; maxBytes?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(file, args, {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(new LocalCodeError('not_found', `Failed to start ${file}: ${(err as Error).message}`, { cause: err }));
      return;
    }
    const maxBytes = opts.maxBytes ?? 20 * 1024 * 1024;
    const out: Buffer[] = [];
    const errOut: Buffer[] = [];
    let outLen = 0;
    let errLen = 0;
    let timedOut = false;
    let settled = false;
    child.stdout.on('data', (d: Buffer) => {
      if (outLen < maxBytes) out.push(d);
      outLen += d.length;
    });
    child.stderr.on('data', (d: Buffer) => {
      if (errLen < maxBytes) errOut.push(d);
      errLen += d.length;
    });
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, opts.timeoutMs)
      : undefined;
    const onAbort = () => child.kill('SIGKILL');
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (err.code === 'ENOENT') reject(new LocalCodeError('not_found', `Program not found: ${file}`, { cause: err }));
      else reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) {
        reject(new LocalCodeError('aborted', 'Operation cancelled'));
        return;
      }
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(errOut).toString('utf8'),
        timedOut,
      });
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

/** Resolve whether a program exists on PATH and return its version line. */
export async function probeProgram(file: string, args: string[] = ['--version']): Promise<{ found: boolean; version?: string }> {
  try {
    const r = await execFileText(file, args, { timeoutMs: 8000 });
    const line = (r.stdout || r.stderr).split('\n').find((l) => l.trim()) ?? '';
    return { found: r.code === 0 || line.length > 0, version: line.trim() };
  } catch {
    return { found: false };
  }
}
