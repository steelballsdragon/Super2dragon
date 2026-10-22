import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../src/game/constants';
import { MemoryStorage, deleteSave, deserialize, exportJson, listSaves, loadGame, migrate, saveGame, serialize, validateWorld } from '../src/game/save';
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
});
