// A small line chart: 2px lines, recessive grid, one y-axis, legend for multiple series, and a
// hover crosshair with a tooltip. Colours are the validated categorical slots for the dark surface.
import { useMemo, useRef, useState } from 'react';
import { shortDate } from './format';

export const SERIES = ['#3987e5', '#d95926', '#199e70'];

export interface Series { name: string; values: number[]; color?: string }

export function LineChart({ series, turns, height = 150, format = (v: number) => v.toFixed(0), title }: { series: Series[]; turns: number[]; height?: number; format?: (v: number) => string; title: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 420, H = height, padL = 46, padR = 10, padT = 8, padB = 20;
  const { lo, hi, ticks } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
    let lo = Math.min(0, ...all), hi = Math.max(1, ...all);
    if (hi === lo) hi = lo + 1;
    const step = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
    return { lo, hi, ticks };
  }, [series]);
  const n = turns.length;
  if (n < 2) return <p className="py-6 text-center text-[13px] italic text-parchment-dim">{title}: the chart fills in as months pass.</p>;
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / (W - padL - padR)) * (n - 1)))));
  };
  const xTicks = [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <figure className="relative">
      <figcaption className="sr-only">{title}</figcaption>
      {series.length > 1 ? (
        <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-parchment-dim">
          {series.map((s, i) => <span key={s.name} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color ?? SERIES[i] }} />{s.name}</span>)}
        </div>
      ) : null}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#2c3a48" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#8d9aa6" className="tabular">{format(t)}</text>
          </g>
        ))}
        {lo < 0 && hi > 0 ? <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="#4a5a6a" strokeWidth="1" /> : null}
        {xTicks.map((i) => <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill="#8d9aa6">{shortDate(turns[i])}</text>)}
        {series.map((s, si) => (
          <polyline key={s.name} fill="none" stroke={s.color ?? SERIES[si]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
        ))}
        {hover !== null ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="#e8d8b5" strokeOpacity="0.35" />
            {series.map((s, si) => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r="4" fill={s.color ?? SERIES[si]} stroke="#19232d" strokeWidth="2" />)}
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <div className="pointer-events-none absolute top-6 rounded border border-gold/30 bg-ink/95 px-2 py-1 text-[11px] shadow-lg" style={{ left: `${Math.min(70, (x(hover) / W) * 100)}%` }}>
          <div className="text-muted">{shortDate(turns[hover])}</div>
          {series.map((s, si) => <div key={s.name} className="flex items-center gap-1.5 text-parchment"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color ?? SERIES[si] }} />{s.name}: <span className="tabular">{format(s.values[hover])}</span></div>)}
        </div>
      ) : null}
    </figure>
  );
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
