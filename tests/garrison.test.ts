import { describe, expect, it } from 'vitest';
import { applyAction, previewAction } from '../src/game/actions';
import { interpretCommand } from '../src/game/advisor';
import { garrisonConquests, garrisonOf, onFrontier, tendGarrisons } from '../src/game/garrison';
import { processRecruitment } from '../src/game/military';
import { armiesOf, armyRegiments, provincesOf, warBetween } from '../src/game/state';
import { isCoastal, neighbors } from '../src/game/static';
import { casusBelli, declareWar, emptyTerms, makePeace } from '../src/game/war';
import type { WorldState } from '../src/game/types';
import { makePeaceful, placeArmy, world } from './helpers';

const ME = 'sikh_misls';
const FOE = 'durrani';

function rich(): WorldState {
  const w = makePeaceful(world(ME));
  w.countries[ME].treasury = 20000;
  w.countries[ME].manpower = 200;
  return w;
}

/** Durrani provinces on our border. */
function borderLand(w: WorldState): string[] {
  return provincesOf(w, FOE).filter((p) => neighbors(p).some((n) => w.provinces[n]?.owner === ME));
}

function winWar(w: WorldState, provinces: string[]): void {
  declareWar(w, ME, FOE, casusBelli(w, ME, FOE)[0]);
  makePeace(w, warBetween(w, ME, FOE)!, 'attackers', { ...emptyTerms(), provinces });
}

function muster(w: WorldState): void {
  for (let i = 0; i < 8; i++) processRecruitment(w);
}

describe('border garrisons', () => {
  it('builds barracks and raises a garrison in land won at the peace', () => {
    const w = rich();
    const won = borderLand(w).slice(0, 2);
    expect(won.length).toBe(2);
    const before = w.countries[ME].treasury;
    winWar(w, won);
    for (const pid of won) {
      expect(w.provinces[pid].owner).toBe(ME);
      expect(onFrontier(w, ME, pid)).toBe(true);
      expect(w.recruitment.some((r) => r.province === pid && r.garrison)).toBe(true);
      expect((w.provinces[pid].buildings.barracks ?? 0) > 0 || w.construction.some((k) => k.province === pid && k.building === 'barracks')).toBe(true);
    }
    expect(w.countries[ME].treasury).toBeLessThan(before);
    expect(w.notifications.some((n) => n.text.includes('new border is secured'))).toBe(true);
    muster(w);
    for (const pid of won) {
      const g = garrisonOf(w, ME, pid)!;
      expect(g).toBeDefined();
      expect(g.location).toBe(pid);
      expect(g.name).toMatch(/Garrison/);
      expect(armyRegiments(g)).toBe(6);
    }
  });

  it('leaves land safely inside our borders alone, and can be switched off', () => {
    const w = rich();
    const inner = provincesOf(w, FOE).find((p) => !isCoastal(p))!;
    for (const n of neighbors(inner)) { w.provinces[n].owner = ME; w.provinces[n].controller = ME; }
    w.provinces[inner].owner = ME;
    w.provinces[inner].controller = ME;
    garrisonConquests(w, ME, [inner]);
    expect(w.recruitment.some((r) => r.garrison)).toBe(false);

    const w2 = rich();
    w2.settings.autoGarrison = false;
    winWar(w2, borderLand(w2).slice(0, 1));
    expect(w2.recruitment.some((r) => r.garrison)).toBe(false);
  });

  it('warns when the treasury cannot pay', () => {
    const w = makePeaceful(world(ME));
    w.countries[ME].treasury = 1;
    winWar(w, borderLand(w).slice(0, 1));
    expect(w.recruitment.some((r) => r.garrison)).toBe(false);
    expect(w.notifications.some((n) => n.text.startsWith('No garrison for'))).toBe(true);
  });

  it('stays at its post when the armies gather, returns after being driven off, and is released by a move order', () => {
    const w = rich();
    const [pid] = borderLand(w);
    winWar(w, [pid]);
    muster(w);
    const g = garrisonOf(w, ME, pid)!;
    const meet = provincesOf(w, ME).find((p) => p !== pid && p !== w.countries[ME].capital && !neighbors(pid).includes(p))!;
    const pv = previewAction(w, ME, { type: 'gatherArmies', target: meet });
    expect(pv.errors).toEqual([]);
    expect(pv.consequences.join(' ')).toMatch(/border garrison stays at its post/);
    applyAction(w, ME, { type: 'gatherArmies', target: meet });
    expect(w.armies[g.id].path).toHaveLength(0);
    expect(w.armies[g.id].location).toBe(pid);

    // Pushed out after a battle: it marches back.
    const home = neighbors(pid).find((n) => w.provinces[n].owner === ME)!;
    g.location = home;
    g.status = 'idle';
    tendGarrisons(w);
    expect(g.path.at(-1)).toBe(pid);

    // Ordered elsewhere by hand: it becomes a field army.
    g.location = pid; g.path = []; g.status = 'idle';
    const r = applyAction(w, ME, { type: 'moveArmy', army: g.id, target: home });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/leaves its post/);
    expect(g.garrison).toBeUndefined();
  });

  it('gives up a post that is lost', () => {
    const w = rich();
    const [pid] = borderLand(w);
    winWar(w, [pid]);
    muster(w);
    const g = garrisonOf(w, ME, pid)!;
    w.provinces[pid].owner = FOE;
    tendGarrisons(w);
    expect(g.garrison).toBeUndefined();
  });

  it('moves a garrison left behind the new border up to it', () => {
    // Find one of our provinces whose only foreign neighbour is a Durrani province we are about to win.
    const w = rich();
    let pair: [string, string] | null = null;
    for (const ours of provincesOf(w, ME).filter((p) => !isCoastal(p))) {
      const foreign = neighbors(ours).filter((n) => w.provinces[n]?.owner && w.provinces[n].owner !== ME);
      const target = foreign.find((n) => w.provinces[n].owner === FOE && neighbors(n).some((m) => w.provinces[m]?.owner === FOE));
      if (!target) continue;
      for (const n of foreign) if (n !== target) { w.provinces[n].owner = ME; w.provinces[n].controller = ME; }
      pair = [ours, target];
      break;
    }
    expect(pair).not.toBeNull();
    const [post, won] = pair!;
    const old = placeArmy(w, ME, post, 5, { garrison: post, name: 'Old Garrison' });
    winWar(w, [won]);
    expect(onFrontier(w, ME, post)).toBe(false);
    expect(old.garrison).toBe(won);
    expect(old.path.at(-1)).toBe(won);
    expect(w.recruitment.some((r) => r.province === won && r.garrison)).toBe(false);
  });

  it('garrisons every land border on request', () => {
    const w = rich();
    const pv = previewAction(w, ME, { type: 'garrison' });
    expect(pv.valid).toBe(true);
    expect(pv.cost.treasury).toBeGreaterThan(0);
    const r = applyAction(w, ME, { type: 'garrison' });
    expect(r.ok).toBe(true);
    muster(w);
    const posted = armiesOf(w, ME).filter((a) => a.garrison);
    expect(posted.length).toBeGreaterThan(0);
    for (const a of posted) expect(a.location).toBe(a.garrison);
    const again = previewAction(w, ME, { type: 'garrison', province: posted[0].garrison });
    expect(again.valid).toBe(false);
    expect(again.errors[0]).toMatch(/already has a garrison/);
  });

  it('understands orders to garrison the borders', () => {
    const w = rich();
    for (const text of ['Garrison our borders', 'Protect the frontier with troops', 'Set up barracks and a garrison on my borders']) {
      const r = interpretCommand(w, ME, text);
      expect(r.intent).toBe('garrison');
      expect(r.steps.some((s) => s.action.type === 'garrison' && s.preview.valid)).toBe(true);
    }
    const lahore = provincesOf(w, ME).find((p) => p.includes('lahore')) ?? w.countries[ME].capital;
    const one = interpretCommand(w, ME, `Garrison ${w.provinces[lahore] ? lahore.replace(/_/g, ' ') : ''}`);
    expect(one.steps.some((s) => s.action.type === 'garrison')).toBe(true);
  });
});
