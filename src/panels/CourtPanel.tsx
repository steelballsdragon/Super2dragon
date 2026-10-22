import { Portrait } from '../art/Portrait';
import { previewAction } from '../game/actions';
import { age, MINISTER_TITLES, PERSONALITIES } from '../game/characters';
import { def } from '../game/state';
import type { Character, FactionId, MinisterRole } from '../game/types';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { money } from '../ui/format';
import { Badge, Meter, Section } from '../ui/kit';

const FACTION_NAMES: Record<FactionId, string> = { nobility: 'Nobility & chiefs', clergy: 'Clergy', military: 'Officers', merchants: 'Merchants', commons: 'Commons', reformers: 'Reformers' };
const ROLES: MinisterRole[] = ['finance', 'foreign', 'military', 'admin', 'intelligence'];

export function CourtPanel() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const d = def(me);
  const ruler = w.characters[c.rulerId];
  const heir = c.heirId ? w.characters[c.heirId] : undefined;
  const consort = c.consortId ? w.characters[c.consortId] : undefined;
  const acts: { kind: 'festival' | 'anticorruption' | 'designateHeir'; label: string }[] = [
    { kind: 'festival', label: 'Hold festivities' },
    { kind: 'anticorruption', label: 'Purge corrupt officials' },
    ...(!heir?.alive ? [{ kind: 'designateHeir' as const, label: 'Designate an heir' }] : []),
  ];
  return (
    <div>
      <Section title="The ruling house">
        <div className="grid grid-cols-3 gap-2">
          {[['Sovereign', ruler], ['Heir', heir], ['Consort', consort]].map(([label, ch]) => (
            <Person key={label as string} label={label as string} ch={ch as Character | undefined} style={d.portrait} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {acts.map((a) => {
            const pv = previewAction(w, me, { type: 'court', kind: a.kind });
            return (
              <button key={a.kind} className="btn btn-ghost !min-h-8 !py-1" disabled={!pv.valid} title={pv.valid ? `${pv.consequences.join(', ')}` : pv.errors.join(' ')} onClick={() => s.dispatch({ type: 'court', kind: a.kind })}>
                {a.label}{pv.cost.treasury ? ` · ${money(pv.cost.treasury)}` : ''}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="The council of ministers">
        <div className="space-y-2">
          {ROLES.map((role) => {
            const m = c.ministers[role] ? w.characters[c.ministers[role]!] : undefined;
            const pers = PERSONALITIES[role].find((p) => p.id === m?.personality);
            const pv = previewAction(w, me, { type: 'court', kind: 'appoint', role });
            return (
              <div key={role} className="card flex gap-3 p-2">
                {m ? <Portrait style={d.portrait} seed={m.portraitSeed} female={m.female} age={age(w, m)} size={46} /> : <div className="h-14 w-12" />}
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="text-[10px] uppercase tracking-wider text-gold-dim">{MINISTER_TITLES[role]}</div>
                  <div className="text-parchment">{m?.alive ? m.name : 'Vacant'}{m?.alive ? <span className="text-muted"> · {age(w, m)}</span> : null}</div>
                  {pers ? <div className="text-[12px] italic text-parchment-dim">{pers.name}: {pers.blurb}</div> : null}
                  {m ? <div className="text-[11px] text-muted">Adm {m.adm} · Dip {m.dip} · Mil {m.mil} · Loyalty {Math.round(m.loyalty)}</div> : null}
                </div>
                <button className="btn btn-quiet !min-h-0 self-center !px-2 !py-1 text-[10px]" disabled={!pv.valid} onClick={() => s.dispatch({ type: 'court', kind: 'appoint', role })} title={`Cost ${money(pv.cost.treasury ?? 0)}`}>Replace</button>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Factions at court">
        <div className="space-y-2.5">
          {(Object.keys(c.factions) as FactionId[]).map((f) => (
            <div key={f} className="grid grid-cols-[110px_1fr_1fr] items-center gap-3 text-[12px]">
              <span className="text-parchment">{FACTION_NAMES[f]}</span>
              <Meter label="Influence" right={Math.round(c.factions[f].influence)} value={c.factions[f].influence} color="#5b8db8" height={5} />
              <Meter label="Loyalty" right={Math.round(c.factions[f].loyalty)} value={c.factions[f].loyalty} color={c.factions[f].loyalty < 35 ? '#b0473e' : '#4f9f78'} height={5} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Disloyal factions with great influence breed plots, mutinies and revolts. Laws, appointments and events shift their mood.</p>
      </Section>

      <Section title="Legitimacy & succession">
        <div className="grid grid-cols-2 gap-3">
          <Meter label="Legitimacy" right={Math.round(c.legitimacy)} value={c.legitimacy} />
          <Meter label="Stability" right={Math.round(c.stability)} value={c.stability} color="#4f9f78" />
        </div>
        <p className="mt-2 text-[13px] text-parchment-dim">{heir?.alive ? `${heir.name} will succeed. ` : 'There is no designated heir: a death now would open a succession crisis. '}{ruler ? `${ruler.name} is in ${ruler.health > 70 ? 'good' : ruler.health > 40 ? 'indifferent' : 'poor'} health.` : ''}</p>
      </Section>
    </div>
  );
}

function Person({ label, ch, style }: { label: string; ch?: Character; style: Parameters<typeof Portrait>[0]['style'] }) {
  const { w } = useWorld();
  return (
    <div className="card flex flex-col items-center p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-gold-dim">{label}</div>
      {ch?.alive ? (
        <>
          <Portrait style={style} seed={ch.portraitSeed} female={ch.female} age={age(w, ch)} size={58} />
          <div className="mt-1 text-[12px] leading-tight text-parchment">{ch.name}</div>
          <div className="text-[11px] text-muted">{age(w, ch)} yrs</div>
          {ch.traits[0] ? <Badge tone="muted">{ch.traits[0]}</Badge> : null}
        </>
      ) : <div className="py-6 text-[12px] italic text-muted">none</div>}
    </div>
  );
}
