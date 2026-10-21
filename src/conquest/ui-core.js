/* Age of Conquest interface: shared helpers, icons, sheets, toasts and reward pop-ups, the simulation host (a Web
   Worker with an on-page fallback), saves (IndexedDB, gzip), developer mode, the start and new-world screens and the
   main shell with its tabs. Screens are registered by the other ui-*.js files through window.AOCUI. Uses the engine
   (window.AOC) only for static data and terrain; all game state comes from the simulation host. */

const A = window.AOC;
const U = (window.AOCUI = window.AOCUI || {});
const SAVE_DB = 'last-furnace-conquest';
const SAVE_LS = 'last-furnace-conquest-save';
// browser storage that never throws (blocked storage, private windows)
const LS = {
  get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { window.localStorage.setItem(key, String(value)); return true; } catch (e) { return false; } },
  remove(key) { try { window.localStorage.removeItem(key); } catch (e) { /* storage unavailable */ } },
};
U.LS = LS;
// developer mode belongs to this device: 7 quick taps on the logo of the start screen turn it on or off
const DEV_KEY = 'last-furnace-dev';
let devMem = null;
U.devMode = () => devMem ?? LS.get(DEV_KEY) === '1';
U.setDevMode = on => { devMem = !!on; LS.set(DEV_KEY, devMem ? '1' : '0'); };

// ================================================================ helpers
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function el(html) { const t = document.createElement('template'); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
function fmt(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a < 10000) return s + Math.floor(a).toLocaleString('en-US');
  for (const [v, u] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) if (a >= v) { const x = a / v; return s + (x < 100 ? Math.floor(x * 10) / 10 : Math.floor(x)) + u; }
  return s + Math.floor(a);
}
const full = n => Math.floor(Number(n) || 0).toLocaleString('en-US');
// game minutes as a duration
function dur(min) {
  min = Math.max(0, Math.ceil(Number(min) || 0));
  if (min < 60) return min + 'm';
  if (min < 1440) return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
}
// game minutes in real time at 1x (1 game minute = 1 real second)
function realDur(min) { const s = Math.max(0, Math.round(min)); return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`; }
function ago(t) { const F = U.F; if (!F) return ''; const d = F.t - t; return d < 1 ? 'just now' : dur(d) + ' ago'; }
const setText = (node, t) => { if (node && node.textContent !== String(t)) node.textContent = String(t); };
const setHtml = (node, h) => { if (node && node._h !== h) { node.innerHTML = h; node._h = h; } };
Object.assign(U, { esc, el, fmt, full, dur, realDur, ago, setText, setHtml });

// ================================================================ icons (24x24, drawn here)
const ICONS = {
  food: '<path d="M12 21V9M12 9c-2.5-.5-4-2.3-4-5 2.6.3 4 2.1 4 5Zm0 0c2.5-.5 4-2.3 4-5-2.6.3-4 2.1-4 5Zm0 5c-2.6-.5-4.2-2.4-4.2-5 2.7.3 4.2 2.2 4.2 5Zm0 0c2.6-.5 4.2-2.4 4.2-5-2.7.3-4.2 2.2-4.2 5Zm0 5c-2.4-.4-4-2.2-4-4.6 2.5.3 4 2 4 4.6Zm0 0c2.4-.4 4-2.2 4-4.6-2.5.3-4 2-4 4.6Z" fill="#e8c46a" stroke="#8a6420" stroke-width="1" stroke-linejoin="round"/>',
  wood: '<rect x="3" y="12" width="18" height="5" rx="2.5" fill="#a8723f" stroke="#5b3a1c" stroke-width="1.1"/><rect x="5" y="6.5" width="14" height="5" rx="2.5" fill="#bf8549" stroke="#5b3a1c" stroke-width="1.1"/><circle cx="18.5" cy="14.5" r="1.6" fill="#e6c08c" stroke="#5b3a1c" stroke-width=".8"/><circle cx="16.5" cy="9" r="1.6" fill="#e6c08c" stroke="#5b3a1c" stroke-width=".8"/>',
  stone: '<path d="M3.5 17.5 6 9.5l6-3 6 2.5 2.5 8.5-8.5 2Z" fill="#9aa0a6" stroke="#4b5056" stroke-width="1.1" stroke-linejoin="round"/><path d="M6 9.5 12 12l6-3M12 12v7.5" fill="none" stroke="#4b5056" stroke-width="1"/>',
  iron: '<path d="M4 15.5 7 9h10l3 6.5Z" fill="#8c98a8" stroke="#3d4652" stroke-width="1.1" stroke-linejoin="round"/><path d="M7.6 9 9 6.5h6L16.4 9" fill="#b7c2cf" stroke="#3d4652" stroke-width="1.1" stroke-linejoin="round"/><path d="M4 15.5h16v2H4Z" fill="#6b7685" stroke="#3d4652" stroke-width="1"/>',
  gold: '<circle cx="12" cy="12" r="8" fill="#f0c94f" stroke="#8a6214" stroke-width="1.2"/><circle cx="12" cy="12" r="5.3" fill="none" stroke="#b9861f" stroke-width="1"/><path d="M12 8.6v6.8M10 10.2h3.2a1.2 1.2 0 0 1 0 2.4h-2.4a1.2 1.2 0 0 0 0 2.4H14" fill="none" stroke="#8a6214" stroke-width="1.1" stroke-linecap="round"/>',
  power: '<path d="M5 19 15.5 8.5M15.5 8.5l1-4 3 3-4 1M19 19 8.5 8.5M8.5 8.5l-1-4-3 3 4 1" fill="none" stroke="#d8a657" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 4v13.5M15 6.5V20" stroke="currentColor" stroke-width="1.6"/>',
  city: '<path d="M3 20h18M5 20V10l3.5-3L12 10v10M12 20v-7h7v7M15.5 13v-3h1.5v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 13v2.5" stroke="currentColor" stroke-width="1.8"/>',
  army: '<path d="M12 3.5c-3.6 0-6 2.6-6 6.2V14l6 6.5 6-6.5V9.7c0-3.6-2.4-6.2-6-6.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 10.5h6M12 7v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  guild: '<path d="M6 3.5v17M6 4.5h11.5l-2.5 4 2.5 4H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
  report: '<rect x="3.5" y="6" width="17" height="12.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-3M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7M7 4a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 11h6M9 14.5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  ranks: '<path d="M4 20V13h4v7M10 20V8h4v12M16 20v-9h4v9M3 20h18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  close: '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  play: '<path d="M8 5.2v13.6L18.8 12Z" fill="currentColor"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  sword: '<path d="M14.5 4H20v5.5L10 19.5 4.5 14Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m4 20 3-3M7.5 13 11 16.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  pick: '<path d="M4 20 14 10M9.5 4.5c3.5-1.5 7.4-.7 10 2-2.4-1.2-5.3-1.2-7.5.3M19.5 14.5c1.5-3.5.7-7.4-2-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  flag: '<path d="M6 21V4M6 4.5h11l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  home: '<path d="M4 11.5 12 5l8 6.5M6.5 9.5V19h11V9.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  layers: '<path d="m12 4 9 4.5-9 4.5-9-4.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m3 13 9 4.5 9-4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  search: '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  gate: '<path d="M3 20V7h4v2h2V7h6v2h2V7h4v13h-6v-5a3 3 0 0 0-6 0v5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  temple: '<path d="M3 9.5 12 4l9 5.5ZM4.5 20h15M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>',
  globe: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 12h17M12 3.5c-2.6 2.4-3.6 5.3-3.6 8.5s1 6.1 3.6 8.5c2.6-2.4 3.6-5.3 3.6-8.5S14.6 5.9 12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  minus: '<path d="M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  clock: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  crown: '<path d="M4 18h16l1-10-5 4-4-6-4 6-5-4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  castle: '<path d="M4 20V8h3v2h3V8h4v2h3V8h3v12Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 20v-4h4v4" stroke="currentColor" stroke-width="1.7"/>',
  inf: '<path d="M14.5 4H20v5.5L10 19.5 4.5 14Z" fill="#9aa7b3" stroke="#3d4652" stroke-width="1.2" stroke-linejoin="round"/><path d="m4 20 3-3" stroke="#6b4a2a" stroke-width="2.2" stroke-linecap="round"/>',
  cav: '<path d="M6 20c0-4 1.5-6.5 4-8-1-1.5-1.2-3.3-.5-5 2.2.4 3.8 1.8 4.5 3.6l3 .9-.6 2.5-2.7-.6c.5 2.2.3 4.4-.7 6.6" fill="#b0855a" stroke="#4f3519" stroke-width="1.2" stroke-linejoin="round"/>',
  arc: '<path d="M7 3.5c6 3 6 14 0 17" fill="none" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/><path d="M7 3.5v17M5 12h14m-3-3 3 3-3 3" fill="none" stroke="#3d4652" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  sie: '<path d="M4 17h14M6 17l7-9 6 3" fill="none" stroke="#6b4a2a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="19" r="2" fill="#9aa7b3" stroke="#3d4652"/><circle cx="16" cy="19" r="2" fill="#9aa7b3" stroke="#3d4652"/><circle cx="19.5" cy="9.5" r="2" fill="#7f868d" stroke="#3d4652"/>',
  gear: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8Z" fill="currentColor"/>',
  back: '<path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  replay: '<path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 4v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 9.5v5l4-2.5Z" fill="currentColor"/>',
  tent: '<path d="M3 19 12 5l9 14Z" fill="#a4483a" stroke="#4d1c14" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 19 9.5 13h5Z" fill="#2a120e"/>',
  ruin: '<path d="M4 20h16M6 20V9M10 20v-7M14 20V11M18 20V8M5 9h3M13 11h3M17 8h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  hammer: '<path d="m13.5 9.5-9 9 2 2 9-9" fill="#8a5a2b" stroke="#3a2412" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 6.5 15 2.5l6.5 6.5-4 4Z" fill="#b6c3cf" stroke="#3d4652" stroke-width="1.2" stroke-linejoin="round"/>',
  herb: '<path d="M12 21c0-6 1-10 6-15-6 1-10 5-10 10 0 2 1.5 3.5 4 5Z" fill="#6fc35f" stroke="#245a1c" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 21c-.5-4 1-8 4-11" fill="none" stroke="#245a1c" stroke-width="1.1" stroke-linecap="round"/>',
  up: '<path d="M12 3.5 20 12h-5v8.5H9V12H4Z" fill="#5fd35a" stroke="#173d14" stroke-width="1.3" stroke-linejoin="round"/>',
  next: '<path d="M4 12h13M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.4" fill="currentColor"/>',
  dev: '<path d="M14.6 3.4a5 5 0 0 0-5.9 6.5L3.6 15a2 2 0 0 0 0 2.8l2.6 2.6a2 2 0 0 0 2.8 0l5.1-5.1a5 5 0 0 0 6.5-5.9l-3 3-3-.6-.6-3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
};
// the illustrated icons of the Last Furnace style (colour fills), and a few of the game's own
Object.assign(ICONS, {
  city: "<path d=\"M5 21.5 6.5 9.5h11L19 21.5Z\" fill=\"#6e7a88\" stroke=\"#2f3946\" stroke-width=\"1\" stroke-linejoin=\"round\"/><path d=\"M6.9 13.2h10.2M6.4 17.2h11.2M10 9.5v3.7M14 13.2v4M10.2 17.2v4.3\" stroke=\"#56616e\" stroke-width=\".9\"/><path d=\"M9.5 21.5v-3.2a2.5 2.5 0 0 1 5 0v3.2Z\" fill=\"#ffb347\" stroke=\"#a8480c\" stroke-width=\".9\"/><rect x=\"5.5\" y=\"7.6\" width=\"13\" height=\"2.4\" rx=\".6\" fill=\"#8a96a5\" stroke=\"#2f3946\" stroke-width=\"1\"/><path d=\"M5.6 8.2c1.5-.9 3-.9 4.4-.2 1.4-.7 2.8-.6 4.2.1 1.4-.7 2.9-.6 4.2.1V7.6H5.6Z\" fill=\"#f4f9ff\"/><path d=\"M12 1.6c.5 1.7 2.8 2.6 2.8 4.6a2.8 2.8 0 0 1-5.6 0c0-1 .6-1.7 1.1-2.2.1.7.4 1.1.9 1.3-.2-1.3.3-2.6.8-3.7Z\" fill=\"#ff8a2a\" stroke=\"#a83a0c\" stroke-width=\".6\"/>",
  map: "<path d=\"M3 6l5.5-2 7 2.5L21 4.5v13.5l-5.5 2-7-2.5L3 19.5Z\" fill=\"#e8d3a2\" stroke=\"#7b6236\" stroke-width=\"1\" stroke-linejoin=\"round\"/><path d=\"M8.5 4v13.5M15.5 6.5V20\" stroke=\"#c4aa72\" stroke-width=\"1\"/><path d=\"M5.5 15.5c2-.5 2.8-3 5-3.5s3.6 1.2 5.5-.5\" fill=\"none\" stroke=\"#c0392b\" stroke-width=\"1.3\" stroke-dasharray=\"1.6 1.4\" stroke-linecap=\"round\"/><path d=\"M16.6 7.6l2.6 2.6M19.2 7.6l-2.6 2.6\" stroke=\"#c0392b\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
  sword: "<path d=\"M19.8 2.8 21.2 4.2 10.4 15 9 13.6Z\" fill=\"#dfe8ef\" stroke=\"#5b6b7c\" stroke-width=\"1\" stroke-linejoin=\"round\"/><path d=\"M20.5 3.5 9.7 14.3\" stroke=\"#a9b8c6\" stroke-width=\".7\"/><path d=\"M6.6 12.4 11.6 17.4\" stroke=\"#9a6512\" stroke-width=\"3.2\" stroke-linecap=\"round\"/><path d=\"M6.6 12.4 11.6 17.4\" stroke=\"#f2c04e\" stroke-width=\"1.8\" stroke-linecap=\"round\"/><path d=\"M8.4 15.6 5.6 18.4\" stroke=\"#6b3f1d\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><circle cx=\"4.7\" cy=\"19.3\" r=\"1.6\" fill=\"#f2c04e\" stroke=\"#9a6512\" stroke-width=\".8\"/>",
  shield: "<path d=\"M12 2.5 19.5 5.2v6.3c0 4.9-3.2 8.4-7.5 10-4.3-1.6-7.5-5.1-7.5-10V5.2Z\" fill=\"#2d6cc0\" stroke=\"#dbe5ee\" stroke-width=\"1.5\" stroke-linejoin=\"round\"/><path d=\"M12 5v14.2M7 10.6h10\" stroke=\"#f2c04e\" stroke-width=\"1.9\" stroke-linecap=\"round\"/><path d=\"M12 2.5 19.5 5.2v6.3c0 4.9-3.2 8.4-7.5 10Z\" fill=\"#163f78\" opacity=\".35\"/>",
  mail: "<rect x=\"2.5\" y=\"5.5\" width=\"19\" height=\"13.5\" rx=\"1.6\" fill=\"#f1e7d2\" stroke=\"#7c6a4f\" stroke-width=\"1\"/><path d=\"M3.2 6.6 12 13.4l8.8-6.8\" fill=\"none\" stroke=\"#a8946f\" stroke-width=\"1.3\" stroke-linejoin=\"round\"/><circle cx=\"12\" cy=\"13.4\" r=\"2.5\" fill=\"#d8433b\" stroke=\"#7c1b16\" stroke-width=\".8\"/>",
  gift: "<rect x=\"3.5\" y=\"10\" width=\"17\" height=\"10.5\" rx=\"1\" fill=\"#d8433b\" stroke=\"#7c1b16\" stroke-width=\"1\"/><rect x=\"2.5\" y=\"7.2\" width=\"19\" height=\"3.6\" rx=\"1\" fill=\"#ef5a4f\" stroke=\"#7c1b16\" stroke-width=\"1\"/><path d=\"M12 7.2v13.3\" stroke=\"#f5c548\" stroke-width=\"2.6\"/><path d=\"M3.5 13.5h17\" stroke=\"#b8322b\" stroke-width=\".8\" opacity=\".6\"/><path d=\"M12 7c-1.2-3.4-5.4-4.4-5.6-2.1C6.2 7 9.8 7.2 12 7Zm0 0c1.2-3.4 5.4-4.4 5.6-2.1C17.8 7 14.2 7.2 12 7Z\" fill=\"#f5c548\" stroke=\"#9a6512\" stroke-width=\".9\" stroke-linejoin=\"round\"/>",
  calendar: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\" fill=\"#edf2f7\" stroke=\"#4d5d70\" stroke-width=\"1\"/><path d=\"M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3Z\" fill=\"#d8433b\"/><path d=\"M8 3v4M16 3v4\" stroke=\"#3a4656\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M5.8 12.4h2.6v2.4H5.8zM10.7 12.4h2.6v2.4h-2.6zM15.6 12.4h2.6v2.4h-2.6zM5.8 16.6h2.6V19H5.8zM10.7 16.6h2.6V19h-2.6z\" fill=\"#9aa8b8\"/><path d=\"M15.4 17.6l1.2 1.2 2.2-2.4\" fill=\"none\" stroke=\"#2fae55\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
  crown: "<path d=\"M3.5 18 2.5 7.5l5.2 4.3L12 4.5l4.3 7.3 5.2-4.3-1 10.5Z\" fill=\"#ffc93f\" stroke=\"#9a6512\" stroke-width=\"1\" stroke-linejoin=\"round\"/><rect x=\"3.5\" y=\"18\" width=\"17\" height=\"2.6\" rx=\".8\" fill=\"#e0a52c\" stroke=\"#9a6512\" stroke-width=\"1\"/><circle cx=\"12\" cy=\"14\" r=\"1.6\" fill=\"#e2483d\"/><circle cx=\"7.4\" cy=\"15\" r=\"1.05\" fill=\"#4fd2f0\"/><circle cx=\"16.6\" cy=\"15\" r=\"1.05\" fill=\"#4fd2f0\"/>",
  trophy: "<path d=\"M7 5H4.5v1.5A3.5 3.5 0 0 0 8 10M17 5h2.5v1.5A3.5 3.5 0 0 1 16 10\" fill=\"none\" stroke=\"#9a6512\" stroke-width=\"1.5\"/><path d=\"M7 3.5h10v5a5 5 0 0 1-10 0Z\" fill=\"#ffc93f\" stroke=\"#9a6512\" stroke-width=\"1\"/><path d=\"M9 5v3.4\" stroke=\"#fff1c2\" stroke-width=\"1.1\" stroke-linecap=\"round\"/><path d=\"M10.5 13.2h3v3.3h-3z\" fill=\"#e0a52c\"/><rect x=\"7.5\" y=\"16.5\" width=\"9\" height=\"4\" rx=\"1\" fill=\"#8a5a32\" stroke=\"#4f2d10\" stroke-width=\"1\"/>",
  chest: "<path d=\"M3.5 11h17v8.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z\" fill=\"#9b5f2a\" stroke=\"#4f2d10\" stroke-width=\"1\"/><path d=\"M3.5 11V9.5C3.5 6.5 6 4 9 4h6c3 0 5.5 2.5 5.5 5.5V11Z\" fill=\"#b8763a\" stroke=\"#4f2d10\" stroke-width=\"1\"/><path d=\"M6 6.6c1-1.2 2.1-1.6 3.4-1.6\" stroke=\"#e0a865\" stroke-width=\"1\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M3.5 11h17\" stroke=\"#f0c04c\" stroke-width=\"2\"/><path d=\"M8 4.3v16.2M16 4.3v16.2\" stroke=\"#f0c04c\" stroke-width=\"1.6\"/><rect x=\"10.2\" y=\"9.4\" width=\"3.6\" height=\"4.8\" rx=\".8\" fill=\"#ffd862\" stroke=\"#8a5a12\" stroke-width=\".8\"/><circle cx=\"12\" cy=\"11.6\" r=\".75\" fill=\"#4f2d10\"/>",
  hammer: "<g transform=\"rotate(40 12 12)\"><rect x=\"10.6\" y=\"8.5\" width=\"2.8\" height=\"13.5\" rx=\"1.4\" fill=\"#9a6838\" stroke=\"#4f300f\" stroke-width=\"1\"/><rect x=\"5.5\" y=\"3\" width=\"13\" height=\"5.8\" rx=\"1.2\" fill=\"#b6c3cf\" stroke=\"#46566a\" stroke-width=\"1\"/><path d=\"M6.6 4.4h10.8\" stroke=\"#e4ecf3\" stroke-width=\".9\" stroke-linecap=\"round\"/></g>",
  star: "<path d=\"M12.00 3.00L14.47 9.20L21.13 9.63L15.99 13.90L17.64 20.37L12.00 16.80L6.36 20.37L8.01 13.90L2.87 9.63L9.53 9.20Z\" fill=\"#ffcf3f\" stroke=\"#a3640c\" stroke-width=\"1.1\" stroke-linejoin=\"round\"/><path d=\"M9.6 9.3l1.6-3\" stroke=\"#fff3c4\" stroke-width=\"1.1\" stroke-linecap=\"round\"/>",
  check: "<path d=\"M5 12.5 10 17.5 19 7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
  lock: "<path d=\"M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\"/><path fill-rule=\"evenodd\" d=\"M5.5 10.5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm6.5 3.2a1.5 1.5 0 0 0-.8 2.8V18h1.6v-1.5a1.5 1.5 0 0 0-.8-2.8Z\" fill=\"currentColor\"/>",
  arrow_up: "<path d=\"M12 3.2 20.2 12H15v8.8H9V12H3.8Z\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linejoin=\"round\"/>",
  power: "<path d=\"M13.8 2 4.8 13.6h5.9L9.2 22l10-12.6h-6.1Z\" fill=\"#ffc533\" stroke=\"#a35a0c\" stroke-width=\"1.1\" stroke-linejoin=\"round\"/><path d=\"M12.4 5 8.2 10.6\" stroke=\"#fff3c4\" stroke-width=\"1.1\" stroke-linecap=\"round\"/>",
  flame: "<path d=\"M12 2.5c.8 3.4 5.8 5.6 5.8 11.2A5.8 5.8 0 0 1 6.2 13.7c0-2.9 1.6-4.7 2.8-5.8.1 1.8.9 2.9 2.1 3.6C10.6 8.6 11.2 5.6 12 2.5Z\" fill=\"#ff7a2a\" stroke=\"#a83a0c\" stroke-width=\"1\" stroke-linejoin=\"round\"/><path d=\"M12 10.3c.5 2 3.2 3.2 3.2 6.1a3.2 3.2 0 0 1-6.4 0c0-1.4.8-2.5 1.5-3.1.1.9.5 1.5 1.1 1.8-.2-1.6.1-3.1.6-4.8Z\" fill=\"#ffd34d\"/>",
  info: "<circle cx=\"12\" cy=\"12\" r=\"8.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M12 10.8v5.6\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"7.4\" r=\"1.4\" fill=\"currentColor\"/>",
  settings: "<path fill-rule=\"evenodd\" d=\"M18.93 9.39L21.80 10.01L21.80 13.99L18.93 14.61L18.74 15.05L20.33 17.53L17.53 20.33L15.05 18.74L14.61 18.93L13.99 21.80L10.01 21.80L9.39 18.93L8.95 18.74L6.47 20.33L3.67 17.53L5.26 15.05L5.07 14.61L2.20 13.99L2.20 10.01L5.07 9.39L5.26 8.95L3.67 6.47L6.47 3.67L8.95 5.26L9.39 5.07L10.01 2.20L13.99 2.20L14.61 5.07L15.05 5.26L17.53 3.67L20.33 6.47L18.74 8.95ZM12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4Z\" fill=\"currentColor\"/>",
  bag: "<path d=\"M9 5.8V4.6a3 3 0 0 1 6 0v1.2\" fill=\"none\" stroke=\"#5c3818\" stroke-width=\"1.7\"/><rect x=\"4.5\" y=\"5.6\" width=\"15\" height=\"16\" rx=\"3.5\" fill=\"#99633a\" stroke=\"#4f2d10\" stroke-width=\"1\"/><path d=\"M4.5 10.6c0-2 1.6-3.4 3.6-3.4h7.8c2 0 3.6 1.4 3.6 3.4V12H4.5Z\" fill=\"#b97c45\" stroke=\"#4f2d10\" stroke-width=\"1\"/><rect x=\"7.5\" y=\"14.2\" width=\"9\" height=\"5\" rx=\"1.2\" fill=\"#87532c\" stroke=\"#4f2d10\" stroke-width=\".9\"/><rect x=\"10.8\" y=\"10.8\" width=\"2.4\" height=\"3.1\" rx=\".5\" fill=\"#f0c04c\" stroke=\"#8a5a12\" stroke-width=\".7\"/>",
  heart: "<path d=\"M12 20.5s-8-4.9-8-10.7A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8 2.6c0 5.8-8 10.7-8 10.7Z\" fill=\"#ef4f5a\" stroke=\"#8a1c24\" stroke-width=\"1\" stroke-linejoin=\"round\"/><path d=\"M7.2 9.4c.3-1.2 1.2-1.9 2.3-1.9\" stroke=\"#ffb3b8\" stroke-width=\"1.2\" stroke-linecap=\"round\" fill=\"none\"/>",
  warning: "<path d=\"M12 3.2 21.5 19.8H2.5Z\" fill=\"#ffc23d\" stroke=\"#8a5a12\" stroke-width=\"1.1\" stroke-linejoin=\"round\"/><path d=\"M12 9v5.2\" stroke=\"#3a2205\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"17\" r=\"1.25\" fill=\"#3a2205\"/>",
  chevron_right: "<path d=\"M9 5.5 15.5 12 9 18.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
  chevron_left: "<path d=\"M15 5.5 8.5 12 15 18.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
  gem: "<path d=\"M7 4h10l4.5 5L12 21 2.5 9Z\" fill=\"#5fd9f7\"/><path d=\"M7 4 9.6 9H2.5Z\" fill=\"#8eeeff\"/><path d=\"M7 4h10l-2.6 5H9.6Z\" fill=\"#c6f8ff\"/><path d=\"M17 4l4.5 5h-7.1Z\" fill=\"#5ccff0\"/><path d=\"M2.5 9h7.1L12 21Z\" fill=\"#7d63f2\"/><path d=\"M9.6 9h4.8L12 21Z\" fill=\"#a08aff\"/><path d=\"M14.4 9h7.1L12 21Z\" fill=\"#5a41cf\"/><path d=\"M7 4h10l4.5 5L12 21 2.5 9Z\" fill=\"none\" stroke=\"#2c2475\" stroke-width=\"1\" stroke-linejoin=\"round\"/><path d=\"M9 5.6l1.1 1.7\" stroke=\"#ffffff\" stroke-width=\"1.1\" stroke-linecap=\"round\"/>",
  speedup: "<path d=\"M7 4h10c0 4-3 6-4.2 8C14 14 17 16 17 20H7c0-4 3-6 4.2-8C10 10 7 8 7 4Z\" fill=\"#d7f1ff\" stroke=\"#4b97c9\" stroke-width=\"1\"/><path d=\"M8.7 6.5h6.6c-.6 1.9-2.3 3.2-3.3 4.4-1-1.2-2.7-2.5-3.3-4.4Z\" fill=\"#f5c04e\"/><path d=\"M8.3 19.3c.5-2.1 2.3-3.4 3.7-4 1.4.6 3.2 1.9 3.7 4Z\" fill=\"#f5c04e\"/><path d=\"M12 11.6v3.4\" stroke=\"#f5c04e\" stroke-width=\"1\"/><path d=\"M5 2.8h14M5 21.2h14\" stroke=\"#9a6533\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path d=\"M5 2.8h14M5 21.2h14\" stroke=\"#c48a4f\" stroke-width=\"1\" stroke-linecap=\"round\"/>",
  hero: "<path d=\"M3.5 21.5c.6-4.6 3.9-7.3 8.5-7.3s7.9 2.7 8.5 7.3Z\" fill=\"#c2453b\" stroke=\"#6e1f19\" stroke-width=\"1\"/><path d=\"M8.4 15.2 12 19.2l3.6-4\" fill=\"none\" stroke=\"#f2c04e\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/><circle cx=\"12\" cy=\"9.3\" r=\"5.8\" fill=\"#7d8fa6\" stroke=\"#36465a\" stroke-width=\"1\"/><ellipse cx=\"12\" cy=\"10\" rx=\"3.6\" ry=\"3.9\" fill=\"#f1c9a2\"/><path d=\"M8.1 8.7c1-2.6 2.5-3.7 3.9-3.7s2.9 1.1 3.9 3.7c-1.2-.8-2.5-1.2-3.9-1.2s-2.7.4-3.9 1.2Z\" fill=\"#eee6d8\"/><circle cx=\"10.6\" cy=\"10.3\" r=\".75\" fill=\"#2a2a33\"/><circle cx=\"13.4\" cy=\"10.3\" r=\".75\" fill=\"#2a2a33\"/>",
  plus: "<path d=\"M12 5v14M5 12h14\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\"/>",
  minus: "<path d=\"M5 12h14\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\"/>",
  close: "<path d=\"M6.5 6.5l11 11M17.5 6.5l-11 11\" stroke=\"currentColor\" stroke-width=\"2.8\" stroke-linecap=\"round\"/>",
  refresh: "<path d=\"M19 12a7 7 0 1 1-2.1-5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path d=\"M18.5 3.5v4.2h-4.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
  play: "<path d=\"M8 5.2v13.6L18.8 12Z\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linejoin=\"round\"/>",
  fast: "<path d=\"M3.5 6v12l8-6Zm8.5 0v12l8-6Z\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\".8\" stroke-linejoin=\"round\"/>",
  crate: "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"16\" rx=\"1.5\" fill=\"#8d5c2c\" stroke=\"#4f300f\" stroke-width=\"1\"/><rect x=\"5.2\" y=\"6.7\" width=\"13.6\" height=\"11.6\" fill=\"#c08a4e\"/><path d=\"M5.2 10.6h13.6M5.2 14.4h13.6\" stroke=\"#9b6a37\" stroke-width=\".9\"/><path d=\"M5.8 17.8 18.2 7.2\" stroke=\"#8d5c2c\" stroke-width=\"2.2\"/><path d=\"M3 4.5h3v3H3zM18 4.5h3v3h-3zM3 17.5h3v3H3zM18 17.5h3v3h-3z\" fill=\"#a9b8c6\" stroke=\"#4f300f\" stroke-width=\".6\"/>",
  guild: '<path d="M5 2.8v18.6" stroke="#6b4a2a" stroke-width="2" stroke-linecap="round"/><path d="M6 3.5h12.5l-2.8 4.6 2.8 4.6H6Z" fill="#d8433b" stroke="#6e1a14" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.5 6.3h4l-1 1.8 1 1.8h-4Z" fill="#ffcf3f"/><circle cx="5" cy="2.8" r="1.6" fill="#ffcf3f" stroke="#8a5a12" stroke-width=".8"/>',
  scroll: '<path d="M6 4h11.5a2 2 0 0 1 2 2v12.5a2.5 2.5 0 0 1-2.5 2.5H8.5A2.5 2.5 0 0 1 6 18.5Z" fill="#f2e3c4" stroke="#7a5a2c" stroke-width="1.2"/><path d="M6 4a2.2 2.2 0 0 0-2.2 2.2c0 1.2 1 2 2.2 2h0" fill="#e2c991" stroke="#7a5a2c" stroke-width="1.2"/><path d="M9.5 9h7M9.5 12h7M9.5 15h5" stroke="#a07a3c" stroke-width="1.3" stroke-linecap="round"/>',
  army: '<path d="M12 2.5 19.5 5.2v6.3c0 4.9-3.2 8.4-7.5 10-4.3-1.6-7.5-5.1-7.5-10V5.2Z" fill="#3a6fb5" stroke="#173a6b" stroke-width="1.2" stroke-linejoin="round"/><path d="m8.2 8.2 7.6 7.6M15.8 8.2l-7.6 7.6" stroke="#dfe8ef" stroke-width="2" stroke-linecap="round"/><path d="M12 2.5 19.5 5.2v6.3c0 .3 0 .6-.1.9L12 4.7Z" fill="#fff" opacity=".18"/>',
  report: '<rect x="2.5" y="5.5" width="19" height="13.5" rx="1.6" fill="#f1e7d6" stroke="#7a6347" stroke-width="1.2"/><path d="m3 6.5 9 6.8 9-6.8" fill="none" stroke="#a2876a" stroke-width="1.3" stroke-linejoin="round"/><circle cx="12" cy="13.6" r="2.4" fill="#d8433b" stroke="#7a1f19" stroke-width=".8"/>',
  ranks: '<path d="M4 20.5V13h4.5v7.5Z" fill="#c0c8d2" stroke="#4f5b67" stroke-width="1.1"/><path d="M9.8 20.5V8h4.4v12.5Z" fill="#ffcf3f" stroke="#8a5a12" stroke-width="1.1"/><path d="M15.5 20.5V11H20v9.5Z" fill="#d48a4a" stroke="#6b3f1d" stroke-width="1.1"/><path d="M3 20.5h18" stroke="#2a3a4c" stroke-width="1.4"/>',
  dev: '<path d="M14.6 3.4a5 5 0 0 0-5.9 6.5L3.6 15a2 2 0 0 0 0 2.8l2.6 2.6a2 2 0 0 0 2.8 0l5.1-5.1a5 5 0 0 0 6.5-5.9l-3 3-3-.6-.6-3Z" fill="#9fb2c6" stroke="#2f3c4c" stroke-width="1.3" stroke-linejoin="round"/>',
  exclaim: '<path d="M12 4.5v9.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><circle cx="12" cy="18.6" r="2" fill="currentColor"/>',
});
U.icon = (name, size = 18) => `<svg class="aico aico-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
U.resIcon = (r, s = 16) => U.icon(r, s);
// an icon as a canvas, for pictures drawn on canvases (drawn when its image has loaded; local data, no request)
const iconCv = new Map();
U.iconCanvas = (name, color = '#f1e7d8') => {
  const key = name + color;
  let c = iconCv.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 48; c.sw = c.sh = 24;
  iconCv.set(key, c);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">${(ICONS[name] || '').replace(/currentColor/g, color)}</svg>`;
  const img = new Image();
  img.onload = () => { try { c.getContext('2d').drawImage(img, 0, 0, 48, 48); } catch (e) { /* ignore */ } };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return c;
};

// heraldry: a shield in the guild colour with its emblem
const EMBLEMS = {
  crown: 'M7 15h10l.8-6-3.4 2.6L12 7.5l-2.4 4.1L6.2 9Z', anvil: 'M6 9h12l-2 3h-2v3h3v2H7v-2h3v-3H8Z', wolf: 'M7 8l2.5 2 2.5-3 2.5 3L17 8l-1 6-4 3-4-3Z',
  hand: 'M9 16V9.5a1 1 0 0 1 2 0V12V8a1 1 0 0 1 2 0v4V9a1 1 0 0 1 2 0v5.5a3.5 3.5 0 0 1-3.5 3.5H11A2 2 0 0 1 9 16Z', flame: 'M12 6c1 2.6 4 3.8 4 7a4 4 0 0 1-8 0c0-1.8 1-2.8 2-3.6 0 1.2.6 2 1.4 2.4C11 9.8 11 8 12 6Z',
  bolt: 'M13 6 8 13h3.5L10.5 18l5.5-7.5h-3.5Z', shield: 'M12 7l4 1.5v3c0 2.5-1.7 4.3-4 5.3-2.3-1-4-2.8-4-5.3v-3Z', raven: 'M6 14c2-4 5-6 9-6l2 1.5-2 .5c-1 3-3.5 5-7 5l-1 2-.5-2.5Z',
  sun: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0-3v2M12 16v2M6 12h2M16 12h2M7.8 7.8l1.4 1.4M14.8 14.8l1.4 1.4M7.8 16.2l1.4-1.4M14.8 9.2l1.4-1.4', fang: 'M8 7h8l-1.5 4L12 18l-2.5-7Z',
};
U.banner = (gd, size = 28) => {
  if (!gd) return `<svg class="aoc-banner" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h16v9c0 5-3.6 8-8 9.5C7.6 20 4 17 4 12Z" fill="#3a3530" stroke="#6b6157" stroke-width="1.2"/></svg>`;
  const e = EMBLEMS[gd.emblem] || EMBLEMS.shield;
  const stroke = gd.emblem === 'sun' ? ' fill="none" stroke="#1c1712" stroke-width="1.4" stroke-linecap="round"' : ' fill="#1c1712"';
  return `<svg class="aoc-banner" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h16v9c0 5-3.6 8-8 9.5C7.6 20 4 17 4 12Z" fill="${gd.color}" stroke="#1c1712" stroke-width="1.2"/><path d="M4 3h16v3H4Z" fill="#000" opacity=".18"/><path d="${e}"${stroke}/></svg>`;
};
U.civColor = id => A.CIV[id]?.color || '#888';
U.cost = (cost, have) => Object.entries(cost || {}).map(([r, v]) => `<span class="aoc-cost${have && (have[r] || 0) < v ? ' is-short' : ''}">${U.resIcon(r, 15)}${fmt(v)}</span>`).join('');
U.troopLine = t => A.UNIT_KEYS.filter(u => (t?.[u] || 0) > 0).map(u => `<span class="aoc-troop">${U.icon(u, 15)}${fmt(t[u])}</span>`).join('') || '<span class="aoc-muted">none</span>';

// ================================================================ sheets and toasts
let sheetN = 0;
const sheets = [];
U.sheet = (o = {}) => {
  const n = ++sheetN;
  const wrap = el(`<div class="aoc-sheet-wrap${o.wide ? ' is-wide' : ''}"><div class="aoc-scrim"></div><section class="aoc-sheet" role="dialog" aria-modal="true" aria-labelledby="aoc-sheet-${n}" tabindex="-1">
    <header class="aoc-sheet-head"><h2 id="aoc-sheet-${n}" class="aoc-sheet-title"></h2><button type="button" class="aoc-x" aria-label="Close">${U.icon('close', 18)}</button></header>
    <div class="aoc-sheet-body"></div><footer class="aoc-sheet-actions" hidden></footer></section></div>`);
  const body = wrap.querySelector('.aoc-sheet-body');
  wrap.querySelector('.aoc-sheet-title').textContent = o.title || '';
  if (o.body instanceof Node) body.appendChild(o.body); else if (o.body != null) body.innerHTML = o.body;
  const acts = wrap.querySelector('.aoc-sheet-actions');
  let closed = false;
  const prev = document.activeElement;
  const h = {
    el: wrap, body, get closed() { return closed; },
    close() {
      if (closed) return;
      closed = true;
      sheets.splice(sheets.indexOf(h), 1);
      wrap.classList.add('is-out');
      setTimeout(() => wrap.remove(), U.reduced ? 0 : 180);
      try { o.onClose?.(); } catch (e) { console.error(e); }
      if (prev && prev.isConnected) try { prev.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    },
    setTitle(t) { wrap.querySelector('.aoc-sheet-title').textContent = t; },
    setActions(list) {
      acts.innerHTML = '';
      for (const a of (list || []).filter(Boolean)) {
        const b = el(`<button type="button" class="aoc-btn ${a.kind || 'gold'}"${a.id ? ` id="${a.id}"` : ''}${a.disabled ? ' disabled' : ''}>${a.icon ? U.icon(a.icon, 16) : ''}<span>${esc(a.label)}</span></button>`);
        b.addEventListener('click', async () => { if (b.disabled) return; let r; try { r = await a.onClick?.(h, b); } catch (e) { console.error(e); } if (r !== false && !a.keep) h.close(); });
        acts.appendChild(b);
      }
      acts.hidden = !acts.children.length;
    },
  };
  h.setActions(o.actions);
  wrap.querySelector('.aoc-scrim').addEventListener('click', h.close);
  wrap.querySelector('.aoc-x').addEventListener('click', h.close);
  U.layer().appendChild(wrap);
  sheets.push(h);
  requestAnimationFrame(() => wrap.classList.add('is-open'));
  try { wrap.querySelector('.aoc-sheet').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  return h;
};
U.closeSheets = () => { for (const h of sheets.slice()) h.close(); };
U.confirm = o => U.sheet({ title: o.title, body: `<p class="aoc-p">${o.text}</p>`, actions: [{ label: o.cancel || 'Cancel', kind: 'ghost' }, { label: o.ok || 'Confirm', kind: o.kind || 'gold', id: o.id, onClick: o.onOk }] });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close(); });
U.toast = (text, kind = 'info') => {
  const host = U.layer().querySelector('.aoc-toasts') || U.layer().appendChild(el('<div class="aoc-toasts" role="status" aria-live="polite"></div>'));
  const t = el(`<div class="aoc-toast is-${kind}"><span class="aoc-toast-i">${U.icon(kind === 'good' ? 'check' : kind === 'bad' ? 'exclaim' : 'info', 16)}</span><span class="aoc-toast-t"></span></div>`);
  t.querySelector('.aoc-toast-t').textContent = text;
  host.appendChild(t);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, kind === 'bad' ? 4600 : 2800);
};
// a reward pop-up: rays, a gold ribbon, one tile per resource and a big OK
U.reward = (items, title = 'Reward') => new Promise(res => {
  const list = Object.entries(items || {}).filter(([, v]) => v > 0);
  const wrap = el(`<div class="aoc-reward" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="aoc-scrim"></div>
    <div class="aoc-reward-card" tabindex="-1"><div class="aoc-reward-rays" aria-hidden="true"></div>${U.art?.pmeta('chest-2') ? `<img class="aoc-reward-chest" src="${U.art.pmeta('chest-2').src}" alt="" width="96" height="90">` : ''}<div class="aoc-reward-title">${esc(title)}</div>
      <div class="aoc-reward-grid">${list.map(([r, v]) => `<div class="aoc-reward-item"><span class="aoc-tile">${U.resIcon(r, 40)}<b>${fmt(v)}</b></span><span class="aoc-reward-name">${esc(A.RES_NAME[r] || r)}</span></div>`).join('')}</div>
      <button type="button" class="aoc-btn gold wide aoc-reward-ok">OK</button></div></div>`);
  const done = () => { wrap.remove(); res(); };
  wrap.querySelector('.aoc-reward-ok').addEventListener('click', done);
  wrap.querySelector('.aoc-scrim').addEventListener('click', done);
  U.layer().appendChild(wrap);
  try { wrap.querySelector('.aoc-reward-ok').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
});
U.layer = () => document.getElementById('aoc-layer') || document.body;
// the page itself never zooms (double taps, pinches, ctrl+wheel and trackpad pinches); the world map handles its
// own pinch and wheel zoom on its canvas
{
  const onMap = e => !!(e.target && e.target.closest && e.target.closest('.aoc-map-cv'));
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 && !onMap(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('wheel', e => { if (e.ctrlKey && !onMap(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', e => { if (!onMap(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '0'].includes(e.key)) e.preventDefault(); });
}
// the avatar redraws once the commander paintings have loaded
window.addEventListener('aoc-art', () => { const p = document.querySelector('.aoc-me-pic'); if (p) p._civ = null; });
U.reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ================================================================ saves: IndexedDB with gzip, browser storage as a fallback
function idb() {
  return new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(SAVE_DB, 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => { r.result.createObjectStore('saves'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function gzip(text) {
  if (typeof CompressionStream !== 'function') return { enc: 'plain', data: text };
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { enc: 'gzip', data: await new Response(s).blob() };
}
async function gunzip(rec) {
  if (!rec) return null;
  if (rec.enc === 'plain') return rec.data;
  const s = rec.data.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(s).text();
}
U.store = {
  async put(key, json, meta) {
    const rec = { ...(await gzip(json)), meta, at: Date.now() };
    try {
      const db = await idb();
      await new Promise((res, rej) => { const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').put(rec, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      db.close();
      U.store.where = 'IndexedDB';
      return true;
    } catch (e) {
      // no IndexedDB (some private windows): keep the newest copy in browser storage, gzipped as base64 if possible
      let data = json, enc = 'plain';
      if (rec.enc === 'gzip') { try { const bytes = new Uint8Array(await rec.data.arrayBuffer()); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); data = btoa(bin); enc = 'gzip64'; } catch (e2) { data = json; enc = 'plain'; } }
      if (LS.set(SAVE_LS + '-' + key, JSON.stringify({ meta, at: Date.now(), enc, data }))) { U.store.where = 'browser storage'; return true; }
      U.store.where = 'nowhere';
      return false;
    }
  },
  async get(key) {
    try {
      const db = await idb();
      const rec = await new Promise((res, rej) => { const tx = db.transaction('saves', 'readonly'); const q = tx.objectStore('saves').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      db.close();
      if (rec) return { meta: rec.meta, at: rec.at, json: await gunzip(rec) };
    } catch (e) { /* fall through */ }
    try {
      const raw = LS.get(SAVE_LS + '-' + key);
      if (raw) {
        const o = JSON.parse(raw);
        if (o.enc === 'gzip64') { const bin = atob(o.data); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return { meta: o.meta, at: o.at, json: await gunzip({ enc: 'gzip', data: new Blob([bytes]) }) }; }
        return { meta: o.meta, at: o.at, json: o.data ?? o.json };
      }
    } catch (e) { /* unreadable */ }
    return null;
  },
  async remove(key) {
    try { const db = await idb(); await new Promise(res => { const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').delete(key); tx.oncomplete = res; tx.onerror = res; }); db.close(); } catch (e) { /* ignore */ }
    LS.remove(SAVE_LS + '-' + key);
  },
  where: 'IndexedDB',
};

// ================================================================ the simulation host
// The engine runs in a Web Worker built from the page's own engine script; if a worker cannot start (some
// sandboxes forbid them) the same server runs on the page in small time slices.
U.host = null;
function makeHost(dev, onMsg) {
  const pending = new Map();
  let rid = 0;
  const handle = m => {
    if (m.type === 'reply') { const p = pending.get(m.rid); if (p) { pending.delete(m.rid); p(m.res); } return; }
    onMsg(m);
  };
  const H = {
    mode: 'none',
    send: null,
    cmd(cmd) { return new Promise(res => { const id = ++rid; pending.set(id, res); H.send({ type: 'cmd', rid: id, cmd }); }); },
    query(q, args) { return new Promise(res => { const id = ++rid; pending.set(id, res); H.send({ type: 'query', rid: id, q, args }); }); },
    post(m) { H.send(m); },
  };
  const inline = () => {
    H.mode = 'page';
    const server = A.createServer({ post: m => setTimeout(() => handle(m), 0), dev, budgetMs: 10 });
    H.send = m => server.handle(m);
    let last = performance.now();
    H.timer = setInterval(() => { const t = performance.now(); server.tick(Math.min(1000, t - last)); last = t; }, 100);
    H.server = server;
  };
  return new Promise(resolve => {
    let worker = null, done = false;
    const fallback = why => { if (done) return; done = true; try { worker?.terminate(); } catch (e) { /* ignore */ } H.why = why; inline(); resolve(H); };
    try {
      if (U.forcePage) throw new Error('page mode requested');
      const src = document.getElementById('aoc-engine')?.textContent;
      if (!src || typeof Worker !== 'function') throw new Error('no worker support');
      const url = URL.createObjectURL(new Blob([src + (window.AOC_GLUE || '')], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === 'up' && !done) { done = true; H.mode = 'worker'; H.send = x => worker.postMessage(x); H.worker = worker; resolve(H); return; }
        handle(m);
      };
      worker.onerror = e => { e.preventDefault?.(); if (!done) fallback('worker error'); else onMsg({ type: 'error', err: 'The simulation worker stopped: ' + (e.message || 'unknown error') }); };
      worker.postMessage({ type: 'init', dev });
      setTimeout(() => fallback('worker did not answer'), 3000);
    } catch (e) { fallback(String(e.message || e)); }
  });
}

// ================================================================ state from the simulation
U.F = null;            // latest frame
U.S = { ter: null, seed: 0, fog: null, terr: null, cities: new Map(), visVer: 0, terrVer: 0 };
const listeners = new Set();
U.onFrame = fn => { listeners.add(fn); return () => listeners.delete(fn); };
function onMessage(m) {
  switch (m.type) {
    case 'ready': {
      U.S.seed = m.seed;
      U.S.kingdom = A.generateTerrain(m.seed);
      U.S.ter = U.S.kingdom.ter;
      U.S.cities = new Map();
      if (U._ready) { const r = U._ready; U._ready = null; r(m); }
      break;
    }
    case 'frame': {
      const f = m.frame;
      if (f.fog) { U.S.fog = f.fog; U.S.visVer++; }
      if (f.terr) { U.S.terr = f.terr; U.S.terrVer++; }
      if (f.cities) { U.S.cities = new Map(f.cities.map(c => [c.id, c])); U.S.cityVer = (U.S.cityVer || 0) + 1; }
      U.F = f;
      for (const n of f.notes || []) showNote(n);
      for (const fn of listeners) { try { fn(f); } catch (e) { console.error('[aoc] frame listener failed', e); } }
      break;
    }
    case 'save': {
      const P = U.F?.player;
      const meta = { name: P?.name, civ: P?.civ, hall: P?.b?.hall, power: P?.power, day: U.F?.day, age: U.F?.age, guild: P && P.guild >= 0 ? U.F.guilds[P.guild]?.tag : null, savedAt: Date.now() };
      U.store.put('main', m.json, meta).then(ok => { U.saveState = ok ? 'saved' : 'failed'; U.lastSave = Date.now(); });
      if (!U.lastBackup || Date.now() - U.lastBackup > 300000) { U.lastBackup = Date.now(); U.store.put('backup', m.json, meta); }
      break;
    }
    case 'progress': U.progress?.(m.pct, m.label); break;
    case 'offline': U.showOffline?.(m); break;
    case 'loadError': if (U._ready) { const r = U._ready; U._ready = null; r(m); } break;
    case 'error': console.error('[aoc] simulation error', m.err); U.lastError = m.err; break;
  }
}
function showNote(n) {
  const pref = U.F?.settings?.notify || 'important';
  if (pref === 'off' && n.imp < 3) return;
  if (pref === 'important' && n.imp < 3) return;
  if (U.F && n.k === 'chronicle' && n.imp < 3) return;
  U.toast(n.text, n.k === 'alert' || n.k === 'sacked' ? 'bad' : n.k === 'age' ? 'good' : 'info');
}

// ================================================================ screens and the shell
const screens = new Map();
U.screen = (id, def) => screens.set(id, def);
const TABS = [
  { id: 'city', label: 'City', icon: 'city' },
  { id: 'map', label: 'World', icon: 'map' },
  { id: 'army', label: 'Army', icon: 'army' },
  { id: 'guild', label: 'Guild', icon: 'guild' },
  { id: 'intel', label: 'Mail', icon: 'report' },
  { id: 'chron', label: 'History', icon: 'scroll' },
  { id: 'ranks', label: 'Ranks', icon: 'ranks' },
];
U.current = null;
U.go = (id, arg) => {
  const s = screens.get(id);
  if (!s) return;
  const root = document.getElementById('aoc');
  for (const [sid, def] of screens) { if (def.el) def.el.hidden = sid !== id; }
  root.querySelectorAll('.aoc-tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === id ? 'page' : 'false'));
  if (!s.el) { s.el = el(`<section class="aoc-screen aoc-screen-${id}" aria-label="${esc(TABS.find(t => t.id === id)?.label || id[0].toUpperCase() + id.slice(1))}"></section>`); root.querySelector('.aoc-screens').appendChild(s.el); s.mount?.(s.el); }
  s.el.hidden = false;
  const prev = U.current;
  U.current = id;
  if (prev && prev !== id) screens.get(prev)?.hide?.();
  s.show?.(arg);
  if (U.F) s.update?.(U.F, true);
};

function shellHtml() {
  return `<div class="aoc-app">
    <header class="aoc-top">
      <button type="button" class="aoc-me" aria-label="Your governor"><canvas class="aoc-me-pic" width="88" height="88" aria-hidden="true"></canvas><span class="aoc-me-lv" title="Town Hall level"></span></button>
      <div class="aoc-top-main">
        <div class="aoc-top-row">
          <span class="aoc-power">${U.icon('power', 18)}<b class="aoc-power-v">0</b></span>
          <span class="aoc-time"><span class="aoc-day">Day 1</span><span class="aoc-hm">06:00</span></span>
          <div class="aoc-speed" role="group" aria-label="Game speed">
            <button type="button" data-speed="0" aria-label="Pause">${U.icon('pause', 13)}</button>
            <button type="button" data-speed="1" aria-label="Normal speed">1x</button>
            <button type="button" data-speed="2" aria-label="Double speed">2x</button>
            <button type="button" data-speed="4" aria-label="Four times speed">4x</button>
            ${U.dev ? '<button type="button" data-speed="16" aria-label="16 times speed">16x</button><button type="button" data-speed="64" aria-label="64 times speed">64x</button>' : ''}
          </div>
        </div>
      </div>
      <button type="button" class="aoc-iconbtn aoc-menu" aria-label="Menu">${U.icon('settings', 22)}</button>
      <div class="aoc-res" role="group" aria-label="Resources">${A.RES.map(r => `<button type="button" class="aoc-chip" data-res="${r}" aria-label="${A.RES_NAME[r]}">${U.resIcon(r, 18)}<span class="aoc-chip-v">0</span></button>`).join('')}</div>
    </header>
    <nav class="aoc-tabs" aria-label="Main">${TABS.map(t => `<button type="button" class="aoc-tab" id="aoc-tab-${t.id}" data-tab="${t.id}"><span class="aoc-tab-ico">${U.icon(t.icon, 28)}<i class="aoc-badge" hidden></i></span><span class="aoc-tab-l">${t.label}</span></button>`).join('')}</nav>
    <main class="aoc-screens"></main>
  </div>
  <div class="aoc-layer" id="aoc-layer"></div>`;
}
// a red notification dot, with a number when there is a count
U.badge = (node, n) => {
  if (!node) return;
  node.hidden = !n;
  const t = n === true || !n ? '' : n > 99 ? '99+' : String(n);
  if (node.textContent !== t) node.textContent = t;
  node.classList.toggle('has-n', !!t);
};
function updateShell(f) {
  const root = document.getElementById('aoc');
  const P = f.player;
  root.querySelectorAll('.aoc-chip').forEach(b => {
    const r = b.dataset.res;
    setText(b.querySelector('.aoc-chip-v'), fmt(P.res[r]));
  });
  setText(root.querySelector('.aoc-power-v'), fmt(P.power));
  setText(root.querySelector('.aoc-me-lv'), String(P.b.hall));
  const pic = root.querySelector('.aoc-me-pic');
  if (pic && pic._civ !== P.civ && U.art) { pic._civ = P.civ; const c = U.art.portrait(A.CIV[P.civ].commander, 44); const g = pic.getContext('2d'); g.clearRect(0, 0, 88, 88); g.drawImage(c, 0, 0, 88, 88); }
  setText(root.querySelector('.aoc-day'), `Day ${f.day}`);
  setText(root.querySelector('.aoc-hm'), f.clock.split(', ')[1]);
  root.querySelectorAll('.aoc-speed button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.speed) === f.speed ? 'true' : 'false'));
  const badge = (id, n) => U.badge(root.querySelector(`#aoc-tab-${id} .aoc-badge`), n);
  badge('intel', f.unread);
  badge('guild', (f.rallies || []).filter(r => !r.joined).length + (f.proposals || []).length + (f.applicants || []).length + (P.guild < 0 ? P.invites.length : 0));
  badge('city', f.quests.filter(q => q.done && !q.claimed).length + Object.values(f.crates || {}).filter(c => c.ready).length);
}
function resSheet(r) {
  const P = U.F.player;
  const net = r === 'food' ? P.prod.food - P.upkeep : P.prod[r];
  U.sheet({
    title: A.RES_NAME[r],
    body: `<div class="aoc-kv">
      <div><span>In stock</span><b>${full(P.res[r])}</b></div>
      <div><span>Production</span><b>${full(P.prod[r])} per hour</b></div>
      ${r === 'food' ? `<div><span>Troops eat</span><b>${full(P.upkeep)} per hour</b></div><div><span>Net</span><b class="${net < 0 ? 'aoc-bad' : 'aoc-good'}">${net < 0 ? '' : '+'}${full(net)} per hour</b></div>` : ''}
      <div><span>Storage</span><b>No limit</b></div>
      <div><span>Safe from plunder</span><b>${full(P.protect)}</b></div>
    </div>
    <p class="aoc-p aoc-muted">One game hour passes every real minute at 1x speed. There is no storage limit: production never stops. The Warehouse keeps part of your stock safe from plunder.${r === 'food' && net < 0 ? ' Your troops eat more than you grow: when Food runs out, soldiers desert.' : ''}</p>`,
  });
}

// ================================================================ title screen, new world, loading
function rootEl() {
  let r = document.getElementById('aoc');
  if (!r) { r = el('<div class="aoc" id="aoc"></div>'); document.body.appendChild(r); if (LS.get('aoc-text') === 'large') r.classList.add('is-large'); }
  return r;
}
// the browser's install offer (Android, desktop Chrome) is kept for the start screen's button
let installOffer = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installOffer = e; U.onInstall?.(); });
const standaloneApp = () => !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);
U.start = async () => {
  U.dev = U.devMode();
  const root = rootEl();
  root.hidden = false;
  root.innerHTML = `<div class="aoc-title" role="main"><div class="aoc-title-in">
    <button type="button" class="aoc-brand" aria-label="Age of Conquest">${logoHtml('aoc-logo')}</button>
    <h1 class="aoc-h1${LOGO ? ' aoc-sr' : ''}">Age of Conquest</h1>
    <p class="aoc-tagline">Six hundred governors, ten guilds and one living world. Build your city, raise armies and take the Throne.</p>
    <p class="aoc-devnote" hidden></p>
    <section class="aoc-card aoc-savecard" aria-live="polite"><p class="aoc-muted">Looking for your world</p></section>
    <div class="aoc-title-actions">
      <button type="button" class="aoc-btn gold wide aoc-go" id="aoc-continue" hidden>Continue</button>
      <button type="button" class="aoc-btn gold wide aoc-go" id="aoc-new">Start game</button>
    </div>
    <div class="aoc-install" hidden><button type="button" class="aoc-btn blue wide" id="aoc-install">${U.icon('arrow_up', 18)}<span>Install the game</span></button><p class="aoc-install-t aoc-muted aoc-small"></p></div>
    <p class="aoc-foot">Server 1, Ashen Crown · Eternal Conquest</p>
  </div></div>`;
  const $ = s => root.querySelector(s);
  $('#aoc-new').addEventListener('click', () => newWorld());
  // install: the browser's own offer where there is one, instructions on iPhone and iPad
  const inst = $('.aoc-install'), instBtn = $('#aoc-install');
  U.onInstall = () => {
    if (!window.AOC_APP || standaloneApp() || !inst.isConnected) return;
    if (installOffer) { inst.hidden = false; instBtn.hidden = false; setText($('.aoc-install-t'), 'Adds the game to your home screen. It also plays offline.'); }
    else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) { inst.hidden = false; instBtn.hidden = true; setText($('.aoc-install-t'), 'To install: tap Share, then Add to Home Screen.'); }
  };
  U.onInstall();
  instBtn.addEventListener('click', async () => {
    if (!installOffer) return;
    const offer = installOffer;
    installOffer = null;
    try { await offer.prompt(); const r = await offer.userChoice; if (r?.outcome === 'accepted') inst.hidden = true; } catch (e) { /* the browser declined */ }
    if (!installOffer) instBtn.hidden = true;
  });
  // developer mode: 7 quick taps on the logo
  const devNote = $('.aoc-devnote');
  const showDev = said => { const on = U.devMode(); devNote.hidden = !on && !said; setText(devNote, on ? 'Developer mode is on. Use the Dev button in your city.' : 'Developer mode is off.'); };
  showDev(false);
  let taps = 0, tapAt = 0;
  $('.aoc-brand').addEventListener('click', () => {
    const t = Date.now();
    taps = t - tapAt < 1500 ? taps + 1 : 1;
    tapAt = t;
    if (taps < 7) return;
    taps = 0;
    U.setDevMode(!U.devMode());
    U.dev = U.devMode();
    showDev(true);
    U.toast(U.dev ? 'Developer mode on' : 'Developer mode off', 'info');
  });
  const saved = await U.store.get('main');
  if (!$('.aoc-savecard')) return;
  const where = `<div class="aoc-saveloc"><span class="aoc-saveloc-dot"></span><span>Saved on this device${U.store.where !== 'IndexedDB' ? ` (${esc(U.store.where)})` : ''}</span></div>`;
  if (saved?.json) {
    const m = saved.meta || {};
    $('.aoc-savecard').innerHTML = `<div class="aoc-save-row"><span class="aoc-save-pic"></span><div><b>${esc(m.name || 'Governor')}</b>${m.guild ? ` <span class="aoc-tag">[${esc(m.guild)}]</span>` : ''}
      <div class="aoc-muted">${esc(A.CIV[m.civ]?.name || '')} · Town Hall ${m.hall || 1} · ${U.icon('power', 13)} ${fmt(m.power || 0)}</div>
      <div class="aoc-muted">Day ${m.day || 1}${m.age > 1 ? ` · Age ${A.roman(m.age)}` : ''} · saved ${savedAgo(saved.at)}</div></div></div>${where}`;
    const pic = $('.aoc-save-pic');
    if (U.art && A.CIV[m.civ]) { const c = U.art.portrait(A.CIV[m.civ].commander, 44); const img = document.createElement('canvas'); img.width = img.height = 88; img.getContext('2d').drawImage(c, 0, 0, 88, 88); pic.appendChild(img); }
    $('#aoc-continue').hidden = false;
    $('#aoc-new').classList.replace('gold', 'ghost');
    $('#aoc-new').textContent = 'New world';
    $('#aoc-continue').addEventListener('click', () => loadWorld(saved.json));
    try { $('#aoc-continue').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  } else $('.aoc-savecard').innerHTML = `<p class="aoc-p">No world yet. Found a city on the Ashen Crown server and start from the beginning.</p>${where}`;
};
function savedAgo(at) { const s = (Date.now() - at) / 1000; return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; }
// the Last Furnace: Age of Conquest artwork (inlined by the build); the drawn crest stands in without it
const LOGO = window.AOC_ASSETS?.logo || null;
U.LOGO = LOGO;
function logoHtml(cls) {
  return LOGO ? `<div class="${cls}"><img src="${LOGO}" alt="Last Furnace: Age of Conquest" width="640" height="640"></div>` : `<div class="aoc-crest" aria-hidden="true">${crestSvg()}</div>`;
}
function crestSvg() {
  return `<svg viewBox="0 0 120 120" width="112" height="112"><defs><linearGradient id="aoc-cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9b45c"/><stop offset="1" stop-color="#9b5a1e"/></linearGradient></defs>
    <path d="M60 8 100 22v34c0 26-17 44-40 56C37 100 20 82 20 56V22Z" fill="#231d1a" stroke="url(#aoc-cg)" stroke-width="4"/>
    <path d="M60 30c7 12 22 18 22 36a22 22 0 0 1-44 0c0-10 6-15 11-20 0 7 3 11 7 13-1-11 0-21 4-29Z" fill="#e0662f"/><path d="M60 52c4 6 10 9 10 17a10 10 0 0 1-20 0c0-5 3-8 6-10 0 3 1 5 3 6-.5-5 0-9 1-13Z" fill="#f4c35c"/>
    <path d="M36 92h48M44 100h32" stroke="url(#aoc-cg)" stroke-width="3" stroke-linecap="round"/></svg>`;
}
function newWorld() {
  const root = rootEl();
  let seed = (Math.random() * 2 ** 31) >>> 0;
  let civ = 'ashen';
  root.innerHTML = `<div class="aoc-title aoc-new" role="main"><div class="aoc-title-in is-wide">
    <div class="aoc-newhead"><button type="button" class="aoc-btn ghost small aoc-backlink" id="aoc-new-back">${U.icon('back', 16)}<span>Back</span></button>${LOGO ? `<img class="aoc-newlogo" src="${LOGO}" alt="" width="64" height="64">` : ''}</div>
    <h1 class="aoc-h2">Found your city</h1>
    <section class="aoc-card aoc-server">
      <div class="aoc-server-head"><div><div class="aoc-kicker">Server 1</div><h2 class="aoc-h3">${esc(A.SERVER.name)}</h2><p class="aoc-muted">${esc(A.SERVER.motto)}</p></div>
      <button type="button" class="aoc-btn ghost small" id="aoc-reseed">New map</button></div>
      <ul class="aoc-facts">
        <li><b>${A.GOVERNORS}</b> governor slots: you and ${A.GOVERNORS - 1} simulated governors</li>
        <li><b>${A.GUILD_COUNT}</b> guilds of up to ${A.GUILD_MAX}, with leaders, officers and their own politics</li>
        <li>The Capital opens on <b>Day ${1 + A.THRONE_OPENS / A.DAY}</b>. Hold it ${A.THRONE_HOLD / A.DAY} days, or finish the Grand Exchange, to win the Age.</li>
        <li>Map seed <b class="aoc-seed">${seed}</b>. Every seed is a different map and history.</li>
      </ul>
    </section>
    <h2 class="aoc-h3">How to begin</h2>
    <div class="aoc-modes" role="radiogroup" aria-label="How to begin">
      <button type="button" class="aoc-mode" role="radio" aria-checked="true" data-scn=""><b>Eternal Conquest</b><span>Start on Day 1 with everyone else. Build, join a guild, and compete for the Throne.</span></button>
      <button type="button" class="aoc-mode" role="radio" aria-checked="false" data-scn="coalition"><b>Demonstration: The Coalition War</b><span>Day 3. Crown of Cinders has outgrown every rival and the Capital opens soon. Arrive as a seasoned governor and decide how the war ends.</span></button>
    </div>
    <h2 class="aoc-h3">Civilization</h2>
    <div class="aoc-civs" role="radiogroup" aria-label="Civilization">${A.CIVS.map(c => civCard(c)).join('')}</div>
    <section class="aoc-card aoc-namecard">
      <label class="aoc-label" for="aoc-name">Your name</label>
      <input class="aoc-input" id="aoc-name" maxlength="24" autocomplete="off" value="" placeholder="Governor">
      <button type="button" class="aoc-btn gold wide" id="aoc-found">Found your city</button>
      <p class="aoc-muted aoc-small">You begin as an independent newcomer with a ${A.NEWCOMER_SHIELD / A.HOUR}-hour shield. The other governors start with the same resources as you.</p>
    </section>
  </div></div>`;
  const $ = s => root.querySelector(s);
  const pick = id => { civ = id; root.querySelectorAll('.aoc-civ').forEach(b => b.setAttribute('aria-checked', b.dataset.civ === id ? 'true' : 'false')); };
  pick(civ);
  root.querySelectorAll('.aoc-civ').forEach(b => b.addEventListener('click', () => pick(b.dataset.civ)));
  let scenario = '';
  root.querySelectorAll('.aoc-mode').forEach(b => b.addEventListener('click', () => { scenario = b.dataset.scn; root.querySelectorAll('.aoc-mode').forEach(x => x.setAttribute('aria-checked', x === b ? 'true' : 'false')); }));
  $('#aoc-reseed').addEventListener('click', () => { seed = (Math.random() * 2 ** 31) >>> 0; setText($('.aoc-seed'), seed); });
  $('#aoc-new-back').addEventListener('click', () => U.start());
  $('#aoc-found').addEventListener('click', () => {
    const name = ($('#aoc-name').value || '').trim().slice(0, 24) || 'Governor';
    beginWorld({ type: 'new', seed, civ, name, scenario });
  });
}
function civCard(c) {
  const cmd = A.CMD[c.commander];
  return `<button type="button" class="aoc-civ" role="radio" aria-checked="false" data-civ="${c.id}" style="--civ:${c.color}">
    <span class="aoc-civ-top"><span class="aoc-civ-sw"></span><b>${esc(c.name)}</b></span>
    <span class="aoc-civ-cmd">${esc(cmd.name)}, ${esc(cmd.title)}</span>
    <span class="aoc-civ-pros">${c.pros.map(p => `<span>+ ${esc(p.replace(/^\+/, ''))}</span>`).join('')}</span>
    <span class="aoc-civ-cons">${c.cons.map(p => `<span>${esc(p)}</span>`).join('')}</span>
  </button>`;
}
function loadingScreen(label) {
  const root = rootEl();
  root.innerHTML = `<div class="aoc-title aoc-loading" role="main"><div class="aoc-title-in">${logoHtml('aoc-logo is-small')}
    <p class="aoc-load-t" aria-live="polite">${esc(label)}</p><div class="aoc-bar"><i style="width:0%"></i></div></div></div>`;
  U.progress = (pct, l) => { const b = root.querySelector('.aoc-bar i'); if (b) b.style.width = pct + '%'; if (l) setText(root.querySelector('.aoc-load-t'), l); };
}
async function ensureHost() {
  if (U.host) return U.host;
  U.host = await makeHost(U.dev, onMessage);
  return U.host;
}
async function beginWorld(msg) {
  U.dev = U.devMode();
  loadingScreen(msg.type === 'new' ? 'Raising six hundred cities' : 'Opening your world');
  await ensureHost();
  const ready = new Promise(res => { U._ready = res; });
  U.host.post(msg);
  const m = await ready;
  if (m.type === 'loadError') {
    // try the backup copy before giving up
    const bak = msg.type === 'load' && !msg.backup && !m.old ? await U.store.get('backup') : null;
    if (bak?.json) { U.toast('Your save could not be read. Loading the backup copy.', 'bad'); return beginWorld({ type: 'load', json: bak.json, backup: true }); }
    rootEl().innerHTML = `<div class="aoc-title"><div class="aoc-title-in"><h1 class="aoc-h2">${m.old ? 'A new, bigger map' : 'The world could not be opened'}</h1><p class="aoc-p">${esc(m.err)}</p>
      <button type="button" class="aoc-btn gold wide" id="aoc-err-new">Start a new world</button><button type="button" class="aoc-btn ghost wide" id="aoc-err-back">Back</button></div></div>`;
    rootEl().querySelector('#aoc-err-new').addEventListener('click', () => newWorld());
    rootEl().querySelector('#aoc-err-back').addEventListener('click', () => U.start());
    return;
  }
  // wait for the first frame (it arrives right after ready)
  if (!U.F) await new Promise(res => { const off = U.onFrame(() => { off(); res(); }); });
  openShell();
  U.go('city');
  if (msg.type === 'new') U.welcome?.();
}
function loadWorld(json) { beginWorld({ type: 'load', json }); }
function openShell() {
  const root = rootEl();
  root.innerHTML = shellHtml();
  for (const def of screens.values()) def.el = null;
  root.querySelectorAll('.aoc-tab').forEach(b => b.addEventListener('click', () => U.go(b.dataset.tab)));
  root.querySelectorAll('.aoc-speed button').forEach(b => b.addEventListener('click', () => { U.host.post({ type: 'speed', v: Number(b.dataset.speed) }); }));
  root.querySelectorAll('.aoc-chip').forEach(b => b.addEventListener('click', () => resSheet(b.dataset.res)));
  root.querySelector('.aoc-menu').addEventListener('click', () => U.menu?.());
  root.querySelector('.aoc-me').addEventListener('click', () => U.inspect?.(U.F.player.id));
  U.onFrame(f => { updateShell(f); const s = screens.get(U.current); if (s && s.el && !s.el.hidden) s.update?.(f, false); });
  updateShell(U.F);
  // keep the save fresh when the page is hidden or closed
  const flush = () => { try { U.host.post({ type: 'save' }); } catch (e) { /* ignore */ } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
}
// the chapter banner: the current goal, its progress, and Go (or Claim when it is done)
const QICON = { hall2: 'castle', farm2: 'food', warehouse: 'castle', train: 'inf', scout: 'eye', camp: 'tent', gather: 'pick', research: 'scroll', guild: 'guild', hall5: 'castle', wins5: 'sword', rally: 'flag', hall10: 'crown' };
const LEVEL_GOALS = new Set(['hall2', 'farm2', 'hall5', 'hall10']);
U.questBar = (box, f) => {
  if (!box) return;
  const q = f.quests.find(x => !x.claimed);
  if (!q) { box.hidden = true; return; }
  box.hidden = false;
  const [a, b] = q.prog;
  const num = LEVEL_GOALS.has(q.id) ? `Lv ${a}/${b}` : b > 1 ? `${fmt(a)}/${fmt(b)}` : '';
  setHtml(box, `<div class="aoc-cbanner${q.done ? ' is-claim' : ''}">
    <button type="button" class="aoc-cbanner-main" data-qgo="${q.id}"><span class="aoc-cbanner-i">${U.icon(QICON[q.id] || 'star', 24)}</span>
      <span class="aoc-cbanner-txt"><span class="aoc-cbanner-k">Chapter ${q.ch + 1} · ${esc(q.chapter)}</span><span class="aoc-cbanner-task">${esc(q.text)}</span></span></button>
    <span class="aoc-cbanner-n">${num}</span>
    ${q.done ? `<button type="button" class="aoc-btn green small aoc-cbanner-act" data-claim="${q.id}">Claim</button>` : `<button type="button" class="aoc-btn blue small aoc-cbanner-act" data-qgo="${q.id}">Go</button>`}
    <span class="aoc-cbanner-bar"><i style="width:${Math.round(Math.min(1, a / Math.max(1, b)) * 100)}%"></i></span></div>`);
};
// Go: take the player to where the goal is done, and open what they need
U.goQuest = id => {
  const f = U.F, P = f.player;
  const near = list => list.slice().sort((x, y) => Math.hypot(x.x - P.x, x.y - P.y) - Math.hypot(y.x - P.x, y.y - P.y))[0];
  const city = b => { U.closeSheets(); U.go('city'); setTimeout(() => U.home.open(b), 60); };
  switch (id) {
    case 'hall2': case 'hall5': case 'hall10': return city('hall');
    case 'farm2': return city('farm');
    case 'warehouse': return city('warehouse');
    case 'train': U.closeSheets(); U.go('city'); return setTimeout(() => { U.home.focus('barracks', true); U.trainSheet('inf'); }, 60);
    case 'research': return P.b.academy > 0 ? (U.closeSheets(), U.cityPanel('research')) : city(P.b.hall >= A.BUILDINGS.academy.needHall ? 'academy' : 'hall');
    case 'scout': case 'camp': case 'wins5': { const c = near(f.camps.filter(x => !x.fort && x.lv <= Math.max(1, Math.ceil(P.b.hall / 2)))) || near(f.camps.filter(x => !x.fort)); if (c) { U.closeSheets(); U.mapFocus(c.x, c.y, 14); setTimeout(() => U.openTile(c.y * A.MAP_N + c.x), 120); } else U.go('map'); return; }
    case 'gather': { const n = near(f.nodes.filter(x => !x.busy)); if (n) { U.closeSheets(); U.mapFocus(n.x, n.y, 14); setTimeout(() => U.openTile(n.y * A.MAP_N + n.x), 120); } else U.go('map'); return; }
    case 'guild': case 'rally': U.closeSheets(); return U.go('guild');
    default: return U.go('city');
  }
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-qgo]');
  if (b && b.closest('#aoc')) U.goQuest(b.dataset.qgo);
});
// result helper for commands: toast the error, return ok
U.run = async (cmd, okText) => {
  const r = await U.host.cmd(cmd);
  if (r && r.ok) { if (okText) U.toast(okText, 'good'); return r; }
  U.toast(r?.err || 'That did not work.', 'bad');
  return null;
};
U.newWorld = newWorld;
// back to the start screen (saved first)
U.backToStart = () => { try { U.host.post({ type: 'save' }); } catch (e) { /* ignore */ } setTimeout(() => { try { location.reload(); } catch (e) { /* ignore */ } }, 300); };
window.Conquest = { boot: () => { document.documentElement.classList.add('aoc-on'); U.start(); }, start: () => U.start() };
