// Data-driven effects shared by events, the advisor and actions. Every effect can be both
// applied to the world and described to the player before it happens.
import { BUILDING_BY_ID } from '../../data/buildings';
import { LAW_CATEGORY, lawOption } from '../../data/laws';
import { TECH_BY_ID } from '../../data/technologies';
import { makeCharacter } from '../characters';
import { GOODS } from '../constants';
import { spawnRebels } from '../military';
import { generateHeir, succeed } from '../society';
import { grantTech } from '../tech';
import {
  addOpinion, armyRegiments, chronicle, clamp, countryName, hasTreaty, newId, provinceName, provincesOf, touch, year,
  forcesChanged,
} from '../state';
import type { BuildingId, FactionId, LawCategory, Modifier, RulerTuple, TradeGoodId, TreatyType, WorldState } from '../types';

export type Effect =
  | { k: 'treasury'; v: number }
  | { k: 'stability' | 'legitimacy' | 'prestige' | 'corruption' | 'warExhaustion' | 'inflation' | 'liberty' | 'manpower' | 'foodStock' | 'taxRate' | 'tariff'; v: number }
  | { k: 'faction'; f: FactionId; loyalty?: number; influence?: number }
  | { k: 'unrest'; v: number; province?: string }
  | { k: 'pop'; v: number; province?: string }
  | { k: 'devastation'; v: number; province: string }
  | { k: 'gdp'; v: number; province?: string }
  | { k: 'modifier'; mod: Modifier }
  | { k: 'relation'; target: string; v: number }
  | { k: 'research'; v: number }
  | { k: 'tech'; tech: string }
  | { k: 'rebels'; province: string; cause: string; size?: number }
  | { k: 'rulerHealth'; v: number }
  | { k: 'newRuler'; ruler: RulerTuple; cause: string }
  | { k: 'newHeir'; adult?: boolean }
  | { k: 'building'; province: string; building: BuildingId }
  | { k: 'law'; category: LawCategory; option: string }
  | { k: 'armyMorale'; v: number }
  | { k: 'claim'; province: string }
  | { k: 'treaty'; type: TreatyType; target: string; months?: number }
  | { k: 'annex'; target: string }
  | { k: 'independence' }
  | { k: 'returnControl'; provinces: string[]; to: string }
  | { k: 'price'; good: TradeGoodId; mult: number }
  | { k: 'flag'; key: string; value: number | string | boolean | null }
  | { k: 'chronicle'; text: string; importance?: 1 | 2 | 3 };

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const money = (v: number) => `${v >= 0 ? '+' : '−'}£${Math.abs(Math.round(v)).toLocaleString('en')}k`;

export function describeEffect(w: WorldState, c: string, e: Effect): string | null {
  switch (e.k) {
    case 'treasury': return `Treasury ${money(e.v)}`;
    case 'stability': return `Stability ${sign(Math.round(e.v))}`;
    case 'legitimacy': return `Legitimacy ${sign(Math.round(e.v))}`;
    case 'prestige': return `Prestige ${sign(Math.round(e.v))}`;
    case 'corruption': return `Corruption ${sign(Math.round(e.v))}`;
    case 'warExhaustion': return `War exhaustion ${sign(Math.round(e.v))}`;
    case 'inflation': return `Inflation ${sign(Math.round(e.v))}%`;
    case 'liberty': return `Autonomy desire ${sign(Math.round(e.v))}`;
    case 'manpower': return `Manpower ${sign(Math.round(e.v * 1000))} men`;
    case 'foodStock': return `Food reserves ${sign(Math.round(e.v * 10) / 10)} months`;
    case 'taxRate': return `Tax rate ${sign(Math.round(e.v * 100))}%`;
    case 'tariff': return `Tariffs ${sign(Math.round(e.v * 100))}%`;
    case 'faction': return [e.loyalty ? `${cap(e.f)} loyalty ${sign(e.loyalty)}` : '', e.influence ? `${cap(e.f)} influence ${sign(e.influence)}` : ''].filter(Boolean).join(', ');
    case 'unrest': return `Unrest ${sign(e.v)} ${e.province ? `in ${provinceName(e.province)}` : 'in all provinces'}`;
    case 'pop': return `Population ${sign(Math.round(e.v * 1000) / 10)}% ${e.province ? `in ${provinceName(e.province)}` : 'everywhere'}`;
    case 'devastation': return `Devastation ${sign(e.v)} in ${provinceName(e.province)}`;
    case 'gdp': return `Output ${sign(Math.round(e.v * 100))}% ${e.province ? `in ${provinceName(e.province)}` : 'nationally'}`;
    case 'modifier': return `${e.mod.label} for ${e.mod.monthsLeft} months${modDesc(e.mod)}`;
    case 'relation': return `Relations with ${countryName(w, e.target)} ${sign(e.v)}`;
    case 'research': return `Research progress ${sign(Math.round(e.v))}`;
    case 'tech': return `Gain ${TECH_BY_ID[e.tech]?.name ?? e.tech}`;
    case 'rebels': return `Rebels (${e.cause}) rise in ${provinceName(e.province)}`;
    case 'rulerHealth': return `Ruler's health ${sign(e.v)}`;
    case 'newRuler': return `${e.ruler[0]} becomes ruler`;
    case 'newHeir': return 'A new heir is designated';
    case 'building': return `${BUILDING_BY_ID[e.building].name} in ${provinceName(e.province)}`;
    case 'law': return `Enact ${lawOption(e.category, e.option)?.name ?? e.option} (${LAW_CATEGORY[e.category].name})`;
    case 'armyMorale': return `Army morale ${sign(Math.round(e.v * 100))}%`;
    case 'claim': return `Claim on ${provinceName(e.province)}`;
    case 'treaty': return `${cap(e.type)} with ${countryName(w, e.target)}`;
    case 'annex': return `Integrate ${countryName(w, e.target)} into our realm`;
    case 'independence': return 'Declare independence from our overlord';
    case 'returnControl': return `Hand ${e.provinces.map(provinceName).join(', ')} back to ${countryName(w, e.to)}`;
    case 'price': return `${GOODS[e.good].name} prices ×${e.mult}`;
    case 'flag': case 'chronicle': return null;
  }
  void c;
}

function modDesc(m: Modifier): string {
  const parts: string[] = [];
  if (m.trade) parts.push(`trade ${sign(Math.round(m.trade * 100))}%`);
  if (m.research) parts.push(`research ${sign(Math.round(m.research * 100))}%`);
  if (m.growth) parts.push(`growth ${sign(Math.round(m.growth * 1000) / 10)}%/yr`);
  if (m.unrest) parts.push(`unrest ${sign(m.unrest)}`);
  if (m.stability) parts.push(`stability ${sign(Math.round(m.stability * 12))}/yr`);
  if (m.food) parts.push(`food ${sign(Math.round(m.food * 100))}%`);
  if (m.morale) parts.push(`morale ${sign(Math.round(m.morale * 100))}%`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export function applyEffects(w: WorldState, c: string, effects: Effect[]): void {
  const country = w.countries[c];
  if (!country) return;
  for (const e of effects) {
    switch (e.k) {
      case 'treasury': country.treasury += e.v; break;
      case 'stability': country.stability = clamp(country.stability + e.v, 0, 100); break;
      case 'legitimacy': country.legitimacy = clamp(country.legitimacy + e.v, 0, 100); break;
      case 'prestige': country.prestige = clamp(country.prestige + e.v, 0, 100); break;
      case 'corruption': country.corruption = clamp(country.corruption + e.v, 0, 100); break;
      case 'warExhaustion': country.warExhaustion = clamp(country.warExhaustion + e.v, 0, 100); break;
      case 'inflation': country.inflation = clamp(country.inflation + e.v, 0, 80); break;
      case 'liberty': country.liberty = clamp(country.liberty + e.v, 0, 100); break;
      case 'manpower': country.manpower = Math.max(0, country.manpower + e.v); break;
      case 'foodStock': country.foodStock = clamp(country.foodStock + e.v, 0, 12); break;
      case 'taxRate': country.taxRate = clamp(country.taxRate + e.v, 0.01, 0.4); break;
      case 'tariff': country.tariff = clamp(country.tariff + e.v, 0, 0.4); break;
      case 'faction': {
        const f = country.factions[e.f];
        if (e.loyalty) f.loyalty = clamp(f.loyalty + e.loyalty, 0, 100);
        if (e.influence) f.influence = clamp(f.influence + e.influence, 1, 80);
        break;
      }
      case 'unrest':
        for (const id of e.province ? [e.province] : provincesOf(w, c)) w.provinces[id].unrest = clamp(w.provinces[id].unrest + e.v, 0, 100);
        break;
      case 'pop':
        for (const id of e.province ? [e.province] : provincesOf(w, c)) w.provinces[id].pop = Math.max(0.5, w.provinces[id].pop * (1 + e.v));
        break;
      case 'devastation': w.provinces[e.province].devastation = clamp(w.provinces[e.province].devastation + e.v, 0, 100); break;
      case 'gdp':
        for (const id of e.province ? [e.province] : provincesOf(w, c)) w.provinces[id].gdpPc *= 1 + e.v;
        break;
      case 'modifier':
        country.modifiers = country.modifiers.filter((m) => m.id !== e.mod.id);
        country.modifiers.push({ ...e.mod });
        touch(w);
        break;
      case 'relation': addOpinion(w, c, e.target, e.v); break;
      case 'research': country.research.progress = Math.max(0, country.research.progress + e.v); break;
      case 'tech': grantTech(w, c, e.tech); break;
      case 'rebels': spawnRebels(w, e.province, e.cause, e.size ?? 1); break;
      case 'rulerHealth': {
        const r = w.characters[country.rulerId];
        if (r) r.health = clamp(r.health + e.v, 1, 100);
        break;
      }
      case 'newRuler': {
        const old = w.characters[country.rulerId];
        if (old) old.alive = false;
        const [name, born, adm, dip, mil, dynasty] = e.ruler;
        const r = makeCharacter(w, { country: c, role: 'ruler', name, born, adm, dip, mil, dynasty, loyalty: 100 });
        country.rulerId = r.id;
        touch(w);
        chronicle(w, { text: `${name} ${e.cause} in ${countryName(w, c)}.`, category: 'court', countries: [c], importance: 2 });
        break;
      }
      case 'newHeir':
        if (!country.heirId || !w.characters[country.heirId]?.alive) country.heirId = generateHeir(w, c, e.adult).id;
        break;
      case 'building': {
        const p = w.provinces[e.province];
        const bd = BUILDING_BY_ID[e.building];
        if (p && (p.buildings[e.building] ?? 0) < bd.max) {
          p.buildings[e.building] = (p.buildings[e.building] ?? 0) + 1;
          if (e.building === 'fortress') p.fort = Math.min(5, p.fort + 1);
        }
        break;
      }
      case 'law': country.laws[e.category] = e.option; country.lawReform = undefined; touch(w); break;
      case 'armyMorale':
        for (const a of Object.values(w.armies)) if (a.owner === c) a.morale = clamp(a.morale + e.v, 0, 1);
        break;
      case 'claim': if (!country.claims.includes(e.province)) country.claims.push(e.province); break;
      case 'treaty':
        if (!hasTreaty(w, e.type, c, e.target) && w.countries[e.target]?.alive) {
          w.treaties.push({ id: newId(w, 't'), type: e.type, a: c, b: e.target, start: w.turn, expires: e.months ? w.turn + e.months : undefined });
          touch(w);
        }
        break;
      case 'annex': {
        const t = w.countries[e.target];
        if (!t?.alive) break;
        for (const id of provincesOf(w, e.target)) {
          const p = w.provinces[id];
          p.owner = c;
          if (p.controller === e.target) p.controller = c;
          if (!p.cores.includes(c)) p.cores.push(c);
        }
        for (const a of Object.values(w.armies)) if (a.owner === e.target) a.owner = c;
        for (const f of Object.values(w.fleets)) if (f.owner === e.target) f.owner = c;
        forcesChanged(w);
        country.treasury += Math.max(0, t.treasury);
        t.alive = false;
        w.treaties = w.treaties.filter((tr) => tr.a !== e.target && tr.b !== e.target);
        touch(w);
        chronicle(w, { text: `${countryName(w, e.target)} is united with ${countryName(w, c)}.`, category: 'court', countries: [c, e.target], importance: 3 });
        break;
      }
      case 'independence': {
        const ov = country.overlord;
        country.overlord = undefined;
        country.subjectType = undefined;
        country.liberty = 0;
        touch(w);
        if (ov) chronicle(w, { text: `${countryName(w, c)} proclaims its independence from ${countryName(w, ov)}.`, category: 'revolution', countries: [c, ov], importance: 3 });
        break;
      }
      case 'returnControl':
        for (const id of e.provinces) {
          const p = w.provinces[id];
          if (p) { p.controller = e.to; p.siege = undefined; }
        }
        for (const a of Object.values(w.armies)) {
          if (a.owner === c && e.provinces.includes(a.location)) {
            for (const u of ['infantry', 'cavalry', 'artillery', 'irregulars'] as const) a.units[u] *= 0.5;
            const home = w.countries[c].capital;
            a.location = home; a.path = []; a.status = 'idle';
            if (armyRegiments(a) < 0.2) { delete w.armies[a.id]; forcesChanged(w); }
          }
        }
        touch(w);
        break;
      case 'price': w.prices[e.good] = Math.round(w.prices[e.good] * e.mult * 100) / 100; break;
      case 'flag':
        if (e.value === null) delete w.flags[e.key]; else w.flags[e.key] = e.value;
        break;
      case 'chronicle': chronicle(w, { text: e.text, category: 'court', countries: [c], importance: e.importance ?? 2 }); break;
    }
  }
}

export function killRuler(w: WorldState, c: string, cause: string): void {
  succeed(w, c, cause);
}

export function rulerAge(w: WorldState, c: string): number {
  const r = w.characters[w.countries[c].rulerId];
  return r ? year(w) - r.born : 40;
}
