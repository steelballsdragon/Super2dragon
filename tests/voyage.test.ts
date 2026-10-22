import { describe, expect, it } from 'vitest';
import { applyAction, previewAction } from '../src/game/actions';
import { addTreaty } from '../src/game/diplomacy';
import { armiesOf, armyRegiments, fleetsOf } from '../src/game/state';
import { coastalSeas, isCoastal } from '../src/game/static';
import { advanceMonths } from '../src/game/turn';
import { planVoyage } from '../src/game/voyage';
import type { WorldState } from '../src/game/types';
import { makePeaceful, world } from './helpers';

/** Advances month by month until the test holds (or gives up). */
function until(w: WorldState, done: () => boolean, max = 30): number {
  for (let m = 1; m <= max; m++) { advanceMonths(w, 1); if (done()) return m; }
  return -1;
}

describe('armies at sea', () => {
  it('hires ships, sails, lands and dismisses the hired transports', () => {
    const w = makePeaceful(world('ottoman'));
    for (const f of fleetsOf(w, 'ottoman')) w.fleets[f.id].location = 'black_sea'; // keep our own navy out of the way
    const a = armiesOf(w, 'ottoman').find((x) => x.location === 'constantinople')!;
    const target = 'cairo';
    const plan = planVoyage(w, a, target);
    expect(typeof plan).not.toBe('string');
    if (typeof plan === 'string') return;
    expect(plan.fleet).toBeNull();
    expect(plan.cost).toBeGreaterThan(0);
    const before = w.countries.ottoman.treasury;
    const res = applyAction(w, 'ottoman', { type: 'expedition', army: a.id, target });
    expect(res.ok).toBe(true);
    expect(w.countries.ottoman.treasury).toBeLessThan(before);
    expect(w.armies[a.id].status).toBe('embarked');
    expect(Object.values(w.fleets).some((f) => f.chartered && f.carrying.includes(a.id))).toBe(true);
    const months = until(w, () => w.armies[a.id]?.location === target && w.armies[a.id].status !== 'embarked');
    expect(months).toBeGreaterThan(0);
    expect(Object.values(w.fleets).some((f) => f.chartered)).toBe(false);
    expect(w.armies[a.id].voyage).toBeUndefined();
  });

  it('marches inland armies to a port first, and marches on from the landing to an inland goal', () => {
    const w = makePeaceful(world('austria'));
    addTreaty(w, 'alliance', 'austria', 'naples');
    const a = armiesOf(w, 'austria').find((x) => x.location === 'bohemia')!;
    expect(isCoastal('bohemia')).toBe(false);
    const plan = planVoyage(w, a, 'campania');
    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.toPort.length).toBeGreaterThan(0);
    expect(isCoastal(plan.embark)).toBe(true);
    applyAction(w, 'austria', { type: 'expedition', army: a.id, target: 'campania' });
    expect(w.armies[a.id].status).toBe('moving');
    expect(until(w, () => w.armies[a.id]?.location === 'campania' && w.armies[a.id].status !== 'embarked', 40)).toBeGreaterThan(0);

    const o = makePeaceful(world('ottoman'));
    for (const f of fleetsOf(o, 'ottoman')) o.fleets[f.id].location = 'aegean_sea';
    const b = armiesOf(o, 'ottoman').find((x) => x.location === 'constantinople')!;
    expect(isCoastal('erzurum')).toBe(false);
    const p2 = planVoyage(o, b, 'erzurum');
    if (typeof p2 === 'string') throw new Error(p2);
    expect(p2.landAt).not.toBe('erzurum');
    applyAction(o, 'ottoman', { type: 'expedition', army: b.id, target: 'erzurum' });
    expect(until(o, () => o.armies[b.id]?.location === 'erzurum', 40)).toBeGreaterThan(0);
  });

  it('will not land troops on a neutral shore without access', () => {
    const w = makePeaceful(world('austria'));
    const a = armiesOf(w, 'austria')[0];
    const plan = planVoyage(w, a, 'cairo');
    expect(typeof plan === 'string' ? plan : '').toMatch(/no right to land/);
  });

  it('sails free in our own fleet when one lies off the port with room', () => {
    const w = makePeaceful(world('ottoman'));
    const a = armiesOf(w, 'ottoman').find((x) => x.location === 'constantinople')!;
    const f = fleetsOf(w, 'ottoman')[0];
    w.fleets[f.id].location = coastalSeas('constantinople')[0];
    w.fleets[f.id].ships.transport = Math.ceil(armyRegiments(a) / 2) + 1;
    const plan = planVoyage(w, a, 'cairo');
    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.fleet?.id).toBe(f.id);
    expect(plan.cost).toBe(0);
  });

  it('explains when a landlocked realm cannot reach any port', () => {
    const w = makePeaceful(world('sikh_misls'));
    const a = armiesOf(w, 'sikh_misls')[0];
    addTreaty(w, 'access', 'sikh_misls', 'oman');
    const pv = previewAction(w, 'sikh_misls', { type: 'expedition', army: a.id, target: 'muscat' });
    expect(pv.valid).toBe(false);
    expect(pv.errors[0]).toMatch(/No road leads to a port/);
  });

  it('never lands a convoy at its destination before it gets there', () => {
    const w = makePeaceful(world('ottoman'));
    for (const f of fleetsOf(w, 'ottoman')) w.fleets[f.id].location = 'black_sea';
    const a = armiesOf(w, 'ottoman').find((x) => x.location === 'constantinople')!;
    applyAction(w, 'ottoman', { type: 'expedition', army: a.id, target: 'cairo' });
    const convoy = Object.values(w.fleets).find((f) => f.chartered)!;
    convoy.path = [];
    advanceMonths(w, 1);
    const army = w.armies[a.id];
    expect(army.location === 'cairo' && convoy.location !== undefined && !coastalSeas('cairo').includes(convoy.location)).toBe(false);
  });
});
