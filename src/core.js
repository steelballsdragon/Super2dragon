/* Last Furnace core: window.Game.
   State, resources, items, perks, timers, events, icons, screens and navigation, sheets, toasts, reward popups,
   backpack, speed up, HUD, tab bar, game loop, save and boot. docs/CONTRACT.md documents every public API. */

const Game = {};
window.Game = Game;
Game.version = 2;

const SAVE_KEY = 'last-furnace-v2';
const RES = ['meat', 'wood', 'coal', 'iron'];
const RES_KEYS = ['meat', 'wood', 'coal', 'iron', 'gems'];
const CORE_KEYS = new Set(['v', 'meta', 'res', 'items', 'timers']);
const OFFLINE_CAP_SEC = 12 * 3600;
const TICK_MS = 250;
const AUTOSAVE_MS = 5000;
const START_RES = { meat: 2500, wood: 2500, coal: 500, iron: 100, gems: 250 };
const START_ITEMS = { speedup_1m: 5, speedup_5m: 3, speedup_1h: 1, crate_meat: 1, crate_wood: 1 };

const RES_INFO = {
  meat: { name: 'Meat', icon: 'meat', building: 'hunter', buildingName: "Hunter's Hut", desc: "Feeds survivors and troops. Hunted at the Hunter's Hut." },
  wood: { name: 'Wood', icon: 'wood', building: 'sawmill', buildingName: 'Sawmill', desc: 'Goes into almost every construction. Cut at the Sawmill.' },
  coal: { name: 'Coal', icon: 'coal', building: 'coalmine', buildingName: 'Coal Mine', desc: 'Fuel for the Furnace and higher-level buildings. Dug at the Coal Mine.' },
  iron: { name: 'Iron', icon: 'iron', building: 'ironmine', buildingName: 'Iron Mine', desc: 'Needed for advanced buildings and troops. Mined at the Iron Mine.' },
  gems: { name: 'Gems', icon: 'gem', desc: 'Premium currency. Finishes timers at once and buys items in the Shop.' },
};
Game.RES = RES.slice();
Game.resInfo = RES_INFO;

// ---------------------------------------------------------------- utilities
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function clone(v) {
  if (v === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
}
function deepMerge(base, over) {
  if (over === undefined) return base;
  if (!isObj(base) || !isObj(over)) return clone(over);
  for (const k of Object.keys(over)) base[k] = deepMerge(base[k], over[k]);
  return base;
}
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ESC[c]); }
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}
function setText(node, text) {
  const s = String(text);
  if (node && node.textContent !== s) node.textContent = s;
}
Game.esc = esc;
Game.el = el;
Game.setText = setText;
Game.clamp = clamp;

const reported = new Set();
function reportOnce(key, err) {
  if (reported.has(key)) return;
  reported.add(key);
  console.error(`[Game] ${key} failed`, err);
}

// ---------------------------------------------------------------- storage (never throws)
Game.storage = {
  get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { window.localStorage.setItem(key, String(value)); return true; } catch (e) { return false; } },
  remove(key) { try { window.localStorage.removeItem(key); } catch (e) { /* storage unavailable */ } },
};

// ---------------------------------------------------------------- events
const listeners = new Map();
let isReady = false;
Game.on = (evt, fn) => {
  if (typeof fn !== 'function') return () => {};
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  if (evt === 'ready' && isReady) queueMicrotask(() => { try { fn({}); } catch (e) { console.error("[Game] 'ready' handler failed", e); } });
  return () => Game.off(evt, fn);
};
Game.off = (evt, fn) => { listeners.get(evt)?.delete(fn); };
Game.emit = (evt, payload) => {
  const set = listeners.get(evt);
  if (!set || !set.size) return;
  const p = payload ?? {};
  for (const fn of [...set]) {
    try { fn(p); } catch (e) { console.error(`[Game] '${evt}' handler failed`, e); }
  }
};

// ---------------------------------------------------------------- icons (24x24)
function starPath(cx, cy, R, r, n = 5) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2);
  }
  return d + 'Z';
}
function gearPath() {
  let d = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const [r, t] of [[7.4, a - 0.36], [10, a - 0.2], [10, a + 0.2], [7.4, a + 0.36]]) {
      d += (d ? 'L' : 'M') + (12 + r * Math.cos(t)).toFixed(2) + ' ' + (12 + r * Math.sin(t)).toFixed(2);
    }
  }
  return d + 'ZM12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4Z';
}

const CRATE_SVG = '<rect x="3" y="4.5" width="18" height="16" rx="1.5" fill="#8d5c2c" stroke="#4f300f" stroke-width="1"/><rect x="5.2" y="6.7" width="13.6" height="11.6" fill="#c08a4e"/><path d="M5.2 10.6h13.6M5.2 14.4h13.6" stroke="#9b6a37" stroke-width=".9"/><path d="M5.8 17.8 18.2 7.2" stroke="#8d5c2c" stroke-width="2.2"/><path d="M3 4.5h3v3H3zM18 4.5h3v3h-3zM3 17.5h3v3H3zM18 17.5h3v3h-3z" fill="#a9b8c6" stroke="#4f300f" stroke-width=".6"/>';

const ICONS = {
  meat: '<path d="M9.3 13.6 5.4 17.5" stroke="#a8977a" stroke-width="4.4" stroke-linecap="round"/><path d="M9.3 13.6 5.4 17.5" stroke="#efe3cb" stroke-width="3" stroke-linecap="round"/><circle cx="3.9" cy="17.1" r="1.8" fill="#efe3cb" stroke="#a8977a" stroke-width=".8"/><circle cx="5.8" cy="19.1" r="1.8" fill="#efe3cb" stroke="#a8977a" stroke-width=".8"/><path d="M8.4 15.1c-2.4-2.7-1.9-7.3 1.1-9.9 3-2.6 7.5-2.7 9.9-.1 2.4 2.7 1.6 7.1-1.4 9.6-3 2.6-7.2 3.1-9.6.4z" fill="#c4513a" stroke="#7e2b1c" stroke-width="1"/><path d="M10.7 8.2c1.2-1.6 3.4-2.3 5.3-1.6" stroke="#f39274" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M13.6 14.2c1.8-.4 3.4-1.6 4.2-3.2" stroke="#9a3826" stroke-width="1.2" stroke-linecap="round" fill="none"/>',
  wood: '<rect x="4" y="3.5" width="14" height="7.5" rx="3.75" fill="#9a6838" stroke="#6b4421" stroke-width="1"/><path d="M7 6.2h6" stroke="#7d5129" stroke-width="1" stroke-linecap="round"/><ellipse cx="17.5" cy="7.25" rx="2.7" ry="3.75" fill="#e9c993" stroke="#6b4421" stroke-width="1"/><ellipse cx="17.5" cy="7.25" rx="1.2" ry="1.7" fill="none" stroke="#b9874e" stroke-width=".9"/><rect x="2" y="11.5" width="16" height="9" rx="4.5" fill="#a8743f" stroke="#6b4421" stroke-width="1"/><path d="M6 14.5h6M5 17.5h8" stroke="#7d5129" stroke-width="1" stroke-linecap="round"/><ellipse cx="17.5" cy="16" rx="3.2" ry="4.5" fill="#f0d3a0" stroke="#6b4421" stroke-width="1"/><ellipse cx="17.5" cy="16" rx="1.5" ry="2.1" fill="none" stroke="#b9874e" stroke-width=".9"/>',
  coal: '<path d="M4 15.5 7.2 8.6l5.6-2.4 5.6 3 2.1 6.1-4.3 4.4H8.3Z" fill="#363c44" stroke="#6b7480" stroke-width="1" stroke-linejoin="round"/><path d="M7.2 8.6l5.6-2.4-.7 5.9Z" fill="#6d7681"/><path d="M12.8 6.2l5.6 3-6.3 2.9Z" fill="#525a65"/><path d="M4 15.5 7.2 8.6l4.9 3.5-3.8 7.4Z" fill="#434a53"/><path d="M12.1 12.1l8.4 3.1-4.3 4.4Z" fill="#2a2f35"/><path d="M8.4 9.6l2.8-1.2" stroke="#b5bec9" stroke-width=".9" stroke-linecap="round"/><circle cx="15.3" cy="16.4" r=".9" fill="#ff8a3a"/>',
  iron: '<path d="M7 7h10l2.5 4h-15Z" fill="#dfe7ee" stroke="#4f5b67" stroke-width="1" stroke-linejoin="round"/><path d="M4.5 11h15l2 6.5h-19Z" fill="#9aa9b8" stroke="#4f5b67" stroke-width="1" stroke-linejoin="round"/><path d="M16 11h3.5l2 6.5h-4Z" fill="#7a8999"/><path d="M8.3 8.4h6.4" stroke="#ffffff" stroke-width=".9" stroke-linecap="round" opacity=".8"/><path d="M5.6 12.6h8" stroke="#c6d2dd" stroke-width=".9" stroke-linecap="round"/>',
  gem: '<path d="M7 4h10l4.5 5L12 21 2.5 9Z" fill="#5fd9f7"/><path d="M7 4 9.6 9H2.5Z" fill="#8eeeff"/><path d="M7 4h10l-2.6 5H9.6Z" fill="#c6f8ff"/><path d="M17 4l4.5 5h-7.1Z" fill="#5ccff0"/><path d="M2.5 9h7.1L12 21Z" fill="#7d63f2"/><path d="M9.6 9h4.8L12 21Z" fill="#a08aff"/><path d="M14.4 9h7.1L12 21Z" fill="#5a41cf"/><path d="M7 4h10l4.5 5L12 21 2.5 9Z" fill="none" stroke="#2c2475" stroke-width="1" stroke-linejoin="round"/><path d="M9 5.6l1.1 1.7" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round"/>',
  power: '<path d="M13.8 2 4.8 13.6h5.9L9.2 22l10-12.6h-6.1Z" fill="#ffc533" stroke="#a35a0c" stroke-width="1.1" stroke-linejoin="round"/><path d="M12.4 5 8.2 10.6" stroke="#fff3c4" stroke-width="1.1" stroke-linecap="round"/>',
  speedup: '<path d="M7 4h10c0 4-3 6-4.2 8C14 14 17 16 17 20H7c0-4 3-6 4.2-8C10 10 7 8 7 4Z" fill="#d7f1ff" stroke="#4b97c9" stroke-width="1"/><path d="M8.7 6.5h6.6c-.6 1.9-2.3 3.2-3.3 4.4-1-1.2-2.7-2.5-3.3-4.4Z" fill="#f5c04e"/><path d="M8.3 19.3c.5-2.1 2.3-3.4 3.7-4 1.4.6 3.2 1.9 3.7 4Z" fill="#f5c04e"/><path d="M12 11.6v3.4" stroke="#f5c04e" stroke-width="1"/><path d="M5 2.8h14M5 21.2h14" stroke="#9a6533" stroke-width="2.6" stroke-linecap="round"/><path d="M5 2.8h14M5 21.2h14" stroke="#c48a4f" stroke-width="1" stroke-linecap="round"/>',
  ticket: '<path d="M3 6.5h18v3.6a2.4 2.4 0 0 0 0 4.8v3.6H3v-3.6a2.4 2.4 0 0 0 0-4.8Z" fill="#f5b83f" stroke="#94590f" stroke-width="1.1" stroke-linejoin="round"/><path d="M15.5 7.6v8.8" stroke="#94590f" stroke-width="1" stroke-dasharray="1.4 1.3"/><path d="' + starPath(9.6, 12.6, 3.6, 1.6) + '" fill="#fff4d1" stroke="#c2801c" stroke-width=".6" stroke-linejoin="round"/>',
  xp: '<rect x="4" y="3.5" width="14.5" height="17" rx="2" fill="#2c9f6c" stroke="#134f35" stroke-width="1"/><path d="M6 17.2h12.5v3.3H6.6a1.65 1.65 0 0 1 0-3.3Z" fill="#f2ead8" stroke="#134f35" stroke-width=".9"/><path d="M6.5 4.8v11" stroke="#5fd39d" stroke-width="1.2" stroke-linecap="round"/><path d="' + starPath(12.4, 10.2, 3.9, 1.7) + '" fill="#ffd44f" stroke="#9a6512" stroke-width=".7" stroke-linejoin="round"/><path d="M15.3 3.5v4.8l1.3-1 1.3 1V3.5" fill="#e2483d"/>',
  crate: CRATE_SVG,
  shard: '<path d="M10 2.5 16.5 7 14.5 21.5 6.5 15Z" fill="#b672ff" stroke="#4b1c8a" stroke-width="1" stroke-linejoin="round"/><path d="M10 2.5 16.5 7 11.5 11Z" fill="#dcb6ff"/><path d="M11.5 11 16.5 7 14.5 21.5Z" fill="#8d45e6"/><path d="M6.5 15 11.5 11 14.5 21.5Z" fill="#a35cf5"/><path d="M10 2.5 16.5 7 14.5 21.5 6.5 15Z" fill="none" stroke="#4b1c8a" stroke-width="1" stroke-linejoin="round"/><path d="M17.6 13.2 20.6 15.2 19.1 19.6 16.6 17.2Z" fill="#c993ff" stroke="#4b1c8a" stroke-width=".8" stroke-linejoin="round"/>',
  hero: '<path d="M3.5 21.5c.6-4.6 3.9-7.3 8.5-7.3s7.9 2.7 8.5 7.3Z" fill="#c2453b" stroke="#6e1f19" stroke-width="1"/><path d="M8.4 15.2 12 19.2l3.6-4" fill="none" stroke="#f2c04e" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="9.3" r="5.8" fill="#7d8fa6" stroke="#36465a" stroke-width="1"/><ellipse cx="12" cy="10" rx="3.6" ry="3.9" fill="#f1c9a2"/><path d="M8.1 8.7c1-2.6 2.5-3.7 3.9-3.7s2.9 1.1 3.9 3.7c-1.2-.8-2.5-1.2-3.9-1.2s-2.7.4-3.9 1.2Z" fill="#eee6d8"/><circle cx="10.6" cy="10.3" r=".75" fill="#2a2a33"/><circle cx="13.4" cy="10.3" r=".75" fill="#2a2a33"/>',
  troop_infantry: '<path d="M12 4.6c.2-1.8 1.8-3 4.3-3-.6 2.4-2.1 3.6-4.3 3Z" fill="#d8433b" stroke="#7c1b16" stroke-width=".7"/><path d="M12 4.5c-4.4 0-7.5 3.4-7.5 8v6.5h5.2v-4h4.6v4h5.2v-6.5c0-4.6-3.1-8-7.5-8Z" fill="#a9bacb" stroke="#46566a" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 11.6h11.6" stroke="#2c3846" stroke-width="1.8" stroke-linecap="round"/><path d="M12 5.2v5" stroke="#e4ecf3" stroke-width="1.2" stroke-linecap="round"/><path d="M6.6 14.2v3.8M17.4 14.2v3.8" stroke="#7d8fa2" stroke-width="1"/>',
  troop_lancer: '<path d="M4 20 16.6 7.4" stroke="#6b3f1d" stroke-width="3" stroke-linecap="round"/><path d="M4 20 16.6 7.4" stroke="#a8743f" stroke-width="1.6" stroke-linecap="round"/><path d="M15.4 6.2 21.2 2.8l-3.4 5.8Z" fill="#dfe8ef" stroke="#56677a" stroke-width="1" stroke-linejoin="round"/><path d="M14.4 9.6 12.4 11.6 9.6 7.8Z" fill="#3d86e0" stroke="#1d4f8f" stroke-width=".8" stroke-linejoin="round"/><path d="M5.6 16.6l1.8 1.8" stroke="#f2c04e" stroke-width="1.6" stroke-linecap="round"/>',
  troop_marksman: '<path d="M8 3c6.5 2.5 9 13.5 0 18" fill="none" stroke="#6b3f1d" stroke-width="2.8" stroke-linecap="round"/><path d="M8 3c6.5 2.5 9 13.5 0 18" fill="none" stroke="#b07a42" stroke-width="1.3" stroke-linecap="round"/><path d="M8 3v18" stroke="#efe6d2" stroke-width=".9"/><path d="M4.5 12h13.5" stroke="#c9d4de" stroke-width="1.5" stroke-linecap="round"/><path d="M17.5 9.4 21.5 12l-4 2.6Z" fill="#dfe8ef" stroke="#56677a" stroke-width=".8" stroke-linejoin="round"/><path d="M2.8 9.8l2.2 2.2-2.2 2.2M5 9.8l2.2 2.2L5 14.2" fill="none" stroke="#d8433b" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>',
  sword: '<path d="M19.8 2.8 21.2 4.2 10.4 15 9 13.6Z" fill="#dfe8ef" stroke="#5b6b7c" stroke-width="1" stroke-linejoin="round"/><path d="M20.5 3.5 9.7 14.3" stroke="#a9b8c6" stroke-width=".7"/><path d="M6.6 12.4 11.6 17.4" stroke="#9a6512" stroke-width="3.2" stroke-linecap="round"/><path d="M6.6 12.4 11.6 17.4" stroke="#f2c04e" stroke-width="1.8" stroke-linecap="round"/><path d="M8.4 15.6 5.6 18.4" stroke="#6b3f1d" stroke-width="2.6" stroke-linecap="round"/><circle cx="4.7" cy="19.3" r="1.6" fill="#f2c04e" stroke="#9a6512" stroke-width=".8"/>',
  shield: '<path d="M12 2.5 19.5 5.2v6.3c0 4.9-3.2 8.4-7.5 10-4.3-1.6-7.5-5.1-7.5-10V5.2Z" fill="#2d6cc0" stroke="#dbe5ee" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 5v14.2M7 10.6h10" stroke="#f2c04e" stroke-width="1.9" stroke-linecap="round"/><path d="M12 2.5 19.5 5.2v6.3c0 4.9-3.2 8.4-7.5 10Z" fill="#163f78" opacity=".35"/>',
  clock: '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7.4V12l3.2 2.1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  chest: '<path d="M3.5 11h17v8.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" fill="#9b5f2a" stroke="#4f2d10" stroke-width="1"/><path d="M3.5 11V9.5C3.5 6.5 6 4 9 4h6c3 0 5.5 2.5 5.5 5.5V11Z" fill="#b8763a" stroke="#4f2d10" stroke-width="1"/><path d="M6 6.6c1-1.2 2.1-1.6 3.4-1.6" stroke="#e0a865" stroke-width="1" stroke-linecap="round" fill="none"/><path d="M3.5 11h17" stroke="#f0c04c" stroke-width="2"/><path d="M8 4.3v16.2M16 4.3v16.2" stroke="#f0c04c" stroke-width="1.6"/><rect x="10.2" y="9.4" width="3.6" height="4.8" rx=".8" fill="#ffd862" stroke="#8a5a12" stroke-width=".8"/><circle cx="12" cy="11.6" r=".75" fill="#4f2d10"/>',
  check: '<path d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill-rule="evenodd" d="M5.5 10.5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm6.5 3.2a1.5 1.5 0 0 0-.8 2.8V18h1.6v-1.5a1.5 1.5 0 0 0-.8-2.8Z" fill="currentColor"/>',
  arrow_up: '<path d="M12 3.2 20.2 12H15v8.8H9V12H3.8Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  minus: '<path d="M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  gift: '<rect x="3.5" y="10" width="17" height="10.5" rx="1" fill="#d8433b" stroke="#7c1b16" stroke-width="1"/><rect x="2.5" y="7.2" width="19" height="3.6" rx="1" fill="#ef5a4f" stroke="#7c1b16" stroke-width="1"/><path d="M12 7.2v13.3" stroke="#f5c548" stroke-width="2.6"/><path d="M3.5 13.5h17" stroke="#b8322b" stroke-width=".8" opacity=".6"/><path d="M12 7c-1.2-3.4-5.4-4.4-5.6-2.1C6.2 7 9.8 7.2 12 7Zm0 0c1.2-3.4 5.4-4.4 5.6-2.1C17.8 7 14.2 7.2 12 7Z" fill="#f5c548" stroke="#9a6512" stroke-width=".9" stroke-linejoin="round"/>',
  star: '<path d="' + starPath(12, 12.6, 9.6, 4.2) + '" fill="#ffcf3f" stroke="#a3640c" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.6 9.3l1.6-3" stroke="#fff3c4" stroke-width="1.1" stroke-linecap="round"/>',
  vip: '<rect x="1" y="6" width="22" height="12" rx="3" fill="#f3c04a" stroke="#9a6512" stroke-width="1"/><path d="M2.2 8.6c0-1 .8-1.6 1.8-1.6h16" stroke="#fff1c2" stroke-width="1" stroke-linecap="round" fill="none"/><path d="M3.6 8h1.9l1.6 5.3L8.7 8h1.9l-2.6 8H6.2Z" fill="#3a2205"/><rect x="11.4" y="8" width="1.9" height="8" fill="#3a2205"/><path fill-rule="evenodd" d="M14.8 8h3.2c1.6 0 2.6 1 2.6 2.5S19.6 13 18 13h-1.3v3h-1.9Zm1.9 1.6v1.8h1.1c.6 0 .9-.4.9-.9s-.3-.9-.9-.9Z" fill="#3a2205"/>',
  mail: '<rect x="2.5" y="5.5" width="19" height="13.5" rx="1.6" fill="#f1e7d2" stroke="#7c6a4f" stroke-width="1"/><path d="M3.2 6.6 12 13.4l8.8-6.8" fill="none" stroke="#a8946f" stroke-width="1.3" stroke-linejoin="round"/><circle cx="12" cy="13.4" r="2.5" fill="#d8433b" stroke="#7c1b16" stroke-width=".8"/>',
  bag: '<path d="M9 5.8V4.6a3 3 0 0 1 6 0v1.2" fill="none" stroke="#5c3818" stroke-width="1.7"/><rect x="4.5" y="5.6" width="15" height="16" rx="3.5" fill="#99633a" stroke="#4f2d10" stroke-width="1"/><path d="M4.5 10.6c0-2 1.6-3.4 3.6-3.4h7.8c2 0 3.6 1.4 3.6 3.4V12H4.5Z" fill="#b97c45" stroke="#4f2d10" stroke-width="1"/><rect x="7.5" y="14.2" width="9" height="5" rx="1.2" fill="#87532c" stroke="#4f2d10" stroke-width=".9"/><rect x="10.8" y="10.8" width="2.4" height="3.1" rx=".5" fill="#f0c04c" stroke="#8a5a12" stroke-width=".7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2" fill="#edf2f7" stroke="#4d5d70" stroke-width="1"/><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3Z" fill="#d8433b"/><path d="M8 3v4M16 3v4" stroke="#3a4656" stroke-width="2" stroke-linecap="round"/><path d="M5.8 12.4h2.6v2.4H5.8zM10.7 12.4h2.6v2.4h-2.6zM15.6 12.4h2.6v2.4h-2.6zM5.8 16.6h2.6V19H5.8zM10.7 16.6h2.6V19h-2.6z" fill="#9aa8b8"/><path d="M15.4 17.6l1.2 1.2 2.2-2.4" fill="none" stroke="#2fae55" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  flame: '<path d="M12 2.5c.8 3.4 5.8 5.6 5.8 11.2A5.8 5.8 0 0 1 6.2 13.7c0-2.9 1.6-4.7 2.8-5.8.1 1.8.9 2.9 2.1 3.6C10.6 8.6 11.2 5.6 12 2.5Z" fill="#ff7a2a" stroke="#a83a0c" stroke-width="1" stroke-linejoin="round"/><path d="M12 10.3c.5 2 3.2 3.2 3.2 6.1a3.2 3.2 0 0 1-6.4 0c0-1.4.8-2.5 1.5-3.1.1.9.5 1.5 1.1 1.8-.2-1.6.1-3.1.6-4.8Z" fill="#ffd34d"/>',
  snow: '<g stroke="#bfe9ff" stroke-width="1.8" stroke-linecap="round" fill="none">' + [0, 60, 120, 180, 240, 300].map(a => `<g transform="rotate(${a} 12 12)"><path d="M12 12V2.8M9.7 4.8 12 7.1l2.3-2.3"/></g>`).join('') + '</g><circle cx="12" cy="12" r="1.6" fill="#ffffff"/>',
  user: '<circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M3.8 20.5c.8-4.4 4-6.8 8.2-6.8s7.4 2.4 8.2 6.8Z" fill="currentColor"/>',

  // extras
  city: '<path d="M5 21.5 6.5 9.5h11L19 21.5Z" fill="#6e7a88" stroke="#2f3946" stroke-width="1" stroke-linejoin="round"/><path d="M6.9 13.2h10.2M6.4 17.2h11.2M10 9.5v3.7M14 13.2v4M10.2 17.2v4.3" stroke="#56616e" stroke-width=".9"/><path d="M9.5 21.5v-3.2a2.5 2.5 0 0 1 5 0v3.2Z" fill="#ffb347" stroke="#a8480c" stroke-width=".9"/><rect x="5.5" y="7.6" width="13" height="2.4" rx=".6" fill="#8a96a5" stroke="#2f3946" stroke-width="1"/><path d="M5.6 8.2c1.5-.9 3-.9 4.4-.2 1.4-.7 2.8-.6 4.2.1 1.4-.7 2.9-.6 4.2.1V7.6H5.6Z" fill="#f4f9ff"/><path d="M12 1.6c.5 1.7 2.8 2.6 2.8 4.6a2.8 2.8 0 0 1-5.6 0c0-1 .6-1.7 1.1-2.2.1.7.4 1.1.9 1.3-.2-1.3.3-2.6.8-3.7Z" fill="#ff8a2a" stroke="#a83a0c" stroke-width=".6"/>',
  map: '<path d="M3 6l5.5-2 7 2.5L21 4.5v13.5l-5.5 2-7-2.5L3 19.5Z" fill="#e8d3a2" stroke="#7b6236" stroke-width="1" stroke-linejoin="round"/><path d="M8.5 4v13.5M15.5 6.5V20" stroke="#c4aa72" stroke-width="1"/><path d="M5.5 15.5c2-.5 2.8-3 5-3.5s3.6 1.2 5.5-.5" fill="none" stroke="#c0392b" stroke-width="1.3" stroke-dasharray="1.6 1.4" stroke-linecap="round"/><path d="M16.6 7.6l2.6 2.6M19.2 7.6l-2.6 2.6" stroke="#c0392b" stroke-width="1.6" stroke-linecap="round"/>',
  shop: '<rect x="4.5" y="10" width="15" height="11" fill="#7a4f2c" stroke="#3f2610" stroke-width="1"/><rect x="7.5" y="12.2" width="9" height="3.6" rx=".6" fill="#ffcf6b" stroke="#8a5a12" stroke-width=".7"/><rect x="4.5" y="17" width="15" height="1.8" fill="#a8743f"/><path d="M4.5 4h3.75L7.5 9H3Z" fill="#d8433b"/><path d="M8.25 4H12v5H7.5Z" fill="#f3ead8"/><path d="M12 4h3.75l.75 5H12Z" fill="#d8433b"/><path d="M15.75 4h3.75L21 9h-4.5Z" fill="#f3ead8"/><path d="M3 9a2.25 2.25 0 0 0 4.5 0Z" fill="#d8433b"/><path d="M7.5 9a2.25 2.25 0 0 0 4.5 0Z" fill="#f3ead8"/><path d="M12 9a2.25 2.25 0 0 0 4.5 0Z" fill="#d8433b"/><path d="M16.5 9a2.25 2.25 0 0 0 4.5 0Z" fill="#f3ead8"/><path d="M4.5 4h15L21 9H3Z" fill="none" stroke="#7c1b16" stroke-width=".9" stroke-linejoin="round"/>',
  hammer: '<g transform="rotate(40 12 12)"><rect x="10.6" y="8.5" width="2.8" height="13.5" rx="1.4" fill="#9a6838" stroke="#4f300f" stroke-width="1"/><rect x="5.5" y="3" width="13" height="5.8" rx="1.2" fill="#b6c3cf" stroke="#46566a" stroke-width="1"/><path d="M6.6 4.4h10.8" stroke="#e4ecf3" stroke-width=".9" stroke-linecap="round"/></g>',
  survivor: '<path d="M5 21.5c.4-4.8 3.2-7.6 7-7.6s6.6 2.8 7 7.6Z" fill="#5d7b9c" stroke="#2c3e52" stroke-width="1"/><circle cx="12" cy="9" r="5.2" fill="#8a6a4a" stroke="#4a3520" stroke-width="1"/><ellipse cx="12" cy="9.7" rx="3.2" ry="3.4" fill="#f0c7a0"/><path d="M8.7 7.7c.9-1.6 2-2.3 3.3-2.3s2.4.7 3.3 2.3" fill="none" stroke="#eee6d8" stroke-width="1.4" stroke-linecap="round"/><rect x="8.4" y="14.3" width="7.2" height="2" rx=".8" fill="#d8433b"/><circle cx="10.8" cy="9.9" r=".6" fill="#2a2a33"/><circle cx="13.2" cy="9.9" r=".6" fill="#2a2a33"/>',
  heart: '<path d="M12 20.5s-8-4.9-8-10.7A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8 2.6c0 5.8-8 10.7-8 10.7Z" fill="#ef4f5a" stroke="#8a1c24" stroke-width="1" stroke-linejoin="round"/><path d="M7.2 9.4c.3-1.2 1.2-1.9 2.3-1.9" stroke="#ffb3b8" stroke-width="1.2" stroke-linecap="round" fill="none"/>',
  trophy: '<path d="M7 5H4.5v1.5A3.5 3.5 0 0 0 8 10M17 5h2.5v1.5A3.5 3.5 0 0 1 16 10" fill="none" stroke="#9a6512" stroke-width="1.5"/><path d="M7 3.5h10v5a5 5 0 0 1-10 0Z" fill="#ffc93f" stroke="#9a6512" stroke-width="1"/><path d="M9 5v3.4" stroke="#fff1c2" stroke-width="1.1" stroke-linecap="round"/><path d="M10.5 13.2h3v3.3h-3z" fill="#e0a52c"/><rect x="7.5" y="16.5" width="9" height="4" rx="1" fill="#8a5a32" stroke="#4f2d10" stroke-width="1"/>',
  crown: '<path d="M3.5 18 2.5 7.5l5.2 4.3L12 4.5l4.3 7.3 5.2-4.3-1 10.5Z" fill="#ffc93f" stroke="#9a6512" stroke-width="1" stroke-linejoin="round"/><rect x="3.5" y="18" width="17" height="2.6" rx=".8" fill="#e0a52c" stroke="#9a6512" stroke-width="1"/><circle cx="12" cy="14" r="1.6" fill="#e2483d"/><circle cx="7.4" cy="15" r="1.05" fill="#4fd2f0"/><circle cx="16.6" cy="15" r="1.05" fill="#4fd2f0"/>',
  thermo: '<path d="M9.5 14.2V5a2.5 2.5 0 0 1 5 0v9.2a4.2 4.2 0 1 1-5 0Z" fill="#eef4fa" stroke="#4d5d70" stroke-width="1"/><path d="M12 7.5v8" stroke="#e2483d" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="2.6" fill="#e2483d"/><path d="M15.8 6.5h2M15.8 9.5h2M15.8 12.5h2" stroke="#8fd8ff" stroke-width="1.2" stroke-linecap="round"/>',
  warning: '<path d="M12 3.2 21.5 19.8H2.5Z" fill="#ffc23d" stroke="#8a5a12" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 9v5.2" stroke="#3a2205" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.25" fill="#3a2205"/>',
  exclaim: '<path d="M12 4.5v9.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><circle cx="12" cy="19" r="1.9" fill="currentColor"/>',
  chevron_right: '<path d="M9 5.5 15.5 12 9 18.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  chevron_left: '<path d="M15 5.5 8.5 12 15 18.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="8.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 10.8v5.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.4" r="1.4" fill="currentColor"/>',
  settings: '<path fill-rule="evenodd" d="' + gearPath() + '" fill="currentColor"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2.1-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M18.5 3.5v4.2h-4.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  play: '<path d="M8 5.2v13.6L18.8 12Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>',
  fast: '<path d="M3.5 6v12l8-6Zm8.5 0v12l8-6Z" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/>',
  _missing: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.4"/>',
};
for (const r of RES) {
  ICONS['crate_' + r] = `<g transform="translate(0 2.6) scale(.86)">${CRATE_SVG}</g><circle cx="17.4" cy="6.6" r="6" fill="#0d1b2c" stroke="#8fd8ff" stroke-width="1"/><g transform="translate(11.4 .6) scale(.5)">${ICONS[r]}</g>`;
}

Game.icon = (name, size = 16) => {
  const inner = ICONS[name] ?? ICONS._missing;
  const s = Number(size) || 16;
  return `<svg class="ico ico-${esc(name)}" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
};
Game.addIcon = (name, markup) => { if (name) ICONS[String(name)] = String(markup ?? ''); };
Game.hasIcon = name => Object.prototype.hasOwnProperty.call(ICONS, name) && name !== '_missing';
Game.iconNames = () => Object.keys(ICONS).filter(n => n !== '_missing');

// ---------------------------------------------------------------- chief portraits (48x48)
const AVATARS = [
  { bg: '#2d5f93', hood: '#6b7f96', fur: '#ece4d6', skin: '#f1c9a2', hair: '#6b4426', coat: '#3f566f', beard: true },
  { bg: '#7a3b2e', hood: '#a2483a', fur: '#f0e6d6', skin: '#e8b48a', hair: '#3b2a1c', coat: '#6a2f25', scarf: '#f2c04e' },
  { bg: '#2f6b55', hood: '#3f6f5e', fur: '#e3dccf', skin: '#c98d63', hair: '#1f1a16', coat: '#2c5244', beard: true },
  { bg: '#5b3d86', hood: '#6c5596', fur: '#eee8f6', skin: '#f3d0b0', hair: '#c9a15a', coat: '#46336b', scarf: '#d8433b' },
  { bg: '#8a6420', hood: '#7a6448', fur: '#f2ead9', skin: '#9c6a46', hair: '#2a1d14', coat: '#5d4a33', scarf: '#3d86e0' },
  { bg: '#36474f', hood: '#4f5d66', fur: '#dfe6ea', skin: '#f0c39a', hair: '#c4c4c4', coat: '#2f3c44', beard: true },
];
Game.avatarCount = AVATARS.length;
Game.avatarSvg = (index = 0, size = 48) => {
  const n = AVATARS.length;
  const i = Number.isFinite(Number(index)) ? ((Math.floor(Number(index)) % n) + n) % n : 0;
  const a = AVATARS[i];
  const face = a.beard
    ? `<path d="M16.2 24.5c.8 6.2 4.2 9 7.8 9s7-2.8 7.8-9c-1.8 2.2-4.6 3.4-7.8 3.4s-6-1.2-7.8-3.4Z" fill="${a.hair}"/><path d="M22 28.4h4" stroke="#7a3b2e" stroke-width="1.1" stroke-linecap="round"/>`
    : `<path d="M22 28.2c1.2.8 2.8.8 4 0" fill="none" stroke="#7a3b2e" stroke-width="1.2" stroke-linecap="round"/><circle cx="18.8" cy="26" r="1.5" fill="#e88a7a" opacity=".45"/><circle cx="29.2" cy="26" r="1.5" fill="#e88a7a" opacity=".45"/>`;
  const scarf = a.scarf ? `<path d="M15.5 33.4h17l-1.2 4h-14.6Z" fill="${a.scarf}"/><path d="M27 36.6l3.5 8-3.6.8-1.7-8.2Z" fill="${a.scarf}"/>` : '';
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect width="48" height="48" fill="${a.bg}"/><circle cx="24" cy="6" r="22" fill="#ffffff" opacity=".07"/><path d="M5 48c1.5-9 8.5-14 19-14s17.5 5 19 14Z" fill="${a.coat}"/><ellipse cx="24" cy="35.5" rx="12.5" ry="4.2" fill="${a.fur}"/>${scarf}<circle cx="24" cy="21" r="13.5" fill="${a.hood}"/><ellipse cx="24" cy="22.5" rx="10" ry="11" fill="none" stroke="${a.fur}" stroke-width="3.4"/><ellipse cx="24" cy="22.5" rx="8.2" ry="9.2" fill="${a.skin}"/><path d="M16.6 19.5c1.6-3.6 4.4-5.2 7.4-5.2s5.8 1.6 7.4 5.2c-2.2-1-4.6-1.5-7.4-1.5s-5.2.5-7.4 1.5Z" fill="${a.hair}"/><circle cx="20.6" cy="22.6" r="1.25" fill="#1d2633"/><circle cx="27.4" cy="22.6" r="1.25" fill="#1d2633"/><path d="M19 19.9h3.2M25.8 19.9H29" stroke="${a.hair}" stroke-width="1.3" stroke-linecap="round"/>${face}</svg>`;
};

// ---------------------------------------------------------------- formatting
Game.fmt = n => {
  n = Number(n);
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0;
  const a = Math.abs(n);
  let s;
  if (a < 10000) s = Math.floor(a).toLocaleString('en-US');
  else {
    for (const [v, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
      if (a >= v) {
        const x = a / v;
        s = (x < 100 ? Math.floor(x * 10) / 10 : Math.floor(x)) + u;
        break;
      }
    }
  }
  return (neg && s !== '0' ? '-' : '') + s;
};
Game.fmtFull = n => {
  n = Number(n);
  if (!Number.isFinite(n)) return '0';
  return Math.floor(n).toLocaleString('en-US');
};
Game.fmtTime = sec => {
  sec = Math.max(0, Math.ceil(Number(sec) || 0));
  const p = v => String(v).padStart(2, '0');
  if (sec < 60) return sec + 's';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${p(sec % 60)}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${p(Math.floor((sec % 3600) / 60))}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
};

// ---------------------------------------------------------------- time and debug
let S = null;
Game.S = null;
let booted = false;
let noSave = false;
Game.debug = {
  offsetMs: 0,
  skip(sec) {
    sec = Math.max(0, Number(sec) || 0);
    if (!booted || !S) { Game.debug.offsetMs += sec * 1000; return; }
    let left = sec;
    while (left > 0) {
      const step = Math.min(60, left);
      left -= step;
      Game.debug.offsetMs += step * 1000;
      tickModules(step, Game.now());
      processTimers();
      checkDay();
    }
    lastWall = Game.now();
    S.meta.lastSeen = lastWall;
    render();
  },
  grant(rewards) { Game.grant(rewards, { source: 'debug' }); },
  reset() {
    noSave = true;
    if (loopTimer) clearInterval(loopTimer);
    Game.storage.remove(SAVE_KEY);
    try { window.location.reload(); } catch (e) { /* reload blocked */ }
  },
};
Game.now = () => Date.now() + (Number(Game.debug.offsetMs) || 0);
function todayKey() {
  const d = new Date(Game.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
Game.today = todayKey;

const rmq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
Game.reducedMotion = !!(rmq && rmq.matches);
try {
  rmq?.addEventListener?.('change', e => {
    Game.reducedMotion = e.matches;
    Game.emit('motion:changed', { reduced: e.matches });
  });
} catch (e) { /* old browsers */ }

// ---------------------------------------------------------------- modules and state
const modules = [];
Game.registerModule = def => {
  if (!def || !def.id) { console.error('[Game] registerModule needs an id'); return; }
  const i = modules.findIndex(m => m.id === def.id);
  if (i >= 0) modules.splice(i, 1, def); else modules.push(def);
  if (booted && S) initSlice(def, S[def.id]);
};
Game.modules = () => modules.map(m => m.id);

function newCoreState() {
  const now = Game.now();
  return {
    v: 2,
    meta: {
      createdAt: now,
      lastSeen: now,
      day: null,
      chiefName: 'Chief ' + (1000 + Math.floor(Math.random() * 9000)),
      avatar: Math.floor(Math.random() * AVATARS.length),
    },
    res: { ...START_RES },
    items: { ...START_ITEMS },
    timers: [],
  };
}

function validTimer(t) {
  return isObj(t) && t.id != null && typeof t.kind === 'string' && Number.isFinite(t.endAt);
}

let isNewGame = false;
function buildState(src) {
  const st = newCoreState();
  const fresh = !(isObj(src) && src.v === 2);
  const s = fresh ? {} : clone(src);
  if (!fresh) {
    // keep slices of modules that are not part of this build so a partial build never erases them
    for (const k of Object.keys(s)) if (!CORE_KEYS.has(k) && !modules.some(m => m.id === k)) st[k] = s[k];
    if (isObj(s.meta)) {
      const m = s.meta;
      for (const k of Object.keys(m)) if (!['createdAt', 'lastSeen', 'day', 'chiefName', 'avatar'].includes(k)) st.meta[k] = m[k];
      if (Number.isFinite(m.createdAt)) st.meta.createdAt = m.createdAt;
      if (Number.isFinite(m.lastSeen)) st.meta.lastSeen = m.lastSeen;
      if (typeof m.day === 'string' || m.day === null) st.meta.day = m.day;
      if (typeof m.chiefName === 'string' && m.chiefName.trim()) st.meta.chiefName = m.chiefName.trim().slice(0, 24);
      if (Number.isInteger(m.avatar)) st.meta.avatar = m.avatar;
    }
    if (isObj(s.res)) for (const k of RES_KEYS) if (Number.isFinite(s.res[k])) st.res[k] = Math.max(0, s.res[k]);
    st.items = {};
    if (isObj(s.items)) for (const [id, n] of Object.entries(s.items)) if (Number.isFinite(n) && n >= 1) st.items[id] = Math.floor(n);
    st.timers = Array.isArray(s.timers)
      ? s.timers.filter(validTimer).map(t => ({
        id: String(t.id),
        kind: t.kind,
        label: String(t.label ?? ''),
        startAt: Number.isFinite(t.startAt) ? t.startAt : t.endAt,
        endAt: t.endAt,
        data: t.data ?? null,
      }))
      : [];
  }
  S = st;
  Game.S = st;
  for (const m of modules) initSlice(m, fresh ? undefined : s[m.id]);
  isNewGame = fresh;
  return st;
}

function initSlice(m, saved) {
  let slice = {};
  try { slice = typeof m.initState === 'function' ? m.initState() : {}; } catch (e) { console.error(`[Game] ${m.id}.initState failed`, e); }
  if (!isObj(slice)) slice = {};
  if (isObj(saved)) {
    slice = deepMerge(slice, clone(saved));
    if (typeof m.migrate === 'function') {
      try {
        const r = m.migrate(slice);
        if (isObj(r)) slice = r;
      } catch (e) { console.error(`[Game] ${m.id}.migrate failed`, e); }
    }
  }
  S[m.id] = slice;
}

function loadSaved() {
  const raw = Game.storage.get(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return isObj(data) ? data : null;
  } catch (e) { return null; }
}

Game.power = () => {
  let p = 0;
  for (const m of modules) {
    if (typeof m.power !== 'function') continue;
    try { p += num(Number(m.power())); } catch (e) { reportOnce(`${m.id}.power`, e); }
  }
  return Math.floor(p);
};

// ---------------------------------------------------------------- resources
function costParts(cost) {
  const res = {};
  const items = {};
  if (!isObj(cost)) return { res, items };
  for (const k of RES_KEYS) { const v = num(cost[k]); if (v > 0) res[k] = v; }
  if (isObj(cost.items)) for (const [id, n] of Object.entries(cost.items)) { const v = num(n); if (v > 0) items[id] = v; }
  return { res, items };
}
Game.has = cost => {
  if (!S) return false;
  const { res, items } = costParts(cost);
  for (const [k, v] of Object.entries(res)) if (num(S.res[k]) < v) return false;
  for (const [id, v] of Object.entries(items)) if (num(S.items[id]) < v) return false;
  return true;
};
Game.missing = cost => {
  const out = {};
  if (!S) return out;
  const { res, items } = costParts(cost);
  for (const [k, v] of Object.entries(res)) { const d = v - num(S.res[k]); if (d > 0) out[k] = Math.ceil(d); }
  for (const [id, v] of Object.entries(items)) {
    const d = v - num(S.items[id]);
    if (d > 0) (out.items ||= {})[id] = Math.ceil(d);
  }
  return out;
};
Game.spend = (cost, reason = '') => {
  if (!Game.has(cost)) return false;
  const { res, items } = costParts(cost);
  for (const [k, v] of Object.entries(res)) S.res[k] = Math.max(0, num(S.res[k]) - v);
  for (const [id, v] of Object.entries(items)) {
    S.items[id] = num(S.items[id]) - v;
    if (S.items[id] <= 0) delete S.items[id];
  }
  if (res.gems) Game.emit('gems:spent', { amount: res.gems, reason: String(reason || '') });
  Game.emit('spent', { cost: { ...res, items }, reason: String(reason || '') });
  return true;
};
Game.grant = (rewards, opts = {}) => {
  if (!S || !isObj(rewards)) return;
  const { res, items } = costParts(rewards);
  for (const [k, v] of Object.entries(res)) S.res[k] = num(S.res[k]) + v;
  for (const [id, v] of Object.entries(items)) S.items[id] = num(S.items[id]) + Math.floor(v);
  const o = isObj(opts) ? opts : {};
  Game.emit('granted', { rewards, source: o.source || '' });
  if (o.popup) Game.rewardPopup(rewards, o.title);
};

// ---------------------------------------------------------------- items
Game.itemDefs = {};
Game.defineItem = (id, def = {}) => {
  if (!id) return null;
  Game.itemDefs[id] = { name: id, icon: 'crate', desc: '', ...def, id };
  return Game.itemDefs[id];
};
Game.itemCount = id => num(S?.items?.[id]);
Game.itemDesc = id => {
  const d = Game.itemDefs[id];
  if (!d) return '';
  try { return typeof d.desc === 'function' ? String(d.desc()) : String(d.desc ?? ''); } catch (e) { return ''; }
};
Game.useItem = (id, count = 1) => {
  const def = Game.itemDefs[id];
  const n = Math.floor(Number(count) || 0);
  if (!S || !def || typeof def.use !== 'function' || n < 1 || Game.itemCount(id) < n) return false;
  S.items[id] -= n;
  if (S.items[id] <= 0) delete S.items[id];
  let r;
  try { r = def.use(n); } catch (e) { console.error(`[Game] item ${id} use failed`, e); r = false; }
  if (r === false) {
    S.items[id] = num(S.items[id]) + n;
    return false;
  }
  Game.emit('item:used', { id, count: n });
  return true;
};

const CRATE_BASE = { meat: 1000, wood: 1000, coal: 300, iron: 80 };
Game.crateAmount = type => {
  const fl = Math.max(1, Math.floor(Number(Game.furnaceLevel()) || 1));
  const f = (1 + (fl - 1) * 0.35) * Math.pow(1.08, fl - 1);
  return Math.round(((CRATE_BASE[type] || 0) * f) / 10) * 10;
};

[
  ['speedup_1m', 60, '1m Speedup', '', 'Cuts 1 minute from any build or training timer.'],
  ['speedup_5m', 300, '5m Speedup', '', 'Cuts 5 minutes from any build or training timer.'],
  ['speedup_1h', 3600, '1h Speedup', 'rare', 'Cuts 1 hour from any build or training timer.'],
  ['speedup_8h', 28800, '8h Speedup', 'epic', 'Cuts 8 hours from any build or training timer.'],
].forEach(([id, sec, name, rarity, desc]) => Game.defineItem(id, { name, icon: 'speedup', rarity, desc, speedupSec: sec, group: 'speedup', sort: sec }));
Game.defineItem('ticket_recruit', { name: 'Recruit Ticket', icon: 'ticket', rarity: 'rare', group: 'hero', go: 'heroes:recruit', desc: 'Recruits one hero.' });
Game.defineItem('xp_book', { name: 'Hero XP Book', icon: 'xp', rarity: 'rare', group: 'hero', go: 'heroes', desc: 'Gives a hero 500 XP. Use it from a hero\'s page.' });
for (const r of RES) {
  Game.defineItem('crate_' + r, {
    name: RES_INFO[r].name + ' Crate',
    icon: 'crate_' + r,
    group: 'resource',
    sort: RES.indexOf(r),
    desc: () => `Opens for ${Game.fmt(Game.crateAmount(r))} ${RES_INFO[r].name}. Grows with your Furnace level.`,
    use: count => { Game.grant({ [r]: Game.crateAmount(r) * count }, { source: 'item', popup: true }); },
  });
}

const ITEM_GROUPS = [
  { id: 'all', label: 'All' },
  { id: 'speedup', label: 'Speedups' },
  { id: 'resource', label: 'Resources' },
  { id: 'hero', label: 'Heroes' },
  { id: 'other', label: 'Other' },
];
function itemGroup(def) {
  if (def.group && ITEM_GROUPS.some(g => g.id === def.group)) return def.group;
  if (num(def.speedupSec) > 0) return 'speedup';
  if (/^crate_/.test(def.id)) return 'resource';
  if (/^(ticket|xp_|shard_)/.test(def.id)) return 'hero';
  return 'other';
}
function itemSort(a, b) {
  const ga = ITEM_GROUPS.findIndex(g => g.id === itemGroup(a.def));
  const gb = ITEM_GROUPS.findIndex(g => g.id === itemGroup(b.def));
  return ga - gb || num(a.def.sort) - num(b.def.sort) || String(a.def.name).localeCompare(String(b.def.name));
}

// ---------------------------------------------------------------- perks
const PERK_BASE = { builders: 1, freeFinishSec: 60, productionPct: 0, idleCapHours: 8, trainSpeedPct: 0, buildSpeedPct: 0 };
const perkFns = new Map();
Game.registerPerk = (name, fn) => {
  if (!name || typeof fn !== 'function') return;
  if (!perkFns.has(name)) perkFns.set(name, []);
  perkFns.get(name).push(fn);
};
Game.perk = name => {
  let v = PERK_BASE[name] ?? 0;
  for (const fn of perkFns.get(name) || []) {
    try {
      const x = Number(fn());
      if (Number.isFinite(x)) v += x;
    } catch (e) { reportOnce(`perk ${name}`, e); }
  }
  if (name === 'builders') v = Math.min(2, Math.max(1, Math.floor(v)));
  return v;
};
Game.furnaceLevel = () => {
  let lv = 1;
  try { lv = Number(Game.city?.level?.('furnace') ?? 1); } catch (e) { lv = 1; }
  return Number.isFinite(lv) && lv >= 1 ? lv : 1;
};
Game.gemCostForSeconds = sec => {
  const s = Math.max(0, Number(sec) || 0);
  if (s <= 0) return 0;
  return Math.max(1, Math.ceil(1.5 * Math.pow(s / 60, 0.85)));
};

// ---------------------------------------------------------------- timers (wall clock, persisted)
const timerHandlers = new Map();
let timerSeq = 0;
function completeTimer(t) {
  if (!S) return false;
  const i = S.timers.indexOf(t);
  if (i < 0) return false;
  S.timers.splice(i, 1);
  for (const fn of timerHandlers.get(t.kind) || []) {
    try { fn(t); } catch (e) { console.error(`[Game] timer '${t.kind}' onComplete failed`, e); }
  }
  Game.emit('timer:completed', { timer: t });
  return true;
}
function processTimers() {
  if (!S || !S.timers.length) return;
  const now = Game.now();
  const due = S.timers.filter(t => t.endAt <= now && timerHandlers.has(t.kind));
  if (!due.length) return;
  due.sort((a, b) => a.endAt - b.endAt);
  for (const t of due) completeTimer(t);
}
Game.timers = {
  start({ id, kind, label = '', durationSec = 0, data = null } = {}) {
    if (!S) throw new Error('Game.timers.start called before boot');
    if (!kind) throw new Error('Game.timers.start needs a kind');
    const now = Game.now();
    const tid = id != null && id !== '' ? String(id) : `${kind}-${now.toString(36)}-${++timerSeq}`;
    const old = S.timers.findIndex(t => t.id === tid);
    if (old >= 0) S.timers.splice(old, 1);
    const t = { id: tid, kind: String(kind), label: String(label ?? ''), startAt: now, endAt: now + Math.max(0, Number(durationSec) || 0) * 1000, data: data ?? null };
    S.timers.push(t);
    if (t.endAt <= now) queueMicrotask(processTimers);
    return t;
  },
  onComplete(kind, fn) {
    if (!kind || typeof fn !== 'function') return;
    if (!timerHandlers.has(kind)) timerHandlers.set(kind, []);
    timerHandlers.get(kind).push(fn);
    if (booted) queueMicrotask(processTimers);
  },
  get(id) { return S ? S.timers.find(t => t.id === String(id)) || null : null; },
  list(kind) {
    if (!S) return [];
    return S.timers.filter(t => kind == null || t.kind === kind).sort((a, b) => a.endAt - b.endAt);
  },
  remaining(id) {
    const t = Game.timers.get(id);
    return t ? Math.max(0, Math.ceil((t.endAt - Game.now()) / 1000)) : 0;
  },
  progress(id) {
    const t = Game.timers.get(id);
    if (!t) return 1;
    const total = t.endAt - t.startAt;
    return total <= 0 ? 1 : clamp((Game.now() - t.startAt) / total, 0, 1);
  },
  reduce(id, sec) {
    const t = Game.timers.get(id);
    if (!t) return false;
    t.endAt -= Math.max(0, Number(sec) || 0) * 1000;
    if (t.endAt <= Game.now()) completeTimer(t);
    return true;
  },
  finishNow(id) {
    const t = Game.timers.get(id);
    if (!t) return false;
    t.endAt = Math.min(t.endAt, Game.now());
    return completeTimer(t);
  },
  cancel(id) {
    const t = Game.timers.get(id);
    if (!t) return null;
    S.timers.splice(S.timers.indexOf(t), 1);
    return t;
  },
};

// ---------------------------------------------------------------- screens, navigation, badges
const screens = new Map();
const navs = new Map();
const badges = {};
let currentScreen = null;
let lastTab = 'city';
let pendingNav = null;

Game.registerScreen = (id, def = {}) => {
  if (!id) return;
  const rec = { id: String(id), def: def || {}, el: null, mounted: false };
  const old = screens.get(rec.id);
  if (old?.el) old.el.remove();
  screens.set(rec.id, rec);
  if (booted) {
    mountScreen(rec);
    buildTabbar();
  }
};
Game.registerNav = (prefix, fn) => {
  if (prefix && typeof fn === 'function') navs.set(String(prefix), fn);
};
Game.screen = () => currentScreen;
// Landscape: screens fill the right side and the HUD, tabs and screen tools dock in a left panel.
// core.css uses the same media query; modules move their tools into Game.sideSlot() on 'layout:changed'.
const LANDSCAPE_MQ = typeof matchMedia === 'function' ? matchMedia('(orientation: landscape) and (min-width: 640px)') : null;
Game.isLandscape = () => !!LANDSCAPE_MQ?.matches;
Game.sideSlot = () => document.getElementById('side-slot');
LANDSCAPE_MQ?.addEventListener?.('change', () => Game.emit('layout:changed', { landscape: Game.isLandscape() }));

function tabScreens() {
  return [...screens.values()].filter(r => r.def.tab).sort((a, b) => num(a.def.tab.order ?? 99) - num(b.def.tab.order ?? 99));
}
function firstScreenId() {
  if (screens.has('city')) return 'city';
  return tabScreens()[0]?.id ?? screens.keys().next().value ?? null;
}
function mountScreen(rec) {
  if (rec.mounted) return;
  const host = document.getElementById('screens');
  if (!host) return;
  const sec = document.createElement('section');
  sec.className = 'screen' + (rec.def.fullBleed ? ' full-bleed' : '');
  sec.id = 'screen-' + rec.id;
  sec.dataset.screen = rec.id;
  sec.hidden = true;
  sec.setAttribute('aria-label', rec.def.tab?.label || rec.def.title || rec.id);
  host.appendChild(sec);
  rec.el = sec;
  rec.mounted = true;
  try { rec.def.mount?.(sec); } catch (e) { console.error(`[Game] screen '${rec.id}' failed to mount`, e); }
}
function runScreenUpdate(rec) {
  if (!rec || !rec.el || typeof rec.def.update !== 'function') return;
  try { rec.def.update(rec.el); } catch (e) { reportOnce(`screen '${rec.id}' update`, e); }
}
function showScreen(id) {
  const rec = screens.get(id);
  if (!rec) return false;
  if (!rec.mounted) mountScreen(rec);
  for (const r of screens.values()) if (r.el) r.el.hidden = r.id !== id;
  const changed = currentScreen !== id;
  currentScreen = id;
  if (rec.def.tab) lastTab = id;
  syncTabbar();
  runScreenUpdate(rec);
  if (changed) Game.emit('screen:shown', { id });
  return true;
}
Game.navigate = target => {
  const t = String(target || 'city');
  if (!booted || !isReady) { pendingNav = t; return; }
  closeAllSheets();
  const head = t.split(':')[0];
  let best = null;
  for (const prefix of navs.keys()) {
    if ((t === prefix || t.startsWith(prefix + ':')) && (!best || prefix.length > best.length)) best = prefix;
  }
  const screenId = screens.has(t) ? t : screens.has(head) ? head : null;
  if (screenId) showScreen(screenId);
  else if (!best) showScreen(firstScreenId());
  if (best) {
    const rest = t === best ? '' : t.slice(best.length + 1);
    try { navs.get(best)(rest, t); } catch (e) { console.error(`[Game] nav '${best}' failed`, e); }
  }
  Game.emit('nav', { target: t });
};
Game.back = () => Game.navigate(lastTab || 'city');
Game.badge = (tabId, n) => {
  const v = n === true ? 1 : Math.max(0, Math.floor(Number(n) || 0));
  if ((badges[tabId] || 0) === v) return;
  badges[tabId] = v;
  applyBadge(tabId);
};
Game.badgeCount = tabId => badges[tabId] || 0;
function applyBadge(tabId) {
  const bar = document.getElementById('tabbar');
  const btn = bar?.querySelector(`[data-tab="${CSS.escape(tabId)}"]`);
  if (!btn) return;
  const v = badges[tabId] || 0;
  const dot = btn.querySelector('.badge-dot');
  const sr = btn.querySelector('.tab-sr');
  dot.hidden = v === 0;
  dot.classList.toggle('has-count', v > 1);
  dot.textContent = v > 1 ? (v > 99 ? '99+' : String(v)) : '';
  if (sr) sr.textContent = v ? `, ${v} to claim` : '';
}
function buildTabbar() {
  const bar = document.getElementById('tabbar');
  if (!bar) return;
  const tabs = tabScreens();
  bar.innerHTML = `<div class="tabbar-inner" style="--tabs:${tabs.length || 1}">${tabs.map(r => {
    const tab = r.def.tab;
    return `<button type="button" class="tab" id="tab-${esc(r.id)}" data-tab="${esc(r.id)}"><span class="tab-icon">${Game.icon(tab.icon || 'star', 28)}<span class="badge-dot" aria-hidden="true" hidden></span></span><span class="tab-label">${esc(tab.label || r.id)}</span><span class="sr-only tab-sr"></span></button>`;
  }).join('')}</div>`;
  bar.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => Game.navigate(b.dataset.tab)));
  for (const r of tabs) applyBadge(r.id);
  syncTabbar();
}
function syncTabbar() {
  const bar = document.getElementById('tabbar');
  if (!bar) return;
  bar.querySelectorAll('.tab').forEach(b => {
    if (b.dataset.tab === currentScreen) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

// ---------------------------------------------------------------- overlay layer: sheets
const sheetStack = [];
let sheetSeq = 0;
let zTop = 100;
function layer() {
  let l = document.getElementById('ui-layer');
  if (!l) {
    l = document.createElement('div');
    l.id = 'ui-layer';
    l.className = 'ui-layer';
    (document.getElementById('app') || document.body).appendChild(l);
  }
  return l;
}
function closeAllSheets() {
  for (const h of [...sheetStack].reverse()) h.close();
}
Game.closeSheets = closeAllSheets;

function syncAction(a) {
  const d = a.def;
  let label = '';
  let kind = 'gold';
  let dis = false;
  try {
    label = String((typeof d.label === 'function' ? d.label() : d.label) ?? '');
    kind = String((typeof d.kind === 'function' ? d.kind() : d.kind) || 'gold');
    dis = !!(typeof d.disabled === 'function' ? d.disabled() : d.disabled);
  } catch (e) { reportOnce('sheet action state', e); }
  if (label !== a.label) { a.btn.innerHTML = label; a.label = label; }
  if (kind !== a.kind) { a.btn.className = 'btn ' + kind; a.kind = kind; }
  if (a.btn.disabled !== dis) a.btn.disabled = dis;
}

Game.sheet = (opts = {}) => {
  const n = ++sheetSeq;
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap' + (opts.className ? ' ' + opts.className : '');
  wrap.style.zIndex = String(++zTop);
  wrap.innerHTML = `<div class="sheet-scrim"></div><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-${n}-title" tabindex="-1"><div class="sheet-head"><h2 class="sheet-title" id="sheet-${n}-title"></h2><button type="button" class="sheet-close" aria-label="Close">${Game.icon('close', 18)}</button></div><div class="sheet-body"></div><div class="sheet-actions" hidden></div></section>`;
  const panel = wrap.querySelector('.sheet');
  const body = wrap.querySelector('.sheet-body');
  const actionsEl = wrap.querySelector('.sheet-actions');
  const titleEl = wrap.querySelector('.sheet-title');
  titleEl.textContent = opts.title ?? '';
  if (opts.body instanceof Node) body.appendChild(opts.body);
  else if (opts.body != null) body.innerHTML = String(opts.body);
  const prevFocus = document.activeElement;
  const acts = [];
  let closed = false;
  const handle = {
    el: wrap,
    body,
    panel,
    get closed() { return closed; },
    close,
    refresh,
    setTitle(t) { titleEl.textContent = t ?? ''; },
  };
  function close() {
    if (closed) return;
    const wasTop = sheetStack[sheetStack.length - 1] === handle;
    closed = true;
    const i = sheetStack.indexOf(handle);
    if (i >= 0) sheetStack.splice(i, 1);
    wrap.classList.remove('open');
    wrap.classList.add('closing');
    setTimeout(() => wrap.remove(), Game.reducedMotion ? 0 : 240);
    try { opts.onClose?.(handle); } catch (e) { console.error('[Game] sheet onClose failed', e); }
    if (wasTop && !rewardOpen && prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') {
      try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }
  function refresh() {
    if (closed) return;
    if (typeof opts.update === 'function') {
      try { opts.update(body, handle); } catch (e) { reportOnce(`sheet '${opts.title || ''}' update`, e); }
    }
    if (closed) return;
    for (const a of acts) syncAction(a);
  }
  for (const def of (opts.actions || []).filter(Boolean)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (def.id) btn.dataset.action = def.id;
    const a = { def, btn, label: null, kind: null };
    btn.addEventListener('click', () => {
      if (btn.disabled || closed) return;
      let r;
      try { r = def.onClick?.(handle); } catch (e) { console.error('[Game] sheet action failed', e); }
      if (r === false) refresh();
      else close();
    });
    acts.push(a);
    actionsEl.appendChild(btn);
    syncAction(a);
  }
  actionsEl.hidden = acts.length === 0;
  wrap.querySelector('.sheet-scrim').addEventListener('click', close);
  wrap.querySelector('.sheet-close').addEventListener('click', close);
  layer().appendChild(wrap);
  sheetStack.push(handle);
  refresh();
  void wrap.offsetWidth;
  if (!closed) wrap.classList.add('open');
  try { panel.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  return handle;
};
Game.openSheets = () => sheetStack.slice();

Game.confirmSheet = (o = {}) => {
  let confirmed = false;
  return Game.sheet({
    title: o.title ?? 'Confirm',
    className: 'sheet-confirm',
    body: `<p class="confirm-msg">${o.message ?? ''}</p>`,
    actions: [
      { label: o.cancelLabel ?? 'Cancel', kind: 'ghost', onClick: () => {} },
      {
        label: o.confirmLabel ?? 'Confirm',
        kind: o.kind ?? 'gold',
        onClick: () => {
          confirmed = true;
          try { o.onConfirm?.(); } catch (e) { console.error('[Game] confirm failed', e); }
        },
      },
    ],
    onClose: () => { if (!confirmed) { try { o.onCancel?.(); } catch (e) { console.error(e); } } },
  });
};

// ---------------------------------------------------------------- toasts
function toastHost() {
  let h = document.getElementById('toast-host');
  if (!h) {
    h = document.createElement('div');
    h.id = 'toast-host';
    h.className = 'toast-host';
    h.setAttribute('role', 'status');
    h.setAttribute('aria-live', 'polite');
    layer().appendChild(h);
  }
  return h;
}
Game.toast = (text, kind = 'info') => {
  const k = kind === 'good' || kind === 'bad' ? kind : 'info';
  const t = document.createElement('div');
  t.className = 'toast toast-' + k;
  t.innerHTML = `<span class="toast-icon">${Game.icon(k === 'good' ? 'check' : k === 'bad' ? 'exclaim' : 'info', 14)}</span><span class="toast-text"></span>`;
  const msg = String(text ?? '');
  t.querySelector('.toast-text').textContent = msg;
  t.dataset.msg = k + ':' + msg;
  const host = toastHost();
  // the same message twice in a row (a blizzard warning during a long skip, a double tap) shows once
  for (const old of [...host.children]) if (old.dataset.msg === t.dataset.msg) old.remove();
  host.appendChild(t);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 2600);
};

// ---------------------------------------------------------------- tiles, costs, rewards
function tileHtml({ icon = 'crate', count = '', rarity = '', iconHtml = '', tag = 'div', attrs = '' } = {}) {
  const r = rarity ? ' rarity-' + esc(rarity) : '';
  const c = count !== '' && count != null ? `<span class="tile-count">${esc(count)}</span>` : '';
  return `<${tag} class="tile${r}"${attrs ? ' ' + attrs : ''}>${iconHtml || Game.icon(icon, 32)}${c}</${tag}>`;
}
Game.tileHtml = tileHtml;
Game.itemTileHtml = (id, count) => {
  const d = Game.itemDefs[id] || { icon: 'crate', rarity: '' };
  return tileHtml({ icon: d.icon, rarity: d.rarity || '', count: count == null ? '' : 'x' + Game.fmt(count) });
};
Game.costHtml = (cost, opts = {}) => {
  const { res, items } = costParts(cost);
  const check = opts.check !== false;
  const parts = [];
  for (const [k, v] of Object.entries(res)) {
    const short = check && S && num(S.res[k]) < v;
    parts.push(`<span class="res-chip${short ? ' short' : ''}">${Game.icon(RES_INFO[k].icon, 18)}<span class="res-num">${Game.fmt(v)}</span></span>`);
  }
  for (const [id, v] of Object.entries(items)) {
    const d = Game.itemDefs[id] || { icon: 'crate', name: id };
    const short = check && S && num(S.items[id]) < v;
    parts.push(`<span class="res-chip${short ? ' short' : ''}" title="${esc(d.name)}">${Game.icon(d.icon, 18)}<span class="res-num">x${Game.fmt(v)}</span></span>`);
  }
  return `<span class="cost-list">${parts.join('')}</span>`;
};
function rewardList(r) {
  const out = [];
  if (!isObj(r)) return out;
  const { res, items } = costParts(r);
  for (const [k, v] of Object.entries(res)) out.push({ icon: RES_INFO[k].icon, name: RES_INFO[k].name, count: Game.fmt(v), rarity: k === 'gems' ? 'epic' : '' });
  for (const [id, v] of Object.entries(items)) {
    const d = Game.itemDefs[id] || { icon: 'crate', name: id };
    out.push({ icon: d.icon, name: d.name, count: 'x' + Game.fmt(v), rarity: d.rarity || '' });
  }
  if (Array.isArray(r.custom)) {
    for (const c of r.custom) if (isObj(c)) out.push({ icon: c.icon || 'star', iconHtml: c.iconHtml || '', name: c.name || '', count: c.count ?? '', rarity: c.rarity || '' });
  }
  return out;
}
Game.rewardsHtml = rewards => rewardList(rewards).map(x => `<div class="reward-item">${tileHtml(x)}<div class="reward-name">${esc(x.name)}</div></div>`).join('');

const rewardQueue = [];
let rewardOpen = null;
Game.rewardPopup = (rewards, title = 'Rewards') => {
  const list = rewardList(rewards);
  if (!list.length) return null;
  const job = { rewards, title: title || 'Rewards' };
  if (rewardOpen) { rewardQueue.push(job); return null; }
  return openReward(job);
};
function openReward(job) {
  const prevFocus = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'reward-wrap';
  wrap.style.zIndex = String(Math.max(600, ++zTop));
  wrap.innerHTML = `<div class="sheet-scrim"></div><section class="reward-card" role="dialog" aria-modal="true" aria-labelledby="reward-title" tabindex="-1"><div class="reward-rays" aria-hidden="true"></div><h2 class="reward-title" id="reward-title"></h2><div class="reward-grid">${Game.rewardsHtml(job.rewards)}</div><button type="button" class="btn gold wide reward-ok">OK</button></section>`;
  wrap.querySelector('.reward-title').textContent = job.title;
  let closed = false;
  const handle = {
    el: wrap,
    close() {
      if (closed) return;
      closed = true;
      wrap.remove();
      rewardOpen = null;
      if (rewardQueue.length) openReward(rewardQueue.shift());
      else if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    },
  };
  wrap.querySelector('.reward-ok').addEventListener('click', handle.close);
  wrap.querySelector('.sheet-scrim').addEventListener('click', handle.close);
  layer().appendChild(wrap);
  rewardOpen = handle;
  try { wrap.querySelector('.reward-ok').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  return handle;
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (rewardOpen) { e.preventDefault(); rewardOpen.close(); return; }
  const top = sheetStack[sheetStack.length - 1];
  if (top) { e.preventDefault(); top.close(); }
});

// ---------------------------------------------------------------- not enough gems / resources
Game.needGems = amount => {
  const short = Math.max(0, Math.ceil(num(Number(amount)) - num(S?.res?.gems)));
  return Game.confirmSheet({
    title: 'Not enough Gems',
    message: `You need <b>${Game.fmtFull(short)}</b> more Gems. Get more in the Shop.`,
    confirmLabel: 'Get Gems',
    kind: 'gold',
    onConfirm: () => Game.navigate('shop:gems'),
  });
};

Game.missingSheet = (cost, opts = {}) => {
  const { res, items } = costParts(cost);
  const rows = [];
  for (const [k, need] of Object.entries(res)) rows.push({ key: 'r:' + k, k, need, icon: RES_INFO[k].icon, name: RES_INFO[k].name, rarity: k === 'gems' ? 'epic' : '' });
  for (const [id, need] of Object.entries(items)) {
    const d = Game.itemDefs[id] || { icon: 'crate', name: id };
    rows.push({ key: 'i:' + id, id, need, icon: d.icon, name: d.name, rarity: d.rarity || '', go: d.go });
  }
  const have = r => (r.k ? num(S.res[r.k]) : num(S.items[r.id]));
  const body = el(`<div class="rsheet">
    <p class="rsheet-desc">${esc(opts.message || 'Collect the missing amounts, or use crates from your bag.')}</p>
    ${rows.map(r => {
      const btns = [];
      if (r.k === 'gems') btns.push('<button type="button" class="btn gold small" data-go="shop:gems">Get Gems</button>');
      else if (r.k) {
        if (Game.itemDefs['crate_' + r.k]) btns.push(`<button type="button" class="btn green small" data-crate="${r.k}">Use crate</button>`);
        btns.push(`<button type="button" class="btn blue small" data-go="city:building:${RES_INFO[r.k].building}">Go</button>`);
      } else if (r.go) btns.push(`<button type="button" class="btn blue small" data-go="${esc(r.go)}">Go</button>`);
      return `<div class="rsheet-row card" data-key="${esc(r.key)}">${tileHtml({ icon: r.icon, rarity: r.rarity })}<div><div class="rsheet-row-name">${esc(r.name)}</div><div class="rsheet-row-sub"><span class="ms-have"></span> / ${Game.fmt(r.need)}</div></div><div class="rsheet-row-btns">${btns.join('')}</div></div>`;
    }).join('')}
  </div>`);
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.go) { Game.navigate(b.dataset.go); return; }
    if (b.dataset.crate) {
      const k = b.dataset.crate;
      const row = rows.find(r => r.k === k);
      const short = Math.max(0, row.need - num(S.res[k]));
      const per = Math.max(1, Game.crateAmount(k));
      const n = Math.min(Game.itemCount('crate_' + k), Math.max(1, Math.ceil(short / per)));
      if (n > 0) Game.useItem('crate_' + k, n);
    }
  });
  return Game.sheet({
    title: opts.title || 'Not enough resources',
    body,
    update: bodyEl => {
      for (const r of rows) {
        const row = bodyEl.querySelector(`[data-key="${CSS.escape(r.key)}"]`);
        if (!row) continue;
        const h = have(r);
        const hv = row.querySelector('.ms-have');
        setText(hv, Game.fmt(h));
        hv.className = 'ms-have ' + (h >= r.need ? 'good-text' : 'bad-text');
        const cb = row.querySelector('[data-crate]');
        if (cb) cb.disabled = Game.itemCount('crate_' + r.k) < 1 || h >= r.need;
      }
    },
    actions: opts.actions,
  });
};

// ---------------------------------------------------------------- resource sheet (HUD chips)
Game.resourceSheet = type => {
  if (type === 'gems') { Game.navigate('shop:gems'); return null; }
  const info = RES_INFO[type];
  if (!info) return null;
  const crateId = 'crate_' + type;
  const crate = Game.itemDefs[crateId];
  const body = el(`<div class="rsheet">
    <div class="rsheet-top">${tileHtml({ icon: info.icon })}<div><div class="rsheet-amount" data-amt></div><p class="rsheet-desc">${esc(info.desc)}</p></div></div>
    ${crate ? `<h3 class="section-title">From your bag</h3>
    <div class="rsheet-row card">${tileHtml({ icon: crate.icon, rarity: crate.rarity || '' })}<div><div class="rsheet-row-name">${esc(crate.name)}</div><div class="rsheet-row-sub">Owned <span data-owned></span>. Each gives <span data-each></span>.</div></div><div class="rsheet-row-btns"><button type="button" class="btn green small" data-use="1">Use</button><button type="button" class="btn ghost small" data-use="all">All</button></div></div>` : ''}
  </div>`);
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-use]');
    if (!b || b.disabled) return;
    const n = b.dataset.use === 'all' ? Game.itemCount(crateId) : 1;
    if (n > 0) Game.useItem(crateId, n);
  });
  return Game.sheet({
    title: info.name,
    body,
    update: bodyEl => {
      setText(bodyEl.querySelector('[data-amt]'), Game.fmtFull(S.res[type]));
      if (crate) {
        const owned = Game.itemCount(crateId);
        setText(bodyEl.querySelector('[data-owned]'), Game.fmt(owned));
        setText(bodyEl.querySelector('[data-each]'), Game.fmt(Game.crateAmount(type)));
        bodyEl.querySelectorAll('[data-use]').forEach(b => { b.disabled = owned < 1; });
      }
    },
    actions: [{ label: `Go to ${info.buildingName}`, kind: 'blue', onClick: () => Game.navigate('city:building:' + info.building) }],
  });
};

// ---------------------------------------------------------------- backpack
Game.bagSheet = (group = 'all') => {
  let grp = ITEM_GROUPS.some(g => g.id === group) ? group : 'all';
  let sel = null;
  let qty = 1;
  const body = el(`<div class="bag">
    <div class="seg" role="group" aria-label="Item type">${ITEM_GROUPS.map(g => `<button type="button" data-g="${g.id}" aria-pressed="false">${g.label}</button>`).join('')}</div>
    <div class="bag-grid"></div>
    <p class="bag-empty" hidden></p>
    <div class="bag-detail panel" hidden></div>
  </div>`);
  const grid = body.querySelector('.bag-grid');
  const empty = body.querySelector('.bag-empty');
  const detail = body.querySelector('.bag-detail');
  const owned = () => Object.entries(S.items)
    .filter(([, n]) => num(n) > 0)
    .map(([id, n]) => ({ id, n, def: Game.itemDefs[id] || { id, name: id, icon: 'crate', desc: '' } }))
    .filter(x => grp === 'all' || itemGroup(x.def) === grp)
    .sort(itemSort);
  function render() {
    body.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === grp)));
    const list = owned();
    if (!list.some(x => x.id === sel)) { sel = list[0]?.id ?? null; qty = 1; }
    grid.innerHTML = list.map(x => tileHtml({
      tag: 'button',
      icon: x.def.icon,
      rarity: x.def.rarity || '',
      count: Game.fmt(x.n),
      attrs: `type="button" data-id="${esc(x.id)}" aria-pressed="${x.id === sel}" aria-label="${esc(x.def.name)}, ${Game.fmt(x.n)}"`,
    })).join('');
    grid.hidden = !list.length;
    empty.hidden = !!list.length;
    empty.textContent = grp === 'all' ? 'Your bag is empty. Items from quests, events and the Shop land here.' : 'Nothing of this type yet.';
    renderDetail();
  }
  function renderDetail() {
    const def = sel ? Game.itemDefs[sel] || { id: sel, name: sel, icon: 'crate', desc: '' } : null;
    detail.hidden = !def;
    if (!def) { detail.innerHTML = ''; return; }
    const n = Game.itemCount(sel);
    qty = clamp(qty, 1, Math.max(1, n));
    const usable = typeof def.use === 'function';
    let extra = '';
    if (usable) {
      extra = `<div class="bag-use">${n > 1 ? `<div class="bag-qty"><button type="button" class="icon-btn" data-q="-1" aria-label="One less">${Game.icon('minus', 16)}</button><input type="range" id="bag-qty" min="1" max="${n}" value="${qty}" aria-label="Amount to use"><button type="button" class="icon-btn" data-q="1" aria-label="One more">${Game.icon('plus', 16)}</button><span class="bag-qty-num">${qty}</span></div>` : ''}<div class="bag-actions">${n > 1 ? '<button type="button" class="btn ghost" data-act="max">Max</button>' : ''}${def.go ? '<button type="button" class="btn blue" data-act="go">Go</button>' : ''}<button type="button" class="btn green" data-act="use">Use</button></div></div>`;
    } else if (def.go) {
      extra = `<div class="bag-use"><div class="bag-actions"><button type="button" class="btn blue" data-act="go">Go</button></div></div>`;
    } else if (num(def.speedupSec) > 0) {
      extra = '<p class="bag-hint">Tap Speed up on any running timer to use this.</p>';
    }
    detail.innerHTML = `${tileHtml({ icon: def.icon, rarity: def.rarity || '' })}<div><div class="bag-detail-name${def.rarity ? ' rarity-text rarity-' + esc(def.rarity) : ''}">${esc(def.name)}</div><div class="bag-detail-owned">Owned ${Game.fmtFull(n)}</div><p class="bag-detail-desc">${esc(Game.itemDesc(sel))}</p></div>${extra}`;
  }
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.g) { grp = b.dataset.g; sel = null; render(); return; }
    if (b.dataset.id) { sel = b.dataset.id; qty = 1; render(); return; }
    if (b.dataset.q) {
      qty = clamp(qty + Number(b.dataset.q), 1, Math.max(1, Game.itemCount(sel)));
      const r = detail.querySelector('#bag-qty');
      if (r) r.value = String(qty);
      setText(detail.querySelector('.bag-qty-num'), qty);
      return;
    }
    if (b.dataset.act === 'max') {
      qty = Math.max(1, Game.itemCount(sel));
      const r = detail.querySelector('#bag-qty');
      if (r) r.value = String(qty);
      setText(detail.querySelector('.bag-qty-num'), qty);
      return;
    }
    if (b.dataset.act === 'go') {
      const def = Game.itemDefs[sel];
      if (typeof def?.go === 'function') def.go(); else if (def?.go) Game.navigate(def.go);
      return;
    }
    if (b.dataset.act === 'use') {
      const n = Math.min(qty, Game.itemCount(sel));
      if (n > 0 && Game.useItem(sel, n)) { qty = 1; render(); }
    }
  });
  body.addEventListener('input', e => {
    if (e.target.id !== 'bag-qty') return;
    qty = clamp(Math.floor(Number(e.target.value) || 1), 1, Math.max(1, Game.itemCount(sel)));
    setText(detail.querySelector('.bag-qty-num'), qty);
  });
  let lastSig = '';
  const sig = () => Object.entries(S.items).map(([k, v]) => k + ':' + v).join(',');
  render();
  lastSig = sig();
  return Game.sheet({
    title: 'Backpack',
    body,
    className: 'sheet-bag',
    update: () => {
      const s = sig();
      if (s !== lastSig) { lastSig = s; render(); }
    },
  });
};

// ---------------------------------------------------------------- speed up
Game.speedupSheet = timerId => {
  const t0 = Game.timers.get(timerId);
  if (!t0) { Game.toast('That timer has already finished.'); return null; }
  const id = t0.id;
  const defs = Object.values(Game.itemDefs)
    .filter(d => num(d.speedupSec) > 0 && (!Array.isArray(d.speedupKinds) || d.speedupKinds.includes(t0.kind)))
    .sort((a, b) => a.speedupSec - b.speedupSec);
  const free = () => Game.timers.remaining(id) <= Game.perk('freeFinishSec');
  const manyCount = d => Math.min(Game.itemCount(d.id), Math.ceil(Game.timers.remaining(id) / d.speedupSec));
  const body = el(`<div class="spd">
    <div class="spd-head panel">
      <div class="spd-label"></div>
      <div class="spd-time">${Game.icon('clock', 24)}<span class="spd-remaining"></span></div>
      <div class="progress"><div class="bar"></div></div>
      <div class="spd-hint"></div>
    </div>
    <h3 class="section-title">Speedups</h3>
    <div class="spd-list">${defs.map(d => `<div class="spd-row card" data-id="${esc(d.id)}">${tileHtml({ icon: d.icon, rarity: d.rarity || '' })}<div><div class="spd-name">${esc(d.name)}</div><div class="spd-owned">Owned <span class="spd-n">0</span></div></div><div class="spd-btns"><button type="button" class="btn ghost small" data-use="many" hidden></button><button type="button" class="btn blue small" data-use="one">Use</button></div></div>`).join('')}</div>
    <p class="spd-none" hidden>No speedups in your bag. Earn them from quests and events, or buy them in the Shop.</p>
  </div>`);
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-use]');
    if (!b || b.disabled) return;
    const t = Game.timers.get(id);
    if (!t) return;
    const d = Game.itemDefs[b.closest('.spd-row').dataset.id];
    const n = b.dataset.use === 'many' ? manyCount(d) : Math.min(1, Game.itemCount(d.id));
    if (n < 1 || !Game.spend({ items: { [d.id]: n } }, 'speedup')) return;
    const seconds = d.speedupSec * n;
    Game.timers.reduce(id, seconds);
    Game.emit('item:used', { id: d.id, count: n });
    Game.emit('speedup:used', { seconds, timerId: id, kind: t.kind, itemId: d.id });
    if (Game.timers.get(id)) sheet.refresh();
  });
  const sheet = Game.sheet({
    title: 'Speed up',
    body,
    className: 'sheet-speedup',
    update: (bodyEl, h) => {
      const t = Game.timers.get(id);
      if (!t) { h.close(); return; }
      const rem = Game.timers.remaining(id);
      setText(bodyEl.querySelector('.spd-label'), t.label || 'Timer');
      setText(bodyEl.querySelector('.spd-remaining'), Game.fmtTime(rem));
      bodyEl.querySelector('.bar').style.width = (Game.timers.progress(id) * 100).toFixed(1) + '%';
      const fs = Game.perk('freeFinishSec');
      setText(bodyEl.querySelector('.spd-hint'), rem <= fs ? 'Inside the free-finish window. Finish it now at no cost.' : `Free finish when ${Game.fmtTime(fs)} or less remain.`);
      let total = 0;
      bodyEl.querySelectorAll('.spd-row').forEach(row => {
        const d = Game.itemDefs[row.dataset.id];
        const have = Game.itemCount(d.id);
        total += have;
        setText(row.querySelector('.spd-n'), Game.fmt(have));
        row.classList.toggle('is-empty', have < 1);
        row.querySelector('[data-use="one"]').disabled = have < 1;
        const many = row.querySelector('[data-use="many"]');
        const m = manyCount(d);
        many.hidden = m < 2;
        if (m >= 2) {
          setText(many, 'x' + m);
          many.setAttribute('aria-label', `Use ${m}`);
        }
      });
      bodyEl.querySelector('.spd-none').hidden = total > 0;
    },
    actions: [{
      id: 'finish',
      label: () => (free()
        ? `${Game.icon('check', 18)}<span>Free</span>`
        : `<span>Finish now</span><span class="btn-cost">${Game.icon('gem', 18)}${Game.fmtFull(Game.gemCostForSeconds(Game.timers.remaining(id)))}</span>`),
      kind: () => (free() ? 'green' : 'gold'),
      onClick: () => {
        const t = Game.timers.get(id);
        if (!t) return undefined;
        const rem = Game.timers.remaining(id);
        if (rem <= Game.perk('freeFinishSec')) {
          Game.timers.finishNow(id);
          Game.emit('speedup:used', { seconds: rem, timerId: id, kind: t.kind, free: true });
          return undefined;
        }
        const cost = Game.gemCostForSeconds(rem);
        if (!Game.spend({ gems: cost }, 'speedup')) { Game.needGems(cost); return false; }
        Game.timers.finishNow(id);
        Game.emit('speedup:used', { seconds: rem, timerId: id, kind: t.kind, gems: cost });
        return undefined;
      },
    }],
  });
  return sheet;
};

// ---------------------------------------------------------------- HUD
const hudEls = {};
const hudNarrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 374px)') : null;
let shownPower = -1;
let shownAvatar = null;
function buildHud() {
  const hud = document.getElementById('hud');
  if (!hud) return;
  // one compact band: avatar | power + gems over the four resources | backpack
  hud.innerHTML = `<div class="hud-inner">
    <button type="button" class="hud-avatar" id="hud-avatar" aria-label="Chief profile"><span class="hud-avatar-img"></span><span class="hud-flv" title="Furnace level">${Game.icon('flame', 10)}<span class="hud-flv-num">1</span><span class="sr-only"> Furnace level</span></span></button>
    <div class="hud-main">
      <div class="hud-row">
        <div class="hud-power"><span class="sr-only" id="hud-name"></span>${Game.icon('power', 15)}<span class="sr-only">Power </span><span class="hud-power-num" id="hud-power">0</span></div>
        <button type="button" class="hud-gems" id="hud-gems">${Game.icon('gem', 16)}<span class="sr-only">Gems </span><span class="hud-gem-num" id="hud-gem-num">0</span><span class="hud-plus">${Game.icon('plus', 12)}<span class="sr-only"> Get more</span></span></button>
      </div>
      <div class="hud-res">${RES.map(r => `<button type="button" class="res-chip" id="hud-res-${r}" data-res="${r}">${Game.icon(RES_INFO[r].icon, 16)}<span class="sr-only">${RES_INFO[r].name} </span><span class="res-num">0</span></button>`).join('')}</div>
    </div>
    <button type="button" class="hud-iconbtn" id="hud-bag" aria-label="Backpack">${Game.icon('bag', 24)}</button>
  </div>`;
  hudEls.avatar = hud.querySelector('.hud-avatar-img');
  hudEls.flv = hud.querySelector('.hud-flv-num');
  hudEls.name = hud.querySelector('#hud-name');
  hudEls.power = hud.querySelector('#hud-power');
  hudEls.powerWrap = hud.querySelector('.hud-power');
  hudEls.gems = hud.querySelector('#hud-gem-num');
  hudEls.res = {};
  for (const r of RES) hudEls.res[r] = hud.querySelector(`#hud-res-${r} .res-num`);
  hud.querySelector('#hud-avatar').addEventListener('click', () => Game.navigate('profile'));
  hud.querySelector('#hud-gems').addEventListener('click', () => Game.navigate('shop:gems'));
  hud.querySelector('#hud-bag').addEventListener('click', () => Game.bagSheet());
  hud.querySelectorAll('.hud-res .res-chip').forEach(b => b.addEventListener('click', () => Game.resourceSheet(b.dataset.res)));
  const app = document.getElementById('app');
  const setH = () => { if (app) app.style.setProperty('--hud-h', hud.offsetHeight + 'px'); };
  setH();
  if (typeof ResizeObserver === 'function') new ResizeObserver(setH).observe(hud);
  else window.addEventListener('resize', setH);
}
function updateHud() {
  if (!S || !hudEls.power) return;
  const p = Game.power();
  if (p !== shownPower) {
    if (shownPower >= 0 && p > shownPower && !Game.reducedMotion) {
      hudEls.powerWrap.querySelector('.hud-power-float')?.remove();
      const f = document.createElement('span');
      f.className = 'hud-power-float';
      f.setAttribute('aria-hidden', 'true');
      f.textContent = '+' + Game.fmt(p - shownPower);
      hudEls.powerWrap.appendChild(f);
      setTimeout(() => f.remove(), 1500);
    }
    shownPower = p;
    setText(hudEls.power, p < 1e7 ? Game.fmtFull(p) : Game.fmt(p));
  }
  // narrow phones only fit about four characters per chip, so 1,000+ shows as 9.9K there (floored, never rounding up)
  const narrow = hudNarrow?.matches;
  for (const r of RES) {
    const n = Math.max(0, Number(S.res[r]) || 0);
    setText(hudEls.res[r], narrow && n >= 1000 && n < 1e5 ? (Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'K' : Game.fmt(n));
  }
  const g = num(S.res.gems);
  setText(hudEls.gems, g < 1e5 ? Game.fmtFull(g) : Game.fmt(g));
  setText(hudEls.name, S.meta.chiefName);
  setText(hudEls.flv, Game.furnaceLevel());
  if (shownAvatar !== S.meta.avatar) {
    shownAvatar = S.meta.avatar;
    hudEls.avatar.innerHTML = Game.avatarSvg(S.meta.avatar, 42);
  }
}
Game.refreshHud = updateHud;

// ---------------------------------------------------------------- loop, save, day reset
let lastPerf = 0;
let lastWall = 0;
let lastSave = 0;
let loopTimer = null;
function tickModules(dt, now) {
  for (const m of modules) {
    if (typeof m.tick !== 'function') continue;
    try { m.tick(dt, now); } catch (e) { reportOnce(`${m.id}.tick`, e); }
  }
}
function runOffline(sec) {
  if (!(sec > 0)) return;
  for (const m of modules) {
    if (typeof m.offline !== 'function') continue;
    try { m.offline(sec); } catch (e) { console.error(`[Game] ${m.id}.offline failed`, e); }
  }
}
function checkDay() {
  if (!S) return;
  const k = todayKey();
  if (S.meta.day !== k) {
    const prev = S.meta.day;
    S.meta.day = k;
    Game.emit('day:reset', { day: k, prev });
  }
}
function render() {
  if (!booted) return;
  updateHud();
  runScreenUpdate(screens.get(currentScreen));
  for (const h of [...sheetStack]) h.refresh();
}
Game.render = render;
function frame() {
  if (!S) return;
  const p = performance.now();
  let dt = (p - lastPerf) / 1000;
  lastPerf = p;
  const now = Game.now();
  const gap = (now - lastWall) / 1000;
  lastWall = now;
  if (gap > 20 || dt > 20) {
    // the page was suspended or the clock moved: settle timers, then hand the gap to offline()
    processTimers();
    runOffline(Math.min(OFFLINE_CAP_SEC, Math.max(gap, dt)));
    dt = TICK_MS / 1000;
  }
  tickModules(clamp(dt, 0, 5), now);
  processTimers();
  checkDay();
  S.meta.lastSeen = Game.now();
  if (!document.hidden) render();
  if (p - lastSave >= AUTOSAVE_MS) save();
}
function save() {
  lastSave = performance.now();
  if (!S || noSave) return false;
  S.meta.lastSeen = Game.now();
  let json;
  try { json = JSON.stringify(S); } catch (e) { reportOnce('save', e); return false; }
  return Game.storage.set(SAVE_KEY, json);
}
Game.save = save;
Game.saveKey = SAVE_KEY;

// ---------------------------------------------------------------- boot
Game.boot = (d = {}) => {
  if (booted) return;
  booted = true;
  const data = isObj(d) ? d : {};
  const src = isObj(data.state) ? data.state : loadSaved();
  try { buildState(src); } catch (e) {
    console.error('[Game] saved game could not be loaded, starting a new game', e);
    buildState(null);
  }
  Game.isNew = isNewGame;
  const now = Game.now();
  const elapsed = isNewGame ? 0 : Math.min(OFFLINE_CAP_SEC, Math.max(0, (now - num(S.meta.lastSeen)) / 1000));
  processTimers();
  runOffline(elapsed);
  if (isNewGame) Game.emit('game:new', {});
  checkDay();
  buildHud();
  toastHost();
  for (const rec of screens.values()) mountScreen(rec);
  buildTabbar();
  showScreen(firstScreenId());
  isReady = true;
  Game.isReady = true;
  Game.emit('ready', {});
  updateHud();
  if (pendingNav) {
    const t = pendingNav;
    pendingNav = null;
    Game.navigate(t);
  }
  S.meta.lastSeen = Game.now();
  lastPerf = performance.now();
  lastWall = Game.now();
  lastSave = lastPerf;
  loopTimer = setInterval(frame, TICK_MS);
  save();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else frame();
  });
  window.addEventListener('pagehide', save);
};
