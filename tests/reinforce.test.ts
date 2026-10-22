import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { applyAttrition, establishment, reinforceArmies } from '../src/game/military';
import { armiesOf, armyRegiments } from '../src/game/state';
import { advanceMonths } from '../src/game/turn';
import { makePeaceful, world } from './helpers';

describe('reinforcement and supply losses', () => {
  it('refills an army on friendly ground from the manpower reserve', () => {
    const w = makePeaceful(world('ottoman'));
    const a = armiesOf(w, 'ottoman')[0];
    const before = armyRegiments(a);
    establishment(a);
    a.units.infantry *= 0.6;
    const pool = w.countries.ottoman.manpower;
    for (let i = 0; i < 12; i++) reinforceArmies(w);
    expect(armyRegiments(a)).toBeGreaterThan(before * 0.98);
    expect(w.countries.ottoman.manpower).toBeLessThan(pool);
  });

  it('does not refill without manpower or money, or in enemy hands', () => {
    const w = makePeaceful(world('ottoman'));
    const a = armiesOf(w, 'ottoman')[0];
    establishment(a);
    a.units.infantry *= 0.5;
    const low = armyRegiments(a);
    w.countries.ottoman.manpower = 0;
    reinforceArmies(w);
    expect(armyRegiments(a)).toBeCloseTo(low, 5);
    w.countries.ottoman.manpower = 100;
    w.countries.ottoman.treasury = -1;
    reinforceArmies(w);
    expect(armyRegiments(a)).toBeCloseTo(low, 5);
  });

  it('keeps a merged army and a split army at their proper strength', () => {
    const w = makePeaceful(world('ottoman'));
    const a = armiesOf(w, 'ottoman')[0];
    const full = armyRegiments(a);
    applyAction(w, 'ottoman', { type: 'splitArmy', army: a.id });
    const halves = armiesOf(w, 'ottoman').filter((x) => x.location === a.location);
    const est = halves.reduce((n, x) => { const f = establishment(x); return n + f.infantry + f.cavalry + f.artillery + f.irregulars; }, 0);
    expect(est).toBeCloseTo(full, 0);
    for (let i = 0; i < 6; i++) reinforceArmies(w);
    expect(halves.reduce((n, x) => n + armyRegiments(x), 0)).toBeLessThan(full * 1.01);
    applyAction(w, 'ottoman', { type: 'mergeArmies', armies: halves.map((x) => x.id) });
    const merged = w.armies[halves[0].id];
    const f = establishment(merged);
    expect(f.infantry + f.cavalry + f.artillery + f.irregulars).toBeCloseTo(full, 0);
  });

  it('spares the player from supply losses when the setting is off', () => {
    const w = makePeaceful(world('ottoman'));
    const ids = armiesOf(w, 'ottoman').map((a) => a.id);
    const target = w.countries.ottoman.capital;
    for (const id of ids) { const a = w.armies[id]; a.location = target; a.status = 'idle'; a.path = []; }
    applyAction(w, 'ottoman', { type: 'mergeArmies', armies: ids });
    const host = w.armies[ids[0]];
    const size = armyRegiments(host);
    applyAttrition(w);
    expect(armyRegiments(host)).toBeLessThan(size);
    w.settings.supplyLosses = false;
    const now = armyRegiments(host);
    applyAttrition(w);
    expect(armyRegiments(host)).toBeCloseTo(now, 6);
  });

  it('a resting army at home keeps its strength over years of peace', () => {
    const w = makePeaceful(world('sikh_misls'));
    const before = armiesOf(w, 'sikh_misls').reduce((n, a) => n + armyRegiments(a), 0);
    advanceMonths(w, 36);
    const after = armiesOf(w, 'sikh_misls').reduce((n, a) => n + armyRegiments(a), 0);
    expect(after).toBeGreaterThan(before * 0.97);
  });
});
