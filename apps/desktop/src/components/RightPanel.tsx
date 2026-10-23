import { useEffect, useMemo, useRef, useState } from 'react';
import { diffLines } from 'diff';
import { backend } from '../api';
import { actions, setState, useStore, type RightTab } from '../state';
import type { CheckpointRecord, FileDiff } from '../types';
import { AnsiText } from './Cards';

function PlanView() {
  const plan = useStore((s) => s.plan);
  if (!plan.length) return <div className="muted pad">No plan yet. For multi-step tasks the agent writes a checklist with acceptance criteria here.</div>;
  const done = plan.filter((p) => p.status === 'done').length;
  return (
    <div className="pad">
      <div className="progress">
        <div className="progress-bar" style={{ width: `${(100 * done) / plan.length}%` }} />
      </div>
      <div className="muted small">
        {done} of {plan.length} steps done
      </div>
      <ol className="plan">
        {plan.map((p) => (
          <li key={p.id} className={`plan-item ${p.status}`}>
            <span className="plan-mark">{p.status === 'done' ? '✓' : p.status === 'in_progress' ? '◐' : p.status === 'blocked' ? '!' : p.status === 'skipped' ? '–' : '○'}</span>
            <div>
              <div>{p.title}</div>
              {p.acceptance && <div className="muted small">Done when: {p.acceptance}</div>}
              {p.note && <div className="muted small">{p.note}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface Row {
  left?: { n: number; text: string };
  right?: { n: number; text: string };
  type: 'same' | 'del' | 'add' | 'mod';
}

/** Side-by-side rows from a line diff; unchanged runs longer than 6 lines are collapsed. */
function sideBySide(before: string, after: string): (Row | { gap: number })[] {
  const parts = diffLines(before, after);
  const rows: Row[] = [];
  let l = 1;
  let r = 1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const lines = p.value.replace(/\n$/, '').split('\n');
    if (!p.added && !p.removed) {
      for (const t of lines) rows.push({ left: { n: l++, text: t }, right: { n: r++, text: t }, type: 'same' });
    } else if (p.removed && parts[i + 1]?.added) {
      const added = parts[i + 1].value.replace(/\n$/, '').split('\n');
      const n = Math.max(lines.length, added.length);
      for (let k = 0; k < n; k++) {
        rows.push({
          left: k < lines.length ? { n: l++, text: lines[k] } : undefined,
          right: k < added.length ? { n: r++, text: added[k] } : undefined,
          type: 'mod',
        });
      }
      i++;
    } else if (p.removed) {
      for (const t of lines) rows.push({ left: { n: l++, text: t }, type: 'del' });
    } else {
      for (const t of lines) rows.push({ right: { n: r++, text: t }, type: 'add' });
    }
  }
  const out: (Row | { gap: number })[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].type !== 'same') {
      out.push(rows[i++]);
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].type === 'same') j++;
    const run = j - i;
    if (run > 6) {
      const head = i === 0 ? 0 : 3;
      const tail = j === rows.length ? 0 : 3;
      out.push(...rows.slice(i, i + head));
      out.push({ gap: run - head - tail });
      out.push(...rows.slice(j - tail, j));
    } else out.push(...rows.slice(i, j));
    i = j;
  }
  return out;
}

function FileDiffView({ d }: { d: FileDiff }) {
  const rows = useMemo(() => (d.binary ? [] : sideBySide(d.before ?? '', d.after ?? '')), [d]);
  return (
    <div className="filediff">
      <div className="filediff-head">
        <span className={`fstat fstat-${d.status}`}>{d.status}</span> {d.oldPath ? `${d.oldPath} → ` : ''}
        {d.path} <span className="add">+{d.additions}</span> <span className="del">-{d.deletions}</span>
      </div>
      {d.binary ? (
        <div className="muted pad">Binary file</div>
      ) : (
        <table className="sbs">
          <thead>
            <tr>
              <th colSpan={2}>Before</th>
              <th colSpan={2}>After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) =>
              'gap' in row ? (
                <tr key={i} className="gap">
                  <td colSpan={4}>⋯ {row.gap} unchanged lines</td>
                </tr>
              ) : (
                <tr key={i} className={row.type}>
                  <td className="ln">{row.left?.n ?? ''}</td>
                  <td className={`code ${row.left && row.type !== 'same' ? 'del-bg' : ''}`}>{row.left?.text ?? ''}</td>
                  <td className="ln">{row.right?.n ?? ''}</td>
                  <td className={`code ${row.right && row.type !== 'same' ? 'add-bg' : ''}`}>{row.right?.text ?? ''}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DiffViewPanel() {
  const tasks = useStore((s) => s.tasks);
  const diffTaskId = useStore((s) => s.diffTaskId);
  const workspace = useStore((s) => s.workspace);
  const version = useStore((s) => s.explorerVersion);
  const [mode, setMode] = useState<'task' | 'checkpoint'>('task');
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [cpId, setCpId] = useState('');
  const [diffs, setDiffs] = useState<FileDiff[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workspace) return;
    backend
      .call<CheckpointRecord[]>('checkpoints.list', { workspaceId: workspace.record.id })
      .then(setCheckpoints)
      .catch(() => {});
  }, [workspace, version]);

  useEffect(() => {
    setError('');
    setDiffs(null);
    const p =
      mode === 'task'
        ? diffTaskId
          ? backend.call<FileDiff[]>('tasks.diff', { taskId: diffTaskId })
          : Promise.resolve([] as FileDiff[])
        : cpId && workspace
          ? backend.call<FileDiff[]>('checkpoints.diff', { workspaceId: workspace.record.id, checkpointId: cpId })
          : Promise.resolve([] as FileDiff[]);
    p.then(setDiffs).catch((e) => setError((e as Error).message));
  }, [mode, diffTaskId, cpId, workspace, version]);

  return (
    <div className="pad diffpanel">
      <div className="row gap wrap">
        <select className="select" value={mode} onChange={(e) => setMode(e.target.value as 'task' | 'checkpoint')}>
          <option value="task">Changes made by a task</option>
          <option value="checkpoint">Changes since a checkpoint</option>
        </select>
        {mode === 'task' ? (
          <select className="select" value={diffTaskId ?? ''} onChange={(e) => setState({ diffTaskId: e.target.value })}>
            {tasks.length === 0 && <option value="">No tasks</option>}
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.prompt.slice(0, 60)}
              </option>
            ))}
          </select>
        ) : (
          <select className="select" value={cpId} onChange={(e) => setCpId(e.target.value)}>
            <option value="">Select checkpoint…</option>
            {checkpoints.map((c) => (
              <option key={c.id} value={c.id}>
                {new Date(c.createdAt).toLocaleTimeString()} · {c.label}
              </option>
            ))}
          </select>
        )}
        {mode === 'checkpoint' && cpId && workspace && (
          <button
            className="btn small danger"
            onClick={async () => {
              if (!confirm('Restore the workspace to this checkpoint? The current state is saved as a new checkpoint first.')) return;
              try {
                const r = await backend.call<{ restored: string[]; removed: string[] }>('checkpoints.restore', { workspaceId: workspace.record.id, checkpointId: cpId });
                alert(`Restored ${r.restored.length} file(s), removed ${r.removed.length}.`);
                setState((s) => ({ explorerVersion: s.explorerVersion + 1 }));
              } catch (e) {
                alert((e as Error).message);
              }
            }}
          >
            ↶ Restore
          </button>
        )}
        {mode === 'task' && diffTaskId && diffs && diffs.length > 0 && (
          <button className="btn small" onClick={() => actions.undo(diffTaskId)}>
            ↶ Undo task
          </button>
        )}
      </div>
      {error && <div className="error-text">{error}</div>}
      {!diffs && !error && <div className="muted">Loading…</div>}
      {diffs && diffs.length === 0 && <div className="muted">No file changes.</div>}
      {diffs?.map((d) => <FileDiffView key={d.path} d={d} />)}
    </div>
  );
}

function TerminalView() {
  const text = useStore((s) => s.terminal);
  const busy = useStore((s) => s.terminalBusy);
  const workspace = useStore((s) => s.workspace);
  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  return (
    <div className="terminal">
      <div className="term-out" ref={ref}>
        {text ? <AnsiText text={text} /> : <div className="muted">Output of the agent's commands streams here. You can also run your own commands below (they run in a separate shell, without agent permission checks).</div>}
      </div>
      <form
        className="term-in"
        onSubmit={(e) => {
          e.preventDefault();
          if (!cmd.trim() || busy) return;
          setHistory((h) => [cmd, ...h].slice(0, 50));
          setHIdx(-1);
          void actions.runTerminal(cmd);
          setCmd('');
        }}
      >
        <span className="prompt-sign">$</span>
        <input
          className="input mono"
          value={cmd}
          disabled={!workspace}
          placeholder={busy ? 'Running… (Stop to cancel)' : 'Type a command'}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && history.length) {
              const i = Math.min(history.length - 1, hIdx + 1);
              setHIdx(i);
              setCmd(history[i]);
              e.preventDefault();
            } else if (e.key === 'ArrowDown') {
              const i = hIdx - 1;
              setHIdx(i);
              setCmd(i >= 0 ? history[i] : '');
              e.preventDefault();
            }
          }}
        />
        {busy ? (
          <button type="button" className="btn small danger" onClick={() => actions.cancelTerminal()}>
            Stop
          </button>
        ) : (
          <button type="button" className="btn small ghost" onClick={() => setState({ terminal: '' })}>
            Clear
          </button>
        )}
      </form>
    </div>
  );
}

function ActivityView() {
  const activity = useStore((s) => s.activity);
  const [filter, setFilter] = useState<'all' | 'tools' | 'model' | 'warn'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const shown = activity.filter((a) =>
    filter === 'all' ? true : filter === 'tools' ? a.type.startsWith('tool') || a.type.startsWith('approval') : filter === 'model' ? a.type.startsWith('model') : a.level === 'warn' || a.level === 'error',
  );
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [shown.length]);
  return (
    <div className="activity">
      <div className="row gap pad-x">
        {(['all', 'tools', 'model', 'warn'] as const).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'warn' ? 'warnings' : f}
          </button>
        ))}
      </div>
      <div className="activity-list" ref={ref}>
        {shown.length === 0 && <div className="muted pad">No activity yet.</div>}
        {shown.map((a) => (
          <div key={a.id} className={`act act-${a.level}`}>
            <span className="act-time">{new Date(a.time).toLocaleTimeString()}</span>
            <span className="act-text">{a.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS: { id: RightTab; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'diff', label: 'Diff' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'activity', label: 'Activity' },
];

export function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  const planCount = useStore((s) => s.plan.length);
  return (
    <aside className="right">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setState({ rightTab: t.id })}>
            {t.label}
            {t.id === 'plan' && planCount > 0 ? ` (${planCount})` : ''}
          </button>
        ))}
      </div>
      <div className="right-body">
        {tab === 'plan' && <PlanView />}
        {tab === 'diff' && <DiffViewPanel />}
        {tab === 'terminal' && <TerminalView />}
        {tab === 'activity' && <ActivityView />}
      </div>
    </aside>
  );
}
