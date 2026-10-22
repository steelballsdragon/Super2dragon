import type { Religion, SubjectType, Terrain, TradeGoodId } from './types';

export const SCHEMA_VERSION = 4;
export const START_YEAR = 1800;
export const REBELS = 'rebels';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface SubjectTypeDef {
  name: string;
  tribute: number; // share of subject tax income paid to overlord
  joinsWars: boolean;
  liberty: number; // baseline liberty desire
  description: string;
}

export const SUBJECT_TYPES: Record<SubjectType, SubjectTypeDef> = {
  colony: { name: 'Colony', tribute: 0.25, joinsWars: true, liberty: 25, description: 'Governed by officials appointed by the metropole; remits surplus revenue.' },
  chartered_company: { name: 'Chartered Company', tribute: 0.1, joinsWars: true, liberty: 15, description: 'A trading company exercising sovereign powers under charter.' },
  personal_union: { name: 'Personal Union', tribute: 0.05, joinsWars: true, liberty: 20, description: 'A separate realm sharing the same monarch.' },
  vassal: { name: 'Vassal', tribute: 0.15, joinsWars: true, liberty: 30, description: 'Owes military service and tribute to an overlord.' },
  tributary: { name: 'Tributary', tribute: 0.08, joinsWars: false, liberty: 35, description: 'Sends tribute and acknowledges suzerainty; otherwise self-governing.' },
  protectorate: { name: 'Protectorate', tribute: 0.04, joinsWars: true, liberty: 25, description: 'Protected by a stronger power that controls its foreign relations.' },
  subsidiary_ally: { name: 'Subsidiary Alliance', tribute: 0.12, joinsWars: true, liberty: 40, description: 'Pays for a protecting power\'s troops stationed in its territory.' },
  confederation_member: { name: 'Confederation Member', tribute: 0.04, joinsWars: true, liberty: 45, description: 'A member state owing nominal allegiance to the head of a confederacy.' },
  client_state: { name: 'Client Republic', tribute: 0.12, joinsWars: true, liberty: 40, description: 'A "sister republic" created and garrisoned by a revolutionary power.' },
  autonomous_pashalik: { name: 'Autonomous Pashalik', tribute: 0.05, joinsWars: false, liberty: 55, description: 'A province ruled by a powerful governor who obeys when it suits him.' },
  nominal_vassal: { name: 'Nominal Suzerainty', tribute: 0.02, joinsWars: false, liberty: 70, description: 'Suzerainty acknowledged in name and ceremony only.' },
};

export interface TerrainDef {
  name: string;
  moveCost: number;
  defense: number;
  supply: number;
  attrition: number;
  food: number;
  color: string;
}

export const TERRAIN: Record<Terrain, TerrainDef> = {
  plains: { name: 'Plains', moveCost: 1, defense: 1, supply: 1.1, attrition: 0, food: 1.0, color: '#b9b07a' },
  farmland: { name: 'Farmland', moveCost: 1, defense: 1, supply: 1.4, attrition: 0, food: 1.25, color: '#a8b46a' },
  hills: { name: 'Hills', moveCost: 1.4, defense: 1.15, supply: 0.9, attrition: 0, food: 0.9, color: '#a7906a' },
  mountains: { name: 'Mountains', moveCost: 2.2, defense: 1.35, supply: 0.5, attrition: 0.01, food: 0.6, color: '#8a7d70' },
  forest: { name: 'Forest', moveCost: 1.5, defense: 1.12, supply: 0.7, attrition: 0.005, food: 0.8, color: '#5f7d55' },
  jungle: { name: 'Jungle', moveCost: 2.0, defense: 1.2, supply: 0.6, attrition: 0.015, food: 0.85, color: '#4f7a4a' },
  desert: { name: 'Desert', moveCost: 1.6, defense: 1.0, supply: 0.35, attrition: 0.015, food: 0.4, color: '#d2b682' },
  steppe: { name: 'Steppe', moveCost: 0.9, defense: 0.95, supply: 0.6, attrition: 0.005, food: 0.7, color: '#c2b27a' },
  savanna: { name: 'Savanna', moveCost: 1.0, defense: 1.0, supply: 0.8, attrition: 0.005, food: 0.9, color: '#bfae6c' },
  marsh: { name: 'Marsh', moveCost: 1.8, defense: 1.15, supply: 0.6, attrition: 0.01, food: 0.9, color: '#7f8f6a' },
  tundra: { name: 'Tundra', moveCost: 1.8, defense: 1.05, supply: 0.3, attrition: 0.02, food: 0.35, color: '#b8b8a8' },
};

export interface GoodDef { name: string; price: number; food?: boolean; strategic?: boolean }

export const GOODS: Record<TradeGoodId, GoodDef> = {
  grain: { name: 'Grain', price: 2.0, food: true },
  rice: { name: 'Rice', price: 2.0, food: true },
  cotton: { name: 'Cotton', price: 3.2 },
  textiles: { name: 'Textiles', price: 4.0 },
  silk: { name: 'Silk', price: 4.6 },
  spices: { name: 'Spices', price: 4.2 },
  tea: { name: 'Tea', price: 4.0 },
  sugar: { name: 'Sugar', price: 4.0 },
  tobacco: { name: 'Tobacco', price: 3.2 },
  coffee: { name: 'Coffee', price: 3.8 },
  cocoa: { name: 'Cocoa', price: 3.6 },
  iron: { name: 'Iron', price: 3.0, strategic: true },
  coal: { name: 'Coal', price: 2.2, strategic: true },
  copper: { name: 'Copper', price: 3.2, strategic: true },
  timber: { name: 'Timber', price: 2.0 },
  furs: { name: 'Furs', price: 3.6 },
  fish: { name: 'Fish', price: 2.0, food: true },
  wool: { name: 'Wool', price: 2.8 },
  wine: { name: 'Wine', price: 3.0 },
  salt: { name: 'Salt', price: 2.6 },
  horses: { name: 'Horses', price: 2.8, strategic: true },
  livestock: { name: 'Livestock', price: 2.2, food: true },
  ivory: { name: 'Ivory', price: 4.2 },
  gold: { name: 'Gold', price: 6.0 },
  silver: { name: 'Silver', price: 5.0 },
  opium: { name: 'Opium', price: 4.5 },
  indigo: { name: 'Dyes & Indigo', price: 3.6 },
  porcelain: { name: 'Porcelain', price: 4.4 },
  naval_stores: { name: 'Naval Stores', price: 2.8, strategic: true },
  gems: { name: 'Gems & Gum', price: 4.4 },
};

export const RELIGION_GROUP: Record<Religion, string> = {
  catholic: 'christian', protestant: 'christian', orthodox: 'christian', oriental: 'christian',
  sunni: 'muslim', shia: 'muslim', ibadi: 'muslim', zaydi: 'muslim',
  hindu: 'dharmic', sikh: 'dharmic', jain: 'dharmic',
  theravada: 'buddhist', mahayana: 'buddhist', vajrayana: 'buddhist', confucian: 'east_asian', shinto: 'east_asian',
  jewish: 'jewish', traditional: 'traditional',
};

export const RELIGION_NAME: Record<Religion, string> = {
  catholic: 'Catholic', protestant: 'Protestant', orthodox: 'Orthodox', oriental: 'Ethiopian Orthodox', sunni: 'Sunni Islam',
  shia: 'Shia Islam', ibadi: 'Ibadi Islam', zaydi: 'Zaydi Islam', hindu: 'Hindu', sikh: 'Sikh', jain: 'Jain', theravada: 'Theravada Buddhism',
  mahayana: 'Mahayana Buddhism', vajrayana: 'Vajrayana Buddhism', confucian: 'Confucian / Chinese folk', shinto: 'Shinto–Buddhist',
  jewish: 'Jewish', traditional: 'Traditional religion',
};
