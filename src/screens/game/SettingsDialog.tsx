import { useState } from 'react';
import { LLM_MODEL, loadLlmSettings, saveLlmSettings } from '../../advisor/llm';
import { useGame } from '../../store/game';
import { useWorld } from '../../store/hooks';
import { Modal } from '../../ui/kit';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { w } = useWorld();
  const bump = useGame((s) => s.bump);
  const [llm, setLlm] = useState(loadLlmSettings);
  const [pause, setPause] = useState(w.settings.pauseOnEvents);
  const [losses, setLosses] = useState(w.settings.supplyLosses !== false);
  const [every, setEvery] = useState(w.settings.autosaveMonths);
  const save = () => {
    w.settings.pauseOnEvents = pause;
    w.settings.supplyLosses = losses;
    w.settings.autosaveMonths = Math.max(1, Math.min(24, every));
    saveLlmSettings(llm);
    bump();
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Settings">
      <div className="space-y-5 p-5 text-sm">
        <section className="space-y-2">
          <div className="label">Campaign</div>
          <label className="flex items-center justify-between gap-3">
            <span>Pause when an event needs a decision</span>
            <input type="checkbox" className="h-4 w-4 accent-[#d9b46b]" checked={pause} onChange={(e) => setPause(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Autosave every</span>
            <span className="flex items-center gap-2">
              <input type="number" min={1} max={24} className="input !w-20 !py-1" value={every} onChange={(e) => setEvery(Number(e.target.value) || 1)} />
              months
            </span>
          </label>
          <p className="text-xs text-muted">The campaign is also saved whenever you leave or hide this tab.</p>
          <label className="flex items-center justify-between gap-3">
            <span>Our armies lose men to supply and terrain</span>
            <input type="checkbox" className="h-4 w-4 accent-[#d9b46b]" checked={losses} onChange={(e) => setLosses(e.target.checked)} />
          </label>
          <p className="text-xs text-muted">Armies on friendly ground refill lost men from the manpower reserve either way. Turning losses off spares your armies (not the AI’s) from oversized stacks, harsh terrain and foraging in enemy land; battles still cost men.</p>
        </section>
        <section className="space-y-2">
          <div className="label">AI council (optional)</div>
          <p className="text-[13px] text-parchment-dim">
            The royal council understands orders without any external service. Optionally, you can let a Claude model ({LLM_MODEL}) interpret free-form orders. It only proposes actions; the game checks every one against its rules before you approve it.
          </p>
          <label className="flex items-center justify-between gap-3">
            <span>Use Claude to interpret orders</span>
            <input type="checkbox" className="h-4 w-4 accent-[#d9b46b]" checked={llm.enabled} onChange={(e) => setLlm({ ...llm, enabled: e.target.checked })} />
          </label>
          <label className="block">
            <span className="text-parchment-dim">Your Anthropic API key</span>
            <input type="password" autoComplete="off" className="input mt-1" placeholder="sk-ant-…" value={llm.apiKey} onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })} />
          </label>
          <p className="text-xs text-muted">The key is stored only in this browser and sent only to api.anthropic.com. Requests are billed to your account. Anyone with access to this browser profile can read it; clear it when you are done.</p>
        </section>
        <div className="flex justify-end gap-2">
          <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" onClick={save}>Save settings</button>
        </div>
      </div>
    </Modal>
  );
}
