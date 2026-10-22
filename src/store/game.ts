// Application state: which screen is showing, the live campaign, selection, map layer, the clock.
// The simulation mutates the world in place; `rev` is bumped whenever it changes so that
// components re-render.
import { create } from 'zustand';
import { applyAction, type ActionResult, type GameAction } from '../game/actions';
import { createWorld } from '../game/create';
import { refreshLedgers } from '../game/economy';
import {
  defaultStorage, deleteSave, deserialize, exportJson, listSaves, loadGame, MemoryStorage, packWorld, readPacked, recoverOrphans, storePacked,
  unpackWorld, writeSlot, type SaveMeta,
} from '../game/save';
import { formatDate } from '../game/state';
import { provincePoint } from '../game/static';
import type { Difficulty, WorldState } from '../game/types';
import { cloudDelete, cloudFetch, cloudSave, flushCloud, initCloud, refreshCloudIndex, type CloudMeta, type CloudStatus } from './cloud';
import { devNote, devResolvePendingEvents } from '../game/dev';
import { simulate } from './sim';

export type Screen = 'menu' | 'select' | 'game' | 'load' | 'atlas' | 'chronicles';
export type MapLayer = 'political' | 'terrain' | 'economy' | 'trade' | 'diplomacy' | 'military' | 'population';
export type PanelId =
  | 'overview' | 'court' | 'economy' | 'construction' | 'military' | 'diplomacy' | 'technology'
  | 'espionage' | 'trade' | 'laws' | 'chronicles' | 'reports' | 'developer';

export interface Toast { id: number; text: string; kind: 'info' | 'success' | 'warning' | 'danger' }

export interface ConfirmRequest { title: string; body?: string; confirmLabel: string; tone?: 'war' | 'gold'; resolve: (ok: boolean) => void }

export interface ChoiceRequest { title: string; body?: string; choices: { id: string; label: string; primary?: boolean }[]; resolve: (id: string | null) => void }

export type PickMode =
  | { kind: 'moveArmy'; army: string }
  | { kind: 'moveFleet'; fleet: string }
  | { kind: 'gather' }
  | { kind: 'voyage'; army: string }
  | null;

interface GameStore {
  screen: Screen;
  world: WorldState | null;
  rev: number;
  speed: 0 | 1 | 2 | 3;
  busy: boolean;
  error: string | null;
  saves: SaveMeta[];
  /** Saves in the player's private cloud area (claude.ai viewer only). */
  cloudSaves: CloudMeta[];
  cloud: CloudStatus;
  /** False when the browser refuses storage and saves would vanish with the page. */
  storageKept: boolean;
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
  confirmRequest: ConfirmRequest | null;
  choiceRequest: ChoiceRequest | null;
  /** In-page choice between several answers; resolves null when dismissed. */
  askChoice(opts: Omit<ChoiceRequest, 'resolve'>): Promise<string | null>;
  answerChoice(id: string | null): void;
  /** In-page confirmation (the hosted viewer refuses window.confirm). */
  askConfirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean>;
  answerConfirm(ok: boolean): void;

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
  /** Developer time skip; `decide` lets the council answer the player's events on the way. */
  devAdvance(months: number, decide: boolean): Promise<void>;
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
  cloudSaves: [],
  cloud: 'off',
  storageKept: !(storage instanceof MemoryStorage),
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
  confirmRequest: null,
  choiceRequest: null,
  askChoice: (opts) => new Promise<string | null>((resolve) => {
    get().choiceRequest?.resolve(null);
    set({ choiceRequest: { ...opts, resolve } });
  }),
  answerChoice: (id) => {
    const r = get().choiceRequest;
    set({ choiceRequest: null });
    r?.resolve(id);
  },
  askConfirm: (opts) => new Promise<boolean>((resolve) => {
    get().confirmRequest?.resolve(false);
    set({ confirmRequest: { ...opts, resolve } });
  }),
  answerConfirm: (ok) => {
    const r = get().confirmRequest;
    set({ confirmRequest: null });
    r?.resolve(ok);
  },

  setScreen: (screen) => set({ screen, error: null }),

  newGame: ({ playerId, difficulty, name, seed }) => {
    const world = createWorld({ playerId, difficulty, name, seed });
    set({ world, rev: get().rev + 1, screen: 'game', speed: 0, selectedCountry: playerId, selectedProvince: null, selectedArmy: null, selectedFleet: null, pick: null, panel: null, welcome: true });
    get().autosave();
    const cap = world.countries[playerId]?.capital;
    if (cap) setTimeout(() => focusCapital(world, cap), 50);
  },

  continueGame: () => {
    const latest = allSaves(get())[0];
    return latest ? get().loadSave(latest.id) : false;
  },

  loadSave: (id) => {
    const open = (world: WorldState) => {
      set({ world, rev: get().rev + 1, screen: 'game', speed: 0, busy: false, selectedCountry: world.playerId, selectedProvince: null, selectedArmy: null, selectedFleet: null, pick: null, panel: null, error: null });
      get().toast(`Loaded ${world.campaign.name} — ${formatDate(world.turn)}.`, 'success');
      const cap = world.countries[world.playerId]?.capital;
      if (cap) setTimeout(() => focusCapital(world, cap), 50);
    };
    const failed = (e: unknown) => {
      set({ error: (e as Error).message, busy: false });
      get().toast((e as Error).message, 'danger');
    };
    const local = get().saves.find((m) => m.id === id);
    const remote = get().cloudSaves.find((m) => m.id === id);
    // A copy played further on another device or browser wins over this browser's.
    if (remote && (!local || remote.savedAt > local.savedAt || !readPacked(storage, id))) {
      set({ busy: true });
      cloudFetch(id).then(({ meta, packed }) => {
        const world = unpackWorld(packed);
        const { chunks: _c, gen: _g, stamp: _s, ...plain } = meta;
        try { writeSlot(storage, plain, packed); set({ saves: listSaves(storage) }); } catch { /* still playable from memory */ }
        open(world);
      }).catch(failed);
      return true;
    }
    try {
      open(loadGame(storage, id));
      return true;
    } catch (e) {
      failed(e);
      return false;
    }
  },

  saveNow: (name) => {
    const w = get().world;
    if (!w) return null;
    try {
      const packed = packWorld(w);
      const meta = storePacked(storage, w, packed, { name: name?.trim() || `${w.campaign.name} — ${formatDate(w.turn)}` });
      set({ saves: listSaves(storage) });
      void cloudSave(meta, packed, { now: true });
      requestPersistence();
      get().toast(`Saved “${meta.name}”${get().cloud === 'on' ? ' (also to your claude.ai account)' : ''}.`, 'success');
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
      const packed = packWorld(w);
      const meta = storePacked(storage, w, packed, { autosave: true });
      set({ saves: listSaves(storage) });
      void cloudSave(meta, packed);
    } catch (e) {
      get().toast(`Autosave failed: ${(e as Error).message}`, 'warning');
    }
  },

  removeSave: (id) => {
    deleteSave(storage, id);
    set({ saves: listSaves(storage), cloudSaves: get().cloudSaves.filter((m) => m.id !== id) });
    void cloudDelete(id);
  },

  refreshSaves: () => {
    const found = recoverOrphans(storage);
    set({ saves: listSaves(storage) });
    if (found) get().toast(`Recovered ${found} save${found > 1 ? 's' : ''} that had dropped out of the list.`, 'success');
  },

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
        try {
          const meta = storePacked(storage, world, packed, { autosave: true });
          patch.saves = listSaves(storage);
          void cloudSave(meta, packed);
        } catch (e) { get().toast(`Autosave failed: ${(e as Error).message}`, 'warning'); }
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

  devAdvance: async (months, decide) => {
    let world = get().world;
    if (!world || get().busy) return;
    set({ busy: true, speed: 0 });
    try {
      let done = 0;
      for (; done < months && !world.flags.gameOver; done++) {
        world = (await simulate(world, 1, false)).world;
        if (decide) devResolvePendingEvents(world);
      }
      devNote(world, `Skipped ${done} month${done === 1 ? '' : 's'}${decide ? ', the council deciding events' : ''}`);
      refreshLedgers(world);
      set({ world, busy: false, rev: get().rev + 1 });
      get().autosave();
      get().toast(`${done} month${done === 1 ? '' : 's'} have passed: it is now ${formatDate(world.turn)}.`, 'success');
    } catch (e) {
      set({ busy: false });
      get().toast(`The time skip stopped: ${(e as Error).message}`, 'danger');
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
    if (get().toasts.some((t) => t.text === text)) return;
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

/** Local and cloud saves together, newest first; a save in both places is listed once. */
export type ListedSave = SaveMeta & { local: boolean; cloud: boolean };
export function allSaves(s: Pick<GameStore, 'saves' | 'cloudSaves'>): ListedSave[] {
  const out = new Map<string, ListedSave>();
  for (const m of s.saves) out.set(m.id, { ...m, local: true, cloud: false });
  for (const m of s.cloudSaves) {
    const have = out.get(m.id);
    const { chunks: _c, gen: _g, stamp: _s, ...plain } = m;
    if (!have) out.set(m.id, { ...plain, local: false, cloud: true });
    else out.set(m.id, have.savedAt >= m.savedAt ? { ...have, cloud: have.savedAt === m.savedAt } : { ...plain, local: false, cloud: true });
  }
  return [...out.values()].sort((a, b) => b.savedAt - a.savedAt);
}

/** What this browser holds for the game, for the developer tools. */
export function inspectStorage(): { kept: boolean; entries: { key: string; chars: number }[]; listed: string[] } {
  const entries: { key: string; chars: number }[] = [];
  const n = typeof storage.length === 'number' ? storage.length : 0;
  for (let i = 0; i < n; i++) {
    const key = storage.key?.(i);
    if (key && key.startsWith('totw1800:')) entries.push({ key, chars: storage.getItem(key)?.length ?? 0 });
  }
  return { kept: !(storage instanceof MemoryStorage), entries: entries.sort((a, b) => a.key.localeCompare(b.key)), listed: listSaves(storage).map((m) => m.id) };
}

/** Sends every local save the cloud lacks or holds an older copy of. */
export async function syncLocalToCloud(): Promise<number> {
  const s = useGame.getState();
  if (s.cloud !== 'on') return 0;
  const cloud = await refreshCloudIndex();
  let sent = 0;
  for (const m of listSaves(storage)) {
    const there = cloud.find((c) => c.id === m.id);
    const packed = there && there.savedAt >= m.savedAt ? null : readPacked(storage, m.id);
    if (packed) { sent++; await cloudSave(m, packed, { now: true }); }
  }
  return sent;
}

/** Asks the browser not to evict this page's storage under pressure (best effort). */
let persistenceAsked = false;
function requestPersistence(): void {
  if (persistenceAsked) return;
  persistenceAsked = true;
  try { void navigator.storage?.persist?.().catch(() => undefined); } catch { /* not offered */ }
}

// Persist the campaign when the tab is hidden or closed, so a refresh never loses progress.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (useGame.getState().world && !useGame.getState().busy) useGame.getState().autosave();
    void flushCloud();
  });
}

// In the claude.ai viewer, connect the player's private cloud saves and back up any local saves it lacks.
if (typeof window !== 'undefined') {
  void initCloud({
    status: (cloud) => useGame.setState({ cloud }),
    list: (cloudSaves) => useGame.setState({ cloudSaves }),
    error: (text) => useGame.getState().toast(text, 'warning'),
  }).then(() => {
    recoverOrphans(storage);
    useGame.setState({ saves: listSaves(storage) });
    void syncLocalToCloud();
  });
}

export function hasSaves(): boolean {
  return allSaves(useGame.getState()).length > 0;
}
