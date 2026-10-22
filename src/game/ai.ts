// AI rulers: every AI polity weighs its treasury, threats, alliances, stability and
// ambitions, then acts through the same validated actions as the player.
import { applyAction } from './actions';
import { buildBlocker, buildingQuote, laborInUse, laborPool } from './construction';
import { hashString } from '../data/define';
import { evaluateProposal, maxEnvoys, performDiplomacy } from './diplomacy';
import { armyUpkeep, creditAvailable, takeLoan } from './economy';
import { armyPower, findPath, orderMove, recruitCost, supplyLimit } from './military';
import { fleetStrength, orderFleet, provincesOnSea, startExpedition, planExpedition } from './naval';
import { chance, rand } from './rng';
import {
  alliesOf, armiesOf, armyRegiments, fleetsOf, atWar, def, hasTreaty, hostile, isAtWar, newId, opinion, provincesOf, sideOf, warsOf, friendly, neighbourCountries,
} from './state';
import { coastalSeas, isCoastal, neighbors, provinceDistance } from './static';
import { availableTechs, techCost } from './tech';
import { blocPower, casusBelli, declareWar, peaceAcceptance, powerScore, suggestTerms, makePeace, emptyTerms } from './war';
import type { Army, BuildingId, Fleet, TechCategory, UnitType, War, WorldState } from './types';
import { REBELS } from './constants';

function stagger(w: WorldState, c: string, period: number): boolean {
  return (hashString(c) + w.turn) % period === 0;
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------
export function chooseResearch(w: WorldState, c: string): string | null {
  const p = def(c).personality;
  const weights: Record<TechCategory, number> = {
    agriculture: 1 + p.caution, medicine: 0.9 + p.caution * 0.5, industry: 0.6 + p.reform * 1.5, steam: 0.4 + p.reform * 1.4,
    metallurgy: 0.6 + p.reform, education: 0.6 + p.reform, shipbuilding: isCoastal(w.countries[c].capital) ? 0.4 + p.mercantile * 0.8 : 0.1,
    military: 0.7 + p.aggression * 1.4, administration: 0.9 + p.reform * 0.6, commerce: 0.6 + p.mercantile * 1.2,
  };
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const t of availableTechs(w, c)) {
    const score = weights[t.category] / Math.max(30, techCost(w, c, t.id)) * (1 + (hashString(c + t.id) % 100) / 400);
    if (score > bestScore) { bestScore = score; best = t.id; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Economy, construction, recruitment
// ---------------------------------------------------------------------------
function manageEconomy(w: WorldState, c: string): void {
  const country = w.countries[c];
  const L = country.last;
  const avgUnrest = provincesOf(w, c).reduce((s, id) => s + w.provinces[id].unrest, 0) / Math.max(1, provincesOf(w, c).length);
  if (L.balance < 0 && avgUnrest < 35 && country.taxRate < 0.2) country.taxRate = Math.min(0.2, country.taxRate + 0.01);
  else if ((avgUnrest > 45 || L.balance > L.income * 0.35) && country.taxRate > 0.04) country.taxRate = Math.max(0.04, country.taxRate - 0.01);
  if (country.treasury < 0 && creditAvailable(w, c) > 0) takeLoan(w, c, Math.min(creditAvailable(w, c), -country.treasury + L.income * 2));
  // Repay term loans when flush.
  const term = country.loans.find((l) => l.monthsLeft !== null);
  if (term && country.treasury > term.principal + L.expenses * 6) { country.treasury -= term.principal; country.loans = country.loans.filter((l) => l !== term); }
  // Pay down perpetual debt (consols, rentes) out of a large surplus.
  const perpetual = country.loans.filter((l) => l.monthsLeft === null).sort((a, b) => b.rate - a.rate)[0];
  if (perpetual && country.treasury > L.expenses * 10) {
    const pay = Math.min(perpetual.principal, country.treasury - L.expenses * 8);
    perpetual.principal -= pay;
    country.treasury -= pay;
    if (perpetual.principal < 1) country.loans = country.loans.filter((l) => l !== perpetual);
  }
  const p = def(c).personality;
  const flush = country.treasury > Math.max(50, L.income * 12);
  country.budget.research = L.balance > 0 ? 0.8 + p.reform * 0.6 + (flush ? 0.4 : 0) : 0.6;
  country.budget.administration = flush ? 1.25 : L.balance < 0 ? 0.9 : 1;
  country.budget.espionage = 0.3 + p.aggression * 0.4;
}

const BUILD_PRIORITY: { b: BuildingId; score: (w: WorldState, c: string, pid: string) => number }[] = [
  { b: 'workshop', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 0.8 },
  { b: 'market', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 0.7 },
  { b: 'road', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 0.5 },
  { b: 'port', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 0.6 * def(c).personality.mercantile },
  { b: 'textile_mill', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 1.6 * (0.5 + def(c).personality.reform) },
  { b: 'ironworks', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 1.3 * (0.5 + def(c).personality.reform) },
  { b: 'steam_works', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 1.2 * (0.5 + def(c).personality.reform) },
  { b: 'school', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 0.4 * (0.5 + def(c).personality.reform) },
  { b: 'temple', score: (w, c, pid) => w.provinces[pid].unrest * 0.6 },
  { b: 'courthouse', score: (w, c, pid) => w.countries[c].corruption * 0.3 + w.provinces[pid].unrest * 0.3 },
  { b: 'granary', score: (w, c) => (w.countries[c].foodStock < 1.5 ? 25 : 2) },
  { b: 'irrigation', score: (w, c, pid) => (w.countries[c].foodStock < 2 ? Math.sqrt(w.provinces[pid].pop) * 0.8 : 1) },
  { b: 'fortress', score: (w, c, pid) => neighbors(pid).some((n) => { const o = w.provinces[n]?.owner; return o && o !== c && (opinion(w, c, o) < -30); }) ? 18 * def(c).personality.caution : 0 },
  { b: 'mine', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 0.9 },
  { b: 'hospital', score: (w, c, pid) => Math.sqrt(w.provinces[pid].pop) * 0.25 },
];

function manageConstruction(w: WorldState, c: string): void {
  const country = w.countries[c];
  const reserve = Math.max(20, country.last.expenses * 3);
  if (country.treasury < reserve) return;
  if (laborInUse(w, c) > laborPool(w, c) * 1.2) return;
  const provs = provincesOf(w, c).filter((id) => w.provinces[id].controller === c);
  if (!provs.length) return;
  const sample = provs.length > 12 ? provs.filter((_, i) => (i + w.turn) % Math.ceil(provs.length / 12) === 0) : provs;
  // Richer states start several projects at once; each must leave the reserve intact.
  const projects = Math.min(4, 1 + Math.floor(country.treasury / Math.max(40, reserve * 2)));
  for (let k = 0; k < projects; k++) {
    if (country.treasury < reserve || laborInUse(w, c) > laborPool(w, c) * 1.2) return;
    let best: { pid: string; b: BuildingId; value: number } | null = null;
    for (const pid of sample) {
      for (const bp of BUILD_PRIORITY) {
        if (buildBlocker(w, c, pid, bp.b)) continue;
        const q = buildingQuote(w, c, pid, bp.b);
        if (q.cost > country.treasury - reserve * 0.5) continue;
        const value = bp.score(w, c, pid) / Math.max(5, q.cost) * 100;
        if (!best || value > best.value) best = { pid, b: bp.b, value };
      }
    }
    if (!best) return;
    const r = applyAction(w, c, { type: 'build', province: best.pid, building: best.b });
    if (!r.ok) return;
  }
}

export function threatLevel(w: WorldState, c: string): number {
  const mine = Math.max(1, powerScore(w, c));
  let t = 0;
  for (const o of neighbourCountries(w, c)) {
    if (friendly(w, c, o)) continue;
    const hostility = opinion(w, c, o) < -40 || w.countries[c].rivals.includes(o) ? 1 : opinion(w, c, o) < 0 ? 0.4 : 0.1;
    t += hostility * powerScore(w, o) / mine;
  }
  if (isAtWar(w, c)) t += 1;
  return Math.min(3, t);
}

function manageArmy(w: WorldState, c: string): void {
  const country = w.countries[c];
  const d = def(c);
  const income = Math.max(1, country.last.income);
  const upkeep = armyUpkeep(w, c);
  const threat = threatLevel(w, c);
  const targetShare = 0.18 + d.personality.aggression * 0.15 + threat * 0.12 + (isAtWar(w, c) ? 0.15 : 0);
  if (upkeep > income * 0.85 && country.last.balance < 0 && !isAtWar(w, c)) {
    const armies = Object.values(w.armies).filter((a) => a.owner === c).sort((a, b) => armyRegiments(a) - armyRegiments(b));
    if (armies[0]) applyAction(w, c, { type: 'disband', army: armies[0].id });
    return;
  }
  if (upkeep >= income * targetShare || country.treasury < income) return;
  const cap = w.countries[c].capital;
  const site = w.provinces[cap]?.controller === c ? cap : provincesOf(w, c).find((id) => w.provinces[id].controller === c);
  if (!site) return;
  const decentral = ['decentralized', 'nomadic'].includes(d.polityType);
  const roll = rand(w);
  let unit: UnitType = decentral ? 'irregulars' : roll < 0.6 ? 'infantry' : roll < 0.85 ? 'cavalry' : 'artillery';
  if (unit === 'artillery' && !country.techs.includes('blast_furnace')) unit = 'infantry';
  const count = Math.max(1, Math.min(5, Math.floor(country.treasury / Math.max(1, recruitCost(w, c, unit, 1)) / 3)));
  applyAction(w, c, { type: 'recruit', province: site, unit, count });
}

// ---------------------------------------------------------------------------
// Diplomacy
// ---------------------------------------------------------------------------
function manageDiplomacy(w: WorldState, c: string): void {
  const country = w.countries[c];
  if (country.overlord) return;
  const p = def(c).personality;
  // Envoys to strong neighbours we are wary of, or to potential allies.
  if (country.envoys.length < maxEnvoys(w, c) && chance(w, 0.5)) {
    const nbrs = neighbourCountries(w, c).filter((o) => !country.envoys.includes(o));
    const target = nbrs.sort((a, b) => powerScore(w, b) - powerScore(w, a))[0];
    if (target && opinion(w, c, target) < 60 && !atWar(w, c, target)) performDiplomacy(w, c, target, 'envoy');
  }
  country.envoys = country.envoys.filter((t) => opinion(w, c, t) < 90);
  // Alliances against threats.
  if (alliesOf(w, c).length < 2 && threatLevel(w, c) > 0.6 && chance(w, 0.4 + p.diplomacy * 0.4)) {
    const pool = new Set<string>([...neighbourCountries(w, c), ...neighbourCountries(w, c).flatMap((n) => neighbourCountries(w, n))]);
    const candidates = [...pool].map((id) => w.countries[id]).filter((o) => o && o.alive && o.id !== c && !o.overlord && !hasTreaty(w, 'alliance', c, o.id) && opinion(w, c, o.id) > 0 && powerScore(w, o.id) > powerScore(w, c) * 0.3);
    const ranked = candidates.map((o) => ({ id: o.id, s: evaluateProposal(w, c, o.id, 'alliance').score + powerScore(w, o.id) / 50 })).sort((a, b) => b.s - a.s);
    for (const cand of ranked.slice(0, 3)) {
      if (cand.id === w.playerId) {
        if (chance(w, 0.25) && opinion(w, c, cand.id) > 30) performDiplomacy(w, c, cand.id, 'alliance');
        break;
      }
      const r = performDiplomacy(w, c, cand.id, 'alliance');
      if (r.ok) break;
    }
  }
  // Commerce and dynastic marriage.
  if (chance(w, 0.15 * p.mercantile)) {
    const partner = neighbourCountries(w, c).map((id) => w.countries[id]).find((o) => o.alive && !o.overlord && !hasTreaty(w, 'trade', c, o.id) && opinion(w, c, o.id) > 20);
    if (partner) {
      if (partner.id !== w.playerId || chance(w, 0.3)) performDiplomacy(w, c, partner.id, 'trade');
    }
  }
  // Tribute demands on much weaker neighbours.
  if (p.aggression > 0.55 && chance(w, 0.08)) {
    const weak = neighbourCountries(w, c).find((o) => !w.countries[o].overlord && blocPower(w, c) > blocPower(w, o) * 5);
    if (weak) performDiplomacy(w, c, weak, 'tribute_demand');
  }
}

// ---------------------------------------------------------------------------
// War and peace
// ---------------------------------------------------------------------------
function considerWar(w: WorldState, c: string): void {
  const country = w.countries[c];
  if (w.turn < country.ai.nextWarCheck) return;
  const d = def(c);
  country.ai.nextWarCheck = w.turn + 6 + Math.floor(rand(w) * 12);
  if (country.overlord || isAtWar(w, c) || country.stability < 35 || country.warExhaustion > 15 || country.treasury < country.last.expenses * 2) return;
  if (['decentralized', 'colony'].includes(d.polityType) && rand(w) > 0.2) return;
  if (rand(w) > d.personality.aggression * 0.8) return;
  const myPower = blocPower(w, c);
  const targets = neighbourCountries(w, c);
  let best: { t: string; score: number } | null = null;
  for (const t of targets) {
    if (friendly(w, c, t) || hasTreaty(w, 'truce', c, t) || hasTreaty(w, 'nap', c, t) || w.countries[t].overlord === c) continue;
    const theirOverlord = w.countries[t].overlord;
    const theirPower = blocPower(w, theirOverlord ?? t) + (theirOverlord ? blocPower(w, t) * 0.5 : 0);
    const ratio = myPower / Math.max(1, theirPower);
    const need = 1.5 + d.personality.caution;
    if (ratio < need) continue;
    const cbs = casusBelli(w, c, t);
    const hasGood = cbs.some((x) => x.type !== 'none');
    if (!hasGood && d.personality.aggression < 0.75) continue;
    // Loose aggregates of peoples are rarely worth a formal war; colonial frontiers creep instead.
    if (def(t).aggregate && rand(w) > 0.25) continue;
    const score = ratio * 10 - opinion(w, c, t) / 5 + (cbs.some((x) => x.type === 'claim') ? 15 : 0) + (country.rivals.includes(t) ? 10 : 0) - (t === w.playerId && w.campaign.difficulty === 'easy' ? 15 : 0);
    if (!best || score > best.score) best = { t, score };
  }
  if (!best) return;
  const cb = casusBelli(w, c, best.t).sort((a, b) => a.infamy - b.infamy)[0];
  declareWar(w, c, best.t, cb);
}

function leaderOf(war: War, side: 'attackers' | 'defenders'): string {
  return side === 'attackers' ? war.attackerLeader : war.defenderLeader;
}

function considerPeace(w: WorldState, c: string): void {
  for (const war of warsOf(w, c)) {
    const side = sideOf(war, c)!;
    const isLeader = leaderOf(war, side) === c;
    const enemySide = side === 'attackers' ? 'defenders' : 'attackers';
    const enemyLeader = leaderOf(war, enemySide);
    const myScore = side === 'attackers' ? war.score : -war.score;
    const country = w.countries[c];
    const months = w.turn - war.start;
    if (months < 3) continue;
    const lastOffer = (w.flags[`peaceoffer_${war.id}_${c}`] as number) ?? -99;
    if (w.turn - lastOffer < 6) continue;
    if (!isLeader) {
      // Minor participants seek a separate white peace when exhausted.
      if (country.warExhaustion > 45 && myScore < 10 && enemyLeader !== w.playerId) {
        const acc = peaceAcceptance(w, war, c, emptyTerms(), false);
        if (acc.accept) makePeace(w, war, 'white', emptyTerms(), c);
        w.flags[`peaceoffer_${war.id}_${c}`] = w.turn;
      }
      continue;
    }
    if (myScore >= 25 || (myScore >= 12 && country.warExhaustion > 35) || (months > 36 && myScore > 5)) {
      const terms = suggestTerms(w, war, side, myScore + w.countries[enemyLeader].warExhaustion / 4);
      w.flags[`peaceoffer_${war.id}_${c}`] = w.turn;
      if (enemyLeader === w.playerId) {
        w.offers.push({ id: newId(w, 'o'), from: c, to: w.playerId, kind: 'peace', turn: w.turn, expires: w.turn + 2, warId: war.id, terms, text: `${def(c).short} offers to end the ${war.name} if we accept: ` });
      } else if (peaceAcceptance(w, war, c, terms, true).accept) {
        makePeace(w, war, side, terms);
        return;
      }
    } else if (myScore <= -25 || country.warExhaustion > 60 || (months > 48 && myScore < 5)) {
      const terms = myScore <= -40 ? suggestTerms(w, war, enemySide, -myScore * 0.8) : emptyTerms();
      w.flags[`peaceoffer_${war.id}_${c}`] = w.turn;
      if (enemyLeader === w.playerId) {
        const offer = { id: newId(w, 'o'), from: c, to: w.playerId, kind: 'peace' as const, turn: w.turn, expires: w.turn + 2, warId: war.id, terms, text: `${def(c).short} sues for peace in the ${war.name}, offering: ` };
        w.offers.push(offer);
        w.flags[`peace_concede_${offer.id}`] = true;
      } else {
        const acc = peaceAcceptance(w, war, c, terms, false);
        if (acc.accept) { makePeace(w, war, terms.provinces.length || terms.reparations ? enemySide : 'white', terms); return; }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Military operations
// ---------------------------------------------------------------------------
function enemiesOf(w: WorldState, c: string): Set<string> {
  const out = new Set<string>();
  for (const war of warsOf(w, c)) {
    const side = sideOf(war, c);
    for (const e of side === 'attackers' ? war.defenders : war.attackers) out.add(e);
  }
  return out;
}

function enemyHeldProvinces(w: WorldState, c: string, enemies: Set<string>): string[] {
  const out: string[] = [];
  for (const p of Object.values(w.provinces)) {
    const holder = p.controller ?? p.owner;
    if (!holder) continue;
    if (enemies.has(holder) || (holder === REBELS && p.owner === c) || (p.owner === c && holder !== c && enemies.has(holder))) out.push(p.id);
  }
  return out;
}

function nearestTarget(w: WorldState, a: Army, candidates: string[], goal?: string): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const id of candidates) {
    let d = provinceDistance(a.location, id);
    if (d > 130 && id !== goal) continue; // map units: ~2,600 km
    if (id === goal) d *= 0.6;
    if (w.countries[w.provinces[id].owner ?? '']?.capital === id) d *= 0.8;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

function armyStrengthAt(w: WorldState, pid: string, pred: (a: Army) => boolean): number {
  return Object.values(w.armies).filter((a) => a.location === pid && a.status !== 'embarked' && pred(a)).reduce((s, a) => s + armyPower(w, a, pid, true), 0);
}

function commandArmies(w: WorldState, c: string): void {
  const enemies = enemiesOf(w, c);
  const rebelsAgainstMe = rebelArmiesAgainst(w, c);
  const mine = armiesOf(w, c);
  if (!mine.length) return;
  if (!enemies.size && !rebelsAgainstMe.length) {
    // Peacetime: idle armies drift back home after wars.
    for (const a of mine.slice()) {
      if (a.status !== 'idle' || a.path.length) continue;
      if (w.provinces[a.location]?.owner !== c && w.provinces[w.countries[c].capital]) { orderMove(w, a, w.countries[c].capital); continue; }
      disperse(w, c, a);
    }
    return;
  }
  const goal = warsOf(w, c).map((war) => (war.goal.type === 'conquest' ? war.goal.province : undefined)).find(Boolean);
  const candidates = enemies.size ? enemyHeldProvinces(w, c, enemies) : [];
  const invaders: Army[] = [];
  for (const e of enemies) for (const x of armiesOf(w, e)) if (x.status !== 'embarked' && w.provinces[x.location]?.owner === c) invaders.push(x);
  for (const a of mine.slice()) {
    if (a.status === 'embarked' || a.status === 'retreating' || !w.armies[a.id]) continue;
    if (a.status === 'sieging' && a.morale > 0.3) continue;
    if (a.path.length && rand(w) < 0.7) continue;
    if (a.morale < 0.35) {
      const home = w.countries[c].capital;
      if (a.location !== home) orderMove(w, a, home);
      continue;
    }
    // Break up stacks that would starve: an overlarge army splits before marching.
    const size = armyRegiments(a);
    if (size >= 6 && size > supplyLimit(w, a.location, c) * 1.6 && !a.path.length) {
      applyAction(w, c, { type: 'splitArmy', army: a.id });
    }
    const myPow = armyPower(w, a, a.location, false);
    // 1) Rebels in our lands.
    const reb = rebelsAgainstMe.sort((x, y) => provinceDistance(a.location, x.location) - provinceDistance(a.location, y.location))[0];
    if (reb && provinceDistance(a.location, reb.location) < 220 && myPow > armyPower(w, reb, reb.location, true) * 1.1) {
      const path = findPath(w, c, a.location, reb.location, 1500);
      if (path) { a.path = path; a.progress = 0; a.status = 'moving'; continue; }
    }
    if (!enemies.size) continue;
    // 2) Enemy armies inside our territory that we can beat.
    const invader = invaders.slice().sort((x, y) => provinceDistance(a.location, x.location) - provinceDistance(a.location, y.location))[0];
    if (invader && provinceDistance(a.location, invader.location) < 400 && myPow > armyStrengthAt(w, invader.location, (x) => hostile(w, a, x)) * 1.15 && findPath(w, c, a.location, invader.location, 2500)) {
      orderMove(w, a, invader.location);
      continue;
    }
    // 3) Otherwise besiege the nearest enemy-held province we can reach and are strong enough for.
    const target = nearestTarget(w, a, candidates, goal);
    if (target) {
      const defending = armyStrengthAt(w, target, (x) => hostile(w, a, x));
      if (myPow > defending * 1.2) {
        const path = findPath(w, c, a.location, target, 3000);
        if (path) { a.path = path; a.progress = 0; a.status = path.length ? 'moving' : 'idle'; continue; }
        // Overseas target: ship the army if we have transports nearby.
        if (isCoastal(a.location) && isCoastal(target) && chance(w, 0.25)) {
          const plan = planExpedition(w, a, target);
          if (typeof plan !== 'string') startExpedition(w, a, target);
        }
      }
    }
  }
}

/** Splits a garrison that exceeds local supply and quarters the detachment in a neighbouring province. */
function disperse(w: WorldState, c: string, a: Army): void {
  const size = armyRegiments(a);
  if (size < 4 || size <= supplyLimit(w, a.location, c) * 1.1) return;
  const options = neighbors(a.location).filter((n) => w.provinces[n]?.owner === c && w.provinces[n].controller === c);
  if (!options.length) return;
  const before = new Set(Object.keys(w.armies));
  if (!applyAction(w, c, { type: 'splitArmy', army: a.id }).ok) return;
  const detachment = Object.values(w.armies).find((x) => !before.has(x.id));
  if (!detachment) return;
  const dest = options.sort((x, y) => supplyLimit(w, y, c) - supplyLimit(w, x, c))[0];
  orderMove(w, detachment, dest);
}

/** Rebel armies fighting against c (rebuilt once per AI pass). */
const rebelCache = new WeakMap<WorldState, { turn: number; byTarget: Map<string, Army[]> }>();
function rebelArmiesAgainst(w: WorldState, c: string): Army[] {
  let rc = rebelCache.get(w);
  if (!rc || rc.turn !== w.turn) {
    const byTarget = new Map<string, Army[]>();
    for (const r of armiesOf(w, REBELS)) {
      const t = r.rebel?.against;
      if (!t) continue;
      const l = byTarget.get(t);
      if (l) l.push(r); else byTarget.set(t, [r]);
    }
    rc = { turn: w.turn, byTarget };
    rebelCache.set(w, rc);
  }
  return (rc.byTarget.get(c) ?? []).filter((r) => w.armies[r.id]);
}

function commandFleets(w: WorldState, c: string): void {
  const enemies = enemiesOf(w, c);
  const fleets = fleetsOf(w, c).filter((f) => !f.carrying.length);
  if (!fleets.length || !enemies.size) return;
  const fleetsBySea = new Map<string, Fleet[]>();
  for (const e of enemies) for (const g of fleetsOf(w, e)) {
    const l = fleetsBySea.get(g.location);
    if (l) l.push(g); else fleetsBySea.set(g.location, [g]);
  }
  for (const f of fleets) {
    if (f.path.length) continue;
    if (!enemies.size) continue;
    const myPower = fleetStrength(w, f);
    // Find an enemy-held coast whose sea we can dominate.
    let best: { sea: string; d: number } | null = null;
    for (const e of enemies) {
      const cap = w.countries[e]?.capital;
      if (!cap) continue;
      for (const sea of coastalSeas(cap)) {
        const enemyHere = (fleetsBySea.get(sea) ?? []).filter((g) => atWar(w, g.owner, c)).reduce((s, g) => s + fleetStrength(w, g), 0);
        if (enemyHere > myPower * 0.9) continue;
        const d = provinceDistance(cap, provincesOnSea(f.location)[0] ?? cap);
        if (!best || d < best.d) best = { sea, d };
      }
    }
    if (best && rand(w) < 0.3) orderFleet(w, f, best.sea);
  }
}

function commandRebels(w: WorldState): void {
  for (const a of Object.values(w.armies)) {
    if (!a.rebel || a.path.length || a.status === 'sieging') continue;
    const here = w.provinces[a.location];
    if (here?.controller !== REBELS && here?.owner === a.rebel.against) continue; // keep besieging
    if (rand(w) > 0.35) continue;
    const next = neighbors(a.location).find((n) => w.provinces[n]?.owner === a.rebel!.against && w.provinces[n].controller !== REBELS && !Object.values(w.armies).some((o) => o.location === n && hostile(w, a, o)));
    if (next) { a.path = [next]; a.status = 'moving'; }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export function runAI(w: WorldState): void {
  for (const country of Object.values(w.countries)) {
    if (!country.alive || country.id === w.playerId) continue;
    const c = country.id;
    try {
      if (stagger(w, c, 3)) manageEconomy(w, c);
      if (stagger(w, c, 4)) manageConstruction(w, c);
      if (stagger(w, c, 3)) manageArmy(w, c);
      if (stagger(w, c, 6)) manageDiplomacy(w, c);
      considerWar(w, c);
      considerPeace(w, c);
      commandArmies(w, c);
      if (stagger(w, c, 2)) commandFleets(w, c);
    } catch (err) {
      // An AI failure must never break the simulation for everyone else.
      console.error(`AI error for ${c}`, err);
    }
  }
  commandRebels(w);
}
