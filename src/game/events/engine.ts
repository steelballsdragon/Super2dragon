// Event engine: rolls events for every polity each month, queues the player's as cards and
// resolves AI choices immediately using each option's AI weight.
import { rand, weightedPick } from '../rng';
import { chronicle, countryName, def, newId } from '../state';
import type { EventInstance, WorldState } from '../types';
import { applyEffects, describeEffect, type Effect } from './effects';
import { EVENTS, EVENT_BY_ID, type EventDef, type EventOption } from './defs';

function eligibleOptions(w: WorldState, c: string, ev: EventDef, ctx: Record<string, string | number>): EventOption[] {
  return ev.options.filter((o) => !o.requires || o.requires(w, c, ctx));
}

export function processEvents(w: WorldState): void {
  const countries = Object.values(w.countries).filter((c) => c.alive);
  for (const country of countries) {
    const c = country.id;
    const isPlayer = c === w.playerId;
    let fired = 0;
    const max = isPlayer ? 2 : 1;
    if (isPlayer && w.pendingEvents.length >= 3) continue;
    const start = Math.floor(rand(w) * EVENTS.length);
    for (let i = 0; i < EVENTS.length && fired < max; i++) {
      const ev = EVENTS[(start + i) % EVENTS.length];
      const memKey = `${c}:${ev.id}`;
      const last = w.eventMemory[memKey];
      if (last !== undefined && (ev.once || w.turn - last < (ev.cooldown ?? 120))) continue;
      if (isPlayer && w.pendingEvents.some((p) => p.defId === ev.id)) continue;
      let p = 0;
      try { p = ev.chance(w, c); } catch { p = 0; }
      if (p <= 0 || rand(w) >= p) continue;
      const ctx = ev.setup ? ev.setup(w, c) : {};
      if (!ctx) continue;
      w.eventMemory[memKey] = w.turn;
      fired++;
      if (isPlayer) {
        w.pendingEvents.push({ id: newId(w, 'e'), defId: ev.id, country: c, turn: w.turn, ctx });
      } else {
        const opts = eligibleOptions(w, c, ev, ctx);
        const choice = weightedPick(w, opts, (o) => o.ai(w, c, ctx)) ?? opts[0];
        if (!choice) continue;
        applyEffects(w, c, choice.effects(w, c, ctx));
        if (ev.major && def(c).population > 4_000_000) {
          chronicle(w, { text: `${countryName(w, c)}: ${ev.title} — ${choice.label.toLowerCase()}.`, category: categoryFor(ev), countries: [c], importance: 1 });
        }
      }
    }
  }
}

function categoryFor(ev: EventDef): 'court' | 'disaster' | 'economy' | 'diplomacy' | 'war' | 'discovery' | 'revolution' | 'peace' {
  switch (ev.art) {
    case 'famine': case 'epidemic': case 'disaster': return 'disaster';
    case 'trade': case 'industry': return 'economy';
    case 'summit': return 'diplomacy';
    case 'battle': case 'fleet': return 'war';
    case 'discovery': return 'discovery';
    case 'revolution': return 'revolution';
    case 'treaty': return 'peace';
    default: return 'court';
  }
}

export interface ResolvedOption { id: string; label: string; lines: string[]; hint?: string; available: boolean }

export function eventView(w: WorldState, inst: EventInstance): { def: EventDef; text: string; options: ResolvedOption[] } | null {
  const ev = EVENT_BY_ID[inst.defId];
  if (!ev) return null;
  const c = inst.country;
  return {
    def: ev,
    text: ev.text(w, c, inst.ctx),
    options: ev.options.map((o) => {
      const available = !o.requires || o.requires(w, c, inst.ctx);
      let effects: Effect[] = [];
      try { effects = o.effects(w, c, inst.ctx); } catch { effects = []; }
      return { id: o.id, label: o.label, hint: o.hint, available, lines: effects.map((e) => describeEffect(w, c, e)).filter((x): x is string => !!x) };
    }),
  };
}

export function resolveEvent(w: WorldState, instanceId: string, optionId: string): string | null {
  const inst = w.pendingEvents.find((e) => e.id === instanceId);
  if (!inst) return 'This event has already been resolved.';
  const ev = EVENT_BY_ID[inst.defId];
  const opt = ev?.options.find((o) => o.id === optionId);
  if (!ev || !opt) return 'Unknown choice.';
  if (opt.requires && !opt.requires(w, inst.country, inst.ctx)) return 'That choice is not available.';
  applyEffects(w, inst.country, opt.effects(w, inst.country, inst.ctx));
  w.pendingEvents = w.pendingEvents.filter((e) => e !== inst);
  chronicle(w, { text: `${ev.title}: we chose to ${opt.label.charAt(0).toLowerCase()}${opt.label.slice(1)}.`, category: 'player', countries: [inst.country], importance: ev.major ? 2 : 1 });
  w.decisions.push({ turn: w.turn, summary: `${ev.title} → ${opt.label}` });
  return null;
}
