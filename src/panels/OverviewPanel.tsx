import { Flag } from '../art/Flag';
import { Portrait } from '../art/Portrait';
import { RELIGION_NAME } from '../game/constants';
import { totalDebt } from '../game/economy';
import { maxManpower } from '../game/military';
import { age } from '../game/characters';
import { alliesOf, countryPopulation, def, provincesOf, subjectsOf, totalRegiments, warsOf } from '../game/state';
import { researchPoints } from '../game/tech';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { LineChart } from '../ui/LineChart';
import { dateOf, money, people } from '../ui/format';
import { Badge, CountryChip, Meter, Section, Stat } from '../ui/kit';

export function OverviewPanel() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const d = def(me);
  const ruler = w.characters[c.rulerId];
  const heir = c.heirId ? w.characters[c.heirId] : undefined;
  const hist = w.playerHistory.slice(-72);
  const fleets = Object.values(w.fleets).filter((f) => f.owner === me).reduce((n, f) => n + f.ships.line + f.ships.frigate + f.ships.transport, 0);
  return (
    <div>
      <div className="flex gap-3">
        {ruler ? <Portrait style={d.portrait} seed={ruler.portraitSeed} female={ruler.female} age={age(w, ruler)} size={86} title={ruler.name} /> : null}
        <div className="min-w-0 flex-1">
          <Flag spec={d.flag} width={46} />
          <h3 className="mt-1 font-display text-lg leading-tight text-gold-bright">{d.name}</h3>
          <p className="text-[13px] text-parchment-dim">{ruler?.name}, {d.rulerTitle} · aged {ruler ? age(w, ruler) : '?'}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge>{d.government}</Badge><Badge tone="muted">{RELIGION_NAME[d.religion]}</Badge>
            {ruler?.traits.slice(0, 3).map((t) => <Badge key={t} tone="muted">{t}</Badge>)}
          </div>
          {ruler ? <p className="mt-1 text-[12px] text-muted">Administration {ruler.adm} · Diplomacy {ruler.dip} · Military {ruler.mil}{heir?.alive ? ` · Heir: ${heir.name} (${age(w, heir)})` : ' · No designated heir'}</p> : null}
        </div>
      </div>

      <Section title={`The realm in ${dateOf(w.turn)}`} className="mt-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Treasury" value={money(c.treasury)} hint={`${money(c.last.balance, { sign: true })} / month`} tone={c.last.balance < 0 ? 'bad' : undefined} />
          <Stat label="Population" value={people(countryPopulation(w, me))} hint={`${provincesOf(w, me).length} provinces`} />
          <Stat label="Army" value={`${Math.round(totalRegiments(w, me) * 1000).toLocaleString('en')}`} hint={`manpower ${Math.round(c.manpower)}k / ${Math.round(maxManpower(w, me))}k`} />
          <Stat label="Navy" value={`${Math.round(fleets)} ships`} />
          <Stat label="Research" value={`${researchPoints(w, me).toFixed(1)}/mo`} hint={`${c.techs.length} technologies`} />
          <Stat label="Debt" value={money(totalDebt(w, me))} hint={`inflation ${c.inflation.toFixed(1)}%`} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <Meter label="Stability" right={Math.round(c.stability)} value={c.stability} color="#4f9f78" />
          <Meter label="Legitimacy" right={Math.round(c.legitimacy)} value={c.legitimacy} color="#d9b46b" />
          <Meter label="Prestige" right={Math.round(c.prestige)} value={c.prestige} color="#5b8db8" />
          <Meter label="Corruption" right={Math.round(c.corruption)} value={c.corruption} color="#b0473e" />
          <Meter label="War exhaustion" right={Math.round(c.warExhaustion)} value={c.warExhaustion} color="#b0473e" />
          <Meter label="Food reserve" right={`${c.foodStock.toFixed(1)} mo`} value={c.foodStock} max={6} color="#4f9f78" />
        </div>
      </Section>

      <Section title="Treasury">
        <LineChart title="Treasury by month" turns={hist.map((h) => h.turn)} series={[{ name: 'Treasury', values: hist.map((h) => h.treasury) }]} format={(v) => money(v)} />
      </Section>

      <Section title="Standing in the world">
        <div className="space-y-1.5 text-[13px]">
          {c.overlord ? <div className="flex items-center gap-2"><span className="w-20 text-muted">Overlord</span><CountryChip w={w} id={c.overlord} onClick={() => { s.selectCountry(c.overlord!); s.openPanel('diplomacy'); }} /></div> : null}
          <Row label="Allies" ids={alliesOf(w, me)} />
          <Row label="Subjects" ids={subjectsOf(w, me)} />
          <Row label="Rivals" ids={c.rivals.filter((r) => w.countries[r]?.alive)} />
          <div className="flex gap-2"><span className="w-20 shrink-0 text-muted">Wars</span><span className="text-parchment">{warsOf(w, me).map((x) => x.name).join(', ') || 'At peace'}</span></div>
        </div>
      </Section>

      {w.decisions.length ? (
        <Section title="Recent decisions">
          <ul className="space-y-0.5 text-[13px]">{w.decisions.slice(-6).reverse().map((dd, i) => <li key={i} className="flex gap-2"><span className="w-20 shrink-0 text-muted">{dateOf(dd.turn).replace(/^(\w{3})\w*/, '$1')}</span><span className="text-parchment-dim">{dd.summary}</span></li>)}</ul>
        </Section>
      ) : null}
    </div>
  );
}

function Row({ label, ids }: { label: string; ids: string[] }) {
  const { w } = useWorld();
  const s = useGame();
  if (!ids.length) return null;
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1">{ids.map((id) => <CountryChip key={id} w={w} id={id} size={18} onClick={() => { s.selectCountry(id); s.openPanel('diplomacy'); }} />)}</div>
    </div>
  );
}
