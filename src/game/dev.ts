// Developer tools: direct edits to the world for testing, debugging and rebuilding a lost
// campaign. They bypass the rules on purpose, so a campaign they touch says so in its chronicle.
import { TECHNOLOGIES } from '../data/technologies';
import { EVENT_BY_ID } from './events/defs';
import { resolveEvent } from './events/engine';
import { bearChild, celebrateMarriage, consortOf, rulerOf, wedRuler } from './family';
import { removeArmy } from './military';
import { pick, weightedPick } from './rng';
import { succeed } from './society';
import {
  alive, chronicle, clamp, countryName, forcesChanged, hasTreaty, newId, provinceName, provincesOf, relKey, touch, warsOf,
} from './state';
import { availableTechs, grantTech } from './tech';
import { emptyTerms, makePeace } from './war';
import { addTreaty } from './diplomacy';
import type { TreatyType, UnitType, WorldState } from './types';

export type DevStat = 'treasury' | 'manpower' | 'stability' | 'legitimacy' | 'prestige' | 'corruption' | 'warExhaustion' | 'infamy';

export const DEV_STATS: { id: DevStat; label: string; min: number; max: number }[] = [
  { id: 'treasury', label: 'Treasury (£k)', min: -10_000_000, max: 10_000_000 },
  { id: 'manpower', label: 'Manpower (thousands)', min: 0, max: 100_000 },
  { id: 'stability', label: 'Stability', min: 0, max: 100 },
  { id: 'legitimacy', label: 'Legitimacy', min: 0, max: 100 },
  { id: 'prestige', label: 'Prestige', min: 0, max: 100 },
  { id: 'corruption', label: 'Corruption', min: 0, max: 100 },
  { id: 'warExhaustion', label: 'War exhaustion', min: 0, max: 100 },
  { id: 'infamy', label: 'Aggressive reputation', min: 0, max: 200 },
];

export const DEV_TREATIES: TreatyType[] = ['alliance', 'marriage', 'trade', 'nap', 'access', 'guarantee'];

/** Records a developer edit: the decision log always, the chronicle once per campaign. */
function mark(w: WorldState, what: string): string {
  if (!w.flags.devUsed) {
    w.flags.devUsed = 1;
    chronicle(w, { text: 'Developer tools were used in this campaign.', category: 'player', countries: [w.playerId], importance: 1 });
  }
  w.decisions.push({ turn: w.turn, summary: `Developer: ${what}` });
  touch(w);
  return what;
}

export function devSetStat(w: WorldState, c: string, stat: DevStat, value: number): string {
  const s = DEV_STATS.find((x) => x.id === stat)!;
  if (!Number.isFinite(value)) throw new Error('Enter a number.');
  const v = clamp(value, s.min, s.max);
  w.countries[c][stat] = v;
  return mark(w, `${s.label} of ${countryName(w, c)} set to ${v}`);
}

export function devAddConsort(w: WorldState, c: string, from?: string): string {
  const old = consortOf(w, c);
  if (old) { old.alive = false; w.countries[c].consortId = undefined; }
  const consort = wedRuler(w, c, from);
  if (!consort) throw new Error('This sovereign cannot marry (no ruling house, or not of age).');
  return mark(w, `${rulerOf(w, c)!.name} weds ${consort.name}${from ? ` of ${countryName(w, from)}` : ''}`);
}

export function devAddChild(w: WorldState, c: string, sex?: 'son' | 'daughter'): string {
  if (!rulerOf(w, c)?.alive) throw new Error('There is no sovereign.');
  const child = bearChild(w, c, sex);
  return mark(w, `A ${child.female ? 'daughter' : 'son'}, ${child.name}, is born in ${countryName(w, c)}`);
}

export function devEndReign(w: WorldState, c: string): string {
  const r = rulerOf(w, c);
  succeed(w, c, 'has died');
  return mark(w, `The reign of ${r?.name ?? 'the sovereign'} is ended; ${rulerOf(w, c)?.name} succeeds`);
}

export function devSetRelation(w: WorldState, a: string, b: string, value: number): string {
  if (a === b) throw new Error('Choose another realm.');
  w.relations[relKey(a, b)] = clamp(Math.round(value), -200, 200);
  return mark(w, `Relations between ${countryName(w, a)} and ${countryName(w, b)} set to ${Math.round(value)}`);
}

export function devAddTreaty(w: WorldState, a: string, b: string, type: TreatyType): string {
  if (a === b) throw new Error('Choose another realm.');
  if (hasTreaty(w, type, a, b)) throw new Error('That treaty already exists.');
  addTreaty(w, type, a, b, undefined, type === 'nap' ? 120 : undefined);
  const wed = type === 'marriage' ? celebrateMarriage(w, a, b) : '';
  return mark(w, `${type} with ${countryName(w, b)}${wed}`);
}

/** White peace in every war the realm fights. */
export function devPeaceAll(w: WorldState, c: string): string {
  const wars = warsOf(w, c);
  for (const war of wars) {
    const leads = war.attackerLeader === c || war.defenderLeader === c;
    makePeace(w, war, 'white', emptyTerms(), leads ? undefined : c);
  }
  return mark(w, wars.length ? `White peace in ${wars.length} war${wars.length > 1 ? 's' : ''}` : 'No wars to end');
}

/** Hands a province to a realm outright. */
export function devGiveProvince(w: WorldState, pid: string, to: string): string {
  const p = w.provinces[pid];
  if (!p) throw new Error('Choose a province on the map.');
  if (p.owner === to) throw new Error(`${provinceName(pid)} already belongs to ${countryName(w, to)}.`);
  transfer(w, pid, to);
  return mark(w, `${provinceName(pid)} passes to ${countryName(w, to)}`);
}

function transfer(w: WorldState, pid: string, to: string): void {
  const p = w.provinces[pid];
  const prev = p.owner;
  p.owner = to;
  p.controller = to;
  p.siege = undefined;
  if (!p.cores.includes(to)) p.cores.push(to);
  w.construction = w.construction.filter((k) => k.province !== pid);
  if (prev && w.countries[prev]?.capital === pid) {
    const rest = provincesOf(w, prev).filter((x) => x !== pid);
    if (rest.length) w.countries[prev].capital = rest[0];
  }
  if (!w.countries[to].alive) { w.countries[to].alive = true; w.countries[to].capital = pid; }
  touch(w);
}

/** Absorbs a whole realm: its wars end, its forces disband, its land passes over. */
export function devAnnex(w: WorldState, target: string, to: string): string {
  if (target === to) throw new Error('Choose another realm.');
  if (!alive(w, target)) throw new Error(`${countryName(w, target)} no longer exists.`);
  for (const war of warsOf(w, target)) {
    const leads = war.attackerLeader === target || war.defenderLeader === target;
    makePeace(w, war, 'white', emptyTerms(), leads ? undefined : target);
  }
  for (const a of Object.values(w.armies)) if (a.owner === target) removeArmy(w, a.id);
  for (const f of Object.values(w.fleets)) if (f.owner === target) delete w.fleets[f.id];
  for (const o of Object.values(w.countries)) if (o.overlord === target) { o.overlord = undefined; o.subjectType = undefined; }
  const provs = provincesOf(w, target);
  for (const pid of provs) transfer(w, pid, to);
  w.countries[target].alive = false;
  w.treaties = w.treaties.filter((t) => t.a !== target && t.b !== target);
  forcesChanged(w);
  return mark(w, `${countryName(w, target)} (${provs.length} provinces) is annexed by ${countryName(w, to)}`);
}

/** Raises regiments at once in the realm's capital. */
export function devRaiseArmy(w: WorldState, c: string, units: Partial<Record<UnitType, number>>): string {
  const country = w.countries[c];
  const loc = country.capital;
  const army = {
    id: newId(w, 'a'), owner: c, name: `${provinceName(loc)} Guard`, location: loc,
    units: { infantry: units.infantry ?? 0, cavalry: units.cavalry ?? 0, artillery: units.artillery ?? 0, irregulars: units.irregulars ?? 0 },
    morale: 0.9, experience: 0.1, path: [] as string[], progress: 0, status: 'idle' as const,
  };
  const total = army.units.infantry + army.units.cavalry + army.units.artillery + army.units.irregulars;
  if (total <= 0) throw new Error('Choose at least one regiment.');
  w.armies[army.id] = army;
  forcesChanged(w);
  return mark(w, `${total} regiments raised at ${provinceName(loc)}`);
}

export function devFinishResearch(w: WorldState, c: string): string {
  const r = w.countries[c].research;
  if (!r.tech) throw new Error('Nothing is being researched.');
  const t = r.tech;
  grantTech(w, c, t, true);
  w.countries[c].research = { tech: null, progress: 0 };
  return mark(w, `Research completed: ${TECHNOLOGIES.find((x) => x.id === t)?.name ?? t}`);
}

/** Every technology whose prerequisites are met now (repeat to climb further), or all of them. */
export function devGrantTechs(w: WorldState, c: string, all = false): string {
  const list = all ? TECHNOLOGIES.filter((t) => !w.countries[c].techs.includes(t.id)) : availableTechs(w, c);
  for (const t of list) grantTech(w, c, t.id, true);
  if (w.countries[c].research.tech && w.countries[c].techs.includes(w.countries[c].research.tech!)) w.countries[c].research = { tech: null, progress: 0 };
  return mark(w, `${list.length} technologies granted`);
}

/** Queues an event for the player as if it had fired. */
export function devTriggerEvent(w: WorldState, eventId: string): string {
  const ev = EVENT_BY_ID[eventId];
  if (!ev) throw new Error('Unknown event.');
  const ctx = ev.setup ? ev.setup(w, w.playerId) : {};
  if (!ctx) throw new Error(`“${ev.title}” cannot happen in the present circumstances.`);
  w.pendingEvents.push({ id: newId(w, 'e'), defId: ev.id, country: w.playerId, turn: w.turn, ctx });
  return mark(w, `Event triggered: ${ev.title}`);
}

/** Decides the player's waiting events the way an AI court would (after a long time skip). */
export function devResolvePendingEvents(w: WorldState): number {
  let n = 0;
  for (const inst of [...w.pendingEvents]) {
    const ev = EVENT_BY_ID[inst.defId];
    const opts = ev?.options.filter((o) => !o.requires || o.requires(w, inst.country, inst.ctx)) ?? [];
    const choice = weightedPick(w, opts, (o) => o.ai(w, inst.country, inst.ctx)) ?? (opts.length ? pick(w, opts) : undefined);
    if (choice && !resolveEvent(w, inst.id, choice.id)) n++;
    else w.pendingEvents = w.pendingEvents.filter((e) => e !== inst);
  }
  return n;
}

export function devNote(w: WorldState, what: string): string {
  return mark(w, what);
}
