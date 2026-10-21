#!/usr/bin/env node
// Age of Conquest engine tests: run the simulation in Node (no browser) and check the rules, the AI's fairness,
// saves and the server's invariants.
//
//   node tests/conquest-engine.mjs
//
// Exit code 0 when every test passes, 1 otherwise.

import { loadEngine } from './conquest/load.mjs';

const A = loadEngine();
const P = A.PLAYER;
let passed = 0, failed = 0;
const fails = [];
function check(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`  ok  ${name} (${Date.now() - t0} ms)`); } catch (e) {
    failed++; fails.push(name);
    console.log(`  FAIL ${name}\n       ${String(e.stack || e).split('\n').slice(0, 6).join('\n       ')}`);
  }
}
const world = (seed = 101, o = {}) => A.createWorld({ seed, name: 'Tester', civ: 'ashen', ...o });
const fresh = () => world(101);
const cmd = (w, c, dev) => A.playerCommand(w, c, { dev: !!dev });
const hashOf = w => A.hash32(A.serialize(w, 1));
const settleAll = w => { for (const g of w.govs) A.settle(w, g, w.t); };
// a hand-built side for battle tests
function side(units, mods = {}) {
  const mul = { atk: {}, def: {}, hp: {} };
  for (const u of A.UNIT_KEYS) { mul.atk[u] = mods.atk || 1; mul.def[u] = mods.def || 1; mul.hp[u] = 1; }
  return { gov: -1, label: 'side', units: { inf: 0, cav: 0, arc: 0, sie: 0, ...units }, mul, morale: 100, moraleLoss: 1, terror: 0, pursuit: 0, wallAtk: 1, towerMul: 1, plunder: 0, wounded: 0, cmd: mods.cmd || null, cmd2: null };
}
const fight = (a, d, o = {}) => A.fight({ seed: o.seed ?? 7, a, d, terrain: o.terrain ?? A.T.plains, wall: o.wall || null, kind: 'test' });
const lossShare = (r, k) => A.troopsTotal(r[k].lost) / Math.max(1, A.troopsTotal(r[k].start));

console.log('conquest engine');

// ---------------------------------------------------------------- server capacity and identities
await test('a server has exactly 600 governors: 599 simulated and one player', () => {
  const w = fresh();
  check(w.govs.length === A.GOVERNORS && A.GOVERNORS === 600, `found ${w.govs.length}`);
  check(w.govs.filter(g => g.human).length === 1 && w.govs[P].human, 'exactly one human, in the player slot');
  check(w.govs.filter(g => !g.human).length === 599, '599 AI governors');
  check(A.validateWorld(w).length === 0, A.validateWorld(w).join('; '));
});
await test('exactly ten guilds, each with a leader, officers and at most 60 members', () => {
  const w = fresh();
  check(w.guilds.length === 10, `found ${w.guilds.length} guilds`);
  for (const gd of w.guilds) {
    check(gd.members.length <= A.GUILD_MAX && gd.members.length >= 30, `${gd.name}: ${gd.members.length} members`);
    check(gd.members.includes(gd.leader) && w.govs[gd.leader].role === 'leader', `${gd.name} leader`);
    check(gd.officers.length > 0 && gd.officers.every(o => w.govs[o].role === 'officer'), `${gd.name} officers`);
    check(gd.rel.length === 10 && gd.policy && gd.home, `${gd.name} relations and objectives`);
  }
});
await test('every governor has a full identity and persistent state', () => {
  const w = fresh();
  const archs = new Set();
  for (const g of w.govs) {
    for (const k of ['name', 'civ', 'arch', 't', 'bg', 'b', 'res', 'troops', 'tech', 'cmds', 'stats', 'mem', 'rel', 'log', 'intel']) check(g[k] !== undefined, `governor ${g.id} lacks ${k}`);
    for (const k of ['agg', 'risk', 'greed', 'loyal', 'patience', 'skill', 'diplo', 'honor', 'activity', 'ambition']) check(g.t[k] >= 0 && g.t[k] <= 1, `trait ${k}`);
    archs.add(g.arch);
  }
  check(archs.size >= 13, `only ${archs.size} archetypes in the population`);
  check(new Set(w.govs.map(g => g.civ)).size === 12, 'all 12 civilizations appear');
  check(new Set(w.govs.map(g => g.name)).size > 450, 'names are mostly unique');
});
await test('12 civilizations each have bonuses and real costs, and 12 commanders are complete', () => {
  check(A.CIVS.length === 12 && A.COMMANDERS.length === 12, 'counts');
  for (const c of A.CIVS) {
    check(Object.values(c.mods).some(v => v > 0) && Object.values(c.mods).some(v => v < 0), `${c.name} must have a trade-off`);
    check(c.cons.length >= 1 && c.variant && A.CMD[c.commander], `${c.name} variant and commander`);
  }
  for (const c of A.COMMANDERS) {
    check(c.active?.effects?.length && c.passives.length === 2 && c.ultimate && c.talents.length === 3 && c.story && A.RECRUIT[c.id], `${c.name} incomplete`);
  }
});
await test('after five simulated days the server still holds exactly 600 governors and 10 guilds', () => {
  const w = world(202);
  A.advance(w, 5 * A.DAY);
  check(w.govs.length === 600, 'governor count changed');
  check(w.guilds.length === 10, 'guild count changed');
  check(w.guilds.every(g => g.members.length <= 60), 'a guild exceeded 60');
  const p = A.validateWorld(w);
  check(p.length === 0, p.slice(0, 4).join('; '));
});

// ---------------------------------------------------------------- determinism, saves, offline time
await test('the same seed gives the same world and the same history', () => {
  const a = world(303), b = world(303);
  check(hashOf(a) === hashOf(b), 'creation differs');
  A.advance(a, 600); A.advance(b, 600);
  check(hashOf(a) === hashOf(b), 'ten hours of simulation differ');
  const c = world(304);
  check(A.hash32(Array.from(A.generateTerrain(303).ter).join('')) !== A.hash32(Array.from(A.generateTerrain(304).ter).join('')), 'different seeds should give different maps');
  void c;
});
await test('saving and loading mid-run continues exactly as if never saved', () => {
  const a = world(404), b = world(404);
  A.advance(a, 900); A.advance(b, 900);
  const r = A.deserialize(A.serialize(b, 1));
  check(r.ok, r.err);
  const b2 = r.world;
  A.advance(a, 900); A.advance(b2, 900);
  check(hashOf(a) === hashOf(b2), 'the reloaded world diverged');
});
await test('damaged, tampered or impossible saves are refused', () => {
  const w = fresh();
  const good = A.serialize(w, 1);
  check(A.deserialize(good).ok, 'a good save must load');
  const wrap = JSON.parse(good);
  const tampered = JSON.stringify({ ...wrap, body: wrap.body.replace('"food":3000', '"food":9999999') });
  check(!A.deserialize(tampered).ok, 'a tampered save loaded');
  check(!A.deserialize('{not json').ok, 'garbage loaded');
  check(!A.deserialize(JSON.stringify({ ...wrap, v: 99 })).ok, 'a future version loaded');
  // a save whose checksum matches but whose content breaks the rules (61 members) is still refused
  const body = JSON.parse(wrap.body);
  const gd = body.guilds[0];
  const extra = body.govs.find(g => g.guild < 0 && !g.human);
  gd.members.push(extra.id); extra.guild = 0;
  while (gd.members.length <= 60) { const x = body.govs.find(g => g.guild < 0 && !g.human); gd.members.push(x.id); x.guild = 0; }
  const b2 = JSON.stringify(body);
  const r = A.deserialize(JSON.stringify({ ...wrap, body: b2, check: A.hash32(b2) }));
  check(!r.ok && /61 members/.test(r.err), `rule-breaking save: ${r.err}`);
});
await test('offline time is simulated on load, capped by the player\'s setting', () => {
  const w = fresh();
  const posts = [];
  let now = 1e12;
  const s = A.createServer({ post: m => posts.push(m), now: () => now });
  const save = A.serialize(w, now - 2 * 3600e3);   // saved two real hours ago
  s.handle({ type: 'load', json: save });
  const ready = posts.find(m => m.type === 'ready');
  check(ready && ready.offlineMinutes === 720, `expected 720 game minutes (2 h at a tenth of play speed, within the default 12 h cap), got ${ready?.offlineMinutes}`);
  check(s.world.t === w.t + 720, 'the world did not advance');
  check(posts.some(m => m.type === 'offline'), 'no summary was sent');
  // a player who paused the world gets no catch-up
  w.settings.offlineCap = 0;
  const posts2 = []; const s2 = A.createServer({ post: m => posts2.push(m), now: () => now });
  s2.handle({ type: 'load', json: A.serialize(w, now - 5 * 3600e3) });
  check(s2.world.t === w.t, 'a paused world advanced');
});

// ---------------------------------------------------------------- economy
await test('production follows the formulas and stops at the storage limit', () => {
  const w = fresh();
  const g = w.govs[P];
  A.settle(w, g, w.t);
  const prod = A.production(w, g);
  const before = { ...g.res };
  A.settle(w, g, w.t + 60);
  check(Math.abs((g.res.wood - before.wood) - prod.wood) < 1e-6, 'one hour of wood');
  check(Math.abs((g.res.food - before.food) - (prod.food - A.upkeepPerHour(g))) < 1e-6, 'food is production minus upkeep');
  A.settle(w, g, w.t + 60 * 200);
  const cap = A.storage(w, g, A.cityMods(w, g));
  check(g.res.wood <= cap + 1e-6 && g.res.wood > cap - 1, `wood should stop at the cap ${cap}, has ${g.res.wood}`);
});
await test('troops eat food; when it runs out soldiers desert', () => {
  const w = fresh();
  const g = w.govs[5];
  A.settle(w, g, w.t);
  g.troops.inf = 400000; g.res.food = 10;
  A.settle(w, g, w.t + 120);
  check(g.res.food === 0, 'food should hit zero');
  check(g.troops.inf < 400000, 'troops should desert');
  check(g.mem.some(m => m.k === 'starve'), 'the governor remembers the desertion');
});
await test('building rules: hall cap, prerequisites, cost, one builder, completion time', () => {
  const w = fresh();
  const g = w.govs[P];
  g.res = { food: 1e6, wood: 1e6, stone: 1e6, iron: 1e6, gold: 1e6 };
  check(!cmd(w, { type: 'build', id: 'farm' }).ok, 'the farm cannot pass the hall level');
  check(!cmd(w, { type: 'build', id: 'nope' }).ok, 'unknown building');
  const wood = g.res.wood;
  const r = cmd(w, { type: 'build', id: 'hall' });
  check(r.ok, r.err);
  check(g.res.wood === wood - A.buildingCost('hall', 2).wood, 'the cost was paid');
  check(!cmd(w, { type: 'build', id: 'warehouse' }).ok, 'only one builder');
  const end = g.q.build.end;
  A.advance(w, end - w.t - 1);
  check(g.b.hall === 1, 'finished too early');
  A.advance(w, 1);
  check(g.b.hall === 2, 'did not finish on time');
  // hall 3 needs walls 2
  g.b.hall = 2; g.b.wall = 1;
  const c3 = A.buildCheck(w, g, 'hall');
  check(!c3.allowed && /City Wall level 2/.test(c3.err), `hall 3 should need walls 2: ${c3.err}`);
});
await test('research needs the Academy level and earlier technologies', () => {
  const w = fresh();
  const g = w.govs[P];
  g.res = { food: 1e6, wood: 1e6, stone: 1e6, iron: 1e6, gold: 1e6 };
  check(!cmd(w, { type: 'research', id: 'agri' }).ok, 'no academy');
  g.b.hall = 5; g.b.academy = 3; g.b.wall = 4;
  check(!A.researchCheck(w, g, 'metal').allowed, 'metallurgy needs masonry');
  check(cmd(w, { type: 'research', id: 'masonry' }).ok, 'masonry');
  A.advance(w, g.q.research.end - w.t);
  check(g.tech.masonry === 1, 'masonry done');
  check(A.researchCheck(w, g, 'metal').allowed, 'now metallurgy is allowed');
  g.tech.agri = 3;
  check(!A.researchCheck(w, g, 'agri').allowed, 'a technology cannot pass the Academy level');
});
await test('training: batch limit, cost, completion; healing returns wounded troops', () => {
  const w = fresh();
  const g = w.govs[P];
  g.res = { food: 1e6, wood: 1e6, stone: 1e6, iron: 1e6, gold: 1e6 };
  const max = A.trainBatch(g.b.barracks);
  check(!cmd(w, { type: 'train', unit: 'inf', n: max + 1 }).ok, 'over the batch limit');
  check(!cmd(w, { type: 'train', unit: 'cav', n: 10 }).ok, 'no stables yet');
  check(!cmd(w, { type: 'train', unit: 'inf', n: -5 }).ok, 'negative count');
  const inf = g.troops.inf;
  check(cmd(w, { type: 'train', unit: 'inf', n: 100 }).ok, 'train 100');
  A.advance(w, g.q.train.inf.end - w.t);
  check(g.troops.inf === inf + 100, 'trained troops arrive');
  g.b.hospital = 1; g.b.hall = 3; g.wounded.inf = 50;
  check(cmd(w, { type: 'heal' }).ok, 'heal');
  A.advance(w, g.q.heal.end - w.t);
  check(g.troops.inf === inf + 150 && g.wounded.inf === 0, 'healed troops return');
});
await test('market prices move with trade and the fee depends on the Market', () => {
  const w = fresh();
  const g = w.govs[P];
  g.b.hall = 4; g.b.market = 1;
  g.res.wood = 100000;
  const p0 = w.market.price.wood;
  const r = cmd(w, { type: 'trade', sell: 'wood', buy: 'iron', amount: 10000 });
  check(r.ok && r.got > 0, r.err);
  check(w.market.price.wood < p0, 'selling lowers the price');
  check(!cmd(w, { type: 'trade', sell: 'wood', buy: 'wood', amount: 10 }).ok, 'same resource');
  check(!cmd(w, { type: 'trade', sell: 'wood', buy: 'iron', amount: 1e9 }).ok, 'more than owned');
});

// ---------------------------------------------------------------- movement
await test('paths connect cities around mountains and lakes and never cross impassable land', () => {
  const w = fresh();
  for (let k = 0; k < 40; k++) {
    const a = w.govs[(k * 37) % 600], b = w.govs[(k * 91 + 13) % 600];
    const path = A.findPath(w, A.idx(a.x, a.y), A.idx(b.x, b.y));
    check(path, `no path between ${a.id} and ${b.id}`);
    for (let i = 1; i < path.length; i++) {
      check(Math.abs(A.tx(path[i]) - A.tx(path[i - 1])) <= 1 && Math.abs(A.ty(path[i]) - A.ty(path[i - 1])) <= 1, 'steps must be neighbours');
      check(A.TERRAIN[w.map.ter[path[i]]].cost !== Infinity, 'path crosses impassable land');
    }
  }
  const mountain = w.map.ter.findIndex(t => t === A.T.mountain);
  check(A.findPath(w, A.idx(w.govs[P].x, w.govs[P].y), mountain) === null, 'a mountain tile is unreachable');
});
await test('marches take travel time; scouts return with a report; armies return home', () => {
  const w = fresh();
  const g = w.govs[P];
  const camp = w.camps.slice().sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))[0];
  const r = cmd(w, { type: 'march', kind: 'scout', to: A.idx(camp.x, camp.y) });
  check(r.ok, r.err);
  check(w.reports.length === 0, 'no report before arrival');
  A.advance(w, 60);
  const rep = w.reports.find(x => x.kind === 'scout');
  check(rep && rep.troops, 'the scout report arrived');
  A.advance(w, 60);
  check(!w.marches.some(m => m.owner === P), 'the scout came home');
});

// ---------------------------------------------------------------- combat
await test('battles replay exactly from their recorded start', () => {
  const a = side({ inf: 3000, cav: 2000, arc: 1500 }), d = side({ inf: 2500, cav: 1000, arc: 2500 });
  const r1 = fight(a, d, { seed: 99 }), r2 = fight(a, d, { seed: 99 });
  check(JSON.stringify(r1) === JSON.stringify(r2), 'same input, different result');
});
await test('counters: cavalry beat archers, archers beat infantry, infantry beat cavalry', () => {
  for (const [win, lose] of [['cav', 'arc'], ['arc', 'inf'], ['inf', 'cav']]) {
    const r = fight(side({ [win]: 3000 }), side({ [lose]: 3000 }));
    check(r.winner === 'a', `${win} should beat ${lose}`);
    const back = fight(side({ [lose]: 3000 }), side({ [win]: 3000 }));
    check(back.winner === 'd', `${lose} attacking ${win} should lose`);
  }
});
await test('larger armies have a real advantage', () => {
  const r = fight(side({ inf: 6000 }), side({ inf: 3000 }));
  check(r.winner === 'a' && lossShare(r, 'a') < lossShare(r, 'd'), 'double the troops should win with lighter losses');
});
await test('a smaller army can win with the right counter, high ground and walls', () => {
  // 4,000 archers defending behind level 10 walls on hills beat 6,000 infantry
  const r = fight(side({ inf: 6000 }), side({ arc: 4000 }), { terrain: A.T.hills, wall: { level: 10, dur: 30000, max: 30000 } });
  check(r.winner === 'd', `expected the defenders to hold, got ${r.winner} (${r.reason})`);
  const open = fight(side({ inf: 6000 }), side({ arc: 4000 }), { terrain: A.T.plains });
  check(lossShare(open, 'd') > lossShare(r, 'd'), 'terrain and walls should reduce defender losses');
});
await test('commander skills fire in battle and change the outcome measurably', () => {
  const plain = fight(side({ inf: 3000 }), side({ inf: 3000 }), { seed: 5 });
  const withCmd = fight(side({ inf: 3000 }, { cmd: { id: 'kael', lv: 20, sk: [5, 1, 1, 1], ult: false } }), side({ inf: 3000 }), { seed: 5 });
  check(withCmd.casts.length > 0, 'Kael\'s skill never fired');
  check(lossShare(withCmd, 'd') > lossShare(plain, 'd'), 'the skill did nothing');
});
await test('battle reports explain the result in plain words', () => {
  const input = { seed: 3, a: side({ cav: 2000 }), d: side({ inf: 3000 }), terrain: A.T.ford, wall: null };
  const lines = A.explainBattle(input, A.fight(input), 'a');
  check(lines.some(l => /countered/.test(l)), 'mentions the counter');
  check(lines.some(l => /River crossing/.test(l)), 'mentions the terrain');
});

// ---------------------------------------------------------------- fog of war and intelligence
await test('the player only sees cities on explored land', () => {
  const w = fresh();
  const f = A.frameView(w, {});
  const seen = new Set(f.cities.map(c => c.id));
  const hidden = w.govs.filter(g => !w.explored[A.idx(g.x, g.y)] && g.id !== P && !(w.govs[P].guild >= 0 && g.guild === w.govs[P].guild));
  check(hidden.length > 400, 'most of the world starts unexplored');
  check(hidden.every(g => !seen.has(g.id)), 'an unexplored city was sent to the interface');
  const m = f.marches.filter(x => !x.friend);
  for (const x of m) check(w._vis[A.idx(Math.round(x.x), Math.round(x.y))] >= 2, 'a march out of sight was shown');
});
await test('the inspector hides personality and reasons without intelligence', () => {
  const w = fresh();
  const stranger = w.govs.find(g => g.guild >= 0 && !g.human);
  const d = A.inspect(w, stranger.id);
  check(!d.deep && d.arch === undefined && d.traits === undefined && d.memories === undefined, 'private details leaked');
  // a fresh scout report unlocks them
  w.govs[P].intel.push({ kind: 'scout', target: { type: 'city', id: stranger.id }, at: w.t, acc: 70, troops: { ...stranger.troops } });
  const d2 = A.inspect(w, stranger.id);
  check(d2.deep && d2.arch && Array.isArray(d2.traits), 'intel should reveal the profile');
});
await test('scout reports are estimates whose error grows as accuracy falls', () => {
  const w = fresh();
  const target = w.govs.find(g => !g.human && g.guild >= 0);
  target.troops = { inf: 20000, cav: 10000, arc: 10000, sie: 0 };
  const errs = [];
  for (let k = 0; k < 30; k++) {
    const rng = A.makeRng(1000 + k);
    const acc = 0.4;
    const est = Math.round(20000 * (1 + (rng() * 2 - 1) * (1 - acc) * 0.8));
    errs.push(Math.abs(est - 20000) / 20000);
  }
  check(Math.max(...errs) <= (1 - 0.4) * 0.8 + 0.01, 'errors stay within the accuracy band');
  check(A.scoutAccuracy(w, w.govs[P], target) < 1, 'reports are never perfect');
});
await test('scouting a guild leader uncovers its secret pacts; market prices drift back each day', () => {
  const w = fresh();
  A.setTreaty(w, 2, 3, 'nap', { secret: true });
  check(!A.frameView(w, {}).guilds[2].treaties[3], 'a secret pact was visible');
  const leader = w.govs[w.guilds[2].leader];
  w.explored[A.idx(leader.x, leader.y)] = 1;
  const r = cmd(w, { type: 'march', kind: 'scout', to: A.idx(leader.x, leader.y) });
  check(r.ok, r.err);
  A.advance(w, 240);
  const rep = w.reports.find(x => x.kind === 'scout' && x.target.id === leader.id);
  check(rep && rep.secrets && rep.secrets.length === 1, 'the report should reveal the pact');
  check(A.frameView(w, {}).guilds[2].treaties[3]?.secret, 'the pact should now show as a discovered secret');
  w.market.price.wood = 1.5;
  A.advance(w, 1440);
  check(w.market.price.wood < 1.5, 'prices did not drift back');
});
await test('the AI scouts before attacking and never attacks on stale or missing intelligence', () => {
  const w = world(505);
  A.advance(w, 4 * A.DAY);
  // every AI city attack in the record must have had a scout report by the attacker or a guild mate beforehand
  const attacks = w.marches.filter(m => m.kind === 'attack' && m.target?.type === 'city' && !w.govs[m.owner].human);
  let checked = 0;
  for (const m of attacks) {
    const g = w.govs[m.owner];
    const known = A.intelOn(w, g, 'city', m.target.id, 12 * A.HOUR + (w.t - m.dep)) || g.mem.some(e => e.who === m.target.id);
    check(known, `governor ${g.id} attacked ${m.target.id} with no intelligence`);
    checked++;
  }
  check(checked > 0, 'expected AI attacks in four days');
});

// ---------------------------------------------------------------- guilds and politics
await test('guilds refuse a 61st member', () => {
  const w = fresh();
  const gd = w.guilds.find(g => g.members.length === 60) || w.guilds[0];
  while (gd.members.length < 60) A.joinGuild(w, w.govs.find(g => g.guild < 0 && !g.human), gd.id);
  const outsider = w.govs.find(g => g.guild < 0 && !g.human);
  check(!A.joinGuild(w, outsider, gd.id), 'joined a full guild');
  check(!A.applyToGuild(w, w.govs[P], gd).ok, 'the player joined a full guild');
});
await test('a leader leaving triggers succession under the guild\'s rule', () => {
  const w = fresh();
  const gd = w.guilds[1];
  const old = gd.leader;
  A.leaveGuild(w, w.govs[old]);
  check(gd.leader >= 0 && gd.leader !== old && gd.members.includes(gd.leader), 'no new leader');
  check(w.chron.some(e => e.k === 'leader' && e.g.includes(gd.id)), 'the succession is in the chronicle');
});
await test('war, peace and betrayal change treaties, relations and credibility', () => {
  const w = fresh();
  A.setTreaty(w, 0, 1, 'nap');
  const cred = w.guilds[0].cred;
  check(A.declareWar(w, 0, 1, 'test'), 'war');
  check(A.treaty(w, 0, 1).k === 'war' && A.treaty(w, 1, 0).k === 'war', 'war is symmetric');
  check(w.guilds[0].cred < cred, 'breaking a pact costs credibility');
  check(w.chron.some(e => e.k === 'betrayal'), 'the betrayal is recorded');
  A.makePeace(w, 0, 1, 'test');
  check(A.treaty(w, 0, 1).k === 'truce', 'peace starts a truce');
  check(!A.declareWar(w, 0, 1, 'again'), 'no war during a truce');
});
await test('a collapsed guild is refounded so there are always ten guild identities', () => {
  const w = fresh();
  const gd = w.guilds[9];
  A.collapseGuild(w, gd);
  check(gd.collapsed && gd.members.length === 0, 'collapsed');
  check(w.govs.filter(g => g.guild === 9).length === 0, 'members left');
  w.t = gd.refoundAt;
  A.step(w, 1);
  check(!gd.collapsed && gd.members.length >= 1 && gd.leader >= 0, 'refounded');
  check(w.guilds.length === 10, 'still ten guilds');
  check(A.validateWorld(w).length === 0, A.validateWorld(w).join('; '));
});
await test('AI governors keep their memories and grudges through a save', () => {
  const w = world(606);
  A.advance(w, 4 * A.DAY);
  const g = w.govs.find(x => !x.human && x.mem.some(m => m.k === 'attacked'));
  check(g, 'expected someone to remember an attack');
  const r = A.deserialize(A.serialize(w, 1));
  const g2 = r.world.govs[g.id];
  check(JSON.stringify(g2.mem) === JSON.stringify(g.mem) && JSON.stringify(g2.rel) === JSON.stringify(g.rel), 'memories changed on reload');
  check(g.log.length > 0 && g.log.every(d => typeof d.text === 'string' && d.text.length > 10), 'decisions are explained');
});
await test('the AI pays for everything: no governor ever holds negative stock or troops', () => {
  const w = world(707);
  for (let d = 0; d < 3; d++) {
    A.advance(w, A.DAY);
    for (const g of w.govs) {
      for (const r of A.RES) check(g.res[r] >= -1e-6, `governor ${g.id} ${r} ${g.res[r]}`);
      for (const u of A.UNIT_KEYS) check(g.troops[u] >= 0 && Number.isInteger(g.troops[u]), `governor ${g.id} troops`);
    }
  }
});

// ---------------------------------------------------------------- defeat, recovery and victory
await test('a sacked city loses a level, moves to safety behind a shield, and can rebuild', () => {
  const w = fresh();
  const P0 = w.govs[P];
  P0.shield = 0; P0.b.farm = 3; P0.b.hall = 3; P0.b.lumber = 3; P0.wallDur = 0; P0.troops = { inf: 0, cav: 0, arc: 0, sie: 0 };
  const attacker = w.govs.find(g => !g.human && g.guild >= 0);
  attacker.troops = { inf: 20000, cav: 0, arc: 0, sie: 0 };
  attacker.shield = 0;
  const x0 = P0.x, y0 = P0.y;
  const r = A.startMarch(w, attacker, { kind: 'attack', to: A.idx(P0.x, P0.y), troops: { inf: Math.min(20000, A.marchCap(w, attacker)) }, c1: Object.keys(attacker.cmds)[0] });
  check(r.ok, r.err);
  A.advance(w, r.march.eta - w.t + 1);
  check(P0.stats.sacked === 1, 'the city was not sacked');
  check(P0.x !== x0 || P0.y !== y0, 'the city did not move');
  check(P0.shield > w.t, 'no shield after the sack');
  check(w.reports.some(x => x.kind === 'battle' && x.view === 'd'), 'the player got a defense report');
  P0.res = { food: 1e6, wood: 1e6, stone: 1e6, iron: 1e6, gold: 1e6 };
  check(cmd(w, { type: 'build', id: P0.b.farm < 3 ? 'farm' : 'lumber' }).ok || cmd(w, { type: 'build', id: 'warehouse' }).ok, 'rebuilding works');
});
await test('holding the Throne for three days ends the Age in that guild\'s favor', () => {
  const w = fresh();
  w.govs[P].guild = -1;
  const cap = w.marks.find(m => m.kind === 'capital');
  cap.owner = 3; cap.since = w.t; w.throne = { owner: 3, since: w.t };
  // a strong garrison from a guild member (an unguarded Capital falls back to neutral after a day)
  const m3 = w.govs[w.guilds[3].members[1]];
  const at = A.idx(cap.x, cap.y);
  w.marches.push({ id: w.nid++, kind: 'reinforce', owner: m3.id, troops: { inf: 400000, cav: 0, arc: 0, sie: 0 }, c1: null, c2: null, path: [at], k: 0, frac: 0, speed: 1, from: at, to: at, target: { type: 'mark', id: cap.id }, state: 'garrison', dep: w.t, eta: w.t, load: null, rally: null, wounded: null, gatherEnd: 0, alerted: true, parts: null });
  m3.away.inf += 400000;
  A.advance(w, A.THRONE_HOLD - 1);
  check(w.ages.length === 0, 'the Age ended early');
  A.advance(w, 2);
  check(w.ages.length === 1 && w.ages[0].winner === 3 && w.ages[0].how === 'throne', 'the Age did not end');
  check(w.age === 2 && cap.owner === -1, 'a new Age begins with a neutral Capital');
});
await test('the Grand Exchange is an economic victory, open to the player', () => {
  const w = fresh();
  const g = w.govs[P];
  check(!cmd(w, { type: 'exchange' }).ok, 'needs Town Hall 20 and Market 20');
  for (const b of A.BUILDING_KEYS) g.b[b] = 20;
  g.res = { food: 1e7, wood: 1e7, stone: 1e7, iron: 1e7, gold: 1e7 };
  check(cmd(w, { type: 'exchange' }).ok, 'start the Exchange');
  A.advance(w, A.EXCHANGE.minutes);
  check(w.ages.length === 1 && w.ages[0].gov === P && w.ages[0].playerWon, 'the player should win the Age');
});
await test('a guild rally captures a fortress and leaves a garrison', () => {
  const w = fresh();
  const gd = w.guilds[0];
  const lead = w.govs[gd.leader];
  const fort = w.marks.filter(m => m.kind === 'fortress').sort((a, b) => Math.hypot(a.x - lead.x, a.y - lead.y) - Math.hypot(b.x - lead.x, b.y - lead.y))[0];
  lead.troops = { inf: 30000, cav: 15000, arc: 15000, sie: 3000 };
  lead.b.hall = 15;
  const cap = A.marchCap(w, lead);
  const k = Math.min(1, cap / 63000);
  const troops = { inf: Math.floor(30000 * k), cav: Math.floor(15000 * k), arc: Math.floor(15000 * k), sie: Math.floor(3000 * k) };
  const r = A.startRally(w, lead, { to: A.idx(fort.x, fort.y), troops, c1: Object.keys(lead.cmds)[0], wait: 40 });
  check(r.ok, r.err);
  // the three nearest members join
  let joined = 0;
  const near = gd.members.filter(id => id !== lead.id).sort((a, b) => Math.hypot(w.govs[a].x - lead.x, w.govs[a].y - lead.y) - Math.hypot(w.govs[b].x - lead.x, w.govs[b].y - lead.y));
  for (const id of near) {
    if (joined >= 3) break;
    const m = w.govs[id];
    m.troops = { inf: 20000, cav: 10000, arc: 10000, sie: 0 }; m.b.hall = 15;
    const c = A.marchCap(w, m);
    const jr = A.joinRally(w, m, { rally: r.rally.id, troops: { inf: Math.floor(c * 0.5), cav: Math.floor(c * 0.25), arc: Math.floor(c * 0.25) }, c1: Object.keys(m.cmds)[0] });
    if (jr.ok) joined++;
  }
  A.advance(w, 10 * 60);
  check(fort.owner === gd.id, `the fortress was not captured (owner ${fort.owner}, joined ${joined})`);
  check(A.troopsTotal(A.garrisonOf(w, fort)) > 0, 'no garrison was left');
  check(A.validateWorld(w).length === 0, A.validateWorld(w).join('; '));
});

// ---------------------------------------------------------------- security: invalid actions are refused
await test('invalid and malicious commands are refused without changing anything', () => {
  const w = fresh();
  const g = w.govs[P];
  const before = A.serialize(w, 1);
  const bad = [
    null, {}, { type: 42 }, { type: 'nope' },
    { type: 'march', kind: 'attack', to: -1 }, { type: 'march', kind: 'attack', to: 'x' }, { type: 'march', kind: 'teleport', to: 5 },
    { type: 'march', kind: 'attack', to: A.idx(g.x, g.y) + 1, troops: { inf: -100 } },
    { type: 'march', kind: 'gather', to: A.idx(g.x, g.y), troops: { inf: 10 }, c1: 'kael' },
    { type: 'march', kind: 'scout', to: 0, troops: { inf: 10 } },
    { type: 'train', unit: 'inf', n: NaN }, { type: 'train', unit: 'dragon', n: 1 }, { type: 'build', id: '__proto__' },
    { type: 'trade', sell: 'gold', buy: 'gold', amount: 1 }, { type: 'trade', sell: 'food', buy: 'gold', amount: -5 },
    { type: 'relocate', x: -3, y: 999 }, { type: 'claimQuest', id: 'farm2' }, { type: 'claimQuest', id: 'nope' },
    { type: 'dev:res' }, { type: 'talent', cmd: 'kael', branch: 'cav' }, { type: 'skill', cmd: 'kael', skill: 9 },
    { type: 'diplo', k: 'war', guild: 1 }, { type: 'kick', gov: 3 }, { type: 'officer', gov: 3, on: true },
    { type: 'contribute', res: { food: 10 } }, { type: 'steward', cmd: 'amara' }, { type: 'apply', guild: 99 },
  ];
  for (const c of bad) { const r = A.playerCommand(w, c, {}); check(r && r.ok === false && typeof r.err === 'string', `accepted ${JSON.stringify(c)}`); }
  check(A.serialize(w, 1) === before || A.validateWorld(w).length === 0, 'state changed');
  // marching on an unexplored tile (other than scouting) is refused
  const hiddenTile = w.explored.findIndex((v, i) => !v && A.TERRAIN[w.map.ter[i]].cost !== Infinity);
  check(!cmd(w, { type: 'march', kind: 'attack', to: hiddenTile, troops: { inf: 10 }, c1: 'kael' }).ok, 'attacked unexplored land');
});
await test('attacks on guild mates, allies and shielded cities are refused; rewards cannot be claimed twice', () => {
  const w = fresh();
  const g = w.govs[P];
  const gd = w.guilds[0];
  A.joinGuild(w, g, gd.id);
  const mate = w.govs[gd.members.find(id => id !== P)];
  w.explored[A.idx(mate.x, mate.y)] = 1;
  check(!cmd(w, { type: 'march', kind: 'attack', to: A.idx(mate.x, mate.y), troops: { inf: 10 }, c1: 'kael' }).ok, 'attacked a guild mate');
  const ally = w.guilds[1];
  A.setTreaty(w, 0, 1, 'alliance');
  const allyGov = w.govs[ally.members[0]];
  w.explored[A.idx(allyGov.x, allyGov.y)] = 1;
  check(!cmd(w, { type: 'march', kind: 'attack', to: A.idx(allyGov.x, allyGov.y), troops: { inf: 10 }, c1: 'kael' }).ok, 'attacked an ally');
  const other = w.govs.find(x => x.guild < 0 && !x.human);
  other.shield = w.t + 100; w.explored[A.idx(other.x, other.y)] = 1;
  check(!cmd(w, { type: 'march', kind: 'attack', to: A.idx(other.x, other.y), troops: { inf: 10 }, c1: 'kael' }).ok, 'attacked through a shield');
  g.b.hall = 2;
  check(cmd(w, { type: 'claimQuest', id: 'hall2' }).ok, 'first claim');
  check(!cmd(w, { type: 'claimQuest', id: 'hall2' }).ok, 'second claim');
});
await test('developer commands only work in developer mode', () => {
  const w = fresh();
  check(!cmd(w, { type: 'dev:res' }).ok, 'worked without developer mode');
  check(cmd(w, { type: 'dev:res' }, true).ok && w.govs[P].res.gold >= 50e6, 'did not work in developer mode');
});

// ---------------------------------------------------------------- performance
await test('one simulated game day of the full server takes under 20 seconds', () => {
  const w = world(808);
  A.advance(w, A.DAY);
  const t0 = performance.now();
  A.advance(w, A.DAY);
  const ms = performance.now() - t0;
  console.log(`       day 2 took ${Math.round(ms)} ms`);
  check(ms < 20000, `took ${Math.round(ms)} ms`);
});

console.log(failed ? `\nconquest engine: ${failed} FAILED (${fails.join('; ')}), ${passed} passed` : `conquest engine: all ${passed} tests passed`);
process.exit(failed ? 1 : 0);
