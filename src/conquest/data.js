/* Age of Conquest data tables: units, buildings, research, civilizations, commanders, governor archetypes,
   guilds and names. Plain data plus small formula helpers; no state. Part of the engine bundle (see bundle.mjs). */

// ================================================================ time
const MIN = 1;
const HOUR = 60;
const DAY = 1440;
const MAP_N = 384;

// ================================================================ resources
const RES = ['food', 'wood', 'stone', 'iron', 'gold'];
const RES_NAME = { food: 'Food', wood: 'Wood', stone: 'Stone', iron: 'Iron', gold: 'Gold' };

// ================================================================ units
// atk/def/hp per soldier; speed in tiles per game minute; load in resources carried; upkeep in food per hour.
const UNITS = {
  inf: { name: 'Infantry', plural: 'Infantry', atk: 10, def: 14, hp: 16, speed: 0.55, load: 12, upkeep: 0.12, building: 'barracks', cost: { food: 12, wood: 8 }, sec: 2.4 },
  cav: { name: 'Cavalry', plural: 'Cavalry', atk: 14, def: 10, hp: 14, speed: 0.9, load: 8, upkeep: 0.2, building: 'stables', cost: { food: 14, wood: 6, iron: 4 }, sec: 3.2 },
  arc: { name: 'Archers', plural: 'Archers', atk: 13, def: 9, hp: 12, speed: 0.65, load: 10, upkeep: 0.12, building: 'range', cost: { food: 10, wood: 12 }, sec: 2.8 },
  sie: { name: 'Siege', plural: 'Siege engines', atk: 18, def: 6, hp: 12, speed: 0.4, load: 15, upkeep: 0.18, building: 'workshop', cost: { food: 8, wood: 16, stone: 8, iron: 6 }, sec: 4.8 },
};
const UNIT_KEYS = ['inf', 'cav', 'arc', 'sie'];
// attacker type -> defender type -> damage multiplier. Infantry beats cavalry, cavalry beats archers, archers beat
// infantry. Siege is weak in the field and strong against walls (WALL_MULT).
const COUNTER = {
  inf: { inf: 1, cav: 1.3, arc: 0.8, sie: 1.1 },
  cav: { inf: 0.8, cav: 1, arc: 1.3, sie: 1.3 },
  arc: { inf: 1.3, cav: 0.8, arc: 1, sie: 1.1 },
  sie: { inf: 0.6, cav: 0.6, arc: 0.6, sie: 0.8 },
};
const WALL_MULT = { inf: 0.6, cav: 0.4, arc: 0.7, sie: 3 };
const HEAL_FRACTION = 0.3;   // healing costs 30% of training cost and time

// ================================================================ terrain
// cost: movement cost per tile (Infinity = impassable). Combat modifiers are applied in rules.js (terrainMods).
const TERRAIN = [
  { id: 'water', name: 'Lake', cost: Infinity, color: '#1d3a52' },
  { id: 'plains', name: 'Plains', cost: 1, color: '#5d6b3a' },
  { id: 'forest', name: 'Forest', cost: 1.5, color: '#2f4a2c' },
  { id: 'hills', name: 'Hills', cost: 1.8, color: '#6d5c3e' },
  { id: 'mountain', name: 'Mountains', cost: Infinity, color: '#4a4440' },
  { id: 'river', name: 'River', cost: Infinity, color: '#2a5675' },
  { id: 'ford', name: 'Ford', cost: 2.5, color: '#4f7f8e' },
  { id: 'pass', name: 'Mountain trail', cost: 2, color: '#7b6a55' },
  { id: 'snow', name: 'Tundra', cost: 1.4, color: '#8a9298' },
  // the road through one of the kingdom's passes: open only to the guild that holds the pass and its allies
  { id: 'gate', name: 'Pass road', cost: 2, color: '#8c7b5f' },
];
const T = { water: 0, plains: 1, forest: 2, hills: 3, mountain: 4, river: 5, ford: 6, pass: 7, snow: 8, gate: 9 };

// ================================================================ the kingdom (laid out like a Rise of Kingdoms kingdom)
// Zone 1, the outer ring, is six regions where every governor starts. Zone 2 is a ring of three richer regions and
// Zone 3 the heartland around the Ember Throne. Mountain ranges wall every region; the only ways through are 15
// passes: level 1 between neighbouring Zone 1 regions, level 2 from Zone 1 into Zone 2 and level 3 into Zone 3.
// A guild must capture a pass before its members (and its allies) can march through it.
const ZONES = { r3: 0.17, r2: 0.345 };   // outer radius of Zone 3 and of Zone 2, as a share of MAP_N
// Zone 1 region k spans the compass from -120 + 60k degrees (k = 0 is the north); Zone 2 region 6 + j from -120 + 120j
const REGIONS = [
  { name: 'Frostreach', zone: 1 }, { name: 'Greywatch', zone: 1 }, { name: 'Saltmere', zone: 1 },
  { name: 'Redmarch', zone: 1 }, { name: 'Duskwood', zone: 1 }, { name: 'Cinderhold', zone: 1 },
  { name: 'Emberfall', zone: 2 }, { name: 'Ironvale', zone: 2 }, { name: 'Ashmoor', zone: 2 },
  { name: 'The Throne Lands', zone: 3 },
];
// when each kind of landmark can first be attacked (game minutes; the server opens on Day 1 at 06:00)
const PASS_LEVELS = {
  1: { opens: 1 * DAY, garrison: 8 },
  2: { opens: 2 * DAY, garrison: 11 },
  3: { opens: 2 * DAY + 12 * HOUR, garrison: 14 },
};
// holy sites: the guild holding one gives every member its blessing; two sites with the same blessing do not add up
const SITES = {
  sanctum: { name: 'Sanctum', level: 4, opens: 0, blessings: ['plenty', 'stone', 'haste', 'masons', 'scholars', 'mercy'] },
  altar: { name: 'Altar', level: 7, opens: 1 * DAY, blessings: ['war', 'ward', 'vigor'] },
  shrine: { name: 'Shrine', level: 10, opens: 2 * DAY, blessings: ['conquest', 'bulwark', 'life', 'gold', 'wind', 'harvest'] },
  temple: { name: 'Shrine', level: 14, opens: 3 * DAY, blessings: ['dominion', 'eternal', 'abundance'] },
};
const BLESSINGS = {
  plenty: { name: 'Blessing of Plenty', text: '+5% Food and Wood production', mods: { food: 0.05, wood: 0.05 } },
  stone: { name: 'Blessing of Stone', text: '+5% Stone and Iron production', mods: { stone: 0.05, iron: 0.05 } },
  haste: { name: 'Blessing of Haste', text: '+5% gathering speed', mods: { gather: 0.05 } },
  masons: { name: 'Masons\' Blessing', text: '+5% building speed', mods: { buildSpeed: 0.05 } },
  scholars: { name: 'Scholars\' Blessing', text: '+5% research speed', mods: { research: 0.05 } },
  mercy: { name: 'Blessing of Mercy', text: '+8% healing speed', mods: { heal: 0.08 } },
  war: { name: 'Blessing of War', text: '+3% troop attack', mods: { atk: 0.03 } },
  ward: { name: 'Blessing of the Ward', text: '+3% troop defense', mods: { def: 0.03 } },
  vigor: { name: 'Blessing of Vigor', text: '+3% troop health', mods: { hp: 0.03 } },
  conquest: { name: 'Blessing of Conquest', text: '+5% troop attack', mods: { atk: 0.05 } },
  bulwark: { name: 'Blessing of the Bulwark', text: '+5% troop defense', mods: { def: 0.05 } },
  life: { name: 'Blessing of Life', text: '+5% troop health', mods: { hp: 0.05 } },
  gold: { name: 'Blessing of Gold', text: '+10% Gold production', mods: { gold: 0.1 } },
  wind: { name: 'Blessing of the Wind', text: '+8% march speed', mods: { speed: 0.08 } },
  harvest: { name: 'Blessing of the Harvest', text: '+8% Food, Wood and Stone production', mods: { food: 0.08, wood: 0.08, stone: 0.08 } },
  dominion: { name: 'Blessing of Dominion', text: '+6% troop attack and defense', mods: { atk: 0.06, def: 0.06 } },
  eternal: { name: 'Eternal Blessing', text: '+10% healing speed and +5% troop health', mods: { heal: 0.1, hp: 0.05 } },
  abundance: { name: 'Blessing of Abundance', text: '+10% production of every resource', mods: { food: 0.1, wood: 0.1, stone: 0.1, iron: 0.1, gold: 0.1 } },
};

// ================================================================ buildings
// cost(L) = base * GROWTH^(L-1); time(L) = minutes * TGROWTH^(L-1) game minutes. needHall: Town Hall level that
// unlocks it. Every building except the hall is capped at the hall level.
const B_GROWTH = 1.45;
const B_TGROWTH = 1.36;
const MAX_LEVEL = 25;
const BUILDINGS = {
  hall: { name: 'Town Hall', base: { wood: 300, stone: 200 }, minutes: 4, needHall: 0, desc: 'Sets the level cap of every other building. Each level adds vision.' },
  farm: { name: 'Farm', base: { wood: 120 }, minutes: 2, needHall: 1, produces: 'food', desc: 'Produces Food. Troops eat Food every hour.' },
  lumber: { name: 'Lumber Mill', base: { food: 120 }, minutes: 2, needHall: 1, produces: 'wood', desc: 'Produces Wood.' },
  quarry: { name: 'Quarry', base: { food: 100, wood: 100 }, minutes: 2.5, needHall: 2, produces: 'stone', desc: 'Produces Stone.' },
  mine: { name: 'Iron Mine', base: { food: 120, wood: 140 }, minutes: 3, needHall: 3, produces: 'iron', desc: 'Produces Iron.' },
  market: { name: 'Market', base: { wood: 200, stone: 120 }, minutes: 3, needHall: 4, produces: 'gold', desc: 'Produces Gold and lowers the fee when you trade resources.' },
  warehouse: { name: 'Warehouse', base: { wood: 160, stone: 80 }, minutes: 2.5, needHall: 1, desc: 'Protects part of your stock from plunder. There is no limit on how much you can hold.' },
  barracks: { name: 'Barracks', base: { food: 150, wood: 150 }, minutes: 3, needHall: 1, trains: 'inf', desc: 'Trains Infantry. Higher levels train faster.' },
  stables: { name: 'Stables', base: { food: 180, wood: 160 }, minutes: 3.5, needHall: 2, trains: 'cav', desc: 'Trains Cavalry.' },
  range: { name: 'Archery Range', base: { food: 160, wood: 180 }, minutes: 3.5, needHall: 2, trains: 'arc', desc: 'Trains Archers.' },
  workshop: { name: 'Siege Workshop', base: { wood: 300, stone: 200, iron: 80 }, minutes: 5, needHall: 5, trains: 'sie', desc: 'Builds siege engines for attacking walls and fortresses.' },
  academy: { name: 'Academy', base: { wood: 220, stone: 160 }, minutes: 4, needHall: 3, desc: 'Researches technology. A technology can reach at most the Academy level.' },
  hospital: { name: 'Hospital', base: { food: 160, wood: 200 }, minutes: 3, needHall: 3, desc: 'Holds wounded troops so they can be healed instead of lost.' },
  wall: { name: 'City Wall', base: { stone: 260, wood: 120 }, minutes: 4, needHall: 2, desc: 'Defends the city: more defense, towers and durability.' },
  tower: { name: 'Watchtower', base: { wood: 200, stone: 120 }, minutes: 3, needHall: 2, desc: 'Widens what your city can see and warns of marches sooner.' },
};
const BUILDING_KEYS = Object.keys(BUILDINGS);
// extra requirements beyond the hall cap: hall L needs wall L-1 from L3 and academy L-3 from L6
function buildingReq(id, L) {
  const r = [];
  if (id === 'hall') {
    if (L >= 3) r.push(['wall', L - 1]);
    if (L >= 6) r.push(['academy', L - 3]);
    if (L >= 10) r.push(['warehouse', L - 2]);
  }
  return r;
}
function buildingCost(id, L) {
  const d = BUILDINGS[id];
  const k = Math.pow(B_GROWTH, L - 1);
  const out = {};
  for (const r in d.base) out[r] = Math.round(d.base[r] * k);
  if (L >= 8) out.gold = Math.round(40 * Math.pow(B_GROWTH, L - 8) * (id === 'hall' ? 3 : 1));
  return out;
}
function buildingMinutes(id, L) { return Math.max(1, Math.round(BUILDINGS[id].minutes * Math.pow(B_TGROWTH, L - 1))); }
// production per hour of one producing building at level L
function productionAt(L) { return L <= 0 ? 0 : Math.round(120 * L * Math.pow(1.12, L - 1)); }
const BASE_PRODUCTION = { food: 200, wood: 200, stone: 80, iron: 40, gold: 20 };
function protectedAmount(warehouseL) { return Math.round(1500 + 1800 * Math.pow(warehouseL, 1.3)); }
function hospitalCap(L) { return L <= 0 ? 0 : Math.round(300 * Math.pow(L, 1.35)); }
function wallDurability(L) { return Math.round(2000 + 1500 * L * Math.pow(1.08, L)); }
function visionRadius(towerL, hallL) { return 5 + Math.floor(towerL / 2) + Math.floor(hallL / 6); }
function marchCapacity(hallL) { return Math.round(1000 + 1200 * hallL * Math.pow(1.06, hallL)); }
function marchSlots(hallL) { return 1 + Math.floor(hallL / 6); }

// ================================================================ research
// lv max 10, capped at the Academy level. cost(lv) = base * 1.65^(lv-1); time = minutes * 1.4^(lv-1).
const TECHS = {
  agri: { name: 'Agriculture', branch: 'economy', per: 5, stat: 'food', base: { food: 300, wood: 300, gold: 40 }, minutes: 5, req: [['academy', 1]], desc: '+5% Food production per level.' },
  forestry: { name: 'Forestry', branch: 'economy', per: 5, stat: 'wood', base: { food: 300, wood: 300, gold: 40 }, minutes: 5, req: [['academy', 1]], desc: '+5% Wood production per level.' },
  masonry: { name: 'Masonry', branch: 'economy', per: 4, stat: 'stone', base: { wood: 400, stone: 300, gold: 50 }, minutes: 6, req: [['academy', 2]], desc: '+4% Stone production and +3% build speed per level.' },
  metal: { name: 'Metallurgy', branch: 'economy', per: 5, stat: 'iron', base: { wood: 500, stone: 400, gold: 60 }, minutes: 7, req: [['academy', 3], ['tech:masonry', 1]], desc: '+5% Iron production per level.' },
  trade: { name: 'Trade Routes', branch: 'economy', per: 6, stat: 'gold', base: { food: 600, wood: 600, gold: 120 }, minutes: 8, req: [['academy', 4], ['market', 1]], desc: '+6% Gold production and -2% market fee per level.' },
  logistics: { name: 'Logistics', branch: 'economy', per: 8, stat: 'protect', base: { food: 500, wood: 500, gold: 60 }, minutes: 6, req: [['academy', 2]], desc: '+8% stock safe from plunder and +5% carry load per level.' },
  drill: { name: 'Infantry Drill', branch: 'military', per: 3, stat: 'inf', base: { food: 500, wood: 400, gold: 60 }, minutes: 6, req: [['academy', 1], ['barracks', 1]], desc: '+3% Infantry attack and defense per level.' },
  horse: { name: 'Horsemanship', branch: 'military', per: 3, stat: 'cav', base: { food: 600, wood: 400, iron: 100, gold: 60 }, minutes: 7, req: [['academy', 2], ['stables', 1]], desc: '+3% Cavalry attack and defense per level.' },
  archery: { name: 'Archery', branch: 'military', per: 3, stat: 'arc', base: { food: 500, wood: 600, gold: 60 }, minutes: 7, req: [['academy', 2], ['range', 1]], desc: '+3% Archer attack and defense per level.' },
  siegecraft: { name: 'Siegecraft', branch: 'military', per: 5, stat: 'sie', base: { wood: 800, stone: 600, iron: 200, gold: 100 }, minutes: 9, req: [['academy', 5], ['workshop', 1]], desc: '+5% siege attack per level.' },
  formations: { name: 'Formations', branch: 'military', per: 6, stat: 'capacity', base: { food: 800, wood: 800, iron: 150, gold: 120 }, minutes: 9, req: [['academy', 5], ['tech:drill', 2]], desc: '+6% troops per army per level.' },
  medicine: { name: 'Medicine', branch: 'military', per: 6, stat: 'heal', base: { food: 700, wood: 500, gold: 80 }, minutes: 7, req: [['academy', 3], ['hospital', 1]], desc: '+6% healing speed and +5% hospital space per level.' },
  scouting: { name: 'Scouting', branch: 'intel', per: 8, stat: 'scout', base: { food: 300, wood: 300, gold: 50 }, minutes: 5, req: [['academy', 1]], desc: '+8% scout accuracy and +5% scout speed per level.' },
  counter: { name: 'Counterintelligence', branch: 'intel', per: 6, stat: 'counter', base: { wood: 500, stone: 300, gold: 80 }, minutes: 7, req: [['academy', 3], ['tower', 2]], desc: 'Enemy scouts read your city 6% less accurately per level, and planted false reports become possible.' },
  carto: { name: 'Cartography', branch: 'intel', per: 3, stat: 'speed', base: { food: 400, wood: 400, gold: 60 }, minutes: 6, req: [['academy', 2], ['tech:scouting', 1]], desc: '+3% march speed per level.' },
  fortify: { name: 'Fortification', branch: 'intel', per: 4, stat: 'wall', base: { stone: 700, wood: 400, gold: 80 }, minutes: 8, req: [['academy', 3], ['wall', 3]], desc: '+4% wall defense and +5% wall durability per level.' },
};
const TECH_KEYS = Object.keys(TECHS);
const TECH_MAX = 10;
function techCost(id, lv) {
  const d = TECHS[id];
  const k = Math.pow(1.65, lv - 1);
  const out = {};
  for (const r in d.base) out[r] = Math.round(d.base[r] * k);
  return out;
}
function techMinutes(id, lv) { return Math.max(2, Math.round(TECHS[id].minutes * Math.pow(1.4, lv - 1))); }

// ================================================================ civilizations
// mods are fractional bonuses (0.1 = +10%); every civilization has at least one real cost.
const CIVS = [
  { id: 'ashen', name: 'Ashen Empire', adj: 'Ashen', color: '#b5562f', commander: 'kael', terrain: 'hills', roof: '#6b2e1d', stone: '#5a4f48',
    variant: { unit: 'inf', name: 'Ashguard', mods: { def: 0.1 } },
    mods: { infDef: 0.05, wallDur: 0.1, speed: -0.05 },
    pros: ['+5% Infantry defense', '+10% wall durability', 'Ashguard infantry: +10% defense'], cons: ['-5% march speed'],
    lore: 'Heirs of the first furnace-kings, who rebuilt an empire from cinders and still measure loyalty in ash.' },
  { id: 'sunspire', name: 'Sunspire Dominion', adj: 'Sunspire', color: '#d9a43a', commander: 'amara', terrain: 'plains', roof: '#a8722a', stone: '#8b7b5c',
    variant: { unit: 'cav', name: 'Sunlancer', mods: { atk: 0.08 } },
    mods: { cavAtk: 0.05, gold: 0.05, food: -0.08 },
    pros: ['+5% Cavalry attack', '+5% Gold', 'Sunlancer cavalry: +8% attack'], cons: ['-8% Food production'],
    lore: 'Desert lancers who ride beneath mirrored towers that catch the last warm light in the world.' },
  { id: 'steppe', name: 'Storm Khanate', adj: 'Khanate', color: '#4f86a8', commander: 'temur', terrain: 'plains', roof: '#3b5b70', stone: '#6c6a5d',
    variant: { unit: 'arc', name: 'Storm Rider', mods: { speed: 0.35 } },
    mods: { speed: 0.1, scoutSpeed: 0.1, wallDef: -0.1 },
    pros: ['+10% march speed', '+10% scout speed', 'Storm Riders: archers that ride 35% faster'], cons: ['-10% wall defense'],
    lore: 'Clans of the open steppe who trust the horizon more than walls, and the storm more than kings.' },
  { id: 'concord', name: 'Iron Concord', adj: 'Concord', color: '#7d8a96', commander: 'veyra', terrain: 'plains', roof: '#4c5660', stone: '#6f7378',
    variant: { unit: 'inf', name: 'Concord Halberdier', mods: { atk: 0.06 } },
    mods: { research: 0.1, rally: 0.1, atk: -0.05 },
    pros: ['+10% research speed', '+10% rally capacity', 'Halberdiers: +6% attack'], cons: ['-5% troop attack'],
    lore: 'A republic of guild-cities bound by iron charters, where every war is planned by committee and won by logistics.' },
  { id: 'bastion', name: 'Stone Bastion', adj: 'Bastion', color: '#8f7d64', commander: 'orun', terrain: 'hills', roof: '#5b4e3d', stone: '#77706a',
    variant: { unit: 'inf', name: 'Bastion Warden', mods: { hp: 0.1 } },
    mods: { stone: 0.15, cityDef: 0.1, speed: -0.1, gather: -0.05 },
    pros: ['+15% Stone', '+10% defense in your own city', 'Wardens: +10% health'], cons: ['-10% march speed', '-5% gathering speed'],
    lore: 'Mountain-wardens who carve their cities into the living rock and never once have opened a gate to a siege.' },
  { id: 'raven', name: 'Raven Court', adj: 'Raven', color: '#5d4a7a', commander: 'seris', terrain: 'forest', roof: '#3c2f52', stone: '#5c5866',
    variant: { unit: 'arc', name: 'Raven Skirmisher', mods: { atk: 0.05, forestAtk: 0.1 } },
    mods: { scoutAcc: 0.2, counter: 0.2, hp: -0.05 },
    pros: ['+20% scout accuracy', '+20% counterintelligence', 'Skirmishers: +10% attack in forests'], cons: ['-5% troop health'],
    lore: 'A shadow court of whisperers whose ravens carry more secrets than any treasury holds gold.' },
  { id: 'dawn', name: 'Dawn Kingdom', adj: 'Dawn', color: '#c9b065', commander: 'darius', terrain: 'plains', roof: '#8c6f2c', stone: '#9a8f7a',
    variant: { unit: 'inf', name: 'Dawn Legionary', mods: { atk: 0.08 } },
    mods: { morale: 0.1, infAtk: 0.05, iron: -0.1 },
    pros: ['+10% morale', '+5% Infantry attack', 'Legionaries: +8% attack'], cons: ['-10% Iron production'],
    lore: 'Sworn to greet every sunrise as a victory, the Dawn legions sing as they march into the cold.' },
  { id: 'frost', name: 'Frost Clans', adj: 'Frost', color: '#9fc6d6', commander: 'nyra', terrain: 'snow', roof: '#4d6a78', stone: '#9aa5ab',
    variant: { unit: 'arc', name: 'Frost Hunter', mods: { def: 0.08 } },
    mods: { roughDef: 0.1, winterProof: 1, gold: -0.1 },
    pros: ['+10% defense in forests, hills and tundra', 'Unaffected by Harsh Winter', 'Frost Hunters: +8% defense'], cons: ['-10% Gold production'],
    lore: 'Seers and hunters of the white north, who read the ice like scripture and fear no winter.' },
  { id: 'golden', name: 'Golden League', adj: 'League', color: '#e0c060', commander: 'ilyan', terrain: 'plains', roof: '#a88a2a', stone: '#a09070',
    variant: { unit: 'cav', name: 'League Outrider', mods: { load: 0.3 } },
    mods: { gold: 0.15, tradeFee: -0.3, atk: -0.08 },
    pros: ['+15% Gold', '30% lower market fee', 'Outriders carry 30% more'], cons: ['-8% troop attack'],
    lore: 'Merchant princes who discovered that a well-placed loan wins more wars than a well-placed spear.' },
  { id: 'forge', name: 'Forge Holds', adj: 'Forge', color: '#a8582f', commander: 'rokan', terrain: 'hills', roof: '#5d3524', stone: '#5e534c',
    variant: { unit: 'sie', name: 'Forge Ram', mods: { wallAtk: 0.2 } },
    mods: { iron: 0.15, sieAtk: 0.1, food: -0.05, cavDef: -0.1 },
    pros: ['+15% Iron', '+10% siege attack', 'Forge Rams: +20% damage to walls'], cons: ['-5% Food', '-10% Cavalry defense'],
    lore: 'Dwarf-tall smiths of the deep holds whose rams have broken every wall that ever said no.' },
  { id: 'tempest', name: 'Tempest Isles', adj: 'Tempest', color: '#3f8f8a', commander: 'maelis', terrain: 'water', roof: '#2a5c58', stone: '#6d7c78',
    variant: { unit: 'arc', name: 'Tempest Bowman', mods: { atk: 0.06 } },
    mods: { arcAtk: 0.08, wood: 0.1, infDef: -0.08 },
    pros: ['+8% Archer attack', '+10% Wood', 'Tempest Bowmen: +6% attack'], cons: ['-8% Infantry defense'],
    lore: 'Island lords who sail frozen lakes on runner-ships and call down the gale against their foes.' },
  { id: 'oath', name: 'Oathbound Marches', adj: 'Oathbound', color: '#6f8f5a', commander: 'thane', terrain: 'forest', roof: '#41583a', stone: '#6c6f5e',
    variant: { unit: 'cav', name: 'Oath Rider', mods: { hp: 0.1 } },
    mods: { hospital: 0.15, heal: 0.15, reinforce: 0.1, food: -0.05, wood: -0.05 },
    pros: ['+15% hospital space and healing speed', '+10% defense when reinforcing', 'Oath Riders: +10% health'], cons: ['-5% Food and Wood'],
    lore: 'Border knights who swore to hold the marches until the last fire dies, and keep their oaths past death.' },
];
const CIV = Object.fromEntries(CIVS.map(c => [c.id, c]));

// ================================================================ commanders
// rarity: legendary or epic (epic levels faster and costs less to train, so it stays a real choice).
// active fires when rage reaches 1000 (rage +100 per round, +3 per 1% of troops lost).
// effect kinds: nuke (power), buff/debuff (stat, pct, rounds), heal (pct of losses this battle), morale (amount).
// passive keys use the same names as civ mods; 'when' limits a passive to attack/defend/city/field/rally/terrain.
// steward passives apply to the governor's city while the commander is the City Steward.
const COMMANDERS = [
  { id: 'kael', name: 'Kael', title: 'the Ashen Emperor', civ: 'ashen', rarity: 'legendary', spec: 'inf', role: 'Infantry and territorial defense',
    active: { name: 'Ember Bulwark', desc: 'Infantry gain 25% defense for 3 rounds and the enemy takes a burst of damage.', effects: [{ k: 'buff', stat: 'def', pct: 25, rounds: 3, unit: 'inf' }, { k: 'nuke', power: 260 }] },
    passives: [{ name: 'Ashen Discipline', desc: '+10% Infantry defense.', mods: { infDef: 0.1 } }, { name: "Throne's Shadow", desc: '+10% defense inside your guild territory.', mods: { def: 0.1 }, when: 'territory' }],
    ultimate: { name: 'Unyielding Crown', desc: 'Once per battle, when troops fall below half, morale recovers by 25.', effects: [{ k: 'rally', below: 0.5, morale: 25 }] },
    talents: ['inf', 'def', 'territory'], story: 'The last emperor of a burned dynasty, Kael rebuilt his throne from the ash of his own palace. He has never lost a city he chose to defend, and never forgiven the one he did not.', rival: 'amara' },
  { id: 'amara', name: 'Amara', title: 'the Sunblade', civ: 'sunspire', rarity: 'legendary', spec: 'cav', role: 'Cavalry, flanking and pursuit',
    active: { name: 'Sunblade Charge', desc: 'A blazing charge that deals heavy damage, doubled against archers.', effects: [{ k: 'nuke', power: 420, vs: 'arc', mult: 2 }] },
    passives: [{ name: 'Desert Wind', desc: '+10% Cavalry attack.', mods: { cavAtk: 0.1 } }, { name: 'Run Them Down', desc: 'A routing enemy loses 20% more troops.', mods: { pursuit: 0.2 } }],
    ultimate: { name: 'Mirage Flank', desc: '+10% march speed and +8% attack in the first three rounds.', effects: [{ k: 'opening', stat: 'atk', pct: 8, rounds: 3 }], mods: { speed: 0.1 } },
    talents: ['cav', 'atk', 'speed'], story: 'Born in a caravan, crowned on horseback. Amara rides at the head of every charge because she has never trusted anyone else to choose the angle.', rival: 'kael' },
  { id: 'temur', name: 'Temur', title: 'the Storm Khan', civ: 'steppe', rarity: 'legendary', spec: 'arc', role: 'Mobile ranged attacks and scouting',
    active: { name: 'Storm of Arrows', desc: 'Two volleys over two rounds.', effects: [{ k: 'nuke', power: 230 }, { k: 'dot', power: 230, rounds: 1 }] },
    passives: [{ name: 'Horse Archer', desc: '+8% Archer attack and +12% march speed.', mods: { arcAtk: 0.08, speed: 0.12 } }, { name: 'Eyes of the Steppe', desc: '+20% scout accuracy while he leads your city.', mods: { scoutAcc: 0.2 }, steward: true }],
    ultimate: { name: 'First Thunder', desc: 'Strikes before the battle begins.', effects: [{ k: 'prestrike', power: 300 }] },
    talents: ['arc', 'speed', 'scout'], story: 'Temur united nine clans by outriding each of their champions. Rumor says he has never slept under a roof.', rival: 'orun' },
  { id: 'veyra', name: 'Veyra', title: 'the Iron Strategist', civ: 'concord', rarity: 'epic', spec: 'mix', role: 'Support, rallies and reinforcements',
    active: { name: 'Iron Orders', desc: 'All troops gain 15% attack for 2 rounds.', effects: [{ k: 'buff', stat: 'atk', pct: 15, rounds: 2 }] },
    passives: [{ name: 'Chain of Command', desc: '+15% rally capacity when she leads a rally.', mods: { rally: 0.15 }, when: 'rally' }, { name: 'Supply Lines', desc: '+20% speed for reinforcements and rallies.', mods: { reinforceSpeed: 0.2 } }],
    ultimate: { name: 'Concord Square', desc: '+10% defense in rallies and garrisons.', mods: { def: 0.1 }, when: 'rally' },
    talents: ['atk', 'def', 'rally'], story: 'A clerk who rewrote the Concord war charter overnight. Veyra wins wars on paper weeks before the first march.', rival: 'seris' },
  { id: 'orun', name: 'Orun', title: 'the Immortal Sentinel', civ: 'bastion', rarity: 'legendary', spec: 'inf', role: 'Fortress garrisons and siege defense',
    active: { name: 'Stoneheart', desc: 'Restores 8% of troops lost so far and grants 20% defense for 2 rounds.', effects: [{ k: 'heal', pct: 8 }, { k: 'buff', stat: 'def', pct: 20, rounds: 2 }] },
    passives: [{ name: 'Gatekeeper', desc: '+15% defense when defending a city or fortress.', mods: { def: 0.15 }, when: 'city' }, { name: 'Living Rock', desc: '+15% wall durability while he leads your city.', mods: { wallDur: 0.15 }, steward: true }],
    ultimate: { name: 'Thousand-Year Watch', desc: 'Wall towers deal 30% more damage.', mods: { tower: 0.3 } },
    talents: ['def', 'inf', 'city'], story: 'Orun has stood the north gate of the Bastion for three hundred winters, or so the songs say. Nobody alive remembers the gate without him.', rival: 'rokan' },
  { id: 'seris', name: 'Seris', title: 'the Veiled Raven', civ: 'raven', rarity: 'epic', spec: 'arc', role: 'Intelligence, sabotage and counterintelligence',
    active: { name: 'Veil Strike', desc: 'Enemy attack drops 20% for 2 rounds.', effects: [{ k: 'debuff', stat: 'atk', pct: 20, rounds: 2 }, { k: 'nuke', power: 120 }] },
    passives: [{ name: 'Whisper Network', desc: '+25% scout accuracy and +25% counterintelligence while she leads your city.', mods: { scoutAcc: 0.25, counter: 0.25 }, steward: true }, { name: 'From the Trees', desc: '+15% attack in forests.', mods: { atk: 0.15 }, when: 'forest' }],
    ultimate: { name: 'False Raven', desc: 'Enemy scouts reading your city get false numbers half the time.', mods: { falseReports: 0.5 }, steward: true },
    talents: ['scout', 'atk', 'counter'], story: 'Nobody has seen Seris twice with the same face. Her letters arrive before the battles they describe.', rival: 'veyra' },
  { id: 'darius', name: 'Darius Vale', title: 'the Lion of Dawn', civ: 'dawn', rarity: 'epic', spec: 'inf', role: 'Infantry assaults and morale',
    active: { name: 'Dawn Roar', desc: '+20 morale and +20% Infantry attack for 2 rounds.', effects: [{ k: 'morale', amount: 20 }, { k: 'buff', stat: 'atk', pct: 20, rounds: 2, unit: 'inf' }] },
    passives: [{ name: 'Unbroken', desc: 'Morale falls 20% slower.', mods: { moraleLoss: -0.2 } }, { name: 'Vanguard', desc: '+8% Infantry attack when attacking.', mods: { infAtk: 0.08 }, when: 'attack' }],
    ultimate: { name: 'Second Sunrise', desc: 'After a victory, 10% more casualties return as wounded.', mods: { wounded: 0.1 } },
    talents: ['inf', 'atk', 'morale'], story: 'A shepherd who held a bridge alone for a night and a day. The Dawn Kingdom made him a lord; he still sleeps with his soldiers.', rival: 'thane' },
  { id: 'nyra', name: 'Nyra', title: 'the Frost Oracle', civ: 'frost', rarity: 'epic', spec: 'arc', role: 'Terrain control and defensive disruption',
    active: { name: 'Frostbind', desc: 'Enemy attack drops 25% and enemy cavalry another 15% for 2 rounds.', effects: [{ k: 'debuff', stat: 'atk', pct: 25, rounds: 2 }, { k: 'debuff', stat: 'atk', pct: 15, rounds: 2, unit: 'cav' }] },
    passives: [{ name: 'Child of Ice', desc: '+12% defense in forests, hills and tundra.', mods: { roughDef: 0.12 } }, { name: 'Winter Ward', desc: 'Your city ignores Harsh Winter while she leads it.', mods: { winterProof: 1 }, steward: true }],
    ultimate: { name: 'White Silence', desc: 'The enemy cannot cast its commander skill for the first 3 rounds.', effects: [{ k: 'silence', rounds: 3 }] },
    talents: ['def', 'arc', 'terrain'], story: 'Nyra walked out of a glacier at the age of nine and has foretold every great winter since. She has never foretold her own.', rival: 'maelis' },
  { id: 'ilyan', name: 'Ilyan', title: 'the Golden Merchant', civ: 'golden', rarity: 'epic', spec: 'cav', role: 'Trade, logistics and economic bonuses',
    active: { name: 'Golden Ransom', desc: 'A modest strike; plunder is 20% higher if the battle is won.', effects: [{ k: 'nuke', power: 150 }], mods: { plunder: 0.2 } },
    passives: [{ name: 'Caravan Master', desc: '+20% gathering speed and carry load.', mods: { gather: 0.2, load: 0.2 } }, { name: 'Honest Scales', desc: '-20% market fee and +10% Gold while he leads your city.', mods: { tradeFee: -0.2, gold: 0.1 }, steward: true }],
    ultimate: { name: 'Every Man Has a Price', desc: 'Defenders he defeats lose 10% more resources.', mods: { plunder: 0.1 } },
    talents: ['gather', 'load', 'gold'], story: 'Ilyan once bought a war, ended it, and sold the peace at a profit. Kings owe him money; that is why kings want him alive.', rival: 'rokan' },
  { id: 'rokan', name: 'Rokan', title: 'the Siege Breaker', civ: 'forge', rarity: 'legendary', spec: 'sie', role: 'Siege engines and fortress assaults',
    active: { name: 'Breach', desc: 'Doubles damage to walls this round and strikes the garrison.', effects: [{ k: 'nuke', power: 280 }, { k: 'wallburst', mult: 2 }] },
    passives: [{ name: 'Forgefather', desc: '+15% siege attack.', mods: { sieAtk: 0.15 } }, { name: 'Wallbreaker', desc: '+20% damage to walls and fortresses.', mods: { wallAtk: 0.2 }, when: 'city' }],
    ultimate: { name: 'Spoils of the Hold', desc: '+15% plunder.', mods: { plunder: 0.15 } },
    talents: ['sie', 'atk', 'city'], story: 'Rokan forged his first ram from the gate of the city that exiled him. He has been returning the favor ever since.', rival: 'orun' },
  { id: 'maelis', name: 'Maelis', title: 'the Stormcaller', civ: 'tempest', rarity: 'legendary', spec: 'arc', role: 'Ranged formations and battlefield disruption',
    active: { name: 'Tempest Call', desc: 'A storm strikes every enemy and lowers their defense 10% for 2 rounds.', effects: [{ k: 'nuke', power: 300 }, { k: 'debuff', stat: 'def', pct: 10, rounds: 2 }] },
    passives: [{ name: 'Gale Volleys', desc: '+12% Archer attack.', mods: { arcAtk: 0.12 } }, { name: 'Thunderhead', desc: 'Enemy morale drops 3 extra per round in the first three rounds.', mods: { terror: 3 } }],
    ultimate: { name: 'Eye of the Storm', desc: 'Your archers take 10% less damage.', mods: { arcDef: 0.1 } },
    talents: ['arc', 'atk', 'morale'], story: 'Maelis calls the gale and the gale answers. Sailors pray to her; generals pray she stays at sea.', rival: 'nyra' },
  { id: 'thane', name: 'Thane', title: 'the Last Oath', civ: 'oath', rarity: 'epic', spec: 'mix', role: 'Rescue, reinforcement and desperate defense',
    active: { name: 'Last Oath', desc: 'Restores 10% of troops lost; below 40% troops also +25% defense for 2 rounds.', effects: [{ k: 'heal', pct: 10 }, { k: 'buff', stat: 'def', pct: 25, rounds: 2, below: 0.4 }] },
    passives: [{ name: 'No One Left Behind', desc: '10% more casualties return as wounded.', mods: { wounded: 0.1 } }, { name: 'Shield Brother', desc: '+15% defense when reinforcing.', mods: { def: 0.15 }, when: 'reinforce' }],
    ultimate: { name: 'Oath Beyond Death', desc: 'Morale never falls below 15 while troops remain above 25%.', effects: [{ k: 'floor', morale: 15, above: 0.25 }] },
    talents: ['def', 'heal', 'reinforce'], story: 'Thane swore to hold the marches until the last fire dies. The fire is low. Thane is still there.', rival: 'darius' },
  // ---- legendary commanders of history, recruited by deeds (the same rules for AI governors and the player)
  { id: 'suntzu', name: 'Sun Tzu', title: 'the Master Strategist', civ: 'raven', rarity: 'epic', spec: 'mix', role: 'Strategy, intelligence and support',
    active: { name: 'The Art of War', desc: 'Enemy attack drops 15% and your defense rises 15% for 2 rounds.', effects: [{ k: 'debuff', stat: 'atk', pct: 15, rounds: 2 }, { k: 'buff', stat: 'def', pct: 15, rounds: 2 }] },
    passives: [{ name: 'Know Your Enemy', desc: '+20% scout accuracy and +15% counterintelligence while he leads your city.', mods: { scoutAcc: 0.2, counter: 0.15 }, steward: true }, { name: 'Supreme Excellence', desc: '+8% attack and defense in open-field battles.', mods: { atk: 0.08, def: 0.08 }, when: 'field' }],
    ultimate: { name: 'Win Without Fighting', desc: 'The enemy cannot cast its commander skill for the first 2 rounds.', effects: [{ k: 'silence', rounds: 2 }] },
    talents: ['atk', 'scout', 'rally'], story: 'Sun Tzu wrote thirteen chapters on war and believed the best of them was the one that ended a war before it began. Every general on the server owns a copy; few have finished it.', rival: 'caocao' },
  { id: 'genghis', name: 'Genghis Khan', title: 'the Great Khan', civ: 'steppe', rarity: 'legendary', spec: 'cav', role: 'Cavalry conquest and swift raids',
    active: { name: 'Storm of Hooves', desc: 'A charge that strikes hard, then a second wave the next round.', effects: [{ k: 'nuke', power: 340 }, { k: 'dot', power: 160, rounds: 1 }] },
    passives: [{ name: 'Riders of the Steppe', desc: '+12% Cavalry attack and +10% march speed.', mods: { cavAtk: 0.12, speed: 0.1 } }, { name: 'Tribute or Ruin', desc: '+15% plunder.', mods: { plunder: 0.15 } }],
    ultimate: { name: 'World Conqueror', desc: '+10% attack whenever he attacks.', mods: { atk: 0.1 }, when: 'attack' },
    talents: ['cav', 'speed', 'atk'], story: 'He united the tribes of the grass sea and rode until the maps ran out. His riders still carry three horses each, so that no one can outrun the news of their coming.', rival: 'alexander' },
  { id: 'nobunaga', name: 'Oda Nobunaga', title: 'the Demon King', civ: 'ashen', rarity: 'legendary', spec: 'arc', role: 'Ranged volleys and breaking enemy lines',
    active: { name: 'Three-Line Volley', desc: 'Three ranks fire in turn: a volley now and more over the next 2 rounds.', effects: [{ k: 'nuke', power: 220 }, { k: 'dot', power: 220, rounds: 2 }] },
    passives: [{ name: 'Matchlock Ranks', desc: '+12% Archer attack.', mods: { arcAtk: 0.12 } }, { name: 'Burning Ambition', desc: '+10% attack in battles at cities and landmarks.', mods: { atk: 0.1 }, when: 'city' }],
    ultimate: { name: 'Demon of the Sixth Heaven', desc: 'Strikes before the battle begins.', effects: [{ k: 'prestrike', power: 320 }] },
    talents: ['arc', 'atk', 'city'], story: 'Nobunaga burned what would not bend and armed his peasants with fire. He meant to unite the realm in a generation; he very nearly did.', rival: 'musashi' },
  { id: 'musashi', name: 'Miyamoto Musashi', title: 'the Sword Saint', civ: 'forge', rarity: 'epic', spec: 'inf', role: 'Infantry assaults and duels',
    active: { name: 'Two Heavens as One', desc: 'Two blades, two strikes in the same round.', effects: [{ k: 'nuke', power: 240 }, { k: 'nuke', power: 240 }] },
    passives: [{ name: 'Way of the Sword', desc: '+12% Infantry attack.', mods: { infAtk: 0.12 } }, { name: 'Book of Five Rings', desc: '+6% attack and defense in open-field battles.', mods: { atk: 0.06, def: 0.06 }, when: 'field' }],
    ultimate: { name: 'No-Mind', desc: 'Once per battle, when troops fall below half, morale recovers by 30.', effects: [{ k: 'rally', below: 0.5, morale: 30 }] },
    talents: ['inf', 'atk', 'morale'], story: 'Sixty duels, sixty victories, and a book written in a cave at the end of it. Musashi teaches that the sword is the last thing a swordsman needs.', rival: 'nobunaga' },
  { id: 'caocao', name: 'Cao Cao', title: 'the Hero of Chaos', civ: 'concord', rarity: 'legendary', spec: 'cav', role: 'Cavalry command and rallies',
    active: { name: 'Tiger and Leopard Cavalry', desc: 'A heavy charge, half again as hard against archers, and +10% Cavalry attack for 2 rounds.', effects: [{ k: 'nuke', power: 340, vs: 'arc', mult: 1.5 }, { k: 'buff', stat: 'atk', pct: 10, rounds: 2, unit: 'cav' }] },
    passives: [{ name: 'Mandate of the Strong', desc: '+12% rally capacity when he leads a rally.', mods: { rally: 0.12 }, when: 'rally' }, { name: 'Wise in Chaos', desc: '+10% Cavalry defense.', mods: { cavDef: 0.1 } }],
    ultimate: { name: 'Lord of the North', desc: '+8% attack and defense in rallies.', mods: { atk: 0.08, def: 0.08 }, when: 'rally' },
    talents: ['cav', 'rally', 'atk'], story: 'A minister in a falling empire who decided to be its last strong hand. Poets call him a villain; his soldiers called him the only lord who paid on time.', rival: 'suntzu' },
  { id: 'alexander', name: 'Alexander the Great', title: 'the Undefeated', civ: 'sunspire', rarity: 'legendary', spec: 'inf', role: 'Phalanx assaults and conquest',
    active: { name: 'Hammer and Anvil', desc: 'A crushing blow and +10 morale.', effects: [{ k: 'nuke', power: 380 }, { k: 'morale', amount: 10 }] },
    passives: [{ name: 'The Phalanx', desc: '+8% Infantry attack and defense.', mods: { infAtk: 0.08, infDef: 0.08 } }, { name: 'Never Defeated', desc: '+8% attack whenever he attacks.', mods: { atk: 0.08 }, when: 'attack' }],
    ultimate: { name: 'Beyond the Known World', desc: '+12% march speed and +10% attack in the first three rounds.', effects: [{ k: 'opening', stat: 'atk', pct: 10, rounds: 3 }], mods: { speed: 0.12 } },
    talents: ['inf', 'atk', 'speed'], story: 'He was king at twenty and had conquered the world he knew by thirty. When he reached the end of it he wept, because there was nothing left to take.', rival: 'genghis' },
  { id: 'caesar', name: 'Julius Caesar', title: 'the Dictator', civ: 'concord', rarity: 'legendary', spec: 'inf', role: 'Legion tactics and sieges',
    active: { name: 'Veni, Vidi, Vici', desc: 'A strike and +15% Infantry attack for 2 rounds.', effects: [{ k: 'nuke', power: 300 }, { k: 'buff', stat: 'atk', pct: 15, rounds: 2, unit: 'inf' }] },
    passives: [{ name: 'Legion Discipline', desc: '+12% Infantry defense.', mods: { infDef: 0.12 } }, { name: 'Siegeworks', desc: '+20% damage to walls.', mods: { wallAtk: 0.2 } }],
    ultimate: { name: 'Crossing the Rubicon', desc: 'Morale never falls below 20 while troops remain above 20%.', effects: [{ k: 'floor', morale: 20, above: 0.2 }] },
    talents: ['inf', 'def', 'city'], story: 'Caesar crossed a small river and an old republic ended on the far bank. He wrote his own history of the war, and wrote it well.', rival: 'alexander' },
  { id: 'leonidas', name: 'Leonidas', title: 'the Lion of Sparta', civ: 'bastion', rarity: 'legendary', spec: 'inf', role: 'Last stands and defense',
    active: { name: 'Hold the Pass', desc: 'Infantry gain 30% defense for 2 rounds and 6% of the fallen stand up again.', effects: [{ k: 'buff', stat: 'def', pct: 30, rounds: 2, unit: 'inf' }, { k: 'heal', pct: 6 }] },
    passives: [{ name: 'Spartan Shield', desc: '+15% defense when defending.', mods: { def: 0.15 }, when: 'defend' }, { name: 'Molon Labe', desc: '+10% Infantry attack.', mods: { infAtk: 0.1 } }],
    ultimate: { name: 'The Three Hundred', desc: 'Morale never falls below 20 while troops remain above 10%.', effects: [{ k: 'floor', morale: 20, above: 0.1 }] },
    talents: ['inf', 'def', 'city'], story: 'Three hundred held a narrow pass against an empire for three days. Leonidas asked for no more soldiers, only for the pass to stay narrow.', rival: 'alexander' },
  { id: 'cleopatra', name: 'Cleopatra', title: 'Queen of the Nile', civ: 'golden', rarity: 'legendary', spec: 'mix', role: 'Gold, gathering and the economy',
    active: { name: 'Royal Treasury', desc: 'A modest strike; plunder is 25% higher if the battle is won.', effects: [{ k: 'nuke', power: 140 }], mods: { plunder: 0.25 } },
    passives: [{ name: 'Wealth of Egypt', desc: '+15% Gold and +10% Food while she leads your city.', mods: { gold: 0.15, food: 0.1 }, steward: true }, { name: 'Grain of the Nile', desc: '+25% gathering speed.', mods: { gather: 0.25 } }],
    ultimate: { name: 'Last Pharaoh', desc: '+8% building and research speed while she leads your city.', mods: { buildSpeed: 0.08, research: 0.08 }, steward: true },
    talents: ['gather', 'gold', 'load'], story: 'She spoke nine languages and ruled the richest kingdom of her age by playing the strongest men in the world against each other. It worked until it did not.', rival: 'caesar' },
  { id: 'hannibal', name: 'Hannibal Barca', title: 'the Bane of Rome', civ: 'tempest', rarity: 'legendary', spec: 'sie', role: 'War elephants and flanking',
    active: { name: 'War Elephants', desc: 'Elephants trample the enemy and batter the walls, doubling wall damage this round.', effects: [{ k: 'nuke', power: 320 }, { k: 'wallburst', mult: 1.8 }] },
    passives: [{ name: 'Across the Alps', desc: '+15% march speed.', mods: { speed: 0.15 } }, { name: 'Cannae', desc: '+12% attack in open-field battles.', mods: { atk: 0.12 }, when: 'field' }],
    ultimate: { name: 'Double Envelopment', desc: 'A routing enemy loses 25% more troops.', mods: { pursuit: 0.25 } },
    talents: ['sie', 'speed', 'atk'], story: 'He marched elephants over the mountains and stayed fifteen years in his enemy\'s land without losing a great battle. He lost the war anyway, and never forgave the sea.', rival: 'caesar' },
  { id: 'joan', name: 'Joan of Arc', title: 'the Maid of Orleans', civ: 'dawn', rarity: 'epic', spec: 'mix', role: 'Morale, rallies and support',
    active: { name: 'Banner of Hope', desc: '+25 morale and +10% attack for 2 rounds.', effects: [{ k: 'morale', amount: 25 }, { k: 'buff', stat: 'atk', pct: 10, rounds: 2 }] },
    passives: [{ name: 'Voices', desc: '+8% Food, Wood and Stone while she leads your city.', mods: { food: 0.08, wood: 0.08, stone: 0.08 }, steward: true }, { name: 'Rally to the Banner', desc: '+10% rally capacity when she leads a rally.', mods: { rally: 0.1 }, when: 'rally' }],
    ultimate: { name: 'Saint of the Siege', desc: '+8% defense and +6% attack in rallies.', mods: { def: 0.08, atk: 0.06 }, when: 'rally' },
    talents: ['morale', 'rally', 'def'], story: 'A farm girl who walked into a war and carried its banner to the front. Soldiers who had stopped believing in anything believed in her.', rival: 'richard' },
  { id: 'richard', name: 'Richard I', title: 'the Lionheart', civ: 'dawn', rarity: 'legendary', spec: 'inf', role: 'Heavy infantry assaults',
    active: { name: 'Lionheart', desc: 'A heavy blow and +15% defense for 2 rounds.', effects: [{ k: 'nuke', power: 350 }, { k: 'buff', stat: 'def', pct: 15, rounds: 2 }] },
    passives: [{ name: 'Crusader\'s Mail', desc: '+10% Infantry defense and +5% health.', mods: { infDef: 0.1, hp: 0.05 } }, { name: 'King at the Front', desc: '+15% morale.', mods: { morale: 0.15 } }],
    ultimate: { name: 'Lion\'s Roar', desc: '+12% attack in the first three rounds.', effects: [{ k: 'opening', stat: 'atk', pct: 12, rounds: 3 }] },
    talents: ['inf', 'atk', 'morale'], story: 'Richard spent a few months of his reign at home and the rest in a saddle. His enemies admired him; his treasurers did not.', rival: 'saladin' },
  { id: 'saladin', name: 'Saladin', title: 'the Chivalrous Sultan', civ: 'sunspire', rarity: 'legendary', spec: 'cav', role: 'Cavalry, mercy and endurance',
    active: { name: 'Desert Storm', desc: 'A sweeping charge, 60% harder against archers.', effects: [{ k: 'nuke', power: 360, vs: 'arc', mult: 1.6 }] },
    passives: [{ name: 'Mercy of the Sultan', desc: '12% more of the fallen return as wounded.', mods: { wounded: 0.12 } }, { name: 'Swift Horsemen', desc: '+10% Cavalry attack.', mods: { cavAtk: 0.1 } }],
    ultimate: { name: 'Horns of Hattin', desc: '+12% defense in the first three rounds.', effects: [{ k: 'opening', stat: 'def', pct: 12, rounds: 3 }] },
    talents: ['cav', 'heal', 'def'], story: 'Saladin took back a holy city and let its defenders walk away free. His rivals feared his cavalry and trusted his word, which frightened them more.', rival: 'richard' },
  { id: 'ragnar', name: 'Ragnar Lothbrok', title: 'the Sea King', civ: 'frost', rarity: 'legendary', spec: 'inf', role: 'Raids and plunder',
    active: { name: 'Berserker Fury', desc: 'A savage strike and +20% attack for 2 rounds.', effects: [{ k: 'nuke', power: 300 }, { k: 'buff', stat: 'atk', pct: 20, rounds: 2 }] },
    passives: [{ name: 'Raider', desc: '+20% plunder.', mods: { plunder: 0.2 } }, { name: 'Child of the North', desc: '+12% defense in forests, hills and tundra.', mods: { roughDef: 0.12 } }],
    ultimate: { name: 'Valhalla Awaits', desc: 'Strikes before the battle begins.', effects: [{ k: 'prestrike', power: 280 }] },
    talents: ['inf', 'atk', 'load'], story: 'The sagas say Ragnar sailed farther than any king before him and came home richer every time. The sagas were written by people he paid.', rival: 'boudica' },
  { id: 'boudica', name: 'Boudica', title: 'the Warrior Queen', civ: 'oath', rarity: 'epic', spec: 'mix', role: 'Rebellion and defense of the homeland',
    active: { name: 'Vengeance of the Iceni', desc: 'A strike and enemy defense drops 12% for 2 rounds.', effects: [{ k: 'nuke', power: 260 }, { k: 'debuff', stat: 'def', pct: 12, rounds: 2 }] },
    passives: [{ name: 'Queen of the Tribes', desc: '+10% attack inside your guild territory.', mods: { atk: 0.1 }, when: 'territory' }, { name: 'Rise Up', desc: '+10% morale.', mods: { morale: 0.1 } }],
    ultimate: { name: 'Fury of the Iceni', desc: 'Once per battle, when troops fall below 40%, morale recovers by 30.', effects: [{ k: 'rally', below: 0.4, morale: 30 }] },
    talents: ['atk', 'territory', 'morale'], story: 'When an empire took her lands she burned three of its cities. Boudica fights for one thing: that no one takes what is hers again.', rival: 'caesar' },
];
const CMD = Object.fromEntries(COMMANDERS.map(c => [c.id, c]));
// pairs that fight better together (primary + secondary in either order)
const SYNERGY = [
  { a: 'kael', b: 'orun', name: 'Ash and Stone', mods: { def: 0.05 } },
  { a: 'amara', b: 'ilyan', name: 'Gold and Sun', mods: { atk: 0.04, load: 0.1 } },
  { a: 'temur', b: 'maelis', name: 'Storm Front', mods: { arcAtk: 0.06 } },
  { a: 'veyra', b: 'darius', name: 'Iron Dawn', mods: { atk: 0.04, morale: 0.05 } },
  { a: 'seris', b: 'nyra', name: 'Veil of Frost', mods: { def: 0.04, scoutAcc: 0.1 } },
  { a: 'rokan', b: 'veyra', name: 'Breach Doctrine', mods: { sieAtk: 0.06 } },
  { a: 'thane', b: 'kael', name: 'Oath to the Throne', mods: { def: 0.04, wounded: 0.05 } },
  { a: 'suntzu', b: 'caocao', name: 'Art of the Three Kingdoms', mods: { atk: 0.04, scoutAcc: 0.1 } },
  { a: 'genghis', b: 'saladin', name: 'Lords of the Horse', mods: { cavAtk: 0.06 } },
  { a: 'caesar', b: 'cleopatra', name: 'Rome and the Nile', mods: { def: 0.04, load: 0.1 } },
  { a: 'leonidas', b: 'alexander', name: 'Spear of Hellas', mods: { infAtk: 0.03, infDef: 0.05 } },
  { a: 'richard', b: 'joan', name: 'Crown and Banner', mods: { def: 0.03, morale: 0.06 } },
  { a: 'ragnar', b: 'boudica', name: 'Northern Fury', mods: { atk: 0.05 } },
  { a: 'nobunaga', b: 'musashi', name: 'Blade and Volley', mods: { atk: 0.04, arcAtk: 0.03 } },
  { a: 'hannibal', b: 'alexander', name: 'Masters of the Flank', mods: { atk: 0.03, pursuit: 0.1 } },
];
const CMD_MAX_LEVEL = 40;
const ULTIMATE_LEVEL = 30;
function cmdXpToNext(lv, rarity) { return Math.round((rarity === 'epic' ? 0.75 : 1) * (200 + 140 * lv + 18 * lv * lv)); }
// talent branch stat -> mods for n points (0.5% per point)
const TALENT_STATS = {
  inf: { infAtk: 0.005, infDef: 0.005 }, cav: { cavAtk: 0.005, cavDef: 0.005 }, arc: { arcAtk: 0.005, arcDef: 0.005 }, sie: { sieAtk: 0.008 },
  atk: { atk: 0.004 }, def: { def: 0.004 }, speed: { speed: 0.006 }, scout: { scoutAcc: 0.01 }, territory: { def: 0.003 }, city: { def: 0.004 },
  rally: { rally: 0.006 }, morale: { morale: 0.006 }, terrain: { roughDef: 0.006 }, gather: { gather: 0.01 }, load: { load: 0.01 }, gold: { gold: 0.006 },
  counter: { counter: 0.01 }, heal: { wounded: 0.004 }, reinforce: { def: 0.004 },
};
const TALENT_NAME = {
  inf: 'Infantry', cav: 'Cavalry', arc: 'Archery', sie: 'Siege', atk: 'Offense', def: 'Defense', speed: 'Mobility', scout: 'Reconnaissance',
  territory: 'Homeland', city: 'Fortress', rally: 'Command', morale: 'Valor', terrain: 'Terrain', gather: 'Gathering', load: 'Logistics',
  gold: 'Commerce', counter: 'Secrecy', heal: 'Mercy', reinforce: 'Shieldwall',
};
// how each commander can be recruited after the starting one (the same rules for AI governors and the player)
const RECRUIT = {
  kael: { kind: 'hall', n: 6, text: 'Raise your Town Hall to level 6.' },
  amara: { kind: 'camps', n: 8, text: 'Defeat 8 bandit camps.' },
  temur: { kind: 'scouts', n: 10, text: 'Send 10 scout reports.' },
  veyra: { kind: 'rallies', n: 2, text: 'Join or lead 2 rallies.' },
  orun: { kind: 'defenses', n: 3, text: 'Win 3 battles defending your city or a fortress.' },
  seris: { kind: 'tech', id: 'counter', n: 2, text: 'Research Counterintelligence to level 2.' },
  darius: { kind: 'wins', n: 12, text: 'Win 12 battles.' },
  nyra: { kind: 'tech', id: 'fortify', n: 2, text: 'Research Fortification to level 2.' },
  ilyan: { kind: 'traded', n: 20000, text: 'Trade 20,000 resources at the Market.' },
  rokan: { kind: 'building', id: 'workshop', n: 3, text: 'Build the Siege Workshop to level 3.' },
  maelis: { kind: 'troops', unit: 'arc', n: 3000, text: 'Train 3,000 Archers in total.' },
  thane: { kind: 'healed', n: 2000, text: 'Heal 2,000 wounded troops.' },
  // the commanders of history ask for greater deeds
  suntzu: { kind: 'tech', id: 'scouting', n: 4, text: 'Research Scouting to level 4.' },
  joan: { kind: 'rallies', n: 8, text: 'Join or lead 8 rallies.' },
  boudica: { kind: 'building', id: 'wall', n: 15, text: 'Build the City Wall to level 15.' },
  musashi: { kind: 'wins', n: 60, text: 'Win 60 battles.' },
  caocao: { kind: 'rallies', n: 15, text: 'Join or lead 15 rallies.' },
  genghis: { kind: 'camps', n: 40, text: 'Defeat 40 bandit camps.' },
  nobunaga: { kind: 'troops', unit: 'arc', n: 20000, text: 'Train 20,000 Archers in total.' },
  alexander: { kind: 'hall', n: 20, text: 'Raise your Town Hall to level 20.' },
  caesar: { kind: 'building', id: 'barracks', n: 20, text: 'Build the Barracks to level 20.' },
  leonidas: { kind: 'defenses', n: 20, text: 'Win 20 battles defending your city or a landmark.' },
  cleopatra: { kind: 'traded', n: 200000, text: 'Trade 200,000 resources at the Market.' },
  hannibal: { kind: 'building', id: 'workshop', n: 15, text: 'Build the Siege Workshop to level 15.' },
  richard: { kind: 'wins', n: 40, text: 'Win 40 battles.' },
  saladin: { kind: 'healed', n: 50000, text: 'Heal 50,000 wounded troops.' },
  ragnar: { kind: 'troops', unit: 'inf', n: 30000, text: 'Train 30,000 Infantry in total.' },
};

// ================================================================ governor archetypes
// trait template (0..1): agg aggression, risk, greed (economy focus), loyal, patience, skill, diplo, honor,
// activity (how often they decide), ambition. army: preferred troop mix. build: building weight overrides.
const ARCHETYPES = {
  economist: { name: 'Economic optimizer', t: { agg: 0.2, risk: 0.3, greed: 0.9, loyal: 0.6, patience: 0.8, skill: 0.75, diplo: 0.6, honor: 0.7, activity: 0.7, ambition: 0.5 }, army: { inf: 0.5, cav: 0.2, arc: 0.3, sie: 0 }, build: { farm: 1.4, lumber: 1.4, quarry: 1.3, mine: 1.3, market: 1.5, warehouse: 1.3, academy: 1.3 } },
  casual: { name: 'Casual builder', t: { agg: 0.15, risk: 0.3, greed: 0.5, loyal: 0.6, patience: 0.5, skill: 0.35, diplo: 0.5, honor: 0.7, activity: 0.2, ambition: 0.2 }, army: { inf: 0.5, cav: 0.25, arc: 0.25, sie: 0 }, build: { farm: 1.2, lumber: 1.2 } },
  raider: { name: 'Aggressive raider', t: { agg: 0.9, risk: 0.75, greed: 0.5, loyal: 0.4, patience: 0.3, skill: 0.6, diplo: 0.25, honor: 0.35, activity: 0.8, ambition: 0.6 }, army: { inf: 0.25, cav: 0.5, arc: 0.25, sie: 0 }, build: { stables: 1.6, barracks: 1.2, range: 1.2, hospital: 1.2 } },
  turtle: { name: 'Defensive player', t: { agg: 0.15, risk: 0.2, greed: 0.6, loyal: 0.7, patience: 0.9, skill: 0.6, diplo: 0.5, honor: 0.8, activity: 0.55, ambition: 0.3 }, army: { inf: 0.6, cav: 0.1, arc: 0.3, sie: 0 }, build: { wall: 1.8, tower: 1.4, hospital: 1.4, warehouse: 1.4 } },
  competitor: { name: 'Competitive powerhouse', t: { agg: 0.7, risk: 0.55, greed: 0.7, loyal: 0.5, patience: 0.6, skill: 0.85, diplo: 0.4, honor: 0.5, activity: 0.95, ambition: 0.9 }, army: { inf: 0.35, cav: 0.35, arc: 0.3, sie: 0 }, build: { hall: 1.3, academy: 1.3 } },
  optimizer: { name: 'Efficient free player', t: { agg: 0.45, risk: 0.4, greed: 0.8, loyal: 0.6, patience: 0.75, skill: 0.85, diplo: 0.5, honor: 0.65, activity: 0.8, ambition: 0.6 }, army: { inf: 0.35, cav: 0.3, arc: 0.35, sie: 0 }, build: { academy: 1.4, farm: 1.2 } },
  diplomat: { name: 'Diplomat', t: { agg: 0.2, risk: 0.35, greed: 0.5, loyal: 0.75, patience: 0.7, skill: 0.6, diplo: 0.95, honor: 0.85, activity: 0.6, ambition: 0.6 }, army: { inf: 0.45, cav: 0.25, arc: 0.3, sie: 0 }, build: { market: 1.4, tower: 1.2 } },
  explorer: { name: 'Explorer', t: { agg: 0.35, risk: 0.6, greed: 0.5, loyal: 0.5, patience: 0.5, skill: 0.55, diplo: 0.55, honor: 0.6, activity: 0.65, ambition: 0.4 }, army: { inf: 0.3, cav: 0.45, arc: 0.25, sie: 0 }, build: { tower: 1.6, stables: 1.2 } },
  opportunist: { name: 'Opportunist', t: { agg: 0.6, risk: 0.5, greed: 0.65, loyal: 0.25, patience: 0.4, skill: 0.6, diplo: 0.5, honor: 0.25, activity: 0.7, ambition: 0.6 }, army: { inf: 0.3, cav: 0.4, arc: 0.3, sie: 0 }, build: {} },
  tactician: { name: 'Tactical specialist', t: { agg: 0.6, risk: 0.45, greed: 0.5, loyal: 0.6, patience: 0.7, skill: 0.9, diplo: 0.45, honor: 0.6, activity: 0.8, ambition: 0.55 }, army: { inf: 0.34, cav: 0.33, arc: 0.33, sie: 0 }, build: { academy: 1.3, tower: 1.2 } },
  rallylead: { name: 'Rally leader', t: { agg: 0.75, risk: 0.55, greed: 0.5, loyal: 0.75, patience: 0.6, skill: 0.75, diplo: 0.55, honor: 0.65, activity: 0.85, ambition: 0.75 }, army: { inf: 0.35, cav: 0.25, arc: 0.25, sie: 0.15 }, build: { workshop: 1.4, barracks: 1.2 } },
  mercenary: { name: 'Mercenary', t: { agg: 0.8, risk: 0.65, greed: 0.7, loyal: 0.15, patience: 0.4, skill: 0.65, diplo: 0.35, honor: 0.2, activity: 0.75, ambition: 0.4 }, army: { inf: 0.3, cav: 0.45, arc: 0.25, sie: 0 }, build: { stables: 1.3 } },
  emperor: { name: 'Ambitious empire builder', t: { agg: 0.65, risk: 0.5, greed: 0.65, loyal: 0.45, patience: 0.65, skill: 0.75, diplo: 0.6, honor: 0.5, activity: 0.85, ambition: 1 }, army: { inf: 0.35, cav: 0.3, arc: 0.25, sie: 0.1 }, build: { hall: 1.3, workshop: 1.2 } },
};
const ARCH_KEYS = Object.keys(ARCHETYPES);
// how many of each archetype a server of 599 AI governors gets (weights, normalized at generation)
const ARCH_MIX = { economist: 55, casual: 90, raider: 50, turtle: 55, competitor: 25, optimizer: 55, diplomat: 40, explorer: 35, opportunist: 50, tactician: 35, rallylead: 30, mercenary: 34, emperor: 45 };

// ================================================================ server identity (one server in this version)
const SERVER = {
  id: 'ashen-crown', name: 'Ashen Crown', motto: 'Established powers and central political blocs.',
  regions: REGIONS.map(r => r.name),
  guilds: [
    { name: 'Crown of Cinders', tag: 'CRN', color: '#d4573b', emblem: 'crown' },
    { name: 'Iron Covenant', tag: 'ICV', color: '#8796a6', emblem: 'anvil' },
    { name: 'Sable Wolves', tag: 'SBW', color: '#5b5f8c', emblem: 'wolf' },
    { name: 'The Gilded Hand', tag: 'GLD', color: '#e2b84a', emblem: 'hand' },
    { name: 'Emberguard', tag: 'EMB', color: '#e8833a', emblem: 'flame' },
    { name: 'Stormbreakers', tag: 'STB', color: '#4fa3c7', emblem: 'bolt' },
    { name: 'Order of the Oath', tag: 'OTH', color: '#7da35f', emblem: 'shield' },
    { name: 'Ravenmark', tag: 'RVN', color: '#9a6fc0', emblem: 'raven' },
    { name: 'Sunfire Legion', tag: 'SUN', color: '#f0d36b', emblem: 'sun' },
    { name: 'Frostfang', tag: 'FRF', color: '#a9d8e6', emblem: 'fang' },
  ],
  // initial power concentration: the first two guilds start as established blocs
  bloc: [1.35, 1.25, 1.05, 1, 1, 0.95, 0.95, 0.9, 0.85, 0.8],
};
const GUILD_MAX = 60;
const GUILD_COUNT = 10;
const GOVERNORS = 600;
const OFFICERS_MAX = 4;
const THRONE_OPENS = 3 * DAY;      // the Capital can be attacked from Day 4
const THRONE_HOLD = 3 * DAY;       // a guild that holds the Capital this long wins the Age
const EXCHANGE = { hall: 20, market: 20, cost: { gold: 1500000, stone: 2000000, wood: 2000000 }, minutes: 2 * DAY };
const NEWCOMER_SHIELD = 2 * DAY;
// a queue this close to its end can be finished at once, free (players and AI governors alike)
const FREE_FINISH = 10;
// every producing building fills a crate every 4 game hours with 1 hour of its output; tap it to collect
const CRATE = { every: 4 * HOUR, hours: 1 };
const SHIELD = { minutes: 8 * HOUR, cooldown: 24 * HOUR };

// ================================================================ names
const SYL = {
  ashen: [['Kor', 'Val', 'Ash', 'Mor', 'Dra', 'Cin', 'Vor', 'Bra', 'Hal', 'Sev'], ['ric', 'an', 'eth', 'ous', 'en', 'ar', 'ius', 'orn', 'ex', 'ald']],
  sunspire: [['Za', 'Ka', 'Nas', 'Sa', 'Ra', 'Ta', 'Ama', 'Fa', 'Lei', 'Da'], ['rin', 'lim', 'hir', 'ra', 'shan', 'mir', 'dar', 'zia', 'la', 'yan']],
  steppe: [['Bat', 'Tor', 'Ara', 'Khu', 'Jal', 'Ulz', 'Mer', 'Sor', 'Tem', 'Bor'], ['khan', 'gai', 'tai', 'ul', 'chin', 'bek', 'gir', 'dai', 'an', 'ur']],
  concord: [['Ver', 'Lis', 'Cal', 'Hen', 'Mar', 'Ot', 'Bel', 'Wil', 'Ad', 'Fen'], ['ra', 'ton', 'ick', 'is', 'ola', 'win', 'aine', 'mond', 'en', 'ley']],
  bastion: [['Gor', 'Thu', 'Bal', 'Dur', 'Gra', 'Hol', 'Bru', 'Tor', 'Kel', 'Dun'], ['in', 'ak', 'grim', 'stan', 'mar', 'dor', 'en', 'rok', 'vil', 'ard']],
  raven: [['Ser', 'Mal', 'Vey', 'Nox', 'Isa', 'Cor', 'Lyr', 'Ves', 'Ael', 'Dra'], ['is', 'ith', 'ane', 'iel', 'ora', 'vin', 'ys', 'ette', 'en', 'iss']],
  dawn: [['Al', 'Cas', 'Dar', 'Leo', 'Mar', 'Ser', 'Aur', 'Gal', 'Hel', 'Val'], ['ius', 'an', 'cus', 'ian', 'ena', 'ia', 'or', 'ric', 'eus', 'ine']],
  frost: [['Nyr', 'Sig', 'Ing', 'Ast', 'Hel', 'Run', 'Eir', 'Sol', 'Bry', 'Tor'], ['a', 'rid', 'vald', 'rin', 'ga', 'ulf', 'dis', 'veig', 'hild', 'mund']],
  golden: [['Il', 'Ori', 'Bel', 'Cor', 'Dov', 'Lu', 'Mer', 'Pell', 'Sab', 'Tev'], ['yan', 'cio', 'ardo', 'enzo', 'ina', 'etta', 'ius', 'ano', 'ari', 'ello']],
  forge: [['Rok', 'Bor', 'Hag', 'Gun', 'Kra', 'Mag', 'Thr', 'Ulf', 'Dra', 'Bal'], ['an', 'nir', 'gar', 'dek', 'unn', 'olf', 'rik', 'mar', 'in', 'grad']],
  tempest: [['Mae', 'Cor', 'Ny', 'Sel', 'Tor', 'Ael', 'Bri', 'Ish', 'Ka', 'Lo'], ['lis', 'al', 'wen', 'ra', 'enn', 'mira', 'ys', 'tha', 'rel', 'ani']],
  oath: [['Tha', 'Ed', 'Os', 'God', 'Wul', 'Ber', 'Aed', 'Cyn', 'Ead', 'Ros'], ['ne', 'ric', 'wyn', 'mund', 'stan', 'helm', 'gar', 'wald', 'ith', 'a']],
};
const EPITHETS = ['the Bold', 'the Patient', 'the Red', 'the Quiet', 'Ironhand', 'the Wanderer', 'Oathkeeper', 'the Cunning', 'Ashborn', 'the Elder', 'the Young', 'Stormborn',
  'the Fair', 'Grimjaw', 'the Wise', 'Half-Hand', 'the Unbowed', 'Goldtongue', 'the Grey', 'Frostbeard', 'the Tall', 'the Lucky', 'Blackcloak', 'Emberheart'];
const BACKGROUNDS = ['a former river smuggler', 'the heir of a fallen house', 'a disgraced general', 'a farmer who never wanted war', 'a retired caravan guard',
  'a scholar of old maps', 'a mercenary captain', 'a temple orphan', 'a former tax collector', 'a bandit who went straight', 'a younger son with nothing to inherit',
  'a widow who kept her husband\'s banner', 'a shipwright from the frozen lakes', 'a mine foreman', 'an exiled courtier', 'a horse breeder', 'a famous duelist',
  'a reformed spy', 'a frontier sheriff', 'a master builder', 'a poet with a sharp sword', 'a quartermaster of the old wars', 'a hunter from the far north', 'a merchant\'s daughter'];
const ROLE_NAME = { leader: 'Leader', officer: 'Officer', member: 'Member' };
