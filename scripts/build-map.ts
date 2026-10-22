/**
 * Builds the province map from Natural Earth coastlines and the province seed database.
 *
 *  1. Natural Earth 1:50m land (world-atlas) is simplified and projected (Natural Earth I).
 *  2. Every province contributes one or more seed points at real coordinates; a Voronoi
 *     diagram of the seeds is computed in projected space.
 *  3. Cell edges are deterministically "wobbled" so borders read like hand-drawn atlas lines;
 *     shared edges are perturbed identically for both neighbours, so there are no gaps.
 *  4. Cells are unioned per province and clipped to the coastline.
 *  5. Borders, land adjacency, sea zones, coast/sea adjacency and port points are derived.
 *
 * Output: src/data/generated/map.json  (run with `npm run build:map`)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { presimplify, simplify, filter, filterWeight, sphericalTriangleArea, sphericalRingArea } from 'topojson-simplify';
import { geoNaturalEarth1, geoGraticule10, geoPath } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';
import polylabel from 'polylabel';
import { PROVINCE_SEEDS, validateData } from '../src/data/index';
import { SEA_ZONES, SEA_WRAP } from '../src/data/world';

type Pt = [number, number];
type Ring = Pt[];
type Poly = Ring[];
type MultiPoly = Poly[];

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const W = 2000;
const TOP_LAT = 84;
const BOTTOM_LAT = -58;
const R = 2; // raster cells per map unit

const errors = validateData();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Projection & land
// ---------------------------------------------------------------------------
const projection = geoNaturalEarth1().rotate([-11, 0]);
projection.fitWidth(W, { type: 'Sphere' });
{
  const [, yTop] = projection([0 + 11, TOP_LAT])!;
  const t = projection.translate();
  projection.translate([t[0], t[1] - yTop]);
}
const H = Math.ceil(projection([11, BOTTOM_LAT])![1]);
console.log(`map ${W}x${H}, scale ${projection.scale().toFixed(3)}`);

const topoPath = require.resolve('world-atlas/land-50m.json');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let topology: any = JSON.parse(readFileSync(topoPath, 'utf8'));
topology = presimplify(topology, sphericalTriangleArea);
topology = simplify(topology, 2.2e-7);
topology = filter(topology, filterWeight(topology, 2.5e-6, sphericalRingArea as unknown as Parameters<typeof filterWeight>[2]));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const landFeature: any = feature(topology, topology.objects.land);
// Drop Antarctica and far-southern specks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const geom: any = landFeature.type === 'FeatureCollection' ? landFeature.features[0].geometry : landFeature.geometry;
const geoPolys: number[][][][] = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
const keptGeo = geoPolys.filter((poly) => poly[0].some(([, lat]) => lat > BOTTOM_LAT + 1));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const projected: any = geoProject({ type: 'MultiPolygon', coordinates: keptGeo } as any, projection);
const landPolys: MultiPoly = (projected.type === 'MultiPolygon' ? projected.coordinates : [projected.coordinates])
  .map((poly: number[][][]) => poly.map((ring) => ring.map(([x, y]) => [x, y] as Pt)))
  .filter((poly: Poly) => poly[0].length >= 4);
console.log(`land polygons: ${landPolys.length}, vertices: ${landPolys.reduce((s, p) => s + p.reduce((t, r) => t + r.length, 0), 0)}`);

function bboxOf(rings: Ring[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
const landBoxes = landPolys.map((p) => bboxOf(p));

// ---------------------------------------------------------------------------
// Land raster (even-odd scanline fill)
// ---------------------------------------------------------------------------
const RW = W * R;
const RH = H * R;
const raster = new Uint8Array(RW * RH);
{
  const rows: number[][] = Array.from({ length: RH }, () => []);
  const edges: [number, number, number, number][] = [];
  for (const poly of landPolys) for (const ring of poly) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[i + 1];
      if (ay === by) continue;
      const idx = edges.length;
      edges.push([ax * R, ay * R, bx * R, by * R]);
      const r0 = Math.max(0, Math.ceil(Math.min(ay, by) * R - 0.5));
      const r1 = Math.min(RH - 1, Math.floor(Math.max(ay, by) * R - 0.5));
      for (let r = r0; r <= r1; r++) rows[r].push(idx);
    }
  }
  for (let r = 0; r < RH; r++) {
    const yc = r + 0.5;
    const xs: number[] = [];
    for (const e of rows[r]) {
      const [ax, ay, bx, by] = edges[e];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const c1 = Math.min(RW - 1, Math.floor(xs[k + 1] - 0.5));
      for (let c = c0; c <= c1; c++) raster[r * RW + c] = 1;
    }
  }
}
const isLand = (x: number, y: number) => {
  const c = Math.floor(x * R), r = Math.floor(y * R);
  if (c < 0 || r < 0 || c >= RW || r >= RH) return false;
  return raster[r * RW + c] === 1;
};

function nudge(p: Pt, wantLand: boolean, maxRadius: number): Pt | null {
  if (isLand(p[0], p[1]) === wantLand) return p;
  const step = 1 / R;
  for (let rad = step; rad <= maxRadius; rad += step) {
    let best: Pt | null = null;
    let bestD = Infinity;
    const n = Math.max(8, Math.ceil(rad * R * 6));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const q: Pt = [p[0] + Math.cos(a) * rad, p[1] + Math.sin(a) * rad];
      if (isLand(q[0], q[1]) === wantLand) {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < bestD) { bestD = d; best = q; }
      }
    }
    if (best) return best;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------
interface Seed { p: Pt; prov: string; primary: boolean; inSea: boolean }
const seeds: Seed[] = [];
const seen = new Set<string>();
const proj = (lon: number, lat: number): Pt => {
  const q = projection([lon, lat])!;
  return [q[0], q[1]];
};
for (const s of PROVINCE_SEEDS) {
  const [id, , lon, lat, , , , , extra] = s;
  const pts: [number, number][] = [[lon, lat], ...(extra ?? [])];
  pts.forEach(([lo, la], i) => {
    let p = proj(lo, la);
    const n = nudge(p, true, 5);
    const inSea = !n;
    if (n) p = n;
    let key = `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    while (seen.has(key)) {
      p = [p[0] + 0.37, p[1] + 0.23];
      key = `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    }
    seen.add(key);
    seeds.push({ p, prov: id, primary: i === 0, inSea });
  });
}
console.log(`seeds: ${seeds.length}`);

const BOUNDS: [number, number, number, number] = [-30, -30, W + 30, H + 30];
const delaunay = Delaunay.from(seeds.map((s) => s.p));
const voronoi = delaunay.voronoi(BOUNDS);

// ---------------------------------------------------------------------------
// Deterministic edge perturbation
// ---------------------------------------------------------------------------
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
const ptKey = (p: Pt) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
const edgeCache = new Map<string, Pt[]>();
function wobble(a: Pt, b: Pt): Pt[] {
  const ka = ptKey(a), kb = ptKey(b);
  const forward = ka < kb;
  const key = forward ? `${ka}|${kb}` : `${kb}|${ka}`;
  let line = edgeCache.get(key);
  if (!line) {
    const [p0, p1] = forward ? [a, b] : [b, a];
    const rand = rng(hash(key));
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    let pts: Pt[] = [p0, p1];
    let amp = Math.min(len * 0.16, 9);
    while (amp > 0.15) {
      const next: Pt[] = [pts[0]];
      let longest = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        const l = Math.hypot(x1 - x0, y1 - y0);
        longest = Math.max(longest, l);
        if (l > 1.6) {
          const nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
          const off = (rand() - 0.5) * 2 * Math.min(amp, l * 0.3);
          const t = 0.4 + rand() * 0.2;
          next.push([x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off]);
        }
        next.push(pts[i + 1]);
      }
      pts = next;
      amp *= 0.5;
      if (longest <= 1.6) break;
    }
    line = pts;
    edgeCache.set(key, line);
  }
  return forward ? line : [...line].reverse();
}

// Cell polygons (perturbed) and shared-edge bookkeeping.
const cellPolys: Ring[] = [];
const edgeOwners = new Map<string, { a: Pt; b: Pt; cells: number[] }>();
for (let i = 0; i < seeds.length; i++) {
  const poly = voronoi.cellPolygon(i) as Pt[] | null;
  if (!poly) { cellPolys.push([]); continue; }
  const ring: Ring = [];
  for (let k = 0; k < poly.length - 1; k++) {
    const a = poly[k] as Pt, b = poly[k + 1] as Pt;
    const seg = wobble(a, b);
    for (let j = 0; j < seg.length - 1; j++) ring.push(seg[j]);
    const ka = ptKey(a), kb = ptKey(b);
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const rec = edgeOwners.get(key) ?? { a, b, cells: [] };
    rec.cells.push(i);
    edgeOwners.set(key, rec);
  }
  ring.push(ring[0]);
  cellPolys.push(ring);
}

// ---------------------------------------------------------------------------
// Province polygons
// ---------------------------------------------------------------------------
const provSeeds = new Map<string, number[]>();
seeds.forEach((s, i) => { const l = provSeeds.get(s.prov) ?? []; l.push(i); provSeeds.set(s.prov, l); });

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return a / 2;
}
const polyArea = (p: Poly) => Math.abs(ringArea(p[0])) - p.slice(1).reduce((s, h) => s + Math.abs(ringArea(h)), 0);

function fmt(n: number): string {
  const v = Math.round(n * 10) / 10;
  let s = v.toFixed(1);
  if (s.endsWith('.0')) s = s.slice(0, -2);
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s === '-0' ? '0' : s;
}
function pathOfRings(rings: Ring[], close = true): string {
  let d = '';
  for (const ring of rings) {
    if (ring.length < 2) continue;
    let px = Math.round(ring[0][0] * 10) / 10, py = Math.round(ring[0][1] * 10) / 10;
    d += `M${fmt(px)} ${fmt(py)}`;
    let cmd = '';
    const end = close && ring.length > 2 && ptKey(ring[0]) === ptKey(ring[ring.length - 1]) ? ring.length - 1 : ring.length;
    for (let i = 1; i < end; i++) {
      const x = Math.round(ring[i][0] * 10) / 10, y = Math.round(ring[i][1] * 10) / 10;
      const dx = x - px, dy = y - py;
      if (dx === 0 && dy === 0) continue;
      const sx = fmt(dx), sy = fmt(dy);
      if (!cmd) { d += 'l'; cmd = 'l'; }
      else if (!sx.startsWith('-')) d += ' ';
      d += sx + (sy.startsWith('-') ? '' : ' ') + sy;
      px = x; py = y;
    }
    if (close) d += 'z';
  }
  return d;
}

interface ProvOut {
  d: string; lx: number; ly: number; cx: number; cy: number; area: number;
  bbox: [number, number, number, number]; coastal: boolean; port: [number, number] | null; seas: string[]; marker?: boolean;
}
const provinces: Record<string, ProvOut> = {};
let clipFailures = 0;
const t0 = Date.now();
for (const [id, idxs] of provSeeds) {
  const cells = idxs.map((i) => [cellPolys[i]] as Poly).filter((p) => p[0].length > 3);
  let merged: MultiPoly;
  try {
    merged = cells.length === 1 ? [cells[0]] : (polygonClipping.union(cells[0] as never, ...(cells.slice(1) as never[])) as unknown as MultiPoly);
  } catch {
    clipFailures++;
    merged = cells;
  }
  const box = bboxOf(merged.flat());
  const nearLand = landPolys.filter((_, k) => {
    const b = landBoxes[k];
    return !(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]);
  });
  let land: MultiPoly = [];
  if (nearLand.length) {
    try {
      land = polygonClipping.intersection(merged as never, nearLand as never) as unknown as MultiPoly;
    } catch {
      clipFailures++;
      try { land = polygonClipping.intersection(cells.map((c) => c) as never, nearLand as never) as unknown as MultiPoly; } catch { land = []; }
    }
  }
  land = land.filter((p) => polyArea(p) > 0.02);
  const primary = seeds[idxs[0]];
  if (!land.length) {
    const [x, y] = primary.p;
    provinces[id] = { d: '', lx: x, ly: y, cx: x, cy: y, area: 0, bbox: [x - 2, y - 2, x + 2, y + 2], coastal: true, port: [x, y], seas: [], marker: true };
    continue;
  }
  let area = 0, cx = 0, cy = 0, biggest = land[0], biggestA = 0;
  for (const p of land) {
    const a = polyArea(p);
    const [bx0, by0, bx1, by1] = bboxOf([p[0]]);
    area += a; cx += a * (bx0 + bx1) / 2; cy += a * (by0 + by1) / 2;
    if (a > biggestA) { biggestA = a; biggest = p; }
  }
  const label = polylabel(biggest as number[][][], 0.3) as unknown as [number, number];
  provinces[id] = {
    d: pathOfRings(land.flat()),
    lx: +label[0].toFixed(1), ly: +label[1].toFixed(1),
    cx: +(cx / area).toFixed(1), cy: +(cy / area).toFixed(1),
    area: +area.toFixed(1),
    bbox: bboxOf(land.flat()).map((v) => +v.toFixed(1)) as [number, number, number, number],
    coastal: false, port: null, seas: [],
  };
}
console.log(`province polygons in ${((Date.now() - t0) / 1000).toFixed(1)}s, clip failures ${clipFailures}`);

// ---------------------------------------------------------------------------
// Borders & land adjacency
// ---------------------------------------------------------------------------
const borderMap = new Map<string, { a: string; b: string; runs: Ring[]; len: number }>();
for (const rec of edgeOwners.values()) {
  if (rec.cells.length !== 2) continue;
  const pa = seeds[rec.cells[0]].prov, pb = seeds[rec.cells[1]].prov;
  if (pa === pb) continue;
  const line = wobble(rec.a, rec.b);
  let run: Ring = [];
  const key = pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
  const entry = borderMap.get(key) ?? { a: pa < pb ? pa : pb, b: pa < pb ? pb : pa, runs: [], len: 0 };
  for (let j = 0; j < line.length - 1; j++) {
    const m: Pt = [(line[j][0] + line[j + 1][0]) / 2, (line[j][1] + line[j + 1][1]) / 2];
    if (isLand(m[0], m[1])) {
      if (!run.length) run.push(line[j]);
      run.push(line[j + 1]);
      entry.len += Math.hypot(line[j + 1][0] - line[j][0], line[j + 1][1] - line[j][1]);
    } else if (run.length) { entry.runs.push(run); run = []; }
  }
  if (run.length) entry.runs.push(run);
  borderMap.set(key, entry);
}
const edgesOut: { a: string; b: string; d: string; len: number }[] = [];
const adjacency: Record<string, string[]> = {};
const addAdj = (a: string, b: string) => {
  (adjacency[a] ??= []).includes(b) || adjacency[a].push(b);
  (adjacency[b] ??= []).includes(a) || adjacency[b].push(a);
};
for (const e of borderMap.values()) {
  if (e.len < 1.2 || !e.runs.length) continue;
  edgesOut.push({ a: e.a, b: e.b, d: pathOfRings(e.runs, false), len: +e.len.toFixed(1) });
  addAdj(e.a, e.b);
}
// Straits and narrow crossings that armies can march (or ferry) across.
const STRAITS: [string, string][] = [
  ['constantinople', 'bursa'], ['thrace', 'smyrna'], ['zealand', 'scania'], ['zealand', 'jutland'], ['calabria', 'catania'],
  ['crimea', 'circassia'], ['palermo', 'catania'], ['highlands', 'lowlands'],
  ['edo', 'tohoku'], ['kyushu', 'chugoku'], ['shikoku', 'kinai'], ['matsumae', 'tohoku'], ['ezo', 'matsumae'],
  ['jaffna', 'madura'], ['north_coast', 'east_java'], ['batavia', 'banten'], ['lampung', 'banten'],
  ['hainan', 'guangdong'], ['taiwan', 'fujian'], ['taiwan', 'taiwan_east'], ['johor', 'riau'],
  ['delta', 'palestine'], ['cairo', 'palestine'], ['tihama', 'massawa'],
  ['lower_canada', 'nova_scotia'], ['newfoundland', 'nova_scotia'],
  ['kilwa', 'zanzibar'], ['mombasa', 'zanzibar'],
];
for (const [a, b] of STRAITS) if (provinces[a] && provinces[b]) addAdj(a, b);

// ---------------------------------------------------------------------------
// Sea zones
// ---------------------------------------------------------------------------
const seaSeeds: Pt[] = SEA_ZONES.map((z) => {
  const p = proj(z.lon, z.lat);
  return nudge(p, false, 30) ?? p;
});
const seaDelaunay = Delaunay.from(seaSeeds);
const seaVoronoi = seaDelaunay.voronoi(BOUNDS);
const seas: Record<string, { d: string; cx: number; cy: number }> = {};
const seaAdjacency: Record<string, string[]> = {};
const addSeaAdj = (a: string, b: string) => {
  (seaAdjacency[a] ??= []).includes(b) || seaAdjacency[a].push(b);
  (seaAdjacency[b] ??= []).includes(a) || seaAdjacency[b].push(a);
};
const seaBorderRuns: Ring[] = [];
SEA_ZONES.forEach((z, i) => {
  const poly = seaVoronoi.cellPolygon(i) as Pt[] | null;
  seas[z.id] = { d: poly ? pathOfRings([poly as Ring]) : '', cx: +seaSeeds[i][0].toFixed(1), cy: +seaSeeds[i][1].toFixed(1) };
});
for (let i = 0; i < SEA_ZONES.length; i++) {
  for (const j of seaDelaunay.neighbors(i)) {
    if (j <= i) continue;
    // Shared edge: sample points along the perpendicular bisector inside both cells.
    const pi = seaVoronoi.cellPolygon(i) as Pt[];
    const pj = seaVoronoi.cellPolygon(j) as Pt[];
    if (!pi || !pj) continue;
    const kj = new Set(pj.map(ptKey));
    const shared = pi.filter((p) => kj.has(ptKey(p)));
    if (shared.length < 2) continue;
    const [a, b] = [shared[0], shared[1]];
    let sea = 0;
    for (let t = 0.02; t < 1; t += 0.02) {
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      if (!isLand(x, y)) sea++;
    }
    if (sea >= 2) {
      addSeaAdj(SEA_ZONES[i].id, SEA_ZONES[j].id);
      seaBorderRuns.push([a, b]);
    }
  }
}
for (const [a, b] of SEA_WRAP) addSeaAdj(a, b);

// Coast ↔ sea adjacency and ports via the raster.
const provIdx = new Map<string, number>();
const provNames: string[] = [];
for (const id of provSeeds.keys()) { provIdx.set(id, provNames.length); provNames.push(id); }
const coastCount = new Map<string, number>();
const bestPort = new Map<string, { d: number; x: number; y: number; sea: string }>();
{
  let landHint = 0, seaHint = 0;
  const landOf = (x: number, y: number) => { landHint = delaunay.find(x, y, landHint); return seeds[landHint].prov; };
  const seaOf = (x: number, y: number) => { seaHint = seaDelaunay.find(x, y, seaHint); return SEA_ZONES[seaHint].id; };
  for (let r = 0; r < RH; r++) {
    for (let c = 0; c < RW; c++) {
      if (raster[r * RW + c] !== 1) continue;
      const neighbours: [number, number][] = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
      let seaN: [number, number] | null = null;
      for (const [nc, nr] of neighbours) {
        if (nc < 0 || nr < 0 || nc >= RW || nr >= RH) continue;
        if (raster[nr * RW + nc] === 0) { seaN = [nc, nr]; break; }
      }
      if (!seaN) continue;
      const x = (c + 0.5) / R, y = (r + 0.5) / R;
      const prov = landOf(x, y);
      const sea = seaOf((seaN[0] + 0.5) / R, (seaN[1] + 0.5) / R);
      const key = `${prov}|${sea}`;
      coastCount.set(key, (coastCount.get(key) ?? 0) + 1);
      const primary = seeds[provSeeds.get(prov)![0]].p;
      const d = Math.hypot(x - primary[0], y - primary[1]);
      const cur = bestPort.get(prov);
      if (!cur || d < cur.d) bestPort.set(prov, { d, x, y, sea });
    }
  }
}
for (const [key, n] of coastCount) {
  if (n < 2) continue;
  const [prov, sea] = key.split('|');
  const p = provinces[prov];
  if (!p) continue;
  p.coastal = true;
  if (!p.seas.includes(sea)) p.seas.push(sea);
}
for (const [prov, best] of bestPort) {
  const p = provinces[prov];
  if (p && p.coastal) {
    p.port = [+best.x.toFixed(1), +best.y.toFixed(1)];
    p.seas.sort((a, b) => (a === best.sea ? -1 : b === best.sea ? 1 : 0));
  }
}
// Island markers: attach to the sea zone they sit in.
for (const [id, p] of Object.entries(provinces)) {
  if (p.marker || !p.seas.length) {
    const i = seaDelaunay.find(p.lx, p.ly);
    p.coastal = true;
    p.port ??= [p.lx, p.ly];
    if (!p.seas.length) p.seas.push(SEA_ZONES[i].id);
    if (p.marker) console.log(`  marker province (no coastline data): ${id}`);
  }
}

// ---------------------------------------------------------------------------
// Graticule & outline, output
// ---------------------------------------------------------------------------
const pathGen = geoPath(projection);
const graticule = (pathGen(geoGraticule10()) ?? '').replace(/(\d+\.\d)\d+/g, '$1');
const outline = (pathGen({ type: 'Sphere' }) ?? '').replace(/(\d+\.\d)\d+/g, '$1');

const out = {
  width: W,
  height: H,
  projection: { scale: projection.scale(), translate: projection.translate() as [number, number], rotate: -11 },
  provinces,
  edges: edgesOut,
  adjacency,
  seas,
  seaAdjacency,
  seaBorders: pathOfRings(seaBorderRuns, false),
  graticule,
  outline,
};
const outFile = resolve(here, '../src/data/generated/map.json');
mkdirSync(dirname(outFile), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(outFile, json);
const isolated = Object.keys(provinces).filter((id) => !adjacency[id]?.length && !provinces[id].coastal);
console.log(`wrote ${outFile} (${(json.length / 1024).toFixed(0)} KB); provinces ${Object.keys(provinces).length}, borders ${edgesOut.length}, sea zones ${SEA_ZONES.length}`);
if (isolated.length) console.log(`WARNING unreachable provinces: ${isolated.join(', ')}`);
const noSeaAdj = SEA_ZONES.filter((z) => !seaAdjacency[z.id]?.length).map((z) => z.id);
if (noSeaAdj.length) console.log(`sea zones without neighbours: ${noSeaAdj.join(', ')}`);
