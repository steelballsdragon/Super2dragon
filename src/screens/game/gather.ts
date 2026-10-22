// "Gather all our armies here": previews the order, confirms it, then marches (or ships) every army that can reach.
// When they would arrive months apart, offers to hold the nearer ones back so all arrive together.
import { previewAction } from '../../game/actions';
import { atWar, provinceName } from '../../game/state';
import { gatherPlan } from '../../game/voyage';
import { useGame } from '../../store/game';

const months = (n: number) => `${Math.max(1, Math.round(n))} month${Math.round(n) > 1 ? 's' : ''}`;

export function orderGather(pid: string): void {
  const st = useGame.getState();
  const w = st.world;
  if (!w) return;
  const pv = previewAction(w, w.playerId, { type: 'gatherArmies', target: pid });
  if (!pv.valid) { st.toast(pv.errors.join(' '), 'warning'); return; }
  const go = (together: boolean) => { st.setPick(null); st.dispatch({ type: 'gatherArmies', target: pid, together }); };
  const plan = gatherPlan(w, w.playerId, pid);
  const times = [...plan.going.map((g) => g.months), ...plan.sailing.map((s) => s.plan.months.total)];
  const first = Math.min(...times);
  const last = Math.max(...times);
  if (times.length > 1 && last - first >= 1) {
    const holder = w.provinces[pid].controller ?? w.provinces[pid].owner;
    const attack = !!holder && atWar(w, w.playerId, holder);
    const together = previewAction(w, w.playerId, { type: 'gatherArmies', target: pid, together: true });
    void st.askChoice({
      title: `${attack ? 'Attack' : 'Gather our armies at'} ${provinceName(pid)}?`,
      body: `${[...together.consequences, ...together.risks].join('.\n')}.\n\nArrive together: the nearer armies wait, so all reach ${provinceName(pid)} in about ${months(last)}.\nAs fast as each can: the first arrives in about ${months(first)}, the rest as they come${attack ? ', and may be beaten one at a time' : ''}.`,
      choices: [
        { id: 'each', label: `Each at once (first in ${months(first)})`, primary: !attack },
        { id: 'together', label: `Arrive together (${months(last)})`, primary: attack },
      ],
    }).then((how) => { if (how) go(how === 'together'); });
    return;
  }
  void st.askConfirm({
    title: `Gather our armies at ${provinceName(pid)}?`,
    body: [...pv.consequences, ...pv.risks].join('.\n') + '.',
    confirmLabel: 'Gather',
  }).then((ok) => { if (ok) go(false); });
}
