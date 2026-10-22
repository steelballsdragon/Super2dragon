import { describe, expect, it } from 'vitest';
import { councilAdvice, executePlan, interpretCommand, matchCountries, matchProvince } from '../src/game/advisor';
import { makePeaceful, world } from './helpers';

describe('the royal council (rule-based)', () => {
  const w = makePeaceful(world('sikh_misls', 4));

  it('recognises polities and places by name, adjective and alias', () => {
    expect(matchCountries(w, 'Improve relations with the British.')).toContain('great_britain');
    expect(matchCountries(w, 'Seek a defensive alliance with Persia')).toContain('qajar_persia');
    expect(matchCountries(w, 'war on the Afghans')).toContain('durrani');
    expect(matchProvince('Build textile factories near Lahore')).toBeTruthy();
  });

  it.each([
    ['Modernize the army.', 'modernize_army'],
    ['Build textile factories near Lahore.', 'build'],
    ['Seek a defensive alliance with Persia.', 'alliance'],
    ['Improve relations with the British.', 'relations'],
    ['Reduce corruption.', 'corruption'],
    ['Prepare a defensive campaign.', 'defence'],
    ['Reform the tax system.', 'tax_reform'],
    ['Raise 4 regiments of cavalry', 'recruit'],
    ['Borrow £200k', 'loan'],
    ['Abolish serfdom', 'enact_law'],
  ])('interprets “%s”', (text, intent) => {
    const plan = interpretCommand(w, 'sikh_misls', text);
    expect(plan.understood).toBe(true);
    expect(plan.intent.split('+')).toContain(intent);
    expect(plan.reply.length).toBeGreaterThan(10);
  });

  it('proposes valid, costed steps and never more than the treasury', () => {
    const plan = interpretCommand(w, 'sikh_misls', 'Prepare a defensive campaign.');
    const valid = plan.steps.filter((s) => s.preview.valid && !s.optional);
    expect(valid.length).toBeGreaterThan(0);
    expect(plan.totals.treasury).toBeLessThanOrEqual(w.countries.sikh_misls.treasury + 0.01);
  });

  it('explains instead of acting when an order is impossible', () => {
    const plan = interpretCommand(w, 'sikh_misls', 'Build steam engine works in the capital');
    expect(plan.steps.filter((s) => s.preview.valid).length).toBe(0);
    expect(plan.notes.join(' ')).toMatch(/Requires|No suitable site/);
  });

  it('does not understand nonsense', () => {
    const plan = interpretCommand(w, 'sikh_misls', 'Paint the moon purple');
    expect(plan.understood).toBe(false);
    expect(plan.steps).toHaveLength(0);
  });

  it('carries out approved steps through the game rules', () => {
    const w2 = makePeaceful(world('sikh_misls', 4));
    const plan = interpretCommand(w2, 'sikh_misls', 'Build roads in the capital');
    const t0 = w2.countries.sikh_misls.treasury;
    const results = executePlan(w2, 'sikh_misls', plan);
    expect(results.some((r) => r.ok)).toBe(true);
    expect(w2.countries.sikh_misls.treasury).toBeLessThan(t0);
    expect(w2.construction.some((k) => k.country === 'sikh_misls' && k.building === 'road')).toBe(true);
  });

  it('offers unprompted counsel from the ministers', () => {
    const advice = councilAdvice(w, 'sikh_misls');
    expect(advice.length).toBeGreaterThan(0);
    for (const a of advice) expect(['finance', 'foreign', 'military', 'admin', 'intelligence']).toContain(a.role);
  });
});
