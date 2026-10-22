import { Flag } from '../../art/Flag';
import { GOODS, REBELS, RELIGION_NAME, TERRAIN } from '../../game/constants';
import { provinceOutput, provinceTradeValue } from '../../game/economy';
import { countryName, opinion } from '../../game/state';
import { GEO, POLITIES, PROVINCE_DEFS } from '../../game/static';
import type { WorldState } from '../../game/types';
import type { MapLayer } from '../../store/game';
import { money, people } from '../../ui/format';

export function ProvinceTooltip({ w, pid, layer, viewer }: { w: WorldState; pid: string; layer: MapLayer; viewer: string }) {
  const p = w.provinces[pid];
  const d = PROVINCE_DEFS[pid];
  if (!p || !d) return null;
  const owner = p.owner ? POLITIES[p.owner] : undefined;
  const occupied = p.controller && p.controller !== p.owner;
  const g = GEO.provinces[pid];
  const buildings = Object.entries(p.buildings).filter(([, v]) => v).length;
  return (
    <div className="panel min-w-[200px] px-3 py-2 text-[13px] shadow-2xl">
      <div className="font-display text-[13px] text-gold-bright">{d.name}</div>
      {owner ? (
        <div className="mt-1 flex items-center gap-2 text-parchment"><Flag spec={owner.flag} width={20} />{owner.short}{p.owner === viewer ? <span className="text-[10px] text-gold">(ours)</span> : null}</div>
      ) : <div className="mt-1 text-muted">Unclaimed land</div>}
      {occupied ? <div className="mt-0.5 text-[12px] text-war">Occupied by {p.controller === REBELS ? 'rebels' : countryName(w, p.controller!)}</div> : null}
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px]">
        <span className="text-muted">Population</span><span className="tabular text-right">{people(p.pop)}</span>
        <span className="text-muted">Terrain</span><span className="text-right">{TERRAIN[d.terrain].name}</span>
        <span className="text-muted">Produces</span><span className="text-right">{GOODS[d.good].name}</span>
        {layer === 'economy' ? <><span className="text-muted">Output</span><span className="tabular text-right">{money(provinceOutput(w, pid))}/mo</span></> : null}
        {layer === 'trade' ? <><span className="text-muted">Trade value</span><span className="tabular text-right">{provinceTradeValue(w, pid).toFixed(1)}</span></> : null}
        {layer === 'population' && g ? <><span className="text-muted">Density</span><span className="tabular text-right">{(p.pop / Math.max(0.5, g.area)).toFixed(1)}k/unit²</span></> : null}
        {layer === 'diplomacy' && p.owner && p.owner !== viewer ? <><span className="text-muted">Opinion</span><span className="tabular text-right">{Math.round(opinion(w, viewer, p.owner))}</span></> : null}
        <span className="text-muted">Faith</span><span className="text-right">{RELIGION_NAME[p.religion]}</span>
        {p.fort ? <><span className="text-muted">Fort</span><span className="text-right">level {p.fort}</span></> : null}
        {p.unrest > 5 ? <><span className="text-muted">Unrest</span><span className={`tabular text-right ${p.unrest > 40 ? 'text-war' : ''}`}>{Math.round(p.unrest)}</span></> : null}
        {buildings ? <><span className="text-muted">Buildings</span><span className="text-right">{buildings}</span></> : null}
      </div>
      {p.siege ? <div className="mt-1 text-[12px] text-war">Under siege · {Math.round(p.siege.progress)}%</div> : null}
    </div>
  );
}
