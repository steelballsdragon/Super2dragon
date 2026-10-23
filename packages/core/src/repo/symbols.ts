import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SymbolKind = 'class' | 'function' | 'method' | 'interface' | 'type' | 'enum' | 'struct' | 'trait' | 'impl' | 'module' | 'constant';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  path: string;
  line: number;
  container?: string;
}

const GRAMMAR_BY_EXT: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  cjs: 'javascript', py: 'python', pyi: 'python', rs: 'rust', go: 'go', java: 'java', cs: 'c-sharp', cpp: 'cpp', cc: 'cpp',
  cxx: 'cpp', hpp: 'cpp', hh: 'cpp', h: 'cpp', c: 'cpp', rb: 'ruby', php: 'php', sh: 'bash', bash: 'bash',
};

const KIND_BY_NODE: Record<string, SymbolKind> = {
  class_declaration: 'class', class_definition: 'class', class_specifier: 'class', abstract_class_declaration: 'class', class: 'class',
  function_declaration: 'function', function_definition: 'function', function_item: 'function', generator_function_declaration: 'function',
  method_definition: 'method', method_declaration: 'method', method: 'method', singleton_method: 'method', constructor_declaration: 'method',
  interface_declaration: 'interface', type_alias_declaration: 'type', type_item: 'type', type_spec: 'type',
  enum_declaration: 'enum', enum_item: 'enum', enum_specifier: 'enum', struct_item: 'struct', struct_specifier: 'struct',
  struct_declaration: 'struct', record_declaration: 'class', trait_item: 'trait', impl_item: 'impl', mod_item: 'module',
  module: 'module', namespace_definition: 'module', internal_module: 'module', namespace_declaration: 'module',
};
const CONTAINER_KINDS = new Set<SymbolKind>(['class', 'interface', 'struct', 'trait', 'impl', 'module', 'enum']);

interface TSNode {
  type: string;
  text: string;
  startPosition: { row: number };
  namedChildCount: number;
  namedChild(i: number): TSNode | null;
  childForFieldName(name: string): TSNode | null;
}

interface TSModule {
  Parser: {
    init(opts?: { locateFile: (file: string) => string }): Promise<void>;
    new (): { setLanguage(l: unknown): void; parse(src: string): { rootNode: TSNode; delete(): void } | null; delete(): void };
  };
  Language: { load(bytes: Uint8Array): Promise<unknown> };
}

function wasmDir(): string | undefined {
  const candidates: string[] = [];
  if (process.env.LOCALCODE_WASM_DIR) candidates.push(process.env.LOCALCODE_WASM_DIR);
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.join(here, 'tree-sitter'), path.join(here, '..', 'tree-sitter'));
  } catch {
    /* not a file URL */
  }
  try {
    const req = createRequire(import.meta.url);
    candidates.push(path.join(path.dirname(req.resolve('@vscode/tree-sitter-wasm/package.json')), 'wasm'));
  } catch {
    /* package not resolvable (bundled build) */
  }
  return candidates.find((d) => existsSync(path.join(d, 'tree-sitter.wasm')));
}

let runtime: Promise<TSModule | null> | undefined;
const languages = new Map<string, Promise<unknown | null>>();

async function loadRuntime(): Promise<TSModule | null> {
  runtime ??= (async () => {
    const dir = wasmDir();
    if (!dir) return null;
    try {
      const req = createRequire(import.meta.url);
      let mod: TSModule;
      try {
        mod = req('@vscode/tree-sitter-wasm') as TSModule;
      } catch {
        mod = req(path.join(dir, 'tree-sitter.js')) as TSModule;
      }
      await mod.Parser.init({ locateFile: (f: string) => path.join(dir, f) });
      return mod;
    } catch {
      return null;
    }
  })();
  return runtime;
}

async function loadLanguage(mod: TSModule, grammar: string): Promise<unknown | null> {
  let p = languages.get(grammar);
  if (!p) {
    p = (async () => {
      const dir = wasmDir();
      const file = dir && path.join(dir, `tree-sitter-${grammar}.wasm`);
      if (!file || !existsSync(file)) return null;
      try {
        return await mod.Language.load(readFileSync(file));
      } catch {
        return null;
      }
    })();
    languages.set(grammar, p);
  }
  return p;
}

function nameOf(node: TSNode): string | undefined {
  const direct = node.childForFieldName('name');
  if (direct) return direct.text;
  if (node.type === 'impl_item') {
    const t = node.childForFieldName('type');
    const tr = node.childForFieldName('trait');
    return t ? (tr ? `${tr.text} for ${t.text}` : t.text) : undefined;
  }
  // C/C++: function_definition -> declarator -> function_declarator -> declarator (identifier)
  let d = node.childForFieldName('declarator');
  for (let i = 0; d && i < 5; i++) {
    if (['identifier', 'field_identifier', 'qualified_identifier', 'destructor_name', 'operator_name'].includes(d.type)) return d.text;
    d = d.childForFieldName('declarator');
  }
  return undefined;
}

function extractTree(root: TSNode, file: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const visit = (node: TSNode, container: string | undefined, depth: number) => {
    if (depth > 60) return;
    let kind = KIND_BY_NODE[node.type];
    let nextContainer = container;
    if (node.type === 'variable_declarator') {
      const value = node.childForFieldName('value');
      if (value && ['arrow_function', 'function', 'function_expression', 'class'].includes(value.type)) {
        kind = value.type === 'class' ? 'class' : 'function';
      }
    }
    if (kind) {
      const name = nameOf(node);
      if (name && name.length < 200) {
        const effectiveKind: SymbolKind = kind === 'function' && container ? 'method' : kind;
        out.push({ name, kind: effectiveKind, path: file, line: node.startPosition.row + 1, ...(container ? { container } : {}) });
        if (CONTAINER_KINDS.has(kind)) nextContainer = container ? `${container}.${name}` : name;
      }
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child, nextContainer, depth + 1);
    }
  };
  visit(root, undefined, 0);
  return out;
}

/** Regex fallback for languages without a bundled grammar. */
const REGEX_RULES: { ext: RegExp; rules: { re: RegExp; kind: SymbolKind }[] }[] = [
  {
    ext: /\.(kt|kts)$/,
    rules: [
      { re: /^\s*(?:[\w@]+\s+)*class\s+(\w+)/, kind: 'class' },
      { re: /^\s*(?:[\w@]+\s+)*interface\s+(\w+)/, kind: 'interface' },
      { re: /^\s*(?:[\w@]+\s+)*fun\s+(?:<[^>]+>\s*)?(?:\w+\.)?(\w+)\s*\(/, kind: 'function' },
    ],
  },
  {
    ext: /\.swift$/,
    rules: [
      { re: /^\s*(?:\w+\s+)*(?:class|actor)\s+(\w+)/, kind: 'class' },
      { re: /^\s*(?:\w+\s+)*struct\s+(\w+)/, kind: 'struct' },
      { re: /^\s*(?:\w+\s+)*protocol\s+(\w+)/, kind: 'interface' },
      { re: /^\s*(?:\w+\s+)*func\s+(\w+)/, kind: 'function' },
    ],
  },
  { ext: /\.dart$/, rules: [{ re: /^\s*(?:abstract\s+)?class\s+(\w+)/, kind: 'class' }, { re: /^\s*(?:[\w<>?]+\s+)+(\w+)\s*\([^;]*\)\s*(?:async\s*)?\{/, kind: 'function' }] },
  { ext: /\.lua$/, rules: [{ re: /^\s*(?:local\s+)?function\s+([\w.:]+)/, kind: 'function' }] },
  { ext: /\.(ex|exs)$/, rules: [{ re: /^\s*defmodule\s+([\w.]+)/, kind: 'module' }, { re: /^\s*defp?\s+(\w+[?!]?)/, kind: 'function' }] },
  { ext: /\.(scala|sc)$/, rules: [{ re: /^\s*(?:\w+\s+)*(?:class|object|trait)\s+(\w+)/, kind: 'class' }, { re: /^\s*(?:\w+\s+)*def\s+(\w+)/, kind: 'function' }] },
  { ext: /\.(vue|svelte)$/, rules: [{ re: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: 'function' }, { re: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/, kind: 'function' }] },
  { ext: /\.gd$/, rules: [{ re: /^\s*func\s+(\w+)/, kind: 'function' }, { re: /^\s*class_name\s+(\w+)/, kind: 'class' }] },
];

function extractRegex(source: string, file: string): CodeSymbol[] {
  const group = REGEX_RULES.find((g) => g.ext.test(file));
  if (!group) return [];
  const out: CodeSymbol[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const r of group.rules) {
      const m = r.re.exec(lines[i]);
      if (m) {
        out.push({ name: m[1], kind: r.kind, path: file, line: i + 1 });
        break;
      }
    }
  }
  return out;
}

export function hasSymbolSupport(file: string): boolean {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  return ext in GRAMMAR_BY_EXT || REGEX_RULES.some((g) => g.ext.test(file));
}

/** Extract symbol definitions from one file using tree-sitter, falling back to regexes. */
export async function extractSymbols(source: string, file: string): Promise<{ symbols: CodeSymbol[]; engine: 'tree-sitter' | 'regex' | 'none' }> {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  const grammar = GRAMMAR_BY_EXT[ext];
  if (grammar) {
    const mod = await loadRuntime();
    const lang = mod && (await loadLanguage(mod, grammar));
    if (mod && lang) {
      const parser = new mod.Parser();
      try {
        parser.setLanguage(lang);
        const tree = parser.parse(source);
        if (tree) {
          try {
            return { symbols: extractTree(tree.rootNode, file), engine: 'tree-sitter' };
          } finally {
            tree.delete();
          }
        }
      } finally {
        parser.delete();
      }
    }
  }
  const symbols = extractRegex(source, file);
  return { symbols, engine: symbols.length || REGEX_RULES.some((g) => g.ext.test(file)) ? 'regex' : 'none' };
}

export async function treeSitterAvailable(): Promise<boolean> {
  return (await loadRuntime()) !== null;
}
