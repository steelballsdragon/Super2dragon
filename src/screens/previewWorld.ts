import { createWorld } from '../game/create';
import type { WorldState } from '../game/types';

let preview: WorldState | null = null;

/** The world as it stood on 1 January 1800, for the selection screen and the atlas. */
export function previewWorld(): WorldState {
  if (!preview) preview = createWorld({ playerId: 'great_britain', seed: 1800 });
  return preview;
}
