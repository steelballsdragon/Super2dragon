// Naval warfare: fleet movement, battles, blockades and overseas expeditions.
import { SHIPS } from '../data/buildings';
import { REBELS } from './constants';
import { randRange } from './rng';
import {
  armyRegiments, atWar, bonuses, chronicle, clamp, countryName, establishment, newId, notify, provinceName, sideOf, warBetween,
  forcesChanged,
} from './state';
import { GEO, SEA_DEFS, coastalSeas, seaNeighbors, seaPoint } from './static';
import type { Army, Fleet, WorldState } from './types';

let seaToProv: Map<string, string[]> | null = null;
export function provincesOnSea(sea: string): string[] {
  if (!seaToProv) {
    seaToProv = new Map();
    for (const [id, g] of Object.entries(GEO.provinces)) for (const s of g.seas) {
      const l = seaToProv.get(s) ?? [];
      l.push(id);
      seaToProv.set(s, l);
    }
  }
  return seaToProv.get(sea) ?? [];
}

export function fleetRawPower(f: Fleet): number {
  return f.ships.line * SHIPS.line.power + f.ships.frigate * SHIPS.frigate.power + f.ships.transport * SHIPS.transport.power;
}

export function fleetStrength(w: WorldState, f: Fleet): number {
  const b = bonuses(w, f.owner);
  const adm = f.admiral ? w.characters[f.admiral]?.mil ?? 0 : 0;
  return fleetRawPower(f) * (1 + (b.naval ?? 0)) * (0.4 + 0.6 * f.morale) * (1 + adm * 0.06);
}

export function fleetCapacity(f: Fleet): number {
  return f.ships.line * SHIPS.line.capacity + f.ships.frigate * SHIPS.frigate.capacity + f.ships.transport * SHIPS.transport.capacity;
}

export function blockadedProvinces(w: WorldState): Set<string> {
  const out = new Set<string>();
  const bySea = new Map<string, Fleet[]>();
  for (const f of Object.values(w.fleets)) {
    const l = bySea.get(f.location) ?? [];
    l.push(f);
    bySea.set(f.location, l);
  }
  for (const [sea, fleets] of bySea) {
    for (const f of fleets) {
      const power = fleetStrength(w, f);
      if (power < 3) continue;
      for (const pid of provincesOnSea(sea)) {
        const p = w.provinces[pid];
        const holder = p.controller ?? p.owner;
        if (!holder || holder === REBELS || !atWar(w, f.owner, holder)) continue;
        const defenders = fleets.filter((o) => o.owner === holder || (o.owner !== f.owner && !atWar(w, o.owner, holder) && atWar(w, o.owner, f.owner)));
        const defPower = defenders.reduce((s, o) => s + fleetStrength(w, o), 0);
        if (defPower < power * 0.5) out.add(pid);
      }
    }
  }
  return out;
}

export function findSeaPath(from: string, to: string): string[] | null {
  if (from === to) return [];
  if (SEA_DEFS[to]?.frozen) return null;
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open: [number, string][] = [[0, from]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, cur] = open.shift()!;
    if (cur === to) break;
    if (d > (dist.get(cur) ?? Infinity)) continue;
    const [cx, cy] = seaPoint(cur);
    for (const n of seaNeighbors(cur)) {
      if (SEA_DEFS[n]?.frozen && n !== to) continue;
      const [nx, ny] = seaPoint(n);
      let step = Math.hypot(nx - cx, ny - cy);
      if (step > 1000) step = 2000 - step; // across the antimeridian
      const nd = d + Math.max(20, step);
      if (nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); prev.set(n, cur); open.push([nd, n]); }
    }
  }
  if (!prev.has(to)) return null;
  const path: string[] = [];
  let cur = to;
  while (cur !== from) { path.unshift(cur); cur = prev.get(cur)!; }
  return path;
}

export function seaPathLength(from: string, path: string[]): number {
  let total = 0;
  let cur = from;
  for (const s of path) {
    const [ax, ay] = seaPoint(cur);
    const [bx, by] = seaPoint(s);
    let step = Math.hypot(bx - ax, by - ay);
    if (step > 1000) step = 2000 - step;
    total += Math.max(20, step);
    cur = s;
  }
  return total;
}

export function fleetSpeed(w: WorldState, f: Fleet): number {
  const b = bonuses(w, f.owner);
  return 210 * (1 + (b.movement ?? 0) * 0.3) * (f.ships.line > f.ships.frigate ? 0.85 : 1);
}

export function orderFleet(w: WorldState, f: Fleet, target: string): boolean {
  const path = findSeaPath(f.location, target);
  if (!path) return false;
  f.path = path;
  f.progress = 0;
  return true;
}

export function moveFleets(w: WorldState): void {
  for (const f of Object.values(w.fleets)) {
    if (!f.path.length) continue;
    let budget = fleetSpeed(w, f);
    while (f.path.length && budget > 0) {
      const next = f.path[0];
      const [ax, ay] = seaPoint(f.location);
      const [bx, by] = seaPoint(next);
      let cost = Math.hypot(bx - ax, by - ay);
      if (cost > 1000) cost = 2000 - cost;
      cost = Math.max(20, cost);
      if (f.progress + budget >= cost) {
        budget -= cost - f.progress;
        f.progress = 0;
        f.location = next;
        f.path.shift();
        if (Object.values(w.fleets).some((o) => o.location === next && atWar(w, o.owner, f.owner) && fleetStrength(w, o) > 2)) { f.path = []; break; }
      } else {
        f.progress += budget;
        budget = 0;
      }
    }
    if (!f.path.length && f.carrying.length && f.landingTarget) land(w, f);
  }
}

function land(w: WorldState, f: Fleet): void {
  const target = f.landingTarget!;
  for (const id of f.carrying) {
    const a = w.armies[id];
    if (!a) continue;
    a.location = target;
    a.status = 'idle';
    a.fleet = undefined;
    a.path = [];
    a.morale = clamp(a.morale - 0.15, 0, 1);
    if (a.owner === w.playerId) notify(w, `${a.name} has landed at ${provinceName(target)}.`, 'success');
  }
  f.carrying = [];
  f.landingTarget = undefined;
  f.mission = 'idle';
}

/** Validate and start an overseas expedition. Returns an error message or null. */
export function planExpedition(w: WorldState, a: Army, target: string): { fleet: Fleet; path: string[]; months: number } | string {
  const originSeas = coastalSeas(a.location);
  const targetSeas = coastalSeas(target);
  if (!originSeas.length) return 'The army is not in a coastal province.';
  if (!targetSeas.length) return 'The destination has no coast.';
  const size = armyRegiments(a);
  const fleets = Object.values(w.fleets).filter((f) => f.owner === a.owner && originSeas.includes(f.location) && !f.carrying.length && !f.path.length);
  const fleet = fleets.sort((x, y) => fleetCapacity(y) - fleetCapacity(x))[0];
  if (!fleet) return 'No idle fleet of ours lies off this coast.';
  if (fleetCapacity(fleet) + 0.01 < size) return `Transport capacity ${fleetCapacity(fleet).toFixed(1)} regiments; the army has ${size.toFixed(1)}. Build transports.`;
  let best: string[] | null = null;
  for (const s of targetSeas) {
    const p = findSeaPath(fleet.location, s);
    if (p && (!best || seaPathLength(fleet.location, p) < seaPathLength(fleet.location, best))) best = p;
  }
  if (!best) return 'No sea route to the destination.';
  return { fleet, path: best, months: Math.max(1, Math.ceil(seaPathLength(fleet.location, best) / fleetSpeed(w, fleet))) };
}

export function startExpedition(w: WorldState, a: Army, target: string): string | null {
  const plan = planExpedition(w, a, target);
  if (typeof plan === 'string') return plan;
  a.status = 'embarked';
  a.fleet = plan.fleet.id;
  a.path = [];
  plan.fleet.carrying.push(a.id);
  plan.fleet.path = plan.path;
  plan.fleet.progress = 0;
  plan.fleet.mission = 'transport';
  plan.fleet.landingTarget = target;
  if (!plan.path.length) land(w, plan.fleet);
  return null;
}

export function resolveNavalBattles(w: WorldState): void {
  const bySea = new Map<string, Fleet[]>();
  for (const f of Object.values(w.fleets)) {
    const l = bySea.get(f.location) ?? [];
    l.push(f);
    bySea.set(f.location, l);
  }
  for (const [sea, fleets] of bySea) {
    if (fleets.length < 2) continue;
    const a0 = fleets.find((f) => fleets.some((g) => atWar(w, f.owner, g.owner)));
    if (!a0) continue;
    const enemies = fleets.filter((g) => atWar(w, a0.owner, g.owner));
    const friends = fleets.filter((g) => !atWar(w, a0.owner, g.owner) && enemies.some((e) => atWar(w, g.owner, e.owner)));
    navalBattle(w, sea, friends, enemies);
  }
  for (const f of Object.values(w.fleets)) if (fleetRawPower(f) < 0.25 && f.carrying.length === 0) { delete w.fleets[f.id]; forcesChanged(w); }
}

function sink(f: Fleet, fraction: number): number {
  let lost = 0;
  for (const k of ['line', 'frigate', 'transport'] as const) {
    const l = f.ships[k] * Math.min(0.9, fraction * (k === 'transport' ? 1.4 : 1));
    f.ships[k] = Math.max(0, f.ships[k] - l);
    lost += l;
  }
  return lost;
}

function navalBattle(w: WorldState, sea: string, sideA: Fleet[], sideB: Fleet[]): void {
  const pa = sideA.reduce((s, f) => s + fleetStrength(w, f), 0);
  const pb = sideB.reduce((s, f) => s + fleetStrength(w, f), 0);
  if (pa < 1 && pb < 1) return;
  const ra = sideA.reduce((s, f) => s + fleetRawPower(f), 0) || 1;
  const rb = sideB.reduce((s, f) => s + fleetRawPower(f), 0) || 1;
  const dmgB = (pa * 0.22 * randRange(w, 0.7, 1.3)) / rb;
  const dmgA = (pb * 0.22 * randRange(w, 0.7, 1.3)) / ra;
  let lostA = 0, lostB = 0;
  for (const f of sideA) { lostA += sink(f, dmgA); f.morale = clamp(f.morale - dmgA * 1.5, 0, 1); }
  for (const f of sideB) { lostB += sink(f, dmgB); f.morale = clamp(f.morale - dmgB * 1.5, 0, 1); }
  const aWins = pa * (1 - dmgA) > pb * (1 - dmgB);
  const losers = aWins ? sideB : sideA;
  for (const f of losers) {
    for (const id of f.carrying) {
      const army: Army | undefined = w.armies[id];
      if (army) { establishment(army); for (const u of ['infantry', 'cavalry', 'artillery', 'irregulars'] as const) army.units[u] *= 0.5; }
    }
    const retreat = seaNeighbors(sea).find((s) => !Object.values(w.fleets).some((o) => o.location === s && atWar(w, o.owner, f.owner)));
    if (retreat) { f.location = retreat; f.path = []; }
  }
  const aOwner = sideA[0].owner, bOwner = sideB[0].owner;
  const war = warBetween(w, aOwner, bOwner);
  if (war) {
    const attackerSide = sideOf(war, aOwner) === 'attackers';
    const sign = aWins === attackerSide ? 1 : -1;
    war.battleScore = clamp(war.battleScore + sign * Math.min(12, (aWins ? lostB : lostA) * 0.8 + 1), -40, 40);
  }
  for (const [o, won] of [[aOwner, aWins], [bOwner, !aWins]] as [string, boolean][]) {
    const c = w.countries[o];
    if (c) c.prestige = clamp(c.prestige + (won ? 3 : -3), 0, 100);
  }
  w.battles.unshift({
    id: newId(w, 'b'), turn: w.turn, kind: 'naval', location: sea,
    attacker: { owner: aOwner, general: sideA[0].admiral, start: ra, losses: lostA },
    defender: { owner: bOwner, general: sideB[0].admiral, start: rb, losses: lostB },
    winner: aWins ? 'attacker' : 'defender', warId: war?.id, name: `Battle of the ${SEA_DEFS[sea]?.name ?? sea}`,
  });
  if (ra + rb > 60 || [aOwner, bOwner].includes(w.playerId)) {
    chronicle(w, { text: `Naval battle in the ${SEA_DEFS[sea]?.name ?? sea}: the ${countryName(w, aWins ? aOwner : bOwner)} fleet prevails.`, category: 'war', countries: [aOwner, bOwner], importance: ra + rb > 150 ? 3 : 2 });
  }
  if ([aOwner, bOwner].includes(w.playerId)) {
    const won = (aOwner === w.playerId) === aWins;
    notify(w, `Naval battle in the ${SEA_DEFS[sea]?.name ?? sea}: ${won ? 'victory' : 'defeat'}.`, won ? 'success' : 'danger');
  }
}
