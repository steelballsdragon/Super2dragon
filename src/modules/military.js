/* Last Furnace military module (owner: military agent).
   Heroes (roster, levels, stars, shards), Advanced Recruitment (published odds, pity, free pull every 24h,
   card-flip reveal), the 3-hero squad, troop training in the three camps, Explore (chapters of 10 stages,
   a short animated auto-battle, first-clear rewards) and the idle reward chest.
   Uses only the Game API and S.mil. Public object: Game.mil. */

// ================================================================ small helpers
const esc = Game.esc;
const fmt = n => Game.fmt(n);
const fmtFull = n => Game.fmtFull(n);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const mil = () => Game.S.mil;
const reduced = () => !!Game.reducedMotion;

function setHidden(node, h) { if (node && node.hidden !== !!h) node.hidden = !!h; }
function setDisabled(node, d) { if (node && node.disabled !== !!d) node.disabled = !!d; }
function setHtml(node, html) { if (node && node.__milHtml !== html) { node.innerHTML = html; node.__milHtml = html; } }
function setWidth(node, f) {
  if (!node) return;
  const w = (clamp(num(f), 0, 1) * 100).toFixed(1) + '%';
  if (node.style.width !== w) node.style.width = w;
}
function setClass(node, cls, on) { if (node && node.classList.contains(cls) !== !!on) node.classList.toggle(cls, !!on); }
function txt(root, sel, t) { const n = root && root.querySelector(sel); if (n) Game.setText(n, t); }
function shade(hex, amt) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = [v >> 16, (v >> 8) & 255, v & 255].map(c => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt));
  return '#' + ch.map(c => clamp(c, 0, 255).toString(16).padStart(2, '0')).join('');
}
function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let uidSeq = 0;
const uid = p => `${p}${++uidSeq}`;

// ================================================================ tuning
const XP_PER_BOOK = 500;
const LEVEL_CAP = 120;
const MAX_STARS = 5;
const STAR_COST = [10, 20, 30, 40, 50];   // shards to reach 1..5 stars
const STAR_BONUS = 0.15;                  // +15% stats per star
const UNLOCK_SHARDS = 10;
const DUPE_SHARDS = 10;
const SHARDS_PER_PULL = 3;
const PITY_AT = 50;
const FREE_EVERY_SEC = 24 * 3600;
const PULL_COST = { 1: { tickets: 1, gems: 300 }, 10: { tickets: 10, gems: 2700 } };
const STARTER_HERO = 'bram';
const STAGE_HEROES = { 3: 'wren' };       // first clear of stage 1-3 gives a whole hero
const STAGES_PER_CHAPTER = 10;
const START_TROOPS = { infantry: 60, lancer: 30, marksman: 30 };

// Published recruit odds. The table on the Recruit screen is generated from this array.
const ODDS = [
  { rarity: 'legendary', kind: 'hero', pct: 0.5 },
  { rarity: 'legendary', kind: 'shards', pct: 1.5 },
  { rarity: 'epic', kind: 'hero', pct: 3 },
  { rarity: 'epic', kind: 'shards', pct: 15 },
  { rarity: 'rare', kind: 'hero', pct: 20 },
  { rarity: 'rare', kind: 'shards', pct: 60 },
];

// ================================================================ classes, rarities, heroes
const CLASSES = {
  infantry: { name: 'Infantry', icon: 'troop_infantry', mul: { atk: 0.8, def: 1.3, hp: 1.3 }, role: 'Front line. Soaks up hits for the squad.' },
  lancer: { name: 'Lancer', icon: 'troop_lancer', mul: { atk: 1.1, def: 1.0, hp: 1.05 }, role: 'Mid line. Balanced strikes that break ranks.' },
  marksman: { name: 'Marksman', icon: 'troop_marksman', mul: { atk: 1.4, def: 0.7, hp: 0.8 }, role: 'Back line. Hits hardest, but fragile.' },
};
const CLASS_ORDER = ['infantry', 'lancer', 'marksman'];
const RARITIES = {
  rare: { name: 'Rare', mul: 1, rank: 1 },
  epic: { name: 'Epic', mul: 1.35, rank: 2 },
  legendary: { name: 'Legendary', mul: 1.8, rank: 3 },
};
const RARITY_ORDER = ['legendary', 'epic', 'rare'];
const SKIN = ['#f7d5b8', '#efc09a', '#dba379', '#bb7f57', '#8f5c3c', '#6b432b'];

const HEROES = [
  { id: 'bram', name: 'Bram Holloway', short: 'Bram', cls: 'infantry', rarity: 'rare',
    bio: 'A dockhand who learned to hold a line the winter the harbor froze solid.',
    look: { skin: 1, hair: '#4b2f1e', style: 'short', head: 'ushanka', hat: '#6d4c33', fur: '#e4d8c2', beard: 'full', coat: '#3f5a3a', accent: '#c0533f', metal: '#9aa7b3', glow: '#6fb5ff', shieldColor: '#7a4a2a' } },
  { id: 'wren', name: 'Wren Calder', short: 'Wren', cls: 'marksman', rarity: 'rare',
    bio: "A trapper's daughter who can split a pinecone at a hundred paces.",
    look: { skin: 0, hair: '#a4471f', style: 'braid', head: 'bare', freckles: true, lashes: true, coat: '#5b4636', fur: '#cdb898', accent: '#3f8a62', weapon: 'bow', glow: '#6fd3b0' } },
  { id: 'tobin', name: 'Tobin Ashgrove', short: 'Tobin', cls: 'lancer', rarity: 'rare',
    bio: 'Runs the sled lines between outposts and has never lost a load.',
    look: { skin: 3, hair: '#1f1a17', style: 'swept', head: 'goggles', lens: '#79d0ff', stubble: true, coat: '#2f4f6f', fur: '#d9cdb8', accent: '#e0a030', metal: '#8d99a5', glow: '#ffc867' } },
  { id: 'osric', name: 'Osric Penn', short: 'Osric', cls: 'infantry', rarity: 'rare',
    bio: 'An old lighthouse keeper with a lantern-bright temper and a heavy hand.',
    look: { skin: 2, hair: '#a7a7a7', style: 'short', head: 'helmet', metal: '#8f9ca8', moustache: true, scar: true, brows: 'stern', coat: '#5a3a3a', fur: '#cfc3ad', accent: '#d8b04a', glow: '#ff9d6b', shieldColor: '#3b5d7a' } },
  { id: 'halden', name: 'Halden Roe', short: 'Halden', cls: 'infantry', rarity: 'epic',
    bio: 'A smith who beat his shield out of an old furnace door.',
    look: { skin: 4, hair: '#20160f', style: 'shaved', head: 'bare', beard: 'full', earring: true, brows: 'stern', coat: '#4a3b5e', fur: '#bfae94', accent: '#ff8a3a', metal: '#a6b1bb', glow: '#ff9a45', shieldColor: '#c4612b' } },
  { id: 'isolde', name: 'Isolde Varn', short: 'Isolde', cls: 'lancer', rarity: 'epic',
    bio: 'A cavalry captain who traded her horses for frost elk and never looked back.',
    look: { skin: 0, hair: '#efe3c6', style: 'long', head: 'circlet', band: '#d4dde6', gem: '#b48cff', lashes: true, coat: '#6a2433', fur: '#f2e9da', accent: '#b48cff', metal: '#c9d3dc', glow: '#c39bff' } },
  { id: 'sable', name: 'Sable Quill', short: 'Sable', cls: 'marksman', rarity: 'epic',
    bio: 'A silent scout who reads the wind like a ledger and leaves no tracks.',
    look: { skin: 2, hair: '#141414', style: 'short', head: 'hood', hood: '#2c3140', fur: '#8d97a6', mask: '#3c4c60', eyes: '#2e9fd8', coat: '#262b38', accent: '#5fa8d8', weapon: 'crossbow', metal: '#9aa6b2', glow: '#7cc4ff' } },
  { id: 'petra', name: 'Petra Vakar', short: 'Petra', cls: 'marksman', rarity: 'epic',
    bio: 'Builds crossbows from broken sled runners and fires them with a grin.',
    look: { skin: 1, hair: '#c4682a', style: 'topknot', head: 'bare', freckles: true, paint: '#f2c04e', lashes: true, smile: true, coat: '#3d5f6e', fur: '#d6c6a8', accent: '#f2c04e', weapon: 'crossbow', metal: '#a3aeb8', glow: '#ffd36b' } },
  { id: 'thorne', name: 'Thorne Halvard', short: 'Thorne', cls: 'infantry', rarity: 'legendary',
    bio: 'Held the north gate alone through three nights of the Long Dark.',
    look: { skin: 2, hair: '#e6e6e6', style: 'short', head: 'helmet', plume: '#e2483d', metal: '#c3ccd5', trim: '#e0a52c', beard: 'full', scar: true, brows: 'stern', coat: '#2a3a52', fur: '#efe6d6', accent: '#ffbd45', glow: '#ffd27a', shieldColor: '#2d5d9c' } },
  { id: 'astrid', name: 'Astrid Vale', short: 'Astrid', cls: 'lancer', rarity: 'legendary',
    bio: 'Led the last caravan through the Pale Pass and lost no one.',
    look: { skin: 0, hair: '#e7b74c', style: 'long', braid: true, head: 'circlet', band: '#ffcf5a', gem: '#4fc3ff', paint: '#4fc3ff', lashes: true, coat: '#1f4f7a', fur: '#ffffff', accent: '#4fc3ff', metal: '#d8e1ea', glow: '#8fe0ff' } },
  { id: 'corvin', name: 'Corvin Ashe', short: 'Corvin', cls: 'marksman', rarity: 'legendary',
    bio: "His rifle's crack is the one sound the wolves still fear.",
    look: { skin: 3, hair: '#2b2320', style: 'short', head: 'hood', hood: '#3b2a4a', fur: '#d9cfe0', patch: true, stubble: true, brows: 'stern', eyes: '#3d8fd6', coat: '#2d2436', accent: '#c9a14a', weapon: 'rifle', metal: '#8e98a3', glow: '#d8a6ff' } },
  { id: 'yara', name: 'Yara Embervale', short: 'Yara', cls: 'lancer', rarity: 'legendary',
    bio: 'Rides at the head of every charge with a lance wrapped in burning pitch.',
    look: { skin: 4, hair: '#16110e', style: 'long', head: 'band', band: '#e2483d', flame: true, paint: '#ff8a3a', lashes: true, coat: '#5a1e16', fur: '#f0dcc4', accent: '#ff8a3a', metal: '#d0d8e0', glow: '#ff8a45' } },
];
const HERO = Object.fromEntries(HEROES.map(h => [h.id, h]));

// ================================================================ art: hero portraits (100x100, flat shapes, no ids)
function weaponBack(h, L) {
  const m = L.metal || '#a9b6c2';
  if (h.cls === 'infantry') {
    const sc = L.shieldColor || shade(L.coat, 0.15);
    return `<g transform="rotate(16 78 40)"><path d="M76.1 25 L 80.4 25 L 79.6 74 L 78.25 77 L 76.9 74 Z" fill="${shade(m, 0.3)}" stroke="${shade(m, -0.35)}" stroke-width=".6"/><rect x="76.6" y="10" width="3.3" height="13" rx="1.2" fill="#5b3a1e"/><rect x="71.8" y="21.6" width="12.9" height="3.4" rx="1.5" fill="${L.accent}"/><circle cx="78.25" cy="8.8" r="2.5" fill="${L.accent}"/></g>`
      + `<circle cx="17" cy="70" r="17.5" fill="${sc}" stroke="${m}" stroke-width="3"/><path d="M17 53 V 87 M-.5 70 H 34.5" stroke="${shade(sc, -0.3)}" stroke-width="2"/><circle cx="17" cy="70" r="5.2" fill="${m}" stroke="${shade(m, -0.35)}" stroke-width=".8"/><path d="M7 60 A 14 14 0 0 1 17 55.5" stroke="#ffffff" stroke-width="1.2" fill="none" opacity=".35"/>`;
  }
  if (h.cls === 'lancer') {
    return `<path d="M88 100 L 76.6 15" stroke="#6b4423" stroke-width="3.6" stroke-linecap="round"/><path d="M87 92 L 78.6 30" stroke="#8a5a30" stroke-width="1" opacity=".7"/>`
      + `<path d="M75.8 1.5 L 79.8 15.4 L 73.1 16.2 Z" fill="${shade(m, 0.3)}" stroke="${shade(m, -0.35)}" stroke-width=".7" stroke-linejoin="round"/>`
      + `<path d="M77.4 18.2 L 95 23 L 78.4 28.4 Z" fill="${L.accent}"/><path d="M77.4 18.2 L 95 23 L 86 23.2 Z" fill="#ffffff" opacity=".22"/><rect x="73.2" y="16" width="6.6" height="2.6" rx="1.1" fill="${shade(L.accent, -0.2)}" transform="rotate(-7 76.5 17.3)"/>`;
  }
  if (L.weapon === 'rifle') {
    return `<path d="M88 99 L 70.5 6" stroke="#3a2a1e" stroke-width="4.4" stroke-linecap="round"/><path d="M76.4 38 L 70.5 6" stroke="${shade(m, -0.15)}" stroke-width="2.6" stroke-linecap="round"/><rect x="70.4" y="29" width="3.6" height="10" rx="1.4" transform="rotate(-11 72.2 34)" fill="#22262c"/><circle cx="71" cy="29.6" r="1.4" fill="#7fd3ff" opacity=".8"/>`;
  }
  if (L.weapon === 'crossbow') {
    return `<path d="M88 98 L 73 26" stroke="#5b3a1e" stroke-width="4.6" stroke-linecap="round"/><path d="M59 27.5 Q 72.5 15.5 88 21" stroke="${shade(m, -0.1)}" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M59 27.5 L 73.6 29.6 L 88 21" stroke="#efe6d2" stroke-width=".9" fill="none"/><path d="M73 26 L 71 16" stroke="${L.accent}" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  // bow + quiver
  return `<path d="M71 7 C 93 29, 93 67, 73 93" stroke="#7a4a22" stroke-width="3.8" fill="none" stroke-linecap="round"/><path d="M71 7 C 93 29, 93 67, 73 93" stroke="#b07a42" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M71.6 8.4 L 73.4 91.6" stroke="#efe6d2" stroke-width=".8"/>`
    + `<path d="M17 47 L 29 80" stroke="#6b4a2a" stroke-width="8.5" stroke-linecap="round"/><path d="M16.4 41 L 18.4 50 M20.4 40 L 21.8 49 M24.4 41.4 L 25 50" stroke="#d9cdb8" stroke-width="1.1"/><path d="M14.4 41 l2 -6 l2 6 Z M18.6 40 l2.4 -6.4 l2 6.2 Z M22.6 41.4 l2 -6 l2 6 Z" fill="${L.accent}"/>`;
}

function classTorso(h, L) {
  const m = L.metal || '#a9b6c2';
  if (h.cls === 'infantry') {
    return `<path d="M38 81 L 62 81 L 60 100 L 40 100 Z" fill="${shade(m, -0.2)}"/><path d="M40 84 L 60 84" stroke="${shade(m, 0.3)}" stroke-width="1"/>`
      + `<path d="M7 92 C 7 80, 17 73.5, 30 75 C 32 81, 28 89, 20 93.5 Z" fill="${m}" stroke="${shade(m, -0.35)}" stroke-width=".8"/><path d="M93 92 C 93 80, 83 73.5, 70 75 C 68 81, 72 89, 80 93.5 Z" fill="${m}" stroke="${shade(m, -0.35)}" stroke-width=".8"/>`
      + `<path d="M11 84 C 14 79, 20 76.6, 27 77" stroke="#ffffff" stroke-width="1.1" opacity=".4" fill="none"/>`;
  }
  if (h.cls === 'lancer') {
    return `<path d="M29 74 L 74 100 L 61 100 L 23 79 Z" fill="${L.accent}"/><path d="M29 74 L 74 100 L 70 100 L 27 75.6 Z" fill="#ffffff" opacity=".2"/><circle cx="50" cy="89" r="1.3" fill="${shade(L.coat, 0.4)}"/><circle cx="50" cy="95" r="1.3" fill="${shade(L.coat, 0.4)}"/>`;
  }
  return `<path d="M67 74 L 36 100 L 44.5 100 L 73 78 Z" fill="#5b3a20"/><rect x="49" y="86" width="5.4" height="5.4" rx="1" fill="${L.accent}" transform="rotate(-40 51.7 88.7)"/>`;
}

function faceSvg(L, skinSh) {
  const o = [];
  const ey = 46;
  const eyeC = L.eyes || '#1d2633';
  const brow = shade(L.hair, L.hair === '#efe3c6' || L.hair === '#e6e6e6' || L.hair === '#e7b74c' ? -0.35 : -0.15);
  o.push('<circle cx="42" cy="52.2" r="2.7" fill="#e5806d" opacity=".22"/><circle cx="58" cy="52.2" r="2.7" fill="#e5806d" opacity=".22"/>');
  if (L.freckles) o.push('<g fill="#a2593a" opacity=".55"><circle cx="41" cy="50" r=".55"/><circle cx="43" cy="51.3" r=".5"/><circle cx="44.6" cy="49.8" r=".5"/><circle cx="55.4" cy="49.8" r=".5"/><circle cx="57" cy="51.3" r=".5"/><circle cx="59" cy="50" r=".55"/></g>');
  if (L.stubble) o.push(`<path d="M37 50 C 38 61, 44 65.4, 50 65.4 C 56 65.4, 62 61, 63 50 C 60 57, 56 59.6, 50 59.6 C 44 59.6, 40 57, 37 50 Z" fill="${L.hair}" opacity=".28"/>`);
  if (L.paint) o.push(`<path d="M40.4 50.2 L 46 50.8 M54 50.8 L 59.6 50.2" stroke="${L.paint}" stroke-width="1.7" stroke-linecap="round"/>`);
  for (const x of [44.3, 55.7]) {
    if (L.patch && x > 50) continue;
    o.push(`<ellipse cx="${x}" cy="${ey}" rx="2.05" ry="2.3" fill="#ffffff"/><ellipse cx="${x}" cy="${ey + 0.25}" rx="1.45" ry="1.9" fill="${eyeC}"/><circle cx="${(x + 0.55).toFixed(2)}" cy="${ey - 0.6}" r=".55" fill="#ffffff"/>`);
    if (L.lashes) o.push(`<path d="M${(x - 2.4).toFixed(1)} ${ey - 1.3} Q ${x} ${ey - 3.2} ${(x + 2.4).toFixed(1)} ${ey - 1.3}" stroke="#1d2633" stroke-width=".95" fill="none" stroke-linecap="round"/>`);
  }
  if (L.brows === 'stern') o.push(`<path d="M40.6 41.2 L 47.6 42.8 M59.4 41.2 L 52.4 42.8" stroke="${brow}" stroke-width="1.9" stroke-linecap="round"/>`);
  else o.push(`<path d="M41 41.8 Q 44.3 40 47.4 41.6 M59 41.8 Q 55.7 40 52.6 41.6" stroke="${brow}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);
  o.push(`<path d="M50.2 47.6 Q 52.1 51.6 49.4 52.5" stroke="${skinSh}" stroke-width="1.25" fill="none" stroke-linecap="round"/>`);
  if (L.beard === 'full') o.push(`<path d="M35.6 47 C 35.4 61, 42 68.4, 50 68.4 C 58 68.4, 64.6 61, 64.4 47 C 62 54.6, 57.5 57.8, 50 57.8 C 42.5 57.8, 38 54.6, 35.6 47 Z" fill="${L.hair}"/><path d="M43.6 54.7 Q 50 51.6 56.4 54.7 Q 50 56.6 43.6 54.7 Z" fill="${shade(L.hair, -0.18)}"/><path d="M44 61 Q 50 64 56 61" stroke="${shade(L.hair, -0.25)}" stroke-width=".8" fill="none" opacity=".6"/>`);
  else if (L.moustache) o.push(`<path d="M43.4 54.4 Q 50 51.2 56.6 54.4 Q 53 55.6 50 54.6 Q 47 55.6 43.4 54.4 Z" fill="${L.hair}"/>`);
  if (!L.mask) {
    if (L.beard === 'full') o.push('<path d="M47 57 Q 50 58.2 53 57" stroke="#5e2a20" stroke-width="1.1" fill="none" stroke-linecap="round"/>');
    else if (L.smile) o.push('<path d="M45.8 55.4 Q 50 59.2 54.2 55.4" stroke="#7a3328" stroke-width="1.35" fill="none" stroke-linecap="round"/>');
    else o.push('<path d="M46.8 56.1 Q 50 57.5 53.2 56.1" stroke="#7a3328" stroke-width="1.25" fill="none" stroke-linecap="round"/>');
  }
  if (L.scar) o.push('<path d="M55.2 39.6 L 59.6 52.2" stroke="#b0604c" stroke-width="1.15" stroke-linecap="round"/><path d="M56.2 43 l2.1 -.6 M57.4 46.5 l2.1 -.6" stroke="#b0604c" stroke-width=".8"/>');
  if (L.patch) o.push('<path d="M35.4 40.6 L 64.6 48.8" stroke="#15151a" stroke-width="1.2"/><ellipse cx="55.9" cy="46.3" rx="3.5" ry="3.2" fill="#15151a"/><path d="M53.6 44.6 Q 55.6 43.6 57.8 44.4" stroke="#ffffff" stroke-width=".6" opacity=".3" fill="none"/>');
  if (L.mask) o.push(`<path d="M35 50.4 C 40 54, 60 54, 65 50.4 L 64.5 59 C 61 67.6, 39 67.6, 35.5 59 Z" fill="${L.mask}"/><path d="M38 56 Q 50 59.6 62 56 M40 61 Q 50 64.2 60 61" stroke="#000000" opacity=".25" stroke-width="1" fill="none"/>`);
  return o.join('');
}

function hairFront(L) {
  const hc = L.hair;
  const o = [];
  if (L.head === 'hood') return `<path d="M37 36.5 C 42 33.4, 52 32.6, 62.6 36.4 L 61.6 40.4 C 55 37.8, 46 37.8, 38.4 40.8 Z" fill="${hc}"/>`;
  if (L.head === 'helmet' || L.head === 'ushanka') return '';
  if (L.style === 'shaved') return `<path d="M35.6 42 C 35 29, 42 27.6, 50 27.6 C 58 27.6, 65 29, 64.4 42 C 61 35.6, 39 35.6, 35.6 42 Z" fill="${hc}" opacity=".5"/>`;
  o.push(`<path d="M35.2 45 C 33.5 29, 42 26.4, 50 26.4 C 58 26.4, 66.5 29, 64.8 45 C 63.5 38, 60 35.2, 55 34.4 C 52 36.6, 45 37.6, 39.5 37 C 37.2 39, 36 41.6, 35.2 45 Z" fill="${hc}"/>`);
  if (L.style === 'swept') o.push(`<path d="M36.6 39 C 41 30, 56 27.6, 64.4 35.4 C 58 33.6, 50 34.6, 43.6 39.6 Z" fill="${shade(hc, 0.18)}"/>`);
  if (L.style === 'long') o.push(`<path d="M50 27 C 46 30, 41 34, 38.4 42" stroke="${shade(hc, -0.2)}" stroke-width="1" fill="none"/><path d="M50 27 C 54 30, 59 34, 61.6 42" stroke="${shade(hc, -0.2)}" stroke-width="1" fill="none"/>`);
  if (L.style === 'topknot') o.push(`<circle cx="50" cy="24.4" r="5.8" fill="${hc}"/><path d="M47 22 Q 50 20.4 53 22" stroke="#ffffff" stroke-width=".9" opacity=".3" fill="none"/><path d="M44.6 27 L 55.4 27" stroke="${L.accent}" stroke-width="2" stroke-linecap="round"/>`);
  if (L.style === 'braid' || L.braid) {
    for (let i = 0; i < 5; i++) o.push(`<ellipse cx="${(63.6 + i * 0.9).toFixed(1)}" cy="${(52 + i * 5.2).toFixed(1)}" rx="3.3" ry="3.5" fill="${i % 2 ? shade(hc, -0.12) : hc}"/>`);
    o.push(`<path d="M66.2 76.4 l1.2 4" stroke="${L.accent}" stroke-width="2.4" stroke-linecap="round"/>`);
  }
  o.push('<path d="M42 30.4 Q 48 28.3 54 29.3" stroke="#ffffff" stroke-width="1.1" opacity=".3" fill="none" stroke-linecap="round"/>');
  return o.join('');
}

function headwear(L) {
  const o = [];
  if (L.head === 'hood') {
    o.push(`<path d="M31 50 C 30 28, 41 20.4, 50 20.4 C 59 20.4, 70 28, 69 50 C 67 39, 61 33.4, 50 33.4 C 39 33.4, 33 39, 31 50 Z" fill="${L.hood}"/>`);
    o.push(`<path d="M38.6 67.4 C 32.4 62.4, 30.6 56, 31 50 C 33 39, 39 33.4, 50 33.4 C 61 33.4, 67 39, 69 50 C 69.4 56, 67.6 62.4, 61.4 67.4" fill="none" stroke="${L.fur}" stroke-width="4.4" stroke-linecap="round"/>`);
    o.push('<path d="M41 24.6 Q 50 21.4 59 24.6" stroke="#ffffff" stroke-width="1.2" opacity=".18" fill="none"/>');
  } else if (L.head === 'helmet') {
    const m = L.metal;
    const md = shade(m, -0.3);
    const ml = shade(m, 0.4);
    if (L.plume) o.push(`<path d="M50 23 C 54 12, 66 7.6, 77 11.6 C 68.6 12.8, 60.4 18, 56.4 27 Z" fill="${L.plume}"/><path d="M52.4 21.6 C 57 14.8, 64 11.8, 71 12.4" stroke="${shade(L.plume, 0.35)}" stroke-width="1" fill="none"/>`);
    o.push(`<path d="M33.2 45 C 32 27.5, 41 22.4, 50 22.4 C 59 22.4, 68 27.5, 66.8 45 C 60 40.6, 40 40.6, 33.2 45 Z" fill="${m}"/>`);
    o.push(`<path d="M50 22.6 L 50 40.6" stroke="${md}" stroke-width="1.4"/><path d="M40 29 C 44 25.6, 47 24.8, 48.6 24.8" stroke="${ml}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".9"/>`);
    o.push(`<path d="M33 43 C 40 38.6, 60 38.6, 67 43 L 67 46 C 60 41.8, 40 41.8, 33 46 Z" fill="${L.trim || md}"/>`);
    o.push(`<path d="M48.5 41.6 L 51.5 41.6 L 51.1 54 C 50.6 55, 49.4 55, 48.9 54 Z" fill="${m}" stroke="${md}" stroke-width=".6"/>`);
    o.push(`<path d="M33.3 45.6 L 37.6 44.6 L 38.6 57.6 L 34.6 55.6 Z M66.7 45.6 L 62.4 44.6 L 61.4 57.6 L 65.4 55.6 Z" fill="${m}" stroke="${md}" stroke-width=".6"/>`);
    o.push(`<g fill="${ml}"><circle cx="37.6" cy="42.4" r=".85"/><circle cx="43.8" cy="40.8" r=".85"/><circle cx="56.2" cy="40.8" r=".85"/><circle cx="62.4" cy="42.4" r=".85"/></g>`);
  } else if (L.head === 'ushanka') {
    const f = L.fur;
    o.push(`<path d="M30 40 L 38.2 39.4 L 38.4 59.6 C 35 61.2, 31.6 60.4, 30.2 57.4 Z M70 40 L 61.8 39.4 L 61.6 59.6 C 65 61.2, 68.4 60.4, 69.8 57.4 Z" fill="${f}"/>`);
    o.push(`<path d="M31.6 57 l2.2 2 M35.4 58.8 l1.2 1.6 M68.4 57 l-2.2 2 M64.6 58.8 l-1.2 1.6" stroke="${shade(f, -0.25)}" stroke-width="1" stroke-linecap="round"/>`);
    o.push(`<path d="M32.6 36 C 32 21.6, 42 18.6, 50 18.6 C 58 18.6, 68 21.6, 67.4 36 Z" fill="${L.hat}"/>`);
    o.push(`<path d="M50 18.8 L 50 35.6" stroke="${shade(L.hat, -0.28)}" stroke-width="1.2"/><path d="M38 24 Q 43 20.6 48 20.4" stroke="#ffffff" stroke-width="1.1" opacity=".2" fill="none"/>`);
    o.push(`<rect x="30" y="31.4" width="40" height="9" rx="4.5" fill="${f}"/><path d="M33.6 35.9 h32.8" stroke="${shade(f, -0.22)}" stroke-width="1" stroke-dasharray="1.6 1.9"/>`);
    o.push(`<circle cx="50" cy="35.9" r="2.6" fill="${L.accent}" stroke="${shade(L.accent, -0.35)}" stroke-width=".7"/>`);
  } else if (L.head === 'goggles') {
    o.push('<path d="M34.8 37.6 C 42 34.4, 58 34.4, 65.2 37.6" stroke="#3a2a20" stroke-width="3.2" fill="none"/>');
    for (const x of [43.6, 56.4]) o.push(`<circle cx="${x}" cy="35.4" r="4.5" fill="${L.metal}"/><circle cx="${x}" cy="35.4" r="3.2" fill="${L.lens}"/><path d="M${(x - 1.8).toFixed(1)} 34.6 l1.5 -1.2" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round"/>`);
  } else if (L.head === 'circlet') {
    o.push(`<path d="M35.4 39.6 C 42 36.4, 58 36.4, 64.6 39.6" stroke="${L.band}" stroke-width="1.9" fill="none"/>`);
    o.push(`<path d="M50 33.4 L 53.1 37.4 L 50 41.2 L 46.9 37.4 Z" fill="${L.gem}" stroke="${L.band}" stroke-width="1.1"/><path d="M48.8 36 l1.2 -1" stroke="#ffffff" stroke-width=".7"/>`);
  } else if (L.head === 'band') {
    o.push(`<path d="M35 39 C 42 35.4, 58 35.4, 65 39 L 65 42.4 C 58 39, 42 39, 35 42.4 Z" fill="${L.band}"/>`);
    o.push(`<path d="M64 39.6 C 70 41, 74 46, 75.6 52.4 C 71.4 49.4, 68.2 46.2, 64.4 43.2 Z" fill="${shade(L.band, -0.2)}"/>`);
    if (L.flame) o.push('<path d="M50 33.8 C 51.8 35.6, 52.8 36.9, 52.4 38.7 A 2.4 2.4 0 0 1 47.6 38.7 C 47.4 37.4, 48.2 36.4, 49 36 C 49.1 36.8, 49.6 37.3, 50.1 37.5 C 49.9 36.3, 49.7 35.1, 50 33.8 Z" fill="#ffd34d" stroke="#a83a0c" stroke-width=".5"/>');
  }
  return o.join('');
}

function portraitSvg(id, cls = 'mil-psvg') {
  const h = HERO[id];
  if (!h) return '';
  const L = h.look;
  const skin = SKIN[L.skin] || SKIN[1];
  const skinSh = shade(skin, -0.17);
  const o = [];
  o.push(`<circle cx="50" cy="44" r="46" fill="${L.glow}" opacity=".2"/><circle cx="50" cy="42" r="30" fill="${L.glow}" opacity=".2"/>`);
  o.push('<g fill="#ffffff" opacity=".4"><circle cx="11" cy="17" r="1"/><circle cx="87" cy="10" r="1.2"/><circle cx="21" cy="38" r=".8"/><circle cx="91" cy="46" r=".8"/><circle cx="7" cy="58" r="1"/><circle cx="31" cy="9" r=".7"/></g>');
  o.push(weaponBack(h, L));
  if (L.head === 'hood') o.push(`<path d="M25 60 C 22 30, 36 15, 50 15 C 64 15, 78 30, 75 60 L 78 78 L 22 78 Z" fill="${L.hood}"/><path d="M64 18 C 72 24, 76 36, 75 60 L 78 78 L 66 78 C 70 60, 70 36, 64 18 Z" fill="#000000" opacity=".2"/>`);
  if (L.style === 'long' && L.head !== 'hood') o.push(`<path d="M33 44 C 31 26, 69 26, 67 44 L 69.4 74 C 64 78, 59 76, 59 70 L 58 52 L 42 52 L 41 70 C 41 76, 36 78, 30.6 74 Z" fill="${shade(L.hair, -0.12)}"/>`);
  o.push(`<path d="M5 100 C 7 82, 24 71, 50 71 C 76 71, 93 82, 95 100 Z" fill="${L.coat}"/>`);
  o.push('<path d="M50 71 C 76 71, 93 82, 95 100 L 66 100 C 65 86, 59 76, 50 71 Z" fill="#000000" opacity=".2"/>');
  o.push(classTorso(h, L));
  o.push(`<path d="M25 76 C 30 66, 70 66, 75 76 C 70 84.4, 30 84.4, 25 76 Z" fill="${L.fur}"/>`);
  o.push(`<path d="M30 76.4 l3 3 M38 79.2 l2 3 M47 80.2 l1 3 M54 80.2 l-1 3 M62.6 79.2 l-2 3 M70 76.4 l-3 3" stroke="${shade(L.fur, -0.24)}" stroke-width="1.2" stroke-linecap="round"/>`);
  o.push(`<circle cx="50" cy="83.4" r="2.6" fill="${L.accent}" stroke="${shade(L.accent, -0.35)}" stroke-width=".7"/>`);
  o.push(`<path d="M43 56 L 57 56 L 57.5 70 C 54 73, 46 73, 42.5 70 Z" fill="${skinSh}"/>`);
  if (L.head !== 'hood' && L.head !== 'ushanka') o.push(`<ellipse cx="35.6" cy="46.6" rx="2.6" ry="4" fill="${skinSh}"/><ellipse cx="64.4" cy="46.6" rx="2.6" ry="4" fill="${skinSh}"/>`);
  if (L.earring) o.push('<circle cx="35.4" cy="51.8" r="1.6" fill="none" stroke="#ffcf5a" stroke-width="1.1"/>');
  o.push(`<ellipse cx="50" cy="44.6" rx="14.5" ry="16.5" fill="${skin}"/>`);
  o.push('<path d="M57 30 C 63 34, 65 42, 64 50 C 62 56, 59 59, 55 61 C 60 54, 61 44, 57 30 Z" fill="#000000" opacity=".08"/>');
  o.push(faceSvg(L, skinSh));
  o.push(hairFront(L));
  o.push(headwear(L));
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${o.join('')}</svg>`;
}

// Rarity-tinted shard icon for each hero (24x24, nested portrait), used by the bag and reward tiles.
const RARITY_ICON_BG = { rare: ['#2f70bf', '#4fa8ff'], epic: ['#7b47c7', '#bd7cff'], legendary: ['#d88a1f', '#ffbd45'] };
const SHARD_GLYPH = '<path d="M10 2.5 16.5 7 14.5 21.5 6.5 15Z" fill="#b672ff" stroke="#2a0f55" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 2.5 16.5 7 11.5 11Z" fill="#e3c4ff"/><path d="M11.5 11 16.5 7 14.5 21.5Z" fill="#8d45e6"/>';
function shardIconMarkup(h) {
  const [bg, edge] = RARITY_ICON_BG[h.rarity];
  return `<rect x="1" y="1" width="22" height="22" rx="4" fill="${bg}" stroke="${edge}" stroke-width="1.2"/><svg x="1.6" y="1.6" width="20.8" height="20.8" viewBox="0 0 100 100">${portraitSvg(h.id).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg><g transform="translate(12.4 11.6) scale(.5)">${SHARD_GLYPH}</g>`;
}

// ================================================================ art: enemies (64x64, facing left)
const ENEMIES = {
  wolf: { name: 'Snow Wolf', plural: 'Snow Wolves', boss: 'Alpha Wolf' },
  bandit: { name: 'Raider', plural: 'Raiders', boss: 'Raider Chief' },
  beast: { name: 'Frost Beast', plural: 'Frost Beasts', boss: 'Frost Titan' },
};
function enemySvg(type, boss, cls = 'mil-esvg') {
  let s = '';
  if (boss) s += '<circle cx="32" cy="32" r="30" fill="#ff5a3c" opacity=".14"/><circle cx="32" cy="32" r="20" fill="#ff8a3a" opacity=".1"/>';
  s += '<ellipse cx="33" cy="57.6" rx="24" ry="3.4" fill="#000000" opacity=".3"/>';
  if (type === 'wolf') {
    const F = boss ? '#4f5f75' : '#8a9bb0';
    const D = boss ? '#2f3a4a' : '#55657b';
    const B = boss ? '#aebccc' : '#d3dde8';
    const E = boss ? '#ff5a3c' : '#8ff0ff';
    s += `<path d="M49 33 C 57 32, 62 25, 61 17 C 58.5 22, 55 26, 48.5 28.5 Z" fill="${D}"/>`;
    s += `<path d="M25.5 42 L 24.5 55.5 L 28.5 55.5 L 30.5 42 Z M44 41 L 46.5 55.5 L 50.5 55.5 L 49.5 40 Z" fill="${D}"/>`;
    s += `<path d="M17 31 C 20 23.5, 35 21.5, 47 26 C 54 29, 54.5 38, 49 41.5 C 42 44, 28 44.5, 22 43 C 17.5 41.5, 15.5 36, 17 31 Z" fill="${F}"/>`;
    if (boss) s += `<path d="M23 25 L 26 17 L 29.4 23.4 L 33 16 L 36.4 23 L 40.4 17.2 L 42.4 25 Z" fill="${D}"/>`;
    s += `<path d="M20 27 C 30 22.5, 42 23, 50 28 C 42 26.5, 30 26.5, 21 30.5 Z" fill="${D}" opacity=".5"/>`;
    s += `<path d="M23 41.5 C 30 44.5, 41 44, 48 40.5 C 45 45.5, 28 46.5, 23 41.5 Z" fill="${B}" opacity=".7"/>`;
    s += `<path d="M19.5 39 L 18 55.5 L 22.6 55.5 L 25 41 Z M38.5 41 L 39 55.5 L 43.6 55.5 L 43.6 40.5 Z" fill="${F}"/><path d="M17.2 55.6 h6 M38.4 55.6 h6" stroke="${D}" stroke-width="2" stroke-linecap="round"/>`;
    s += `<path d="M19.5 22.5 C 26.5 23, 30.5 30, 27.5 38.5 C 25 33, 22 28.5, 17.5 26 Z" fill="${B}"/>`;
    s += `<path d="M3.5 30.5 L 10.5 27.2 C 12 21, 18 17.6, 23.5 19.6 C 27.5 21.2, 29 26.5, 27.6 30.6 C 25 35.4, 18 37.2, 12.6 35.2 L 5 33.4 Z" fill="${F}"/>`;
    s += `<path d="M3.5 30.5 L 10.5 28.4 C 12 31, 13.5 33, 12.6 35.2 L 5 33.4 Z" fill="${B}"/>`;
    s += `<path d="M21 20.4 L 24 12.6 L 26.4 21.8 Z" fill="${D}"/><path d="M16.6 21 L 17.8 12 L 22.4 19.6 Z" fill="${F}"/><path d="M17.8 19.6 L 18.4 15 L 20.8 19.2 Z" fill="#e8a0a0" opacity=".6"/>`;
    s += `<circle cx="4.2" cy="31.2" r="1.5" fill="#1b2028"/><path d="M12.6 26.4 L 17.2 25.3 L 16.2 27.7 Z" fill="${E}"/>`;
    s += '<path d="M7 33.8 L 7.7 35.6 L 8.6 34.1 L 9.5 35.8 L 10.4 34.4" stroke="#ffffff" stroke-width=".9" fill="none" stroke-linejoin="round"/>';
    if (boss) s += '<path d="M14.4 23 L 18.6 29.4" stroke="#d07070" stroke-width="1"/>';
  } else if (type === 'bandit') {
    const C = boss ? '#5b2420' : '#4b3b31';
    const H = boss ? '#2e1210' : '#3a2d25';
    const R = boss ? '#e2483d' : '#b8382c';
    const Y = boss ? '#ff5a3c' : '#ffd34d';
    s += '<path d="M25 44 L 23.5 56 L 28.5 56 L 30 44.5 Z M34.5 44.5 L 35.6 56 L 40.6 56 L 39 44 Z" fill="#2a2420"/><path d="M22.6 56.2 h7 M34.8 56.2 h7" stroke="#16120f" stroke-width="2.8" stroke-linecap="round"/>';
    s += `<path d="M42 27 C 47 30, 50 36, 49 42 L 45 42 C 45 38, 43 34, 40 32 Z" fill="${shade(C, -0.25)}"/>`;
    s += `<path d="M21 25 C 23 19.5, 41 19.5, 43 25 L 47 47 C 40 50.5, 24 50.5, 17 47 Z" fill="${C}"/><path d="M32 25 L 33.5 49" stroke="#000000" opacity=".22" stroke-width="1.4"/>`;
    s += `<path d="M20.5 25.4 C 24 21.4, 40 21.4, 43.5 25.4 C 40 28.8, 24 28.8, 20.5 25.4 Z" fill="${boss ? '#d8cbb4' : '#a08c72'}"/>`;
    s += '<rect x="19" y="38.5" width="27.4" height="3.3" rx="1" fill="#1e1a17"/><rect x="29.6" y="38.1" width="4.6" height="4.1" rx=".8" fill="#d8b04a"/>';
    s += `<path d="M23 27.5 L 13.6 20.6 L 16.2 17.4 L 25.8 24.4 Z" fill="${C}"/><circle cx="14.4" cy="18.6" r="2.5" fill="#d9a77c"/>`;
    s += '<path d="M17.4 31 L 10.6 6.4" stroke="#6b4423" stroke-width="2.5" stroke-linecap="round"/>';
    s += boss
      ? '<path d="M12.4 4 C 3.6 3, -.4 10.6, 2 17.4 L 13.4 12.2 Z" fill="#dfe6ec" stroke="#5a6b7c" stroke-width=".8" stroke-linejoin="round"/><path d="M3.4 15.4 C 2.4 11.4, 4.6 7, 9 5.6" stroke="#ffffff" stroke-width=".9" fill="none" opacity=".85"/>'
      : '<path d="M11.8 5 C 5 4.6, 1.8 10.4, 3.4 15.4 L 12.6 12 Z" fill="#cfd8e0" stroke="#5a6b7c" stroke-width=".8" stroke-linejoin="round"/><path d="M4.6 13.6 C 4 10.6, 5.6 7.6, 9 6.8" stroke="#ffffff" stroke-width=".8" fill="none" opacity=".8"/>';
    if (boss) s += '<path d="M25.4 11.4 C 20.4 8.6, 19 4, 21 .8 C 22.6 4.8, 25 7, 28 8 Z M38.6 11.4 C 43.6 8.6, 45 4, 43 .8 C 41.4 4.8, 39 7, 36 8 Z" fill="#efe6d2" stroke="#a89c84" stroke-width=".6"/>';
    s += `<path d="M23.5 18 C 23 7.6, 41 7.6, 40.5 18 L 41.5 25 C 36 28, 28 28, 22.5 25 Z" fill="${H}"/><ellipse cx="30.8" cy="18.6" rx="6.4" ry="6.2" fill="#15110e"/>`;
    s += `<path d="M26.4 17.6 l3 .7 M32.2 18.3 l3 -.7" stroke="${Y}" stroke-width="1.6" stroke-linecap="round"/>`;
    s += `<path d="M23 22.6 C 28.6 26, 35.6 26, 41 22.6 L 41.2 26.6 C 35.6 30, 28.4 30, 22.8 26.6 Z" fill="${R}"/><path d="M38 26.4 L 44.4 34 L 41.6 35.2 L 36 27.8 Z" fill="${R}"/>`;
  } else {
    const F = boss ? '#b5cfe6' : '#dce9f5';
    const S = boss ? '#7b98b6' : '#9db6cf';
    const K = boss ? '#3e5672' : '#56708c';
    const I = boss ? '#6fd0ff' : '#a6e6ff';
    const E = boss ? '#ff5a3c' : '#7fe0ff';
    s += `<path d="M22 46 L 20.5 57 L 29.5 57 L 30.5 46 Z M39 46 L 40 57 L 49 57 L 47.5 46 Z" fill="${S}"/>`;
    s += `<path d="M44 28 C 52 30, 56 38, 55 46 L 50 46 C 50 41, 47 36, 42 34 Z" fill="${S}"/>`;
    s += `<path d="M13 34 C 11 17, 25 7.5, 39 9.5 C 53 11.5, 58.5 25, 54.5 39 C 52 47.5, 44 50, 32 50 C 20 50, 14 44, 13 34 Z" fill="${F}"/>`;
    s += `<path d="M40 10 C 52 13, 58 25, 54.5 39 C 52 47.5, 44 50, 36 50 C 48 44, 52 28, 40 10 Z" fill="${S}" opacity=".45"/>`;
    s += '<path d="M20 38 C 22 46, 40 48, 46 42 C 44 49, 24 51, 20 38 Z" fill="#ffffff" opacity=".45"/>';
    s += `<path d="M33 10 L 37 1.5 L 40.5 10.5 Z M42 11.5 L 48.5 3.5 L 48.6 14.5 Z M49.5 17 L 57 12 L 54.5 22.5 Z M53.5 25 L 61 23 L 56 31.5 Z" fill="${I}" stroke="#4a9fd0" stroke-width=".6" stroke-linejoin="round"/>`;
    s += '<path d="M37 1.5 L 38 10 M48.5 3.5 L 46.6 13 M57 12 L 52.6 19.6" stroke="#ffffff" stroke-width=".7" opacity=".8"/>';
    if (boss) s += `<path d="M24 9.6 L 26 1 L 29.4 9 Z" fill="${I}" stroke="#4a9fd0" stroke-width=".6"/>`;
    s += `<path d="M14 18.5 C 8.6 16, 7 10, 9.6 6.4 C 10.6 11, 13 13.6, 17 15.4 Z" fill="#efe6d2" stroke="#a89c84" stroke-width=".6"/>`;
    s += `<ellipse cx="20" cy="24.6" rx="8" ry="7.4" fill="${K}"/><path d="M13 20.6 C 17 18.4, 23 18.4, 27 20.6" stroke="${F}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    s += `<circle cx="17" cy="23.2" r="1.5" fill="${E}"/><circle cx="23" cy="23.2" r="1.5" fill="${E}"/>`;
    s += '<path d="M14.6 27.6 Q 20 31, 25.4 27.6" stroke="#121a24" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M16.4 28.4 l.9 2.3 l.8 -1.9 Z M23.6 28.4 l-.9 2.3 l-.8 -1.9 Z" fill="#ffffff"/>';
    s += `<path d="M19 31 C 10.5 32.5, 6 40, 6.6 47 L 13 47 C 13 42, 16 38, 22.4 36.6 Z" fill="${F}"/><path d="M6 47 L 5 50.6 M9 47 L 8.8 51 M12 47 L 12.4 50.6" stroke="#2c3a4a" stroke-width="1.5" stroke-linecap="round"/>`;
  }
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${s}</svg>`;
}

function chestSvg(cls = 'mil-chest-svg') {
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><ellipse cx="32" cy="57" rx="23" ry="3.6" fill="#000000" opacity=".3"/><path d="M9 30 h46 v22 a3 3 0 0 1 -3 3 H12 a3 3 0 0 1 -3 -3 Z" fill="#8f5526" stroke="#3f220b" stroke-width="1.4"/><path d="M9 42 h46" stroke="#6d3d17" stroke-width="1.1"/><path d="M9 30 V 25 C 9 15, 16 10, 25 10 H 39 C 48 10, 55 15, 55 25 V 30 Z" fill="#b06d33" stroke="#3f220b" stroke-width="1.4"/><path d="M11 22 C 13 14, 20 11, 26 11 H 38 C 44 11, 51 14, 53 22 C 50 20.5, 47 22, 44 20.6 C 40 22, 36 20, 32 21.4 C 28 20, 24 22, 20 20.6 C 17 22, 14 20.5, 11 22 Z" fill="#eef5fb"/><path d="M9 30 h46" stroke="#f0c04c" stroke-width="3.2"/><path d="M20 10.8 V 55 M44 10.8 V 55" stroke="#f0c04c" stroke-width="2.8"/><path d="M20 10.8 V 55 M44 10.8 V 55" stroke="#9a6512" stroke-width=".6" opacity=".6"/><rect x="27.6" y="25.6" width="8.8" height="10.6" rx="1.8" fill="#ffd862" stroke="#8a5a12" stroke-width="1"/><circle cx="32" cy="30" r="1.5" fill="#4f2d10"/><path d="M32 30.6 v3" stroke="#4f2d10" stroke-width="1.1"/><path d="M48 13 l1.6 -3.4 l1.6 3.4 l3.4 1.6 l-3.4 1.6 l-1.6 3.4 l-1.6 -3.4 l-3.4 -1.6 Z" fill="#ffffff" opacity=".85"/></svg>`;
}

// ================================================================ items and icons
Game.addIcon('mil_skull', '<path d="M12 3c-4.7 0-8 3.2-8 7.6 0 2.6 1.2 4.4 3 5.5V19a1 1 0 0 0 1 1h1.4v-2h1.4v2h2.4v-2h1.4v2H16a1 1 0 0 0 1-1v-2.9c1.8-1.1 3-2.9 3-5.5C20 6.2 16.7 3 12 3Z" fill="#e8eef4" stroke="#56677a" stroke-width="1"/><circle cx="8.8" cy="11.4" r="2.1" fill="#2a2f38"/><circle cx="15.2" cy="11.4" r="2.1" fill="#2a2f38"/><path d="M12 13.4l-1.1 2.2h2.2Z" fill="#2a2f38"/>');
for (const h of HEROES) {
  Game.addIcon('mil_shard_' + h.id, shardIconMarkup(h));
  Game.defineItem('shard_' + h.id, {
    name: `${h.short} Shard`,
    icon: 'mil_shard_' + h.id,
    rarity: h.rarity,
    group: 'hero',
    sort: 100 - RARITIES[h.rarity].rank * 10 + HEROES.indexOf(h) / 100,
    go: 'heroes:hero:' + h.id,
    desc: () => (Game.S?.mil?.heroes?.[h.id]
      ? `Stars up ${h.name}, ${RARITIES[h.rarity].name} ${CLASSES[h.cls].name}. Open the hero to use it.`
      : `Collect ${UNLOCK_SHARDS} to unlock ${h.name}, ${RARITIES[h.rarity].name} ${CLASSES[h.cls].name}.`),
  });
}

// ================================================================ heroes: stats, levels, stars
function heroRec(id) { return mil().heroes[id] || null; }
function shardsOf(id) { return Game.itemCount('shard_' + id); }
function xpToNext(lv) { return Math.round(150 + 100 * (lv - 1) + 12 * (lv - 1) * (lv - 1)); }
function maxLevel() { return Math.min(LEVEL_CAP, 10 + 4 * (Math.max(1, Game.furnaceLevel()) - 1)); }
function furnaceForLevel(lv) { return Math.ceil((lv - 10) / 4) + 1; }
function statsFor(id, lv, stars) {
  const d = HERO[id];
  const c = CLASSES[d.cls].mul;
  const k = RARITIES[d.rarity].mul * (1 + 0.12 * (lv - 1)) * (1 + STAR_BONUS * stars);
  return { atk: Math.round(60 * c.atk * k), def: Math.round(40 * c.def * k), hp: Math.round(400 * c.hp * k) };
}
const powerOfStats = s => Math.round(s.atk * 2 + s.def * 1.5 + s.hp * 0.2);
function heroStats(id) { const h = heroRec(id); return statsFor(id, h ? h.lv : 1, h ? h.stars : 0); }
function heroPower(id) { return heroRec(id) ? powerOfStats(heroStats(id)) : 0; }
function previewPower(id) { return powerOfStats(statsFor(id, 1, 0)); }
function booksForNext(id) {
  const h = heroRec(id);
  if (!h) return 0;
  return Math.max(1, Math.ceil((xpToNext(h.lv) - h.xp) / XP_PER_BOOK));
}
function canLevel(id) {
  const h = heroRec(id);
  return !!h && h.lv < maxLevel() && Game.itemCount('xp_book') >= booksForNext(id);
}
function canStar(id) {
  const h = heroRec(id);
  return !!h && h.stars < MAX_STARS && shardsOf(id) >= STAR_COST[h.stars];
}
function canUnlock(id) { return !heroRec(id) && shardsOf(id) >= UNLOCK_SHARDS; }
function heroAlert(id) { return canLevel(id) || canStar(id) || canUnlock(id); }
function ownedIds() {
  return HEROES.filter(h => heroRec(h.id)).map(h => h.id).sort((a, b) => heroPower(b) - heroPower(a) || RARITIES[HERO[b].rarity].rank - RARITIES[HERO[a].rarity].rank);
}

function addXp(id, xp) {
  const h = heroRec(id);
  if (!h) return 0;
  const cap = maxLevel();
  h.xp += xp;
  let gained = 0;
  while (h.lv < cap && h.xp >= xpToNext(h.lv)) {
    h.xp -= xpToNext(h.lv);
    h.lv++;
    gained++;
    Game.emit('hero:leveled', { heroId: id, level: h.lv });
  }
  if (h.lv >= cap) h.xp = Math.min(h.xp, xpToNext(h.lv) - 1);
  return gained;
}
function levelUp(id) {
  const h = heroRec(id);
  if (!h || h.lv >= maxLevel()) return false;
  const need = booksForNext(id);
  if (!Game.spend({ items: { xp_book: need } }, 'hero_level')) return false;
  addXp(id, need * XP_PER_BOOK);
  Game.emit('item:used', { id: 'xp_book', count: need });
  return true;
}
function useBook(id) {
  const h = heroRec(id);
  if (!h || h.lv >= maxLevel()) return false;
  if (!Game.spend({ items: { xp_book: 1 } }, 'hero_level')) return false;
  addXp(id, XP_PER_BOOK);
  Game.emit('item:used', { id: 'xp_book', count: 1 });
  return true;
}
function starUp(id) {
  const h = heroRec(id);
  if (!h || h.stars >= MAX_STARS) return false;
  if (!Game.spend({ items: { ['shard_' + id]: STAR_COST[h.stars] } }, 'hero_star')) return false;
  h.stars++;
  Game.emit('hero:starred', { heroId: id, stars: h.stars });
  return true;
}
function addHero(id, source) {
  const s = mil();
  if (!HERO[id] || s.heroes[id]) return false;
  s.heroes[id] = { lv: 1, xp: 0, stars: 0, at: Game.now() };
  const empty = s.squad.indexOf(null);
  if (empty >= 0 && !s.squad.includes(id)) s.squad[empty] = id;
  Game.emit('hero:obtained', { heroId: id, source: source || '' });
  return true;
}
function unlockHero(id) {
  if (!canUnlock(id)) return false;
  if (!Game.spend({ items: { ['shard_' + id]: UNLOCK_SHARDS } }, 'hero_unlock')) return false;
  addHero(id, 'shards');
  return true;
}
// Public: gives a whole hero, or DUPE_SHARDS shards when already owned. Returns 'hero' | 'shards' | null.
function grantHero(id, source) {
  if (!HERO[id] || !Game.S) return null;
  if (heroRec(id)) {
    Game.grant({ items: { ['shard_' + id]: DUPE_SHARDS } }, { source: source || 'hero' });
    return 'shards';
  }
  addHero(id, source);
  return 'hero';
}

// ================================================================ squad
function squadIds() { return mil().squad.filter(id => id && heroRec(id)); }
function heroesPowerInSquad() { return squadIds().reduce((t, id) => t + heroPower(id), 0); }
function battlePower() { return heroesPowerInSquad() + troopPower(); }
function assignSlot(slot, id) {
  const sq = mil().squad;
  if (slot < 0 || slot > 2) return;
  if (id == null) {
    if (squadIds().length <= 1 && sq[slot]) return;
    sq[slot] = null;
    return;
  }
  if (!heroRec(id)) return;
  const j = sq.indexOf(id);
  if (j === slot) return;
  if (j >= 0) sq[j] = sq[slot];
  sq[slot] = id;
}
function autoFill() {
  const best = ownedIds().slice(0, 3);
  const sq = mil().squad;
  for (let i = 0; i < 3; i++) sq[i] = best[i] || null;
}
function squadCanFill() { return squadIds().length < Math.min(3, ownedIds().length); }

// ================================================================ troops
const TROOPS = {
  infantry: { name: 'Infantry', icon: 'troop_infantry', camp: 'infantry_camp', campName: 'Infantry Camp', cost: { meat: 10, wood: 8 }, desc: 'Shield wall. Holds the front so your heroes can work.' },
  lancer: { name: 'Lancers', icon: 'troop_lancer', camp: 'lancer_camp', campName: 'Lancer Camp', cost: { meat: 10, wood: 6, coal: 2 }, desc: 'Fast riders that punch through enemy lines.' },
  marksman: { name: 'Marksmen', icon: 'troop_marksman', camp: 'marksman_camp', campName: 'Marksman Camp', cost: { meat: 8, wood: 10, coal: 1 }, desc: 'Archers and riflemen. The most damage from the back.' },
};
const TROOP_TYPES = ['infantry', 'lancer', 'marksman'];
const TIER_MIN_CAMP = [1, 4, 8, 13, 20];
const TIER_POWER = [3, 5, 8, 12, 18];
const TIER_COST_MUL = [1, 1.7, 2.8, 4.2, 6];
const TIER_IRON = [0, 1, 2, 3, 5];
const TIER_SEC = [3, 5, 8, 12, 18];
const TIER_RARITY = ['common', 'rare', 'epic', 'legendary', 'legendary'];

function campLevel(type) {
  const c = Game.city;
  if (!c || typeof c.level !== 'function') return 1;   // built without the city module: camps count as Lv 1
  let v = 0;
  try { v = Number(c.level(TROOPS[type].camp)); } catch (e) { v = 0; }
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}
function tierOf(type) {
  const lv = campLevel(type);
  let t = 1;
  for (let i = 0; i < TIER_MIN_CAMP.length; i++) if (lv >= TIER_MIN_CAMP[i]) t = i + 1;
  return t;
}
function batchCap(type) { return 20 + 30 * Math.max(1, campLevel(type)); }
function unitCost(type, tier) {
  const base = TROOPS[type].cost;
  const c = {};
  for (const [k, v] of Object.entries(base)) c[k] = v * TIER_COST_MUL[tier - 1];
  if (TIER_IRON[tier - 1]) c.iron = TIER_IRON[tier - 1];
  return c;
}
function trainCost(type, n) {
  const u = unitCost(type, tierOf(type));
  const c = {};
  for (const [k, v] of Object.entries(u)) c[k] = Math.ceil(v * n);
  return c;
}
function trainSeconds(type, n) {
  const per = TIER_SEC[tierOf(type) - 1];
  const speed = Math.max(0.1, 1 + num(Game.perk('trainSpeedPct')) / 100);
  return Math.max(1, Math.ceil((per * n) / speed));
}
function maxAffordable(type) {
  const u = unitCost(type, tierOf(type));
  let n = batchCap(type);
  for (const [k, v] of Object.entries(u)) if (v > 0) n = Math.min(n, Math.floor(num(Game.S.res[k]) / v));
  return Math.max(0, n);
}
function troopCount(type) { return int(mil().troops[type]); }
function totalTroops() { return TROOP_TYPES.reduce((t, k) => t + troopCount(k), 0); }
function troopPower() { return TROOP_TYPES.reduce((t, k) => t + troopCount(k) * TIER_POWER[tierOf(k) - 1], 0); }
const trainId = type => 'train:' + type;

function startTraining(type, n) {
  const T = TROOPS[type];
  if (!T || campLevel(type) < 1 || Game.timers.get(trainId(type))) return false;
  n = clamp(int(n), 1, batchCap(type));
  const cost = trainCost(type, n);
  if (!Game.has(cost)) { Game.missingSheet(cost, { title: 'Not enough resources' }); return false; }
  Game.spend(cost, 'train');
  const tier = tierOf(type);
  Game.timers.start({ id: trainId(type), kind: 'train', label: `Training ${fmtFull(n)} ${T.name} T${tier}`, durationSec: trainSeconds(type, n), data: { type, count: n, tier } });
  Game.emit('troops:started', { type, count: n });
  Game.toast(`Training ${fmtFull(n)} ${T.name}`, 'good');
  return true;
}
Game.timers.onComplete('train', t => {
  const d = t.data || {};
  if (!TROOPS[d.type] || !Game.S?.mil) return;
  const n = Math.max(0, int(d.count));
  mil().troops[d.type] = troopCount(d.type) + n;
  Game.emit('troops:trained', { type: d.type, count: n });
  if (Game.isReady) Game.toast(`${fmtFull(n)} ${TROOPS[d.type].name} ready`, 'good');
});
function freeFinishTraining(type) {
  const id = trainId(type);
  const t = Game.timers.get(id);
  if (!t) return;
  const rem = Game.timers.remaining(id);
  if (rem > Game.perk('freeFinishSec')) { Game.speedupSheet(id); return; }
  Game.timers.finishNow(id);
  Game.emit('speedup:used', { seconds: rem, timerId: id, kind: 'train', free: true });
}

// ================================================================ stages
const CHAPTERS = ['The Frozen Road', 'Wolf Hollow', 'Raider Ridge', 'The Pale Pass', 'Icebound Mill', 'Howling Pines', 'Frostfang Lair',
  'The Shattered Bridge', 'Blackice Lake', 'Ember Ruins', 'Whitecrest Peaks', 'The Silent Mine', 'Glacier Gate', 'Hollow Crown Keep',
  'Stormwatch', 'The Deep Drift', 'Rimefall Valley', 'Ashen Tundra', 'The Long Dark', 'Heart of Winter'];
const MAX_STAGE = CHAPTERS.length * STAGES_PER_CHAPTER;
const chapterOf = s => Math.ceil(s / STAGES_PER_CHAPTER);
const stageInChapter = s => ((s - 1) % STAGES_PER_CHAPTER) + 1;
const stageLabel = s => `${chapterOf(s)}-${stageInChapter(s)}`;
function enemyPower(s) {
  const x = s - 1;
  let p = 260 + 110 * x + 16 * Math.pow(x, 1.85);
  if (s % 10 === 0) p *= 1.08; else if (s % 5 === 0) p *= 1.04;
  return Math.round(p / 10) * 10;
}
const isBoss = s => stageInChapter(s) === 5 || stageInChapter(s) === 10;
function stageEnemies(s) {
  const ch = chapterOf(s);
  const n = stageInChapter(s);
  const kinds = ['wolf', 'bandit', 'beast'];
  const base = kinds[(ch - 1) % 3];
  const alt = kinds[ch % 3];
  if (isBoss(s)) return [{ type: base, boss: true }, { type: base }, { type: n === 10 ? alt : base }];
  return [{ type: base }, { type: base }, { type: n % 3 === 0 ? alt : base }];
}
function stageRewards(s) {
  const r10 = v => Math.round(v / 10) * 10;
  const r = { meat: r10(300 + 80 * s), wood: r10(300 + 80 * s), items: { xp_book: 2 + Math.floor(s / 5) } };
  if (s >= 3) r.coal = r10(60 + 20 * s);
  if (s >= 6) r.iron = r10(15 + 6 * s);
  if (s % 5 === 0) r.gems = s % 10 === 0 ? 100 : 50;
  if (s % 10 === 0) r.items.ticket_recruit = 1;
  if (s % 2 === 0) r.items[s % 10 === 0 ? 'speedup_1h' : 'speedup_5m'] = 1;
  return r;
}
function verdict(ratio) {
  if (ratio >= 1.09) return { label: 'Favored', cls: 'is-good' };
  if (ratio >= 0.93) return { label: 'Close fight', cls: 'is-warn' };
  return { label: 'Too strong', cls: 'is-bad' };
}

// ================================================================ idle chest
function idleRate() {
  const s = mil().stage;
  return { meat: 8 + 3 * s, wood: 8 + 3 * s, coal: 2 + 0.8 * s, iron: 0.4 * s, xp: 6 + 1.5 * s };
}
function idleCapMin() { return Math.max(1, num(Game.perk('idleCapHours'))) * 60; }
function accrueIdle(sec) {
  const idle = mil().idle;
  const room = idleCapMin() - idle.min;
  if (!(sec > 0) || room <= 0) return;
  const m = Math.min(room, sec / 60);
  const r = idleRate();
  idle.min += m;
  for (const k of ['meat', 'wood', 'coal', 'iron', 'xp']) idle[k] = num(idle[k]) + r[k] * m;
}
function idleRewards() {
  const idle = mil().idle;
  const r = {};
  for (const k of ['meat', 'wood', 'coal', 'iron']) { const v = Math.floor(num(idle[k])); if (v > 0) r[k] = v; }
  const books = Math.floor(num(idle.xp) / XP_PER_BOOK);
  if (books > 0) r.items = { xp_book: books };
  return r;
}
function claimIdle() {
  const idle = mil().idle;
  if (idle.min < 1) return false;
  const r = idleRewards();
  const books = r.items?.xp_book || 0;
  Game.grant(r, { source: 'idle', popup: true, title: 'Idle rewards' });
  idle.min = 0;
  idle.meat = idle.wood = idle.coal = idle.iron = 0;
  idle.xp = Math.max(0, num(idle.xp) - books * XP_PER_BOOK);
  Game.emit('idle:claimed', {});
  return true;
}

// ================================================================ recruitment
const oddsPct = (r, k) => ODDS.find(o => o.rarity === r && o.kind === k)?.pct ?? 0;
function freeReady() { return Game.now() >= num(mil().recruit.freeAt); }
function freeIn() { return Math.max(0, Math.ceil((num(mil().recruit.freeAt) - Game.now()) / 1000)); }
function pityLeft() { return Math.max(1, PITY_AT - int(mil().recruit.pity)); }
function rollOne(rng, epicFloor) {
  const R = mil().recruit;
  let res = null;
  if (int(R.total) === 0) res = { rarity: 'epic', kind: 'hero', rule: 'first' };
  else if (int(R.pity) >= PITY_AT - 1) res = { rarity: 'legendary', kind: 'hero', rule: 'pity' };
  else {
    const r = rng() * 100;
    let acc = 0;
    for (const o of ODDS) {
      acc += o.pct;
      if (r < acc) { res = { rarity: o.rarity, kind: o.kind }; break; }
    }
    if (!res) res = { rarity: 'rare', kind: 'shards' };
    // 10x guarantee: a Rare result becomes Epic, keeping the published Epic hero-to-shards split
    if (epicFloor && res.rarity === 'rare') {
      const hero = oddsPct('epic', 'hero'), all = hero + oddsPct('epic', 'shards');
      res = { rarity: 'epic', kind: rng() * all < hero ? 'hero' : 'shards', rule: 'ten' };
    }
  }
  const pool = HEROES.filter(h => h.rarity === res.rarity);
  res.heroId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id;
  R.total = int(R.total) + 1;
  if (res.rarity === 'legendary' && res.kind === 'hero') R.pity = 0; else R.pity = int(R.pity) + 1;
  return res;
}
function applyPull(res) {
  const sid = 'shard_' + res.heroId;
  if (res.kind === 'hero') {
    if (heroRec(res.heroId)) {
      res.dupe = true;
      res.shards = DUPE_SHARDS;
      Game.grant({ items: { [sid]: DUPE_SHARDS } }, { source: 'recruit' });
    } else {
      addHero(res.heroId, 'recruit');
      res.isNew = true;
    }
  } else {
    res.shards = SHARDS_PER_PULL;
    Game.grant({ items: { [sid]: SHARDS_PER_PULL } }, { source: 'recruit' });
  }
}
function recruit(n, pay) {
  n = n === 10 ? 10 : 1;
  const cost = PULL_COST[n];
  if (pay === 'free') {
    if (n !== 1 || !freeReady()) return null;
    mil().recruit.freeAt = Game.now() + FREE_EVERY_SEC * 1000;
  } else if (pay === 'tickets') {
    if (!Game.spend({ items: { ticket_recruit: cost.tickets } }, 'recruit')) return null;
  } else if (pay === 'gems') {
    if (!Game.spend({ gems: cost.gems }, 'recruit')) { Game.needGems(cost.gems); return null; }
  } else return null;
  const rng = typeof Game.mil?._rng === 'function' ? Game.mil._rng : Math.random;
  const results = [];
  for (let i = 0; i < n; i++) {
    const last = n === 10 && i === n - 1;
    const r = rollOne(rng, last && !results.some(x => x.rarity !== 'rare'));
    applyPull(r);
    results.push(r);
  }
  Game.emit('hero:recruited', { count: n, heroIds: results.map(r => r.heroId), newHeroIds: results.filter(r => r.isNew).map(r => r.heroId), pay });
  return results;
}
function payFor(n) { return Game.itemCount('ticket_recruit') >= PULL_COST[n].tickets ? 'tickets' : 'gems'; }
function costLabel(n) {
  const c = PULL_COST[n];
  return payFor(n) === 'tickets' ? `${Game.icon('ticket', 18)}${c.tickets}` : `${Game.icon('gem', 18)}${fmtFull(c.gems)}`;
}
function startRecruit(n) {
  if (!Game.S) return;
  const pay = payFor(n);
  if (pay === 'tickets') { const r = recruit(n, 'tickets'); if (r) openReveal(r, n); return; }
  const gems = PULL_COST[n].gems;
  if (num(Game.S.res.gems) < gems) { Game.needGems(gems); return; }
  Game.confirmSheet({
    title: `Recruit x${n}`,
    message: `Spend <b>${fmtFull(gems)}</b> Gems for ${n === 1 ? 'one recruit' : '10 recruits'}?`,
    confirmLabel: 'Recruit',
    kind: 'gold',
    onConfirm: () => { const r = recruit(n, 'gems'); if (r) openReveal(r, n); },
  });
}
function startFreeRecruit() {
  const r = recruit(1, 'free');
  if (r) openReveal(r, 1);
}

// ================================================================ badges
let badgeAt = 0;
function updateBadges(force) {
  if (!Game.S?.mil) return;
  const t = Date.now();
  if (!force && t - badgeAt < 400) return;
  badgeAt = t;
  const heroAlerts = HEROES.some(h => heroAlert(h.id));
  Game.badge('heroes', freeReady() || heroAlerts || squadCanFill() ? 1 : 0);
  Game.badge('explore', mil().idle.min > 30 ? 1 : 0);
}

// ================================================================ shared bits of markup
function starsHtml(n, size = 12) {
  let s = '';
  for (let i = 0; i < MAX_STARS; i++) s += `<span class="mil-star${i < n ? ' on' : ''}">${Game.icon('star', size)}</span>`;
  return s;
}
function porHtml(id, extra = '') {
  return `<span class="mil-por rarity-${HERO[id].rarity}${extra}">${portraitSvg(id)}</span>`;
}
function clsBadge(id, size = 14) { return `<span class="mil-cls" title="${CLASSES[HERO[id].cls].name}">${Game.icon(CLASSES[HERO[id].cls].icon, size)}</span>`; }
function heroTileHtml(id, count) {
  return Game.tileHtml({ iconHtml: `<span class="mil-tilepor">${portraitSvg(id)}</span>`, rarity: HERO[id].rarity, count });
}
function rewardTilesHtml(rw, heroId) {
  const out = [];
  if (heroId) out.push(heroTileHtml(heroId, 'Hero'));
  if (rw.gems) out.push(Game.tileHtml({ icon: 'gem', count: fmt(rw.gems), rarity: 'epic' }));
  for (const k of ['meat', 'wood', 'coal', 'iron']) if (rw[k]) out.push(Game.tileHtml({ icon: k, count: fmt(rw[k]) }));
  for (const [id, n] of Object.entries(rw.items || {})) out.push(Game.itemTileHtml(id, n));
  return out.join('');
}

// ================================================================ heroes screen
const SUBS = [
  { id: 'roster', label: 'Heroes' },
  { id: 'recruit', label: 'Recruit' },
  { id: 'squad', label: 'Squad' },
  { id: 'troops', label: 'Troops' },
];
const ui = { sub: 'roster', chapter: 0, heroesEl: null, exploreEl: null, sig: {} };
try { const saved = Game.storage.get('last-furnace-v2:mil-sub'); if (SUBS.some(s => s.id === saved)) ui.sub = saved; } catch (e) { /* per-viewer pref only */ }

function setSub(id) {
  if (!SUBS.some(s => s.id === id)) return;
  ui.sub = id;
  Game.storage.set('last-furnace-v2:mil-sub', id);
  const el = ui.heroesEl;
  if (!el) return;
  el.querySelectorAll('.mil-subtabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sub === id)));
  el.querySelectorAll('.mil-view').forEach(v => { v.hidden = v.dataset.view !== id; });
  el.scrollTop = 0;
  updateHeroes(el);
}

function mountHeroes(el) {
  ui.heroesEl = el;
  el.innerHTML = `<div class="mil-heroes">
    <div class="seg mil-subtabs" role="group" aria-label="Hero sections">${SUBS.map(s => `<button type="button" id="mil-sub-${s.id}" data-sub="${s.id}" aria-pressed="false"><span>${s.label}</span><span class="badge-dot" aria-hidden="true" hidden></span></button>`).join('')}</div>
    <div class="mil-view" data-view="roster">${rosterSkeleton()}</div>
    <div class="mil-view" data-view="recruit" hidden>${recruitSkeleton()}</div>
    <div class="mil-view" data-view="squad" hidden>${squadSkeleton()}</div>
    <div class="mil-view" data-view="troops" hidden>${troopsSkeleton()}</div>
  </div>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !el.contains(b)) return;
    if (b.dataset.sub) { setSub(b.dataset.sub); return; }
    if (b.dataset.hero) { openHero(b.dataset.hero); return; }
    if (b.dataset.slot != null) { openSlotPicker(int(b.dataset.slot)); return; }
    if (b.dataset.go) { Game.navigate(b.dataset.go); return; }
    const t = b.dataset.type;
    switch (b.dataset.act) {
      case 'free': startFreeRecruit(); break;
      case 'x1': startRecruit(1); break;
      case 'x10': startRecruit(10); break;
      case 'auto': autoFill(); Game.toast('Squad filled with your strongest heroes', 'good'); break;
      case 'train': openTraining(t); break;
      case 'speed': freeFinishTraining(t); break;
      case 'build': Game.navigate('city:building:' + TROOPS[t].camp); break;
      case 'bag': Game.bagSheet('hero'); break;
      default: break;
    }
    updateHeroes(el);
  });
  setSub(ui.sub);
}

function updateHeroes(el) {
  if (!Game.S?.mil) return;
  const dots = {
    roster: HEROES.some(h => heroAlert(h.id)),
    recruit: freeReady(),
    squad: squadCanFill(),
    troops: false,
  };
  el.querySelectorAll('.mil-subtabs button').forEach(b => setHidden(b.querySelector('.badge-dot'), !dots[b.dataset.sub]));
  const view = el.querySelector(`.mil-view[data-view="${ui.sub}"]`);
  if (!view) return;
  if (ui.sub === 'roster') updateRoster(view);
  else if (ui.sub === 'recruit') updateRecruit(view);
  else if (ui.sub === 'squad') updateSquad(view);
  else updateTroops(view);
}

// ---------- roster
function rosterSkeleton() {
  return `<div class="mil-rhead">
      <div class="mil-rcount"><span class="mil-rcount-n" data-f="owned">0</span><span class="mil-rcount-of">/ ${HEROES.length} heroes</span></div>
      <button type="button" class="mil-bookchip" data-act="bag" aria-label="Hero items">${Game.icon('xp', 20)}<span data-f="books">0</span></button>
    </div>
    <div class="mil-grid" data-f="grid"></div>
    <p class="mil-hint">Tap a hero to level up or add stars. Locked heroes unlock with ${UNLOCK_SHARDS} shards from recruiting.</p>`;
}
function heroCardHtml(id) {
  const d = HERO[id];
  const h = heroRec(id);
  const sh = shardsOf(id);
  const lock = !h;
  const label = lock ? `${d.name}, ${RARITIES[d.rarity].name} ${CLASSES[d.cls].name}, locked, ${sh} of ${UNLOCK_SHARDS} shards` : `${d.name}, ${RARITIES[d.rarity].name} ${CLASSES[d.cls].name}, level ${h.lv}, ${h.stars} stars`;
  return `<button type="button" class="mil-hcard rarity-${d.rarity}${lock ? ' is-locked' : ''}" data-hero="${id}" aria-label="${esc(label)}">
    <span class="mil-hcard-por">${porHtml(id)}${lock ? `<span class="mil-lockico">${Game.icon('lock', 18)}</span>` : ''}</span>
    ${clsBadge(id)}
    ${lock ? '' : `<span class="mil-lv">Lv ${h.lv}</span>`}
    ${lock ? `<span class="mil-shardline"><span class="progress gold"><span class="bar" style="width:${Math.min(100, (sh / UNLOCK_SHARDS) * 100).toFixed(0)}%"></span></span><span class="mil-shardnum">${sh}/${UNLOCK_SHARDS}</span></span>` : `<span class="mil-stars">${starsHtml(h.stars, 11)}</span>`}
    <span class="mil-hname">${esc(d.short)}</span>
    <span class="badge-dot" aria-hidden="true"${heroAlert(id) ? '' : ' hidden'}></span>
  </button>`;
}
function updateRoster(view) {
  const owned = ownedIds();
  const locked = HEROES.filter(h => !heroRec(h.id)).sort((a, b) => (canUnlock(b.id) - canUnlock(a.id)) || RARITIES[a.rarity].rank - RARITIES[b.rarity].rank || shardsOf(b.id) - shardsOf(a.id)).map(h => h.id);
  const order = owned.concat(locked);
  const sig = order.map(id => { const h = heroRec(id); return `${id}:${h ? h.lv + '.' + h.stars : 'x'}:${shardsOf(id)}:${heroAlert(id) ? 1 : 0}`; }).join('|');
  if (ui.sig.roster !== sig) {
    ui.sig.roster = sig;
    view.querySelector('[data-f="grid"]').innerHTML = order.map(heroCardHtml).join('');
  }
  txt(view, '[data-f="owned"]', owned.length);
  txt(view, '[data-f="books"]', fmt(Game.itemCount('xp_book')));
}

// ---------- recruit
function recruitSkeleton() {
  const total = ODDS.reduce((t, o) => t + o.pct, 0);
  const byRarity = r => ODDS.filter(o => o.rarity === r).reduce((t, o) => t + o.pct, 0);
  const oddsOf = (r, k) => ODDS.find(o => o.rarity === r && o.kind === k)?.pct ?? 0;
  const pct = v => `${+v.toFixed(3)}%`;
  const rows = ODDS.map(o => `<tr><td><span class="mil-odot rarity-${o.rarity}"></span>${RARITIES[o.rarity].name} ${o.kind === 'hero' ? 'hero' : `shards x${SHARDS_PER_PULL}`}</td><td class="num">${pct(o.pct)}</td></tr>`).join('');
  const pool = RARITY_ORDER.map(r => {
    const list = HEROES.filter(h => h.rarity === r);
    const each = byRarity(r) / list.length;
    return `<div class="mil-pool-row"><div class="mil-pool-h"><span class="rarity-${r} rarity-text">${RARITIES[r].name}</span><span class="muted">${pct(byRarity(r))} total, ${pct(each)} per hero</span></div><div class="mil-pool-list">${list.map(h => `<button type="button" class="mil-pool-hero" data-hero="${h.id}">${porHtml(h.id)}<span>${esc(h.short)}</span></button>`).join('')}</div></div>`;
  }).join('');
  return `<section class="mil-rbanner">
      <div class="mil-rbanner-rays" aria-hidden="true"></div>
      <div class="mil-rbanner-art" aria-hidden="true">
        <span class="mil-rb-hero is-l">${porHtml('thorne')}</span>
        <span class="mil-rb-hero is-r">${porHtml('corvin')}</span>
        <span class="mil-rb-hero is-c">${porHtml('astrid')}</span>
      </div>
      <div class="mil-rbanner-text">
        <h2 class="mil-rbanner-title">Advanced Recruitment</h2>
        <p class="mil-rbanner-sub">Legendary hero ${pct(oddsOf('legendary', 'hero'))}, guaranteed within ${PITY_AT} pulls. Epic hero ${pct(oddsOf('epic', 'hero'))}.</p>
      </div>
    </section>
    <div class="mil-pity card">
      <div class="mil-pity-t">${Game.icon('crown', 18)}<span>Legendary hero guaranteed within <b data-f="pity">${PITY_AT}</b> <span data-f="pityword">pulls</span></span></div>
      <div class="progress gold"><div class="bar" data-f="pitybar"></div></div>
    </div>
    <div class="mil-rfree card">
      <div class="mil-rfree-art">${Game.icon('gift', 30)}</div>
      <div class="mil-rfree-info"><div class="mil-rfree-t">Free recruit</div><div class="mil-rfree-sub" data-f="freesub">One every 24 hours</div></div>
      <button type="button" class="btn green" id="mil-recruit-free" data-act="free">Free</button>
    </div>
    <div class="mil-rbtns">
      <button type="button" class="btn gold mil-rbtn" id="mil-recruit-1" data-act="x1"><span class="mil-rbtn-l">Recruit x1</span><span class="btn-cost" data-f="c1"></span></button>
      <button type="button" class="btn gold mil-rbtn" id="mil-recruit-10" data-act="x10"><span class="mil-rbtn-l">Recruit x10</span><span class="btn-cost" data-f="c10"></span></button>
    </div>
    <div class="mil-rown"><span class="chip">${Game.icon('ticket', 18)}<span data-f="tickets">0</span></span><span class="muted">Tickets are used first. Without enough tickets the price is in Gems.</span></div>
    <h3 class="section-title">Odds</h3>
    <div class="card mil-odds">
      <table class="mil-odds-t"><thead><tr><th scope="col">Result</th><th scope="col" class="num">Chance</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td><td class="num">${pct(total)}</td></tr></tfoot></table>
      <ul class="mil-rules">
        <li>Every hero of the same rarity is equally likely.</li>
        <li>Pity: if ${PITY_AT - 1} pulls in a row bring no Legendary hero, pull ${PITY_AT} is a Legendary hero. The counter resets whenever you get one, and Legendary shards do not reset it.</li>
        <li>Your very first recruit is always an Epic hero.</li>
        <li>Every 10x recruit includes at least one Epic or Legendary result. If the first nine are all Rare, the tenth is Epic (hero or shards, in the same ${oddsPct('epic', 'hero')} to ${oddsPct('epic', 'shards')} split as the table).</li>
        <li>A hero you already own turns into ${DUPE_SHARDS} of their shards. Shards add stars, and ${UNLOCK_SHARDS} shards unlock a hero you do not own yet.</li>
      </ul>
    </div>
    <h3 class="section-title">Hero pool</h3>
    <div class="mil-pool">${pool}</div>`;
}
function updateRecruit(view) {
  const ready = freeReady();
  const free = view.querySelector('#mil-recruit-free');
  setDisabled(free, !ready);
  setHtml(free, ready ? 'Free' : `${Game.icon('clock', 16)}${Game.fmtTime(freeIn())}`);
  txt(view, '[data-f="freesub"]', ready ? (int(mil().recruit.total) === 0 ? 'Ready now. Your first recruit is an Epic hero.' : 'Ready now') : 'Next free recruit in ' + Game.fmtTime(freeIn()));
  setHtml(view.querySelector('[data-f="c1"]'), costLabel(1));
  setHtml(view.querySelector('[data-f="c10"]'), costLabel(10));
  txt(view, '[data-f="tickets"]', fmtFull(Game.itemCount('ticket_recruit')));
  const left = pityLeft();
  txt(view, '[data-f="pity"]', left);
  txt(view, '[data-f="pityword"]', left === 1 ? 'pull' : 'pulls');
  setWidth(view.querySelector('[data-f="pitybar"]'), int(mil().recruit.pity) / PITY_AT);
}

// ---------- squad
function squadSkeleton() {
  return `<section class="panel mil-squad">
      <div class="mil-slots" data-f="slots"></div>
      <div class="mil-spow">
        <div><span>Heroes</span><b data-f="hp">0</b></div>
        <div><span>Troops</span><b data-f="tp">0</b></div>
        <div class="is-total"><span>Squad power</span><b data-f="sp">0</b></div>
      </div>
      <div class="mil-sbtns">
        <button type="button" class="btn blue" data-act="auto" id="mil-squad-auto">Auto fill</button>
        <button type="button" class="btn gold" data-go="explore">${Game.icon('sword', 18)}Explore</button>
      </div>
    </section>
    <p class="mil-hint">Tap a slot to choose a hero. Your 3 squad heroes lead every troop you own into Explore battles, and troops are never lost.</p>
    <h3 class="section-title">Troops in the squad</h3>
    <div class="mil-stroops" data-f="troops"></div>`;
}
function slotHtml(i) {
  const id = mil().squad[i];
  const posName = `Slot ${i + 1}`;
  if (!id || !heroRec(id)) {
    return `<button type="button" class="mil-slot is-empty" data-slot="${i}" aria-label="${posName} slot, empty. Choose a hero"><span class="mil-slot-plus">${Game.icon('plus', 26)}</span><span class="mil-slot-pos">${posName}</span><span class="mil-slot-name">Empty</span></button>`;
  }
  const d = HERO[id];
  const h = heroRec(id);
  return `<button type="button" class="mil-slot rarity-${d.rarity}" data-slot="${i}" aria-label="${posName} slot, ${esc(d.name)}, level ${h.lv}. Change hero">${porHtml(id)}${clsBadge(id)}<span class="mil-lv">Lv ${h.lv}</span><span class="mil-stars">${starsHtml(h.stars, 10)}</span><span class="mil-slot-pos">${posName}</span><span class="mil-slot-name">${esc(d.short)}</span></button>`;
}
function updateSquad(view) {
  const sq = mil().squad;
  const sig = sq.map(id => (id ? `${id}:${heroRec(id)?.lv}.${heroRec(id)?.stars}` : '-')).join('|');
  if (ui.sig.squad !== sig) {
    ui.sig.squad = sig;
    view.querySelector('[data-f="slots"]').innerHTML = [0, 1, 2].map(slotHtml).join('');
  }
  txt(view, '[data-f="hp"]', fmtFull(heroesPowerInSquad()));
  txt(view, '[data-f="tp"]', fmtFull(troopPower()));
  txt(view, '[data-f="sp"]', fmtFull(battlePower()));
  setDisabled(view.querySelector('#mil-squad-auto'), ownedIds().slice(0, 3).join() === squadIds().join());
  const tsig = TROOP_TYPES.map(t => `${troopCount(t)}:${tierOf(t)}`).join('|');
  if (ui.sig.stroops !== tsig) {
    ui.sig.stroops = tsig;
    view.querySelector('[data-f="troops"]').innerHTML = TROOP_TYPES.map(t => `<div class="mil-strow card">${Game.tileHtml({ icon: TROOPS[t].icon, rarity: TIER_RARITY[tierOf(t) - 1] })}<div><div class="mil-strow-n">${TROOPS[t].name} <span class="mil-tierchip">T${tierOf(t)}</span></div><div class="mil-strow-s">${fmtFull(troopCount(t))} troops, ${TIER_POWER[tierOf(t) - 1]} power each</div></div><button type="button" class="btn ghost small" data-go="heroes:troops">Train</button></div>`).join('');
  }
}

// ---------- troops
function troopsSkeleton() {
  return `<div class="mil-camps" data-f="camps"></div>
    <div class="card mil-tsum"><div><span class="muted">Total troops</span><b data-f="total">0</b></div><div><span class="muted">Troop power</span><b data-f="tpow">0</b></div></div>
    <p class="mil-hint">Camp level sets the troop tier: T2 at Lv ${TIER_MIN_CAMP[1]}, T3 at Lv ${TIER_MIN_CAMP[2]}, T4 at Lv ${TIER_MIN_CAMP[3]}, T5 at Lv ${TIER_MIN_CAMP[4]}. Every troop you own fights at its camp's current tier.</p>`;
}
function campCardHtml(type) {
  const T = TROOPS[type];
  const lv = campLevel(type);
  if (lv < 1) {
    return `<div class="mil-camp card is-unbuilt" data-type="${type}"><div class="mil-camp-art">${Game.tileHtml({ icon: T.icon })}</div><div class="mil-camp-info"><div class="mil-camp-name">${T.name}</div><div class="mil-camp-sub">Build the ${T.campName} to train ${T.name}.</div></div><div class="mil-camp-btns"><button type="button" class="btn blue small" data-act="build" data-type="${type}">Go</button></div></div>`;
  }
  const t = tierOf(type);
  return `<div class="mil-camp card" data-type="${type}">
    <div class="mil-camp-art">${Game.tileHtml({ icon: T.icon, rarity: TIER_RARITY[t - 1] })}<span class="mil-tierchip">T${t}</span></div>
    <div class="mil-camp-info">
      <div class="mil-camp-name">${T.name}<span class="mil-idlechip" data-f="idle">Idle</span></div>
      <div class="mil-camp-sub">Owned <b data-f="count">0</b> &middot; ${T.campName} Lv ${lv}</div>
      <div class="mil-camp-prog" data-f="prog" hidden><div class="progress"><div class="bar"></div><span class="progress-label"></span></div></div>
    </div>
    <div class="mil-camp-btns">
      <button type="button" class="btn gold small" data-act="train" data-type="${type}" id="mil-camp-train-${type}">Train</button>
      <button type="button" class="btn blue small" data-act="speed" data-type="${type}" id="mil-camp-speed-${type}" hidden>Speed up</button>
    </div>
  </div>`;
}
function updateCampCard(card, type) {
  const id = trainId(type);
  const t = Game.timers.get(id);
  txt(card, '[data-f="count"]', fmtFull(troopCount(type)));
  setHidden(card.querySelector('[data-f="idle"]'), !!t);
  const prog = card.querySelector('[data-f="prog"]');
  if (!prog) return;
  setHidden(prog, !t);
  const trainBtn = card.querySelector('[data-act="train"]');
  const speedBtn = card.querySelector('[data-act="speed"]');
  setHidden(trainBtn, !!t);
  setHidden(speedBtn, !t);
  if (t) {
    const rem = Game.timers.remaining(id);
    setWidth(prog.querySelector('.bar'), Game.timers.progress(id));
    txt(prog, '.progress-label', `${fmtFull(t.data?.count || 0)} in ${Game.fmtTime(rem)}`);
    const free = rem <= Game.perk('freeFinishSec');
    setHtml(speedBtn, free ? 'Free' : 'Speed up');
    const k = 'btn small ' + (free ? 'green' : 'blue');
    if (speedBtn.className !== k) speedBtn.className = k;
  }
}
function updateTroops(view) {
  const sig = TROOP_TYPES.map(t => `${campLevel(t)}:${tierOf(t)}`).join('|');
  const box = view.querySelector('[data-f="camps"]');
  if (ui.sig.camps !== sig) {
    ui.sig.camps = sig;
    box.innerHTML = TROOP_TYPES.map(campCardHtml).join('');
  }
  box.querySelectorAll('.mil-camp').forEach(c => updateCampCard(c, c.dataset.type));
  txt(view, '[data-f="total"]', fmtFull(totalTroops()));
  txt(view, '[data-f="tpow"]', fmtFull(troopPower()));
}

// ================================================================ hero sheet
function openHero(id) {
  const d = HERO[id];
  if (!d || !Game.S) return null;
  const body = Game.el(`<div class="mil-hs rarity-${d.rarity}"></div>`);
  let built = null;
  const build = () => {
    built = heroRec(id) ? 'owned' : 'locked';
    body.innerHTML = heroSheetHtml(id);
  };
  build();
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (b.dataset.go) { Game.navigate(b.dataset.go); return; }
    if (act === 'level') {
      if (levelUp(id)) { flash(body, '.mil-hs-por'); Game.toast(`${d.short} reached Lv ${heroRec(id).lv}`, 'good'); }
      else if (Game.itemCount('xp_book') < booksForNext(id)) Game.missingSheet({ items: { xp_book: booksForNext(id) } }, { title: 'Not enough XP Books', message: 'Earn XP Books from Explore stages and the idle chest.', actions: [{ label: 'Go to Explore', kind: 'blue', onClick: () => Game.navigate('explore') }] });
    } else if (act === 'book') {
      const before = heroRec(id).lv;
      if (useBook(id) && heroRec(id).lv > before) { flash(body, '.mil-hs-por'); Game.toast(`${d.short} reached Lv ${heroRec(id).lv}`, 'good'); }
    } else if (act === 'star') {
      if (starUp(id)) { flash(body, '.mil-hs-por'); Game.toast(`${d.short} now has ${heroRec(id).stars} ${heroRec(id).stars === 1 ? 'star' : 'stars'}`, 'good'); }
    } else if (act === 'unlock') {
      if (unlockHero(id)) { build(); Game.rewardPopup({ custom: [{ iconHtml: `<span class="mil-tilepor">${portraitSvg(id)}</span>`, name: d.name, count: 'New', rarity: d.rarity }] }, 'Hero unlocked'); }
    } else if (act === 'squad-add') {
      const i = mil().squad.indexOf(null);
      if (i >= 0) assignSlot(i, id); else { Game.navigate('heroes:squad'); return; }
    } else if (act === 'squad-remove') {
      const i = mil().squad.indexOf(id);
      if (i >= 0) assignSlot(i, null);
    }
    sheet.refresh();
  });
  const sheet = Game.sheet({
    title: d.name,
    body,
    className: 'mil-hero-sheet',
    update: bodyEl => {
      if ((heroRec(id) ? 'owned' : 'locked') !== built) build();
      updateHeroSheet(bodyEl, id);
    },
  });
  return sheet;
}
function flash(root, sel) {
  if (reduced()) return;
  const n = root.querySelector(sel);
  if (!n) return;
  n.classList.remove('is-flash');
  void n.offsetWidth;
  n.classList.add('is-flash');
}
function heroSheetHtml(id) {
  const d = HERO[id];
  const h = heroRec(id);
  const R = RARITIES[d.rarity];
  const C = CLASSES[d.cls];
  const top = `<div class="mil-hs-top">
      <div class="mil-hs-por">${porHtml(id, h ? '' : ' is-dim')}${clsBadge(id, 16)}</div>
      <div class="mil-hs-info">
        <div class="mil-hs-tags"><span class="chip rarity-${d.rarity} mil-rchip">${R.name}</span><span class="chip">${Game.icon(C.icon, 16)}${C.name}</span></div>
        <p class="mil-hs-bio">${esc(d.bio)}</p>
        <p class="mil-hs-role">${esc(C.role)}</p>
        <div class="mil-hs-power">${Game.icon('power', 18)}<span data-f="power">0</span></div>
      </div>
    </div>`;
  const stats = `<div class="mil-stats">${[['atk', 'ATK', 'sword'], ['def', 'DEF', 'shield'], ['hp', 'HP', 'heart']].map(([k, n, ic]) => `<div class="mil-stat">${Game.icon(ic, 18)}<span class="mil-stat-k">${n}</span><span class="mil-stat-v" data-f="${k}">0</span><span class="mil-stat-up" data-f="${k}-up"></span></div>`).join('')}</div>`;
  if (!h) {
    return `${top}${stats}
      <section class="card mil-hs-sec">
        <div class="mil-hs-row"><span class="mil-hs-h">Unlock</span><span class="mil-hs-own">${Game.icon('mil_shard_' + id, 20)}<span data-f="shards">0</span> / ${UNLOCK_SHARDS}</span></div>
        <div class="progress gold"><div class="bar" data-f="shardbar"></div></div>
        <p class="mil-hs-note">Collect ${UNLOCK_SHARDS} ${esc(d.short)} shards from recruiting to unlock this hero. Stats shown at Lv 1.</p>
        <div class="mil-hs-btns"><button type="button" class="btn blue" data-go="heroes:recruit">Recruit</button><button type="button" class="btn gold" data-act="unlock" id="mil-hero-unlock">Unlock</button></div>
      </section>`;
  }
  return `${top}${stats}
    <section class="card mil-hs-sec">
      <div class="mil-hs-row"><span class="mil-hs-h">Level <span data-f="lv"></span><span class="mil-hs-cap"> / <span data-f="cap"></span></span></span><span class="mil-hs-own">${Game.icon('xp', 20)}<span data-f="books">0</span></span></div>
      <div class="progress green"><div class="bar" data-f="xpbar"></div><span class="progress-label" data-f="xptext"></span></div>
      <p class="mil-hs-note" data-f="lvnote"></p>
      <div class="mil-hs-btns" data-f="lvbtns">
        <button type="button" class="btn ghost" data-act="book" id="mil-hero-book">Use 1 Book</button>
        <button type="button" class="btn gold" data-act="level" id="mil-hero-level"></button>
      </div>
      <div class="mil-hs-btns" data-f="capbtns" hidden><button type="button" class="btn blue" data-go="city:building:furnace">Go to Furnace</button></div>
    </section>
    <section class="card mil-hs-sec">
      <div class="mil-hs-row"><span class="mil-hs-h">Stars <span class="mil-stars mil-stars-lg" data-f="stars"></span></span><span class="mil-hs-own">${Game.icon('mil_shard_' + id, 20)}<span data-f="shards">0</span></span></div>
      <div class="progress gold" data-f="shardwrap"><div class="bar" data-f="shardbar"></div><span class="progress-label" data-f="shardtext"></span></div>
      <p class="mil-hs-note" data-f="starnote">Each star adds ${Math.round(STAR_BONUS * 100)}% to all stats. Shards come from recruiting; duplicates give ${DUPE_SHARDS}.</p>
      <div class="mil-hs-btns"><button type="button" class="btn blue" data-go="heroes:recruit">Recruit</button><button type="button" class="btn gold" data-act="star" id="mil-hero-star">Star up</button></div>
    </section>
    <section class="card mil-hs-sec mil-hs-squad">
      <div class="mil-hs-row"><span class="mil-hs-h">Squad</span><span class="mil-hs-own" data-f="sqtext"></span></div>
      <div class="mil-hs-btns"><button type="button" class="btn ghost" data-act="squad-remove" id="mil-hero-sq-remove">Remove</button><button type="button" class="btn blue" data-act="squad-add" id="mil-hero-sq-add">Add to squad</button></div>
    </section>`;
}
function updateHeroSheet(b, id) {
  const h = heroRec(id);
  const s = heroStats(id);
  txt(b, '[data-f="power"]', fmtFull(h ? heroPower(id) : previewPower(id)));
  for (const k of ['atk', 'def', 'hp']) txt(b, `[data-f="${k}"]`, fmtFull(s[k]));
  if (!h) {
    const sh = shardsOf(id);
    txt(b, '[data-f="shards"]', fmtFull(sh));
    setWidth(b.querySelector('[data-f="shardbar"]'), sh / UNLOCK_SHARDS);
    setDisabled(b.querySelector('#mil-hero-unlock'), sh < UNLOCK_SHARDS);
    return;
  }
  const cap = maxLevel();
  const atCap = h.lv >= cap;
  const next = atCap ? null : statsFor(id, h.lv + 1, h.stars);
  for (const k of ['atk', 'def', 'hp']) txt(b, `[data-f="${k}-up"]`, next ? `+${fmtFull(next[k] - s[k])}` : '');
  txt(b, '[data-f="lv"]', h.lv);
  txt(b, '[data-f="cap"]', cap);
  const books = Game.itemCount('xp_book');
  txt(b, '[data-f="books"]', fmtFull(books));
  const need = xpToNext(h.lv);
  setWidth(b.querySelector('[data-f="xpbar"]'), atCap ? 1 : h.xp / need);
  txt(b, '[data-f="xptext"]', atCap ? 'Max' : `${fmtFull(h.xp)} / ${fmtFull(need)} XP`);
  const needBooks = booksForNext(id);
  const note = b.querySelector('[data-f="lvnote"]');
  let noteText = '';
  if (h.lv >= LEVEL_CAP) noteText = 'This hero is at the highest level.';
  else if (atCap) noteText = Game.furnaceLevel() >= 30 ? 'Highest level for your Furnace.' : `Furnace Lv ${Game.furnaceLevel()} caps heroes at Lv ${cap}. Upgrade the Furnace to Lv ${furnaceForLevel(h.lv + 1)} to go higher.`;
  else if (books < needBooks) noteText = `Next level needs ${needBooks} XP ${needBooks === 1 ? 'Book' : 'Books'}. Earn more in Explore.`;
  Game.setText(note, noteText);
  setHidden(note, !noteText);
  setHidden(b.querySelector('[data-f="lvbtns"]'), atCap);
  setHidden(b.querySelector('[data-f="capbtns"]'), !atCap || h.lv >= LEVEL_CAP || Game.furnaceLevel() >= 30);
  const lvBtn = b.querySelector('#mil-hero-level');
  setHtml(lvBtn, `<span>Level up</span><span class="btn-cost">${Game.icon('xp', 18)}x${needBooks}</span>`);
  setDisabled(lvBtn, atCap || books < 1);
  setDisabled(b.querySelector('#mil-hero-book'), atCap || books < 1);
  // stars
  setHtml(b.querySelector('[data-f="stars"]'), starsHtml(h.stars, 15));
  const sh = shardsOf(id);
  txt(b, '[data-f="shards"]', fmtFull(sh));
  const maxed = h.stars >= MAX_STARS;
  const cost = maxed ? 0 : STAR_COST[h.stars];
  setWidth(b.querySelector('[data-f="shardbar"]'), maxed ? 1 : sh / cost);
  txt(b, '[data-f="shardtext"]', maxed ? 'Max stars' : `${fmtFull(sh)} / ${cost} shards`);
  const starBtn = b.querySelector('#mil-hero-star');
  setHtml(starBtn, maxed ? 'Max stars' : `<span>Star up</span><span class="btn-cost">${Game.icon('mil_shard_' + id, 18)}x${cost}</span>`);
  setDisabled(starBtn, maxed || sh < cost);
  // squad
  const slot = mil().squad.indexOf(id);
  const inSquad = slot >= 0;
  txt(b, '[data-f="sqtext"]', inSquad ? `In the squad, slot ${slot + 1}` : 'Not in the squad');
  const rm = b.querySelector('#mil-hero-sq-remove');
  const add = b.querySelector('#mil-hero-sq-add');
  setHidden(rm, !inSquad);
  setDisabled(rm, inSquad && squadIds().length <= 1);
  setHidden(add, inSquad);
  setHtml(add, mil().squad.includes(null) ? 'Add to squad' : 'Change squad');
}

// ================================================================ squad slot picker
function openSlotPicker(slot) {
  const ids = ownedIds();
  const cur = mil().squad[slot];
  const body = Game.el(`<div class="mil-pick">${ids.map(id => {
    const d = HERO[id];
    const h = heroRec(id);
    const at = mil().squad.indexOf(id);
    return `<button type="button" class="mil-pick-row card${id === cur ? ' is-current' : ''}" data-pick="${id}" aria-pressed="${id === cur}">${porHtml(id)}<span class="mil-pick-info"><span class="mil-pick-n rarity-${d.rarity} rarity-text">${esc(d.name)}</span><span class="mil-pick-s">${Game.icon(CLASSES[d.cls].icon, 14)}${CLASSES[d.cls].name} &middot; Lv ${h.lv} &middot; ${starsHtml(h.stars, 10)}</span></span><span class="mil-pick-r"><span class="mil-pick-p">${Game.icon('power', 14)}${fmtFull(heroPower(id))}</span>${at >= 0 ? `<span class="mil-pick-tag">Slot ${at + 1}</span>` : ''}</span></button>`;
  }).join('')}</div>`);
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    assignSlot(slot, b.dataset.pick);
    sheet.close();
  });
  const canRemove = !!cur && squadIds().length > 1;
  const sheet = Game.sheet({
    title: `Squad slot ${slot + 1}`,
    body,
    className: 'mil-pick-sheet',
    actions: cur ? [{ label: 'Remove from slot', kind: 'ghost', disabled: !canRemove, onClick: () => { assignSlot(slot, null); } }] : [],
  });
  return sheet;
}

// ================================================================ training sheet
function openTraining(type) {
  const T = TROOPS[type];
  if (!T || !Game.S) return null;
  if (campLevel(type) < 1) {
    return Game.confirmSheet({ title: T.campName, message: `Build the ${T.campName} in your city to train ${T.name}.`, confirmLabel: 'Go', kind: 'blue', onConfirm: () => Game.navigate('city:building:' + T.camp) });
  }
  const tid = trainId(type);
  const cap = batchCap(type);
  let qty = clamp(maxAffordable(type) || 1, 1, cap);
  const body = Game.el(`<div class="mil-train">
    <div class="mil-train-top">
      <div class="mil-train-art">${Game.tileHtml({ icon: T.icon, rarity: TIER_RARITY[tierOf(type) - 1] })}<span class="mil-tierchip" data-f="tier"></span></div>
      <div class="mil-train-info">
        <div class="mil-train-sub">${T.campName} Lv <span data-f="camp"></span> &middot; <span data-f="per"></span> power each</div>
        <div class="mil-train-owned">Owned <b data-f="owned">0</b></div>
        <p class="mil-train-desc">${esc(T.desc)}</p>
      </div>
    </div>
    <div class="mil-train-busy card" data-f="busy" hidden>
      <div class="mil-train-busy-t" data-f="busyt"></div>
      <div class="progress"><div class="bar" data-f="busybar"></div><span class="progress-label" data-f="busyrem"></span></div>
      <button type="button" class="btn blue small" data-act="speed" id="mil-train-speed-${type}">Speed up</button>
    </div>
    <div class="mil-train-form" data-f="form">
      <div class="mil-train-row"><label class="mil-train-lbl" for="mil-train-num-${type}">Amount</label><span class="muted">Max per batch ${fmtFull(cap)}</span></div>
      <div class="mil-stepper">
        <button type="button" class="icon-btn" data-q="-1" aria-label="One less">${Game.icon('minus', 16)}</button>
        <input type="range" id="mil-train-range-${type}" min="1" max="${cap}" step="1" value="${qty}" aria-label="Amount to train">
        <button type="button" class="icon-btn" data-q="1" aria-label="One more">${Game.icon('plus', 16)}</button>
        <input type="number" class="mil-train-num" id="mil-train-num-${type}" min="1" max="${cap}" step="1" value="${qty}" inputmode="numeric">
      </div>
      <div class="mil-train-quick"><button type="button" class="btn ghost small" data-q="min">Min</button><button type="button" class="btn ghost small" data-q="half">Half</button><button type="button" class="btn ghost small" data-q="max">Max</button></div>
      <div class="mil-train-cost"><span class="mil-train-k">Cost</span><span data-f="cost"></span></div>
      <div class="mil-train-meta"><span>${Game.icon('clock', 16)}<b data-f="time"></b></span><span>${Game.icon('power', 16)}<b data-f="gain"></b></span></div>
    </div>
  </div>`);
  const range = body.querySelector(`#mil-train-range-${type}`);
  const numIn = body.querySelector(`#mil-train-num-${type}`);
  const setQty = (v, from) => {
    qty = clamp(int(v) || 1, 1, cap);
    if (from !== range) range.value = String(qty);
    if (from !== numIn) numIn.value = String(qty);
    sheet?.refresh();
  };
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'speed') { freeFinishTraining(type); return; }
    const q = b.dataset.q;
    if (!q) return;
    if (q === 'min') setQty(1);
    else if (q === 'max') setQty(Math.max(1, maxAffordable(type)));
    else if (q === 'half') setQty(Math.max(1, Math.ceil(maxAffordable(type) / 2)));
    else setQty(qty + int(q));
  });
  range.addEventListener('input', () => setQty(range.value, range));
  numIn.addEventListener('input', () => { if (numIn.value !== '') setQty(numIn.value, numIn); });
  numIn.addEventListener('change', () => setQty(numIn.value));
  let sheet = null;
  sheet = Game.sheet({
    title: `Train ${T.name}`,
    body,
    className: 'mil-train-sheet',
    update: b => {
      const t = Game.timers.get(tid);
      const tier = tierOf(type);
      txt(b, '[data-f="tier"]', 'T' + tier);
      txt(b, '[data-f="camp"]', campLevel(type));
      txt(b, '[data-f="per"]', TIER_POWER[tier - 1]);
      txt(b, '[data-f="owned"]', fmtFull(troopCount(type)));
      setHidden(b.querySelector('[data-f="busy"]'), !t);
      setClass(b.querySelector('[data-f="form"]'), 'is-busy', !!t);
      if (t) {
        const rem = Game.timers.remaining(tid);
        txt(b, '[data-f="busyt"]', `Training ${fmtFull(t.data?.count || 0)} ${T.name}`);
        setWidth(b.querySelector('[data-f="busybar"]'), Game.timers.progress(tid));
        txt(b, '[data-f="busyrem"]', Game.fmtTime(rem));
        const sb = b.querySelector(`#mil-train-speed-${type}`);
        const free = rem <= Game.perk('freeFinishSec');
        setHtml(sb, free ? 'Free' : 'Speed up');
        const k = 'btn small ' + (free ? 'green' : 'blue');
        if (sb.className !== k) sb.className = k;
      }
      setHtml(b.querySelector('[data-f="cost"]'), Game.costHtml(trainCost(type, qty)));
      txt(b, '[data-f="time"]', Game.fmtTime(trainSeconds(type, qty)));
      txt(b, '[data-f="gain"]', '+' + fmtFull(qty * TIER_POWER[tier - 1]));
    },
    actions: [{
      id: 'train',
      label: () => (Game.timers.get(tid) ? 'Camp busy' : `${Game.icon('troop_' + type, 20)}<span>Train ${fmtFull(qty)}</span>`),
      kind: 'gold',
      disabled: () => !!Game.timers.get(tid),
      onClick: () => {
        const cost = trainCost(type, qty);
        if (!Game.has(cost)) { Game.missingSheet(cost, { title: 'Not enough resources' }); return false; }
        return startTraining(type, qty) ? undefined : false;
      },
    }],
  });
  return sheet;
}

// ================================================================ recruit reveal
function revealCardHtml(r, i) {
  const d = HERO[r.heroId];
  const tag = r.isNew ? '<span class="mil-rc-tag is-new">New</span>' : r.dupe ? `<span class="mil-rc-tag">+${r.shards}</span>` : `<span class="mil-rc-tag">+${r.shards}</span>`;
  const kind = r.kind === 'hero' ? (r.isNew ? 'Hero' : 'Duplicate') : 'Shards';
  return `<div class="mil-rc rarity-${d.rarity}${r.kind === 'shards' ? ' is-shards' : ''}" data-i="${i}">
    <div class="mil-rc-in">
      <div class="mil-rc-back" aria-hidden="true"><span class="mil-rc-emblem">${Game.icon('flame', 26)}</span></div>
      <div class="mil-rc-face">
        ${porHtml(r.heroId)}
        ${r.kind === 'shards' || r.dupe ? `<span class="mil-rc-shard">${Game.icon('shard', 18)}</span>` : ''}
        ${tag}
        <span class="mil-rc-name">${esc(d.short)}</span>
        <span class="mil-rc-kind">${kind}</span>
      </div>
    </div>
  </div>`;
}
function openReveal(results, n) {
  const multi = results.length > 1;
  const body = Game.el(`<div class="mil-reveal ${multi ? 'is-multi' : 'is-single'}">
    <div class="mil-reveal-rays" aria-hidden="true"></div>
    <div class="mil-rgrid">${results.map(revealCardHtml).join('')}</div>
    <div class="mil-rsum" hidden aria-live="polite"></div>
    <div class="mil-rbar">
      <button type="button" class="btn ghost" data-act="skip" id="mil-reveal-skip">Skip</button>
      <button type="button" class="btn gold" data-act="again" id="mil-reveal-again" hidden></button>
      <button type="button" class="btn green" data-act="ok" id="mil-reveal-ok" hidden>OK</button>
    </div>
  </div>`);
  const timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const cards = [...body.querySelectorAll('.mil-rc')];
  let done = false;
  const flip = i => cards[i]?.classList.add('is-flipped');
  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    cards.forEach(c => c.classList.add('is-flipped'));
    const fresh = results.filter(r => r.isNew).map(r => HERO[r.heroId]);
    const shardN = results.filter(r => !r.isNew).reduce((t, r) => t + (r.shards || 0), 0);
    const parts = [];
    if (fresh.length) parts.push(`New ${fresh.length === 1 ? 'hero' : 'heroes'}: <b>${fresh.map(h => `<span class="rarity-${h.rarity} rarity-text">${esc(h.name)}</span>`).join(', ')}</b>`);
    if (shardN) parts.push(`+${shardN} ${shardN === 1 ? 'shard' : 'shards'}`);
    parts.push(`Legendary hero within ${pityLeft()} ${pityLeft() === 1 ? 'pull' : 'pulls'}`);
    const sum = body.querySelector('.mil-rsum');
    sum.innerHTML = parts.map(x => `<span>${x}</span>`).join('<span class="mil-dotsep" aria-hidden="true"></span>');
    sum.hidden = false;
    body.querySelector('#mil-reveal-skip').hidden = true;
    const again = body.querySelector('#mil-reveal-again');
    again.innerHTML = `<span>Again x${n}</span><span class="btn-cost">${costLabel(n)}</span>`;
    again.hidden = false;
    body.querySelector('#mil-reveal-ok').hidden = false;
    try { body.querySelector('#mil-reveal-ok').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'skip') finish();
    else if (b.dataset.act === 'ok') sheet.close();
    else if (b.dataset.act === 'again') { sheet.close(); startRecruit(n); }
  });
  const sheet = Game.sheet({ title: multi ? 'Recruit x10' : 'Recruit', body, className: 'mil-reveal-sheet', onClose: () => { timers.forEach(clearTimeout); } });
  if (reduced()) { body.classList.add('is-instant'); finish(); return sheet; }
  let t = 380;
  cards.forEach((c, i) => {
    const leg = results[i].rarity === 'legendary';
    const epic = results[i].rarity === 'epic';
    if (leg || (epic && !multi)) { later(t, () => c.classList.add('is-charging')); t += leg ? 650 : 380; }
    later(t, () => flip(i));
    t += multi ? 210 : 300;
  });
  later(t + 280, finish);
  return sheet;
}

// ================================================================ explore screen
const MAP_PTS = [[12, 58], [36, 61], [61, 57], [86, 53], [72, 35], [46, 37], [20, 32], [28, 12], [55, 15], [83, 11]];
const MAP_H = 72;
function mapPathD(pts) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}
function pineSvg(x, y, s) {
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(2)})"><rect x="-.5" y="0" width="1" height="2" fill="#3b2a1e"/><path d="M0 -8 L 3.6 -2.4 L 2.2 -2.4 L 4.6 1 L -4.6 1 L -2.2 -2.4 L -3.6 -2.4 Z" fill="#2a4a5c"/><path d="M0 -8 L 3.6 -2.4 L 2.2 -2.4 L 4.6 1 L 0 1 Z" fill="#1d3a4c"/><path d="M0 -8 L 1.6 -5.6 L .4 -5 L -1.6 -5.6 Z M -2.4 -2.4 L -.4 -1.6 L 2.4 -2.4" fill="#e9f2fa"/></g>`;
}
function mapBgSvg(ch) {
  const g = uid('milmap');
  const rng = seeded(ch * 7919 + 13);
  const near = (x, y, r) => MAP_PTS.some(p => Math.hypot(p[0] - x, p[1] - y) < r);
  const pines = [];
  let tries = 0;
  while (pines.length < 22 && tries < 400) {
    tries++;
    const x = 3 + rng() * 94;
    const y = 6 + rng() * (MAP_H - 8);
    if (near(x, y, 9) || pines.some(p => Math.hypot(p[0] - x, p[1] - y) < 4.5)) continue;
    pines.push([x, y, 0.75 + rng() * 0.5]);
  }
  pines.sort((a, b) => a[1] - b[1]);
  const rocks = [];
  tries = 0;
  while (rocks.length < 5 && tries < 200) {
    tries++;
    const x = 4 + rng() * 92;
    const y = 8 + rng() * (MAP_H - 10);
    if (near(x, y, 8)) continue;
    rocks.push(`<path d="M${(x - 2.6).toFixed(1)} ${y.toFixed(1)} l1 -2.2 l2.2 -.8 l1.8 1.4 l.6 1.6 Z" fill="#7d93a8"/><path d="M${(x - 1.6).toFixed(1)} ${(y - 2.2).toFixed(1)} l2.2 -.8 l1 .7 l-2.4 .4 Z" fill="#eef5fb"/>`);
  }
  const lake = [[78, 66], [18, 46], [60, 26], [40, 64]][ch % 4];
  const hue = ['#a9c0d6', '#a2b9d2', '#adc2d4', '#9fb7cf'][ch % 4];
  return `<svg class="mil-map-bg" viewBox="0 0 100 ${MAP_H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id="${g}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f9bb8"/><stop offset=".35" stop-color="${hue}"/><stop offset="1" stop-color="#c9d9e8"/></linearGradient>
    <radialGradient id="${g}b" cx=".5" cy=".5" r=".6"><stop offset=".55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#0a1524" stop-opacity=".45"/></radialGradient></defs>
    <rect width="100" height="${MAP_H}" fill="url(#${g}a)"/>
    <path d="M0 0 H100 V9 C 88 12, 76 6, 64 10 C 52 14, 42 7, 30 11 C 20 14, 10 9, 0 12 Z" fill="#6c88a6" opacity=".7"/>
    <path d="M0 0 H100 V5 L 92 8 L 84 3 L 74 7 L 63 2 L 52 6 L 41 1.5 L 30 6 L 18 2.5 L 8 7 L 0 4 Z" fill="#5a7593"/>
    <ellipse cx="22" cy="24" rx="20" ry="7" fill="#dbe7f2" opacity=".5"/><ellipse cx="78" cy="44" rx="22" ry="8" fill="#dbe7f2" opacity=".45"/><ellipse cx="44" cy="66" rx="30" ry="7" fill="#e3edf6" opacity=".5"/>
    <ellipse cx="${lake[0]}" cy="${lake[1]}" rx="9" ry="3.6" fill="#8fd0ee" opacity=".75"/><ellipse cx="${lake[0]}" cy="${lake[1]}" rx="9" ry="3.6" fill="none" stroke="#e9f6fd" stroke-width=".6"/><path d="M${lake[0] - 5} ${lake[1] - .6} l4 -.8 M${lake[0] + 1} ${lake[1] + 1} l3.4 -.6" stroke="#ffffff" stroke-width=".5" opacity=".8"/>
    ${rocks.join('')}
    ${pines.map(p => pineSvg(p[0], p[1], p[2])).join('')}
    <rect width="100" height="${MAP_H}" fill="url(#${g}b)"/>
  </svg>`;
}
function mapHtml(ch) {
  const st = mil().stage;
  const first = (ch - 1) * STAGES_PER_CHAPTER + 1;
  const d = mapPathD(MAP_PTS);
  const doneIdx = clamp(st - first + 1, 0, 10);
  const donePts = MAP_PTS.slice(0, Math.max(1, Math.min(10, doneIdx + 1)));
  const nodes = MAP_PTS.map((p, i) => {
    const s = first + i;
    const state = s <= st ? 'done' : s === st + 1 ? 'next' : 'locked';
    const boss = isBoss(s);
    const icon = state === 'done' ? Game.icon('check', boss ? 22 : 18) : state === 'next' ? (boss ? enemySvg(stageEnemies(s)[0].type, true, 'mil-node-esvg') : Game.icon('sword', 20)) : (boss ? enemySvg(stageEnemies(s)[0].type, true, 'mil-node-esvg') : Game.icon('lock', 16));
    const lbl = state === 'done' ? 'cleared' : state === 'next' ? 'next battle' : 'locked';
    return `<button type="button" class="mil-node is-${state}${boss ? ' is-boss' : ''}" data-node="${s}" style="left:${p[0]}%;top:${((p[1] / MAP_H) * 100).toFixed(2)}%" aria-label="Stage ${stageLabel(s)}${boss ? ', boss' : ''}, ${lbl}"><span class="mil-node-ico">${icon}</span><span class="mil-node-lbl">${stageLabel(s)}</span></button>`;
  }).join('');
  return `${mapBgSvg(ch)}
    <svg class="mil-map-path" viewBox="0 0 100 ${MAP_H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="${d}" fill="none" stroke="#1d3a57" stroke-opacity=".35" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <path d="${d}" fill="none" stroke="#f4f8fc" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      ${doneIdx > 0 ? `<path d="${mapPathD(donePts)}" fill="none" stroke="#ffc94a" stroke-width="3.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : ''}
    </svg>
    ${nodes}`;
}
function exploreSkeleton() {
  return `<div class="mil-explore">
    <section class="panel mil-idle">
      <button type="button" class="mil-idle-open" data-act="idle" id="mil-idle-open" aria-label="Idle rewards details">
        <span class="mil-idle-chest">${chestSvg()}</span>
        <span class="mil-idle-info">
          <span class="mil-idle-t">Idle rewards</span>
          <span class="mil-idle-s"><span data-f="itime">0m</span> of <span data-f="icap">8h</span> stored</span>
          <span class="progress gold"><span class="bar" data-f="ibar"></span></span>
        </span>
      </button>
      <button type="button" class="btn green" data-act="claim" id="mil-idle-claim">Claim</button>
    </section>
    <div class="mil-chead">
      <button type="button" class="icon-btn" data-act="prev" id="mil-ch-prev" aria-label="Previous chapter">${Game.icon('chevron_left', 18)}</button>
      <div class="mil-chead-t"><span class="mil-chead-k">Chapter <span data-f="chn">1</span></span><span class="mil-chead-n" data-f="chname"></span></div>
      <span class="mil-chead-p" data-f="chprog"></span>
      <button type="button" class="icon-btn" data-act="next" id="mil-ch-next" aria-label="Next chapter">${Game.icon('chevron_right', 18)}</button>
    </div>
    <div class="mil-map" data-f="map"></div>
    <section class="panel mil-next" data-f="next"></section>
  </div>`;
}
function curChapter() { return Math.min(CHAPTERS.length, chapterOf(Math.min(MAX_STAGE, mil().stage + 1))); }
function nextCardHtml() {
  const s = mil().stage + 1;
  if (s > MAX_STAGE) {
    return `<div class="mil-next-done">${Game.icon('trophy', 40)}<div><div class="mil-next-t">Every stage cleared</div><p class="muted">Your idle chest now fills at its best rate. Keep your heroes strong for the events ahead.</p></div></div>`;
  }
  const foes = stageEnemies(s);
  const disp = foes[0].boss ? [foes[1], foes[0], foes[2]] : foes;
  const sq = squadIds();
  const heroId = STAGE_HEROES[s];
  return `<div class="mil-next-head">
      <div><div class="mil-next-k">${isBoss(s) ? 'Boss battle' : 'Next battle'}</div><div class="mil-next-t">Stage ${stageLabel(s)}${isBoss(s) ? ` <span class="mil-bosschip">${esc(ENEMIES[foes[0].type].boss)}</span>` : ''}</div></div>
      <span class="mil-verdict" data-f="verdict"></span>
    </div>
    <div class="mil-vs">
      <div class="mil-vs-side is-you">
        <div class="mil-vs-units">${sq.map(id => `<span class="mil-vs-hero">${porHtml(id)}</span>`).join('')}</div>
        <div class="mil-vs-pow">${Game.icon('power', 16)}<b data-f="mypow">0</b></div>
      </div>
      <div class="mil-vs-mid" aria-hidden="true">VS</div>
      <div class="mil-vs-side is-foe">
        <div class="mil-vs-units">${disp.map(f => `<span class="mil-vs-foe${f.boss ? ' is-boss' : ''}">${enemySvg(f.type, f.boss)}</span>`).join('')}</div>
        <div class="mil-vs-pow">${Game.icon('power', 16)}<b data-f="foepow">${fmtFull(enemyPower(s))}</b></div>
      </div>
    </div>
    <div class="mil-next-rw"><div class="mil-next-k">First clear</div><div class="mil-rwtiles">${rewardTilesHtml(stageRewards(s), heroId)}</div></div>
    <button type="button" class="btn gold wide mil-fight" data-act="fight" id="mil-fight">${Game.icon('sword', 22)}<span>Fight</span></button>`;
}
function mountExplore(el) {
  ui.exploreEl = el;
  el.innerHTML = exploreSkeleton();
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !el.contains(b)) return;
    if (b.dataset.node) {
      const s = int(b.dataset.node);
      const st = mil().stage;
      if (s === st + 1) openBattle();
      else if (s <= st) Game.toast(`Stage ${stageLabel(s)} is cleared`);
      else Game.toast(`Clear stage ${stageLabel(st + 1)} first`);
      return;
    }
    switch (b.dataset.act) {
      case 'fight': openBattle(); break;
      case 'claim': claimIdle(); break;
      case 'idle': openIdleSheet(); break;
      case 'prev': ui.chapter = Math.max(1, (ui.chapter || curChapter()) - 1); break;
      case 'next': ui.chapter = Math.min(curChapter(), (ui.chapter || curChapter()) + 1); break;
      default: break;
    }
    updateExplore(el);
  });
}
function updateExplore(el) {
  if (!Game.S?.mil) return;
  const s = mil();
  const cur = curChapter();
  if (!ui.chapter || ui.chapter > cur) ui.chapter = cur;
  const ch = ui.chapter;
  const first = (ch - 1) * STAGES_PER_CHAPTER + 1;
  const sigMap = `${ch}:${s.stage}`;
  if (ui.sig.map !== sigMap) {
    ui.sig.map = sigMap;
    el.querySelector('[data-f="map"]').innerHTML = mapHtml(ch);
    txt(el, '[data-f="chn"]', ch);
    txt(el, '[data-f="chname"]', CHAPTERS[ch - 1]);
  }
  txt(el, '[data-f="chprog"]', `${clamp(s.stage - first + 1, 0, 10)}/10`);
  setDisabled(el.querySelector('#mil-ch-prev'), ch <= 1);
  setDisabled(el.querySelector('#mil-ch-next'), ch >= cur);
  const sigNext = `${s.stage}:${squadIds().join(',')}`;
  const next = el.querySelector('[data-f="next"]');
  if (ui.sig.next !== sigNext) {
    ui.sig.next = sigNext;
    next.innerHTML = nextCardHtml();
  }
  if (s.stage < MAX_STAGE) {
    const my = battlePower();
    const foe = enemyPower(s.stage + 1);
    txt(next, '[data-f="mypow"]', fmtFull(my));
    const v = verdict(my / foe);
    const vEl = next.querySelector('[data-f="verdict"]');
    if (vEl) { Game.setText(vEl, v.label); const k = 'mil-verdict ' + v.cls; if (vEl.className !== k) vEl.className = k; }
    const mp = next.querySelector('[data-f="mypow"]');
    if (mp) setClass(mp.parentElement, 'is-ahead', my >= foe);
  }
  // idle
  const idle = s.idle;
  const cap = idleCapMin();
  txt(el, '[data-f="itime"]', fmtIdle(idle.min));
  txt(el, '[data-f="icap"]', fmtIdle(cap));
  setWidth(el.querySelector('[data-f="ibar"]'), idle.min / cap);
  setDisabled(el.querySelector('#mil-idle-claim'), idle.min < 1);
  setClass(el.querySelector('.mil-idle'), 'is-full', idle.min >= cap - 0.01);
  setClass(el.querySelector('.mil-idle'), 'is-ready', idle.min > 30);
}
function fmtIdle(min) {
  const m = Math.floor(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function openIdleSheet() {
  const body = Game.el(`<div class="mil-idles">
    <div class="mil-idles-top"><span class="mil-idle-chest is-big">${chestSvg()}</span><div><div class="mil-idles-time"><span data-f="time"></span> stored</div><p class="muted">Fills for up to <span data-f="cap"></span> while you play or are away. Clear more stages to raise the rate.</p></div></div>
    <div class="progress gold"><div class="bar" data-f="bar"></div></div>
    <h3 class="section-title">Ready to claim</h3>
    <div class="mil-idles-grid" data-f="grid"></div>
    <p class="mil-idles-book muted" data-f="book"></p>
    <h3 class="section-title">Per hour</h3>
    <div data-f="rate"></div>
  </div>`);
  return Game.sheet({
    title: 'Idle rewards',
    body,
    className: 'mil-idle-sheet',
    update: b => {
      const idle = mil().idle;
      const cap = idleCapMin();
      txt(b, '[data-f="time"]', fmtIdle(idle.min));
      txt(b, '[data-f="cap"]', fmtIdle(cap));
      setWidth(b.querySelector('[data-f="bar"]'), idle.min / cap);
      const r = idleRewards();
      setHtml(b.querySelector('[data-f="grid"]'), Object.keys(r).length ? Game.rewardsHtml(r) : '<p class="muted">Nothing yet. Rewards build up every minute.</p>');
      const part = Math.floor(((num(idle.xp) % XP_PER_BOOK) / XP_PER_BOOK) * 100);
      txt(b, '[data-f="book"]', `Next XP Book ${part}% filled.`);
      const rate = idleRate();
      const ph = { meat: rate.meat * 60, wood: rate.wood * 60, coal: rate.coal * 60, iron: rate.iron * 60, items: { xp_book: Math.max(1, Math.floor((rate.xp * 60) / XP_PER_BOOK)) } };
      setHtml(b.querySelector('[data-f="rate"]'), Game.costHtml(ph, { check: false }) + `<p class="muted mil-idles-ratenote">XP Books: ${+((rate.xp * 60) / XP_PER_BOOK).toFixed(2)} per hour at stage ${mil().stage ? stageLabel(mil().stage) : 'start'}.</p>`);
    },
    actions: [{ label: 'Claim', kind: 'green', id: 'claim', disabled: () => mil().idle.min < 1, onClick: () => { claimIdle(); } }],
  });
}

// ================================================================ battle
function planBattle(squad, foes, myPow, foePow, win) {
  const pos = ['mid', 'top', 'bot'];
  const A = squad.slice().sort((a, b) => CLASS_ORDER.indexOf(HERO[a].cls) - CLASS_ORDER.indexOf(HERO[b].cls))
    .map((id, i) => ({ side: 'a', id, pos: pos[i], w: Math.max(1, heroPower(id)), cls: HERO[id].cls }));
  const B = foes.map((f, i) => ({ side: 'b', type: f.type, boss: !!f.boss, pos: pos[i], w: f.boss ? 1.7 : 1 }));
  const split = (units, total) => {
    const w = units.reduce((t, u) => t + u.w, 0);
    units.forEach(u => { u.max = Math.max(10, Math.round((total * u.w) / w)); u.hp = u.max; });
  };
  split(A, Math.max(40, Math.round(myPow * 4)));
  split(B, Math.max(40, Math.round(foePow * 4)));
  const W = win ? A : B;
  const L = win ? B : A;
  const ratioW = Math.max(0.5, win ? myPow / foePow : foePow / myPow);
  const keep = clamp(1 - 0.75 / ratioW, 0.12, 0.9);
  const rnd = () => 0.8 + Math.random() * 0.4;
  // winner hits: kill every loser in order
  const hitsW = 7;
  const wq = [];
  L.forEach((u, i) => {
    const k = Math.floor(hitsW / L.length) + (i >= L.length - (hitsW % L.length) ? 1 : 0);
    const ws = Array.from({ length: k }, rnd);
    const tw = ws.reduce((t, v) => t + v, 0);
    let left = u.max;
    ws.forEach((wv, j) => {
      const dmg = j === k - 1 ? left : Math.max(1, Math.round((u.max * wv) / tw));
      left -= dmg;
      wq.push({ t: i, d: Math.max(1, dmg) });
    });
  });
  // loser hits: wound the winners, nobody falls
  const hitsL = 5;
  const lq = [];
  const counts = W.map(() => 0);
  const start = Math.floor(Math.random() * W.length);
  for (let j = 0; j < hitsL; j++) counts[(start + j) % W.length]++;
  const order = [];
  W.forEach((u, i) => {
    if (!counts[i]) return;
    const loss = u.max * (1 - keep);
    for (let j = 0; j < counts[i]; j++) order.push({ t: i, d: Math.max(1, Math.round((loss / counts[i]) * rnd())) });
  });
  order.sort(() => Math.random() - 0.5);
  lq.push(...order);
  // interleave: the player strikes first, the winner lands the final blows
  const aQ = win ? wq : lq;
  const bQ = win ? lq : wq;
  const seq = [];
  let ai = 0;
  let bi = 0;
  while (ai < aQ.length || bi < bQ.length) {
    if (ai < aQ.length) seq.push(['a', aQ[ai++]]);
    if (bi < bQ.length) seq.push(['b', bQ[bi++]]);
  }
  // simulate to pick live attackers and the final state
  const hp = { a: A.map(u => u.max), b: B.map(u => u.max) };
  const events = [];
  for (const [side, hit] of seq) {
    const foeSide = side === 'a' ? 'b' : 'a';
    const tgtList = foeSide === 'a' ? A : B;
    const winSide = win ? 'a' : 'b';
    let ti = hit.t;
    if (hp[foeSide][ti] <= 0) ti = tgtList.findIndex((u, i) => hp[foeSide][i] > 0);
    if (ti < 0) continue;
    let d = hit.d;
    if (side !== winSide) d = Math.min(d, Math.max(0, hp[foeSide][ti] - Math.ceil(tgtList[ti].max * 0.06)));
    const alive = (side === 'a' ? A : B).map((u, i) => i).filter(i => hp[side][i] > 0);
    if (!alive.length) continue;
    const from = alive[Math.floor(Math.random() * alive.length)];
    hp[foeSide][ti] = Math.max(0, hp[foeSide][ti] - d);
    events.push({ side, from, to: ti, dmg: Math.max(1, Math.round(d)), crit: Math.random() < 0.18, hpAfter: hp[foeSide][ti] });
  }
  // make sure the loser side is fully down at the end
  const loserSide = win ? 'b' : 'a';
  hp[loserSide].forEach((v, i) => { if (v > 0) { const winSide = win ? 'a' : 'b'; const al = hp[winSide].findIndex(x => x > 0); events.push({ side: winSide, from: Math.max(0, al), to: i, dmg: Math.round(v), crit: true, hpAfter: 0 }); hp[loserSide][i] = 0; } });
  return { A, B, events, final: hp };
}

function arenaBgSvg() {
  const g = uid('milar');
  return `<svg class="mil-arena-bg" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs><linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#132a46"/><stop offset="1" stop-color="#4c779f"/></linearGradient>
    <linearGradient id="${g}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe7f2"/><stop offset="1" stop-color="#93adc6"/></linearGradient></defs>
    <rect width="200" height="120" fill="url(#${g}s)"/>
    <g fill="#ffffff" opacity=".55"><circle cx="20" cy="10" r=".7"/><circle cx="64" cy="6" r=".6"/><circle cx="120" cy="12" r=".8"/><circle cx="170" cy="7" r=".6"/><circle cx="148" cy="20" r=".5"/><circle cx="38" cy="22" r=".5"/></g>
    <path d="M0 40 L 16 26 L 28 34 L 48 16 L 66 32 L 84 22 L 102 38 L 124 18 L 144 34 L 160 24 L 180 36 L 200 22 V 60 H 0 Z" fill="#7f9cba" opacity=".75"/>
    <path d="M48 16 L 42 21 L 46 21 L 50 19 L 54 21 Z M124 18 L 118 23 L 123 22 L 127 24 L 130 22 Z M16 26 L 12 30 L 18 29 Z M160 24 L 156 28 L 163 27 Z" fill="#eef5fb"/>
    <path d="M0 46 C 30 40, 60 46, 100 42 C 140 38, 170 46, 200 41 V 120 H 0 Z" fill="#6283a4" opacity=".8"/>
    <g fill="#24435e">${Array.from({ length: 16 }, (_, i) => { const x = 6 + i * 12.6 + (i % 3) * 2; const y = 46 + (i % 2) * 2; return `<path d="M${x} ${y - 9} L ${x + 3.6} ${y} L ${x - 3.6} ${y} Z"/>`; }).join('')}</g>
    <path d="M0 50 C 40 45, 80 49, 100 48 C 130 47, 170 51, 200 47 V 120 H 0 Z" fill="url(#${g}g)"/>
    <path d="M14 70 q 10 -2 20 0 M150 64 q 12 -2 24 0 M80 96 q 14 -3 28 0 M30 104 q 8 -2 16 0 M160 100 q 10 -2 20 0" stroke="#ffffff" stroke-width="1" fill="none" opacity=".6"/>
  </svg>`;
}

function openBattle() {
  if (!Game.S) return null;
  const s = mil();
  const stage = s.stage + 1;
  if (stage > MAX_STAGE) { Game.toast('Every stage is cleared'); return null; }
  const squad = squadIds();
  if (!squad.length) { Game.navigate('heroes:squad'); return null; }
  const myPow = battlePower();
  const foePow = enemyPower(stage);
  const ratio = myPow / Math.max(1, foePow);
  const win = ratio * (0.92 + Math.random() * 0.16) >= 1;
  const foes = stageEnemies(stage);
  const plan = planBattle(squad, foes, myPow, foePow, win);
  const unitHtml = u => (u.side === 'a'
    ? `<div class="mil-unit is-ally pos-${u.pos}" data-side="a"><div class="mil-unit-fig">${porHtml(u.id)}${clsBadge(u.id, 11)}</div><div class="mil-hp"><i></i></div></div>`
    : `<div class="mil-unit is-foe pos-${u.pos}${u.boss ? ' is-boss' : ''}" data-side="b"><div class="mil-unit-fig">${enemySvg(u.type, u.boss)}</div><div class="mil-hp is-foe"><i></i></div></div>`);
  const body = Game.el(`<div class="mil-battle">
    <div class="mil-bhead">
      <div class="mil-bside"><span class="mil-bside-k">Your squad</span><span class="mil-bside-v">${Game.icon('power', 16)}${fmtFull(myPow)}</span></div>
      <span class="mil-bvs">${Game.icon('sword', 22)}</span>
      <div class="mil-bside is-foe"><span class="mil-bside-k">${esc(isBoss(stage) ? ENEMIES[foes[0].type].boss : ENEMIES[foes[0].type].plural)}</span><span class="mil-bside-v">${Game.icon('power', 16)}${fmtFull(foePow)}</span></div>
    </div>
    <div class="mil-arena is-intro">
      ${arenaBgSvg()}
      ${plan.A.map(unitHtml).join('')}
      ${plan.B.map(unitHtml).join('')}
      <span class="chip mil-troopchip">${Game.icon('troop_infantry', 16)}${fmtFull(totalTroops())} troops</span>
      <div class="mil-fx" aria-hidden="true"></div>
      <div class="mil-banner" hidden><span class="mil-banner-t"></span></div>
    </div>
    <div class="mil-bres" hidden aria-live="polite"></div>
    <div class="mil-bbar">
      <button type="button" class="btn ghost" data-act="skip" id="mil-battle-skip">Skip</button>
      <button type="button" class="btn ghost" data-act="close" id="mil-battle-close" hidden>Continue</button>
      <button type="button" class="btn gold" data-act="again" id="mil-battle-next" hidden></button>
    </div>
  </div>`);
  const arena = body.querySelector('.mil-arena');
  const fx = body.querySelector('.mil-fx');
  const els = { a: [...body.querySelectorAll('.mil-unit[data-side="a"]')], b: [...body.querySelectorAll('.mil-unit[data-side="b"]')] };
  const units = { a: plan.A, b: plan.B };
  const timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  let resolved = false;
  let shown = false;
  let rewards = null;
  let heroGift = null;

  function resolve() {
    if (resolved) return;
    resolved = true;
    const first = win && mil().stage === stage - 1;
    if (first) {
      mil().stage = stage;
      rewards = stageRewards(stage);
      Game.grant(rewards, { source: 'stage' });
      const hid = STAGE_HEROES[stage];
      if (hid) heroGift = { id: hid, result: grantHero(hid, 'stage') };
    }
    Game.emit('battle:fought', { stage, win: !!win });
    if (first) Game.emit('stage:cleared', { stage });
    updateBadges(true);
  }
  function setHp(side, i, hp) {
    const u = units[side][i];
    const bar = els[side][i]?.querySelector('.mil-hp i');
    if (bar) bar.style.width = ((Math.max(0, hp) / u.max) * 100).toFixed(1) + '%';
    if (hp <= 0) els[side][i]?.classList.add('is-dead');
  }
  function centerOf(node) {
    const a = arena.getBoundingClientRect();
    const r = node.querySelector('.mil-unit-fig').getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2, top: r.top - a.top };
  }
  function restart(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }
  function showHit(ev) {
    const atk = els[ev.side][ev.from];
    const tgtSide = ev.side === 'a' ? 'b' : 'a';
    const tgt = els[tgtSide][ev.to];
    if (!atk || !tgt) return;
    restart(atk, 'is-atk');
    const ranged = ev.side === 'a' && units.a[ev.from].cls === 'marksman';
    if (ranged) {
      const p0 = centerOf(atk);
      const p1 = centerOf(tgt);
      const pr = document.createElement('span');
      pr.className = 'mil-proj';
      pr.style.left = p0.x + 'px';
      pr.style.top = p0.y + 'px';
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      pr.style.transform = `rotate(${ang}rad)`;
      fx.appendChild(pr);
      void pr.offsetWidth;
      pr.style.transform = `translate(${p1.x - p0.x}px, ${p1.y - p0.y}px) rotate(${ang}rad)`;
      setTimeout(() => pr.remove(), 260);
    }
    later(ranged ? 150 : 120, () => {
      restart(tgt, 'is-hit');
      const c = centerOf(tgt);
      if (!ranged) {
        const sl = document.createElement('span');
        sl.className = 'mil-slash' + (ev.side === 'b' ? ' is-foe' : '');
        sl.style.left = c.x + 'px';
        sl.style.top = c.y + 'px';
        fx.appendChild(sl);
        setTimeout(() => sl.remove(), 360);
      }
      const n = document.createElement('span');
      n.className = 'mil-dmg' + (ev.crit ? ' is-crit' : '') + (ev.side === 'b' ? ' is-foe' : '');
      n.textContent = (ev.crit ? 'Crit ' : '') + '-' + fmt(ev.dmg);
      n.style.left = (c.x + (Math.random() * 16 - 8)) + 'px';
      n.style.top = c.top + 'px';
      fx.appendChild(n);
      setTimeout(() => n.remove(), 900);
      setHp(tgtSide, ev.to, ev.hpAfter);
    });
  }
  function showResult() {
    if (shown) return;
    shown = true;
    timers.forEach(clearTimeout);
    resolve();
    ['a', 'b'].forEach(side => plan.final[side].forEach((hp, i) => setHp(side, i, hp)));
    arena.classList.remove('is-intro');
    arena.classList.add(win ? 'is-won' : 'is-lost');
    const banner = body.querySelector('.mil-banner');
    banner.hidden = false;
    banner.classList.add(win ? 'is-win' : 'is-loss');
    banner.querySelector('.mil-banner-t').textContent = win ? 'Victory' : 'Defeat';
    const res = body.querySelector('.mil-bres');
    if (win) {
      const rw = rewards || {};
      const custom = heroGift ? [{ iconHtml: `<span class="mil-tilepor">${portraitSvg(heroGift.id)}</span>`, name: heroGift.result === 'hero' ? `${HERO[heroGift.id].name} joins` : `${HERO[heroGift.id].short} shards`, count: heroGift.result === 'hero' ? 'New' : 'x' + DUPE_SHARDS, rarity: HERO[heroGift.id].rarity }] : [];
      const chapterDone = stageInChapter(stage) === 10;
      res.innerHTML = `<div class="mil-bres-t">${chapterDone ? `Chapter ${chapterOf(stage)} complete` : `Stage ${stageLabel(stage)} cleared`}</div>
        <div class="mil-bres-grid">${Game.rewardsHtml({ ...rw, custom })}</div>`;
    } else {
      const tips = lossTips(stage);
      const gap = foePow / Math.max(1, myPow);
      res.innerHTML = `<div class="mil-bres-t">Your squad needs more power</div>
        <p class="mil-bres-p">${gap >= 1.05 ? `The enemy is ${gap.toFixed(1)}x stronger. ` : 'It was close. '}Battles never cost troops, so come back stronger.</p>
        <div class="mil-tips">${tips.map(t => `<div class="mil-tip card"><span class="mil-tip-ico">${Game.icon(t.icon, 26)}</span><span class="mil-tip-t"><b>${esc(t.title)}</b><span>${esc(t.text)}</span></span><button type="button" class="btn blue small" data-go="${esc(t.go)}">Go</button></div>`).join('')}</div>`;
    }
    res.hidden = false;
    body.querySelector('#mil-battle-skip').hidden = true;
    const close = body.querySelector('#mil-battle-close');
    close.hidden = false;
    const again = body.querySelector('#mil-battle-next');
    const nextStage = mil().stage + 1;
    if (win && nextStage <= MAX_STAGE) { again.innerHTML = `${Game.icon('sword', 18)}<span>Next: ${stageLabel(nextStage)}</span>`; again.hidden = false; }
    else if (!win && ratio >= 0.93) { again.innerHTML = `${Game.icon('refresh', 18)}<span>Retry</span>`; again.hidden = false; }
    try { (again.hidden ? close : again).focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.go) { Game.navigate(b.dataset.go); return; }
    if (b.dataset.act === 'skip') showResult();
    else if (b.dataset.act === 'close') sheet.close();
    else if (b.dataset.act === 'again') { sheet.close(); openBattle(); }
  });
  const sheet = Game.sheet({
    title: `Stage ${stageLabel(stage)}`,
    body,
    className: 'mil-battle-sheet',
    onClose: () => { timers.forEach(clearTimeout); resolve(); },
  });
  ['a', 'b'].forEach(side => units[side].forEach((u, i) => setHp(side, i, u.max)));
  if (reduced()) { showResult(); return sheet; }
  const t0 = 520;
  const step = Math.max(240, Math.min(320, Math.round(3500 / Math.max(1, plan.events.length))));
  later(420, () => arena.classList.remove('is-intro'));
  plan.events.forEach((ev, i) => later(t0 + i * step, () => showHit(ev)));
  later(t0 + plan.events.length * step + 380, showResult);
  return sheet;
}

function lossTips(stage) {
  const tips = [];
  const sq = squadIds();
  if (sq.length < 3) {
    if (ownedIds().length > sq.length) tips.push({ icon: 'hero', title: 'Fill your squad', text: 'Put three heroes in your squad.', go: 'heroes:squad' });
    else tips.push({ icon: 'ticket', title: 'Recruit heroes', text: 'More heroes means a full squad.', go: 'heroes:recruit' });
  }
  const books = Game.itemCount('xp_book');
  const cap = maxLevel();
  const levelable = sq.filter(id => heroRec(id).lv < cap).sort((a, b) => heroRec(a).lv - heroRec(b).lv);
  if (levelable.length && books > 0) tips.push({ icon: 'xp', title: 'Level up heroes', text: `You have ${fmtFull(books)} XP ${books === 1 ? 'Book' : 'Books'} to use.`, go: 'heroes:hero:' + levelable[0] });
  else if (!levelable.length && sq.length) tips.push({ icon: 'flame', title: 'Upgrade the Furnace', text: 'It raises the hero level cap.', go: 'city:building:furnace' });
  const starable = HEROES.find(h => canStar(h.id) || canUnlock(h.id));
  if (starable) tips.push({ icon: 'star', title: canUnlock(starable.id) ? `Unlock ${starable.short}` : `Star up ${starable.short}`, text: 'You have enough shards.', go: 'heroes:hero:' + starable.id });
  const idleCamp = TROOP_TYPES.find(t => campLevel(t) >= 1 && !Game.timers.get(trainId(t)));
  tips.push({ icon: 'troop_infantry', title: 'Train more troops', text: idleCamp ? `Your ${TROOPS[idleCamp].campName} is idle.` : 'Every troop adds power.', go: 'heroes:troops' });
  const weak = TROOP_TYPES.slice().sort((a, b) => campLevel(a) - campLevel(b))[0];
  if (Game.city?.level && tierOf(weak) < 5) tips.push({ icon: 'arrow_up', title: 'Upgrade camps', text: `Higher camps train higher troop tiers. Next tier at Lv ${TIER_MIN_CAMP[tierOf(weak)]}.`, go: 'city:building:' + TROOPS[weak].camp });
  return tips.slice(0, 3);
}

// ================================================================ module, screens, navigation
Game.registerModule({
  id: 'mil',
  initState: () => ({
    heroes: { [STARTER_HERO]: { lv: 1, xp: 0, stars: 0, at: 0 } },
    squad: [STARTER_HERO, null, null],
    troops: { ...START_TROOPS },
    recruit: { freeAt: 0, pity: 0, total: 0 },
    stage: 0,
    idle: { min: 0, meat: 0, wood: 0, coal: 0, iron: 0, xp: 0 },
  }),
  migrate(s) {
    if (!isObj(s.heroes)) s.heroes = {};
    for (const [id, h] of Object.entries(s.heroes)) {
      if (!HERO[id] || !isObj(h)) { delete s.heroes[id]; continue; }
      h.lv = clamp(int(h.lv) || 1, 1, LEVEL_CAP);
      h.xp = Math.max(0, num(h.xp));
      h.stars = clamp(int(h.stars), 0, MAX_STARS);
    }
    if (!Object.keys(s.heroes).length) s.heroes[STARTER_HERO] = { lv: 1, xp: 0, stars: 0, at: 0 };
    const sq = Array.isArray(s.squad) ? s.squad : [];
    const seen = new Set();
    s.squad = [0, 1, 2].map(i => {
      const id = sq[i];
      if (!id || !s.heroes[id] || seen.has(id)) return null;
      seen.add(id);
      return id;
    });
    if (!s.squad.some(Boolean)) s.squad[0] = Object.keys(s.heroes)[0];
    if (!isObj(s.troops)) s.troops = {};
    for (const t of TROOP_TYPES) s.troops[t] = Math.max(0, int(s.troops[t]));
    if (!isObj(s.recruit)) s.recruit = {};
    s.recruit.freeAt = Math.max(0, num(s.recruit.freeAt));
    s.recruit.pity = clamp(int(s.recruit.pity), 0, PITY_AT - 1);
    s.recruit.total = Math.max(0, int(s.recruit.total));
    s.stage = clamp(int(s.stage), 0, MAX_STAGE);
    if (!isObj(s.idle)) s.idle = {};
    for (const k of ['min', 'meat', 'wood', 'coal', 'iron', 'xp']) s.idle[k] = Math.max(0, num(s.idle[k]));
    return s;
  },
  tick(dt) {
    if (!Game.S?.mil) return;
    accrueIdle(dt);
    updateBadges(false);
  },
  offline(sec) {
    if (!Game.S?.mil) return;
    accrueIdle(sec);
  },
  power() {
    if (!Game.S?.mil) return 0;
    return Object.keys(mil().heroes).reduce((t, id) => t + heroPower(id), 0) + troopPower();
  },
});

Game.registerScreen('heroes', {
  tab: { label: 'Heroes', icon: 'hero', order: 2 },
  mount: mountHeroes,
  update: updateHeroes,
});
Game.registerScreen('explore', {
  tab: { label: 'Explore', icon: 'map', order: 3 },
  mount: mountExplore,
  update: updateExplore,
});

Game.registerNav('heroes', rest => {
  const [a, b] = String(rest || '').split(':');
  if (!a) { updateHeroes(ui.heroesEl); return; }
  if (a === 'hero') { setSub('roster'); if (b) openHero(b); return; }
  if (a === 'train') { setSub('troops'); if (TROOPS[b]) openTraining(b); return; }
  if (SUBS.some(s => s.id === a)) setSub(a);
});
Game.registerNav('heroes:hero', id => { setSub('roster'); if (id && HERO[id]) openHero(id); });
Game.registerNav('heroes:train', type => { setSub('troops'); if (TROOPS[type]) openTraining(type); });
Game.registerNav('explore', rest => {
  ui.chapter = 0;
  if (rest === 'fight') openBattle();
  else if (rest === 'idle') openIdleSheet();
});

function tierAtCamp(lv) {
  let t = 1;
  for (let i = 0; i < TIER_MIN_CAMP.length; i++) if (lv >= TIER_MIN_CAMP[i]) t = i + 1;
  return t;
}
Game.on('ready', () => {
  updateBadges(true);
  Game.city?.addSideButton?.({ id: 'mil-recruit', icon: 'ticket', label: 'Recruit', onClick: () => Game.navigate('heroes:recruit'), badge: () => (Game.S?.mil && freeReady() ? 1 : 0) });
  // camp sheets in the city show what the camp trains and link to the training sheet
  for (const type of TROOP_TYPES) {
    const T = TROOPS[type];
    Game.city?.setBuildingInfo?.(T.camp, lv => [
      ['Troop tier', lv > 0 ? 'T' + tierAtCamp(lv) : '-'],
      ['Troops per batch', lv > 0 ? fmtFull(20 + 30 * lv) : '-'],
    ]);
    Game.city?.addBuildingAction?.(T.camp, { id: 'mil-train', label: `Train ${T.name}`, icon: T.icon, kind: 'blue', onClick: () => Game.navigate('heroes:train:' + type) });
  }
});
Game.on('hero:recruited', () => updateBadges(true));
Game.on('granted', () => updateBadges(true));
Game.on('spent', () => updateBadges(true));

// ================================================================ public object
Game.mil = {
  HEROES,
  CLASSES,
  RARITIES,
  TROOPS,
  ODDS: ODDS.map(o => ({ ...o })),
  PITY_AT,
  MAX_STAGE,
  heroDef: id => HERO[id] || null,
  heroIds: () => (Game.S?.mil ? ownedIds() : []),
  owns: id => !!Game.S?.mil?.heroes?.[id],
  heroLevel: id => Game.S?.mil?.heroes?.[id]?.lv ?? 0,
  heroStars: id => Game.S?.mil?.heroes?.[id]?.stars ?? 0,
  heroPower: id => (Game.S?.mil ? heroPower(id) : 0),
  heroMaxLevel: () => maxLevel(),
  squad: () => (Game.S?.mil ? squadIds() : []),
  squadPower: () => (Game.S?.mil ? battlePower() : 0),
  troopPower: () => (Game.S?.mil ? troopPower() : 0),
  troopCount: type => (Game.S?.mil ? (type ? troopCount(type) : totalTroops()) : 0),
  troopTier: type => tierOf(type),
  campLevel: type => campLevel(type),
  highestStage: () => Game.S?.mil?.stage ?? 0,
  stageLabel: s => stageLabel(s),
  enemyPower: s => enemyPower(s),
  idleMinutes: () => Game.S?.mil?.idle?.min ?? 0,
  freeRecruitReady: () => !!Game.S?.mil && freeReady(),
  pityLeft: () => (Game.S?.mil ? pityLeft() : PITY_AT),
  recruit: (n, pay) => (Game.S?.mil ? recruit(n, pay) : null),
  grantHero: (id, opts) => grantHero(id, isObj(opts) ? opts.source : opts),
  // developer panel: owns every hero at the level cap the Furnace allows and full stars
  devMaxHeroes: () => {
    if (!Game.S?.mil) return 0;
    let n = 0;
    for (const h of HEROES) {
      if (!heroRec(h.id)) addHero(h.id, 'dev');
      const r = heroRec(h.id);
      if (!r) continue;
      r.lv = Math.max(r.lv, maxLevel());
      r.xp = 0;
      r.stars = MAX_STARS;
      n++;
    }
    updateBadges(true);
    return n;
  },
  // developer panel: marks stages cleared up to `stage`, with each first-clear reward and hero
  devClearTo: stage => {
    if (!Game.S?.mil) return 0;
    const s = mil();
    const to = clamp(int(stage), 0, MAX_STAGE);
    let n = 0;
    while (s.stage < to) {
      s.stage++;
      Game.grant(stageRewards(s.stage), { source: 'stage' });
      const hid = STAGE_HEROES[s.stage];
      if (hid) grantHero(hid, 'stage');
      Game.emit('stage:cleared', { stage: s.stage });
      n++;
    }
    updateBadges(true);
    return n;
  },
  claimIdle: () => (Game.S?.mil ? claimIdle() : false),
  startTraining: (type, n) => (Game.S?.mil ? startTraining(type, n) : false),
  openHero,
  openRecruit: () => Game.navigate('heroes:recruit'),
  openTraining,
  openBattle,
  openIdle: openIdleSheet,
  portraitSvg: id => portraitSvg(id),
  enemySvg: (type, boss) => enemySvg(type, boss),
  _rng: null,
};
