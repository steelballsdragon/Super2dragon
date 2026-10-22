import type { RngState, WorldState } from './types';

/**
 * Seeded sfc32 generator. The state lives inside the world so saves are reproducible:
 * the same save + the same player actions always produce the same future.
 */
export function seedRng(seed: number): RngState {
  let s = (seed >>> 0) || 0x9e3779b9;
  const split = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const st: RngState = { a: split(), b: split(), c: split(), d: split() };
  for (let i = 0; i < 12; i++) nextRaw(st);
  return st;
}

export function nextRaw(st: RngState): number {
  const t = (((st.a + st.b) >>> 0) + st.d) >>> 0;
  st.d = (st.d + 1) >>> 0;
  st.a = st.b ^ (st.b >>> 9);
  st.b = (st.c + (st.c << 3)) >>> 0;
  st.c = ((st.c << 21) | (st.c >>> 11)) >>> 0;
  st.c = (st.c + t) >>> 0;
  return t >>> 0;
}

/** Uniform float in [0, 1). */
export function rand(w: WorldState): number {
  return nextRaw(w.rng) / 4294967296;
}

export function randRange(w: WorldState, lo: number, hi: number): number {
  return lo + rand(w) * (hi - lo);
}

export function randInt(w: WorldState, lo: number, hiInclusive: number): number {
  return lo + Math.floor(rand(w) * (hiInclusive - lo + 1));
}

export function chance(w: WorldState, p: number): boolean {
  return rand(w) < p;
}

export function pick<T>(w: WorldState, items: readonly T[]): T {
  return items[Math.floor(rand(w) * items.length)];
}

export function weightedPick<T>(w: WorldState, items: readonly T[], weight: (t: T) => number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return undefined;
  let r = rand(w) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Approximately normal (Irwin–Hall with 4 samples), mean 0, sd ≈ 1. */
export function gaussian(w: WorldState): number {
  return (rand(w) + rand(w) + rand(w) + rand(w) - 2) * 1.732;
}
