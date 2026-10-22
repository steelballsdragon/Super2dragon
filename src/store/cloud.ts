// Cloud saves. In the claude.ai viewer each player's saves are also kept in their own private
// area of the artifact's database (data/users/<id>/, which nobody else can read), so a campaign
// survives another browser, the phone app or cleared site data. Anywhere else (local
// development, a downloaded copy) the module stays inert and saves live in browser storage only.
import type { SaveMeta } from '../game/save';

/** A save as listed in the cloud index. Chunks are written under a generation letter that
 * alternates on every upload, so the index never points at a half-written copy. */
export interface CloudMeta extends SaveMeta {
  chunks: number;
  gen: 'a' | 'b';
  stamp: string;
}

export type CloudStatus = 'connecting' | 'on' | 'off';

interface Snap { exists: boolean; data(): Record<string, unknown> | undefined }
interface DocRef { get(): Promise<Snap>; set(data: Record<string, unknown>): Promise<void>; delete(): Promise<void> }
interface Db { collection(path: string): { doc(id: string): DocRef } }
interface UserNs { id(): Promise<string | null> }
interface ClaudeGlobal { use(name: string): Promise<unknown> }

interface Hooks {
  status(s: CloudStatus): void;
  list(saves: CloudMeta[]): void;
  error(message: string): void;
}

/** Characters per chunk: a document holds at most 256 KiB, and a packed save's characters take up to three bytes each. */
export const CHUNK = 60_000;
/** Autosaves reach the cloud at most this often; named saves go at once. */
const AUTOSAVE_INTERVAL = 45_000;

let db: Db | null = null;
let uid: string | null = null;
let hooks: Hooks | null = null;
let index: CloudMeta[] = [];
let chain: Promise<unknown> = Promise.resolve();
const pending = new Map<string, { meta: SaveMeta; packed: string }>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const lastUpload = new Map<string, number>();

const chunkId = (id: string, gen: string, i: number) => `c_${id}_${gen}_${i}`;
const col = () => db!.collection(`data/users/${uid}`);
const indexDoc = () => col().doc('saves');

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

function fail(e: unknown): void {
  const code = (e as { code?: string })?.code;
  if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed' || code === 'invalid_argument') {
    db = null;
    hooks?.status('off');
    hooks?.error('Cloud saving has stopped for this visit; saves are kept in this browser only.');
  } else if (code === 'quota_exceeded') {
    hooks?.error('Your cloud save space is full. Delete old saves in Load Game.');
  } else {
    hooks?.error('A save could not reach the cloud just now; it is kept in this browser and will be sent again.');
  }
}

export function cloudReady(): boolean {
  return !!db && !!uid;
}

/** Connects when the page runs in the claude.ai viewer; resolves once the status is known. */
export async function initCloud(h: Hooks, claude: ClaudeGlobal | undefined = (globalThis as { claude?: ClaudeGlobal }).claude): Promise<void> {
  hooks = h;
  if (!claude?.use) { h.status('off'); return; }
  h.status('connecting');
  try {
    const [d, u] = await Promise.all([claude.use('db') as Promise<Db | null>, claude.use('user') as Promise<UserNs | null>]);
    const id = u ? await u.id() : null;
    if (!d || !id) { h.status('off'); return; }
    db = d;
    uid = id;
    index = await readIndex();
    h.status('on');
    h.list(index);
  } catch (e) {
    db = null;
    h.status('off');
    fail(e);
  }
}

async function readIndex(): Promise<CloudMeta[]> {
  const snap = await indexDoc().get();
  const list = snap.exists ? snap.data()?.list : undefined;
  return Array.isArray(list) ? (list as CloudMeta[]) : [];
}

/** Writes the index, merging what another tab or device may have written meanwhile. */
async function writeIndex(changed: CloudMeta | null, removed: string | null): Promise<void> {
  let remote: CloudMeta[] = [];
  try { remote = await readIndex(); } catch { remote = index; }
  const byId = new Map<string, CloudMeta>();
  for (const m of [...remote, ...index]) if (!byId.has(m.id) || byId.get(m.id)!.savedAt < m.savedAt) byId.set(m.id, m);
  if (changed) byId.set(changed.id, changed);
  if (removed) byId.delete(removed);
  index = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
  await indexDoc().set({ list: index });
  hooks?.list(index);
}

async function upload(meta: SaveMeta, packed: string): Promise<void> {
  if (!cloudReady()) return;
  const prev = index.find((m) => m.id === meta.id);
  const gen = prev?.gen === 'a' ? 'b' : 'a';
  const stamp = `${meta.savedAt}-${packed.length}`;
  const parts: string[] = [];
  for (let i = 0; i < packed.length; i += CHUNK) parts.push(packed.slice(i, i + CHUNK));
  for (let i = 0; i < parts.length; i++) await col().doc(chunkId(meta.id, gen, i)).set({ stamp, part: parts[i] });
  await writeIndex({ ...meta, chunks: parts.length, gen, stamp }, null);
  lastUpload.set(meta.id, Date.now());
  if (prev) for (let i = 0; i < prev.chunks; i++) await col().doc(chunkId(meta.id, prev.gen, i)).delete();
}

function send(id: string): Promise<void> {
  const job = pending.get(id);
  pending.delete(id);
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (!job) return Promise.resolve();
  return enqueue(() => upload(job.meta, job.packed)).catch((e) => {
    // Keep it for the next save or flush unless something newer has replaced it.
    if (!pending.has(id)) pending.set(id, job);
    fail(e);
  });
}

/** Queues a copy of a save for the cloud. Autosaves are coalesced and rate-limited. */
export function cloudSave(meta: SaveMeta, packed: string, opts: { now?: boolean } = {}): Promise<void> {
  if (!cloudReady()) return Promise.resolve();
  pending.set(meta.id, { meta, packed });
  const wait = opts.now ? 0 : Math.max(0, (lastUpload.get(meta.id) ?? 0) + AUTOSAVE_INTERVAL - Date.now());
  if (wait === 0) return send(meta.id);
  if (!timers.has(meta.id)) timers.set(meta.id, setTimeout(() => void send(meta.id), wait));
  return Promise.resolve();
}

/** Sends everything waiting (when the page is being hidden or closed). */
export function flushCloud(): Promise<void> {
  return Promise.all([...pending.keys()].map((id) => send(id))).then(() => undefined);
}

/** The packed save stored in the cloud, checked for completeness. */
export async function cloudFetch(id: string): Promise<{ meta: CloudMeta; packed: string }> {
  if (!cloudReady()) throw new Error('Cloud saves are not available here.');
  const meta = index.find((m) => m.id === id) ?? (await readIndex()).find((m) => m.id === id);
  if (!meta) throw new Error('That save is no longer in the cloud.');
  const snaps = await Promise.all(Array.from({ length: meta.chunks }, (_, i) => col().doc(chunkId(meta.id, meta.gen, i)).get()));
  if (snaps.some((s) => !s.exists || s.data()?.stamp !== meta.stamp)) throw new Error('The cloud copy of this save is incomplete. Try again in a moment.');
  return { meta, packed: snaps.map((s) => s.data()!.part as string).join('') };
}

export function cloudDelete(id: string): Promise<void> {
  if (!cloudReady()) return Promise.resolve();
  pending.delete(id);
  clearTimeout(timers.get(id));
  timers.delete(id);
  const meta = index.find((m) => m.id === id);
  return enqueue(async () => {
    await writeIndex(null, id);
    if (meta) for (let i = 0; i < meta.chunks; i++) await col().doc(chunkId(id, meta.gen, i)).delete();
  }).catch(fail);
}

/** For tests: forget the connection. */
export function resetCloud(): void {
  db = null; uid = null; hooks = null; index = [];
  chain = Promise.resolve();
  pending.clear();
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  lastUpload.clear();
}
