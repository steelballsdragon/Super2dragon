/* Age of Conquest world: seeded random numbers, terrain generation, pathfinding, spatial lookups and vision.
   Everything here is deterministic for a given seed. Part of the engine bundle. */

// ================================================================ random numbers
// mulberry32. The world keeps its state in w.rs so a save/load continues the same sequence.
function rnd(w) {
  let t = (w.rs = (w.rs + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// a stand-alone generator from a seed (battles, world generation)
function makeRng(seed) {
  const o = { rs: seed >>> 0 };
  const f = () => rnd(o);
  f.int = (a, b) => a + Math.floor(rnd(o) * (b - a + 1));
  f.pick = arr => arr[Math.floor(rnd(o) * arr.length)];
  f.range = (a, b) => a + rnd(o) * (b - a);
  return f;
}
function rint(w, a, b) { return a + Math.floor(rnd(w) * (b - a + 1)); }
function rpick(w, arr) { return arr[Math.floor(rnd(w) * arr.length)]; }
function hash32(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e37; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, k) => a + (b - a) * k;

// ================================================================ tiles
const N = MAP_N;
const N2 = N * N;
const idx = (x, y) => y * N + x;
const tx = i => i % N;
const ty = i => (i / N) | 0;
const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
const passable = (w, i) => TERRAIN[w.map.ter[i]].cost !== Infinity;

// ================================================================ terrain generation
function valueNoise(rng, n, cells) {
  // bilinear value noise on a (cells+1)^2 lattice, smoothstepped
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const out = new Float32Array(n * n);
  const s = cells / n;
  for (let y = 0; y < n; y++) {
    const fy = y * s, y0 = fy | 0, ky = fy - y0, sy = ky * ky * (3 - 2 * ky);
    for (let x = 0; x < n; x++) {
      const fx = x * s, x0 = fx | 0, kx = fx - x0, sx = kx * kx * (3 - 2 * kx);
      const a = g[y0 * (cells + 1) + x0], b = g[y0 * (cells + 1) + x0 + 1];
      const c = g[(y0 + 1) * (cells + 1) + x0], d = g[(y0 + 1) * (cells + 1) + x0 + 1];
      out[y * n + x] = lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
    }
  }
  return out;
}
function fbm(rng, n, octaves) {
  const out = new Float32Array(n * n);
  let amp = 1, total = 0;
  for (const cells of octaves) {
    const layer = valueNoise(rng, n, cells);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
// spread a noise field evenly over 0..1 (histogram equalization), so terrain shares stay steady from seed to seed
function equalize(a) {
  const B = 4096, hist = new Uint32Array(B + 1);
  for (let i = 0; i < a.length; i++) hist[Math.min(B, Math.max(0, Math.floor(a[i] * B)))]++;
  const cdf = new Float32Array(B + 1);
  let acc = 0;
  for (let b = 0; b <= B; b++) { acc += hist[b]; cdf[b] = acc / a.length; }
  for (let i = 0; i < a.length; i++) a[i] = cdf[Math.min(B, Math.max(0, Math.floor(a[i] * B)))];
  return a;
}

// ================================================================ the kingdom layout
// Polar coordinates around the Capital, bent by low-frequency noise so the ranges wind like real mountains. Every
// tile gets a region (0-5 Zone 1, 6-8 Zone 2, 9 Zone 3); tiles within WALL of a region border are mountains,
// except for the passes cut through them.
const CX = N / 2, CY = N / 2;
const R3 = ZONES.r3 * N, R2 = ZONES.r2 * N;
const WALL = 2.3;
const TAU = Math.PI * 2;
const SEC1 = TAU / 6, SEC2 = TAU / 3, A0 = -TAU / 3;   // Zone 1 region 0 and Zone 2 region 6 both start at -120 degrees
const angNorm = a => { a %= TAU; return a < 0 ? a + TAU : a; };
const angDiff = (a, b) => { const d = angNorm(a - b); return d > Math.PI ? TAU - d : d; };
// distance from the Capital to the map edge along an angle
function edgeDist(a) { const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return (N / 2 - 3) / Math.max(c, s); }
// the 15 passes: where each one cuts through which range, and the two regions it joins
const GATES = (() => {
  const out = [];
  for (let k = 0; k < 6; k++) {
    const a = A0 + k * SEC1;
    out.push({ k: out.length, level: 1, wall: 'radial1', a, r: R2 + (edgeDist(a) - R2) * 0.48, links: [(k + 5) % 6, k] });
  }
  for (let k = 0; k < 6; k++) out.push({ k: out.length, level: 2, wall: 'ring2', a: A0 + (k + 0.5) * SEC1, r: R2, links: [k, 6 + (k >> 1)] });
  for (let j = 0; j < 3; j++) out.push({ k: out.length, level: 3, wall: 'ring3', a: A0 + (j + 0.5) * SEC2, r: R3, links: [6 + j, 9] });
  return out;
})();
const ALL_GATES = (1 << GATES.length) - 1;
// a point in the middle of a region (for events and placement)
function regionCenter(k) {
  if (k === 9) return [Math.round(CX), Math.round(CY - R3 * 0.55)];
  if (k >= 6) { const a = A0 + (k - 6 + 0.5) * SEC2, r = (R3 + R2) / 2; return [Math.round(CX + Math.cos(a) * r), Math.round(CY + Math.sin(a) * r)]; }
  const a = A0 + (k + 0.5) * SEC1, r = R2 + (edgeDist(a) - R2) * 0.5;
  return [Math.round(CX + Math.cos(a) * r), Math.round(CY + Math.sin(a) * r)];
}
function zoneOfRegion(k) { return k === 9 ? 3 : k >= 6 ? 2 : 1; }

// one terrain per seed is kept: tests and the interface ask for the same seed many times, and nothing writes to it
let terrainCache = null;
function generateTerrain(seed) {
  if (terrainCache && terrainCache.seed === seed) return terrainCache;
  const rng = makeRng(hash32(seed, 'terrain'));
  const elev = equalize(fbm(rng, N, [6, 12, 24, 48, 96]));
  const moist = equalize(fbm(rng, N, [5, 10, 20, 40]));
  const ridge = equalize(fbm(rng, N, [8, 16, 32]));
  const bendR = fbm(rng, N, [5, 10]), bendA = fbm(rng, N, [5, 10]);
  const ter = new Uint8Array(N2);
  const reg = new Uint8Array(N2).fill(255);
  const wall = new Uint8Array(N2);      // 1 mountain range, 2 a pass road through it
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      const dc = dist(x, y, CX, CY) / (N / 2);
      // elevation and moisture are spread evenly over 0..1; the heartland around the Capital is flattened
      let e = elev[i];
      if (dc < 0.16) e = lerp(0.5, e, dc / 0.16);
      const r0 = 1 - Math.abs(ridge[i] * 2 - 1);   // 1 on the ridge lines
      let t;
      if (e < 0.075 && dc > 0.2) t = T.water;
      else if (e > 0.965 || (r0 > 0.975 && e > 0.55 && dc > 0.22)) t = T.mountain;
      else if (e > 0.84 || (r0 > 0.93 && dc > 0.22)) t = T.hills;
      else if (moist[i] > 0.68) t = T.forest;
      else t = T.plains;
      if (y < N * 0.15 && (t === T.plains || (t === T.forest && moist[i] < 0.8))) t = T.snow;
      ter[i] = t;
    }
  }
  // rivers: run downhill from high ground to water or the map edge
  for (let k = 0; k < 9; k++) {
    let x = rng.int(20, N - 21), y = rng.int(20, N - 21), tries = 0;
    while (tries++ < 80 && !(elev[idx(x, y)] > 0.8 && dist(x, y, CX, CY) > 40)) { x = rng.int(20, N - 21); y = rng.int(20, N - 21); }
    const seen = new Set();
    for (let s = 0; s < 420; s++) {
      const i = idx(x, y);
      if (seen.has(i)) break;
      seen.add(i);
      if (ter[i] === T.water) break;
      if (ter[i] !== T.mountain && dist(x, y, CX, CY) > 14) ter[i] = s % 11 === 6 ? T.ford : T.river;
      let best = null, bv = Infinity;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inMap(nx, ny)) { best = null; bv = -1; break; }
        const v = elev[idx(nx, ny)] + (seen.has(idx(nx, ny)) ? 1 : 0) + rng() * 0.02;
        if (v < bv) { bv = v; best = [nx, ny]; }
      }
      if (!best) break;
      [x, y] = best;
    }
  }
  // the ranges between the regions, and the passes through them
  const gateBest = GATES.map(() => ({ i: -1, s: Infinity }));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      const dx = x + 0.5 - CX, dy = y + 0.5 - CY;
      const r = Math.hypot(dx, dy) + (bendR[i] - 0.5) * 16;
      const a = Math.atan2(dy, dx) + (bendA[i] - 0.5) * 16 / Math.max(14, r);
      let region;
      if (r < R3) region = 9;
      else if (r < R2) region = 6 + Math.min(2, Math.floor(angNorm(a - A0) / SEC2));
      else region = Math.min(5, Math.floor(angNorm(a - A0) / SEC1));
      // distance to the nearest range, and which pass (if any) cuts through it here
      let wd = Infinity, gate = -1;
      const consider = (d, g) => { if (d < wd) { wd = d; gate = g; } };
      consider(Math.abs(r - R3), 'ring3');
      consider(Math.abs(r - R2), 'ring2');
      if (r > R3 - WALL && r < R2 + WALL) { const k = Math.round(angNorm(a - A0) / SEC2) % 3; consider(angDiff(a, A0 + k * SEC2) * r, 'radial2'); }
      if (r > R2 - WALL) { const k = Math.round(angNorm(a - A0) / SEC1) % 6; consider(angDiff(a, A0 + k * SEC1) * r, 'radial1:' + k); }
      if (wd >= WALL) { reg[i] = region; continue; }
      wall[i] = 1;
      ter[i] = T.mountain;
      for (const G of GATES) {
        let s;
        if (G.wall === 'radial1') { if (gate !== 'radial1:' + (G.k % 6)) continue; s = Math.abs(r - G.r); }
        else if (G.wall === gate) s = angDiff(a, G.a) * r;
        else continue;
        if (s >= 1.7) continue;
        wall[i] = 2; ter[i] = T.gate; reg[i] = 100 + G.k;
        const score = s + wd;
        if (score < gateBest[G.k].s) gateBest[G.k] = { i, s: score };
        break;
      }
    }
  }
  const gates = GATES.map(G => ({ k: G.k, level: G.level, links: G.links.slice(), at: gateBest[G.k].i, x: tx(gateBest[G.k].i), y: ty(gateBest[G.k].i) }));
  // clear the approaches on both sides of every pass so armies can reach it
  const keep = new Uint8Array(N2);
  for (const G of gates) {
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      if (dx * dx + dy * dy > 49) continue;
      const nx = G.x + dx, ny = G.y + dy;
      if (!inMap(nx, ny)) continue;
      const j = idx(nx, ny);
      if (wall[j]) continue;
      const t = ter[j];
      ter[j] = t === T.water ? T.plains : t === T.river ? T.ford : t === T.mountain ? T.hills : t;
      keep[j] = 1;
    }
  }
  connectRegions(ter, reg, wall, keep);
  terrainCache = { seed, ter, elev, reg, wall, gates };
  return terrainCache;
}

// inside every region, every passable tile must be reachable: small pockets are filled, larger ones get a trail
// or a ford to the region's main land. Nothing is carved through the ranges between the regions.
function connectRegions(ter, reg, wall, keep) {
  const comp = new Int32Array(N2).fill(-1);
  const comps = [];
  const stack = [];
  const open = j => !wall[j] && TERRAIN[ter[j]].cost !== Infinity;
  for (let s = 0; s < N2; s++) {
    if (comp[s] >= 0 || !open(s)) continue;
    const id = comps.length, rid = reg[s];
    const tiles = [];
    let kept = 0;
    comp[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(); tiles.push(i); kept |= keep[i];
      const x = tx(i), y = ty(i);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inMap(nx, ny)) continue;
        const j = idx(nx, ny);
        if (comp[j] < 0 && open(j) && reg[j] === rid) { comp[j] = id; stack.push(j); }
      }
    }
    comps.push({ id, rid, tiles, kept });
  }
  const main = new Map();
  for (const c of comps) if (!main.has(c.rid) || c.tiles.length > comps[main.get(c.rid)].tiles.length) main.set(c.rid, c.id);
  const fill = c => { for (const i of c.tiles) { ter[i] = T.mountain; comp[i] = -1; } };
  const prev = new Int32Array(N2), seen = new Int32Array(N2);
  let stamp = 0;
  for (const c of comps) {
    const m = main.get(c.rid);
    if (c.id === m) continue;
    if (c.tiles.length < 40 && !c.kept) { fill(c); continue; }
    // breadth-first through this region's blocked tiles to the nearest main tile, then carve that line
    stamp++;
    const q = [];
    for (const i of c.tiles) { seen[i] = stamp; prev[i] = -1; q.push(i); }
    let hit = -1;
    for (let h = 0; h < q.length && hit < 0; h++) {
      const i = q[h];
      const x = tx(i), y = ty(i);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inMap(nx, ny)) continue;
        const j = idx(nx, ny);
        if (seen[j] === stamp || wall[j]) continue;
        seen[j] = stamp; prev[j] = i;
        if (comp[j] === m) { hit = j; break; }
        q.push(j);
      }
    }
    if (hit < 0) { fill(c); continue; }
    for (let i = prev[hit]; i >= 0 && comp[i] !== c.id; i = prev[i]) {
      const t = ter[i];
      ter[i] = t === T.mountain ? T.pass : (t === T.water || t === T.river) ? T.ford : t;
      reg[i] = c.rid; comp[i] = m;
    }
    for (const i of c.tiles) comp[i] = m;
  }
  // blocked tiles inside a region belong to no region
  for (let i = 0; i < N2; i++) if (!wall[i] && TERRAIN[ter[i]].cost === Infinity) reg[i] = 255;
}

// ================================================================ regions
// the region of a tile (0-9); a pass road counts as the first region it joins; a mountain looks at its neighbours
function regionAt(w, x, y) {
  const reg = w.map.reg;
  const v = reg[idx(clamp(x, 0, N - 1), clamp(y, 0, N - 1))];
  if (v < 100) return v;
  if (v < 255) return w.map.gates[v - 100].links[0];
  for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (inMap(nx, ny) && reg[idx(nx, ny)] < 100) return reg[idx(nx, ny)];
  }
  return 9;
}
function zoneAt(w, x, y) { return zoneOfRegion(regionAt(w, x, y)); }
// the passes a guild's armies may use: those it holds and those its allies hold
function gateAccess(w, gi) {
  if (gi < 0) return 0;
  let mask = 0;
  for (const mk of w.marks) {
    if (mk.kind !== 'pass' || mk.owner < 0) continue;
    if (mk.owner === gi || treaty(w, gi, mk.owner)?.k === 'alliance') mask |= 1 << mk.gate;
  }
  return mask;
}
// regions reachable from region r through the allowed passes, as a bit mask (cached: the map never changes)
function regionsReachable(w, r, access) {
  const cache = w._reach || (w._reach = new Map());
  const key = r * 65536 + access;
  let v = cache.get(key);
  if (v !== undefined) return v;
  v = 1 << r;
  for (let grew = true; grew;) {
    grew = false;
    for (const G of w.map.gates) {
      if (!(access & (1 << G.k))) continue;
      const [a, b] = G.links;
      if ((v >> a & 1) !== (v >> b & 1)) { v |= (1 << a) | (1 << b); grew = true; }
    }
  }
  cache.set(key, v);
  return v;
}
// the regions this governor's armies can get to, as a bit mask
function reachMaskOf(w, g) { return regionsReachable(w, regionAt(w, g.x, g.y), gateAccess(w, g.guild)); }
// is tile i inside those regions? (a pass counts when either side is)
function inReach(w, mask, i) {
  const reg = w.map.reg[i];
  if (reg === 255) return false;
  if (reg < 100) return !!(mask >> reg & 1);
  const [a, b] = w.map.gates[reg - 100].links;
  return !!((mask >> a & 1) || (mask >> b & 1));
}
// can this governor's armies get to tile i at all? (a quick test on the region map, before any path search)
function canReach(w, g, i) { return inReach(w, reachMaskOf(w, g), i); }

// ================================================================ pathfinding (A* on 8 neighbours, binary heap)
const PF = {
  g: new Float32Array(N2), f: new Float32Array(N2), from: new Int32Array(N2), stamp: new Uint32Array(N2), closed: new Uint32Array(N2),
  heap: new Int32Array(N2 * 2), n: 0, run: 0, calls: 0, hits: 0, fails: 0, expanded: 0,
};
function heapPush(i) {
  const h = PF.heap, f = PF.f;
  let k = PF.n++;
  h[k] = i;
  while (k > 0) { const p = (k - 1) >> 1; if (f[h[p]] <= f[h[k]]) break; const t = h[p]; h[p] = h[k]; h[k] = t; k = p; }
}
function heapPop() {
  const h = PF.heap, f = PF.f;
  const top = h[0];
  h[0] = h[--PF.n];
  let k = 0;
  for (;;) {
    const l = k * 2 + 1, r = l + 1;
    let m = k;
    if (l < PF.n && f[h[l]] < f[h[m]]) m = l;
    if (r < PF.n && f[h[r]] < f[h[m]]) m = r;
    if (m === k) break;
    const t = h[m]; h[m] = h[k]; h[k] = t; k = m;
  }
  return top;
}
// returns an array of tile indices from start to goal (both included), or null. `access` is the bit mask of the
// passes the army may march through (gateAccess, or ALL_GATES for an army going home); 0 means none. A march
// between regions is planned pass by pass (a small search over the passes), then each stretch inside a region is
// found with A*, which keeps searches short on the big map.
function findPath(w, from, to, access = 0) {
  if (from === to) return [from];
  access &= ALL_GATES;
  const key = (from * N2 + to) * 32768 + access;
  const cache = w._pathCache || (w._pathCache = new Map());
  PF.calls++;
  const hit = cache.get(key);
  if (hit !== undefined) { PF.hits++; return hit; }
  const cost = tileCosts(w);
  let path = null;
  if (cost[to] !== Infinity && cost[from] !== Infinity) {
    const reg = w.map.reg;
    const fg = reg[from] >= 100 && reg[from] < 255 ? reg[from] - 100 : -1, tg = reg[to] >= 100 && reg[to] < 255 ? reg[to] - 100 : -1;
    const tgBit = tg >= 0 ? 1 << tg : 0;
    if (fg < 0 && tg < 0 && reg[from] === reg[to]) path = astar(w, from, to, 0);
    else {
      const route = gateRoute(w, from, to, fg, tg, access);
      if (route) {
        path = [from];
        let a = from, allow = fg >= 0 ? 1 << fg : 0;
        for (const k of [...route, -1]) {
          const b = k >= 0 ? w.map.gates[k].at : to;
          const seg = astar(w, a, b, allow | (k >= 0 ? 1 << k : tgBit));
          if (!seg) { path = null; break; }
          for (let s = 1; s < seg.length; s++) path.push(seg[s]);
          a = b; allow = k >= 0 ? 1 << k : 0;
        }
      }
    }
  }
  if (!path) PF.fails++;
  if (cache.size > 1500) cache.clear();
  cache.set(key, path);
  return path;
}
// which passes to march through, in order: a shortest-route search over (pass, side) pairs using straight-line
// distances. Returns [] when start and goal share a region, null when the allowed passes do not connect them.
function gateRoute(w, from, to, fg, tg, access) {
  const gates = w.map.gates, reg = w.map.reg;
  const fx = tx(from), fy = ty(from), gx = tx(to), gy = ty(to);
  const startRegs = fg >= 0 ? gates[fg].links : [reg[from]];
  const goalRegs = tg >= 0 ? gates[tg].links : [reg[to]];
  if (startRegs.some(r => goalRegs.includes(r))) return [];
  const n = gates.length;
  // state s = gate * 2 + side: standing in that pass, about to leave into links[side]
  const best = new Float64Array(n * 2).fill(Infinity), prevS = new Int32Array(n * 2).fill(-1), done = new Uint8Array(n * 2);
  for (const G of gates) {
    if (!(access & (1 << G.k)) || G.k === fg || G.k === tg) continue;
    for (let side = 0; side < 2; side++) {
      if (!startRegs.includes(G.links[1 - side])) continue;
      best[G.k * 2 + side] = dist(fx, fy, G.x, G.y);
    }
  }
  let goal = -1, goalCost = Infinity;
  for (;;) {
    let s = -1, bv = Infinity;
    for (let k = 0; k < n * 2; k++) if (!done[k] && best[k] < bv) { bv = best[k]; s = k; }
    if (s < 0 || bv >= goalCost) break;
    done[s] = 1;
    const G = gates[s >> 1], out = G.links[s & 1];
    if (goalRegs.includes(out)) { const c = bv + dist(G.x, G.y, gx, gy); if (c < goalCost) { goalCost = c; goal = s; } }
    for (const H of gates) {
      if (H.k === G.k || !(access & (1 << H.k)) || H.k === fg || H.k === tg) continue;
      for (let side = 0; side < 2; side++) {
        if (H.links[1 - side] !== out) continue;
        const t = H.k * 2 + side, c = bv + dist(G.x, G.y, H.x, H.y);
        if (c < best[t]) { best[t] = c; prevS[t] = s; }
      }
    }
  }
  if (goal < 0) return null;
  const route = [];
  for (let s = goal; s >= 0; s = prevS[s]) route.push(s >> 1);
  return route.reverse();
}
// A* on 8 neighbours inside the regions, through the pass roads in `allow` only
function astar(w, from, to, allow) {
  const cost = tileCosts(w), reg = w.map.reg;
  const run = ++PF.run;
  PF.n = 0;
  const gx = to % N, gy = (to / N) | 0;
  const G = PF.g, F = PF.f, FROM = PF.from, STAMP = PF.stamp, CLOSED = PF.closed;
  G[from] = 0; STAMP[from] = run; FROM[from] = -1;
  F[from] = octile(from % N, (from / N) | 0, gx, gy);
  heapPush(from);
  let found = false, expanded = 0;
  while (PF.n > 0) {
    const i = heapPop();
    if (CLOSED[i] === run) continue;
    CLOSED[i] = run;
    if (i === to) { found = true; break; }
    expanded++;
    const x = i % N, y = (i / N) | 0;
    const gi = G[i];
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      const c = cost[j];
      if (c === Infinity) continue;
      const rj = reg[j];
      if (rj >= 100 && rj < 255 && !(allow & (1 << (rj - 100)))) continue;
      if (d >= 4 && (cost[y * N + nx] === Infinity || cost[ny * N + x] === Infinity)) continue;
      const ng = gi + DD[d] * c;
      if (STAMP[j] === run && ng >= G[j]) continue;
      STAMP[j] = run; G[j] = ng; FROM[j] = i;
      // slightly weighted heuristic: much faster, paths stay within a few percent of the best
      F[j] = ng + octile(nx, ny, gx, gy) * 1.15;
      heapPush(j);
    }
  }
  PF.expanded += expanded;
  if (!found) return null;
  const path = [];
  for (let i = to; i >= 0; i = FROM[i]) path.push(i);
  path.reverse();
  return path;
}
const DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);
const DD = new Float32Array([1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142]);
function octile(x, y, gx, gy) { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx; }
// per-tile movement cost as a typed array (built once per map)
function tileCosts(w) {
  if (w.map.cost) return w.map.cost;
  const c = new Float32Array(N2);
  for (let i = 0; i < N2; i++) c[i] = TERRAIN[w.map.ter[i]].cost;
  w.map.cost = c;
  return c;
}
// movement cost of a whole path (game minutes at speed 1 tile/min)
function pathCost(w, path) {
  const cost = tileCosts(w);
  let c = 0;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    c += (a % N !== b % N && ((a / N) | 0) !== ((b / N) | 0) ? 1.4142 : 1) * cost[b];
  }
  return c;
}

// ================================================================ occupancy and spatial buckets
// occ[i]: 0 empty, 1 + govId for a city, 10001 + campId, 20001 + nodeId, 30001 + landmarkId
const OCC_CITY = 1, OCC_CAMP = 10001, OCC_NODE = 20001, OCC_MARK = 30001;
function occKind(v) { return v >= OCC_MARK ? 'mark' : v >= OCC_NODE ? 'node' : v >= OCC_CAMP ? 'camp' : v >= OCC_CITY ? 'city' : null; }
const BUCKET = 12;
const BN = N / BUCKET;
function bucketOf(x, y) { return ((y / BUCKET) | 0) * BN + ((x / BUCKET) | 0); }
function rebuildBuckets(w) {
  w._buckets = Array.from({ length: BN * BN }, () => []);
  for (const g of w.govs) w._buckets[bucketOf(g.x, g.y)].push(g.id);
}
function bucketMove(w, g, ox, oy) {
  if (!w._buckets) return;
  const a = w._buckets[bucketOf(ox, oy)];
  const k = a.indexOf(g.id);
  if (k >= 0) a.splice(k, 1);
  w._buckets[bucketOf(g.x, g.y)].push(g.id);
}
// governor ids whose city lies within r tiles of (x, y)
function govsNear(w, x, y, r) {
  if (!w._buckets) rebuildBuckets(w);
  const out = [];
  const b0x = Math.max(0, ((x - r) / BUCKET) | 0), b1x = Math.min(BN - 1, ((x + r) / BUCKET) | 0);
  const b0y = Math.max(0, ((y - r) / BUCKET) | 0), b1y = Math.min(BN - 1, ((y + r) / BUCKET) | 0);
  for (let by = b0y; by <= b1y; by++) for (let bx = b0x; bx <= b1x; bx++) {
    for (const id of w._buckets[by * BN + bx]) { const g = w.govs[id]; if (dist(g.x, g.y, x, y) <= r) out.push(id); }
  }
  return out;
}
// a random free, passable tile near (x, y) that is not next to a landmark; null if none within maxR
function freeTileNear(w, x, y, maxR, rng, opts = {}) {
  const r0 = opts.minR || 0;
  for (let attempt = 0; attempt < 400; attempt++) {
    const r = r0 + (maxR - r0) * Math.sqrt(rng());
    const a = rng() * Math.PI * 2;
    const nx = Math.round(x + Math.cos(a) * r), ny = Math.round(y + Math.sin(a) * r);
    if (!inMap(nx, ny) || nx < 2 || ny < 2 || nx > N - 3 || ny > N - 3) continue;
    const i = idx(nx, ny);
    const t = w.map.ter[i];
    if (TERRAIN[t].cost === Infinity || t === T.ford || t === T.pass || t === T.gate) continue;
    if (w.map.occ[i]) continue;
    if (opts.region != null && w.map.reg[i] !== opts.region) continue;
    if (opts.zone && w.map.reg[i] < 100 && zoneOfRegion(w.map.reg[i]) !== opts.zone) continue;
    if (opts.nearWall && wallNear(w, nx, ny, opts.nearWall)) continue;
    if (opts.prefer && attempt < 200 && t !== opts.prefer && rng() < 0.6) continue;
    let crowded = false;
    for (let dy = -1; dy <= 1 && !crowded; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = idx(clamp(nx + dx, 0, N - 1), clamp(ny + dy, 0, N - 1));
      if (w.map.occ[j] >= OCC_MARK || (opts.spread && w.map.occ[j] && occKind(w.map.occ[j]) === 'city')) { crowded = true; break; }
    }
    if (crowded) continue;
    if (opts.awayFromMarks && w.marks.some(m => dist(m.x, m.y, nx, ny) < opts.awayFromMarks)) continue;
    return [nx, ny];
  }
  return null;
}

// is a mountain range or a pass road within r tiles?
function wallNear(w, x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (inMap(nx, ny) && w.map.wall[idx(nx, ny)]) return true;
  }
  return false;
}

// ================================================================ vision
// marks a disc of radius r around (x, y) with value v in a Uint8Array mask (max of old and v)
function stampDisc(mask, x, y, r, v) {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= N) continue;
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const xx = x + dx;
      if (xx < 0 || xx >= N) continue;
      const i = yy * N + xx;
      if (mask[i] < v) mask[i] = v;
    }
  }
}
// run-length encoding for 0/1 masks so the explored map stays small in saves
function rleEncode(mask) {
  const out = [];
  let cur = mask[0] ? 1 : 0, run = 0;
  out.push(cur);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 1 : 0;
    if (v === cur) run++; else { out.push(run); cur = v; run = 1; }
  }
  out.push(run);
  return out.join('.');
}
function rleDecode(s, n) {
  const out = new Uint8Array(n);
  if (typeof s !== 'string' || !s) return out;
  const parts = s.split('.').map(Number);
  let v = parts[0] ? 1 : 0, p = 0;
  for (let k = 1; k < parts.length && p < n; k++) {
    const run = Math.max(0, Math.floor(parts[k]) || 0);
    if (v) out.fill(1, p, Math.min(n, p + run));
    p += run;
    v = 1 - v;
  }
  return out;
}
