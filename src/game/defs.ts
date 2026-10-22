import type { BuildingId, FactionId, LawCategory, ShipType, TechCategory, Terrain, TradeGoodId, UnitType } from './types';

/** Additive bonuses granted by technologies, laws and buildings. All values are fractions. */
export interface Bonuses {
  taxEff?: number;        // collection efficiency
  trade?: number;         // trade income multiplier
  productivity?: number;  // province output (GDP) multiplier
  growth?: number;        // annual population growth (absolute, e.g. 0.001 = +0.1%/yr)
  research?: number;
  land?: number;          // land combat strength
  naval?: number;
  siege?: number;
  fortDefense?: number;
  movement?: number;
  manpower?: number;
  food?: number;
  construction?: number;  // construction speed
  corruption?: number;    // monthly drift (negative is good)
  stability?: number;     // stability target bonus
  legitimacy?: number;
  unrest?: number;        // flat unrest modifier (negative good)
  attrition?: number;     // reduction of attrition
  recruitCost?: number;   // reduction
  upkeep?: number;        // reduction of army upkeep
  factory?: number;       // industrial output bonus
  morale?: number;
  diplomacy?: number;     // acceptance bonus (points)
  espionage?: number;
}

export interface TechDef {
  id: string;
  name: string;
  category: TechCategory;
  year: number; // historical year of practical availability
  cost: number; // research points
  requires: string[];
  needsResource?: TradeGoodId[];
  needsLaw?: { category: LawCategory; options: string[] };
  bonuses: Bonuses;
  unlocks?: string[]; // building ids, law option ids, unit ids
  description: string;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  category: 'infrastructure' | 'agriculture' | 'industry' | 'society' | 'military';
  cost: number; // base £k
  months: number;
  labor: number; // thousand workers
  upkeep: number;
  max: number;
  requiresTech?: string;
  coastal?: boolean;
  needsGood?: TradeGoodId[];
  needsAccess?: TradeGoodId[]; // province or country access to these goods
  bonuses: Bonuses; // per level, applied to province (productivity/trade/food/unrest/manpower) or country (research etc.)
  description: string;
}

export interface LawOption {
  id: string;
  name: string;
  description: string;
  requiresTech?: string;
  requiresType?: string[]; // polity types allowed
  bonuses: Bonuses;
  factions: Partial<Record<FactionId, number>>; // loyalty target shift
  influence?: Partial<Record<FactionId, number>>;
  mobilization?: number; // manpower share of population (military laws)
  quality?: number; // combat quality multiplier (military laws)
  researchMult?: number; // education laws
  costMult?: number;
}

export interface LawCategoryDef {
  id: LawCategory;
  name: string;
  options: LawOption[];
}

export interface UnitDef {
  id: UnitType;
  name: string;
  attack: number;
  defense: number;
  upkeep: number;
  cost: number;
  months: number;
  manpower: number; // thousands of men per regiment
  siege: number;
  speed: number;
  terrainBonus: Partial<Record<Terrain, number>>;
}

export interface ShipDef {
  id: ShipType;
  name: string;
  power: number;
  upkeep: number;
  cost: number;
  months: number;
  capacity: number; // regiments carried
  requiresTech?: string;
}
