// Shared helpers for querying and mutating the world state.
import { lawOption } from '../data/laws';
import { TECH_BY_ID } from '../data/technologies';
import { MONTHS, REBELS, RELIGION_GROUP, SUBJECT_TYPES } from './constants';
import type { Bonuses } from './defs';
import { POLITIES, PROVINCE_DEFS, neighbors as neighborsOf } from './static';
import type {
  Army, ChronicleEntry, CountryState, Fleet, GameNotification, LawCategory, PolityDef, Treaty, TreatyType, UnitCounts, War, WorldState,
} from './types';

export function def(id: string): PolityDef {
  return POLITIES[id];
}

export function newId(w: WorldState, prefix: string): string {
  w.nextId += 1;
  return `${prefix}${w.nextId.toString(36)}`;
}

export function year(w: WorldState): number {
  return 1800 + Math.floor(w.turn / 12);
}

export function month(w: WorldState): number {
  return w.turn % 12;
}

export function formatDate(turn: number): string {
  return `${MONTHS[turn % 12]} ${1800 + Math.floor(turn / 12)}`;
}

export function touch(w: WorldState): void {
  w.flags.ver = ((w.flags.ver as number) ?? 0) + 1;
}

interface Cache {
  key: string;
  byOwner: Map<string, string[]>;
  bonuses: Map<string, Bonuses>;
  armiesAt: Map<string, Army[]>;
  neighbours: Map<string, string[]>;
}
const caches = new WeakMap<WorldState, Cache>();

function cache(w: WorldState): Cache {
  const key = `${w.turn}:${w.flags.ver ?? 0}`;
  let c = caches.get(w);
  if (!c || c.key !== key) {
    const byOwner = new Map<string, string[]>();
    for (const p of Object.values(w.provinces)) {
      if (!p.owner) continue;
      const list = byOwner.get(p.owner);
      if (list) list.push(p.id); else byOwner.set(p.owner, [p.id]);
    }
    c = { key, byOwner, bonuses: new Map(), armiesAt: new Map(), neighbours: new Map() };
    caches.set(w, c);
  }
  return c;
}

export function provincesOf(w: WorldState, countryId: string): string[] {
  return cache(w).byOwner.get(countryId) ?? [];
}

/** Polities sharing a land border with c (cached per turn). */
export function neighbourCountries(w: WorldState, c: string): string[] {
  const cc = cache(w);
  const hit = cc.neighbours.get(c);
  if (hit) return hit;
  const out = new Set<string>();
  for (const id of provincesOf(w, c)) for (const n of neighborsOf(id)) {
    const o = w.provinces[n]?.owner;
    if (o && o !== c && w.countries[o]?.alive) out.add(o);
  }
  const list = [...out];
  cc.neighbours.set(c, list);
  return list;
}

export function armiesAt(w: WorldState, provinceId: string): Army[] {
  // Not cached: armies move within a turn.
  const out: Army[] = [];
  for (const a of Object.values(w.armies)) if (a.location === provinceId && a.status !== 'embarked') out.push(a);
  return out;
}

interface ForceIndex { key: string; armies: Map<string, Army[]>; fleets: Map<string, Fleet[]> }
const forceIndexes = new WeakMap<WorldState, ForceIndex>();

const forceVersions = new WeakMap<WorldState, number>();

/** Must be called whenever an army or fleet is created, destroyed or changes owner. */
export function forcesChanged(w: WorldState): void {
  forceVersions.set(w, (forceVersions.get(w) ?? 0) + 1);
}

/** Armies and fleets grouped by owner; rebuilt whenever forces are created, destroyed or transferred. */
function forceIndex(w: WorldState): ForceIndex {
  const key = `${w.turn}:${w.flags.ver ?? 0}:${forceVersions.get(w) ?? 0}`;
  let idx = forceIndexes.get(w);
  if (idx && idx.key === key) return idx;
  const armies = new Map<string, Army[]>();
  const fleets = new Map<string, Fleet[]>();
  for (const a of Object.values(w.armies)) {
    const l = armies.get(a.owner);
    if (l) l.push(a); else armies.set(a.owner, [a]);
  }
  for (const f of Object.values(w.fleets)) {
    const l = fleets.get(f.owner);
    if (l) l.push(f); else fleets.set(f.owner, [f]);
  }
  idx = { key, armies, fleets };
  forceIndexes.set(w, idx);
  return idx;
}

const NONE: never[] = [];

/** Armies owned by a country. The returned array is shared: do not mutate it. */
export function armiesOf(w: WorldState, countryId: string): readonly Army[] {
  return forceIndex(w).armies.get(countryId) ?? NONE;
}

/** Fleets owned by a country. The returned array is shared: do not mutate it. */
export function fleetsOf(w: WorldState, countryId: string): readonly Fleet[] {
  return forceIndex(w).fleets.get(countryId) ?? NONE;
}

export function alive(w: WorldState, id: string): boolean {
  return !!w.countries[id]?.alive;
}

export function aliveCountries(w: WorldState): CountryState[] {
  return Object.values(w.countries).filter((c) => c.alive);
}

export function relKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function opinion(w: WorldState, a: string, b: string): number {
  if (a === b) return 100;
  return w.relations[relKey(a, b)] ?? baseOpinion(a, b);
}

export function baseOpinion(a: string, b: string): number {
  const da = POLITIES[a], db = POLITIES[b];
  if (!da || !db) return 0;
  let v = 0;
  if (da.religion === db.religion) v += 10;
  else if (RELIGION_GROUP[da.religion] === RELIGION_GROUP[db.religion]) v += 5;
  else v -= 5;
  if (da.cultureGroup === db.cultureGroup) v += 8;
  if (da.rivals.includes(b) || db.rivals.includes(a)) v -= 40;
  if (da.allies.includes(b) || db.allies.includes(a)) v += 30;
  return v;
}

export function addOpinion(w: WorldState, a: string, b: string, delta: number): void {
  if (a === b) return;
  const k = relKey(a, b);
  const cur = w.relations[k] ?? baseOpinion(a, b);
  w.relations[k] = Math.max(-200, Math.min(200, Math.round((cur + delta) * 10) / 10));
}

export function hasTreaty(w: WorldState, type: TreatyType, a: string, b: string): boolean {
  return w.treaties.some((t) => t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
}

export function treatiesOf(w: WorldState, c: string, type?: TreatyType): Treaty[] {
  return w.treaties.filter((t) => (t.a === c || t.b === c) && (!type || t.type === type));
}

export function partner(t: Treaty, c: string): string {
  return t.a === c ? t.b : t.a;
}

export function alliesOf(w: WorldState, c: string): string[] {
  return treatiesOf(w, c, 'alliance').map((t) => partner(t, c)).filter((x) => alive(w, x));
}

export function subjectsOf(w: WorldState, c: string): string[] {
  return Object.values(w.countries).filter((s) => s.alive && s.overlord === c).map((s) => s.id);
}

export function topOverlord(w: WorldState, c: string): string {
  let cur = c;
  for (let i = 0; i < 5; i++) {
    const o = w.countries[cur]?.overlord;
    if (!o || !alive(w, o)) return cur;
    cur = o;
  }
  return cur;
}

export function warsOf(w: WorldState, c: string): War[] {
  return Object.values(w.wars).filter((war) => war.attackers.includes(c) || war.defenders.includes(c));
}

export function sideOf(war: War, c: string): 'attackers' | 'defenders' | null {
  if (war.attackers.includes(c)) return 'attackers';
  if (war.defenders.includes(c)) return 'defenders';
  return null;
}

export function atWar(w: WorldState, a: string, b: string): boolean {
  if (a === REBELS || b === REBELS) return true;
  for (const war of Object.values(w.wars)) {
    if ((war.attackers.includes(a) && war.defenders.includes(b)) || (war.defenders.includes(a) && war.attackers.includes(b))) return true;
  }
  return false;
}

export function warBetween(w: WorldState, a: string, b: string): War | undefined {
  return Object.values(w.wars).find((war) => (war.attackers.includes(a) && war.defenders.includes(b)) || (war.defenders.includes(a) && war.attackers.includes(b)));
}

export function isAtWar(w: WorldState, c: string): boolean {
  return warsOf(w, c).length > 0;
}

/** Whether an army of `owner` treats province controller/owner `other` as hostile. */
export function hostile(w: WorldState, armyA: Army, armyB: Army): boolean {
  if (armyA.owner === armyB.owner) return false;
  if (armyA.rebel) return armyB.owner === armyA.rebel.against || topOverlord(w, armyB.owner) === armyA.rebel.against;
  if (armyB.rebel) return armyA.owner === armyB.rebel.against || topOverlord(w, armyA.owner) === armyB.rebel.against;
  return atWar(w, armyA.owner, armyB.owner);
}

/** Countries on the same side (self, allies at war, overlord/subjects). */
export function friendly(w: WorldState, a: string, b: string): boolean {
  if (a === b) return true;
  if (topOverlord(w, a) === topOverlord(w, b)) return true;
  if (hasTreaty(w, 'alliance', a, b)) return true;
  for (const war of Object.values(w.wars)) {
    const sa = sideOf(war, a), sb = sideOf(war, b);
    if (sa && sa === sb) return true;
  }
  return false;
}

export function notify(w: WorldState, text: string, kind: GameNotification['kind'] = 'info'): void {
  w.notifications.unshift({ id: newId(w, 'n'), turn: w.turn, text, kind, read: false });
  if (w.notifications.length > 60) w.notifications.length = 60;
}

export function chronicle(w: WorldState, entry: Omit<ChronicleEntry, 'turn'>): void {
  w.chronicle.unshift({ ...entry, turn: w.turn });
  if (w.chronicle.length > 600) w.chronicle.length = 600;
}

export function involvesPlayer(w: WorldState, ...ids: string[]): boolean {
  return ids.includes(w.playerId);
}

/** Aggregated bonuses from technologies, laws, buildings (country-wide parts) and modifiers. */
export function bonuses(w: WorldState, c: string): Bonuses {
  const cc = cache(w);
  const hit = cc.bonuses.get(c);
  if (hit) return hit;
  const country = w.countries[c];
  const out: Bonuses = {};
  const add = (b: Bonuses | undefined, mult = 1) => {
    if (!b) return;
    for (const [k, v] of Object.entries(b)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const key = k as keyof Bonuses;
      out[key] = (out[key] ?? 0) + v * mult;
    }
  };
  if (country) {
    for (const t of country.techs) add(TECH_BY_ID[t]?.bonuses);
    for (const [cat, opt] of Object.entries(country.laws)) add(lawOption(cat as LawCategory, opt)?.bonuses);
    for (const m of country.modifiers) {
      add({ trade: m.trade, research: m.research, morale: m.morale, food: m.food, growth: m.growth });
    }
  }
  cc.bonuses.set(c, out);
  return out;
}

export function countryPopulation(w: WorldState, c: string): number {
  let s = 0;
  for (const id of provincesOf(w, c)) s += w.provinces[id].pop;
  return s;
}

/** An army's established strength, the most it has held of each arm (created on first use, raised as it grows).
 * Losses are refilled toward it on friendly ground. */
export function establishment(a: Army): UnitCounts {
  if (!a.full) a.full = { ...a.units };
  for (const u of ['infantry', 'cavalry', 'artillery', 'irregulars'] as const) if (a.units[u] > a.full[u]) a.full[u] = a.units[u];
  return a.full;
}

export function armyRegiments(a: Army): number {
  return a.units.infantry + a.units.cavalry + a.units.artillery + a.units.irregulars;
}

export function totalRegiments(w: WorldState, c: string): number {
  let s = 0;
  for (const a of armiesOf(w, c)) s += armyRegiments(a);
  return s;
}

export function fleetPower(w: WorldState, c: string): number {
  let s = 0;
  for (const f of fleetsOf(w, c)) s += f.ships.line * 10 + f.ships.frigate * 3.5 + f.ships.transport * 0.3;
  return s;
}

export function provinceName(id: string): string {
  return PROVINCE_DEFS[id]?.name ?? id;
}

export function countryName(w: WorldState, id: string): string {
  if (id === REBELS) return 'Rebels';
  return POLITIES[id]?.short ?? id;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function subjectTribute(w: WorldState, c: string): number {
  const s = w.countries[c];
  if (!s?.overlord || !s.subjectType) return 0;
  return SUBJECT_TYPES[s.subjectType].tribute;
}

export function isMonarchy(w: WorldState, c: string): boolean {
  const g = w.countries[c]?.laws.government;
  return g === 'absolute_monarchy' || g === 'constitutional_monarchy' || g === 'council_rule' && ['monarchy', 'feudal'].includes(POLITIES[c].polityType);
}

/** Led by a hereditary house that makes dynastic marriages: a monarchy, or a council or confederacy headed by a ruling family. */
export function hasRulingHouse(w: WorldState, c: string): boolean {
  if (isMonarchy(w, c)) return true;
  const country = w.countries[c];
  const g = country?.laws.government;
  return (g === 'consensus' || g === 'council_rule') && !!w.characters[country.rulerId]?.dynasty;
}

export function isRepublic(w: WorldState, c: string): boolean {
  return w.countries[c]?.laws.government === 'republic';
}
