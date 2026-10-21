/* Age of Conquest battle scene: a battle report played out with soldiers. The two armies march in, clash and fall
   round by round exactly as the report's recorded rounds say (troops left, morale, walls), commanders' skills flash
   up as they fire, archers loose arrows, siege engines hurl stones at the walls, and the beaten side runs. The
   written report sits behind a Details button. */

const A = window.AOC;
const U = window.AOCUI;
const ART = U.art;
const { esc, fmt } = U;

const COL = { a: '#c0463c', d: '#3f68b8' };
const FIGS = 34;     // soldiers drawn per side at full strength
const ROWS = 5;

// painted soldier frames (art/sprites): how many of each, and how wide each type is drawn at scale 1
const FRAMES = { inf: { walk: 6, attack: [1, 3, 4, 5], fall: 3 }, cav: { walk: 6, attack: [1, 2, 3, 4], fall: 3 }, arc: { walk: 6, attack: [3, 4], fall: 3 }, sie: { walk: 4, attack: [3], fall: 2 } };
const PW = { inf: 30, cav: 40, arc: 28, sie: 40 };
function paintFrame(f, t, alive, fighting) {
  const F = FRAMES[f.u];
  if (!alive) return `${f.u}-fall-${Math.min(F.fall, 1 + Math.floor((t - f.dead) / 140))}`;
  if (fighting) {
    // archers and siege engines loose their shots now and then; the melee swings in a loop
    if (f.u === 'sie') return Math.floor(t / 600 + f.seed) % 3 === 0 ? 'sie-attack-3' : 'sie-walk-4';
    if (f.u === 'arc') return Math.floor(t / 260 + f.seed) % 3 === 0 ? 'arc-walk-1' : `arc-attack-${F.attack[Math.floor(t / 260 + f.seed) % 2]}`;
    return `${f.u}-attack-${F.attack[Math.floor(t / 150 + f.seed) % F.attack.length]}`;
  }
  return `${f.u}-walk-${1 + Math.floor(t / 110 + f.seed) % F.walk}`;
}
function layout(units, side) {
  const tot = A.troopsTotal(units) || 1;
  const order = ['inf', 'cav', 'arc', 'sie'];
  const counts = {};
  let n = 0;
  for (const u of order) { counts[u] = units[u] > 0 ? Math.max(1, Math.round(FIGS * units[u] / tot)) : 0; n += counts[u]; }
  const figs = [];
  let slot = 0;
  for (const u of order) {
    // a new column for each unit type, so infantry hold the front and siege the back
    if (counts[u] && slot % ROWS) slot += ROWS - (slot % ROWS);
    for (let i = 0; i < counts[u]; i++, slot++) figs.push({ u, col: Math.floor(slot / ROWS), row: slot % ROWS, side, seed: (slot * 2654435761 + (side === 'a' ? 7 : 13)) >>> 0, dead: -1 });
  }
  // who falls first: mostly the front, a little random
  const rnd = ART.rnd(side === 'a' ? 99 : 199);
  const byRisk = figs.map(f => ({ f, k: f.col + rnd() * 2.2 + (f.u === 'sie' ? 3 : 0) })).sort((x, y) => x.k - y.k);
  byRisk.forEach((x, i) => { x.f.order = i; });
  return { figs, n };
}

U.battleScene = r => {
  const { input, res } = r;
  const view = r.view || 'a';
  const wrap = U.el(`<div class="aoc-bscene"><canvas class="aoc-bscene-cv" aria-label="The battle, played out"></canvas>
    <div class="aoc-bscene-ctl"><button type="button" class="aoc-iconbtn" data-bs="replay" aria-label="Watch again">${U.icon('replay', 20)}</button><button type="button" class="aoc-iconbtn" data-bs="skip" aria-label="Skip to the end">${U.icon('next', 20)}</button></div></div>`);
  const cv = wrap.querySelector('canvas');
  const g = cv.getContext('2d');
  const L = { a: layout(input.a.units, 'a'), d: layout(input.d.units, 'd') };
  const start = { a: Math.max(1, A.troopsTotal(res.a.start)), d: Math.max(1, A.troopsTotal(res.d.start)) };
  const endTot = { a: A.troopsTotal(res.a.end), d: A.troopsTotal(res.d.end) };
  const R = res.rounds.length;
  const T0 = 900, D = Math.max(330, Math.min(650, 7000 / Math.max(1, R))), TEND = T0 + R * D, TFLEE = TEND + 900, TALL = TFLEE + 1400;
  const wall = input.wall && input.wall.max > 0 ? input.wall : null;
  const ter = A.TERRAIN[input.terrain] || A.TERRAIN[1];
  let W = 360, Hh = 230, dpr = 1, t0 = performance.now(), raf = 0, stopped = false, seen = new Set(), shots = [], banners = [], lastShot = { a: 0, d: 0 };
  const size = () => {
    const w = Math.max(260, Math.round(wrap.getBoundingClientRect().width || 360));
    const h = Math.round(Math.min(300, Math.max(200, w * 0.52)));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === W && h === Hh && cv.width === Math.round(w * dpr)) return;
    W = w; Hh = h;
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    cv.style.width = W + 'px'; cv.style.height = Hh + 'px';
  };
  // troops left and morale at a moment of the timeline, eased between rounds
  const stateAt = t => {
    if (t <= T0) return { a: start.a, d: start.d, am: input.a.morale, dm: input.d.morale, wall: wall ? wall.dur : -1, k: 0 };
    if (t >= TEND) {
      const last = res.rounds[R - 1] || [start.a, start.d, input.a.morale, input.d.morale, wall ? wall.dur : -1];
      const u = Math.min(1, (t - TEND) / (TFLEE - TEND));
      return { a: last[0] + (endTot.a - last[0]) * u, d: last[1] + (endTot.d - last[1]) * u, am: last[2], dm: last[3], wall: last[4], k: R };
    }
    const x = (t - T0) / D, k = Math.min(R, Math.floor(x) + 1), fr = x - Math.floor(x);
    const prev = k > 1 ? res.rounds[k - 2] : [start.a, start.d, input.a.morale, input.d.morale, wall ? wall.dur : -1];
    const cur = res.rounds[k - 1];
    const e = fr < 0.5 ? 2 * fr * fr : 1 - Math.pow(-2 * fr + 2, 2) / 2;
    return { a: prev[0] + (cur[0] - prev[0]) * e, d: prev[1] + (cur[1] - prev[1]) * e, am: prev[2] + (cur[2] - prev[2]) * e, dm: prev[3] + (cur[3] - prev[3]) * e, wall: cur[4] >= 0 ? prev[4] + (cur[4] - prev[4]) * e : -1, k };
  };
  const backdrop = () => {
    const sky = g.createLinearGradient(0, 0, 0, Hh * 0.45);
    sky.addColorStop(0, '#1a1210'); sky.addColorStop(0.7, '#4a2412'); sky.addColorStop(1, '#7a3a18');
    g.fillStyle = sky; g.fillRect(0, 0, W, Hh * 0.45);
    g.fillStyle = '#2a201b';
    g.beginPath(); g.moveTo(0, Hh * 0.42);
    for (let i = 0; i <= 8; i++) g.lineTo(W * i / 8, Hh * (0.25 + 0.12 * Math.abs(Math.sin(i * 1.7 + input.terrain))));
    g.lineTo(W, Hh * 0.45); g.lineTo(0, Hh * 0.45); g.closePath(); g.fill();
    const gr = g.createLinearGradient(0, Hh * 0.42, 0, Hh);
    gr.addColorStop(0, ART.shade(ter.color, 0.7)); gr.addColorStop(1, ART.shade(ter.color, 1.15));
    g.fillStyle = gr; g.fillRect(0, Hh * 0.42, W, Hh * 0.58);
    const rnd = ART.rnd(31 + input.terrain);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${(0.05 + rnd() * 0.08).toFixed(3)})`; g.beginPath(); g.ellipse(rnd() * W, Hh * (0.48 + rnd() * 0.5), 6 + rnd() * 20, 2 + rnd() * 4, 0, 0, 7); g.fill(); }
  };
  const figPos = (f, t, alive, fleeing) => {
    const k = Math.max(0.75, Math.min(1.35, W / 440));
    const dir = f.side === 'a' ? 1 : -1;
    const center = W / 2 + (wall ? W * 0.08 : 0);
    const home = f.side === 'a' ? W * 0.36 : W * 0.64 + (wall ? W * 0.12 : 0);
    const gap = 17 * k;
    let x = home - dir * f.col * gap - dir * (f.row % 2) * 5;
    const y = Hh * 0.55 + f.row * (Hh * 0.075) + ((f.seed % 7) - 3);
    // marching in from the edge
    const inK = Math.min(1, t / T0);
    x -= dir * (1 - inK) * W * 0.45;
    // melee troops press toward the middle while the battle lasts
    const melee = f.u === 'inf' || f.u === 'cav';
    if (melee && t > T0 && t < TEND + 400) {
      const press = Math.min(1, (t - T0) / 500) * (wall && f.side === 'd' ? 0.2 : 1);
      const front = center - dir * (8 + f.col * gap * 0.55);
      x += (front - x) * press * 0.85;
      x += Math.sin(t / 90 + f.seed) * 2;
    }
    if (fleeing && alive) x -= dir * Math.max(0, t - TFLEE + 300) * 0.22;
    return [x, y, k];
  };
  const draw = now => {
    raf = 0;
    if (stopped) return;
    size();
    const t = now - t0;
    const st = stateAt(t);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    backdrop();
    const loser = res.winner === 'a' ? 'd' : 'a';
    // the wall in front of the defenders, cracking as it loses durability
    if (wall) {
      const wx = W * 0.6, top = Hh * 0.5, frac = Math.max(0, st.wall) / wall.max;
      const hgt = Hh * 0.32 * (0.35 + 0.65 * frac);
      g.fillStyle = '#6f6a64'; g.fillRect(wx, top + Hh * 0.32 - hgt, 18, hgt + Hh * 0.18);
      g.fillStyle = '#58534e'; g.fillRect(wx + 12, top + Hh * 0.32 - hgt, 6, hgt + Hh * 0.18);
      for (let i = 0; i < 4; i++) g.fillRect(wx + i * 5, top + Hh * 0.32 - hgt - 5, 3, 5);
      if (frac < 0.6) { g.strokeStyle = '#2a2420'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(wx + 4, top + Hh * 0.32 - hgt + 6); g.lineTo(wx + 10, top + Hh * 0.4); g.lineTo(wx + 6, top + Hh * 0.46); g.stroke(); }
    }
    // soldiers, back rows first
    const all = [];
    for (const s of ['a', 'd']) {
      const lay = L[s];
      const n = lay.figs.length;
      const left = Math.ceil(n * Math.max(0, s === 'a' ? st.a : st.d) / start[s] - 1e-9);
      for (const f of lay.figs) {
        const alive = f.order >= n - left;
        if (!alive && f.dead < 0) f.dead = t;
        if (alive) f.dead = -1;
        all.push(f);
      }
    }
    all.sort((x, y) => x.row - y.row);
    for (const f of all) {
      const alive = f.dead < 0;
      const fleeing = t > TFLEE - 300 && f.side === loser;
      const [x, y, k] = figPos(f, alive ? t : f.dead, alive, fleeing);
      const flip = f.side === 'd' ? !fleeing || !alive : fleeing && alive;
      // painted soldiers: walking in, fighting while the lines are engaged, falling when they die
      const fighting = alive && !fleeing && t > T0 && t < TEND + 400;
      const pn = paintFrame(f, t, alive, fighting);
      g.fillStyle = COL[f.side]; g.globalAlpha = alive ? 0.5 : 0.25; g.beginPath(); g.ellipse(x, y, 7 * k, 2.4 * k, 0, 0, 7); g.fill(); g.globalAlpha = 1;
      if (!alive) g.globalAlpha = 1 - 0.45 * Math.min(1, (t - f.dead) / 900);
      const drawn = pn && ART.paint(g, pn, x, y + 1 * k, PW[f.u] * k, flip);
      g.globalAlpha = 1;
      if (!drawn) {
        const frame = alive ? Math.floor(t / 180 + f.seed) % 2 : 0;
        const spr = ART.soldier(f.u, COL[f.side], frame, 1);
        g.save();
        g.translate(x, y);
        if (flip) g.scale(-1, 1);
        if (!alive) { const fall = Math.min(1, (t - f.dead) / 300); g.globalAlpha = 1 - 0.55 * fall; g.rotate((f.side === 'a' ? -1 : 1) * fall * 1.45); }
        ART.put(g, spr, 0, 0, 15, 26, k);
        g.restore();
      }
    }
    // arrows and stones
    if (t > T0 && t < TEND) {
      for (const s of ['a', 'd']) {
        const arc = L[s].figs.filter(f => f.dead < 0 && (f.u === 'arc' || f.u === 'sie'));
        if (arc.length && t - lastShot[s] > 140) {
          lastShot[s] = t;
          const f = arc[Math.floor((t / 37 + s.length * 3) % arc.length)];
          const [x, y] = figPos(f, t, true, false);
          const tx = f.u === 'sie' && s === 'a' && wall ? W * 0.6 + 6 : W / 2 + (s === 'a' ? 30 : -30) + ((t * 13) % 40) - 20;
          shots.push({ x, y: y - 14, tx, ty: Hh * (0.58 + ((t * 7) % 30) / 100), t0: t, dur: 520, stone: f.u === 'sie' });
        }
      }
    }
    shots = shots.filter(p => t - p.t0 < p.dur);
    for (const p of shots) {
      const u = (t - p.t0) / p.dur;
      const x = p.x + (p.tx - p.x) * u, y = p.y + (p.ty - p.y) * u - Math.sin(u * Math.PI) * Hh * 0.18;
      if (p.stone) { g.fillStyle = '#7d7368'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); }
      else { const ang = Math.atan2((p.ty - p.y) - Math.cos(u * Math.PI) * Hh * 0.18 * Math.PI, p.tx - p.x); g.strokeStyle = '#e8dcc4'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(ang) * 7, y - Math.sin(ang) * 7); g.stroke(); }
    }
    // dust and steel where the lines meet
    if (t > T0 + 300 && t < TEND + 200) {
      const cx = W / 2 + (wall ? W * 0.08 : 0);
      for (let i = 0; i < 3; i++) ART.clash(g, cx + Math.sin(t / 400 + i * 2.1) * 14, Hh * (0.62 + i * 0.1), 9 + 3 * Math.sin(t / 150 + i), t + i * 300);
    }
    // skills as they fire
    for (const c of res.casts) {
      const at = c.r === 0 ? T0 - 200 : T0 + (c.r - 1) * D;
      const key = c.r + c.side + c.name;
      if (t >= at && !seen.has(key)) { seen.add(key); banners.push({ ...c, t0: t, cmd: input[c.side].cmd?.id }); }
    }
    banners = banners.filter(b => t - b.t0 < 1500);
    let stackA = 0, stackD = 0;
    for (const b of banners) {
      const u = (t - b.t0) / 1500, slide = Math.min(1, u * 6), fade = u > 0.8 ? (1 - u) / 0.2 : 1;
      const left = b.side === 'a';
      const y = Hh * 0.2 + (left ? stackA++ : stackD++) * 38;
      const w = Math.min(W * 0.46, 190), x = left ? -w + w * slide + 6 : W - w * slide - 6;
      g.globalAlpha = fade;
      g.fillStyle = left ? 'rgba(95,18,20,.92)' : 'rgba(27,44,90,.92)';
      g.fillRect(x, y, w, 32);
      g.strokeStyle = '#e9b45e'; g.lineWidth = 1.5; g.strokeRect(x + 0.5, y + 0.5, w - 1, 31);
      if (b.cmd) g.drawImage(ART.portrait(b.cmd, 28), x + 2, y + 2, 28, 28);
      g.fillStyle = '#ffe9a8'; g.font = '700 12px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(b.name, x + 36, y + 16.5, w - 40);
      g.globalAlpha = 1;
    }
    // the counts and morale of both sides
    const hud = (s, x, align) => {
      const n = Math.max(0, Math.round(s === 'a' ? st.a : st.d)), m = Math.max(0, s === 'a' ? st.am : st.dm);
      g.textAlign = align; g.textBaseline = 'alphabetic';
      g.font = '800 18px Barlow, sans-serif'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(fmt(n), x, 24); g.fillStyle = '#fff4e0'; g.fillText(fmt(n), x, 24);
      g.font = '600 11px Barlow, sans-serif'; g.fillStyle = '#d6c7b2'; g.strokeText(input[s].label, x, 40); g.fillText(input[s].label, x, 40);
      const bw = Math.min(110, W * 0.3), bx = align === 'left' ? x : x - bw;
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(bx, 46, bw, 5);
      g.fillStyle = COL[s]; g.fillRect(bx, 46, bw * Math.min(1, m / 100), 5);
    };
    hud('a', 10, 'left'); hud('d', W - 10, 'right');
    if (st.k > 0 && t < TEND) { g.textAlign = 'center'; g.font = '700 12px "Lilita One", "Arial Black", sans-serif'; g.fillStyle = '#e9b45e'; g.fillText(`Round ${st.k}`, W / 2, 22); }
    // the result
    if (t > TEND + 300) {
      const won = res.winner === view;
      const u = Math.min(1, (t - TEND - 300) / 400);
      const bw = Math.min(W * 0.8, 300), bh = 50, bx = W / 2 - bw / 2, by = Hh * 0.36 - (1 - u) * 20;
      g.globalAlpha = u;
      const banner = won ? 'banner-victory' : 'banner-defeat';
      let ly = by + bh + 4;
      if (ART.painted(banner) && ART.pimg(banner)) {
        // the painted banner hangs over the field; the loot sits under it
        const bwid = Math.min(W * 0.3, Hh * 0.42, 120);
        ART.paint(g, banner, W / 2, by + bh + 6, bwid);
        ly = by + bh + 10;
      } else {
      const rib = g.createLinearGradient(0, by, 0, by + bh);
      if (won) { rib.addColorStop(0, '#f6d58e'); rib.addColorStop(0.5, '#d9993f'); rib.addColorStop(1, '#8a5a1e'); } else { rib.addColorStop(0, '#d8564a'); rib.addColorStop(0.5, '#8a2420'); rib.addColorStop(1, '#4a0e0e'); }
      g.fillStyle = rib;
      g.beginPath(); g.moveTo(bx - 14, by + 6); g.lineTo(bx, by); g.lineTo(bx + bw, by); g.lineTo(bx + bw + 14, by + 6); g.lineTo(bx + bw, by + bh); g.lineTo(bx, by + bh); g.closePath(); g.fill();
      g.strokeStyle = won ? '#fff1c4' : '#ffb0a0'; g.lineWidth = 1.5; g.stroke();
      g.font = '800 28px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = won ? '#2a1606' : '#fff0e8';
      g.fillText(won ? (view === 'd' ? 'DEFENDED' : 'VICTORY') : 'DEFEAT', W / 2, by + bh / 2 + 1);
      }
      const loot = r.extra?.plunder;
      if (loot && t > TEND + 700) {
        const items = Object.entries(loot).filter(([, v]) => v > 0);
        const step = Math.min(68, (W - 20) / Math.max(1, items.length));
        let x = W / 2 - items.length * step / 2;
        g.fillStyle = 'rgba(12,9,7,.82)'; g.beginPath();
        if (g.roundRect) g.roundRect(x - 6, ly, items.length * step + 8, 26, 13); else g.rect(x - 6, ly, items.length * step + 8, 26);
        g.fill();
        g.font = '800 12px Barlow, sans-serif';
        for (const [res2, v] of items) { if (!ART.paint(g, 'icon-' + res2, x + 8, ly + 22, 18)) ART.put(g, U.iconCanvas(res2), x, ly + 4, 0, 0, 0.8); g.textAlign = 'left'; g.fillStyle = '#fff4e0'; g.fillText(`${view === 'a' ? '+' : '-'}${fmt(v)}`, x + 20, ly + 14); x += step; }
      }
      g.globalAlpha = 1;
    }
    if (t < TALL) raf = requestAnimationFrame(draw);
  };
  const restart = () => { t0 = performance.now(); seen = new Set(); shots = []; banners = []; lastShot = { a: 0, d: 0 }; for (const s of ['a', 'd']) for (const f of L[s].figs) f.dead = -1; if (!raf) raf = requestAnimationFrame(draw); };
  wrap.querySelector('[data-bs="replay"]').addEventListener('click', restart);
  wrap.querySelector('[data-bs="skip"]').addEventListener('click', () => { t0 = performance.now() - TALL + 1; banners = []; seen = new Set(res.casts.map(c => c.r + c.side + c.name)); if (!raf) raf = requestAnimationFrame(draw); });
  const ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(draw); });
  ro.observe(wrap);
  if (U.reduced) t0 = performance.now() - TALL + 1;
  requestAnimationFrame(() => { restart(); });
  return { el: wrap, stop() { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); }, get done() { return performance.now() - t0 >= TALL; } };
};
