// Save and load: versioned schema, migrations, validation, compression, multiple slots,
// autosave and JSON export/import.
import { compressToBase64, compressToUTF16, decompressFromBase64, decompressFromUTF16 } from 'lz-string';
import { SCHEMA_VERSION } from './constants';
import { refreshLedgers } from './economy';
import { seedFamilies } from './family';
import { POLITIES } from './static';
import { formatDate } from './state';
import type { WorldState } from './types';

export interface SaveMeta {
  id: string;
  name: string;
  countryId: string;
  countryName: string;
  date: string;
  turn: number;
  savedAt: number;
  schemaVersion: number;
  autosave: boolean;
  size: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Key enumeration, where the storage offers it (used to recover saves missing from the index). */
  readonly length?: number;
  key?(index: number): string | null;
}

const INDEX_KEY = 'totw1800:index';
const SAVE_KEY = (id: string) => `totw1800:save:${id}`;
/** Each campaign keeps its own autosave, so starting another never overwrites it. */
export const autosaveId = (campaignId: string) => `autosave-${campaignId}`;

export class MemoryStorage implements KeyValueStorage {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
}

export function defaultStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__totw_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    // fall through to memory storage
  }
  return new MemoryStorage();
}

// ---------------------------------------------------------------------------
// Schema versioning
// ---------------------------------------------------------------------------
type Migration = (s: Record<string, unknown>) => Record<string, unknown>;
/** migrations[n] upgrades a save from schema n to n + 1. */
export const MIGRATIONS: Record<number, Migration> = {
  0: (s) => ({ ...s, schemaVersion: 1, settings: (s.settings as object) ?? { pauseOnEvents: true, autosaveMonths: 3 }, decisions: s.decisions ?? [] }),
  1: (s) => {
    const countries = (s.countries ?? {}) as Record<string, Record<string, unknown>>;
    for (const c of Object.values(countries)) if (typeof c.revenueMod !== 'number') c.revenueMod = 1;
    return { ...s, schemaVersion: 2, countries };
  },
  // Royal households: filled in by seedFamilies once the save is loaded.
  2: (s) => {
    const countries = (s.countries ?? {}) as Record<string, Record<string, unknown>>;
    for (const c of Object.values(countries)) if (!Array.isArray(c.family)) c.family = [];
    return { ...s, schemaVersion: 3, countries };
  },
};

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let s = raw;
  let v = typeof s.schemaVersion === 'number' ? s.schemaVersion : 0;
  if (v > SCHEMA_VERSION) throw new Error(`This save was made by a newer version of the game (schema ${v}).`);
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from schema ${v}.`);
    s = m(s);
    v = s.schemaVersion as number;
  }
  return s;
}

export function validateWorld(s: unknown): string[] {
  const errors: string[] = [];
  if (!s || typeof s !== 'object') return ['Not a save object.'];
  const o = s as Record<string, unknown>;
  const req: [string, string][] = [
    ['turn', 'number'], ['playerId', 'string'], ['countries', 'object'], ['provinces', 'object'], ['characters', 'object'], ['armies', 'object'],
    ['fleets', 'object'], ['wars', 'object'], ['treaties', 'object'], ['relations', 'object'], ['rng', 'object'], ['campaign', 'object'], ['flags', 'object'],
  ];
  for (const [k, t] of req) if (typeof o[k] !== t) errors.push(`Missing or invalid field "${k}".`);
  if (errors.length) return errors;
  const countries = o.countries as Record<string, unknown>;
  if (!countries[o.playerId as string]) errors.push('The player\'s country is missing.');
  const provinces = o.provinces as Record<string, { owner?: unknown; pop?: unknown }>;
  let bad = 0;
  for (const p of Object.values(provinces)) if (typeof p.pop !== 'number' || !Number.isFinite(p.pop)) bad++;
  if (bad) errors.push(`${bad} provinces have invalid population data.`);
  for (const id of Object.keys(countries)) if (!POLITIES[id]) errors.push(`Unknown polity "${id}" in save.`);
  return errors.slice(0, 10);
}

/** Fractions are kept to four decimals: plenty for the simulation, and saves shrink by a third. */
function roundNumbers(_key: string, v: unknown): unknown {
  return typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v;
}

export function serialize(w: WorldState): string {
  return JSON.stringify(w, roundNumbers);
}

/** Serialises and compresses a world (safe to run inside a Web Worker). */
export function packWorld(w: WorldState): string {
  return compressToUTF16(serialize(w));
}

/** Writes an already-packed save produced by packWorld(). */
export function storePacked(storage: KeyValueStorage, w: Pick<WorldState, 'playerId' | 'turn' | 'campaign'>, packed: string, opts: { id?: string; name?: string; autosave?: boolean } = {}): SaveMeta {
  const id = opts.autosave ? autosaveId(w.campaign.id) : opts.id ?? `s${Date.now().toString(36)}`;
  return writeSlot(storage, {
    id,
    name: opts.name ?? (opts.autosave ? `Autosave — ${w.campaign.name}` : w.campaign.name),
    countryId: w.playerId,
    countryName: POLITIES[w.playerId]?.name ?? w.playerId,
    date: formatDate(w.turn),
    turn: w.turn,
    savedAt: Date.now(),
    schemaVersion: SCHEMA_VERSION,
    autosave: !!opts.autosave,
    size: packed.length * 2,
  }, packed);
}

/** Writes a packed save under a given index entry (for copies fetched from elsewhere). */
export function writeSlot(storage: KeyValueStorage, meta: SaveMeta, packed: string): SaveMeta {
  try {
    storage.setItem(SAVE_KEY(meta.id), packed);
  } catch (e) {
    throw new Error(`Could not write the save (browser storage may be full; delete old saves in Load Game): ${(e as Error).message}`);
  }
  const list = listSaves(storage).filter((m) => m.id !== meta.id);
  list.push(meta);
  writeIndex(storage, list);
  return meta;
}

export function readPacked(storage: KeyValueStorage, id: string): string | null {
  return storage.getItem(SAVE_KEY(id));
}

/** Saves whose data is still in storage but whose index entry was lost are listed again. */
export function recoverOrphans(storage: KeyValueStorage): number {
  if (typeof storage.length !== 'number' || !storage.key) return 0;
  const known = new Set(listSaves(storage).map((m) => m.id));
  const prefix = SAVE_KEY('');
  const orphans: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(prefix) && !known.has(k.slice(prefix.length))) orphans.push(k.slice(prefix.length));
  }
  let found = 0;
  for (const id of orphans) {
    try {
      const packed = storage.getItem(SAVE_KEY(id))!;
      const w = loadGame(storage, id);
      writeSlot(storage, {
        id, name: `Recovered: ${w.campaign.name}`, countryId: w.playerId, countryName: POLITIES[w.playerId]?.name ?? w.playerId,
        date: formatDate(w.turn), turn: w.turn, savedAt: Date.now(), schemaVersion: SCHEMA_VERSION, autosave: id.startsWith('autosave'), size: packed.length * 2,
      }, packed);
      found++;
    } catch {
      // Unreadable data is left alone.
    }
  }
  return found;
}

const CODE_PREFIX = 'TOTW1800:';

/** A compact, copyable text form of a campaign (compressed export envelope). */
export function exportCode(w: WorldState): string {
  return CODE_PREFIX + compressToBase64(exportJson(w));
}

export function deserialize(input: string): WorldState {
  let json = input.trim();
  if (json.startsWith(CODE_PREFIX)) {
    const unpacked = decompressFromBase64(json.slice(CODE_PREFIX.length).replace(/\s+/g, ''));
    if (!unpacked) throw new Error('The save code is incomplete or damaged.');
    json = unpacked;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  // Exports may wrap the world in an envelope.
  const env = raw as { format?: string; world?: unknown };
  const body = env && env.format === 'thrones-of-the-world-1800' ? env.world : raw;
  const migrated = migrate(body as Record<string, unknown>);
  const errors = validateWorld(migrated);
  if (errors.length) throw new Error(`Invalid save: ${errors.join(' ')}`);
  const w = migrated as unknown as WorldState;
  seedFamilies(w);
  refreshLedgers(w);
  return w;
}

export function exportJson(w: WorldState): string {
  return JSON.stringify({ format: 'thrones-of-the-world-1800', exportedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, world: w }, roundNumbers);
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------
export function listSaves(storage: KeyValueStorage): SaveMeta[] {
  try {
    const raw = storage.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as SaveMeta[]) : [];
    return list.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function writeIndex(storage: KeyValueStorage, list: SaveMeta[]): void {
  storage.setItem(INDEX_KEY, JSON.stringify(list));
}

export function saveGame(storage: KeyValueStorage, w: WorldState, opts: { id?: string; name?: string; autosave?: boolean } = {}): SaveMeta {
  return storePacked(storage, w, packWorld(w), opts);
}

export function loadGame(storage: KeyValueStorage, id: string): WorldState {
  const packed = storage.getItem(SAVE_KEY(id));
  if (!packed) throw new Error('Save not found.');
  return unpackWorld(packed);
}

export function unpackWorld(packed: string): WorldState {
  const json = decompressFromUTF16(packed);
  if (!json) throw new Error('The save data is corrupted.');
  return deserialize(json);
}

export function deleteSave(storage: KeyValueStorage, id: string): void {
  storage.removeItem(SAVE_KEY(id));
  writeIndex(storage, listSaves(storage).filter((m) => m.id !== id));
}

export function latestSave(storage: KeyValueStorage): SaveMeta | undefined {
  return listSaves(storage)[0];
}
