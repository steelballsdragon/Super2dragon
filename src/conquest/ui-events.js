/* Age of Conquest events hub: daily objectives, the event calendar (Wheel of Fortune, Card King, More Than Gems,
   Ceroli Crisis, Arms Training, the Shadow Legion, barbarian forts), Sunset Canyon, the Expedition, guild helps
   and donations, the tavern and sculptures, items and the shops. Everything shown comes from the engine's events
   view; every button sends a command the engine validates. */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, realDur, setHtml } = U;

const E = { tab: 'daily', v: null, busy: false, last: 0, shop: 'gems', prev: 'city', role: 'dps', diff: 0, cmd: null };
const ETABS = [['daily', 'Daily', 'calendar'], ['events', 'Events', 'star'], ['canyon', 'Canyon', 'sword'], ['expedition', 'Expedition', 'map'], ['guild', 'Guild', 'guild'], ['tavern', 'Tavern', 'chest'], ['items', 'Items', 'bag'], ['shops', 'Shops', 'gem']];
const SVG = {
  key: c => `<svg class="aico" width="S" height="S" viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="12" r="4.6" fill="none" stroke="${c}" stroke-width="2.6"/><path d="M12 12h9.5M18 12v3.6M21 12v2.6" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/><circle cx="7.5" cy="12" r="4.6" fill="none" stroke="#1d1408" stroke-width=".6" opacity=".5"/></svg>`,
  ap: `<svg class="aico" width="S" height="S" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#2a6cc2" stroke="#0e2f5c" stroke-width="1"/><path d="M13.4 4.5 7.5 13h4.1l-1.2 6.5 6.1-9h-4.2Z" fill="#9fe0ff" stroke="#0e2f5c" stroke-width=".8" stroke-linejoin="round"/></svg>`,
  tele: `<svg class="aico" width="S" height="S" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#3a2a6e" stroke="#c9b6ff" stroke-width="1.2"/><path d="M12 5.5a6.5 6.5 0 1 1-6.1 4.3M12 9a3 3 0 1 1-2.8 2" fill="none" stroke="#d9cbff" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  medal: `<svg class="aico" width="S" height="S" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2.5h4l1.5 6-3 1Zm10 0h-4l-1.5 6 3 1Z" fill="#c0392b" stroke="#5e1410" stroke-width=".8"/><circle cx="12" cy="15" r="6.5" fill="#f2c04e" stroke="#8a5a12" stroke-width="1.1"/><path d="M12 11.2l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3Z" fill="#fff1c2"/></svg>`,
  token: `<svg class="aico" width="S" height="S" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#6b1d24" stroke="#f2c04e" stroke-width="1.4"/><path d="M12 5.5c2.6 2 4.6 3.4 4.6 6.4a4.6 4.6 0 0 1-9.2 0c0-3 2-4.4 4.6-6.4Z" fill="#ff7a4a" stroke="#f2c04e" stroke-width=".8"/></svg>`,
  credit: `<svg class="aico" width="S" height="S" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#2f7a4a" stroke="#bff0cf" stroke-width="1.2"/><path d="M7 13.5l3 2.8 7-7.8" fill="none" stroke="#e8fff0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
const svg = (s, size) => s.replace(/width="S" height="S"/, `width="${size}" height="${size}"`);
// the picture for a reward or an item
function itemIcon(k, s = 36) {
  if (k === 'gems') return U.icon('gem', s);
  if (k === 'credits') return svg(SVG.credit, s);
  if (k === 'tokens') return svg(SVG.token, s);
  if (k === 'medals') return svg(SVG.medal, s);
  if (k.startsWith('sc:')) {
    const id = k.slice(3);
    if (id === 'uniE' || id === 'uniL') return `<span class="aoc-ev-statue is-${id === 'uniL' ? 'leg' : 'epic'}" style="width:${s}px;height:${s}px"${U.art?.pmeta('statue') ? ` data-statue="1"` : ''}></span>`;
    return A.CMD[id] ? U.portrait(A.CMD[id], s) : '';
  }
  const it = A.ITEMS[k];
  if (!it) return U.icon('gift', s);
  switch (it.kind) {
    case 'speed': return U.icon('speedup', s);
    case 'tome': return `<span class="aoc-ev-tome t${k.slice(-1)}">${U.icon('scroll', s)}</span>`;
    case 'key': return svg(SVG.key(k === 'keyG' ? '#f2c04e' : '#d6dde6'), s);
    case 'ap': return svg(SVG.ap, s);
    case 'res': return U.resIcon(Object.keys(it.res)[0], s);
    case 'box': return U.icon('gift', s);
    case 'shield': return U.icon('shield', s);
    case 'tele': return svg(SVG.tele, s);
  }
  return U.icon('gift', s);
}
const rname = k => A.rewardName(k);
function rewardLine(rw, s = 18) { return Object.keys(rw || {}).map(k => `<span class="aoc-ev-rw" title="${esc(rname(k))}">${itemIcon(k, s)}<b>${fmt(rw[k])}</b></span>`).join(''); }
U.rewardLine = rewardLine;
U.itemIcon = itemIcon;
function rewardTiles(rw) { return Object.keys(rw || {}).map(k => `<div class="aoc-reward-item"><span class="aoc-tile">${itemIcon(k, 40)}<b>${fmt(rw[k])}</b></span><span class="aoc-reward-name">${esc(rname(k))}</span></div>`).join(''); }
// a reward pop-up for items, sculptures and currencies
U.rewardItems = (rw, title = 'Reward') => new Promise(res => {
  if (!rw || !Object.keys(rw).length) { res(); return; }
  const chest = U.art?.pmeta('chest-2');
  const wrap = el(`<div class="aoc-reward" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="aoc-scrim"></div>
    <div class="aoc-reward-card" tabindex="-1"><div class="aoc-reward-rays" aria-hidden="true"></div>${chest ? `<img class="aoc-reward-chest" src="${chest.src}" alt="" width="96" height="90">` : ''}<div class="aoc-reward-title">${esc(title)}</div>
      <div class="aoc-reward-grid">${rewardTiles(rw)}</div><button type="button" class="aoc-btn gold wide aoc-reward-ok">OK</button></div></div>`);
  const done = () => { wrap.remove(); res(); };
  wrap.querySelector('.aoc-reward-ok').addEventListener('click', done);
  wrap.querySelector('.aoc-scrim').addEventListener('click', done);
  U.layer().appendChild(wrap);
  try { wrap.querySelector('.aoc-reward-ok').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
});
const statueCss = () => {
  const m = U.art?.pmeta('statue');
  if (!m || document.getElementById('aoc-ev-statue')) return;
  const st = document.createElement('style');
  st.id = 'aoc-ev-statue';
  st.textContent = `.aoc-ev-statue[data-statue]{background-image:url(${m.src})}`;
  document.head.appendChild(st);
};
window.addEventListener('aoc-art', statueCss);

// ================================================================ data
async function refresh(force) {
  if (E.busy && !force) return;
  E.busy = true;
  try { E.v = await U.host.query('events'); E.last = performance.now(); } finally { E.busy = false; }
  render();
}
async function act(cmd, opts = {}) {
  const r = await U.host.cmd(cmd);
  if (!r || !r.ok) { U.toast(r?.err || 'That did not work.', 'bad'); return null; }
  if (opts.ok) U.toast(opts.ok, 'good');
  await refresh(true);
  return r;
}
const cmdName = id => A.CMD[id]?.name || id;
function timeLeft(w) {
  const t = E.v.t;
  return w.open ? `<span class="aoc-pill is-good">Open · ends in ${dur(w.end - t)}</span>` : `<span class="aoc-pill">Opens in ${dur(w.next - t)} (${realDur(w.next - t)} at 1x)</span>`;
}
function bar(a, b) { return `<span class="aoc-ev-bar"><i style="width:${Math.round(Math.min(1, a / Math.max(1, b)) * 100)}%"></i></span>`; }
function milestones(list, value, unit) {
  return `<div class="aoc-ev-miles">${list.map(m => `<div class="aoc-ev-mile${m.got ? ' is-got' : value >= m.at ? ' is-ready' : ''}"><span class="aoc-ev-mile-at">${fmt(m.at)}${unit ? ' ' + unit : ''}</span><span>${rewardLine(m.rw, 16)}</span>${m.got ? `<span class="aoc-good">${U.icon('check', 14)}</span>` : ''}</div>`).join('')}</div>`;
}
function lineHtml(line, size = 30) { return `<span class="aoc-ev-line">${line.map(x => `<span class="aoc-ev-lc">${U.portrait(A.CMD[x.id || x], size)}${x.lv ? `<b>${x.lv}</b>` : ''}</span>`).join('')}</span>`; }
function fightsHtml(fights) {
  return `<ul class="aoc-list aoc-small aoc-ev-fights">${fights.map(x => `<li><b>${esc(x.a)}</b> (${full(x.aStart)}) against <b>${esc(x.d)}</b> (${full(x.dStart)}): <span class="${x.won ? 'aoc-good' : 'aoc-bad'}">${x.won ? 'won' : 'lost'}</span>, ${full(x.won ? x.aLeft : x.dLeft)} left standing</li>`).join('')}</ul>`;
}

// ================================================================ tabs
function daily(v) {
  const d = v.daily;
  const chests = d.chests.map((c, k) => `<button type="button" class="aoc-ev-chest${c.got ? ' is-got' : c.ready ? ' is-ready' : ''}" style="left:${c.at}%" data-daily="${k}" aria-label="Chest at ${c.at} points${c.got ? ', claimed' : c.ready ? ', ready' : ''}">${U.icon(c.got ? 'check' : 'chest', 22)}<span>${c.at}</span></button>`).join('');
  return `<div class="aoc-card"><div class="aoc-ev-pts"><b>${Math.min(100, d.pts)}</b><span>activity points today</span><span class="aoc-muted aoc-small">New objectives in ${dur(d.resets - v.t)}</span></div>
    <div class="aoc-ev-track"><span class="aoc-ev-bar"><i style="width:${Math.min(100, d.pts)}%"></i></span>${chests}</div>
    <p class="aoc-muted aoc-small">Tap a chest when it shines. The last one holds gems, an epic sculpture, a Magic Box and a Gold Key.</p></div>
    <div class="aoc-card"><h3 class="aoc-h4">How to earn points</h3>${d.tasks.map(t => `<div class="aoc-ev-task"><span>${esc(t.name)} <span class="aoc-muted aoc-small">+${t.each}${t.per > 1 ? ` per ${t.per}` : ' each'}</span></span><b>${t.pts}/${t.max}</b>${bar(t.pts, t.max)}</div>`).join('')}</div>
    <div class="aoc-card"><h3 class="aoc-h4">${svg(SVG.ap, 18)} Action points</h3><p class="aoc-p"><b>${full(v.ap)}</b> of ${full(v.apMax)}. One returns every ${v.apEvery} game minutes. Attacking a bandit camp costs ${A.campAp(1)} to ${A.campAp(10)} by its level; leading or joining a rally on a barbarian fort costs ${A.FORT_AP}.</p></div>`;
}
function evCard(id, title, w, body, pic) {
  return `<div class="aoc-card aoc-ev-card${w && w.open ? ' is-open' : ''}" data-ev="${id}"><div class="aoc-ev-card-h">${pic || ''}<div><h3 class="aoc-h3">${esc(title)}</h3>${w ? timeLeft(w) : ''}</div></div>${w ? `<p class="aoc-muted aoc-small">${esc(w.text)}</p>` : ''}${body}</div>`;
}
function events(v) {
  const W = v.windows, P = U.F.player;
  const own = Object.keys(P.cmds).sort((a, b) => P.cmds[b].lv - P.cmds[a].lv);
  if (!E.cmd || !P.cmds[E.cmd]) E.cmd = own[0];
  const out = [];
  // Wheel of Fortune
  {
    const wv = v.wheel, w = W.wheel;
    out.push({ open: w.open, at: w.next, html: evCard('wheel', 'Wheel of Fortune', w, `<div class="aoc-ev-feat">${U.portrait(A.CMD[wv.featured], 54)}<div><b>${esc(cmdName(wv.featured))}</b><div class="aoc-muted aoc-small">Featured: ten sculptures recruit, more raise skills. ${wv.spins} spins this event.</div></div></div>
      <div class="aoc-ev-slots">${wv.slots.map(rw => `<span class="aoc-ev-slot">${rewardLine(rw, 22)}</span>`).join('')}</div>
      ${w.open ? `<div class="aoc-chips"><button type="button" class="aoc-btn gold small" data-spin="1">${wv.free ? 'Free spin' : `Spin · ${wv.cost} ${U.icon('gem', 14)}`}</button><button type="button" class="aoc-btn blue small" data-spin="10">Spin 10 · ${fmt(wv.cost * 9)} ${U.icon('gem', 14)}</button></div>` : ''}
      ${milestones(wv.milestones, wv.spins, 'spins')}`) });
  }
  // Card King
  {
    const cv = v.cards, w = W.cards;
    out.push({ open: w.open, at: w.next, html: evCard('cards', 'Card King', w, `<div class="aoc-ev-feat">${U.portrait(A.CMD[cv.featured], 54)}<div><b>${esc(cmdName(cv.featured))}</b><div class="aoc-muted aoc-small">Board ${cv.board + 1}. The top card holds five of their sculptures.</div></div></div>
      <div class="aoc-ev-cards">${cv.flipped.map((rw, k) => rw ? `<span class="aoc-ev-cardface is-up">${rewardLine(rw, 26)}</span>` : `<button type="button" class="aoc-ev-cardface" data-flip="${k}"${w.open ? '' : ' disabled'} aria-label="Flip card ${k + 1}"><span class="aoc-ev-q">?</span></button>`).join('')}</div>
      ${w.open ? `<p class="aoc-small">Next flip: <b>${cv.cost}</b> ${U.icon('gem', 14)} · you have ${full(v.inv.gems)}</p>` : ''}${milestones(cv.milestones, cv.board, 'boards')}`) });
  }
  // More Than Gems
  {
    const w = W.mtg, m = v.mtg;
    out.push({ open: w.open, at: w.next, html: evCard('mtg', 'More Than Gems', w, `<p class="aoc-p">Spent so far: <b>${full(m.spent)}</b> ${U.icon('gem', 14)}</p>${bar(m.spent, 25000)}${milestones(m.milestones, m.spent, 'gems')}`) });
  }
  // Ceroli Crisis
  {
    const w = W.ceroli, c = v.ceroli;
    if (!(E.diff >= 1 && E.diff <= c.unlocked)) E.diff = c.unlocked;
    out.push({ open: w.open, at: w.next, html: evCard('ceroli', 'Ceroli Crisis', w, `<p class="aoc-small">Raids left today: <b>${c.left}</b> · difficulty ${c.unlocked} of ${c.levels} unlocked · ${full(v.inv.tokens)} tokens</p>
      ${w.open ? `<div class="aoc-chips" role="group" aria-label="Role">${Object.entries(c.roles).map(([k, n]) => `<button type="button" class="aoc-btn ${E.role === k ? 'gold' : 'ghost'} tiny" data-role="${k}">${esc(n)}</button>`).join('')}</div>
      <label class="aoc-label">Commander<select data-cecmd>${own.map(id => `<option value="${id}"${id === E.cmd ? ' selected' : ''}>${esc(cmdName(id))} (level ${P.cmds[id].lv})</option>`).join('')}</select></label>
      <label class="aoc-label">Difficulty<select data-cediff>${Array.from({ length: c.unlocked }, (_, k) => `<option value="${k + 1}"${k + 1 === E.diff ? ' selected' : ''}>${k + 1} · Ceroli has ${fmt(c.boss[k])} health</option>`).join('')}</select></label>
      <div class="aoc-chips"><button type="button" class="aoc-btn red small" data-ceroli="1"${c.left > 0 ? '' : ' disabled'}>${U.icon('sword', 15)}<span>Start the raid</span></button><button type="button" class="aoc-btn ghost small" data-shop="ceroli">Ceroli shop</button></div>` : ''}
      <p class="aoc-muted aoc-small">Three guild mates join you. A Tank takes Ceroli's blows, Damage brings her down, a Healer keeps the team standing. Tokens follow your share of the damage; a win unlocks the next difficulty.</p>`) });
  }
  // Arms Training
  {
    const w = W.arms, a = v.arms;
    out.push({ open: w.open, at: w.next, html: evCard('arms', 'Arms Training', w, `<p class="aoc-small">Attempts left today: <b>${a.left}</b> · best: <b>${a.best}</b> waves</p>
      <p class="aoc-muted aoc-small">Wave 1: ${U.troopLine(a.first.troops)}. Each wave is about a fifth stronger. Your Sunset Canyon line fights (no real troops are lost).</p>
      ${w.open ? `<div class="aoc-chips"><button type="button" class="aoc-btn red small" data-arms="1"${a.left > 0 ? '' : ' disabled'}>${U.icon('sword', 15)}<span>Face Lohar</span></button></div>` : ''}${milestones(a.milestones, a.best, 'waves')}`) });
  }
  // Shadow Legion
  {
    const w = W.legion, L = v.legion;
    const where = P.guild < 0 ? 'Join a guild: the Legion only strikes cities inside guild territory.' : v.inTerritory ? 'Your city stands inside your guild\'s territory: it will be attacked. Keep troops at home and a Defender set.' : 'Your city is outside your guild\'s territory and will not take part. Move it inside to earn points.';
    out.push({ open: w.open, at: w.next, html: evCard('legion', 'Shadow Legion Invasion', w, `<p class="aoc-p">${esc(where)}</p>
      ${L ? `<p class="aoc-small">Last invasion: wave ${L.wave} of 5 · your points <b>${full(L.pts)}</b>${L.broken ? ' · your city was broken' : ''}</p>${L.guilds.length ? `<ol class="aoc-list aoc-small">${L.guilds.slice(0, 3).map(x => `<li>${esc(x.name)}: ${full(x.pts)} points</li>`).join('')}</ol>` : ''}` : ''}
      <p class="aoc-muted aoc-small">Each wave you hold scores 100 times its number. Rewards: 100 points a speedup, 300 two tomes, 600 two silver keys, 1,000 a gold key, 1,500 a universal legendary sculpture; the best guilds earn gems for every member.</p>`) });
  }
  out.sort((a, b) => (b.open - a.open) || a.at - b.at);
  // always on: barbarian forts
  const forts = `<div class="aoc-card aoc-ev-card"><div class="aoc-ev-card-h">${U.art?.pmeta('bastion') ? `<img class="aoc-ev-pic" src="${U.art.pmeta('bastion').src}" alt="" width="64" height="56">` : ''}<div><h3 class="aoc-h3">Barbarian forts</h3><span class="aoc-pill is-good">Always open</span></div></div>
    <p class="aoc-p">Sixty forts stand across the kingdom, stronger toward the centre. They fall only to guild rallies (${A.FORT_AP} action points to lead or join). Everyone in a winning rally earns Tomes of Knowledge, speedups and commander experience.</p>
    <div class="aoc-chips"><button type="button" class="aoc-btn ghost small" data-fort="1">${U.icon('map', 15)}<span>Show the nearest fort</span></button></div></div>`;
  return out.map(x => x.html).join('') + forts;
}
function canyon(v) {
  const c = v.canyon;
  return `<div class="aoc-card"><div class="aoc-ev-rank"><b>#${c.rank}</b><span>of ${c.of} in Sunset Canyon</span></div>
    <p class="aoc-small">Battles left today: <b>${c.left}</b> of ${A.CANYON.attempts}. At the end of each game day your rank pays ${rewardLine(c.reward, 16)}</p>
    <h3 class="aoc-h4">Your line</h3><div class="aoc-ev-myline">${lineHtml(c.formation.map(id => ({ id, lv: U.F.player.cmds[id]?.lv })), 44)}<button type="button" class="aoc-btn ghost small" data-formation="1">Change</button></div>
    <p class="aoc-muted aoc-small">${c.custom ? 'Your chosen order.' : 'Your five best commanders (choose your own order with Change).'} The first fights first; a winner carries its survivors into the next enemy. Each commander leads an army sized by their level, so no troops are lost. The same line defends your rank.</p></div>
    <h3 class="aoc-h4">Challenge</h3>${c.choices.map(o => `<div class="aoc-row"><div class="aoc-row-main"><b>${esc(o.name)}</b> <span class="aoc-muted aoc-small">#${o.rank} · ${fmt(o.power)} power</span><div>${lineHtml(o.line, 28)}</div></div><div class="aoc-row-act"><button type="button" class="aoc-btn red small" data-canyon="${o.id}"${c.left > 0 ? '' : ' disabled'}>Fight</button></div></div>`).join('')}
    ${c.log.length ? `<h3 class="aoc-h4">Recent battles</h3><ul class="aoc-list aoc-small">${c.log.map(x => `<li><span class="aoc-muted">${A.clock(x.t)}</span> ${x.a === U.F.player.id ? `You ${x.won ? 'beat' : 'lost to'} ${esc(x.dName)}${x.after !== x.before ? ` (rank ${x.before} to ${x.after})` : ''}` : `${esc(x.aName)} ${x.won ? 'beat' : 'failed against'} your defense`}</li>`).join('')}</ul>` : ''}
    <h3 class="aoc-h4">The top ten</h3><ol class="aoc-list aoc-small">${c.top.map(x => `<li>${esc(x.name)}${x.guild >= 0 ? ` <span class="aoc-tag">[${esc(U.F.guilds[x.guild].tag)}]</span>` : ''}</li>`).join('')}</ol>`;
}
function expedition(v) {
  const x = v.expedition;
  const st = x.next;
  return `<div class="aoc-card"><div class="aoc-ev-rank"><b>${x.stage}/${x.of}</b><span>stages cleared</span></div>
    <p class="aoc-small">${svg(SVG.medal, 16)} <b>${full(x.medals)}</b> medals · +${fmt(x.rate)} every game hour (4 per stage cleared, forever)</p>
    <div class="aoc-chips"><button type="button" class="aoc-btn ghost small" data-shop="expedition">Expedition shop</button></div></div>
    ${st ? `<div class="aoc-card"><h3 class="aoc-h3">${esc(st.name)}</h3>${st.armies.map(a => `<div class="aoc-ev-task"><span>${esc(a.name)}</span><span>${U.troopLine(a.troops)}</span></div>`).join('')}
      <p class="aoc-small">First clear: ${rewardLine(st.first, 16)}</p>
      <div class="aoc-chips"><button type="button" class="aoc-btn red small" data-exp="1"${x.left > 0 ? '' : ' disabled'}>${U.icon('sword', 15)}<span>Fight (${x.left} left today)</span></button></div>
      <p class="aoc-muted aoc-small">Your Sunset Canyon line fights here too. Lost fights cost nothing; try a different order or raise your commanders.</p></div>` : '<p class="aoc-p">You have cleared every stage. Your medals keep coming.</p>'}`;
}
function guild(v) {
  const g = v.guild;
  if (!g) return `<div class="aoc-card"><p class="aoc-p">Join a guild to help its members, donate to its technology and shop with guild credits.</p><div class="aoc-chips"><button type="button" class="aoc-btn gold small" data-go="guild">Find a guild</button></div></div>`;
  return `<div class="aoc-card"><h3 class="aoc-h3">Help your guild mates</h3>
    <p class="aoc-small">${g.requests.length ? `<b>${g.requests.length}</b> upgrades and heals are waiting for help.` : 'Nobody needs help right now.'} Each help takes 1% (at least a minute) off their timer; you earn ${A.HELP.credits} credits a help for ${g.helpsPaid} more today.</p>
    <div class="aoc-chips"><button type="button" class="aoc-btn green small" data-help="1"${g.requests.length ? '' : ' disabled'}>Help all</button></div>
    ${g.mine.length ? `<p class="aoc-muted aoc-small">Helps on your own timers: ${g.mine.map(m => `${esc(m.kind)} ${m.helps}/${m.max}`).join(', ')}. Your guild mates help when they log in.</p>` : ''}</div>
    <div class="aoc-card"><h3 class="aoc-h3">Technology donations</h3><p class="aoc-small">Donate ${U.cost(g.donateCost, U.F.player.res)} to the guild treasury for ${A.DONATE.credits} credits. ${g.donated}/${g.donateMax} today.</p>
    <div class="aoc-chips"><button type="button" class="aoc-btn gold small" data-donate="1"${g.donated < g.donateMax ? '' : ' disabled'}>Donate</button></div>
    <p class="aoc-muted aoc-small">The treasury pays for the guild's technology: Shared Granaries, War Banners and the Bulwark Pact.</p></div>
    <div class="aoc-card"><p class="aoc-p">${svg(SVG.credit, 18)} <b>${full(v.inv.credits)}</b> guild credits</p><div class="aoc-chips"><button type="button" class="aoc-btn ghost small" data-shop="guild">Guild shop</button></div></div>`;
}
function tavern(v) {
  const t = v.tavern, P = U.F.player;
  const chest = (kind, pic, name, c) => `<div class="aoc-ev-tchest">${U.art?.pmeta(pic) ? `<img src="${U.art.pmeta(pic).src}" alt="" width="96" height="84">` : U.icon('chest', 64)}<b>${name}</b>
    <span class="aoc-small">${c.free ? '<span class="aoc-good">One free now</span>' : kind === 'gold' ? `Free again in ${dur(Math.max(0, c.next - v.t))}` : 'Free again tomorrow'} · ${c.keys} ${kind === 'gold' ? 'Gold' : 'Silver'} Keys</span>
    <span class="aoc-chips"><button type="button" class="aoc-btn gold small" data-chest="${kind}" data-n="1"${c.free || c.keys ? '' : ' disabled'}>Open</button><button type="button" class="aoc-btn blue small" data-chest="${kind}" data-n="10"${c.keys + (c.free ? 1 : 0) >= 10 ? '' : ' disabled'}>Open 10</button></span></div>`;
  const sc = v.inv.sc;
  const rows = A.COMMANDERS.map(c => {
    const n = sc[c.id] || 0, r = P.cmds[c.id];
    if (!n && r) return '';
    const uni = c.rarity === 'epic' ? 'uniE' : 'uniL';
    return `<div class="aoc-row"><div class="aoc-row-main aoc-ev-scrow">${U.portrait(c, 40)}<span><b>${esc(c.name)}</b> <span class="aoc-muted aoc-small">${esc(c.rarity)}</span><div class="aoc-small">${n} sculpture${n === 1 ? '' : 's'}${r ? ` · serves you at level ${r.lv}` : ` · ${v.recruit} recruit`}</div></span></div>
      <div class="aoc-row-act">${!r ? `<button type="button" class="aoc-btn gold tiny" data-recruit="${c.id}"${n >= v.recruit ? '' : ' disabled'}>Recruit</button>` : `<button type="button" class="aoc-btn ghost tiny" data-skills="${c.id}"${n ? '' : ' disabled'}>Skills</button>`}${sc[uni] ? `<button type="button" class="aoc-btn ghost tiny" data-convert="${c.id}">+${Math.min(sc[uni], 10)} from universal</button>` : ''}</div></div>`;
  }).join('');
  return `<div class="aoc-ev-tavern">${chest('silver', 'chest-1', 'Silver Chest', t.silver)}${chest('gold', 'chest-2', 'Gold Chest', t.gold)}</div>
    <p class="aoc-muted aoc-small">Silver chests hold epic sculptures, tomes and speedups; gold chests legendary sculptures. Keys come from daily objectives, Sunset Canyon, events and the shops.</p>
    <h3 class="aoc-h4">Sculptures</h3><p class="aoc-small">Universal: ${itemIcon('sc:uniE', 18)} ${sc.uniE || 0} epic · ${itemIcon('sc:uniL', 18)} ${sc.uniL || 0} legendary. ${v.recruit} sculptures recruit a commander before their deed; more raise their skills (2 per skill level).</p>
    ${rows || `<p class="aoc-muted">${A.COMMANDERS.every(c => P.cmds[c.id]) ? 'Every commander serves you, and you hold no spare sculptures.' : 'Sculptures you hold are listed here.'}</p>`}
    ${A.COMMANDERS.filter(c => !P.cmds[c.id] && !(sc[c.id] > 0)).length ? `<details class="aoc-ev-more"><summary>Commanders you can still find</summary><p class="aoc-small">${A.COMMANDERS.filter(c => !P.cmds[c.id] && !(sc[c.id] > 0)).map(c => esc(c.name)).join(', ')}</p></details>` : ''}`;
}
function items(v) {
  const inv = v.inv;
  const keys = A.ITEM_KEYS.filter(k => inv.items[k] > 0);
  return `<div class="aoc-ev-purse">${['gems', 'credits', 'tokens'].map(k => `<span class="aoc-rchip">${itemIcon(k, 20)}${full(inv[k])}</span>`).join('')}<span class="aoc-rchip">${svg(SVG.medal, 20)}${full(v.expedition.medals)}</span><span class="aoc-rchip">${svg(SVG.ap, 20)}${full(v.ap)}</span></div>
    ${keys.length ? `<div class="aoc-ev-grid">${keys.map(k => `<button type="button" class="aoc-ev-item" data-item="${k}"><span class="aoc-tile">${itemIcon(k, 40)}<b>${fmt(inv.items[k])}</b></span><span class="aoc-small">${esc(A.ITEMS[k].name)}</span></button>`).join('')}</div>` : '<p class="aoc-muted">Your bag is empty. Daily objectives, bandit camps, chests and events fill it.</p>'}`;
}
function shops(v) {
  const s = v.shops.find(x => x.id === E.shop) || v.shops[0];
  const have = s.cur === 'medals' ? v.expedition.medals : v.inv[s.cur];
  return `<div class="aoc-seg" role="tablist">${v.shops.map(x => `<button type="button" role="tab" aria-selected="${x.id === s.id}" data-shop="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <p class="aoc-p">${s.cur === 'medals' ? svg(SVG.medal, 18) : itemIcon(s.cur, 18)} You have <b>${full(have)}</b> ${esc(rname(s.cur))}.</p>
    ${s.id === 'guild' && U.F.player.guild < 0 ? '<p class="aoc-muted">Join a guild to use its shop.</p>' : ''}
    ${s.items.map(it => `<div class="aoc-row"><div class="aoc-row-main aoc-ev-scrow"><span class="aoc-tile is-small">${itemIcon(Object.keys(it.rw)[0], 30)}</span><span><b>${esc(rname(Object.keys(it.rw)[0]))}</b>${it.rw[Object.keys(it.rw)[0]] > 1 ? ` ×${it.rw[Object.keys(it.rw)[0]]}` : ''}<div class="aoc-small aoc-muted">${it.left} left today</div></span></div>
      <div class="aoc-row-act"><button type="button" class="aoc-btn gold tiny" data-buy="${it.id}"${it.left > 0 && have >= it.cost ? '' : ' disabled'}>${fmt(it.cost)}</button></div></div>`).join('')}`;
}
const RENDER = { daily, events, canyon, expedition, guild, tavern, items, shops };

// ================================================================ the screen
function mount(root) {
  root.innerHTML = `<div class="aoc-scroll aoc-events">
    <div class="aoc-ev-head"><button type="button" class="aoc-iconbtn" data-back="1" aria-label="Back">${U.icon('chevron_left', 20)}</button><h2 class="aoc-h3">Events</h2><span class="aoc-ev-gems"></span></div>
    <div class="aoc-seg aoc-ev-tabs" role="tablist">${ETABS.map(([id, label, icon]) => `<button type="button" role="tab" data-etab="${id}">${U.icon(icon, 16)}<span>${label}</span><i class="aoc-badge" hidden></i></button>`).join('')}</div>
    <div class="aoc-ev-body"></div></div>`;
  root.addEventListener('click', onClick);
  root.addEventListener('change', e => {
    if (e.target.matches('[data-cecmd]')) E.cmd = e.target.value;
    if (e.target.matches('[data-cediff]')) E.diff = Number(e.target.value);
  });
  statueCss();
}
function render() {
  const root = document.querySelector('.aoc-screen-events');
  if (!root || !E.v) return;
  const v = E.v;
  root.querySelectorAll('[data-etab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.etab === E.tab)));
  setHtml(root.querySelector('.aoc-ev-gems'), `<span class="aoc-rchip">${U.icon('gem', 18)}${full(v.inv.gems)}</span><span class="aoc-rchip">${svg(SVG.ap, 18)}${full(v.ap)}</span>`);
  const badge = (id, n) => U.badge(root.querySelector(`[data-etab="${id}"] .aoc-badge`), n);
  badge('daily', v.daily.chests.filter(c => c.ready && !c.got).length);
  badge('tavern', (v.tavern.silver.free ? 1 : 0) + (v.tavern.gold.free ? 1 : 0));
  badge('events', v.windows.wheel.open && v.wheel.free ? 1 : 0);
  badge('guild', v.guild ? (v.guild.requests.length ? 1 : 0) : 0);
  badge('canyon', v.canyon.left > 0 ? v.canyon.left : 0);
  const body = root.querySelector('.aoc-ev-body');
  if (body.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
  setHtml(body, RENDER[E.tab](v));
}
async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.back) { U.go(E.prev || 'city'); return; }
  if (d.etab) { E.tab = d.etab; render(); return; }
  if (d.go) { U.go(d.go); return; }
  if (d.daily != null) { const r = await act({ type: 'ev:daily', k: Number(d.daily) }); if (r) U.rewardItems(r.rw, 'Daily objectives'); return; }
  if (d.spin) { const r = await act({ type: 'ev:spin', n: Number(d.spin) }); if (r) U.rewardItems(r.rw, 'Wheel of Fortune'); return; }
  if (d.flip != null) { const r = await act({ type: 'ev:flip', pos: Number(d.flip) }); if (r) U.rewardItems(r.rw, r.boardDone ? 'Card King: board cleared' : 'Card King'); return; }
  if (d.ceroli) return ceroli();
  if (d.arms) return arms();
  if (d.fort) return showFort();
  if (d.canyon) return canyonFight(Number(d.canyon));
  if (d.formation) return formationSheet();
  if (d.exp) return expFight();
  if (d.help) { await act({ type: 'ev:help' }, { ok: 'Helped your guild mates.' }); return; }
  if (d.donate) { await act({ type: 'ev:donate' }, { ok: `Donated: +${A.DONATE.credits} credits.` }); return; }
  if (d.shop) { E.shop = d.shop; E.tab = 'shops'; render(); return; }
  if (d.buy) { const r = await act({ type: 'ev:buy', shop: E.shop, id: d.buy, n: 1 }); if (r) U.toast(`Bought: ${A.rewardText(r.rw)}.`, 'good'); return; }
  if (d.chest) { const r = await act({ type: 'ev:chest', kind: d.chest, n: Number(d.n) }); if (r) U.rewardItems(r.rw, d.chest === 'gold' ? 'Gold Chest' : 'Silver Chest'); return; }
  if (d.recruit) { await act({ type: 'ev:recruit', cmd: d.recruit }, { ok: `${cmdName(d.recruit)} joined you.` }); return; }
  if (d.convert) { const n = Math.min(10, E.v.inv.sc[A.CMD[d.convert].rarity === 'epic' ? 'uniE' : 'uniL'] || 0); await act({ type: 'ev:convert', cmd: d.convert, n }, { ok: `${n} universal sculptures became ${cmdName(d.convert)}'s.` }); return; }
  if (d.skills) return skillSheet(d.skills);
  if (d.item) return itemSheet(d.item);
}
async function canyonFight(id) {
  const r = await act({ type: 'ev:canyon', target: id });
  if (!r) return;
  U.sheet({ title: r.won ? 'Victory in the canyon' : 'Defeat in the canyon', body: `<p class="aoc-p">${r.won ? (r.rank < r.before ? `You climbed from rank ${r.before} to <b>${r.rank}</b>.` : `You won and keep rank ${r.rank}.`) : `Your line broke. You stay at rank ${r.rank}.`}</p>${fightsHtml(r.fights)}` });
}
async function expFight() {
  const r = await act({ type: 'ev:expedition' });
  if (!r) return;
  U.sheet({ title: r.won ? 'Stage cleared' : 'Stage lost', body: `${r.won ? `<p class="aoc-p">You reached stage ${r.stage + 1 > A.EXPEDITION.stages ? 'the end' : r.stage + 1}. First clear: ${rewardLine(r.rw, 18)}</p>` : '<p class="aoc-p">The enemy held. Nothing was lost; change your line or raise your commanders.</p>'}${fightsHtml(r.fights)}` });
}
async function ceroli() {
  const r = await act({ type: 'ev:ceroli', role: E.role, cmd: E.cmd, diff: E.diff || 1 });
  if (!r) return;
  const roles = A.CEROLI_ROLES;
  U.sheet({ title: r.won ? 'Ceroli is defeated' : 'Ceroli escaped', body: `<p class="aoc-p">${r.won ? `Down in ${r.rounds} rounds.` : `She had ${full(r.bossLeft)} of ${full(r.bossMax)} health left after ${r.rounds} rounds.`} You earned <b>${full(r.tokens)}</b> tokens.${r.won && r.unlocked > E.diff ? ` Difficulty ${r.unlocked} is open.` : ''}</p>
    <ul class="aoc-list aoc-small">${r.team.map(x => `<li><b>${esc(x.name)}</b> · ${esc(roles[x.role])} · ${esc(cmdName(x.cmd))}: ${full(x.dmg)} damage${x.alive ? '' : ' <span class="aoc-bad">(fell)</span>'}</li>`).join('')}</ul>` });
}
async function arms() {
  const r = await act({ type: 'ev:arms' });
  if (!r) return;
  U.sheet({ title: `Arms Training: ${r.waves} waves`, body: `<p class="aoc-p">You held ${r.waves} wave${r.waves === 1 ? '' : 's'} of Armsmaster Lohar. Best this event: ${r.best}.</p><ul class="aoc-list aoc-small">${r.log.map(x => `<li>Wave ${x.wave}: <span class="${x.won ? 'aoc-good' : 'aoc-bad'}">${x.won ? 'held' : 'broken'}</span>${x.won ? `, ${full(x.left)} still standing` : ''}</li>`).join('')}</ul>${r.got.length ? `<p class="aoc-p">New rewards: ${r.got.map(rw => rewardLine(rw, 16)).join(' ')}</p>` : ''}` });
}
function showFort() {
  const f = U.F, P = f.player;
  const forts = f.camps.filter(c => c.fort);
  if (!forts.length) { U.toast('You have not found a fort yet. Scout further out.', 'info'); return; }
  const c = forts.sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0];
  U.go('map');
  U.mapFocus(c.x, c.y, 14);
  setTimeout(() => U.openTile(c.y * A.MAP_N + c.x), 120);
}
function formationSheet() {
  const P = U.F.player;
  let pick = E.v.canyon.formation.slice();
  const own = Object.keys(P.cmds).sort((a, b) => P.cmds[b].lv - P.cmds[a].lv);
  const h = U.sheet({ title: 'Your canyon line', body: '' });
  const draw = () => {
    h.body.innerHTML = `<p class="aoc-small">Tap commanders in the order they should fight (up to ${A.CANYON.size}). Tap again to take one out.</p>
      <div class="aoc-ev-myline">${pick.length ? lineHtml(pick.map(id => ({ id, lv: P.cmds[id].lv })), 44) : '<span class="aoc-muted">Nobody yet</span>'}</div>
      <div class="aoc-ev-pick">${own.map(id => `<button type="button" class="aoc-ev-pickc${pick.includes(id) ? ' is-in' : ''}" data-pick="${id}">${U.portrait(A.CMD[id], 40)}<span class="aoc-small">${esc(cmdName(id))}<br>Lv ${P.cmds[id].lv}${pick.includes(id) ? ` · #${pick.indexOf(id) + 1}` : ''}</span></button>`).join('')}</div>`;
  };
  draw();
  h.body.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const id = b.dataset.pick;
    if (pick.includes(id)) pick = pick.filter(x => x !== id);
    else if (pick.length < A.CANYON.size) pick.push(id);
    draw();
  });
  h.setActions([{ label: 'Best five', kind: 'ghost', keep: true, onClick: () => { pick = []; draw(); } }, { label: 'Save', onClick: () => act({ type: 'ev:formation', cmds: pick }, { ok: pick.length ? 'Line saved.' : 'Your five best commanders will fight.' }) }]);
}
function skillSheet(id) {
  const P = U.F.player, r = P.cmds[id], c = A.CMD[id];
  const names = [c.active.name, c.passives[0].name, c.passives[1].name, c.ultimate.name];
  const have = E.v.inv.sc[id] || 0;
  const h = U.sheet({ title: `${c.name}: skills`, body: `<p class="aoc-small">${have} sculptures. A skill level costs 2 sculptures per current level (or Gold and Iron on the commander's sheet).</p>${names.map((n, k) => {
    const lv = r.sk[k], cost = A.scSkillCost(lv), locked = k === 3 && r.lv < A.ULTIMATE_LEVEL;
    return `<div class="aoc-row"><div class="aoc-row-main"><b>${esc(n)}</b><div class="aoc-small aoc-muted">Level ${lv} of 5${locked ? ` · unlocks at commander level ${A.ULTIMATE_LEVEL}` : ''}</div></div><div class="aoc-row-act"><button type="button" class="aoc-btn gold tiny" data-sk="${k}"${lv < 5 && !locked && have >= cost ? '' : ' disabled'}>${lv >= 5 ? 'Max' : `${cost} sculptures`}</button></div></div>`;
  }).join('')}` });
  h.body.addEventListener('click', async e => {
    const b = e.target.closest('[data-sk]');
    if (!b || b.disabled) return;
    const res = await act({ type: 'ev:skill', cmd: id, skill: Number(b.dataset.sk) }, { ok: 'Skill raised.' });
    if (res) { h.close(); setTimeout(() => skillSheet(id), 50); }
  });
}
// use an item: speedups pick a queue, tomes a commander; the rest are used straight away
function itemSheet(k) {
  const it = A.ITEMS[k], n = E.v.inv.items[k] || 0, f = U.F, P = f.player;
  const rows = [];
  if (it.kind === 'speed') {
    const qs = [];
    if (P.q.build) qs.push(['build', '', `Building ${A.BUILDINGS[P.q.build.id].name}`, P.q.build]);
    if (P.q.research) qs.push(['research', '', `Researching ${A.TECHS[P.q.research.id].name}`, P.q.research]);
    if (P.q.heal) qs.push(['heal', '', 'Healing', P.q.heal]);
    for (const u of A.UNIT_KEYS) if (P.q.train[u]) qs.push(['train', u, `Training ${A.UNITS[u].plural}`, P.q.train[u]]);
    if (!qs.length) rows.push('<p class="aoc-muted">Nothing is building, researching, healing or training.</p>');
    for (const [q, unit, label, x] of qs) {
      const left = Math.max(0, x.end - f.t), need = Math.min(n, Math.ceil(left / it.min));
      rows.push(`<div class="aoc-row"><div class="aoc-row-main"><b>${esc(label)}</b><div class="aoc-small aoc-muted">${dur(left)} left</div></div><div class="aoc-row-act"><button type="button" class="aoc-btn gold tiny" data-use="1" data-q="${q}" data-unit="${unit}">Use 1</button>${need > 1 ? `<button type="button" class="aoc-btn blue tiny" data-use="${need}" data-q="${q}" data-unit="${unit}">Use ${need}</button>` : ''}</div></div>`);
    }
  } else if (it.kind === 'tome') {
    for (const id of Object.keys(P.cmds).sort((a, b) => P.cmds[b].lv - P.cmds[a].lv)) {
      const r = P.cmds[id];
      if (r.lv >= A.CMD_MAX_LEVEL) continue;
      rows.push(`<div class="aoc-row"><div class="aoc-row-main aoc-ev-scrow">${U.portrait(A.CMD[id], 34)}<span><b>${esc(cmdName(id))}</b><div class="aoc-small aoc-muted">Level ${r.lv} · ${full(r.xp)}/${full(A.cmdXpToNext(r.lv, A.CMD[id].rarity))} experience</div></span></div><div class="aoc-row-act"><button type="button" class="aoc-btn gold tiny" data-use="1" data-cmd="${id}">Use 1</button>${n > 1 ? `<button type="button" class="aoc-btn blue tiny" data-use="${n}" data-cmd="${id}">Use ${n}</button>` : ''}</div></div>`);
    }
    if (!rows.length) rows.push('<p class="aoc-muted">Every commander is at the highest level.</p>');
  } else if (it.kind === 'key') rows.push(`<p class="aoc-p">Open chests in the Tavern.</p><div class="aoc-chips"><button type="button" class="aoc-btn gold small" data-tavern="1">Go to the Tavern</button></div>`);
  else if (it.kind === 'tele') rows.push('<p class="aoc-p">Tap an empty place on the world map you have explored, then Move city, and choose to use the Teleport.</p>');
  else rows.push(`<div class="aoc-chips"><button type="button" class="aoc-btn gold small" data-use="1">Use 1</button>${n > 1 && it.kind !== 'shield' ? `<button type="button" class="aoc-btn blue small" data-use="${n}">Use all ${n}</button>` : ''}</div>`);
  const desc = { speed: `Takes ${dur(it.min)} off a timer.`, tome: `${full(it.xp)} experience for a commander.`, ap: `Restores ${it.ap} action points (they can pass ${A.AP_MAX}).`, res: `Adds ${Object.entries(it.res || {}).map(([r, x]) => `${full(x)} ${A.RES_NAME[r]}`).join(', ')} to your stock.`, box: 'Opens into a random speedup, tome, crate, key or gems.', shield: 'An 8-hour peace shield. Attacking breaks it.', key: 'Opens a tavern chest.', tele: 'Moves your city once, for free.' }[it.kind] || '';
  const h = U.sheet({ title: `${it.name} (${n})`, body: `<div class="aoc-ev-iteminfo"><span class="aoc-tile">${itemIcon(k, 40)}</span><p class="aoc-p">${esc(desc)}</p></div>${rows.join('')}` });
  h.body.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tavern) { h.close(); E.tab = 'tavern'; render(); return; }
    if (!b.dataset.use) return;
    const r = await act({ type: 'ev:use', id: k, n: Number(b.dataset.use), q: b.dataset.q, unit: b.dataset.unit, cmd: b.dataset.cmd });
    if (!r) return;
    h.close();
    if (r.rw) U.rewardItems(r.rw, it.name);
    else U.toast(`Used ${r.used} ${it.name}.`, 'good');
  });
}
// the events hub opens over the current screen; Back returns there
U.openEvents = tab => {
  if (U.current && U.current !== 'events') E.prev = U.current;
  if (tab) E.tab = tab;
  U.go('events');
};
U.screen('events', {
  mount,
  show: () => { refresh(true); },
  update: () => { if (performance.now() - E.last > 3000) refresh(false); },
});
