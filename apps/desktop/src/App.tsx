import { Chat } from './components/Chat';
import { FileViewer } from './components/FileViewer';
import { ModelsModal } from './components/ModelsModal';
import { RightPanel } from './components/RightPanel';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Wizard } from './components/Wizard';
import { useStore } from './state';

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function ConnectionBanner() {
  const conn = useStore((s) => s.conn);
  const err = useStore((s) => s.connError);
  if (conn === 'open') return null;
  return <div className={`banner ${conn === 'closed' ? 'bad' : ''}`}>{conn === 'connecting' ? 'Connecting to the LocalCode engine…' : err ?? 'Disconnected from the LocalCode engine. Reconnecting…'}</div>;
}

export function App() {
  const modal = useStore((s) => s.modal);
  return (
    <div className="app">
      <TopBar />
      <ConnectionBanner />
      <main className="layout">
        <Sidebar />
        <Chat />
        <RightPanel />
      </main>
      {modal === 'settings' && <SettingsModal />}
      {modal === 'models' && <ModelsModal />}
      {modal === 'wizard' && <Wizard />}
      {modal === 'file' && <FileViewer />}
      <Toasts />
    </div>
  );
}
