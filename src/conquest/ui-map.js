/* Age of Conquest map: a canvas world map of the whole kingdom with pan and pinch zoom. The terrain is painted
   in chunks of 32 by 32 tiles as they come into view (a lighter painting of the whole kingdom stands in when
   zoomed out); guild territory is a tinted layer with drawn borders; unexplored land lies under clouds and
   explored land out of sight is dimmed. Tapping a tile opens what you know about it and what you can do. */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, setText } = U;
const N = A.MAP_N;
const TILE = 16;      // pixels per tile in a painted chunk
const CH = 32;        // tiles per side of a chunk
const OV = 4;         // pixels per tile in the painting of the whole kingdom
const CHUNK_Z = 5.5;  // from this zoom the chunks are drawn
const SPRITE_Z = 7;   // from this zoom, castles, camps, fields and armies are drawn as pictures
const MAX_CHUNKS = 48;

const M = {
  cv: null, ctx: null, w: 0, h: 0, dpr: 1, view: { cx: N / 2, cy: N / 2, z: 6 }, seed: -1, base: null, overview: null, chunks: new Map(),
  terrFill: null, terrPaths: null, terrVer: -1, fogLayer: null, fogVer: -1, cloud: null, showTerritory: true, dirty: true, raf: 0,
  pointers: new Map(), drag: null, sel: null, homed: false, lastDraw: 0, where: '',
};
const ZMIN = 0.9, ZMAX = 40;

// ================================================================ layers
function hashTile(i) { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; return (h & 1023) / 1023; }
const TID = A.TERRAIN.map(t => t.id);
const ter = () => U.S.ter;
const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : ter()[y * N + x]);
const wet = t => TID[t] === 'water' || TID[t] === 'river';
// one pixel per tile: the ground colour, varied a little from tile to tile
function buildBase() {
  const T0 = ter();
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const col = A.TERRAIN.map(t => { const n = parseInt(t.color.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; });
  for (let i = 0; i < N * N; i++) {
    const [r, gg, b] = col[T0[i]], k = 0.9 + hashTile(i) * 0.18;
    img.data[i * 4] = Math.min(255, r * k); img.data[i * 4 + 1] = Math.min(255, gg * k); img.data[i * 4 + 2] = Math.min(255, b * k); img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  M.base = c;
}
// the whole kingdom at OV pixels per tile, for the zoomed-out views
function buildOverview() {
  const T0 = ter();
  const c = document.createElement('canvas');
  c.width = c.height = N * OV;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(M.base, 0, 0, N * OV, N * OV);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, id = TID[T0[i]], r = hashTile(i);
    const px = x * OV, py = y * OV;
    if (id === 'forest' && r > 0.35) { g.fillStyle = r > 0.7 ? '#1f3a1f' : '#284826'; g.beginPath(); g.arc(px + OV / 2, py + OV / 2, OV * 0.42, 0, 7); g.fill(); }
    else if (id === 'mountain') {
      g.fillStyle = '#3e3834'; g.beginPath(); g.moveTo(px - 1, py + OV); g.lineTo(px + OV / 2, py - OV * 0.7); g.lineTo(px + OV + 1, py + OV); g.closePath(); g.fill();
      g.fillStyle = '#6d645d'; g.beginPath(); g.moveTo(px - 1, py + OV); g.lineTo(px + OV / 2, py - OV * 0.7); g.lineTo(px + OV * 0.45, py + OV); g.closePath(); g.fill();
      if (r > 0.4) { g.fillStyle = '#e4e8ec'; g.beginPath(); g.moveTo(px + OV * 0.3, py); g.lineTo(px + OV / 2, py - OV * 0.7); g.lineTo(px + OV * 0.7, py); g.closePath(); g.fill(); }
    } else if (id === 'gate') { g.fillStyle = '#c8b48a'; g.fillRect(px + 1, py + 1, OV - 2, OV - 2); }
    else if (id === 'hills' && r > 0.5) { g.fillStyle = 'rgba(60,44,26,.35)'; g.beginPath(); g.arc(px + OV / 2, py + OV * 0.7, OV * 0.45, Math.PI, 0); g.fill(); }
  }
  M.overview = c;
}
// one chunk of painted terrain: shores, ripples, grass, hills, snow, roads, then trees and peaks back to front
function paintChunk(cx, cy) {
  const T0 = ter();
  const c = document.createElement('canvas');
  c.width = c.height = CH * TILE;
  const g = c.getContext('2d');
  const X0 = cx * CH, Y0 = cy * CH;
  g.translate(-X0 * TILE, -Y0 * TILE);
  const sx0 = Math.max(0, X0 - 1), sy0 = Math.max(0, Y0 - 1), sx1 = Math.min(N, X0 + CH + 1), sy1 = Math.min(N, Y0 + CH + 1);
  g.imageSmoothingEnabled = false;
  g.drawImage(M.base, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 * TILE, sy0 * TILE, (sx1 - sx0) * TILE, (sy1 - sy0) * TILE);
  g.globalAlpha = 0.55; g.imageSmoothingEnabled = true;
  g.drawImage(M.base, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 * TILE, sy0 * TILE, (sx1 - sx0) * TILE, (sy1 - sy0) * TILE);
  g.globalAlpha = 1;
  const xa = Math.max(0, X0 - 1), xb = Math.min(N - 1, X0 + CH), ya = Math.max(0, Y0 - 1), yb = Math.min(N - 1, Y0 + CH + 1);
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const i = y * N + x, t = T0[i], id = TID[t], r = hashTile(i), r2 = hashTile(i + 7777);
    const px = x * TILE, py = y * TILE;
    if (wet(t)) {
      g.fillStyle = 'rgba(214,196,150,.55)';
      if (at(x, y - 1) >= 0 && !wet(at(x, y - 1))) g.fillRect(px, py, TILE, 2);
      if (at(x, y + 1) >= 0 && !wet(at(x, y + 1))) g.fillRect(px, py + TILE - 2, TILE, 2);
      if (at(x - 1, y) >= 0 && !wet(at(x - 1, y))) g.fillRect(px, py, 2, TILE);
      if (at(x + 1, y) >= 0 && !wet(at(x + 1, y))) g.fillRect(px + TILE - 2, py, 2, TILE);
      if (r > 0.45) { g.strokeStyle = 'rgba(170,210,235,.28)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px + 3, py + 8 + r2 * 3); g.quadraticCurveTo(px + 8, py + 5 + r2 * 3, px + 13, py + 8 + r2 * 3); g.stroke(); }
    } else if (id === 'plains') {
      if (r > 0.55) { g.strokeStyle = 'rgba(120,140,70,.55)'; g.lineWidth = 1; g.beginPath(); for (let k = 0; k < 3; k++) { const gx = px + 3 + r2 * 9 + k * 2, gy = py + 6 + r * 7; g.moveTo(gx, gy); g.lineTo(gx + (k - 1) * 1.2, gy - 3); } g.stroke(); }
      if (r2 > 0.93) { g.fillStyle = '#d9c25a'; g.fillRect(px + r * 12 + 2, py + r2 * 10 + 2, 2, 2); }
    } else if (id === 'hills') {
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(px + 9, py + 12, 7, 3, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(150,125,85,.6)'; g.beginPath(); g.ellipse(px + 7 + r * 2, py + 10, 6, 4.5, 0, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(80,64,40,.5)'; g.beginPath(); g.ellipse(px + 9 + r * 2, py + 10, 3.5, 3, 0, Math.PI * 1.5, 0); g.lineTo(px + 9 + r * 2, py + 10); g.fill();
    } else if (id === 'snow') {
      g.fillStyle = 'rgba(240,244,248,.7)'; g.fillRect(px + r * 12 + 1, py + r2 * 12 + 1, 3, 2); g.fillRect(px + r2 * 10 + 3, py + r * 9 + 4, 2, 2);
    } else if (id === 'ford') {
      g.fillStyle = '#b8b2a2'; for (const [a1, b1] of [[3, 5], [8, 8], [12, 11]]) { g.beginPath(); g.ellipse(px + a1, py + b1, 2.4, 1.6, 0, 0, 7); g.fill(); }
    } else if (id === 'pass') {
      g.fillStyle = 'rgba(200,180,140,.7)'; for (let k = 0; k < 4; k++) g.fillRect(px + 2 + k * 4, py + 7 + Math.sin(k + r * 6) * 2, 2, 2);
    } else if (id === 'gate') {
      // the paved road through a pass
      g.fillStyle = '#a8946e'; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = 'rgba(70,52,30,.35)'; for (let k = 0; k < 4; k++) for (let q = 0; q < 4; q++) if ((k + q + (r > 0.5 ? 1 : 0)) % 2) g.fillRect(px + k * 4, py + q * 4, 3, 3);
    }
  }
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const i = y * N + x, id = TID[T0[i]], r = hashTile(i), r2 = hashTile(i + 991);
    const px = x * TILE, py = y * TILE;
    if (id === 'forest') {
      const n = r > 0.5 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const fx = px + 3 + ((r * 7 + k * 5.3) % 10), fy = py + 6 + ((r2 * 5 + k * 3.7) % 9);
        if (U.art) (r2 > 0.8 && k === 1 ? U.art.oak : U.art.pine)(g, fx, fy, 0.42 + r * 0.12);
      }
    } else if (id === 'mountain') {
      const w = TILE * (1.1 + r * 0.4), h = TILE * (1.1 + r2 * 0.5), bx = px + TILE / 2 + (r - 0.5) * 4, by = py + TILE - 1;
      g.fillStyle = '#5d5550'; g.beginPath(); g.moveTo(bx - w / 2, by); g.lineTo(bx - w * 0.05, by - h); g.lineTo(bx + w / 2, by); g.closePath(); g.fill();
      g.fillStyle = '#3c3632'; g.beginPath(); g.moveTo(bx - w * 0.05, by - h); g.lineTo(bx + w / 2, by); g.lineTo(bx + w * 0.08, by); g.closePath(); g.fill();
      if (r2 > 0.35) { g.fillStyle = '#e4e8ec'; g.beginPath(); g.moveTo(bx - w * 0.2, by - h * 0.62); g.lineTo(bx - w * 0.05, by - h); g.lineTo(bx + w * 0.14, by - h * 0.6); g.lineTo(bx, by - h * 0.68); g.closePath(); g.fill(); }
    }
  }
  return c;
}
// a chunk from the cache (most recently used kept), painting at most `budget.n` new ones per frame
function chunkAt(cx, cy, budget) {
  const key = cy * 64 + cx;
  let c = M.chunks.get(key);
  if (c) { M.chunks.delete(key); M.chunks.set(key, c); return c; }
  if (budget.n <= 0) { budget.missing = true; return null; }
  budget.n--;
  c = paintChunk(cx, cy);
  M.chunks.set(key, c);
  while (M.chunks.size > MAX_CHUNKS) M.chunks.delete(M.chunks.keys().next().value);
  return c;
}
function newSeed() {
  M.seed = U.S.seed; M.chunks.clear();
  buildBase(); buildOverview(); buildRanges();
  // soft value noise for the clouds over unexplored land (two octaves, FR pixels per tile)
  const W = N * FR;
  M.cloud = new Float32Array(W * W);
  let h = (U.S.seed * 2654435761) >>> 0;
  for (const [cells, amp] of [[24, 0.7], [96, 0.3]]) {
    const gsz = cells + 1, grid = new Float32Array(gsz * gsz);
    for (let i = 0; i < grid.length; i++) { h = (h * 1664525 + 1013904223) >>> 0; grid[i] = h / 4294967296; }
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const fx = x / W * cells, fy = y / W * cells, x0 = fx | 0, y0 = fy | 0, kx = fx - x0, ky = fy - y0;
      const a = grid[y0 * gsz + x0], b = grid[y0 * gsz + x0 + 1], c = grid[(y0 + 1) * gsz + x0], d = grid[(y0 + 1) * gsz + x0 + 1];
      const sx = kx * kx * (3 - 2 * kx), sy = ky * ky * (3 - 2 * ky);
      M.cloud[y * W + x] += ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy) * amp;
    }
  }
  M.fogVer = -1;
}
// guild territory: a tint per tile, and the borders as one path per guild (drawn as lines at any zoom)
function buildTerritory() {
  const terr = U.S.terr;
  if (!terr || !U.F) return;
  const c = M.terrFill || document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const cols = U.F.guilds.map(gd => { const n = parseInt(gd.color.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; });
  const paths = U.F.guilds.map(() => new Path2D());
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x, v = terr[i];
      if (v) { const [r, gg, b] = cols[v - 1]; img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 62; }
    }
  }
  g.putImageData(img, 0, 0);
  // borders: runs of tile edges where the owner changes, merged along each row and column
  for (let y = 0; y <= N; y++) {
    let run = -1, owner = 0;
    for (let x = 0; x <= N; x++) {
      const a = y > 0 && x < N ? terr[(y - 1) * N + x] : 0, b = y < N && x < N ? terr[y * N + x] : 0;
      const o = a !== b ? (b || a) : 0;
      if (o !== owner) { if (owner) { paths[owner - 1].moveTo(run, y); paths[owner - 1].lineTo(x, y); } owner = o; run = x; }
    }
  }
  for (let x = 0; x <= N; x++) {
    let run = -1, owner = 0;
    for (let y = 0; y <= N; y++) {
      const a = x > 0 && y < N ? terr[y * N + x - 1] : 0, b = x < N && y < N ? terr[y * N + x] : 0;
      const o = a !== b ? (b || a) : 0;
      if (o !== owner) { if (owner) { paths[owner - 1].moveTo(x, run); paths[owner - 1].lineTo(x, y); } owner = o; run = y; }
    }
  }
  M.terrFill = c;
  M.terrPaths = paths;
  M.terrVer = U.S.terrVer;
}
// fog of war: clouds over unexplored land, a dark veil over explored land out of sight. Both masks are blurred
// so the edges are soft, and the clouds' edges are frayed by noise.
function blur3(a) {
  const t = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; t[i] = (a[i - (x > 0 ? 1 : 0)] + a[i] + a[i + (x < N - 1 ? 1 : 0)]) / 3; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; a[i] = (t[i - (y > 0 ? N : 0)] + t[i] + t[i + (y < N - 1 ? N : 0)]) / 3; }
  return a;
}
const FR = 2;   // fog pixels per tile
function buildFog() {
  const fog = U.S.fog;
  if (!fog || !M.cloud) return;
  const c = M.fogLayer || document.createElement('canvas');
  const W = N * FR;
  c.width = c.height = W;
  const g = c.getContext('2d');
  const img = g.createImageData(W, W);
  const cl = new Float32Array(N * N), veil = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) { cl[i] = fog[i] === 0 ? 1 : 0; veil[i] = fog[i] === 1 ? 1 : 0; }
  blur3(blur3(cl)); blur3(veil);
  // bilinear samples of the tile masks at FR pixels per tile, frayed by the cloud noise
  const lerp2 = (a, u, v) => {
    const x0 = Math.max(0, Math.min(N - 2, Math.floor(u))), y0 = Math.max(0, Math.min(N - 2, Math.floor(v))), kx = Math.max(0, Math.min(1, u - x0)), ky = Math.max(0, Math.min(1, v - y0));
    const i = y0 * N + x0;
    return (a[i] * (1 - kx) + a[i + 1] * kx) * (1 - ky) + (a[i + N] * (1 - kx) + a[i + N + 1] * kx) * ky;
  };
  const d = img.data;
  for (let Y = 0; Y < W; Y++) {
    const v = (Y + 0.5) / FR - 0.5;
    for (let X = 0; X < W; X++) {
      const u = (X + 0.5) / FR - 0.5, p = (Y * W + X) * 4;
      const ci = lerp2(cl, u, v);
      if (ci < 0.005 && veil[((v + 0.5) | 0) * N + ((u + 0.5) | 0)] < 0.005) continue;
      const k = M.cloud[Y * W + X];
      const a = Math.min(1, Math.max(0, ci * 1.5 - (1 - k) * 0.5));
      const ve = lerp2(veil, u, v);
      if (a > 0.01) {
        d[p] = 150 + k * 82; d[p + 1] = 166 + k * 74; d[p + 2] = 186 + k * 62;
        d[p + 3] = Math.round(255 * Math.max(a * 0.92, ve * 0.38));
      } else if (ve > 0.01) { d[p] = 8; d[p + 1] = 14; d[p + 2] = 26; d[p + 3] = Math.round(97 * ve); }
    }
  }
  g.putImageData(img, 0, 0);
  M.fogLayer = c;
  M.fogVer = U.S.visVer;
}
// the mountain ranges and pass roads, drawn over the clouds when zoomed out: everyone knows the lie of the kingdom
function buildRanges() {
  const k = U.S.kingdom;
  const c = document.createElement('canvas');
  c.width = c.height = N * OV;
  const g = c.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, v = k.wall[i];
    if (!v) continue;
    const px = x * OV, py = y * OV, r = hashTile(i);
    if (v === 2) { g.fillStyle = '#e9d29a'; g.fillRect(px, py, OV, OV); continue; }
    g.fillStyle = '#3e3834'; g.beginPath(); g.moveTo(px - 2, py + OV); g.lineTo(px + OV / 2, py - OV); g.lineTo(px + OV + 2, py + OV); g.closePath(); g.fill();
    g.fillStyle = '#7a716a'; g.beginPath(); g.moveTo(px - 2, py + OV); g.lineTo(px + OV / 2, py - OV); g.lineTo(px + OV * 0.45, py + OV); g.closePath(); g.fill();
    if (r > 0.3) { g.fillStyle = '#eef2f5'; g.beginPath(); g.moveTo(px + OV * 0.25, py - OV * 0.15); g.lineTo(px + OV / 2, py - OV); g.lineTo(px + OV * 0.75, py - OV * 0.15); g.closePath(); g.fill(); }
  }
  M.ranges = c;
}

// ================================================================ drawing
function resize() {
  const r = M.cv.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  // reallocate only when the size really changed (iOS drops canvases that are resized too often)
  if (w === M.w && h === M.h && dpr === M.dpr) return;
  M.w = w; M.h = h; M.dpr = dpr;
  M.cv.width = Math.round(w * dpr); M.cv.height = Math.round(h * dpr);
  M.cv.style.width = w + 'px'; M.cv.style.height = h + 'px';
  M.dirty = true;
}
const toScreen = (x, y) => [M.w / 2 + (x - M.view.cx) * M.view.z, M.h / 2 + (y - M.view.cy) * M.view.z];
const toTile = (sx, sy) => [M.view.cx + (sx - M.w / 2) / M.view.z, M.view.cy + (sy - M.h / 2) / M.view.z];
function clampView() {
  const v = M.view;
  v.z = Math.max(ZMIN, Math.min(ZMAX, v.z));
  v.cx = Math.max(0, Math.min(N, v.cx));
  v.cy = Math.max(0, Math.min(N, v.cy));
}
function draw() {
  M.raf = 0;
  const f = U.F;
  if (!M.ctx || !f || !U.S.ter) return;
  const t0 = performance.now();
  if (M.seed !== U.S.seed) newSeed();
  if (M.terrVer !== U.S.terrVer) buildTerritory();
  if (M.fogVer !== U.S.visVer) buildFog();
  const g = M.ctx, z = M.view.z;
  M.placed = [];
  g.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
  g.fillStyle = '#0b1626';
  g.fillRect(0, 0, M.w, M.h);
  const [ox, oy] = toScreen(0, 0);
  // terrain: the kingdom painting when zoomed out, the detailed chunks in view when zoomed in
  const budget = { n: 4, missing: false };
  if (z < CHUNK_Z) { g.imageSmoothingEnabled = true; g.drawImage(M.overview, ox, oy, N * z, N * z); }
  else {
    const [tx0, ty0] = toTile(0, 0), [tx1, ty1] = toTile(M.w, M.h);
    const c0 = Math.max(0, Math.floor(tx0 / CH)), c1 = Math.min(N / CH - 1, Math.floor(tx1 / CH)), r0 = Math.max(0, Math.floor(ty0 / CH)), r1 = Math.min(N / CH - 1, Math.floor(ty1 / CH));
    g.imageSmoothingEnabled = z < TILE;
    // nearest chunks first, so the middle of the screen fills in before the edges
    const order = [];
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) order.push([cx, cy, Math.hypot(cx * CH + CH / 2 - M.view.cx, cy * CH + CH / 2 - M.view.cy)]);
    order.sort((a, b) => a[2] - b[2]);
    for (const [cx, cy] of order) {
      const c = chunkAt(cx, cy, budget);
      const sx = Math.floor(ox + cx * CH * z), sy = Math.floor(oy + cy * CH * z), ex = Math.ceil(ox + (cx + 1) * CH * z), ey = Math.ceil(oy + (cy + 1) * CH * z);
      if (c) g.drawImage(c, sx, sy, ex - sx, ey - sy);
      else { g.imageSmoothingEnabled = true; g.drawImage(M.overview, cx * CH * OV, cy * CH * OV, CH * OV, CH * OV, sx, sy, ex - sx, ey - sy); g.imageSmoothingEnabled = z < TILE; }
    }
  }
  if (M.showTerritory && M.terrFill) {
    g.imageSmoothingEnabled = false;
    g.drawImage(M.terrFill, ox, oy, N * z, N * z);
    g.save();
    g.setTransform(M.dpr * z, 0, 0, M.dpr * z, M.dpr * ox, M.dpr * oy);
    g.lineWidth = Math.max(1, Math.min(2.4, z * 0.16)) / z;
    f.guilds.forEach((gd, k) => { if (M.terrPaths[k]) { g.strokeStyle = gd.color + 'd8'; g.stroke(M.terrPaths[k]); } });
    g.restore();
  }
  const [x0, y0] = toTile(0, 0), [x1, y1] = toTile(M.w, M.h);
  const inView = (x, y, pad = 2) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
  const gcol = gi => (gi >= 0 ? f.guilds[gi].color : '#b8ada0');
  const P = f.player;
  const sprites = z >= SPRITE_Z && !!U.art;
  if (sprites) drawSprites(g, f, z, inView, gcol, P);
  else {
    // resource fields and camps (left out when the whole kingdom is in view)
    for (const n of z < 2.5 ? [] : f.nodes) {
      if (!inView(n.x, n.y)) continue;
      const [sx, sy] = toScreen(n.x + 0.5, n.y + 0.5);
      const r = Math.max(2, z * 0.28);
      g.fillStyle = { food: '#e8c46a', wood: '#a8723f', stone: '#9aa0a6', iron: '#7f95ad', gold: '#f0c94f' }[n.res];
      g.beginPath(); g.moveTo(sx, sy - r); g.lineTo(sx + r, sy); g.lineTo(sx, sy + r); g.lineTo(sx - r, sy); g.closePath(); g.fill();
      if (n.busy) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
    }
    for (const c of z < 2.5 ? [] : f.camps) {
      if (!inView(c.x, c.y)) continue;
      const [sx, sy] = toScreen(c.x + 0.5, c.y + 0.5);
      const r = Math.max(2.5, z * (c.fort ? 0.5 : 0.36));
      g.fillStyle = c.fort ? '#7a2b8f' : '#b4483a';
      if (c.fort) g.fillRect(sx - r, sy - r * 0.8, r * 2, r * 1.6);
      else { g.beginPath(); g.moveTo(sx, sy - r); g.lineTo(sx + r, sy + r * 0.8); g.lineTo(sx - r, sy + r * 0.8); g.closePath(); g.fill(); }
      if (z >= 11) { g.fillStyle = '#f3e5d6'; g.font = `600 ${Math.round(z * 0.45)}px Barlow, sans-serif`; g.textAlign = 'center'; g.fillText(String(c.lv), sx, sy + r * 0.75); }
    }
    // cities
    for (const c of U.S.cities.values()) {
      if (!inView(c.x, c.y)) continue;
      const [sx, sy] = toScreen(c.x + 0.5, c.y + 0.5);
      const mine = c.id === P.id;
      const col = mine ? '#f2c14e' : gcol(c.guild);
      const s = Math.max(z < 2 ? 1.8 : 2.5, z * (0.32 + Math.min(0.28, c.hall / 70)));
      if (z < 5) {
        g.fillStyle = col;
        g.fillRect(sx - s / 2, sy - s / 2, s, s);
      } else {
        const civ = A.CIV[c.civ];
        g.fillStyle = civ.stone;
        g.fillRect(sx - s * 0.7, sy - s * 0.2, s * 1.4, s * 0.9);
        g.fillStyle = civ.roof;
        g.beginPath(); g.moveTo(sx - s * 0.85, sy - s * 0.15); g.lineTo(sx, sy - s * 0.95); g.lineTo(sx + s * 0.85, sy - s * 0.15); g.closePath(); g.fill();
        g.fillStyle = col;
        g.fillRect(sx + s * 0.35, sy - s * 1.35, s * 0.42, s * 0.3);
        g.fillStyle = '#1c1712';
        g.fillRect(sx + s * 0.32, sy - s * 1.38, 1, s * 0.9);
      }
      if (c.shield) { g.strokeStyle = 'rgba(140,200,255,.85)'; g.lineWidth = 1.5; g.beginPath(); g.arc(sx, sy, s * 1.25, 0, Math.PI * 2); g.stroke(); }
      if (mine) { g.strokeStyle = '#f2c14e'; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, s * 1.6, 0, Math.PI * 2); g.stroke(); }
      if (z >= 16 || (mine && z >= 6)) {
        g.font = `600 ${Math.max(10, Math.round(z * 0.36))}px Barlow, sans-serif`;
        g.textAlign = 'center';
        const tag = c.guild >= 0 ? `[${f.guilds[c.guild].tag}] ` : '';
        const label = tag + c.name;
        g.fillStyle = 'rgba(0,0,0,.6)';
        const tw = g.measureText(label).width;
        g.fillRect(sx - tw / 2 - 3, sy + s + 2, tw + 6, Math.max(12, z * 0.42));
        g.fillStyle = mine ? '#f2c14e' : '#efe6da';
        g.fillText(label, sx, sy + s + Math.max(11, z * 0.38));
      }
    }
  }
  // fog of war over everything static, and the edge of the world
  if (M.fogLayer) { g.imageSmoothingEnabled = true; g.drawImage(M.fogLayer, ox, oy, N * z, N * z); }
  g.strokeStyle = 'rgba(143,216,255,.35)'; g.lineWidth = 2; g.strokeRect(ox - 1, oy - 1, N * z + 2, N * z + 2);
  if (z < CHUNK_Z && M.ranges) { g.globalAlpha = z < 3 ? 0.9 : 0.7; g.imageSmoothingEnabled = true; g.drawImage(M.ranges, ox, oy, N * z, N * z); g.globalAlpha = 1; }
  // passes, holy sites, the Capital and ruins stand above the clouds once they are known
  drawMarks(g, f, z, inView, sprites);
  if (z < CHUNK_Z) drawRegionNames(g, z);
  if (sprites) drawArmies(g, f, z, inView, gcol, P);
  else {
    // armies on the move (only those you can see)
    for (const m of f.marches) {
      if (!inView(m.x, m.y, 6) && !inView(m.tx, m.ty, 6)) continue;
      const [sx, sy] = toScreen(m.x + 0.5, m.y + 0.5);
      const hostile = !m.friend && m.target?.type === 'city' && m.target.id === P.id;
      const col = m.mine ? '#f2c14e' : m.friend ? '#86c27a' : hostile ? '#ff5a45' : gcol(m.guild);
      if (m.path && m.path.length > 1 && (m.mine || z >= 6)) {
        g.strokeStyle = col; g.globalAlpha = 0.55; g.lineWidth = m.mine ? 2 : 1;
        g.setLineDash(m.mine ? [5, 4] : [2, 4]);
        g.beginPath();
        g.moveTo(sx, sy);
        for (const i of m.path) { const [px, py] = toScreen((i % N) + 0.5, Math.floor(i / N) + 0.5); g.lineTo(px, py); }
        g.stroke();
        g.setLineDash([]); g.globalAlpha = 1;
      } else if (m.state !== 'gathering' && m.state !== 'waiting') {
        const [tx2, ty2] = toScreen(m.tx + 0.5, m.ty + 0.5);
        g.strokeStyle = col; g.globalAlpha = 0.4; g.lineWidth = 1;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx2, ty2); g.stroke(); g.globalAlpha = 1;
      }
      const r = Math.max(2.5, Math.min(z * 0.5, 2 + Math.log10(Math.max(10, Number(String(m.size).replace(/,/g, '')) || 10)) * (z / 9)));
      g.fillStyle = col;
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#120f0c'; g.lineWidth = 1; g.stroke();
      if (m.kind === 'scout') { g.fillStyle = '#120f0c'; g.beginPath(); g.arc(sx, sy, r * 0.4, 0, Math.PI * 2); g.fill(); }
    }
  }
  // battles flash where they happen
  for (const fi of f.fights || []) {
    if (!inView(fi.x, fi.y)) continue;
    const [sx, sy] = toScreen(fi.x + 0.5, fi.y + 0.5);
    if (U.art) U.art.clash(g, sx, sy - z * 0.3, Math.max(7, z * 0.9), performance.now());
  }
  // selection
  if (M.sel != null) {
    const [sx, sy] = toScreen(M.sel % N, Math.floor(M.sel / N));
    g.strokeStyle = '#f2c14e'; g.lineWidth = 2; g.strokeRect(sx, sy, z, z);
  }
  // where the middle of the screen is
  const cxi = Math.floor(M.view.cx), cyi = Math.floor(M.view.cy);
  if (cxi >= 0 && cyi >= 0 && cxi < N && cyi < N && M.whereEl) {
    const rg = regionOfTile(cxi, cyi);
    const where = rg >= 0 ? `${A.REGIONS[rg].name} · Zone ${A.REGIONS[rg].zone} · ${cxi}, ${cyi}` : `${cxi}, ${cyi}`;
    if (where !== M.where) { M.where = where; setText(M.whereEl, where); }
  }
  M.dirty = false;
  M.lastDraw = performance.now();
  M.ms = M.lastDraw - t0;
  if (budget.missing) schedule(16);
  // keep animating while armies move on screen
  if ((f.marches.length || (f.fights || []).length) && !document.hidden && U.current === 'map') schedule(sprites ? 90 : 120);
}
// the region of a tile from the kingdom map (the interface regenerates it from the seed); -1 on a range
function regionOfTile(x, y) {
  const r = U.S.kingdom?.reg[y * N + x];
  if (r == null || r === 255) return -1;
  return r < 100 ? r : U.S.kingdom.gates[r - 100].links[0];
}
// which painting stands for a landmark, a resource field
function markPaint(mk) {
  if (mk.kind === 'capital') return 'capital';
  if (mk.kind === 'pass') return 'pass';
  if (mk.kind === 'site') return mk.site === 'sanctum' ? 'sanctum' : mk.site === 'altar' ? 'altar' : 'shrine';
  return ['ruin', 'ruin-keep', 'ruin-legend'][mk.id % 3];
}
function fieldPaint(n) {
  if (n.res === 'food') return n.lv >= 3 ? 'field-food-2' : 'field-food';
  if (n.res === 'iron') return n.lv >= 3 ? 'field-iron-2' : 'field-iron';
  return 'field-' + n.res;
}
// zoomed out: the names of the ten regions over their lands
function drawRegionNames(g, z) {
  const big = z < 2.6;
  g.textAlign = 'center';
  g.lineJoin = 'round';
  A.REGIONS.forEach((r, k) => {
    const [x, y] = A.regionCenter(k);
    const [sx, sy] = toScreen(x, k === 9 ? y - 6 : y);
    if (sx < -120 || sy < -40 || sx > M.w + 120 || sy > M.h + 40) return;
    const fs = big ? Math.round(Math.max(13, Math.min(22, z * 13))) : 15;
    g.font = `400 ${fs}px "Lilita One", "Arial Black", sans-serif`;
    g.lineWidth = 4; g.strokeStyle = 'rgba(8,14,26,.8)'; g.strokeText(r.name, sx, sy);
    g.fillStyle = r.zone === 3 ? '#ffd862' : r.zone === 2 ? '#d6ecff' : '#f4efe4'; g.fillText(r.name, sx, sy);
    g.font = `700 ${Math.round(fs * 0.62)}px Barlow, sans-serif`;
    const sub = `Zone ${r.zone}`;
    g.lineWidth = 3; g.strokeText(sub, sx, sy + fs * 0.85);
    g.fillStyle = 'rgba(214,236,255,.9)'; g.fillText(sub, sx, sy + fs * 0.85);
  });
}
// passes, holy sites, the Capital and ruins below sprite zoom: their pictures shrunk, never smaller than an icon
function drawMarks(g, f, z, inView, near) {
  const ART = U.art;
  const labels = [];
  const list = f.marks.filter(mk => mk.known && inView(mk.x, mk.y, 6) && !(mk.kind === 'ruin' && z < 2.5)).sort((a, b) => a.y - b.y);
  for (const mk of list) {
    const [sx, sy] = toScreen(mk.x + 0.5, mk.y + 0.5);
    const col = mk.owner >= 0 ? f.guilds[mk.owner].color : null;
    if (ART) {
      const pn = markPaint(mk);
      const pw = mk.kind === 'capital' ? Math.max(30, z * 7) : mk.kind === 'pass' ? Math.max(20, z * 4) : mk.kind === 'site' ? Math.max(18, z * (mk.site === 'temple' ? 4.2 : 3.6)) : Math.max(14, z * 3);
      if (ART.paint(g, pn, sx, sy + Math.max(3, z * 0.55), pw)) {
        // the holder's banner over a pass, holy site or the Capital
        if (col && mk.kind !== 'ruin') ART.flag(g, sx + pw * 0.22, sy + Math.max(3, z * 0.55) - ART.paintH(pn, pw) * 0.8, col, Math.max(9, z * 0.9));
      } else if (mk.kind === 'capital') ART.put(g, ART.mapFort(col, true), sx, sy + Math.max(6, z * 0.5), 48, 66, Math.max(0.42, z * 3.6 / 60));
      else if (mk.kind === 'pass') ART.put(g, ART.mapPass(col, mk.tier), sx, sy + Math.max(4, z * 0.5), 48, 62, Math.max(0.3, z * (near ? 2.8 : 2.4) / 60));
      else if (mk.kind === 'site') ART.put(g, ART.mapSite(mk.site, col), sx, sy + Math.max(4, z * 0.5), 48, 70, Math.max(0.3, z * (near ? (mk.site === 'temple' ? 3 : 2.6) : 2.4) / 60));
      else ART.put(g, ART.mapRuin(), sx, sy + z * 0.3, 24, 36, Math.max(0.35, z * 1.6 / 36));
      if (mk.kind === 'pass' && z >= 2.2) {
        // level pips over a pass
        const top = sy + Math.max(3, z * 0.55) - (ART.painted(pn) ? ART.paintH(pn, pw) : pw * 1.1) - 4;
        for (let q = 0; q < mk.tier; q++) { const px = sx - (mk.tier - 1) * 5 + q * 10; g.fillStyle = '#ffd862'; g.strokeStyle = '#6a3e0c'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px, top - 5); g.lineTo(px + 4, top); g.lineTo(px, top + 5); g.lineTo(px - 4, top); g.closePath(); g.fill(); g.stroke(); }
      }
    }
    if (z >= 2.2 && (mk.kind !== 'ruin' || near)) labels.push({ pri: mk.kind === 'capital' ? 1e9 : mk.kind === 'pass' ? 1e8 + mk.tier : 1e7 + mk.level, x: sx, y: sy + Math.max(8, z * (mk.kind === 'capital' ? 1.5 : mk.kind === 'ruin' ? 0.8 : 1.1)), text: mk.name + (mk.owner >= 0 ? ` [${f.guilds[mk.owner].tag}]` : ''), col: col || (mk.kind === 'pass' ? '#d6ecff' : '#f4efe4') });
  }
  g.textAlign = 'center';
  g.font = `400 ${Math.round(Math.max(11, Math.min(15, z * 2.2)))}px "Lilita One", "Arial Black", sans-serif`;
  const placed = M.placed;
  labels.sort((a, b) => b.pri - a.pri);
  for (const l of labels) {
    const tw = g.measureText(l.text).width;
    const r = [l.x - tw / 2 - 4, l.y, l.x + tw / 2 + 4, l.y + 16];
    if (placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
    placed.push(r);
    g.lineWidth = 3; g.strokeStyle = 'rgba(8,14,26,.85)'; g.strokeText(l.text, l.x, l.y + 12);
    g.fillStyle = l.col; g.fillText(l.text, l.x, l.y + 12);
  }
}
// ---------------------------------------------------------------- pictures (zoomed in)
function drawSprites(g, f, z, inView, gcol, P) {
  const ART = U.art;
  const objs = [];
  const at = (x, y) => toScreen(x + 0.5, y + 0.5);
  for (const n of f.nodes) {
    if (!inView(n.x, n.y)) continue;
    const [sx, sy] = at(n.x, n.y), k = z * 1.3 / 34, pn = fieldPaint(n);
    objs.push({ y: n.y, f: () => { if (!ART.paint(g, pn, sx, sy + z * 0.55, z * 2.6)) ART.put(g, ART.mapField(n.res), sx, sy + z * 0.3, 24, 34, k); if (n.busy) ART.flag(g, sx + z * 0.35, sy + z * 0.2, '#efe6da', z * 0.7); } });
  }
  for (const c of f.camps) {
    if (!inView(c.x, c.y)) continue;
    const [sx, sy] = at(c.x, c.y), k = z * 1.4 / 34;
    objs.push({ y: c.y, f: () => {
      if (c.fort) { if (!ART.paint(g, 'bastion', sx, sy + z * 0.6, z * 3.4)) ART.put(g, ART.mapCamp(10), sx, sy + z * 0.3, 24, 36, k * 1.3); }
      else if (!ART.paint(g, c.lv <= 3 ? 'camp-1' : c.lv <= 7 ? 'camp-2' : 'camp-3', sx, sy + z * 0.55, z * (c.lv <= 7 ? 2.7 : 3))) ART.put(g, ART.mapCamp(c.lv), sx, sy + z * 0.3, 24, 36, k);
      if (z >= 9) { const r = Math.max(6, z * 0.26); g.fillStyle = '#5f1214'; g.beginPath(); g.arc(sx - z * 0.45, sy - z * 0.45, r, 0, 7); g.fill(); g.strokeStyle = '#e9b45e'; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#fff2dc'; g.font = `800 ${Math.round(r * 1.2)}px Barlow, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(c.lv), sx - z * 0.45, sy - z * 0.43); g.textBaseline = 'alphabetic'; }
    } });
  }
  const labels = [];
  for (const c of U.S.cities.values()) {
    if (!inView(c.x, c.y)) continue;
    const [sx, sy] = at(c.x, c.y);
    const mine = c.id === P.id;
    const col = c.guild >= 0 ? f.guilds[c.guild].color : null;
    const k = z / 20 * (0.85 + Math.min(0.4, c.hall / 50)), s = ART.mapCity(c.civ, col, c.hall, mine);
    const tier = c.hall >= 20 ? 3 : c.hall >= 13 ? 2 : c.hall >= 7 ? 1 : 0, pn = ['hall-3', 'hall-4', 'hall-6', 'hall-8'][tier];
    objs.push({ y: c.y, f: () => {
      // a ring in the guild's colour (gold for you) under the castle, and the guild's banner over it
      const rc = mine ? '#f2c14e' : col;
      const pw = z * (2.4 + tier * 0.35);
      if (rc) { g.strokeStyle = rc; g.lineWidth = mine ? 2.5 : 1.8; g.globalAlpha = mine ? 1 : 0.85; g.beginPath(); g.ellipse(sx, sy + z * 0.4, pw * 0.52, pw * 0.24, 0, 0, 7); g.stroke(); g.globalAlpha = 1; }
      if (ART.paint(g, pn, sx, sy + z * 0.5, pw)) { if (col) ART.flag(g, sx + pw * 0.28, sy + z * 0.5 - ART.paintH(pn, pw) * 0.62, col, Math.max(8, z * 0.75)); }
      else ART.put(g, s, sx, sy + z * 0.35, 32, 44, k);
      if (c.shield) { const r = ART.painted(pn) ? pw * 0.56 : z * 1.05; g.fillStyle = 'rgba(130,190,255,.16)'; g.strokeStyle = 'rgba(160,210,255,.7)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(sx, sy + z * 0.4, r, r * 0.95, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); }
    } });
    if (z >= 12 || mine) labels.push({ pri: mine ? 1e9 : c.hall, x: sx, y: sy + z * 0.55, text: (c.guild >= 0 ? `[${f.guilds[c.guild].tag}] ` : '') + c.name, col: mine ? '#f2c14e' : '#efe6da', font: `700 ${Math.max(10, Math.round(Math.min(14, z * 0.34)))}px Barlow, sans-serif` });
  }
  objs.sort((a, b) => a.y - b.y);
  for (const o of objs) o.f();
  // name plates, most important first; one that would cover another is left out
  g.textAlign = 'center';
  const placed = M.placed;
  labels.sort((a, b) => b.pri - a.pri);
  for (const l of labels) {
    g.font = l.font;
    const tw = g.measureText(l.text).width;
    const r = [l.x - tw / 2 - 5, l.y, l.x + tw / 2 + 5, l.y + 19];
    if (placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
    placed.push(r);
    g.fillStyle = 'rgba(10,7,5,.72)';
    g.fillRect(l.x - tw / 2 - 4, l.y + 2, tw + 8, 15);
    g.fillStyle = l.col; g.fillText(l.text, l.x, l.y + 14);
  }
}
function drawArmies(g, f, z, inView, gcol, P) {
  const ART = U.art;
  const now = performance.now();
  for (const m of f.marches) {
    if (!inView(m.x, m.y, 6) && !inView(m.tx, m.ty, 6)) continue;
    const [sx, sy] = toScreen(m.x + 0.5, m.y + 0.5);
    const hostile = !m.friend && m.target?.type === 'city' && m.target.id === P.id;
    const col = m.mine ? '#f2c14e' : m.friend ? '#86c27a' : hostile ? '#ff5a45' : gcol(m.guild);
    if (m.path && m.path.length > 1 && (m.mine || m.friend)) {
      g.strokeStyle = col; g.globalAlpha = 0.6; g.lineWidth = m.mine ? 2.5 : 1.5;
      g.setLineDash([6, 5]); g.lineDashOffset = -now / 60;
      g.beginPath(); g.moveTo(sx, sy);
      for (const i of m.path) { const [px, py] = toScreen((i % N) + 0.5, Math.floor(i / N) + 0.5); g.lineTo(px, py); }
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    } else if (m.state !== 'gathering' && m.state !== 'waiting') {
      const [tx2, ty2] = toScreen(m.tx + 0.5, m.ty + 0.5);
      g.strokeStyle = col; g.globalAlpha = 0.45; g.lineWidth = 1.2; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx2, ty2); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }
    if (m.state === 'gathering') continue;
    let type = m.kind === 'scout' ? 'cav' : 'inf';
    if (m.troops && m.kind !== 'scout') { let best = 0; for (const u of A.UNIT_KEYS) if ((m.troops[u] || 0) > best) { best = m.troops[u]; type = u; } }
    const nx = m.path && m.path.length ? (m.path[0] % N) : m.tx;
    const left = nx < m.x - 0.01;
    const frames = type === 'sie' ? 4 : 6;
    const pn = `${type}-walk-${1 + Math.floor(now / 140 + m.id) % frames}`;
    const pw = Math.max(14, z * (m.kind === 'scout' ? 1.1 : type === 'cav' || type === 'sie' ? 1.9 : 1.5));
    // a disc in the army's colour under its feet, then the soldier walking
    g.fillStyle = col; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(sx, sy + z * 0.2, pw * 0.42, pw * 0.16, 0, 0, 7); g.fill(); g.globalAlpha = 1;
    if (!ART.paint(g, pn, sx, sy + z * 0.2, pw, left)) {
      const frame = Math.floor(now / 260 + m.id) % 2;
      const s = ART.armyToken(type, col, frame);
      const k = Math.max(0.5, z * (m.kind === 'scout' ? 1.5 : 2.4) / 44);
      g.save(); g.translate(sx, sy + z * 0.2); if (left) g.scale(-1, 1);
      ART.put(g, s, 0, 0, 22, 32, k);
      g.restore();
    }
    if (m.kind !== 'scout') ART.flag(g, sx - pw * 0.35, sy + z * 0.2, col, Math.max(10, pw * 0.75), now / 300 + m.id);
    if (z >= 10 && m.size && m.kind !== 'scout') {
      const tx = typeof m.size === 'number' ? fmt(m.size) : String(m.size);
      g.font = `800 ${Math.round(Math.min(13, Math.max(10, z * 0.3)))}px Barlow, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(tx).width + 10, y = sy - z * 1.15;
      g.fillStyle = 'rgba(12,9,7,.85)'; g.beginPath(); g.roundRect ? g.roundRect(sx - tw / 2, y - 8, tw, 16, 8) : g.rect(sx - tw / 2, y - 8, tw, 16); g.fill();
      g.strokeStyle = col; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = '#fff4e0'; g.fillText(tx, sx, y + 0.5); g.textBaseline = 'alphabetic';
    }
  }
}
let later = 0;
function schedule(ms = 0) {
  if (ms > 0) { clearTimeout(later); later = setTimeout(() => request(), ms); return; }
  request();
}
function request() { if (!M.raf) M.raf = requestAnimationFrame(draw); }

// ================================================================ input
function mountMap(root) {
  root.innerHTML = `<div class="aoc-map">
    <canvas class="aoc-map-cv" aria-label="World map. Drag to move, pinch or use the buttons to zoom, tap a place to see it."></canvas>
    <div class="aoc-map-bottom"><div class="aoc-quest" hidden></div></div>
    <div class="aoc-map-where" aria-live="off"></div>
    <button type="button" class="aoc-map-ap" data-act="events" aria-label="Action points: open events"></button>
    <div class="aoc-map-tools">
      <button type="button" class="aoc-iconbtn" data-act="home" aria-label="Center on your city">${U.icon('home', 20)}</button>
      <button type="button" class="aoc-iconbtn" data-act="find" aria-label="Find passes, holy sites and the Capital">${U.icon('search', 20)}</button>
      <button type="button" class="aoc-iconbtn" data-act="kingdom" aria-label="See the whole kingdom">${U.icon('globe', 20)}</button>
      <button type="button" class="aoc-iconbtn" data-act="in" aria-label="Zoom in">${U.icon('plus', 20)}</button>
      <button type="button" class="aoc-iconbtn" data-act="out" aria-label="Zoom out">${U.icon('minus', 20)}</button>
      <button type="button" class="aoc-iconbtn" data-act="layers" aria-label="Show or hide guild territory" aria-pressed="true">${U.icon('layers', 20)}</button>
    </div>
    <div class="aoc-map-info" aria-live="polite"></div>
  </div>`;
  M.whereEl = root.querySelector('.aoc-map-where');
  M.cv = root.querySelector('canvas');
  M.ctx = M.cv.getContext('2d', { alpha: false });
  const ro = new ResizeObserver(() => { resize(); schedule(); });
  ro.observe(M.cv.parentElement);
  root.querySelector('.aoc-map-ap').addEventListener('click', () => U.openEvents('daily'));
  root.querySelector('.aoc-map-tools').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'home') home(true);
    if (a === 'find') findSheet();
    if (a === 'kingdom') { M.view.cx = N / 2; M.view.cy = N / 2; M.view.z = Math.max(ZMIN, Math.min(M.w, M.h) / N * 0.98); }
    if (a === 'in') { M.view.z *= 1.5; clampView(); }
    if (a === 'out') { M.view.z /= 1.5; clampView(); }
    if (a === 'layers') { M.showTerritory = !M.showTerritory; b.setAttribute('aria-pressed', String(M.showTerritory)); }
    schedule();
  });
  const cv = M.cv;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture?.(e.pointerId);
    M.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (M.pointers.size === 1) M.drag = { x: e.offsetX, y: e.offsetY, cx: M.view.cx, cy: M.view.cy, moved: 0, t: performance.now() };
    else if (M.pointers.size === 2) { const [a, b] = [...M.pointers.values()]; M.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: M.view.z }; if (M.drag) M.drag.moved = 99; }
  });
  cv.addEventListener('pointermove', e => {
    if (!M.pointers.has(e.pointerId)) return;
    M.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (M.pointers.size === 2 && M.pinch) {
      const [a, b] = [...M.pointers.values()];
      M.view.z = M.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, M.pinch.d);
      clampView(); schedule();
      return;
    }
    if (M.drag) {
      const dx = e.offsetX - M.drag.x, dy = e.offsetY - M.drag.y;
      M.drag.moved = Math.max(M.drag.moved, Math.abs(dx) + Math.abs(dy));
      M.view.cx = M.drag.cx - dx / M.view.z;
      M.view.cy = M.drag.cy - dy / M.view.z;
      clampView(); schedule();
    }
  });
  const end = e => {
    const wasTap = M.drag && M.drag.moved < 8 && M.pointers.size === 1;
    M.pointers.delete(e.pointerId);
    if (M.pointers.size < 2) M.pinch = null;
    if (wasTap && e.type === 'pointerup') {
      const [x, y] = toTile(e.offsetX, e.offsetY);
      if (x >= 0 && y >= 0 && x < N && y < N) openTile(Math.floor(y) * N + Math.floor(x));
    }
    if (!M.pointers.size) M.drag = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const [tx0, ty0] = toTile(e.offsetX, e.offsetY);
    M.view.z *= e.deltaY < 0 ? 1.15 : 1 / 1.15;
    clampView();
    // zoom toward the pointer
    const [tx1, ty1] = toTile(e.offsetX, e.offsetY);
    M.view.cx += tx0 - tx1; M.view.cy += ty0 - ty1;
    clampView(); schedule();
  }, { passive: false });
  cv.addEventListener('keydown', e => {
    const k = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key];
    if (k) { M.view.cx += k[0] * 8 / M.view.z * 4; M.view.cy += k[1] * 8 / M.view.z * 4; clampView(); schedule(); e.preventDefault(); }
    if (e.key === '+' || e.key === '=') { M.view.z *= 1.3; clampView(); schedule(); }
    if (e.key === '-') { M.view.z /= 1.3; clampView(); schedule(); }
  });
  cv.tabIndex = 0;
}
function home(zoom) {
  const P = U.F?.player;
  if (!P) return;
  M.view.cx = P.x + 0.5; M.view.cy = P.y + 0.5;
  if (zoom) M.view.z = Math.max(M.view.z, 12);
  schedule();
}
// a tile's centre in page coordinates while it is on screen (for the guide hand)
U.mapPoint = (x, y) => {
  if (!M.cv || U.current !== 'map') return null;
  const r = M.cv.getBoundingClientRect();
  const [sx, sy] = toScreen(x + 0.5, y + 0.5);
  if (sx < 10 || sy < 10 || sx > M.w - 10 || sy > M.h - 10) return null;
  return { x: r.left + sx, y: r.top + sy };
};
// for the tests: how long the last frame took and how many painted chunks are kept
U.map = { get ms() { return M.ms; }, get chunks() { return M.chunks.size; }, get z() { return M.view.z; } };
U.mapFocus = (x, y, z) => { M.view.cx = x + 0.5; M.view.cy = y + 0.5; if (z) M.view.z = z; clampView(); U.go('map'); schedule(); };

// ================================================================ claiming goals (from the banner over the city and the map)
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-claim]');
  if (!b || !b.closest('#aoc')) return;
  b.disabled = true;
  const r = await U.run({ type: 'claimQuest', id: b.dataset.claim });
  if (r) U.reward(r.reward, 'Goal reward');
  else b.disabled = false;
});

// ================================================================ tile sheet
// a picture of what stands on the tile, from the map's own sprites
// a painting for the sheet when there is one, else the drawn picture
function ppic(name, fallback) {
  const m = U.art?.pmeta(name);
  if (!m) return pic(fallback());
  const w = Math.min(200, m.w), h = Math.round(m.h * w / m.w);
  return `<img class="aoc-tile-pic" src="${m.src}" alt="" width="${w}" height="${h}">`;
}
function pic(c) {
  if (!c) return '';
  let src = '';
  try { src = c.toDataURL('image/png'); } catch (e) { return ''; }
  return `<img class="aoc-tile-pic" src="${src}" alt="" width="${c.sw * 1.5}" height="${c.sh * 1.5}">`;
}
U.openTile = i => openTile(i);
async function openTile(i) {
  M.sel = i; schedule();
  const t = await U.host.query('tile', { i });
  if (!t) return;
  const f = U.F, P = f.player;
  const parts = [];
  const acts = [];
  const terrInfo = `${esc(t.terrain)} · ${esc(t.region)}, Zone ${t.zone}${t.territory >= 0 ? ` · <span style="color:${f.guilds[t.territory].color}">${esc(f.guilds[t.territory].name)} territory</span>` : ''}`;
  let title = t.terrain;
  if (!t.explored) {
    title = 'Unexplored land';
    parts.push(`<p class="aoc-p">You have not seen this place. Send a scout to explore it; everything along its way comes into view.</p>`);
    acts.push({ label: 'Send a scout', icon: 'eye', onClick: () => sendScout(i) });
  } else if (t.city) {
    const c = t.city;
    title = c.name;
    const gd = c.guild >= 0 ? f.guilds[c.guild] : null;
    if (U.art) parts.push(ppic(['hall-3', 'hall-4', 'hall-6', 'hall-8'][c.hall >= 20 ? 3 : c.hall >= 13 ? 2 : c.hall >= 7 ? 1 : 0], () => U.art.mapCity(c.civ, gd?.color || null, c.hall, c.id === P.id)));
    parts.push(`<div class="aoc-who">${U.banner(gd, 40)}<div><b>${esc(c.name)}</b>${gd ? ` <span class="aoc-tag">[${esc(gd.tag)}]</span>` : ' <span class="aoc-muted">Independent</span>'}
      <div class="aoc-muted">${esc(c.civName)} · Town Hall ${c.hall} · ${fmt(c.power)} power${c.shield ? ' · <span class="aoc-blue">Shielded</span>' : ''}</div>
      ${c.role ? `<div class="aoc-muted">${esc(A.ROLE_NAME?.[c.role] || c.role)} of ${esc(c.guildName)}</div>` : ''}</div></div>`);
    if (c.intel) parts.push(`<div class="aoc-intel"><span class="aoc-kicker">Your intelligence · ${U.ago(c.intel.at)} · ${c.intel.acc}% accurate${c.intel.flagged ? ' · numbers look inconsistent' : ''}</span><div>${U.troopLine(c.intel.troops)}</div><div class="aoc-muted">Walls level ${c.intel.wall}</div></div>`);
    if (c.id === P.id) {
      parts.push('<p class="aoc-p">Your city.</p>');
      acts.push({ label: 'Open city', icon: 'city', onClick: () => U.go('city') });
    } else {
      acts.push({ label: 'Inspect', kind: 'ghost', icon: 'eye', onClick: () => U.inspect(c.id) });
      acts.push({ label: 'Scout', kind: 'ghost', icon: 'eye', onClick: () => sendScout(i) });
      const mate = P.guild >= 0 && c.guild === P.guild;
      if (!mate) {
        acts.push({ label: 'Attack', kind: 'red', icon: 'sword', onClick: () => U.marchSheet({ kind: 'attack', to: i, name: c.name, intel: c.intel }) });
        if (P.guild >= 0 && (P.role === 'leader' || P.role === 'officer' || P.b.hall >= 12)) acts.push({ label: 'Rally', kind: 'red', icon: 'flag', onClick: () => U.marchSheet({ kind: 'rally', to: i, name: c.name, intel: c.intel }) });
      }
    }
  } else if (t.camp && t.camp.fort) {
    title = `Barbarian fort, level ${t.camp.lv}`;
    if (U.art) parts.push(ppic('bastion', () => U.art.mapCamp(10)));
    parts.push(`<p class="aoc-p">Too strong for one army: only a guild rally can take it. Everyone in a winning rally earns Tomes of Knowledge, speedups and commander experience. Leading or joining costs ${A.FORT_AP} action points (you have ${full(f.ev?.ap || 0)}).</p><div class="aoc-intel"><span class="aoc-kicker">Garrison</span><div>${U.troopLine(t.camp.troops)}</div></div>`);
    if (P.guild >= 0 && (P.role === 'leader' || P.role === 'officer' || P.b.hall >= 12)) acts.push({ label: 'Call a rally', kind: 'red', icon: 'flag', onClick: () => U.marchSheet({ kind: 'rally', to: i, name: title, enemy: t.camp.troops }) });
    else parts.push(`<p class="aoc-muted">${P.guild < 0 ? 'Join a guild to rally on forts.' : 'Leaders, officers and governors with a level 12 Town Hall call rallies; join one from the Guild tab.'}</p>`);
  } else if (t.camp) {
    title = `Bandit camp, level ${t.camp.lv}`;
    if (U.art) parts.push(ppic(t.camp.lv <= 3 ? 'camp-1' : t.camp.lv <= 7 ? 'camp-2' : 'camp-3', () => U.art.mapCamp(t.camp.lv)));
    parts.push(`<p class="aoc-p">Beat the bandits for loot, Tomes of Knowledge, speedups and commander experience. Attacking costs <b>${A.campAp(t.camp.lv)}</b> action points (you have ${full(f.ev?.ap || 0)}).${t.camp.reserved ? ` <b>Reserved for you until ${A.clock(t.camp.reserved)}.</b>` : ''}</p><div class="aoc-intel"><span class="aoc-kicker">Garrison</span><div>${U.troopLine(t.camp.troops)}</div></div>`);
    acts.push({ label: 'Attack', kind: 'red', icon: 'sword', onClick: () => U.marchSheet({ kind: 'attack', to: i, name: title, enemy: t.camp.troops, level: t.camp.lv }) });
  } else if (t.node) {
    const n = t.node;
    title = `${A.RES_NAME[n.res]} field, level ${n.lv}`;
    if (U.art) parts.push(ppic(fieldPaint(n), () => U.art.mapField(n.res)));
    parts.push(`<p class="aoc-p">${n.amount != null ? `${full(n.amount)} of ${full(n.max)} left.` : `Up to ${full(n.max)} when full. Out of sight: you cannot see how much is left.`}${n.busy ? ` ${esc(n.byName || 'Someone')} is gathering here.` : ''}</p>`);
    if (n.busy) acts.push({ label: 'Attack the gatherers', kind: 'red', icon: 'sword', onClick: () => U.marchSheet({ kind: 'attack', to: i, name: `${n.byName || 'the'} gatherers` }) });
    else acts.push({ label: 'Gather', icon: 'pick', onClick: () => U.marchSheet({ kind: 'gather', to: i, name: title, res: n.res }) });
  } else if (t.mark) {
    const mk = t.mark;
    title = mk.name;
    const owner = mk.owner >= 0 ? f.guilds[mk.owner] : null;
    const kindName = mk.kind === 'capital' ? 'The Capital' : mk.kind === 'pass' ? `Pass, level ${mk.tier}` : mk.kind === 'site' ? `Holy site: ${A.SITES[mk.site].name}` : 'Ancient ruins';
    if (U.art) parts.push(ppic(markPaint(mk), () => mk.kind === 'ruin' ? U.art.mapRuin() : mk.kind === 'pass' ? U.art.mapPass(owner?.color || null, mk.tier) : mk.kind === 'site' ? U.art.mapSite(mk.site, owner?.color || null) : U.art.mapFort(owner?.color || null, true)));
    parts.push(`<div class="aoc-who">${mk.kind === 'ruin' ? `<span class="aoc-big-ico">${U.icon('ruin', 34)}</span>` : U.banner(owner, 40)}<div><b>${esc(kindName)}</b> · garrison level ${mk.level}
      <div class="aoc-muted">${owner ? `Held by ${esc(owner.name)} [${esc(owner.tag)}] since ${A.clock(mk.since)}` : mk.kind === 'ruin' ? 'Guarded by old wardens' : 'Held by its neutral garrison'}</div></div></div>`);
    const opensAt = !mk.open && mk.kind !== 'ruin' ? `<p class="aoc-p aoc-opens">${U.icon('lock', 16)} Opens on Day ${Math.floor(mk.opens / A.DAY) + 1}${mk.opens % A.DAY ? ` at ${A.clock(mk.opens).split(' ').pop()}` : ''}.</p>` : '';
    if (mk.kind === 'capital') parts.push(`<p class="aoc-p">${!mk.open ? `The gates open on Day ${1 + f.throne.opens / A.DAY}.` : `A guild that holds the Throne for ${f.throne.hold / A.DAY} days wins the Age.`}${f.throne.owner >= 0 ? ` ${esc(f.guilds[f.throne.owner].name)} has held it for ${dur(f.t - f.throne.since)}.` : ''} It stands in the heartland: only a guild holding a level 3 pass can reach it.</p>`);
    if (mk.kind === 'pass') parts.push(`<div class="aoc-intel"><span class="aoc-kicker">The road through the mountains</span><div><b>${esc(mk.links[0])}</b> ${U.icon('next', 14)} <b>${esc(mk.links[1])}</b></div></div><p class="aoc-p">${owner ? `Members of ${esc(owner.name)} and its allies march through it. Everyone else is stopped at the mountains.` : 'Nobody can march through until a guild takes it with a rally.'} Take it from either side.</p>${opensAt}`);
    if (mk.kind === 'site') parts.push(`<div class="aoc-intel"><span class="aoc-kicker">${esc(mk.blessing.name)}</span><div>${esc(mk.blessing.text)} for every member of the guild that holds it, wherever they are. The same blessing from two sites counts once.</div></div>${opensAt}`);
    if (mk.kind === 'ruin') parts.push(`<p class="aoc-p">${mk.cleared ? 'You have explored these ruins.' : 'Defeat the wardens to recover the treasures inside and train your commander.'}</p>`);
    if (mk.intel) parts.push(`<div class="aoc-intel"><span class="aoc-kicker">Your intelligence · ${U.ago(mk.intel.at)} · ${mk.intel.acc}% accurate</span><div>${U.troopLine(mk.intel.troops)}</div></div>`);
    if (mk.garrisonMine) parts.push(`<div class="aoc-intel"><span class="aoc-kicker">Your guild's garrison</span><div>${U.troopLine(mk.garrisonMine)}</div>${mk.myTroops.length ? `<div class="aoc-muted">${mk.myTroops.length} of the armies are yours.</div>` : ''}</div>`);
    if (!t.reachable) parts.push(`<p class="aoc-muted">${P.guild < 0 ? 'Mountains stand between you and this place. Join a guild that holds a pass to march here.' : 'Mountains stand between you and this place. Your guild needs a pass into this region first.'}</p>`);
    if (t.reachable) acts.push({ label: 'Scout', kind: 'ghost', icon: 'eye', onClick: () => sendScout(i) });
    if (mk.kind === 'ruin' && !mk.cleared && t.reachable) acts.push({ label: 'Explore', kind: 'red', icon: 'sword', onClick: () => U.marchSheet({ kind: 'attack', to: i, name: mk.name, intel: mk.intel }) });
    if (mk.kind !== 'ruin' && t.reachable) {
      if (P.guild >= 0 && mk.owner === P.guild) acts.push({ label: 'Reinforce', icon: 'shield', onClick: () => U.marchSheet({ kind: 'reinforce', to: i, name: mk.name }) });
      else if (!mk.open) { /* the lock line above says when */ }
      else if (P.guild >= 0 && (P.role === 'leader' || P.role === 'officer' || P.b.hall >= 12)) acts.push({ label: 'Call a rally', kind: 'red', icon: 'flag', onClick: () => U.marchSheet({ kind: 'rally', to: i, name: mk.name, intel: mk.intel }) });
      else if (P.guild < 0) parts.push('<p class="aoc-muted">Join a guild to fight for passes, holy sites and the Throne.</p>');
      else parts.push('<p class="aoc-muted">Only leaders, officers and governors with a level 12 Town Hall can call rallies. Join one from the Guild tab when it is called.</p>');
    }
  } else {
    title = t.terrain;
    const id = A.TERRAIN[t.ter].id;
    const settle = A.TERRAIN[t.ter].cost !== Infinity && !['ford', 'pass', 'gate'].includes(id) && t.canSettle;
    if (t.wall === 1) parts.push('<p class="aoc-p">The mountain range between two regions. Armies cross it only through a pass.</p>');
    else if (t.wall === 2) parts.push('<p class="aoc-p">The road through a pass. Only the guild that holds the pass, and its allies, march here.</p>');
    else parts.push(`<p class="aoc-p">${t.visible ? 'Open land.' : 'Explored, but out of sight right now.'}</p>`);
    if (!t.reachable && !t.wall && A.TERRAIN[t.ter].cost !== Infinity) parts.push(`<p class="aoc-muted">Beyond the mountains from you: ${P.guild < 0 ? 'join a guild that holds a pass to march here.' : 'your guild needs a pass into this region.'}</p>`);
    if (settle) acts.push({ label: `Move city here (${P.relocateCost ? fmt(P.relocateCost) + ' Gold' : 'free once'})`, kind: 'ghost', icon: 'home', onClick: () => relocate(t.x, t.y) });
    if (t.reachable) acts.push({ label: 'Send a scout', kind: 'ghost', icon: 'eye', onClick: () => sendScout(i) });
  }
  const h = U.sheet({ title, body: `<p class="aoc-small aoc-muted">${terrInfo} · (${t.x}, ${t.y})</p>${parts.join('')}`, actions: acts.slice(0, 4), onClose: () => { M.sel = null; schedule(); } });
  return h;
}
// every pass, holy site and the Capital, grouped, with who holds them; tap one to go there
function findSheet() {
  const f = U.F, P = f.player;
  const row = mk => {
    const owner = mk.owner >= 0 ? f.guilds[mk.owner] : null;
    const sub = mk.kind === 'pass' ? `Level ${mk.tier} · ${A.REGIONS[mk.links[0]].name} to ${A.REGIONS[mk.links[1]].name}` : mk.kind === 'site' ? `${A.BLESSINGS[mk.blessing].text} · ${A.REGIONS[mk.region].name}` : 'The Ember Throne';
    const lock = f.t < mk.opens ? ` · opens Day ${Math.floor(mk.opens / A.DAY) + 1}` : '';
    return `<button type="button" class="aoc-row aoc-find-row" data-goto="${mk.x},${mk.y}"><span class="aoc-row-ico">${U.icon(mk.kind === 'pass' ? 'gate' : mk.kind === 'site' ? 'temple' : 'crown', 22)}</span>
      <span class="aoc-row-main"><b>${esc(mk.name)}</b><span class="aoc-muted aoc-small">${esc(sub)}${lock}</span></span>
      <span class="aoc-row-act">${owner ? `<span class="aoc-tag" style="color:${owner.color}">[${esc(owner.tag)}]</span>` : '<span class="aoc-muted aoc-small">Neutral</span>'}</span></button>`;
  };
  const marks = f.marks.filter(m => m.kind !== 'ruin');
  const mine = P.guild >= 0 ? marks.filter(m => m.owner === P.guild) : [];
  const group = (title, list) => list.length ? `<h3 class="aoc-h3">${esc(title)}</h3><div class="aoc-find">${list.map(row).join('')}</div>` : '';
  const body = `<p class="aoc-small aoc-muted">Mountains wall every region of the kingdom. Passes are the only ways through; holy sites bless the guild that holds them.</p>
    <button type="button" class="aoc-row aoc-find-row" data-goto="${P.x},${P.y}"><span class="aoc-row-ico">${U.icon('home', 22)}</span><span class="aoc-row-main"><b>Your city</b><span class="aoc-muted aoc-small">${esc(A.REGIONS[P.region].name)}, Zone ${A.REGIONS[P.region].zone} · ${P.x}, ${P.y}</span></span></button>
    ${group('Held by your guild', mine)}
    ${group('The Capital', marks.filter(m => m.kind === 'capital'))}
    ${group('Passes', marks.filter(m => m.kind === 'pass').sort((a, b) => a.tier - b.tier))}
    ${group('Holy sites', marks.filter(m => m.kind === 'site').sort((a, b) => A.REGIONS[a.region].zone - A.REGIONS[b.region].zone || a.region - b.region))}`;
  const h = U.sheet({ title: 'The kingdom', body });
  h.el.addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    const [x, y] = b.dataset.goto.split(',').map(Number);
    U.closeSheets();
    U.mapFocus(x, y, Math.max(M.view.z, 12));
  });
}
async function sendScout(i) {
  const r = await U.run({ type: 'march', kind: 'scout', to: i }, 'Scout sent.');
  return !!r;
}
function relocate(x, y) {
  const P = U.F.player, tele = U.F.ev?.tele || 0;
  const go = async item => { const r = await U.run({ type: 'relocate', x, y, item }, 'Your city has moved.'); if (r) home(true); };
  U.sheet({
    title: 'Move your city?', body: `<p class="aoc-p">Your city moves to (${x}, ${y}) at once. ${P.relocateCost ? `It costs ${full(P.relocateCost)} Gold${tele ? `, or one of your ${tele} Teleports` : ''}.` : 'Your first move as an independent is free.'} Every army must be home first.</p>`,
    actions: [{ label: 'Cancel', kind: 'ghost' }, tele && P.relocateCost ? { label: 'Use a Teleport', kind: 'blue', onClick: () => go('tele') } : null, { label: 'Move the city', onClick: () => go(null) }],
  });
}

// ================================================================ the screen
window.addEventListener('aoc-art', () => { if (U.current === 'map') schedule(); });
U.screen('map', {
  mount: mountMap,
  show() { resize(); if (!M.homed && U.F) { M.homed = true; home(false); M.view.z = 9; } schedule(); },
  update(f) {
    U.questBar(document.querySelector('.aoc-screen-map .aoc-quest'), f);
    if (f.ev) U.setHtml(document.querySelector('.aoc-screen-map .aoc-map-ap'), `${U.icon('power', 16)}${U.full(f.ev.ap)}<span>/ ${U.full(f.ev.apMax)} AP</span>`);
    if (U.current === 'map' && performance.now() - M.lastDraw > 150) schedule();
  },
});
