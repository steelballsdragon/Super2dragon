#!/usr/bin/env node
// Last Furnace online test: cloud saves and online play against a stand-in for the claude.ai runtime
// (tests/mock-claude.js). Three browser contexts (three devices) act as three players: the owner (A), an invited
// editor (B) and a view-only visitor (C), sharing one mock server. Also checks that a page with no runtime at all stays offline cleanly.
//
//   node tests/online.mjs [path/to/dist/index.html]
//
// Exit code 0 when every step passes, 1 otherwise.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { mockClaude, createMockServer } from './mock-claude.js';

const require = createRequire(import.meta.url);
let chromium;
for (const t of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(t)); break; } catch (e) { /* next */ } }
if (!chromium) { console.error('online: Playwright not found'); process.exit(1); }

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(process.argv[2] || join(HERE, '..', 'dist', 'index.html'));
if (!existsSync(FILE)) { console.error(`online: ${FILE} does not exist. Run "node build.mjs" first.`); process.exit(1); }
const URL = pathToFileURL(FILE).href;

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
const server = createMockServer();
async function player(opts, tag) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (opts) await server.attach(ctx);
  const p = await ctx.newPage();
  p.setDefaultTimeout(10000);
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${tag} console.error: ${m.text()}`); });
  p.on('pageerror', e => problems.push(`${tag} pageerror: ${e.message}`));
  if (opts) await p.addInitScript(mockClaude, opts);
  return p;
}
async function start(p, label) {
  await p.goto(URL);
  await p.waitForFunction(() => !document.querySelector('#start-continue')?.disabled, null, { timeout: 12000 });
  const text = (await p.locator('#start-continue').textContent()).trim();
  check(text === label, `start button says "${text}", expected "${label}"`);
  await p.click('#start-continue');
  await p.waitForFunction(() => window.Game && Game.isReady === true);
}
const net = p => p.evaluate(() => Game.net.status());
const waitNet = (p, state) => p.waitForFunction(s => Game.net.status().state === s, state, { timeout: 8000 });

console.log(`online: ${FILE}`);
const A = await player({ uid: 'u_alice', write: true, owner: true }, 'A');
const B = await player({ uid: 'u_bram', write: true }, 'B');
const C = await player({ uid: 'u_cara', write: false }, 'C');

await step('start screen reports online play for a writer', async () => {
  await A.goto(URL);
  await A.waitForFunction(() => /Leaderboard, world chat/.test(document.querySelector('.start-online-note')?.textContent || ''));
  await A.waitForFunction(() => !document.querySelector('#start-continue')?.disabled);
  check((await A.locator('.start-cloud-t').textContent()).includes('Claude account'), 'cloud save not reported on');
  await A.click('#start-continue');
  await A.waitForFunction(() => window.Game && Game.isReady === true);
  await waitNet(A, 'on');
});

await step('second player connects and both see each other', async () => {
  await start(B, 'Start game');
  await waitNet(B, 'on');
  await A.evaluate(() => { Game.S.meta.chiefName = 'Alice'; });
  await B.evaluate(() => { Game.S.meta.chiefName = 'Bram'; Game.debug.grant({ meat: 1e6, wood: 1e6, coal: 1e6, iron: 1e6 }); for (let i = 0; i < 4; i++) { Game.city.upgrade('furnace'); for (const t of Game.timers.list('build')) Game.timers.finishNow(t.id); document.querySelectorAll('[aria-label="Close"]').forEach(b => b.click()); } });
  // push fresh names/power now rather than waiting for the periodic refresh
  for (const p of [A, B]) await p.evaluate(() => { Game.emit('online:pref', { on: false }); Game.emit('online:pref', { on: true }); });
  await waitNet(A, 'on'); await waitNet(B, 'on');
  await A.click('#tab-world');
  await A.waitForFunction(() => document.querySelectorAll('.net-chip').length >= 2, null, { timeout: 8000 });
  const chips = await A.locator('.net-chip b').allTextContents();
  check(chips.some(t => t.startsWith('Bram')), `Alice does not see Bram online: ${chips}`);
});

await step('world chat delivers messages between players', async () => {
  await B.evaluate(() => Game.navigate('city'));
  await A.fill('#net-input', 'Hello from Alice <b>bold?</b>');
  await A.click('#net-send');
  await A.waitForFunction(() => [...document.querySelectorAll('.net-msg p')].some(p => p.textContent.includes('Hello from Alice')));
  await B.waitForFunction(() => Game.net.status && document.querySelector('#tab-world .badge-dot:not([hidden])'), null, { timeout: 8000 });
  await B.click('#tab-world');
  await B.waitForFunction(() => [...document.querySelectorAll('.net-msg p')].some(p => p.textContent === 'Hello from Alice <b>bold?</b>'));
  check(await B.evaluate(() => !document.querySelector('.net-msg p b')), 'chat text was rendered as HTML');
  await B.waitForFunction(() => document.querySelector('#tab-world .badge-dot')?.hidden !== false);
});

await step('chat is rate limited', async () => {
  await A.fill('#net-input', 'second message right away');
  await A.click('#net-send');
  await A.waitForTimeout(400);
  const n = await A.evaluate(() => [...document.querySelectorAll('.net-msg p')].filter(p => p.textContent.includes('second message')).length);
  check(n === 0, 'a second message inside 4 s was sent');
});

await step('leaderboard ranks players by power', async () => {
  await A.click('#net-sub-rank');
  await A.waitForFunction(() => document.querySelectorAll('.net-row').length >= 2, null, { timeout: 8000 });
  const rows = await A.locator('.net-row b').allTextContents();
  check(rows[0].startsWith('Bram'), `Bram (higher Furnace) should rank first: ${rows}`);
  check(rows.some(r => r.startsWith('Alice (you)')), `Alice's own row missing: ${rows}`);
});

await step('a view-only visitor watches but cannot write', async () => {
  await start(C, 'Start game');
  await waitNet(C, 'watch');
  await C.click('#tab-world');
  check(await C.locator('#net-input').isDisabled(), 'view-only visitor can type in chat');
  await C.waitForFunction(() => [...document.querySelectorAll('.net-msg p')].some(p => p.textContent.includes('Hello from Alice')));
  const ranked = await A.evaluate(() => Game.net.status().state);
  check(ranked === 'on', 'owner dropped offline');
  const cloud = await C.evaluate(() => Game.cloud.status());
  check(cloud.state === 'on', `visitor's private cloud save should still work: ${JSON.stringify(cloud)}`);
});

await step('cloud save restores a city when this device lost its save', async () => {
  await B.evaluate(() => Game.save(true));
  for (let i = 0; i < 40 && !server.docs.has('data/users/u_bram/save'); i++) await B.waitForTimeout(100);
  check(server.docs.has('data/users/u_bram/save'), 'cloud save was not written');
  const lv = await B.evaluate(() => Game.city.level('furnace'));
  // the game saves again while the page unloads, so wipe this device's copies as the next page starts
  await B.addInitScript(() => {
    if (sessionStorage.getItem('wiped')) return;
    sessionStorage.setItem('wiped', '1');
    for (const k of ['last-furnace-v2', 'last-furnace-v2-backup']) localStorage.removeItem(k);
  });
  await B.reload();
  await B.waitForFunction(() => !document.querySelector('#start-continue')?.disabled, null, { timeout: 12000 });
  const card = await B.locator('.start-save-txt').textContent();
  check(card.includes(`Furnace Lv ${lv}`), `start screen did not load the cloud city (Lv ${lv}): ${card}`);
  check((await B.locator('.start-cloud-t').textContent()).includes('Loaded from your Claude account'), 'cloud source not shown');
  await B.click('#start-continue');
  await B.waitForFunction(l => Game.city.level('furnace') === l, lv);
});

await step('a newer cloud save wins over an older device save', async () => {
  // simulate playing on another device: cloud copy is newer and one furnace level higher
  const lv = await A.evaluate(() => Game.city.level('furnace'));
  const st = await A.evaluate(() => { Game.save(); return JSON.parse(localStorage.getItem('last-furnace-v2')); });
  st.city.levels.furnace += 1;
  st.meta.savedAt = Date.now() + 60000;
  server.docs.set('data/users/u_alice/save', { v: 2, savedAt: Date.now(), json: JSON.stringify(st) });
  await A.reload();
  await A.waitForFunction(() => !document.querySelector('#start-continue')?.disabled, null, { timeout: 12000 });
  const card = await A.locator('.start-save-txt').textContent();
  check(card.includes(`Furnace Lv ${lv + 1}`), `newer cloud save not chosen: ${card}`);
  await A.click('#start-continue');
  await A.waitForFunction(l => Game.city.level('furnace') === l, lv + 1);
});

await step('going offline disconnects and going online reconnects', async () => {
  await A.click('#tab-world');
  await A.click('#net-toggle');
  await waitNet(A, 'off');
  await A.waitForFunction(() => document.querySelector('.net-pill')?.textContent.trim() === 'Offline', null, { timeout: 3000 });
  check(await A.locator('#net-input').isDisabled(), 'chat input still enabled while offline');
  await A.click('#net-toggle');
  await waitNet(A, 'on');
});

await step('no runtime at all: game runs offline with a clear note', async () => {
  const D = await player(null, 'D');
  await start(D, 'Start game');
  await D.click('#tab-world');
  const s = await net(D);
  check(s.state === 'off', `expected offline, got ${s.state}`);
  check(/Claude app/.test(s.note), `unclear offline note: ${s.note}`);
  check((await D.evaluate(() => Game.cloud.status())).state === 'off', 'cloud should be off without the runtime');
});

await step('no console or page errors', async () => {
  check(problems.length === 0, problems.join('\n'));
});

await browser.close();
console.log(`online: all ${passed} steps passed`);
