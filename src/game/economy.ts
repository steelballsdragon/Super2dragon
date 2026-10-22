// Treasury, taxation, trade, loans, inflation and prices.
import { BUILDING_BY_ID, SHIPS, UNITS } from '../data/buildings';
import { lawOption } from '../data/laws';
import { GOODS, REBELS, SUBJECT_TYPES } from './constants';
import { sizeFactor } from './construction';
import { blockadedProvinces } from './naval';
import { chance, gaussian } from './rng';
import {
  armiesOf, bonuses, chronicle, fleetsOf, clamp, countryName, def, newId, notify, provincesOf, treatiesOf, partner,
} from './state';
import { OUTPOST_DEFS, OUTPOST_HOST, PROVINCE_DEFS, TRADE_NODE_DEFS, isCoastal } from './static';
import type { BuildingId, Ledger, Loan, TradeGoodId, WorldState } from './types';

export const TRADE_K = 0.18;
/** Scales gross taxable output to state revenue (calibrated so Britain collects ~£35M a year in 1800). */
export const TAX_K = 0.55;

export function emptyLedger(): Ledger {
  return {
    tax: 0, trade: 0, tariffs: 0, tribute: 0, subsidies: 0, other: 0, army: 0, navy: 0, buildings: 0, administration: 0,
    research: 0, espionage: 0, interest: 0, tributePaid: 0, subsidiesPaid: 0, diplomacy: 0, income: 0, expenses: 0, balance: 0,
  };
}

/** Relative cost of labour: wages in Britain = 1. */
export function wageFactor(w: WorldState, c: string): number {
  let pop = 0, gdp = 0;
  for (const id of provincesOf(w, c)) {
    const p = w.provinces[id];
    pop += p.pop;
    gdp += p.pop * p.gdpPc;
  }
  const pc = pop > 0 ? gdp / pop : def(c)?.gdpPc ?? 5;
  return clamp(pc / 22, 0.15, 1.2);
}

export function adminEfficiency(w: WorldState, c: string): number {
  const country = w.countries[c];
  const d = def(c);
  const b = bonuses(w, c);
  const ruler = w.characters[country.rulerId];
  let eff = d.efficiency + (b.taxEff ?? 0) + (country.budget.administration - 1) * 0.08 + (ruler ? (ruler.adm - 5) * 0.01 : 0) - country.corruption / 250;
  eff *= 0.8 + country.stability / 250;
  return clamp(eff, 0.04, 0.98);
}

const INDUSTRIAL: BuildingId[] = ['textile_mill', 'ironworks', 'steam_works'];

export function provinceProductivity(w: WorldState, pid: string): number {
  const p = w.provinces[pid];
  const owner = p.owner;
  const b = owner ? bonuses(w, owner) : {};
  const factory = 1 + (b.factory ?? 0);
  let mult = 1 + (b.productivity ?? 0);
  for (const [bid, lvl] of Object.entries(p.buildings) as [BuildingId, number][]) {
    const bd = BUILDING_BY_ID[bid];
    if (!bd || !lvl) continue;
    const pr = bd.bonuses.productivity ?? 0;
    mult += pr * lvl * (INDUSTRIAL.includes(bid) ? Math.max(0.2, factory) : 1);
  }
  const cycle = owner ? w.countries[owner]?.cycle ?? 0 : 0;
  return Math.max(0.2, mult) * (1 + 0.06 * cycle) * (1 - p.devastation / 160);
}

/** Province economic output (£ thousands per month). */
export function provinceOutput(w: WorldState, pid: string): number {
  const p = w.provinces[pid];
  return (p.pop * p.gdpPc / 12) * provinceProductivity(w, pid);
}

export function provinceTradeValue(w: WorldState, pid: string): number {
  const p = w.provinces[pid];
  const pd = PROVINCE_DEFS[pid];
  let bonus = 1;
  for (const [bid, lvl] of Object.entries(p.buildings) as [BuildingId, number][]) {
    const bd = BUILDING_BY_ID[bid];
    if (!bd || !lvl) continue;
    if (bid === 'mine' && !bd.needsGood?.includes(pd.good)) continue;
    bonus += (bd.bonuses.trade ?? 0) * lvl;
  }
  const price = w.prices[pd.good] ?? GOODS[pd.good].price;
  const tariff = p.owner ? w.countries[p.owner]?.tariff ?? 0 : 0;
  return Math.pow(Math.max(0.1, provinceOutput(w, pid)), 0.7) * (price / 3) * bonus * (isCoastal(pid) ? 1.15 : 1) * (1 - tariff * 0.6);
}

export interface TradeResult {
  income: Record<string, number>;
  nodes: Record<string, { local: number; inflow: number; total: number; collected: number; shares: Record<string, number> }>;
}

let nodeOrder: string[] | null = null;
function topoNodes(): string[] {
  if (nodeOrder) return nodeOrder;
  const indeg: Record<string, number> = {};
  for (const n of Object.values(TRADE_NODE_DEFS)) indeg[n.id] ??= 0;
  for (const n of Object.values(TRADE_NODE_DEFS)) for (const d of n.downstream) indeg[d] = (indeg[d] ?? 0) + 1;
  const queue = Object.keys(indeg).filter((k) => indeg[k] === 0);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const d of TRADE_NODE_DEFS[n].downstream) if (--indeg[d] === 0) queue.push(d);
  }
  nodeOrder = order;
  return order;
}

export function computeTrade(w: WorldState, blockaded?: Set<string>): TradeResult {
  const blk = blockaded ?? blockadedProvinces(w);
  const local: Record<string, number> = {};
  const power: Record<string, Record<string, number>> = {};
  const addPower = (node: string, c: string, v: number) => {
    (power[node] ??= {})[c] = (power[node][c] ?? 0) + v;
  };
  for (const p of Object.values(w.provinces)) {
    if (!p.owner) continue;
    const node = PROVINCE_DEFS[p.id].tradeNode;
    const v = provinceTradeValue(w, p.id);
    local[node] = (local[node] ?? 0) + v;
    const holder = p.controller && p.controller !== REBELS ? p.controller : null;
    if (!holder) continue;
    const factor = (blk.has(p.id) ? 0.3 : 1) * (holder === p.owner ? 1 : 0.5);
    addPower(node, holder, v * factor);
  }
  for (const o of Object.values(w.outposts)) {
    const node = PROVINCE_DEFS[OUTPOST_HOST[o.id]].tradeNode;
    const kind = OUTPOST_DEFS[o.id].kind;
    addPower(node, o.controller, (local[node] ?? 0) * (kind === 'factory' ? 0.1 : 0.06) + 2);
  }
  // Trade agreements share influence.
  for (const t of w.treaties) {
    if (t.type !== 'trade') continue;
    for (const node of Object.keys(power)) {
      const pa = power[node][t.a] ?? 0, pb = power[node][t.b] ?? 0;
      if (pb > 0) addPower(node, t.a, pb * 0.12);
      if (pa > 0) addPower(node, t.b, pa * 0.12);
    }
  }
  // Merchant marine and national trade bonuses.
  const merchant: Record<string, number> = {};
  for (const f of Object.values(w.fleets)) merchant[f.owner] = (merchant[f.owner] ?? 0) + f.ships.frigate + f.ships.transport;
  const nodes: TradeResult['nodes'] = {};
  const inflow: Record<string, number> = {};
  const income: Record<string, number> = {};
  for (const id of topoNodes()) {
    const nd = TRADE_NODE_DEFS[id];
    const l = local[id] ?? 0;
    const inn = inflow[id] ?? 0;
    const total = l + inn;
    const collected = nd.endNode || !nd.downstream.length ? total : total * 0.6;
    if (!nd.endNode && nd.downstream.length) {
      const out = (total * 0.4) / nd.downstream.length;
      for (const d of nd.downstream) inflow[d] = (inflow[d] ?? 0) + out;
    }
    const pw = power[id] ?? {};
    let sum = 0;
    const weighted: Record<string, number> = {};
    for (const [c, v] of Object.entries(pw)) {
      if (!w.countries[c]?.alive) continue;
      const b = bonuses(w, c);
      const val = v * (1 + (b.trade ?? 0)) * (1 + Math.min(0.5, (merchant[c] ?? 0) * 0.004));
      weighted[c] = val;
      sum += val;
    }
    const shares: Record<string, number> = {};
    for (const [c, v] of Object.entries(weighted)) {
      const share = sum > 0 ? v / sum : 0;
      shares[c] = share;
      const country = w.countries[c];
      const take = collected * share * TRADE_K * (0.45 * adminEfficiency(w, c) + country.tariff * 2.5);
      income[c] = (income[c] ?? 0) + take;
    }
    nodes[id] = { local: l, inflow: inn, total, collected, shares };
  }
  return { income, nodes };
}

/** Levies and warriors who are not campaigning go home to their fields and herds. */
function idleUpkeepFactor(w: WorldState, c: string, a: { location: string; status: string }, atWarNow: boolean): number {
  const law = w.countries[c]?.laws.military;
  if (atWarNow || a.status === 'moving' || w.provinces[a.location]?.owner !== c) return 1;
  return law === 'warrior_tradition' ? 0.2 : law === 'feudal_levies' ? 0.6 : 1;
}

export function armyUpkeep(w: WorldState, c: string): number {
  const wf = wageFactor(w, c);
  const b = bonuses(w, c);
  const inflation = 1 + (w.countries[c]?.inflation ?? 0) / 100;
  const atWarNow = Object.values(w.wars).some((war) => war.attackers.includes(c) || war.defenders.includes(c));
  let s = 0;
  for (const a of armiesOf(w, c)) {
    s += idleUpkeepFactor(w, c, a, atWarNow) * (a.units.infantry * UNITS.infantry.upkeep + a.units.cavalry * UNITS.cavalry.upkeep + a.units.artillery * UNITS.artillery.upkeep + a.units.irregulars * UNITS.irregulars.upkeep);
  }
  return s * wf * (1 - (b.upkeep ?? 0)) * inflation;
}

export function navyUpkeep(w: WorldState, c: string): number {
  const wf = wageFactor(w, c);
  const inflation = 1 + (w.countries[c]?.inflation ?? 0) / 100;
  let s = 0;
  for (const f of fleetsOf(w, c)) {
    s += f.ships.line * SHIPS.line.upkeep + f.ships.frigate * SHIPS.frigate.upkeep + f.ships.transport * SHIPS.transport.upkeep;
  }
  return s * (0.25 + 0.75 * wf) * inflation;
}

export function buildingUpkeep(w: WorldState, c: string): number {
  const wf = wageFactor(w, c);
  let s = 0;
  for (const id of provincesOf(w, c)) {
    // Upkeep scales with the size of the province, as construction costs do.
    const size = sizeFactor(w.provinces[id].pop);
    for (const [bid, lvl] of Object.entries(w.provinces[id].buildings) as [BuildingId, number][]) s += (BUILDING_BY_ID[bid]?.upkeep ?? 0) * (lvl ?? 0) * size;
  }
  return s * (0.35 + 0.65 * wf);
}

export function difficultyIncome(w: WorldState, c: string): number {
  if (c !== w.playerId) return 1;
  return w.campaign.difficulty === 'easy' ? 1.2 : w.campaign.difficulty === 'hard' ? 0.88 : 1;
}

export function taxIncome(w: WorldState, c: string, blk: Set<string>): number {
  const country = w.countries[c];
  const eff = adminEfficiency(w, c);
  let tax = 0;
  for (const id of provincesOf(w, c)) {
    const p = w.provinces[id];
    if (p.controller !== c) continue;
    tax += provinceOutput(w, id) * country.taxRate * eff * (1 - p.unrest / 160) * (blk.has(id) ? 0.8 : 1);
  }
  return tax * TAX_K * difficultyIncome(w, c);
}

function computeLedgers(w: WorldState): Record<string, ReturnType<typeof emptyLedger>> {
  const blk = blockadedProvinces(w);
  const trade = computeTrade(w, blk);
  const ledgers: Record<string, ReturnType<typeof emptyLedger>> = {};
  for (const c of Object.values(w.countries)) {
    if (!c.alive) continue;
    const L = emptyLedger();
    L.tax = taxIncome(w, c.id, blk) * (c.revenueMod ?? 1);
    const t = trade.income[c.id] ?? 0;
    L.trade = t * 0.6;
    L.tariffs = t * 0.4;
    ledgers[c.id] = L;
  }
  for (const c of Object.values(w.countries)) {
    if (!c.alive) continue;
    const L = ledgers[c.id];
    if (c.overlord && c.subjectType && ledgers[c.overlord]) {
      const pay = (L.tax + L.trade + L.tariffs) * SUBJECT_TYPES[c.subjectType].tribute;
      L.tributePaid += pay;
      ledgers[c.overlord].tribute += pay;
    }
    for (const tr of treatiesOf(w, c.id, 'subsidy')) {
      if (tr.a === c.id && ledgers[tr.b]) {
        L.subsidiesPaid += tr.amount ?? 0;
        ledgers[tr.b].subsidies += tr.amount ?? 0;
      }
    }
  }
  for (const c of Object.values(w.countries)) {
    if (!c.alive) continue;
    const L = ledgers[c.id];
    const gross = L.tax + L.trade + L.tariffs + L.tribute + L.subsidies;
    const wf = wageFactor(w, c.id);
    L.army = armyUpkeep(w, c.id);
    L.navy = navyUpkeep(w, c.id);
    L.buildings = buildingUpkeep(w, c.id);
    const adminLaw = lawOption('administration', c.laws.administration)?.costMult ?? 1;
    const civilList = provincesOf(w, c.id).length * 0.12 * (0.35 + 0.65 * wf);
    L.administration = ((L.tax + L.trade + L.tariffs) * 0.11 * c.budget.administration * (1 + c.corruption / 200) + civilList) * adminLaw;
    // A vast idle treasury is never idle for long: palaces, pensions and peculation absorb it.
    if (c.id !== w.playerId) L.administration += Math.max(0, c.treasury - gross * 24) * 0.015;
    const eduCost = lawOption('education', c.laws.education)?.costMult ?? 1;
    L.research = gross * 0.035 * c.budget.research * eduCost;
    L.espionage = gross * 0.025 * c.budget.espionage;
    L.diplomacy = c.envoys.length * (1 + 2 * wf);
    for (const loan of c.loans) {
      L.interest += loan.principal * loan.rate / 12;
      if (loan.monthsLeft) L.interest += loan.principal / loan.monthsLeft;
    }
    L.income = gross + L.other;
    L.expenses = L.army + L.navy + L.buildings + L.administration + L.research + L.espionage + L.diplomacy + L.interest + L.tributePaid + L.subsidiesPaid;
    L.balance = L.income - L.expenses;
  }
  return ledgers;
}

const NON_STATE = ['decentralized', 'nomadic', 'confederation'];

/**
 * Called once at the start: the tax model captures only part of what early-modern states
 * collected. Each polity receives a fixed multiplier so that its 1800 budget roughly balances
 * (powers already at war may run modest deficits, as they did historically).
 */
export function calibrateRevenue(w: WorldState): void {
  refreshLedgers(w);
  for (const c of Object.values(w.countries)) {
    if (!c.alive) continue;
    const L = c.last;
    const atWarNow = Object.values(w.wars).some((war) => war.attackers.includes(c.id) || war.defenders.includes(c.id));
    const target = L.expenses * (atWarNow ? 0.92 : 1.06) - (L.income - L.tax);
    if (target <= L.tax) continue;
    // Chiefdoms and micro-states keep little cash: their budgets are abstractions, so allow large factors.
    const cap = NON_STATE.includes(def(c.id).polityType) || c.laws.taxation === 'tribute_and_custom' || L.income < 5 ? 40 : 8;
    c.revenueMod = Math.round(clamp(target / Math.max(0.02, L.tax), 1, cap) * 100) / 100;
  }
  refreshLedgers(w);
}

/** Recompute ledgers without changing treasuries (for display after load or actions). */
export function refreshLedgers(w: WorldState): void {
  const ledgers = computeLedgers(w);
  for (const [id, L] of Object.entries(ledgers)) w.countries[id].last = L;
}

export function monthlyEconomy(w: WorldState): void {
  const ledgers = computeLedgers(w);
  for (const [id, L] of Object.entries(ledgers)) {
    const c = w.countries[id];
    c.last = L;
    c.treasury += L.balance;
    // Amortise term loans.
    for (const loan of c.loans) {
      if (loan.monthsLeft) {
        loan.principal -= loan.principal / loan.monthsLeft;
        loan.monthsLeft -= 1;
      }
    }
    c.loans = c.loans.filter((l) => l.monthsLeft === null || (l.monthsLeft > 0 && l.principal > 0.5));
    // Inflation: bullion inflows push prices up; good institutions restrain them.
    let bullion = 0;
    for (const pid of provincesOf(w, id)) {
      const g = PROVINCE_DEFS[pid].good;
      if (g === 'gold' || g === 'silver') bullion += 1;
    }
    const banking = c.techs.includes('central_banking') ? 0.05 : 0.025;
    c.inflation = clamp(c.inflation + bullion * 0.02 - banking, 0, 80);
    if (c.treasury < 0) handleDeficit(w, id);
  }
}

function handleDeficit(w: WorldState, id: string): void {
  const c = w.countries[id];
  const need = -c.treasury + Math.max(10, c.last.income * 0.5);
  if (need <= creditAvailable(w, id)) {
    takeLoan(w, id, Math.round(need), true);
    return;
  }
  const notable = id === w.playerId || def(id).population >= 1_500_000;
  if (!c.loans.length) {
    // Nothing to default on: wages go unpaid instead. Soldiers desert and officials take bribes.
    c.treasury = 0;
    for (const a of armiesOf(w, id)) {
      a.morale *= 0.85;
      for (const u of ['infantry', 'cavalry', 'artillery', 'irregulars'] as const) a.units[u] *= 0.96;
    }
    c.stability = clamp(c.stability - 1, 0, 100);
    c.corruption = clamp(c.corruption + 0.5, 0, 100);
    if (id === w.playerId && w.turn % 3 === 0) notify(w, 'The treasury is empty: soldiers and officials go unpaid. Raise taxes, cut costs or seek credit.', 'danger');
    return;
  }
  // Bankruptcy: repudiate half of the debt.
  for (const l of c.loans) l.principal *= 0.5;
  c.treasury = Math.max(0, c.last.income);
  c.stability = clamp(c.stability - 20, 0, 100);
  c.legitimacy = clamp(c.legitimacy - 10, 0, 100);
  c.prestige = clamp(c.prestige - 15, 0, 100);
  c.inflation = clamp(c.inflation + 8, 0, 80);
  c.corruption = clamp(c.corruption + 5, 0, 100);
  for (const a of armiesOf(w, id)) a.morale *= 0.6;
  if (!c.modifiers.some((m) => m.id === 'bankruptcy')) c.modifiers.push({ id: 'bankruptcy', label: 'State Bankruptcy', monthsLeft: 36, trade: -0.2, stability: -0.3 });
  if (notable) chronicle(w, { text: `${countryName(w, id)} declares bankruptcy and repudiates half its debts.`, category: 'economy', countries: [id], importance: id === w.playerId ? 3 : 2 });
  if (id === w.playerId) notify(w, 'The treasury is empty and our creditors refuse further loans. The state has defaulted.', 'danger');
}

export function totalDebt(w: WorldState, c: string): number {
  return w.countries[c].loans.reduce((s, l) => s + l.principal, 0);
}

export function loanRate(w: WorldState, c: string): number {
  const country = w.countries[c];
  const annual = Math.max(1, country.last.income * 12);
  const ratio = totalDebt(w, c) / annual;
  let r = 0.05 + Math.min(0.08, ratio * 0.012) + (country.stability < 30 ? 0.02 : 0) + country.inflation / 1000;
  if (country.techs.includes('central_banking')) r -= 0.015;
  return Math.round(clamp(r, 0.025, 0.18) * 1000) / 1000;
}

export function creditAvailable(w: WorldState, c: string): number {
  const country = w.countries[c];
  const termDebt = country.loans.filter((l) => l.monthsLeft !== null).reduce((s, l) => s + l.principal, 0);
  return Math.max(0, country.last.income * 18 * (0.5 + country.stability / 100) - termDebt);
}

export function takeLoan(w: WorldState, c: string, amount: number, emergency = false): Loan | null {
  const country = w.countries[c];
  if (amount <= 0 || amount > creditAvailable(w, c) + 0.5) return null;
  const loan: Loan = { id: newId(w, 'l'), principal: amount, rate: loanRate(w, c) + (emergency ? 0.02 : 0), monthsLeft: 60, lender: emergency ? 'Emergency bankers\' advance' : 'Bankers\' consortium' };
  country.loans.push(loan);
  country.treasury += amount;
  country.inflation = clamp(country.inflation + amount / Math.max(50, country.last.income * 60), 0, 80);
  return loan;
}

export function repayLoan(w: WorldState, c: string, loanId: string): boolean {
  const country = w.countries[c];
  const loan = country.loans.find((l) => l.id === loanId);
  if (!loan || country.treasury < loan.principal) return false;
  country.treasury -= loan.principal;
  country.loans = country.loans.filter((l) => l !== loan);
  return true;
}

/** Monthly drift of world prices: supply, demand from population and industry, and shocks. */
export function updatePrices(w: WorldState): void {
  const supply: Partial<Record<TradeGoodId, number>> = {};
  let industry = 0;
  for (const p of Object.values(w.provinces)) {
    if (!p.owner) continue;
    const g = PROVINCE_DEFS[p.id].good;
    supply[g] = (supply[g] ?? 0) + Math.sqrt(p.pop) * (1 + (p.buildings.mine ?? 0) * 0.3);
    industry += (p.buildings.textile_mill ?? 0) + (p.buildings.ironworks ?? 0) + (p.buildings.steam_works ?? 0);
  }
  const base0 = (w.flags.supply0 as unknown as string) ? JSON.parse(w.flags.supply0 as string) as Record<string, number> : null;
  if (!base0) {
    w.flags.supply0 = JSON.stringify(supply);
    w.flags.industry0 = industry;
    return;
  }
  const industryGrowth = industry / Math.max(1, (w.flags.industry0 as number) ?? 1);
  for (const g of Object.keys(GOODS) as TradeGoodId[]) {
    const s0 = base0[g] ?? 1;
    const s1 = supply[g] ?? s0;
    let demand = 1;
    if (g === 'cotton' || g === 'iron' || g === 'coal' || g === 'wool') demand *= 1 + (industryGrowth - 1) * 0.15;
    if (g === 'textiles') demand *= 1 / (1 + (industryGrowth - 1) * 0.08);
    const target = GOODS[g].price * clamp(Math.pow(demand * s0 / Math.max(0.01, s1), 0.4), 0.5, 2.2);
    const cur = w.prices[g] ?? GOODS[g].price;
    w.prices[g] = Math.round((cur + (target - cur) * 0.08 + cur * gaussian(w) * 0.012) * 100) / 100;
    if (chance(w, 0.0015)) {
      const shock = chance(w, 0.5) ? 1.35 : 0.72;
      w.prices[g] = Math.round(w.prices[g] * shock * 100) / 100;
      chronicle(w, { text: `World ${GOODS[g].name.toLowerCase()} prices ${shock > 1 ? 'soar' : 'collapse'} on news from the great markets.`, category: 'economy', countries: [], importance: 1 });
    }
  }
}

export function allies(w: WorldState, c: string): string[] {
  return treatiesOf(w, c, 'alliance').map((t) => partner(t, c));
}
