import { AlertTriangle, CheckCircle2, Info, XOctagon } from 'lucide-react';
import { Component, Suspense, lazy, type ReactNode } from 'react';
import { MainMenu } from './screens/MainMenu';
import { useGame } from './store/game';
import { Modal } from './ui/kit';

const CountrySelect = lazy(() => import('./screens/CountrySelect').then((m) => ({ default: m.CountrySelect })));
const GameScreen = lazy(() => import('./screens/GameScreen').then((m) => ({ default: m.GameScreen })));
const LoadGame = lazy(() => import('./screens/LoadGame').then((m) => ({ default: m.LoadGame })));
const Atlas = lazy(() => import('./screens/Atlas').then((m) => ({ default: m.Atlas })));
const Chronicles = lazy(() => import('./screens/Chronicles').then((m) => ({ default: m.Chronicles })));

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        {screen === 'menu' ? <MainMenu /> : null}
        {screen === 'select' ? <CountrySelect /> : null}
        {screen === 'game' ? <GameScreen /> : null}
        {screen === 'load' ? <LoadGame /> : null}
        {screen === 'atlas' ? <Atlas /> : null}
        {screen === 'chronicles' ? <Chronicles /> : null}
      </Suspense>
      <ConfirmHost />
      <Toasts />
    </ErrorBoundary>
  );
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-ink">
      <div className="text-center">
        <div className="title-gilt text-xl">Thrones of the World</div>
        <div className="mt-2 font-serif italic text-parchment-dim">The couriers are on the road…</div>
      </div>
    </div>
  );
}

/** In-page replacement for window.confirm, which embedded viewers may block. */
function ConfirmHost() {
  const req = useGame((s) => s.confirmRequest);
  const answer = useGame((s) => s.answerConfirm);
  const choice = useGame((s) => s.choiceRequest);
  const choose = useGame((s) => s.answerChoice);
  if (choice) {
    return (
      <Modal open onClose={() => choose(null)} title={choice.title}>
        <div className="space-y-4 p-5">
          {choice.body ? <p className="whitespace-pre-line text-sm text-parchment-dim">{choice.body}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn btn-quiet" onClick={() => choose(null)}>Cancel</button>
            {choice.choices.map((c) => <button key={c.id} className={`btn ${c.primary ? 'btn-gold' : 'btn-ghost'}`} onClick={() => choose(c.id)}>{c.label}</button>)}
          </div>
        </div>
      </Modal>
    );
  }
  if (!req) return null;
  return (
    <Modal open onClose={() => answer(false)} title={req.title}>
      <div className="space-y-4 p-5">
        {req.body ? <p className="whitespace-pre-line text-sm text-parchment-dim">{req.body}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="btn btn-quiet" onClick={() => answer(false)}>Cancel</button>
          <button autoFocus className={`btn ${req.tone === 'war' ? 'btn-war' : 'btn-gold'}`} onClick={() => answer(true)}>{req.confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[60] flex flex-col items-center gap-2 px-3 sm:top-16" aria-live="polite">
      {toasts.map((t, i) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'warning' ? AlertTriangle : t.kind === 'danger' ? XOctagon : Info;
        const color = t.kind === 'success' ? 'text-econ' : t.kind === 'warning' ? 'text-gold' : t.kind === 'danger' ? 'text-war' : 'text-diplo';
        return (
          <button key={t.id} className={`panel pointer-events-auto max-w-md items-start gap-2 px-3 py-2 text-left text-[13px] animate-rise sm:text-sm ${i < toasts.length - 2 ? 'hidden sm:flex' : 'flex'}`} onClick={() => dismiss(t.id)}>
            <Icon size={16} className={`mt-0.5 shrink-0 ${color}`} />
            <span>{t.text}</span>
          </button>
        );
      })}
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center bg-ink p-6">
        <div className="panel max-w-lg p-6">
          <h1 className="font-display text-lg text-gold">A courier has fallen from his horse</h1>
          <p className="mt-2 text-sm text-parchment-dim">Something went wrong while drawing this screen. Your campaign is autosaved; you can return to the menu and continue.</p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs text-war scroll-thin">{this.state.error.message}</pre>
          <button className="btn btn-gold mt-4" onClick={() => { this.setState({ error: null }); useGame.getState().setScreen('menu'); }}>Return to the menu</button>
        </div>
      </div>
    );
  }
}
