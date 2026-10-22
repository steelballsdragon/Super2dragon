import { AlertTriangle, ChevronRight, Crown, Flame, Handshake, Lightbulb, ScrollText, Swords, X } from 'lucide-react';
import { useMemo } from 'react';
import { EventArt } from '../../art/EventArt';
import { councilAdvice } from '../../game/advisor';
import { EVENT_BY_ID } from '../../game/events/defs';
import { countryName, sideOf, warsOf } from '../../game/state';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';
import { Badge, Section } from '../../ui/kit';
import { CouncilBox } from './CouncilBox';

export function RightPanel({ mobileOpen, onCloseMobile, onOpenEvent }: { mobileOpen: boolean; onCloseMobile: () => void; onOpenEvent: (id: string) => void }) {
  const { rightOpen, setRightOpen } = useGame();
  if (!rightOpen && !mobileOpen) {
    return (
      <button className="hidden w-7 shrink-0 items-center justify-center border-l border-gold/15 bg-navy text-gold-dim hover:text-gold lg:flex" onClick={() => setRightOpen(true)} aria-label="Open council panel">
        <ChevronRight size={16} className="rotate-180" />
      </button>
    );
  }
  return (
    <>
      {mobileOpen ? <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onCloseMobile} /> : null}
      <aside className={`${mobileOpen ? 'fixed inset-y-0 right-0 z-50 flex w-[min(400px,94vw)]' : 'hidden'} flex-col border-l border-gold/20 bg-navy lg:static lg:z-auto lg:flex lg:w-[340px] xl:w-[370px]`} aria-label="Council">
        <div className="flex items-center justify-between border-b border-gold/15 px-3 py-2">
          <span className="flex items-center gap-2 font-display text-[12px] uppercase tracking-[0.16em] text-gold"><Crown size={14} /> The Royal Council</span>
          <button className="btn btn-quiet !min-h-0 !p-1" onClick={() => { onCloseMobile(); setRightOpen(false); }} aria-label="Close council panel"><X size={15} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 scroll-thin">
          <CouncilContent onOpenEvent={(id) => { onOpenEvent(id); onCloseMobile(); }} />
        </div>
      </aside>
    </>
  );
}

function CouncilContent({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const { w, rev, me } = useWorld();
  const s = useGame();
  const advice = useMemo(() => councilAdvice(w, me), [w, rev, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const offers = w.offers.filter((o) => o.to === me);
  const wars = warsOf(w, me);
  return (
    <>
      <Section title="Orders to the council"><CouncilBox /></Section>

      {w.pendingEvents.length ? (
        <Section title={<span className="flex items-center gap-1.5"><Flame size={12} /> Events</span>}>
          <div className="space-y-2">
            {w.pendingEvents.map((e) => {
              const def = EVENT_BY_ID[e.defId];
              return (
                <button key={e.id} className="card flex w-full items-center gap-2 overflow-hidden p-0 text-left hover:border-gold/50" onClick={() => onOpenEvent(e.id)}>
                  <div className="h-12 w-20 shrink-0 overflow-hidden"><EventArt kind={def?.art ?? 'palace'} className="h-full w-full" /></div>
                  <div className="min-w-0 py-1 pr-2"><div className="truncate font-display text-[12px] uppercase tracking-wider text-gold-bright">{def?.title}</div><div className="text-[11px] text-muted">{def?.category} · awaiting your decision</div></div>
                </button>
              );
            })}
          </div>
        </Section>
      ) : null}

      {offers.length ? (
        <Section title={<span className="flex items-center gap-1.5"><Handshake size={12} /> Proposals</span>}>
          <div className="space-y-2">
            {offers.map((o) => (
              <div key={o.id} className="card p-2.5 text-[13px]">
                <div className="mb-1 flex items-center justify-between"><Badge tone={o.kind === 'call_to_arms' || o.kind === 'tribute_demand' ? 'war' : 'diplo'}>{o.kind.replace(/_/g, ' ')}</Badge><span className="text-[11px] text-muted">from {countryName(w, o.from)}</span></div>
                <p className="text-parchment">{o.text}</p>
                <div className="mt-2 flex gap-1.5">
                  <button className="btn btn-gold !min-h-8 !py-1" onClick={() => s.dispatch({ type: 'answerOffer', offer: o.id, accept: true })}>Accept</button>
                  <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => s.dispatch({ type: 'answerOffer', offer: o.id, accept: false })}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {wars.length ? (
        <Section title={<span className="flex items-center gap-1.5"><Swords size={12} /> Wars</span>}>
          <div className="space-y-2">
            {wars.map((war) => {
              const side = sideOf(war, me)!;
              const score = side === 'attackers' ? war.score : -war.score;
              const enemy = side === 'attackers' ? war.defenderLeader : war.attackerLeader;
              return (
                <button key={war.id} className="card block w-full p-2.5 text-left hover:border-gold/50" onClick={() => { s.selectCountry(enemy); s.openPanel('diplomacy'); }}>
                  <div className="flex justify-between text-[13px]"><span className="text-parchment">{war.name}</span><span className={`tabular ${score >= 0 ? 'text-econ' : 'text-war'}`}>{score > 0 ? '+' : ''}{Math.round(score)}</span></div>
                  <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-parchment/40" />
                    <div className={`absolute inset-y-0 ${score >= 0 ? 'left-1/2 bg-econ' : 'right-1/2 bg-war'}`} style={{ width: `${Math.min(50, Math.abs(score) / 2)}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted">Against {countryName(w, enemy)} · since {1800 + Math.floor(war.start / 12)}</div>
                </button>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section title={<span className="flex items-center gap-1.5"><Lightbulb size={12} /> Counsel</span>}>
        {advice.length ? (
          <ul className="space-y-1.5">
            {advice.map((a, i) => (
              <li key={i} className="card p-2 text-[13px]">
                <div className="flex items-start gap-2">
                  {a.severity === 'danger' || a.severity === 'warning' ? <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${a.severity === 'danger' ? 'text-war' : 'text-gold'}`} /> : <ScrollText size={14} className="mt-0.5 shrink-0 text-diplo" />}
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted">{a.title} · {a.speaker}</div>
                    <p className="text-parchment">{a.text}</p>
                    {a.command ? <CommandChip text={a.command} /> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] italic text-parchment-dim">The council has nothing pressing to report.</p>}
      </Section>
    </>
  );
}

function CommandChip({ text }: { text: string }) {
  const send = useGame((st) => st.sendToCouncil);
  return <button className="mt-1 text-[12px] text-gold hover:text-gold-bright" onClick={() => send(text)}>→ “{text}”</button>;
}
