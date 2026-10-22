import { describe, expect, it } from 'vitest';
import { applyAction, previewAction } from '../src/game/actions';
import { buildBlocker, processConstruction } from '../src/game/construction';
import { processResearch, techBlocker, techCost } from '../src/game/tech';
import { TECHNOLOGIES } from '../src/data/technologies';
import { world } from './helpers';

describe('construction', () => {
  it('charges the cost, queues the work and completes it in time', () => {
    const w = world('maratha');
    const c = w.countries.maratha;
    const pid = c.capital;
    const pv = previewAction(w, 'maratha', { type: 'build', province: pid, building: 'road' });
    expect(pv.valid).toBe(true);
    const t0 = c.treasury;
    expect(applyAction(w, 'maratha', { type: 'build', province: pid, building: 'road' }).ok).toBe(true);
    expect(c.treasury).toBeCloseTo(t0 - (pv.cost.treasury ?? 0), 6);
    const level = w.provinces[pid].buildings.road ?? 0;
    for (let m = 0; m < 40 && w.construction.some((k) => k.country === 'maratha'); m++) processConstruction(w);
    expect(w.provinces[pid].buildings.road).toBe(level + 1);
  });

  it('refuses buildings without the required technology or in foreign provinces', () => {
    const w = world('maratha');
    const cap = w.countries.maratha.capital;
    expect(buildBlocker(w, 'maratha', cap, 'steam_works')).toMatch(/Requires/);
    const foreign = w.countries.great_britain.capital;
    expect(applyAction(w, 'maratha', { type: 'build', province: foreign, building: 'road' }).ok).toBe(false);
  });

  it('does not allow the same project to be started twice in a province', () => {
    const w = world('maratha');
    const cap = w.countries.maratha.capital;
    expect(applyAction(w, 'maratha', { type: 'build', province: cap, building: 'market' }).ok).toBe(true);
    expect(applyAction(w, 'maratha', { type: 'build', province: cap, building: 'market' }).ok).toBe(false);
  });

  it('refunds part of a cancelled project', () => {
    const w = world('maratha');
    const c = w.countries.maratha;
    applyAction(w, 'maratha', { type: 'build', province: c.capital, building: 'temple' });
    const item = w.construction.find((k) => k.country === 'maratha')!;
    const t = c.treasury;
    expect(applyAction(w, 'maratha', { type: 'cancelBuild', id: item.id }).ok).toBe(true);
    expect(c.treasury).toBeGreaterThan(t);
  });
});

describe('research', () => {
  it('accumulates points and grants the chosen technology', () => {
    const w = world('maratha');
    const c = w.countries.maratha;
    const tech = TECHNOLOGIES.find((t) => !c.techs.includes(t.id) && !techBlocker(w, 'maratha', t.id))!;
    expect(applyAction(w, 'maratha', { type: 'research', tech: tech.id }).ok).toBe(true);
    const cost = techCost(w, 'maratha', tech.id);
    for (let m = 0; m < 600 && !c.techs.includes(tech.id); m++) processResearch(w, () => null);
    expect(c.techs).toContain(tech.id);
    expect(cost).toBeGreaterThan(0);
  });

  it('requires prerequisites', () => {
    const w = world('maratha');
    expect(techBlocker(w, 'maratha', 'railways')).toBeTruthy();
    expect(applyAction(w, 'maratha', { type: 'research', tech: 'railways' }).ok).toBe(false);
  });
});
