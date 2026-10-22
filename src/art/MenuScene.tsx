// The title-screen panorama: dusk over the world of 1800. A Mughal-Rajput palace, a European
// castle and a Qing hall share one horizon, with ships of the line in the bay and cavalry on
// the ridge. Original vector art.
import { memo } from 'react';

export const MenuScene = memo(function MenuScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="ms-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b121b" />
          <stop offset="0.38" stopColor="#1c2a3a" />
          <stop offset="0.62" stopColor="#6b4a36" />
          <stop offset="0.74" stopColor="#c98a45" />
          <stop offset="0.8" stopColor="#e6b067" />
        </linearGradient>
        <radialGradient id="ms-sun" cx="0.5" cy="0.69" r="0.42">
          <stop offset="0" stopColor="#ffe3a3" stopOpacity="0.95" />
          <stop offset="0.18" stopColor="#f2bf6e" stopOpacity="0.6" />
          <stop offset="0.55" stopColor="#c98a45" stopOpacity="0.12" />
          <stop offset="1" stopColor="#c98a45" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ms-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a6644" />
          <stop offset="0.25" stopColor="#3b3a3c" />
          <stop offset="1" stopColor="#0f1720" />
        </linearGradient>
        <linearGradient id="ms-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d5560" />
          <stop offset="1" stopColor="#3c3a44" />
        </linearGradient>
        <linearGradient id="ms-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2b33" />
          <stop offset="1" stopColor="#1b1d24" />
        </linearGradient>
        <linearGradient id="ms-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14161b" />
          <stop offset="1" stopColor="#0a0c10" />
        </linearGradient>
        <linearGradient id="ms-stone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2a2220" />
          <stop offset="0.7" stopColor="#3a2e28" />
          <stop offset="1" stopColor="#5a4433" />
        </linearGradient>
        <linearGradient id="ms-qing" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#24201f" />
          <stop offset="1" stopColor="#3f2b25" />
        </linearGradient>
        <filter id="ms-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id="ms-soft"><feGaussianBlur stdDeviation="2" /></filter>
        <filter id="ms-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.38  0 0 0 0 0.2  0 0 0 0.09 0" />
        </filter>
        <radialGradient id="ms-vig" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.75" />
        </radialGradient>
        <linearGradient id="ms-sail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2a2622" />
          <stop offset="1" stopColor="#6b5640" />
        </linearGradient>

        <symbol id="ms-ship" viewBox="0 0 220 200">
          <path d="M10 150 Q20 168 40 172 L180 172 Q200 166 212 146 L170 150 L60 152 Z" fill="#14110f" />
          <path d="M40 160 H184" stroke="#c98a45" strokeOpacity="0.5" strokeWidth="1.2" />
          <g fill="#c98a45" fillOpacity="0.55">{Array.from({ length: 9 }, (_, i) => <rect key={i} x={52 + i * 14} y={156} width="4" height="3" />)}</g>
          <path d="M206 146 L218 128" stroke="#14110f" strokeWidth="3" />
          {[[70, 26], [112, 10], [154, 30]].map(([x, top], m) => (
            <g key={m}>
              <path d={`M${x} 152 V${top}`} stroke="#14110f" strokeWidth="3" />
              <path d={`M${x - 26} ${top + 20} Q${x} ${top + 14} ${x + 26} ${top + 20} L${x + 22} ${top + 46} Q${x} ${top + 40} ${x - 22} ${top + 46} Z`} fill="url(#ms-sail)" />
              <path d={`M${x - 32} ${top + 52} Q${x} ${top + 44} ${x + 32} ${top + 52} L${x + 28} ${top + 86} Q${x} ${top + 78} ${x - 28} ${top + 86} Z`} fill="url(#ms-sail)" />
              <path d={`M${x - 36} ${top + 92} Q${x} ${top + 84} ${x + 36} ${top + 92} L${x + 30} ${top + 118} Q${x} ${top + 112} ${x - 30} ${top + 118} Z`} fill="url(#ms-sail)" />
              <path d={`M${x} ${top} l14 5 l-14 5 z`} fill="#8e2a24" />
            </g>
          ))}
          <path d="M154 60 L214 140 M70 50 L14 146" stroke="#14110f" strokeWidth="1" />
        </symbol>

        <symbol id="ms-rider" viewBox="0 0 120 110">
          <path d="M14 100 L20 74 Q14 66 22 58 Q36 50 64 54 Q76 50 86 40 L92 30 L100 34 L96 42 Q104 46 104 54 L96 56 L88 50 Q84 62 86 74 L92 100 L86 100 L78 78 Q66 82 46 80 L36 100 L30 100 L36 78 Q28 76 26 72 L22 100 Z" fill="#0b0c0f" />
          <path d="M50 54 Q46 36 52 28 Q58 22 62 30 Q64 40 60 54 Z" fill="#0b0c0f" />
          <circle cx="57" cy="20" r="6" fill="#0b0c0f" />
          <path d="M51 14 Q57 6 63 14 Z" fill="#0b0c0f" />
          <path d="M44 34 L30 -10" stroke="#0b0c0f" strokeWidth="2.4" />
          <path d="M30 -10 L46 -4 L32 2 Z" fill="#8e2a24" />
          <path d="M100 34 L104 30" stroke="#0b0c0f" strokeWidth="2" />
          <path d="M20 66 Q6 70 4 84" stroke="#0b0c0f" strokeWidth="4" fill="none" strokeLinecap="round" />
        </symbol>
      </defs>

      {/* Sky and sun */}
      <rect width="1600" height="900" fill="url(#ms-sky)" />
      <g fill="#f3e6c8">
        {STARS.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} opacity={0.25 + (i % 5) * 0.1} />)}
      </g>
      <rect width="1600" height="900" fill="url(#ms-sun)" />
      <circle cx="800" cy="612" r="54" fill="#ffe7b0" opacity="0.9" />
      <g opacity="0.16" fill="#ffe3a3">
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M800 612 L${180 + i * 155} -40 L${230 + i * 155} -40 Z`} />)}
      </g>

      {/* Clouds */}
      <g className="animate-drift" opacity="0.85">
        <g filter="url(#ms-blur)">
          <ellipse cx="320" cy="250" rx="260" ry="34" fill="#3a3640" />
          <ellipse cx="1260" cy="210" rx="300" ry="38" fill="#3a3640" />
          <ellipse cx="760" cy="330" rx="340" ry="26" fill="#8a5e40" opacity="0.7" />
          <ellipse cx="1180" cy="420" rx="260" ry="20" fill="#c98a45" opacity="0.5" />
          <ellipse cx="380" cy="440" rx="240" ry="18" fill="#c98a45" opacity="0.45" />
        </g>
        <g fill="#2a2b33" opacity="0.9" filter="url(#ms-soft)">
          <path d="M120 300 q60 -40 130 -10 q50 -30 110 0 q70 -20 100 20 q-120 14 -340 -10 z" />
          <path d="M1080 260 q70 -50 150 -14 q60 -36 120 2 q80 -16 110 26 q-150 16 -380 -14 z" />
        </g>
      </g>

      {/* Far mountains */}
      <path d="M0 560 L90 500 L170 530 L260 470 L360 520 L470 480 L560 530 L660 500 L760 540 L860 505 L960 545 L1060 490 L1160 520 L1270 470 L1380 515 L1490 480 L1600 520 V640 H0 Z" fill="url(#ms-far)" opacity="0.75" />

      {/* European castle on the central hill */}
      <path d="M560 640 Q640 560 760 548 Q860 556 940 640 Z" fill="url(#ms-mid)" />
      <g fill="#1d1c22">
        <rect x="660" y="470" width="150" height="90" />
        <rect x="640" y="430" width="34" height="130" />
        <path d="M636 432 L657 384 L678 432 Z" />
        <rect x="796" y="420" width="38" height="140" />
        <path d="M792 422 L815 370 L838 422 Z" />
        <rect x="718" y="400" width="40" height="80" />
        <path d="M714 402 L738 352 L762 402 Z" />
        <g>{Array.from({ length: 8 }, (_, i) => <rect key={i} x={662 + i * 19} y="460" width="11" height="12" />)}</g>
        <path d="M738 352 V326" stroke="#1d1c22" strokeWidth="2" />
      </g>
      <path d="M738 328 l20 6 l-20 7 z" fill="#8e2a24" />
      <g fill="#e6b067" opacity="0.65">
        <rect x="690" y="500" width="5" height="9" /><rect x="740" y="430" width="4" height="8" /><rect x="812" y="470" width="4" height="9" /><rect x="652" y="470" width="4" height="8" />
      </g>
      <path d="M810 420 V560" stroke="#e6b067" strokeOpacity="0.25" strokeWidth="2" />

      {/* Mughal-Rajput palace, left */}
      <g>
        <path d="M0 640 V560 Q120 540 260 548 Q380 552 470 600 L500 640 Z" fill="url(#ms-mid)" />
        <g fill="url(#ms-stone)">
          <rect x="70" y="470" width="360" height="110" />
          <rect x="52" y="575" width="400" height="22" />
          {/* central dome on a drum */}
          <rect x="196" y="420" width="108" height="56" />
          <path d="M184 424 Q184 340 250 316 Q316 340 316 424 Z" />
          <path d="M250 316 V284" stroke="#3a2e28" strokeWidth="4" />
          <circle cx="250" cy="284" r="5" />
          <path d="M246 276 L250 262 L254 276 Z" />
          {/* chhatris */}
          {[100, 400].map((x) => (
            <g key={x}>
              <rect x={x - 22} y="430" width="44" height="42" />
              <path d={`M${x - 28} 432 Q${x} 396 ${x + 28} 432 Z`} />
              <path d={`M${x} 404 V390`} stroke="#3a2e28" strokeWidth="3" />
            </g>
          ))}
          {[150, 350].map((x) => (
            <g key={x}>
              <rect x={x - 14} y="446" width="28" height="28" />
              <path d={`M${x - 18} 448 Q${x} 422 ${x + 18} 448 Z`} />
            </g>
          ))}
          {/* minarets */}
          {[40, 460].map((x) => (
            <g key={x}>
              <rect x={x - 9} y="380" width="18" height="216" />
              <rect x={x - 14} y="440" width="28" height="6" />
              <rect x={x - 14} y="500" width="28" height="6" />
              <path d={`M${x - 13} 382 Q${x} 352 ${x + 13} 382 Z`} />
              <path d={`M${x} 356 V344`} stroke="#3a2e28" strokeWidth="2" />
            </g>
          ))}
        </g>
        {/* cusped arches with lamplight */}
        <g fill="#e6a85a" opacity="0.55">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${92 + i * 36} 576 V530 Q${92 + i * 36} 512 ${104 + i * 36} 506 Q${116 + i * 36} 512 ${116 + i * 36} 530 V576 Z`} />
          ))}
        </g>
        <path d="M70 470 H430" stroke="#e6b067" strokeOpacity="0.35" strokeWidth="2" />
        <path d="M184 424 Q184 340 250 316" stroke="#e6b067" strokeOpacity="0.28" strokeWidth="2" fill="none" />
      </g>

      {/* Qing palace hall and pagoda, right */}
      <g>
        <path d="M1080 640 Q1160 560 1300 552 Q1460 548 1600 566 V640 Z" fill="url(#ms-mid)" />
        {/* pagoda */}
        <g fill="url(#ms-qing)">
          {[0, 1, 2, 3, 4].map((i) => {
            const w = 70 - i * 10, y = 520 - i * 38, x = 1500;
            return (
              <g key={i}>
                <rect x={x - w / 2 + 8} y={y - 26} width={w - 16} height="26" />
                <path d={`M${x - w / 2 - 18} ${y - 22} Q${x - w / 2} ${y - 30} ${x} ${y - 40} Q${x + w / 2} ${y - 30} ${x + w / 2 + 18} ${y - 22} Q${x} ${y - 34} ${x - w / 2 - 18} ${y - 22} Z`} />
              </g>
            );
          })}
          <path d="M1500 330 V300" stroke="#3f2b25" strokeWidth="3" />
        </g>
        {/* the hall */}
        <g>
          <rect x="1130" y="572" width="380" height="30" fill="#5b5550" />
          <rect x="1110" y="600" width="420" height="16" fill="#47423e" />
          <rect x="1170" y="500" width="300" height="74" fill="#2c1d1a" />
          <g fill="#7a2620">{Array.from({ length: 9 }, (_, i) => <rect key={i} x={1182 + i * 34} y="508" width="7" height="66" />)}</g>
          <g fill="#e6a85a" opacity="0.45">{Array.from({ length: 8 }, (_, i) => <rect key={i} x={1192 + i * 34} y="520" width="22" height="40" />)}</g>
          <path d="M1120 506 Q1160 492 1200 470 L1440 470 Q1480 492 1520 506 Q1470 498 1440 488 L1200 488 Q1170 498 1120 506 Z" fill="#1a1716" />
          <rect x="1196" y="452" width="248" height="22" fill="#2c1d1a" />
          <path d="M1150 458 Q1190 444 1220 420 L1420 420 Q1450 444 1490 458 Q1450 452 1420 440 L1220 440 Q1190 452 1150 458 Z" fill="#1a1716" />
          <path d="M1220 420 Q1320 404 1420 420" stroke="#1a1716" strokeWidth="4" fill="none" />
          <path d="M1120 506 Q1160 492 1200 470 L1440 470 Q1480 492 1520 506" stroke="#e6b067" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
          <path d="M1150 458 Q1190 444 1220 420 L1420 420 Q1450 444 1490 458" stroke="#e6b067" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
          <path d="M1222 420 l-8 -10 M1418 420 l8 -10" stroke="#1a1716" strokeWidth="3" />
        </g>
      </g>

      {/* The bay */}
      <rect x="0" y="628" width="1600" height="272" fill="url(#ms-sea)" />
      <g stroke="#f2bf6e" strokeLinecap="round">
        {Array.from({ length: 26 }, (_, i) => {
          const y = 640 + i * 9;
          const w = Math.max(14, 160 - i * 6);
          return <path key={i} d={`M${800 - w / 2 + Math.sin(i * 1.7) * 24} ${y} h${w}`} strokeWidth={Math.max(0.8, 2.4 - i * 0.07)} strokeOpacity={Math.max(0.08, 0.7 - i * 0.025)} />;
        })}
      </g>
      <g stroke="#d9b46b" strokeOpacity="0.12">
        {Array.from({ length: 30 }, (_, i) => <path key={i} d={`M${(i * 137) % 1600} ${660 + ((i * 53) % 220)} h${30 + (i % 4) * 16}`} />)}
      </g>

      {/* Ships of the line */}
      <use href="#ms-ship" x="980" y="520" width="220" height="200" />
      <use href="#ms-ship" x="1060" y="592" width="130" height="118" opacity="0.85" />
      <use href="#ms-ship" x="560" y="568" width="150" height="136" transform="translate(1270 0) scale(-1 1)" />
      <use href="#ms-ship" x="430" y="610" width="90" height="82" opacity="0.7" />
      <g opacity="0.35" filter="url(#ms-soft)">
        <ellipse cx="1090" cy="700" rx="100" ry="8" fill="#000" />
        <ellipse cx="635" cy="706" rx="70" ry="6" fill="#000" />
      </g>

      {/* Foreground ridge with cavalry */}
      <path d="M0 900 V760 Q120 720 260 732 Q360 742 420 780 Q470 812 520 900 Z" fill="url(#ms-near)" />
      <path d="M1600 900 V780 Q1480 736 1340 748 Q1240 756 1180 800 Q1140 840 1110 900 Z" fill="url(#ms-near)" />
      <g>
        <use href="#ms-rider" x="90" y="640" width="120" height="110" />
        <use href="#ms-rider" x="190" y="652" width="104" height="96" />
        <use href="#ms-rider" x="280" y="672" width="92" height="84" />
        <use href="#ms-rider" x="360" y="700" width="80" height="74" />
        <use href="#ms-rider" x="1320" y="662" width="110" height="100" transform="translate(2750 0) scale(-1 1)" />
        <use href="#ms-rider" x="1232" y="684" width="92" height="84" transform="translate(2556 0) scale(-1 1)" />
      </g>
      <path d="M0 760 Q120 720 260 732 Q360 742 420 780" stroke="#e6b067" strokeOpacity="0.25" strokeWidth="2" fill="none" />

      {/* Atmosphere */}
      <rect width="1600" height="900" filter="url(#ms-grain)" opacity="0.9" />
      <rect width="1600" height="900" fill="url(#ms-vig)" />
    </svg>
  );
});

const STARS: [number, number, number][] = Array.from({ length: 70 }, (_, i) => {
  const x = (i * 263.7) % 1600;
  const y = ((i * 97.3) % 300) + 10;
  return [Math.round(x), Math.round(y), i % 7 === 0 ? 1.6 : 0.9];
});
