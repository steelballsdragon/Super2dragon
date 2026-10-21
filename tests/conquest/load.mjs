// Loads the Age of Conquest engine from src/ into a fresh Node context (no browser) for tests and benchmarks.
// Only console and performance come from outside: the context's own Math, JSON and Date stay fast (functions from
// another context cannot be inlined, which made the engine about ten times slower).
import vm from 'node:vm';
import { engineSource } from '../../src/conquest/bundle.mjs';

export function loadEngine() {
  const ctx = vm.createContext({ console, performance });
  vm.runInContext(engineSource(), ctx, { filename: 'conquest-engine.js' });
  return ctx.AOC;
}
