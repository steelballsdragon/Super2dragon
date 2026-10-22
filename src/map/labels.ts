// Country name placement: each polity is labelled across its largest contiguous block of
// territory, oriented along that block's principal axis, sized to fit.
import { GEO, POLITIES, neighbors } from '../game/static';
import type { WorldState } from '../game/types';

export interface CountryLabel { id: string; x: number; y: number; size: number; angle: number; text: string; area: number }

const cache = new WeakMap<WorldState, { key: string; labels: CountryLabel[] }>();

export function countryLabels(w: WorldState): CountryLabel[] {
  const key = `${w.turn}:${w.flags.ver ?? 0}`;
  const hit = cache.get(w);
  if (hit && hit.key === key) return hit.labels;
  const byOwner = new Map<string, string[]>();
  for (const p of Object.values(w.provinces)) {
    if (!p.owner || !GEO.provinces[p.id]) continue;
    const l = byOwner.get(p.owner);
    if (l) l.push(p.id); else byOwner.set(p.owner, [p.id]);
  }
  const labels: CountryLabel[] = [];
  for (const [owner, provs] of byOwner) {
    const def = POLITIES[owner];
    if (!def) continue;
    const comp = largestComponent(w, owner, provs);
    let A = 0, sx = 0, sy = 0;
    for (const id of comp) {
      const g = GEO.provinces[id];
      A += g.area; sx += g.lx * g.area; sy += g.ly * g.area;
    }
    if (A <= 0) continue;
    let cx = sx / A, cy = sy / A;
    // Principal axis from the area-weighted covariance of province points.
    let cxx = 0, cyy = 0, cxy = 0;
    for (const id of comp) {
      const g = GEO.provinces[id];
      const dx = g.lx - cx, dy = g.ly - cy;
      cxx += dx * dx * g.area; cyy += dy * dy * g.area; cxy += dx * dy * g.area;
    }
    cxx /= A; cyy /= A; cxy /= A;
    const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const l1 = (cxx + cyy) / 2 + Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy);
    const l2 = (cxx + cyy) / 2 - Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy);
    // Extent along the axis: the bounding boxes of the component projected onto it.
    let lo = Infinity, hi = -Infinity;
    const ux = Math.cos(theta), uy = Math.sin(theta);
    for (const id of comp) {
      const b = GEO.provinces[id].bbox;
      for (const [px, py] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]] as [number, number][]) {
        const t = (px - cx) * ux + (py - cy) * uy;
        if (t < lo) lo = t;
        if (t > hi) hi = t;
      }
    }
    const span = Math.max(4, (hi - lo) * 0.82);
    let angle = (theta * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const elongated = l2 <= 0 || l1 / Math.max(1e-6, l2) > 2.2;
    if (!elongated || Math.abs(angle) > 38) angle = elongated ? Math.sign(angle) * 38 : 0;
    // Keep the anchor on land: crescent-shaped realms put the centroid outside.
    let nearest = comp[0], nd = Infinity;
    for (const id of comp) {
      const g = GEO.provinces[id];
      const d = Math.hypot(g.lx - cx, g.ly - cy);
      if (d < nd) { nd = d; nearest = id; }
    }
    if (nd > Math.sqrt(A) * 0.22) { cx = GEO.provinces[nearest].lx; cy = GEO.provinces[nearest].ly; }
    const text = def.short.toUpperCase();
    const size = Math.max(1.6, Math.min(46, span / (text.length * 0.78 + 0.6), Math.sqrt(A) * 0.42));
    labels.push({ id: owner, x: cx, y: cy, size, angle, text, area: A });
  }
  labels.sort((a, b) => b.area - a.area);
  cache.set(w, { key, labels });
  return labels;
}

function largestComponent(w: WorldState, owner: string, provs: string[]): string[] {
  const seen = new Set<string>();
  let best: string[] = [], bestA = -1;
  for (const start of provs) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    let area = 0;
    while (stack.length) {
      const id = stack.pop()!;
      comp.push(id);
      area += GEO.provinces[id]?.area ?? 0;
      for (const n of neighbors(id)) {
        if (!seen.has(n) && w.provinces[n]?.owner === owner && GEO.provinces[n]) { seen.add(n); stack.push(n); }
      }
    }
    if (area > bestA) { bestA = area; best = comp; }
  }
  return best;
}
