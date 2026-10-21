/* Age of Conquest map: a canvas world map with pan and pinch zoom. Layers: terrain (drawn once per seed),
   guild territory (redrawn when it changes), objects, armies on the move, and fog of war (unexplored land is
   black, explored land out of sight is dimmed). Tapping a tile opens what you know about it and what you can do. */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, setText } = U;
const N = A.MAP_N;
const TILE = 8;   // pixels per tile in the off-screen layers

const M = {
  cv: null, ctx: null, w: 0, h: 0, dpr: 1, view: { cx: N / 2, cy: N / 2, z: 6 }, terrLayer: null, terrSeed: -1, territory: null, terrVer: -1,
  fogLayer: null, fogVer: -1, showTerritory: true, dirty: true, raf: 0, pointers: new Map(), drag: null, sel: null, homed: false, lastDraw: 0,
};
const ZMIN = 2.5, ZMAX = 40;

// ================================================================ layers
function hashTile(i) { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; return (h & 1023) / 1023; }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function buildTerrain() {
  const ter = U.S.ter;
  const c = document.createElement('canvas');
  c.width = c.height = N * TILE;
  const g = c.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, t = ter[i], T = A.TERRAIN[t];
    const r = hashTile(i);
    g.fillStyle = shade(T.color, 0.92 + r * 0.16);
    const px = x * TILE, py = y * TILE;
    g.fillRect(px, py, TILE, TILE);
    switch (T.id) {
      case 'forest':
        g.fillStyle = shade('#1f3520', 0.9 + r * 0.2);
        g.beginPath(); g.moveTo(px + 2, py + 6); g.lineTo(px + 3.5, py + 1.5); g.lineTo(px + 5, py + 6); g.fill();
        g.beginPath(); g.moveTo(px + 4.5, py + 7.5); g.lineTo(px + 6, py + 3); g.lineTo(px + 7.5, py + 7.5); g.fill();
        break;
      case 'mountain':
        g.fillStyle = '#36312d';
        g.beginPath(); g.moveTo(px, py + 8); g.lineTo(px + 4, py + 0.5); g.lineTo(px + 8, py + 8); g.fill();
        g.fillStyle = '#c9c4be';
        g.beginPath(); g.moveTo(px + 2.6, py + 3); g.lineTo(px + 4, py + 0.5); g.lineTo(px + 5.4, py + 3); g.fill();
        break;
      case 'hills':
        g.strokeStyle = shade('#4f4130', 1); g.lineWidth = 1;
        g.beginPath(); g.arc(px + 4, py + 7, 3, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        break;
      case 'water': case 'river':
        if (r > 0.6) { g.strokeStyle = 'rgba(160,200,230,.25)'; g.beginPath(); g.moveTo(px + 1, py + 4); g.lineTo(px + 4, py + 3); g.lineTo(px + 7, py + 4); g.stroke(); }
        break;
      case 'ford':
        g.fillStyle = '#a7a295'; g.fillRect(px + 1, py + 3, 2, 2); g.fillRect(px + 5, py + 5, 2, 2);
        break;
      case 'pass':
        g.fillStyle = '#958671'; g.fillRect(px + 2, py + 2, 1, 1); g.fillRect(px + 5, py + 4, 1, 1); g.fillRect(px + 3, py + 6, 1, 1);
        break;
      case 'snow':
        if (r > 0.7) { g.fillStyle = '#c3cad0'; g.fillRect(px + 3, py + 3, 2, 1); }
        break;
    }
  }
  M.terrLayer = c;
  M.terrSeed = U.S.seed;
}
function buildTerritory() {
  const terr = U.S.terr;
  if (!terr || !U.F) return;
  const c = M.territory || document.createElement('canvas');
  c.width = c.height = N * TILE;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const colors = U.F.guilds.map(gd => gd.color);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = terr[y * N + x];
    if (!v) continue;
    g.fillStyle = colors[v - 1] + '3d';
    g.fillRect(x * TILE, y * TILE, TILE, TILE);
    // borders where the owner changes
    g.fillStyle = colors[v - 1] + 'cc';
    if (x === 0 || terr[y * N + x - 1] !== v) g.fillRect(x * TILE, y * TILE, 1, TILE);
    if (x === N - 1 || terr[y * N + x + 1] !== v) g.fillRect(x * TILE + TILE - 1, y * TILE, 1, TILE);
    if (y === 0 || terr[(y - 1) * N + x] !== v) g.fillRect(x * TILE, y * TILE, TILE, 1);
    if (y === N - 1 || terr[(y + 1) * N + x] !== v) g.fillRect(x * TILE, y * TILE + TILE - 1, TILE, 1);
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
  // fog of war over everything static, and the edge of the world
  if (M.fogLayer) { g.imageSmoothingEnabled = true; g.drawImage(M.fogLayer, ox, oy, N * z, N * z); }
  g.strokeStyle = 'rgba(226,176,74,.35)'; g.lineWidth = 2; g.strokeRect(ox - 1, oy - 1, N * z + 2, N * z + 2);
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
  // selection
  if (M.sel != null) {
    const [sx, sy] = toScreen(M.sel % N, Math.floor(M.sel / N));
    g.strokeStyle = '#f2c14e'; g.lineWidth = 2; g.strokeRect(sx, sy, z, z);
  }
  M.dirty = false;
  M.lastDraw = performance.now();
  // keep animating while armies move on screen
  if (f.marches.length && !document.hidden && U.current === 'map') schedule(120);
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
    <div class="aoc-map-info" aria-live="polite"></div>
  </div>`;
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
U.mapFocus = (x, y, z) => { M.view.cx = x + 0.5; M.view.cy = y + 0.5; if (z) M.view.z = z; clampView(); U.go('map'); schedule(); };

// ================================================================ the quest banner (guided start)
function updateQuest(f) {
  const box = document.querySelector('.aoc-screen-map .aoc-quest');
  if (!box) return;
  const q = f.quests.find(x => !x.claimed);
  if (!q) { box.hidden = true; return; }
  box.hidden = false;
  const html = `<div class="aoc-quest-in"><span class="aoc-kicker">${q.done ? 'Done' : 'Goal'}</span><b>${esc(q.text)}</b><span class="aoc-muted">${esc(q.how)}</span></div>
    ${q.done ? `<button type="button" class="aoc-btn gold small" data-claim="${q.id}">Claim</button>` : `<span class="aoc-quest-r">${U.cost(q.reward)}</span>`}`;
  U.setHtml(box, html);
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-claim]');
  if (!b || !b.closest('#aoc')) return;
  b.disabled = true;
  const r = await U.run({ type: 'claimQuest', id: b.dataset.claim });
  if (r) U.toast('Reward claimed: ' + Object.entries(r.reward).map(([k, v]) => `${fmt(v)} ${A.RES_NAME[k]}`).join(', '), 'good');
});

// ================================================================ tile sheet
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
    parts.push(`<p class="aoc-p">Bandits hold this camp. Beat them for resources and commander experience. Camps come back a few hours after they fall.${t.camp.reserved ? ` <b>Reserved for you as a newcomer until ${A.clock(t.camp.reserved)}</b>: other governors leave it alone.` : ''}</p><div class="aoc-intel"><span class="aoc-kicker">Known garrison</span><div>${U.troopLine(t.camp.troops)}</div></div>`);
    acts.push({ label: 'Attack', kind: 'red', icon: 'sword', onClick: () => U.marchSheet({ kind: 'attack', to: i, name: title, enemy: t.camp.troops, level: t.camp.lv }) });
  } else if (t.node) {
    const n = t.node;
    title = `${A.RES_NAME[n.res]} field, level ${n.lv}`;
    parts.push(`<p class="aoc-p">${n.amount != null ? `${full(n.amount)} of ${full(n.max)} left.` : `Up to ${full(n.max)} when full. Out of sight: you cannot see how much is left.`}${n.busy ? ` ${esc(n.byName || 'Someone')} is gathering here.` : ''}</p>`);
    if (n.busy) acts.push({ label: 'Attack the gatherers', kind: 'red', icon: 'sword', onClick: () => U.marchSheet({ kind: 'attack', to: i, name: `${n.byName || 'the'} gatherers` }) });
    else acts.push({ label: 'Gather', icon: 'pick', onClick: () => U.marchSheet({ kind: 'gather', to: i, name: title, res: n.res }) });
  } else if (t.mark) {
    const mk = t.mark;
    title = mk.name;
    const owner = mk.owner >= 0 ? f.guilds[mk.owner] : null;
    const kindName = mk.kind === 'capital' ? 'The Capital' : mk.kind === 'fortress' ? 'Fortress' : 'Ancient ruins';
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
  update(f) { updateQuest(f); if (U.current === 'map' && performance.now() - M.lastDraw > 150) schedule(); },
});
