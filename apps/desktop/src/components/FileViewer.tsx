import { useEffect, useState } from 'react';
import { backend } from '../api';
import { setState, useStore } from '../state';

export function FileViewer() {
  const path = useStore((s) => s.filePath);
  const workspace = useStore((s) => s.workspace);
  const [file, setFile] = useState<{ content: string | null; binary?: boolean; tooLarge?: boolean; size: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!path || !workspace) return;
    backend
      .call<typeof file>('workspace.readFile', { workspaceId: workspace.record.id, path })
      .then(setFile)
      .catch((e) => setError((e as Error).message));
  }, [path, workspace]);
  const lines = file?.content?.split('\n') ?? [];
  return (
    <div className="modal-backdrop" onClick={() => setState({ modal: null })}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={path}>
        <div className="modal-head">
          <h2 className="mono">{path}</h2>
          <button className="icon-btn" onClick={() => setState({ modal: null })} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body code-view">
          {error && <div className="error-text">{error}</div>}
          {file?.binary && <div className="muted">Binary file ({file.size} bytes)</div>}
          {file?.tooLarge && <div className="muted">File too large to preview ({file.size} bytes)</div>}
          {file?.content != null && (
            <table className="code-table">
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="ln">{i + 1}</td>
                    <td className="code">{l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
