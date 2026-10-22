import { describe, expect, it } from 'vitest';
import { serialize } from '../src/game/save';
import { nextRaw, seedRng } from '../src/game/rng';
import { advanceMonths } from '../src/game/turn';
import { world } from './helpers';

describe('seeded randomness', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seedRng(1234), b = seedRng(1234), c = seedRng(1235);
    const sa = Array.from({ length: 20 }, () => nextRaw(a));
    const sb = Array.from({ length: 20 }, () => nextRaw(b));
    const sc = Array.from({ length: 20 }, () => nextRaw(c));
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const v of sa) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(2 ** 32); }
  });

  it('makes whole campaigns reproducible', () => {
    const w1 = world('qing', 99), w2 = world('qing', 99);
    w1.campaign.created = w2.campaign.created = 0;
    w1.campaign.id = w2.campaign.id = 'x';
    advanceMonths(w1, 6);
    advanceMonths(w2, 6);
    expect(serialize(w1)).toEqual(serialize(w2));
  });
});
