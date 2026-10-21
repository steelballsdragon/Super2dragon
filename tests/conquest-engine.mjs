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
await test('commanders of history join through deeds, for the player and the AI alike, and fight with their skills', () => {
  const w = fresh();
  const g = w.govs[P];
  check(!g.cmds.genghis && !g.cmds.leonidas, 'started with a commander of history');
  g.stats.camps = 39; A.checkRecruits(w, g);
  check(!g.cmds.genghis, 'Genghis Khan joined before 40 camps');
  g.stats.camps = 40; g.stats.defWins = 20; A.checkRecruits(w, g);
  check(g.cmds.genghis && g.cmds.leonidas, 'Genghis Khan and Leonidas should join');
  const ai = w.govs.find(x => !x.human && !x.cmds.musashi);
  ai.stats.wins = 60; A.checkRecruits(w, ai);
  check(ai.cmds.musashi, 'an AI governor did not recruit Musashi by the same rule');
  // Leonidas's Spartan Shield adds defense only when defending
  const lead = A.armySide(w, g, { inf: 1000 }, 'leonidas', null, { attack: true }, 'x').mul.def.inf;
  const hold = A.armySide(w, g, { inf: 1000 }, 'leonidas', null, { defend: true }, 'x').mul.def.inf;
  check(Math.abs(hold - lead - 0.15) < 1e-9, `Spartan Shield: ${lead} attacking, ${hold} defending`);
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
await test('12 civilizations each have bonuses and real costs, and 20 painted commanders are complete', () => {
  check(A.CIVS.length === 12 && A.COMMANDERS.length === 20, 'counts');
  // every commander has a painting: the removed ones are gone from every table
  for (const id in A.CMD_REPLACED) check(!A.CMD[id] && A.CMD[A.CMD_REPLACED[id]] && !A.RECRUIT[id] && !A.CIVS.some(v => v.commander === id), `${id} was not removed`);
  // every commander has a full kit, a valid rival and talent tree, and a way to be recruited (a civilization's
  // starting commander or a deed in RECRUIT)
  for (const c of A.COMMANDERS) {
    check(A.CIV[c.civ] && A.CMD[c.rival] && c.passives.length === 2 && c.active.effects.length && c.ultimate && c.story, `${c.id} is incomplete`);
    check(c.talents.length === 3 && c.talents.every(t => A.TALENT_STATS[t]), `${c.id} has an unknown talent`);
    check(A.RECRUIT[c.id] || A.CIVS.some(v => v.commander === c.id), `${c.id} cannot be recruited`);
  }
  for (const s of A.SYNERGY) check(A.CMD[s.a] && A.CMD[s.b], `pairing ${s.name} names an unknown commander`);
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
  // a world from the old, smaller map is refused with a clear reason
  const old = A.deserialize(JSON.stringify({ ...wrap, v: 1 }));
  check(!old.ok && old.old && /old, smaller map/.test(old.err), `an old-map save: ${old.err}`);
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
await test('a save from before the unpainted commanders left converts them to their replacements', () => {
  const w = fresh();
  A.advance(w, 120);
  const wrap = JSON.parse(A.serialize(w, 1));
  const body = JSON.parse(wrap.body);
  const g = body.govs.find(x => !x.human && x.civ === 'ashen'), p = body.govs[P];
  // an AI governor who had Seris (level 12) and Sun Tzu (level 4), and the player who had Rokan as steward
  g.cmds.seris = { lv: 12, xp: 5, sk: [2, 2, 1, 1], tal: { scout: 3 } }; g.cmds.suntzu = { lv: 4, xp: 0, sk: [1, 1, 1, 1], tal: {} };
  g.steward = 'seris';
  p.cmds.rokan = { lv: 9, xp: 0, sk: [1, 1, 1, 1], tal: {} }; p.steward = 'rokan'; p.defender = 'rokan';
  body.reports.push({ id: 999999, kind: 'spy', defender: 'thane', commanders: [{ id: 'maelis', lv: 3 }] });
  const b2 = JSON.stringify(body);
  const r = A.deserialize(JSON.stringify({ ...wrap, v: 2, body: b2, check: A.hash32(b2) }));
  check(r.ok, r.err);
  const g2 = r.world.govs[g.id], p2 = r.world.govs[P];
  check(!g2.cmds.seris && g2.cmds.suntzu.lv === 12 && g2.steward === 'suntzu', `Seris should become Sun Tzu at level 12: ${JSON.stringify(g2.cmds.suntzu)} ${g2.steward}`);
  check(!p2.cmds.rokan && p2.cmds.musashi?.lv === 9 && p2.steward === 'musashi' && p2.defender === 'musashi', 'Rokan should become Musashi');
  const rep = r.world.reports.find(x => x.id === 999999);
  check(rep.defender === 'boudica' && rep.commanders[0].id === 'hannibal', 'reports should name the replacements');
  for (const x of r.world.govs) for (const c in x.cmds) check(A.CMD[c], `unknown commander ${c} survived`);
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
await test('production follows the formulas and never stops: there is no storage limit', () => {
  const w = fresh();
  const g = w.govs[P];
  A.settle(w, g, w.t);
  const prod = A.production(w, g);
  const before = { ...g.res };
  A.settle(w, g, w.t + 60);
  check(Math.abs((g.res.wood - before.wood) - prod.wood) < 1e-6, 'one hour of wood');
  check(Math.abs((g.res.food - before.food) - (prod.food - A.upkeepPerHour(g))) < 1e-6, 'food is production minus upkeep');
  const wood = g.res.wood, t1 = g.at;
  A.settle(w, g, t1 + 60 * 200);
  check(Math.abs(g.res.wood - wood - prod.wood * 200) < 1e-3, `200 hours of wood should all arrive (${wood} + ${prod.wood * 200}, has ${g.res.wood})`);
  // the Warehouse only keeps part of the stock safe; Logistics adds to that
  const safe = A.protectedStock(w, g);
  g.b.warehouse = 5; g.tech.logistics = 3; g._mv = (g._mv || 0) + 1;
  check(A.protectedStock(w, g) > safe * 2, 'a Warehouse and Logistics keep more safe');
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
await test('training: any number you can pay for, cost, completion; healing returns wounded troops', () => {
  const w = fresh();
  const g = w.govs[P];
  g.res = { food: 1e6, wood: 1e6, stone: 1e6, iron: 1e6, gold: 1e6 };
  // no limit on how many at once: a big batch is refused only when the stock cannot pay for it, and takes longer
  const big = A.trainCheck(w, g, 'inf', 20000), small = A.trainCheck(w, g, 'inf', 100);
  check(big.ok && big.minutes > small.minutes * 100, `20,000 infantry at Barracks 1: ${JSON.stringify(big)}`);
  check(!A.trainCheck(w, g, 'inf', 200000).ok, 'trained more than the stock pays for');
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
  let n = 0;
  for (let k = 0; k < 400 && n < 40; k++) {
    const a = w.govs[(k * 37) % 600], b = w.govs[(k * 91 + 13) % 600];
    if (A.regionAt(w, a.x, a.y) !== A.regionAt(w, b.x, b.y)) continue;
    n++;
    const path = A.findPath(w, A.idx(a.x, a.y), A.idx(b.x, b.y));
    check(path, `no path between ${a.id} and ${b.id}`);
    for (let i = 1; i < path.length; i++) {
      check(Math.abs(A.tx(path[i]) - A.tx(path[i - 1])) <= 1 && Math.abs(A.ty(path[i]) - A.ty(path[i - 1])) <= 1, 'steps must be neighbours');
      check(A.TERRAIN[w.map.ter[path[i]]].cost !== Infinity, 'path crosses impassable land');
      check(w.map.reg[path[i]] < 100, 'a path inside a region used a pass road');
    }
  }
  check(n >= 30, `too few same-region pairs (${n})`);
  const mountain = w.map.ter.findIndex(t => t === A.T.mountain);
  check(A.findPath(w, A.idx(w.govs[P].x, w.govs[P].y), mountain) === null, 'a mountain tile is unreachable');
});
await test('the kingdom: six Zone 1 regions, three in Zone 2 and the heartland, walled by mountains with 15 passes', () => {
  const w = fresh();
  check(A.MAP_N === 384 && A.REGIONS.length === 10, 'the map is 384 tiles with 10 regions');
  const zones = [1, 1, 1, 1, 1, 1, 2, 2, 2, 3];
  A.REGIONS.forEach((r, k) => check(r.zone === zones[k] && A.zoneOfRegion(k) === zones[k], `region ${r.name} is in the wrong zone`));
  const passes = w.marks.filter(m => m.kind === 'pass');
  check(passes.length === 15, `expected 15 passes, found ${passes.length}`);
  // every landmark is placed on every map (these seeds once lost one)
  for (const seed of [101, 3189639203, 591706100, 1605610326]) {
    const c = A.createWorld({ seed, name: 'x' }).marks.reduce((o, m) => (o[m.kind] = (o[m.kind] || 0) + 1, o), {});
    check(c.capital === 1 && c.pass === 15 && c.site === 27 && c.ruin === 18, `seed ${seed}: ${JSON.stringify(c)}`);
  }
  check([1, 2, 3].map(l => passes.filter(m => m.tier === l).length).join() === '6,6,3', 'six level 1, six level 2 and three level 3 passes');
  for (const m of passes) {
    const [ra, rb] = m.links;
    if (m.tier === 1) check(A.zoneOfRegion(ra) === 1 && A.zoneOfRegion(rb) === 1, `${m.name} should join two Zone 1 regions`);
    if (m.tier === 2) check(A.zoneOfRegion(ra) === 1 && A.zoneOfRegion(rb) === 2, `${m.name} should lead from Zone 1 into Zone 2`);
    if (m.tier === 3) check(A.zoneOfRegion(ra) === 2 && rb === 9, `${m.name} should lead into the heartland`);
  }
  // every governor starts in Zone 1; the Capital stands in the heartland
  check(w.govs.every(g => A.zoneAt(w, g.x, g.y) === 1), 'a governor started outside Zone 1');
  const cap = w.marks.find(m => m.kind === 'capital');
  check(A.regionAt(w, cap.x, cap.y) === 9, 'the Capital is not in the heartland');
  // nothing reaches another region while every pass is closed; each pass, once held, opens exactly its own road
  const inside = r => { const [x, y] = A.regionCenter(r); for (let d = 0; d < 40; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const i = A.idx(x + dx, y + dy); if (w.map.reg[i] === r) return i; } return -1; };
  for (const m of passes) {
    const a = inside(m.links[0]), b = inside(m.links[1]);
    check(A.findPath(w, a, b, 0) === null, `${m.name}: a way between its regions without the pass`);
    const path = A.findPath(w, a, b, 1 << m.gate);
    check(path && path.includes(A.idx(m.x, m.y)), `${m.name}: no way through the pass when it is open`);
    check(A.findPath(w, a, A.idx(m.x, m.y), 0) && A.findPath(w, b, A.idx(m.x, m.y), 0), `${m.name}: cannot be reached from both sides to attack it`);
  }
});
await test('a pass lets only the guild that holds it, and its allies, march through', () => {
  const w = fresh();
  const gd = w.guilds[0];
  const lead = w.govs[gd.leader];
  const home = A.regionAt(w, lead.x, lead.y);
  const pass = w.marks.find(m => m.kind === 'pass' && m.tier === 1 && m.links.includes(home));
  const beyond = pass.links[0] === home ? pass.links[1] : pass.links[0];
  const target = w.govs.find(g => A.regionAt(w, g.x, g.y) === beyond && g.guild !== gd.id);
  const to = A.idx(target.x, target.y);
  lead.troops.inf = 5000;
  const send = g => A.startMarch(w, g, { kind: 'scout', to: A.idx(target.x, target.y) });
  check(!A.canReach(w, lead, to) && !send(lead).ok, 'marched through a pass nobody holds');
  pass.owner = gd.id;
  check(A.canReach(w, lead, to), 'the guild cannot reach the region beyond its own pass');
  check(send(lead).ok, 'the guild cannot march through its own pass');
  const ally = w.guilds.find(o => o.id !== gd.id);
  const allyGov = w.govs.find(g => g.guild === ally.id && A.regionAt(w, g.x, g.y) === home) || w.govs[ally.leader];
  const other = w.guilds.find(o => o.id !== gd.id && o.id !== ally.id);
  const otherGov = w.govs.find(g => g.guild === other.id && A.regionAt(w, g.x, g.y) === home);
  if (otherGov) check(!A.canReach(w, otherGov, to), 'another guild used the pass');
  A.setTreaty(w, gd.id, ally.id, 'alliance');
  if (A.regionAt(w, allyGov.x, allyGov.y) === home) check(A.canReach(w, allyGov, to), 'an ally cannot use the pass');
  // an independent never passes, and the player is told why
  w.explored[to] = 1;
  const r = cmd(w, { type: 'march', kind: 'scout', to });
  if (A.regionAt(w, w.govs[P].x, w.govs[P].y) !== beyond) check(!r.ok && /mountain range/i.test(r.err), `an independent crossed a range: ${r.err}`);
  // an army going home may always use any pass
  check(A.findPath(w, to, A.idx(lead.x, lead.y), A.ALL_GATES), 'no way home through the passes');
});
await test('holy sites bless every member of the guild that holds them; the same blessing twice counts once', () => {
  const w = fresh();
  const gd = w.guilds[1];
  const g = w.govs[gd.members[2]];
  const base = A.armySide(w, g, { inf: 1000 }, null, null, {}, 'x').mul.atk.inf;
  const war = w.marks.filter(m => m.kind === 'site' && m.blessing === 'war');
  check(war.length === 2, 'two altars give the Blessing of War');
  war[0].owner = gd.id; A.recomputeTerritory(w);
  const one = A.armySide(w, g, { inf: 1000 }, null, null, {}, 'x').mul.atk.inf;
  check(Math.abs(one - base - 0.03) < 1e-9, `the Blessing of War should add 3% attack (${base} -> ${one})`);
  war[1].owner = gd.id; A.recomputeTerritory(w);
  const two = A.armySide(w, g, { inf: 1000 }, null, null, {}, 'x').mul.atk.inf;
  check(Math.abs(two - one) < 1e-9, 'two Blessings of War added up');
  const plenty = w.marks.find(m => m.blessing === 'plenty');
  const before = A.production(w, g).food;
  plenty.owner = gd.id; A.recomputeTerritory(w);
  check(A.production(w, g).food > before * 1.04, 'the Blessing of Plenty should raise Food production');
  const outsider = w.govs.find(o => o.guild !== gd.id && o.guild >= 0);
  check(!A.blessingMods(w, outsider.guild) || !A.blessingMods(w, outsider.guild).atk, 'another guild got the blessing');
});
await test('passes, holy sites and the Capital open on their day; camps and fields grow stronger toward the centre', () => {
  const w = fresh();
  const gd = w.guilds[0];
  const lead = w.govs[gd.leader];
  lead.troops = { inf: 20000, cav: 0, arc: 0, sie: 0 };
  const home = A.regionAt(w, lead.x, lead.y);
  const altar = w.marks.find(m => m.kind === 'site' && m.site === 'altar' && m.region === home);
  check(w.t < altar.opens, 'altars open on Day 2');
  const r = A.startRally(w, lead, { to: A.idx(altar.x, altar.y), troops: { inf: 1000 }, c1: Object.keys(lead.cmds)[0], wait: 20 });
  check(!r.ok && /opens on Day 2/.test(r.err), `a rally on an altar before it opens: ${r.err}`);
  const sanctum = w.marks.find(m => m.kind === 'site' && m.site === 'sanctum' && m.region === home);
  check(A.startRally(w, lead, { to: A.idx(sanctum.x, sanctum.y), troops: { inf: 1000 }, c1: Object.keys(lead.cmds)[0], wait: 20 }).ok, 'sanctums are open from the start');
  const lv = z => { const c = w.camps.filter(x => A.zoneAt(w, x.x, x.y) === z); return c.reduce((s, x) => s + x.lv, 0) / Math.max(1, c.length); };
  check(lv(1) < lv(2) && lv(2) < lv(3), `camp levels should rise toward the centre (${lv(1).toFixed(1)}, ${lv(2).toFixed(1)}, ${lv(3).toFixed(1)})`);
  check(w.camps.length >= 590 && w.nodes.length >= 1190, 'the big map has its camps and fields');
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
  // a guild leader the player's scouts can reach (in the player's region)
  const pr = A.regionAt(w, w.govs[P].x, w.govs[P].y);
  const near = w.govs.filter(g => !g.human && g.guild >= 0 && g.guild !== 2 && A.regionAt(w, g.x, g.y) === pr)[0];
  w.map.occ[A.idx(leader.x, leader.y)] = 0; w.map.occ[A.idx(near.x, near.y)] = 0;
  [leader.x, leader.y, near.x, near.y] = [near.x, near.y, leader.x, leader.y];
  w.map.occ[A.idx(leader.x, leader.y)] = 1 + leader.id; w.map.occ[A.idx(near.x, near.y)] = 1 + near.id;
  w._buckets = null;
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
  const attacker = w.govs.find(g => !g.human && g.guild >= 0 && A.canReach(w, g, A.idx(P0.x, P0.y)));
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
await test('a guild rally captures a holy site and leaves a garrison', () => {
  const w = fresh();
  const gd = w.guilds[0];
  const lead = w.govs[gd.leader];
  const fort = w.marks.filter(m => m.kind === 'site' && m.opens <= w.t && A.canReach(w, lead, A.idx(m.x, m.y))).sort((a, b) => Math.hypot(a.x - lead.x, a.y - lead.y) - Math.hypot(b.x - lead.x, b.y - lead.y))[0];
  lead.troops = { inf: 30000, cav: 15000, arc: 15000, sie: 3000 };
  lead.b.hall = 15;
  const cap = A.marchCap(w, lead);
  const k = Math.min(1, cap / 63000);
  const troops = { inf: Math.floor(30000 * k), cav: Math.floor(15000 * k), arc: Math.floor(15000 * k), sie: Math.floor(3000 * k) };
  const r = A.startRally(w, lead, { to: A.idx(fort.x, fort.y), troops, c1: Object.keys(lead.cmds)[0], wait: 40 });
  check(r.ok, r.err);
  // the three nearest members join
  let joined = 0;
  const near = gd.members.filter(id => id !== lead.id && A.canReach(w, w.govs[id], A.idx(lead.x, lead.y))).sort((a, b) => Math.hypot(w.govs[a].x - lead.x, w.govs[a].y - lead.y) - Math.hypot(w.govs[b].x - lead.x, w.govs[b].y - lead.y));
  for (const id of near) {
    if (joined >= 3) break;
    const m = w.govs[id];
    m.troops = { inf: 20000, cav: 10000, arc: 10000, sie: 0 }; m.b.hall = 15;
    const c = A.marchCap(w, m);
    const jr = A.joinRally(w, m, { rally: r.rally.id, troops: { inf: Math.floor(c * 0.5), cav: Math.floor(c * 0.25), arc: Math.floor(c * 0.25) }, c1: Object.keys(m.cmds)[0] });
    if (jr.ok) joined++;
  }
  A.advance(w, 10 * 60);
  check(fort.owner === gd.id, `the holy site was not captured (owner ${fort.owner}, joined ${joined})`);
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

// ---------------------------------------------------------------- conveniences shared by players and the AI
await test('a queue in its last minutes finishes free; earlier it is refused', () => {
  const w = fresh(), g = w.govs[P];
  check(cmd(w, { type: 'build', id: 'hall' }).ok, 'build refused');
  g.q.build.end = w.t + 60;
  const early = cmd(w, { type: 'free', q: 'build' });
  check(!early.ok && /free when/.test(early.err), `free too early: ${JSON.stringify(early)}`);
  A.advance(w, 60 - A.FREE_FINISH);
  check(g.q.build && g.b.hall === 1, 'finished by itself');
  check(cmd(w, { type: 'free', q: 'build' }).ok && g.b.hall === 2 && !g.q.build, 'free finish did not complete the level');
  check(!cmd(w, { type: 'free', q: 'build' }).ok, 'free with nothing building');
  for (const bad of [{ q: '__proto__' }, { q: 'train', unit: 'constructor' }, { q: 'exchange' }]) check(!cmd(w, { type: 'free', ...bad }).ok, `accepted ${JSON.stringify(bad)}`);
});
await test('a full crate gives an hour of output once, then refills after four hours', () => {
  const w = fresh(), g = w.govs[P];
  A.settle(w, g, w.t);
  const per = A.production(w, g, A.cityMods(w, g)).food;
  const before = g.res.food;
  const r = cmd(w, { type: 'collect', id: 'farm' });
  check(r.ok && r.res === 'food' && r.amount === Math.floor(per * A.CRATE.hours) && g.res.food === before + r.amount, `crate gave ${JSON.stringify(r)} (an hour is ${per})`);
  check(!cmd(w, { type: 'collect', id: 'farm' }).ok, 'collected twice');
  for (const id of ['quarry', 'barracks', 'hall', '__proto__', 'toString']) check(!cmd(w, { type: 'collect', id }).ok, `collected from ${id}`);
  A.advance(w, A.CRATE.every - 5);
  check(!cmd(w, { type: 'collect', id: 'farm' }).ok, 'refilled early');
  A.advance(w, 5);
  check(cmd(w, { type: 'collect', id: 'farm' }).ok, 'did not refill after four hours');
  // there is no storage limit: a crate goes in however much is in stock
  A.advance(w, A.CRATE.every);
  A.settle(w, g, w.t);
  g.res.food = 5e7;
  check(cmd(w, { type: 'collect', id: 'farm' }).ok && g.res.food > 5e7, 'a crate was refused into a big stock');
});
await test('AI governors collect their crates and finish queues free too', () => {
  const w = world(202);
  A.advance(w, 8 * A.HOUR);
  const ai = w.govs.filter(g => !g.human);
  const collected = ai.filter(g => Object.values(g.crate).some(t => t > 0)).length;
  check(collected > 300, `only ${collected} of ${ai.length} AI governors collected a crate`);
  check(ai.every(g => A.RES.every(r => g.res[r] >= 0)), 'negative stock');
});
await test('goals show their progress and sit in chapters', () => {
  const w = fresh();
  let q = A.frameView(w, {}).quests;
  check(q[0].id === 'hall2' && q[0].prog[0] === 1 && q[0].prog[1] === 2 && !q[0].done && q[0].chapter === A.CHAPTERS[0], JSON.stringify(q[0]));
  check(q.every(x => Number.isInteger(x.ch) && A.CHAPTERS[x.ch] && x.prog.length === 2), 'a goal without a chapter or progress');
  cmd(w, { type: 'build', id: 'hall' });
  A.advance(w, 30);
  q = A.frameView(w, {}).quests;
  check(q[0].done && q[0].prog[0] === 2, `hall2 not done: ${JSON.stringify(q[0])}`);
  check(cmd(w, { type: 'claimQuest', id: 'hall2' }).ok && !cmd(w, { type: 'claimQuest', id: 'hall2' }).ok, 'claim once');
});
await test('developer switches keep resources full and finish queues at once, only in developer mode, and are saved', () => {
  const w = fresh(), g = w.govs[P];
  check(!cmd(w, { type: 'dev:unlimited', on: true }).ok && !cmd(w, { type: 'dev:instant', on: true }).ok, 'worked without developer mode');
  check(!w.devSw.unlimited && !w.devSw.instant, 'switched without developer mode');
  check(cmd(w, { type: 'dev:unlimited', on: true }, true).ok && A.RES.every(r => g.res[r] >= 50e6), 'resources not filled');
  check(cmd(w, { type: 'dev:instant', on: true }, true).ok, 'instant refused');
  check(cmd(w, { type: 'build', id: 'hall' }, true).ok && g.b.hall === 2 && !g.q.build, 'the build was not instant');
  check(cmd(w, { type: 'train', unit: 'inf', n: 100 }, true).ok && !g.q.train.inf, 'training was not instant');
  check(A.RES.every(r => g.res[r] >= 50e6), 'resources ran down after spending');
  A.advance(w, 10);
  check(A.RES.every(r => g.res[r] >= 50e6), 'resources ran down over time');
  const back = A.deserialize(A.serialize(w, 1));
  check(back.ok && back.world.devSw.unlimited && back.world.devSw.instant, 'the switches were not saved');
  check(cmd(w, { type: 'dev:instant', on: false }, true).ok && cmd(w, { type: 'build', id: 'farm' }, true).ok && g.q.build, 'instant did not switch off');
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
