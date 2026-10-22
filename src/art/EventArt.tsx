// Engraving-style vignettes for event, battle and treaty cards. Original vector art.
import { memo } from 'react';
import type { Illustration } from '../game/events/defs';

const INK = '#2b2116';
const WASH = '#8a6a44';

export const EventArt = memo(function EventArt({ kind, className, seed = 0 }: { kind: Illustration | 'succession' | 'victory' | 'defeat'; className?: string; seed?: number }) {
  const sky = SKY[kind] ?? ['#e9d6ab', '#c9a56a'];
  const id = `ea-${kind}-${seed}`;
  return (
    <svg viewBox="0 0 640 260" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
        <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <path d="M0 0 V6" stroke={INK} strokeOpacity="0.16" strokeWidth="1" />
        </pattern>
        <radialGradient id={`${id}-vig`} cx="0.5" cy="0.45" r="0.7">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#3b2a14" stopOpacity="0.55" />
        </radialGradient>
        <filter id={`${id}-smoke`}><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <rect width="640" height="260" fill={`url(#${id}-sky)`} />
      <rect width="640" height="150" fill={`url(#${id}-hatch)`} opacity="0.6" />
      <g stroke={INK} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <Scene kind={kind} id={id} />
      </g>
      <rect width="640" height="260" fill={`url(#${id}-vig)`} />
      <rect x="6" y="6" width="628" height="248" fill="none" stroke={INK} strokeOpacity="0.55" strokeWidth="1.5" />
      <rect x="11" y="11" width="618" height="238" fill="none" stroke={INK} strokeOpacity="0.25" strokeWidth="0.8" />
    </svg>
  );
});

const SKY: Record<string, [string, string]> = {
  battle: ['#e2c79a', '#b88a52'], fleet: ['#e2d0aa', '#a98a5e'], revolution: ['#ecc28a', '#b46a3c'], disaster: ['#c9b48e', '#7d6a4f'],
  famine: ['#e6cf9c', '#bc9a5c'], epidemic: ['#cdbf9f', '#8c7a5c'], industry: ['#d8c39a', '#9a8460'], defeat: ['#cdb894', '#8a7354'],
};

function Ground({ y = 205, fill = WASH }: { y?: number; fill?: string }) {
  return <path d={`M0 ${y} Q160 ${y - 8} 320 ${y} T640 ${y} V260 H0 Z`} fill={fill} fillOpacity="0.55" stroke="none" />;
}

function Figure({ x, y, s = 1, hat = 'tricorne', arm = 0 }: { x: number; y: number; s?: number; hat?: 'tricorne' | 'turban' | 'none' | 'crown' | 'shako'; arm?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={INK} stroke="none">
      <circle cx="0" cy="-46" r="6" />
      <path d="M-8 -38 Q0 -42 8 -38 L10 -12 L6 -12 L5 0 L1 0 L0 -12 L-1 0 L-5 0 L-6 -12 L-10 -12 Z" />
      <path d={`M8 -36 L${16 + arm} ${-24 - arm * 2}`} stroke={INK} strokeWidth="3" />
      {hat === 'tricorne' ? <path d="M-9 -50 Q0 -58 9 -50 L6 -48 Q0 -52 -6 -48 Z" /> : null}
      {hat === 'turban' ? <ellipse cx="0" cy="-51" rx="8" ry="5" /> : null}
      {hat === 'crown' ? <path d="M-6 -51 L-6 -58 L-3 -54 L0 -59 L3 -54 L6 -58 L6 -51 Z" fill="#8a6a32" /> : null}
      {hat === 'shako' ? <rect x="-5" y="-60" width="10" height="10" /> : null}
    </g>
  );
}

function Ship({ x, y, s = 1, fire = false }: { x: number; y: number; s?: number; fire?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-70 0 Q-60 16 -40 18 L50 18 Q66 12 76 -4 L40 0 L-30 2 Z" fill={INK} stroke="none" />
      {[-34, 0, 32].map((mx, i) => (
        <g key={i}>
          <path d={`M${mx} 2 V${-86 + Math.abs(mx) * 0.3}`} strokeWidth="2" />
          <path d={`M${mx - 20} ${-70 + Math.abs(mx) * 0.3} Q${mx} ${-76 + Math.abs(mx) * 0.3} ${mx + 20} ${-70 + Math.abs(mx) * 0.3} L${mx + 16} ${-46} Q${mx} ${-50} ${mx - 16} ${-46} Z`} fill="#efe2c2" strokeWidth="1.2" />
          <path d={`M${mx - 24} ${-40} Q${mx} ${-46} ${mx + 24} ${-40} L${mx + 20} ${-12} Q${mx} ${-16} ${mx - 20} ${-12} Z`} fill="#efe2c2" strokeWidth="1.2" />
        </g>
      ))}
      <path d="M-62 8 H60" stroke="#efe2c2" strokeWidth="1" />
      {fire ? <g fill="#f3e6c8" stroke="none" opacity="0.85">{[-40, -20, 0, 20, 40].map((fx) => <circle key={fx} cx={fx} cy={14} r={9} />)}</g> : null}
    </g>
  );
}

function Scene({ kind, id }: { kind: string; id: string }) {
  switch (kind) {
    case 'battle':
    case 'victory':
    case 'defeat':
      return (
        <>
          <Ground y={200} />
          <g filter={`url(#${id}-smoke)`} fill="#f3e6c8" stroke="none" opacity="0.85">
            <ellipse cx="200" cy="168" rx="90" ry="26" /><ellipse cx="430" cy="160" rx="110" ry="30" /><ellipse cx="320" cy="140" rx="70" ry="20" />
          </g>
          {Array.from({ length: 9 }, (_, i) => <Figure key={`a${i}`} x={60 + i * 22} y={204} s={0.9} hat="shako" arm={4} />)}
          {Array.from({ length: 9 }, (_, i) => <Figure key={`b${i}`} x={400 + i * 22} y={206} s={0.85} hat="tricorne" arm={4} />)}
          <path d="M160 204 V120" strokeWidth="2" /><path d="M160 120 L196 128 L160 138 Z" fill="#8e2a24" stroke="none" />
          <path d="M520 206 V118" strokeWidth="2" /><path d="M520 118 L556 126 L520 136 Z" fill="#1f3a5f" stroke="none" />
          <g transform="translate(300 214)"><circle cx="0" cy="0" r="10" strokeWidth="2.5" /><path d="M-4 -4 L46 -18" strokeWidth="6" /><path d="M-22 6 L10 -2" strokeWidth="3" /></g>
          {kind === 'defeat' ? <path d="M40 240 L600 240" strokeOpacity="0.4" strokeWidth="1" /> : null}
        </>
      );
    case 'fleet':
      return (
        <>
          <rect y="170" width="640" height="90" fill={WASH} fillOpacity="0.45" stroke="none" />
          {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${(i * 71) % 620} ${185 + (i % 4) * 16} q10 -4 20 0 q10 4 20 0`} strokeOpacity="0.5" />)}
          <g filter={`url(#${id}-smoke)`} fill="#f3e6c8" stroke="none" opacity="0.8"><ellipse cx="330" cy="160" rx="140" ry="30" /></g>
          <Ship x={190} y={170} s={1} fire />
          <Ship x={470} y={176} s={0.85} fire />
          <Ship x={600} y={190} s={0.5} />
        </>
      );
    case 'palace':
    case 'succession':
      return (
        <>
          <Ground y={214} />
          <rect x="130" y="110" width="380" height="104" fill="#efe2c2" />
          <path d="M260 110 Q260 52 320 36 Q380 52 380 110 Z" fill="#efe2c2" />
          <path d="M320 36 V18" /><circle cx="320" cy="16" r="3" fill={INK} />
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${150 + i * 52} 214 V160 Q${150 + i * 52} 142 ${166 + i * 52} 136 Q${182 + i * 52} 142 ${182 + i * 52} 160 V214`} fill="#c9a56a" fillOpacity="0.6" />)}
          <path d="M120 110 H520" strokeWidth="2" />
          {[110, 530].map((x) => <g key={x}><rect x={x - 12} y="70" width="24" height="144" fill="#efe2c2" /><path d={`M${x - 16} 72 Q${x} 44 ${x + 16} 72 Z`} fill="#efe2c2" /></g>)}
          <g transform="translate(320 214)"><rect x="-26" y="-50" width="52" height="50" fill="#8e2a24" fillOpacity="0.7" /><path d="M-30 -50 Q0 -70 30 -50" strokeWidth="2" /></g>
          <Figure x={320} y={212} s={0.9} hat="crown" />
          <Figure x={250} y={214} s={0.8} hat="none" /><Figure x={390} y={214} s={0.8} hat="none" />
        </>
      );
    case 'council':
      return (
        <>
          <rect y="0" width="640" height="260" fill="#c9a56a" fillOpacity="0.35" stroke="none" />
          {[90, 550].map((x) => <g key={x}><path d={`M${x - 40} 200 V60 Q${x} 20 ${x + 40} 60 V200`} fill="#efe2c2" fillOpacity="0.7" /><path d={`M${x - 30} 70 H${x + 30} M${x} 40 V200`} strokeOpacity="0.4" /></g>)}
          <path d="M150 170 L490 170 L520 200 L120 200 Z" fill="#6b4a26" fillOpacity="0.85" />
          <path d="M240 168 L400 168 L410 176 L230 176 Z" fill="#efe2c2" stroke="none" />
          <path d="M260 172 q20 -6 40 0 t40 0 t40 0" strokeOpacity="0.6" strokeWidth="0.8" />
          {Array.from({ length: 7 }, (_, i) => <Figure key={i} x={170 + i * 50} y={176} s={0.8} hat={i % 3 === 0 ? 'turban' : i % 3 === 1 ? 'tricorne' : 'none'} arm={i % 2 ? 2 : -2} />)}
          {[200, 440].map((x) => <g key={x}><path d={`M${x} 168 V150`} strokeWidth="3" /><path d={`M${x} 146 q-3 -6 0 -10 q3 4 0 10`} fill="#e6a85a" stroke="none" /></g>)}
        </>
      );
    case 'marriage':
      return (
        <>
          <Ground y={212} />
          <path d="M200 212 V90 Q320 10 440 90 V212" strokeWidth="3" fill="none" />
          <path d="M214 212 V96 Q320 26 426 96 V212" strokeOpacity="0.4" />
          {Array.from({ length: 14 }, (_, i) => { const a = Math.PI * (i / 13); return <circle key={i} cx={320 - Math.cos(a) * 118} cy={92 - Math.sin(a) * 66} r="6" fill="#b5652a" fillOpacity="0.55" />; })}
          <Figure x={292} y={210} s={1.1} hat="crown" arm={6} />
          <g transform="translate(348 210) scale(1.1)" fill={INK} stroke="none"><circle cx="0" cy="-46" r="6" /><path d="M-6 -40 Q0 -42 6 -40 L18 0 L-18 0 Z" /><path d="M-6 -51 L-6 -57 L-3 -53 L0 -58 L3 -53 L6 -57 L6 -51 Z" fill="#8a6a32" /></g>
          {[150, 490].map((x) => <g key={x}><path d={`M${x} 212 V150`} strokeWidth="2" /><circle cx={x} cy={144} r="16" fill="#2f5d3a" fillOpacity="0.5" /></g>)}
        </>
      );
    case 'discovery':
      return (
        <>
          <rect y="160" width="640" height="100" fill="#6b4a26" fillOpacity="0.55" stroke="none" />
          <g transform="translate(220 112)"><circle r="62" fill="#efe2c2" strokeWidth="2" /><ellipse rx="62" ry="22" strokeOpacity="0.5" /><ellipse rx="24" ry="62" strokeOpacity="0.5" /><path d="M-62 0 H62 M0 -62 V62" strokeOpacity="0.4" /><path d="M-30 -30 q20 10 18 30 q-4 20 14 30 M10 -46 q20 4 26 24" strokeWidth="1.6" /><path d="M-70 70 L70 70 M0 62 V70" strokeWidth="3" /></g>
          <g transform="translate(430 150) rotate(-28)"><rect x="-80" y="-9" width="150" height="18" rx="4" fill="#c9a56a" strokeWidth="2" /><rect x="70" y="-12" width="22" height="24" rx="3" fill={INK} /></g>
          <path d="M392 160 L410 214 M428 156 L420 214 M440 160 L460 214" strokeWidth="2" />
          <path d="M470 196 L560 196 L556 214 L474 214 Z" fill="#efe2c2" /><path d="M515 196 V214" />
          {Array.from({ length: 6 }, (_, i) => <circle key={i} cx={520 + (i % 3) * 30} cy={40 + Math.floor(i / 3) * 30} r="1.8" fill={INK} stroke="none" />)}
        </>
      );
    case 'revolution':
      return (
        <>
          <circle cx="320" cy="150" r="70" fill="#f3d58e" fillOpacity="0.8" stroke="none" />
          {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M320 150 L${320 + Math.cos(Math.PI + (i / 11) * Math.PI) * 300} ${150 + Math.sin(Math.PI + (i / 11) * Math.PI) * 300}`} strokeOpacity="0.15" strokeWidth="6" />)}
          <Ground y={208} />
          <path d="M60 230 L140 196 L200 214 L250 190 L300 210 L360 192 L420 212 L480 194 L560 222 L600 230 Z" fill="#6b4a26" fillOpacity="0.8" />
          {Array.from({ length: 14 }, (_, i) => <Figure key={i} x={70 + i * 38} y={200 - (i % 3) * 4} s={0.75 + (i % 2) * 0.1} hat={i % 4 === 0 ? 'none' : 'tricorne'} arm={8} />)}
          {[150, 330, 490].map((x, i) => <g key={x}><path d={`M${x} 196 V${70 + i * 10}`} strokeWidth="2.4" /><path d={`M${x} ${70 + i * 10} L${x + 50} ${80 + i * 10} L${x} ${100 + i * 10} Z`} fill={i === 1 ? '#8e2a24' : '#1f3a5f'} stroke="none" /></g>)}
          {[230, 410].map((x) => <path key={x} d={`M${x} 200 L${x + 6} 110 M${x + 2} 112 l4 -10 l4 10`} strokeWidth="2" />)}
        </>
      );
    case 'disaster':
      return (
        <>
          <g fill="#5b4e3e" fillOpacity="0.55" stroke="none"><ellipse cx="200" cy="50" rx="200" ry="40" /><ellipse cx="480" cy="40" rx="220" ry="44" /></g>
          <path d="M360 30 L330 100 L352 102 L318 170" strokeWidth="3.4" stroke="#f3e6c8" />
          <path d="M0 200 Q80 160 160 196 T320 190 T480 196 T640 186 V260 H0 Z" fill={WASH} fillOpacity="0.7" stroke="none" />
          {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${i * 84} ${206 + (i % 2) * 10} q20 -18 40 0 q-10 -6 -20 -2`} strokeWidth="1.6" />)}
          <g transform="translate(470 196)"><path d="M-40 0 V-50 L0 -80 L40 -50 V0" fill="#efe2c2" strokeWidth="2" /><path d="M-40 -50 L10 -40 L40 -50" strokeWidth="2" /><path d="M-10 0 V-24 H10 V0" /></g>
          {Array.from({ length: 40 }, (_, i) => <path key={i} d={`M${(i * 37) % 640} ${(i * 23) % 150} l-6 16`} strokeOpacity="0.4" />)}
        </>
      );
    case 'famine':
      return (
        <>
          <circle cx="500" cy="70" r="36" fill="#f3d58e" stroke="none" opacity="0.9" />
          <Ground y={196} fill="#a07a44" />
          {Array.from({ length: 22 }, (_, i) => <path key={i} d={`M${30 + i * 28} 230 q${i % 2 ? 6 : -6} -20 ${i % 2 ? -4 : 4} -34 m0 10 l${i % 2 ? -8 : 8} -4`} strokeWidth="1.4" />)}
          <path d="M120 196 V150 L170 120 L220 150 V196 Z" fill="#efe2c2" strokeWidth="2" /><path d="M150 196 V168 H190 V196" />
          {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M${330 + i * 40} ${80 + (i % 2) * 20} q8 -8 16 0 q8 -8 16 0`} strokeWidth="1.8" />)}
          <Figure x={300} y={198} s={0.9} hat="none" arm={-6} /><Figure x={330} y={200} s={0.7} hat="none" arm={-6} />
        </>
      );
    case 'epidemic':
      return (
        <>
          <Ground y={210} />
          {Array.from({ length: 6 }, (_, i) => <g key={i} transform={`translate(${70 + i * 100} 210)`}><path d={`M-40 0 V${-70 - (i % 3) * 14} L0 ${-100 - (i % 3) * 14} L40 ${-70 - (i % 3) * 14} V0`} fill="#efe2c2" strokeWidth="1.6" /><rect x="-10" y="-30" width="20" height="30" fill={INK} fillOpacity="0.6" /><rect x="-26" y="-60" width="12" height="12" fill={INK} fillOpacity="0.4" /><rect x="14" y="-60" width="12" height="12" fill={INK} fillOpacity="0.4" /></g>)}
          <g filter={`url(#${id}-smoke)`} fill="#6b5c48" opacity="0.5" stroke="none"><ellipse cx="200" cy="60" rx="140" ry="24" /><ellipse cx="460" cy="48" rx="160" ry="22" /></g>
          <g transform="translate(330 232)"><path d="M-50 0 H40 L50 -20 H-40 Z" fill="#6b4a26" /><circle cx="-30" cy="4" r="10" /><circle cx="30" cy="4" r="10" /></g>
          <Figure x={410} y={232} s={0.8} hat="tricorne" arm={-4} />
          <path d="M426 200 V180" strokeWidth="1.6" /><rect x="420" y="170" width="12" height="12" fill="#e6a85a" />
        </>
      );
    case 'summit':
    case 'treaty':
      return kind === 'treaty' ? (
        <>
          <rect y="150" width="640" height="110" fill="#6b4a26" fillOpacity="0.6" stroke="none" />
          <path d="M170 60 Q320 50 470 60 L480 200 Q320 210 160 200 Z" fill="#f3e6c8" strokeWidth="2" />
          <path d="M150 52 Q160 60 170 60 L160 200 Q150 196 146 186 Z" fill="#e2cfa6" />
          {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M200 ${84 + i * 12} H${440 - (i % 3) * 30}`} strokeOpacity="0.45" strokeWidth="1.2" />)}
          {[240, 320, 400].map((x, i) => <g key={x}><circle cx={x} cy="186" r="14" fill={['#8e2a24', '#1f3a5f', '#2f5d3a'][i]} stroke="none" /><circle cx={x} cy="186" r="9" strokeOpacity="0.6" stroke="#f3e6c8" /><path d={`M${x - 6} 200 l-6 26 M${x + 6} 200 l6 26`} stroke={['#8e2a24', '#1f3a5f', '#2f5d3a'][i]} strokeWidth="4" /></g>)}
          <path d="M520 110 L470 196" strokeWidth="2" /><path d="M520 110 q30 -40 40 -76 q-30 30 -40 76" fill="#efe2c2" />
          <rect x="532" y="196" width="34" height="22" rx="4" fill={INK} />
        </>
      ) : (
        <>
          <rect y="0" width="640" height="260" fill="#c9a56a" fillOpacity="0.3" stroke="none" />
          {Array.from({ length: 5 }, (_, i) => <g key={i}><path d={`M${80 + i * 120} 200 V40`} strokeWidth="2" /><path d={`M${80 + i * 120} 44 h40 v28 h-40`} fill={['#8e2a24', '#1f3a5f', '#2f5d3a', '#d9b46b', '#5b2a4a'][i]} fillOpacity="0.8" stroke="none" /></g>)}
          <ellipse cx="320" cy="200" rx="210" ry="30" fill="#6b4a26" fillOpacity="0.85" />
          <ellipse cx="320" cy="196" rx="120" ry="12" fill="#efe2c2" stroke="none" />
          {Array.from({ length: 9 }, (_, i) => <Figure key={i} x={140 + i * 45} y={190 + Math.abs(4 - i) * 2} s={0.8} hat={i % 3 === 0 ? 'turban' : i % 3 === 1 ? 'tricorne' : 'crown'} arm={(i % 2 ? 1 : -1) * 4} />)}
        </>
      );
    case 'trade':
      return (
        <>
          <rect y="160" width="640" height="100" fill={WASH} fillOpacity="0.5" stroke="none" />
          <Ship x={420} y={170} s={0.8} />
          <Ship x={580} y={180} s={0.5} />
          <path d="M0 196 H260 V214 H0 Z" fill="#6b4a26" fillOpacity="0.9" />
          {Array.from({ length: 6 }, (_, i) => <rect key={i} x={20 + (i % 3) * 36} y={168 - Math.floor(i / 3) * 26} width="32" height="26" fill="#c9a56a" strokeWidth="1.6" />)}
          <g transform="translate(200 120)"><path d="M0 76 V0 M-40 10 H40" strokeWidth="2.4" /><path d="M-40 10 L-54 40 H-26 Z M40 10 L26 40 H54 Z" fill="#efe2c2" /><path d="M-20 76 H20" strokeWidth="3" /></g>
          <Figure x={150} y={196} s={0.8} hat="turban" arm={6} /><Figure x={250} y={196} s={0.8} hat="tricorne" arm={-6} />
        </>
      );
    case 'religion':
      return (
        <>
          {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M320 40 L${120 + i * 50} 260`} strokeOpacity="0.12" strokeWidth="10" />)}
          <Ground y={214} />
          <path d="M240 214 V110 Q240 60 320 44 Q400 60 400 110 V214 Z" fill="#efe2c2" strokeWidth="2" />
          <path d="M290 214 V150 Q290 126 320 116 Q350 126 350 150 V214" fill="#c9a56a" fillOpacity="0.6" />
          <path d="M320 44 V20" strokeWidth="2" /><circle cx="320" cy="16" r="4" fill={INK} />
          {[200, 440].map((x) => <g key={x}><rect x={x - 10} y="90" width="20" height="124" fill="#efe2c2" /><path d={`M${x - 12} 92 Q${x} 60 ${x + 12} 92 Z`} fill="#efe2c2" /></g>)}
          {Array.from({ length: 8 }, (_, i) => <Figure key={i} x={110 + i * 60 + (i > 3 ? 80 : 0)} y={232} s={0.6} hat={i % 2 ? 'turban' : 'none'} />)}
        </>
      );
    case 'industry':
      return (
        <>
          <g filter={`url(#${id}-smoke)`} fill="#5b4e3e" opacity="0.55" stroke="none"><ellipse cx="220" cy="40" rx="140" ry="26" /><ellipse cx="420" cy="30" rx="170" ry="24" /></g>
          <Ground y={214} fill="#7d6a4f" />
          {[160, 260, 380, 470].map((x, i) => <g key={x}><rect x={x - 9} y={60 + (i % 2) * 20} width="18" height={154 - (i % 2) * 20} fill="#8a6a44" strokeWidth="1.6" /><path d={`M${x - 10} ${62 + (i % 2) * 20} H${x + 10}`} strokeWidth="3" /></g>)}
          <path d="M100 214 V130 L160 110 V140 L220 120 V150 L280 130 V160 L340 140 V214 Z" fill="#efe2c2" strokeWidth="2" />
          {Array.from({ length: 6 }, (_, i) => <rect key={i} x={116 + i * 36} y="170" width="16" height="22" fill={INK} fillOpacity="0.55" />)}
          <g transform="translate(500 170)"><circle r="34" fill="#efe2c2" strokeWidth="2" /><circle r="8" fill={INK} />{Array.from({ length: 10 }, (_, i) => <rect key={i} x="-5" y="-42" width="10" height="10" fill={INK} transform={`rotate(${i * 36})`} />)}</g>
          <path d="M360 214 V170 H420 V214" fill="#c9a56a" fillOpacity="0.7" />
        </>
      );
    case 'construction':
      return (
        <>
          <Ground y={214} />
          <path d="M180 214 V110 H420 V214" fill="#efe2c2" fillOpacity="0.8" strokeWidth="2" />
          {Array.from({ length: 4 }, (_, i) => <path key={i} d={`M170 ${200 - i * 30} H430`} strokeWidth="1.6" strokeOpacity="0.8" />)}
          {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${170 + i * 52} 214 V86`} strokeWidth="1.6" />)}
          <path d="M470 214 V40 L560 60 M470 40 L440 70 M540 56 V110" strokeWidth="3" />
          <rect x="528" y="110" width="24" height="18" fill="#c9a56a" strokeWidth="1.6" />
          {Array.from({ length: 5 }, (_, i) => <rect key={i} x={60 + i * 26} y={194 - (i % 2) * 18} width="24" height="18" fill="#c9a56a" strokeWidth="1.4" />)}
          <Figure x={250} y={108} s={0.6} hat="none" arm={8} /><Figure x={360} y={168} s={0.6} hat="none" arm={-6} /><Figure x={500} y={214} s={0.8} hat="tricorne" arm={6} />
        </>
      );
    default:
      return <Ground />;
  }
}
