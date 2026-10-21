/* Age of Conquest simulation: world creation, the clock, queues, marches, battles, landmarks, territory, world
   events and the chronicle. AI decisions live in ai.js, player commands and views in api.js. Part of the engine. */

const SCHEMA = 2;   // 2: the kingdom map (384 tiles, zones, passes and holy sites)
const PLAYER = GOVERNORS - 1;

// ================================================================ creation
function newGovernor(w, id, opts) {
  const civ = opts.civ;
  const arch = opts.arch;
  const A = ARCHETYPES[arch];
  const t = {};
  for (const k in A.t) t[k] = Math.round(clamp(A.t[k] + (rnd(w) - 0.5) * 0.3, 0, 1) * 100) / 100;
  const syl = SYL[civ];
  const name = opts.name || (rpick(w, syl[0]) + rpick(w, syl[1]) + (rnd(w) < 0.3 ? ' ' + rpick(w, EPITHETS) : ''));
  const g = {
    id, name, civ, arch, t, bg: opts.bg ?? rint(w, 0, BACKGROUNDS.length - 1), human: !!opts.human,
    x: opts.x, y: opts.y, guild: -1, role: null, joined: 0,
    b: { hall: 1, farm: 1, lumber: 1, warehouse: 0, barracks: 1 },
    res: { food: 3000, wood: 3000, stone: 1000, iron: 400, gold: 300 }, at: w.t,
    troops: { inf: 300, cav: 0, arc: 100, sie: 0 }, away: { inf: 0, cav: 0, arc: 0, sie: 0 }, wounded: { inf: 0, cav: 0, arc: 0, sie: 0 },
    tech: {}, cmds: {}, steward: CIV[civ].commander, defender: CIV[civ].commander,
    q: { build: null, research: null, train: { inf: null, cav: null, arc: null, sie: null }, heal: null, exchange: null },
    shield: w.t + NEWCOMER_SHIELD, shieldCd: 0, wallDur: wallDurability(0),
    stats: { wins: 0, losses: 0, defWins: 0, defLosses: 0, camps: 0, scouts: 0, rallies: 0, traded: 0, healed: 0, trained: { inf: 0, cav: 0, arc: 0, sie: 0 }, kills: 0, deaths: 0, sacked: 0, sackedOthers: 0, gathered: 0, contributed: 0 },
    intel: [], rel: {}, mem: [], log: [],
    st: 'grow', goal: null, next: w.t + rint(w, 1, 40), explore: 16 + Math.round(t.activity * 10), alert: null,
    power: 0, recruited: 0, tradedToday: 0, tradeDay: 0, lastAttack: null, lastAt: 0, crate: {},
  };
  g.cmds[CIV[civ].commander] = { lv: 1, xp: 0, sk: [1, 1, 1, 1], tal: {} };
  // AI governors begin with the same base; their head start depends only on how actively they play (activity),
  // simulated as a few early decisions in createWorld, never extra resources
  return g;
}

function createWorld(opts = {}) {
  const seed = (opts.seed >>> 0) || ((Date.now() ^ 0x5bd1e995) >>> 0);
  const w = {
    v: SCHEMA, seed, rs: hash32(seed, 'sim'), t: 6 * HOUR, age: 1, server: SERVER.id, created: opts.now || 0, realSavedAt: opts.now || 0,
    map: null, govs: [], guilds: [], marks: [], camps: [], nodes: [], marches: [], rallies: [], nid: 1, battleN: 0,
    events: [], nextEventAt: 6 * HOUR + rint({ rs: hash32(seed, 'ev') }, 18, 30) * HOUR, chron: [], chronN: 0, reports: [], battles: [],
    hist: { terr: {}, power: {} }, market: { price: { food: 1, wood: 1, stone: 1, iron: 1, gold: 1 } },
    player: PLAYER, quests: { claimed: {} }, settings: { offlineCap: 12 * HOUR, notify: 'important' }, devSw: { unlimited: false, instant: false },
    throne: { owner: -1, since: 0 }, exchangeBy: null, ages: [], explored: null, dev: !!opts.dev, lastDay: 0, campRespawn: [],
    notes: [], stats: { battles: 0 },
  };
  initMap(w);
  placeLandmarks(w);
  placeGuildsAndGovernors(w, opts);
  placeCampsAndNodes(w);
  rebuildBuckets(w);
  for (const g of w.govs) g.power = computePower(g);
  recomputeTerritory(w);
  for (const gd of w.guilds) gd.power = guildPower(w, gd);
  rankGuilds(w);
  // the server opens: history begins with the founding of the guilds
  for (const gd of w.guilds) chronicle(w, 'guild_founded', `${gd.name} [${gd.tag}] raised its banner in ${SERVER.regions[gd.home.region]} under ${w.govs[gd.leader].name}.`, { g: [gd.id], p: [gd.leader], x: gd.home.x, y: gd.home.y, imp: 2 });
  chronicle(w, 'server_open', `The ${SERVER.name} server opened. ${GOVERNORS} governors in ${GUILD_COUNT} guilds and ${w.govs.filter(g => g.guild < 0).length} independents. The Capital opens on Day ${1 + THRONE_OPENS / DAY}.`, { imp: 3 });
  // the newcomer knows the lands around their city, and every map shows where the passes, the holy sites and the
  // Capital stand
  w.explored = new Uint8Array(N2);
  const P = w.govs[PLAYER];
  stampDisc(w.explored, P.x, P.y, 16, 1);
  for (const mk of w.marks) if (mk.kind !== 'ruin') stampDisc(w.explored, mk.x, mk.y, 2, 1);
  if (opts.scenario === 'coalition') scenarioCoalition(w);
  updatePlayerVision(w);
  return w;
}

function initMap(w) {
  const k = generateTerrain(w.seed);
  w.map = { ter: k.ter, reg: k.reg, wall: k.wall, gates: k.gates, occ: new Int32Array(N2), terr: new Uint8Array(N2) };
}

const PASS_NAMES = { 1: ['Wolfjaw Pass', 'Greystep Pass', 'Brinegate Pass', 'Redwall Pass', 'Duskgap Pass', 'Cinder Notch'], 2: ['Frost Gate', 'Grey Gate', 'Salt Gate', 'Red Gate', 'Dusk Gate', 'Cinder Gate'], 3: ['Ember Gate', 'Iron Gate', 'Ash Gate'] };
const SITE_NAMES = {
  sanctum: ['Sanctum of Dawn', 'Sanctum of Embers', 'Sanctum of Rain', 'Sanctum of the Oak', 'Sanctum of Salt', 'Sanctum of the Hearth', 'Sanctum of Stars', 'Sanctum of Echoes', 'Sanctum of the Well', 'Sanctum of Ash', 'Sanctum of the Moon', 'Sanctum of Thorns'],
  altar: ['Altar of Blood', 'Altar of Iron', 'Altar of Storms', 'Altar of Bones', 'Altar of Flame', 'Altar of Frost'],
  shrine: ['Shrine of the Sun', 'Shrine of the Deep', 'Shrine of Wings', 'Shrine of Crowns', 'Shrine of the Veil', 'Shrine of Tides'],
  temple: ['Shrine of the First King', 'Shrine of the Last Flame', 'Shrine of the Open Sky'],
};
const RUIN_NAMES = ['Ruins of Old Kharum', 'The Sunken Temple', 'Ashfall Barrow', 'The Glass Library', 'Watchers\' Circle', 'Hollow Crown Ruins', 'The Drowned Abbey', 'Moonfall Crater', 'The Broken Aqueduct',
  'Thornwall Keep', 'The Silent Forge', 'Pillars of Varn', 'The Buried Market', 'Saltbone Ruins', 'The Weeping Arch', 'Old Emberhold', 'The Fallen Spire', 'Graves of the Nine'];
const fortGarrison = lv => ({ inf: 2600 + lv * 700, cav: 1400 + lv * 400, arc: 2000 + lv * 500, sie: 200 });
// the Capital in the middle, a pass in every gap of the ranges, holy sites and ruins in every region
function placeLandmarks(w) {
  const rng = makeRng(hash32(w.seed, 'marks'));
  const add = (kind, name, x, y, extra) => {
    const m = { id: w.marks.length, kind, name, x, y, owner: -1, since: 0, level: extra.level, garrison: extra.garrison, base: { ...extra.garrison }, region: extra.region, lastHit: 0, wallDur: 0, wallMax: 0, opens: extra.opens || 0 };
    for (const k of ['site', 'blessing', 'gate', 'tier', 'links']) if (extra[k] != null) m[k] = extra[k];
    m.wallMax = wallDurability(m.level) * (kind === 'capital' ? 3 : kind === 'pass' ? 2 : 1.5);
    m.wallDur = m.wallMax;
    w.marks.push(m);
    w.map.occ[idx(m.x, m.y)] = OCC_MARK + m.id;
    return m;
  };
  // the nearest free tile of the region, away from the ranges and from other landmarks
  const put = (kind, name, x, y, extra) => {
    let best = null, bd = Infinity;
    for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) {
      const nx = x + dx, ny = y + dy, d = Math.abs(dx) + Math.abs(dy);
      if (d >= bd || !inMap(nx, ny) || nx < 5 || ny < 5 || nx > N - 6 || ny > N - 6) continue;
      const i = idx(nx, ny);
      const t = w.map.ter[i];
      if (!passable(w, i) || t === T.ford || t === T.pass || w.map.occ[i] || w.map.reg[i] !== extra.region) continue;
      if (wallNear(w, nx, ny, 4) || w.marks.some(m => dist(m.x, m.y, nx, ny) < 9)) continue;
      bd = d; best = [nx, ny];
    }
    return best ? add(kind, name, best[0], best[1], extra) : null;
  };
  const at = (a, r) => [Math.round(CX + Math.cos(a) * r), Math.round(CY + Math.sin(a) * r)];
  const shuffled = arr => { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  put('capital', 'The Ember Throne', Math.round(CX), Math.round(CY), { level: 20, garrison: { inf: 26000, cav: 14000, arc: 18000, sie: 2000 }, region: 9, opens: THRONE_OPENS });
  for (const G of w.map.gates) {
    const PL = PASS_LEVELS[G.level];
    const n = G.level === 3 ? G.k - 12 : G.k % 6;
    add('pass', PASS_NAMES[G.level][n], G.x, G.y, { level: PL.garrison, garrison: fortGarrison(PL.garrison), region: G.links[0], opens: PL.opens, gate: G.k, tier: G.level, links: G.links.slice() });
  }
  const site = (kind, k, name, blessing, x, y, region) => {
    const S = SITES[kind], lv = S.level + rng.int(0, 2);
    return put('site', name, x, y, { level: lv, garrison: fortGarrison(lv), region, opens: S.opens, site: kind, blessing });
  };
  const sb = shuffled(SITES.sanctum.blessings), ab = shuffled(SITES.altar.blessings), shb = shuffled(SITES.shrine.blessings), tb = shuffled(SITES.temple.blessings);
  const sn = shuffled(SITE_NAMES.sanctum);
  const ruins = shuffled(RUIN_NAMES);
  let ri = 0;
  const ruin = (x, y, region, lv) => put('ruin', ruins[ri++], x, y, { level: lv, garrison: { inf: 600 * lv, cav: 260 * lv, arc: 450 * lv, sie: 0 }, region });
  for (let k = 0; k < 6; k++) {
    const ac = A0 + (k + 0.5) * SEC1;
    const band = a => edgeDist(a) - R2;
    const o = k >= 3 ? 1 : 0;
    let a = ac - SEC1 * 0.28; site('sanctum', k, sn[2 * k], sb[(2 * k + o) % 6], ...at(a, R2 + band(a) * 0.32), k);
    a = ac + SEC1 * 0.28; site('sanctum', k, sn[2 * k + 1], sb[(2 * k + 1 + o) % 6], ...at(a, R2 + band(a) * 0.66), k);
    site('altar', k, SITE_NAMES.altar[k], ab[k % 3], ...at(ac + SEC1 * 0.05, R2 + band(ac) * 0.16), k);
    for (let j = 0; j < 2; j++) { a = ac + (rng() - 0.5) * SEC1 * 0.7; ruin(...at(a, R2 + band(a) * (0.25 + rng() * 0.55)), k, 4 + rng.int(0, 3)); }
  }
  for (let j = 0; j < 3; j++) {
    const ac = A0 + (j + 0.5) * SEC2;
    site('shrine', j, SITE_NAMES.shrine[2 * j], shb[2 * j], ...at(ac - SEC2 * 0.24, (R3 + R2) / 2), 6 + j);
    site('shrine', j, SITE_NAMES.shrine[2 * j + 1], shb[2 * j + 1], ...at(ac + SEC2 * 0.24, (R3 + R2) / 2 + 6), 6 + j);
    for (let q = 0; q < 2; q++) { const a = ac + (rng() - 0.5) * SEC2 * 0.8; ruin(...at(a, R3 + (R2 - R3) * (0.3 + rng() * 0.4)), 6 + j, 9 + rng.int(0, 3)); }
    site('temple', j, SITE_NAMES.temple[j], tb[j], ...at(A0 + (j + 1) * SEC2, R3 * 0.55), 9);
  }
}

function placeGuildsAndGovernors(w, opts) {
  const rng = makeRng(hash32(w.seed, 'people'));
  const c = N / 2;
  // archetype pool for the 599 AI governors
  const pool = [];
  const wsum = Object.values(ARCH_MIX).reduce((a, b) => a + b, 0);
  for (const k of ARCH_KEYS) for (let i = 0; i < Math.round(ARCH_MIX[k] * (GOVERNORS - 1) / wsum); i++) pool.push(k);
  while (pool.length < GOVERNORS - 1) pool.push('casual');
  pool.length = GOVERNORS - 1;
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  // guild homes in Zone 1, each with a leading civilization: two guilds share each of the four large corner
  // regions, one has each of the two smaller ones (the north and the south)
  const civOrder = CIVS.map(x => x.id);
  for (let i = civOrder.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [civOrder[i], civOrder[j]] = [civOrder[j], civOrder[i]]; }
  const sizes = SERVER.bloc.map(k => clamp(Math.round(46 * k + rng.int(-3, 3)), 30, GUILD_MAX));
  const slots = [];
  for (const k of [0, 1, 2, 3, 4, 5]) { if (k === 0 || k === 3) slots.push([k, 0]); else slots.push([k, -0.25], [k, 0.25]); }
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  for (let gi = 0; gi < GUILD_COUNT; gi++) {
    const [k, off] = slots[gi];
    const a = A0 + (k + 0.5 + off) * SEC1;
    const r = R2 + (edgeDist(a) - R2) * (0.5 + (rng() - 0.5) * 0.12);
    const hx = Math.round(c + Math.cos(a) * r), hy = Math.round(c + Math.sin(a) * r);
    const spot = freeTileNear(w, hx, hy, 10, rng, { region: k, nearWall: 6 }) || freeTileNear(w, hx, hy, 40, rng, { region: k }) || [hx, hy];
    const S = SERVER.guilds[gi];
    w.guilds.push({
      id: gi, name: S.name, tag: S.tag, color: S.color, emblem: S.emblem, founded: w.t, home: { x: spot[0], y: spot[1], region: k },
      civ: civOrder[gi], leader: -1, officers: [], members: [], rule: ['strongest', 'election', 'heir'][gi % 3], heir: -1,
      policy: { stance: 'grow', target: -1, objective: -1, since: w.t, why: 'The guild is building its strength.' },
      treasury: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 }, tech: { granary: 0, banners: 0, bulwark: 0 },
      rel: new Array(GUILD_COUNT).fill(0), treaties: {}, cred: 70, warScore: {}, next: w.t + rint(w, 30, 240), stats: { kills: 0, losses: 0, forts: 0, sacked: 0, wars: 0 },
      power: 0, rank: gi + 1, proposals: [], collapsed: false, refoundAt: 0, applicants: [], plan: [], age: 1,
    });
  }
  // initial relations: neighbours are wary, a few old friendships and grudges
  for (let i = 0; i < GUILD_COUNT; i++) for (let j = i + 1; j < GUILD_COUNT; j++) {
    const d = dist(w.guilds[i].home.x, w.guilds[i].home.y, w.guilds[j].home.x, w.guilds[j].home.y);
    let v = Math.round((rng() - 0.5) * 50 - (d < 90 ? 12 : 0));
    w.guilds[i].rel[j] = w.guilds[j].rel[i] = v;
  }
  let id = 0;
  const mk = (gi, arch) => {
    const gd = gi >= 0 ? w.guilds[gi] : null;
    const civ = gd && rng() < 0.55 ? gd.civ : rng.pick(CIVS).id;
    // members settle around their guild's home; independents anywhere in Zone 1, more of them in the large regions
    const region = gd ? gd.home.region : rng.pick([0, 1, 1, 2, 2, 3, 4, 4, 5, 5]);
    const [cx0, cy0] = gd ? [gd.home.x, gd.home.y] : regionCenter(region);
    const spot = freeTileNear(w, cx0, cy0, gd ? 30 : 75, rng, { region, prefer: gd ? T[CIV[civ].terrain] ?? undefined : undefined, spread: true, awayFromMarks: 4 });
    const p = spot || freeTileNear(w, cx0, cy0, 90, rng, { region }) || freeTileNear(w, c, c, N * 0.7, rng, { zone: 1 });
    const g = newGovernor(w, id, { civ, arch, x: p[0], y: p[1] });
    w.govs.push(g);
    w.map.occ[idx(g.x, g.y)] = OCC_CITY + g.id;
    id++;
    return g;
  };
  // guild members first, then the independents
  let left = pool.slice();
  for (let gi = 0; gi < GUILD_COUNT; gi++) {
    const gd = w.guilds[gi];
    // leaders and officers come from ambitious archetypes
    const want = sizes[gi];
    const taken = [];
    const prefer = ['emperor', 'competitor', 'rallylead', 'diplomat', 'tactician'];
    for (let k = 0; k < want && left.length; k++) {
      let pi = 0;
      if (k < 5) { const j = left.findIndex(a => prefer.includes(a)); if (j >= 0) pi = j; }
      taken.push(left.splice(pi, 1)[0]);
    }
    for (const arch of taken) {
      const g = mk(gi, arch);
      joinGuild(w, g, gi, true);
    }
    const byAmb = gd.members.slice().sort((a, b) => w.govs[b].t.ambition - w.govs[a].t.ambition);
    setLeader(w, gd, byAmb[0], true);
    gd.officers = byAmb.slice(1, 1 + OFFICERS_MAX);
    for (const o of gd.officers) w.govs[o].role = 'officer';
    gd.heir = gd.officers[0] ?? -1;
  }
  for (const arch of left) mk(-1, arch);
  // the player: an independent newcomer in the north or the south of Zone 1, off to one side of the one guild there,
  // with camps and fields nearby
  const pk = rng() < 0.5 ? 0 : 3;
  const pa = A0 + (pk + 0.5 + (rng() < 0.5 ? -0.3 : 0.3)) * SEC1;
  const pr = R2 + (edgeDist(pa) - R2) * 0.5;
  const px = Math.round(c + Math.cos(pa) * pr), py = Math.round(c + Math.sin(pa) * pr);
  const ps = freeTileNear(w, px, py, 10, rng, { region: pk, spread: true, awayFromMarks: 5, nearWall: 6 }) || freeTileNear(w, px, py, 30, rng, { region: pk }) || freeTileNear(w, c, c, N * 0.7, rng, { zone: 1 });
  const pc = CIV[opts.civ] ? opts.civ : 'ashen';
  const player = newGovernor(w, PLAYER, { civ: pc, arch: 'tactician', x: ps[0], y: ps[1], human: true, name: String(opts.name || 'Governor').slice(0, 24) || 'Governor' });
  player.next = Infinity;
  player.explore = 0;
  w.govs.push(player);
  w.map.occ[idx(player.x, player.y)] = OCC_CITY + PLAYER;
  // the AI's first hours: each governor makes a few opening decisions with its own resources
  for (const g of w.govs) if (!g.human) { const n = Math.round(1 + g.t.activity * 3); for (let k = 0; k < n; k++) aiEconomy(w, g, true); }
}

function placeCampsAndNodes(w) {
  const rng = makeRng(hash32(w.seed, 'camps'));
  // three weak camps and a few fields near the newcomer, so the first fights are winnable
  const P = w.govs[PLAYER];
  const pr = regionAt(w, P.x, P.y);
  for (let k = 0; k < 3; k++) {
    const c = spawnCamp(w, rng);
    const p = c && freeTileNear(w, P.x, P.y, 9, rng, { minR: 4, awayFromMarks: 2, region: pr });
    if (c && p) { w.map.occ[idx(c.x, c.y)] = 0; c.x = p[0]; c.y = p[1]; c.lv = 1; c.troops = { inf: 80, cav: 45, arc: 55, sie: 0 }; c.reserved = PLAYER; c.until = w.t + NEWCOMER_SHIELD; w.map.occ[idx(c.x, c.y)] = c.occ; }
  }
  for (const [res, pref] of [['food', T.plains], ['wood', T.forest], ['stone', T.hills]]) {
    const n = spawnNode(w, rng, res, pref);
    const p = n && freeTileNear(w, P.x, P.y, 10, rng, { minR: 3, prefer: pref, awayFromMarks: 2, region: pr });
    if (n && p) { w.map.occ[idx(n.x, n.y)] = 0; n.x = p[0]; n.y = p[1]; n.lv = 1; n.max = n.amount = res === 'stone' ? 30000 : 40000; w.map.occ[idx(n.x, n.y)] = n.occ; }
  }
  for (let k = 0; k < CAMPS; k++) spawnCamp(w, rng);
  const kinds = [['food', T.plains], ['wood', T.forest], ['stone', T.hills], ['iron', T.hills], ['gold', T.plains]];
  for (let k = 0; k < NODES; k++) {
    const [res, pref] = kinds[k % 5 === 4 && rng() < 0.5 ? 4 : k % 4];
    spawnNode(w, rng, res, pref);
  }
}
const CAMPS = 600, NODES = 1200;
// how far toward the centre a tile lies within its zone: 0 at the zone's outer edge, 1 at its inner edge
function depthOf(w, x, y) {
  const r = dist(x, y, CX, CY), z = zoneAt(w, x, y);
  if (z === 3) return clamp(1 - r / R3, 0, 1);
  if (z === 2) return clamp((R2 - r) / (R2 - R3), 0, 1);
  return clamp(1 - (r - R2) / (edgeDist(Math.atan2(y - CY, x - CX)) - R2), 0, 1);
}
// bandit camps: levels 1-4 in Zone 1, 4-7 in Zone 2 and 7-10 in the heartland, rising toward the centre
function spawnCamp(w, rng, near) {
  const p = near ? freeTileNear(w, near[0], near[1], near[2], rng, { awayFromMarks: 3, region: near[3] }) : freeTileNear(w, CX, CY, N * 0.71, rng, { minR: 12, awayFromMarks: 3 });
  if (!p) return null;
  const z = zoneAt(w, p[0], p[1]), k = depthOf(w, p[0], p[1]);
  const lv = clamp(Math.round((z === 1 ? 1 + 2.4 * k : z === 2 ? 4 + 2.6 * k : 7 + 3 * k) + rng() * 1.2 - 0.6), 1, 10);
  const base = 180 * lv * Math.pow(1.35, lv - 1);
  const camp = { id: w.nid++, x: p[0], y: p[1], lv, troops: { inf: Math.round(base * 0.45), cav: Math.round(base * 0.25), arc: Math.round(base * 0.3), sie: 0 } };
  w.camps.push(camp);
  w.map.occ[idx(camp.x, camp.y)] = OCC_CAMP + (camp.id % 9999);
  camp.occ = OCC_CAMP + (camp.id % 9999);
  return camp;
}
// resource fields: levels 1-2 in Zone 1, 3-4 in Zone 2, 5 in the heartland
function spawnNode(w, rng, res, pref, near) {
  const p = near ? freeTileNear(w, near[0], near[1], near[2], rng, { prefer: pref, awayFromMarks: 2, region: near[3] }) : freeTileNear(w, CX, CY, N * 0.71, rng, { prefer: pref, awayFromMarks: 2 });
  if (!p) return null;
  const z = zoneAt(w, p[0], p[1]), k = depthOf(w, p[0], p[1]);
  const lv = clamp(z === 3 ? 5 : z === 2 ? 3 + Math.round(k * 0.6 + rng() * 0.6) : 1 + Math.round(k * 0.6 + rng() * 0.6), 1, 5);
  const max = Math.round((res === 'gold' ? 8000 : res === 'iron' ? 15000 : 40000) * lv);
  const node = { id: w.nid++, x: p[0], y: p[1], res, lv, amount: max, max, by: null };
  w.nodes.push(node);
  node.occ = OCC_NODE + (node.id % 9999);
  w.map.occ[idx(node.x, node.y)] = node.occ;
  return node;
}

// ================================================================ guild membership
function joinGuild(w, g, gi, quiet) {
  const gd = w.guilds[gi];
  if (!gd || gd.members.length >= GUILD_MAX || g.guild === gi) return false;
  if (g.guild >= 0) leaveGuild(w, g, true);
  gd.members.push(g.id);
  g.guild = gi; g.role = 'member'; g.joined = w.t;
  modsChanged(g);
  if (!quiet) remember(w, g, { k: 'joined', g: gi });
  return true;
}
function leaveGuild(w, g, quiet) {
  const gi = g.guild;
  if (gi < 0) return false;
  const gd = w.guilds[gi];
  gd.members = gd.members.filter(x => x !== g.id);
  gd.officers = gd.officers.filter(x => x !== g.id);
  if (gd.heir === g.id) gd.heir = gd.officers[0] ?? -1;
  // garrisoned troops come home
  for (const m of w.marches) if (m.owner === g.id && (m.state === 'garrison' || m.kind === 'rallyjoin')) sendHome(w, m);
  g.guild = -1; g.role = null;
  modsChanged(g);
  if (gd.leader === g.id) {
    gd.leader = -1;
    if (gd.members.length) succession(w, gd, 'the leader left');
  }
  if (!quiet) remember(w, g, { k: 'left', g: gi });
  return true;
}
function setLeader(w, gd, id, quiet) {
  if (gd.leader >= 0 && w.govs[gd.leader] && w.govs[gd.leader].guild === gd.id) w.govs[gd.leader].role = 'member';
  gd.leader = id;
  const g = w.govs[id];
  g.role = 'leader';
  gd.officers = gd.officers.filter(x => x !== id);
  if (gd.heir === id) gd.heir = gd.officers[0] ?? -1;
  if (!quiet) remember(w, g, { k: 'leader', g: gd.id });
}

// ================================================================ memory and decision log
function remember(w, g, e) {
  e.t = w.t;
  g.mem.push(e);
  if (g.mem.length > 12) {
    // keep the most important: drop the oldest routine entry first
    const k = g.mem.findIndex(x => x.k === 'scouted' || x.k === 'starve' || x.k === 'joined');
    g.mem.splice(k >= 0 && k < g.mem.length - 1 ? k : 0, 1);
  }
}
// vis: 'public' (anyone who saw it), 'guild' (guild mates), 'private' (only with fresh intel)
function decide(w, g, k, text, vis = 'private') {
  g.log.push({ t: w.t, k, text, vis });
  if (g.log.length > 6) g.log.shift();
}
function relAdjust(g, other, d) {
  const v = clamp((g.rel[other] || 0) + d, -100, 100);
  g.rel[other] = Math.round(v);
  const keys = Object.keys(g.rel);
  if (keys.length > 18) {
    // forget the weakest feeling
    let wk = null, wv = Infinity;
    for (const k of keys) { const a = Math.abs(g.rel[k]); if (a < wv) { wv = a; wk = k; } }
    delete g.rel[wk];
  }
}

// ================================================================ chronicle
function chronicle(w, k, txt, o = {}) {
  const e = { n: ++w.chronN, t: w.t, k, txt, g: o.g || [], p: o.p || [], x: o.x ?? null, y: o.y ?? null, imp: o.imp || 1, vis: o.vis || 'public' };
  w.chron.push(e);
  if (w.chron.length > 1600) {
    // drop the oldest minor entries first so wars and conquests stay in the record
    const k2 = w.chron.findIndex(x => x.imp === 1);
    w.chron.splice(k2 >= 0 ? k2 : 0, 1);
  }
  if (e.imp >= 2 || e.p.includes(PLAYER)) note(w, 'chronicle', txt, e.imp >= 3 ? 3 : e.p.includes(PLAYER) ? 3 : 2);
  return e;
}
// notifications for the player (the interface drains them)
function note(w, k, text, imp = 2, ref = null) {
  w.notes.push({ t: w.t, k, text, imp, ref });
  if (w.notes.length > 80) w.notes.splice(0, w.notes.length - 80);
}

// ================================================================ the clock
function step(w, dt) {
  dt = Math.max(1, Math.round(dt));
  w.t += dt;
  // player resources stay current; everyone else settles when they act or are acted on
  const P = w.govs[PLAYER];
  settle(w, P, w.t);
  if (w.devSw?.unlimited) devRefill(w);
  processQueues(w);
  moveMarches(w, dt);
  processRallies(w);
  thinkAll(w, dt);
  if (w.t % 30 < dt) { for (const g of w.govs) g.power = computePower(g); for (const gd of w.guilds) gd.power = guildPower(w, gd); rankGuilds(w); }
  if (w.t % 60 < dt) { recomputeTerritory(w); regrowLandmarks(w); respawnCamps(w); }
  worldEvents(w);
  throneCheck(w);
  const day = Math.floor(w.t / DAY);
  if (day !== w.lastDay) { w.lastDay = day; dayTick(w, day); }
  if (w.t % 5 < dt) updatePlayerVision(w);
}
function advance(w, minutes, onProgress) {
  // catch-up runs in 5-minute steps; the interface shows a progress bar
  const coarse = minutes > 120 ? 5 : 1;
  let done = 0;
  while (done < minutes) {
    const d = Math.min(coarse, minutes - done);
    step(w, d);
    done += d;
    if (onProgress && done % 120 < d) onProgress(done / minutes);
  }
}
function day(w) { return 1 + Math.floor(w.t / DAY); }
function clock(t) { const d = 1 + Math.floor(t / DAY), m = t % DAY; return `Day ${d}, ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

// ================================================================ queues
function processQueues(w) {
  for (const g of w.govs) {
    const q = g.q;
    if (q.build && q.build.end <= w.t) {
      const { id, L } = q.build;
      q.build = null;
      settle(w, g, w.t);
      g.b[id] = L;
      modsChanged(g);
      if (id === 'wall') g.wallDur = wallMax(g, cityMods(w, g));
      if (g.human) { note(w, 'build', `${BUILDINGS[id].name} reached level ${L}.`, 2); }
      if (!g.human && id === 'hall' && L >= 10 && L % 5 === 0) chronicle(w, 'growth', `${g.name}${tagOf(w, g)} raised a level ${L} Town Hall.`, { p: [g.id], g: g.guild >= 0 ? [g.guild] : [], x: g.x, y: g.y, imp: 1 });
      checkRecruits(w, g);
      g.power = computePower(g);
    }
    if (q.research && q.research.end <= w.t) {
      const { id, lv } = q.research;
      q.research = null;
      settle(w, g, w.t);
      g.tech[id] = lv;
      modsChanged(g);
      if (g.human) note(w, 'research', `${TECHS[id].name} reached level ${lv}.`, 2);
      checkRecruits(w, g);
    }
    for (const u of UNIT_KEYS) {
      const tq = q.train[u];
      if (tq && tq.end <= w.t) {
        q.train[u] = null;
        settle(w, g, w.t);
        g.troops[u] += tq.n;
        g.stats.trained[u] += tq.n;
        if (g.human) note(w, 'train', `${tq.n.toLocaleString('en-US')} ${UNITS[u].plural} finished training.`, 2);
        checkRecruits(w, g);
      }
    }
    if (q.heal && q.heal.end <= w.t) {
      const h = q.heal;
      q.heal = null;
      let n = 0;
      for (const u of UNIT_KEYS) { g.troops[u] += h.troops[u] || 0; n += h.troops[u] || 0; }
      g.stats.healed += n;
      if (g.human) note(w, 'heal', `${n.toLocaleString('en-US')} wounded troops returned to duty.`, 2);
      checkRecruits(w, g);
    }
    if (q.exchange && q.exchange.end <= w.t) {
      q.exchange = null;
      completeExchange(w, g);
    }
  }
}

// ================================================================ commanders
function checkRecruits(w, g) {
  for (const id in RECRUIT) {
    if (g.cmds[id]) continue;
    const r = RECRUIT[id];
    let ok = false;
    const s = g.stats;
    switch (r.kind) {
      case 'hall': ok = g.b.hall >= r.n; break;
      case 'camps': ok = s.camps >= r.n; break;
      case 'scouts': ok = s.scouts >= r.n; break;
      case 'rallies': ok = s.rallies >= r.n; break;
      case 'defenses': ok = s.defWins >= r.n; break;
      case 'tech': ok = (g.tech[r.id] || 0) >= r.n; break;
      case 'wins': ok = s.wins >= r.n; break;
      case 'traded': ok = s.traded >= r.n; break;
      case 'building': ok = (g.b[r.id] || 0) >= r.n; break;
      case 'troops': ok = s.trained[r.unit] >= r.n; break;
      case 'healed': ok = s.healed >= r.n; break;
    }
    if (!ok) continue;
    g.cmds[id] = { lv: 1, xp: 0, sk: [1, 1, 1, 1], tal: {} };
    g.recruited++;
    if (g.human) {
      note(w, 'commander', `${CMD[id].name}, ${CMD[id].title}, joined you.`, 3);
      chronicle(w, 'commander', `${CMD[id].name}, ${CMD[id].title}, swore service to ${g.name}.`, { p: [g.id], x: g.x, y: g.y, imp: 1 });
    }
  }
}
function giveXp(w, g, id, xp) {
  const r = cmdRec(g, id);
  if (!r || r.lv >= CMD_MAX_LEVEL) return;
  r.xp += Math.round(xp);
  while (r.lv < CMD_MAX_LEVEL && r.xp >= cmdXpToNext(r.lv, CMD[id].rarity)) {
    r.xp -= cmdXpToNext(r.lv, CMD[id].rarity);
    r.lv++;
    modsChanged(g);
    // AI governors spend talent points along the commander's first two branches; skills rise every 5 levels
    if (!g.human) { const b = CMD[id].talents[r.lv % 3 === 0 ? 1 : 0]; r.tal[b] = (r.tal[b] || 0) + 1; }
    if (r.lv % 5 === 0) { const k = (r.lv / 5) % 4; if (r.sk[k] < 5) r.sk[k]++; }
    if (g.human) note(w, 'commander', `${CMD[id].name} reached level ${r.lv}.${r.lv === ULTIMATE_LEVEL ? ' Ultimate unlocked.' : ''}`, 2);
  }
}
function talentPointsFree(r) { let used = 0; for (const b in r.tal) used += r.tal[b]; return Math.max(0, r.lv - 1 - used); }
function busyCommanders(w, g) {
  const s = new Set();
  for (const m of w.marches) if (m.owner === g.id && m.kind !== 'scout') { if (m.c1) s.add(m.c1); if (m.c2) s.add(m.c2); }
  return s;
}

// ================================================================ marches
// kinds: attack (city, camp, node gatherer, landmark), gather, scout, reinforce (guild landmark), rallyjoin, rally, return
function marchLimit(w, g) { return marchSlots(g.b.hall) + (g.b.hall >= 15 ? 1 : 0); }
function marchCap(w, g) { return Math.round(marchCapacity(g.b.hall) * (1 + (cityMods(w, g).capacity || 0))); }
function activeMarches(w, g) { return w.marches.filter(m => m.owner === g.id && m.kind !== 'scout' && m.state !== 'garrison').length; }
function marchSpeed(w, g, troops, c1, c2, kind) {
  const m = cityMods(w, g);
  if (kind === 'scout') return 2.2 * (1 + (m.scoutSpeed || 0));
  let s = Infinity;
  const variant = CIV[g.civ].variant;
  for (const u of UNIT_KEYS) if ((troops[u] || 0) > 0) s = Math.min(s, UNITS[u].speed * (variant.unit === u ? 1 + (variant.mods.speed || 0) : 1));
  if (s === Infinity) s = 0.6;
  let k = 1 + (m.speed || 0);
  if (c1) k += commanderMods(g, c1, { primary: true }).speed || 0;
  if (c2) k += commanderMods(g, c2, {}).speed || 0;
  if (kind === 'reinforce' || kind === 'rallyjoin' || kind === 'rally') {
    if (c1) k += commanderMods(g, c1, {}).reinforceSpeed || 0;
  }
  return Math.max(0.15, s * k);
}
function tileTarget(w, i) {
  const v = w.map.occ[i];
  const k = occKind(v);
  if (k === 'city') return { type: 'city', id: v - OCC_CITY };
  if (k === 'mark') return { type: 'mark', id: v - OCC_MARK };
  if (k === 'camp') { const c = w.camps.find(x => x.occ === v && idx(x.x, x.y) === i); return c ? { type: 'camp', id: c.id } : null; }
  if (k === 'node') { const n = w.nodes.find(x => x.occ === v && idx(x.x, x.y) === i); return n ? { type: 'node', id: n.id } : null; }
  return null;
}
function opensText(mk) {
  const d = Math.floor(mk.opens / DAY) + 1, h = Math.floor((mk.opens % DAY) / HOUR);
  return `${mk.kind === 'capital' ? 'The Capital' : mk.name} opens on Day ${d}${h ? ` at ${String(h).padStart(2, '0')}:00` : ''}.`;
}
// why a march cannot get there: a closed pass in the way, or no way at all
function noWayText(w, g, to) {
  const reg = w.map.reg[to];
  if (reg === 255) return 'There is no way to march there.';
  if (!canReach(w, g, to)) return g.guild < 0 ? 'A mountain range is in the way. Only a guild that holds a pass can march through it: join a guild.' : 'A mountain range is in the way. Your guild must hold a pass into that region first.';
  return 'There is no way to march there.';
}
// validated start of any march. Returns { ok, err, march }.
function startMarch(w, g, o) {
  const kind = o.kind;
  const to = o.to;
  if (!Number.isInteger(to) || to < 0 || to >= N2) return { ok: false, err: 'That is not a place on the map.' };
  const troops = {};
  let total = 0;
  for (const u of UNIT_KEYS) {
    const n = Math.floor(Number(o.troops?.[u]) || 0);
    if (n < 0) return { ok: false, err: 'Troop counts cannot be negative.' };
    if (n > g.troops[u]) return { ok: false, err: `You only have ${g.troops[u].toLocaleString('en-US')} ${UNITS[u].plural} at home.` };
    troops[u] = n; total += n;
  }
  if (kind !== 'scout' && total <= 0) return { ok: false, err: 'Send at least one soldier.' };
  if (kind === 'scout' && total > 0) return { ok: false, err: 'Scouts travel without troops.' };
  if (kind !== 'scout' && total > marchCap(w, g)) return { ok: false, err: `An army can hold at most ${marchCap(w, g).toLocaleString('en-US')} troops at your Town Hall level.` };
  if (kind !== 'scout' && activeMarches(w, g) >= marchLimit(w, g)) return { ok: false, err: `All ${marchLimit(w, g)} march slots are in use.` };
  if (kind === 'scout' && w.marches.filter(m => m.owner === g.id && m.kind === 'scout').length >= 1 + Math.floor((g.b.tower || 0) / 4)) return { ok: false, err: 'Your scouts are all out. A higher Watchtower sends more.' };
  const busy = busyCommanders(w, g);
  let c1 = kind === 'scout' ? null : (o.c1 || null), c2 = kind === 'scout' ? null : (o.c2 || null);
  if (c1 && !(typeof c1 === 'string' && Object.prototype.hasOwnProperty.call(g.cmds, c1))) return { ok: false, err: 'You do not have that commander.' };
  if (c2 && !(typeof c2 === 'string' && Object.prototype.hasOwnProperty.call(g.cmds, c2))) return { ok: false, err: 'You do not have that commander.' };
  if (c1 && c1 === c2) c2 = null;
  if (c1 && busy.has(c1)) return { ok: false, err: `${CMD[c1].name} is already leading an army.` };
  if (c2 && busy.has(c2)) return { ok: false, err: `${CMD[c2].name} is already leading an army.` };
  if (kind !== 'scout' && !c1) return { ok: false, err: 'Choose a commander to lead the army.' };
  const from = idx(g.x, g.y);
  if (to === from && kind !== 'rally') return { ok: false, err: 'That is your own city.' };
  const target = o.target || tileTarget(w, to);
  // target rules
  if (kind === 'scout' && !target && !passable(w, to)) return { ok: false, err: 'Scouts cannot cross there.' };
  if (kind === 'attack' || (kind === 'scout' && target)) {
    if (!target) return { ok: false, err: 'There is nothing there.' };
    if (target.type === 'city') {
      const d = w.govs[target.id];
      if (!d || d.id === g.id) return { ok: false, err: 'That is your own city.' };
      if (kind === 'attack') {
        if (g.guild >= 0 && d.guild === g.guild) return { ok: false, err: 'You cannot attack a member of your own guild.' };
        if (g.guild >= 0 && d.guild >= 0 && treaty(w, g.guild, d.guild)?.k === 'alliance') return { ok: false, err: 'Your guild is allied with theirs.' };
        if (d.shield > w.t) return { ok: false, err: 'That city is under a peace shield.' };
      }
    } else if (target.type === 'mark') {
      const mk = w.marks[target.id];
      if (kind === 'attack') {
        if (mk.kind !== 'ruin' && w.t < mk.opens) return { ok: false, err: opensText(mk) };
        if (mk.kind !== 'ruin' && g.guild < 0) return { ok: false, err: 'Only guild members can fight for passes, holy sites and the Capital.' };
        if (mk.kind !== 'ruin' && mk.owner === g.guild && g.guild >= 0) return { ok: false, err: 'Your guild already holds it. Reinforce it instead.' };
        if (mk.kind !== 'ruin' && !o.fromRally) return { ok: false, err: 'Passes, holy sites and the Capital can only be taken by a rally.' };
        if (mk.kind === 'ruin' && (mk.cleared || []).includes(g.id)) return { ok: false, err: 'You have already explored these ruins.' };
      }
    } else if (target.type === 'node' && kind === 'attack') {
      const nd = w.nodes.find(x => x.id === target.id);
      const occ = nd && nd.by ? w.marches.find(m => m.id === nd.by) : null;
      if (!occ) return { ok: false, err: 'Nobody is gathering there.' };
      if (occ.owner === g.id) return { ok: false, err: 'Those are your own troops.' };
      const og = w.govs[occ.owner];
      if (g.guild >= 0 && og.guild === g.guild) return { ok: false, err: 'Those troops belong to your guild.' };
    }
  }
  if (kind === 'attack' && target?.type === 'camp') {
    const cp = w.camps.find(x => x.id === target.id);
    if (cp && cp.reserved != null && cp.reserved !== g.id && w.t < cp.until) return { ok: false, err: 'That camp is reserved for a newcomer.' };
  }
  if (kind === 'gather') {
    const nd = target && target.type === 'node' ? w.nodes.find(x => x.id === target.id) : null;
    if (!nd) return { ok: false, err: 'Gather from a resource field.' };
    if (nd.by) return { ok: false, err: 'Someone is already gathering there.' };
  }
  if (kind === 'reinforce') {
    const mk = target && target.type === 'mark' ? w.marks[target.id] : null;
    if (!mk || mk.kind === 'ruin' || g.guild < 0 || mk.owner !== g.guild) return { ok: false, err: 'You can only reinforce a pass, holy site or Capital your guild holds.' };
  }
  const path = findPath(w, from, to, gateAccess(w, g.guild));
  if (!path) return { ok: false, err: noWayText(w, g, to) };
  const speed = marchSpeed(w, g, troops, c1, c2, kind);
  const cost = pathCost(w, path);
  if (kind === 'attack' && target.type !== 'camp' && g.shield > w.t) g.shield = 0;   // attacking breaks your own shield
  settle(w, g, w.t);
  for (const u of UNIT_KEYS) { g.troops[u] -= troops[u]; g.away[u] += troops[u]; }
  const m = {
    id: w.nid++, kind, owner: g.id, troops, c1, c2, path, k: 0, frac: 0, speed, from, to, target, state: 'out', dep: w.t, eta: w.t + Math.ceil(cost / speed),
    load: null, rally: o.rally || null, wounded: null, gatherEnd: 0, alerted: false, parts: o.parts || null,
  };
  w.marches.push(m);
  if (kind === 'scout') g.stats.scouts++;
  return { ok: true, march: m };
}
function marchPos(w, m) {
  const a = m.path[Math.min(m.k, m.path.length - 1)], b = m.path[Math.min(m.k + 1, m.path.length - 1)];
  return [tx(a) + (tx(b) - tx(a)) * m.frac, ty(a) + (ty(b) - ty(a)) * m.frac];
}
function moveMarches(w, dt) {
  for (const m of w.marches.slice()) {
    if (m.dead) continue;
    if (m.state === 'gathering') {
      if (w.t >= m.gatherEnd) finishGather(w, m);
      continue;
    }
    if (m.state === 'garrison' || m.state === 'waiting') continue;
    let budget = m.speed * dt;
    const last = m.path.length - 1;
    while (budget > 0 && m.k < last) {
      const a = m.path[m.k], b = m.path[m.k + 1];
      const c = tileCosts(w)[b] * ((tx(a) !== tx(b) && ty(a) !== ty(b)) ? 1.4142 : 1);
      const need = c * (1 - m.frac);
      if (budget >= need) { budget -= need; m.k++; m.frac = 0; } else { m.frac += budget / c; budget = 0; }
    }
    // a hostile army entering the target's watch range raises the alarm
    if (m.kind === 'attack' && m.target?.type === 'city' && !m.alerted) {
      const d = w.govs[m.target.id];
      const [px, py] = marchPos(w, m);
      if (d && dist(px, py, d.x, d.y) <= visionRadius(d.b.tower || 0, d.b.hall) + 2) {
        m.alerted = true;
        d.alert = { by: m.owner, march: m.id, t: w.t, size: troopsTotal(m.troops) };
        if (d.human) note(w, 'alert', `Incoming attack: ${w.govs[m.owner].name}${tagOf(w, w.govs[m.owner])} is marching on your city with about ${roundSig(troopsTotal(m.troops))} troops.`, 3, { march: m.id });
        else d.next = Math.min(d.next, w.t);
      }
    }
    if (m.k >= last) arrive(w, m);
  }
}
function roundSig(v) { const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1)); return (Math.round(v / mag) * mag).toLocaleString('en-US'); }
function removeMarch(w, m) { m.dead = true; const k = w.marches.indexOf(m); if (k >= 0) w.marches.splice(k, 1); }
// turn a march around toward its owner's city (from wherever it is now)
function sendHome(w, m, extra = {}) {
  const g = w.govs[m.owner];
  if (m.kind === 'gather' || m.state === 'gathering') releaseNode(w, m);
  const here = m.path[Math.min(m.k, m.path.length - 1)];
  const home = idx(g.x, g.y);
  // retrace the way out when it started at home (no search needed); otherwise find a new way
  let path;
  if (here === home) path = [home];
  else if (m.path[0] === home && m.kind !== 'return') path = m.path.slice(0, Math.min(m.k, m.path.length - 1) + 1).reverse();
  else path = findPath(w, here, home, ALL_GATES) || [here, home];
  m.kind = 'return'; m.state = 'back'; m.path = path; m.k = 0; m.frac = 0; m.to = home; m.target = { type: 'city', id: g.id };
  m.speed = troopsTotal(m.troops) > 0 ? marchSpeed(w, g, m.troops, m.c1, m.c2, 'return') : 2.2;
  m.eta = w.t + Math.ceil(pathCost(w, path) / m.speed);
  if (extra.load) m.load = mergeRes(m.load, extra.load);
  if (extra.wounded) m.wounded = mergeTroops(m.wounded, extra.wounded);
  if (path.length <= 1) arrive(w, m);
}
function mergeRes(a, b) { const o = { ...(a || {}) }; for (const r in b || {}) o[r] = (o[r] || 0) + b[r]; return o; }
function mergeTroops(a, b) { const o = { inf: 0, cav: 0, arc: 0, sie: 0, ...(a || {}) }; for (const u in b || {}) o[u] = (o[u] || 0) + b[u]; return o; }
function arrive(w, m) {
  const g = w.govs[m.owner];
  switch (m.kind) {
    case 'return': {
      removeMarch(w, m);
      settle(w, g, w.t);
      for (const u of UNIT_KEYS) { g.away[u] -= m.troops[u] || 0; g.troops[u] += m.troops[u] || 0; }
      if (m.wounded) admitWounded(w, g, m.wounded);
      if (m.load) for (const r in m.load) g.res[r] += m.load[r];
      for (const u of UNIT_KEYS) if (g.away[u] < 0) g.away[u] = 0;
      return;
    }
    case 'scout': return arriveScout(w, m);
    case 'gather': return arriveGather(w, m);
    case 'reinforce': return arriveReinforce(w, m);
    case 'rallyjoin': return arriveRallyJoin(w, m);
    case 'rally': return arriveRally(w, m);
    case 'attack': return arriveAttack(w, m);
    default: sendHome(w, m);
  }
}
// wounded go to the hospital if there is room; the rest are lost
function admitWounded(w, g, wounded) {
  const m = cityMods(w, g);
  const cap = Math.round(hospitalCap(g.b.hospital || 0) * (1 + (m.hospital || 0)));
  let room = Math.max(0, cap - troopsTotal(g.wounded));
  let lost = 0;
  for (const u of UNIT_KEYS) {
    const n = wounded[u] || 0;
    const take = Math.min(room, n);
    g.wounded[u] += take; room -= take; lost += n - take;
  }
  g.stats.deaths += lost;
  return lost;
}

// ---------------------------------------------------------------- scouting
function arriveScout(w, m) {
  const g = w.govs[m.owner];
  const tg = m.target;
  const rng = makeRng(hash32(w.seed, 'scout', m.id));
  let rep = null;
  if (tg?.type === 'city') {
    const d = w.govs[tg.id];
    if (d && idx(d.x, d.y) === m.to) {
      settle(w, d, w.t);
      const acc = scoutAccuracy(w, g, d);
      const dm = cityMods(w, d);
      const falseChance = (d.tech.counter || 0) >= 3 ? (d.tech.counter || 0) * 0.04 + (dm.falseReports || 0) : (dm.falseReports || 0) * 0.5;
      const lie = rng() < falseChance;
      const lieK = lie ? (rng() < 0.5 ? 0.55 : 1.7) : 1;
      const est = {};
      for (const u of UNIT_KEYS) est[u] = noisy(rng, d.troops[u] * lieK, acc);
      const resEst = {};
      for (const r of RES) resEst[r] = noisy(rng, Math.max(0, d.res[r] - protectedAmount(d.b.warehouse || 0)), acc);
      const flagged = lie && (g.tech.scouting || 0) >= (d.tech.counter || 0) + 2;
      rep = {
        kind: 'scout', target: { type: 'city', id: d.id }, name: d.name, guild: d.guild, at: w.t, acc: Math.round(acc * 100), troops: est, res: resEst,
        wall: d.b.wall || 0, wallDur: Math.round(d.wallDur), hall: d.b.hall, tower: d.b.tower || 0, defender: d.defender, shield: d.shield > w.t, false: lie, flagged,
        away: Object.values(d.away).reduce((a, b) => a + b, 0) > 0,
      };
      // a guild leader's city holds the guild's papers: the player's scouts uncover its secret pacts
      if (g.human && d.guild >= 0 && w.guilds[d.guild].leader === d.id) {
        const found = [];
        for (const k in w.guilds[d.guild].treaties) {
          const tr = w.guilds[d.guild].treaties[k];
          const key = d.guild + ':' + k;
          if (tr.secret && !(w.secretsKnown || []).includes(key)) { (w.secretsKnown = w.secretsKnown || []).push(key, k + ':' + d.guild); found.push(w.guilds[k].name); }
        }
        if (found.length) rep.secrets = found;
      }
      // the target notices
      remember(w, d, { k: 'scouted', who: g.id });
      relAdjust(d, g.id, -4);
      if (d.human) note(w, 'scouted', `${g.name}${tagOf(w, g)} scouted your city.`, 2, { gov: g.id });
      else if (d.t.risk < 0.5) d.next = Math.min(d.next, w.t + 5);
    }
  } else if (tg?.type === 'mark') {
    const mk = w.marks[tg.id];
    const acc = scoutAccuracy(w, g, null);
    const gar = garrisonOf(w, mk);
    const est = {};
    for (const u of UNIT_KEYS) est[u] = noisy(rng, gar[u], acc);
    rep = { kind: 'scout', target: { type: 'mark', id: mk.id }, name: mk.name, guild: mk.owner, at: w.t, acc: Math.round(acc * 100), troops: est, wall: mk.level, wallDur: Math.round(mk.wallDur) };
  } else if (tg?.type === 'camp') {
    const c = w.camps.find(x => x.id === tg.id);
    if (c) rep = { kind: 'scout', target: { type: 'camp', id: c.id }, name: `Bandit camp (level ${c.lv})`, guild: -1, at: w.t, acc: 95, troops: { ...c.troops } };
  }
  if (rep) {
    addIntel(w, g, rep);
    if (g.human) report(w, { ...rep, title: `Scout report: ${rep.name}` });
    // explorers widen what they know about the map
    if (!g.human) g.explore = Math.min(110, Math.max(g.explore, Math.round(dist(g.x, g.y, tx(m.to), ty(m.to))) + 4));
  } else if (g.human && tg) report(w, { kind: 'scout', title: 'Scout found nothing', text: 'The target had moved before your scout arrived.' });
  else if (g.human) note(w, 'scout', 'Your scout explored the land and is heading home.', 1);
  sendHome(w, m);
}
function addIntel(w, g, rep) {
  const key = rep.target.type + ':' + rep.target.id;
  // the AI keeps only what it decides with; reports older than a day are forgotten
  if (!g.human) rep = { target: rep.target, at: rep.at, acc: rep.acc, troops: rep.troops, wall: rep.wall || 0, shield: !!rep.shield, flagged: !!rep.flagged, loot: rep.res ? Math.round(costValue(rep.res)) : 0 };
  g.intel = g.intel.filter(x => x.target.type + ':' + x.target.id !== key && w.t - x.at < DAY);
  g.intel.push(rep);
  if (g.intel.length > (g.human ? 40 : 6)) g.intel.shift();
}
function intelOn(w, g, type, id, maxAge) {
  let best = null;
  const look = list => { for (const r of list) if (r.target.type === type && r.target.id === id && w.t - r.at <= maxAge && (!best || r.at > best.at)) best = r; };
  look(g.intel);
  // guild mates share their reports
  if (g.guild >= 0) for (const mid of w.guilds[g.guild].members) if (mid !== g.id) look(w.govs[mid].intel);
  return best;
}

// ---------------------------------------------------------------- gathering
function nodeById(w, id) { return w.nodes.find(x => x.id === id) || null; }
function arriveGather(w, m) {
  const g = w.govs[m.owner];
  const nd = m.target ? nodeById(w, m.target.id) : null;
  if (!nd || nd.by || idx(nd.x, nd.y) !== m.to) { if (g.human) note(w, 'gather', 'Your gatherers found the field taken and are coming back.', 1); return sendHome(w, m); }
  nd.by = m.id;
  const cm = cityMods(w, g);
  let load = 0;
  for (const u of UNIT_KEYS) load += (m.troops[u] || 0) * UNITS[u].load;
  const lm = 1 + (cm.load || 0) + (m.c1 ? commanderMods(g, m.c1, { primary: true }).load || 0 : 0) + (CIV[g.civ].variant.mods.load || 0) * ((m.troops[CIV[g.civ].variant.unit] || 0) / Math.max(1, troopsTotal(m.troops)));
  load = Math.round(load * lm / RES_VALUE[nd.res]);
  const rate = (30 + load / 90) * (1 + (cm.gather || 0) + (m.c1 ? commanderMods(g, m.c1, { primary: true }).gather || 0 : 0)) / RES_VALUE[nd.res];
  const amount = Math.min(load, nd.amount);
  m.state = 'gathering';
  m.gatherStart = w.t;
  m.gatherAmount = amount;
  m.gatherRate = rate;
  m.gatherEnd = w.t + Math.max(5, Math.ceil(amount / rate));
}
function gatheredSoFar(w, m) { return Math.min(m.gatherAmount || 0, Math.floor((w.t - (m.gatherStart || w.t)) * (m.gatherRate || 0))); }
function finishGather(w, m) {
  const g = w.govs[m.owner];
  const nd = nodeById(w, m.target.id);
  const got = Math.min(m.gatherAmount, nd ? nd.amount : m.gatherAmount);
  if (nd) nd.amount -= got;
  g.stats.gathered += got;
  if (g.human) report(w, { kind: 'gather', title: `Gathered ${got.toLocaleString('en-US')} ${RES_NAME[nd ? nd.res : 'food']}`, res: { [nd ? nd.res : 'food']: got } });
  const res = nd ? nd.res : 'food';
  sendHome(w, m, { load: { [res]: got } });
  if (nd && nd.amount <= 0) depleteNode(w, nd);
}
function releaseNode(w, m) {
  if (!m.target || m.target.type !== 'node') return;
  const nd = nodeById(w, m.target.id);
  if (nd && nd.by === m.id) {
    if (m.state === 'gathering') {
      const got = gatheredSoFar(w, m);
      nd.amount -= got;
      m.load = mergeRes(m.load, { [nd.res]: got });
      w.govs[m.owner].stats.gathered += got;
    }
    nd.by = null;
    if (nd.amount <= 0) depleteNode(w, nd);
  }
  m.state = 'out';
}
function depleteNode(w, nd) {
  const i = w.nodes.indexOf(nd);
  if (i < 0) return;
  w.nodes.splice(i, 1);
  if (w.map.occ[idx(nd.x, nd.y)] === nd.occ) w.map.occ[idx(nd.x, nd.y)] = 0;
  const rng = makeRng(hash32(w.seed, 'node', nd.id, w.t));
  spawnNode(w, rng, nd.res, nd.res === 'wood' ? T.forest : nd.res === 'food' || nd.res === 'gold' ? T.plains : T.hills);
}

// ---------------------------------------------------------------- reinforcing and rallies
function arriveReinforce(w, m) {
  const mk = w.marks[m.target.id];
  const g = w.govs[m.owner];
  if (!mk || mk.owner !== g.guild || g.guild < 0) return sendHome(w, m);
  m.state = 'garrison';
  m.k = m.path.length - 1;
  if (g.human) note(w, 'reinforce', `Your troops are now garrisoned at ${mk.name}.`, 2);
}
function garrisonOf(w, mk) {
  if (mk.owner < 0 || mk.kind === 'ruin') return { ...mk.garrison };
  const out = { inf: 0, cav: 0, arc: 0, sie: 0 };
  for (const m of w.marches) if (m.state === 'garrison' && m.target?.type === 'mark' && m.target.id === mk.id) for (const u of UNIT_KEYS) out[u] += m.troops[u] || 0;
  return out;
}
function garrisonMarches(w, mk) { return w.marches.filter(m => m.state === 'garrison' && m.target?.type === 'mark' && m.target.id === mk.id); }

// rally: { id, leader, guild, target: {type, id}, to, launchAt, state, troops (leader's), c1, c2 }
function startRally(w, g, o) {
  if (g.guild < 0) return { ok: false, err: 'Join a guild to lead rallies.' };
  if (g.role !== 'leader' && g.role !== 'officer' && !(g.b.hall >= 12)) return { ok: false, err: 'Only guild leaders, officers and governors with a level 12 Town Hall can start rallies.' };
  if (w.rallies.some(r => r.leader === g.id && r.state === 'gathering')) return { ok: false, err: 'You are already leading a rally.' };
  const tgt = tileTarget(w, o.to);
  if (!tgt || (tgt.type !== 'mark' && tgt.type !== 'city')) return { ok: false, err: 'Rally on a pass, a holy site, the Capital or an enemy city.' };
  if (tgt.type === 'mark') {
    const mk = w.marks[tgt.id];
    if (mk.kind === 'ruin') return { ok: false, err: 'Ruins are explored, not rallied.' };
    if (mk.owner === g.guild) return { ok: false, err: 'Your guild already holds it.' };
    if (w.t < mk.opens) return { ok: false, err: opensText(mk) };
    if (mk.owner >= 0 && treaty(w, g.guild, mk.owner)?.k === 'alliance') return { ok: false, err: 'An ally holds it.' };
  } else {
    const d = w.govs[tgt.id];
    if (d.guild === g.guild) return { ok: false, err: 'That is a guild mate.' };
    if (d.shield > w.t) return { ok: false, err: 'That city is under a peace shield.' };
    if (d.guild >= 0 && treaty(w, g.guild, d.guild)?.k === 'alliance') return { ok: false, err: 'That city belongs to an ally.' };
  }
  const wait = clamp(Math.round(Number(o.wait) || 30), 10, 120);
  if (!findPath(w, idx(g.x, g.y), o.to, gateAccess(w, g.guild))) return { ok: false, err: noWayText(w, g, o.to) };
  // the leader's own troops wait at home as part of the rally
  const lead = buildRallyLead(w, g, o);
  if (!lead.ok) return lead;
  if (g.shield > w.t) g.shield = 0;
  const rally = { id: w.nid++, leader: g.id, guild: g.guild, target: tgt, to: o.to, launchAt: w.t + wait, state: 'gathering', lead: lead.march.id, created: w.t };
  lead.march.rally = rally.id;
  w.rallies.push(rally);
  g.stats.rallies++;
  const name = tgt.type === 'mark' ? w.marks[tgt.id].name : w.govs[tgt.id].name;
  decide(w, g, 'rally', `Called a rally on ${name}.`, 'guild');
  for (const mid of w.guilds[g.guild].members) { const mg = w.govs[mid]; if (!mg.human && mid !== g.id) mg.next = Math.min(mg.next, w.t + rint(w, 1, 8)); }
  if (w.govs[PLAYER].guild === g.guild && !g.human) note(w, 'rally', `${g.name} called a guild rally on ${name}. It leaves in ${wait} minutes.`, 3, { rally: rally.id });
  return { ok: true, rally };
}
function buildRallyLead(w, g, o) {
  const troops = {};
  let total = 0;
  for (const u of UNIT_KEYS) {
    const n = Math.floor(Number(o.troops?.[u]) || 0);
    if (n < 0 || n > g.troops[u]) return { ok: false, err: 'You do not have those troops at home.' };
    troops[u] = n; total += n;
  }
  if (total <= 0) return { ok: false, err: 'Put some of your own troops in the rally.' };
  if (total > marchCap(w, g)) return { ok: false, err: `You can lead at most ${marchCap(w, g).toLocaleString('en-US')} of your own troops.` };
  if (!o.c1 || !(typeof o.c1 === 'string' && Object.prototype.hasOwnProperty.call(g.cmds, o.c1))) return { ok: false, err: 'Choose a commander to lead the rally.' };
  const busy = busyCommanders(w, g);
  if (busy.has(o.c1)) return { ok: false, err: `${CMD[o.c1].name} is already leading an army.` };
  if (activeMarches(w, g) >= marchLimit(w, g)) return { ok: false, err: 'All march slots are in use.' };
  settle(w, g, w.t);
  for (const u of UNIT_KEYS) { g.troops[u] -= troops[u]; g.away[u] += troops[u]; }
  const home = idx(g.x, g.y);
  const m = { id: w.nid++, kind: 'rallyjoin', owner: g.id, troops, c1: o.c1, c2: o.c2 && o.c2 !== o.c1 && g.cmds[o.c2] && !busy.has(o.c2) ? o.c2 : null, path: [home], k: 0, frac: 0, speed: 1, from: home, to: home, target: { type: 'rallyhome', id: g.id }, state: 'waiting', dep: w.t, eta: w.t, load: null, rally: null, wounded: null, gatherEnd: 0, alerted: false, parts: null };
  w.marches.push(m);
  return { ok: true, march: m };
}
function rallyCapacity(w, lead) {
  const g = w.govs[lead.owner];
  let k = 2.5 * (1 + (CIV[g.civ].mods.rally || 0));
  if (lead.c1) k += commanderMods(g, lead.c1, { rally: true, primary: true }).rally || 0;
  return Math.round(marchCap(w, g) * k);
}
function joinRally(w, g, o) {
  const r = w.rallies.find(x => x.id === o.rally);
  if (!r || r.state !== 'gathering') return { ok: false, err: 'That rally is not gathering any more.' };
  if (g.guild !== r.guild) return { ok: false, err: 'That rally belongs to another guild.' };
  if (r.leader === g.id) return { ok: false, err: 'You lead this rally.' };
  if (w.marches.some(m => m.owner === g.id && m.rally === r.id)) return { ok: false, err: 'You already sent troops to this rally.' };
  const leader = w.govs[r.leader];
  const lead = w.marches.find(m => m.id === r.lead);
  const have = rallyTroops(w, r);
  const sending = UNIT_KEYS.reduce((a, u) => a + Math.max(0, Math.floor(Number(o.troops?.[u]) || 0)), 0);
  if (lead && have + sending > rallyCapacity(w, lead)) return { ok: false, err: `The rally can take ${Math.max(0, rallyCapacity(w, lead) - have).toLocaleString('en-US')} more troops.` };
  const res = startMarch(w, g, { kind: 'rallyjoin', to: idx(leader.x, leader.y), troops: o.troops, c1: o.c1, c2: o.c2, target: { type: 'rallyhome', id: leader.id }, rally: r.id });
  if (res.ok) g.stats.rallies++;
  return res;
}
function rallyTroops(w, r) { let n = 0; for (const m of w.marches) if (m.rally === r.id && (m.state === 'waiting' || m.kind === 'rallyjoin')) n += troopsTotal(m.troops); return n; }
function arriveRallyJoin(w, m) {
  const r = w.rallies.find(x => x.id === m.rally);
  if (!r || r.state !== 'gathering') return sendHome(w, m);
  m.state = 'waiting';
}
function processRallies(w) {
  for (const r of w.rallies.slice()) {
    if (r.state !== 'gathering' || w.t < r.launchAt) continue;
    const parts = w.marches.filter(m => m.rally === r.id && m.state === 'waiting');
    const lead = parts.find(m => m.id === r.lead);
    const leader = w.govs[r.leader];
    if (!lead || leader.guild !== r.guild) { for (const p of parts) sendHome(w, p); r.state = 'done'; continue; }
    // still a legal target?
    const tgt = tileTarget(w, r.to);
    const okTarget = tgt && tgt.type === r.target.type && tgt.id === r.target.id && !(tgt.type === 'mark' && w.marks[tgt.id].owner === r.guild) && !(tgt.type === 'city' && w.govs[tgt.id].shield > w.t);
    if (!okTarget) { for (const p of parts) sendHome(w, p); r.state = 'done'; if (leader.human || w.govs[PLAYER].guild === r.guild) note(w, 'rally', 'A rally was called off: its target changed.', 2); continue; }
    const home = idx(leader.x, leader.y);
    const path = findPath(w, home, r.to, gateAccess(w, r.guild));
    if (!path) { for (const p of parts) sendHome(w, p); r.state = 'done'; continue; }
    const troops = { inf: 0, cav: 0, arc: 0, sie: 0 };
    const pp = [];
    let slowest = Infinity;
    for (const p of parts) {
      for (const u of UNIT_KEYS) troops[u] += p.troops[u] || 0;
      pp.push({ gov: p.owner, troops: { ...p.troops }, c1: p.c1, c2: p.c2 });
      slowest = Math.min(slowest, marchSpeed(w, w.govs[p.owner], p.troops, p.c1, p.c2, 'rally'));
      removeMarch(w, p);
    }
    const m = {
      id: w.nid++, kind: 'rally', owner: leader.id, troops, c1: lead.c1, c2: lead.c2, path, k: 0, frac: 0, speed: slowest, from: home, to: r.to, target: r.target, state: 'out', dep: w.t,
      eta: w.t + Math.ceil(pathCost(w, path) / slowest), load: null, rally: r.id, wounded: null, gatherEnd: 0, alerted: false, parts: pp,
    };
    w.marches.push(m);
    r.state = 'marching';
    r.march = m.id;
    if (r.target.type === 'city') m.kind = 'rally';
  }
  if (w.rallies.length > 40) w.rallies = w.rallies.filter(r => r.state !== 'done' || w.t - r.created < DAY);
}
function arriveRally(w, m) {
  const r = w.rallies.find(x => x.id === m.rally);
  if (r) r.state = 'done';
  if (m.target.type === 'mark') return battleLandmark(w, m);
  return battleCity(w, m);
}
// split a merged army's survivors and wounded back to each contributor (proportionally to what they sent)
function splitParts(parts, endTroops, wounded) {
  const out = parts.map(p => ({ ...p, end: { inf: 0, cav: 0, arc: 0, sie: 0 }, wounded: { inf: 0, cav: 0, arc: 0, sie: 0 } }));
  for (const u of UNIT_KEYS) {
    const sent = parts.reduce((a, p) => a + (p.troops[u] || 0), 0);
    if (sent <= 0) continue;
    let leftE = endTroops[u] || 0, leftW = (wounded && wounded[u]) || 0;
    out.forEach((p, i) => {
      const share = (p.troops[u] || 0) / sent;
      const e = i === out.length - 1 ? leftE : Math.floor((endTroops[u] || 0) * share);
      const wd = i === out.length - 1 ? leftW : Math.floor(((wounded && wounded[u]) || 0) * share);
      p.end[u] = Math.max(0, e); p.wounded[u] = Math.max(0, wd);
      leftE -= e; leftW -= wd;
    });
  }
  return out;
}
// a part returns home as its own march from the battle tile
function partHome(w, from, p, extra = {}) {
  const g = w.govs[p.gov];
  const m = { id: w.nid++, kind: 'return', owner: p.gov, troops: { ...p.end }, c1: p.c1, c2: p.c2, path: [from], k: 0, frac: 0, speed: 1, from, to: from, target: null, state: 'back', dep: w.t, eta: w.t, load: extra.load || null, rally: null, wounded: troopsTotal(p.wounded) ? { ...p.wounded } : null, gatherEnd: 0, alerted: false, parts: null };
  // the troops that died are no longer away
  for (const u of UNIT_KEYS) g.away[u] -= (p.troops[u] || 0) - (p.end[u] || 0);
  w.marches.push(m);
  m.kind = 'returnstart';
  sendHome(w, m);
  return m;
}

// ================================================================ battles
function tagOf(w, g) { return g && g.guild >= 0 ? ` [${w.guilds[g.guild].tag}]` : ''; }
function battleSeed(w) { return hash32(w.seed, 'battle', ++w.battleN); }
function woundedSplit(lost, frac) { const wd = {}, dead = {}; for (const u of UNIT_KEYS) { wd[u] = Math.floor((lost[u] || 0) * frac); dead[u] = (lost[u] || 0) - wd[u]; } return { wd, dead }; }
function inOwnTerritory(w, g, i) { return g.guild >= 0 && w.map.terr[i] === g.guild + 1; }
function attackerSide(w, m, ctx) {
  const g = w.govs[m.owner];
  const side = armySide(w, g, m.troops, m.c1, m.c2, ctx, g.name + tagOf(w, g));
  return side;
}
function battleCity(w, m) {
  const g = w.govs[m.owner];
  const d = w.govs[m.target.id];
  const isRally = m.kind === 'rally';
  if (!d || idx(d.x, d.y) !== m.to || d.shield > w.t || (g.guild >= 0 && d.guild === g.guild)) {
    if (g.human) note(w, 'attack', 'The attack was called off: the target moved, joined your guild or raised a shield.', 2);
    if (isRally) { for (const p of splitParts(m.parts, m.troops, null)) partHome(w, m.to, p); removeMarch(w, m); return; }
    return sendHome(w, m);
  }
  settle(w, d, w.t);
  const terrain = w.map.ter[m.to];
  const aSide = attackerSide(w, m, { attack: true, city: true, rally: isRally, terrain });
  const busy = busyCommanders(w, d);
  const defCmd = d.defender && d.cmds[d.defender] && !busy.has(d.defender) ? d.defender : Object.keys(d.cmds).find(c => !busy.has(c)) || null;
  const dSide = armySide(w, d, d.troops, defCmd, null, { defend: true, city: true, terrain, territory: inOwnTerritory(w, d, m.to) }, d.name + tagOf(w, d));
  const dm = cityMods(w, d);
  const wall = { level: d.b.wall || 0, dur: Math.round(d.wallDur), max: wallMax(d, dm) };
  const input = { seed: battleSeed(w), a: aSide, d: dSide, terrain, wall, kind: 'city' };
  const res = fight(input);
  w.stats.battles++;
  // casualties: defenders in their own city are mostly wounded; attackers half
  const aw = woundedSplit(res.a.lost, 0.5 + aSide.wounded);
  const dw = woundedSplit(res.d.lost, 0.7 + dSide.wounded);
  for (const u of UNIT_KEYS) d.troops[u] = res.d.end[u];
  const dLostHosp = admitWounded(w, d, dw.wd);
  d.wallDur = Math.max(0, res.wallLeft);
  let plunder = null, sacked = false;
  if (res.winner === 'a') {
    // plunder what is not protected, up to what the survivors can carry
    let carry = 0;
    for (const u of UNIT_KEYS) carry += (res.a.end[u] || 0) * UNITS[u].load;
    carry *= 1 + (cityMods(w, g).load || 0);
    const prot = protectedAmount(d.b.warehouse || 0);
    const avail = {};
    let total = 0;
    for (const r of RES) { avail[r] = Math.max(0, d.res[r] - prot) * (0.35 + aSide.plunder); total += avail[r] * RES_VALUE[r]; }
    const k = total > carry ? carry / total : 1;
    plunder = {};
    for (const r of RES) { const v = Math.floor(avail[r] * k); plunder[r] = v; d.res[r] -= v; }
    if (d.wallDur <= 0) { sacked = true; sackCity(w, d, g); }
  }
  // stats and memories
  const killsA = troopsTotal(res.d.lost), killsD = troopsTotal(res.a.lost);
  g.stats.kills += killsA; d.stats.kills += killsD; d.stats.deaths += troopsTotal(dw.dead);
  if (res.winner === 'a') { g.stats.wins++; d.stats.defLosses++; } else { g.stats.losses++; d.stats.defWins++; checkRecruits(w, d); }
  if (m.c1) giveXp(w, g, m.c1, killsA * 0.6 + 40);
  if (defCmd) giveXp(w, d, defCmd, killsD * 0.6 + 40);
  remember(w, d, { k: 'attacked', who: g.id, win: res.winner === 'd', lost: troopsTotal(res.d.lost), sacked });
  remember(w, g, { k: 'attacked_out', who: d.id, win: res.winner === 'a', lost: troopsTotal(res.a.lost) });
  relAdjust(d, g.id, sacked ? -60 : -30);
  relAdjust(g, d.id, -8);
  d.lastAttack = { by: g.id, t: w.t, win: res.winner === 'd' };
  if (!d.human) d.next = Math.min(d.next, w.t + 2);
  guildIncident(w, g, d, troopsTotal(res.a.lost) + troopsTotal(res.d.lost), sacked);
  const rec = recordBattle(w, m, g, d, input, res, { plunder, sacked, kind: isRally ? 'rally on city' : 'city', aw, dw });
  if (sacked) chronicle(w, 'sacked', `${g.name}${tagOf(w, g)} broke the walls of ${d.name}${tagOf(w, d)} and sacked the city.`, { g: [g.guild, d.guild].filter(x => x >= 0), p: [g.id, d.id], x: d.x, y: d.y, imp: 2 });
  else if (troopsTotal(res.a.start) + troopsTotal(res.d.start) > 60000) chronicle(w, 'battle', `A great battle at ${d.name}'s walls: ${g.name}${tagOf(w, g)} ${res.winner === 'a' ? 'won' : 'was thrown back'}, ${(killsA + killsD).toLocaleString('en-US')} troops fell.`, { g: [g.guild, d.guild].filter(x => x >= 0), p: [g.id, d.id], x: d.x, y: d.y, imp: 2 });
  void dLostHosp; void rec;
  // survivors go home
  if (isRally) {
    const split = splitParts(m.parts, res.a.end, aw.wd);
    const totalEnd = troopsTotal(res.a.end) || 1;
    split.forEach(p => {
      const share = troopsTotal(p.end) / totalEnd;
      const load = plunder ? Object.fromEntries(RES.map(r => [r, Math.floor(plunder[r] * share)])) : null;
      partHome(w, m.to, p, { load });
    });
    removeMarch(w, m);
  } else {
    for (const u of UNIT_KEYS) g.away[u] -= (m.troops[u] || 0) - (res.a.end[u] || 0);
    m.troops = { ...res.a.end };
    sendHome(w, m, { load: plunder, wounded: aw.wd });
  }
}
// a sacked city loses a building level and moves to a safe spot with an 8-hour shield
function sackCity(w, d, by) {
  d.stats.sacked++;
  by.stats.sackedOthers++;
  const opts = BUILDING_KEYS.filter(b => b !== 'hall' && (d.b[b] || 0) > 1);
  if (opts.length) { const b = opts[hash32(w.seed, d.id, w.t) % opts.length]; d.b[b] -= 1; }
  const rng = makeRng(hash32(w.seed, 'relocate', d.id, w.t));
  const gd = d.guild >= 0 ? w.guilds[d.guild] : null;
  const p = freeTileNear(w, gd ? gd.home.x : d.x, gd ? gd.home.y : d.y, 30, rng, { spread: true, awayFromMarks: 3, region: gd ? gd.home.region : regionAt(w, d.x, d.y) }) || freeTileNear(w, d.x, d.y, 60, rng, { region: regionAt(w, d.x, d.y) });
  if (p) relocate(w, d, p[0], p[1]);
  d.shield = w.t + SHIELD.minutes;
  d.wallDur = wallMax(d, cityMods(w, d)) * 0.5;
  if (d.human) note(w, 'sacked', `Your city was sacked by ${by.name}. It has moved to a safer place behind an 8-hour shield.`, 3);
}
function relocate(w, g, x, y) {
  const ox = g.x, oy = g.y;
  if (w.map.occ[idx(ox, oy)] === OCC_CITY + g.id) w.map.occ[idx(ox, oy)] = 0;
  g.x = x; g.y = y;
  modsChanged(g);
  w.map.occ[idx(x, y)] = OCC_CITY + g.id;
  bucketMove(w, g, ox, oy);
  // armies on their way home re-route to the new city
  for (const m of w.marches) if (m.owner === g.id && m.kind === 'return') sendHome(w, m);
}
function recordBattle(w, m, g, d, input, res, extra) {
  const summary = {
    id: w.nid++, t: w.t, kind: extra.kind, x: tx(m.to), y: ty(m.to), a: g.id, d: d ? d.id : -1, dName: d ? d.name : extra.dName,
    aGuild: g.guild, dGuild: d ? d.guild : extra.dGuild ?? -1, win: res.winner, aLost: troopsTotal(res.a.lost), dLost: troopsTotal(res.d.lost),
    aStart: troopsTotal(res.a.start), dStart: troopsTotal(res.d.start), sacked: !!extra.sacked, seen: false,
  };
  summary.seen = !!(w._vis && w._vis[m.to] >= 2);
  w.battles.push(summary);
  if (w.battles.length > 200) w.battles.shift();
  // a full report with the replay input for every governor involved who is the player
  const parts = m.parts ? m.parts.map(p => p.gov) : [g.id];
  const involved = parts.includes(PLAYER) || (d && d.id === PLAYER) || (extra.garrisonGovs || []).includes(PLAYER);
  if (involved) {
    const view = (d && d.id === PLAYER) || (extra.garrisonGovs || []).includes(PLAYER) ? 'd' : 'a';
    const won = res.winner === view;
    const title = view === 'a' ? `${won ? 'Victory' : 'Defeat'}: attack on ${summary.dName}` : `${won ? 'Defended' : 'Defeat'}: ${g.name}${tagOf(w, g)} attacked ${d && d.id === PLAYER ? 'your city' : summary.dName}`;
    report(w, { kind: 'battle', title, view, won, input, res, extra: { plunder: extra.plunder || null, sacked: !!extra.sacked, captured: !!extra.captured, aWounded: extra.aw?.wd, dWounded: extra.dw?.wd }, explain: explainBattle(input, res, view), x: summary.x, y: summary.y });
  }
  return summary;
}
function report(w, r) {
  r.id = w.nid++;
  r.t = w.t;
  r.read = false;
  w.reports.push(r);
  if (w.reports.length > 60) w.reports.shift();
  if (r.kind === 'battle') note(w, 'battle', r.title, 3, { report: r.id });
  else if (r.kind === 'scout') note(w, 'scout', r.title, 2, { report: r.id });
  return r;
}
// attacks between guild members sour relations between the guilds
function guildIncident(w, g, d, casualties, sacked) {
  if (g.guild < 0 || d.guild < 0 || g.guild === d.guild) return;
  const a = w.guilds[g.guild], b = w.guilds[d.guild];
  const hit = (sacked ? 8 : 3) * Math.min(2, 0.5 + casualties / 20000);
  b.rel[a.id] = clamp(b.rel[a.id] - hit, -100, 100);
  a.rel[b.id] = clamp(a.rel[b.id] - hit * 0.4, -100, 100);
  const tr = treaty(w, a.id, b.id);
  if (tr && (tr.k === 'nap' || tr.k === 'alliance')) {
    // an attack under a treaty is a betrayal unless it was a lone governor; the victim's guild decides
    b.rel[a.id] = clamp(b.rel[a.id] - 15, -100, 100);
    a.cred = clamp(a.cred - 4, 0, 100);
  }
  if (tr && tr.k === 'war') {
    a.warScore[b.id] = (a.warScore[b.id] || 0) + (sacked ? 6 : 1) * (casualties / 5000);
    b.warScore[a.id] = (b.warScore[a.id] || 0) - (sacked ? 6 : 1) * (casualties / 5000) * 0.5;
  }
  a.stats.kills += casualties; b.stats.losses += casualties;
}

// ---------------------------------------------------------------- attacks on camps, gatherers and ruins
function arriveAttack(w, m) {
  const tg = m.target;
  if (!tg) return sendHome(w, m);
  if (tg.type === 'city') return battleCity(w, m);
  if (tg.type === 'camp') return battleCamp(w, m);
  if (tg.type === 'node') return battleGatherer(w, m);
  if (tg.type === 'mark') { const mk = w.marks[tg.id]; return mk.kind === 'ruin' ? battleRuin(w, m) : battleLandmark(w, m); }
  sendHome(w, m);
}
function battleCamp(w, m) {
  const g = w.govs[m.owner];
  const c = w.camps.find(x => x.id === m.target.id);
  if (!c || idx(c.x, c.y) !== m.to) { if (g.human) note(w, 'camp', 'The camp was gone when your army arrived.', 1); return sendHome(w, m); }
  const terrain = w.map.ter[m.to];
  const input = { seed: battleSeed(w), a: attackerSide(w, m, { attack: true, field: true, terrain }), d: neutralSide(`Bandit camp (level ${c.lv})`, c.troops, c.lv), terrain, wall: null, kind: 'camp' };
  const res = fight(input);
  w.stats.battles++;
  const aw = woundedSplit(res.a.lost, 0.75);
  let loot = null;
  if (res.winner === 'a') {
    g.stats.camps++;
    g.stats.wins++;
    const v = Math.round(500 * c.lv * Math.pow(1.35, c.lv - 1));
    loot = { food: v, wood: v, stone: Math.round(v * 0.5), iron: Math.round(v * 0.25), gold: Math.round(v * 0.08) };
    w.camps.splice(w.camps.indexOf(c), 1);
    if (w.map.occ[m.to] === c.occ) w.map.occ[m.to] = 0;
    w.campRespawn.push(w.t + 3 * HOUR);
    checkRecruits(w, g);
  } else {
    g.stats.losses++;
    for (const u of UNIT_KEYS) c.troops[u] = res.d.end[u];
  }
  if (m.c1) giveXp(w, g, m.c1, troopsTotal(res.d.lost) * 0.8 + c.lv * 60);
  if (m.c2) giveXp(w, g, m.c2, troopsTotal(res.d.lost) * 0.3);
  g.stats.kills += troopsTotal(res.d.lost);
  if (g.human) report(w, { kind: 'battle', title: `${res.winner === 'a' ? 'Victory' : 'Defeat'}: bandit camp level ${c.lv}`, view: 'a', won: res.winner === 'a', input, res, extra: { plunder: loot, aWounded: aw.wd }, explain: explainBattle(input, res, 'a'), x: c.x, y: c.y });
  for (const u of UNIT_KEYS) g.away[u] -= (m.troops[u] || 0) - (res.a.end[u] || 0);
  m.troops = { ...res.a.end };
  sendHome(w, m, { load: loot, wounded: aw.wd });
}
function battleGatherer(w, m) {
  const g = w.govs[m.owner];
  const nd = nodeById(w, m.target.id);
  const victim = nd && nd.by ? w.marches.find(x => x.id === nd.by) : null;
  if (!victim) { if (g.human) note(w, 'attack', 'The gatherers had already left.', 1); return sendHome(w, m); }
  const d = w.govs[victim.owner];
  const terrain = w.map.ter[m.to];
  // an army surprised in the forest by an enemy it never saw coming fights at a disadvantage
  const ambush = terrain === T.forest && !(d.intel.some(r => r.target.type === 'city' && r.target.id === g.id && w.t - r.at < 6 * HOUR));
  const aSide = attackerSide(w, m, { attack: true, field: true, terrain, forest: terrain === T.forest });
  const dSide = armySide(w, d, victim.troops, victim.c1, victim.c2, { defend: true, field: true, terrain, territory: inOwnTerritory(w, d, m.to) }, d.name + tagOf(w, d));
  if (ambush) for (const u of UNIT_KEYS) dSide.mul.def[u] *= 0.85;
  const input = { seed: battleSeed(w), a: aSide, d: dSide, terrain, wall: null, kind: 'field', ambush };
  const res = fight(input);
  w.stats.battles++;
  const aw = woundedSplit(res.a.lost, 0.5 + aSide.wounded), dw = woundedSplit(res.d.lost, 0.5 + dSide.wounded);
  const gathered = gatheredSoFar(w, victim);
  let loot = null;
  // the gatherers' haul so far
  releaseNode(w, victim);
  if (res.winner === 'a' && victim.load) { loot = {}; for (const r in victim.load) { loot[r] = Math.floor(victim.load[r] * 0.6); victim.load[r] -= loot[r]; } }
  for (const u of UNIT_KEYS) d.away[u] -= (victim.troops[u] || 0) - (res.d.end[u] || 0);
  victim.troops = { ...res.d.end };
  sendHome(w, victim, { wounded: dw.wd });
  g.stats.kills += troopsTotal(res.d.lost); d.stats.kills += troopsTotal(res.a.lost);
  if (res.winner === 'a') g.stats.wins++; else g.stats.losses++;
  remember(w, d, { k: 'ambushed', who: g.id, win: res.winner === 'd' });
  relAdjust(d, g.id, -25);
  guildIncident(w, g, d, troopsTotal(res.a.lost) + troopsTotal(res.d.lost), false);
  if (m.c1) giveXp(w, g, m.c1, troopsTotal(res.d.lost) * 0.6);
  recordBattle(w, m, g, d, input, res, { plunder: loot, kind: ambush ? 'ambush' : 'field', aw, dw });
  void gathered;
  for (const u of UNIT_KEYS) g.away[u] -= (m.troops[u] || 0) - (res.a.end[u] || 0);
  m.troops = { ...res.a.end };
  sendHome(w, m, { load: loot, wounded: aw.wd });
}
function battleRuin(w, m) {
  const g = w.govs[m.owner];
  const mk = w.marks[m.target.id];
  mk.cleared = mk.cleared || [];
  const terrain = w.map.ter[m.to];
  const input = { seed: battleSeed(w), a: attackerSide(w, m, { attack: true, field: true, terrain }), d: neutralSide(`Guardians of ${mk.name}`, mk.garrison, mk.level), terrain, wall: null, kind: 'ruin' };
  const res = fight(input);
  w.stats.battles++;
  const aw = woundedSplit(res.a.lost, 0.75);
  let loot = null;
  if (res.winner === 'a') {
    mk.cleared.push(g.id);
    g.stats.wins++;
    const v = 6000 * mk.level;
    loot = { gold: Math.round(v * 0.4), iron: Math.round(v * 0.5), stone: v };
    if (m.c1) giveXp(w, g, m.c1, 2500 + mk.level * 300);
    chronicle(w, 'ruin', `${g.name}${tagOf(w, g)} explored ${mk.name} and returned with its treasures.`, { p: [g.id], g: g.guild >= 0 ? [g.guild] : [], x: mk.x, y: mk.y, imp: 1 });
  } else g.stats.losses++;
  if (g.human) report(w, { kind: 'battle', title: `${res.winner === 'a' ? 'Explored' : 'Driven back from'} ${mk.name}`, view: 'a', won: res.winner === 'a', input, res, extra: { plunder: loot, aWounded: aw.wd }, explain: explainBattle(input, res, 'a'), x: mk.x, y: mk.y });
  for (const u of UNIT_KEYS) g.away[u] -= (m.troops[u] || 0) - (res.a.end[u] || 0);
  m.troops = { ...res.a.end };
  sendHome(w, m, { load: loot, wounded: aw.wd });
}
// passes, holy sites and the Capital: a rally against the neutral garrison or the holding guild's garrison
function battleLandmark(w, m) {
  const g = w.govs[m.owner];
  const mk = w.marks[m.target.id];
  const parts = m.parts || [{ gov: g.id, troops: { ...m.troops }, c1: m.c1, c2: m.c2 }];
  const terrain = w.map.ter[m.to];
  if (g.guild < 0 || mk.owner === g.guild || w.t < mk.opens) {
    for (const p of splitParts(parts, m.troops, null)) partHome(w, m.to, p);
    removeMarch(w, m);
    return;
  }
  const aSide = attackerSide(w, m, { attack: true, city: true, rally: true, terrain });
  let dSide, garMarches = [];
  if (mk.owner < 0) dSide = neutralSide(mk.kind === 'capital' ? 'The Ember Guard' : `Garrison of ${mk.name}`, mk.garrison, mk.level);
  else {
    garMarches = garrisonMarches(w, mk);
    if (!garMarches.length) dSide = neutralSide(`Empty halls of ${mk.name}`, { inf: 0, cav: 0, arc: 0, sie: 0 }, 0);
    else {
      const best = garMarches.slice().sort((a, b) => (w.govs[b.owner].cmds[b.c1]?.lv || 0) - (w.govs[a.owner].cmds[a.c1]?.lv || 0))[0];
      const bg = w.govs[best.owner];
      dSide = armySide(w, bg, garrisonOf(w, mk), best.c1, best.c2, { defend: true, city: true, rally: true, reinforce: true, terrain, territory: true }, `${w.guilds[mk.owner].name} garrison`);
    }
  }
  const wall = { level: mk.level, dur: Math.round(mk.wallDur), max: mk.wallMax };
  const input = { seed: battleSeed(w), a: aSide, d: dSide, terrain, wall, kind: mk.kind };
  let res;
  if (troopsTotal(dSide.units) <= 0) res = { winner: 'a', reason: 'empty', rounds: [], casts: [], a: { start: { ...aSide.units }, end: { ...aSide.units }, lost: { inf: 0, cav: 0, arc: 0, sie: 0 }, chased: 0 }, d: { start: { ...dSide.units }, end: { ...dSide.units }, lost: { inf: 0, cav: 0, arc: 0, sie: 0 }, chased: 0 }, wallDamage: 0, wallLeft: wall.dur };
  else res = fight(input);
  w.stats.battles++;
  mk.lastHit = w.t;
  mk.wallDur = Math.max(0, res.wallLeft >= 0 ? res.wallLeft : mk.wallDur);
  const aw = woundedSplit(res.a.lost, 0.5);
  const prevOwner = mk.owner;
  const garGovs = garMarches.map(x => x.owner);
  // the defenders
  if (mk.owner < 0) { for (const u of UNIT_KEYS) mk.garrison[u] = res.d.end[u]; }
  else if (garMarches.length) {
    const dParts = garMarches.map(x => ({ gov: x.owner, troops: { ...x.troops }, c1: x.c1, c2: x.c2, mid: x.id }));
    const dw = woundedSplit(res.d.lost, 0.6);
    const split = splitParts(dParts, res.d.end, dw.wd);
    split.forEach((p, k) => {
      const gm = garMarches[k];
      const og = w.govs[p.gov];
      for (const u of UNIT_KEYS) og.away[u] -= (gm.troops[u] || 0) - (p.end[u] || 0);
      gm.troops = { ...p.end };
      og.stats.kills += Math.round(troopsTotal(res.a.lost) / split.length);
      if (res.winner === 'a' || troopsTotal(gm.troops) <= 0) { if (troopsTotal(p.wounded)) gm.wounded = mergeTroops(gm.wounded, p.wounded); gm.state = 'out'; sendHome(w, gm); }
      else if (troopsTotal(p.wounded)) admitWounded(w, og, p.wounded);
    });
  }
  const winA = res.winner === 'a';
  for (const p of parts) { const pg = w.govs[p.gov]; pg.stats.kills += Math.round(troopsTotal(res.d.lost) / parts.length); if (winA) pg.stats.wins++; else pg.stats.losses++; }
  if (m.c1) giveXp(w, g, m.c1, troopsTotal(res.d.lost) * 0.5 + 200);
  let captured = false;
  if (winA) {
    captured = true;
    mk.owner = g.guild;
    mk.since = w.t;
    mk.wallDur = mk.wallMax * 0.35;
    const gd = w.guilds[g.guild];
    gd.stats.forts++;
    if (prevOwner >= 0) {
      const pg = w.guilds[prevOwner];
      pg.rel[gd.id] = clamp(pg.rel[gd.id] - 25, -100, 100);
      const tr = treaty(w, gd.id, prevOwner);
      if (tr && tr.k === 'war') gd.warScore[prevOwner] = (gd.warScore[prevOwner] || 0) + 12;
    }
    if (mk.kind === 'capital') { w.throne = { owner: g.guild, since: w.t }; }
    chronicle(w, mk.kind === 'capital' ? 'capital' : mk.kind, mk.kind === 'capital'
      ? `${gd.name} [${gd.tag}] stormed the Ember Throne${prevOwner >= 0 ? ` from ${w.guilds[prevOwner].name}` : ''}. If they hold it for ${THRONE_HOLD / DAY} days, the Age is theirs.`
      : mk.kind === 'pass' ? `${gd.name} [${gd.tag}] took ${mk.name}${prevOwner >= 0 ? ` from ${w.guilds[prevOwner].name}` : ''}, opening the road from ${REGIONS[mk.links[0]].name} to ${REGIONS[mk.links[1]].name} to its members. Led by ${g.name}.`
      : `${gd.name} [${gd.tag}] captured ${mk.name}${prevOwner >= 0 ? ` from ${w.guilds[prevOwner].name}` : ''} and its ${BLESSINGS[mk.blessing].name}, led by ${g.name}.`, { g: [gd.id, prevOwner].filter(x => x >= 0), p: [g.id], x: mk.x, y: mk.y, imp: mk.kind === 'capital' ? 3 : 2 });
    recomputeTerritory(w);
  }
  recordBattle(w, m, g, null, input, res, { kind: 'rally on ' + mk.kind, dName: mk.name, dGuild: prevOwner, captured, aw, garrisonGovs: garGovs });
  // survivors: on a capture half of each part stays as the new garrison, the rest go home
  const split = splitParts(parts, res.a.end, aw.wd);
  for (const p of split) {
    if (captured && troopsTotal(p.end) > 0) {
      const stay = {}, go = {};
      for (const u of UNIT_KEYS) { stay[u] = Math.floor(p.end[u] * 0.5); go[u] = p.end[u] - stay[u]; }
      const pg = w.govs[p.gov];
      if (troopsTotal(stay) > 0 && pg.guild === g.guild) {
        const gm = { id: w.nid++, kind: 'reinforce', owner: p.gov, troops: stay, c1: p.c1, c2: p.c2, path: [m.to], k: 0, frac: 0, speed: 1, from: m.to, to: m.to, target: { type: 'mark', id: mk.id }, state: 'garrison', dep: w.t, eta: w.t, load: null, rally: null, wounded: null, gatherEnd: 0, alerted: true, parts: null };
        w.marches.push(gm);
        partHome(w, m.to, { ...p, end: go, troops: { ...p.troops }, keep: stay, c1: null, c2: null });
        // partHome counted the staying troops as dead; they are still away, in the garrison
        for (const u of UNIT_KEYS) pg.away[u] += stay[u];
        continue;
      }
    }
    partHome(w, m.to, p);
  }
  removeMarch(w, m);
}

// ================================================================ landmarks, camps and territory upkeep
function regrowLandmarks(w) {
  for (const mk of w.marks) {
    if (mk.wallDur < mk.wallMax) mk.wallDur = Math.min(mk.wallMax, mk.wallDur + mk.wallMax * 0.04);
    // an unclaimed garrison recovers half a day after the last attack
    if (mk.owner < 0 && w.t - mk.lastHit > 12 * HOUR) mk.garrison = { ...mk.base };
    // a guild landmark left without a garrison for a day falls back to neutral
    if (mk.owner >= 0 && mk.kind !== 'ruin' && troopsTotal(garrisonOf(w, mk)) <= 0 && w.t - mk.since > DAY && w.t - mk.lastHit > 2 * HOUR) {
      const gd = w.guilds[mk.owner];
      chronicle(w, 'abandoned', `${gd.name} [${gd.tag}] left ${mk.name} unguarded and lost it.`, { g: [gd.id], x: mk.x, y: mk.y, imp: 1 });
      mk.owner = -1; mk.garrison = { ...mk.base }; mk.lastHit = w.t;
      if (mk.kind === 'capital') w.throne = { owner: -1, since: 0 };
      recomputeTerritory(w);
    }
  }
}
function respawnCamps(w) {
  const rng = makeRng(hash32(w.seed, 'campspawn', w.t));
  w.campRespawn = w.campRespawn.filter(t => { if (t <= w.t) { spawnCamp(w, rng); return false; } return true; });
}
const INF_WEIGHT = { city: 1, site: 4, pass: 2.5, capital: 6 };
const INF_RADIUS = { city: 5, site: 12, pass: 7, capital: 16 };
function recomputeTerritory(w) {
  const inf = w._inf || (w._inf = new Float32Array(GUILD_COUNT * N2));
  inf.fill(0);
  const stamp = (gi, x, y, r, v) => {
    const base = gi * N2;
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= N) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= N) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        inf[base + yy * N + xx] += v * (1 - d2 / (r2 + 1) * 0.5);
      }
    }
  };
  for (const g of w.govs) if (g.guild >= 0) stamp(g.guild, g.x, g.y, INF_RADIUS.city, INF_WEIGHT.city * (1 + g.b.hall / 25));
  for (const mk of w.marks) if (mk.owner >= 0 && mk.kind !== 'ruin') stamp(mk.owner, mk.x, mk.y, INF_RADIUS[mk.kind], INF_WEIGHT[mk.kind]);
  const terr = w.map.terr;
  for (let i = 0; i < N2; i++) {
    let best = 0, bv = 0.9, second = 0;
    for (let gi = 0; gi < GUILD_COUNT; gi++) {
      const v = inf[gi * N2 + i];
      if (v > bv) { second = bv; bv = v; best = gi + 1; } else if (v > second) second = v;
    }
    terr[i] = best && bv > second * 1.15 && !w.map.wall[i] && TERRAIN[w.map.ter[i]].cost !== Infinity ? best : 0;
  }
  w._terrVer = (w._terrVer || 0) + 1;
  w._me = (w._me || 0) + 1;
}
function guildPower(w, gd) { let p = 0; for (const id of gd.members) p += w.govs[id].power; return p; }
function rankGuilds(w) {
  const order = w.guilds.slice().sort((a, b) => b.power - a.power);
  order.forEach((gd, k) => { gd.rank = k + 1; });
}

// ================================================================ the Age: the Throne and the Grand Exchange
function throneCheck(w) {
  const th = w.throne;
  if (th.owner >= 0 && w.t - th.since >= THRONE_HOLD) endAge(w, th.owner, 'throne', null);
}
function completeExchange(w, g) {
  chronicle(w, 'exchange', `${g.name}${tagOf(w, g)} completed the Grand Exchange. Its markets now set the price of everything on ${SERVER.name}.`, { p: [g.id], g: g.guild >= 0 ? [g.guild] : [], x: g.x, y: g.y, imp: 3 });
  endAge(w, g.guild, 'exchange', g.id);
}
function endAge(w, gi, how, govId) {
  const P = w.govs[PLAYER];
  const gd = gi >= 0 ? w.guilds[gi] : null;
  const winnerName = gd ? `${gd.name} [${gd.tag}]` : w.govs[govId].name;
  const playerWon = (gi >= 0 && P.guild === gi) || govId === PLAYER;
  const rankP = w.govs.slice().sort((a, b) => b.power - a.power).findIndex(g => g.id === PLAYER) + 1;
  w.ages.push({ age: w.age, end: w.t, winner: gi, gov: govId, how, playerWon, playerRank: rankP, playerGuild: P.guild, playerRole: P.role });
  chronicle(w, 'age_end', `Age ${roman(w.age)} ended. ${winnerName} won ${how === 'throne' ? `by holding the Ember Throne for ${THRONE_HOLD / DAY} days` : 'by completing the Grand Exchange'}.`, { g: gi >= 0 ? [gi] : [], p: govId != null ? [govId] : [], imp: 3 });
  note(w, 'age', playerWon ? `Victory. Age ${roman(w.age)} is yours: ${winnerName} won.` : `Age ${roman(w.age)} ended. ${winnerName} won. A new Age begins.`, 3, { age: w.age });
  w.age++;
  // a new Age: the Capital returns to the Ember Guard, every Grand Exchange project restarts
  const cap = w.marks.find(m => m.kind === 'capital');
  for (const m of garrisonMarches(w, cap)) sendHome(w, m);
  cap.owner = -1; cap.garrison = { ...cap.base }; cap.wallDur = cap.wallMax; cap.lastHit = w.t;
  for (const g of w.govs) if (g.q.exchange) { refund(g, EXCHANGE.cost, 0.5); g.q.exchange = null; }
  w.throne = { owner: -1, since: 0 };
  for (const g2 of w.guilds) g2.age = w.age;
}
function roman(n) { return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n); }

// ================================================================ world events
const EVENTS = [
  { kind: 'winter', name: 'Harsh Winter', res: 'food', mult: 0.7, hours: 12, north: true, text: r => `A harsh winter grips ${r}. Food production there falls by 30% for half a day.` },
  { kind: 'drought', name: 'Drought', res: 'food', mult: 0.75, hours: 10, text: r => `Drought dries the fields of ${r}. Food production there falls by 25%.` },
  { kind: 'boom', name: 'Trade Boom', res: 'gold', mult: 1.25, hours: 12, all: true, text: () => 'Caravans crowd every road: a trade boom raises Gold production everywhere by 25%.' },
  { kind: 'bandits', name: 'Bandit Uprising', hours: 0, text: r => `Bandits rise in ${r}. New camps appear across the region.` },
  { kind: 'vein', name: 'Rich Vein', hours: 0, text: r => `Prospectors found rich iron and gold veins in ${r}.` },
  { kind: 'fire', name: 'Forest Fires', res: 'wood', mult: 0.7, hours: 8, text: r => `Fires sweep the forests of ${r}. Wood production there falls by 30%.` },
];
function worldEvents(w) {
  // end finished events (settle everyone affected first so production stays exact)
  for (const e of w.events.slice()) {
    if (w.t < e.end) continue;
    for (const g of w.govs) if (e.region == null || regionAt(w, g.x, g.y) === e.region) settle(w, g, w.t);
    w.events.splice(w.events.indexOf(e), 1);
    chronicle(w, 'event_end', `${e.name} ended${e.region != null ? ` in ${SERVER.regions[e.region]}` : ''}.`, { imp: 1 });
  }
  if (w.t < w.nextEventAt) return;
  const rng = makeRng(hash32(w.seed, 'event', w.t));
  w.nextEventAt = w.t + rng.int(16, 32) * HOUR;
  const def = rng.pick(EVENTS);
  const region = def.all ? null : def.north ? rng.pick([0, 1, 5, 6]) : rng.int(0, REGIONS.length - 1);
  const rname = region == null ? '' : SERVER.regions[region];
  if (def.hours > 0) {
    for (const g of w.govs) if (region == null || regionAt(w, g.x, g.y) === region) settle(w, g, w.t);
    w.events.push({ kind: def.kind, name: def.name, res: def.res, mult: def.mult, region, start: w.t, end: w.t + def.hours * HOUR });
  } else if (def.kind === 'bandits') {
    const [cx, cy] = regionCenter(region);
    for (let k = 0; k < 10; k++) spawnCamp(w, makeRng(hash32(w.seed, 'band', w.t, k)), [cx, cy, 45, region]);
  } else if (def.kind === 'vein') {
    const [cx, cy] = regionCenter(region);
    for (let k = 0; k < 4; k++) spawnNode(w, rng, k === 0 ? 'gold' : 'iron', T.hills, [cx, cy, 40, region]);
  }
  chronicle(w, 'event', def.text(rname), { imp: 2 });
}

// ================================================================ daily bookkeeping
function dayTick(w, d) {
  // territory and power history for the chronicle maps (32x32 cells per day)
  const cells = [];
  const CS = N / 32;
  for (let cy = 0; cy < 32; cy++) for (let cx = 0; cx < 32; cx++) {
    const counts = new Array(GUILD_COUNT + 1).fill(0);
    for (let y = cy * CS; y < cy * CS + CS; y++) for (let x = cx * CS; x < cx * CS + CS; x++) counts[w.map.terr[idx(x, y)]]++;
    let best = 0, bv = CS * CS * 0.3;
    for (let k = 1; k <= GUILD_COUNT; k++) if (counts[k] > bv) { bv = counts[k]; best = k; }
    cells.push(best.toString(16));
  }
  w.hist.terr[d] = cells.join('');
  w.hist.power[d] = w.guilds.map(gd => gd.power);
  const keys = Object.keys(w.hist.terr).map(Number).sort((a, b) => a - b);
  while (keys.length > 40) { const k = keys.shift(); delete w.hist.terr[k]; delete w.hist.power[k]; }
  for (const g of w.govs) g.tradedToday = 0;
  // market prices drift 30% of the way back to normal each day
  for (const r of RES) w.market.price[r] = 1 + (w.market.price[r] - 1) * 0.7;
  for (const gd of w.guilds) guildDaily(w, gd);
}

// ================================================================ player vision and exploration
function updatePlayerVision(w) {
  const vis = w._vis || (w._vis = new Uint8Array(N2));
  vis.fill(0);
  const P = w.govs[PLAYER];
  stampDisc(vis, P.x, P.y, visionRadius(P.b.tower || 0, P.b.hall), 2);
  if (P.guild >= 0) {
    for (const id of w.guilds[P.guild].members) if (id !== PLAYER) { const g = w.govs[id]; stampDisc(vis, g.x, g.y, 3, 2); }
    for (const mk of w.marks) if (mk.owner === P.guild && mk.kind !== 'ruin') stampDisc(vis, mk.x, mk.y, mk.kind === 'pass' ? 6 : 9, 2);
  }
  for (const m of w.marches) {
    const own = m.owner === PLAYER || (P.guild >= 0 && w.govs[m.owner].guild === P.guild);
    if (!own) continue;
    const [px, py] = marchPos(w, m);
    stampDisc(vis, Math.round(px), Math.round(py), m.kind === 'scout' ? 4 : 3, 2);
  }
  const ex = w.explored;
  for (let i = 0; i < N2; i++) if (vis[i]) ex[i] = 1;
  w._visVer = (w._visVer || 0) + 1;
}

// ================================================================ demonstration campaign: the Coalition War
// The server is two and a half days old. Crown of Cinders has outgrown everyone (a head start set by this scenario,
// not by any rule the AI plays under afterwards); its rivals fear it, and the Capital opens in a few hours. From
// here everything is simulated: whether a coalition forms, who it fights, and whether the player's arrival
// changes the outcome.
function scenarioCoalition(w) {
  const rng = makeRng(hash32(w.seed, 'scenario'));
  w.scenario = 'coalition';
  w.t = 2 * DAY + 12 * HOUR;
  w.lastDay = Math.floor(w.t / DAY);
  const H = w.guilds[0];
  const level = (g, hall, rest) => { for (const b of BUILDING_KEYS) g.b[b] = b === 'hall' ? hall : Math.min(hall, rest); g.wallDur = wallMax(g, cityMods(w, g)); modsChanged(g); };
  for (const g of w.govs) {
    g.at = w.t; g.next = g.human ? Infinity : w.t + rint(w, 1, 60); g.shield = 0; g.q.build = null; g.q.research = null;
    for (const u of UNIT_KEYS) g.q.train[u] = null;
    const top = g.guild === H.id;
    level(g, top ? 13 : 9, top ? 12 : 8);
    const army = top ? rng.int(24000, 36000) : rng.int(5000, 11000);
    const mix = ARCHETYPES[g.arch].army;
    for (const u of UNIT_KEYS) g.troops[u] = Math.round(army * (mix[u] || 0));
    for (const r of RES) g.res[r] = top ? 160000 : 60000;
    for (const t of ['agri', 'forestry', 'drill', 'archery', 'scouting', 'masonry']) g.tech[t] = top ? 6 : 3;
    for (const id in g.cmds) g.cmds[id].lv = top ? 18 : 10;
    g.power = computePower(g);
  }
  // the hegemon has broken out of its region: it holds the level 1 passes out of it, the holy sites inside it, and
  // the nearest sanctum in each neighbouring region, which the guilds living there will want back
  const hr = H.home.region;
  const near = (a, b) => dist(a.x, a.y, H.home.x, H.home.y) - dist(b.x, b.y, H.home.x, H.home.y);
  const nb = [(hr + 5) % 6, (hr + 1) % 6];
  const held = w.marks.filter(m => (m.kind === 'pass' && m.tier === 1 && m.links.includes(hr)) || (m.kind === 'site' && m.region === hr));
  for (const r of nb) { const s2 = w.marks.filter(m => m.kind === 'site' && m.site === 'sanctum' && m.region === r).sort(near)[0]; if (s2) held.push(s2); }
  for (const mk of held) {
    mk.owner = H.id; mk.since = w.t - DAY; mk.lastHit = w.t - DAY;
    const holder = w.govs[H.members[rng.int(1, H.members.length - 1)]];
    const at = idx(mk.x, mk.y);
    const troops = mk.kind === 'pass' ? { inf: 6000, cav: 2000, arc: 4000, sie: 0 } : { inf: 9000, cav: 3000, arc: 6000, sie: 0 };
    for (const u of UNIT_KEYS) { holder.troops[u] += troops[u]; holder.away[u] += troops[u]; }
    w.marches.push({ id: w.nid++, kind: 'reinforce', owner: holder.id, troops, c1: null, c2: null, path: [at], k: 0, frac: 0, speed: 1, from: at, to: at, target: { type: 'mark', id: mk.id }, state: 'garrison', dep: w.t, eta: w.t, load: null, rally: null, wounded: null, gatherEnd: 0, alerted: true, parts: null });
    chronicle(w, mk.kind, `${H.name} [${H.tag}] took ${mk.name} in the first days of the server.`, { g: [H.id], x: mk.x, y: mk.y, imp: 2 });
  }
  // the player arrives in the neighbouring region with the most other guilds, near the sanctum taken there
  const pr = nb.slice().sort((a, b) => w.guilds.filter(o => o.id !== H.id && o.home.region === b).length - w.guilds.filter(o => o.id !== H.id && o.home.region === a).length)[0];
  const pSite = held.find(m => m.kind === 'site' && m.region === pr);
  if (pSite) {
    const spot = freeTileNear(w, pSite.x, pSite.y, 22, rng, { minR: 10, region: pr, spread: true, awayFromMarks: 4 });
    if (spot) relocate(w, w.govs[PLAYER], spot[0], spot[1]);
  }
  for (const o of w.guilds) if (o.id !== H.id) { o.rel[H.id] = Math.min(o.rel[H.id], -30); H.rel[o.id] = Math.min(H.rel[o.id], -10); o.next = w.t + rint(w, 5, 90); }
  H.next = w.t + 30;
  // the player arrives as a seasoned independent governor, near the frontier
  const P = w.govs[PLAYER];
  level(P, 12, 11);
  P.troops = { inf: 14000, cav: 9000, arc: 9000, sie: 1500 };
  for (const r of RES) P.res[r] = 120000;
  P.cmds[CIV[P.civ].commander].lv = 15;
  P.shield = w.t + DAY;
  P.power = computePower(P);
  for (const g of w.govs) g.power = computePower(g);
  for (const gd of w.guilds) gd.power = guildPower(w, gd);
  rankGuilds(w);
  recomputeTerritory(w);
  const total = w.guilds.reduce((a, gd) => a + gd.power, 0);
  chronicle(w, 'hegemon', `${H.name} [${H.tag}] now holds ${Math.round(H.power / total * 100)}% of the server's power, the passes out of ${REGIONS[hr].name} and ${held.filter(m => m.kind === 'site').length} holy sites. Its neighbours watch the Capital, which opens on Day ${1 + THRONE_OPENS / DAY}.`, { g: [H.id], imp: 3 });
  for (const q of QUESTS) if (q.check(P)) w.quests.claimed[q.id] = w.t;   // the tutorial goals are behind this governor
  stampDisc(w.explored, P.x, P.y, 24, 1);
}
