import { ArrowLeft, Search, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Flag } from '../art/Flag';
import { Portrait } from '../art/Portrait';
import { previewAction } from '../game/actions';
import { age } from '../game/characters';
import { DIPLO_LABELS, type DiploKind } from '../game/diplomacy';
import { alliesOf, atWar, countryName, countryPopulation, hasTreaty, neighbourCountries, opinion, provinceName, provincesOf, sideOf, warBetween } from '../game/state';
import { POLITIES, neighbors } from '../game/static';
import type { PeaceTerms, War } from '../game/types';
import { blocPower, casusBelli, emptyTerms, peaceAcceptance, powerScore, provinceValue, suggestTerms } from '../game/war';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { money, people } from '../ui/format';
import { Badge, Meter, Section } from '../ui/kit';

const KINDS: DiploKind[] = ['envoy', 'trade', 'alliance', 'nap', 'marriage', 'guarantee', 'access', 'tribute_demand', 'offer_tribute', 'subsidy', 'recall_envoy', 'break_alliance', 'break_trade', 'stop_subsidy', 'release_subject', 'insult'];

export function DiplomacyPanel() {
  const { w, me } = useWorld();
  const s = useGame();
  const target = s.selectedCountry && s.selectedCountry !== me && w.countries[s.selectedCountry]?.alive ? s.selectedCountry : null;
  return target ? <CountryView id={target} onBack={() => s.selectCountry(null)} /> : <CountryList />;
}

function CountryList() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const alive = Object.values(w.countries).filter((x) => x.alive && x.id !== me).map((x) => x.id);
    const enemies = alive.filter((x) => atWar(w, me, x));
    const allies = alliesOf(w, me);
    const nb = neighbourCountries(w, me).filter((x) => !enemies.includes(x) && !allies.includes(x));
    const greats = alive.filter((x) => !nb.includes(x) && !enemies.includes(x) && !allies.includes(x)).sort((a, b) => powerScore(w, b) - powerScore(w, a)).slice(0, 12);
    return [['At war', enemies], ['Allies', allies], ['Neighbours', nb], ['Great powers', greats]] as [string, string[]][];
  }, [w, me]);
  const ql = q.trim().toLowerCase();
  const results = ql ? Object.values(w.countries).filter((x) => x.alive && x.id !== me && [POLITIES[x.id].name, POLITIES[x.id].short, POLITIES[x.id].adjective].some((n) => n.toLowerCase().includes(ql))).map((x) => x.id).slice(0, 40) : null;
  const Item = ({ id }: { id: string }) => (
    <button className="card flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:border-gold/50" onClick={() => s.selectCountry(id)}>
      <Flag spec={POLITIES[id].flag} width={26} />
      <span className="min-w-0 flex-1"><span className="block truncate text-parchment">{POLITIES[id].name}</span><span className="block text-[11px] text-muted">power {Math.round(powerScore(w, id))} · {people(countryPopulation(w, id))}</span></span>
      <span className={`tabular text-[12px] ${opinion(w, me, id) < 0 ? 'text-war' : 'text-econ'}`}>{Math.round(opinion(w, me, id))}</span>
    </button>
  );
  return (
    <div>
      <p className="mb-2 text-[12px] text-muted">Envoys abroad: {c.envoys.length ? c.envoys.map((e) => countryName(w, e)).join(', ') : 'none'}. Numbers show their opinion of us (−200 to +200).</p>
      <label className="relative mb-3 block"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-8" placeholder="Find a court…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {results ? <div className="space-y-1.5">{results.map((id) => <Item key={id} id={id} />)}</div> : groups.map(([label, ids]) => ids.length ? (
        <Section key={label} title={label}><div className="space-y-1.5">{ids.map((id) => <Item key={id} id={id} />)}</div></Section>
      ) : null)}
    </div>
  );
}

function CountryView({ id, onBack }: { id: string; onBack: () => void }) {
  const { w, me, c } = useWorld();
  const s = useGame();
  const d = POLITIES[id];
  const them = w.countries[id];
  const ruler = w.characters[them.rulerId];
  const op = opinion(w, me, id);
  const war = warBetween(w, me, id);
  const cbs = casusBelli(w, me, id).sort((a, b) => a.infamy - b.infamy);
  const [cb, setCb] = useState(cbs.find((x) => x.type !== 'none')?.type ?? cbs[0]?.type ?? 'none');
  const [subsidy, setSubsidy] = useState(Math.max(1, Math.round(c.last.income * 0.05)));
  const rel: [string, 'gold' | 'war' | 'econ' | 'diplo' | 'muted'][] = [];
  if (war) rel.push(['At war', 'war']);
  if (hasTreaty(w, 'alliance', me, id)) rel.push(['Allied', 'diplo']);
  if (hasTreaty(w, 'trade', me, id)) rel.push(['Trade agreement', 'econ']);
  if (hasTreaty(w, 'marriage', me, id)) rel.push(['Royal marriage', 'gold']);
  if (hasTreaty(w, 'truce', me, id)) rel.push(['Truce', 'muted']);
  if (hasTreaty(w, 'nap', me, id)) rel.push(['Non-aggression', 'muted']);
  if (c.rivals.includes(id)) rel.push(['Rival', 'war']);
  if (them.overlord === me) rel.push(['Our subject', 'diplo']);
  if (c.overlord === id) rel.push(['Our overlord', 'diplo']);
  if (c.envoys.includes(id)) rel.push(['Envoy present', 'gold']);
  const declare = previewAction(w, me, { type: 'declareWar', target: id, cb });
  return (
    <div>
      <button className="btn btn-quiet mb-2 !px-1 !py-0.5" onClick={onBack}><ArrowLeft size={14} /> All courts</button>
      <div className="flex gap-3">
        {ruler ? <Portrait style={d.portrait} seed={ruler.portraitSeed} female={ruler.female} age={age(w, ruler)} size={64} /> : null}
        <div className="min-w-0 flex-1">
          <Flag spec={d.flag} width={40} />
          <h3 className="font-display text-base leading-tight text-gold-bright">{d.name}</h3>
          <p className="text-[12px] text-parchment-dim">{ruler?.name}, {d.rulerTitle} · {d.government}</p>
          <div className="mt-1 flex flex-wrap gap-1">{rel.map(([t, tone]) => <Badge key={t} tone={tone}>{t}</Badge>)}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <Meter label="Their opinion of us" right={Math.round(op)} value={op + 200} max={400} color={op < 0 ? '#b0473e' : '#5b8db8'} />
        <Meter label="Their strength vs ours" right={`${(powerScore(w, id) / Math.max(1, powerScore(w, me))).toFixed(2)}×`} value={powerScore(w, id)} max={Math.max(powerScore(w, id), powerScore(w, me)) * 1.2} color="#d95926" />
        <div className="text-parchment-dim">Population <span className="tabular float-right text-parchment">{people(countryPopulation(w, id))}</span></div>
        <div className="text-parchment-dim">With allies <span className="tabular float-right text-parchment">{Math.round(blocPower(w, id))}</span></div>
        <div className="text-parchment-dim">Allies <span className="float-right text-right text-parchment">{alliesOf(w, id).map((x) => countryName(w, x)).join(', ') || '—'}</span></div>
        <div className="text-parchment-dim">Overlord <span className="float-right text-parchment">{them.overlord ? countryName(w, them.overlord) : '—'}</span></div>
      </div>

      {war ? <PeaceBuilder war={war} enemy={id} /> : null}

      <Section title="Diplomatic actions" className="mt-4">
        <div className="space-y-1.5">
          {KINDS.map((kind) => {
            const pv = previewAction(w, me, { type: 'diplomacy', kind, target: id, amount: kind === 'subsidy' ? subsidy : undefined });
            const hide = !pv.valid && ['recall_envoy', 'break_alliance', 'break_trade', 'stop_subsidy', 'release_subject', 'offer_tribute', 'tribute_demand', 'guarantee', 'access'].includes(kind);
            if (hide) return null;
            return (
              <div key={kind} className={`card flex items-center gap-2 px-2.5 py-1.5 text-[13px] ${pv.valid ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-parchment">{DIPLO_LABELS[kind]}{kind === 'subsidy' ? <input type="number" min={1} className="input ml-2 !inline-block !w-20 !px-1.5 !py-0.5 text-xs" value={subsidy} onChange={(e) => setSubsidy(Math.max(1, Number(e.target.value) || 1))} aria-label="Monthly subsidy (£k)" /> : null}</div>
                  {pv.valid ? (
                    <div className="text-[11px] text-muted">{pv.chance !== undefined ? `${Math.round(pv.chance * 100)}% likely to accept` : ''}{pv.consequences.length ? `${pv.chance !== undefined ? ' · ' : ''}${pv.consequences.slice(0, 3).join(', ')}` : ''}</div>
                  ) : <div className="text-[11px] text-war">{pv.errors.join(' ')}</div>}
                </div>
                <button className={`btn ${kind === 'insult' || kind.startsWith('break') ? 'btn-ghost' : 'btn-gold'} !min-h-8 shrink-0 !px-3 !py-1`} disabled={!pv.valid} onClick={() => s.dispatch({ type: 'diplomacy', kind, target: id, amount: kind === 'subsidy' ? subsidy : undefined })}>Send</button>
              </div>
            );
          })}
        </div>
      </Section>

      {!war ? (
        <Section title="War">
          <div className="card space-y-2 p-2.5 text-[13px]">
            <select className="input !py-1.5 text-sm" value={cb} onChange={(e) => setCb(e.target.value as typeof cb)} aria-label="Casus belli">
              {cbs.map((x) => <option key={x.type} value={x.type}>{x.label} (reputation −{x.infamy}, stability −{x.stability})</option>)}
            </select>
            {declare.valid ? <p className="text-[12px] text-parchment-dim">{declare.consequences.join(' · ')} — {declare.risks.join(' ')}</p> : <p className="text-[12px] text-war">{declare.errors.join(' ')}</p>}
            <button className="btn btn-war w-full" disabled={!declare.valid} onClick={() => { void s.askConfirm({ title: `Declare war on ${d.name}?`, body: declare.valid ? `${declare.consequences.join(' · ')}. ${declare.risks.join(' ')}` : undefined, confirmLabel: 'Declare war', tone: 'war' }).then((ok) => { if (ok) s.dispatch({ type: 'declareWar', target: id, cb }); }); }}><Swords size={14} /> Declare war</button>
          </div>
        </Section>
      ) : null}
      <button className="btn btn-quiet mt-1" onClick={() => { s.openPanel('espionage'); }}>Espionage against {d.short} →</button>
    </div>
  );
}

function PeaceBuilder({ war, enemy }: { war: War; enemy: string }) {
  const { w, me } = useWorld();
  const s = useGame();
  const side = sideOf(war, me)!;
  const score = side === 'attackers' ? war.score : -war.score;
  const leader = side === 'attackers' ? war.attackerLeader : war.defenderLeader;
  const foes = side === 'attackers' ? war.defenders : war.attackers;
  const candidates = useMemo(() => foes.flatMap((f) => provincesOf(w, f))
    .filter((pid) => w.provinces[pid].controller === me || w.provinces[pid].cores.includes(me) || neighbors(pid).some((n) => w.provinces[n]?.owner === me))
    .sort((a, b) => provinceValue(w, b) - provinceValue(w, a)).slice(0, 14), [w, foes, me]);
  const [terms, setTerms] = useState<PeaceTerms>(() => (score > 10 && leader === me ? suggestTerms(w, war, side, score) : emptyTerms()));
  const demanding = terms.provinces.length > 0 || terms.reparations > 0 || terms.tribute || terms.subjugate || terms.humiliate || terms.independence;
  const acc = peaceAcceptance(w, war, me, terms, true);
  const accWhite = peaceAcceptance(w, war, me, emptyTerms(), false);
  const toggle = (pid: string) => setTerms({ ...terms, provinces: terms.provinces.includes(pid) ? terms.provinces.filter((x) => x !== pid) : [...terms.provinces, pid] });
  return (
    <Section title={`Peace: ${war.name}`} className="mt-4">
      <div className="card space-y-2 p-2.5 text-[13px]">
        <div className="flex justify-between"><span className="text-parchment-dim">War score (ours)</span><span className={`tabular ${score >= 0 ? 'text-econ' : 'text-war'}`}>{Math.round(score)}</span></div>
        {leader !== me ? <p className="text-[12px] text-gold">{countryName(w, leader)} leads our side; we may only make a separate peace for ourselves.</p> : null}
        {candidates.length ? (
          <div>
            <div className="label mb-1">Provinces to demand</div>
            <div className="grid grid-cols-2 gap-1">
              {candidates.map((pid) => (
                <label key={pid} className="flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" className="accent-[#d9b46b]" checked={terms.provinces.includes(pid)} onChange={() => toggle(pid)} />
                  <span className={w.provinces[pid].controller === me ? 'text-parchment' : 'text-parchment-dim'}>{provinceName(pid)}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <label className="block text-[12px] text-parchment-dim">Reparations: <span className="tabular text-parchment">{money(terms.reparations)}</span>
          <input type="range" min={0} max={Math.max(10, Math.round((w.countries[enemy]?.last.income ?? 10) * 18))} step={1} value={terms.reparations} onChange={(e) => setTerms({ ...terms, reparations: Number(e.target.value) })} className="w-full accent-[#d9b46b]" />
        </label>
        <div className="flex flex-wrap gap-3 text-[12px]">
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#d9b46b]" checked={terms.tribute} onChange={(e) => setTerms({ ...terms, tribute: e.target.checked, subjugate: false })} /> Tributary status</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#d9b46b]" checked={terms.subjugate} onChange={(e) => setTerms({ ...terms, subjugate: e.target.checked, tribute: false })} /> Vassalage</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#d9b46b]" checked={terms.humiliate} onChange={(e) => setTerms({ ...terms, humiliate: e.target.checked })} /> Humiliate</label>
          {war.goal.type === 'independence' ? <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#d9b46b]" checked={terms.independence} onChange={(e) => setTerms({ ...terms, independence: e.target.checked })} /> Independence</label> : null}
        </div>
        <p className={`text-[12px] ${acc.accept ? 'text-econ' : 'text-war'}`}>
          {demanding ? (acc.accept ? `They would accept (treaty costs ${acc.cost} of our war score).` : `They would refuse: these terms cost ${acc.cost}; we need ${Math.round(-acc.margin)} more war score.`) : accWhite.accept ? 'They would accept a white peace.' : 'They are not yet willing to make a white peace.'}
        </p>
        <div className="flex gap-2">
          <button className="btn btn-gold flex-1" disabled={!demanding} onClick={() => s.dispatch({ type: 'proposePeace', war: war.id, terms, mode: 'demand' })}>Demand terms</button>
          <button className="btn btn-ghost flex-1" onClick={() => s.dispatch({ type: 'proposePeace', war: war.id, terms: emptyTerms(), mode: 'offer' })}>Offer white peace</button>
        </div>
        {w.countries[me].prestige >= 40 ? <button className="btn btn-quiet w-full" onClick={() => s.dispatch({ type: 'congress' })}>Convene a peace congress (prestige 10)</button> : null}
      </div>
    </Section>
  );
}

