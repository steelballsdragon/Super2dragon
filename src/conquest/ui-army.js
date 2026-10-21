/* Age of Conquest army screen: troops, training, the hospital, armies in the field, the twelve commanders (skills,
   talents, recruitment), and the march sheet used for every order (attack, scout, gather, reinforce, rally). */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, realDur, setText, setHtml } = U;

const K = { tab: 'troops', train: { inf: 0, cav: 0, arc: 0, sie: 0 } };
const KIND_NAME = { attack: 'Attack', scout: 'Scout', gather: 'Gather', reinforce: 'Reinforce', rally: 'Rally', rallyjoin: 'Rally', return: 'Returning', returnstart: 'Returning' };

function mount(root) {
  root.innerHTML = `<div class="aoc-scroll">
    <div class="aoc-seg" role="tablist">
      <button type="button" role="tab" data-atab="troops">Troops</button>
      <button type="button" role="tab" data-atab="marches">Armies</button>
      <button type="button" role="tab" data-atab="cmds">Commanders</button>
    </div>
    <div class="aoc-atab"></div>
  </div>`;
  root.querySelector('.aoc-seg').addEventListener('click', e => { const b = e.target.closest('[data-atab]'); if (b) { K.tab = b.dataset.atab; render(true); } });
  root.addEventListener('click', onClick);
  root.addEventListener('input', e => {
    const i = e.target.closest('[data-tn]');
    if (i) { K.train[i.dataset.tn] = Math.max(0, Math.floor(Number(i.value) || 0)); updateTrainCost(i.dataset.tn); }
  });
}
async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const P = U.F.player;
  if (b.dataset.trmax) { const u = b.dataset.trmax; K.train[u] = maxTrain(u); const i = document.querySelector(`[data-tn="${u}"]`); if (i) i.value = K.train[u]; updateTrainCost(u); }
  if (b.dataset.train) {
    const u = b.dataset.train;
    // more than one batch: train a full batch instead of refusing
    const cap = A.trainBatch(P.b[A.UNITS[u].building] || 0);
    if (K.train[u] > cap) { K.train[u] = cap; const i = document.querySelector(`[data-tn="${u}"]`); if (i) i.value = cap; U.toast(`The ${A.BUILDINGS[A.UNITS[u].building].name} trains up to ${full(cap)} at a time.`, 'info'); }
    b.disabled = true;
    if (await U.run({ type: 'train', unit: u, n: K.train[u] }, `Training ${full(K.train[u])} ${A.UNITS[u].plural}.`)) { K.train[u] = 0; render(true); } else b.disabled = false;
  }
  if (b.dataset.act === 'heal') { b.disabled = true; await U.run({ type: 'heal' }, 'Healing started.'); render(true); }
  if (b.dataset.recall) { b.disabled = true; await U.run({ type: 'recall', march: Number(b.dataset.recall) }, 'The army is coming home.'); }
  if (b.dataset.cmd) commanderSheet(b.dataset.cmd);
  if (b.dataset.focus) { const [x, y] = b.dataset.focus.split(',').map(Number); U.mapFocus(x, y, 12); }
  void P;
}
function maxTrain(u) {
  const P = U.F.player;
  const L = P.b[A.UNITS[u].building] || 0;
  let n = A.trainBatch(L);
  for (const r in A.UNITS[u].cost) n = Math.min(n, Math.floor(P.res[r] / A.UNITS[u].cost[r]));
  return Math.max(0, n);
}
function trainTime(u, n) { const P = U.F.player; const L = P.b[A.UNITS[u].building] || 0; return Math.max(1, Math.round(n * A.UNITS[u].sec / 60 / (1 + 0.1 * L))); }
function updateTrainCost(u) {
  const box = document.querySelector(`[data-tc="${u}"]`);
  if (!box) return;
  const n = K.train[u];
  const cost = {};
  for (const r in A.UNITS[u].cost) cost[r] = A.UNITS[u].cost[r] * n;
  box.innerHTML = n > 0 ? `${U.cost(cost, U.F.player.res)}<span class="aoc-cost">${U.icon('clock', 14)}${dur(trainTime(u, n))}</span><span class="aoc-cost">eats ${fmt(n * A.UNITS[u].upkeep)} Food/h</span>` : '<span class="aoc-muted">Choose how many to train.</span>';
}
// a drawn soldier of the player's colours for the troop cards
const soldierPics = new Map();
function soldierImg(u, civ) {
  const key = u + civ;
  if (!soldierPics.has(key)) { let src = ''; try { src = U.art.soldier(u, A.CIV[civ].color, 0, 2).toDataURL('image/png'); } catch (e) { src = ''; } soldierPics.set(key, src); }
  const src = soldierPics.get(key);
  return src ? `<img class="aoc-unit-pic" src="${src}" alt="" width="60" height="60">` : U.icon(u, 30);
}
function troopsTab(f) {
  const P = f.player;
  const rows = A.UNIT_KEYS.map(u => {
    const U2 = A.UNITS[u];
    const bld = A.BUILDINGS[U2.building];
    const L = P.b[U2.building] || 0;
    const busy = P.q.train[u];
    const variant = A.CIV[P.civ].variant.unit === u ? ` · your civilization trains them as <b>${esc(A.CIV[P.civ].variant.name)}</b>` : '';
    const train = !L ? `<p class="aoc-req">Build the ${esc(bld.name)} to train ${esc(U2.plural)}.</p>`
      : busy ? `<p class="aoc-muted">Training ${full(busy.n)}: ${dur(busy.end - f.t)} left.</p>`
      : `<div class="aoc-trainrow"><input class="aoc-input aoc-num" type="number" inputmode="numeric" min="0" max="${A.trainBatch(L)}" data-tn="${u}" value="${K.train[u] || ''}" placeholder="0" aria-label="${esc(U2.plural)} to train">
          <button type="button" class="aoc-btn ghost small" data-trmax="${u}">Max</button><button type="button" class="aoc-btn gold small" data-train="${u}">Train</button></div>
          <div class="aoc-costs" data-tc="${u}"></div><p class="aoc-muted aoc-small">Up to ${full(A.trainBatch(L))} at a time at ${esc(bld.name)} level ${L}.</p>`;
    return `<div class="aoc-card aoc-unit"><div class="aoc-unit-head">${soldierImg(u, P.civ)}<div><b>${esc(U2.plural)}</b><div class="aoc-muted aoc-small">Attack ${U2.atk} · Defense ${U2.def} · Health ${U2.hp} · Speed ${U2.speed} · Load ${U2.load}${variant}</div></div></div>
      <div class="aoc-kv is-row"><div><span>Home</span><b>${full(P.troops[u])}</b></div><div><span>Away</span><b>${full(P.away[u])}</b></div><div><span>Wounded</span><b>${full(P.wounded[u])}</b></div></div>${train}</div>`;
  }).join('');
  const w = A.troopsTotal(P.wounded);
  const heal = `<div class="aoc-card"><h3 class="aoc-h4">Hospital</h3><p class="aoc-p">${full(w)} wounded of ${full(P.hosp)} beds. Wounded troops eat nothing; healing costs 30% of training.${w > 0 && P.q.heal ? ` Healing: ${dur(P.q.heal.end - f.t)} left.` : ''}</p>
    ${w > 0 && !P.q.heal ? '<button type="button" class="aoc-btn gold small" data-act="heal">Heal all you can afford</button>' : ''}${!(P.b.hospital > 0) ? '<p class="aoc-req">Build a Hospital (Town Hall 3): without beds, wounded soldiers are lost.</p>' : ''}</div>`;
  const counter = '<p class="aoc-muted aoc-small">Counters: infantry beat cavalry, cavalry beat archers, archers beat infantry (30% more damage each way). Siege engines are weak in the field but break walls.</p>';
  return `<div class="aoc-kv is-row aoc-card"><div><span>Army size</span><b>${full(P.marchCap)}</b></div><div><span>Marches</span><b>${P.marchesOut}/${P.marchSlots}</b></div><div><span>Upkeep</span><b>${fmt(P.upkeep)} Food/h</b></div></div>${counter}${rows}${heal}`;
}
function targetName(m, f) {
  const t = m.target;
  if (!t) return `(${m.tx}, ${m.ty})`;
  if (t.type === 'city') return U.S.cities.get(t.id)?.name || 'a city';
  if (t.type === 'mark') return f.marks[t.id]?.name || 'a landmark';
  if (t.type === 'camp') return 'a bandit camp';
  if (t.type === 'node') return 'a resource field';
  if (t.type === 'rallyhome') return 'the rally point';
  return `(${m.tx}, ${m.ty})`;
}
function marchesTab(f) {
  const mine = f.marches.filter(m => m.mine);
  if (!mine.length) return '<p class="aoc-p">No armies in the field. Tap a place on the map to send one.</p>';
  return mine.map(m => {
    const state = m.state === 'gathering' ? `Gathering, ${dur(m.gatherEnd - f.t)} left` : m.state === 'waiting' ? 'Waiting for the rally to leave' : m.kind === 'return' ? `Home in ${dur(m.eta - f.t)}` : `Arrives in ${dur(m.eta - f.t)}`;
    const recall = m.kind !== 'return' && m.kind !== 'rally' && m.kind !== 'returnstart';
    return `<div class="aoc-row"><div class="aoc-row-main"><b>${esc(KIND_NAME[m.kind] || m.kind)}: ${esc(targetName(m, f))}</b><div class="aoc-muted aoc-small">${esc(state)}${m.c1 ? ` · led by ${esc(A.CMD[m.c1].name)}` : ''}</div><div>${m.troops ? U.troopLine(m.troops) : ''}${m.load ? ' · carrying ' + U.cost(m.load) : ''}</div></div>
      <div class="aoc-row-act"><button type="button" class="aoc-btn ghost tiny" data-focus="${Math.round(m.x)},${Math.round(m.y)}">Show</button>${recall ? `<button type="button" class="aoc-btn ghost tiny" data-recall="${m.id}">Recall</button>` : ''}</div></div>`;
  }).join('');
}
function cmdsTab(f) {
  const P = f.player;
  return `<p class="aoc-muted aoc-small">Your City Steward's economic and intelligence skills apply to your city. Your Defender leads the troops at home when you are attacked.</p><div class="aoc-cmds">` + A.COMMANDERS.map(c => {
    const r = P.cmds[c.id];
    const role = [P.steward === c.id ? 'Steward' : '', P.defender === c.id ? 'Defender' : '', P.busy.includes(c.id) ? 'In the field' : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="aoc-cmd${r ? '' : ' is-locked'}" data-cmd="${c.id}" style="--civ:${A.CIV[c.civ].color}">
      ${portrait(c, 46)}<span class="aoc-cmd-t"><b>${esc(c.name)}</b><span class="aoc-small">${esc(c.title)}</span>
      <span class="aoc-small aoc-muted">${r ? `Level ${r.lv} · ${esc(c.rarity)}${role ? ' · ' + role : ''}` : esc(A.RECRUIT[c.id]?.text || 'Your starting commander')}</span></span></button>`;
  }).join('') + '</div>';
}
// a heraldic portrait: civ colours, specialization glyph and rarity frame
function portrait(c, s) {
  const civ = A.CIV[c.civ];
  const frame = c.rarity === 'legendary' ? '#e2b04a' : '#a07ad0';
  return `<svg class="aoc-por" width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><rect x="1.5" y="1.5" width="45" height="45" rx="8" fill="${civ.roof}" stroke="${frame}" stroke-width="3"/>
    <circle cx="24" cy="19" r="8" fill="#e4c7a5"/><path d="M10 42c1-9 7-13 14-13s13 4 14 13Z" fill="${civ.color}"/><path d="M15 17c1-6 5-9 9-9s8 3 9 9c-3-2-6-3-9-3s-6 1-9 3Z" fill="${civ.stone}"/>
    <g transform="translate(30 28) scale(.6)">${spec(c.spec)}</g></svg>`;
}
function spec(s) {
  const svg = { inf: '<path d="M14.5 4H20v5.5L10 19.5 4.5 14Z" fill="#dfe6ec" stroke="#1c1712" stroke-width="1.4"/>', cav: '<path d="M6 20c0-4 1.5-6.5 4-8-1-1.5-1.2-3.3-.5-5 2.2.4 3.8 1.8 4.5 3.6l3 .9-.6 2.5-2.7-.6c.5 2.2.3 4.4-.7 6.6" fill="#dfe6ec" stroke="#1c1712" stroke-width="1.4"/>', arc: '<path d="M7 3.5c6 3 6 14 0 17" fill="none" stroke="#dfe6ec" stroke-width="2.4"/><path d="M5 12h14" stroke="#dfe6ec" stroke-width="2"/>', sie: '<path d="M4 17h14M6 17l7-9 6 3" fill="none" stroke="#dfe6ec" stroke-width="2.4"/>', mix: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6Z" fill="#dfe6ec" stroke="#1c1712" stroke-width="1.4"/>' };
  return `<circle cx="12" cy="12" r="12" fill="#1c1712"/>${svg[s] || svg.mix}`;
}
U.portrait = portrait;
function commanderSheet(id) {
  const c = A.CMD[id];
  const draw = () => {
    const P = U.F.player;
    const r = P.cmds[id];
    const sk = r ? r.sk : [1, 1, 1, 1];
    const skillRow = (k, s, label) => {
      const cost = r ? A.skillCost(id, sk[k]) : null;
      const can = r && sk[k] < 5 && !(k === 3 && r.lv < A.ULTIMATE_LEVEL);
      return `<div class="aoc-skill"><div><span class="aoc-kicker">${label} · level ${sk[k]}/5</span><b>${esc(s.name)}</b><div class="aoc-small">${esc(s.desc)}</div></div>
        ${can ? `<button type="button" class="aoc-btn ghost tiny" data-skill="${k}" title="${Object.entries(cost).map(([a, v]) => `${full(v)} ${A.RES_NAME[a]}`).join(', ')}">Raise · ${fmt(cost.gold)} Gold</button>` : ''}</div>`;
    };
    const syn = A.SYNERGY.filter(s => s.a === id || s.b === id).map(s => `<li><b>${esc(s.name)}</b> with ${esc(A.CMD[s.a === id ? s.b : s.a].name)}: ${Object.entries(s.mods).map(([k, v]) => `+${Math.round(v * 100)}% ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ')}</li>`).join('');
    const free = r ? Math.max(0, r.lv - 1 - Object.values(r.tal).reduce((a, b) => a + b, 0)) : 0;
    const tal = r ? `<h3 class="aoc-h4">Talents · ${free} point${free === 1 ? '' : 's'} free</h3><div class="aoc-talents">${c.talents.map(b => `<div class="aoc-talent"><b>${esc(A.TALENT_NAME[b])}</b><span class="aoc-small aoc-muted">${Object.entries(A.TALENT_STATS[b]).map(([k, v]) => `+${(v * 100).toFixed(1)}% ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ')} per point</span><span>${r.tal[b] || 0}/20</span><button type="button" class="aoc-btn ghost tiny" data-tal="${b}"${free > 0 && (r.tal[b] || 0) < 20 ? '' : ' disabled'}>+1</button></div>`).join('')}</div>` : '';
    const xp = r ? `<div class="aoc-wall"><span>Level ${r.lv}/${A.CMD_MAX_LEVEL}</span><span class="aoc-meter"><i style="width:${r.lv >= A.CMD_MAX_LEVEL ? 100 : Math.round(r.xp / A.cmdXpToNext(r.lv, c.rarity) * 100)}%"></i></span><span>${r.lv >= A.CMD_MAX_LEVEL ? 'max' : `${fmt(r.xp)}/${fmt(A.cmdXpToNext(r.lv, c.rarity))} XP`}</span></div>` : `<p class="aoc-p"><b>Recruit:</b> ${esc(A.RECRUIT[id]?.text || '')}</p>`;
    return `<div class="aoc-who">${portrait(c, 64)}<div><b>${esc(c.name)}, ${esc(c.title)}</b><div class="aoc-muted">${esc(A.CIV[c.civ].name)} · ${esc(c.rarity)} · ${esc(c.role)}</div></div></div>
      ${xp}<p class="aoc-p aoc-story">${esc(c.story)}</p>
      ${skillRow(0, c.active, 'Active')}${skillRow(1, c.passives[0], 'Passive')}${skillRow(2, c.passives[1], 'Passive')}${skillRow(3, c.ultimate, `Ultimate · unlocks at level ${A.ULTIMATE_LEVEL}`)}
      ${tal}${syn ? `<h3 class="aoc-h4">Pairings</h3><ul class="aoc-list">${syn}</ul>` : ''}<p class="aoc-muted aoc-small">Rival: ${esc(A.CMD[c.rival]?.name || '')}. Commanders gain experience in battle; every 5 levels raises a skill. Equipment arrives in a later version.</p>`;
  };
  const P = U.F.player;
  const h = U.sheet({
    title: c.name, body: draw(),
    actions: P.cmds[id] ? [
      { label: P.steward === id ? 'City Steward' : 'Make Steward', kind: 'ghost', disabled: P.steward === id, keep: true, onClick: async () => { await U.run({ type: 'steward', cmd: id }, `${c.name} now runs your city.`); setTimeout(() => { h.body.innerHTML = draw(); }, 250); } },
      { label: P.defender === id ? 'Defender' : 'Make Defender', kind: 'ghost', disabled: P.defender === id, keep: true, onClick: async () => { await U.run({ type: 'defender', cmd: id }, `${c.name} will defend your city.`); setTimeout(() => { h.body.innerHTML = draw(); }, 250); } },
    ] : [],
  });
  h.body.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.tal) await U.run({ type: 'talent', cmd: id, branch: b.dataset.tal });
    if (b.dataset.skill) await U.run({ type: 'skill', cmd: id, skill: Number(b.dataset.skill) }, 'Skill raised.');
    setTimeout(() => { if (!h.closed) h.body.innerHTML = draw(); }, 250);
  });
}
U.commanderSheet = commanderSheet;

// training from the building in the town: a soldier, a slider and the price
U.trainSheet = u => {
  const P = U.F.player, d = A.UNITS[u], civ = A.CIV[P.civ];
  const L = P.b[d.building] || 0;
  if (!L) return U.toast(`Build the ${A.BUILDINGS[d.building].name} first.`, 'bad');
  const busy = P.q.train[u];
  const cap = A.trainBatch(L), most = maxTrain(u);
  let n = Math.min(most, Math.max(1, Math.floor(cap / 2)));
  const body = el(`<div class="aoc-trs"><div class="aoc-trs-top"><canvas class="aoc-trs-pic" width="360" height="260" aria-hidden="true"></canvas>
      <div class="aoc-trs-stats"><span>${U.icon('sword', 16)}${d.atk}</span><span>${U.icon('shield', 16)}${d.def}</span><span>${U.icon('herb', 16)}${d.hp}</span><span>${U.icon('clock', 16)}${d.speed}</span><span>${U.icon('pick', 16)}${d.load}</span></div></div>
    <div class="aoc-trs-have"><span>${U.icon(u, 18)}<b>${full(P.troops[u])}</b> at home</span>${civ.variant.unit === u ? `<span class="aoc-gold">${esc(civ.variant.name)}</span>` : ''}</div>
    ${busy ? `<p class="aoc-p">${full(busy.n)} in training: ${dur(busy.end - U.F.t)} left.</p>` : `<div class="aoc-trs-pick"><input type="range" min="0" max="${Math.max(0, most)}" value="${n}" aria-label="How many"><input class="aoc-input aoc-num" type="number" inputmode="numeric" min="0" max="${cap}" value="${n}" aria-label="How many" data-tn="${u}"></div>
    <div class="aoc-up-cost aoc-trs-cost"></div><p class="aoc-muted aoc-small">Up to ${full(cap)} at a time.</p>`}</div>`);
  const pic = body.querySelector('canvas');
  const g = pic.getContext('2d');
  g.scale(2, 2);
  const sp = [U.art.soldier(u, civ.color, 0, 3), U.art.soldier(u, civ.color, 1, 3)];
  let k = 0;
  const anim = () => { g.clearRect(0, 0, 180, 130); for (const [i, x, y] of [[1, 74, 4], [0, 4, 20], [2, 44, 38]]) U.art.put(g, sp[(k + i) % 2], x, y); };
  anim();
  const timer = U.reduced ? 0 : setInterval(() => { k++; anim(); }, 420);
  const cost = () => {
    const box = body.querySelector('.aoc-trs-cost');
    if (!box) return;
    const c = {};
    for (const r in d.cost) c[r] = d.cost[r] * n;
    box.innerHTML = Object.entries(c).map(([r, v]) => `<span class="aoc-up-c${(P.res[r] || 0) < v ? ' is-short' : ''}">${U.resIcon(r, 24)}<b>${fmt(v)}</b><i>${fmt(P.res[r] || 0)}</i></span>`).join('') + `<span class="aoc-up-c">${U.icon('clock', 24)}<b>${dur(trainTime(u, Math.max(1, n)))}</b><i>${fmt(n * d.upkeep)} Food/h</i></span>`;
  };
  const range = body.querySelector('input[type=range]'), num = body.querySelector('input[type=number]');
  if (range) {
    range.addEventListener('input', () => { n = Number(range.value); num.value = n; cost(); });
    num.addEventListener('input', () => { n = Math.max(0, Math.min(cap, Math.floor(Number(num.value) || 0))); range.value = n; cost(); });
    cost();
  }
  return U.sheet({
    title: d.plural, body, onClose: () => clearInterval(timer),
    actions: busy ? [] : [{ label: 'Train', id: 'aoc-train-go', icon: u, onClick: async () => { if (n <= 0) return false; const r = await U.run({ type: 'train', unit: u, n: Math.min(n, cap) }, `Training ${full(Math.min(n, cap))} ${d.plural}.`); return r ? true : false; } }],
  });
};
// the hospital
U.healSheet = async () => {
  const P = U.F.player;
  const w = A.troopsTotal(P.wounded);
  const c = await U.host.query('heal');
  U.sheet({
    title: 'Hospital',
    body: `<div class="aoc-trs-have"><span>${U.icon('herb', 20)}<b>${full(w)}</b> wounded</span><span>${full(P.hosp)} beds</span></div><div>${U.troopLine(P.wounded)}</div>
      ${P.q.heal ? `<p class="aoc-p">Healing ${full(A.troopsTotal(P.q.heal.troops))}: ${dur(P.q.heal.end - U.F.t)} left.</p>` : c?.ok ? `<div class="aoc-up-cost">${Object.entries(c.cost).map(([r, v]) => `<span class="aoc-up-c">${U.resIcon(r, 24)}<b>${fmt(v)}</b><i>${fmt(P.res[r] || 0)}</i></span>`).join('')}<span class="aoc-up-c">${U.icon('clock', 24)}<b>${dur(c.minutes)}</b><i>${full(A.troopsTotal(c.troops))} healed</i></span></div>` : `<p class="aoc-up-err">${esc(c?.err || '')}</p>`}`,
    actions: c?.ok && !P.q.heal ? [{ label: 'Heal', icon: 'herb', onClick: () => U.run({ type: 'heal' }, 'Healing started.') }] : [],
  });
};
function render(force) {
  const root = document.querySelector('.aoc-screen-army');
  if (!root || root.hidden || !U.F) return;
  root.querySelectorAll('[data-atab]').forEach(b => b.setAttribute('aria-selected', b.dataset.atab === K.tab ? 'true' : 'false'));
  const box = root.querySelector('.aoc-atab');
  // keep inputs stable while the player types
  if (!force && box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const html = K.tab === 'troops' ? troopsTab(U.F) : K.tab === 'marches' ? marchesTab(U.F) : cmdsTab(U.F);
  setHtml(box, html);
  if (K.tab === 'troops') for (const u of A.UNIT_KEYS) updateTrainCost(u);
}
U.screen('army', { mount, show: tab => { if (tab) K.tab = tab; render(true); }, update: () => render(false) });

// ================================================================ the march sheet
// o: { kind, to, name, intel?, enemy?, level?, res? }
// the leader's city tile, where joiners gather
U.rallyPoint = id => { const r = U.F.rallies.find(x => x.id === id); const c = r ? U.S.cities.get(r.leader) : null; return c ? c.y * A.MAP_N + c.x : r?.to; };
U.marchSheet = async o => {
  const f = U.F, P = f.player;
  const busy = new Set(P.busy);
  const free = Object.keys(P.cmds).filter(c => !busy.has(c)).sort((a, b) => P.cmds[b].lv - P.cmds[a].lv);
  if (!free.length) { U.toast('Every commander is already leading an army.', 'bad'); return; }
  if (P.marchesOut >= P.marchSlots) { U.toast(`All ${P.marchSlots} march slots are in use.`, 'bad'); return; }
  const isRally = o.kind === 'rally';
  const cap = P.marchCap;
  const known = o.intel?.troops || o.enemy || null;
  const t = {};
  // a sensible default: everything at home up to the army size, gatherers and reinforcements a share
  const share = o.kind === 'gather' ? 0.4 : o.kind === 'reinforce' ? 0.5 : 1;
  let total = 0;
  for (const u of A.UNIT_KEYS) { t[u] = Math.floor(P.troops[u] * share); total += t[u]; }
  if (total > cap) { const k = cap / total; for (const u of A.UNIT_KEYS) t[u] = Math.floor(t[u] * k); }
  const opts = (sel, none) => (none ? '<option value="">None</option>' : '') + free.map(c => `<option value="${c}"${c === sel ? ' selected' : ''}>${esc(A.CMD[c].name)} (Lv ${P.cmds[c].lv}, ${esc(A.CMD[c].spec)})</option>`).join('');
  const body = el(`<div class="aoc-march">
    <p class="aoc-p">${esc({ attack: 'Attack', gather: 'Gather at', reinforce: 'Reinforce', rally: 'Call a guild rally on', scout: 'Scout', join: 'Join' }[o.kind])} <b>${esc(o.name)}</b>.</p>
    ${known ? `<div class="aoc-intel"><span class="aoc-kicker">${o.intel ? `What your scouts saw ${U.ago(o.intel.at)}${o.intel.acc ? `, ${o.intel.acc}% accurate` : ''}` : 'Known defenders'}</span><div>${U.troopLine(known)}</div></div>` : (o.kind === 'attack' || isRally) ? '<p class="aoc-req">You have no scout report on this target. Scouting first tells you what you are attacking.</p>' : ''}
    <div class="aoc-troopinputs">${A.UNIT_KEYS.map(u => `<label class="aoc-ti">${U.icon(u, 20)}<span>${esc(A.UNITS[u].plural)} <span class="aoc-muted">/ ${full(P.troops[u])}</span></span><input class="aoc-input aoc-num" type="number" inputmode="numeric" min="0" max="${P.troops[u]}" data-mu="${u}" value="${t[u]}"></label>`).join('')}</div>
    <div class="aoc-chips"><button type="button" class="aoc-btn ghost tiny" data-preset="all">All</button><button type="button" class="aoc-btn ghost tiny" data-preset="half">Half</button>${known ? '<button type="button" class="aoc-btn ghost tiny" data-preset="counter">Counter their mix</button>' : ''}<button type="button" class="aoc-btn ghost tiny" data-preset="none">None</button></div>
    <div class="aoc-cmdpick"><label>Commander<select class="aoc-input" data-c="1">${opts(free[0], false)}</select></label><label>Second<select class="aoc-input" data-c="2">${opts(free[1] || '', true)}</select></label></div>
    ${isRally ? '<label class="aoc-label">Leaves in<select class="aoc-input" data-wait><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="60">60 minutes</option></select></label>' : ''}
    <div class="aoc-estimate" aria-live="polite"></div>
  </div>`);
  const read = () => { const o2 = {}; body.querySelectorAll('[data-mu]').forEach(i => { o2[i.dataset.mu] = Math.max(0, Math.min(P.troops[i.dataset.mu], Math.floor(Number(i.value) || 0))); }); return o2; };
  let pv = 0;
  const estimate = async () => {
    const tr = read();
    const n = A.troopsTotal(tr);
    const c1 = body.querySelector('[data-c="1"]').value, c2 = body.querySelector('[data-c="2"]').value || null;
    const k = ++pv;
    const p = await U.host.query('preview', { to: o.kind === 'join' ? U.rallyPoint(o.rally) : o.to, troops: tr, c1, c2, kind: o.kind === 'join' ? 'rallyjoin' : o.kind });
    if (k !== pv) return;
    const lines = [];
    lines.push(`<div class="aoc-kv is-row"><div><span>Troops</span><b class="${n > cap && !isRally ? 'aoc-bad' : ''}">${full(n)} / ${full(cap)}</b></div><div><span>Travel</span><b>${p.ok ? dur(p.minutes) : '-'}</b></div><div><span>At 1x</span><b>${p.ok ? realDur(p.minutes) : '-'}</b></div></div>`);
    if (!p.ok) lines.push(`<p class="aoc-req">${esc(p.err)}</p>`);
    if (o.kind === 'join' && p.ok) { const r = U.F.rallies.find(x => x.id === o.rally); if (r && U.F.t + p.minutes > r.launchAt) lines.push('<p class="aoc-req">Your troops would arrive after the rally leaves.</p>'); }
    if (known && (o.kind === 'attack' || isRally)) {
      const mine = A.troopPower(tr);
      const wall = o.intel?.wall || 0;
      const theirs = A.troopPower(known) * (1 + wall * 0.045) + (wall ? 60 * Math.pow(wall, 1.3) : 0) + (o.level ? o.level * 50 : 0);
      const ratio = mine / Math.max(1, theirs);
      const word = ratio > 1.6 ? ['Strongly in your favor', 'aoc-good'] : ratio > 1.15 ? ['In your favor', 'aoc-good'] : ratio > 0.85 ? ['Even: counters, terrain and commanders will decide', 'aoc-gold'] : ['Against you', 'aoc-bad'];
      lines.push(`<p class="aoc-p"><b class="${word[1]}">${word[0]}</b> · your strength ${fmt(mine)} against about ${fmt(theirs)}${wall ? ` (walls level ${wall} add defense and towers)` : ''}. ${isRally ? 'Guild mates who join add their troops.' : ''}</p>`);
    }
    if (o.kind === 'gather') { let load = 0; for (const u of A.UNIT_KEYS) load += tr[u] * A.UNITS[u].load; lines.push(`<p class="aoc-muted aoc-small">They can carry about ${fmt(load / A.RES_VALUE[o.res || 'food'])} ${A.RES_NAME[o.res || 'food']}.</p>`); }
    body.querySelector('.aoc-estimate').innerHTML = lines.join('');
  };
  body.addEventListener('input', estimate);
  body.addEventListener('change', estimate);
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const set = v => body.querySelectorAll('[data-mu]').forEach(i => { i.value = v(i.dataset.mu); });
    if (b.dataset.preset === 'all') set(u => P.troops[u]);
    if (b.dataset.preset === 'half') set(u => Math.floor(P.troops[u] / 2));
    if (b.dataset.preset === 'none') set(() => 0);
    if (b.dataset.preset === 'counter') {
      let main = 'inf', mv = -1;
      for (const u of A.UNIT_KEYS) if ((known[u] || 0) > mv) { mv = known[u]; main = u; }
      const beats = { cav: 'inf', arc: 'cav', inf: 'arc', sie: 'inf' }[main];
      const weak = { inf: 'arc', cav: 'inf', arc: 'cav', sie: 'sie' }[main];
      set(u => (u === weak ? 0 : P.troops[u]));
      void beats;
    }
    // stay within the army size
    const tr = read(); const n = A.troopsTotal(tr);
    if (n > cap && !isRally) { const k = cap / n; body.querySelectorAll('[data-mu]').forEach(i => { i.value = Math.floor(tr[i.dataset.mu] * k); }); }
    estimate();
  });
  estimate();
  U.sheet({
    title: { attack: 'Attack', gather: 'Gather', reinforce: 'Reinforce', rally: 'Call a rally', scout: 'Scout', join: 'Join the rally' }[o.kind] || 'March', body,
    actions: [{ label: 'Cancel', kind: 'ghost' }, {
      label: isRally ? 'Call the rally' : o.kind === 'join' ? 'Join the rally' : 'Send the army', kind: o.kind === 'attack' || isRally || o.kind === 'join' ? 'red' : 'gold', id: 'aoc-march-go',
      onClick: async () => {
        const troops = read();
        const c1 = body.querySelector('[data-c="1"]').value, c2 = body.querySelector('[data-c="2"]').value || null;
        const r = isRally
          ? await U.run({ type: 'rally', to: o.to, troops, c1, c2, wait: Number(body.querySelector('[data-wait]').value) }, 'Rally called. Guild mates have until it leaves to join.')
          : o.kind === 'join'
            ? await U.run({ type: 'joinRally', rally: o.rally, troops, c1, c2 }, 'Your troops are marching to the rally point.')
            : await U.run({ type: 'march', kind: o.kind, to: o.to, troops, c1, c2 }, 'The army is on its way.');
        return r ? true : false;
      },
    }],
  });
};
