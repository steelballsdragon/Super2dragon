import { useState } from 'react';
import { previewAction } from '../game/actions';
import { creditAvailable, loanRate, totalDebt } from '../game/economy';
import { foodBalance } from '../game/society';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { LineChart } from '../ui/LineChart';
import { money, pct } from '../ui/format';
import { Empty, Section, Slider, Stat, Tabs } from '../ui/kit';

type Tab = 'budget' | 'policy' | 'loans';

export function EconomyPanel() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const [tab, setTab] = useState<Tab>('budget');
  const L = c.last;
  const hist = w.playerHistory.slice(-60);
  const income: [string, number][] = [['Taxes', L.tax], ['Trade', L.trade], ['Tariffs & customs', L.tariffs], ['Tribute received', L.tribute], ['Subsidies received', L.subsidies], ['Other', L.other]];
  const expenses: [string, number][] = [['Army', L.army], ['Navy', L.navy], ['Buildings', L.buildings], ['Administration & court', L.administration], ['Research', L.research], ['Espionage', L.espionage], ['Diplomacy', L.diplomacy], ['Interest & repayments', L.interest], ['Tribute paid', L.tributePaid], ['Subsidies paid', L.subsidiesPaid]];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Treasury" value={money(c.treasury)} />
        <Stat label="Income" value={money(L.income)} hint="per month" />
        <Stat label="Balance" value={money(L.balance, { sign: true })} tone={L.balance < 0 ? 'bad' : 'good'} hint="per month" />
      </div>
      <Tabs<Tab> className="mt-3" value={tab} onChange={setTab} tabs={[{ id: 'budget', label: 'Budget' }, { id: 'policy', label: 'Taxes & spending' }, { id: 'loans', label: 'Debt' }]} />
      {tab === 'budget' ? (
        <div className="mt-3">
          <Section title="Monthly income"><Ledger rows={income} total={L.income} /></Section>
          <Section title="Monthly expenditure"><Ledger rows={expenses} total={L.expenses} /></Section>
          <Section title="Income and expenditure">
            <LineChart title="Monthly income and expenditure" turns={hist.map((h) => h.turn)} series={[{ name: 'Income', values: hist.map((h) => h.income) }, { name: 'Expenditure', values: hist.map((h) => h.expenses) }]} format={(v) => money(v)} />
          </Section>
          <Section title="Indicators">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Inflation" value={`${c.inflation.toFixed(1)}%`} tone={c.inflation > 10 ? 'bad' : undefined} />
              <Stat label="Economic cycle" value={c.cycle > 0.3 ? 'Boom' : c.cycle < -0.3 ? 'Recession' : 'Steady'} tone={c.cycle > 0.3 ? 'good' : c.cycle < -0.3 ? 'bad' : undefined} />
              <Stat label="Food reserve" value={`${c.foodStock.toFixed(1)} months`} hint={`${foodBalance(w, me) >= 0 ? 'surplus' : 'deficit'} this year`} tone={c.foodStock < 1 ? 'bad' : undefined} />
              <Stat label="Corruption" value={Math.round(c.corruption)} hint="raises administration costs" tone={c.corruption > 30 ? 'bad' : undefined} />
            </div>
          </Section>
        </div>
      ) : null}
      {tab === 'policy' ? (
        <div className="mt-3 space-y-4">
          <Slider label="Tax rate" value={c.taxRate} min={0.01} max={0.4} step={0.01} format={(v) => pct(v)} onChange={(v) => s.dispatch({ type: 'setTax', value: v })} hint="Higher taxes raise revenue but stir unrest where they exceed custom (about 12%)." />
          <Slider label="Tariffs" value={c.tariff} min={0} max={0.4} step={0.01} format={(v) => pct(v)} onChange={(v) => s.dispatch({ type: 'setTariff', value: v })} hint="Customs revenue against trade volume and merchant goodwill." />
          <Slider label="Research spending" value={c.budget.research} min={0} max={2} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => s.dispatch({ type: 'setBudget', research: v }, { quiet: true })} />
          <Slider label="Espionage spending" value={c.budget.espionage} min={0} max={2} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => s.dispatch({ type: 'setBudget', espionage: v }, { quiet: true })} />
          <Slider label="Administration spending" value={c.budget.administration} min={0.5} max={2} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => s.dispatch({ type: 'setBudget', administration: v }, { quiet: true })} hint="Better-paid officials collect taxes more efficiently and steal less." />
        </div>
      ) : null}
      {tab === 'loans' ? <Loans /> : null}
    </div>
  );
}

function Ledger({ rows, total }: { rows: [string, number][]; total: number }) {
  const shown = rows.filter(([, v]) => Math.abs(v) >= 0.05);
  if (!shown.length) return <Empty>Nothing this month.</Empty>;
  return (
    <table className="w-full text-[13px]">
      <tbody>
        {shown.map(([k, v]) => (
          <tr key={k} className="border-b border-white/5">
            <td className="py-1 text-parchment-dim">{k}</td>
            <td className="w-1/3 py-1"><div className="h-1.5 rounded bg-ink"><div className="h-full rounded bg-gold/70" style={{ width: `${Math.min(100, (v / Math.max(1, total)) * 100)}%` }} /></div></td>
            <td className="tabular w-20 py-1 text-right text-parchment">{money(v)}</td>
          </tr>
        ))}
        <tr><td className="pt-1.5 font-semibold text-parchment">Total</td><td /><td className="tabular pt-1.5 text-right font-semibold text-gold-bright">{money(total)}</td></tr>
      </tbody>
    </table>
  );
}

function Loans() {
  const { w, me, c } = useWorld();
  const s = useGame();
  const avail = creditAvailable(w, me);
  const [amount, setAmount] = useState(Math.round(Math.min(avail, Math.max(20, c.last.income * 3))));
  const pv = previewAction(w, me, { type: 'takeLoan', amount });
  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total debt" value={money(totalDebt(w, me))} />
        <Stat label="Interest" value={money(c.last.interest)} hint="per month" />
        <Stat label="Credit" value={money(avail)} hint={`at ${(loanRate(w, me) * 100).toFixed(1)}%`} />
      </div>
      <Section title="Outstanding loans" className="mt-3">
        {c.loans.length ? (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="py-1">Lender</th><th>Principal</th><th>Rate</th><th>Term</th><th /></tr></thead>
            <tbody>
              {c.loans.map((l) => (
                <tr key={l.id} className="border-t border-white/5">
                  <td className="py-1 text-parchment-dim">{l.lender}</td>
                  <td className="tabular">{money(l.principal)}</td>
                  <td className="tabular">{(l.rate * 100).toFixed(1)}%</td>
                  <td className="tabular">{l.monthsLeft === null ? 'perpetual' : `${l.monthsLeft} mo`}</td>
                  <td className="text-right"><button className="btn btn-quiet !min-h-0 !px-2 !py-0.5 text-[10px]" disabled={c.treasury < l.principal} onClick={() => s.dispatch({ type: 'repayLoan', loanId: l.id })}>Repay</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>The crown owes nothing.</Empty>}
      </Section>
      <Section title="Raise a loan">
        <div className="flex items-end gap-2">
          <label className="flex-1 text-[13px] text-parchment-dim">Amount (£ thousands)
            <input type="number" min={1} className="input mt-1" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} />
          </label>
          <button className="btn btn-gold" disabled={!pv.valid} onClick={() => s.dispatch({ type: 'takeLoan', amount })}>Borrow</button>
        </div>
        <p className={`mt-1.5 text-[12px] ${pv.valid ? 'text-parchment-dim' : 'text-war'}`}>{pv.valid ? `${pv.summary}. ${pv.consequences.join(' ')}` : pv.errors.join(' ')}</p>
        {pv.valid && pv.risks.length ? <p className="text-[12px] text-gold">{pv.risks.join(' ')}</p> : null}
      </Section>
    </div>
  );
}
