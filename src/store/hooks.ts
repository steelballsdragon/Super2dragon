import type { CountryState, WorldState } from '../game/types';
import { useGame } from './game';

/** The live campaign. Re-renders whenever the world changes (rev). */
export function useWorld(): { w: WorldState; rev: number; me: string; c: CountryState } {
  const w = useGame((s) => s.world)!;
  const rev = useGame((s) => s.rev);
  return { w, rev, me: w.playerId, c: w.countries[w.playerId] };
}
