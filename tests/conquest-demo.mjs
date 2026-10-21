#!/usr/bin/env node
// Age of Conquest demonstration campaign, "The Coalition War": an AI guild has become dominant; the test checks
// that the other guilds form a coalition, that the war changes the map, and that the player can intervene and
// change the outcome (two copies of the same world, one where the player stays out and one where they act).
//
//   node tests/conquest-demo.mjs
import { loadEngine } from './conquest/load.mjs';

const A = loadEngine();
const P = A.PLAYER;
let passed = 0;
function check(cond, msg) { if (!cond) { console.log(`  FAIL ${msg}`); process.exit(1); } }
function ok(name) { passed++; console.log(`  ok  ${name}`); }
const clone = w => A.deserialize(A.serialize(w, 1)).world;
const H = 0;

console.log('conquest demo: The Coalition War');
const base = A.createWorld({ seed: 31, name: 'Hero', civ: 'concord', scenario: 'coalition' });
const total = base.guilds.reduce((s, g) => s + g.power, 0);
check(A.validateWorld(base).length === 0, 'the scenario world is valid');
check(base.guilds[H].power / total > 0.28, `Crown of Cinders should dominate (${Math.round(base.guilds[H].power / total * 100)}%)`);
const held0 = base.marks.filter(m => m.owner === H);
check(held0.some(m => m.kind === 'pass') && held0.some(m => m.kind === 'site'), 'the hegemon should start with passes and holy sites');
ok(`Crown of Cinders starts with ${Math.round(base.guilds[H].power / total * 100)}% of the server's power, ${held0.filter(m => m.kind === 'pass').length} passes and ${held0.filter(m => m.kind === 'site').length} holy sites`);

const a = clone(base), b = clone(base);
const startOwners = a.marks.map(m => m.owner);
const terr0 = Uint8Array.from(a.map.terr);
A.advance(a, 12 * 60);
const held = a.marks.filter(m => m.kind === 'site' && m.owner === H).map(m => m.id);
A.advance(a, 24 * 60);
const coalition = a.chron.find(e => e.k === 'coalition' && e.g.includes(H));
check(coalition, 'no coalition formed against the dominant guild');
ok(`a coalition formed: "${coalition.txt}"`);
const enemies = a.guilds.filter(g => g.id !== H && A.treaty(a, g.id, H)?.k === 'war').length + a.chron.filter(e => e.k === 'war' && e.g.includes(H)).length;
check(enemies >= 3, 'the coalition should go to war with the hegemon');
ok(`${a.chron.filter(e => (e.k === 'war' || e.k === 'betrayal') && e.g.includes(H)).length} declarations of war involve Crown of Cinders`);
const changed = a.marks.filter((m, i) => m.owner !== startOwners[i]).length;
let tiles = 0; for (let i = 0; i < terr0.length; i++) if (terr0[i] !== a.map.terr[i]) tiles++;
check(changed >= 1 && tiles > 200, `the war should change the map (landmarks ${changed}, tiles ${tiles})`);
ok(`the war changed the map: ${changed} landmarks changed hands and ${tiles} tiles of territory moved in 36 hours`);
check(A.validateWorld(a).length === 0, A.validateWorld(a).join('; '));

// the player intervenes in copy b: joins the strongest guild of their own region and leads a rally on a holy
// site the hegemon still holds 12 hours later in the untouched copy
const Pb = b.govs[P];
const pReg = A.regionAt(b, Pb.x, Pb.y);
let joined = null;
for (const g of b.guilds.filter(g => g.id !== H).sort((x, y) => (y.home.region === pReg) - (x.home.region === pReg) || y.power - x.power)) { if (A.playerCommand(b, { type: 'apply', guild: g.id }).ok) { joined = g; break; } }
check(joined, 'no coalition guild accepted the player');
const target = held.map(id => b.marks[id]).filter(m => A.canReach(b, Pb, A.idx(m.x, m.y))).sort((m1, m2) => Math.hypot(m1.x - Pb.x, m1.y - Pb.y) - Math.hypot(m2.x - Pb.x, m2.y - Pb.y))[0];
check(target, 'the hegemon should still hold a holy site the player can reach after 12 hours without the player');
b.explored[A.idx(target.x, target.y)] = 1;
const k = Math.min(1, A.marchCap(b, Pb) / A.troopsTotal(Pb.troops));
const troops = {}; for (const u of A.UNIT_KEYS) troops[u] = Math.floor(Pb.troops[u] * k);
const r = A.playerCommand(b, { type: 'rally', to: A.idx(target.x, target.y), troops, c1: Object.keys(Pb.cmds)[0], wait: 60 });
check(r.ok, r.err);
A.advance(b, 12 * 60);
const a12 = clone(base); A.advance(a12, 12 * 60);
check(a12.marks[target.id].owner === H, 'without the player the hegemon keeps the holy site');
check(b.marks[target.id].owner !== H, `with the player the holy site should fall (owner ${b.marks[target.id].owner})`);
ok(`the player joined ${joined.name}, called a rally that guild mates joined, and took ${target.name}; without the player Crown of Cinders still holds it`);
check(A.validateWorld(b).length === 0, A.validateWorld(b).join('; '));
console.log(`conquest demo: all ${passed} checks passed`);
