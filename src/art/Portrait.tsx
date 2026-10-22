// Painted-cameo portraits, assembled from layers chosen by court style and a seed.
// Original vector art; no likeness of any real person is intended.
import { memo, useId } from 'react';
import type { PortraitStyle } from '../game/types';

interface PortraitProps {
  style: PortraitStyle;
  seed: number;
  female?: boolean;
  age?: number;
  size?: number;
  className?: string;
  title?: string;
  frame?: boolean;
}

function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s % 10000) / 10000;
  };
}
const pickOf = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

const SKIN: Record<string, string[]> = {
  light: ['#f1d3b8', '#ecc8a6', '#e6bf9c'],
  olive: ['#d9ac83', '#cf9f76', '#c99a6e'],
  brown: ['#b98457', '#a8744a', '#9c6a42'],
  dark: ['#7a4d2f', '#6a4228', '#5a3721'],
  east: ['#efcfa6', '#e6c29a', '#dcb88d'],
};

const STYLE_SKIN: Record<PortraitStyle, keyof typeof SKIN> = {
  euro: 'light', euro_mil: 'light', euro_crown: 'light', euro_female: 'light', cleric: 'light', republic: 'light',
  turban: 'brown', sikh: 'brown', rajput: 'brown', ottoman: 'olive', persian: 'olive', arab: 'olive',
  qing: 'east', joseon: 'east', japan: 'east', sea_asian: 'brown', african: 'dark', african_crown: 'dark',
  steppe: 'olive', council: 'brown', himalayan: 'olive',
};

const CLOTH = ['#7a1f2b', '#1f3a5f', '#2f5d3a', '#5b2a4a', '#3a2f22', '#6b4f1f', '#24323f', '#8b4a1e'];
const HAIR_DARK = ['#1d1612', '#2a1d14', '#3b2a1c', '#4a3322'];
const HAIR_LIGHT = ['#6b4a2a', '#8a6236', '#a77d46', '#4a3322'];

export const Portrait = memo(function Portrait({ style, seed, female = false, age = 45, size = 96, className, title, frame = true }: PortraitProps) {
  const uid = useId().replace(/:/g, '');
  const r = rng(seed * 2654435761 + style.length * 97);
  const st: PortraitStyle = female && style.startsWith('euro') ? 'euro_female' : style;
  const skin = pickOf(r, SKIN[STYLE_SKIN[st]]);
  const cloth = pickOf(r, CLOTH);
  const cloth2 = pickOf(r, CLOTH);
  const grey = age > 58 ? '#c9c4bb' : age > 48 && r() < 0.5 ? '#8c857a' : null;
  const hair = grey ?? (st === 'euro' || st === 'republic' || st === 'euro_female' || st === 'euro_mil' ? pickOf(r, HAIR_LIGHT) : pickOf(r, HAIR_DARK));
  const beard = !female && (['ottoman', 'persian', 'arab', 'sikh', 'turban', 'joseon', 'himalayan'].includes(st) ? r() < 0.9 : ['rajput', 'steppe', 'qing', 'african', 'african_crown'].includes(st) ? r() < 0.35 : r() < 0.08);
  const moustache = !female && (beard || ['rajput', 'steppe', 'qing', 'turban', 'persian'].includes(st) || r() < 0.12);
  const bg = pickOf(r, [['#3b2a1c', '#1a120b'], ['#24323f', '#10151b'], ['#3a2a2a', '#140d0d'], ['#2e3a2a', '#11160f']]);
  const faceW = 15 + r() * 2.2;
  const jaw = 19 + r() * 2;
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" className={className} role="img" aria-label={title ?? 'portrait'}>
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={`bg${uid}`} cx="0.45" cy="0.35" r="0.75">
          <stop offset="0" stopColor={bg[0]} />
          <stop offset="1" stopColor={bg[1]} />
        </radialGradient>
        <radialGradient id={`sk${uid}`} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor={skin} />
          <stop offset="1" stopColor={shade(skin, -0.22)} />
        </radialGradient>
        <linearGradient id={`cl${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(cloth, 0.12)} />
          <stop offset="1" stopColor={shade(cloth, -0.35)} />
        </linearGradient>
        <linearGradient id={`gd${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e2a8" />
          <stop offset="0.5" stopColor="#d9b46b" />
          <stop offset="1" stopColor="#8a6a32" />
        </linearGradient>
        <clipPath id={`ov${uid}`}><ellipse cx="50" cy="60" rx="44" ry="55" /></clipPath>
      </defs>
      <ellipse cx="50" cy="60" rx="44" ry="55" fill={`url(#bg${uid})`} />
      <g clipPath={`url(#ov${uid})`}>
        <Body st={st} uid={uid} cloth={cloth} cloth2={cloth2} skin={skin} r={r} />
        {/* neck */}
        <path d={`M43 66 Q50 70 57 66 L58 80 Q50 84 42 80 Z`} fill={shade(skin, -0.12)} />
        <BackHair st={st} hair={hair} female={female} />
        {/* head */}
        <ellipse cx="50" cy="52" rx={faceW} ry={jaw} fill={`url(#sk${uid})`} />
        <ellipse cx={50 - faceW - 0.5} cy="54" rx="2.4" ry="4" fill={shade(skin, -0.15)} />
        <ellipse cx={50 + faceW + 0.5} cy="54" rx="2.4" ry="4" fill={shade(skin, -0.15)} />
        <Face skin={skin} female={female} st={st} age={age} />
        {beard ? <path d={`M${50 - faceW + 2} 56 Q${50 - faceW + 3} 72 50 ${76 + r() * 6} Q${50 + faceW - 3} 72 ${50 + faceW - 2} 56 Q50 66 ${50 - faceW + 2} 56 Z`} fill={grey ?? hair} opacity="0.95" /> : null}
        {moustache ? <path d="M43 62.5 Q46.5 60.5 50 62 Q53.5 60.5 57 62.5 Q53.5 63.8 50 63 Q46.5 63.8 43 62.5 Z" fill={grey ?? hair} /> : null}
        {st === 'rajput' && moustache ? <path d="M43 62.5 q-4 0.5 -5 -3 M57 62.5 q4 0.5 5 -3" stroke={grey ?? hair} strokeWidth="1.6" fill="none" strokeLinecap="round" /> : null}
        <Headgear st={st} uid={uid} hair={hair} cloth={cloth} cloth2={cloth2} r={r} female={female} />
        {female ? <g fill="#f3e9d2"><circle cx={50 - faceW - 0.5} cy="60" r="1.2" /><circle cx={50 + faceW + 0.5} cy="60" r="1.2" /></g> : null}
      </g>
      {frame ? (
        <>
          <ellipse cx="50" cy="60" rx="44" ry="55" fill="none" stroke={`url(#gd${uid})`} strokeWidth="3.2" />
          <ellipse cx="50" cy="60" rx="41.2" ry="52.2" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="0.8" />
        </>
      ) : null}
    </svg>
  );
});

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let rr = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  rr = f(rr); g = f(g); b = f(b);
  return `#${((1 << 24) | (rr << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function Face({ skin, female, st, age }: { skin: string; female: boolean; st: PortraitStyle; age: number }) {
  const dark = shade(skin, -0.55);
  const eastern = st === 'qing' || st === 'joseon' || st === 'japan';
  return (
    <g>
      {/* brows */}
      <path d="M41 46.5 Q44 44.8 47 46.2 M53 46.2 Q56 44.8 59 46.5" stroke={shade(skin, -0.6)} strokeWidth={female ? 0.8 : 1.3} fill="none" strokeLinecap="round" />
      {/* eyes */}
      {eastern ? (
        <g stroke={dark} strokeWidth="1.1" strokeLinecap="round"><path d="M41.5 50 Q44 49 46.5 50" /><path d="M53.5 50 Q56 49 58.5 50" /></g>
      ) : (
        <g>
          <ellipse cx="44" cy="50" rx="2.5" ry="1.25" fill="#f3ead8" />
          <ellipse cx="56" cy="50" rx="2.5" ry="1.25" fill="#f3ead8" />
          <circle cx="44.3" cy="50" r="1" fill="#2a1d14" />
          <circle cx="56.3" cy="50" r="1" fill="#2a1d14" />
        </g>
      )}
      {/* nose and mouth */}
      <path d="M50 50.5 L48.6 57.4 Q50 58.4 51.4 57.4" stroke={shade(skin, -0.35)} strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <path d={female ? 'M46.6 62 Q50 63.6 53.4 62' : 'M46.4 62.2 Q50 63.2 53.6 62.2'} stroke={female ? '#9a4a44' : shade(skin, -0.45)} strokeWidth={female ? 1.3 : 1} fill="none" strokeLinecap="round" />
      {age > 50 ? <path d="M42 55 q1.5 3 0.5 6 M58 55 q-1.5 3 -0.5 6" stroke={shade(skin, -0.25)} strokeWidth="0.5" fill="none" /> : null}
      {/* cheeks */}
      <ellipse cx="42.5" cy="57" rx="3" ry="2" fill="#c0504a" opacity={female ? 0.18 : 0.08} />
      <ellipse cx="57.5" cy="57" rx="3" ry="2" fill="#c0504a" opacity={female ? 0.18 : 0.08} />
    </g>
  );
}

function BackHair({ st, hair, female }: { st: PortraitStyle; hair: string; female: boolean }) {
  if (st === 'euro_female') return <path d="M31 50 Q30 76 38 86 L62 86 Q70 76 69 50 Q62 30 50 30 Q38 30 31 50 Z" fill={hair} />;
  if (female && !['arab', 'persian', 'ottoman'].includes(st)) return <path d="M33 50 Q31 80 36 92 L64 92 Q69 80 67 50 Q60 32 50 32 Q40 32 33 50 Z" fill={hair} />;
  if (st === 'euro' || st === 'euro_crown') return <g fill="#e9e4da"><ellipse cx="34.5" cy="55" rx="5" ry="9" /><ellipse cx="65.5" cy="55" rx="5" ry="9" /><path d="M58 64 q6 6 2 14 q-3 -4 -5 -8 z" fill="#d8d2c4" /></g>;
  if (st === 'japan' || st === 'qing') return null;
  return null;
}

function Body({ st, uid, cloth, cloth2, skin, r }: { st: PortraitStyle; uid: string; cloth: string; cloth2: string; skin: string; r: () => number }) {
  const coat = `url(#cl${uid})`;
  const shoulders = 'M8 120 Q10 88 30 82 Q40 78 50 80 Q60 78 70 82 Q90 88 92 120 Z';
  switch (st) {
    case 'euro':
    case 'republic':
      return (
        <g>
          <path d={shoulders} fill={coat} />
          <path d="M40 80 L50 104 L60 80 Q55 78 50 79 Q45 78 40 80 Z" fill="#ece6d8" />
          <path d="M44 80 Q50 92 56 80 Q53 86 50 86 Q47 86 44 80 Z" fill="#fff" />
          <path d="M36 82 L48 108 L40 120 M64 82 L52 108 L60 120" stroke={shade(cloth, -0.5)} strokeWidth="1.2" fill="none" />
        </g>
      );
    case 'euro_mil': {
      const uniform = pickOf(r, ['#1f3a8a', '#9b1c1c', '#e8e4da', '#1b4d2e', '#2a3242']);
      return (
        <g>
          <path d={shoulders} fill={uniform} />
          <rect x="16" y="84" width="16" height="5" rx="2.5" fill="#d9b46b" transform="rotate(-14 24 86)" />
          <rect x="68" y="84" width="16" height="5" rx="2.5" fill="#d9b46b" transform="rotate(14 76 86)" />
          <path d="M41 80 Q50 86 59 80 L58 86 Q50 90 42 86 Z" fill="#d9b46b" />
          <path d="M28 96 L72 118" stroke={pickOf(r, ['#c8102e', '#2f5d9a', '#e8c547'])} strokeWidth="5" />
          <g fill="#f0d48f">{[92, 100, 108, 116].map((y) => <circle key={y} cx="50" cy={y} r="1.3" />)}</g>
        </g>
      );
    }
    case 'euro_crown':
      return (
        <g>
          <path d={shoulders} fill="#f3efe6" />
          <path d="M22 120 Q26 96 38 86 L50 92 L62 86 Q74 96 78 120 Z" fill={cloth} />
          <g fill="#111">{Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${14 + (i % 7) * 11} ${94 + Math.floor(i / 7) * 12} l1.2 3 l-1.2 1 l-1.2 -1 z`} />)}</g>
          <circle cx="50" cy="102" r="3.5" fill="#d9b46b" stroke="#8a6a32" strokeWidth="0.6" />
          <path d="M34 86 Q50 96 66 86" stroke="#d9b46b" strokeWidth="2" fill="none" />
        </g>
      );
    case 'euro_female':
      return (
        <g>
          <path d={shoulders} fill={coat} />
          <path d="M30 84 Q50 104 70 84 Q60 80 50 80 Q40 80 30 84 Z" fill={skin} />
          <path d="M30 84 Q50 106 70 84" stroke="#f1ead9" strokeWidth="2.6" fill="none" />
          <g fill="#f6f1e4">{Array.from({ length: 9 }, (_, i) => <circle key={i} cx={40 + i * 2.5} cy={84 + Math.sin((i / 8) * Math.PI) * 5} r="1.1" />)}</g>
        </g>
      );
    case 'cleric':
      return (
        <g>
          <path d={shoulders} fill={pickOf(r, ['#7a1f2b', '#e8e2d4', '#1d1a1a'])} />
          <path d="M30 86 Q50 96 70 86 L70 92 Q50 100 30 92 Z" fill="#c8102e" opacity="0.85" />
          <path d="M50 92 V112 M44 99 H56" stroke="#d9b46b" strokeWidth="2.4" />
        </g>
      );
    case 'turban':
    case 'rajput':
    case 'sikh':
      return (
        <g>
          <path d={shoulders} fill={st === 'sikh' ? pickOf(r, ['#e8e2d4', '#1f3a5f', '#e8902e']) : coat} />
          <path d="M42 80 Q50 98 58 80" stroke={shade(cloth, 0.3)} strokeWidth="1.4" fill="none" />
          <g fill="#f3ead2">{Array.from({ length: 8 }, (_, i) => <circle key={i} cx={38 + i * 3.4} cy={88 + Math.sin((i / 7) * Math.PI) * 8} r="1.3" />)}</g>
          {st === 'rajput' ? <g fill="#3fae6a">{[0, 1, 2].map((i) => <circle key={i} cx={46 + i * 4} cy={97} r="1.4" />)}</g> : null}
          {st === 'sikh' ? <path d="M30 84 L70 116" stroke="#3a2a1a" strokeWidth="2.6" /> : null}
        </g>
      );
    case 'ottoman':
    case 'persian':
    case 'arab':
      return (
        <g>
          <path d={shoulders} fill={st === 'arab' ? '#e9e1cc' : coat} />
          {st !== 'arab' ? <path d="M14 120 Q16 92 32 84 L40 82 L44 120 Z M86 120 Q84 92 68 84 L60 82 L56 120 Z" fill={st === 'ottoman' ? '#6b4f30' : shade(cloth2, -0.2)} /> : <path d="M22 120 Q24 94 40 84 L50 94 L60 84 Q76 94 78 120 Z" fill={shade(cloth2, -0.25)} />}
          {st === 'ottoman' ? <g stroke="#d9b46b" strokeWidth="1.2">{[92, 100, 108].map((y) => <path key={y} d={`M44 ${y} H56`} />)}</g> : null}
        </g>
      );
    case 'qing':
      return (
        <g>
          <path d={shoulders} fill={pickOf(r, ['#1f2f5a', '#3a2a1a', '#5b2a4a'])} />
          <path d="M26 86 Q50 106 74 86 Q74 96 50 112 Q26 96 26 86 Z" fill="#1d2440" stroke="#d9b46b" strokeWidth="1" />
          <rect x="40" y="96" width="20" height="16" fill="#d9b46b" opacity="0.85" />
          <path d="M44 100 q6 6 12 0 M44 106 q6 -4 12 0" stroke="#7a1f2b" strokeWidth="1" fill="none" />
          <g fill="#7a3a2a">{Array.from({ length: 10 }, (_, i) => <circle key={i} cx={34 + i * 3.5} cy={88 + Math.sin((i / 9) * Math.PI) * 14} r="1.4" />)}</g>
        </g>
      );
    case 'joseon':
      return (
        <g>
          <path d={shoulders} fill={pickOf(r, ['#e9e4d8', '#3f6e8c', '#7a1f2b'])} />
          <path d="M40 80 L50 100 L60 80" stroke="#f3efe6" strokeWidth="3" fill="none" />
        </g>
      );
    case 'japan':
      return (
        <g>
          <path d="M2 96 L30 82 L50 86 L70 82 L98 96 L96 104 L66 92 L50 120 L34 92 L4 104 Z" fill={shade(cloth, -0.1)} />
          <path d={shoulders} fill={pickOf(r, ['#2a2f3a', '#3a2a1a', '#1f3a2f'])} />
          <path d="M40 80 L50 104 L60 80" stroke="#efe8d8" strokeWidth="2.4" fill="none" />
          <circle cx="32" cy="94" r="3" fill="none" stroke="#efe8d8" strokeWidth="0.8" />
          <circle cx="68" cy="94" r="3" fill="none" stroke="#efe8d8" strokeWidth="0.8" />
        </g>
      );
    case 'sea_asian':
      return (
        <g>
          <path d={shoulders} fill={coat} />
          <g stroke={shade(cloth2, 0.25)} strokeWidth="1.2" fill="none">{[90, 98, 106, 114].map((y) => <path key={y} d={`M12 ${y} Q30 ${y - 4} 50 ${y} T88 ${y}`} />)}</g>
          <path d="M40 80 Q50 92 60 80" stroke="#d9b46b" strokeWidth="2" fill="none" />
        </g>
      );
    case 'african':
    case 'african_crown': {
      const stripes = ['#d9a400', '#1f6b3a', '#c8102e', '#1a1a1a'];
      return (
        <g>
          <path d={shoulders} fill={cloth} />
          <g>{Array.from({ length: 10 }, (_, i) => <rect key={i} x={6 + i * 9} y="86" width="4.5" height="34" fill={stripes[i % stripes.length]} opacity="0.85" />)}</g>
          <path d="M8 86 H92" stroke="#d9a400" strokeWidth="2" />
          {st === 'african_crown' ? <g fill="#d9b46b">{Array.from({ length: 9 }, (_, i) => <circle key={i} cx={36 + i * 3.5} cy={86 + Math.sin((i / 8) * Math.PI) * 9} r="1.8" />)}</g> : null}
        </g>
      );
    }
    case 'steppe':
      return (
        <g>
          <path d={shoulders} fill={coat} />
          <path d="M18 92 Q34 80 50 84 Q66 80 82 92 L80 100 Q66 90 50 94 Q34 90 20 100 Z" fill="#8a6a4a" />
        </g>
      );
    case 'council': {
      const pattern = pickOf(r, ['#7a1f2b', '#1f3a5f', '#2f5d3a', '#8b4a1e']);
      return (
        <g>
          <path d={shoulders} fill={pattern} />
          <g fill="#e8d8b5">{Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${14 + i * 14} 104 l6 -6 l6 6 l-6 6 z`} opacity="0.75" />)}</g>
          <g fill="#f3ead2">{Array.from({ length: 11 }, (_, i) => <rect key={i} x={36 + i * 2.6} y={83 + Math.sin((i / 10) * Math.PI) * 6} width="1.6" height="5" rx="0.8" />)}</g>
        </g>
      );
    }
    case 'himalayan':
      return (
        <g>
          <path d={shoulders} fill={pickOf(r, ['#7a1f2b', '#b5652a', '#5b2a4a'])} />
          <path d="M30 84 L70 116" stroke="#d9b46b" strokeWidth="5" />
          <path d="M70 84 L30 116" stroke={shade(cloth2, -0.2)} strokeWidth="4" />
        </g>
      );
    default:
      return <path d={shoulders} fill={coat} />;
  }
}

function Headgear({ st, uid, hair, cloth, cloth2, r, female }: { st: PortraitStyle; uid: string; hair: string; cloth: string; cloth2: string; r: () => number; female: boolean }) {
  const gold = `url(#gd${uid})`;
  switch (st) {
    case 'euro':
      return <path d="M34 48 Q34 30 50 29 Q66 30 66 48 Q62 38 50 37 Q38 38 34 48 Z" fill="#ece7dd" />;
    case 'republic':
    case 'euro_mil':
      return <path d="M34 48 Q33 30 50 29 Q67 30 66 48 Q64 40 58 38 Q50 33 40 38 Q36 41 34 48 Z" fill={hair} />;
    case 'euro_crown':
      return (
        <g>
          <path d="M34 48 Q34 30 50 29 Q66 30 66 48 Q62 38 50 37 Q38 38 34 48 Z" fill="#ece7dd" />
          <path d="M36 34 L35 20 L42 27 L50 16 L58 27 L65 20 L64 34 Z" fill={gold} stroke="#6b5226" strokeWidth="0.6" />
          <rect x="35" y="32" width="30" height="4.5" rx="1" fill={gold} />
          <g fill="#c8102e">{[42, 50, 58].map((x) => <circle key={x} cx={x} cy="34.2" r="1.3" />)}</g>
          <circle cx="50" cy="15" r="1.8" fill={gold} />
        </g>
      );
    case 'euro_female':
      return (
        <g>
          <path d="M33 50 Q31 28 50 26 Q69 28 67 50 Q64 36 50 35 Q36 36 33 50 Z" fill={hair} />
          <ellipse cx="50" cy="24" rx="10" ry="7" fill={hair} />
          {r() < 0.5 ? <path d="M40 26 L42 18 L46 23 L50 16 L54 23 L58 18 L60 26 Z" fill={gold} /> : <g fill="#f3ead2">{[40, 45, 50, 55, 60].map((x) => <circle key={x} cx={x} cy={28 + Math.abs(50 - x) * 0.15} r="1.1" />)}</g>}
        </g>
      );
    case 'cleric':
      return r() < 0.5
        ? <path d="M40 34 Q40 12 50 8 Q60 12 60 34 Z" fill="#f3efe6" stroke="#d9b46b" strokeWidth="1.4" />
        : <path d="M36 38 Q36 30 50 29 Q64 30 64 38 Q50 34 36 38 Z" fill={pickOf(r, ['#c8102e', '#f3efe6', '#5b2a4a'])} />;
    case 'turban':
      return (
        <g>
          <path d="M31 42 Q30 22 50 20 Q72 22 69 42 Q60 36 50 37 Q40 36 31 42 Z" fill={pickOf(r, ['#e8e2d4', '#c8102e', '#e8a33a', '#3f6e8c'])} />
          <g stroke="#000" strokeOpacity="0.18" strokeWidth="1.2" fill="none"><path d="M33 34 Q50 26 67 34" /><path d="M32 39 Q50 31 68 38" /><path d="M36 28 Q50 22 64 28" /></g>
          <circle cx="50" cy="31" r="2.4" fill="#d9b46b" />
          <path d="M50 29 Q55 16 61 12 Q56 20 52 30 Z" fill="#f3efe6" />
        </g>
      );
    case 'rajput':
      return (
        <g>
          <path d="M31 42 Q30 24 48 21 Q70 20 70 38 Q62 34 50 36 Q40 36 31 42 Z" fill={pickOf(r, ['#e8a33a', '#c8102e', '#d94f8a', '#e8d24a'])} />
          <path d="M66 26 Q76 30 72 42 Q70 34 64 31 Z" fill={shade(cloth, 0.2)} />
          <g stroke="#000" strokeOpacity="0.18" strokeWidth="1" fill="none">{[26, 30, 34].map((y) => <path key={y} d={`M33 ${y + 4} Q50 ${y - 4} 68 ${y + 2}`} />)}</g>
          <path d="M45 30 L50 20 L55 30 Z" fill={gold} />
          <circle cx="50" cy="30.5" r="1.6" fill="#3fae6a" />
        </g>
      );
    case 'sikh':
      return (
        <g>
          <path d="M31 44 Q28 20 50 18 Q72 20 69 44 Q63 34 50 34 Q37 34 31 44 Z" fill={pickOf(r, ['#1f3a5f', '#e8902e', '#f3efe6', '#1d1d1d'])} />
          <path d="M34 40 Q42 24 50 22 M66 40 Q58 24 50 22" stroke="#000" strokeOpacity="0.2" strokeWidth="1.4" fill="none" />
          <path d="M46 26 Q50 22 54 26 L52 30 L48 30 Z" fill="#d9b46b" opacity="0.9" />
        </g>
      );
    case 'ottoman':
      return (
        <g>
          <ellipse cx="50" cy="30" rx="21" ry="12" fill="#f3efe6" />
          <g stroke="#000" strokeOpacity="0.15" strokeWidth="1.2" fill="none">{[24, 29, 34].map((y) => <path key={y} d={`M30 ${y + 2} Q50 ${y - 6} 70 ${y + 2}`} />)}</g>
          <path d="M42 24 Q42 8 50 6 Q58 8 58 24 Z" fill="#a8261f" />
          {r() < 0.6 ? <path d="M58 20 Q66 8 70 6 Q66 14 60 24 Z" fill="#f6f2ea" /> : null}
        </g>
      );
    case 'persian':
      return <g><path d="M35 40 L38 8 Q50 4 62 8 L65 40 Q50 36 35 40 Z" fill="#1a1715" /><path d="M38 12 Q50 8 62 12" stroke="#3a3330" strokeWidth="1" fill="none" /></g>;
    case 'arab':
      return (
        <g>
          <path d="M28 76 Q26 30 50 26 Q74 30 72 76 L64 80 Q66 50 60 42 Q50 38 40 42 Q34 50 36 80 Z" fill={female ? '#1d1d1d' : '#f3efe6'} />
          {!female ? <ellipse cx="50" cy="35" rx="17" ry="4.5" fill="none" stroke="#1d1d1d" strokeWidth="2.8" /> : null}
        </g>
      );
    case 'qing':
      return (
        <g>
          <path d="M30 40 Q50 18 70 40 Q50 36 30 40 Z" fill={pickOf(r, ['#e8d8b5', '#2a2a2a'])} />
          <path d="M34 38 Q50 26 66 38" stroke="#b8202b" strokeWidth="3.2" fill="none" />
          <circle cx="50" cy="24" r="2.6" fill={pickOf(r, ['#c8102e', '#3f6e8c', '#d9b46b'])} />
          <path d="M60 52 Q70 70 64 96" stroke="#1d1612" strokeWidth="2.6" fill="none" />
        </g>
      );
    case 'joseon':
      return (
        <g>
          <ellipse cx="50" cy="36" rx="29" ry="5" fill="#16130f" opacity="0.9" />
          <path d="M40 36 L41 20 Q50 17 59 20 L60 36 Z" fill="#16130f" opacity="0.92" />
          <path d="M38 40 Q36 56 40 64 M62 40 Q64 56 60 64" stroke="#16130f" strokeWidth="0.7" fill="none" />
        </g>
      );
    case 'japan':
      return female
        ? <g><path d="M32 50 Q30 26 50 24 Q70 26 68 50 Q62 34 50 34 Q38 34 32 50 Z" fill="#16130f" /><ellipse cx="50" cy="22" rx="12" ry="6" fill="#16130f" /><path d="M38 20 L62 26" stroke="#d9b46b" strokeWidth="1.2" /></g>
        : <g><path d="M34 46 Q34 30 50 30 Q66 30 66 46 Q60 38 50 38 Q40 38 34 46 Z" fill="#16130f" /><path d="M46 30 Q50 18 54 30 Z" fill="#16130f" /></g>;
    case 'sea_asian':
      return <g><path d="M32 42 Q32 26 50 25 Q68 26 68 42 Q50 36 32 42 Z" fill={pickOf(r, ['#1d1d1d', '#7a1f2b', '#3a2f22'])} /><path d="M33 40 Q50 32 67 40" stroke="#d9b46b" strokeWidth="1.2" fill="none" /><path d="M62 30 L70 22 L66 34 Z" fill={shade(cloth, 0.2)} /></g>;
    case 'african':
      return r() < 0.5
        ? <path d="M34 42 Q34 28 50 27 Q66 28 66 42 Q50 38 34 42 Z" fill={pickOf(r, ['#f3efe6', '#7a1f2b', '#1f3a5f', '#d9a400'])} />
        : <g><path d="M32 44 Q28 22 50 20 Q72 22 68 44 Q50 36 32 44 Z" fill={pickOf(r, ['#d9a400', '#c8102e', '#1f6b3a'])} /><path d="M36 30 Q50 22 64 30" stroke="#1a1a1a" strokeOpacity="0.3" strokeWidth="1.4" fill="none" /></g>;
    case 'african_crown':
      return (
        <g>
          <path d="M33 42 L34 22 Q50 14 66 22 L67 42 Q50 36 33 42 Z" fill={gold} stroke="#6b5226" strokeWidth="0.6" />
          <g fill="#1f6b3a">{[40, 50, 60].map((x) => <path key={x} d={`M${x} 26 l2 3 l-2 3 l-2 -3 z`} />)}</g>
          <path d="M34 36 Q50 30 66 36" stroke="#c8102e" strokeWidth="1.6" fill="none" />
        </g>
      );
    case 'steppe':
      return (
        <g>
          <path d="M30 44 Q28 24 50 22 Q72 24 70 44 Q64 40 50 40 Q36 40 30 44 Z" fill="#8a6a4a" />
          <path d="M38 30 Q40 10 50 8 Q60 10 62 30 Z" fill={cloth} />
          <path d="M30 44 Q26 58 30 66 L34 64 Q32 54 34 44 Z M70 44 Q74 58 70 66 L66 64 Q68 54 66 44 Z" fill="#8a6a4a" />
        </g>
      );
    case 'council':
      return (
        <g>
          <path d="M33 50 Q31 30 50 29 Q69 30 67 50 Q62 38 50 38 Q38 38 33 50 Z" fill={hair} />
          <path d="M30 54 Q28 76 32 90 L36 90 Q33 72 35 54 Z M70 54 Q72 76 68 90 L64 90 Q67 72 65 54 Z" fill={hair} />
          <path d="M33 38 Q50 32 67 38" stroke={pickOf(r, ['#c8102e', '#1f3a5f', '#d9a400'])} strokeWidth="2.6" fill="none" />
          {Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => (
            <path key={i} d={`M${60 + i * 3} 34 Q${66 + i * 4} ${16 - i * 2} ${64 + i * 5} ${6 + i * 2} Q${62 + i * 3} 20 ${58 + i * 3} 34 Z`} fill="#f3efe6" stroke="#1d1d1d" strokeWidth="0.5" />
          ))}
        </g>
      );
    case 'himalayan':
      return (
        <g>
          <path d="M30 42 Q30 26 50 24 Q70 26 70 42 Q50 36 30 42 Z" fill="#d9a400" />
          <path d="M30 42 Q50 34 70 42 L70 46 Q50 38 30 46 Z" fill="#8a6a4a" />
          <path d="M46 24 Q50 14 54 24 Z" fill="#c8102e" />
        </g>
      );
    default:
      return null;
  }
}
