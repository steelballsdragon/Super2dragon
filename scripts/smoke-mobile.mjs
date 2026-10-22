// Touch-screen phone test: emulates a 390×844 phone with touch input and plays through the
// main flows (taps, drag, pinch, army orders, council, panels, events, save and reload).
// Usage: npm run build && npm run smoke:mobile   (CHROME_PATH selects the browser)
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('dist');
if (!existsSync(join(root, 'index.html'))) { console.error('dist/ not found: run `npm run build` first.'); process.exit(1); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = join(root, url === '/' ? 'index.html' : url);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;
const out = resolve('smoke-output/mobile');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const executablePath = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
const log = (...a) => console.log(...a);
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let n = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` });
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
async function drag(x1, y1, x2, y2, steps = 8) {
  await touch('touchStart', [[x1, y1]]);
  for (let i = 1; i <= steps; i++) await touch('touchMove', [[x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps]]);
  await touch('touchEnd', []);
}
async function pinch(cx, cy, from, to, steps = 8) {
  await touch('touchStart', [[cx - from, cy], [cx + from, cy]]);
  for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch('touchMove', [[cx - d, cy], [cx + d, cy]]); }
  await touch('touchEnd', []);
}
async function step(name, fn) {
  try { await fn(); log('OK  ', name); } catch (e) { log('FAIL', name, '-', e.message.split('\n')[0]); errors.push(`${name}: ${e.message.split('\n')[0]}`); await shot('fail-' + name.replace(/\W+/g, '-')); }
}
const mapTransform = () => page.locator('svg.map-svg > g').first().getAttribute('transform');

await page.goto(`http://localhost:${port}/`);
await step('menu', async () => { await page.getByRole('button', { name: /New Campaign/ }).waitFor({ timeout: 30000 }); await page.waitForTimeout(800); await shot('menu'); });
await step('open select', async () => { await page.getByRole('button', { name: /New Campaign/ }).tap(); await page.getByText('Choose Your Realm').waitFor(); await page.waitForTimeout(1200); await shot('select'); });
await step('tap realm on map', async () => { await page.touchscreen.tap(195, 200); await page.waitForTimeout(400); await shot('select-tap'); });
await step('list + search', async () => {
  await page.getByRole('button', { name: 'List' }).tap();
  await page.getByPlaceholder(/Search realms/).fill('Sikh');
  await page.getByRole('option', { name: /Sikh Misls/ }).tap();
  await page.waitForTimeout(500);
  await shot('select-sikh');
});
await step('play button reachable', async () => {
  const btn = page.getByRole('button', { name: /^Play as/ });
  await btn.scrollIntoViewIfNeeded();
  await shot('select-play');
  await btn.tap();
  await page.getByRole('button', { name: 'Take the throne' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  await shot('welcome');
  await page.getByRole('button', { name: 'Take the throne' }).tap();
  await page.waitForTimeout(800);
  await shot('game');
});
await step('one-finger drag pans map', async () => {
  const before = await mapTransform();
  await drag(200, 400, 120, 330);
  await page.waitForTimeout(300);
  const after = await mapTransform();
  if (before === after) throw new Error('transform unchanged');
});
await step('pinch zooms map', async () => {
  const before = await mapTransform();
  await pinch(195, 420, 40, 140);
  await page.waitForTimeout(400);
  const after = await mapTransform();
  const k = (t) => Number(/scale\(([\d.]+)\)/.exec(t)?.[1]);
  log('     scale', k(before), '->', k(after));
  if (!(k(after) > k(before) * 1.5)) throw new Error('did not zoom in');
  await shot('pinched');
});
await step('tap province shows card', async () => {
  await page.getByRole('button', { name: 'Show whole world' }).tap();
  await page.waitForTimeout(700);
  // Focus our capital via the Overview? Use the store-independent route: tap the map centre.
  await page.touchscreen.tap(195, 420);
  await page.waitForTimeout(500);
  await shot('province-card');
  const card = page.locator('.panel').filter({ hasText: /People/ });
  if (!(await card.count())) throw new Error('no province card');
});
await step('select own army via Military panel and move it', async () => {
  await page.getByRole('button', { name: /Military/ }).last().tap();
  await page.waitForTimeout(400);
  await shot('military-panel');
  const first = page.locator('button.card').filter({ hasText: /morale/ }).first();
  await first.tap();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Close panel' }).tap();
  await page.waitForTimeout(900);
  await shot('army-card');
  await page.getByRole('button', { name: /^Move$/ }).tap();
  await page.waitForTimeout(300);
  await shot('pick-mode');
  // Neutral land: refused with a single explanation.
  await page.touchscreen.tap(250, 360);
  await page.waitForTimeout(600);
  const toasts1 = await page.locator('[aria-live="polite"].fixed button').count();
  if (toasts1 !== 1) throw new Error(`expected one notice for a refused march, saw ${toasts1}`);
  await shot('refused-march');
  // Our own land: the march is ordered.
  await page.getByRole('button', { name: /^Move$/ }).tap();
  await page.touchscreen.tap(150, 365);
  await page.waitForTimeout(700);
  await shot('after-move');
  const card = await page.locator('.panel').filter({ hasText: 'Army of' }).first().innerText();
  if (!/Marching to/.test(card)) throw new Error('march not ordered');
});
await step('council drawer order', async () => {
  await page.getByRole('button', { name: /^Council$/ }).tap();
  await page.waitForTimeout(500);
  await shot('council');
  const box = page.getByLabel('Order to the council');
  await box.fill('Build roads near the capital');
  await page.getByRole('button', { name: 'Submit order' }).tap();
  await page.getByRole('button', { name: /Carry out/ }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(700);
  await shot('council-plan');
  await page.getByRole('button', { name: /Carry out/ }).tap();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Close council panel' }).tap();
});
await step('more sheet -> construction', async () => {
  await page.getByRole('button', { name: /^More$/ }).tap();
  await page.waitForTimeout(400);
  await shot('more-sheet');
  await page.getByRole('button', { name: 'Construction', exact: true }).last().tap({ timeout: 5000 });
  await page.waitForTimeout(500);
  await shot('construction');
  await page.getByRole('button', { name: 'Close panel' }).tap();
});
await step('diplomacy panel', async () => {
  await page.getByRole('button', { name: 'Diplomacy', exact: true }).last().tap();
  await page.waitForTimeout(400);
  const back = page.getByRole('button', { name: /All courts/ });
  if (await back.count()) await back.tap();
  await page.getByRole('region', { name: 'Diplomacy' }).locator('button.card').first().tap();
  await page.waitForTimeout(400);
  await shot('diplomacy');
  await page.getByRole('button', { name: 'Close panel' }).tap();
});
await step('layers row scroll + legend toggle', async () => {
  const legendBtn = page.getByRole('button', { name: 'Legend' });
  await legendBtn.scrollIntoViewIfNeeded();
  await legendBtn.tap();
  await page.waitForTimeout(300);
  await shot('legend-on');
  await legendBtn.tap();
});
await step('play months with events', async () => {
  const answer = async () => {
    const dlg = page.getByRole('dialog');
    if (!(await dlg.count())) return false;
    await shot('event');
    await dlg.locator('button:not([disabled])').filter({ hasNotText: 'Decide later' }).first().tap();
    await page.waitForTimeout(400);
    return true;
  };
  for (let i = 0; i < 12; i++) {
    while (await answer()) { /* keep deciding */ }
    await page.getByRole('button', { name: 'Fast (2)' }).tap();
    await page.waitForTimeout(900);
  }
  while (await answer()) { /* keep deciding */ }
  await page.getByRole('button', { name: /Pause/ }).tap();
  await shot('after-play');
  log('     date:', (await page.locator('header').first().innerText()).split('\n').slice(0, 2).join(' '));
});
await step('save via menu', async () => {
  await page.getByRole('button', { name: 'Game menu' }).tap();
  await page.getByText('Save game…').tap();
  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Economy$/ }).last().tap();
  await page.getByRole('button', { name: 'Game menu' }).tap();
  await page.getByText('Save game…').tap();
  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await page.waitForTimeout(500);
  await shot('saved-over-panel');
});
await step('reload and continue', async () => {
  await page.reload();
  await page.getByRole('button', { name: /Continue Game/ }).tap();
  await page.getByRole('application').waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await shot('continued');
  const date = (await page.locator('header').first().innerText()).split('\n').slice(0, 2).join(' ');
  log('     continued at:', date);
});
await step('no horizontal overflow', async () => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 391) throw new Error('scrollWidth ' + w);
});

await browser.close();
server.close();
if (errors.length) {
  console.error('MOBILE SMOKE TEST FAILED\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log(`Mobile smoke test passed. Screenshots in ${out}`);
