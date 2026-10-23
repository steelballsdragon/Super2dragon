import { watch, type FSWatcher, readFileSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DEFAULT_EXCLUDES, languageOf, listWorkspaceFiles, type FileEntry } from './files.js';
import { detectProject, type ProjectInfo } from './detect.js';
import { extractSymbols, hasSymbolSupport, type CodeSymbol } from './symbols.js';

export interface IndexOptions {
  exclude: string[];
  maxFiles: number;
  maxFileSizeKB: number;
  watch: boolean;
}

/**
 * Repository index: file list (respecting ignore rules), project detection,
 * lazily-built symbol table, keyword relevance ranking, and change watching.
 */
export class RepoIndex extends EventEmitter {
  private filesValue: FileEntry[] = [];
  private projectValue: ProjectInfo | undefined;
  private truncated = false;
  private source: 'git' | 'walk' = 'walk';
  private builtAt = 0;
  private dirty = true;
  private refreshing: Promise<void> | undefined;
  private watcher: FSWatcher | undefined;
  private debounce: NodeJS.Timeout | undefined;
  private readonly symbolCache = new Map<string, { mtimeMs: number; symbols: CodeSymbol[] }>();
  private readonly ignoredTop = new Set(DEFAULT_EXCLUDES);

  constructor(
    readonly root: string,
    private opts: IndexOptions,
  ) {
    super();
  }

  setOptions(opts: IndexOptions): void {
    this.opts = opts;
    this.dirty = true;
  }

  get files(): FileEntry[] {
    return this.filesValue;
  }

  get stats() {
    return { files: this.filesValue.length, truncated: this.truncated, source: this.source, builtAt: this.builtAt, symbolsCached: this.symbolCache.size };
  }

  /** Ensure the index is fresh (rebuilds when files changed since the last build). */
  async ensureFresh(): Promise<void> {
    if (!this.dirty && this.builtAt) return;
    await this.refresh();
  }

  refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      try {
        this.dirty = false;
        const r = await listWorkspaceFiles(this.root, { exclude: this.opts.exclude, maxFiles: this.opts.maxFiles });
        this.filesValue = r.files;
        this.truncated = r.truncated;
        this.source = r.source;
        this.projectValue = detectProject(this.root, r.files);
        this.builtAt = Date.now();
        const live = new Set(r.files.map((f) => f.path));
        for (const k of this.symbolCache.keys()) if (!live.has(k)) this.symbolCache.delete(k);
        this.emit('updated', this.stats);
      } finally {
        this.refreshing = undefined;
      }
    })();
    return this.refreshing;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Last detected project info without waiting for a refresh (for synchronous risk checks). */
  get cachedProject(): ProjectInfo | undefined {
    return this.projectValue;
  }

  /** Look up a package.json script body (used to assess `npm test`, `pnpm build`...). */
  packageScript(name: string): string | undefined {
    try {
      const pkg = JSON.parse(readFileSync(path.join(this.root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
      const v = pkg.scripts?.[name];
      return typeof v === 'string' ? v : undefined;
    } catch {
      return undefined;
    }
  }

  async project(): Promise<ProjectInfo> {
    await this.ensureFresh();
    return this.projectValue!;
  }

  startWatching(): void {
    if (this.watcher || !this.opts.watch) return;
    try {
      this.watcher = watch(this.root, { recursive: true }, (_event, filename) => {
        if (filename) {
          const top = String(filename).split(/[\\/]/)[0];
          if (this.ignoredTop.has(top)) return;
        }
        this.dirty = true;
        if (this.debounce) clearTimeout(this.debounce);
        this.debounce = setTimeout(() => this.emit('changed'), 300);
      });
      this.watcher.on('error', () => this.stopWatching());
    } catch {
      // Recursive watching is unsupported on some platforms/filesystems; freshness then relies on explicit refreshes.
      this.watcher = undefined;
    }
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  /** Render a directory tree (depth-limited) of indexed files. */
  async tree(dir = '.', depth = 3, limit = 400): Promise<{ text: string; shown: number; total: number }> {
    await this.ensureFresh();
    const prefix = dir === '.' || dir === '' ? '' : `${dir.replace(/\/+$/, '')}/`;
    const files = this.filesValue.filter((f) => f.path.startsWith(prefix));
    interface Node {
      dirs: Map<string, Node>;
      files: { name: string; size: number }[];
      count: number;
    }
    const rootNode: Node = { dirs: new Map(), files: [], count: 0 };
    for (const f of files) {
      const parts = f.path.slice(prefix.length).split('/');
      let node = rootNode;
      node.count++;
      for (let i = 0; i < parts.length - 1; i++) {
        let next = node.dirs.get(parts[i]);
        if (!next) {
          next = { dirs: new Map(), files: [], count: 0 };
          node.dirs.set(parts[i], next);
        }
        next.count++;
        node = next;
      }
      node.files.push({ name: parts[parts.length - 1], size: f.size });
    }
    const lines: string[] = [];
    let shown = 0;
    const render = (node: Node, indent: string, level: number) => {
      for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (lines.length >= limit) return;
        if (level >= depth) {
          lines.push(`${indent}${name}/ (${child.count} files)`);
          continue;
        }
        lines.push(`${indent}${name}/`);
        render(child, `${indent}  `, level + 1);
      }
      for (const f of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
        if (lines.length >= limit) return;
        lines.push(`${indent}${f.name}`);
        shown++;
      }
    };
    render(rootNode, '', 0);
    if (lines.length >= limit) lines.push(`... (truncated; ${files.length} files under ${prefix || '.'})`);
    return { text: lines.join('\n'), shown, total: files.length };
  }

  /** Search symbol definitions whose name contains the query (case-insensitive). */
  async findSymbols(query: string, limit = 50, pathPrefix?: string): Promise<CodeSymbol[]> {
    await this.ensureFresh();
    const q = query.toLowerCase();
    const results: { s: CodeSymbol; score: number }[] = [];
    const candidates = this.filesValue.filter(
      (f) => hasSymbolSupport(f.path) && f.size <= this.opts.maxFileSizeKB * 1024 && (!pathPrefix || f.path.startsWith(pathPrefix.replace(/^\.\//, ''))),
    );
    for (const f of candidates.slice(0, 8000)) {
      const symbols = await this.symbolsFor(f);
      for (const s of symbols) {
        const name = s.name.toLowerCase();
        if (!name.includes(q)) continue;
        const score = name === q ? 0 : name.startsWith(q) ? 1 : 2;
        results.push({ s, score });
      }
    }
    results.sort((a, b) => a.score - b.score || a.s.path.localeCompare(b.s.path) || a.s.line - b.s.line);
    return results.slice(0, limit).map((r) => r.s);
  }

  async symbolsFor(f: FileEntry): Promise<CodeSymbol[]> {
    const cached = this.symbolCache.get(f.path);
    if (cached && cached.mtimeMs === f.mtimeMs) return cached.symbols;
    let source: string;
    try {
      source = readFileSync(path.join(this.root, f.path), 'utf8');
    } catch {
      return [];
    }
    const { symbols } = await extractSymbols(source, f.path);
    this.symbolCache.set(f.path, { mtimeMs: f.mtimeMs, symbols });
    return symbols;
  }

  /**
   * Rank files by relevance to free text (task description): identifier and
   * path-term matches. Used to point the model at likely files without
   * sending file contents.
   */
  async relevantFiles(text: string, limit = 8): Promise<string[]> {
    await this.ensureFresh();
    const terms = [...new Set((text.match(/[A-Za-z_][A-Za-z0-9_.-]{2,}/g) ?? []).map((t) => t.toLowerCase()))].filter(
      (t) => !STOPWORDS.has(t),
    );
    if (terms.length === 0) return [];
    const scored: { path: string; score: number }[] = [];
    for (const f of this.filesValue) {
      if (!languageOf(f.path)) continue;
      const p = f.path.toLowerCase();
      const base = path.basename(p);
      let score = 0;
      for (const t of terms) {
        if (base === t || base.startsWith(`${t}.`)) score += 5;
        else if (base.includes(t)) score += 3;
        else if (p.includes(t)) score += 1;
      }
      if (score > 0) scored.push({ path: f.path, score });
    }
    scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
    return scored.slice(0, limit).map((s) => s.path);
  }

  dispose(): void {
    this.stopWatching();
    if (this.debounce) clearTimeout(this.debounce);
  }
}

const STOPWORDS = new Set(
  'the and for with that this from into make add fix run use using then when where what which should would could please file files code test tests create update change write read find all any not but are was were has have had its can will just also more some like need want new old get set app'.split(
    ' ',
  ),
);
