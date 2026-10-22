// Interface building blocks in the house style: gilt-framed panels, meters, tabs, modals.
import { X } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Flag } from '../art/Flag';
import { Divider, GiltFrame } from '../art/Ornaments';
import { countryName } from '../game/state';
import { POLITIES } from '../game/static';
import type { WorldState } from '../game/types';

export function Heading({ children, sub, className = '' }: { children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h2 className="font-display text-[15px] font-semibold uppercase tracking-[0.14em] text-gold">{children}</h2>
      {sub ? <p className="mt-0.5 font-serif text-[15px] italic text-parchment-dim">{sub}</p> : null}
    </div>
  );
}

export function Section({ title, children, right, className = '' }: { title: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`mb-4 ${className}`}>
      <div className="mb-2 flex items-center gap-3">
        <span className="label whitespace-nowrap">{title}</span>
        <div className="gilt-rule flex-1" />
        {right}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad' | 'war' | 'diplo' | 'econ'; icon?: ReactNode }) {
  const color = tone === 'good' || tone === 'econ' ? 'text-econ' : tone === 'bad' || tone === 'war' ? 'text-war' : tone === 'diplo' ? 'text-diplo' : 'text-parchment';
  return (
    <div className="card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">{icon}{label}</div>
      <div className={`tabular mt-0.5 text-lg font-semibold ${color}`}>{value}</div>
      {hint ? <div className="text-[11px] text-parchment-dim">{hint}</div> : null}
    </div>
  );
}

export function Meter({ value, max = 100, color = '#d9b46b', label, right, height = 6 }: { value: number; max?: number; color?: string; label?: ReactNode; right?: ReactNode; height?: number }) {
  const p = Math.max(0, Math.min(1, value / max));
  return (
    <div>
      {label || right ? <div className="mb-1 flex justify-between text-xs text-parchment-dim"><span>{label}</span><span className="tabular text-parchment">{right}</span></div> : null}
      <div className="overflow-hidden rounded-full bg-ink/70" style={{ height }} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p * 100}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }} />
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className = '' }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`flex gap-1 overflow-x-auto border-b border-gold/15 scroll-thin ${className}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={`whitespace-nowrap px-3 py-2 font-display text-[11px] uppercase tracking-[0.12em] transition-colors ${value === t.id ? 'border-b-2 border-gold text-gold-bright' : 'border-b-2 border-transparent text-parchment-dim hover:text-parchment'}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, children, title, wide = false, closable = true, labelledBy }: { open: boolean; onClose?: () => void; children: ReactNode; title?: ReactNode; wide?: boolean; closable?: boolean; labelledBy?: string }) {
  const id = useId();
  useEffect(() => {
    if (!open || !closable) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closable, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4" onClick={() => closable && onClose?.()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? id}
        className={`panel relative max-h-[92vh] w-full overflow-hidden animate-rise ${wide ? 'sm:max-w-4xl' : 'sm:max-w-xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <GiltFrame inset={5} size={22} />
        {title ? (
          <div className="flex items-center justify-between border-b border-gold/15 px-5 py-3">
            <h3 id={id} className="font-display text-sm uppercase tracking-[0.16em] text-gold">{title}</h3>
            {closable ? <button className="btn btn-quiet !min-h-0 !p-1" onClick={onClose} aria-label="Close"><X size={18} /></button> : null}
          </div>
        ) : null}
        <div className="max-h-[calc(92vh-56px)] overflow-y-auto scroll-thin">{children}</div>
      </div>
    </div>
  );
}

export function CountryChip({ w, id, onClick, size = 22, sub }: { w: WorldState; id: string; onClick?: () => void; size?: number; sub?: ReactNode }) {
  const d = POLITIES[id];
  const body = (
    <span className="inline-flex min-w-0 items-center gap-2">
      {d ? <Flag spec={d.flag} width={size} title={d.name} /> : null}
      <span className="min-w-0">
        <span className="block truncate text-sm text-parchment">{countryName(w, id)}</span>
        {sub ? <span className="block truncate text-[11px] text-muted">{sub}</span> : null}
      </span>
    </span>
  );
  return onClick ? <button className="min-w-0 text-left hover:brightness-125" onClick={onClick}>{body}</button> : body;
}

export function Ornate({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`panel relative ${className}`}>
      <GiltFrame inset={4} size={20} />
      {children}
    </div>
  );
}

export function OrnateDivider({ className = '' }: { className?: string }) {
  return <Divider className={className} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center font-serif text-[15px] italic text-parchment-dim">{children}</p>;
}

export function Badge({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'war' | 'econ' | 'diplo' | 'muted' }) {
  const cls = {
    gold: 'border-gold/40 text-gold',
    war: 'border-war/60 text-[#e7928a]',
    econ: 'border-econ/60 text-[#8fd1aa]',
    diplo: 'border-diplo/60 text-[#9cc0e2]',
    muted: 'border-line text-muted',
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>{children}</span>;
}

/** A slider with label and formatted value. */
export function Slider({ label, value, min, max, step, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; hint?: ReactNode }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-sm"><span className="text-parchment-dim">{label}</span><span className="tabular font-semibold text-parchment">{format(v)}</span></div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => onChange(v)}
        onKeyUp={() => onChange(v)}
        onBlur={() => v !== value && onChange(v)}
        className="w-full accent-[#d9b46b]"
      />
      {hint ? <div className="mt-0.5 text-[11px] text-muted">{hint}</div> : null}
    </label>
  );
}

export function KeyValue({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-parchment-dim">{k}</dt>
          <dd className="tabular text-right text-parchment">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
