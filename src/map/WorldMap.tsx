// The interactive world map. Pan, zoom and pinch update an SVG transform directly (no React
// render per frame); level-of-detail for labels and markers updates when a gesture settles.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { REBELS } from '../game/constants';
import { computeTrade } from '../game/economy';
import { armyRegiments, def } from '../game/state';
import { GEO, OUTPOST_DEFS, OUTPOST_POINTS, POLITIES, PROVINCE_DEFS, SEA_DEFS, TRADE_NODE_DEFS, TRADE_NODE_POINTS, provincePoint, seaPoint } from '../game/static';
import type { Army, Fleet, WorldState } from '../game/types';
import type { MapLayer } from '../store/game';
import { countryLabels } from './labels';
import { layerColors } from './layers';

export interface MapMarkerOptions { armies: boolean; fleets: boolean; capitals: boolean; forts: boolean; ports: boolean; trade: boolean }

export interface WorldMapProps {
  world: WorldState;
  rev: number;
  layer: MapLayer;
  viewer: string;
  selectedCountry?: string | null;
  selectedProvince?: string | null;
  selectedArmy?: string | null;
  selectedFleet?: string | null;
  markers?: Partial<MapMarkerOptions>;
  picking?: boolean;
  focus?: { x: number; y: number; k?: number; t: number } | null;
  onProvinceClick?: (id: string, e: { button: number; shift: boolean }) => void;
  onArmyClick?: (id: string) => void;
  onFleetClick?: (id: string) => void;
  renderTooltip?: (provinceId: string) => ReactNode;
  minimap?: boolean;
  className?: string;
  initial?: { x: number; y: number; k: number };
}

const W = GEO.width, H = GEO.height;
const PROVINCE_IDS = Object.keys(GEO.provinces);

interface View { x: number; y: number; k: number }

export function WorldMap(props: WorldMapProps) {
  const { world, rev, layer, viewer, selectedCountry, selectedProvince, selectedArmy, selectedFleet, focus, picking } = props;
  const markers: MapMarkerOptions = { armies: true, fleets: true, capitals: true, forts: true, ports: true, trade: true, ...props.markers };
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 1, h: 1 });
  const [lod, setLod] = useState(1);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [minimapTick, setMinimapTick] = useState(0);
  const lodTimer = useRef<number>(0);
  const anim = useRef<number>(0);
  const pendingFocus = useRef<{ x: number; y: number; k?: number } | null>(null);

  const minK = () => Math.max(0.2, Math.min(size.current.w / W, size.current.h / H) * 0.98);
  const maxK = () => 48;

  const clampView = (v: View): View => {
    const { w, h } = size.current;
    const k = Math.max(minK(), Math.min(maxK(), v.k));
    const mw = W * k, mh = H * k;
    const x = mw <= w ? (w - mw) / 2 : Math.min(w * 0.25, Math.max(w * 0.75 - mw, v.x));
    const y = mh <= h ? (h - mh) / 2 : Math.min(h * 0.25, Math.max(h * 0.75 - mh, v.y));
    return { x, y, k };
  };

  const apply = useCallback(() => {
    const v = view.current;
    gRef.current?.setAttribute('transform', `translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) scale(${v.k.toFixed(5)})`);
    svgRef.current?.style.setProperty('--inv', String(1 / v.k));
    window.clearTimeout(lodTimer.current);
    lodTimer.current = window.setTimeout(() => {
      setLod(Math.round(Math.log2(view.current.k) * 4) / 4);
      setMinimapTick((t) => t + 1);
    }, 90);
  }, []);

  const setView = useCallback((v: View) => {
    view.current = clampView(v);
    apply();
  }, [apply]);

  const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
    const v = view.current;
    const k = Math.max(minK(), Math.min(maxK(), v.k * factor));
    const mx = (sx - v.x) / v.k, my = (sy - v.y) / v.k;
    setView({ k, x: sx - mx * k, y: sy - my * k });
  }, [setView]);

  const animateTo = useCallback((mx: number, my: number, k?: number) => {
    cancelAnimationFrame(anim.current);
    const from = { ...view.current };
    const tk = Math.max(minK(), Math.min(maxK(), k ?? Math.max(from.k, 2.5)));
    const to = clampView({ k: tk, x: size.current.w / 2 - mx * tk, y: size.current.h / 2 - my * tk });
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 520);
      const e = 1 - Math.pow(1 - p, 3);
      view.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
      apply();
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [apply]);

  // Size tracking.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const first = size.current.w <= 1;
      size.current = { w: el.clientWidth || 1, h: el.clientHeight || 1 };
      if (first) {
        const init = pendingFocus.current ? { ...pendingFocus.current, k: pendingFocus.current.k ?? 2.5 } : props.initial;
        pendingFocus.current = null;
        if (init) view.current = clampView({ k: init.k, x: size.current.w / 2 - init.x * init.k, y: size.current.h / 2 - init.y * init.k });
        else {
          const k = minK();
          view.current = clampView({ k, x: 0, y: 0 });
        }
      } else view.current = clampView(view.current);
      apply();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!focus) return;
    // Before the first layout there is no size to centre on: apply the focus once measured.
    if (size.current.w <= 1) pendingFocus.current = focus;
    else animateTo(focus.x, focus.y, focus.k);
  }, [focus, animateTo]);

  // Wheel zoom (non-passive so the page does not scroll).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Pointer gestures: drag to pan, pinch to zoom, tap to select.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, startX: 0, startY: 0, lastDist: 0, lastMidX: 0, lastMidY: 0, button: 0 });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    cancelAnimationFrame(anim.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) gesture.current = { moved: false, startX: p.x, startY: p.y, lastDist: 0, lastMidX: 0, lastMidY: 0, button: e.button };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.lastMidX = (a.x + b.x) / 2;
      gesture.current.lastMidY = (a.y + b.y) / 2;
      gesture.current.moved = true;
    }
    setHover(null);
  };

  const hoverFrame = useRef(0);
  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType !== 'mouse') return;
      const target = e.target as Element;
      const id = target.getAttribute?.('data-prov');
      cancelAnimationFrame(hoverFrame.current);
      hoverFrame.current = requestAnimationFrame(() => setHover(id ? { id, x: p.x, y: p.y } : null));
      return;
    }
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      if (!gesture.current.moved && Math.hypot(p.x - gesture.current.startX, p.y - gesture.current.startY) < 5) return;
      gesture.current.moved = true;
      setView({ ...view.current, x: view.current.x + p.x - prev.x, y: view.current.y + p.y - prev.y });
    } else if (pointers.current.size === 2) {
      // Pan with the midpoint, then zoom about it.
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const g = gesture.current;
      view.current = { ...view.current, x: view.current.x + cx - g.lastMidX, y: view.current.y + cy - g.lastMidY };
      zoomAt(cx, cy, dist / Math.max(1, g.lastDist));
      g.lastDist = dist; g.lastMidX = cx; g.lastMidY = cy;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (!wasSingle || gesture.current.moved) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const armyId = el?.closest?.('[data-army]')?.getAttribute('data-army');
    const fleetId = el?.closest?.('[data-fleet]')?.getAttribute('data-fleet');
    if (armyId && props.onArmyClick && !picking) { props.onArmyClick(armyId); return; }
    if (fleetId && props.onFleetClick && !picking) { props.onFleetClick(fleetId); return; }
    const prov = el?.getAttribute?.('data-prov') ?? el?.closest?.('[data-prov-at]')?.getAttribute('data-prov-at');
    if (prov && props.onProvinceClick) props.onProvinceClick(prov, { button: gesture.current.button, shift: e.shiftKey });
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const prov = el?.getAttribute?.('data-prov');
    if (prov && props.onProvinceClick) props.onProvinceClick(prov, { button: 2, shift: e.shiftKey });
  };

  // Keyboard: arrows pan, +/- zoom.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 80;
    const v = view.current;
    if (e.key === 'ArrowLeft') setView({ ...v, x: v.x + step });
    else if (e.key === 'ArrowRight') setView({ ...v, x: v.x - step });
    else if (e.key === 'ArrowUp') setView({ ...v, y: v.y + step });
    else if (e.key === 'ArrowDown') setView({ ...v, y: v.y - step });
    else if (e.key === '+' || e.key === '=') zoomAt(size.current.w / 2, size.current.h / 2, 1.35);
    else if (e.key === '-') zoomAt(size.current.w / 2, size.current.h / 2, 1 / 1.35);
    else return;
    e.preventDefault();
  };

  const colors = useMemo(() => layerColors(world, layer, viewer), [world, rev, layer, viewer]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = Math.pow(2, lod);

  return (
    <div
      ref={wrapRef}
      className={`relative h-full w-full select-none overflow-hidden outline-none ${picking ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} ${props.className ?? ''}`}
      style={{ touchAction: 'none', background: 'radial-gradient(ellipse at 50% 40%, #1b2a38 0%, #121c26 55%, #0c131a 100%)' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      onPointerLeave={() => setHover(null)}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="application"
      aria-label="World map. Drag to pan, scroll or pinch to zoom, arrow keys to move."
    >
      <svg ref={svgRef} className="map-svg absolute inset-0 h-full w-full" style={{ ['--inv' as string]: 1 }}>
        <defs>
          <Hatches colors={colors.hatch} />
          <filter id="map-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" /></filter>
        </defs>
        <g ref={gRef}>
          <path d={GEO.outline} fill="#152330" stroke="#d9b46b" strokeOpacity="0.25" className="nsk" strokeWidth="1" />
          <path d={GEO.graticule} fill="none" stroke="#d9b46b" strokeOpacity="0.07" className="nsk" strokeWidth="0.6" />
          <path d={GEO.seaBorders} fill="none" stroke="#5b8db8" strokeOpacity={k > 2 ? 0.14 : 0.06} className="nsk" strokeWidth="0.6" strokeDasharray="3 3" />
          <Provinces fills={colors.fill} />
          <HatchOverlay hatch={colors.hatch} />
          <CountryBorders world={world} rev={rev} />
          {selectedCountry ? <CountryHighlight world={world} rev={rev} country={selectedCountry} /> : null}
          {layer === 'trade' && markers.trade ? <TradeRoutes world={world} rev={rev} /> : null}
          {hover ? <path d={GEO.provinces[hover.id]?.d} fill="#fff" fillOpacity="0.08" stroke="#f3e6c8" strokeWidth="1.4" className="nsk" pointerEvents="none" /> : null}
          {selectedProvince && GEO.provinces[selectedProvince] ? <path d={GEO.provinces[selectedProvince].d} fill="#f0d48f" fillOpacity="0.12" stroke="#f0d48f" strokeWidth="2.4" className="nsk" pointerEvents="none" /> : null}
          <Labels world={world} rev={rev} k={k} layer={layer} />
          {k >= 2.6 ? <SeaLabels k={k} /> : null}
          <Markers world={world} rev={rev} k={k} markers={markers} viewer={viewer} selectedArmy={selectedArmy ?? null} selectedFleet={selectedFleet ?? null} />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3CfeColorMatrix values='0 0 0 0 0.85 0 0 0 0 0.7 0 0 0 0 0.45 0 0 0 1 0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      {hover && props.renderTooltip ? (
        <div className="pointer-events-none absolute z-20 max-w-[280px] animate-fade-in" style={{ left: Math.min(hover.x + 16, size.current.w - 290), top: Math.min(hover.y + 16, size.current.h - 160) }}>
          {props.renderTooltip(hover.id)}
        </div>
      ) : null}
      {props.minimap ? <Minimap world={world} rev={rev} fills={colors.fill} view={view} size={size} tick={minimapTick} onJump={(mx, my) => animateTo(mx, my, view.current.k)} /> : null}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost h-9 w-9 !p-0 text-lg" aria-label="Zoom in" onClick={() => zoomAt(size.current.w / 2, size.current.h / 2, 1.6)}>+</button>
        <button className="btn btn-ghost h-9 w-9 !p-0 text-lg" aria-label="Zoom out" onClick={() => zoomAt(size.current.w / 2, size.current.h / 2, 1 / 1.6)}>−</button>
        <button className="btn btn-ghost h-9 w-9 !p-0 text-[10px]" aria-label="Show whole world" onClick={() => animateTo(W / 2, H / 2, minK())}>⤢</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

const ProvincePath = memo(function ProvincePath({ id, fill }: { id: string; fill: string }) {
  return <path className="prov" data-prov={id} d={GEO.provinces[id].d} fill={fill} stroke="#0d1218" strokeOpacity="0.55" strokeWidth="0.6" />;
});

const Provinces = memo(function Provinces({ fills }: { fills: Record<string, string> }) {
  return <g>{PROVINCE_IDS.map((id) => <ProvincePath key={id} id={id} fill={fills[id] ?? '#2c3236'} />)}</g>;
});

function hatchId(color: string): string {
  return `hatch-${color.replace('#', '')}`;
}

function Hatches({ colors }: { colors: Record<string, string> }) {
  const unique = [...new Set(Object.values(colors))];
  return (
    <>
      {unique.map((c) => (
        <pattern key={c} id={hatchId(c)} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.3" height="3" fill={c} />
        </pattern>
      ))}
    </>
  );
}

const HatchOverlay = memo(function HatchOverlay({ hatch }: { hatch: Record<string, string> }) {
  return (
    <g pointerEvents="none">
      {Object.entries(hatch).map(([id, c]) => GEO.provinces[id] ? <path key={id} d={GEO.provinces[id].d} fill={`url(#${hatchId(c)})`} opacity="0.85" /> : null)}
    </g>
  );
});

function CountryBorders({ world, rev }: { world: WorldState; rev: number }) {
  const d = useMemo(() => {
    const parts: string[] = [];
    for (const e of GEO.edges) {
      const a = world.provinces[e.a]?.owner, b = world.provinces[e.b]?.owner;
      if (a !== b) parts.push(e.d);
    }
    return parts.join('');
  }, [world, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  return <path d={d} fill="none" stroke="#0a0e13" strokeOpacity="0.9" strokeWidth="1.5" className="nsk" pointerEvents="none" strokeLinejoin="round" />;
}

function CountryHighlight({ world, rev, country }: { world: WorldState; rev: number; country: string }) {
  const { inner, outer } = useMemo(() => {
    const own = Object.values(world.provinces).filter((p) => p.owner === country).map((p) => p.id);
    const set = new Set(own);
    const outerParts: string[] = [];
    for (const e of GEO.edges) if (set.has(e.a) !== set.has(e.b)) outerParts.push(e.d);
    return { inner: own.map((id) => GEO.provinces[id]?.d ?? '').join(''), outer: outerParts.join('') };
  }, [world, rev, country]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <g pointerEvents="none">
      <path d={inner} fill="#f0d48f" fillOpacity="0.1" stroke="#d9b46b" strokeOpacity="0.55" strokeWidth="1" className="nsk" />
      <path d={outer} fill="none" stroke="#d9b46b" strokeWidth="5" strokeOpacity="0.3" className="nsk" filter="url(#map-glow)" />
      <path d={outer} fill="none" stroke="#f0d48f" strokeWidth="2.2" className="nsk" strokeLinejoin="round" />
    </g>
  );
}

function TradeRoutes({ world, rev }: { world: WorldState; rev: number }) {
  const flows = useMemo(() => {
    const t = computeTrade(world);
    let max = 1;
    for (const n of Object.values(t.nodes)) max = Math.max(max, n.total);
    const out: { d: string; w: number; key: string }[] = [];
    for (const n of Object.values(TRADE_NODE_DEFS)) {
      const total = t.nodes[n.id]?.total ?? 0;
      for (const ds of n.downstream) {
        const [x1, y1] = TRADE_NODE_POINTS[n.id], [x2, y2] = TRADE_NODE_POINTS[ds];
        if (Math.abs(x1 - x2) > W / 2) continue;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.18;
        out.push({ d: `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`, w: 0.8 + Math.sqrt(total / max) * 4.5, key: `${n.id}-${ds}` });
      }
    }
    return out;
  }, [world, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <g pointerEvents="none">
      {flows.map((f) => (
        <g key={f.key}>
          <path d={f.d} fill="none" stroke="#0c1117" strokeOpacity="0.55" strokeWidth={f.w + 1.6} className="nsk" />
          <path d={f.d} fill="none" stroke="#d9b46b" strokeWidth={f.w} className="nsk route-anim" strokeDasharray="8 4" strokeLinecap="round" />
        </g>
      ))}
      {Object.values(TRADE_NODE_DEFS).map((n) => {
        const [x, y] = TRADE_NODE_POINTS[n.id];
        return (
          <g key={n.id} style={{ transform: `translate(${x}px, ${y}px) scale(var(--inv))` }}>
            <circle r="5" fill="#10151b" stroke="#f0d48f" strokeWidth="1.5" />
            <circle r="2" fill="#f0d48f" />
            <text y="-9" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="10" fill="#f0d48f" stroke="#10151b" strokeWidth="3" paintOrder="stroke">{n.name}</text>
          </g>
        );
      })}
    </g>
  );
}

function Labels({ world, rev, k, layer }: { world: WorldState; rev: number; k: number; layer: MapLayer }) {
  const labels = useMemo(() => countryLabels(world), [world, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const showProvinces = k >= 3.2;
  const dark = layer === 'political' || layer === 'terrain';
  return (
    <g pointerEvents="none">
      {labels.map((l) => {
        const screen = l.size * k;
        if (screen < 7.5 || screen > 150) return null;
        if (showProvinces && screen > 70) return null;
        return (
          <text
            key={l.id}
            x={l.x}
            y={l.y}
            transform={l.angle ? `rotate(${l.angle.toFixed(1)} ${l.x} ${l.y})` : undefined}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Cinzel, serif"
            fontWeight="600"
            fontSize={l.size}
            letterSpacing={l.size * 0.12}
            fill={dark ? '#1a1410' : '#efe4c9'}
            fillOpacity={dark ? 0.72 : 0.9}
            stroke={dark ? '#e8d8b5' : '#0b0f14'}
            strokeOpacity={dark ? 0.3 : 0.6}
            strokeWidth={l.size * 0.09}
            paintOrder="stroke"
          >
            {l.text}
          </text>
        );
      })}
      {showProvinces ? PROVINCE_IDS.map((id) => {
        const g = GEO.provinces[id];
        if (Math.sqrt(g.area) * k < 46) return null;
        const fs = 10.5 / k;
        return (
          <text key={id} x={g.lx} y={g.ly + fs * 1.6} textAnchor="middle" fontFamily="'Cormorant Garamond', serif" fontStyle="italic" fontWeight="600" fontSize={fs} fill="#f3e6c8" fillOpacity="0.85" stroke="#0b0f14" strokeOpacity="0.7" strokeWidth={fs * 0.22} paintOrder="stroke">
            {PROVINCE_DEFS[id]?.name.replace(/\s*\(.*\)$/, '')}
          </text>
        );
      }) : null}
    </g>
  );
}

const SeaLabels = memo(function SeaLabels({ k }: { k: number }) {
  return (
    <g pointerEvents="none">
      {Object.values(SEA_DEFS).map((s) => {
        const [x, y] = seaPoint(s.id);
        const fs = 11 / k;
        return <text key={s.id} x={x} y={y} textAnchor="middle" fontFamily="'Cormorant Garamond', serif" fontStyle="italic" fontSize={fs} letterSpacing={fs * 0.15} fill="#8fb3d1" fillOpacity="0.55">{s.name}</text>;
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Markers (drawn at constant screen size via the --inv CSS variable)
// ---------------------------------------------------------------------------

function at(x: number, y: number) {
  return { transform: `translate(${x}px, ${y}px) scale(var(--inv))` };
}

interface Stack { key: string; x: number; y: number; owner: string; regiments: number; armies: Army[]; sieging: boolean; moving: boolean }

function Markers({ world, rev, k, markers, viewer, selectedArmy, selectedFleet }: { world: WorldState; rev: number; k: number; markers: MapMarkerOptions; viewer: string; selectedArmy: string | null; selectedFleet: string | null }) {
  const data = useMemo(() => {
    const stacks = new Map<string, Stack>();
    for (const a of Object.values(world.armies)) {
      if (a.status === 'embarked' || !GEO.provinces[a.location]) continue;
      const key = `${a.location}|${a.owner}|${a.rebel ? 'r' : ''}`;
      let s = stacks.get(key);
      if (!s) {
        const [x, y] = provincePoint(a.location);
        s = { key, x, y, owner: a.owner, regiments: 0, armies: [], sieging: false, moving: false };
        stacks.set(key, s);
      }
      s.regiments += armyRegiments(a);
      s.armies.push(a);
      if (a.status === 'sieging') s.sieging = true;
      if (a.path.length) s.moving = true;
    }
    // Spread stacks that share a province.
    const perProv = new Map<string, Stack[]>();
    for (const s of stacks.values()) {
      const p = s.key.split('|')[0];
      const l = perProv.get(p);
      if (l) l.push(s); else perProv.set(p, [s]);
    }
    const fleetStacks = new Map<string, { key: string; x: number; y: number; owner: string; ships: number; fleets: Fleet[] }>();
    for (const f of Object.values(world.fleets)) {
      const key = `${f.location}|${f.owner}`;
      let s = fleetStacks.get(key);
      if (!s) {
        const [x, y] = seaPoint(f.location);
        s = { key, x, y, owner: f.owner, ships: 0, fleets: [] };
        fleetStacks.set(key, s);
      }
      s.ships += f.ships.line + f.ships.frigate + f.ships.transport;
      s.fleets.push(f);
    }
    const perSea = new Map<string, number>();
    const fleetsOut = [...fleetStacks.values()].map((s) => {
      const sea = s.key.split('|')[0];
      const i = perSea.get(sea) ?? 0;
      perSea.set(sea, i + 1);
      return { ...s, offset: i };
    });
    return { perProv, fleets: fleetsOut };
  }, [world, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewerWars = useMemo(() => {
    const enemies = new Set<string>();
    for (const war of Object.values(world.wars)) {
      const side = war.attackers.includes(viewer) ? war.defenders : war.defenders.includes(viewer) ? war.attackers : null;
      if (side) for (const e of side) enemies.add(e);
    }
    return enemies;
  }, [world, rev, viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = selectedArmy ? world.armies[selectedArmy] : undefined;
  const selFleet = selectedFleet ? world.fleets[selectedFleet] : undefined;
  return (
    <g>
      {/* Planned march of the selected army */}
      {selected && selected.path.length ? (
        <polyline points={[selected.location, ...selected.path].map((id) => provincePoint(id).join(',')).join(' ')} fill="none" stroke="#f0d48f" strokeWidth="2.4" strokeDasharray="7 5" className="nsk route-anim" strokeLinecap="round" pointerEvents="none" />
      ) : null}
      {selFleet && selFleet.path.length ? (
        <polyline points={[selFleet.location, ...selFleet.path].map((id) => seaPoint(id).join(',')).join(' ')} fill="none" stroke="#8fb3d1" strokeWidth="2.2" strokeDasharray="6 5" className="nsk route-anim" pointerEvents="none" />
      ) : null}

      {/* Outposts, capitals, forts and ports */}
      {markers.capitals ? Object.values(world.countries).map((c) => {
        if (!c.alive || !GEO.provinces[c.capital] || world.provinces[c.capital]?.owner !== c.id) return null;
        const big = def(c.id).population > 3_000_000;
        if (!big && k < 1.6 && c.id !== viewer) return null;
        const [x, y] = provincePoint(c.capital);
        return (
          <g key={`cap-${c.id}`} style={at(x, y)} pointerEvents="none">
            <circle r={big ? 4.2 : 3.2} fill="#10151b" stroke="#f0d48f" strokeWidth="1.3" />
            <circle r={big ? 1.8 : 1.3} fill="#f0d48f" />
          </g>
        );
      }) : null}
      {markers.forts && k >= 2.4 ? Object.values(world.provinces).map((p) => {
        if (p.fort < 2 || !GEO.provinces[p.id]) return null;
        const [x, y] = provincePoint(p.id);
        return <path key={`fort-${p.id}`} style={at(x + 9 / k, y - 6 / k)} d="M-4 3 V-2 H-4.5 V-4 H-2.5 V-3 H-0.8 V-4 H0.8 V-3 H2.5 V-4 H4.5 V-2 H4 V3 Z" fill="#b0c1d1" stroke="#10151b" strokeWidth="0.8" pointerEvents="none" />;
      }) : null}
      {markers.ports && k >= 4 ? Object.entries(GEO.provinces).map(([id, g]) => {
        if (!g.port || !(world.provinces[id]?.buildings.port ?? 0)) return null;
        return (
          <g key={`port-${id}`} style={at(g.port[0], g.port[1])} pointerEvents="none">
            <circle r="4.5" fill="#10151b" fillOpacity="0.8" />
            <path d="M0 -3 V3 M-2.6 1 Q0 4 2.6 1 M-1.6 -1.6 H1.6" stroke="#8fb3d1" strokeWidth="1" fill="none" strokeLinecap="round" />
          </g>
        );
      }) : null}
      {k >= 2 ? Object.values(OUTPOST_DEFS).map((o) => {
        const [x, y] = OUTPOST_POINTS[o.id];
        const st = world.outposts[o.id];
        const col = POLITIES[st?.controller ?? o.owner]?.color ?? '#999';
        return <rect key={`op-${o.id}`} style={at(x, y)} x="-2.6" y="-2.6" width="5.2" height="5.2" transform="rotate(45)" fill={col} stroke="#10151b" strokeWidth="1" pointerEvents="none" />;
      }) : null}

      {/* Sieges */}
      {Object.values(world.provinces).map((p) => {
        if (!p.siege || !GEO.provinces[p.id]) return null;
        const [x, y] = provincePoint(p.id);
        return (
          <g key={`siege-${p.id}`} style={at(x, y)} pointerEvents="none">
            <circle r="10" fill="none" stroke="#d95926" strokeWidth="1.6" className="pulse-ring" />
            <circle r="9" fill="none" stroke="#d95926" strokeOpacity="0.6" strokeWidth="1" strokeDasharray={`${(p.siege.progress / 100) * 56.5} 56.5`} transform="rotate(-90)" />
          </g>
        );
      })}

      {/* Fleets */}
      {markers.fleets ? data.fleets.map((s) => {
        const mine = s.owner === viewer;
        const hostile = viewerWars.has(s.owner);
        if (!mine && !hostile && (k < 2.5 ? s.ships < 20 : k < 5 ? s.ships < 4 : false)) return null;
        const col = POLITIES[s.owner]?.color ?? '#999';
        const isSel = s.fleets.some((f) => f.id === selectedFleet);
        return (
          <g key={s.key} data-fleet={s.fleets[0].id} style={at(s.x + s.offset * (18 / k), s.y + s.offset * (6 / k))} className="cursor-pointer">
            <rect x="-15" y="-8" width="30" height="16" rx="3" fill="#10151b" stroke={isSel ? '#f0d48f' : mine ? '#d9b46b' : hostile ? '#d95926' : '#5b8db8'} strokeWidth={isSel ? 2 : 1.2} />
            <path d="M-12 2 H-2 L-4 5 H-10 Z M-7 -5 V2 M-7 -5 L-3 0 H-7" fill={col} stroke={col} strokeWidth="0.8" />
            <text x="5" y="0.5" dominantBaseline="central" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="'Source Sans 3', sans-serif" fill="#e8d8b5">{Math.round(s.ships)}</text>
          </g>
        );
      }) : null}

      {/* Armies */}
      {markers.armies ? [...data.perProv.values()].flatMap((list) => list.map((s, i) => {
        const mine = s.owner === viewer;
        const hostile = viewerWars.has(s.owner) || s.owner === REBELS;
        // Level of detail: our own and hostile forces always; others by size as we zoom in.
        if (!mine && !hostile && (k < 0.9 || (k < 2.2 ? s.regiments < 30 : k < 4 ? s.regiments < 8 : k < 7 ? s.regiments < 2 : false))) return null;
        const col = s.owner === REBELS ? '#2b2b2b' : POLITIES[s.owner]?.color ?? '#999';
        const isSel = s.armies.some((a) => a.id === selectedArmy);
        const label = s.regiments >= 10 ? Math.round(s.regiments) : Math.round(s.regiments * 10) / 10;
        const pick = mine ? s.armies.slice().sort((a, b) => armyRegiments(b) - armyRegiments(a))[0] : s.armies[0];
        const dx = (i - (list.length - 1) / 2) * (30 / k);
        return (
          <g key={s.key} data-army={pick.id} style={at(s.x + dx, s.y - 12 / k)} className="cursor-pointer">
            {isSel ? <rect x="-18" y="-11" width="36" height="22" rx="5" fill="#f0d48f" opacity="0.35" filter="url(#map-glow)" /> : null}
            <rect x="-15" y="-9" width="30" height="18" rx="3.5" fill="#10151b" stroke={isSel ? '#f0d48f' : mine ? '#d9b46b' : hostile ? '#d95926' : '#46535f'} strokeWidth={isSel ? 2.2 : 1.3} />
            <rect x="-13" y="-7" width="8" height="14" rx="1.5" fill={col} />
            {s.owner === REBELS ? <path d="M-11 -4 L-7 4 M-7 -4 L-11 4" stroke="#d95926" strokeWidth="1.4" /> : null}
            <text x="4" y="0.5" dominantBaseline="central" textAnchor="middle" fontSize="10" fontWeight="700" fontFamily="'Source Sans 3', sans-serif" fill="#e8d8b5">{label}</text>
            {s.sieging ? <circle cx="14" cy="-8" r="3" fill="#d95926" stroke="#10151b" strokeWidth="1" /> : null}
            {s.moving && mine ? <path d="M12 6 l5 -3 l-5 -3 z" fill="#f0d48f" /> : null}
          </g>
        );
      })) : null}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Minimap (canvas)
// ---------------------------------------------------------------------------

function Minimap({ world, rev, fills, view, size, tick, onJump }: { world: WorldState; rev: number; fills: Record<string, string>; view: React.RefObject<View>; size: React.RefObject<{ w: number; h: number }>; tick: number; onJump: (mx: number, my: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const MW = 200, MH = Math.round((200 * H) / W);
  const paths = useMemo(() => Object.fromEntries(PROVINCE_IDS.map((id) => [id, typeof Path2D !== 'undefined' ? new Path2D(GEO.provinces[id].d) : null])), []);
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = MW * dpr; c.height = MH * dpr;
    ctx.setTransform((MW / W) * dpr, 0, 0, (MH / H) * dpr, 0, 0);
    ctx.fillStyle = '#121c26';
    ctx.fillRect(0, 0, W, H);
    for (const id of PROVINCE_IDS) {
      const p = paths[id];
      if (!p) continue;
      ctx.fillStyle = fills[id] ?? '#2c3236';
      ctx.fill(p);
    }
    const v = view.current, s = size.current;
    if (v && s) {
      ctx.strokeStyle = '#f0d48f';
      ctx.lineWidth = 2.5 * (W / MW) / dpr;
      ctx.strokeRect(-v.x / v.k, -v.y / v.k, s.w / v.k, s.h / v.k);
    }
  }, [fills, tick, rev, world, paths, MH, view, size]);
  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onJump(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
  };
  return (
    <div className="absolute bottom-3 left-3 z-10 hidden overflow-hidden rounded border border-gold/40 shadow-lg md:block" onPointerDown={(e) => e.stopPropagation()}>
      <canvas ref={canvasRef} style={{ width: MW, height: MH, display: 'block', cursor: 'pointer' }} onPointerDown={jump} onPointerMove={(e) => { if (e.buttons) jump(e); }} aria-label="Minimap" />
    </div>
  );
}
