import { EventArt } from '../../art/EventArt';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';

export function GameOver() {
  const { w, c } = useWorld();
  const { quitToMenu, openPanel } = useGame();
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="parchment max-w-lg overflow-hidden rounded-lg shadow-2xl">
        <EventArt kind="defeat" className="block h-40 w-full" />
        <div className="p-6">
          <h2 className="font-display text-2xl uppercase tracking-[0.1em] text-[#3b2a14]">The End of a Chronicle</h2>
          <p className="mt-2 font-serif text-[17px] text-[#2b2116]">In {String(w.flags.gameOver)} our realm ceased to exist as an independent polity. The chronicle of our house is closed — but history records every reign.</p>
          <p className="mt-2 text-sm text-[#5c4524]">Battles won {c.stats.battlesWon} · lost {c.stats.battlesLost} · provinces gained {c.stats.provincesGained} · lost {c.stats.provincesLost}</p>
          <div className="mt-4 flex gap-2">
            <button className="btn btn-ghost !border-[#8a6a32] !text-[#3b2a14]" onClick={() => openPanel('chronicles')}>Read the chronicle</button>
            <button className="btn btn-gold" onClick={quitToMenu}>Return to the menu</button>
          </div>
        </div>
      </div>
    </div>
  );
}
