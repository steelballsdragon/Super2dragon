import { useEffect, useState } from 'react';
import { backend, isTauri, pickFolder } from '../api';
import { actions, useStore } from '../state';

interface DirListing {
  dir: string;
  dirs: { name: string; path: string; count: number }[];
  files: { name: string; path: string; size: number }[];
}

function DirNode({ path, depth, workspaceId, version }: { path: string; depth: number; workspaceId: string; version: number }) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let cancelled = false;
    backend
      .call<DirListing>('workspace.listDir', { workspaceId, dir: path })
      .then((l) => !cancelled && setListing(l))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, workspaceId, version]);
  if (!listing) return <div className="tree-row muted" style={{ paddingLeft: 12 + depth * 12 }}>…</div>;
  return (
    <>
      {listing.dirs.map((d) => (
        <div key={d.path}>
          <button
            className="tree-row dir"
            style={{ paddingLeft: 8 + depth * 12 }}
            aria-expanded={!!open[d.path]}
            aria-label={`${d.name} folder, ${d.count} files`}
            onClick={() => setOpen((o) => ({ ...o, [d.path]: !o[d.path] }))}
          >
            <span className="caret">{open[d.path] ? '▾' : '▸'}</span> {d.name} <span className="muted small">{d.count}</span>
          </button>
          {open[d.path] && <DirNode path={d.path} depth={depth + 1} workspaceId={workspaceId} version={version} />}
        </div>
      ))}
      {listing.files.map((f) => (
        <button key={f.path} className="tree-row file" style={{ paddingLeft: 20 + depth * 12 }} onClick={() => actions.openFile(f.path)} title={f.path}>
          {f.name}
        </button>
      ))}
    </>
  );
}

export function Sidebar() {
  const workspace = useStore((s) => s.workspace);
  const workspaces = useStore((s) => s.workspaces);
  const conversations = useStore((s) => s.conversations);
  const conversationId = useStore((s) => s.conversationId);
  const version = useStore((s) => s.explorerVersion);
  const tasks = useStore((s) => s.tasks);
  const [pathInput, setPathInput] = useState('');
  const [showOpen, setShowOpen] = useState(false);
  const [section, setSection] = useState<'files' | 'chats'>('chats');

  const open = async () => {
    if (isTauri()) {
      const p = await pickFolder();
      if (p) await actions.openWorkspace(p);
      return;
    }
    setShowOpen((v) => !v);
  };

  return (
    <aside className="sidebar">
      <div className="ws-header">
        <div className="ws-name" title={workspace?.record.path}>
          {workspace ? workspace.record.name : 'No workspace'}
          {workspace && <div className="muted small ellipsis">{workspace.record.path}</div>}
        </div>
        <button className="btn small" onClick={open}>
          Open…
        </button>
      </div>
      {showOpen && (
        <form
          className="open-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (pathInput.trim()) void actions.openWorkspace(pathInput.trim()).then(() => setShowOpen(false));
          }}
        >
          <input className="input" autoFocus placeholder="/path/to/project" value={pathInput} onChange={(e) => setPathInput(e.target.value)} />
          {workspaces.length > 0 && (
            <div className="recent">
              <div className="label">Recent</div>
              {workspaces.slice(0, 8).map((w) => (
                <button type="button" key={w.id} className="tree-row" onClick={() => void actions.openWorkspace(w.path).then(() => setShowOpen(false))} title={w.path}>
                  {w.name} <span className="muted small ellipsis">{w.path}</span>
                </button>
              ))}
            </div>
          )}
        </form>
      )}
      {workspace && (
        <>
          <div className="tabs small-tabs">
            <button className={section === 'chats' ? 'tab active' : 'tab'} onClick={() => setSection('chats')}>
              Conversations
            </button>
            <button className={section === 'files' ? 'tab active' : 'tab'} onClick={() => setSection('files')}>
              Files
            </button>
          </div>
          {section === 'chats' ? (
            <div className="list">
              <button className="btn small block" onClick={() => actions.newConversation()}>
                + New conversation
              </button>
              {conversations.map((c) => {
                const running = c.id === conversationId && tasks.some((t) => t.running);
                return (
                  <div key={c.id} className={`conv-row ${c.id === conversationId ? 'active' : ''}`}>
                    <button className="conv-title" onClick={() => actions.selectConversation(c.id)} title={c.title}>
                      {running && <span className="spinner tiny" />} {c.title}
                      <div className="muted small">
                        {c.model ?? ''} · {new Date(c.updatedAt).toLocaleString()}
                      </div>
                    </button>
                    <button
                      className="icon-btn"
                      title="Delete conversation"
                      onClick={() => {
                        if (confirm(`Delete "${c.title}"? Files are not affected.`)) void actions.deleteConversation(c.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="tree">
              <DirNode path="" depth={0} workspaceId={workspace.record.id} version={version} />
            </div>
          )}
        </>
      )}
    </aside>
  );
}
