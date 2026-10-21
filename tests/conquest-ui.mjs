#!/usr/bin/env node
// Age of Conquest interface test: plays the opening of a world through the UI in headless Chromium against
// dist/index.html, with the simulation in its Web Worker, then again with the on-page fallback and in landscape:
// the start screen, the guide, the drawn city and its building sheets, Free finish, crates, the chapter banner,
// training, an attack from the map and its battle scene, guilds, history, saves, and developer mode.
//
//   node tests/conquest-ui.mjs [path/to/dist/index.html]
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
if (!chromium) { console.error('conquest-ui: Playwright not found'); process.exit(1); }
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(process.argv[2] || join(HERE, '..', 'dist', 'index.html'));
if (!existsSync(FILE)) { console.error(`conquest-ui: ${FILE} does not exist. Run "node build.mjs" first.`); process.exit(1); }
const URL = pathToFileURL(FILE).href;
const SHOT = join(process.env.SHOTS || tmpdir(), 'conquest-ui-fail.png');

const problems = [];
let passed = 0, page;
const browser = await chromium.launch();
function check(cond, msg) { if (!cond) throw new Error(msg); }
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`  ok  ${name} (${Date.now() - t0} ms)`); } catch (e) {
    console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').slice(0, 8).join('\n       ')}`);
    try { await page.screenshot({ path: SHOT }); console.log(`       screenshot: ${SHOT}`); } catch (err) { /* ignore */ }
    if (problems.length) console.log('       errors so far:\n         ' + problems.join('\n         '));
    await browser.close();
    process.exit(1);
  }
}
async function newPage(viewport, init) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.route(/^https?:\/\//, r => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.request().url())) problems.push('network request: ' + r.request().url()); r.abort(); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console.error: ' + m.text()); });
  p.on('pageerror', e => problems.push('pageerror: ' + e.message));
  if (init) await p.addInitScript(init);
  return p;
}
const F = () => page.evaluate(() => { const f = window.AOCUI.F; return { t: f.t, day: f.day, P: f.player, quests: f.quests, rallies: f.rallies, unread: f.unread, guilds: f.guilds.length }; });
async function closeSheets() { await page.evaluate(() => window.AOCUI.closeSheets()); await page.waitForTimeout(250); }
async function tapTile(x, y) {
  await page.evaluate(([x, y]) => window.AOCUI.mapFocus(x, y, 16), [x, y]);
  await page.waitForTimeout(250);
  const box = await page.locator('.aoc-map-cv').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('.aoc-sheet-wrap.is-open');
}
async function newWorld(civ, name) {
  await page.goto(URL);
  await page.click('#aoc-new');
  await page.click(`[data-civ="${civ}"]`);
  await page.fill('#aoc-name', name);
  await page.click('#aoc-found');
  await page.waitForSelector('.aoc-town-cv', { timeout: 30000 });
  await page.waitForFunction(() => window.AOCUI.F && window.AOCUI.current === 'city');
}
// tap a building in the drawn city where it is on screen
async function tapBuilding(id) {
  // look at it first, as a player scrolls the town to find it, then tap the building itself
  await page.evaluate(i => window.AOCUI.home.focus(i), id);
  await page.waitForTimeout(200);
  const p = await page.evaluate(i => window.AOCUI.home.where(i), id);
  await page.mouse.click(p.x, p.y);
  const name = await page.evaluate(i => window.AOC.BUILDINGS[i].name, id);
  await page.waitForFunction(n => [...document.querySelectorAll('.aoc-sheet-wrap.is-open .aoc-sheet-title')].some(t => t.textContent === n), name)
    .catch(async () => { throw new Error(`tapping the ${id} did not open its sheet (selected ${await page.evaluate(() => window.AOCUI.home.sel)})`); });
  await page.waitForSelector('.aoc-bsheet .aoc-bs-lv');
}
// how varied a canvas is: distinct colours in a sample of its pixels
const variety = sel => page.evaluate(s => {
  const c = document.querySelector(s);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  let lit = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 61) { seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); if (d[i] + d[i + 1] + d[i + 2] > 90) lit++; n++; }
  return { colors: seen.size, lit, n };
}, sel);

console.log(`conquest-ui: ${FILE}`);
page = await newPage({ width: 390, height: 844 });

await step('the start screen opens straight into Age of Conquest with its artwork', async () => {
  await page.goto(URL);
  await page.waitForSelector('.aoc-logo img');
  check(await page.locator('.aoc-logo img').evaluate(i => i.naturalWidth > 100), 'the logo did not load');
  check(await page.title() === 'Age of Conquest', `title is ${await page.title()}`);
  check(await page.evaluate(() => !document.getElementById('app') && !document.getElementById('start') && !window.Game), 'the old city game is still in the page');
  check((await page.locator('#aoc-new').textContent()).includes('Start game'), 'no Start game button');
  check(/Saved on this device/.test(await page.locator('.aoc-savecard').textContent()), 'the save card does not say where saves go');
});

await step('a new world: server facts, twelve civilizations, a name, and the simulation starts in a worker', async () => {
  await page.click('#aoc-new');
  check(await page.locator('.aoc-civ').count() === 12, 'expected 12 civilizations');
  check((await page.locator('.aoc-facts').textContent()).includes('599 simulated governors'), 'server facts missing');
  await page.click('[data-civ="steppe"]');
  await page.fill('#aoc-name', 'Uitest');
  await page.click('#aoc-found');
  await page.waitForSelector('.aoc-town-cv', { timeout: 30000 });
  await page.waitForFunction(() => window.AOCUI.F);
  check(await page.evaluate(() => window.AOCUI.host.mode) === 'worker', 'the simulation is not in a worker');
  const f = await F();
  check(f.P.name === 'Uitest' && f.P.civ === 'steppe' && f.guilds === 10, 'wrong player or guilds');
});

await step('a short welcome, then the Tap marker points at the Town Hall in the drawn city', async () => {
  await page.waitForSelector('#aoc-welcome-go');
  await page.click('#aoc-welcome-go');
  await page.waitForSelector('.aoc-hand:not([hidden])');
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => { const t = window.AOCUI.guideTarget(), h = window.AOCUI.home.where('hall'); return t && h ? Math.hypot(t.x - h.x, t.y - h.y) : -1; });
  check(d >= 0 && d < 4, `the Tap marker is not on the Town Hall (${d})`);
  check((await page.locator('.aoc-tap-t').textContent()) === 'Tap', 'the marker does not say Tap');
  const v = await variety('.aoc-town-cv');
  check(v.colors > 60, `the city looks flat (${JSON.stringify(v)})`);
});

await step('the world map draws castles and terrain around the city and hides the unexplored world', async () => {
  await page.click('#aoc-tab-map');
  await page.waitForTimeout(500);
  const stats = await page.evaluate(() => {
    const c = document.querySelector('.aoc-map-cv');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4 * 97) { if (d[i] + d[i + 1] + d[i + 2] > 90) lit++; else dark++; }
    return { lit, dark };
  });
  check(stats.lit > 50, `the map looks empty (${JSON.stringify(stats)})`);
  check(stats.dark > 50, 'no fog of war on screen');
  const v = await variety('.aoc-map-cv');
  check(v.colors > 60, `the map looks flat (${JSON.stringify(v)})`);
  const P = (await F()).P;
  await tapTile(P.x, P.y);
  check((await page.locator('.aoc-sheet-body').textContent()).includes('Your city'), 'tapping your city did not say so');
  await closeSheets();
});

await step('city: tap the Town Hall, read its sheet, upgrade it, finish it free and claim the goal', async () => {
  await page.click('#aoc-tab-city');
  await page.waitForFunction(() => window.AOCUI.current === 'city');
  check(await page.locator('.aoc-plate').count() === 15, 'not every building has its plate');
  check((await page.locator('[data-plate="hall"] .aoc-plate-lv').textContent()) === '1', 'the Town Hall plate does not show level 1');
  await tapBuilding('hall');
  const txt = await page.locator('.aoc-bsheet').textContent();
  check(/Lv 1.*Lv 2/.test(txt) && /Effects/i.test(txt) && /Cost/i.test(txt), `the building sheet is incomplete: ${txt.slice(0, 160)}`);
  check(await page.locator('.aoc-eff').count() >= 2, 'no effects listed');
  await page.click('#aoc-up-go');
  await page.waitForFunction(() => window.AOCUI.F.player.q.build?.id === 'hall');
  // a short build can be finished free: from the builder, the timer over the hall, or the sheet
  await page.waitForSelector('.aoc-builder.is-free');
  await tapBuilding('hall');
  await page.waitForSelector('#aoc-free:not([disabled])');
  await page.click('#aoc-free');
  await page.waitForFunction(() => window.AOCUI.F.player.b.hall === 2);
  await closeSheets();
  check((await page.locator('[data-plate="hall"] .aoc-plate-lv').textContent()) === '2', 'the plate did not move to level 2');
  // the chapter banner turns to Claim, and claiming shows the reward
  await page.waitForSelector('.aoc-screen-city .aoc-cbanner.is-claim [data-claim="hall2"]');
  const food = (await F()).P.res.food;
  await page.click('.aoc-screen-city [data-claim="hall2"]');
  await page.waitForSelector('.aoc-reward .aoc-reward-ok');
  check(await page.locator('.aoc-reward-item').count() === 2, 'the reward pop-up does not show both rewards');
  await page.click('.aoc-reward-ok');
  await page.waitForFunction(f => window.AOCUI.F.player.res.food > f + 2000, food);
});

await step('crates: tap a full crate over the farm to collect an hour of food; Go opens the next goal', async () => {
  await page.evaluate(() => window.AOCUI.home.focus('farm'));
  await page.waitForSelector('[data-crate="farm"]:not([hidden])');
  const f0 = await F();
  const hour = Math.floor(f0.P.prod.food);
  await page.click('[data-crate="farm"]', { force: true });
  await page.waitForFunction(() => window.AOCUI.F.player.res.food > 0 && document.querySelector('[data-crate="farm"]').hidden);
  const f1 = await F();
  check(f1.P.res.food - f0.P.res.food >= hour * 0.95, `the crate gave ${Math.round(f1.P.res.food - f0.P.res.food)}, an hour is ${hour}`);
  check(await page.locator('.aoc-float').count() >= 1, 'no number floated up');
  // Go on the banner opens the Farm's sheet for the next goal
  await page.waitForSelector('.aoc-screen-city .aoc-cbanner [data-qgo="farm2"].aoc-btn');
  await page.click('.aoc-screen-city .aoc-cbanner .aoc-btn[data-qgo="farm2"]');
  await page.waitForFunction(() => [...document.querySelectorAll('.aoc-sheet-wrap.is-open .aoc-sheet-title')].some(t => t.textContent === 'Farm'));
  await closeSheets();
});

await step('army: train infantry at the Barracks and in the army screen, and read a commander', async () => {
  await tapBuilding('barracks');
  await page.click('.aoc-bsheet [data-bx="train"]');
  await page.waitForSelector('#aoc-train-go');
  await page.fill('.aoc-trs input[type=number]', '40');
  await page.click('#aoc-train-go');
  await page.waitForFunction(() => window.AOCUI.F.player.q.train.inf?.n === 40);
  await page.waitForFunction(() => !window.AOCUI.F.player.q.train.inf, null, { timeout: 20000 });
  await closeSheets();
  await page.click('#aoc-tab-army');
  await page.fill('[data-tn="inf"]', '250');
  await page.click('[data-train="inf"]');
  // more than one batch is trimmed to a full batch (159 at Barracks level 1)
  await page.waitForFunction(() => window.AOCUI.F.player.q.train.inf?.n === 159);
  await page.click('[data-atab="cmds"]');
  await page.click('[data-cmd="temur"]');
  await page.waitForSelector('.aoc-sheet-wrap.is-open');
  const txt = await page.locator('.aoc-sheet-body').textContent();
  check(txt.includes('Storm of Arrows') && txt.includes('Talents'), 'commander sheet incomplete');
  await closeSheets();
  await page.click('[data-atab="troops"]');
  await page.waitForFunction(() => window.AOCUI.F.player.stats.trained.inf >= 199, null, { timeout: 40000 });
});

await step('attack the nearest bandit camp from the map; the report explains it and its replay matches', async () => {
  await page.click('#aoc-tab-map');
  // the newcomer camps: level 1, near the start (a stronger camp may happen to be closer on some maps)
  const camp = await page.evaluate(() => { const F = window.AOCUI.F, P = F.player; const c = F.camps.filter(x => x.lv === 1).sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0]; return c ? { ...c, d: Math.hypot(c.x - P.x, c.y - P.y) } : null; });
  check(camp && camp.d < 14, `expected a level 1 camp near the start, got ${JSON.stringify(camp)}`);
  await page.click('[data-speed="4"]');
  await tapTile(camp.x, camp.y);
  await page.locator('.aoc-sheet-actions .aoc-btn', { hasText: 'Attack' }).click();
  await page.waitForSelector('#aoc-march-go');
  await page.waitForFunction(() => /favor|Even|Against/.test(document.querySelector('.aoc-estimate')?.textContent || ''));
  await page.click('#aoc-march-go');
  await page.waitForFunction(() => window.AOCUI.F.marches.some(m => m.mine && m.kind === 'attack'));
  await page.waitForFunction(() => window.AOCUI.F.unread > 0, null, { timeout: 40000 });
  await page.click('#aoc-tab-intel');
  await page.waitForSelector('[data-rep]');
  await page.click('[data-rep]');
  await page.waitForSelector('.aoc-bscene-cv');
  await page.waitForTimeout(1500);
  const v = await variety('.aoc-bscene-cv');
  check(v.colors > 40, `the battle scene looks empty (${JSON.stringify(v)})`);
  await page.click('[data-bs="skip"]');
  await page.click('[data-rp="details"]');
  await page.waitForSelector('.aoc-replay');
  await page.waitForFunction(() => /exactly the same result/.test(document.querySelector('.aoc-rp-verify')?.textContent || ''), null, { timeout: 8000 });
  check((await page.locator('.aoc-battle').textContent()).includes('Why'), 'no explanation');
  await page.click('[data-rp="play"]');
  await page.waitForTimeout(600);
  await closeSheets();
});

await step('guilds: the ten guilds are listed and the player can apply', async () => {
  await page.click('#aoc-tab-guild');
  await page.waitForSelector('[data-apply]');
  check(await page.locator('.aoc-gcard').count() === 10, 'expected ten guild cards');
  const near = await page.evaluate(() => { const F = window.AOCUI.F, P = F.player; return F.guilds.filter(g => !g.collapsed && g.members < 60).sort((a, b) => Math.hypot(a.home.x - P.x, a.home.y - P.y) - Math.hypot(b.home.x - P.x, b.home.y - P.y))[0].id; });
  await page.click(`[data-apply="${near}"]`);
  await page.waitForTimeout(700);
  const f = await F();
  const toast = await page.locator('.aoc-toast').last().textContent();
  check(f.P.guild === near || /turned you down|sent/.test(toast), `no answer to the application: ${toast}`);
});

await step('history and rankings: the chronicle, the real population and the simulation tiers', async () => {
  await page.click('#aoc-tab-chron');
  await page.waitForSelector('.aoc-chron li');
  check(await page.locator('.aoc-chron li').count() >= 5, 'the chronicle is nearly empty');
  await page.click('#aoc-tab-ranks');
  await page.click('[data-rtab="server"]');
  await page.waitForFunction(() => /Simulated governors/.test(document.querySelector('.aoc-rtab')?.textContent || ''));
  const txt = await page.locator('.aoc-rtab').textContent();
  check(/Governor slots\s*600/.test(txt) && /Simulated governors\s*599/.test(txt) && /Played by you\s*1/.test(txt), 'population is wrong');
  await page.click('[data-rtab="power"]');
  await page.waitForSelector('.aoc-ranktable tr.is-me, .aoc-rtab p b');
});

await step('the world is saved, survives a reload, and continues', async () => {
  const before = await F();
  await page.evaluate(() => window.AOCUI.host.post({ type: 'save' }));
  await page.waitForFunction(() => window.AOCUI.saveState === 'saved' && Date.now() - window.AOCUI.lastSave < 5000, null, { timeout: 8000 });
  await page.reload();
  await page.waitForSelector('#aoc-continue:not([hidden])');
  check((await page.locator('.aoc-savecard').textContent()).includes('Uitest'), 'save card does not show the governor');
  await page.click('#aoc-continue');
  await page.waitForSelector('.aoc-town-cv', { timeout: 30000 });
  await page.waitForFunction(() => window.AOCUI.F);
  const after = await F();
  check(after.P.name === 'Uitest' && after.P.b.hall >= 2 && after.t >= before.t - 5, `the reloaded world is not the same (${before.t} -> ${after.t})`);
});

await step('a sandbox without workers runs the simulation on the page instead', async () => {
  page = await newPage({ width: 390, height: 844 }, () => { window.AOCUI = { forcePage: true }; });
  await newWorld('golden', 'Pagemode');
  check(await page.evaluate(() => window.AOCUI.host.mode) === 'page', 'expected page mode');
  const t0 = (await F()).t;
  await page.waitForFunction(t => window.AOCUI.F.t >= t + 3, t0, { timeout: 15000 });
});

await step('landscape: the tabs move to a rail on the left and nothing overflows', async () => {
  page = await newPage({ width: 844, height: 390 });
  await newWorld('frost', 'Wide');
  await closeSheets();
  const r = await page.evaluate(() => {
    const t = document.querySelector('.aoc-tabs').getBoundingClientRect();
    return { left: t.left, width: t.width, height: t.height, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  check(r.left === 0 && r.width < 120 && r.height > 300, `tabs not on the left: ${JSON.stringify(r)}`);
  check(!r.overflow, 'the page overflows sideways');
});

await step('the Coalition War demonstration starts on Day 3 with a dominant guild', async () => {
  page = await newPage({ width: 390, height: 844 });
  await page.goto(URL);
  await page.click('#aoc-new');
  await page.click('[data-scn="coalition"]');
  await page.click('#aoc-found');
  await page.waitForSelector('.aoc-town-cv', { timeout: 30000 });
  await page.waitForFunction(() => window.AOCUI.F);
  const s = await page.evaluate(() => { const f = window.AOCUI.F; const tot = f.guilds.reduce((a, g) => a + g.power, 0); return { scenario: f.scenario, day: f.day, top: Math.max(...f.guilds.map(g => g.power)) / tot, hall: f.player.b.hall }; });
  check(s.scenario === 'coalition' && s.day === 3 && s.top > 0.28 && s.hall === 12, `unexpected start: ${JSON.stringify(s)}`);
});

await step('developer mode adds fast speeds and the developer panel', async () => {
  page = await newPage({ width: 390, height: 844 }, () => { try { localStorage.setItem('last-furnace-dev', '1'); } catch (e) { /* ignore */ } });
  await newWorld('forge', 'Devtest');
  await closeSheets();
  check(await page.locator('[data-speed="64"]').count() === 1, 'no 64x speed');
  await page.click('[data-side="dev"]');
  await page.click('[data-sw="unlimited"]');
  await page.waitForFunction(() => window.AOCUI.F.player.res.gold >= 50e6);
});

await step('no console errors, page errors or outside requests', async () => {
  check(problems.length === 0, problems.join('\n'));
});

await browser.close();
console.log(`conquest-ui: all ${passed} steps passed`);
