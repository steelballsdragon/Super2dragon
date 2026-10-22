import { useMemo } from 'react';
import { GOODS } from '../game/constants';
import { computeTrade } from '../game/economy';
import { countryName, partner, provincesOf, treatiesOf } from '../game/state';
import { PROVINCE_DEFS, TRADE_NODE_DEFS } from '../game/static';
import type { TradeGoodId } from '../game/types';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { money, pct } from '../ui/format';
import { Empty, Section, Slider, Stat } from '../ui/kit';

export function TradePanel() {
  const { w, rev, me, c } = useWorld();
  const s = useGame();
  const trade = useMemo(() => computeTrade(w), [w, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const nodes = Object.entries(trade.nodes).filter(([, n]) => (n.shares[me] ?? 0) > 0.001).sort((a, b) => (b[1].shares[me] ?? 0) * b[1].collected - (a[1].shares[me] ?? 0) * a[1].collected);
  const goods = useMemo(() => {
    const count: Partial<Record<TradeGoodId, number>> = {};
    for (const id of provincesOf(w, me)) { const g = PROVINCE_DEFS[id].good; count[g] = (count[g] ?? 0) + 1; }
    return count;
  }, [w, me]);
  const agreements = treatiesOf(w, me, 'trade').map((t) => partner(t, me));
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Trade income" value={money(c.last.trade)} hint="per month" />
        <Stat label="Customs" value={money(c.last.tariffs)} hint="per month" />
        <Stat label="Agreements" value={agreements.length} />
      </div>
      <div className="mt-3"><Slider label="Tariffs" value={c.tariff} min={0} max={0.4} step={0.01} format={(v) => pct(v)} onChange={(v) => s.dispatch({ type: 'setTariff', value: v })} /></div>
      <Section title="Our share of the great markets" className="mt-4">
        {nodes.length ? (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="py-1">Market</th><th>Value</th><th>Our share</th><th className="text-right">Leading power</th></tr></thead>
            <tbody>
              {nodes.map(([id, n]) => {
                const lead = Object.entries(n.shares).sort((a, b) => b[1] - a[1])[0];
                return (
                  <tr key={id} className="border-t border-white/5">
                    <td className="py-1 text-parchment">{TRADE_NODE_DEFS[id]?.name}</td>
                    <td className="tabular text-parchment-dim">{n.total.toFixed(0)}</td>
                    <td className="tabular text-gold">{pct(n.shares[me] ?? 0, 1)}</td>
                    <td className="truncate text-right text-[12px] text-parchment-dim">{lead ? `${countryName(w, lead[0])} ${pct(lead[1])}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty>We take no share of any great market.</Empty>}
        <p className="mt-1 text-[11px] text-muted">Trade flows downstream from market to market. Harbours, markets, merchant ships and trade agreements raise our share.</p>
      </Section>
      <Section title="Trade agreements">
        {agreements.length ? <p className="text-[13px] text-parchment">{agreements.map((a) => countryName(w, a)).join(', ')}</p> : <Empty>None. Propose them from the Diplomacy panel.</Empty>}
      </Section>
      <Section title="World prices">
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[13px]">
          {(Object.keys(GOODS) as TradeGoodId[]).map((g) => {
            const p = w.prices[g] ?? GOODS[g].price;
            const ch = (p / GOODS[g].price - 1) * 100;
            return (
              <div key={g} className="flex justify-between border-b border-white/5 py-0.5">
                <span className={goods[g] ? 'text-parchment' : 'text-parchment-dim'}>{GOODS[g].name}{goods[g] ? <span className="text-[10px] text-gold"> ·{goods[g]}</span> : null}</span>
                <span className="tabular">{p.toFixed(2)} <span className={`text-[11px] ${ch >= 0 ? 'text-econ' : 'text-war'}`}>{ch >= 0 ? '+' : ''}{ch.toFixed(0)}%</span></span>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-muted">Gold marks goods our provinces produce (with count). Change is against 1800 prices.</p>
      </Section>
    </div>
  );
}
