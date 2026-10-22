import { Check, Copy, Download, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { exportCode } from '../../game/save';
import { useGame } from '../../store/game';
import { Modal } from '../../ui/kit';

/** Copy the campaign as a text code (works where file downloads are blocked) or as a JSON file. */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const world = useGame((s) => s.world);
  const exportCampaign = useGame((s) => s.exportCampaign);
  const code = useMemo(() => (world ? exportCode(world) : ''), [world]);
  const box = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<'yes' | 'select' | null>(null);
  const selectAll = () => { box.current?.focus(); box.current?.select(); };
  const copy = () => {
    const fallback = () => {
      selectAll();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      setCopied(ok ? 'yes' : 'select');
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(() => setCopied('yes'), fallback);
    else fallback();
  };
  return (
    <Modal open onClose={onClose} title="Export the campaign">
      <div className="space-y-3 p-5">
        <p className="text-sm text-parchment-dim">This save code holds the whole campaign. Keep it somewhere safe, or paste it into <span className="text-parchment">Import</span> in any browser to carry on there.</p>
        <textarea ref={box} readOnly value={code} onFocus={selectAll} aria-label="Save code" className="input h-28 resize-none break-all font-mono text-[11px] leading-snug scroll-thin" />
        <div className="text-[11px] text-muted">{(code.length / 1024).toFixed(0)} KB of text</div>
        {copied === 'select' ? <p className="text-xs text-gold">The browser would not copy it for us. The code is selected: copy it by hand.</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn btn-ghost" onClick={exportCampaign}><Download size={15} /> Download .json</button>
          <button className="btn btn-gold" onClick={copy}>{copied === 'yes' ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy save code</>}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Load a campaign from a pasted save code, pasted JSON, or a .json file. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const importCampaign = useGame((s) => s.importCampaign);
  const [text, setText] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const run = (input: string) => { if (importCampaign(input)) onClose(); };
  return (
    <Modal open onClose={onClose} title="Import a campaign">
      <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); run(text); }}>
        <label className="block text-sm text-parchment-dim">Paste a save code or an exported JSON file
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="TOTW1800:…" className="input mt-1 h-28 resize-none break-all font-mono text-[11px] leading-snug scroll-thin" />
        </label>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn btn-ghost mr-auto" onClick={() => file.current?.click()}><Upload size={15} /> Choose a file…</button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" disabled={!text.trim()}>Import</button>
        </div>
        <input ref={file} type="file" accept="application/json,.json,.txt" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) run(await f.text());
        }} />
      </form>
    </Modal>
  );
}
