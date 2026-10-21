#!/usr/bin/env node
// Age of Conquest benchmark: measures the 600-governor server in Node and in headless Chromium and writes
// docs/conquest-bench.json. Not part of the test run (numbers depend on the machine).
//
//   node tests/conquest-bench.mjs
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { loadEngine } from './conquest/load.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const A = loadEngine();
const out = { machine: `${os.cpus()[0]?.model || 'cpu'} (${os.cpus().length} threads), Node ${process.version}`, date: new Date().toISOString().slice(0, 10) };
const ms = t0 => Math.round((performance.now() - t0) * 10) / 10;
const mb = b => Math.round(b / 1048576 * 10) / 10;

global.gc?.();
const heap0 = process.memoryUsage().heapUsed;
let t0 = performance.now();
const worlds = [1, 2, 3].map(s => A.createWorld({ seed: 9000 + s, name: 'Bench' }));
out.createMs = Math.round(ms(t0) / 3);
const w = worlds[0];
worlds.length = 1;
global.gc?.();
out.heapAfterCreateMB = mb(process.memoryUsage().heapUsed - heap0);

// throughput at one-minute steps (live play) as the world ages
out.throughput = [];
for (const day of [1, 3, 7]) {
  while (w.t < day * 1440 + 360 - 1440) A.advance(w, 360);
  t0 = performance.now();
  for (let k = 0; k < 240; k++) A.step(w, 1);
  const t = ms(t0);
  const d = A.diagnostics(w);
  out.throughput.push({ day, msPerGameMinute: Math.round(t / 240 * 100) / 100, gameMinutesPerSecond: Math.round(240 / (t / 1000)), marches: d.marches, battles: d.battles, tiers: d.tiers });
}
// offline catch-up uses 5-minute steps
t0 = performance.now();
A.advance(w, 1440);
out.offlineDayMs = Math.round(ms(t0));
global.gc?.();
out.heapAfter8DaysMB = mb(process.memoryUsage().heapUsed - heap0);

// saves
t0 = performance.now();
const save = A.serialize(w, Date.now());
out.saveMs = ms(t0);
out.saveKB = Math.round(save.length / 1024);
out.saveGzipKB = Math.round(gzipSync(save).length / 1024);
t0 = performance.now();
const r = A.deserialize(save);
out.loadMs = ms(t0);
out.loadOk = r.ok;

// commands and pathfinding
const P = w.govs[A.PLAYER];
P.res = { food: 1e9, wood: 1e9, stone: 1e9, iron: 1e9, gold: 1e9 };
t0 = performance.now();
for (let k = 0; k < 1000; k++) { A.buildCheck(w, P, A.BUILDING_KEYS[k % A.BUILDING_KEYS.length]); A.researchCheck(w, P, A.TECH_KEYS[k % A.TECH_KEYS.length]); }
out.checkUs = Math.round(ms(t0) * 1000 / 2000);
t0 = performance.now();
for (let k = 0; k < 50; k++) A.frameView(w, {});
out.frameViewMs = Math.round(ms(t0) / 50 * 10) / 10;
w._pathCache = new Map();
const e0 = A.PF.expanded;
t0 = performance.now();
let n = 0, len = 0;
for (let k = 0; k < 300; k++) { const a = w.govs[(k * 7) % 600], b = w.govs[(k * 13 + 5) % 600]; const p = A.findPath(w, A.idx(a.x, a.y), A.idx(b.x, b.y)); if (p) { n++; len += p.length; } }
const pt = ms(t0);
out.path = { searches: 300, avgTiles: Math.round(len / n), avgMs: Math.round(pt / 300 * 100) / 100, expandedPerSearch: Math.round((A.PF.expanded - e0) / 300) };

// in the browser: worker round trips and the top speed the worker sustains
const require = createRequire(import.meta.url);
let chromium;
for (const t of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(t)); break; } catch (e) { /* next */ } }
if (chromium) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, x => x.abort());
  await page.addInitScript(() => { try { localStorage.setItem('last-furnace-dev', '1'); } catch (e) { /* ignore */ } });
  await page.goto(pathToFileURL(join(HERE, '..', 'dist', 'index.html')).href);
  await page.click('#start-mode-conquest');
  await page.click('#aoc-new');
  const tc = Date.now();
  await page.click('#aoc-found');
  await page.waitForFunction(() => window.AOCUI?.F);
  out.browser = { createToFirstFrameMs: Date.now() - tc, mode: await page.evaluate(() => window.AOCUI.host.mode) };
  out.browser.roundTripMs = await page.evaluate(async () => { const t = performance.now(); for (let k = 0; k < 50; k++) await window.AOCUI.host.query('build'); return Math.round((performance.now() - t) / 50 * 10) / 10; });
  out.browser.commandMs = await page.evaluate(async () => { const t = performance.now(); for (let k = 0; k < 50; k++) await window.AOCUI.host.cmd({ type: 'readReport', id: -1 }); return Math.round((performance.now() - t) / 50 * 10) / 10; });
  await page.evaluate(() => window.AOCUI.host.post({ type: 'speed', v: 64 }));
  const g0 = await page.evaluate(() => window.AOCUI.F.t);
  await page.waitForTimeout(10000);
  const g1 = await page.evaluate(() => window.AOCUI.F.t);
  out.browser.speed64GameMinutesPerSecond = Math.round((g1 - g0) / 10);
  out.browser.jsHeapMB = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));
writeFileSync(join(HERE, '..', 'docs', 'conquest-bench.json'), JSON.stringify(out, null, 2) + '\n');
