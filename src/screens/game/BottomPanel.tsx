import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { BUILDING_BY_ID, SHIPS, UNITS } from '../../data/buildings';
import { GOODS } from '../../game/constants';
import { armyRegiments, countryName, provinceName } from '../../game/state';
import { SEA_DEFS, provincePoint } from '../../game/static';
import type { ShipType, TradeGoodId, UnitType } from '../../game/types';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';
import { shortDate } from '../../ui/format';
import { Empty, Tabs } from '../../ui/kit';

type Tab = 'movements' | 'construction' | 'trade' | 'battles' | 'events';

export function BottomPanel() {
  const { w, me } = useWorld();
  const s = useGame();
  const [tab, setTab] = useState<Tab>('movements');
  const latest = w.chronicle[0];
  return (
    <div className="hidden shrink-0 border-t border-gold/20 bg-navy md:block">
      <div className="flex items-center gap-3 px-3">
        <button className="flex items-center gap-1 py-1.5 font-display text-[10px] uppercase tracking-[0.16em] text-gold-dim hover:text-gold" onClick={() => s.setBottomOpen(!s.bottomOpen)} aria-expanded={s.bottomOpen}>
          {s.bottomOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />} Reports
        </button>
        {!s.bottomOpen && latest ? <div className="min-w-0 flex-1 truncate font-serif text-[14px] italic text-parchment-dim"><span className="not-italic text-gold-dim">{shortDate(latest.turn)}</span> — {latest.text}</div> : null}
      </div>
      {s.bottomOpen ? (
        <div className="h-44 border-t border-gold/10">
          <Tabs<Tab> value={tab} onChange={setTab} className="px-2" tabs={[
            { id: 'movements', label: 'Army movements' }, { id: 'construction', label: 'Construction' }, { id: 'trade', label: 'Trade' }, { id: 'battles', label: 'Battles' }, { id: 'events', label: 'Events' },
          ]} />
          <div className="h-[calc(100%-38px)] overflow-y-auto px-3 py-1.5 text-[13px] scroll-thin">
            {tab === 'movements' ? <Movements /> : null}
            {tab === 'construction' ? (
              <ul className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
                {w.construction.filter((k) => k.country === me).map((k) => (
                  <li key={k.id} className="flex items-center gap-2 py-0.5"><span className="w-40 truncate text-parchment">{BUILDING_BY_ID[k.building].name}</span><span className="w-36 truncate text-muted">{provinceName(k.province)}</span><span className="h-1.5 flex-1 overflow-hidden rounded bg-ink"><span className="block h-full bg-gold" style={{ width: `${(k.progress / k.total) * 100}%` }} /></span><span className="tabular w-10 text-right text-parchment-dim">{Math.round((k.progress / k.total) * 100)}%</span></li>
                ))}
                {w.recruitment.filter((r) => r.country === me).map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-0.5"><span className="w-40 truncate text-parchment">{r.count} × {r.kind === 'unit' ? UNITS[r.unit as UnitType].name : SHIPS[r.unit as ShipType].name}</span><span className="w-36 truncate text-muted">{provinceName(r.province)}</span><span className="text-parchment-dim">{r.monthsLeft} mo</span></li>
                ))}
                {!w.construction.some((k) => k.country === me) && !w.recruitment.some((r) => r.country === me) ? <Empty>No works or levies under way.</Empty> : null}
              </ul>
            ) : null}
            {tab === 'trade' ? (
              <div className="grid grid-cols-3 gap-x-6 gap-y-0.5 lg:grid-cols-5">
                {(Object.keys(GOODS) as TradeGoodId[]).map((g) => {
                  const p = w.prices[g] ?? GOODS[g].price;
                  const ch = (p / GOODS[g].price - 1) * 100;
                  return <div key={g} className="flex justify-between"><span className="text-parchment-dim">{GOODS[g].name}</span><span className="tabular">{p.toFixed(2)} <span className={ch >= 0 ? 'text-econ' : 'text-war'}>{ch >= 0 ? '▲' : '▼'}{Math.abs(ch).toFixed(0)}%</span></span></div>;
                })}
              </div>
            ) : null}
            {tab === 'battles' ? (
              w.battles.length ? (
                <ul>{w.battles.slice(0, 30).map((b) => (
                  <li key={b.id} className="flex gap-3 py-0.5">
                    <span className="w-16 text-muted">{shortDate(b.turn)}</span>
                    <button className="flex-1 truncate text-left text-parchment hover:text-gold" onClick={() => { if (b.kind !== 'naval') { const [x, y] = provincePoint(b.location); s.focusOn(x, y, 4); } }}>
                      {b.name}: {countryName(w, b.winner === 'attacker' ? b.attacker.owner : b.defender.owner)} defeats {countryName(w, b.winner === 'attacker' ? b.defender.owner : b.attacker.owner)}
                    </button>
                    <span className="tabular text-muted">{Math.round((b.attacker.losses + b.defender.losses) * 1000).toLocaleString('en')} casualties</span>
                  </li>
                ))}</ul>
              ) : <Empty>No battles have been fought yet.</Empty>
            ) : null}
            {tab === 'events' ? (
              <ul>{w.chronicle.slice(0, 40).map((e, i) => (
                <li key={i} className="flex gap-3 py-0.5"><span className="w-16 shrink-0 text-muted">{shortDate(e.turn)}</span><span className={e.countries.includes(me) ? 'text-gold-bright' : 'text-parchment-dim'}>{e.text}</span></li>
              ))}</ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Movements() {
  const { w, me } = useWorld();
  const s = useGame();
  const moving = Object.values(w.armies).filter((a) => a.owner === me && (a.path.length || a.status === 'embarked' || a.status === 'sieging'));
  const fleets = Object.values(w.fleets).filter((f) => f.owner === me && f.path.length);
  if (!moving.length && !fleets.length) return <Empty>Our armies are in their quarters.</Empty>;
  return (
    <ul>
      {moving.map((a) => (
        <li key={a.id}><button className="flex w-full gap-3 py-0.5 text-left hover:text-gold" onClick={() => { s.selectArmy(a.id); const [x, y] = provincePoint(a.location); s.focusOn(x, y); }}>
          <span className="w-44 truncate text-parchment">{a.name}</span>
          <span className="tabular w-16 text-muted">{Math.round(armyRegiments(a) * 1000).toLocaleString('en')}</span>
          <span className="text-parchment-dim">{a.status === 'sieging' ? `besieging ${provinceName(a.location)}` : a.status === 'embarked' ? 'at sea' : `${provinceName(a.location)} → ${provinceName(a.path[a.path.length - 1])}`}</span>
        </button></li>
      ))}
      {fleets.map((f) => (
        <li key={f.id} className="flex gap-3 py-0.5"><span className="w-44 truncate text-parchment">{f.name}</span><span className="text-parchment-dim">{SEA_DEFS[f.location]?.name} → {SEA_DEFS[f.path[f.path.length - 1]]?.name}</span></li>
      ))}
    </ul>
  );
}
