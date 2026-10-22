// Population, food, unrest, stability, legitimacy, factions, rulers, succession and law reform.
import { BUILDING_BY_ID } from '../data/buildings';
import { TECH_BY_ID } from '../data/technologies';
import { LAW_CATEGORY, lawOption } from '../data/laws';
import { HISTORICAL_SUCCESSORS } from '../data/scenario';
import { generateName, makeCharacter, rulerTraits } from './characters';
import { REBELS, RELIGION_GROUP, TERRAIN } from './constants';
import { maxManpower, spawnRebels, chanceOfRevolt } from './military';
import { chance, gaussian, pick, rand, randInt } from './rng';
import {
  armiesAt, armyRegiments, bonuses, chronicle, clamp, countryName, def, isAtWar, isMonarchy, isRepublic, month, notify, provincesOf, touch, year,
} from './state';
import { PROVINCE_DEFS } from './static';
import type { Character, CountryState, FactionId, LawCategory, WorldState } from './types';

const INSTITUTION = /Council|Assembly|Senate|Directory|Elders|Leaders|Chiefs|Parliament|Fono|Society|Bewind|Mesi|Headmen|Rajas|Kapteins|Caciques|Assemblies|Big Men|Matai|Rangatira|Gadaa|Sede vacante|College|Lonkos|Divisions|Bands|Councils|Gaanman|Ekpe|Congress|Moots|Office|Committee/i;

export function isInstitution(w: WorldState, ch: Character | undefined): boolean {
  if (!ch) return true;
  if (INSTITUTION.test(ch.name)) return true;
  const t = def(ch.country)?.polityType;
  return t === 'decentralized';
}

// ---------------------------------------------------------------------------
// Food and population
// ---------------------------------------------------------------------------

export function foodBalance(w: WorldState, c: string): number {
  const b = bonuses(w, c);
  let prod = 0, cons = 0;
  for (const id of provincesOf(w, c)) {
    const p = w.provinces[id];
    const pd = PROVINCE_DEFS[id];
    let local = 0.85 + 0.3 * TERRAIN[pd.terrain].food;
    if (['grain', 'rice', 'fish', 'livestock'].includes(pd.good)) local *= 1.06;
    let bb = 0;
    for (const [bid, lvl] of Object.entries(p.buildings)) bb += (BUILDING_BY_ID[bid as keyof typeof BUILDING_BY_ID]?.bonuses.food ?? 0) * (lvl ?? 0);
    local *= 1 + bb;
    local *= 1 - p.devastation / 200;
    prod += p.pop * local;
    cons += p.pop;
  }
  if (cons <= 0) return 0;
  return (prod / cons) * (1 + (b.food ?? 0)) - 1;
}

export function foodCap(w: WorldState, c: string): number {
  const provs = provincesOf(w, c);
  const granaries = provs.reduce((s, id) => s + (w.provinces[id].buildings.granary ?? 0), 0);
  return 3 + 6 * granaries / Math.max(1, provs.length);
}

function processFoodAndPopulation(w: WorldState, country: CountryState): void {
  const c = country.id;
  const bal = foodBalance(w, c);
  country.foodStock = clamp(country.foodStock + bal * 2.5, 0, foodCap(w, c));
  const famine = country.foodStock <= 0.01 && bal < 0;
  const b = bonuses(w, c);
  const freeIndustry = country.laws.labor === 'free_labor' && country.techs.includes('factory_system');
  for (const id of provincesOf(w, c)) {
    const p = w.provinces[id];
    let rate = 0.0042 + (b.growth ?? 0) + (p.buildings.hospital ?? 0) * 0.0008;
    if (country.foodStock > 1.5) rate += 0.001;
    if (famine) rate -= Math.min(0.06, -bal * 0.6);
    rate -= p.devastation / 100 * 0.02;
    if (p.controller !== p.owner) rate -= 0.004;
    p.pop = Math.max(0.5, p.pop * (1 + rate / 12));
    p.gdpPc *= 1 + (0.0015 + (freeIndustry ? 0.004 : 0)) / 12;
    p.devastation = Math.max(0, p.devastation - (p.controller === p.owner ? 1.2 : 0.2));
  }
  if (famine && c === w.playerId && month(w) % 3 === 0) notify(w, 'Granaries are empty: famine stalks the provinces.', 'danger');
}

// ---------------------------------------------------------------------------
// Unrest and revolts
// ---------------------------------------------------------------------------

export function unrestTarget(w: WorldState, pid: string, garrisons?: Map<string, number>): number {
  const p = w.provinces[pid];
  const c = p.owner ? w.countries[p.owner] : undefined;
  if (!c) return 0;
  const d = def(c.id);
  const b = bonuses(w, c.id);
  let t = 4;
  t += Math.max(0, c.taxRate - 0.1) * 120;
  t += c.warExhaustion * 0.25;
  t += (60 - c.stability) * 0.25;
  t += (60 - c.legitimacy) * 0.12;
  if (p.culture !== d.culture) t += c.laws.administration === 'federal' ? 3 : 7;
  if (p.religion !== d.religion) {
    const rel = c.laws.religion === 'state_religion' ? 10 : c.laws.religion === 'tolerance' ? 4 : 3;
    t += RELIGION_GROUP[p.religion] === RELIGION_GROUP[d.religion] ? rel / 2 : rel;
  }
  if (!p.cores.includes(c.id)) t += 12;
  if (p.controller && p.controller !== c.id) t += 8;
  t += p.devastation * 0.15;
  if (c.foodStock <= 0.05) t += 15;
  t += c.corruption * 0.08;
  t += b.unrest ?? 0;
  for (const [bid, lvl] of Object.entries(p.buildings)) t += (BUILDING_BY_ID[bid as keyof typeof BUILDING_BY_ID]?.bonuses.unrest ?? 0) * (lvl ?? 0);
  const garrison = garrisons ? garrisons.get(`${pid}|${c.id}`) ?? 0 : armiesAt(w, pid).filter((a) => a.owner === c.id).reduce((s, a) => s + armyRegiments(a), 0);
  t -= Math.min(10, garrison * 0.5);
  if (c.overlord) t += c.liberty / 10;
  for (const m of c.modifiers) t += m.unrest ?? 0;
  return clamp(t, 0, 100);
}

function rebelCause(w: WorldState, pid: string): string {
  const p = w.provinces[pid];
  const c = w.countries[p.owner!];
  const d = def(c.id);
  const dormant = p.cores.find((x) => x !== c.id && !w.countries[x]?.alive);
  if (dormant) return `Partisans of ${def(dormant).short}`;
  if (p.culture !== d.culture && !p.cores.includes(c.id)) return `${p.culture} separatists`;
  if (c.overlord && c.liberty > 50) return 'Independence movement';
  if (p.religion !== d.religion && RELIGION_GROUP[p.religion] !== RELIGION_GROUP[d.religion]) return `${p.religion === 'traditional' ? 'Traditionalist' : p.religion[0].toUpperCase() + p.religion.slice(1)} insurgents`;
  if (c.taxRate > 0.15) return 'Peasant tax rebels';
  if (c.foodStock <= 0.05) return 'Bread rioters';
  return 'Malcontents';
}

function processUnrest(w: WorldState, country: CountryState, garrisons: Map<string, number>, rebelsAt: Set<string>): void {
  for (const id of provincesOf(w, country.id)) {
    const p = w.provinces[id];
    const target = unrestTarget(w, id, garrisons);
    p.unrest = clamp(p.unrest + (target - p.unrest) * 0.12, 0, 100);
    if (p.controller === REBELS) continue;
    if (rand(w) < chanceOfRevolt(p.unrest) && !rebelsAt.has(id)) {
      const army = spawnRebels(w, id, rebelCause(w, id), 1 + (p.unrest - 60) / 40);
      if (army) p.unrest = clamp(p.unrest - 15, 0, 100);
    }
  }
}

// ---------------------------------------------------------------------------
// Stability, legitimacy, prestige, corruption, factions
// ---------------------------------------------------------------------------

function factionPressure(c: CountryState): number {
  let s = 0;
  for (const f of Object.values(c.factions)) s += (f.influence / 100) * (f.loyalty - 50);
  return s;
}

function processPolitics(w: WorldState, country: CountryState): void {
  const c = country.id;
  const b = bonuses(w, c);
  const ruler = w.characters[country.rulerId];
  const provs = provincesOf(w, c);
  const avgUnrest = provs.reduce((s, id) => s + w.provinces[id].unrest, 0) / Math.max(1, provs.length);
  const atWar = isAtWar(w, c);

  let stabTarget = 45 + country.legitimacy * 0.15 + ((ruler?.adm ?? 5) - 5) * 1.5 - country.warExhaustion * 0.3 - country.corruption * 0.15
    + (country.treasury < 0 ? -10 : 0) + (b.stability ?? 0) + factionPressure(country) * 0.4 - avgUnrest * 0.25;
  const stabDrift = country.modifiers.reduce((s, m) => s + (m.stability ?? 0), 0);
  stabTarget = clamp(stabTarget, 0, 100);
  country.stability = clamp(country.stability + (stabTarget - country.stability) * 0.05 + stabDrift, 0, 100);

  const t = def(c).polityType;
  let legTarget: number;
  if (isRepublic(w, c)) legTarget = 45 + country.stability * 0.2 + country.prestige * 0.1;
  else if (t === 'colony' || t === 'chartered_company') legTarget = 35 + (country.overlord ? w.countries[country.overlord].prestige * 0.25 : 0);
  else if (t === 'decentralized' || t === 'confederation' || t === 'nomadic') legTarget = 60 + country.stability * 0.1;
  else {
    const rulerAge = ruler ? year(w) - ruler.born : 40;
    legTarget = 60 + (rulerAge < 16 ? -18 : 0) + (country.heirId && w.characters[country.heirId]?.alive ? 6 : -8) + country.prestige * 0.12;
  }
  let templeLeg = 0;
  for (const id of provs) templeLeg += (w.provinces[id].buildings.temple ?? 0) * 0.5;
  legTarget += (b.legitimacy ?? 0) + templeLeg / Math.sqrt(Math.max(1, provs.length));
  country.legitimacy = clamp(country.legitimacy + (clamp(legTarget, 0, 100) - country.legitimacy) * 0.04, 0, 100);

  const incomeLog = Math.log10(Math.max(1, country.last.income + 1));
  const presBase = 8 + Math.min(45, incomeLog * 12);
  country.prestige = clamp(country.prestige + (presBase - country.prestige) * 0.02, 0, 100);

  let corrTarget = 15 + (1 - country.budget.administration) * 30 + Math.min(15, provs.length * 0.2) - ((ruler?.adm ?? 5) - 5) + (b.corruption ?? 0) * 200;
  for (const id of provs) corrTarget += (w.provinces[id].buildings.courthouse ?? 0) * -0.6;
  country.corruption = clamp(country.corruption + (clamp(corrTarget, 0, 90) - country.corruption) * 0.03, 0, 100);

  country.warExhaustion = clamp(country.warExhaustion + (atWar ? 0.15 : -1.5), 0, 100);
  country.infamy = Math.max(0, country.infamy - 0.5);

  // Factions drift toward the loyalty implied by current laws.
  const lawShift: Partial<Record<FactionId, number>> = {};
  for (const [cat, opt] of Object.entries(country.laws)) {
    for (const [f, v] of Object.entries(lawOption(cat as LawCategory, opt)?.factions ?? {})) lawShift[f as FactionId] = (lawShift[f as FactionId] ?? 0) + (v as number);
  }
  for (const [f, st] of Object.entries(country.factions) as [FactionId, { influence: number; loyalty: number }][]) {
    const target = clamp(60 + (lawShift[f] ?? 0) * 0.6 - (country.treasury < 0 && f === 'military' ? 15 : 0) - (atWar && f === 'commons' ? country.warExhaustion * 0.2 : 0), 5, 95);
    st.loyalty = clamp(st.loyalty + (target - st.loyalty) * 0.03, 0, 100);
  }

  for (const m of country.modifiers) m.monthsLeft -= 1;
  country.modifiers = country.modifiers.filter((m) => m.monthsLeft > 0);

  const maxMp = maxManpower(w, c);
  country.manpower = clamp(country.manpower + maxMp / 24, 0, maxMp);

  country.cycle = clamp(country.cycle * 0.93 + gaussian(w) * 0.07 + (atWar ? -0.015 : 0.004), -1, 1);
}

// ---------------------------------------------------------------------------
// Rulers, heirs and succession
// ---------------------------------------------------------------------------

function deathChance(age: number, health: number): number {
  const base = 0.0004 * Math.exp((age - 40) / 9.5);
  return Math.min(0.2, base * (1.6 - health / 100));
}

export function generateHeir(w: WorldState, c: string, adult = false): Character {
  const d = def(c);
  const female = rand(w) < 0.12;
  const name = generateName(w, d.cultureGroup, female) ?? 'Designated Successor';
  const born = year(w) - (adult ? randInt(w, 18, 40) : randInt(w, 0, 14));
  const ruler = w.characters[w.countries[c].rulerId];
  const a = randInt(w, 1, 8), dp = randInt(w, 1, 8), m = randInt(w, 1, 8);
  return makeCharacter(w, { country: c, role: 'heir', name, born, female, adm: a, dip: dp, mil: m, dynasty: ruler?.dynasty, traits: rulerTraits(a, dp, m) });
}

export function succeed(w: WorldState, c: string, cause: string): void {
  const country = w.countries[c];
  const old = w.characters[country.rulerId];
  if (old) { old.alive = false; }
  const d = def(c);
  const heir = country.heirId ? w.characters[country.heirId] : undefined;
  let newRuler: Character;
  if (isRepublic(w, c)) {
    const hist = HISTORICAL_SUCCESSORS[c]?.find((h) => !Object.values(w.characters).some((ch) => ch.name === h[0]));
    const [n, born, a, dp, m] = hist ?? [generateName(w, d.cultureGroup, false) ?? 'Elected Leader', year(w) - randInt(w, 45, 65), randInt(w, 2, 8), randInt(w, 2, 8), randInt(w, 1, 6)];
    newRuler = makeCharacter(w, { country: c, role: 'ruler', name: n, born, adm: a, dip: dp, mil: m, traits: rulerTraits(a, dp, m), loyalty: 100 });
    country.stability = clamp(country.stability - 2, 0, 100);
  } else if (heir?.alive) {
    newRuler = heir;
    heir.role = 'ruler';
    country.heirId = undefined;
    const age = year(w) - heir.born;
    if (age < 16) {
      country.modifiers.push({ id: 'regency', label: 'Regency Council', monthsLeft: (16 - age) * 12, stability: -0.05, unrest: 2 });
      country.legitimacy = clamp(country.legitimacy - 10, 0, 100);
    }
    if (isMonarchy(w, c) && chance(w, 0.7)) country.heirId = generateHeir(w, c, chance(w, 0.3)).id;
  } else {
    const n = generateName(w, d.cultureGroup, false) ?? 'New Council';
    const a = randInt(w, 1, 8), dp = randInt(w, 1, 8), m = randInt(w, 1, 8);
    newRuler = makeCharacter(w, { country: c, role: 'ruler', name: n, born: year(w) - randInt(w, 25, 55), adm: a, dip: dp, mil: m, traits: rulerTraits(a, dp, m), loyalty: 100 });
    if (isMonarchy(w, c)) {
      country.stability = clamp(country.stability - 20, 0, 100);
      country.legitimacy = clamp(country.legitimacy - 25, 0, 100);
      if (c !== w.playerId && chance(w, 0.35)) {
        const provs = provincesOf(w, c);
        if (provs.length > 1) spawnRebels(w, pick(w, provs), 'Pretender\'s supporters', 1.2);
      }
      if (isMonarchy(w, c) && chance(w, 0.6)) country.heirId = generateHeir(w, c, true).id;
    }
  }
  newRuler.role = 'ruler';
  country.rulerId = newRuler.id;
  touch(w);
  const big = d.population > 3_000_000 || c === w.playerId;
  chronicle(w, { text: `${old?.name ?? 'The ruler'} of ${countryName(w, c)} ${cause}. ${newRuler.name} succeeds.`, category: 'court', countries: [c], importance: big ? 2 : 1 });
  if (c === w.playerId) notify(w, `${old?.name ?? 'Our ruler'} ${cause}. ${newRuler.name} now leads ${countryName(w, c)}.`, 'warning');
}

function processRulers(w: WorldState, country: CountryState): void {
  const c = country.id;
  const ruler = w.characters[country.rulerId];
  if (ruler && !isInstitution(w, ruler)) {
    const age = year(w) - ruler.born;
    if (month(w) === 0) ruler.health = clamp(ruler.health - (age > 50 ? randInt(w, 1, 5) : 0) + randInt(w, -2, 2), 5, 100);
    if (rand(w) < deathChance(age, ruler.health)) {
      succeed(w, c, 'has died');
      return;
    }
  }
  // Elections in the United States every four years (inauguration in March).
  if (c === 'usa' && month(w) === 2 && (year(w) - 1801) % 4 === 0 && w.turn > 0) {
    const r = w.characters[country.rulerId];
    const terms = Math.floor((w.turn - ((w.flags[`usa_term_start`] as number) ?? -10)) / 48);
    const reelect = r && r.alive && terms < 2 && chance(w, 0.25 + country.stability / 200);
    if (!reelect) {
      succeed(w, c, 'leaves office after the election');
      w.flags.usa_term_start = w.turn;
    }
  }
  const heir = country.heirId ? w.characters[country.heirId] : undefined;
  if (heir && heir.alive && rand(w) < deathChance(year(w) - heir.born, heir.health) * 0.6) {
    heir.alive = false;
    country.heirId = undefined;
    if (c === w.playerId) notify(w, `The heir, ${heir.name}, has died.`, 'warning');
  }
  // Characters (generals, ministers) also age and die.
  if (month(w) === 6 && c === w.playerId) {
    for (const role of Object.keys(country.ministers) as (keyof CountryState['ministers'])[]) {
      const m = w.characters[country.ministers[role] ?? ''];
      if (m && m.alive && rand(w) < deathChance(year(w) - m.born, m.health) * 6) {
        m.alive = false;
        notify(w, `${m.name}, our minister, has died.`, 'info');
      }
    }
  }
}

function processLawReform(w: WorldState, country: CountryState): void {
  const r = country.lawReform;
  if (!r) return;
  r.monthsLeft -= 1;
  if (r.monthsLeft > 0) return;
  const oldOpt = lawOption(r.category, country.laws[r.category]);
  const newOpt = lawOption(r.category, r.option);
  country.laws[r.category] = r.option;
  country.lawReform = undefined;
  for (const f of Object.keys(country.factions) as FactionId[]) {
    const delta = (newOpt?.factions[f] ?? 0) - (oldOpt?.factions[f] ?? 0);
    country.factions[f].loyalty = clamp(country.factions[f].loyalty + delta * 0.5, 0, 100);
  }
  touch(w);
  const catName = LAW_CATEGORY[r.category].name;
  chronicle(w, { text: `${countryName(w, country.id)} enacts ${newOpt?.name ?? r.option} (${catName}).`, category: 'court', countries: [country.id], importance: r.category === 'government' || r.category === 'labor' ? 2 : 1 });
  if (country.id === w.playerId) notify(w, `Reform complete: ${newOpt?.name}.`, 'success');
}

function harvest(w: WorldState, country: CountryState): void {
  if (month(w) !== 8) return;
  const f = clamp(1 + gaussian(w) * 0.06, 0.8, 1.15);
  country.modifiers = country.modifiers.filter((m) => m.id !== 'harvest');
  country.modifiers.push({ id: 'harvest', label: f >= 1 ? 'Good harvest' : 'Poor harvest', monthsLeft: 12, food: f - 1 });
}

export function processSociety(w: WorldState): void {
  const garrisons = new Map<string, number>();
  const rebelsAt = new Set<string>();
  for (const a of Object.values(w.armies)) {
    if (a.rebel) rebelsAt.add(a.location);
    const k = `${a.location}|${a.owner}`;
    garrisons.set(k, (garrisons.get(k) ?? 0) + armyRegiments(a));
  }
  for (const country of Object.values(w.countries)) {
    if (!country.alive) continue;
    if (!provincesOf(w, country.id).length) {
      country.alive = false;
      chronicle(w, { text: `${countryName(w, country.id)} ceases to exist as an independent polity.`, category: 'war', countries: [country.id], importance: 2 });
      continue;
    }
    harvest(w, country);
    processFoodAndPopulation(w, country);
    processUnrest(w, country, garrisons, rebelsAt);
    processPolitics(w, country);
    processRulers(w, country);
    processLawReform(w, country);
  }
}

export function lawBlocker(w: WorldState, c: string, category: LawCategory, option: string): string | null {
  const country = w.countries[c];
  const opt = lawOption(category, option);
  if (!opt) return 'Unknown law.';
  if (country.laws[category] === option) return 'Already in force.';
  if (country.lawReform) return 'Another reform is already under way.';
  if (opt.requiresTech && !country.techs.includes(opt.requiresTech)) return `Requires ${TECH_BY_ID[opt.requiresTech]?.name ?? opt.requiresTech}.`;
  if (opt.requiresType && !opt.requiresType.includes(def(c).polityType)) return 'Not available to this form of polity.';
  if (category === 'taxation' && option === 'tax_bureau' && country.laws.administration === 'decentralized') return 'Requires provincial governors or a bureaucracy.';
  if (country.stability < 15) return 'The realm is too unstable for reform.';
  return null;
}

export function lawReformCost(w: WorldState, c: string, category: LawCategory): { cost: number; months: number; stability: number } {
  const country = w.countries[c];
  const months = category === 'government' ? 24 : category === 'labor' ? 18 : 12;
  // Reforms cost political capital more than money: commissions, compensation and new offices.
  const cost = Math.round(Math.max(10, country.last.income) * (category === 'government' ? 1.6 : 0.8));
  return { cost, months, stability: category === 'government' ? 15 : 8 };
}
