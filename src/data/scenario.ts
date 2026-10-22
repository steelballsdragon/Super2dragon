import type { RulerTuple, TreatyType, WarGoal } from '../game/types';

// The political situation on 1 January 1800: wars in progress, occupations, treaties,
// army and fleet deployments, and rebellions.

export interface ScenarioWar {
  id: string;
  name: string;
  attackers: string[];
  defenders: string[];
  goal: WarGoal;
}

export const START_WARS: ScenarioWar[] = [
  {
    id: 'w_coalition', name: 'War of the Second Coalition',
    attackers: ['great_britain', 'austria', 'ottoman', 'naples', 'portugal', 'bavaria'],
    defenders: ['france', 'spain', 'batavian_republic', 'helvetic_republic', 'ligurian_republic'],
    goal: { type: 'humiliate' },
  },
  { id: 'w_quasi', name: 'Quasi-War', attackers: ['usa'], defenders: ['france'], goal: { type: 'humiliate' } },
  { id: 'w_vietnam', name: 'Nguyễn–Tây Sơn War', attackers: ['nguyen_lords'], defenders: ['tay_son'], goal: { type: 'subjugate' } },
];

/** Subjects that stay out of their overlord's starting wars. */
export const NEUTRAL_SUBJECTS = [
  'hanover', 'saint_domingue', 'carnatic', 'hyderabad', 'mysore', 'travancore', 'cochin', 'awadh', 'yogyakarta', 'surakarta', 'ternate',
  'mecca', 'scindia', 'holkar', 'bhonsle', 'gaekwad', 'mughal', 'jaipur', 'jodhpur', 'udaipur', 'kota', 'kartli_kakheti', 'kazakh_junior',
  'mongolia', 'tibet', 'joseon', 'ryukyu', 'dagomba', 'dahomey', 'lan_na', 'vientiane', 'luang_prabang', 'champasak', 'cambodia',
  'kedah', 'kelantan', 'terengganu', 'shirvan', 'ganja', 'karabakh', 'erivan', 'sindh', 'kalat', 'russian_american_company',
];

/** Provinces occupied by a power other than their sovereign owner. */
export const OCCUPATIONS: Record<string, string> = {
  piedmont: 'austria',
  cairo: 'france', delta: 'france', upper_egypt: 'france',
  cape: 'great_britain', graaff_reinet: 'great_britain',
  colombo: 'great_britain', jaffna: 'great_britain', trincomalee: 'great_britain',
  suriname: 'great_britain', demerara: 'great_britain', martinique: 'great_britain', ambon: 'great_britain',
};

export const START_SIEGES: { province: string; by: string; progress: number }[] = [
  { province: 'malta', by: 'great_britain', progress: 65 },
];

/** Additional historical claims (cores) beyond each owner's own provinces. */
export const EXTRA_CORES: Record<string, string[]> = {
  lombardy: ['cisalpine_republic'], legations: ['papal_states', 'cisalpine_republic'], piedmont: ['kingdom_sardinia'],
  brabant: ['austria'], flanders: ['austria'], liege: ['austria'], luxembourg: ['austria'], nice: ['kingdom_sardinia'], savoy: ['kingdom_sardinia'],
  masovia: ['poland'], south_prussia: ['poland'], west_galicia: ['poland'], lithuania: ['poland'], new_east_prussia: ['poland'],
  volhynia: ['poland'], podolia: ['poland'], minsk: ['poland'], galicia: ['poland'], west_prussia: ['poland'],
  santo_domingo: ['france'], trinidad: ['spain'], malta: ['naples'],
  comancheria: ['new_spain'], apacheria: ['new_spain'], navajo: ['new_spain'],
  osage: ['spanish_louisiana'], pawnee: ['spanish_louisiana'], black_hills: ['spanish_louisiana'],
  wabash: ['usa'], sault: ['usa', 'british_north_america'], cherokee_valley: ['usa'], upper_creek: ['usa'], lower_creek: ['usa'], choctaw: ['usa'], chickasaw: ['usa'],
  buffalo_creek: ['usa'], araucania: ['chile'], pampas: ['rio_de_la_plata'], chaco: ['rio_de_la_plata'], patagonia: ['rio_de_la_plata'],
  kandy: ['batavian_republic'], cuttack: ['british_east_india_company'], delhi: ['maratha'], tirhut: ['nepal'], kumaon: ['garhwal'],
  kashmir: ['sikh_misls'], multan: ['sikh_misls'], peshawar: ['sikh_misls'], herat: ['qajar_persia'], kartli: ['qajar_persia'],
  bessarabia: ['russia'], moldavia: ['russia'], crimea: ['ottoman'], hejaz: ['diriyah'], basra: ['diriyah'],
  ezo: ['tokugawa'], taiwan_east: ['qing'], quy_nhon: ['tay_son'], kauai: ['hawaii'], fante: ['ashanti'], cayor: ['futa_toro'],
};

export const START_TREATIES: { type: TreatyType; a: string; b: string; amount?: number }[] = [
  { type: 'alliance', a: 'great_britain', b: 'austria' },
  { type: 'alliance', a: 'great_britain', b: 'portugal' },
  { type: 'alliance', a: 'great_britain', b: 'ottoman' },
  { type: 'alliance', a: 'great_britain', b: 'naples' },
  { type: 'alliance', a: 'austria', b: 'naples' },
  { type: 'alliance', a: 'austria', b: 'bavaria' },
  { type: 'alliance', a: 'russia', b: 'ottoman' },
  { type: 'alliance', a: 'france', b: 'spain' },
  { type: 'alliance', a: 'british_east_india_company', b: 'oman' },
  { type: 'alliance', a: 'british_east_india_company', b: 'coorg' },
  { type: 'alliance', a: 'great_britain', b: 'miskito' },
  { type: 'alliance', a: 'great_britain', b: 'tidore' },
  { type: 'trade', a: 'great_britain', b: 'portugal' },
  { type: 'trade', a: 'great_britain', b: 'usa' },
  { type: 'trade', a: 'great_britain', b: 'russia' },
  { type: 'trade', a: 'usa', b: 'spain' },
  { type: 'trade', a: 'qing', b: 'russia' },
  { type: 'trade', a: 'british_east_india_company', b: 'oman' },
  { type: 'trade', a: 'denmark_norway', b: 'usa' },
  { type: 'marriage', a: 'austria', b: 'naples' },
  { type: 'marriage', a: 'spain', b: 'portugal' },
  { type: 'marriage', a: 'spain', b: 'parma' },
  { type: 'marriage', a: 'russia', b: 'baden' },
  { type: 'marriage', a: 'russia', b: 'austria' },
  { type: 'marriage', a: 'sweden', b: 'baden' },
  { type: 'marriage', a: 'great_britain', b: 'brunswick' },
  { type: 'subsidy', a: 'great_britain', b: 'austria', amount: 120 },
  { type: 'subsidy', a: 'great_britain', b: 'bavaria', amount: 20 },
];

export const START_RELATIONS: [string, string, number][] = [
  ['france', 'great_britain', -85], ['france', 'austria', -70], ['france', 'ottoman', -60], ['france', 'russia', -25], ['france', 'naples', -60],
  ['france', 'prussia', 15], ['france', 'spain', 45], ['france', 'usa', -45], ['france', 'portugal', -40], ['france', 'batavian_republic', 40],
  ['great_britain', 'russia', 10], ['great_britain', 'spain', -55], ['great_britain', 'denmark_norway', -10], ['great_britain', 'usa', 25],
  ['great_britain', 'ottoman', 40], ['great_britain', 'austria', 45], ['great_britain', 'portugal', 75], ['great_britain', 'naples', 55],
  ['austria', 'russia', -15], ['austria', 'prussia', -25], ['spain', 'portugal', -30], ['russia', 'ottoman', 25], ['russia', 'sweden', -20],
  ['russia', 'qajar_persia', -45], ['russia', 'prussia', 10], ['denmark_norway', 'sweden', -10], ['qajar_persia', 'durrani', -50],
  ['qajar_persia', 'ottoman', -25], ['ottoman', 'vidin', -60], ['ottoman', 'diriyah', -55], ['mecca', 'diriyah', -80], ['baghdad', 'diriyah', -70],
  ['british_east_india_company', 'maratha', -35], ['british_east_india_company', 'scindia', -50], ['british_east_india_company', 'holkar', -40],
  ['holkar', 'scindia', -80], ['maratha', 'hyderabad', -40], ['maratha', 'kolhapur', -50], ['sikh_misls', 'durrani', -60], ['nepal', 'british_east_india_company', -15],
  ['konbaung', 'siam', -75], ['nguyen_lords', 'tay_son', -120], ['ashanti', 'fante', -55], ['morocco', 'spain', -20], ['tripoli', 'usa', -30],
  ['algiers', 'usa', -15], ['qing', 'joseon', 60], ['qing', 'tokugawa', 0], ['tokugawa', 'russia', -25], ['usa', 'spain', 10],
  ['usa', 'western_confederacy', -40], ['usa', 'cherokee', -10], ['usa', 'muscogee', -20], ['comanche', 'new_spain', -10], ['apache', 'new_spain', -45],
  ['lakota', 'pawnee', -50], ['blackfoot', 'shoshone', -60], ['crow', 'lakota', -55], ['mapuche', 'chile', -10], ['hawaii', 'kauai', -60],
  ['merina', 'boina', -30], ['tidore', 'dutch_east_indies', -70], ['tidore', 'ternate', -50], ['saint_domingue', 'great_britain', 15],
  ['saint_domingue', 'usa', 20], ['buganda', 'bunyoro', -50], ['segou', 'kaarta', -60], ['oyo', 'dahomey', -20], ['xhosa', 'batavian_republic', -40],
  ['tlingit', 'russian_american_company', -40], ['kandy', 'great_britain', -10], ['mysore', 'maratha', -20], ['ahom', 'konbaung', -30],
];

export interface Deployment { at: string; share: number; name: string; general?: [string, number] }

export const ARMY_DEPLOYMENTS: Record<string, Deployment[]> = {
  france: [
    { at: 'alsace', share: 0.33, name: 'Armée du Rhin', general: ['Jean Victor Moreau', 8] },
    { at: 'genoa', share: 0.12, name: 'Armée d\'Italie', general: ['André Masséna', 8] },
    { at: 'burgundy', share: 0.2, name: 'Armée de Réserve', general: ['Louis-Alexandre Berthier', 6] },
    { at: 'cairo', share: 0.08, name: 'Armée d\'Orient', general: ['Jean-Baptiste Kléber', 8] },
    { at: 'brittany', share: 0.1, name: 'Armée de l\'Ouest', general: ['Guillaume Brune', 5] },
    { at: 'brabant', share: 0.1, name: 'Armée du Nord', general: ['Pierre Augereau', 6] },
    { at: 'ile_de_france', share: 0.05, name: 'Garde des Consuls', general: ['Joachim Murat', 7] },
    { at: 'malta', share: 0.02, name: 'Garrison of Malta', general: ['Claude-Henri Vaubois', 5] },
  ],
  austria: [
    { at: 'wurttemberg', share: 0.38, name: 'Army of Germany', general: ['Paul Kray', 6] },
    { at: 'piedmont', share: 0.32, name: 'Army of Italy', general: ['Michael von Melas', 5] },
    { at: 'bohemia', share: 0.1, name: 'Bohemian Reserve', general: ['Archduke Charles', 9] },
    { at: 'croatia', share: 0.1, name: 'Military Frontier' },
    { at: 'hungary', share: 0.1, name: 'Hungarian Insurrection' },
  ],
  great_britain: [
    { at: 'london', share: 0.4, name: 'Home Army', general: ['Frederick, Duke of York', 4] },
    { at: 'malta', share: 0.12, name: 'Mediterranean Expedition', general: ['Ralph Abercromby', 7] },
    { at: 'leinster', share: 0.2, name: 'Army in Ireland', general: ['Charles Cornwallis', 6] },
    { at: 'lowlands', share: 0.08, name: 'North Britain' },
    { at: 'west_country', share: 0.2, name: 'Southern District', general: ['John Moore', 7] },
  ],
  russia: [
    { at: 'lithuania', share: 0.25, name: 'Army of Lithuania', general: ['Mikhail Kutuzov', 8] },
    { at: 'st_petersburg', share: 0.12, name: 'Guards Corps' },
    { at: 'moscow', share: 0.12, name: 'Moscow Division' },
    { at: 'podolia', share: 0.15, name: 'Army of the Dniester', general: ['Levin von Bennigsen', 6] },
    { at: 'caucasus_line', share: 0.08, name: 'Caucasus Line', general: ['Karl Knorring', 5] },
    { at: 'crimea', share: 0.06, name: 'Crimean Division' },
    { at: 'livonia', share: 0.08, name: 'Livonian Division', general: ['Pyotr Bagration', 8] },
    { at: 'orenburg', share: 0.05, name: 'Orenburg Line' },
    { at: 'irkutsk', share: 0.03, name: 'Siberian Corps' },
    { at: 'novorossiya', share: 0.06, name: 'New Russia Division' },
  ],
  prussia: [
    { at: 'brandenburg', share: 0.35, name: 'Army of Brandenburg', general: ['Friedrich Ludwig of Hohenlohe', 5] },
    { at: 'silesia', share: 0.25, name: 'Army of Silesia', general: ['Gebhard von Blücher', 7] },
    { at: 'east_prussia', share: 0.2, name: 'East Prussian Corps' },
    { at: 'south_prussia', share: 0.2, name: 'Polish Inspection' },
  ],
  ottoman: [
    { at: 'palestine', share: 0.35, name: 'Army of the Grand Vizier', general: ['Yusuf Ziya Pasha', 4] },
    { at: 'constantinople', share: 0.15, name: 'Nizam-ı Cedid' },
    { at: 'bulgaria', share: 0.15, name: 'Danube Army' },
    { at: 'erzurum', share: 0.1, name: 'Army of the East' },
    { at: 'aleppo', share: 0.1, name: 'Syrian Levies' },
    { at: 'macedonia', share: 0.1, name: 'Rumelian Levies' },
    { at: 'bosnia', share: 0.05, name: 'Bosnian Garrison' },
  ],
  spain: [
    { at: 'castile', share: 0.3, name: 'Royal Guard & Army of Castile' },
    { at: 'andalusia', share: 0.25, name: 'Army of Andalusia' },
    { at: 'galicia_es', share: 0.2, name: 'Army of Galicia' },
    { at: 'catalonia', share: 0.15, name: 'Army of Catalonia' },
    { at: 'extremadura', share: 0.1, name: 'Army of Extremadura' },
  ],
  british_east_india_company: [
    { at: 'calcutta', share: 0.25, name: 'Bengal Army', general: ['Alured Clarke', 5] },
    { at: 'madras', share: 0.2, name: 'Madras Army', general: ['George Harris', 6] },
    { at: 'mysore', share: 0.15, name: 'Mysore Field Force', general: ['Arthur Wellesley', 8] },
    { at: 'bombay', share: 0.12, name: 'Bombay Army', general: ['James Stuart', 5] },
    { at: 'hyderabad', share: 0.1, name: 'Hyderabad Subsidiary Force' },
    { at: 'lucknow', share: 0.1, name: 'Awadh Subsidiary Force' },
    { at: 'canara', share: 0.08, name: 'Canara Division' },
  ],
  qing: [
    { at: 'zhili', share: 0.18, name: 'Capital Banners' },
    { at: 'hubei', share: 0.15, name: 'Hubei Suppression Army', general: ['Eledengbao', 6] },
    { at: 'sichuan', share: 0.15, name: 'Sichuan Suppression Army', general: ['Elengtai', 7] },
    { at: 'shaanxi', share: 0.1, name: 'Shaanxi Army', general: ['Delengtai', 6] },
    { at: 'guangdong', share: 0.08, name: 'Guangdong Green Standard' },
    { at: 'fujian', share: 0.06, name: 'Fujian Green Standard' },
    { at: 'dzungaria', share: 0.06, name: 'Ili Garrison' },
    { at: 'kashgaria', share: 0.03, name: 'Kashgar Garrison' },
    { at: 'shengjing', share: 0.06, name: 'Mukden Banners' },
    { at: 'yunnan', share: 0.05, name: 'Yunnan Green Standard' },
    { at: 'jiangsu', share: 0.04, name: 'Jiangnan Green Standard' },
    { at: 'shandong', share: 0.04, name: 'Shandong Green Standard' },
  ],
  maratha: [
    { at: 'pune', share: 0.6, name: 'Huzurat (Peshwa\'s Household)' },
    { at: 'bijapur', share: 0.4, name: 'Patwardhan Horse', general: ['Parashuram Bhau Patwardhan', 5] },
  ],
  scindia: [
    { at: 'agra', share: 0.4, name: 'Perron\'s Brigades', general: ['Pierre Cuillier-Perron', 7] },
    { at: 'ujjain', share: 0.4, name: 'Scindia\'s Household Horse' },
    { at: 'gwalior', share: 0.2, name: 'Gwalior Garrison' },
  ],
  holkar: [{ at: 'nimar', share: 1, name: 'Holkar\'s Horse', general: ['Amir Khan', 6] }],
  hyderabad: [{ at: 'hyderabad', share: 0.7, name: 'Nizam\'s Army' }, { at: 'aurangabad', share: 0.3, name: 'Aurangabad Garrison' }],
  durrani: [{ at: 'kabul', share: 0.4, name: 'Royal Army' }, { at: 'peshawar', share: 0.3, name: 'Peshawar Army' }, { at: 'kandahar', share: 0.3, name: 'Kandahar Army' }],
  qajar_persia: [
    { at: 'tehran', share: 0.4, name: 'Royal Army' },
    { at: 'azerbaijan_ir', share: 0.35, name: 'Army of Azerbaijan', general: ['Abbas Mirza', 6] },
    { at: 'khorasan', share: 0.25, name: 'Army of Khorasan' },
  ],
  usa: [
    { at: 'pennsylvania', share: 0.5, name: 'United States Army', general: ['Alexander Hamilton', 6] },
    { at: 'ohio', share: 0.25, name: 'Western Department', general: ['James Wilkinson', 4] },
    { at: 'new_york', share: 0.25, name: 'New York Militia' },
  ],
  saint_domingue: [
    { at: 'nord_sd', share: 0.4, name: 'Army of the North', general: ['Henri Christophe', 6] },
    { at: 'ouest_sd', share: 0.6, name: 'Army of the West', general: ['Jean-Jacques Dessalines', 7] },
  ],
  nguyen_lords: [
    { at: 'gia_dinh', share: 0.5, name: 'Army of Gia Định', general: ['Lê Văn Duyệt', 8] },
    { at: 'quy_nhon', share: 0.5, name: 'Garrison of Quy Nhơn', general: ['Võ Tánh', 7] },
  ],
  tay_son: [
    { at: 'quang_nam', share: 0.5, name: 'Army of the South', general: ['Trần Quang Diệu', 7] },
    { at: 'phu_xuan', share: 0.3, name: 'Imperial Guard' },
    { at: 'thang_long', share: 0.2, name: 'Army of the North' },
  ],
  tokugawa: [
    { at: 'edo', share: 0.4, name: 'Shogunal Bannermen' },
    { at: 'kinai', share: 0.3, name: 'Osaka Garrison' },
    { at: 'kyushu', share: 0.15, name: 'Kyūshū Domains' },
    { at: 'tohoku', share: 0.15, name: 'Northern Domains' },
  ],
  konbaung: [{ at: 'amarapura', share: 0.6, name: 'Royal Army' }, { at: 'pegu', share: 0.2, name: 'Army of Pegu' }, { at: 'tenasserim', share: 0.2, name: 'Tenasserim Frontier' }],
  siam: [{ at: 'bangkok', share: 0.7, name: 'Royal Army', general: ['Maha Sura Singhanat', 7] }, { at: 'phitsanulok', share: 0.3, name: 'Northern Army' }],
  joseon: [{ at: 'gyeonggi', share: 0.6, name: 'Capital Garrison' }, { at: 'pyongan', share: 0.2, name: 'Northern Command' }, { at: 'gyeongsang', share: 0.2, name: 'Southern Command' }],
  morocco: [{ at: 'fez', share: 0.6, name: 'Abid al-Bukhari' }, { at: 'marrakesh', share: 0.4, name: 'Guich Tribes' }],
  ashanti: [{ at: 'kumasi', share: 0.8, name: 'Asante Army' }, { at: 'bono', share: 0.2, name: 'Northern Wing' }],
};

export const FLEET_DEPLOYMENTS: Record<string, Deployment[]> = {
  great_britain: [
    { at: 'english_channel', share: 0.35, name: 'Channel Fleet', general: ['Earl St Vincent', 8] },
    { at: 'tyrrhenian_sea', share: 0.17, name: 'Mediterranean Fleet', general: ['Lord Keith', 7] },
    { at: 'sicilian_channel', share: 0.08, name: 'Malta Squadron', general: ['Horatio Nelson', 10] },
    { at: 'north_sea', share: 0.12, name: 'North Sea Fleet', general: ['Adam Duncan', 7] },
    { at: 'caribbean_east', share: 0.08, name: 'Leeward Islands Station', general: ['Hugh Seymour', 5] },
    { at: 'bay_of_bengal', share: 0.07, name: 'East Indies Squadron', general: ['Peter Rainier', 6] },
    { at: 'iberian_coast', share: 0.08, name: 'Cádiz Blockade Squadron' },
    { at: 'cape_sea', share: 0.05, name: 'Cape Squadron' },
  ],
  france: [
    { at: 'bay_of_biscay', share: 0.75, name: 'Brest Fleet', general: ['Étienne Eustache Bruix', 6] },
    { at: 'western_med', share: 0.25, name: 'Toulon Squadron', general: ['Honoré Ganteaume', 5] },
  ],
  spain: [
    { at: 'bay_of_biscay', share: 0.25, name: 'Mazarredo\'s Squadron (Brest)', general: ['José de Mazarredo', 7] },
    { at: 'iberian_coast', share: 0.3, name: 'Fleet of Cádiz', general: ['Federico Gravina', 6] },
    { at: 'western_med', share: 0.2, name: 'Cartagena Squadron' },
    { at: 'caribbean_west', share: 0.15, name: 'Havana Squadron' },
    { at: 'alboran_sea', share: 0.1, name: 'Algeciras Flotilla' },
  ],
  russia: [
    { at: 'gulf_of_finland', share: 0.55, name: 'Baltic Fleet' },
    { at: 'black_sea_west', share: 0.25, name: 'Black Sea Fleet' },
    { at: 'ionian_sea', share: 0.2, name: 'Mediterranean Squadron', general: ['Fyodor Ushakov', 9] },
  ],
  ottoman: [{ at: 'aegean_sea', share: 0.6, name: 'Imperial Fleet', general: ['Kadir Bey', 5] }, { at: 'levantine_sea', share: 0.4, name: 'Levant Squadron' }],
  portugal: [{ at: 'iberian_coast', share: 0.7, name: 'Lisbon Squadron' }, { at: 'sicilian_channel', share: 0.3, name: 'Niza\'s Squadron', general: ['Marquis of Niza', 5] }],
  usa: [{ at: 'us_east_coast', share: 0.5, name: 'Atlantic Squadron', general: ['Thomas Truxtun', 7] }, { at: 'caribbean_east', share: 0.5, name: 'Guadeloupe Station', general: ['Silas Talbot', 5] }],
  qing: [{ at: 'south_china_sea_north', share: 0.5, name: 'Guangdong Water Force' }, { at: 'east_china_sea', share: 0.3, name: 'Fujian Water Force' }, { at: 'yellow_sea', share: 0.2, name: 'Shandong Water Force' }],
};

export const START_REBELS: { province: string; against: string; infantry: number; irregulars: number; cause: string; name: string; control?: boolean }[] = [
  { province: 'hubei', against: 'qing', infantry: 0, irregulars: 26, cause: 'White Lotus Society', name: 'White Lotus (Xiangyang)' },
  { province: 'sichuan', against: 'qing', infantry: 0, irregulars: 30, cause: 'White Lotus Society', name: 'White Lotus (Dazhou)' },
  { province: 'shaanxi', against: 'qing', infantry: 0, irregulars: 16, cause: 'White Lotus Society', name: 'White Lotus (Hanzhong)' },
  { province: 'sud_sd', against: 'saint_domingue', infantry: 8, irregulars: 5, cause: 'André Rigaud\'s southern army', name: 'Army of the South (Rigaud)', control: true },
  { province: 'brittany', against: 'france', infantry: 0, irregulars: 6, cause: 'Chouans', name: 'Royal Catholic Army (Chouans)' },
];

export const FORT_LEVELS: Record<string, number> = {
  malta: 4, genoa: 3, lombardy: 3, constantinople: 3, lower_canada: 3, havana: 3, cartagena: 3, mysore: 2, gwalior: 3, bharatpur: 3,
  agra: 2, ahmednagar: 2, delhi: 2, lahore: 2, kabul: 2, kandahar: 2, herat: 2, lorraine: 3, alsace: 3, picardy: 3, magdeburg: 3,
  kiev: 2, smolensk: 2, livonia: 2, st_petersburg: 3, novorossiya: 2, crimea: 2, erzurum: 2, vidin: 3, serbia: 3, acre: 3, cairo: 2,
  delta: 2, lisbon: 2, andalusia: 3, galicia_es: 2, provence: 3, brittany: 3, west_country: 2, london: 2, cape: 2, colombo: 2,
  calcutta: 3, madras: 3, bombay: 3, zhili: 3, jiangsu: 2, edo: 2, kinai: 2, gyeonggi: 2, amarapura: 2, bangkok: 2, phu_xuan: 3,
  gia_dinh: 2, quy_nhon: 2, batavia: 2, manila: 3, fez: 2, algiers: 3, tunis: 2, tripolitania: 2, veracruz: 2, lima: 2, montevideo: 2,
  rio_de_janeiro: 2, bahia: 2, nova_scotia: 2, jamaica: 2, venetia: 2, bohemia: 2, silesia: 2, east_prussia: 2, lower_austria: 3,
  dalmatia: 1, upper_hungary: 1, transylvania: 1, chhattisgarh: 1, nagpur: 2, pune: 2, hyderabad: 2, lucknow: 1, kumasi: 1, dahomey: 1,
  kandy: 2, amritsar: 1, kashmir: 1, peshawar: 1, multan: 2, montenegro: 1,
};

export const HISTORICAL_SUCCESSORS: Record<string, RulerTuple[]> = {
  usa: [['Thomas Jefferson', 1743, 7, 7, 2], ['Aaron Burr', 1756, 4, 5, 3], ['Charles Cotesworth Pinckney', 1746, 4, 5, 5], ['James Madison', 1751, 7, 6, 2]],
};

export const START_FLAGS: Record<string, number | string | boolean> = {
  papal_sede_vacante: true,
  irish_union_pending: true,
  nana_fadnavis: true,
  egypt_expedition: true,
};
