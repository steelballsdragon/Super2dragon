#!/usr/bin/env node
// Last Furnace smoke test: plays a first session against dist/index.html in headless Chromium.
//
//   node tests/smoke.mjs                 uses ../dist/index.html (run `node build.mjs` first)
//   node tests/smoke.mjs /abs/path.html  tests another build
//   SHOTS=/some/dir node tests/smoke.mjs puts the screenshot of a failed step there (default: the OS temp folder)
//
// Exit code 0 when every step passes, 1 otherwise. Playwright comes from the global install; nothing is downloaded.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const t of tries) {
    try { return require(t); } catch (e) { /* try the next one */ }
  }
  console.error('smoke: Playwright not found. Install it globally (npm i -g playwright) and try again.');
  process.exit(1);
}
const { chromium } = loadPlaywright();

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(process.argv[2] || join(HERE, '..', 'dist', 'index.html'));
if (!existsSync(FILE)) {
  console.error(`smoke: ${FILE} does not exist. Run "node build.mjs" first.`);
  process.exit(1);
}
const URL = pathToFileURL(FILE).href;
const FAIL_SHOT = join(process.env.SHOTS || tmpdir(), 'last-furnace-smoke-fail.png');
const ALLOWED_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const problems = [];   // console errors, page errors, unexpected requests
let page;
let passed = 0;

function check(cond, msg) { if (!cond) throw new Error(msg); }
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message.split('\n').slice(0, 12).join('\n       ')}`);
    try {
      const st = await Promise.race([
        page.evaluate(() => ({ screen: Game.screen(), sheets: Game.openSheets().map(h => h.el.querySelector('.sheet-title')?.textContent), rewards: document.querySelectorAll('.reward-wrap').length, active: document.activeElement?.id || document.activeElement?.className })),
        new Promise((_, rej) => setTimeout(() => rej(new Error('page did not answer within 5 s (main thread busy)')), 5000)),
      ]);
      console.log(`       page state: ${JSON.stringify(st)}`);
    } catch (err) { console.log(`       page state: ${err.message}`); }
    try { await page.screenshot({ path: FAIL_SHOT }); console.log(`       screenshot: ${FAIL_SHOT}`); } catch (err) { /* ignore */ }
    if (problems.length) console.log('       console/page errors so far:\n         ' + problems.join('\n         '));
    await browser.close();
    process.exit(1);
  }
}

const G = (fn, arg) => page.evaluate(fn, arg);
const state = () => G(() => JSON.parse(JSON.stringify(Game.S)));
const skip = sec => G(s => Game.debug.skip(s), sec);
const sheetTitles = () => G(() => [...document.querySelectorAll('.sheet-wrap.open .sheet-title')].map(n => n.textContent));
const topSheet = () => page.locator('.sheet-wrap.open').last();

async function waitSheet(title) {
  await page.waitForFunction(t => [...document.querySelectorAll('.sheet-wrap.open .sheet-title')].some(n => n.textContent === t), title, { timeout: 4000 })
    .catch(async () => { throw new Error(`sheet "${title}" did not open (open sheets: ${JSON.stringify(await sheetTitles())})`); });
  return page.locator('.sheet-wrap.open', { has: page.locator('.sheet-title', { hasText: title }) }).last();
}
async function closeRewards() {
  for (let i = 0; i < 10; i++) {
    const ok = page.locator('.reward-wrap .reward-ok');
    if (!(await ok.count())) return;
    await ok.first().click();
    await page.waitForTimeout(60);
  }
}
async function closeSheets() {
  await closeRewards();
  await G(() => Game.closeSheets());
  await page.waitForTimeout(300);
}
async function tab(id) {
  await page.click(`#tab-${id}`);
  await page.waitForFunction(i => Game.screen() === i, id);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page = await ctx.newPage();
page.setDefaultTimeout(10000);
const isFontUrl = u => { try { return ALLOWED_HOSTS.includes(new globalThis.URL(u).hostname); } catch (e) { return false; } };
page.on('console', m => {
  if (m.type() !== 'error') return;
  // font requests are aborted below on purpose; their load errors are not game errors
  if (/Failed to load resource/.test(m.text()) && isFontUrl(m.location()?.url || '')) return;
  problems.push(`console.error: ${m.text()}`);
});
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
page.on('request', r => {
  const u = r.url();
  if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return;
  let host = '';
  try { host = new globalThis.URL(u).hostname; } catch (e) { /* ignore */ }
  if (!ALLOWED_HOSTS.includes(host)) problems.push(`unexpected request: ${u}`);
});
// Stop font requests from slowing the run down; the page must work without them anyway.
await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());

console.log(`smoke: ${FILE}`);

let start;
// the start screen comes first on every fresh open; it enables its button once the save check is done
async function passStart(label) {
  const btn = page.locator('#start-continue');
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('#start-continue')?.disabled, null, { timeout: 10000 });
  const text = (await btn.textContent()).trim();
  check(text === label, `start button says "${text}", expected "${label}"`);
  await btn.click();
  await page.waitForFunction(() => window.Game && Game.isReady === true, null, { timeout: 10000 });
  await page.waitForFunction(() => !document.getElementById('start'), null, { timeout: 3000 });
}

await step('new game boots from the start screen', async () => {
  await page.goto(URL);
  check(await G(() => !Game.isReady), 'game booted before the start screen');
  check(await page.locator('#start-new').isHidden(), 'New game offered with no save');
  await passStart('Start game');
  start = await state();
  check(start.v === 2, 'state version is not 2');
  check(start.city.levels.furnace === 1, 'Furnace does not start at Lv 1');
  check(await G(() => Game.modules().join()) === 'city,mil,shop,prog', 'not all four modules registered');
  check(await G(() => document.documentElement.scrollWidth <= window.innerWidth), 'page scrolls sideways at 390px');
  for (const t of ['city', 'heroes', 'explore', 'events', 'shop']) check(await page.locator(`#tab-${t}`).isVisible(), `tab ${t} missing`);
});

await step('chapter banner shows the first quest', async () => {
  const banner = page.locator('#prog-banner');
  await banner.waitFor({ state: 'visible' });
  const text = await banner.innerText();
  check(/Furnace/.test(text) && /Lv/.test(text), `banner text unexpected: ${text}`);
  check((await page.locator('#prog-banner-act').innerText()).trim() === 'Go', 'banner button is not Go');
});

let furnaceSheet;
await step('open the Furnace sheet from the banner', async () => {
  await page.click('#prog-banner-act');
  furnaceSheet = await waitSheet('Furnace');
  check(await furnaceSheet.locator('.city-sh-lv').innerText().then(t => /Lv 1/.test(t)), 'Furnace sheet does not show Lv 1');
  check(await furnaceSheet.locator('[data-action="upgrade"]').isEnabled(), 'Upgrade is disabled');
});

await step('upgrade the Furnace', async () => {
  await furnaceSheet.locator('[data-action="upgrade"]').click();
  await page.waitForTimeout(300);
  const t = await G(() => Game.timers.get('build:furnace'));
  check(t && t.data.level === 2, 'no build timer for Furnace Lv 2');
  check(await G(() => Game.city.isUpgrading('furnace')), 'city does not report the upgrade');
});

await step('speed up the build (Free finish) and level up', async () => {
  await page.click('#city-b-furnace');
  const sh = await waitSheet('Furnace');
  const speed = sh.locator('[data-action="speed"]');
  await speed.waitFor({ state: 'visible' });
  check(/Free/.test(await speed.innerText()), 'short build does not offer a Free finish');
  await speed.click();
  await page.waitForFunction(() => Game.city.level('furnace') === 2);
  await closeSheets();
});

await step('claim the chapter quest from the banner', async () => {
  await page.waitForFunction(() => document.querySelector('#prog-banner-act')?.textContent.trim() === 'Claim');
  const before = (await state()).res.wood;
  await page.click('#prog-banner-act');
  await page.waitForSelector('.reward-wrap .reward-ok');
  await closeRewards();
  const after = (await state()).res.wood;
  check(after >= before + 500, `quest reward not granted (wood ${before} -> ${after})`);
});

await step('collect a resource bubble', async () => {
  await skip(150);
  await page.waitForTimeout(300);
  await G(() => Game.city.focus('sawmill'));
  await page.waitForTimeout(700);
  const bubble = page.locator('.city-bui[data-b="sawmill"] .city-bubble');
  await bubble.waitFor({ state: 'visible', timeout: 3000 });
  const before = (await state()).res.wood;
  // the bubble bobs, so check by hand that nothing covers its center, then tap it there
  const box = await bubble.boundingBox();
  const top = await G(([x, y]) => document.elementFromPoint(x, y)?.closest('.city-bubble')?.parentElement?.dataset.b || document.elementFromPoint(x, y)?.className, [box.x + box.width / 2, box.y + box.height / 2]);
  check(top === 'sawmill', `the sawmill bubble is covered by ${top}`);
  await bubble.click({ force: true });
  await page.waitForTimeout(200);
  const after = (await state()).res.wood;
  check(after > before, `collecting did not add wood (${before} -> ${after})`);
});

await step('assign a worker', async () => {
  await page.click('#city-b-sawmill');
  const sh = await waitSheet('Sawmill');
  const w0 = (await state()).city.workers.sawmill;
  await sh.locator('#city-w-minus-sawmill').click();
  check((await state()).city.workers.sawmill === w0 - 1, 'minus did not free a worker');
  await sh.locator('#city-w-plus-sawmill').click();
  check((await state()).city.workers.sawmill === w0, 'plus did not assign the worker back');
  await closeSheets();
  // the survivors sheet assigns too
  await page.click('#city-pop');
  const sv = await waitSheet('Survivors');
  check(await sv.locator('.city-wrow').count() >= 3, 'survivors sheet lists no producers');
  await closeSheets();
});

await step('free recruit gives an Epic hero', async () => {
  await tab('heroes');
  await page.click('#mil-sub-recruit');
  const free = page.locator('#mil-recruit-free');
  check(await free.isEnabled(), 'free recruit not ready on a new game');
  await free.click();
  await waitSheet('Recruit');
  await page.click('#mil-reveal-skip');
  await page.click('#mil-reveal-ok');
  await page.waitForTimeout(300);
  const s = await state();
  const ids = Object.keys(s.mil.heroes);
  check(ids.length === 2, `expected 2 heroes, have ${ids.join(',')}`);
  const epic = await G(id => Game.mil.heroDef(id).rarity, ids.find(i => i !== 'bram'));
  check(epic === 'epic', `first recruit was ${epic}, not epic`);
  check(!(await page.locator('#mil-recruit-free').isEnabled()), 'free recruit still enabled after use');
});

await step('set the squad', async () => {
  await page.click('#mil-sub-squad');
  const s0 = await state();
  const other = Object.keys(s0.mil.heroes).find(i => i !== 'bram');
  await page.click('.mil-slot[data-slot="0"]');
  await waitSheet('Squad slot 1');
  await page.click(`.mil-pick-row[data-pick="${other}"]`);
  await page.waitForTimeout(300);
  const s1 = await state();
  check(s1.mil.squad[0] === other, `slot 1 is ${s1.mil.squad[0]}, not ${other}`);
  check(s1.mil.squad.filter(Boolean).length === 2, 'squad lost a hero');
  const auto = page.locator('#mil-squad-auto');
  if (await auto.isEnabled()) await auto.click();
  check(await G(() => Game.mil.squad().length) === 2, 'squad does not hold both heroes');
});

await step('build the Infantry Camp', async () => {
  await G(() => Game.debug.grant({ wood: 5000, meat: 5000, coal: 1000 }));
  await G(() => Game.navigate('city:building:infantry_camp'));
  const sh = await waitSheet('Infantry Camp');
  await sh.locator('[data-action="upgrade"]').click();
  await page.waitForTimeout(200);
  check(await G(() => !!Game.timers.get('build:infantry_camp')), 'camp build did not start');
  await skip(30);
  await page.waitForFunction(() => Game.city.level('infantry_camp') === 1);
  await closeSheets();
});

await step('train troops and speed them up with items', async () => {
  await tab('heroes');
  await page.click('#mil-sub-troops');
  const before = (await state()).mil.troops.infantry;
  await page.click('#mil-camp-train-infantry');
  const sh = await waitSheet('Train Infantry');
  await sh.locator('[data-q="max"]').click();
  const qty = Number(await sh.locator('#mil-train-num-infantry').inputValue());
  check(qty >= 30, `max batch is only ${qty}`);
  await sh.locator('[data-action="train"]').click();
  await page.waitForTimeout(300);
  const t = await G(() => Game.timers.get('train:infantry'));
  check(t && t.data.count === qty, 'training timer missing');
  const rem = await G(() => Game.timers.remaining('train:infantry'));
  check(rem > 60, `training is too short to test speedups (${rem}s)`);
  await page.click('#mil-camp-speed-infantry');
  const sp = await waitSheet('Speed up');
  const items0 = (await state()).items.speedup_1m || 0;
  await sp.locator('.spd-row[data-id="speedup_1m"] [data-use="one"]').click();
  await page.waitForTimeout(150);
  check(((await state()).items.speedup_1m || 0) === items0 - 1, 'speedup item not consumed');
  check(await G(() => Game.timers.remaining('train:infantry')) <= rem - 59, 'speedup did not cut the timer');
  // finish: items until the Free window, then Free
  for (let i = 0; i < 10 && (await G(() => !!Game.timers.get('train:infantry'))); i++) {
    const fin = sp.locator('[data-action="finish"]');
    if (/Free/.test(await fin.innerText())) { await fin.click(); break; }
    await sp.locator('.spd-row[data-id="speedup_1m"] [data-use="one"]').click();
    await page.waitForTimeout(100);
  }
  await page.waitForFunction(() => !Game.timers.get('train:infantry'));
  const after = (await state()).mil.troops.infantry;
  check(after === before + qty, `troops ${before} + ${qty} != ${after}`);
  await closeSheets();
});

await step('fight stage 1-1 and win', async () => {
  await tab('explore');
  await page.click('#mil-fight');
  await waitSheet('Stage 1-1');
  await page.waitForTimeout(800);
  await page.click('#mil-battle-skip');
  const res = page.locator('.mil-battle .mil-bres');
  await res.waitFor({ state: 'visible' });
  check(/cleared/.test(await res.innerText()), `battle was not won: ${await res.innerText()}`);
  await page.click('#mil-battle-close');
  await page.waitForTimeout(300);
  check((await state()).mil.stage === 1, 'stage 1 not recorded as cleared');
});

await step('claim the idle chest', async () => {
  await skip(2 * 3600);
  await page.waitForTimeout(300);
  const claim = page.locator('#mil-idle-claim');
  check(await claim.isEnabled(), 'idle claim disabled after 2 hours');
  const before = await state();
  await claim.click();
  await page.waitForSelector('.reward-wrap .reward-ok');
  await closeRewards();
  const after = await state();
  check(after.mil.idle.min < 1, 'idle chest did not empty');
  check(after.res.meat > before.res.meat, 'idle chest gave no meat');
});

await step('buy the Starter Pack in test mode', async () => {
  await tab('shop');
  await page.click('#shop-tab-gems');
  const g0 = (await state()).res.gems;
  await page.locator('#shop-f-starter button').first().click();
  const sh = await waitSheet('Confirm purchase');
  check(/Starter Pack/.test(await sh.innerText()), 'purchase sheet does not name the Starter Pack');
  check(/Test mode\. No money is charged\./.test(await sh.innerText()), 'test-mode notice missing');
  check(!(await page.locator('.sheet-wrap.open input[type="text"], .sheet-wrap.open input[autocomplete*="cc"]').count()), 'payment fields found');
  await sh.locator('[data-action="demo-buy"]').click();
  await page.waitForSelector('.reward-wrap .reward-ok', { timeout: 5000 });
  await closeRewards();
  const s = await state();
  check(s.shop.owned['lf.pack.starter'], 'starter pack not owned');
  check(s.res.gems > g0, 'starter pack gave no gems');
  await page.waitForTimeout(300);
  check(!(await page.locator('#shop-f-starter').count()), 'starter offer still shown after purchase');
});

await step('buy and claim the Monthly Card', async () => {
  await closeSheets();
  await page.click('#shop-tab-packs');
  await page.locator('#shop-p-card button[data-buy], #shop-p-card .btn').first().click();
  const sh = await waitSheet('Confirm purchase');
  check(/Monthly Card/.test(await sh.innerText()), 'purchase sheet does not name the Monthly Card');
  await sh.locator('[data-action="demo-buy"]').click();
  await page.waitForSelector('.reward-wrap .reward-ok', { timeout: 5000 });
  await closeRewards();
  check(await G(() => Game.shop.monthlyCard().active), 'monthly card not active');
  if (!(await G(() => Game.shop.monthlyCard().claimable))) await skip(24 * 3600);
  await page.waitForTimeout(400);
  const g0 = (await state()).res.gems;
  const claim = page.locator('#shop-p-card button', { hasText: 'Claim' });
  await claim.first().click();
  await page.waitForTimeout(300);
  await closeRewards();
  check((await state()).res.gems >= g0 + 100, 'monthly card daily gems not granted');
  check(!(await G(() => Game.shop.monthlyCard().claimable)), 'monthly card still claimable');
});

await step('claim mail and the login reward', async () => {
  await closeSheets();
  await tab('city');
  const g0 = (await state()).res.gems;
  await page.click('#city-side-prog-mail');
  const mail = await waitSheet('Mail');
  await mail.locator('[data-action="mail-claim-all"]').click();
  await page.waitForTimeout(200);
  await closeRewards();
  const g1 = (await state()).res.gems;
  check(g1 >= g0 + 500, `mail gems not granted (${g0} -> ${g1})`);
  check(await G(() => Game.prog.mailUnread()) === 0, 'mail still counts unread or unclaimed letters');
  await closeSheets();
  await page.click('#city-side-prog-login');
  await page.waitForFunction(() => Game.screen() === 'events');
  const btn = page.locator('#prog-login-claim');
  await btn.waitFor({ state: 'visible' });
  check(await btn.isEnabled(), 'login claim disabled');
  await btn.click();
  await page.waitForTimeout(200);
  await closeRewards();
  check(!(await page.locator('#prog-login-claim').isEnabled()), 'login can be claimed twice');
});

await step('badges clear after claiming', async () => {
  await tab('city');
  await page.waitForTimeout(700);
  const dots = await G(() => Object.fromEntries([...document.querySelectorAll('.city-sidebtn')].map(b => [b.dataset.side, !b.querySelector('.badge-dot').hidden])));
  check(dots['prog-mail'] === false, 'Mail side button still shows a dot');
  check(dots['prog-login'] === false, 'Login side button still shows a dot');
  check(dots['mil-recruit'] === false, 'Recruit side button still shows a dot after the free recruit');
  check(!(await G(() => Game.prog.loginReady())), 'login still ready');
  check(!(await G(() => Game.shop.monthlyCard().claimable)), 'monthly card still claimable');
});

let saved;
await step('reload restores the save', async () => {
  saved = await state();
  await page.reload();
  await page.locator('.start-save-txt').waitFor({ state: 'visible', timeout: 10000 });
  const card = await page.locator('.start-save-txt').textContent();
  check(card.includes(`Furnace Lv ${saved.city.levels.furnace}`), `start card does not show the saved furnace level: ${card}`);
  check(await page.locator('#start-new').isVisible(), 'New game not offered on the start screen');
  await passStart('Continue');
  const s = await state();
  check(s.city.levels.furnace === saved.city.levels.furnace, `furnace level ${s.city.levels.furnace} != ${saved.city.levels.furnace}`);
  check(s.city.levels.infantry_camp === 1, 'infantry camp lost');
  check(Math.abs(s.res.gems - saved.res.gems) < 1, `gems ${s.res.gems} != ${saved.res.gems}`);
  check(Object.keys(s.mil.heroes).sort().join() === Object.keys(saved.mil.heroes).sort().join(), 'heroes not restored');
  check(s.mil.stage === 1, 'stage progress lost');
  check(s.shop.owned['lf.pack.starter'], 'starter purchase lost');
  check(s.mil.troops.infantry === saved.mil.troops.infantry, 'troops lost');
});

await step('no console errors, page errors or network requests', async () => {
  await page.waitForTimeout(500);
  check(problems.length === 0, problems.join('\n'));
});

await browser.close();
console.log(`smoke: all ${passed} steps passed`);
