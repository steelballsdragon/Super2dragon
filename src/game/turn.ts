// The monthly turn, in the order described in the design:
//  1. revenue & expenses  2. construction, research, recruitment  3. diplomacy & AI
//  4. population, food & society  5. movement & battles  6. events  7. reports & chronicle
import { chooseResearch, runAI } from './ai';
import { processConstruction } from './construction';
import { processDiplomacy } from './diplomacy';
import { monthlyEconomy, updatePrices } from './economy';
import { processEspionage } from './espionage';
import { processEvents } from './events/engine';
import { applyAttrition, moveArmies, processRecruitment, reinforceArmies, resolveBattles, resolveRebellions, resolveSieges } from './military';
import { blockadedProvinces, moveFleets, resolveNavalBattles } from './naval';
import { processSociety } from './society';
import { countryPopulation, totalRegiments, warsOf, notify, formatDate } from './state';
import { processResearch, researchPoints } from './tech';
import { emptyTerms, makePeace, updateWarScores } from './war';
import type { WorldState } from './types';
import { processVoyages } from './voyage';

export function advanceMonth(w: WorldState): void {
  monthlyEconomy(w);

  processConstruction(w);
  processResearch(w, (c) => chooseResearch(w, c));
  processRecruitment(w);

  processDiplomacy(w);
  processEspionage(w);
  runAI(w);

  processSociety(w);
  updatePrices(w);

  moveArmies(w);
  moveFleets(w);
  processVoyages(w);
  resolveNavalBattles(w);
  resolveBattles(w);
  resolveSieges(w, blockadedProvinces(w));
  applyAttrition(w);
  reinforceArmies(w);
  resolveRebellions(w);
  updateWarScores(w);
  handleCongresses(w);

  processEvents(w);

  recordReports(w);
  w.turn += 1;
  if (w.turn % 12 === 0) notify(w, `The year ${1800 + w.turn / 12} begins.`, 'info');
}

function handleCongresses(w: WorldState): void {
  for (const war of warsOf(w, w.playerId)) {
    const f = w.flags[`congress_${war.id}`] as number | undefined;
    if (f === undefined) continue;
    delete w.flags[`congress_${war.id}`];
    const otherLeader = war.attackers.includes(w.playerId) ? war.defenderLeader : war.attackerLeader;
    const ex = w.countries[otherLeader]?.warExhaustion ?? 0;
    if (Math.abs(war.score) < 25 && ex > 10) makePeace(w, war, 'white', emptyTerms());
    else notify(w, `The congress fails: ${otherLeader} refuses to negotiate.`, 'warning');
  }
}

function recordReports(w: WorldState): void {
  const c = w.countries[w.playerId];
  if (!c) return;
  w.playerHistory.push({
    turn: w.turn,
    treasury: Math.round(c.treasury),
    income: Math.round(c.last.income),
    expenses: Math.round(c.last.expenses),
    population: Math.round(countryPopulation(w, w.playerId)),
    stability: Math.round(c.stability),
    armySize: Math.round(totalRegiments(w, w.playerId) * 10) / 10,
    research: Math.round(researchPoints(w, w.playerId) * 10) / 10,
  });
  if (w.playerHistory.length > 240) w.playerHistory.splice(0, w.playerHistory.length - 240);
  if (!c.alive && !w.flags.gameOver) {
    w.flags.gameOver = formatDate(w.turn);
    notify(w, 'Our realm has fallen. The chronicle of our house is ended.', 'danger');
  }
}

export function advanceMonths(w: WorldState, n: number): void {
  for (let i = 0; i < n; i++) advanceMonth(w);
}
