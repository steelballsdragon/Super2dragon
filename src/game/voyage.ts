// Voyages: an army marches to a friendly port, boards our own fleet or hired merchant transports,
// sails, lands, and marches on inland if its destination lies away from the coast.
import { SHIPS } from '../data/buildings';
import { canEnter, findPath, orderMove, pathMonths } from './military';
import { bestSeaPath, fleetCapacity, fleetSpeed, fleetStrength, seaPathLength } from './naval';
import { armyRegiments, atWar, forcesChanged, newId, notify, provinceName } from './state';
import { PROVINCE_IDS, coastalSeas, isCoastal, provinceDistance } from './static';
import type { Army, Fleet, WorldState } from './types';

/** Hired transports sail a little slower than a navy. */
const CHARTER_SPEED = 180;

export interface VoyagePlan {
  /** Coastal province where the army boards. */
  embark: string;
  /** Overland route to it ([] when the army is already there). */
  toPort: string[];
  /** Sea zone it sails from, and the zones it crosses. */
  fromSea: string;
  seaPath: string[];
  /** Coastal province where it lands, and where it ends up. */
  landAt: string;
  final: string;
  /** Our own fleet when one lies off the port with room for the army; otherwise ships are hired. */
  fleet: Fleet | null;
  cost: number;
  months: { march: number; sail: number; inland: number; total: number };
  /** Sea zones on the route where enemy warships lie. */
  dangers: string[];
}

/** Hire of merchant shipping, in £ thousands: by the regiment and the distance. */
export function charterCost(w: WorldState, c: string, regiments: number, distance: number): number {
  return Math.round(regiments * (1 + distance / 400) * (1 + (w.countries[c]?.inflation ?? 0) / 100) * 10) / 10;
}

const holderOf = (w: WorldState, pid: string) => w.provinces[pid]?.controller ?? w.provinces[pid]?.owner;

/** Coastal provinces nearest a place, nearest first. */
function nearestCoasts(pid: string, n: number, accept: (p: string) => boolean): string[] {
  return PROVINCE_IDS.filter((p) => isCoastal(p) && accept(p)).sort((a, b) => provinceDistance(a, pid) - provinceDistance(b, pid)).slice(0, n);
}

export function planVoyage(w: WorldState, a: Army, target: string): VoyagePlan | string {
  if (a.status === 'embarked') return 'The army is already at sea.';
  if (!w.provinces[target]) return 'Choose a province.';
  if (target === a.location) return 'The army is already there.';
  const c = a.owner;
  const size = armyRegiments(a);
  if (size <= 0) return 'The army has no men.';

  // Where to land: the destination itself if it has a coast, else the nearest coast with a road to it.
  // Troops land only where they may set foot: our own or allied land, enemy land, or a neutral's that grants access.
  if (isCoastal(target) && !canEnter(w, c, target)) return `We have no right to land in ${provinceName(target)}: we are neither at war with its masters nor granted military access.`;
  const landings = isCoastal(target) ? [target] : nearestCoasts(target, 8, (p) => canEnter(w, c, p)).filter((p) => findPath(w, c, p, target)).slice(0, 3);
  if (!landings.length) return 'No coast we may land on lies within reach of that place.';
  // Where to board: here if on the coast, else the nearest friendly ports within a march.
  const here = isCoastal(a.location) ? [a.location] : [];
  // Any port the army can march into (ours, an ally's, or a neutral's that grants us access) will hire out ships.
  const ports = here.length ? here : nearestCoasts(a.location, 12, (p) => { const h = holderOf(w, p); return !!h && !atWar(w, c, h); });
  // The four nearest ports the army can actually march to.
  const routes: [string, string[]][] = [];
  for (const p of ports) {
    if (routes.length >= 4) break;
    const toPort = p === a.location ? [] : findPath(w, c, a.location, p);
    if (toPort) routes.push([p, toPort]);
  }
  const reachable = routes.length;
  let best: VoyagePlan | null = null;
  for (const [embark, toPort] of routes) {
    const march = toPort.length ? pathMonths(w, a, toPort) : 0;
    const portHolder = holderOf(w, embark);
    const own = Object.values(w.fleets).find((f) => f.owner === c && !f.chartered && coastalSeas(embark).includes(f.location) && !f.carrying.length && !f.path.length && fleetCapacity(f) + 0.01 >= size);
    // Hired ships will not call at a port held by an enemy; our own fleet can take an army off any coast.
    if (!own && !(portHolder && !atWar(w, c, portHolder))) continue;
    for (const landAt of landings) {
      if (landAt === embark) continue;
      const fromSeas = own ? [own.location] : coastalSeas(embark);
      for (const fromSea of fromSeas) {
        const seaPath = bestSeaPath(fromSea, coastalSeas(landAt));
        if (!seaPath) continue;
        const length = seaPathLength(fromSea, seaPath);
        const sail = Math.max(1, Math.ceil(length / (own ? fleetSpeed(w, own) : CHARTER_SPEED)));
        const inlandPath = landAt === target ? [] : findPath(w, c, landAt, target);
        if (!inlandPath) continue;
        const inland = inlandPath.length ? pathMonths(w, { ...a, location: landAt }, inlandPath) : 0;
        const total = march + sail + inland;
        if (best && best.months.total <= total) continue;
        const dangers = [fromSea, ...seaPath].filter((s) => Object.values(w.fleets).some((f) => f.location === s && atWar(w, f.owner, c) && fleetStrength(w, f) > 2));
        best = {
          embark, toPort, fromSea, seaPath, landAt, final: target, fleet: own ?? null,
          cost: own ? 0 : charterCost(w, c, size, length),
          months: { march, sail, inland, total }, dangers,
        };
      }
    }
  }
  if (!best) {
    if (here.length) return 'No sea route from this coast leads there, and no ships can be hired at an enemy-held port.';
    if (!reachable) return 'No road leads to a port: we hold no coast nearby. Military access through a coastal neighbour (Diplomacy) opens its ports to us.';
    return 'No port within reach has a sea route there.';
  }
  return best;
}

/** Pays for hired ships if needed, then marches the army to its port (or boards at once). */
export function startVoyage(w: WorldState, a: Army, target: string): VoyagePlan | string {
  const plan = planVoyage(w, a, target);
  if (typeof plan === 'string') return plan;
  const country = w.countries[a.owner];
  if (plan.cost > country.treasury) return `Hiring ships costs £${plan.cost}k.`;
  country.treasury -= plan.cost;
  a.voyage = { embark: plan.embark, landAt: plan.landAt, final: plan.final, fleet: plan.fleet?.id, paid: plan.cost > 0 };
  if (plan.toPort.length) orderMove(w, a, plan.embark);
  else board(w, a);
  return plan;
}

function charter(w: WorldState, owner: string, sea: string, regiments: number): Fleet {
  const f: Fleet = {
    id: newId(w, 'f'), owner, name: 'Hired transports', location: sea,
    ships: { line: 0, frigate: 0, transport: Math.max(1, Math.ceil(regiments / SHIPS.transport.capacity)) },
    morale: 0.6, path: [], progress: 0, mission: 'transport', carrying: [], chartered: true,
  };
  w.fleets[f.id] = f;
  forcesChanged(w);
  return f;
}

/** The army is at its port: put it aboard and set sail. */
function board(w: WorldState, a: Army): void {
  const v = a.voyage!;
  const size = armyRegiments(a);
  let fleet = v.fleet ? w.fleets[v.fleet] : undefined;
  if (fleet && (!coastalSeas(a.location).includes(fleet.location) || fleet.carrying.length || fleet.path.length || fleetCapacity(fleet) + 0.01 < size)) fleet = undefined;
  if (!fleet) {
    // Our fleet is gone or busy: hire ships after all, if the purse allows.
    const seaPath = coastalSeas(a.location).map((s) => ({ s, p: bestSeaPath(s, coastalSeas(v.landAt)) })).filter((x) => x.p).sort((x, y) => seaPathLength(x.s, x.p!) - seaPathLength(y.s, y.p!))[0];
    if (!seaPath) { cancel(w, a, 'no sea route remains'); return; }
    if (!v.paid) {
      const cost = charterCost(w, a.owner, size, seaPathLength(seaPath.s, seaPath.p!));
      if (w.countries[a.owner].treasury < cost) { cancel(w, a, 'our own fleet is not there and the treasury cannot hire ships'); return; }
      w.countries[a.owner].treasury -= cost;
      v.paid = true;
    }
    fleet = charter(w, a.owner, seaPath.s, size);
  }
  const path = bestSeaPath(fleet.location, coastalSeas(v.landAt));
  if (!path) { cancel(w, a, 'no sea route remains'); return; }
  a.status = 'embarked';
  a.fleet = fleet.id;
  a.path = [];
  fleet.carrying.push(a.id);
  fleet.path = path;
  fleet.progress = 0;
  fleet.mission = 'transport';
  fleet.landingTarget = v.landAt;
  if (a.owner === w.playerId) notify(w, `${a.name} embarks at ${provinceName(a.location)} for ${provinceName(v.landAt)}.`, 'info');
}

function cancel(w: WorldState, a: Army, why: string): void {
  if (a.owner === w.playerId) notify(w, `${a.name} cannot sail: ${why}.`, 'warning');
  a.voyage = undefined;
}

/** Monthly, after armies and fleets move: board armies that reached their port, march landed ones inland. */
export function processVoyages(w: WorldState): void {
  for (const a of Object.values(w.armies)) {
    const v = a.voyage;
    if (!v || a.status === 'embarked') continue;
    if (a.location === v.embark && !a.path.length && a.status !== 'retreating') { board(w, a); continue; }
    if (a.location === v.landAt) {
      a.voyage = undefined;
      if (v.final !== v.landAt && !orderMove(w, a, v.final) && a.owner === w.playerId) notify(w, `${a.name} landed at ${provinceName(v.landAt)} but finds no road on to ${provinceName(v.final)}.`, 'warning');
      continue;
    }
    // Knocked off course (a battle at the port, or put ashore elsewhere): the voyage is over.
    if (!a.path.length && a.status !== 'moving') a.voyage = undefined;
  }
}

/** What an army is doing at sea, for display. */
export function voyageText(w: WorldState, a: Army): string | null {
  const v = a.voyage;
  if (a.status === 'embarked') {
    const f = a.fleet ? w.fleets[a.fleet] : undefined;
    return `At sea aboard ${f?.chartered ? 'hired transports' : f?.name ?? 'our ships'}, bound for ${provinceName(f?.landingTarget ?? v?.landAt ?? a.location)}${v && v.final !== v.landAt ? `, then ${provinceName(v.final)}` : ''}`;
  }
  if (v) return `Marching to ${provinceName(v.embark)} to take ship for ${provinceName(v.final)}`;
  return null;
}

