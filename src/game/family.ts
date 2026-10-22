// The royal household: consorts, children and the line of succession.
import { CONSORTS_1800, HEIR_NOT_CHILD, NO_CONSORT_1800 } from '../data/royals';
import { START_TREATIES } from '../data/scenario';
import { deathChance, givenName, makeCharacter, rulerTraits } from './characters';
import { chance, rand, randInt } from './rng';
import { chronicle, clamp, countryName, def, hasRulingHouse, notify, treatiesOf, year } from './state';
import type { Character, WorldState } from './types';

const ageOf = (w: WorldState, ch: Character) => year(w) - ch.born;

export function rulerOf(w: WorldState, c: string): Character | undefined {
  return w.characters[w.countries[c]?.rulerId];
}

/** The sovereign's living consorts, in order of marriage. */
export function consortsOf(w: WorldState, c: string): Character[] {
  return (w.countries[c]?.consorts ?? []).map((id) => w.characters[id]).filter((ch): ch is Character => !!ch?.alive);
}

/** The chief (first living) consort. */
export function consortOf(w: WorldState, c: string): Character | undefined {
  return consortsOf(w, c)[0];
}

const CHRISTIAN = new Set(['catholic', 'protestant', 'orthodox', 'oriental']);
const MUSLIM = new Set(['sunni', 'shia', 'ibadi', 'zaydi']);

/** How many consorts the court's custom allows at once. */
export function maxConsorts(w: WorldState, c: string): number {
  const rel = def(c).religion;
  if (CHRISTIAN.has(rel) || rel === 'jewish') return 1;
  if (MUSLIM.has(rel)) return 4;
  return 6;
}

export function consortCustom(w: WorldState, c: string): string {
  const n = maxConsorts(w, c);
  const rel = def(c).religion;
  if (n === 1) return `By the custom of ${rel === 'jewish' ? 'a Jewish' : 'a Christian'} court the sovereign has one consort at a time, and may remarry when widowed.`;
  if (n === 4) return 'By Islamic law the sovereign may have up to four wives.';
  return `By the custom of this court the sovereign may take up to ${n} consorts.`;
}

/** Why the sovereign cannot take another consort now, or null. */
export function consortBlocker(w: WorldState, c: string): string | null {
  const r = rulerOf(w, c);
  if (!hasRulingHouse(w, c)) return 'Only a ruling house takes royal consorts.';
  if (!r?.alive || ageOf(w, r) < 16) return 'The sovereign is not yet of age to marry.';
  const n = maxConsorts(w, c);
  if (consortsOf(w, c).length >= n) return n === 1 ? `${r.name} is already married.` : `${r.name} already has ${n} consorts, as many as custom allows.`;
  return null;
}

/** A consort's homeland, for display: the realm and its region, or their house. */
export function consortHome(w: WorldState, ch: Character): { from: string; region: string } {
  if (ch.origin && w.countries[ch.origin]) return { from: countryName(w, ch.origin), region: def(ch.origin).region };
  return { from: ch.dynasty ? `House of ${ch.dynasty}` : 'our own nobility', region: def(ch.country).region };
}

/** Living members of the ruling house other than the sovereign, eldest first. */
export function household(w: WorldState, c: string): Character[] {
  return (w.countries[c]?.family ?? []).map((id) => w.characters[id]).filter((ch): ch is Character => !!ch?.alive).sort((a, b) => a.born - b.born);
}

export function relationTo(w: WorldState, c: string, ch: Character): string {
  const r = rulerOf(w, c);
  if (r && ch.parentId === r.id) return ch.female ? 'Daughter' : 'Son';
  if (r && ch.parentId && ch.parentId === r.parentId) return ch.female ? 'Sister' : 'Brother';
  return ch.female ? 'Kinswoman' : 'Kinsman';
}

/** Where a consort comes from, for display. */
export function consortOrigin(w: WorldState, ch: Character): string {
  if (ch.origin && w.countries[ch.origin]) return `of ${countryName(w, ch.origin)}`;
  return ch.dynasty ? `House of ${ch.dynasty}` : 'of the nobility';
}

/** A royal child's other parent (one of the sovereign's consorts), if known. */
export function otherParent(w: WorldState, ch: Character): Character | undefined {
  return ch.consortParent ? w.characters[ch.consortParent] : undefined;
}

/** Male-preference order: the sovereign's children before other kin, sons before daughters, elder before younger. */
export function nextInLine(w: WorldState, c: string): Character | undefined {
  const r = rulerOf(w, c);
  const heirId = w.countries[c].heirId;
  const rank = (ch: Character) => (r && ch.parentId === r.id ? 0 : 2) + (ch.female ? 1 : 0);
  return household(w, c).filter((ch) => ch.id !== heirId).sort((a, b) => rank(a) - rank(b) || a.born - b.born)[0];
}

function heirAlive(w: WorldState, c: string): boolean {
  const id = w.countries[c].heirId;
  return !!id && !!w.characters[id]?.alive;
}

export function addToFamily(w: WorldState, c: string, ch: Character): void {
  const country = w.countries[c];
  if (!country.family.includes(ch.id)) country.family.push(ch.id);
}

/** Names the next in line as heir when there is none. Returns the new heir, if any. */
export function ensureHeir(w: WorldState, c: string): Character | undefined {
  if (heirAlive(w, c)) return undefined;
  const next = nextInLine(w, c);
  if (!next) return undefined;
  next.role = 'heir';
  w.countries[c].heirId = next.id;
  return next;
}

export function setHeir(w: WorldState, c: string, id: string): void {
  const country = w.countries[c];
  const old = country.heirId ? w.characters[country.heirId] : undefined;
  if (old?.alive) { old.role = 'family'; addToFamily(w, c, old); }
  const ch = w.characters[id];
  ch.role = 'heir';
  country.heirId = id;
}

/** Why the sovereign cannot take this member of the house as heir, or null. */
export function heirBlocker(w: WorldState, c: string, id: string | undefined): string | null {
  const ch = id ? w.characters[id] : undefined;
  if (!ch || !ch.alive || !w.countries[c].family.includes(ch.id)) return 'Only a living member of the ruling house can be named heir.';
  if (w.countries[c].heirId === ch.id) return `${ch.name} is already the heir.`;
  return null;
}

function makeConsort(w: WorldState, c: string, from?: string): Character {
  const r = rulerOf(w, c)!;
  const female = !r.female;
  const home = from ?? c;
  const homeRuler = from ? rulerOf(w, from) : undefined;
  const taken = new Set([r.name, ...household(w, c).map((ch) => ch.name)]);
  const name = givenName(w, def(home).cultureGroup, female, taken) ?? `${female ? 'Princess' : 'Prince'} of ${countryName(w, home)}`;
  const born = Math.min(year(w) - 16, r.born + (female ? randInt(w, -2, 12) : randInt(w, -10, 2)));
  const adm = randInt(w, 1, 7), dip = randInt(w, 1, 7), mil = randInt(w, 1, 6);
  const ch = makeCharacter(w, { country: c, role: 'consort', name, born, female, adm, dip, mil, dynasty: from ? homeRuler?.dynasty ?? def(from).short : undefined, traits: rulerTraits(adm, dip, mil), health: randInt(w, 60, 95), loyalty: 85 });
  ch.origin = from;
  return ch;
}

/** Marries the sovereign, when custom allows another consort, to one from another house (or from the realm's own nobility). */
export function wedRuler(w: WorldState, c: string, from?: string): Character | null {
  const country = w.countries[c];
  const r = rulerOf(w, c);
  if (!r || consortBlocker(w, c)) return null;
  const consort = makeConsort(w, c, from);
  country.consorts = [...consortsOf(w, c).map((x) => x.id), consort.id];
  if (c === w.playerId || from === w.playerId) {
    chronicle(w, { text: `${r.name} of ${countryName(w, c)} weds ${consort.name} ${consortOrigin(w, consort)}.`, category: 'court', countries: from ? [c, from] : [c], importance: 1 });
  }
  return consort;
}

/** After two houses agree a marriage: a sovereign with room for another consort takes one from the other house. */
export function celebrateMarriage(w: WorldState, a: string, b: string): string {
  const consort = wedRuler(w, a, b) ?? wedRuler(w, b, a);
  if (!consort) return '';
  const groom = w.characters[w.countries[consort.country].rulerId];
  return ` ${groom.name} weds ${consort.name} ${consortOrigin(w, consort)}.`;
}

const fertile = (w: WorldState, m: Character) => ageOf(w, m) >= 16 && ageOf(w, m) <= 44 && w.turn - (m.lastBirth ?? -99) >= 12;

/** Each couple that can have a child now: the sovereign with one consort, and who would bear it. */
function couples(w: WorldState, c: string): { consort: Character; mother: Character }[] {
  const r = rulerOf(w, c);
  if (!r?.alive) return [];
  const out: { consort: Character; mother: Character }[] = [];
  for (const co of consortsOf(w, c)) {
    const m = r.female ? r : co.female ? co : undefined;
    if (m && fertile(w, m)) out.push({ consort: co, mother: m });
    if (r.female && out.length) break; // a queen regnant bears one child at a time
  }
  return out;
}

export function canHaveChildren(w: WorldState, c: string): boolean {
  return couples(w, c).length > 0;
}

export function bearChild(w: WorldState, c: string, sex?: 'son' | 'daughter', consortId?: string): Character {
  const r = rulerOf(w, c)!;
  const pairs = couples(w, c);
  const chosen = (consortId ? consortsOf(w, c).find((x) => x.id === consortId) : undefined)
    ?? (pairs.length ? pairs[randInt(w, 0, pairs.length - 1)].consort : consortOf(w, c));
  const other = chosen ?? r;
  const female = sex ? sex === 'daughter' : rand(w) < 0.49;
  // Avoid giving a child the name of a living parent or sibling.
  const taken = new Set([r.name, other.name, ...household(w, c).map((ch) => ch.name)]);
  const name = givenName(w, def(c).cultureGroup, female, taken) ?? `${female ? 'Daughter' : 'Son'} of ${r.name}`;
  const stat = (a: number, b: number) => clamp(Math.round((a + b) / 4 + randInt(w, 0, 5)), 0, 10);
  const adm = stat(r.adm, other.adm), dip = stat(r.dip, other.dip), mil = stat(r.mil, other.mil);
  const child = makeCharacter(w, { country: c, role: 'family', name, born: year(w), female, adm, dip, mil, dynasty: r.dynasty, traits: rulerTraits(adm, dip, mil), health: randInt(w, 60, 95), loyalty: 90 });
  child.parentId = r.id;
  child.consortParent = chosen?.id;
  addToFamily(w, c, child);
  const bearer = r.female ? r : chosen?.female ? chosen : undefined;
  if (bearer) bearer.lastBirth = w.turn;
  // By male-preference custom a son displaces a daughter named heir only by default, never one the sovereign chose.
  const current = w.countries[c].heirId ? w.characters[w.countries[c].heirId!] : undefined;
  if (!female && current?.alive && current.female && current.parentId === r.id && !w.flags[`heirChosen_${c}`]) setHeir(w, c, child.id);
  const heir = ensureHeir(w, c) ?? (w.countries[c].heirId === child.id ? child : undefined);
  if (c === w.playerId) {
    const parents = chosen ? `${r.name} and ${chosen.name}` : r.name;
    notify(w, `A ${female ? 'daughter' : 'son'}, ${name}, is born to ${parents}.${heir === child ? ` ${female ? 'She' : 'He'} is heir to the throne.` : ''}`, 'success');
    chronicle(w, { text: `A ${female ? 'daughter' : 'son'}, ${name}, is born to ${parents}.`, category: 'court', countries: [c], importance: 1 });
  }
  return child;
}

/** On a new reign: the old consorts become dowagers and the new sovereign leaves the list of heirs. */
export function onSuccession(w: WorldState, c: string, newRuler: Character): void {
  const country = w.countries[c];
  country.consorts = [];
  country.family = country.family.filter((id) => id !== newRuler.id);
  if (country.heirId === newRuler.id) country.heirId = undefined;
  delete w.flags[`heirChosen_${c}`];
}

/** A new line takes the throne (a coup, a revolution, a restoration): the old household is set aside. */
export function resetHousehold(w: WorldState, c: string): void {
  const country = w.countries[c];
  country.consorts = [];
  country.heirId = undefined;
  country.family = [];
}

/** Monthly: consorts and royal children live, die and are born; unmarried AI sovereigns find matches. */
export function processHousehold(w: WorldState, c: string): void {
  const country = w.countries[c];
  if (!hasRulingHouse(w, c)) return;
  const r = rulerOf(w, c);
  if (!r?.alive) return;
  const player = c === w.playerId;
  for (const co of consortsOf(w, c)) {
    if (rand(w) < deathChance(ageOf(w, co), co.health)) {
      co.alive = false;
      if (player) notify(w, `${co.name}, consort of ${r.name}, has died.`, 'warning');
    }
  }
  country.consorts = consortsOf(w, c).map((x) => x.id);
  if (!country.consorts.length && !player && ageOf(w, r) >= 18 && ageOf(w, r) <= 60 && chance(w, 0.02)) {
    const partners = treatiesOf(w, c, 'marriage').map((t) => (t.a === c ? t.b : t.a)).filter((o) => w.countries[o]?.alive && hasRulingHouse(w, o));
    wedRuler(w, c, partners.length && chance(w, 0.5) ? partners[randInt(w, 0, partners.length - 1)] : undefined);
  }
  // Each couple may have a child; a large household grows more slowly.
  const pairs = couples(w, c);
  const kids = household(w, c).filter((ch) => ch.parentId === r.id).length;
  for (const { consort, mother: m } of pairs) {
    if (kids >= 14) break;
    const p = (ageOf(w, m) <= 35 ? 0.03 : 0.012) * (kids >= 8 ? 0.3 : 1) / Math.sqrt(pairs.length);
    if (!chance(w, p)) continue;
    bearChild(w, c, undefined, consort.id);
    if (m.role === 'consort' && chance(w, 0.01)) {
      m.alive = false;
      country.consorts = consortsOf(w, c).map((x) => x.id);
      if (player) notify(w, `${m.name} has died in childbirth.`, 'warning');
    }
  }
  // Princes and princesses other than the heir (whose fate is handled with the sovereign's).
  for (const ch of household(w, c)) {
    if (ch.id === country.heirId) continue;
    const a = ageOf(w, ch);
    if (rand(w) < (a < 5 ? 0.003 : deathChance(a, ch.health) * 0.6)) {
      ch.alive = false;
      if (player) notify(w, `${ch.name}, ${relationTo(w, c, ch).toLowerCase()} of ${r.name}, has died${a < 5 ? ' in infancy' : ''}.`, 'info');
    }
  }
  country.family = country.family.filter((id) => w.characters[id]?.alive);
}

/** Heir mortality: infants are fragile, adults age like the sovereign. */
export function heirDeathChance(w: WorldState, heir: Character): number {
  const a = ageOf(w, heir);
  return a < 5 ? 0.003 : deathChance(a, heir.health) * 0.6;
}

const fromScenario = (a: string, b: string) => START_TREATIES.some((t) => t.type === 'marriage' && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));

/**
 * Builds the households once: for new campaigns, and for campaigns saved before households existed
 * (where a marriage already agreed during play brings the consort).
 */
export function seedFamilies(w: WorldState): void {
  if (w.flags.familySeeded) return;
  for (const country of Object.values(w.countries)) {
    country.family ??= [];
    country.consorts ??= [];
    const c = country.id;
    if (!country.alive || !hasRulingHouse(w, c)) continue;
    const r = rulerOf(w, c);
    if (!r?.alive) continue;
    const heir = country.heirId ? w.characters[country.heirId] : undefined;
    if (heir?.alive) {
      const gap = heir.born - r.born;
      if (!HEIR_NOT_CHILD.has(c) && gap >= 14 && gap <= 55 && (!heir.dynasty || !r.dynasty || heir.dynasty === r.dynasty)) heir.parentId = r.id;
      addToFamily(w, c, heir);
    }
    if (consortOf(w, c)) continue;
    const agreed = treatiesOf(w, c, 'marriage').filter((t) => !fromScenario(t.a, t.b)).map((t) => (t.a === c ? t.b : t.a)).find((o) => w.countries[o]?.alive && hasRulingHouse(w, o));
    const known = CONSORTS_1800[c];
    if (agreed) wedRuler(w, c, agreed);
    else if (known) {
      for (const k of Array.isArray(known) ? known : [known]) {
        const ch = makeCharacter(w, { country: c, role: 'consort', name: k.name, born: k.born, female: !r.female, dynasty: k.house, traits: [], health: randInt(w, 60, 90), loyalty: 90 });
        ch.origin = k.origin;
        country.consorts.push(ch.id);
      }
    } else if (!NO_CONSORT_1800.has(c) && ageOf(w, r) >= 18 && ageOf(w, r) <= 75 && chance(w, 0.75)) {
      country.consorts.push(makeConsort(w, c).id);
    }
  }
  w.flags.familySeeded = 1;
}
