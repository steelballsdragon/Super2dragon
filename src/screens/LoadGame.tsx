import { ArrowLeft, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Flag } from '../art/Flag';
import { Divider } from '../art/Ornaments';
import { POLITIES } from '../game/static';
import { useGame } from '../store/game';
import { timeAgo } from '../ui/format';
import { Badge, Empty } from '../ui/kit';
import { ImportDialog } from './game/TransferDialogs';

export function LoadGame() {
  const { saves, refreshSaves, loadSave, removeSave, setScreen, world, askConfirm } = useGame();
  const [importing, setImporting] = useState(false);
  useEffect(() => refreshSaves(), [refreshSaves]);
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ink scroll-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="flex items-center gap-2">
          <button className="btn btn-quiet !px-2" onClick={() => setScreen(world ? 'game' : 'menu')}><ArrowLeft size={16} /> {world ? 'Back to the campaign' : 'Menu'}</button>
          <button className="btn btn-ghost ml-auto" onClick={() => setImporting(true)}><Upload size={15} /> Import</button>
        </div>
        <h1 className="title-gilt mt-6 text-center text-2xl">The Archive</h1>
        <div className="mx-auto mt-2 w-72"><Divider /></div>
        <p className="mt-2 text-center font-serif italic text-parchment-dim">Saved campaigns kept in this browser</p>
        <div className="mt-6 space-y-2">
          {saves.length ? saves.map((m) => {
            const d = POLITIES[m.countryId];
            return (
              <div key={m.id} className="panel flex items-center gap-3 p-3">
                {d ? <Flag spec={d.flag} width={42} /> : null}
                <button className="min-w-0 flex-1 text-left" onClick={() => loadSave(m.id)}>
                  <div className="flex items-center gap-2"><span className="truncate font-display text-[14px] text-gold-bright">{m.name}</span>{m.autosave ? <Badge tone="muted">autosave</Badge> : null}</div>
                  <div className="text-[13px] text-parchment-dim">{m.countryName} · {m.date}</div>
                  <div className="text-[11px] text-muted">Saved {timeAgo(m.savedAt)} · {(m.size / 1024).toFixed(0)} KB · schema v{m.schemaVersion}</div>
                </button>
                <button className="btn btn-gold !min-h-9" onClick={() => loadSave(m.id)}>Load</button>
                <button className="btn btn-quiet !min-h-9 !px-2 text-war" aria-label={`Delete ${m.name}`} onClick={() => { void askConfirm({ title: `Delete “${m.name}”?`, body: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'war' }).then((ok) => { if (ok) removeSave(m.id); }); }}><Trash2 size={16} /></button>
              </div>
            );
          }) : <Empty>No campaigns have been saved yet. Begin a new one from the menu, or import a file.</Empty>}
        </div>
      </div>
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
    </div>
  );
}
