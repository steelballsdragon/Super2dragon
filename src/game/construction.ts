// Construction projects: costs, labour, progress and completion.
import { BUILDING_BY_ID } from '../data/buildings';
import { TECH_BY_ID } from '../data/technologies';
import { wageFactor } from './economy';
import { hasAccess } from './tech';
import { bonuses, chronicle, clamp, newId, notify, provinceName, provincesOf } from './state';
import { PROVINCE_DEFS, isCoastal } from './static';
import type { BuildingId, ConstructionItem, WorldState } from './types';

export function sizeFactor(popK: number): number {
  return clamp(0.6 + Math.sqrt(popK / 1000) * 0.4, 0.6, 2.4);
}

export function buildingQuote(w: WorldState, c: string, pid: string, b: BuildingId): { cost: number; months: number; labor: number } {
  const bd = BUILDING_BY_ID[b];
  const p = w.provinces[pid];
  const wf = wageFactor(w, c);
  const sf = sizeFactor(p.pop);
  const cb = bonuses(w, c).construction ?? 0;
  const cost = bd.cost * sf * (0.35 + 0.65 * wf) * (1 + w.countries[c].inflation / 100);
  const months = Math.max(2, Math.round(bd.months * (1 - clamp(cb, 0, 0.5))));
  return { cost: Math.round(cost * 10) / 10, months, labor: Math.round(bd.labor * Math.sqrt(sf) * 10) / 10 };
}

export function buildBlocker(w: WorldState, c: string, pid: string, b: BuildingId): string | null {
  const bd = BUILDING_BY_ID[b];
  const p = w.provinces[pid];
  if (!bd) return 'Unknown building.';
  if (!p) return 'Unknown province.';
  if (p.owner !== c) return 'We do not own this province.';
  if (p.controller !== c) return 'The province is occupied.';
  const level = p.buildings[b] ?? 0;
  const queued = w.construction.filter((x) => x.province === pid && x.building === b).length;
  if (level + queued >= bd.max) return `Already at the maximum level (${bd.max}).`;
  if (bd.requiresTech && !w.countries[c].techs.includes(bd.requiresTech)) return `Requires ${TECH_BY_ID[bd.requiresTech]?.name ?? bd.requiresTech}.`;
  if (bd.coastal && !isCoastal(pid)) return 'Requires a coastline.';
  if (b === 'shipyard' && !(p.buildings.port ?? 0)) return 'Requires a harbour first.';
  if (bd.needsGood && !bd.needsGood.includes(PROVINCE_DEFS[pid].good)) return `Only where ${bd.needsGood.join(', ')} is produced.`;
  if (bd.needsAccess && !bd.needsAccess.some((g) => hasAccess(w, c, g))) return `Requires access to ${bd.needsAccess.join(' or ')}.`;
  if (b === 'fortress' && p.fort >= 5) return 'Fortifications are at their maximum.';
  const q = buildingQuote(w, c, pid, b);
  if (w.countries[c].treasury < q.cost) return `Insufficient funds (need £${Math.round(q.cost)}k).`;
  return null;
}

export function laborPool(w: WorldState, c: string): number {
  let pop = 0;
  for (const id of provincesOf(w, c)) pop += w.provinces[id].pop;
  return Math.max(2, pop * 0.004 * (1 + (bonuses(w, c).construction ?? 0)));
}

export function laborInUse(w: WorldState, c: string): number {
  return w.construction.filter((x) => x.country === c).reduce((s, x) => s + x.labor, 0);
}

export function startConstruction(w: WorldState, c: string, pid: string, b: BuildingId): ConstructionItem | string {
  const err = buildBlocker(w, c, pid, b);
  if (err) return err;
  const q = buildingQuote(w, c, pid, b);
  w.countries[c].treasury -= q.cost;
  const item: ConstructionItem = { id: newId(w, 'k'), country: c, province: pid, building: b, progress: 0, total: q.months, labor: q.labor };
  w.construction.push(item);
  return item;
}

export function cancelConstruction(w: WorldState, c: string, id: string): boolean {
  const item = w.construction.find((x) => x.id === id && x.country === c);
  if (!item) return false;
  const q = buildingQuote(w, c, item.province, item.building);
  w.countries[c].treasury += q.cost * 0.5 * (1 - item.progress / item.total);
  w.construction = w.construction.filter((x) => x !== item);
  return true;
}

export function processConstruction(w: WorldState): void {
  const pools = new Map<string, number>();
  const finished: ConstructionItem[] = [];
  for (const item of w.construction) {
    const p = w.provinces[item.province];
    if (!w.countries[item.country]?.alive || p.owner !== item.country) { finished.push(item); continue; }
    if (p.controller !== item.country) continue; // halted by occupation
    if (!pools.has(item.country)) pools.set(item.country, laborPool(w, item.country));
    const avail = pools.get(item.country)!;
    const share = clamp(avail / item.labor, 0, 1);
    pools.set(item.country, Math.max(0, avail - item.labor));
    item.progress += Math.max(0.15, share);
    if (item.progress >= item.total) {
      finished.push(item);
      p.buildings[item.building] = (p.buildings[item.building] ?? 0) + 1;
      if (item.building === 'fortress') p.fort = Math.min(5, p.fort + 1);
      const bd = BUILDING_BY_ID[item.building];
      if (item.country === w.playerId) {
        notify(w, `${bd.name} completed in ${provinceName(item.province)}.`, 'success');
        chronicle(w, { text: `${bd.name} completed in ${provinceName(item.province)}.`, category: 'construction', countries: [item.country], importance: bd.category === 'industry' ? 2 : 1 });
      } else if (bd.category === 'industry' && ['textile_mill', 'ironworks', 'steam_works'].includes(item.building)) {
        chronicle(w, { text: `New ${bd.name.toLowerCase()} open in ${provinceName(item.province)}.`, category: 'construction', countries: [item.country], importance: 1 });
      }
    }
  }
  w.construction = w.construction.filter((x) => !finished.includes(x));
}
