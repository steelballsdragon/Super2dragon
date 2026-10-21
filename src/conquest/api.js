/* Age of Conquest actions, player commands, views, saves and the server loop. Every action validates its input and
   is shared by the AI and the player, so both play by the same rules. Views only show the player what they have
   legitimately discovered. Part of the engine bundle. */

// ================================================================ actions (shared by AI and player)
// names and numbers that come from the player are checked against real keys (never '__proto__' and friends)
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const intIn = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
function buildCheck(w, g, id) {
  const d = own(BUILDINGS, id) ? BUILDINGS[id] : null;
  if (!d) return { allowed: false, ok: false, err: 'Unknown building.' };
  const L = (g.b[id] || 0) + 1;
  const no = err => ({ allowed: false, ok: false, err, L });
  if (L > MAX_LEVEL) return no('Already at the highest level.');
  if (g.b.hall < d.needHall) return no(`Needs a level ${d.needHall} Town Hall.`);
  if (id !== 'hall' && L > g.b.hall) return no('Raise the Town Hall first: no building can pass its level.');
  for (const [b, lv] of buildingReq(id, L)) if ((g.b[b] || 0) < lv) return no(`Needs ${BUILDINGS[b].name} level ${lv}.`);
  const cost = buildingCost(id, L);
  const m = cityMods(w, g);
  const minutes = Math.max(1, Math.round(buildingMinutes(id, L) / (1 + (m.buildSpeed || 0))));
  if (g.q.build) return { allowed: true, ok: false, err: 'Your builders are busy.', cost, minutes, L };
  if (!canAfford(g, cost)) return { allowed: true, ok: false, err: 'Not enough resources.', cost, minutes, L };
  return { allowed: true, ok: true, err: '', cost, minutes, L };
}
// ---------------------------------------------------------------- free finish (any queue within FREE_FINISH minutes)
const FREE_KINDS = ['build', 'research', 'heal', 'train'];
function freeQueue(g, kind, unit) {
  if (kind === 'train') return own(g.q.train, unit) ? g.q.train[unit] : null;
  return FREE_KINDS.includes(kind) ? g.q[kind] : null;
}
function freeCheck(w, g, kind, unit) {
  const q = freeQueue(g, kind, unit);
  if (!q) return { ok: false, err: 'Nothing to finish.' };
  if (q.end - w.t > FREE_FINISH) return { ok: false, err: `It is free when ${FREE_FINISH} minutes or less are left.`, left: q.end - w.t };
  return { ok: true };
}
function actFree(w, g, kind, unit) {
  const c = freeCheck(w, g, kind, unit);
  if (!c.ok) return c;
  freeQueue(g, kind, unit).end = w.t;
  processQueues(w);
  return { ok: true };
}
// ---------------------------------------------------------------- crates at producing buildings
function crateCheck(w, g, id) {
  if (!own(BUILDINGS, id) || !BUILDINGS[id].produces) return { ok: false, err: 'That building makes nothing to collect.' };
  if (!((g.b[id] || 0) > 0)) return { ok: false, err: 'Build it first.' };
  if (w.t < (g.crate[id] || 0)) return { ok: false, err: 'The crate is not full yet.', ready: g.crate[id] };
  const r = BUILDINGS[id].produces, m = cityMods(w, g);
  const amount = Math.max(1, Math.floor(production(w, g, m)[r] * CRATE.hours));
  const room = r === 'gold' ? Infinity : storage(w, g, m) - g.res[r];
  if (room < 1) return { ok: false, err: `Your ${RES_NAME[r]} storage is full.` };
  return { ok: true, res: r, amount: Math.min(amount, Math.floor(room)) };
}
function actCollect(w, g, id) {
  settle(w, g, w.t);
  const c = crateCheck(w, g, id);
  if (!c.ok) return c;
  g.res[c.res] += c.amount;
  g.crate[id] = w.t + CRATE.every;
  return { ok: true, res: c.res, amount: c.amount };
}
function crateView(w, g) {
  const out = {};
  for (const id of BUILDING_KEYS) if (BUILDINGS[id].produces && (g.b[id] || 0) > 0) out[id] = { ready: w.t >= (g.crate[id] || 0), at: g.crate[id] || 0, res: BUILDINGS[id].produces };
  return out;
}
// developer mode: resources that never run out, and queues that finish as they start
function devRefill(w) { const P = w.govs[PLAYER]; for (const r of RES) if (P.res[r] < 50e6) P.res[r] = 50e6; }
function devFinishNow(w) { const P = w.govs[PLAYER]; for (const k of ['build', 'research', 'heal']) if (P.q[k]) P.q[k].end = w.t; for (const u of UNIT_KEYS) if (P.q.train[u]) P.q.train[u].end = w.t; processQueues(w); }
function actBuild(w, g, id) {
  settle(w, g, w.t);
  const c = buildCheck(w, g, id);
  if (!c.ok) return { ok: false, err: c.err };
  pay(g, c.cost);
  g.q.build = { id, L: c.L, start: w.t, end: w.t + c.minutes, cost: c.cost };
  return { ok: true };
}
function techReqMet(g, req) {
  for (const [k, lv] of req) {
    if (k.startsWith('tech:')) { if ((g.tech[k.slice(5)] || 0) < lv) return `Needs ${TECHS[k.slice(5)].name} level ${lv}.`; }
    else if ((g.b[k] || 0) < lv) return `Needs ${BUILDINGS[k].name} level ${lv}.`;
  }
  return '';
}
function researchCheck(w, g, id) {
  const d = own(TECHS, id) ? TECHS[id] : null;
  if (!d) return { allowed: false, ok: false, err: 'Unknown technology.' };
  const lv = (g.tech[id] || 0) + 1;
  if (lv > TECH_MAX) return { allowed: false, ok: false, err: 'Fully researched.', lv };
  if (lv > (g.b.academy || 0)) return { allowed: false, ok: false, err: `Needs Academy level ${lv}.`, lv };
  const req = techReqMet(g, d.req);
  if (req) return { allowed: false, ok: false, err: req, lv };
  const cost = techCost(id, lv);
  const m = cityMods(w, g);
  const minutes = Math.max(1, Math.round(techMinutes(id, lv) / (1 + 0.04 * (g.b.academy || 0)) / (1 + (m.research || 0))));
  if (g.q.research) return { allowed: true, ok: false, err: 'The Academy is already researching.', cost, minutes, lv };
  if (!canAfford(g, cost)) return { allowed: true, ok: false, err: 'Not enough resources.', cost, minutes, lv };
  return { allowed: true, ok: true, err: '', cost, minutes, lv };
}
function actResearch(w, g, id) {
  settle(w, g, w.t);
  const c = researchCheck(w, g, id);
  if (!c.ok) return { ok: false, err: c.err };
  pay(g, c.cost);
  g.q.research = { id, lv: c.lv, start: w.t, end: w.t + c.minutes, cost: c.cost };
  return { ok: true };
}
function trainCheck(w, g, u, n) {
  const U = own(UNITS, u) ? UNITS[u] : null;
  if (!U) return { ok: false, err: 'Unknown troop type.' };
  n = Math.floor(Number(n));
  const L = g.b[U.building] || 0;
  if (L <= 0) return { ok: false, err: `Build the ${BUILDINGS[U.building].name} first.` };
  if (!Number.isFinite(n) || n < 1) return { ok: false, err: 'Train at least one.' };
  const max = trainBatch(L);
  if (n > max) return { ok: false, err: `The ${BUILDINGS[U.building].name} trains at most ${max.toLocaleString('en-US')} at a time.` };
  if (g.q.train[u]) return { ok: false, err: `The ${BUILDINGS[U.building].name} is busy.` };
  const cost = scaleCost(U.cost, n);
  const minutes = Math.max(1, Math.round(n * U.sec / 60 / (1 + 0.1 * L)));
  if (!canAfford(g, cost)) return { ok: false, err: 'Not enough resources.', cost, minutes, n, max };
  return { ok: true, err: '', cost, minutes, n, max };
}
function actTrain(w, g, u, n) {
  settle(w, g, w.t);
  const c = trainCheck(w, g, u, n);
  if (!c.ok) return { ok: false, err: c.err };
  pay(g, c.cost);
  g.q.train[u] = { n: c.n, start: w.t, end: w.t + c.minutes };
  return { ok: true };
}
function healCheck(w, g) {
  const total = troopsTotal(g.wounded);
  if (total <= 0) return { ok: false, err: 'Nobody is wounded.' };
  if (g.q.heal) return { ok: false, err: 'The Hospital is already healing.' };
  const m = cityMods(w, g);
  // heal as many as the stock allows, keeping the mix
  let k = 1;
  const full = {};
  for (const u of UNIT_KEYS) for (const r in UNITS[u].cost) full[r] = (full[r] || 0) + UNITS[u].cost[r] * g.wounded[u] * HEAL_FRACTION;
  for (const r in full) if (full[r] > 0) k = Math.min(k, g.res[r] / full[r]);
  const troops = {};
  let n = 0;
  for (const u of UNIT_KEYS) { troops[u] = Math.floor(g.wounded[u] * k); n += troops[u]; }
  if (n <= 0) return { ok: false, err: 'Not enough resources to heal anyone.' };
  const costFor = tr => { const c = {}; for (const u of UNIT_KEYS) for (const r in UNITS[u].cost) c[r] = (c[r] || 0) + Math.ceil(UNITS[u].cost[r] * tr[u] * HEAL_FRACTION); return c; };
  let cost = costFor(troops);
  // rounding up can overshoot the stock by a little: trim until it fits
  for (let guard = 0; guard < 40 && !canAfford(g, cost) && n > 0; guard++) {
    n = 0;
    for (const u of UNIT_KEYS) { troops[u] = Math.floor(troops[u] * 0.97); n += troops[u]; }
    cost = costFor(troops);
  }
  if (n <= 0 || !canAfford(g, cost)) return { ok: false, err: 'Not enough resources to heal anyone.' };
  let sec = 0;
  for (const u of UNIT_KEYS) sec += troops[u] * UNITS[u].sec * HEAL_FRACTION;
  const minutes = Math.max(1, Math.round(sec / 60 / (1 + (m.heal || 0)) / (1 + 0.05 * (g.b.hospital || 0))));
  return { ok: true, troops, cost, minutes, n };
}
function actHeal(w, g) {
  settle(w, g, w.t);
  const c = healCheck(w, g);
  if (!c.ok) return c;
  pay(g, c.cost);
  for (const u of UNIT_KEYS) g.wounded[u] -= c.troops[u];
  g.q.heal = { troops: c.troops, start: w.t, end: w.t + c.minutes };
  return { ok: true };
}
function tradeFee(w, g) {
  const m = cityMods(w, g);
  return clamp(0.12 * (1 - 0.015 * (g.b.market || 0)) * (1 + (m.tradeFee || 0)), 0.02, 0.2);
}
function tradeLimit(g) { return 20000 * (g.b.market || 0); }
function tradeQuote(w, g, sell, buy, amount) {
  const p = w.market.price;
  const fee = tradeFee(w, g);
  return Math.floor(amount * RES_VALUE[sell] * p[sell] / (RES_VALUE[buy] * p[buy]) * (1 - fee));
}
function actTrade(w, g, sell, buy, amount) {
  settle(w, g, w.t);
  amount = Math.floor(Number(amount));
  if (!(g.b.market > 0)) return { ok: false, err: 'Build a Market to trade.' };
  if (!RES.includes(sell) || !RES.includes(buy) || sell === buy) return { ok: false, err: 'Choose two different resources.' };
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, err: 'Trade at least 1.' };
  if (amount > g.res[sell]) return { ok: false, err: `You only have ${Math.floor(g.res[sell]).toLocaleString('en-US')} ${RES_NAME[sell]}.` };
  const value = amount * RES_VALUE[sell];
  if (g.tradedToday + value > tradeLimit(g)) return { ok: false, err: `Your Market can move ${Math.max(0, tradeLimit(g) - g.tradedToday).toLocaleString('en-US')} more value today.` };
  const got = tradeQuote(w, g, sell, buy, amount);
  if (got < 1) return { ok: false, err: 'That is too little to trade.' };
  g.res[sell] -= amount;
  g.res[buy] += got;
  g.tradedToday += value;
  g.stats.traded += amount;
  // selling lowers a price, buying raises it; prices drift back each day
  const p = w.market.price;
  p[sell] = clamp(p[sell] * (1 - value / 3e6), 0.6, 1.6);
  p[buy] = clamp(p[buy] * (1 + value / 3e6), 0.6, 1.6);
  checkRecruits(w, g);
  return { ok: true, got };
}
function shieldCost(g) { return 400 * g.b.hall; }
function actShield(w, g) {
  settle(w, g, w.t);
  if (g.shield > w.t) return { ok: false, err: 'Your shield is already up.' };
  if (g.shieldCd > w.t) return { ok: false, err: `A new shield is possible in ${Math.ceil((g.shieldCd - w.t) / 60)} hours.` };
  const cost = { gold: shieldCost(g) };
  if (!canAfford(g, cost)) return { ok: false, err: `A shield costs ${cost.gold.toLocaleString('en-US')} Gold.` };
  pay(g, cost);
  g.shield = w.t + SHIELD.minutes;
  g.shieldCd = w.t + SHIELD.cooldown;
  return { ok: true };
}
function relocateCost(g) { return g.freeMoveUsed || g.guild >= 0 ? 800 * g.b.hall : 0; }
function actRelocate(w, g, x, y, isAi) {
  x = Math.floor(Number(x)); y = Math.floor(Number(y));
  if (!inMap(x, y) || x < 2 || y < 2 || x > N - 3 || y > N - 3) return { ok: false, err: 'That is off the map.' };
  const i = idx(x, y);
  const t = w.map.ter[i];
  if (TERRAIN[t].cost === Infinity || t === T.ford || t === T.pass) return { ok: false, err: 'You cannot build a city there.' };
  if (w.map.occ[i]) return { ok: false, err: 'That tile is taken.' };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.map.occ[idx(clamp(x + dx, 0, N - 1), clamp(y + dy, 0, N - 1))] >= OCC_MARK) return { ok: false, err: 'Too close to a landmark.' };
  const cap = w.marks.find(m => m.kind === 'capital');
  if (dist(cap.x, cap.y, x, y) < 6) return { ok: false, err: 'Too close to the Capital.' };
  if (!isAi && !w.explored[i]) return { ok: false, err: 'You can only move to land you have explored.' };
  if (w.marches.some(m => m.owner === g.id && m.kind !== 'scout')) return { ok: false, err: 'Bring every army home before moving the city.' };
  settle(w, g, w.t);
  const cost = { gold: relocateCost(g) };
  if (!canAfford(g, cost)) return { ok: false, err: `Moving costs ${cost.gold.toLocaleString('en-US')} Gold.` };
  pay(g, cost);
  if (!cost.gold) g.freeMoveUsed = true;
  relocate(w, g, x, y);
  g.freeMoveUsed = true;
  w._cv = (w._cv || 0) + 1;
  return { ok: true };
}
function actContribute(w, g, res) {
  if (g.guild < 0) return { ok: false, err: 'You are not in a guild.' };
  settle(w, g, w.t);
  const gd = w.guilds[g.guild];
  let v = 0;
  for (const r of RES) {
    const n = Math.floor(Number(res?.[r]) || 0);
    if (n < 0) return { ok: false, err: 'Amounts cannot be negative.' };
    if (n > g.res[r]) return { ok: false, err: `You only have ${Math.floor(g.res[r]).toLocaleString('en-US')} ${RES_NAME[r]}.` };
  }
  for (const r of RES) {
    const n = Math.floor(Number(res?.[r]) || 0);
    if (n <= 0) continue;
    g.res[r] -= n; gd.treasury[r] += n; v += n * RES_VALUE[r];
  }
  if (v <= 0) return { ok: false, err: 'Choose what to give.' };
  g.stats.contributed += v;
  return { ok: true, value: v };
}
function exchangeCheck(w, g) {
  if (g.q.exchange) return { ok: false, err: 'The Grand Exchange is already being built.' };
  if (g.b.hall < EXCHANGE.hall || (g.b.market || 0) < EXCHANGE.market) return { ok: false, err: `Needs Town Hall ${EXCHANGE.hall} and Market ${EXCHANGE.market}.` };
  if (!canAfford(g, EXCHANGE.cost)) return { ok: false, err: 'Not enough resources.' };
  return { ok: true };
}
function actExchange(w, g) {
  settle(w, g, w.t);
  const c = exchangeCheck(w, g);
  if (!c.ok) return c;
  pay(g, EXCHANGE.cost);
  g.q.exchange = { start: w.t, end: w.t + EXCHANGE.minutes };
  chronicle(w, 'exchange_start', `${g.name}${tagOf(w, g)} began building the Grand Exchange. If it stands for ${EXCHANGE.minutes / DAY} days, the Age ends in their favor.`, { p: [g.id], g: g.guild >= 0 ? [g.guild] : [], x: g.x, y: g.y, imp: 3 });
  return { ok: true };
}

// ================================================================ quests and achievements (the player)
// goals in chapters; prog(g) is [how far, how far is needed] for the progress bar
const CHAPTERS = ['First Stones', 'Into the Wild', 'Under a Banner', 'A City of Note'];
const QUESTS = [
  { id: 'hall2', ch: 0, text: 'Raise the Town Hall to level 2', how: 'City: Buildings, Town Hall. No building can pass its level.', prog: g => [g.b.hall, 2], reward: { food: 2500, wood: 2500 } },
  { id: 'farm2', ch: 0, text: 'Upgrade the Farm to level 2', how: 'City: Buildings, Farm. Troops eat Food.', prog: g => [g.b.farm || 0, 2], reward: { wood: 1500, stone: 600 } },
  { id: 'warehouse', ch: 0, text: 'Build a Warehouse', how: 'Protects part of your stock from plunder.', prog: g => [g.b.warehouse || 0, 1], reward: { stone: 1200 } },
  { id: 'train', ch: 0, text: 'Train 200 Infantry', how: 'City: Barracks.', prog: g => [g.stats.trained.inf, 200], reward: { food: 3000, wood: 1000 } },
  { id: 'scout', ch: 1, text: 'Send a scout', how: 'Map: tap a bandit camp or a city, then Scout.', prog: g => [g.stats.scouts, 1], reward: { gold: 400 } },
  { id: 'camp', ch: 1, text: 'Defeat a bandit camp', how: 'Map: tap a camp of your level, then Attack.', prog: g => [g.stats.camps, 1], reward: { food: 4000, wood: 4000 } },
  { id: 'gather', ch: 1, text: 'Gather from a resource field', how: 'Map: tap a field, then Gather.', prog: g => [g.stats.gathered, 1], reward: { iron: 900 } },
  { id: 'research', ch: 1, text: 'Research a technology', how: 'Build the Academy (Town Hall 3), then research.', prog: g => [TECH_KEYS.some(t => g.tech[t] > 0) ? 1 : 0, 1], reward: { gold: 900 } },
  { id: 'guild', ch: 2, text: 'Join a guild', how: 'Guilds tab: apply to a guild near you.', prog: g => [g.guild >= 0 ? 1 : 0, 1], reward: { gold: 1500, food: 5000 } },
  { id: 'hall5', ch: 2, text: 'Raise the Town Hall to level 5', how: 'Needs walls and more resources.', prog: g => [g.b.hall, 5], reward: { food: 12000, wood: 12000, stone: 6000, iron: 2500 } },
  { id: 'wins5', ch: 2, text: 'Win 5 battles', how: 'Camps, ruins and enemy cities all count.', prog: g => [g.stats.wins, 5], reward: { gold: 2500, iron: 4000 } },
  { id: 'rally', ch: 2, text: 'Take part in a guild rally', how: 'Guild tab: join a rally when one is called.', prog: g => [g.stats.rallies, 1], reward: { gold: 3000 } },
  { id: 'hall10', ch: 3, text: 'Raise the Town Hall to level 10', how: 'A city of note.', prog: g => [g.b.hall, 10], reward: { food: 60000, wood: 60000, stone: 30000, iron: 12000, gold: 5000 } },
];
for (const q of QUESTS) q.check = g => { const [a, b] = q.prog(g); return a >= b; };
const ACHIEVEMENTS = [
  { id: 'camps10', name: 'Camp Breaker', text: 'Defeat 10 bandit camps.', check: g => g.stats.camps >= 10 },
  { id: 'wins50', name: 'Warlord', text: 'Win 50 battles.', check: g => g.stats.wins >= 50 },
  { id: 'def10', name: 'Unbreakable', text: 'Win 10 battles defending.', check: g => g.stats.defWins >= 10 },
  { id: 'sack5', name: 'Sacker of Cities', text: 'Sack 5 cities.', check: g => g.stats.sackedOthers >= 5 },
  { id: 'trade', name: 'Merchant Prince', text: 'Trade 100,000 resources.', check: g => g.stats.traded >= 100000 },
  { id: 'hall15', name: 'City of Renown', text: 'Raise the Town Hall to level 15.', check: g => g.b.hall >= 15 },
  { id: 'tech30', name: 'Scholar', text: 'Reach 30 technology levels.', check: g => TECH_KEYS.reduce((a, t) => a + (g.tech[t] || 0), 0) >= 30 },
  { id: 'cmd6', name: 'Captain of Legends', text: 'Lead 6 commanders.', check: g => Object.keys(g.cmds).length >= 6 },
  { id: 'phoenix', name: 'Phoenix', text: 'Rebuild after your city is sacked: reach Town Hall 8 after a sack.', check: g => g.stats.sacked > 0 && g.b.hall >= 8 },
  { id: 'lead', name: 'Banner Lord', text: 'Lead a guild.', check: g => g.role === 'leader' },
];

// ================================================================ player commands
const INSTANT_CMDS = new Set(['build', 'research', 'train', 'heal']);
function playerCommand(w, cmd, opts = {}) {
  const r = playerCommandRaw(w, cmd, opts);
  // developer mode's instant switch finishes what was just started
  if (r && r.ok && w.devSw?.instant && opts.dev && INSTANT_CMDS.has(cmd.type)) devFinishNow(w);
  if (r && r.ok && w.devSw?.unlimited && opts.dev) devRefill(w);
  return r;
}
function playerCommandRaw(w, cmd, opts) {
  const P = w.govs[PLAYER];
  if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return { ok: false, err: 'Bad command.' };
  settle(w, P, w.t);
  const a = cmd;
  switch (a.type) {
    case 'free': return actFree(w, P, String(a.q), String(a.unit || ''));
    case 'collect': return actCollect(w, P, String(a.id));
    case 'build': return actBuild(w, P, String(a.id));
    case 'research': return actResearch(w, P, String(a.id));
    case 'train': return actTrain(w, P, String(a.unit), a.n);
    case 'heal': return actHeal(w, P);
    case 'cancelBuild': {
      if (!P.q.build) return { ok: false, err: 'Nothing is being built.' };
      refund(P, P.q.build.cost, 0.5); P.q.build = null; return { ok: true };
    }
    case 'trade': return actTrade(w, P, a.sell, a.buy, a.amount);
    case 'shield': return actShield(w, P);
    case 'relocate': return actRelocate(w, P, a.x, a.y, false);
    case 'exchange': return actExchange(w, P);
    case 'march': {
      const kind = String(a.kind);
      if (!['attack', 'scout', 'gather', 'reinforce'].includes(kind)) return { ok: false, err: 'Unknown order.' };
      const to = Math.floor(Number(a.to));
      if (kind !== 'scout' && !w.explored[to]) return { ok: false, err: 'You have not explored that place.' };
      return strip(startMarch(w, P, { kind, to, troops: a.troops, c1: a.c1, c2: a.c2 }));
    }
    case 'recall': {
      const m = w.marches.find(x => x.id === a.march && x.owner === PLAYER);
      if (!m) return { ok: false, err: 'That army is not yours.' };
      if (m.kind === 'return') return { ok: false, err: 'That army is already coming home.' };
      if (m.kind === 'rally') return { ok: false, err: 'A rally cannot be recalled once it marches.' };
      if (m.kind === 'rallyjoin' && m.state === 'waiting' && w.rallies.some(r => r.lead === m.id && r.state === 'gathering')) {
        // the leader cancels the whole rally
        const r = w.rallies.find(x => x.lead === m.id);
        for (const p of w.marches.filter(x => x.rally === r.id)) sendHome(w, p);
        r.state = 'done';
        return { ok: true };
      }
      sendHome(w, m);
      return { ok: true };
    }
    case 'rally': return strip(startRally(w, P, { to: Math.floor(Number(a.to)), troops: a.troops, c1: a.c1, c2: a.c2, wait: a.wait }));
    case 'joinRally': return strip(joinRally(w, P, { rally: a.rally, troops: a.troops, c1: a.c1, c2: a.c2 }));
    case 'steward': if (!own(P.cmds, a.cmd)) return { ok: false, err: 'You do not have that commander.' }; P.steward = a.cmd; modsChanged(P); return { ok: true };
    case 'defender': if (!own(P.cmds, a.cmd)) return { ok: false, err: 'You do not have that commander.' }; P.defender = a.cmd; return { ok: true };
    case 'talent': {
      const r = own(P.cmds, a.cmd) ? P.cmds[a.cmd] : null;
      if (!r) return { ok: false, err: 'You do not have that commander.' };
      if (!CMD[a.cmd].talents.includes(a.branch)) return { ok: false, err: 'That talent is not in this commander\'s tree.' };
      if (talentPointsFree(r) <= 0) return { ok: false, err: 'No talent points left. Commanders earn one per level.' };
      if ((r.tal[a.branch] || 0) >= 20) return { ok: false, err: 'That branch is full.' };
      r.tal[a.branch] = (r.tal[a.branch] || 0) + 1;
      return { ok: true };
    }
    case 'resetTalents': {
      const r = own(P.cmds, a.cmd) ? P.cmds[a.cmd] : null;
      if (!r) return { ok: false, err: 'You do not have that commander.' };
      const cost = { gold: 500 * r.lv };
      if (!canAfford(P, cost)) return { ok: false, err: `Resetting costs ${cost.gold.toLocaleString('en-US')} Gold.` };
      pay(P, cost); r.tal = {}; return { ok: true };
    }
    case 'skill': {
      const r = own(P.cmds, a.cmd) ? P.cmds[a.cmd] : null;
      const k = Math.floor(Number(a.skill));
      if (!r) return { ok: false, err: 'You do not have that commander.' };
      if (!(k >= 0 && k <= 3)) return { ok: false, err: 'Unknown skill.' };
      if (r.sk[k] >= 5) return { ok: false, err: 'That skill is at its highest level.' };
      if (k === 3 && r.lv < ULTIMATE_LEVEL) return { ok: false, err: `The ultimate unlocks at level ${ULTIMATE_LEVEL}.` };
      const cost = skillCost(a.cmd, r.sk[k]);
      if (!canAfford(P, cost)) return { ok: false, err: 'Not enough resources.' };
      pay(P, cost); r.sk[k]++; modsChanged(P);
      return { ok: true };
    }
    case 'claimQuest': {
      const q = QUESTS.find(x => x.id === a.id);
      if (!q) return { ok: false, err: 'Unknown quest.' };
      if (w.quests.claimed[q.id]) return { ok: false, err: 'Already claimed.' };
      if (!q.check(P)) return { ok: false, err: 'Not done yet.' };
      w.quests.claimed[q.id] = w.t;
      for (const r in q.reward) P.res[r] += q.reward[r];
      return { ok: true, reward: q.reward };
    }
    case 'apply': {
      const gd = intIn(a.guild, GUILD_COUNT) ? w.guilds[a.guild] : null;
      if (!gd) return { ok: false, err: 'Unknown guild.' };
      if (P.guild >= 0) return { ok: false, err: 'Leave your guild first.' };
      const invited = (P.invites || []).includes(gd.id);
      if (invited && !gd.collapsed && gd.members.length < GUILD_MAX) { joinGuild(w, P, gd.id); P.invites = P.invites.filter(x => x !== gd.id); }
      else { const r = applyToGuild(w, P, gd); if (!r.ok) return r; }
      chronicle(w, 'join', `${P.name} joined ${gd.name} [${gd.tag}].`, { g: [gd.id], p: [PLAYER], x: P.x, y: P.y, imp: 1 });
      w._cv = (w._cv || 0) + 1;
      recomputeTerritory(w);
      return { ok: true };
    }
    case 'leave': {
      if (P.guild < 0) return { ok: false, err: 'You are not in a guild.' };
      const gd = w.guilds[P.guild];
      leaveGuild(w, P);
      chronicle(w, 'leave', `${P.name} left ${gd.name} [${gd.tag}].`, { g: [gd.id], p: [PLAYER], imp: 1 });
      w._cv = (w._cv || 0) + 1;
      recomputeTerritory(w);
      return { ok: true };
    }
    case 'contribute': return actContribute(w, P, a.res);
    case 'refound': {
      const gd = intIn(a.guild, GUILD_COUNT) ? w.guilds[a.guild] : null;
      if (!gd || !gd.collapsed) return { ok: false, err: 'Only a fallen guild\'s place can be refounded.' };
      if (P.guild >= 0) return { ok: false, err: 'Leave your guild first.' };
      if (P.b.hall < 8) return { ok: false, err: 'Founding a guild needs a level 8 Town Hall.' };
      const cost = { gold: 5000 };
      if (!canAfford(P, cost)) return { ok: false, err: 'Founding a guild costs 5,000 Gold.' };
      pay(P, cost);
      refoundGuild(w, gd, PLAYER);
      w._cv = (w._cv || 0) + 1;
      return { ok: true };
    }
    // leader and officer orders
    case 'diplo': return leaderDiplo(w, P, a);
    case 'answer': return leaderAnswer(w, P, a);
    case 'officer': {
      const gd = P.guild >= 0 ? w.guilds[P.guild] : null;
      if (!gd || gd.leader !== PLAYER) return { ok: false, err: 'Only the guild leader appoints officers.' };
      const id = Math.floor(Number(a.gov));
      if (!gd.members.includes(id) || id === PLAYER) return { ok: false, err: 'That governor is not in your guild.' };
      if (a.on) { if (gd.officers.length >= OFFICERS_MAX) return { ok: false, err: `A guild has at most ${OFFICERS_MAX} officers.` }; if (!gd.officers.includes(id)) gd.officers.push(id); w.govs[id].role = 'officer'; }
      else { gd.officers = gd.officers.filter(x => x !== id); w.govs[id].role = 'member'; }
      return { ok: true };
    }
    case 'kick': {
      const gd = P.guild >= 0 ? w.guilds[P.guild] : null;
      if (!gd || gd.leader !== PLAYER) return { ok: false, err: 'Only the guild leader can expel members.' };
      const id = Math.floor(Number(a.gov));
      if (!gd.members.includes(id) || id === PLAYER) return { ok: false, err: 'That governor is not in your guild.' };
      const g = w.govs[id];
      leaveGuild(w, g, true);
      relAdjust(g, PLAYER, -50);
      remember(w, g, { k: 'expelled', who: PLAYER });
      chronicle(w, 'expel', `${P.name} expelled ${g.name} from ${gd.name} [${gd.tag}].`, { g: [gd.id], p: [PLAYER, id], imp: 1 });
      return { ok: true };
    }
    case 'objective': {
      const gd = P.guild >= 0 ? w.guilds[P.guild] : null;
      if (!gd || (gd.leader !== PLAYER && !gd.officers.includes(PLAYER))) return { ok: false, err: 'Only the leader and officers set objectives.' };
      const mk = intIn(a.mark, w.marks.length) ? w.marks[a.mark] : null;
      if (a.mark !== -1 && (!mk || mk.kind === 'ruin')) return { ok: false, err: 'Choose a fortress or the Capital.' };
      gd.policy = { ...gd.policy, objective: a.mark, why: a.mark === -1 ? 'No objective set.' : `Objective set by ${P.name}: ${mk.name}.`, since: w.t };
      gd.playerObjective = a.mark;
      return { ok: true };
    }
    case 'settings': {
      if (a.offlineCap != null) { const v = Math.floor(Number(a.offlineCap)); if ([0, 6 * HOUR, 12 * HOUR, 24 * HOUR, 72 * HOUR].includes(v)) w.settings.offlineCap = v; else return { ok: false, err: 'Unknown setting.' }; }
      if (a.notify != null) { if (['all', 'important', 'off'].includes(a.notify)) w.settings.notify = a.notify; else return { ok: false, err: 'Unknown setting.' }; }
      return { ok: true };
    }
    case 'readReport': { const r = w.reports.find(x => x.id === a.id); if (r) r.read = true; return { ok: true }; }
    default:
      if (a.type.startsWith('dev:')) return opts.dev ? devCommand(w, a) : { ok: false, err: 'Developer mode is off.' };
      return { ok: false, err: 'Unknown command.' };
  }
}
function strip(r) { return r && r.ok ? { ok: true } : r; }
function skillCost(id, lv) { const k = CMD[id].rarity === 'epic' ? 0.7 : 1; return { gold: Math.round(1500 * lv * lv * k), iron: Math.round(2000 * lv * k) }; }
function leaderDiplo(w, P, a) {
  const gd = P.guild >= 0 ? w.guilds[P.guild] : null;
  if (!gd || gd.leader !== PLAYER) return { ok: false, err: 'Only your guild\'s leader can do that.' };
  const o = intIn(a.guild, GUILD_COUNT) ? w.guilds[a.guild] : null;
  if (!o || o.id === gd.id || o.collapsed) return { ok: false, err: 'Choose another guild.' };
  const tr = treaty(w, gd.id, o.id);
  const oLeader = w.govs[o.leader];
  switch (a.k) {
    case 'war':
      if (tr && tr.k === 'war') return { ok: false, err: 'You are already at war.' };
      if (tr && tr.k === 'truce') return { ok: false, err: 'A truce is in force for another day.' };
      declareWar(w, gd.id, o.id, `${P.name} gave the order.`);
      return { ok: true };
    case 'peace': {
      if (!tr || tr.k !== 'war') return { ok: false, err: 'You are not at war with them.' };
      const theirs = o.warScore[gd.id] || 0, mine = gd.warScore[o.id] || 0;
      const accept = theirs < mine + 25 || warsOf(w, o.id).length > 1 || (oLeader && oLeader.t.diplo > 0.7);
      if (!accept) { o.rel[gd.id] = clamp(o.rel[gd.id] - 3, -100, 100); return { ok: false, err: `${o.name} refused: they think they are winning (war score ${Math.round(theirs)} to ${Math.round(mine)}).` }; }
      makePeace(w, gd.id, o.id, `${P.name} offered terms`);
      return { ok: true };
    }
    case 'nap': {
      if (tr) return { ok: false, err: tr.k === 'war' ? 'Make peace first.' : 'You already have a treaty.' };
      if (o.rel[gd.id] <= 5 || gd.cred < 25) return { ok: false, err: `${o.name} declined: relations are ${Math.round(o.rel[gd.id])} and your guild's credibility is ${Math.round(gd.cred)}.` };
      setTreaty(w, gd.id, o.id, 'nap', { secret: !!a.secret });
      chronicle(w, 'nap', `${gd.name} [${gd.tag}] and ${o.name} [${o.tag}] signed a non-aggression pact.`, { g: [gd.id, o.id], imp: 1, vis: a.secret ? 'secret' : 'public' });
      return { ok: true };
    }
    case 'alliance': {
      if (!tr || tr.k !== 'nap') return { ok: false, err: 'An alliance needs a non-aggression pact first.' };
      if (o.rel[gd.id] <= 40) return { ok: false, err: `${o.name} declined: relations must be above 40 (now ${Math.round(o.rel[gd.id])}).` };
      setTreaty(w, gd.id, o.id, 'alliance');
      chronicle(w, 'alliance', `${gd.name} [${gd.tag}] and ${o.name} [${o.tag}] formed an alliance.`, { g: [gd.id, o.id], imp: 2 });
      return { ok: true };
    }
    case 'cancel': {
      if (!tr || (tr.k !== 'nap' && tr.k !== 'alliance')) return { ok: false, err: 'There is no treaty to end.' };
      clearTreaty(w, gd.id, o.id);
      o.rel[gd.id] = clamp(o.rel[gd.id] - 15, -100, 100);
      chronicle(w, 'treaty_end', `${gd.name} [${gd.tag}] ended its ${tr.k === 'nap' ? 'pact' : 'alliance'} with ${o.name} [${o.tag}].`, { g: [gd.id, o.id], imp: 1 });
      return { ok: true };
    }
    default: return { ok: false, err: 'Unknown order.' };
  }
}
function leaderAnswer(w, P, a) {
  const gd = P.guild >= 0 ? w.guilds[P.guild] : null;
  if (!gd || gd.leader !== PLAYER) return { ok: false, err: 'Only your guild\'s leader can answer.' };
  if (a.applicant != null) {
    const id = Math.floor(Number(a.applicant));
    if (!gd.applicants.includes(id)) return { ok: false, err: 'No such application.' };
    gd.applicants = gd.applicants.filter(x => x !== id);
    if (!a.yes) return { ok: true };
    const g = w.govs[id];
    if (g.guild >= 0) return { ok: false, err: `${g.name} already joined another guild.` };
    if (!joinGuild(w, g, gd.id)) return { ok: false, err: 'The guild is full.' };
    return { ok: true };
  }
  const p = gd.proposals.find(x => x.id === a.proposal);
  if (!p) return { ok: false, err: 'That proposal has expired.' };
  gd.proposals = gd.proposals.filter(x => x !== p);
  const o = w.guilds[p.from];
  if (!a.yes) { o.rel[gd.id] = clamp(o.rel[gd.id] - 5, -100, 100); return { ok: true }; }
  if (p.k === 'peace') { if (treaty(w, gd.id, o.id)?.k !== 'war') return { ok: false, err: 'You are no longer at war.' }; makePeace(w, gd.id, o.id, `${P.name} accepted their terms`); }
  else if (p.k === 'nap') { if (treaty(w, gd.id, o.id)) return { ok: false, err: 'A treaty already exists.' }; setTreaty(w, gd.id, o.id, 'nap'); chronicle(w, 'nap', `${gd.name} [${gd.tag}] and ${o.name} [${o.tag}] signed a non-aggression pact.`, { g: [gd.id, o.id], imp: 1 }); }
  else if (p.k === 'alliance') { setTreaty(w, gd.id, o.id, 'alliance'); chronicle(w, 'alliance', `${gd.name} [${gd.tag}] and ${o.name} [${o.tag}] formed an alliance.`, { g: [gd.id, o.id], imp: 2 }); }
  else if (p.k === 'callToArms') { declareWar(w, gd.id, p.against, `${P.name} answered ${o.name}'s call to arms.`); }
  return { ok: true };
}
function devCommand(w, a) {
  const P = w.govs[PLAYER];
  switch (a.type) {
    case 'dev:res': for (const r of RES) P.res[r] = Math.max(P.res[r], 50e6); return { ok: true };
    case 'dev:troops': for (const u of UNIT_KEYS) P.troops[u] += 100000; return { ok: true };
    case 'dev:finish': for (const k of ['build', 'research', 'heal', 'exchange']) if (P.q[k]) P.q[k].end = w.t; for (const u of UNIT_KEYS) if (P.q.train[u]) P.q.train[u].end = w.t; processQueues(w); return { ok: true };
    case 'dev:hall': for (const b of BUILDING_KEYS) P.b[b] = Math.max(P.b[b] || 0, Math.min(MAX_LEVEL, Math.floor(Number(a.level) || 25))); modsChanged(P); P.wallDur = wallMax(P, cityMods(w, P)); return { ok: true };
    case 'dev:reveal': w.explored.fill(1); updatePlayerVision(w); return { ok: true };
    case 'dev:commanders': for (const c of COMMANDERS) if (!P.cmds[c.id]) P.cmds[c.id] = { lv: 1, xp: 0, sk: [1, 1, 1, 1], tal: {} }; for (const id in P.cmds) { P.cmds[id].lv = CMD_MAX_LEVEL; } modsChanged(P); return { ok: true };
    case 'dev:skip': { const m = clamp(Math.floor(Number(a.minutes) || 60), 1, 7 * DAY); advance(w, m); return { ok: true }; }
    case 'dev:shield': P.shield = w.t + 7 * DAY; return { ok: true };
    case 'dev:unlimited': w.devSw.unlimited = !!a.on; if (w.devSw.unlimited) devRefill(w); return { ok: true };
    case 'dev:instant': w.devSw.instant = !!a.on; if (w.devSw.instant) devFinishNow(w); return { ok: true };
    default: return { ok: false, err: 'Unknown developer command.' };
  }
}

// ================================================================ views (only what the player has discovered)
function publicGov(w, g) {
  return { id: g.id, name: g.name, civ: g.civ, guild: g.guild, role: g.role, power: g.power, hall: g.b.hall, x: g.x, y: g.y, shield: g.shield > w.t, human: g.human };
}
function playerView(w) {
  const P = w.govs[PLAYER];
  const m = cityMods(w, P);
  const prod = production(w, P, m);
  const busy = busyCommanders(w, P);
  return {
    id: P.id, name: P.name, civ: P.civ, guild: P.guild, role: P.role, x: P.x, y: P.y, power: P.power,
    b: { ...P.b }, res: { ...P.res }, troops: { ...P.troops }, away: { ...P.away }, wounded: { ...P.wounded }, tech: { ...P.tech },
    cmds: JSON.parse(JSON.stringify(P.cmds)), busy: [...busy], steward: P.steward, defender: P.defender, q: JSON.parse(JSON.stringify(P.q)),
    shield: P.shield, shieldCd: P.shieldCd, wallDur: Math.round(P.wallDur), wallMax: wallMax(P, m), stats: JSON.parse(JSON.stringify(P.stats)),
    prod, upkeep: upkeepPerHour(P), cap: storage(w, P, m), protect: protectedAmount(P.b.warehouse || 0), hosp: Math.round(hospitalCap(P.b.hospital || 0) * (1 + (m.hospital || 0))),
    marchCap: marchCap(w, P), marchSlots: marchLimit(w, P), marchesOut: activeMarches(w, P), vision: visionRadius(P.b.tower || 0, P.b.hall),
    fee: tradeFee(w, P), tradeLeft: Math.max(0, tradeLimit(P) - P.tradedToday), shieldCost: shieldCost(P), relocateCost: relocateCost(P), mods: m,
    invites: (P.invites || []).filter(gi => !w.guilds[gi].collapsed), alert: P.alert,
  };
}
function marchView(w, m, P) {
  const g = w.govs[m.owner];
  const [x, y] = marchPos(w, m);
  const mine = m.owner === PLAYER;
  const friend = mine || (P.guild >= 0 && g.guild === P.guild);
  const total = troopsTotal(m.troops);
  return {
    id: m.id, kind: m.kind, state: m.state, owner: m.owner, ownerName: g.name, guild: g.guild, mine, friend, x, y, tx: tx(m.to), ty: ty(m.to),
    size: friend ? total : roundSig(total), troops: friend ? { ...m.troops } : null, eta: m.eta, path: mine || friend ? m.path.slice(m.k) : null,
    target: m.target, c1: friend ? m.c1 : null, gatherEnd: m.gatherEnd || 0, load: mine ? m.load : null, rally: m.rally,
  };
}
function frameView(w, since) {
  const P = w.govs[PLAYER];
  const vis = w._vis;
  const ex = w.explored;
  const out = { t: w.t, clock: clock(w.t), day: day(w), age: w.age, throne: { ...w.throne, opens: THRONE_OPENS, hold: THRONE_HOLD }, player: playerView(w), settings: { ...w.settings } };
  // fog: 0 unexplored, 1 explored, 2 in sight
  if (since.visVer !== w._visVer) {
    const fog = new Uint8Array(N2);
    for (let i = 0; i < N2; i++) fog[i] = vis[i] ? 2 : ex[i] ? 1 : 0;
    out.fog = fog;
    out.visVer = w._visVer;
  }
  if (since.terrVer !== w._terrVer) { out.terr = new Uint8Array(w.map.terr); out.terrVer = w._terrVer; }
  // cities on explored land, every second or when something changed
  const cv = (w._cv || 0) + ':' + Math.floor(w.t / 10) + ':' + (w._visVer || 0);
  if (since.cv !== cv) {
    out.cities = [];
    for (const g of w.govs) if (ex[idx(g.x, g.y)] || g.id === PLAYER || (P.guild >= 0 && g.guild === P.guild)) out.cities.push(publicGov(w, g));
    out.cv = cv;
  }
  out.marches = [];
  for (const m of w.marches) {
    if (m.state === 'garrison') continue;
    const [x, y] = marchPos(w, m);
    const i = idx(Math.round(clamp(x, 0, N - 1)), Math.round(clamp(y, 0, N - 1)));
    const own = m.owner === PLAYER || (P.guild >= 0 && w.govs[m.owner].guild === P.guild);
    if (own || vis[i] >= 2) out.marches.push(marchView(w, m, P));
  }
  // battles seen in the last few game minutes flash on the map
  out.fights = w.battles.filter(b => w.t - b.t <= 8 && (b.seen || b.a === PLAYER || b.d === PLAYER)).map(b => ({ x: b.x, y: b.y, t: b.t }));
  out.camps = w.camps.filter(c => ex[idx(c.x, c.y)]).map(c => ({ id: c.id, x: c.x, y: c.y, lv: c.lv }));
  out.nodes = w.nodes.filter(n => ex[idx(n.x, n.y)]).map(n => ({ id: n.id, x: n.x, y: n.y, res: n.res, lv: n.lv, amount: vis[idx(n.x, n.y)] ? n.amount : null, max: n.max, busy: !!n.by && vis[idx(n.x, n.y)] >= 2 }));
  out.marks = w.marks.map(mk => ({ id: mk.id, kind: mk.kind, name: mk.name, x: mk.x, y: mk.y, owner: mk.owner, since: mk.since, level: mk.level, known: !!ex[idx(mk.x, mk.y)], cleared: (mk.cleared || []).includes(PLAYER) }));
  out.guilds = w.guilds.map(gd => guildBrief(w, gd));
  out.rallies = P.guild >= 0 ? w.rallies.filter(r => r.guild === P.guild && r.state === 'gathering').map(r => rallyView(w, r)) : [];
  out.events = w.events.map(e => ({ ...e }));
  out.quests = QUESTS.map(q => { const [a, b] = q.prog(P); return { id: q.id, ch: q.ch, chapter: CHAPTERS[q.ch], text: q.text, how: q.how, reward: q.reward, prog: [Math.min(a, b), b], done: a >= b, claimed: !!w.quests.claimed[q.id] }; });
  out.crates = crateView(w, P);
  out.devSw = { ...w.devSw };
  out.unread = w.reports.filter(r => !r.read).length;
  if (P.guild >= 0 && w.guilds[P.guild].leader === PLAYER) { const gd = w.guilds[P.guild]; out.proposals = gd.proposals.map(p => ({ ...p, fromName: w.guilds[p.from].name })); out.applicants = gd.applicants.map(id => publicGov(w, w.govs[id])); }
  out.ages = w.ages.slice();
  out.scenario = w.scenario || null;
  return out;
}
function rallyView(w, r) {
  const leader = w.govs[r.leader];
  const tgt = r.target.type === 'mark' ? w.marks[r.target.id].name : w.govs[r.target.id].name;
  const lead = w.marches.find(m => m.id === r.lead);
  return { id: r.id, leader: r.leader, leaderName: leader.name, target: r.target, targetName: tgt, to: r.to, launchAt: r.launchAt, troops: rallyTroops(w, r), cap: lead ? rallyCapacity(w, lead) : 0, joined: w.marches.some(m => m.owner === PLAYER && m.rally === r.id) };
}
function guildBrief(w, gd) {
  const P = w.govs[PLAYER];
  const mine = P.guild === gd.id;
  const treaties = {};
  for (const k in gd.treaties) {
    const t = treaty(w, gd.id, Number(k));
    if (!t) continue;
    // secret pacts are only shown to members, or once discovered by scouting a leader
    if (t.secret && !mine && !(w.secretsKnown || []).includes(gd.id + ':' + k)) continue;
    treaties[k] = { k: t.k, since: t.since, until: t.until || null, secret: !!t.secret };
  }
  return {
    id: gd.id, name: gd.name, tag: gd.tag, color: gd.color, emblem: gd.emblem, collapsed: gd.collapsed, refoundAt: gd.refoundAt,
    leader: gd.leader, leaderName: gd.leader >= 0 ? w.govs[gd.leader].name : '', members: gd.members.length, power: gd.power, rank: gd.rank,
    officers: gd.officers.slice(), home: gd.home, civ: gd.civ, treaties, cred: Math.round(gd.cred), stance: gd.policy.stance, why: gd.policy.why,
    forts: w.marks.filter(m => m.owner === gd.id && m.kind === 'fortress').length, capital: w.marks.some(m => m.owner === gd.id && m.kind === 'capital'),
    rel: mine ? gd.rel.map(Math.round) : null, relToMe: P.guild >= 0 && !mine ? Math.round(gd.rel[P.guild]) : null, rule: gd.rule, tech: { ...gd.tech },
    invitedMe: (P.invites || []).includes(gd.id),
  };
}
function guildDetail(w, gi) {
  const gd = intIn(gi, GUILD_COUNT) ? w.guilds[gi] : null;
  if (!gd) return null;
  const P = w.govs[PLAYER];
  const mine = P.guild === gi;
  const out = guildBrief(w, gd);
  out.memberList = gd.members.map(id => { const g = w.govs[id]; return { ...publicGov(w, g), contributed: mine ? Math.round(g.stats.contributed) : null }; }).sort((a, b) => b.power - a.power);
  out.treasury = mine ? { ...gd.treasury } : null;
  out.history = w.chron.filter(e => e.g.includes(gi) && chronVisible(w, e)).slice(-40).reverse();
  out.techDefs = GUILD_TECH;
  out.warScore = mine ? { ...gd.warScore } : null;
  return out;
}
function chronVisible(w, e) {
  if (e.vis === 'public') return true;
  const P = w.govs[PLAYER];
  if (e.vis === 'secret') return P.guild >= 0 && e.g.includes(P.guild) || e.g.some((gi, k) => (w.secretsKnown || []).includes(gi + ':' + e.g[1 - k]));
  return false;
}
// the inspector: public facts for anyone; personality, goals and reasoning only with fresh intel or as a guild mate
function inspect(w, id) {
  const g = intIn(id, w.govs.length) ? w.govs[id] : null;
  if (!g) return null;
  const P = w.govs[PLAYER];
  const known = !!w.explored[idx(g.x, g.y)] || id === PLAYER || (P.guild >= 0 && g.guild === P.guild);
  const mate = P.guild >= 0 && g.guild === P.guild;
  const rep = intelOn(w, P, 'city', id, 6 * HOUR);
  const deep = mate || !!rep || id === PLAYER;
  const out = { ...publicGov(w, g), known, deep, civName: CIV[g.civ].name, guildName: g.guild >= 0 ? w.guilds[g.guild].name : null, tag: g.guild >= 0 ? w.guilds[g.guild].tag : null };
  if (!known) { out.x = null; out.y = null; }
  out.bg = BACKGROUNDS[g.bg];
  out.commanders = deep ? Object.keys(g.cmds).map(c => ({ id: c, lv: g.cmds[c].lv })) : null;
  // public record: battles the player saw and chronicle entries
  out.seenBattles = w.battles.filter(b => b.seen && (b.a === id || b.d === id)).slice(-8).reverse();
  out.history = w.chron.filter(e => e.p.includes(id) && chronVisible(w, e)).slice(-12).reverse();
  out.policy = g.guild >= 0 ? w.guilds[g.guild].policy.why : 'An independent governor.';
  if (deep) {
    out.arch = ARCHETYPES[g.arch].name;
    const t = g.t;
    const traits = [];
    if (t.agg > 0.65) traits.push('aggressive'); else if (t.agg < 0.3) traits.push('peaceful');
    if (t.risk > 0.65) traits.push('bold'); else if (t.risk < 0.3) traits.push('cautious');
    if (t.greed > 0.7) traits.push('economy-minded');
    if (t.loyal > 0.7) traits.push('loyal'); else if (t.loyal < 0.3) traits.push('fickle');
    if (t.honor > 0.75) traits.push('keeps their word'); else if (t.honor < 0.3) traits.push('untrustworthy');
    if (t.skill > 0.75) traits.push('shrewd'); else if (t.skill < 0.4) traits.push('makes mistakes');
    if (t.activity > 0.75) traits.push('very active'); else if (t.activity < 0.3) traits.push('plays rarely');
    out.traits = traits;
    out.state = { grow: 'Building up', raid: 'Raiding', war: 'At war', defend: 'On the defensive', rebuild: 'Rebuilding' }[g.st] || g.st;
    out.decisions = g.log.filter(d => d.vis === 'public' || mate || rep).slice().reverse();
    const rels = Object.entries(g.rel).map(([k, v]) => ({ id: Number(k), v, name: w.govs[k].name })).sort((a, b) => a.v - b.v);
    out.enemies = rels.filter(r => r.v < -20).slice(0, 4);
    out.friends = rels.filter(r => r.v > 20).slice(-4).reverse();
    out.memories = g.mem.slice(-6).reverse().map(e => memText(w, e));
    out.intel = rep ? { at: rep.at, acc: rep.acc, troops: rep.troops, wall: rep.wall, flagged: rep.flagged } : null;
    out.tier = g.tier || 'background';
  } else {
    out.decisions = known ? g.log.filter(d => d.vis === 'public').slice(-3).reverse() : [];
  }
  return out;
}
function memText(w, e) {
  const who = e.who != null ? w.govs[e.who]?.name : '';
  const gname = e.g != null && w.guilds[e.g] ? w.guilds[e.g].name : '';
  const when = clock(e.t);
  switch (e.k) {
    case 'attacked': return `${when}: attacked by ${who}${e.sacked ? ' and sacked' : e.win ? ', held the walls' : ', lost the fight'}.`;
    case 'attacked_out': return `${when}: attacked ${who} and ${e.win ? 'won' : 'lost'}.`;
    case 'ambushed': return `${when}: gatherers ambushed by ${who}.`;
    case 'scouted': return `${when}: scouted by ${who}.`;
    case 'starve': return `${when}: ${e.n} troops deserted for lack of food.`;
    case 'joined': return `${when}: joined ${gname}.`;
    case 'left': return `${when}: left ${gname}.`;
    case 'defected': return `${when}: defected from ${gname}.`;
    case 'leader': return `${when}: became leader of ${gname}.`;
    case 'expelled': return `${when}: expelled by ${who}.`;
    default: return `${when}: ${e.k}.`;
  }
}
function rankings(w, kind) {
  const P = w.govs[PLAYER];
  if (kind === 'guilds') return w.guilds.slice().sort((a, b) => b.power - a.power).map(gd => guildBrief(w, gd));
  const key = { power: g => g.power, kills: g => g.stats.kills, hall: g => g.b.hall * 1e7 + g.power }[kind] || (g => g.power);
  const list = w.govs.slice().sort((a, b) => key(b) - key(a));
  const me = list.findIndex(g => g.id === PLAYER) + 1;
  return { me, list: list.slice(0, 100).map((g, k) => ({ rank: k + 1, ...publicGov(w, g), kills: g.stats.kills, isMe: g.id === PLAYER })), total: list.length, mine: P.power };
}
function chronicleView(w, f = {}) {
  let list = w.chron.filter(e => chronVisible(w, e));
  if (f.guild != null && f.guild >= 0) list = list.filter(e => e.g.includes(Number(f.guild)));
  if (f.kind === 'war') list = list.filter(e => ['war', 'peace', 'betrayal', 'coalition', 'battle', 'sacked', 'fortress', 'capital'].includes(e.k));
  else if (f.kind === 'politics') list = list.filter(e => ['nap', 'alliance', 'leader', 'coup', 'election', 'defection', 'splinter', 'collapse', 'guild_founded', 'treaty_end', 'officer', 'join', 'leave', 'expel'].includes(e.k));
  else if (f.kind === 'world') list = list.filter(e => ['event', 'event_end', 'ruin', 'exchange', 'exchange_start', 'age_end', 'server_open', 'growth', 'guildtech', 'commander'].includes(e.k));
  else if (f.kind === 'major') list = list.filter(e => e.imp >= 2);
  const total = list.length;
  return { total, all: w.chronN, list: list.slice(-150).reverse() };
}
function historyView(w) {
  const days = Object.keys(w.hist.terr).map(Number).sort((a, b) => a - b);
  return { days, terr: { ...w.hist.terr }, power: JSON.parse(JSON.stringify(w.hist.power)), guilds: w.guilds.map(gd => ({ id: gd.id, name: gd.name, tag: gd.tag, color: gd.color })),
    casualties: w.guilds.map(gd => ({ id: gd.id, kills: gd.stats.kills, losses: gd.stats.losses, wars: gd.stats.wars, forts: gd.stats.forts })) };
}
function tileView(w, i) {
  const P = w.govs[PLAYER];
  i = Math.floor(Number(i));
  if (!(i >= 0 && i < N2)) return null;
  const x = tx(i), y = ty(i);
  const out = { i, x, y, ter: w.map.ter[i], terrain: TERRAIN[w.map.ter[i]].name, explored: !!w.explored[i], visible: w._vis[i] >= 2, territory: w.map.terr[i] ? w.map.terr[i] - 1 : -1, region: SERVER.regions[regionOf(x, y)] };
  if (!out.explored) return out;
  const t = tileTarget(w, i);
  out.target = t;
  if (t?.type === 'city') out.city = inspect(w, t.id);
  if (t?.type === 'camp') { const c = w.camps.find(x => x.id === t.id); out.camp = { id: c.id, lv: c.lv, troops: { ...c.troops }, reserved: c.reserved === PLAYER && w.t < c.until ? c.until : null }; }
  if (t?.type === 'node') { const n = nodeById(w, t.id); out.node = { id: n.id, res: n.res, lv: n.lv, amount: out.visible ? n.amount : null, max: n.max, busy: !!n.by && out.visible, byName: n.by && out.visible ? w.govs[w.marches.find(m => m.id === n.by)?.owner]?.name : null }; }
  if (t?.type === 'mark') {
    const mk = w.marks[t.id];
    const rep = intelOn(w, P, 'mark', mk.id, 12 * HOUR);
    out.mark = { id: mk.id, kind: mk.kind, name: mk.name, owner: mk.owner, level: mk.level, wallDur: out.visible ? Math.round(mk.wallDur) : null, wallMax: mk.wallMax, since: mk.since, cleared: (mk.cleared || []).includes(PLAYER), intel: rep ? { at: rep.at, troops: rep.troops, acc: rep.acc } : null, garrisonMine: mk.owner >= 0 && mk.owner === P.guild ? garrisonOf(w, mk) : null, myTroops: garrisonMarches(w, mk).filter(m => m.owner === PLAYER).map(m => ({ id: m.id, troops: m.troops })) };
  }
  return out;
}
// quick estimate for the march sheet: path, time and what the player knows about the target
function marchPreview(w, o) {
  const P = w.govs[PLAYER];
  const to = Math.floor(Number(o.to));
  if (!(to >= 0 && to < N2)) return { ok: false, err: 'That is not a place on the map.' };
  const path = findPath(w, idx(P.x, P.y), to);
  if (!path) return { ok: false, err: 'There is no way to march there.' };
  const troops = o.troops || {};
  const speed = marchSpeed(w, P, troops, o.c1, o.c2, o.kind);
  const minutes = Math.ceil(pathCost(w, path) / speed);
  return { ok: true, minutes, tiles: path.length - 1, speed };
}

// ================================================================ saves
function serialize(w, now) {
  const skip = new Set(['map', '_vis', '_inf', '_buckets', '_pathCache', 'explored']);
  const data = {};
  for (const k in w) if (!skip.has(k) && !k.startsWith('_')) data[k] = w[k];
  data.realSavedAt = now || w.realSavedAt;
  data.exploredRle = rleEncode(w.explored);
  // march paths are chains of neighbouring tiles: stored as a start tile plus one letter per step (lossless)
  data.marches = w.marches.map(m => ({ ...m, path: encodePath(m.path) }));
  // underscore fields are caches (bonuses, tiers): never saved
  const body = JSON.stringify(data, (k, v) => (k.charCodeAt(0) === 95 ? undefined : v));
  return JSON.stringify({ format: 'age-of-conquest', v: SCHEMA, check: hash32(body), body });
}
const STEP_CODES = 'abcdefghi';   // (dx+1) + 3*(dy+1)
function encodePath(path) {
  if (!path || !path.length) return '';
  let out = String(path[0]) + ':';
  for (let k = 1; k < path.length; k++) {
    const dx = tx(path[k]) - tx(path[k - 1]), dy = ty(path[k]) - ty(path[k - 1]);
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return 'J' + JSON.stringify(path);
    out += STEP_CODES[(dx + 1) + 3 * (dy + 1)];
  }
  return out;
}
function decodePath(s) {
  if (s.startsWith('J')) return JSON.parse(s.slice(1));
  const [a, steps] = s.split(':');
  const path = [Number(a)];
  for (const ch of steps || '') {
    const c = STEP_CODES.indexOf(ch);
    const prev = path[path.length - 1];
    path.push(idx(tx(prev) + (c % 3) - 1, ty(prev) + Math.floor(c / 3) - 1));
  }
  return path;
}
function deserialize(json) {
  let wrap;
  try { wrap = JSON.parse(json); } catch (e) { return { ok: false, err: 'The save is not readable.' }; }
  if (!wrap || wrap.format !== 'age-of-conquest' || typeof wrap.body !== 'string') return { ok: false, err: 'This is not an Age of Conquest save.' };
  if (hash32(wrap.body) !== wrap.check) return { ok: false, err: 'The save is damaged (its checksum does not match).' };
  if (wrap.v > SCHEMA) return { ok: false, err: 'This save comes from a newer version of the game.' };
  let w;
  try { w = JSON.parse(wrap.body); } catch (e) { return { ok: false, err: 'The save is not readable.' }; }
  migrate(w, wrap.v);
  for (const m of w.marches || []) if (typeof m.path === 'string') m.path = decodePath(m.path);
  initMap(w);
  for (const g of w.govs) w.map.occ[idx(g.x, g.y)] = OCC_CITY + g.id;
  for (const mk of w.marks) w.map.occ[idx(mk.x, mk.y)] = OCC_MARK + mk.id;
  for (const c of w.camps) w.map.occ[idx(c.x, c.y)] = c.occ;
  for (const n of w.nodes) w.map.occ[idx(n.x, n.y)] = n.occ;
  w.explored = rleDecode(w.exploredRle, N2);
  delete w.exploredRle;
  for (const g of w.govs) if (g.human) g.next = Infinity;
  rebuildBuckets(w);
  recomputeTerritory(w);
  updatePlayerVision(w);
  const problems = validateWorld(w);
  if (problems.length) return { ok: false, err: 'The save failed its checks: ' + problems.slice(0, 3).join('; '), problems };
  return { ok: true, world: w };
}
function migrate(w, v) {
  // schema 1 is the first version; later versions add their upgrades here
  if (!w.settings) w.settings = { offlineCap: 12 * HOUR, notify: 'important' };
  if (!w.notes) w.notes = [];
  if (!w.campRespawn) w.campRespawn = [];
  if (!w.devSw) w.devSw = { unlimited: false, instant: false };
  for (const g of w.govs || []) if (!g.crate) g.crate = {};
  void v;
}
// the integrity checks run on every load and in the tests
function validateWorld(w) {
  const p = [];
  if (!Array.isArray(w.govs) || w.govs.length !== GOVERNORS) p.push(`expected ${GOVERNORS} governors, found ${w.govs?.length}`);
  if (!Array.isArray(w.guilds) || w.guilds.length !== GUILD_COUNT) p.push(`expected ${GUILD_COUNT} guilds, found ${w.guilds?.length}`);
  if (p.length) return p;
  const seenTile = new Set();
  const inGuild = new Map();
  w.guilds.forEach((gd, gi) => {
    if (gd.members.length > GUILD_MAX) p.push(`${gd.name} has ${gd.members.length} members (max ${GUILD_MAX})`);
    if (!gd.collapsed && !gd.members.includes(gd.leader)) p.push(`${gd.name}'s leader is not a member`);
    for (const id of gd.members) {
      if (inGuild.has(id)) p.push(`governor ${id} is in two guilds`);
      inGuild.set(id, gi);
      if (w.govs[id].guild !== gi) p.push(`governor ${id} disagrees about its guild`);
    }
  });
  const away = w.govs.map(() => ({ inf: 0, cav: 0, arc: 0, sie: 0 }));
  for (const m of w.marches) {
    if (!w.govs[m.owner]) { p.push(`march ${m.id} has no owner`); continue; }
    for (const u of UNIT_KEYS) {
      if (!(m.troops[u] >= 0)) p.push(`march ${m.id} has bad ${u}`);
      away[m.owner][u] += m.troops[u] || 0;
    }
    if (m.parts) for (const pt of m.parts) for (const u of UNIT_KEYS) { away[pt.gov][u] += pt.troops[u] || 0; if (pt.gov === m.owner) away[pt.gov][u] -= 0; }
    if (m.parts) for (const u of UNIT_KEYS) away[m.owner][u] -= m.troops[u] || 0;
  }
  w.govs.forEach((g, i) => {
    if (g.id !== i) p.push(`governor ${i} has id ${g.id}`);
    if ((g.guild >= 0) !== inGuild.has(i)) p.push(`governor ${i} guild membership is inconsistent`);
    for (const r of RES) if (!Number.isFinite(g.res[r]) || g.res[r] < -1e-6) p.push(`governor ${i} has bad ${r}: ${g.res[r]}`);
    for (const u of UNIT_KEYS) {
      if (!Number.isInteger(g.troops[u]) || g.troops[u] < 0) p.push(`governor ${i} has bad troops ${u}: ${g.troops[u]}`);
      if (!Number.isInteger(g.wounded[u]) || g.wounded[u] < 0) p.push(`governor ${i} has bad wounded ${u}`);
      if (Math.abs((g.away[u] || 0) - away[i][u]) > 0) p.push(`governor ${i} away ${u} is ${g.away[u]} but marches hold ${away[i][u]}`);
    }
    for (const b in g.b) if (!(g.b[b] >= 0 && g.b[b] <= MAX_LEVEL) || (b !== 'hall' && g.b[b] > g.b.hall)) p.push(`governor ${i} building ${b} level ${g.b[b]} is out of range`);
    for (const t in g.tech) if (!(g.tech[t] >= 0 && g.tech[t] <= TECH_MAX)) p.push(`governor ${i} tech ${t} out of range`);
    const key = g.x + ',' + g.y;
    if (seenTile.has(key)) p.push(`two cities share tile ${key}`);
    seenTile.add(key);
    if (w.map && TERRAIN[w.map.ter[idx(g.x, g.y)]].cost === Infinity) p.push(`governor ${i} sits on impassable terrain`);
  });
  if (!w.govs[PLAYER] || !w.govs[PLAYER].human) p.push('the player slot is missing');
  if (w.govs.filter(g => g.human).length !== 1) p.push('there must be exactly one human governor');
  return p;
}

// ================================================================ the server (runs in a Web Worker, or on the page as a fallback)
function createServer(host) {
  const S = { w: null, speed: 1, acc: 0, lastFrame: 0, lastSave: 0, since: {}, dev: !!host.dev, budget: host.budgetMs || 30, maxSpeed: host.dev ? 64 : 4 };
  const now = host.now || (() => Date.now());
  const post = host.post;
  function ready(extra = {}) {
    S.since = {};
    post({ type: 'ready', seed: S.w.seed, player: PLAYER, ...extra });
    sendFrame(true);
  }
  function sendFrame() {
    if (!S.w) return;
    const f = frameView(S.w, S.since);
    if (f.fog) S.since.visVer = f.visVer;
    if (f.terr) S.since.terrVer = f.terrVer;
    if (f.cities) S.since.cv = f.cv;
    f.speed = S.speed;
    f.notes = S.w.notes.splice(0, S.w.notes.length);
    post({ type: 'frame', frame: f });
    S.lastFrame = now();
  }
  function save() {
    if (!S.w) return;
    S.w.realSavedAt = now();
    post({ type: 'save', json: serialize(S.w, S.w.realSavedAt) });
    S.lastSave = now();
  }
  function catchUp(minutes, label) {
    if (minutes <= 0) return;
    const before = summaryOf(S.w);
    const chron0 = S.w.chronN;
    advance(S.w, minutes, k => post({ type: 'progress', pct: Math.round(k * 100), label }));
    const after = summaryOf(S.w);
    post({ type: 'offline', minutes, before, after, chronicle: S.w.chron.filter(e => e.n > chron0 && chronVisible(S.w, e) && (e.imp >= 2 || e.p.includes(PLAYER))).slice(-25), reports: S.w.reports.filter(r => r.t > S.w.t - minutes).map(r => ({ id: r.id, title: r.title, t: r.t })) });
  }
  function summaryOf(w) { const P = w.govs[PLAYER]; return { power: P.power, res: projectRes(w, P, w.t), troops: { ...P.troops }, hall: P.b.hall, guild: P.guild }; }
  const api = {
    handle(msg) {
      try {
        switch (msg.type) {
          case 'new': {
            const t0 = now();
            S.w = createWorld({ seed: msg.seed, name: msg.name, civ: msg.civ, dev: S.dev, now: now(), scenario: msg.scenario === 'coalition' ? 'coalition' : null });
            S.speed = 1; S.acc = 0;
            ready({ createdMs: now() - t0 });
            save();
            return;
          }
          case 'load': {
            const r = deserialize(msg.json);
            if (!r.ok) { post({ type: 'loadError', err: r.err }); return; }
            S.w = r.world;
            S.speed = 1; S.acc = 0;
            const awaySec = Math.max(0, (now() - (S.w.realSavedAt || now())) / 1000);
            const minutes = Math.min(S.w.settings.offlineCap, Math.floor(awaySec / 60 * 6));   // 10 real seconds away = 1 game minute
            ready({ offlineMinutes: minutes });
            if (minutes > 0) { catchUp(minutes, 'The world moved on while you were away'); sendFrame(); }
            return;
          }
          case 'cmd': {
            if (!S.w) return post({ type: 'reply', rid: msg.rid, res: { ok: false, err: 'No world loaded.' } });
            const res = playerCommand(S.w, msg.cmd, { dev: S.dev });
            post({ type: 'reply', rid: msg.rid, res });
            if (res.ok) sendFrame();
            return;
          }
          case 'query': {
            if (!S.w) return post({ type: 'reply', rid: msg.rid, res: null });
            const a = msg.args || {};
            let res = null;
            switch (msg.q) {
              case 'inspect': res = inspect(S.w, a.id); break;
              case 'guild': res = guildDetail(S.w, a.id); break;
              case 'rankings': res = rankings(S.w, a.kind); break;
              case 'reports': res = S.w.reports.slice().reverse().map(r => ({ id: r.id, t: r.t, kind: r.kind, title: r.title, read: r.read, won: r.won })); break;
              case 'report': res = S.w.reports.find(r => r.id === a.id) || null; break;
              case 'replay': { const r = S.w.reports.find(x => x.id === a.id); res = r && r.input ? fight(r.input) : null; break; }
              case 'chronicle': res = chronicleView(S.w, a); break;
              case 'history': res = historyView(S.w); break;
              case 'tile': res = tileView(S.w, a.i); break;
              case 'preview': res = marchPreview(S.w, a); break;
              case 'build': res = BUILDING_KEYS.map(id => ({ id, ...buildCheck(S.w, S.w.govs[PLAYER], id) })); break;
              case 'research': res = TECH_KEYS.map(id => ({ id, ...researchCheck(S.w, S.w.govs[PLAYER], id) })); break;
              case 'train': { const P = S.w.govs[PLAYER]; res = UNIT_KEYS.map(u => ({ u, max: trainBatch(P.b[UNITS[u].building] || 0), check: trainCheck(S.w, P, u, Math.max(1, Math.floor(Number(a[u]) || 1))) })); break; }
              case 'heal': res = healCheck(S.w, S.w.govs[PLAYER]); break;
              case 'quote': res = { got: tradeQuote(S.w, S.w.govs[PLAYER], a.sell, a.buy, Math.max(0, Math.floor(Number(a.amount) || 0))), price: { ...S.w.market.price } }; break;
              case 'achievements': { const P = S.w.govs[PLAYER]; res = ACHIEVEMENTS.map(x => ({ id: x.id, name: x.name, text: x.text, done: !!x.check(P) })); break; }
              case 'exchange': res = exchangeCheck(S.w, S.w.govs[PLAYER]); break;
              case 'diag': res = diagnostics(S.w); break;
              case 'validate': res = validateWorld(S.w); break;
              default: res = null;
            }
            post({ type: 'reply', rid: msg.rid, res });
            return;
          }
          case 'speed': S.speed = clamp(Math.floor(Number(msg.v) || 0), 0, S.maxSpeed); sendFrame(); return;
          case 'save': save(); return;
          case 'frame': sendFrame(); return;
          default: return;
        }
      } catch (e) {
        post({ type: 'error', err: String(e && e.stack || e) });
      }
    },
    tick(realMs) {
      if (!S.w) return;
      const t0 = now();
      if (S.speed > 0) {
        S.acc = Math.min(S.acc + realMs / 1000 * S.speed, 240);
        while (S.acc >= 1 && now() - t0 < S.budget) {
          try { step(S.w, 1); } catch (e) { post({ type: 'error', err: String(e && e.stack || e) }); S.acc = 0; break; }
          S.acc -= 1;
        }
      }
      if (now() - S.lastFrame >= 200) sendFrame();
      if (now() - S.lastSave >= 20000) save();
    },
    get world() { return S.w; },
    get speed() { return S.speed; },
  };
  return api;
}
function diagnostics(w) {
  const tiers = { active: 0, strategic: 0, background: 0 };
  for (const g of w.govs) if (!g.human) tiers[g.tier || 'background']++;
  return {
    t: w.t, governors: w.govs.length, ai: w.govs.filter(g => !g.human).length, guilds: w.guilds.map(gd => ({ name: gd.name, members: gd.members.length, power: gd.power, collapsed: gd.collapsed })),
    independents: w.govs.filter(g => g.guild < 0).length, marches: w.marches.length, rallies: w.rallies.filter(r => r.state !== 'done').length, camps: w.camps.length, nodes: w.nodes.length,
    chronicle: w.chronN, battles: w.stats.battles, tiers, errors: w.govs.filter(g => g.lastError).map(g => ({ id: g.id, err: g.lastError })).slice(0, 5),
    guildErrors: w.guilds.filter(g => g.lastError).map(g => ({ id: g.id, err: g.lastError })),
  };
}
