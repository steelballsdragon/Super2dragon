// Land warfare: manpower, recruitment, movement, battles, sieges, attrition and rebellions.
import { BUILDING_BY_ID, SHIPS, UNITS } from '../data/buildings';
import { lawOption } from '../data/laws';
import { generateGeneral, makeCharacter } from './characters';
import { REBELS, TERRAIN } from './constants';
import { wageFactor } from './economy';
import { chance, rand, randRange } from './rng';
import {
  armiesAt, armyRegiments, atWar, bonuses, chronicle, clamp, countryName, def, friendly, hasTreaty, hostile, month, newId, notify,
  provinceName, provincesOf, sideOf, topOverlord, touch, warBetween, year,
  forcesChanged,
} from './state';
import { PROVINCE_DEFS, coastalSeas, neighbors, provinceDistance, latitude } from './static';
import type { Army, BattleReport, ShipType, UnitCounts, UnitType, WorldState } from './types';

export const UNIT_TYPES: UnitType[] = ['infantry', 'cavalry', 'artillery', 'irregulars'];

export function mobilization(w: WorldState, c: string): number {
  return lawOption('military', w.countries[c].laws.military)?.mobilization ?? 0.015;
}

export function maxManpower(w: WorldState, c: string): number {
  const b = bonuses(w, c);
  const mob = mobilization(w, c);
  let s = 0;
  for (const id of provincesOf(w, c)) {
    const p = w.provinces[id];
    s += p.pop * mob * (1 + (p.buildings.barracks ?? 0) * (BUILDING_BY_ID.barracks.bonuses.manpower ?? 0));
  }
  return s * (1 + (b.manpower ?? 0));
}

export function armyQuality(w: WorldState, c: string): number {
  if (c === REBELS) return 0.8;
  const law = lawOption('military', w.countries[c].laws.military)?.quality ?? 1;
  const b = bonuses(w, c);
  return law * (1 + (b.land ?? 0));
}

export function recruitCost(w: WorldState, c: string, unit: UnitType, count: number): number {
  const wf = wageFactor(w, c);
  const b = bonuses(w, c);
  return UNITS[unit].cost * count * (0.4 + 0.6 * wf) * (1 - clamp(b.recruitCost ?? 0, 0, 0.5)) * (1 + w.countries[c].inflation / 100);
}

export function shipCost(w: WorldState, c: string, ship: ShipType, count: number): number {
  const wf = wageFactor(w, c);
  return SHIPS[ship].cost * count * (0.6 + 0.4 * wf) * (1 + w.countries[c].inflation / 100);
}

export function canRecruitIn(w: WorldState, c: string, pid: string): string | null {
  const p = w.provinces[pid];
  if (!p) return 'Unknown province.';
  if (p.owner !== c) return 'You do not own this province.';
  if (p.controller !== c) return 'The province is occupied.';
  if (p.siege) return 'The province is under siege.';
  return null;
}

export function processRecruitment(w: WorldState): void {
  const done: string[] = [];
  for (const r of w.recruitment) {
    r.monthsLeft -= 1;
    if (r.monthsLeft > 0) continue;
    done.push(r.id);
    if (!w.countries[r.country]?.alive) continue;
    if (r.kind === 'unit') {
      const unit = r.unit as UnitType;
      let army = armiesAt(w, r.province).find((a) => a.owner === r.country && a.status !== 'retreating' && !a.rebel);
      if (!army) {
        army = { id: newId(w, 'a'), owner: r.country, name: `${provinceName(r.province)} Regiments`, location: r.province, units: { infantry: 0, cavalry: 0, artillery: 0, irregulars: 0 }, morale: 0.6, experience: 0, path: [], progress: 0, status: 'idle' };
        w.armies[army.id] = army;
  forcesChanged(w);
        forcesChanged(w);
      }
      army.units[unit] += r.count;
      army.morale = Math.min(army.morale, 0.85);
      if (r.country === w.playerId) notify(w, `${r.count} regiment${r.count > 1 ? 's' : ''} of ${UNITS[unit].name.toLowerCase()} raised in ${provinceName(r.province)}.`, 'success');
    } else {
      const ship = r.unit as ShipType;
      addShips(w, r.country, r.province, ship, r.count);
      if (r.country === w.playerId) notify(w, `${r.count} ${SHIPS[ship].name.toLowerCase()} launched at ${provinceName(r.province)}.`, 'success');
    }
  }
  w.recruitment = w.recruitment.filter((r) => !done.includes(r.id));
}

function addShips(w: WorldState, c: string, pid: string, ship: ShipType, count: number): void {
  const sea = coastalSeas(pid)[0];
  if (!sea) return;
  let fleet = Object.values(w.fleets).find((f) => f.owner === c && f.location === sea && f.carrying.length === 0);
  if (!fleet) {
    fleet = { id: newId(w, 'f'), owner: c, name: `${def(c).adjective} Squadron`, location: sea, ships: { line: 0, frigate: 0, transport: 0 }, morale: 0.8, path: [], progress: 0, mission: 'idle', carrying: [] };
    w.fleets[fleet.id] = fleet;
    forcesChanged(w);
  }
  fleet.ships[ship] += count;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function seasonCost(w: WorldState, pid: string): number {
  const m = month(w);
  const lat = latitude(pid);
  const pd = PROVINCE_DEFS[pid];
  let c = 1;
  if (Math.abs(lat) > 45 && ((lat > 0 && (m >= 10 || m <= 2)) || (lat < 0 && m >= 5 && m <= 8))) c *= 1.35;
  if (lat > 5 && lat < 30 && pd.lon > 65 && pd.lon < 125 && m >= 5 && m <= 8) c *= 1.3; // monsoon
  return c;
}

export function edgeCost(w: WorldState, from: string, to: string): number {
  const p = w.provinces[to];
  const roads = p?.buildings.road ?? 0;
  const t = TERRAIN[PROVINCE_DEFS[to].terrain];
  return provinceDistance(from, to) * t.moveCost * seasonCost(w, to) / (1 + roads * 0.15);
}

export function armySpeed(w: WorldState, a: Army): number {
  const total = armyRegiments(a) || 1;
  const cavShare = a.units.cavalry / total;
  const irrShare = a.units.irregulars / total;
  const artShare = a.units.artillery / total;
  const b = a.owner === REBELS ? {} : bonuses(w, a.owner);
  return 24 * (1 + cavShare * 0.35 + irrShare * 0.15 - artShare * 0.2) * (1 + (b.movement ?? 0));
}

/** Can an army of country c enter province pid? */
export function canEnter(w: WorldState, c: string, pid: string): boolean {
  const p = w.provinces[pid];
  if (!p) return false;
  if (c === REBELS) return true;
  const holder = p.controller ?? p.owner;
  if (!holder) return true; // unclaimed land
  if (holder === REBELS) return true;
  if (friendly(w, c, holder) || friendly(w, c, p.owner ?? holder)) return true;
  if (atWar(w, c, holder) || (p.owner && atWar(w, c, p.owner))) return true;
  if (hasTreaty(w, 'access', c, p.owner ?? holder)) return true;
  return false;
}

class MinHeap {
  private items: [number, string][] = [];
  get size() { return this.items.length; }
  push(item: [number, string]) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, string] | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function findPath(w: WorldState, c: string, from: string, to: string, maxCost = Infinity): string[] | null {
  if (from === to) return [];
  if (!canEnter(w, c, to)) return null;
  const pass = new Map<string, boolean>();
  const ok = (id: string) => {
    let v = pass.get(id);
    if (v === undefined) { v = canEnter(w, c, id); pass.set(id, v); }
    return v;
  };
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const heap = new MinHeap();
  heap.push([0, from]);
  while (heap.size) {
    const [d, cur] = heap.pop()!;
    if (cur === to) break;
    if (d > (dist.get(cur) ?? Infinity) || d > maxCost) continue;
    for (const n of neighbors(cur)) {
      if (n !== to && !ok(n)) continue;
      const nd = d + edgeCost(w, cur, n);
      if (nd < (dist.get(n) ?? Infinity)) {
        dist.set(n, nd);
        prev.set(n, cur);
        heap.push([nd, n]);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: string[] = [];
  let cur = to;
  while (cur !== from) {
    path.unshift(cur);
    cur = prev.get(cur)!;
  }
  return path;
}

export function pathMonths(w: WorldState, a: Army, path: string[]): number {
  let cost = 0;
  let cur = a.location;
  for (const p of path) { cost += edgeCost(w, cur, p); cur = p; }
  return cost / armySpeed(w, a);
}

export function orderMove(w: WorldState, a: Army, target: string): boolean {
  const path = findPath(w, a.owner, a.location, target);
  if (!path) return false;
  a.path = path;
  a.progress = 0;
  a.status = path.length ? 'moving' : 'idle';
  return true;
}

export function moveArmies(w: WorldState): void {
  for (const a of Object.values(w.armies)) {
    if (a.status === 'embarked') continue;
    if (a.status === 'retreating' && !a.path.length) { a.status = 'idle'; continue; }
    if (!a.path.length) { if (a.status === 'moving') a.status = 'idle'; continue; }
    let budget = armySpeed(w, a) * (a.status === 'retreating' ? 1.3 : 1);
    while (a.path.length && budget > 0) {
      const next = a.path[0];
      if (!canEnter(w, a.owner, next) && a.owner !== REBELS) { a.path = []; break; }
      const cost = edgeCost(w, a.location, next);
      if (a.progress + budget >= cost) {
        budget -= cost - a.progress;
        a.progress = 0;
        a.location = next;
        a.path.shift();
        if (a.status !== 'retreating' && armiesAt(w, next).some((o) => hostile(w, a, o))) { a.path = []; break; }
      } else {
        a.progress += budget;
        budget = 0;
      }
    }
    if (!a.path.length && a.status === 'moving') a.status = 'idle';
  }
}

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

function generalOf(w: WorldState, a: Army): number {
  const g = a.general ? w.characters[a.general] : undefined;
  return g && g.alive ? g.mil : 0;
}

export function armyPower(w: WorldState, a: Army, pid: string, defending: boolean): number {
  const terrain = PROVINCE_DEFS[pid].terrain;
  let raw = 0;
  for (const u of UNIT_TYPES) {
    const def_ = UNITS[u];
    const tb = def_.terrainBonus[terrain] ?? 1;
    raw += a.units[u] * (defending ? (def_.attack + def_.defense) / 2 : def_.attack) * tb;
  }
  const quality = armyQuality(w, a.owner);
  const b = a.owner === REBELS ? {} : bonuses(w, a.owner);
  return raw * quality * (0.35 + 0.65 * a.morale) * (1 + generalOf(w, a) * 0.05) * (1 + a.experience * 0.25) * (1 + (b.morale ?? 0) * 0.5);
}

/** Rough land strength used by AI and UI for comparisons. */
export function landStrength(w: WorldState, c: string): number {
  let s = 0;
  for (const a of Object.values(w.armies)) if (a.owner === c) s += armyPower(w, a, a.location, false);
  return s;
}

function sideRegiments(armies: Army[]): number {
  return armies.reduce((s, a) => s + armyRegiments(a), 0);
}

function applyLosses(a: Army, fraction: number): number {
  let lost = 0;
  for (const u of UNIT_TYPES) {
    const f = Math.min(0.95, fraction * (u === 'irregulars' ? 1.25 : u === 'artillery' ? 0.7 : 1));
    const l = a.units[u] * f;
    a.units[u] = Math.max(0, a.units[u] - l);
    lost += l;
  }
  return lost;
}

function retreatTarget(w: WorldState, a: Army, from: string): string | null {
  const options = neighbors(from).filter((n) => {
    const p = w.provinces[n];
    if (!p) return false;
    if (armiesAt(w, n).some((o) => hostile(w, a, o))) return false;
    if (a.owner === REBELS) return true;
    const holder = p.controller ?? p.owner;
    return !!holder && friendly(w, a.owner, holder);
  });
  if (!options.length) return null;
  return options.sort((x, y) => (w.provinces[y].pop) - (w.provinces[x].pop))[0];
}

export function resolveBattles(w: WorldState): void {
  const byLocation = new Map<string, Army[]>();
  for (const a of Object.values(w.armies)) {
    if (a.status === 'embarked') continue;
    const l = byLocation.get(a.location);
    if (l) l.push(a); else byLocation.set(a.location, [a]);
  }
  for (const [pid, here] of byLocation) {
    if (here.length < 2) continue;
    const stillHere = () => here.filter((a) => w.armies[a.id] === a && a.location === pid && a.status !== 'embarked');
    let present = stillHere();
    let guard = 0;
    while (present.length > 1 && guard++ < 4) {
      const a0 = present.find((a) => present.some((b) => hostile(w, a, b)));
      if (!a0) break;
      const enemies = present.filter((b) => hostile(w, a0, b));
      const friends = present.filter((b) => !hostile(w, a0, b) && enemies.some((e) => hostile(w, b, e)));
      fight(w, pid, friends, enemies);
      // Remove destroyed armies.
      for (const a of [...friends, ...enemies]) if (armyRegiments(a) < 0.15) removeArmy(w, a.id);
      present = stillHere();
    }
  }
}

export function removeArmy(w: WorldState, id: string): void {
  const a = w.armies[id];
  if (!a) return;
  if (a.fleet) {
    const f = w.fleets[a.fleet];
    if (f) f.carrying = f.carrying.filter((x) => x !== id);
  }
  delete w.armies[id];
  forcesChanged(w);
}

function fight(w: WorldState, pid: string, sideA: Army[], sideB: Army[]): void {
  const p = w.provinces[pid];
  const holder = p.controller ?? p.owner;
  // Defender is the side controlling the province (or the side that did not just arrive).
  const aHolds = sideA.some((a) => holder && (a.owner === holder || (a.owner !== REBELS && friendly(w, a.owner, holder))));
  const [att, dfn] = aHolds ? [sideB, sideA] : [sideA, sideB];
  const terrain = TERRAIN[PROVINCE_DEFS[pid].terrain];
  const dHolds = !aHolds ? sideB.some((a) => holder && a.owner !== REBELS && friendly(w, a.owner, holder)) : true;
  const fortMult = dHolds ? 1 + p.fort * 0.08 * (1 + (dfn[0] && dfn[0].owner !== REBELS ? bonuses(w, dfn[0].owner).fortDefense ?? 0 : 0)) : 1;
  const startA = sideRegiments(att), startD = sideRegiments(dfn);
  let lossA = 0, lossD = 0;
  for (let round = 0; round < 3; round++) {
    const pa = att.reduce((s, a) => s + armyPower(w, a, pid, false), 0);
    const pd = dfn.reduce((s, a) => s + armyPower(w, a, pid, true), 0) * terrain.defense * fortMult;
    const ra = sideRegiments(att), rd = sideRegiments(dfn);
    if (ra < 0.1 || rd < 0.1) break;
    const dmgToD = pa * 0.045 * randRange(w, 0.75, 1.25);
    const dmgToA = pd * 0.045 * randRange(w, 0.75, 1.25);
    for (const a of dfn) lossD += applyLosses(a, dmgToD / rd);
    for (const a of att) lossA += applyLosses(a, dmgToA / ra);
    for (const a of dfn) a.morale = clamp(a.morale - (dmgToD / rd) * 2.2, 0, 1);
    for (const a of att) a.morale = clamp(a.morale - (dmgToA / ra) * 2.2, 0, 1);
    const ma = att.reduce((s, a) => s + a.morale * armyRegiments(a), 0) / Math.max(0.1, sideRegiments(att));
    const md = dfn.reduce((s, a) => s + a.morale * armyRegiments(a), 0) / Math.max(0.1, sideRegiments(dfn));
    if (ma < 0.25 || md < 0.25) break;
  }
  const scoreA = att.reduce((s, a) => s + armyPower(w, a, pid, false), 0);
  const scoreD = dfn.reduce((s, a) => s + armyPower(w, a, pid, true), 0) * terrain.defense * fortMult;
  const attackerWins = scoreA > scoreD;
  const [winners, losers] = attackerWins ? [att, dfn] : [dfn, att];
  for (const a of losers) {
    a.morale = clamp(a.morale * 0.5, 0, 1);
    const t = retreatTarget(w, a, pid);
    if (t) {
      a.path = [t];
      a.progress = 0;
      a.status = 'retreating';
      a.location = t;
      a.path = [];
    } else {
      // Surrounded: the army surrenders.
      if (attackerWins) lossD += sideRegiments([a]); else lossA += sideRegiments([a]);
      for (const u of UNIT_TYPES) a.units[u] = 0;
    }
    a.lastBattle = w.turn;
  }
  for (const a of winners) {
    a.experience = clamp(a.experience + 0.06, 0, 1);
    a.lastBattle = w.turn;
    if (a.general && w.characters[a.general] && chance(w, 0.12)) w.characters[a.general].mil = Math.min(10, w.characters[a.general].mil + 1);
  }
  const aOwner = att[0]?.owner ?? REBELS, dOwner = dfn[0]?.owner ?? REBELS;
  const war = aOwner !== REBELS && dOwner !== REBELS ? warBetween(w, aOwner, dOwner) : undefined;
  const total = startA + startD;
  const swing = clamp(((attackerWins ? lossD : lossA) / Math.max(1, total)) * 60 + 2, 1, 20);
  if (war) {
    const attackerSide = sideOf(war, aOwner) === 'attackers';
    const sign = (attackerWins === attackerSide) ? 1 : -1;
    war.battleScore = clamp(war.battleScore + sign * swing * 0.6, -40, 40);
  }
  for (const [o, lost, won] of [[aOwner, lossA, attackerWins], [dOwner, lossD, !attackerWins]] as [string, number, boolean][]) {
    const c = w.countries[o];
    if (!c) continue;
    c.warExhaustion = clamp(c.warExhaustion + lost * 0.15 + (won ? 0 : 1.5), 0, 100);
    c.prestige = clamp(c.prestige + (won ? swing * 0.15 : -swing * 0.1), 0, 100);
    c.manpower = Math.max(0, c.manpower);
    if (won) c.stats.battlesWon++; else c.stats.battlesLost++;
  }
  const report: BattleReport = {
    id: newId(w, 'b'), turn: w.turn, kind: 'land', location: pid,
    attacker: { owner: aOwner, general: att[0]?.general, start: startA, losses: lossA },
    defender: { owner: dOwner, general: dfn[0]?.general, start: startD, losses: lossD },
    winner: attackerWins ? 'attacker' : 'defender', warId: war?.id, name: `Battle of ${provinceName(pid)}`,
  };
  w.battles.unshift(report);
  if (w.battles.length > 80) w.battles.length = 80;
  const big = total >= 40 || [aOwner, dOwner].includes(w.playerId);
  if (big) {
    const winnerName = countryName(w, attackerWins ? aOwner : dOwner);
    chronicle(w, { text: `Battle of ${provinceName(pid)}: ${winnerName} victorious. Losses ${Math.round(lossA * 1000).toLocaleString('en')} and ${Math.round(lossD * 1000).toLocaleString('en')} men.`, category: 'war', countries: [aOwner, dOwner], importance: total >= 80 ? 3 : 2 });
  }
  if ([aOwner, dOwner].includes(w.playerId)) {
    const playerWon = (aOwner === w.playerId) === attackerWins;
    notify(w, `${report.name}: ${playerWon ? 'victory' : 'defeat'}. We lost ${Math.round((aOwner === w.playerId ? lossA : lossD) * 1000).toLocaleString('en')} men.`, playerWon ? 'success' : 'danger');
  }
}

// ---------------------------------------------------------------------------
// Sieges and occupation
// ---------------------------------------------------------------------------

function besiegerHostileToHolder(w: WorldState, a: Army, holder: string | null): boolean {
  if (!holder) return false;
  if (a.rebel) return holder === a.rebel.against || topOverlord(w, holder) === a.rebel.against;
  if (holder === REBELS) return true;
  return atWar(w, a.owner, holder);
}

export function resolveSieges(w: WorldState, blockaded: Set<string>): void {
  const touched = new Set<string>();
  for (const a of Object.values(w.armies)) {
    if (a.status === 'embarked' || a.status === 'retreating' || a.path.length) continue;
    const p = w.provinces[a.location];
    if (!p) continue;
    const holder = p.controller ?? p.owner;
    const reclaim = !a.rebel && p.owner === a.owner && holder !== a.owner && holder !== null && (holder === REBELS || atWar(w, a.owner, holder));
    const liberate = !a.rebel && p.owner && p.owner !== a.owner && holder !== p.owner && friendly(w, a.owner, p.owner) && holder !== null && (holder === REBELS || atWar(w, a.owner, holder));
    if (!reclaim && !liberate && !besiegerHostileToHolder(w, a, holder)) continue;
    if (armiesAt(w, p.id).some((o) => hostile(w, a, o))) continue;
    const by = a.rebel ? REBELS : a.owner;
    if (p.siege && p.siege.by !== by && !(by !== REBELS && p.siege.by !== REBELS && friendly(w, by, p.siege.by))) p.siege = undefined;
    const siegeB = a.owner === REBELS ? 0 : bonuses(w, a.owner).siege ?? 0;
    const power = (6 + a.units.artillery * 5 + armyRegiments(a) * 0.25) * (1 + siegeB) * (blockaded.has(p.id) ? 1.25 : 1);
    const progress = p.fort <= 0 ? 100 : (power / (1 + p.fort * 1.3)) * randRange(w, 0.7, 1.3);
    p.siege = { by, progress: Math.min(100, (p.siege?.progress ?? 0) + progress) };
    a.status = 'sieging';
    touched.add(p.id);
    if (p.siege.progress >= 100) {
      const newController = reclaim ? a.owner : liberate ? p.owner! : by;
      captureProvince(w, p.id, newController, by);
    }
  }
  for (const p of Object.values(w.provinces)) {
    if (p.siege && !touched.has(p.id)) p.siege = undefined;
  }
  for (const a of Object.values(w.armies)) if (a.status === 'sieging' && !touched.has(a.location)) a.status = 'idle';
}

function captureProvince(w: WorldState, pid: string, controller: string, by: string): void {
  const p = w.provinces[pid];
  const prev = p.controller;
  p.controller = controller;
  p.siege = undefined;
  if (controller !== p.owner) {
    p.devastation = clamp(p.devastation + 8, 0, 100);
    p.unrest = clamp(p.unrest + 5, 0, 100);
  }
  for (const a of Object.values(w.armies)) if (a.location === pid && a.status === 'sieging') a.status = 'idle';
  touch(w);
  const big = p.fort >= 2 || w.countries[p.owner ?? '']?.capital === pid;
  const playerInvolved = [prev, controller, p.owner].includes(w.playerId);
  if (big || playerInvolved) {
    chronicle(w, { text: `${provinceName(pid)} falls to ${countryName(w, by === REBELS ? REBELS : controller)}${p.fort >= 2 ? ' after a siege' : ''}.`, category: 'war', countries: [controller, p.owner ?? ''], importance: big ? 2 : 1 });
  }
  if (playerInvolved) notify(w, `${provinceName(pid)} is now held by ${countryName(w, controller)}.`, controller === w.playerId || (p.owner === w.playerId && controller === p.owner) ? 'success' : 'warning');
}

// ---------------------------------------------------------------------------
// Supply, attrition and morale
// ---------------------------------------------------------------------------

export function supplyLimit(w: WorldState, pid: string, c: string): number {
  const p = w.provinces[pid];
  const t = TERRAIN[PROVINCE_DEFS[pid].terrain];
  const holder = p.controller ?? p.owner;
  const friendlyLand = !!holder && c !== REBELS && friendly(w, c, holder);
  const season = 1 / seasonCost(w, pid);
  return (6 + Math.sqrt(p.pop) * 0.9) * t.supply * season * (friendlyLand ? 1.2 : 0.75);
}

export function applyAttrition(w: WorldState): void {
  for (const a of Object.values(w.armies)) {
    if (a.status === 'embarked') continue;
    const size = armyRegiments(a);
    if (size <= 0) continue;
    const limit = supplyLimit(w, a.location, a.owner);
    const over = Math.max(0, size / limit - 1);
    const t = TERRAIN[PROVINCE_DEFS[a.location].terrain];
    const p = w.provinces[a.location];
    const holder = p.controller ?? p.owner;
    const hostileLand = !!holder && a.owner !== REBELS && !friendly(w, a.owner, holder);
    const b = a.owner === REBELS ? {} : bonuses(w, a.owner);
    // Garrisons resting in friendly country are fed by local magazines; armies on the march or
    // in enemy land suffer from terrain, disease and foraging.
    const resting = !hostileLand && a.status !== 'moving' && a.status !== 'retreating';
    let loss = hostileLand ? Math.min(0.08, over * 0.025) + t.attrition + 0.004
      : Math.min(0.03, over * 0.01) + (resting ? 0 : t.attrition * 0.5);
    loss *= 1 - clamp(b.attrition ?? 0, 0, 0.6);
    if (loss > 0.0005) applyLosses(a, loss);
    const regen = hostileLand ? 0.06 : a.status === 'idle' ? 0.18 : 0.1;
    a.morale = clamp(a.morale + regen, 0, 1);
    if (armyRegiments(a) < 0.1) removeArmy(w, a.id);
  }
}

// ---------------------------------------------------------------------------
// Rebellions
// ---------------------------------------------------------------------------

export function spawnRebels(w: WorldState, pid: string, cause: string, sizeMult = 1): Army | null {
  const p = w.provinces[pid];
  if (!p?.owner) return null;
  const size = clamp(Math.sqrt(p.pop) * 0.35 * sizeMult, 1, 30);
  const army: Army = {
    id: newId(w, 'a'), owner: REBELS, name: `${cause} (${provinceName(pid)})`, location: pid,
    units: { infantry: Math.round(size * 0.2 * 10) / 10, cavalry: 0, artillery: 0, irregulars: Math.round(size * 0.8 * 10) / 10 },
    morale: 0.85, experience: 0.05, path: [], progress: 0, status: 'idle', rebel: { against: p.owner, cause },
  };
  w.armies[army.id] = army;
  forcesChanged(w);
  chronicle(w, { text: `Rebellion in ${provinceName(pid)}: ${cause} take up arms against ${countryName(w, p.owner)}.`, category: 'revolution', countries: [p.owner], importance: p.owner === w.playerId ? 2 : 1 });
  if (p.owner === w.playerId) notify(w, `Revolt! ${cause} have risen in ${provinceName(pid)}.`, 'danger');
  return army;
}

/** Rebels that hold enough of a country win their demands. */
export function resolveRebellions(w: WorldState): void {
  const byTarget = new Map<string, Army[]>();
  for (const a of Object.values(w.armies)) {
    if (!a.rebel) continue;
    const list = byTarget.get(a.rebel.against) ?? [];
    list.push(a);
    byTarget.set(a.rebel.against, list);
    // Rebels melt away when beaten down or the target no longer exists.
    if (!w.countries[a.rebel.against]?.alive || armyRegiments(a) < 0.5) removeArmy(w, a.id);
  }
  for (const [target, rebels] of byTarget) {
    const c = w.countries[target];
    if (!c?.alive) continue;
    const owned = provincesOf(w, target);
    const held = owned.filter((id) => w.provinces[id].controller === REBELS);
    const ratio = held.length / Math.max(1, owned.length);
    const capitalHeld = w.provinces[c.capital]?.controller === REBELS;
    if (ratio < 0.34 && !(capitalHeld && ratio > 0.15)) continue;
    const cause = rebels[0]?.rebel?.cause ?? 'Rebels';
    rebelVictory(w, target, held, cause);
  }
}

function rebelVictory(w: WorldState, target: string, held: string[], cause: string): void {
  const c = w.countries[target];
  // A dormant polity with cores in the held provinces may be restored.
  const restorable = Object.values(w.countries).find((d) => !d.alive && held.filter((id) => w.provinces[id].cores.includes(d.id)).length >= Math.max(1, held.length * 0.5));
  if (restorable) {
    restorable.alive = true;
    restorable.capital = held.find((id) => w.provinces[id].cores.includes(restorable.id)) ?? held[0];
    const pd = def(restorable.id);
    restorable.treasury = 50;
    restorable.overlord = undefined;
    restorable.subjectType = undefined;
    if (!w.characters[restorable.rulerId]) {
      const r = makeCharacter(w, { country: restorable.id, role: 'ruler', name: pd.ruler[0], born: year(w) - 45 });
      restorable.rulerId = r.id;
    }
    for (const id of held) {
      const p = w.provinces[id];
      if (!p.cores.includes(restorable.id)) { p.controller = target; continue; }
      p.owner = restorable.id;
      p.controller = restorable.id;
      p.cores = [...new Set([...p.cores, target])];
    }
    chronicle(w, { text: `${pd.name} is restored! Rebels proclaim independence from ${countryName(w, target)}.`, category: 'revolution', countries: [target, restorable.id], importance: 3 });
  } else if (c.overlord) {
    const overlord = c.overlord;
    c.overlord = undefined;
    c.subjectType = undefined;
    c.liberty = 0;
    for (const id of held) w.provinces[id].controller = target;
    chronicle(w, { text: `${countryName(w, target)} throws off the authority of ${countryName(w, overlord)} after a successful revolt.`, category: 'revolution', countries: [target, overlord], importance: 3 });
  } else {
    // Concessions: the government falls and taxes are cut.
    c.stability = clamp(c.stability - 15, 0, 100);
    c.legitimacy = clamp(c.legitimacy - 20, 0, 100);
    c.taxRate = Math.max(0.03, c.taxRate * 0.75);
    for (const id of held) w.provinces[id].controller = target;
    for (const id of provincesOf(w, target)) w.provinces[id].unrest = clamp(w.provinces[id].unrest - 25, 0, 100);
    chronicle(w, { text: `The ${cause} force ${countryName(w, target)} to accept their demands: taxes are cut and ministers dismissed.`, category: 'revolution', countries: [target], importance: 2 });
  }
  for (const a of Object.values(w.armies)) if (a.rebel?.against === target) removeArmy(w, a.id);
  if (target === w.playerId) notify(w, `The ${cause} have prevailed against us.`, 'danger');
  touch(w);
}

export function newGeneralFor(w: WorldState, c: string): string {
  return generateGeneral(w, c).id;
}

export function chanceOfRevolt(unrest: number): number {
  return unrest <= 55 ? 0 : ((unrest - 55) / 45) * 0.05;
}

export function rollDice(w: WorldState): number {
  return rand(w);
}

export function emptyUnits(): UnitCounts {
  return { infantry: 0, cavalry: 0, artillery: 0, irregulars: 0 };
}
