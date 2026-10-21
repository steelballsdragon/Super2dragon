#!/usr/bin/env node
// Last Furnace cloud save test against a stand-in for the claude.ai runtime (tests/mock-claude.js). Browser
// contexts act as devices sharing one mock server: the owner (A), an invited editor (B) and a view-only visitor
// (C). Also checks that a page with no runtime at all saves on the device with a clear note.
//
//   node tests/cloud.mjs [path/to/dist/index.html]
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
if (!chromium) { console.error('cloud: Playwright not found'); process.exit(1); }

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(process.argv[2] || join(HERE, '..', 'dist', 'index.html'));
if (!existsSync(FILE)) { console.error(`cloud: ${FILE} does not exist. Run "node build.mjs" first.`); process.exit(1); }
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
const cloudState = p => p.evaluate(() => Game.cloud.status());

console.log(`cloud: ${FILE}`);
const A = await player({ uid: 'u_alice', write: true, owner: true }, 'A');
const B = await player({ uid: 'u_bram', write: true }, 'B');
const C = await player({ uid: 'u_cara', write: false }, 'C');

await step('start screen finds no cloud save and starts a new city', async () => {
  await A.goto(URL);
  await A.waitForFunction(() => !document.querySelector('#start-continue')?.disabled);
  check((await A.locator('.start-cloud-t').textContent()).includes('Claude account'), 'cloud save not reported on');
  check((await A.locator('#start-continue').textContent()).trim() === 'Start game', 'expected a new game');
  check(!(await A.locator('.start-online').count()), 'online play toggle is still on the start screen');
  await A.click('#start-continue');
  await A.waitForFunction(() => window.Game && Game.isReady === true);
  check(!(await A.locator('#tab-world').count()), 'World tab is still there');
  check(await A.evaluate(() => !window.Game.net && !Game.modules().includes('net')), 'online module still loaded');
  check((await cloudState(A)).state === 'on', 'cloud save is not on');
});

await step('second device of another account saves to its own cloud slot', async () => {
  await start(B, 'Start game');
  await B.evaluate(() => { Game.debug.grant({ meat: 1e6, wood: 1e6, coal: 1e6, iron: 1e6 }); for (let i = 0; i < 4; i++) { Game.city.upgrade('furnace'); for (const t of Game.timers.list('build')) Game.timers.finishNow(t.id); document.querySelectorAll('[aria-label="Close"]').forEach(b => b.click()); } });
  await B.evaluate(() => Game.save(true));
  for (let i = 0; i < 40 && !server.docs.has('data/users/u_bram/save'); i++) await B.waitForTimeout(100);
  check(server.docs.has('data/users/u_bram/save'), 'cloud save was not written');
  check(!server.docs.has('data/users/u_alice/save') || JSON.parse(server.docs.get('data/users/u_alice/save').json).city.levels.furnace === 1, "B's city landed in A's slot");
  check((await B.evaluate(() => Game.city.level('furnace'))) >= 2, 'furnace did not level');
});

await step('a view-only visitor still gets a private cloud save', async () => {
  await start(C, 'Start game');
  await C.evaluate(() => Game.save(true));
  for (let i = 0; i < 40 && !server.docs.has('data/users/u_cara/save'); i++) await C.waitForTimeout(100);
  check(server.docs.has('data/users/u_cara/save'), "visitor's private save was not written");
  check((await cloudState(C)).state === 'on', 'visitor cloud save is not on');
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

await step('another device saving the same city stops this copy from overwriting it', async () => {
  // let this device's own write land first, then another device saves over it
  const mine = await A.evaluate(() => { Game.save(true); return localStorage.getItem('last-furnace-v2'); });
  for (let i = 0; i < 50 && server.docs.get('data/users/u_alice/save')?.json !== mine; i++) await A.waitForTimeout(100);
  check(server.docs.get('data/users/u_alice/save')?.json === mine, 'this device never wrote its save');
  await A.waitForTimeout(300);
  const other = JSON.parse(server.docs.get('data/users/u_alice/save').json);
  other.meta.chiefName = 'Other device';
  const json = JSON.stringify(other);
  server.docs.set('data/users/u_alice/save', { v: 2, savedAt: Date.now(), json });
  await A.waitForFunction(() => Game.cloud.status().state === 'conflict', null, { timeout: 5000 });
  await A.evaluate(() => { Game.S.res.gems += 7; Game.save(true); });
  await A.waitForTimeout(600);
  check(server.docs.get('data/users/u_alice/save').json === json, 'the older copy overwrote the newer cloud save');
});

await step('no runtime at all: game saves on the device with a clear note', async () => {
  const D = await player(null, 'D');
  await start(D, 'Start game');
  const s = await cloudState(D);
  check(s.state === 'off', `expected the cloud off, got ${s.state}`);
  check(/this device/.test(s.note), `unclear note: ${s.note}`);
  await D.evaluate(() => Game.save());
  check(await D.evaluate(() => !!localStorage.getItem('last-furnace-v2')), 'no save on the device');
});

await step('no console or page errors', async () => {
  check(problems.length === 0, problems.join('\n'));
});

await browser.close();
console.log(`cloud: all ${passed} steps passed`);
