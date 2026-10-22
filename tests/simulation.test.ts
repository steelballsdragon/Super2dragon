import { describe, expect, it } from 'vitest';
import { REBELS } from '../src/game/constants';
import { provincesOf } from '../src/game/state';
import { GEO } from '../src/game/static';
import { advanceMonth } from '../src/game/turn';
import { finite, world } from './helpers';

describe('the world simulation', () => {
  it('runs three years with the AI without corrupting state', () => {
    const w = world('maratha', 21);
    const t0 = performance.now();
    for (let m = 0; m < 36; m++) advanceMonth(w);
    const msPerMonth = (performance.now() - t0) / 36;
    expect(w.turn).toBe(36);
    for (const c of Object.values(w.countries)) {
      for (const k of ['treasury', 'stability', 'legitimacy', 'prestige', 'corruption', 'inflation', 'manpower', 'taxRate'] as const) {
        expect(finite(c[k]), `${c.id}.${k}`).toBe(true);
      }
      expect(c.stability).toBeGreaterThanOrEqual(0);
      expect(c.stability).toBeLessThanOrEqual(100);
      if (c.alive) expect(provincesOf(w, c.id).length, `${c.id} alive without land`).toBeGreaterThan(0);
    }
    for (const p of Object.values(w.provinces)) {
      expect(finite(p.pop) && p.pop >= 0, p.id).toBe(true);
      expect(finite(p.unrest), p.id).toBe(true);
      if (p.owner) expect(w.countries[p.owner]?.alive, `${p.id} owned by dead ${p.owner}`).toBe(true);
    }
    for (const a of Object.values(w.armies)) {
      expect(a.owner === REBELS || !!w.countries[a.owner], a.id).toBe(true);
      expect(GEO.provinces[a.location] !== undefined || a.status === 'embarked', `${a.id} at ${a.location}`).toBe(true);
      for (const u of Object.values(a.units)) expect(finite(u) && u >= 0).toBe(true);
    }
    for (const war of Object.values(w.wars)) {
      expect(war.attackers.length).toBeGreaterThan(0);
      expect(war.defenders.length).toBeGreaterThan(0);
      expect(war.score).toBeGreaterThanOrEqual(-100);
      expect(war.score).toBeLessThanOrEqual(100);
    }
    expect(w.chronicle.length).toBeGreaterThan(5);
    expect(w.playerHistory.length).toBe(36);
    // Keep the monthly turn responsive (the browser runs it in a worker).
    expect(msPerMonth).toBeLessThan(1500);
  });
});
