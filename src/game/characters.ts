import { NAME_POOLS, OFFICE_TITLES } from '../data/names';
import { pick, rand, randInt } from './rng';
import { def, newId, year } from './state';
import type { Character, CultureGroup, MinisterRole, WorldState } from './types';

export const MINISTER_ROLES: MinisterRole[] = ['finance', 'foreign', 'military', 'admin', 'intelligence'];

export const MINISTER_TITLES: Record<MinisterRole, string> = {
  finance: 'Finance Minister',
  foreign: 'Foreign Minister',
  military: 'Commander-in-Chief',
  admin: 'Chief Administrator',
  intelligence: 'Royal Intelligence Advisor',
};

export const PERSONALITIES: Record<MinisterRole, { id: string; name: string; blurb: string }[]> = {
  finance: [
    { id: 'frugal', name: 'Frugal', blurb: 'A careful steward who abhors debt and waste.' },
    { id: 'expansive', name: 'Expansive', blurb: 'Believes the state must spend to grow rich.' },
  ],
  foreign: [
    { id: 'conciliatory', name: 'Conciliatory', blurb: 'Prefers treaties, marriages and patience.' },
    { id: 'assertive', name: 'Assertive', blurb: 'Believes respect is earned by firmness.' },
  ],
  military: [
    { id: 'hawkish', name: 'Hawkish', blurb: 'Sees every crisis as an opportunity for arms.' },
    { id: 'methodical', name: 'Methodical', blurb: 'Values fortresses, supply and drill above glory.' },
  ],
  admin: [
    { id: 'reformer', name: 'Reformer', blurb: 'Impatient to rationalise every office of state.' },
    { id: 'traditionalist', name: 'Traditionalist', blurb: 'Trusts custom, precedent and the old families.' },
  ],
  intelligence: [
    { id: 'cautious', name: 'Cautious', blurb: 'Watches everyone, trusts no one, risks little.' },
    { id: 'cunning', name: 'Cunning', blurb: 'Delights in bold intrigue abroad.' },
  ],
};

const TITLED_GROUPS: CultureGroup[] = ['indigenous_american', 'polynesian', 'melanesian', 'aboriginal'];

export function generateName(w: WorldState, group: CultureGroup, female: boolean): string | null {
  if (TITLED_GROUPS.includes(group)) return null;
  const pool = NAME_POOLS[group];
  if (!pool) return null;
  const given = pick(w, female ? pool.f : pool.m);
  if (pool.order === 'single' || !pool.s.length) {
    if (pool.s.length && rand(w) < 0.5) return `${given} ${pick(w, pool.s)}`;
    return given;
  }
  return `${given} ${pick(w, pool.s)}`;
}

export function makeCharacter(w: WorldState, init: Partial<Character> & Pick<Character, 'country' | 'role'>): Character {
  const ch: Character = {
    id: newId(w, 'ch'),
    name: init.name ?? 'Unknown',
    dynasty: init.dynasty,
    country: init.country,
    role: init.role,
    office: init.office,
    born: init.born ?? year(w) - randInt(w, 30, 60),
    female: init.female ?? false,
    health: init.health ?? randInt(w, 55, 95),
    adm: init.adm ?? randInt(w, 1, 7),
    dip: init.dip ?? randInt(w, 1, 7),
    mil: init.mil ?? randInt(w, 1, 7),
    traits: init.traits ?? [],
    loyalty: init.loyalty ?? randInt(w, 45, 85),
    ambition: init.ambition ?? randInt(w, 10, 70),
    alive: true,
    portraitSeed: init.portraitSeed ?? randInt(w, 0, 1_000_000),
    personality: init.personality,
  };
  w.characters[ch.id] = ch;
  return ch;
}

export function rulerTraits(adm: number, dip: number, mil: number): string[] {
  const t: string[] = [];
  if (adm >= 7) t.push('Able Administrator');
  if (dip >= 7) t.push('Silver-Tongued');
  if (mil >= 7) t.push('Warrior');
  if (adm <= 2) t.push('Indolent');
  if (mil <= 1 && dip <= 2) t.push('Withdrawn');
  return t;
}

export function generateMinister(w: WorldState, country: string, role: MinisterRole): Character {
  const d = def(country);
  const female = rand(w) < 0.06;
  const taken = new Set(Object.values(w.characters).filter((x) => x.country === country && x.alive).map((x) => x.name));
  let name = generateName(w, d.cultureGroup, female) ?? OFFICE_TITLES[role];
  for (let i = 0; i < 6 && taken.has(name); i++) name = generateName(w, d.cultureGroup, female) ?? OFFICE_TITLES[role];
  const pers = pick(w, PERSONALITIES[role]);
  const base = { finance: 'adm', foreign: 'dip', military: 'mil', admin: 'adm', intelligence: 'dip' } as const;
  const skills = { adm: randInt(w, 2, 6), dip: randInt(w, 2, 6), mil: randInt(w, 1, 5) };
  skills[base[role]] = randInt(w, 4, 9);
  return makeCharacter(w, { country, role: 'minister', office: role, name, female, ...skills, personality: pers.id, born: year(w) - randInt(w, 32, 66) });
}

export function generateGeneral(w: WorldState, country: string, name?: string, mil?: number): Character {
  const d = def(country);
  const n = name ?? generateName(w, d.cultureGroup, false) ?? OFFICE_TITLES.general;
  return makeCharacter(w, { country, role: 'general', name: n, mil: mil ?? randInt(w, 2, 7), adm: randInt(w, 1, 5), dip: randInt(w, 1, 5), born: year(w) - randInt(w, 28, 60), ambition: randInt(w, 10, 80) });
}

export function appointCouncil(w: WorldState, country: string): void {
  const c = w.countries[country];
  for (const role of MINISTER_ROLES) {
    const cur = c.ministers[role];
    if (cur && w.characters[cur]?.alive) continue;
    c.ministers[role] = generateMinister(w, country, role).id;
  }
}

export function age(w: WorldState, ch: Character): number {
  return year(w) - ch.born;
}

export function characterLabel(ch: Character | undefined): string {
  return ch ? ch.name : '—';
}
