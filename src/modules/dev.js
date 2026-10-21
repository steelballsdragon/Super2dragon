/* Last Furnace developer panel (owner: dev).
   Hidden by default: tap the logo on the start screen 7 times to turn developer mode on (Game.devMode()). The
   City then shows a Dev button with unlimited gems and resources, instant timers, every item, every hero, max
   buildings and VIP, stage clears, time skips and a blizzard on demand. Uses only the Game API and the public
   objects of the other modules, each through optional chaining. Public object: Game.dev. */

const LOTS = 999999999;
const ITEM_FILL = 999;
const D = () => Game.S?.dev || null;
const on = () => !!Game.devMode?.() && !!D();

Game.addIcon('dev', '<path d="M14.6 3.4a5 5 0 0 0-5.9 6.5L3.6 15a2 2 0 0 0 0 2.8l2.6 2.6a2 2 0 0 0 2.8 0l5.1-5.1a5 5 0 0 0 6.5-5.9l-3 3-3-.6-.6-3Z" fill="#b6c3cf" stroke="#46566a" stroke-width="1.2" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="1.2" fill="#46566a"/>');

Game.registerModule({
  id: 'dev',
  initState: () => ({ unlimited: false, instant: false }),
  migrate: s => ({ unlimited: !!s.unlimited, instant: !!s.instant }),
  tick: () => {
    if (!on()) return;
    if (D().unlimited) topUp();
    if (D().instant) finishAll();
  },
});

function topUp() {
  const S = Game.S;
  if (!S) return;
  for (const k of [...Game.RES, 'gems']) if (!(S.res[k] >= LOTS)) S.res[k] = LOTS;
}
function finishAll() {
  let n = 0;
  for (const t of Game.timers.list()) if (Game.timers.finishNow(t.id)) n++;
  return n;
}
function fillItems() {
  const S = Game.S;
  let n = 0;
  for (const id of Object.keys(Game.itemDefs)) {
    if ((S.items[id] || 0) < ITEM_FILL) { S.items[id] = ITEM_FILL; n++; }
  }
  Game.emit('granted', { rewards: {}, source: 'dev' });
  return n;
}
function maxBuildings() {
  const c = Game.city;
  if (!c?.setLevel) return 0;
  let n = 0;
  if (c.setLevel('furnace', c.maxLevel('furnace'))) n++;
  for (const id of c.ids) if (id !== 'furnace' && c.setLevel(id, c.maxLevel(id))) n++;
  c.autoAssign?.();
  return n;
}
function fillSurvivors() {
  const s = Game.city?.survivors?.();
  const pop = Game.S?.city?.pop;
  if (!s || !pop) return false;
  pop.total = Math.max(pop.total, s.cap);
  pop.sick = 0;
  Game.city.autoAssign?.();
  return true;
}
function startBlizzard() {
  const w = Game.S?.city?.wx;
  if (!w) return false;
  const now = Game.now();
  w.start = now + 3000;
  w.end = w.start + 120e3;
  w.warned = false;
  return true;
}
function maxVip() {
  const sh = Game.shop;
  if (!sh?.addVipPoints) return 0;
  const need = 100000 - (sh.vipPoints?.() || 0);
  if (need > 0) sh.addVipPoints(need, 'dev');
  return sh.vipLevel();
}

// [id, label, note, run] for the one-tap actions; run returns the toast text
const ACTIONS = [
  ['items', 'Every item x999', 'Speedups, crates, tickets, books and shards', () => `${fillItems()} items filled to ${ITEM_FILL}`],
  ['heroes', 'Every hero, max level, 5 stars', 'Level cap follows the Furnace, so max the city first', () => `${Game.mil?.devMaxHeroes?.() || 0} heroes maxed`],
  ['city', 'Max every building', 'Furnace 30 and every building at its cap', () => `${maxBuildings()} buildings raised`],
  ['vip', 'Max VIP', 'VIP 12 perks and the second builder', () => `VIP ${maxVip()}`],
  ['stages', 'Clear every stage', 'With each first-clear reward', () => `${Game.mil?.devClearTo?.(Game.mil.MAX_STAGE) || 0} stages cleared`],
  ['timers', 'Finish all timers', 'Builds and training', () => `${finishAll()} timers finished`],
  ['people', 'Fill and heal survivors', 'Up to the housing cap', () => (fillSurvivors() ? 'Survivors filled' : 'No city yet')],
  ['storm', 'Start a blizzard', 'Hits in 3 seconds and lasts 2 minutes', () => (startBlizzard() ? 'A blizzard is coming' : 'No city yet')],
];
const SKIPS = [['1h', 3600, '+1 hour'], ['8h', 28800, '+8 hours'], ['1d', 86400, '+1 day']];

function panelHtml() {
  const d = D();
  const sw = (id, label, note, val) => `<button type="button" class="dev-switch" data-sw="${id}" aria-pressed="${val ? 'true' : 'false'}">
      <span class="dev-switch-txt"><b>${label}</b><span>${note}</span></span><span class="dev-knob" aria-hidden="true"></span></button>`;
  return `<div class="dev">
    <p class="dev-note">Developer mode. Changes apply to this save. Turn it off on this panel or with 7 taps on the start screen logo.</p>
    <h3 class="section-title">Always on</h3>
    ${sw('unlimited', 'Unlimited gems and resources', `Kept at ${Game.fmt(LOTS)} each`, d.unlimited)}
    ${sw('instant', 'Instant builds and training', 'Every timer finishes as it starts', d.instant)}
    <h3 class="section-title">One tap</h3>
    <div class="dev-grid">${ACTIONS.map(([id, label, note]) => `<button type="button" class="dev-act" data-act="${id}"><b>${label}</b><span>${note}</span></button>`).join('')}</div>
    <h3 class="section-title">Skip time</h3>
    <div class="dev-skips">${SKIPS.map(([id, , label]) => `<button type="button" class="btn ghost small" data-skip="${id}">${label}</button>`).join('')}</div>
    <p class="dev-now muted"></p>
  </div>`;
}

let panel = null;
function openPanel() {
  if (!on()) return null;
  if (panel && !panel.closed) return panel;
  panel = Game.sheet({
    title: 'Developer',
    className: 'dev-sheet',
    body: panelHtml(),
    update: body => {
      const d = D();
      if (!d) return;
      body.querySelectorAll('[data-sw]').forEach(b => b.setAttribute('aria-pressed', d[b.dataset.sw] ? 'true' : 'false'));
      const S = Game.S;
      Game.setText(body.querySelector('.dev-now'), `Gems ${Game.fmt(S.res.gems)} · Furnace Lv ${Game.furnaceLevel()} · VIP ${Game.shop?.vipLevel?.() ?? 0} · ${Game.timers.list().length} timers running`);
    },
    actions: [
      { label: 'Developer mode off', kind: 'ghost', onClick: () => { Game.setDevMode?.(false); } },
      { label: 'Start screen', kind: 'ghost', onClick: () => { toStart(); } },
    ],
    onClose: () => { panel = null; },
  });
  panel.body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !D()) return;
    if (b.dataset.sw) {
      const k = b.dataset.sw;
      D()[k] = !D()[k];
      if (k === 'unlimited' && D()[k]) topUp();
      if (k === 'instant' && D()[k]) finishAll();
      Game.toast(`${k === 'unlimited' ? 'Unlimited resources' : 'Instant timers'} ${D()[k] ? 'on' : 'off'}`, 'info');
    } else if (b.dataset.act) {
      const a = ACTIONS.find(x => x[0] === b.dataset.act);
      let msg = '';
      try { msg = a[3](); } catch (err) { console.error('[dev] action failed', err); msg = 'That did not work'; }
      Game.toast(msg, 'good');
    } else if (b.dataset.skip) {
      const s = SKIPS.find(x => x[0] === b.dataset.skip);
      Game.debug.skip(s[1]);
      Game.toast(`Skipped ${s[2].slice(1)}`, 'info');
    } else return;
    Game.save?.();
    Game.render?.();
    panel?.refresh();
  });
  return panel;
}
function toStart() {
  Game.save?.(true);
  try { window.location.reload(); } catch (e) { Game.toast('Reopen the game to see the start screen', 'info'); }
}

function syncButton() {
  if (!Game.isReady) return;
  if (on()) Game.city?.addSideButton?.({ id: 'dev', icon: 'dev', label: 'Dev', onClick: openPanel });
  else {
    Game.city?.removeSideButton?.('dev');
    if (panel && !panel.closed) panel.close();
  }
}
Game.on('ready', syncButton);
Game.on('dev:changed', syncButton);
Game.on('spent', () => { if (on() && D().unlimited) topUp(); });
Game.on('building:started', () => { if (on() && D().instant) queueMicrotask(finishAll); });
Game.on('troops:started', () => { if (on() && D().instant) queueMicrotask(finishAll); });

Game.dev = {
  on,
  open: openPanel,
  topUp,
  finishAll,
  fillItems,
  maxBuildings,
  maxVip,
  startBlizzard,
  fillSurvivors,
};
