// Number and date formatting used across the interface. Money is held in £ thousands.
import { MONTHS } from '../game/constants';

export function money(v: number, opts: { sign?: boolean } = {}): string {
  const sign = opts.sign && v > 0 ? '+' : v < 0 ? '−' : '';
  const a = Math.abs(v);
  let s: string;
  if (a >= 100_000) s = `£${(a / 1000).toFixed(0)}M`;
  else if (a >= 10_000) s = `£${(a / 1000).toFixed(1)}M`;
  else if (a >= 1000) s = `£${(a / 1000).toFixed(2)}M`;
  else if (a >= 100) s = `£${Math.round(a)}k`;
  else if (a >= 10) s = `£${a.toFixed(0)}k`;
  else s = `£${a.toFixed(1)}k`;
  return sign + s;
}

/** Population given in thousands. */
export function people(thousands: number): string {
  if (thousands >= 1000) return `${(thousands / 1000).toFixed(thousands >= 100_000 ? 0 : 1)}M`;
  if (thousands >= 1) return `${Math.round(thousands)}k`;
  return `${Math.round(thousands * 1000)}`;
}

export function men(thousands: number): string {
  return `${Math.round(thousands * 1000).toLocaleString('en')}`;
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function signed(v: number, digits = 0): string {
  const r = v.toFixed(digits);
  return v > 0 ? `+${r}` : v < 0 ? `−${r.slice(1)}` : r;
}

export function dateOf(turn: number): string {
  return `${MONTHS[turn % 12]} ${1800 + Math.floor(turn / 12)}`;
}

export function shortDate(turn: number): string {
  return `${MONTHS[turn % 12].slice(0, 3)} ${1800 + Math.floor(turn / 12)}`;
}

export function monthsText(m: number): string {
  if (m < 1) return 'under a month';
  if (m < 12) return `${Math.round(m)} month${Math.round(m) === 1 ? '' : 's'}`;
  const y = Math.floor(m / 12), r = Math.round(m % 12);
  return `${y} year${y > 1 ? 's' : ''}${r ? ` ${r} mo` : ''}`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function timeAgo(ms: number): string {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}
