// Espionage: spy networks, counter-intelligence and covert operations.
import { TECH_BY_ID } from '../data/technologies';
import { chance, pick } from './rng';
import { addOpinion, chronicle, clamp, countryName, notify, provinceName, provincesOf } from './state';
import type { WorldState } from './types';

export type SpyOp = 'intel' | 'sabotage' | 'incite' | 'steal_tech' | 'fabricate_claim' | 'bribe';

export const SPY_OPS: Record<SpyOp, { name: string; network: number; cost: number; base: number; description: string }> = {
  intel: { name: 'Gather intelligence', network: 10, cost: 5, base: 0.85, description: 'Learn the true size of their armies, treasury and plans.' },
  sabotage: { name: 'Sabotage works', network: 30, cost: 25, base: 0.55, description: 'Set back a construction project or damage a building.' },
  incite: { name: 'Incite unrest', network: 25, cost: 20, base: 0.6, description: 'Fund agitators in their provinces.' },
  steal_tech: { name: 'Steal technology', network: 40, cost: 30, base: 0.45, description: 'Acquire plans, machines or skilled artisans.' },
  fabricate_claim: { name: 'Fabricate a claim', network: 35, cost: 20, base: 0.5, description: 'Forge documents giving us a claim on one of their provinces.' },
  bribe: { name: 'Bribe officials', network: 20, cost: 30, base: 0.6, description: 'Corrupt their administration.' },
};

export function counterIntel(w: WorldState, c: string): number {
  const country = w.countries[c];
  const im = country.ministers.intelligence ? w.characters[country.ministers.intelligence] : undefined;
  return clamp(10 + country.budget.espionage * 20 + (im?.dip ?? 0) * 2, 0, 95);
}

export function processEspionage(w: WorldState): void {
  for (const c of Object.values(w.countries)) {
    if (!c.alive) continue;
    c.counterIntel = counterIntel(w, c.id);
    // AI countries watch their rivals; the player chooses targets explicitly.
    if (c.id !== w.playerId) for (const r of c.rivals.slice(0, 2)) c.spy[r] ??= 0;
    const im = c.ministers.intelligence ? w.characters[c.ministers.intelligence] : undefined;
    for (const target of Object.keys(c.spy)) {
      const t = w.countries[target];
      if (!t?.alive) { delete c.spy[target]; continue; }
      const grow = (c.budget.espionage * 3 + (im?.dip ?? 2) * 0.3) * (1 - t.counterIntel / 150);
      c.spy[target] = clamp(c.spy[target] + grow - 0.3, 0, 100);
    }
  }
}

export function spyOpChance(w: WorldState, c: string, target: string, op: SpyOp): number {
  const net = w.countries[c].spy[target] ?? 0;
  const def = w.countries[target].counterIntel;
  return clamp(SPY_OPS[op].base + (net - SPY_OPS[op].network) / 200 - def / 250, 0.05, 0.95);
}

export function spyOpBlocker(w: WorldState, c: string, target: string, op: SpyOp): string | null {
  const net = w.countries[c].spy[target] ?? 0;
  if (c === target) return 'We do not spy on ourselves.';
  if (net < SPY_OPS[op].network) return `Requires a spy network of ${SPY_OPS[op].network} (current ${Math.round(net)}).`;
  if (w.countries[c].treasury < SPY_OPS[op].cost) return 'Insufficient funds.';
  if (op === 'steal_tech' && !w.countries[target].techs.some((t) => !w.countries[c].techs.includes(t))) return 'They know nothing we do not.';
  return null;
}

export function runSpyOp(w: WorldState, c: string, target: string, op: SpyOp): { ok: boolean; message: string } {
  const err = spyOpBlocker(w, c, target, op);
  if (err) return { ok: false, message: err };
  const country = w.countries[c];
  const t = w.countries[target];
  country.treasury -= SPY_OPS[op].cost;
  country.spy[target] -= SPY_OPS[op].network;
  if (!chance(w, spyOpChance(w, c, target, op))) {
    addOpinion(w, c, target, -30);
    country.prestige = clamp(country.prestige - 4, 0, 100);
    country.spy[target] = Math.max(0, country.spy[target] - 20);
    chronicle(w, { text: `Agents of ${countryName(w, c)} are caught in ${countryName(w, target)}: a diplomatic scandal.`, category: 'diplomacy', countries: [c, target], importance: 1 });
    if (target === w.playerId) notify(w, `Our counter-intelligence has unmasked agents of ${countryName(w, c)}.`, 'warning');
    return { ok: false, message: 'Our agents were caught. The scandal has damaged relations.' };
  }
  const provs = provincesOf(w, target);
  switch (op) {
    case 'intel':
      w.flags[`intel_${c}_${target}`] = w.turn + 12;
      return { ok: true, message: `Detailed reports on ${countryName(w, target)} arrive. Their forces are revealed for a year.` };
    case 'sabotage': {
      const proj = w.construction.find((k) => k.country === target);
      if (proj) { proj.progress = Math.max(0, proj.progress - proj.total * 0.4); return { ok: true, message: `Their works at ${provinceName(proj.province)} are set back by months.` }; }
      const p = w.provinces[pick(w, provs)];
      p.devastation = clamp(p.devastation + 10, 0, 100);
      return { ok: true, message: `Fires and accidents disrupt ${provinceName(p.id)}.` };
    }
    case 'incite': {
      const chosen = provs.slice().sort(() => 0).slice(0, 3);
      for (const id of chosen) w.provinces[id].unrest = clamp(w.provinces[id].unrest + 18, 0, 100);
      return { ok: true, message: `Pamphlets and paid agitators stir unrest in ${chosen.map(provinceName).join(', ')}.` };
    }
    case 'steal_tech': {
      const candidates = t.techs.filter((x) => !country.techs.includes(x) && TECH_BY_ID[x]);
      const tech = pick(w, candidates);
      if (country.research.tech === tech) country.research.progress += TECH_BY_ID[tech].cost * 0.5;
      else country.research.progress += TECH_BY_ID[tech].cost * 0.3;
      w.flags[`stolen_${c}`] = tech;
      return { ok: true, message: `Our agents return with secrets of ${TECH_BY_ID[tech].name}. Research progress gained.` };
    }
    case 'fabricate_claim': {
      const own = new Set(provincesOf(w, c));
      const near = provs.filter((id) => !country.claims.includes(id));
      const pid = near.find((id) => [...own].some(() => true)) ?? near[0];
      if (!pid) return { ok: false, message: 'No province to claim.' };
      country.claims.push(pid);
      return { ok: true, message: `Ancient charters "discovered" in the archives give us a claim on ${provinceName(pid)}.` };
    }
    case 'bribe':
      t.corruption = clamp(t.corruption + 8, 0, 100);
      return { ok: true, message: `Officials of ${countryName(w, target)} are on our payroll.` };
  }
}

export function hasIntel(w: WorldState, c: string, target: string): boolean {
  return ((w.flags[`intel_${c}_${target}`] as number) ?? -1) >= w.turn;
}
