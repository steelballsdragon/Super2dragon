// Small decorative pieces: gilt corners, dividers, wax seals and the crown device.
import type { CSSProperties } from 'react';

export function Corner({ className, style, flip = '' }: { className?: string; style?: CSSProperties; flip?: '' | 'x' | 'y' | 'xy' }) {
  const t = flip === 'x' ? 'scale(-1 1) translate(-40 0)' : flip === 'y' ? 'scale(1 -1) translate(0 -40)' : flip === 'xy' ? 'scale(-1 -1) translate(-40 -40)' : undefined;
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" className={className} style={style} aria-hidden>
      <g transform={t} fill="none" stroke="#d9b46b" strokeWidth="1.1" strokeLinecap="round">
        <path d="M2 38 V8 Q2 2 8 2 H38" />
        <path d="M6 38 V12 Q6 6 12 6 H38" strokeOpacity="0.45" />
        <path d="M10 16 Q10 10 16 10 Q14 14 18 16 Q14 18 10 16 Z" fill="#d9b46b" fillOpacity="0.35" />
        <circle cx="8" cy="8" r="1.6" fill="#d9b46b" />
      </g>
    </svg>
  );
}

/** A frame of four gilt corners placed over a positioned container. */
export function GiltFrame({ inset = 4, size = 28 }: { inset?: number; size?: number }) {
  const s = { width: size, height: size, position: 'absolute' as const, pointerEvents: 'none' as const };
  return (
    <>
      <Corner style={{ ...s, left: inset, top: inset }} />
      <Corner style={{ ...s, right: inset, top: inset }} flip="x" />
      <Corner style={{ ...s, left: inset, bottom: inset }} flip="y" />
      <Corner style={{ ...s, right: inset, bottom: inset }} flip="xy" />
    </>
  );
}

export function Divider({ className, color = '#d9b46b' }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 300 14" className={className} preserveAspectRatio="none" aria-hidden style={{ width: '100%', height: 14 }}>
      <path d="M0 7 H128 M172 7 H300" stroke={color} strokeOpacity="0.5" strokeWidth="1" />
      <path d="M134 7 L150 1 L166 7 L150 13 Z" fill="none" stroke={color} strokeWidth="1" />
      <circle cx="150" cy="7" r="2.2" fill={color} />
      <circle cx="128" cy="7" r="1.4" fill={color} />
      <circle cx="172" cy="7" r="1.4" fill={color} />
    </svg>
  );
}

/** A red wax seal with an initial or a small device. */
export function Seal({ letter = 'R', size = 48, color = '#8e2a24', className }: { letter?: string; size?: number; color?: string; className?: string }) {
  const lobes = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const rr = i % 2 ? 21 : 23.5;
    return `${25 + rr * Math.cos(a)},${25 + rr * Math.sin(a)}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 50 50" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id="seal-g" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#c4483f" />
          <stop offset="1" stopColor={color} />
        </radialGradient>
      </defs>
      <polygon points={lobes} fill="url(#seal-g)" />
      <circle cx="25" cy="25" r="15.5" fill="none" stroke="#5c1813" strokeWidth="1.2" strokeOpacity="0.7" />
      <circle cx="25" cy="25" r="13" fill="none" stroke="#f0b3a8" strokeWidth="0.5" strokeOpacity="0.35" />
      <text x="25" y="30.5" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="15" fontWeight="700" fill="#5c1813" fillOpacity="0.8">{letter.slice(0, 1).toUpperCase()}</text>
      <ellipse cx="18" cy="15" rx="5" ry="2.4" fill="#fff" opacity="0.12" transform="rotate(-30 18 15)" />
    </svg>
  );
}

export function CrownMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 40 30" width={size} height={(size * 30) / 40} className={className} aria-hidden>
      <path d="M4 24 L2 6 L12 14 L20 2 L28 14 L38 6 L36 24 Z" fill="#d9b46b" stroke="#8a6a32" strokeWidth="1" />
      <rect x="4" y="24" width="32" height="4" rx="1" fill="#d9b46b" stroke="#8a6a32" strokeWidth="1" />
      <circle cx="20" cy="17" r="2.2" fill="#8e2a24" />
      <circle cx="11" cy="20" r="1.4" fill="#2f5d9a" />
      <circle cx="29" cy="20" r="1.4" fill="#2f5d9a" />
    </svg>
  );
}

/** A compass rose for the map and atlas. */
export function CompassRose({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} className={className} aria-hidden>
      <circle r="44" fill="none" stroke="#d9b46b" strokeOpacity="0.5" strokeWidth="1" />
      <circle r="38" fill="none" stroke="#d9b46b" strokeOpacity="0.25" strokeWidth="0.6" />
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 -42 L6 -6 L0 0 Z" fill="#d9b46b" />
          <path d="M0 -42 L-6 -6 L0 0 Z" fill="#8a6a32" />
        </g>
      ))}
      {[45, 135, 225, 315].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 -28 L4 -4 L0 0 Z" fill="#e8d8b5" fillOpacity="0.8" />
          <path d="M0 -28 L-4 -4 L0 0 Z" fill="#b7a582" fillOpacity="0.8" />
        </g>
      ))}
      <text y="-46" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="9" fill="#d9b46b">N</text>
    </svg>
  );
}
