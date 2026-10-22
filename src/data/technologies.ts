import type { TechDef } from '../game/defs';
import type { TechCategory, TechProfile } from '../game/types';

// Technologies available around 1800 and those that followed. "year" is when a technology
// became practical in its most advanced setting; researching earlier costs more.

const T = (
  id: string, name: string, category: TechCategory, year: number, cost: number, requires: string[],
  bonuses: TechDef['bonuses'], description: string, extra: Partial<TechDef> = {},
): TechDef => ({ id, name, category, year, cost, requires, bonuses, description, ...extra });

export const TECHNOLOGIES: TechDef[] = [
  // Agriculture
  T('irrigation_engineering', 'Irrigation Engineering', 'agriculture', 1500, 90, [], { food: 0.08 }, 'Canals, tanks and terraces that store water through the dry season.', { unlocks: ['irrigation'] }),
  T('double_cropping', 'Double Cropping', 'agriculture', 1600, 110, ['irrigation_engineering'], { food: 0.08, growth: 0.0005 }, 'Early-ripening rice and multiple harvests per year.'),
  T('crop_rotation', 'Convertible Husbandry', 'agriculture', 1750, 150, [], { food: 0.1, productivity: 0.02 }, 'Clover, turnips and the four-field rotation end the fallow year.'),
  T('selective_breeding', 'Selective Breeding', 'agriculture', 1770, 180, ['crop_rotation'], { food: 0.05, productivity: 0.02 }, 'Bakewell\'s methods double the weight of cattle and sheep.'),
  T('scientific_agriculture', 'Scientific Agriculture', 'agriculture', 1815, 320, ['selective_breeding', 'chemistry'], { food: 0.12, growth: 0.0008 }, 'Agricultural societies, model farms and soil chemistry.'),
  T('chemical_fertilizer', 'Chemical Fertilisers', 'agriculture', 1840, 520, ['scientific_agriculture'], { food: 0.15, growth: 0.001 }, 'Guano, superphosphates and Liebig\'s mineral theory.'),
  // Medicine
  T('inoculation', 'Variolation', 'medicine', 1720, 100, [], { growth: 0.0006 }, 'Deliberate infection with mild smallpox to confer immunity.'),
  T('vaccination', 'Vaccination', 'medicine', 1798, 220, ['inoculation'], { growth: 0.0012 }, 'Jenner\'s cowpox vaccine: far safer than variolation.'),
  T('public_hygiene', 'Public Hygiene', 'medicine', 1830, 380, ['vaccination', 'modern_statistics'], { growth: 0.0012, unrest: -2 }, 'Sanitary boards, drainage and clean water.'),
  T('modern_surgery', 'Modern Surgery', 'medicine', 1846, 480, ['public_hygiene'], { growth: 0.0006, attrition: 0.15 }, 'Anaesthesia and field hospitals.'),
  // Industry
  T('artisan_textiles', 'Master Weaving Guilds', 'industry', 1500, 80, [], { trade: 0.04, productivity: 0.02 }, 'The finest handloom cottons and silks in the world.', { unlocks: ['workshop'] }),
  T('porcelain_manufacture', 'Porcelain Manufactories', 'industry', 1600, 120, ['artisan_textiles'], { trade: 0.05 }, 'Imperial kilns and large-scale ceramic production.'),
  T('spinning_jenny', 'Spinning Jenny', 'industry', 1765, 160, ['artisan_textiles'], { productivity: 0.02 }, 'One spinner turns many spindles.'),
  T('mechanized_spinning', 'Mechanised Spinning', 'industry', 1775, 240, ['spinning_jenny'], { productivity: 0.03 }, 'Arkwright\'s water frame and Crompton\'s mule.', { unlocks: ['textile_mill'], needsResource: ['cotton', 'wool'] }),
  T('power_loom', 'Power Loom', 'industry', 1790, 300, ['mechanized_spinning'], { factory: 0.15 }, 'Mechanical weaving to match mechanical spinning.'),
  T('factory_system', 'Factory System', 'industry', 1800, 360, ['power_loom', 'watt_engine'], { factory: 0.2, productivity: 0.03 }, 'Centralised, disciplined, powered production.', { needsLaw: { category: 'labor', options: ['free_labor', 'customary_obligations'] } }),
  T('chemistry', 'Modern Chemistry', 'industry', 1790, 260, ['encyclopedism'], { productivity: 0.02, research: 0.03 }, 'Lavoisier\'s nomenclature, bleaching powder and soda.'),
  T('interchangeable_parts', 'Interchangeable Parts', 'industry', 1820, 420, ['factory_system', 'machine_tools'], { factory: 0.15, recruitCost: 0.1 }, 'Standardised musket locks and machine parts.'),
  T('machine_tools', 'Machine Tools', 'industry', 1815, 400, ['factory_system', 'puddling'], { factory: 0.15, construction: 0.1 }, 'Maudslay\'s lathes make machines that make machines.'),
  // Steam
  T('atmospheric_engine', 'Atmospheric Engine', 'steam', 1712, 140, [], { productivity: 0.01 }, 'Newcomen engines pumping water from mines.'),
  T('watt_engine', 'Watt Steam Engine', 'steam', 1776, 300, ['atmospheric_engine'], { productivity: 0.03 }, 'Separate condenser and rotary motion: steam power for any factory.', { unlocks: ['steam_works'], needsResource: ['coal'] }),
  T('high_pressure_steam', 'High-Pressure Steam', 'steam', 1802, 420, ['watt_engine', 'puddling'], { factory: 0.1 }, 'Trevithick\'s compact, powerful engines.'),
  T('steamship', 'Steamships', 'steam', 1815, 480, ['high_pressure_steam'], { trade: 0.1, naval: 0.05 }, 'Paddle steamers on rivers and coasts.'),
  T('steam_locomotive', 'Steam Locomotive', 'steam', 1825, 560, ['high_pressure_steam', 'machine_tools'], { movement: 0.2, trade: 0.1 }, 'Iron horses on iron rails.'),
  T('railways', 'Railway Network', 'steam', 1835, 700, ['steam_locomotive'], { movement: 0.3, trade: 0.15, productivity: 0.05 }, 'Trunk lines binding markets together.'),
  // Metallurgy
  T('blast_furnace', 'Charcoal Blast Furnace', 'metallurgy', 1500, 90, [], { productivity: 0.01 }, 'Cast iron smelted with charcoal.'),
  T('crucible_steel', 'Crucible Steel', 'metallurgy', 1740, 160, ['blast_furnace'], { land: 0.03 }, 'Wootz and Huntsman steel for blades and tools.'),
  T('coke_smelting', 'Coke Smelting', 'metallurgy', 1750, 220, ['blast_furnace'], { productivity: 0.02 }, 'Iron smelted with coal-derived coke.', { unlocks: ['ironworks'], needsResource: ['coal', 'iron'] }),
  T('puddling', 'Puddling & Rolling', 'metallurgy', 1784, 280, ['coke_smelting'], { factory: 0.1 }, 'Cort\'s process makes bar iron in quantity.'),
  T('hot_blast', 'Hot Blast', 'metallurgy', 1828, 420, ['puddling'], { factory: 0.1, recruitCost: 0.05 }, 'Preheated air cuts fuel costs dramatically.'),
  // Education & administration
  T('printing_press', 'Printing Press', 'education', 1500, 60, [], { research: 0.05 }, 'Books, newspapers and pamphlets.'),
  T('academies', 'Scientific Academies', 'education', 1700, 140, ['printing_press'], { research: 0.08 }, 'Royal societies and learned academies.', { unlocks: ['university'] }),
  T('encyclopedism', 'Encyclopédisme', 'education', 1760, 200, ['academies'], { research: 0.08 }, 'Systematic knowledge for an enlightened public.'),
  T('dutch_learning', 'Western Learning (Rangaku)', 'education', 1770, 160, ['printing_press'], { research: 0.06 }, 'Translations of European medicine, astronomy and gunnery.'),
  T('public_schooling', 'Public Schooling', 'education', 1800, 300, ['encyclopedism'], { research: 0.1 }, 'Elementary schools for all children.'),
  T('technical_institutes', 'Technical Institutes', 'education', 1830, 480, ['public_schooling', 'machine_tools'], { research: 0.12, factory: 0.08 }, 'Polytechnic schools training engineers.'),
  T('civil_service_exams', 'Civil Service Examinations', 'administration', 600, 100, ['printing_press'], { taxEff: 0.04, corruption: -0.05 }, 'Officials selected by examination rather than birth.'),
  T('cartography', 'Scientific Cartography', 'administration', 1700, 120, ['printing_press'], { taxEff: 0.02, movement: 0.05 }, 'Triangulated surveys of the realm.'),
  T('cadastral_survey', 'Cadastral Survey', 'administration', 1780, 220, ['cartography'], { taxEff: 0.05 }, 'Land registers that make taxation fair and complete.'),
  T('metric_system', 'Rational Measures', 'administration', 1795, 200, ['cadastral_survey'], { taxEff: 0.02, trade: 0.03 }, 'Uniform weights and measures.'),
  T('modern_statistics', 'Census & Statistics', 'administration', 1800, 260, ['cadastral_survey'], { taxEff: 0.05 }, 'National censuses and political arithmetic.'),
  T('civil_code', 'Civil Code', 'administration', 1804, 360, ['metric_system', 'modern_statistics'], { taxEff: 0.04, stability: 3, corruption: -0.05 }, 'A single rational law code for the whole state.'),
  // Commerce
  T('double_entry', 'Double-Entry Bookkeeping', 'commerce', 1500, 70, [], { trade: 0.04, taxEff: 0.01 }, 'Merchant accounting.'),
  T('joint_stock', 'Joint-Stock Companies', 'commerce', 1600, 130, ['double_entry'], { trade: 0.06 }, 'Pooled capital for distant ventures.'),
  T('central_banking', 'Central Banking', 'commerce', 1694, 200, ['joint_stock'], { trade: 0.04 }, 'A national bank and funded public debt; cheaper loans.'),
  T('marine_insurance', 'Marine Insurance', 'commerce', 1720, 160, ['joint_stock'], { trade: 0.05 }, 'Lloyd\'s coffee house and the spreading of risk.'),
  T('political_economy', 'Political Economy', 'commerce', 1776, 240, ['encyclopedism', 'joint_stock'], { trade: 0.06, productivity: 0.02 }, 'Smith\'s Wealth of Nations and the division of labour.'),
  T('telegraph', 'Electric Telegraph', 'commerce', 1840, 520, ['chemistry', 'railways'], { trade: 0.1, taxEff: 0.04, land: 0.03 }, 'Instant communication by wire.'),
  // Shipbuilding
  T('ship_of_the_line', 'Ship of the Line', 'shipbuilding', 1650, 140, [], { naval: 0.05 }, 'Three-decked warships of seventy-four guns and more.'),
  T('copper_sheathing', 'Copper Sheathing', 'shipbuilding', 1780, 220, ['ship_of_the_line'], { naval: 0.1 }, 'Copper-bottomed hulls stay fast and free of shipworm.'),
  T('naval_signals', 'Naval Signal Codes', 'shipbuilding', 1800, 240, ['copper_sheathing'], { naval: 0.08 }, 'Popham\'s numerary code lets admirals command at sea.'),
  T('carronade', 'Carronades', 'shipbuilding', 1780, 200, ['ship_of_the_line', 'coke_smelting'], { naval: 0.06 }, 'Short, heavy guns devastating at close range.'),
  T('clipper_design', 'Clipper Design', 'shipbuilding', 1840, 460, ['copper_sheathing'], { trade: 0.08 }, 'Sharp hulls built for speed.'),
  T('ironclad', 'Ironclad Warships', 'shipbuilding', 1859, 700, ['steamship', 'hot_blast'], { naval: 0.25 }, 'Armoured steam warships.'),
  // Military
  T('flintlock_bayonet', 'Flintlock & Socket Bayonet', 'military', 1700, 100, [], { land: 0.06 }, 'Every musketeer is also a pikeman.'),
  T('linear_tactics', 'Linear Tactics', 'military', 1740, 150, ['flintlock_bayonet'], { land: 0.06 }, 'Drilled volley fire in line.'),
  T('field_artillery_reform', 'Field Artillery Reform', 'military', 1765, 220, ['linear_tactics'], { land: 0.05, siege: 0.15 }, 'Gribeauval\'s standardised, mobile guns.'),
  T('rocket_artillery', 'Rocket Artillery', 'military', 1780, 180, ['crucible_steel'], { land: 0.03, siege: 0.05 }, 'Iron-cased war rockets as used by Mysore.'),
  T('levee_en_masse', 'Levée en Masse', 'military', 1793, 260, ['linear_tactics'], { manpower: 0.25, morale: 0.05 }, 'The nation in arms.', { unlocks: ['conscription'] }),
  T('divisional_system', 'Divisional System', 'military', 1795, 300, ['field_artillery_reform'], { land: 0.08, movement: 0.08 }, 'Self-contained combined-arms divisions that march apart and fight together.'),
  T('military_staff', 'General Staff', 'military', 1806, 360, ['divisional_system', 'cartography'], { land: 0.06, attrition: 0.1 }, 'Professional staff officers and military academies.'),
  T('rifled_muskets', 'Rifled Muskets', 'military', 1840, 480, ['interchangeable_parts', 'military_staff'], { land: 0.12 }, 'Minié balls and long-range rifled fire.'),
  T('fortification_science', 'Fortification Science', 'military', 1700, 180, ['linear_tactics'], { fortDefense: 0.15 }, 'Bastions, glacis and the science of Vauban.'),
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHNOLOGIES.map((t) => [t.id, t]));

const COMMON_OLD = ['printing_press', 'blast_furnace', 'double_entry', 'irrigation_engineering'];
const EURO_BASE = [
  ...COMMON_OLD, 'flintlock_bayonet', 'linear_tactics', 'ship_of_the_line', 'academies', 'cartography', 'joint_stock', 'marine_insurance',
  'inoculation', 'fortification_science', 'atmospheric_engine', 'crop_rotation', 'central_banking',
];

export const TECH_PROFILES: Record<TechProfile, string[]> = {
  britain: [...EURO_BASE, 'encyclopedism', 'political_economy', 'selective_breeding', 'spinning_jenny', 'coke_smelting', 'carronade', 'chemistry', 'field_artillery_reform', 'cadastral_survey'],
  western_europe: [...EURO_BASE, 'encyclopedism', 'field_artillery_reform', 'chemistry', 'spinning_jenny', 'political_economy'],
  central_europe: [...EURO_BASE, 'encyclopedism', 'field_artillery_reform'],
  eastern_europe: [...COMMON_OLD, 'flintlock_bayonet', 'linear_tactics', 'ship_of_the_line', 'academies', 'cartography', 'inoculation', 'fortification_science', 'field_artillery_reform'],
  ottoman: [...COMMON_OLD, 'flintlock_bayonet', 'ship_of_the_line', 'artisan_textiles', 'fortification_science', 'linear_tactics'],
  persian: [...COMMON_OLD, 'flintlock_bayonet', 'artisan_textiles'],
  south_asia: [...COMMON_OLD, 'flintlock_bayonet', 'artisan_textiles', 'crucible_steel', 'double_cropping'],
  east_asia: [...COMMON_OLD, 'artisan_textiles', 'double_cropping', 'civil_service_exams', 'inoculation'],
  japan: [...COMMON_OLD, 'artisan_textiles', 'double_cropping', 'cartography'],
  southeast_asia: [...COMMON_OLD, 'flintlock_bayonet', 'double_cropping'],
  north_africa: [...COMMON_OLD, 'flintlock_bayonet', 'artisan_textiles'],
  west_africa: ['blast_furnace', 'double_entry', 'flintlock_bayonet'],
  east_africa: ['blast_furnace', 'irrigation_engineering', 'flintlock_bayonet'],
  southern_africa: ['blast_furnace'],
  usa: [...EURO_BASE, 'encyclopedism', 'political_economy', 'cadastral_survey'],
  colonial_americas: [...COMMON_OLD, 'flintlock_bayonet', 'linear_tactics', 'ship_of_the_line', 'cartography', 'joint_stock', 'inoculation', 'fortification_science'],
  indigenous: ['flintlock_bayonet'],
  pacific: [],
  steppe: ['blast_furnace', 'flintlock_bayonet'],
};

/** Relative strength of research institutions, by technology profile (1800). */
export const INSTITUTION_FACTOR: Record<TechProfile, number> = {
  britain: 1, western_europe: 0.9, central_europe: 0.85, eastern_europe: 0.6, ottoman: 0.45, persian: 0.4,
  south_asia: 0.4, east_asia: 0.35, japan: 0.5, southeast_asia: 0.35, north_africa: 0.35, west_africa: 0.3,
  east_africa: 0.3, southern_africa: 0.25, usa: 0.85, colonial_americas: 0.5, indigenous: 0.25, pacific: 0.25, steppe: 0.3,
};
