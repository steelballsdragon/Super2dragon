// Renders the flag mini-language used by the polity database, e.g.
//   "h3 00309e f6d200 c8102e"      horizontal tricolour
//   "solid 1f6b3a e=star8/f6d200"  plain field with an emblem
//   "special union1606"            hand-drawn historical flags
// Flags are drawn on a 30×20 canvas.
import { memo, useId } from 'react';

const C = (hex: string | undefined, fallback = '#888') => (hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : fallback);

interface FlagProps {
  spec: string;
  width?: number;
  className?: string;
  title?: string;
  rounded?: boolean;
}

export const Flag = memo(function Flag({ spec, width = 36, className, title, rounded = true }: FlagProps) {
  const uid = useId().replace(/:/g, '');
  const height = (width * 2) / 3;
  return (
    <svg width={width} height={height} viewBox="0 0 30 20" className={className} role="img" aria-label={title ?? 'flag'}>
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={`fc${uid}`}>
          <rect width="30" height="20" rx={rounded ? 1.2 : 0} />
        </clipPath>
        <linearGradient id={`fs${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#fc${uid})`}>
        <FlagBody spec={spec} uid={uid} />
        <rect width="30" height="20" fill={`url(#fs${uid})`} />
      </g>
      <rect x="0.25" y="0.25" width="29.5" height="19.5" rx={rounded ? 1.1 : 0} fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="0.5" />
    </svg>
  );
});

function FlagBody({ spec, uid }: { spec: string; uid: string }) {
  const parts = spec.trim().split(/\s+/);
  const kind = parts[0];
  const emblemPart = parts.find((p) => p.startsWith('e='));
  const cols = parts.slice(1).filter((p) => !p.startsWith('e=') && /^[0-9a-f]{6}$/i.test(p));
  const nums = parts.slice(1).filter((p) => /^\d+$/.test(p)).map(Number);
  let emblem: { name: string; color: string } | null = null;
  if (emblemPart) {
    const [name, col] = emblemPart.slice(2).split('/');
    if (name) emblem = { name, color: C(col, '#e8d8b5') };
  }
  const em = (x = 15, y = 10, s = 1) => (emblem ? <Emblem name={emblem.name} color={emblem.color} x={x} y={y} s={s} /> : null);
  switch (kind) {
    case 'special': return <Special name={parts[1]} uid={uid} />;
    case 'solid': return <>{<rect width="30" height="20" fill={C(cols[0])} />}{em()}</>;
    case 'h2': return <><rect width="30" height="10" fill={C(cols[0])} /><rect y="10" width="30" height="10" fill={C(cols[1])} />{em()}</>;
    case 'h3': return <><rect width="30" height="6.67" fill={C(cols[0])} /><rect y="6.67" width="30" height="6.67" fill={C(cols[1])} /><rect y="13.33" width="30" height="6.67" fill={C(cols[2])} />{em(15, 10, 0.8)}</>;
    case 'v2': return <><rect width="15" height="20" fill={C(cols[0])} /><rect x="15" width="15" height="20" fill={C(cols[1])} />{em()}</>;
    case 'v3': return <><rect width="10" height="20" fill={C(cols[0])} /><rect x="10" width="10" height="20" fill={C(cols[1])} /><rect x="20" width="10" height="20" fill={C(cols[2])} />{em(15, 10, 0.75)}</>;
    case 'border': return <><rect width="30" height="20" fill={C(cols[1])} /><rect x="2.4" y="2.4" width="25.2" height="15.2" fill={C(cols[0])} />{em(15, 10, 0.85)}</>;
    case 'tri': return <><rect width="30" height="20" fill={C(cols[0])} /><path d="M0 0 L17 10 L0 20 Z" fill={C(cols[1])} />{em(6.5, 10, 0.75)}</>;
    case 'diag': return <><rect width="30" height="20" fill={C(cols[0])} /><path d="M30 0 L30 20 L0 20 Z" fill={C(cols[1])} />{em()}</>;
    case 'nordic': return <><rect width="30" height="20" fill={C(cols[0])} /><rect x="8" width="4" height="20" fill={C(cols[1])} /><rect y="8" width="30" height="4" fill={C(cols[1])} /></>;
    case 'stripes': {
      const n = Math.max(3, Math.min(15, nums[0] ?? 7));
      const h = 20 / n;
      return <>{Array.from({ length: n }, (_, i) => <rect key={i} y={i * h} width="30" height={h + 0.05} fill={C(i % 2 ? cols[1] : cols[0])} />)}{em()}</>;
    }
    case 'pennant': return (
      <>
        <rect width="30" height="20" fill="#19232d" />
        <path d="M1 1 L29 6.5 L21 10 L29 13.5 L1 19 Z" fill={C(cols[0])} stroke="#000" strokeOpacity="0.25" strokeWidth="0.3" />
        <rect x="0" y="0" width="1.2" height="20" fill="#6b5534" />
        {em(9, 10, 0.7)}
      </>
    );
    default: return <rect width="30" height="20" fill="#6b6b6b" />;
  }
}

function Special({ name, uid }: { name: string; uid: string }) {
  switch (name) {
    case 'union1606':
    case 'union1801':
      return (
        <>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" strokeWidth="4" />
          {name === 'union1801' ? (
            <>
              <clipPath id={`u${uid}`}><path d="M15 10 H30 V20 Z M15 10 V20 H0 Z M15 10 H0 V0 Z M15 10 V0 H30 Z" /></clipPath>
              <path d="M0 0 L30 20 M30 0 L0 20" stroke="#c8102e" strokeWidth="1.6" clipPath={`url(#u${uid})`} />
            </>
          ) : null}
          <path d="M15 0 V20 M0 10 H30" stroke="#fff" strokeWidth="6" />
          <path d="M15 0 V20 M0 10 H30" stroke="#c8102e" strokeWidth="3.6" />
        </>
      );
    case 'usa1795':
      return (
        <>
          {Array.from({ length: 15 }, (_, i) => <rect key={i} y={(i * 20) / 15} width="30" height={20 / 15 + 0.05} fill={i % 2 ? '#fff' : '#b22234'} />)}
          <rect width="13" height={(20 / 15) * 8} fill="#3c3b6e" />
          {Array.from({ length: 15 }, (_, i) => <circle key={i} cx={1.6 + (i % 5) * 2.45} cy={1.6 + Math.floor(i / 5) * 3.3} r="0.55" fill="#fff" />)}
        </>
      );
    case 'eic':
      return (
        <>
          {Array.from({ length: 13 }, (_, i) => <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13 + 0.05} fill={i % 2 ? '#fff' : '#c8102e'} />)}
          <g transform="scale(0.45)">
            <rect width="30" height="20" fill="#012169" />
            <path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" strokeWidth="4" />
            <path d="M15 0 V20 M0 10 H30" stroke="#fff" strokeWidth="6" />
            <path d="M15 0 V20 M0 10 H30" stroke="#c8102e" strokeWidth="3.6" />
          </g>
        </>
      );
    case 'spain':
      return (
        <>
          <rect width="30" height="20" fill="#f4efe2" />
          <g stroke="#b8202b" strokeWidth="2.2" strokeLinecap="round">
            <path d="M5 3 L8 6.2 L10 5.8 L13 9 L17 11 L20 14.2 L22 13.8 L25 17" fill="none" />
            <path d="M25 3 L22 6.2 L20 5.8 L17 9 L13 11 L10 14.2 L8 13.8 L5 17" fill="none" />
          </g>
        </>
      );
    case 'portugal':
      return (
        <>
          <rect width="30" height="20" fill="#f4efe2" />
          <path d="M11 5.5 h8 v6 q0 4 -4 5 q-4 -1 -4 -5 z" fill="#003399" stroke="#c8102e" strokeWidth="1" />
          <g fill="#fff">{[[15, 8.2], [13.4, 10.2], [16.6, 10.2], [15, 12.2], [15, 10.2]].map(([x, y], i) => <rect key={i} x={x - 0.6} y={y - 0.8} width="1.2" height="1.6" rx="0.4" />)}</g>
          <path d="M11.5 4.4 L12.5 2.6 L14 3.8 L15 2.2 L16 3.8 L17.5 2.6 L18.5 4.4 Z" fill="#d9a400" />
        </>
      );
    case 'ottoman':
      return (
        <>
          <rect width="30" height="20" fill="#c8102e" />
          <circle cx="13" cy="10" r="5" fill="#fff" />
          <circle cx="14.4" cy="10" r="4" fill="#c8102e" />
          <Star x={19.2} y={10} r={2.2} color="#fff" points={5} />
        </>
      );
    case 'prussia':
      return (
        <>
          <rect width="30" height="20" fill="#f4f1ea" />
          <rect y="0" width="30" height="1.6" fill="#111" />
          <rect y="18.4" width="30" height="1.6" fill="#111" />
          <Emblem name="eagle" color="#111" x={15} y={10} s={1} />
        </>
      );
    case 'habsburg':
      return (
        <>
          <rect width="30" height="10" fill="#111" />
          <rect y="10" width="30" height="10" fill="#f4c300" />
          <Emblem name="eagle" color="#d9b46b" x={15} y={10} s={0.85} />
        </>
      );
    case 'bavaria':
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          {Array.from({ length: 6 }, (_, r) => Array.from({ length: 9 }, (_, c) => (r + c) % 2 ? null : (
            <path key={`${r}-${c}`} d={`M${c * 3.6 - 1.8} ${r * 3.6 + 1.8} l1.8 -1.8 l1.8 1.8 l-1.8 1.8 z`} fill="#0f6cb6" />
          )))}
        </>
      );
    case 'ireland':
      return (
        <>
          <rect width="30" height="20" fill="#1f7a3a" />
          <path d="M12 5 q4 -2 7 1 l-1 9 q-3 1 -6 -1 z" fill="none" stroke="#d9b46b" strokeWidth="1" />
          <path d="M13 6 v8 M14.6 5.6 v9 M16.2 5.6 v9" stroke="#d9b46b" strokeWidth="0.35" />
        </>
      );
    case 'nepal':
      return (
        <>
          <rect width="30" height="20" fill="#19232d" />
          <path d="M2 1 L22 9 L9 9 L22 19 L2 19 Z" fill="#dc143c" stroke="#003893" strokeWidth="1.1" strokeLinejoin="round" />
          <circle cx="7" cy="7" r="1.6" fill="#fff" />
          <circle cx="7" cy="14.5" r="2" fill="#fff" />
        </>
      );
    case 'qing':
      return (
        <>
          <rect width="30" height="20" fill="#f2c200" />
          <path d="M5 13 q3 -6 7 -3 q3 2 6 -2 q2 -3 6 -1 q-2 0 -3 2 q-3 5 -7 3 q-3 -1 -5 2 q-2 2 -4 -1 z" fill="#1f4fa0" />
          <circle cx="24" cy="6" r="1.6" fill="#c8102e" />
        </>
      );
    case 'tokugawa':
      return (
        <>
          <rect width="30" height="20" fill="#f4efe2" />
          <circle cx="15" cy="10" r="6.2" fill="none" stroke="#111" strokeWidth="1" />
          {[0, 120, 240].map((a) => (
            <path key={a} transform={`rotate(${a} 15 10)`} d="M15 10 q-3.2 -1 -3 -4.6 q2.6 0.4 3 4.6 z M15 10 q3.2 -1 3 -4.6 q-2.6 0.4 -3 4.6 z" fill="#111" />
          ))}
        </>
      );
    default:
      return <rect width="30" height="20" fill="#555" />;
  }
}

function Star({ x, y, r, color, points = 5, inner = 0.42 }: { x: number; y: number; r: number; color: string; points?: number; inner?: number }) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(2)},${(y + rr * Math.sin(a)).toFixed(2)}`);
  }
  return <polygon points={pts.join(' ')} fill={color} />;
}

/** Heraldic charges drawn in a ~12×12 box centred on (x, y). */
export function Emblem({ name, color, x, y, s = 1 }: { name: string; color: string; x: number; y: number; s?: number }) {
  const t = `translate(${x} ${y}) scale(${s})`;
  switch (name) {
    case 'star': return <Star x={x} y={y} r={4.2 * s} color={color} />;
    case 'star8': return <Star x={x} y={y} r={4.4 * s} color={color} points={8} inner={0.55} />;
    case 'crescent': return (
      <g transform={t}><path d="M-0.6 -4.4 a4.4 4.4 0 1 0 0 8.8 a3.5 3.5 0 1 1 0 -8.8 z" fill={color} /><Star x={3.6} y={0} r={1.5} color={color} /></g>
    );
    case 'cross': return <g transform={t}><rect x="-1.1" y="-5" width="2.2" height="10" fill={color} /><rect x="-4" y="-2.2" width="8" height="2.2" fill={color} /></g>;
    case 'sun': return (
      <g transform={t}>
        {Array.from({ length: 12 }, (_, i) => <path key={i} transform={`rotate(${i * 30})`} d="M-0.7 -3 L0 -5.4 L0.7 -3 Z" fill={color} />)}
        <circle r="2.6" fill={color} />
      </g>
    );
    case 'circle': return <circle cx={x} cy={y} r={3.8 * s} fill={color} />;
    case 'disc': return <circle cx={x} cy={y} r={4.6 * s} fill={color} />;
    case 'wheel': return (
      <g transform={t} stroke={color} fill="none" strokeWidth="0.8">
        <circle r="4" /><circle r="0.9" fill={color} />
        {Array.from({ length: 8 }, (_, i) => <path key={i} transform={`rotate(${i * 22.5})`} d="M0 -4 V4" />)}
      </g>
    );
    case 'khanda': return (
      <g transform={t} fill={color}>
        <path d="M-0.5 -5.2 L0 -6 L0.5 -5.2 L0.6 3.6 L-0.6 3.6 Z" />
        <path d="M-2.6 -1.6 a3.2 3.2 0 1 0 5.2 0 l-0.7 0.4 a2.4 2.4 0 1 1 -3.8 0 z" />
        <path d="M-4.6 -3 q-1 4 2.4 7 l0.5 -0.4 q-2.6 -2.8 -2.2 -6.4 z" />
        <path d="M4.6 -3 q1 4 -2.4 7 l-0.5 -0.4 q2.6 -2.8 2.2 -6.4 z" />
      </g>
    );
    case 'lotus': return (
      <g transform={t} fill={color}>
        <path d="M0 -4.5 q2 2.5 0 5 q-2 -2.5 0 -5 z" />
        <path d="M-1 0.6 q-4 -0.5 -4.4 -3.4 q3 0 4.4 3.4 z" /><path d="M1 0.6 q4 -0.5 4.4 -3.4 q-3 0 -4.4 3.4 z" />
        <rect x="-4.5" y="1.2" width="9" height="1" rx="0.5" />
      </g>
    );
    case 'spiral': return <g transform={t}><path d="M0 0 m0 -0.6 a0.6 0.6 0 1 1 -0.6 0.6 a1.4 1.4 0 0 1 1.4 -1.4 a2.2 2.2 0 0 1 2.2 2.2 a3 3 0 0 1 -3 3 a3.8 3.8 0 0 1 -3.8 -3.8" fill="none" stroke={color} strokeWidth="0.9" strokeLinecap="round" /></g>;
    case 'council': return (
      <g transform={t} fill={color}>
        {[-3.4, 0, 3.4].map((dx) => <g key={dx}><circle cx={dx} cy={-1.8} r="1.1" /><path d={`M${dx - 1.5} 3.4 q0 -3.6 1.5 -3.6 q1.5 0 1.5 3.6 z`} /></g>)}
        <path d="M-1 3.8 l1 -2 l1 2 z" opacity="0.8" />
      </g>
    );
    case 'lion': return (
      <g transform={t} fill={color}>
        <path d="M-4.5 3.6 L-3.6 0.6 Q-4 -2.4 -1.6 -3.6 Q0.6 -4.6 1.8 -2.8 L3.2 -3.4 L2.8 -1.8 Q4 -0.6 3 0.6 L4.6 3.6 L3.2 3.6 L1.8 1.4 L-1.2 1.6 L-2.4 3.6 Z" />
        <path d="M-3.8 0.6 q-1.8 -0.6 -1.2 -2.6 q0.4 1.2 1.4 1.4 z" />
      </g>
    );
    case 'horse': return (
      <g transform={t} fill={color}>
        <path d="M-4.6 3.8 L-3.8 0 Q-3.6 -1.6 -1.6 -1.6 L1.4 -1.6 L2.6 -4 L4.4 -3.6 L3.8 -2.4 L4.6 -0.8 L3.6 -0.4 L2.8 -1 L2.6 0.6 L3.4 3.8 L2.4 3.8 L1.6 1.2 L-1.8 1.2 L-2.6 3.8 Z" />
      </g>
    );
    case 'spear': return (
      <g transform={t} fill={color}>
        <path d="M-0.4 -5.6 L0.9 -3 L0.35 -3 L0.35 5.6 L-0.35 5.6 L-0.35 -3 L-0.9 -3 Z" transform="rotate(30)" />
        <path d="M-0.4 -5.6 L0.9 -3 L0.35 -3 L0.35 5.6 L-0.35 5.6 L-0.35 -3 L-0.9 -3 Z" transform="rotate(-30)" />
        <ellipse rx="1.8" ry="3" />
      </g>
    );
    case 'bird': return <g transform={t} fill={color}><path d="M-5 -1 Q-2 -3.6 0 -0.6 Q2 -3.6 5 -1 Q2.4 -1.4 1 1 L1.6 3.6 L0 2.6 L-1.6 3.6 L-1 1 Q-2.4 -1.4 -5 -1 Z" /></g>;
    case 'eagle': return (
      <g transform={t} fill={color}>
        <path d="M0 -3.6 L1 -2.6 L0.6 -1.4 L3 -3 L5.2 -3.4 L4.4 -2 L5 -1.6 L3.6 -0.4 L4 0 L2.2 0.6 L1.4 2 L2.4 3.8 L0 2.8 L-2.4 3.8 L-1.4 2 L-2.2 0.6 L-4 0 L-3.6 -0.4 L-5 -1.6 L-4.4 -2 L-5.2 -3.4 L-3 -3 L-0.6 -1.4 L-1 -2.6 Z" />
        <circle cx="0" cy="-4.2" r="0.9" />
      </g>
    );
    case 'crown': return <g transform={t} fill={color}><path d="M-4.4 2.4 L-4.8 -2.6 L-2.2 -0.4 L0 -3.8 L2.2 -0.4 L4.8 -2.6 L4.4 2.4 Z" /><rect x="-4.6" y="2.8" width="9.2" height="1.4" rx="0.4" /></g>;
    case 'dragon': return <g transform={t}><path d="M-5 2 q2 -5 5 -2 q2 2 4 -1.6 q1 -1.6 1 -3 q1.4 2 0 4 q-2 4 -5 2 q-2 -1.4 -4 1.4 z" fill={color} /><circle cx="4.6" cy="-3.4" r="0.6" fill={color} /></g>;
    case 'fish': return <g transform={t} fill={color}><path d="M-4 0 Q0 -3.6 3 0 Q0 3.6 -4 0 Z" /><path d="M3 0 L5 -2 L5 2 Z" /></g>;
    case 'fleur': return (
      <g transform={t} fill={color}>
        <path d="M0 -5 Q1.6 -2.6 0.6 0 L-0.6 0 Q-1.6 -2.6 0 -5 Z" />
        <path d="M-0.6 0.2 Q-4.6 0.4 -4 -3 Q-2.2 -1.6 -1 -1 Z" /><path d="M0.6 0.2 Q4.6 0.4 4 -3 Q2.2 -1.6 1 -1 Z" />
        <rect x="-2.4" y="0.4" width="4.8" height="1" rx="0.3" /><path d="M-0.5 1.4 L0.5 1.4 L1.2 4.4 L-1.2 4.4 Z" />
      </g>
    );
    case 'keys': return (
      <g transform={t} stroke={color} strokeWidth="0.9" fill="none">
        <g transform="rotate(35)"><circle cy="-3.4" r="1.2" /><path d="M0 -2.2 V4 M0 2.6 H1.4 M0 3.6 H1.4" /></g>
        <g transform="rotate(-35)"><circle cy="-3.4" r="1.2" /><path d="M0 -2.2 V4 M0 2.6 H-1.4 M0 3.6 H-1.4" /></g>
      </g>
    );
    case 'mountain': return <g transform={t} fill={color}><path d="M-5 3.6 L-1.6 -2.6 L0.4 0.4 L2 -1.6 L5 3.6 Z" /></g>;
    case 'ship': return (
      <g transform={t} fill={color}>
        <path d="M-5 1.4 L5 1.4 L3.6 3.6 L-3.6 3.6 Z" />
        <path d="M-0.3 -5 V1.2 M-3.4 -3 V1.2 M2.8 -3 V1.2" stroke={color} strokeWidth="0.5" />
        <path d="M0 -4.6 Q2.6 -2.4 0 0.8 Z M-3.2 -2.6 Q-1.2 -1 -3.2 0.8 Z M3 -2.6 Q4.6 -1 3 0.8 Z" />
      </g>
    );
    case 'swords': return (
      <g transform={t} fill={color}>
        <path d="M-0.35 -5.4 L0.35 -5.4 L0.35 3 L-0.35 3 Z M-1.6 2.4 H1.6 V3.1 H-1.6 Z M-0.4 3 H0.4 V5 H-0.4 Z" transform="rotate(40)" />
        <path d="M-0.35 -5.4 L0.35 -5.4 L0.35 3 L-0.35 3 Z M-1.6 2.4 H1.6 V3.1 H-1.6 Z M-0.4 3 H0.4 V5 H-0.4 Z" transform="rotate(-40)" />
      </g>
    );
    case 'taeguk': return (
      <g transform={t}>
        <circle r="4" fill="#c8102e" />
        <path d="M-4 0 a4 4 0 0 0 8 0 a2 2 0 0 0 -4 0 a2 2 0 0 1 -4 0 z" fill="#003478" />
      </g>
    );
    case 'tower': return (
      <g transform={t} fill={color}>
        <path d="M-3.4 4 L-2.8 -2.6 L-3.6 -2.6 L-3.6 -4.6 L-2.4 -4.6 L-2.4 -3.6 L-1.2 -3.6 L-1.2 -4.6 L1.2 -4.6 L1.2 -3.6 L2.4 -3.6 L2.4 -4.6 L3.6 -4.6 L3.6 -2.6 L2.8 -2.6 L3.4 4 Z" />
        <path d="M-0.8 4 V1.6 a0.8 0.8 0 0 1 1.6 0 V4 Z" fill="#000" opacity="0.35" />
      </g>
    );
    default: return <Star x={x} y={y} r={4 * s} color={color} />;
  }
}
