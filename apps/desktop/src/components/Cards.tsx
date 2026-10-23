import { useState } from 'react';
import { AnsiUp } from 'ansi_up';
import { actions, setState, type TimelineItem } from '../state';
import type { TaskReport } from '../types';

const ansi = new AnsiUp();
ansi.use_classes = true;

export function AnsiText({ text, className }: { text: string; className?: string }) {
  // ansi_up escapes HTML, so the output is safe to inject.
  return <pre className={className} dangerouslySetInnerHTML={{ __html: ansi.ansi_to_html(text) }} />;
}

const TOOL_ICONS: Record<string, string> = {
  list_files: '▤',
  read_file: '◧',
  search_code: '⌕',
  write_file: '✎',
  edit_file: '✎',
  move_file: '⇄',
  delete_file: '⌫',
  run_command: '❯',
  run_tests: '✔',
  inspect_errors: '⚠',
  process: '⚙',
  git_status: '⎇',
  git_diff: '±',
  git_commit: '⎇',
  undo_changes: '↶',
  update_plan: '☰',
};

function argPreview(name: string, args: Record<string, unknown>): string {
  if (typeof args.command === 'string') return args.command;
  if (typeof args.path === 'string') return args.path;
  if (typeof args.query === 'string') return `"${args.query}"`;
  if (name === 'move_file') return `${args.from} → ${args.to}`;
  if (name === 'update_plan') return `${(args.items as unknown[])?.length ?? 0} steps`;
  if (name === 'git_commit') return String(args.message ?? '');
  return '';
}

export function ToolCard({ item }: { item: Extract<TimelineItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  const statusClass = `tool-${item.status}`;
  const body = item.live ?? item.output ?? '';
  const isEdit = item.name === 'edit_file' && typeof item.args.old_string === 'string';
  return (
    <div className={`tool-card ${statusClass}`}>
      <button className="tool-head" onClick={() => setOpen(!open)} title="Show details">
        <span className="tool-icon">{TOOL_ICONS[item.name] ?? '•'}</span>
        <span className="tool-name">{item.name}</span>
        <span className="tool-arg">{argPreview(item.name, item.args)}</span>
        {item.salvaged && <span className="badge badge-warn" title="The model wrote this call as text; LocalCode recovered it">recovered</span>}
        {item.risk && !['read', 'build', 'write'].includes(item.risk) && <span className={`badge risk-${item.risk}`}>{item.risk}</span>}
        <span className="tool-status">
          {item.status === 'running' ? <span className="spinner" /> : item.status === 'ok' ? '✓' : item.status === 'error' ? '✗' : '…'}
          {item.durationMs !== undefined && <span className="muted"> {(item.durationMs / 1000).toFixed(1)}s</span>}
        </span>
      </button>
      {(open || item.status === 'running') && (
        <div className="tool-body">
          {isEdit && open && (
            <div className="edit-preview">
              <pre className="diff-del">{String(item.args.old_string)}</pre>
              <pre className="diff-add">{String(item.args.new_string)}</pre>
            </div>
          )}
          {open && !isEdit && Object.keys(item.args).length > 0 && <pre className="tool-args">{JSON.stringify(item.args, null, 2)}</pre>}
          {body && <AnsiText className="tool-output" text={body.length > 30000 ? `${body.slice(0, 30000)}\n… (truncated in view)` : body} />}
        </div>
      )}
    </div>
  );
}

export function ApprovalCard({ item }: { item: Extract<TimelineItem, { kind: 'approval' }> }) {
  const [message, setMessage] = useState('');
  const r = item.request;
  const danger = ['destructive', 'privileged'].includes(r.risk);
  const preview =
    typeof r.args.command === 'string'
      ? r.args.command
      : r.tool === 'write_file'
        ? `${r.args.path}\n\n${String(r.args.content ?? '').slice(0, 1500)}`
        : JSON.stringify(r.args, null, 2).slice(0, 2000);
  if (item.resolved) {
    return (
      <div className={`approval resolved ${item.resolved === 'deny' ? 'denied' : 'granted'}`}>
        {item.resolved === 'deny' ? '✗ Denied' : '✓ Approved'}: {r.summary} {item.resolved === 'allow_always' && <span className="muted">(always for “{r.ruleKey || r.tool}”)</span>}
      </div>
    );
  }
  return (
    <div className={`approval ${danger ? 'danger' : ''}`} role="alertdialog" aria-label="Approval required">
      <div className="approval-title">
        <span className={`badge risk-${r.risk}`}>{r.risk}</span> Approval required: <strong>{r.summary}</strong>
      </div>
      <div className="muted small">
        {r.decisionReason}
        {r.reasons.length > 0 && ` — ${r.reasons.join('; ')}`}
      </div>
      <pre className="approval-preview">{preview}</pre>
      <input className="input" placeholder="Optional note for the agent (e.g. “use pnpm instead”)" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="row gap">
        <button className="btn primary" onClick={() => actions.respondApproval(r.id, 'allow_once', message || undefined)}>
          Allow once
        </button>
        {r.risk !== 'privileged' && (
          <button className="btn" onClick={() => actions.respondApproval(r.id, 'allow_always', message || undefined)} title="Remember for this workspace">
            Always allow {r.ruleKey ? `“${r.ruleKey}”` : r.tool}
          </button>
        )}
        <button className="btn danger" onClick={() => actions.respondApproval(r.id, 'deny', message || undefined)}>
          Deny
        </button>
      </div>
    </div>
  );
}

export function ReportCard({ taskId, report, error, canResume }: { taskId: string; report: TaskReport; error?: string; canResume: boolean }) {
  const ok = report.status === 'completed';
  return (
    <div className={`report ${ok ? 'ok' : 'bad'}`}>
      <div className="report-head">
        <strong>{ok ? '■ Task completed' : `■ Task ${report.status}`}</strong>
        <span className="muted small">
          {report.steps} model calls · {(report.durationMs / 1000).toFixed(0)}s · {report.usage.completionTokens} tokens generated
        </span>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="report-grid">
        <div>
          <div className="label">Files changed (verified from disk)</div>
          {report.filesChanged.length === 0 ? (
            <div className="muted small">None</div>
          ) : (
            report.filesChanged.map((f) => (
              <button key={f.path} className="file-change" onClick={() => setState({ rightTab: 'diff', diffTaskId: taskId })}>
                <span className={`fstat fstat-${f.status}`}>{f.status[0].toUpperCase()}</span> {f.path} <span className="add">+{f.additions}</span> <span className="del">-{f.deletions}</span>
              </button>
            ))
          )}
        </div>
        <div>
          <div className="label">Commands (actual exit codes)</div>
          {report.commands.length === 0 ? (
            <div className="muted small">None</div>
          ) : (
            report.commands.slice(-8).map((c, i) => (
              <div key={i} className="cmd-line">
                <span className={`exit ${c.exitCode === 0 ? 'ok' : c.exitCode === null ? 'bg' : 'bad'}`}>{c.timedOut ? 'timeout' : c.exitCode === null ? 'bg' : c.exitCode}</span>
                <code>{c.command.slice(0, 100)}</code>
              </div>
            ))
          )}
          {report.tests.map((t, i) => (
            <div key={i} className={`small ${t.ok ? 'add' : 'del'}`}>
              Tests {t.ok ? 'passed' : 'failed'}: {t.passed ?? '?'} passed, {t.failed ?? '?'} failed
            </div>
          ))}
        </div>
      </div>
      {report.warnings.map((w, i) => (
        <div key={i} className="warn-text">
          ! {w}
        </div>
      ))}
      <div className="row gap">
        {report.filesChanged.length > 0 && report.checkpointBefore && (
          <button className="btn small" onClick={() => actions.undo(taskId)} title="Restore all files to the state before this task">
            ↶ Undo task changes
          </button>
        )}
        {report.filesChanged.length > 0 && (
          <button className="btn small" onClick={() => setState({ rightTab: 'diff', diffTaskId: taskId })}>
            ± Review diff
          </button>
        )}
        {canResume && !ok && (
          <button className="btn small primary" onClick={() => actions.resume(taskId)}>
            {report.status === 'failed' ? '↻ Retry' : '▶ Resume'}
          </button>
        )}
      </div>
    </div>
  );
}
