import { BookOpen, Coins, Crown, Eye, FlaskConical, Gavel, Hammer, Handshake, LayoutDashboard, LineChart, MoreHorizontal, Ship, Swords } from 'lucide-react';
import { useState } from 'react';
import type { PanelId } from '../../store/game';
import { useGame } from '../../store/game';

export const PANELS: { id: PanelId; label: string; icon: typeof Crown }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'court', label: 'Royal Court', icon: Crown },
  { id: 'economy', label: 'Economy', icon: Coins },
  { id: 'construction', label: 'Construction', icon: Hammer },
  { id: 'military', label: 'Military', icon: Swords },
  { id: 'diplomacy', label: 'Diplomacy', icon: Handshake },
  { id: 'technology', label: 'Technology', icon: FlaskConical },
  { id: 'espionage', label: 'Espionage', icon: Eye },
  { id: 'trade', label: 'Trade', icon: Ship },
  { id: 'laws', label: 'Laws & Reforms', icon: Gavel },
  { id: 'chronicles', label: 'Chronicles', icon: BookOpen },
  { id: 'reports', label: 'Reports', icon: LineChart },
];

export function NavRail() {
  const { panel, openPanel } = useGame();
  return (
    <nav className="hidden w-[60px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-gold/15 bg-navy py-2 scroll-thin sm:flex" aria-label="Government">
      {PANELS.map((p) => (
        <button
          key={p.id}
          onClick={() => openPanel(panel === p.id ? null : p.id)}
          className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors ${panel === p.id ? 'bg-gold/15 text-gold-bright shadow-[inset_0_0_0_1px_rgba(217,180,107,0.45)]' : 'text-parchment-dim hover:bg-white/5 hover:text-parchment'}`}
          aria-label={p.label}
          aria-pressed={panel === p.id}
        >
          <p.icon size={19} />
          <span className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap rounded border border-gold/30 bg-ink px-2 py-1 font-display text-[10px] uppercase tracking-wider text-parchment shadow-lg group-hover:block">{p.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Bottom navigation for phones: the five most used panels plus a "more" sheet. */
export function MobileNav({ onOpenRight }: { onOpenRight: () => void }) {
  const { panel, openPanel } = useGame();
  const [more, setMore] = useState(false);
  const main: PanelId[] = ['overview', 'economy', 'military', 'diplomacy'];
  return (
    <>
      <nav className="flex shrink-0 justify-around border-t border-gold/20 bg-navy pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Government">
        {main.map((id) => {
          const p = PANELS.find((x) => x.id === id)!;
          return (
            <button key={id} onClick={() => openPanel(panel === id ? null : id)} className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] ${panel === id ? 'text-gold-bright' : 'text-parchment-dim'}`}>
              <p.icon size={18} />{p.label.split(' ')[0]}
            </button>
          );
        })}
        <button onClick={onOpenRight} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] text-parchment-dim"><Crown size={18} />Council</button>
        <button onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] text-parchment-dim"><MoreHorizontal size={18} />More</button>
      </nav>
      {more ? (
        <div className="fixed inset-0 z-50 bg-black/60 sm:hidden" onClick={() => setMore(false)}>
          <div className="panel absolute inset-x-0 bottom-0 grid grid-cols-3 gap-2 rounded-b-none p-4 animate-rise" onClick={(e) => e.stopPropagation()}>
            {PANELS.map((p) => (
              <button key={p.id} className="card flex flex-col items-center gap-1 py-3 text-xs text-parchment" onClick={() => { openPanel(p.id); setMore(false); }}>
                <p.icon size={20} className="text-gold" />{p.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
