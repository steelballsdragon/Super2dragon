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

export function consortOf(w: WorldState, c: string): Character | undefined {
  const id = w.countries[c]?.consortId;
  const ch = id ? w.characters[id] : undefined;
  return ch?.alive ? ch : undefined;
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

/** Marries the sovereign, when unmarried and of age, to a consort from another house (or from the realm's own nobility). */
export function wedRuler(w: WorldState, c: string, from?: string): Character | null {
  const country = w.countries[c];
  const r = rulerOf(w, c);
  if (!r?.alive || consortOf(w, c) || ageOf(w, r) < 16 || !hasRulingHouse(w, c)) return null;
  const consort = makeConsort(w, c, from);
  country.consortId = consort.id;
  if (c === w.playerId || from === w.playerId) {
    chronicle(w, { text: `${r.name} of ${countryName(w, c)} weds ${consort.name} ${consortOrigin(w, consort)}.`, category: 'court', countries: from ? [c, from] : [c], importance: 1 });
  }
  return consort;
}

/** After two houses agree a marriage: an unmarried sovereign takes a consort from the other house. */
export function celebrateMarriage(w: WorldState, a: string, b: string): string {
  const consort = wedRuler(w, a, b) ?? wedRuler(w, b, a);
  if (!consort) return '';
  const groom = w.characters[w.countries[consort.country].rulerId];
  return ` ${groom.name} weds ${consort.name} ${consortOrigin(w, consort)}.`;
}

/** The parent who would bear the child, when the couple can still have children. */
function mother(w: WorldState, c: string): Character | undefined {
  const r = rulerOf(w, c);
  const co = consortOf(w, c);
  if (!r?.alive || !co) return undefined;
  const m = r.female ? r : co.female ? co : undefined;
  const sinceBirth = w.turn - ((w.flags[`birth_${c}`] as number) ?? -99);
  return m && ageOf(w, m) >= 16 && ageOf(w, m) <= 44 && sinceBirth >= 12 ? m : undefined;
}

export function canHaveChildren(w: WorldState, c: string): boolean {
  return !!mother(w, c);
}

export function bearChild(w: WorldState, c: string, sex?: 'son' | 'daughter'): Character {
  const r = rulerOf(w, c)!;
  const other = consortOf(w, c) ?? r;
  const female = sex ? sex === 'daughter' : rand(w) < 0.49;
  // Avoid giving a child the name of a living parent or sibling.
  const taken = new Set([r.name, other.name, ...household(w, c).map((ch) => ch.name)]);
  const name = givenName(w, def(c).cultureGroup, female, taken) ?? `${female ? 'Daughter' : 'Son'} of ${r.name}`;
  const stat = (a: number, b: number) => clamp(Math.round((a + b) / 4 + randInt(w, 0, 5)), 0, 10);
  const adm = stat(r.adm, other.adm), dip = stat(r.dip, other.dip), mil = stat(r.mil, other.mil);
  const child = makeCharacter(w, { country: c, role: 'family', name, born: year(w), female, adm, dip, mil, dynasty: r.dynasty, traits: rulerTraits(adm, dip, mil), health: randInt(w, 60, 95), loyalty: 90 });
  child.parentId = r.id;
  addToFamily(w, c, child);
  w.flags[`birth_${c}`] = w.turn;
  // By male-preference custom a son displaces a daughter named heir only by default, never one the sovereign chose.
  const current = w.countries[c].heirId ? w.characters[w.countries[c].heirId!] : undefined;
  if (!female && current?.alive && current.female && current.parentId === r.id && !w.flags[`heirChosen_${c}`]) setHeir(w, c, child.id);
  const heir = ensureHeir(w, c) ?? (w.countries[c].heirId === child.id ? child : undefined);
  if (c === w.playerId) {
    const parents = consortOf(w, c) ? `${r.name} and ${consortOf(w, c)!.name}` : r.name;
    notify(w, `A ${female ? 'daughter' : 'son'}, ${name}, is born to ${parents}.${heir === child ? ` ${female ? 'She' : 'He'} is heir to the throne.` : ''}`, 'success');
    chronicle(w, { text: `A ${female ? 'daughter' : 'son'}, ${name}, is born to ${parents}.`, category: 'court', countries: [c], importance: 1 });
  }
  return child;
}

/** On a new reign: the old consort becomes a dowager and the new sovereign leaves the list of heirs. */
export function onSuccession(w: WorldState, c: string, newRuler: Character): void {
  const country = w.countries[c];
  country.consortId = undefined;
  country.family = country.family.filter((id) => id !== newRuler.id);
  if (country.heirId === newRuler.id) country.heirId = undefined;
  delete w.flags[`heirChosen_${c}`];
}

/** A new line takes the throne (a coup, a revolution, a restoration): the old household is set aside. */
export function resetHousehold(w: WorldState, c: string): void {
  const country = w.countries[c];
  country.consortId = undefined;
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
  const co = consortOf(w, c);
  if (co && rand(w) < deathChance(ageOf(w, co), co.health)) {
    co.alive = false;
    country.consortId = undefined;
    if (player) notify(w, `${co.name}, consort of ${r.name}, has died.`, 'warning');
  } else if (!co && !player && ageOf(w, r) >= 18 && ageOf(w, r) <= 60 && chance(w, 0.02)) {
    const partners = treatiesOf(w, c, 'marriage').map((t) => (t.a === c ? t.b : t.a)).filter((o) => w.countries[o]?.alive && hasRulingHouse(w, o));
    wedRuler(w, c, partners.length && chance(w, 0.5) ? partners[randInt(w, 0, partners.length - 1)] : undefined);
  }
  const m = mother(w, c);
  if (m) {
    const kids = household(w, c).filter((ch) => ch.parentId === r.id).length;
    if (chance(w, (ageOf(w, m) <= 35 ? 0.03 : 0.012) * (kids >= 8 ? 0.3 : 1))) {
      bearChild(w, c);
      if (m.role === 'consort' && chance(w, 0.01)) {
        m.alive = false;
        country.consortId = undefined;
        if (player) notify(w, `${m.name} has died in childbirth.`, 'warning');
      }
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
      const ch = makeCharacter(w, { country: c, role: 'consort', name: known.name, born: known.born, female: !r.female, dynasty: known.house, traits: [], health: randInt(w, 60, 90), loyalty: 90 });
      ch.origin = known.origin;
      country.consortId = ch.id;
    } else if (!NO_CONSORT_1800.has(c) && ageOf(w, r) >= 18 && ageOf(w, r) <= 75 && chance(w, 0.75)) {
      const consort = makeConsort(w, c);
      country.consortId = consort.id;
    }
  }
  w.flags.familySeeded = 1;
}
