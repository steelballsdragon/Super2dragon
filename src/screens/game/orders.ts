// Army orders from the map: march overland, or go by sea when that is the only way or much the quicker.
import { previewAction, type ActionPreview } from '../../game/actions';
import { provinceName } from '../../game/state';
import { useGame } from '../../store/game';

const money = (v: number) => `£${Math.round(v).toLocaleString('en')}k`;
const months = (n: number) => `${Math.max(1, Math.round(n))} month${Math.round(n) > 1 ? 's' : ''}`;

function voyageBody(pv: ActionPreview): string {
  return [...pv.consequences, ...(pv.cost.treasury ? [`Hire of ships: ${money(pv.cost.treasury)}`] : []), ...pv.risks].join('.\n') + '.';
}

function sail(army: string, pid: string): void {
  const st = useGame.getState();
  st.setPick(null);
  st.dispatch({ type: 'expedition', army, target: pid });
}

/** Asks before sending an army by sea; keeps the order open after a refusal. */
export function orderVoyage(army: string, pid: string): void {
  const st = useGame.getState();
  const w = st.world!;
  const pv = previewAction(w, w.playerId, { type: 'expedition', army, target: pid });
  if (!pv.valid) { st.toast(pv.errors.join(' '), 'warning'); return; }
  void st.askConfirm({ title: `Send ${w.armies[army].name} by sea to ${provinceName(pid)}?`, body: voyageBody(pv), confirmLabel: 'Sail' }).then((ok) => { if (ok) sail(army, pid); });
}

/** A destination tapped for an army: march, or sail when there is no road or the sea is far quicker. */
export function orderArmyTo(army: string, pid: string): void {
  const st = useGame.getState();
  const w = st.world!;
  const me = w.playerId;
  const march = previewAction(w, me, { type: 'moveArmy', army, target: pid });
  const bySea = previewAction(w, me, { type: 'expedition', army, target: pid });
  if (march.valid) {
    const m = march.cost.months ?? 0;
    const s = bySea.cost.months ?? Infinity;
    if (bySea.valid && s + 1 < m * 0.6) {
      void st.askChoice({
        title: `How shall ${w.armies[army].name} go to ${provinceName(pid)}?`,
        body: `By land: about ${months(m)}.\nBy sea: about ${months(s)}${bySea.cost.treasury ? `, hiring ships for ${money(bySea.cost.treasury)}` : ' in our own ships'}.\n\n${voyageBody(bySea)}`,
        choices: [{ id: 'land', label: `March (${months(m)})` }, { id: 'sea', label: `Sail (${months(s)})`, primary: true }],
      }).then((how) => {
        if (how === 'sea') sail(army, pid);
        else if (how === 'land') { useGame.getState().setPick(null); useGame.getState().dispatch({ type: 'moveArmy', army, target: pid }); }
      });
      return;
    }
    st.setPick(null);
    st.dispatch({ type: 'moveArmy', army, target: pid });
    return;
  }
  if (bySea.valid) { orderVoyage(army, pid); return; }
  if (!w.armies[army]) st.setPick(null);
  st.toast(`${march.errors[0]} By sea: ${bySea.errors[0]}`, 'warning');
}
