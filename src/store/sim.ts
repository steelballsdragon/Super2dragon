// Client for the simulation worker, with a synchronous fallback when workers are unavailable.
import { packWorld } from '../game/save';
import { advanceMonth } from '../game/turn';
import type { WorldState } from '../game/types';

interface Pending { resolve: (r: SimResult) => void; reject: (e: Error) => void }
export interface SimResult { world: WorldState; packed?: string }

let worker: Worker | null = null;
let disabled = false;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (disabled || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; world?: WorldState; packed?: string; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error || !e.data.world) p.reject(new Error(e.data.error ?? 'Simulation failed.'));
      else p.resolve({ world: e.data.world, packed: e.data.packed });
    };
    worker.onerror = (e) => {
      console.warn('Simulation worker unavailable, falling back to the main thread.', e.message);
      disabled = true;
      worker = null;
      for (const p of pending.values()) p.reject(new Error('worker-failed'));
      pending.clear();
    };
  } catch {
    disabled = true;
    return null;
  }
  return worker;
}

function runLocally(w: WorldState, months: number, pack: boolean): SimResult {
  for (let i = 0; i < months; i++) advanceMonth(w);
  return { world: w, packed: pack ? packWorld(w) : undefined };
}

/** Advances the world. The returned world may be a new object (when computed in the worker). */
export async function simulate(w: WorldState, months = 1, pack = false): Promise<SimResult> {
  const wk = getWorker();
  if (!wk) return runLocally(w, months, pack);
  const id = ++seq;
  try {
    return await new Promise<SimResult>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      wk.postMessage({ id, world: w, months, pack });
    });
  } catch (err) {
    if ((err as Error).message === 'worker-failed') return runLocally(w, months, pack);
    throw err;
  }
}
