import { Crown, Keyboard, MessageSquareText, MousePointerClick } from 'lucide-react';
import { Flag } from '../../art/Flag';
import { Portrait } from '../../art/Portrait';
import { age } from '../../game/characters';
import { def, formatDate } from '../../game/state';
import { useWorld } from '../../store/hooks';
import { Modal } from '../../ui/kit';

export function Welcome({ onClose }: { onClose: () => void }) {
  const { w, me, c } = useWorld();
  const d = def(me);
  const ruler = w.characters[c.rulerId];
  return (
    <Modal open onClose={onClose} title={formatDate(w.turn)}>
      <div className="p-5">
        <div className="flex gap-4">
          {ruler ? <Portrait style={d.portrait} seed={ruler.portraitSeed} female={ruler.female} age={age(w, ruler)} size={80} /> : null}
          <div>
            <Flag spec={d.flag} width={44} />
            <h2 className="mt-1 font-display text-lg text-gold-bright">{d.name}</h2>
            <p className="text-[13px] text-parchment-dim">{ruler?.name}, {d.rulerTitle}</p>
          </div>
        </div>
        <p className="mt-3 font-serif text-[16.5px] leading-snug text-parchment">{d.intro}</p>
        <ul className="mt-4 space-y-2 text-[13px] text-parchment-dim">
          <li className="flex gap-2"><MessageSquareText size={16} className="mt-0.5 shrink-0 text-gold" />Give orders in plain words to the royal council on the right — “Modernise the army”, “Seek an alliance with Persia”. Each plan shows its costs and risks before you approve it.</li>
          <li className="flex gap-2"><Crown size={16} className="mt-0.5 shrink-0 text-gold" />The rail on the left opens the court, treasury, armies, diplomacy, research, laws and the chronicle.</li>
          <li className="flex gap-2"><MousePointerClick size={16} className="mt-0.5 shrink-0 text-gold" />Drag, scroll or pinch the map. Click a province or army to select it; right-click to march a selected army.</li>
          <li className="flex gap-2"><Keyboard size={16} className="mt-0.5 shrink-0 text-gold" />Time is paused. Press play (or Space) to let the months pass; 1–3 set the speed, N advances one month.</li>
        </ul>
        <button className="btn btn-gold mt-5 w-full" onClick={onClose}>Take the throne</button>
      </div>
    </Modal>
  );
}
