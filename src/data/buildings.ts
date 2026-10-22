import type { BuildingDef, ShipDef, UnitDef } from '../game/defs';
import type { BuildingId, ShipType, UnitType } from '../game/types';

export const BUILDINGS: BuildingDef[] = [
  { id: 'road', name: 'Post Roads', category: 'infrastructure', cost: 30, months: 6, labor: 6, upkeep: 0.3, max: 3, bonuses: { movement: 0.15, trade: 0.04, taxEff: 0.01 }, description: 'Graded, metalled roads speed armies, couriers and carts.' },
  { id: 'canal', name: 'Canal', category: 'infrastructure', cost: 140, months: 20, labor: 15, upkeep: 1, max: 1, requiresTech: 'cartography', bonuses: { trade: 0.18, food: 0.05, productivity: 0.03 }, description: 'Navigable waterways carry bulk goods at a fraction of overland cost.' },
  { id: 'port', name: 'Harbour', category: 'infrastructure', cost: 45, months: 8, labor: 4, upkeep: 0.5, max: 2, coastal: true, bonuses: { trade: 0.1 }, description: 'Quays, warehouses and a customs house. Required to build ships.' },
  { id: 'shipyard', name: 'Naval Dockyard', category: 'military', cost: 90, months: 12, labor: 6, upkeep: 1, max: 1, coastal: true, requiresTech: 'ship_of_the_line', bonuses: { naval: 0.03 }, description: 'Dry docks and ropewalks for building warships faster.' },
  { id: 'irrigation', name: 'Irrigation Works', category: 'agriculture', cost: 60, months: 12, labor: 10, upkeep: 0.4, max: 2, requiresTech: 'irrigation_engineering', bonuses: { food: 0.15, productivity: 0.03 }, description: 'Tanks, channels and wells that secure the harvest.' },
  { id: 'granary', name: 'Public Granary', category: 'agriculture', cost: 20, months: 4, labor: 2, upkeep: 0.2, max: 1, bonuses: { food: 0.03 }, description: 'Stores against famine: raises the national food reserve.' },
  { id: 'market', name: 'Market Hall', category: 'infrastructure', cost: 35, months: 6, labor: 2, upkeep: 0.3, max: 2, bonuses: { trade: 0.12, taxEff: 0.02 }, description: 'Regulated markets, fairs and merchant exchanges.' },
  { id: 'workshop', name: 'Manufactory', category: 'industry', cost: 40, months: 8, labor: 3, upkeep: 0.4, max: 2, bonuses: { productivity: 0.06 }, description: 'Centralised workshops of artisans under one roof.' },
  { id: 'textile_mill', name: 'Textile Mills', category: 'industry', cost: 140, months: 18, labor: 6, upkeep: 1.2, max: 3, requiresTech: 'mechanized_spinning', needsAccess: ['cotton', 'wool', 'silk'], bonuses: { productivity: 0.15, trade: 0.05 }, description: 'Water- or steam-powered spinning and weaving mills.' },
  { id: 'ironworks', name: 'Ironworks', category: 'industry', cost: 160, months: 20, labor: 7, upkeep: 1.5, max: 3, requiresTech: 'coke_smelting', needsAccess: ['iron', 'coal'], bonuses: { productivity: 0.12, recruitCost: 0.04 }, description: 'Coke furnaces, forges and rolling mills.' },
  { id: 'mine', name: 'Deep Mines', category: 'industry', cost: 60, months: 10, labor: 5, upkeep: 0.6, max: 2, needsGood: ['iron', 'coal', 'copper', 'gold', 'silver', 'gems', 'salt'], bonuses: { trade: 0.3, productivity: 0.04 }, description: 'Shafts, pumps and adits to reach deeper seams.' },
  { id: 'steam_works', name: 'Steam Engine Works', category: 'industry', cost: 220, months: 24, labor: 8, upkeep: 2, max: 2, requiresTech: 'watt_engine', needsAccess: ['coal'], bonuses: { productivity: 0.12, factory: 0.05 }, description: 'Engine shops that power mills, mines and foundries.' },
  { id: 'school', name: 'Schools', category: 'society', cost: 25, months: 6, labor: 1, upkeep: 0.4, max: 3, bonuses: { research: 0.03 }, description: 'Elementary schools that teach reading, writing and reckoning.' },
  { id: 'university', name: 'University', category: 'society', cost: 120, months: 24, labor: 2, upkeep: 1.5, max: 1, requiresTech: 'academies', bonuses: { research: 0.12 }, description: 'A seat of higher learning and research.' },
  { id: 'hospital', name: 'Hospital', category: 'society', cost: 40, months: 8, labor: 1, upkeep: 0.5, max: 2, bonuses: { growth: 0.0008 }, description: 'Hospitals and dispensaries reduce mortality.' },
  { id: 'courthouse', name: 'Courthouse & Intendancy', category: 'society', cost: 30, months: 6, labor: 1, upkeep: 0.4, max: 2, bonuses: { unrest: -5, taxEff: 0.02, corruption: -0.02 }, description: 'Royal courts and administrative offices.' },
  { id: 'temple', name: 'Religious Foundation', category: 'society', cost: 25, months: 6, labor: 2, upkeep: 0.2, max: 2, bonuses: { unrest: -6, legitimacy: 0.5 }, description: 'Temples, mosques, churches and their endowments.' },
  { id: 'fortress', name: 'Fortress', category: 'military', cost: 80, months: 18, labor: 6, upkeep: 1, max: 4, bonuses: { fortDefense: 1 }, description: 'Bastioned fortifications. Each level raises the fort by one.' },
  { id: 'barracks', name: 'Barracks', category: 'military', cost: 30, months: 6, labor: 2, upkeep: 0.4, max: 2, bonuses: { manpower: 0.2 }, description: 'Quarters and drill grounds; recruits train faster.' },
  { id: 'arsenal', name: 'Arsenal', category: 'military', cost: 90, months: 12, labor: 4, upkeep: 1, max: 1, bonuses: { recruitCost: 0.1, land: 0.02 }, description: 'Foundries and magazines for arms and artillery.' },
];

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>;

export const UNITS: Record<UnitType, UnitDef> = {
  infantry: { id: 'infantry', name: 'Infantry', attack: 1, defense: 1, upkeep: 3, cost: 12, months: 3, manpower: 1, siege: 0.2, speed: 1, terrainBonus: { hills: 1.05, forest: 1.05 } },
  cavalry: { id: 'cavalry', name: 'Cavalry', attack: 1.45, defense: 0.85, upkeep: 5, cost: 25, months: 4, manpower: 1, siege: 0.05, speed: 1.35, terrainBonus: { plains: 1.25, steppe: 1.35, desert: 1.2, savanna: 1.2, farmland: 1.1, mountains: 0.55, jungle: 0.55, marsh: 0.6, forest: 0.75 } },
  artillery: { id: 'artillery', name: 'Artillery', attack: 1.9, defense: 0.6, upkeep: 6, cost: 40, months: 6, manpower: 0.8, siege: 1.6, speed: 0.8, terrainBonus: { mountains: 0.7, jungle: 0.7, marsh: 0.7 } },
  irregulars: { id: 'irregulars', name: 'Irregulars', attack: 0.6, defense: 0.65, upkeep: 1, cost: 3, months: 1, manpower: 1, siege: 0.05, speed: 1.15, terrainBonus: { hills: 1.3, mountains: 1.4, forest: 1.3, jungle: 1.4, marsh: 1.25, steppe: 1.1, desert: 1.15 } },
};

export const SHIPS: Record<ShipType, ShipDef> = {
  line: { id: 'line', name: 'Ships of the Line', power: 10, upkeep: 3.5, cost: 70, months: 18, capacity: 0.2, requiresTech: 'ship_of_the_line' },
  frigate: { id: 'frigate', name: 'Frigates', power: 3.5, upkeep: 1.3, cost: 25, months: 9, capacity: 0.3 },
  transport: { id: 'transport', name: 'Transports', power: 0.3, upkeep: 0.4, cost: 8, months: 4, capacity: 2 },
};
