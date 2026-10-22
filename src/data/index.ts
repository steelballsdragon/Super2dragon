import type { PolityDef, ProvinceSeed } from '../game/types';
import * as europe from './regions/europe';
import * as eurasia from './regions/eurasia';
import * as southAsia from './regions/southAsia';
import * as eastAsia from './regions/eastAsia';
import * as africa from './regions/africa';
import * as americas from './regions/americas';
import * as oceania from './regions/oceania';
import { OUTPOSTS, SEA_ZONES, TRADE_NODES } from './world';

const REGIONS = [europe, eurasia, southAsia, eastAsia, africa, americas, oceania];

export const POLITY_LIST: PolityDef[] = REGIONS.flatMap((r) => r.POLITIES);
export const PROVINCE_SEEDS: ProvinceSeed[] = REGIONS.flatMap((r) => r.PROVINCES);

export const POLITIES: Record<string, PolityDef> = Object.fromEntries(POLITY_LIST.map((p) => [p.id, p]));

/** Returns a list of data-integrity problems (empty when the database is consistent). */
export function validateData(): string[] {
  const errors: string[] = [];
  const polityIds = new Set<string>();
  for (const p of POLITY_LIST) {
    if (polityIds.has(p.id)) errors.push(`Duplicate polity id ${p.id}`);
    polityIds.add(p.id);
  }
  const provinceIds = new Set<string>();
  const ownedBy = new Map<string, number>();
  for (const s of PROVINCE_SEEDS) {
    const [id, , lon, lat, owner] = s;
    if (provinceIds.has(id)) errors.push(`Duplicate province id ${id}`);
    provinceIds.add(id);
    if (owner && !polityIds.has(owner)) errors.push(`Province ${id} has unknown owner ${owner}`);
    if (owner) ownedBy.set(owner, (ownedBy.get(owner) ?? 0) + 1);
    if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) errors.push(`Province ${id} has invalid coordinates`);
  }
  for (const p of POLITY_LIST) {
    if (!provinceIds.has(p.capital)) errors.push(`Polity ${p.id} capital ${p.capital} is not a province`);
    if (p.overlord && !polityIds.has(p.overlord)) errors.push(`Polity ${p.id} has unknown overlord ${p.overlord}`);
    if (!p.dormant && !ownedBy.get(p.id)) errors.push(`Polity ${p.id} owns no provinces`);
    for (const r of [...p.rivals, ...p.allies]) if (!polityIds.has(r)) errors.push(`Polity ${p.id} references unknown polity ${r}`);
  }
  for (const o of OUTPOSTS) {
    if (!polityIds.has(o.owner)) errors.push(`Outpost ${o.id} unknown owner ${o.owner}`);
    if (o.controller && !polityIds.has(o.controller)) errors.push(`Outpost ${o.id} unknown controller`);
  }
  const seaIds = new Set(SEA_ZONES.map((s) => s.id));
  if (seaIds.size !== SEA_ZONES.length) errors.push('Duplicate sea zone id');
  const nodeIds = new Set(TRADE_NODES.map((n) => n.id));
  for (const n of TRADE_NODES) for (const d of n.downstream) if (!nodeIds.has(d)) errors.push(`Trade node ${n.id} -> unknown ${d}`);
  return errors;
}
