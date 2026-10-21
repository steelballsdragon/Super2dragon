/* Age of Conquest city panels, opened from the buildings in the town: every building in one list, research at the
   Academy, the Market, the Grand Exchange, the goals, and the peace shield at the walls. */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, realDur, setText, setHtml } = U;

const C = { tab: 'build', data: {}, sig: '', busy: false, last: 0, root: null, h: null };
const PTABS = [['build', 'Buildings', 'castle'], ['research', 'Research', 'scroll'], ['market', 'Market', 'gold'], ['wonder', 'Wonder', 'crown'], ['goals', 'Goals', 'star']];
U.cityPanel = tab => {
  if (C.h && !C.h.closed) C.h.close();
  C.tab = tab || 'build'; C.sig = '';
  const body = el(`<div class="aoc-cpanel"><div class="aoc-seg" role="tablist">${PTABS.map(([id, label, icon]) => `<button type="button" role="tab" data-ctab="${id}">${U.icon(icon, 16)}<span>${label}</span></button>`).join('')}</div><div class="aoc-ctab"></div></div>`);
  body.querySelector('.aoc-seg').addEventListener('click', e => { const b = e.target.closest('[data-ctab]'); if (b) { C.tab = b.dataset.ctab; C.sig = ''; refresh(true); } });
  body.addEventListener('click', onClick);
  C.root = body;
  const off = U.onFrame(() => refresh(false));
  C.h = U.sheet({ title: 'Your city', wide: true, body, onClose: () => { off(); C.root = null; } });
  refresh(true);
  return C.h;
};
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
U.shieldSheet = shieldSheet;
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
function goals(f) {
  const open = f.quests.filter(q => !q.claimed);
  if (!open.length) return '<p class="aoc-p">Every goal is done.</p>';
  return open.map(q => `<div class="aoc-goal${q.done ? ' is-done' : ''}"><div><b>${esc(q.text)}</b><div class="aoc-muted aoc-small">${esc(q.how)}</div><div class="aoc-goal-r">${U.cost(q.reward)}</div></div>
    ${q.done ? `<button type="button" class="aoc-btn gold small" data-claim="${q.id}">Claim</button>` : ''}</div>`).join('');
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
    const th = U.home?.thumb?.(b.id, L);
    return `<div class="aoc-row">${th ? `<img class="aoc-thumb" src="${th}" alt="" width="56" height="48">` : ''}<div class="aoc-row-main"><b>${esc(d.name)}</b> <span class="aoc-lv">${L ? 'Lv ' + L : 'Not built'}</span><div class="aoc-muted aoc-small">${esc(d.desc)}</div>
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
  const root = C.root;
  if (!root || !U.F) return;
  const P = U.F.player;
  root.querySelectorAll('[data-ctab]').forEach(b => b.setAttribute('aria-selected', b.dataset.ctab === C.tab ? 'true' : 'false'));
  // checks come from the simulation (the same rules the AI uses); re-ask when something relevant changed
  const sig = C.tab + ':' + JSON.stringify(P.b) + JSON.stringify(P.tech) + JSON.stringify(P.q) + A.RES.map(r => Math.floor(Math.log2(1 + P.res[r]) * 4)).join(',') + (C.tab === 'goals' ? JSON.stringify(U.F.quests) : '');
  if (!force && sig === C.sig && performance.now() - C.last < 4000) return;
  C.sig = sig; C.last = performance.now();
  if (C.busy) return;
  C.busy = true;
  try {
    if (C.tab === 'build') C.data.build = await U.host.query('build');
    if (C.tab === 'research') C.data.research = await U.host.query('research');
    if (C.tab === 'wonder') C.data.exchange = await U.host.query('exchange');
  } finally { C.busy = false; }
  if (!C.root) return;
  const box = root.querySelector('.aoc-ctab');
  const html = C.tab === 'build' ? buildList(U.F) : C.tab === 'research' ? researchList(U.F) : C.tab === 'market' ? market(U.F) : C.tab === 'goals' ? goals(U.F) : wonder(U.F);
  if (C.tab === 'market') { if (!box.querySelector('#aoc-tr-sell')) { box.innerHTML = html; box._h = ''; box.querySelectorAll('input,select').forEach(i => i.addEventListener('input', quote)); quote(); } }
  else setHtml(box, html);
}
