import { BookOpen, Crown, FolderOpen, Globe2, Play, ScrollText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MenuScene } from '../art/MenuScene';
import { CrownMark, Divider } from '../art/Ornaments';
import { allSaves, useGame } from '../store/game';
import { timeAgo } from '../ui/format';

export function MainMenu() {
  const { setScreen, continueGame, saves, cloudSaves, cloud, storageKept, refreshSaves } = useGame();
  const [ready, setReady] = useState(false);
  useEffect(() => { refreshSaves(); const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t); }, [refreshSaves]);
  const latest = allSaves({ saves, cloudSaves })[0];
  const items = [
    { label: 'New Campaign', icon: Crown, onClick: () => setScreen('select'), primary: true },
    { label: 'Continue Game', icon: Play, onClick: () => continueGame(), disabled: !latest, hint: latest ? `${latest.countryName} · ${latest.date} · ${timeAgo(latest.savedAt)}` : 'No campaign saved yet' },
    { label: 'Load Game', icon: FolderOpen, onClick: () => setScreen('load') },
    { label: 'World Atlas', icon: Globe2, onClick: () => setScreen('atlas') },
    { label: 'Chronicles', icon: ScrollText, onClick: () => setScreen('chronicles') },
  ];
  return (
    <div className="relative h-full w-full overflow-hidden bg-ink">
      <MenuScene className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-transparent to-ink/85" />
      <div className={`relative z-10 flex h-full flex-col items-center justify-between px-4 py-[6vh] transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
        <header className="text-center">
          <CrownMark size={42} className="mx-auto mb-3 drop-shadow-[0_0_14px_rgba(217,180,107,0.45)]" />
          <h1 className="title-gilt text-[clamp(2rem,6.5vw,4.6rem)] font-bold leading-none">THRONES OF THE WORLD</h1>
          <div className="mx-auto mt-3 w-[min(560px,80vw)]"><Divider /></div>
          <p className="mt-2 font-display text-[clamp(0.8rem,1.8vw,1.15rem)] tracking-[0.42em] text-parchment">THE AGE OF EMPIRES — 1800</p>
          <p className="mx-auto mt-3 max-w-xl font-serif text-[clamp(1rem,1.6vw,1.2rem)] italic text-parchment-dim">
            The first day of a new century. Courts from Pune to Peking, from Vienna to the Plains, await your command.
          </p>
        </header>

        <nav className="mb-[4vh] flex w-full max-w-sm flex-col gap-2.5" aria-label="Main menu">
          {items.map((it, i) => (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={it.onClick}
              className={`group btn ${it.primary ? 'btn-gold' : 'btn-ghost backdrop-blur-sm'} !justify-between !py-3 text-[0.82rem] animate-rise`}
              style={{ animationDelay: `${0.25 + i * 0.07}s` }}
            >
              <span className="flex items-center gap-3"><it.icon size={17} />{it.label}</span>
              {it.hint ? <span className={`max-w-[50%] truncate font-sans text-[10px] normal-case tracking-normal ${it.primary ? 'text-ink/70' : 'text-parchment-dim'}`}>{it.hint}</span> : <span className="opacity-0 transition-opacity group-hover:opacity-100">›</span>}
            </button>
          ))}
        </nav>

        {!storageKept && cloud !== 'on' ? (
          <p className="panel-flat -mt-[2vh] mb-3 max-w-sm px-3 py-2 text-center text-[12px] text-gold">This browser is not keeping saves for this page. Before you leave, copy a save code from the game menu (Export campaign).</p>
        ) : null}
        <footer className="flex flex-col items-center gap-1 text-center text-[11px] text-parchment-dim/80">
          <span className="flex items-center gap-1.5"><BookOpen size={12} /> 334 polities · 895 provinces · every continent · a council that heeds plain words</span>
          <span>{cloud === 'on' ? 'Original art and code. Your saves are kept in this browser and privately in your claude.ai account.' : 'Original art and code. Plays entirely in your browser; no account or AI service required.'}</span>
        </footer>
      </div>
    </div>
  );
}
