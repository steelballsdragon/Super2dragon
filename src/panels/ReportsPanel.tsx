import { useState } from 'react';
import { useWorld } from '../store/hooks';
import { LineChart } from '../ui/LineChart';
import { dateOf, money, people, signed } from '../ui/format';
import { Empty, KeyValue, Section, Tabs } from '../ui/kit';

type Period = 'month' | 'quarter' | 'year';
const LEN: Record<Period, number> = { month: 1, quarter: 3, year: 12 };

export function ReportsPanel() {
  const { w, me } = useWorld();
  const [period, setPeriod] = useState<Period>('quarter');
  const h = w.playerHistory;
  const n = LEN[period];
  if (!h.length) return <Empty>The first report will be drawn up at the end of this month.</Empty>;
  const end = h[h.length - 1];
  const startIdx = Math.max(0, h.length - 1 - n);
  const start = h[startIdx];
  const span = h.slice(h.length - n);
  const from = span[0].turn;
  const income = span.reduce((s, x) => s + x.income, 0);
  const expenses = span.reduce((s, x) => s + x.expenses, 0);
  const battles = w.battles.filter((b) => b.turn >= from && (b.attacker.owner === me || b.defender.owner === me));
  const won = battles.filter((b) => (b.winner === 'attacker' ? b.attacker.owner : b.defender.owner) === me).length;
  const decisions = w.decisions.filter((d) => d.turn >= from);
  const events = w.chronicle.filter((e) => e.turn >= from && (e.countries.includes(me) || e.importance >= 3)).slice(0, 12);
  const last = h.slice(-Math.min(h.length, period === 'year' ? 120 : period === 'quarter' ? 48 : 24));
  return (
    <div>
      <Tabs<Period> value={period} onChange={setPeriod} tabs={[{ id: 'month', label: 'Monthly' }, { id: 'quarter', label: 'Quarterly' }, { id: 'year', label: 'Annual' }]} />
      <h3 className="mt-3 font-display text-[13px] uppercase tracking-[0.14em] text-gold">Report for {dateOf(from)} – {dateOf(end.turn)}</h3>
      <Section title="Accounts" className="mt-2">
        <KeyValue rows={[
          ['Revenue collected', money(income)],
          ['Expenditure', money(expenses)],
          ['Net', money(income - expenses, { sign: true })],
          ['Treasury', `${money(start.treasury)} → ${money(end.treasury)}`],
        ]} />
      </Section>
      <Section title="The realm">
        <KeyValue rows={[
          ['Population', `${people(start.population)} → ${people(end.population)} (${signed(((end.population / Math.max(1, start.population)) - 1) * 100, 1)}%)`],
          ['Stability', `${start.stability} → ${end.stability}`],
          ['Army (regiments)', `${start.armySize} → ${end.armySize}`],
          ['Research per month', `${start.research} → ${end.research}`],
          ['Battles', battles.length ? `${won} won, ${battles.length - won} lost` : 'none'],
        ]} />
      </Section>
      <Section title="Trend">
        <LineChart title="Monthly revenue and expenditure" turns={last.map((x) => x.turn)} series={[{ name: 'Revenue', values: last.map((x) => x.income) }, { name: 'Expenditure', values: last.map((x) => x.expenses) }]} format={(v) => money(v)} />
      </Section>
      <Section title="Decisions taken">
        {decisions.length ? <ul className="space-y-0.5 text-[13px] text-parchment-dim">{decisions.slice(-15).reverse().map((d, i) => <li key={i}>• {d.summary}</li>)}</ul> : <Empty>No decisions recorded in this period.</Empty>}
      </Section>
      <Section title="Notable events">
        {events.length ? <ul className="space-y-0.5 text-[13px] text-parchment-dim">{events.map((e, i) => <li key={i}>• {e.text}</li>)}</ul> : <Empty>A quiet period.</Empty>}
      </Section>
    </div>
  );
}
