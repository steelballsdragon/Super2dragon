// End-to-end smoke test in a real browser: serves the production build, plays through the main
// flows and fails on any page error. Usage: npm run build && npm run smoke
// Set CHROME_PATH to use a specific Chromium; screenshots go to ./smoke-output/.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('dist');
if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/ not found: run `npm run build` first.');
  process.exit(1);
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;
const out = resolve('smoke-output');
mkdirSync(out, { recursive: true });

const candidates = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const errors = [];
let step = 0;
const shot = async (page, name) => { await page.screenshot({ path: join(out, `${String(++step).padStart(2, '0')}-${name}.png`) }); };

async function run(viewport, label) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`); });
  await page.goto(`http://localhost:${port}/`);
  await page.getByRole('button', { name: /New Campaign/i }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  await shot(page, `${label}-menu`);

  await page.getByRole('button', { name: /New Campaign/i }).click();
  await page.getByText('Choose Your Realm').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot(page, `${label}-select`);
  if (label === 'desktop') {
    await page.getByPlaceholder(/Search realms/).fill('Sikh');
    await page.getByRole('option', { name: /Sikh Misls/ }).click();
  }
  await page.getByRole('button', { name: /^Play as/ }).click();
  await page.getByRole('application').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1800);
  await shot(page, `${label}-welcome`);
  await page.getByRole('button', { name: 'Take the throne' }).click();
  await page.waitForTimeout(500);
  await shot(page, `${label}-game`);

  // Advance a few months with the step button, answering any event cards.
  for (let i = 0; i < 4; i++) {
    const ev = page.getByRole('dialog');
    if (await ev.count()) {
      const opt = ev.locator('button:not([disabled])').filter({ hasNotText: 'Decide later' }).first();
      if (await opt.count()) await opt.click();
    }
    await page.getByRole('button', { name: /Advance one month/ }).click();
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(600);
  const event = page.getByRole('dialog');
  if (await event.count()) { await shot(page, `${label}-event`); await event.getByText('Decide later').click().catch(() => {}); }
  await shot(page, `${label}-after-months`);

  if (label === 'desktop') {
    // Council order through the rule-based advisor.
    const box = page.getByLabel('Order to the council');
    await box.fill('Build roads near the capital and also improve relations with the British');
    await box.press('Enter');
    await page.getByRole('button', { name: /Carry out/ }).waitFor({ timeout: 10000 });
    await shot(page, `${label}-council`);
    await page.getByRole('button', { name: /Carry out/ }).click();
    // Open several panels.
    for (const name of ['Economy', 'Military', 'Diplomacy', 'Technology', 'Laws & Reforms', 'Royal Court', 'Reports']) {
      await page.getByRole('button', { name, exact: true }).first().click();
      await page.waitForTimeout(350);
      await shot(page, `${label}-panel-${name.split(' ')[0].toLowerCase()}`);
    }
    await page.getByRole('button', { name: 'Close panel' }).click();
    for (const layer of ['Economy', 'Diplomacy', 'Trade routes', 'Terrain']) {
      await page.getByRole('radio', { name: layer }).click();
      await page.waitForTimeout(450);
      await shot(page, `${label}-layer-${layer.split(' ')[0].toLowerCase()}`);
    }
    // Zoom in on the map with the wheel.
    const box2 = await page.getByRole('application').boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(60); }
    await page.waitForTimeout(500);
    await shot(page, `${label}-zoomed`);
    // Run at speed for a while.
    await page.getByRole('button', { name: /Fastest/ }).click();
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(700);
      // Events pause the clock; decide and resume.
      const dlg = page.getByRole('dialog');
      if (await dlg.count()) {
        const opt = dlg.locator('button:not([disabled])').filter({ hasNotText: 'Decide later' }).first();
        if (await opt.count()) await opt.click(); else await dlg.getByText('Decide later').click();
        await page.waitForTimeout(300);
        if (!(await page.getByRole('dialog').count())) await page.getByRole('button', { name: /Fastest/ }).click();
      }
    }
    if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByText('Decide later').click();
    await page.getByRole('button', { name: /Pause/ }).click();
    const dateText = await page.locator('header').first().innerText();
    console.log('after fast play:', dateText.split('\n').slice(0, 3).join(' | '));
    // Manual save, reload and continue.
    await page.getByRole('button', { name: 'Game menu' }).click();
    await page.getByText('Save game…').click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(600);
    await page.reload();
    await page.getByRole('button', { name: /Continue Game/ }).waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: /Continue Game/ }).click();
    await page.getByRole('application').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    await shot(page, `${label}-continued`);
    await page.getByRole('button', { name: 'Game menu' }).click();
    await page.getByText('Save & quit to menu').click();
    await page.getByRole('button', { name: /World Atlas/ }).click();
    await page.waitForTimeout(1500);
    await shot(page, `${label}-atlas`);
  }
  await ctx.close();
}

try {
  await run({ width: 1440, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
} catch (e) {
  errors.push(`flow failed: ${e.message}`);
} finally {
  await browser.close();
  server.close();
}
if (errors.length) {
  console.error('SMOKE TEST FAILED');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log(`Smoke test passed. Screenshots in ${out}`);
