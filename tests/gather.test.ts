import { describe, expect, it } from 'vitest';
import { applyAction, previewAction } from '../src/game/actions';
import { interpretCommand, matchProvince } from '../src/game/advisor';
import { gatherPlan } from '../src/game/voyage';
import { armiesOf, provincesOf } from '../src/game/state';
import { findPath } from '../src/game/military';
import { isCoastal } from '../src/game/static';
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
    for (const { army } of plan.stuck) expect(w.armies[army.id].path).toHaveLength(0);
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

  it('sends armies by sea to a shore no road reaches', () => {
    // A realm with land of its own that no road from its armies reaches.
    let found: { w: ReturnType<typeof world>; c: string; island: string } | null = null;
    for (const c of ['denmark_norway', 'great_britain', 'spain', 'naples', 'sweden', 'portugal', 'ottoman']) {
      const w = makePeaceful(world(c));
      const from = armiesOf(w, c).map((a) => a.location);
      const island = provincesOf(w, c).find((p) => isCoastal(p) && from.length && from.every((l) => l !== p && !findPath(w, c, l, p)));
      if (island) { found = { w, c, island }; break; }
    }
    expect(found).not.toBeNull();
    const { w, c, island } = found!;
    const plan = gatherPlan(w, c, island);
    expect(plan.sailing.length).toBeGreaterThan(0);
    const pv = previewAction(w, c, { type: 'gatherArmies', target: island });
    expect(pv.valid).toBe(true);
    expect(pv.consequences.join(' ')).toMatch(/by sea/);
    const res = applyAction(w, c, { type: 'gatherArmies', target: island });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/take ship|takes ship/);
    advanceMonths(w, 18);
    expect(armiesOf(w, c).some((a) => a.location === island)).toBe(true);
  });

  it('can hold the nearer armies back so all arrive together', () => {
    const arrivals = (together: boolean) => {
      const w = makePeaceful(world('ottoman'));
      const target = w.countries.ottoman.capital;
      const plan = gatherPlan(w, 'ottoman', target);
      expect(applyAction(w, 'ottoman', { type: 'gatherArmies', target, together }).ok).toBe(true);
      const ids = plan.going.map((g) => g.army.id);
      if (together) {
        const held = ids.filter((id) => (w.armies[id].departAt ?? 0) > w.turn);
        expect(held.length).toBeGreaterThan(0);
        expect(previewAction(w, 'ottoman', { type: 'gatherArmies', target, together }).valid).toBe(true);
      }
      const when: Record<string, number> = {};
      for (let m = 1; m <= 30 && Object.keys(when).length < ids.length; m++) {
        advanceMonths(w, 1);
        for (const id of ids) if (when[id] === undefined && w.armies[id]?.location === target) when[id] = m;
      }
      const t = Object.values(when);
      return Math.max(...t) - Math.min(...t);
    };
    const spreadEach = arrivals(false);
    const spreadTogether = arrivals(true);
    expect(spreadEach).toBeGreaterThan(1);
    expect(spreadTogether).toBeLessThanOrEqual(2);
    expect(spreadTogether).toBeLessThan(spreadEach);
  });

  it('a new order cancels the wait', () => {
    const w = makePeaceful(world('ottoman'));
    const target = w.countries.ottoman.capital;
    applyAction(w, 'ottoman', { type: 'gatherArmies', target, together: true });
    const waiting = armiesOf(w, 'ottoman').find((a) => (a.departAt ?? 0) > w.turn)!;
    expect(waiting).toBeDefined();
    applyAction(w, 'ottoman', { type: 'stopArmy', army: waiting.id });
    expect(w.armies[waiting.id].departAt).toBeUndefined();
  });

  it('says to declare war before gathering on a neutral’s land', () => {
    const w = makePeaceful(world('sikh_misls'));
    const target = provincesOf(w, 'durrani')[0];
    const pv = previewAction(w, 'sikh_misls', { type: 'gatherArmies', target });
    expect(pv.valid).toBe(false);
    expect(pv.errors[0]).toMatch(/Declare war/);
  });
});
