/* Age of Conquest city screen: the skyline (drawn in each civilization's style), production, queues, the guided
   goals, and four sections: buildings, research, the market and the Grand Exchange. */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, realDur, setText, setHtml } = U;

const STYLE = { ashen: 'spire', sunspire: 'dome', steppe: 'tent', concord: 'gable', bastion: 'keep', raven: 'tower', dawn: 'temple', frost: 'longhouse', golden: 'dome', forge: 'forge', tempest: 'mast', oath: 'hall' };
function skyline(civId, hall, wall, guildColor) {
  const c = A.CIV[civId];
  const st = STYLE[civId] || 'gable';
  const n = Math.min(9, 3 + Math.floor(hall / 3));
  let out = '';
  const w = 320, base = 92;
  for (let k = 0; k < n; k++) {
    const bw = 22 + ((k * 37) % 13), bh = 26 + ((k * 53) % 30) + (k === Math.floor(n / 2) ? 22 + hall : 0);
    const x = 18 + k * ((w - 50) / n);
    const y = base - bh;
    out += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${c.stone}" stroke="#1a1512" stroke-width="1"/>`;
    out += `<rect x="${x + bw * 0.38}" y="${y + bh * 0.45}" width="${bw * 0.24}" height="${bh * 0.25}" fill="#f2b45c" opacity=".85"/>`;
    const cx = x + bw / 2;
    switch (st) {
      case 'spire': out += `<path d="M${x - 2} ${y} L${cx} ${y - bw * 1.1} L${x + bw + 2} ${y} Z" fill="${c.roof}"/>`; break;
      case 'dome': out += `<path d="M${x} ${y} A${bw / 2} ${bw / 2} 0 0 1 ${x + bw} ${y} Z" fill="${c.roof}"/><rect x="${cx - 1}" y="${y - bw / 2 - 6}" width="2" height="6" fill="${c.roof}"/>`; break;
      case 'tent': out += `<path d="M${x - 4} ${y + 2} Q${cx} ${y - bw * 0.9} ${x + bw + 4} ${y + 2} Z" fill="${c.roof}"/>`; break;
      case 'gable': out += `<path d="M${x - 2} ${y} L${cx} ${y - bw * 0.5} L${x + bw + 2} ${y} Z" fill="${c.roof}"/>`; break;
      case 'keep': out += `<path d="M${x} ${y} h${bw} v-6 h-${bw / 5} v3 h-${bw / 5} v-3 h-${bw / 5} v3 h-${bw / 5} v-3 h-${bw / 5} Z" fill="${c.roof}"/>`; break;
      case 'tower': out += `<rect x="${cx - 4}" y="${y - bw * 0.9}" width="8" height="${bw * 0.9}" fill="${c.stone}" stroke="#1a1512"/><path d="M${cx - 6} ${y - bw * 0.9} L${cx} ${y - bw * 1.4} L${cx + 6} ${y - bw * 0.9} Z" fill="${c.roof}"/>`; break;
      case 'temple': out += `<path d="M${x - 3} ${y} L${cx} ${y - bw * 0.35} L${x + bw + 3} ${y} Z" fill="${c.roof}"/><path d="M${x + 3} ${y} v${bh * 0.9} M${x + bw - 3} ${y} v${bh * 0.9}" stroke="#d8cdb8" stroke-width="2"/>`; break;
      case 'longhouse': out += `<path d="M${x - 3} ${y + 2} L${cx} ${y - bw * 0.65} L${x + bw + 3} ${y + 2} Z" fill="${c.roof}"/><path d="M${x} ${y - 2} l-3 -5 M${x + bw} ${y - 2} l3 -5" stroke="${c.roof}" stroke-width="2"/>`; break;
      case 'forge': out += `<path d="M${x - 2} ${y} L${cx} ${y - bw * 0.45} L${x + bw + 2} ${y} Z" fill="${c.roof}"/><rect x="${x + bw - 7}" y="${y - bw * 0.7}" width="5" height="${bw * 0.5}" fill="#3a302a"/><circle cx="${x + bw - 4}" cy="${y - bw * 0.85}" r="3" fill="#6b625a" opacity=".6"/>`; break;
      case 'mast': out += `<path d="M${x - 2} ${y} L${cx} ${y - bw * 0.55} L${x + bw + 2} ${y} Z" fill="${c.roof}"/><path d="M${cx} ${y - bw * 0.55} v-14 l8 6 -8 2" fill="${c.color}" stroke="#1a1512" stroke-width=".8"/>`; break;
      default: out += `<path d="M${x - 3} ${y} L${cx} ${y - bw * 0.6} L${x + bw + 3} ${y} Z" fill="${c.roof}"/>`;
    }
  }
  if (wall > 0) out += `<path d="M6 ${base - 10} h${w - 12} v14 H6 Z" fill="${c.stone}" stroke="#1a1512"/>` + Array.from({ length: 20 }, (_, k) => `<rect x="${8 + k * 15.5}" y="${base - 15}" width="8" height="6" fill="${c.stone}" stroke="#1a1512" stroke-width=".8"/>`).join('');
  const flag = guildColor ? `<path d="M${w - 30} ${base - 70} v58" stroke="#2a2420" stroke-width="2"/><path d="M${w - 29} ${base - 70} h20 l-5 7 5 7 h-20 Z" fill="${guildColor}"/>` : '';
  // distant ranges like the artwork's: a smoldering volcano on the left, snowy peaks on the right
  const back = `<path d="M0 ${base - 18} L28 ${base - 46} L44 ${base - 38} L62 ${base - 58} L74 ${base - 52} L96 ${base - 30} L130 ${base - 22} L170 ${base - 40} L196 ${base - 64} L214 ${base - 50} L238 ${base - 72} L262 ${base - 44} L292 ${base - 56} L${w} ${base - 30} L${w} ${base} L0 ${base} Z" fill="#241c18"/>
    <path d="M232 ${base - 62} L238 ${base - 72} L244 ${base - 63} Z M190 ${base - 56} L196 ${base - 64} L201 ${base - 57} Z" fill="#c9cfd6" opacity=".8"/>
    <path d="M56 ${base - 54} L62 ${base - 58} L68 ${base - 54}" stroke="#ff7a1f" stroke-width="2" fill="none"/><path d="M62 ${base - 58} q-6 -10 2 -18 q6 -6 0 -12" stroke="#6b5a50" stroke-width="3" fill="none" opacity=".55"/>
    <path d="M62 ${base - 56} L58 ${base - 40} M62 ${base - 56} L67 ${base - 42}" stroke="#f0661c" stroke-width="1.4" opacity=".8"/>`;
  return `<svg class="aoc-skyline" viewBox="0 0 ${w} 104" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><defs><linearGradient id="aoc-sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1a1210"/><stop offset=".6" stop-color="#3d1d0e"/><stop offset="1" stop-color="#7a3414"/></linearGradient></defs><rect width="${w}" height="104" fill="url(#aoc-sky)"/><circle cx="${w * 0.78}" cy="30" r="16" fill="#f0661c" opacity=".35"/><circle cx="${w * 0.78}" cy="30" r="7" fill="#ffad42" opacity=".5"/>${back}${out}${flag}<rect y="${base + 2}" width="${w}" height="12" fill="#1b1512"/></svg>`;
}
U.skyline = skyline;

const C = { tab: 'build', data: {}, sig: '', busy: false, last: 0 };
function mount(root) {
  root.innerHTML = `<div class="aoc-scroll">
    <div class="aoc-cityhead"></div>
    <div class="aoc-prod"></div>
    <div class="aoc-queues"></div>
    <section class="aoc-goals"></section>
    <div class="aoc-seg" role="tablist">
      <button type="button" role="tab" data-ctab="build">Buildings</button>
      <button type="button" role="tab" data-ctab="research">Research</button>
      <button type="button" role="tab" data-ctab="market">Market</button>
      <button type="button" role="tab" data-ctab="wonder">Grand Exchange</button>
    </div>
    <div class="aoc-ctab"></div>
  </div>`;
  root.querySelector('.aoc-seg').addEventListener('click', e => { const b = e.target.closest('[data-ctab]'); if (b) { C.tab = b.dataset.ctab; C.sig = ''; refresh(true); } });
  root.addEventListener('click', onClick);
}
async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.build) { b.disabled = true; if (await U.run({ type: 'build', id: b.dataset.build }, `${A.BUILDINGS[b.dataset.build].name} upgrade started.`)) refresh(true); else b.disabled = false; }
  if (b.dataset.tech) { b.disabled = true; if (await U.run({ type: 'research', id: b.dataset.tech }, `Research on ${A.TECHS[b.dataset.tech].name} started.`)) refresh(true); else b.disabled = false; }
  if (b.dataset.act === 'shield') shieldSheet();
  if (b.dataset.act === 'cancel') U.confirm({ title: 'Cancel the upgrade?', text: 'Half of what it cost comes back.', ok: 'Cancel upgrade', kind: 'red', onOk: () => U.run({ type: 'cancelBuild' }, 'Upgrade cancelled.') });
  if (b.dataset.act === 'trade') doTrade();
  if (b.dataset.act === 'exchange') U.confirm({ title: 'Build the Grand Exchange?', text: `It costs ${Object.entries(A.EXCHANGE.cost).map(([r, v]) => `${full(v)} ${A.RES_NAME[r]}`).join(', ')} and takes ${A.EXCHANGE.minutes / A.DAY} game days. Every governor will know you are building it, and rivals may try to stop you.`, ok: 'Begin construction', onOk: async () => { if (await U.run({ type: 'exchange' }, 'Construction of the Grand Exchange has begun.')) refresh(true); } });
  if (b.dataset.pct) { const inp = document.querySelector('#aoc-tr-amt'); const sell = document.querySelector('#aoc-tr-sell').value; inp.value = Math.floor(U.F.player.res[sell] * Number(b.dataset.pct) / 100); quote(); }
}
function shieldSheet() {
  const P = U.F.player, f = U.F;
  const up = P.shield > f.t, cd = P.shieldCd > f.t;
  U.sheet({
    title: 'Peace shield',
    body: `<p class="aoc-p">A shield stops every attack on your city for ${A.SHIELD.minutes / 60} game hours (${realDur(A.SHIELD.minutes)} at 1x). Attacking another city breaks it. After a shield you wait ${A.SHIELD.cooldown / 60} hours before the next.</p>
      <div class="aoc-kv"><div><span>Status</span><b>${up ? `Up for ${dur(P.shield - f.t)}` : 'Down'}</b></div><div><span>Next shield</span><b>${cd ? `in ${dur(P.shieldCd - f.t)}` : 'Ready'}</b></div><div><span>Cost</span><b>${full(P.shieldCost)} Gold</b></div></div>`,
    actions: [{ label: 'Close', kind: 'ghost' }, { label: 'Raise shield', disabled: up || cd || P.res.gold < P.shieldCost, onClick: () => U.run({ type: 'shield' }, 'Your shield is up.') }],
  });
}
function head(f) {
  const P = f.player;
  const gd = P.guild >= 0 ? f.guilds[P.guild] : null;
  const civ = A.CIV[P.civ];
  const shield = P.shield > f.t ? `<span class="aoc-pill is-blue">${U.icon('shield', 14)}Shield ${dur(P.shield - f.t)}</span>` : '';
  return `${skyline(P.civ, P.b.hall, P.b.wall || 0, gd?.color)}
    <div class="aoc-cityinfo"><div><h2 class="aoc-h3">${esc(P.name)}${gd ? ` <span class="aoc-tag">[${esc(gd.tag)}]</span>` : ''}</h2>
    <div class="aoc-muted">${esc(civ.name)} · Town Hall ${P.b.hall} · ${U.icon('power', 14)} ${fmt(P.power)} power</div>
    <div class="aoc-wall"><span>Walls ${P.b.wall || 0}</span><span class="aoc-meter"><i style="width:${Math.round(P.wallDur / Math.max(1, P.wallMax) * 100)}%"></i></span><span>${fmt(P.wallDur)} / ${fmt(P.wallMax)}</span></div></div>
    <div class="aoc-cityside">${shield}<button type="button" class="aoc-btn ghost small" data-act="shield">${U.icon('shield', 15)}<span>Shield</span></button></div></div>`;
}
function prod(f) {
  const P = f.player;
  return A.RES.map(r => {
    const v = r === 'food' ? P.prod.food - P.upkeep : P.prod[r];
    return `<div class="aoc-prod-i">${U.resIcon(r, 16)}<span class="${v < 0 ? 'aoc-bad' : ''}">${v < 0 ? '' : '+'}${fmt(v)}/h</span></div>`;
  }).join('') + `<div class="aoc-prod-i aoc-muted">Storage ${fmt(P.cap)} · safe ${fmt(P.protect)}</div>`;
}
function bar(start, end, t) { return Math.round(Math.max(0, Math.min(1, (t - start) / Math.max(1, end - start))) * 100); }
function queues(f) {
  const P = f.player, q = P.q, out = [];
  if (q.build) out.push(`<div class="aoc-q"><span>${esc(A.BUILDINGS[q.build.id].name)} to level ${q.build.L}</span><span class="aoc-meter"><i style="width:${bar(q.build.start, q.build.end, f.t)}%"></i></span><span>${dur(q.build.end - f.t)}</span><button type="button" class="aoc-btn ghost tiny" data-act="cancel" aria-label="Cancel upgrade">${U.icon('close', 12)}</button></div>`);
  else out.push('<div class="aoc-q is-idle"><span>Builders are free</span></div>');
  if (q.research) out.push(`<div class="aoc-q"><span>${esc(A.TECHS[q.research.id].name)} ${q.research.lv}</span><span class="aoc-meter"><i style="width:${bar(q.research.start, q.research.end, f.t)}%"></i></span><span>${dur(q.research.end - f.t)}</span></div>`);
  else if ((P.b.academy || 0) > 0) out.push('<div class="aoc-q is-idle"><span>The Academy is idle</span></div>');
  for (const u of A.UNIT_KEYS) if (q.train[u]) out.push(`<div class="aoc-q"><span>${full(q.train[u].n)} ${A.UNITS[u].plural}</span><span class="aoc-meter"><i style="width:${bar(q.train[u].start, q.train[u].end, f.t)}%"></i></span><span>${dur(q.train[u].end - f.t)}</span></div>`);
  if (q.heal) out.push(`<div class="aoc-q"><span>Healing ${full(A.troopsTotal(q.heal.troops))}</span><span class="aoc-meter"><i style="width:${bar(q.heal.start, q.heal.end, f.t)}%"></i></span><span>${dur(q.heal.end - f.t)}</span></div>`);
  if (q.exchange) out.push(`<div class="aoc-q is-gold"><span>Grand Exchange</span><span class="aoc-meter"><i style="width:${bar(q.exchange.start, q.exchange.end, f.t)}%"></i></span><span>${dur(q.exchange.end - f.t)}</span></div>`);
  return out.join('');
}
function goals(f) {
  const open = f.quests.filter(q => !q.claimed);
  if (!open.length) return '';
  return `<h3 class="aoc-h4">Goals</h3>` + open.slice(0, 4).map(q => `<div class="aoc-goal${q.done ? ' is-done' : ''}"><div><b>${esc(q.text)}</b><div class="aoc-muted aoc-small">${esc(q.how)}</div></div>
    ${q.done ? `<button type="button" class="aoc-btn gold small" data-claim="${q.id}">Claim</button>` : `<span class="aoc-goal-r">${U.cost(q.reward)}</span>`}</div>`).join('');
}
// ---------------------------------------------------------------- sections
function buildList(f) {
  const P = f.player;
  const list = C.data.build || [];
  return list.map(b => {
    const d = A.BUILDINGS[b.id];
    const L = P.b[b.id] || 0;
    const btn = !b.allowed ? `<span class="aoc-req">${esc(b.err)}</span>`
      : `<button type="button" class="aoc-btn ${b.ok ? 'gold' : 'ghost'} small" data-build="${b.id}"${b.ok ? '' : ' disabled'}>${L ? 'Upgrade' : 'Build'}</button>${b.ok ? '' : `<span class="aoc-req">${esc(b.err)}</span>`}`;
    return `<div class="aoc-row"><div class="aoc-row-main"><b>${esc(d.name)}</b> <span class="aoc-lv">${L ? 'Lv ' + L : 'Not built'}</span><div class="aoc-muted aoc-small">${esc(d.desc)}</div>
      ${b.allowed ? `<div class="aoc-costs">${U.cost(b.cost, P.res)}<span class="aoc-cost">${U.icon('clock', 14)}${dur(b.minutes)}</span></div>` : ''}</div><div class="aoc-row-act">${btn}</div></div>`;
  }).join('');
}
function researchList(f) {
  const P = f.player;
  const list = C.data.research || [];
  if (!(P.b.academy > 0)) return '<p class="aoc-p">Build the Academy (needs Town Hall 3) to research technology. A technology can reach at most the Academy\'s level.</p>';
  const branches = { economy: 'Economy', military: 'Military doctrine', intel: 'Intelligence and defense' };
  return Object.entries(branches).map(([br, name]) => `<h3 class="aoc-h4">${name}</h3>` + list.filter(t => A.TECHS[t.id].branch === br).map(t => {
    const d = A.TECHS[t.id];
    const lv = P.tech[t.id] || 0;
    const btn = !t.allowed ? `<span class="aoc-req">${esc(t.err)}</span>` : `<button type="button" class="aoc-btn ${t.ok ? 'gold' : 'ghost'} small" data-tech="${t.id}"${t.ok ? '' : ' disabled'}>Research</button>${t.ok ? '' : `<span class="aoc-req">${esc(t.err)}</span>`}`;
    return `<div class="aoc-row"><div class="aoc-row-main"><b>${esc(d.name)}</b> <span class="aoc-lv">${lv}/${A.TECH_MAX}</span><div class="aoc-muted aoc-small">${esc(d.desc)}</div>
      ${t.allowed ? `<div class="aoc-costs">${U.cost(t.cost, P.res)}<span class="aoc-cost">${U.icon('clock', 14)}${dur(t.minutes)}</span></div>` : ''}</div><div class="aoc-row-act">${btn}</div></div>`;
  }).join('')).join('');
}
function market(f) {
  const P = f.player;
  if (!(P.b.market > 0)) return '<p class="aoc-p">Build a Market (needs Town Hall 4) to trade one resource for another. Prices move with what the whole server buys and sells, and drift back each day.</p>';
  const opts = sel => A.RES.map(r => `<option value="${r}"${r === sel ? ' selected' : ''}>${A.RES_NAME[r]}</option>`).join('');
  return `<div class="aoc-card"><div class="aoc-trade">
      <label>Sell<select id="aoc-tr-sell" class="aoc-input">${opts('wood')}</select></label>
      <label>Buy<select id="aoc-tr-buy" class="aoc-input">${opts('iron')}</select></label>
      <label>Amount<input id="aoc-tr-amt" class="aoc-input" inputmode="numeric" value="1000"></label>
    </div>
    <div class="aoc-chips">${[10, 25, 50, 100].map(p => `<button type="button" class="aoc-btn ghost tiny" data-pct="${p}">${p}%</button>`).join('')}</div>
    <p class="aoc-quote aoc-p">You get about <b id="aoc-tr-got">0</b>.</p>
    <p class="aoc-muted aoc-small">Fee ${Math.round(P.fee * 100)}% (a higher Market and Trade Routes lower it). You can still move ${full(P.tradeLeft)} in value today.</p>
    <button type="button" class="aoc-btn gold wide" data-act="trade">Trade</button></div>`;
}
let quoteT = 0;
async function quote() {
  const sell = document.querySelector('#aoc-tr-sell')?.value, buy = document.querySelector('#aoc-tr-buy')?.value, amount = document.querySelector('#aoc-tr-amt')?.value;
  if (!sell) return;
  const t = ++quoteT;
  const r = await U.host.query('quote', { sell, buy, amount });
  if (t !== quoteT) return;
  setText(document.querySelector('#aoc-tr-got'), sell === buy ? '0' : `${full(r.got)} ${A.RES_NAME[buy]}`);
}
async function doTrade() {
  const sell = document.querySelector('#aoc-tr-sell').value, buy = document.querySelector('#aoc-tr-buy').value, amount = document.querySelector('#aoc-tr-amt').value;
  const r = await U.run({ type: 'trade', sell, buy, amount });
  if (r) U.toast(`Traded for ${full(r.got)} ${A.RES_NAME[buy]}.`, 'good');
  quote();
}
function wonder(f) {
  const P = f.player;
  const ex = C.data.exchange || { ok: false, err: '' };
  const th = f.throne;
  const q = P.q.exchange;
  return `<div class="aoc-card"><h3 class="aoc-h4">Two ways to win the Age</h3>
    <p class="aoc-p"><b>The Ember Throne.</b> The Capital opens on Day ${1 + th.opens / A.DAY}. A guild that captures it with a rally and holds it for ${th.hold / A.DAY} game days wins. ${th.owner >= 0 ? `${esc(f.guilds[th.owner].name)} holds it now (${dur(f.t - th.since)}).` : 'Nobody holds it yet.'}</p>
    <p class="aoc-p"><b>The Grand Exchange.</b> A governor with Town Hall ${A.EXCHANGE.hall} and Market ${A.EXCHANGE.market} can build the Grand Exchange. When it stands, its builder's guild wins the Age. Rich AI governors race for it too.</p>
    <div class="aoc-costs">${U.cost(A.EXCHANGE.cost, P.res)}<span class="aoc-cost">${U.icon('clock', 14)}${dur(A.EXCHANGE.minutes)}</span></div>
    ${q ? `<p class="aoc-p aoc-good">Under construction: ${dur(q.end - f.t)} left.</p>` : `<button type="button" class="aoc-btn gold wide" data-act="exchange"${ex.ok ? '' : ' disabled'}>Build the Grand Exchange</button>${ex.ok ? '' : `<p class="aoc-req">${esc(ex.err)}</p>`}`}
    ${f.ages.length ? `<h3 class="aoc-h4">Past Ages</h3>${f.ages.map(a => `<p class="aoc-p">Age ${A.roman(a.age)}: ${a.playerWon ? '<b class="aoc-good">Victory</b>' : 'Lost'} · ${a.how === 'throne' ? 'the Throne' : 'the Grand Exchange'} · you ranked ${a.playerRank} of ${A.GOVERNORS}</p>`).join('')}` : ''}</div>`;
}
// ---------------------------------------------------------------- refresh
async function refresh(force) {
  const root = document.querySelector('.aoc-screen-city');
  if (!root || root.hidden || !U.F) return;
  const f = U.F, P = f.player;
  setHtml(root.querySelector('.aoc-cityhead'), head(f));
  setHtml(root.querySelector('.aoc-prod'), prod(f));
  setHtml(root.querySelector('.aoc-queues'), queues(f));
  setHtml(root.querySelector('.aoc-goals'), goals(f));
  root.querySelectorAll('[data-ctab]').forEach(b => b.setAttribute('aria-selected', b.dataset.ctab === C.tab ? 'true' : 'false'));
  // checks come from the simulation (the same rules the AI uses); re-ask when something relevant changed
  const sig = C.tab + ':' + JSON.stringify(P.b) + JSON.stringify(P.tech) + JSON.stringify(P.q) + A.RES.map(r => Math.floor(Math.log2(1 + P.res[r]) * 4)).join(',');
  if (!force && sig === C.sig && performance.now() - C.last < 4000) return;
  C.sig = sig; C.last = performance.now();
  if (C.busy) return;
  C.busy = true;
  try {
    if (C.tab === 'build') C.data.build = await U.host.query('build');
    if (C.tab === 'research') C.data.research = await U.host.query('research');
    if (C.tab === 'wonder') C.data.exchange = await U.host.query('exchange');
  } finally { C.busy = false; }
  const box = root.querySelector('.aoc-ctab');
  const html = C.tab === 'build' ? buildList(U.F) : C.tab === 'research' ? researchList(U.F) : C.tab === 'market' ? market(U.F) : wonder(U.F);
  if (C.tab === 'market') { if (!box.querySelector('#aoc-tr-sell')) { box.innerHTML = html; box._h = ''; box.querySelectorAll('input,select').forEach(i => i.addEventListener('input', quote)); quote(); } }
  else setHtml(box, html);
}
U.screen('city', { mount, show: () => refresh(true), update: () => refresh(false) });
