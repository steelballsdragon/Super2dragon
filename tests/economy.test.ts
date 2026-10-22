import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { creditAvailable, monthlyEconomy, refreshLedgers, takeLoan, totalDebt } from '../src/game/economy';
import { POLITIES } from '../src/game/static';
import { makePeaceful, world } from './helpers';

describe('treasury and taxation', () => {
  it('balances income against expenses in the ledger', () => {
    const w = world();
    for (const c of Object.values(w.countries)) {
      if (!c.alive) continue;
      const L = c.last;
      expect(L.balance).toBeCloseTo(L.income - L.expenses, 6);
      expect(Number.isFinite(L.income)).toBe(true);
    }
  });

  it('starts most realms near a balanced budget (historical calibration)', () => {
    const w = makePeaceful(world());
    const playable = Object.values(w.countries).filter((c) => c.alive && POLITIES[c.id].playable);
    const deficits = playable.filter((c) => c.last.balance < -Math.max(1, c.last.income * 0.05));
    expect(deficits.length / playable.length).toBeLessThan(0.1);
  });

  it('raises more revenue at higher tax rates', () => {
    const w = world('france');
    const before = w.countries.france.last.tax;
    expect(applyAction(w, 'france', { type: 'setTax', value: w.countries.france.taxRate + 0.05 }).ok).toBe(true);
    refreshLedgers(w);
    expect(w.countries.france.last.tax).toBeGreaterThan(before);
  });

  it('applies the monthly balance to the treasury', () => {
    const w = world('great_britain');
    const c = w.countries.great_britain;
    refreshLedgers(w);
    const t0 = c.treasury;
    monthlyEconomy(w);
    expect(c.treasury).toBeCloseTo(t0 + c.last.balance, 4);
  });
});

describe('loans and bankruptcy', () => {
  it('lends only up to the credit limit and charges interest', () => {
    const w = world('maratha');
    const c = w.countries.maratha;
    const limit = creditAvailable(w, 'maratha');
    expect(limit).toBeGreaterThan(0);
    expect(applyAction(w, 'maratha', { type: 'takeLoan', amount: Math.round(limit * 2) }).ok).toBe(false);
    const t0 = c.treasury;
    expect(applyAction(w, 'maratha', { type: 'takeLoan', amount: 50 }).ok).toBe(true);
    expect(c.treasury).toBe(t0 + 50);
    expect(totalDebt(w, 'maratha')).toBe(50);
    expect(c.last.interest).toBeGreaterThan(0);
  });

  it('repays a loan in full when the treasury allows', () => {
    const w = world('maratha');
    const loan = takeLoan(w, 'maratha', 40)!;
    expect(applyAction(w, 'maratha', { type: 'repayLoan', loanId: loan.id }).ok).toBe(true);
    expect(w.countries.maratha.loans.find((l) => l.id === loan.id)).toBeUndefined();
  });

  it('defaults on half the debt when credit runs out', () => {
    const w = world('spain');
    const c = w.countries.spain;
    c.loans.push({ id: 'big', principal: 1_000_000, rate: 0.06, monthsLeft: 60, lender: 'test' });
    c.treasury = -1_000_000;
    c.last.income = 1;
    const stab = c.stability;
    monthlyEconomy(w);
    expect(c.loans.find((l) => l.id === 'big')!.principal).toBeLessThan(600_000);
    expect(c.stability).toBeLessThan(stab);
    expect(c.modifiers.some((m) => m.id === 'bankruptcy')).toBe(true);
  });

  it('leaves soldiers unpaid rather than bankrupt when there is no debt to repudiate', () => {
    const w = world('comanche');
    const c = w.countries.comanche;
    c.loans = [];
    c.treasury = -50;
    c.last.income = 0;
    monthlyEconomy(w);
    expect(c.treasury).toBeGreaterThanOrEqual(0);
    expect(c.modifiers.some((m) => m.id === 'bankruptcy')).toBe(false);
  });
});
