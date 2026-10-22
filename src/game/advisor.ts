// The royal council: a deterministic, rule-based interpreter that turns plain-language orders
// ("Modernise the army", "Build textile mills near Lahore") into concrete GameActions, and
// ministers who volunteer advice from the state of the realm. Every step is validated by
// previewAction(), so the council can never spend money we do not have or bypass a rule.
import { BUILDINGS, BUILDING_BY_ID, UNITS } from '../data/buildings';
import { LAWS, lawOption } from '../data/laws';
import { TECHNOLOGIES, TECH_BY_ID } from '../data/technologies';
import { previewAction, applyAction, type ActionPreview, type ActionResult, type GameAction } from './actions';
import { threatLevel } from './ai';
import { MINISTER_TITLES, PERSONALITIES } from './characters';
import { buildBlocker } from './construction';
import { evaluateProposal, maxEnvoys } from './diplomacy';
import { creditAvailable, totalDebt } from './economy';
import { consortOf, household, relationTo } from './family';
import { SPY_OPS, type SpyOp } from './espionage';
import { recruitCost } from './military';
import { lawBlocker } from './society';
import {
  alliesOf, armiesOf, armyRegiments, countryName, def, isAtWar, neighbourCountries, opinion, provinceName, provincesOf, sideOf, warsOf,
} from './state';
import { POLITIES, PROVINCE_DEFS, isCoastal, neighbors, provinceDistance } from './static';
import { availableTechs, techBlocker } from './tech';
import { casusBelli, emptyTerms, peaceAcceptance, powerScore, suggestTerms } from './war';
import type { BuildingId, LawCategory, MinisterRole, TechCategory, UnitType, WorldState } from './types';

export interface PlanStep {
  action: GameAction;
  preview: ActionPreview;
  /** Optional steps are offered but not selected by default. */
  optional?: boolean;
}

export interface CommandPlan {
  input: string;
  understood: boolean;
  intent: string;
  title: string;
  minister: MinisterRole;
  speaker: string;
  reply: string;
  steps: PlanStep[];
  notes: string[];
  totals: { treasury: number; stability: number; prestige: number; manpower: number };
}

export interface AdviceItem {
  role: MinisterRole;
  title: string;
  speaker: string;
  personality: string;
  text: string;
  command?: string;
  severity: 'info' | 'opportunity' | 'warning' | 'danger';
}

export const COMMAND_EXAMPLES = [
  'Modernise the army.',
  'Build textile mills near our largest city.',
  'Seek a defensive alliance with Persia.',
  'Improve relations with the British.',
  'Reduce corruption.',
  'Prepare a defensive campaign.',
  'Reform the tax system.',
  'Raise 4 regiments of cavalry.',
  'Industrialise the economy.',
  'Make peace.',
  'Lower taxes to 8%.',
  'Borrow £200k.',
  'Build roads in the capital.',
  'Establish a spy network in France.',
  'Abolish serfdom.',
];

// ---------------------------------------------------------------------------
// Text matching
// ---------------------------------------------------------------------------

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9%£$.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  great_britain: ['british', 'britain', 'england', 'english', 'united kingdom', 'uk', 'london', 'his britannic majesty'],
  british_east_india_company: ['east india company', 'the company', 'eic', 'john company', 'company bahadur', 'calcutta'],
  qajar_persia: ['persia', 'persians', 'iran', 'iranians', 'qajars', 'tehran'],
  qing: ['china', 'chinese', 'qing', 'manchu', 'manchus', 'peking', 'beijing', 'middle kingdom'],
  tokugawa: ['japan', 'japanese', 'shogun', 'shogunate', 'bakufu', 'edo'],
  ottoman: ['turks', 'turkey', 'ottomans', 'porte', 'sublime porte', 'constantinople', 'istanbul'],
  usa: ['americans', 'america', 'united states', 'usa', 'the us', 'washington'],
  russia: ['russians', 'tsar', 'czar', 'st petersburg'],
  mughal: ['mughals', 'moghul', 'moghuls', 'delhi'],
  maratha: ['marathas', 'peshwa', 'pune', 'poona', 'maratha confederacy'],
  sikh_misls: ['sikhs', 'punjab', 'ranjit singh', 'khalsa'],
  durrani: ['afghans', 'afghanistan', 'kabul', 'durrani'],
  hyderabad: ['nizam', 'deccan'],
  batavian_republic: ['dutch', 'netherlands', 'holland'],
  france: ['french', 'paris', 'bonaparte', 'napoleon'],
  spain: ['spanish', 'madrid'],
  austria: ['austrians', 'habsburg', 'habsburgs', 'vienna', 'holy roman empire'],
  prussia: ['prussians', 'berlin'],
  sweden: ['swedes'],
  denmark_norway: ['danes', 'denmark', 'norway'],
  konbaung: ['burma', 'burmese', 'ava', 'amarapura'],
  joseon: ['korea', 'koreans'],
  siam: ['siamese', 'thai', 'thailand', 'bangkok'],
  scindia: ['sindhia', 'gwalior'],
  holkar: ['indore'],
  bhonsle: ['bhonsle', 'berar'],
  gaekwad: ['baroda', 'gaekwad'],
  mysore: ['mysoreans', 'wodeyar'],
  nepal: ['gorkha', 'gurkhas', 'kathmandu'],
  ethiopia: ['abyssinia', 'abyssinians'],
  morocco: ['moroccans', 'fez'],
  portugal: ['portuguese', 'lisbon'],
};

interface Match { id: string; index: number; length: number }

let countryKeys: { key: string; id: string }[] | null = null;
function countryIndex(): { key: string; id: string }[] {
  if (countryKeys) return countryKeys;
  const out: { key: string; id: string }[] = [];
  const add = (k: string, id: string) => { const n = normalize(k); if (n.length >= 3 || n === 'uk') out.push({ key: n, id }); };
  for (const p of Object.values(POLITIES)) {
    add(p.name, p.id); add(p.short, p.id); add(p.adjective, p.id); add(`${p.adjective}s`, p.id);
    add(p.id.replace(/_/g, ' '), p.id);
    for (const a of p.aliases ?? []) add(a, p.id);
  }
  for (const [id, list] of Object.entries(COUNTRY_ALIASES)) for (const a of list) add(a, id);
  // Longest keys first so "east india company" beats "company".
  out.sort((a, b) => b.key.length - a.key.length);
  countryKeys = out;
  return out;
}

function findPhrase(text: string, key: string): number {
  let from = 0;
  for (;;) {
    const i = text.indexOf(key, from);
    if (i < 0) return -1;
    const before = i === 0 ? ' ' : text[i - 1];
    const after = i + key.length >= text.length ? ' ' : text[i + key.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return i;
    from = i + 1;
  }
}

/** Polities named in the text, in order of appearance (alive ones preferred). */
export function matchCountries(w: WorldState, text: string, exclude?: string): string[] {
  const t = normalize(text);
  const found: Match[] = [];
  const taken: [number, number][] = [];
  for (const { key, id } of countryIndex()) {
    const i = findPhrase(t, key);
    if (i < 0) continue;
    if (taken.some(([a, b]) => i < b && i + key.length > a)) continue;
    if (id === exclude) continue;
    // Prefer living polities sharing the same adjective (e.g. "Hessian").
    let target = id;
    if (!w.countries[id]?.alive) {
      const alt = Object.values(POLITIES).find((p) => normalize(p.adjective) === key && w.countries[p.id]?.alive);
      if (alt) target = alt.id; else continue;
    }
    taken.push([i, i + key.length]);
    found.push({ id: target, index: i, length: key.length });
  }
  return [...new Set(found.sort((a, b) => a.index - b.index).map((m) => m.id))];
}

let provinceKeys: { key: string; id: string }[] | null = null;
function provinceIndex(): { key: string; id: string }[] {
  if (provinceKeys) return provinceKeys;
  const out: { key: string; id: string }[] = [];
  const add = (k: string, id: string) => { const n = normalize(k); if (n.length >= 3) out.push({ key: n, id }); };
  for (const p of Object.values(PROVINCE_DEFS)) {
    add(p.name, p.id);
    for (const part of p.name.split(/[()&,/]| and /)) add(part, p.id);
    add(p.id.replace(/_/g, ' '), p.id);
  }
  for (const p of Object.values(POLITIES)) if (p.capitalName && PROVINCE_DEFS[p.capital]) add(p.capitalName, p.capital);
  out.sort((a, b) => b.key.length - a.key.length);
  provinceKeys = out;
  return out;
}

export function matchProvince(text: string): string | null {
  const t = normalize(text);
  // Look first after a locative preposition, then anywhere.
  const loc = t.match(/\b(?:in|near|at|around|by|outside|close to|next to|throughout)\s+(.+)$/);
  for (const scope of [loc?.[1], t]) {
    if (!scope) continue;
    for (const { key, id } of provinceIndex()) if (findPhrase(scope, key) >= 0) return id;
  }
  return null;
}

function parseNumber(t: string): number | null {
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (m) return parseFloat(m[1]);
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, several: 3, few: 2, some: 2 };
  for (const [k, v] of Object.entries(words)) if (new RegExp(`\\b${k}\\b`).test(t) && k.length > 2) return v;
  return null;
}

function parseMoney(t: string): number | null {
  const m = t.match(/£?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const unit = m[2];
  if (unit === 'm' || unit === 'million') return v * 1000;
  return v; // amounts are in £ thousands
}

// ---------------------------------------------------------------------------
// Council members
// ---------------------------------------------------------------------------

export function ministerInfo(w: WorldState, c: string, role: MinisterRole): { name: string; title: string; personality: string; personalityName: string } {
  const country = w.countries[c];
  const ch = country.ministers[role] ? w.characters[country.ministers[role]!] : undefined;
  const p = PERSONALITIES[role].find((x) => x.id === ch?.personality) ?? PERSONALITIES[role][0];
  return { name: ch?.alive ? ch.name : 'The council', title: MINISTER_TITLES[role], personality: p.id, personalityName: p.name };
}

export function address(w: WorldState, c: string): string {
  const title = def(c).rulerTitle.toLowerCase();
  const ruler = w.characters[w.countries[c].rulerId];
  if (/president|consul|first consul|chancellor|doge|stadtholder|director/.test(title)) return title.includes('first consul') ? 'Citizen First Consul' : 'Your Excellency';
  if (/pope|pontiff/.test(title)) return 'Holy Father';
  if (/governor|resident|viceroy|captain.general|intendant/.test(title)) return 'Your Excellency';
  if (/emperor|empress|king|queen|tsar|shah|sultan|padishah|negus|mansa|oba|asantehene|alafin|kabaka|mwami|mogho|tenno/.test(title)) return 'Your Majesty';
  if (/chief|sachem|elder|rangatira|ariki|council|headman/.test(title)) return 'Honoured chief';
  if (/peshwa|maharaja|raja|rana|nawab|nizam|khan|emir|amir|bey|dey|pasha|imam|sharif|mai|mek|sheikh|sayyid|prince|duke|elector|landgrave|margrave|grand duke|archbishop|bishop|sardar|mehtar|wali|sultanate|mir\b/.test(title)) return 'Your Highness';
  return ruler?.female ? 'My lady' : 'My lord';
}

const FLAVOUR: Record<string, { open: string[]; caution: string }> = {
  frugal: { open: ['I have costed the matter carefully.', 'Every coin has been counted twice.'], caution: 'I would only ask that we not borrow to pay for it.' },
  expansive: { open: ['An excellent investment.', 'Money spent so will return to us many times over.'], caution: 'Fortune favours the state that spends boldly.' },
  conciliatory: { open: ['Patience and courtesy will serve us here.', 'A friendly hand opens more doors than a fist.'], caution: 'Let us not give needless offence.' },
  assertive: { open: ['Our rivals respect only firmness.', 'It is time we were taken seriously.'], caution: 'Weakness invites contempt.' },
  hawkish: { open: ['At last!', 'The army stands ready.'], caution: 'Delay only helps our enemies.' },
  methodical: { open: ['It can be done, if done in order.', 'Supply first, then glory.'], caution: 'We must not outrun our magazines.' },
  reformer: { open: ['The old ways have served their time.', 'The offices of state must be rationalised.'], caution: 'The old families will grumble.' },
  traditionalist: { open: ['Custom has its reasons.', 'We should move with care.'], caution: 'Change too quickly and the realm may stumble.' },
  cautious: { open: ['Quietly, then.', 'Our agents must not be traced to us.'], caution: 'Exposure would cost us dearly.' },
  cunning: { open: ['A delicious opportunity.', 'Leave it to my people.'], caution: 'A little risk sharpens the game.' },
};

function voice(w: WorldState, c: string, role: MinisterRole, body: string, caution = false): string {
  const m = ministerInfo(w, c, role);
  const f = FLAVOUR[m.personality];
  const opener = f ? f.open[(w.turn + body.length) % f.open.length] : '';
  return `${address(w, c)}, ${opener ? opener.charAt(0).toLowerCase() + opener.slice(1) + ' ' : ''}${body}${caution && f ? ` ${f.caution}` : ''}`;
}

// ---------------------------------------------------------------------------
// Plan building
// ---------------------------------------------------------------------------

class Planner {
  steps: PlanStep[] = [];
  notes: string[] = [];
  private budget: number;
  constructor(private w: WorldState, private c: string) {
    this.budget = w.countries[c].treasury;
  }
  /** Adds a step; validity reflects money already committed by earlier steps. */
  add(action: GameAction, optional = false): PlanStep {
    const preview = previewAction(this.w, this.c, action);
    const cost = preview.cost.treasury ?? 0;
    if (preview.valid && cost > 0 && cost > this.budget + 0.5 && !optional) {
      preview.valid = false;
      preview.errors = [...preview.errors, `Together with the steps above this would exceed the treasury (£${Math.round(this.budget)}k left).`];
    }
    if (preview.valid && !optional && cost > 0) this.budget -= cost;
    const step = { action, preview, optional };
    this.steps.push(step);
    return step;
  }
  note(s: string): void { this.notes.push(s); }
  validCount(): number { return this.steps.filter((s) => s.preview.valid).length; }
  remaining(): number { return this.budget; }
}

const BUILDING_WORDS: [RegExp, BuildingId][] = [
  [/\b(textile|cotton|spinning|weaving|cloth|wool(len)?|silk) ?(mill|mills|factory|factories|works)?\b/, 'textile_mill'],
  [/\b(iron ?works|foundr(y|ies)|forges?|steel ?works|smelters?)\b/, 'ironworks'],
  [/\bsteam\b/, 'steam_works'],
  [/\bcanals?\b/, 'canal'],
  [/\b(roads?|highways?|turnpikes?|post roads?)\b/, 'road'],
  [/\b(dockyards?|shipyards?|naval yards?)\b/, 'shipyard'],
  [/\b(harbou?rs?|ports?|quays?|docks?)\b/, 'port'],
  [/\birrigation\b/, 'irrigation'],
  [/\bgranar(y|ies)\b/, 'granary'],
  [/\bmarkets?( halls?)?\b/, 'market'],
  [/\b(manufactor(y|ies)|workshops?)\b/, 'workshop'],
  [/\bmines?\b/, 'mine'],
  [/\buniversit(y|ies)\b/, 'university'],
  [/\bschools?\b/, 'school'],
  [/\bhospitals?\b/, 'hospital'],
  [/\b(court ?houses?|courts of law|intendanc(y|ies))\b/, 'courthouse'],
  [/\b(temples?|mosques?|churches|church|monaster(y|ies)|shrines?|religious foundations?)\b/, 'temple'],
  [/\b(fortress(es)?|forts?|fortifications?|citadels?|bastions?)\b/, 'fortress'],
  [/\bbarracks\b/, 'barracks'],
  [/\barsenals?\b/, 'arsenal'],
  [/\b(factor(y|ies)|mills?|industr(y|ies))\b/, 'textile_mill'],
];

function buildingFrom(t: string): BuildingId | null {
  for (const [re, b] of BUILDING_WORDS) if (re.test(t)) return b;
  return null;
}

function plural(t: string): boolean {
  return /\b(mills|factories|roads|ports|harbours|harbors|schools|markets|fortresses|forts|fortifications|mines|temples|mosques|churches|hospitals|courthouses|workshops|manufactories|granaries|barracks)\b/.test(t);
}

/** Our provinces best suited to a building, nearest to `near` when given. */
function siteCandidates(w: WorldState, c: string, b: BuildingId, near?: string | null): string[] {
  const mine = provincesOf(w, c).filter((id) => w.provinces[id].controller === c);
  const ok = mine.filter((id) => !buildBlocker(w, c, id, b));
  if (near) return ok.sort((x, y) => provinceDistance(near, x) - provinceDistance(near, y));
  return ok.sort((x, y) => w.provinces[y].pop - w.provinces[x].pop);
}

function blockerReasons(w: WorldState, c: string, b: BuildingId, near?: string | null): string {
  const mine = provincesOf(w, c).filter((id) => w.provinces[id].controller === c);
  const sorted = near ? mine.slice().sort((x, y) => provinceDistance(near, x) - provinceDistance(near, y)) : mine.slice().sort((x, y) => w.provinces[y].pop - w.provinces[x].pop);
  const reasons = [...new Set(sorted.slice(0, 4).map((id) => buildBlocker(w, c, id, b)).filter(Boolean))];
  return reasons.join(' ');
}

function planBuild(w: WorldState, c: string, pl: Planner, t: string, b: BuildingId, defaultCount?: number): string {
  const bd = BUILDING_BY_ID[b];
  const place = matchProvince(t);
  let near = place;
  if (/\b(capital|court|seat of government)\b/.test(t) && !place) near = w.countries[c].capital;
  if (/\b(largest|biggest|greatest|main|chief) (city|town|province)\b/.test(t) && !place) near = provincesOf(w, c).slice().sort((x, y) => w.provinces[y].pop - w.provinces[x].pop)[0] ?? null;
  if (/\b(border|frontier)\b/.test(t) && !place) {
    const threat = mainThreat(w, c);
    const border = provincesOf(w, c).filter((id) => neighbors(id).some((n) => w.provinces[n]?.owner === threat));
    near = border.sort((x, y) => w.provinces[y].pop - w.provinces[x].pop)[0] ?? null;
  }
  if (place && w.provinces[place]?.owner !== c) {
    const owner = w.provinces[place]?.owner;
    pl.note(`${provinceName(place)} is ${owner ? `held by ${countryName(w, owner)}` : 'not under our rule'}; I have looked for sites among our nearest provinces.`);
  }
  const n = parseNumber(t.replace(/\d+\s*%/g, ''));
  const count = Math.max(1, Math.min(6, n ?? defaultCount ?? (plural(t) ? 2 : 1)));
  const sites = siteCandidates(w, c, b, near).filter((id) => !near || provinceDistance(near, id) < 75);
  if (!sites.length) {
    const why = blockerReasons(w, c, b, near);
    pl.note(`No suitable site for ${bd.name.toLowerCase()}${near ? ` near ${provinceName(near)}` : ''}. ${why}`.trim());
    return `I regret that we cannot build ${bd.name.toLowerCase()} at present.`;
  }
  for (const pid of sites.slice(0, count)) pl.add({ type: 'build', province: pid, building: b });
  if (sites.length < count) pl.note(`Only ${sites.length} suitable site${sites.length > 1 ? 's' : ''} found.`);
  const where = sites.slice(0, count).map(provinceName);
  return `I propose ${bd.name.toLowerCase()} at ${listJoin(where)}.`;
}

function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

export function mainThreat(w: WorldState, c: string): string | null {
  let best: string | null = null, score = 0;
  for (const o of neighbourCountries(w, c)) {
    if (alliesOf(w, c).includes(o) || w.countries[o].overlord === c || w.countries[c].overlord === o) continue;
    const hostility = opinion(w, c, o) < -40 || w.countries[c].rivals.includes(o) ? 1.5 : opinion(w, c, o) < 0 ? 1 : 0.4;
    const s = hostility * powerScore(w, o) / Math.max(1, powerScore(w, c));
    if (s > score) { score = s; best = o; }
  }
  for (const war of warsOf(w, c)) {
    const side = sideOf(war, c)!;
    const enemy = side === 'attackers' ? war.defenderLeader : war.attackerLeader;
    if (enemy) return enemy;
  }
  return best;
}

function bestTech(w: WorldState, c: string, cats: TechCategory[], prefer: string[] = []): string | null {
  const avail = availableTechs(w, c).filter((t) => cats.includes(t.category));
  for (const p of prefer) if (avail.some((t) => t.id === p)) return p;
  return avail.sort((a, b) => a.year - b.year || a.cost - b.cost)[0]?.id ?? null;
}

function bestLaw(w: WorldState, c: string, category: LawCategory, order: string[]): string | null {
  const cur = w.countries[c].laws[category];
  for (const o of order) {
    if (o === cur) return null;
    if (!lawBlocker(w, c, category, o)) return o;
  }
  return null;
}

function unitFrom(t: string, c: string): UnitType {
  if (/\b(cavalry|horse|horsemen|dragoons|hussars|lancers|sowars|cossacks)\b/.test(t)) return 'cavalry';
  if (/\b(artillery|guns|cannon|cannons|batteries)\b/.test(t)) return 'artillery';
  if (/\b(irregulars|militia|warriors|levies|skirmishers|tribesmen)\b/.test(t)) return 'irregulars';
  return ['decentralized', 'nomadic'].includes(def(c).polityType) ? 'irregulars' : 'infantry';
}

function recruitSite(w: WorldState, c: string, t?: string, pl?: Planner): string | null {
  const place = t ? matchProvince(t) : null;
  const cap = w.countries[c].capital;
  if (place && w.provinces[place]?.owner === c && w.provinces[place].controller === c) return place;
  if (pl && place) pl.note(`${provinceName(place)} is not under our control; the regiments will muster elsewhere.`);
  else if (pl && t && /\b(in|at|near) [a-z]/.test(t)) pl.note('I do not know that place; the regiments will muster at the capital.');
  if (w.provinces[cap]?.controller === c) return cap;
  return provincesOf(w, c).find((id) => w.provinces[id].controller === c) ?? null;
}

function affordableCount(w: WorldState, c: string, unit: UnitType, wanted: number, budget: number): number {
  const country = w.countries[c];
  let n = wanted;
  while (n > 1 && (recruitCost(w, c, unit, n) > budget || UNITS[unit].manpower * n > country.manpower)) n--;
  return n;
}

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

interface Intent {
  id: string;
  title: string;
  minister: MinisterRole;
  test: (t: string) => boolean;
  plan: (w: WorldState, c: string, t: string, pl: Planner, raw: string) => string;
}

const HEIR_TITLE_WORDS = new Set(['prince', 'princess', 'crown', 'grand', 'duke', 'duchess', 'archduke', 'archduchess', 'king', 'queen', 'lord', 'lady', 'the', 'son', 'daughter', 'heir', 'make', 'name']);

const INTENTS: Intent[] = [
  {
    id: 'peace', title: 'Make peace', minister: 'foreign',
    test: (t) => /\b(make|sue for|seek|negotiate|propose|offer|sign|conclude) (a )?(white )?peace\b|\bend (the|this|our) wars?\b|\barmistice\b|\bceasefire\b|\bpeace (with|treaty)\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const wars = warsOf(w, c);
      if (!wars.length) { pl.note('We are at peace with all nations.'); return 'We are at war with no one.'; }
      const named = matchCountries(w, raw, c);
      const targets = named.length ? wars.filter((war) => named.some((n) => war.attackers.includes(n) || war.defenders.includes(n))) : wars;
      for (const war of targets) {
        const side = sideOf(war, c)!;
        const leader = side === 'attackers' ? war.attackerLeader : war.defenderLeader;
        if (leader !== c) { pl.note(`${war.name}: only ${countryName(w, leader)}, who leads our side, can sign the peace.`); continue; }
        const my = side === 'attackers' ? war.score : -war.score;
        const white = /\bwhite\b/.test(t);
        if (my > 10 && !white) {
          const terms = suggestTerms(w, war, side, my);
          pl.add({ type: 'proposePeace', war: war.id, terms, mode: 'demand' });
        } else {
          pl.add({ type: 'proposePeace', war: war.id, terms: emptyTerms(), mode: 'offer' });
          if (my < -10) {
            const acc = peaceAcceptance(w, war, c, emptyTerms(), false);
            if (!acc.accept) pl.note(`${war.name}: the enemy holds the upper hand (war score ${Math.round(my)}) and will likely refuse a white peace. Concessions may be needed — see the Diplomacy panel.`);
          }
        }
      }
      return 'Our envoys can carry these proposals to the enemy.';
    },
  },
  {
    id: 'declare_war', title: 'Declare war', minister: 'military',
    test: (t) => /\b(declare war|go to war|make war|wage war|war (on|against)|attack|invade|conquer|march (on|against)|crush)\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const target = matchCountries(w, raw, c)[0];
      if (!target) { pl.note('Name the polity you wish to make war upon.'); return 'Against whom, exactly?'; }
      const cbs = casusBelli(w, c, target).sort((a, b) => a.infamy - b.infamy);
      const cb = cbs.find((x) => x.type !== 'none') ?? cbs[0];
      if (!cb) { pl.note('We have no grounds for war.'); return 'We have no pretext.'; }
      pl.add({ type: 'declareWar', target, cb: cb.type });
      const ratio = powerScore(w, c) / Math.max(1, powerScore(w, target));
      if (ratio < 1) pl.note(`${countryName(w, target)} is stronger than we are (power ratio ${ratio.toFixed(2)}).`);
      if (cb.type === 'none') pl.note('We lack a just cause: the world will judge us harshly and stability will suffer.');
      const allies = alliesOf(w, target);
      if (allies.length) pl.note(`${countryName(w, target)} is allied to ${listJoin(allies.map((a) => countryName(w, a)))}.`);
      return `The army can march against ${countryName(w, target)}.`;
    },
  },
  {
    id: 'alliance', title: 'Seek an alliance', minister: 'foreign',
    test: (t) => /\b(alliance|ally with|allied with|allies with|coalition)\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const targets = matchCountries(w, raw, c);
      if (!targets.length) {
        const threat = mainThreat(w, c);
        const pool = Object.values(w.countries).filter((x) => x.alive && x.id !== c && x.id !== threat && !x.overlord && (!threat || opinion(w, x.id, threat) < 0 || neighbourCountries(w, x.id).includes(threat)))
          .map((x) => ({ id: x.id, s: evaluateProposal(w, c, x.id, 'alliance').score + powerScore(w, x.id) / 20 }))
          .sort((a, b) => b.s - a.s).slice(0, 2);
        for (const p of pool) pl.add({ type: 'diplomacy', kind: 'alliance', target: p.id });
        if (!pool.length) pl.note('I can find no court inclined to join us.');
        return threat ? `Against the danger from ${countryName(w, threat)}, these courts are the most likely partners.` : 'These are the most promising partners.';
      }
      for (const target of targets.slice(0, 3)) {
        const s = pl.add({ type: 'diplomacy', kind: 'alliance', target });
        if (s.preview.valid && (s.preview.chance ?? 1) < 0.35) pl.add({ type: 'diplomacy', kind: 'envoy', target }, true);
      }
      return `I will instruct our ambassador${targets.length > 1 ? 's' : ''} accordingly.`;
    },
  },
  {
    id: 'trade_treaty', title: 'Negotiate a trade agreement', minister: 'foreign',
    test: (t) => /\b(trade (agreement|treaty|deal|pact)|commercial (treaty|agreement)|open trade with|trade with)\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const targets = matchCountries(w, raw, c);
      if (!targets.length) { pl.note('Name the nation you wish to trade with.'); return 'With whom shall we trade?'; }
      for (const target of targets.slice(0, 3)) pl.add({ type: 'diplomacy', kind: 'trade', target });
      return 'A commercial treaty would profit both crowns.';
    },
  },
  {
    id: 'heir', title: 'Name an heir', minister: 'admin',
    test: (t) => /\b(heir|heiress|successor|disinherit)\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const family = household(w, c);
      if (!family.length) { pl.note('There is no prince or princess of the blood to name.'); return 'The royal house has no children yet.'; }
      const words = new Set(`${t} ${raw}`.toLowerCase().split(/[^\p{L}\p{N}ʻ']+/u));
      const score = (name: string) => name.toLowerCase().split(/[^\p{L}\p{N}ʻ']+/u).filter((x) => x.length > 2 && !HEIR_TITLE_WORDS.has(x) && words.has(x)).length;
      const best = family.map((ch) => ({ ch, n: score(ch.name) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0];
      const byName = best?.ch;
      const kin = (rel: string) => family.filter((ch) => relationTo(w, c, ch) === rel);
      const wanted = /\bdaughter\b/.test(t) ? kin('Daughter') : /\bson\b/.test(t) ? kin('Son') : [];
      const pick = byName ?? (/\byoungest\b/.test(t) ? wanted[wanted.length - 1] : wanted[0]);
      if (!pick) { pl.note(`Name one of the family: ${family.map((ch) => ch.name).join(', ')}.`); return 'Whom shall we proclaim heir?'; }
      pl.add({ type: 'court', kind: 'chooseHeir', character: pick.id });
      return `${pick.name} would be proclaimed heir to the throne.`;
    },
  },
  {
    id: 'marriage', title: 'Arrange a royal marriage', minister: 'foreign',
    test: (t) => /\b(marriage|marry|wed|wedding|betroth|wife|husband|bride|consort)\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const target = matchCountries(w, raw, c)[0];
      if (!target && !consortOf(w, c)) {
        pl.add({ type: 'court', kind: 'findConsort' });
        return 'A match among our own nobility would see the sovereign wed without delay. To bind a foreign house, name it.';
      }
      if (!target) { pl.note('Name the dynasty you wish to marry into.'); return 'With which house?'; }
      pl.add({ type: 'diplomacy', kind: 'marriage', target });
      return `A match with ${countryName(w, target)} would bind our houses.`;
    },
  },
  {
    id: 'nap', title: 'Non-aggression pact', minister: 'foreign',
    test: (t) => /\b(non ?aggression|nonaggression|neutrality pact)\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const target = matchCountries(w, raw, c)[0];
      if (!target) { pl.note('Name the neighbour.'); return 'With whom?'; }
      pl.add({ type: 'diplomacy', kind: 'nap', target });
      return 'A pact would secure that frontier.';
    },
  },
  {
    id: 'guarantee', title: 'Guarantee independence', minister: 'foreign',
    test: (t) => /\b(guarantee|protect the independence|protectorate over)\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const target = matchCountries(w, raw, c)[0];
      if (!target) { pl.note('Name the state to protect.'); return 'Whom should we protect?'; }
      pl.add({ type: 'diplomacy', kind: 'guarantee', target });
      return `Our guarantee would deter those who covet ${countryName(w, target)}.`;
    },
  },
  {
    id: 'relations', title: 'Improve relations', minister: 'foreign',
    test: (t) => /\b(improve|better|warm|mend|repair|cultivate|strengthen|build) (our )?(relations|ties|friendship|standing)\b|\b(befriend|court|woo|placate|appease|reconcile)\b|\brelations with\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const targets = matchCountries(w, raw, c);
      if (!targets.length) { pl.note('Name the court you wish to win over.'); return 'With which court?'; }
      const country = w.countries[c];
      for (const target of targets.slice(0, 3)) {
        if (country.envoys.includes(target)) { pl.note(`An envoy is already at the court of ${countryName(w, target)}.`); continue; }
        pl.add({ type: 'diplomacy', kind: 'envoy', target });
        pl.add({ type: 'diplomacy', kind: 'trade', target }, true);
      }
      if (country.envoys.length >= maxEnvoys(w, c)) pl.note(`All ${maxEnvoys(w, c)} of our envoys are engaged; recall one first.`);
      return 'A resident envoy will improve opinion month by month; a trade agreement would help further.';
    },
  },
  {
    id: 'spy', title: 'Espionage', minister: 'intelligence',
    test: (t) => /\b(spy|spies|espionage|agents?|sabotage|incite|steal (their )?(technology|secrets|plans)|bribe|fabricate|intelligence on)\b/.test(t),
    plan: (w, c, t, pl, raw) => {
      const target = matchCountries(w, raw, c)[0];
      if (!target) { pl.note('Name the target court.'); return 'Whom shall we watch?'; }
      const net = w.countries[c].spy[target] ?? 0;
      const op: SpyOp | null = /sabotage/.test(t) ? 'sabotage' : /incite|unrest|revolt/.test(t) ? 'incite' : /steal|technology|secrets|plans/.test(t) ? 'steal_tech' : /fabricate|claim/.test(t) ? 'fabricate_claim' : /bribe|corrupt/.test(t) ? 'bribe' : /intel|learn|discover|watch/.test(t) ? 'intel' : null;
      if (!op || net < SPY_OPS[op].network) {
        pl.add({ type: 'spyFocus', target, on: true });
        if (op) pl.note(`${SPY_OPS[op].name} needs a network of ${SPY_OPS[op].network}; ours in ${countryName(w, target)} is ${Math.round(net)}. The network grows each month.`);
      }
      if (op) pl.add({ type: 'spyOp', target, op }, net < SPY_OPS[op].network);
      return `My people will begin work in ${countryName(w, target)}.`;
    },
  },
  {
    id: 'corruption', title: 'Reduce corruption', minister: 'admin',
    test: (t) => /\bcorrupt|\bgraft\b|\bembezzl|\bbribery\b/.test(t),
    plan: (w, c, t, pl) => {
      pl.add({ type: 'court', kind: 'anticorruption' });
      const sites = siteCandidates(w, c, 'courthouse').slice(0, 2);
      for (const pid of sites) pl.add({ type: 'build', province: pid, building: 'courthouse' });
      const law = bestLaw(w, c, 'administration', ['bureaucracy']);
      if (law) pl.add({ type: 'enactLaw', category: 'administration', option: law }, true);
      else if (w.countries[c].laws.administration !== 'bureaucracy') pl.note(`A salaried bureaucracy would help in the long run: ${lawBlocker(w, c, 'administration', 'bureaucracy') ?? ''}`.trim());
      pl.add({ type: 'setBudget', administration: 1.3 }, true);
      return `Corruption stands at ${Math.round(w.countries[c].corruption)}. A purge of the worst offices, honest courts and in time a proper civil service will reduce it.`;
    },
  },
  {
    id: 'defence', title: 'Prepare a defensive campaign', minister: 'military',
    test: (t) => /\bdefen[cs]|\bfortif|\bprotect (the |our )?(border|frontier|realm)|\bsecure (the |our )?(border|frontier)|\bprepare (a |for )?(campaign|war|invasion|attack)|\bready (the |our )?(army|defences|defenses)/.test(t),
    plan: (w, c, t, pl) => {
      const threat = mainThreat(w, c);
      const country = w.countries[c];
      const border = threat ? provincesOf(w, c).filter((id) => w.provinces[id].controller === c && neighbors(id).some((n) => w.provinces[n]?.owner === threat)) : [];
      const key = border.sort((x, y) => (w.provinces[y].pop + w.provinces[y].fort * 300) - (w.provinces[x].pop + w.provinces[x].fort * 300));
      for (const pid of key.slice(0, 2)) if (!buildBlocker(w, c, pid, 'fortress')) pl.add({ type: 'build', province: pid, building: 'fortress' });
      const site = recruitSite(w, c);
      if (site) {
        const unit = unitFrom('', c);
        const n = affordableCount(w, c, unit, 4, pl.remaining() * 0.6);
        pl.add({ type: 'recruit', province: site, unit, count: n });
      }
      const army = armiesOf(w, c).filter((a) => a.status === 'idle' && !a.path.length).sort((a, b) => armyRegiments(b) - armyRegiments(a))[0];
      if (army && key[0] && army.location !== key[0]) pl.add({ type: 'moveArmy', army: army.id, target: key[0] });
      const tech = bestTech(w, c, ['military'], ['fortification_science', 'linear_tactics']);
      if (tech && country.research.tech !== tech) pl.add({ type: 'research', tech }, true);
      if (threat) {
        const friend = Object.values(w.countries).filter((x) => x.alive && x.id !== c && x.id !== threat && !x.overlord && neighbourCountries(w, x.id).includes(threat) && opinion(w, x.id, threat) < 0)
          .sort((a, b) => powerScore(w, b.id) - powerScore(w, a.id))[0];
        if (friend) pl.add({ type: 'diplomacy', kind: 'alliance', target: friend.id }, true);
      }
      if (!threat) pl.note('No neighbour presently threatens us; the measures strengthen the capital instead.');
      return threat ? `The danger lies with ${countryName(w, threat)}. We should fortify ${key.length ? listJoin(key.slice(0, 2).map(provinceName)) : 'the frontier'}, raise fresh regiments and post the main army on the border.` : 'We can strengthen our defences.';
    },
  },
  {
    id: 'modernize_army', title: 'Modernise the army', minister: 'military',
    test: (t) => /\b(moderni[sz]e|reform|improve|upgrade|strengthen|professionali[sz]e|train|drill|westerni[sz]e) (the |our )?(army|military|troops|forces|infantry|soldiers)\b|\bmilitary reforms?\b|\barmy reforms?\b/.test(t),
    plan: (w, c, t, pl) => {
      const country = w.countries[c];
      const tech = bestTech(w, c, ['military'], ['flintlock_bayonet', 'linear_tactics', 'field_artillery_reform', 'levee_en_masse', 'divisional_system', 'military_staff']);
      if (tech && country.research.tech !== tech) pl.add({ type: 'research', tech });
      else if (!tech) pl.note('Our scholars have no new military learning within reach; other fields must advance first.');
      const law = bestLaw(w, c, 'military', ['conscription', 'standing_army']);
      if (law) pl.add({ type: 'enactLaw', category: 'military', option: law });
      else if (country.laws.military !== 'standing_army' && country.laws.military !== 'conscription') pl.note(`A standing army: ${lawBlocker(w, c, 'military', 'standing_army') ?? 'not yet possible.'}`);
      const cap = w.countries[c].capital;
      for (const b of ['arsenal', 'barracks'] as BuildingId[]) {
        const site = buildBlocker(w, c, cap, b) ? siteCandidates(w, c, b)[0] : cap;
        if (site) pl.add({ type: 'build', province: site, building: b }, b === 'barracks');
      }
      const site = recruitSite(w, c);
      if (site && country.techs.includes('blast_furnace')) pl.add({ type: 'recruit', province: site, unit: 'artillery', count: affordableCount(w, c, 'artillery', 2, pl.remaining() * 0.5) }, true);
      const leaderless = armiesOf(w, c).find((a) => !a.general && armyRegiments(a) >= 5);
      if (leaderless) pl.add({ type: 'court', kind: 'newGeneral', army: leaderless.id }, true);
      return 'Drill, modern doctrine, our own foundries and trained officers: that is the path.';
    },
  },
  {
    id: 'navy', title: 'Strengthen the navy', minister: 'military',
    test: (t) => /\b(build|expand|strengthen|enlarge|create|launch|commission) (a |the |our )?(navy|fleet|warships|ships|frigates|squadron)\b|\bnaval (expansion|power)\b/.test(t),
    plan: (w, c, t, pl) => {
      const country = w.countries[c];
      const ports = provincesOf(w, c).filter((id) => w.provinces[id].controller === c && isCoastal(id));
      if (!ports.length) { pl.note('We have no coastline.'); return 'We have no coast from which to sail.'; }
      const harbour = ports.find((id) => (w.provinces[id].buildings.port ?? 0) > 0);
      if (!harbour) {
        const site = siteCandidates(w, c, 'port')[0];
        if (site) pl.add({ type: 'build', province: site, building: 'port' });
        pl.note('Warships need a harbour; once it is complete, order ships from the Military panel.');
        return 'First we need a proper harbour.';
      }
      const line = country.techs.includes('ship_of_the_line') && (w.provinces[harbour].buildings.shipyard ?? 0) > 0;
      const n = parseNumber(t) ?? 3;
      pl.add({ type: 'buildShips', province: harbour, ship: line && /\b(line|battleships?|ships of the line)\b/.test(t) ? 'line' : 'frigate', count: Math.max(1, Math.min(10, n)) });
      if (!(w.provinces[harbour].buildings.shipyard ?? 0) && country.techs.includes('ship_of_the_line')) pl.add({ type: 'build', province: harbour, building: 'shipyard' }, true);
      return `The yards at ${provinceName(harbour)} can lay down new hulls.`;
    },
  },
  {
    id: 'recruit', title: 'Raise troops', minister: 'military',
    test: (t) => /\b(recruit|raise|levy|enlist|hire|mobili[sz]e|muster|conscript)\b.*\b(infantry|cavalry|artillery|regiments?|troops|soldiers|men|army|armies|irregulars|warriors|militia|horse|guns|levies|sepoys)\b/.test(t),
    plan: (w, c, t, pl) => {
      const unit = unitFrom(t, c);
      const site = recruitSite(w, c, t, pl);
      if (!site) { pl.note('We hold no province where troops can be raised.'); return 'There is nowhere to raise them.'; }
      const wanted = Math.max(1, Math.min(30, parseNumber(t) ?? 3));
      const n = affordableCount(w, c, unit, wanted, w.countries[c].treasury);
      if (n < wanted) pl.note(`We can afford or man only ${n} of the ${wanted} regiments requested.`);
      pl.add({ type: 'recruit', province: site, unit, count: n });
      return `${n} regiment${n > 1 ? 's' : ''} of ${UNITS[unit].name.toLowerCase()} can be raised at ${provinceName(site)}.`;
    },
  },
  {
    id: 'industrialize', title: 'Industrialise', minister: 'admin',
    test: (t) => /\bindustriali[sz]|\bindustrial (revolution|development|policy)\b|\bmechani[sz]e\b|\bdevelop (our )?industry\b/.test(t),
    plan: (w, c, t, pl) => {
      const country = w.countries[c];
      const tech = bestTech(w, c, ['industry', 'steam', 'metallurgy'], ['spinning_jenny', 'mechanized_spinning', 'coke_smelting', 'power_loom', 'watt_engine', 'factory_system']);
      if (tech && country.research.tech !== tech) pl.add({ type: 'research', tech });
      for (const b of ['textile_mill', 'ironworks', 'steam_works', 'workshop'] as BuildingId[]) {
        const sites = siteCandidates(w, c, b).slice(0, b === 'workshop' ? 2 : 1);
        for (const pid of sites) pl.add({ type: 'build', province: pid, building: b });
        if (pl.steps.filter((s) => s.action.type === 'build').length >= 3) break;
      }
      const econ = bestLaw(w, c, 'economy', ['state_enterprise']);
      if (econ) pl.add({ type: 'enactLaw', category: 'economy', option: econ }, true);
      if (['serfdom', 'slavery'].includes(country.laws.labor)) {
        if (!lawBlocker(w, c, 'labor', 'free_labor')) pl.add({ type: 'enactLaw', category: 'labor', option: 'free_labor' }, true);
        pl.note(`${lawOption('labor', country.laws.labor)?.name} badly hinders factory work.`);
      }
      if (!pl.steps.some((s) => s.action.type === 'build')) pl.note(`Factories need technology and raw materials: ${blockerReasons(w, c, 'textile_mill')}`);
      return 'Machines, mills and engines: other nations are already building them.';
    },
  },
  {
    id: 'tax_reform', title: 'Reform the tax system', minister: 'finance',
    test: (t) => /\b(reform|moderni[sz]e|overhaul|improve|rationali[sz]e|restructure|fix) (the |our )?(tax|taxes|taxation|revenue|fiscal|finances|treasury)( system| administration)?\b|\btax reforms?\b|\bfiscal reforms?\b/.test(t),
    plan: (w, c, t, pl) => {
      const country = w.countries[c];
      const law = bestLaw(w, c, 'taxation', ['income_tax', 'tax_bureau', 'land_revenue']);
      if (law) pl.add({ type: 'enactLaw', category: 'taxation', option: law });
      else pl.note(`Our ${lawOption('taxation', country.laws.taxation)?.name.toLowerCase()} is the best system available to us now.`);
      const tech = !country.techs.includes('cadastral_survey') && !techBlocker(w, c, 'cadastral_survey') ? 'cadastral_survey'
        : !country.techs.includes('modern_statistics') && !techBlocker(w, c, 'modern_statistics') ? 'modern_statistics' : null;
      if (tech && country.research.tech !== tech) pl.add({ type: 'research', tech }, !!law);
      const sites = siteCandidates(w, c, 'courthouse').slice(0, 1);
      for (const pid of sites) pl.add({ type: 'build', province: pid, building: 'courthouse' }, true);
      return 'A better assessment of land and trade will raise revenue without raising rates.';
    },
  },
  {
    id: 'set_tax', title: 'Adjust taxation', minister: 'finance',
    test: (t) => /\b(raise|increase|lower|reduce|cut|set|decrease|ease|lift|hike)\b.*\btax(es|ation| rate)?\b/.test(t) && !/\breform\b/.test(t),
    plan: (w, c, t, pl) => {
      const country = w.countries[c];
      const pct = t.match(/(\d+(?:\.\d+)?)\s*(%|percent|per cent)/);
      const up = /\b(raise|increase|lift|hike)\b/.test(t);
      const target = pct ? parseFloat(pct[1]) / 100 : country.taxRate + (up ? 0.02 : -0.02);
      pl.add({ type: 'setTax', value: Math.max(0.01, Math.min(0.4, target)) });
      return `The rate now stands at ${Math.round(country.taxRate * 100)}%.`;
    },
  },
  {
    id: 'loan', title: 'Raise a loan', minister: 'finance',
    test: (t) => /\b(borrow|loan|raise money|credit)\b/.test(t) && !/\b(repay|pay off|pay back|pay down)\b/.test(t),
    plan: (w, c, t, pl) => {
      const avail = creditAvailable(w, c);
      const amount = parseMoney(t) ?? Math.round(Math.min(avail, Math.max(50, w.countries[c].last.income * 3)));
      pl.add({ type: 'takeLoan', amount: Math.round(amount) });
      return `The bankers will advance up to £${Math.round(avail)}k.`;
    },
  },
  {
    id: 'repay', title: 'Repay debt', minister: 'finance',
    test: (t) => /\b(repay|pay off|pay back|pay down|reduce|clear)\b.*\b(debts?|loans?)\b/.test(t),
    plan: (w, c, t, pl) => {
      const country = w.countries[c];
      const loans = country.loans.slice().sort((a, b) => b.rate - a.rate);
      if (!loans.length) { pl.note('We owe nothing.'); return 'We are free of debt.'; }
      let left = country.treasury;
      for (const l of loans) if (l.principal <= left) { pl.add({ type: 'repayLoan', loanId: l.id }); left -= l.principal; }
      if (!pl.steps.length) pl.note(`Our debts total £${Math.round(totalDebt(w, c))}k; no single loan can be cleared from the treasury.`);
      return 'Clearing the dearest debts first saves the most interest.';
    },
  },
  {
    id: 'stability', title: 'Restore order', minister: 'admin',
    test: (t) => /\b(stabili[sz]e|stability|legitimacy|unrest|revolt|calm|pacify|order|loyalty|popular|festival|celebrat)/.test(t),
    plan: (w, c, t, pl) => {
      const country = w.countries[c];
      pl.add({ type: 'court', kind: 'festival' });
      const restless = provincesOf(w, c).filter((id) => w.provinces[id].unrest > 25 && w.provinces[id].controller === c).sort((x, y) => w.provinces[y].unrest - w.provinces[x].unrest);
      for (const pid of restless.slice(0, 2)) pl.add({ type: 'build', province: pid, building: buildBlocker(w, c, pid, 'temple') ? 'courthouse' : 'temple' });
      if (country.taxRate > 0.1) pl.add({ type: 'setTax', value: Math.max(0.04, country.taxRate - 0.02) }, true);
      if (country.laws.religion === 'state_religion' && !lawBlocker(w, c, 'religion', 'tolerance')) pl.add({ type: 'enactLaw', category: 'religion', option: 'tolerance' }, true);
      return `Stability is ${Math.round(country.stability)} and legitimacy ${Math.round(country.legitimacy)}. Public ceremony and relief for the most restless districts will help.`;
    },
  },
  {
    id: 'food', title: 'Secure the food supply', minister: 'admin',
    test: (t) => /\b(food|famine|hunger|granar|harvest|grain|irrigat|starv)/.test(t),
    plan: (w, c, t, pl) => {
      for (const pid of siteCandidates(w, c, 'granary').slice(0, 2)) pl.add({ type: 'build', province: pid, building: 'granary' });
      for (const pid of siteCandidates(w, c, 'irrigation').slice(0, 1)) pl.add({ type: 'build', province: pid, building: 'irrigation' });
      const tech = bestTech(w, c, ['agriculture']);
      if (tech && w.countries[c].research.tech !== tech) pl.add({ type: 'research', tech }, true);
      return `Our reserves stand at ${w.countries[c].foodStock.toFixed(1)} months.`;
    },
  },
  {
    id: 'education', title: 'Advance learning', minister: 'admin',
    test: (t) => /\b(educat|schools?|universit|science|learning|scholar|research more|academ)/.test(t),
    plan: (w, c, t, pl) => {
      for (const pid of siteCandidates(w, c, 'school').slice(0, 2)) pl.add({ type: 'build', province: pid, building: 'school' });
      const uni = siteCandidates(w, c, 'university')[0];
      if (uni) pl.add({ type: 'build', province: uni, building: 'university' }, true);
      const law = bestLaw(w, c, 'education', ['public_schools', 'court_academies', 'clerical']);
      if (law) pl.add({ type: 'enactLaw', category: 'education', option: law }, true);
      pl.add({ type: 'setBudget', research: 1.5 }, true);
      return 'Schools, a university and a larger research budget will quicken our progress.';
    },
  },
  {
    id: 'economy', title: 'Grow the economy', minister: 'finance',
    test: (t) => /\b(economy|commerce|prosper|wealth|richer|revenue|income|trade)\b/.test(t),
    plan: (w, c, t, pl) => {
      for (const b of ['market', 'road', 'port'] as BuildingId[]) for (const pid of siteCandidates(w, c, b).slice(0, 1)) pl.add({ type: 'build', province: pid, building: b });
      const partners = Object.values(w.countries).filter((x) => x.alive && x.id !== c && neighbourCountries(w, c).includes(x.id) && !alliesOf(w, c).includes(x.id))
        .map((x) => ({ id: x.id, s: evaluateProposal(w, c, x.id, 'trade').score })).sort((a, b) => b.s - a.s).slice(0, 1);
      for (const p of partners) pl.add({ type: 'diplomacy', kind: 'trade', target: p.id }, true);
      const tech = bestTech(w, c, ['commerce']);
      if (tech && w.countries[c].research.tech !== tech) pl.add({ type: 'research', tech }, true);
      return 'Markets, roads and harbours: commerce follows good communications.';
    },
  },
  {
    id: 'enact_law', title: 'Enact a law', minister: 'admin',
    test: (t) => /\b(abolish|enact|adopt|introduce|establish|proclaim|grant|declare|institute)\b/.test(t) && !!lawFromText(t),
    plan: (w, c, t, pl) => {
      const l = lawFromText(t)!;
      pl.add({ type: 'enactLaw', category: l.category, option: l.option });
      return `${lawOption(l.category, l.option)?.name}: ${lawOption(l.category, l.option)?.description}`;
    },
  },
  {
    id: 'research', title: 'Direct research', minister: 'admin',
    test: (t) => /\b(research|study|develop|invest in|pursue|learn|discover|invent)\b/.test(t),
    plan: (w, c, t, pl) => {
      const tech = techFromText(t);
      if (!tech) {
        const cat = (['military', 'industry', 'steam', 'agriculture', 'medicine', 'commerce', 'administration', 'education', 'shipbuilding', 'metallurgy'] as TechCategory[]).find((k) => t.includes(k));
        const pickTech = cat ? bestTech(w, c, [cat]) : null;
        if (pickTech) { pl.add({ type: 'research', tech: pickTech }); return `${TECH_BY_ID[pickTech].name} is the most promising study in that field.`; }
        pl.note('I could not identify that field of learning.');
        return 'Which study do you mean?';
      }
      pl.add({ type: 'research', tech });
      return `${TECH_BY_ID[tech].name}: ${TECH_BY_ID[tech].description}`;
    },
  },
  {
    id: 'build', title: 'Construction', minister: 'admin',
    test: (t) => /\b(build|construct|erect|establish|found|open|set up|lay out|dig|raise|endow|improve)\b/.test(t) && !!buildingFrom(t),
    plan: (w, c, t, pl) => planBuild(w, c, pl, t, buildingFrom(t)!),
  },
];

const LAW_WORDS: [RegExp, LawCategory, string][] = [
  [/\b(abolish|end) (serfdom|slavery|the slave trade|bondage)\b|\bfree labou?r\b|\bemancipat/, 'labor', 'free_labor'],
  [/\bconscription\b|\blevee en masse\b|\bnational service\b/, 'military', 'conscription'],
  [/\bstanding army\b/, 'military', 'standing_army'],
  [/\bfree trade\b/, 'economy', 'free_trade'],
  [/\bmercantilis/, 'economy', 'mercantilism'],
  [/\bstate (enterprise|industry|led)\b/, 'economy', 'state_enterprise'],
  [/\bconstitution/, 'government', 'constitutional_monarchy'],
  [/\brepublic\b/, 'government', 'republic'],
  [/\babsolut/, 'government', 'absolute_monarchy'],
  [/\b(religious )?tolerance\b|\bfreedom of (religion|worship)\b/, 'religion', 'tolerance'],
  [/\bsecular/, 'religion', 'secularism'],
  [/\bstate religion\b|\bestablished church\b/, 'religion', 'state_religion'],
  [/\bpublic (schools|schooling|education)\b|\bcompulsory (schooling|education)\b/, 'education', 'public_schools'],
  [/\bacademies\b/, 'education', 'court_academies'],
  [/\bbureaucra/, 'administration', 'bureaucracy'],
  [/\bfederal/, 'administration', 'federal'],
  [/\bincome tax\b/, 'taxation', 'income_tax'],
  [/\btax bureau\b|\brevenue service\b/, 'taxation', 'tax_bureau'],
];

function lawFromText(t: string): { category: LawCategory; option: string } | null {
  for (const [re, category, option] of LAW_WORDS) if (re.test(t)) return { category, option };
  for (const cat of LAWS) for (const o of cat.options) if (findPhrase(t, normalize(o.name)) >= 0) return { category: cat.id, option: o.id };
  return null;
}

function techFromText(t: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const tech of TECHNOLOGIES) {
    for (const key of [normalize(tech.name), tech.id.replace(/_/g, ' ')]) {
      if (findPhrase(t, key) >= 0 && (!best || key.length > best.len)) best = { id: tech.id, len: key.length };
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function clauses(text: string): string[] {
  return text.split(/[.;!?\n]+|\bthen\b|\band also\b|\balso\b/i).map((s) => s.trim()).filter((s) => s.length > 1);
}

/** Interpret an order. Pure: nothing changes until executePlan() is called. */
export function interpretCommand(w: WorldState, c: string, text: string): CommandPlan {
  const pl = new Planner(w, c);
  const replies: string[] = [];
  const intents: Intent[] = [];
  for (const raw of clauses(text)) {
    const t = normalize(raw);
    const intent = INTENTS.find((i) => i.test(t));
    if (!intent) continue;
    intents.push(intent);
    const reply = intent.plan(w, c, t, pl, raw);
    if (reply) replies.push(reply);
  }
  const lead = intents[0];
  if (!lead) {
    const m = ministerInfo(w, c, 'admin');
    return {
      input: text, understood: false, intent: 'unknown', title: 'Not understood', minister: 'admin', speaker: m.name,
      reply: `${address(w, c)}, forgive me — I do not understand how to carry out that order. The council can act on matters of construction, the army and navy, taxation and loans, laws, research, diplomacy, espionage, war and peace.`,
      steps: [], notes: [`Try, for example: “${COMMAND_EXAMPLES[(w.turn) % COMMAND_EXAMPLES.length]}”`], totals: { treasury: 0, stability: 0, prestige: 0, manpower: 0 },
    };
  }
  const valid = pl.steps.filter((s) => s.preview.valid && !s.optional);
  const totals = { treasury: 0, stability: 0, prestige: 0, manpower: 0 };
  for (const s of valid) {
    totals.treasury += s.preview.cost.treasury ?? 0;
    totals.stability += s.preview.cost.stability ?? 0;
    totals.prestige += s.preview.cost.prestige ?? 0;
    totals.manpower += s.preview.cost.manpower ?? 0;
  }
  const blocked = pl.steps.filter((s) => !s.preview.valid);
  let body = replies.join(' ');
  if (!pl.steps.length && !/regret|cannot|nothing/.test(body)) body += ' There is nothing we can usefully do about it at present.';
  else if (!pl.validCount()) body += ' Unfortunately none of these measures is possible at present.';
  else if (blocked.length) body += ` ${blocked.length === 1 ? 'One measure is' : `${blocked.length} measures are`} not yet possible.`;
  if (totals.treasury > 0) body += ` The cost would be £${Math.round(totals.treasury)}k of our £${Math.round(w.countries[c].treasury)}k.`;
  const m = ministerInfo(w, c, lead.minister);
  return {
    input: text, understood: true, intent: intents.map((i) => i.id).join('+'), title: intents.length > 1 ? intents.map((i) => i.title).join(' · ') : lead.title,
    minister: lead.minister, speaker: m.name, reply: voice(w, c, lead.minister, body.trim(), totals.treasury > w.countries[c].treasury * 0.5),
    steps: pl.steps, notes: pl.notes, totals,
  };
}

/** Executes the selected steps, re-validating each against the current state. */
export function executePlan(w: WorldState, c: string, plan: CommandPlan, selected?: number[]): ActionResult[] {
  const which = selected ?? plan.steps.map((s, i) => (s.preview.valid && !s.optional ? i : -1)).filter((i) => i >= 0);
  const out: ActionResult[] = [];
  for (const i of which) {
    const step = plan.steps[i];
    if (!step) continue;
    out.push(applyAction(w, c, step.action));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Unprompted advice
// ---------------------------------------------------------------------------

export function councilAdvice(w: WorldState, c: string): AdviceItem[] {
  const country = w.countries[c];
  const L = country.last;
  const out: AdviceItem[] = [];
  const say = (role: MinisterRole, text: string, severity: AdviceItem['severity'], command?: string) => {
    const m = ministerInfo(w, c, role);
    out.push({ role, title: m.title, speaker: m.name, personality: m.personalityName, text, command, severity });
  };
  // Finance
  const months = L.balance < 0 ? country.treasury / -L.balance : Infinity;
  if (L.balance < 0 && months < 6) say('finance', `We are spending £${Math.round(-L.balance)}k a month more than we raise; the treasury will be empty in ${Math.max(0, Math.floor(months))} months.`, 'danger', country.taxRate < 0.18 ? `Raise taxes to ${Math.round((country.taxRate + 0.03) * 100)}%` : 'Borrow money');
  else if (L.balance < 0) say('finance', `The budget runs a deficit of £${Math.round(-L.balance)}k a month.`, 'warning', 'Reform the tax system');
  else if (country.treasury > Math.max(80, L.expenses * 10)) say('finance', `The treasury holds £${Math.round(country.treasury)}k — idle money. It could build markets, roads and mills.`, 'opportunity', 'Grow the economy');
  if (L.interest > L.income * 0.25) say('finance', `Interest consumes ${Math.round(L.interest / Math.max(1, L.income) * 100)}% of our revenue.`, 'warning', 'Repay debt');
  if (country.inflation > 15) say('finance', `Inflation of ${Math.round(country.inflation)}% is eroding our revenue.`, 'warning');
  // Foreign
  const threat = mainThreat(w, c);
  const tl = threatLevel(w, c);
  if (threat && tl > 0.8 && !isAtWar(w, c)) say('foreign', `${countryName(w, threat)} is a grave danger to us. We should not stand alone.`, 'warning', `Seek a defensive alliance against ${countryName(w, threat)}`);
  const pending = w.offers.filter((o) => o.to === c);
  if (pending.length) say('foreign', `${pending.length} proposal${pending.length > 1 ? 's' : ''} from foreign courts await${pending.length > 1 ? '' : 's'} an answer.`, 'info');
  if (country.envoys.length < maxEnvoys(w, c)) {
    const cool = neighbourCountries(w, c).filter((o) => opinion(w, c, o) < 0 && !country.envoys.includes(o)).sort((a, b) => powerScore(w, b) - powerScore(w, a))[0];
    if (cool) say('foreign', `Relations with ${countryName(w, cool)} are cold (${Math.round(opinion(w, c, cool))}). An envoy could warm them.`, 'opportunity', `Improve relations with ${countryName(w, cool)}`);
  }
  // Military
  for (const war of warsOf(w, c).slice(0, 2)) {
    const side = sideOf(war, c)!;
    const my = side === 'attackers' ? war.score : -war.score;
    say('military', `${war.name}: war score ${my > 0 ? '+' : ''}${Math.round(my)}. ${my > 25 ? 'We are winning; we can dictate terms.' : my < -25 ? 'We are losing badly; peace may be wise.' : 'The war hangs in the balance.'}`, my < -25 ? 'danger' : 'info', my > 25 || my < -25 ? 'Make peace' : undefined);
  }
  const upkeepShare = L.army / Math.max(1, L.income);
  if (!isAtWar(w, c) && tl > 1 && upkeepShare < 0.3) say('military', 'Our army is too small for the dangers we face.', 'warning', 'Prepare a defensive campaign');
  if (country.laws.military === 'feudal_levies' && !lawBlocker(w, c, 'military', 'standing_army')) say('military', 'Feudal levies are no match for drilled regiments. A standing army is within our reach.', 'opportunity', 'Modernise the army');
  // Administration
  if (country.corruption > 25) say('admin', `Corruption (${Math.round(country.corruption)}) is draining our revenue.`, 'warning', 'Reduce corruption');
  const restless = provincesOf(w, c).filter((id) => w.provinces[id].unrest > 40);
  if (restless.length) say('admin', `Unrest is dangerous in ${listJoin(restless.slice(0, 3).map(provinceName))}.`, restless.some((id) => w.provinces[id].unrest > 60) ? 'danger' : 'warning', 'Restore order');
  if (!country.research.tech) say('admin', 'Our scholars have no direction. Choose a field of research.', 'warning');
  if (country.foodStock < 1) say('admin', 'Our granaries are nearly empty; a bad harvest would mean famine.', 'danger', 'Secure the food supply');
  if (w.construction.filter((k) => k.country === c).length === 0 && country.treasury > 60) say('admin', 'No public works are under way.', 'opportunity', 'Industrialise the economy');
  // Intelligence
  const foreignNets = Object.values(w.countries).filter((x) => x.alive && (x.spy[c] ?? 0) > 30).map((x) => x.id);
  if (foreignNets.length) say('intelligence', `Foreign agents are active among us: ${listJoin(foreignNets.slice(0, 3).map((x) => countryName(w, x)))}.`, 'warning');
  const rival = country.rivals.find((r) => w.countries[r]?.alive && (country.spy[r] ?? 0) < 10);
  if (rival) say('intelligence', `We know little of ${countryName(w, rival)}'s true strength.`, 'opportunity', `Establish a spy network in ${countryName(w, rival)}`);
  const order: AdviceItem['severity'][] = ['danger', 'warning', 'opportunity', 'info'];
  return out.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}

/** Short building catalogue for the command help panel. */
export function buildingKeywords(): string[] {
  return BUILDINGS.map((b) => b.name.toLowerCase());
}

/**
 * Builds a validated plan from actions proposed elsewhere (e.g. by a language model). Each action
 * is previewed against the real state; nothing proposed can bypass the rules or spend money twice.
 */
export function planFromActions(
  w: WorldState, c: string, input: string, opts: { title: string; minister: MinisterRole; reply: string; notes?: string[] },
  actions: { action: GameAction; optional?: boolean }[],
): CommandPlan {
  const pl = new Planner(w, c);
  for (const a of actions) pl.add(a.action, a.optional);
  for (const n of opts.notes ?? []) pl.note(n);
  const totals = { treasury: 0, stability: 0, prestige: 0, manpower: 0 };
  for (const s of pl.steps) {
    if (!s.preview.valid || s.optional) continue;
    totals.treasury += s.preview.cost.treasury ?? 0;
    totals.stability += s.preview.cost.stability ?? 0;
    totals.prestige += s.preview.cost.prestige ?? 0;
    totals.manpower += s.preview.cost.manpower ?? 0;
  }
  const m = ministerInfo(w, c, opts.minister);
  return { input, understood: pl.steps.length > 0, intent: 'llm', title: opts.title, minister: opts.minister, speaker: m.name, reply: opts.reply, steps: pl.steps, notes: pl.notes, totals };
}
