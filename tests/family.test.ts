import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { interpretCommand } from '../src/game/advisor';
import { performDiplomacy } from '../src/game/diplomacy';
import { bearChild, consortOf, consortsOf, household, processHousehold, relationTo } from '../src/game/family';
import { deserialize, serialize } from '../src/game/save';
import { succeed } from '../src/game/society';
import { addOpinion, hasRulingHouse, hasTreaty } from '../src/game/state';
import { makePeaceful, world } from './helpers';

describe('the royal household', () => {
  it('starts with the consorts and heirs of 1800', () => {
    const w = world('sikh_misls');
    expect(consortOf(w, 'sikh_misls')?.name).toBe('Mehtab Kaur');
    expect(consortOf(w, 'great_britain')?.name).toBe('Charlotte');
    expect(consortOf(w, 'portugal')).toBeUndefined();
    const prince = w.characters[w.countries.great_britain.heirId!];
    expect(relationTo(w, 'great_britain', prince)).toBe('Son');
    const mustafa = w.characters[w.countries.ottoman.heirId!];
    expect(relationTo(w, 'ottoman', mustafa)).toBe('Kinsman');
    expect(w.countries.usa.consorts).toHaveLength(0);
  });

  it('gives an unmarried sovereign a consort from the house they marry into', () => {
    const w = makePeaceful(world('sikh_misls'));
    w.countries.sikh_misls.consorts = [];
    addOpinion(w, 'patiala', 'sikh_misls', 200);
    const r = performDiplomacy(w, 'sikh_misls', 'patiala', 'marriage');
    expect(r.ok).toBe(true);
    const consort = consortOf(w, 'sikh_misls')!;
    expect(consort.origin).toBe('patiala');
    expect(consort.female).toBe(true);
    expect(r.message).toContain(consort.name);
  });

  it('lets the sovereign marry at home when there is no foreign match', () => {
    const w = world('sikh_misls');
    w.countries.sikh_misls.consorts = [];
    const res = applyAction(w, 'sikh_misls', { type: 'court', kind: 'findConsort' });
    expect(res.ok).toBe(true);
    expect(consortOf(w, 'sikh_misls')).toBeDefined();
    // A Christian court keeps one consort at a time.
    const a = world('austria');
    expect(consortsOf(a, 'austria')).toHaveLength(1);
    expect(applyAction(a, 'austria', { type: 'court', kind: 'findConsort' }).ok).toBe(false);
  });

  it('bears children who join the line of succession, and lets the sovereign choose among them', () => {
    const w = world('sikh_misls');
    const c = w.countries.sikh_misls;
    expect(c.heirId).toBeUndefined();
    const first = bearChild(w, 'sikh_misls');
    const second = bearChild(w, 'sikh_misls');
    // A son born later takes precedence over a daughter named heir by default.
    expect(c.heirId).toBe(first.female && !second.female ? second.id : first.id);
    const passedOver = c.heirId === first.id ? second : first;
    expect(household(w, 'sikh_misls').map((ch) => ch.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(relationTo(w, 'sikh_misls', second)).toBe(second.female ? 'Daughter' : 'Son');

    const legitimacy = c.legitimacy;
    const former = w.characters[c.heirId!];
    const res = applyAction(w, 'sikh_misls', { type: 'court', kind: 'chooseHeir', character: passedOver.id });
    expect(res.ok).toBe(true);
    expect(c.heirId).toBe(passedOver.id);
    expect(former.role).toBe('family');
    expect(c.legitimacy).toBe(Math.max(0, legitimacy - 5));
    expect(applyAction(w, 'sikh_misls', { type: 'court', kind: 'chooseHeir', character: passedOver.id }).ok).toBe(false);
  });

  it('keeps a daughter the sovereign chose as heir when a son is born', () => {
    const w = world('sikh_misls');
    const c = w.countries.sikh_misls;
    const kids = [bearChild(w, 'sikh_misls')];
    while (kids.length < 20 && !kids.some((k) => k.female && k.id !== c.heirId)) kids.push(bearChild(w, 'sikh_misls'));
    const daughter = kids.find((k) => k.female && k.id !== c.heirId)!;
    expect(applyAction(w, 'sikh_misls', { type: 'court', kind: 'chooseHeir', character: daughter.id }).ok).toBe(true);
    for (let i = 0; i < 20; i++) if (!bearChild(w, 'sikh_misls').female) break;
    expect(w.countries.sikh_misls.heirId).toBe(daughter.id);
  });

  it('passes the crown to the heir, whose siblings follow in line', () => {
    const w = world('sikh_misls');
    const a = bearChild(w, 'sikh_misls');
    const b = bearChild(w, 'sikh_misls');
    const c = w.countries.sikh_misls;
    const heir = w.characters[c.heirId!];
    const sibling = heir === a ? b : a;
    succeed(w, 'sikh_misls', 'has died');
    expect(c.rulerId).toBe(heir.id);
    expect(c.consorts).toHaveLength(0);
    expect(c.heirId).toBe(sibling.id);
    expect(relationTo(w, 'sikh_misls', sibling)).toBe(sibling.female ? 'Sister' : 'Brother');
  });

  it('has children born across the world as the years pass', () => {
    const w = makePeaceful(world('sikh_misls'));
    const before = Object.values(w.countries).reduce((n, c) => n + c.family.length, 0);
    for (let m = 0; m < 36; m++) for (const c of Object.keys(w.countries)) if (w.countries[c].alive && hasRulingHouse(w, c)) processHousehold(w, c);
    const after = Object.values(w.countries).reduce((n, c) => n + c.family.length, 0);
    expect(after).toBeGreaterThan(before + 20);
  });

  it('builds households for campaigns saved before they existed', () => {
    // As in a campaign where the marriage was agreed in the very first month.
    const w = makePeaceful(world('sikh_misls'));
    w.treaties.push({ id: 't_test', type: 'marriage', a: 'sikh_misls', b: 'patiala', start: 0 });
    const raw = JSON.parse(serialize(w));
    raw.schemaVersion = 2;
    delete raw.flags.familySeeded;
    for (const c of Object.values(raw.countries) as Record<string, unknown>[]) { delete c.family; delete c.consorts; }
    const back = deserialize(JSON.stringify(raw));
    expect(back.schemaVersion).toBe(4);
    expect(consortOf(back, 'sikh_misls')?.origin).toBe('patiala');
    expect(hasTreaty(back, 'marriage', 'sikh_misls', 'patiala')).toBe(true);
    expect(Object.values(back.countries).every((c) => Array.isArray(c.family))).toBe(true);
    expect(consortOf(back, 'austria')?.name).toBe('Maria Theresa');
  });

  it('understands orders about the heir and the royal marriage', () => {
    const w = world('sikh_misls');
    const a = bearChild(w, 'sikh_misls');
    const b = bearChild(w, 'sikh_misls');
    expect(a.name).not.toBe(b.name);
    const other = w.countries.sikh_misls.heirId === a.id ? b : a;
    const plan = interpretCommand(w, 'sikh_misls', `Make ${other.name} my heir`);
    expect(plan.intent).toContain('heir');
    expect(plan.steps.some((s) => s.action.type === 'court' && s.action.kind === 'chooseHeir' && s.action.character === other.id && s.preview.valid)).toBe(true);
    w.countries.sikh_misls.consorts = [];
    const wed = interpretCommand(w, 'sikh_misls', 'Find the sovereign a wife');
    expect(wed.steps.some((s) => s.action.type === 'court' && s.action.kind === 'findConsort')).toBe(true);
  });
});
