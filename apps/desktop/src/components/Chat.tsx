import { useEffect, useRef, useState } from 'react';
import { actions, setState, useStore } from '../state';
import { ApprovalCard, ReportCard, ToolCard } from './Cards';
import { Markdown } from './Markdown';

const EXAMPLES = [
  'Run the tests, find out why they fail, fix the bug, and re-run the tests until they pass.',
  'Explain the architecture of this project and its main entry points.',
  'Create a small REST API with an in-memory todo list, with tests.',
  'Add input validation to the main module and write tests for the edge cases.',
];

export function Chat() {
  const timeline = useStore((s) => s.timeline);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const tasks = useStore((s) => s.tasks);
  const workspace = useStore((s) => s.workspace);
  const conn = useStore((s) => s.conn);
  const sending = useStore((s) => !!s.busy.send);
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [timeline]);

  const activeTask = tasks.find((t) => t.id === activeTaskId);
  const lastTask = tasks[tasks.length - 1];
  const resumable = !activeTaskId && lastTask && ['interrupted', 'failed', 'blocked', 'cancelled'].includes(lastTask.status);

  const submit = async () => {
    const text = draft.trim();
    if (!text || activeTaskId) return;
    setDraft('');
    stick.current = true;
    await actions.send(text);
  };

  return (
    <section className="chat">
      <div
        className="timeline"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {!workspace && (
          <div className="empty">
            <h2>Welcome to LocalCode AI</h2>
            <p>Open a project folder from the sidebar to start. Everything runs on this computer with your local models.</p>
          </div>
        )}
        {workspace && timeline.length === 0 && (
          <div className="empty">
            <h2>{workspace.record.name}</h2>
            <p className="muted">
              {workspace.project.languages.map((l) => l.name).join(', ') || 'No source files detected'}
              {workspace.project.frameworks.length ? ` · ${workspace.project.frameworks.join(', ')}` : ''}
              {workspace.project.testCommand ? ` · tests: ${workspace.project.testCommand}` : ''}
            </p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} className="example" onClick={() => setDraft(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {timeline.map((item) => {
          switch (item.kind) {
            case 'user':
              return (
                <div key={item.id} className="msg user">
                  <div className="bubble">{item.text}</div>
                </div>
              );
            case 'note':
              return (
                <div key={item.id} className={`note ${item.level ?? ''}`}>
                  {item.text}
                </div>
              );
            case 'assistant':
              return (
                <div key={item.id} className="msg assistant">
                  {item.thinking && (
                    <details className="thinking">
                      <summary>Reasoning</summary>
                      <pre>{item.thinking}</pre>
                    </details>
                  )}
                  {item.text && <Markdown text={item.text} />}
                  {item.streaming && <span className="cursor" />}
                </div>
              );
            case 'tool':
              return <ToolCard key={item.id} item={item} />;
            case 'approval':
              return <ApprovalCard key={item.id} item={item} />;
            case 'report':
              return <ReportCard key={item.id} taskId={item.taskId} report={item.report} error={item.error} canResume={item.taskId === lastTask?.id && !activeTaskId} />;
          }
        })}
        {activeTask && (
          <div className="working">
            <span className="spinner" /> {activeTask.status === 'awaiting_approval' ? 'Waiting for your approval…' : 'Working…'}
          </div>
        )}
      </div>
      <div className="composer">
        {resumable && (
          <div className="resume-bar">
            Last task {lastTask.status}
            {lastTask.error ? `: ${lastTask.error.split('\n')[0].slice(0, 140)}` : ''}
            <button className="btn small primary" onClick={() => actions.resume(lastTask.id)}>
              {lastTask.status === 'failed' ? '↻ Retry' : '▶ Resume'}
            </button>
          </div>
        )}
        <textarea
          className="prompt"
          placeholder={workspace ? 'Describe a task… (Enter to send, Shift+Enter for a new line)' : 'Open a workspace first'}
          value={draft}
          disabled={!workspace || conn !== 'open'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={3}
        />
        <div className="composer-actions">
          <span className="muted small">{activeTaskId ? 'The agent is working. You can stop it at any time.' : ''}</span>
          {activeTaskId ? (
            <button className="btn danger" onClick={() => actions.stop()}>
              ■ Stop
            </button>
          ) : (
            <button className="btn primary" disabled={!draft.trim() || !workspace || sending} onClick={() => void submit()}>
              Send ↵
            </button>
          )}
          <button className="btn ghost" title="Show the activity log" onClick={() => setState({ rightTab: 'activity' })}>
            Activity
          </button>
        </div>
      </div>
    </section>
  );
}
