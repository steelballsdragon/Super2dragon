import { useEffect, useMemo, useState } from 'react';
import { countryName } from '../game/state';
import { previewAction } from '../game/actions';
import { coastalSeas, isCoastal } from '../game/static';
import { WorldMap } from '../map/WorldMap';
import { useGame } from '../store/game';
import { useWorld } from '../store/hooks';
import { BottomPanel } from './game/BottomPanel';
import { EventCard } from './game/EventCard';
import { MapToolbar } from './game/MapToolbar';
import { NavRail, MobileNav } from './game/NavRail';
import { PanelHost } from './game/PanelHost';
import { ProvinceTooltip } from './game/ProvinceTooltip';
import { RightPanel } from './game/RightPanel';
import { SelectionCard } from './game/SelectionCard';
import { TopBar } from './game/TopBar';
import { GameOver } from './game/GameOver';
import { Welcome } from './game/Welcome';

const DELAYS = [0, 1700, 850, 260];

export function GameScreen() {
  const { w, rev, me } = useWorld();
  const s = useGame();
  const [eventOpen, setEventOpen] = useState<string | null>(null);
  const [rightMobile, setRightMobile] = useState(false);

  // The clock.
  useEffect(() => {
    if (!s.speed || s.busy || w.flags.gameOver) return;
    if (w.settings.pauseOnEvents && w.pendingEvents.length) { s.setSpeed(0); return; }
    const t = window.setTimeout(() => { void s.advance(); }, DELAYS[s.speed]);
    return () => window.clearTimeout(t);
  }, [s.speed, s.busy, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // New events open as cards.
  const firstEvent = w.pendingEvents[0]?.id ?? null;
  useEffect(() => {
    if (firstEvent && !s.busy) setEventOpen(firstEvent);
  }, [firstEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.code === 'Space') { e.preventDefault(); s.togglePause(); }
      else if (e.key === '1' || e.key === '2' || e.key === '3') s.setSpeed(Number(e.key) as 1 | 2 | 3);
      else if (e.key === 'Escape') { if (s.pick) s.setPick(null); else if (s.panel) s.openPanel(null); else { s.selectArmy(null); s.selectFleet(null); s.selectProvince(null); } }
      else if (e.key === 'n' && !s.busy) void s.advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);

  const onProvinceClick = (pid: string, ev: { button: number }) => {
    const st = useGame.getState();
    const army = st.selectedArmy ? w.armies[st.selectedArmy] : undefined;
    if (st.pick?.kind === 'moveArmy' || (ev.button === 2 && army && army.owner === me)) {
      const id = st.pick?.kind === 'moveArmy' ? st.pick.army : army!.id;
      st.setPick(null);
      // March overland when possible; otherwise try a convoy. Report once, with the reason that matters.
      const march = previewAction(w, me, { type: 'moveArmy', army: id, target: pid });
      if (march.valid) { st.dispatch({ type: 'moveArmy', army: id, target: pid }); return; }
      const from = w.armies[id]?.location;
      const overseas = from && isCoastal(from) && isCoastal(pid);
      const convoy = overseas ? previewAction(w, me, { type: 'expedition', army: id, target: pid }) : null;
      if (convoy?.valid) { st.dispatch({ type: 'expedition', army: id, target: pid }); return; }
      st.toast(convoy ? `${march.errors[0]} Nor can we ship them: ${convoy.errors[0]}` : march.errors.join(' '), 'warning');
      return;
    }
    if (st.pick?.kind === 'moveFleet') {
      // Fleets sail to the waters off the chosen coast.
      const sea = coastalSeas(pid)[0];
      if (sea) st.dispatch({ type: 'moveFleet', fleet: st.pick.fleet, target: sea });
      else st.toast('Choose a coastal province: the fleet will sail to the waters off it.', 'warning');
      st.setPick(null);
      return;
    }
    st.selectProvince(pid);
    const owner = w.provinces[pid]?.owner;
    st.selectCountry(owner ?? null);
    st.selectArmy(null);
    st.selectFleet(null);
  };

  const viewer = s.layer === 'diplomacy' && s.selectedCountry ? s.selectedCountry : me;
  const tooltip = useMemo(() => (pid: string) => <ProvinceTooltip w={w} pid={pid} layer={s.layer} viewer={viewer} />, [w, s.layer, viewer]);

  return (
    <div className="flex h-full flex-col bg-ink">
      <TopBar onOpenRight={() => setRightMobile(true)} />
      <div className="relative flex min-h-0 flex-1">
        <NavRail />
        <div className="relative min-w-0 flex-1">
          <WorldMap
            world={w}
            rev={rev}
            layer={s.layer}
            viewer={viewer}
            selectedCountry={s.selectedCountry}
            selectedProvince={s.selectedProvince}
            selectedArmy={s.selectedArmy}
            selectedFleet={s.selectedFleet}
            picking={!!s.pick}
            focus={s.focus}
            minimap
            onProvinceClick={onProvinceClick}
            onArmyClick={(id) => { s.selectArmy(id); s.selectProvince(w.armies[id]?.location ?? null); }}
            onFleetClick={(id) => s.selectFleet(id)}
            renderTooltip={tooltip}
          />
          <MapToolbar />
          {s.pick ? (
            <div className="pointer-events-none absolute left-1/2 top-14 z-20 -translate-x-1/2 rounded-full border border-gold/50 bg-ink/90 px-4 py-1.5 text-sm text-gold-bright shadow-lg">
              {s.pick.kind === 'moveArmy' ? 'Choose a destination for the army' : 'Choose a coast for the fleet'} · Esc to cancel
            </div>
          ) : null}
          <SelectionCard />
          <PanelHost />
          {w.flags.gameOver ? <GameOver /> : null}
        </div>
        <RightPanel mobileOpen={rightMobile} onCloseMobile={() => setRightMobile(false)} onOpenEvent={setEventOpen} />
      </div>
      <BottomPanel />
      <MobileNav onOpenRight={() => setRightMobile(true)} />
      {eventOpen && w.pendingEvents.some((e) => e.id === eventOpen) ? (
        <EventCard instanceId={eventOpen} onClose={() => setEventOpen(null)} onDecided={() => {
          const next = useGame.getState().world!.pendingEvents[0]?.id ?? null;
          setEventOpen(next);
        }} />
      ) : null}
      {s.welcome ? <Welcome onClose={() => useGame.setState({ welcome: false })} /> : null}
      <span className="sr-only" aria-live="polite">{countryName(w, me)}</span>
    </div>
  );
}
