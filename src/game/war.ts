// War declaration, alliances called to arms, war score and peace treaties.
import { SUBJECT_TYPES, REBELS } from './constants';
import { firstHeld } from './create';
import { garrisonConquests } from './garrison';
import { armyPower } from './military';
import { fleetStrength } from './naval';
import {
  addOpinion, alive, alliesOf, chronicle, clamp, countryName, def, hasTreaty, newId, notify, opinion, provinceName, provincesOf, sideOf,
  fleetPower, subjectsOf, topOverlord, touch, treatiesOf, partner, warsOf, neighbourCountries,
} from './state';
import { neighbors, provinceDistance } from './static';
import type { Army, Offer, PeaceTerms, War, WarGoal, WorldState } from './types';

export type CasusBelliType = 'claim' | 'rivalry' | 'independence' | 'tribute_refused' | 'subjugation' | 'restoration' | 'none';

export interface CasusBelli { type: CasusBelliType; label: string; infamy: number; stability: number; province?: string }

const powerCache = new WeakMap<WorldState, { turn: number; power: Map<string, number>; bloc: Map<string, number> }>();

function powerTable(w: WorldState) {
  let pc = powerCache.get(w);
  if (!pc || pc.turn !== w.turn) {
    const power = new Map<string, number>();
    for (const a of Object.values(w.armies)) {
      if (a.rebel) continue;
      power.set(a.owner, (power.get(a.owner) ?? 0) + landPowerOf(w, a));
    }
    for (const f of Object.values(w.fleets)) power.set(f.owner, (power.get(f.owner) ?? 0) + fleetStrength(w, f) * 0.5);
    for (const c of Object.values(w.countries)) if (c.alive) power.set(c.id, (power.get(c.id) ?? 0) + c.last.income * 0.05 + 1);
    pc = { turn: w.turn, power, bloc: new Map() };
    powerCache.set(w, pc);
  }
  return pc;
}

function landPowerOf(w: WorldState, a: Army): number {
  return armyPower(w, a, a.location, false);
}

/** Military and economic weight of a polity (cached per month). */
export function powerScore(w: WorldState, c: string): number {
  return powerTable(w).power.get(c) ?? 1;
}

/** Power of a country together with its subjects and allies. */
export function blocPower(w: WorldState, c: string): number {
  const pc = powerTable(w);
  const hit = pc.bloc.get(c);
  if (hit !== undefined) return hit;
  let s = powerScore(w, c);
  for (const sub of subjectsOf(w, c)) if (SUBJECT_TYPES[w.countries[sub].subjectType!]?.joinsWars) s += powerScore(w, sub) * 0.8;
  for (const a of alliesOf(w, c)) s += powerScore(w, a) * 0.5;
  pc.bloc.set(c, s);
  return s;
}

export function borders(w: WorldState, a: string, b: string): boolean {
  return neighbourCountries(w, a).includes(b);
}

export function casusBelli(w: WorldState, attacker: string, target: string): CasusBelli[] {
  const out: CasusBelli[] = [];
  const a = w.countries[attacker];
  const claimProv = provincesOf(w, target).find((id) => w.provinces[id].cores.includes(attacker) || a.claims.includes(id));
  if (claimProv) out.push({ type: 'claim', label: `Claim on ${provinceName(claimProv)}`, infamy: 8, stability: 0, province: claimProv });
  if (a.overlord === target) out.push({ type: 'independence', label: 'War of independence', infamy: 0, stability: 0 });
  if (a.rivals.includes(target) || opinion(w, attacker, target) < -60) out.push({ type: 'rivalry', label: 'Rivalry', infamy: 12, stability: 3 });
  if (w.flags[`refused_${target}_${attacker}`]) out.push({ type: 'tribute_refused', label: 'Refused our demand for tribute', infamy: 8, stability: 0 });
  if (borders(w, attacker, target) && blocPower(w, attacker) > powerScore(w, target) * 2.5) out.push({ type: 'subjugation', label: 'Subjugation of a weaker neighbour', infamy: 18, stability: 5 });
  out.push({ type: 'none', label: 'No casus belli (naked aggression)', infamy: 25, stability: 15 });
  return out;
}

export function goalFor(w: WorldState, attacker: string, target: string, cb: CasusBelli): WarGoal {
  if (cb.type === 'independence') return { type: 'independence' };
  if (cb.type === 'tribute_refused' || cb.type === 'subjugation') return { type: 'subjugate' };
  if (cb.type === 'claim' && cb.province) return { type: 'conquest', province: cb.province };
  // Otherwise aim for the nearest bordering province.
  const near = provincesOf(w, target).find((id) => neighbors(id).some((n) => w.provinces[n]?.owner === attacker));
  if (near) return { type: 'conquest', province: near };
  return { type: 'humiliate' };
}

export function declareWarBlocker(w: WorldState, attacker: string, target: string): string | null {
  if (attacker === target) return 'Cannot declare war on yourself.';
  if (!alive(w, target)) return 'That polity no longer exists.';
  if (warsOf(w, attacker).some((war) => war.attackers.includes(target) || war.defenders.includes(target))) return 'Already at war with them.';
  const a = w.countries[attacker];
  if (a.overlord && a.overlord !== target) return `As a subject of ${countryName(w, a.overlord)} we cannot wage independent wars.`;
  if (w.countries[target].overlord === attacker) return 'They are our subject.';
  if (hasTreaty(w, 'alliance', attacker, target)) return 'We are allied; break the alliance first.';
  return null;
}

function warName(w: WorldState, attacker: string, target: string, goal: WarGoal): string {
  if (goal.type === 'independence') return `${def(attacker).adjective} War of Independence`;
  const year = 1800 + Math.floor(w.turn / 12);
  const [a, b] = def(attacker).adjective === def(target).adjective ? [def(attacker).short, def(target).short] : [def(attacker).adjective, def(target).adjective];
  return `${a}–${b} War of ${year}`;
}

export function joinWar(w: WorldState, war: War, c: string, side: 'attackers' | 'defenders'): void {
  if (war.attackers.includes(c) || war.defenders.includes(c)) return;
  war[side].push(c);
  for (const t of [...w.treaties]) {
    const other = partner(t, c);
    if ((t.a === c || t.b === c) && (side === 'attackers' ? war.defenders : war.attackers).includes(other) && t.type !== 'truce') {
      w.treaties = w.treaties.filter((x) => x !== t);
    }
  }
}

function capitalDistance(w: WorldState, a: string, b: string): number {
  const ca = w.countries[a]?.capital, cb = w.countries[b]?.capital;
  return ca && cb ? provinceDistance(ca, cb) : Infinity;
}

/** Whether a member of the winning side can plausibly administer a ceded province. */
function canHold(w: WorldState, m: string, pid: string): boolean {
  return provincesOf(w, m).some((x) => provinceDistance(x, pid) < 45); // map units (~20 km each)
}

function willJoin(w: WorldState, ally: string, friend: string, enemy: string, defensive: boolean): boolean {
  if (!alive(w, ally) || warsOf(w, ally).length >= 2) return false;
  if (hasTreaty(w, 'alliance', ally, enemy)) return false;
  const op = opinion(w, ally, friend) - opinion(w, ally, enemy) * 0.5;
  const risk = powerScore(w, enemy) / Math.max(1, blocPower(w, friend));
  // Distant allies without a navy to reach the theatre rarely send more than regrets.
  const reach = borders(w, ally, enemy) || borders(w, ally, friend) || capitalDistance(w, ally, enemy) < 110 || fleetPower(w, ally) > 120;
  const score = (defensive ? 40 : 0) + op * 0.3 - risk * 20 + (w.countries[ally].rivals.includes(enemy) ? 25 : 0) + def(ally).personality.aggression * 20 - (reach ? 0 : 45);
  return score > 15;
}

export function declareWar(w: WorldState, attacker: string, target: string, cb: CasusBelli, goalOverride?: WarGoal): War {
  const goal = goalOverride ?? goalFor(w, attacker, target, cb);
  // A war on a subject is a war on its overlord, unless it is a war of independence.
  const tOverlord = w.countries[target].overlord;
  const defLeader = goal.type !== 'independence' && tOverlord && SUBJECT_TYPES[w.countries[target].subjectType!]?.joinsWars ? topOverlord(w, target) : target;
  const war: War = {
    id: newId(w, 'w'), name: warName(w, attacker, target, goal), attackers: [attacker], defenders: [target],
    attackerLeader: attacker, defenderLeader: defLeader, goal, start: w.turn, battleScore: 0, score: 0, lastScoreChange: 0,
  };
  if (defLeader !== target) war.defenders.push(defLeader);
  w.wars[war.id] = war;
  for (const t of [...w.treaties]) {
    const involves = (x: string, y: string) => (t.a === x && t.b === y) || (t.a === y && t.b === x);
    if (involves(attacker, target) || involves(attacker, defLeader)) w.treaties = w.treaties.filter((z) => z !== t);
  }
  const a = w.countries[attacker];
  if (hasTreaty(w, 'truce', attacker, target)) {
    a.stability = clamp(a.stability - 20, 0, 100);
    a.prestige = clamp(a.prestige - 10, 0, 100);
    a.infamy += 20;
  }
  a.infamy += cb.infamy;
  a.stability = clamp(a.stability - cb.stability, 0, 100);
  addOpinion(w, attacker, target, -100);
  // Subjects join their overlords.
  for (const side of ['attackers', 'defenders'] as const) {
    for (const leader of [...war[side]]) {
      for (const s of subjectsOf(w, leader)) {
        const st = w.countries[s].subjectType;
        if (st && SUBJECT_TYPES[st].joinsWars && !(goal.type === 'independence' && s === attacker)) joinWar(w, war, s, side);
      }
    }
  }
  // Allies and guarantors of the defender.
  const defenderFriends = new Set<string>([...alliesOf(w, defLeader), ...alliesOf(w, target)]);
  for (const t of treatiesOf(w, target, 'guarantee')) if (t.b === target) defenderFriends.add(t.a);
  for (const ally of defenderFriends) {
    if (ally === attacker || war.defenders.includes(ally) || war.attackers.includes(ally)) continue;
    if (ally === w.playerId) {
      offerCallToArms(w, war, defLeader, ally, 'defenders');
    } else if (willJoin(w, ally, defLeader, attacker, true)) {
      joinWar(w, war, ally, 'defenders');
    } else {
      w.treaties = w.treaties.filter((t) => !(t.type === 'alliance' && ((t.a === ally && (t.b === defLeader || t.b === target)) || (t.b === ally && (t.a === defLeader || t.a === target)))));
      addOpinion(w, ally, defLeader, -40);
    }
  }
  for (const ally of alliesOf(w, attacker)) {
    if (war.defenders.includes(ally) || war.attackers.includes(ally)) continue;
    if (ally === w.playerId) offerCallToArms(w, war, attacker, ally, 'attackers');
    else if (willJoin(w, ally, attacker, target, false)) joinWar(w, war, ally, 'attackers');
  }
  // The world's opinion of the aggressor.
  for (const c of Object.values(w.countries)) {
    if (!c.alive || c.id === attacker) continue;
    if (borders(w, c.id, attacker) || borders(w, c.id, target)) addOpinion(w, c.id, attacker, -cb.infamy * 0.6);
  }
  touch(w);
  chronicle(w, { text: `${countryName(w, attacker)} declares war on ${countryName(w, target)}${cb.type !== 'none' ? ` (${cb.label.toLowerCase()})` : ' without just cause'}.`, category: 'war', countries: [attacker, target], importance: powerScore(w, attacker) + powerScore(w, target) > 300 ? 3 : 2 });
  const pSide = sideOf(war, w.playerId);
  if (pSide && attacker !== w.playerId) notify(w, `War! ${countryName(w, attacker)} has declared war on ${target === w.playerId ? 'us' : countryName(w, target)}.`, 'danger');
  return war;
}

function offerCallToArms(w: WorldState, war: War, from: string, to: string, side: 'attackers' | 'defenders'): void {
  const offer: Offer = {
    id: newId(w, 'o'), from, to, kind: 'call_to_arms', turn: w.turn, expires: w.turn + 2, warId: war.id,
    text: `${countryName(w, from)} calls upon us to honour our alliance and join the ${war.name} on the side of the ${side}.`,
  };
  w.offers.push(offer);
}

export function answerCallToArms(w: WorldState, offer: Offer, accept: boolean): void {
  const war = offer.warId ? w.wars[offer.warId] : undefined;
  if (!war) return;
  const side = war.attackers.includes(offer.from) ? 'attackers' : 'defenders';
  if (accept) {
    joinWar(w, war, offer.to, side);
    addOpinion(w, offer.to, offer.from, 20);
    chronicle(w, { text: `${countryName(w, offer.to)} joins the ${war.name}.`, category: 'war', countries: [offer.to], importance: 1 });
  } else {
    w.treaties = w.treaties.filter((t) => !(t.type === 'alliance' && ((t.a === offer.to && t.b === offer.from) || (t.b === offer.to && t.a === offer.from))));
    addOpinion(w, offer.to, offer.from, -60);
    w.countries[offer.to].prestige = clamp(w.countries[offer.to].prestige - 10, 0, 100);
    chronicle(w, { text: `${countryName(w, offer.to)} refuses to honour its alliance with ${countryName(w, offer.from)}.`, category: 'diplomacy', countries: [offer.to, offer.from], importance: 1 });
  }
}

// ---------------------------------------------------------------------------
// War score
// ---------------------------------------------------------------------------

export function provinceValue(w: WorldState, pid: string): number {
  const p = w.provinces[pid];
  const cap = p.owner && w.countries[p.owner]?.capital === pid;
  return Math.sqrt(Math.max(1, p.pop)) * (cap ? 3 : 1);
}

function sideValue(w: WorldState, members: string[]): { total: number; lostTo: (enemies: string[]) => number } {
  const provs = members.flatMap((m) => provincesOf(w, m));
  const total = provs.reduce((s, id) => s + provinceValue(w, id), 0) || 1;
  return {
    total,
    lostTo: (enemies) => provs.reduce((s, id) => {
      const ctrl = w.provinces[id].controller;
      return s + (ctrl && ctrl !== REBELS && enemies.includes(ctrl) ? provinceValue(w, id) : 0);
    }, 0),
  };
}

export function updateWarScores(w: WorldState): void {
  for (const war of Object.values(w.wars)) {
    war.attackers = war.attackers.filter((c) => alive(w, c));
    war.defenders = war.defenders.filter((c) => alive(w, c));
    if (!war.attackers.length || !war.defenders.length) { endWar(w, war, 'collapsed'); continue; }
    if (!war.attackers.includes(war.attackerLeader)) war.attackerLeader = war.attackers[0];
    if (!war.defenders.includes(war.defenderLeader)) war.defenderLeader = war.defenders[0];
    const A = sideValue(w, war.attackers), D = sideValue(w, war.defenders);
    const occ = (100 * D.lostTo(war.attackers)) / D.total - (100 * A.lostTo(war.defenders)) / A.total;
    if (war.goal.type === 'conquest') {
      const ctrl = w.provinces[war.goal.province]?.controller;
      if (ctrl && war.attackers.includes(ctrl)) war.lastScoreChange = Math.min(25, war.lastScoreChange + 1);
      else if (w.turn - war.start > 12) war.lastScoreChange = Math.max(-15, war.lastScoreChange - 0.4);
    }
    war.score = Math.round(clamp(occ * 0.8 + war.battleScore + war.lastScoreChange, -100, 100) * 10) / 10;
  }
}

function endWar(w: WorldState, war: War, reason: string): void {
  restoreControl(w, war, []);
  delete w.wars[war.id];
  touch(w);
  chronicle(w, { text: `The ${war.name} ends (${reason}).`, category: 'peace', countries: [...war.attackers, ...war.defenders], importance: 1 });
}

// ---------------------------------------------------------------------------
// Peace
// ---------------------------------------------------------------------------

export function emptyTerms(): PeaceTerms {
  return { provinces: [], reparations: 0, tribute: false, subjugate: false, independence: false, humiliate: false };
}

/** Score cost of terms imposed by `winner` side on `loser` members. */
export function peaceCost(w: WorldState, war: War, winnerSide: 'attackers' | 'defenders', terms: PeaceTerms, loserIds?: string[]): number {
  const losers = loserIds ?? (winnerSide === 'attackers' ? war.defenders : war.attackers);
  const winners = winnerSide === 'attackers' ? war.attackers : war.defenders;
  const totalLoser = losers.flatMap((m) => provincesOf(w, m)).reduce((s, id) => s + provinceValue(w, id), 0) || 1;
  let cost = 0;
  for (const pid of terms.provinces) {
    const occupied = winners.includes(w.provinces[pid]?.controller ?? '');
    cost += clamp((100 * provinceValue(w, pid)) / totalLoser * 1.4, 3, 60) * (occupied ? 1 : 1.6);
  }
  const loserIncome = losers.reduce((s, m) => s + (w.countries[m]?.last.income ?? 0), 0);
  cost += (terms.reparations / Math.max(1, loserIncome * 12)) * 40;
  if (terms.tribute) cost += 30;
  if (terms.subjugate) cost += 60;
  if (terms.independence) cost += 40;
  if (terms.humiliate) cost += 12;
  return Math.round(cost);
}

export function peaceBlocker(w: WorldState, war: War, proposer: string, terms: PeaceTerms): string | null {
  const side = sideOf(war, proposer);
  if (!side) return 'We are not part of this war.';
  const enemies = side === 'attackers' ? war.defenders : war.attackers;
  for (const pid of terms.provinces) if (!enemies.includes(w.provinces[pid]?.owner ?? '')) return `${provinceName(pid)} is not held by an enemy.`;
  if (terms.subjugate && terms.tribute) return 'Choose either tribute or vassalage.';
  return null;
}

/** Would the other side accept these terms? Positive margin = acceptance. */
export function peaceAcceptance(w: WorldState, war: War, proposer: string, terms: PeaceTerms, demanding: boolean): { accept: boolean; cost: number; margin: number } {
  const side = sideOf(war, proposer)!;
  const myScore = side === 'attackers' ? war.score : -war.score;
  const otherLeader = side === 'attackers' ? war.defenderLeader : war.attackerLeader;
  const other = w.countries[otherLeader];
  const months = w.turn - war.start;
  const willingness = other.warExhaustion / 3 + (months > 24 ? 8 : months > 12 ? 3 : 0) + (other.stability < 25 ? 8 : 0);
  if (demanding) {
    const cost = peaceCost(w, war, side, terms);
    const margin = myScore + willingness - cost;
    return { accept: margin >= 0, cost, margin };
  }
  // We concede (terms are what we give up): they accept if it's at least what they could demand, roughly.
  const cost = peaceCost(w, war, side === 'attackers' ? 'defenders' : 'attackers', terms);
  const theirScore = -myScore;
  const margin = cost + 10 - theirScore * 0.8 + willingness;
  // Early in a war an undefeated enemy wants to see what the campaign brings.
  const patient = months < 6 + def(otherLeader).personality.aggression * 12 && theirScore > -10;
  return { accept: margin >= 0 && !(patient && cost < 5) || (theirScore < 5 && !patient), cost, margin };
}

function restoreControl(w: WorldState, war: War, keep: string[]): void {
  const members = new Set([...war.attackers, ...war.defenders]);
  for (const p of Object.values(w.provinces)) {
    if (keep.includes(p.id)) continue;
    if (p.owner && members.has(p.owner) && p.controller !== p.owner && p.controller && members.has(p.controller)) {
      // Only revert if no other war keeps them at odds.
      p.controller = p.owner;
      p.siege = undefined;
    }
  }
}

function sendArmiesHome(w: WorldState): void {
  for (const a of Object.values(w.armies)) {
    if (a.rebel || a.status === 'embarked') continue;
    const p = w.provinces[a.location];
    const holder = p?.controller ?? p?.owner;
    if (!holder || holder === a.owner || topOverlord(w, holder) === topOverlord(w, a.owner) || hasTreaty(w, 'alliance', a.owner, holder) || hasTreaty(w, 'access', a.owner, holder)) continue;
    if (warsOf(w, a.owner).some((war) => (war.attackers.includes(holder) || war.defenders.includes(holder)))) continue;
    const home = provincesOf(w, a.owner).filter((id) => w.provinces[id].controller === a.owner).sort((x, y) => provinceDistance(a.location, x) - provinceDistance(a.location, y))[0];
    a.location = home ?? firstHeld(w, a.owner);
    a.path = [];
    a.status = 'idle';
  }
}

/** Conclude peace. If `separate` is given, only that participant leaves the war. */
export function makePeace(w: WorldState, war: War, winnerSide: 'attackers' | 'defenders' | 'white', terms: PeaceTerms, separate?: string): void {
  const winners = winnerSide === 'white' ? [] : winnerSide === 'attackers' ? war.attackers : war.defenders;
  const losers = winnerSide === 'white' ? [] : (separate ? [separate] : winnerSide === 'attackers' ? war.defenders : war.attackers);
  const winnerLeader = winnerSide === 'attackers' ? war.attackerLeader : war.defenderLeader;
  const transferred: string[] = [];
  if (winnerSide !== 'white') {
    for (const pid of terms.provinces) {
      const p = w.provinces[pid];
      if (!p || !losers.includes(p.owner ?? '')) continue;
      // Cores first, then the occupier, then whichever victor lies closest and can administer it.
      const nearest = winners.filter((m) => alive(w, m) && canHold(w, m, pid))
        .sort((x, y) => Math.min(...provincesOf(w, x).map((q) => provinceDistance(q, pid))) - Math.min(...provincesOf(w, y).map((q) => provinceDistance(q, pid))))[0];
      const claimant = winners.find((m) => p.cores.includes(m))
        ?? (p.controller && winners.includes(p.controller) && canHold(w, p.controller, pid) ? p.controller : nearest ?? winnerLeader);
      const prevOwner = p.owner!;
      p.owner = claimant;
      p.controller = claimant;
      p.siege = undefined;
      if (!p.cores.includes(claimant)) p.cores.push(claimant);
      transferred.push(pid);
      w.countries[claimant].stats.provincesGained++;
      w.countries[prevOwner].stats.provincesLost++;
      w.countries[claimant].infamy += 6;
      if (w.countries[prevOwner].capital === pid) {
        const rest = provincesOf(w, prevOwner).filter((x) => x !== pid);
        if (rest.length) w.countries[prevOwner].capital = rest[0];
      }
      w.construction = w.construction.filter((k) => k.province !== pid);
    }
    const loserLead = losers[0];
    if (terms.reparations > 0 && loserLead) {
      const lc = w.countries[loserLead];
      const now = Math.min(Math.max(0, lc.treasury), terms.reparations);
      lc.treasury -= now;
      w.countries[winnerLeader].treasury += now;
      const rest = terms.reparations - now;
      if (rest > 1) w.treaties.push({ id: newId(w, 't'), type: 'subsidy', a: loserLead, b: winnerLeader, start: w.turn, expires: w.turn + 24, amount: Math.round(rest / 24) });
    }
    if ((terms.tribute || terms.subjugate) && loserLead) {
      const lc = w.countries[loserLead];
      lc.overlord = winnerLeader;
      lc.subjectType = terms.subjugate ? 'vassal' : 'tributary';
      lc.liberty = 30;
    }
    if (terms.independence) {
      for (const m of winners) {
        const mc = w.countries[m];
        if (mc.overlord && losers.includes(mc.overlord)) { mc.overlord = undefined; mc.subjectType = undefined; mc.liberty = 0; }
      }
      for (const m of losers) {
        const mc = w.countries[m];
        if (mc.overlord && winners.includes(mc.overlord)) { mc.overlord = undefined; mc.subjectType = undefined; }
      }
    }
    if (terms.humiliate && loserLead) {
      w.countries[loserLead].prestige = clamp(w.countries[loserLead].prestige - 20, 0, 100);
      w.countries[winnerLeader].prestige = clamp(w.countries[winnerLeader].prestige + 15, 0, 100);
    }
    for (const m of winners) w.countries[m].prestige = clamp(w.countries[m].prestige + 5, 0, 100);
  }
  const leaving = separate ? [separate] : [...war.attackers, ...war.defenders];
  const opp = separate ? (war.attackers.includes(separate) ? war.defenders : war.attackers) : [];
  // Truces between the parties.
  const pairs: [string, string][] = [];
  if (separate) for (const o of opp) pairs.push([separate, o]);
  else for (const a of war.attackers) for (const d of war.defenders) pairs.push([a, d]);
  for (const [a, b] of pairs) {
    if (!hasTreaty(w, 'truce', a, b)) w.treaties.push({ id: newId(w, 't'), type: 'truce', a, b, start: w.turn, expires: w.turn + 60 });
  }
  if (separate) {
    war.attackers = war.attackers.filter((c) => c !== separate);
    war.defenders = war.defenders.filter((c) => c !== separate);
    for (const p of Object.values(w.provinces)) {
      if (transferred.includes(p.id)) continue;
      if ((p.owner === separate && opp.includes(p.controller ?? '')) || (p.controller === separate && opp.includes(p.owner ?? ''))) p.controller = p.owner;
    }
  } else {
    restoreControl(w, war, transferred);
    delete w.wars[war.id];
  }
  for (const c of leaving) if (w.countries[c]) w.countries[c].warExhaustion = clamp(w.countries[c].warExhaustion - 15, 0, 100);
  sendArmiesHome(w);
  if (transferred.length) garrisonConquests(w, w.playerId, transferred);
  touch(w);
  const desc = winnerSide === 'white' ? 'a white peace' : `${countryName(w, winnerLeader)}'s favour${transferred.length ? `; ${transferred.map(provinceName).join(', ')} change hands` : ''}`;
  chronicle(w, { text: `${separate ? `${countryName(w, separate)} makes a separate peace in the ${war.name}` : `The ${war.name} ends`} with ${desc}.`, category: 'peace', countries: leaving, importance: transferred.length ? 3 : 2 });
  if (leaving.includes(w.playerId) || opp.includes(w.playerId)) notify(w, `Peace concluded in the ${war.name}.`, 'success');
}

/** Terms an AI winner asks for, sized to its war score. */
export function suggestTerms(w: WorldState, war: War, side: 'attackers' | 'defenders', budget: number): PeaceTerms {
  const terms = emptyTerms();
  const winners = side === 'attackers' ? war.attackers : war.defenders;
  const losers = side === 'attackers' ? war.defenders : war.attackers;
  const leader = side === 'attackers' ? war.attackerLeader : war.defenderLeader;
  const candidates = losers.flatMap((m) => provincesOf(w, m))
    .filter((id) => winners.includes(w.provinces[id].controller ?? '') || w.provinces[id].cores.some((c) => winners.includes(c)))
    .filter((id) => neighbors(id).some((n) => winners.includes(w.provinces[n]?.owner ?? '')) || w.provinces[id].cores.includes(leader))
    .sort((a, b) => provinceValue(w, b) - provinceValue(w, a));
  if (war.goal.type === 'conquest' && candidates.includes(war.goal.province)) {
    candidates.splice(candidates.indexOf(war.goal.province), 1);
    candidates.unshift(war.goal.province);
  }
  for (const pid of candidates) {
    terms.provinces.push(pid);
    if (peaceCost(w, war, side, terms) > budget) { terms.provinces.pop(); break; }
    if (terms.provinces.length >= 4) break;
  }
  if (war.goal.type === 'independence' && side === 'attackers') terms.independence = true;
  if (war.goal.type === 'subjugate' && side === 'attackers' && peaceCost(w, war, side, { ...terms, tribute: true }) <= budget) terms.tribute = true;
  const loserIncome = losers.reduce((s, m) => s + (w.countries[m]?.last.income ?? 0), 0);
  const left = budget - peaceCost(w, war, side, terms);
  if (left > 5) terms.reparations = Math.round((left / 40) * loserIncome * 12 * 0.6);
  if (!terms.provinces.length && !terms.reparations && !terms.tribute && !terms.independence) terms.humiliate = budget >= 12;
  return terms;
}

export function describeTerms(w: WorldState, terms: PeaceTerms): string {
  const parts: string[] = [];
  if (terms.provinces.length) parts.push(`cession of ${terms.provinces.map(provinceName).join(', ')}`);
  if (terms.reparations > 0) parts.push(`reparations of £${Math.round(terms.reparations)}k`);
  if (terms.tribute) parts.push('tributary status');
  if (terms.subjugate) parts.push('vassalage');
  if (terms.independence) parts.push('independence');
  if (terms.humiliate) parts.push('public humiliation');
  return parts.length ? parts.join('; ') : 'a white peace (status quo ante bellum)';
}
