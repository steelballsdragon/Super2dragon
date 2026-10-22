import { describe, expect, it } from 'vitest';
import { applyAction, previewAction } from '../src/game/actions';
import { interpretCommand, matchProvince } from '../src/game/advisor';
import { gatherPlan } from '../src/game/military';
import { armiesOf } from '../src/game/state';
import { advanceMonths } from '../src/game/turn';
import { makePeaceful, world } from './helpers';

describe('gathering the armies', () => {
  it('marches every army that can reach one province, and leaves the rest', () => {
    const w = makePeaceful(world('ottoman'));
    const target = w.countries.ottoman.capital;
    const plan = gatherPlan(w, 'ottoman', target);
    expect(plan.going.length).toBeGreaterThan(2);
    const pv = previewAction(w, 'ottoman', { type: 'gatherArmies', target });
    expect(pv.valid).toBe(true);
    expect(pv.consequences.join(' ')).toMatch(/armies march/);
    const res = applyAction(w, 'ottoman', { type: 'gatherArmies', target });
    expect(res.ok).toBe(true);
    for (const g of plan.going) expect(w.armies[g.army.id].path.at(-1)).toBe(target);
    for (const a of plan.stuck) expect(w.armies[a.id].path).toHaveLength(0);
    advanceMonths(w, 24);
    const arrived = armiesOf(w, 'ottoman').filter((a) => a.location === target).length;
    expect(arrived).toBeGreaterThanOrEqual(Math.min(plan.going.length, 3));
  });

  it('refuses when nothing can move there', () => {
    const w = makePeaceful(world('ottoman'));
    const target = w.countries.ottoman.capital;
    for (const a of armiesOf(w, 'ottoman')) { a.location = target; a.path = []; a.status = 'idle'; }
    const again = previewAction(w, 'ottoman', { type: 'gatherArmies', target });
    expect(again.valid).toBe(false);
    expect(again.errors[0]).toMatch(/already there/);
    expect(applyAction(w, 'ottoman', { type: 'gatherArmies', target }).ok).toBe(false);
  });

  it('understands orders to gather the troops', () => {
    const w = makePeaceful(world('sikh_misls', 4));
    const named = interpretCommand(w, 'sikh_misls', 'Gather all troops at Multan');
    expect(named.intent).toBe('gather');
    const step = named.steps.find((s) => s.action.type === 'gatherArmies');
    expect(step && step.action.type === 'gatherArmies' ? step.action.target : null).toBe(matchProvince('Multan'));
    const home = interpretCommand(w, 'sikh_misls', 'Move all my armies to one place');
    expect(home.steps.some((s) => s.action.type === 'gatherArmies' && s.action.target === w.countries.sikh_misls.capital)).toBe(true);
  });
});
