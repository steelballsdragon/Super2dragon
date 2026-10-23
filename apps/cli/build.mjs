// Bundles the CLI + engine into a single self-contained ESM file and copies
// the tree-sitter WASM grammars next to it.
import { build } from 'esbuild';
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(here, 'src/main.ts')],
  outfile: path.join(out, 'localcode.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'linked',
  legalComments: 'none',
  // Optional native accelerators of `ws`; it works without them.
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __lcCreateRequire } from 'node:module';\nconst require = __lcCreateRequire(import.meta.url);",
  },
  logLevel: 'warning',
});
chmodSync(path.join(out, 'localcode.mjs'), 0o755);

const require = createRequire(import.meta.url);
const wasmDir = path.join(path.dirname(require.resolve('@vscode/tree-sitter-wasm/package.json')), 'wasm');
cpSync(wasmDir, path.join(out, 'tree-sitter'), { recursive: true, filter: (f) => !f.endsWith('.d.ts') });

// Bundle the built UI for `localcode serve` when available.
const ui = path.join(here, '..', 'desktop', 'dist');
if (existsSync(path.join(ui, 'index.html'))) cpSync(ui, path.join(out, 'ui'), { recursive: true });

// Stage the engine for the desktop app (Tauri bundles it as a resource; `cargo build` needs it to exist).
const engineDir = path.join(here, '..', 'desktop', 'src-tauri', 'resources', 'engine');
rmSync(engineDir, { recursive: true, force: true });
mkdirSync(engineDir, { recursive: true });
cpSync(path.join(out, 'localcode.mjs'), path.join(engineDir, 'localcode.mjs'));
cpSync(path.join(out, 'tree-sitter'), path.join(engineDir, 'tree-sitter'), { recursive: true });

console.log(`Built ${path.relative(process.cwd(), path.join(out, 'localcode.mjs'))}`);
