// Research: points, costs (with diffusion and anachronism penalties) and completion.
import { lawOption } from '../data/laws';
import { INSTITUTION_FACTOR, TECHNOLOGIES, TECH_BY_ID } from '../data/technologies';
import type { TechDef } from './defs';
import { chronicle, bonuses, clamp, countryName, def, neighbourCountries, notify, provincesOf, touch, treatiesOf, partner, year } from './state';
import { OUTPOST_DEFS, PROVINCE_DEFS } from './static';
import type { TradeGoodId, WorldState } from './types';

/** Does the country have access to a good (owned province, outpost or trade partner)? */
export function hasAccess(w: WorldState, c: string, good: TradeGoodId): boolean {
  for (const id of provincesOf(w, c)) if (PROVINCE_DEFS[id].good === good) return true;
  for (const o of Object.values(w.outposts)) if (o.controller === c && OUTPOST_DEFS[o.id].good === good) return true;
  for (const t of treatiesOf(w, c, 'trade')) {
    const p = partner(t, c);
    for (const id of provincesOf(w, p)) if (PROVINCE_DEFS[id].good === good) return true;
  }
  const overlord = w.countries[c]?.overlord;
  if (overlord) for (const id of provincesOf(w, overlord)) if (PROVINCE_DEFS[id].good === good) return true;
  return false;
}

export function researchPoints(w: WorldState, c: string): number {
  const country = w.countries[c];
  const d = def(c);
  const b = bonuses(w, c);
  const provs = provincesOf(w, c);
  let pop = 0, build = 0;
  for (const id of provs) {
    const p = w.provinces[id];
    pop += p.pop;
    build += (p.buildings.school ?? 0) * 0.03 + (p.buildings.university ?? 0) * 0.12;
  }
  const edu = lawOption('education', country.laws.education)?.researchMult ?? 1;
  const ruler = w.characters[country.rulerId];
  const inst = INSTITUTION_FACTOR[d.techProfile];
  const base = Math.pow(Math.max(1, pop), 0.3) * inst * edu;
  const mult = (0.4 + 0.6 * country.budget.research) * (1 + (b.research ?? 0) + build / Math.sqrt(Math.max(1, provs.length))) * (1 + ((ruler?.adm ?? 5) - 5) * 0.03);
  return Math.max(0.2, base * mult);
}

let knownCache: { turn: number; ver: number; known: Map<string, number>; total: number } | null = null;
function knownShare(w: WorldState, tech: string): number {
  const ver = (w.flags.ver as number) ?? 0;
  if (!knownCache || knownCache.turn !== w.turn || knownCache.ver !== ver) {
    const known = new Map<string, number>();
    let total = 0;
    for (const c of Object.values(w.countries)) {
      if (!c.alive) continue;
      const pop = provincesOf(w, c.id).reduce((s, id) => s + w.provinces[id].pop, 0);
      total += pop;
      for (const t of c.techs) known.set(t, (known.get(t) ?? 0) + pop);
    }
    knownCache = { turn: w.turn, ver, known, total };
  }
  return (knownCache.known.get(tech) ?? 0) / Math.max(1, knownCache.total);
}

function neighbourKnows(w: WorldState, c: string, tech: string): boolean {
  for (const o of neighbourCountries(w, c)) if (w.countries[o]?.techs.includes(tech)) return true;
  for (const t of treatiesOf(w, c, 'trade')) if (w.countries[partner(t, c)]?.techs.includes(tech)) return true;
  const ov = w.countries[c].overlord;
  return !!ov && !!w.countries[ov]?.techs.includes(tech);
}

export function techCost(w: WorldState, c: string, techId: string): number {
  const t = TECH_BY_ID[techId];
  const early = Math.max(0, t.year - year(w));
  const diffusion = 1 - 0.45 * knownShare(w, techId) - (neighbourKnows(w, c, techId) ? 0.2 : 0);
  return Math.round(t.cost * (1 + early * 0.05) * clamp(diffusion, 0.35, 1));
}

export function techBlocker(w: WorldState, c: string, techId: string): string | null {
  const t = TECH_BY_ID[techId];
  const country = w.countries[c];
  if (!t) return 'Unknown technology.';
  if (country.techs.includes(techId)) return 'Already known.';
  const missing = t.requires.filter((r) => !country.techs.includes(r));
  if (missing.length) return `Requires ${missing.map((m) => TECH_BY_ID[m]?.name ?? m).join(', ')}.`;
  if (t.needsResource && !t.needsResource.some((g) => hasAccess(w, c, g))) return `Requires access to ${t.needsResource.join(' or ')}.`;
  if (t.needsLaw && !t.needsLaw.options.includes(country.laws[t.needsLaw.category])) return `Requires ${t.needsLaw.category} law: ${t.needsLaw.options.join(' or ')}.`;
  return null;
}

export function availableTechs(w: WorldState, c: string): TechDef[] {
  return TECHNOLOGIES.filter((t) => !techBlocker(w, c, t.id));
}

export function grantTech(w: WorldState, c: string, techId: string, silent = false): void {
  const country = w.countries[c];
  if (!country || country.techs.includes(techId)) return;
  country.techs.push(techId);
  touch(w);
  const t = TECH_BY_ID[techId];
  if (silent || !t) return;
  if (c === w.playerId) notify(w, `Our scholars and engineers have mastered ${t.name}.`, 'success');
  const pioneering = knownShare(w, techId) < 0.12 && t.year >= 1790;
  if (pioneering || c === w.playerId) {
    chronicle(w, { text: `${countryName(w, c)} masters ${t.name}${t.year > year(w) ? ', years ahead of its time' : ''}.`, category: 'discovery', countries: [c], importance: pioneering ? 2 : 1 });
  }
}

export function processResearch(w: WorldState, chooser: (c: string) => string | null): void {
  for (const country of Object.values(w.countries)) {
    if (!country.alive) continue;
    const rp = researchPoints(w, country.id);
    if (!country.research.tech || techBlocker(w, country.id, country.research.tech)) {
      const next = country.id === w.playerId ? null : chooser(country.id);
      country.research.tech = next;
      if (!next) {
        country.research.progress = Math.min(country.research.progress + rp * 0.5, 400);
        continue;
      }
    }
    country.research.progress += rp;
    const cost = techCost(w, country.id, country.research.tech!);
    if (country.research.progress >= cost) {
      country.research.progress -= cost;
      grantTech(w, country.id, country.research.tech!);
      country.research.tech = null;
    }
  }
}
