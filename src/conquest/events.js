/* Age of Conquest events and daily activities: action points, daily objectives, items, the tavern and sculptures,
   Sunset Canyon, the Expedition, guild helps and donations, the shops, gems, More Than Gems, the Wheel of Fortune,
   Card King, Arms Training, Ceroli Crisis, the Shadow Legion Invasion and barbarian forts. Every action here is
   shared by the AI and the player and validates its input; AI governors take part by the same rules. Part of the
   engine bundle. */

// ================================================================ tables
const AP_MAX = 1000, AP_EVERY = 2;            // one action point every 2 game minutes, up to 1,000
function campAp(lv) { return 40 + 5 * lv; }    // attacking a bandit camp
const FORT_AP = 150;                          // leading or joining a rally on a barbarian fort
const FORTS = 60;

// items, by kind: speed (minutes off a queue), tome (commander experience), key (opens a tavern chest), ap, res
// (a crate of resources), box (opens into a random item), shield, tele (moves the city once for free)
const ITEMS = {
  speed5: { name: '5-minute Speedup', kind: 'speed', min: 5 },
  speed15: { name: '15-minute Speedup', kind: 'speed', min: 15 },
  speed60: { name: '60-minute Speedup', kind: 'speed', min: 60 },
  speed180: { name: '3-hour Speedup', kind: 'speed', min: 180 },
  speed480: { name: '8-hour Speedup', kind: 'speed', min: 480 },
  tome1: { name: 'Novice Tome of Knowledge', kind: 'tome', xp: 500 },
  tome2: { name: 'Expert Tome of Knowledge', kind: 'tome', xp: 2000 },
  tome3: { name: 'Master Tome of Knowledge', kind: 'tome', xp: 8000 },
  keyS: { name: 'Silver Key', kind: 'key' },
  keyG: { name: 'Gold Key', kind: 'key' },
  ap50: { name: 'Action Point Tonic (50)', kind: 'ap', ap: 50 },
  ap200: { name: 'Action Point Tonic (200)', kind: 'ap', ap: 200 },
  crateFood: { name: 'Food Crate (10,000)', kind: 'res', res: { food: 10000 } },
  crateWood: { name: 'Wood Crate (10,000)', kind: 'res', res: { wood: 10000 } },
  crateStone: { name: 'Stone Crate (5,000)', kind: 'res', res: { stone: 5000 } },
  crateIron: { name: 'Iron Crate (2,500)', kind: 'res', res: { iron: 2500 } },
  crateGold: { name: 'Gold Crate (1,000)', kind: 'res', res: { gold: 1000 } },
  box: { name: 'Magic Box', kind: 'box' },
  shield: { name: '8-hour Peace Shield', kind: 'shield', minutes: 8 * HOUR },
  tele: { name: 'Teleport', kind: 'tele' },
};
const ITEM_KEYS = Object.keys(ITEMS);
const SC_RECRUIT = 10;                                  // sculptures that recruit a commander
function scSkillCost(lv) { return 2 * lv; }             // sculptures that raise a skill from level lv
const EPICS = COMMANDERS.filter(c => c.rarity === 'epic').map(c => c.id);
const LEGENDS = COMMANDERS.filter(c => c.rarity === 'legendary').map(c => c.id);

// daily objectives: points for what a governor does in a game day, chests at 20, 40, 60, 80 and 100 points
const DAILY_TASKS = [
  { k: 'camp', name: 'Defeat bandit camps', pts: 5, max: 20 },
  { k: 'ap', name: 'Spend action points (per 100)', per: 100, pts: 5, max: 20 },
  { k: 'gather', name: 'Bring home gathered resources', pts: 5, max: 15 },
  { k: 'build', name: 'Finish building upgrades', pts: 5, max: 15 },
  { k: 'research', name: 'Finish research', pts: 5, max: 10 },
  { k: 'train', name: 'Finish training troops', pts: 5, max: 15 },
  { k: 'heal', name: 'Heal wounded troops', pts: 5, max: 5 },
  { k: 'scout', name: 'Send scouts', pts: 2, max: 10 },
  { k: 'help', name: 'Help guild mates', pts: 1, max: 10 },
  { k: 'donate', name: 'Donate to guild technology', pts: 2, max: 10 },
  { k: 'canyon', name: 'Fight in Sunset Canyon', pts: 5, max: 15 },
  { k: 'expedition', name: 'Fight an Expedition stage', pts: 5, max: 10 },
  { k: 'rally', name: 'Lead or join rallies', pts: 10, max: 20 },
  { k: 'tavern', name: 'Open tavern chests', pts: 5, max: 10 },
];
const DAILY_CHESTS = [
  { at: 20, rw: { speed15: 2, crateFood: 1 } },
  { at: 40, rw: { tome1: 3, keyS: 1 } },
  { at: 60, rw: { speed60: 1, gems: 50, crateWood: 1 } },
  { at: 80, rw: { tome2: 1, ap50: 1 } },
  { at: 100, rw: { gems: 150, 'sc:uniE': 1, box: 1, keyG: 1 } },
];
// tavern chests: a key each, the silver one free once a game day and the gold one once every two days
const CHESTS = {
  silver: { name: 'Silver Chest', key: 'keyS', every: 1, pool: [{ w: 30, sc: 'epic', n: 1 }, { w: 22, rw: { tome1: 2 } }, { w: 20, rw: { speed15: 2 } }, { w: 10, rw: { crateFood: 1 } }, { w: 10, rw: { crateWood: 1 } }, { w: 8, rw: { 'sc:uniE': 1 } }] },
  gold: { name: 'Gold Chest', key: 'keyG', every: 2, pool: [{ w: 26, sc: 'legend', n: 1 }, { w: 15, sc: 'epic', n: 3 }, { w: 20, rw: { tome2: 2 } }, { w: 19, rw: { speed60: 2 } }, { w: 5, rw: { 'sc:uniL': 1 } }, { w: 15, rw: { keyS: 2 } }] },
};
const BOX = [{ w: 20, rw: { speed60: 1 } }, { w: 20, rw: { tome2: 1 } }, { w: 15, rw: { crateIron: 1 } }, { w: 15, rw: { crateGold: 1 } }, { w: 15, rw: { keyS: 1 } }, { w: 15, rw: { gems: 50 } }];

// shops: each item has a price in the shop's currency and a daily limit per governor
const SHOPS = {
  gems: { name: 'Gem Shop', cur: 'gems', items: [
    { id: 'ap50', rw: { ap50: 1 }, cost: 100, limit: 10 }, { id: 'speed60', rw: { speed60: 1 }, cost: 300, limit: 20 }, { id: 'speed480', rw: { speed480: 1 }, cost: 2000, limit: 5 },
    { id: 'keyS', rw: { keyS: 1 }, cost: 150, limit: 10 }, { id: 'keyG', rw: { keyG: 1 }, cost: 750, limit: 5 }, { id: 'tome2', rw: { tome2: 1 }, cost: 250, limit: 10 },
    { id: 'shield', rw: { shield: 1 }, cost: 500, limit: 2 }, { id: 'tele', rw: { tele: 1 }, cost: 1000, limit: 2 }, { id: 'crateGold', rw: { crateGold: 1 }, cost: 100, limit: 20 },
  ] },
  expedition: { name: 'Expedition Shop', cur: 'medals', items: [
    { id: 'scBoudica', rw: { 'sc:boudica': 1 }, cost: 300, limit: 5 }, { id: 'scUniL', rw: { 'sc:uniL': 1 }, cost: 2000, limit: 1 }, { id: 'tome2', rw: { tome2: 1 }, cost: 250, limit: 5 },
    { id: 'keyG', rw: { keyG: 1 }, cost: 1000, limit: 1 }, { id: 'keyS', rw: { keyS: 1 }, cost: 250, limit: 3 }, { id: 'speed60', rw: { speed60: 1 }, cost: 150, limit: 5 },
  ] },
  guild: { name: 'Guild Shop', cur: 'credits', items: [
    { id: 'shield', rw: { shield: 1 }, cost: 2000, limit: 1 }, { id: 'tele', rw: { tele: 1 }, cost: 3000, limit: 1 }, { id: 'speed60', rw: { speed60: 1 }, cost: 300, limit: 10 },
    { id: 'tome1', rw: { tome1: 1 }, cost: 100, limit: 20 }, { id: 'ap50', rw: { ap50: 1 }, cost: 200, limit: 10 }, { id: 'keyS', rw: { keyS: 1 }, cost: 600, limit: 2 },
  ] },
  ceroli: { name: 'Ceroli Shop', cur: 'tokens', items: [
    { id: 'scUniE', rw: { 'sc:uniE': 1 }, cost: 150, limit: 10 }, { id: 'scUniL', rw: { 'sc:uniL': 1 }, cost: 900, limit: 2 }, { id: 'tome2', rw: { tome2: 1 }, cost: 120, limit: 10 },
    { id: 'keyG', rw: { keyG: 1 }, cost: 600, limit: 2 }, { id: 'speed180', rw: { speed180: 1 }, cost: 300, limit: 5 },
  ] },
};

// the event calendar, in game days: open from day `from`, for `days` days, every `every` days
const EVENT_CAL = {
  wheel: { name: 'Wheel of Fortune', every: 7, from: 1, days: 2, text: 'Spin for sculptures of a featured legendary commander. One free spin each game day.' },
  cards: { name: 'Card King', every: 7, from: 3, days: 2, text: 'Flip six hidden cards. Each flip costs more gems; the top card holds five sculptures of the featured commander.' },
  mtg: { name: 'More Than Gems', every: 7, from: 4, days: 2, text: 'Every gem you spend while it runs counts toward universal legendary sculptures.' },
  ceroli: { name: 'Ceroli Crisis', every: 7, from: 5, days: 2, text: 'A four-governor raid on Ceroli. Choose Tank, Damage or Healer; damage earns tokens for the Ceroli shop.' },
  arms: { name: 'Arms Training', every: 7, from: 6, days: 2, text: 'Hold out against wave after wave of Armsmaster Lohar. Survivors carry on to the next wave.' },
  legion: { name: 'Shadow Legion Invasion', every: 5, from: 3, days: 1, text: 'At 20:00, five waves of the Shadow Legion assault every guild member\'s city inside guild territory.' },
};
const FEATURED = ['genghis', 'alexander', 'caesar', 'saladin', 'richard', 'cleopatra', 'hannibal', 'leonidas', 'caocao', 'nobunaga', 'ragnar'];
const WHEEL_COST = 150;
const WHEEL = [
  { w: 14, rw: { 'sc:F': 1 } }, { w: 5, rw: { 'sc:F': 3 } }, { w: 0.7, rw: { 'sc:F': 10 } }, { w: 12, rw: { 'sc:uniE': 1 } }, { w: 16, rw: { speed60: 1 } }, { w: 14, rw: { tome2: 1 } },
  { w: 12, rw: { keyS: 1 } }, { w: 4, rw: { keyG: 1 } }, { w: 10, rw: { gems: 100 } }, { w: 12, rw: { ap50: 1 } }, { w: 8, rw: { crateIron: 1 } }, { w: 2, rw: { 'sc:uniL': 1 } },
];
const WHEEL_MILESTONES = [{ at: 10, rw: { 'sc:F': 5 } }, { at: 25, rw: { 'sc:F': 10 } }, { at: 50, rw: { 'sc:F': 15 } }, { at: 80, rw: { 'sc:F': 20 } }];
const CARD_COSTS = [50, 100, 150, 250, 400, 600];
const CARDS = [{ 'sc:F': 5 }, { 'sc:F': 2 }, { 'sc:uniL': 1 }, { keyG: 1 }, { tome2: 2 }, { speed180: 1 }];
const CARD_MILESTONES = [{ at: 2, rw: { 'sc:F': 5 } }, { at: 5, rw: { 'sc:F': 10 } }, { at: 10, rw: { 'sc:F': 20 } }];
const MTG = [{ at: 2000, rw: { 'sc:uniE': 5 } }, { at: 4000, rw: { tome2: 3 } }, { at: 7000, rw: { 'sc:uniL': 5 } }, { at: 10000, rw: { keyG: 3 } }, { at: 15000, rw: { 'sc:uniL': 10 } }, { at: 25000, rw: { 'sc:uniL': 20 } }];
const ARMS = { attempts: 3, waves: 30, milestones: [{ at: 3, rw: { speed60: 2 } }, { at: 6, rw: { tome2: 2 } }, { at: 10, rw: { keyG: 1 } }, { at: 15, rw: { 'sc:uniL': 1 } }, { at: 20, rw: { 'sc:uniL': 2 } }, { at: 25, rw: { gems: 500 } }] };
const CEROLI = { attempts: 3, levels: 10, rounds: 30 };
const CEROLI_ROLES = { tank: 'Tank', dps: 'Damage', healer: 'Healer' };
const LEGION = { at: 20 * HOUR, waves: 5, gap: 10 };
const LEGION_REWARDS = [{ at: 100, rw: { speed60: 1 } }, { at: 300, rw: { tome2: 2 } }, { at: 600, rw: { keyS: 2 } }, { at: 1000, rw: { keyG: 1 } }, { at: 1500, rw: { 'sc:uniL': 1 } }];
const CANYON = { attempts: 5, size: 5 };
const EXPEDITION = { stages: 30, attempts: 10, medals: 4 };   // medals per game hour per stage cleared
const EXP_CHAPTERS = ['The Border Road', 'Wolf Hills', 'The Salt Marsh', 'Ember Steppe', 'The Glass Mountains', 'Throne of Ash'];
const HELP = { max: 10, credits: 10, paid: 50 };   // helps per queue, credits per help, paid helps per day
const DONATE = { max: 20, credits: 40 };

// ================================================================ state
// per governor: ap and apAt; inv { gems, credits, tokens, items, sc }; ev (today's counters, reset each game day);
// exp (the Expedition); cf (the Sunset Canyon formation); evp { freeG, n, win } (the last free gold chest, a draw
// counter for chests and wheels, and progress in the current window of each event)
function initEvents(w, g) {
  g.ap = AP_MAX; g.apAt = w.t;
  g.inv = { gems: 0, credits: 0, tokens: 0, items: {}, sc: {} };
  g.ev = { d: Math.floor(w.t / DAY), cnt: {}, got: 0, cy: 0, ex: 0, don: 0, helpN: 0, buy: {}, spin: 0, arms: 0, ce: 0, freeS: 0 };
  g.exp = { st: 0, med: 0, at: w.t };
  g.cf = [];
  g.evp = { freeG: -9, n: 0, win: {} };
}
function dailyOf(w, g) {
  const d = Math.floor(w.t / DAY);
  if (g.ev.d !== d) g.ev = { d, cnt: {}, got: 0, cy: 0, ex: 0, don: 0, helpN: 0, buy: {}, spin: 0, arms: 0, ce: 0, freeS: 0 };
  return g.ev;
}
function activity(w, g, k, n = 1) {
  const e = dailyOf(w, g);
  e.cnt[k] = (e.cnt[k] || 0) + n;
}
function dailyPoints(e) {
  let p = 0;
  for (const t of DAILY_TASKS) p += Math.min(t.max, Math.floor((e.cnt[t.k] || 0) / (t.per || 1)) * t.pts);
  return p;
}
// ---------------------------------------------------------------- action points
function apNow(w, g) { return g.ap >= AP_MAX ? g.ap : Math.min(AP_MAX, g.ap + (w.t - g.apAt) / AP_EVERY); }
function settleAp(w, g) { g.ap = apNow(w, g); g.apAt = w.t; }
function spendAp(w, g, n) {
  settleAp(w, g);
  if (g.ap < n - 1e-9) return false;
  g.ap -= n;
  activity(w, g, 'ap', n);
  return true;
}
function apError(w, g, n) { return `This needs ${n} action points; you have ${Math.floor(apNow(w, g))}. One returns every ${AP_EVERY} minutes.`; }
// ---------------------------------------------------------------- rewards
function give(w, g, rw) {
  const inv = g.inv;
  for (const k in rw) {
    const n = rw[k];
    if (!(n > 0)) continue;
    if (k === 'gems' || k === 'credits' || k === 'tokens') inv[k] += n;
    else if (k === 'medals') g.exp.med += n;
    else if (k.startsWith('sc:')) inv.sc[k.slice(3)] = (inv.sc[k.slice(3)] || 0) + n;
    else if (own(ITEMS, k)) inv.items[k] = (inv.items[k] || 0) + n;
  }
}
// 'sc:F' in a table stands for the featured commander
function withFeatured(rw, f) { const o = {}; for (const k in rw) o[k === 'sc:F' ? 'sc:' + f : k] = (o[k === 'sc:F' ? 'sc:' + f : k] || 0) + rw[k]; return o; }
function rewardName(k) {
  if (k === 'gems') return 'Gems';
  if (k === 'credits') return 'Guild Credits';
  if (k === 'tokens') return 'Ceroli Tokens';
  if (k === 'medals') return 'Expedition Medals';
  if (k === 'sc:uniE') return 'Universal Epic Sculpture';
  if (k === 'sc:uniL') return 'Universal Legendary Sculpture';
  if (k.startsWith('sc:')) return `${CMD[k.slice(3)]?.name || k.slice(3)} Sculpture`;
  return ITEMS[k]?.name || k;
}
function rewardText(rw) { return Object.keys(rw).map(k => `${rw[k].toLocaleString('en-US')} ${rewardName(k)}`).join(', '); }
function pickWeighted(rng, pool) {
  let s = 0;
  for (const p of pool) s += p.w;
  let x = rng() * s;
  for (const p of pool) { x -= p.w; if (x < 0) return p; }
  return pool[pool.length - 1];
}
function drawFrom(w, g, pool, what) {
  const rng = makeRng(hash32(w.seed, what, g.id, g.evp.n++));
  const p = pickWeighted(rng, pool);
  if (p.sc) return { ['sc:' + rng.pick(p.sc === 'epic' ? EPICS : LEGENDS)]: p.n };
  return { ...p.rw };
}
function addTo(total, rw) { for (const k in rw) total[k] = (total[k] || 0) + rw[k]; return total; }
// ---------------------------------------------------------------- event windows
function eventWindow(w, id) {
  const c = EVENT_CAL[id];
  const d = 1 + Math.floor(w.t / DAY);
  const k = Math.floor((d - c.from) / c.every);
  const startDay = c.from + Math.max(0, k) * c.every;
  let open = d >= c.from && d - startDay < c.days;
  let start = (startDay - 1) * DAY, end = start + c.days * DAY;
  if (id === 'legion') { start += LEGION.at; end = start + LEGION.waves * LEGION.gap + 1; open = w.t >= start && w.t < end; }
  const next = w.t < start ? start : (c.from + (Math.max(0, k) + 1) * c.every - 1) * DAY + (id === 'legion' ? LEGION.at : 0);
  if (w.devSw?.events && id !== 'legion') return { id, open: true, key: 'dev' + d, start: (d - 1) * DAY, end: d * DAY, next: d * DAY };
  return { id, open, key: String(Math.max(0, k)), start, end, next };
}
// progress inside the current window of an event (reset when a new window opens)
function winState(w, g, id) {
  const key = eventWindow(w, id).key;
  let s = g.evp.win[id];
  if (!s || s.key !== key) s = g.evp.win[id] = { key, n: 0, got: 0, best: 0, flip: 0, board: 0, unlocked: 1, spent: 0 };
  return s;
}
function featuredOf(w, id) {
  const ewin = eventWindow(w, id);
  const k = Number(String(ewin.key).replace('dev', '')) || 0;
  return FEATURED[(k + (id === 'cards' ? 5 : 0)) % FEATURED.length];
}
function claimMilestones(w, g, s, list, value, f, title) {
  const got = [];
  list.forEach((m, k) => {
    if (value >= m.at && !(s.got & (1 << k))) {
      s.got |= 1 << k;
      const rw = f ? withFeatured(m.rw, f) : m.rw;
      give(w, g, rw);
      got.push(rw);
      if (g.human) note(w, 'event', `${title}: ${rewardText(rw)}.`, 2);
    }
  });
  return got;
}

// ================================================================ daily objectives
function actClaimDaily(w, g, k) {
  const e = dailyOf(w, g);
  const ch = DAILY_CHESTS[k];
  if (!ch) return { ok: false, err: 'Unknown chest.' };
  if (e.got & (1 << k)) return { ok: false, err: 'Already claimed today.' };
  if (dailyPoints(e) < ch.at) return { ok: false, err: `This chest opens at ${ch.at} activity points.` };
  e.got |= 1 << k;
  give(w, g, ch.rw);
  return { ok: true, rw: ch.rw };
}
// ================================================================ items
function speedQueue(g, q, unit) {
  if (q === 'train') return own(g.q.train, unit) ? g.q.train[unit] : null;
  return q === 'build' || q === 'research' || q === 'heal' ? g.q[q] : null;
}
function actUseItem(w, g, o) {
  const id = o.id;
  if (!own(ITEMS, id)) return { ok: false, err: 'Unknown item.' };
  const it = ITEMS[id];
  const n = Math.floor(Number(o.n) || 1);
  if (!(n >= 1 && n <= 100000)) return { ok: false, err: 'Choose how many to use.' };
  const have = g.inv.items[id] || 0;
  if (have < n) return { ok: false, err: `You have ${have} ${it.name}.` };
  const take = k => { g.inv.items[id] -= k; if (!g.inv.items[id]) delete g.inv.items[id]; };
  switch (it.kind) {
    case 'speed': {
      const q = speedQueue(g, String(o.q || ''), String(o.unit || ''));
      if (!q) return { ok: false, err: 'Nothing is in that queue.' };
      const left = q.end - w.t;
      if (left <= 0) return { ok: false, err: 'That is already finished.' };
      // never spend more than the queue needs
      const k = Math.min(n, Math.ceil(left / it.min));
      q.end = Math.max(w.t, q.end - it.min * k);
      take(k);
      processGov(w, g);
      return { ok: true, used: k };
    }
    case 'tome': {
      if (!own(g.cmds, o.cmd)) return { ok: false, err: 'Choose one of your commanders.' };
      if (g.cmds[o.cmd].lv >= CMD_MAX_LEVEL) return { ok: false, err: `${CMD[o.cmd].name} is already at the highest level.` };
      take(n);
      giveXp(w, g, o.cmd, it.xp * n);
      return { ok: true, used: n };
    }
    case 'ap': settleAp(w, g); g.ap += it.ap * n; take(n); return { ok: true, used: n };
    case 'res': settle(w, g, w.t); for (const r in it.res) g.res[r] += it.res[r] * n; take(n); return { ok: true, used: n };
    case 'box': {
      const total = {};
      for (let k = 0; k < n; k++) addTo(total, drawFrom(w, g, BOX, 'box'));
      take(n);
      give(w, g, total);
      return { ok: true, used: n, rw: total };
    }
    case 'shield': {
      if (g.shield > w.t) return { ok: false, err: 'Your shield is already up.' };
      g.shield = w.t + it.minutes;
      take(1);
      return { ok: true, used: 1 };
    }
    case 'key': return { ok: false, err: 'Keys open chests in the Tavern.' };
    case 'tele': return { ok: false, err: 'Choose a place on the map, then Move city, to use a Teleport.' };
  }
  return { ok: false, err: 'That item cannot be used.' };
}
// ================================================================ tavern and sculptures
function chestFree(w, g, kind) {
  const d = Math.floor(w.t / DAY);
  return kind === 'silver' ? !dailyOf(w, g).freeS : d - g.evp.freeG >= CHESTS.gold.every;
}
function actOpenChest(w, g, kind, n) {
  const c = own(CHESTS, kind) ? CHESTS[kind] : null;
  if (!c) return { ok: false, err: 'Unknown chest.' };
  n = Math.floor(Number(n) || 1);
  if (!(n >= 1 && n <= 50)) return { ok: false, err: 'Open between 1 and 50 at a time.' };
  const free = chestFree(w, g, kind) ? 1 : 0;
  const keys = n - free;
  if ((g.inv.items[c.key] || 0) < keys) return { ok: false, err: free ? `The free chest opens one. More need ${ITEMS[c.key].name}s.` : `You need a ${ITEMS[c.key].name}.` };
  if (free) { if (kind === 'silver') dailyOf(w, g).freeS = 1; else g.evp.freeG = Math.floor(w.t / DAY); }
  if (keys) { g.inv.items[c.key] -= keys; if (!g.inv.items[c.key]) delete g.inv.items[c.key]; }
  const total = {};
  for (let k = 0; k < n; k++) addTo(total, drawFrom(w, g, c.pool, 'chest-' + kind));
  give(w, g, total);
  activity(w, g, 'tavern', n);
  return { ok: true, rw: total };
}
function recruitWith(w, g, id, how) {
  g.cmds[id] = { lv: 1, xp: 0, sk: [1, 1, 1, 1], tal: {} };
  g.recruited++;
  if (g.human) {
    note(w, 'commander', `${CMD[id].name}, ${CMD[id].title}, joined you${how}.`, 3);
    chronicle(w, 'commander', `${CMD[id].name}, ${CMD[id].title}, swore service to ${g.name}.`, { p: [g.id], x: g.x, y: g.y, imp: 1 });
  }
}
function actRecruitSc(w, g, id) {
  if (!own(CMD, id)) return { ok: false, err: 'Unknown commander.' };
  if (g.cmds[id]) return { ok: false, err: `${CMD[id].name} already serves you.` };
  const have = g.inv.sc[id] || 0;
  if (have < SC_RECRUIT) return { ok: false, err: `Recruiting needs ${SC_RECRUIT} sculptures of ${CMD[id].name}; you have ${have}.` };
  g.inv.sc[id] -= SC_RECRUIT;
  recruitWith(w, g, id, ' for ten sculptures');
  return { ok: true };
}
function actSkillSc(w, g, id, k) {
  const r = own(g.cmds, id) ? g.cmds[id] : null;
  k = Math.floor(Number(k));
  if (!r) return { ok: false, err: 'You do not have that commander.' };
  if (!(k >= 0 && k <= 3)) return { ok: false, err: 'Unknown skill.' };
  if (r.sk[k] >= 5) return { ok: false, err: 'That skill is at its highest level.' };
  if (k === 3 && r.lv < ULTIMATE_LEVEL) return { ok: false, err: `The ultimate unlocks at level ${ULTIMATE_LEVEL}.` };
  const cost = scSkillCost(r.sk[k]), have = g.inv.sc[id] || 0;
  if (have < cost) return { ok: false, err: `This skill level needs ${cost} sculptures of ${CMD[id].name}; you have ${have}.` };
  g.inv.sc[id] -= cost;
  r.sk[k]++;
  modsChanged(g);
  return { ok: true };
}
function actConvertSc(w, g, id, n) {
  if (!own(CMD, id)) return { ok: false, err: 'Unknown commander.' };
  n = Math.floor(Number(n) || 0);
  const uni = CMD[id].rarity === 'epic' ? 'uniE' : 'uniL';
  if (!(n >= 1)) return { ok: false, err: 'Choose how many to convert.' };
  if ((g.inv.sc[uni] || 0) < n) return { ok: false, err: `You have ${g.inv.sc[uni] || 0} ${rewardName('sc:' + uni)}s.` };
  g.inv.sc[uni] -= n;
  g.inv.sc[id] = (g.inv.sc[id] || 0) + n;
  return { ok: true };
}
// ================================================================ shops and gems
function shopPrice(w, g, shop, item) { return item.cost; }
function currencyOf(w, g, cur) { return cur === 'medals' ? medalsNow(w, g) : g.inv[cur]; }
function spendGems(w, g, n) {
  g.inv.gems -= n;
  const mtg = eventWindow(w, 'mtg');
  if (mtg.open) {
    const s = winState(w, g, 'mtg');
    s.spent += n;
    claimMilestones(w, g, s, MTG, s.spent, null, 'More Than Gems');
  }
}
function actBuy(w, g, shopId, itemId, n) {
  const shop = own(SHOPS, shopId) ? SHOPS[shopId] : null;
  if (!shop) return { ok: false, err: 'Unknown shop.' };
  const item = shop.items.find(x => x.id === itemId);
  if (!item) return { ok: false, err: 'That is not for sale here.' };
  n = Math.floor(Number(n) || 1);
  if (!(n >= 1 && n <= 1000)) return { ok: false, err: 'Choose how many to buy.' };
  if (shopId === 'guild' && g.guild < 0) return { ok: false, err: 'Join a guild to use the Guild Shop.' };
  const e = dailyOf(w, g), key = shopId + ':' + itemId;
  if ((e.buy[key] || 0) + n > item.limit) return { ok: false, err: `You can buy ${Math.max(0, item.limit - (e.buy[key] || 0))} more today.` };
  const cost = shopPrice(w, g, shop, item) * n;
  if (currencyOf(w, g, shop.cur) < cost) return { ok: false, err: `That costs ${cost.toLocaleString('en-US')} ${rewardName(shop.cur)}.` };
  if (shop.cur === 'medals') { settleMedals(w, g); g.exp.med -= cost; }
  else if (shop.cur === 'gems') spendGems(w, g, cost);
  else g.inv[shop.cur] -= cost;
  e.buy[key] = (e.buy[key] || 0) + n;
  const rw = {};
  for (const k in item.rw) rw[k] = item.rw[k] * n;
  give(w, g, rw);
  return { ok: true, rw };
}

// ================================================================ battles of formations
// a commander's army in Sunset Canyon, the Expedition and Arms Training (no real troops are risked)
function formationArmy(g, id) {
  const lv = g.cmds[id].lv, n = 2500 + 450 * lv, spec = CMD[id].spec;
  if (spec === 'mix') return { inf: Math.round(n * 0.4), cav: Math.round(n * 0.3), arc: Math.round(n * 0.3), sie: 0 };
  const t = { inf: 0, cav: 0, arc: 0, sie: 0 };
  t[spec] = n;
  return t;
}
function formationOf(g) {
  const f = [];
  for (const id of g.cf || []) if (own(g.cmds, id) && !f.includes(id)) f.push(id);
  if (f.length) return f.slice(0, CANYON.size);
  return Object.keys(g.cmds).sort((a, b) => g.cmds[b].lv - g.cmds[a].lv || (a < b ? -1 : 1)).slice(0, CANYON.size);
}
// an army's bonuses do not change between its fights: worked out once, then given each fight's troops
function govLine(w, g, ids, ctx) {
  return ids.map(id => {
    let base = null;
    return { name: CMD[id].name, cmd: id, lv: g.cmds[id].lv, troops: formationArmy(g, id), mk: tr => { base = base || armySide(w, g, tr, id, null, ctx, `${g.name}: ${CMD[id].name}`); return { ...base, units: { inf: tr.inf || 0, cav: tr.cav || 0, arc: tr.arc || 0, sie: tr.sie || 0 } }; } };
  });
}
function neutralLine(list) {
  return list.map(x => ({ name: x.name, cmd: null, lv: x.level, troops: { ...x.troops }, mk: tr => neutralSide(x.name, tr, x.level) }));
}
// the first armies of each line fight; the winner carries its survivors into the next opponent
function lineBattle(seed, A, B, kind) {
  const fights = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length && fights.length < 40) {
    const input = { seed: hash32(seed, fights.length), a: A[i].mk(A[i].troops), d: B[j].mk(B[j].troops), terrain: T.plains, wall: null, kind };
    const res = fight(input);
    const won = res.winner === 'a';
    fights.push({ a: A[i].name, d: B[j].name, won, aStart: troopsTotal(res.a.start), aLeft: troopsTotal(res.a.end), dStart: troopsTotal(res.d.start), dLeft: troopsTotal(res.d.end) });
    if (won) { A[i].troops = { ...res.a.end }; j++; } else { B[j].troops = { ...res.d.end }; i++; }
  }
  return { won: j >= B.length, fights, left: A.slice(i).map(x => ({ name: x.name, troops: x.troops })), aIndex: i };
}

// ================================================================ Sunset Canyon
function canyonRanks(w) {
  if (!w.canyon || w.canyon.rank.length !== w.govs.length) {
    const order = w.govs.map(g => g.id).sort((a, b) => w.govs[b].power - w.govs[a].power || a - b);
    w.canyon = { rank: order, log: [] };
  }
  return w.canyon.rank;
}
// three opponents ranked above: the one just above, and the two weakest-looking lines among the twenty above
function lineStrength(g) { return formationOf(g).reduce((a, id) => a + 2500 + 450 * g.cmds[id].lv, 0); }
function canyonChoices(w, g) {
  const rank = canyonRanks(w), r = rank.indexOf(g.id);
  if (r === 0) return rank.slice(1, 4);
  const above = rank.slice(Math.max(0, r - 20), r - 1).map(id => ({ id, s: lineStrength(w.govs[id]) })).sort((a, b) => a.s - b.s || a.id - b.id);
  return [rank[r - 1], ...above.slice(0, 2).map(x => x.id)];
}
function actCanyon(w, g, target) {
  const e = dailyOf(w, g);
  if (e.cy >= CANYON.attempts) return { ok: false, err: 'No attempts left today. Five return each game day.' };
  if (!canyonChoices(w, g).includes(target)) return { ok: false, err: 'Choose one of the offered opponents.' };
  const A = formationOf(g);
  if (!A.length) return { ok: false, err: 'You need a commander.' };
  const d = w.govs[target];
  const rank = canyonRanks(w);
  const before = rank.indexOf(g.id), theirs = rank.indexOf(d.id);
  e.cy++;
  const res = lineBattle(hash32(w.seed, 'canyon', g.id, w.t, e.cy), govLine(w, g, A, { attack: true, field: true }), govLine(w, d, formationOf(d), { defend: true, field: true }), 'canyon');
  if (res.won && theirs < before) { rank[before] = d.id; rank[theirs] = g.id; }
  const after = rank.indexOf(g.id);
  activity(w, g, 'canyon');
  if (g.human || d.human) {
    w.canyon.log.push({ t: w.t, a: g.id, aName: g.name, d: d.id, dName: d.name, won: res.won, fights: res.fights, before: before + 1, after: after + 1 });
    if (w.canyon.log.length > 20) w.canyon.log.shift();
    if (d.human) note(w, 'event', `${g.name} challenged your Sunset Canyon defense and ${res.won ? 'won' : 'lost'}. Your rank: ${rank.indexOf(d.id) + 1}.`, 1);
  }
  return { ok: true, won: res.won, fights: res.fights, rank: after + 1, before: before + 1 };
}
function canyonReward(k) {
  if (k === 0) return { gems: 300, keyG: 1 };
  if (k < 10) return { gems: 200, keyS: 2 };
  if (k < 50) return { gems: 120, keyS: 1 };
  if (k < 200) return { gems: 60, tome1: 2 };
  return { gems: 20, tome1: 1 };
}
function canyonDaily(w) {
  const rank = canyonRanks(w);
  rank.forEach((id, k) => {
    const g = w.govs[id], rw = canyonReward(k);
    give(w, g, rw);
    if (g.human) note(w, 'event', `Sunset Canyon, rank ${k + 1}: ${rewardText(rw)}.`, 2);
  });
}

// ================================================================ the Expedition
function expStage(s) {
  const n = Math.min(5, 1 + Math.floor(s / 6));
  const per = Math.round(2400 * Math.pow(1.09, s));
  const mixes = [{ inf: 1 }, { arc: 1 }, { cav: 1 }, { inf: 0.5, arc: 0.5 }, { cav: 0.6, arc: 0.4 }];
  const armies = [];
  for (let k = 0; k < n; k++) {
    const mix = mixes[(s + k) % mixes.length], troops = { inf: 0, cav: 0, arc: 0, sie: 0 };
    for (const u in mix) troops[u] = Math.round(per * mix[u]);
    armies.push({ name: `${EXP_CHAPTERS[Math.floor(s / 5)]} warband ${k + 1}`, troops, level: s + 1 });
  }
  return { name: `${EXP_CHAPTERS[Math.floor(s / 5)]}, stage ${(s % 5) + 1}`, armies, first: (s + 1) % 5 === 0 ? { gems: 100, keyG: 1, tome2: 1 } : { tome1: 2, medals: 50 } };
}
function medalsNow(w, g) { return g.exp.med + Math.max(0, w.t - g.exp.at) / HOUR * EXPEDITION.medals * g.exp.st; }
function settleMedals(w, g) { g.exp.med = medalsNow(w, g); g.exp.at = w.t; }
function actExpedition(w, g) {
  const e = dailyOf(w, g);
  if (g.exp.st >= EXPEDITION.stages) return { ok: false, err: 'You have cleared every stage of the Expedition.' };
  if (e.ex >= EXPEDITION.attempts) return { ok: false, err: `You have fought ${EXPEDITION.attempts} stages today.` };
  const A = formationOf(g);
  if (!A.length) return { ok: false, err: 'You need a commander.' };
  e.ex++;
  const st = expStage(g.exp.st);
  const res = lineBattle(hash32(w.seed, 'exp', g.id, g.exp.st, w.t, e.ex), govLine(w, g, A, { attack: true, field: true }), neutralLine(st.armies), 'expedition');
  activity(w, g, 'expedition');
  if (res.won) {
    settleMedals(w, g);
    g.exp.st++;
    give(w, g, st.first);
    for (const id of A) giveXp(w, g, id, 150 + 60 * g.exp.st);
  }
  return { ok: true, won: res.won, fights: res.fights, stage: g.exp.st, rw: res.won ? st.first : null };
}

// ================================================================ guild helps and donations
const HELP_KINDS = ['build', 'research', 'heal'];
function helpable(w, g, q) { return q && q.end > w.t && (q.hp ? q.hp.length : 0) < HELP.max && !(q.hp && q.hp.includes(g.id)); }
function helpRequests(w, g) {
  const out = [];
  if (g.guild < 0) return out;
  for (const id of w.guilds[g.guild].members) {
    if (id === g.id) continue;
    const m = w.govs[id];
    for (const k of HELP_KINDS) if (helpable(w, g, m.q[k])) out.push({ gov: id, name: m.name, kind: k, helps: m.q[k].hp ? m.q[k].hp.length : 0 });
  }
  return out;
}
function actHelpAll(w, g) {
  if (g.guild < 0) return { ok: false, err: 'Join a guild to help its members.' };
  const e = dailyOf(w, g);
  let n = 0;
  for (const id of w.guilds[g.guild].members) {
    if (id === g.id) continue;
    const m = w.govs[id];
    for (const k of HELP_KINDS) {
      const q = m.q[k];
      if (!helpable(w, g, q)) continue;
      (q.hp || (q.hp = [])).push(g.id);
      q.end = Math.max(w.t, q.end - Math.max(1, Math.round((q.end - q.start) * 0.01)));
      n++;
    }
  }
  if (!n) return { ok: false, err: 'Nobody needs help right now.' };
  const paid = Math.max(0, Math.min(n, HELP.paid - e.helpN));
  e.helpN += n;
  g.inv.credits += paid * HELP.credits;
  activity(w, g, 'help', n);
  return { ok: true, n, credits: paid * HELP.credits };
}
function donateCost(g) { const k = 1 + g.b.hall * 0.25; return { food: Math.round(1500 * k), wood: Math.round(1500 * k), gold: Math.round(150 * k) }; }
function actDonate(w, g) {
  if (g.guild < 0) return { ok: false, err: 'Join a guild to donate to its technology.' };
  settle(w, g, w.t);
  const e = dailyOf(w, g);
  if (e.don >= DONATE.max) return { ok: false, err: `You have donated ${DONATE.max} times today.` };
  const cost = donateCost(g);
  if (!canAfford(g, cost)) return { ok: false, err: 'Not enough resources.' };
  pay(g, cost);
  const gd = w.guilds[g.guild];
  for (const r in cost) gd.treasury[r] = (gd.treasury[r] || 0) + cost[r];
  g.stats.contributed += costValue(cost);
  g.inv.credits += DONATE.credits;
  e.don++;
  activity(w, g, 'donate');
  return { ok: true, credits: DONATE.credits };
}

// ================================================================ Wheel of Fortune and Card King
function actSpin(w, g, n) {
  const ew = eventWindow(w, 'wheel');
  if (!ew.open) return { ok: false, err: 'The Wheel of Fortune is closed.' };
  n = n == null ? 1 : Number(n);
  if (n !== 1 && n !== 10) return { ok: false, err: 'Spin once or ten times.' };
  const e = dailyOf(w, g), s = winState(w, g, 'wheel'), f = featuredOf(w, 'wheel');
  const free = !e.spin && n === 1;
  const cost = free ? 0 : n === 10 ? WHEEL_COST * 9 : WHEEL_COST;
  if (g.inv.gems < cost) return { ok: false, err: `That costs ${cost} gems.` };
  if (free) e.spin = 1; else spendGems(w, g, cost);
  const total = {}, slots = [];
  for (let k = 0; k < n; k++) {
    const rng = makeRng(hash32(w.seed, 'wheel', g.id, s.key, s.n++));
    const p = pickWeighted(rng, WHEEL);
    slots.push(WHEEL.indexOf(p));
    addTo(total, withFeatured(p.rw, f));
  }
  give(w, g, total);
  claimMilestones(w, g, s, WHEEL_MILESTONES, s.n, f, 'Wheel of Fortune');
  return { ok: true, rw: total, slots, spins: s.n };
}
function cardBoard(w, g, s) {
  const rng = makeRng(hash32(w.seed, 'cards', g.id, s.key, s.board));
  const order = [0, 1, 2, 3, 4, 5];
  for (let i = 5; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
function bits(x) { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; }
function actFlip(w, g, pos) {
  const ew = eventWindow(w, 'cards');
  if (!ew.open) return { ok: false, err: 'Card King is closed.' };
  pos = Math.floor(Number(pos));
  if (!(pos >= 0 && pos < 6)) return { ok: false, err: 'Choose a card.' };
  const s = winState(w, g, 'cards'), f = featuredOf(w, 'cards');
  if (s.flip & (1 << pos)) return { ok: false, err: 'That card is already face up.' };
  const cost = CARD_COSTS[bits(s.flip)];
  if (g.inv.gems < cost) return { ok: false, err: `This flip costs ${cost} gems.` };
  spendGems(w, g, cost);
  const card = CARDS[cardBoard(w, g, s)[pos]];
  const rw = withFeatured(card, f);
  give(w, g, rw);
  s.flip |= 1 << pos;
  let done = false;
  if (s.flip === 63) { s.flip = 0; s.board++; done = true; claimMilestones(w, g, s, CARD_MILESTONES, s.board, f, 'Card King'); }
  return { ok: true, rw, card: cardBoard(w, g, done ? { ...s, board: s.board - 1 } : s)[pos], boardDone: done };
}

// ================================================================ Arms Training
function loharWave(k) {
  const n = Math.round(2500 * Math.pow(1.22, k - 1));
  const mixes = [{ inf: 0.5, arc: 0.5 }, { cav: 0.6, inf: 0.4 }, { arc: 0.6, cav: 0.4 }, { inf: 0.4, cav: 0.3, arc: 0.3 }];
  const mix = mixes[(k - 1) % mixes.length], troops = { inf: 0, cav: 0, arc: 0, sie: 0 };
  for (const u in mix) troops[u] = Math.round(n * mix[u]);
  return { name: `Armsmaster Lohar, wave ${k}`, troops, level: k };
}
function actArms(w, g) {
  const ew = eventWindow(w, 'arms');
  if (!ew.open) return { ok: false, err: 'Arms Training is closed.' };
  const e = dailyOf(w, g);
  if (e.arms >= ARMS.attempts) return { ok: false, err: `You have trained ${ARMS.attempts} times today.` };
  const ids = formationOf(g);
  if (!ids.length) return { ok: false, err: 'You need a commander.' };
  e.arms++;
  const s = winState(w, g, 'arms');
  const line = govLine(w, g, ids, { attack: true, field: true });
  let cleared = 0;
  const log = [];
  for (let k = 1; k <= ARMS.waves; k++) {
    const res = lineBattle(hash32(w.seed, 'arms', g.id, w.t, e.arms, k), line, neutralLine([loharWave(k)]), 'arms');
    log.push({ wave: k, won: res.won, left: res.left.reduce((a, x) => a + troopsTotal(x.troops), 0) });
    if (!res.won) break;
    cleared = k;
    // the survivors fight on; armies that fell stay down
    line.splice(0, res.aIndex);
  }
  s.best = Math.max(s.best, cleared);
  const got = claimMilestones(w, g, s, ARMS.milestones, s.best, null, 'Arms Training');
  return { ok: true, waves: cleared, best: s.best, log, got };
}

// ================================================================ Ceroli Crisis
// a raid of four: every member's strength comes from their commander and their governor's attack research
function raidStrength(w, g, id) {
  const r = g.cmds[id];
  const m = techMods(g);
  return (200 + r.lv * 30 + (r.sk[0] + r.sk[1] + r.sk[2] + r.sk[3]) * 40 + g.b.hall * 20) * (1 + (m.atk || 0));
}
function ceroliTeam(w, g, role, cmd) {
  const pool = g.guild >= 0 ? w.guilds[g.guild].members.filter(id => id !== g.id) : [];
  const near = pool.length >= 3 ? pool : w.govs.filter(x => x.id !== g.id && Math.abs(x.b.hall - g.b.hall) <= 3).map(x => x.id);
  const mates = near.slice().sort((a, b) => Math.abs(w.govs[a].power - g.power) - Math.abs(w.govs[b].power - g.power) || a - b).slice(0, 3);
  const team = [{ gov: g.id, role, cmd }];
  const need = [];
  if (role !== 'tank') need.push('tank');
  if (role !== 'healer') need.push('healer');
  while (need.length < 3) need.push('dps');
  mates.forEach((id, k) => { const m = w.govs[id]; team.push({ gov: id, role: need[k], cmd: formationOf(m)[0] }); });
  return team;
}
function ceroliRaid(w, team, diff, seed) {
  const rng = makeRng(seed);
  const bossMax = 60000 * Math.pow(1.7, diff - 1);
  let boss = bossMax;
  const m = team.map(x => {
    const s = raidStrength(w, w.govs[x.gov], x.cmd);
    const hp = s * 6 * (x.role === 'tank' ? 2.2 : 1);
    return { ...x, s, hp, max: hp, dmg: 0 };
  });
  let round = 0;
  for (round = 1; round <= CEROLI.rounds && boss > 0; round++) {
    for (const x of m) if (x.hp > 0) { const d = x.s * (x.role === 'dps' ? 2.2 : x.role === 'tank' ? 0.8 : 0.5) * (0.9 + rng() * 0.2); boss -= d; x.dmg += d; }
    if (boss <= 0) break;
    const hit = 600 * Math.pow(1.5, diff - 1) * (1 + round * 0.08);
    const tank = m.find(x => x.role === 'tank' && x.hp > 0);
    const alive = m.filter(x => x.hp > 0);
    if (!alive.length) break;
    const target = tank || alive[Math.floor(rng() * alive.length)];
    target.hp -= hit * (target === tank ? 0.5 : 1);
    for (const hl of m) if (hl.role === 'healer' && hl.hp > 0) { const low = m.filter(x => x.hp > 0).sort((a, b) => a.hp / a.max - b.hp / b.max)[0]; if (low) low.hp = Math.min(low.max, low.hp + hl.s * 1.6); }
    if (!m.some(x => x.hp > 0)) break;
  }
  const won = boss <= 0;
  return { won, rounds: Math.min(round, CEROLI.rounds), bossMax: Math.round(bossMax), bossLeft: Math.max(0, Math.round(boss)), members: m.map(x => ({ gov: x.gov, role: x.role, cmd: x.cmd, dmg: Math.round(x.dmg), alive: x.hp > 0 })) };
}
function ceroliTokens(diff, dmgShare, won) { return Math.round(30 * diff * dmgShare * 4 + (won ? 40 * diff : 0)); }
function actCeroli(w, g, o) {
  const ew = eventWindow(w, 'ceroli');
  if (!ew.open) return { ok: false, err: 'Ceroli Crisis is closed.' };
  const e = dailyOf(w, g), s = winState(w, g, 'ceroli');
  if (e.ce >= CEROLI.attempts) return { ok: false, err: `You have raided ${CEROLI.attempts} times today.` };
  const role = String(o.role);
  if (!own(CEROLI_ROLES, role)) return { ok: false, err: 'Choose Tank, Damage or Healer.' };
  if (!own(g.cmds, o.cmd)) return { ok: false, err: 'Choose one of your commanders.' };
  const diff = Math.floor(Number(o.diff) || 1);
  if (!(diff >= 1 && diff <= s.unlocked)) return { ok: false, err: `Difficulty ${s.unlocked} is the highest you have unlocked.` };
  e.ce++;
  const team = ceroliTeam(w, g, role, o.cmd);
  const res = ceroliRaid(w, team, diff, hash32(w.seed, 'ceroli', g.id, w.t, e.ce));
  const total = res.members.reduce((a, x) => a + x.dmg, 0) || 1;
  // every member of the raid is paid by the same rule
  for (const x of res.members) give(w, w.govs[x.gov], { tokens: ceroliTokens(diff, x.dmg / total, res.won) });
  const mine = ceroliTokens(diff, res.members[0].dmg / total, res.won);
  if (res.won && diff === s.unlocked && s.unlocked < CEROLI.levels) s.unlocked++;
  return { ok: true, ...res, tokens: mine, unlocked: s.unlocked, team: res.members.map(x => ({ ...x, name: w.govs[x.gov].name })) };
}

// ================================================================ the Shadow Legion Invasion
function legionArmy(g, k) {
  const target = troopPower(g.troops) * (0.25 + 0.12 * k);
  const unit = (UNITS.inf.atk + UNITS.inf.def + UNITS.inf.hp + UNITS.cav.atk + UNITS.cav.def + UNITS.cav.hp + UNITS.arc.atk + UNITS.arc.def + UNITS.arc.hp) / 30;
  const n = Math.max(30, Math.round(target / unit / 3));
  return { inf: n, cav: n, arc: n, sie: 0 };
}
function legionTick(w) {
  const ew = eventWindow(w, 'legion');
  if (!ew.open) {
    if (w.legion && !w.legion.paid && w.legion.wave >= LEGION.waves) legionRewards(w);
    return;
  }
  if (!w.legion || w.legion.key !== ew.key) {
    if (w.legion && !w.legion.paid) legionRewards(w);
    w.legion = { key: ew.key, wave: 0, pts: {}, broken: {}, paid: false };
    if (w.govs[PLAYER].guild >= 0) note(w, 'event', 'The Shadow Legion is marching on guild territory. Five waves strike every member\'s city inside it, ten minutes apart.', 3);
  }
  const L = w.legion;
  while (L.wave < LEGION.waves && w.t >= ew.start + L.wave * LEGION.gap) legionWave(w, ++L.wave);
  if (L.wave >= LEGION.waves && !L.paid) legionRewards(w);
}
function legionWave(w, k) {
  const L = w.legion;
  for (const g of w.govs) {
    if (g.guild < 0 || L.broken[g.id] || w.guilds[g.guild].collapsed) continue;
    const i = idx(g.x, g.y);
    if (w.map.terr[i] !== g.guild + 1) continue;
    if (troopsTotal(g.troops) < 50) { L.broken[g.id] = 1; continue; }
    const busy = busyCommanders(w, g);
    const cmd = g.defender && g.cmds[g.defender] && !busy.has(g.defender) ? g.defender : Object.keys(g.cmds).find(c => !busy.has(c)) || null;
    const input = { seed: hash32(w.seed, 'legion', L.key, k, g.id), a: neutralSide(`Shadow Legion, wave ${k}`, legionArmy(g, k), 4 + 3 * k), d: armySide(w, g, g.troops, cmd, null, { defend: true, city: true, territory: true, terrain: w.map.ter[i] }, g.name + tagOf(w, g)), terrain: w.map.ter[i], wall: null, kind: 'legion' };
    const res = fight(input);
    w.stats.battles++;
    // most of the city's fallen are only wounded
    const dw = woundedSplit(res.d.lost, 0.85);
    for (const u of UNIT_KEYS) g.troops[u] = res.d.end[u];
    admitWounded(w, g, dw.wd);
    g.stats.deaths += troopsTotal(dw.dead);
    g.stats.kills += troopsTotal(res.a.lost);
    const held = res.winner === 'd';
    if (held) L.pts[g.id] = (L.pts[g.id] || 0) + 100 * k;
    else L.broken[g.id] = 1;
    if (g.human) report(w, { kind: 'battle', title: `${held ? 'Held' : 'Broken'}: Shadow Legion wave ${k}`, view: 'd', won: held, input, res, extra: { dWounded: dw.wd }, explain: explainBattle(input, res, 'd'), x: g.x, y: g.y });
  }
}
function legionRewards(w) {
  const L = w.legion;
  L.paid = true;
  const gpts = w.guilds.map(gd => gd.members.reduce((a, id) => a + (L.pts[id] || 0), 0));
  const order = w.guilds.map(gd => gd.id).filter(gi => gpts[gi] > 0).sort((a, b) => gpts[b] - gpts[a] || a - b);
  L.guilds = order.map(gi => ({ guild: gi, pts: gpts[gi] }));
  for (const g of w.govs) {
    const p = L.pts[g.id] || 0;
    const total = {};
    for (const r of LEGION_REWARDS) if (p >= r.at) addTo(total, r.rw);
    if (g.guild >= 0 && gpts[g.guild] > 0) { const gr = order.indexOf(g.guild); addTo(total, { gems: gr === 0 ? 300 : gr < 3 ? 200 : 100 }); }
    if (Object.keys(total).length) give(w, g, total);
    if (g.human && (p > 0 || Object.keys(total).length)) note(w, 'event', `Shadow Legion over: you scored ${p} points${g.guild >= 0 ? `, your guild ${gpts[g.guild]}` : ''}. ${Object.keys(total).length ? 'Rewards: ' + rewardText(total) + '.' : ''}`, 3);
  }
  chronicle(w, 'legion', order.length ? `The Shadow Legion was driven off. ${w.guilds[order[0]].name} [${w.guilds[order[0]].tag}] held the most cities, with ${gpts[order[0]].toLocaleString('en-US')} points.` : 'The Shadow Legion swept through and found nobody inside guild territory to stop it.', { g: order.slice(0, 1), imp: 2 });
}

// ================================================================ barbarian forts (rally targets)
function spawnFort(w, rng) {
  const p = freeTileNear(w, CX, CY, N * 0.71, rng, { minR: 14, awayFromMarks: 4 });
  if (!p) return null;
  const z = zoneAt(w, p[0], p[1]);
  const lv = clamp(z === 1 ? rng.int(1, 2) : z === 2 ? rng.int(2, 4) : rng.int(4, 5), 1, 5);
  const base = 6000 * lv * Math.pow(1.6, lv - 1);
  const camp = { id: w.nid++, x: p[0], y: p[1], lv, fort: true, troops: { inf: Math.round(base * 0.4), cav: Math.round(base * 0.3), arc: Math.round(base * 0.3), sie: 0 } };
  camp.base = { ...camp.troops };
  w.camps.push(camp);
  camp.occ = OCC_CAMP + (camp.id % 9999);
  w.map.occ[idx(camp.x, camp.y)] = camp.occ;
  return camp;
}
function campDrop(lv) { return lv >= 4 ? { tome1: 2, speed5: 1 + Math.floor(lv / 3) } : { tome1: 1, speed5: 1 }; }
function fortReward(lv) { return { tome2: lv, speed60: 1 + lv, speed15: 2 }; }
function battleFort(w, m) {
  const g = w.govs[m.owner];
  const c = w.camps.find(x => x.id === m.target.id);
  const parts = m.parts || [{ gov: g.id, troops: { ...m.troops }, c1: m.c1, c2: m.c2 }];
  if (!c || idx(c.x, c.y) !== m.to) {
    if (g.human) note(w, 'camp', 'The fort was gone when the rally arrived.', 1);
    for (const p of splitParts(parts, m.troops, null)) partHome(w, m.to, p);
    removeMarch(w, m);
    return;
  }
  const terrain = w.map.ter[m.to];
  const input = { seed: battleSeed(w), a: attackerSide(w, m, { attack: true, field: true, rally: true, terrain }), d: neutralSide(`Barbarian fort (level ${c.lv})`, c.troops, 4 + c.lv * 2), terrain, wall: null, kind: 'fort' };
  const res = fight(input);
  w.stats.battles++;
  const aw = woundedSplit(res.a.lost, 0.75);
  const won = res.winner === 'a';
  c.lastHit = w.t;
  if (won) {
    w.camps.splice(w.camps.indexOf(c), 1);
    if (w.map.occ[m.to] === c.occ) w.map.occ[m.to] = 0;
    (w.fortRespawn || (w.fortRespawn = [])).push(w.t + 6 * HOUR);
  } else for (const u of UNIT_KEYS) c.troops[u] = res.d.end[u];
  const killed = troopsTotal(res.d.lost);
  for (const p of parts) {
    const pg = w.govs[p.gov];
    pg.stats.kills += Math.round(killed / parts.length);
    if (won) { pg.stats.wins++; give(w, pg, fortReward(c.lv)); if (pg.human) note(w, 'event', `The barbarian fort fell: ${rewardText(fortReward(c.lv))}.`, 2); }
    else pg.stats.losses++;
    if (p.c1) giveXp(w, pg, p.c1, killed * 0.4 / parts.length + (won ? 1500 * c.lv : 0));
  }
  recordBattle(w, m, g, null, input, res, { kind: 'rally on a fort', dName: `Barbarian fort (level ${c.lv})`, dGuild: -1, aw });
  for (const p of splitParts(parts, res.a.end, aw.wd)) partHome(w, m.to, p);
  removeMarch(w, m);
}
function regrowForts(w) {
  // a fort's warriors return six hours after the last attack
  for (const c of w.camps) if (c.fort && c.base && w.t - (c.lastHit || 0) > 6 * HOUR) c.troops = { ...c.base };
  if (!w.fortRespawn || !w.fortRespawn.length) return;
  const rng = makeRng(hash32(w.seed, 'fortspawn', w.t));
  w.fortRespawn = w.fortRespawn.filter(t => { if (t <= w.t) { spawnFort(w, rng); return false; } return true; });
}

// ================================================================ the clock
function eventsTick(w) {
  legionTick(w);
}
function eventsDaily(w) {
  canyonDaily(w);
}

// ================================================================ AI governors take part by the same rules
function aiEvents(w, g) {
  const e = dailyOf(w, g);
  // daily chests and free tavern chests
  const pts = dailyPoints(e);
  DAILY_CHESTS.forEach((c, k) => { if (pts >= c.at && !(e.got & (1 << k))) actClaimDaily(w, g, k); });
  if (chestFree(w, g, 'silver')) actOpenChest(w, g, 'silver', 1);
  if (chestFree(w, g, 'gold')) actOpenChest(w, g, 'gold', 1);
  if (g.inv.items.keyS) actOpenChest(w, g, 'silver', Math.min(50, g.inv.items.keyS));
  if (g.inv.items.keyG) actOpenChest(w, g, 'gold', Math.min(50, g.inv.items.keyG));
  if (g.inv.items.box) actUseItem(w, g, { id: 'box', n: g.inv.items.box });
  // sculptures: recruit, then raise the best commander's skills
  for (const id in g.inv.sc) if (own(CMD, id) && !g.cmds[id] && g.inv.sc[id] >= SC_RECRUIT) actRecruitSc(w, g, id);
  const top = formationOf(g)[0];
  if (top) {
    const uni = CMD[top].rarity === 'epic' ? 'uniE' : 'uniL';
    if (g.inv.sc[uni]) actConvertSc(w, g, top, g.inv.sc[uni]);
    for (let k = 0; k < 4; k++) actSkillSc(w, g, top, k);
    // tomes go to the best commander
    for (const t of ['tome3', 'tome2', 'tome1']) if (g.inv.items[t] && g.cmds[top].lv < CMD_MAX_LEVEL) actUseItem(w, g, { id: t, cmd: top, n: g.inv.items[t] });
  }
  // speedups on a long building upgrade
  if (g.q.build && g.q.build.end - w.t > 60) for (const s of ['speed480', 'speed180', 'speed60', 'speed15', 'speed5']) if (g.inv.items[s] && g.q.build && g.q.build.end - w.t >= ITEMS[s].min) actUseItem(w, g, { id: s, q: 'build', n: Math.min(g.inv.items[s], Math.floor((g.q.build.end - w.t) / ITEMS[s].min)) });
  for (const c of ['crateFood', 'crateWood', 'crateStone', 'crateIron', 'crateGold']) if (g.inv.items[c]) actUseItem(w, g, { id: c, n: g.inv.items[c] });
  // guild duties
  if (g.guild >= 0) {
    if (rnd(w) < 0.3 + g.t.loyal * 0.6) actHelpAll(w, g);
    if (e.don < 3 + Math.round(g.t.loyal * 12) && g.res.food > 40000 && g.res.wood > 40000 && g.res.gold > 4000) actDonate(w, g);
  }
  // Sunset Canyon: the opponent whose commanders look weakest
  if (e.cy < CANYON.attempts && rnd(w) < 0.1 + g.t.activity * 0.25) {
    const ch = canyonChoices(w, g);
    let best = null, bv = Infinity;
    for (const id of ch) { const v = lineStrength(w.govs[id]); if (v < bv) { bv = v; best = id; } }
    if (best != null) actCanyon(w, g, best);
  }
  if (e.ex < 2 && g.exp.st < EXPEDITION.stages && rnd(w) < 0.2 + g.t.activity * 0.4) actExpedition(w, g);
  // shops
  if (medalsNow(w, g) >= 300) { for (const it of ['scBoudica', 'tome2', 'speed60']) actBuy(w, g, 'expedition', it, 1); }
  if (g.inv.tokens >= 150) actBuy(w, g, 'ceroli', 'scUniE', 1);
  if (g.inv.credits >= 400) actBuy(w, g, 'guild', 'speed60', 1);
  // event windows
  if (!e.spin && eventWindow(w, 'wheel').open) actSpin(w, g, 1);
  if (!e.arms && eventWindow(w, 'arms').open && rnd(w) < 0.3 + g.t.activity * 0.4) actArms(w, g);
  if (!e.ce && eventWindow(w, 'ceroli').open && top && rnd(w) < 0.2 + g.t.activity * 0.4) { const s = winState(w, g, 'ceroli'); actCeroli(w, g, { role: 'dps', cmd: top, diff: s.unlocked }); }
}
// guild leaders and officers rally on barbarian forts when the guild has nothing else under way
function aiFortRally(w, gd) {
  if (w.rallies.some(r => r.guild === gd.id && r.state !== 'done')) return;
  const leads = [gd.leader, ...gd.officers].map(id => w.govs[id]).filter(g => g && !g.human && g.guild === gd.id);
  for (const g of leads) {
    if (apNow(w, g) < FORT_AP) continue;
    const reach = reachMaskOf(w, g);
    let best = null, bd = Infinity;
    for (const c of w.camps) {
      if (!c.fort) continue;
      const d = dist(g.x, g.y, c.x, c.y);
      if (d > 45 || !inReach(w, reach, idx(c.x, c.y))) continue;
      if (d + c.lv * 6 < bd) { bd = d + c.lv * 6; best = c; }
    }
    if (!best) continue;
    const army = pickArmy(w, g, 0.7, best.troops);
    if (!army) continue;
    let help = 0;
    for (const id of gd.members) { const mg = w.govs[id]; if (id !== g.id && dist(mg.x, mg.y, g.x, g.y) < 50) help += troopPower(mg.troops) * 0.25 * mg.t.loyal; }
    if (troopPower(army.troops) + help < troopPower(best.troops) * (1 + best.lv * 0.05) * lerp(1.6, 1.15, g.t.risk)) continue;
    const r = startRally(w, g, { to: idx(best.x, best.y), troops: army.troops, c1: army.c1, c2: army.c2, wait: 30 });
    if (r.ok) { decide(w, g, 'rally', `Called the guild to rally on a level ${best.lv} barbarian fort.`, 'guild'); return; }
  }
}

// ================================================================ views and commands
function eventsView(w) {
  const P = w.govs[PLAYER];
  const e = dailyOf(w, P);
  const pts = dailyPoints(e);
  const rank = canyonRanks(w);
  const r = rank.indexOf(P.id);
  const windows = {};
  for (const id in EVENT_CAL) {
    const ew = eventWindow(w, id);
    windows[id] = { ...ew, name: EVENT_CAL[id].name, text: EVENT_CAL[id].text };
  }
  const wheel = winState(w, P, 'wheel'), cards = winState(w, P, 'cards'), mtg = winState(w, P, 'mtg'), arms = winState(w, P, 'arms'), ceroli = winState(w, P, 'ceroli');
  const st = P.exp.st < EXPEDITION.stages ? expStage(P.exp.st) : null;
  const cmdLine = g => formationOf(g).map(id => ({ id, lv: g.cmds[id].lv }));
  return {
    t: w.t, day: day(w),
    ap: Math.floor(apNow(w, P)), apMax: AP_MAX, apEvery: AP_EVERY,
    inv: JSON.parse(JSON.stringify(P.inv)),
    daily: { pts, got: e.got, tasks: DAILY_TASKS.map(t => ({ k: t.k, name: t.name, pts: Math.min(t.max, Math.floor((e.cnt[t.k] || 0) / (t.per || 1)) * t.pts), max: t.max, each: t.pts, per: t.per || 1 })), chests: DAILY_CHESTS.map((c, k) => ({ at: c.at, rw: c.rw, got: !!(e.got & (1 << k)), ready: pts >= c.at })), resets: (e.d + 1) * DAY },
    tavern: { silver: { free: chestFree(w, P, 'silver'), keys: P.inv.items.keyS || 0 }, gold: { free: chestFree(w, P, 'gold'), keys: P.inv.items.keyG || 0, next: (P.evp.freeG + CHESTS.gold.every) * DAY } },
    canyon: { rank: r + 1, of: rank.length, left: CANYON.attempts - e.cy, formation: formationOf(P), custom: (P.cf || []).length > 0,
      choices: canyonChoices(w, P).map(id => { const d = w.govs[id]; return { id, name: d.name, rank: rank.indexOf(id) + 1, power: d.power, line: cmdLine(d) }; }),
      top: rank.slice(0, 10).map((id, k) => ({ id, rank: k + 1, name: w.govs[id].name, guild: w.govs[id].guild })), reward: canyonReward(r), log: (w.canyon.log || []).slice(-8).reverse() },
    expedition: { stage: P.exp.st, of: EXPEDITION.stages, left: EXPEDITION.attempts - e.ex, medals: Math.floor(medalsNow(w, P)), rate: EXPEDITION.medals * P.exp.st, next: st },
    guild: P.guild >= 0 ? { requests: helpRequests(w, P), donated: e.don, donateMax: DONATE.max, donateCost: donateCost(P), helpsPaid: Math.max(0, HELP.paid - e.helpN), mine: HELP_KINDS.filter(k => P.q[k]).map(k => ({ kind: k, helps: P.q[k].hp ? P.q[k].hp.length : 0, max: HELP.max })) } : null,
    shops: Object.keys(SHOPS).map(id => ({ id, name: SHOPS[id].name, cur: SHOPS[id].cur, items: SHOPS[id].items.map(it => ({ id: it.id, rw: it.rw, cost: it.cost, left: it.limit - (e.buy[id + ':' + it.id] || 0) })) })),
    windows,
    wheel: { featured: featuredOf(w, 'wheel'), spins: wheel.n, free: !e.spin, cost: WHEEL_COST, slots: WHEEL.map(s => withFeatured(s.rw, featuredOf(w, 'wheel'))), milestones: WHEEL_MILESTONES.map((m, k) => ({ at: m.at, rw: withFeatured(m.rw, featuredOf(w, 'wheel')), got: !!(wheel.got & (1 << k)) })) },
    cards: { featured: featuredOf(w, 'cards'), board: cards.board, flipped: [0, 1, 2, 3, 4, 5].map(k => (cards.flip & (1 << k)) ? withFeatured(CARDS[cardBoard(w, P, cards)[k]], featuredOf(w, 'cards')) : null), cost: CARD_COSTS[bits(cards.flip)] ?? 0, milestones: CARD_MILESTONES.map((m, k) => ({ at: m.at, rw: withFeatured(m.rw, featuredOf(w, 'cards')), got: !!(cards.got & (1 << k)) })) },
    mtg: { spent: mtg.spent, milestones: MTG.map((m, k) => ({ at: m.at, rw: m.rw, got: !!(mtg.got & (1 << k)) })) },
    arms: { left: ARMS.attempts - e.arms, best: arms.best, milestones: ARMS.milestones.map((m, k) => ({ at: m.at, rw: m.rw, got: !!(arms.got & (1 << k)) })), first: loharWave(1) },
    ceroli: { left: CEROLI.attempts - e.ce, unlocked: ceroli.unlocked, levels: CEROLI.levels, roles: CEROLI_ROLES, boss: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => Math.round(60000 * Math.pow(1.7, d - 1))) },
    legion: w.legion ? { wave: w.legion.wave, pts: w.legion.pts[PLAYER] || 0, broken: !!w.legion.broken[PLAYER], guilds: (w.legion.guilds || []).map(x => ({ ...x, name: w.guilds[x.guild].name })) } : null,
    inTerritory: P.guild >= 0 && w.map.terr[idx(P.x, P.y)] === P.guild + 1,
    recruit: SC_RECRUIT,
  };
}
// a small summary for every frame: action points, gems and how many rewards wait to be claimed
function eventsBadge(w, P) {
  const e = dailyOf(w, P);
  const pts = dailyPoints(e);
  let n = 0;
  DAILY_CHESTS.forEach((c, k) => { if (pts >= c.at && !(e.got & (1 << k))) n++; });
  if (chestFree(w, P, 'silver')) n++;
  if (chestFree(w, P, 'gold')) n++;
  if (eventWindow(w, 'wheel').open && !e.spin) n++;
  return { ap: Math.floor(apNow(w, P)), apMax: AP_MAX, gems: P.inv.gems, ready: n, pts, help: helpRequests(w, P).length, tele: P.inv.items.tele || 0 };
}
function eventCommand(w, P, a) {
  switch (a.type) {
    case 'ev:daily': return actClaimDaily(w, P, Math.floor(Number(a.k)));
    case 'ev:use': return actUseItem(w, P, { id: String(a.id), n: a.n, q: a.q, unit: a.unit, cmd: a.cmd });
    case 'ev:chest': return actOpenChest(w, P, String(a.kind), a.n);
    case 'ev:recruit': return actRecruitSc(w, P, String(a.cmd));
    case 'ev:skill': return actSkillSc(w, P, String(a.cmd), a.skill);
    case 'ev:convert': return actConvertSc(w, P, String(a.cmd), a.n);
    case 'ev:buy': return actBuy(w, P, String(a.shop), String(a.id), a.n);
    case 'ev:formation': {
      if (!Array.isArray(a.cmds) || a.cmds.length > CANYON.size) return { ok: false, err: `Choose up to ${CANYON.size} commanders.` };
      const f = [];
      for (const id of a.cmds) { if (!own(P.cmds, id)) return { ok: false, err: 'You do not have that commander.' }; if (!f.includes(id)) f.push(id); }
      P.cf = f;
      return { ok: true };
    }
    case 'ev:canyon': return actCanyon(w, P, Math.floor(Number(a.target)));
    case 'ev:expedition': return actExpedition(w, P);
    case 'ev:help': return actHelpAll(w, P);
    case 'ev:donate': return actDonate(w, P);
    case 'ev:spin': return actSpin(w, P, a.n);
    case 'ev:flip': return actFlip(w, P, a.pos);
    case 'ev:arms': return actArms(w, P);
    case 'ev:ceroli': return actCeroli(w, P, { role: a.role, cmd: a.cmd, diff: a.diff });
  }
  return { ok: false, err: 'Unknown command.' };
}
