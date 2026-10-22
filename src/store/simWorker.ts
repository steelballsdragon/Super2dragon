// Runs the monthly simulation off the main thread so the map stays smooth while time passes.
import { packWorld } from '../game/save';
import { advanceMonth } from '../game/turn';
import type { WorldState } from '../game/types';

interface Request { id: number; world: WorldState; months: number; pack: boolean }

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, world, months, pack } = e.data;
  try {
    for (let i = 0; i < months; i++) advanceMonth(world);
    const packed = pack ? packWorld(world) : undefined;
    (self as unknown as Worker).postMessage({ id, world, packed });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) });
  }
};
