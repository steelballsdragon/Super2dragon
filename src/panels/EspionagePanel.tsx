import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Flag } from '../art/Flag';
import { previewAction } from '../game/actions';
import { SPY_OPS, counterIntel, hasIntel, type SpyOp } from '../game/espionage';
import { countryName, neighbourCountries, totalRegiments } from '../game/state';
import { POLITIES } from '../game/static';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { money } from '../ui/format';
import { Empty, Meter, Section } from '../ui/kit';

export function EspionagePanel() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const nets = Object.entries(c.spy).sort((a, b) => b[1] - a[1]);
  const [target, setTarget] = useState<string>(s.selectedCountry && s.selectedCountry !== me ? s.selectedCountry : nets[0]?.[0] ?? c.rivals[0] ?? neighbourCountries(w, me)[0] ?? '');
  const candidates = [...new Set([...nets.map(([id]) => id), ...c.rivals, ...neighbourCountries(w, me)])].filter((id) => w.countries[id]?.alive);
  const foreign = Object.values(w.countries).filter((x) => x.alive && (x.spy[me] ?? 0) > 0).sort((a, b) => (b.spy[me] ?? 0) - (a.spy[me] ?? 0));
  return (
    <div>
      <Section title="Our defences">
        <Meter label="Counter-intelligence" right={Math.round(counterIntel(w, me))} value={counterIntel(w, me)} color="#5b8db8" />
        <p className="mt-1 text-[12px] text-parchment-dim">{foreign.length ? `Suspected foreign networks: ${foreign.slice(0, 4).map((x) => `${countryName(w, x.id)} (${Math.round(x.spy[me])})`).join(', ')}.` : 'No foreign networks have been detected.'} Raise the espionage budget to strengthen both.</p>
      </Section>
      <Section title="Networks abroad">
        {nets.length ? (
          <ul className="space-y-1.5">
            {nets.map(([id, v]) => (
              <li key={id} className="card flex items-center gap-2 px-2.5 py-1.5 text-[13px]">
                <Flag spec={POLITIES[id].flag} width={22} />
                <button className="min-w-0 flex-1 text-left text-parchment hover:text-gold" onClick={() => setTarget(id)}>{countryName(w, id)}</button>
                <div className="w-28"><Meter value={v} color="#d9b46b" height={5} /></div>
                <span className="tabular w-8 text-right text-[12px]">{Math.round(v)}</span>
                <button className="btn btn-quiet !min-h-0 !p-1" title="Withdraw network" onClick={() => s.dispatch({ type: 'spyFocus', target: id, on: false })}><EyeOff size={14} /></button>
              </li>
            ))}
          </ul>
        ) : <Empty>We have no agents abroad.</Empty>}
      </Section>
      <Section title="Operations">
        {candidates.length ? (
          <>
            <select className="input mb-2" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target">
              {candidates.map((id) => <option key={id} value={id}>{countryName(w, id)}{c.spy[id] !== undefined ? ` — network ${Math.round(c.spy[id])}` : ''}</option>)}
            </select>
            {target && c.spy[target] === undefined ? <button className="btn btn-gold mb-2 w-full" onClick={() => s.dispatch({ type: 'spyFocus', target, on: true })}><Eye size={14} /> Build a network in {countryName(w, target)}</button> : null}
            {target && hasIntel(w, me, target) ? (
              <div className="card mb-2 p-2 text-[12px] text-parchment-dim">Intelligence: treasury {money(w.countries[target].treasury)} · {Math.round(totalRegiments(w, target) * 1000).toLocaleString('en')} soldiers · stability {Math.round(w.countries[target].stability)}</div>
            ) : null}
            <div className="space-y-1.5">
              {(Object.keys(SPY_OPS) as SpyOp[]).map((op) => {
                const pv = previewAction(w, me, { type: 'spyOp', target, op });
                return (
                  <div key={op} className={`card flex items-center gap-2 px-2.5 py-1.5 text-[13px] ${pv.valid ? '' : 'opacity-60'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-parchment">{SPY_OPS[op].name}</div>
                      <div className="text-[11px] text-muted">{SPY_OPS[op].description} · needs network {SPY_OPS[op].network}</div>
                      {pv.valid ? <div className="text-[11px] text-parchment-dim">{money(SPY_OPS[op].cost)} · {Math.round((pv.chance ?? 0) * 100)}% chance</div> : <div className="text-[11px] text-war">{pv.errors.join(' ')}</div>}
                    </div>
                    <button className="btn btn-gold !min-h-8 shrink-0 !px-3 !py-1" disabled={!pv.valid} onClick={() => s.dispatch({ type: 'spyOp', target, op })}>Order</button>
                  </div>
                );
              })}
            </div>
          </>
        ) : <Empty>No foreign court is within our reach.</Empty>}
      </Section>
    </div>
  );
}
