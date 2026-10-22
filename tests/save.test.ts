import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../src/game/constants';
import { MemoryStorage, autosaveId, deleteSave, deserialize, exportCode, exportJson, recoverOrphans, storePacked, packWorld, listSaves, loadGame, migrate, saveGame, serialize, validateWorld } from '../src/game/save';
import { advanceMonths } from '../src/game/turn';
import { world } from './helpers';

describe('saving and loading', () => {
  it('round-trips a campaign through serialisation', () => {
    const w = world('ashanti', 3);
    advanceMonths(w, 3);
    const back = deserialize(serialize(w));
    expect(back.turn).toBe(w.turn);
    expect(back.playerId).toBe('ashanti');
    expect(Object.keys(back.provinces).length).toBe(Object.keys(w.provinces).length);
    expect(back.countries.ashanti.treasury).toBeCloseTo(w.countries.ashanti.treasury, 2);
    expect(back.rng).toEqual(w.rng);
  });

  it('keeps several slots, an autosave, and deletes on request', () => {
    const st = new MemoryStorage();
    const w = world('tokugawa', 5);
    saveGame(st, w, { name: 'First' });
    advanceMonths(w, 1);
    saveGame(st, w, { name: 'Second', id: 'two' });
    saveGame(st, w, { autosave: true });
    const list = listSaves(st);
    expect(list.map((m) => m.name)).toEqual(expect.arrayContaining(['First', 'Second']));
    expect(list.some((m) => m.autosave)).toBe(true);
    expect(loadGame(st, 'two').turn).toBe(1);
    deleteSave(st, 'two');
    expect(listSaves(st).some((m) => m.id === 'two')).toBe(false);
    expect(() => loadGame(st, 'two')).toThrow();
  });

  it('imports its own export format', () => {
    const w = world('usa', 11);
    const back = deserialize(exportJson(w));
    expect(back.playerId).toBe('usa');
  });

  it('round-trips a copyable save code, even with line breaks pasted in', () => {
    const w = world('sweden', 4);
    advanceMonths(w, 2);
    const code = exportCode(w);
    expect(code.startsWith('TOTW1800:')).toBe(true);
    const wrapped = code.replace(/(.{76})/g, '$1\n');
    const back = deserialize(`  ${wrapped}\n`);
    expect(back.turn).toBe(2);
    expect(back.playerId).toBe('sweden');
    expect(() => deserialize(code.slice(0, code.length / 2))).toThrow();
  });

  it('migrates older schemas', () => {
    const w = world('mysore', 1);
    const raw = JSON.parse(serialize(w)) as Record<string, unknown>;
    raw.schemaVersion = 0;
    delete raw.settings;
    delete raw.decisions;
    for (const c of Object.values(raw.countries as Record<string, Record<string, unknown>>)) delete c.revenueMod;
    const m = migrate(raw) as unknown as typeof w;
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.settings.autosaveMonths).toBeGreaterThan(0);
    expect(m.countries.mysore.revenueMod).toBe(1);
  });

  it('rejects corrupt or foreign data with a readable error', () => {
    expect(() => deserialize('not json')).toThrow(/JSON/);
    expect(() => deserialize(JSON.stringify({ hello: 'world' }))).toThrow(/Invalid save/);
    expect(validateWorld(null).length).toBeGreaterThan(0);
    const w = world();
    const raw = JSON.parse(serialize(w));
    raw.schemaVersion = SCHEMA_VERSION + 5;
    expect(() => deserialize(JSON.stringify(raw))).toThrow(/newer version/);
  });

  it('keeps a separate autosave for each campaign', () => {
    const st = new MemoryStorage();
    const a = world('sikh_misls', 1);
    const b = world('sweden', 2);
    saveGame(st, a, { autosave: true });
    saveGame(st, b, { autosave: true });
    const ids = listSaves(st).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([autosaveId(a.campaign.id), autosaveId(b.campaign.id)]));
    expect(loadGame(st, autosaveId(a.campaign.id)).playerId).toBe('sikh_misls');
  });

  it('recovers saves whose entry dropped out of the list', () => {
    const st = new MemoryStorage();
    const w = world('patiala', 3);
    storePacked(st, w, packWorld(w), { id: 'lost', name: 'Mine' });
    st.setItem('totw1800:index', '[]');
    expect(listSaves(st)).toEqual([]);
    expect(recoverOrphans(st)).toBe(1);
    expect(listSaves(st)[0]).toMatchObject({ id: 'lost', countryId: 'patiala' });
    expect(recoverOrphans(st)).toBe(0);
  });
});
