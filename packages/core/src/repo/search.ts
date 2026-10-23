import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Store } from '../storage/store.js';
import type { ModelProvider } from '../models/types.js';
import { LocalCodeError } from '../util/errors.js';
import { execFileText, probeProgram } from '../util/exec.js';
import { isProbablyBinary } from '../util/text.js';
import { DEFAULT_EXCLUDES, NON_CODE_LANGUAGES, languageOf } from './files.js';
import type { RepoIndex } from './index.js';

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
  context?: { line: number; text: string }[];
}

export interface TextSearchOptions {
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  glob?: string;
  path?: string;
  maxResults?: number;
  contextLines?: number;
  signal?: AbortSignal;
}

let rgAvailable: Promise<boolean> | undefined;
export function ripgrepAvailable(): Promise<boolean> {
  rgAvailable ??= probeProgram('rg', ['--version']).then((r) => r.found);
  return rgAvailable;
}

function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end > i) {
        re += `(${glob.slice(i + 1, end).split(',').map((p) => p.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
        i = end;
      } else re += '\\{';
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(glob.includes('/') ? `^${re}$` : `(^|/)${re}$`);
}

/**
 * Code search over the workspace: ripgrep when installed (fast, respects
 * .gitignore), otherwise a built-in scanner over the repository index. Optional
 * semantic search uses a local embedding model.
 */
export class CodeSearch {
  readonly embeddings: EmbeddingIndex;

  constructor(
    private readonly root: string,
    private readonly index: RepoIndex,
    private readonly getExcludes: () => string[],
    store: Store,
    workspaceId: string,
  ) {
    this.embeddings = new EmbeddingIndex(root, index, store, workspaceId);
  }

  async text(opts: TextSearchOptions): Promise<{ matches: SearchMatch[]; truncated: boolean; engine: 'ripgrep' | 'builtin' }> {
    const max = Math.min(opts.maxResults ?? 50, 500);
    if (await ripgrepAvailable()) {
      try {
        return { ...(await this.rg(opts, max)), engine: 'ripgrep' };
      } catch (err) {
        if (err instanceof LocalCodeError && err.code === 'invalid_argument') throw err;
        /* fall through to builtin */
      }
    }
    return { ...(await this.builtin(opts, max)), engine: 'builtin' };
  }

  private async rg(opts: TextSearchOptions, max: number) {
    const args = ['--json', '--no-require-git', '--hidden', '--max-columns=400', '--max-columns-preview', '--max-filesize=2M', '--max-count=30'];
    for (const ex of [...DEFAULT_EXCLUDES, ...this.getExcludes()]) args.push('-g', `!${ex.replace(/\/$/, '')}`);
    if (!opts.regex) args.push('--fixed-strings');
    args.push(opts.caseSensitive ? '--case-sensitive' : '--ignore-case');
    if (opts.glob) args.push('-g', opts.glob);
    if (opts.contextLines) args.push('-C', String(Math.min(opts.contextLines, 10)));
    // `-e` + `--` keep the pattern and path from being interpreted as flags.
    args.push('-e', opts.query, '--', opts.path ?? '.');
    const r = await execFileText('rg', args, { cwd: this.root, timeoutMs: 30_000, signal: opts.signal, maxBytes: 8 * 1024 * 1024 });
    if (r.code === 2 && /regex parse error|error parsing/i.test(r.stderr)) {
      throw new LocalCodeError('invalid_argument', `Invalid regular expression: ${r.stderr.split('\n').slice(0, 6).join('\n')}`);
    }
    if (r.code !== 0 && r.code !== 1) throw new LocalCodeError('internal', `ripgrep failed: ${r.stderr.slice(0, 300)}`);
    const matches: SearchMatch[] = [];
    let pendingContext: { line: number; text: string }[] = [];
    let truncated = false;
    for (const line of r.stdout.split('\n')) {
      if (!line) continue;
      let ev: { type: string; data: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } };
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === 'begin') pendingContext = [];
      if (ev.type !== 'match' && ev.type !== 'context') continue;
      const p = (ev.data.path?.text ?? '').replace(/^\.\//, '');
      const text = (ev.data.lines?.text ?? '').replace(/\r?\n$/, '');
      const ln = ev.data.line_number ?? 0;
      if (ev.type === 'context') {
        const last = matches[matches.length - 1];
        if (last && last.path === p && ln > last.line && ln <= last.line + (opts.contextLines ?? 0)) (last.context ??= []).push({ line: ln, text });
        else pendingContext.push({ line: ln, text });
        continue;
      }
      if (matches.length >= max) {
        truncated = true;
        break;
      }
      matches.push({ path: p, line: ln, text, ...(pendingContext.length ? { context: pendingContext } : {}) });
      pendingContext = [];
    }
    return { matches, truncated };
  }

  private async builtin(opts: TextSearchOptions, max: number) {
    await this.index.ensureFresh();
    let re: RegExp;
    try {
      re = opts.regex
        ? new RegExp(opts.query, opts.caseSensitive ? '' : 'i')
        : new RegExp(opts.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.caseSensitive ? '' : 'i');
    } catch (err) {
      throw new LocalCodeError('invalid_argument', `Invalid regular expression: ${(err as Error).message}`);
    }
    const globRe = opts.glob ? globToRegExp(opts.glob) : undefined;
    const prefix = opts.path && opts.path !== '.' ? opts.path.replace(/^\.\//, '').replace(/\/+$/, '') : '';
    const matches: SearchMatch[] = [];
    let truncated = false;
    for (const f of this.index.files) {
      if (opts.signal?.aborted) break;
      if (prefix && f.path !== prefix && !f.path.startsWith(`${prefix}/`)) continue;
      if (globRe && !globRe.test(f.path)) continue;
      if (f.size > 2 * 1024 * 1024) continue;
      let buf: Buffer;
      try {
        buf = readFileSync(path.join(this.root, f.path));
      } catch {
        continue;
      }
      if (isProbablyBinary(buf)) continue;
      const lines = buf.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) continue;
        if (matches.length >= max) {
          truncated = true;
          break;
        }
        const c = opts.contextLines ?? 0;
        const context = c
          ? lines
              .slice(Math.max(0, i - c), i + c + 1)
              .map((t, j) => ({ line: Math.max(0, i - c) + j + 1, text: t }))
              .filter((x) => x.line !== i + 1)
          : undefined;
        matches.push({ path: f.path, line: i + 1, text: lines[i].slice(0, 400), ...(context ? { context } : {}) });
      }
      if (truncated) break;
    }
    return { matches, truncated };
  }

  /** Files whose path matches the query (fuzzy subsequence on the path). */
  async files(query: string, max = 50): Promise<string[]> {
    await this.index.ensureFresh();
    const q = query.toLowerCase();
    const scored: { p: string; s: number }[] = [];
    for (const f of this.index.files) {
      const p = f.path.toLowerCase();
      const base = path.basename(p);
      let s = -1;
      if (base === q) s = 0;
      else if (base.startsWith(q)) s = 1;
      else if (p.includes(q)) s = 2;
      else {
        let j = 0;
        for (const ch of p) if (ch === q[j]) j++;
        if (j === q.length) s = 3;
      }
      if (s >= 0) scored.push({ p: f.path, s });
    }
    scored.sort((a, b) => a.s - b.s || a.p.length - b.p.length);
    return scored.slice(0, max).map((x) => x.p);
  }
}

// ---------------------------------------------------------------------------
// Optional semantic search with a local embedding model.
// ---------------------------------------------------------------------------

const CHUNK_LINES = 40;
const CHUNK_OVERLAP = 8;
const MAX_EMBED_FILES = 3000;

function toBlob(v: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(v).buffer);
}

function fromBlob(b: Uint8Array): Float32Array {
  const copy = new Uint8Array(b);
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export class EmbeddingIndex {
  private provider: ModelProvider | undefined;
  private model: string | undefined;

  constructor(
    private readonly root: string,
    private readonly index: RepoIndex,
    private readonly store: Store,
    private readonly workspaceId: string,
  ) {}

  configure(provider: ModelProvider | undefined, model: string | undefined): void {
    this.provider = provider;
    this.model = model;
  }

  get configured(): boolean {
    return !!(this.provider?.embed && this.model);
  }

  /** Embed new or changed files. Returns counts for progress reporting. */
  async update(signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<{ embedded: number; chunks: number }> {
    if (!this.provider?.embed || !this.model) throw new LocalCodeError('unsupported', 'No embedding model configured');
    await this.index.ensureFresh();
    const db = this.store.db;
    const existing = new Map<string, number>();
    for (const r of db.prepare(`SELECT path, MAX(mtime_ms) AS m FROM embeddings WHERE workspace_id = ? AND model = ? GROUP BY path`).all(this.workspaceId, this.model) as {
      path: string;
      m: number;
    }[]) {
      existing.set(r.path, r.m);
    }
    const files = this.index.files.filter((f) => {
      const lang = languageOf(f.path);
      return lang && (!NON_CODE_LANGUAGES.has(lang) || lang === 'Markdown') && f.size < 256 * 1024;
    });
    const live = new Set(files.map((f) => f.path));
    for (const p of existing.keys()) {
      if (!live.has(p)) db.prepare(`DELETE FROM embeddings WHERE workspace_id = ? AND model = ? AND path = ?`).run(this.workspaceId, this.model, p);
    }
    const todo = files.filter((f) => existing.get(f.path) !== f.mtimeMs).slice(0, MAX_EMBED_FILES);
    let chunks = 0;
    for (let i = 0; i < todo.length; i++) {
      if (signal?.aborted) break;
      const f = todo[i];
      let text: string;
      try {
        text = readFileSync(path.join(this.root, f.path), 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      const pieces: { start: number; end: number; text: string }[] = [];
      for (let s = 0; s < lines.length; s += CHUNK_LINES - CHUNK_OVERLAP) {
        const e = Math.min(lines.length, s + CHUNK_LINES);
        const body = lines.slice(s, e).join('\n');
        if (body.trim()) pieces.push({ start: s + 1, end: e, text: `${f.path}\n${body}`.slice(0, 6000) });
        if (e >= lines.length) break;
      }
      if (!pieces.length) continue;
      const vectors = await this.provider.embed(this.model, pieces.map((p) => p.text), signal);
      db.prepare(`DELETE FROM embeddings WHERE workspace_id = ? AND model = ? AND path = ?`).run(this.workspaceId, this.model, f.path);
      const ins = db.prepare(
        `INSERT INTO embeddings (workspace_id, model, path, chunk, start_line, end_line, mtime_ms, vector) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      pieces.forEach((p, idx) => ins.run(this.workspaceId, this.model!, f.path, idx, p.start, p.end, f.mtimeMs, toBlob(vectors[idx])));
      chunks += pieces.length;
      onProgress?.(i + 1, todo.length);
    }
    return { embedded: todo.length, chunks };
  }

  async query(text: string, k = 8, signal?: AbortSignal): Promise<{ path: string; startLine: number; endLine: number; score: number }[]> {
    if (!this.provider?.embed || !this.model) throw new LocalCodeError('unsupported', 'No embedding model configured');
    await this.update(signal);
    const [q] = await this.provider.embed(this.model, [text], signal);
    const qv = new Float32Array(q);
    const rows = this.store.db
      .prepare(`SELECT path, start_line, end_line, vector FROM embeddings WHERE workspace_id = ? AND model = ?`)
      .all(this.workspaceId, this.model) as { path: string; start_line: number; end_line: number; vector: Uint8Array }[];
    return rows
      .map((r) => ({ path: r.path, startLine: r.start_line, endLine: r.end_line, score: cosine(qv, fromBlob(r.vector)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
