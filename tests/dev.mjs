#!/usr/bin/env node
// Last Furnace developer mode test: the hidden 7-tap toggle on the start screen and every control on the Dev
// panel, driven through the UI in headless Chromium.
//
//   node tests/dev.mjs [path/to/dist/index.html]
//
// Exit code 0 when every step passes, 1 otherwise.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
for (const t of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(t)); break; } catch (e) { /* next */ } }
if (!chromium) { console.error('dev: Playwright not found'); process.exit(1); }

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(process.argv[2] || join(HERE, '..', 'dist', 'index.html'));
if (!existsSync(FILE)) { console.error(`dev: ${FILE} does not exist. Run "node build.mjs" first.`); process.exit(1); }
const URL = pathToFileURL(FILE).href;
const LOTS = 999999999;

const problems = [];
let passed = 0;
const browser = await chromium.launch();
function check(cond, msg) { if (!cond) throw new Error(msg); }
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`  ok  ${name} (${Date.now() - t0} ms)`); } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message.split('\n').slice(0, 10).join('\n       ')}`);
    if (problems.length) console.log('       errors so far:\n         ' + problems.join('\n         '));
    await browser.close();
    process.exit(1);
  }
}
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));

const tapLogo = async n => { for (let i = 0; i < n; i++) await page.click('.start-brand', { position: { x: 20, y: 20 } }); };
async function openStart() {
  await page.goto(URL);
  await page.waitForFunction(() => !document.querySelector('#start-continue')?.disabled, null, { timeout: 12000 });
}
async function play() {
  await page.click('#start-continue');
  await page.waitForFunction(() => window.Game && Game.isReady === true);
  await page.evaluate(() => { Game.closeSheets(); document.querySelectorAll('.reward-wrap button').forEach(b => b.click()); });
}
async function panel() {
  if (!(await page.locator('.dev-sheet').count())) await page.click('#city-side-dev');
  await page.waitForSelector('.dev-sheet.open');
}
const act = async id => { await panel(); await page.click(`.dev-act[data-act="${id}"]`); };
const S = fn => page.evaluate(fn);

console.log(`dev: ${FILE}`);

await step('developer mode is off and hidden by default', async () => {
  await openStart();
  check(await page.locator('.start-dev').isHidden(), 'developer note shown before it was turned on');
  await play();
  check(!(await page.locator('#city-side-dev').count()), 'Dev button shown while developer mode is off');
  check((await S(() => Game.dev.open())) === null, 'panel opened while developer mode is off');
  await page.evaluate(() => Game.save());
});

await step('six taps do nothing, seven taps turn it on and it stays on after a reload', async () => {
  await openStart();
  await tapLogo(6);
  check(await page.locator('.start-dev').isHidden(), 'six taps turned developer mode on');
  await page.waitForTimeout(1600);
  await tapLogo(1);
  check(!(await S(() => Game.devMode())), 'slow taps were counted together');
  await page.waitForTimeout(1600);
  await tapLogo(7);
  check(await S(() => Game.devMode()), 'seven taps did not turn developer mode on');
  check((await page.locator('.start-dev').textContent()).includes('on'), 'start screen does not say developer mode is on');
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#start-continue')?.disabled, null, { timeout: 12000 });
  check(await page.locator('.start-dev').isVisible(), 'developer mode did not survive a reload');
  await play();
  await page.waitForSelector('#city-side-dev');
});

await step('unlimited gems and resources stay full after spending', async () => {
  await panel();
  await page.click('.dev-switch[data-sw="unlimited"]');
  check((await page.getAttribute('.dev-switch[data-sw="unlimited"]', 'aria-pressed')) === 'true', 'switch did not turn on');
  const res = await S(() => ({ ...Game.S.res }));
  for (const k of ['meat', 'wood', 'coal', 'iron', 'gems']) check(res[k] >= LOTS, `${k} is ${res[k]}`);
  const after = await S(() => { Game.spend({ gems: 5000, wood: 100000 }, 'test'); return { gems: Game.S.res.gems, wood: Game.S.res.wood }; });
  check(after.gems >= LOTS && after.wood >= LOTS, `spending lowered the stock: ${JSON.stringify(after)}`);
  await page.waitForTimeout(1200);
  check((await S(() => Game.S.res.gems)) >= LOTS, 'gems dropped on the next tick');
});

await step('instant builds and training finish as they start', async () => {
  await page.click('.dev-switch[data-sw="instant"]');
  const lv = await S(() => Game.city.level('furnace'));
  await S(() => Game.city.upgrade('furnace'));
  await page.waitForFunction(l => Game.city.level('furnace') === l + 1 && Game.timers.list().length === 0, lv, { timeout: 3000 });
});

await step('every item fills to 999', async () => {
  await act('items');
  const short = await S(() => Object.keys(Game.itemDefs).filter(id => Game.itemCount(id) < 999));
  check(short.length === 0, `items below 999: ${short.join(', ')}`);
});

await step('max every building raises the Furnace to 30 and every building to its cap', async () => {
  await act('city');
  const r = await S(() => Game.city.ids.map(id => [id, Game.city.level(id), Game.city.maxLevel(id)]));
  check(r.find(x => x[0] === 'furnace')[1] === 30, 'Furnace is not at 30');
  const low = r.filter(([, L, max]) => L < max);
  check(low.length === 0, `buildings below their cap: ${JSON.stringify(low)}`);
  const before = await S(() => Game.mil.troopCount('infantry'));
  check(await S(() => Game.mil.startTraining('infantry', 10)), 'training did not start');
  await page.waitForFunction(() => Game.timers.list().length === 0, null, { timeout: 3000 });
  check((await S(() => Game.mil.troopCount('infantry'))) >= before + 10, 'training did not finish at once');
});

await step('every hero is owned at the level cap with five stars', async () => {
  await act('heroes');
  const r = await S(() => ({ all: Game.mil.HEROES.length, owned: Game.mil.heroIds().length, cap: Game.mil.heroMaxLevel(), heroes: Game.mil.HEROES.map(h => [Game.mil.heroLevel(h.id), Game.mil.heroStars(h.id)]) }));
  check(r.owned === r.all, `owns ${r.owned} of ${r.all} heroes`);
  check(r.heroes.every(([lv, st]) => lv === r.cap && st === 5), `not every hero is maxed: ${JSON.stringify(r.heroes)}`);
});

await step('max VIP, clear every stage, fill survivors, finish timers', async () => {
  await act('vip');
  check((await S(() => Game.shop.vipLevel())) === 12, 'VIP is not 12');
  await act('stages');
  check((await S(() => Game.mil.highestStage())) === (await S(() => Game.mil.MAX_STAGE)), 'stages not all cleared');
  await act('people');
  const p = await S(() => Game.city.survivors());
  check(p.total >= p.cap && p.sick === 0, `survivors not filled: ${JSON.stringify(p)}`);
  await act('timers');
});

await step('time skips move the clock and the city keeps up', async () => {
  await panel();
  const t0 = await S(() => Game.now());
  await page.click('[data-skip="1h"]');
  const t1 = await S(() => Game.now());
  check(t1 - t0 >= 3600e3, `+1 hour moved ${(t1 - t0) / 1000}s`);
  const s0 = Date.now();
  await page.click('[data-skip="1d"]');
  check(Date.now() - s0 < 8000, 'a one day skip took too long');
  check((await S(() => Game.now())) - t1 >= 86400e3, '+1 day did not move the clock a day');
});

await step('a blizzard can be started on demand and runs without freezing the page', async () => {
  await act('storm');
  await page.evaluate(() => Game.closeSheets());
  await page.waitForFunction(() => Game.city.temperature().blizzard, null, { timeout: 8000 });
  const t0 = Date.now();
  await page.waitForTimeout(3000);
  const ping = await Promise.race([S(() => 'ok'), new Promise(r => setTimeout(() => r('busy'), 3000))]);
  check(ping === 'ok', 'page stopped answering during the blizzard');
  check((await S(() => Game.city._snowCount())) <= 900, 'too many snowflakes');
  check(Date.now() - t0 < 9000, 'blizzard step ran long');
});

await step('the save keeps the dev settings and the panel shows live numbers', async () => {
  await panel();
  check((await page.locator('.dev-now').textContent()).includes('Furnace Lv 30'), 'status line is wrong');
  await S(() => Game.save());
  const saved = await S(() => JSON.parse(localStorage.getItem('last-furnace-v2')).dev);
  check(saved.unlimited === true && saved.instant === true, `dev settings not saved: ${JSON.stringify(saved)}`);
});

await step('turning developer mode off removes the button and stops the top-ups', async () => {
  await panel();
  await page.click('.dev-sheet .sheet-actions button >> nth=0');
  await page.waitForFunction(() => !document.querySelector('#city-side-dev'));
  check(!(await S(() => Game.devMode())), 'developer mode still on');
  await S(() => { Game.S.res.gems = 5000; });
  await page.waitForTimeout(1200);
  check((await S(() => Game.S.res.gems)) === 5000, 'gems still topped up with developer mode off');
});

await step('no console or page errors', async () => {
  check(problems.length === 0, problems.join('\n'));
});

await browser.close();
console.log(`dev: all ${passed} steps passed`);
