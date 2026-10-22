import type {
  AIPersonality, Continent, CultureGroup, LawCategory, PolityDef, PolityType, PortraitStyle,
  Religion, RulerTuple, SubjectType, TechProfile,
} from '../game/types';

type ContinentCode = 'EU' | 'AS' | 'AF' | 'NA' | 'SA' | 'OC';

const CONTINENTS: Record<ContinentCode, Continent> = {
  EU: 'Europe', AS: 'Asia', AF: 'Africa', NA: 'North America', SA: 'South America', OC: 'Oceania',
};

/** Compact authoring format for polities. Population is given in millions. */
export interface PolityInput {
  short?: string;
  adj?: string;
  alias?: string[];
  cont: ContinentCode;
  region: string;
  type: PolityType;
  gov: string;
  title: string;
  ruler: RulerTuple;
  heir?: RulerTuple;
  cap: string;
  capName?: string;
  cul: string;
  cg: CultureGroup;
  rel: Religion;
  pop: number;
  gdp: number;
  tax?: number;
  eff?: number;
  tre?: number;
  debt?: number;
  army?: [number, number, number, number];
  navy?: [number, number, number];
  tech: TechProfile;
  techs?: string[];
  ov?: string;
  sub?: SubjectType;
  mem?: string[];
  color?: string;
  flag?: string;
  por?: PortraitStyle;
  diff?: number;
  intro: string;
  play?: boolean;
  agg?: boolean;
  dormant?: boolean;
  riv?: string[];
  all?: string[];
  pers?: Partial<AIPersonality>;
  laws?: Partial<Record<LawCategory, string>>;
  stab?: number;
  legit?: number;
  prest?: number;
  corr?: number;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Muted, antique-atlas palette used for polities without an authored colour.
const PALETTE = [
  '#9b6b4a', '#7d8f5a', '#5f7f8c', '#a3845a', '#8a5f6e', '#6d8a6a', '#b08a4e', '#6a6f94',
  '#94704f', '#5d8a7a', '#a0675a', '#7a7a4f', '#8b6f9a', '#5f8f5f', '#a97a63', '#68869c',
  '#9c8a5d', '#7f5f5f', '#5a7a5a', '#b0946a', '#8e7a9c', '#6f9a8a', '#a8706b', '#857a5a',
  '#6b7f9f', '#9a8a70', '#7a9070', '#ab8c7c', '#7b6a8f', '#8fa07a', '#9d7752', '#5e7d6e',
];

export function paletteColor(id: string): string {
  return PALETTE[hashString(id) % PALETTE.length];
}

const PORTRAIT_BY_GROUP: Partial<Record<CultureGroup, PortraitStyle>> = {
  british: 'euro_crown', french: 'euro', german: 'euro', dutch: 'euro', iberian: 'euro_crown',
  italian: 'euro', nordic: 'euro_crown', slavic: 'euro_crown', hungarian: 'euro', greek: 'euro',
  turkic: 'ottoman', persian: 'persian', arab: 'arab', afghan: 'turban', south_asian: 'turban',
  sikh: 'sikh', himalayan: 'himalayan', chinese: 'qing', mongol: 'steppe', korean: 'joseon',
  japanese: 'japan', vietnamese: 'sea_asian', tai: 'sea_asian', burmese: 'sea_asian', malay: 'sea_asian',
  ethiopian: 'african_crown', west_african: 'african_crown', sahelian: 'arab', bantu: 'african_crown',
  swahili: 'arab', malagasy: 'african_crown', american: 'republic', latin_american: 'euro',
  indigenous_american: 'council', polynesian: 'council', melanesian: 'council', aboriginal: 'council',
  caucasian: 'steppe', central_asian: 'steppe',
};

function defaultTax(type: PolityType, tech: TechProfile): [number, number] {
  // [statutory tax rate, collection efficiency]
  const eff: Record<TechProfile, number> = {
    britain: 0.85, western_europe: 0.7, central_europe: 0.65, eastern_europe: 0.5, ottoman: 0.35,
    persian: 0.35, south_asia: 0.45, east_asia: 0.3, japan: 0.5, southeast_asia: 0.35, north_africa: 0.35,
    west_africa: 0.35, east_africa: 0.3, southern_africa: 0.25, usa: 0.6, colonial_americas: 0.45,
    indigenous: 0.15, pacific: 0.15, steppe: 0.2,
  };
  let rate = 0.1;
  if (type === 'decentralized' || type === 'nomadic') rate = 0.05;
  if (type === 'chartered_company' || type === 'colony') rate = 0.14;
  if (type === 'republic') rate = 0.09;
  return [rate, eff[tech]];
}

function defaultPersonality(type: PolityType, id: string): AIPersonality {
  const h = hashString(id + ':p');
  const r = (shift: number) => ((h >>> shift) & 0xff) / 255;
  const base: AIPersonality = {
    aggression: 0.25 + r(0) * 0.4,
    diplomacy: 0.3 + r(8) * 0.5,
    mercantile: 0.3 + r(16) * 0.5,
    reform: 0.2 + r(24) * 0.5,
    caution: 0.3 + r(4) * 0.5,
  };
  if (type === 'chartered_company') { base.mercantile = 0.9; base.aggression = 0.6; }
  if (type === 'decentralized') { base.aggression = Math.min(base.aggression, 0.35); base.caution = 0.7; }
  if (type === 'city_state' || type === 'republic') { base.mercantile = Math.max(base.mercantile, 0.7); }
  if (type === 'colony') { base.aggression = 0.2; base.caution = 0.8; }
  return base;
}

/** Procedural banner for polities without an authored flag spec. */
function defaultFlag(id: string, rel: Religion, type: PolityType): string {
  const h = hashString(id + ':flag');
  const cols = ['8b1e1e', '1f3a5f', 'e8d8b5', 'd9b46b', '2f5d3a', '5b2a4a', '1a1a1a', 'b5652a', '3f6e8c', '7a1f2b'];
  const c1 = cols[h % cols.length];
  let c2 = cols[(h >>> 4) % cols.length];
  if (c2 === c1) c2 = 'e8d8b5';
  const emblemByRel: Partial<Record<Religion, string>> = {
    sunni: 'crescent', shia: 'crescent', ibadi: 'crescent', zaydi: 'crescent', hindu: 'sun', sikh: 'khanda',
    jain: 'wheel', theravada: 'wheel', mahayana: 'lotus', vajrayana: 'wheel', confucian: 'disc', shinto: 'disc',
    catholic: 'cross', protestant: 'cross', orthodox: 'cross', oriental: 'cross', traditional: 'spiral', jewish: 'star',
  };
  let emblem = emblemByRel[rel] ?? 'star';
  if (type === 'decentralized' || type === 'nomadic' || type === 'confederation') emblem = type === 'confederation' ? 'council' : 'spiral';
  const kinds = ['solid', 'h2', 'v2', 'border', 'tri'];
  const kind = kinds[(h >>> 8) % kinds.length];
  const fg = c1 === 'e8d8b5' || c1 === 'd9b46b' ? '1f3a5f' : 'e8d8b5';
  if (kind === 'solid') return `solid ${c1} e=${emblem}/${fg}`;
  if (kind === 'border') return `border ${c1} ${c2} e=${emblem}/${fg}`;
  if (kind === 'tri') return `tri ${c1} ${c2} e=${emblem}/${fg}`;
  return `${kind} ${c1} ${c2} e=${emblem}/${c2 === 'e8d8b5' ? '8b1e1e' : 'e8d8b5'}`;
}

export function P(id: string, name: string, i: PolityInput): PolityDef {
  const [tax, eff] = defaultTax(i.type, i.tech);
  const pop = Math.round(i.pop * 1_000_000);
  const monthlyGdp = (pop / 1000) * i.gdp / 12; // £k per month
  const treasury = i.tre ?? Math.round(monthlyGdp * (i.tax ?? tax) * (i.eff ?? eff) * 4);
  const playable = i.play ?? !(i.agg ?? false);
  const pers = { ...defaultPersonality(i.type, id), ...(i.pers ?? {}) };
  const strength = Math.log10(Math.max(10_000, pop));
  const diff = i.diff ?? Math.max(1, Math.min(5, Math.round(9 - strength)));
  const shortName = i.short ?? name.replace(/^(Kingdom|Empire|Sultanate|Republic|Principality|Duchy|Electorate|Emirate|Khanate|Imamate) of /, '');
  return {
    id,
    name,
    short: shortName,
    adjective: i.adj ?? shortName,
    aliases: i.alias ?? [],
    continent: CONTINENTS[i.cont],
    region: i.region,
    polityType: i.type,
    government: i.gov,
    rulerTitle: i.title,
    ruler: i.ruler,
    heir: i.heir,
    capital: i.cap,
    capitalName: i.capName ?? '',
    culture: i.cul,
    cultureGroup: i.cg,
    religion: i.rel,
    population: pop,
    gdpPc: i.gdp,
    taxRate: i.tax ?? tax,
    efficiency: i.eff ?? eff,
    treasury,
    debt: i.debt ?? 0,
    army: i.army,
    navy: i.navy,
    techProfile: i.tech,
    extraTechs: i.techs ?? [],
    overlord: i.ov,
    subjectType: i.sub,
    memberships: i.mem ?? [],
    color: i.color ?? paletteColor(id),
    flag: i.flag ?? defaultFlag(id, i.rel, i.type),
    portrait: i.por ?? (i.type === 'decentralized' || i.type === 'confederation' && i.cg === 'indigenous_american' ? 'council' : PORTRAIT_BY_GROUP[i.cg] ?? 'euro'),
    difficulty: diff,
    intro: i.intro,
    playable: i.dormant ? false : playable,
    aggregate: i.agg ?? false,
    dormant: i.dormant ?? false,
    rivals: i.riv ?? [],
    allies: i.all ?? [],
    personality: pers,
    laws: i.laws ?? {},
    stability: i.stab ?? 55,
    legitimacy: i.legit ?? 65,
    prestige: i.prest ?? Math.round(Math.min(80, Math.max(5, (strength - 4) * 18))),
    corruption: i.corr ?? 25,
  };
}
