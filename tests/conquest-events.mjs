#!/usr/bin/env node
// Age of Conquest events tests: action points, daily objectives, items, the tavern and sculptures, Sunset Canyon,
// the Expedition, guild helps and donations, the shops, the Wheel of Fortune, Card King, More Than Gems, Arms
// Training, Ceroli Crisis, the Shadow Legion and barbarian forts. Run in Node (no browser).
//
//   node tests/conquest-events.mjs
//
// Exit code 0 when every test passes, 1 otherwise.

import { loadEngine } from './conquest/load.mjs';

const A = loadEngine();
const P = A.PLAYER;
let passed = 0, failed = 0;
function check(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`  ok  ${name} (${Date.now() - t0} ms)`); } catch (e) {
    failed++;
    console.log(`  FAIL ${name}\n       ${String(e.stack || e).split('\n').slice(0, 6).join('\n       ')}`);
  }
}
const world = (seed = 101, o = {}) => A.createWorld({ seed, name: 'Tester', civ: 'ashen', ...o });
const cmd = (w, c, dev) => A.playerCommand(w, c, { dev: !!dev });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// move the world clock to a game day and hour without simulating (for calendar checks)
const at = (w, d, h = 8) => { w.t = (d - 1) * A.DAY + h * A.HOUR; };
// start any building upgrade the governor can afford (no building can pass the Town Hall)
// the player joins a guild with room; its member nearest to the player is returned (made able to lead rallies)
function joinNearGuild(w) {
  const g = w.govs[P];
  const gd = w.guilds.filter(x => x.members.length < A.GUILD_MAX && !x.collapsed).sort((a, b) => dist(a.home, g) - dist(b.home, g))[0];
  check(A.joinGuild(w, g, gd.id, true), 'the player joins a guild');
  const lead = w.govs[gd.members.filter(id => id !== P && A.canReach(w, w.govs[id], A.idx(g.x, g.y)) && A.canReach(w, g, A.idx(w.govs[id].x, w.govs[id].y))).sort((a, b) => dist(w.govs[a], g) - dist(w.govs[b], g))[0]];
  lead.b.hall = Math.max(lead.b.hall, 20);
  return { gd, lead };
}
const startBuild = (w, g) => { g.res.food = g.res.wood = g.res.stone = g.res.iron = g.res.gold = 1e7; for (const id of A.BUILDING_KEYS) if (A.buildCheck(w, g, id).ok) return A.actBuild(w, g, id).ok; return false; };

console.log('conquest events');

// ---------------------------------------------------------------- action points and camps
await test('attacking a bandit camp costs action points; without enough it is refused; a recall returns them', () => {
  const w = world();
  const g = w.govs[P];
  check(A.apNow(w, g) === A.AP_MAX, 'a new governor starts with full action points');
  const camp = w.camps.filter(c => !c.fort && A.canReach(w, g, A.idx(c.x, c.y))).sort((a, b) => dist(a, g) - dist(b, g))[0];
  const cost = A.campAp(camp.lv);
  const r = cmd(w, { type: 'march', kind: 'attack', to: A.idx(camp.x, camp.y), troops: { inf: 100 }, c1: 'kael' });
  check(r.ok, r.err);
  check(Math.round(A.apNow(w, g)) === A.AP_MAX - cost, `the attack should cost ${cost}: ${A.apNow(w, g)}`);
  const m = w.marches.find(x => x.owner === P);
  check(cmd(w, { type: 'recall', march: m.id }).ok, 'recall');
  check(Math.round(A.apNow(w, g)) === A.AP_MAX, 'a recall before arrival returns the action points');
  A.advance(w, 120);
  g.ap = cost - 1; g.apAt = w.t;
  const r2 = cmd(w, { type: 'march', kind: 'attack', to: A.idx(camp.x, camp.y), troops: { inf: 100 }, c1: 'kael' });
  check(!r2.ok && /action points/.test(r2.err), `an attack without enough action points: ${r2.err}`);
  // they come back over time, one every AP_EVERY minutes
  A.advance(w, A.AP_EVERY * 10);
  check(Math.abs(A.apNow(w, g) - (cost - 1 + 10)) < 1e-6, `regeneration: ${A.apNow(w, g)}`);
});
await test('barbarian forts stand across the kingdom and refuse single armies; camps drop tomes and speedups', () => {
  const w = world();
  const forts = w.camps.filter(c => c.fort);
  check(forts.length === A.FORTS, `found ${forts.length} forts`);
  check(forts.every(c => c.lv >= 1 && c.lv <= 5 && A.troopsTotal(c.troops) > 5000), 'fort levels and garrisons');
  const z = k => forts.filter(c => A.zoneAt(w, c.x, c.y) === k);
  check(z(1).every(c => c.lv <= 2) && z(3).every(c => c.lv >= 4), 'forts are stronger toward the centre');
  const g = w.govs[P];
  const f = forts.slice().sort((a, b) => dist(a, g) - dist(b, g))[0];
  const r = A.startMarch(w, g, { kind: 'attack', to: A.idx(f.x, f.y), troops: { inf: 100 }, c1: 'kael' });
  check(!r.ok && /rally/.test(r.err), `a lone army on a fort: ${r.err}`);
  // a camp win puts tomes and speedups in the bag
  g.troops.inf = 5000;
  const camp = w.camps.filter(c => !c.fort && c.lv === 1 && A.canReach(w, g, A.idx(c.x, c.y))).sort((a, b) => dist(a, g) - dist(b, g))[0];
  const ar = cmd(w, { type: 'march', kind: 'attack', to: A.idx(camp.x, camp.y), troops: { inf: A.marchCap(w, g) }, c1: 'kael' });
  check(ar.ok, `attack the camp: ${ar.err}`);
  A.advance(w, 240);
  check(g.stats.camps === 1, 'the camp should fall');
  check(g.inv.items.tome1 >= 1 && g.inv.items.speed5 >= 1, `camp drops: ${JSON.stringify(g.inv.items)}`);
  check(A.dailyOf(w, g).cnt.camp === 1 && A.dailyOf(w, g).cnt.ap >= A.campAp(1), 'the camp and its action points count toward daily objectives');
});
await test('a guild rally takes a barbarian fort; every member of the rally is paid and pays action points', () => {
  const w = world();
  // the player joins the rally (AI governors spend their tomes as soon as they think)
  const { lead } = joinNearGuild(w);
  const mate = w.govs[P];
  const fort = w.camps.filter(c => c.fort && A.canReach(w, lead, A.idx(c.x, c.y))).sort((a, b) => dist(a, lead) - dist(b, lead))[0];
  check(fort, 'a reachable fort');
  lead.troops = { inf: 60000, cav: 30000, arc: 30000, sie: 0 }; lead.b.hall = 20;
  const cap = A.marchCap(w, lead);
  const r = A.startRally(w, lead, { to: A.idx(fort.x, fort.y), troops: { inf: Math.floor(cap * 0.5), cav: Math.floor(cap * 0.25), arc: Math.floor(cap * 0.25) }, c1: Object.keys(lead.cmds)[0], wait: 120 });
  check(r.ok, r.err);
  check(Math.round(A.apNow(w, lead)) === A.AP_MAX - A.FORT_AP, 'the leader pays action points');
  mate.troops = { inf: 40000, cav: 20000, arc: 20000, sie: 0 }; mate.b.hall = 20;
  const mc = A.marchCap(w, mate);
  const jr = A.joinRally(w, mate, { rally: r.rally.id, troops: { inf: Math.floor(mc * 0.5), cav: Math.floor(mc * 0.25), arc: Math.floor(mc * 0.25) }, c1: Object.keys(mate.cmds)[0] });
  check(jr.ok, jr.err);
  check(jr.march.eta <= r.rally.launchAt, 'the player arrives before the rally leaves');
  check(Math.round(A.apNow(w, mate)) === A.AP_MAX - A.FORT_AP, 'the member who joins pays too');
  const c1 = Object.keys(lead.cmds)[0], xp0 = lead.cmds[c1].lv * 1e6 + lead.cmds[c1].xp;
  A.advance(w, 8 * 60);
  check(!w.camps.includes(fort), 'the fort should fall');
  check((mate.inv.items.tome2 || 0) >= fort.lv && (mate.inv.items.speed60 || 0) >= 1 + fort.lv, `the player earned tomes and speedups: ${JSON.stringify(mate.inv.items)}`);
  check(lead.cmds[c1].lv * 1e6 + lead.cmds[c1].xp > xp0, 'the leader\'s commander gained experience');
  check(A.validateWorld(w).length === 0, A.validateWorld(w).join('; '));
});

// ---------------------------------------------------------------- daily objectives and items
await test('daily objectives: chests open at their points, once a day, and reset the next game day', () => {
  const w = world();
  const g = w.govs[P];
  check(!cmd(w, { type: 'ev:daily', k: 0 }).ok, 'a chest opened without points');
  A.activity(w, g, 'camp', 4);   // 4 x 5 = 20 points
  const r = cmd(w, { type: 'ev:daily', k: 0 });
  check(r.ok && g.inv.items.speed15 === 2, `the 20-point chest: ${JSON.stringify(r)}`);
  check(!cmd(w, { type: 'ev:daily', k: 0 }).ok, 'the same chest opened twice');
  check(!cmd(w, { type: 'ev:daily', k: 1 }).ok, 'the 40-point chest opened at 20');
  // a task stops counting at its cap
  A.activity(w, g, 'build', 50);
  check(A.dailyPoints(A.dailyOf(w, g)) === 20 + 15, `building upgrades count up to 15: ${A.dailyPoints(A.dailyOf(w, g))}`);
  for (const k of ['camp', 'gather', 'train', 'research', 'rally', 'canyon', 'expedition']) A.activity(w, g, k, 10);
  check(A.dailyPoints(A.dailyOf(w, g)) >= 100, 'enough for every chest');
  for (const k of [1, 2, 3, 4]) check(cmd(w, { type: 'ev:daily', k }).ok, `chest ${k}`);
  check(g.inv.items.keyG === 1 && g.inv.items.box === 1 && g.inv.sc.uniE === 1 && g.inv.gems === 200, `the 100-point chest: ${JSON.stringify(g.inv)}`);
  w.t += A.DAY;
  check(A.dailyPoints(A.dailyOf(w, g)) === 0 && cmd(w, { type: 'ev:daily', k: 0 }).ok === false, 'a new game day starts from zero');
});
await test('items: speedups shorten a queue without waste, tomes give experience, crates and tonics are used', () => {
  const w = world();
  const g = w.govs[P];
  A.give(w, g, { speed60: 5, tome2: 3, crateFood: 2, ap50: 1 });
  check(startBuild(w, g), 'start a build');
  const built = g.q.build.id, L = g.q.build.L;
  const left = g.q.build.end - w.t;
  const r = cmd(w, { type: 'ev:use', id: 'speed60', n: 5, q: 'build' });
  check(r.ok && r.used === Math.ceil(left / 60), `only the speedups needed are used (${r.used} for ${left} minutes)`);
  check(!g.q.build && g.b[built] === L, 'the build finished');
  const xp0 = g.cmds.kael.xp, lv0 = g.cmds.kael.lv;
  check(cmd(w, { type: 'ev:use', id: 'tome2', n: 1, cmd: 'kael' }).ok, 'use a tome');
  check(g.cmds.kael.lv > lv0 || g.cmds.kael.xp >= xp0 + 2000, 'the tome gave experience');
  check(!cmd(w, { type: 'ev:use', id: 'tome2', n: 1, cmd: 'genghis' }).ok, 'a tome on a commander you do not have');
  const f0 = g.res.food;
  check(cmd(w, { type: 'ev:use', id: 'crateFood', n: 2 }).ok && Math.round(g.res.food - f0) >= 20000, 'crates add resources');
  A.give(w, g, { ap50: 0 });
  g.ap = 990; g.apAt = w.t;
  check(cmd(w, { type: 'ev:use', id: 'ap50', n: 1 }).ok && Math.round(A.apNow(w, g)) === 1040, 'a tonic can pass the maximum');
  check(!cmd(w, { type: 'ev:use', id: 'ap50', n: 1 }).ok, 'an item you no longer have');
});
await test('tavern: a free silver chest a day, a free gold chest every two days, keys for the rest', () => {
  const w = world();
  const g = w.govs[P];
  check(A.chestFree(w, g, 'silver') && A.chestFree(w, g, 'gold'), 'both free at first');
  check(cmd(w, { type: 'ev:chest', kind: 'silver' }).ok, 'free silver');
  check(!cmd(w, { type: 'ev:chest', kind: 'silver' }).ok, 'a second free silver chest');
  check(cmd(w, { type: 'ev:chest', kind: 'gold' }).ok && !A.chestFree(w, g, 'gold'), 'free gold');
  w.t += A.DAY;
  check(A.chestFree(w, g, 'silver') && !A.chestFree(w, g, 'gold'), 'silver is free again the next day; gold is not');
  w.t += A.DAY;
  check(A.chestFree(w, g, 'gold'), 'gold is free again two days later');
  A.give(w, g, { keyS: 3 });
  const r = cmd(w, { type: 'ev:chest', kind: 'silver', n: 4 });
  check(r.ok && !g.inv.items.keyS, `three keys and the free chest open four: ${JSON.stringify(r)}`);
  check(!cmd(w, { type: 'ev:chest', kind: 'dragon' }).ok && !cmd(w, { type: 'ev:chest', kind: '__proto__' }).ok, 'unknown chests');
});
await test('sculptures recruit a commander at ten, raise skills, and universal ones convert by rarity', () => {
  const w = world();
  const g = w.govs[P];
  A.give(w, g, { 'sc:genghis': 9 });
  check(!cmd(w, { type: 'ev:recruit', cmd: 'genghis' }).ok, 'recruited with nine');
  A.give(w, g, { 'sc:uniL': 3, 'sc:uniE': 2 });
  check(!cmd(w, { type: 'ev:convert', cmd: 'joan', n: 3 }).ok, 'three epic sculptures from two');
  check(cmd(w, { type: 'ev:convert', cmd: 'genghis', n: 1 }).ok && g.inv.sc.genghis === 10, 'convert a universal legendary');
  check(cmd(w, { type: 'ev:recruit', cmd: 'genghis' }).ok && g.cmds.genghis && g.inv.sc.genghis === 0, 'recruit with ten');
  check(!cmd(w, { type: 'ev:recruit', cmd: 'genghis' }).ok, 'recruit twice');
  A.give(w, g, { 'sc:kael': 2 });
  const sk = g.cmds.kael.sk[0];
  check(cmd(w, { type: 'ev:skill', cmd: 'kael', skill: 0 }).ok && g.cmds.kael.sk[0] === sk + 1, 'a skill level for 2 sculptures');
  check(!cmd(w, { type: 'ev:skill', cmd: 'kael', skill: 0 }).ok, 'the next level needs 4');
  check(!cmd(w, { type: 'ev:skill', cmd: 'kael', skill: 3 }).ok, 'the ultimate before level 30');
  check(!cmd(w, { type: 'ev:recruit', cmd: '__proto__' }).ok && !cmd(w, { type: 'ev:convert', cmd: 'kael', n: -5 }).ok, 'bad input');
});
await test('shops sell for their currency with daily limits; gems spent in More Than Gems count toward its rewards', () => {
  const w = world();
  const g = w.govs[P];
  check(!cmd(w, { type: 'ev:buy', shop: 'gems', id: 'keyG', n: 1 }).ok, 'bought without gems');
  A.give(w, g, { gems: 30000 });
  check(cmd(w, { type: 'ev:buy', shop: 'gems', id: 'keyG', n: 5 }).ok && g.inv.items.keyG === 5 && g.inv.gems === 30000 - 3750, 'five gold keys');
  check(!cmd(w, { type: 'ev:buy', shop: 'gems', id: 'keyG', n: 1 }).ok, 'past the daily limit');
  check(!cmd(w, { type: 'ev:buy', shop: 'guild', id: 'speed60', n: 1 }).ok || g.guild >= 0, 'the guild shop needs a guild');
  check(!cmd(w, { type: 'ev:buy', shop: 'gems', id: 'nothing' }).ok && !cmd(w, { type: 'ev:buy', shop: 'toString', id: 'x' }).ok, 'unknown shop and item');
  // More Than Gems opens on day 4 of each week
  at(w, 4);
  check(A.eventWindow(w, 'mtg').open, 'More Than Gems is open on day 4');
  A.give(w, g, { gems: 10000 });
  check(cmd(w, { type: 'ev:buy', shop: 'gems', id: 'speed480', n: 4 }).ok, 'spend 8,000 gems');
  check(A.winState(w, g, 'mtg').spent === 8000 && g.inv.sc.uniL === 5 && g.inv.sc.uniE === 5, `milestones at 2,000 and 7,000: ${JSON.stringify(g.inv.sc)}`);
  at(w, 6);
  check(!A.eventWindow(w, 'mtg').open, 'closed on day 6');
});

// ---------------------------------------------------------------- Sunset Canyon and the Expedition
await test('Sunset Canyon: five battles a day against the offered opponents; a win over a higher rank swaps places', () => {
  const w = world();
  const g = w.govs[P];
  A.advance(w, 60);
  const rank = A.canyonRanks(w);
  check(rank.length === 600 && new Set(rank).size === 600, 'every governor has a rank');
  const ch = A.canyonChoices(w, g);
  check(ch.length >= 1 && ch.length <= 3 && ch.every(id => rank.indexOf(id) < rank.indexOf(g.id)), 'opponents rank above');
  check(!cmd(w, { type: 'ev:canyon', target: rank.find(id => !ch.includes(id) && id !== P) }).ok, 'an opponent that was not offered');
  // a strong line beats them
  for (const id of ['kael', 'genghis', 'alexander', 'caesar', 'leonidas']) g.cmds[id] = { lv: 40, xp: 0, sk: [5, 5, 5, 5], tal: {} };
  const before = rank.indexOf(g.id);
  const target = A.canyonChoices(w, g)[0];
  const tr = rank.indexOf(target);
  const r = cmd(w, { type: 'ev:canyon', target });
  check(r.ok && r.won && r.fights.length >= 1, `a strong line should win: ${JSON.stringify(r).slice(0, 200)}`);
  check(A.canyonRanks(w).indexOf(g.id) === tr && A.canyonRanks(w).indexOf(target) === before, 'the ranks swapped');
  for (let k = 0; k < 4; k++) check(cmd(w, { type: 'ev:canyon', target: A.canyonChoices(w, g)[0] }).ok, `battle ${k + 2}`);
  check(!cmd(w, { type: 'ev:canyon', target: A.canyonChoices(w, g)[0] }).ok, 'a sixth battle in one day');
  // the day's rewards are paid by rank at the day change
  const gems = g.inv.gems;
  A.advance(w, A.DAY - (w.t % A.DAY) + 2);
  check(g.inv.gems > gems, 'the canyon paid gems at the day change');
  check(cmd(w, { type: 'ev:canyon', target: A.canyonChoices(w, g)[0] }).ok, 'the attempts return the next day');
});
await test('a chosen canyon formation is used and must be your own commanders', () => {
  const w = world();
  const g = w.govs[P];
  g.cmds.genghis = { lv: 5, xp: 0, sk: [1, 1, 1, 1], tal: {} };
  check(!cmd(w, { type: 'ev:formation', cmds: ['kael', 'alexander'] }).ok, 'a commander you do not have');
  check(!cmd(w, { type: 'ev:formation', cmds: ['kael', 'kael', 'kael', 'kael', 'kael', 'kael'] }).ok, 'six slots');
  check(cmd(w, { type: 'ev:formation', cmds: ['genghis', 'kael'] }).ok, 'save a line');
  check(A.formationOf(g).join() === 'genghis,kael', `the order is kept: ${A.formationOf(g)}`);
  check(A.formationArmy(g, 'genghis').cav === 2500 + 450 * 5, 'a cavalry commander leads cavalry sized by level');
});
await test('the Expedition: stages in order, medals every hour per stage cleared, and its shop', () => {
  const w = world();
  const g = w.govs[P];
  const r = cmd(w, { type: 'ev:expedition' });
  check(r.ok && r.won && g.exp.st === 1, `the first stage: ${JSON.stringify(r).slice(0, 160)}`);
  check(g.exp.med >= 50, 'the first clear pays medals');
  const m0 = A.medalsNow(w, g);
  A.advance(w, 5 * A.HOUR);
  check(Math.round(A.medalsNow(w, g) - m0) === 5 * A.EXPEDITION.medals, `medals accrue: ${A.medalsNow(w, g) - m0}`);
  g.exp.med = 1000;
  check(cmd(w, { type: 'ev:buy', shop: 'expedition', id: 'scBoudica', n: 3 }).ok && g.inv.sc.boudica === 3, 'Boudica sculptures for medals');
  check(Math.round(A.medalsNow(w, g)) < 200, 'the medals were spent');
  // a stage far beyond the line is lost, and nothing is risked
  g.exp.st = 29;
  const troops = { ...g.troops };
  const r2 = cmd(w, { type: 'ev:expedition' });
  check(r2.ok && !r2.won && g.exp.st === 29, 'the last stage is too strong for a new governor');
  check(JSON.stringify(g.troops) === JSON.stringify(troops), 'no real troops are lost');
});

// ---------------------------------------------------------------- guild helps and donations
await test('guild helps take time off a mate\'s timer, once per helper, at most ten; donations fill the treasury', () => {
  const w = world();
  const g = w.govs[P];
  const { gd, lead: mate } = joinNearGuild(w);
  mate.q.build = null;
  check(startBuild(w, mate), 'the mate starts a build');
  const q = mate.q.build;
  const end0 = q.end;
  const r = cmd(w, { type: 'ev:help' });
  check(r.ok && r.n >= 1 && q.end < end0 && q.hp.includes(P), `help: ${JSON.stringify(r)}`);
  check(g.inv.credits === r.n * A.HELP.credits, 'credits for each help');
  const again = A.helpRequests(w, g).filter(x => x.gov === mate.id && x.kind === 'build');
  check(!again.length, 'the same governor cannot help the same timer twice');
  for (const id of gd.members) if (id !== P && id !== mate.id) A.actHelpAll(w, w.govs[id]);
  check(q.hp.length <= A.HELP.max, `at most ${A.HELP.max} helps (${q.hp.length})`);
  // donations
  g.res.food = g.res.wood = 1e6; g.res.gold = 1e5;
  const t0 = { ...gd.treasury };
  check(cmd(w, { type: 'ev:donate' }).ok, 'donate');
  check(gd.treasury.food > t0.food && g.inv.credits >= A.DONATE.credits, 'the treasury grew and credits were paid');
  for (let k = 1; k < A.DONATE.max; k++) cmd(w, { type: 'ev:donate' });
  check(!cmd(w, { type: 'ev:donate' }).ok, 'past the daily limit');
});

// ---------------------------------------------------------------- the event calendar
await test('the Wheel of Fortune: open on days 1-2, one free spin a day, then gems; milestones pay the featured commander', () => {
  const w = world();
  const g = w.govs[P];
  check(A.eventWindow(w, 'wheel').open, 'open on day 1');
  const f = A.featuredOf(w, 'wheel');
  check(A.LEGENDS.includes(f), 'the featured commander is legendary');
  check(cmd(w, { type: 'ev:spin', n: 1 }).ok, 'the free spin');
  check(!cmd(w, { type: 'ev:spin', n: 1 }).ok, 'a second spin without gems');
  A.give(w, g, { gems: 1350 });
  const r = cmd(w, { type: 'ev:spin', n: 10 });
  check(r.ok && g.inv.gems === (r.rw.gems || 0) && r.spins === 11, `ten spins for the price of nine: ${JSON.stringify(r).slice(0, 120)}`);
  check((g.inv.sc[f] || 0) >= 5, 'the 10-spin milestone pays five sculptures of the featured commander');
  check(!cmd(w, { type: 'ev:spin', n: 3 }).ok, 'only 1 or 10 spins');
  at(w, 3);
  check(!A.eventWindow(w, 'wheel').open && !cmd(w, { type: 'ev:spin', n: 1 }).ok, 'closed on day 3');
});
await test('Card King: six cards, each flip dearer, the board resets when all are face up', () => {
  const w = world();
  const g = w.govs[P];
  at(w, 3);
  check(A.eventWindow(w, 'cards').open, 'open on day 3');
  A.give(w, g, { gems: 1550 });
  check(!cmd(w, { type: 'ev:flip', pos: 6 }).ok, 'a seventh card');
  for (let k = 0; k < 6; k++) { const r = cmd(w, { type: 'ev:flip', pos: k }); check(r.ok, r.err); }
  check(g.inv.gems === 0, `the six flips cost ${A.CARD_COSTS.reduce((a, b) => a + b, 0)}`);
  check(A.winState(w, g, 'cards').board === 1 && A.winState(w, g, 'cards').flip === 0, 'a new board');
  const f = A.featuredOf(w, 'cards');
  check((g.inv.sc[f] || 0) >= 7, 'the board held 5 and 2 featured sculptures');
});
await test('Arms Training: waves until the line breaks, three tries a day, milestones by the best', () => {
  const w = world();
  const g = w.govs[P];
  at(w, 6);
  check(A.eventWindow(w, 'arms').open, 'open on day 6');
  for (const id of ['kael', 'genghis', 'alexander']) g.cmds[id] = { lv: 30, xp: 0, sk: [4, 4, 4, 4], tal: {} };
  const r = cmd(w, { type: 'ev:arms' });
  check(r.ok && r.waves >= 3 && r.best === r.waves, `waves cleared: ${JSON.stringify(r).slice(0, 200)}`);
  check(g.inv.items.speed60 >= 2, 'the 3-wave milestone paid');
  cmd(w, { type: 'ev:arms' }); cmd(w, { type: 'ev:arms' });
  check(!cmd(w, { type: 'ev:arms' }).ok, 'a fourth try');
});
await test('Ceroli Crisis: a team of four with a tank and a healer; tokens for damage; a win unlocks the next level', () => {
  const w = world();
  const g = w.govs[P];
  at(w, 5);
  check(A.eventWindow(w, 'ceroli').open, 'open on day 5');
  check(!cmd(w, { type: 'ev:ceroli', role: 'mage', cmd: 'kael', diff: 1 }).ok, 'an unknown role');
  check(!cmd(w, { type: 'ev:ceroli', role: 'dps', cmd: 'kael', diff: 2 }).ok, 'a locked difficulty');
  g.cmds.kael.lv = 30;
  const r = cmd(w, { type: 'ev:ceroli', role: 'dps', cmd: 'kael', diff: 1 });
  check(r.ok && r.team.length === 4, 'a team of four');
  const roles = r.team.map(x => x.role);
  check(roles.includes('tank') && roles.includes('healer'), `the team has a tank and a healer: ${roles}`);
  check(r.tokens > 0 && g.inv.tokens === r.tokens, 'tokens paid');
  if (r.won) check(r.unlocked === 2, 'difficulty 2 unlocked');
  // every member was paid by the same rule
  check(r.team.slice(1).every(x => w.govs[x.gov].inv.tokens > 0), 'the AI teammates were paid too');
});
await test('the Shadow Legion strikes guild cities inside territory on day 3 at 20:00 and pays by points', () => {
  const w = world(202);
  // run to just before the invasion
  A.advance(w, 2 * A.DAY + 20 * A.HOUR - w.t - 5);
  check(!w.legion, 'no invasion before its time');
  A.advance(w, 60);
  const L = w.legion;
  check(L && L.wave === 5 && L.paid, `five waves and rewards: ${JSON.stringify(L && { wave: L.wave, paid: L.paid })}`);
  const scored = Object.keys(L.pts).map(Number);
  check(scored.length > 50, `many cities held at least one wave (${scored.length})`);
  check(scored.every(id => { const g = w.govs[id]; return g.guild >= 0 && w.map.terr[A.idx(g.x, g.y)] === g.guild + 1; }), 'only cities inside their own guild territory take part');
  check(L.guilds.length >= 1 && w.chron.some(e => e.k === 'legion'), 'a guild ranking and a chronicle entry');
  const top = w.govs[scored.sort((a, b) => L.pts[b] - L.pts[a])[0]];
  check(top.inv.gems >= 100, 'the best defenders are paid');
  check(A.validateWorld(w).length === 0, A.validateWorld(w).join('; '));
});

// ---------------------------------------------------------------- the AI, saves and safety
await test('AI governors take part by the same rules: chests, canyon, expedition, helps and shops', () => {
  const w = world(303);
  A.advance(w, A.DAY + 4 * A.HOUR);
  const ai = w.govs.filter(g => !g.human);
  const n = f => ai.filter(f).length;
  check(n(g => g.exp.st > 0) > 100, `AI clear Expedition stages (${n(g => g.exp.st > 0)})`);
  check(n(g => Object.keys(g.inv.items).length > 0) > 300, 'AI collect items');
  check(n(g => g.evp.freeG >= 0) > 200, 'AI open their free gold chests');
  check(n(g => g.inv.credits > 0) > 100, `AI help guild mates and donate (${n(g => g.inv.credits > 0)})`);
  check(ai.reduce((s, g) => s + g.ev.cy, 0) > 100, 'AI fight in Sunset Canyon');
  check(n(g => Object.values(g.inv.items).some(v => v < 0) || g.inv.gems < 0) === 0, 'nobody went negative');
  check(A.validateWorld(w).length === 0, A.validateWorld(w).join('; '));
});
await test('events, items and action points survive a save; a schema 3 save gains them and the forts', () => {
  const w = world();
  const g = w.govs[P];
  A.give(w, g, { gems: 77, keyG: 2, 'sc:genghis': 4 });
  cmd(w, { type: 'ev:expedition' });
  const r = A.deserialize(A.serialize(w, 1));
  check(r.ok, r.err);
  const g2 = r.world.govs[P];
  check(g2.inv.gems === 77 && g2.inv.items.keyG === 2 && g2.inv.sc.genghis === 4 && g2.exp.st === 1, 'kept');
  // an older save: no purses, no forts
  const wrap = JSON.parse(A.serialize(w, 1));
  const body = JSON.parse(wrap.body);
  for (const x of body.govs) { delete x.inv; delete x.ev; delete x.exp; delete x.cf; delete x.evp; delete x.ap; delete x.apAt; }
  body.camps = body.camps.filter(c => !c.fort);
  delete body.canyon;
  const b2 = JSON.stringify(body);
  const old = A.deserialize(JSON.stringify({ ...wrap, v: 3, body: b2, check: A.hash32(b2) }));
  check(old.ok, old.err);
  check(old.world.govs.every(x => x.inv && x.ap === A.AP_MAX), 'every governor gained a purse and full action points');
  check(old.world.camps.filter(c => c.fort).length === A.FORTS, 'the forts were placed');
});
await test('the event commands refuse bad input without changing anything', () => {
  const w = world();
  const before = A.serialize(w, 1);
  const bad = [
    { type: 'ev:daily', k: 99 }, { type: 'ev:daily', k: '__proto__' }, { type: 'ev:use', id: '__proto__' }, { type: 'ev:use', id: 'speed60', n: 1, q: 'build' },
    { type: 'ev:use', id: 'tome1', n: -1 }, { type: 'ev:chest', kind: 'gold', n: 1000 }, { type: 'ev:buy', shop: 'gems', id: 'keyG', n: 1e9 }, { type: 'ev:canyon', target: -5 },
    { type: 'ev:formation', cmds: 'kael' }, { type: 'ev:spin', n: 'x' }, { type: 'ev:flip', pos: 2 }, { type: 'ev:arms' }, { type: 'ev:ceroli', role: 'tank', cmd: 'kael', diff: 1 },
    { type: 'ev:skill', cmd: 'kael', skill: 9 }, { type: 'ev:convert', cmd: 'constructor', n: 1 }, { type: 'ev:nothing' }, { type: 'ev:help' }, { type: 'ev:donate' },
  ];
  // day 1: the Wheel is open but Card King, Arms Training and Ceroli are not; the newcomer has no guild, gems or items
  w.govs[P].ev.cnt = {};
  for (const c of bad) { const r = cmd(w, c); check(r && r.ok === false && typeof r.err === 'string', `accepted: ${JSON.stringify(c)}`); }
  check(A.serialize(w, 1) === before, 'a refused command changed the world');
});

console.log(failed ? `conquest events: ${failed} failed, ${passed} passed` : `conquest events: all ${passed} tests passed`);
process.exit(failed ? 1 : 0);
