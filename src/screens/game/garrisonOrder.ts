// "Post a garrison": previews barracks and troops for one province (or every land border), confirms, then orders it.
import { previewAction } from '../../game/actions';
import { provinceName } from '../../game/state';
import { useGame } from '../../store/game';
import { money } from '../../ui/format';

export function orderGarrison(pid?: string): void {
  const st = useGame.getState();
  const w = st.world;
  if (!w) return;
  const action = { type: 'garrison' as const, province: pid };
  const pv = previewAction(w, w.playerId, action);
  if (!pv.valid) { st.toast(pv.errors.join(' '), 'warning'); return; }
  void st.askConfirm({
    title: pid ? `Post a garrison at ${provinceName(pid)}?` : 'Garrison our land borders?',
    body: [`Cost ${money(pv.cost.treasury ?? 0)}`, ...pv.consequences, ...pv.risks].join('.\n') + '.',
    confirmLabel: pid ? 'Post garrison' : 'Garrison the borders',
  }).then((ok) => { if (ok) st.dispatch(action); });
}
