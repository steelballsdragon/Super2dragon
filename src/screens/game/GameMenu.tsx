import { Download, FolderOpen, LogOut, Save, Settings, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';
import { Modal } from '../../ui/kit';
import { SettingsDialog } from './SettingsDialog';

export function GameMenu({ onClose }: { onClose: () => void }) {
  const { w } = useWorld();
  const { saveNow, exportCampaign, importCampaign, quitToMenu, setScreen, autosave } = useGame();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [settings, setSettings] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const item = 'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-parchment hover:bg-white/5';
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="panel absolute right-0 top-11 z-50 w-60 overflow-hidden py-1 animate-rise">
        <div className="px-4 pb-1 pt-2 label">{w.campaign.name}</div>
        <button className={item} onClick={() => { setName(w.campaign.name); setNaming(true); }}><Save size={16} className="text-gold" /> Save game…</button>
        <button className={item} onClick={() => { autosave(); setScreen('load'); }}><FolderOpen size={16} className="text-gold" /> Load game</button>
        <button className={item} onClick={() => { exportCampaign(); onClose(); }}><Download size={16} className="text-gold" /> Export to file (JSON)</button>
        <button className={item} onClick={() => file.current?.click()}><Upload size={16} className="text-gold" /> Import from file…</button>
        <button className={item} onClick={() => setSettings(true)}><Settings size={16} className="text-gold" /> Settings</button>
        <div className="gilt-rule my-1" />
        <button className={item} onClick={() => { quitToMenu(); }}><LogOut size={16} className="text-war" /> Save & quit to menu</button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          importCampaign(await f.text());
          e.target.value = '';
          onClose();
        }} />
      </div>
      <Modal open={naming} onClose={() => setNaming(false)} title="Save the campaign">
        <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); saveNow(name); setNaming(false); onClose(); }}>
          <label className="block text-sm text-parchment-dim">Name of this save
            <input autoFocus className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <p className="text-xs text-muted">Saves are kept in this browser. Export to a file to keep a copy elsewhere or move it to another device.</p>
          <div className="flex justify-end gap-2"><button type="button" className="btn btn-quiet" onClick={() => setNaming(false)}>Cancel</button><button className="btn btn-gold">Save</button></div>
        </form>
      </Modal>
      {settings ? <SettingsDialog onClose={() => { setSettings(false); onClose(); }} /> : null}
    </>
  );
}
