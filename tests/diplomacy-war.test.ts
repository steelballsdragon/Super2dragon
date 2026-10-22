import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { diploBlocker, evaluateProposal, performDiplomacy, processDiplomacy } from '../src/game/diplomacy';
import { resolveBattles, resolveSieges } from '../src/game/military';
import { addOpinion, alliesOf, armiesOf, atWar, hasTreaty, neighbourCountries, opinion, provincesOf, warBetween } from '../src/game/state';
import { casusBelli, declareWar, emptyTerms, makePeace, peaceAcceptance, peaceCost, updateWarScores } from '../src/game/war';
import type { WorldState } from '../src/game/types';
import { makePeaceful, placeArmy, world } from './helpers';

/** Two bordering, independent polities with no alliances or truces: a clean test bench. */
function pair(w: WorldState): [string, string] {
  const free = (c: string) => w.countries[c]?.alive && !w.countries[c].overlord && alliesOf(w, c).length === 0 && !Object.values(w.countries).some((x) => x.overlord === c);
  for (const a of Object.keys(w.countries).sort()) {
    if (!free(a) || provincesOf(w, a).length < 2) continue;
    const b = neighbourCountries(w, a).find((x) => free(x) && provincesOf(w, x).length >= 2 && !w.treaties.some((t) => (t.a === a && t.b === x) || (t.a === x && t.b === a)));
    if (b) return [a, b];
  }
  throw new Error('no test pair');
}

describe('diplomacy', () => {
  it('weighs opinion when judging proposals', () => {
    const w = makePeaceful(world());
    const [a, b] = pair(w);
    addOpinion(w, a, b, -150);
    const hostile = evaluateProposal(w, a, b, 'alliance').score;
    addOpinion(w, a, b, 300);
    const friendly = evaluateProposal(w, a, b, 'alliance').score;
    expect(friendly).toBeGreaterThan(hostile);
  });

  it('forms a trade agreement when the other side accepts', () => {
    const w = makePeaceful(world());
    const [a, b] = pair(w);
    addOpinion(w, a, b, 200);
    const r = performDiplomacy(w, a, b, 'trade');
    expect(r.ok).toBe(true);
    expect(hasTreaty(w, 'trade', a, b)).toBe(true);
    expect(diploBlocker(w, a, b, 'trade')).toMatch(/already/);
  });

  it('improves relations month by month through a resident envoy', () => {
    const w = makePeaceful(world());
    const [a, b] = pair(w);
    const before = opinion(w, a, b);
    expect(performDiplomacy(w, a, b, 'envoy').ok).toBe(true);
    for (let i = 0; i < 6; i++) processDiplomacy(w);
    expect(opinion(w, a, b)).toBeGreaterThan(before);
  });

  it('blocks treaties with enemies at war', () => {
    const w = makePeaceful(world());
    const [a, b] = pair(w);
    declareWar(w, a, b, casusBelli(w, a, b)[0]);
    expect(diploBlocker(w, a, b, 'alliance')).toMatch(/at war/);
  });
});

describe('war and peace', () => {
  it('declares war, after which both sides are enemies', () => {
    const w = makePeaceful(world());
    const [a, b] = pair(w);
    const cb = casusBelli(w, a, b)[0];
    const stab = w.countries[a].stability;
    declareWar(w, a, b, cb);
    expect(atWar(w, a, b)).toBe(true);
    expect(w.countries[a].stability).toBeLessThanOrEqual(stab);
  });

  it('lets the stronger army win a battle', () => {
    const w = makePeaceful(world());
    const [a, b] = pair(w);
    declareWar(w, a, b, casusBelli(w, a, b)[0]);
    const site = provincesOf(w, b)[0];
    for (const x of [...armiesOf(w, a), ...armiesOf(w, b)]) delete w.armies[x.id];
    const big = placeArmy(w, a, site, 30);
    const small = placeArmy(w, b, site, 3);
    resolveBattles(w);
    const smallLeft = w.armies[small.id];
    expect(!smallLeft || smallLeft.location !== site || smallLeft.morale < 0.6).toBe(true);
    expect(w.armies[big.id]).toBeDefined();
    expect(w.battles.length).toBeGreaterThan(0);
  });

  it('captures a province by siege and moves the war score', () => {
    const w = makePeaceful(world());
    const [a, b] = pair(w);
    declareWar(w, a, b, casusBelli(w, a, b)[0]);
    const war = warBetween(w, a, b)!;
    for (const x of armiesOf(w, b)) delete w.armies[x.id];
    const target = provincesOf(w, b)[0];
    w.provinces[target].fort = 0;
    placeArmy(w, a, target, 20, { units: { infantry: 15, cavalry: 0, artillery: 5, irregulars: 0 } });
    for (let i = 0; i < 12 && w.provinces[target].controller !== a; i++) resolveSieges(w, new Set());
    expect(w.provinces[target].controller).toBe(a);
    updateWarScores(w);
    expect(war.score).toBeGreaterThan(0);
  });

  it('prices peace terms and transfers ceded provinces', () => {
    const w = makePeaceful(world());
    const [a, b] = pair(w);
    declareWar(w, a, b, casusBelli(w, a, b)[0]);
    const war = warBetween(w, a, b)!;
    const prov = provincesOf(w, b).find((p) => provincesOf(w, a).length && w.countries[b].capital !== p) ?? provincesOf(w, b)[0];
    const terms = { ...emptyTerms(), provinces: [prov] };
    expect(peaceCost(w, war, 'attackers', terms)).toBeGreaterThan(0);
    // With no war score the enemy refuses to cede land.
    expect(peaceAcceptance(w, war, a, terms, true).accept).toBe(false);
    makePeace(w, war, 'attackers', terms);
    expect(w.provinces[prov].owner).toBe(a);
    expect(w.wars[war.id]).toBeUndefined();
    expect(hasTreaty(w, 'truce', a, b)).toBe(true);
  });

  it('refuses to let the player declare war on an ally', () => {
    const w = makePeaceful(world('great_britain'));
    const ally = alliesOf(w, 'great_britain')[0];
    if (!ally) return;
    const r = applyAction(w, 'great_britain', { type: 'declareWar', target: ally, cb: 'none' });
    expect(r.ok).toBe(false);
  });
});
