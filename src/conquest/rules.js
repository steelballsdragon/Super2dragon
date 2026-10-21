/* Age of Conquest rules: bonuses, production, storage, upkeep, power, army strength, the battle resolver and
   scout reports. The battle resolver is a pure function of its input, so any report can be replayed exactly.
   Part of the engine bundle. */

// ================================================================ bonuses
function addMods(out, mods, k = 1) {
  if (!mods) return out;
  for (const key in mods) out[key] = (out[key] || 0) + mods[key] * k;
  return out;
}
function techMods(g) {
  const t = g.tech, m = {};
  const lv = id => t[id] || 0;
  m.food = lv('agri') * 0.05; m.wood = lv('forestry') * 0.05; m.stone = lv('masonry') * 0.04; m.buildSpeed = lv('masonry') * 0.03;
  m.iron = lv('metal') * 0.05; m.gold = lv('trade') * 0.06; m.tradeFee = -lv('trade') * 0.02; m.storage = lv('logistics') * 0.08; m.load = lv('logistics') * 0.05;
  m.infAtk = m.infDef = lv('drill') * 0.03; m.cavAtk = m.cavDef = lv('horse') * 0.03; m.arcAtk = m.arcDef = lv('archery') * 0.03; m.sieAtk = lv('siegecraft') * 0.05;
  m.capacity = lv('formations') * 0.06; m.heal = lv('medicine') * 0.06; m.hospital = lv('medicine') * 0.05;
  m.scoutAcc = lv('scouting') * 0.08; m.scoutSpeed = lv('scouting') * 0.05; m.counter = lv('counter') * 0.06; m.speed = lv('carto') * 0.03;
  m.wallDef = lv('fortify') * 0.04; m.wallDur = lv('fortify') * 0.05;
  return m;
}
// the commander record a governor owns: { lv, xp, sk: [active, p1, p2, ult], tal: { branch: points } }
function cmdRec(g, id) { return id && g.cmds[id] ? g.cmds[id] : null; }
function commanderMods(g, id, ctx) {
  const d = CMD[id], r = cmdRec(g, id);
  const m = {};
  if (!d || !r) return m;
  const skillK = sk => 1 + 0.2 * ((sk || 1) - 1);
  d.passives.forEach((p, i) => {
    if (p.steward) return;
    if (p.when && !(ctx && ctx[p.when])) return;
    addMods(m, p.mods, skillK(r.sk[i + 1]));
  });
  if (r.lv >= ULTIMATE_LEVEL && d.ultimate.mods && !d.ultimate.steward && (!d.ultimate.when || (ctx && ctx[d.ultimate.when]))) addMods(m, d.ultimate.mods, skillK(r.sk[3]));
  if (ctx && ctx.primary) for (const b in r.tal) addMods(m, TALENT_STATS[b], r.tal[b]);
  // level adds a little to everything the commander leads
  m.atk = (m.atk || 0) + r.lv * 0.003;
  m.def = (m.def || 0) + r.lv * 0.003;
  return m;
}
function stewardMods(g) {
  const d = CMD[g.steward], r = cmdRec(g, g.steward);
  const m = {};
  if (!d || !r) return m;
  d.passives.forEach((p, i) => { if (p.steward) addMods(m, p.mods, 1 + 0.2 * ((r.sk[i + 1] || 1) - 1)); });
  if (r.lv >= ULTIMATE_LEVEL && d.ultimate.steward) addMods(m, d.ultimate.mods);
  return m;
}
// guild bonus for cities inside their own guild's territory: +8% production while it holds the Capital, plus the
// guild's Shared Granaries
function guildProdBonus(w, g) {
  if (g.guild < 0) return 0;
  const gd = w.guilds[g.guild];
  const own = w.map.terr ? w.map.terr[idx(g.x, g.y)] === g.guild + 1 : false;
  if (!own) return 0;
  const cap = w.marks.some(m => m.kind === 'capital' && m.owner === g.guild) ? 0.08 : 0;
  return cap + (gd.tech.granary || 0) * 0.02;
}
// the blessings of the holy sites a guild holds, for every member wherever they are; the same blessing twice
// counts once. Cached until a landmark changes hands (recomputeTerritory bumps w._me).
function blessingMods(w, gi) {
  if (gi < 0) return null;
  const c = w._bless || (w._bless = { me: -1, by: [] });
  if (c.me !== w._me) {
    c.me = w._me;
    c.by = w.guilds.map(() => null);
    const seen = w.guilds.map(() => new Set());
    for (const mk of w.marks) {
      if (!mk.blessing || mk.owner < 0 || seen[mk.owner].has(mk.blessing)) continue;
      seen[mk.owner].add(mk.blessing);
      addMods(c.by[mk.owner] || (c.by[mk.owner] = {}), BLESSINGS[mk.blessing].mods);
    }
  }
  return c.by[gi];
}
// cached for the current game minute; anything that changes a bonus mid-minute calls modsChanged(g)
function cityMods(w, g) {
  const key = w.t * 64 + (g._mv || 0) % 64;
  if (g._mk === key && g._me === w._me) return g._m;
  const m = computeCityMods(w, g);
  g._m = m; g._mk = key; g._me = w._me;
  return m;
}
function modsChanged(g) { g._mv = (g._mv || 0) + 1; }
function computeCityMods(w, g) {
  const m = {};
  addMods(m, CIV[g.civ].mods);
  addMods(m, techMods(g));
  addMods(m, stewardMods(g));
  const gb = guildProdBonus(w, g);
  if (gb) for (const r of RES) m[r] = (m[r] || 0) + gb;
  const bl = blessingMods(w, g.guild);
  if (bl) addMods(m, bl);
  return m;
}

// ================================================================ economy
function storage(w, g, m) { return Math.round(storageCap(g.b.warehouse || 0, g.b.hall) * (1 + (m.storage || 0))); }
function troopsTotal(t) { return (t.inf || 0) + (t.cav || 0) + (t.arc || 0) + (t.sie || 0); }
function upkeepPerHour(g) {
  let u = 0;
  for (const k of UNIT_KEYS) u += ((g.troops[k] || 0) + (g.away[k] || 0)) * UNITS[k].upkeep;
  return u;
}
const PRODUCER = { food: 'farm', wood: 'lumber', stone: 'quarry', iron: 'mine', gold: 'market' };
// per hour, before upkeep
function production(w, g, m) {
  m = m || cityMods(w, g);
  const out = {};
  for (const r of RES) {
    const L = g.b[PRODUCER[r]] || 0;
    let base = BASE_PRODUCTION[r] + productionAt(L) * (r === 'gold' ? 0.35 : r === 'iron' ? 0.6 : r === 'stone' ? 0.8 : 1);
    let k = 1 + (m[r] || 0);
    k *= eventMult(w, g, r, m);
    out[r] = Math.max(0, base * k);
  }
  return out;
}
function eventMult(w, g, r, m) {
  let k = 1;
  for (const e of w.events) {
    if (e.res && e.res !== r && e.res !== 'all') continue;
    if (e.region != null && e.region !== regionAt(w, g.x, g.y)) continue;
    if (e.kind === 'winter' && (m.winterProof || 0) > 0) continue;
    k *= e.mult;
  }
  return k;
}
// bring a governor's stock up to time `now`. Deterministic: only called at fixed simulation moments.
function settle(w, g, now) {
  const dt = (now - g.at) / 60;   // hours
  if (dt <= 0) { g.at = Math.max(g.at, now); return; }
  const m = cityMods(w, g);
  const prod = production(w, g, m);
  const cap = storage(w, g, m);
  const up = upkeepPerHour(g);
  for (const r of RES) {
    let v = g.res[r];
    const add = prod[r] * dt;
    if (v < cap) v = Math.min(cap, v + add);
    if (r === 'food') v -= up * dt;
    g.res[r] = v;
  }
  if (g.res.food < 0) {
    // not enough food: a share of the troops at home deserts
    const deficit = -g.res.food;
    g.res.food = 0;
    const frac = Math.min(0.5, deficit / Math.max(1, up * 10));
    let lost = 0;
    for (const k of UNIT_KEYS) { const n = Math.floor((g.troops[k] || 0) * frac); g.troops[k] -= n; lost += n; }
    if (lost > 0) {
      remember(w, g, { k: 'starve', n: lost });
      g.stats.deserted = (g.stats.deserted || 0) + lost;
    }
  }
  // walls repair 2% of their durability per hour
  const maxDur = wallMax(g, m);
  if (g.wallDur < maxDur) g.wallDur = Math.min(maxDur, g.wallDur + maxDur * 0.02 * dt);
  g.at = now;
}
// what the stock would be at `now`, without changing anything (for the interface)
function projectRes(w, g, now) {
  const dt = Math.max(0, (now - g.at) / 60);
  const m = cityMods(w, g);
  const prod = production(w, g, m);
  const cap = storage(w, g, m);
  const up = upkeepPerHour(g);
  const out = {};
  for (const r of RES) {
    let v = g.res[r];
    if (v < cap) v = Math.min(cap, v + prod[r] * dt);
    if (r === 'food') v = Math.max(0, v - up * dt);
    out[r] = v;
  }
  return out;
}
function wallMax(g, m) { return Math.round(wallDurability(g.b.wall || 0) * (1 + (m.wallDur || 0))); }
function canAfford(g, cost) { for (const r in cost) if ((g.res[r] || 0) < cost[r] - 1e-6) return false; return true; }
function pay(g, cost) { for (const r in cost) g.res[r] -= cost[r]; }
function refund(g, cost, k = 1) { for (const r in cost) g.res[r] += cost[r] * k; }
function scaleCost(cost, n) { const o = {}; for (const r in cost) o[r] = Math.ceil(cost[r] * n); return o; }
function costValue(cost) { let v = 0; for (const r in cost) v += cost[r] * RES_VALUE[r]; return v; }
const RES_VALUE = { food: 1, wood: 1, stone: 1.5, iron: 3, gold: 5 };

// ================================================================ power (public)
function troopPower(t) { let p = 0; for (const k of UNIT_KEYS) p += (t[k] || 0) * (UNITS[k].atk + UNITS[k].def + UNITS[k].hp) / 10; return p; }
function computePower(g) {
  let p = 0;
  for (const b of BUILDING_KEYS) { const L = g.b[b] || 0; p += Math.pow(L, 1.5) * (b === 'hall' ? 120 : 40); }
  for (const t of TECH_KEYS) p += (g.tech[t] || 0) * 60;
  for (const id in g.cmds) p += g.cmds[id].lv * 50;
  p += troopPower(g.troops) + troopPower(g.away);
  return Math.round(p);
}

// ================================================================ armies
// ctx: { attack, defend, city, rally, reinforce, field, territory, forest, terrain }
function armySide(w, g, troops, c1, c2, ctx, label) {
  const m = {};
  addMods(m, CIV[g.civ].mods);
  addMods(m, techMods(g));
  if (c1) addMods(m, commanderMods(g, c1, { ...ctx, primary: true }));
  if (c2 && c2 !== c1) addMods(m, commanderMods(g, c2, ctx));
  for (const s of SYNERGY) if ((s.a === c1 && s.b === c2) || (s.a === c2 && s.b === c1)) addMods(m, s.mods);
  if (g.guild >= 0) {
    const gt = w.guilds[g.guild].tech;
    m.atk = (m.atk || 0) + (gt.banners || 0) * 0.02; m.def = (m.def || 0) + (gt.bulwark || 0) * 0.02;
    const bl = blessingMods(w, g.guild);
    if (bl) for (const k of ['atk', 'def', 'hp']) if (bl[k]) m[k] = (m[k] || 0) + bl[k];
  }
  if (ctx.city && ctx.defend) m.def = (m.def || 0) + (m.cityDef || 0);
  if (ctx.reinforce) m.def = (m.def || 0) + (m.reinforce || 0);
  const rough = ctx.terrain === T.forest || ctx.terrain === T.hills || ctx.terrain === T.snow;
  if (rough) m.def = (m.def || 0) + (m.roughDef || 0);
  const variant = CIV[g.civ].variant;
  const mul = { atk: {}, def: {}, hp: {} };
  for (const u of UNIT_KEYS) {
    let a = 1 + (m.atk || 0) + (m[u + 'Atk'] || 0);
    let d = 1 + (m.def || 0) + (m[u + 'Def'] || 0);
    let h = 1 + (m.hp || 0);
    if (variant.unit === u) {
      a += variant.mods.atk || 0; d += variant.mods.def || 0; h += variant.mods.hp || 0;
      if (ctx.terrain === T.forest) a += variant.mods.forestAtk || 0;
    }
    mul.atk[u] = Math.max(0.3, a); mul.def[u] = Math.max(0.3, d); mul.hp[u] = Math.max(0.3, h);
  }
  const cmd = c1 && cmdRec(g, c1) ? { id: c1, lv: g.cmds[c1].lv, sk: g.cmds[c1].sk.slice(), ult: g.cmds[c1].lv >= ULTIMATE_LEVEL } : null;
  return {
    gov: g.id, label: label || g.name, units: { inf: troops.inf || 0, cav: troops.cav || 0, arc: troops.arc || 0, sie: troops.sie || 0 }, mul,
    morale: Math.round(100 * (1 + (m.morale || 0))), moraleLoss: 1 + (m.moraleLoss || 0), terror: m.terror || 0, pursuit: m.pursuit || 0,
    wallAtk: 1 + (m.wallAtk || 0) + (variant.unit === 'sie' ? (variant.mods.wallAtk || 0) : 0), towerMul: 1 + (m.tower || 0),
    plunder: m.plunder || 0, wounded: m.wounded || 0, cmd, cmd2: c2 || null,
  };
}
// a neutral garrison (bandit camp, unclaimed fortress, the Capital's Ember Guard)
function neutralSide(label, units, level) {
  const k = 1 + level * 0.02;
  const mul = { atk: {}, def: {}, hp: {} };
  for (const u of UNIT_KEYS) { mul.atk[u] = k; mul.def[u] = k; mul.hp[u] = 1; }
  return { gov: -1, label, units: { inf: units.inf || 0, cav: units.cav || 0, arc: units.arc || 0, sie: units.sie || 0 }, mul, morale: 100, moraleLoss: 1, terror: 0, pursuit: 0, wallAtk: 1, towerMul: 1, plunder: 0, wounded: 0, cmd: null, cmd2: null };
}
// several governors' troops under one commander (rallies, garrisons). parts: [{ side, share }]
function mergeSides(lead, extra) {
  const out = JSON.parse(JSON.stringify(lead));
  for (const s of extra) for (const u of UNIT_KEYS) out.units[u] += s.units[u];
  return out;
}

// ================================================================ terrain effects on combat
function terrainMods(terrain) {
  switch (terrain) {
    case T.plains: return { aCav: 0.1, note: 'Open plains favor cavalry (+10% cavalry attack).' };
    case T.forest: return { dArc: 0.15, aCav: -0.1, note: 'Forest cover: defending archers +15% defense, cavalry -10% attack.' };
    case T.hills: return { dDef: 0.15, note: 'High ground: defenders +15% defense.' };
    case T.ford: return { aAtk: -0.2, note: 'River crossing: attackers -20% attack.' };
    case T.pass: return { dDef: 0.2, note: 'Mountain pass: defenders +20% defense.' };
    case T.snow: return { aAtk: -0.05, note: 'Deep snow: attackers -5% attack.' };
    default: return { note: '' };
  }
}

// ================================================================ the battle resolver
// input: { seed, a, d, terrain, wall: null | { level, dur, max }, kind }. Pure: the same input gives the same result.
const MAX_ROUNDS = 20;
const KILL_K = 1.35;
function fight(input) {
  const rng = makeRng(input.seed >>> 0);
  const tm = terrainMods(input.terrain);
  const S = { a: prepSide(input.a), d: prepSide(input.d) };
  const wall = input.wall ? { level: input.wall.level, dur: input.wall.dur, max: Math.max(1, input.wall.max), dmg: 0 } : null;
  const rounds = [];
  const casts = [];
  let winner = null, reason = '';
  const total = s => s.n.inf + s.n.cav + s.n.arc + s.n.sie;
  const opp = k => (k === 'a' ? 'd' : 'a');
  // opening strikes (Storm Khan's ultimate)
  for (const k of ['a', 'd']) {
    const s = S[k];
    if (s.cmd && s.cmd.ult && CMD[s.cmd.id].ultimate.effects) for (const e of CMD[s.cmd.id].ultimate.effects) {
      if (e.k === 'prestrike') { applyNuke(S[opp(k)], e.power * Math.sqrt(Math.max(1, total(s))) * 0.9, null, 1); casts.push({ r: 0, side: k, name: CMD[s.cmd.id].ultimate.name }); }
      if (e.k === 'silence') S[opp(k)].silenced = e.rounds;
      if (e.k === 'opening') s.buffs.push({ stat: e.stat, pct: e.pct, rounds: e.rounds });
    }
  }
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    const ev = [];
    // commander skills
    for (const k of ['a', 'd']) {
      const s = S[k], o = S[opp(k)];
      if (!s.cmd || total(s) <= 0) continue;
      s.rage += 100;
      if (s.silenced > 0) { s.silenced--; continue; }
      if (s.rage >= 1000) {
        s.rage = 0;
        const d = CMD[s.cmd.id];
        const lvK = 1 + 0.25 * ((s.cmd.sk[0] || 1) - 1);
        for (const e of d.active.effects) castEffect(s, o, e, lvK, total);
        casts.push({ r, side: k, name: d.active.name });
        ev.push(k + ':' + d.active.name);
      }
    }
    // damage pools
    const kills = { a: { inf: 0, cav: 0, arc: 0, sie: 0 }, d: { inf: 0, cav: 0, arc: 0, sie: 0 } };
    for (const k of ['a', 'd']) {
      const s = S[k], o = S[opp(k)];
      const oTot = total(o);
      if (oTot <= 0 || total(s) <= 0) continue;
      const mf = 0.55 + 0.45 * Math.max(0, s.mor) / 100;
      for (const u of UNIT_KEYS) {
        const n = s.n[u];
        if (n <= 0) continue;
        let atk = UNITS[u].atk * s.mul.atk[u] * buffK(s, 'atk', u) * debuffK(o, 'atk', u, s);
        if (k === 'a') { atk *= 1 + (tm.aAtk || 0) + (u === 'cav' ? (tm.aCav || 0) : 0); }
        else if (u === 'cav') atk *= 1 + (tm.aCav || 0) * 0.5;
        if (input.wall && k === 'a') atk *= WALL_MULT[u] < 1 && wall.dur > 0 ? 0.92 : 1;
        const pool = n * atk * mf * (0.96 + rng() * 0.08);
        for (const v of UNIT_KEYS) {
          const m = o.n[v];
          if (m <= 0) continue;
          let def = UNITS[v].def * o.mul.def[v] * buffK(o, 'def', v) * debuffK(s, 'def', v, o);
          if (k === 'a') def *= 1 + (tm.dDef || 0) + (v === 'arc' ? (tm.dArc || 0) : 0);
          if (wall && k === 'a') def *= 1 + wall.level * 0.035 * (wall.dur / wall.max);
          kills[opp(k)][v] += pool * (m / oTot) * COUNTER[u][v] * KILL_K / (def * UNITS[v].hp * o.mul.hp[v]);
        }
      }
      // pending damage over time from skills
      if (s.dot) { applyNukeKills(kills[opp(k)], o, s.dot, total); s.dot = 0; }
    }
    // wall towers shoot the attackers; attackers batter the wall
    if (wall) {
      if (total(S.a) > 0) {
        const tower = 55 * Math.pow(Math.max(1, wall.level), 1.3) * S.d.towerMul * (wall.dur > 0 ? 1 : 0.4);
        applyNukeKills(kills.a, S.a, tower * Math.sqrt(Math.max(1, wall.level * 400)), total);
      }
      let wd = 0;
      for (const u of UNIT_KEYS) wd += S.a.n[u] * UNITS[u].atk * WALL_MULT[u] * 0.012 * S.a.wallAtk * (S.a.burst || 1);
      S.a.burst = 1;
      wd = Math.min(wall.dur, wd);
      wall.dur -= wd;
      wall.dmg += wd;
    }
    // apply
    const lostNow = { a: 0, d: 0 };
    for (const k of ['a', 'd']) {
      const s = S[k];
      for (const u of UNIT_KEYS) {
        const x = Math.min(s.n[u], Math.round(kills[k][u]));
        s.n[u] -= x; s.lost[u] += x; lostNow[k] += x;
      }
    }
    // morale
    for (const k of ['a', 'd']) {
      const s = S[k], o = S[opp(k)];
      const frac = lostNow[k] / Math.max(1, s.start);
      s.rage += Math.round(frac * 300);
      s.mor -= frac * 160 * s.moraleLoss + (r <= 3 ? o.terror : 0) + 1.5;
      if (s.moraleFloor && total(s) > s.start * s.moraleFloor.above) s.mor = Math.max(s.mor, s.moraleFloor.morale);
      if (s.rallyAt && !s.rallied && total(s) < s.start * s.rallyAt.below) { s.rallied = true; s.mor += s.rallyAt.morale; ev.push(k + ':' + CMD[s.cmd.id].ultimate.name); }
      for (const b of s.buffs) b.rounds--;
      s.buffs = s.buffs.filter(b => b.rounds > 0);
      for (const b of s.debuffs) b.rounds--;
      s.debuffs = s.debuffs.filter(b => b.rounds > 0);
    }
    rounds.push([total(S.a), total(S.d), Math.round(Math.max(0, S.a.mor)), Math.round(Math.max(0, S.d.mor)), wall ? Math.round(wall.dur) : -1, ev]);
    const aOut = total(S.a) <= 0 || S.a.mor <= 15 || total(S.a) < S.a.start * 0.25;
    const dOut = total(S.d) <= 0 || S.d.mor <= 15 || total(S.d) < S.d.start * 0.25;
    if (aOut || dOut) {
      if (dOut && !aOut) { winner = 'a'; reason = total(S.d) <= 0 ? 'destroyed' : S.d.mor <= 15 ? 'morale' : 'losses'; }
      else if (aOut && !dOut) { winner = 'd'; reason = total(S.a) <= 0 ? 'destroyed' : S.a.mor <= 15 ? 'morale' : 'losses'; }
      else { winner = total(S.a) / S.a.start > total(S.d) / S.d.start ? 'a' : 'd'; reason = 'both broke'; }
      break;
    }
  }
  if (!winner) { winner = 'd'; reason = 'time'; }
  // the beaten side is chased off the field
  const loser = S[opp(winner)], win = S[winner];
  const chase = 0.05 + win.pursuit;
  for (const u of UNIT_KEYS) { const x = Math.floor(loser.n[u] * chase); loser.n[u] -= x; loser.lost[u] += x; loser.chased += x; }
  return {
    winner, reason, rounds, casts,
    a: { start: { ...S.a.start0 }, end: { ...S.a.n }, lost: { ...S.a.lost }, chased: S.a.chased },
    d: { start: { ...S.d.start0 }, end: { ...S.d.n }, lost: { ...S.d.lost }, chased: S.d.chased },
    wallDamage: wall ? Math.round(wall.dmg) : 0, wallLeft: wall ? Math.round(wall.dur) : -1,
  };
}
function prepSide(side) {
  const n = { ...side.units };
  const s = {
    n, start0: { ...side.units }, start: Math.max(1, n.inf + n.cav + n.arc + n.sie), lost: { inf: 0, cav: 0, arc: 0, sie: 0 }, chased: 0,
    mul: side.mul, mor: side.morale, moraleLoss: side.moraleLoss, terror: side.terror, pursuit: side.pursuit, towerMul: side.towerMul, wallAtk: side.wallAtk,
    cmd: side.cmd, rage: 0, buffs: [], debuffs: [], silenced: 0, dot: 0, burst: 1,
  };
  if (side.cmd && side.cmd.ult) for (const e of CMD[side.cmd.id].ultimate.effects || []) {
    if (e.k === 'rally') s.rallyAt = e;
    if (e.k === 'floor') s.moraleFloor = e;
  }
  return s;
}
function buffK(s, stat, u) { let k = 1; for (const b of s.buffs) if (b.stat === stat && (!b.unit || b.unit === u)) k *= 1 + b.pct / 100; return k; }
// debuffs the *other* side placed on s's stat (stored on the caster's opponent list)
function debuffK(caster, stat, u, target) { let k = 1; for (const b of target.debuffs || []) if (b.stat === stat && (!b.unit || b.unit === u)) k *= 1 - b.pct / 100; return k; }
function castEffect(s, o, e, lvK, total) {
  const own = Math.max(1, total(s));
  if (e.k === 'nuke') {
    const kills = { inf: 0, cav: 0, arc: 0, sie: 0 };
    applyNukeKills(kills, o, e.power * lvK * Math.sqrt(own) * 0.9, total, e.vs, e.mult);
    for (const u of UNIT_KEYS) { const x = Math.min(o.n[u], Math.round(kills[u])); o.n[u] -= x; o.lost[u] += x; }
  } else if (e.k === 'dot') s.dot += e.power * lvK * Math.sqrt(own) * 0.9;
  else if (e.k === 'buff') { if (!e.below || own < s.start * e.below) s.buffs.push({ stat: e.stat, pct: e.pct * (1 + (lvK - 1) * 0.6), rounds: e.rounds, unit: e.unit }); }
  else if (e.k === 'debuff') o.debuffs.push({ stat: e.stat, pct: e.pct * (1 + (lvK - 1) * 0.6), rounds: e.rounds, unit: e.unit });
  else if (e.k === 'heal') {
    for (const u of UNIT_KEYS) { const back = Math.floor(s.lost[u] * e.pct / 100 * (1 + (lvK - 1) * 0.5)); s.n[u] += back; s.lost[u] -= back; }
  } else if (e.k === 'morale') s.mor += e.amount;
  else if (e.k === 'wallburst') s.burst = e.mult;
}
function applyNuke(side, dmg, vs, mult) {
  const kills = { inf: 0, cav: 0, arc: 0, sie: 0 };
  applyNukeKills(kills, side, dmg, s => s.n.inf + s.n.cav + s.n.arc + s.n.sie, vs, mult);
  for (const u of UNIT_KEYS) { const x = Math.min(side.n[u], Math.round(kills[u])); side.n[u] -= x; side.lost[u] += x; }
}
function applyNukeKills(kills, side, dmg, total, vs, mult) {
  const tot = total(side);
  if (tot <= 0 || dmg <= 0) return;
  for (const v of UNIT_KEYS) {
    const m = side.n[v];
    if (m <= 0) continue;
    const k = vs === v ? (mult || 1) : 1;
    kills[v] += dmg * (m / tot) * k * KILL_K / (UNITS[v].def * side.mul.def[v] * UNITS[v].hp * side.mul.hp[v]);
  }
}

// plain-language reasons for a result, from the attacker's or defender's point of view
function explainBattle(input, res, view) {
  const me = view === 'd' ? input.d : input.a, them = view === 'd' ? input.a : input.d;
  const lines = [];
  const mt = troopsTotal(me.units), tt = troopsTotal(them.units);
  const ratio = mt / Math.max(1, tt);
  if (ratio >= 1.5) lines.push(`You brought ${ratio.toFixed(1)} times as many troops.`);
  else if (ratio <= 0.67) lines.push(`They had ${(1 / ratio).toFixed(1)} times as many troops.`);
  // counter matchup: average multiplier my troops get against theirs, and theirs against mine
  const adv = (x, y) => {
    let s = 0, wsum = 0;
    for (const u of UNIT_KEYS) for (const v of UNIT_KEYS) { const wgt = (x.units[u] || 0) * (y.units[v] || 0); s += wgt * COUNTER[u][v]; wsum += wgt; }
    return wsum ? s / wsum : 1;
  };
  const mine = adv(me, them), theirs = adv(them, me);
  if (mine - theirs > 0.06) lines.push('Your troop mix countered theirs (infantry beats cavalry, cavalry beats archers, archers beat infantry).');
  else if (theirs - mine > 0.06) lines.push('Their troop mix countered yours (infantry beats cavalry, cavalry beats archers, archers beat infantry).');
  const tn = terrainMods(input.terrain).note;
  if (tn) lines.push(tn);
  if (input.wall && input.wall.level > 0) {
    lines.push(`The defenders fought behind level ${input.wall.level} walls (+${Math.round(input.wall.level * 3.5 * input.wall.dur / Math.max(1, input.wall.max))}% defense) with towers firing every round.`);
    if (res.wallDamage > 0) lines.push(`The attack did ${Math.round(res.wallDamage).toLocaleString('en-US')} damage to the walls.`);
  }
  const myCasts = res.casts.filter(c => c.side === view).length, theirCasts = res.casts.filter(c => c.side !== view).length;
  if (myCasts || theirCasts) lines.push(`Commander skills: yours fired ${myCasts} time${myCasts === 1 ? '' : 's'}, theirs ${theirCasts}.`);
  const loserKey = res.winner === 'a' ? 'd' : 'a';
  if (res.reason === 'morale') lines.push(`${loserKey === view ? 'Your' : 'Their'} army's morale broke and it fled.`);
  else if (res.reason === 'losses') lines.push(`${loserKey === view ? 'Your' : 'Their'} army fell below a quarter of its strength and withdrew.`);
  else if (res.reason === 'time') lines.push('The attackers could not break the defense in time and withdrew.');
  else if (res.reason === 'destroyed') lines.push(`${loserKey === view ? 'Your' : 'Their'} army was destroyed.`);
  if (res[loserKey].chased > 0) lines.push(`${Math.round(res[loserKey].chased).toLocaleString('en-US')} more fell in the retreat.`);
  return lines;
}

// ================================================================ scouting
function scoutAccuracy(w, scouter, target) {
  const sm = cityMods(w, scouter);
  let acc = 0.55 + (sm.scoutAcc || 0) * 0.6;
  if (target) {
    const tm = cityMods(w, target);
    acc -= (tm.counter || 0) * 0.6;
  }
  return clamp(acc, 0.25, 0.97);
}
function noisy(rng, v, acc) {
  if (v <= 0) return 0;
  const k = 1 + (rng() * 2 - 1) * (1 - acc) * 0.8;
  const x = v * k;
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, x))) - 1));
  return Math.max(0, Math.round(x / mag) * mag);
}
