#!/usr/bin/env node
// Robustness test, in headless Chromium against dist/index.html: a damaged save falls back to the backup copy, a
// world whose every copy is damaged offers a new one without deleting anything, a world from the old smaller map
// is explained and kept, blocked storage still plays, and a long run at the developer's 64x speed keeps the page
// small and responsive.
//
//   node tests/conquest-robust.mjs [path/to/dist/index.html]
//
// Exit code 0 when every step passes, 1 otherwise.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
let chromium;
for (const t of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(t)); break; } catch (e) { /* next */ } }
if (!chromium) { console.error('conquest-robust: Playwright not found'); process.exit(1); }
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(process.argv[2] || join(HERE, '..', 'dist', 'index.html'));
if (!existsSync(FILE)) { console.error(`conquest-robust: ${FILE} does not exist. Run "node build.mjs" first.`); process.exit(1); }
const URL = pathToFileURL(FILE).href;
const SHOT = join(process.env.SHOTS || tmpdir(), 'conquest-robust-fail.png');

const problems = [];
let passed = 0, page;
const browser = await chromium.launch();
function check(cond, msg) { if (!cond) throw new Error(msg); }
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`  ok  ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); } catch (e) {
    console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').slice(0, 8).join('\n       ')}`);
    try { await page.screenshot({ path: SHOT }); console.log(`       screenshot: ${SHOT}`); } catch (err) { /* ignore */ }
    if (problems.length) console.log('       errors so far:\n         ' + problems.join('\n         '));
    await browser.close();
    process.exit(1);
  }
}
async function newPage(init, expectErrors) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await p.route(/^https?:\/\//, r => r.abort());
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text()) && !(expectErrors && expectErrors.test(m.text()))) problems.push('console.error: ' + m.text()); });
  p.on('pageerror', e => problems.push('pageerror: ' + e.message));
  if (init) await p.addInitScript(init);
  return p;
}
async function found(name) {
  await page.goto(URL);
  await page.click('#aoc-new');
  await page.fill('#aoc-name', name);
  await page.click('#aoc-found');
  await page.waitForFunction(() => window.AOCUI.F && window.AOCUI.current === 'city', null, { timeout: 30000 });
  await page.evaluate(() => window.AOCUI.closeSheets());
}
async function saveNow() {
  await page.evaluate(() => window.AOCUI.host.post({ type: 'save' }));
  await page.waitForFunction(() => window.AOCUI.saveState === 'saved' && Date.now() - window.AOCUI.lastSave < 4000, null, { timeout: 8000 });
}
// write a record straight into the game's IndexedDB store
const putRecord = (key, text) => page.evaluate(([k, t]) => new Promise((res, rej) => {
  const r = indexedDB.open('last-furnace-conquest', 1);
  r.onsuccess = () => { const tx = r.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put({ enc: 'plain', data: t, meta: { name: 'Damaged' }, at: Date.now() }, k); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
  r.onerror = () => rej(r.error);
}), [key, text]);
const getRecord = key => page.evaluate(k => new Promise(res => {
  const r = indexedDB.open('last-furnace-conquest', 1);
  r.onsuccess = () => { const q = r.result.transaction('saves', 'readonly').objectStore('saves').get(k); q.onsuccess = () => { r.result.close(); res(q.result ? { enc: q.result.enc, plain: q.result.enc === 'plain' ? q.result.data : null } : null); }; };
  r.onerror = () => res(null);
}), key);

console.log(`conquest-robust: ${FILE}`);

await step('a damaged main save: the backup copy loads and the game goes on', async () => {
  page = await newPage(null, /could not be opened|simulation error|smaller map/);
  await found('Backup');
  await page.waitForFunction(() => window.AOCUI.F.t >= 362);
  await saveNow();
  // the first save also wrote the backup
  let bak = null;
  for (let i = 0; i < 30 && !bak; i++) { bak = await getRecord('backup'); if (!bak) await page.waitForTimeout(100); }
  check(bak, 'no backup copy was written');
  // damage it from the start screen, where no game is running that could save over it
  await page.reload();
  await page.waitForSelector('#aoc-continue:not([hidden])');
  await putRecord('main', '{"format":"age-of-conquest","v":1,"check":1,"body":"{}"}');
  await page.reload();
  await page.click('#aoc-continue');
  await page.waitForFunction(() => window.AOCUI.F && window.AOCUI.current === 'city', null, { timeout: 30000 });
  check(await page.evaluate(() => window.AOCUI.F.player.name) === 'Backup', 'the backup did not load');
  const toasts = await page.locator('.aoc-toast').allTextContents();
  check(toasts.some(t => /backup/i.test(t)), `no word about the backup: ${JSON.stringify(toasts)}`);
  const t0 = await page.evaluate(() => window.AOCUI.F.t);
  await page.waitForFunction(t => window.AOCUI.F.t >= t + 2, t0);
});

await step('every copy damaged: a clear message and a new world offered, nothing deleted', async () => {
  await page.reload();
  await page.waitForSelector('#aoc-continue:not([hidden])');
  await putRecord('main', 'not a save');
  await putRecord('backup', 'not a save either');
  await page.reload();
  await page.click('#aoc-continue');
  await page.waitForSelector('#aoc-err-new', { timeout: 30000 });
  check(/could not be opened/i.test(await page.locator('.aoc-title').textContent()), 'no explanation');
  check((await getRecord('main'))?.plain === 'not a save', 'the damaged main save was deleted');
  check((await getRecord('backup'))?.plain === 'not a save either', 'the damaged backup was deleted');
  await page.click('#aoc-err-new');
  await page.waitForSelector('#aoc-found');
});

await step('a world from the old, smaller map: the new map is explained and the old save is left alone', async () => {
  await page.goto(URL);
  await page.waitForSelector('#aoc-new');
  const old = await page.evaluate(() => { const body = '{"t":0}'; return JSON.stringify({ format: 'age-of-conquest', v: 1, check: window.AOC.hash32(body), body }); });
  await putRecord('main', old);
  await putRecord('backup', old);
  await page.reload();
  await page.click('#aoc-continue');
  await page.waitForSelector('#aoc-err-new', { timeout: 30000 });
  const title = await page.locator('.aoc-title h1').textContent(), text = await page.locator('.aoc-title p').first().textContent();
  check(/new, bigger map/i.test(title) && /old, smaller map/.test(text), `no explanation: ${title} / ${text}`);
  check((await getRecord('main'))?.plain === old, 'the old save was changed or deleted');
  const toasts = await page.locator('.aoc-toast').allTextContents();
  check(!toasts.some(t => /backup/i.test(t)), 'it tried the backup of an old-map save');
});

await step('blocked storage: the game still starts and plays, and says saves cannot be kept', async () => {
  page = await newPage(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage is blocked'); } });
    Object.defineProperty(window, 'indexedDB', { get() { return undefined; } });
  });
  await found('Blocked');
  const t0 = await page.evaluate(() => window.AOCUI.F.t);
  await page.waitForFunction(t => window.AOCUI.F.t >= t + 3, t0);
  check((await page.evaluate(() => window.AOCUI.host.cmd({ type: 'build', id: 'hall' }))).ok, 'cannot build');
  await page.evaluate(() => window.AOCUI.host.post({ type: 'save' }));
  await page.waitForFunction(() => window.AOCUI.saveState === 'failed', null, { timeout: 8000 });
  await page.click('.aoc-menu');
  check(/nowhere/.test(await page.locator('.aoc-sheet-body').textContent()), 'the menu does not say the save had nowhere to go');
});

await step('a long run at 64x: two game days, the page stays small and keeps drawing', async () => {
  page = await newPage(() => { try { localStorage.setItem('last-furnace-dev', '1'); } catch (e) { /* ignore */ } });
  await found('Longrun');
  await page.click('[data-speed="64"]');
  const t0 = await page.evaluate(() => window.AOCUI.F.t);
  let peak = { nodes: 0, heap: 0 };
  const sample = async () => {
    const s = await page.evaluate(() => ({ nodes: document.getElementsByTagName('*').length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }));
    peak = { nodes: Math.max(peak.nodes, s.nodes), heap: Math.max(peak.heap, s.heap) };
  };
  // look around while it runs: the city, the map, reports and history
  for (const tab of ['city', 'map', 'intel', 'chron', 'city', 'map', 'city']) {
    await page.click(`#aoc-tab-${tab}`);
    await page.waitForTimeout(3500);
    await sample();
  }
  await page.waitForFunction(t => window.AOCUI.F.t >= t + 2 * 1440, t0, { timeout: 120000 });
  await page.click('#aoc-tab-city');
  await page.waitForTimeout(500);
  await sample();
  const drawn = await page.evaluate(() => window.AOCUI.home.ms);
  console.log(`       peak: ${peak.nodes} DOM nodes, ${Math.round(peak.heap / 1048576)} MB page heap; the town drew its last frame in ${drawn?.toFixed(1)} ms`);
  check(peak.nodes < 4000, `too many DOM nodes: ${peak.nodes}`);
  check(!peak.heap || peak.heap < 200 * 1048576, `page heap too large: ${Math.round(peak.heap / 1048576)} MB`);
  check(typeof drawn === 'number' && drawn < 100, 'the town stopped drawing');
  const ok = await page.evaluate(() => window.AOCUI.host.query('validate'));
  check(Array.isArray(ok) ? ok.length === 0 : ok?.ok !== false, `the world failed its checks: ${JSON.stringify(ok).slice(0, 200)}`);
});

await step('no console errors, page errors or outside requests', async () => {
  check(problems.length === 0, problems.join('\n'));
});

await browser.close();
console.log(`conquest-robust: all ${passed} steps passed`);
