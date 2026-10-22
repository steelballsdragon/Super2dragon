// "Gather all our armies here": previews the order, confirms it, then marches every army that can reach.
import { previewAction } from '../../game/actions';
import { provinceName } from '../../game/state';
import { useGame } from '../../store/game';

export function orderGather(pid: string): void {
  const st = useGame.getState();
  const w = st.world;
  if (!w) return;
  const pv = previewAction(w, w.playerId, { type: 'gatherArmies', target: pid });
  if (!pv.valid) { st.toast(pv.errors.join(' '), 'warning'); return; }
  void st.askConfirm({
    title: `Gather our armies at ${provinceName(pid)}?`,
    body: [...pv.consequences, ...pv.risks].join('.\n') + '.',
    confirmLabel: 'Gather',
  }).then((ok) => {
    if (!ok) return;
    st.setPick(null);
    st.dispatch({ type: 'gatherArmies', target: pid });
  });
}
