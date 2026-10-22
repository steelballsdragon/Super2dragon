import { AlertTriangle, CheckCircle2, Info, XOctagon } from 'lucide-react';
import { useEffect } from 'react';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';
import { shortDate } from '../../ui/format';
import { Empty } from '../../ui/kit';

export function Notifications({ onClose }: { onClose: () => void }) {
  const { w } = useWorld();
  const bump = useGame((s) => s.bump);
  useEffect(() => () => {
    for (const n of w.notifications) n.read = true;
    bump();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="panel absolute right-0 top-11 z-50 max-h-[70vh] w-[min(360px,92vw)] overflow-y-auto scroll-thin animate-rise">
        <div className="sticky top-0 border-b border-gold/15 bg-navy px-4 py-2 label">Dispatches</div>
        {w.notifications.length ? w.notifications.slice(0, 40).map((n) => {
          const Icon = n.kind === 'success' ? CheckCircle2 : n.kind === 'warning' ? AlertTriangle : n.kind === 'danger' ? XOctagon : Info;
          const color = n.kind === 'success' ? 'text-econ' : n.kind === 'warning' ? 'text-gold' : n.kind === 'danger' ? 'text-war' : 'text-diplo';
          return (
            <div key={n.id} className={`flex gap-2 border-b border-white/5 px-4 py-2 text-sm ${n.read ? 'opacity-70' : ''}`}>
              <Icon size={15} className={`mt-0.5 shrink-0 ${color}`} />
              <div><div className="text-parchment">{n.text}</div><div className="text-[11px] text-muted">{shortDate(n.turn)}</div></div>
            </div>
          );
        }) : <Empty>No dispatches yet.</Empty>}
      </div>
    </>
  );
}
