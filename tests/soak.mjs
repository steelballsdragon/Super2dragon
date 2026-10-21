#!/usr/bin/env node
// Last Furnace soak test: plays from Furnace 1 to 30 on a phone-density screen with the real game loop on a fake
// clock, visiting every screen, opening sheets, recruiting, training and fighting animated battles at each level.
// It fails on any console or page error, a page that stops answering (a freeze), runaway DOM, heap, canvas or
// save growth, or a save that does not come back at Furnace 17 and 30. Then it damages saves on purpose:
// a corrupt main save (backup must load), every copy corrupt (rescue copy kept, new game offered) and blocked
// storage (game still runs).
//
//   node tests/soak.mjs [path/to/dist/index.html]      portrait and landscape, about 3-5 minutes

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
for (const t of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(t)); break; } catch (e) { /* next */ } }
if (!chromium) { console.error('soak: Playwright not found'); process.exit(1); }
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(process.argv[2] || join(HERE, '..', 'dist', 'index.html'));
if (!existsSync(FILE)) { console.error(`soak: ${FILE} does not exist. Run "node build.mjs" first.`); process.exit(1); }
const URL = pathToFileURL(FILE).href;

const LIMITS = { nodes: 9000, heapMB: 60, saveKB: 64, canvases: 4, longTaskMs: 1500 };
const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
let passed = 0;
function check(cond, msg) { if (!cond) throw new Error(msg); }
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`page froze: no answer within ${ms / 1000}s during ${what}`)), ms))]);
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`  ok  ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message.split('\n').slice(0, 12).join('\n       ')}`);
    await browser.close();
    process.exit(1);
  }
}
async function openGame(ctx, problems, tag) {
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${tag} console.error: ${m.text().slice(0, 300)}`); });
  p.on('pageerror', e => problems.push(`${tag} pageerror: ${e.message}`));
  p.on('crash', () => problems.push(`${tag} PAGE CRASHED`));
  return p;
}
async function passStart(p, clock) {
  for (let i = 0; i < 40; i++) {
    const ready = await p.evaluate(() => !!document.querySelector('#start-continue') && !document.querySelector('#start-continue').disabled);
    if (ready) break;
    if (clock) await p.clock.runFor(250); else await p.waitForTimeout(250);
  }
  await p.click('#start-continue');
  for (let i = 0; i < 40 && !(await p.evaluate(() => window.Game?.isReady === true)); i++) { if (clock) await p.clock.runFor(250); else await p.waitForTimeout(250); }
  check(await p.evaluate(() => window.Game?.isReady === true), 'game did not boot from the start screen');
}

// one level of play through the public API, the way a busy player taps around
const PLAY_LEVEL = target => {
  const close = () => document.querySelectorAll('[aria-label="Close"]').forEach(x => x.click());
  const ok = () => document.querySelectorAll('#ui-layer .reward-ok').forEach(x => x.click());
  const finish = () => { for (const t of Game.timers.list('build')) Game.timers.finishNow(t.id); };
  Game.debug.grant({ meat: 1e9, wood: 1e9, coal: 1e9, iron: 1e9, gems: 3000, items: { xp_book: 40, ticket_recruit: 10, speedup_1h: 3 } });
  const ids = ['shelter', 'sawmill', 'coalmine', 'hunter', 'ironmine', 'infirmary', 'storehouse', 'infantry_camp', 'lancer_camp', 'marksman_camp'];
  for (const id of ids) {
    let g = 0;
    while (Game.city.level(id) < target - 1 && g++ < 40) {
      if (!Game.city.upgrade(id)) break;
      const t = Game.timers.list('build')[0];
      if (t && g === 1) { Game.speedupSheet(t.id); close(); }
      finish(); close(); ok();
    }
    Game.city.openBuilding(id); close();
  }
  let g = 0;
  while (Game.city.level('furnace') < target && g++ < 4) { if (!Game.city.upgrade('furnace')) break; finish(); close(); ok(); }
  document.querySelectorAll('.city-bubble:not([hidden])').forEach(x => x.click());
  Game.city.autoAssign();
  Game.mil.recruit(10, 'tickets'); ok(); close();
  for (const id of Game.mil.heroIds().slice(0, 4)) { Game.mil.openHero?.(id); close(); }
  for (const t of ['infantry', 'lancer', 'marksman']) Game.mil.startTraining(t, 50);
  for (const t of Game.timers.list('train')) Game.timers.finishNow(t.id);
  Game.mil.claimIdle(); ok();
  Game.shop.claimGift(); ok();
  Game.bagSheet(); close();
  for (const s of ['heroes', 'explore', 'events', 'shop', 'world', 'city']) Game.navigate(s);
  Game.mil.openBattle();
  return Game.city.level('furnace');
};
const READ = () => ({
  f: Game.city.level('furnace'),
  nodes: document.getElementsByTagName('*').length,
  canvases: document.getElementsByTagName('canvas').length,
  saveKB: Math.round((localStorage.getItem('last-furnace-v2') || '').length / 1024),
  stuck: document.querySelectorAll('.sheet-wrap').length,
});

async function climb(label, viewport) {
  const problems = [];
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 3 });
  const p = await openGame(ctx, problems, label);
  await p.clock.install();
  await p.goto(URL);
  await passStart(p, true);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  await p.evaluate(() => {
    window.__long = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* not supported */ }
  });
  let worst = { nodes: 0, heapMB: 0, saveKB: 0 };
  for (let target = 2; target <= 30; target++) {
    if (target % 4 === 0) await p.evaluate(() => { const now = Game.now(); Object.assign(Game.S.city.wx, { start: now - 15000, end: now + 30000, drop: 18, warned: true }); });
    const f = await within(p.evaluate(PLAY_LEVEL, target), 30000, `${label} Furnace ${target}`);
    check(f === target, `${label}: could not reach Furnace ${target} (stuck at ${f})`);
    await within(p.clock.runFor(6500), 30000, `${label} battle at Furnace ${target}`);   // battle animation, real loop, rAF
    await within(p.evaluate(() => { document.querySelectorAll('#ui-layer .reward-ok').forEach(x => x.click()); document.querySelectorAll('[aria-label="Close"]').forEach(x => x.click()); }), 10000, 'closing sheets');
    await p.clock.runFor(1200);
    const r = await within(p.evaluate(READ), 10000, 'reading stats');
    await p.evaluate(() => window.gc && window.gc());
    const m = await cdp.send('Performance.getMetrics');
    const heapMB = Math.round(m.metrics.find(x => x.name === 'JSHeapUsedSize').value / 1e6);
    worst = { nodes: Math.max(worst.nodes, r.nodes), heapMB: Math.max(worst.heapMB, heapMB), saveKB: Math.max(worst.saveKB, r.saveKB) };
    check(r.nodes < LIMITS.nodes, `${label} F${target}: ${r.nodes} DOM nodes (limit ${LIMITS.nodes})`);
    check(heapMB < LIMITS.heapMB, `${label} F${target}: JS heap ${heapMB} MB (limit ${LIMITS.heapMB})`);
    check(r.saveKB < LIMITS.saveKB, `${label} F${target}: save is ${r.saveKB} KB (limit ${LIMITS.saveKB})`);
    check(r.canvases <= LIMITS.canvases, `${label} F${target}: ${r.canvases} canvases in the page`);
    check(r.stuck === 0, `${label} F${target}: ${r.stuck} sheets left open after closing`);
    const longs = (await p.evaluate(() => window.__long.splice(0))).filter(x => x > LIMITS.longTaskMs);
    check(!longs.length, `${label} F${target}: main thread blocked for ${longs.join(', ')} ms`);
    check(!problems.length, problems.join('\n'));
    if (target === 17 || target === 30) {
      await p.evaluate(() => Game.save());
      await p.reload();
      await passStart(p, true);
      const back = await p.evaluate(() => Game.city.level('furnace'));
      check(back === target, `${label}: reload at Furnace ${target} came back at Furnace ${back}`);
      await p.evaluate(() => { window.__long = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch (e) { /* ignore */ } });
    }
  }
  await ctx.close();
  return worst;
}

console.log(`soak: ${FILE}`);
// SOAK_QUICK=1 skips the two long climbs (handy while working on the other steps)
const QUICK = process.env.SOAK_QUICK === '1';
if (!QUICK) await step('portrait phone (3x density): Furnace 1 to 30 with reloads at 17 and 30', async () => {
  const w = await climb('portrait', { width: 390, height: 844 });
  console.log(`       peak: ${w.nodes} DOM nodes, ${w.heapMB} MB heap, ${w.saveKB} KB save`);
});
if (!QUICK) await step('landscape phone (3x density): Furnace 1 to 30 with reloads at 17 and 30', async () => {
  const w = await climb('landscape', { width: 844, height: 390 });
  console.log(`       peak: ${w.nodes} DOM nodes, ${w.heapMB} MB heap, ${w.saveKB} KB save`);
});

await step('full-strength blizzard: snow stays bounded and the page keeps answering', async () => {
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const p = await openGame(ctx, problems, 'blizzard');
  await p.goto(URL);
  await passStart(p);
  const base = await p.evaluate(() => Game.city._snowCount());
  // a blizzard already at full strength (the ramp is 12 s), lasting two minutes
  await p.evaluate(() => { const now = Game.now(); Object.assign(Game.S.city.wx, { start: now - 20000, end: now + 120000, drop: 20, warned: true }); });
  for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(500);
    const n = await within(p.evaluate(() => Game.city._snowCount()), 4000, 'a blizzard');
    check(n <= Math.max(900, base * 3), `snow grew to ${n} flakes (base ${base})`);
  }
  // the blizzard survives a reload (it is saved) and must not freeze the next start either
  await p.evaluate(() => Game.save());
  await p.reload();
  await passStart(p);
  await p.waitForTimeout(2000);
  const n = await within(p.evaluate(() => Game.city._snowCount()), 4000, 'a blizzard after reload');
  check(n <= Math.max(900, base * 3), `after reload snow grew to ${n} flakes`);
  check(!problems.length, problems.join('\n'));
  await ctx.close();
});

await step('map canvas: no reallocation on tab switches, and a dropped canvas rebuilds itself', async () => {
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const p = await openGame(ctx, problems, 'canvas');
  // count pixel-buffer reallocations (every width/height assignment allocates on iOS)
  await p.addInitScript(() => {
    window.__canvasSets = 0;
    for (const prop of ['width', 'height']) {
      const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, prop);
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { get: d.get, set(v) { if (this.classList?.contains('city-canvas')) window.__canvasSets++; d.set.call(this, v); }, configurable: true });
    }
  });
  await p.goto(URL);
  await passStart(p);
  await p.waitForTimeout(500);
  const before = await p.evaluate(() => window.__canvasSets);
  for (let i = 0; i < 100; i++) await p.evaluate(() => { Game.navigate('heroes'); Game.navigate('city'); });
  await p.waitForTimeout(300);
  const sets = (await p.evaluate(() => window.__canvasSets)) - before;
  check(sets === 0, `200 tab switches reallocated the map canvas ${sets} times`);
  const opaque = () => p.evaluate(() => { const c = document.querySelector('.city-canvas'); return c.getContext('2d').getImageData(5, 5, 1, 1).data[3] === 255; });
  // 1) the context reports lost: within a few seconds a fresh canvas replaces it and draws
  const first = await p.evaluate(() => { const c = document.querySelector('.city-canvas'); c.__old = true; c.getContext('2d').isContextLost = () => true; return true; });
  check(first, 'could not mark the canvas lost');
  await p.waitForFunction(() => !document.querySelector('.city-canvas').__old, null, { timeout: 9000 });
  await p.waitForTimeout(300);
  check(await opaque(), 'rebuilt canvas is not drawing');
  // 2) the context answers but shows nothing
  await p.evaluate(() => { const c = document.querySelector('.city-canvas'); c.__old2 = true; const g = c.getContext('2d'); const real = g.getImageData.bind(g); g.getImageData = (...a) => { const d = real(...a); d.data[3] = 0; return d; }; });
  await p.waitForFunction(() => !document.querySelector('.city-canvas').__old2, null, { timeout: 6000 });
  await p.waitForTimeout(300);
  check(await opaque(), 'canvas rebuilt after blank pixels is not drawing');
  check(await p.evaluate(() => document.querySelectorAll('.city-canvas').length) === 1, 'old canvases left in the page');
  const errs = problems.filter(x => !/map canvas rebuilt/.test(x));
  check(!errs.length, errs.join('\n'));
  await ctx.close();
});

await step('corrupt main save: the backup loads and the broken copy is kept', async () => {
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await openGame(ctx, problems, 'corrupt');
  await p.goto(URL);
  await passStart(p);
  await p.evaluate(() => { Game.debug.grant({ meat: 1e6, wood: 1e6, coal: 1e6 }); Game.city.upgrade('furnace'); for (const t of Game.timers.list('build')) Game.timers.finishNow(t.id); Game.save(); localStorage.setItem('last-furnace-v2-backup', localStorage.getItem('last-furnace-v2')); });
  await p.addInitScript(() => { if (!sessionStorage.getItem('broke')) { sessionStorage.setItem('broke', '1'); localStorage.setItem('last-furnace-v2', '{"v":2,"meta":{"chiefNa'); } });
  await p.reload();
  await p.waitForFunction(() => !document.querySelector('#start-continue')?.disabled);
  const card = await p.locator('.start-save-txt').textContent();
  check(card.includes('Furnace Lv 2'), `backup not offered: ${card}`);
  check(await p.evaluate(() => localStorage.getItem('last-furnace-v2-rescue')?.startsWith('{"v":2,"meta":{"chiefNa')), 'broken save not kept as a rescue copy');
  await p.click('#start-continue');
  await p.waitForFunction(() => Game.isReady && Game.city.level('furnace') === 2);
  check(!problems.length, problems.join('\n'));
  await ctx.close();
});

await step('every copy corrupt: new game offered, nothing silently deleted', async () => {
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await openGame(ctx, problems, 'allbroken');
  await p.addInitScript(() => { localStorage.setItem('last-furnace-v2', 'not json'); localStorage.setItem('last-furnace-v2-backup', 'also not json'); });
  await p.goto(URL);
  await p.waitForFunction(() => !document.querySelector('#start-continue')?.disabled);
  check((await p.locator('#start-continue').textContent()).trim() === 'Start game', 'expected a new game');
  check(await p.evaluate(() => localStorage.getItem('last-furnace-v2-rescue') === 'not json'), 'unreadable save not rescued');
  check(!problems.length, problems.join('\n'));
  await ctx.close();
});

await step('blocked storage: the game still starts and plays', async () => {
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await openGame(ctx, problems, 'blocked');
  await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await p.goto(URL);
  await passStart(p);
  await p.evaluate(() => { Game.debug.grant({ meat: 1e6, wood: 1e6, coal: 1e6 }); Game.city.upgrade('furnace'); for (const t of Game.timers.list('build')) Game.timers.finishNow(t.id); });
  check(await p.evaluate(() => Game.city.level('furnace')) === 2, 'could not play with blocked storage');
  check(!problems.length, problems.join('\n'));
  await ctx.close();
});

await browser.close();
console.log(`soak: all ${passed} steps passed`);
