/* Age of Conquest: the governor inspector, the menu (settings, saving, developer tools), the first-time guide
   and the summary of what happened while the player was away. */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, realDur, setText } = U;

// ================================================================ inspector
U.inspect = async id => {
  const d = await U.host.query('inspect', { id });
  if (!d) return;
  const f = U.F;
  const gd = d.guild >= 0 ? f.guilds[d.guild] : null;
  const known = d.known;
  const deep = d.deep;
  const sec = [];
  sec.push(`<div class="aoc-who">${U.banner(gd, 46)}<div><b>${esc(d.name)}</b>${gd ? ` <span class="aoc-tag">[${esc(gd.tag)}]</span>` : ''}
    <div class="aoc-muted">${esc(d.civName)} · Town Hall ${d.hall} · ${fmt(d.power)} power${d.shield ? ' · shielded' : ''}</div>
    <div class="aoc-muted">${d.role ? `${esc(d.role)} of ${esc(d.guildName)}` : 'Independent'} · ${esc(d.bg)}</div></div></div>`);
  sec.push(`<p class="aoc-p"><span class="aoc-kicker">Public goal</span> ${esc(d.policy)}</p>`);
  if (deep) {
    sec.push(`<div class="aoc-card"><span class="aoc-kicker">${d.id === f.player.id ? 'You' : f.player.guild >= 0 && d.guild === f.player.guild ? 'Guild mate: you know them well' : 'From your fresh intelligence'}</span>
      <p class="aoc-p"><b>${esc(d.arch)}</b>${d.traits.length ? `: ${d.traits.map(esc).join(', ')}` : ''}. Now: ${esc(d.state)}.</p>
      ${d.commanders ? `<p class="aoc-small">Commanders: ${d.commanders.map(c => `${esc(A.CMD[c.id].name)} ${c.lv}`).join(', ')}</p>` : ''}
      ${d.enemies?.length ? `<p class="aoc-small">Grudges: ${d.enemies.map(e => esc(e.name)).join(', ')}</p>` : ''}
      ${d.friends?.length ? `<p class="aoc-small">Friends: ${d.friends.map(e => esc(e.name)).join(', ')}</p>` : ''}
      ${d.intel ? `<p class="aoc-small">Troops seen ${U.ago(d.intel.at)}: ${U.troopLine(d.intel.troops)}</p>` : ''}</div>`);
    if (d.decisions.length) sec.push(`<h3 class="aoc-h4">Recent decisions and why</h3><ul class="aoc-list">${d.decisions.map(x => `<li><span class="aoc-muted">${A.clock(x.t)}</span> ${esc(x.text)}</li>`).join('')}</ul>`);
    if (d.memories.length) sec.push(`<h3 class="aoc-h4">What they remember</h3><ul class="aoc-list aoc-small">${d.memories.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`);
  } else {
    sec.push(`<p class="aoc-muted aoc-small">You only know what anyone can see: their guild, rank and public record. Scout their city to read their army, their mood and the reasons behind their moves (a report stays fresh for 6 hours), or join their guild.</p>`);
    if (d.decisions.length) sec.push(`<h3 class="aoc-h4">What you have seen them do</h3><ul class="aoc-list">${d.decisions.map(x => `<li><span class="aoc-muted">${A.clock(x.t)}</span> ${esc(x.text)}</li>`).join('')}</ul>`);
  }
  if (d.seenBattles.length) sec.push(`<h3 class="aoc-h4">Battles you witnessed</h3><ul class="aoc-list aoc-small">${d.seenBattles.map(b => `<li><span class="aoc-muted">${A.clock(b.t)}</span> ${b.a === d.id ? `attacked ${esc(b.dName)}` : `was attacked`}: ${(b.win === 'a') === (b.a === d.id) ? 'won' : 'lost'}, ${fmt(b.a === d.id ? b.aLost : b.dLost)} troops lost</li>`).join('')}</ul>`);
  if (d.history.length) sec.push(`<h3 class="aoc-h4">In the chronicle</h3><ul class="aoc-list aoc-small">${d.history.map(e => `<li><span class="aoc-muted">${A.clock(e.t)}</span> ${esc(e.txt)}</li>`).join('')}</ul>`);
  const acts = [];
  if (known && d.x != null) acts.push({ label: 'Show on the map', kind: 'ghost', icon: 'map', onClick: () => U.mapFocus(d.x, d.y, 12) });
  U.sheet({ title: d.name, body: sec.join(''), actions: acts });
};

// ================================================================ menu, settings, developer tools
U.menu = () => {
  const f = U.F;
  const saved = U.lastSave ? Math.round((Date.now() - U.lastSave) / 1000) : null;
  const body = el(`<div>
    <div class="aoc-kv"><div><span>World</span><b>${esc(A.SERVER.name)} · Day ${f.day}${f.age > 1 ? ` · Age ${A.roman(f.age)}` : ''}</b></div><div><span>Saved</span><b>${saved == null ? 'not yet' : saved < 60 ? `${saved}s ago` : `${Math.round(saved / 60)} min ago`} (${esc(U.store.where)})</b></div><div><span>Simulation</span><b>${U.host.mode === 'worker' ? 'Background worker' : 'On the page'}</b></div></div>
    <h3 class="aoc-h4">While you are away</h3>
    <p class="aoc-muted aoc-small">The world keeps going at a tenth of normal speed while the game is closed, up to the limit you choose. Everything is simulated, then summarized when you return. Longer limits take a few seconds more to catch up on phones.</p>
    <div class="aoc-chips" data-set="offlineCap">${[[0, 'Pause the world'], [360, 'Up to 6 hours'], [720, 'Up to 12 hours'], [1440, 'Up to 1 day'], [4320, 'Up to 3 days']].map(([v, l]) => `<button type="button" class="aoc-btn ${f.settings.offlineCap === v ? 'gold' : 'ghost'} tiny" data-v="${v}">${l}</button>`).join('')}</div>
    <h3 class="aoc-h4">Notifications</h3>
    <div class="aoc-chips" data-set="notify">${[['all', 'Everything'], ['important', 'Important only'], ['off', 'Attacks and victories only']].map(([v, l]) => `<button type="button" class="aoc-btn ${f.settings.notify === v ? 'gold' : 'ghost'} tiny" data-v="${v}">${l}</button>`).join('')}</div>
    <h3 class="aoc-h4">Text size</h3>
    <div class="aoc-chips" data-set="text"><button type="button" class="aoc-btn ghost tiny" data-v="normal">Normal</button><button type="button" class="aoc-btn ghost tiny" data-v="large">Large</button></div>
    ${U.dev ? `<h3 class="aoc-h4">Developer tools</h3><div class="aoc-chips aoc-dev">
      <button type="button" class="aoc-btn ghost tiny" data-dev="dev:res">50M resources</button><button type="button" class="aoc-btn ghost tiny" data-dev="dev:troops">+100K troops</button>
      <button type="button" class="aoc-btn ghost tiny" data-dev="dev:finish">Finish timers</button><button type="button" class="aoc-btn ghost tiny" data-dev="dev:hall">Max buildings</button>
      <button type="button" class="aoc-btn ghost tiny" data-dev="dev:commanders">All commanders, max level</button><button type="button" class="aoc-btn ghost tiny" data-dev="dev:reveal">Reveal map</button>
      <button type="button" class="aoc-btn ghost tiny" data-dev="dev:shield">7-day shield</button><button type="button" class="aoc-btn ghost tiny" data-skip="60">+1 hour</button>
      <button type="button" class="aoc-btn ghost tiny" data-skip="360">+6 hours</button><button type="button" class="aoc-btn ghost tiny" data-skip="1440">+1 day</button></div>` : ''}
    <h3 class="aoc-h4">Game</h3>
    <div class="aoc-chips"><button type="button" class="aoc-btn ghost small" data-act="guide">How to play</button><button type="button" class="aoc-btn ghost small" data-act="save">Save now</button>
      <button type="button" class="aoc-btn ghost small" data-act="back">Back to Last Furnace</button><button type="button" class="aoc-btn red small" data-act="new">Start a new world</button></div>
  </div>`);
  const h = U.sheet({ title: 'Menu', body });
  body.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const set = b.closest('[data-set]')?.dataset.set;
    if (set === 'offlineCap') { await U.run({ type: 'settings', offlineCap: Number(b.dataset.v) }, 'Saved.'); h.close(); U.menu(); }
    else if (set === 'notify') { await U.run({ type: 'settings', notify: b.dataset.v }, 'Saved.'); h.close(); U.menu(); }
    else if (set === 'text') { document.getElementById('aoc').classList.toggle('is-large', b.dataset.v === 'large'); U.LS.set('aoc-text', b.dataset.v); }
    if (b.dataset.dev) await U.run({ type: b.dataset.dev, level: 25 }, 'Done.');
    if (b.dataset.skip) { b.disabled = true; await U.run({ type: 'dev:skip', minutes: Number(b.dataset.skip) }, `Skipped ${dur(Number(b.dataset.skip))}.`); b.disabled = false; }
    if (b.dataset.act === 'guide') { h.close(); U.intro(); }
    if (b.dataset.act === 'save') { U.host.post({ type: 'save' }); U.toast('Saved.', 'good'); }
    if (b.dataset.act === 'back') U.backToStart();
    if (b.dataset.act === 'new') U.confirm({ title: 'Start a new world?', text: 'Your current world is deleted from this device. This cannot be undone.', ok: 'Delete and start over', kind: 'red', onOk: async () => { await U.store.remove('main'); await U.store.remove('backup'); location.reload(); } });
  });
};

// ================================================================ the first-time guide
const GUIDE = [
  ['A living world', 'You are one of 600 governors on the Ashen Crown server. The other 599 are simulated: each has a personality, remembers who helped or hurt it, and makes its own decisions with the same rules and resources as you. Ten guilds compete for fortresses and the Ember Throne.'],
  ['Time', 'At 1x one game minute passes every real second (a game day is 24 minutes). Pause or speed up at the top. Building, research and marches take game time; the goals on the map show what to do first.'],
  ['Your city', 'Upgrade the Town Hall to raise every other building\'s limit. Farms and mills feed your growth; troops eat Food every hour. A Warehouse protects part of your stock from raiders.'],
  ['Armies and fog', 'Tap the map to send armies: attack bandit camps for loot, gather at resource fields, scout before you attack. You only see what your city, your armies and your guild can see; scout reports are estimates and grow stale.'],
  ['Combat', 'Infantry beat cavalry, cavalry beat archers, archers beat infantry. Terrain, walls, morale and commander skills matter: a smaller, better-matched army can win. Every battle report explains the result and can be replayed.'],
  ['Guilds and the Age', 'Join a guild for protection, shared vision and rallies. Guilds sign pacts, betray them, form coalitions and go to war. Hold the Ember Throne for 3 days, or build the Grand Exchange, to win the Age.'],
];
U.intro = () => {
  let k = 0;
  const h = U.sheet({ title: GUIDE[0][0], body: '' });
  const draw = () => {
    h.setTitle(GUIDE[k][0]);
    h.body.innerHTML = `<p class="aoc-p">${esc(GUIDE[k][1])}</p><p class="aoc-muted aoc-small">${k + 1} of ${GUIDE.length}</p>`;
    h.setActions([k > 0 ? { label: 'Back', kind: 'ghost', keep: true, onClick: () => { k--; draw(); } } : null, k < GUIDE.length - 1 ? { label: 'Next', keep: true, onClick: () => { k++; draw(); } } : { label: 'Start playing' }]);
  };
  draw();
};

// ================================================================ while you were away
U.showOffline = m => {
  const b = m.before, a = m.after;
  const delta = A.RES.map(r => `<span class="aoc-cost">${U.resIcon(r, 14)}${a.res[r] - b.res[r] >= 0 ? '+' : ''}${fmt(a.res[r] - b.res[r])}</span>`).join('');
  const lostTroops = A.troopsTotal(b.troops) - A.troopsTotal(a.troops);
  setTimeout(() => U.sheet({
    title: 'While you were away', wide: true,
    body: `<p class="aoc-p">${dur(m.minutes)} of game time passed.</p>
      <div class="aoc-kv"><div><span>Power</span><b>${fmt(b.power)} to ${fmt(a.power)}</b></div><div><span>Resources</span><b>${delta}</b></div>${lostTroops > 0 ? `<div><span>Troops at home</span><b class="aoc-bad">${fmt(lostTroops)} fewer</b></div>` : ''}${b.guild !== a.guild ? '<div><span>Guild</span><b>changed</b></div>' : ''}</div>
      ${m.reports.length ? `<h3 class="aoc-h4">New reports</h3><ul class="aoc-list">${m.reports.slice(-8).map(r => `<li><button type="button" class="aoc-link" data-rep="${r.id}">${esc(r.title)}</button></li>`).join('')}</ul>` : ''}
      <h3 class="aoc-h4">News</h3><ul class="aoc-list aoc-small">${m.chronicle.slice().reverse().map(e => `<li><span class="aoc-muted">${A.clock(e.t)}</span> ${esc(e.txt)}</li>`).join('') || '<li class="aoc-muted">A quiet time.</li>'}</ul>`,
  }).body.addEventListener('click', e => { const x = e.target.closest('[data-rep]'); if (x) U.openReport(Number(x.dataset.rep)); }), 400);
};
