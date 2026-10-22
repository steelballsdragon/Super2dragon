import { Clock } from 'lucide-react';
import { EventArt } from '../../art/EventArt';
import { Flag } from '../../art/Flag';
import { GiltFrame, Seal } from '../../art/Ornaments';
import { eventView } from '../../game/events/engine';
import { POLITIES } from '../../game/static';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';
import { dateOf } from '../../ui/format';

export function EventCard({ instanceId, onClose, onDecided }: { instanceId: string; onClose: () => void; onDecided: () => void }) {
  const { w, me } = useWorld();
  const dispatch = useGame((s) => s.dispatch);
  const inst = w.pendingEvents.find((e) => e.id === instanceId);
  const view = inst ? eventView(w, inst) : null;
  if (!inst || !view) return null;
  const d = POLITIES[me];
  const art = view.def.art === 'palace' && /succession|heir|regent|throne/i.test(view.def.title) ? 'succession' : view.def.art;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="event-title">
      <div className="relative max-h-[94vh] w-full overflow-y-auto rounded-t-lg shadow-2xl scroll-thin animate-rise sm:max-w-2xl sm:rounded-lg">
        <div className="parchment relative rounded-t-lg sm:rounded-lg">
          <div className="relative overflow-hidden rounded-t-lg">
            <EventArt kind={art} className="block h-44 w-full sm:h-56" seed={inst.turn} />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#e8d8b5] to-transparent" />
          </div>
          <div className="relative px-5 pb-5 pt-1 sm:px-8">
            <div className="flex items-center gap-2 font-display text-[11px] uppercase tracking-[0.22em] text-[#7a5a2e]">
              <Flag spec={d.flag} width={20} />{view.def.category} · {dateOf(inst.turn)}
            </div>
            <h2 id="event-title" className="mt-1 font-display text-xl font-semibold uppercase tracking-[0.08em] text-[#3b2a14] sm:text-2xl">{view.def.title}</h2>
            <div className="my-2 h-px bg-gradient-to-r from-transparent via-[#8a6a32] to-transparent" />
            <p className="font-serif text-[17px] leading-relaxed text-[#2b2116] sm:text-[18px]">{view.text}</p>
            <div className="mt-4 space-y-2">
              {view.options.map((o) => (
                <button
                  key={o.id}
                  disabled={!o.available}
                  onClick={() => { const r = dispatch({ type: 'eventChoice', event: inst.id, option: o.id }, { quiet: true }); if (r.ok) onDecided(); }}
                  className="group block w-full rounded border border-[#8a6a32]/50 bg-[#f3e6c8]/70 px-4 py-2.5 text-left transition-colors hover:border-[#5c3d16] hover:bg-[#fff6dc] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="font-display text-[13px] uppercase tracking-[0.1em] text-[#3b2a14] group-hover:text-[#1d1409]">{o.label}</div>
                  {o.lines.length ? <div className="mt-0.5 text-[13px] text-[#5c4524]">{o.lines.join(' · ')}</div> : null}
                  {o.hint ? <div className="mt-0.5 text-[12px] italic text-[#7a5a2e]">{o.hint}</div> : null}
                  {!o.available ? <div className="mt-0.5 text-[12px] text-[#8e2a24]">Not available to us.</div> : null}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button className="flex items-center gap-1.5 text-[12px] text-[#7a5a2e] hover:text-[#3b2a14]" onClick={onClose}><Clock size={13} /> Decide later</button>
              <Seal letter={d.short} size={46} />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 [&_svg]:opacity-60"><GiltFrame inset={6} size={26} /></div>
        </div>
      </div>
    </div>
  );
}
