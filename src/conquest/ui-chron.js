/* Age of Conquest history and rankings. History: the chronicle (filterable), maps of who held which land on each
   day, guild power over time and casualty records. Rankings: governors, guilds, achievements and the server's
   real population (every slot, who plays it, and how the simulation is spending its effort). */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, setText, setHtml } = U;

// ================================================================ history
const H = { filter: 'major', tab: 'chron', hist: null, day: -1, last: 0, busy: false, focus: [] };
function mountChron(root) {
  root.innerHTML = `<div class="aoc-scroll">
    <div class="aoc-seg" role="tablist"><button type="button" role="tab" data-htab="chron">Chronicle</button><button type="button" role="tab" data-htab="maps">Maps of the past</button><button type="button" role="tab" data-htab="power">Power and losses</button></div>
    <div class="aoc-htab"></div></div>`;
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-htab]'); if (t) { H.tab = t.dataset.htab; H.last = 0; renderChron(true); return; }
    const f = e.target.closest('[data-cf]'); if (f) { H.filter = f.dataset.cf; H.last = 0; renderChron(true); return; }
    const p = e.target.closest('[data-at]'); if (p) { const [x, y] = p.dataset.at.split(',').map(Number); U.mapFocus(x, y, 12); return; }
    const g = e.target.closest('[data-focusg]'); if (g) { const id = Number(g.dataset.focusg); H.focus = H.focus.includes(id) ? H.focus.filter(x => x !== id) : H.focus.concat(id).slice(-2); drawPower(); }
  });
  root.addEventListener('input', e => { if (e.target.matches('[data-day]')) { H.day = Number(e.target.value); drawMap(); } });
}
async function renderChron(force) {
  const root = document.querySelector('.aoc-screen-chron');
  if (!root || root.hidden || !U.F) return;
  root.querySelectorAll('[data-htab]').forEach(b => b.setAttribute('aria-selected', b.dataset.htab === H.tab ? 'true' : 'false'));
  if (!force && performance.now() - H.last < 4000) return;
  if (H.busy) return;
  H.busy = true;
  const box = root.querySelector('.aoc-htab');
  try {
    if (H.tab === 'chron') {
      const P = U.F.player;
      const c = await U.host.query('chronicle', { kind: H.filter === 'guild' ? null : H.filter, guild: H.filter === 'guild' ? P.guild : null });
      const chips = [['major', 'Major'], ['all', 'Everything'], ['war', 'Wars'], ['politics', 'Politics'], ['world', 'World'], ...(P.guild >= 0 ? [['guild', 'My guild']] : [])];
      setHtml(box, `<div class="aoc-chips">${chips.map(([k, l]) => `<button type="button" class="aoc-btn ${H.filter === k ? 'gold' : 'ghost'} tiny" data-cf="${k}">${l}</button>`).join('')}</div>
        <p class="aoc-muted aoc-small">${full(c.all)} events recorded since the server opened; showing the latest ${c.list.length} of ${full(c.total)} in this view.</p>
        <ol class="aoc-chron">${c.list.map(e => `<li class="imp-${e.imp}"><span class="aoc-chron-t">${A.clock(e.t)}</span><span class="aoc-chron-b">${e.g.slice(0, 2).map(gi => U.banner(U.F.guilds[gi], 16)).join('')}</span><span class="aoc-chron-x">${esc(e.txt)}${e.vis === 'secret' ? ' <span class="aoc-pill">secret</span>' : ''}</span>${e.x != null ? `<button type="button" class="aoc-btn ghost tiny" data-at="${e.x},${e.y}" aria-label="Show on the map">${U.icon('map', 14)}</button>` : ''}</li>`).join('')}</ol>`);
    } else {
      H.hist = await U.host.query('history');
      if (H.tab === 'maps') {
        const days = H.hist.days;
        if (H.day < 0 || !days.includes(H.day)) H.day = days[days.length - 1] ?? -1;
        setHtml(box, days.length ? `<p class="aoc-p">Who held the land at the start of each day. Drag to travel through time.</p>
          <canvas class="aoc-histmap" width="320" height="320" aria-label="Territory map"></canvas>
          <label class="aoc-label">Day <b class="aoc-hday"></b><input type="range" data-day min="${days[0]}" max="${days[days.length - 1]}" value="${H.day}" step="1"></label>
          <div class="aoc-legend">${H.hist.guilds.map(g => `<span>${U.banner(U.F.guilds[g.id], 14)} ${esc(g.tag)}</span>`).join('')}</div>`
          : '<p class="aoc-p">The first map is drawn when Day 2 begins.</p>');
        drawMap();
      } else {
        const cas = H.hist.casualties.slice().sort((a, b) => b.kills - a.kills);
        setHtml(box, `<h3 class="aoc-h4">Guild power by day</h3><p class="aoc-muted aoc-small">Your guild and the two strongest are drawn in their colors; tap a guild below to pick others. The rest are grey.</p>
          <div class="aoc-chart" role="img" aria-label="Guild power over time"></div><div class="aoc-chips aoc-gpick">${H.hist.guilds.map(g => `<button type="button" class="aoc-btn ghost tiny" data-focusg="${g.id}">${esc(g.tag)}</button>`).join('')}</div>
          <h3 class="aoc-h4">Table</h3><table class="aoc-table"><thead><tr><th>Guild</th><th>Power now</th><th>Enemy troops killed</th><th>Troops lost</th><th>Wars started</th><th>Fortresses taken</th></tr></thead><tbody>
          ${cas.map(c => `<tr><td>${U.banner(U.F.guilds[c.id], 14)} ${esc(U.F.guilds[c.id].name)}</td><td>${fmt(U.F.guilds[c.id].power)}</td><td>${fmt(c.kills)}</td><td>${fmt(c.losses)}</td><td>${c.wars}</td><td>${c.forts}</td></tr>`).join('')}</tbody></table>`);
        drawPower();
      }
    }
  } finally { H.busy = false; H.last = performance.now(); }
}
function drawMap() {
  const cv = document.querySelector('.aoc-histmap');
  if (!cv || !H.hist || H.day < 0) return;
  const s = H.hist.terr[H.day];
  setText(document.querySelector('.aoc-hday'), String(H.day + 1));
  const g = cv.getContext('2d');
  g.fillStyle = '#1b1714'; g.fillRect(0, 0, 320, 320);
  const ter = U.S.ter;
  // faint terrain underneath
  for (let cy = 0; cy < 32; cy++) for (let cx = 0; cx < 32; cx++) {
    const t = ter[(cy * 4 + 2) * A.MAP_N + cx * 4 + 2];
    g.fillStyle = A.TERRAIN[t].color; g.globalAlpha = 0.45; g.fillRect(cx * 10, cy * 10, 10, 10);
  }
  g.globalAlpha = 1;
  if (!s) return;
  for (let k = 0; k < 1024; k++) {
    const v = parseInt(s[k], 16);
    if (!v) continue;
    g.fillStyle = U.F.guilds[v - 1].color; g.globalAlpha = 0.8;
    g.fillRect((k % 32) * 10, Math.floor(k / 32) * 10, 10, 10);
  }
  g.globalAlpha = 1;
}
function drawPower() {
  const box = document.querySelector('.aoc-chart');
  if (!box || !H.hist) return;
  const days = H.hist.days;
  const P = U.F.player;
  const now = U.F.guilds;
  if (days.length < 2) { box.innerHTML = '<p class="aoc-muted">The chart needs two days of history.</p>'; return; }
  const top = now.slice().sort((a, b) => b.power - a.power).map(g => g.id);
  const hi = new Set([...(P.guild >= 0 ? [P.guild] : []), ...top.slice(0, 2), ...H.focus].slice(0, 4));
  const W = 340, Hh = 190, L = 44, Rr = 46, T = 10, B = 24;
  const max = Math.max(1, ...days.flatMap(d => H.hist.power[d] || []));
  const x = i => L + (i / (days.length - 1)) * (W - L - Rr);
  const y = v => T + (1 - v / max) * (Hh - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${Hh}" class="aoc-svgchart">`;
  for (let k = 0; k <= 4; k++) { const v = max * k / 4; svg += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" class="aoc-grid"/><text x="${L - 6}" y="${y(v) + 3}" class="aoc-axis" text-anchor="end">${fmt(v)}</text>`; }
  days.forEach((d, i) => { if (days.length <= 8 || i % Math.ceil(days.length / 8) === 0 || i === days.length - 1) svg += `<text x="${x(i)}" y="${Hh - 6}" class="aoc-axis" text-anchor="middle">D${d + 1}</text>`; });
  const order = H.hist.guilds.map(g => g.id).sort((a, b) => hi.has(a) - hi.has(b));
  for (const gi of order) {
    const pts = days.map((d, i) => `${x(i).toFixed(1)},${y((H.hist.power[d] || [])[gi] || 0).toFixed(1)}`).join(' ');
    const on = hi.has(gi);
    if (on) svg += `<polyline points="${pts}" fill="none" stroke="#1d1a1f" stroke-width="5" stroke-linejoin="round"/>`;
    svg += `<polyline points="${pts}" fill="none" stroke="${on ? now[gi].color : '#5d554d'}" stroke-width="${on ? 2 : 1}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (on) { const last = (H.hist.power[days[days.length - 1]] || [])[gi] || 0; svg += `<text x="${x(days.length - 1) + 6}" y="${y(last) + 3}" class="aoc-dlabel">${esc(now[gi].tag)}</text>`; }
  }
  svg += `<line class="aoc-cross" x1="0" x2="0" y1="${T}" y2="${Hh - B}" visibility="hidden"/><rect x="${L}" y="${T}" width="${W - L - Rr}" height="${Hh - T - B}" fill="transparent" class="aoc-hit"/></svg><div class="aoc-tip" hidden></div>`;
  box.innerHTML = svg;
  const svgEl = box.querySelector('svg'), tip = box.querySelector('.aoc-tip'), cross = box.querySelector('.aoc-cross');
  const move = e => {
    const r = svgEl.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(days.length - 1, Math.round((px - L) / (W - L - Rr) * (days.length - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    const vals = (H.hist.power[days[i]] || []).map((v, gi) => ({ gi, v })).sort((a, b) => b.v - a.v).slice(0, 6);
    tip.innerHTML = `<b>Day ${days[i] + 1}</b>${vals.map(o => `<div><span class="aoc-sw" style="background:${now[o.gi].color}"></span>${esc(now[o.gi].tag)} <span>${fmt(o.v)}</span></div>`).join('')}`;
    tip.hidden = false;
    tip.style.left = Math.min(r.width - 140, Math.max(0, (e.clientX - r.left) + 12)) + 'px';
  };
  box.querySelector('.aoc-hit').addEventListener('pointermove', move);
  box.querySelector('.aoc-hit').addEventListener('pointerdown', move);
  box.querySelector('.aoc-hit').addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  document.querySelectorAll('[data-focusg]').forEach(b => b.classList.toggle('gold', hi.has(Number(b.dataset.focusg))));
}
U.screen('chron', { mount: mountChron, show: () => renderChron(true), update: () => renderChron(false) });

// ================================================================ rankings
const K = { tab: 'power', last: 0, busy: false };
function mountRanks(root) {
  root.innerHTML = `<div class="aoc-scroll"><div class="aoc-seg" role="tablist"><button type="button" role="tab" data-rtab="power">Governors</button><button type="button" role="tab" data-rtab="kills">Warriors</button><button type="button" role="tab" data-rtab="guilds">Guilds</button><button type="button" role="tab" data-rtab="ach">Achievements</button><button type="button" role="tab" data-rtab="server">Server</button></div><div class="aoc-rtab"></div></div>`;
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-rtab]'); if (t) { K.tab = t.dataset.rtab; K.last = 0; renderRanks(true); return; }
    const b = e.target.closest('[data-insp]'); if (b) U.inspect(Number(b.dataset.insp));
  });
}
async function renderRanks(force) {
  const root = document.querySelector('.aoc-screen-ranks');
  if (!root || root.hidden || !U.F) return;
  root.querySelectorAll('[data-rtab]').forEach(b => b.setAttribute('aria-selected', b.dataset.rtab === K.tab ? 'true' : 'false'));
  if (!force && performance.now() - K.last < 5000) return;
  if (K.busy) return;
  K.busy = true;
  const box = root.querySelector('.aoc-rtab');
  const f = U.F;
  try {
    if (K.tab === 'power' || K.tab === 'kills') {
      const r = await U.host.query('rankings', { kind: K.tab });
      setHtml(box, `<p class="aoc-p">You rank <b>#${r.me}</b> of ${r.total} governors by ${K.tab === 'power' ? 'power' : 'enemy troops defeated'}.</p>
        <table class="aoc-table aoc-ranktable"><thead><tr><th>#</th><th>Governor</th><th>Guild</th><th>Town Hall</th><th>${K.tab === 'power' ? 'Power' : 'Defeated'}</th></tr></thead><tbody>
        ${r.list.map(g => `<tr class="${g.isMe ? 'is-me' : ''}"><td>${g.rank}</td><td><button type="button" class="aoc-link" data-insp="${g.id}">${esc(g.name)}</button></td><td>${g.guild >= 0 ? esc(f.guilds[g.guild].tag) : '-'}</td><td>${g.hall}</td><td>${fmt(K.tab === 'power' ? g.power : g.kills)}</td></tr>`).join('')}</tbody></table>`);
    } else if (K.tab === 'guilds') {
      const list = await U.host.query('rankings', { kind: 'guilds' });
      setHtml(box, `<table class="aoc-table"><thead><tr><th>#</th><th>Guild</th><th>Members</th><th>Power</th><th>Fortresses</th></tr></thead><tbody>${list.map((g, k) => `<tr class="${g.id === f.player.guild ? 'is-me' : ''}"><td>${g.collapsed ? '-' : k + 1}</td><td>${U.banner(g, 16)} ${esc(g.name)} [${esc(g.tag)}]${g.capital ? ' · Throne' : ''}</td><td>${g.members}/${A.GUILD_MAX}</td><td>${fmt(g.power)}</td><td>${g.forts}</td></tr>`).join('')}</tbody></table>`);
    } else if (K.tab === 'ach') {
      const list = await U.host.query('achievements');
      setHtml(box, `<p class="aoc-p">${list.filter(a => a.done).length} of ${list.length} earned. Each one is a title for your record.</p>` + list.map(a => `<div class="aoc-row${a.done ? ' is-done' : ''}"><div class="aoc-row-main"><b>${esc(a.name)}</b><div class="aoc-muted aoc-small">${esc(a.text)}</div></div><div class="aoc-row-act">${a.done ? `<span class="aoc-pill is-good">${U.icon('star', 12)} Earned</span>` : '<span class="aoc-muted aoc-small">Not yet</span>'}</div></div>`).join(''));
    } else {
      const d = await U.host.query('diag');
      const inG = f.guilds.reduce((a, g) => a + g.members, 0);
      setHtml(box, `<div class="aoc-card"><h3 class="aoc-h4">${esc(A.SERVER.name)}</h3><p class="aoc-p">${esc(A.SERVER.motto)}</p>
        <div class="aoc-kv"><div><span>Governor slots</span><b>${d.governors}</b></div><div><span>Played by you</span><b>1</b></div><div><span>Simulated governors</span><b>${d.ai}</b></div><div><span>In guilds</span><b>${inG}</b></div><div><span>Independent</span><b>${d.independents}</b></div><div><span>Armies in the field</span><b>${d.marches}</b></div><div><span>Bandit camps</span><b>${d.camps}</b></div><div><span>Battles fought</span><b>${full(d.battles)}</b></div><div><span>Chronicle entries</span><b>${full(d.chronicle)}</b></div></div></div>
        <div class="aoc-card"><h3 class="aoc-h4">How the simulation spends its effort</h3><p class="aoc-p">Every governor keeps its full economy, army and memory. How often each one decides depends on how actively it plays and how close it is to the action:</p>
        <div class="aoc-kv"><div><span>Near you, your guild or its wars</span><b>${d.tiers.active}</b></div><div><span>At war elsewhere</span><b>${d.tiers.strategic}</b></div><div><span>Quiet regions (decide less often)</span><b>${d.tiers.background}</b></div></div>
        <p class="aoc-muted aoc-small">Simulation running ${U.host.mode === 'worker' ? 'in a background worker' : 'on the page'}. Saved to ${esc(U.store.where)}.</p></div>
        <div class="aoc-card"><h3 class="aoc-h4">Guilds</h3>${d.guilds.map(g => `<div class="aoc-row"><div class="aoc-row-main">${esc(g.name)}</div><div class="aoc-row-act">${g.collapsed ? 'fallen' : `${g.members}/${A.GUILD_MAX}`}</div></div>`).join('')}</div>
        <p class="aoc-muted aoc-small">This version builds one server. The other nine (and the cross-server campaign) are planned; they will reuse this engine with their own maps, personalities and histories.</p>`);
    }
  } finally { K.busy = false; K.last = performance.now(); }
}
U.screen('ranks', { mount: mountRanks, show: () => renderRanks(true), update: () => renderRanks(false) });
