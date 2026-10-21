/* Age of Conquest reports: battle reports with casualties, the reasons for the result and a round-by-round replay
   (re-run from the stored battle input, so a replay always matches the report), scout reports with their accuracy,
   gathering returns. */

const A = window.AOC;
const U = window.AOCUI;
const { esc, el, fmt, full, dur, setText, setHtml } = U;

const R = { list: [], last: 0, busy: false, seenUnread: -1 };
function mount(root) {
  root.innerHTML = '<div class="aoc-scroll"><h2 class="aoc-h3">Reports</h2><div class="aoc-reports"></div></div>';
  root.addEventListener('click', e => { const b = e.target.closest('[data-rep]'); if (b) openReport(Number(b.dataset.rep)); });
}
async function render(force) {
  const box = document.querySelector('.aoc-screen-intel .aoc-reports');
  if (!box || !U.F) return;
  if (!force && R.seenUnread === U.F.unread && performance.now() - R.last < 3000) return;
  if (R.busy) return;
  R.busy = true;
  try { R.list = await U.host.query('reports'); } finally { R.busy = false; }
  R.last = performance.now(); R.seenUnread = U.F.unread;
  setHtml(box, R.list.length ? R.list.map(r => `<button type="button" class="aoc-rep${r.read ? '' : ' is-new'}" data-rep="${r.id}">
      <span class="aoc-rep-ico ${r.kind === 'battle' ? (r.won ? 'is-good' : 'is-bad') : ''}">${U.icon(r.kind === 'battle' ? 'sword' : r.kind === 'scout' ? 'eye' : 'pick', 18)}</span>
      <span><b>${esc(r.title)}</b><span class="aoc-muted aoc-small">${A.clock(r.t)}</span></span></button>`).join('') : '<p class="aoc-p">No reports yet. Scout, gather and fight, and the reports collect here.</p>');
}
async function openReport(id) {
  const r = await U.host.query('report', { id });
  if (!r) return;
  U.host.cmd({ type: 'readReport', id });
  if (r.kind === 'battle') return battleSheet(r);
  if (r.kind === 'scout') return scoutSheet(r);
  U.sheet({ title: r.title, body: `<p class="aoc-p">${r.res ? 'Brought home ' + U.cost(r.res) : esc(r.text || '')}</p>` });
}
function side(label, s, lost, end, wounded, cmd) {
  const rows = A.UNIT_KEYS.filter(u => (s.units[u] || 0) > 0).map(u => `<tr><td>${U.icon(u, 15)} ${esc(A.UNITS[u].plural)}</td><td>${full(s.units[u])}</td><td class="aoc-bad">${full(lost[u])}</td><td>${wounded ? full(wounded[u] || 0) : '-'}</td><td>${full(end[u])}</td></tr>`).join('');
  return `<div class="aoc-side"><h3 class="aoc-h4">${esc(label)}</h3><p class="aoc-small aoc-muted">${cmd ? `Led by ${esc(A.CMD[cmd.id].name)} (level ${cmd.lv})` : 'No commander'} · morale ${s.morale}</p>
    <table class="aoc-table"><thead><tr><th>Troops</th><th>Sent</th><th>Lost</th><th>Wounded</th><th>Left</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="aoc-muted">none</td></tr>'}</tbody></table></div>`;
}
function battleSheet(r) {
  const { input, res, view } = r;
  const x = r.extra || {};
  const won = r.won;
  const body = el(`<div class="aoc-battle">
    <p class="aoc-result ${won ? 'aoc-good' : 'aoc-bad'}">${won ? 'Victory' : 'Defeat'} · ${A.clock(r.t)} · ${esc(A.TERRAIN[input.terrain]?.name || '')}${input.ambush ? ' · ambush' : ''}</p>
    <div class="aoc-sides">${side(input.a.label, input.a, res.a.lost, res.a.end, x.aWounded, input.a.cmd)}${side(input.d.label, input.d, res.d.lost, res.d.end, x.dWounded, input.d.cmd)}</div>
    ${x.plunder ? `<p class="aoc-p">${view === 'a' ? 'Taken' : 'Lost'}: ${U.cost(x.plunder)}</p>` : ''}
    ${x.sacked ? `<p class="aoc-p aoc-bad">${view === 'a' ? 'The walls fell and the city was sacked.' : 'Your walls fell and the city was sacked.'}</p>` : ''}
    ${x.captured ? '<p class="aoc-p aoc-good">The landmark was captured.</p>' : ''}
    <h3 class="aoc-h4">Why</h3><ul class="aoc-list">${(r.explain || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <h3 class="aoc-h4">Replay</h3>
    <div class="aoc-replay"><div class="aoc-rp-bars"></div><div class="aoc-rp-ev aoc-small" aria-live="polite"></div>
      <div class="aoc-rp-ctl"><button type="button" class="aoc-btn ghost small" data-rp="play">${U.icon('replay', 15)}<span>Play</span></button><input type="range" min="0" max="${res.rounds.length}" value="${res.rounds.length}" aria-label="Round"><span class="aoc-rp-n"></span></div>
      <p class="aoc-small aoc-muted aoc-rp-verify">Replays re-run the battle from its recorded start; checking...</p></div>
  </div>`);
  const bars = body.querySelector('.aoc-rp-bars');
  const a0 = A.troopsTotal(res.a.start), d0 = A.troopsTotal(res.d.start);
  const showRound = k => {
    const row = k === 0 ? [a0, d0, input.a.morale, input.d.morale, input.wall ? input.wall.dur : -1, []] : res.rounds[k - 1];
    const bar = (lab, n, n0, mor, cls) => `<div class="aoc-rp-row"><span class="aoc-rp-l">${esc(lab)}</span><span class="aoc-rp-track"><i class="${cls}" style="width:${Math.round(n / Math.max(1, Math.max(a0, d0)) * 100)}%"></i></span><span class="aoc-rp-v">${full(n)}</span><span class="aoc-rp-m">morale ${mor}</span></div>`;
    bars.innerHTML = bar('Attackers', row[0], a0, row[2], 'is-a') + bar('Defenders', row[1], d0, row[3], 'is-d') + (row[4] >= 0 ? `<div class="aoc-rp-row"><span class="aoc-rp-l">Walls</span><span class="aoc-rp-track"><i class="is-w" style="width:${Math.round(row[4] / Math.max(1, input.wall.max) * 100)}%"></i></span><span class="aoc-rp-v">${full(row[4])}</span><span></span></div>` : '');
    setText(body.querySelector('.aoc-rp-n'), k === 0 ? 'Start' : `Round ${k}/${res.rounds.length}`);
    const casts = res.casts.filter(c => c.r === k).map(c => `${c.side === 'a' ? 'Attackers' : 'Defenders'}: ${c.name}`);
    setText(body.querySelector('.aoc-rp-ev'), casts.join(' · ') || (k === res.rounds.length ? `Ended: ${{ morale: 'morale broke', losses: 'an army fell below a quarter of its strength', destroyed: 'an army was destroyed', time: 'the attackers ran out of time', empty: 'nobody defended it', 'both broke': 'both armies broke' }[res.reason] || res.reason}.` : ''));
  };
  const range = body.querySelector('input[type=range]');
  range.addEventListener('input', () => showRound(Number(range.value)));
  let timer = 0;
  body.querySelector('[data-rp="play"]').addEventListener('click', () => {
    clearInterval(timer);
    let k = 0;
    range.value = 0; showRound(0);
    timer = setInterval(() => { k++; range.value = k; showRound(k); if (k >= res.rounds.length) clearInterval(timer); }, U.reduced ? 60 : 450);
  });
  showRound(res.rounds.length);
  const h = U.sheet({ title: r.title, wide: true, body, onClose: () => clearInterval(timer), actions: r.x != null ? [{ label: 'Show on the map', kind: 'ghost', icon: 'map', onClick: () => U.mapFocus(r.x, r.y, 12) }] : [] });
  // the engine re-runs the battle; the result must match exactly
  U.host.query('replay', { id: r.id }).then(rr => {
    const same = rr && JSON.stringify(rr.rounds) === JSON.stringify(res.rounds) && rr.winner === res.winner;
    setText(body.querySelector('.aoc-rp-verify'), same ? 'Replay check: re-running this battle from its recorded start gives exactly the same result.' : 'Replay check failed: the re-run differs from the report.');
  });
  return h;
}
function scoutSheet(r) {
  const age = U.F.t - r.at;
  const body = `<p class="aoc-p">${esc(r.name)}${r.guild >= 0 && U.F.guilds[r.guild] ? ` [${esc(U.F.guilds[r.guild].tag)}]` : ''} · ${A.clock(r.at)} (${dur(age)} ago)</p>
    <div class="aoc-kv"><div><span>Accuracy</span><b>${r.acc}%</b></div>${r.hall ? `<div><span>Town Hall</span><b>${r.hall}</b></div>` : ''}${r.wall != null ? `<div><span>Walls</span><b>level ${r.wall}${r.wallDur != null ? `, ${full(r.wallDur)} durability` : ''}</b></div>` : ''}${r.tower != null ? `<div><span>Watchtower</span><b>${r.tower}</b></div>` : ''}${r.defender ? `<div><span>Defender</span><b>${esc(A.CMD[r.defender]?.name || '')}</b></div>` : ''}${r.shield ? '<div><span>Shield</span><b class="aoc-blue">Up</b></div>' : ''}</div>
    <h3 class="aoc-h4">Troops seen</h3><div>${U.troopLine(r.troops)}</div>
    ${r.res ? `<h3 class="aoc-h4">Resources they could lose</h3><div>${U.cost(r.res)}</div>` : ''}
    ${r.away ? '<p class="aoc-p">Some of their armies were away from the city.</p>' : ''}
    ${r.secrets ? `<p class="aoc-p aoc-gold">Papers in the leader's hall reveal a secret non-aggression pact with ${r.secrets.map(esc).join(' and ')}.</p>` : ''}
    ${r.flagged ? '<p class="aoc-p aoc-bad">Your scouts suspect these numbers were planted: they do not add up. Their counterintelligence may be feeding you a false report.</p>' : ''}
    <p class="aoc-muted aoc-small">Numbers are estimates: lower accuracy means wider errors. Better Scouting research, scouting commanders and your civilization raise accuracy; the target's Counterintelligence lowers it. Reports age: troops move and train.</p>`;
  U.sheet({ title: r.title, body, actions: [{ label: 'Show on the map', kind: 'ghost', icon: 'map', onClick: () => { const c = r.target.type === 'city' ? U.S.cities.get(r.target.id) : r.target.type === 'mark' ? U.F.marks[r.target.id] : null; if (c) U.mapFocus(c.x, c.y, 12); } }] });
}
U.openReport = openReport;
U.screen('intel', { mount, show: () => render(true), update: () => render(false) });
