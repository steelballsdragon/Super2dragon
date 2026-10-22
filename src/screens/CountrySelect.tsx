import { ArrowLeft, Crown, Landmark, Search, Shield, Star, Swords, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Flag } from '../art/Flag';
import { Portrait } from '../art/Portrait';
import { RELIGION_NAME } from '../game/constants';
import { countryPopulation, totalRegiments } from '../game/state';
import { POLITIES, POLITY_LIST, provincePoint } from '../game/static';
import type { Continent, Difficulty, PolityType } from '../game/types';
import { WorldMap } from '../map/WorldMap';
import { useGame } from '../store/game';
import { money, people } from '../ui/format';
import { Badge, Meter, Ornate } from '../ui/kit';
import { previewWorld } from './previewWorld';


const CONTINENTS: (Continent | 'All')[] = ['All', 'Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'];
const GOV: { id: 'all' | PolityType; label: string }[] = [
  { id: 'all', label: 'All forms' }, { id: 'monarchy', label: 'Monarchies' }, { id: 'republic', label: 'Republics' },
  { id: 'feudal', label: 'Feudal & regency' }, { id: 'theocracy', label: 'Theocracies' }, { id: 'confederation', label: 'Confederations' },
  { id: 'decentralized', label: 'Chiefdoms & peoples' }, { id: 'nomadic', label: 'Nomadic' }, { id: 'colony', label: 'Colonies' },
  { id: 'chartered_company', label: 'Companies' }, { id: 'city_state', label: 'City-states' },
];
const FEATURED = ['maratha', 'great_britain', 'qing', 'france', 'sikh_misls', 'tokugawa', 'ottoman', 'usa', 'ashanti', 'qajar_persia', 'mysore', 'haudenosaunee', 'hawaii', 'ngapuhi'];

export function CountrySelect() {
  const { setScreen, newGame } = useGame();
  const w = useMemo(previewWorld, []);
  const [q, setQ] = useState('');
  const [continent, setContinent] = useState<Continent | 'All'>('All');
  const [gov, setGov] = useState<'all' | PolityType>('all');
  const [diff, setDiff] = useState(0);
  const [selected, setSelected] = useState<string>('maratha');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [name, setName] = useState('');
  const [focus, setFocus] = useState<{ x: number; y: number; k?: number; t: number } | null>(null);
  const [showList, setShowList] = useState(false);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return POLITY_LIST.filter((p) => p.playable && w.countries[p.id]?.alive)
      .filter((p) => continent === 'All' || p.continent === continent)
      .filter((p) => gov === 'all' || p.polityType === gov)
      .filter((p) => !diff || p.difficulty === diff)
      .filter((p) => !ql || [p.name, p.short, p.adjective, p.capitalName, p.region, ...(p.aliases ?? [])].some((s) => s?.toLowerCase().includes(ql)))
      .sort((a, b) => (FEATURED.includes(b.id) ? 1 : 0) - (FEATURED.includes(a.id) ? 1 : 0) || b.population - a.population);
  }, [q, continent, gov, diff, w]);

  const choose = (id: string, fly = true) => {
    if (!POLITIES[id]?.playable) return;
    setSelected(id);
    setShowList(false);
    if (fly) {
      const cap = w.countries[id]?.capital;
      if (cap) { const [x, y] = provincePoint(cap); setFocus({ x, y, k: 2.2, t: Date.now() }); }
    }
  };

  const d = POLITIES[selected];
  const c = w.countries[selected];
  const ruler = c ? w.characters[c.rulerId] : undefined;

  return (
    <div className="flex h-full flex-col bg-ink">
      <header className="flex items-center gap-3 border-b border-gold/20 bg-navy px-3 py-2">
        <button className="btn btn-quiet !px-2" onClick={() => setScreen('menu')}><ArrowLeft size={16} /> Menu</button>
        <h1 className="title-gilt text-base sm:text-lg">Choose Your Realm</h1>
        <span className="ml-auto hidden font-serif text-sm italic text-parchment-dim md:block">1 January 1800 · every throne, council and chieftaincy is playable</span>
        <button className="btn btn-ghost lg:hidden" onClick={() => setShowList((v) => !v)}>{showList ? 'Map' : 'List'}</button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Left: filters and list */}
        <aside className={`${showList ? 'flex' : 'hidden'} absolute inset-0 z-20 w-full flex-col border-r border-gold/15 bg-navy lg:static lg:flex lg:w-80`}>
          <div className="space-y-2 border-b border-gold/10 p-3">
            <label className="relative block">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input !pl-8" placeholder="Search realms, capitals, regions…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </label>
            <div className="flex flex-wrap gap-1">
              {CONTINENTS.map((ct) => (
                <button key={ct} className={`chip ${continent === ct ? '!border-gold text-gold-bright' : 'text-parchment-dim'}`} onClick={() => setContinent(ct)}>{ct}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <select className="input !py-1.5 text-sm" value={gov} onChange={(e) => setGov(e.target.value as 'all' | PolityType)} aria-label="Form of government">
                {GOV.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              <select className="input !w-32 !py-1.5 text-sm" value={diff} onChange={(e) => setDiff(Number(e.target.value))} aria-label="Difficulty">
                <option value={0}>Any challenge</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
              </select>
            </div>
            <div className="text-[11px] text-muted">{list.length} realms</div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto scroll-thin" role="listbox" aria-label="Realms">
            {list.map((p) => (
              <li key={p.id}>
                <button
                  role="option"
                  aria-selected={p.id === selected}
                  onClick={() => choose(p.id)}
                  className={`flex w-full items-center gap-3 border-b border-white/[0.04] px-3 py-2 text-left transition-colors ${p.id === selected ? 'bg-gold/10' : 'hover:bg-white/[0.03]'}`}
                >
                  <Flag spec={p.flag} width={30} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${p.id === selected ? 'text-gold-bright' : 'text-parchment'}`}>{p.name}</span>
                    <span className="block truncate text-[11px] text-muted">{p.region} · {people(p.population / 1000)}</span>
                  </span>
                  <span className="text-[10px] text-gold-dim">{'★'.repeat(p.difficulty)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Centre: map */}
        <main className="relative min-w-0 flex-1">
          <WorldMap
            world={w}
            rev={0}
            layer="political"
            viewer={selected}
            selectedCountry={selected}
            markers={{ armies: false, fleets: false, forts: false, ports: false, trade: false, capitals: true }}
            focus={focus}
            initial={{ x: 1340, y: 380, k: 1.2 }}
            onProvinceClick={(pid) => { const o = w.provinces[pid]?.owner; if (o) choose(o, false); }}
            renderTooltip={(pid) => {
              const o = w.provinces[pid]?.owner;
              const od = o ? POLITIES[o] : undefined;
              return (
                <div className="panel px-3 py-2 text-sm">
                  {od ? <div className="flex items-center gap-2"><Flag spec={od.flag} width={22} /><span className="text-parchment">{od.name}</span></div> : <span className="text-muted">Unclaimed</span>}
                  <div className="mt-0.5 text-[11px] text-muted">{w.provinces[pid] ? `${pid.replace(/_/g, ' ')}` : ''}{od && !od.playable ? ' · not playable' : ''}</div>
                </div>
              );
            }}
          />
        </main>

        {/* Right: realm card */}
        {d && c ? (
          <aside className="absolute inset-x-0 bottom-0 z-10 max-h-[58%] overflow-y-auto border-t border-gold/20 bg-navy/95 backdrop-blur scroll-thin lg:static lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0">
            <Ornate className="m-3 !rounded-md p-4">
              <div className="flex items-start gap-3">
                <Portrait style={d.portrait} seed={ruler?.portraitSeed ?? 1} female={ruler?.female} age={ruler ? 1800 - ruler.born : 40} size={72} title={ruler?.name} />
                <div className="min-w-0 flex-1">
                  <Flag spec={d.flag} width={54} className="mb-1.5" />
                  <h2 className="font-display text-lg leading-tight text-gold-bright">{d.name}</h2>
                  <p className="text-[13px] text-parchment-dim">{ruler?.name ?? d.ruler[0]} · <span className="italic">{d.rulerTitle}</span></p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge>{d.government}</Badge>
                <Badge tone="muted">{RELIGION_NAME[d.religion]}</Badge>
                <Badge tone="muted">{d.culture}</Badge>
                {d.overlord ? <Badge tone="diplo">Subject of {POLITIES[d.overlord]?.short}</Badge> : null}
              </div>
              <p className="mt-3 font-serif text-[15.5px] leading-snug text-parchment">{d.intro}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Fact icon={<Landmark size={13} />} label="Capital" value={d.capitalName} />
                <Fact icon={<Users size={13} />} label="Population" value={people(countryPopulation(w, selected))} />
                <Fact label="Treasury" value={money(c.treasury)} />
                <Fact label="Income / month" value={money(c.last.income)} />
                <Fact label="Expenditure" value={money(c.last.expenses)} />
                <Fact label="Debt" value={money(c.loans.reduce((s, l) => s + l.principal, 0))} />
                <Fact icon={<Shield size={13} />} label="Army" value={`${Math.round(totalRegiments(w, selected) * 1000).toLocaleString('en')} men`} />
                <Fact label="Technologies" value={`${c.techs.length}`} />
              </div>
              <div className="mt-3 space-y-2">
                <Meter label="Stability" right={Math.round(c.stability)} value={c.stability} color="#4f9f78" />
                <Meter label="Legitimacy" right={Math.round(c.legitimacy)} value={c.legitimacy} color="#d9b46b" />
              </div>
              {(d.rivals.length || d.allies.length) ? (
                <div className="mt-3 space-y-1 text-[13px]">
                  {d.allies.length ? <div className="flex flex-wrap items-center gap-1.5"><span className="text-diplo">Allies</span>{d.allies.map((a) => POLITIES[a] ? <span key={a} className="chip text-parchment-dim"><Flag spec={POLITIES[a].flag} width={14} />{POLITIES[a].short}</span> : null)}</div> : null}
                  {d.rivals.length ? <div className="flex flex-wrap items-center gap-1.5"><span className="text-war"><Swords size={12} className="inline" /> Rivals</span>{d.rivals.map((a) => POLITIES[a] ? <span key={a} className="chip text-parchment-dim"><Flag spec={POLITIES[a].flag} width={14} />{POLITIES[a].short}</span> : null)}</div> : null}
                </div>
              ) : null}
              <div className="mt-3 flex items-center gap-2 text-sm text-parchment-dim">
                Challenge {Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} className={i < d.difficulty ? 'fill-gold text-gold' : 'text-line'} />)}
              </div>

              <div className="mt-4 space-y-2 border-t border-gold/15 pt-3">
                <input className="input text-sm" placeholder={`Campaign name (e.g. “The ${d.adjective} Century”)`} value={name} onChange={(e) => setName(e.target.value)} aria-label="Campaign name" />
                <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Difficulty">
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map((df) => (
                    <button key={df} role="radio" aria-checked={difficulty === df} className={`btn !min-h-8 !py-1 ${difficulty === df ? 'btn-ghost !border-gold text-gold-bright' : 'btn-quiet'}`} onClick={() => setDifficulty(df)}>{df}</button>
                  ))}
                </div>
                <button className="btn btn-gold w-full !py-3 text-sm" onClick={() => newGame({ playerId: selected, difficulty, name: name.trim() || undefined })}>
                  <Crown size={16} /> Play as {d.short}
                </button>
              </div>
            </Ornate>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded border border-white/5 bg-ink/40 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">{icon}{label}</div>
      <div className="tabular truncate text-parchment">{value}</div>
    </div>
  );
}
