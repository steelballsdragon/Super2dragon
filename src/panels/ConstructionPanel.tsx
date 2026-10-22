import { Hammer, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BUILDINGS, BUILDING_BY_ID } from '../data/buildings';
import { previewAction } from '../game/actions';
import { buildingQuote, laborInUse, laborPool } from '../game/construction';
import { provinceName, provincesOf } from '../game/state';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { money, monthsText, people } from '../ui/format';
import { Badge, Empty, Meter, Section } from '../ui/kit';

const CATS = ['infrastructure', 'agriculture', 'industry', 'society', 'military'] as const;

export function ConstructionPanel() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const mine = useMemo(() => provincesOf(w, me).filter((id) => w.provinces[id].controller === me).sort((a, b) => w.provinces[b].pop - w.provinces[a].pop), [w, me]);
  const initial = s.selectedProvince && w.provinces[s.selectedProvince]?.owner === me ? s.selectedProvince : c.capital;
  const [pid, setPid] = useState(initial);
  useEffect(() => { if (s.selectedProvince && w.provinces[s.selectedProvince]?.owner === me) setPid(s.selectedProvince); }, [s.selectedProvince]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = w.provinces[pid];
  const queue = w.construction.filter((k) => k.country === me);
  const pool = laborPool(w, me), used = laborInUse(w, me);
  return (
    <div>
      <Section title="Workforce">
        <Meter label="Labourers employed on public works" right={`${used.toFixed(1)}k of ${pool.toFixed(1)}k`} value={used} max={Math.max(pool, used)} color="#d9b46b" />
        <p className="mt-1 text-[11px] text-muted">Projects beyond the workforce proceed more slowly.</p>
      </Section>

      <Section title="Works under way">
        {queue.length ? (
          <ul className="space-y-1.5">
            {queue.map((k) => (
              <li key={k.id} className="card flex items-center gap-2 px-2 py-1.5 text-[13px]">
                <Hammer size={14} className="text-gold" />
                <span className="min-w-0 flex-1"><span className="text-parchment">{BUILDING_BY_ID[k.building].name}</span> <span className="text-muted">· {provinceName(k.province)}</span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded bg-ink"><span className="block h-full bg-gold" style={{ width: `${(k.progress / k.total) * 100}%` }} /></span>
                </span>
                <span className="tabular text-[12px] text-parchment-dim">{Math.round((k.progress / k.total) * 100)}%</span>
                <button className="btn btn-quiet !min-h-0 !p-1" title="Cancel (half the remaining cost is refunded)" onClick={() => s.dispatch({ type: 'cancelBuild', id: k.id })} aria-label="Cancel"><X size={13} /></button>
              </li>
            ))}
          </ul>
        ) : <Empty>No works are under way.</Empty>}
      </Section>

      <Section title="Build in">
        <select className="input" value={pid} onChange={(e) => { setPid(e.target.value); s.selectProvince(e.target.value); }} aria-label="Province">
          {mine.map((id) => <option key={id} value={id}>{provinceName(id)} — {people(w.provinces[id].pop)}</option>)}
        </select>
        {p ? <p className="mt-1 text-[12px] text-muted">Existing: {Object.entries(p.buildings).filter(([, v]) => v).map(([b, v]) => `${BUILDING_BY_ID[b as keyof typeof BUILDING_BY_ID]?.name}${(v ?? 0) > 1 ? ` ×${v}` : ''}`).join(', ') || 'none'}</p> : null}
      </Section>

      {CATS.map((cat) => (
        <Section key={cat} title={cat}>
          <div className="space-y-1.5">
            {BUILDINGS.filter((b) => b.category === cat).map((b) => {
              const pv = previewAction(w, me, { type: 'build', province: pid, building: b.id });
              const q = buildingQuote(w, me, pid, b.id);
              const lvl = p?.buildings[b.id] ?? 0;
              return (
                <div key={b.id} className={`card flex items-start gap-2 px-2.5 py-2 ${pv.valid ? '' : 'opacity-70'}`}>
                  <div className="min-w-0 flex-1 text-[13px]">
                    <div className="flex items-center gap-2"><span className="text-parchment">{b.name}</span>{lvl ? <Badge tone="muted">level {lvl}/{b.max}</Badge> : null}</div>
                    <div className="text-[12px] text-parchment-dim">{b.description}</div>
                    <div className="tabular mt-0.5 text-[11px] text-muted">{money(q.cost)} · {monthsText(q.months)} · {q.labor.toFixed(1)}k workers · upkeep {money(b.upkeep)}/mo</div>
                    {!pv.valid ? <div className="text-[11px] text-war">{pv.errors.join(' ')}</div> : null}
                  </div>
                  <button className="btn btn-gold !min-h-8 shrink-0 !px-3 !py-1" disabled={!pv.valid} onClick={() => s.dispatch({ type: 'build', province: pid, building: b.id })}>Build</button>
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}
