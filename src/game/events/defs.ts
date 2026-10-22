// The event library. Events respond to the state of the world: their monthly chance is
// computed from conditions, and nothing fires on a fixed historical schedule.
import { INSTITUTION_FACTOR } from '../../data/technologies';
import { REBELS, RELIGION_GROUP } from '../constants';
import { borders, powerScore } from '../war';
import { pick, weightedPick } from '../rng';
import {
  armyRegiments, countryName, def, isAtWar, isMonarchy, isRepublic, month, opinion, provinceName, provincesOf, year, warsOf, hasTreaty, neighbourCountries,
  armiesOf,
} from '../state';
import { PROVINCE_DEFS, neighbors } from '../static';
import { isInstitution } from '../society';
import type { Effect } from './effects';
import { rulerAge } from './effects';
import type { WorldState } from '../types';

export type Illustration =
  | 'palace' | 'battle' | 'marriage' | 'discovery' | 'revolution' | 'disaster' | 'famine' | 'epidemic' | 'summit' | 'construction'
  | 'treaty' | 'trade' | 'religion' | 'industry' | 'council' | 'fleet';

export type Ctx = Record<string, string | number>;

export interface EventOption {
  id: string;
  label: string;
  effects: (w: WorldState, c: string, ctx: Ctx) => Effect[];
  ai: (w: WorldState, c: string, ctx: Ctx) => number;
  requires?: (w: WorldState, c: string, ctx: Ctx) => boolean;
  hint?: string;
}

export interface EventDef {
  id: string;
  category: string;
  title: string;
  art: Illustration;
  major?: boolean;
  chance: (w: WorldState, c: string) => number;
  setup?: (w: WorldState, c: string) => Ctx | null;
  text: (w: WorldState, c: string, ctx: Ctx) => string;
  options: EventOption[];
  cooldown?: number;
  once?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const inc = (w: WorldState, c: string, mult: number) => -Math.round(Math.max(5, w.countries[c].last.income) * mult);
const gain = (w: WorldState, c: string, mult: number) => Math.round(Math.max(5, w.countries[c].last.income) * mult);
const ruler = (w: WorldState, c: string) => w.characters[w.countries[c].rulerId];
const heirOk = (w: WorldState, c: string) => { const h = w.countries[c].heirId; return !!h && !!w.characters[h]?.alive; };
const heirAge = (w: WorldState, c: string) => { const h = w.characters[w.countries[c].heirId ?? '']; return h ? year(w) - h.born : -1; };
const faction = (w: WorldState, c: string, f: keyof WorldState['countries'][string]['factions']) => w.countries[c].factions[f];
const always = () => 1;

function provinceWhere(w: WorldState, c: string, pred: (id: string) => boolean, weight: (id: string) => number = () => 1): string | null {
  const list = provincesOf(w, c).filter(pred);
  if (!list.length) return null;
  return weightedPick(w, list, weight) ?? null;
}

const WESTERN_PROFILES = ['britain', 'western_europe', 'central_europe', 'usa'];
const INDIGENOUS = (c: string) => def(c).cultureGroup === 'indigenous_american';
const COLONIAL_POWERS = ['usa', 'new_spain', 'british_north_america', 'spanish_louisiana', 'russian_american_company', 'rio_de_la_plata', 'chile', 'brazil', 'cuba'];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
export const EVENTS: EventDef[] = [
  {
    id: 'succession_crisis', category: 'Royal Court', title: 'An Unexpected Succession', art: 'palace', major: true, cooldown: 60,
    chance: (w, c) => {
      const r = ruler(w, c);
      if (!isMonarchy(w, c) || !r || isInstitution(w, r)) return 0;
      const old = rulerAge(w, c) > 58 || r.health < 35;
      return old && (!heirOk(w, c) || heirAge(w, c) < 16) ? 0.02 : 0;
    },
    text: (w, c) => `The health of ${ruler(w, c).name} has deteriorated. Powerful factions are already manoeuvring around the succession${heirOk(w, c) ? `, and many whisper that ${w.characters[w.countries[c].heirId!].name} is too young to rule` : ', for there is no designated heir'}.`,
    options: [
      { id: 'heir', label: 'Appoint the designated heir', effects: (w, c) => heirOk(w, c) ? [{ k: 'legitimacy', v: 6 }, { k: 'faction', f: 'nobility', loyalty: -5 }] : [{ k: 'newHeir', adult: true }, { k: 'legitimacy', v: -4 }, { k: 'stability', v: -3 }], ai: always },
      { id: 'council', label: 'Convene the royal council', effects: () => [{ k: 'newHeir', adult: true }, { k: 'stability', v: 5 }, { k: 'legitimacy', v: -5 }, { k: 'faction', f: 'nobility', influence: 5 }, { k: 'corruption', v: 3 }], ai: always },
      { id: 'claimants', label: 'Negotiate with rival claimants', effects: (w, c) => [{ k: 'newHeir', adult: true }, { k: 'treasury', v: inc(w, c, 3) }, { k: 'stability', v: 3 }, { k: 'faction', f: 'nobility', loyalty: 10 }], ai: (w, c) => w.countries[c].treasury > w.countries[c].last.income * 4 ? 1.5 : 0.2 },
      { id: 'delay', label: 'Delay the decision', effects: () => [{ k: 'stability', v: -5 }], ai: () => 0.3, hint: 'The crisis may return.' },
    ],
  },
  {
    id: 'ruler_illness', category: 'Royal Court', title: 'The Sovereign Falls Ill', art: 'palace',
    chance: (w, c) => { const r = ruler(w, c); return r && !isInstitution(w, r) && (rulerAge(w, c) > 50 || r.health < 50) ? 0.008 : 0; },
    text: (w, c) => `${ruler(w, c).name} has taken to bed with a fever. Physicians disagree; courtiers watch the heir.`,
    options: [
      { id: 'physicians', label: 'Summon the finest physicians', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 1) }, { k: 'rulerHealth', v: 15 }], ai: always },
      { id: 'regency', label: 'Appoint a temporary regency', effects: () => [{ k: 'stability', v: 3 }, { k: 'legitimacy', v: -8 }, { k: 'rulerHealth', v: 5 }], ai: always },
      { id: 'providence', label: 'Trust in providence', effects: () => [{ k: 'rulerHealth', v: -10 }, { k: 'faction', f: 'clergy', loyalty: 5 }], ai: () => 0.4 },
    ],
  },
  {
    id: 'heir_born', category: 'Royal Court', title: 'An Heir Is Born', art: 'palace', cooldown: 36,
    chance: (w, c) => isMonarchy(w, c) && !heirOk(w, c) && !isInstitution(w, ruler(w, c)) && rulerAge(w, c) >= 18 && rulerAge(w, c) <= 52 ? 0.015 : 0,
    text: (w, c) => `Bells ring across ${countryName(w, c)}: the royal house has an heir.`,
    options: [
      { id: 'celebrate', label: 'Proclaim public festivities', effects: (w, c) => [{ k: 'newHeir' }, { k: 'treasury', v: inc(w, c, 0.5) }, { k: 'legitimacy', v: 8 }], ai: always },
      { id: 'quiet', label: 'Give quiet thanks', effects: () => [{ k: 'newHeir' }, { k: 'legitimacy', v: 4 }, { k: 'faction', f: 'clergy', loyalty: 3 }], ai: always },
    ],
  },
  {
    id: 'marriage_proposal', category: 'Royal Marriage', title: 'A Proposal of Marriage', art: 'marriage', cooldown: 60,
    chance: (w, c) => isMonarchy(w, c) ? 0.006 : 0,
    setup: (w, c) => {
      const cands = Object.values(w.countries).filter((o) => o.alive && o.id !== c && isMonarchy(w, o.id) && !hasTreaty(w, 'marriage', c, o.id) && opinion(w, c, o.id) > -10
        && (borders(w, c, o.id) || powerScore(w, o.id) > 150) && RELIGION_GROUP[def(o.id).religion] === RELIGION_GROUP[def(c).religion]);
      const t = weightedPick(w, cands, (o) => 1 + powerScore(w, o.id) / 100);
      return t ? { target: t.id } : null;
    },
    text: (w, c, ctx) => `Envoys of ${countryName(w, ctx.target as string)} propose a marriage between our royal houses. Such a match would bind our dynasties and our policies.`,
    options: [
      { id: 'accept', label: 'Accept the match', effects: (w, c, ctx) => [{ k: 'treaty', type: 'marriage', target: ctx.target as string }, { k: 'relation', target: ctx.target as string, v: 25 }, { k: 'legitimacy', v: 5 }], ai: (w, c, ctx) => 1 + opinion(w, c, ctx.target as string) / 50 },
      { id: 'decline', label: 'Decline politely', effects: (w, c, ctx) => [{ k: 'relation', target: ctx.target as string, v: -10 }], ai: () => 0.4 },
      { id: 'better', label: 'Hold out for a grander match', effects: (w, c, ctx) => [{ k: 'relation', target: ctx.target as string, v: -20 }, { k: 'prestige', v: 2 }], ai: () => 0.2 },
    ],
  },
  {
    id: 'regency_struggle', category: 'Royal Court', title: 'Struggle for the Regency', art: 'council', cooldown: 48,
    chance: (w, c) => isMonarchy(w, c) && !isInstitution(w, ruler(w, c)) && rulerAge(w, c) < 16 ? 0.02 : 0,
    text: (w, c) => `${ruler(w, c).name} is a child. The queen mother, the great ministers and the princes of the blood each claim the right to govern in the sovereign's name.`,
    options: [
      { id: 'mother', label: 'Back the queen mother', effects: () => [{ k: 'stability', v: 5 }, { k: 'faction', f: 'nobility', loyalty: -10 }], ai: always },
      { id: 'ministers', label: 'Back the ministers', effects: () => [{ k: 'corruption', v: 5 }, { k: 'stability', v: 3 }, { k: 'faction', f: 'reformers', loyalty: 5 }], ai: always },
      { id: 'princes', label: 'Back the princes of the blood', effects: () => [{ k: 'faction', f: 'nobility', loyalty: 12 }, { k: 'legitimacy', v: -6 }], ai: always },
    ],
  },
  {
    id: 'coup_attempt', category: 'Conspiracy', title: 'Officers Conspire', art: 'revolution', major: true, cooldown: 60,
    chance: (w, c) => { const f = faction(w, c, 'military'); return f.influence >= 18 && f.loyalty < 35 ? 0.02 : 0; },
    text: (w, c) => `Disaffected officers meet by night. Pay is late, promotions go to favourites, and some speak openly of marching on ${provinceName(w.countries[c].capital)}.`,
    options: [
      { id: 'purge', label: 'Purge the conspirators', effects: () => [{ k: 'armyMorale', v: -0.25 }, { k: 'faction', f: 'military', loyalty: 5, influence: -6 }, { k: 'stability', v: -5 }], ai: always },
      { id: 'pay', label: 'Pay arrears and promote the loyal', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'faction', f: 'military', loyalty: 25 }], ai: (w, c) => w.countries[c].treasury > w.countries[c].last.income * 3 ? 2 : 0.3 },
      { id: 'yield', label: 'Give the army a voice in government', effects: () => [{ k: 'faction', f: 'military', loyalty: 18, influence: 8 }, { k: 'legitimacy', v: -8 }, { k: 'faction', f: 'reformers', loyalty: -8 }], ai: always },
    ],
  },
  {
    id: 'noble_conspiracy', category: 'Conspiracy', title: 'The Great Families Conspire', art: 'council', cooldown: 60,
    chance: (w, c) => { const f = faction(w, c, 'nobility'); return f.influence >= 18 && f.loyalty < 35 ? 0.018 : 0; },
    text: () => 'Letters intercepted by our agents reveal that leading noble houses are coordinating their resistance to the crown.',
    options: [
      { id: 'arrest', label: 'Arrest the ringleaders', effects: () => [{ k: 'faction', f: 'nobility', loyalty: -12, influence: -5 }, { k: 'stability', v: -5 }, { k: 'legitimacy', v: 4 }], ai: always },
      { id: 'bribe', label: 'Buy their loyalty', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'faction', f: 'nobility', loyalty: 20 }], ai: always },
      { id: 'privileges', label: 'Confirm their ancient privileges', effects: () => [{ k: 'taxRate', v: -0.02 }, { k: 'faction', f: 'nobility', loyalty: 15 }, { k: 'corruption', v: 5 }], ai: always },
    ],
  },
  {
    id: 'favourite_corruption', category: 'Royal Court', title: 'The Favourite\'s Fortune', art: 'palace', cooldown: 48,
    chance: (w, c) => w.countries[c].corruption > 40 ? 0.015 : 0,
    text: () => 'A court favourite has amassed a fortune from monopolies, contracts and sold offices. Honest officials resign in disgust.',
    options: [
      { id: 'purge', label: 'Disgrace the favourite and seize his wealth', effects: (w, c) => [{ k: 'corruption', v: -10 }, { k: 'treasury', v: gain(w, c, 1) }, { k: 'faction', f: 'nobility', loyalty: -5 }], ai: always },
      { id: 'tolerate', label: 'Look the other way', effects: () => [{ k: 'corruption', v: 4 }, { k: 'stability', v: 2 }], ai: () => 0.5 },
    ],
  },
  {
    id: 'ministers_quarrel', category: 'Royal Council', title: 'The Ministers Quarrel', art: 'council', cooldown: 36,
    chance: (w, c) => isAtWar(w, c) || w.countries[c].last.balance < 0 ? 0.008 : 0.003,
    text: () => 'The Finance Minister and the Commander-in-Chief clash in council over the budget. Each threatens to resign.',
    options: [
      { id: 'treasury', label: 'Side with the treasury', effects: (w, c) => [{ k: 'treasury', v: gain(w, c, 1) }, { k: 'faction', f: 'military', loyalty: -8 }], ai: always },
      { id: 'army', label: 'Side with the army', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 0.8) }, { k: 'manpower', v: Math.max(1, w.countries[c].manpower * 0.15) }, { k: 'faction', f: 'military', loyalty: 10 }, { k: 'faction', f: 'merchants', loyalty: -6 }], ai: always },
      { id: 'both', label: 'Dismiss them both', effects: () => [{ k: 'stability', v: -3 }, { k: 'corruption', v: -3 }], ai: () => 0.4 },
    ],
  },
  {
    id: 'peasant_revolt', category: 'Revolt', title: 'The Countryside Rises', art: 'revolution', major: true, cooldown: 24,
    chance: (w, c) => provincesOf(w, c).some((id) => w.provinces[id].unrest > 48 && w.provinces[id].controller !== REBELS) ? 0.025 : 0,
    setup: (w, c) => { const p = provinceWhere(w, c, (id) => w.provinces[id].unrest > 48, (id) => w.provinces[id].unrest); return p ? { province: p } : null; },
    text: (w, c, ctx) => `Villagers in ${provinceName(ctx.province as string)} have driven off tax collectors and burned the registers. They demand justice and lower dues.`,
    options: [
      { id: 'crush', label: 'Crush them with force', effects: (w, c, ctx) => [{ k: 'rebels', province: ctx.province as string, cause: 'Peasant rebels', size: 0.8 }, { k: 'faction', f: 'commons', loyalty: -10 }, { k: 'faction', f: 'nobility', loyalty: 5 }], ai: (w, c) => (w.countries[c].factions.military.loyalty > 50 ? 1 : 0.4) },
      { id: 'concede', label: 'Grant tax remissions', effects: (w, c, ctx) => [{ k: 'taxRate', v: -0.02 }, { k: 'unrest', v: -25, province: ctx.province as string }, { k: 'faction', f: 'commons', loyalty: 10 }, { k: 'faction', f: 'nobility', loyalty: -5 }], ai: always },
      { id: 'negotiate', label: 'Send a royal commissioner', effects: (w, c, ctx) => [{ k: 'treasury', v: inc(w, c, 1) }, { k: 'unrest', v: -15, province: ctx.province as string }], ai: always },
    ],
  },
  {
    id: 'separatists', category: 'Revolt', title: 'Separatist Agitation', art: 'revolution', cooldown: 60,
    chance: (w, c) => provincesOf(w, c).some((id) => w.provinces[id].culture !== def(c).culture && w.provinces[id].unrest > 30) ? 0.008 : 0,
    setup: (w, c) => { const p = provinceWhere(w, c, (id) => w.provinces[id].culture !== def(c).culture && w.provinces[id].unrest > 30, (id) => w.provinces[id].unrest); return p ? { province: p, culture: w.provinces[p].culture } : null; },
    text: (w, c, ctx) => `${ctx.culture} notables in ${provinceName(ctx.province as string)} demand their own laws, language and governors.`,
    options: [
      { id: 'repress', label: 'Repress the agitators', effects: (w, c, ctx) => [{ k: 'unrest', v: 12, province: ctx.province as string }, { k: 'stability', v: 1 }], ai: () => 0.6 },
      { id: 'autonomy', label: 'Grant local autonomy', effects: (w, c, ctx) => [{ k: 'unrest', v: -25, province: ctx.province as string }, { k: 'stability', v: -2 }, { k: 'gdp', v: -0.03, province: ctx.province as string }], ai: always },
      { id: 'patronage', label: 'Patronise their culture', effects: (w, c, ctx) => [{ k: 'treasury', v: inc(w, c, 0.8) }, { k: 'unrest', v: -12, province: ctx.province as string }], ai: always },
    ],
  },
  {
    id: 'colonial_autonomy', category: 'Colonial Politics', title: 'The Colonial Juntas', art: 'council', cooldown: 48,
    chance: (w, c) => { const cc = w.countries[c]; return cc.overlord && (def(c).polityType === 'colony') && cc.liberty > 45 ? 0.012 : 0; },
    text: (w, c) => `Criollo merchants and landowners in ${countryName(w, c)} resent peninsular officials and trade restrictions imposed from ${countryName(w, w.countries[c].overlord!)}.`,
    options: [
      { id: 'petition', label: 'Petition the crown for free trade', effects: (w, c) => [{ k: 'liberty', v: 10 }, { k: 'relation', target: w.countries[c].overlord!, v: -10 }, { k: 'faction', f: 'merchants', loyalty: 10 }], ai: always },
      { id: 'loyal', label: 'Issue a loyal address', effects: () => [{ k: 'liberty', v: -10 }, { k: 'legitimacy', v: 5 }], ai: always },
      { id: 'juntas', label: 'Quietly encourage the juntas', effects: () => [{ k: 'liberty', v: 20 }, { k: 'faction', f: 'reformers', loyalty: 15 }, { k: 'stability', v: -3 }], ai: (w, c) => w.countries[c].liberty / 50 },
    ],
  },
  {
    id: 'religious_revival', category: 'Religion', title: 'A Religious Revival', art: 'religion', cooldown: 72,
    chance: (w, c) => w.countries[c].laws.religion === 'state_religion' ? 0.005 : 0.002,
    text: () => 'Itinerant preachers and holy men draw great crowds. The faithful demand that the state champion true religion.',
    options: [
      { id: 'endow', label: 'Endow new foundations', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 1) }, { k: 'faction', f: 'clergy', loyalty: 15 }, { k: 'legitimacy', v: 5 }, { k: 'unrest', v: -4 }], ai: always },
      { id: 'restrain', label: 'Restrain the zealots', effects: () => [{ k: 'faction', f: 'clergy', loyalty: -10 }, { k: 'faction', f: 'reformers', loyalty: 5 }, { k: 'stability', v: -2 }], ai: () => 0.5 },
    ],
  },
  {
    id: 'reform_movement', category: 'Politics', title: 'Clubs and Pamphlets', art: 'council', cooldown: 48,
    chance: (w, c) => { const f = faction(w, c, 'reformers'); return f.influence >= 8 && f.loyalty < 50 ? 0.01 : 0; },
    text: () => 'Reading societies, Masonic lodges and coffee houses buzz with talk of constitutions, rational administration and the rights of man.',
    options: [
      { id: 'promise', label: 'Promise reforms', effects: () => [{ k: 'faction', f: 'reformers', loyalty: 15 }, { k: 'faction', f: 'nobility', loyalty: -8 }], ai: (w, c) => def(c).personality.reform * 2 },
      { id: 'censor', label: 'Impose censorship', effects: () => [{ k: 'faction', f: 'reformers', loyalty: -15 }, { k: 'stability', v: 2 }, { k: 'modifier', mod: { id: 'censorship', label: 'Censorship', monthsLeft: 36, research: -0.08 } }], ai: always },
      { id: 'engage', label: 'Invite the reformers into government', effects: () => [{ k: 'faction', f: 'reformers', loyalty: 10, influence: 5 }, { k: 'modifier', mod: { id: 'enlightened_ministers', label: 'Enlightened ministers', monthsLeft: 36, research: 0.08 } }, { k: 'faction', f: 'clergy', loyalty: -6 }], ai: (w, c) => def(c).personality.reform * 1.5 },
    ],
  },
  {
    id: 'crop_failure', category: 'Disaster', title: 'The Harvest Fails', art: 'famine', cooldown: 24,
    chance: (w, c) => (month(w) >= 6 && month(w) <= 9 ? 0.012 : 0.002),
    text: () => 'Drought and blight have ruined the harvest across several provinces. Grain prices double in the markets.',
    options: [
      { id: 'granaries', label: 'Open the public granaries', effects: (w, c) => [{ k: 'foodStock', v: -0.8 }, { k: 'treasury', v: inc(w, c, 0.5) }, { k: 'unrest', v: -3 }], ai: always },
      { id: 'import', label: 'Import grain at any price', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'foodStock', v: 1 }], ai: (w, c) => w.countries[c].treasury > w.countries[c].last.income * 3 ? 1.5 : 0.3 },
      { id: 'endure', label: 'The people must endure', effects: () => [{ k: 'foodStock', v: -1.5 }, { k: 'unrest', v: 8 }, { k: 'pop', v: -0.004 }], ai: () => 0.4 },
    ],
  },
  {
    id: 'famine', category: 'Disaster', title: 'Famine', art: 'famine', major: true, cooldown: 12,
    chance: (w, c) => (w.countries[c].foodStock < 0.3 ? 0.2 : 0),
    text: () => 'The granaries are empty. Families eat seed corn and bark; the roads fill with the starving.',
    options: [
      { id: 'relief', label: 'Organise famine relief', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 3) }, { k: 'pop', v: -0.005 }, { k: 'foodStock', v: 1 }, { k: 'legitimacy', v: 4 }], ai: always },
      { id: 'requisition', label: 'Requisition grain for the cities and army', effects: () => [{ k: 'unrest', v: 15 }, { k: 'pop', v: -0.01 }, { k: 'faction', f: 'commons', loyalty: -15 }, { k: 'faction', f: 'military', loyalty: 5 }], ai: () => 0.5 },
      { id: 'nothing', label: 'Do nothing', effects: () => [{ k: 'pop', v: -0.02 }, { k: 'unrest', v: 20 }, { k: 'legitimacy', v: -10 }], ai: () => 0.1 },
    ],
  },
  {
    id: 'epidemic', category: 'Disaster', title: 'Pestilence', art: 'epidemic', major: true, cooldown: 36,
    chance: (w, c) => (w.countries[c].techs.includes('vaccination') ? 0.002 : 0.006),
    setup: (w, c) => { const p = provinceWhere(w, c, () => true, (id) => w.provinces[id].pop); return p ? { province: p } : null; },
    text: (w, c, ctx) => `Smallpox and fever spread from ${provinceName(ctx.province as string)}. Physicians counsel quarantine; priests counsel prayer.`,
    options: [
      { id: 'quarantine', label: 'Impose a strict quarantine', effects: (w, c, ctx) => [{ k: 'pop', v: -0.01, province: ctx.province as string }, { k: 'modifier', mod: { id: 'quarantine', label: 'Quarantine', monthsLeft: 6, trade: -0.15 } }], ai: always },
      { id: 'inoculate', label: 'Launch an inoculation campaign', requires: (w, c) => w.countries[c].techs.includes('inoculation') || w.countries[c].techs.includes('vaccination'), effects: (w, c, ctx) => [{ k: 'treasury', v: inc(w, c, 1) }, { k: 'pop', v: -0.003, province: ctx.province as string }, { k: 'legitimacy', v: 3 }], ai: () => 2 },
      { id: 'pray', label: 'Order public prayers', effects: (w, c, ctx) => [{ k: 'pop', v: -0.03, province: ctx.province as string }, { k: 'pop', v: -0.003 }, { k: 'faction', f: 'clergy', loyalty: 5 }], ai: () => 0.4 },
    ],
  },
  {
    id: 'monsoon_failure', category: 'Disaster', title: 'The Monsoon Fails', art: 'famine', major: true, cooldown: 48,
    chance: (w, c) => (def(c).region === 'South Asia' && month(w) >= 6 && month(w) <= 8 ? 0.012 : 0),
    text: () => 'The rains have not come. Tanks and wells run dry and the kharif crop withers in the fields.',
    options: [
      { id: 'remit', label: 'Remit the land revenue', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'foodStock', v: -1 }, { k: 'faction', f: 'commons', loyalty: 10 }], ai: always },
      { id: 'works', label: 'Begin relief works (tanks and canals)', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 3) }, { k: 'foodStock', v: -0.5 }, { k: 'gdp', v: 0.01 }], ai: always },
      { id: 'collect', label: 'Collect the revenue regardless', effects: () => [{ k: 'foodStock', v: -2 }, { k: 'unrest', v: 15 }, { k: 'pop', v: -0.01 }], ai: () => 0.3 },
    ],
  },
  {
    id: 'great_flood', category: 'Disaster', title: 'The River Breaks Its Banks', art: 'disaster', cooldown: 36,
    chance: (w, c) => (provincesOf(w, c).some((id) => ['farmland', 'marsh'].includes(PROVINCE_DEFS[id].terrain)) ? 0.004 : 0),
    setup: (w, c) => { const p = provinceWhere(w, c, (id) => ['farmland', 'marsh'].includes(PROVINCE_DEFS[id].terrain), (id) => w.provinces[id].pop); return p ? { province: p } : null; },
    text: (w, c, ctx) => `Floods have swept across ${provinceName(ctx.province as string)}, drowning villages and fields.`,
    options: [
      { id: 'dikes', label: 'Rebuild the dikes properly', effects: (w, c, ctx) => [{ k: 'devastation', v: 10, province: ctx.province as string }, { k: 'treasury', v: inc(w, c, 1.5) }], ai: always },
      { id: 'relief', label: 'Distribute relief only', effects: (w, c, ctx) => [{ k: 'devastation', v: 20, province: ctx.province as string }, { k: 'treasury', v: inc(w, c, 0.5) }, { k: 'unrest', v: -5, province: ctx.province as string }], ai: always },
      { id: 'nothing', label: 'Leave it to the locals', effects: (w, c, ctx) => [{ k: 'devastation', v: 28, province: ctx.province as string }, { k: 'pop', v: -0.01, province: ctx.province as string }, { k: 'unrest', v: 10, province: ctx.province as string }], ai: () => 0.3 },
    ],
  },
  {
    id: 'earthquake', category: 'Disaster', title: 'Earthquake', art: 'disaster', cooldown: 60,
    chance: (w, c) => (['Middle East', 'East Asia', 'South America', 'Mexico & Central America', 'Italy'].includes(def(c).region) ? 0.002 : 0.0004),
    setup: (w, c) => { const p = provinceWhere(w, c, (id) => ['mountains', 'hills'].includes(PROVINCE_DEFS[id].terrain), (id) => w.provinces[id].pop); return p ? { province: p } : null; },
    text: (w, c, ctx) => `The earth has shaken ${provinceName(ctx.province as string)}. Churches, temples and houses lie in ruins.`,
    options: [
      { id: 'rebuild', label: 'Rebuild at the state\'s expense', effects: (w, c, ctx) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'devastation', v: 10, province: ctx.province as string }, { k: 'legitimacy', v: 3 }], ai: always },
      { id: 'pray', label: 'Proclaim days of penitence', effects: (w, c, ctx) => [{ k: 'devastation', v: 25, province: ctx.province as string }, { k: 'pop', v: -0.01, province: ctx.province as string }, { k: 'faction', f: 'clergy', loyalty: 5 }], ai: always },
    ],
  },
  {
    id: 'trade_boom', category: 'Economy', title: 'A Commercial Boom', art: 'trade', cooldown: 36,
    chance: (w, c) => (w.countries[c].cycle > 0.45 ? 0.02 : 0),
    text: () => 'Warehouses overflow, freight rates soar and new merchant houses open every week.',
    options: [
      { id: 'tax', label: 'Levy a windfall tax', effects: (w, c) => [{ k: 'treasury', v: gain(w, c, 1.5) }, { k: 'faction', f: 'merchants', loyalty: -6 }], ai: always },
      { id: 'reinvest', label: 'Encourage reinvestment', effects: () => [{ k: 'modifier', mod: { id: 'boom', label: 'Commercial boom', monthsLeft: 24, trade: 0.1 } }, { k: 'faction', f: 'merchants', loyalty: 8 }], ai: always },
    ],
  },
  {
    id: 'financial_panic', category: 'Economy', title: 'Panic on the Exchange', art: 'trade', major: true, cooldown: 48,
    chance: (w, c) => {
      const cc = w.countries[c];
      const debt = cc.loans.reduce((s, l) => s + l.principal, 0);
      return cc.cycle < -0.3 && debt > cc.last.income * 24 ? 0.025 : 0;
    },
    text: () => 'A great banking house has suspended payments. Creditors besiege the counting houses and the state\'s paper falls in value.',
    options: [
      { id: 'bailout', label: 'Rescue the banks', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'stability', v: 3 }, { k: 'faction', f: 'merchants', loyalty: 10 }], ai: always },
      { id: 'fail', label: 'Let them fail', effects: () => [{ k: 'stability', v: -8 }, { k: 'faction', f: 'merchants', loyalty: -15 }, { k: 'modifier', mod: { id: 'recession', label: 'Recession', monthsLeft: 18, trade: -0.12 } }], ai: always },
      { id: 'debase', label: 'Issue paper money', effects: (w, c) => [{ k: 'treasury', v: gain(w, c, 2) }, { k: 'inflation', v: 6 }], ai: always },
    ],
  },
  {
    id: 'merchant_petition', category: 'Economy', title: 'The Merchants Petition', art: 'trade', cooldown: 48,
    chance: (w, c) => (faction(w, c, 'merchants').influence >= 12 ? 0.008 : 0),
    text: () => 'The chambers of commerce present a petition on tariffs, monopolies and the protection of shipping.',
    options: [
      { id: 'lower', label: 'Lower tariffs', effects: () => [{ k: 'tariff', v: -0.03 }, { k: 'faction', f: 'merchants', loyalty: 12 }], ai: (w, c) => def(c).personality.mercantile * 2 },
      { id: 'raise', label: 'Protect home industry with higher duties', effects: () => [{ k: 'tariff', v: 0.03 }, { k: 'faction', f: 'merchants', loyalty: -5 }, { k: 'faction', f: 'nobility', loyalty: 4 }], ai: always },
      { id: 'charter', label: 'Charter a trading company', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 1) }, { k: 'modifier', mod: { id: 'company', label: 'Chartered trading company', monthsLeft: 60, trade: 0.08 } }], ai: always },
    ],
  },
  {
    id: 'smuggling', category: 'Economy', title: 'Smugglers on Every Coast', art: 'trade', cooldown: 36,
    chance: (w, c) => (w.countries[c].tariff > 0.15 ? 0.012 : 0),
    text: () => 'High duties have made smuggling the most profitable trade in the realm.',
    options: [
      { id: 'coastguard', label: 'Fund a coast guard', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 1) }, { k: 'corruption', v: -3 }], ai: always },
      { id: 'amnesty', label: 'Lower duties and grant an amnesty', effects: () => [{ k: 'tariff', v: -0.04 }, { k: 'faction', f: 'merchants', loyalty: 8 }], ai: always },
      { id: 'ignore', label: 'Ignore it', effects: () => [{ k: 'corruption', v: 5 }], ai: () => 0.4 },
    ],
  },
  {
    id: 'mineral_discovery', category: 'Discovery', title: 'Rich Seams Discovered', art: 'discovery', cooldown: 120,
    chance: () => 0.0015,
    setup: (w, c) => { const p = provinceWhere(w, c, (id) => ['hills', 'mountains'].includes(PROVINCE_DEFS[id].terrain)); return p ? { province: p } : null; },
    text: (w, c, ctx) => `Prospectors report rich mineral deposits in ${provinceName(ctx.province as string)}.`,
    options: [
      { id: 'develop', label: 'Develop them under state direction', effects: (w, c, ctx) => [{ k: 'treasury', v: inc(w, c, 1) }, { k: 'gdp', v: 0.12, province: ctx.province as string }], ai: always },
      { id: 'lease', label: 'Lease the rights to private investors', effects: (w, c, ctx) => [{ k: 'treasury', v: gain(w, c, 1) }, { k: 'gdp', v: 0.06, province: ctx.province as string }, { k: 'faction', f: 'merchants', loyalty: 5 }], ai: always },
    ],
  },
  {
    id: 'steam_engine_arrives', category: 'Industry', title: 'The Fire Engine', art: 'industry', once: true,
    chance: (w, c) => {
      const cc = w.countries[c];
      if (cc.techs.includes('watt_engine') || year(w) < 1800) return 0;
      const nbr = neighbourCountries(w, c).some((n) => w.countries[n].techs.includes('watt_engine')) || cc.techs.includes('atmospheric_engine');
      return nbr ? 0.006 : 0;
    },
    text: () => 'Foreign engineers offer to sell us a steam engine, the marvel that pumps mines dry and drives mills without water or horses. Our scholars beg to study it.',
    options: [
      { id: 'buy', label: 'Purchase engines and hire engineers', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'tech', tech: 'atmospheric_engine' }, { k: 'research', v: 150 }, { k: 'faction', f: 'reformers', loyalty: 8 }], ai: (w, c) => def(c).personality.reform * 2 },
      { id: 'invite', label: 'Invite engineers to teach our artisans', effects: () => [{ k: 'research', v: 100 }, { k: 'faction', f: 'clergy', loyalty: -4 }], ai: always },
      { id: 'reject', label: 'Reject foreign contrivances', effects: () => [{ k: 'stability', v: 2 }, { k: 'faction', f: 'reformers', loyalty: -8 }], ai: () => 0.5 },
    ],
  },
  {
    id: 'industrial_breakthrough', category: 'Industry', title: 'An Industrial Breakthrough', art: 'industry', cooldown: 60,
    chance: (w, c) => (w.countries[c].techs.includes('factory_system') && provincesOf(w, c).some((id) => (w.provinces[id].buildings.textile_mill ?? 0) > 0) ? 0.008 : 0),
    text: () => 'A mechanic in one of our mills has devised an improvement that doubles the output of every machine it is fitted to.',
    options: [
      { id: 'patent', label: 'Grant a patent and spread the invention', effects: () => [{ k: 'research', v: 150 }, { k: 'gdp', v: 0.02 }], ai: always },
      { id: 'monopoly', label: 'Make it a state monopoly', effects: (w, c) => [{ k: 'treasury', v: gain(w, c, 2) }, { k: 'faction', f: 'merchants', loyalty: -6 }], ai: always },
    ],
  },
  {
    id: 'scientific_expedition', category: 'Discovery', title: 'A Scientific Expedition', art: 'discovery', cooldown: 120,
    chance: (w, c) => (INSTITUTION_FACTOR[def(c).techProfile] >= 0.5 && w.countries[c].prestige > 35 ? 0.004 : 0),
    text: () => 'Naturalists propose an expedition to chart distant coasts, collect specimens and observe the heavens.',
    options: [
      { id: 'fund', label: 'Fund the expedition', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 1.5) }, { k: 'prestige', v: 8 }, { k: 'research', v: 120 }], ai: always },
      { id: 'decline', label: 'We cannot spare the money', effects: () => [{ k: 'faction', f: 'reformers', loyalty: -4 }], ai: always },
    ],
  },
  {
    id: 'diplomatic_scandal', category: 'Diplomacy', title: 'A Diplomatic Scandal', art: 'summit', cooldown: 48,
    chance: () => 0.004,
    setup: (w, c) => { const n = neighbourCountries(w, c); const t = n.length ? pick(w, n) : null; return t ? { target: t } : null; },
    text: (w, c, ctx) => `Our ambassador at the court of ${countryName(w, ctx.target as string)} has insulted their sovereign at a state banquet. Their envoys demand satisfaction.`,
    options: [
      { id: 'apologise', label: 'Apologise and recall him', effects: (w, c, ctx) => [{ k: 'prestige', v: -3 }, { k: 'relation', target: ctx.target as string, v: 10 }], ai: always },
      { id: 'deny', label: 'Deny everything', effects: (w, c, ctx) => [{ k: 'relation', target: ctx.target as string, v: -20 }], ai: always },
      { id: 'expel', label: 'Expel their envoys in return', effects: (w, c, ctx) => [{ k: 'relation', target: ctx.target as string, v: -40 }, { k: 'prestige', v: 2 }], ai: () => 0.3 },
    ],
  },
  {
    id: 'border_incident', category: 'Military', title: 'Incident on the Frontier', art: 'battle', cooldown: 36,
    chance: (w, c) => (neighbourCountries(w, c).some((n) => opinion(w, c, n) < -20) ? 0.006 : 0),
    setup: (w, c) => {
      const hostile = neighbourCountries(w, c).filter((n) => opinion(w, c, n) < -20);
      if (!hostile.length) return null;
      const t = pick(w, hostile);
      const prov = provincesOf(w, t).find((id) => neighbors(id).some((n) => w.provinces[n]?.owner === c));
      return prov ? { target: t, province: prov } : null;
    },
    text: (w, c, ctx) => `Soldiers of ${countryName(w, ctx.target as string)} have raided across the border near ${provinceName(ctx.province as string)}, killing herdsmen and carrying off cattle.`,
    options: [
      { id: 'claim', label: 'Demand redress and press our ancient rights', effects: (w, c, ctx) => [{ k: 'relation', target: ctx.target as string, v: -20 }, { k: 'claim', province: ctx.province as string }], ai: (w, c) => def(c).personality.aggression * 2 },
      { id: 'pass', label: 'Let it pass', effects: (w, c, ctx) => [{ k: 'prestige', v: -3 }, { k: 'relation', target: ctx.target as string, v: 5 }], ai: always },
      { id: 'garrison', label: 'Reinforce the frontier', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 0.8) }, { k: 'faction', f: 'military', loyalty: 5 }], ai: always },
    ],
  },
  {
    id: 'foreign_embassy', category: 'Diplomacy', title: 'A Foreign Embassy', art: 'summit', cooldown: 60,
    chance: () => 0.003,
    setup: (w, c) => {
      const cands = Object.values(w.countries).filter((o) => o.alive && o.id !== c && powerScore(w, o.id) > 120 && opinion(w, c, o.id) > -20);
      const t = weightedPick(w, cands, (o) => powerScore(w, o.id));
      return t ? { target: t.id } : null;
    },
    text: (w, c, ctx) => `A splendid embassy from ${countryName(w, ctx.target as string)} arrives bearing gifts and letters of friendship.`,
    options: [
      { id: 'warm', label: 'Receive them with every honour', effects: (w, c, ctx) => [{ k: 'relation', target: ctx.target as string, v: 20 }, { k: 'treasury', v: inc(w, c, 0.4) }], ai: always },
      { id: 'cool', label: 'Receive them correctly but coolly', effects: (w, c, ctx) => [{ k: 'relation', target: ctx.target as string, v: 5 }, { k: 'prestige', v: 2 }], ai: always },
    ],
  },
  {
    id: 'foreign_officers', category: 'Military', title: 'Foreign Officers Offer Their Swords', art: 'battle', cooldown: 120,
    chance: (w, c) => (!WESTERN_PROFILES.includes(def(c).techProfile) && !w.countries[c].techs.includes('field_artillery_reform') && def(c).polityType !== 'decentralized' && w.countries[c].last.income > 20 ? 0.005 : 0),
    text: () => 'European officers, adventurers of the French and British wars, offer to drill our infantry and cast modern cannon.',
    options: [
      { id: 'french', label: 'Engage French officers', requires: (w) => !!w.countries.france?.alive, effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'tech', tech: 'linear_tactics' }, { k: 'research', v: 80 }, { k: 'relation', target: 'france', v: 15 }, { k: 'relation', target: 'great_britain', v: -10 }, { k: 'faction', f: 'military', loyalty: 8 }], ai: always },
      { id: 'british', label: 'Engage British officers', requires: (w) => !!w.countries.great_britain?.alive, effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'tech', tech: 'linear_tactics' }, { k: 'research', v: 80 }, { k: 'relation', target: 'great_britain', v: 15 }, { k: 'relation', target: 'france', v: -10 }, { k: 'faction', f: 'military', loyalty: 8 }], ai: always },
      { id: 'decline', label: 'Our own traditions suffice', effects: () => [{ k: 'faction', f: 'military', loyalty: 4 }, { k: 'stability', v: 1 }], ai: () => 0.6 },
    ],
  },
  {
    id: 'mutiny', category: 'Military', title: 'Mutiny over Pay', art: 'revolution', major: true, cooldown: 12,
    chance: (w, c) => (w.countries[c].treasury < 0 && armiesOf(w, c).some((a) => armyRegiments(a) > 3) ? 0.06 : 0),
    text: () => 'Unpaid for months, regiments have seized their officers and refuse to march until they receive their arrears.',
    options: [
      { id: 'pay', label: 'Pay the arrears somehow', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 1) }, { k: 'armyMorale', v: 0.1 }], ai: always },
      { id: 'punish', label: 'Decimate the ringleaders', effects: () => [{ k: 'armyMorale', v: -0.25 }, { k: 'faction', f: 'military', loyalty: -15 }], ai: always },
      { id: 'land', label: 'Promise land grants to veterans', effects: () => [{ k: 'faction', f: 'nobility', loyalty: -10 }, { k: 'faction', f: 'military', loyalty: 12 }], ai: always },
    ],
  },
  {
    id: 'general_ambition', category: 'Military', title: 'An Ambitious General', art: 'battle', cooldown: 72,
    chance: (w, c) => {
      const r = ruler(w, c);
      const gens = armiesOf(w, c).filter((a) => a.general).map((a) => w.characters[a.general!]).filter((g) => g && g.alive && g.role === 'general' && g.mil >= 7 && g.ambition > 55);
      return gens.length && r && r.mil < 6 ? 0.006 : 0;
    },
    setup: (w, c) => {
      const g = armiesOf(w, c).filter((a) => a.general).map((a) => w.characters[a.general!]).find((x) => x && x.alive && x.role === 'general' && x.mil >= 7 && x.ambition > 55);
      return g ? { general: g.id, name: g.name } : null;
    },
    text: (w, c, ctx) => `${ctx.name} is the idol of the army. His victories are toasted in every barracks, and some toast him as more than a general.`,
    options: [
      { id: 'honour', label: 'Shower him with honours', effects: () => [{ k: 'prestige', v: 3 }, { k: 'legitimacy', v: -5 }, { k: 'faction', f: 'military', loyalty: 8 }], ai: always },
      { id: 'recall', label: 'Recall him to a quiet post', effects: () => [{ k: 'armyMorale', v: -0.15 }, { k: 'faction', f: 'military', loyalty: -8 }, { k: 'legitimacy', v: 3 }], ai: always },
      { id: 'governor', label: 'Make him a provincial governor', effects: () => [{ k: 'corruption', v: 4 }, { k: 'stability', v: 2 }], ai: always },
    ],
  },
  {
    id: 'war_weariness', category: 'War', title: 'War Weariness', art: 'revolution', cooldown: 18,
    chance: (w, c) => (isAtWar(w, c) && w.countries[c].warExhaustion > 40 ? 0.03 : 0),
    text: () => 'Widows march in the capital. Recruiters are stoned in the villages. Even the clergy preach for peace.',
    options: [
      { id: 'promise', label: 'Promise an honourable peace soon', effects: () => [{ k: 'warExhaustion', v: -8 }, { k: 'prestige', v: -5 }], ai: always },
      { id: 'suppress', label: 'Suppress defeatism', effects: () => [{ k: 'unrest', v: 8 }, { k: 'stability', v: -4 }], ai: always },
      { id: 'rally', label: 'Rally the nation with festivals of victory', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 1) }, { k: 'warExhaustion', v: -5 }, { k: 'legitimacy', v: 2 }], ai: always },
    ],
  },
  {
    id: 'peace_congress', category: 'Peace', title: 'A Peace Congress Is Proposed', art: 'treaty', major: true, cooldown: 36,
    chance: (w, c) => (c === w.playerId && warsOf(w, c).some((war) => w.turn - war.start > 24 && Math.abs(war.score) < 30) && w.countries[c].warExhaustion > 25 ? 0.04 : 0),
    setup: (w, c) => { const war = warsOf(w, c).find((x) => w.turn - x.start > 24 && Math.abs(x.score) < 30); return war ? { war: war.id, name: war.name } : null; },
    text: (w, c, ctx) => `Neutral courts propose a congress to end the ${ctx.name}. Plenipotentiaries could meet within weeks, if the belligerents agree to restore the status quo.`,
    options: [
      { id: 'attend', label: 'Send plenipotentiaries (white peace)', effects: (w, c, ctx) => [{ k: 'flag', key: `congress_${ctx.war}`, value: w.turn }, { k: 'prestige', v: 3 }], ai: always, hint: 'Ends the war in a white peace if the other side agrees.' },
      { id: 'refuse', label: 'Fight on to victory', effects: () => [{ k: 'prestige', v: 2 }, { k: 'warExhaustion', v: 5 }], ai: always },
    ],
  },
  {
    id: 'indian_federation', category: 'Alternate History', title: 'A Council of Princes', art: 'council', major: true, once: true,
    chance: (w, c) => (def(c).region === 'South Asia' && def(c).polityType !== 'chartered_company' && !w.countries[c].overlord && w.countries.british_east_india_company?.alive && w.turn >= 6 && w.countries[c].prestige > 30 ? 0.004 : 0),
    text: (w, c) => `The Company's subsidiary treaties swallow one court after another. Envoys suggest that ${countryName(w, c)} summon the princes of Hindustan and the Deccan to a council, to stand together or fall separately.`,
    options: [
      {
        id: 'council', label: 'Convene a Council of Princes', ai: (w, c) => def(c).personality.diplomacy * 2,
        effects: (w, c) => {
          const partners = Object.values(w.countries).filter((o) => o.alive && o.id !== c && def(o.id).region === 'South Asia' && !o.overlord && def(o.id).polityType !== 'chartered_company' && opinion(w, c, o.id) > -15)
            .sort((a, b) => powerScore(w, b.id) - powerScore(w, a.id)).slice(0, 4);
          return [...partners.map((p) => ({ k: 'treaty' as const, type: 'alliance' as const, target: p.id })), ...partners.map((p) => ({ k: 'relation' as const, target: p.id, v: 20 })), { k: 'prestige', v: 10 }, { k: 'relation', target: 'british_east_india_company', v: -30 }, { k: 'chronicle', text: `${countryName(w, c)} convenes a Council of Princes against Company expansion.`, importance: 3 }];
        },
      },
      { id: 'company', label: 'Seek the Company\'s friendship instead', effects: () => [{ k: 'relation', target: 'british_east_india_company', v: 30 }, { k: 'treaty', type: 'nap', target: 'british_east_india_company', months: 120 }], ai: always },
      { id: 'alone', label: 'Stand alone', effects: () => [{ k: 'stability', v: 2 }], ai: always },
    ],
  },
  {
    id: 'self_strengthening', category: 'Alternate History', title: 'Western Learning and the Dragon Throne', art: 'industry', major: true, once: true,
    chance: (w, c) => (['qing', 'joseon', 'konbaung', 'siam', 'nguyen_lords'].includes(c) && w.turn >= 12 ? 0.004 * (1 + def(c).personality.reform) : 0),
    text: () => 'A memorial to the throne argues that foreign arsenals, shipyards and mathematics could be mastered without abandoning the Way of the sages: "Chinese learning as the substance, Western learning for practical use."',
    options: [
      { id: 'arsenals', label: 'Found arsenals and schools of Western learning', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 3) }, { k: 'building', province: w.countries[c].capital, building: 'arsenal' }, { k: 'research', v: 200 }, { k: 'modifier', mod: { id: 'self_strengthening', label: 'Self-strengthening', monthsLeft: 60, research: 0.15 } }, { k: 'faction', f: 'reformers', loyalty: 15, influence: 5 }, { k: 'faction', f: 'nobility', loyalty: -10 }, { k: 'chronicle', text: `${countryName(w, c)} launches a programme of "self-strengthening" decades ahead of its time.`, importance: 3 }], ai: (w, c) => def(c).personality.reform * 2 },
      { id: 'tradition', label: 'Reaffirm the ancestral institutions', effects: () => [{ k: 'stability', v: 5 }, { k: 'legitimacy', v: 5 }], ai: always },
    ],
  },
  {
    id: 'rangaku', category: 'Alternate History', title: 'The Scholars of Dutch Learning', art: 'discovery', major: true, once: true,
    chance: (w, c) => (c === 'tokugawa' && w.turn >= 6 ? 0.006 : 0),
    text: () => 'Scholars of Dutch learning petition the shogunate: Russian ships prowl Ezo; the world beyond Dejima is changing. They ask for an official academy of Western studies.',
    options: [
      { id: 'academy', label: 'Found an academy of Western studies', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 1.5) }, { k: 'research', v: 180 }, { k: 'modifier', mod: { id: 'bansho', label: 'Institute for Western Books', monthsLeft: 120, research: 0.12 } }, { k: 'faction', f: 'reformers', loyalty: 12 }, { k: 'chronicle', text: 'The shogunate founds an academy of Western learning.', importance: 2 }], ai: always },
      { id: 'trade', label: 'Expand the Nagasaki trade', effects: () => [{ k: 'modifier', mod: { id: 'nagasaki', label: 'Expanded Nagasaki trade', monthsLeft: 120, trade: 0.12 } }, { k: 'faction', f: 'merchants', loyalty: 10 }, { k: 'faction', f: 'clergy', loyalty: -5 }], ai: always },
      { id: 'sakoku', label: 'Uphold the maritime prohibitions', effects: () => [{ k: 'stability', v: 5 }, { k: 'faction', f: 'reformers', loyalty: -10 }], ai: always },
    ],
  },
  {
    id: 'african_commerce', category: 'Alternate History', title: 'Royal Trading Houses', art: 'trade', major: true, once: true,
    chance: (w, c) => (def(c).continent === 'Africa' && def(c).polityType === 'monarchy' && !w.countries[c].overlord && provincesOf(w, c).some((id) => ['gold', 'ivory', 'spices', 'textiles', 'gems'].includes(PROVINCE_DEFS[id].good)) && w.turn >= 6 ? 0.003 : 0),
    text: () => 'Court treasurers propose royal trading houses on the European model, with warehouses at the coast, gold-weight standards and caravans under royal protection.',
    options: [
      { id: 'houses', label: 'Establish royal trading houses', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 2) }, { k: 'modifier', mod: { id: 'royal_trade', label: 'Royal trading houses', monthsLeft: 120, trade: 0.18 } }, { k: 'faction', f: 'merchants', loyalty: 10, influence: 5 }, { k: 'chronicle', text: `${countryName(w, c)} reorganises its commerce under royal trading houses.`, importance: 2 }], ai: always },
      { id: 'craftsmen', label: 'Invite foreign craftsmen and gunsmiths', effects: (w, c) => [{ k: 'treasury', v: inc(w, c, 1.5) }, { k: 'research', v: 120 }, { k: 'tech', tech: 'blast_furnace' }], ai: always },
      { id: 'royal', label: 'Keep trade a royal monopoly', effects: (w, c) => [{ k: 'treasury', v: gain(w, c, 1) }, { k: 'faction', f: 'merchants', loyalty: -8 }], ai: always },
    ],
  },
  {
    id: 'indigenous_council', category: 'Alternate History', title: 'A Great Council Fire', art: 'council', major: true, once: true,
    chance: (w, c) => (INDIGENOUS(c) && neighbourCountries(w, c).some((n) => COLONIAL_POWERS.includes(n) && opinion(w, c, n) < 10) && w.turn >= 3 ? 0.006 : 0),
    text: (w, c) => `Runners carry wampum and messages between the nations. Speakers propose a great council: if the peoples stand together, the frontier of the newcomers can be held where it is. ${countryName(w, c)} is asked to host the fire.`,
    options: [
      {
        id: 'confederacy', label: 'Form a confederacy of nations', ai: always,
        effects: (w, c) => {
          const partners = Object.values(w.countries).filter((o) => o.alive && o.id !== c && INDIGENOUS(o.id) && !def(o.id).aggregate && opinion(w, c, o.id) > -40 && (borders(w, c, o.id) || neighbourCountries(w, o.id).some((n) => neighbourCountries(w, c).includes(n)))).slice(0, 3);
          return [...partners.map((p) => ({ k: 'treaty' as const, type: 'alliance' as const, target: p.id })), { k: 'prestige', v: 10 }, { k: 'stability', v: 5 }, { k: 'chronicle', text: `${countryName(w, c)} kindles a council fire uniting several nations against the advancing frontier.`, importance: 2 }];
        },
      },
      { id: 'treaty', label: 'Seek a treaty with the newcomers', effects: (w, c) => { const n = neighbourCountries(w, c).find((x) => COLONIAL_POWERS.includes(x)); return n ? [{ k: 'treaty', type: 'nap', target: n, months: 120 }, { k: 'relation', target: n, v: 25 }] : [{ k: 'stability', v: 3 }]; }, ai: always },
      { id: 'withdraw', label: 'Withdraw beyond the frontier', effects: () => [{ k: 'stability', v: 5 }, { k: 'prestige', v: -3 }], ai: () => 0.4 },
    ],
  },
  {
    id: 'armed_neutrality', category: 'Diplomacy', title: 'Armed Neutrality', art: 'summit', once: true,
    chance: (w, c) => (def(c).population < 1_500_000 && !w.countries[c].overlord && neighbourCountries(w, c).filter((n) => powerScore(w, n) > powerScore(w, c) * 4).length >= 2 ? 0.003 : 0),
    text: () => 'Surrounded by great powers, our ministers propose a policy of armed neutrality: friendship with all, alliance with none, and fortresses on every road.',
    options: [
      { id: 'neutral', label: 'Proclaim armed neutrality', effects: (w, c) => [...neighbourCountries(w, c).slice(0, 5).map((n) => ({ k: 'relation' as const, target: n, v: 15 })), { k: 'prestige', v: 3 }, { k: 'building', province: w.countries[c].capital, building: 'fortress' }], ai: always },
      { id: 'protector', label: 'Seek a great protector', effects: (w, c) => { const p = neighbourCountries(w, c).sort((a, b) => opinion(w, c, b) - opinion(w, c, a))[0]; return p ? [{ k: 'treaty', type: 'guarantee', target: p }, { k: 'relation', target: p, v: 20 }] : []; }, ai: always },
    ],
  },
  {
    id: 'conclave', category: 'Religion', title: 'The Conclave of Venice', art: 'religion', major: true, once: true,
    chance: (w, c) => (c === 'papal_states' && w.flags.papal_sede_vacante ? 0.3 : 0),
    text: () => 'For months the cardinals have deadlocked on the island of San Giorgio. Austria presses its candidate; others favour the mild Benedictine Barnaba Chiaramonti, Bishop of Imola, who once preached that democracy and the Gospel are not incompatible.',
    options: [
      { id: 'chiaramonti', label: 'Elect Cardinal Chiaramonti (Pius VII)', effects: () => [{ k: 'newRuler', ruler: ['Pius VII', 1742, 5, 6, 1], cause: 'is elected pope' }, { k: 'legitimacy', v: 20 }, { k: 'flag', key: 'papal_sede_vacante', value: null }, { k: 'relation', target: 'france', v: 10 }, { k: 'relation', target: 'austria', v: -5 }], ai: () => 3 },
      { id: 'mattei', label: 'Elect Austria\'s candidate, Cardinal Mattei', effects: () => [{ k: 'newRuler', ruler: ['Alessandro Mattei (pope)', 1744, 4, 4, 1], cause: 'is elected pope' }, { k: 'legitimacy', v: 15 }, { k: 'flag', key: 'papal_sede_vacante', value: null }, { k: 'relation', target: 'austria', v: 25 }, { k: 'relation', target: 'france', v: -15 }], ai: always },
      { id: 'zelante', label: 'Elect a zelante intransigent', effects: () => [{ k: 'newRuler', ruler: ['Pope (zelanti candidate)', 1735, 3, 3, 1], cause: 'is elected pope' }, { k: 'legitimacy', v: 15 }, { k: 'flag', key: 'papal_sede_vacante', value: null }, { k: 'relation', target: 'france', v: -25 }, { k: 'faction', f: 'clergy', loyalty: 15 }], ai: always },
    ],
  },
  {
    id: 'act_of_union', category: 'Royal Court', title: 'The Act of Union', art: 'council', major: true, once: true,
    chance: (w, c) => (c === 'great_britain' && w.flags.irish_union_pending && w.countries.kingdom_ireland?.alive && w.countries.kingdom_ireland.overlord === c && w.turn >= 5 ? 0.1 : 0),
    text: () => 'After the rebellion of 1798, Pitt\'s ministry has persuaded, and paid, the Irish Parliament to vote for its own abolition. The King must now decide on what terms Great Britain and Ireland shall be united.',
    options: [
      { id: 'union', label: 'Pass the Act of Union', effects: () => [{ k: 'annex', target: 'kingdom_ireland' }, { k: 'flag', key: 'irish_union_pending', value: null }, { k: 'unrest', v: 4 }], ai: always },
      { id: 'emancipation', label: 'Union with Catholic Emancipation', effects: () => [{ k: 'annex', target: 'kingdom_ireland' }, { k: 'flag', key: 'irish_union_pending', value: null }, { k: 'faction', f: 'clergy', loyalty: -15 }, { k: 'stability', v: -6 }, { k: 'faction', f: 'reformers', loyalty: 12 }], ai: () => 0.4 },
      { id: 'preserve', label: 'Preserve the Irish Parliament', effects: () => [{ k: 'flag', key: 'irish_union_pending', value: null }, { k: 'stability', v: 2 }], ai: () => 0.2 },
    ],
  },
  {
    id: 'consul_ambition', category: 'Royal Court', title: 'The First Consul\'s Ambition', art: 'palace', major: true, once: true,
    chance: (w, c) => (c === 'france' && isRepublic(w, c) && /Bonaparte/.test(ruler(w, c)?.name ?? '') && w.countries[c].prestige > 60 && w.turn >= 18 ? 0.025 : 0),
    text: () => 'Victories and the Concordat have made the First Consul the most popular man in France. Senators propose to make his power permanent: as consul for life, or as emperor of the French.',
    options: [
      { id: 'life', label: 'Proclaim the Consulate for Life', effects: () => [{ k: 'stability', v: 6 }, { k: 'legitimacy', v: 12 }, { k: 'faction', f: 'reformers', loyalty: -5 }], ai: always },
      { id: 'empire', label: 'Proclaim the Empire', effects: () => [{ k: 'law', category: 'government', option: 'absolute_monarchy' }, { k: 'legitimacy', v: 18 }, { k: 'prestige', v: 10 }, { k: 'faction', f: 'reformers', loyalty: -20 }, { k: 'faction', f: 'nobility', loyalty: 10 }, { k: 'newHeir', adult: true }, { k: 'chronicle', text: 'Napoleon Bonaparte is proclaimed Emperor of the French.', importance: 3 }], ai: () => 2 },
      { id: 'republic', label: 'Uphold the Republic', effects: () => [{ k: 'faction', f: 'reformers', loyalty: 12 }, { k: 'stability', v: 3 }], ai: () => 0.3 },
    ],
  },
  {
    id: 'abolition', category: 'Society', title: 'The Abolitionist Cause', art: 'council', major: true, cooldown: 120,
    chance: (w, c) => (w.countries[c].laws.labor === 'slavery' && (w.countries[c].techs.includes('encyclopedism') || def(c).religion === 'protestant') ? 0.006 : 0),
    text: () => 'Abolitionist societies flood the capital with petitions, sermons and the testimony of the formerly enslaved. Planters warn of ruin.',
    options: [
      { id: 'trade', label: 'Abolish the slave trade', effects: () => [{ k: 'modifier', mod: { id: 'abolition_trade', label: 'Slave trade abolished', monthsLeft: 36, trade: -0.04 } }, { k: 'faction', f: 'reformers', loyalty: 15 }, { k: 'faction', f: 'nobility', loyalty: -10 }, { k: 'prestige', v: 4 }], ai: (w, c) => def(c).personality.reform * 2 },
      { id: 'emancipate', label: 'Begin gradual emancipation', effects: () => [{ k: 'law', category: 'labor', option: 'customary_obligations' }, { k: 'faction', f: 'nobility', loyalty: -20 }, { k: 'stability', v: -8 }, { k: 'faction', f: 'reformers', loyalty: 20 }, { k: 'unrest', v: -4 }], ai: (w, c) => def(c).personality.reform },
      { id: 'defend', label: 'Defend the institution', effects: () => [{ k: 'faction', f: 'nobility', loyalty: 10 }, { k: 'faction', f: 'reformers', loyalty: -15 }, { k: 'prestige', v: -3 }], ai: always },
    ],
  },
  {
    id: 'slave_revolt', category: 'Revolt', title: 'Uprising of the Enslaved', art: 'revolution', major: true, cooldown: 36,
    chance: (w, c) => (w.countries[c].laws.labor === 'slavery' && provincesOf(w, c).some((id) => w.provinces[id].unrest > 30) ? 0.008 : 0),
    setup: (w, c) => { const p = provinceWhere(w, c, (id) => w.provinces[id].unrest > 30, (id) => w.provinces[id].unrest); return p ? { province: p } : null; },
    text: (w, c, ctx) => `Enslaved people on the plantations of ${provinceName(ctx.province as string)} have risen, inspired by news from Saint-Domingue.`,
    options: [
      { id: 'militia', label: 'Call out the militia', effects: (w, c, ctx) => [{ k: 'rebels', province: ctx.province as string, cause: 'Self-liberated people', size: 1 }, { k: 'faction', f: 'nobility', loyalty: 5 }], ai: always },
      { id: 'freedom', label: 'Offer freedom to those who lay down arms', effects: (w, c, ctx) => [{ k: 'unrest', v: -20, province: ctx.province as string }, { k: 'faction', f: 'nobility', loyalty: -15 }, { k: 'faction', f: 'reformers', loyalty: 10 }, { k: 'gdp', v: -0.04, province: ctx.province as string }], ai: always },
    ],
  },
  {
    id: 'opium_dispute', category: 'Trade', title: 'The Opium Question', art: 'trade', cooldown: 60,
    chance: (w, c) => (c === 'qing' && w.countries.british_east_india_company?.alive ? 0.005 : 0),
    text: () => 'Censors report that foreign opium is smuggled through Canton in growing quantities, draining silver from the empire and corrupting officials and soldiers alike.',
    options: [
      { id: 'enforce', label: 'Enforce the prohibition strictly', effects: () => [{ k: 'relation', target: 'british_east_india_company', v: -30 }, { k: 'modifier', mod: { id: 'opium_ban', label: 'Opium prohibition enforced', monthsLeft: 36, trade: -0.04 } }, { k: 'legitimacy', v: 5 }, { k: 'corruption', v: -4 }], ai: always },
      { id: 'tolerate', label: 'Tolerate the trade quietly', effects: (w, c) => [{ k: 'corruption', v: 8 }, { k: 'treasury', v: gain(w, c, 0.5) }, { k: 'inflation', v: -2 }], ai: always },
      { id: 'treaty', label: 'Seek a regulated commercial treaty', effects: () => [{ k: 'treaty', type: 'trade', target: 'british_east_india_company' }, { k: 'faction', f: 'nobility', loyalty: -8 }], ai: (w, c) => def(c).personality.reform },
    ],
  },
  {
    id: 'haitian_constitution', category: 'Revolution', title: 'A Constitution for Saint-Domingue', art: 'revolution', major: true, once: true,
    chance: (w, c) => (c === 'saint_domingue' && w.countries[c].overlord && w.turn >= 12 && w.provinces.sud_sd?.controller !== REBELS ? 0.03 : 0),
    text: () => 'With the southern rebellion crushed, Toussaint Louverture\'s council drafts a constitution for the colony. The question is whether it will name France at all.',
    options: [
      { id: 'governor', label: 'Governor for life, within the French Republic', effects: () => [{ k: 'liberty', v: 25 }, { k: 'legitimacy', v: 10 }, { k: 'relation', target: 'france', v: -30 }], ai: always },
      { id: 'independence', label: 'Proclaim independence', effects: () => [{ k: 'independence' }, { k: 'relation', target: 'france', v: -80 }, { k: 'prestige', v: 15 }, { k: 'stability', v: 5 }], ai: (w) => (w.countries.france?.alive && isAtWar(w, 'france') ? 2 : 0.6) },
      { id: 'loyal', label: 'Reaffirm loyalty to France', effects: () => [{ k: 'liberty', v: -20 }, { k: 'relation', target: 'france', v: 20 }], ai: () => 0.4 },
    ],
  },
  {
    id: 'nana_fadnavis', category: 'Royal Court', title: 'Death of the Maratha Machiavelli', art: 'palace', major: true, once: true,
    chance: (w, c) => (c === 'maratha' && w.flags.nana_fadnavis && w.turn >= 2 ? 0.12 : 0),
    text: () => 'Nana Fadnavis, who held the Maratha confederacy together for a generation through intrigue and patience, is dead. The Peshwa is free of his tutelage, and of his wisdom.',
    options: [
      { id: 'peshwa', label: 'The Peshwa takes the reins', effects: () => [{ k: 'flag', key: 'nana_fadnavis', value: null }, { k: 'stability', v: -10 }, { k: 'legitimacy', v: 5 }, { k: 'corruption', v: 6 }], ai: always },
      { id: 'chiefs', label: 'Share power with Scindia and Holkar', effects: () => [{ k: 'flag', key: 'nana_fadnavis', value: null }, { k: 'stability', v: -5 }, { k: 'relation', target: 'scindia', v: 20 }, { k: 'relation', target: 'holkar', v: 20 }, { k: 'legitimacy', v: -5 }], ai: always },
      { id: 'company', label: 'Seek the Company\'s counsel', effects: () => [{ k: 'flag', key: 'nana_fadnavis', value: null }, { k: 'relation', target: 'british_east_india_company', v: 25 }, { k: 'faction', f: 'military', loyalty: -12 }], ai: () => 0.4 },
    ],
  },
  {
    id: 'army_of_orient', category: 'War', title: 'The Army of the Orient', art: 'battle', major: true, once: true,
    chance: (w, c) => (c === 'france' && w.flags.egypt_expedition && ['cairo', 'delta', 'upper_egypt'].some((p) => w.provinces[p].controller === 'france') && w.turn >= 2 ? 0.06 : 0),
    text: () => 'General Kléber writes that the army in Egypt is cut off by the Royal Navy, wasting from plague, and faces the Grand Vizier\'s army at El Arish. He proposes to negotiate an honourable evacuation.',
    options: [
      { id: 'evacuate', label: 'Negotiate evacuation (Convention of El Arish)', effects: () => [{ k: 'returnControl', provinces: ['cairo', 'delta', 'upper_egypt'], to: 'ottoman' }, { k: 'flag', key: 'egypt_expedition', value: null }, { k: 'relation', target: 'ottoman', v: 25 }, { k: 'prestige', v: -5 }], ai: always },
      { id: 'hold', label: 'Hold Egypt at all costs', effects: (w, c) => [{ k: 'flag', key: 'egypt_expedition', value: null }, { k: 'treasury', v: inc(w, c, 1) }, { k: 'prestige', v: 4 }], ai: always },
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
