/* Age of Conquest art: every picture in the game is drawn here with canvas paths (no image files) and cached as
   sprites. Isometric buildings for the city in each civilization's colours and roof style; castles, camps, fields,
   forests and mountains for the world map; soldiers, horses, archers and siege engines for armies and battles. */

const A = window.AOC;
const U = window.AOCUI;
const ART = (U.art = {});

// ================================================================ colour helpers and the sprite cache
// colours come in as #rrggbb or as rgb(...) strings from shade() and mix()
function hex(c) {
  if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const m = String(c).match(/[\d.]+/g) || [0, 0, 0];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
function rgb(r, g, b, a = 1) { return a < 1 ? `rgba(${r | 0},${g | 0},${b | 0},${a})` : `rgb(${r | 0},${g | 0},${b | 0})`; }
// k < 1 darkens, k > 1 lightens toward white
function shade(c, k) {
  const [r, g, b] = hex(c);
  if (k <= 1) return rgb(r * k, g * k, b * k);
  const t = Math.min(1, k - 1);
  return rgb(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}
function mix(a, b, t) { const x = hex(a), y = hex(b); return rgb(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
// sprites are drawn at twice their size so they stay sharp on high-density screens and when zoomed in;
// c.sw and c.sh are the size to draw them at
const RES = 2;
const cache = new Map();
function sprite(key, w, h, draw) {
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const sw = Math.max(1, Math.ceil(w)), sh = Math.max(1, Math.ceil(h));
  c.width = sw * RES; c.height = sh * RES;
  c.sw = sw; c.sh = sh;
  const g = c.getContext('2d');
  g.scale(RES, RES);
  try { draw(g, sw, sh); } catch (e) { console.error('[aoc] sprite failed', key, e); }
  cache.set(key, c);
  if (cache.size > 700) cache.delete(cache.keys().next().value);
  return c;
}
// draw a sprite with its anchor (ax, ay, in sprite pixels) at x, y
ART.put = (g, c, x, y, ax = 0, ay = 0, k = 1) => g.drawImage(c, x - ax * k, y - ay * k, c.sw * k, c.sh * k);
ART.shade = shade; ART.mix = mix; ART.sprite = sprite;
function poly(g, pts, fill, stroke, lw = 1) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
ART.rnd = rnd;

// ================================================================ isometric geometry
const TW = 64, TH = 32;
ART.TW = TW; ART.TH = TH;
const iso = (x, y) => [(x - y) * TW / 2, (x + y) * TH / 2];
ART.iso = iso;
const EDGE = 'rgba(20,12,8,.55)';
// an upright box on footprint (x, y, w, d) in tiles, h pixels tall
function box(g, x, y, w, d, h, col, o = {}) {
  const A0 = iso(x, y), B0 = iso(x + w, y), C0 = iso(x + w, y + d), D0 = iso(x, y + d);
  const up = p => [p[0], p[1] - h];
  poly(g, [D0, C0, up(C0), up(D0)], o.left || shade(col, 0.68), EDGE);
  poly(g, [C0, B0, up(B0), up(C0)], o.right || shade(col, 0.86), EDGE);
  if (!o.noTop) poly(g, [up(A0), up(B0), up(C0), up(D0)], o.top || shade(col, 1.06), EDGE);
  return { A: up(A0), B: up(B0), C: up(C0), D: up(D0), A0, B0, C0, D0, h };
}
// a point on the front-left face (u along D->C, v up) or the front-right face (u along C->B)
function onFace(b, face, u, v) {
  const [p, q] = face === 'L' ? [b.D0, b.C0] : [b.C0, b.B0];
  return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u - b.h * v];
}
function facePoly(g, b, face, u0, u1, v0, v1, fill) {
  poly(g, [onFace(b, face, u0, v0), onFace(b, face, u1, v0), onFace(b, face, u1, v1), onFace(b, face, u0, v1)], fill);
}
function windows(g, b, face, n, rows, lit) {
  const glow = lit ? '#ffcf70' : '#2a1c14';
  for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
    const u0 = (i + 0.3) / n, u1 = (i + 0.7) / n, v0 = 0.25 + r * (0.6 / rows), v1 = v0 + 0.32 / rows;
    facePoly(g, b, face, u0, u1, v0, v1, glow);
  }
}
function door(g, b, face, col = '#2b1a10') { facePoly(g, b, face, 0.4, 0.6, 0, 0.42, col); }
// roofs sit on a box's top (b.A..b.D)
function roofHip(g, b, rh, col, ov = 3) {
  const cx = (b.A[0] + b.C[0]) / 2, cy = (b.A[1] + b.C[1]) / 2;
  const grow = p => [p[0] + Math.sign(p[0] - cx) * ov, p[1] + Math.sign(p[1] - cy) * ov * 0.5];
  const a = grow(b.A), bb = grow(b.B), c = grow(b.C), d = grow(b.D), P = [cx, cy - rh];
  poly(g, [a, bb, P], shade(col, 1.12), EDGE);
  poly(g, [d, a, P], shade(col, 0.95), EDGE);
  poly(g, [d, c, P], shade(col, 0.72), EDGE);
  poly(g, [c, bb, P], shade(col, 0.9), EDGE);
  return P;
}
function roofGable(g, b, rh, col, ov = 3) {
  // ridge runs along the x axis (from the A-D edge to the B-C edge)
  const m1 = [(b.A[0] + b.D[0]) / 2, (b.A[1] + b.D[1]) / 2 - rh], m2 = [(b.B[0] + b.C[0]) / 2, (b.B[1] + b.C[1]) / 2 - rh];
  const o = p => [p[0], p[1] + ov * 0.4];
  poly(g, [b.A, b.B, m2, m1], shade(col, 1.08), EDGE);
  poly(g, [o(b.D), o(b.C), m2, m1], shade(col, 0.74), EDGE);
  poly(g, [b.C, b.B, m2], shade(col, 0.88), EDGE);
  return [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2];
}
function roofDome(g, b, rh, col) {
  const cx = (b.A[0] + b.C[0]) / 2, cy = (b.A[1] + b.C[1]) / 2, rx = (b.B[0] - b.D[0]) / 2 * 0.8;
  const gr = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  gr.addColorStop(0, shade(col, 0.7)); gr.addColorStop(0.45, shade(col, 1.2)); gr.addColorStop(1, shade(col, 0.8));
  g.beginPath(); g.ellipse(cx, cy, rx, rx * 0.5, 0, 0, Math.PI); g.lineTo(cx - rx, cy);
  g.ellipse(cx, cy, rx, rh, 0, Math.PI, 0); g.closePath(); g.fillStyle = gr; g.fill(); g.strokeStyle = EDGE; g.stroke();
  g.fillStyle = '#e9b45e'; g.fillRect(cx - 1, cy - rh - 7, 2, 7);
  return [cx, cy - rh];
}
function roofCone(g, cx, cy, r, rh, col) {
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx, cy - rh); g.lineTo(cx + r, cy); g.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI); g.closePath();
  const gr = g.createLinearGradient(cx - r, 0, cx + r, 0);
  gr.addColorStop(0, shade(col, 0.7)); gr.addColorStop(0.5, shade(col, 1.12)); gr.addColorStop(1, shade(col, 0.82));
  g.fillStyle = gr; g.fill(); g.strokeStyle = EDGE; g.stroke();
  return [cx, cy - rh];
}
function crenels(g, b, col) {
  const n = 4;
  for (const [p, q] of [[b.D, b.C], [b.C, b.B]]) for (let i = 0; i < n; i++) {
    const t = (i + 0.15) / n, t2 = (i + 0.55) / n;
    const x0 = p[0] + (q[0] - p[0]) * t, y0 = p[1] + (q[1] - p[1]) * t, x1 = p[0] + (q[0] - p[0]) * t2, y1 = p[1] + (q[1] - p[1]) * t2;
    poly(g, [[x0, y0], [x1, y1], [x1, y1 - 5], [x0, y0 - 5]], shade(col, 0.9), EDGE);
  }
}
function flag(g, x, y, col, h = 18, wave = 0) {
  g.strokeStyle = '#3a2a1e'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
  const w = 11, s = Math.sin(wave) * 1.5;
  g.beginPath(); g.moveTo(x, y - h); g.quadraticCurveTo(x + w / 2, y - h - 2 + s, x + w, y - h + 1); g.lineTo(x + w - 2, y - h + 4); g.lineTo(x + w, y - h + 7);
  g.quadraticCurveTo(x + w / 2, y - h + 6 + s, x, y - h + 7); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = EDGE; g.lineWidth = 0.8; g.stroke();
}
ART.flag = flag;
function shadow(g, x, y, w, d) {
  const A0 = iso(x, y), B0 = iso(x + w, y), C0 = iso(x + w, y + d), D0 = iso(x, y + d);
  g.save(); g.globalAlpha = 0.28; poly(g, [[A0[0] + 8, A0[1] + 2], [B0[0] + 14, B0[1] + 4], [C0[0] + 8, C0[1] + 6], [D0[0], D0[1] + 2]], '#000'); g.restore();
}

// ================================================================ city buildings
// roof style per civilization (same set as the skyline in ui-city.js)
const STYLE = { ashen: 'spire', sunspire: 'dome', steppe: 'tent', concord: 'gable', bastion: 'keep', raven: 'tower', dawn: 'temple', frost: 'longhouse', golden: 'dome', forge: 'forge', tempest: 'mast', oath: 'hall' };
function roofFor(g, b, civ, rh, col) {
  const st = STYLE[civ] || 'gable';
  if (st === 'dome') return roofDome(g, b, rh * 0.9, col);
  if (st === 'tent') { const cx = (b.A[0] + b.C[0]) / 2, cy = (b.A[1] + b.C[1]) / 2 + 2; return roofCone(g, cx, cy, (b.B[0] - b.D[0]) / 2 * 0.95, rh * 1.3, col); }
  if (st === 'keep') { crenels(g, b, col); return [(b.A[0] + b.C[0]) / 2, (b.A[1] + b.C[1]) / 2 - 6]; }
  if (st === 'spire' || st === 'tower') return roofHip(g, b, rh * 1.6, col);
  if (st === 'gable' || st === 'longhouse' || st === 'forge' || st === 'temple') return roofGable(g, b, rh * (st === 'longhouse' ? 1.3 : st === 'temple' ? 0.6 : 1), col);
  return roofHip(g, b, rh, col);
}
// the footprint (in tiles) of each building plot in the city
ART.FOOT = { hall: 3, academy: 2, market: 2, warehouse: 2, barracks: 2, stables: 2, range: 2, workshop: 2, hospital: 2, tower: 2, farm: 2, lumber: 2, quarry: 2, mine: 2, wall: 0 };
const PAD = 14;
// a building sprite: returns { c: canvas, ox, oy } where (ox, oy) is the footprint's top corner inside the canvas
ART.building = (type, civId, level, opts = {}) => {
  const f = ART.FOOT[type] || 2;
  const tier = level <= 0 ? 0 : Math.min(5, 1 + Math.floor(level / 5));
  const maxH = 150;
  const w = f * TW + PAD * 2, h = f * TH + maxH + PAD;
  const key = `b:${type}:${civId}:${tier}:${opts.guild || ''}:${opts.lit ? 1 : 0}`;
  const ox = f * TW / 2 + PAD, oy = maxH;
  const c = sprite(key, w, h, g => { g.translate(ox, oy); drawBuilding(g, type, A.CIV[civId] || A.CIVS[0], tier, opts); });
  return { c, ox, oy, w, h };
};
function drawBuilding(g, type, civ, tier, o) {
  const f = ART.FOOT[type] || 2;
  const stone = civ.stone, roof = civ.roof, accent = civ.color, wood = '#7a5230';
  const lit = tier >= 2;
  if (tier === 0) return drawPlot(g, f);
  // ground pad
  poly(g, [iso(0.05, 0.05), iso(f - 0.05, 0.05), iso(f - 0.05, f - 0.05), iso(0.05, f - 0.05)], 'rgba(90,70,48,.55)');
  const H = n => n * (0.75 + tier * 0.12);
  switch (type) {
    case 'hall': {
      shadow(g, 0.3, 0.3, 2.4, 2.4);
      if (tier >= 3) for (const [x, y] of [[0.15, 0.15], [2.25, 0.15], [0.15, 2.25], [2.25, 2.25]]) { const t = box(g, x, y, 0.6, 0.6, H(44), stone); roofCone(g, (t.A[0] + t.C[0]) / 2, (t.A[1] + t.C[1]) / 2, 14, 18, roof); }
      const b = box(g, 0.45, 0.45, 2.1, 2.1, H(40), stone);
      windows(g, b, 'L', 3, 2, lit); windows(g, b, 'R', 3, 2, lit); door(g, b, 'L');
      const top = box(g, 1.05, 1.05, 0.9, 0.9, H(40) + H(30), shade(stone, 1.05));
      windows(g, top, 'L', 1, 1, lit); windows(g, top, 'R', 1, 1, lit);
      roofFor(g, b, civ.id, 16, roof);
      const p = roofFor(g, top, civ.id, 24, roof);
      flag(g, p[0], p[1] + 2, o.guild || accent, 22);
      if (tier >= 4) { g.strokeStyle = '#e9b45e'; g.lineWidth = 2; g.beginPath(); g.moveTo(top.D[0], top.D[1]); g.lineTo(top.C[0], top.C[1]); g.lineTo(top.B[0], top.B[1]); g.stroke(); }
      break;
    }
    case 'academy': {
      shadow(g, 0.2, 0.3, 1.6, 1.4);
      const b = box(g, 0.2, 0.5, 1.5, 1.2, H(30), stone); windows(g, b, 'L', 2, 1, lit); door(g, b, 'L');
      roofFor(g, b, civ.id, 14, roof);
      const t = box(g, 1.15, 0.25, 0.6, 0.6, H(52), shade(stone, 1.05)); windows(g, t, 'R', 1, 2, lit);
      roofDome(g, t, 14, '#4f6fae');
      break;
    }
    case 'market': {
      shadow(g, 0.2, 0.2, 1.6, 1.6);
      const b = box(g, 0.3, 0.3, 1.4, 1.0, H(24), stone); windows(g, b, 'R', 2, 1, lit); roofFor(g, b, civ.id, 12, roof);
      const cols = ['#c0392b', '#e9b45e', '#2d6a9f'];
      for (let i = 0; i < 3; i++) {
        const s = box(g, 0.25 + i * 0.5, 1.45, 0.42, 0.42, 12, wood, { top: cols[i] });
        poly(g, [s.D, s.C, [s.C[0], s.C[1] - 6], [s.D[0], s.D[1] - 6]], cols[i]);
      }
      break;
    }
    case 'warehouse': {
      shadow(g, 0.15, 0.25, 1.7, 1.5);
      const b = box(g, 0.15, 0.35, 1.7, 1.3, H(26), mix(stone, wood, 0.4)); door(g, b, 'L', '#3a2616'); door(g, b, 'R', '#3a2616');
      roofGable(g, b, 12, roof);
      for (const [x, y] of [[1.55, 1.65], [1.25, 1.75]]) box(g, x, y, 0.28, 0.28, 9, '#a87a45');
      break;
    }
    case 'barracks': {
      shadow(g, 0.2, 0.3, 1.6, 1.3);
      const b = box(g, 0.2, 0.3, 1.6, 1.15, H(28), stone); windows(g, b, 'L', 3, 1, lit); door(g, b, 'R');
      const p = roofFor(g, b, civ.id, 14, roof);
      flag(g, p[0] + 6, p[1] + 4, accent, 16);
      // training dummies
      for (const x of [0.4, 0.9]) { const [px, py] = iso(x, 1.75); g.strokeStyle = wood; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 12); g.moveTo(px - 4, py - 9); g.lineTo(px + 4, py - 9); g.stroke(); g.fillStyle = '#c9a36a'; g.beginPath(); g.arc(px, py - 13, 2.5, 0, 7); g.fill(); }
      break;
    }
    case 'stables': {
      shadow(g, 0.15, 0.4, 1.7, 1.0);
      const b = box(g, 0.15, 0.4, 1.7, 0.9, H(20), mix(stone, wood, 0.5)); for (let i = 0; i < 3; i++) facePoly(g, b, 'L', 0.1 + i * 0.3, 0.3 + i * 0.3, 0, 0.6, '#3a2616');
      roofGable(g, b, 10, roof);
      g.strokeStyle = wood; g.lineWidth = 1.5;
      for (let i = 0; i <= 4; i++) { const [px, py] = iso(0.15 + i * 0.42, 1.8); g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 7); g.stroke(); }
      { const [a1, b1] = iso(0.15, 1.8), [a2, b2] = iso(1.85, 1.8); g.beginPath(); g.moveTo(a1, b1 - 5); g.lineTo(a2, b2 - 5); g.stroke(); }
      { const [hx, hy] = iso(1.6, 1.45); g.fillStyle = '#d9b45a'; g.beginPath(); g.ellipse(hx, hy - 3, 5, 3, 0, 0, 7); g.fill(); }
      break;
    }
    case 'range': {
      shadow(g, 0.2, 0.2, 1.0, 1.0);
      const b = box(g, 0.2, 0.2, 0.95, 0.95, H(22), mix(stone, wood, 0.6)); door(g, b, 'R'); roofFor(g, b, civ.id, 12, roof);
      for (const [x, y] of [[1.45, 0.6], [1.5, 1.35], [0.7, 1.55]]) {
        const [px, py] = iso(x, y);
        g.strokeStyle = wood; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 8); g.stroke();
        for (const [r, col] of [[6, '#f2ead9'], [4, '#c0392b'], [2, '#f2ead9']]) { g.fillStyle = col; g.beginPath(); g.arc(px, py - 13, r, 0, 7); g.fill(); }
      }
      break;
    }
    case 'workshop': {
      shadow(g, 0.2, 0.2, 1.4, 1.2);
      const b = box(g, 0.2, 0.2, 1.3, 1.1, H(26), mix(stone, '#5a4a40', 0.4)); door(g, b, 'L', '#4a2a14'); windows(g, b, 'R', 1, 1, true);
      roofGable(g, b, 12, roof);
      box(g, 1.1, 0.25, 0.25, 0.25, H(26) + 22, '#4a3a30');
      // a catapult beside it
      const [px, py] = iso(1.3, 1.65);
      g.strokeStyle = wood; g.lineWidth = 2.5; g.beginPath(); g.moveTo(px - 12, py); g.lineTo(px + 10, py - 3); g.moveTo(px - 4, py - 1); g.lineTo(px + 6, py - 18); g.stroke();
      g.fillStyle = '#6d6560'; g.beginPath(); g.arc(px + 7, py - 19, 3, 0, 7); g.fill();
      g.fillStyle = '#3a2616'; g.beginPath(); g.arc(px - 9, py + 1, 3, 0, 7); g.arc(px + 7, py - 2, 3, 0, 7); g.fill();
      break;
    }
    case 'hospital': {
      shadow(g, 0.2, 0.3, 1.6, 1.4);
      const b = box(g, 0.25, 0.35, 1.5, 1.3, H(26), shade(stone, 1.15)); windows(g, b, 'R', 2, 1, lit); door(g, b, 'L');
      roofGable(g, b, 12, roof);
      // a green herb leaf on the wall
      const [hx, hy] = onFace(b, 'L', 0.2, 0.65); g.fillStyle = '#4caf50'; g.beginPath(); g.ellipse(hx, hy, 3, 5, -0.6, 0, 7); g.fill();
      break;
    }
    case 'tower': {
      shadow(g, 0.6, 0.6, 0.8, 0.8);
      const b = box(g, 0.65, 0.65, 0.7, 0.7, H(70), stone); windows(g, b, 'L', 1, 3, lit); windows(g, b, 'R', 1, 3, lit);
      const top = box(g, 0.55, 0.55, 0.9, 0.9, H(70) + 8, shade(stone, 1.05), { left: shade(stone, 0.7), right: shade(stone, 0.85) });
      crenels(g, top, stone);
      const cx = (top.A[0] + top.C[0]) / 2, cy = (top.A[1] + top.C[1]) / 2;
      roofCone(g, cx, cy - 4, 18, 22, roof);
      flag(g, cx, cy - 26, accent, 12);
      break;
    }
    case 'farm': {
      // crop rows on a field, a small barn at the back
      const field = [iso(0.05, 0.05), iso(1.95, 0.05), iso(1.95, 1.95), iso(0.05, 1.95)];
      poly(g, field, '#6b5a2e', 'rgba(40,30,10,.5)');
      const ripe = tier >= 3 ? '#d9b84a' : '#7fa53a';
      for (let i = 0; i < 8; i++) {
        const t = 0.15 + i * 0.22;
        const [x1, y1] = iso(0.15, t), [x2, y2] = iso(1.85, t);
        g.strokeStyle = i % 2 ? ripe : shade(ripe, 0.8); g.lineWidth = 3; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      const b = box(g, 0.1, 0.1, 0.6, 0.55, 18, '#9a4a2a'); roofGable(g, b, 9, '#5a3020');
      break;
    }
    case 'lumber': {
      poly(g, [iso(0.05, 0.05), iso(1.95, 0.05), iso(1.95, 1.95), iso(0.05, 1.95)], '#5b4a2e');
      const b = box(g, 0.15, 0.15, 0.8, 0.7, 20, mix(wood, stone, 0.2)); door(g, b, 'L', '#2b1a10'); roofGable(g, b, 10, roof);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) {
        const [px, py] = iso(1.1 + i * 0.25 + r * 0.12, 1.4);
        g.fillStyle = '#a8723f'; g.strokeStyle = '#4f3218'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(px, py - r * 5 - 3, 4.5, 3.2, 0, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#e1b98a'; g.beginPath(); g.ellipse(px, py - r * 5 - 3, 2, 1.4, 0, 0, 7); g.fill();
      }
      for (const [x, y] of [[1.55, 0.35], [1.75, 0.8], [0.3, 1.6]]) drawPine(g, ...iso(x, y), 0.8);
      break;
    }
    case 'quarry': {
      poly(g, [iso(0.05, 0.05), iso(1.95, 0.05), iso(1.95, 1.95), iso(0.05, 1.95)], '#6d6862');
      poly(g, [iso(0.4, 0.4), iso(1.6, 0.4), iso(1.6, 1.6), iso(0.4, 1.6)], '#4a4642');
      poly(g, [iso(0.6, 0.6), iso(1.4, 0.6), iso(1.4, 1.4), iso(0.6, 1.4)], '#38342f');
      for (const [x, y] of [[1.7, 1.2], [1.65, 1.6], [1.3, 1.75]]) box(g, x, y, 0.22, 0.22, 7, '#b8b4ad');
      { const [px, py] = iso(0.3, 0.3); g.strokeStyle = wood; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 22); g.lineTo(px + 12, py - 16); g.stroke(); }
      break;
    }
    case 'mine': {
      poly(g, [iso(0.05, 0.05), iso(1.95, 0.05), iso(1.95, 1.95), iso(0.05, 1.95)], '#5a5048');
      g.fillStyle = '#4a423b'; g.beginPath(); const [mx, my] = iso(0.9, 0.9); g.moveTo(mx - 50, my + 10); g.quadraticCurveTo(mx - 10, my - 50, mx + 40, my + 4); g.closePath(); g.fill();
      g.fillStyle = '#1a1410'; g.beginPath(); g.ellipse(mx - 2, my - 6, 9, 11, 0, Math.PI, 0); g.lineTo(mx + 7, my + 2); g.lineTo(mx - 11, my + 2); g.fill();
      g.strokeStyle = wood; g.lineWidth = 2; g.strokeRect(mx - 11, my - 15, 18, 17);
      g.strokeStyle = '#7d7368'; g.lineWidth = 1.5; const [r1, r2] = iso(1.2, 1.9); g.beginPath(); g.moveTo(mx - 2, my + 2); g.lineTo(r1, r2); g.moveTo(mx + 4, my + 2); g.lineTo(r1 + 6, r2); g.stroke();
      box(g, 1.25, 1.35, 0.3, 0.25, 7, '#6b5240');
      g.fillStyle = '#9aa7b3'; g.beginPath(); g.arc(...iso(1.4, 1.45).map((v, i) => v - (i ? 9 : 0)), 3, 0, 7); g.fill();
      break;
    }
  }
}
// an empty plot: cleared ground with a wooden sign
function drawPlot(g, f) {
  poly(g, [iso(0.1, 0.1), iso(f - 0.1, 0.1), iso(f - 0.1, f - 0.1), iso(0.1, f - 0.1)], 'rgba(120,92,58,.75)', 'rgba(60,40,20,.5)');
  const [px, py] = iso(f / 2, f / 2);
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 16); g.stroke();
  poly(g, [[px - 9, py - 22], [px + 9, py - 18], [px + 9, py - 11], [px - 9, py - 15]], '#a87a45', '#4f3218');
  g.strokeStyle = '#3a2616'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px - 4, py - 16); g.lineTo(px + 4, py - 14); g.stroke();
}
// scaffolding over a building under construction
ART.scaffold = (g, f, t) => {
  g.save();
  g.strokeStyle = '#8a5a2b'; g.lineWidth = 1.5;
  const h = 40 + f * 6;
  for (const [x, y] of [[0.2, f - 0.2], [f - 0.2, f - 0.2], [f - 0.2, 0.2]]) { const [px, py] = iso(x, y); g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - h); g.stroke(); }
  for (let k = 1; k <= 3; k++) {
    const [a1, b1] = iso(0.2, f - 0.2), [a2, b2] = iso(f - 0.2, f - 0.2), [a3, b3] = iso(f - 0.2, 0.2);
    const y = h * k / 4;
    g.beginPath(); g.moveTo(a1, b1 - y); g.lineTo(a2, b2 - y); g.lineTo(a3, b3 - y); g.stroke();
  }
  // a hammer that swings
  const [hx, hy] = iso(f / 2, f);
  g.translate(hx + 10, hy - 26); g.rotate(Math.sin(t / 140) * 0.7 - 0.3);
  g.fillStyle = '#6b4a2a'; g.fillRect(-1, 0, 2, 11); g.fillStyle = '#b6c3cf'; g.fillRect(-4, -2, 8, 4);
  g.restore();
};

// ================================================================ the city ground and walls
ART.grass = (g, x, y, k) => {
  const r = rnd(x * 73856093 ^ y * 19349663)();
  poly(g, [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)], mix('#4f6a2e', '#6b8a3a', r * 0.8 * k + 0.1 * (1 - k)));
};
ART.road = (g, x, y) => poly(g, [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)], '#9b8361', 'rgba(70,52,30,.25)');
ART.wallSegment = (g, x, y, w, d, stone, h = 20) => {
  const b = box(g, x, y, w, d, h, stone);
  // crenellations along the top front edges
  const n = Math.max(2, Math.round((w + d) * 2));
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(i / n);
  for (const t of pts) {
    if (d > w) { const p = [b.D[0] + (b.A[0] - b.D[0]) * t, b.D[1] + (b.A[1] - b.D[1]) * t]; poly(g, [[p[0] - 3, p[1]], [p[0] + 3, p[1] - 1.5], [p[0] + 3, p[1] - 6.5], [p[0] - 3, p[1] - 5]], shade(stone, 0.95), EDGE); }
    else { const p = [b.A[0] + (b.B[0] - b.A[0]) * t, b.A[1] + (b.B[1] - b.A[1]) * t]; poly(g, [[p[0] - 3, p[1] + 1.5], [p[0] + 3, p[1]], [p[0] + 3, p[1] - 5], [p[0] - 3, p[1] - 3.5]], shade(stone, 0.95), EDGE); }
  }
  return b;
};
ART.wallTower = (g, x, y, stone, roof, h = 34) => {
  const b = box(g, x, y, 1, 1, h, stone);
  crenels(g, b, stone);
  roofCone(g, (b.A[0] + b.C[0]) / 2, (b.A[1] + b.C[1]) / 2 - 3, 20, 20, roof);
  return b;
};

// ================================================================ trees, rocks, mountains
function drawPine(g, x, y, s = 1) {
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x + 3 * s, y, 7 * s, 3 * s, 0, 0, 7); g.fill();
  g.fillStyle = '#5a3a20'; g.fillRect(x - 1.2 * s, y - 5 * s, 2.4 * s, 5 * s);
  for (let k = 0; k < 3; k++) {
    const w = (9 - k * 2) * s, yy = y - 4 * s - k * 6 * s;
    g.fillStyle = k === 2 ? '#3f7a3a' : k === 1 ? '#356b33' : '#2c5a2b';
    g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 10 * s); g.lineTo(x + w, yy); g.closePath(); g.fill();
  }
}
function drawOak(g, x, y, s = 1) {
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x + 3 * s, y, 8 * s, 3.5 * s, 0, 0, 7); g.fill();
  g.fillStyle = '#5a3a20'; g.fillRect(x - 1.5 * s, y - 7 * s, 3 * s, 7 * s);
  for (const [dx, dy, r, c] of [[-4, -11, 6, '#3d6b2e'], [4, -12, 6, '#46782f'], [0, -16, 7, '#4f8636']]) { g.fillStyle = c; g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); g.fill(); }
}
ART.pine = drawPine; ART.oak = drawOak;
ART.treeSprite = (kind, s = 1) => sprite(`tree:${kind}:${s}`, 26 * s, 34 * s, g => (kind === 'pine' ? drawPine : drawOak)(g, 13 * s, 30 * s, s));
ART.mountainSprite = (s, snow) => sprite(`mtn:${s}:${snow ? 1 : 0}`, 40 * s, 30 * s, g => {
  const w = 40 * s, h = 30 * s;
  poly(g, [[0, h], [w * 0.45, h * 0.08], [w, h]], '#5b524b');
  poly(g, [[w * 0.45, h * 0.08], [w, h], [w * 0.55, h]], '#3f3833');
  if (snow) poly(g, [[w * 0.33, h * 0.36], [w * 0.45, h * 0.08], [w * 0.58, h * 0.36], [w * 0.5, h * 0.3], [w * 0.42, h * 0.38]], '#e4e8ec');
  poly(g, [[w * 0.58, h], [w * 0.78, h * 0.4], [w * 1.0, h]], '#4c443e');
});

// ================================================================ world-map sprites
// a city on the world map: hamlet, keep, castle, grand castle by Town Hall level, in its guild colour
ART.mapCity = (civId, guildColor, hall, mine) => {
  const tier = hall >= 20 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1;
  const civ = A.CIV[civId] || A.CIVS[0];
  return sprite(`mc:${civId}:${guildColor || '-'}:${tier}:${mine ? 1 : 0}`, 64, 64, g => {
    g.translate(32, 44);
    g.scale(0.42 + tier * 0.06, 0.42 + tier * 0.06);
    const col = guildColor || '#9a8f80';
    poly(g, [iso(-1.2, -1.2), iso(1.2, -1.2), iso(1.2, 1.2), iso(-1.2, 1.2)], mine ? 'rgba(242,193,78,.55)' : 'rgba(30,20,12,.35)');
    if (tier >= 2) { for (const [x, y] of [[-1.1, -1.1], [0.6, -1.1], [-1.1, 0.6], [0.6, 0.6]]) { const t = box(g, x, y, 0.5, 0.5, 26 + tier * 4, civ.stone); roofCone(g, (t.A[0] + t.C[0]) / 2, (t.A[1] + t.C[1]) / 2, 11, 14, col); } }
    const b = box(g, -0.7, -0.7, 1.4, 1.4, 20 + tier * 6, civ.stone);
    windows(g, b, 'L', 2, 1, true);
    const p = roofFor(g, b, civ.id, 12 + tier * 2, col);
    if (tier >= 3) { const t = box(g, -0.3, -0.3, 0.6, 0.6, 40 + tier * 8, shade(civ.stone, 1.05)); roofHip(g, t, 18, col); }
    flag(g, p[0], p[1] + 2, col, 16);
  });
};
ART.mapFort = (ownerColor, capital) => sprite(`mf:${ownerColor || '-'}:${capital ? 1 : 0}`, 96, 96, g => {
  g.translate(48, 66);
  g.scale(capital ? 0.62 : 0.5, capital ? 0.62 : 0.5);
  const stone = capital ? '#8c7a62' : '#6f6a64', col = ownerColor || '#8c847a', roof = capital ? '#e9b45e' : col;
  poly(g, [iso(-2, -2), iso(2, -2), iso(2, 2), iso(-2, 2)], 'rgba(30,20,12,.4)');
  ART.wallSegment(g, -1.8, -1.8, 3.6, 0.35, stone, 22);
  ART.wallSegment(g, -1.8, -1.45, 0.35, 3.25, stone, 22);
  const keep = box(g, -0.8, -0.8, 1.6, 1.6, capital ? 64 : 46, shade(stone, 1.05));
  windows(g, keep, 'L', 2, 2, true); windows(g, keep, 'R', 2, 2, true);
  const p = capital ? roofDome(g, keep, 30, roof) : roofHip(g, keep, 26, roof);
  ART.wallSegment(g, 1.45, -1.45, 0.35, 3.25, stone, 22);
  ART.wallSegment(g, -1.45, 1.45, 3.25, 0.35, stone, 22);
  for (const [x, y] of [[-2, -2], [1.4, -2], [-2, 1.4], [1.4, 1.4]]) ART.wallTower(g, x, y, stone, roof, 34);
  flag(g, p[0], p[1] + 2, col, 24);
  if (capital) { g.fillStyle = '#ffd36b'; g.beginPath(); g.moveTo(p[0] - 10, p[1] - 20); g.lineTo(p[0] - 10, p[1] - 30); g.lineTo(p[0] - 5, p[1] - 24); g.lineTo(p[0], p[1] - 34); g.lineTo(p[0] + 5, p[1] - 24); g.lineTo(p[0] + 10, p[1] - 30); g.lineTo(p[0] + 10, p[1] - 20); g.closePath(); g.fill(); }
});
ART.mapRuin = () => sprite('mr', 48, 48, g => {
  g.translate(24, 36);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(2, 2, 18, 6, 0, 0, 7); g.fill();
  for (const [x, h] of [[-12, 22], [-4, 12], [4, 26], [12, 16]]) { g.fillStyle = '#a69d8e'; g.fillRect(x - 3, -h, 6, h); g.fillStyle = '#7e7668'; g.fillRect(x + 1, -h, 2, h); }
  g.fillStyle = '#a69d8e'; g.fillRect(-15, -26, 22, 4);
  g.fillStyle = '#5b8a3a'; g.beginPath(); g.arc(-8, -2, 4, 0, 7); g.arc(9, -1, 3, 0, 7); g.fill();
});
ART.mapCamp = lv => sprite(`mcamp:${Math.min(3, Math.ceil(lv / 3))}`, 48, 48, g => {
  g.translate(24, 36);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(2, 2, 18, 6, 0, 0, 7); g.fill();
  const tents = Math.min(3, Math.ceil(lv / 3));
  const at = [[-8, -2], [8, 0], [0, 4]].slice(0, tents);
  for (const [x, y] of at) {
    poly(g, [[x - 9, y], [x, y - 15], [x + 9, y]], '#9a3b2d', EDGE);
    poly(g, [[x, y - 15], [x + 9, y], [x + 3, y]], '#6e2a20');
    poly(g, [[x - 2, y], [x, y - 6], [x + 2, y]], '#2a120e');
  }
  g.fillStyle = '#ff9a3c'; g.beginPath(); g.arc(-1, -8, 2.5, 0, 7); g.fill();
  flag(g, 12, -4, '#2a1a12', 16);
});
ART.mapField = res => sprite(`mfield:${res}`, 48, 48, g => {
  g.translate(24, 34);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(2, 2, 17, 6, 0, 0, 7); g.fill();
  if (res === 'food') { poly(g, [iso(-0.4, -0.4), iso(0.4, -0.4), iso(0.4, 0.4), iso(-0.4, 0.4)], '#c9a845', EDGE); for (let i = 0; i < 4; i++) { const t = -0.3 + i * 0.2; const [a, b] = iso(-0.35, t), [c, d] = iso(0.35, t); g.strokeStyle = '#a07e28'; g.lineWidth = 2; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); } }
  else if (res === 'wood') { drawPine(g, -8, 2, 0.8); drawPine(g, 6, 4, 0.9); drawOak(g, 0, -2, 0.7); }
  else if (res === 'stone') { for (const [x, y, r] of [[-7, 0, 7], [5, 2, 8], [0, -6, 6]]) { g.fillStyle = '#a7a39c'; g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, 7); g.fill(); g.fillStyle = '#7d7a74'; g.beginPath(); g.ellipse(x + r * 0.3, y + r * 0.2, r * 0.5, r * 0.4, 0, 0, 7); g.fill(); } }
  else if (res === 'iron') { g.fillStyle = '#4a423b'; g.beginPath(); g.moveTo(-16, 4); g.quadraticCurveTo(0, -22, 16, 4); g.fill(); g.fillStyle = '#16100c'; g.beginPath(); g.ellipse(0, 0, 5, 7, 0, Math.PI, 0); g.lineTo(5, 4); g.lineTo(-5, 4); g.fill(); g.strokeStyle = '#8a5a2b'; g.lineWidth = 2; g.strokeRect(-6, -8, 12, 12); }
  else if (res === 'gold') { for (const [x, y, r] of [[-6, 0, 6], [6, 1, 7], [0, -6, 5]]) { g.fillStyle = '#e9b84a'; g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, 7); g.fill(); g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.2, r * 0.25, 0, 7); g.fill(); } }
});

// ================================================================ soldiers (armies on the map and the battle scene)
// type: inf | cav | arc | sie; col: the side's colour; frame 0/1 for a walk cycle; faces right
ART.soldier = (type, col, frame = 0, s = 1) => sprite(`sol:${type}:${col}:${frame}:${s}`, 30 * s, 30 * s, g => {
  g.scale(s, s);
  g.translate(15, 26);
  const skin = '#e4c7a5', dark = shade(col, 0.6), metal = '#b6c3cf';
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(0, 1, 8, 2.5, 0, 0, 7); g.fill();
  const step = frame ? 2 : -2;
  if (type === 'cav') {
    g.fillStyle = '#7a5230';
    g.beginPath(); g.ellipse(0, -7, 9, 4.5, 0, 0, 7); g.fill();
    g.fillRect(-7, -6, 2, 7 + (frame ? 1 : -1)); g.fillRect(5, -6, 2, 7 + (frame ? -1 : 1));
    g.beginPath(); g.moveTo(7, -9); g.lineTo(12, -15); g.lineTo(13, -12); g.lineTo(9, -6); g.fill();
    g.fillStyle = col; g.fillRect(-3, -17, 6, 8);
    g.fillStyle = skin; g.beginPath(); g.arc(0, -19.5, 2.6, 0, 7); g.fill();
    g.fillStyle = metal; g.fillRect(-2.6, -22.5, 5.2, 2.2);
    g.strokeStyle = '#6b4a2a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-2, -12); g.lineTo(14, -20); g.stroke();
    g.fillStyle = metal; g.beginPath(); g.moveTo(14, -20); g.lineTo(17, -22); g.lineTo(15, -19); g.fill();
    return;
  }
  if (type === 'sie') {
    g.fillStyle = '#7a5230'; g.fillRect(-10, -6, 20, 3);
    g.strokeStyle = '#7a5230'; g.lineWidth = 2; g.beginPath(); g.moveTo(-4, -5); g.lineTo(5, -17 + (frame ? 2 : 0)); g.stroke();
    g.fillStyle = '#6d6560'; g.beginPath(); g.arc(6, -18 + (frame ? 2 : 0), 2.6, 0, 7); g.fill();
    g.fillStyle = '#3a2616'; g.beginPath(); g.arc(-7, -2, 2.5, 0, 7); g.arc(7, -2, 2.5, 0, 7); g.fill();
    g.fillStyle = col; g.fillRect(-12, -14, 4, 8);
    return;
  }
  // foot soldiers
  g.strokeStyle = dark; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(-1, -7); g.lineTo(-1 - step, 0); g.moveTo(1, -7); g.lineTo(1 + step, 0); g.stroke();
  g.fillStyle = col; g.fillRect(-3.5, -15, 7, 9);
  g.fillStyle = skin; g.beginPath(); g.arc(0, -17.5, 2.8, 0, 7); g.fill();
  g.fillStyle = metal; g.beginPath(); g.arc(0, -18.5, 3, Math.PI, 0); g.fill();
  if (type === 'inf') {
    g.fillStyle = shade(col, 0.8); g.strokeStyle = '#1c1712'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(3, -14); g.lineTo(8, -13); g.lineTo(8, -7); g.lineTo(5.5, -5); g.lineTo(3, -7); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = metal; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-3, -12); g.lineTo(-7, -21); g.stroke();
  } else {
    g.strokeStyle = '#8a5a2b'; g.lineWidth = 1.5; g.beginPath(); g.arc(5, -12, 6, -1.2, 1.2); g.stroke();
    g.strokeStyle = '#d6c7b2'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(7.2, -17.6); g.lineTo(7.2, -6.4); g.stroke();
  }
});
// a small army token for the world map: banner plus three soldiers of its main type
ART.armyToken = (type, col, frame) => sprite(`army:${type}:${col}:${frame}`, 44, 36, g => {
  ART.put(g, ART.soldier(type, col, frame, 0.8), 0, 10);
  ART.put(g, ART.soldier(type, col, 1 - frame, 0.8), 12, 6);
  ART.put(g, ART.soldier(type, col, frame, 0.8), 20, 12);
  flag(g, 22, 22, col, 20, frame);
});
// a burst of steel and dust where a battle happens
ART.clash = (g, x, y, r, t) => {
  g.save();
  g.globalAlpha = 0.65;
  for (let k = 0; k < 6; k++) {
    const a = t / 300 + k * 1.05, d = r * (0.4 + 0.3 * Math.sin(t / 200 + k));
    g.fillStyle = k % 2 ? 'rgba(180,160,130,.6)' : 'rgba(120,100,80,.5)';
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, r * 0.35, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  g.translate(x, y - r * 0.2);
  g.rotate(Math.sin(t / 120) * 0.15);
  g.strokeStyle = '#e9e4da'; g.lineWidth = Math.max(1.5, r * 0.12); g.lineCap = 'round';
  g.beginPath(); g.moveTo(-r * 0.5, -r * 0.5); g.lineTo(r * 0.5, r * 0.5); g.moveTo(r * 0.5, -r * 0.5); g.lineTo(-r * 0.5, r * 0.5); g.stroke();
  g.restore();
};
// a commander portrait as a canvas (for the battle scene)
ART.portrait = (cmdId, size) => sprite(`por:${cmdId}:${size}`, size, size, g => {
  const c = A.CMD[cmdId]; const civ = A.CIV[c?.civ] || A.CIVS[0];
  const s = size / 48;
  g.scale(s, s);
  g.fillStyle = civ.roof; g.fillRect(1.5, 1.5, 45, 45);
  g.strokeStyle = c?.rarity === 'legendary' ? '#e2b04a' : '#a07ad0'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 45, 45);
  g.fillStyle = '#e4c7a5'; g.beginPath(); g.arc(24, 19, 8, 0, 7); g.fill();
  g.fillStyle = civ.color; g.beginPath(); g.moveTo(10, 42); g.quadraticCurveTo(24, 22, 38, 42); g.fill();
  g.fillStyle = civ.stone; g.beginPath(); g.moveTo(15, 17); g.quadraticCurveTo(24, 4, 33, 17); g.quadraticCurveTo(24, 12, 15, 17); g.fill();
});
// a townsperson for the city streets: tunic colour, walk frame, a sack on some
ART.villager = (col, frame, sack) => sprite(`vil:${col}:${frame}:${sack ? 1 : 0}`, 16, 22, g => {
  g.translate(8, 20);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 0.5, 5, 1.6, 0, 0, 7); g.fill();
  const st = frame ? 1.6 : -1.6;
  g.strokeStyle = '#4a3424'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-0.8, -5); g.lineTo(-0.8 - st, 0); g.moveTo(0.8, -5); g.lineTo(0.8 + st, 0); g.stroke();
  g.fillStyle = col; g.beginPath(); g.moveTo(-3, -12); g.lineTo(3, -12); g.lineTo(3.6, -4.5); g.lineTo(-3.6, -4.5); g.closePath(); g.fill();
  g.fillStyle = '#e4c7a5'; g.beginPath(); g.arc(0, -14.2, 2.3, 0, 7); g.fill();
  g.fillStyle = '#5a3a20'; g.beginPath(); g.arc(0, -15, 2.4, Math.PI, 0); g.fill();
  if (sack) { g.fillStyle = '#c9a36a'; g.beginPath(); g.ellipse(-3.2, -11, 2.6, 3.2, -0.3, 0, 7); g.fill(); }
});
// chimney smoke: a few soft puffs rising and fading, phase from the clock
ART.smoke = (g, x, y, t, k = 1, seed = 0) => {
  for (let i = 0; i < 4; i++) {
    const p = ((t / 2600 + i / 4 + seed * 0.37) % 1);
    const r = (3 + p * 7) * k;
    g.fillStyle = `rgba(120,112,104,${(0.42 * (1 - p)).toFixed(3)})`;
    g.beginPath(); g.arc(x + Math.sin(p * 4 + seed) * 4 * k + p * 8 * k, y - p * 34 * k, r, 0, 7); g.fill();
  }
};
// a green "can upgrade" arrow
ART.upArrow = () => sprite('uparrow', 22, 26, g => {
  g.translate(11, 2);
  poly(g, [[0, 0], [10, 11], [4.5, 11], [4.5, 23], [-4.5, 23], [-4.5, 11], [-10, 11]], '#5fd35a', '#173d14', 1.6);
  poly(g, [[0, 3], [6, 9.5], [2, 9.5], [2, 20], [-1, 20], [-1, 9.5], [-5, 9.5]], 'rgba(255,255,255,.35)');
});
