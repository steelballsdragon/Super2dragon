import { Crosshair, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SHIPS, UNITS } from '../data/buildings';
import { previewAction } from '../game/actions';
import { armyQuality, canRecruitIn, maxManpower } from '../game/military';
import { armiesOf, armyRegiments, countryName, fleetsOf, provinceName, provincesOf, sideOf, warsOf } from '../game/state';
import { SEA_DEFS, coastalSeas, provincePoint } from '../game/static';
import type { ShipType, UnitType } from '../game/types';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { men, money, monthsText } from '../ui/format';
import { Empty, Meter, Section, Stat, Tabs } from '../ui/kit';

type Tab = 'armies' | 'recruit' | 'navy' | 'wars';

export function MilitaryPanel() {
  const { w, me, c } = useWorld();
  const [tab, setTab] = useState<Tab>('armies');
  const armies = armiesOf(w, me);
  const total = armies.reduce((s, a) => s + armyRegiments(a), 0);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Soldiers" value={men(total)} />
        <Stat label="Upkeep" value={money(c.last.army + c.last.navy)} hint="per month" />
        <Stat label="Quality" value={armyQuality(w, me).toFixed(2)} hint={c.laws.military.replace(/_/g, ' ')} />
      </div>
      <div className="mt-2"><Meter label="Manpower reserve" right={`${Math.round(c.manpower)}k / ${Math.round(maxManpower(w, me))}k`} value={c.manpower} max={Math.max(1, maxManpower(w, me))} color="#5b8db8" /></div>
      <Tabs<Tab> className="mt-3" value={tab} onChange={setTab} tabs={[{ id: 'armies', label: `Armies (${armies.length})` }, { id: 'recruit', label: 'Raise troops' }, { id: 'navy', label: 'Navy' }, { id: 'wars', label: `Wars (${warsOf(w, me).length})` }]} />
      <div className="mt-3">
        {tab === 'armies' ? <Armies /> : null}
        {tab === 'recruit' ? <Recruit /> : null}
        {tab === 'navy' ? <Navy /> : null}
        {tab === 'wars' ? <Wars /> : null}
      </div>
    </div>
  );
}

function Armies() {
  const { w, me } = useWorld();
  const s = useGame();
  const armies = armiesOf(w, me);
  if (!armies.length) return <Empty>We have no armies in the field.</Empty>;
  return (
    <ul className="space-y-1.5">
      {armies.map((a) => {
        const g = a.general ? w.characters[a.general] : undefined;
        return (
          <li key={a.id}>
            <button className={`card flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px] hover:border-gold/50 ${s.selectedArmy === a.id ? '!border-gold' : ''}`} onClick={() => { s.selectArmy(a.id); s.selectProvince(a.location); const [x, y] = provincePoint(a.location); s.focusOn(x, y, 4); }}>
              <Swords size={15} className="text-gold" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-parchment">{a.name}</span>
                <span className="block truncate text-[11px] text-muted">{provinceName(a.location)} · {a.status}{a.path.length ? ` → ${provinceName(a.path[a.path.length - 1])}` : ''}{g?.alive ? ` · ${g.name}` : ''}</span>
              </span>
              <span className="tabular text-right"><span className="block text-parchment">{men(armyRegiments(a))}</span><span className="block text-[11px] text-muted">morale {Math.round(a.morale * 100)}%</span></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Recruit() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const sites = useMemo(() => provincesOf(w, me).filter((id) => !canRecruitIn(w, me, id)).sort((a, b) => (a === c.capital ? -1 : b === c.capital ? 1 : w.provinces[b].pop - w.provinces[a].pop)), [w, me, c.capital]);
  const [pid, setPid] = useState(s.selectedProvince && sites.includes(s.selectedProvince) ? s.selectedProvince : sites[0] ?? '');
  const [unit, setUnit] = useState<UnitType>('infantry');
  const [count, setCount] = useState(2);
  if (!sites.length) return <Empty>We hold no province where troops can be raised.</Empty>;
  const pv = previewAction(w, me, { type: 'recruit', province: pid, unit, count });
  const queue = w.recruitment.filter((r) => r.country === me);
  return (
    <div className="space-y-3">
      <label className="block text-[13px] text-parchment-dim">Muster at
        <select className="input mt-1" value={pid} onChange={(e) => setPid(e.target.value)}>{sites.map((id) => <option key={id} value={id}>{provinceName(id)}</option>)}</select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(UNITS) as UnitType[]).map((u) => {
          const d = UNITS[u];
          return (
            <button key={u} className={`card px-2.5 py-2 text-left text-[12px] ${unit === u ? '!border-gold bg-gold/10' : 'hover:border-gold/40'}`} onClick={() => setUnit(u)} aria-pressed={unit === u}>
              <div className="text-[13px] text-parchment">{d.name}</div>
              <div className="text-muted">Attack {d.attack} · Defence {d.defense} · Speed {d.speed}</div>
              <div className="text-muted">Upkeep {money(d.upkeep)} · {d.months} mo</div>
            </button>
          );
        })}
      </div>
      <label className="block text-[13px] text-parchment-dim">Regiments (1,000 men each): <span className="tabular text-parchment">{count}</span>
        <input type="range" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-[#d9b46b]" />
      </label>
      <div className={`text-[12px] ${pv.valid ? 'text-parchment-dim' : 'text-war'}`}>
        {pv.valid ? `${money(pv.cost.treasury ?? 0)} · ${men(pv.cost.manpower ?? 0)} men · ready in ${monthsText(pv.cost.months ?? 1)}. ${pv.consequences.join(' ')}` : pv.errors.join(' ')}
      </div>
      <button className="btn btn-gold w-full" disabled={!pv.valid} onClick={() => s.dispatch({ type: 'recruit', province: pid, unit, count })}>{pv.summary}</button>
      {queue.length ? (
        <Section title="In training">
          <ul className="text-[13px]">{queue.map((r) => <li key={r.id} className="flex justify-between py-0.5"><span className="text-parchment">{r.count} × {r.kind === 'unit' ? UNITS[r.unit as UnitType].name : SHIPS[r.unit as ShipType].name}</span><span className="text-muted">{provinceName(r.province)} · {r.monthsLeft} mo</span></li>)}</ul>
        </Section>
      ) : null}
    </div>
  );
}

function Navy() {
  const { w, me } = useWorld();
  const s = useGame();
  const fleets = fleetsOf(w, me);
  const ports = provincesOf(w, me).filter((id) => coastalSeas(id).length && (w.provinces[id].buildings.port ?? 0) > 0 && w.provinces[id].controller === me);
  const [pid, setPid] = useState(ports[0] ?? '');
  const [ship, setShip] = useState<ShipType>('frigate');
  const [count, setCount] = useState(2);
  const pv = pid ? previewAction(w, me, { type: 'buildShips', province: pid, ship, count }) : null;
  return (
    <div className="space-y-3">
      <Section title="Fleets">
        {fleets.length ? (
          <ul className="space-y-1.5">
            {fleets.map((f) => (
              <li key={f.id}>
                <button className="card flex w-full items-center justify-between px-2.5 py-2 text-left text-[13px] hover:border-gold/50" onClick={() => s.selectFleet(f.id)}>
                  <span><span className="block text-parchment">{f.name}</span><span className="block text-[11px] text-muted">{SEA_DEFS[f.location]?.name} · {f.mission}</span></span>
                  <span className="tabular text-[12px] text-parchment-dim">{Math.round(f.ships.line)} line · {Math.round(f.ships.frigate)} frig · {Math.round(f.ships.transport)} trans</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <Empty>We have no ships at sea.</Empty>}
      </Section>
      <Section title="Lay down ships">
        {ports.length ? (
          <div className="space-y-2">
            <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>{ports.map((id) => <option key={id} value={id}>{provinceName(id)}</option>)}</select>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SHIPS) as ShipType[]).map((t) => (
                <button key={t} className={`card px-2 py-1.5 text-left text-[12px] ${ship === t ? '!border-gold bg-gold/10' : ''}`} onClick={() => setShip(t)} aria-pressed={ship === t}>
                  <div className="text-parchment">{SHIPS[t].name}</div><div className="text-muted">{money(SHIPS[t].cost)} · {SHIPS[t].months} mo</div>
                </button>
              ))}
            </div>
            <label className="block text-[13px] text-parchment-dim">Ships: <span className="tabular text-parchment">{count}</span><input type="range" min={1} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-[#d9b46b]" /></label>
            {pv ? <p className={`text-[12px] ${pv.valid ? 'text-parchment-dim' : 'text-war'}`}>{pv.valid ? `${money(pv.cost.treasury ?? 0)} · ${monthsText(pv.cost.months ?? 1)}` : pv.errors.join(' ')}</p> : null}
            <button className="btn btn-gold w-full" disabled={!pv?.valid} onClick={() => s.dispatch({ type: 'buildShips', province: pid, ship, count })}>{pv?.summary ?? 'Build'}</button>
          </div>
        ) : <Empty>Build a harbour on our coast to lay down ships.</Empty>}
      </Section>
    </div>
  );
}

function Wars() {
  const { w, me } = useWorld();
  const s = useGame();
  const wars = warsOf(w, me);
  if (!wars.length) return <Empty>We are at peace.</Empty>;
  return (
    <ul className="space-y-2">
      {wars.map((war) => {
        const side = sideOf(war, me)!;
        const score = side === 'attackers' ? war.score : -war.score;
        const enemy = side === 'attackers' ? war.defenderLeader : war.attackerLeader;
        const friends = side === 'attackers' ? war.attackers : war.defenders;
        const foes = side === 'attackers' ? war.defenders : war.attackers;
        return (
          <li key={war.id} className="card p-2.5 text-[13px]">
            <div className="flex justify-between"><span className="text-parchment">{war.name}</span><span className={`tabular ${score >= 0 ? 'text-econ' : 'text-war'}`}>{score > 0 ? '+' : ''}{Math.round(score)}</span></div>
            <div className="mt-1 text-[12px] text-parchment-dim">With us: {friends.map((x) => countryName(w, x)).join(', ')}</div>
            <div className="text-[12px] text-parchment-dim">Against: {foes.map((x) => countryName(w, x)).join(', ')}</div>
            <div className="mt-1 text-[11px] text-muted">Goal: {war.goal.type}{war.goal.type === 'conquest' ? ` of ${provinceName(war.goal.province)}` : ''} · battle score {Math.round(war.battleScore)}</div>
            <button className="btn btn-ghost mt-2 !min-h-8 !py-1" onClick={() => { s.selectCountry(enemy); s.openPanel('diplomacy'); }}><Crosshair size={13} /> Negotiate</button>
          </li>
        );
      })}
    </ul>
  );
}
