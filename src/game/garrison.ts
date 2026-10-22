// Border garrisons: a standing army posted to hold one province. When the player wins land, barracks
// go up there and a garrison is raised (or one left behind the new border marches up to it). Garrisons
// stay at their posts when the armies are gathered, and go back to them after a battle.
import { UNITS } from '../data/buildings';
import { buildingQuote, startConstruction } from './construction';
import { wageFactor } from './economy';
import { canRecruitIn, findPath, orderMove, recruitCost, UNIT_TYPES } from './military';
import { armiesOf, bonuses, forcesChanged, newId, notify, provinceName, topOverlord } from './state';
import { isCoastal, neighbors } from './static';
import type { Army, UnitCounts, WorldState } from './types';

/** Regiments in a new garrison unless the settings say otherwise. */
export const DEFAULT_GARRISON = 6;
/** At most this many garrisons are raised by themselves after one peace. */
const AUTO_LIMIT = 8;

export function garrisonSize(w: WorldState): number {
  return Math.max(1, Math.min(30, Math.round(w.settings.garrisonSize ?? DEFAULT_GARRISON)));
}

/** Foreign realms whose land touches the province (our own subjects and overlord do not count). */
export function foreignNeighbours(w: WorldState, c: string, pid: string): string[] {
  const top = topOverlord(w, c);
  const out = new Set<string>();
  for (const n of neighbors(pid)) {
    const o = w.provinces[n]?.owner;
    if (o && o !== c && w.countries[o]?.alive && topOverlord(w, o) !== top) out.add(o);
  }
  return [...out];
}

/** A province an invader could reach: it borders foreign land or lies on the coast. */
export function onFrontier(w: WorldState, c: string, pid: string): boolean {
  return foreignNeighbours(w, c, pid).length > 0 || isCoastal(pid);
}

export function garrisonOf(w: WorldState, c: string, pid: string): Army | undefined {
  return armiesOf(w, c).find((a) => a.garrison === pid);
}

/** Infantry, with a squadron of horse to scout and a battery of guns once cannon can be cast. */
export function garrisonUnits(w: WorldState, c: string, size: number): UnitCounts {
  const art = size >= 4 && w.countries[c].techs.includes('blast_furnace') ? 1 : 0;
  const cav = size >= 3 ? 1 : 0;
  return { infantry: size - art - cav, cavalry: cav, artillery: art, irregulars: 0 };
}

export interface GarrisonOrder {
  pid: string;
  units: UnitCounts;
  /** Cost of raising the troops, and of barracks (0 when they stand already or are being built). */
  troops: number;
  barracks: number;
  /** Months until the last regiment is ready. */
  months: number;
  /** A garrison from behind the new border that marches here instead of raising new troops. */
  from?: Army;
}

export interface GarrisonPlan {
  orders: GarrisonOrder[];
  skipped: { pid: string; why: string }[];
  cost: number;
  regiments: number;
  /** Added upkeep a month, £ thousands. */
  upkeep: number;
}

/**
 * Garrisons for the given provinces, nearest the enemy first, as far as the treasury and manpower go.
 * With `advance`, garrisons whose posts now lie inside our borders move up instead of new ones being raised.
 */
export function planGarrisons(w: WorldState, c: string, pids: string[], opts: { advance?: boolean; size?: number } = {}): GarrisonPlan {
  const country = w.countries[c];
  const plan: GarrisonPlan = { orders: [], skipped: [], cost: 0, regiments: 0, upkeep: 0 };
  let purse = country.treasury;
  let men = country.manpower;
  const size = opts.size ?? garrisonSize(w);
  const spare = opts.advance
    ? armiesOf(w, c).filter((a) => a.garrison && a.garrison === a.location && a.status === 'idle' && !onFrontier(w, c, a.garrison) && !pids.includes(a.garrison))
    : [];
  const sites = [...new Set(pids)].sort((a, b) => foreignNeighbours(w, c, b).length - foreignNeighbours(w, c, a).length);
  const upkeepRate = wageFactor(w, c) * (1 - (bonuses(w, c).upkeep ?? 0)) * (1 + country.inflation / 100);
  for (const pid of sites) {
    const err = canRecruitIn(w, c, pid);
    if (err) { plan.skipped.push({ pid, why: err }); continue; }
    if (garrisonOf(w, c, pid)) { plan.skipped.push({ pid, why: 'already garrisoned' }); continue; }
    const p = w.provinces[pid];
    const needBarracks = !(p.buildings.barracks ?? 0) && !w.construction.some((k) => k.province === pid && k.building === 'barracks');
    const barracks = needBarracks ? buildingQuote(w, c, pid, 'barracks').cost : 0;
    const from = spare.filter((a) => findPath(w, c, a.location, pid)).sort((x, y) => (findPath(w, c, x.location, pid)!.length - findPath(w, c, y.location, pid)!.length))[0];
    if (from) {
      spare.splice(spare.indexOf(from), 1);
      if (barracks > purse) { plan.orders.push({ pid, units: { ...from.units }, troops: 0, barracks: 0, months: 0, from }); continue; }
      purse -= barracks;
      plan.cost += barracks;
      plan.orders.push({ pid, units: { ...from.units }, troops: 0, barracks, months: 0, from });
      continue;
    }
    const n = Math.min(size, Math.floor(men));
    if (n < 1) { plan.skipped.push({ pid, why: 'no manpower left' }); continue; }
    const units = garrisonUnits(w, c, n);
    const troops = UNIT_TYPES.reduce((s, u) => s + (units[u] ? recruitCost(w, c, u, units[u]) : 0), 0);
    if (troops + barracks > purse) { plan.skipped.push({ pid, why: `the treasury cannot pay (£${Math.round(troops + barracks)}k)` }); continue; }
    const quick = (p.buildings.barracks ?? 0) > 0 ? 1 : 0;
    const months = Math.max(...UNIT_TYPES.filter((u) => units[u]).map((u) => Math.max(1, UNITS[u].months - quick)));
    purse -= troops + barracks;
    men -= UNIT_TYPES.reduce((s, u) => s + units[u] * UNITS[u].manpower, 0);
    plan.cost += troops + barracks;
    plan.regiments += n;
    plan.upkeep += UNIT_TYPES.reduce((s, u) => s + units[u] * UNITS[u].upkeep, 0) * upkeepRate;
    plan.orders.push({ pid, units, troops, barracks, months });
  }
  return plan;
}

/** Puts a plan into effect: barracks begun, regiments enlisted (they muster as the post's garrison), garrisons moved up. */
export function executeGarrisons(w: WorldState, c: string, plan: GarrisonPlan): void {
  const country = w.countries[c];
  for (const o of plan.orders) {
    if (o.barracks) startConstruction(w, c, o.pid, 'barracks');
    if (o.from) {
      o.from.garrison = o.pid;
      o.from.name = `${provinceName(o.pid)} Garrison`;
      orderMove(w, o.from, o.pid);
      continue;
    }
    const quick = (w.provinces[o.pid].buildings.barracks ?? 0) > 0 ? 1 : 0;
    for (const u of UNIT_TYPES) {
      const count = o.units[u];
      if (!count) continue;
      country.treasury -= recruitCost(w, c, u, count);
      country.manpower -= count * UNITS[u].manpower;
      w.recruitment.push({ id: newId(w, 'r'), country: c, province: o.pid, kind: 'unit', unit: u, count, monthsLeft: Math.max(1, UNITS[u].months - quick), garrison: true });
    }
  }
}

/** After a peace: post garrisons in the player's newly won provinces that face foreign land or the sea. */
export function garrisonConquests(w: WorldState, c: string, won: string[]): void {
  if (c !== w.playerId || w.settings.autoGarrison === false) return;
  const ours = won.filter((pid) => w.provinces[pid]?.owner === c);
  if (!ours.length) return;
  const exposed = ours.filter((pid) => onFrontier(w, c, pid)).sort((a, b) => foreignNeighbours(w, c, b).length - foreignNeighbours(w, c, a).length);
  const plan = planGarrisons(w, c, exposed.slice(0, AUTO_LIMIT), { advance: true });
  executeGarrisons(w, c, plan);
  const raised = plan.orders.filter((o) => !o.from);
  const moved = plan.orders.filter((o) => o.from);
  const parts: string[] = [];
  if (raised.length) {
    const months = Math.max(...raised.map((o) => o.months));
    parts.push(`${plan.regiments} regiments enlisted to garrison ${raised.map((o) => provinceName(o.pid)).join(', ')} (ready in ${months} month${months > 1 ? 's' : ''})`);
  }
  if (moved.length) parts.push(`${moved.map((o) => `the ${provinceName(o.from!.location)} garrison`).join(', ')} march${moved.length === 1 ? 'es' : ''} up to the new border at ${moved.map((o) => provinceName(o.pid)).join(', ')}`);
  const built = plan.orders.filter((o) => o.barracks).length;
  if (built) parts.push(`barracks going up in ${built === plan.orders.length ? 'each' : built}`);
  if (parts.length) notify(w, `Our new border is secured: ${parts.join('; ')}. Cost £${Math.round(plan.cost)}k.`, 'success');
  const poor = plan.skipped.filter((s) => s.why !== 'already garrisoned');
  if (poor.length) notify(w, `No garrison for ${poor.map((s) => `${provinceName(s.pid)} (${s.why})`).join(', ')}. Post one from the province card when you can.`, 'warning');
  if (exposed.length > AUTO_LIMIT) notify(w, `${exposed.length - AUTO_LIMIT} more won provinces on the frontier have no garrison yet: post them from their province cards.`, 'info');
}

/** Monthly: a garrison that lost its post joins the field armies; one that strayed (after a battle) goes back. */
export function tendGarrisons(w: WorldState): void {
  for (const a of Object.values(w.armies)) {
    if (!a.garrison) continue;
    const post = w.provinces[a.garrison];
    if (!post || post.owner !== a.owner) {
      if (a.owner === w.playerId) notify(w, `${a.name} has lost its post at ${provinceName(a.garrison)} and joins the field armies.`, 'warning');
      a.garrison = undefined;
      continue;
    }
    if (a.location !== a.garrison && a.status === 'idle' && !a.path.length && !a.voyage) orderMove(w, a, a.garrison);
  }
}

/** A fresh garrison regiment mustering at its post: joins the post's garrison, or forms it. */
export function musterGarrison(w: WorldState, c: string, pid: string): Army {
  let army = garrisonOf(w, c, pid);
  if (army && army.location === pid && army.status !== 'embarked') return army;
  army = armiesOf(w, c).find((a) => a.garrison === pid && a.location === pid && a.status !== 'embarked');
  if (army) return army;
  // (A garrison away from its post when new men arrive marches back and joins them there.)
  army = {
    id: newId(w, 'a'), owner: c, name: `${provinceName(pid)} Garrison`, location: pid,
    units: { infantry: 0, cavalry: 0, artillery: 0, irregulars: 0 }, morale: 0.6, experience: 0, path: [], progress: 0, status: 'idle', garrison: pid,
  };
  w.armies[army.id] = army;
  forcesChanged(w);
  return army;
}
