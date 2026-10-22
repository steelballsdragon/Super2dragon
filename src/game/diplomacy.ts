// Diplomacy: proposals and their acceptance, treaties, envoys, subjects and relations drift.
import { SUBJECT_TYPES } from './constants';
import { chance } from './rng';
import {
  addOpinion, alive, alliesOf, atWar, baseOpinion, bonuses, chronicle, clamp, countryName, def, hasTreaty, isMonarchy, newId, notify,
  opinion, touch, treatiesOf, warsOf, neighbourCountries,
} from './state';
import { provinceDistance } from './static';
import { blocPower, borders, casusBelli, declareWar, powerScore } from './war';
import type { Offer, TreatyType, WorldState } from './types';

export type DiploKind =
  | 'alliance' | 'trade' | 'marriage' | 'guarantee' | 'nap' | 'access' | 'tribute_demand' | 'offer_tribute' | 'insult' | 'envoy'
  | 'recall_envoy' | 'break_alliance' | 'subsidy' | 'stop_subsidy' | 'release_subject' | 'break_trade';

export const DIPLO_LABELS: Record<DiploKind, string> = {
  alliance: 'Propose defensive alliance',
  trade: 'Propose trade agreement',
  marriage: 'Arrange royal marriage',
  guarantee: 'Guarantee independence',
  nap: 'Propose non-aggression pact',
  access: 'Request military access',
  tribute_demand: 'Demand tribute',
  offer_tribute: 'Offer tribute (seek protection)',
  insult: 'Send an insult',
  envoy: 'Send envoy to improve relations',
  recall_envoy: 'Recall envoy',
  break_alliance: 'Break alliance',
  subsidy: 'Grant subsidies',
  stop_subsidy: 'End subsidies',
  release_subject: 'Release subject',
  break_trade: 'Cancel trade agreement',
};

const NEEDS_CONSENT: DiploKind[] = ['alliance', 'trade', 'marriage', 'nap', 'access', 'tribute_demand', 'offer_tribute', 'guarantee'];

export function maxEnvoys(w: WorldState, c: string): number {
  const country = w.countries[c];
  const ruler = w.characters[country.rulerId];
  const fm = country.ministers.foreign ? w.characters[country.ministers.foreign] : undefined;
  return 1 + Math.floor(Math.max(ruler?.dip ?? 3, fm?.dip ?? 0) / 3);
}

function capitalDistance(w: WorldState, a: string, b: string): number {
  return provinceDistance(w.countries[a].capital, w.countries[b].capital);
}

export interface Evaluation { score: number; reasons: [string, number][] }

export function evaluateProposal(w: WorldState, from: string, to: string, kind: DiploKind): Evaluation {
  const reasons: [string, number][] = [];
  const add = (label: string, v: number) => { if (Math.abs(v) >= 1) reasons.push([label, Math.round(v)]); };
  const op = opinion(w, to, from);
  const powFrom = blocPower(w, from), powTo = blocPower(w, to);
  const ratio = powFrom / Math.max(1, powTo);
  const pTo = def(to).personality;
  const infamy = w.countries[from].infamy;
  const dipBonus = bonuses(w, from).diplomacy ?? 0;
  if (dipBonus) add('Diplomatic reputation', dipBonus);
  switch (kind) {
    case 'alliance': {
      add('Base reluctance', -15);
      add('Opinion of us', op / 3);
      const threats = commonThreats(w, from, to);
      if (threats.length) add(`Common threat (${threats.map((t) => countryName(w, t)).slice(0, 2).join(', ')})`, 25);
      add('Our relative strength', clamp(Math.log2(ratio) * 10, -20, 25));
      if (def(from).religion === def(to).religion) add('Shared faith', 6);
      if (infamy > 10) add('Our aggressive reputation', -infamy / 2);
      if (!borders(w, from, to) && capitalDistance(w, from, to) > 400) add('Distance between our realms', -15);
      const myWars = warsOf(w, from).filter((war) => !warsOf(w, to).includes(war));
      if (myWars.length) add('We are at war', -20);
      if (alliesOf(w, to).length >= 3) add('Already has many allies', -15);
      add('Their diplomatic disposition', (pTo.diplomacy - 0.5) * 20);
      break;
    }
    case 'trade': {
      add('Opinion of us', op / 4);
      add('Their mercantile interest', pTo.mercantile * 20);
      add('Our tariffs', -w.countries[from].tariff * 60);
      if (borders(w, from, to)) add('Neighbours', 8);
      if (w.countries[to].rivals.includes(from)) add('Rivalry', -30);
      break;
    }
    case 'marriage': {
      add('Opinion of us', op / 3);
      add('Dynastic prestige', w.countries[from].prestige / 10);
      if (def(from).religion === def(to).religion) add('Same faith', 15);
      else add('Different faith', -20);
      break;
    }
    case 'guarantee': {
      add('Welcome protection', 20);
      add('Opinion of us', op / 4);
      if (ratio < 1) add('We are weaker than them', -25);
      break;
    }
    case 'nap': {
      add('Opinion of us', op / 4);
      add('Base willingness', 10);
      if (ratio > 1.5) add('Fear of our power', 10);
      break;
    }
    case 'access': {
      add('Opinion of us', op / 3);
      if (hasTreaty(w, 'alliance', from, to)) add('Allies', 30);
      if (ratio > 2) add('Fear of our armies', -15);
      break;
    }
    case 'tribute_demand': {
      add('Pride of an independent realm', -45);
      add('Our overwhelming strength', clamp(Math.log2(ratio) * 22, -40, 60));
      add('Opinion of us', op / 5);
      add('Their prestige', -w.countries[to].prestige / 5);
      if (borders(w, from, to)) add('We border them', 8);
      if (warsOf(w, to).length) add('They are already at war', 10);
      break;
    }
    case 'offer_tribute': {
      add('Gains a tributary', 25);
      add('Opinion of us', op / 5);
      if (warsOf(w, from).length) add('We would drag them into our wars', -20);
      break;
    }
    default:
      add('Unilateral action', 100);
  }
  if (atWar(w, from, to)) add('At war', -1000);
  const score = reasons.reduce((s, [, v]) => s + v, 0);
  return { score, reasons };
}

function commonThreats(w: WorldState, a: string, b: string): string[] {
  const out: string[] = [];
  const pool = new Set([...neighbourCountries(w, a), ...neighbourCountries(w, b), ...w.countries[a].rivals, ...w.countries[b].rivals]);
  for (const id of pool) {
    if (id === a || id === b || !w.countries[id]?.alive) continue;
    const threatensA = opinion(w, a, id) < -30 || w.countries[a].rivals.includes(id);
    const threatensB = opinion(w, b, id) < -30 || w.countries[b].rivals.includes(id);
    if (threatensA && threatensB && powerScore(w, id) > 30) out.push(id);
  }
  return out;
}

export function diploBlocker(w: WorldState, from: string, to: string, kind: DiploKind, amount = 0): string | null {
  if (from === to) return 'Cannot target ourselves.';
  if (!alive(w, to)) return 'That polity no longer exists.';
  const fc = w.countries[from], tc = w.countries[to];
  if (atWar(w, from, to) && !['insult', 'envoy', 'recall_envoy'].includes(kind)) return 'We are at war with them.';
  const consentKinds = ['alliance', 'trade', 'marriage', 'nap', 'access', 'guarantee', 'tribute_demand', 'offer_tribute'];
  if (fc.overlord && ['alliance', 'tribute_demand', 'guarantee'].includes(kind)) return `As a subject of ${countryName(w, fc.overlord)}, our foreign policy is not our own.`;
  if (tc.overlord && ['alliance', 'tribute_demand', 'guarantee', 'offer_tribute'].includes(kind) && tc.overlord !== from) return `They are a subject of ${countryName(w, tc.overlord)}.`;
  if (consentKinds.includes(kind) && w.offers.some((o) => o.from === from && o.to === to && o.kind === (kind === 'tribute_demand' ? 'tribute_demand' : kind))) return 'A proposal is already pending.';
  switch (kind) {
    case 'alliance': if (hasTreaty(w, 'alliance', from, to)) return 'Already allied.'; break;
    case 'trade': if (hasTreaty(w, 'trade', from, to)) return 'A trade agreement already exists.'; break;
    case 'marriage':
      if (!isMonarchy(w, from) || !isMonarchy(w, to)) return 'Royal marriages require two ruling dynasties.';
      if (hasTreaty(w, 'marriage', from, to)) return 'Our houses are already joined.';
      break;
    case 'guarantee': if (hasTreaty(w, 'guarantee', from, to)) return 'Already guaranteed.'; break;
    case 'nap': if (hasTreaty(w, 'nap', from, to)) return 'A pact already exists.'; break;
    case 'access': if (hasTreaty(w, 'access', from, to)) return 'We already have military access.'; break;
    case 'tribute_demand': if (tc.overlord === from) return 'They already pay us tribute.'; break;
    case 'offer_tribute': if (fc.overlord) return 'We already have an overlord.'; break;
    case 'envoy':
      if (fc.envoys.includes(to)) return 'An envoy is already there.';
      if (fc.envoys.length >= maxEnvoys(w, from)) return `All ${maxEnvoys(w, from)} envoys are deployed.`;
      break;
    case 'recall_envoy': if (!fc.envoys.includes(to)) return 'No envoy is there.'; break;
    case 'break_alliance': if (!hasTreaty(w, 'alliance', from, to)) return 'We are not allied.'; break;
    case 'break_trade': if (!hasTreaty(w, 'trade', from, to)) return 'No trade agreement exists.'; break;
    case 'subsidy': if (amount <= 0) return 'Specify a monthly amount.'; if (fc.treasury < amount * 3) return 'Insufficient treasury.'; break;
    case 'stop_subsidy': if (!treatiesOf(w, from, 'subsidy').some((t) => t.a === from && t.b === to)) return 'We pay them no subsidy.'; break;
    case 'release_subject': if (tc.overlord !== from) return 'They are not our subject.'; break;
  }
  return null;
}

export function addTreaty(w: WorldState, type: TreatyType, a: string, b: string, amount?: number, months?: number): void {
  w.treaties.push({ id: newId(w, 't'), type, a, b, start: w.turn, amount, expires: months ? w.turn + months : undefined });
  touch(w);
}

function applyAccepted(w: WorldState, from: string, to: string, kind: DiploKind): string {
  switch (kind) {
    case 'alliance': addTreaty(w, 'alliance', from, to); addOpinion(w, from, to, 15); return `${countryName(w, to)} agrees to a defensive alliance.`;
    case 'trade': addTreaty(w, 'trade', from, to); addOpinion(w, from, to, 10); return `A trade agreement is signed with ${countryName(w, to)}.`;
    case 'marriage': {
      addTreaty(w, 'marriage', from, to);
      addOpinion(w, from, to, 25);
      w.countries[from].legitimacy = clamp(w.countries[from].legitimacy + 5, 0, 100);
      w.countries[to].legitimacy = clamp(w.countries[to].legitimacy + 5, 0, 100);
      return `A royal marriage unites the houses of ${countryName(w, from)} and ${countryName(w, to)}.`;
    }
    case 'guarantee': addTreaty(w, 'guarantee', from, to); addOpinion(w, from, to, 20); return `We now guarantee the independence of ${countryName(w, to)}.`;
    case 'nap': addTreaty(w, 'nap', from, to, undefined, 120); addOpinion(w, from, to, 8); return `A ten-year non-aggression pact is signed with ${countryName(w, to)}.`;
    case 'access': addTreaty(w, 'access', from, to); return `${countryName(w, to)} grants our armies passage.`;
    case 'tribute_demand': {
      const tc = w.countries[to];
      tc.overlord = from; tc.subjectType = 'tributary'; tc.liberty = 40;
      w.countries[from].prestige = clamp(w.countries[from].prestige + 8, 0, 100);
      touch(w);
      return `${countryName(w, to)} submits and will send us tribute.`;
    }
    case 'offer_tribute': {
      const fc = w.countries[from];
      fc.overlord = to; fc.subjectType = 'tributary'; fc.liberty = 20;
      addOpinion(w, from, to, 30);
      touch(w);
      return `${countryName(w, to)} accepts our tribute and extends its protection.`;
    }
    default: return '';
  }
}

/** Perform a diplomatic action. Returns a message for the player. */
export function performDiplomacy(w: WorldState, from: string, to: string, kind: DiploKind, amount = 0): { ok: boolean; message: string; pending?: boolean } {
  const err = diploBlocker(w, from, to, kind, amount);
  if (err) return { ok: false, message: err };
  const fc = w.countries[from];
  if (NEEDS_CONSENT.includes(kind)) {
    if (to === w.playerId) {
      w.offers.push({ id: newId(w, 'o'), from, to, kind: kind === 'offer_tribute' ? 'vassalage' : kind === 'nap' || kind === 'access' || kind === 'guarantee' ? 'alliance' : kind as Offer['kind'], turn: w.turn, expires: w.turn + 3, text: offerText(w, from, kind) });
      w.flags[`offerkind_${w.offers[w.offers.length - 1].id}`] = kind;
      return { ok: true, pending: true, message: 'Proposal sent.' };
    }
    const ev = evaluateProposal(w, from, to, kind);
    if (ev.score >= 0) {
      const msg = applyAccepted(w, from, to, kind);
      if (from === w.playerId || to === w.playerId) chronicle(w, { text: msg, category: 'diplomacy', countries: [from, to], importance: 1 });
      return { ok: true, message: msg };
    }
    if (kind === 'tribute_demand') {
      w.flags[`refused_${to}_${from}`] = w.turn;
      addOpinion(w, from, to, -25);
      return { ok: false, message: `${countryName(w, to)} refuses to pay tribute. We now have a casus belli against them.` };
    }
    addOpinion(w, from, to, -5);
    return { ok: false, message: `${countryName(w, to)} declines (${ev.reasons.filter(([, v]) => v < 0).map(([l]) => l.toLowerCase()).slice(0, 2).join(', ') || 'no interest'}).` };
  }
  switch (kind) {
    case 'insult':
      addOpinion(w, from, to, -40);
      fc.prestige = clamp(fc.prestige + 2, 0, 100);
      if (!fc.rivals.includes(to)) fc.rivals.push(to);
      if (!w.countries[to].rivals.includes(from)) w.countries[to].rivals.push(from);
      return { ok: true, message: `Our insult has been delivered to the court of ${countryName(w, to)}.` };
    case 'envoy': fc.envoys.push(to); return { ok: true, message: `An envoy departs for ${countryName(w, to)}.` };
    case 'recall_envoy': fc.envoys = fc.envoys.filter((x) => x !== to); return { ok: true, message: 'Envoy recalled.' };
    case 'break_alliance':
      w.treaties = w.treaties.filter((t) => !(t.type === 'alliance' && ((t.a === from && t.b === to) || (t.a === to && t.b === from))));
      addOpinion(w, from, to, -30);
      touch(w);
      return { ok: true, message: `Our alliance with ${countryName(w, to)} is dissolved.` };
    case 'break_trade':
      w.treaties = w.treaties.filter((t) => !(t.type === 'trade' && ((t.a === from && t.b === to) || (t.a === to && t.b === from))));
      addOpinion(w, from, to, -10);
      return { ok: true, message: 'Trade agreement cancelled.' };
    case 'subsidy':
      addTreaty(w, 'subsidy', from, to, amount);
      addOpinion(w, from, to, 10 + amount / 5);
      return { ok: true, message: `We will pay ${countryName(w, to)} £${amount}k a month.` };
    case 'stop_subsidy':
      w.treaties = w.treaties.filter((t) => !(t.type === 'subsidy' && t.a === from && t.b === to));
      addOpinion(w, from, to, -15);
      return { ok: true, message: 'Subsidies ended.' };
    case 'release_subject': {
      const tc = w.countries[to];
      tc.overlord = undefined; tc.subjectType = undefined; tc.liberty = 0;
      addOpinion(w, from, to, 40);
      touch(w);
      chronicle(w, { text: `${countryName(w, from)} releases ${countryName(w, to)} from subjection.`, category: 'diplomacy', countries: [from, to], importance: 2 });
      return { ok: true, message: `${countryName(w, to)} is now independent.` };
    }
  }
  return { ok: false, message: 'Nothing happened.' };
}

function offerText(w: WorldState, from: string, kind: DiploKind): string {
  const n = countryName(w, from);
  switch (kind) {
    case 'alliance': return `${n} proposes a defensive alliance.`;
    case 'trade': return `${n} proposes a commercial treaty lowering duties between our merchants.`;
    case 'marriage': return `The court of ${n} proposes a royal marriage between our houses.`;
    case 'tribute_demand': return `${n} demands that we acknowledge its suzerainty and pay annual tribute. Refusal will be taken as a pretext for war.`;
    case 'offer_tribute': return `${n} offers to become our tributary in exchange for protection.`;
    case 'nap': return `${n} proposes a non-aggression pact.`;
    case 'access': return `${n} requests military access through our lands.`;
    case 'guarantee': return `${n} offers to guarantee our independence.`;
    default: return `${n} sends a proposal.`;
  }
}

/** The player answers an AI offer. */
export function answerOffer(w: WorldState, offerId: string, accept: boolean): string {
  const offer = w.offers.find((o) => o.id === offerId);
  if (!offer) return 'The offer has lapsed.';
  w.offers = w.offers.filter((o) => o !== offer);
  const kind = (w.flags[`offerkind_${offer.id}`] as DiploKind | undefined) ?? (offer.kind as DiploKind);
  delete w.flags[`offerkind_${offer.id}`];
  if (accept) {
    const msg = applyAccepted(w, offer.from, offer.to, kind);
    chronicle(w, { text: msg, category: 'diplomacy', countries: [offer.from, offer.to], importance: 1 });
    return msg;
  }
  addOpinion(w, offer.from, offer.to, kind === 'tribute_demand' ? -30 : -10);
  if (kind === 'tribute_demand') w.flags[`refused_${offer.to}_${offer.from}`] = w.turn;
  return 'Declined.';
}

// ---------------------------------------------------------------------------
// Monthly diplomacy
// ---------------------------------------------------------------------------

export function processDiplomacy(w: WorldState): void {
  // Envoys.
  for (const c of Object.values(w.countries)) {
    if (!c.alive) continue;
    const ruler = w.characters[c.rulerId];
    for (const t of c.envoys) if (alive(w, t)) addOpinion(w, c.id, t, 2 + (ruler?.dip ?? 3) * 0.25);
    c.envoys = c.envoys.filter((t) => alive(w, t));
  }
  // Opinions slowly return toward their baseline.
  for (const [k, v] of Object.entries(w.relations)) {
    const [a, b] = k.split('|');
    const base = baseOpinion(a, b) + (w.countries[a]?.overlord === b || w.countries[b]?.overlord === a ? 40 : 0) + (hasTreaty(w, 'alliance', a, b) ? 20 : 0) + (hasTreaty(w, 'marriage', a, b) ? 15 : 0);
    const nv = v + (base - v) * 0.01;
    if (Math.abs(nv - base) < 0.5) delete w.relations[k];
    else w.relations[k] = Math.round(nv * 10) / 10;
  }
  // Treaty expiry.
  const before = w.treaties.length;
  w.treaties = w.treaties.filter((t) => (t.expires === undefined || t.expires > w.turn) && alive(w, t.a) && alive(w, t.b));
  if (w.treaties.length !== before) touch(w);
  // Offers expire.
  w.offers = w.offers.filter((o) => o.expires >= w.turn && alive(w, o.from));
  // Subjects' liberty desire and independence bids.
  for (const s of Object.values(w.countries)) {
    if (!s.alive || !s.overlord || !s.subjectType) continue;
    const o = w.countries[s.overlord];
    if (!o?.alive) { s.overlord = undefined; s.subjectType = undefined; continue; }
    const ratio = powerScore(w, s.id) / Math.max(1, powerScore(w, o.id));
    const losing = warsOf(w, o.id).some((war) => (war.attackers.includes(o.id) ? war.score : -war.score) < -25);
    const target = SUBJECT_TYPES[s.subjectType].liberty + 40 * clamp(ratio, 0, 1.5) - opinion(w, s.id, o.id) / 4 + (losing ? 15 : 0) + (o.stability < 30 ? 10 : 0);
    s.liberty = clamp(s.liberty + (clamp(target, 0, 100) - s.liberty) * 0.05, 0, 100);
    if (s.id !== w.playerId && s.liberty > 78 && (ratio > 0.5 || losing) && !warsOf(w, s.id).length && chance(w, 0.02)) {
      const cb = casusBelli(w, s.id, o.id).find((x) => x.type === 'independence')!;
      declareWar(w, s.id, o.id, cb, { type: 'independence' });
      if (o.id === w.playerId) notify(w, `${countryName(w, s.id)} has risen in a bid for independence!`, 'danger');
    }
  }
}
