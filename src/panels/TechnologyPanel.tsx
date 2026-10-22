import { Check, Lock } from 'lucide-react';
import { useState } from 'react';
import { TECHNOLOGIES, TECH_BY_ID } from '../data/technologies';
import { previewAction } from '../game/actions';
import { researchPoints, techBlocker, techCost } from '../game/tech';
import type { TechCategory } from '../game/types';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { monthsText, titleCase } from '../ui/format';
import { Meter, Section } from '../ui/kit';

const CATS: TechCategory[] = ['military', 'industry', 'steam', 'metallurgy', 'commerce', 'administration', 'education', 'agriculture', 'medicine', 'shipbuilding'];

export function TechnologyPanel() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const [cat, setCat] = useState<TechCategory | 'all'>('all');
  const rp = researchPoints(w, me);
  const cur = c.research.tech ? TECH_BY_ID[c.research.tech] : undefined;
  const curCost = cur ? techCost(w, me, cur.id) : 0;
  const shown = TECHNOLOGIES.filter((t) => cat === 'all' || t.category === cat).sort((a, b) => a.year - b.year);
  return (
    <div>
      <Section title="Current research">
        {cur ? (
          <div className="card p-2.5">
            <div className="flex justify-between text-[13px]"><span className="text-parchment">{cur.name}</span><span className="text-muted">{titleCase(cur.category)}</span></div>
            <p className="text-[12px] text-parchment-dim">{cur.description}</p>
            <div className="mt-2"><Meter label={`${rp.toFixed(1)} points a month`} right={`${Math.round(c.research.progress)} / ${curCost} · ~${monthsText(Math.max(0, curCost - c.research.progress) / Math.max(0.1, rp))}`} value={c.research.progress} max={curCost} color="#5b8db8" /></div>
          </div>
        ) : <p className="text-[13px] text-gold">No research is directed. Choose a study below. ({rp.toFixed(1)} points a month)</p>}
        <p className="mt-1.5 text-[11px] text-muted">Learning spreads: technologies known by neighbours, trade partners and much of the world cost less. Earlier than their historical year they cost more.</p>
      </Section>
      <div className="mb-3 flex flex-wrap gap-1">
        <button className={`chip ${cat === 'all' ? '!border-gold text-gold-bright' : 'text-parchment-dim'}`} onClick={() => setCat('all')}>All</button>
        {CATS.map((k) => <button key={k} className={`chip ${cat === k ? '!border-gold text-gold-bright' : 'text-parchment-dim'}`} onClick={() => setCat(k)}>{titleCase(k)}</button>)}
      </div>
      <div className="space-y-1.5">
        {shown.map((t) => {
          const known = c.techs.includes(t.id);
          const blocker = known ? null : techBlocker(w, me, t.id);
          const isCur = c.research.tech === t.id;
          const pv = !known && !blocker ? previewAction(w, me, { type: 'research', tech: t.id }) : null;
          return (
            <div key={t.id} className={`card flex items-start gap-2 px-2.5 py-2 text-[13px] ${known ? 'border-econ/40' : blocker ? 'opacity-55' : ''} ${isCur ? '!border-diplo' : ''}`}>
              <span className="mt-0.5">{known ? <Check size={14} className="text-econ" /> : blocker ? <Lock size={13} className="text-muted" /> : <span className="inline-block h-3 w-3 rounded-full border border-gold/60" />}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-parchment">{t.name}</span><span className="text-[11px] text-muted">{titleCase(t.category)} · c. {t.year}</span></div>
                <div className="text-[12px] text-parchment-dim">{t.description}</div>
                {!known ? <div className="text-[11px] text-muted">{blocker ?? `${techCost(w, me, t.id)} points`}{t.requires.length ? ` · needs ${t.requires.map((r) => TECH_BY_ID[r]?.name ?? r).join(', ')}` : ''}</div> : null}
              </div>
              {pv && !isCur ? <button className="btn btn-gold !min-h-8 shrink-0 !px-3 !py-1" onClick={() => s.dispatch({ type: 'research', tech: t.id })}>Study</button> : null}
              {isCur ? <span className="text-[11px] text-diplo">studying</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
