import { Anchor, Ban, Combine, Crosshair, Hammer, MapPin, Merge, Ship, Split, Swords, X } from 'lucide-react';
import { Flag } from '../../art/Flag';
import { BUILDING_BY_ID, SHIPS, UNITS } from '../../data/buildings';
import { GOODS, REBELS, RELIGION_NAME, TERRAIN } from '../../game/constants';
import { provinceOutput } from '../../game/economy';
import { armyQuality, establishment, pathMonths, supplyLimit } from '../../game/military';
import { armiesAt, armiesOf, armyRegiments, countryName, friendly, provinceName } from '../../game/state';
import { POLITIES, PROVINCE_DEFS, SEA_DEFS, coastalSeas, provincePoint, seaPoint } from '../../game/static';
import { voyageText } from '../../game/voyage';
import { useGame } from '../../store/game';
import { orderGather } from './gather';
import { useWorld } from '../../store/hooks';
import { money, people } from '../../ui/format';
import { Meter } from '../../ui/kit';

export function SelectionCard() {
  const { w } = useWorld();
  const s = useGame();
  const army = s.selectedArmy ? w.armies[s.selectedArmy] : undefined;
  const fleet = s.selectedFleet ? w.fleets[s.selectedFleet] : undefined;
  const pid = s.selectedProvince;
  if (!army && !fleet && !pid) return null;
  const close = () => { s.selectArmy(null); s.selectFleet(null); s.selectProvince(null); };
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 sm:inset-x-auto sm:bottom-3 sm:left-1/2 sm:w-[440px] sm:-translate-x-1/2" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel relative max-h-[45vh] overflow-y-auto p-3 scroll-thin animate-rise">
        <button className="btn btn-quiet absolute right-1.5 top-1.5 !min-h-0 !p-1" onClick={close} aria-label="Close"><X size={16} /></button>
        {army ? <ArmyCard id={army.id} /> : fleet ? <FleetCard id={fleet.id} /> : pid ? <ProvinceCard pid={pid} /> : null}
      </div>
    </div>
  );
}

function ArmyCard({ id }: { id: string }) {
  const { w, me } = useWorld();
  const s = useGame();
  const a = w.armies[id];
  if (!a) return null;
  const mine = a.owner === me;
  const d = POLITIES[a.owner];
  const regs = armyRegiments(a);
  const general = a.general ? w.characters[a.general] : undefined;
  const others = armiesAt(w, a.location).filter((x) => x.owner === me && x.id !== a.id);
  const limit = supplyLimit(w, a.location, a.owner);
  const dest = a.path.length ? a.path[a.path.length - 1] : null;
  return (
    <div>
      <div className="flex items-center gap-2 pr-6">
        {a.owner === REBELS ? <Swords size={18} className="text-war" /> : d ? <Flag spec={d.flag} width={26} /> : null}
        <div className="min-w-0">
          <div className="truncate font-display text-sm text-gold-bright">{a.name}</div>
          <div className="text-[12px] text-parchment-dim">{a.rebel ? `${a.rebel.cause} · against ${countryName(w, a.rebel.against)}` : countryName(w, a.owner)} · {provinceName(a.location)}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[11px]">
        {(['infantry', 'cavalry', 'artillery', 'irregulars'] as const).map((u) => (
          <div key={u} className="card px-1 py-1"><div className="text-muted">{UNITS[u].name}</div><div className="tabular text-sm text-parchment">{a.units[u] >= 10 ? Math.round(a.units[u]) : a.units[u].toFixed(1)}</div></div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
        <Meter label="Morale" right={`${Math.round(a.morale * 100)}%`} value={a.morale * 100} color="#4f9f78" height={5} />
        <Meter label="Experience" right={`${Math.round(a.experience * 100)}%`} value={a.experience * 100} color="#5b8db8" height={5} />
        <div className="text-parchment-dim">Men <span className="tabular float-right text-parchment">{Math.round(regs * 1000).toLocaleString('en')}</span></div>
        <div className="text-parchment-dim">Supply limit <span className={`tabular float-right ${regs > limit ? 'text-war' : 'text-parchment'}`}>{Math.round(limit)}</span></div>
        <div className="text-parchment-dim">General <span className="float-right text-parchment">{general?.alive ? `${general.name} (${general.mil})` : '—'}</span></div>
        <div className="text-parchment-dim">Quality <span className="tabular float-right text-parchment">{armyQuality(w, a.owner).toFixed(2)}</span></div>
      </div>
      {(() => {
        if (!mine) return null;
        const full = establishment(a);
        const fullRegs = full.infantry + full.cavalry + full.artillery + full.irregulars;
        if (fullRegs <= 0 || regs >= fullRegs * 0.995) return null;
        const p = w.provinces[a.location];
        const holder = p?.controller ?? p?.owner;
        const home = !!holder && friendly(w, me, holder);
        const c = w.countries[me];
        const why = !home ? 'refills once back on friendly ground' : c.manpower < 1 ? 'the manpower reserve is empty' : c.treasury <= 0 ? 'the treasury cannot pay for recruits' : 'refilling from the manpower reserve';
        return <div className="mt-2 text-[12px] text-parchment-dim">At {Math.round((regs / fullRegs) * 100)}% of full strength ({Math.round(fullRegs * 1000).toLocaleString('en')} men) · {why}</div>;
      })()}
      {voyageText(w, a) ? <div className="mt-2 text-[12px] text-diplo"><Ship size={12} className="inline" /> {voyageText(w, a)}</div> : null}
      {dest && !a.voyage ? <div className="mt-2 text-[12px] text-gold"><MapPin size={12} className="inline" /> Marching to {provinceName(dest)} · ~{Math.max(0.5, Math.round(pathMonths(w, a, a.path) * 10) / 10)} months</div> : null}
      <div className="mt-1 text-[11px] text-muted">Status: {a.status}{a.status === 'sieging' && w.provinces[a.location]?.siege ? ` · siege ${Math.round(w.provinces[a.location].siege!.progress)}%` : ''}</div>
      {mine ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button className="btn btn-gold !min-h-8 !py-1" onClick={() => s.setPick({ kind: 'moveArmy', army: a.id })}><Crosshair size={14} /> Move</button>
          <button className="btn btn-ghost !min-h-8 !py-1" disabled={a.status === 'embarked'} onClick={() => s.setPick({ kind: 'voyage', army: a.id })}><Ship size={14} /> Sail</button>
          {a.path.length ? <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => s.dispatch({ type: 'stopArmy', army: a.id })}><Ban size={14} /> Halt</button> : null}
          <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => s.dispatch({ type: 'splitArmy', army: a.id })} disabled={regs < 2}><Split size={14} /> Split</button>
          {others.length ? <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => s.dispatch({ type: 'mergeArmies', armies: [a.id, ...others.map((o) => o.id)] })}><Merge size={14} /> Merge ({others.length + 1})</button> : null}
          {!general?.alive ? <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => s.dispatch({ type: 'court', kind: 'newGeneral', army: a.id })}><Combine size={14} /> Appoint general</button> : null}
          <button className="btn btn-quiet !min-h-8 !py-1 text-war" onClick={() => { void s.askConfirm({ title: `Disband ${a.name}?`, body: 'Half of its men return to the manpower pool.', confirmLabel: 'Disband', tone: 'war' }).then((ok) => { if (ok) { s.dispatch({ type: 'disband', army: a.id }); s.selectArmy(null); } }); }}>Disband</button>
        </div>
      ) : null}
      {mine ? <p className="mt-1.5 text-[11px] text-muted">Tip: right-click a province to march there. Armies take ship by themselves when the sea is the way, or use Sail to go by sea.</p> : null}
    </div>
  );
}

function FleetCard({ id }: { id: string }) {
  const { w, me } = useWorld();
  const s = useGame();
  const f = w.fleets[id];
  if (!f) return null;
  const d = POLITIES[f.owner];
  const mine = f.owner === me;
  return (
    <div>
      <div className="flex items-center gap-2 pr-6">
        {d ? <Flag spec={d.flag} width={26} /> : null}
        <div>
          <div className="font-display text-sm text-gold-bright">{f.name}</div>
          <div className="text-[12px] text-parchment-dim">{countryName(w, f.owner)} · {SEA_DEFS[f.location]?.name ?? f.location}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
        {(['line', 'frigate', 'transport'] as const).map((t) => (
          <div key={t} className="card px-1 py-1"><div className="text-muted">{SHIPS[t].name}</div><div className="tabular text-sm text-parchment">{Math.round(f.ships[t])}</div></div>
        ))}
      </div>
      <div className="mt-2 text-[12px] text-parchment-dim">Morale {Math.round(f.morale * 100)}% · {f.carrying.length ? `carrying ${f.carrying.length} army` : f.mission}{f.path.length ? ` · sailing to ${SEA_DEFS[f.path[f.path.length - 1]]?.name}` : ''}</div>
      {f.chartered ? <div className="mt-2 text-[12px] text-muted">Merchant ships hired for this voyage. They take no orders and are dismissed once the troops are ashore.</div> : null}
      {mine && !f.chartered ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button className="btn btn-gold !min-h-8 !py-1" onClick={() => s.setPick({ kind: 'moveFleet', fleet: f.id })}><Ship size={14} /> Sail to a coast</button>
          <select className="input !w-auto !py-1 text-xs" value="" onChange={(e) => e.target.value && s.dispatch({ type: 'moveFleet', fleet: f.id, target: e.target.value })} aria-label="Sail to sea zone">
            <option value="">Sail to…</option>
            {Object.values(SEA_DEFS).map((z) => ({ z, d: Math.hypot(seaPoint(z.id)[0] - seaPoint(f.location)[0], seaPoint(z.id)[1] - seaPoint(f.location)[1]) })).sort((a, b) => a.d - b.d).slice(1, 25).map(({ z }) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function ProvinceCard({ pid }: { pid: string }) {
  const { w, me } = useWorld();
  const s = useGame();
  const p = w.provinces[pid];
  const d = PROVINCE_DEFS[pid];
  if (!p || !d) return null;
  const owner = p.owner ? POLITIES[p.owner] : undefined;
  const mine = p.owner === me;
  const here = armiesAt(w, pid);
  const buildings = Object.entries(p.buildings).filter(([, v]) => v) as [string, number][];
  const projects = w.construction.filter((k) => k.province === pid);
  return (
    <div>
      <div className="flex items-center gap-2 pr-6">
        {owner ? <Flag spec={owner.flag} width={26} /> : null}
        <div className="min-w-0">
          <div className="truncate font-display text-sm text-gold-bright">{d.name}</div>
          <div className="text-[12px] text-parchment-dim">{owner ? owner.name : 'Unclaimed'} · {TERRAIN[d.terrain].name} · {GOODS[d.good].name}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[11px]">
        <div className="card py-1"><div className="text-muted">People</div><div className="tabular text-sm">{people(p.pop)}</div></div>
        <div className="card py-1"><div className="text-muted">Output</div><div className="tabular text-sm">{money(provinceOutput(w, pid))}</div></div>
        <div className="card py-1"><div className="text-muted">Unrest</div><div className={`tabular text-sm ${p.unrest > 40 ? 'text-war' : ''}`}>{Math.round(p.unrest)}</div></div>
        <div className="card py-1"><div className="text-muted">Fort</div><div className="tabular text-sm">{p.fort}</div></div>
      </div>
      <div className="mt-2 text-[12px] text-parchment-dim">{p.culture} · {RELIGION_NAME[p.religion]}{p.devastation > 5 ? ` · devastation ${Math.round(p.devastation)}%` : ''}{p.controller && p.controller !== p.owner ? ` · occupied by ${p.controller === REBELS ? 'rebels' : countryName(w, p.controller)}` : ''}</div>
      {buildings.length ? <div className="mt-1.5 flex flex-wrap gap-1">{buildings.map(([b, l]) => <span key={b} className="chip text-parchment-dim">{BUILDING_BY_ID[b as keyof typeof BUILDING_BY_ID]?.name}{l > 1 ? ` ×${l}` : ''}</span>)}</div> : null}
      {projects.length ? <div className="mt-1.5 text-[12px] text-gold"><Hammer size={12} className="inline" /> {projects.map((k) => `${BUILDING_BY_ID[k.building].name} ${Math.round((k.progress / k.total) * 100)}%`).join(', ')}</div> : null}
      {here.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {here.map((a) => <button key={a.id} className="chip hover:border-gold" onClick={() => s.selectArmy(a.id)}><Swords size={11} />{a.name} · {Math.round(armyRegiments(a))}</button>)}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {mine ? <button className="btn btn-gold !min-h-8 !py-1" onClick={() => s.openPanel('construction')}><Hammer size={14} /> Build here</button> : null}
        {mine ? <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => s.openPanel('military')}><Swords size={14} /> Raise troops</button> : null}
        {mine && coastalSeas(pid).length && (p.buildings.port ?? 0) ? <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => s.openPanel('military')}><Anchor size={14} /> Build ships</button> : null}
        {p.owner && p.owner !== me ? <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => { s.selectCountry(p.owner); s.openPanel('diplomacy'); }}>Diplomacy with {owner?.short}</button> : null}
        {armiesOf(w, me).length ? <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => orderGather(pid)}><Combine size={14} /> Gather armies here</button> : null}
        <button className="btn btn-quiet !min-h-8 !py-1" onClick={() => { const [x, y] = provincePoint(pid); s.focusOn(x, y, 6); }}>Zoom</button>
      </div>
    </div>
  );
}
