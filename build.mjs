#!/usr/bin/env node
// Last Furnace build. Plain Node 22, no dependencies.
//
//   node build.mjs                         -> index.html (Artifact fragment) + dist/index.html (standalone)
//   node build.mjs --out DIR               -> DIR/index.html + DIR/dist/index.html
//   node build.mjs --only city,shop        -> core plus only the listed modules
//
// CSS order: core, then modules. JS order: core, then city, military, shop, progress, online, then the boot snippet.
// Every JS source is wrapped in its own function scope, so top-level names stay private to that file.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const MODULES = ['city', 'military', 'shop', 'progress', 'online'];
const ALIASES = { mil: 'military', prog: 'progress', heroes: 'military', net: 'online', world: 'online' };

// ---------- arguments
function parseArgs(argv) {
  const opts = { out: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => {
      const eq = a.indexOf('=');
      if (eq >= 0) return a.slice(eq + 1);
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    if (a === '--out' || a.startsWith('--out=')) opts.out = take();
    else if (a === '--only' || a.startsWith('--only=')) opts.only = take();
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node build.mjs [--out DIR] [--only city,military,shop,progress]');
      process.exit(0);
    } else fail(`Unknown argument: ${a}`);
  }
  return opts;
}

function fail(msg) {
  console.error(`build: ${msg}`);
  process.exit(1);
}

const opts = parseArgs(process.argv.slice(2));

let selected = MODULES;
if (opts.only !== null) {
  const wanted = opts.only.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).map(s => ALIASES[s] || s);
  for (const w of wanted) if (!MODULES.includes(w)) fail(`--only: unknown module "${w}" (known: ${MODULES.join(', ')})`);
  selected = MODULES.filter(m => wanted.includes(m));
}

// ---------- sources
function read(path, optional = false) {
  if (!existsSync(path)) {
    if (optional) return '';
    fail(`missing source file ${relative(ROOT, path)}`);
  }
  return readFileSync(path, 'utf8');
}

const template = read(join(SRC, 'template.html'));
const CSS_MARK = '/*@@CSS@@*/';
const JS_MARK = '/*@@JS@@*/';
const BODY_MARK = '<!--@@BODY@@-->';
for (const m of [CSS_MARK, JS_MARK, BODY_MARK]) if (!template.includes(m)) fail(`template.html is missing the ${m} marker`);

const cssParts = [{ name: 'core.css', text: read(join(SRC, 'core.css')) }];
const jsParts = [{ name: 'core.js', text: read(join(SRC, 'core.js')) }];
for (const m of selected) {
  cssParts.push({ name: `modules/${m}.css`, text: read(join(SRC, 'modules', `${m}.css`), true) });
  jsParts.push({ name: `modules/${m}.js`, text: read(join(SRC, 'modules', `${m}.js`)) });
}

const BOOT = `try { window.claude?.hot?.snapshot?.(() => ({ state: Game.S })) } catch (e) {}
const hot = window.claude?.hot;
if (hot?.ready) hot.ready(d => Game.start(d)); else Game.start(hot?.data ?? {});`;

// ---------- light lint (warnings only)
const warnings = [];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const URL_RE = /https?:\/\/[^\s"'`)<>]+/g;
const URL_OK = [/^https?:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/, /^http:\/\/www\.w3\.org\//];
function lint(name, text, kind) {
  text.split('\n').forEach((line, i) => {
    const at = `${name}:${i + 1}`;
    if (EMOJI.test(line)) warnings.push(`${at} contains an emoji or pictograph character`);
    for (const u of line.match(URL_RE) || []) if (!URL_OK.some(r => r.test(u))) warnings.push(`${at} references an external URL (${u})`);
    if (kind === 'js' && /(^|[^.\w$])(alert|confirm|prompt)\s*\(/.test(line)) warnings.push(`${at} calls alert/confirm/prompt, which do nothing in the Artifact frame`);
    if (kind === 'js' && /\blocalStorage\b/.test(line) && name !== 'core.js') warnings.push(`${at} touches localStorage directly; use Game.storage (it never throws)`);
  });
}
lint('template.html', template, 'html');
for (const p of cssParts) lint(p.name, p.text, 'css');
for (const p of jsParts) lint(p.name, p.text, 'js');

// ---------- assemble
const safeCss = s => s.replace(/<\/style/gi, '<\\/style');
const safeJs = s => s.replace(/<\/script/gi, '<\\/script');

const css = cssParts
  .filter(p => p.text.trim())
  .map(p => `/* ===== ${p.name} ===== */\n${safeCss(p.text.trim())}\n`)
  .join('\n');

const wrapJs = p => `/* ===== ${p.name} ===== */\n;(function () {\n'use strict';\ntry {\n${safeJs(p.text.trim())}\n} catch (e) { console.error('[build] ${p.name} failed to load', e); }\n})();\n`;
const js = jsParts.map(wrapJs).join('\n') + `\n/* ===== boot ===== */\n${BOOT}\n`;

const filled = template
  .replace(CSS_MARK, () => css)
  .replace(JS_MARK, () => js);

const [headPart, bodyPart] = filled.split(BODY_MARK);
const fragment = (headPart.trimEnd() + '\n' + bodyPart.trimStart()).replace(/^\s+/, '');
if (!fragment.startsWith('<title>Last Furnace</title>')) fail('the fragment must start with <title>Last Furnace</title>');

const HOST_RESET = ':root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)} body{margin:0} img{max-width:100%} [hidden]{display:none!important}';
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>${HOST_RESET}</style>
${headPart.trim()}
</head>
<body>
${bodyPart.trim()}
</body>
</html>
`;

// ---------- write
const outRoot = opts.out ? resolve(process.cwd(), opts.out) : ROOT;
const fragPath = join(outRoot, 'index.html');
const distPath = join(outRoot, 'dist', 'index.html');
mkdirSync(dirname(fragPath), { recursive: true });
mkdirSync(dirname(distPath), { recursive: true });
writeFileSync(fragPath, fragment);
writeFileSync(distPath, standalone);

const kb = s => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log(`build: modules [${selected.join(', ') || 'none'}]`);
const shown = p => (opts.out ? p : relative(ROOT, p));
console.log(`build: ${shown(fragPath)} ${kb(fragment)}`);
console.log(`build: ${shown(distPath)} ${kb(standalone)}`);
for (const w of warnings) console.warn(`build: warning: ${w}`);
