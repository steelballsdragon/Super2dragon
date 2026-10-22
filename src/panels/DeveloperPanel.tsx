import { useMemo, useState } from 'react';
import {
  DEV_STATS, DEV_TREATIES, devAddChild, devAddConsort, devAddTreaty, devAnnex, devEndReign, devFinishResearch, devGiveProvince, devGrantTechs,
  devPeaceAll, devRaiseArmy, devSetRelation, devSetStat, devTriggerEvent, type DevStat,
} from '../game/dev';
import { EVENTS } from '../game/events/defs';
import { refreshLedgers } from '../game/economy';
import { consortsOf, rulerOf } from '../game/family';
import { serialize } from '../game/save';
import { countryName, hasRulingHouse, opinion, provinceName, provincesOf } from '../game/state';
import type { TreatyType, WorldState } from '../game/types';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { Section } from '../ui/kit';
import { StorageDiagnostics } from './StorageDiagnostics';

/** Testing and repair tools. Edits bypass the rules and are noted in the campaign's chronicle. */
export function DeveloperPanel() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const [realm, setRealm] = useState(me);
  const [other, setOther] = useState('');
  const [relation, setRelation] = useState(0);
  const [treaty, setTreaty] = useState<TreatyType>('alliance');
  const [house, setHouse] = useState('');
  const [eventId, setEventId] = useState(EVENTS[0]?.id ?? '');
  const [months, setMonths] = useState(12);
  const [decide, setDecide] = useState(true);
  const [regiments, setRegiments] = useState({ infantry: 10, cavalry: 2, artillery: 2 });
  const target = w.countries[realm] ?? c;
  const realms = useMemo(() => Object.values(w.countries).filter((x) => x.alive).map((x) => ({ id: x.id, name: countryName(w, x.id) })).sort((a, b) => a.name.localeCompare(b.name)), [w, s.rev]);
  const houses = useMemo(() => realms.filter((x) => x.id !== realm && hasRulingHouse(w, x.id)), [realms, realm, w]);

  const run = (fn: (w: WorldState) => string) => {
    try {
      const msg = fn(w);
      refreshLedgers(w);
      s.bump();
      s.toast(msg, 'success');
    } catch (e) {
      s.toast((e as Error).message, 'warning');
    }
  };

  const RealmSelect = ({ value, onChange, list = realms, placeholder }: { value: string; onChange: (v: string) => void; list?: { id: string; name: string }[]; placeholder?: string }) => (
    <select className="input !py-1.5 text-[13px]" value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder ? <option value="">{placeholder}</option> : null}
      {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  );
  const busy = s.busy;
  const selected = s.selectedProvince;

  return (
    <div className="text-[13px]">
      <p className="mb-3 text-[12px] text-muted">Testing and repair tools. Edits ignore the rules of the game and are noted once in this campaign’s chronicle.</p>

      <Section title="Saves & storage">
        <StorageDiagnostics />
      </Section>

      <Section title="Realm to edit">
        <div className="flex gap-2">
          <RealmSelect value={realm} onChange={setRealm} />
          <button className="btn btn-quiet shrink-0 !px-2" onClick={() => setRealm(me)}>Mine</button>
          {s.selectedCountry && s.selectedCountry !== realm ? <button className="btn btn-quiet shrink-0 !px-2" onClick={() => setRealm(s.selectedCountry!)}>Selected</button> : null}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-1.5">
          {DEV_STATS.map((st) => <StatRow key={`${realm}-${st.id}-${s.rev}`} label={st.label} value={Math.round(target[st.id] as number)} onSet={(v) => run((w) => devSetStat(w, realm, st.id as DevStat, v))} />)}
        </div>
      </Section>

      <Section title="Time">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-20 !py-1.5" type="number" min={1} max={240} value={months} onChange={(e) => setMonths(Math.max(1, Math.min(240, Number(e.target.value) || 1)))} aria-label="Months to skip" />
          <span className="text-muted">months</span>
          {[1, 6, 12, 60].map((n) => <button key={n} className="btn btn-quiet !min-h-8 !px-2 !py-1" onClick={() => setMonths(n)}>{n}</button>)}
          <button className="btn btn-gold !min-h-8 !py-1" disabled={busy} onClick={() => void s.devAdvance(months, decide)}>{busy ? 'Working…' : 'Skip ahead'}</button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-[12px] text-parchment-dim"><input type="checkbox" checked={decide} onChange={(e) => setDecide(e.target.checked)} /> Let the council decide our events during the skip</label>
      </Section>

      <Section title="Royal family">
        <p className="mb-2 text-[12px] text-parchment-dim">{rulerOf(w, realm)?.name ?? 'No ruler'}{consortsOf(w, realm).length ? `, married to ${consortsOf(w, realm).map((x) => x.name).join(', ')}` : ', unmarried'}.</p>
        <div className="flex gap-2">
          <RealmSelect value={house} onChange={setHouse} list={houses} placeholder="Our own nobility" />
          <button className="btn btn-ghost shrink-0 !min-h-8 !py-1" onClick={() => run((w) => devAddConsort(w, realm, house || undefined))}>Add consort</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => run((w) => devAddChild(w, realm, 'son'))}>Add a son</button>
          <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => run((w) => devAddChild(w, realm, 'daughter'))}>Add a daughter</button>
          <button className="btn btn-quiet !min-h-8 !py-1 text-war" onClick={() => { void s.askConfirm({ title: `End the reign of ${rulerOf(w, realm)?.name ?? 'the sovereign'}?`, body: 'The sovereign dies and the heir succeeds.', confirmLabel: 'End the reign', tone: 'war' }).then((ok) => { if (ok) run((w) => devEndReign(w, realm)); }); }}>End the reign</button>
        </div>
      </Section>

      <Section title="Diplomacy">
        <RealmSelect value={other} onChange={(v) => { setOther(v); if (v) setRelation(Math.round(opinion(w, realm, v))); }} list={realms.filter((x) => x.id !== realm)} placeholder="Choose another realm…" />
        {other ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-muted">Relations</span>
              <input type="range" min={-200} max={200} value={relation} onChange={(e) => setRelation(Number(e.target.value))} className="flex-1" aria-label="Relations" />
              <span className="w-10 text-right tabular-nums">{relation}</span>
              <button className="btn btn-quiet !min-h-8 !px-2 !py-1" onClick={() => run((w) => devSetRelation(w, realm, other, relation))}>Set</button>
            </div>
            <div className="flex gap-2">
              <select className="input !py-1.5 text-[13px]" value={treaty} onChange={(e) => setTreaty(e.target.value as TreatyType)}>
                {DEV_TREATIES.map((t) => <option key={t} value={t}>{t === 'nap' ? 'non-aggression pact' : t === 'access' ? 'military access' : t}</option>)}
              </select>
              <button className="btn btn-ghost shrink-0 !min-h-8 !py-1" onClick={() => run((w) => devAddTreaty(w, realm, other, treaty))}>Sign</button>
            </div>
            <button className="btn btn-quiet !min-h-8 !py-1 text-war" onClick={() => { void s.askConfirm({ title: `Annex ${countryName(w, other)}?`, body: `All ${provincesOf(w, other).length} of its provinces pass to ${countryName(w, realm)}; its wars end and its forces disband.`, confirmLabel: 'Annex', tone: 'war' }).then((ok) => { if (ok) { run((w) => devAnnex(w, other, realm)); setOther(''); } }); }}>Annex {countryName(w, other)}</button>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => run((w) => devPeaceAll(w, realm))}>White peace in all wars</button>
          <button className="btn btn-ghost !min-h-8 !py-1" disabled={!selected} onClick={() => run((w) => devGiveProvince(w, selected!, realm))}>
            {selected ? `Give ${provinceName(selected)} to ${countryName(w, realm)}` : 'Select a province on the map to give it'}
          </button>
        </div>
      </Section>

      <Section title="Military">
        <div className="flex flex-wrap items-center gap-2">
          {(['infantry', 'cavalry', 'artillery'] as const).map((u) => (
            <label key={u} className="flex items-center gap-1 text-muted">
              {u}
              <input className="input !w-16 !py-1" type="number" min={0} max={200} value={regiments[u]} onChange={(e) => setRegiments({ ...regiments, [u]: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} />
            </label>
          ))}
          <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => run((w) => devRaiseArmy(w, realm, regiments))}>Raise at the capital</button>
        </div>
      </Section>

      <Section title="Technology">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost !min-h-8 !py-1" disabled={!target.research.tech} onClick={() => run((w) => devFinishResearch(w, realm))}>Finish current research</button>
          <button className="btn btn-ghost !min-h-8 !py-1" onClick={() => run((w) => devGrantTechs(w, realm))}>Grant what is available</button>
          <button className="btn btn-quiet !min-h-8 !py-1" onClick={() => run((w) => devGrantTechs(w, realm, true))}>Grant everything</button>
        </div>
        <p className="mt-1 text-[11px] text-muted">{target.techs.length} technologies known.</p>
      </Section>

      <Section title="Events">
        <div className="flex gap-2">
          <select className="input !py-1.5 text-[13px]" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {[...EVENTS].sort((a, b) => a.title.localeCompare(b.title)).map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
          <button className="btn btn-ghost shrink-0 !min-h-8 !py-1" onClick={() => run((w) => devTriggerEvent(w, eventId))}>Trigger</button>
        </div>
        <p className="mt-1 text-[11px] text-muted">Events fire for your realm and wait for your decision.</p>
      </Section>

      <Section title="Campaign">
        <CampaignInfo w={w} />
      </Section>
    </div>
  );
}

function StatRow({ label, value, onSet }: { label: string; value: number; onSet: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); onSet(Number(v)); }}>
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{label}</span>
      <input className="input !w-24 !py-1 text-right tabular-nums" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} aria-label={label} />
      <button className="btn btn-quiet !min-h-8 !px-2 !py-1">Set</button>
    </form>
  );
}

function CampaignInfo({ w }: { w: WorldState }) {
  const [size, setSize] = useState<number | null>(null);
  const rows: [string, string][] = [
    ['Campaign', `${w.campaign.name} (${w.campaign.id})`],
    ['Seed', String(w.campaign.seed)],
    ['Month', `${w.turn} (schema v${w.schemaVersion})`],
    ['Realms alive', String(Object.values(w.countries).filter((c) => c.alive).length)],
    ['Armies · fleets · wars', `${Object.keys(w.armies).length} · ${Object.keys(w.fleets).length} · ${Object.keys(w.wars).length}`],
    ['Characters', String(Object.keys(w.characters).length)],
    ['Developer tools used', w.flags.devUsed ? 'yes' : 'no'],
  ];
  return (
    <div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-all text-parchment-dim">{v}</dd></div>)}
        {size !== null ? <div className="contents"><dt className="text-muted">World data</dt><dd className="text-parchment-dim">{(size / 1024).toFixed(0)} KB uncompressed</dd></div> : null}
      </dl>
      <button className="btn btn-quiet mt-2 !min-h-8 !px-2 !py-1" onClick={() => setSize(serialize(w).length)}>Measure world data</button>
    </div>
  );
}
