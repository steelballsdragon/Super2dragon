import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Divider } from '../art/Ornaments';
import { defaultStorage, loadGame } from '../game/save';
import type { WorldState } from '../game/types';
import { ChronicleList } from '../panels/ChroniclesPanel';
import { useGame } from '../store/game';
import { Empty } from '../ui/kit';
import { previewWorld } from './previewWorld';

export function Chronicles() {
  const { setScreen, saves, world } = useGame();
  const [choice, setChoice] = useState<string>(world ? 'current' : saves[0]?.id ?? 'opening');
  const { w, error } = useMemo((): { w: WorldState | null; error: string | null } => {
    if (choice === 'current' && world) return { w: world, error: null };
    if (choice === 'opening') return { w: previewWorld(), error: null };
    try { return { w: loadGame(defaultStorage(), choice), error: null }; } catch (e) { return { w: null, error: (e as Error).message }; }
  }, [choice, world]);
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ink scroll-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <button className="btn btn-quiet !px-2" onClick={() => setScreen('menu')}><ArrowLeft size={16} /> Menu</button>
        <h1 className="title-gilt mt-4 text-center text-2xl">Chronicles</h1>
        <div className="mx-auto mt-2 w-72"><Divider /></div>
        <p className="mt-2 text-center font-serif italic text-parchment-dim">The histories written by your campaigns</p>
        <select className="input mx-auto mt-4 block max-w-md" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Which chronicle">
          {world ? <option value="current">Current campaign — {world.campaign.name}</option> : null}
          {saves.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.countryName}, {m.date})</option>)}
          <option value="opening">The world on 1 January 1800</option>
        </select>
        <div className="mt-5">
          {error ? <Empty>{error}</Empty> : w ? <ChronicleList w={w} me={w.playerId} limit={600} /> : null}
        </div>
      </div>
    </div>
  );
}
