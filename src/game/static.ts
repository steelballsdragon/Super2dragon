// Static (non-saved) game data: polities, provinces, geometry and graph helpers.
import geometryJson from '../data/generated/map.json';
import { POLITIES, POLITY_LIST, PROVINCE_SEEDS } from '../data/index';
import { OUTPOSTS, SEA_ZONES, TRADE_NODES } from '../data/world';
import type { MapGeometry, OutpostDef, PolityDef, ProvinceDef, SeaZoneDef, TradeNodeDef } from './types';

export const GEO = geometryJson as unknown as MapGeometry;
export { POLITIES, POLITY_LIST };

const toRad = Math.PI / 180;

function greatCircle(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const TRADE_NODE_DEFS: Record<string, TradeNodeDef> = Object.fromEntries(TRADE_NODES.map((n) => [n.id, n]));

function nearestNode(lon: number, lat: number): string {
  let best = TRADE_NODES[0].id;
  let bestD = Infinity;
  for (const n of TRADE_NODES) {
    const d = greatCircle(lon, lat, n.lon, n.lat);
    if (d < bestD) { bestD = d; best = n.id; }
  }
  return best;
}

export const PROVINCE_DEFS: Record<string, ProvinceDef> = {};
for (const [id, name, lon, lat, owner, terrain, good, weight] of PROVINCE_SEEDS) {
  PROVINCE_DEFS[id] = { id, name, lon, lat, terrain, good, weight, startOwner: owner, tradeNode: nearestNode(lon, lat) };
}
export const PROVINCE_IDS = Object.keys(PROVINCE_DEFS);

export const SEA_DEFS: Record<string, SeaZoneDef> = Object.fromEntries(SEA_ZONES.map((s) => [s.id, s]));
export const OUTPOST_DEFS: Record<string, OutpostDef> = Object.fromEntries(OUTPOSTS.map((o) => [o.id, o]));

export function polity(id: string): PolityDef {
  return POLITIES[id];
}

export function neighbors(provinceId: string): string[] {
  return GEO.adjacency[provinceId] ?? [];
}

export function seaNeighbors(seaId: string): string[] {
  return GEO.seaAdjacency[seaId] ?? [];
}

export function coastalSeas(provinceId: string): string[] {
  return GEO.provinces[provinceId]?.seas ?? [];
}

export function isCoastal(provinceId: string): boolean {
  return !!GEO.provinces[provinceId]?.coastal;
}

/** Province centroid in map units (label point). */
export function provincePoint(id: string): [number, number] {
  const g = GEO.provinces[id];
  return g ? [g.lx, g.ly] : [0, 0];
}

export function provinceDistance(a: string, b: string): number {
  const [ax, ay] = provincePoint(a);
  const [bx, by] = provincePoint(b);
  return Math.hypot(ax - bx, ay - by);
}

export function seaPoint(id: string): [number, number] {
  const s = GEO.seas[id];
  return s ? [s.cx, s.cy] : [0, 0];
}

/** Natural Earth I projection matching the generated map geometry. */
export function project(lon: number, lat: number): [number, number] {
  const { scale, translate, rotate } = GEO.projection;
  let lambda = (lon + rotate) * toRad;
  while (lambda > Math.PI) lambda -= 2 * Math.PI;
  while (lambda < -Math.PI) lambda += 2 * Math.PI;
  const phi = lat * toRad;
  const phi2 = phi * phi, phi4 = phi2 * phi2;
  const x = lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4)));
  const y = phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
  return [translate[0] + scale * x, translate[1] - scale * y];
}

export const OUTPOST_POINTS: Record<string, [number, number]> = Object.fromEntries(
  Object.values(OUTPOST_DEFS).map((o) => [o.id, project(o.lon, o.lat)]),
);

/** Province that contains (is nearest to) an outpost. */
export const OUTPOST_HOST: Record<string, string> = Object.fromEntries(
  Object.values(OUTPOST_DEFS).map((o) => {
    let best = PROVINCE_IDS[0];
    let bestD = Infinity;
    for (const id of PROVINCE_IDS) {
      const d = greatCircle(o.lon, o.lat, PROVINCE_DEFS[id].lon, PROVINCE_DEFS[id].lat);
      if (d < bestD) { bestD = d; best = id; }
    }
    return [o.id, best];
  }),
);

export const TRADE_NODE_POINTS: Record<string, [number, number]> = Object.fromEntries(TRADE_NODES.map((n) => [n.id, project(n.lon, n.lat)]));

export function latitude(provinceId: string): number {
  return PROVINCE_DEFS[provinceId]?.lat ?? 0;
}
