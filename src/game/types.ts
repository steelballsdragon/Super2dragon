// Core type definitions for THRONES OF THE WORLD: 1800.
// Static data (definitions) is kept separate from dynamic, serializable world state.

export type Continent = 'Europe' | 'Asia' | 'Africa' | 'North America' | 'South America' | 'Oceania';

export type Terrain =
  | 'plains' | 'farmland' | 'hills' | 'mountains' | 'forest' | 'jungle'
  | 'desert' | 'steppe' | 'savanna' | 'marsh' | 'tundra';

export type TradeGoodId =
  | 'grain' | 'rice' | 'cotton' | 'textiles' | 'silk' | 'spices' | 'tea' | 'sugar'
  | 'tobacco' | 'coffee' | 'cocoa' | 'iron' | 'coal' | 'copper' | 'timber' | 'furs'
  | 'fish' | 'wool' | 'wine' | 'salt' | 'horses' | 'livestock' | 'ivory' | 'gold'
  | 'silver' | 'opium' | 'indigo' | 'porcelain' | 'naval_stores' | 'gems';

export type Religion =
  | 'catholic' | 'protestant' | 'orthodox' | 'oriental' | 'sunni' | 'shia' | 'ibadi' | 'zaydi'
  | 'hindu' | 'sikh' | 'jain' | 'theravada' | 'mahayana' | 'vajrayana' | 'confucian' | 'shinto'
  | 'jewish' | 'traditional';

/** Broad cultural/linguistic family used for name generation and portrait attire. */
export type CultureGroup =
  | 'british' | 'french' | 'german' | 'dutch' | 'iberian' | 'italian' | 'nordic' | 'slavic'
  | 'hungarian' | 'greek' | 'turkic' | 'persian' | 'arab' | 'afghan' | 'south_asian' | 'sikh'
  | 'himalayan' | 'chinese' | 'mongol' | 'korean' | 'japanese' | 'vietnamese' | 'tai' | 'burmese'
  | 'malay' | 'ethiopian' | 'west_african' | 'sahelian' | 'bantu' | 'swahili' | 'malagasy'
  | 'american' | 'latin_american' | 'indigenous_american' | 'polynesian' | 'melanesian'
  | 'aboriginal' | 'caucasian' | 'central_asian';

export type PolityType =
  | 'monarchy'          // hereditary kingdoms, empires, sultanates, principalities
  | 'republic'
  | 'theocracy'         // ecclesiastical states, imamates, lama-governed states
  | 'chartered_company' // trading companies ruling territory
  | 'colony'            // colonial administrations (viceroyalties, captaincies, governorships)
  | 'confederation'     // confederacies of member polities or nations
  | 'nomadic'           // pastoral/nomadic confederations
  | 'decentralized'     // chiefdom networks, kin-based and stateless societies
  | 'city_state'
  | 'feudal';           // shogunal or regency systems with dominant regional lords

export type SubjectType =
  | 'colony' | 'chartered_company' | 'personal_union' | 'vassal' | 'tributary' | 'protectorate'
  | 'subsidiary_ally' | 'confederation_member' | 'client_state' | 'autonomous_pashalik' | 'nominal_vassal';

export type TechProfile =
  | 'britain' | 'western_europe' | 'central_europe' | 'eastern_europe' | 'ottoman' | 'persian'
  | 'south_asia' | 'east_asia' | 'japan' | 'southeast_asia' | 'north_africa' | 'west_africa'
  | 'east_africa' | 'southern_africa' | 'usa' | 'colonial_americas' | 'indigenous' | 'pacific'
  | 'steppe';

export type PortraitStyle =
  | 'euro' | 'euro_mil' | 'euro_crown' | 'euro_female' | 'cleric' | 'turban' | 'ottoman'
  | 'persian' | 'arab' | 'sikh' | 'rajput' | 'qing' | 'joseon' | 'japan' | 'sea_asian'
  | 'african' | 'african_crown' | 'steppe' | 'council' | 'republic' | 'himalayan';

export type LawCategory =
  | 'government' | 'administration' | 'taxation' | 'military' | 'economy' | 'labor' | 'religion' | 'education';

export type FactionId = 'nobility' | 'clergy' | 'military' | 'merchants' | 'commons' | 'reformers';

export type MinisterRole = 'finance' | 'foreign' | 'military' | 'admin' | 'intelligence';

export type UnitType = 'infantry' | 'cavalry' | 'artillery' | 'irregulars';
export type ShipType = 'line' | 'frigate' | 'transport';

export type BuildingId =
  | 'road' | 'canal' | 'port' | 'shipyard' | 'irrigation' | 'granary' | 'market' | 'workshop'
  | 'textile_mill' | 'ironworks' | 'mine' | 'steam_works' | 'school' | 'university' | 'hospital'
  | 'courthouse' | 'temple' | 'fortress' | 'barracks' | 'arsenal';

export type TechCategory =
  | 'agriculture' | 'medicine' | 'industry' | 'steam' | 'metallurgy' | 'education'
  | 'shipbuilding' | 'military' | 'administration' | 'commerce';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Ruler definition tuple: [name, birthYear, admin, diplomacy, military, dynasty?, female?] */
export type RulerTuple = [string, number, number, number, number, string?, boolean?];

export interface PolityDef {
  id: string;
  name: string;
  short: string;
  adjective: string;
  aliases: string[];
  continent: Continent;
  region: string;
  polityType: PolityType;
  government: string;
  rulerTitle: string;
  ruler: RulerTuple;
  heir?: RulerTuple;
  capital: string;
  capitalName: string;
  culture: string;
  cultureGroup: CultureGroup;
  religion: Religion;
  population: number; // people
  gdpPc: number; // annual output per head, in pounds sterling (1800)
  taxRate: number;
  efficiency: number;
  treasury: number; // £ thousands
  debt: number; // £ thousands of long-term debt
  army?: [number, number, number, number]; // regiments (1,000 men) inf, cav, art, irregulars
  navy?: [number, number, number];
  techProfile: TechProfile;
  extraTechs: string[];
  overlord?: string;
  subjectType?: SubjectType;
  memberships: string[];
  color: string;
  flag: string;
  portrait: PortraitStyle;
  difficulty: number; // 1..5
  intro: string;
  playable: boolean;
  aggregate: boolean;
  dormant: boolean;
  rivals: string[];
  allies: string[];
  personality: AIPersonality;
  laws: Partial<Record<LawCategory, string>>;
  stability: number;
  legitimacy: number;
  prestige: number;
  corruption: number;
}

export interface AIPersonality {
  aggression: number; // 0..1
  diplomacy: number;
  mercantile: number;
  reform: number;
  caution: number;
}

/** Province seed tuple: [id, name, lon, lat, owner, terrain, good, weight, extraSeeds?] */
export type ProvinceSeed = [string, string, number, number, string | null, Terrain, TradeGoodId, number, ([number, number][] | undefined)?];

export interface ProvinceDef {
  id: string;
  name: string;
  lon: number;
  lat: number;
  terrain: Terrain;
  good: TradeGoodId;
  weight: number;
  startOwner: string | null;
  tradeNode: string;
}

export interface OutpostDef {
  id: string;
  name: string;
  lon: number;
  lat: number;
  owner: string;
  controller?: string;
  kind: 'fort' | 'factory' | 'port' | 'naval_base';
  good: TradeGoodId;
  note: string;
}

export interface SeaZoneDef {
  id: string;
  name: string;
  lon: number;
  lat: number;
  frozen?: boolean;
}

export interface TradeNodeDef {
  id: string;
  name: string;
  lon: number;
  lat: number;
  downstream: string[];
  endNode?: boolean;
}

// ---------------------------------------------------------------------------
// Geometry generated by scripts/build-map.ts
// ---------------------------------------------------------------------------

export interface ProvinceGeometry {
  d: string;
  lx: number; ly: number; // label point
  cx: number; cy: number; // centroid
  area: number;
  bbox: [number, number, number, number];
  coastal: boolean;
  port: [number, number] | null;
  seas: string[];
  marker?: boolean; // island too small for the base coastline data
}

export interface MapGeometry {
  width: number;
  height: number;
  projection: { scale: number; translate: [number, number]; rotate: number };
  provinces: Record<string, ProvinceGeometry>;
  edges: { a: string; b: string; d: string; len: number }[];
  adjacency: Record<string, string[]>;
  seas: Record<string, { d: string; cx: number; cy: number }>;
  seaAdjacency: Record<string, string[]>;
  seaBorders: string;
  graticule: string;
  outline: string;
}

// ---------------------------------------------------------------------------
// Dynamic world state (serialized in saves)
// ---------------------------------------------------------------------------

export interface Loan {
  id: string;
  principal: number;
  rate: number; // annual interest
  monthsLeft: number | null; // null = perpetual (consolidated national debt)
  lender: string;
}

export interface Ledger {
  tax: number;
  trade: number;
  tariffs: number;
  tribute: number;
  subsidies: number;
  other: number;
  army: number;
  navy: number;
  buildings: number;
  administration: number;
  research: number;
  espionage: number;
  interest: number;
  tributePaid: number;
  subsidiesPaid: number;
  diplomacy: number;
  income: number;
  expenses: number;
  balance: number;
}

export interface Modifier {
  id: string;
  label: string;
  monthsLeft: number;
  tax?: number; // multiplicative bonus e.g. -0.1
  trade?: number;
  stability?: number; // monthly drift
  unrest?: number;
  growth?: number;
  research?: number;
  morale?: number;
  food?: number;
}

export interface CountryState {
  id: string;
  alive: boolean;
  treasury: number;
  /** Revenue the tax model does not capture (crown domains, monopolies, salt and customs farms, tribute in kind), fixed at the start. */
  revenueMod: number;
  loans: Loan[];
  inflation: number;
  taxRate: number;
  tariff: number;
  budget: { research: number; espionage: number; administration: number };
  stability: number;
  legitimacy: number;
  prestige: number;
  corruption: number;
  warExhaustion: number;
  manpower: number; // thousands of men
  rulerId: string;
  heirId?: string;
  consortId?: string;
  /** Living princes and princesses of the ruling house, other than the sovereign. */
  family: string[];
  ministers: Partial<Record<MinisterRole, string>>;
  techs: string[];
  research: { tech: string | null; progress: number };
  laws: Record<LawCategory, string>;
  lawReform?: { category: LawCategory; option: string; monthsLeft: number; total: number };
  factions: Record<FactionId, { influence: number; loyalty: number }>;
  overlord?: string;
  subjectType?: SubjectType;
  liberty: number;
  capital: string;
  foodStock: number; // months of reserve
  cycle: number; // -1 (recession) .. +1 (boom)
  spy: Record<string, number>;
  counterIntel: number;
  envoys: string[]; // targets of improve-relations missions
  rivals: string[];
  infamy: number;
  claims: string[];
  modifiers: Modifier[];
  last: Ledger;
  ai: { nextWarCheck: number; stance: 'expand' | 'consolidate' | 'defend' | 'reform'; lastPeaceOffer: number };
  stats: { battlesWon: number; battlesLost: number; provincesGained: number; provincesLost: number };
}

export interface ProvinceState {
  id: string;
  owner: string | null;
  controller: string | null;
  pop: number; // thousands
  gdpPc: number;
  buildings: Partial<Record<BuildingId, number>>;
  fort: number;
  unrest: number;
  cores: string[];
  devastation: number;
  culture: string;
  religion: Religion;
  siege?: { by: string; progress: number };
}

export interface OutpostState {
  id: string;
  owner: string;
  controller: string;
}

export interface Character {
  id: string;
  name: string;
  dynasty?: string;
  country: string;
  role: 'ruler' | 'heir' | 'consort' | 'family' | 'minister' | 'general' | 'admiral';
  /** The sovereign this character is a child of. */
  parentId?: string;
  /** Polity a consort was born in, when they married in from abroad. */
  origin?: string;
  office?: MinisterRole;
  born: number;
  female: boolean;
  health: number; // 0..100
  adm: number; dip: number; mil: number; // 0..10
  traits: string[];
  loyalty: number;
  ambition: number;
  alive: boolean;
  portraitSeed: number;
  personality?: string;
}

export interface UnitCounts { infantry: number; cavalry: number; artillery: number; irregulars: number }
export interface ShipCounts { line: number; frigate: number; transport: number }

export interface Army {
  id: string;
  owner: string;
  name: string;
  location: string;
  units: UnitCounts;
  morale: number; // 0..1
  experience: number; // 0..1
  general?: string;
  path: string[];
  progress: number;
  status: 'idle' | 'moving' | 'sieging' | 'retreating' | 'embarked';
  fleet?: string;
  rebel?: { against: string; cause: string };
  lastBattle?: number;
}

export interface Fleet {
  id: string;
  owner: string;
  name: string;
  location: string; // sea zone id
  ships: ShipCounts;
  morale: number;
  admiral?: string;
  path: string[];
  progress: number;
  mission: 'idle' | 'patrol' | 'blockade' | 'transport';
  carrying: string[];
  landingTarget?: string;
}

export type WarGoal =
  | { type: 'conquest'; province: string }
  | { type: 'subjugate' }
  | { type: 'tribute' }
  | { type: 'independence' }
  | { type: 'humiliate' }
  | { type: 'suppress'; rebels: string };

export interface War {
  id: string;
  name: string;
  attackers: string[];
  defenders: string[];
  attackerLeader: string;
  defenderLeader: string;
  goal: WarGoal;
  start: number;
  battleScore: number; // accumulated, attacker perspective
  score: number; // computed, -100..100 attacker perspective
  lastScoreChange: number;
}

export type TreatyType = 'alliance' | 'trade' | 'marriage' | 'guarantee' | 'nap' | 'truce' | 'subsidy' | 'access';

export interface Treaty {
  id: string;
  type: TreatyType;
  a: string;
  b: string;
  start: number;
  expires?: number;
  amount?: number; // subsidy per month from a to b
}

export interface ConstructionItem {
  id: string;
  country: string;
  province: string;
  building: BuildingId;
  progress: number; // months of full-labour work done
  total: number;
  labor: number; // thousand workers required
}

export interface RecruitItem {
  id: string;
  country: string;
  province: string;
  kind: 'unit' | 'ship';
  unit: UnitType | ShipType;
  count: number;
  monthsLeft: number;
}

export interface EventInstance {
  id: string;
  defId: string;
  country: string;
  turn: number;
  ctx: Record<string, string | number>;
}

export type OfferKind = 'alliance' | 'trade' | 'marriage' | 'peace' | 'tribute_demand' | 'subsidy_request' | 'call_to_arms' | 'congress' | 'vassalage';

export interface PeaceTerms {
  provinces: string[]; // ceded by loser to winner side leader
  reparations: number; // lump sum £k
  tribute: boolean; // loser becomes tributary
  subjugate: boolean;
  independence: boolean; // release the subject at war
  humiliate: boolean;
}

export interface Offer {
  id: string;
  from: string;
  to: string;
  kind: OfferKind;
  turn: number;
  expires: number;
  warId?: string;
  terms?: PeaceTerms;
  amount?: number;
  text: string;
}

export interface ChronicleEntry {
  turn: number;
  text: string;
  category: 'war' | 'diplomacy' | 'court' | 'economy' | 'disaster' | 'discovery' | 'revolution' | 'construction' | 'peace' | 'player';
  countries: string[];
  importance: 1 | 2 | 3;
}

export interface BattleSide {
  owner: string;
  general?: string;
  start: number; // men (thousands)
  losses: number;
}

export interface BattleReport {
  id: string;
  turn: number;
  kind: 'land' | 'naval' | 'siege';
  location: string; // province or sea zone
  attacker: BattleSide;
  defender: BattleSide;
  winner: 'attacker' | 'defender';
  warId?: string;
  name: string;
}

export interface GameNotification {
  id: string;
  turn: number;
  text: string;
  kind: 'info' | 'warning' | 'danger' | 'success';
  read: boolean;
}

export interface HistoryPoint {
  turn: number;
  treasury: number;
  income: number;
  expenses: number;
  population: number;
  stability: number;
  armySize: number;
  research: number;
}

export interface PlayerDecision {
  turn: number;
  summary: string;
}

export interface RngState { a: number; b: number; c: number; d: number }

export interface WorldState {
  schemaVersion: number;
  campaign: { id: string; name: string; created: number; seed: number; difficulty: Difficulty };
  rng: RngState;
  turn: number; // months since January 1800
  playerId: string;
  countries: Record<string, CountryState>;
  provinces: Record<string, ProvinceState>;
  outposts: Record<string, OutpostState>;
  characters: Record<string, Character>;
  armies: Record<string, Army>;
  fleets: Record<string, Fleet>;
  wars: Record<string, War>;
  treaties: Treaty[];
  relations: Record<string, number>;
  construction: ConstructionItem[];
  recruitment: RecruitItem[];
  pendingEvents: EventInstance[];
  eventMemory: Record<string, number>;
  offers: Offer[];
  chronicle: ChronicleEntry[];
  battles: BattleReport[];
  notifications: GameNotification[];
  prices: Record<TradeGoodId, number>;
  playerHistory: HistoryPoint[];
  decisions: PlayerDecision[];
  nextId: number;
  flags: Record<string, number | string | boolean>;
  settings: { pauseOnEvents: boolean; autosaveMonths: number };
}
