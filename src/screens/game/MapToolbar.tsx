import { Anchor, Coins, Globe, Handshake, Info, Mountain, Shield, Users } from 'lucide-react';
import { useState } from 'react';
import { countryName } from '../../game/state';
import { legendFor } from '../../map/layers';
import type { MapLayer } from '../../store/game';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';

const LAYERS: { id: MapLayer; label: string; icon: typeof Globe }[] = [
  { id: 'political', label: 'Political', icon: Globe },
  { id: 'terrain', label: 'Terrain', icon: Mountain },
  { id: 'economy', label: 'Economy', icon: Coins },
  { id: 'trade', label: 'Trade routes', icon: Anchor },
  { id: 'diplomacy', label: 'Diplomacy', icon: Handshake },
  { id: 'military', label: 'Military', icon: Shield },
  { id: 'population', label: 'Population', icon: Users },
];

export function MapToolbar() {
  const { w, me } = useWorld();
  const { layer, setLayer, selectedCountry } = useGame();
  const [legend, setLegend] = useState(true);
  const viewer = layer === 'diplomacy' && selectedCountry ? selectedCountry : me;
  const lg = legendFor(layer, countryName(w, viewer));
  return (
    <>
      <div className="absolute left-2 right-2 top-2 z-10 flex gap-1 overflow-x-auto scroll-thin sm:right-auto" onPointerDown={(e) => e.stopPropagation()} role="radiogroup" aria-label="Map layer">
        {LAYERS.map((l) => (
          <button
            key={l.id}
            role="radio"
            aria-checked={layer === l.id}
            onClick={() => setLayer(l.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs backdrop-blur transition-colors ${layer === l.id ? 'border-gold bg-ink/85 text-gold-bright' : 'border-gold/20 bg-ink/60 text-parchment-dim hover:text-parchment'}`}
          >
            <l.icon size={13} />{l.label}
          </button>
        ))}
        <button className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs backdrop-blur ${legend ? 'border-gold/50 bg-ink/80 text-gold' : 'border-gold/20 bg-ink/60 text-parchment-dim'}`} onClick={() => setLegend((v) => !v)} aria-pressed={legend} aria-label="Legend"><Info size={13} /></button>
      </div>
      {legend ? (
        <div className="panel-flat absolute bottom-3 left-3 z-10 max-w-[230px] px-3 py-2 text-xs md:bottom-[108px]" onPointerDown={(e) => e.stopPropagation()}>
          <div className="label mb-1.5">{lg.title}</div>
          {lg.kind === 'ramp' && lg.ramp ? (
            <div>
              <div className="flex h-2.5 overflow-hidden rounded-sm">{lg.ramp.map((c) => <div key={c} className="flex-1" style={{ background: c }} />)}</div>
              <div className="mt-1 flex justify-between text-[10px] text-parchment-dim"><span>{lg.low}</span><span>{lg.high}</span></div>
            </div>
          ) : (
            <ul className="space-y-1">
              {lg.items?.map((it) => (
                <li key={it.label} className="flex items-center gap-2 text-parchment-dim">
                  <span className="relative inline-block h-3 w-4 shrink-0 overflow-hidden rounded-sm border border-black/40" style={{ background: it.color }}>
                    {it.hatch ? <span className="absolute inset-0" style={{ backgroundImage: `repeating-linear-gradient(45deg, ${it.hatch} 0 2px, transparent 2px 5px)` }} /> : null}
                  </span>
                  {it.label}
                </li>
              ))}
            </ul>
          )}
          {lg.note ? <div className="mt-1.5 text-[10px] leading-snug text-muted">{lg.note}</div> : null}
        </div>
      ) : null}
    </>
  );
}
