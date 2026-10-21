/* Last Furnace city module (owner: city agent).
   Buildings and the build queue, production that collects inside buildings, survivors and workers, heat, weather
   and furnace modes, and the drawn town on the City screen. Public API: Game.city (bottom of this file). */

// ================================================================ constants and data
const TAU = Math.PI * 2;
const DAY_MS = 10 * 60 * 1000;
const WORLD_W = 600;
const WORLD_H = 900;
const FMAX = 30;
const PLAZA = { x: 300, y: 462, rx: 116, ry: 58 };

// w: cost weights [wood, meat, coal, iron]; tf: build time factor; unlock: Furnace level that opens the plot;
// x, y: ground anchor in world px; hb: [width, height above anchor, depth below anchor] of the tap box.
const B = {
  furnace: { name: 'Furnace', unlock: 1, tf: 1.4, w: [2.0, 1.3, 0.6, 0.25], x: 300, y: 462, hb: [150, 176, 44],
    desc: 'The heart of the city. Its heat keeps survivors alive, and its level caps every other building.' },
  shelter: { name: 'Shelter', unlock: 1, tf: 0.8, w: [1.2, 0.6, 0.3, 0.1], x: 178, y: 368, hb: [118, 80, 34],
    desc: 'Cabins for your survivors. Each level makes room for more people.' },
  storehouse: { name: 'Storehouse', unlock: 6, tf: 1.0, w: [1.3, 0.5, 0.4, 0.15], x: 424, y: 368, hb: [112, 78, 32],
    desc: 'Lets every resource building hold more before it fills up.' },
  sawmill: { name: 'Sawmill', unlock: 1, tf: 0.75, w: [0.9, 0.8, 0.3, 0.1], x: 140, y: 500, hb: [112, 70, 30],
    desc: 'Workers cut Wood here. Output piles up in the mill until you collect it.' },
  coalmine: { name: 'Coal Mine', unlock: 1, tf: 0.8, w: [1.0, 0.8, 0.2, 0.12], x: 458, y: 500, hb: [112, 76, 30],
    desc: 'Workers dig Coal, the fuel that keeps the Furnace burning.' },
  hunter: { name: "Hunter's Hut", unlock: 1, tf: 0.75, w: [1.0, 0.4, 0.3, 0.1], x: 196, y: 622, hb: [104, 70, 28],
    desc: 'Hunters bring in Meat to feed survivors and troops.' },
  ironmine: { name: 'Iron Mine', unlock: 3, tf: 0.9, w: [1.1, 0.9, 0.4, 0.1], x: 404, y: 622, hb: [112, 84, 30],
    desc: 'Workers mine Iron for advanced buildings and troops.' },
  infirmary: { name: 'Infirmary', unlock: 4, tf: 0.9, w: [1.0, 1.0, 0.4, 0.15], x: 300, y: 724, hb: [112, 76, 30],
    desc: 'Nurses sick survivors back to health so they can work again.' },
  infantry_camp: { name: 'Infantry Camp', unlock: 2, tf: 0.9, w: [1.1, 1.0, 0.35, 0.15], x: 300, y: 262, hb: [112, 84, 32],
    desc: 'Trains Infantry, the sturdy front line of your army.' },
  lancer_camp: { name: 'Lancer Camp', unlock: 3, tf: 0.9, w: [1.1, 1.0, 0.35, 0.15], x: 170, y: 238, hb: [112, 84, 32],
    desc: 'Trains Lancers, who strike hard and fast.' },
  marksman_camp: { name: 'Marksman Camp', unlock: 5, tf: 0.9, w: [1.1, 1.0, 0.35, 0.15], x: 430, y: 238, hb: [112, 84, 32],
    desc: 'Trains Marksmen, who hit the enemy from range.' },
};
const ORDER = ['furnace', 'shelter', 'sawmill', 'hunter', 'coalmine', 'ironmine', 'infirmary', 'storehouse', 'infantry_camp', 'lancer_camp', 'marksman_camp'];
const PRODUCERS = { hunter: 'meat', sawmill: 'wood', coalmine: 'coal', ironmine: 'iron' };
const PROD_IDS = ['hunter', 'sawmill', 'coalmine', 'ironmine'];
const CAMPS = { infantry_camp: 'infantry', lancer_camp: 'lancer', marksman_camp: 'marksman' };
const PER_WORKER = { wood: 800, meat: 700, coal: 240, iron: 80 };
const ROT = ['sawmill', 'hunter', 'coalmine', 'infantry_camp', 'ironmine', 'lancer_camp', 'infirmary', 'marksman_camp', 'storehouse'];
const COMFORT = {
  warm: { label: 'Warm', eff: 1, cls: 'warm' },
  chilly: { label: 'Chilly', eff: 0.9, cls: 'chilly' },
  cold: { label: 'Cold', eff: 0.75, cls: 'cold' },
  freezing: { label: 'Freezing', eff: 0.55, cls: 'freezing' },
};
const MODES = {
  off: { label: 'Off', desc: 'No heat and no Coal used.' },
  on: { label: 'On', desc: 'Normal heat.' },
  over: { label: 'Overdrive', desc: '40% more heat for double Coal.' },
};
const HUNGRY_EFF = 0.7;

// ================================================================ small helpers
const esc = s => Game.esc(s);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const S = () => Game.S;
const C = () => Game.S.city;
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function nice(n) {
  if (!(n > 0)) return 0;
  if (n < 100) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}
const fmt = n => Game.fmt(n);
const fmtT = s => Game.fmtTime(s);
const resName = r => Game.resInfo?.[r]?.name || r;

// ================================================================ economy
function costCurve(L) { return L <= 10 ? 50 * 1.6 ** (L - 1) : 50 * 1.6 ** 9 * 1.38 ** (L - 10); }
function timeCurve(L) { return L <= 1 ? 0.6 : L <= 12 ? 1.55 ** (L - 2) : 1.55 ** 10 * 1.38 ** (L - 12); }
function prodCurve(L) { return L <= 0 ? 0 : L <= 10 ? 1.3 ** (L - 1) : 1.3 ** 9 * 1.2 ** (L - 10); }
function tierOf(L) { return L >= 20 ? 3 : L >= 10 ? 2 : L >= 5 ? 1 : 0; }

function lvl(id) {
  const v = Number(Game.S?.city?.levels?.[id]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
function isUnlocked(id) { return lvl('furnace') >= (B[id]?.unlock ?? 99); }
function upgradeCost(id, L) {
  const d = B[id];
  const base = costCurve(L);
  const c = { wood: nice(base * d.w[0]) };
  if (d.w[1]) c.meat = nice(base * d.w[1]);
  if (L >= 3 && d.w[2]) c.coal = nice(base * d.w[2]);
  if (L >= 5 && d.w[3]) c.iron = nice(base * d.w[3]);
  return c;
}
function baseTime(id, L) { return Math.max(3, Math.round(8 * B[id].tf * timeCurve(L))); }
function upgradeTime(id, L) {
  const pct = Math.max(0, Number(Game.perk('buildSpeedPct')) || 0);
  return Math.max(1, Math.round(baseTime(id, L) / (1 + pct / 100)));
}
function reqsFor(id, L) {
  const out = [];
  if (id === 'furnace') {
    if (L >= 2) out.push({ id: 'shelter', level: L - 1 });
    if (L >= 3) out.push({ id: ROT[(L - 3) % ROT.length], level: L - 1 });
  } else {
    const need = Math.max(L, B[id].unlock);
    if (need > 1) out.push({ id: 'furnace', level: need });
  }
  return out.map(r => ({ ...r, met: lvl(r.id) >= r.level }));
}
function slots(L) { return L <= 0 ? 0 : 2 + Math.floor((L - 1) / 2); }
function popCapAt(L) { return L <= 0 ? 4 : 5 + 3 * L; }
function popCap() { return popCapAt(lvl('shelter')); }
function storeBonusAt(L) { return 25 * L; }
function capHours() { return 2 * (1 + storeBonusAt(lvl('storehouse')) / 100); }
function perWorkerAt(id, L) { return PER_WORKER[PRODUCERS[id]] * prodCurve(L); }
function capAt(id, L) { return Math.round(perWorkerAt(id, L) * slots(L) * capHours()); }
function storageCap(id) { return capAt(id, lvl(id)); }
function healSecAt(L) { return L <= 0 ? 0 : Math.round(50 / (1 + 0.25 * (L - 1))); }
function heatOf(F, mode) { return mode === 'off' ? 0 : (20 + 2.2 * (F - 1)) * (mode === 'over' ? 1.4 : 1); }
function burnAt(F, mode) { return mode === 'off' ? 0 : 30 * 1.28 ** (F - 1) * (mode === 'over' ? 2 : 1); }
function burnPerHour() { return burnAt(lvl('furnace') || 1, C().mode); }
function eatPerHour() { return C().pop.total * 6 * 1.22 ** ((lvl('furnace') || 1) - 1); }
function campSpeedAt(L) { return L * 0.5; }
function gemsForRes(m) {
  return Math.ceil((m.wood || 0) / 60 + (m.meat || 0) / 60 + (m.coal || 0) / 20 + (m.iron || 0) / 6);
}
function resOnly(cost) {
  const o = {};
  for (const k of ['meat', 'wood', 'coal', 'iron']) if (cost[k] > 0) o[k] = cost[k];
  return o;
}

// ================================================================ state
function newCityState() {
  const now = Game.now();
  return {
    levels: { furnace: 1, shelter: 1, sawmill: 1, hunter: 1, coalmine: 1 },
    stock: { sawmill: 40, hunter: 30, coalmine: 12, ironmine: 0 },
    workers: { sawmill: 2, hunter: 2, coalmine: 2, ironmine: 0 },
    pop: { total: 6, sick: 0, arr: 14, sk: 0, hl: 0 },
    mode: 'on',
    noCoal: false,
    hungry: false,
    wx: { start: now + 14 * 60e3, end: now + 14 * 60e3 + 120e3, drop: 12, warned: false },
    tut: 0,
    dayOff: Math.round((0.3 - (((now / DAY_MS) % 1) + 1) % 1) * DAY_MS),
    stats: { collected: 0, built: 0 },
    lastSickToast: 0,
  };
}
function migrateCity(c) {
  if (!c || typeof c !== 'object') return newCityState();
  const lv = {};
  for (const id of ORDER) {
    const v = Math.floor(Number(c.levels?.[id]) || 0);
    if (v > 0) lv[id] = clamp(v, 1, FMAX);
  }
  lv.furnace = Math.max(1, lv.furnace || 1);
  for (const id of ORDER) if (id !== 'furnace' && lv[id] > lv.furnace) lv[id] = lv.furnace;
  c.levels = lv;
  for (const k of ['stock', 'workers']) if (!c[k] || typeof c[k] !== 'object') c[k] = {};
  const p = c.pop && typeof c.pop === 'object' ? c.pop : {};
  p.total = Math.max(1, Math.floor(Number(p.total) || 6));
  p.sick = clamp(Math.floor(Number(p.sick) || 0), 0, p.total);
  for (const k of ['arr', 'sk', 'hl']) p[k] = Math.max(0, Number(p[k]) || 0);
  c.pop = p;
  let assigned = 0;
  for (const id of PROD_IDS) {
    c.stock[id] = Math.max(0, Number(c.stock[id]) || 0);
    const w = clamp(Math.floor(Number(c.workers[id]) || 0), 0, slots(lv[id] || 0));
    c.workers[id] = Math.min(w, Math.max(0, p.total - assigned));
    assigned += c.workers[id];
  }
  if (!MODES[c.mode]) c.mode = 'on';
  if (!c.wx || typeof c.wx !== 'object' || !Number.isFinite(c.wx.start)) {
    const now = Game.now();
    c.wx = { start: now + 10 * 60e3, end: now + 10 * 60e3 + 120e3, drop: 12, warned: false };
  }
  if (!c.stats || typeof c.stats !== 'object') c.stats = { collected: 0, built: 0 };
  c.dayOff = Number.isFinite(c.dayOff) ? c.dayOff : 0;
  return c;
}

// ================================================================ derived values (runtime only, never saved)
const ENV = { outside: -17, inside: 3, heat: 20, comfort: 'warm', lit: true, bz: 0, dark: 0, phase: 0.5, warnIn: 0, bzLeft: 0 };

function dayPhase(now) { const off = Game.S?.city?.dayOff || 0; return ((((now + off) / DAY_MS) % 1) + 1) % 1; }
function darknessAt(ph) {
  const d = Math.cos(TAU * ph); // 1 at midnight, -1 at noon
  return clamp((d + 0.1) / 0.75, 0, 1);
}
function blizzardIntensity(now) {
  const w = C().wx;
  if (now < w.start || now >= w.end) return 0;
  return clamp(Math.min((now - w.start) / 12e3, (w.end - now) / 12e3, 1), 0, 1);
}
function computeEnv(now, lit) {
  const c = C();
  const ph = dayPhase(now);
  const bz = blizzardIntensity(now);
  const outside = -17 + 6 * Math.sin(TAU * (ph - 0.25)) - bz * (c.wx.drop || 12);
  const heat = lit ? heatOf(lvl('furnace') || 1, c.mode) : 0;
  const inside = outside + heat;
  const comfort = inside >= 0 ? 'warm' : inside >= -8 ? 'chilly' : inside >= -16 ? 'cold' : 'freezing';
  ENV.outside = outside;
  ENV.inside = inside;
  ENV.heat = heat;
  ENV.comfort = comfort;
  ENV.lit = lit;
  ENV.bz = bz;
  ENV.dark = darknessAt(ph);
  ENV.phase = ph;
  ENV.warnIn = now < c.wx.start ? (c.wx.start - now) / 1000 : 0;
  ENV.bzLeft = now >= c.wx.start && now < c.wx.end ? (c.wx.end - now) / 1000 : 0;
  return ENV;
}
// coldest the inside gets during the coming (or current) blizzard in this Furnace mode: night low minus the storm
function blizzardLow(mode) {
  const c = C();
  return -23 - (c.wx.drop || 12) + (c.noCoal ? 0 : heatOf(lvl('furnace') || 1, mode));
}
// warn only when the storm would actually push the city below freezing
function blizzardThreat() { return blizzardLow(C().mode) < 0; }
function refreshEnv() {
  if (!Game.S) return ENV;
  const c = C();
  const lit = c.mode !== 'off' && !c.noCoal;
  return computeEnv(Game.now(), lit);
}

function assigned() {
  const c = C();
  let a = 0;
  for (const id of PROD_IDS) a += c.workers[id] || 0;
  return a;
}
function healthy() { const p = C().pop; return Math.max(0, p.total - p.sick); }
function idle() { return Math.max(0, C().pop.total - assigned()); }
function workFactor() {
  const a = assigned();
  return a > 0 ? Math.min(1, healthy() / a) : 0;
}
function efficiency() {
  const pct = Number(Game.perk('productionPct')) || 0;
  return COMFORT[ENV.comfort].eff * (C().hungry ? HUNGRY_EFF : 1) * (1 + pct / 100);
}
function rateOf(id) {
  if (lvl(id) < 1) return 0;
  return perWorkerAt(id, lvl(id)) * (C().workers[id] || 0) * workFactor() * efficiency();
}
function productionOf(type) {
  const id = Object.keys(PRODUCERS).find(k => PRODUCERS[k] === type);
  return id ? rateOf(id) : 0;
}
function freeSlots() {
  let n = 0;
  for (const id of PROD_IDS) n += Math.max(0, slots(lvl(id)) - (C().workers[id] || 0));
  return n;
}
function bubbleThreshold(id) {
  const r = rateOf(id);
  const cap = storageCap(id);
  return Math.max(1, Math.min(cap * 0.5, (r * 120) / 3600));
}
function arrivalNeed(total) { return 20 + 2.5 * total; }

// ================================================================ simulation
function takeRes(type, buildingId, amount) {
  if (!(amount > 0)) return 0;
  const s = Game.S;
  let took = Math.min(amount, Math.max(0, s.res[type] || 0));
  s.res[type] = (s.res[type] || 0) - took;
  if (took < amount && buildingId) {
    const st = C().stock;
    const more = Math.min(amount - took, Math.max(0, st[buildingId] || 0));
    st[buildingId] = (st[buildingId] || 0) - more;
    took += more;
  }
  return took;
}

function stepWeather(now, quiet) {
  const c = C();
  const w = c.wx;
  let guard = 0;
  while (now >= w.end && guard++ < 500) {
    const gap = (18 + Math.random() * 14) * 60e3;
    const dur = (90 + Math.random() * 60) * 1000;
    w.start = w.end + gap;
    w.end = w.start + dur;
    w.drop = Math.round(10 + 0.6 * (lvl('furnace') || 1) + Math.random() * 4);
    w.warned = false;
  }
  if (!w.warned && now >= w.start - 45e3 && now < w.end) {
    w.warned = true;
    if (!quiet) {
      if (blizzardThreat()) Game.toast(now < w.start ? 'A blizzard is coming. Keep the Furnace hot.' : 'A blizzard has hit the city.', 'bad');
      Game.emit('city:blizzard', { start: w.start, end: w.end });
    }
  }
}

function simulate(dt, now, quiet) {
  const s = Game.S;
  const c = s.city;
  stepWeather(now, quiet);
  // furnace
  let lit = c.mode !== 'off';
  if (lit) {
    const need = (burnPerHour() * dt) / 3600;
    const took = takeRes('coal', 'coalmine', need);
    if (took < need * 0.999) lit = false;
  }
  const wasOut = c.noCoal;
  c.noCoal = c.mode !== 'off' && !lit;
  if (c.noCoal && !wasOut && !quiet) Game.toast('The Furnace is out of Coal. Collect Coal to relight it.', 'bad');
  const env = computeEnv(now, lit);
  // food
  const eat = (eatPerHour() * dt) / 3600;
  const ate = takeRes('meat', 'hunter', eat);
  c.hungry = eat > 0 && ate < eat * 0.999;
  // production fills the buildings
  const wf = workFactor();
  const eff = efficiency();
  for (const id of PROD_IDS) {
    const L = lvl(id);
    if (L < 1) continue;
    const cap = capAt(id, L);
    const cur = c.stock[id] || 0;
    if (cur >= cap) continue;
    const r = perWorkerAt(id, L) * (c.workers[id] || 0) * wf * eff;
    c.stock[id] = Math.min(cap, cur + (r * dt) / 3600);
  }
  // survivors
  const p = c.pop;
  const comfy = env.comfort === 'warm' || env.comfort === 'chilly';
  if (p.total < popCap() && comfy && !c.hungry) {
    p.arr += dt;
    let need = arrivalNeed(p.total);
    while (p.arr >= need && p.total < popCap()) {
      p.arr -= need;
      p.total += 1;
      Game.emit('survivor:arrived', {});
      if (!quiet) View.onArrival();
      need = arrivalNeed(p.total);
    }
    if (p.total >= popCap()) p.arr = 0;
  }
  let sickRate = 0;
  if (env.comfort === 'cold') sickRate += 1 / 75;
  if (env.comfort === 'freezing') sickRate += 1 / 30;
  if (c.hungry) sickRate += 1 / 60;
  const maxSick = Math.floor(p.total * 0.75);
  if (sickRate > 0 && p.sick < maxSick) {
    p.sk += dt * sickRate;
    let fell = 0;
    while (p.sk >= 1 && p.sick < maxSick) { p.sk -= 1; p.sick += 1; fell += 1; }
    if (fell && !quiet && now - (c.lastSickToast || 0) > 90e3) {
      c.lastSickToast = now;
      Game.toast(c.hungry ? 'Survivors are falling sick from hunger. Collect Meat.' : 'Survivors are falling sick from the cold. Heat the Furnace.', 'bad');
    }
  } else {
    p.sk = Math.min(p.sk, 0.9);
  }
  let healRate = 0;
  const inf = lvl('infirmary');
  if (inf > 0) healRate += 1 / healSecAt(inf);
  if (comfy && !c.hungry) healRate += 1 / 150;
  if (p.sick > 0 && healRate > 0) {
    p.hl += dt * healRate;
    while (p.hl >= 1 && p.sick > 0) { p.hl -= 1; p.sick -= 1; }
  }
  if (p.sick === 0) p.hl = 0;
}

function tick(dt, now) {
  if (!Game.S) return;
  let left = Math.max(0, dt);
  let t = now - left * 1000;
  while (left > 0) {
    const step = Math.min(15, left);
    left -= step;
    t += step * 1000;
    simulate(step, t, false);
  }
  // the landscape dock shows shortcut buttons on every tab, but the city screen update only runs on the City tab
  if (Game.isLandscape?.() && Game.screen?.() !== 'city' && View.mounted()) View.updateSideBadges();
}
function offline(sec) {
  if (!Game.S || !(sec > 0)) return;
  const now = Game.now();
  let left = sec;
  let t = now - sec * 1000;
  const before = { total: C().pop.total, stock: { ...C().stock } };
  while (left > 0) {
    const step = Math.min(15, left);
    left -= step;
    t += step * 1000;
    simulate(step, t, true);
  }
  View.offlineNote(before, sec);
}

// ================================================================ build queue and actions
const timerId = id => 'build:' + id;
function buildTimer(id) { return Game.timers.get(timerId(id)); }
function activeBuilds() { return Game.timers.list('build'); }
function builders() { return Game.perk('builders'); }
function builderFree() { return activeBuilds().length < builders(); }

function upgradeState(id) {
  const L = lvl(id);
  const next = L + 1;
  if (buildTimer(id)) return { s: 'building', L, next };
  if (!isUnlocked(id)) return { s: 'locked', L, next, need: B[id].unlock, reqs: reqsFor(id, next) };
  if (L >= FMAX) return { s: 'max', L, next };
  const reqs = reqsFor(id, next);
  const cost = upgradeCost(id, next);
  if (reqs.some(r => !r.met)) return { s: 'reqs', L, next, reqs, cost };
  return { s: 'ok', L, next, reqs, cost, afford: Game.has(cost), builder: builderFree() };
}
function canUpgradeNow(id) {
  const st = upgradeState(id);
  return st.s === 'ok' && st.afford && st.builder;
}

function startUpgrade(id) {
  if (!Game.S || !B[id]) return false;
  const st = upgradeState(id);
  if (st.s !== 'ok') return false;
  if (!st.builder) { busySheet(); return false; }
  if (!st.afford) { shortSheet(id); return false; }
  if (!Game.spend(st.cost, 'build:' + id)) return false;
  const secs = upgradeTime(id, st.next);
  Game.timers.start({
    id: timerId(id),
    kind: 'build',
    label: `${B[id].name} Lv ${st.next}`,
    durationSec: secs,
    data: { building: id, level: st.next },
  });
  C().tut = 1;
  Game.emit('building:started', { id, level: st.next });
  View.requestDraw();
  return true;
}

function finishLevel(id, L) {
  const c = C();
  if (lvl(id) >= L) return;
  c.levels[id] = L;
  c.stats.built = (c.stats.built || 0) + 1;
  if (PRODUCERS[id] && L === 1) {
    const n = Math.min(slots(1), idle());
    if (n > 0) c.workers[id] = (c.workers[id] || 0) + n;
  }
  Game.emit('building:upgraded', { id, level: L });
  Game.toast(L === 1 ? `${B[id].name} built` : `${B[id].name} upgraded to Lv ${L}`, 'good');
  View.onLevelUp(id, L);
}

Game.timers.onComplete('build', t => {
  const id = t?.data?.building;
  const L = Number(t?.data?.level);
  if (!B[id] || !Number.isFinite(L)) return;
  finishLevel(id, L);
});

function instantInfo(id) {
  const st = upgradeState(id);
  if (st.s !== 'ok') return null;
  const missing = resOnly(Game.missing(st.cost));
  const secs = upgradeTime(id, st.next);
  return { st, missing, secs, gems: gemsForRes(missing) + Game.gemCostForSeconds(secs) };
}
function instantSheet(id) {
  const info = instantInfo(id);
  if (!info) return;
  const parts = [];
  const miss = Object.entries(info.missing);
  if (miss.length) parts.push(`covers the ${miss.map(([k, v]) => `<b>${Game.fmtFull(v)} ${esc(resName(k))}</b>`).join(', ')} you are missing`);
  parts.push(`skips the <b>${fmtT(info.secs)}</b> build`);
  Game.confirmSheet({
    title: 'Instant upgrade',
    message: `Finish <b>${esc(B[id].name)} Lv ${info.st.next}</b> now for ${Game.icon('gem', 16)} <b>${Game.fmtFull(info.gems)}</b> Gems. This ${parts.join(' and ')}. No builder needed.`,
    confirmLabel: 'Upgrade now',
    kind: 'gold',
    onConfirm: () => instantUpgrade(id),
  });
}
function instantUpgrade(id) {
  const info = instantInfo(id);
  if (!info) return false;
  if ((Game.S.res.gems || 0) < info.gems) { Game.needGems(info.gems); return false; }
  const have = {};
  for (const [k, v] of Object.entries(resOnly(info.st.cost))) have[k] = Math.min(v, Math.floor(Game.S.res[k] || 0));
  if (!Game.spend({ ...have, gems: info.gems }, 'instant:' + id)) { Game.needGems(info.gems); return false; }
  C().tut = 1;
  Game.emit('building:started', { id, level: info.st.next });
  finishLevel(id, info.st.next);
  return true;
}

function collect(id, quiet) {
  if (!Game.S || !PRODUCERS[id]) return 0;
  const c = C();
  const amt = Math.floor(c.stock[id] || 0);
  if (amt < 1) return 0;
  c.stock[id] -= amt;
  const r = PRODUCERS[id];
  Game.grant({ [r]: amt }, { source: 'collect' });
  c.stats.collected = (c.stats.collected || 0) + 1;
  Game.emit('resources:collected', { type: r, amount: amt });
  if (!quiet) View.onCollect(id, r, amt);
  return amt;
}
function collectAll() {
  let n = 0;
  for (const id of PROD_IDS) if ((C().stock[id] || 0) >= 1) n += collect(id) > 0 ? 1 : 0;
  return n;
}

function setWorkers(id, n) {
  if (!Game.S || !PRODUCERS[id]) return;
  const c = C();
  const others = assigned() - (c.workers[id] || 0);
  c.workers[id] = clamp(Math.floor(n), 0, Math.min(slots(lvl(id)), c.pop.total - others));
  View.requestDraw();
}
function autoAssign() {
  if (!Game.S) return 0;
  const c = C();
  const ids = PROD_IDS.filter(id => lvl(id) > 0);
  const prio = { coalmine: 0, hunter: 1, sawmill: 2, ironmine: 3 };
  for (const id of PROD_IDS) c.workers[id] = 0;
  let left = c.pop.total;
  while (left > 0) {
    let best = null;
    let bestScore = Infinity;
    for (const id of ids) {
      const s = slots(lvl(id));
      if (c.workers[id] >= s) continue;
      const score = c.workers[id] / s + prio[id] * 0.001;
      if (score < bestScore) { bestScore = score; best = id; }
    }
    if (!best) break;
    c.workers[best] += 1;
    left -= 1;
  }
  View.requestDraw();
  return assigned();
}
function setMode(m) {
  if (!Game.S || !MODES[m]) return;
  const c = C();
  if (c.mode === m) return;
  c.mode = m;
  if (m !== 'off') c.noCoal = false;
  refreshEnv();
  Game.emit('city:mode', { mode: m });
  Game.toast(m === 'off' ? 'Furnace off. Survivors will get cold.' : m === 'over' ? 'Overdrive: more heat, double Coal.' : 'Furnace on.', m === 'off' ? 'bad' : 'info');
  View.requestDraw();
}

function suggestBuilding() {
  // what an idle builder should do next: the furnace when possible, else the cheapest affordable upgrade
  if (canUpgradeNow('furnace')) return 'furnace';
  let best = null;
  let bestCost = Infinity;
  for (const id of ORDER) {
    const st = upgradeState(id);
    if (st.s !== 'ok' || !st.afford) continue;
    const v = (st.cost.wood || 0) + (st.cost.meat || 0);
    if (v < bestCost) { bestCost = v; best = id; }
  }
  if (best) return best;
  const f = upgradeState('furnace');
  if (f.s === 'reqs') return f.reqs.find(r => !r.met)?.id || 'furnace';
  return 'furnace';
}

// ================================================================ perks and power
Game.registerPerk('trainSpeedPct', () => (Game.S ? Object.keys(CAMPS).reduce((a, id) => a + campSpeedAt(lvl(id)), 0) : 0));

function cityPower() {
  if (!Game.S) return 0;
  let p = 0;
  for (const id of ORDER) {
    const L = lvl(id);
    if (!L) continue;
    p += id === 'furnace' ? 150 * L + 12 * L * L : 30 * L + 3 * L * L;
  }
  return p;
}

// ================================================================ effects shown in building sheets
const extraInfo = new Map();   // id -> fn(level) -> [[label, value]] (for other modules)
const extraActions = new Map(); // id -> [{ label, kind, onClick }]
function effectRows(id, L) {
  const rows = [];
  if (id === 'furnace') {
    rows.push(['Heat (On)', L ? `+${Math.round(heatOf(L, 'on'))}°` : '-']);
    rows.push(['Building level cap', `Lv ${L}`]);
    rows.push(['Coal use (On)', L ? `${fmt(Math.round(burnAt(L, 'on')))}/h` : '-']);
  } else if (id === 'shelter') {
    rows.push(['Population cap', String(popCapAt(L))]);
  } else if (PRODUCERS[id]) {
    rows.push([`${resName(PRODUCERS[id])} per worker`, L ? `${fmt(Math.round(perWorkerAt(id, L)))}/h` : '-']);
    rows.push(['Worker slots', String(slots(L))]);
    rows.push(['Storage', L ? fmt(capAt(id, L)) : '-']);
  } else if (id === 'infirmary') {
    rows.push(['Heals', L ? `1 survivor / ${healSecAt(L)}s` : '-']);
  } else if (id === 'storehouse') {
    rows.push(['Storage bonus', `+${storeBonusAt(L)}%`]);
  } else if (CAMPS[id]) {
    rows.push(['Training speed', `+${campSpeedAt(L)}%`]);
  }
  const fn = extraInfo.get(id);
  if (fn) {
    try {
      const more = fn(L);
      if (Array.isArray(more)) for (const r of more) if (Array.isArray(r) && r.length >= 2) rows.push([String(r[0]), String(r[1])]);
    } catch (e) { console.error('[city] building info failed', e); }
  }
  return rows;
}
function unlocksAt(F) { return ORDER.filter(id => id !== 'furnace' && B[id].unlock === F).map(id => B[id].name); }

// ================================================================ drawing: palette and primitives
const COL = {
  logL: '#9a643c', logR: '#714629', logLine: '#583318', logDark: '#3d2412',
  plankL: '#a06e43', plankR: '#76492a',
  stoneL: '#93a0ad', stoneR: '#6f7c8a', stoneTop: '#b6c1cc', stoneLine: '#5c6876',
  roofF: '#f4f8fc', roofF2: '#dce7f1', roofB: '#d2dfeb', roofEdge: '#9fb3c7',
  ironD: '#232a33', iron: '#46515e', ironL: '#6e7b89', rivet: '#a9b5c1',
  pine: '#2f5e55', pineD: '#22453f', pineL: '#3f7669',
  rock: '#7f8c9a', rockD: '#5c6876', rockL: '#a8b4c0',
  coal: '#1f2329', coalL: '#4b535d',
  shadow: 'rgba(48, 78, 118, 0.2)',
  door: '#4a2c17',
  glass: '#3b5168',
  snow: '#f3f8fc',
  snowShade: '#d3e0ec',
};
const TEAM = { infantry: '#c8453a', lancer: '#2f74d6', marksman: '#2e9a5a' };
const FR = { t: 0, dark: 0, lights: null, motion: true, thumb: false, win: COL.glass, smoke: null };

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function fillPoly(ctx, pts, fill, stroke, lw) {
  poly(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
function line(ctx, pts, stroke, lw, cap) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw || 1;
  ctx.lineCap = cap || 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
// iso frame: (u, v) in [-1, 1] over the footprint, z up in px
function iso(x, y, hw, hh) { return (u, v, z = 0) => [x + ((u - v) * hw) / 2, y + ((u + v) * hh) / 2 - z]; }
function light(x, y, r, a = 1) { if (FR.lights) FR.lights.push({ x, y, r, a }); }
function shadow(ctx, x, y, hw, hh) {
  const p = iso(x + hw * 0.18, y + hh * 0.22, hw * 1.12, hh * 1.12);
  fillPoly(ctx, [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)], COL.shadow);
}
// box with visible left (v=1, W->S) and right (u=1, S->E) faces
function block(ctx, x, y, hw, hh, z0, h, c) {
  const p = iso(x, y, hw, hh);
  fillPoly(ctx, [p(-1, 1, z0), p(1, 1, z0), p(1, 1, z0 + h), p(-1, 1, z0 + h)], c.l, c.e, 1);
  fillPoly(ctx, [p(1, 1, z0), p(1, -1, z0), p(1, -1, z0 + h), p(1, 1, z0 + h)], c.r, c.e, 1);
  if (c.t) fillPoly(ctx, [p(-1, -1, z0 + h), p(1, -1, z0 + h), p(1, 1, z0 + h), p(-1, 1, z0 + h)], c.t, c.e, 1);
  return p;
}
function quadL(p, s0, s1, z0, z1) { return [p(-1 + 2 * s0, 1, z0), p(-1 + 2 * s1, 1, z0), p(-1 + 2 * s1, 1, z1), p(-1 + 2 * s0, 1, z1)]; }
function quadR(p, s0, s1, z0, z1) { return [p(1, 1 - 2 * s0, z0), p(1, 1 - 2 * s1, z0), p(1, 1 - 2 * s1, z1), p(1, 1 - 2 * s0, z1)]; }
function hLines(ctx, p, z0, z1, step, color) {
  ctx.beginPath();
  for (let z = z0 + step; z < z1 - 1; z += step) {
    const a = p(-1, 1, z); const b = p(1, 1, z); const c2 = p(1, -1, z);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0], c2[1]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}
function windowOn(ctx, pts) {
  fillPoly(ctx, pts, COL.logDark);
  const inner = shrinkQuad(pts, 0.18);
  fillPoly(ctx, inner, FR.win);
  const cx = (pts[0][0] + pts[2][0]) / 2;
  const cy = (pts[0][1] + pts[2][1]) / 2;
  line(ctx, [[(inner[0][0] + inner[1][0]) / 2, (inner[0][1] + inner[1][1]) / 2], [(inner[2][0] + inner[3][0]) / 2, (inner[2][1] + inner[3][1]) / 2]], COL.logDark, 0.8);
  light(cx, cy, 16, 0.9);
}
function shrinkQuad(q, f) {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  return q.map(([x, y]) => [x + (cx - x) * f, y + (cy - y) * f]);
}
function snowGrad(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, COL.roofF);
  g.addColorStop(1, COL.roofF2);
  return g;
}
// gable roof; axis 'u': ridge along u (gable end on the right face); axis 'v': ridge along v (gable on the left face)
function roof(ctx, x, y, hw, hh, z, rh, axis, edge, opts = {}) {
  const o = opts.over ?? 0.16;
  const p = iso(x, y, hw * (1 + o), hh * (1 + o));
  const q = iso(x, y, hw, hh);
  const gable = opts.gable || COL.logR;
  if (axis === 'u') {
    const rA = p(-1, 0, z + rh); const rB = p(1, 0, z + rh);
    fillPoly(ctx, [p(-1, -1, z), p(1, -1, z), rB, rA], COL.roofB);
    fillPoly(ctx, [q(1, 1, z), q(1, -1, z), q(1, 0, z + rh * 0.94)], gable, COL.logDark, 0.8);
    fillPoly(ctx, [rA, rB, p(1, 1, z), p(-1, 1, z)], snowGrad(ctx, rA[0], rA[1], p(-1, 1, z)[0], p(-1, 1, z)[1]), COL.roofEdge, 0.8);
    line(ctx, [p(-1, 1, z), p(1, 1, z)], edge, 2.6, 'butt');
    line(ctx, [p(1, 1, z), rB, p(1, -1, z)], edge, 2.2);
    line(ctx, [rA, rB], '#ffffff', 1.4);
    icicles(ctx, p(-1, 1, z - 1.3), p(1, 1, z - 1.3), Math.round(hw / 6));
    return { rA, rB, p };
  }
  const rA = p(0, -1, z + rh); const rB = p(0, 1, z + rh);
  fillPoly(ctx, [p(-1, -1, z), p(-1, 1, z), rB, rA], COL.roofB);
  fillPoly(ctx, [q(-1, 1, z), q(1, 1, z), q(0, 1, z + rh * 0.94)], gable, COL.logDark, 0.8);
  fillPoly(ctx, [rA, rB, p(1, 1, z), p(1, -1, z)], snowGrad(ctx, rA[0], rA[1], p(1, -1, z)[0], p(1, -1, z)[1]), COL.roofEdge, 0.8);
  line(ctx, [p(1, 1, z), p(1, -1, z)], edge, 2.6, 'butt');
  line(ctx, [p(-1, 1, z), rB, p(1, 1, z)], edge, 2.2);
  line(ctx, [rA, rB], '#ffffff', 1.4);
  icicles(ctx, p(1, 1, z - 1.3), p(1, -1, z - 1.3), Math.round(hw / 6));
  return { rA, rB, p };
}
function icicles(ctx, a, b, n) {
  ctx.fillStyle = 'rgba(225, 242, 255, 0.95)';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = lerp(a[0], b[0], t);
    const y = lerp(a[1], b[1], t);
    const len = 2.5 + ((i * 7) % 4);
    ctx.moveTo(x - 1.2, y);
    ctx.lineTo(x + 1.2, y);
    ctx.lineTo(x, y + len);
    ctx.closePath();
  }
  ctx.fill();
}
function chimney(ctx, at, h, smoke) {
  const [x, y] = at;
  block(ctx, x, y, 5, 2.5, 0, h, { l: COL.stoneL, r: COL.stoneR, t: '#3a3f46', e: COL.stoneLine });
  ellipse(ctx, x, y - h - 0.4, 3.8, 1.6, COL.snow);
  if (smoke) emitSmoke(x, y - h - 1, 0.25, 0.6);
}
function flag(ctx, x, y, h, color, w = 16) {
  line(ctx, [[x, y], [x, y - h]], '#5a4632', 1.6);
  ellipse(ctx, x, y - h - 1, 1.6, 1.6, '#e3b04b');
  const t = FR.motion ? FR.t : 0;
  ctx.beginPath();
  const top = y - h + 2;
  ctx.moveTo(x, top);
  for (let i = 0; i <= 6; i++) {
    const fx = x + (w * i) / 6;
    ctx.lineTo(fx, top + Math.sin(t * 4 + i * 0.9) * 1.6 * (i / 6));
  }
  for (let i = 6; i >= 0; i--) {
    const fx = x + (w * i) / 6;
    ctx.lineTo(fx, top + 10 + Math.sin(t * 4 + i * 0.9) * 1.6 * (i / 6));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
}
function snowMound(ctx, x, y, rx, ry) {
  ellipse(ctx, x + 1, y + 1, rx, ry, COL.snowShade);
  ellipse(ctx, x, y, rx, ry, COL.snow);
}
function lump(ctx, x, y, r, c1, c2) {
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r * 0.4, y - r * 0.9);
  ctx.lineTo(x + r * 0.6, y - r * 0.7);
  ctx.lineTo(x + r, y + r * 0.1);
  ctx.lineTo(x + r * 0.2, y + r * 0.6);
  ctx.closePath();
  ctx.fillStyle = c1;
  ctx.fill();
  fillPoly(ctx, [[x - r * 0.4, y - r * 0.9], [x + r * 0.6, y - r * 0.7], [x + r * 0.1, y - r * 0.1]], c2);
}

// smoke particles (world space, shared by the furnace and chimneys)
const smoke = [];
function emitSmoke(x, y, rate, size) {
  if (!FR.smoke) return;
  const key = Math.round(x) + ':' + Math.round(y);
  const acc = (FR.smoke.acc[key] || 0) + FR.smoke.dt * rate * 4;
  FR.smoke.acc[key] = acc % 1;
  for (let i = 0; i < Math.floor(acc); i++) {
    if (smoke.length > 140) smoke.shift();
    smoke.push({ x: x + (Math.random() - 0.5) * 2, y, vx: 4 + Math.random() * 3, vy: -(10 + Math.random() * 6), r: 2.5 * size, g: (5 + Math.random() * 3) * size, life: 0, max: 2.6 + Math.random() * 1.6, dark: size > 1 });
  }
}

// ================================================================ drawing: buildings
function drawBuilding(ctx, id, x, y, L, o = {}) {
  if (L <= 0) { drawPlot(ctx, id, x, y, !o.unlocked); return; }
  switch (id) {
    case 'furnace': drawFurnace(ctx, x, y, L, o); break;
    case 'shelter': drawShelter(ctx, x, y, L); break;
    case 'sawmill': drawSawmill(ctx, x, y, L); break;
    case 'hunter': drawHunter(ctx, x, y, L); break;
    case 'coalmine': drawMine(ctx, x, y, L, false); break;
    case 'ironmine': drawMine(ctx, x, y, L, true); break;
    case 'infirmary': drawInfirmary(ctx, x, y, L); break;
    case 'storehouse': drawStorehouse(ctx, x, y, L); break;
    default: if (CAMPS[id]) drawCamp(ctx, x, y, L, CAMPS[id]);
  }
  if (o.building) drawScaffold(ctx, id, x, y);
}

function drawPlot(ctx, id, x, y, locked) {
  const hw = Math.min(46, (B[id].hb[0] / 2) * 0.82);
  const hh = hw / 2;
  const p = iso(x, y, hw, hh);
  fillPoly(ctx, [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)], locked ? '#cfdbe7' : '#d6e1ec', 'rgba(120,145,170,0.5)', 1);
  // edge stones
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let e = 0; e < 4; e++) {
    const [u0, v0] = corners[e];
    const [u1, v1] = corners[(e + 1) % 4];
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      const [sx, sy] = p(lerp(u0, u1, t), lerp(v0, v1, t));
      block(ctx, sx, sy + 1, 4.2, 2.1, 0, 3.2, { l: COL.stoneL, r: COL.stoneR, t: '#c9d3dc', e: 'rgba(70,85,100,0.5)' });
    }
  }
  snowMound(ctx, x - hw * 0.3, y - 2, hw * 0.34, hh * 0.38);
  snowMound(ctx, x + hw * 0.28, y + hh * 0.2, hw * 0.26, hh * 0.3);
  if (!locked) {
    // stakes, a rope and a plank pile: ready to build
    const stakes = [p(-0.85, -0.85), p(0.85, -0.85), p(0.85, 0.85), p(-0.85, 0.85)];
    ctx.beginPath();
    stakes.forEach((s, i) => { if (i) ctx.lineTo(s[0], s[1] - 7); else ctx.moveTo(s[0], s[1] - 7); });
    ctx.closePath();
    ctx.strokeStyle = '#e0b860';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    for (const s of stakes) line(ctx, [s, [s[0], s[1] - 9]], '#8a5a33', 1.8);
    for (let i = 0; i < 3; i++) block(ctx, x + 8, y + 4 - i * 2.2, 10, 3, 0, 2, { l: '#c69457', r: '#9c6d3c', t: '#d9a96a', e: '#6d4523' });
  }
}

function drawScaffold(ctx, id, x, y) {
  const hw = (B[id].hb[0] / 2) * 0.78;
  const hh = hw / 2;
  const h = B[id].hb[1] * 0.55;
  const p = iso(x, y, hw, hh);
  const posts = [[-1, 1], [0, 1], [1, 1], [1, 0], [1, -1]];
  ctx.save();
  ctx.globalAlpha = 0.95;
  for (const [u, v] of posts) line(ctx, [p(u, v, 0), p(u, v, h)], '#b07b45', 2);
  for (const z of [h * 0.35, h * 0.7, h]) line(ctx, [p(-1, 1, z), p(1, 1, z), p(1, -1, z)], '#c98f52', 1.6);
  line(ctx, [p(-1, 1, 0), p(0, 1, h * 0.7)], '#9a6a3a', 1.1);
  line(ctx, [p(1, 1, 0), p(1, 0, h * 0.7)], '#9a6a3a', 1.1);
  ctx.restore();
}

function drawFurnace(ctx, x, y, L, o) {
  const tier = tierOf(L);
  const sc = 1 + tier * 0.05;
  const lit = o.lit !== false && o.mode !== 'off';
  const over = lit && o.mode === 'over';
  const t = FR.motion ? FR.t : 0;
  const flick = lit ? 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 3.7 + 1) : 0;
  // platform (octagon drum)
  const R = 74;
  const Ry = R * 0.5;
  const ph = 9;
  ellipse(ctx, x + 10, y + 7, R * 1.04, Ry * 1.04, COL.shadow);
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * TAU; pts.push([x + Math.cos(a) * R, y + Math.sin(a) * Ry]); }
  for (let i = 0; i < 8; i++) {
    const a0 = pts[i]; const a1 = pts[(i + 1) % 8];
    const mid = ((i + 1) / 8) * TAU;
    if (Math.sin(mid) < -0.05) continue;
    fillPoly(ctx, [[a0[0], a0[1] - ph], [a1[0], a1[1] - ph], a1, a0], Math.cos(mid) < 0 ? '#8d9aa8' : '#6c7988', 'rgba(60,72,86,0.6)', 0.8);
  }
  const top = pts.map(([px, py]) => [px, py - ph]);
  fillPoly(ctx, top, '#aeb9c5', 'rgba(70,84,100,0.7)', 1);
  const inner = pts.map(([px, py]) => [x + (px - x) * 0.8, y - ph + (py - y) * 0.8]);
  fillPoly(ctx, inner, '#9eabb8', 'rgba(70,84,100,0.45)', 0.8);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { ctx.moveTo(inner[i][0], inner[i][1]); ctx.lineTo(top[i][0], top[i][1]); }
  ctx.strokeStyle = 'rgba(70,84,100,0.4)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // steps at the front
  for (let i = 0; i < 2; i++) block(ctx, x, y + Ry - 2 + i * 3, 16 - i * 2, 8 - i, 0, ph - 3 - i * 3, { l: '#97a4b1', r: '#748190', t: '#bcc6d0', e: 'rgba(60,72,86,0.6)' });
  // snow patches on the rim
  for (const a of [0.9, 2.3, 3.6, 5.2]) snowMound(ctx, x + Math.cos(a) * R * 0.86, y - ph + Math.sin(a) * Ry * 0.86, 10, 3.2);
  // coal pile
  const cpx = x - 50; const cpy = y + 6 - ph;
  ellipse(ctx, cpx, cpy + 2, 16, 6, '#2a2f36');
  for (let i = 0; i < 9; i++) lump(ctx, cpx - 11 + (i % 5) * 5.5, cpy - Math.floor(i / 5) * 4 - (i % 2), 3.4, COL.coal, COL.coalL);
  // body
  const by = y - ph;
  const rx = 44 * sc; const ry = rx * 0.5; const bh = 60 * sc;
  const g = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
  g.addColorStop(0, '#262d36'); g.addColorStop(0.22, '#59656f'); g.addColorStop(0.42, '#71808d'); g.addColorStop(0.75, '#3a444f'); g.addColorStop(1, '#1e242b');
  ctx.beginPath();
  ctx.moveTo(x - rx, by - bh);
  ctx.lineTo(x - rx, by);
  ctx.ellipse(x, by, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + rx, by - bh);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  // pipes (tier 1+)
  if (tier >= 1) {
    for (const s of [-1, 1]) {
      const px = x + s * (rx - 4);
      line(ctx, [[px, by - bh * 0.62], [px + s * 16, by - bh * 0.62], [px + s * 16, by + 8]], '#2c333c', 7);
      line(ctx, [[px, by - bh * 0.62], [px + s * 16, by - bh * 0.62], [px + s * 16, by + 8]], '#68747f', 3.2);
      ellipse(ctx, px + s * 16, by + 8, 5.5, 2.6, '#3a424c');
    }
  }
  // bands and rivets
  const band = tier >= 2 ? '#c9952f' : '#1b2127';
  const rivet = tier >= 2 ? '#ffe08a' : COL.rivet;
  for (const z of [10, bh * 0.52, bh - 3]) {
    ctx.beginPath();
    ctx.ellipse(x, by - z, rx + 0.5, ry + 0.3, 0, Math.PI, 0, true);
    ctx.strokeStyle = band;
    ctx.lineWidth = 4;
    ctx.stroke();
    for (let i = 1; i < 10; i++) {
      const a = Math.PI - (i / 10) * Math.PI;
      ellipse(ctx, x + Math.cos(a) * rx, by - z + Math.sin(a) * ry, 1.2, 1.2, rivet);
    }
  }
  // gauge (tier 1+)
  if (tier >= 1) {
    ellipse(ctx, x + rx * 0.62, by - bh * 0.72, 6, 6, '#dfe6ec');
    ctx.beginPath(); ctx.arc(x + rx * 0.62, by - bh * 0.72, 6, 0, TAU); ctx.strokeStyle = '#2a3038'; ctx.lineWidth = 1.4; ctx.stroke();
    line(ctx, [[x + rx * 0.62, by - bh * 0.72], [x + rx * 0.62 + 3.5, by - bh * 0.72 - (over ? 3 : 1)]], '#c0392b', 1.2);
  }
  // fire door
  const dw = 34 * sc; const dh = 32 * sc; const db = by + ry - 3;
  const arch = (w, h, b) => {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, b);
    ctx.lineTo(x - w / 2, b - h + w / 2);
    ctx.arc(x, b - h + w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(x + w / 2, b);
    ctx.closePath();
  };
  arch(dw + 9, dh + 6, db + 1);
  ctx.fillStyle = tier >= 2 ? '#8a6420' : '#1f252c';
  ctx.fill();
  arch(dw, dh, db);
  if (lit) {
    const fg = ctx.createRadialGradient(x, db - dh * 0.3, 2, x, db - dh * 0.35, dh * 0.9);
    fg.addColorStop(0, '#fff6c8'); fg.addColorStop(0.3 * flick, '#ffc24a'); fg.addColorStop(0.7, over ? '#ff5a12' : '#ff6c1c'); fg.addColorStop(1, '#8f2508');
    ctx.fillStyle = fg;
  } else {
    ctx.fillStyle = '#1b1f25';
  }
  ctx.fill();
  if (!lit) ellipse(ctx, x, db - 4, dw * 0.32, 3, 'rgba(255,110,40,0.35)');
  ctx.save();
  arch(dw, dh, db);
  ctx.clip();
  ctx.strokeStyle = 'rgba(30,14,6,0.55)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) { ctx.moveTo(x + i * dw * 0.26, db); ctx.lineTo(x + i * dw * 0.26, db - dh); }
  ctx.stroke();
  ctx.restore();
  if (lit) light(x, db - dh * 0.4, 70 * (over ? 1.25 : 1), 1.1 * flick);
  // dome
  const dTop = by - bh;
  const dH = 26 * sc;
  const dg = ctx.createRadialGradient(x - rx * 0.35, dTop - dH * 0.7, 2, x, dTop - dH * 0.2, rx * 1.2);
  dg.addColorStop(0, '#8d9aa7'); dg.addColorStop(0.45, '#4e5a66'); dg.addColorStop(1, '#232a32');
  ctx.beginPath();
  ctx.moveTo(x - rx, dTop);
  ctx.bezierCurveTo(x - rx, dTop - dH * 1.35, x + rx, dTop - dH * 1.35, x + rx, dTop);
  ctx.ellipse(x, dTop, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = dg;
  ctx.fill();
  // snow cap on the dome
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.78, dTop - dH * 0.55);
  ctx.bezierCurveTo(x - rx * 0.6, dTop - dH * 1.15, x + rx * 0.5, dTop - dH * 1.15, x + rx * 0.7, dTop - dH * 0.6);
  ctx.bezierCurveTo(x + rx * 0.4, dTop - dH * 0.75, x + rx * 0.1, dTop - dH * 0.55, x - rx * 0.15, dTop - dH * 0.7);
  ctx.bezierCurveTo(x - rx * 0.4, dTop - dH * 0.55, x - rx * 0.6, dTop - dH * 0.7, x - rx * 0.78, dTop - dH * 0.55);
  ctx.fillStyle = 'rgba(240,247,252,0.92)';
  ctx.fill();
  // chimney
  const cx = x + 4; const cTop = dTop - dH * 0.85;
  const crx = 11; const cry = 5.5; const ch = (48 + tier * 8) * sc;
  const cg = ctx.createLinearGradient(cx - crx, 0, cx + crx, 0);
  cg.addColorStop(0, '#262d36'); cg.addColorStop(0.35, '#66727e'); cg.addColorStop(1, '#1f252c');
  ctx.beginPath();
  ctx.moveTo(cx - crx, cTop - ch);
  ctx.lineTo(cx - crx, cTop);
  ctx.ellipse(cx, cTop, crx, cry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + crx, cTop - ch);
  ctx.closePath();
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cTop - ch * 0.45, crx + 0.4, cry, 0, Math.PI, 0, true);
  ctx.strokeStyle = band;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ellipse(ctx, cx, cTop - ch, crx + 4, cry + 2, tier >= 2 ? '#b98a2a' : '#3b444e');
  ellipse(ctx, cx, cTop - ch, crx + 1, cry, lit ? (over ? '#ff7a2a' : '#c4501c') : '#15191e');
  if (tier >= 3) {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i / 4) * Math.PI;
      const sx = cx + Math.cos(a) * (crx + 3); const sy = cTop - ch + Math.sin(a) * (cry + 1.5);
      fillPoly(ctx, [[sx - 2.4, sy], [sx + 2.4, sy], [sx, sy - 7]], '#f0c040', '#9a6512', 0.6);
    }
  }
  if (lit) {
    light(cx, cTop - ch, 26, 0.8);
    emitSmoke(cx, cTop - ch - 2, over ? 2.2 : 1.4, 1.6);
  }
  // banners on the platform (tier 2+)
  if (tier >= 2) {
    flag(ctx, x - R + 8, y - ph + 2, 42, '#d8433b', 14);
    flag(ctx, x + R - 8, y - ph + 2, 42, '#d8433b', 14);
  }
}

function drawShelter(ctx, x, y, L) {
  const n = L >= 7 ? 3 : L >= 3 ? 2 : 1;
  const spots = n === 1 ? [[0, 2, 1.18]] : n === 2 ? [[-22, -4, 1], [22, 6, 1]] : [[-26, -8, 1], [24, -2, 1], [0, 14, 1]];
  spots.sort((a, b) => a[1] - b[1]);
  for (const [dx, dy, s] of spots) cabin(ctx, x + dx, y + dy, L, s);
  // firewood stack
  for (let i = 0; i < 3; i++) block(ctx, x - 44, y + 10 - i * 3, 9, 4.5, 0, 3, { l: '#b5844e', r: '#8a5f33', t: '#e2c08d', e: '#5d3a1c' });
}
function cabin(ctx, x, y, L, s) {
  const hw = 24 * s; const hh = hw / 2; const h = 17 * s;
  const stone = L >= 10;
  shadow(ctx, x, y, hw, hh);
  let z0 = 0;
  if (stone) { block(ctx, x, y, hw, hh, 0, 5, { l: COL.stoneL, r: COL.stoneR, e: COL.stoneLine }); z0 = 5; }
  const p = block(ctx, x, y, hw, hh, z0, h, { l: COL.logL, r: COL.logR, e: COL.logLine });
  hLines(ctx, p, z0, z0 + h, 3.4, 'rgba(60,32,14,0.55)');
  fillPoly(ctx, quadL(p, 0.38, 0.62, z0, z0 + 12 * s), COL.door, COL.logDark, 0.8);
  ellipse(ctx, p(0.15, 1, z0 + 6 * s)[0], p(0.15, 1, z0 + 6 * s)[1], 0.8, 0.8, '#e3b04b');
  windowOn(ctx, quadR(p, 0.3, 0.62, z0 + 6 * s, z0 + 12.5 * s));
  const r = roof(ctx, x, y, hw, hh, z0 + h, 15 * s, 'v', L >= 15 ? '#8a3a2a' : '#6b4127');
  chimney(ctx, r.p(-0.45, -0.25, z0 + h + 9 * s), 9 * s, true);
}

function drawSawmill(ctx, x, y, L) {
  const tier = tierOf(L);
  const hw = 38; const hh = 19; const h = 22;
  shadow(ctx, x, y, hw, hh);
  block(ctx, x, y, hw + 4, hh + 2, 0, 4, { l: '#8d6038', r: '#6b4526', t: '#b98a58', e: COL.logLine });
  const p = block(ctx, x, y, hw, hh, 4, h, { l: COL.plankL, r: COL.plankR, e: COL.logLine });
  // vertical planks
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    const a = p(1, 1 - (2 * i) / 10, 4); const b = p(1, 1 - (2 * i) / 10, 4 + h);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.strokeStyle = 'rgba(60,32,14,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // open front with the saw
  fillPoly(ctx, quadL(p, 0.1, 0.9, 4, 4 + h - 5), '#2f2118');
  fillPoly(ctx, quadL(p, 0.1, 0.9, 4, 7), '#4a3424');
  const sc = p(0.05, 1, 4 + 10);
  const spin = FR.motion ? FR.t * 6 : 0;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = spin + (i / 24) * TAU;
    const r = i % 2 ? 6.5 : 8;
    ctx.lineTo(sc[0] + Math.cos(a) * r, sc[1] + Math.sin(a) * r * 0.9);
  }
  ctx.closePath();
  ctx.fillStyle = '#c9d3dc';
  ctx.fill();
  ellipse(ctx, sc[0], sc[1], 2, 2, '#59636d');
  // log on the bench
  line(ctx, [p(-0.75, 1, 8), p(0.75, 1, 8)], '#8a5a33', 5);
  ellipse(ctx, p(-0.75, 1, 8)[0], p(-0.75, 1, 8)[1], 2.6, 2.6, '#e8c58f');
  light(sc[0], sc[1] - 2, 18, 0.6);
  roof(ctx, x, y, hw, hh, 4 + h, 15, 'u', '#7a4a2a', { gable: COL.plankR });
  // log piles
  logPile(ctx, x + hw + 10, y + 6, tier >= 1 ? 3 : 2);
  if (tier >= 2) logPile(ctx, x - hw - 6, y + 14, 2);
  // sawdust
  ellipse(ctx, x - 6, y + hh + 9, 12, 3.5, 'rgba(214,176,118,0.55)');
}
function logPile(ctx, x, y, rows) {
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < rows - r; i++) {
      const lx = x + (i - (rows - r - 1) / 2) * 8.4;
      const ly = y - r * 7;
      line(ctx, [[lx - 9, ly - 4.5], [lx, ly]], '#7b4f2b', 7.4, 'butt');
      ellipse(ctx, lx, ly, 4.3, 4.3, '#e5c38c');
      ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, TAU); ctx.strokeStyle = '#b8874f'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(lx, ly, 4.3, 0, TAU); ctx.strokeStyle = '#6b4421'; ctx.lineWidth = 0.9; ctx.stroke();
    }
  }
  snowMound(ctx, x - 3, y - rows * 7 + 3, 6, 2.2);
}

function drawHunter(ctx, x, y, L) {
  const tier = tierOf(L);
  if (tier >= 1) tent(ctx, x + 34, y - 10, 1);
  const hw = 26; const hh = 13; const h = 16;
  shadow(ctx, x, y, hw, hh);
  const p = block(ctx, x, y, hw, hh, 0, h, { l: COL.logL, r: COL.logR, e: COL.logLine });
  hLines(ctx, p, 0, h, 3.2, 'rgba(60,32,14,0.55)');
  fillPoly(ctx, quadL(p, 0.36, 0.64, 0, 12), COL.door, COL.logDark, 0.8);
  windowOn(ctx, quadR(p, 0.35, 0.65, 6, 12));
  const r = roof(ctx, x, y, hw, hh, h, 16, 'v', '#8b6a44', { gable: '#a88257' });
  // antlers over the door
  const a = p(0, 1, h + 9);
  ctx.strokeStyle = '#efe4cd';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(a[0] + s * 7, a[1] - 2, a[0] + s * 8, a[1] - 9);
    ctx.moveTo(a[0] + s * 5, a[1] - 2.5);
    ctx.lineTo(a[0] + s * 3, a[1] - 7);
    ctx.moveTo(a[0] + s * 7.4, a[1] - 5.5);
    ctx.lineTo(a[0] + s * 10.5, a[1] - 8);
  }
  ctx.stroke();
  ellipse(ctx, a[0], a[1] + 0.5, 2.2, 1.6, '#c9b896');
  chimney(ctx, r.p(-0.4, -0.3, h + 9), 7, true);
  // drying rack with meat
  const rx = x - hw - 10; const ry = y + 8;
  line(ctx, [[rx - 8, ry], [rx - 8, ry - 20]], '#6b4427', 2);
  line(ctx, [[rx + 10, ry + 6], [rx + 10, ry - 14]], '#6b4427', 2);
  line(ctx, [[rx - 9, ry - 19], [rx + 11, ry - 13]], '#6b4427', 1.8);
  for (let i = 0; i < 3; i++) {
    const mx = rx - 4 + i * 6.5; const my = ry - 16 + i * 2;
    line(ctx, [[mx, my], [mx, my + 3]], '#d8cbb0', 0.8);
    ellipse(ctx, mx, my + 6, 2.8, 4, i === 1 ? '#a8742f' : '#c4513a');
    ellipse(ctx, mx - 0.8, my + 5, 1, 1.6, 'rgba(255,170,140,0.6)');
  }
  // fire pit
  const fx = x + 8; const fy = y + hh + 12;
  ellipse(ctx, fx, fy, 7, 3.2, '#6c747e');
  ellipse(ctx, fx, fy, 4.8, 2.2, '#2a2420');
  const fl = FR.motion ? Math.sin(FR.t * 10) : 0;
  fillPoly(ctx, [[fx - 3, fy], [fx, fy - 7 - fl], [fx + 3, fy]], '#ff8a2a');
  fillPoly(ctx, [[fx - 1.5, fy], [fx, fy - 4 - fl * 0.5], [fx + 1.5, fy]], '#ffd34d');
  light(fx, fy - 3, 22, 0.9);
}
function tent(ctx, x, y, s) {
  ellipse(ctx, x + 6, y + 3, 16 * s, 6 * s, COL.shadow);
  fillPoly(ctx, [[x - 14 * s, y + 4 * s], [x, y - 26 * s], [x, y + 8 * s]], '#c79a62', '#7a5530', 0.8);
  fillPoly(ctx, [[x, y + 8 * s], [x, y - 26 * s], [x + 14 * s, y + 3 * s]], '#a57b48', '#7a5530', 0.8);
  fillPoly(ctx, [[x - 4 * s, y + 6 * s], [x, y - 6 * s], [x + 1 * s, y + 7 * s]], '#3d2a1a');
  line(ctx, [[x - 3 * s, y - 31 * s], [x, y - 24 * s]], '#6b4427', 1.4);
  line(ctx, [[x + 3 * s, y - 31 * s], [x, y - 24 * s]], '#6b4427', 1.4);
  fillPoly(ctx, [[x - 5 * s, y - 18 * s], [x, y - 26 * s], [x + 5 * s, y - 18 * s], [x, y - 20 * s]], COL.snow);
}

function rockMound(ctx, x, y, w, h, iron) {
  const base = iron ? ['#8794a3', '#66727f', '#b0bcc8'] : ['#5c6672', '#424b56', '#7d8894'];
  ellipse(ctx, x + 8, y + 6, w * 1.02, w * 0.46, COL.shadow);
  // facets
  const P = [[x - w, y], [x - w * 0.72, y - h * 0.62], [x - w * 0.25, y - h], [x + w * 0.32, y - h * 0.92], [x + w * 0.8, y - h * 0.5], [x + w, y + 2], [x + w * 0.35, y + w * 0.4], [x - w * 0.45, y + w * 0.38]];
  fillPoly(ctx, P, base[1], 'rgba(30,36,44,0.6)', 1);
  fillPoly(ctx, [P[0], P[1], P[2], [x - w * 0.1, y - h * 0.35], P[7]], base[0]);
  fillPoly(ctx, [P[2], P[3], P[4], [x + w * 0.2, y - h * 0.3], [x - w * 0.1, y - h * 0.35]], base[2]);
  fillPoly(ctx, [[x - w * 0.1, y - h * 0.35], [x + w * 0.2, y - h * 0.3], P[4], P[5], P[6]], base[1]);
  if (iron) {
    for (const [a, b] of [[-0.5, -0.3], [0.3, -0.55], [0.55, -0.2]]) ellipse(ctx, x + a * w, y + b * h, 3, 1.6, '#b9653a');
  } else {
    for (const [a, b] of [[-0.45, -0.25], [0.25, -0.5], [0.5, -0.15]]) ellipse(ctx, x + a * w, y + b * h, 2.6, 1.6, '#1a1d22');
  }
  // snow cap
  ctx.beginPath();
  ctx.moveTo(x - w * 0.74, y - h * 0.6);
  ctx.lineTo(x - w * 0.25, y - h - 1);
  ctx.lineTo(x + w * 0.32, y - h * 0.94);
  ctx.lineTo(x + w * 0.78, y - h * 0.5);
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.58, x + w * 0.3, y - h * 0.68);
  ctx.quadraticCurveTo(x + w * 0.05, y - h * 0.62, x - w * 0.15, y - h * 0.74);
  ctx.quadraticCurveTo(x - w * 0.45, y - h * 0.56, x - w * 0.74, y - h * 0.6);
  ctx.fillStyle = COL.snow;
  ctx.fill();
}
function drawMine(ctx, x, y, L, iron) {
  const tier = tierOf(L);
  rockMound(ctx, x + 8, y - 4, 44, 46, iron);
  // entrance frame on the left slope
  const ex = x - 12; const ey = y + 4;
  ctx.beginPath();
  ctx.moveTo(ex - 11, ey);
  ctx.lineTo(ex - 11, ey - 15);
  ctx.quadraticCurveTo(ex, ey - 24, ex + 11, ey - 15);
  ctx.lineTo(ex + 11, ey);
  ctx.closePath();
  ctx.fillStyle = '#121418';
  ctx.fill();
  line(ctx, [[ex - 12, ey + 1], [ex - 12, ey - 17]], '#7a4f2b', 3.2, 'butt');
  line(ctx, [[ex + 12, ey + 1], [ex + 12, ey - 17]], '#7a4f2b', 3.2, 'butt');
  line(ctx, [[ex - 15, ey - 17], [ex + 15, ey - 17]], '#8d5d33', 3.4, 'butt');
  snowMound(ctx, ex, ey - 19.5, 13, 2.2);
  // lamp
  line(ctx, [[ex + 15, ey - 17], [ex + 15, ey - 12]], '#3a3f46', 0.8);
  ellipse(ctx, ex + 15, ey - 10.5, 2, 2, '#ffd27a');
  light(ex + 15, ey - 10, 20, 0.9);
  // rails out of the entrance toward the front
  const r0 = [ex, ey]; const r1 = [ex - 34, ey + 17];
  for (const off of [-3.5, 3.5]) line(ctx, [[r0[0] + off, r0[1] + off * 0.5 * 0], [r1[0] + off, r1[1]]], '#5a646f', 1.2);
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const px = lerp(r0[0], r1[0], t); const py = lerp(r0[1], r1[1], t);
    line(ctx, [[px - 5, py], [px + 5, py]], '#6b4427', 1.6, 'butt');
  }
  // cart
  const kx = ex - 24; const ky = ey + 13;
  ellipse(ctx, kx - 5, ky + 1, 2.4, 2.4, '#20252b');
  ellipse(ctx, kx + 5, ky + 1, 2.4, 2.4, '#20252b');
  const kp = block(ctx, kx, ky - 2, 10, 5, 0, 7, { l: '#56616d', r: '#3d4651', t: null, e: '#1e242b' });
  fillPoly(ctx, [kp(-1, -1, 7), kp(1, -1, 7), kp(1, 1, 7), kp(-1, 1, 7)], '#2a3038');
  for (let i = 0; i < 6; i++) {
    const lx = kx - 6 + (i % 3) * 6; const ly = ky - 9 - Math.floor(i / 3) * 3;
    if (iron) lump(ctx, lx, ly, 3, '#8fa0b2', '#dfe8f0'); else lump(ctx, lx, ly, 3, COL.coal, COL.coalL);
  }
  // ore pile
  const ox = x + 34; const oy = y + 16;
  ellipse(ctx, ox, oy + 2, 14, 5, iron ? '#6d7a88' : '#2a2f36');
  for (let i = 0; i < 7; i++) {
    const lx = ox - 9 + (i % 4) * 6; const ly = oy - Math.floor(i / 4) * 4;
    if (iron) lump(ctx, lx, ly, 3.4, '#8fa0b2', '#e2eaf2'); else lump(ctx, lx, ly, 3.4, COL.coal, COL.coalL);
  }
  // headframe: always for iron, tier 1+ for coal
  if (iron || tier >= 1) {
    const hx = x + 18; const hy = y - 30;
    line(ctx, [[hx - 12, hy + 10], [hx, hy - 30], [hx + 12, hy + 10]], '#7a4f2b', 3);
    line(ctx, [[hx - 7, hy - 6], [hx + 7, hy - 6]], '#7a4f2b', 2);
    ctx.beginPath(); ctx.arc(hx, hy - 30, 6, 0, TAU); ctx.strokeStyle = '#3e4651'; ctx.lineWidth = 2; ctx.stroke();
    line(ctx, [[hx, hy - 36], [hx, hy - 24]], '#3e4651', 1);
    line(ctx, [[hx - 6, hy - 30], [hx + 6, hy - 30]], '#3e4651', 1);
    line(ctx, [[hx + 6, hy - 30], [hx + 6, hy + 2]], '#2a2f36', 0.8);
  }
  if (tier >= 2) flag(ctx, x - 30, y - 14, 30, iron ? '#7d8fa6' : '#3a3f46', 12);
}

function drawInfirmary(ctx, x, y, L) {
  const tier = tierOf(L);
  if (tier >= 1) medTent(ctx, x + 44, y - 4);
  const hw = 34; const hh = 17; const h = 20;
  shadow(ctx, x, y, hw, hh);
  block(ctx, x, y, hw, hh, 0, 5, { l: COL.stoneL, r: COL.stoneR, e: COL.stoneLine });
  const p = block(ctx, x, y, hw, hh, 5, h, { l: '#e5ecf2', r: '#bccad7', e: '#7f92a5' });
  fillPoly(ctx, quadL(p, 0.4, 0.6, 5, 18), '#6d8297', '#3f4f60', 0.8);
  for (const [a, b] of [[0.1, 0.3], [0.7, 0.9]]) windowOn(ctx, quadL(p, a, b, 11, 18));
  for (const [a, b] of [[0.15, 0.4], [0.6, 0.85]]) windowOn(ctx, quadR(p, a, b, 11, 18));
  roof(ctx, x, y, hw, hh, 5 + h, 15, 'u', '#c0392b', { gable: '#d3dde6' });
  // cross sign on the gable end
  const g = p(1, 0, 5 + h + 6);
  ellipse(ctx, g[0], g[1], 5.6, 5.6, '#ffffff');
  fillPoly(ctx, [[g[0] - 1.4, g[1] - 4], [g[0] + 1.4, g[1] - 4], [g[0] + 1.4, g[1] - 1.4], [g[0] + 4, g[1] - 1.4], [g[0] + 4, g[1] + 1.4], [g[0] + 1.4, g[1] + 1.4], [g[0] + 1.4, g[1] + 4], [g[0] - 1.4, g[1] + 4], [g[0] - 1.4, g[1] + 1.4], [g[0] - 4, g[1] + 1.4], [g[0] - 4, g[1] - 1.4], [g[0] - 1.4, g[1] - 1.4]], '#e2483d');
  // flag with a cross
  const fp = p(-1, 1, 0);
  flag(ctx, fp[0] - 6, fp[1] + 2, 40, '#f4f7fa', 15);
  const fy = fp[1] + 2 - 40 + 2;
  ctx.fillStyle = '#e2483d';
  ctx.fillRect(fp[0] - 6 + 6, fy + 2, 2.4, 6.5);
  ctx.fillRect(fp[0] - 6 + 4, fy + 4, 6.5, 2.4);
}
function medTent(ctx, x, y) {
  ellipse(ctx, x + 6, y + 4, 18, 6, COL.shadow);
  const p = iso(x, y, 16, 8);
  fillPoly(ctx, [p(-1, 1), p(1, 1), p(1, 1, 0), p(0, 1, 16)], '#e9eef3', '#8d9fb1', 0.8);
  fillPoly(ctx, [p(1, 1), p(1, -1), p(0, -1, 16), p(0, 1, 16)], '#c8d3de', '#8d9fb1', 0.8);
  fillPoly(ctx, [p(-1, 1), p(0, 1, 16), p(0, -1, 16), p(-1, -1)], '#f4f7fa', '#8d9fb1', 0.8);
  line(ctx, [p(0.5, 1, 8), p(0.5, -1, 8)], '#e2483d', 2);
}

function drawStorehouse(ctx, x, y, L) {
  const tier = tierOf(L);
  const hw = 38; const hh = 19; const h = 22;
  shadow(ctx, x, y, hw, hh);
  block(ctx, x, y, hw, hh, 0, 7, { l: COL.stoneL, r: COL.stoneR, e: COL.stoneLine });
  const p = block(ctx, x, y, hw, hh, 7, h, { l: COL.plankL, r: COL.plankR, e: COL.logLine });
  hLines(ctx, p, 7, 7 + h, 4, 'rgba(60,32,14,0.4)');
  // big double door on the gable end
  fillPoly(ctx, quadL(p, 0.28, 0.72, 2, 22), '#5a3a20', COL.logDark, 1);
  line(ctx, [p(0, 1, 2), p(0, 1, 22)], COL.logDark, 1);
  line(ctx, [p(-0.44, 1, 2), p(0, 1, 22)], 'rgba(30,16,6,0.5)', 0.8);
  line(ctx, [p(0.44, 1, 2), p(0, 1, 22)], 'rgba(30,16,6,0.5)', 0.8);
  windowOn(ctx, quadR(p, 0.4, 0.6, 15, 22));
  roof(ctx, x, y, hw, hh, 7 + h, 17, 'v', '#5f6b78', { gable: COL.plankL });
  // crates and barrels
  const cr = [[x + 30, y + 16, 7], [x + 44, y + 9, 6], [x + 36, y + 6, 6]];
  if (tier >= 1) cr.push([x + 18, y + 24, 6]);
  for (const [cx, cy, s] of cr.sort((a, b) => a[1] - b[1])) crate(ctx, cx, cy, s);
  crate(ctx, x + 34, y + 9, 5.5, 11);
  barrel(ctx, x - 36, y + 12);
  barrel(ctx, x - 28, y + 17);
}
function crate(ctx, x, y, s, z0 = 0) {
  const p = block(ctx, x, y, s, s / 2, z0, s * 1.15, { l: '#c48d50', r: '#9b6a37', t: '#ddb27a', e: '#5e3b1c' });
  line(ctx, [p(-1, 1, z0), p(1, 1, z0 + s * 1.15)], 'rgba(90,55,25,0.7)', 0.9);
  line(ctx, [p(1, 1, z0), p(1, -1, z0 + s * 1.15)], 'rgba(90,55,25,0.7)', 0.9);
  ellipse(ctx, x, y - z0 - s * 1.15, s * 0.6, s * 0.22, 'rgba(244,248,252,0.9)');
}
function barrel(ctx, x, y) {
  ellipse(ctx, x + 2, y + 1.5, 5.6, 2.4, COL.shadow);
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 11);
  ctx.lineTo(x - 5, y);
  ctx.ellipse(x, y, 5, 2.2, 0, Math.PI, 0, true);
  ctx.lineTo(x + 5, y - 11);
  ctx.closePath();
  ctx.fillStyle = '#8a5a30';
  ctx.fill();
  for (const z of [2.5, 8]) { ctx.beginPath(); ctx.ellipse(x, y - z, 5, 2.2, 0, Math.PI, 0, true); ctx.strokeStyle = '#3d444c'; ctx.lineWidth = 1.2; ctx.stroke(); }
  ellipse(ctx, x, y - 11, 5, 2.2, '#efe9df');
}

function drawCamp(ctx, x, y, L, type) {
  const tier = tierOf(L);
  const team = TEAM[type];
  // yard fence on the front-left
  const yp = iso(x - 26, y + 18, 26, 13);
  fillPoly(ctx, [yp(-1, -1), yp(1, -1), yp(1, 1), yp(-1, 1)], 'rgba(170,190,210,0.35)');
  // barracks
  const hw = 32; const hh = 16; const h = 19;
  shadow(ctx, x + 6, y - 4, hw, hh);
  block(ctx, x + 6, y - 4, hw, hh, 0, 6, { l: COL.stoneL, r: COL.stoneR, e: COL.stoneLine });
  const p = block(ctx, x + 6, y - 4, hw, hh, 6, h, { l: COL.logL, r: COL.logR, e: COL.logLine });
  hLines(ctx, p, 6, 6 + h, 3.6, 'rgba(60,32,14,0.5)');
  fillPoly(ctx, quadL(p, 0.42, 0.6, 2, 18), COL.door, COL.logDark, 0.8);
  windowOn(ctx, quadL(p, 0.12, 0.3, 11, 17));
  windowOn(ctx, quadL(p, 0.72, 0.9, 11, 17));
  windowOn(ctx, quadR(p, 0.3, 0.7, 11, 17));
  roof(ctx, x + 6, y - 4, hw, hh, 6 + h, 15, 'u', team, { gable: COL.logR });
  // shield emblem on the gable
  const e = p(1, 0, 6 + h + 5);
  fillPoly(ctx, [[e[0] - 4, e[1] - 4], [e[0] + 4, e[1] - 4], [e[0] + 4, e[1]], [e[0], e[1] + 4.5], [e[0] - 4, e[1]]], team, '#f0d9a0', 0.9);
  // flag
  const fp = p(1, -1, 0);
  flag(ctx, fp[0] + 2, fp[1] + 2, 44 + tier * 6, team, 16);
  // fence posts
  const corners = [yp(-1, -1), yp(-1, 1), yp(1, 1)];
  line(ctx, corners.map(([a, b]) => [a, b - 5]), '#8a5a33', 1.2);
  line(ctx, corners.map(([a, b]) => [a, b - 2]), '#8a5a33', 1.2);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const seg = t < 0.5 ? [corners[0], corners[1], t * 2] : [corners[1], corners[2], (t - 0.5) * 2];
    const px = lerp(seg[0][0], seg[1][0], seg[2]); const py = lerp(seg[0][1], seg[1][1], seg[2]);
    line(ctx, [[px, py], [px, py - 7]], '#7a4f2b', 1.6);
    ellipse(ctx, px, py - 7.4, 1.4, 0.7, COL.snow);
  }
  // training props
  const tx = x - 26; const ty = y + 18;
  if (type === 'infantry') {
    line(ctx, [[tx, ty + 2], [tx, ty - 18]], '#7a4f2b', 2);
    line(ctx, [[tx - 8, ty - 13], [tx + 8, ty - 13]], '#7a4f2b', 1.8);
    ellipse(ctx, tx, ty - 9, 4.6, 6, '#c9a46a');
    ellipse(ctx, tx, ty - 19, 3.2, 3.2, '#c9a46a');
    for (let i = 0; i < 3; i++) {
      const sx = tx + 14 + i * 7; const sy = ty - 6 + i * 3.5;
      fillPoly(ctx, [[sx - 3.5, sy - 4], [sx + 3.5, sy - 4], [sx + 3.5, sy + 1], [sx, sy + 4.5], [sx - 3.5, sy + 1]], i === 1 ? '#c9d3dc' : team, '#2c333c', 0.7);
    }
  } else if (type === 'lancer') {
    for (let i = 0; i < 4; i++) {
      const sx = tx - 8 + i * 5; const sy = ty + i * 2.5;
      line(ctx, [[sx, sy], [sx + 6, sy - 24]], '#7a4f2b', 1.4);
      fillPoly(ctx, [[sx + 5, sy - 23], [sx + 8, sy - 30], [sx + 7.6, sy - 22]], '#dfe8ef', '#56677a', 0.5);
    }
    line(ctx, [[tx - 11, ty - 8], [tx + 12, ty + 2]], '#6b4427', 1.8);
    ellipse(ctx, tx + 16, ty - 4, 3.4, 4.6, '#c9a46a');
  } else {
    line(ctx, [[tx - 3, ty + 4], [tx, ty - 6]], '#7a4f2b', 1.6);
    line(ctx, [[tx + 3, ty + 4], [tx, ty - 6]], '#7a4f2b', 1.6);
    for (const [r, c] of [[9, '#f4f7fa'], [7, '#e2483d'], [5, '#f4f7fa'], [3, '#e2483d'], [1.4, '#ffd34d']]) ellipse(ctx, tx, ty - 12, r * 0.8, r, c);
    for (let i = 0; i < 2; i++) line(ctx, [[tx - 2 + i * 3, ty - 12 - i * 2], [tx - 12 + i * 3, ty - 16 - i * 2]], '#6b4427', 0.9);
    ellipse(ctx, tx + 16, ty + 2, 5, 2, '#8a5a33');
  }
}

// survivors
const COATS = ['#c8453a', '#2f74d6', '#d68a1f', '#2e8b57', '#7d4fb3', '#8a5a33', '#3d6f8f', '#b0413e'];
const SKINS = ['#f0c7a0', '#d9a77a', '#a8754d', '#f3d3b4'];
function drawWalker(ctx, w) {
  const x = w.x; const y = w.y;
  const step = w.moving && FR.motion ? Math.sin(w.phase) : 0;
  ellipse(ctx, x + 1.5, y + 0.6, 3.6, 1.4, 'rgba(48,78,118,0.28)');
  line(ctx, [[x - 1.2, y - 4], [x - 1.2 - step * 1.4, y]], '#2a2f36', 1.5);
  line(ctx, [[x + 1.2, y - 4], [x + 1.2 + step * 1.4, y]], '#2a2f36', 1.5);
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 3.6);
  ctx.lineTo(x - 2.6, y - 9);
  ctx.quadraticCurveTo(x, y - 10.6, x + 2.6, y - 9);
  ctx.lineTo(x + 3, y - 3.6);
  ctx.closePath();
  ctx.fillStyle = w.coat;
  ctx.fill();
  if (w.carry) ellipse(ctx, x + (w.dir > 0 ? 3 : -3), y - 6.6, 1.8, 1.6, w.carry);
  ellipse(ctx, x, y - 11.6, 2.9, 2.9, '#ece4d6');
  ellipse(ctx, x + (w.dir > 0 ? 0.4 : -0.4), y - 11.3, 1.8, 1.9, w.skin);
}

// ================================================================ the city view (screen)
const View = (() => {
  const v = {
    root: null, viewEl: null, canvas: null, ctx: null, world: null, hits: null, ui: null,
    vw: 0, vh: 0, dpr: 1, s: 1, camX: 0, camY: 0, camT: null,
    bg: null, bgK: 0, raf: 0, running: false, dirty: true, lastFrame: 0, lastSig: '',
    drag: null, suppress: false, inertia: null, pressed: null, focusedOnce: false,
    snow: [], walkers: [], fx: [], els: {}, bstate: {}, sideDefs: new Map(), sideSig: '', banner: null,
    highlight: null, offlineMsg: null,
  };

  // ------------------------------------------------ camera
  function viewWorldH() { return v.vh / v.s; }
  function viewWorldW() { return v.vw / v.s; }
  function clampCam() {
    const ww = viewWorldW(); const wh = viewWorldH();
    v.camX = ww >= WORLD_W ? (WORLD_W - ww) / 2 : clamp(v.camX, 0, WORLD_W - ww);
    v.camY = wh >= WORLD_H ? (WORLD_H - wh) / 2 : clamp(v.camY, 0, WORLD_H - wh);
  }
  function setCam(x, y) {
    v.camX = x; v.camY = y;
    clampCam();
    applyWorldTransform();
    requestDraw();
  }
  function applyWorldTransform() {
    if (v.world) v.world.style.transform = `translate(${(-v.camX * v.s).toFixed(2)}px, ${(-v.camY * v.s).toFixed(2)}px) scale(${v.s.toFixed(4)})`;
  }
  function freeArea() {
    const r = v.root.getBoundingClientRect();
    const onMap = el => el && v.root.contains(el);
    const top = onMap(v.els.top) ? v.els.top.getBoundingClientRect().bottom - r.top : 0;
    let bot = v.vh;
    if (onMap(v.els.bottom) && !v.els.banner.hidden && v.els.banner.childElementCount) bot = v.els.bottom.getBoundingClientRect().top - r.top;
    return { top: clamp(top, 0, v.vh * 0.5), bot: clamp(bot, v.vh * 0.5, v.vh) };
  }
  function camFor(wx, wy) {
    const fa = freeArea();
    const cy = (fa.top + fa.bot) / 2;
    return [wx - v.vw / (2 * v.s), wy - cy / v.s];
  }
  function focus(id, instant) {
    if (!v.root || !B[id] || !v.vw) return;
    const d = B[id];
    const [tx, ty] = camFor(d.x, d.y - d.hb[1] * 0.4);
    if (instant || Game.reducedMotion) { setCam(tx, ty); return; }
    v.camT = { x0: v.camX, y0: v.camY, x1: tx, y1: ty, t0: performance.now(), dur: 420 };
    v.inertia = null;
    requestDraw();
  }
  function homeCamera() {
    const [tx, ty] = camFor(PLAZA.x, PLAZA.y - 60);
    setCam(tx, ty);
  }

  // ------------------------------------------------ mount
  function mount(el) {
    el.innerHTML = `<div class="city-root">
      <div class="city-view" role="group" aria-label="City map. Drag to look around, tap a building to open it.">
        <canvas class="city-canvas" aria-hidden="true"></canvas>
        <div class="city-world"><div class="city-hits"></div><div class="city-wui"></div></div>
      </div>
      <div class="city-over">
        <div class="city-top">
          <div class="city-temp">
            <div class="city-t-row">
              <div class="city-t-cell" title="Outside temperature">
                <span class="city-t-ico city-t-sky">${Game.icon('city_sun', 18)}</span>
                <span class="city-t-txt"><span class="city-t-lbl">Outside</span><span class="city-t-val" data-out>-17°</span></span>
              </div>
              <div class="city-t-cell" title="Temperature inside the city">
                <span class="city-t-ico">${Game.icon('thermo', 18)}</span>
                <span class="city-t-txt"><span class="city-t-lbl">Inside</span><span class="city-t-val"><span data-in>3°</span><span class="city-comfort" data-comfort>Warm</span></span></span>
              </div>
              <div class="city-t-cell city-t-coal" title="Coal left for the Furnace">
                <span class="city-t-ico">${Game.icon('coal', 18)}</span>
                <span class="city-t-txt"><span class="city-t-lbl">Coal left</span><span class="city-t-val" data-coal>-</span></span>
              </div>
            </div>
            <div class="city-t-row city-t-row2">
              <span class="city-t-flbl">${Game.icon('flame', 16)}<span>Furnace</span></span>
              <div class="seg city-mode" role="group" aria-label="Furnace mode">
                <button type="button" id="city-mode-off" data-mode="off" aria-pressed="false">Off</button>
                <button type="button" id="city-mode-on" data-mode="on" aria-pressed="true">On</button>
                <button type="button" id="city-mode-over" data-mode="over" aria-pressed="false">Overdrive</button>
              </div>
            </div>
          </div>
          <div class="city-poprow">
            <button type="button" class="city-pop" id="city-pop" aria-label="Survivors">
              <span class="city-pop-i">${Game.icon('survivor', 18)}<span data-ptotal>6/8</span></span>
              <span class="city-pop-i" title="Healthy">${Game.icon('heart', 15)}<span data-phealthy>6</span><span class="city-pop-w">healthy</span></span>
              <span class="city-pop-i city-pop-sick" title="Sick">${Game.icon('city_sick', 15)}<span data-psick>0</span><span class="city-pop-w">sick</span></span>
              <span class="city-pop-i city-pop-idle" title="Idle">${Game.icon('city_idle', 15)}<span data-pidle>0</span><span class="city-pop-w">idle</span></span>
            </button>
            <button type="button" class="btn blue small city-auto" id="city-auto">Auto-assign<span class="badge-dot" aria-hidden="true" hidden></span></button>
          </div>
          <div class="city-alert" role="status" hidden>${Game.icon('warning', 18)}<span class="city-alert-t"></span><button type="button" class="btn gold small city-alert-btn" id="city-alert-over">Overdrive</button></div>
        </div>
        <div class="city-mid">
          <div class="city-left"></div>
          <div class="city-side"></div>
        </div>
        <div class="city-bottom"><div class="city-banner" hidden></div></div>
      </div>
    </div>`;
    v.root = el.querySelector('.city-root');
    v.viewEl = el.querySelector('.city-view');
    v.canvas = el.querySelector('.city-canvas');
    v.ctx = v.canvas.getContext('2d');
    v.world = el.querySelector('.city-world');
    v.hits = el.querySelector('.city-hits');
    v.ui = el.querySelector('.city-wui');
    v.els = {
      top: el.querySelector('.city-top'),
      out: el.querySelector('[data-out]'), in: el.querySelector('[data-in]'), comfort: el.querySelector('[data-comfort]'),
      coal: el.querySelector('[data-coal]'), coalCell: el.querySelector('.city-t-coal'), sky: el.querySelector('.city-t-sky'),
      modeBtns: [...el.querySelectorAll('.city-mode button')],
      ptotal: el.querySelector('[data-ptotal]'), phealthy: el.querySelector('[data-phealthy]'), psick: el.querySelector('[data-psick]'), pidle: el.querySelector('[data-pidle]'),
      pop: el.querySelector('#city-pop'), sickWrap: el.querySelector('.city-pop-sick'), idleWrap: el.querySelector('.city-pop-idle'),
      auto: el.querySelector('#city-auto'), autoDot: el.querySelector('#city-auto .badge-dot'),
      alert: el.querySelector('.city-alert'), alertT: el.querySelector('.city-alert-t'), alertBtn: el.querySelector('#city-alert-over'),
      left: el.querySelector('.city-left'), side: el.querySelector('.city-side'),
      bottom: el.querySelector('.city-bottom'), banner: el.querySelector('.city-banner'),
    };
    v.skyMode = 'sun';
    v.els.modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    v.els.pop.addEventListener('click', () => survivorsSheet());
    v.els.auto.addEventListener('click', () => {
      const before = idle();
      autoAssign();
      Game.toast(before > 0 && idle() < before ? 'Idle survivors put to work' : 'Workers rebalanced', 'good');
    });
    v.els.alertBtn.addEventListener('click', () => setMode('over'));
    buildWorldDom();
    renderSide();
    applyBanner();
    bindPointer();
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => resize()).observe(v.viewEl);
      new ResizeObserver(() => layoutSide()).observe(v.els.side.parentElement);
    } else window.addEventListener('resize', () => { resize(); layoutSide(); });
    resize();
    applyLayout();
  }

  function buildWorldDom() {
    v.hits.innerHTML = '';
    v.ui.innerHTML = '';
    for (const id of ORDER) {
      const d = B[id];
      const [w, up, down] = d.hb;
      const hit = document.createElement('button');
      hit.type = 'button';
      hit.className = 'city-hit';
      hit.id = 'city-b-' + id;
      hit.dataset.b = id;
      hit.style.cssText = `left:${d.x - w / 2}px;top:${d.y - up}px;width:${w}px;height:${up + down}px;z-index:${Math.round(d.y)}`;
      hit.addEventListener('click', () => { openSheet(id); });
      hit.addEventListener('focus', () => ensureVisible(id));
      v.hits.appendChild(hit);
      const ui = document.createElement('div');
      ui.className = 'city-bui';
      ui.dataset.b = id;
      ui.style.cssText = `left:${d.x}px;top:${d.y}px;z-index:${Math.round(d.y)}`;
      const plateY = id === 'furnace' ? 30 : Math.round(down * 0.55);
      // timer chip and collect bubble sit on the building itself, low enough to stay off the labels of buildings behind
      const timerY = id === 'furnace' ? Math.round(up * 0.62) : Math.round(Math.min(up * 0.3, 30));
      const bubbleY = Math.round(Math.min(up * 0.55, 46));
      ui.innerHTML = `<div class="city-plate" style="top:${plateY}px"><span class="city-plate-lv"></span><span class="city-plate-name">${esc(d.name)}</span></div>
        <span class="city-up" style="left:${Math.round(w * 0.3)}px;top:${-Math.round(up * 0.72)}px" hidden>${Game.icon('arrow_up', 22)}</span>
        <button type="button" class="city-timer" style="top:${-timerY}px" hidden><span class="city-timer-ico">${Game.icon('hammer', 16)}</span><span class="city-timer-t"></span><span class="city-timer-bar"><i></i></span></button>
        <button type="button" class="city-bubble" style="top:${-bubbleY}px" hidden>${PRODUCERS[id] ? Game.icon(PRODUCERS[id], 24) : ''}</button>
        <div class="city-tap" style="top:${-Math.round(up * (id === 'furnace' ? 0.42 : 0.5))}px" hidden aria-hidden="true"><span class="city-tap-t">Tap</span>${Game.icon('city_down', 22)}</div>`;
      const timer = ui.querySelector('.city-timer');
      timer.addEventListener('click', () => onTimerTap(id));
      const bubble = ui.querySelector('.city-bubble');
      bubble.addEventListener('click', () => collect(id));
      v.ui.appendChild(ui);
      v.bstate[id] = { ui, hit, plate: ui.querySelector('.city-plate'), lv: ui.querySelector('.city-plate-lv'), up: ui.querySelector('.city-up'), timer, timerT: ui.querySelector('.city-timer-t'), timerBar: ui.querySelector('.city-timer-bar i'), bubble, tap: ui.querySelector('.city-tap'), sig: '' };
    }
  }

  function ensureVisible(id) {
    const d = B[id];
    const fa = freeArea();
    const sx = (d.x - v.camX) * v.s; const sy = (d.y - d.hb[1] * 0.5 - v.camY) * v.s;
    if (sx < 30 || sx > v.vw - 30 || sy < fa.top + 20 || sy > fa.bot - 20) focus(id);
  }

  function onTimerTap(id) {
    const tid = timerId(id);
    const t = Game.timers.get(tid);
    if (!t) return;
    const rem = Game.timers.remaining(tid);
    if (rem <= Game.perk('freeFinishSec')) {
      Game.timers.finishNow(tid);
      Game.emit('speedup:used', { seconds: rem, timerId: tid, kind: 'build', free: true });
      return;
    }
    Game.speedupSheet(tid);
  }

  // ------------------------------------------------ pointer: drag to pan, tap goes to the buttons
  function bindPointer() {
    const el = v.viewEl;
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      v.camT = null;
      v.inertia = null;
      v.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: v.camX, cy: v.camY, moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0 };
      const hit = e.target.closest?.('.city-hit');
      v.pressed = hit ? hit.dataset.b : null;
      requestDraw();
    });
    el.addEventListener('pointermove', e => {
      const d = v.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x0; const dy = e.clientY - d.y0;
      if (!d.moved && Math.hypot(dx, dy) > 8) {
        d.moved = true;
        v.pressed = null;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        el.classList.add('is-dragging');
      }
      if (d.moved) {
        const now = performance.now();
        const dt = Math.max(1, now - d.lt);
        d.vx = lerp(d.vx, (e.clientX - d.lx) / dt, 0.4);
        d.vy = lerp(d.vy, (e.clientY - d.ly) / dt, 0.4);
        d.lx = e.clientX; d.ly = e.clientY; d.lt = now;
        setCam(d.cx - dx / v.s, d.cy - dy / v.s);
      }
    });
    const end = e => {
      const d = v.drag;
      if (!d || e.pointerId !== d.id) return;
      if (d.moved) {
        v.suppress = true;
        setTimeout(() => { v.suppress = false; }, 0);
        el.classList.remove('is-dragging');
        if (!Game.reducedMotion && e.type === 'pointerup' && performance.now() - d.lt < 80) {
          v.inertia = { vx: -d.vx / v.s, vy: -d.vy / v.s };
        }
      }
      v.drag = null;
      v.pressed = null;
      requestDraw();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', e => {
      if (v.suppress) { e.stopPropagation(); e.preventDefault(); v.suppress = false; }
    }, true);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      v.camT = null;
      setCam(v.camX + e.deltaX / v.s, v.camY + e.deltaY / v.s);
    }, { passive: false });
  }

  // ------------------------------------------------ size
  function resize() {
    if (!v.viewEl) return;
    const r = v.viewEl.getBoundingClientRect();
    const w = Math.round(r.width); const h = Math.round(r.height);
    if (w < 10 || h < 10) return;
    const first = !v.vw;
    v.vw = w; v.vh = h;
    v.dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!v.ctx) v.ctx = v.canvas.getContext('2d');
    v.s = Game.isLandscape?.()
      ? Math.max(clamp(Math.min(w / 446, h / 560), 0.7, 1.2), w / WORLD_W, h / WORLD_H)
      : clamp(w / 446, 0.8, 1.2);
    v.canvas.width = Math.round(w * v.dpr);
    v.canvas.height = Math.round(h * v.dpr);
    v.canvas.style.width = w + 'px';
    v.canvas.style.height = h + 'px';
    const k = v.s * v.dpr;
    // redraw the snowfield only when the scale really changed: small size changes reuse it scaled, which keeps
    // phones (iOS caps total canvas memory) from piling up full-size backgrounds
    if (!v.bg || k > v.bgK * 1.12 || k < v.bgK * 0.7) renderBg(k);
    initSnow();
    if (first || !v.focusedOnce) { homeCamera(); v.focusedOnce = true; }
    clampCam();
    applyWorldTransform();
    v.dirty = true;
    drawFrame(performance.now());
  }

  // ------------------------------------------------ background (static, pre-rendered)
  function doorOf(id) {
    const d = B[id];
    const hw = Math.min(46, d.hb[0] * 0.4); const hh = hw / 2;
    const dx = PLAZA.x - d.x; const dy = (PLAZA.y - d.y) * 2;
    const cands = [[0, -hh], [hw, 0], [0, hh], [-hw, 0]];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    let best = 0; let bv = -Infinity;
    dirs.forEach(([a, b], i) => { const val = a * dx + b * dy; if (val > bv) { bv = val; best = i; } });
    return [d.x + cands[best][0] * 0.9, d.y + cands[best][1] * 0.9];
  }
  function plazaAngle(px, py) { return Math.atan2((py - PLAZA.y) / PLAZA.ry, (px - PLAZA.x) / PLAZA.rx); }
  function plazaPoint(a, k = 1) { return [PLAZA.x + Math.cos(a) * PLAZA.rx * k, PLAZA.y + Math.sin(a) * PLAZA.ry * k]; }

  function renderBg(k) {
    k = Math.min(k, 2.4);
    if (v.bg) { v.bg.width = 0; v.bg.height = 0; v.bg = null; }
    v.bgK = k;
    const c = document.createElement('canvas');
    c.width = Math.round(WORLD_W * k);
    c.height = Math.round(WORLD_H * k);
    const g = c.getContext('2d');
    if (!g) { c.width = 0; c.height = 0; return; }
    g.setTransform(k, 0, 0, k, 0, 0);
    const rnd = mulberry32(20261018);
    // base snow
    const base = g.createLinearGradient(0, 0, 0, WORLD_H);
    base.addColorStop(0, '#cddbe9'); base.addColorStop(0.3, '#e1eaf3'); base.addColorStop(0.7, '#e7eef6'); base.addColorStop(1, '#d3e0ec');
    g.fillStyle = base;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    // drifts: soft shade with a bright crest
    for (let i = 0; i < 70; i++) {
      const x = rnd() * WORLD_W; const y = rnd() * WORLD_H; const r = 30 + rnd() * 90;
      g.save();
      g.translate(x, y);
      g.scale(1, 0.42);
      const sg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      sg.addColorStop(0, 'rgba(160,184,210,0.28)'); sg.addColorStop(1, 'rgba(160,184,210,0)');
      g.fillStyle = sg;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      const hg = g.createRadialGradient(-r * 0.25, -r * 0.35, 0, -r * 0.25, -r * 0.35, r * 0.7);
      hg.addColorStop(0, 'rgba(255,255,255,0.55)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hg;
      g.beginPath(); g.arc(-r * 0.25, -r * 0.35, r * 0.7, 0, TAU); g.fill();
      g.restore();
    }
    // a lighter town clearing
    g.save();
    g.translate(PLAZA.x, PLAZA.y + 20);
    g.scale(1, 0.62);
    const tg = g.createRadialGradient(0, 0, 40, 0, 0, 330);
    tg.addColorStop(0, 'rgba(246,250,253,0.75)'); tg.addColorStop(1, 'rgba(246,250,253,0)');
    g.fillStyle = tg;
    g.beginPath(); g.arc(0, 0, 330, 0, TAU); g.fill();
    g.restore();
    // frozen lake (bottom right)
    lake(g, 512, 812, 74, 34);
    // paths from the plaza to each plot
    const paths = ORDER.filter(id => id !== 'furnace').map(id => {
      const dp = doorOf(id);
      const a = plazaAngle(dp[0], dp[1]);
      return [plazaPoint(a, 0.98), dp];
    });
    for (const [a, b] of paths) {
      const mid = [(a[0] + b[0]) / 2 + (rnd() - 0.5) * 8, (a[1] + b[1]) / 2 + (rnd() - 0.5) * 6];
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(mid[0], mid[1], b[0], b[1]);
      g.strokeStyle = 'rgba(150,170,192,0.55)'; g.lineWidth = 17; g.stroke();
      g.strokeStyle = '#d2dce6'; g.lineWidth = 13; g.stroke();
      g.setLineDash([1.5, 6]);
      g.strokeStyle = 'rgba(140,160,182,0.55)'; g.lineWidth = 2.2; g.stroke();
      g.setLineDash([]);
    }
    // plaza ring
    g.save();
    g.translate(PLAZA.x, PLAZA.y);
    g.scale(1, PLAZA.ry / PLAZA.rx);
    g.beginPath(); g.arc(0, 0, PLAZA.rx + 9, 0, TAU);
    g.fillStyle = 'rgba(150,170,192,0.5)'; g.fill();
    g.beginPath(); g.arc(0, 0, PLAZA.rx + 6, 0, TAU);
    g.fillStyle = '#c2ceda'; g.fill();
    g.beginPath(); g.arc(0, 0, PLAZA.rx - 12, 0, TAU);
    g.fillStyle = '#d2dbe5'; g.fill();
    g.strokeStyle = 'rgba(120,140,162,0.45)'; g.lineWidth = 1.2;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      g.beginPath(); g.moveTo(Math.cos(a) * (PLAZA.rx - 12), Math.sin(a) * (PLAZA.rx - 12)); g.lineTo(Math.cos(a) * (PLAZA.rx + 6), Math.sin(a) * (PLAZA.rx + 6)); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, PLAZA.rx - 12, 0, TAU); g.stroke();
    g.restore();
    // scenery: rocks right, pines left and back
    const scen = [];
    const pinesAt = [
      [26, 160], [62, 128], [104, 150], [36, 214], [16, 286], [52, 330], [22, 392], [40, 452], [20, 560], [46, 610], [24, 676], [56, 740], [30, 800], [84, 846], [126, 878], [176, 860], [222, 884],
      [236, 140], [270, 122], [330, 118], [368, 136], [218, 176], [384, 172], [92, 196], [500, 128], [96, 690], [84, 768], [140, 810], [250, 836], [356, 860], [404, 884],
    ];
    for (const [x, y] of pinesAt) scen.push({ y, f: () => pine(g, x + (rnd() - 0.5) * 6, y, 0.8 + rnd() * 0.45) });
    const rocksAt = [[566, 190, 30], [540, 160, 20], [582, 270, 26], [556, 330, 18], [584, 410, 28], [574, 590, 26], [586, 690, 22], [548, 720, 16], [430, 860, 18], [470, 140, 18], [588, 120, 30]];
    for (const [x, y, s] of rocksAt) scen.push({ y, f: () => rockSmall(g, x, y, s) });
    const lamps = [];
    for (const a of [Math.PI * 0.2, Math.PI * 0.8, Math.PI * 1.2, Math.PI * 1.8]) {
      const [lx, ly] = plazaPoint(a, 1.12);
      lamps.push([lx, ly]);
      scen.push({ y: ly, f: () => lampPost(g, lx, ly) });
    }
    v.lamps = lamps.map(([x, y]) => [x, y - 26]);
    // fence along the back
    scen.push({ y: 110, f: () => fence(g, [[120, 112], [230, 96], [380, 98], [500, 112]]) });
    scen.sort((a, b) => a.y - b.y).forEach(s => s.f());
    // sparkles
    for (let i = 0; i < 520; i++) {
      const x = rnd() * WORLD_W; const y = rnd() * WORLD_H;
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(176,206,232,0.6)';
      g.fillRect(x, y, 0.9 + rnd() * 0.8, 0.9 + rnd() * 0.8);
    }
    // vignette to frame the world
    const vg = g.createRadialGradient(PLAZA.x, PLAZA.y, 220, PLAZA.x, PLAZA.y, 620);
    vg.addColorStop(0, 'rgba(60,90,130,0)'); vg.addColorStop(1, 'rgba(40,66,100,0.32)');
    g.fillStyle = vg;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    v.bg = c;
  }
  function pine(g, x, y, s) {
    ellipse(g, x + 7 * s, y + 1, 13 * s, 4.5 * s, 'rgba(48,78,118,0.22)');
    g.fillStyle = '#5b3a22';
    g.fillRect(x - 1.8 * s, y - 7 * s, 3.6 * s, 8 * s);
    for (let i = 0; i < 3; i++) {
      const by = y - 5 * s - i * 10 * s; const w = (15 - i * 3.8) * s; const h = 17 * s;
      fillPoly(g, [[x, by - h], [x - w, by], [x, by + 2 * s]], COL.pine);
      fillPoly(g, [[x, by - h], [x + w, by], [x, by + 2 * s]], COL.pineD);
      g.beginPath();
      g.moveTo(x, by - h);
      g.lineTo(x - w * 0.62, by - h * 0.38);
      g.quadraticCurveTo(x - w * 0.3, by - h * 0.46, x - w * 0.1, by - h * 0.3);
      g.quadraticCurveTo(x + w * 0.2, by - h * 0.5, x + w * 0.5, by - h * 0.42);
      g.closePath();
      g.fillStyle = '#eef5fb';
      g.fill();
      g.beginPath();
      g.moveTo(x - w, by);
      g.quadraticCurveTo(x - w * 0.6, by - 3 * s, x - w * 0.2, by - 1 * s);
      g.quadraticCurveTo(x + w * 0.2, by - 3 * s, x + w, by);
      g.quadraticCurveTo(x, by + 2.5 * s, x - w, by);
      g.fillStyle = 'rgba(238,245,251,0.9)';
      g.fill();
    }
  }
  function rockSmall(g, x, y, s) {
    ellipse(g, x + s * 0.3, y + 2, s * 1.1, s * 0.4, 'rgba(48,78,118,0.2)');
    const P = [[x - s, y], [x - s * 0.6, y - s * 0.7], [x - s * 0.05, y - s * 0.95], [x + s * 0.55, y - s * 0.6], [x + s, y], [x + s * 0.2, y + s * 0.3]];
    fillPoly(g, P, COL.rock, 'rgba(40,50,62,0.5)', 0.8);
    fillPoly(g, [P[0], P[1], P[2], [x, y - s * 0.2], P[5]], COL.rockL);
    fillPoly(g, [[x, y - s * 0.2], P[2], P[3], P[4], P[5]], COL.rockD);
    g.beginPath();
    g.moveTo(x - s * 0.62, y - s * 0.66);
    g.lineTo(x - s * 0.05, y - s * 0.98);
    g.lineTo(x + s * 0.56, y - s * 0.62);
    g.quadraticCurveTo(x + s * 0.1, y - s * 0.55, x - s * 0.62, y - s * 0.66);
    g.fillStyle = COL.snow;
    g.fill();
  }
  function lake(g, x, y, rx, ry) {
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.beginPath(); g.arc(0, 0, rx + 6, 0, TAU); g.fillStyle = 'rgba(150,175,200,0.55)'; g.fill();
    const lg = g.createLinearGradient(-rx, -rx, rx, rx);
    lg.addColorStop(0, '#bfe0f2'); lg.addColorStop(0.5, '#9fcbe6'); lg.addColorStop(1, '#c8e6f5');
    g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3;
    for (const [a, b, c2] of [[-40, -18, 20], [-10, 10, 34], [12, 26, 16]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(a + c2, b - c2 * 0.4); g.stroke(); }
    g.restore();
  }
  function lampPost(g, x, y) {
    ellipse(g, x + 3, y + 1, 4.5, 1.6, 'rgba(48,78,118,0.25)');
    line(g, [[x, y], [x, y - 24]], '#2f363f', 2.2);
    line(g, [[x, y - 24], [x + 4, y - 26]], '#2f363f', 1.4);
    fillPoly(g, [[x - 3, y - 24], [x + 3, y - 24], [x + 2, y - 30], [x - 2, y - 30]], '#ffd98a', '#2f363f', 0.8);
    ellipse(g, x, y - 31, 3.2, 1.2, COL.snow);
  }
  function fence(g, pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 9);
      line(g, [[a[0], a[1] - 6], [b[0], b[1] - 6]], '#7a4f2b', 1.4);
      line(g, [[a[0], a[1] - 2.5], [b[0], b[1] - 2.5]], '#7a4f2b', 1.4);
      for (let j = 0; j <= n; j++) {
        const x = lerp(a[0], b[0], j / n); const y = lerp(a[1], b[1], j / n);
        line(g, [[x, y], [x, y - 9]], '#6b4427', 2);
        ellipse(g, x, y - 9.5, 1.6, 0.8, COL.snow);
      }
    }
  }

  // ------------------------------------------------ snow and walkers
  function initSnow() {
    v.snow = [];
    const n = Math.round((v.vw * v.vh) / 2600);
    for (let i = 0; i < n; i++) v.snow.push(newFlake(true));
  }
  function newFlake(anywhere) {
    return { x: Math.random() * v.vw, y: anywhere ? Math.random() * v.vh : -6, r: 0.7 + Math.random() * 1.9, vy: 16 + Math.random() * 26, ph: Math.random() * TAU, a: 0.5 + Math.random() * 0.5 };
  }
  function spots() {
    const out = [];
    for (const id of ORDER) {
      if (id === 'furnace' || lvl(id) < 1) continue;
      const dp = doorOf(id);
      out.push({ x: dp[0], y: dp[1], a: plazaAngle(dp[0], dp[1]), id });
    }
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.12 + (i / 6) * 0.76);
      const [x, y] = plazaPoint(a, 0.78);
      out.push({ x, y, a, id: 'furnace', warm: true });
    }
    return out;
  }
  function syncWalkers() {
    if (!Game.S) return;
    const want = Math.min(24, healthy());
    const sp = spots();
    while (v.walkers.length < want) {
      const s = sp[Math.floor(Math.random() * sp.length)];
      v.walkers.push({ x: s.x + (Math.random() - 0.5) * 8, y: s.y + (Math.random() - 0.5) * 4, at: s, path: [], speed: 12 + Math.random() * 7, coat: COATS[Math.floor(Math.random() * COATS.length)], skin: SKINS[Math.floor(Math.random() * SKINS.length)], phase: Math.random() * TAU, wait: Math.random() * 4, dir: 1, moving: false, carry: null });
    }
    if (v.walkers.length > want) v.walkers.length = want;
  }
  function planRoute(w) {
    const sp = spots();
    if (!sp.length) return;
    let to = sp[Math.floor(Math.random() * sp.length)];
    if (to === w.at || (to.id === w.at?.id && sp.length > 2)) to = sp[Math.floor(Math.random() * sp.length)];
    const a0 = w.at ? w.at.a : plazaAngle(w.x, w.y);
    const a1 = to.a;
    const path = [];
    if (!w.at?.warm) path.push(plazaPoint(a0, 0.98));
    let da = a1 - a0;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    const steps = Math.max(1, Math.round(Math.abs(da) / 0.3));
    for (let i = 1; i <= steps; i++) path.push(plazaPoint(a0 + (da * i) / steps, 0.98));
    path.push([to.x + (Math.random() - 0.5) * 6, to.y + (Math.random() - 0.5) * 3]);
    w.path = path;
    w.to = to;
    const res = w.at && PRODUCERS[w.at.id];
    w.carry = res ? { wood: '#a8743f', meat: '#c4513a', coal: '#2a2f36', iron: '#9aa9b8' }[res] : null;
  }
  function stepWalkers(dt) {
    for (const w of v.walkers) {
      if (w.wait > 0) { w.wait -= dt; w.moving = false; continue; }
      if (!w.path.length) {
        if (w.to) { w.at = w.to; w.to = null; w.wait = w.at.warm ? 5 + Math.random() * 9 : 2 + Math.random() * 5; w.moving = false; continue; }
        planRoute(w);
        continue;
      }
      const [tx, ty] = w.path[0];
      const dx = tx - w.x; const dy = ty - w.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = w.speed * dt;
      w.moving = true;
      if (Math.abs(dx) > 0.2) w.dir = dx > 0 ? 1 : -1;
      w.phase += dt * 9;
      if (dist <= stepLen) { w.x = tx; w.y = ty; w.path.shift(); } else { w.x += (dx / dist) * stepLen; w.y += (dy / dist) * stepLen; }
    }
  }

  // ------------------------------------------------ frame
  function requestDraw() {
    v.dirty = true;
    if (!v.raf && v.root && Game.screen?.() === 'city' && !document.hidden) v.raf = requestAnimationFrame(loop);
  }
  function start() {
    v.running = true;
    v.lastFrame = performance.now();
    requestDraw();
  }
  function stop() {
    v.running = false;
    if (v.raf) cancelAnimationFrame(v.raf);
    v.raf = 0;
  }
  function loop(now) {
    v.raf = 0;
    if (!v.root || Game.screen?.() !== 'city' || document.hidden) return;
    const animate = v.running && !Game.reducedMotion;
    const moving = v.camT || v.inertia;
    if (animate || moving || v.dirty) {
      try { drawFrame(now); } catch (e) {
        console.warn('[city] frame skipped', e);
        try { v.ctx?.setTransform(1, 0, 0, 1, 0, 0); v.ctx?.restore(); } catch (e2) { /* nothing saved */ }
      }
    }
    if (animate || v.camT || v.inertia) v.raf = requestAnimationFrame(loop);
  }

  function drawFrame(now) {
    if (!v.ctx || !v.vw || !Game.S) return;
    const motion = !Game.reducedMotion;
    let dt = clamp((now - v.lastFrame) / 1000, 0, 0.1);
    v.lastFrame = now;
    // camera animation and inertia
    if (v.camT) {
      const k = clamp((now - v.camT.t0) / v.camT.dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      setCamRaw(lerp(v.camT.x0, v.camT.x1, e), lerp(v.camT.y0, v.camT.y1, e));
      if (k >= 1) v.camT = null;
    } else if (v.inertia) {
      const iv = v.inertia;
      setCamRaw(v.camX + iv.vx * dt * 1000, v.camY + iv.vy * dt * 1000);
      iv.vx *= Math.pow(0.004, dt);
      iv.vy *= Math.pow(0.004, dt);
      if (Math.hypot(iv.vx, iv.vy) < 0.01) v.inertia = null;
    }
    v.dirty = false;
    if (!motion) dt = 0;
    FR.t = now / 1000;
    FR.motion = motion;
    FR.thumb = false;
    const env = refreshEnv();
    FR.dark = env.dark;
    FR.win = env.dark > 0.25 ? '#ffc96a' : COL.glass;
    FR.lights = [];
    FR.smoke = motion ? { dt, acc: v.smokeAcc || (v.smokeAcc = {}) } : null;
    const ctx = v.ctx;
    const k = v.s * v.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#c6d5e3';
    ctx.fillRect(0, 0, v.canvas.width, v.canvas.height);
    // background
    if (v.bg) {
      const sx = v.camX * v.bgK; const sy = v.camY * v.bgK;
      const sw = (v.vw / v.s) * v.bgK; const sh = (v.vh / v.s) * v.bgK;
      ctx.drawImage(v.bg, sx, sy, sw, sh, 0, 0, v.canvas.width, v.canvas.height);
    }
    ctx.setTransform(k, 0, 0, k, -v.camX * k, -v.camY * k);
    // furnace heat on the snow
    const c = C();
    const fLit = env.lit;
    if (fLit) {
      const over = c.mode === 'over';
      const R = (110 + lvl('furnace') * 3) * (over ? 1.25 : 1);
      ctx.save();
      ctx.translate(B.furnace.x, B.furnace.y);
      ctx.scale(1, 0.5);
      const hg = ctx.createRadialGradient(0, 0, 20, 0, 0, R);
      hg.addColorStop(0, `rgba(255,170,90,${over ? 0.42 : 0.3})`); hg.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // highlight ring (tutorial / quest) and pressed ring
    const hl = currentHighlight();
    if (hl) ring(ctx, hl, motion ? 0.5 + 0.5 * Math.sin(now / 260) : 0.7, '#ffd862');
    if (v.pressed) ring(ctx, v.pressed, 1, '#8fd8ff');
    // walkers update
    syncWalkers();
    if (motion) stepWalkers(dt);
    // depth-sorted entities
    const ents = [];
    for (const id of ORDER) ents.push({ y: B[id].y, id });
    for (const w of v.walkers) ents.push({ y: w.y, w });
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (e.w) { drawWalker(ctx, e.w); continue; }
      const id = e.id;
      const d = B[id];
      drawBuilding(ctx, id, d.x, d.y, lvl(id), { unlocked: isUnlocked(id), building: !!buildTimer(id), lit: fLit, mode: c.mode });
    }
    // smoke
    if (motion) {
      for (const p of smoke) { p.life += dt; p.x += p.vx * dt * (1 + env.bz * 2); p.y += p.vy * dt; p.r += p.g * dt; }
      for (let i = smoke.length - 1; i >= 0; i--) if (smoke[i].life >= smoke[i].max) smoke.splice(i, 1);
    }
    for (const p of smoke) {
      const a = (1 - p.life / p.max) * (p.dark ? 0.42 : 0.3);
      ellipse(ctx, p.x, p.y, p.r, p.r * 0.86, p.dark ? `rgba(120,128,140,${a})` : `rgba(230,236,242,${a})`);
    }
    // level-up rings
    for (let i = v.fx.length - 1; i >= 0; i--) {
      const f = v.fx[i];
      const age = (now - f.t0) / 1000;
      if (age > 1.4 || !motion) { if (age > 1.4) v.fx.splice(i, 1); continue; }
      if (age < 0) continue;
      const kk = clamp(age / 1.4, 0, 1);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(1, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, 20 + kk * 70, 0, TAU);
      ctx.strokeStyle = `rgba(255,216,98,${1 - kk})`; ctx.lineWidth = 5 * (1 - kk) + 1; ctx.stroke();
      ctx.restore();
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * TAU + f.seed;
        const r = 14 + kk * 50;
        ellipse(ctx, f.x + Math.cos(a) * r, f.y - 30 - kk * 30 + Math.sin(a) * r * 0.5, 2 * (1 - kk) + 0.3, 2 * (1 - kk) + 0.3, `rgba(255,236,160,${1 - kk})`);
      }
    }
    // night and blizzard tint, then lights
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (env.dark > 0.01) {
      ctx.fillStyle = `rgba(12,24,58,${0.5 * env.dark})`;
      ctx.fillRect(0, 0, v.canvas.width, v.canvas.height);
    }
    if (env.bz > 0.01) {
      ctx.fillStyle = `rgba(200,214,230,${0.28 * env.bz})`;
      ctx.fillRect(0, 0, v.canvas.width, v.canvas.height);
    }
    const glowA = Math.max(env.dark, env.bz * 0.6);
    if (glowA > 0.02) {
      ctx.setTransform(k, 0, 0, k, -v.camX * k, -v.camY * k);
      ctx.globalCompositeOperation = 'lighter';
      for (const l of FR.lights) glow(ctx, l.x, l.y, l.r, 0.55 * l.a * glowA);
      for (const [lx, ly] of v.lamps || []) glow(ctx, lx, ly, 26, 0.5 * glowA);
      if (fLit) glow(ctx, B.furnace.x, B.furnace.y - 30, 150 * (c.mode === 'over' ? 1.2 : 1), 0.32 * glowA);
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // snow (screen space)
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const bz = env.bz;
    const wind = 10 + bz * 140;
    const n = Math.round(v.snow.length * (0.55 + bz * 1.6));
    while (v.snow.length < n) v.snow.push(newFlake(true));
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < Math.min(n, v.snow.length); i++) {
      const f = v.snow[i];
      if (motion) {
        f.ph += dt * 1.5;
        f.y += f.vy * (1 + bz * 1.2) * dt;
        f.x += (wind * 0.4 + Math.sin(f.ph) * 8) * dt;
        if (f.y > v.vh + 6) { Object.assign(f, newFlake(false)); }
        if (f.x > v.vw + 6) f.x -= v.vw + 12;
        if (f.x < -6) f.x += v.vw + 12;
      }
      ctx.globalAlpha = f.a;
      if (bz > 0.3) {
        ctx.fillRect(f.x, f.y, f.r * 2 + bz * 5, f.r * 0.9);
      } else {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function setCamRaw(x, y) {
    v.camX = x; v.camY = y;
    clampCam();
    applyWorldTransform();
  }
  function glow(ctx, x, y, r, a) {
    if (a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,190,110,${Math.min(1, a)})`);
    g.addColorStop(0.4, `rgba(255,150,70,${Math.min(1, a) * 0.45})`);
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function ring(ctx, id, a, color) {
    const d = B[id];
    const r = id === 'furnace' ? 94 : Math.min(72, d.hb[0] * 0.6);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(1, 0.5);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = color === '#ffd862' ? `rgba(255,216,98,${0.16 + a * 0.14})` : 'rgba(143,216,255,0.2)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55 + a * 0.45;
    ctx.stroke();
    ctx.restore();
  }
  function currentHighlight() {
    if (!Game.S) return null;
    if (v.highlight && B[v.highlight]) return v.highlight;
    if (!C().tut && !buildTimer('furnace')) return 'furnace';
    return null;
  }

  // ------------------------------------------------ 4 Hz DOM update
  function update() {
    if (!v.root || !Game.S) return;
    const env = refreshEnv();
    const c = C();
    const e = v.els;
    Game.setText(e.out, Math.round(env.outside) + '°');
    Game.setText(e.in, Math.round(env.inside) + '°');
    Game.setText(e.comfort, COMFORT[env.comfort].label);
    e.comfort.className = 'city-comfort is-' + env.comfort;
    const sky = env.dark > 0.5 ? 'moon' : 'sun';
    if (sky !== v.skyMode) { v.skyMode = sky; e.sky.innerHTML = Game.icon(sky === 'moon' ? 'city_moon' : 'city_sun', 18); }
    const burn = burnPerHour();
    let coalTxt;
    let coalBad = false;
    if (c.mode === 'off') coalTxt = 'Off';
    else if (c.noCoal) { coalTxt = 'None'; coalBad = true; } else {
      const hours = ((Game.S.res.coal || 0) + (c.stock.coalmine || 0)) / Math.max(1e-6, burn);
      coalTxt = hours > 99 ? '99h+' : fmtT(hours * 3600);
      coalBad = hours < 0.5;
    }
    Game.setText(e.coal, coalTxt);
    e.coalCell.classList.toggle('is-bad', coalBad);
    for (const b of e.modeBtns) {
      const on = String(b.dataset.mode === c.mode);
      if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on);
    }
    // survivors
    const p = c.pop;
    const cap = popCap();
    Game.setText(e.ptotal, `${p.total}/${cap}`);
    Game.setText(e.phealthy, healthy());
    Game.setText(e.psick, p.sick);
    const idl = idle();
    Game.setText(e.pidle, idl);
    e.sickWrap.classList.toggle('is-bad', p.sick > 0);
    e.idleWrap.classList.toggle('is-warn', idl > 0 && freeSlots() > 0);
    const popLabel = `Survivors: ${p.total} of ${cap}, ${healthy()} healthy, ${p.sick} sick, ${idl} idle`;
    if (e.pop.getAttribute('aria-label') !== popLabel) e.pop.setAttribute('aria-label', popLabel);
    e.autoDot.hidden = !(idl > 0 && freeSlots() > 0);
    // alert
    let alert = '';
    let showOver = false;
    const storm = env.bzLeft > 0 || (env.warnIn > 0 && env.warnIn <= 45);
    if (storm && blizzardThreat()) {
      alert = env.bzLeft > 0 ? `Blizzard: ${fmtT(env.bzLeft)} left` : `Blizzard in ${fmtT(env.warnIn)}`;
      showOver = c.mode !== 'over';
    } else if (c.noCoal) alert = 'Out of Coal. Collect from the Coal Mine.';
    else if (c.hungry) alert = 'Out of Meat. Survivors are hungry.';
    e.alert.hidden = !alert;
    if (alert) Game.setText(e.alertT, alert);
    e.alertBtn.hidden = !showOver;
    // builders
    updateBuilders();
    updateSideBadges();
    // building overlays
    const hl = currentHighlight();
    let full = 0;
    for (const id of ORDER) {
      const bs = v.bstate[id];
      const L = lvl(id);
      const st = upgradeState(id);
      const unlocked = isUnlocked(id);
      const t = buildTimer(id);
      let bubble = false; let isFull = false;
      if (PRODUCERS[id] && L > 0) {
        const stock = c.stock[id] || 0;
        isFull = stock >= storageCap(id) - 0.5;
        bubble = stock >= bubbleThreshold(id) && stock >= 1;
        if (isFull) full += 1;
      }
      const up = !t && st.s === 'ok' && st.afford && st.builder;
      const free = t && Game.timers.remaining(t.id) <= Game.perk('freeFinishSec');
      const sig = [L, unlocked, !!t, bubble, isFull, up, free, hl === id].join('|');
      if (sig !== bs.sig) {
        bs.sig = sig;
        bs.plate.className = 'city-plate' + (L < 1 ? (unlocked ? ' is-build' : ' is-locked') : '');
        if (L < 1) bs.lv.innerHTML = unlocked ? Game.icon('hammer', 13) : Game.icon('lock', 12) + `<span>${B[id].unlock}</span>`;
        else bs.lv.textContent = String(L);
        Game.setText(bs.plate.querySelector('.city-plate-name'), L < 1 && unlocked ? 'Build ' + B[id].name : B[id].name);
        bs.up.hidden = !up;
        bs.timer.hidden = !t;
        bs.ui.classList.toggle('has-timer', !!t);
        bs.timer.classList.toggle('is-free', !!free);
        bs.bubble.hidden = !bubble;
        bs.bubble.classList.toggle('is-full', isFull);
        bs.tap.hidden = hl !== id;
        const label = L < 1 ? (unlocked ? `${B[id].name}, not built yet` : `${B[id].name}, locked until Furnace level ${B[id].unlock}`) : `${B[id].name}, level ${L}${t ? ', upgrading' : up ? ', upgrade ready' : ''}`;
        bs.hit.setAttribute('aria-label', label);
        if (bubble) bs.bubble.setAttribute('aria-label', `Collect ${resName(PRODUCERS[id])} from ${B[id].name}`);
        v.dirty = true;
      }
      if (t) {
        const rem = Game.timers.remaining(t.id);
        Game.setText(bs.timerT, free ? 'Free' : fmtT(rem));
        bs.timerBar.style.width = (Game.timers.progress(t.id) * 100).toFixed(1) + '%';
        const tl = free ? `Finish ${B[id].name} for free` : `${B[id].name} upgrading, ${fmtT(rem)} left. Speed up`;
        if (bs.timer.getAttribute('aria-label') !== tl) bs.timer.setAttribute('aria-label', tl);
      }
    }
    let freeFinish = 0;
    for (const t of activeBuilds()) if (Game.timers.remaining(t.id) <= Game.perk('freeFinishSec')) freeFinish += 1;
    Game.badge('city', full + freeFinish);
    // redraw for reduced motion or state changes
    const sig = [c.mode, env.lit, Math.round(env.dark * 20), Math.round(env.bz * 10), healthy(), activeBuilds().map(t => t.id).join(), hl].join('|');
    if (sig !== v.lastSig) { v.lastSig = sig; v.dirty = true; }
    if (v.dirty) requestDraw();
  }
  function updateBuilders() {
    const el = v.els.left;
    const list = activeBuilds();
    const n = builders();
    const sig = n + ':' + list.map(t => t.id).join(',');
    if (sig !== v.bsig) {
      v.bsig = sig;
      const slotsHtml = [];
      for (let i = 0; i < 2; i++) {
        const t = list[i];
        if (i >= n) {
          slotsHtml.push(`<button type="button" class="city-builder is-locked" data-slot="vip" aria-label="Second builder: unlock with VIP">${Game.icon('lock', 15)}<span class="city-builder-time">Builder 2</span></button>`);
        } else if (t) {
          slotsHtml.push(`<button type="button" class="city-builder is-busy" data-slot="t" data-tid="${esc(t.id)}" data-label="${esc(t.label)}">${Game.icon('hammer', 18)}<span class="city-builder-time"></span><span class="city-builder-bar"><i></i></span></button>`);
        } else {
          slotsHtml.push(`<button type="button" class="city-builder is-idle" data-slot="idle" aria-label="Builder idle. Tap to pick a building">${Game.icon('hammer', 18)}<span class="city-builder-time">Idle</span></button>`);
        }
      }
      el.innerHTML = slotsHtml.join('');
      el.querySelectorAll('.city-builder').forEach(b => b.addEventListener('click', () => {
        const s = b.dataset.slot;
        if (s === 'vip') Game.navigate('shop:vip');
        else if (s === 'idle') { const id = suggestBuilding(); focus(id); openSheet(id); } else if (s === 't') {
          const tid = b.dataset.tid;
          const id = tid.replace(/^build:/, '');
          if (B[id]) onTimerTap(id);
        }
      }));
    }
    el.querySelectorAll('.city-builder.is-busy').forEach(b => {
      const tid = b.dataset.tid;
      const rem = Game.timers.remaining(tid);
      const free = rem <= Game.perk('freeFinishSec');
      Game.setText(b.querySelector('.city-builder-time'), free ? 'Free' : fmtT(rem));
      b.classList.toggle('is-free', free);
      b.querySelector('.city-builder-bar i').style.width = (Game.timers.progress(tid) * 100).toFixed(1) + '%';
      const lab = `${b.dataset.label}, ${free ? 'finish for free' : fmtT(rem) + ' left. Speed up'}`;
      if (b.getAttribute('aria-label') !== lab) b.setAttribute('aria-label', lab);
    });
  }

  // ------------------------------------------------ side buttons and banner
  function addSide(def) {
    if (!def || !def.id) return;
    v.sideDefs.set(String(def.id), def);
    renderSide();
  }
  function removeSide(id) {
    v.sideDefs.delete(String(id));
    renderSide();
  }
  // Fit the side buttons above the banner: as many rows as fit, then more columns to the left.
  function updateSideBadges() {
    const e = v.els;
    if (!e?.side) return;
    for (const [id, def] of v.sideDefs) {
      const dot = e.side.querySelector(`[data-side="${CSS.escape(id)}"] .badge-dot`);
      if (!dot) continue;
      let n = 0;
      try { n = Number(def.badge?.()) || 0; } catch (err) { n = 0; }
      dot.hidden = !(n > 0);
      dot.classList.toggle('has-count', n > 1);
      Game.setText(dot, n > 1 ? (n > 99 ? '99+' : String(n)) : '');
    }
  }
  // Landscape: the temperature and survivor panel, quest banner, builders and shortcut buttons leave the map and
  // dock in core's left panel. Comment markers remember where each part goes back in portrait.
  function applyLayout() {
    const slot = Game.sideSlot?.();
    if (!v.root || !slot) return;
    const parts = [v.els.top, v.els.bottom, v.els.left, v.els.side].filter(Boolean);
    if (!v.dock) {
      v.dock = document.createElement('div');
      v.dock.className = 'city-dock';
      v.homes = parts.map(el => { const mark = document.createComment('city-dock'); el.parentNode.insertBefore(mark, el); return mark; });
    }
    const land = !!Game.isLandscape?.();
    if (land && v.dock.parentNode !== slot) {
      parts.forEach(el => v.dock.appendChild(el));
      slot.appendChild(v.dock);
    } else if (!land && v.dock.parentNode) {
      parts.forEach((el, i) => v.homes[i].parentNode.insertBefore(el, v.homes[i].nextSibling));
      v.dock.remove();
    }
    // away from the City tab only the quest banner and shortcut buttons stay in the panel
    v.dock.classList.toggle('is-away', Game.screen?.() !== 'city');
    updateSideBadges();
    resize();
    // a rotation changes the view's shape and scale, so frame the town again
    if (v.landState !== undefined && v.landState !== land) { homeCamera(); applyWorldTransform(); requestDraw(); }
    v.landState = land;
  }
  function layoutSide() {
    // the row wraps on its own (flex-wrap in city.css); this only clears grid sizes older builds set inline
    const el = v.els.side;
    if (el && (el.style.gridTemplateColumns || el.style.gridTemplateRows)) { el.style.gridTemplateColumns = ''; el.style.gridTemplateRows = ''; }
  }
  function renderSide() {
    const el = v.els.side;
    if (!el) return;
    el.innerHTML = '';
    for (const [id, def] of v.sideDefs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'city-sidebtn';
      b.id = 'city-side-' + id.replace(/[^a-z0-9_-]/gi, '');
      b.dataset.side = id;
      b.innerHTML = `<span class="city-sidebtn-ico">${Game.hasIcon?.(def.icon) ? Game.icon(def.icon, 26) : Game.icon('star', 26)}<span class="badge-dot" aria-hidden="true" hidden></span></span><span class="city-sidebtn-lbl">${esc(def.label || id)}</span>`;
      b.addEventListener('click', () => { try { def.onClick?.(); } catch (e) { console.error('[city] side button failed', e); } });
      el.appendChild(b);
    }
    layoutSide();
  }
  function setBanner(node) {
    if (typeof node === 'string') node = node.trim() ? Game.el(node) : null;
    v.banner = node instanceof Node ? node : null;
    applyBanner();
  }
  function applyBanner() {
    const el = v.els.banner;
    if (!el) return;
    if (v.banner) { if (el.firstChild !== v.banner || el.childNodes.length !== 1) el.replaceChildren(v.banner); el.hidden = false; } else { el.replaceChildren(); el.hidden = true; }
  }

  // ------------------------------------------------ feedback
  function worldFloat(x, y, html, cls) {
    if (!v.ui) return;
    const f = document.createElement('div');
    f.className = 'city-float' + (cls ? ' ' + cls : '');
    f.style.left = x + 'px';
    f.style.top = y + 'px';
    f.innerHTML = html;
    f.setAttribute('aria-hidden', 'true');
    v.ui.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }
  function onCollect(id, r, amt) {
    const d = B[id];
    worldFloat(d.x, d.y - d.hb[1] + 4, `${Game.icon(r, 18)}<span>+${fmt(amt)}</span>`);
    v.els && update();
  }
  function onLevelUp(id, L) {
    const d = B[id];
    v.fx.push({ x: d.x, y: d.y, t0: performance.now(), seed: Math.random() * TAU });
    worldFloat(d.x, d.y - d.hb[1] * 0.6, `<span>Lv ${L}</span>`, 'is-level');
    requestDraw();
  }
  function onArrival() {
    if (!v.ui || Game.screen?.() !== 'city') return;
    worldFloat(B.furnace.x + 40, B.furnace.y + 30, `${Game.icon('survivor', 16)}<span>+1</span>`, 'is-small');
  }
  function offlineNote(before, sec) {
    if (sec < 600) return;
    const c = C();
    const parts = [];
    const got = c.pop.total - before.total;
    if (got > 0) parts.push(`${got} survivor${got > 1 ? 's' : ''} arrived`);
    if (c.pop.sick > 0) parts.push(`${c.pop.sick} sick`);
    v.offlineMsg = `Away ${fmtT(sec)}. Buildings kept working${parts.length ? ': ' + parts.join(', ') : ''}.`;
  }

  return {
    mount, update, start, stop, requestDraw, focus, addSide, removeSide, setBanner, onCollect, onLevelUp, onArrival, offlineNote,
    applyLayout, updateSideBadges,
    get v() { return v; },
    setHighlight(id) { v.highlight = id && B[id] ? id : null; requestDraw(); },
    mounted: () => !!v.root,
    homeCamera,
    takeOfflineMsg() { const m = v.offlineMsg; v.offlineMsg = null; return m; },
  };
})();

// ================================================================ thumbnails (building sheet)
function drawThumb(canvas, id) {
  const W = 120; const H = 104;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bgG = ctx.createRadialGradient(W / 2, H * 0.62, 6, W / 2, H * 0.62, W * 0.62);
  bgG.addColorStop(0, '#f2f7fb'); bgG.addColorStop(0.7, '#d5e2ee'); bgG.addColorStop(1, 'rgba(200,216,232,0)');
  ctx.fillStyle = bgG;
  ctx.fillRect(0, 0, W, H);
  const d = B[id];
  const [w, up, down] = d.hb;
  const s = Math.min(W / (w + 16), H / (up + down + 10));
  const L = lvl(id);
  const saved = { t: FR.t, motion: FR.motion, lights: FR.lights, smoke: FR.smoke, win: FR.win };
  FR.motion = false; FR.lights = null; FR.smoke = null; FR.win = COL.glass;
  ctx.translate(W / 2, (H - (up + down) * s) / 2 + up * s);
  ctx.scale(s, s);
  const c = C();
  drawBuilding(ctx, id, 0, 0, L, { unlocked: isUnlocked(id), building: false, lit: c.mode !== 'off' && !c.noCoal, mode: c.mode });
  Object.assign(FR, saved);
}

// ================================================================ sheets
let openBuildingSheet = null;
function openSheet(id) {
  if (!B[id] || !Game.S) return;
  View.setHighlight(null);
  buildingSheet(id);
}

function buildingSheet(id) {
  const d = B[id];
  const isProd = !!PRODUCERS[id];
  const res = PRODUCERS[id];
  const body = Game.el(`<div class="city-sheet">
    <div class="city-sh-top">
      <div class="city-thumb-wrap"><canvas class="city-thumb" width="120" height="104" aria-hidden="true"></canvas></div>
      <div class="city-sh-info">
        <div class="city-sh-lv"><span class="city-lv-cur"></span><span class="city-lv-arrow">${Game.icon('chevron_right', 18)}</span><span class="city-lv-next"></span></div>
        <p class="city-sh-desc">${esc(d.desc)}</p>
      </div>
    </div>
    <div class="city-sh-prog panel" hidden>
      <div class="city-sh-prog-head"><span class="city-sh-prog-lbl"></span><span class="city-sh-prog-time">${Game.icon('clock', 16)}<span></span></span></div>
      <div class="progress gold"><div class="bar"></div></div>
    </div>
    ${isProd ? `<div class="city-sh-store card" hidden>
      <div class="city-sh-store-row">${Game.icon(res, 30)}<div class="city-sh-store-txt"><div class="city-sh-store-amt"><span data-stock>0</span><span class="muted"> / <span data-cap>0</span></span></div><div class="city-sh-store-rate muted"><span data-rate>0</span>/h</div></div><button type="button" class="btn green small" id="city-collect-${id}" data-collect>Collect</button></div>
      <div class="progress green"><div class="bar" data-stockbar></div></div>
    </div>
    <div class="city-sh-work card" hidden>
      <div class="city-sh-work-row"><div><div class="city-sh-work-lbl">Workers</div><div class="city-sh-work-sub muted" data-worksub></div></div>
      <div class="city-stepper"><button type="button" class="icon-btn" id="city-w-minus-${id}" data-w="-1" aria-label="One less worker">${Game.icon('minus', 16)}</button><span class="city-stepper-n"><span data-wn>0</span><span class="muted">/<span data-wmax>0</span></span></span><button type="button" class="icon-btn" id="city-w-plus-${id}" data-w="1" aria-label="One more worker">${Game.icon('plus', 16)}</button></div></div>
    </div>` : ''}
    ${id === 'furnace' ? `<div class="city-sh-fur card">
      <div class="city-sh-fur-row"><span class="city-sh-work-lbl">Mode</span><div class="seg" role="group" aria-label="Furnace mode">${Object.entries(MODES).map(([m, x]) => `<button type="button" id="city-fmode-${m}" data-fmode="${m}" aria-pressed="false">${x.label}</button>`).join('')}</div></div>
      <div class="city-sh-fur-stats"><span>Inside <b data-fin></b></span><span>Coal use <b data-fburn></b></span><span>Coal left <b data-fleft></b></span></div>
      <p class="city-sh-note muted" data-fnote></p>
    </div>` : ''}
    ${id === 'infirmary' ? '<div class="city-sh-inf card"><span data-inf></span></div>' : ''}
    <div class="city-sh-sec" data-sec="effects"><h3 class="section-title">Effects</h3><div class="city-effects card"></div></div>
    <div class="city-sh-sec" data-sec="reqs" hidden><h3 class="section-title">Requirements</h3><div class="city-reqs"></div></div>
    <div class="city-sh-sec" data-sec="cost" hidden><h3 class="section-title">Cost</h3><div class="city-cost-row"><div class="city-cost"></div><span class="chip city-time">${Game.icon('clock', 14)}<span data-time></span></span></div></div>
    <div class="city-sh-extra"></div>
  </div>`);
  const thumb = body.querySelector('.city-thumb');
  let thumbSig = '';
  let secSig = '';
  let costSig = '';

  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.collect !== undefined) { collect(id); h.refresh(); return; }
    if (b.dataset.w) { setWorkers(id, (C().workers[id] || 0) + Number(b.dataset.w)); h.refresh(); return; }
    if (b.dataset.fmode) { setMode(b.dataset.fmode); h.refresh(); return; }
    if (b.dataset.go) { Game.navigate('city:building:' + b.dataset.go); return; }
    if (b.dataset.extra !== undefined) {
      const a = (extraActions.get(id) || [])[Number(b.dataset.extra)];
      try { a?.onClick?.(); } catch (err) { console.error('[city] building action failed', err); }
    }
  });

  function renderSections(st) {
    const L = lvl(id);
    const next = Math.min(FMAX, L + 1);
    const showNext = st.s !== 'max';
    // effects
    const cur = effectRows(id, L);
    const nxt = showNext ? effectRows(id, next) : null;
    let rows = cur.map((r, i) => {
      const n = nxt?.[i]?.[1];
      const changed = n != null && n !== r[1];
      return `<div class="city-eff-row"><span class="city-eff-lbl">${esc(r[0])}</span><span class="city-eff-val"><span>${esc(r[1])}</span>${changed ? `${Game.icon('chevron_right', 14)}<span class="good-text">${esc(n)}</span>` : ''}</span></div>`;
    }).join('');
    if (id === 'furnace' && showNext) {
      const un = unlocksAt(next);
      if (un.length) rows += `<div class="city-eff-row"><span class="city-eff-lbl">Unlocks</span><span class="city-eff-val good-text">${esc(un.join(', '))}</span></div>`;
    }
    body.querySelector('.city-effects').innerHTML = rows;
    // requirements
    const reqs = st.s === 'max' || st.s === 'building' ? [] : reqsFor(id, next);
    const rsec = body.querySelector('[data-sec="reqs"]');
    rsec.hidden = !reqs.length;
    body.querySelector('.city-reqs').innerHTML = reqs.map(r => `<div class="city-req card${r.met ? ' is-met' : ''}"><span class="city-req-ico">${Game.icon(r.met ? 'check' : 'lock', 16)}</span><span class="city-req-txt">${esc(B[r.id].name)} <b>Lv ${r.level}</b>${r.met ? '' : ` <span class="muted">(now ${lvl(r.id) || 'not built'})</span>`}</span>${r.met ? '' : `<button type="button" class="btn blue small" id="city-go-${id}-${r.id}" data-go="${r.id}">Go</button>`}</div>`).join('');
    // extra actions from other modules
    const acts = extraActions.get(id) || [];
    const ex = body.querySelector('.city-sh-extra');
    ex.innerHTML = acts.length && L > 0 ? `<div class="city-extra-row">${acts.map((a, i) => `<button type="button" class="btn ${esc(a.kind || 'blue')} small" id="city-x-${id}-${i}" data-extra="${i}">${a.icon ? Game.icon(a.icon, 16) : ''}<span>${esc(a.label)}</span></button>`).join('')}</div>` : '';
  }

  const h = Game.sheet({
    title: d.name,
    body,
    className: 'city-bsheet',
    update: (bodyEl, hd) => {
      if (!Game.S) return;
      const c = C();
      const L = lvl(id);
      const st = upgradeState(id);
      const t = buildTimer(id);
      // header
      const tsig = L + ':' + isUnlocked(id) + ':' + c.mode + ':' + c.noCoal;
      if (tsig !== thumbSig) { thumbSig = tsig; drawThumb(thumb, id); }
      Game.setText(bodyEl.querySelector('.city-lv-cur'), L < 1 ? (isUnlocked(id) ? 'Not built' : 'Locked') : `Lv ${L}`);
      const nextEl = bodyEl.querySelector('.city-lv-next');
      const arrow = bodyEl.querySelector('.city-lv-arrow');
      const showNext = st.s !== 'max' && st.s !== 'locked';
      nextEl.hidden = !showNext;
      arrow.hidden = !showNext;
      Game.setText(nextEl, st.s === 'max' ? '' : `Lv ${Math.min(FMAX, L + 1)}`);
      // progress while building
      const prog = bodyEl.querySelector('.city-sh-prog');
      prog.hidden = !t;
      if (t) {
        Game.setText(prog.querySelector('.city-sh-prog-lbl'), L < 1 ? 'Building' : `Upgrading to Lv ${t.data?.level ?? L + 1}`);
        Game.setText(prog.querySelector('.city-sh-prog-time span'), fmtT(Game.timers.remaining(t.id)));
        prog.querySelector('.bar').style.width = (Game.timers.progress(t.id) * 100).toFixed(1) + '%';
      }
      // producer blocks
      if (isProd) {
        const store = bodyEl.querySelector('.city-sh-store');
        const work = bodyEl.querySelector('.city-sh-work');
        store.hidden = L < 1;
        work.hidden = L < 1;
        if (L > 0) {
          const stock = c.stock[id] || 0;
          const cap = storageCap(id);
          Game.setText(bodyEl.querySelector('[data-stock]'), fmt(stock));
          Game.setText(bodyEl.querySelector('[data-cap]'), fmt(cap));
          Game.setText(bodyEl.querySelector('[data-rate]'), fmt(Math.round(rateOf(id))));
          bodyEl.querySelector('[data-stockbar]').style.width = clamp((stock / Math.max(1, cap)) * 100, 0, 100).toFixed(1) + '%';
          bodyEl.querySelector('[data-collect]').disabled = stock < 1;
          const w = c.workers[id] || 0;
          const max = slots(L);
          Game.setText(bodyEl.querySelector('[data-wn]'), w);
          Game.setText(bodyEl.querySelector('[data-wmax]'), max);
          const idl = idle();
          let sub = `${idl} idle survivor${idl === 1 ? '' : 's'}`;
          if (c.pop.sick > 0) sub += `. ${c.pop.sick} sick, they skip work`;
          Game.setText(bodyEl.querySelector('[data-worksub]'), sub);
          bodyEl.querySelector('[data-w="-1"]').disabled = w <= 0;
          bodyEl.querySelector('[data-w="1"]').disabled = w >= max || idl <= 0;
        }
      }
      if (id === 'furnace') {
        const env = refreshEnv();
        bodyEl.querySelectorAll('[data-fmode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fmode === c.mode)));
        Game.setText(bodyEl.querySelector('[data-fin]'), `${Math.round(env.inside)}° ${COMFORT[env.comfort].label}`);
        Game.setText(bodyEl.querySelector('[data-fburn]'), c.mode === 'off' ? 'None' : `${fmt(Math.round(burnPerHour()))}/h`);
        const hours = ((Game.S.res.coal || 0) + (c.stock.coalmine || 0)) / Math.max(1e-6, burnPerHour());
        Game.setText(bodyEl.querySelector('[data-fleft]'), c.mode === 'off' ? '-' : c.noCoal ? 'None' : hours > 99 ? '99h+' : fmtT(hours * 3600));
        Game.setText(bodyEl.querySelector('[data-fnote]'), `${MODES[c.mode].desc} The Furnace level also caps every other building.`);
      }
      if (id === 'infirmary') {
        const p = c.pop;
        Game.setText(bodyEl.querySelector('[data-inf]'), L < 1 ? 'Sick survivors recover slowly on their own while warm and fed.' : p.sick > 0 ? `${p.sick} sick survivor${p.sick > 1 ? 's' : ''}. Healing 1 every ${healSecAt(L)}s.` : 'Nobody is sick right now.');
      }
      // sections rebuilt only when their content changes
      const ssig = [L, st.s, ...(st.reqs || []).map(r => r.met)].join('|');
      if (ssig !== secSig) { secSig = ssig; renderSections(st); }
      const costSec = bodyEl.querySelector('[data-sec="cost"]');
      const showCost = st.s === 'ok' || st.s === 'reqs';
      costSec.hidden = !showCost;
      if (showCost) {
        const cost = st.cost || upgradeCost(id, L + 1);
        const csig = Object.entries(cost).map(([k, v]) => k + v + ((Game.S.res[k] || 0) >= v)).join(',');
        if (csig !== costSig) { costSig = csig; bodyEl.querySelector('.city-cost').innerHTML = Game.costHtml(cost); }
        Game.setText(bodyEl.querySelector('[data-time]'), fmtT(upgradeTime(id, L + 1)));
      }
      // which actions show
      const show = {
        instant: st.s === 'ok',
        upgrade: st.s === 'ok' || st.s === 'reqs',
        speed: !!t,
        gofurnace: st.s === 'locked',
      };
      hd?.el?.querySelectorAll('.sheet-actions [data-action]').forEach(b => { const on = !!show[b.dataset.action]; if (b.hidden === on) b.hidden = !on; });
      const acts = hd?.el?.querySelector('.sheet-actions');
      if (acts) acts.hidden = !Object.values(show).some(Boolean);
    },
    actions: [
      {
        id: 'instant',
        kind: 'blue',
        label: () => {
          const info = instantInfo(id);
          return `<span>Instant</span><span class="btn-cost">${Game.icon('gem', 18)}${info ? Game.fmtFull(info.gems) : '-'}</span>`;
        },
        disabled: () => !instantInfo(id),
        onClick: () => { instantSheet(id); return false; },
      },
      {
        id: 'upgrade',
        kind: 'gold',
        label: () => (lvl(id) < 1 ? `${Game.icon('hammer', 18)}<span>Build</span>` : `${Game.icon('arrow_up', 16)}<span>Upgrade</span>`),
        disabled: () => upgradeState(id).s !== 'ok',
        onClick: () => (startUpgrade(id) ? undefined : false),
      },
      {
        id: 'speed',
        kind: () => (buildTimer(id) && Game.timers.remaining(timerId(id)) <= Game.perk('freeFinishSec') ? 'green' : 'gold'),
        label: () => (buildTimer(id) && Game.timers.remaining(timerId(id)) <= Game.perk('freeFinishSec') ? `${Game.icon('check', 18)}<span>Free</span>` : `${Game.icon('speedup', 18)}<span>Speed up</span>`),
        onClick: () => { onTimerTapPublic(id); return false; },
      },
      {
        id: 'gofurnace',
        kind: 'blue',
        label: () => `<span>Go to Furnace</span>`,
        onClick: () => { Game.navigate('city:building:furnace'); },
      },
    ],
    onClose: () => {
      if (openBuildingSheet === h) openBuildingSheet = null;
      if (thumb) { thumb.width = 0; thumb.height = 0; }
    },
  });
  openBuildingSheet = h;
  return h;
}
function onTimerTapPublic(id) {
  const tid = timerId(id);
  if (!Game.timers.get(tid)) return;
  const rem = Game.timers.remaining(tid);
  if (rem <= Game.perk('freeFinishSec')) {
    Game.timers.finishNow(tid);
    Game.emit('speedup:used', { seconds: rem, timerId: tid, kind: 'build', free: true });
    return;
  }
  Game.speedupSheet(tid);
}

function busySheet() {
  const body = Game.el(`<div class="city-busy">
    <p class="city-sh-note">${builders() > 1 ? 'Both builders are working.' : 'Your builder is working.'} Speed up a build to free a builder.</p>
    <div class="city-busy-list"></div>
    ${builders() < 2 ? `<div class="city-busy-vip card">${Game.icon('hammer', 28)}<div><div class="city-sh-work-lbl">Second builder</div><div class="muted city-busy-sub">Build two things at once. Comes with VIP or a Shop offer.</div></div><button type="button" class="btn gold small" id="city-busy-vip" data-vip>Get</button></div>` : ''}
  </div>`);
  let sig = '';
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.vip !== undefined) { Game.navigate('shop:vip'); return; }
    if (b.dataset.tid) {
      const id = b.dataset.tid.replace(/^build:/, '');
      onTimerTapPublic(id);
    }
  });
  return Game.sheet({
    title: 'Builders busy',
    body,
    update: bodyEl => {
      const list = activeBuilds();
      if (!list.length || builderFree()) {
        const s2 = 'free';
        if (sig !== s2) { sig = s2; bodyEl.querySelector('.city-busy-list').innerHTML = '<p class="city-sh-note good-text">A builder is free now.</p>'; }
        return;
      }
      const s = list.map(t => t.id).join();
      if (s !== sig) {
        sig = s;
        bodyEl.querySelector('.city-busy-list').innerHTML = list.map(t => `<div class="city-busy-row card" data-row="${esc(t.id)}">${Game.icon('hammer', 22)}<div class="city-busy-txt"><div class="city-sh-work-lbl">${esc(t.label)}</div><div class="progress gold"><div class="bar"></div></div></div><button type="button" class="btn gold small" id="city-busy-${esc(t.id.replace(/[^a-z0-9_-]/gi, ''))}" data-tid="${esc(t.id)}"></button></div>`).join('');
      }
      for (const t of list) {
        const row = bodyEl.querySelector(`[data-row="${CSS.escape(t.id)}"]`);
        if (!row) continue;
        const rem = Game.timers.remaining(t.id);
        const free = rem <= Game.perk('freeFinishSec');
        const btn = row.querySelector('button');
        Game.setText(btn, free ? 'Free' : fmtT(rem));
        btn.className = 'btn small ' + (free ? 'green' : 'gold');
        btn.setAttribute('aria-label', free ? `Finish ${t.label} for free` : `Speed up ${t.label}, ${fmtT(rem)} left`);
        row.querySelector('.bar').style.width = (Game.timers.progress(t.id) * 100).toFixed(1) + '%';
      }
    },
  });
}

function shortSheet(id) {
  const st = upgradeState(id);
  if (st.s !== 'ok') return;
  const cost = st.cost;
  const need = {};
  for (const [k, v] of Object.entries(resOnly(cost))) if ((Game.S.res[k] || 0) < v) need[k] = v;
  Game.missingSheet(need, {
    title: 'Not enough resources',
    message: 'Collect from your buildings, open crates, or cover the rest with Gems.',
    actions: [{
      id: 'buyfill',
      kind: 'gold',
      label: () => {
        const g = gemsForRes(resOnly(Game.missing(cost)));
        return g > 0 ? `<span>Buy and ${lvl(id) < 1 ? 'build' : 'upgrade'}</span><span class="btn-cost">${Game.icon('gem', 18)}${Game.fmtFull(g)}</span>` : `<span>${lvl(id) < 1 ? 'Build' : 'Upgrade'} now</span>`;
      },
      onClick: () => {
        const m = resOnly(Game.missing(cost));
        const g = gemsForRes(m);
        if (g > 0) {
          if (!Game.spend({ gems: g }, 'resources:' + id)) { Game.needGems(g); return false; }
          Game.grant(m, { source: 'gems' });
        }
        startUpgrade(id);
        return undefined;
      },
    }],
  });
}

function survivorsSheet() {
  const body = Game.el(`<div class="city-surv">
    <div class="city-surv-stats">
      <div class="city-stat card"><span class="city-stat-n" data-s="total"></span><span class="city-stat-l">Survivors</span></div>
      <div class="city-stat card"><span class="city-stat-n good-text" data-s="healthy"></span><span class="city-stat-l">Healthy</span></div>
      <div class="city-stat card"><span class="city-stat-n" data-s="sick"></span><span class="city-stat-l">Sick</span></div>
      <div class="city-stat card"><span class="city-stat-n" data-s="idle"></span><span class="city-stat-l">Idle</span></div>
    </div>
    <div class="city-cond card">
      <div class="city-cond-row">${Game.icon('thermo', 20)}<span data-s="comfort"></span></div>
      <div class="city-cond-row">${Game.icon('meat', 20)}<span data-s="food"></span></div>
      <div class="city-cond-row">${Game.icon('survivor', 20)}<span data-s="arrive"></span><button type="button" class="btn blue small" id="city-surv-shelter" data-go="shelter" hidden>Go</button></div>
      <div class="city-cond-row">${Game.icon('city_sick', 20)}<span data-s="heal"></span><button type="button" class="btn blue small" id="city-surv-inf" data-go="infirmary" hidden>Go</button></div>
    </div>
    <h3 class="section-title">Workers</h3>
    <div class="city-surv-work"></div>
    <p class="city-sh-note muted">Sick survivors skip work. Idle survivors fill in for them.</p>
  </div>`);
  let sig = '';
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.go) { Game.navigate('city:building:' + b.dataset.go); return; }
    if (b.dataset.wid) { setWorkers(b.dataset.wid, (C().workers[b.dataset.wid] || 0) + Number(b.dataset.dir)); sh.refresh(); }
  });
  const sh = Game.sheet({
    title: 'Survivors',
    body,
    update: bodyEl => {
      if (!Game.S) return;
      const c = C();
      const p = c.pop;
      const env = refreshEnv();
      const q = k => bodyEl.querySelector(`[data-s="${k}"]`);
      Game.setText(q('total'), `${p.total}/${popCap()}`);
      Game.setText(q('healthy'), healthy());
      Game.setText(q('sick'), p.sick);
      q('sick').classList.toggle('bad-text', p.sick > 0);
      Game.setText(q('idle'), idle());
      const comf = COMFORT[env.comfort];
      Game.setText(q('comfort'), `${comf.label} (${Math.round(env.inside)}°). Output ${Math.round(comf.eff * 100)}%.${env.comfort === 'cold' || env.comfort === 'freezing' ? ' Survivors are getting sick: switch to Overdrive or upgrade the Furnace.' : ''}`);
      Game.setText(q('food'), c.hungry ? `Out of Meat. Output ${Math.round(HUNGRY_EFF * 100)}% and survivors fall sick.` : `Fed. Survivors eat ${fmt(Math.round(eatPerHour()))} Meat per hour.`);
      const full = p.total >= popCap();
      const comfy = env.comfort === 'warm' || env.comfort === 'chilly';
      const jobless = idle();
      let arr;
      // idle survivors matter more than room for new ones: more people would only add to the idle count
      if (jobless > 0 && freeSlots() <= 0) arr = `${jobless} ${jobless === 1 ? 'survivor has' : 'survivors have'} no job. Upgrade resource buildings for more worker slots.`;
      else if (jobless > 0) arr = `${jobless} ${jobless === 1 ? 'survivor has' : 'survivors have'} no job. Tap Auto-assign or add workers below.`;
      else if (full) arr = 'The Shelter is full. Upgrade it to take in more survivors.';
      else if (!comfy) arr = 'Too cold for newcomers. Warm the city to attract survivors.';
      else if (c.hungry) arr = 'No food for newcomers.';
      else arr = `Next survivor in about ${fmtT(Math.max(1, arrivalNeed(p.total) - p.arr))}.`;
      Game.setText(q('arrive'), arr);
      bodyEl.querySelector('[data-go="shelter"]').hidden = !full || jobless > 0;
      const inf = lvl('infirmary');
      Game.setText(q('heal'), inf > 0 ? `Infirmary heals 1 every ${healSecAt(inf)}s.` : isUnlocked('infirmary') ? 'Build the Infirmary to heal the sick faster.' : `Sick survivors heal slowly while warm and fed. The Infirmary opens at Furnace Lv ${B.infirmary.unlock}.`);
      bodyEl.querySelector('[data-go="infirmary"]').hidden = !(inf < 1 && isUnlocked('infirmary'));
      const ids = PROD_IDS.filter(id => lvl(id) > 0);
      const s = ids.join();
      const list = bodyEl.querySelector('.city-surv-work');
      if (s !== sig) {
        sig = s;
        list.innerHTML = ids.map(id => `<div class="city-wrow card" data-wrow="${id}">${Game.icon(PRODUCERS[id], 26)}<div class="city-wrow-txt"><div class="city-sh-work-lbl">${esc(B[id].name)} <span class="muted">Lv ${lvl(id)}</span></div><div class="muted city-wrow-rate"><span data-r></span>/h</div></div><div class="city-stepper"><button type="button" class="icon-btn" id="city-sw-m-${id}" data-wid="${id}" data-dir="-1" aria-label="One less worker at ${esc(B[id].name)}">${Game.icon('minus', 16)}</button><span class="city-stepper-n"><span data-n></span><span class="muted">/<span data-m></span></span></span><button type="button" class="icon-btn" id="city-sw-p-${id}" data-wid="${id}" data-dir="1" aria-label="One more worker at ${esc(B[id].name)}">${Game.icon('plus', 16)}</button></div></div>`).join('');
      }
      const idl = idle();
      for (const id of ids) {
        const row = list.querySelector(`[data-wrow="${id}"]`);
        if (!row) continue;
        const w = c.workers[id] || 0;
        Game.setText(row.querySelector('[data-n]'), w);
        Game.setText(row.querySelector('[data-m]'), slots(lvl(id)));
        Game.setText(row.querySelector('[data-r]'), fmt(Math.round(rateOf(id))));
        row.querySelector('[data-dir="-1"]').disabled = w <= 0;
        row.querySelector('[data-dir="1"]').disabled = w >= slots(lvl(id)) || idl <= 0;
      }
    },
    actions: [{ id: 'auto', kind: 'blue', label: 'Auto-assign', onClick: () => { autoAssign(); Game.toast('Workers assigned', 'good'); return false; } }],
  });
  return sh;
}

// ================================================================ icons used by this module
Game.addIcon('city_sun', '<circle cx="12" cy="12" r="4.6" fill="#ffd35a" stroke="#c98a12" stroke-width="1"/><g stroke="#ffc533" stroke-width="1.8" stroke-linecap="round">' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path transform="rotate(${a} 12 12)" d="M12 2.6v2.6"/>`).join('') + '</g>');
Game.addIcon('city_moon', '<path d="M15.5 3.2a8.8 8.8 0 1 0 5.3 13.6A7.2 7.2 0 0 1 15.5 3.2Z" fill="#cfe6ff" stroke="#6d93c4" stroke-width="1"/><circle cx="10" cy="10" r="1.2" fill="#a9c6ea"/><circle cx="12.5" cy="16" r="1.6" fill="#a9c6ea"/>');
Game.addIcon('city_sick', '<rect x="3" y="3" width="18" height="18" rx="4" fill="#f4f7fa" stroke="#8d9fb1" stroke-width="1"/><path d="M10 6.2h4v3.8h3.8v4H14v3.8h-4V14H6.2v-4H10Z" fill="#e2483d"/>');
Game.addIcon('city_idle', '<path d="M3.5 8.5h7l-7 8h7" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 4h6l-6 7h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
Game.addIcon('city_down', '<path d="M12 21 3.8 12H9V3.2h6V12h5.2Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>');

// ================================================================ registration
Game.registerModule({
  id: 'city',
  initState: newCityState,
  migrate: migrateCity,
  tick,
  offline,
  power: cityPower,
});

// landscape dock follows rotation and the active tab; its shortcut badges keep updating on other tabs
Game.on('layout:changed', () => { if (View.mounted()) View.applyLayout(); });
Game.on('screen:shown', () => { if (View.mounted()) View.applyLayout(); });

Game.registerScreen('city', {
  tab: { label: 'City', icon: 'city', order: 1 },
  fullBleed: true,
  mount: el => View.mount(el),
  update: () => View.update(),
});

Game.registerNav('city:building', rest => {
  const id = String(rest || '').split(':')[0];
  if (!B[id]) return;
  View.focus(id);
  openSheet(id);
});

Game.registerNav('city:survivors', () => { survivorsSheet(); });
Game.on('screen:shown', p => { if (p?.id === 'city') View.start(); else View.stop(); });
Game.on('motion:changed', () => { if (Game.screen?.() === 'city') { View.stop(); View.start(); } });
Game.on('ready', () => {
  const msg = View.takeOfflineMsg();
  if (msg) Game.toast(msg, 'info');
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && Game.screen?.() === 'city') View.start(); });

Game.city = {
  level: id => lvl(id),
  addSideButton: def => View.addSide(def),
  removeSideButton: id => View.removeSide(id),
  setBanner: el => View.setBanner(el),
  openBuilding: id => {
    if (!B[id]) return;
    if (Game.screen?.() !== 'city') { Game.navigate('city:building:' + id); return; }
    View.focus(id);
    openSheet(id);
  },
  // extras
  ids: ORDER.slice(),
  name: id => B[id]?.name || String(id),
  unlockLevel: id => B[id]?.unlock ?? 99,
  maxLevel: id => (id === 'furnace' ? FMAX : lvl('furnace')),
  isUpgrading: id => !!buildTimer(id),
  canUpgrade: id => canUpgradeNow(id),
  upgrade: id => startUpgrade(id),
  upgradeCost: (id, level) => (B[id] ? upgradeCost(id, level ?? lvl(id) + 1) : null),
  focus: id => View.focus(id),
  highlight: id => View.setHighlight(id),
  collect: id => collect(id),
  collectAll,
  production: type => productionOf(type),
  stock: id => Math.floor(Game.S?.city?.stock?.[id] || 0),
  survivors: () => {
    if (!Game.S) return { total: 0, cap: 0, healthy: 0, sick: 0, idle: 0 };
    return { total: C().pop.total, cap: popCap(), healthy: healthy(), sick: C().pop.sick, idle: idle() };
  },
  temperature: () => {
    const e = refreshEnv();
    return { outside: Math.round(e.outside), inside: Math.round(e.inside), comfort: e.comfort, mode: Game.S?.city?.mode ?? 'on', lit: e.lit, blizzard: e.bz > 0 };
  },
  setMode,
  autoAssign,
  openSurvivors: () => Game.navigate('city:survivors'),
  setBuildingInfo: (id, fn) => { if (B[id] && typeof fn === 'function') extraInfo.set(id, fn); },
  addBuildingAction: (id, def) => {
    if (!B[id] || !def || typeof def.onClick !== 'function') return;
    const list = extraActions.get(id) || [];
    const i = def.id ? list.findIndex(a => a.id === def.id) : -1;
    if (i >= 0) list[i] = def; else list.push(def);
    extraActions.set(id, list);
  },
};
