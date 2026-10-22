import { Bell, ChevronsRight, Coins, Crown, Gauge, Menu, Pause, Play, Scale, Shield, SkipForward, Users } from 'lucide-react';
import { useState } from 'react';
import { Flag } from '../../art/Flag';
import { countryPopulation, formatDate, totalRegiments } from '../../game/state';
import { POLITIES } from '../../game/static';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';
import { money, people } from '../../ui/format';
import { GameMenu } from './GameMenu';
import { Notifications } from './Notifications';

export function TopBar({ onOpenRight }: { onOpenRight: () => void }) {
  const { w, c, me } = useWorld();
  const { speed, setSpeed, busy, advance, openPanel } = useGame();
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const d = POLITIES[me];
  const unread = w.notifications.filter((n) => !n.read).length;
  const bal = c.last.balance;
  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-1.5 border-b border-gold/25 bg-gradient-to-b from-navy-2 to-navy px-2 shadow-[0_4px_20px_rgba(0,0,0,0.4)] sm:h-14 sm:gap-3 sm:px-3">
      <button className="flex min-w-0 items-center gap-2" onClick={() => openPanel('overview')} title={d.name}>
        <Flag spec={d.flag} width={34} />
        <span className="hidden min-w-0 text-left md:block">
          <span className="block truncate font-display text-[13px] leading-tight text-gold-bright">{d.short}</span>
          <span className="block font-serif text-[13px] italic leading-tight text-parchment-dim">{formatDate(w.turn)}</span>
        </span>
      </button>
      <span className="font-serif text-sm italic text-parchment md:hidden">{formatDate(w.turn).replace(/^(\w{3})\w*/, '$1')}</span>

      <div className="flex items-center rounded border border-gold/25 bg-ink/50" role="group" aria-label="Game speed">
        <SpeedBtn active={speed === 0} onClick={() => setSpeed(0)} label="Pause (Space)"><Pause size={15} /></SpeedBtn>
        <SpeedBtn active={speed === 1} onClick={() => setSpeed(1)} label="Normal speed (1)"><Play size={15} /></SpeedBtn>
        <SpeedBtn active={speed === 2} onClick={() => setSpeed(2)} label="Fast (2)"><ChevronsRight size={16} /></SpeedBtn>
        <SpeedBtn active={speed === 3} onClick={() => setSpeed(3)} label="Fastest (3)" className="hidden sm:flex"><Gauge size={15} /></SpeedBtn>
        <SpeedBtn active={false} disabled={busy || !!w.flags.gameOver} onClick={() => void advance()} label="Advance one month (N)"><SkipForward size={15} /></SpeedBtn>
      </div>
      {busy ? <span className="hidden h-2 w-2 animate-pulse rounded-full bg-gold sm:block" title="Processing the month" /> : null}

      <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto scroll-thin sm:gap-2">
        <Res icon={<Coins size={14} />} label="Treasury" value={money(c.treasury)} sub={money(bal, { sign: true })} subTone={bal >= 0 ? 'good' : 'bad'} onClick={() => openPanel('economy')} />
        <Res icon={<Users size={14} />} label="Population" value={people(countryPopulation(w, me))} className="hidden lg:flex" onClick={() => openPanel('overview')} />
        <Res icon={<Scale size={14} />} label="Stability" value={Math.round(c.stability)} tone={c.stability < 30 ? 'bad' : undefined} onClick={() => openPanel('court')} />
        <Res icon={<Crown size={14} />} label="Prestige" value={Math.round(c.prestige)} className="hidden sm:flex" onClick={() => openPanel('court')} />
        <Res icon={<Shield size={14} />} label="Army" value={`${Math.round(totalRegiments(w, me))}`} sub={`${Math.round(c.manpower)}k men`} className="hidden xl:flex" onClick={() => openPanel('military')} />
      </div>

      <div className="relative">
        <button className="btn btn-quiet relative !min-h-9 !px-2" onClick={() => { setBell((v) => !v); setMenu(false); }} aria-label={`Notifications (${unread} unread)`}>
          <Bell size={18} />
          {unread ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-war px-1 text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span> : null}
        </button>
        {bell ? <Notifications onClose={() => setBell(false)} /> : null}
      </div>
      <button className="btn btn-quiet !min-h-9 !px-2 lg:hidden" onClick={onOpenRight} aria-label="Council and events"><Crown size={18} /></button>
      <div className="relative">
        <button className="btn btn-quiet !min-h-9 !px-2" onClick={() => { setMenu((v) => !v); setBell(false); }} aria-label="Game menu"><Menu size={18} /></button>
        {menu ? <GameMenu onClose={() => setMenu(false)} /> : null}
      </div>
    </header>
  );
}

function SpeedBtn({ active, onClick, children, label, disabled, className = '' }: { active: boolean; onClick: () => void; children: React.ReactNode; label: string; disabled?: boolean; className?: string }) {
  return (
    <button
      className={`flex h-8 w-8 items-center justify-center transition-colors disabled:opacity-40 sm:h-9 sm:w-9 ${active ? 'bg-gold/20 text-gold-bright' : 'text-parchment-dim hover:text-parchment'} ${className}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Res({ icon, label, value, sub, tone, subTone, className = '', onClick }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'bad'; subTone?: 'good' | 'bad'; className?: string; onClick?: () => void }) {
  return (
    <button className={`flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/5 sm:px-2 ${className}`} onClick={onClick} title={label}>
      <span className="text-gold-dim">{icon}</span>
      <span className="text-left leading-tight">
        <span className={`tabular block text-[13px] font-semibold ${tone === 'bad' ? 'text-war' : 'text-parchment'}`}>{value}</span>
        {sub ? <span className={`tabular block text-[10px] ${subTone === 'good' ? 'text-econ' : subTone === 'bad' ? 'text-war' : 'text-muted'}`}>{sub}</span> : <span className="hidden text-[10px] text-muted sm:block">{label}</span>}
      </span>
    </button>
  );
}
