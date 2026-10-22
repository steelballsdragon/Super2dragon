import type { LawCategoryDef, LawOption } from '../game/defs';
import type { FactionId, LawCategory, PolityDef, PolityType, TechProfile } from '../game/types';

const L = (
  id: string, name: string, description: string, bonuses: LawOption['bonuses'], factions: Partial<Record<FactionId, number>>,
  extra: Partial<LawOption> = {},
): LawOption => ({ id, name, description, bonuses, factions, ...extra });

export const LAWS: LawCategoryDef[] = [
  {
    id: 'government', name: 'Form of Government', options: [
      L('absolute_monarchy', 'Absolute Rule', 'The sovereign governs without institutional restraint.', { legitimacy: 5, taxEff: 0.02 }, { nobility: 5, reformers: -15, merchants: -5 }, { requiresType: ['monarchy', 'feudal', 'theocracy'] }),
      L('council_rule', 'Council Government', 'Power is shared by a ruling council of ministers or chiefs.', { stability: 3 }, { nobility: 8, reformers: -5 }),
      L('constitutional_monarchy', 'Constitutional Monarchy', 'A written constitution and an elected assembly limit the crown.', { taxEff: 0.06, stability: 2, research: 0.05 }, { merchants: 15, reformers: 15, nobility: -10, clergy: -5 }, { requiresTech: 'encyclopedism', requiresType: ['monarchy', 'feudal'] }),
      L('republic', 'Republic', 'Sovereignty rests with citizens and their representatives.', { taxEff: 0.05, research: 0.05, legitimacy: -5 }, { merchants: 12, reformers: 20, nobility: -25, clergy: -10 }, { requiresTech: 'encyclopedism' }),
      L('theocratic_rule', 'Theocratic Rule', 'Spiritual authority is political authority.', { legitimacy: 8, stability: 3, research: -0.05 }, { clergy: 25, reformers: -20 }),
      L('consensus', 'Consensus Governance', 'Decisions are reached by councils and the consent of the community.', { stability: 6, unrest: -6, taxEff: -0.15 }, { commons: 15, nobility: -5 }, { requiresType: ['confederation', 'decentralized', 'nomadic'] }),
      L('company_rule', 'Company Rule', 'A chartered company governs for profit under a distant crown.', { trade: 0.1, legitimacy: -10 }, { merchants: 20, commons: -10 }, { requiresType: ['chartered_company'] }),
      L('colonial_administration', 'Colonial Administration', 'Governors and officials appointed by a metropolitan power.', { taxEff: 0.04, legitimacy: -8 }, { merchants: 5, commons: -8 }, { requiresType: ['colony'] }),
    ],
  },
  {
    id: 'administration', name: 'Administration', options: [
      L('decentralized', 'Decentralised Lordship', 'Regional lords, chiefs and notables govern their own districts.', { taxEff: -0.12, unrest: -4, stability: 2 }, { nobility: 15, reformers: -5 }, { costMult: 0.7 }),
      L('provincial_governors', 'Provincial Governors', 'Appointed governors with broad powers.', {}, { nobility: 3 }),
      L('bureaucracy', 'Centralised Bureaucracy', 'Salaried officials, ministries and written procedure.', { taxEff: 0.1, corruption: -0.03 }, { reformers: 8, nobility: -10 }, { requiresTech: 'cartography', costMult: 1.3 }),
      L('federal', 'Federal Union', 'Self-governing provinces united under a common government.', { unrest: -7, taxEff: -0.04, stability: 3 }, { commons: 8, nobility: 2 }),
    ],
  },
  {
    id: 'taxation', name: 'Taxation', options: [
      L('tribute_and_custom', 'Tribute & Custom', 'Gifts, tribute and customary dues.', { taxEff: -0.2, unrest: -4 }, { commons: 5 }),
      L('tax_farming', 'Tax Farming', 'Private contractors buy the right to collect taxes.', { taxEff: -0.05, corruption: 0.04 }, { merchants: 8, commons: -8 }),
      L('land_revenue', 'Land Revenue Settlement', 'Taxes assessed on land and harvest by state officials.', {}, {}),
      L('tax_bureau', 'Central Tax Bureau', 'A professional revenue service assesses and collects directly.', { taxEff: 0.12 }, { reformers: 5, nobility: -8 }, { requiresTech: 'cadastral_survey' }),
      L('income_tax', 'Income Tax', 'Direct taxation of incomes and property.', { taxEff: 0.2, unrest: 3 }, { merchants: -10, reformers: 5, commons: -5 }, { requiresTech: 'modern_statistics' }),
    ],
  },
  {
    id: 'military', name: 'Military Organisation', options: [
      L('feudal_levies', 'Feudal Levies', 'Lords raise men and horses when summoned.', { upkeep: 0.2 }, { nobility: 10, military: -5 }, { mobilization: 0.015, quality: 0.85 }),
      L('warrior_tradition', 'Warrior Tradition', 'Every grown man is a warrior when the community needs him.', { upkeep: 0.3, morale: 0.1 }, { commons: 5 }, { mobilization: 0.035, quality: 0.95 }),
      L('mercenaries', 'Contract Armies', 'Professional soldiers hired by contract.', { upkeep: -0.25 }, { merchants: 5, military: -5 }, { mobilization: 0.01, quality: 1.0 }),
      L('standing_army', 'Standing Professional Army', 'A permanent, drilled army under royal officers.', { upkeep: -0.05 }, { military: 12, commons: -3 }, { mobilization: 0.015, quality: 1.1, requiresTech: 'linear_tactics' }),
      L('conscription', 'Mass Conscription', 'Universal military obligation for young men.', { unrest: 3, morale: 0.05 }, { military: 8, commons: -10, reformers: 5 }, { mobilization: 0.04, quality: 1.0, requiresTech: 'levee_en_masse' }),
    ],
  },
  {
    id: 'economy', name: 'Economic Policy', options: [
      L('traditional', 'Customary Economy', 'Guilds, monopolies and custom regulate commerce.', { trade: -0.08, stability: 2 }, { clergy: 3, merchants: -5 }),
      L('mercantilism', 'Mercantilism', 'Protect home industry; hoard bullion; tax foreign goods.', { productivity: 0.03 }, { merchants: 5 }),
      L('free_trade', 'Free Trade', 'Low tariffs and open markets.', { trade: 0.15, productivity: 0.02 }, { merchants: 12, nobility: -5 }, { requiresTech: 'political_economy' }),
      L('state_enterprise', 'State-Led Development', 'The state founds and directs industry.', { factory: 0.2, corruption: 0.03 }, { reformers: 10, merchants: -8 }, { requiresTech: 'factory_system' }),
    ],
  },
  {
    id: 'labor', name: 'Labour', options: [
      L('serfdom', 'Serfdom', 'Peasants are bound to the land and their lords.', { productivity: -0.08, factory: -0.4, unrest: 3 }, { nobility: 15, commons: -15, reformers: -10 }),
      L('slavery', 'Chattel Slavery', 'Enslaved people work plantations, mines and households.', { productivity: -0.04, factory: -0.3, unrest: 6, stability: -3 }, { nobility: 10, commons: -10, reformers: -20, clergy: -5 }),
      L('customary_obligations', 'Customary Obligations', 'Labour dues, corvée and customary tenancies.', { factory: -0.1 }, { nobility: 3 }),
      L('free_labor', 'Free Labour', 'Workers are free to move and contract their labour.', { productivity: 0.05, factory: 0.1 }, { reformers: 10, commons: 8, nobility: -12 }),
    ],
  },
  {
    id: 'religion', name: 'Religion', options: [
      L('state_religion', 'State Religion', 'One faith is established and privileged.', { legitimacy: 4 }, { clergy: 15, reformers: -8 }),
      L('tolerance', 'Religious Tolerance', 'Minority faiths may worship freely.', { unrest: -3 }, { clergy: -5, merchants: 5, commons: 3 }),
      L('secularism', 'Secular State', 'Church and state are separated.', { research: 0.05, legitimacy: -3 }, { clergy: -20, reformers: 12 }, { requiresTech: 'encyclopedism' }),
    ],
  },
  {
    id: 'education', name: 'Education', options: [
      L('none', 'Oral & Household Learning', 'Learning passes through families, apprenticeships and elders.', {}, {}, { researchMult: 0.85, costMult: 0.5 }),
      L('clerical', 'Religious Schools', 'Temples, mosques and parishes teach reading and doctrine.', {}, { clergy: 8 }, { researchMult: 1.0 }),
      L('court_academies', 'Court Academies', 'The state trains officials and scholars in academies.', {}, { reformers: 5 }, { researchMult: 1.12, costMult: 1.3, requiresTech: 'academies' }),
      L('public_schools', 'Public Schooling', 'Compulsory elementary schooling for all.', { productivity: 0.02 }, { reformers: 10, clergy: -8 }, { researchMult: 1.28, costMult: 1.8, requiresTech: 'public_schooling' }),
    ],
  },
];

export const LAW_CATEGORY: Record<LawCategory, LawCategoryDef> = Object.fromEntries(LAWS.map((c) => [c.id, c])) as Record<LawCategory, LawCategoryDef>;

export function lawOption(category: LawCategory, id: string): LawOption | undefined {
  return LAW_CATEGORY[category].options.find((o) => o.id === id);
}

const WESTERN: TechProfile[] = ['britain', 'western_europe', 'central_europe', 'usa'];

/** Default laws for a polity, overridden by authored values. */
export function defaultLaws(p: PolityDef): Record<LawCategory, string> {
  const t: PolityType = p.polityType;
  const western = WESTERN.includes(p.techProfile);
  const government =
    t === 'republic' || t === 'city_state' ? (western ? 'republic' : 'council_rule')
      : t === 'theocracy' ? 'theocratic_rule'
        : t === 'chartered_company' ? 'company_rule'
          : t === 'colony' ? 'colonial_administration'
            : t === 'confederation' || t === 'decentralized' || t === 'nomadic' ? 'consensus'
              : t === 'feudal' ? 'council_rule' : 'absolute_monarchy';
  const administration = t === 'decentralized' || t === 'nomadic' || t === 'confederation' || t === 'feudal' ? 'decentralized' : 'provincial_governors';
  const taxation = t === 'decentralized' || t === 'nomadic' ? 'tribute_and_custom' : western ? 'land_revenue' : 'land_revenue';
  const military = t === 'decentralized' || t === 'nomadic' || t === 'confederation' ? 'warrior_tradition'
    : western || p.techProfile === 'eastern_europe' || p.techProfile === 'colonial_americas' ? 'standing_army' : 'feudal_levies';
  const economy = t === 'city_state' ? 'free_trade' : western || p.techProfile === 'colonial_americas' ? 'mercantilism' : 'traditional';
  const labor = p.techProfile === 'eastern_europe' ? 'serfdom' : 'customary_obligations';
  const religion = t === 'decentralized' || t === 'nomadic' ? 'tolerance' : 'state_religion';
  const education = t === 'decentralized' || t === 'nomadic' || p.techProfile === 'pacific' || p.techProfile === 'indigenous' ? 'none' : 'clerical';
  const base: Record<LawCategory, string> = { government, administration, taxation, military, economy, labor, religion, education };
  return Object.assign(base, p.laws);
}
