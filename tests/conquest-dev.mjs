#!/usr/bin/env node
// Developer mode test: the hidden switch (7 taps on the start screen logo) and every tool of the developer panel,
// played through the interface in headless Chromium against dist/index.html.
//
//   node tests/conquest-dev.mjs [path/to/dist/index.html]
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
if (!chromium) { console.error('conquest-dev: Playwright not found'); process.exit(1); }
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(process.argv[2] || join(HERE, '..', 'dist', 'index.html'));
if (!existsSync(FILE)) { console.error(`conquest-dev: ${FILE} does not exist. Run "node build.mjs" first.`); process.exit(1); }
const URL = pathToFileURL(FILE).href;
const SHOT = join(process.env.SHOTS || tmpdir(), 'conquest-dev-fail.png');

const problems = [];
let passed = 0;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
await page.route(/^https?:\/\//, r => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.request().url())) problems.push('network request: ' + r.request().url()); r.abort(); });
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console.error: ' + m.text()); });
page.on('pageerror', e => problems.push('pageerror: ' + e.message));
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
const P = () => page.evaluate(() => JSON.parse(JSON.stringify(window.AOCUI.F.player)));
const tapLogo = async n => { for (let i = 0; i < n; i++) await page.click('.aoc-brand'); };
async function closeSheets() { await page.evaluate(() => window.AOCUI.closeSheets()); await page.waitForTimeout(250); }
async function openPanel() {
  await closeSheets();
  await page.click('[data-side="dev"]');
  await page.waitForSelector('.aoc-dev .aoc-switch');
}
async function devAct(cmd) {
  const b = page.locator(`[data-dev="${cmd}"]`);
  await b.click();
  await page.waitForFunction(c => !document.querySelector(`[data-dev="${c}"]`).disabled, cmd);
}

console.log(`conquest-dev: ${FILE}`);

await step('developer mode is off and hidden by default', async () => {
  await page.goto(URL);
  await page.waitForSelector('#aoc-new');
  check(await page.locator('.aoc-devnote').isHidden(), 'the developer note shows');
  await page.click('#aoc-new');
  await page.click('#aoc-found');
  await page.waitForFunction(() => window.AOCUI.F && window.AOCUI.current === 'city', null, { timeout: 30000 });
  await closeSheets();
  check(await page.locator('[data-side="dev"]').isHidden(), 'the Dev button shows');
  check(await page.locator('[data-speed="64"]').count() === 0, '64x speed offered');
  const r = await page.evaluate(() => window.AOCUI.host.cmd({ type: 'dev:res' }));
  check(!r.ok, 'a developer command worked without developer mode');
  check(await page.evaluate(() => window.AOCUI.host.cmd({ type: 'dev:unlimited', on: true }).then(x => x.ok)) === false, 'the unlimited switch worked without developer mode');
  const s0 = await page.evaluate(() => window.AOCUI.lastSave || 0);
  await page.evaluate(() => window.AOCUI.host.post({ type: 'save' }));
  await page.waitForFunction(s0 => window.AOCUI.saveState === 'saved' && window.AOCUI.lastSave > s0, s0, { timeout: 15000 });
});

await step('six taps on the logo do nothing, seven turn it on, and it stays on after a reload', async () => {
  await page.goto(URL);
  await page.waitForSelector('.aoc-brand');
  await tapLogo(6);
  check(await page.locator('.aoc-devnote').isHidden(), 'six taps turned it on');
  await page.waitForTimeout(1600);
  await tapLogo(7);
  await page.waitForSelector('.aoc-devnote:not([hidden])');
  check(/on/.test(await page.locator('.aoc-devnote').textContent()), 'the note does not say it is on');
  await page.reload();
  await page.waitForSelector('.aoc-devnote:not([hidden])');
  await page.click('#aoc-continue');
  await page.waitForFunction(() => window.AOCUI.F && window.AOCUI.current === 'city', null, { timeout: 30000 });
  await page.waitForSelector('[data-side="dev"]:not([hidden])');
  check(await page.locator('[data-speed="64"]').count() === 1, 'no 64x speed in developer mode');
});

await step('unlimited resources stay full after spending and over time', async () => {
  await openPanel();
  await page.click('[data-sw="unlimited"]');
  await page.waitForFunction(() => document.querySelector('[data-sw="unlimited"]').getAttribute('aria-checked') === 'true');
  await page.waitForFunction(() => window.AOC.RES.every(r => window.AOCUI.F.player.res[r] >= 50e6));
  await closeSheets();
  check((await page.evaluate(() => window.AOCUI.host.cmd({ type: 'build', id: 'hall' }))).ok, 'build refused');
  await page.click('[data-speed="16"]');
  await page.waitForTimeout(1500);
  const p = await P();
  check(['food', 'wood', 'stone', 'iron', 'gold'].every(r => p.res[r] >= 50e6), `resources ran down: ${JSON.stringify(p.res)}`);
  await page.click('[data-speed="1"]');
});

await step('instant builds and training finish as they start', async () => {
  await openPanel();
  await page.click('[data-sw="instant"]');
  await page.waitForFunction(() => document.querySelector('[data-sw="instant"]').getAttribute('aria-checked') === 'true');
  await closeSheets();
  const h0 = (await P()).b.hall;
  check((await page.evaluate(() => window.AOCUI.host.cmd({ type: 'build', id: 'warehouse' }))).ok, 'build refused');
  await page.waitForFunction(() => window.AOCUI.F.player.b.warehouse >= 1 && !window.AOCUI.F.player.q.build);
  const inf = (await P()).troops.inf;
  check((await page.evaluate(() => window.AOCUI.host.cmd({ type: 'train', unit: 'inf', n: 100 }))).ok, 'training refused');
  await page.waitForFunction(i => window.AOCUI.F.player.troops.inf >= i + 100 && !window.AOCUI.F.player.q.train.inf, inf);
  check((await P()).b.hall >= h0, 'the hall went down');
});

await step('max every building raises the Town Hall and every building to level 25', async () => {
  await openPanel();
  await devAct('dev:hall');
  await page.waitForFunction(() => Object.keys(window.AOC.BUILDINGS).every(b => (window.AOCUI.F.player.b[b] || 0) >= 25));
  await closeSheets();
  await page.waitForFunction(() => document.querySelector('[data-plate="hall"] .aoc-plate-lv')?.textContent === '25');
});

await step('troops, every commander, the whole map, a shield and finished timers', async () => {
  await openPanel();
  const t0 = (await P()).troops;
  await devAct('dev:troops');
  await page.waitForFunction(i => window.AOCUI.F.player.troops.cav >= i + 100000, t0.cav);
  await devAct('dev:commanders');
  await page.waitForFunction(() => Object.keys(window.AOCUI.F.player.cmds).length === window.AOC.COMMANDERS.length && Object.values(window.AOCUI.F.player.cmds).every(c => c.lv === window.AOC.CMD_MAX_LEVEL));
  await devAct('dev:reveal');
  await page.waitForFunction(() => window.AOCUI.S.fog && window.AOCUI.S.fog.every(v => v > 0));
  await devAct('dev:shield');
  await page.waitForFunction(() => window.AOCUI.F.player.shield - window.AOCUI.F.t > 6 * 1440);
  await devAct('dev:items');
  await page.waitForFunction(() => window.AOCUI.F.ev && window.AOCUI.F.ev.gems >= 50000);
  await page.click('[data-sw="events"]');
  await page.waitForFunction(() => document.querySelector('[data-sw="events"]').getAttribute('aria-checked') === 'true');
  check(await page.evaluate(() => window.AOCUI.host.query('events').then(v => ['wheel', 'cards', 'mtg', 'ceroli', 'arms'].every(k => v.windows[k].open))), 'every event should be open');
  await page.click('[data-sw="events"]');
  await page.waitForFunction(() => document.querySelector('[data-sw="events"]').getAttribute('aria-checked') === 'false');
  // a timer, then finish it from the panel
  await page.click('[data-sw="instant"]');
  await page.waitForFunction(() => document.querySelector('[data-sw="instant"]').getAttribute('aria-checked') === 'false');
  check((await page.evaluate(() => window.AOCUI.host.cmd({ type: 'train', unit: 'cav', n: 500 }))).ok, 'training refused');
  // the queue shows in the next frame (8 game minutes of training at Stables 25); with instant on it never would
  const queued = await page.waitForFunction(() => !!window.AOCUI.F.player.q.train.cav, null, { timeout: 4000 }).then(() => true, () => false);
  check(queued, 'training finished at once with instant off');
  await devAct('dev:finish');
  await page.waitForFunction(() => !window.AOCUI.F.player.q.train.cav);
});

await step('time skips move the clock and the world keeps up', async () => {
  const t0 = await page.evaluate(() => window.AOCUI.F.t);
  await page.click('[data-skip="60"]');
  await page.waitForFunction(t => window.AOCUI.F.t >= t + 60, t0, { timeout: 20000 });
  await page.click('[data-skip="360"]');
  await page.waitForFunction(t => window.AOCUI.F.t >= t + 420, t0, { timeout: 30000 });
  const f = await page.evaluate(() => ({ govs: window.AOCUI.F.guilds.length, t: window.AOCUI.F.t }));
  check(f.govs === 10, 'the guilds are gone');
});

await step('the switches are saved with the world and come back after a reload', async () => {
  await closeSheets();
  const s0 = await page.evaluate(() => window.AOCUI.lastSave || 0);
  await page.evaluate(() => window.AOCUI.host.post({ type: 'save' }));
  await page.waitForFunction(s0 => window.AOCUI.saveState === 'saved' && window.AOCUI.lastSave > s0, s0, { timeout: 15000 });
  await page.reload();
  await page.click('#aoc-continue');
  await page.waitForFunction(() => window.AOCUI.F && window.AOCUI.current === 'city', null, { timeout: 30000 });
  const sw = await page.evaluate(() => window.AOCUI.F.devSw);
  check(sw.unlimited === true && sw.instant === false, `switches after reload: ${JSON.stringify(sw)}`);
  await openPanel();
  check(await page.locator('[data-sw="unlimited"]').getAttribute('aria-checked') === 'true', 'the panel does not show unlimited on');
});

await step('turning developer mode off removes the button and the speeds and stops the switches', async () => {
  await page.click('#aoc-dev-off');
  await page.waitForSelector('#aoc-continue:not([hidden])', { timeout: 15000 });
  check(await page.locator('.aoc-devnote').isHidden(), 'the developer note still shows');
  await page.click('#aoc-continue');
  await page.waitForFunction(() => window.AOCUI.F && window.AOCUI.current === 'city', null, { timeout: 30000 });
  check(await page.locator('[data-side="dev"]').isHidden(), 'the Dev button is still there');
  check(await page.locator('[data-speed="64"]').count() === 0, '64x is still offered');
  const sw = await page.evaluate(() => window.AOCUI.F.devSw);
  check(!sw.unlimited && !sw.instant, `switches still on: ${JSON.stringify(sw)}`);
  check(!(await page.evaluate(() => window.AOCUI.host.cmd({ type: 'dev:res' }))).ok, 'developer commands still work');
});

await step('no console errors, page errors or outside requests', async () => {
  check(problems.length === 0, problems.join('\n'));
});

await browser.close();
console.log(`conquest-dev: all ${passed} steps passed`);
