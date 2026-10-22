import { Portrait } from '../art/Portrait';
import { previewAction } from '../game/actions';
import { age, MINISTER_TITLES, PERSONALITIES } from '../game/characters';
import { consortCustom, consortHome, consortOrigin, consortsOf, household, maxConsorts, otherParent, relationTo } from '../game/family';
import { def, hasRulingHouse } from '../game/state';
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
  const consorts = consortsOf(w, me);
  const consort = consorts[0];
  const maxWives = maxConsorts(w, me);
  const family = household(w, me);
  const dynastic = hasRulingHouse(w, me);
  const acts: { kind: 'festival' | 'anticorruption' | 'designateHeir' | 'findConsort'; label: string }[] = [
    { kind: 'festival', label: 'Hold festivities' },
    { kind: 'anticorruption', label: 'Purge corrupt officials' },
    ...(!heir?.alive && !family.length ? [{ kind: 'designateHeir' as const, label: 'Designate an heir' }] : []),
  ];
  const nameHeir = (ch: Character) => {
    const pv = previewAction(w, me, { type: 'court', kind: 'chooseHeir', character: ch.id });
    if (!pv.valid) return;
    if (!heir?.alive) { s.dispatch({ type: 'court', kind: 'chooseHeir', character: ch.id }); return; }
    void s.askConfirm({ title: `Name ${ch.name} heir?`, body: `${heir.name} will be passed over. ${pv.consequences.slice(1).join(', ')}, stability −${pv.cost.stability}.`, confirmLabel: 'Proclaim the heir' }).then((ok) => { if (ok) s.dispatch({ type: 'court', kind: 'chooseHeir', character: ch.id }); });
  };
  return (
    <div>
      <Section title="The ruling house">
        <div className="grid grid-cols-3 gap-2">
          <Person label="Sovereign" ch={ruler} style={d.portrait} />
          <Person label="Heir" ch={heir} style={d.portrait} sub={heir?.alive ? relationTo(w, me, heir) : undefined} />
          <Person label={consorts.length > 1 ? 'Chief consort' : 'Consort'} ch={consort} style={consort?.origin ? def(consort.origin).portrait : d.portrait} sub={consort ? consortOrigin(w, consort) : undefined} />
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

      {dynastic ? (
        <Section title={`Consorts${consorts.length ? ` (${consorts.length}${maxWives > 1 ? ` of up to ${maxWives}` : ''})` : ''}`}>
          {consorts.length ? (
            <div className="space-y-1.5">
              {consorts.map((co, i) => {
                const home = consortHome(w, co);
                const kids = family.filter((ch) => ch.consortParent === co.id).length;
                return (
                  <div key={co.id} className="card flex items-center gap-3 p-2">
                    <Portrait style={co.origin ? def(co.origin).portrait : d.portrait} seed={co.portraitSeed} female={co.female} age={age(w, co)} size={42} />
                    <div className="min-w-0 flex-1 text-[13px]">
                      <div className="flex items-center gap-1.5 text-parchment">{co.name}{i === 0 && consorts.length > 1 ? <Badge tone="muted">chief</Badge> : null}</div>
                      <div className="text-[12px] text-parchment-dim">{home.from === 'our own nobility' ? 'Of our own nobility' : home.from.startsWith('House of') ? `Of the ${home.from}` : `From ${home.from}`} · {home.region}</div>
                      <div className="text-[11px] text-muted">{age(w, co)} yrs · {kids ? `${kids} living ${kids === 1 ? 'child' : 'children'}` : 'no living children'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-[12px] italic text-muted">The sovereign is unmarried.</p>}
          <p className="mt-2 text-[11px] text-muted">{consortCustom(w, me)} A royal marriage proposed in Diplomacy brings a consort from that house; or marry among our own nobility.</p>
          {(() => {
            const pv = previewAction(w, me, { type: 'court', kind: 'findConsort' });
            return (
              <button className="btn btn-ghost mt-2 !min-h-8 !py-1" disabled={!pv.valid} title={pv.valid ? pv.consequences.join(', ') : pv.errors.join(' ')} onClick={() => s.dispatch({ type: 'court', kind: 'findConsort' })}>
                {consorts.length ? 'Take another consort from our nobility' : 'Marry among our nobility'}{pv.cost.treasury ? ` · ${money(pv.cost.treasury)}` : ''}
              </button>
            );
          })()}
        </Section>
      ) : null}

      {dynastic ? (
        <Section title="The royal family">
          {family.length ? (
            <div className="space-y-1.5">
              {family.map((ch) => {
                const isHeir = ch.id === heir?.id;
                const pv = isHeir ? null : previewAction(w, me, { type: 'court', kind: 'chooseHeir', character: ch.id });
                return (
                  <div key={ch.id} className={`card flex items-center gap-3 p-2 ${isHeir ? '!border-gold/60 bg-gold/5' : ''}`}>
                    <Portrait style={d.portrait} seed={ch.portraitSeed} female={ch.female} age={age(w, ch)} size={42} />
                    <div className="min-w-0 flex-1 text-[13px]">
                      <div className="flex items-center gap-1.5 text-parchment">{ch.name}{isHeir ? <Badge>heir</Badge> : null}</div>
                      <div className="text-[12px] text-parchment-dim">{relationTo(w, me, ch)} · {age(w, ch) < 1 ? 'infant' : `${age(w, ch)} yrs`}{(() => { const op = otherParent(w, ch); return op ? ` · by ${op.name} (${consortHome(w, op).from === 'our own nobility' ? 'our nobility' : consortHome(w, op).from})` : ''; })()}</div>
                      <div className="text-[11px] text-muted">Adm {ch.adm} · Dip {ch.dip} · Mil {ch.mil}{ch.traits.length && age(w, ch) >= 16 ? ` · ${ch.traits.join(', ')}` : ''}</div>
                    </div>
                    {pv ? <button className="btn btn-ghost !min-h-8 shrink-0 !px-3 !py-1" disabled={!pv.valid} title={pv.valid ? pv.consequences.join(', ') : pv.errors.join(' ')} onClick={() => nameHeir(ch)}>Make heir</button> : null}
                  </div>
                );
              })}
            </div>
          ) : <p className="text-[12px] italic text-muted">{consort ? 'No children yet. Sons and daughters will be born to the royal couple in time.' : 'No princes or princesses of the blood. A married sovereign will have children in time.'}</p>}
          <p className="mt-2 text-[11px] text-muted">Any living son, daughter or kinsman can be named heir. Passing over a living heir costs legitimacy and angers the nobility.</p>
        </Section>
      ) : null}

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

function Person({ label, ch, style, sub }: { label: string; ch?: Character; style: Parameters<typeof Portrait>[0]['style']; sub?: string }) {
  const { w } = useWorld();
  return (
    <div className="card flex flex-col items-center p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-gold-dim">{label}</div>
      {ch?.alive ? (
        <>
          <Portrait style={style} seed={ch.portraitSeed} female={ch.female} age={age(w, ch)} size={58} />
          <div className="mt-1 text-[12px] leading-tight text-parchment">{ch.name}</div>
          <div className="text-[11px] text-muted">{age(w, ch)} yrs{sub ? ` · ${sub}` : ''}</div>
          {ch.traits[0] && age(w, ch) >= 16 ? <Badge tone="muted">{ch.traits[0]}</Badge> : null}
        </>
      ) : <div className="py-6 text-[12px] italic text-muted">none</div>}
    </div>
  );
}
