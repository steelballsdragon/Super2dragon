import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FileChange } from '../engine/types.js';
import { LocalCodeError } from '../util/errors.js';
import { execFileText } from '../util/exec.js';
import { Mutex } from '../util/async.js';

const DEFAULT_EXCLUDES = [
  'node_modules/',
  '.venv/',
  'venv/',
  '__pycache__/',
  '.mypy_cache/',
  '.pytest_cache/',
  'target/',
  '.next/',
  '.nuxt/',
  '.turbo/',
  '.gradle/',
  '.cache/',
  '.localcode/',
  '*.log',
  '.DS_Store',
];

/**
 * Workspace snapshots stored in a separate ("shadow") git repository inside
 * the LocalCode data directory. Using git's object store gives cheap, deduped
 * snapshots that also capture changes made by shell commands, and never
 * touches the user's own repository, index, branches or stash.
 */
export class ShadowGit {
  readonly gitDir: string;
  private readonly mutex = new Mutex();
  private initialized = false;

  constructor(
    readonly workTree: string,
    dataDir: string,
  ) {
    const hash = createHash('sha256').update(workTree).digest('hex').slice(0, 16);
    this.gitDir = path.join(dataDir, 'checkpoints', `${path.basename(workTree).replace(/[^\w.-]/g, '_')}-${hash}.git`);
  }

  private async git(args: string[], opts: { input?: string; allowFail?: boolean; timeoutMs?: number } = {}): Promise<string> {
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
    const r = await execFileText(
      'git',
      [
        `--git-dir=${this.gitDir}`,
        `--work-tree=${this.workTree}`,
        '-c', 'core.hooksPath=/dev/null',
        '-c', 'commit.gpgsign=false',
        '-c', 'core.autocrlf=false',
        '-c', 'core.quotepath=off',
        '-c', 'user.name=LocalCode',
        '-c', 'user.email=checkpoints@localcode.local',
        ...args,
      ],
      { cwd: this.workTree, env, input: opts.input, timeoutMs: opts.timeoutMs ?? 120_000 },
    );
    if (r.code !== 0 && !opts.allowFail) {
      throw new LocalCodeError('internal', `Checkpoint git ${args[0]} failed: ${(r.stderr || r.stdout).trim().slice(0, 500)}`);
    }
    return r.stdout;
  }

  private async gitCode(args: string[]): Promise<number | null> {
    const r = await execFileText('git', [`--git-dir=${this.gitDir}`, `--work-tree=${this.workTree}`, ...args], { cwd: this.workTree });
    return r.code;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!existsSync(path.join(this.gitDir, 'HEAD'))) {
      mkdirSync(this.gitDir, { recursive: true });
      await this.git(['init', '-q']);
      await this.git(['config', 'gc.auto', '0']);
      await this.git(['config', 'core.bigFileThreshold', '20m']);
    }
    mkdirSync(path.join(this.gitDir, 'info'), { recursive: true });
    writeFileSync(path.join(this.gitDir, 'info', 'exclude'), `${DEFAULT_EXCLUDES.join('\n')}\n`);
    this.initialized = true;
  }

  /**
   * Snapshot the whole workspace (respecting .gitignore and default excludes).
   * Returns the commit hash; if nothing changed since the previous snapshot,
   * the previous hash is returned.
   */
  snapshot(label: string): Promise<string> {
    return this.mutex.run(async () => {
      await this.init();
      await this.git(['add', '-A', '--ignore-errors', '.'], { allowFail: true, timeoutMs: 300_000 });
      const head = (await this.git(['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true })).trim();
      if (head && (await this.gitCode(['diff', '--cached', '--quiet', 'HEAD'])) === 0) return head;
      await this.git(['commit', '-q', '--allow-empty', '--no-verify', '-m', label.slice(0, 200)]);
      return (await this.git(['rev-parse', 'HEAD'])).trim();
    });
  }

  /** Files that differ between a checkpoint and another checkpoint (or the current working tree). */
  async changes(from: string, to?: string): Promise<FileChange[]> {
    await this.init();
    const target = to ?? (await this.snapshot('working tree'));
    const nameStatus = await this.git(['diff', '--name-status', '-M', '-z', from, target]);
    const numstat = await this.git(['diff', '--numstat', '-M', '-z', from, target]);
    const counts = new Map<string, { add: number; del: number }>();
    const ns = numstat.split('\0');
    for (let i = 0; i < ns.length; i++) {
      const entry = ns[i];
      if (!entry) continue;
      const m = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(entry);
      if (!m) continue;
      let file = m[3];
      if (file === '') {
        // Rename: next two entries are old and new path.
        i += 2;
        file = ns[i];
      }
      counts.set(file, { add: m[1] === '-' ? 0 : Number(m[1]), del: m[2] === '-' ? 0 : Number(m[2]) });
    }
    const parts = nameStatus.split('\0').filter((p) => p !== '');
    const out: FileChange[] = [];
    for (let i = 0; i < parts.length; i++) {
      const code = parts[i];
      if (code.startsWith('R')) {
        const oldPath = parts[++i];
        const newPath = parts[++i];
        const c = counts.get(newPath) ?? { add: 0, del: 0 };
        out.push({ path: newPath, oldPath, status: 'renamed', additions: c.add, deletions: c.del });
        continue;
      }
      const file = parts[++i];
      const c = counts.get(file) ?? { add: 0, del: 0 };
      const status = code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified';
      out.push({ path: file, status, additions: c.add, deletions: c.del });
    }
    return out;
  }

  /** Unified diff between a checkpoint and the working tree (or another checkpoint). */
  async diff(from: string, to?: string, paths: string[] = []): Promise<string> {
    const target = to ?? (await this.snapshot('working tree'));
    return this.git(['diff', '-M', from, target, '--', ...paths]);
  }

  /** File content at a checkpoint, or undefined if it did not exist there. */
  async fileAt(commit: string, rel: string): Promise<string | undefined> {
    await this.init();
    const r = await execFileText('git', [`--git-dir=${this.gitDir}`, 'show', `${commit}:${rel}`], { cwd: this.workTree });
    return r.code === 0 ? r.stdout : undefined;
  }

  /**
   * Restore the working tree (or selected paths) to a checkpoint. The current
   * state is snapshotted first so the restore itself can be undone.
   */
  async restore(commit: string, paths?: string[]): Promise<{ restored: string[]; removed: string[]; safetyCheckpoint: string }> {
    const safety = await this.snapshot('before restore');
    return this.mutex.run(async () => {
      const changed = await this.git(['diff', '--name-status', '-z', '--no-renames', commit, safety, '--', ...(paths ?? [])]);
      const parts = changed.split('\0').filter(Boolean);
      const restore: string[] = [];
      const remove: string[] = [];
      for (let i = 0; i < parts.length; i += 2) {
        const code = parts[i];
        const file = parts[i + 1];
        if (code === 'A') remove.push(file);
        else restore.push(file);
      }
      if (restore.length) {
        // Feed paths through stdin to avoid argument length limits.
        await this.git(['checkout', commit, '--pathspec-from-file=-', '--pathspec-file-nul'], { input: restore.join('\0') });
      }
      for (const f of remove) {
        const abs = path.join(this.workTree, f);
        rmSync(abs, { force: true });
      }
      // Re-sync the shadow index with the restored tree.
      await this.git(['add', '-A', '--ignore-errors', '.'], { allowFail: true, timeoutMs: 300_000 });
      return { restored: restore, removed: remove, safetyCheckpoint: safety };
    });
  }
}
