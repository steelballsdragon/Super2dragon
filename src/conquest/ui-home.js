/* Age of Conquest home: your city drawn as an isometric town. Every building stands on its own plot at its real
   level (an empty plot shows a sign), the one being built wears scaffolding and a timer, soldiers drill in the yard
   in the numbers you have at home, villagers walk the roads and smoke rises from the chimneys. Tap a building to
   upgrade it or use it. Everything shown comes from the latest simulation frame. */

const A = window.AOC;
const U = window.AOCUI;
const ART = U.art;
const { esc, el, fmt, full, dur, setText, setHtml } = U;
const iso = ART.iso;

// footprint top corners in tiles; the Town Hall is 3x3, the rest 2x2. The wall rings tiles 1 to 20.
const PLOTS = {
  hall: [9, 9],
  academy: [3, 3], tower: [6, 3], workshop: [3, 6], market: [6, 6],
  farm: [13, 3], lumber: [16, 3], quarry: [13, 6], mine: [16, 6],
  warehouse: [3, 13], hospital: [6, 13],
  barracks: [13, 13], stables: [16, 13], range: [13, 16],
};
const ORDER = ['hall', 'farm', 'lumber', 'warehouse', 'barracks', 'quarry', 'stables', 'range', 'wall', 'tower', 'academy', 'hospital', 'mine', 'market', 'workshop'];
const YARD = [16, 16];
const ROAD = new Set();
const rk = (x, y) => (y + 20) * 100 + (x + 20);
{
  const r = (x, y) => ROAD.add(rk(x, y));
  for (let k = 8; k <= 12; k++) { r(8, k); r(12, k); r(k, 8); r(k, 12); }
  for (let y = 2; y < 8; y++) r(10, y);
  for (let x = 2; x < 8; x++) r(x, 10);
  for (let x = 13; x < 20; x++) r(x, 10);
  for (let y = 13; y < 30; y++) r(10, y);
}
// the walks villagers take (tile centres)
const WALKS = [
  { pts: [[8.5, 8.5], [12.5, 8.5], [12.5, 12.5], [8.5, 12.5]], loop: true },
  { pts: [[10.5, 12.6], [10.5, 22]] },
  { pts: [[2.5, 10.5], [8.4, 10.5]] },
  { pts: [[12.6, 10.5], [19.5, 10.5]] },
  { pts: [[10.5, 2.5], [10.5, 8.4]] },
];
const TUNIC = ['#7d5a3a', '#4f6a8a', '#8a3f34', '#6b7a3a', '#9a7a4a', '#5a4a6a'];
const TRAINS = { barracks: 'inf', stables: 'cav', range: 'arc', workshop: 'sie' };
const MAKES = { farm: 'food', lumber: 'wood', quarry: 'stone', mine: 'iron', market: 'gold' };

const H = {
  cv: null, g: null, w: 0, h: 0, dpr: 1, cam: { x: 0, y: 300, z: 0.6 }, raf: 0, lastT: 0, sel: null, hits: [], tops: {},
  pointers: new Map(), drag: null, pinch: null, build: {}, buildSig: '', buildAt: 0, busy: false, scene: null, pops: [], popAt: 0, popK: 0, homed: false,
};
const ZMIN = 0.32, ZMAX = 1.7;
U.home = H;

// ================================================================ the static parts of the scene, per world seed
function makeScene(seed) {
  const r = ART.rnd((seed ^ 0x5bd1e995) >>> 0);
  const trees = [];
  for (let i = 0; i < 400 && trees.length < 150; i++) {
    const x = -8 + r() * 38, y = -8 + r() * 38;
    if (!(x < 0.2 || y < 0.2 || x > 21.8 || y > 21.8)) continue;
    if (y > 21 && x > 8.6 && x < 12.8) continue;
    trees.push({ x, y, kind: r() < 0.62 ? 'pine' : 'oak', s: Math.round((1.3 + r() * 0.7) * 10) / 10 });
  }
  for (const [x, y] of [[8.4, 2.6], [8.8, 5.6], [2.4, 11.6], [5.6, 11.8], [11.8, 2.4], [11.6, 6.2], [15.2, 11.6], [18.8, 11.8], [11.8, 15.4], [11.6, 18.6], [8.6, 15.6], [8.4, 18.4], [18.8, 18.6]]) trees.push({ x, y, kind: r() < 0.5 ? 'oak' : 'pine', s: 1.2 });
  const patches = [];
  for (let i = 0; i < 300; i++) {
    const x = -8 + r() * 38, y = -8 + r() * 38;
    const inside = x > 1 && y > 1 && x < 21 && y < 21;
    patches.push({ x, y, rx: 12 + r() * 30, c: inside ? ART.mix('#5d7a34', '#7a9440', r()) : ART.mix('#3e5526', '#5a6a30', r()), a: 0.35 + r() * 0.35 });
  }
  const rocks = [];
  for (let i = 0; i < 60; i++) { const x = -8 + r() * 38, y = -8 + r() * 38; if (x < 0 || y < 0 || x > 22 || y > 22) rocks.push({ x, y, s: 3 + r() * 6 }); }
  const walkers = [];
  for (let i = 0; i < 16; i++) walkers.push({ walk: i % WALKS.length, speed: 0.00045 + r() * 0.00035, off: r() * 1e6, col: TUNIC[i % TUNIC.length], sack: r() < 0.35 });
  return { seed, trees, patches, rocks, walkers };
}

// ================================================================ camera
const toS = (wx, wy) => [H.w / 2 + (wx - H.cam.x) * H.cam.z, H.h / 2 + (wy - H.cam.y) * H.cam.z];
const toW = (sx, sy) => [H.cam.x + (sx - H.w / 2) / H.cam.z, H.cam.y + (sy - H.h / 2) / H.cam.z];
const tileOf = (wx, wy) => [(wx / 32 + wy / 16) / 2, (wy / 16 - wx / 32) / 2];
function clampCam() {
  const c = H.cam;
  c.z = Math.max(ZMIN, Math.min(ZMAX, c.z));
  c.x = Math.max(-760, Math.min(760, c.x));
  c.y = Math.max(-60, Math.min(760, c.y));
}
function homeCam() {
  const [x, y] = iso(10.5, 10.5);
  H.cam.x = x; H.cam.y = y - 40;
  H.cam.z = Math.max(0.5, Math.min(0.95, H.w / 560));
  clampCam();
}
function resize() {
  if (!H.cv) return;
  const r = H.cv.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (w === H.w && h === H.h && dpr === H.dpr) return;
  H.w = w; H.h = h; H.dpr = dpr;
  H.cv.width = Math.round(w * dpr); H.cv.height = Math.round(h * dpr);
  H.cv.style.width = w + 'px'; H.cv.style.height = h + 'px';
}

// ================================================================ drawing
function sky(g) {
  const gr = g.createLinearGradient(0, 0, 0, H.h);
  gr.addColorStop(0, '#140e0c'); gr.addColorStop(0.35, '#33190d'); gr.addColorStop(0.6, '#6a2f12'); gr.addColorStop(1, '#2a3a1e');
  g.fillStyle = gr; g.fillRect(0, 0, H.w, H.h);
}
function backdrop(g, t) {
  // far ranges like the artwork's: a smoldering volcano on the left, snowy peaks on the right
  g.fillStyle = '#ff7a1f'; g.globalAlpha = 0.18; g.beginPath(); g.arc(560, -420, 90, 0, 7); g.fill(); g.globalAlpha = 1;
  const ridge = (pts, col) => { g.beginPath(); g.moveTo(-2000, -120); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(2000, -120); g.lineTo(2000, 60); g.lineTo(-2000, 60); g.closePath(); g.fillStyle = col; g.fill(); };
  ridge([[-1700, -260], [-1400, -330], [-1150, -250], [-900, -300], [-520, -470], [-380, -330], [-150, -280], [120, -340], [380, -300], [560, -430], [700, -360], [880, -470], [1100, -330], [1400, -380], [1700, -280]], '#2a201b');
  // snow caps
  g.fillStyle = '#c9cfd6'; g.globalAlpha = 0.75;
  for (const [x, y] of [[560, -430], [880, -470]]) { g.beginPath(); g.moveTo(x - 34, y + 40); g.lineTo(x, y); g.lineTo(x + 36, y + 42); g.lineTo(x + 12, y + 30); g.lineTo(x - 6, y + 44); g.closePath(); g.fill(); }
  g.globalAlpha = 1;
  // the volcano: a glowing crater, short lava runs and a slow plume
  const glow = g.createRadialGradient(-520, -468, 2, -520, -468, 60);
  glow.addColorStop(0, 'rgba(255,173,66,.9)'); glow.addColorStop(0.3, 'rgba(240,102,28,.45)'); glow.addColorStop(1, 'rgba(240,102,28,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(-520, -468, 60, 0, 7); g.fill();
  g.fillStyle = '#ff9a3c'; g.beginPath(); g.ellipse(-520, -468, 16, 5, 0, 0, 7); g.fill();
  g.lineCap = 'round';
  for (const [x1, y1, x2, y2, w] of [[-528, -465, -548, -420, 5], [-514, -465, -498, -428, 4], [-520, -464, -526, -440, 3]]) {
    g.strokeStyle = 'rgba(255,122,31,.85)'; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2 + 4, (y1 + y2) / 2, x2, y2); g.stroke();
  }
  g.lineCap = 'butt';
  ART.smoke(g, -520, -470, t * 0.6, 4, 1);
  ridge([[-1800, -170], [-1300, -220], [-1000, -160], [-700, -230], [-400, -170], [-100, -210], [250, -160], [600, -230], [950, -170], [1300, -215], [1800, -160]], '#3a2c22');
}
function ground(g, P) {
  const S = H.scene;
  // the land below the hills, hazy toward the horizon
  const land = g.createLinearGradient(0, -170, 0, 140);
  land.addColorStop(0, '#3a3424'); land.addColorStop(0.35, '#3c4c27'); land.addColorStop(1, '#41582a');
  g.fillStyle = land;
  g.fillRect(-2600, -170, 5200, 2600);
  const mist = g.createLinearGradient(0, -200, 0, -90);
  mist.addColorStop(0, 'rgba(110,60,36,0)'); mist.addColorStop(0.5, 'rgba(110,60,36,.35)'); mist.addColorStop(1, 'rgba(110,60,36,0)');
  g.fillStyle = mist; g.fillRect(-2600, -200, 5200, 110);
  const dia = (x0, y0, x1, y1, col) => { g.beginPath(); const a = iso(x0, y0), b = iso(x1, y0), c = iso(x1, y1), d = iso(x0, y1); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath(); g.fillStyle = col; g.fill(); };
  dia(1, 1, 21, 21, '#5f7c35');
  for (const p of S.patches) { const [x, y] = iso(p.x, p.y); g.globalAlpha = p.a; g.fillStyle = p.c; g.beginPath(); g.ellipse(x, y, p.rx, p.rx * 0.5, 0, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  for (const k of ROAD) { const x = (k % 100) - 20, y = Math.floor(k / 100) - 20; ART.road(g, x, y); }
  // the drill yard and the plaza with its well
  dia(YARD[0] + 0.1, YARD[1] + 0.1, YARD[0] + 1.9, YARD[1] + 1.9, '#8f7a58');
  dia(3.1, 16.1, 7.9, 17.9, '#9b8a6a');
  for (const r of S.rocks) { const [x, y] = iso(r.x, r.y); g.fillStyle = '#7d7870'; g.beginPath(); g.ellipse(x, y, r.s, r.s * 0.6, 0, 0, 7); g.fill(); g.fillStyle = '#5c5852'; g.beginPath(); g.ellipse(x + r.s * 0.3, y + r.s * 0.15, r.s * 0.5, r.s * 0.3, 0, 0, 7); g.fill(); }
}
function well(g) {
  const [x, y] = iso(5.5, 17);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x + 4, y + 3, 18, 8, 0, 0, 7); g.fill();
  g.fillStyle = '#8c8478'; g.beginPath(); g.ellipse(x, y, 15, 7.5, 0, 0, 7); g.fill();
  g.fillRect(x - 15, y - 9, 30, 9);
  g.fillStyle = '#a69d8e'; g.beginPath(); g.ellipse(x, y - 9, 15, 7.5, 0, 0, 7); g.fill();
  g.fillStyle = '#2a4a6a'; g.beginPath(); g.ellipse(x, y - 9, 11, 5, 0, 0, 7); g.fill();
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 12, y - 9); g.lineTo(x - 12, y - 34); g.moveTo(x + 12, y - 9); g.lineTo(x + 12, y - 34); g.stroke();
  g.fillStyle = '#8a3f2a'; g.beginPath(); g.moveTo(x - 18, y - 32); g.lineTo(x, y - 46); g.lineTo(x + 18, y - 32); g.closePath(); g.fill();
  // crates and hay by the stalls
  for (const [cx, cy] of [[3.6, 16.6], [4.1, 17.4], [7.3, 16.5]]) { const [a, b] = iso(cx, cy); g.fillStyle = '#a87a45'; g.fillRect(a - 6, b - 10, 12, 10); g.strokeStyle = '#5b3a1c'; g.lineWidth = 1; g.strokeRect(a - 6, b - 10, 12, 10); }
  { const [a, b] = iso(7.2, 17.5); g.fillStyle = '#d9b84a'; g.beginPath(); g.ellipse(a, b - 6, 10, 7, 0, 0, 7); g.fill(); g.fillStyle = '#b8962e'; g.beginPath(); g.ellipse(a + 2, b - 4, 6, 3.5, 0, 0, 7); g.fill(); }
}
// the wall ring: a wooden palisade before the first wall level, stone with towers after, taller at higher levels
function walls(list, P, civ) {
  const L = P.b.wall || 0;
  const tier = L <= 0 ? 0 : Math.min(5, 1 + Math.floor(L / 5));
  const stone = civ.stone, roof = civ.roof, hgt = 16 + tier * 5;
  const fence = (x, y, w, d) => g => {
    const n = Math.max(2, Math.round((w + d) * 2.2));
    const p0 = iso(x + (w > d ? 0 : w / 2), y + (w > d ? d / 2 : 0)), p1 = iso(x + (w > d ? w : w / 2), y + (w > d ? d / 2 : d));
    g.strokeStyle = '#6b4a2a'; g.lineWidth = 2;
    for (const k of [5, 10]) { g.beginPath(); g.moveTo(p0[0], p0[1] - k); g.lineTo(p1[0], p1[1] - k); g.stroke(); }
    g.fillStyle = '#7a5530';
    for (let i = 0; i <= n; i++) { const u = i / n, px = p0[0] + (p1[0] - p0[0]) * u, py = p0[1] + (p1[1] - p0[1]) * u; g.beginPath(); g.moveTo(px - 2, py); g.lineTo(px - 2, py - 12); g.lineTo(px, py - 15); g.lineTo(px + 2, py - 12); g.lineTo(px + 2, py); g.fill(); }
  };
  const seg = (x, y, w, d) => (tier ? g => ART.wallSegment(g, x, y, w, d, stone, hgt) : fence(x, y, w, d));
  const tow = (x, y) => g => { if (tier) ART.wallTower(g, x, y, stone, roof, hgt + 16); else { const [px, py] = iso(x + 0.6, y + 0.6); g.fillStyle = '#5a3a20'; g.fillRect(px - 3, py - 22, 6, 22); g.fillStyle = '#7a5530'; g.beginPath(); g.moveTo(px - 8, py - 22); g.lineTo(px, py - 30); g.lineTo(px + 8, py - 22); g.fill(); } };
  const hit = (x, y, w, d, h) => H.hits.push({ id: 'wall', box: [x, y, w, d, tier ? h : 16] });
  const parts = [
    [-500, 'seg', 1.9, 0.9, 18.2, 0.6], [-499, 'seg', 0.9, 1.9, 0.6, 18.2], [-501, 'tow', 0.7, 0.7],
    [22, 'tow', 20.1, 0.7], [22, 'tow', 0.7, 20.1],
    [525, 'seg', 1.9, 20.4, 6.5, 0.6], [529, 'tow', 8.4, 20.1], [532, 'tow', 11.4, 20.1], [537, 'seg', 12.6, 20.4, 7.5, 0.6], [531, 'seg', 20.4, 1.9, 0.6, 18.2], [541, 'tow', 20.1, 20.1],
  ];
  for (const [d, k, x, y, w, dd] of parts) {
    if (k === 'seg') { list.push({ d, f: seg(x, y, w, dd) }); hit(x, y, w, dd, hgt); } else { list.push({ d, f: tow(x, y) }); hit(x, y, 1.2, 1.2, hgt + 16); }
  }
  // the gatehouse lintel and open doors
  list.push({ d: 530, f: g => {
    if (!tier) return;
    const [a, bb] = iso(9.6, 21), [c, d] = iso(11.4, 21);
    g.fillStyle = ART.shade(stone, 0.75); g.beginPath(); g.moveTo(a, bb - hgt + 2); g.lineTo(c, d - hgt + 2); g.lineTo(c, d - hgt - 10); g.lineTo(a, bb - hgt - 10); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(20,12,8,.55)'; g.stroke();
    g.fillStyle = '#5a3a20'; g.beginPath(); g.moveTo(a, bb); g.lineTo(a + 8, bb - 4); g.lineTo(a + 8, bb - hgt + 2); g.lineTo(a, bb - hgt + 4); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(c, d); g.lineTo(c - 8, d + 4); g.lineTo(c - 8, d - hgt + 6); g.lineTo(c, d - hgt + 2); g.closePath(); g.fill();
    ART.flag(g, (a + c) / 2, (bb + d) / 2 - hgt - 8, civ.color, 16);
  } });
}
function walkerPos(wk, t) {
  const W = WALKS[wk.walk];
  const pts = W.loop ? [...W.pts, W.pts[0]] : W.pts;
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
  let s = (t * wk.speed + wk.off) % (W.loop ? total : total * 2);
  let back = false;
  if (!W.loop && s > total) { s = total * 2 - s; back = true; }
  for (let i = 0; i < segs.length; i++) {
    if (s <= segs[i] || i === segs.length - 1) {
      const u = Math.min(1, s / segs[i]), a = pts[i], b = pts[i + 1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      if (back) { dx = -dx; dy = -dy; }
      return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, left: dx - dy < 0 };
    }
    s -= segs[i];
  }
  return { x: pts[0][0], y: pts[0][1], left: false };
}
// the top of a sprite's drawn pixels (for timers and arrows above buildings)
function spriteTop(c) {
  if (c._top != null) return c._top;
  let top = 0;
  try {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    outer: for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 3) if (d[(y * c.width + x) * 4 + 3] > 40) { top = y; break outer; }
  } catch (e) { top = 0; }
  c._top = top / (c.width / c.sw);
  return c._top;
}
function draw(now) {
  H.raf = 0;
  const f = U.F;
  if (!H.g || !f || U.current !== 'city' || document.hidden) return;
  // about 30 frames a second is plenty for the town
  if (now - H.lastT < (U.reduced ? 500 : 30)) { schedule(); return; }
  H.lastT = now;
  if (!H.scene || H.scene.seed !== U.S.seed) H.scene = makeScene(U.S.seed);
  const g = H.g, z = H.cam.z, dpr = H.dpr, P = f.player, civ = A.CIV[P.civ], t = U.reduced ? 0 : now;
  const gd = P.guild >= 0 ? f.guilds[P.guild] : null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  sky(g);
  g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (H.w / 2 - H.cam.x * z), dpr * (H.h / 2 - H.cam.y * z));
  backdrop(g, t);
  ground(g, P);
  const [vx0, vy0] = toW(-80, -80), [vx1, vy1] = toW(H.w + 80, H.h + 220);
  const vis = (wx, wy) => wx > vx0 && wx < vx1 && wy > vy0 && wy < vy1;
  H.hits = [];
  const list = [];
  // trees: outside the walls they sit behind the back walls or in front of the front walls
  for (const tr of H.scene.trees) {
    const [wx, wy] = iso(tr.x, tr.y);
    if (!vis(wx, wy)) continue;
    const out = tr.x < 0.2 || tr.y < 0.2 || tr.x > 21.8 || tr.y > 21.8;
    const front = tr.x > 21.8 || tr.y > 21.8;
    const s = ART.treeSprite(tr.kind, tr.s);
    list.push({ d: (out ? (front ? 1000 : -1000) : 0) + tr.x + tr.y, f: g2 => ART.put(g2, s, wx, wy, 13 * tr.s, 30 * tr.s) });
  }
  walls(list, P, civ);
  list.push({ d: 3 + 17 + 2.2, f: well });
  // buildings
  const q = P.q;
  for (const id in PLOTS) {
    const [px, py] = PLOTS[id], fs = ART.FOOT[id];
    const L = P.b[id] || 0;
    const s = ART.building(id, P.civ, L, { guild: gd?.color });
    const [wx, wy] = iso(px, py);
    const d = px + py + fs;
    list.push({ d, f: g2 => {
      if (H.sel === id) { g2.save(); g2.globalAlpha = 0.45 + 0.25 * Math.sin(t / 220); g2.strokeStyle = '#ffd36b'; g2.lineWidth = 3; g2.beginPath(); const a = iso(px, py), b = iso(px + fs, py), c = iso(px + fs, py + fs), e = iso(px, py + fs); g2.moveTo(...a); g2.lineTo(...b); g2.lineTo(...c); g2.lineTo(...e); g2.closePath(); g2.stroke(); g2.restore(); }
      ART.put(g2, s.c, wx, wy, s.ox, s.oy);
      if (q.build?.id === id) { g2.save(); g2.translate(wx, wy); ART.scaffold(g2, fs, t); g2.restore(); }
    } });
    H.hits.push({ id, d, x: wx - s.ox, y: wy - s.oy, c: s.c, px, py, fs });
    H.tops[id] = [iso(px + fs / 2, py + fs / 2)[0], wy - s.oy + spriteTop(s.c)];
  }
  // smoke from the chimneys of what stands
  const smokeAt = (id, u, v, k, seed) => { if (!(P.b[id] > 0)) return; const [px, py] = PLOTS[id]; const [x, y] = iso(px + u, py + v); list.push({ d: px + py + 4.5, f: g2 => ART.smoke(g2, x, y - k, t, 1, seed) }); };
  smokeAt('workshop', 1.22, 0.37, 58, 2); smokeAt('hall', 0.7, 2.2, 52, 3); smokeAt('lumber', 0.4, 0.3, 30, 4); smokeAt('hospital', 0.5, 0.6, 40, 5);
  // soldiers at home drill in the yard, by type
  const types = A.UNIT_KEYS.filter(u => (P.troops[u] || 0) > 0);
  let row = 0;
  for (const u of types) {
    const n = Math.min(6, 1 + Math.floor(Math.log10(P.troops[u]) * 1.6));
    for (let k = 0; k < n; k++) {
      const x = YARD[0] + 0.25 + (k % 3) * 0.55 + (row % 2) * 0.2, y = YARD[1] + 0.3 + row * 0.42 + Math.floor(k / 3) * 0.22;
      const [wx, wy] = iso(x, y);
      const frame = Math.floor(t / 420 + k + row) % 2;
      const s = ART.soldier(u, civ.color, frame, 1);
      list.push({ d: x + y, f: g2 => ART.put(g2, s, wx, wy, 15, 26) });
    }
    row++;
  }
  // villagers
  const walkers = H.scene.walkers.slice(0, Math.min(16, 3 + P.b.hall));
  for (const wk of walkers) {
    const p = walkerPos(wk, t);
    const [wx, wy] = iso(p.x, p.y);
    const s = ART.villager(wk.col, Math.floor(t / 200 + wk.off) % 2, wk.sack);
    list.push({ d: p.x + p.y, f: g2 => { if (p.left) { g2.save(); g2.translate(wx, wy); g2.scale(-1, 1); ART.put(g2, s, 0, 0, 8, 20); g2.restore(); } else ART.put(g2, s, wx, wy, 8, 20); } });
  }
  list.sort((a, b) => a.d - b.d);
  for (const o of list) o.f(g);
  // a peace shield is a dome of light over the town
  if (P.shield > f.t) {
    const [cx, cy] = iso(11, 11);
    const gr = g.createRadialGradient(cx, cy - 80, 100, cx, cy - 80, 760);
    gr.addColorStop(0, 'rgba(120,180,255,0)'); gr.addColorStop(0.85, 'rgba(120,180,255,.10)'); gr.addColorStop(1, 'rgba(160,210,255,.32)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy - 60, 760, 470, 0, 0, 7); g.fill();
    g.strokeStyle = `rgba(170,215,255,${(0.35 + 0.15 * Math.sin(t / 600)).toFixed(3)})`; g.lineWidth = 3; g.stroke();
  }
  // screen space: the time of day, then timers and markers
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hour = (f.t % 1440) / 60;
  const night = hour >= 20 || hour < 5 ? 1 : hour >= 18 ? (hour - 18) / 2 : hour < 7 ? (7 - hour) / 2 : 0;
  if (night > 0) { g.fillStyle = `rgba(14,20,52,${(0.36 * night).toFixed(3)})`; g.fillRect(0, 0, H.w, H.h); }
  overlays(g, f);
  H.ms = performance.now() - now;
  schedule();
}
function topOf(id) { const p = H.tops[id]; return p ? toS(p[0], p[1]) : null; }
function overlays(g, f) {
  // a golden burst over a building that just finished a level
  const now = performance.now();
  H.bursts = (H.bursts || []).filter(b => now - b.t0 < 2200);
  for (const b of H.bursts) {
    const p = b.id === 'wall' ? toS(...iso(10.5, 21)) : topOf(b.id);
    if (!p) continue;
    const k = (now - b.t0) / 2200;
    const cy = p[1] + 20;
    g.save();
    g.globalAlpha = Math.max(0, 1 - k);
    g.strokeStyle = '#ffd862'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(p[0], cy, 20 + k * 90, (20 + k * 90) * 0.45, 0, 0, 7); g.stroke();
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + k; const r0 = 14 + k * 40, r1 = r0 + 14; g.beginPath(); g.moveTo(p[0] + Math.cos(a) * r0, cy - 20 + Math.sin(a) * r0 * 0.7); g.lineTo(p[0] + Math.cos(a) * r1, cy - 20 + Math.sin(a) * r1 * 0.7); g.stroke(); }
    g.font = '22px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const y = cy - 50 - k * 30;
    g.lineWidth = 4; g.strokeStyle = 'rgba(30,18,4,.85)'; g.strokeText(`Lv ${b.L}`, p[0], y);
    g.fillStyle = '#ffd862'; g.fillText(`Lv ${b.L}`, p[0], y);
    g.restore();
  }
  layoutDom(f);
}
function schedule() { if (!H.raf && U.current === 'city') H.raf = requestAnimationFrame(draw); }

// ================================================================ tapping and the building bar
function inPoly(px, py, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function boxHit(wx, wy, [x, y, w, d, h]) {
  const A0 = iso(x, y), B0 = iso(x + w, y), C0 = iso(x + w, y + d), D0 = iso(x, y + d);
  const up = p => [p[0], p[1] - h];
  return inPoly(wx, wy, [up(A0), up(B0), B0, C0, D0, up(D0)]);
}
function pick(sx, sy) {
  const [wx, wy] = toW(sx, sy);
  // walls stand in front of everything inside except the back ones; test the front ones first
  const front = H.hits.filter(h => h.id === 'wall' && h.box[1] + h.box[0] > 20);
  for (const h of front) if (boxHit(wx, wy, h.box)) return 'wall';
  const bs = H.hits.filter(h => h.c).sort((a, b) => b.d - a.d);
  for (const h of bs) {
    const lx = wx - h.x, ly = wy - h.y;
    if (lx < 0 || ly < 0 || lx >= h.c.sw || ly >= h.c.sh) continue;
    const k = h.c.width / h.c.sw;
    try { if (h.c.getContext('2d').getImageData(Math.floor(lx * k), Math.floor(ly * k), 1, 1).data[3] > 30) return h.id; } catch (e) { /* fall back to the footprint */ }
  }
  const [tx, ty] = tileOf(wx, wy);
  for (const id in PLOTS) { const [px, py] = PLOTS[id], fs = ART.FOOT[id]; if (tx >= px && ty >= py && tx < px + fs && ty < py + fs) return id; }
  for (const h of H.hits) if (h.id === 'wall' && boxHit(wx, wy, h.box)) return 'wall';
  return null;
}
// where a building is on the screen, in page coordinates (the guide hand and the tests use it)
H.where = id => {
  const r = H.cv?.getBoundingClientRect();
  if (!r) return null;
  if (id === 'wall') { const p = toS(...iso(5, 20.7)); return { x: r.left + p[0], y: r.top + p[1] - 12 }; }
  const pl = PLOTS[id];
  if (!pl) return null;
  const fs = ART.FOOT[id];
  const p = toS(...iso(pl[0] + fs / 2, pl[1] + fs / 2));
  return { x: r.left + p[0], y: r.top + p[1] - 10 * H.cam.z };
};
// auto: the guide moving the camera, which never counts as the player looking around
H.camAt = 0;
H.focus = (id, auto) => {
  const pl = PLOTS[id] || [5, 19];
  const fs = ART.FOOT[id] || 2;
  const [x, y] = iso(pl[0] + fs / 2, pl[1] + fs / 2);
  H.cam.x = x; H.cam.y = y - 30; clampCam(); schedule();
  if (!auto) H.camAt = performance.now();
};
// tapping a building opens its sheet
function select(id) {
  H.sel = id;
  if (id) U.buildingSheet(id);
}
H.select = select;
H.open = id => { H.focus(id, true); select(id); };

// ================================================================ the town's overlay: plates, timers, crates, arrows
// DOM elements over the canvas (crisp text, real buttons), placed every frame from the camera
const ALL = [...Object.keys(PLOTS), 'wall'];
// short names for the plates under the buildings
const SHORT = { workshop: 'Workshop', range: 'Range', tower: 'Tower', lumber: 'Lumber Mill', mine: 'Mine', wall: 'Walls', hall: 'Town Hall' };
function plateAt(id) {
  if (id === 'wall') return iso(5.6, 21.4);
  const [px, py] = PLOTS[id], fs = ART.FOOT[id];
  return iso(px + fs * 0.92, py + fs * 0.92);
}
function buildDom(root) {
  const box = root.querySelector('.aoc-wui');
  box.innerHTML = ALL.map(id => `<div class="aoc-bui" data-b="${id}">
    <button type="button" class="aoc-plate" data-plate="${id}" aria-label="${esc(A.BUILDINGS[id].name)}"><span class="aoc-plate-lv"></span><span class="aoc-plate-n">${esc(SHORT[id] || A.BUILDINGS[id].name)}</span></button>
    <button type="button" class="aoc-timer" data-timer="${id}" hidden><span class="aoc-timer-i">${U.icon('hammer', 16)}</span><span class="aoc-timer-t"></span><span class="aoc-timer-bar"><i></i></span></button>
    <button type="button" class="aoc-bubble" data-crate="${id}" hidden aria-label="Collect"></button>
    <span class="aoc-up" hidden aria-hidden="true">${U.icon('arrow_up', 18)}</span>
  </div>`).join('');
  H.dom = {};
  for (const id of ALL) {
    const n = box.querySelector(`[data-b="${id}"]`);
    H.dom[id] = { n, plate: n.querySelector('.aoc-plate'), lv: n.querySelector('.aoc-plate-lv'), timer: n.querySelector('.aoc-timer'), tt: n.querySelector('.aoc-timer-t'), bar: n.querySelector('.aoc-timer-bar i'), bubble: n.querySelector('.aoc-bubble'), up: n.querySelector('.aoc-up'), key: '' };
  }
}
// where each building's pieces go this frame
function layoutDom() {
  if (!H.dom) return;
  for (const id of ALL) {
    const d = H.dom[id];
    const [px, py] = toS(...plateAt(id));
    const top = id === 'wall' ? [px, py - 46 * H.cam.z] : topOf(id) || [px, py - 60];
    const key = `${Math.round(px)},${Math.round(py)},${Math.round(top[0])},${Math.round(top[1])},${d.timer.hidden ? 0 : 1}`;
    if (key === d.key) continue;
    d.key = key;
    // left and top place them; the stylesheet centres them and animates their transform
    const at = (n, x, y) => { n.style.left = Math.round(x) + 'px'; n.style.top = Math.round(y) + 'px'; };
    at(d.plate, px, py);
    at(d.timer, top[0], top[1] - 6);
    at(d.bubble, top[0], top[1] - (d.timer.hidden ? 4 : 38));
    at(d.up, top[0] + 26, top[1] + 6);
  }
}
// what each building's pieces say: level, timers, Free, full crates, upgrade arrows
function refreshDom(f) {
  if (!H.dom) return;
  const P = f.player, q = P.q;
  const timers = {};
  if (q.build) timers[q.build.id] = { start: q.build.start, end: q.build.end, kind: 'build' };
  for (const id in TRAINS) if (q.train[TRAINS[id]]) timers[id] = timers[id] || { ...q.train[TRAINS[id]], kind: 'train' };
  if (q.research) timers.academy = timers.academy || { ...q.research, kind: 'research' };
  if (q.heal) timers.hospital = timers.hospital || { ...q.heal, kind: 'heal' };
  if (q.exchange) timers.market = timers.market || { ...q.exchange, kind: 'exchange' };
  for (const id of ALL) {
    const d = H.dom[id], L = P.b[id] || 0, def = A.BUILDINGS[id];
    const locked = !L && P.b.hall < def.needHall;
    const canBuild = !L && !locked;
    d.plate.classList.toggle('is-locked', locked);
    d.plate.classList.toggle('is-build', canBuild);
    setHtml(d.lv, locked ? `${U.icon('lock', 11)}${def.needHall}` : L ? String(L) : U.icon('plus', 11));
    const tm = timers[id];
    d.timer.hidden = !tm;
    if (tm) {
      const left = tm.end - f.t;
      const free = tm.kind !== 'exchange' && left <= A.FREE_FINISH;
      d.timer.classList.toggle('is-free', free);
      d.timer.dataset.kind = tm.kind;
      setText(d.tt, free ? 'Free' : dur(left));
      d.bar.style.width = Math.round(Math.max(0, Math.min(1, (f.t - tm.start) / Math.max(1, tm.end - tm.start))) * 100) + '%';
      setHtml(d.timer.querySelector('.aoc-timer-i'), U.icon(free ? 'check' : tm.kind === 'build' ? 'hammer' : tm.kind === 'train' ? TRAINS[id] : tm.kind === 'heal' ? 'herb' : tm.kind === 'exchange' ? 'crown' : 'scroll', 16));
    }
    const crate = f.crates?.[id];
    d.bubble.hidden = !(crate && crate.ready);
    if (crate) setHtml(d.bubble, U.icon(crate.res, 28));
    d.up.hidden = !(H.build[id]?.ok && !q.build && id !== 'wall');
  }
  // the builder: idle, busy with a timer, or ready to finish free
  const b = document.querySelector('.aoc-screen-city .aoc-builder');
  if (b) {
    const busy = q.build, left = busy ? busy.end - f.t : 0, free = busy && left <= A.FREE_FINISH;
    b.classList.toggle('is-idle', !busy);
    b.classList.toggle('is-free', !!free);
    setText(b.querySelector('.aoc-builder-t'), !busy ? 'Idle' : free ? 'Free' : dur(left));
    b.querySelector('.aoc-builder-bar i').style.width = busy ? Math.round(Math.max(0, Math.min(1, (f.t - busy.start) / Math.max(1, busy.end - busy.start))) * 100) + '%' : '0%';
    b.setAttribute('aria-label', !busy ? 'Builder idle' : `Building ${A.BUILDINGS[busy.id].name}: ${free ? 'finish free' : dur(left) + ' left'}`);
  }
  // side buttons with red dots
  const side = document.querySelector('.aoc-screen-city .aoc-side');
  if (side) {
    U.badge(side.querySelector('[data-side="mail"] .aoc-badge'), f.unread);
    U.badge(side.querySelector('[data-side="goals"] .aoc-badge'), f.quests.filter(x => x.done && !x.claimed).length);
    const rallies = (f.rallies || []).filter(r => !r.joined).length;
    U.badge(side.querySelector('[data-side="guild"] .aoc-badge'), rallies + (P.guild < 0 ? P.invites.length : 0) + (f.applicants || []).length + (f.proposals || []).length);
    const cmdBtn = side.querySelector('[data-side="cmds"]');
    if (cmdBtn) U.badge(cmdBtn.querySelector('.aoc-badge'), 0);
    const dev = side.querySelector('[data-side="dev"]');
    if (dev) dev.hidden = !U.dev;
  }
}
// a number floating up from where something was collected
function floatAt(x, y, html, cls = '') {
  const box = document.querySelector('.aoc-screen-city .aoc-wui');
  if (!box) return;
  const n = el(`<span class="aoc-float ${cls}" style="left:${Math.round(x)}px;top:${Math.round(y)}px">${html}</span>`);
  box.appendChild(n);
  setTimeout(() => n.remove(), 1400);
}
async function onTown(e) {
  const t = e.target.closest('[data-plate],[data-timer],[data-crate],[data-side],.aoc-builder');
  if (!t) return;
  const f = U.F;
  if (t.dataset.plate) return select(t.dataset.plate);
  if (t.dataset.crate) {
    const id = t.dataset.crate;
    t.disabled = true;
    const r = await U.run({ type: 'collect', id });
    t.disabled = false;
    if (r) { const box = t.getBoundingClientRect(), wr = t.closest('.aoc-wui').getBoundingClientRect(); floatAt(box.left - wr.left + box.width / 2, box.top - wr.top, `${U.icon(r.res, 18)}+${fmt(r.amount)}`); }
    return;
  }
  if (t.dataset.timer) {
    const id = t.dataset.timer, kind = t.dataset.kind;
    if (t.classList.contains('is-free')) return freeFinish(kind, id);
    return select(id);
  }
  if (t.classList.contains('aoc-builder')) {
    const b = f.player.q.build;
    if (b && b.end - f.t <= A.FREE_FINISH) return freeFinish('build', b.id);
    if (b) return H.open(b.id);
    return U.cityPanel('build');
  }
  const side = t.dataset.side;
  if (side === 'mail') U.go('intel');
  if (side === 'goals') U.cityPanel('goals');
  if (side === 'guild') U.go('guild');
  if (side === 'cmds') U.go('army', 'cmds');
  if (side === 'dev') U.devPanel?.();
}
async function freeFinish(kind, id) {
  const r = await U.run({ type: 'free', q: kind, unit: kind === 'train' ? TRAINS[id] : '' });
  if (r) U.toast(kind === 'build' ? 'Finished free.' : 'Done.', 'good');
  return r;
}
U.freeFinish = freeFinish;

// ================================================================ the upgrade sheet
function preview(id, L) {
  const s = ART.building(id, U.F.player.civ, L, { guild: U.F.player.guild >= 0 ? U.F.guilds[U.F.player.guild].color : null });
  const top = spriteTop(s.c);
  const h = s.c.sh - top;
  const c = document.createElement('canvas');
  const k = Math.min(1, 132 / s.c.sw, 104 / h);
  c.width = Math.round(s.c.sw * k * 2); c.height = Math.round(h * k * 2);
  c.style.width = c.width / 2 + 'px'; c.style.height = c.height / 2 + 'px';
  c.className = 'aoc-up-pic';
  const g = c.getContext('2d');
  g.drawImage(s.c, 0, top * (s.c.width / s.c.sw), s.c.width, h * (s.c.width / s.c.sw), 0, 0, c.width, c.height);
  return c;
}
// small pictures for lists
const thumbs = new Map();
H.thumb = (id, L) => {
  if (!PLOTS[id] || !U.F) return null;
  const P = U.F.player, tier = L <= 0 ? 0 : Math.min(5, 1 + Math.floor(L / 5));
  const key = `${id}:${P.civ}:${tier}`;
  if (thumbs.has(key)) return thumbs.get(key);
  const s = ART.building(id, P.civ, L, {});
  const top = spriteTop(s.c), r = s.c.width / s.c.sw, h = s.c.sh - top;
  const c = document.createElement('canvas');
  c.width = 112; c.height = 96;
  const k = Math.min(112 / s.c.sw, 96 / h);
  c.getContext('2d').drawImage(s.c, 0, top * r, s.c.width, h * r, (112 - s.c.sw * k) / 2, 96 - h * k, s.c.sw * k, h * k);
  let url = null;
  try { url = c.toDataURL('image/png'); } catch (e) { url = null; }
  thumbs.set(key, url);
  return url;
};
// what the next level changes, from the same formulas the simulation uses
const FACTOR = { food: 1, wood: 1, stone: 0.8, iron: 0.6, gold: 0.35 };
function effects(id, L) {
  const P = U.F.player, n = L + 1, rows = [];
  const row = (label, a, b) => rows.push([label, String(a), String(b)]);
  if (id === 'hall') { row('Building level cap', `Lv ${L}`, `Lv ${n}`); row('Storage', fmt(A.storageCap(P.b.warehouse || 0, L)), fmt(A.storageCap(P.b.warehouse || 0, n))); row('Sight', `${A.visionRadius(P.b.tower || 0, L)} tiles`, `${A.visionRadius(P.b.tower || 0, n)} tiles`); }
  if (MAKES[id]) {
    const r = MAKES[id], base = x => A.BASE_PRODUCTION[r] + A.productionAt(x) * FACTOR[r], k = P.prod[r] / Math.max(1, base(L));
    row(`${A.RES_NAME[r]} per hour`, fmt(P.prod[r]), fmt(base(n) * k));
    row('Crate (every 4 hours)', fmt(P.prod[r] * A.CRATE.hours), fmt(base(n) * k * A.CRATE.hours));
  }
  if (TRAINS[id]) { row('Trains at a time', fmt(A.trainBatch(L)), fmt(A.trainBatch(n))); row('Training speed', `+${L * 10}%`, `+${n * 10}%`); }
  if (id === 'warehouse') { row('Storage', fmt(A.storageCap(L, P.b.hall)), fmt(A.storageCap(n, P.b.hall))); row('Safe from plunder', fmt(A.protectedAmount(L)), fmt(A.protectedAmount(n))); }
  if (id === 'hospital') row('Beds', fmt(A.hospitalCap(L)), fmt(A.hospitalCap(n)));
  if (id === 'wall') row('Durability', fmt(A.wallDurability(L)), fmt(A.wallDurability(n)));
  if (id === 'tower') row('Sight', `${A.visionRadius(L, P.b.hall)} tiles`, `${A.visionRadius(n, P.b.hall)} tiles`);
  if (id === 'academy') row('Research up to', `Lv ${L}`, `Lv ${n}`);
  return rows;
}
function requirements(id, L) {
  const P = U.F.player, n = L + 1, out = [];
  if (n > A.MAX_LEVEL) return out;
  const need = (name, have, lv) => out.push({ name, lv, met: have >= lv });
  if (!L && A.BUILDINGS[id].needHall > 1) need(A.BUILDINGS.hall.name, P.b.hall, A.BUILDINGS[id].needHall);
  else if (id !== 'hall') need(A.BUILDINGS.hall.name, P.b.hall, n);
  for (const [b, lv] of A.buildingReq(id, n)) need(A.BUILDINGS[b].name, P.b[b] || 0, lv);
  return out;
}
// what a building can do besides upgrading
function extras(id) {
  const P = U.F.player, L = P.b[id] || 0, out = [];
  if (L > 0) {
    if (TRAINS[id]) out.push(['train', 'Train', TRAINS[id]]);
    if (id === 'academy') out.push(['research', 'Research', 'scroll']);
    if (id === 'market') { out.push(['trade', 'Trade', 'gold']); out.push(['wonder', 'Grand Exchange', 'crown']); }
    if (id === 'hospital') out.push(['heal', 'Heal', 'herb']);
    if (id === 'tower') out.push(['world', 'Look out', 'map']);
  }
  if (id === 'hall') { out.push(['list', 'All buildings', 'city']); out.push(['goals', 'Goals', 'star']); }
  if (id === 'wall') out.push(['shield', 'Peace shield', 'shield']);
  return out;
}
function doExtra(a, id) {
  if (a === 'train') U.trainSheet(TRAINS[id]);
  if (a === 'research') U.cityPanel('research');
  if (a === 'trade') U.cityPanel('market');
  if (a === 'wonder') U.cityPanel('wonder');
  if (a === 'list') U.cityPanel('build');
  if (a === 'goals') U.cityPanel('goals');
  if (a === 'heal') U.healSheet();
  if (a === 'shield') U.shieldSheet();
  if (a === 'world') { U.closeSheets(); U.go('map'); }
}
// the building sheet, in the Last Furnace style: picture, levels, progress, effects, requirements, cost
U.buildingSheet = id => {
  if (!A.BUILDINGS[id]) return null;
  const body = el('<div class="aoc-bsheet"><p class="aoc-muted">Loading</p></div>');
  let sig = '', busy = false;
  const render = async () => {
    if (busy) return;
    busy = true;
    let checks;
    try { checks = await U.host.query('build'); } finally { busy = false; }
    if (h.closed) return;
    const P = U.F.player, f = U.F, L = P.b[id] || 0, c = checks.find(x => x.id === id) || {};
    const up = P.q.build && P.q.build.id === id ? P.q.build : null;
    const maxed = L >= A.MAX_LEVEL;
    sig = JSON.stringify([L, !!up, c.ok, c.err]);
    const reqs = requirements(id, L), eff = maxed ? [] : effects(id, L);
    body.innerHTML = `<div class="aoc-bs-top"><div class="aoc-bs-pic"></div><div class="aoc-bs-info">
        <div class="aoc-bs-lv"><span>${L ? 'Lv ' + L : 'New'}</span>${maxed ? '' : `${U.icon('chevron_right', 18)}<span class="aoc-bs-next">Lv ${L + 1}</span>`}</div>
        <p class="aoc-bs-desc">${esc(A.BUILDINGS[id].desc)}</p></div></div>
      ${up ? `<div class="aoc-panel aoc-bs-prog"><div class="aoc-bs-prog-h"><b>Upgrading to Lv ${up.L}</b><span class="aoc-bs-left">${U.icon('clock', 16)}<span></span></span></div><div class="aoc-progress gold"><i></i></div></div>` : ''}
      ${eff.length ? `<h3 class="aoc-h4">Effects</h3><div class="aoc-panel aoc-effects">${eff.map(([lab, a, b]) => `<div class="aoc-eff"><span>${esc(lab)}</span><b>${esc(a)}${U.icon('chevron_right', 13)}<span class="aoc-good">${esc(b)}</span></b></div>`).join('')}</div>` : ''}
      ${!up && reqs.length ? `<h3 class="aoc-h4">Requirements</h3><div class="aoc-reqs">${reqs.map(r => `<div class="aoc-req aoc-panel${r.met ? ' is-met' : ''}">${U.icon(r.met ? 'check' : 'lock', 16)}<span>${esc(r.name)} <b>Lv ${r.lv}</b></span></div>`).join('')}</div>` : ''}
      ${!up && !maxed && c.cost ? `<h3 class="aoc-h4">Cost</h3><div class="aoc-costrow"><div class="aoc-costs">${Object.entries(c.cost).map(([r, v]) => `<span class="aoc-rchip${(P.res[r] || 0) < v ? ' is-short' : ''}">${U.resIcon(r, 18)}${fmt(v)}</span>`).join('')}</div><span class="aoc-rchip">${U.icon('clock', 16)}${dur(c.minutes)}</span></div>` : ''}
      ${maxed ? '<p class="aoc-p aoc-good">At the highest level.</p>' : ''}
      ${!up && !maxed && !c.ok && c.err ? `<p class="aoc-up-err">${esc(c.err)}</p>` : ''}
      ${extras(id).length ? `<div class="aoc-bs-extra">${extras(id).map(([a, label, icon]) => `<button type="button" class="aoc-btn blue small" data-bx="${a}">${U.icon(icon, 18)}<span>${esc(label)}</span></button>`).join('')}</div>` : ''}`;
    if (PLOTS[id]) body.querySelector('.aoc-bs-pic').appendChild(preview(id, L));
    else body.querySelector('.aoc-bs-pic').innerHTML = U.icon('shield', 64);
    tick(f);
    if (up) h.setActions([{ label: 'Free', id: 'aoc-free', kind: 'green', icon: 'check', disabled: up.end - f.t > A.FREE_FINISH, keep: true, onClick: async () => { await freeFinish('build', id); } }]);
    else if (maxed) h.setActions([]);
    else h.setActions([{ label: L ? 'Upgrade' : 'Build', id: 'aoc-up-go', kind: 'gold', icon: 'arrow_up', disabled: !c.ok, onClick: async () => { const r = await U.run({ type: 'build', id }, `${A.BUILDINGS[id].name}: building started.`); H.buildSig = ''; return r ? true : false; } }]);
  };
  // the timer and the Free button stay live while the sheet is open
  const tick = f => {
    const up = f.player.q.build && f.player.q.build.id === id ? f.player.q.build : null;
    if (!up) return;
    const left = up.end - f.t;
    setText(body.querySelector('.aoc-bs-left span'), left <= A.FREE_FINISH ? 'Free now' : dur(left));
    const bar = body.querySelector('.aoc-progress i');
    if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, (f.t - up.start) / Math.max(1, up.end - up.start))) * 100) + '%';
    const fb = document.getElementById('aoc-free');
    if (fb) fb.disabled = left > A.FREE_FINISH;
  };
  body.addEventListener('click', e => { const b = e.target.closest('[data-bx]'); if (b) doExtra(b.dataset.bx, id); });
  const h = U.sheet({ title: A.BUILDINGS[id].name, body, onClose: () => { off(); if (H.sel === id) H.sel = null; } });
  const off = U.onFrame(f => {
    const P = f.player, L = P.b[id] || 0, up = P.q.build && P.q.build.id === id;
    const now = JSON.stringify([L, !!up]);
    const okNow = H.build[id]?.ok;
    if (!sig.startsWith(now.slice(0, -1)) || (okNow !== undefined && !up && JSON.parse(sig)[2] !== okNow)) render(); else tick(f);
  });
  render();
  return h;
};
U.upgradeSheet = U.buildingSheet;

// ================================================================ the screen
function refreshChecks(f) {
  const P = f.player;
  const sig = JSON.stringify(P.b) + (P.q.build ? 'b' : '') + A.RES.map(r => Math.floor(Math.log2(1 + P.res[r]) * 4)).join(',');
  if ((sig === H.buildSig && performance.now() - H.buildAt < 5000) || H.busy) return;
  H.buildSig = sig; H.buildAt = performance.now(); H.busy = true;
  U.host.query('build').then(list => { H.build = {}; for (const c of list || []) H.build[c.id] = c; }).finally(() => { H.busy = false; });
}
function mount(root) {
  root.innerHTML = `<div class="aoc-town">
    <canvas class="aoc-town-cv" aria-label="Your city. Drag to look around, pinch or scroll to zoom, tap a building to open it."></canvas>
    <div class="aoc-wui"></div>
    <div class="aoc-town-top">
      <button type="button" class="aoc-builder is-idle"><span class="aoc-builder-i">${U.icon('hammer', 18)}</span><span class="aoc-builder-t">Idle</span><span class="aoc-builder-bar"><i></i></span></button>
      <div class="aoc-side">
        <button type="button" class="aoc-sidebtn" data-side="mail"><span class="aoc-sidebtn-i">${U.icon('mail', 26)}<i class="aoc-badge" hidden></i></span><span class="aoc-sidebtn-l">Mail</span></button>
        <button type="button" class="aoc-sidebtn" data-side="goals"><span class="aoc-sidebtn-i">${U.icon('chest', 26)}<i class="aoc-badge" hidden></i></span><span class="aoc-sidebtn-l">Goals</span></button>
        <button type="button" class="aoc-sidebtn" data-side="guild"><span class="aoc-sidebtn-i">${U.icon('guild', 26)}<i class="aoc-badge" hidden></i></span><span class="aoc-sidebtn-l">Guild</span></button>
        <button type="button" class="aoc-sidebtn" data-side="cmds"><span class="aoc-sidebtn-i">${U.icon('hero', 26)}<i class="aoc-badge" hidden></i></span><span class="aoc-sidebtn-l">Heroes</span></button>
        <button type="button" class="aoc-sidebtn" data-side="dev" hidden><span class="aoc-sidebtn-i">${U.icon('dev', 26)}</span><span class="aoc-sidebtn-l">Dev</span></button>
      </div>
    </div>
    <div class="aoc-town-bottom"><div class="aoc-quest" hidden></div></div>
    <div class="aoc-sr" role="group" aria-label="Buildings">${ORDER.map(id => `<button type="button" data-sel="${id}">${esc(A.BUILDINGS[id].name)}</button>`).join('')}</div>
  </div>`;
  H.cv = root.querySelector('canvas');
  H.g = H.cv.getContext('2d', { alpha: false });
  buildDom(root);
  new ResizeObserver(() => { resize(); H.dom && Object.values(H.dom).forEach(d => { d.key = ''; }); schedule(); }).observe(H.cv.parentElement);
  root.querySelector('.aoc-town').addEventListener('click', onTown);
  root.querySelector('.aoc-sr').addEventListener('click', e => { const b = e.target.closest('[data-sel]'); if (b) H.open(b.dataset.sel); });
  const cv = H.cv;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture?.(e.pointerId);
    H.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (H.pointers.size === 1) H.drag = { x: e.offsetX, y: e.offsetY, cx: H.cam.x, cy: H.cam.y, moved: 0 };
    else if (H.pointers.size === 2) { const [a, b] = [...H.pointers.values()]; H.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: H.cam.z }; if (H.drag) H.drag.moved = 99; }
  });
  cv.addEventListener('pointermove', e => {
    if (!H.pointers.has(e.pointerId)) return;
    H.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    H.camAt = performance.now();
    if (H.pointers.size === 2 && H.pinch) { const [a, b] = [...H.pointers.values()]; H.cam.z = H.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, H.pinch.d); clampCam(); return; }
    if (H.drag) {
      const dx = e.offsetX - H.drag.x, dy = e.offsetY - H.drag.y;
      H.drag.moved = Math.max(H.drag.moved, Math.abs(dx) + Math.abs(dy));
      H.cam.x = H.drag.cx - dx / H.cam.z; H.cam.y = H.drag.cy - dy / H.cam.z; clampCam();
    }
  });
  const end = e => {
    const tap = H.drag && H.drag.moved < 8 && H.pointers.size === 1 && e.type === 'pointerup';
    H.pointers.delete(e.pointerId);
    if (H.pointers.size < 2) H.pinch = null;
    if (tap) { const id = pick(e.offsetX, e.offsetY); if (id) select(id); }
    if (!H.pointers.size) H.drag = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    H.camAt = performance.now();
    const [a0, b0] = toW(e.offsetX, e.offsetY);
    H.cam.z *= e.deltaY < 0 ? 1.12 : 1 / 1.12; clampCam();
    const [a1, b1] = toW(e.offsetX, e.offsetY);
    H.cam.x += a0 - a1; H.cam.y += b0 - b1; clampCam();
  }, { passive: false });
  cv.tabIndex = 0;
  cv.addEventListener('keydown', e => {
    const k = { ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -60], ArrowDown: [0, 60] }[e.key];
    if (k) { H.cam.x += k[0] / H.cam.z; H.cam.y += k[1] / H.cam.z; clampCam(); e.preventDefault(); }
    if (e.key === '+' || e.key === '=') { H.cam.z *= 1.2; clampCam(); }
    if (e.key === '-') { H.cam.z /= 1.2; clampCam(); }
  });
}
U.screen('city', {
  mount,
  show() { resize(); if (!H.homed) { H.homed = true; homeCam(); } H.buildSig = ''; if (U.F) { refreshChecks(U.F); refreshDom(U.F); } schedule(); },
  hide() { H.sel = null; },
  update(f) {
    const b = f.player.b;
    if (H.prevB) for (const id in b) if ((b[id] || 0) > (H.prevB[id] || 0)) (H.bursts = H.bursts || []).push({ id, L: b[id], t0: performance.now() });
    H.prevB = { ...b };
    refreshChecks(f);
    refreshDom(f);
    U.questBar(document.querySelector('.aoc-screen-city .aoc-quest'), f);
    schedule();
  },
});
