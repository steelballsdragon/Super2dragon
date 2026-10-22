import { Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Portrait } from '../../art/Portrait';
import { interpretWithClaude, llmActive } from '../../advisor/llm';
import { COMMAND_EXAMPLES, executePlan, interpretCommand, type CommandPlan } from '../../game/advisor';
import { MINISTER_TITLES } from '../../game/characters';
import { def } from '../../game/state';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';
import { money, monthsText } from '../../ui/format';

export function CouncilBox({ initial }: { initial?: string }) {
  const { w, me } = useWorld();
  const s = useGame();
  const [text, setText] = useState(initial ?? '');
  const [plan, setPlan] = useState<CommandPlan | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const order = useGame((st) => st.councilOrder);
  useEffect(() => {
    if (!order) return;
    setText(order.text);
    void submit(order.text);
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps
  const examples = useMemo(() => COMMAND_EXAMPLES.slice((w.turn * 3) % 9, ((w.turn * 3) % 9) + 4), [w.turn]);

  const submit = async (order: string) => {
    const t = order.trim();
    if (!t) return;
    setNotice(null);
    let p: CommandPlan;
    if (llmActive()) {
      setLoading(true);
      const r = await interpretWithClaude(w, me, t);
      setLoading(false);
      if (r.ok) p = r.plan;
      else { p = r.fallback; setNotice(`${r.error} The council answered by its own lights instead.`); }
    } else p = interpretCommand(w, me, t);
    setPlan(p);
    setChecked(new Set(p.steps.map((st, i) => (st.preview.valid && !st.optional ? i : -1)).filter((i) => i >= 0)));
  };

  const carryOut = () => {
    if (!plan) return;
    if (s.busy) { s.toast('The month is being processed; try again in a moment.', 'warning'); return; }
    const results = executePlan(w, me, plan, [...checked].sort((a, b) => a - b));
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    s.bump();
    if (ok.length) s.toast(`${ok.length} order${ok.length > 1 ? 's' : ''} carried out. ${ok[0].message}`, 'success');
    for (const f of failed.slice(0, 2)) s.toast(f.message, 'warning');
    setPlan(null);
    setText('');
  };

  const minister = plan ? w.characters[w.countries[me].ministers[plan.minister] ?? ''] : undefined;
  const selTotal = plan ? [...checked].reduce((sum, i) => sum + (plan.steps[i]?.preview.cost.treasury ?? 0), 0) : 0;

  return (
    <div>
      <form className="relative" onSubmit={(e) => { e.preventDefault(); void submit(text); }}>
        <textarea
          className="input min-h-[64px] resize-none !pr-10 font-serif text-[15px]"
          placeholder="Give an order to your council… e.g. “Build textile mills near the capital.”"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(text); } }}
          aria-label="Order to the council"
        />
        <button className="btn btn-gold absolute bottom-2 right-2 !min-h-0 !p-1.5" aria-label="Submit order" disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>
      {!plan ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {examples.map((ex) => <button key={ex} className="chip text-[11px] text-parchment-dim hover:border-gold hover:text-parchment" onClick={() => { setText(ex); void submit(ex); }}>{ex}</button>)}
          {llmActive() ? <span className="chip border-diplo/50 text-[10px] text-[#9cc0e2]"><Sparkles size={10} /> Claude interprets orders</span> : null}
        </div>
      ) : null}
      {notice ? <p className="mt-1.5 text-[11px] text-gold">{notice}</p> : null}
      {plan ? (
        <div className="card mt-2 p-2.5 animate-rise">
          <div className="flex gap-2.5">
            {minister ? <Portrait style={def(me).portrait} seed={minister.portraitSeed} female={minister.female} age={1800 + Math.floor(w.turn / 12) - minister.born} size={42} frame /> : null}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wider text-gold-dim">{plan.speaker} · {MINISTER_TITLES[plan.minister]}</div>
              <p className="font-serif text-[15px] leading-snug text-parchment">{plan.reply}</p>
            </div>
            <button className="btn btn-quiet !min-h-0 self-start !p-1" onClick={() => setPlan(null)} aria-label="Dismiss"><X size={14} /></button>
          </div>
          {plan.steps.length ? (
            <ul className="mt-2 space-y-1">
              {plan.steps.map((st, i) => (
                <li key={i}>
                  <label className={`flex gap-2 rounded px-1.5 py-1 text-[13px] ${st.preview.valid ? 'cursor-pointer hover:bg-white/5' : 'opacity-60'}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 accent-[#d9b46b]"
                      disabled={!st.preview.valid}
                      checked={checked.has(i)}
                      onChange={(e) => { const n = new Set(checked); if (e.target.checked) n.add(i); else n.delete(i); setChecked(n); }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-parchment">{st.preview.summary}</span>
                      {st.optional ? <span className="ml-1 text-[10px] uppercase text-muted">optional</span> : null}
                      <span className="block text-[11px] text-parchment-dim">
                        {[st.preview.cost.treasury ? `${money(st.preview.cost.treasury)}` : '', st.preview.cost.months ? monthsText(st.preview.cost.months) : '', st.preview.cost.stability ? `−${st.preview.cost.stability} stability` : '', st.preview.chance !== undefined ? `${Math.round(st.preview.chance * 100)}% likely` : ''].filter(Boolean).join(' · ')}
                      </span>
                      {!st.preview.valid ? <span className="block text-[11px] text-war">{st.preview.errors.join(' ')}</span> : null}
                      {st.preview.valid && st.preview.risks.length ? <span className="block text-[11px] text-gold">Risk: {st.preview.risks.join('; ')}</span> : null}
                      {st.preview.valid && st.preview.consequences.length ? <span className="block text-[11px] text-muted">{st.preview.consequences.slice(0, 2).join(' · ')}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {plan.notes.length ? <ul className="mt-1.5 space-y-0.5 text-[11px] text-parchment-dim">{plan.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul> : null}
          {plan.steps.length ? (
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-gold/10 pt-2">
              <span className="tabular text-[12px] text-parchment-dim">Selected cost {money(selTotal)} of {money(w.countries[me].treasury)}</span>
              <button className="btn btn-gold !min-h-8 !py-1" disabled={!checked.size} onClick={carryOut}><Check size={14} /> Carry out</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
