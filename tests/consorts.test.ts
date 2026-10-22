import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { performDiplomacy } from '../src/game/diplomacy';
import { bearChild, consortBlocker, consortHome, consortsOf, household, maxConsorts, otherParent, processHousehold } from '../src/game/family';
import { deserialize, serialize } from '../src/game/save';
import { addOpinion } from '../src/game/state';
import { makePeaceful, world } from './helpers';

describe('several consorts', () => {
  it('starts Ranjit Singh with both his wives of 1800', () => {
    const w = world('sikh_misls');
    expect(consortsOf(w, 'sikh_misls').map((c) => c.name)).toEqual(['Mehtab Kaur', 'Datar Kaur']);
    expect(maxConsorts(w, 'sikh_misls')).toBe(6);
    expect(maxConsorts(w, 'austria')).toBe(1);
    expect(maxConsorts(w, 'ottoman')).toBe(4);
  });

  it('brings a new consort with each marriage into another house, within custom', () => {
    const w = makePeaceful(world('sikh_misls'));
    addOpinion(w, 'patiala', 'sikh_misls', 200);
    expect(performDiplomacy(w, 'sikh_misls', 'patiala', 'marriage').ok).toBe(true);
    const list = consortsOf(w, 'sikh_misls');
    expect(list).toHaveLength(3);
    expect(list[2].origin).toBe('patiala');
    expect(consortHome(w, list[2]).from).toMatch(/Patiala/);
    while (!consortBlocker(w, 'sikh_misls')) applyAction(w, 'sikh_misls', { type: 'court', kind: 'findConsort' });
    expect(consortsOf(w, 'sikh_misls')).toHaveLength(6);
    expect(consortBlocker(w, 'sikh_misls')).toMatch(/as many as custom allows/);
  });

  it('keeps a Christian sovereign to one consort, though the houses are still joined', () => {
    const w = makePeaceful(world('austria'));
    addOpinion(w, 'bavaria', 'austria', 200);
    const before = consortsOf(w, 'austria').length;
    performDiplomacy(w, 'austria', 'bavaria', 'marriage');
    expect(consortsOf(w, 'austria')).toHaveLength(before);
  });

  it('records which consort is each child’s other parent', () => {
    const w = world('sikh_misls');
    const [m1, m2] = consortsOf(w, 'sikh_misls');
    const a = bearChild(w, 'sikh_misls', 'son', m1.id);
    const b = bearChild(w, 'sikh_misls', 'daughter', m2.id);
    expect(otherParent(w, a)?.name).toBe('Mehtab Kaur');
    expect(otherParent(w, b)?.name).toBe('Datar Kaur');
    expect(m1.lastBirth).toBe(w.turn);
  });

  it('has children by different consorts over the years', () => {
    const w = makePeaceful(world('sikh_misls'));
    for (let m = 0; m < 120; m++) { processHousehold(w, 'sikh_misls'); w.turn++; }
    const mothers = new Set(household(w, 'sikh_misls').map((ch) => ch.consortParent).filter(Boolean));
    expect(mothers.size).toBeGreaterThanOrEqual(2);
  });

  it('turns the single consort of an older save into a list', () => {
    const w = world('austria');
    const raw = JSON.parse(serialize(w));
    raw.schemaVersion = 3;
    for (const c of Object.values(raw.countries) as Record<string, unknown>[]) { c.consortId = (c.consorts as string[])[0]; delete c.consorts; }
    const back = deserialize(JSON.stringify(raw));
    expect(consortsOf(back, 'austria').map((c) => c.name)).toEqual(['Maria Theresa']);
    expect(Object.values(back.countries).every((c) => Array.isArray(c.consorts) && !('consortId' in c))).toBe(true);
  });
});
