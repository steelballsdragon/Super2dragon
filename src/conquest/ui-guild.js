/* Age of Conquest guild screen. Independent: the ten guilds, invitations, applying, refounding a fallen guild.
   Member: rallies to join, the guild's goal and treaties, members, contributions and treasury; leaders also get
   diplomacy (war, pacts, alliances, peace), applications, proposals, officers and objectives. */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, realDur, setText, setHtml } = U;

const G = { detail: null, detailFor: -1, last: 0, busy: false };
const TREATY = { war: 'At war', nap: 'Non-aggression pact', alliance: 'Alliance', truce: 'Truce' };
const STANCE = { grow: 'Growing', expand: 'Expanding', war: 'At war', defend: 'Rebuilding' };

function mount(root) {
  root.innerHTML = '<div class="aoc-scroll aoc-guild"></div>';
  root.addEventListener('click', onClick);
}
function distTo(gd) { const P = U.F.player; return Math.round(Math.hypot(P.x - gd.home.x, P.y - gd.home.y)); }
function guildCard(gd, f) {
  const P = f.player;
  const tr = Object.entries(gd.treaties).filter(([, t]) => t.k === 'war').map(([k]) => f.guilds[k].tag);
  const act = gd.collapsed
    ? (P.guild < 0 ? `<button type="button" class="aoc-btn ghost small" data-refound="${gd.id}"${P.b.hall >= 8 && P.res.gold >= 5000 ? '' : ' disabled'}>Refound (Town Hall 8, 5,000 Gold)</button>` : '')
    : P.guild < 0 ? `<button type="button" class="aoc-btn ${gd.invitedMe ? 'gold' : 'ghost'} small" data-apply="${gd.id}"${gd.members >= A.GUILD_MAX ? ' disabled' : ''}>${gd.invitedMe ? 'Accept invitation' : gd.members >= A.GUILD_MAX ? 'Full' : 'Apply'}</button>` : '';
  return `<div class="aoc-gcard${gd.collapsed ? ' is-fallen' : ''}" style="--gc:${gd.color}">
    <button type="button" class="aoc-gcard-main" data-guild="${gd.id}">${U.banner(gd, 40)}<span><b>${esc(gd.name)}</b> <span class="aoc-tag">[${esc(gd.tag)}]</span>
      <span class="aoc-muted aoc-small">${gd.collapsed ? `Fallen. The slot is refounded ${gd.refoundAt > f.t ? `in ${dur(gd.refoundAt - f.t)}` : 'soon'}.` : `#${gd.rank} · ${fmt(gd.power)} power · ${gd.members}/${A.GUILD_MAX} · led by ${esc(gd.leaderName)}`}</span>
      ${gd.collapsed ? '' : `<span class="aoc-small">${esc(STANCE[gd.stance] || gd.stance)}: ${esc(gd.why)}${tr.length ? ` <span class="aoc-bad">War: ${tr.map(esc).join(', ')}</span>` : ''}</span>
      <span class="aoc-muted aoc-small">${esc(A.REGIONS[gd.region]?.name || '')} · ${gd.sites} holy site${gd.sites === 1 ? '' : 's'} · ${gd.passes} pass${gd.passes === 1 ? '' : 'es'}${gd.capital ? ' · holds the Throne' : ''} · word kept ${gd.cred}/100 · ${distTo(gd)} tiles from you</span>`}</span></button>${act}</div>`;
}
function independent(f) {
  const P = f.player;
  const inv = f.guilds.filter(g => g.invitedMe && !g.collapsed);
  return `<div class="aoc-card"><h2 class="aoc-h3">You are independent</h2><p class="aoc-p">A guild shares vision, scout reports and territory bonuses, protects its members, opens passes through the mountains for its members, and fights for holy sites and the Throne. Leaders judge applications by your power against their members' (you have ${fmt(P.power)}), by grudges, and by how full they are.</p></div>
    ${inv.length ? `<h3 class="aoc-h4">Invitations</h3>${inv.map(g => guildCard(g, f)).join('')}` : ''}
    <h3 class="aoc-h4">The ten guilds of ${esc(A.SERVER.name)}</h3>${f.guilds.slice().sort((a, b) => (a.collapsed - b.collapsed) || a.rank - b.rank).map(g => guildCard(g, f)).join('')}`;
}
function member(f) {
  const P = f.player;
  const gd = f.guilds[P.guild];
  const D = G.detailFor === gd.id ? G.detail : null;
  const leader = gd.leader === P.id;
  const officer = leader || gd.officers.includes(P.id);
  const rallies = f.rallies.map(r => `<div class="aoc-row"><div class="aoc-row-main"><b>${esc(r.leaderName)}'s rally on ${esc(r.targetName)}</b><div class="aoc-muted aoc-small">Leaves in ${dur(r.launchAt - f.t)} (${realDur(r.launchAt - f.t)} at 1x) · ${full(r.troops)} of ${full(r.cap)} troops</div></div>
    <div class="aoc-row-act">${r.leader === P.id ? '<span class="aoc-pill">Yours</span>' : r.joined ? '<span class="aoc-pill is-good">Joined</span>' : `<button type="button" class="aoc-btn red small" data-join="${r.id}">Join</button>`}</div></div>`).join('') || '<p class="aoc-muted">No rally is gathering. Leaders and officers call them on passes, holy sites, the Capital and enemy cities.</p>';
  const diplo = f.guilds.filter(o => o.id !== gd.id && !o.collapsed).map(o => {
    const t = gd.treaties[o.id];
    const rel = gd.rel ? gd.rel[o.id] : null;
    const btns = leader ? [
      !t || t.k === 'nap' ? `<button type="button" class="aoc-btn red tiny" data-diplo="war" data-g="${o.id}">War</button>` : '',
      t && t.k === 'war' ? `<button type="button" class="aoc-btn ghost tiny" data-diplo="peace" data-g="${o.id}">Offer peace</button>` : '',
      !t ? `<button type="button" class="aoc-btn ghost tiny" data-diplo="nap" data-g="${o.id}">Propose pact</button>` : '',
      t && t.k === 'nap' ? `<button type="button" class="aoc-btn ghost tiny" data-diplo="alliance" data-g="${o.id}">Alliance</button>` : '',
      t && (t.k === 'nap' || t.k === 'alliance') ? `<button type="button" class="aoc-btn ghost tiny" data-diplo="cancel" data-g="${o.id}">End treaty</button>` : '',
    ].join('') : '';
    const ws = t && t.k === 'war' && D?.warScore ? ` · war score ${Math.round(D.warScore[o.id] || 0)}` : '';
    return `<div class="aoc-row"><div class="aoc-row-main">${U.banner(o, 22)} <b>${esc(o.name)}</b> <span class="aoc-tag">[${esc(o.tag)}]</span><div class="aoc-small"><span class="${t?.k === 'war' ? 'aoc-bad' : t ? 'aoc-good' : 'aoc-muted'}">${t ? esc(TREATY[t.k]) + (t.secret ? ' (secret)' : '') + (t.until ? ` until ${A.clock(t.until)}` : '') : 'No treaty'}</span>${rel != null ? ` · relations ${rel > 0 ? '+' : ''}${rel}` : ''}${ws}</div></div><div class="aoc-row-act">${btns}</div></div>`;
  }).join('');
  const props = leader && (f.proposals || []).length ? `<h3 class="aoc-h4">Proposals to you</h3>` + f.proposals.map(p => `<div class="aoc-row"><div class="aoc-row-main"><b>${esc(p.fromName)}</b> ${p.k === 'peace' ? 'offers peace' : p.k === 'nap' ? 'proposes a non-aggression pact' : p.k === 'alliance' ? 'proposes an alliance' : `calls you to war against ${esc(f.guilds[p.against]?.name || '')}`}</div>
    <div class="aoc-row-act"><button type="button" class="aoc-btn gold tiny" data-answer="${p.id}" data-yes="1">Accept</button><button type="button" class="aoc-btn ghost tiny" data-answer="${p.id}" data-yes="0">Decline</button></div></div>`).join('') : '';
  const apps = leader && (f.applicants || []).length ? `<h3 class="aoc-h4">Applications</h3>` + f.applicants.map(a => `<div class="aoc-row"><div class="aoc-row-main"><b>${esc(a.name)}</b><div class="aoc-muted aoc-small">Town Hall ${a.hall} · ${fmt(a.power)} power</div></div>
    <div class="aoc-row-act"><button type="button" class="aoc-btn gold tiny" data-app="${a.id}" data-yes="1">Accept</button><button type="button" class="aoc-btn ghost tiny" data-app="${a.id}" data-yes="0">Decline</button></div></div>`).join('') : '';
  const objOpts = f.marks.filter(m => m.kind !== 'ruin').map(m => `<option value="${m.id}">${esc(m.name)}${m.owner >= 0 ? ` [${esc(f.guilds[m.owner].tag)}]` : ''}</option>`).join('');
  const members = D ? D.memberList.map(m => `<div class="aoc-row"><div class="aoc-row-main"><button type="button" class="aoc-link" data-insp="${m.id}">${esc(m.name)}</button> ${m.role !== 'member' ? `<span class="aoc-pill">${esc(m.role)}</span>` : ''}${m.id === P.id ? ' <span class="aoc-pill is-good">you</span>' : ''}<div class="aoc-muted aoc-small">Town Hall ${m.hall} · ${fmt(m.power)} power · gave ${fmt(m.contributed || 0)}</div></div>
    <div class="aoc-row-act">${leader && m.id !== P.id ? `<button type="button" class="aoc-btn ghost tiny" data-officer="${m.id}" data-on="${m.role === 'officer' ? 0 : 1}">${m.role === 'officer' ? 'Demote' : 'Officer'}</button><button type="button" class="aoc-btn ghost tiny" data-kick="${m.id}">Expel</button>` : ''}</div></div>`).join('') : '<p class="aoc-muted">Loading members</p>';
  const tech = D ? Object.entries(D.techDefs).map(([k, d]) => `<div class="aoc-row"><div class="aoc-row-main"><b>${esc(d.name)}</b> <span class="aoc-lv">${gd.tech[k] || 0}/5</span><div class="aoc-muted aoc-small">${esc(d.desc)}</div></div></div>`).join('') : '';
  const hist = D ? D.history.slice(0, 12).map(e => `<li><span class="aoc-muted">${A.clock(e.t)}</span> ${esc(e.txt)}</li>`).join('') : '';
  return `<div class="aoc-card aoc-ghead" style="--gc:${gd.color}">${U.banner(gd, 54)}<div><h2 class="aoc-h3">${esc(gd.name)} <span class="aoc-tag">[${esc(gd.tag)}]</span></h2>
      <div class="aoc-muted">Rank ${gd.rank} · ${fmt(gd.power)} power · ${gd.members}/${A.GUILD_MAX} members · ${gd.sites} holy sites · ${gd.passes} passes${gd.capital ? ' · holds the Throne' : ''}</div>
      <div class="aoc-muted">Leader ${esc(gd.leaderName)} · you are ${esc(P.role)} · succession: ${esc({ strongest: 'the strongest officer', election: 'elections every 5 days', heir: 'a named heir' }[gd.rule])}</div></div></div>
    <div class="aoc-card"><span class="aoc-kicker">${esc(STANCE[gd.stance] || gd.stance)}</span><p class="aoc-p">${esc(gd.why)}</p>
      ${officer ? `<label class="aoc-label">Guild objective<select class="aoc-input" data-objective><option value="-1">None</option>${objOpts}</select></label>` : ''}</div>
    <h3 class="aoc-h4">Rallies</h3>${rallies}
    ${props}${apps}
    <h3 class="aoc-h4">Diplomacy${leader ? '' : ' (decided by the leader)'}</h3>${diplo}
    <h3 class="aoc-h4">Contribute</h3><div class="aoc-card"><p class="aoc-muted aoc-small">The treasury pays for guild technology. Contributions raise your standing (officers are chosen from the top givers).</p>
      <div class="aoc-trade">${A.RES.map(r => `<label>${U.resIcon(r, 15)} ${A.RES_NAME[r]}<input class="aoc-input aoc-num" type="number" inputmode="numeric" min="0" data-give="${r}" placeholder="0"></label>`).join('')}</div>
      <button type="button" class="aoc-btn gold small" data-act="give">Give to the guild</button>
      ${D?.treasury ? `<p class="aoc-small aoc-muted">Treasury: ${U.cost(D.treasury)}</p>` : ''}</div>
    <h3 class="aoc-h4">Guild technology</h3>${tech}
    <h3 class="aoc-h4">Members</h3>${members}
    <h3 class="aoc-h4">Recent history</h3><ul class="aoc-list aoc-small">${hist}</ul>
    <button type="button" class="aoc-btn ghost small" data-act="leave">Leave the guild</button>`;
}
async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const f = U.F;
  if (b.dataset.apply) { const gd = f.guilds[b.dataset.apply]; const r = await U.host.cmd({ type: 'apply', guild: gd.id }); if (r.ok) U.toast(`You joined ${gd.name}.`, 'good'); else U.toast(r.err === 'pending' ? 'Application sent.' : r.err, r.err === 'pending' ? 'info' : 'bad'); G.last = 0; }
  if (b.dataset.refound) U.confirm({ title: 'Found a new guild?', text: 'You take the fallen guild\'s place among the ten and become its leader. It costs 5,000 Gold.', ok: 'Found the guild', onOk: () => U.run({ type: 'refound', guild: Number(b.dataset.refound) }, 'Your guild is founded. Recruit members by being strong and trusted.') });
  if (b.dataset.guild) guildSheet(Number(b.dataset.guild));
  if (b.dataset.join) { const r = f.rallies.find(x => x.id === Number(b.dataset.join)); if (r) U.marchSheet({ kind: 'join', rally: r.id, to: r.to, name: `${r.leaderName}'s rally on ${r.targetName}` }); }
  if (b.dataset.diplo) {
    const o = f.guilds[b.dataset.g];
    const k = b.dataset.diplo;
    const text = { war: `Declare war on ${o.name}? Their allies may join them.${o.treaties && f.guilds[f.player.guild].treaties[o.id]?.k === 'nap' ? ' Breaking your pact is a betrayal: every guild will trust you less.' : ''}`, peace: `Offer peace to ${o.name}? They accept if they are not clearly winning.`, nap: `Propose a non-aggression pact to ${o.name}?`, alliance: `Propose an alliance to ${o.name}? Allies are called to each other's wars.`, cancel: `End your treaty with ${o.name}?` }[k];
    U.confirm({ title: 'Diplomacy', text: esc(text), ok: 'Send', kind: k === 'war' ? 'red' : 'gold', onOk: () => U.run({ type: 'diplo', k, guild: o.id }, k === 'war' ? `War declared on ${o.name}.` : 'Done.') });
  }
  if (b.dataset.answer) await U.run({ type: 'answer', proposal: Number(b.dataset.answer), yes: b.dataset.yes === '1' }, 'Answered.');
  if (b.dataset.app) await U.run({ type: 'answer', applicant: Number(b.dataset.app), yes: b.dataset.yes === '1' }, 'Answered.');
  if (b.dataset.officer) { await U.run({ type: 'officer', gov: Number(b.dataset.officer), on: b.dataset.on === '1' }, 'Done.'); G.last = 0; }
  if (b.dataset.kick) U.confirm({ title: 'Expel this member?', text: 'They will remember it.', ok: 'Expel', kind: 'red', onOk: async () => { await U.run({ type: 'kick', gov: Number(b.dataset.kick) }, 'Expelled.'); G.last = 0; } });
  if (b.dataset.insp) U.inspect(Number(b.dataset.insp));
  if (b.dataset.act === 'give') {
    const res = {};
    document.querySelectorAll('[data-give]').forEach(i => { res[i.dataset.give] = Math.floor(Number(i.value) || 0); });
    const r = await U.run({ type: 'contribute', res });
    if (r) { U.toast(`Thank you: ${fmt(r.value)} in value given.`, 'good'); document.querySelectorAll('[data-give]').forEach(i => { i.value = ''; }); G.last = 0; }
  }
  if (b.dataset.act === 'leave') U.confirm({ title: 'Leave the guild?', text: 'Your garrisons come home and you lose the guild\'s vision and bonuses.', ok: 'Leave', kind: 'red', onOk: () => U.run({ type: 'leave' }, 'You left the guild.') });
}
async function guildSheet(id) {
  const d = await U.host.query('guild', { id });
  if (!d) return;
  const f = U.F;
  const tr = Object.entries(d.treaties).map(([k, t]) => `<li>${esc(TREATY[t.k])} with ${esc(f.guilds[k].name)}${t.secret ? ' (secret, you found out)' : ''}</li>`).join('') || '<li class="aoc-muted">No public treaties</li>';
  U.sheet({
    title: d.name, wide: true,
    body: `<div class="aoc-who">${U.banner(d, 48)}<div><b>${esc(d.name)} [${esc(d.tag)}]</b><div class="aoc-muted">Rank ${d.rank} · ${fmt(d.power)} power · ${d.members}/${A.GUILD_MAX} members · led by ${esc(d.leaderName)}</div><div class="aoc-small">${esc(d.why)}</div></div></div>
      <h3 class="aoc-h4">Treaties</h3><ul class="aoc-list">${tr}</ul>
      <h3 class="aoc-h4">Members</h3><div class="aoc-members">${d.memberList.slice(0, 60).map(m => `<button type="button" class="aoc-link" data-insp="${m.id}">${esc(m.name)}${m.role !== 'member' ? ` (${esc(m.role)})` : ''} · ${fmt(m.power)}</button>`).join('')}</div>
      <h3 class="aoc-h4">History</h3><ul class="aoc-list aoc-small">${d.history.slice(0, 15).map(e => `<li><span class="aoc-muted">${A.clock(e.t)}</span> ${esc(e.txt)}</li>`).join('') || '<li class="aoc-muted">Nothing recorded yet</li>'}</ul>`,
  }).body.addEventListener('click', e => { const b = e.target.closest('[data-insp]'); if (b) U.inspect(Number(b.dataset.insp)); });
}
async function render(force) {
  const root = document.querySelector('.aoc-screen-guild .aoc-guild');
  if (!root || !U.F) return;
  const f = U.F, P = f.player;
  if (root.contains(document.activeElement) && ['INPUT', 'SELECT'].includes(document.activeElement.tagName) && !force) return;
  if (P.guild >= 0 && !G.busy && (force || G.detailFor !== P.guild || performance.now() - G.last > 5000)) {
    G.busy = true;
    try { G.detail = await U.host.query('guild', { id: P.guild }); G.detailFor = P.guild; G.last = performance.now(); } finally { G.busy = false; }
  }
  setHtml(root, P.guild >= 0 ? member(U.F) : independent(U.F));
  const sel = root.querySelector('[data-objective]');
  if (sel && !sel._wired) {
    sel._wired = true;
    const gd = f.guilds[P.guild];
    sel.value = String(G.detail?.home ? (f.marks.find(m => gd.why.includes(m.name))?.id ?? -1) : -1);
    sel.addEventListener('change', () => U.run({ type: 'objective', mark: Number(sel.value) }, 'Objective set. Your guild mates will plan around it.'));
  }
}
U.screen('guild', { mount, show: () => render(true), update: () => render(false) });
