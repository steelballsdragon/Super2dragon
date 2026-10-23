import { useEffect, useState } from 'react';
import { backend } from '../api';
import { actions, setState, useStore } from '../state';
import type { ProviderConfig, Settings } from '../types';

type Tab = 'model' | 'providers' | 'agent' | 'permissions' | 'context' | 'storage';

function NumberField({ label, value, onChange, min, max, step = 1, help }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; help?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
      {help && <small className="muted">{help}</small>}
    </label>
  );
}

function Toggle({ label, value, onChange, help }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <label className="field toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {help && <small className="muted">{help}</small>}
    </label>
  );
}

export function SettingsModal() {
  const settings = useStore((s) => s.settings);
  const info = useStore((s) => s.info);
  const workspace = useStore((s) => s.workspace);
  const [tab, setTab] = useState<Tab>('model');
  const [draft, setDraft] = useState<Settings | undefined>(settings);
  const [rules, setRules] = useState<{ id: string; tool: string; pattern: string }[]>([]);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    if (workspace && tab === 'permissions') backend.call<typeof rules>('rules.list', { workspaceId: workspace.record.id }).then(setRules).catch(() => {});
  }, [workspace, tab]);

  if (!draft) return null;
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => setDraft({ ...draft, [k]: { ...(draft[k] as object), ...v } as Settings[K] });
  const setProvider = (i: number, p: Partial<ProviderConfig>) => setDraft({ ...draft, providers: draft.providers.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  const save = async () => {
    const saved = await actions.updateSettings(draft as unknown as Record<string, unknown>);
    if (saved) {
      await actions.refreshModels();
      setState({ modal: null });
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setState({ modal: null })}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={() => setState({ modal: null })} aria-label="Close">
            ×
          </button>
        </div>
        <div className="settings">
          <nav className="settings-nav">
            {(
              [
                ['model', 'Model & generation'],
                ['providers', 'Inference servers'],
                ['agent', 'Agent'],
                ['permissions', 'Permissions'],
                ['context', 'Context'],
                ['storage', 'Storage & privacy'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          <div className="settings-body">
            {tab === 'model' && (
              <>
                <NumberField label="Context length (tokens)" value={draft.generation.numCtx} min={2048} max={1048576} step={1024} onChange={(v) => set('generation', { numCtx: v })} help="Larger contexts use more RAM/VRAM (see memory estimates in Models). Capped at the model's maximum." />
                <NumberField label="Temperature" value={draft.generation.temperature} min={0} max={2} step={0.05} onChange={(v) => set('generation', { temperature: v })} help="Low values (0.1–0.3) work best for coding agents." />
                <NumberField label="Max tokens per reply" value={draft.generation.maxTokens} min={256} max={65536} step={256} onChange={(v) => set('generation', { maxTokens: v })} />
                <label className="field">
                  <span>GPU layers (Ollama num_gpu)</span>
                  <input
                    className="input"
                    type="number"
                    placeholder="auto"
                    value={draft.generation.numGpu ?? ''}
                    onChange={(e) => set('generation', { numGpu: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                  <small className="muted">Empty = let the server decide. 0 = CPU only. Lower it if the model fails to load with out-of-memory errors.</small>
                </label>
                <label className="field">
                  <span>Keep model loaded for</span>
                  <input className="input" value={draft.generation.keepAlive} onChange={(e) => set('generation', { keepAlive: e.target.value })} />
                  <small className="muted">e.g. 30m, 2h, -1 (forever), 0 (unload after each reply)</small>
                </label>
                <Toggle label="Enable model reasoning (thinking) for models that support it" value={draft.generation.thinking} onChange={(v) => set('generation', { thinking: v })} help="Better on hard tasks, much slower on CPU." />
              </>
            )}
            {tab === 'providers' && (
              <>
                <p className="muted small">LocalCode talks only to inference servers on your machine (or ones you add). Supported: Ollama, and OpenAI-compatible servers such as llama.cpp (llama-server --jinja), LM Studio, vLLM and LocalAI.</p>
                {draft.providers.map((p, i) => (
                  <div key={p.id} className="provider-edit">
                    <Toggle label={p.label} value={p.enabled} onChange={(v) => setProvider(i, { enabled: v })} />
                    <label className="field">
                      <span>Base URL ({p.kind === 'ollama' ? 'Ollama API' : 'OpenAI-compatible, include /v1'})</span>
                      <input className="input" value={p.baseUrl} onChange={(e) => setProvider(i, { baseUrl: e.target.value })} />
                    </label>
                    {p.kind === 'openai' && (
                      <label className="field">
                        <span>API key (only if your local server requires one; never sent to the model)</span>
                        <input className="input" type="password" value={p.apiKey ?? ''} onChange={(e) => setProvider(i, { apiKey: e.target.value || undefined })} />
                      </label>
                    )}
                    <button className="btn small ghost" onClick={() => setDraft({ ...draft, providers: draft.providers.filter((_, j) => j !== i) })}>
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  className="btn small"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      providers: [...draft.providers, { id: `server${draft.providers.length + 1}`, kind: 'openai', label: 'Custom OpenAI-compatible server', baseUrl: 'http://127.0.0.1:8000/v1', enabled: true }],
                    })
                  }
                >
                  + Add OpenAI-compatible server
                </button>
              </>
            )}
            {tab === 'agent' && (
              <>
                <NumberField label="Max model calls per task" value={draft.agent.maxSteps} min={5} max={500} onChange={(v) => set('agent', { maxSteps: v })} help="Stops runaway loops; you can resume a task that hit the limit." />
                <NumberField label="Max task duration (minutes)" value={draft.agent.maxTaskMinutes} min={1} max={1440} onChange={(v) => set('agent', { maxTaskMinutes: v })} />
                <NumberField label="Command timeout (seconds)" value={draft.agent.commandTimeoutSec} min={5} max={7200} onChange={(v) => set('agent', { commandTimeoutSec: v })} />
                <NumberField label="Model idle timeout (seconds)" value={draft.agent.modelIdleTimeoutSec} min={30} max={7200} onChange={(v) => set('agent', { modelIdleTimeoutSec: v })} help="How long to wait without any output from the model server before retrying." />
                <NumberField label="Max tool output sent to the model (characters)" value={draft.agent.toolOutputMaxChars} min={1000} max={200000} step={1000} onChange={(v) => set('agent', { toolOutputMaxChars: v })} />
                <Toggle label="Ask the model to continue when it stops with unfinished plan steps" value={draft.agent.nudgeOnIncompletePlan} onChange={(v) => set('agent', { nudgeOnIncompletePlan: v })} />
              </>
            )}
            {tab === 'permissions' && (
              <>
                <label className="field">
                  <span>Default permission mode (per-workspace mode is set in the top bar)</span>
                  <select className="select" value={draft.permissions.mode} onChange={(e) => set('permissions', { mode: e.target.value as Settings['permissions']['mode'] })}>
                    <option value="strict">Strict — read-only; approve every write and command</option>
                    <option value="standard">Standard — edits and build/test commands run; others ask</option>
                    <option value="autonomous">Autonomous — edits and commands run; network, deletions, sudo ask</option>
                  </select>
                </label>
                <div className="notice small">
                  Always confirmed regardless of mode: deleting files, git commits, network access (installing packages, downloads, git push), destructive commands (rm, git reset --hard) and privileged commands (sudo). Catastrophic commands (e.g. rm -rf /) are blocked outright.
                </div>
                <label className="field">
                  <span>Environment variables passed to commands even though they look secret (comma separated)</span>
                  <input className="input" value={draft.permissions.envPassthrough.join(',')} onChange={(e) => set('permissions', { envPassthrough: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                  <small className="muted">By default variables like *_TOKEN, *_KEY, *PASSWORD* are removed from the agent's shell environment.</small>
                </label>
                {workspace && (
                  <div>
                    <div className="label">“Always allow” rules for {workspace.record.name}</div>
                    {rules.length === 0 && <div className="muted small">None.</div>}
                    {rules.map((r) => (
                      <div key={r.id} className="row gap">
                        <code>
                          {r.tool}: {r.pattern}
                        </code>
                        <button className="btn small ghost" onClick={() => backend.call('rules.delete', { ruleId: r.id }).then(() => setRules(rules.filter((x) => x.id !== r.id)))}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {tab === 'context' && (
              <>
                <NumberField label="Summarize older history at this fraction of the context window" value={draft.context.summarizeAtRatio} min={0.3} max={0.95} step={0.05} onChange={(v) => set('context', { summarizeAtRatio: v })} />
                <NumberField label="Recent messages kept verbatim" value={draft.context.keepRecentMessages} min={2} max={100} onChange={(v) => set('context', { keepRecentMessages: v })} />
                <Toggle label="Include a project overview (languages, frameworks, commands, top-level files) in the prompt" value={draft.context.includeRepoOverview} onChange={(v) => set('context', { includeRepoOverview: v })} />
                <Toggle label="Remember recent tasks from other conversations in this workspace" value={draft.context.includeRecentTasks} onChange={(v) => set('context', { includeRecentTasks: v })} />
                <label className="field">
                  <span>Extra index exclusions (gitignore syntax, comma separated)</span>
                  <input className="input" value={draft.index.exclude.join(',')} onChange={(e) => set('index', { exclude: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                  <small className="muted">.gitignore files and common folders (node_modules, .venv, target, ...) are always respected.</small>
                </label>
                <Toggle label="Watch files for changes to refresh the index" value={draft.index.watch} onChange={(v) => set('index', { watch: v })} />
              </>
            )}
            {tab === 'storage' && (
              <>
                <div className="field">
                  <span>Data directory</span>
                  <code>{info?.dataDir}</code>
                  <small className="muted">Conversations, task history, settings (SQLite) and checkpoints are stored here. Set LOCALCODE_HOME to change it.</small>
                </div>
                <Toggle label="Create checkpoints before every change (enables undo)" value={draft.storage.checkpoints} onChange={(v) => set('storage', { checkpoints: v })} />
                <div className="notice small">
                  Privacy: LocalCode sends prompts and code only to the inference servers listed under “Inference servers”. There is no telemetry. Network access happens only when you download a model or approve a command that needs it.
                </div>
                <div className="muted small">
                  LocalCode {info?.version} · Node {info?.node} · {info?.platform}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={() => setState({ modal: null })}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
