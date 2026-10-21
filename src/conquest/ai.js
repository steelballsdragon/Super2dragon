/* Age of Conquest AI. Governors decide on a schedule set by how active they are (utility scoring for routine
   choices, a small state machine for war and defense); guild leaders plan every few hours (objectives, diplomacy,
   recruiting, succession). The AI uses the same validated actions as the player (api.js), pays for everything
   from its own stock, and only targets what it knows: cities inside its explored radius, its memories, and
   scout reports less than a few hours old. Part of the engine bundle. */

// ================================================================ scheduling and tiers
// active: near the player or in the player's guild/wars; strategic: at war; background: everyone else (slower)
function tierOf(w, g) {
  const P = w.govs[PLAYER];
  if (dist(g.x, g.y, P.x, P.y) < 28) return 'active';
  if (g.guild >= 0 && (g.guild === P.guild || (P.guild >= 0 && treaty(w, g.guild, P.guild)?.k === 'war'))) return 'active';
  if (g.st === 'war' || g.st === 'defend' || (g.guild >= 0 && atWar(w, g.guild))) return 'strategic';
  return 'background';
}
function thinkAll(w, dt) {
  for (const g of w.govs) {
    if (g.human || g.next > w.t) continue;
    g.tier = tierOf(w, g);
    try { think(w, g); } catch (e) { g.lastError = String(e && e.message || e); }
    const base = lerp(75, 8, g.t.activity) * (g.tier === 'background' ? 1.7 : 1);
    g.next = w.t + Math.max(dt, Math.round(base * (0.7 + rnd(w) * 0.6)));
  }
  for (const gd of w.guilds) {
    if (gd.collapsed) { if (w.t >= gd.refoundAt) refoundGuild(w, gd, null); continue; }
    if (gd.next > w.t) continue;
    try { thinkGuild(w, gd); } catch (e) { gd.lastError = String(e && e.message || e); }
    gd.next = w.t + rint(w, 3 * HOUR, 6 * HOUR);
  }
}

// ================================================================ one governor's turn
function think(w, g) {
  settle(w, g, w.t);
  // state machine
  const recentHit = g.lastAttack && w.t - g.lastAttack.t < 6 * HOUR;
  const war = g.guild >= 0 && atWar(w, g.guild);
  if (g.alert && w.t - g.alert.t < 90) g.st = 'defend';
  else if (recentHit && g.t.agg > 0.55 && troopsTotal(g.troops) > 500) g.st = 'war';
  else if (recentHit) g.st = 'defend';
  else if (war && g.t.agg > 0.35) g.st = 'war';
  else if (g.t.agg > 0.75) g.st = 'raid';
  else if (g.stats.sacked > 0 && g.lastAttack && w.t - g.lastAttack.t < DAY) g.st = 'rebuild';
  else g.st = 'grow';
  if (g.st === 'defend') aiDefend(w, g);
  aiEconomy(w, g, false);
  aiGuildDuties(w, g);
  if (g.st !== 'rebuild') aiMilitary(w, g);
  aiPolitics(w, g);
  g.alert = g.alert && w.t - g.alert.t < 90 ? g.alert : null;
}

// ---------------------------------------------------------------- economy
const BASE_UTIL = { hall: 3, farm: 1.4, lumber: 1.3, quarry: 1, mine: 0.8, market: 0.8, warehouse: 0.7, barracks: 0.8, stables: 0.55, range: 0.65, workshop: 0.25, academy: 1.1, hospital: 0.6, wall: 0.8, tower: 0.4 };
function aiEconomy(w, g, opening) {
  const A = ARCHETYPES[g.arch];
  const m = cityMods(w, g);
  const prod = production(w, g, m);
  const cap = storage(w, g, m);
  const net = prod.food - upkeepPerHour(g);
  // building
  if (!g.q.build) {
    const hallNext = buildCheck(w, g, 'hall');
    const reqBoost = {};
    for (const [b, L] of buildingReq('hall', g.b.hall + 1)) if ((g.b[b] || 0) < L) reqBoost[b] = 3;
    let opts = [];
    for (const id of BUILDING_KEYS) {
      const c = buildCheck(w, g, id);
      if (!c.allowed) continue;
      let u = BASE_UTIL[id] * (A.build[id] || 1);
      const L = g.b[id] || 0;
      if (id !== 'hall') u *= 1 + (g.b.hall - L) / Math.max(1, g.b.hall);
      if (reqBoost[id]) u += reqBoost[id];
      if (id === 'farm' && net < prod.food * 0.15) u *= 3;
      if (id === 'warehouse' && RES.some(r => g.res[r] > cap * 0.85)) u *= 3;
      if (['barracks', 'stables', 'range'].includes(id)) u *= 0.6 + g.t.agg;
      if (id === 'workshop') u *= g.arch === 'rallylead' || g.role === 'leader' || g.role === 'officer' ? 2 : 0.6;
      if (id === 'wall' || id === 'tower') u *= g.st === 'defend' || g.stats.sacked ? 2 : 1;
      if (id === 'hall' && !hallNext.ok && hallNext.allowed) u *= 0.8;
      u *= 1 + (rnd(w) - 0.5) * (1 - g.t.skill) * 1.2;
      opts.push({ id, u, c });
    }
    opts.sort((a, b) => b.u - a.u);
    const top = opts[0];
    if (top) {
      if (top.c.ok) actBuild(w, g, top.id);
      else {
        // patient governors save up for the best choice; others take the best affordable one
        const hours = hoursToAfford(g, top.c.cost, prod);
        const wait = hours < (0.5 + g.t.patience * 2);
        if (!wait || opening) {
          const alt = opts.find(o => o.c.ok && o.u >= top.u * 0.4);
          if (alt) actBuild(w, g, alt.id);
          else if (!opening) aiTradeFor(w, g, top.c.cost);
        }
      }
    }
  }
  if (opening) return;
  // research
  if (!g.q.research && (g.b.academy || 0) > 0) {
    let best = null, bu = 0;
    for (const id of TECH_KEYS) {
      const c = researchCheck(w, g, id);
      if (!c.ok) continue;
      const br = TECHS[id].branch;
      let u = br === 'economy' ? 0.6 + g.t.greed : br === 'military' ? 0.4 + g.t.agg : 0.4 + (g.arch === 'explorer' || g.arch === 'turtle' ? 0.6 : 0.1);
      if (id === 'scouting' && (g.tech.scouting || 0) < 2) u += 0.4;
      if (id === 'fortify' && g.arch === 'turtle') u += 0.6;
      u /= 1 + (g.tech[id] || 0) * 0.15;
      u *= 1 + (rnd(w) - 0.5) * (1 - g.t.skill);
      if (u > bu) { bu = u; best = id; }
    }
    if (best) actResearch(w, g, best);
  }
  // healing
  if (!g.q.heal && troopsTotal(g.wounded) > 0) actHeal(w, g);
  // training: keep the army growing toward a size the food supply can carry
  const total = troopsTotal(g.troops) + troopsTotal(g.away);
  const target = marchCap(w, g) * (0.6 + g.t.agg * 1.6) * (g.st === 'war' || g.st === 'defend' ? 1.4 : 1);
  if (total < target) {
    const mix = A.army;
    for (const u of UNIT_KEYS) {
      if (g.q.train[u] || !(g.b[UNITS[u].building] > 0)) continue;
      const share = mix[u] || 0;
      if (share <= 0) continue;
      const have = (g.troops[u] || 0) + (g.away[u] || 0);
      const want = target * share - have;
      if (want < 50) continue;
      // food: new troops may use up to 80% of the remaining surplus
      const surplus = prod.food - upkeepPerHour(g);
      const foodRoom = Math.max(0, Math.floor(surplus * 0.8 / UNITS[u].upkeep));
      let n = Math.min(Math.round(want), trainBatch(g.b[UNITS[u].building]), foodRoom);
      for (const r in UNITS[u].cost) n = Math.min(n, Math.floor(g.res[r] * 0.6 / UNITS[u].cost[r]));
      if (n >= 30) actTrain(w, g, u, n);
    }
  }
  // the Grand Exchange: wealthy economists race for the economic victory
  if (!g.q.exchange && g.b.hall >= EXCHANGE.hall && (g.b.market || 0) >= EXCHANGE.market && (g.arch === 'economist' || g.civ === 'golden' || g.arch === 'emperor')) actExchange(w, g);
}
function hoursToAfford(g, cost, prod) {
  let h = 0;
  for (const r in cost) {
    const lack = cost[r] - g.res[r];
    if (lack > 0) h = Math.max(h, prod[r] > 0 ? lack / prod[r] : 99);
  }
  return h;
}
// sell a surplus to cover a shortage
function aiTradeFor(w, g, cost) {
  if (!(g.b.market > 0) || rnd(w) > 0.5 + g.t.greed * 0.4) return;
  let need = null, lack = 0;
  for (const r in cost) { const l = cost[r] - g.res[r]; if (l * RES_VALUE[r] > lack) { lack = l * RES_VALUE[r]; need = r; } }
  if (!need) return;
  let sell = null, spare = 0;
  for (const r of RES) {
    if (r === need) continue;
    const s = (g.res[r] - (cost[r] || 0)) * RES_VALUE[r];
    if (s > spare) { spare = s; sell = r; }
  }
  if (!sell || spare < lack * 1.3) return;
  const amount = Math.ceil(Math.min(spare * 0.5, lack * 1.25) / RES_VALUE[sell]);
  actTrade(w, g, sell, need, amount);
}

// ---------------------------------------------------------------- defense
function aiDefend(w, g) {
  const a = g.alert;
  if (!a) return;
  const home = troopPower(g.troops) * (1 + (g.b.wall || 0) * 0.04);
  const threat = a.size * 3.6;
  // recall gatherers when an attack is coming
  for (const m of w.marches) if (m.owner === g.id && m.state === 'gathering' && g.t.patience > 0.4) sendHome(w, m);
  if (threat > home * 1.2 && g.shieldCd <= w.t && g.t.risk < 0.65) {
    const r = actShield(w, g);
    if (r.ok) decide(w, g, 'shield', `Raised a peace shield against ${w.govs[a.by].name}'s incoming army.`, 'public');
  }
}

// ---------------------------------------------------------------- guild duties: rallies, garrisons, contributions
function aiGuildDuties(w, g) {
  if (g.guild < 0) return;
  const gd = w.guilds[g.guild];
  // join a guild rally that we can reach in time
  for (const r of w.rallies) {
    if (r.state !== 'gathering' || r.guild !== g.guild || r.leader === g.id) continue;
    if (w.marches.some(m => m.owner === g.id && m.rally === r.id)) continue;
    if (rnd(w) > g.t.loyal * (0.5 + g.t.agg)) continue;
    const leader = w.govs[r.leader];
    const army = pickArmy(w, g, 0.4 + g.t.loyal * 0.4, null);
    if (!army) continue;
    // rough arrival estimate from the straight-line distance (roads wind, so allow 40% extra)
    const eta = w.t + Math.ceil(dist(g.x, g.y, leader.x, leader.y) * 1.4 * 1.3 / marchSpeed(w, g, army.troops, army.c1, army.c2, 'rallyjoin'));
    if (eta > r.launchAt) continue;
    const res = joinRally(w, g, { rally: r.id, troops: army.troops, c1: army.c1, c2: army.c2 });
    if (res.ok) decide(w, g, 'rally', `Sent ${troopsTotal(army.troops).toLocaleString('en-US')} troops to ${leader.name}'s rally.`, 'guild');
    break;
  }
  // keep the guild's landmarks garrisoned
  for (const mk of w.marks) {
    if (mk.owner !== g.guild || mk.kind === 'ruin') continue;
    const gar = troopsTotal(garrisonOf(w, mk));
    if (gar >= 30000 + mk.level * 2000 || dist(g.x, g.y, mk.x, mk.y) > 34) continue;
    if (w.marches.some(m => m.owner === g.id && m.kind === 'reinforce')) continue;
    if (rnd(w) > g.t.loyal * 0.6) continue;
    const army = pickArmy(w, g, 0.3, null);
    if (!army) continue;
    const res = startMarch(w, g, { kind: 'reinforce', to: idx(mk.x, mk.y), troops: army.troops, c1: army.c1, c2: army.c2 });
    if (res.ok) { decide(w, g, 'reinforce', `Reinforced ${mk.name}.`, 'guild'); break; }
  }
  // a governor whose city is under threat may pull its garrisons home
  if (g.st === 'defend') for (const m of w.marches) if (m.owner === g.id && m.state === 'garrison' && g.t.loyal < 0.5) { sendHome(w, m); break; }
  // contributions happen daily (guildDaily)
  void gd;
}

// ---------------------------------------------------------------- military
// choose troops and commanders for an army: share of the troops at home, keeping a reserve for defense
function pickArmy(w, g, share, counterTo) {
  const busy = busyCommanders(w, g);
  const free = Object.keys(g.cmds).filter(c => !busy.has(c)).sort((a, b) => g.cmds[b].lv - g.cmds[a].lv);
  if (!free.length) return null;
  if (activeMarches(w, g) >= marchLimit(w, g)) return null;
  const cap = marchCap(w, g);
  const troops = {};
  let total = 0;
  // smarter governors lean toward the unit that counters the target's main troop type
  const favor = {};
  if (counterTo) {
    let main = 'inf', mv = -1;
    for (const u of UNIT_KEYS) if ((counterTo[u] || 0) > mv) { mv = counterTo[u]; main = u; }
    const beats = { cav: 'inf', arc: 'cav', inf: 'arc', sie: 'inf' }[main];
    favor[beats] = g.t.skill * 0.6;
  }
  for (const u of UNIT_KEYS) {
    const n = Math.floor((g.troops[u] || 0) * Math.min(1, share * (1 + (favor[u] || 0))));
    troops[u] = n; total += n;
  }
  if (total < 100) return null;
  if (total > cap) { const k = cap / total; total = 0; for (const u of UNIT_KEYS) { troops[u] = Math.floor(troops[u] * k); total += troops[u]; } }
  // the best commander for the main troop type, plus a second
  let main = 'inf', mv = -1;
  for (const u of UNIT_KEYS) if (troops[u] > mv) { mv = troops[u]; main = u; }
  free.sort((a, b) => (g.cmds[b].lv + (CMD[b].spec === main ? 6 : 0)) - (g.cmds[a].lv + (CMD[a].spec === main ? 6 : 0)));
  return { troops, total, c1: free[0], c2: free[1] || null };
}
function aiMilitary(w, g) {
  const homePow = troopPower(g.troops);
  if (homePow < 300) return;
  // 1) bandit camps: commander experience and loot
  if (rnd(w) < 0.35 + g.t.agg * 0.3 + g.t.greed * 0.2) {
    const army = pickArmy(w, g, 0.45 + g.t.risk * 0.3, null);
    if (army) {
      const myPow = troopPower(army.troops);
      let best = null, bs = -Infinity;
      for (const c of w.camps) {
        if (c.reserved != null && c.reserved !== g.id && w.t < c.until) continue;
        const d = dist(g.x, g.y, c.x, c.y);
        if (d > g.explore + 4) continue;
        const cp = troopPower(c.troops) * (1 + c.lv * 0.04);
        if (cp > myPow * (0.55 + g.t.risk * 0.25)) continue;
        const s = c.lv * 2 - d / 6;
        if (s > bs) { bs = s; best = c; }
      }
      if (best && !w.marches.some(m => m.target?.type === 'camp' && m.target.id === best.id)) {
        const r = startMarch(w, g, { kind: 'attack', to: idx(best.x, best.y), troops: army.troops, c1: army.c1, c2: army.c2 });
        if (r.ok) { decide(w, g, 'camp', `Attacked a level ${best.lv} bandit camp for loot and commander experience.`, 'public'); return; }
      }
    }
  }
  // 2) raids and war targets
  if (g.st === 'war' || g.st === 'raid' || (g.st === 'grow' && rnd(w) < g.t.agg * 0.35)) {
    if (aiAttack(w, g)) return;
  }
  // 3) gathering
  if (g.st !== 'war' && rnd(w) < 0.3 + g.t.greed * 0.5) {
    const army = pickArmy(w, g, 0.25 + g.t.greed * 0.25, null);
    if (army) {
      const m = cityMods(w, g);
      const cap = storage(w, g, m);
      let need = 'food', nv = Infinity;
      for (const r of RES) { const v = g.res[r] / cap * RES_VALUE[r]; if (v < nv) { nv = v; need = r; } }
      const enemyTerr = new Set();
      if (g.guild >= 0) for (const k in w.guilds[g.guild].treaties) if (w.guilds[g.guild].treaties[k].k === 'war') enemyTerr.add(Number(k) + 1);
      let best = null, bd = Infinity;
      for (const nd of w.nodes) {
        if (nd.by) continue;
        const d = dist(g.x, g.y, nd.x, nd.y);
        if (d > Math.min(g.explore, 30)) continue;
        const t = w.map.terr[idx(nd.x, nd.y)];
        if (enemyTerr.has(t) || (t && t !== g.guild + 1 && g.t.risk < 0.5)) continue;
        const s = d - (nd.res === need ? 12 : 0) - nd.lv;
        if (s < bd) { bd = s; best = nd; }
      }
      if (best) {
        const r = startMarch(w, g, { kind: 'gather', to: idx(best.x, best.y), troops: army.troops, c1: army.c1, c2: army.c2 });
        if (r.ok) decide(w, g, 'gather', `Sent gatherers to a ${RES_NAME[best.res]} field.`, 'public');
      }
    }
  }
  // 4) explorers and the curious push their scouting radius out
  if (g.explore < 60 && rnd(w) < (g.arch === 'explorer' ? 0.5 : 0.1)) {
    const a = rnd(w) * Math.PI * 2;
    const x = clamp(Math.round(g.x + Math.cos(a) * (g.explore + 6)), 2, N - 3), y = clamp(Math.round(g.y + Math.sin(a) * (g.explore + 6)), 2, N - 3);
    const near = govsNear(w, x, y, 6).filter(id => id !== g.id);
    if (near.length) {
      const t = w.govs[near[0]];
      const r = startMarch(w, g, { kind: 'scout', to: idx(t.x, t.y) });
      if (r.ok) decide(w, g, 'explore', `Sent a scout to explore beyond the known lands, toward ${t.name}.`, 'private');
    }
  }
}
// pick a city to attack from what this governor knows; scout first when the information is stale
function aiAttack(w, g) {
  const myGuild = g.guild >= 0 ? w.guilds[g.guild] : null;
  const known = new Set(govsNear(w, g.x, g.y, g.explore));
  for (const e of g.mem) if (e.who != null && (e.k === 'attacked' || e.k === 'ambushed')) known.add(e.who);
  let best = null, bs = 0;
  for (const id of known) {
    if (id === g.id) continue;
    const d = w.govs[id];
    if (d.shield > w.t) continue;
    if (myGuild && d.guild === g.guild) continue;
    let s = 0;
    const tr = myGuild && d.guild >= 0 ? treaty(w, g.guild, d.guild) : null;
    if (tr && tr.k === 'alliance') continue;
    if (tr && tr.k === 'nap' && !(g.t.honor < 0.25 && g.t.agg > 0.7)) continue;
    if (tr && tr.k === 'truce') continue;
    if (tr && tr.k === 'war') s += 3;
    if (myGuild && myGuild.policy.target === d.guild) s += 1.5;
    const rel = g.rel[id] || 0;
    if (rel < -30) s += 1 + (-rel - 30) / 30;
    if (d.guild < 0) s += 0.6 * g.t.agg;
    if (d.guild >= 0 && !tr) s += g.st === 'raid' ? 0.2 : -0.6;
    const ratio = d.power / Math.max(1, g.power);
    const grudge = rel < -30;
    // honorable governors do not prey on far weaker cities without a war or a grudge
    if (ratio < 0.3 && !grudge && !(tr && tr.k === 'war') && g.t.honor > 0.5) continue;
    s += (1 - ratio) * (0.5 + g.t.agg);
    s -= dist(g.x, g.y, d.x, d.y) / 25;
    if (ratio > 1.6 && g.t.risk < 0.7) continue;
    // a city sacked within the last day has little left to take
    if (d.stats.sacked && d.lastAttack && w.t - d.lastAttack.t < DAY && !grudge && !(tr && tr.k === 'war')) s -= 1.5;
    if (s > bs) { bs = s; best = d; }
  }
  if (!best || bs < 0.6) return false;
  const maxAge = Math.round(lerp(2 * HOUR, 12 * HOUR, g.t.risk));
  const rep = intelOn(w, g, 'city', best.id, maxAge);
  if (!rep) {
    if (w.marches.some(m => m.owner === g.id && m.kind === 'scout')) return false;
    const r = startMarch(w, g, { kind: 'scout', to: idx(best.x, best.y) });
    if (r.ok) { decide(w, g, 'scout', `Scouting ${best.name} before deciding whether to attack.`, 'private'); return true; }
    return false;
  }
  if (rep.shield) return false;
  // outside a war or a grudge, a raid has to be worth the march
  const trB = myGuild && best.guild >= 0 ? treaty(w, g.guild, best.guild) : null;
  const motive = (trB && trB.k === 'war') || (g.rel[best.id] || 0) < -30;
  if (!motive && (rep.loot || 0) < Math.max(4000, g.power * 0.08)) {
    decide(w, g, 'hold', `Left ${best.name} alone: a scout report showed too little to plunder.`, 'private');
    return false;
  }
  const army = pickArmy(w, g, 0.6 + g.t.agg * 0.4 - (g.st === 'defend' ? 0.3 : 0), rep.troops);
  if (!army) return false;
  const est = troopPower(rep.troops) * (1 + rep.wall * 0.045) * (rep.flagged ? 1.4 : 1) + 60 * Math.pow(Math.max(1, rep.wall), 1.3);
  // weaker judges misread reports; the bold accept worse odds
  const perceived = est * (1 + (rnd(w) - 0.5) * (1 - g.t.skill) * 0.7);
  const need = lerp(1.7, 0.95, g.t.risk);
  const mine = troopPower(army.troops);
  if (mine < perceived * need) {
    decide(w, g, 'hold', `Decided not to attack ${best.name}: a ${Math.round((w.t - rep.at) / 60)}h-old report showed about ${Math.round(perceived).toLocaleString('en-US')} defending power against ${Math.round(mine).toLocaleString('en-US')}.`, 'private');
    return false;
  }
  const r = startMarch(w, g, { kind: 'attack', to: idx(best.x, best.y), troops: army.troops, c1: army.c1, c2: army.c2 });
  if (!r.ok) return false;
  const why = [];
  const tr = myGuild && best.guild >= 0 ? treaty(w, g.guild, best.guild) : null;
  if (tr && tr.k === 'war') why.push(`their guilds are at war`);
  if ((g.rel[best.id] || 0) < -30) why.push('an old grudge');
  if (best.guild < 0) why.push('they have no guild to protect them');
  why.push(`a ${Math.round((w.t - rep.at) / 60)}h-old scout report put their defense at about ${Math.round(perceived / mine * 100)}% of this army`);
  decide(w, g, 'attack', `Attacked ${best.name}: ${why.join('; ')}.`, 'private');
  if (tr && tr.k === 'nap') {
    // breaking a treaty alone still damages the guild's word
    myGuild.cred = clamp(myGuild.cred - 6, 0, 100);
    chronicle(w, 'betrayal', `${g.name}${tagOf(w, g)} attacked ${best.name}${tagOf(w, best)} despite the pact between their guilds.`, { g: [g.guild, best.guild], p: [g.id, best.id], x: best.x, y: best.y, imp: 2 });
  }
  return true;
}

// ---------------------------------------------------------------- personal politics
function aiPolitics(w, g) {
  if (g.guild < 0) {
    // independents look for a guild
    if (rnd(w) < 0.12 + g.t.diplo * 0.2 + g.t.ambition * 0.1 && g.arch !== 'mercenary') {
      const cands = w.guilds.filter(gd => !gd.collapsed && gd.members.length < GUILD_MAX && dist(g.x, g.y, gd.home.x, gd.home.y) < 50)
        .sort((a, b) => (b.power / (1 + dist(g.x, g.y, b.home.x, b.home.y) / 20)) - (a.power / (1 + dist(g.x, g.y, a.home.x, a.home.y) / 20)));
      for (const gd of cands.slice(0, 3)) {
        if (applyToGuild(w, g, gd).ok) { decide(w, g, 'join', `Joined ${gd.name} for protection and shared goals.`, 'public'); break; }
      }
    }
    return;
  }
  const gd = w.guilds[g.guild];
  // move closer to the guild after joining (one relocation, paid for in gold)
  if (dist(g.x, g.y, gd.home.x, gd.home.y) > 26 && !g.movedToGuild && g.res.gold >= relocateCost(g) && rnd(w) < 0.3) {
    const rng = makeRng(hash32(w.seed, 'move', g.id, w.t));
    const p = freeTileNear(w, gd.home.x, gd.home.y, 16, rng, { spread: true, awayFromMarks: 3 });
    if (p && actRelocate(w, g, p[0], p[1], true).ok) { g.movedToGuild = true; decide(w, g, 'move', `Moved the city closer to ${gd.name}'s lands.`, 'public'); }
  }
  // defection: disloyal members of a guild that is losing look elsewhere
  const losing = Object.keys(gd.treaties).some(k => gd.treaties[k].k === 'war' && (gd.warScore[k] || 0) < -10);
  if (g.role !== 'leader' && g.t.loyal < 0.35 && (losing || gd.rank >= 8) && rnd(w) < 0.08) {
    const better = w.guilds.filter(o => o.id !== gd.id && !o.collapsed && o.members.length < GUILD_MAX && o.rank < gd.rank && o.rel[gd.id] > -60)
      .sort((a, b) => a.rank - b.rank)[0];
    if (better && dist(g.x, g.y, better.home.x, better.home.y) < 60) {
      const from = gd;
      if (applyToGuild(w, g, better).ok) {
        decide(w, g, 'defect', `Left ${from.name} for ${better.name}.`, 'public');
        remember(w, g, { k: 'defected', g: from.id });
        if (g.power > 20000 || g.role === 'officer') chronicle(w, 'defection', `${g.name} defected from ${from.name} [${from.tag}] to ${better.name} [${better.tag}].`, { g: [from.id, better.id], p: [g.id], x: g.x, y: g.y, imp: 1 });
      }
    }
  }
}
// a governor asks to join; the guild's leader decides (the player's own guild is decided by the player if they lead it)
function applyToGuild(w, g, gd) {
  if (gd.collapsed) return { ok: false, err: 'That guild has collapsed.' };
  if (gd.members.length >= GUILD_MAX) return { ok: false, err: `${gd.name} is full (${GUILD_MAX} members).` };
  if (g.guild === gd.id) return { ok: false, err: 'You are already a member.' };
  const leader = w.govs[gd.leader];
  if (leader && leader.human) {
    if (!gd.applicants.includes(g.id)) gd.applicants.push(g.id);
    return { ok: false, err: 'pending' };
  }
  const median = medianPower(w, gd);
  const grudge = gd.members.some(id => (w.govs[id].rel[g.id] || 0) < -50);
  const bias = (gd.members.length < 35 ? 0.3 : 0) + (g.guild >= 0 ? -0.1 : 0) + (leader ? leader.t.diplo * 0.2 : 0);
  const want = g.power >= median * (0.35 - bias) && !grudge;
  if (!want) return { ok: false, err: `${gd.name} turned you down: they want governors closer to their median power (${Math.round(median).toLocaleString('en-US')}).` };
  joinGuild(w, g, gd.id);
  return { ok: true };
}
function medianPower(w, gd) {
  const p = gd.members.map(id => w.govs[id].power).sort((a, b) => a - b);
  return p.length ? p[p.length >> 1] : 0;
}

// ================================================================ guilds
function treaty(w, a, b) { if (a < 0 || b < 0 || a === b) return null; const t = w.guilds[a].treaties[b]; if (t && t.until && t.until <= w.t) { delete w.guilds[a].treaties[b]; delete w.guilds[b].treaties[a]; return null; } return t || null; }
function atWar(w, gi) { const tr = w.guilds[gi].treaties; for (const k in tr) if (tr[k].k === 'war') return true; return false; }
function warsOf(w, gi) { const out = []; const tr = w.guilds[gi].treaties; for (const k in tr) if (tr[k].k === 'war') out.push(Number(k)); return out; }
function setTreaty(w, a, b, k, extra = {}) {
  const t = { k, since: w.t, ...extra };
  w.guilds[a].treaties[b] = t;
  w.guilds[b].treaties[a] = { ...t };
}
function clearTreaty(w, a, b) { delete w.guilds[a].treaties[b]; delete w.guilds[b].treaties[a]; }
function declareWar(w, a, b, why) {
  const A = w.guilds[a], B = w.guilds[b];
  const prior = treaty(w, a, b);
  if (prior && prior.k === 'war') return false;
  if (prior && prior.k === 'truce') return false;
  const betray = prior && (prior.k === 'nap' || prior.k === 'alliance');
  setTreaty(w, a, b, 'war', { by: a });
  A.warScore[b] = 0; B.warScore[a] = 0;
  A.stats.wars++;
  B.rel[a] = clamp(B.rel[a] - 30, -100, 100);
  if (betray) {
    A.cred = clamp(A.cred - 25, 0, 100);
    for (const o of w.guilds) if (o.id !== a) o.rel[a] = clamp(o.rel[a] - 8, -100, 100);
    chronicle(w, 'betrayal', `${A.name} [${A.tag}] broke its ${prior.k === 'nap' ? 'non-aggression pact' : 'alliance'} with ${B.name} [${B.tag}] and declared war. ${why}`, { g: [a, b], p: [A.leader], imp: 3 });
  } else chronicle(w, 'war', `${A.name} [${A.tag}] declared war on ${B.name} [${B.tag}]. ${why}`, { g: [a, b], p: [A.leader], imp: 3 });
  // allies of the victim are drawn in
  for (const k in B.treaties) {
    if (B.treaties[k].k !== 'alliance' || Number(k) === a) continue;
    const ally = Number(k);
    const tr = treaty(w, ally, a);
    if (!tr || tr.k !== 'war') {
      if (tr && (tr.k === 'nap' || tr.k === 'alliance')) continue;
      if (w.govs[w.guilds[ally].leader]?.human) { w.guilds[ally].proposals.push({ id: w.nid++, from: b, k: 'callToArms', against: a, at: w.t }); continue; }
      setTreaty(w, ally, a, 'war', { by: ally });
      chronicle(w, 'war', `${w.guilds[ally].name} [${w.guilds[ally].tag}] honored its alliance and joined the war against ${A.name}.`, { g: [ally, a], imp: 2 });
    }
  }
  for (const id of B.members) { const g = w.govs[id]; if (!g.human) g.next = Math.min(g.next, w.t + rint(w, 1, 30)); }
  for (const id of A.members) { const g = w.govs[id]; if (!g.human) g.next = Math.min(g.next, w.t + rint(w, 1, 30)); }
  return true;
}
function makePeace(w, a, b, why) {
  const A = w.guilds[a], B = w.guilds[b];
  setTreaty(w, a, b, 'truce', { until: w.t + DAY });
  A.rel[b] = clamp(A.rel[b] + 15, -100, 100); B.rel[a] = clamp(B.rel[a] + 15, -100, 100);
  const sa = Math.round(A.warScore[b] || 0), sb = Math.round(B.warScore[a] || 0);
  chronicle(w, 'peace', `${A.name} [${A.tag}] and ${B.name} [${B.tag}] made peace${why ? ': ' + why : ''}. War score ${sa} to ${sb}.`, { g: [a, b], imp: 2 });
}
function thinkGuild(w, gd) {
  const leader = w.govs[gd.leader];
  if (!leader || leader.guild !== gd.id) { succession(w, gd, 'the guild had no leader'); return; }
  if (gd.members.length < 6 && w.t - gd.founded > DAY) { collapseGuild(w, gd); return; }
  gd.power = guildPower(w, gd);
  const total = w.guilds.reduce((a, o) => a + (o.collapsed ? 0 : o.power), 0) || 1;
  const share = gd.power / total;
  const human = leader.human;
  // relations drift
  for (const o of w.guilds) {
    if (o.id === gd.id || o.collapsed) continue;
    const d = dist(gd.home.x, gd.home.y, o.home.x, o.home.y);
    let dr = 0;
    if (d < 40) dr -= 1;
    const tr = treaty(w, gd.id, o.id);
    if (tr && tr.k === 'nap') dr += 0.8;
    if (tr && tr.k === 'alliance') dr += 1.5;
    if (tr && tr.k === 'war') dr -= 0.5;
    const sharedEnemy = warsOf(w, gd.id).some(e => e !== o.id && treaty(w, o.id, e)?.k === 'war');
    if (sharedEnemy) dr += 2.5;
    if (o.power / total > 0.26) dr -= 2;
    dr += (leader.t.diplo - 0.5) * 1.5 + (rnd(w) - 0.5) * 2;
    gd.rel[o.id] = clamp(gd.rel[o.id] + dr, -100, 100);
  }
  // succession challenges and officers
  leadershipCheck(w, gd);
  promoteOfficers(w, gd);
  recruit(w, gd);
  guildTech(w, gd);
  if (human) { planObjective(w, gd, share); return; }   // the player decides this guild's diplomacy
  // diplomacy
  const wars = warsOf(w, gd.id);
  for (const e of wars) {
    const E = w.guilds[e];
    const score = gd.warScore[e] || 0, theirs = E.warScore[gd.id] || 0;
    const age = w.t - (gd.treaties[e]?.since || w.t);
    const losing = score < theirs - 8 && gd.power < E.power * 0.85;
    const weary = age > 2 * DAY && gd.rel[e] > -50;
    if ((losing && rnd(w) < 0.5 + leader.t.diplo * 0.3) || (weary && rnd(w) < 0.3)) {
      // the other side accepts if it is not winning big, or if it has other wars to fight
      const eLeader = w.govs[E.leader];
      if (eLeader && eLeader.human) { E.proposals.push({ id: w.nid++, from: gd.id, k: 'peace', at: w.t }); continue; }
      const accept = theirs < score + 25 || warsOf(w, e).length > 1 || (eLeader && eLeader.t.diplo > 0.7);
      if (accept) makePeace(w, gd.id, e, losing ? `${gd.name} sued for peace` : 'both sides were exhausted');
    }
  }
  const hegemon = w.guilds.find(o => !o.collapsed && o.power / total > 0.28 && w.t > 2 * DAY);
  for (const o of w.guilds) {
    if (o.id === gd.id || o.collapsed) continue;
    const tr = treaty(w, gd.id, o.id);
    const rel = gd.rel[o.id];
    const ratio = gd.power / Math.max(1, o.power);
    const oLeader = w.govs[o.leader];
    // war
    if ((!tr || tr.k === 'nap') && rel < -45 && ratio > 0.75 && leader.t.agg > 0.4 && wars.length < 2 && w.t > DAY) {
      if (tr && tr.k === 'nap' && !(leader.t.honor < 0.4 && rel < -65)) continue;
      declareWar(w, gd.id, o.id, ratio > 1.3 ? `They believed ${o.name} too weak to resist.` : `Border clashes had poisoned relations.`);
      gd.policy = { stance: 'war', target: o.id, objective: gd.policy.objective, since: w.t, why: `At war with ${o.name}.` };
      continue;
    }
    // pacts
    if (!tr && rel > 15 && gd.cred > 30 && o.cred > 30 && rnd(w) < 0.25 + leader.t.diplo * 0.3) {
      if (oLeader && oLeader.human) { if (!o.proposals.some(p => p.from === gd.id && p.k === 'nap')) o.proposals.push({ id: w.nid++, from: gd.id, k: 'nap', at: w.t }); continue; }
      if (o.rel[gd.id] > 5) {
        const secret = leader.t.diplo > 0.7 && oLeader && oLeader.t.diplo > 0.6 && rnd(w) < 0.35;
        setTreaty(w, gd.id, o.id, 'nap', { secret });
        chronicle(w, 'nap', `${gd.name} [${gd.tag}] and ${o.name} [${o.tag}] signed a non-aggression pact.`, { g: [gd.id, o.id], imp: 1, vis: secret ? 'secret' : 'public' });
      }
    }
    // alliances against a common enemy or a rising hegemon
    if (tr && tr.k === 'nap' && rel > 45 && (wars.some(e => treaty(w, o.id, e)?.k === 'war') || (hegemon && hegemon.id !== gd.id && hegemon.id !== o.id)) && rnd(w) < 0.3) {
      if (oLeader && oLeader.human) { if (!o.proposals.some(p => p.from === gd.id && p.k === 'alliance')) o.proposals.push({ id: w.nid++, from: gd.id, k: 'alliance', at: w.t }); continue; }
      if (o.rel[gd.id] > 40) { setTreaty(w, gd.id, o.id, 'alliance'); chronicle(w, 'alliance', `${gd.name} [${gd.tag}] and ${o.name} [${o.tag}] formed an alliance.`, { g: [gd.id, o.id], imp: 2 }); }
    }
  }
  // coalitions against a guild that grows too strong
  if (hegemon && hegemon.id !== gd.id && w.t - (w.lastCoalition || -9e9) > 2 * DAY) formCoalition(w, hegemon);
  planObjective(w, gd, share);
  // officers and the leader launch rallies on the objective
  aiRallyPlanning(w, gd);
}
function formCoalition(w, h) {
  const total = w.guilds.reduce((a, o) => a + (o.collapsed ? 0 : o.power), 0) || 1;
  const members = w.guilds.filter(o => o.id !== h.id && !o.collapsed && o.rel[h.id] < 5 && treaty(w, o.id, h.id)?.k !== 'alliance' && !w.govs[o.leader]?.human)
    .sort((a, b) => b.power - a.power).slice(0, 4);
  if (members.length < 3) return;
  const joint = members.reduce((a, o) => a + o.power, 0);
  if (joint < h.power * 0.9) return;
  w.lastCoalition = w.t;
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const a = members[i].id, b = members[j].id;
    const tr = treaty(w, a, b);
    if (!tr || tr.k !== 'war') setTreaty(w, a, b, 'alliance', { coalition: h.id });
    else { makePeace(w, a, b, 'to face a greater threat'); setTreaty(w, a, b, 'alliance', { coalition: h.id }); }
  }
  chronicle(w, 'coalition', `${members.map(o => `${o.name} [${o.tag}]`).join(', ')} formed a coalition against ${h.name} [${h.tag}], which held ${Math.round(h.power / total * 100)}% of the server's power.`, { g: [...members.map(o => o.id), h.id], imp: 3 });
  for (const o of members) {
    const tr = treaty(w, o.id, h.id);
    if (tr && tr.k === 'truce') continue;
    if (!tr || tr.k !== 'war') declareWar(w, o.id, h.id, 'The coalition marched together.');
    o.policy = { stance: 'war', target: h.id, objective: o.policy.objective, since: w.t, why: `Coalition war against ${h.name}.` };
  }
}
// what the guild works toward: the nearest fortress it can take, or the Throne for the strongest
function planObjective(w, gd, share) {
  const wars = warsOf(w, gd.id);
  let army = 0;
  for (const id of gd.members) army += troopPower(w.govs[id].troops);
  const reach = army * 0.35;
  let best = null, bs = -Infinity;
  for (const mk of w.marks) {
    if (mk.kind === 'ruin' || mk.owner === gd.id) continue;
    if (mk.kind === 'capital' && (w.t < THRONE_OPENS - 6 * HOUR || gd.rank > 3)) continue;
    if (mk.owner >= 0 && treaty(w, gd.id, mk.owner)?.k !== 'war') continue;
    const gar = troopPower(garrisonOf(w, mk)) * (1 + mk.level * 0.04);
    if (gar > reach * 1.6) continue;
    const d = dist(gd.home.x, gd.home.y, mk.x, mk.y);
    const s = (mk.kind === 'capital' ? 40 : 10) - d / 4 - gar / Math.max(1, reach) * 5;
    if (s > bs) { bs = s; best = mk; }
  }
  const prevStance = gd.policy.stance;
  if (wars.length) gd.policy = { stance: 'war', target: gd.policy.target >= 0 && wars.includes(gd.policy.target) ? gd.policy.target : wars[0], objective: best ? best.id : -1, since: gd.policy.since, why: `At war with ${wars.map(e => w.guilds[e].name).join(' and ')}.${best ? ` Objective: ${best.name}.` : ''}` };
  else if (best) gd.policy = { stance: 'expand', target: -1, objective: best.id, since: prevStance === 'expand' ? gd.policy.since : w.t, why: `Preparing to take ${best.name}.` };
  else gd.policy = { stance: share < 0.06 ? 'defend' : 'grow', target: -1, objective: -1, since: prevStance === 'grow' ? gd.policy.since : w.t, why: share < 0.06 ? 'Rebuilding its strength.' : 'Growing its cities and armies.' };
}
function aiRallyPlanning(w, gd) {
  if (gd.policy.objective < 0) return;
  if (w.rallies.some(r => r.guild === gd.id && r.state !== 'done')) return;
  const mk = w.marks[gd.policy.objective];
  const leads = [gd.leader, ...gd.officers].map(id => w.govs[id]).filter(g => g && !g.human && g.guild === gd.id);
  for (const g of leads) {
    if (!g.cmds) continue;
    const rep = intelOn(w, g, 'mark', mk.id, 8 * HOUR);
    if (!rep) {
      if (!w.marches.some(m => m.owner === g.id && m.kind === 'scout')) {
        const r = startMarch(w, g, { kind: 'scout', to: idx(mk.x, mk.y) });
        if (r.ok) decide(w, g, 'scout', `Scouted ${mk.name} for the guild's next rally.`, 'guild');
      }
      return;
    }
    const army = pickArmy(w, g, 0.85, rep.troops);
    if (!army) continue;
    const garPow = troopPower(rep.troops) * (1 + mk.level * 0.045) + 60 * Math.pow(mk.level, 1.3);
    // expected help: about a quarter of the nearby members' armies
    let help = 0;
    for (const id of gd.members) { const mg = w.govs[id]; if (id !== g.id && dist(mg.x, mg.y, g.x, g.y) < 30) help += troopPower(mg.troops) * 0.25 * mg.t.loyal; }
    const expected = troopPower(army.troops) + help;
    if (expected < garPow * lerp(1.6, 1.1, g.t.risk)) continue;
    const r = startRally(w, g, { to: idx(mk.x, mk.y), troops: army.troops, c1: army.c1, c2: army.c2, wait: 45 });
    if (r.ok) { decide(w, g, 'rally', `Called the guild to rally on ${mk.name}.`, 'guild'); return; }
  }
}
function leadershipCheck(w, gd) {
  const leader = w.govs[gd.leader];
  if (!leader) return;
  if (leader.human) return;   // the player keeps their seat unless they leave
  // an inactive leader steps aside
  if (leader.t.activity < 0.25 && rnd(w) < 0.15) return succession(w, gd, `${leader.name} stepped down`);
  // an ambitious, disloyal officer may try a coup
  for (const oid of gd.officers) {
    const o = w.govs[oid];
    if (o.human || o.t.ambition < 0.8 || o.t.loyal > 0.45 || o.power < leader.power * 1.15 || rnd(w) > 0.12) continue;
    const support = gd.members.filter(id => (w.govs[id].rel[oid] || 0) > (w.govs[id].rel[gd.leader] || 0)).length + gd.members.length * 0.3 * (o.power / Math.max(1, leader.power) - 1);
    if (support > gd.members.length * 0.45) {
      const old = leader;
      setLeader(w, gd, oid);
      old.role = 'member';
      relAdjust(old, oid, -60);
      chronicle(w, 'coup', `${o.name} seized the leadership of ${gd.name} [${gd.tag}] from ${old.name}.`, { g: [gd.id], p: [oid, old.id], imp: 2 });
      if (old.t.loyal < 0.5 && rnd(w) < 0.5) {
        // the ousted leader walks out with a few followers
        const rival = w.guilds.filter(x => x.id !== gd.id && !x.collapsed && x.members.length < GUILD_MAX - 3).sort((a, b) => b.rel[gd.id] - a.rel[gd.id])[0];
        if (rival) {
          const followers = gd.members.filter(id => id !== oid && (w.govs[id].rel[old.id] || 0) > 20 && !w.govs[id].human).slice(0, 4);
          if (applyToGuild(w, old, rival).ok) for (const f of followers) applyToGuild(w, w.govs[f], rival);
          chronicle(w, 'splinter', `${old.name} left ${gd.name} with ${followers.length} followers and joined ${rival.name} [${rival.tag}].`, { g: [gd.id, rival.id], p: [old.id], imp: 2 });
        }
      }
    } else {
      relAdjust(o, gd.leader, -30);
      if (rnd(w) < 0.5) { leaveGuild(w, o, true); chronicle(w, 'coup', `${o.name}'s attempt to seize ${gd.name} [${gd.tag}] failed and they were expelled.`, { g: [gd.id], p: [oid], imp: 1 }); }
    }
    break;
  }
  // scheduled elections in guilds that hold them
  if (gd.rule === 'election' && w.t - (gd.lastElection || gd.founded) > 5 * DAY) {
    gd.lastElection = w.t;
    const cand = [gd.leader, ...gd.officers].filter(id => w.govs[id] && !w.govs[id].human);
    let best = gd.leader, bv = -Infinity;
    for (const id of cand) {
      const c = w.govs[id];
      const votes = gd.members.reduce((a, m) => a + ((w.govs[m].rel[id] || 0) + 10 + (id === gd.leader ? 8 : 0)), 0) + c.power / 2000;
      if (votes > bv) { bv = votes; best = id; }
    }
    if (best !== gd.leader) {
      const old = w.govs[gd.leader];
      setLeader(w, gd, best);
      chronicle(w, 'election', `${w.govs[best].name} won the election in ${gd.name} [${gd.tag}], replacing ${old.name}.`, { g: [gd.id], p: [best, old.id], imp: 2 });
    } else chronicle(w, 'election', `${w.govs[best].name} was re-elected to lead ${gd.name} [${gd.tag}].`, { g: [gd.id], p: [best], imp: 1 });
  }
}
function succession(w, gd, why) {
  const pool = (gd.officers.length ? gd.officers : gd.members).filter(id => w.govs[id] && w.govs[id].guild === gd.id);
  if (!pool.length) { if (gd.members.length) gd.leader = gd.members[0]; return; }
  let pick;
  if (gd.rule === 'heir' && gd.heir >= 0 && pool.includes(gd.heir)) pick = gd.heir;
  else if (gd.rule === 'election') pick = pool.slice().sort((a, b) => gd.members.reduce((s, m) => s + (w.govs[m].rel[b] || 0), 0) - gd.members.reduce((s, m) => s + (w.govs[m].rel[a] || 0), 0) || w.govs[b].power - w.govs[a].power)[0];
  else pick = pool.slice().sort((a, b) => w.govs[b].power - w.govs[a].power)[0];
  const old = gd.leader;
  setLeader(w, gd, pick);
  chronicle(w, 'leader', `${w.govs[pick].name} became leader of ${gd.name} [${gd.tag}] after ${why}.`, { g: [gd.id], p: [pick, old].filter(x => x >= 0), imp: 2 });
}
function promoteOfficers(w, gd) {
  const leader = w.govs[gd.leader];
  if (leader && leader.human) return;   // the player appoints officers
  const score = id => { const g = w.govs[id]; return g.power + g.stats.contributed * 0.5 + (g.t.loyal - 0.5) * 20000; };
  const ranked = gd.members.filter(id => id !== gd.leader && w.govs[id].t.loyal > 0.35).sort((a, b) => score(b) - score(a));
  const next = ranked.slice(0, OFFICERS_MAX);
  for (const id of gd.officers) if (!next.includes(id) && w.govs[id].guild === gd.id) w.govs[id].role = 'member';
  for (const id of next) w.govs[id].role = 'officer';
  const newOnes = next.filter(id => !gd.officers.includes(id));
  gd.officers = next;
  if (!gd.officers.includes(gd.heir)) gd.heir = gd.officers[0] ?? -1;
  for (const id of newOnes) if (id === PLAYER) { note(w, 'guild', `You were made an officer of ${gd.name}. You can now call rallies.`, 3); chronicle(w, 'officer', `${w.govs[id].name} was made an officer of ${gd.name} [${gd.tag}].`, { g: [gd.id], p: [id], imp: 1 }); }
}
function recruit(w, gd) {
  if (gd.members.length >= GUILD_MAX - 1) return;
  const leader = w.govs[gd.leader];
  if (leader && leader.human) return;
  const cands = govsNear(w, gd.home.x, gd.home.y, 40).map(id => w.govs[id]).filter(g => g.guild < 0 && !g.human && g.arch !== 'mercenary');
  cands.sort((a, b) => b.power - a.power);
  for (const g of cands.slice(0, 3)) {
    if (gd.members.length >= GUILD_MAX) break;
    if (rnd(w) < 0.3 + g.t.diplo * 0.4) { joinGuild(w, g, gd.id); decide(w, g, 'join', `Accepted an invitation from ${gd.name}.`, 'public'); }
  }
  // the player can be invited too, if they are independent and strong enough
  const P = w.govs[PLAYER];
  if (P.guild < 0 && !gd.invited && dist(P.x, P.y, gd.home.x, gd.home.y) < 45 && P.power > medianPower(w, gd) * 0.3 && rnd(w) < 0.25) {
    gd.invited = true;
    P.invites = (P.invites || []).filter(x => x !== gd.id).concat([gd.id]);
    note(w, 'guild', `${gd.name} [${gd.tag}] invited you to join them.`, 3, { guild: gd.id });
  }
}
function guildTech(w, gd) {
  const order = ['granary', 'banners', 'bulwark'];
  for (const k of order) {
    const lv = gd.tech[k] || 0;
    if (lv >= 5) continue;
    const cost = { food: 60000 * (lv + 1), wood: 60000 * (lv + 1), gold: 8000 * (lv + 1) };
    if (RES.every(r => (gd.treasury[r] || 0) >= (cost[r] || 0))) {
      for (const r in cost) gd.treasury[r] -= cost[r];
      gd.tech[k] = lv + 1;
      w._me = (w._me || 0) + 1;
      chronicle(w, 'guildtech', `${gd.name} [${gd.tag}] raised ${GUILD_TECH[k].name} to level ${lv + 1}.`, { g: [gd.id], imp: 1 });
      break;
    }
  }
}
const GUILD_TECH = {
  granary: { name: 'Shared Granaries', desc: '+2% production per level for members inside guild territory.' },
  banners: { name: 'War Banners', desc: '+2% attack per level for every member.' },
  bulwark: { name: 'Bulwark Pact', desc: '+2% defense per level for every member.' },
};
function guildDaily(w, gd) {
  if (gd.collapsed) return;
  for (const id of gd.members) {
    const g = w.govs[id];
    if (g.human) continue;
    settle(w, g, w.t);
    const k = 0.02 + g.t.loyal * 0.05;
    for (const r of RES) {
      const v = Math.floor(Math.max(0, g.res[r] - 2000) * k);
      if (v <= 0) continue;
      g.res[r] -= v; gd.treasury[r] = (gd.treasury[r] || 0) + v; g.stats.contributed += v * RES_VALUE[r];
    }
  }
}
function collapseGuild(w, gd) {
  chronicle(w, 'collapse', `${gd.name} [${gd.tag}] collapsed with only ${gd.members.length} members left.`, { g: [gd.id], imp: 3 });
  for (const id of gd.members.slice()) {
    const g = w.govs[id];
    leaveGuild(w, g, true);
    // most scatter to other guilds
    const other = w.guilds.filter(o => o.id !== gd.id && !o.collapsed && o.members.length < GUILD_MAX).sort((a, b) => dist(g.x, g.y, a.home.x, a.home.y) - dist(g.x, g.y, b.home.x, b.home.y))[0];
    if (other && !g.human && rnd(w) < 0.7) joinGuild(w, g, other.id);
  }
  for (const k of Object.keys(gd.treaties)) clearTreaty(w, gd.id, Number(k));
  for (const mk of w.marks) if (mk.owner === gd.id) { mk.owner = -1; mk.garrison = { ...mk.base }; if (mk.kind === 'capital') w.throne = { owner: -1, since: 0 }; }
  gd.members = []; gd.officers = []; gd.leader = -1; gd.collapsed = true; gd.refoundAt = w.t + 6 * HOUR;
  recomputeTerritory(w);
}
const REFOUND_NAMES = [['Phoenix Accord', 'PHX'], ['Grey Banner', 'GRB'], ['Black Lantern', 'BLN'], ['Hollow Crown', 'HCR'], ['Silver Tide', 'SLT'], ['Ember Pact', 'EMP'], ['The Unbroken', 'UNB'], ['Ashen Wake', 'AWK']];
// keeps exactly ten guild identities: a fallen guild's slot is taken by a new guild under an ambitious independent
function refoundGuild(w, gd, founderId) {
  let founder = founderId != null ? w.govs[founderId] : null;
  if (!founder) {
    const cands = w.govs.filter(g => g.guild < 0 && !g.human && g.t.ambition > 0.5).sort((a, b) => b.power - a.power);
    founder = cands[0];
    if (!founder) { gd.refoundAt = w.t + 6 * HOUR; return false; }
  }
  const used = new Set(w.guilds.map(x => x.tag));
  const nm = REFOUND_NAMES.find(([, tag]) => !used.has(tag)) || [`${founder.name}'s Banner`, 'NEW'];
  const oldName = gd.name;
  gd.name = nm[0]; gd.tag = nm[1]; gd.collapsed = false; gd.founded = w.t; gd.cred = 60; gd.treasury = { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 };
  gd.tech = { granary: 0, banners: 0, bulwark: 0 }; gd.warScore = {}; gd.proposals = []; gd.applicants = []; gd.invited = false;
  gd.home = { x: founder.x, y: founder.y, region: regionOf(founder.x, founder.y) };
  gd.rel = gd.rel.map(() => 0);
  for (const o of w.guilds) if (o.id !== gd.id) o.rel[gd.id] = 0;
  gd.members = [];
  joinGuild(w, founder, gd.id, true);
  setLeader(w, gd, founder.id, true);
  gd.officers = [];
  gd.policy = { stance: 'grow', target: -1, objective: -1, since: w.t, why: 'A new guild gathering its first members.' };
  chronicle(w, 'guild_founded', `${founder.name} founded ${gd.name} [${gd.tag}] in the place of the fallen ${oldName}.`, { g: [gd.id], p: [founder.id], x: founder.x, y: founder.y, imp: 2 });
  if (!founder.human) recruit(w, gd);
  return true;
}
