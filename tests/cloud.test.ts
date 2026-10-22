import { afterEach, describe, expect, it } from 'vitest';
import { CHUNK, cloudDelete, cloudFetch, cloudSave, flushCloud, initCloud, resetCloud, type CloudMeta, type CloudStatus } from '../src/store/cloud';
import { allSaves } from '../src/store/game';
import type { SaveMeta } from '../src/game/save';

/** An in-memory stand-in for the artifact database, enforcing its document size limit. */
function fakeClaude(store = new Map<string, Record<string, unknown>>(), uid: string | null = 'u_test') {
  const doc = (path: string) => ({
    async get() { const d = store.get(path); return { exists: !!d, data: () => d }; },
    async set(data: Record<string, unknown>) {
      if (new TextEncoder().encode(JSON.stringify(data)).length > 256 * 1024) throw { code: 'invalid_argument', message: 'document over 256 KiB' };
      store.set(path, structuredClone(data));
    },
    async delete() { store.delete(path); },
  });
  const db = { collection: (path: string) => ({ doc: (id: string) => doc(`${path}/${id}`) }) };
  return { store, claude: { use: async (name: string) => (name === 'db' ? db : name === 'user' ? { id: async () => uid } : null) } };
}

function meta(id: string, savedAt: number, extra: Partial<SaveMeta> = {}): SaveMeta {
  return { id, name: id, countryId: 'sikh_misls', countryName: 'Sikh Misls', date: 'January 1800', turn: 0, savedAt, schemaVersion: 3, autosave: false, size: 0, ...extra };
}

/** Worst case for size: every character takes three bytes in UTF-8. */
const packedOf = (n: number, seed = 0) => Array.from({ length: n }, (_, i) => String.fromCharCode(0x800 + ((i * 7 + seed) % 30000))).join('');

async function connect(c: ReturnType<typeof fakeClaude>) {
  let status: CloudStatus = 'off';
  let list: CloudMeta[] = [];
  const errors: string[] = [];
  await initCloud({ status: (s) => { status = s; }, list: (l) => { list = l; }, error: (e) => errors.push(e) }, c.claude);
  return { status: () => status, list: () => list, errors };
}

afterEach(() => resetCloud());

describe('cloud saves', () => {
  it('stays off outside the viewer or without an identity', async () => {
    expect((await connect({ store: new Map(), claude: undefined as never })).status()).toBe('off');
    expect((await connect(fakeClaude(new Map(), null))).status()).toBe('off');
  });

  it('splits a large save into chunks under the document limit and reads it back intact', async () => {
    const c = fakeClaude();
    const s = await connect(c);
    expect(s.status()).toBe('on');
    const packed = packedOf(CHUNK * 2 + 123);
    await cloudSave(meta('s1', 1000), packed, { now: true });
    expect(s.list().map((m) => m.id)).toEqual(['s1']);
    expect(s.list()[0].chunks).toBe(3);
    expect([...c.store.keys()].filter((k) => k.startsWith('data/users/u_test/c_s1_'))).toHaveLength(3);
    expect((await cloudFetch('s1')).packed).toBe(packed);
    expect(s.errors).toEqual([]);
  });

  it('replaces a save without ever pointing at a half-written copy, and cleans up', async () => {
    const c = fakeClaude();
    const s = await connect(c);
    await cloudSave(meta('auto', 1000), packedOf(CHUNK * 2, 1), { now: true });
    const second = packedOf(CHUNK + 5, 2);
    await cloudSave(meta('auto', 2000), second, { now: true });
    expect(s.list()[0].savedAt).toBe(2000);
    expect((await cloudFetch('auto')).packed).toBe(second);
    expect([...c.store.keys()].filter((k) => k.includes('/c_auto_'))).toHaveLength(2);
    await cloudDelete('auto');
    expect(s.list()).toEqual([]);
    expect([...c.store.keys()].filter((k) => k.includes('/c_auto_'))).toHaveLength(0);
  });

  it('coalesces frequent autosaves and sends the latest on flush', async () => {
    const c = fakeClaude();
    const s = await connect(c);
    await cloudSave(meta('a', 1), packedOf(10, 1), { now: true });
    await cloudSave(meta('a', 2), packedOf(10, 2));
    await cloudSave(meta('a', 3), packedOf(10, 3));
    expect(s.list()[0].savedAt).toBe(1);
    await flushCloud();
    expect(s.list()[0].savedAt).toBe(3);
    expect((await cloudFetch('a')).packed).toBe(packedOf(10, 3));
  });

  it('keeps saves another device listed meanwhile', async () => {
    const c = fakeClaude();
    const s = await connect(c);
    c.store.set('data/users/u_test/saves', { list: [{ ...meta('phone', 500), chunks: 0, gen: 'a', stamp: 'x' }] });
    await cloudSave(meta('desk', 900), packedOf(10), { now: true });
    expect(s.list().map((m) => m.id).sort()).toEqual(['desk', 'phone']);
  });

  it('lists a save once, from wherever it is newest', () => {
    const local = [meta('both', 100), meta('here', 50)];
    const cloud: CloudMeta[] = [{ ...meta('both', 100), chunks: 1, gen: 'a', stamp: 's' }, { ...meta('there', 200), chunks: 1, gen: 'a', stamp: 's' }];
    const listed = allSaves({ saves: local, cloudSaves: cloud });
    expect(listed.map((m) => [m.id, m.local, m.cloud])).toEqual([['there', false, true], ['both', true, true], ['here', true, false]]);
    const newer = allSaves({ saves: [meta('x', 100)], cloudSaves: [{ ...meta('x', 300), chunks: 1, gen: 'a', stamp: 's' }] });
    expect(newer).toHaveLength(1);
    expect(newer[0]).toMatchObject({ savedAt: 300, local: false, cloud: true });
  });
});
