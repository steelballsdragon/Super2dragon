/* Last Furnace shop module (owner: shop agent).
   Premium currency and in-app purchases:
   - Game.store: a provider-based purchase layer. This web build ships only the DemoProvider test store, which never
     charges money. docs/IAP.md explains how to plug in Google Play Billing, the App Store or Stripe.
   - Gem packs (6 tiers, first purchase of each tier doubled), packs (starter, monthly card, second builder, daily deal,
     hero growth), VIP levels 0-12 with perks and level gifts, the gem shop (gem spending with daily limits) and the
     daily free gift.
   State lives in Game.S.shop. Public objects: Game.store and Game.shop. */

// ============================================================ helpers
const DAY_MS = 864e5;
const SEC_KEY = 'last-furnace-v2:shop-section';
const VIP_PER_USD = 100;
const HISTORY_MAX = 100;
const TX_MAX = 500;
const GIFT_CRATES = ['wood', 'meat', 'coal', 'iron'];

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = s => Game.esc(s);
const fmtFull = n => Game.fmtFull(n);
const usd = n => '$' + Number(n).toFixed(2);
const clone = v => JSON.parse(JSON.stringify(v ?? {}));
const sh = () => Game.S.shop;
const ready = () => !!(Game.S && Game.S.shop);

function dayNum(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : 0;
}
const today = () => dayNum(Game.today());
function secsToMidnight() {
  const now = Game.now();
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((d.getTime() - now) / 1000));
}
function fmtDur(sec) {
  const s = Math.round(sec);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}
function randId(n = 12) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < n; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}
function setHtml(node, html) {
  if (node && node.dataset.html !== html) {
    node.innerHTML = html;
    node.dataset.html = html;
  }
}
const setText = (node, t) => Game.setText(node, t);
const iconInner = name => Game.icon(name, 24).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

// ============================================================ icons
Game.addIcon('lf_card', '<rect x="2" y="5" width="20" height="14" rx="2.2" fill="#3b5fc4" stroke="#1b2f6e" stroke-width="1"/><path d="M2 9.2h20" stroke="#26419a" stroke-width="2.4"/><path d="M3.4 6.6h9" stroke="#9fb8ff" stroke-width=".9" stroke-linecap="round"/><rect x="4.4" y="12.2" width="4.6" height="3.6" rx=".7" fill="#ffd862" stroke="#8a5a12" stroke-width=".6"/><svg x="12.2" y="10.6" width="8.4" height="8.4" viewBox="0 0 24 24">' + iconInner('gem') + '</svg>');
Game.addIcon('lf_offer', '<path d="M12.4 2.8h7.3a1.5 1.5 0 0 1 1.5 1.5v7.3L11.5 21.3a1.6 1.6 0 0 1-2.2 0l-6.6-6.6a1.6 1.6 0 0 1 0-2.2Z" fill="#e2483d" stroke="#7c1b16" stroke-width="1" stroke-linejoin="round"/><path d="M12.4 2.8h7.3a1.5 1.5 0 0 1 1.5 1.5v2L10.6 16.9 4.3 10.9Z" fill="#f2665a" opacity=".6"/><circle cx="16.9" cy="7.1" r="1.7" fill="#ffd862" stroke="#7c1b16" stroke-width=".8"/><path d="M8.2 15.6l5.2-5.2" stroke="#fff4d1" stroke-width="1.5" stroke-linecap="round"/><circle cx="8.6" cy="11.4" r="1.2" fill="#fff4d1"/><circle cx="12.6" cy="15.4" r="1.2" fill="#fff4d1"/>');

// ============================================================ catalog
// Product IDs are the ones to create in Google Play Console / App Store Connect (see docs/IAP.md).
const STARTER_ID = 'lf.pack.starter';
const BUILDER_ID = 'lf.pack.builder';
const CARD_ID = 'lf.card.monthly';
const DAILY_ID = 'lf.pack.daily';
const HERO_ID = 'lf.pack.hero';

// value tags compare the contents, priced at gem shop rates, with the $0.99 gem pack rate (about 100 Gems per $1)
const PRODUCTS = [
  { id: 'lf.gems.t1', kind: 'gems', type: 'consumable', title: 'Pinch of Gems', usd: 0.99, gems: 100, art: 1 },
  { id: 'lf.gems.t2', kind: 'gems', type: 'consumable', title: 'Pouch of Gems', usd: 4.99, gems: 550, art: 2 },
  { id: 'lf.gems.t3', kind: 'gems', type: 'consumable', title: 'Sack of Gems', usd: 9.99, gems: 1200, art: 3, tag: 'Popular' },
  { id: 'lf.gems.t4', kind: 'gems', type: 'consumable', title: 'Crate of Gems', usd: 19.99, gems: 2500, art: 4 },
  { id: 'lf.gems.t5', kind: 'gems', type: 'consumable', title: 'Chest of Gems', usd: 49.99, gems: 6500, art: 5 },
  { id: 'lf.gems.t6', kind: 'gems', type: 'consumable', title: 'Vault of Gems', usd: 99.99, gems: 14000, art: 6, tag: 'Best value' },
  {
    id: STARTER_ID, kind: 'pack', type: 'non_consumable', slug: 'starter', art: 'starter', title: 'Starter Pack', usd: 0.99,
    limit: 1, tag: 'One time', value: '1,400%',
    desc: 'A head start for new chiefs: Gems, Recruit Tickets, speedups, XP Books and crates.',
    contents: { gems: 300, items: { ticket_recruit: 3, speedup_5m: 5, speedup_1h: 2, xp_book: 5, crate_meat: 3, crate_wood: 3, crate_coal: 2, crate_iron: 2 } },
  },
  {
    id: CARD_ID, kind: 'card', type: 'consumable', slug: 'card', art: 'card', title: 'Monthly Card', usd: 4.99,
    tag: '30 days', value: '660%', instant: 300, daily: 100, days: 30,
    desc: '300 Gems now, then 100 Gems every day for 30 days. 3,300 Gems in total.',
  },
  {
    id: BUILDER_ID, kind: 'builder', type: 'non_consumable', slug: 'builder', art: 'builder', title: 'Second Builder', usd: 4.99,
    limit: 1, tag: 'Permanent',
    desc: 'Hire a second builder for good and upgrade two buildings at the same time.',
    contents: { items: { speedup_1h: 3 } },
  },
  {
    id: DAILY_ID, kind: 'pack', type: 'consumable', slug: 'daily', art: 'deal', title: 'Daily Deal', usd: 0.99,
    dailyLimit: 1, tag: 'Daily', value: '300%',
    desc: 'Gems, speedups and crates at a small price. One a day.',
    contents: { gems: 150, items: { speedup_1h: 2, speedup_5m: 5, crate_wood: 1, crate_coal: 1 } },
  },
  {
    id: HERO_ID, kind: 'pack', type: 'consumable', slug: 'hero', art: 'hero', title: 'Hero Growth Pack', usd: 9.99,
    limit: 3, tag: 'Limited', value: '400%',
    desc: 'Recruit Tickets and XP Books for a stronger squad. Three per chief.',
    contents: { gems: 1000, items: { ticket_recruit: 10, xp_book: 15 } },
  },
];
const GEM_TIERS = PRODUCTS.filter(p => p.kind === 'gems');
const byId = new Map(PRODUCTS.map(p => [p.id, p]));
const ALIASES = {
  starter_pack: STARTER_ID, starter: STARTER_ID, builder: BUILDER_ID, second_builder: BUILDER_ID, builder_pack: BUILDER_ID,
  monthly_card: CARD_ID, monthly: CARD_ID, card: CARD_ID, daily_deal: DAILY_ID, hero_pack: HERO_ID,
};
const product = id => byId.get(ALIASES[id] || id) || null;

// ---------------------------------------------------------------- VIP
// pts: total VIP points needed. prod: productionPct. free: seconds added to the 60 s free-finish window (max 5 min).
// idle: hours added to the 8 h idle chest. train: trainSpeedPct. VIP 6 adds the second builder.
const VIP = [
  { lv: 0, pts: 0, prod: 0, free: 0, idle: 0, train: 0 },
  { lv: 1, pts: 50, prod: 2, free: 30, idle: 0, train: 0 },
  { lv: 2, pts: 200, prod: 4, free: 60, idle: 1, train: 0 },
  { lv: 3, pts: 500, prod: 6, free: 90, idle: 1, train: 5 },
  { lv: 4, pts: 1000, prod: 8, free: 120, idle: 2, train: 5 },
  { lv: 5, pts: 2000, prod: 10, free: 150, idle: 2, train: 10 },
  { lv: 6, pts: 4000, prod: 12, free: 180, idle: 3, train: 10 },
  { lv: 7, pts: 7500, prod: 15, free: 210, idle: 3, train: 15 },
  { lv: 8, pts: 12000, prod: 18, free: 240, idle: 4, train: 15 },
  { lv: 9, pts: 20000, prod: 21, free: 240, idle: 4, train: 20 },
  { lv: 10, pts: 35000, prod: 25, free: 240, idle: 5, train: 20 },
  { lv: 11, pts: 60000, prod: 30, free: 240, idle: 6, train: 25 },
  { lv: 12, pts: 100000, prod: 35, free: 240, idle: 8, train: 30 },
];
const VIP_MAX = VIP.length - 1;
const VIP_BUILDER_LV = 6;
VIP.forEach(v => { v.builder = v.lv >= VIP_BUILDER_LV ? 1 : 0; });

const PERKS = [
  { key: 'prod', icon: 'arrow_up', cls: 'up', label: 'Resource production', val: v => (v ? '+' + v + '%' : '+0%') },
  { key: 'free', icon: 'clock', cls: 'clock', label: 'Free finish under', val: v => fmtDur(60 + v) },
  { key: 'idle', icon: 'chest', label: 'Idle chest holds', val: v => 8 + v + 'h' },
  { key: 'train', icon: 'troop_infantry', label: 'Training speed', val: v => (v ? '+' + v + '%' : '+0%') },
  { key: 'builder', icon: 'hammer', label: 'Second builder', val: v => (v ? 'Yes' : 'No') },
];

function vipLevelFor(pts) {
  let lv = 0;
  for (const v of VIP) if (pts >= v.pts) lv = v.lv;
  return lv;
}
const vipPoints = () => (ready() ? Math.max(0, num(sh().vipPts)) : 0);
const vipLevel = () => vipLevelFor(vipPoints());
const vipRow = lv => VIP[Math.max(0, Math.min(VIP_MAX, lv))];

function vipGift(L) {
  const gems = [0, 50, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500][L] || 0;
  const items = {};
  if (L <= 2) items.speedup_5m = 3 * L;
  if (L >= 2) items.speedup_1h = Math.min(6, L - 1);
  if (L >= 3) items.ticket_recruit = Math.ceil((L - 2) * 0.75);
  if (L >= 6) items.speedup_8h = Math.floor((L - 4) / 2);
  if (L === 2 || L >= 4) items.xp_book = L * 2;
  return { gems, items };
}

// perks: read lazily, Game.S is null until boot
Game.registerPerk('productionPct', () => vipRow(vipLevel()).prod);
Game.registerPerk('freeFinishSec', () => vipRow(vipLevel()).free);
Game.registerPerk('idleCapHours', () => vipRow(vipLevel()).idle);
Game.registerPerk('trainSpeedPct', () => vipRow(vipLevel()).train);
// either the Second Builder purchase or VIP 6 gives +1 (core caps builders at 2)
Game.registerPerk('builders', () => (ready() && (sh().owned[BUILDER_ID] || vipLevel() >= VIP_BUILDER_LV) ? 1 : 0));

// ---------------------------------------------------------------- gem shop
const RES_PER_GEM = { meat: 60, wood: 60, coal: 20, iron: 6 }; // the city's gem top-up rate
function crateCost(r) { return Math.max(5, Math.ceil((Game.crateAmount(r) / RES_PER_GEM[r]) * 0.8)); }
const GEM_SHOP = [
  { id: 'gs_ticket', item: 'ticket_recruit', cost: 250, limit: 3, tag: '-17%' },
  { id: 'gs_speedup_5m', item: 'speedup_5m', cost: 5 },
  { id: 'gs_speedup_1h', item: 'speedup_1h', cost: 45, limit: 10 },
  { id: 'gs_speedup_8h', item: 'speedup_8h', cost: 260, limit: 3 },
  { id: 'gs_xp', item: 'xp_book', cost: 25, limit: 20 },
  { id: 'gs_crate_meat', item: 'crate_meat', cost: () => crateCost('meat'), limit: 10 },
  { id: 'gs_crate_wood', item: 'crate_wood', cost: () => crateCost('wood'), limit: 10 },
  { id: 'gs_crate_coal', item: 'crate_coal', cost: () => crateCost('coal'), limit: 5 },
  { id: 'gs_crate_iron', item: 'crate_iron', cost: () => crateCost('iron'), limit: 5 },
];
const gsDef = id => GEM_SHOP.find(g => g.id === id) || null;
const gsCost = g => Math.max(1, Math.round(typeof g.cost === 'function' ? g.cost() : g.cost));
function gsLeft(g) {
  if (!g.limit) return Infinity;
  ensureDay();
  return Math.max(0, g.limit - num(sh().gs[g.id]));
}

// ============================================================ state
function initState() {
  return {
    v: 1,
    vipPts: 0,
    vipDay: null,
    vipStreak: 0,
    vipGifts: {},
    owned: {},
    counts: {},
    first: {},
    dayCounts: {},
    gs: {},
    dailyDay: null,
    giftDay: null,
    card: { start: null, end: null, last: null, claims: 0 },
    history: [],
    txs: [],
    spentUsd: 0,
  };
}
function migrate(s) {
  for (const k of ['vipGifts', 'owned', 'counts', 'first', 'dayCounts', 'gs']) if (!isObj(s[k])) s[k] = {};
  if (!Array.isArray(s.history)) s.history = [];
  if (!Array.isArray(s.txs)) s.txs = [];
  s.card = { start: null, end: null, last: null, claims: 0, ...(isObj(s.card) ? s.card : {}) };
  s.vipPts = Math.max(0, num(s.vipPts));
  s.vipStreak = Math.max(0, num(s.vipStreak));
  s.spentUsd = Math.max(0, num(s.spentUsd));
  return s;
}
function ensureDay() {
  const s = sh();
  const t = today();
  if (s.dailyDay !== t) {
    s.dailyDay = t;
    s.gs = {};
    s.dayCounts = {};
  }
}

// ============================================================ daily claims
// daily free gift
const giftReady = () => ready() && sh().giftDay !== today();
function giftContents(t = today()) {
  const r = GIFT_CRATES[((t % 4) + 4) % 4];
  return { gems: 20, items: { speedup_5m: 2, ['crate_' + r]: 1 } };
}
function claimGift() {
  if (!giftReady()) return false;
  const g = giftContents();
  sh().giftDay = today();
  Game.grant(g, { source: 'shop:gift', popup: true, title: 'Daily Free Gift' });
  Game.emit('shop:gift', {});
  refreshNow();
  return true;
}

// monthly card
const card = () => sh().card;
const cardActive = () => ready() && card().end != null && today() <= card().end;
const cardClaimable = () => cardActive() && today() >= num(card().start) && card().last !== today();
function cardClaimsLeft() {
  if (!cardActive()) return 0;
  return card().end - today() + (card().last === today() ? 0 : 1);
}
function claimCard() {
  if (!cardClaimable()) return false;
  const p = product(CARD_ID);
  card().last = today();
  card().claims = num(card().claims) + 1;
  Game.grant({ gems: p.daily }, { source: 'shop:monthly', popup: true, title: 'Monthly Card' });
  refreshNow();
  return true;
}

// VIP daily points (a streak grows the claim from 20 to 50)
const vipDailyReady = () => ready() && sh().vipDay !== today();
const vipStreakNext = () => (sh().vipDay === today() - 1 ? num(sh().vipStreak) + 1 : 1);
const vipDailyPts = streak => Math.min(50, 15 + 5 * Math.max(1, streak));
function claimVipDaily() {
  if (!vipDailyReady()) return false;
  const s = sh();
  const st = vipStreakNext();
  const pts = vipDailyPts(st);
  s.vipStreak = st;
  s.vipDay = today();
  Game.rewardPopup({ custom: [{ icon: 'vip', name: 'VIP Points', count: '+' + pts, rarity: 'legendary' }] }, `Day ${st} streak`);
  addVipPoints(pts, 'daily');
  refreshNow();
  return true;
}
function addVipPoints(n, source = '') {
  if (!ready()) return 0;
  const before = vipLevel();
  sh().vipPts = vipPoints() + Math.max(0, Math.round(num(Number(n))));
  const after = vipLevel();
  if (after > before) vipUp(before, after);
  Game.emit('vip:points', { amount: n, source, level: after });
  return after;
}
function vipUp(from, to) {
  Game.toast(`VIP ${to} reached. New perks are active.`, 'good');
  Game.emit('vip:levelup', { level: to, from });
}

// VIP level gifts (one per level reached)
const vipGiftReady = L => ready() && vipLevel() >= L && !sh().vipGifts[L];
function vipGiftsReady() {
  if (!ready()) return 0;
  let n = 0;
  for (let L = 1; L <= vipLevel(); L++) if (!sh().vipGifts[L]) n++;
  return n;
}
function claimVipGift(L) {
  if (!vipGiftReady(L)) return false;
  sh().vipGifts[L] = true;
  Game.grant(vipGift(L), { source: 'shop:vip-gift', popup: true, title: `VIP ${L} Gift` });
  refreshNow();
  return true;
}

function claimables() {
  if (!ready()) return { gift: 0, card: 0, vip: 0, total: 0 };
  const gift = giftReady() ? 1 : 0;
  const c = cardClaimable() ? 1 : 0;
  const vip = (vipDailyReady() ? 1 : 0) + vipGiftsReady();
  return { gift, card: c, vip, total: gift + c + vip };
}
function updateBadges() {
  if (ready()) Game.badge('shop', claimables().total);
}

// ============================================================ store (provider-based purchase layer)
let provider = null;
let inFlight = null;

const priceOf = p => {
  let s = null;
  try { s = provider?.priceString?.(p.id) || null; } catch (e) { s = null; }
  return s || usd(p.usd);
};
// list prices end in .99, so points are counted per started dollar: $4.99 gives 500, enough for VIP 3
const vipPtsFor = p => Math.ceil(p.usd - 1e-9) * VIP_PER_USD;

function contentsOf(p) {
  switch (p.kind) {
    case 'gems': {
      const first = !ready() || !sh().first[p.id];
      return { gems: first ? p.gems * 2 : p.gems };
    }
    case 'card':
      return { gems: p.instant, custom: [{ icon: 'lf_card', name: `${p.daily} Gems daily`, count: `${p.days}d`, rarity: 'epic' }] };
    case 'builder':
      return { ...clone(p.contents), custom: [{ icon: 'hammer', name: 'Second Builder', rarity: 'legendary' }] };
    default:
      return clone(p.contents);
  }
}

function canBuy(p) {
  if (!p) return { ok: false, code: 'unknown', label: 'Unavailable' };
  if (!ready()) return { ok: false, code: 'not-ready', label: usd(p.usd) };
  const s = sh();
  if (p.type === 'non_consumable' && s.owned[p.id]) return { ok: false, code: 'owned', label: p.kind === 'builder' ? 'Active' : 'Purchased' };
  if (p.kind === 'builder' && vipLevel() >= VIP_BUILDER_LV) return { ok: false, code: 'included', label: 'In VIP 6' };
  if (p.limit && num(s.counts[p.id]) >= p.limit) return { ok: false, code: 'sold-out', label: 'Sold out' };
  if (p.dailyLimit) {
    ensureDay();
    if (num(s.dayCounts[p.id]) >= p.dailyLimit) return { ok: false, code: 'daily-limit', label: 'Tomorrow' };
  }
  return { ok: true, code: 'ok', label: priceOf(p) };
}
const REASONS = {
  owned: 'Already purchased.',
  included: 'Your VIP 6 already includes a second builder.',
  'sold-out': 'Sold out.',
  'daily-limit': 'Already bought today. Back tomorrow.',
  unknown: 'That offer is not available.',
  'not-ready': 'The store is still loading.',
};

function viewOf(p) {
  const c = canBuy(p);
  return {
    id: p.id,
    type: p.type,
    kind: p.kind,
    title: p.title,
    description: p.desc || '',
    price: priceOf(p),
    priceUsd: p.usd,
    currency: 'USD',
    vipPoints: vipPtsFor(p),
    limit: p.limit || null,
    dailyLimit: p.dailyLimit || null,
    contents: contentsOf(p),
    purchasable: c.ok,
    reason: c.ok ? null : c.code,
  };
}

// applies a product's effect and returns what the reward popup shows
function applyProduct(p) {
  const s = sh();
  switch (p.kind) {
    case 'gems': {
      const first = !s.first[p.id];
      s.first[p.id] = true;
      return { rewards: { gems: first ? p.gems * 2 : p.gems }, title: first ? 'Gems doubled' : p.title };
    }
    case 'card': {
      const c = s.card;
      const t = today();
      if (c.end != null && t <= c.end) c.end += p.days;
      else {
        c.start = t;
        c.end = t + p.days - 1;
        c.last = null;
      }
      return { rewards: contentsOf(p), title: p.title };
    }
    default:
      return { rewards: contentsOf(p), title: p.title };
  }
}

// Grants a paid product once per transaction id. Real providers may call this again for the same transaction
// (pending or unacknowledged purchases re-reported at startup); the second call does nothing.
function deliver(productId, transactionId, meta = {}) {
  const p = product(productId);
  if (!p) return { ok: false, error: 'unknown-product' };
  if (!ready()) return { ok: false, error: 'not-ready' };
  const s = sh();
  const tx = String(transactionId || 'LOCAL-' + randId());
  if (s.txs.includes(tx)) return { ok: true, duplicate: true, transactionId: tx };
  s.txs.push(tx);
  if (s.txs.length > TX_MAX) s.txs.splice(0, s.txs.length - TX_MAX);
  const before = vipLevel();
  const { rewards, title } = applyProduct(p);
  s.counts[p.id] = num(s.counts[p.id]) + 1;
  if (p.dailyLimit) {
    ensureDay();
    s.dayCounts[p.id] = num(s.dayCounts[p.id]) + 1;
  }
  if (p.type === 'non_consumable') s.owned[p.id] = true;
  const pts = vipPtsFor(p);
  s.vipPts = vipPoints() + pts;
  s.spentUsd = Math.round((num(s.spentUsd) + p.usd) * 100) / 100;
  s.history.unshift({ tx, id: p.id, title: p.title, usd: p.usd, at: Game.now(), test: !!meta.test });
  if (s.history.length > HISTORY_MAX) s.history.length = HISTORY_MAX;
  rewards.custom = (rewards.custom || []).concat({ icon: 'vip', name: 'VIP Points', count: '+' + fmtFull(pts), rarity: 'legendary' });
  Game.grant(rewards, { source: 'purchase', popup: meta.popup !== false, title });
  const after = vipLevel();
  if (after > before) vipUp(before, after);
  Game.emit('purchase:completed', { productId: p.id, transactionId: tx, priceUsd: p.usd, test: !!meta.test });
  try { Game.save?.(); } catch (e) { /* core saves again within 5 s */ }
  refreshNow();
  return { ok: true, transactionId: tx };
}

async function purchase(productId) {
  const p = product(productId);
  if (!p) return { ok: false, error: 'unknown-product' };
  if (!ready()) return { ok: false, error: 'not-ready' };
  const c = canBuy(p);
  if (!c.ok) {
    Game.toast(REASONS[c.code] || 'Not available right now.');
    return { ok: false, error: c.code };
  }
  if (inFlight) return { ok: false, error: 'busy' };
  if (!provider || typeof provider.purchase !== 'function') return { ok: false, error: 'no-provider' };
  inFlight = p.id;
  refreshNow();
  let res;
  try {
    res = await provider.purchase(viewOf(p));
  } catch (e) {
    console.error('[shop] purchase failed', e);
    res = { ok: false, error: 'failed' };
  } finally {
    inFlight = null;
  }
  if (!res || !res.ok) {
    const error = res?.error || 'cancelled';
    if (error !== 'cancelled') Game.toast('The purchase did not go through.', 'bad');
    refreshNow();
    return { ok: false, error };
  }
  const d = deliver(p.id, res.transactionId, { test: !!provider.isTest });
  if (d.ok && typeof provider.finish === 'function') {
    try { await provider.finish({ ...res, productId: p.id, type: p.type }); } catch (e) { console.error('[shop] finish failed', e); }
  }
  return d.ok ? { ok: true, transactionId: d.transactionId } : { ok: false, error: d.error };
}

async function restore() {
  if (!ready() || !provider) return { ok: false, error: 'not-ready', restored: 0 };
  let list = [];
  try { list = typeof provider.restore === 'function' ? await provider.restore() : []; } catch (e) {
    console.error('[shop] restore failed', e);
    return { ok: false, error: 'failed', restored: 0 };
  }
  const s = sh();
  let restored = 0;
  for (const r of Array.isArray(list) ? list : []) {
    const p = product(r?.productId);
    if (!p || p.type !== 'non_consumable' || s.owned[p.id]) continue;
    s.owned[p.id] = true;
    s.counts[p.id] = Math.max(1, num(s.counts[p.id]));
    if (r.transactionId && !s.txs.includes(String(r.transactionId))) s.txs.push(String(r.transactionId));
    restored++;
  }
  if (restored) {
    try { Game.save?.(); } catch (e) { /* saved by the loop */ }
    refreshNow();
  }
  return { ok: true, restored };
}

// ---------------------------------------------------------------- DemoProvider: the only provider in this build
// Shows an in-page confirmation, waits about 600 ms and approves with a TEST- transaction id. Never charges money.
const DemoProvider = {
  id: 'demo',
  name: 'Test store',
  isTest: true,
  init() { return Promise.resolve(true); },
  priceString: null,
  purchase(item) {
    return new Promise(resolve => {
      let state = 'idle';
      let settled = false;
      const settle = r => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
      const p = product(item.id);
      const body = Game.el(`<div class="shop-pay">
        <div class="shop-pay-bar">${Game.icon('shop', 18)}<span>Last Furnace</span><span class="shop-pay-env">Test store</span></div>
        <div class="shop-pay-prod">
          <div class="shop-pay-art shop-art-box">${p ? productArt(p) : Game.icon('gem', 48)}</div>
          <div class="shop-pay-info"><div class="shop-pay-title">${esc(item.title)}</div><div class="shop-pay-price">${esc(item.price)}</div><div class="shop-pay-vip">${Game.icon('vip', 18)}<span>+${fmtFull(item.vipPoints)} VIP points</span></div></div>
        </div>
        <div class="shop-items-grid">${Game.rewardsHtml(item.contents)}</div>
        ${p && p.kind === 'gems' && item.contents.gems > p.gems ? `<p class="shop-pay-bonus">${fmtFull(p.gems)} Gems + ${fmtFull(p.gems)} first-time bonus</p>` : ''}
        <p class="shop-pay-test">${Game.icon('info', 18)}<span>Test mode. No money is charged.</span></p>
        <p class="shop-pay-busy" hidden><span class="shop-spin" aria-hidden="true"></span><span>Processing</span></p>
      </div>`);
      Game.sheet({
        title: 'Confirm purchase',
        body,
        className: 'shop-pay-sheet',
        actions: [
          {
            id: 'demo-cancel',
            label: 'Cancel',
            kind: 'ghost',
            disabled: () => state !== 'idle',
            onClick: () => { settle({ ok: false, error: 'cancelled' }); },
          },
          {
            id: 'demo-buy',
            label: () => (state === 'idle' ? `<span>Buy</span><span class="btn-cost">${esc(item.price)}</span>` : '<span class="shop-spin" aria-hidden="true"></span><span>Processing</span>'),
            kind: 'gold',
            disabled: () => state !== 'idle',
            onClick: handle => {
              state = 'busy';
              body.querySelector('.shop-pay-busy').hidden = false;
              setTimeout(() => {
                state = 'done';
                settle({ ok: true, transactionId: 'TEST-' + randId() });
                handle.close();
              }, 600);
              return false;
            },
          },
        ],
        // closing while processing does not cancel: like a real store, the transaction is already on its way
        onClose: () => { if (state === 'idle') settle({ ok: false, error: 'cancelled' }); },
      });
    });
  },
  // the test store has no server: non-consumables are restored from this device's purchase history
  restore() {
    if (!ready()) return Promise.resolve([]);
    return Promise.resolve(sh().history.filter(h => product(h.id)?.type === 'non_consumable').map(h => ({ productId: h.id, transactionId: h.tx })));
  },
  finish() { return Promise.resolve(); },
};

function setProvider(p) {
  if (!p || typeof p.purchase !== 'function') {
    console.error('[shop] a store provider needs a purchase(product) method');
    return provider;
  }
  provider = p;
  try {
    const r = p.init?.({ products: PRODUCTS.map(x => ({ id: x.id, type: x.type, title: x.title, priceUsd: x.usd })), deliver });
    if (r && typeof r.then === 'function') r.then(() => refreshNow(), e => console.error('[shop] provider init failed', e));
  } catch (e) { console.error('[shop] provider init failed', e); }
  refreshNow();
  return provider;
}

Game.store = {
  get provider() { return provider; },
  setProvider,
  products: () => PRODUCTS.map(viewOf),
  product: id => {
    const p = product(id);
    return p ? viewOf(p) : null;
  },
  canPurchase: id => {
    const c = canBuy(product(id));
    return { ok: c.ok, reason: c.ok ? null : c.code };
  },
  purchase,
  buy: purchase,
  restore,
  history: () => (ready() ? sh().history.map(h => ({ ...h })) : []),
  deliver,
  get busy() { return !!inFlight; },
  get isTest() { return !!provider?.isTest; },
  DemoProvider,
};
setProvider(DemoProvider);

// ============================================================ art (inline SVG, flat fills like the core icons)
const nest = (svg, x, y) => svg.replace('<svg ', `<svg x="${x}" y="${y}" `);
const gemAt = (x, y, s) => nest(Game.icon('gem', s), x, y);
const iconAt = (name, x, y, s) => nest(Game.icon(name, s), x, y);
function sparkle(x, y, r, o = 0.9) {
  const k = r * 0.28;
  return `<path d="M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z" fill="#ffffff" opacity="${o}"/>`;
}
const svgWrap = (vb, inner, cls = '') => `<svg class="shop-art${cls ? ' ' + cls : ''}" viewBox="${vb}" aria-hidden="true" focusable="false">${inner}</svg>`;

function chest(c, gems) {
  return `<path d="M24 46 30 20h60l6 26Z" fill="${c.lid}" stroke="${c.edge}" stroke-width="2" stroke-linejoin="round"/>`
    + '<path d="M31 42 35 25h50l4 17Z" fill="#000000" opacity=".35"/>'
    + gems
    + `<rect x="22" y="44" width="76" height="32" rx="3" fill="${c.body}" stroke="${c.edge}" stroke-width="2"/>`
    + `<path d="M24 56h72M24 66h72" stroke="${c.plank}" stroke-width="1.6"/>`
    + `<rect x="32" y="44" width="7" height="32" fill="${c.band}" stroke="${c.bandEdge}" stroke-width="1"/><rect x="81" y="44" width="7" height="32" fill="${c.band}" stroke="${c.bandEdge}" stroke-width="1"/>`
    + `<rect x="20" y="41" width="80" height="7" rx="2" fill="${c.band}" stroke="${c.bandEdge}" stroke-width="1.5"/>`
    + `<path d="M23 43.2h74" stroke="#fff6cf" stroke-width="1" opacity=".7"/>`
    + `<rect x="53" y="48" width="14" height="15" rx="2.5" fill="#ffd862" stroke="${c.bandEdge}" stroke-width="1.5"/><circle cx="60" cy="54" r="2.2" fill="#4f2d10"/><path d="M60 55.5v3.5" stroke="#4f2d10" stroke-width="1.6" stroke-linecap="round"/>`;
}

function gemArt(tier) {
  const shadow = '<ellipse cx="60" cy="79" rx="42" ry="4.5" fill="#000000" opacity=".35"/>';
  let inner = '';
  if (tier === 1) inner = gemAt(36, 14, 48) + sparkle(88, 20, 6) + sparkle(34, 58, 4, 0.7);
  else if (tier === 2) inner = gemAt(14, 34, 38) + gemAt(68, 34, 38) + gemAt(38, 10, 46) + sparkle(94, 18, 6) + sparkle(20, 22, 4, 0.7);
  else if (tier === 3) {
    inner = [[10, 46, 32], [44, 46, 32], [78, 46, 32], [27, 25, 34], [59, 25, 34], [42, 3, 36]].map(a => gemAt(...a)).join('')
      + sparkle(100, 18, 6) + sparkle(16, 20, 4, 0.7);
  } else if (tier === 4) {
    inner = '<path d="M38 41c-13 8-17 22-13 31 2.8 6 9 8.5 16 8.5h38c7 0 13.2-2.5 16-8.5 4-9 0-23-13-31Z" fill="#8a5a32" stroke="#4f2d10" stroke-width="2"/>'
      + '<path d="M32 60c1.6-6 5-10.5 10-13.5" stroke="#b78350" stroke-width="3.2" stroke-linecap="round" fill="none"/>'
      + '<path d="M44 70h32" stroke="#6e4422" stroke-width="2" stroke-linecap="round" opacity=".7"/>'
      + gemAt(28, 16, 30) + gemAt(62, 16, 30) + gemAt(44, 2, 34)
      + '<path d="M38 42.5h44" stroke="#f0c04c" stroke-width="5.5" stroke-linecap="round"/><path d="M40 41.5h40" stroke="#fff1c2" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>'
      + gemAt(2, 56, 24) + gemAt(94, 58, 22) + sparkle(102, 16, 6) + sparkle(14, 26, 4, 0.7);
  } else if (tier === 5) {
    const gems = gemAt(30, 20, 28) + gemAt(70, 20, 28) + gemAt(48, 12, 30) + gemAt(38, 30, 24) + gemAt(60, 30, 24);
    inner = chest({ lid: '#6e3f1b', body: '#9b5f2a', plank: '#7a4520', edge: '#3f2410', band: '#f0c04c', bandEdge: '#8a5a12' }, gems)
      + sparkle(104, 18, 6) + sparkle(14, 30, 4, 0.7);
  } else {
    const gems = gemAt(24, 18, 28) + gemAt(76, 18, 28) + gemAt(50, 6, 32) + gemAt(36, 26, 26) + gemAt(62, 26, 26) + gemAt(48, 30, 22);
    inner = '<circle cx="60" cy="40" r="38" fill="#ffd862" opacity=".16"/><circle cx="60" cy="40" r="26" fill="#ffd862" opacity=".14"/>'
      + chest({ lid: '#2e3a52', body: '#43547a', plank: '#33415f', edge: '#141c2c', band: '#f3c04a', bandEdge: '#8a5a12' }, gems)
      + gemAt(0, 56, 24) + gemAt(96, 56, 24) + gemAt(12, 64, 18) + sparkle(106, 14, 7) + sparkle(12, 18, 5, 0.8) + sparkle(96, 40, 3.5, 0.7);
  }
  return svgWrap('0 0 120 84', shadow + inner, 'shop-art-gems');
}

function cardArt() {
  return svgWrap('0 0 96 72', '<rect x="9" y="12" width="82" height="54" rx="7" fill="#000000" opacity=".35"/>'
    + '<rect x="6" y="8" width="82" height="54" rx="7" fill="#3b5fc4" stroke="#c9dcff" stroke-width="2"/>'
    + '<path d="M7 22h80" stroke="#26419a" stroke-width="8"/>'
    + '<path d="M12 13h40" stroke="#9fb8ff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>'
    + '<rect x="13" y="30" width="15" height="11" rx="2" fill="#ffd862" stroke="#8a5a12" stroke-width="1.2"/><path d="M13 35.5h15M20.5 30v11" stroke="#c99a2e" stroke-width="1"/>'
    + gemAt(54, 26, 30)
    + '<text x="13" y="56" class="shop-svg-num">30</text><text x="35" y="55.5" class="shop-svg-small">DAYS</text>'
    + sparkle(86, 12, 5), 'shop-art-card');
}
function builderArt() {
  return svgWrap('0 0 80 80', '<circle cx="40" cy="40" r="31" fill="#1d4f8f" stroke="#8fd8ff" stroke-width="2"/>'
    + '<circle cx="40" cy="40" r="24" fill="#2d6cc0" opacity=".7"/>'
    + iconAt('hammer', 12, 10, 56)
    + '<circle cx="60" cy="60" r="13" fill="#31b057" stroke="#05270e" stroke-width="2"/><text x="60" y="66" text-anchor="middle" class="shop-svg-badge">+1</text>', 'shop-art-builder');
}
function starterArt() {
  return svgWrap('0 0 80 80', '<circle cx="40" cy="42" r="30" fill="#ffd862" opacity=".18"/>'
    + iconAt('gift', 8, 8, 64) + gemAt(50, 46, 26) + sparkle(66, 14, 6) + sparkle(14, 22, 4, 0.8), 'shop-art-starter');
}
function dealArt() {
  return svgWrap('0 0 80 80', '<circle cx="40" cy="42" r="28" fill="#8fd8ff" opacity=".14"/>' + iconAt('chest', 10, 12, 60) + iconAt('speedup', 50, 44, 26) + sparkle(66, 16, 5), 'shop-art-deal');
}
function heroArt() {
  return svgWrap('0 0 80 80', '<circle cx="40" cy="42" r="28" fill="#bd7cff" opacity=".18"/>' + iconAt('xp', 6, 14, 46) + iconAt('ticket', 28, 30, 48) + sparkle(66, 14, 6) + sparkle(16, 66, 4, 0.7), 'shop-art-hero');
}
function productArt(p) {
  if (p.kind === 'gems') return gemArt(p.art);
  return { card: cardArt, builder: builderArt, starter: starterArt, deal: dealArt, hero: heroArt }[p.art]?.() ?? Game.icon('gift', 56);
}

const CREST = [
  { at: 0, face: '#8a9bb0', edge: '#3d4a5a', ink: '#1c2430' },
  { at: 1, face: '#e09a5e', edge: '#7a3f17', ink: '#2c1404' },
  { at: 5, face: '#d4e3f0', edge: '#55687c', ink: '#16212e' },
  { at: 9, face: '#f3c04a', edge: '#9a6512', ink: '#2c1a03' },
];
function vipCrest(lv, size) {
  const c = CREST.filter(x => lv >= x.at).pop();
  return `<svg class="shop-crest" width="${size}" height="${Math.round((size * 86) / 80)}" viewBox="0 0 80 86" aria-hidden="true" focusable="false">`
    + `<path d="M40 3 74 15v28c0 21-15 34-34 40C21 77 6 64 6 43V15Z" fill="${c.face}" stroke="${c.edge}" stroke-width="3" stroke-linejoin="round"/>`
    + `<path d="M40 11 67 21v22c0 16-11.5 27-27 32.5C24.5 70 13 59 13 43V21Z" fill="${c.ink}"/>`
    + '<path d="M40 3 74 15v5L40 8 6 20v-5Z" fill="#ffffff" opacity=".3"/>'
    + `<text x="40" y="34" text-anchor="middle" class="shop-crest-vip" fill="${c.face}">VIP</text>`
    + `<text x="40" y="64" text-anchor="middle" class="shop-crest-lv">${lv}</text></svg>`;
}

// ============================================================ shop screen
const SECTIONS = [
  { id: 'gems', label: 'Gems' },
  { id: 'packs', label: 'Packs' },
  { id: 'vip', label: 'VIP' },
  { id: 'items', label: 'Gem Shop' },
];
const ui = { root: null, cur: null, secs: {}, sigs: {} };
const loadSec = () => {
  const v = Game.storage.get(SEC_KEY);
  return SECTIONS.some(s => s.id === v) ? v : 'gems';
};

function buyBtn(p, extra = '') {
  const c = canBuy(p);
  return `<button type="button" class="btn gold shop-price${extra ? ' ' + extra : ''}" data-buy="${p.id}" data-k="buy:${p.id}"${p.id === CARD_ID && cardActive() ? ' data-prefix="Renew "' : ''}><span class="shop-price-txt">${esc((p.id === CARD_ID && cardActive() && c.ok ? 'Renew ' : '') + c.label)}</span></button>`;
}
const tilesHtml = rewards => `<div class="shop-items-grid">${Game.rewardsHtml(rewards)}</div>`;
function miniTiles(rewards) {
  const out = [];
  if (rewards.gems) out.push(Game.tileHtml({ icon: 'gem', rarity: 'epic', count: Game.fmt(rewards.gems) }));
  for (const [id, n] of Object.entries(rewards.items || {})) out.push(Game.itemTileHtml(id, n));
  return out.join('');
}

// ---------------------------------------------------------------- section: Gems
function renderGems() {
  const s = sh();
  const starter = product(STARTER_ID);
  const feature = s.owned[STARTER_ID] ? '' : `<article class="shop-feature panel" id="shop-f-starter">
      <div class="shop-feature-rays" aria-hidden="true"></div>
      <div class="shop-feature-art">${starterArt()}</div>
      <div class="shop-feature-info">
        <div class="shop-pack-tags"><span class="shop-tag">One time</span><span class="shop-value">${starter.value} value</span></div>
        <h3 class="shop-feature-title">Starter Pack</h3>
        <p class="shop-feature-desc">300 Gems, 3 Recruit Tickets, speedups, XP Books and crates.</p>
      </div>
      ${buyBtn(starter, 'shop-feature-buy')}
    </article>`;
  return `${feature}
    <h3 class="section-title">Gem packs</h3>
    <div class="shop-gem-grid">${GEM_TIERS.map(t => {
      const first = !s.first[t.id];
      return `<div class="shop-gem card shop-gem-t${t.art}" id="shop-g-${t.art}">
        ${first ? '<span class="shop-x2" title="First purchase bonus">2x</span>' : ''}
        ${t.tag ? `<span class="shop-gem-tag">${esc(t.tag)}</span>` : ''}
        <div class="shop-gem-art">${gemArt(t.art)}</div>
        <div class="shop-gem-amt">${Game.icon('gem', 20)}<span>${fmtFull(t.gems)}</span></div>
        <div class="shop-gem-bonus">${first ? `+${fmtFull(t.gems)} first-time bonus` : `+${fmtFull(vipPtsFor(t))} VIP points`}</div>
        ${buyBtn(t, 'wide')}
      </div>`;
    }).join('')}</div>
    <div class="shop-foot">
      <p class="shop-note">${Game.icon('info', 16)}<span>Test store: nothing is charged in this build. Each purchase also adds ${VIP_PER_USD} VIP points per $1.</span></p>
      <div class="shop-foot-btns">
        <button type="button" class="btn ghost small" data-act="restore" data-k="act:restore">${Game.icon('refresh', 16)}<span>Restore purchases</span></button>
        <button type="button" class="btn ghost small" data-act="history" data-k="act:history">${Game.icon('clock', 16)}<span>History</span></button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- section: Packs
function limitNote(p) {
  const s = sh();
  if (p.kind === 'builder') {
    if (s.owned[p.id]) return 'Active. You have two builders.';
    if (vipLevel() >= VIP_BUILDER_LV) return 'Included with your VIP 6.';
    return `Permanent. Also unlocked at VIP ${VIP_BUILDER_LV}.`;
  }
  if (p.type === 'non_consumable') return s.owned[p.id] ? 'Purchased. Thank you, Chief.' : 'One per chief.';
  if (p.limit) {
    const left = Math.max(0, p.limit - num(s.counts[p.id]));
    return left ? `${left} of ${p.limit} left` : 'Sold out';
  }
  if (p.dailyLimit) {
    ensureDay();
    const bought = num(s.dayCounts[p.id]) >= p.dailyLimit;
    return `${bought ? 'Bought today. ' : ''}New deal in ${Game.fmtTime(secsToMidnight())}`;
  }
  return '';
}
function packPanel(p) {
  const c = canBuy(p);
  const done = c.code === 'owned' || c.code === 'included';
  return `<article class="shop-pack panel shop-pack-${p.slug}${done ? ' is-done' : ''}" id="shop-p-${p.slug}">
    <div class="shop-pack-head">
      <div class="shop-pack-art shop-art-box">${productArt(p)}</div>
      <div class="shop-pack-info">
        <div class="shop-pack-tags">${p.tag ? `<span class="shop-tag">${esc(p.tag)}</span>` : ''}${p.value && !done ? `<span class="shop-value">${esc(p.value)} value</span>` : ''}</div>
        <h3 class="shop-pack-title">${esc(p.title)}</h3>
        <p class="shop-pack-desc">${esc(p.desc)}</p>
      </div>
    </div>
    ${tilesHtml(contentsOf(p))}
    <div class="shop-pack-foot"><span class="shop-pack-note" data-limit="${p.id}">${esc(limitNote(p))}</span>${buyBtn(p)}</div>
  </article>`;
}
function cardPanel() {
  const p = product(CARD_ID);
  const active = cardActive();
  return `<article class="shop-pack panel shop-pack-card${active ? ' is-active' : ''}" id="shop-p-card">
    <div class="shop-pack-head">
      <div class="shop-pack-art shop-art-box">${cardArt()}</div>
      <div class="shop-pack-info">
        <div class="shop-pack-tags"><span class="shop-tag">${active ? 'Active' : '30 days'}</span><span class="shop-value">${p.value} value</span></div>
        <h3 class="shop-pack-title">Monthly Card</h3>
        <p class="shop-pack-desc">${esc(p.desc)}</p>
      </div>
    </div>
    ${active ? `<div class="shop-mcard">
        <div class="shop-mcard-info"><div class="shop-mcard-days"><span data-card-days></span></div><div class="shop-mcard-sub" data-card-sub></div></div>
        <button type="button" class="btn green" data-claim="card" data-k="claim:card">${Game.icon('gem', 18)}<span data-card-btn>Claim</span></button>
      </div>
      <div class="shop-pack-foot"><span class="shop-pack-note">Renew any time to add 30 more days.</span>${buyBtn(p, 'small')}</div>`
    : `${tilesHtml(contentsOf(p))}
      <div class="shop-pack-foot"><span class="shop-pack-note">Claim every day. Missed days are lost.</span>${buyBtn(p)}</div>`}
  </article>`;
}
function renderPacks() {
  // the starter pack leads while it is available, then the monthly card; finished one-time offers sink to the end
  const list = [STARTER_ID, BUILDER_ID, DAILY_ID, HERO_ID].map(product);
  const isDone = p => ['owned', 'included'].includes(canBuy(p).code);
  const avail = list.filter(p => !isDone(p));
  const head = avail[0]?.id === STARTER_ID ? [avail.shift()] : [];
  return `<div class="shop-packs">${head.map(packPanel).join('')}${cardPanel()}${avail.map(packPanel).join('')}${list.filter(isDone).map(packPanel).join('')}</div>`;
}

// ---------------------------------------------------------------- section: VIP
function perkRows(lv) {
  const now = vipRow(lv);
  const next = lv < VIP_MAX ? vipRow(lv + 1) : null;
  return PERKS.map(k => {
    const v = now[k.key];
    const nv = next ? next[k.key] : v;
    return `<div class="shop-perk${v ? '' : ' is-off'}">
      <span class="shop-perk-ico${k.cls ? ' shop-perk-' + k.cls : ''}">${Game.icon(k.icon, 20)}</span>
      <span class="shop-perk-name">${esc(k.label)}</span>
      <span class="shop-perk-val">${esc(k.val(v))}</span>
      ${next && nv !== v ? `<span class="shop-perk-next">${Game.icon('chevron_right', 12)}${esc(k.val(nv))}</span>` : '<span class="shop-perk-next"></span>'}
    </div>`;
  }).join('');
}
function vipLevelCard(v, lv) {
  const prev = vipRow(v.lv - 1);
  const lines = PERKS.filter(k => v[k.key]).map(k => `<li class="${v[k.key] !== prev[k.key] ? 'is-new' : ''}">${esc(k.label)} <b>${esc(k.val(v[k.key]))}</b></li>`).join('');
  const state = v.lv === lv ? 'Current' : v.lv < lv ? 'Reached' : '';
  return `<article class="shop-vlv card${v.lv === lv ? ' is-current' : ''}${v.lv > lv ? ' is-locked' : ''}" id="shop-vip-${v.lv}">
    <div class="shop-vlv-head">
      ${vipCrest(v.lv, 34)}
      <div class="shop-vlv-id"><div class="shop-vlv-name">VIP ${v.lv}</div><div class="shop-vlv-pts">${fmtFull(v.pts)} points</div></div>
      ${state ? `<span class="shop-vlv-state">${state}</span>` : `<span class="shop-vlv-lock">${Game.icon('lock', 16)}</span>`}
    </div>
    <ul class="shop-vlv-perks">${lines}</ul>
    <div class="shop-vlv-gift">
      <div class="shop-vlv-gift-label">Level gift</div>
      <div class="shop-vlv-tiles">${miniTiles(vipGift(v.lv))}</div>
      <button type="button" class="btn green small" data-claim="vipgift:${v.lv}" data-k="claim:vipgift:${v.lv}"><span data-gift-lbl>Claim</span></button>
    </div>
  </article>`;
}
function renderVip() {
  const lv = vipLevel();
  const builderHint = Game.perk('builders') < 2 && !sh().owned[BUILDER_ID] && lv < VIP_BUILDER_LV
    ? `<div class="shop-hint card">${Game.icon('hammer', 30)}<div><div class="shop-row-title">Second builder</div><div class="shop-row-sub">Reach VIP ${VIP_BUILDER_LV}, or hire one now in Packs.</div></div><button type="button" class="btn blue small" data-go="shop:builder" data-k="go:builder">Get</button></div>`
    : '';
  return `<div class="shop-vip-hero panel">
      <div class="shop-vip-crest">${vipCrest(lv, 78)}</div>
      <div class="shop-vip-main">
        <div class="shop-vip-lv">VIP ${lv}</div>
        <div class="progress gold shop-vip-bar"><div class="bar" data-vip-bar></div><span class="progress-label" data-vip-pts></span></div>
        <div class="shop-vip-next" data-vip-next></div>
      </div>
    </div>
    <div class="shop-vip-daily card">
      <span class="shop-vip-daily-ico">${Game.icon('vip', 36)}</span>
      <div><div class="shop-row-title">Daily VIP points</div><div class="shop-row-sub" data-vip-daily-sub></div></div>
      <button type="button" class="btn green small" data-claim="vipday" data-k="claim:vipday"><span data-vip-daily-btn>Claim</span></button>
    </div>
    ${builderHint}
    <h3 class="section-title">Your perks</h3>
    <div class="shop-perks card">
      <div class="shop-perk shop-perk-head"><span></span><span>Perk</span><span>VIP ${lv}</span><span>${lv < VIP_MAX ? 'VIP ' + (lv + 1) : ''}</span></div>
      ${perkRows(lv)}
    </div>
    <p class="shop-note">${Game.icon('info', 16)}<span>Every $1 in the store adds ${VIP_PER_USD} VIP points. VIP levels never expire.</span></p>
    <h3 class="section-title">VIP levels</h3>
    <div class="shop-vlist">${VIP.slice(1).map(v => vipLevelCard(v, lv)).join('')}</div>`;
}

// ---------------------------------------------------------------- section: Gem Shop
function renderItems() {
  return `<article class="shop-gift panel" id="shop-p-gift">
      <div class="shop-gift-art shop-art-box">${Game.icon('gift', 52)}</div>
      <div class="shop-gift-info">
        <h3 class="shop-pack-title">Daily Free Gift</h3>
        <p class="shop-pack-desc" data-gift-sub></p>
      </div>
      <div class="shop-gift-tiles">${miniTiles(giftContents())}</div>
      <button type="button" class="btn green shop-gift-btn" data-claim="gift" data-k="claim:gift"><span data-gift-btn>Claim</span></button>
    </article>
    <div class="shop-gs-head"><h3 class="section-title">Spend Gems</h3><span class="shop-reset">${Game.icon('clock', 14)}<span data-reset></span></span></div>
    <div class="shop-gs-grid">${GEM_SHOP.map(g => {
      const d = Game.itemDefs[g.item] || { name: g.item };
      return `<div class="shop-gs card" data-gscard="${g.id}">
        ${g.tag ? `<span class="shop-gs-tag">${esc(g.tag)}</span>` : ''}
        ${Game.itemTileHtml(g.item)}
        <div class="shop-gs-name">${esc(d.name)}</div>
        <div class="shop-gs-left" data-gs-left></div>
        <button type="button" class="btn gold small shop-gs-buy" data-gs="${g.id}" data-k="gs:${g.id}" aria-label="Buy ${esc(d.name)}"></button>
      </div>`;
    }).join('')}</div>
    <p class="shop-note">${Game.icon('info', 16)}<span>Every Gem purchase asks first. Daily limits reset at midnight.</span></p>`;
}

const SECTION = {
  gems: { render: renderGems, sig: () => [sh().owned[STARTER_ID] ? 1 : 0, ...GEM_TIERS.map(t => (sh().first[t.id] ? 1 : 0))].join('') },
  packs: {
    render: renderPacks,
    sig: () => [sh().owned[STARTER_ID], sh().owned[BUILDER_ID], vipLevel() >= VIP_BUILDER_LV, cardActive(), canBuy(product(HERO_ID)).ok].map(Boolean).join(','),
  },
  vip: { render: renderVip, sig: () => [vipLevel(), Game.perk('builders'), sh().owned[BUILDER_ID] ? 1 : 0].join(',') },
  items: { render: renderItems, sig: () => String(today()) },
};

function renderSection(id, force = false) {
  const host = ui.secs[id];
  if (!host || !ready()) return;
  const sig = SECTION[id].sig();
  if (!force && ui.sigs[id] === sig) return;
  ui.sigs[id] = sig;
  const a = document.activeElement;
  const key = a && host.contains(a) ? a.getAttribute('data-k') : null;
  host.innerHTML = SECTION[id].render();
  if (key) {
    const again = host.querySelector(`[data-k="${CSS.escape(key)}"]`);
    try { again?.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  updateSection(id);
}

function syncBuyButtons(host) {
  host.querySelectorAll('[data-buy]').forEach(b => {
    const p = product(b.dataset.buy);
    const c = canBuy(p);
    const label = (c.ok ? b.dataset.prefix || '' : '') + c.label;
    setText(b.querySelector('.shop-price-txt'), label);
    const dis = !c.ok || !!inFlight;
    if (b.disabled !== dis) b.disabled = dis;
    b.classList.toggle('is-done', !c.ok);
  });
}

function updateSection(id) {
  const host = ui.secs[id];
  if (!host || !ready()) return;
  syncBuyButtons(host);
  if (id === 'packs') {
    host.querySelectorAll('[data-limit]').forEach(n => setText(n, limitNote(product(n.dataset.limit))));
    const days = host.querySelector('[data-card-days]');
    if (days) {
      const left = cardClaimsLeft();
      const can = cardClaimable();
      setText(days, `${left} ${left === 1 ? 'claim' : 'claims'} left`);
      setText(host.querySelector('[data-card-sub]'), can ? `Today: ${product(CARD_ID).daily} Gems ready` : `Next claim in ${Game.fmtTime(secsToMidnight())}`);
      setText(host.querySelector('[data-card-btn]'), can ? `Claim ${product(CARD_ID).daily}` : 'Claimed');
      const b = host.querySelector('[data-claim="card"]');
      if (b.disabled !== !can) b.disabled = !can;
    }
  } else if (id === 'vip') {
    const lv = vipLevel();
    const pts = vipPoints();
    const cur = vipRow(lv).pts;
    const next = lv < VIP_MAX ? vipRow(lv + 1).pts : null;
    host.querySelector('[data-vip-bar]').style.width = (next ? Math.min(100, ((pts - cur) / (next - cur)) * 100) : 100).toFixed(1) + '%';
    setText(host.querySelector('[data-vip-pts]'), next ? `${fmtFull(pts)} / ${fmtFull(next)}` : `${fmtFull(pts)} points`);
    setText(host.querySelector('[data-vip-next]'), next ? `${fmtFull(next - pts)} points to VIP ${lv + 1}` : 'Highest VIP level reached.');
    const can = vipDailyReady();
    const st = can ? vipStreakNext() : num(sh().vipStreak);
    setText(host.querySelector('[data-vip-daily-sub]'), can
      ? `Day ${st} streak: +${vipDailyPts(st)} points`
      : `Day ${st} streak. Tomorrow +${vipDailyPts(st + 1)}, in ${Game.fmtTime(secsToMidnight())}`);
    setText(host.querySelector('[data-vip-daily-btn]'), can ? `Claim +${vipDailyPts(st)}` : 'Claimed');
    const db = host.querySelector('[data-claim="vipday"]');
    if (db.disabled !== !can) db.disabled = !can;
    host.querySelectorAll('[data-claim^="vipgift:"]').forEach(b => {
      const L = Number(b.dataset.claim.split(':')[1]);
      const claimed = !!sh().vipGifts[L];
      const reached = lv >= L;
      setHtml(b.querySelector('[data-gift-lbl]'), claimed ? 'Claimed' : reached ? 'Claim' : `${Game.icon('lock', 14)} VIP ${L}`);
      const dis = claimed || !reached;
      if (b.disabled !== dis) b.disabled = dis;
      b.classList.toggle('ghost', dis);
      b.classList.toggle('green', !dis);
    });
  } else if (id === 'items') {
    const can = giftReady();
    setText(host.querySelector('[data-gift-sub]'), can ? 'Free once a day. Ready now.' : `Next gift in ${Game.fmtTime(secsToMidnight())}`);
    setText(host.querySelector('[data-gift-btn]'), can ? 'Claim' : 'Claimed');
    const gb = host.querySelector('[data-claim="gift"]');
    if (gb.disabled !== !can) gb.disabled = !can;
    setText(host.querySelector('[data-reset]'), `Resets in ${Game.fmtTime(secsToMidnight())}`);
    const gems = num(Game.S.res.gems);
    host.querySelectorAll('[data-gscard]').forEach(cardEl => {
      const g = gsDef(cardEl.dataset.gscard);
      const left = gsLeft(g);
      const cost = gsCost(g);
      setText(cardEl.querySelector('[data-gs-left]'), left === Infinity ? 'No daily limit' : `${left}/${g.limit} today`);
      const b = cardEl.querySelector('[data-gs]');
      setHtml(b, left > 0 ? `${Game.icon('gem', 16)}<span class="${gems < cost ? 'shop-short' : ''}">${fmtFull(cost)}</span>` : 'Sold out');
      if (b.disabled !== (left <= 0)) b.disabled = left <= 0;
      cardEl.classList.toggle('is-done', left <= 0);
    });
  }
}

function updateSegDots() {
  if (!ui.root) return;
  const c = claimables();
  const per = { gems: 0, packs: c.card, vip: c.vip, items: c.gift };
  for (const s of SECTIONS) {
    const dot = ui.root.querySelector(`[data-sec="${s.id}"] .badge-dot`);
    if (dot) dot.hidden = !per[s.id];
  }
}

function showSection(id, opts = {}) {
  if (!ui.root) return;
  if (!SECTIONS.some(s => s.id === id)) id = 'gems';
  const changed = ui.cur !== id;
  ui.cur = id;
  Game.storage.set(SEC_KEY, id);
  for (const s of SECTIONS) {
    ui.secs[s.id].hidden = s.id !== id;
    ui.root.querySelector(`[data-sec="${s.id}"]`).setAttribute('aria-pressed', String(s.id === id));
  }
  renderSection(id);
  updateSection(id);
  updateSegDots();
  if (opts.focus) focusCard(opts.focus);
  else if (changed && opts.scroll !== false) ui.root.scrollTop = 0;
}

function focusCard(elId) {
  const target = ui.root && ui.root.querySelector('#' + CSS.escape(elId));
  if (!target) return;
  const top = ui.root.querySelector('.shop-top');
  const offset = (top ? top.offsetHeight : 0) + 10;
  const dy = target.getBoundingClientRect().top - ui.root.getBoundingClientRect().top - offset;
  ui.root.scrollTop += dy;
  target.classList.remove('shop-flash');
  void target.offsetWidth;
  target.classList.add('shop-flash');
  setTimeout(() => target.classList.remove('shop-flash'), 1800);
}

function refreshNow() {
  if (!ready()) return;
  updateBadges();
  syncOfferButton();
  if (!ui.root || !ui.cur) return;
  renderSection(ui.cur);
  updateSection(ui.cur);
  updateSegDots();
}

function claim(what) {
  if (what === 'card') return claimCard();
  if (what === 'gift') return claimGift();
  if (what === 'vipday') return claimVipDaily();
  if (what.startsWith('vipgift:')) return claimVipGift(Number(what.split(':')[1]));
  return false;
}

async function doRestore() {
  const r = await restore();
  if (!r.ok) Game.toast('Could not reach the store. Try again later.', 'bad');
  else if (r.restored) Game.toast(`Restored ${r.restored} purchase${r.restored > 1 ? 's' : ''}.`, 'good');
  else Game.toast('Nothing to restore. Your purchases are up to date.');
}

function onScreenClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled || !ui.root.contains(b)) return;
  const d = b.dataset;
  if (d.sec) showSection(d.sec);
  else if (d.buy) purchase(d.buy);
  else if (d.gs) gemShopSheet(d.gs);
  else if (d.claim) claim(d.claim);
  else if (d.go) Game.navigate(d.go);
  else if (d.act === 'restore') doRestore();
  else if (d.act === 'history') historySheet();
}

Game.registerScreen('shop', {
  tab: { label: 'Shop', icon: 'gem', order: 5 },
  mount(el) {
    ui.root = el;
    el.innerHTML = `<div class="shop">
      <div class="shop-top">
        <div class="shop-head">
          <h2 class="shop-title">${Game.icon('shop', 28)}<span>Shop</span></h2>
          <span class="shop-ribbon" data-ribbon>Test store</span>
        </div>
        <div class="seg shop-seg" role="group" aria-label="Shop sections">${SECTIONS.map(s => `<button type="button" id="shop-tab-${s.id}" data-sec="${s.id}" aria-pressed="false"><span>${s.label}</span><span class="badge-dot" aria-hidden="true" hidden></span></button>`).join('')}</div>
      </div>
      ${SECTIONS.map(s => `<div class="shop-sec shop-sec-${s.id}" data-secbody="${s.id}" hidden></div>`).join('')}
    </div>`;
    for (const s of SECTIONS) ui.secs[s.id] = el.querySelector(`[data-secbody="${s.id}"]`);
    el.addEventListener('click', onScreenClick);
    showSection(loadSec(), { scroll: false });
  },
  update() {
    if (!ui.root || !ready()) return;
    const rib = ui.root.querySelector('[data-ribbon]');
    if (rib) rib.hidden = !provider?.isTest;
    updateSegDots();
    renderSection(ui.cur);
    updateSection(ui.cur);
  },
});

const NAV_FOCUS = {
  starter: ['packs', 'shop-p-starter'],
  builder: ['packs', 'shop-p-builder'],
  monthly: ['packs', 'shop-p-card'],
  card: ['packs', 'shop-p-card'],
  daily: ['packs', 'shop-p-daily'],
  hero: ['packs', 'shop-p-hero'],
  gift: ['items', 'shop-p-gift'],
};
Game.registerNav('shop', rest => {
  const r = String(rest || '').split(':')[0];
  if (!r) {
    // from the tab: jump to the section with something to claim when the current one has nothing
    const c = claimables();
    const per = { gems: 0, packs: c.card, vip: c.vip, items: c.gift };
    const cur = ui.cur || loadSec();
    const pick = per[cur] ? cur : ['items', 'packs', 'vip'].find(s => per[s]) || cur;
    showSection(pick);
    return;
  }
  if (r === 'history') {
    showSection(ui.cur || 'gems');
    historySheet();
    return;
  }
  if (NAV_FOCUS[r]) {
    const [sec, elId] = NAV_FOCUS[r];
    showSection(sec, { focus: elId });
    return;
  }
  showSection(r === 'gemshop' || r === 'store' ? 'items' : r);
});

// ============================================================ sheets
function gemShopSheet(id) {
  const g = gsDef(id);
  if (!g || !ready()) return null;
  const d = Game.itemDefs[g.item] || { name: g.item, icon: 'crate' };
  const startLeft = gsLeft(g);
  if (startLeft <= 0) { Game.toast('Sold out for today.'); return null; }
  const cost0 = gsCost(g);
  const max = Math.max(1, Math.min(99, startLeft, Math.floor(num(Game.S.res.gems) / cost0) || 1));
  let qty = 1;
  const body = Game.el(`<div class="shop-buy">
    <div class="shop-buy-top">${Game.itemTileHtml(g.item)}<div><div class="shop-buy-name${d.rarity ? ' rarity-text rarity-' + esc(d.rarity) : ''}">${esc(d.name)}</div><div class="shop-buy-owned">Owned <span data-owned></span></div><p class="shop-buy-desc">${esc(Game.itemDesc(g.item))}</p></div></div>
    ${max > 1 ? `<div class="shop-buy-qty">
      <button type="button" class="icon-btn" data-q="-1" aria-label="One less">${Game.icon('minus', 16)}</button>
      <input type="range" id="shop-buy-qty" min="1" max="${max}" value="1" aria-label="Amount to buy">
      <button type="button" class="icon-btn" data-q="1" aria-label="One more">${Game.icon('plus', 16)}</button>
      <span class="shop-buy-n" data-n>1</span>
    </div>` : ''}
    <div class="shop-buy-total"><span>Total</span><span class="shop-buy-cost">${Game.icon('gem', 20)}<span data-total></span></span></div>
    <p class="shop-buy-limit" data-limit></p>
  </div>`);
  const total = () => gsCost(g) * qty;
  const setQty = v => {
    qty = Math.max(1, Math.min(max, Math.floor(Number(v) || 1)));
    const r = body.querySelector('#shop-buy-qty');
    if (r && Number(r.value) !== qty) r.value = String(qty);
    sheet.refresh();
  };
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    if (b) setQty(qty + Number(b.dataset.q));
  });
  body.addEventListener('input', e => { if (e.target.id === 'shop-buy-qty') setQty(e.target.value); });
  const sheet = Game.sheet({
    title: 'Buy with Gems',
    body,
    className: 'shop-buy-sheet',
    update: el => {
      setText(el.querySelector('[data-owned]'), fmtFull(Game.itemCount(g.item)));
      const n = el.querySelector('[data-n]');
      if (n) setText(n, 'x' + qty);
      const t = el.querySelector('[data-total]');
      setText(t, fmtFull(total()));
      t.classList.toggle('shop-short', num(Game.S.res.gems) < total());
      const left = gsLeft(g);
      setText(el.querySelector('[data-limit]'), left === Infinity ? `You have ${fmtFull(Game.S.res.gems)} Gems.` : `${left} left today. You have ${fmtFull(Game.S.res.gems)} Gems.`);
    },
    actions: [
      { id: 'gs-cancel', label: 'Cancel', kind: 'ghost', onClick: () => {} },
      {
        id: 'gs-buy',
        label: () => `<span>Buy</span><span class="btn-cost">${Game.icon('gem', 18)}${fmtFull(total())}</span>`,
        kind: 'gold',
        disabled: () => gsLeft(g) < qty,
        onClick: () => {
          const n = qty;
          const cost = total();
          if (gsLeft(g) < n) { Game.toast('Daily limit reached.', 'bad'); return false; }
          if (!Game.spend({ gems: cost }, 'shop:' + g.item)) { Game.needGems(cost); return false; }
          ensureDay();
          if (g.limit) sh().gs[g.id] = num(sh().gs[g.id]) + n;
          Game.grant({ items: { [g.item]: n } }, { source: 'shop:gems', popup: true, title: 'Purchased' });
          Game.emit('shop:bought', { id: g.id, item: g.item, count: n, gems: cost });
          refreshNow();
          return undefined;
        },
      },
    ],
  });
  return sheet;
}

function historySheet() {
  const list = Game.store.history();
  const when = at => {
    try { return new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  };
  const total = ready() ? num(sh().spentUsd) : 0;
  const body = `<div class="shop-hist">
    ${list.length ? list.map(h => `<div class="shop-hist-row card">
        <div class="shop-hist-main"><div class="shop-hist-title">${esc(h.title)}</div><div class="shop-hist-meta">${esc(when(h.at))}</div><div class="shop-hist-tx">${esc(h.tx)}</div></div>
        <div class="shop-hist-side"><div class="shop-hist-price">${usd(h.usd)}</div>${h.test ? '<span class="shop-hist-test">Test</span>' : ''}</div>
      </div>`).join('') : '<p class="shop-empty">No purchases yet.</p>'}
    ${list.length ? `<p class="shop-note">${Game.icon('info', 16)}<span>Listed total ${usd(total)}. Test purchases are never charged.</span></p>` : ''}
  </div>`;
  return Game.sheet({ title: 'Purchase history', body, className: 'shop-hist-sheet' });
}

function giftSheet() {
  let shownDay = today();
  const body = Game.el(`<div class="shop-giftsheet">
    <div class="shop-giftsheet-art"><div class="shop-feature-rays" aria-hidden="true"></div>${Game.icon('gift', 76)}</div>
    <p class="shop-giftsheet-sub" data-sub></p>
    <div class="shop-items-grid" data-items>${Game.rewardsHtml(giftContents())}</div>
  </div>`);
  return Game.sheet({
    title: 'Daily Free Gift',
    body,
    className: 'shop-gift-sheet',
    update: el => {
      if (shownDay !== today()) {
        shownDay = today();
        el.querySelector('[data-items]').innerHTML = Game.rewardsHtml(giftContents());
      }
      setText(el.querySelector('[data-sub]'), giftReady() ? 'A free gift every day. Ready now.' : `Claimed. Next gift in ${Game.fmtTime(secsToMidnight())}.`);
    },
    actions: [
      { id: 'gift-shop', label: 'Shop', kind: 'ghost', onClick: () => Game.navigate('shop:items') },
      { id: 'gift-claim', label: () => (giftReady() ? 'Claim' : 'Claimed'), kind: 'green', disabled: () => !giftReady(), onClick: () => { claimGift(); } },
    ],
  });
}

// ============================================================ module, events, city hooks
Game.registerModule({
  id: 'shop',
  initState,
  migrate,
  tick() { updateBadges(); },
});

Game.on('day:reset', () => {
  if (!ready()) return;
  ensureDay();
  updateBadges();
});

// The starter offer gets a City side button only after the first steps (Furnace 3), so the opening minutes stay
// focused on the chapter quest; it disappears once bought.
const OFFER_FURNACE = 3;
let offerShown = false;
function syncOfferButton() {
  if (!Game.isReady || !ready()) return;
  const want = !sh().owned[STARTER_ID] && Game.furnaceLevel() >= OFFER_FURNACE;
  if (want && !offerShown) {
    Game.city?.addSideButton?.({ id: 'shop-offer', icon: 'lf_offer', label: 'Offer', onClick: () => Game.navigate('shop:starter') });
    offerShown = true;
  } else if (!want && offerShown) {
    Game.city?.removeSideButton?.('shop-offer');
    offerShown = false;
  }
}

Game.on('ready', () => {
  updateBadges();
  Game.city?.addSideButton?.({ id: 'shop-gift', icon: 'gift', label: 'Gift', onClick: giftSheet, badge: () => (giftReady() ? 1 : 0) });
  syncOfferButton();
});
Game.on('building:upgraded', syncOfferButton);
Game.on('purchase:completed', syncOfferButton);

Game.shop = {
  vipLevel,
  vipPoints,
  addVipPoints,
  vipPerks: lv => ({ ...vipRow(lv ?? vipLevel()) }),
  open: section => Game.navigate(section ? 'shop:' + section : 'shop'),
  giftReady,
  claimGift,
  openGift: giftSheet,
  monthlyCard: () => ({ active: cardActive(), claimable: cardClaimable(), claimsLeft: cardClaimsLeft() }),
  claimMonthly: claimCard,
  hasSecondBuilder: () => ready() && (!!sh().owned[BUILDER_ID] || vipLevel() >= VIP_BUILDER_LV),
  claimables,
  gemShop: () => GEM_SHOP.map(g => ({ id: g.id, item: g.item, cost: gsCost(g), limit: g.limit || null, left: ready() ? gsLeft(g) : null })),
};
