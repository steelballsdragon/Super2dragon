import { Check } from 'lucide-react';
import { LAWS, LAW_CATEGORY, lawOption } from '../data/laws';
import { previewAction } from '../game/actions';
import type { LawCategory } from '../game/types';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { money } from '../ui/format';
import { Meter, Section } from '../ui/kit';

export function LawsPanel() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const reform = c.lawReform;
  return (
    <div>
      {reform ? (
        <div className="card mb-4 p-2.5">
          <div className="text-[13px] text-parchment">Reform under way: {lawOption(reform.category, reform.option)?.name} <span className="text-muted">({LAW_CATEGORY[reform.category].name})</span></div>
          <div className="mt-1.5"><Meter value={reform.total - reform.monthsLeft} max={reform.total} right={`${reform.monthsLeft} months left`} color="#d9b46b" /></div>
        </div>
      ) : <p className="mb-3 text-[12px] text-muted">One reform at a time. Each costs money and stability and shifts the mood of the court factions.</p>}
      {LAWS.map((cat) => (
        <Section key={cat.id} title={cat.name}>
          <div className="space-y-1.5">
            {cat.options.map((o) => {
              const current = c.laws[cat.id as LawCategory] === o.id;
              const pv = current ? null : previewAction(w, me, { type: 'enactLaw', category: cat.id as LawCategory, option: o.id });
              const shifts = Object.entries(o.factions).map(([f, v]) => `${f} ${v! > 0 ? '+' : ''}${v}`).join(', ');
              const hide = pv && !pv.valid && pv.errors.some((e) => e.includes('Not available to this form'));
              if (hide) return null;
              return (
                <div key={o.id} className={`card flex items-start gap-2 px-2.5 py-2 text-[13px] ${current ? '!border-gold/60 bg-gold/5' : pv && !pv.valid ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-parchment">{current ? <Check size={13} className="text-gold" /> : null}{o.name}</div>
                    <div className="text-[12px] text-parchment-dim">{o.description}</div>
                    {shifts ? <div className="text-[11px] text-muted">Factions: {shifts}</div> : null}
                    {pv && pv.valid ? <div className="text-[11px] text-parchment-dim">{money(pv.cost.treasury ?? 0)} · −{pv.cost.stability} stability · {pv.cost.months} months</div> : null}
                    {pv && !pv.valid ? <div className="text-[11px] text-war">{pv.errors.join(' ')}</div> : null}
                  </div>
                  {pv ? <button className="btn btn-gold !min-h-8 shrink-0 !px-3 !py-1" disabled={!pv.valid} onClick={() => { void s.askConfirm({ title: `Begin the reform: ${o.name}?`, body: pv.valid ? `${money(pv.cost.treasury ?? 0)}, −${pv.cost.stability} stability, ${pv.cost.months} months.${shifts ? ` Factions: ${shifts}.` : ''}` : undefined, confirmLabel: 'Begin the reform' }).then((ok) => { if (ok) s.dispatch({ type: 'enactLaw', category: cat.id as LawCategory, option: o.id }); }); }}>Enact</button> : <span className="text-[11px] text-gold">in force</span>}
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}
