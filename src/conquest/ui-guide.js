/* Age of Conquest guide: a short welcome, then a bouncing gold "Tap" marker that points at the next thing to tap for
   the current goal (the building, the button in its sheet, the map, the camp), instead of pages of instructions. */

const A = window.AOC;
const U = window.AOCUI;
const { esc } = U;

U.welcome = () => {
  const logo = U.LOGO;
  U.sheet({
    title: 'Your city stands',
    body: `<div class="aoc-welcome">${logo ? `<img src="${logo}" alt="" width="160" height="160">` : ''}
      <p class="aoc-p">Six hundred governors, ten guilds, one living world. Tap where the marker points, or Go on the goal at the bottom.</p></div>`,
    actions: [{ label: 'Begin', id: 'aoc-welcome-go', icon: 'play' }],
  });
};

// ---------------------------------------------------------------- where the hand points
const BUILDING_GOAL = { hall2: 'hall', farm2: 'farm', warehouse: 'warehouse', train: 'barracks', research: 'academy', hall5: 'hall' };
const MAP_GOAL = { scout: 'Scout', camp: 'Attack', gather: 'Gather' };
const GUIDED = 9;
const G = { el: null, timer: 0, at: null, focused: '' };
function rectPoint(node) {
  if (!node || !node.isConnected) return null;
  const r = node.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function tab(id) { return rectPoint(document.querySelector(`#aoc-tab-${id}`)); }
function nearest(list, P) {
  let best = null, bd = Infinity;
  for (const o of list) { const d = Math.hypot(o.x - P.x, o.y - P.y); if (d < bd) { bd = d; best = o; } }
  return best;
}
function target() {
  const f = U.F;
  if (!f || !document.getElementById('aoc-layer')) return null;
  const P = f.player;
  const qi = f.quests.findIndex(q => !q.claimed);
  if (qi < 0 || qi >= GUIDED) return null;
  const q = f.quests[qi];
  // an open sheet: point at its next step if it has one
  const sheets = [...document.querySelectorAll('.aoc-sheet-wrap.is-open:not(.is-out)')];
  const sheet = sheets[sheets.length - 1];
  if (sheet) {
    if (sheet.querySelector('#aoc-welcome-go')) return null;
    const go = sheet.querySelector('#aoc-up-go:not(:disabled), #aoc-free:not(:disabled), #aoc-train-go, #aoc-march-go:not(:disabled), [data-tech]:not(:disabled), [data-claim]');
    if (go) return rectPoint(go);
    // a building sheet whose building does what the goal needs
    const bx = q.id === 'train' ? '[data-bx="train"]' : q.id === 'research' ? '[data-bx="research"]' : null;
    if (bx && sheet.querySelector(bx)) return rectPoint(sheet.querySelector(bx));
    const want = MAP_GOAL[q.id];
    if (want) { const b = [...sheet.querySelectorAll('.aoc-sheet-actions .aoc-btn')].find(x => x.textContent.trim().startsWith(want)); if (b) return rectPoint(b); }
    if (q.id === 'guild') return rectPoint(sheet.querySelector('[data-apply]'));
    return null;
  }
  if (q.done) return rectPoint(document.querySelector(`.aoc-screen-${U.current} .aoc-quest [data-claim]`));
  const bld = BUILDING_GOAL[q.id];
  if (bld) {
    if (U.current !== 'city') return tab('city');
    const H = U.home;
    if (P.q.build && q.id !== 'train' && q.id !== 'research') return null;
    if (q.id === 'train' && P.q.train.inf) return null;
    if (q.id === 'research' && P.q.research) return null;
    if (q.id === 'research' && !(P.b.academy > 0) && P.b.hall < A.BUILDINGS.academy.needHall) return H.where('hall');
    const p = H.where(bld);
    const r = document.querySelector('.aoc-town-cv')?.getBoundingClientRect();
    if (p && r && (p.x < r.left + 20 || p.x > r.right - 20 || p.y < r.top + 20 || p.y > r.bottom - 20)) {
      // bring it into view once; after that the player is looking around on purpose
      if (G.focused !== q.id + bld && performance.now() - H.camAt > 4000) { G.focused = q.id + bld; H.focus(bld, true); return H.where(bld); }
      return null;
    }
    return p;
  }
  if (MAP_GOAL[q.id]) {
    if (U.current !== 'map') return tab('map');
    const o = q.id === 'gather' ? nearest(f.nodes.filter(n => !n.busy), P) : nearest(f.camps, P);
    if (!o) return null;
    const p = U.mapPoint?.(o.x, o.y);
    return p || rectPoint(document.querySelector('.aoc-map-tools [data-act="home"]'));
  }
  if (q.id === 'guild') {
    if (U.current !== 'guild') return tab('guild');
    return rectPoint(document.querySelector('.aoc-screen-guild [data-apply]'));
  }
  return null;
}

// ---------------------------------------------------------------- the Tap marker
function handEl() {
  if (G.el && G.el.isConnected) return G.el;
  const layer = document.getElementById('aoc-layer');
  if (!layer) return null;
  G.el = U.el(`<div class="aoc-hand" aria-hidden="true" hidden><i class="aoc-hand-ring"></i><span class="aoc-tap"><span class="aoc-tap-t">Tap</span><svg class="aoc-tap-a" width="22" height="16" viewBox="0 0 22 16"><path d="M2 2h18L11 14Z" fill="#ffd862" stroke="#6b3d06" stroke-width="2" stroke-linejoin="round"/></svg></span></div>`);
  layer.appendChild(G.el);
  return G.el;
}
function tick() {
  const h = handEl();
  if (!h) return;
  let p = null;
  try { p = target(); } catch (e) { p = null; }
  if (!p) { h.hidden = true; G.at = null; return; }
  const lr = h.parentElement.getBoundingClientRect();
  h.hidden = false;
  // the marker sits above what it points at, or below when that is near the top of the screen
  h.classList.toggle('is-below', p.y - lr.top < 130);
  h.style.transform = `translate(${Math.round(p.x - lr.left)}px, ${Math.round(p.y - lr.top)}px)`;
  G.at = p;
}
U.guideTarget = () => { try { return target(); } catch (e) { return null; } };
U.onFrame(() => { if (!G.timer) G.timer = setInterval(tick, 200); });
