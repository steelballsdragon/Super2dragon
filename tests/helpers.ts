import { createWorld } from '../src/game/create';
import { refreshLedgers } from '../src/game/economy';
import type { Army, WorldState } from '../src/game/types';
import { forcesChanged, newId } from '../src/game/state';

export function world(playerId = 'maratha', seed = 7): WorldState {
  return createWorld({ playerId, seed });
}

/** Removes every war so tests start from peace. */
export function makePeaceful(w: WorldState): WorldState {
  w.wars = {};
  w.flags.ver = ((w.flags.ver as number) ?? 0) + 1;
  refreshLedgers(w);
  return w;
}

export function placeArmy(w: WorldState, owner: string, location: string, infantry: number, extra: Partial<Army> = {}): Army {
  const a: Army = {
    id: newId(w, 'a'), owner, name: `Test army of ${owner}`, location,
    units: { infantry, cavalry: 0, artillery: 0, irregulars: 0 },
    morale: 1, experience: 0, path: [], progress: 0, status: 'idle', ...extra,
  };
  w.armies[a.id] = a;
  forcesChanged(w);
  return a;
}

export function finite(n: unknown): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}
