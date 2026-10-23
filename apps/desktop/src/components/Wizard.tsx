import { useEffect, useState } from 'react';
import { backend, isTauri, pickFolder } from '../api';
import { actions, setState, toast, useStore } from '../state';
import type { DoctorReport, ProbeResult } from '../types';
import { formatBytes } from '../util';

/** First-run wizard: dependency check → model selection (with a live tool test) → workspace → demo task. */
export function Wizard() {
  const models = useStore((s) => s.models);
  const settings = useStore((s) => s.settings);
  const workspace = useStore((s) => s.workspace);
  const [step, setStep] = useState(0);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [probing, setProbing] = useState('');
  const [probe, setProbe] = useState<Record<string, ProbeResult>>({});
  const [path, setPath] = useState('');

  useEffect(() => {
    backend.call<DoctorReport>('app.doctor').then(setDoctor).catch((e) => toast((e as Error).message, 'error'));
  }, []);

  const finish = async () => {
    await actions.updateSettings({ firstRunComplete: true });
    setState({ modal: null });
  };

  const chat = models.filter((l) => l.health.ok).flatMap((l) => l.models.filter((m) => m.chatCapable).map((m) => ({ providerId: l.provider.id, m })));
  const coding = settings?.models.coding;

  return (
    <div className="modal-backdrop">
      <div className="modal wizard" role="dialog" aria-label="Setup">
        <div className="modal-head">
          <h2>Set up LocalCode</h2>
          <span className="muted small">Step {step + 1} of 3</span>
          <button className="btn small ghost" onClick={finish}>
            Skip
          </button>
        </div>
        <div className="modal-body">
          {step === 0 && (
            <>
              <p>LocalCode runs entirely on this computer. Checking dependencies and hardware…</p>
              {!doctor && <div className="muted">Checking…</div>}
              {doctor && (
                <>
                  <div className="muted small">
                    {doctor.system.osRelease} · {doctor.system.cpuCores} CPU threads · {formatBytes(doctor.system.totalMemBytes)} RAM
                    {doctor.system.gpus.length ? ` · ${doctor.system.gpus.map((g) => g.name).join(', ')}` : ' · no GPU detected (models run on CPU, slower)'}
                  </div>
                  <ul className="checks">
                    {doctor.checks.map((c) => (
                      <li key={c.id} className={`check ${c.status}`}>
                        <span className="check-mark">{c.status === 'ok' ? '✓' : c.status === 'warn' ? '!' : '✗'}</span>
                        <div>
                          <strong>{c.label}</strong> <span className="muted">{c.detail}</span>
                          {c.fix && <div className="fix">→ {c.fix}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="row gap">
                    <button className="btn" onClick={() => backend.call<DoctorReport>('app.doctor').then(setDoctor).then(() => actions.refreshModels())}>
                      Check again
                    </button>
                    <button className="btn primary" onClick={() => setStep(1)}>
                      Next
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <p>Choose the model that will run the agent. Test it to see whether it can really use tools — the result decides how LocalCode talks to it.</p>
              {chat.length === 0 && (
                <div className="notice">
                  No chat models found. Install one with Ollama, e.g. <code>ollama pull qwen2.5-coder:7b</code> (needs ~5 GB RAM) or <code>ollama pull qwen3.5:4b</code> for smaller machines, then press Refresh. You can also download from the Models
                  window.
                  <div>
                    <button className="btn small" onClick={() => actions.refreshModels()}>
                      Refresh
                    </button>
                  </div>
                </div>
              )}
              <div className="wizard-models">
                {chat.map(({ providerId, m }) => {
                  const key = `${providerId}/${m.name}`;
                  const selected = coding?.providerId === providerId && coding.model === m.name;
                  const p = probe[key] ?? m.probe;
                  return (
                    <div key={key} className={`wizard-model ${selected ? 'selected' : ''}`}>
                      <label className="row gap">
                        <input type="radio" checked={selected} onChange={() => actions.setModel({ providerId, model: m.name })} />
                        <strong>{m.name}</strong> <span className="muted small">{m.parameterSize} · {formatBytes(m.sizeBytes)}</span>
                      </label>
                      {m.fit && <div className={`small fit fit-${m.fit.level}`}>{m.fit.message}</div>}
                      {p ? (
                        <div className={`small ${p.recommended === 'native' ? 'add' : p.recommended === 'prompted' ? 'warn-text-inline' : 'del'}`}>
                          Tool test: {p.recommended === 'native' ? 'native tool calling works' : p.recommended === 'prompted' ? 'works with the prompted fallback' : 'cannot use tools (chat only)'} — {p.explanation}
                        </div>
                      ) : (
                        <button
                          className="btn small"
                          disabled={!!probing}
                          onClick={async () => {
                            setProbing(key);
                            try {
                              const r = await backend.call<ProbeResult>('models.probe', { providerId, model: m.name });
                              setProbe((x) => ({ ...x, [key]: r }));
                              await actions.refreshModels();
                            } catch (e) {
                              toast((e as Error).message, 'error');
                            } finally {
                              setProbing('');
                            }
                          }}
                        >
                          {probing === key ? 'Testing (loading the model can take a minute)…' : 'Test tool calling'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="row gap">
                <button className="btn ghost" onClick={() => setStep(0)}>
                  Back
                </button>
                <button className="btn primary" disabled={!coding} onClick={() => setStep(2)}>
                  Next
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <p>Open a project folder. The agent can only access files inside the folder you choose.</p>
              {workspace ? (
                <div className="notice">
                  Workspace: <strong>{workspace.record.name}</strong> <span className="muted small">{workspace.record.path}</span>
                </div>
              ) : (
                <div className="row gap">
                  {isTauri() ? (
                    <button className="btn" onClick={async () => { const p = await pickFolder(); if (p) await actions.openWorkspace(p); }}>
                      Choose folder…
                    </button>
                  ) : (
                    <>
                      <input className="input" placeholder="/path/to/project" value={path} onChange={(e) => setPath(e.target.value)} />
                      <button className="btn" disabled={!path.trim()} onClick={() => actions.openWorkspace(path.trim())}>
                        Open
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="notice small">
                Try the bundled demo: copy <code>examples/sample-project</code> from the LocalCode repository to a scratch folder, open it, and ask: <em>“Run the tests, find out why they fail, fix the bug in src/, and re-run the tests until they pass.”</em>
              </div>
              <div className="row gap">
                <button className="btn ghost" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="btn primary" onClick={finish}>
                  Start
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
