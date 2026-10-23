import { useState } from 'react';
import { backend } from '../api';
import { actions, setState, toast, useStore } from '../state';
import type { BenchmarkResult, ModelEntry, ModelRef, ProbeResult } from '../types';
import { formatBytes } from '../util';

const FIT_LABEL: Record<string, string> = { gpu: 'fits GPU', partial: 'partial GPU', cpu: 'CPU/RAM', tight: 'tight', insufficient: 'too large', unknown: '?' };
const ROLES: { key: 'coding' | 'planning' | 'light' | 'embedding'; label: string; help: string }[] = [
  { key: 'coding', label: 'Coding', help: 'Runs the agent' },
  { key: 'planning', label: 'Planning', help: 'Optional: first (planning) step of each task' },
  { key: 'light', label: 'Light', help: 'Optional: summarizing long conversations' },
  { key: 'embedding', label: 'Embeddings', help: 'Optional: semantic code search' },
];

function ModelRow({ providerId, m, loaded }: { providerId: string; m: ModelEntry; loaded: boolean }) {
  const settings = useStore((s) => s.settings);
  const [busy, setBusy] = useState<string>('');
  const [bench, setBench] = useState<BenchmarkResult | undefined>(m.benchmark);
  const [probe, setProbe] = useState<ProbeResult | undefined>(m.probe);
  const ref: ModelRef = { providerId, model: m.name };
  const key = `${providerId}/${m.name}`;
  const isEmbedding = !m.chatCapable;
  const override = settings?.toolModeOverrides[key] ?? 'auto';

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="model-row">
      <div className="model-main">
        <div className="model-name">
          {m.name} {loaded && <span className="badge">loaded</span>}
          {m.parameterSize && <span className="muted small"> {m.parameterSize}</span>}
          {m.quantization && <span className="muted small"> · {m.quantization}</span>}
          <span className="muted small"> · {formatBytes(m.sizeBytes)}</span>
        </div>
        <div className="small muted">
          capabilities: {m.details?.capabilities.join(', ') ?? 'unknown'}
          {m.details && !m.details.capabilitiesReported && ' (not reported by server)'}
          {m.details?.contextLength ? ` · max context ${m.details.contextLength.toLocaleString()}` : ''}
        </div>
        {m.chatCapable && (
          <div className="small">
            Tool calling:{' '}
            <strong className={m.toolModeSource !== 'probe' && m.toolModeSource !== 'override' ? '' : m.toolMode === 'native' ? 'add' : m.toolMode === 'prompted' ? 'warn-text-inline' : 'del'}>
              {m.toolMode === 'native' ? 'native' : m.toolMode === 'prompted' ? 'prompted fallback' : 'not usable (chat only)'}
            </strong>{' '}
            <span className="muted">
              ({m.toolModeSource === 'probe' ? 'verified by probe' : m.toolModeSource === 'override' ? 'manual override' : 'unverified — run the probe'})
            </span>
            {probe && <div className="muted small">{probe.explanation}</div>}
          </div>
        )}
        {m.fit && (
          <div className={`small fit fit-${m.fit.level}`}>
            Memory: ~{formatBytes(m.memory?.totalBytes)} at {m.memory?.numCtx?.toLocaleString()} ctx {m.memory && !m.memory.precise ? '(rough estimate)' : '(estimate)'} — {FIT_LABEL[m.fit.level]}: {m.fit.message}
            {m.fit.suggestedNumCtx && ` Suggested context: ${m.fit.suggestedNumCtx}.`}
          </div>
        )}
        {bench && (
          <div className="small">
            Benchmark: <strong>{bench.score}/100</strong> · {bench.tasks.filter((t) => t.passed).length}/{bench.tasks.length} tasks passed
            {bench.tokensPerSec ? ` · ${bench.tokensPerSec.toFixed(1)} tok/s` : ''} · {new Date(bench.runAt).toLocaleString()}
            <ul className="bench-list">
              {bench.tasks.map((t) => (
                <li key={t.id} className={t.passed ? 'add' : 'del'}>
                  {t.passed ? '✓' : '✗'} {t.title} <span className="muted">({t.status}, {t.steps} steps, {(t.durationMs / 1000).toFixed(0)}s)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="model-actions">
        <div className="row gap wrap">
          {ROLES.filter((r) => (isEmbedding ? r.key === 'embedding' : r.key !== 'embedding')).map((r) => {
            const active = settings?.models[r.key]?.providerId === providerId && settings?.models[r.key]?.model === m.name;
            return (
              <button
                key={r.key}
                className={`chip ${active ? 'active' : ''}`}
                title={r.help}
                onClick={() =>
                  r.key === 'coding'
                    ? actions.setModel(ref)
                    : actions.updateSettings({ models: { ...settings?.models, [r.key]: active ? undefined : ref } }).then(() => actions.refreshModels())
                }
              >
                {active ? '● ' : ''}
                {r.label}
              </button>
            );
          })}
        </div>
        {m.chatCapable && (
          <div className="row gap wrap">
            <button
              className="btn small"
              disabled={!!busy}
              onClick={() =>
                run('probe', async () => {
                  const r = await backend.call<ProbeResult>('models.probe', { ...ref, opId: `probe-${key}` });
                  setProbe(r);
                  toast(`${m.name}: ${r.recommended} — ${r.explanation}`, 'ok');
                  await actions.refreshModels();
                })
              }
            >
              {busy === 'probe' ? 'Probing…' : 'Test tool calling'}
            </button>
            <button
              className="btn small"
              disabled={!!busy}
              title="Runs 3 real coding tasks in throwaway folders and verifies the results by executing code (several minutes on CPU)"
              onClick={() =>
                run('bench', async () => {
                  const r = await backend.call<BenchmarkResult>('models.benchmark', { ...ref, opId: `bench-${key}` });
                  setBench(r);
                  toast(`${m.name}: benchmark score ${r.score}/100`, 'ok');
                  await actions.refreshModels();
                })
              }
            >
              {busy === 'bench' ? 'Benchmarking…' : 'Benchmark'}
            </button>
            {busy && (
              <button className="btn small ghost" onClick={() => backend.call('ops.cancel', { opId: `${busy}-${key}` })}>
                Cancel
              </button>
            )}
            <select
              className="select small"
              value={override}
              title="Override how tools are exposed to this model"
              onChange={(e) =>
                actions.updateSettings({ toolModeOverrides: { ...settings?.toolModeOverrides, [key]: e.target.value } }).then(() => actions.refreshModels())
              }
            >
              <option value="auto">tools: auto</option>
              <option value="native">tools: native</option>
              <option value="prompted">tools: prompted</option>
              <option value="none">chat only</option>
            </select>
            {loaded && (
              <button className="btn small ghost" onClick={() => run('unload', async () => { await backend.call('models.unload', { ...ref }); await actions.refreshModels(); })}>
                Unload
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PullForm() {
  const pulls = useStore((s) => s.pulls);
  const [name, setName] = useState('');
  const [info, setInfo] = useState<{ model: string; sizeBytes: number; source: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const progress = info ? pulls[info.model] : undefined;
  return (
    <div className="pull">
      <div className="label">Download a model (Ollama)</div>
      <div className="row gap">
        <input className="input" placeholder="e.g. qwen2.5-coder:7b, qwen3:8b, deepseek-coder-v2:16b" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn"
          disabled={!name.trim() || busy}
          onClick={async () => {
            try {
              setInfo(await backend.call('models.downloadInfo', { model: name.trim() }));
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
        >
          Check size
        </button>
      </div>
      <div className="muted small">Browse models at ollama.com/library. Nothing is downloaded until you confirm.</div>
      {info && (
        <div className="notice">
          <div>
            <strong>{info.model}</strong> is about <strong>{formatBytes(info.sizeBytes)}</strong> and will be downloaded from <code>{info.source}</code> over the internet.
          </div>
          {progress && (
            <div className="small">
              {progress.status} {progress.total ? `${((100 * (progress.completed ?? 0)) / progress.total).toFixed(0)}%` : ''}
              {progress.total ? <div className="progress"><div className="progress-bar" style={{ width: `${(100 * (progress.completed ?? 0)) / progress.total}%` }} /></div> : null}
            </div>
          )}
          <div className="row gap">
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await backend.call('models.pull', { providerId: 'ollama', model: info.model, opId: `pull-${info.model}` });
                  toast(`Installed ${info.model}`, 'ok');
                  setInfo(null);
                  setName('');
                  await actions.refreshModels();
                } catch (e) {
                  toast((e as Error).message, 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Downloading…' : 'Download'}
            </button>
            <button className="btn ghost" onClick={() => (busy ? backend.call('ops.cancel', { opId: `pull-${info.model}` }) : setInfo(null))}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ModelsModal() {
  const models = useStore((s) => s.models);
  const loading = useStore((s) => s.modelsLoading);
  return (
    <div className="modal-backdrop" onClick={() => setState({ modal: null })}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Models">
        <div className="modal-head">
          <h2>Local models</h2>
          <button className="btn small" onClick={() => actions.refreshModels()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="icon-btn" onClick={() => setState({ modal: null })} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="muted small">
            LocalCode never assumes a model can use tools. “Test tool calling” runs a live check; models that fail native tool calls use a clearly-labelled prompted fallback, and models that fail both are
            chat-only.
          </p>
          {models.map((l) => (
            <div key={l.provider.id} className="provider">
              <div className="provider-head">
                <span className={`dot ${l.health.ok ? 'ok' : 'bad'}`} /> <strong>{l.provider.label}</strong> <span className="muted small">{l.provider.baseUrl}</span>
                <span className="muted small">{l.health.ok ? `online${l.health.version ? ` · ${l.health.version}` : ''}` : `offline — ${l.health.error ?? ''}`}</span>
              </div>
              {l.health.ok && l.models.length === 0 && <div className="muted small pad">No models installed.</div>}
              {l.models.map((m) => (
                <ModelRow key={m.name} providerId={l.provider.id} m={m} loaded={l.loaded.some((x) => x.name === m.name)} />
              ))}
            </div>
          ))}
          <PullForm />
        </div>
      </div>
    </div>
  );
}
