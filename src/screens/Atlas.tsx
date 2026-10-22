import { ArrowLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Flag } from '../art/Flag';
import { Portrait } from '../art/Portrait';
import { CompassRose } from '../art/Ornaments';
import { RELIGION_NAME } from '../game/constants';
import { countryPopulation, provincesOf, totalRegiments } from '../game/state';
import { POLITIES, POLITY_LIST, provincePoint } from '../game/static';
import { WorldMap } from '../map/WorldMap';
import type { MapLayer } from '../store/game';
import { useGame } from '../store/game';
import { money, people } from '../ui/format';
import { Badge } from '../ui/kit';
import { ProvinceTooltip } from './game/ProvinceTooltip';
import { previewWorld } from './previewWorld';

const LAYERS: MapLayer[] = ['political', 'terrain', 'economy', 'population', 'trade'];

export function Atlas() {
  const setScreen = useGame((s) => s.setScreen);
  const w = useMemo(previewWorld, []);
  const [layer, setLayer] = useState<MapLayer>('political');
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState<{ x: number; y: number; k?: number; t: number } | null>(null);
  const matches = q.trim() ? POLITY_LIST.filter((p) => w.countries[p.id]?.alive && (p.name + p.short + p.adjective + p.capitalName).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const d = sel ? POLITIES[sel] : null;
  const c = sel ? w.countries[sel] : null;
  const ruler = c ? w.characters[c.rulerId] : undefined;
  const pick = (id: string) => { setSel(id); setQ(''); const cap = w.countries[id]?.capital; if (cap) { const [x, y] = provincePoint(cap); setFocus({ x, y, k: 2.4, t: Date.now() }); } };
  return (
    <div className="relative h-full bg-ink">
      <WorldMap
        world={w} rev={0} layer={layer} viewer={sel ?? 'great_britain'} selectedCountry={sel}
        markers={{ armies: false, fleets: false, ports: false, forts: false }} focus={focus} minimap
        onProvinceClick={(pid) => setSel(w.provinces[pid]?.owner ?? null)}
        renderTooltip={(pid) => <ProvinceTooltip w={w} pid={pid} layer={layer} viewer={sel ?? ''} />}
      />
      <div className="absolute left-2 right-2 top-2 z-20 flex flex-wrap items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost bg-ink/80" onClick={() => setScreen('menu')}><ArrowLeft size={15} /> Menu</button>
        <h1 className="title-gilt hidden text-lg sm:block">World Atlas · 1800</h1>
        <div className="relative w-full max-w-xs sm:ml-4">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !bg-ink/85 !pl-8" placeholder="Find a realm…" value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.length ? (
            <ul className="panel absolute inset-x-0 top-11 z-30 overflow-hidden">
              {matches.map((p) => <li key={p.id}><button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/5" onClick={() => pick(p.id)}><Flag spec={p.flag} width={20} />{p.name}</button></li>)}
            </ul>
          ) : null}
        </div>
        <div className="flex gap-1">
          {LAYERS.map((l) => <button key={l} className={`chip capitalize backdrop-blur ${layer === l ? '!border-gold bg-ink/85 text-gold-bright' : 'bg-ink/60 text-parchment-dim'}`} onClick={() => setLayer(l)}>{l}</button>)}
        </div>
      </div>
      <CompassRose size={64} className="pointer-events-none absolute right-4 top-16 z-10 opacity-70" />
      {d && c ? (
        <aside className="panel absolute bottom-3 right-3 z-20 sm:right-16 max-h-[70%] w-[min(360px,calc(100%-24px))] overflow-y-auto p-4 scroll-thin animate-rise" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex gap-3">
            {ruler ? <Portrait style={d.portrait} seed={ruler.portraitSeed} female={ruler.female} age={1800 - ruler.born} size={64} /> : null}
            <div className="min-w-0">
              <Flag spec={d.flag} width={42} />
              <h2 className="font-display text-base text-gold-bright">{d.name}</h2>
              <p className="text-[12px] text-parchment-dim">{ruler?.name} · {d.rulerTitle}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1"><Badge>{d.government}</Badge><Badge tone="muted">{RELIGION_NAME[d.religion]}</Badge><Badge tone="muted">{d.culture}</Badge>{!d.playable ? <Badge tone="muted">not playable</Badge> : null}</div>
          <p className="mt-2 font-serif text-[15px] leading-snug text-parchment">{d.intro}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px]">
            <dt className="text-muted">Capital</dt><dd className="text-right">{d.capitalName}</dd>
            <dt className="text-muted">Population</dt><dd className="tabular text-right">{people(countryPopulation(w, d.id))}</dd>
            <dt className="text-muted">Provinces</dt><dd className="tabular text-right">{provincesOf(w, d.id).length}</dd>
            <dt className="text-muted">Revenue</dt><dd className="tabular text-right">{money(c.last.income)}/mo</dd>
            <dt className="text-muted">Soldiers</dt><dd className="tabular text-right">{Math.round(totalRegiments(w, d.id) * 1000).toLocaleString('en')}</dd>
            {d.overlord ? <><dt className="text-muted">Overlord</dt><dd className="text-right">{POLITIES[d.overlord]?.short}</dd></> : null}
          </dl>
        </aside>
      ) : (
        <div className="panel-flat absolute bottom-3 right-16 z-10 hidden max-w-xs p-3 text-[13px] text-parchment-dim sm:block">
          The world on 1 January 1800. Click any land to read about the polity that holds it, or switch layers to see terrain, wealth, population and the great trade routes.
        </div>
      )}
    </div>
  );
}
