#!/usr/bin/env node
// Age of Conquest build. Plain Node 22, no dependencies.
//
//   node build.mjs              -> index.html (Artifact fragment) + dist/index.html (standalone, installable)
//   node build.mjs --out DIR    -> DIR/index.html + DIR/dist/index.html
//
// The simulation engine goes in its own script tag (the page also starts its Web Worker from that text); the
// interface files follow in order, each wrapped in its own function scope so top-level names stay private.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { engineSource, WORKER_GLUE, ENGINE_FILES } from './src/conquest/bundle.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const UI = ['ui-core.js', 'ui-art.js', 'ui-home.js', 'ui-map.js', 'ui-city.js', 'ui-army.js', 'ui-guild.js', 'ui-battle.js', 'ui-intel.js', 'ui-chron.js', 'ui-misc.js', 'ui-dev.js', 'ui-guide.js', 'ui-events.js'];

// ---------- arguments
function parseArgs(argv) {
  const opts = { out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a.startsWith('--out=')) {
      const eq = a.indexOf('=');
      opts.out = eq >= 0 ? a.slice(eq + 1) : argv[++i];
      if (!opts.out) fail('--out needs a value');
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: node build.mjs [--out DIR]');
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
const ENGINE_MARK = '/*@@ENGINE@@*/';
const BODY_MARK = '<!--@@BODY@@-->';
for (const m of [CSS_MARK, JS_MARK, ENGINE_MARK, BODY_MARK]) if (!template.includes(m)) fail(`template.html is missing the ${m} marker`);

const cssParts = [{ name: 'conquest/ui.css', text: read(join(SRC, 'conquest', 'ui.css')) }];
const jsParts = UI.map(f => ({ name: `conquest/${f}`, text: read(join(SRC, 'conquest', f)) }));
const engine = engineSource();

const BOOT = `window.Conquest.boot();`;

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
    if (kind === 'js' && /\blocalStorage\b/.test(line) && name !== 'conquest/ui-core.js') warnings.push(`${at} touches localStorage directly; use U.LS (it never throws)`);
  });
}
lint('template.html', template, 'html');
for (const p of cssParts) lint(p.name, p.text, 'css');
for (const p of jsParts) lint(p.name, p.text, 'js');
for (const f of ENGINE_FILES) lint(`conquest/${f}`, read(join(SRC, 'conquest', f)), 'js');

// ---------- assemble
const safeCss = s => s.replace(/<\/style/gi, '<\\/style');
const safeJs = s => s.replace(/<\/script/gi, '<\\/script');

const css = cssParts
  .filter(p => p.text.trim())
  .map(p => `/* ===== ${p.name} ===== */\n${safeCss(p.text.trim())}\n`)
  .join('\n');

const wrapJs = p => `/* ===== ${p.name} ===== */\n;(function () {\n'use strict';\ntry {\n${safeJs(p.text.trim())}\n} catch (e) { console.error('[build] ${p.name} failed to load', e); }\n})();\n`;
// images the page needs are inlined (the Artifact frame cannot load files): public/conquest-logo.webp becomes
// AOC_ASSETS.logo
const logoPath = join(ROOT, 'public', 'conquest-logo.webp');
const ASSETS = `window.AOC_ASSETS = { logo: ${existsSync(logoPath) ? `'data:image/webp;base64,${readFileSync(logoPath).toString('base64')}'` : 'null'} };\n`;
// the painted sprites cut from the art sheets (art/sprites, made by tools/art/cut.py) become AOC_ART:
// { name: { src, w, h, fx, fy } }, with (fx, fy) the foot point each picture stands on
const ART_DIR = join(ROOT, 'art', 'sprites');
const artIndex = existsSync(join(ART_DIR, 'index.json')) ? JSON.parse(readFileSync(join(ART_DIR, 'index.json'), 'utf8')) : {};
const artEntries = Object.entries(artIndex).filter(([n]) => existsSync(join(ART_DIR, n + '.webp')));
const ART_JS = `window.AOC_ART = {\n${artEntries.map(([n, m]) => `${JSON.stringify(n)}: { w: ${m.w}, h: ${m.h}, fx: ${m.fx}, fy: ${m.fy}, src: 'data:image/webp;base64,${readFileSync(join(ART_DIR, n + '.webp')).toString('base64')}' }`).join(',\n')}\n};\n`;
const js = `/* ===== assets ===== */\n${ASSETS}${ART_JS}window.AOC_GLUE = ${JSON.stringify(WORKER_GLUE).replace(/<\//g, '<\\/')};\n` + jsParts.map(wrapJs).join('\n') + `\n/* ===== boot ===== */\n${BOOT}\n`;

const filled = template
  .replace(CSS_MARK, () => css)
  .replace(JS_MARK, () => js)
  .replace(ENGINE_MARK, () => safeJs(engine));

const [headPart, bodyPart] = filled.split(BODY_MARK);
const fragment = (headPart.trimEnd() + '\n' + bodyPart.trimStart()).replace(/^\s+/, '');
if (!fragment.startsWith('<title>Age of Conquest</title>')) fail('the fragment must start with <title>Age of Conquest</title>');

const HOST_RESET = ':root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)} body{margin:0} img{max-width:100%} [hidden]{display:none!important}';
// The standalone build is also an installable web app (GitHub Pages): manifest, icons and an offline cache.
// None of this goes into the Artifact fragment, where service workers and manifests do not apply.
const APP_HEAD = `<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Age of Conquest">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<script>window.AOC_APP = true; if (navigator.standalone) document.documentElement.classList.add('aoc-standalone'); if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>`;
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>${HOST_RESET}</style>
${headPart.trim()}
${APP_HEAD}
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

// app files next to dist/index.html
const distDir = dirname(distPath);
const version = createHash('sha256').update(standalone).digest('hex').slice(0, 12);
const icons = existsSync(join(ROOT, 'public', 'icons')) ? readdirSync(join(ROOT, 'public', 'icons')).filter(f => f.endsWith('.png')) : [];
mkdirSync(join(distDir, 'icons'), { recursive: true });
writeFileSync(join(distDir, '.nojekyll'), '');   // GitHub Pages serves the files as they are
for (const f of icons) copyFileSync(join(ROOT, 'public', 'icons', f), join(distDir, 'icons', f));
writeFileSync(join(distDir, 'manifest.webmanifest'), JSON.stringify({
  name: 'Last Furnace: Age of Conquest',
  short_name: 'Age of Conquest',
  description: 'Six hundred governors, ten guilds and one living world: build your city, raise armies, join a guild and take the Throne.',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#0a1524',
  theme_color: '#0b1626',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');
writeFileSync(join(distDir, 'sw.js'), `// Age of Conquest offline cache (generated by build.mjs). The page is fetched fresh when online so players get
// updates, and served from the cache when offline; icons and fonts are cache-first.
const CACHE = 'age-of-conquest-${version}';
const CORE = ['./', './index.html', './manifest.webmanifest', ${icons.map(f => `'./icons/${f}'`).join(', ')}];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => (k.startsWith('age-of-conquest-') || k.startsWith('last-furnace-')) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
`);

const kb = s => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
const shown = p => (opts.out ? p : relative(ROOT, p));
console.log(`build: ${shown(fragPath)} ${kb(fragment)}`);
console.log(`build: ${shown(distPath)} ${kb(standalone)}`);
for (const w of warnings) console.warn(`build: warning: ${w}`);
