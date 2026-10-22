// Application state: which screen is showing, the live campaign, selection, map layer, the clock.
// The simulation mutates the world in place; `rev` is bumped whenever it changes so that
// components re-render.
import { create } from 'zustand';
import { applyAction, type ActionResult, type GameAction } from '../game/actions';
import { createWorld } from '../game/create';
import { refreshLedgers } from '../game/economy';
import {
  defaultStorage, deleteSave, deserialize, exportJson, latestSave, listSaves, loadGame, packWorld, storePacked, type SaveMeta,
} from '../game/save';
import { formatDate } from '../game/state';
import { provincePoint } from '../game/static';
import type { Difficulty, WorldState } from '../game/types';
import { simulate } from './sim';

export type Screen = 'menu' | 'select' | 'game' | 'load' | 'atlas' | 'chronicles';
export type MapLayer = 'political' | 'terrain' | 'economy' | 'trade' | 'diplomacy' | 'military' | 'population';
export type PanelId =
  | 'overview' | 'court' | 'economy' | 'construction' | 'military' | 'diplomacy' | 'technology'
  | 'espionage' | 'trade' | 'laws' | 'chronicles' | 'reports';

export interface Toast { id: number; text: string; kind: 'info' | 'success' | 'warning' | 'danger' }

export type PickMode =
  | { kind: 'moveArmy'; army: string }
  | { kind: 'moveFleet'; fleet: string }
  | null;

interface GameStore {
  screen: Screen;
  world: WorldState | null;
  rev: number;
  speed: 0 | 1 | 2 | 3;
  busy: boolean;
  error: string | null;
  saves: SaveMeta[];
  // Selection
  selectedProvince: string | null;
  selectedCountry: string | null;
  selectedArmy: string | null;
  selectedFleet: string | null;
  pick: PickMode;
  // Layout
  layer: MapLayer;
  panel: PanelId | null;
  rightOpen: boolean;
  bottomOpen: boolean;
  focus: { x: number; y: number; k?: number; t: number } | null;
  toasts: Toast[];
  councilOrder: { text: string; t: number } | null;
  welcome: boolean;

  setScreen(s: Screen): void;
  newGame(opts: { playerId: string; difficulty: Difficulty; name?: string; seed?: number }): void;
  continueGame(): boolean;
  loadSave(id: string): boolean;
  saveNow(name?: string): SaveMeta | null;
  autosave(): void;
  removeSave(id: string): void;
  refreshSaves(): void;
  exportCampaign(): void;
  importCampaign(text: string): boolean;
  quitToMenu(): void;
  dispatch(a: GameAction, opts?: { quiet?: boolean }): ActionResult;
  advance(): Promise<void>;
  setSpeed(s: 0 | 1 | 2 | 3): void;
  togglePause(): void;
  bump(): void;
  selectProvince(id: string | null): void;
  selectCountry(id: string | null): void;
  selectArmy(id: string | null): void;
  selectFleet(id: string | null): void;
  setPick(p: PickMode): void;
  setLayer(l: MapLayer): void;
  openPanel(p: PanelId | null): void;
  setRightOpen(v: boolean): void;
  setBottomOpen(v: boolean): void;
  focusOn(x: number, y: number, k?: number): void;
  toast(text: string, kind?: Toast['kind']): void;
  sendToCouncil(text: string): void;
  dismissToast(id: number): void;
}

const storage = defaultStorage();

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`totw1800:pref:${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: unknown): void {
  try { localStorage.setItem(`totw1800:pref:${key}`, JSON.stringify(v)); } catch { /* preferences are optional */ }
}

let toastSeq = 0;

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  world: null,
  rev: 0,
  speed: 0,
  busy: false,
  error: null,
  saves: listSaves(storage),
  selectedProvince: null,
  selectedCountry: null,
  selectedArmy: null,
  selectedFleet: null,
  pick: null,
  layer: readPref<MapLayer>('layer', 'political'),
  panel: null,
  rightOpen: readPref('rightOpen', true),
  bottomOpen: readPref('bottomOpen', false),
  focus: null,
  toasts: [],
  councilOrder: null,
  welcome: false,

  setScreen: (screen) => set({ screen, error: null }),

  newGame: ({ playerId, difficulty, name, seed }) => {
    const world = createWorld({ playerId, difficulty, name, seed });
    set({ world, rev: get().rev + 1, screen: 'game', speed: 0, selectedCountry: playerId, selectedProvince: null, selectedArmy: null, selectedFleet: null, pick: null, panel: null, welcome: true });
    get().autosave();
    const cap = world.countries[playerId]?.capital;
    if (cap) setTimeout(() => focusCapital(world, cap), 50);
  },

  continueGame: () => {
    const latest = latestSave(storage);
    return latest ? get().loadSave(latest.id) : false;
  },

  loadSave: (id) => {
    try {
      const world = loadGame(storage, id);
      set({ world, rev: get().rev + 1, screen: 'game', speed: 0, selectedCountry: world.playerId, selectedProvince: null, selectedArmy: null, selectedFleet: null, pick: null, panel: null, error: null });
      get().toast(`Loaded ${world.campaign.name} — ${formatDate(world.turn)}.`, 'success');
      const cap = world.countries[world.playerId]?.capital;
      if (cap) setTimeout(() => focusCapital(world, cap), 50);
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      get().toast((e as Error).message, 'danger');
      return false;
    }
  },

  saveNow: (name) => {
    const w = get().world;
    if (!w) return null;
    try {
      const meta = storePacked(storage, w, packWorld(w), { name: name?.trim() || `${w.campaign.name} — ${formatDate(w.turn)}` });
      set({ saves: listSaves(storage) });
      get().toast(`Saved “${meta.name}”.`, 'success');
      return meta;
    } catch (e) {
      get().toast((e as Error).message, 'danger');
      return null;
    }
  },

  autosave: () => {
    const w = get().world;
    if (!w) return;
    try {
      storePacked(storage, w, packWorld(w), { autosave: true });
      set({ saves: listSaves(storage) });
    } catch (e) {
      get().toast(`Autosave failed: ${(e as Error).message}`, 'warning');
    }
  },

  removeSave: (id) => {
    deleteSave(storage, id);
    set({ saves: listSaves(storage) });
  },

  refreshSaves: () => set({ saves: listSaves(storage) }),

  exportCampaign: () => {
    const w = get().world;
    if (!w) return;
    const blob = new Blob([exportJson(w)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${w.campaign.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${1800 + Math.floor(w.turn / 12)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },

  importCampaign: (text) => {
    try {
      const world = deserialize(text);
      set({ world, rev: get().rev + 1, screen: 'game', speed: 0, selectedCountry: world.playerId, panel: null, error: null });
      get().autosave();
      get().toast(`Imported ${world.campaign.name}.`, 'success');
      return true;
    } catch (e) {
      get().toast((e as Error).message, 'danger');
      set({ error: (e as Error).message });
      return false;
    }
  },

  quitToMenu: () => {
    if (get().world) get().autosave();
    set({ screen: 'menu', speed: 0, pick: null });
  },

  dispatch: (a, opts) => {
    const w = get().world;
    if (!w) return { ok: false, message: 'No campaign.' };
    if (get().busy) return { ok: false, message: 'The month is being processed; try again in a moment.' };
    let r: ActionResult;
    try {
      r = applyAction(w, w.playerId, a);
    } catch (e) {
      console.error(e);
      r = { ok: false, message: `Something went wrong: ${(e as Error).message}` };
    }
    if (!opts?.quiet || !r.ok) get().toast(r.message, r.ok ? 'success' : 'warning');
    set({ rev: get().rev + 1 });
    return r;
  },

  advance: async () => {
    const s = get();
    const w = s.world;
    if (!w || s.busy || w.flags.gameOver) return;
    set({ busy: true });
    try {
      const every = Math.max(1, w.settings.autosaveMonths || 3);
      const pack = (w.turn + 1) % every === 0;
      const { world, packed } = await simulate(w, 1, pack);
      refreshLedgers(world);
      const patch: Partial<GameStore> = { world, busy: false, rev: get().rev + 1 };
      if (packed) {
        try { storePacked(storage, world, packed, { autosave: true }); patch.saves = listSaves(storage); } catch (e) { get().toast(`Autosave failed: ${(e as Error).message}`, 'warning'); }
      }
      if ((world.settings.pauseOnEvents && world.pendingEvents.length) || world.flags.gameOver) patch.speed = 0;
      // Selections may refer to armies destroyed this month.
      if (get().selectedArmy && !world.armies[get().selectedArmy!]) patch.selectedArmy = null;
      if (get().selectedFleet && !world.fleets[get().selectedFleet!]) patch.selectedFleet = null;
      set(patch);
    } catch (e) {
      console.error(e);
      set({ busy: false, speed: 0, error: (e as Error).message });
      get().toast(`The month could not be processed: ${(e as Error).message.split('\n')[0]}`, 'danger');
    }
  },

  setSpeed: (speed) => set({ speed }),
  togglePause: () => set({ speed: get().speed ? 0 : 1 }),
  bump: () => set({ rev: get().rev + 1 }),
  selectProvince: (id) => set({ selectedProvince: id }),
  selectCountry: (id) => set({ selectedCountry: id }),
  selectArmy: (id) => set({ selectedArmy: id, selectedFleet: id ? null : get().selectedFleet }),
  selectFleet: (id) => set({ selectedFleet: id, selectedArmy: id ? null : get().selectedArmy }),
  setPick: (pick) => set({ pick }),
  setLayer: (layer) => { writePref('layer', layer); set({ layer }); },
  openPanel: (panel) => set({ panel }),
  setRightOpen: (rightOpen) => { writePref('rightOpen', rightOpen); set({ rightOpen }); },
  setBottomOpen: (bottomOpen) => { writePref('bottomOpen', bottomOpen); set({ bottomOpen }); },
  focusOn: (x, y, k) => set({ focus: { x, y, k, t: Date.now() } }),
  toast: (text, kind = 'info') => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts.slice(-4), { id, text, kind }] });
    setTimeout(() => get().dismissToast(id), kind === 'danger' ? 7000 : 4200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  sendToCouncil: (text) => set({ councilOrder: { text, t: Date.now() }, rightOpen: true }),
}));

function focusCapital(_world: WorldState, cap: string): void {
  const [x, y] = provincePoint(cap);
  useGame.getState().focusOn(x, y, 3);
}

// Persist the campaign when the tab is hidden or closed, so a refresh never loses progress.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && useGame.getState().world && !useGame.getState().busy) useGame.getState().autosave();
  });
}

export function hasSaves(): boolean {
  return listSaves(storage).length > 0;
}
