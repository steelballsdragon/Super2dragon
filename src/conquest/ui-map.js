/* Age of Conquest map: a canvas world map with pan and pinch zoom. Layers: terrain (drawn once per seed),
   guild territory (redrawn when it changes), objects, armies on the move, and fog of war (unexplored land is
   black, explored land out of sight is dimmed). Tapping a tile opens what you know about it and what you can do. */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, setText } = U;
const N = A.MAP_N;
const TILE = 16;  // pixels per tile in the painted terrain layer
const TT = 8;     // pixels per tile in the territory layer
const SPRITE_Z = 7; // from this zoom, castles, camps, fields and armies are drawn as pictures

const M = {
  cv: null, ctx: null, w: 0, h: 0, dpr: 1, view: { cx: N / 2, cy: N / 2, z: 6 }, terrLayer: null, terrSeed: -1, territory: null, terrVer: -1,
  fogLayer: null, fogVer: -1, showTerritory: true, dirty: true, raf: 0, pointers: new Map(), drag: null, sel: null, homed: false, lastDraw: 0,
};
const ZMIN = 2.5, ZMAX = 40;

// ================================================================ layers
function hashTile(i) { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; return (h & 1023) / 1023; }
function buildTerrain() {
  const ter = U.S.ter;
  const c = document.createElement('canvas');
  c.width = c.height = N * TILE;
  const g = c.getContext('2d');
  const T = A.TERRAIN.map(t => t.id);
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : ter[y * N + x]);
  const wet = t => T[t] === 'water' || T[t] === 'river';
  // ground colour per tile, then a softened copy on top so regions blend
  const small = document.createElement('canvas');
  small.width = small.height = N;
  const sg = small.getContext('2d');
  const img = sg.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const t = ter[i], r = hashTile(i), n = parseInt(A.TERRAIN[t].color.slice(1), 16), k = 0.9 + r * 0.18;
    img.data[i * 4] = Math.min(255, (n >> 16) * k); img.data[i * 4 + 1] = Math.min(255, ((n >> 8) & 255) * k); img.data[i * 4 + 2] = Math.min(255, (n & 255) * k); img.data[i * 4 + 3] = 255;
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, N * TILE, N * TILE);
  g.globalAlpha = 0.55; g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, N * TILE, N * TILE);
  g.globalAlpha = 1;
  // shores, ripples, grass, hills and snow
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, t = ter[i], id = T[t], r = hashTile(i), r2 = hashTile(i + 7777);
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
    }
  }
  // trees and peaks, back rows first so the front ones overlap them
  const pine = (x, y, s) => U.art ? U.art.pine(g, x, y, s) : null;
  const oak = (x, y, s) => U.art ? U.art.oak(g, x, y, s) : null;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, id = T[ter[i]], r = hashTile(i), r2 = hashTile(i + 991);
    const px = x * TILE, py = y * TILE;
    if (id === 'forest') {
      const n = r > 0.5 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const fx = px + 3 + ((r * 7 + k * 5.3) % 10), fy = py + 6 + ((r2 * 5 + k * 3.7) % 9);
        (r2 > 0.8 && k === 1 ? oak : pine)(fx, fy, 0.42 + r * 0.12);
      }
    } else if (id === 'mountain') {
      const w = TILE * (1.1 + r * 0.4), h = TILE * (1.1 + r2 * 0.5), bx = px + TILE / 2 + (r - 0.5) * 4, by = py + TILE - 1;
      g.fillStyle = '#5d5550'; g.beginPath(); g.moveTo(bx - w / 2, by); g.lineTo(bx - w * 0.05, by - h); g.lineTo(bx + w / 2, by); g.closePath(); g.fill();
      g.fillStyle = '#3c3632'; g.beginPath(); g.moveTo(bx - w * 0.05, by - h); g.lineTo(bx + w / 2, by); g.lineTo(bx + w * 0.08, by); g.closePath(); g.fill();
      if (r2 > 0.35) { g.fillStyle = '#e4e8ec'; g.beginPath(); g.moveTo(bx - w * 0.2, by - h * 0.62); g.lineTo(bx - w * 0.05, by - h); g.lineTo(bx + w * 0.14, by - h * 0.6); g.lineTo(bx, by - h * 0.68); g.closePath(); g.fill(); }
    }
  }
  M.terrLayer = c;
  M.terrSeed = U.S.seed;
}
function buildTerritory() {
  const terr = U.S.terr;
  if (!terr || !U.F) return;
  const c = M.territory || document.createElement('canvas');
  c.width = c.height = N * TT;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const colors = U.F.guilds.map(gd => gd.color);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = terr[y * N + x];
    if (!v) continue;
    g.fillStyle = colors[v - 1] + '3d';
    g.fillRect(x * TT, y * TT, TT, TT);
    // borders where the owner changes
    g.fillStyle = colors[v - 1] + 'cc';
    if (x === 0 || terr[y * N + x - 1] !== v) g.fillRect(x * TT, y * TT, 1, TT);
    if (x === N - 1 || terr[y * N + x + 1] !== v) g.fillRect(x * TT + TT - 1, y * TT, 1, TT);
    if (y === 0 || terr[(y - 1) * N + x] !== v) g.fillRect(x * TT, y * TT, TT, 1);
    if (y === N - 1 || terr[(y + 1) * N + x] !== v) g.fillRect(x * TT, y * TT + TT - 1, TT, 1);
  }
  M.territory = c;
  M.terrVer = U.S.terrVer;
}
function buildFog() {
  const fog = U.S.fog;
  if (!fog) return;
  const c = M.fogLayer || document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = fog[i];
    img.data[i * 4] = 9; img.data[i * 4 + 1] = 8; img.data[i * 4 + 2] = 10;
    img.data[i * 4 + 3] = v === 0 ? 255 : v === 1 ? 105 : 0;
  }
  g.putImageData(img, 0, 0);
  M.fogLayer = c;
  M.fogVer = U.S.visVer;
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
  if (M.terrSeed !== U.S.seed) buildTerrain();
  if (M.terrVer !== U.S.terrVer) buildTerritory();
  if (M.fogVer !== U.S.visVer) buildFog();
  const g = M.ctx, z = M.view.z;
  g.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
  g.fillStyle = '#0a0807';
  g.fillRect(0, 0, M.w, M.h);
  const [ox, oy] = toScreen(0, 0);
  g.imageSmoothingEnabled = z < TILE;
  g.drawImage(M.terrLayer, ox, oy, N * z, N * z);
  if (M.showTerritory && M.territory) g.drawImage(M.territory, ox, oy, N * z, N * z);
  const [x0, y0] = toTile(0, 0), [x1, y1] = toTile(M.w, M.h);
  const inView = (x, y, pad = 2) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
  const gcol = gi => (gi >= 0 ? f.guilds[gi].color : '#b8ada0');
  const P = f.player;
  const sprites = z >= SPRITE_Z && !!U.art;
  if (sprites) drawSprites(g, f, z, inView, gcol, P);
  else {
    // resource fields and camps
    for (const n of f.nodes) {
      if (!inView(n.x, n.y)) continue;
      const [sx, sy] = toScreen(n.x + 0.5, n.y + 0.5);
      const r = Math.max(2, z * 0.28);
      g.fillStyle = { food: '#e8c46a', wood: '#a8723f', stone: '#9aa0a6', iron: '#7f95ad', gold: '#f0c94f' }[n.res];
      g.beginPath(); g.moveTo(sx, sy - r); g.lineTo(sx + r, sy); g.lineTo(sx, sy + r); g.lineTo(sx - r, sy); g.closePath(); g.fill();
      if (n.busy) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
    }
    for (const c of f.camps) {
      if (!inView(c.x, c.y)) continue;
      const [sx, sy] = toScreen(c.x + 0.5, c.y + 0.5);
      const r = Math.max(2.5, z * 0.36);
      g.fillStyle = '#b4483a';
      g.beginPath(); g.moveTo(sx, sy - r); g.lineTo(sx + r, sy + r * 0.8); g.lineTo(sx - r, sy + r * 0.8); g.closePath(); g.fill();
      if (z >= 11) { g.fillStyle = '#f3e5d6'; g.font = `600 ${Math.round(z * 0.45)}px Barlow, sans-serif`; g.textAlign = 'center'; g.fillText(String(c.lv), sx, sy + r * 0.75); }
    }
    // cities
    for (const c of U.S.cities.values()) {
      if (!inView(c.x, c.y)) continue;
      const [sx, sy] = toScreen(c.x + 0.5, c.y + 0.5);
      const mine = c.id === P.id;
      const col = mine ? '#f2c14e' : gcol(c.guild);
      const s = Math.max(2.5, z * (0.32 + Math.min(0.28, c.hall / 70)));
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
    // landmarks
    for (const mk of f.marks) {
      if (!mk.known || !inView(mk.x, mk.y, 4)) continue;
      const [sx, sy] = toScreen(mk.x + 0.5, mk.y + 0.5);
      const s = Math.max(5, z * (mk.kind === 'capital' ? 1.4 : mk.kind === 'fortress' ? 0.95 : 0.7));
      const col = mk.owner >= 0 ? f.guilds[mk.owner].color : '#8c847a';
      if (mk.kind === 'ruin') {
        g.fillStyle = '#8c847a';
        for (let k = -1; k <= 1; k++) g.fillRect(sx + k * s * 0.45 - s * 0.12, sy - s * (0.3 + 0.2 * (k & 1)), s * 0.24, s * (0.8 + 0.2 * (k & 1)));
      } else {
        g.fillStyle = '#2a2420';
        g.fillRect(sx - s, sy - s * 0.6, s * 2, s * 1.4);
        g.fillStyle = col;
        for (let k = -1; k <= 1; k++) g.fillRect(sx + k * s * 0.7 - s * 0.25, sy - s * 1.05, s * 0.5, s * 0.55);
        g.fillRect(sx - s * 0.85, sy - s * 0.55, s * 1.7, s * 1.15);
        g.fillStyle = '#1c1712';
        g.fillRect(sx - s * 0.22, sy + s * 0.1, s * 0.44, s * 0.5);
        if (mk.kind === 'capital') { g.fillStyle = '#f2c14e'; g.beginPath(); g.moveTo(sx - s * 0.6, sy - s * 1.2); g.lineTo(sx - s * 0.6, sy - s * 1.7); g.lineTo(sx - s * 0.3, sy - s * 1.45); g.lineTo(sx, sy - s * 1.8); g.lineTo(sx + s * 0.3, sy - s * 1.45); g.lineTo(sx + s * 0.6, sy - s * 1.7); g.lineTo(sx + s * 0.6, sy - s * 1.2); g.closePath(); g.fill(); }
      }
      if (z >= 4.5) {
        g.font = `700 ${Math.max(10, Math.round(Math.min(15, z * 0.42)))}px Cinzel, Georgia, serif`;
        g.textAlign = 'center';
        const label = mk.name + (mk.owner >= 0 ? ` [${f.guilds[mk.owner].tag}]` : '');
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(label, sx, sy + s * 1.1 + 12);
        g.fillStyle = mk.owner >= 0 ? col : '#e7dccd';
        g.fillText(label, sx, sy + s * 1.1 + 12);
      }
    }
  }
  // fog of war over everything static, and the edge of the world
  if (M.fogLayer) { g.imageSmoothingEnabled = true; g.drawImage(M.fogLayer, ox, oy, N * z, N * z); }
  g.strokeStyle = 'rgba(226,176,74,.35)'; g.lineWidth = 2; g.strokeRect(ox - 1, oy - 1, N * z + 2, N * z + 2);
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
  M.dirty = false;
  M.lastDraw = performance.now();
  // keep animating while armies move on screen
  if ((f.marches.length || (f.fights || []).length) && !document.hidden && U.current === 'map') schedule(sprites ? 90 : 120);
}
// ---------------------------------------------------------------- pictures (zoomed in)
function drawSprites(g, f, z, inView, gcol, P) {
  const ART = U.art;
  const objs = [];
  const at = (x, y) => toScreen(x + 0.5, y + 0.5);
  for (const n of f.nodes) {
    if (!inView(n.x, n.y)) continue;
    const [sx, sy] = at(n.x, n.y), k = z * 1.3 / 34, s = ART.mapField(n.res);
    objs.push({ y: n.y, f: () => { ART.put(g, s, sx, sy + z * 0.3, 24, 34, k); if (n.busy) ART.flag(g, sx + z * 0.35, sy + z * 0.2, '#efe6da', z * 0.7); } });
  }
  for (const c of f.camps) {
    if (!inView(c.x, c.y)) continue;
    const [sx, sy] = at(c.x, c.y), k = z * 1.4 / 34, s = ART.mapCamp(c.lv);
    objs.push({ y: c.y, f: () => {
      ART.put(g, s, sx, sy + z * 0.3, 24, 36, k);
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
    objs.push({ y: c.y, f: () => {
      if (mine) { g.strokeStyle = '#f2c14e'; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy + z * 0.3, z * 1.1, z * 0.5, 0, 0, 7); g.stroke(); }
      ART.put(g, s, sx, sy + z * 0.35, 32, 44, k);
      if (c.shield) { g.fillStyle = 'rgba(130,190,255,.16)'; g.strokeStyle = 'rgba(160,210,255,.7)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(sx, sy - z * 0.2, z * 1.05, z * 0.95, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); }
    } });
    if (z >= 12 || mine) labels.push({ pri: mine ? 1e9 : c.hall, x: sx, y: sy + z * 0.55, text: (c.guild >= 0 ? `[${f.guilds[c.guild].tag}] ` : '') + c.name, col: mine ? '#f2c14e' : '#efe6da', font: `700 ${Math.max(10, Math.round(Math.min(14, z * 0.34)))}px Barlow, sans-serif` });
  }
  for (const mk of f.marks) {
    if (!mk.known || !inView(mk.x, mk.y, 4)) continue;
    const [sx, sy] = at(mk.x, mk.y);
    const col = mk.owner >= 0 ? f.guilds[mk.owner].color : null;
    if (mk.kind === 'ruin') { const s = ART.mapRuin(), k = z * 1.6 / 36; objs.push({ y: mk.y, f: () => ART.put(g, s, sx, sy + z * 0.3, 24, 36, k) }); }
    else { const cap = mk.kind === 'capital', s = ART.mapFort(col, cap), k = z * (cap ? 3.6 : 2.7) / 60; objs.push({ y: mk.y + 0.5, f: () => ART.put(g, s, sx, sy + z * 0.5, 48, 66, k) }); }
    labels.push({ pri: 1e8 + mk.level, x: sx, y: sy + z * (mk.kind === 'capital' ? 1.5 : mk.kind === 'fortress' ? 1.2 : 0.8), text: mk.name + (mk.owner >= 0 ? ` [${f.guilds[mk.owner].tag}]` : ''), col: col || '#e7dccd', font: `700 ${Math.max(10, Math.round(Math.min(15, z * 0.42)))}px Cinzel, Georgia, serif` });
  }
  objs.sort((a, b) => a.y - b.y);
  for (const o of objs) o.f();
  // name plates, most important first; one that would cover another is left out
  g.textAlign = 'center';
  const placed = [];
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
    const frame = Math.floor(now / 260 + m.id) % 2;
    const s = ART.armyToken(type, col, frame);
    const k = Math.max(0.5, z * (m.kind === 'scout' ? 1.5 : 2.4) / 44);
    g.save(); g.translate(sx, sy + z * 0.2); if (left) g.scale(-1, 1);
    ART.put(g, s, 0, 0, 22, 32, k);
    g.restore();
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
    <div class="aoc-quest" hidden></div>
    <div class="aoc-map-tools">
      <button type="button" class="aoc-iconbtn" data-act="home" aria-label="Center on your city">${U.icon('home', 20)}</button>
      <button type="button" class="aoc-iconbtn" data-act="in" aria-label="Zoom in">${U.icon('plus', 20)}</button>
      <button type="button" class="aoc-iconbtn" data-act="out" aria-label="Zoom out">${U.icon('minus', 20)}</button>
      <button type="button" class="aoc-iconbtn" data-act="layers" aria-label="Show or hide guild territory" aria-pressed="true">${U.icon('layers', 20)}</button>
    </div>
    <button type="button" class="aoc-world-btn" aria-label="Your city">${U.icon('city', 30)}<span>City</span></button>
    <div class="aoc-map-info" aria-live="polite"></div>
  </div>`;
  root.querySelector('.aoc-world-btn').addEventListener('click', () => U.go('city'));
  M.cv = root.querySelector('canvas');
  M.ctx = M.cv.getContext('2d', { alpha: false });
  const ro = new ResizeObserver(() => { resize(); schedule(); });
  ro.observe(M.cv.parentElement);
  root.querySelector('.aoc-map-tools').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'home') home(true);
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
U.mapFocus = (x, y, z) => { M.view.cx = x + 0.5; M.view.cy = y + 0.5; if (z) M.view.z = z; clampView(); U.go('map'); schedule(); };

// ================================================================ claiming goals (from the banner over the city and the map)
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-claim]');
  if (!b || !b.closest('#aoc')) return;
  b.disabled = true;
  const r = await U.run({ type: 'claimQuest', id: b.dataset.claim });
  if (r) U.toast('Reward claimed: ' + Object.entries(r.reward).map(([k, v]) => `${fmt(v)} ${A.RES_NAME[k]}`).join(', '), 'good');
});

// ================================================================ tile sheet
// a picture of what stands on the tile, from the map's own sprites
function pic(c) {
  if (!c) return '';
  let src = '';
  try { src = c.toDataURL('image/png'); } catch (e) { return ''; }
  return `<img class="aoc-tile-pic" src="${src}" alt="" width="${c.sw * 1.5}" height="${c.sh * 1.5}">`;
}
async function openTile(i) {
  M.sel = i; schedule();
  const t = await U.host.query('tile', { i });
  if (!t) return;
  const f = U.F, P = f.player;
  const parts = [];
  const acts = [];
  const terrInfo = `${esc(t.terrain)} · ${esc(t.region)}${t.territory >= 0 ? ` · <span style="color:${f.guilds[t.territory].color}">${esc(f.guilds[t.territory].name)} territory</span>` : ''}`;
  let title = t.terrain;
  if (!t.explored) {
    title = 'Unexplored land';
    parts.push(`<p class="aoc-p">You have not seen this place. Send a scout to explore it; everything along its way comes into view.</p>`);
    acts.push({ label: 'Send a scout', icon: 'eye', onClick: () => sendScout(i) });
  } else if (t.city) {
    const c = t.city;
    title = c.name;
    const gd = c.guild >= 0 ? f.guilds[c.guild] : null;
    if (U.art) parts.push(pic(U.art.mapCity(c.civ, gd?.color || null, c.hall, c.id === P.id)));
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
  } else if (t.camp) {
    title = `Bandit camp, level ${t.camp.lv}`;
    if (U.art) parts.push(pic(U.art.mapCamp(t.camp.lv)));
    parts.push(`<p class="aoc-p">Beat the bandits for loot and commander experience.${t.camp.reserved ? ` <b>Reserved for you until ${A.clock(t.camp.reserved)}.</b>` : ''}</p><div class="aoc-intel"><span class="aoc-kicker">Garrison</span><div>${U.troopLine(t.camp.troops)}</div></div>`);
    acts.push({ label: 'Attack', kind: 'red', icon: 'sword', onClick: () => U.marchSheet({ kind: 'attack', to: i, name: title, enemy: t.camp.troops, level: t.camp.lv }) });
  } else if (t.node) {
    const n = t.node;
    title = `${A.RES_NAME[n.res]} field, level ${n.lv}`;
    if (U.art) parts.push(pic(U.art.mapField(n.res)));
    parts.push(`<p class="aoc-p">${n.amount != null ? `${full(n.amount)} of ${full(n.max)} left.` : `Up to ${full(n.max)} when full. Out of sight: you cannot see how much is left.`}${n.busy ? ` ${esc(n.byName || 'Someone')} is gathering here.` : ''}</p>`);
    if (n.busy) acts.push({ label: 'Attack the gatherers', kind: 'red', icon: 'sword', onClick: () => U.marchSheet({ kind: 'attack', to: i, name: `${n.byName || 'the'} gatherers` }) });
    else acts.push({ label: 'Gather', icon: 'pick', onClick: () => U.marchSheet({ kind: 'gather', to: i, name: title, res: n.res }) });
  } else if (t.mark) {
    const mk = t.mark;
    title = mk.name;
    const owner = mk.owner >= 0 ? f.guilds[mk.owner] : null;
    const kindName = mk.kind === 'capital' ? 'The Capital' : mk.kind === 'fortress' ? 'Fortress' : 'Ancient ruins';
    if (U.art) parts.push(pic(mk.kind === 'ruin' ? U.art.mapRuin() : U.art.mapFort(owner?.color || null, mk.kind === 'capital')));
    parts.push(`<div class="aoc-who">${mk.kind === 'ruin' ? `<span class="aoc-big-ico">${U.icon('ruin', 34)}</span>` : U.banner(owner, 40)}<div><b>${esc(kindName)}</b> · level ${mk.level}
      <div class="aoc-muted">${owner ? `Held by ${esc(owner.name)} [${esc(owner.tag)}] since ${A.clock(mk.since)}` : mk.kind === 'ruin' ? 'Guarded by old wardens' : 'Held by its neutral garrison'}</div></div></div>`);
    if (mk.kind === 'capital') parts.push(`<p class="aoc-p">${f.t < f.throne.opens ? `The gates open on Day ${1 + f.throne.opens / A.DAY}.` : `A guild that holds the Throne for ${f.throne.hold / A.DAY} days wins the Age.`}${f.throne.owner >= 0 ? ` ${esc(f.guilds[f.throne.owner].name)} has held it for ${dur(f.t - f.throne.since)}.` : ''}</p>`);
    if (mk.kind === 'fortress') parts.push('<p class="aoc-p">Fortresses extend their guild\'s territory and give members inside it +4% production. Take them with a rally; keep them with reinforcements.</p>');
    if (mk.kind === 'ruin') parts.push(`<p class="aoc-p">${mk.cleared ? 'You have explored these ruins.' : 'Defeat the wardens to recover the treasures inside and train your commander.'}</p>`);
    if (mk.intel) parts.push(`<div class="aoc-intel"><span class="aoc-kicker">Your intelligence · ${U.ago(mk.intel.at)} · ${mk.intel.acc}% accurate</span><div>${U.troopLine(mk.intel.troops)}</div></div>`);
    if (mk.garrisonMine) parts.push(`<div class="aoc-intel"><span class="aoc-kicker">Your guild's garrison</span><div>${U.troopLine(mk.garrisonMine)}</div>${mk.myTroops.length ? `<div class="aoc-muted">${mk.myTroops.length} of the armies are yours.</div>` : ''}</div>`);
    acts.push({ label: 'Scout', kind: 'ghost', icon: 'eye', onClick: () => sendScout(i) });
    if (mk.kind === 'ruin' && !mk.cleared) acts.push({ label: 'Explore', kind: 'red', icon: 'sword', onClick: () => U.marchSheet({ kind: 'attack', to: i, name: mk.name, intel: mk.intel }) });
    if (mk.kind !== 'ruin') {
      if (P.guild >= 0 && mk.owner === P.guild) acts.push({ label: 'Reinforce', icon: 'shield', onClick: () => U.marchSheet({ kind: 'reinforce', to: i, name: mk.name }) });
      else if (P.guild >= 0 && (P.role === 'leader' || P.role === 'officer' || P.b.hall >= 12)) acts.push({ label: 'Call a rally', kind: 'red', icon: 'flag', onClick: () => U.marchSheet({ kind: 'rally', to: i, name: mk.name, intel: mk.intel }) });
      else if (P.guild < 0) parts.push('<p class="aoc-muted">Join a guild to fight for fortresses and the Throne.</p>');
      else parts.push('<p class="aoc-muted">Only leaders, officers and governors with a level 12 Town Hall can call rallies. Join one from the Guild tab when it is called.</p>');
    }
  } else {
    title = t.terrain;
    const passable = A.TERRAIN[t.ter].cost !== Infinity && t.terrain !== 'Ford' && t.terrain !== 'Mountain pass';
    parts.push(`<p class="aoc-p">${t.visible ? 'Open land.' : 'Explored, but out of sight right now.'}</p>`);
    if (passable) acts.push({ label: `Move city here (${P.relocateCost ? fmt(P.relocateCost) + ' Gold' : 'free once'})`, kind: 'ghost', icon: 'home', onClick: () => relocate(t.x, t.y) });
    acts.push({ label: 'Send a scout', kind: 'ghost', icon: 'eye', onClick: () => sendScout(i) });
  }
  const h = U.sheet({ title, body: `<p class="aoc-small aoc-muted">${terrInfo} · (${t.x}, ${t.y})</p>${parts.join('')}`, actions: acts.slice(0, 4), onClose: () => { M.sel = null; schedule(); } });
  return h;
}
async function sendScout(i) {
  const r = await U.run({ type: 'march', kind: 'scout', to: i }, 'Scout sent.');
  return !!r;
}
function relocate(x, y) {
  const P = U.F.player;
  U.confirm({
    title: 'Move your city?', text: `Your city moves to (${x}, ${y}) at once. ${P.relocateCost ? `It costs ${full(P.relocateCost)} Gold.` : 'Your first move as an independent is free.'} Every army must be home first.`,
    ok: 'Move the city', onOk: async () => { const r = await U.run({ type: 'relocate', x, y }, 'Your city has moved.'); if (r) home(true); },
  });
}

// ================================================================ the screen
U.screen('map', {
  mount: mountMap,
  show() { resize(); if (!M.homed && U.F) { M.homed = true; home(false); M.view.z = 9; } schedule(); },
  update(f) { U.questBar(document.querySelector('.aoc-screen-map .aoc-quest'), f); if (U.current === 'map' && performance.now() - M.lastDraw > 150) schedule(); },
});
