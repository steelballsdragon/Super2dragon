/* Last Furnace progress module (owner: progress agent).
   Chapter quests (a banner on the City screen and the Chapter page in Events), daily missions with activity
   chests, the 7-day login calendar, mail, and the chief profile. Uses only the Game API and S.prog. Other
   modules are read through their public objects with optional chaining, and every count comes from catalog
   events, so this file also runs in a build without them. Public object: Game.prog. */

// ================================================================ helpers
const esc = s => Game.esc(s);
const fmt = n => Game.fmt(n);
const fmtFull = n => Game.fmtFull(n);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const int = v => Math.max(0, Math.floor(num(Number(v))));
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const P = () => Game.S?.prog || null;
const setText = (node, t) => { if (node) Game.setText(node, t); };
const RES_KEYS = ['meat', 'wood', 'coal', 'iron', 'gems'];
const SUB_KEY = 'last-furnace-v2:prog-sub';

function call(fn, fallback) {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch (e) { return fallback; }
}
function setHtml(node, html) {
  if (node && node._progHtml !== html) { node.innerHTML = html; node._progHtml = html; }
}
// Reward spec { gems: 50, wood: 800, speedup_5m: 2 } -> { gems, wood, items: { speedup_5m } }
function R(spec) {
  const out = {};
  for (const [k, v] of Object.entries(spec || {})) {
    if (RES_KEYS.includes(k)) out[k] = v;
    else (out.items ||= {})[k] = v;
  }
  return out;
}
// Reward tiles in display order: resources first (gems last), then items in the order they were written.
function rewardEntries(rw) {
  const out = [];
  if (!isObj(rw)) return out;
  for (const k of RES_KEYS) {
    if (!(num(rw[k]) > 0)) continue;
    const info = Game.resInfo?.[k] || { icon: k === 'gems' ? 'gem' : k, name: k };
    out.push({ icon: info.icon, name: info.name, count: fmt(rw[k]), rarity: k === 'gems' ? 'epic' : '' });
  }
  for (const [id, n] of Object.entries(rw.items || {})) {
    if (!(num(n) > 0)) continue;
    const d = Game.itemDefs[id] || { icon: 'crate', name: id, rarity: '' };
    out.push({ icon: d.icon, name: d.name, count: 'x' + fmt(n), rarity: d.rarity || '' });
  }
  return out;
}
// 'Lv 1/2' for level quests so they read as levels, plain '2/5' for counts.
const progLabel = (lv, cur, n) => `${lv ? 'Lv\u00a0' : ''}${fmtFull(cur)}/${fmtFull(n)}`;
function rewardChips(rw) { return Game.costHtml(rw, { check: false }); }
function secToReset() {
  const now = Game.now();
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((d.getTime() - now) / 1000));
}
function ago(ms) {
  const s = Math.max(0, (Game.now() - num(ms)) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ================================================================ reading the rest of the game
const BUILDINGS = {
  furnace: 'Furnace', shelter: 'Shelter', sawmill: 'Sawmill', coalmine: 'Coal Mine', ironmine: 'Iron Mine', hunter: "Hunter's Hut",
  infirmary: 'Infirmary', storehouse: 'Storehouse', infantry_camp: 'Infantry Camp', lancer_camp: 'Lancer Camp', marksman_camp: 'Marksman Camp',
};
const BUILDING_IDS = Object.keys(BUILDINGS);
const PRODUCERS = ['sawmill', 'hunter', 'coalmine', 'ironmine'];
const bName = id => String(call(() => Game.city?.name?.(id), BUILDINGS[id] || id));

// Building level from the city module; without it, the highest level seen in building:upgraded events.
function level(id) {
  if (typeof Game.city?.level === 'function') {
    const v = Number(call(() => Game.city.level(id), 0));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }
  return Math.max(id === 'furnace' ? 1 : 0, int(P()?.seen?.lv?.[id]));
}
function totalBuildingLevels() {
  const ids = Array.isArray(Game.city?.ids) ? Game.city.ids : BUILDING_IDS;
  return ids.reduce((t, id) => t + level(id), 0);
}
function stageLabel(n) {
  const f = Game.mil?.stageLabel;
  if (typeof f === 'function') { const s = call(() => f(n), ''); if (s) return String(s); }
  return `${Math.ceil(n / 10)}-${((n - 1) % 10) + 1}`;
}
function highestStage() {
  return Math.max(int(P()?.stats?.maxStage), int(call(() => Game.mil?.highestStage?.(), 0)));
}
function heroIds() {
  const ids = call(() => Game.mil?.heroIds?.(), null);
  return Array.isArray(ids) ? ids : null;
}
// Heroes owned: the military roster when present, otherwise heroes seen in hero events plus the starter.
function heroesOwned() {
  const ids = heroIds();
  if (ids) return ids.length;
  return (P()?.stats?.heroes?.length || 0) + 1;
}
function topHeroLevel() {
  let m = Math.max(1, int(P()?.stats?.maxHeroLv));
  for (const id of heroIds() || []) m = Math.max(m, int(call(() => Game.mil?.heroLevel?.(id), 0)));
  return m;
}
function squadSize() {
  const s = call(() => Game.mil?.squad?.(), null);
  return Array.isArray(s) ? s.length : Math.min(3, heroesOwned());
}
function working() {
  const s = call(() => Game.city?.survivors?.(), null);
  return s ? Math.max(0, num(s.total) - num(s.idle)) : 0;
}

// ================================================================ go actions
function runGo(go) {
  if (typeof go === 'function') { try { go(); } catch (e) { console.error('[prog] go failed', e); } return; }
  if (go) Game.navigate(go);
}
function goCollect() {
  Game.navigate('city');
  let best = null;
  let most = 0;
  for (const id of PRODUCERS) {
    const n = num(Number(call(() => Game.city?.stock?.(id), 0)));
    if (n > most) { most = n; best = id; }
  }
  if (best && most >= 1) {
    call(() => Game.city?.focus?.(best));
    Game.toast(`Tap the bubble over the ${bName(best)} to collect.`);
  } else {
    Game.toast('Resources are still piling up in your buildings. Check back in a moment.');
  }
}
function goSpeedup() {
  const list = Game.timers.list();
  const t = list.find(x => x.kind === 'build') || list.find(x => x.kind === 'train');
  if (!t) {
    Game.navigate('city');
    Game.toast('Start an upgrade or training first, then speed it up.');
    return;
  }
  Game.navigate(t.kind === 'train' ? 'heroes:troops' : 'city');
  Game.speedupSheet(t.id);
}
function goHero() {
  const id = heroIds()?.[0];
  Game.navigate(id ? 'heroes:hero:' + id : 'heroes');
}
function goUpgrade() {
  const c = chapter();
  const t = c?.tasks.find(x => x.hl && taskState(x) === 'open');
  Game.navigate('city:building:' + (t ? t.hl : 'furnace'));
}

// ================================================================ chapter quests (data)
function lvTask(b, n, rw) {
  return {
    id: `lv-${b}-${n}`,
    lv: n > 1,
    icon: b === 'furnace' ? 'flame' : 'hammer',
    text: () => (n === 1 ? `Build the ${bName(b)}` : `Upgrade the ${bName(b)} to Lv\u00a0${n}`),
    n,
    cur: () => level(b),
    go: 'city:building:' + b,
    hl: b,
    rewards: R(rw),
  };
}
// Counted from catalog events since the chapter (and so the task) became active.
function cntTask(id, key, n, text, icon, go, rw) {
  return { id, icon, text: typeof text === 'function' ? text : () => text, n, cur: () => chapterCount(key), go, rewards: R(rw) };
}
function statTask(id, fn, n, text, icon, go, rw) {
  return { id, icon, text: typeof text === 'function' ? text : () => text, n, cur: fn, go, rewards: R(rw) };
}
const stageTask = (n, rw) => statTask('stage-' + n, highestStage, n, () => `Clear stage ${stageLabel(n)}`, 'map', 'explore', rw);
const heroLvTask = (n, rw) => statTask('herolv-' + n, topHeroLevel, n, `Raise a hero to Lv\u00a0${n}`, 'xp', goHero, rw);
const heroesTask = (n, rw) => statTask('heroes-' + n, heroesOwned, n, `Own ${n} heroes`, 'hero', 'heroes:recruit', rw);

const CHAPTERS = [
  {
    title: 'First Fire',
    blurb: 'Stoke the Furnace and get the town working.',
    tasks: [
      lvTask('furnace', 2, { wood: 500, meat: 500 }),
      cntTask('collect-3', 'collect', 3, 'Collect from resource buildings 3 times', 'wood', goCollect, { coal: 200, speedup_1m: 2 }),
      lvTask('shelter', 2, { meat: 800, wood: 400 }),
      lvTask('sawmill', 2, { wood: 800, gems: 20 }),
      lvTask('infantry_camp', 1, { meat: 600, speedup_5m: 1 }),
      lvTask('furnace', 3, { gems: 50, speedup_5m: 2 }),
    ],
    chest: R({ gems: 100, ticket_recruit: 1, crate_wood: 2, crate_meat: 2 }),
  },
  {
    title: 'Call to Arms',
    blurb: 'Recruit a hero, train troops and fight your first battle.',
    tasks: [
      cntTask('recruit-1', 'recruit', 1, 'Recruit a hero', 'ticket', 'heroes:recruit', { xp_book: 3 }),
      cntTask('train-inf-30', 'trained_infantry', 30, 'Train 30 Infantry', 'troop_infantry', 'heroes:train:infantry', { meat: 1000, speedup_1m: 3 }),
      cntTask('win-1', 'win', 1, 'Win a battle in Explore', 'sword', 'explore', { wood: 800, xp_book: 2 }),
      cntTask('idle-1', 'idle', 1, 'Claim the idle chest in Explore', 'chest', 'explore:idle', { speedup_5m: 2 }),
      cntTask('speedup-1', 'speedup', 1, 'Use a speedup on any timer', 'speedup', goSpeedup, { gems: 30 }),
      lvTask('hunter', 3, { meat: 1200 }),
      lvTask('shelter', 3, { wood: 1500, coal: 300 }),
    ],
    chest: R({ gems: 150, ticket_recruit: 1, xp_book: 5, speedup_5m: 3 }),
  },
  {
    title: 'Warm Hands',
    blurb: 'Put every survivor to work and push down the Frozen Road.',
    tasks: [
      statTask('work-7', working, 7, 'Put 7 survivors to work', 'survivor', () => Game.navigate(Game.city ? 'city:survivors' : 'city'), { coal: 400, meat: 600 }),
      stageTask(3, { xp_book: 3, wood: 1000 }),
      heroLvTask(5, { speedup_5m: 2 }),
      lvTask('ironmine', 1, { iron: 300 }),
      lvTask('lancer_camp', 1, { meat: 1500 }),
      lvTask('furnace', 4, { gems: 50, speedup_1h: 1 }),
    ],
    chest: R({ gems: 200, ticket_recruit: 2, crate_coal: 2, crate_iron: 1 }),
  },
  {
    title: 'Steel and Smoke',
    blurb: 'Build a real squad and keep the mines running.',
    tasks: [
      heroesTask(3, { xp_book: 4 }),
      statTask('squad-3', squadSize, 3, 'Put 3 heroes in your squad', 'shield', 'heroes:squad', { speedup_5m: 3 }),
      lvTask('coalmine', 4, { coal: 800 }),
      cntTask('train-80', 'trained', 80, 'Train 80 troops', 'troop_lancer', 'heroes:troops', { meat: 2000 }),
      lvTask('infirmary', 1, { wood: 2000 }),
      lvTask('shelter', 4, { iron: 400 }),
      lvTask('furnace', 5, { gems: 80, speedup_1h: 1 }),
    ],
    chest: R({ gems: 250, ticket_recruit: 2, speedup_1h: 2, xp_book: 6 }),
  },
  {
    title: 'Into the White',
    blurb: 'Open the last camp and lead the squad deeper.',
    tasks: [
      lvTask('marksman_camp', 1, { wood: 2500 }),
      stageTask(6, { xp_book: 5 }),
      cntTask('collect-10', 'collect', 10, 'Collect from resource buildings 10 times', 'wood', goCollect, { coal: 1000 }),
      lvTask('infantry_camp', 5, { meat: 3000 }),
      heroLvTask(10, { speedup_1h: 1 }),
      lvTask('shelter', 5, { iron: 600 }),
      lvTask('furnace', 6, { gems: 100 }),
    ],
    chest: R({ gems: 300, ticket_recruit: 3, crate_iron: 3, speedup_1h: 2 }),
  },
  {
    title: 'The Long Night',
    blurb: 'Store up supplies before the deep cold sets in.',
    tasks: [
      lvTask('storehouse', 1, { wood: 4000 }),
      stageTask(10, { gems: 50 }),
      cntTask('idle-3', 'idle', 3, 'Claim the idle chest 3 times', 'chest', 'explore:idle', { xp_book: 6 }),
      lvTask('ironmine', 6, { iron: 1000 }),
      cntTask('speedup-5', 'speedup', 5, 'Use 5 speedups', 'speedup', goSpeedup, { speedup_1h: 2 }),
      lvTask('shelter', 6, { meat: 4000 }),
      lvTask('furnace', 7, { gems: 120 }),
    ],
    chest: R({ gems: 350, ticket_recruit: 3, speedup_8h: 1, xp_book: 8 }),
  },
  {
    title: 'Iron Will',
    blurb: 'Grow your heroes and hold the line.',
    tasks: [
      cntTask('star-1', 'star', 1, 'Star up a hero', 'star', 'heroes', { xp_book: 6 }),
      heroesTask(5, { ticket_recruit: 1 }),
      lvTask('lancer_camp', 7, { meat: 6000 }),
      cntTask('train-200', 'trained', 200, 'Train 200 troops', 'troop_marksman', 'heroes:troops', { iron: 1500 }),
      heroLvTask(15, { speedup_1h: 2 }),
      lvTask('shelter', 7, { wood: 6000 }),
      lvTask('furnace', 8, { gems: 150 }),
    ],
    chest: R({ gems: 400, ticket_recruit: 4, speedup_8h: 1, crate_coal: 4 }),
  },
  {
    title: 'Heart of the City',
    blurb: 'Make the Furnace the pride of the frozen north.',
    tasks: [
      lvTask('infirmary', 8, { wood: 8000 }),
      stageTask(15, { gems: 80 }),
      cntTask('collect-25', 'collect', 25, 'Collect from resource buildings 25 times', 'wood', goCollect, { coal: 3000 }),
      heroLvTask(20, { xp_book: 10 }),
      lvTask('shelter', 8, { meat: 8000 }),
      lvTask('furnace', 9, { gems: 200 }),
    ],
    chest: R({ gems: 600, ticket_recruit: 5, speedup_8h: 2, xp_book: 10 }),
  },
];

// ================================================================ daily missions, activity chests, login (data)
// No mission asks for gems or money. Points add up to 130, so 100 is reachable without every mission.
const DAILY = [
  { id: 'build', key: 'buildStart', n: 1, pts: 20, icon: 'hammer', text: 'Upgrade a building', go: goUpgrade },
  { id: 'collect', key: 'collect', n: 5, pts: 10, icon: 'wood', text: 'Collect resources 5 times', go: goCollect },
  { id: 'train', key: 'trainStart', n: 20, pts: 15, icon: 'troop_infantry', text: 'Train 20 troops', go: 'heroes:troops' },
  { id: 'recruit', key: 'recruit', n: 1, pts: 20, icon: 'ticket', text: 'Recruit 1 hero', go: 'heroes:recruit' },
  { id: 'battle', key: 'battle', n: 3, pts: 10, icon: 'sword', text: 'Fight 3 battles', go: 'explore', needsStage: true },
  { id: 'idle', key: 'idle', n: 1, pts: 10, icon: 'chest', text: 'Claim idle rewards', go: 'explore:idle' },
  { id: 'speedup', key: 'speedup', n: 1, pts: 10, icon: 'speedup', text: 'Use a speedup', go: goSpeedup },
  { id: 'stage', key: 'clear', n: 1, pts: 15, icon: 'map', text: 'Clear a new stage', go: 'explore', needsStage: true },
  { id: 'herolv', key: 'heroLv', n: 1, pts: 10, icon: 'xp', text: 'Level up a hero', go: goHero },
  { id: 'login', key: 'login', n: 1, pts: 10, icon: 'calendar', text: "Claim today's login reward", go: 'events:login' },
];
const MAX_POINTS = 100;
// once every Explore stage is cleared, the battle missions cannot be done, so they drop off the list
// (the other missions still add up to more than MAX_POINTS)
function stagesLeft() {
  const max = Game.mil?.MAX_STAGE;
  return !max || (Game.mil?.highestStage?.() ?? 0) < max;
}
function dailyList() {
  const claimed = P()?.daily?.claimed || {};
  return DAILY.filter(m => !m.needsStage || stagesLeft() || claimed[m.id]);
}
const CHESTS = [
  { at: 20, rarity: 'common', rw: R({ gems: 10, speedup_1m: 3, crate_wood: 1 }) },
  { at: 40, rarity: 'rare', rw: R({ gems: 20, xp_book: 2, crate_meat: 1 }) },
  { at: 60, rarity: 'rare', rw: R({ gems: 30, speedup_5m: 2, crate_coal: 1 }) },
  { at: 80, rarity: 'epic', rw: R({ gems: 40, xp_book: 3, crate_iron: 1 }) },
  { at: 100, rarity: 'legendary', rw: R({ gems: 50, ticket_recruit: 1, speedup_1h: 1 }) },
];
const LOGIN_DAYS = 7;
const LOGIN = [
  null,
  R({ gems: 100, speedup_5m: 2 }),
  null, // day 2: shards of an Epic hero, picked at claim time (see day2Rewards)
  R({ crate_meat: 2, crate_wood: 2, speedup_1h: 1 }),
  R({ gems: 150, xp_book: 5 }),
  R({ ticket_recruit: 2, speedup_5m: 5 }),
  R({ crate_coal: 2, crate_iron: 2, speedup_1h: 2 }),
  R({ gems: 500, ticket_recruit: 5, speedup_8h: 1 }),
];
const DAY2_SHARDS = 10;
function day2ShardId() {
  const defs = Object.values(Game.itemDefs).filter(d => /^shard_/.test(d.id));
  if (!defs.length) return null;
  const rank = { legendary: 3, epic: 2, rare: 1 };
  let pool = defs.filter(d => d.rarity === 'epic');
  if (!pool.length) {
    const best = Math.max(...defs.map(d => rank[d.rarity] || 0));
    pool = defs.filter(d => (rank[d.rarity] || 0) === best);
  }
  const unowned = pool.filter(d => !call(() => Game.mil?.owns?.(d.id.slice(6)), false));
  const list = (unowned.length ? unowned : pool).slice().sort((a, b) => num(a.sort) - num(b.sort) || a.id.localeCompare(b.id));
  return list[0].id;
}
function day2Rewards() {
  const sid = day2ShardId();
  return sid ? R({ [sid]: DAY2_SHARDS, xp_book: 3 }) : R({ ticket_recruit: 2, xp_book: 3 });
}
function loginRewards(day) { return day === 2 ? day2Rewards() : LOGIN[day] || {}; }

// ================================================================ mail (data)
function welcomeMail(at) {
  return {
    id: 'welcome',
    from: 'Council of Survivors',
    title: 'Welcome, Chief',
    body: [
      'The Furnace is lit and the first survivors are warming their hands. Keep it burning, grow the town and lead your heroes into the white.',
      'These supplies will get you started. Use the Recruit Tickets on the Heroes tab, under Recruit.',
    ],
    rewards: { gems: 500, items: { ticket_recruit: 5 } },
    at,
    read: false,
    claimed: false,
  };
}
function testModeMail(at) {
  return {
    id: 'test-mode',
    from: 'Supply Office',
    title: 'The Shop is in test mode',
    body: [
      'This version of Last Furnace cannot take payments. Every price in the Shop runs in test mode: tapping one opens a confirmation, and the items are granted when you confirm.',
      'No money is charged and no payment details are ever asked for. Gem packs, the starter pack and the monthly card can all be tried freely.',
    ],
    go: { label: 'Open Shop', target: 'shop' },
    rewards: null,
    at,
    read: false,
    claimed: false,
  };
}
const SUPPLY = {
  5: R({ gems: 200, speedup_1h: 2, ticket_recruit: 1 }),
  10: R({ gems: 300, speedup_8h: 1, ticket_recruit: 2 }),
  15: R({ gems: 400, speedup_8h: 1, ticket_recruit: 3 }),
  20: R({ gems: 500, speedup_8h: 2, ticket_recruit: 3 }),
  25: R({ gems: 600, speedup_8h: 2, ticket_recruit: 4 }),
  30: R({ gems: 1000, speedup_8h: 3, ticket_recruit: 5 }),
};

// ================================================================ state
function newState() {
  const now = Game.now();
  return {
    v: 1,
    cnt: {},
    seen: { lv: {} },
    stats: { maxStage: 0, maxHeroLv: 1, gemsEarned: 0, days: 0, heroes: [] },
    ch: { idx: 0, base: {}, done: {}, claimed: {}, startAt: now },
    daily: { day: null, cnt: {}, claimed: {}, chests: {} },
    login: { round: 1, claimed: 0, last: null },
    mail: [welcomeMail(now), testModeMail(now - 1000)],
    mailSeq: 0,
    flags: { supply: {} },
  };
}
function numMap(o) {
  const out = {};
  if (isObj(o)) for (const [k, v] of Object.entries(o)) if (Number.isFinite(v) && v > 0) out[k] = v;
  return out;
}
function boolMap(o) {
  const out = {};
  if (isObj(o)) for (const [k, v] of Object.entries(o)) if (v) out[k] = true;
  return out;
}
function migrate(s) {
  const d = newState();
  if (!isObj(s)) return d;
  s.v = 1;
  s.cnt = numMap(s.cnt);
  if (!isObj(s.seen)) s.seen = { lv: {} };
  s.seen.lv = numMap(s.seen.lv);
  if (!isObj(s.stats)) s.stats = d.stats;
  s.stats.maxStage = int(s.stats.maxStage);
  s.stats.maxHeroLv = Math.max(1, int(s.stats.maxHeroLv));
  s.stats.gemsEarned = int(s.stats.gemsEarned);
  s.stats.days = int(s.stats.days);
  s.stats.heroes = Array.isArray(s.stats.heroes) ? [...new Set(s.stats.heroes.filter(x => typeof x === 'string'))] : [];
  if (!isObj(s.ch)) s.ch = d.ch;
  s.ch.idx = Math.min(CHAPTERS.length, int(s.ch.idx));
  s.ch.base = numMap(s.ch.base);
  s.ch.done = boolMap(s.ch.done);
  s.ch.claimed = boolMap(s.ch.claimed);
  if (!Number.isFinite(s.ch.startAt)) s.ch.startAt = Game.now();
  if (!isObj(s.daily)) s.daily = d.daily;
  s.daily.day = typeof s.daily.day === 'string' ? s.daily.day : null;
  s.daily.cnt = numMap(s.daily.cnt);
  s.daily.claimed = boolMap(s.daily.claimed);
  s.daily.chests = boolMap(s.daily.chests);
  if (!isObj(s.login)) s.login = d.login;
  s.login.round = Math.max(1, int(s.login.round));
  s.login.claimed = Math.min(LOGIN_DAYS, int(s.login.claimed));
  s.login.last = typeof s.login.last === 'string' ? s.login.last : null;
  s.mail = Array.isArray(s.mail)
    ? s.mail.filter(m => isObj(m) && m.id != null).map(m => ({
      id: String(m.id),
      from: String(m.from ?? ''),
      title: String(m.title ?? ''),
      body: Array.isArray(m.body) ? m.body.map(String) : [String(m.body ?? '')],
      rewards: isObj(m.rewards) ? m.rewards : null,
      go: isObj(m.go) && m.go.target ? { label: String(m.go.label || 'Go'), target: String(m.go.target) } : null,
      at: Number.isFinite(m.at) ? m.at : Game.now(),
      read: !!m.read,
      claimed: !!m.claimed,
    }))
    : d.mail;
  s.mailSeq = int(s.mailSeq);
  if (!isObj(s.flags)) s.flags = { supply: {} };
  s.flags.supply = boolMap(s.flags.supply);
  return s;
}

Game.registerModule({
  id: 'prog',
  initState: newState,
  migrate,
  tick() {
    if (!P()) return;
    evalChapter();
    refreshBadges();
    updateBanner();
  },
});

// ================================================================ counting catalog events
function bump(key, n = 1) {
  const p = P();
  const v = num(Number(n));
  if (!p || !(v > 0)) return;
  p.cnt[key] = num(p.cnt[key]) + v;
  p.daily.cnt[key] = num(p.daily.cnt[key]) + v;
}
function addHeroes(ids) {
  const p = P();
  if (!p || !Array.isArray(ids)) return;
  for (const id of ids) if (typeof id === 'string' && id && !p.stats.heroes.includes(id)) p.stats.heroes.push(id);
}
Game.on('building:started', () => bump('buildStart'));
Game.on('building:upgraded', e => {
  bump('upgraded');
  const p = P();
  const L = int(e?.level);
  if (p && e?.id) p.seen.lv[e.id] = Math.max(int(p.seen.lv[e.id]), L);
  if (e?.id === 'furnace') checkSupplyMail(L);
});
Game.on('resources:collected', e => { bump('collect'); bump('collectAmt', int(e?.amount)); });
Game.on('survivor:arrived', () => bump('survivors'));
Game.on('troops:started', e => {
  const n = Math.max(1, int(e?.count));
  bump('trainStart', n);
  if (e?.type) bump('trainStart_' + e.type, n);
});
Game.on('troops:trained', e => {
  const n = Math.max(1, int(e?.count));
  bump('trained', n);
  if (e?.type) bump('trained_' + e.type, n);
});
Game.on('hero:recruited', e => {
  bump('recruit', Math.max(1, int(e?.count)));
  addHeroes(e?.newHeroIds);
});
Game.on('hero:obtained', e => addHeroes([e?.heroId]));
Game.on('hero:leveled', e => {
  bump('heroLv');
  const p = P();
  if (p) p.stats.maxHeroLv = Math.max(p.stats.maxHeroLv, int(e?.level));
});
Game.on('hero:starred', () => bump('star'));
Game.on('battle:fought', e => { bump('battle'); if (e?.win) bump('win'); });
Game.on('stage:cleared', e => {
  bump('clear');
  const p = P();
  if (p) p.stats.maxStage = Math.max(p.stats.maxStage, int(e?.stage));
});
Game.on('idle:claimed', () => bump('idle'));
Game.on('speedup:used', () => bump('speedup'));
Game.on('item:used', e => {
  bump('item');
  if (/^crate_/.test(String(e?.id || ''))) bump('crate', Math.max(1, int(e?.count)));
});
Game.on('granted', e => {
  const p = P();
  const g = num(Number(e?.rewards?.gems));
  if (p && g > 0 && e?.source !== 'debug') p.stats.gemsEarned += g;
});
Game.on('day:reset', e => {
  const p = P();
  if (!p) return;
  p.daily = { day: e?.day || Game.today(), cnt: {}, claimed: {}, chests: {} };
  p.stats.days += 1;
  loginState();
  ui.sig.daily = '';
  ui.sig.login = '';
});

// ================================================================ chapter logic
function chapter() {
  const p = P();
  return p && p.ch.idx < CHAPTERS.length ? CHAPTERS[p.ch.idx] : null;
}
function chapterCount(key) {
  const p = P();
  return p ? Math.max(0, num(p.cnt[key]) - num(p.ch.base[key])) : 0;
}
const taskText = t => String(call(t.text, ''));
function taskCur(t) { return Math.max(0, num(Number(call(t.cur, 0)))); }
function taskState(t) {
  const ch = P()?.ch;
  if (!ch) return 'open';
  if (ch.claimed[t.id]) return 'claimed';
  if (ch.done[t.id]) return 'ready';
  return 'open';
}
// Progress for display: a finished task always reads n/n, even if the live value moved (workers, for example).
function taskShown(t) {
  const st = taskState(t);
  return st === 'open' ? Math.min(t.n, taskCur(t)) : t.n;
}
function evalChapter() {
  const c = chapter();
  if (!c) return;
  const ch = P().ch;
  let newly = null;
  for (const t of c.tasks) {
    if (ch.done[t.id] || ch.claimed[t.id]) continue;
    if (taskCur(t) >= t.n) {
      ch.done[t.id] = true;
      newly ||= t;
    }
  }
  if (newly && Game.isReady && Game.screen?.() !== 'city' && Game.screen?.() !== 'events') Game.toast(`Quest complete: ${taskText(newly)}`, 'good');
}
function chapterComplete() {
  const c = chapter();
  return !!c && c.tasks.every(t => P().ch.claimed[t.id]);
}
function chapterClaimedCount() {
  const c = chapter();
  return c ? c.tasks.filter(t => P().ch.claimed[t.id]).length : 0;
}
function claimTask(id) {
  const c = chapter();
  const t = c?.tasks.find(x => x.id === id);
  if (!t || taskState(t) !== 'ready') return false;
  const p = P();
  p.ch.claimed[t.id] = true;
  delete p.ch.done[t.id];
  Game.grant(t.rewards, { source: 'quest', popup: true, title: 'Quest reward' });
  Game.emit('mission:claimed', { id: `chapter${p.ch.idx + 1}:${t.id}` });
  afterClaim();
  return true;
}
function claimChapterChest() {
  if (!chapterComplete()) return false;
  const p = P();
  const i = p.ch.idx;
  const c = CHAPTERS[i];
  p.ch = { idx: i + 1, base: { ...p.cnt }, done: {}, claimed: {}, startAt: Game.now() };
  Game.grant(c.chest, { source: 'chapter', popup: true, title: `Chapter ${i + 1} complete` });
  Game.emit('mission:claimed', { id: `chapter${i + 1}:chest` });
  evalChapter();
  if (CHAPTERS[i + 1]) Game.toast(`Chapter ${i + 2}: ${CHAPTERS[i + 1].title}`, 'info');
  afterClaim();
  return true;
}
function sortedTasks(c) {
  const rank = { ready: 0, open: 1, claimed: 2 };
  return c.tasks.map((t, i) => ({ t, i })).sort((a, b) => rank[taskState(a.t)] - rank[taskState(b.t)] || a.i - b.i).map(x => x.t);
}
function chestPreview(i) {
  const c = CHAPTERS[i];
  if (!c) return;
  Game.sheet({
    title: `Chapter ${i + 1} chest`,
    body: `<div class="prog-preview"><p class="prog-preview-p">Claim every task in ${esc(c.title)} to open this chest.</p><div class="prog-rw-grid">${Game.rewardsHtml(c.chest)}</div></div>`,
    actions: [{ label: 'OK', kind: 'ghost', onClick: () => {} }],
  });
}

// ================================================================ daily logic
function dailyCount(key) { return num(P()?.daily?.cnt?.[key]); }
function missionState(m) {
  const d = P()?.daily;
  if (!d) return 'open';
  if (d.claimed[m.id]) return 'claimed';
  return dailyCount(m.key) >= m.n ? 'ready' : 'open';
}
function activity() {
  const d = P()?.daily;
  return d ? Math.min(MAX_POINTS, DAILY.reduce((t, m) => t + (d.claimed[m.id] ? m.pts : 0), 0)) : 0;
}
function chestState(c) {
  const d = P()?.daily;
  if (d?.chests[c.at]) return 'open';
  return activity() >= c.at ? 'ready' : 'locked';
}
function claimMission(id, quiet) {
  const m = DAILY.find(x => x.id === id);
  if (!m || missionState(m) !== 'ready') return 0;
  P().daily.claimed[m.id] = true;
  Game.emit('mission:claimed', { id: 'daily:' + m.id });
  if (!quiet) Game.toast(`+${m.pts} activity`, 'good');
  afterClaim();
  return m.pts;
}
function claimAllMissions() {
  let pts = 0;
  for (const m of DAILY) pts += claimMission(m.id, true);
  if (pts) Game.toast(`+${pts} activity`, 'good');
  return pts;
}
function claimDailyChest(at) {
  const c = CHESTS.find(x => x.at === Number(at));
  if (!c || chestState(c) !== 'ready') return false;
  P().daily.chests[c.at] = true;
  Game.grant(c.rw, { source: 'daily', popup: true, title: `Activity chest ${c.at}` });
  afterClaim();
  return true;
}
function dailyChestPreview(c) {
  const st = chestState(c);
  const msg = st === 'open' ? 'Already opened today. A fresh set of chests comes with the daily reset.' : `Reach ${c.at} activity to open this chest.`;
  Game.sheet({
    title: `Activity chest ${c.at}`,
    body: `<div class="prog-preview"><p class="prog-preview-p">${esc(msg)}</p><div class="prog-rw-grid">${Game.rewardsHtml(c.rw)}</div></div>`,
    actions: [{ label: 'OK', kind: 'ghost', onClick: () => {} }],
  });
}

// ================================================================ login logic
// One claim per calendar day. After day 7 a new round starts on the next day.
function loginState() {
  const L = P().login;
  if (L.claimed >= LOGIN_DAYS && L.last !== Game.today()) {
    L.claimed = 0;
    L.round += 1;
  }
  return L;
}
function loginReady() {
  if (!P()) return false;
  const L = loginState();
  return L.claimed < LOGIN_DAYS && L.last !== Game.today();
}
function claimLogin() {
  if (!loginReady()) return false;
  const L = P().login;
  const day = L.claimed + 1;
  const rw = loginRewards(day);
  L.claimed = day;
  L.last = Game.today();
  Game.grant(rw, { source: 'login', popup: true, title: `Day ${day} reward` });
  bump('login');
  Game.emit('login:claimed', { day, round: L.round });
  afterClaim();
  return true;
}
function loginPreview(day) {
  const L = loginState();
  let msg;
  if (day <= L.claimed) msg = 'Claimed.';
  else if (day === L.claimed + 1 && loginReady()) msg = 'Ready to claim today.';
  else if (day === L.claimed + 1) msg = 'Ready tomorrow.';
  else msg = `Unlocks after day ${day - 1}. Sign in once a day to move along.`;
  Game.sheet({
    title: `Day ${day}`,
    body: `<div class="prog-preview"><p class="prog-preview-p">${esc(msg)}</p><div class="prog-rw-grid">${Game.rewardsHtml(loginRewards(day))}</div></div>`,
    actions: day === L.claimed + 1 && loginReady()
      ? [{ label: 'Claim', kind: 'gold', onClick: () => { claimLogin(); } }]
      : [{ label: 'OK', kind: 'ghost', onClick: () => {} }],
  });
}

// ================================================================ mail logic
function mails() {
  const p = P();
  return p ? p.mail.slice().sort((a, b) => b.at - a.at) : [];
}
const mailHasGift = m => !!m.rewards && !m.claimed;
function mailBadge() {
  const p = P();
  return p ? p.mail.filter(m => !m.read || mailHasGift(m)).length : 0;
}
function addMail(def) {
  const p = P();
  if (!p || !isObj(def)) return null;
  p.mailSeq += 1;
  const m = {
    id: String(def.id || 'mail-' + p.mailSeq),
    from: String(def.from || 'Council of Survivors'),
    title: String(def.title || 'Mail'),
    body: Array.isArray(def.body) ? def.body.map(String) : [String(def.body || '')],
    rewards: isObj(def.rewards) ? def.rewards : null,
    go: isObj(def.go) && def.go.target ? { label: String(def.go.label || 'Go'), target: String(def.go.target) } : null,
    at: Game.now(),
    read: false,
    claimed: false,
  };
  p.mail = p.mail.filter(x => x.id !== m.id);
  p.mail.push(m);
  if (Game.isReady) Game.toast(`New mail: ${m.title}`, 'info');
  return m;
}
function checkSupplyMail(L) {
  const p = P();
  if (!p) return;
  for (const k of Object.keys(SUPPLY).map(Number).sort((a, b) => a - b)) {
    if (L < k || p.flags.supply[k]) continue;
    p.flags.supply[k] = true;
    addMail({
      id: 'supply-' + k,
      from: 'Council of Survivors',
      title: `Supply drop: Furnace Lv ${k}`,
      body: [`Word of your Lv ${k} Furnace has spread across the snow. Traders left these supplies at the gate.`],
      rewards: SUPPLY[k],
    });
  }
}
function claimMail(id) {
  const m = P()?.mail.find(x => x.id === id);
  if (!m || !mailHasGift(m)) return false;
  m.claimed = true;
  m.read = true;
  Game.grant(m.rewards, { source: 'mail', popup: true, title: 'Mail' });
  afterClaim();
  return true;
}
function claimAllMail() {
  const p = P();
  if (!p) return false;
  const list = p.mail.filter(mailHasGift);
  if (!list.length) return false;
  const total = { items: {} };
  for (const m of list) {
    m.claimed = true;
    m.read = true;
    for (const k of RES_KEYS) if (num(m.rewards[k]) > 0) total[k] = num(total[k]) + m.rewards[k];
    for (const [id, n] of Object.entries(m.rewards.items || {})) total.items[id] = num(total.items[id]) + n;
  }
  for (const m of p.mail) m.read = true;
  Game.grant(total, { source: 'mail', popup: true, title: 'Mail' });
  afterClaim();
  return true;
}

// ================================================================ badges
function claimables() {
  const p = P();
  if (!p) return { chapter: 0, daily: 0, login: 0, total: 0 };
  let chN = 0;
  const c = chapter();
  if (c) {
    for (const t of c.tasks) if (taskState(t) === 'ready') chN++;
    if (chapterComplete()) chN++;
  }
  let dN = 0;
  for (const m of dailyList()) if (missionState(m) === 'ready') dN++;
  for (const x of CHESTS) if (chestState(x) === 'ready') dN++;
  const lN = loginReady() ? 1 : 0;
  return { chapter: chN, daily: dN, login: lN, total: chN + dN + lN };
}
function refreshBadges() {
  Game.badge('events', claimables().total);
}
function afterClaim() {
  refreshBadges();
  updateBanner();
  try { Game.render(); } catch (e) { /* render is best effort */ }
}

// ================================================================ City banner
const ui = { sub: 'chapter', root: null, views: {}, sig: {}, banner: null, model: null, bannerSig: '', hl: undefined, prof: null };
try {
  const saved = Game.storage.get(SUB_KEY);
  if (['chapter', 'daily', 'login'].includes(saved)) ui.sub = saved;
} catch (e) { /* per-viewer preference only */ }

function bannerModel() {
  const p = P();
  if (!p) return null;
  const c = chapter();
  if (c) {
    const kicker = `Chapter ${p.ch.idx + 1} · ${c.title}`;
    const ready = c.tasks.find(t => taskState(t) === 'ready');
    if (ready) return { kind: 'task', id: ready.id, lv: !!ready.lv, kicker, text: taskText(ready), cur: ready.n, n: ready.n, claim: true, icon: ready.icon, go: ready.go };
    const open = c.tasks.find(t => taskState(t) === 'open');
    if (open) {
      const busy = open.hl && call(() => Game.city?.isUpgrading?.(open.hl), false);
      return { kind: 'task', id: open.id, lv: !!open.lv, kicker, text: taskText(open), cur: taskShown(open), n: open.n, claim: false, icon: open.icon, go: open.go, hl: busy ? null : open.hl || null };
    }
    return { kind: 'chest', id: 'chest', kicker, text: 'Chapter complete. Open the chest', cur: 1, n: 1, claim: true, icon: 'chest' };
  }
  const kicker = `Daily missions · ${activity()}/${MAX_POINTS}`;
  const readyM = dailyList().find(m => missionState(m) === 'ready');
  if (readyM) return { kind: 'mission', id: readyM.id, kicker, text: readyM.text, cur: readyM.n, n: readyM.n, claim: true, icon: readyM.icon };
  const chest = CHESTS.find(x => chestState(x) === 'ready');
  if (chest) return { kind: 'dchest', id: String(chest.at), kicker, text: `Activity chest ${chest.at} is ready`, cur: 1, n: 1, claim: true, icon: 'chest' };
  const openM = dailyList().find(m => missionState(m) === 'open');
  if (openM) return { kind: 'mission', id: openM.id, kicker, text: openM.text, cur: Math.min(openM.n, dailyCount(openM.key)), n: openM.n, claim: false, icon: openM.icon, go: openM.go };
  return { kind: 'daydone', id: 'done', kicker, text: 'All daily missions done. New ones after the reset', cur: 1, n: 1, claim: false, icon: 'check', view: true };
}

function buildBanner() {
  const el = Game.el(`<div class="prog-banner" id="prog-banner">
    <button type="button" class="prog-banner-main" id="prog-banner-open">
      <span class="prog-banner-ico" data-f="ico"></span>
      <span class="prog-banner-txt">
        <span class="prog-banner-kicker" data-f="kicker"></span>
        <span class="prog-banner-task" data-f="text"></span>
      </span>
      <span class="prog-banner-num" data-f="num"></span>
    </button>
    <button type="button" class="btn blue small prog-banner-act" id="prog-banner-act">Go</button>
    <span class="prog-banner-bar" aria-hidden="true"><i></i></span>
  </div>`);
  el.querySelector('#prog-banner-open').addEventListener('click', () => {
    const m = ui.model;
    Game.navigate(m && (m.kind === 'mission' || m.kind === 'dchest' || m.kind === 'daydone') ? 'events:daily' : 'events:chapter');
  });
  el.querySelector('#prog-banner-act').addEventListener('click', () => {
    const m = ui.model;
    if (!m) return;
    if (m.kind === 'task') { if (m.claim) claimTask(m.id); else runGo(m.go); }
    else if (m.kind === 'chest') claimChapterChest();
    else if (m.kind === 'mission') { if (m.claim) claimMission(m.id); else runGo(m.go); }
    else if (m.kind === 'dchest') claimDailyChest(m.id);
    else Game.navigate('events:daily');
  });
  return el;
}

function updateBanner() {
  const b = ui.banner;
  if (!b || !P()) return;
  const m = bannerModel();
  ui.model = m;
  if (!m) return;
  setHtml(b.querySelector('[data-f="ico"]'), Game.icon(m.icon, 24));
  setText(b.querySelector('[data-f="kicker"]'), m.kicker);
  setText(b.querySelector('[data-f="text"]'), m.text);
  setText(b.querySelector('[data-f="num"]'), m.kind === 'daydone' ? '' : progLabel(m.lv, m.cur, m.n));
  const act = b.querySelector('#prog-banner-act');
  const label = m.claim ? 'Claim' : m.view ? 'View' : 'Go';
  const cls = 'btn small prog-banner-act ' + (m.claim ? 'green' : m.view ? 'ghost' : 'blue');
  if (act.className !== cls) act.className = cls;
  setText(act, label);
  const aria = `${label}: ${m.text}`;
  if (act.getAttribute('aria-label') !== aria) act.setAttribute('aria-label', aria);
  const openAria = `Open Events. ${m.kicker}. ${m.text}, ${m.cur} of ${m.n}`;
  const main = b.querySelector('#prog-banner-open');
  if (main.getAttribute('aria-label') !== openAria) main.setAttribute('aria-label', openAria);
  b.classList.toggle('is-claim', !!m.claim);
  const w = (Math.min(1, m.cur / Math.max(1, m.n)) * 100).toFixed(1) + '%';
  const bar = b.querySelector('.prog-banner-bar i');
  if (bar.style.width !== w) bar.style.width = w;
  const hl = m.hl || null;
  if (hl !== ui.hl) {
    ui.hl = hl;
    call(() => Game.city?.highlight?.(hl));
  }
}

// ================================================================ Events screen
const SUBS = [
  { id: 'chapter', label: 'Chapter' },
  { id: 'daily', label: 'Daily' },
  { id: 'login', label: 'Login' },
];

function mountEvents(el) {
  ui.root = el;
  el.innerHTML = `<div class="prog-events">
    <div class="seg prog-subtabs" role="group" aria-label="Event sections">${SUBS.map(s => `<button type="button" id="prog-sub-${s.id}" data-sub="${s.id}" aria-pressed="false"><span>${s.label}</span><span class="badge-dot" aria-hidden="true" hidden></span></button>`).join('')}</div>
    ${SUBS.map(s => `<div class="prog-view" data-view="${s.id}" hidden></div>`).join('')}
  </div>`;
  for (const s of SUBS) ui.views[s.id] = el.querySelector(`[data-view="${s.id}"]`);
  el.addEventListener('click', onEventsClick);
  setSub(ui.sub, true);
}
function setSub(id, keepScroll) {
  if (!SUBS.some(s => s.id === id)) return;
  ui.sub = id;
  Game.storage.set(SUB_KEY, id);
  const el = ui.root;
  if (!el) return;
  el.querySelectorAll('.prog-subtabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sub === id)));
  for (const s of SUBS) ui.views[s.id].hidden = s.id !== id;
  if (!keepScroll) el.scrollTop = 0;
  updateEvents(el);
}
function onEventsClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled || !ui.root.contains(b)) return;
  if (b.dataset.sub) { setSub(b.dataset.sub); return; }
  const act = b.dataset.act;
  const id = b.dataset.id;
  if (act === 'task-go') { const t = chapter()?.tasks.find(x => x.id === id); if (t) runGo(t.go); }
  else if (act === 'task-claim') claimTask(id);
  else if (act === 'chest') { if (chapterComplete()) claimChapterChest(); else chestPreview(P().ch.idx); }
  else if (act === 'm-go') { const m = DAILY.find(x => x.id === id); if (m) runGo(m.go); }
  else if (act === 'm-claim') claimMission(id);
  else if (act === 'm-all') claimAllMissions();
  else if (act === 'dchest') {
    const c = CHESTS.find(x => String(x.at) === id);
    if (c) { if (chestState(c) === 'ready') claimDailyChest(c.at); else dailyChestPreview(c); }
  } else if (act === 'day') {
    const day = Number(id);
    if (day === P().login.claimed + 1 && loginReady()) claimLogin(); else loginPreview(day);
  } else if (act === 'login') claimLogin();
  else if (act === 'go') Game.navigate(b.dataset.go);
  if (ui.root) updateEvents(ui.root);
}
function updateEvents(el) {
  if (!P() || !el) return;
  const cl = claimables();
  el.querySelectorAll('.prog-subtabs button').forEach(b => {
    const n = cl[b.dataset.sub] || 0;
    const dot = b.querySelector('.badge-dot');
    if (dot.hidden !== (n === 0)) dot.hidden = n === 0;
    const lab = `${SUBS.find(s => s.id === b.dataset.sub).label}${n ? `, ${n} to claim` : ''}`;
    if (b.getAttribute('aria-label') !== lab) b.setAttribute('aria-label', lab);
  });
  if (ui.sub === 'chapter') updateChapterView(ui.views.chapter);
  else if (ui.sub === 'daily') updateDailyView(ui.views.daily);
  else updateLoginView(ui.views.login);
}

const actButton = (st, kind, id) => {
  if (st === 'claimed') return `<span class="prog-donetag">${Game.icon('check', 14)}<span>Done</span></span>`;
  if (st === 'ready') return `<button type="button" class="btn green small" data-act="${kind}-claim" data-id="${esc(id)}">Claim</button>`;
  return `<button type="button" class="btn blue small" data-act="${kind}-go" data-id="${esc(id)}">Go</button>`;
};

// ---------- chapter view
function chapterSig() {
  const p = P();
  const c = chapter();
  return c ? `${p.ch.idx}:${c.tasks.map(t => taskState(t)[0]).join('')}` : 'all-done';
}
function renderChapterView(view) {
  const p = P();
  const c = chapter();
  if (!c) {
    view.innerHTML = `<section class="panel prog-alldone">
      <span class="prog-alldone-ico">${Game.icon('trophy', 44)}</span>
      <h2 class="prog-title">Every chapter complete</h2>
      <p class="prog-blurb">Your city came through its first winter. Daily missions and the login calendar keep the supplies coming.</p>
      <button type="button" class="btn gold" data-act="go" data-go="events:daily">Daily missions</button>
    </section>`;
    return;
  }
  const i = p.ch.idx;
  view.innerHTML = `<section class="panel prog-chap">
      <div class="prog-chap-head">
        <div class="prog-chap-txt">
          <div class="prog-kicker">Chapter ${i + 1} of ${CHAPTERS.length}</div>
          <h2 class="prog-title">${esc(c.title)}</h2>
          <p class="prog-blurb">${esc(c.blurb)}</p>
        </div>
        <button type="button" class="prog-chest" id="prog-chap-chest" data-act="chest">${Game.tileHtml({ icon: 'chest', rarity: 'legendary' })}<span class="badge-dot" aria-hidden="true" hidden></span></button>
      </div>
      <div class="progress gold prog-chap-bar"><div class="bar"></div><span class="progress-label" data-f="plabel"></span></div>
      <div class="prog-chap-foot">
        <span class="prog-chap-hint" data-f="hint"></span>
        <button type="button" class="btn green small" id="prog-chap-claim" data-act="chest" hidden>Open chest</button>
      </div>
    </section>
    <h3 class="section-title">Tasks</h3>
    <div class="prog-list">${sortedTasks(c).map(t => {
      const st = taskState(t);
      return `<div class="card prog-row is-${st}" data-task="${esc(t.id)}">
        <span class="prog-ico">${Game.icon(t.icon, 26)}</span>
        <div class="prog-row-main">
          <div class="prog-row-text">${esc(taskText(t))}</div>
          <div class="prog-meter"><div class="progress${st === 'open' ? '' : ' green'}"><div class="bar"></div></div><span class="prog-meter-num" data-f="num"></span></div>
          <div class="prog-row-rw">${rewardChips(t.rewards)}</div>
        </div>
        <div class="prog-row-act">${actButton(st, 'task', t.id)}</div>
      </div>`;
    }).join('')}</div>`;
}
function updateChapterView(view) {
  const s = chapterSig();
  if (ui.sig.chapter !== s) { ui.sig.chapter = s; renderChapterView(view); }
  const c = chapter();
  if (!c) return;
  const done = chapterClaimedCount();
  const all = c.tasks.length;
  const complete = done >= all;
  const bar = view.querySelector('.prog-chap-bar .bar');
  const w = ((done / all) * 100).toFixed(1) + '%';
  if (bar.style.width !== w) bar.style.width = w;
  setText(view.querySelector('[data-f="plabel"]'), `${done}/${all}`);
  setText(view.querySelector('[data-f="hint"]'), complete ? 'Every task claimed. The chapter chest is yours.' : 'Claim every task to open the chapter chest.');
  view.querySelector('#prog-chap-claim').hidden = !complete;
  const chest = view.querySelector('#prog-chap-chest');
  chest.classList.toggle('is-ready', complete);
  chest.querySelector('.badge-dot').hidden = !complete;
  const aria = complete ? 'Chapter chest, ready to open' : 'Chapter chest. See what is inside';
  if (chest.getAttribute('aria-label') !== aria) chest.setAttribute('aria-label', aria);
  for (const t of c.tasks) {
    const row = view.querySelector(`[data-task="${CSS.escape(t.id)}"]`);
    if (!row) continue;
    const cur = taskShown(t);
    setText(row.querySelector('[data-f="num"]'), progLabel(t.lv, cur, t.n));
    const b = row.querySelector('.progress .bar');
    const bw = ((cur / t.n) * 100).toFixed(1) + '%';
    if (b.style.width !== bw) b.style.width = bw;
  }
}

// ---------- daily view
function dailySig() {
  const d = P().daily;
  return `${d.day}:${dailyList().map(m => missionState(m)[0]).join('')}:${CHESTS.map(c => chestState(c)[0]).join('')}`;
}
function renderDailyView(view) {
  const order = dailyList().map((m, i) => ({ m, i })).sort((a, b) => {
    const r = { ready: 0, open: 1, claimed: 2 };
    return r[missionState(a.m)] - r[missionState(b.m)] || a.i - b.i;
  }).map(x => x.m);
  const readyN = dailyList().filter(m => missionState(m) === 'ready').length;
  view.innerHTML = `<section class="panel prog-act">
      <div class="prog-act-head">
        <div>
          <div class="prog-kicker">Daily activity</div>
          <div class="prog-act-pts"><span data-f="pts">0</span><span class="prog-act-max">/${MAX_POINTS}</span></div>
        </div>
        <div class="prog-reset">${Game.icon('clock', 14)}<span>Resets in <span data-f="reset"></span></span></div>
      </div>
      <div class="prog-act-chests">${CHESTS.map(c => {
        const st = chestState(c);
        return `<div class="prog-dchest-cell"><button type="button" class="prog-dchest is-${st}" data-act="dchest" data-id="${c.at}" aria-label="Activity chest ${c.at}${st === 'ready' ? ', ready to open' : st === 'open' ? ', opened' : ''}">${Game.tileHtml({ icon: 'chest', rarity: c.rarity })}${st === 'open' ? `<span class="prog-dchest-check">${Game.icon('check', 14)}</span>` : ''}${st === 'ready' ? '<span class="badge-dot" aria-hidden="true"></span>' : ''}</button><span class="prog-dchest-at">${c.at}</span></div>`;
      }).join('')}</div>
      <div class="progress ember prog-act-bar"><div class="bar"></div></div>
    </section>
    <div class="prog-list-head"><h3 class="section-title">Missions</h3>${readyN > 1 ? '<button type="button" class="btn green small" id="prog-claim-all" data-act="m-all">Claim all</button>' : ''}</div>
    <div class="prog-list">${order.map(m => {
      const st = missionState(m);
      return `<div class="card prog-row is-${st}" data-mission="${m.id}">
        <span class="prog-ico">${Game.icon(m.icon, 26)}</span>
        <div class="prog-row-main">
          <div class="prog-row-text">${esc(m.text)}</div>
          <div class="prog-meter"><div class="progress${st === 'open' ? '' : ' green'}"><div class="bar"></div></div><span class="prog-meter-num" data-f="num"></span></div>
        </div>
        <span class="prog-pts" title="Activity points">+${m.pts}</span>
        <div class="prog-row-act">${actButton(st, 'm', m.id)}</div>
      </div>`;
    }).join('')}</div>
    <p class="prog-note">Missions count what you do after the daily reset at local midnight.</p>`;
}
function updateDailyView(view) {
  const s = dailySig();
  if (ui.sig.daily !== s) { ui.sig.daily = s; renderDailyView(view); }
  const pts = activity();
  setText(view.querySelector('[data-f="pts"]'), pts);
  setText(view.querySelector('[data-f="reset"]'), Game.fmtTime(secToReset()));
  const bar = view.querySelector('.prog-act-bar .bar');
  const w = ((pts / MAX_POINTS) * 100).toFixed(1) + '%';
  if (bar.style.width !== w) bar.style.width = w;
  for (const m of dailyList()) {
    const row = view.querySelector(`[data-mission="${m.id}"]`);
    if (!row) continue;
    const cur = missionState(m) === 'open' ? Math.min(m.n, dailyCount(m.key)) : m.n;
    setText(row.querySelector('[data-f="num"]'), `${fmtFull(cur)}/${fmtFull(m.n)}`);
    const b = row.querySelector('.progress .bar');
    const bw = ((cur / m.n) * 100).toFixed(1) + '%';
    if (b.style.width !== bw) b.style.width = bw;
  }
}

// ---------- login view
function loginSig() {
  const L = loginState();
  return `${L.round}:${L.claimed}:${loginReady() ? 1 : 0}:${day2ShardId() || ''}`;
}
function dayTiles(rw, max) {
  const list = rewardEntries(rw);
  const shown = list.slice(0, max).map(x => Game.tileHtml({ icon: x.icon, rarity: x.rarity, count: x.count })).join('');
  const more = list.length > max ? `<span class="prog-day-more">+${list.length - max}</span>` : '';
  return shown + more;
}
function renderLoginView(view) {
  const L = loginState();
  const ready = loginReady();
  const next = L.claimed + 1;
  const cards = [];
  for (let d = 1; d <= LOGIN_DAYS; d++) {
    const st = d <= L.claimed ? 'claimed' : d === next && ready ? 'ready' : d === next ? 'next' : 'locked';
    const names = rewardEntries(loginRewards(d)).map(x => `${x.name} ${x.count}`).join(', ');
    const stTxt = st === 'claimed' ? 'claimed' : st === 'ready' ? 'ready to claim' : st === 'next' ? 'ready tomorrow' : 'locked';
    cards.push(`<button type="button" class="prog-day is-${st}${d === LOGIN_DAYS ? ' is-big' : ''}" data-act="day" data-id="${d}" aria-label="Day ${d}, ${stTxt}: ${esc(names)}">
      <span class="prog-day-n">Day ${d}</span>
      <span class="prog-day-tiles">${dayTiles(loginRewards(d), d === LOGIN_DAYS ? 3 : 1)}</span>
      ${st === 'claimed' ? `<span class="prog-day-check">${Game.icon('check', 18)}</span>` : ''}
      ${st === 'ready' ? '<span class="prog-day-flag">Today</span>' : ''}
    </button>`);
  }
  view.innerHTML = `<section class="panel prog-login">
      <div class="prog-login-head">
        <div>
          <div class="prog-kicker">7-day login · Round ${L.round}</div>
          <h2 class="prog-title">Daily supplies</h2>
        </div>
        <span class="prog-icon-lg">${Game.icon('calendar', 40)}</span>
      </div>
      <p class="prog-blurb">Sign in on 7 different days to claim every reward. Day 2 brings shards of an Epic hero, day 7 the biggest haul.</p>
      <div class="prog-days">${cards.join('')}</div>
      <button type="button" class="btn gold wide prog-login-claim" id="prog-login-claim" data-act="login"${ready ? '' : ' disabled'}>${ready ? `Claim day ${next}` : 'Claimed today'}</button>
      <div class="prog-reset prog-login-next" data-f="next"></div>
    </section>`;
}
function updateLoginView(view) {
  const s = loginSig();
  if (ui.sig.login !== s) { ui.sig.login = s; renderLoginView(view); }
  const L = loginState();
  const nextEl = view.querySelector('[data-f="next"]');
  if (loginReady()) setHtml(nextEl, `${Game.icon('gift', 14)}<span>Day ${L.claimed + 1} is ready</span>`);
  else {
    const t = Game.fmtTime(secToReset());
    const what = L.claimed >= LOGIN_DAYS ? 'New round in' : `Day ${L.claimed + 1} in`;
    setHtml(nextEl, `${Game.icon('clock', 14)}<span>${what} ${esc(t)}</span>`);
  }
}

// ================================================================ mail sheets
let mailSheet = null;
function mailSig() {
  return mails().map(m => `${m.id}:${m.read ? 1 : 0}${m.claimed ? 1 : 0}`).join(',');
}
function renderMailList(body) {
  const list = mails();
  const host = body.querySelector('[data-f="list"]');
  host.innerHTML = list.map(m => {
    const gift = mailHasGift(m);
    const flags = [!m.read ? 'unread' : '', gift ? 'has an attachment' : ''].filter(Boolean).join(', ');
    return `<button type="button" class="prog-mail-row card${m.read ? '' : ' is-unread'}" data-mail="${esc(m.id)}" aria-label="${esc(m.title)}, from ${esc(m.from)}${flags ? ', ' + flags : ''}">
      <span class="prog-mail-ico">${Game.icon(gift ? 'gift' : 'mail', 28)}</span>
      <span class="prog-mail-txt">
        <span class="prog-mail-title">${esc(m.title)}</span>
        <span class="prog-mail-from">${esc(m.from)} · <span data-at="${m.at}">${esc(ago(m.at))}</span></span>
      </span>
      ${!m.read || gift ? '<span class="badge-dot" aria-hidden="true"></span>' : ''}
      <span class="prog-mail-chev">${Game.icon('chevron_right', 16)}</span>
    </button>`;
  }).join('');
  body.querySelector('[data-f="empty"]').hidden = list.length > 0;
}
function openMail() {
  if (mailSheet && !mailSheet.closed) return mailSheet;
  const body = Game.el(`<div class="prog-mail">
    <div class="prog-mail-list" data-f="list"></div>
    <p class="prog-empty" data-f="empty" hidden>No mail yet.</p>
  </div>`);
  let sig = '';
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-mail]');
    if (b) openLetter(b.dataset.mail);
  });
  mailSheet = Game.sheet({
    title: 'Mail',
    body,
    className: 'prog-mail-sheet',
    update: el => {
      const s = mailSig();
      if (s !== sig) { sig = s; renderMailList(el); }
      el.querySelectorAll('[data-at]').forEach(n => setText(n, ago(Number(n.dataset.at))));
    },
    actions: [
      { id: 'mail-read', label: 'Read all', kind: 'ghost', disabled: () => !P()?.mail.some(m => !m.read && !m.rewards), onClick: () => { for (const m of P().mail) if (!m.rewards) m.read = true; afterClaim(); return false; } },
      { id: 'mail-claim-all', label: 'Claim all', kind: 'green', disabled: () => !P()?.mail.some(mailHasGift), onClick: () => { claimAllMail(); return false; } },
    ],
    onClose: () => { mailSheet = null; },
  });
  return mailSheet;
}
function openLetter(id) {
  const m = P()?.mail.find(x => x.id === id);
  if (!m) return null;
  m.read = true;
  afterClaim();
  const body = Game.el(`<div class="prog-letter">
    <div class="prog-letter-from">${Game.icon('mail', 18)}<span>From <b>${esc(m.from)}</b> · ${esc(ago(m.at))}</span></div>
    ${m.body.map(x => `<p class="prog-letter-p">${esc(x)}</p>`).join('')}
    ${m.rewards ? `<h3 class="section-title">Attachments</h3><div class="prog-rw-grid prog-letter-rw">${Game.rewardsHtml(m.rewards)}</div><p class="prog-letter-claimed" hidden>${Game.icon('check', 14)} Claimed</p>` : ''}
  </div>`);
  const actions = [];
  if (m.go) actions.push({ id: 'mail-go', label: m.go.label, kind: 'blue', onClick: () => Game.navigate(m.go.target) });
  if (m.rewards) {
    actions.push({
      id: 'mail-claim',
      label: () => (m.claimed ? 'Claimed' : 'Claim'),
      kind: () => (m.claimed ? 'ghost' : 'green'),
      disabled: () => m.claimed,
      onClick: () => { claimMail(m.id); return false; },
    });
  } else if (!m.go) actions.push({ label: 'OK', kind: 'ghost', onClick: () => {} });
  return Game.sheet({
    title: m.title,
    body,
    className: 'prog-letter-sheet',
    update: el => {
      const rw = el.querySelector('.prog-letter-rw');
      if (rw) rw.classList.toggle('is-claimed', !!m.claimed);
      const c = el.querySelector('.prog-letter-claimed');
      if (c) c.hidden = !m.claimed;
    },
    actions,
  });
}

// ================================================================ chief profile
const NAME_MIN = 2;
const NAME_MAX = 16;
// Letters (any script, with their combining marks), digits, spaces and . _ ' -. Emoji and their joiners are refused.
const NAME_BAD = /[^\p{L}\p{M}\p{N} ._'-]|[\u200D\uFE0E\uFE0F\u20E3]/gu;
function nameCheck(raw) {
  const v = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const stripped = v.replace(NAME_BAD, '').replace(/\s+/g, ' ').trim();
  if (stripped !== v) return { ok: false, name: stripped.slice(0, NAME_MAX), msg: "Letters, numbers, spaces and . _ ' - only." };
  if (v.length < NAME_MIN || v.length > NAME_MAX) return { ok: false, name: v.slice(0, NAME_MAX), msg: `Use ${NAME_MIN} to ${NAME_MAX} characters.` };
  return { ok: true, name: v, msg: '' };
}
function saveName(input) {
  const chk = nameCheck(input.value);
  if (!chk.ok || !Game.S) return false;
  if (chk.name === Game.S.meta.chiefName) { input.value = chk.name; return false; }
  Game.S.meta.chiefName = chk.name;
  input.value = chk.name;
  Game.refreshHud();
  Game.save();
  Game.toast('Name saved', 'good');
  return true;
}
const STATS = [
  { id: 'days', label: 'Days played', icon: 'calendar', val: () => fmtFull(Math.max(1, int(P()?.stats?.days))) },
  { id: 'furnace', label: 'Furnace level', icon: 'flame', val: () => 'Lv ' + Math.max(1, level('furnace')) },
  { id: 'blv', label: 'Building levels', icon: 'hammer', val: () => fmtFull(totalBuildingLevels()) },
  { id: 'heroes', label: 'Heroes owned', icon: 'hero', val: () => fmtFull(heroesOwned()) },
  { id: 'stage', label: 'Highest stage', icon: 'map', val: () => (highestStage() ? stageLabel(highestStage()) : 'None yet') },
  { id: 'gems', label: 'Gems earned', icon: 'gem', val: () => fmtFull(int(P()?.stats?.gemsEarned)) },
  { id: 'chapters', label: 'Chapters done', icon: 'trophy', val: () => `${Math.min(CHAPTERS.length, int(P()?.ch?.idx))}/${CHAPTERS.length}` },
  { id: 'since', label: 'Chief since', icon: 'clock', val: () => sinceText() },
];
function sinceText() {
  const t = num(Game.S?.meta?.createdAt);
  if (!t) return '-';
  try { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return '-'; }
}
function mountProfile(el) {
  const n = Math.max(1, int(Game.avatarCount) || 6);
  el.innerHTML = `<div class="prog-profile">
    <div class="prog-prof-top">
      <button type="button" class="btn ghost small" id="prog-prof-back">${Game.icon('chevron_left', 16)}<span>Back</span></button>
      <h2 class="prog-prof-h">Chief profile</h2>
    </div>
    <section class="panel prog-prof-card">
      <span class="prog-prof-avatar" data-f="avatar"></span>
      <div class="prog-prof-id">
        <label class="prog-label" for="prog-name">Chief name</label>
        <div class="prog-name-row">
          <input id="prog-name" name="chief-name" type="text" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" spellcheck="false" aria-describedby="prog-name-hint">
          <button type="button" class="btn gold small" id="prog-name-save">Save</button>
        </div>
        <div class="prog-name-hint" id="prog-name-hint">${NAME_MIN} to ${NAME_MAX} characters.</div>
      </div>
      <div class="prog-prof-power">${Game.icon('power', 22)}<span class="prog-prof-power-l">Power</span><span class="prog-prof-power-v" data-f="power">0</span></div>
    </section>
    <h3 class="section-title">Portrait</h3>
    <div class="prog-avatars" role="group" aria-label="Portrait">${Array.from({ length: n }, (_, i) => `<button type="button" class="prog-av" id="prog-av-${i}" data-av="${i}" aria-pressed="false" aria-label="Portrait ${i + 1}">${Game.avatarSvg(i, 56)}</button>`).join('')}</div>
    <h3 class="section-title">Record</h3>
    <div class="prog-stats">${STATS.map(s => `<div class="card prog-stat" data-stat="${s.id}"><span class="prog-stat-ico">${Game.icon(s.icon, 20)}</span><span class="prog-stat-txt"><span class="prog-stat-l">${s.label}</span><span class="prog-stat-v" data-f="v"></span></span></div>`).join('')}</div>
    <div class="prog-prof-links">
      <button type="button" class="btn blue" id="prog-prof-mail">${Game.icon('mail', 20)}<span>Mail</span><span class="badge-dot" aria-hidden="true" hidden></span></button>
      <button type="button" class="btn blue" id="prog-prof-events">${Game.icon('calendar', 20)}<span>Events</span></button>
    </div>
  </div>`;
  const input = el.querySelector('#prog-name');
  const save = el.querySelector('#prog-name-save');
  const hint = el.querySelector('#prog-name-hint');
  const syncHint = () => {
    const chk = nameCheck(input.value);
    hint.textContent = chk.ok ? `${NAME_MIN} to ${NAME_MAX} characters.` : chk.msg;
    hint.classList.toggle('bad-text', !chk.ok);
    input.setAttribute('aria-invalid', String(!chk.ok));
    save.disabled = !chk.ok || chk.name === Game.S?.meta?.chiefName;
  };
  input.addEventListener('input', syncHint);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveName(input); syncHint(); input.blur(); }
    if (e.key === 'Escape') { input.value = Game.S?.meta?.chiefName ?? ''; syncHint(); }
  });
  input.addEventListener('change', () => { saveName(input); syncHint(); });
  save.addEventListener('click', () => { saveName(input); syncHint(); });
  el.querySelector('#prog-prof-back').addEventListener('click', () => Game.back());
  el.querySelector('#prog-prof-mail').addEventListener('click', () => openMail());
  el.querySelector('#prog-prof-events').addEventListener('click', () => Game.navigate('events'));
  el.querySelector('.prog-avatars').addEventListener('click', e => {
    const b = e.target.closest('[data-av]');
    if (!b || !Game.S) return;
    Game.S.meta.avatar = Number(b.dataset.av);
    Game.refreshHud();
    updateProfile(el);
  });
  ui.prof = { el, input, syncHint };
  syncProfileInput();
}
function syncProfileInput() {
  const pr = ui.prof;
  if (!pr || !Game.S) return;
  if (document.activeElement !== pr.input) pr.input.value = Game.S.meta.chiefName ?? '';
  pr.syncHint();
}
function updateProfile(el) {
  if (!Game.S) return;
  setHtml(el.querySelector('[data-f="avatar"]'), Game.avatarSvg(Game.S.meta.avatar, 88));
  setText(el.querySelector('[data-f="power"]'), fmtFull(Game.power()));
  el.querySelectorAll('[data-av]').forEach(b => {
    const on = String(Number(b.dataset.av) === Game.S.meta.avatar);
    if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on);
  });
  for (const s of STATS) setText(el.querySelector(`[data-stat="${s.id}"] [data-f="v"]`), call(s.val, '-'));
  const dot = el.querySelector('#prog-prof-mail .badge-dot');
  const mb = mailBadge();
  if (dot.hidden !== (mb === 0)) dot.hidden = mb === 0;
  // the HUD and other tabs can change the name too; never overwrite what the chief is typing
  if (ui.prof && document.activeElement !== ui.prof.input && ui.prof.input.value !== Game.S.meta.chiefName) syncProfileInput();
}

// ================================================================ screens, navigation, wiring
Game.registerScreen('events', {
  tab: { label: 'Events', icon: 'calendar', order: 4 },
  mount: mountEvents,
  update: updateEvents,
});
Game.registerScreen('profile', {
  tab: null,
  title: 'Chief profile',
  mount: mountProfile,
  update: updateProfile,
});
Game.registerNav('events', rest => {
  const sub = String(rest || '').split(':')[0];
  setSub(SUBS.some(s => s.id === sub) ? sub : ui.sub);
});
Game.registerNav('profile', () => {
  syncProfileInput();
  if (ui.prof) ui.prof.el.scrollTop = 0;
});
Game.registerNav('mail', () => openMail());

Game.on('ready', () => {
  if (!P()) return;
  checkSupplyMail(level('furnace'));
  evalChapter();
  if (typeof Game.city?.setBanner === 'function') {
    ui.banner = buildBanner();
    updateBanner();
    call(() => Game.city.setBanner(ui.banner));
  }
  call(() => Game.city?.addSideButton?.({ id: 'prog-mail', icon: 'mail', label: 'Mail', onClick: openMail, badge: () => mailBadge() }));
  call(() => Game.city?.addSideButton?.({ id: 'prog-login', icon: 'calendar', label: 'Login', onClick: () => Game.navigate('events:login'), badge: () => (loginReady() ? 1 : 0) }));
  refreshBadges();
});

Game.prog = {
  openMail,
  openLetter,
  sendMail: def => addMail(def),
  mailUnread: () => mailBadge(),
  claimables: () => claimables(),
  chapter: () => {
    const p = P();
    const c = chapter();
    if (!p) return null;
    return {
      index: p.ch.idx,
      total: CHAPTERS.length,
      title: c ? c.title : null,
      complete: !c,
      tasks: c ? c.tasks.map(t => ({ id: t.id, text: taskText(t), cur: taskShown(t), n: t.n, state: taskState(t) })) : [],
    };
  },
  current: () => bannerModel(),
  daily: () => ({ points: activity(), max: MAX_POINTS, missions: dailyList().map(m => ({ id: m.id, text: m.text, cur: Math.min(m.n, dailyCount(m.key)), n: m.n, pts: m.pts, state: missionState(m) })) }),
  loginReady: () => loginReady(),
  claimTask,
  claimChapterChest,
  claimMission,
  claimDailyChest,
  claimLogin,
  claimMail,
};
