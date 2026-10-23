import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { execFileText } from '../util/exec.js';

export const DEFAULT_EXCLUDES = [
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.tox',
  'target',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.gradle',
  '.idea',
  '.cache',
  'coverage',
  '.localcode',
  '.DS_Store',
];

export interface FileEntry {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface ListOptions {
  exclude?: string[];
  maxFiles?: number;
}

function excluder(extra: string[]): Ignore {
  return ignore().add(DEFAULT_EXCLUDES.map((d) => `${d}`)).add(extra);
}

/**
 * List workspace files respecting .gitignore (via git when available) plus
 * default and user-configured exclusions.
 */
export async function listWorkspaceFiles(root: string, opts: ListOptions = {}): Promise<{ files: FileEntry[]; truncated: boolean; source: 'git' | 'walk' }> {
  const maxFiles = opts.maxFiles ?? 50_000;
  const ex = excluder(opts.exclude ?? []);
  let rels: string[] | undefined;
  let source: 'git' | 'walk' = 'walk';
  if (existsSync(path.join(root, '.git'))) {
    try {
      const r = await execFileText('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, timeoutMs: 30_000 });
      if (r.code === 0) {
        rels = r.stdout.split('\0').filter(Boolean);
        source = 'git';
      }
    } catch {
      /* git missing: fall back to walking */
    }
  }
  if (!rels) rels = walk(root, ex, maxFiles * 2);
  const files: FileEntry[] = [];
  let truncated = false;
  for (const rel of rels) {
    if (ex.ignores(rel)) continue;
    let st;
    try {
      st = statSync(path.join(root, rel));
    } catch {
      continue; // deleted but still in the git index
    }
    if (!st.isFile()) continue;
    files.push({ path: rel, size: st.size, mtimeMs: st.mtimeMs });
    if (files.length >= maxFiles) {
      truncated = true;
      break;
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, truncated, source };
}

/** Directory walk honouring nested .gitignore files. */
function walk(root: string, ex: Ignore, limit: number): string[] {
  const out: string[] = [];
  const stack: { dir: string; ig: { base: string; ig: Ignore }[] }[] = [{ dir: '', ig: [] }];
  while (stack.length && out.length < limit) {
    const { dir, ig } = stack.pop()!;
    const absDir = path.join(root, dir);
    let rules = ig;
    const gi = path.join(absDir, '.gitignore');
    if (existsSync(gi)) {
      try {
        rules = [...ig, { base: dir, ig: ignore().add(readFileSync(gi, 'utf8')) }];
      } catch {
        /* unreadable */
      }
    }
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      const relForMatch = e.isDirectory() ? `${rel}/` : rel;
      if (ex.ignores(relForMatch)) continue;
      if (rules.some((r) => {
        const sub = r.base ? relForMatch.slice(r.base.length + 1) : relForMatch;
        return sub && r.ig.ignores(sub);
      })) continue;
      if (e.isDirectory()) stack.push({ dir: rel, ig: rules });
      else if (e.isFile()) out.push(rel);
      if (out.length >= limit) break;
    }
  }
  return out;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', pyi: 'Python', rs: 'Rust', go: 'Go', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala',
  c: 'C', h: 'C', cc: 'C++', cpp: 'C++', cxx: 'C++', hpp: 'C++', hh: 'C++', cs: 'C#', fs: 'F#', swift: 'Swift', m: 'Objective-C',
  rb: 'Ruby', php: 'PHP', lua: 'Lua', dart: 'Dart', ex: 'Elixir', exs: 'Elixir', erl: 'Erlang', hs: 'Haskell', ml: 'OCaml',
  clj: 'Clojure', r: 'R', jl: 'Julia', zig: 'Zig', nim: 'Nim', sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less', vue: 'Vue', svelte: 'Svelte', astro: 'Astro',
  sql: 'SQL', graphql: 'GraphQL', gql: 'GraphQL', proto: 'Protobuf', md: 'Markdown', mdx: 'Markdown', json: 'JSON',
  yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML', gd: 'GDScript', glsl: 'GLSL', wgsl: 'WGSL', sol: 'Solidity',
};

export function languageOf(file: string): string | undefined {
  const base = path.basename(file).toLowerCase();
  if (base === 'dockerfile') return 'Dockerfile';
  if (base === 'makefile') return 'Makefile';
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '';
  return LANGUAGE_BY_EXT[ext];
}

export const NON_CODE_LANGUAGES = new Set(['Markdown', 'JSON', 'YAML', 'TOML', 'XML']);
