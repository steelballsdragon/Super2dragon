// Every change a player (or the AI, or the advisor) makes goes through these validated
// actions. previewAction() reports costs, risks and consequences without changing anything.
import { BUILDING_BY_ID, SHIPS, UNITS } from '../data/buildings';
import { LAW_CATEGORY, lawOption } from '../data/laws';
import { TECH_BY_ID } from '../data/technologies';
import { appointCouncil, generateGeneral, generateMinister, MINISTER_TITLES } from './characters';
import { buildBlocker, buildingQuote, cancelConstruction, startConstruction } from './construction';
import { answerOffer, diploBlocker, DIPLO_LABELS, evaluateProposal, performDiplomacy, type DiploKind } from './diplomacy';
import { creditAvailable, loanRate, refreshLedgers, repayLoan, takeLoan } from './economy';
import { consortOf, ensureHeir, heirBlocker, household, rulerOf, setHeir, wedRuler } from './family';
import { runSpyOp, spyOpBlocker, spyOpChance, SPY_OPS, type SpyOp } from './espionage';
import { resolveEvent } from './events/engine';
import { canRecruitIn, establishment, findPath, gatherPlan, orderMove, pathMonths, recruitCost, removeArmy, shipCost, supplyLimit, UNIT_TYPES } from './military';
import { orderFleet, findSeaPath } from './naval';
import { planVoyage, startVoyage } from './voyage';
import { generateHeir, lawBlocker, lawReformCost } from './society';
import {
  addOpinion, armiesAt, armyRegiments, atWar, chronicle, clamp, countryName, def, hasRulingHouse, newId, notify, provinceName, sideOf, touch,
  forcesChanged, year,
} from './state';
import { SEA_DEFS, coastalSeas } from './static';
import { techBlocker, techCost } from './tech';
import {
  answerCallToArms, casusBelli, declareWar, declareWarBlocker, describeTerms, makePeace, peaceAcceptance, peaceBlocker, type CasusBelliType,
} from './war';
import type { BuildingId, LawCategory, MinisterRole, PeaceTerms, ShipType, UnitType, WorldState } from './types';

export type GameAction =
  | { type: 'setTax'; value: number }
  | { type: 'setTariff'; value: number }
  | { type: 'setBudget'; research?: number; espionage?: number; administration?: number }
  | { type: 'takeLoan'; amount: number }
  | { type: 'repayLoan'; loanId: string }
  | { type: 'build'; province: string; building: BuildingId }
  | { type: 'cancelBuild'; id: string }
  | { type: 'recruit'; province: string; unit: UnitType; count: number }
  | { type: 'buildShips'; province: string; ship: ShipType; count: number }
  | { type: 'moveArmy'; army: string; target: string }
  | { type: 'gatherArmies'; target: string }
  | { type: 'stopArmy'; army: string }
  | { type: 'mergeArmies'; armies: string[] }
  | { type: 'splitArmy'; army: string }
  | { type: 'disband'; army: string }
  | { type: 'expedition'; army: string; target: string }
  | { type: 'moveFleet'; fleet: string; target: string }
  | { type: 'research'; tech: string }
  | { type: 'enactLaw'; category: LawCategory; option: string }
  | { type: 'diplomacy'; kind: DiploKind; target: string; amount?: number }
  | { type: 'declareWar'; target: string; cb: CasusBelliType }
  | { type: 'proposePeace'; war: string; terms: PeaceTerms; mode: 'demand' | 'offer' }
  | { type: 'spyFocus'; target: string; on: boolean }
  | { type: 'spyOp'; target: string; op: SpyOp }
  | { type: 'answerOffer'; offer: string; accept: boolean }
  | { type: 'eventChoice'; event: string; option: string }
  | { type: 'court'; kind: 'anticorruption' | 'festival' | 'appoint' | 'designateHeir' | 'newGeneral' | 'chooseHeir' | 'findConsort'; role?: MinisterRole; army?: string; character?: string }
  | { type: 'congress' };

export interface ActionPreview {
  valid: boolean;
  errors: string[];
  summary: string;
  cost: { treasury?: number; manpower?: number; stability?: number; prestige?: number; months?: number };
  risks: string[];
  consequences: string[];
  chance?: number;
}

const money = (v: number) => `£${Math.round(v).toLocaleString('en')}k`;

function prev(summary: string, partial: Partial<ActionPreview> = {}): ActionPreview {
  return { valid: true, errors: [], summary, cost: {}, risks: [], consequences: [], ...partial };
}
function invalid(summary: string, error: string): ActionPreview {
  return { valid: false, errors: [error], summary, cost: {}, risks: [], consequences: [] };
}

export function previewAction(w: WorldState, c: string, a: GameAction): ActionPreview {
  const country = w.countries[c];
  if (!country?.alive) return invalid('No country', 'This polity no longer exists.');
  switch (a.type) {
    case 'setTax': {
      const v = clamp(a.value, 0.01, 0.4);
      return prev(`Set the tax rate to ${Math.round(v * 100)}%`, {
        consequences: [v > country.taxRate ? 'Higher revenue' : 'Lower revenue', v > 0.12 ? 'Unrest rises where taxes exceed custom' : 'Unrest eases'],
        risks: v > 0.2 ? ['Heavy taxation provokes revolts'] : [],
      });
    }
    case 'setTariff': return prev(`Set tariffs to ${Math.round(clamp(a.value, 0, 0.4) * 100)}%`, { consequences: ['Higher tariffs raise customs revenue but shrink trade and anger merchants and partners'] });
    case 'setBudget': return prev('Adjust the budget', { consequences: ['Research, espionage and administration spending change next month'] });
    case 'takeLoan': {
      const avail = creditAvailable(w, c);
      if (a.amount <= 0) return invalid('Take a loan', 'Specify an amount.');
      if (a.amount > avail) return invalid(`Borrow ${money(a.amount)}`, `Bankers will lend at most ${money(avail)}.`);
      const rate = loanRate(w, c);
      return prev(`Borrow ${money(a.amount)} at ${(rate * 100).toFixed(1)}% over five years`, { cost: { treasury: -a.amount }, consequences: [`Repayments of about ${money(a.amount / 60 + a.amount * rate / 12)} a month`], risks: ['Debt raises future interest rates and inflation'] });
    }
    case 'repayLoan': {
      const loan = country.loans.find((l) => l.id === a.loanId);
      if (!loan) return invalid('Repay loan', 'No such loan.');
      if (country.treasury < loan.principal) return invalid('Repay loan', 'Insufficient funds.');
      return prev(`Repay ${money(loan.principal)}`, { cost: { treasury: loan.principal } });
    }
    case 'build': {
      const bd = BUILDING_BY_ID[a.building];
      const label = `Build ${bd?.name ?? a.building} in ${provinceName(a.province)}`;
      const err = buildBlocker(w, c, a.province, a.building);
      if (err) return invalid(label, err);
      const q = buildingQuote(w, c, a.province, a.building);
      return prev(label, { cost: { treasury: q.cost, months: q.months }, consequences: [bd.description, `Requires ${q.labor.toFixed(1)}k workers`], risks: ['Work halts if the province is occupied'] });
    }
    case 'cancelBuild': return prev('Cancel construction', { consequences: ['Half the remaining cost is refunded'] });
    case 'recruit': {
      const u = UNITS[a.unit];
      const label = `Raise ${a.count} regiment${a.count > 1 ? 's' : ''} of ${u?.name.toLowerCase() ?? a.unit} in ${provinceName(a.province)}`;
      if (!u || a.count <= 0) return invalid(label, 'Invalid request.');
      const err = canRecruitIn(w, c, a.province);
      if (err) return invalid(label, err);
      if (a.unit === 'artillery' && !country.techs.includes('blast_furnace')) return invalid(label, 'We cannot cast cannon without blast furnaces.');
      const cost = recruitCost(w, c, a.unit, a.count);
      const men = u.manpower * a.count;
      if (country.treasury < cost) return invalid(label, `Insufficient funds (need ${money(cost)}).`);
      if (country.manpower < men) return invalid(label, `Not enough manpower (need ${Math.round(men * 1000).toLocaleString('en')} men).`);
      const months = Math.max(1, u.months - ((cProv(w, a.province).buildings.barracks ?? 0) > 0 ? 1 : 0));
      return prev(label, { cost: { treasury: cost, manpower: men, months }, consequences: [`Upkeep about ${money(u.upkeep * a.count)} a month at British wages, scaled to local costs`] });
    }
    case 'buildShips': {
      const s = SHIPS[a.ship];
      const label = `Build ${a.count} ${s?.name.toLowerCase() ?? a.ship} at ${provinceName(a.province)}`;
      const p = w.provinces[a.province];
      if (!s || a.count <= 0) return invalid(label, 'Invalid request.');
      if (!p || p.owner !== c || p.controller !== c) return invalid(label, 'We must hold the port.');
      if (!(p.buildings.port ?? 0)) return invalid(label, 'Requires a harbour.');
      if (!coastalSeas(a.province).length) return invalid(label, 'No access to the sea.');
      if (s.requiresTech && !country.techs.includes(s.requiresTech)) return invalid(label, `Requires ${TECH_BY_ID[s.requiresTech].name}.`);
      if (a.ship === 'line' && !(p.buildings.shipyard ?? 0)) return invalid(label, 'Ships of the line need a naval dockyard.');
      const cost = shipCost(w, c, a.ship, a.count);
      if (country.treasury < cost) return invalid(label, `Insufficient funds (need ${money(cost)}).`);
      const months = Math.round(s.months * ((p.buildings.shipyard ?? 0) ? 0.7 : 1));
      return prev(label, { cost: { treasury: cost, months } });
    }
    case 'moveArmy': {
      const army = w.armies[a.army];
      if (!army || army.owner !== c) return invalid('Move army', 'Not our army.');
      const label = `March ${army.name} to ${provinceName(a.target)}`;
      if (army.status === 'embarked') return invalid(label, 'The army is at sea.');
      const path = findPath(w, c, army.location, a.target);
      if (!path) return invalid(label, 'No land route: neutral territory blocks the way (or it lies overseas).');
      return prev(label, { cost: { months: Math.max(0.5, Math.round(pathMonths(w, army, path) * 10) / 10) } });
    }
    case 'gatherArmies': {
      const label = `Gather our armies at ${provinceName(a.target)}`;
      if (!w.provinces[a.target]) return invalid(label, 'Choose a province.');
      const plan = gatherPlan(w, c, a.target);
      if (!plan.going.length) {
        return invalid(label, plan.there.length ? 'Every army that can march there is already there.' : plan.stuck.length ? 'None of our armies can reach it: neutral territory or the sea is in the way.' : 'We have no armies to gather.');
      }
      const months = Math.max(...plan.going.map((g) => g.months));
      const regiments = [...plan.going.map((g) => g.army), ...plan.there].reduce((n, x) => n + armyRegiments(x), 0);
      const supply = supplyLimit(w, a.target, c);
      const sieges = plan.going.filter((g) => g.army.status === 'sieging').length;
      return prev(label, {
        cost: { months: Math.max(0.5, Math.round(months * 10) / 10) },
        consequences: [
          `${plan.going.length} ${plan.going.length === 1 ? 'army marches' : 'armies march'}${plan.there.length ? `, joining ${plan.there.length} already there` : ''} (${Math.round(regiments)} regiments in all)`,
          `The last arrives in about ${Math.max(1, Math.round(months))} month${Math.round(months) > 1 ? 's' : ''}`,
        ],
        risks: [
          ...(plan.stuck.length ? [`${plan.stuck.length} cannot reach it and stay where ${plan.stuck.length === 1 ? 'it is' : 'they are'}: ${plan.stuck.map((x) => x.name).join(', ')}`] : []),
          ...(sieges ? [`${sieges} will abandon ${sieges === 1 ? 'its siege' : 'their sieges'}`] : []),
          ...(regiments > supply ? [`${provinceName(a.target)} can feed about ${Math.round(supply)} regiments: a larger host suffers attrition there`] : []),
          'Our frontiers are left without field armies',
        ],
      });
    }
    case 'stopArmy': case 'mergeArmies': case 'splitArmy': case 'disband': return prev(a.type === 'disband' ? 'Disband army' : 'Reorganise army');
    case 'expedition': {
      const army = w.armies[a.army];
      if (!army || army.owner !== c) return invalid('Overseas expedition', 'Not our army.');
      const label = `Send ${army.name} by sea to ${provinceName(a.target)}`;
      const plan = planVoyage(w, army, a.target);
      if (typeof plan === 'string') return invalid(label, plan);
      if (plan.cost > country.treasury) return invalid(label, `Hiring ships costs ${money(plan.cost)}.`);
      const m = (x: number) => `${Math.max(1, Math.round(x))} month${Math.round(x) > 1 ? 's' : ''}`;
      return prev(label, {
        cost: { treasury: plan.cost, months: Math.max(1, Math.round(plan.months.total)) },
        consequences: [
          plan.toPort.length ? `March to the port of ${provinceName(plan.embark)} (about ${m(plan.months.march)})` : `Board ship at ${provinceName(plan.embark)}`,
          `${plan.fleet ? `Our ${plan.fleet.name} sails` : 'Hired merchant transports sail'} to ${provinceName(plan.landAt)} (about ${m(plan.months.sail)})`,
          ...(plan.landAt !== plan.final ? [`March inland to ${provinceName(plan.final)} (about ${m(plan.months.inland)})`] : []),
        ],
        risks: [
          ...(() => {
            const held = w.provinces[plan.landAt].controller ?? w.provinces[plan.landAt].owner;
            if (!held || !atWar(w, c, held)) return [];
            const foes = armiesAt(w, plan.landAt).filter((x) => x.owner === held || atWar(w, c, x.owner)).reduce((n, x) => n + armyRegiments(x), 0);
            return [`${provinceName(plan.landAt)} is held by ${countryName(w, held)}: the troops come ashore to fight${foes ? ` (${Math.round(foes * 1000).toLocaleString('en')} enemy soldiers there)` : ''}`];
          })(),
          ...(plan.dangers.length ? [`Enemy warships lie on the route (${plan.dangers.map((s) => SEA_DEFS[s]?.name ?? s).join(', ')}): a beaten convoy loses half its men`] : []),
          'Landing costs the army some morale',
        ],
      });
    }
    case 'moveFleet': {
      const f = w.fleets[a.fleet];
      if (!f || f.owner !== c) return invalid('Move fleet', 'Not our fleet.');
      const path = findSeaPath(f.location, a.target);
      if (!path) return invalid('Move fleet', 'No sea route (frozen or landlocked).');
      return prev(`Sail ${f.name} to the ${SEA_DEFS[a.target]?.name ?? a.target.replace(/_/g, ' ')}`);
    }
    case 'research': {
      const t = TECH_BY_ID[a.tech];
      if (!t) return invalid('Research', 'Unknown technology.');
      const err = techBlocker(w, c, a.tech);
      if (err) return invalid(`Research ${t.name}`, err);
      return prev(`Research ${t.name}`, { consequences: [t.description, `Cost ${techCost(w, c, a.tech)} research points`] });
    }
    case 'enactLaw': {
      const opt = lawOption(a.category, a.option);
      const label = `Enact ${opt?.name ?? a.option}`;
      const err = lawBlocker(w, c, a.category, a.option);
      if (err) return invalid(label, err);
      const q = lawReformCost(w, c, a.category);
      if (country.treasury < q.cost) return invalid(label, `The reform costs ${money(q.cost)}.`);
      const shifts = Object.entries(opt!.factions).map(([f, v]) => `${f} ${v! > 0 ? '+' : ''}${v}`);
      return prev(label, { cost: { treasury: q.cost, stability: q.stability, months: q.months }, consequences: [opt!.description, ...(shifts.length ? [`Faction sentiment: ${shifts.join(', ')}`] : [])], risks: country.stability - q.stability < 25 ? ['Stability is dangerously low'] : [] });
    }
    case 'diplomacy': {
      const label = `${DIPLO_LABELS[a.kind]}: ${countryName(w, a.target)}`;
      const err = diploBlocker(w, c, a.target, a.kind, a.amount ?? 0);
      if (err) return invalid(label, err);
      const consent = ['alliance', 'trade', 'marriage', 'guarantee', 'nap', 'access', 'tribute_demand', 'offer_tribute'].includes(a.kind);
      if (!consent) return prev(label, { cost: a.kind === 'subsidy' ? { treasury: a.amount } : {} });
      const ev = evaluateProposal(w, c, a.target, a.kind);
      const chance = clamp(0.5 + ev.score / 60, 0.02, 0.98);
      return prev(label, { chance, consequences: ev.reasons.map(([l, v]) => `${v > 0 ? '+' : ''}${v} ${l}`), risks: a.kind === 'tribute_demand' ? ['A refusal sours relations, but gives us a casus belli'] : [] });
    }
    case 'declareWar': {
      const label = `Declare war on ${countryName(w, a.target)}`;
      const err = declareWarBlocker(w, c, a.target);
      if (err) return invalid(label, err);
      const cb = casusBelli(w, c, a.target).find((x) => x.type === a.cb);
      if (!cb) return invalid(label, 'We lack that casus belli.');
      return prev(label, { cost: { stability: cb.stability }, consequences: [cb.label, `Aggressive reputation +${cb.infamy}`], risks: ['Their allies and protectors may join the war'] });
    }
    case 'proposePeace': {
      const war = w.wars[a.war];
      if (!war) return invalid('Peace', 'The war is over.');
      const err = peaceBlocker(w, war, c, a.terms);
      if (err) return invalid('Peace', err);
      const acc = peaceAcceptance(w, war, c, a.terms, a.mode === 'demand');
      return prev(`${a.mode === 'demand' ? 'Demand' : 'Offer'}: ${describeTerms(w, a.terms)}`, { chance: acc.accept ? 0.9 : 0.1, consequences: [`Treaty cost ${acc.cost} war score; current score ${a.mode === 'demand' ? (sideOf(war, c) === 'attackers' ? war.score : -war.score) : ''}`] });
    }
    case 'spyFocus': return prev(`${a.on ? 'Build' : 'Withdraw'} a spy network in ${countryName(w, a.target)}`);
    case 'spyOp': {
      const op = SPY_OPS[a.op];
      const label = `${op.name}: ${countryName(w, a.target)}`;
      const err = spyOpBlocker(w, c, a.target, a.op);
      if (err) return invalid(label, err);
      return prev(label, { cost: { treasury: op.cost }, chance: spyOpChance(w, c, a.target, a.op), consequences: [op.description], risks: ['If our agents are caught, relations and prestige suffer'] });
    }
    case 'answerOffer': return prev(a.accept ? 'Accept' : 'Decline');
    case 'eventChoice': return prev('Decide');
    case 'court': {
      const inc = Math.max(5, country.last.income);
      if (a.kind === 'anticorruption') {
        if (country.corruption < 12) return invalid('Anti-corruption campaign', 'Corruption is already low.');
        if (((w.flags[`ac_${c}`] as number) ?? -99) > w.turn - 24) return invalid('Anti-corruption campaign', 'A campaign was held recently.');
        return prev('Launch an anti-corruption campaign', { cost: { treasury: inc * 2, stability: 3 }, consequences: ['Corruption −15', 'Nobility loyalty −8'] });
      }
      if (a.kind === 'festival') {
        if (((w.flags[`fest_${c}`] as number) ?? -99) > w.turn - 12) return invalid('Royal festivities', 'Festivities were held this year.');
        return prev('Hold public festivities and ceremonies', { cost: { treasury: inc }, consequences: ['Legitimacy +6', 'Stability +3'] });
      }
      if (a.kind === 'appoint') return prev(`Appoint a new ${MINISTER_TITLES[a.role ?? 'finance']}`, { cost: { treasury: inc * 0.3 } });
      if (a.kind === 'newGeneral') return prev('Commission a new general', { cost: { treasury: inc * 0.5 } });
      if (a.kind === 'chooseHeir') {
        const ch = a.character ? w.characters[a.character] : undefined;
        const label = `Name ${ch?.name ?? 'a new'} heir`;
        const err = heirBlocker(w, c, a.character);
        if (err) return invalid(label, err);
        const current = country.heirId ? w.characters[country.heirId] : undefined;
        if (!current?.alive) return prev(label, { consequences: [`${ch!.name} will succeed`] });
        return prev(label, { cost: { stability: 2 }, consequences: [`${current.name} is passed over`, 'Legitimacy −5', 'Nobility loyalty −5'], risks: ['A disinherited heir makes enemies at court'] });
      }
      if (a.kind === 'findConsort') {
        const r = rulerOf(w, c);
        const label = 'Seek a consort among our own nobility';
        if (!hasRulingHouse(w, c)) return invalid(label, 'Only a ruling house takes a royal consort.');
        if (consortOf(w, c)) return invalid(label, `${r?.name ?? 'The sovereign'} is already married.`);
        if (!r?.alive || year(w) - r.born < 16) return invalid(label, 'The sovereign is not yet of age to marry.');
        if (country.treasury < inc) return invalid(label, `The wedding costs ${money(inc)}.`);
        return prev(label, { cost: { treasury: inc }, consequences: ['The sovereign marries', 'Legitimacy +3', 'No foreign alliance (propose a royal marriage in Diplomacy for that)'] });
      }
      const next = household(w, c)[0];
      return prev('Designate an heir', { consequences: [next ? `${next.name} is named heir` : 'A kinsman is named heir', 'Legitimacy −3 (a contested choice)'] });
    }
    case 'congress': {
      if (country.prestige < 40) return invalid('Convene a congress', 'Requires prestige of 40.');
      return prev('Convene an international peace congress', { cost: { prestige: 10, treasury: Math.max(5, country.last.income) }, consequences: ['Wars with no clear victor may end in a white peace', 'Relations with attending powers improve'] });
    }
  }
}

function cProv(w: WorldState, id: string) {
  return w.provinces[id];
}

export interface ActionResult { ok: boolean; message: string }

export function applyAction(w: WorldState, c: string, a: GameAction): ActionResult {
  const pv = previewAction(w, c, a);
  if (!pv.valid) return { ok: false, message: pv.errors.join(' ') };
  const res = execute(w, c, a, pv);
  if (res.ok && c === w.playerId && !['moveArmy', 'stopArmy', 'answerOffer', 'eventChoice', 'setBudget', 'moveFleet'].includes(a.type)) {
    w.decisions.push({ turn: w.turn, summary: pv.summary });
    if (w.decisions.length > 400) w.decisions.splice(0, w.decisions.length - 400);
  }
  // Keep the player's displayed budget current after fiscal changes.
  if (res.ok && c === w.playerId && ['setTax', 'setTariff', 'setBudget', 'takeLoan', 'repayLoan', 'diplomacy', 'enactLaw', 'recruit', 'disband', 'build'].includes(a.type)) refreshLedgers(w);
  return res;
}

function execute(w: WorldState, c: string, a: GameAction, pv: ActionPreview): ActionResult {
  const country = w.countries[c];
  switch (a.type) {
    case 'setTax': country.taxRate = clamp(a.value, 0.01, 0.4); return { ok: true, message: pv.summary };
    case 'setTariff': {
      const old = country.tariff;
      country.tariff = clamp(a.value, 0, 0.4);
      if (country.tariff > old + 0.02) country.factions.merchants.loyalty = clamp(country.factions.merchants.loyalty - 5, 0, 100);
      return { ok: true, message: pv.summary };
    }
    case 'setBudget':
      if (a.research !== undefined) country.budget.research = clamp(a.research, 0, 2);
      if (a.espionage !== undefined) country.budget.espionage = clamp(a.espionage, 0, 2);
      if (a.administration !== undefined) country.budget.administration = clamp(a.administration, 0.5, 1.5);
      return { ok: true, message: 'Budget adjusted.' };
    case 'takeLoan': return takeLoan(w, c, a.amount) ? { ok: true, message: pv.summary } : { ok: false, message: 'The bankers refused.' };
    case 'repayLoan': return repayLoan(w, c, a.loanId) ? { ok: true, message: 'Loan repaid.' } : { ok: false, message: 'Could not repay.' };
    case 'build': {
      const r = startConstruction(w, c, a.province, a.building);
      return typeof r === 'string' ? { ok: false, message: r } : { ok: true, message: `Construction begun: ${pv.summary.replace(/^Build /, '')}.` };
    }
    case 'cancelBuild': return cancelConstruction(w, c, a.id) ? { ok: true, message: 'Construction cancelled.' } : { ok: false, message: 'Nothing to cancel.' };
    case 'recruit': {
      country.treasury -= pv.cost.treasury ?? 0;
      country.manpower -= pv.cost.manpower ?? 0;
      w.recruitment.push({ id: newId(w, 'r'), country: c, province: a.province, kind: 'unit', unit: a.unit, count: a.count, monthsLeft: pv.cost.months ?? UNITS[a.unit].months });
      return { ok: true, message: `${pv.summary}: ready in ${pv.cost.months} months.` };
    }
    case 'buildShips': {
      country.treasury -= pv.cost.treasury ?? 0;
      w.recruitment.push({ id: newId(w, 'r'), country: c, province: a.province, kind: 'ship', unit: a.ship, count: a.count, monthsLeft: pv.cost.months ?? SHIPS[a.ship].months });
      return { ok: true, message: `${pv.summary}: launch in ${pv.cost.months} months.` };
    }
    case 'moveArmy': {
      const army = w.armies[a.army];
      army.voyage = undefined;
      return orderMove(w, army, a.target) ? { ok: true, message: `${pv.summary} (${pv.cost.months} months).` } : { ok: false, message: 'No route.' };
    }
    case 'gatherArmies': {
      const plan = gatherPlan(w, c, a.target);
      const sent = plan.going.filter((g) => { g.army.voyage = undefined; return orderMove(w, g.army, a.target); });
      const months = Math.max(1, Math.round(Math.max(...plan.going.map((g) => g.months))));
      return {
        ok: sent.length > 0,
        message: `${sent.length} ${sent.length === 1 ? 'army marches' : 'armies march'} to ${provinceName(a.target)}; the last arrives in about ${months} month${months > 1 ? 's' : ''}.${plan.stuck.length ? ` ${plan.stuck.length} cannot reach it.` : ''} Once there, Merge on an army's card combines them.`,
      };
    }
    case 'stopArmy': {
      const army = w.armies[a.army];
      if (!army || army.owner !== c) return { ok: false, message: 'Not our army.' };
      army.path = []; army.voyage = undefined; if (army.status === 'moving') army.status = 'idle';
      return { ok: true, message: 'Halted.' };
    }
    case 'mergeArmies': {
      const armies = a.armies.map((id) => w.armies[id]).filter((x) => x && x.owner === c && x.status !== 'embarked');
      if (armies.length < 2 || armies.some((x) => x.location !== armies[0].location)) return { ok: false, message: 'Armies must be in the same province.' };
      const main = armies[0];
      const full = establishment(main);
      for (const o of armies.slice(1)) {
        const of = establishment(o);
        for (const u of UNIT_TYPES) { main.units[u] += o.units[u]; full[u] += of[u]; }
        main.morale = Math.min(main.morale, o.morale);
        if (!main.general && o.general) main.general = o.general;
        removeArmy(w, o.id);
      }
      return { ok: true, message: `Armies merged into ${main.name}.` };
    }
    case 'splitArmy': {
      const army = w.armies[a.army];
      if (!army || army.owner !== c || army.status === 'embarked') return { ok: false, message: 'Cannot split.' };
      if (armyRegiments(army) < 2) return { ok: false, message: 'Too small to split.' };
      const half = { infantry: 0, cavalry: 0, artillery: 0, irregulars: 0 };
      const full = establishment(army);
      const halfFull = { infantry: 0, cavalry: 0, artillery: 0, irregulars: 0 };
      for (const u of UNIT_TYPES) {
        half[u] = Math.floor(army.units[u] / 2 * 10) / 10; army.units[u] -= half[u];
        halfFull[u] = Math.max(half[u], Math.floor(full[u] / 2 * 10) / 10); full[u] = Math.max(army.units[u], full[u] - halfFull[u]);
      }
      const id = newId(w, 'a');
      w.armies[id] = { ...army, id, name: `${army.name} (detachment)`, units: half, full: halfFull, general: undefined, path: [], status: 'idle', voyage: undefined };
      forcesChanged(w);
      return { ok: true, message: 'Detachment formed.' };
    }
    case 'disband': {
      const army = w.armies[a.army];
      if (!army || army.owner !== c) return { ok: false, message: 'Not our army.' };
      country.manpower += armyRegiments(army) * 0.5;
      removeArmy(w, army.id);
      return { ok: true, message: 'Army disbanded; half its men return to the manpower pool.' };
    }
    case 'expedition': {
      const plan = startVoyage(w, w.armies[a.army], a.target);
      if (typeof plan === 'string') return { ok: false, message: plan };
      const total = pv.cost.months ?? 1;
      return { ok: true, message: `${w.armies[a.army].name} ${plan.toPort.length ? `marches to ${provinceName(plan.embark)} to take ship` : 'takes ship'} for ${provinceName(plan.final)}: about ${total} month${total === 1 ? '' : 's'} in all.` };
    }
    case 'moveFleet': return orderFleet(w, w.fleets[a.fleet], a.target) ? { ok: true, message: pv.summary } : { ok: false, message: 'No route.' };
    case 'research': country.research.tech = a.tech; return { ok: true, message: pv.summary };
    case 'enactLaw': {
      const q = lawReformCost(w, c, a.category);
      country.treasury -= q.cost;
      country.stability = clamp(country.stability - q.stability, 0, 100);
      country.lawReform = { category: a.category, option: a.option, monthsLeft: q.months, total: q.months };
      return { ok: true, message: `Reform begun: ${lawOption(a.category, a.option)?.name} (${LAW_CATEGORY[a.category].name}), ${q.months} months.` };
    }
    case 'diplomacy': {
      if (a.kind === 'subsidy' && a.amount) country.treasury -= 0;
      const r = performDiplomacy(w, c, a.target, a.kind, a.amount ?? 0);
      return { ok: r.ok, message: r.message };
    }
    case 'declareWar': {
      const cb = casusBelli(w, c, a.target).find((x) => x.type === a.cb)!;
      const war = declareWar(w, c, a.target, cb);
      return { ok: true, message: `The ${war.name} has begun.` };
    }
    case 'proposePeace': {
      const war = w.wars[a.war];
      const side = sideOf(war, c)!;
      const acc = peaceAcceptance(w, war, c, a.terms, a.mode === 'demand');
      const leader = side === 'attackers' ? war.attackerLeader : war.defenderLeader;
      const separate = leader !== c ? c : undefined;
      if (!acc.accept) {
        addOpinion(w, c, side === 'attackers' ? war.defenderLeader : war.attackerLeader, -5);
        return { ok: false, message: `Our terms are rejected (they would need ${Math.round(-acc.margin)} more war score).` };
      }
      const winnerSide = a.mode === 'demand' ? side : side === 'attackers' ? 'defenders' : 'attackers';
      const white = !a.terms.provinces.length && !a.terms.reparations && !a.terms.tribute && !a.terms.subjugate && !a.terms.independence && !a.terms.humiliate;
      makePeace(w, war, white ? 'white' : winnerSide, a.terms, separate);
      return { ok: true, message: `Peace is signed: ${describeTerms(w, a.terms)}.` };
    }
    case 'spyFocus':
      if (a.on) country.spy[a.target] ??= 0; else delete country.spy[a.target];
      return { ok: true, message: pv.summary };
    case 'spyOp': return runSpyOp(w, c, a.target, a.op);
    case 'answerOffer': {
      const offer = w.offers.find((o) => o.id === a.offer);
      if (!offer) return { ok: false, message: 'The offer has lapsed.' };
      if (offer.kind === 'call_to_arms') {
        w.offers = w.offers.filter((o) => o !== offer);
        answerCallToArms(w, offer, a.accept);
        return { ok: true, message: a.accept ? 'We march with our ally.' : 'We stand aside; the alliance is broken.' };
      }
      if (offer.kind === 'peace' && offer.warId && offer.terms) {
        w.offers = w.offers.filter((o) => o !== offer);
        const war = w.wars[offer.warId];
        if (!war) return { ok: false, message: 'The war is already over.' };
        if (!a.accept) { addOpinion(w, c, offer.from, -5); return { ok: true, message: 'We fight on.' }; }
        const fromSide = sideOf(war, offer.from)!;
        const white = !offer.terms.provinces.length && !offer.terms.reparations && !offer.terms.tribute && !offer.terms.subjugate && !offer.terms.humiliate && !offer.terms.independence;
        const separate = (fromSide === 'attackers' ? war.defenderLeader : war.attackerLeader) !== c ? c : undefined;
        makePeace(w, war, white ? 'white' : (w.flags[`peace_concede_${offer.id}`] ? (fromSide === 'attackers' ? 'defenders' : 'attackers') : fromSide), offer.terms, separate);
        return { ok: true, message: `Peace: ${describeTerms(w, offer.terms)}.` };
      }
      return { ok: true, message: answerOffer(w, a.offer, a.accept) };
    }
    case 'eventChoice': {
      const err = resolveEvent(w, a.event, a.option);
      return err ? { ok: false, message: err } : { ok: true, message: 'Decision made.' };
    }
    case 'court': {
      const inc = Math.max(5, country.last.income);
      if (a.kind === 'anticorruption') {
        country.treasury -= inc * 2;
        country.corruption = clamp(country.corruption - 15, 0, 100);
        country.factions.nobility.loyalty = clamp(country.factions.nobility.loyalty - 8, 0, 100);
        country.stability = clamp(country.stability - 3, 0, 100);
        w.flags[`ac_${c}`] = w.turn;
        return { ok: true, message: 'Commissioners fan out to audit every office of state.' };
      }
      if (a.kind === 'festival') {
        country.treasury -= inc;
        country.legitimacy = clamp(country.legitimacy + 6, 0, 100);
        country.stability = clamp(country.stability + 3, 0, 100);
        w.flags[`fest_${c}`] = w.turn;
        return { ok: true, message: 'Processions, illuminations and largesse delight the people.' };
      }
      if (a.kind === 'appoint') {
        const role = a.role ?? 'finance';
        const old = country.ministers[role];
        if (old && w.characters[old]) w.characters[old].alive = false;
        delete country.ministers[role];
        country.treasury -= inc * 0.3;
        const m = generateMinister(w, c, role);
        country.ministers[role] = m.id;
        appointCouncil(w, c);
        return { ok: true, message: `${m.name} is appointed ${MINISTER_TITLES[role]}.` };
      }
      if (a.kind === 'newGeneral') {
        country.treasury -= inc * 0.5;
        const g = generateGeneral(w, c);
        if (a.army && w.armies[a.army]?.owner === c) w.armies[a.army].general = g.id;
        return { ok: true, message: `${g.name} receives a general's commission.` };
      }
      if (a.kind === 'chooseHeir') {
        const err = heirBlocker(w, c, a.character);
        if (err) return { ok: false, message: err };
        const current = country.heirId ? w.characters[country.heirId] : undefined;
        if (current?.alive) {
          country.legitimacy = clamp(country.legitimacy - 5, 0, 100);
          country.stability = clamp(country.stability - 2, 0, 100);
          country.factions.nobility.loyalty = clamp(country.factions.nobility.loyalty - 5, 0, 100);
          current.loyalty = clamp(current.loyalty - 40, 0, 100);
        }
        setHeir(w, c, a.character!);
        w.flags[`heirChosen_${c}`] = 1;
        const ch = w.characters[a.character!];
        chronicle(w, { text: `${ch.name} is proclaimed heir to the throne of ${countryName(w, c)}${current?.alive ? `, in place of ${current.name}` : ''}.`, category: 'court', countries: [c], importance: 1 });
        return { ok: true, message: `${ch.name} is proclaimed heir.` };
      }
      if (a.kind === 'findConsort') {
        const consort = wedRuler(w, c);
        if (!consort) return { ok: false, message: 'There can be no wedding now.' };
        country.treasury -= inc;
        country.legitimacy = clamp(country.legitimacy + 3, 0, 100);
        return { ok: true, message: `${rulerOf(w, c)!.name} weds ${consort.name}.` };
      }
      if (country.heirId && w.characters[country.heirId]?.alive) return { ok: false, message: 'An heir is already designated.' };
      country.heirId = (ensureHeir(w, c) ?? generateHeir(w, c, true)).id;
      country.legitimacy = clamp(country.legitimacy - 3, 0, 100);
      return { ok: true, message: `${w.characters[country.heirId].name} is designated heir.` };
    }
    case 'congress': {
      country.prestige = clamp(country.prestige - 10, 0, 100);
      country.treasury -= Math.max(5, country.last.income);
      let ended = 0;
      for (const war of Object.values(w.wars)) {
        if (Math.abs(war.score) >= 30) continue;
        const exA = w.countries[war.attackerLeader]?.warExhaustion ?? 0;
        const exD = w.countries[war.defenderLeader]?.warExhaustion ?? 0;
        const involved = sideOf(war, c) || [war.attackerLeader, war.defenderLeader].some((x) => def(x).continent === def(c).continent);
        if (!involved) continue;
        if (exA + exD > 25 || Math.abs(war.score) < 10) {
          makePeace(w, war, 'white', { provinces: [], reparations: 0, tribute: false, subjugate: false, independence: false, humiliate: false });
          ended++;
        }
      }
      country.prestige = clamp(country.prestige + 6 + ended * 4, 0, 100);
      chronicle(w, { text: `${countryName(w, c)} convenes an international congress${ended ? `; ${ended} war${ended > 1 ? 's end' : ' ends'} in a negotiated peace` : ', which ends without agreement'}.`, category: 'peace', countries: [c], importance: ended ? 3 : 2 });
      touch(w);
      return { ok: true, message: ended ? `The congress ends ${ended} war${ended > 1 ? 's' : ''}.` : 'The congress talks, dines and dances, but no peace results.' };
    }
  }
  return { ok: false, message: 'Unknown action.' };
}

export function notifyResult(w: WorldState, r: ActionResult): void {
  notify(w, r.message, r.ok ? 'success' : 'warning');
}
