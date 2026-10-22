import { describe, expect, it } from 'vitest';
import {
  devAddChild, devAddConsort, devAddTreaty, devAnnex, devEndReign, devFinishResearch, devGiveProvince, devGrantTechs, devPeaceAll,
  devRaiseArmy, devResolvePendingEvents, devSetRelation, devSetStat, devTriggerEvent,
} from '../src/game/dev';
import { EVENTS } from '../src/game/events/defs';
import { consortsOf, household } from '../src/game/family';
import { armiesOf, hasTreaty, opinion, provincesOf, warsOf } from '../src/game/state';
import { advanceMonths } from '../src/game/turn';
import { world } from './helpers';

describe('developer tools', () => {
  it('edits a realm and notes it once in the chronicle', () => {
    const w = world('sikh_misls');
    devSetStat(w, 'sikh_misls', 'treasury', 1234);
    devSetStat(w, 'sikh_misls', 'stability', 500);
    expect(w.countries.sikh_misls.treasury).toBe(1234);
    expect(w.countries.sikh_misls.stability).toBe(100);
    expect(w.flags.devUsed).toBe(1);
    expect(w.chronicle.filter((e) => e.text.includes('Developer tools')).length).toBe(1);
    expect(() => devSetStat(w, 'sikh_misls', 'prestige', Number.NaN)).toThrow();
  });

  it('builds a royal household', () => {
    const w = world('sikh_misls');
    devAddConsort(w, 'sikh_misls', 'patiala');
    expect(consortsOf(w, 'sikh_misls').map((x) => x.origin)).toContain('patiala');
    devAddChild(w, 'sikh_misls', 'son');
    devAddChild(w, 'sikh_misls', 'daughter');
    const kids = household(w, 'sikh_misls');
    expect(kids.map((k) => k.female).sort()).toEqual([false, true]);
    const heir = w.countries.sikh_misls.heirId!;
    devEndReign(w, 'sikh_misls');
    expect(w.countries.sikh_misls.rulerId).toBe(heir);
  });

  it('rewrites diplomacy and the map', () => {
    const w = world('sikh_misls');
    devSetRelation(w, 'sikh_misls', 'durrani', 150);
    expect(opinion(w, 'sikh_misls', 'durrani')).toBeGreaterThanOrEqual(150);
    devAddTreaty(w, 'sikh_misls', 'patiala', 'alliance');
    expect(hasTreaty(w, 'alliance', 'sikh_misls', 'patiala')).toBe(true);
    expect(() => devAddTreaty(w, 'sikh_misls', 'patiala', 'alliance')).toThrow();
    const pid = provincesOf(w, 'kangra')[0];
    devGiveProvince(w, pid, 'sikh_misls');
    expect(w.provinces[pid].owner).toBe('sikh_misls');
    const patialaLand = provincesOf(w, 'patiala');
    devAnnex(w, 'patiala', 'sikh_misls');
    expect(w.countries.patiala.alive).toBe(false);
    expect(patialaLand.every((p) => w.provinces[p].owner === 'sikh_misls')).toBe(true);
    expect(armiesOf(w, 'patiala')).toHaveLength(0);
    expect(() => advanceMonths(w, 2)).not.toThrow();
  });

  it('ends wars, raises troops and grants research', () => {
    const w = world('austria');
    expect(warsOf(w, 'austria').length).toBeGreaterThan(0);
    devPeaceAll(w, 'austria');
    expect(warsOf(w, 'austria')).toHaveLength(0);
    const before = armiesOf(w, 'austria').length;
    devRaiseArmy(w, 'austria', { infantry: 5, cavalry: 1 });
    expect(armiesOf(w, 'austria').length).toBe(before + 1);
    const known = w.countries.austria.techs.length;
    devGrantTechs(w, 'austria');
    expect(w.countries.austria.techs.length).toBeGreaterThan(known);
    w.countries.austria.research = { tech: null, progress: 0 };
    expect(() => devFinishResearch(w, 'austria')).toThrow();
    expect(() => advanceMonths(w, 2)).not.toThrow();
  });

  it('triggers events for the player and can let the council decide them', () => {
    const w = world('sikh_misls');
    const ev = EVENTS.find((e) => !e.setup)!;
    devTriggerEvent(w, ev.id);
    expect(w.pendingEvents.some((e) => e.defId === ev.id)).toBe(true);
    devResolvePendingEvents(w);
    expect(w.pendingEvents).toHaveLength(0);
  });
});
