import { actions, setState, useStore } from '../state';
import type { PermissionMode } from '../types';

const MODE_HELP: Record<PermissionMode, string> = {
  strict: 'Read-only by default: every write, command and test run needs your approval',
  standard: 'Reads, file edits and build/test commands run directly; other commands, network and deletions ask',
  autonomous: 'Edits and commands run directly; network, deletions and privileged commands still ask',
};

export function TopBar() {
  const conn = useStore((s) => s.conn);
  const connError = useStore((s) => s.connError);
  const models = useStore((s) => s.models);
  const settings = useStore((s) => s.settings);
  const conversation = useStore((s) => s.conversation);
  const workspace = useStore((s) => s.workspace);
  const modelsLoading = useStore((s) => s.modelsLoading);

  const current =
    conversation?.providerId && conversation.model ? `${conversation.providerId}/${conversation.model}` : settings?.models.coding ? `${settings.models.coding.providerId}/${settings.models.coding.model}` : '';
  const onlineProviders = models.filter((m) => m.health.ok);
  const chatModels = onlineProviders.flatMap((l) => l.models.filter((m) => m.chatCapable).map((m) => ({ l, m })));
  const selected = chatModels.find(({ l, m }) => `${l.provider.id}/${m.name}` === current);

  const serverDot = conn !== 'open' ? 'bad' : onlineProviders.length ? 'ok' : 'warn';
  const serverText =
    conn !== 'open'
      ? connError ?? 'Connecting to engine…'
      : onlineProviders.length
        ? `Engine connected · ${onlineProviders.map((p) => `${p.provider.label}${p.health.version ? ` ${p.health.version}` : ''}`).join(', ')}`
        : 'Engine connected, but no inference server is running (start Ollama or llama.cpp)';

  return (
    <header className="topbar">
      <div className="brand">
        <img src="/icon.svg" alt="" width={20} height={20} /> LocalCode <span className="muted">AI</span>
      </div>
      <div className="conn" title={serverText}>
        <span className={`dot ${serverDot}`} /> <span className="conn-text">{conn === 'open' ? (onlineProviders.length ? 'Local model server online' : 'No model server') : conn === 'connecting' ? 'Connecting…' : 'Disconnected'}</span>
      </div>
      <div className="spacer" />
      <label className="field-inline" title="Model used by this conversation (switching keeps the history)">
        <span className="muted small">Model</span>
        <select
          className="select"
          value={current}
          onChange={(e) => {
            const [providerId, ...rest] = e.target.value.split('/');
            if (providerId) void actions.setModel({ providerId, model: rest.join('/') });
          }}
        >
          {!selected && (
            <option value={current}>
              {current ? `${current} (not available)` : modelsLoading ? 'Loading models…' : chatModels[0] ? `Auto (${chatModels[0].m.name})` : 'No models installed'}
            </option>
          )}
          {onlineProviders.map((l) => (
            <optgroup key={l.provider.id} label={l.provider.label}>
              {l.models
                .filter((m) => m.chatCapable)
                .map((m) => (
                  <option key={m.name} value={`${l.provider.id}/${m.name}`}>
                    {m.name} {m.parameterSize ? `(${m.parameterSize})` : ''} · {m.toolMode === 'native' ? 'tools' : m.toolMode === 'prompted' ? 'tools: fallback' : 'chat only'}
                    {m.toolModeSource === 'probe' ? ' ✓' : ''}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {selected?.m.toolMode === 'prompted' && (
        <span className="badge badge-warn" title={selected.m.probe?.explanation ?? 'Tool calls are parsed from text because native tool calling is unavailable or unreliable for this model.'}>
          fallback tools
        </span>
      )}
      {selected?.m.toolMode === 'none' && (
        <span className="badge risk-destructive" title={selected.m.probe?.explanation}>
          chat only
        </span>
      )}
      {selected && selected.m.toolModeSource !== 'probe' && selected.m.toolModeSource !== 'override' && (
        <button className="btn small ghost" title="Tool support is unverified. Test it." onClick={() => setState({ modal: 'models' })}>
          verify tools
        </button>
      )}
      {workspace && (
        <label className="field-inline" title={MODE_HELP[workspace.permissionMode]}>
          <span className="muted small">Permissions</span>
          <select className="select" value={workspace.permissionMode} onChange={(e) => void actions.setPermissionMode(e.target.value as PermissionMode)}>
            <option value="strict">Strict (read-only)</option>
            <option value="standard">Standard</option>
            <option value="autonomous">Autonomous</option>
          </select>
        </label>
      )}
      <button className="btn ghost" onClick={() => setState({ modal: 'models' })}>
        Models
      </button>
      <button className="btn ghost" onClick={() => setState({ modal: 'settings' })} aria-label="Settings">
        ⚙ Settings
      </button>
    </header>
  );
}
