import { useState } from 'react';
import type { ChronicleEntry, WorldState } from '../game/types';
import { useWorld } from '../store/hooks';
import { dateOf } from '../ui/format';
import { Empty } from '../ui/kit';

const CATS: (ChronicleEntry['category'] | 'all' | 'ours')[] = ['all', 'ours', 'war', 'peace', 'diplomacy', 'court', 'economy', 'revolution', 'discovery', 'disaster', 'construction'];

export function ChroniclesPanel() {
  const { w, me } = useWorld();
  return <ChronicleList w={w} me={me} />;
}

export function ChronicleList({ w, me, limit = 300 }: { w: WorldState; me: string; limit?: number }) {
  const [cat, setCat] = useState<(typeof CATS)[number]>('all');
  const [major, setMajor] = useState(false);
  const list = w.chronicle.filter((e) => (cat === 'all' || (cat === 'ours' ? e.countries.includes(me) || e.category === 'player' : e.category === cat)) && (!major || e.importance >= 2)).slice(0, limit);
  let lastYear = -1;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {CATS.map((k) => <button key={k} className={`chip capitalize ${cat === k ? '!border-gold text-gold-bright' : 'text-parchment-dim'}`} onClick={() => setCat(k)}>{k === 'ours' ? 'Our realm' : k}</button>)}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-parchment-dim"><input type="checkbox" className="accent-[#d9b46b]" checked={major} onChange={(e) => setMajor(e.target.checked)} /> Major only</label>
      </div>
      {list.length ? (
        <div className="parchment rounded p-4">
          {list.map((e, i) => {
            const y = 1800 + Math.floor(e.turn / 12);
            const header = y !== lastYear;
            lastYear = y;
            return (
              <div key={i}>
                {header ? <div className="mb-1 mt-3 font-display text-[15px] tracking-[0.2em] text-[#6b4a1e] first:mt-0">— {y} —</div> : null}
                <p className={`font-serif leading-snug ${e.importance >= 3 ? 'text-[17px] font-semibold text-[#2b2116]' : e.importance === 2 ? 'text-[16px] text-[#2b2116]' : 'text-[15px] text-[#4a3a26]'} ${e.countries.includes(me) ? 'border-l-2 border-[#8e2a24] pl-2' : ''}`}>
                  <span className="mr-1.5 font-sans text-[11px] uppercase tracking-wider text-[#8a6a32]">{dateOf(e.turn).split(' ')[0].slice(0, 3)}</span>{e.text}
                </p>
              </div>
            );
          })}
        </div>
      ) : <Empty>The chronicle has no entries of this kind yet.</Empty>}
    </div>
  );
}
