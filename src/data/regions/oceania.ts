import { P } from '../define';
import type { PolityDef, ProvinceSeed } from '../../game/types';

// Australia, Aotearoa and the Pacific, 1 January 1800.
// Māori iwi are represented as autonomous kin-based polities led by rangatira; Aboriginal
// Australia comprised hundreds of distinct nations and is shown as an aggregate.

const OC = { cont: 'OC' as const, region: 'Oceania', tech: 'pacific' as const, cg: 'polynesian' as const, rel: 'traditional' as const };
const IWI = { ...OC, type: 'decentralized' as const, por: 'council' as const, gov: 'Iwi of hapū led by rangatira', title: 'Rangatira', diff: 4,
  laws: { government: 'consensus' as const, military: 'warrior_tradition' as const } };

export const POLITIES: PolityDef[] = [
  P('new_south_wales', 'Colony of New South Wales', {
    ...OC, cg: 'british', rel: 'protestant', short: 'New South Wales', adj: 'Australian', alias: ['new south wales', 'sydney', 'botany bay', 'australia'], type: 'colony', tax: 0.1, eff: 0.5,
    gov: 'Penal colony under a naval governor', title: 'Governor', ruler: ['John Hunter', 1737, 3, 3, 3], cap: 'sydney', capName: 'Sydney', cul: 'Anglo-Australian',
    pop: 0.005, gdp: 8, army: [1, 0, 0, 0], navy: [0, 1, 2], tech: 'western_europe', ov: 'great_britain', sub: 'colony', color: '#c87a74', flag: 'special union1606', por: 'euro', diff: 5,
    intro: 'Twelve years after the First Fleet, a few thousand convicts, marines and settlers cling to the Cumberland Plain. The New South Wales Corps profits from rum; the Darug and Eora resist the spreading farms.',
  }),
  P('aboriginal_australia', 'Aboriginal Nations of Australia', {
    ...OC, cg: 'aboriginal', short: 'Aboriginal Australia', adj: 'Aboriginal', type: 'decentralized', agg: true, gov: 'Hundreds of sovereign nations and clans', title: 'Elders',
    ruler: ['Councils of Elders', 1760, 2, 3, 3], cap: 'central_australia', cul: 'Aboriginal Australian', pop: 0.4, gdp: 2, army: [0, 0, 0, 3], tech: 'indigenous', por: 'council', diff: 5,
    intro: 'More than two hundred and fifty language groups have cared for Country across the continent for tens of thousands of years.',
  }),
  P('palawa', 'Palawa Nations (Lutruwita)', {
    ...OC, cg: 'aboriginal', short: 'Lutruwita', adj: 'Palawa', type: 'decentralized', agg: true, gov: 'Nine nations of Lutruwita (Tasmania)', title: 'Elders',
    ruler: ['Councils of Elders', 1760, 2, 2, 3], cap: 'lutruwita', cul: 'Palawa', pop: 0.005, gdp: 2, army: [0, 0, 0, 0.5], tech: 'indigenous', por: 'council', diff: 5,
    intro: 'The peoples of Tasmania, separated from the mainland for ten thousand years. No colonist has yet settled their island.',
  }),
  P('ngapuhi', 'Ngāpuhi', {
    ...IWI, short: 'Ngāpuhi', adj: 'Ngāpuhi', alias: ['ngapuhi', 'bay of islands', 'maori', 'hongi hika'], ruler: ['Hongi Hika (rangatira)', 1772, 4, 4, 7],
    cap: 'tai_tokerau', cul: 'Māori', pop: 0.02, gdp: 3, army: [0, 0, 0, 2], navy: [0, 0, 3], color: '#8a5f4a', pers: { aggression: 0.6 },
    intro: 'The populous iwi of the Bay of Islands, where whaling ships call for timber and potatoes. Young Hongi Hika understands what muskets could do.',
  }),
  P('ngati_whatua', 'Ngāti Whātua', {
    ...IWI, short: 'Ngāti Whātua', adj: 'Ngāti Whātua', alias: ['ngati whatua', 'kaipara', 'tamaki'], ruler: ['Rangatira of Ngāti Whātua', 1760, 3, 4, 4],
    cap: 'kaipara', cul: 'Māori', pop: 0.005, gdp: 3, army: [0, 0, 0, 0.6], navy: [0, 0, 2], color: '#9a6a52',
    intro: 'Holders of the Kaipara harbour and the Tāmaki isthmus, rivals of Ngāpuhi to the north.',
  }),
  P('tainui', 'Waikato-Tainui', {
    ...IWI, short: 'Tainui', adj: 'Tainui', alias: ['tainui', 'waikato', 'ngati toa', 'kawhia'], ruler: ['Rangatira of Waikato', 1760, 4, 4, 5],
    cap: 'waikato', cul: 'Māori', pop: 0.015, gdp: 3, army: [0, 0, 0, 1.5], navy: [0, 0, 2], color: '#7f6a52',
    intro: 'The Tainui confederation of the Waikato river and Kāwhia harbour, where the young Ngāti Toa leader Te Rauparaha is making his name.',
  }),
  P('te_arawa', 'Te Arawa', {
    ...IWI, short: 'Te Arawa', adj: 'Te Arawa', alias: ['te arawa', 'rotorua'], ruler: ['Rangatira of Te Arawa', 1760, 3, 4, 4],
    cap: 'rotorua', cul: 'Māori', pop: 0.01, gdp: 3, army: [0, 0, 0, 1], color: '#8f7a5a',
    intro: 'The people of the Arawa canoe around the thermal lakes of Rotorua.',
  }),
  P('ngati_porou', 'Ngāti Porou', {
    ...IWI, short: 'Ngāti Porou', adj: 'Ngāti Porou', alias: ['ngati porou', 'east cape'], ruler: ['Rangatira of Ngāti Porou', 1760, 3, 4, 4],
    cap: 'tairawhiti', cul: 'Māori', pop: 0.012, gdp: 3, army: [0, 0, 0, 1.2], color: '#946a5a',
    intro: 'The iwi of the East Cape beneath sacred Hikurangi, the first land to greet the sun.',
  }),
  P('ngati_kahungunu', 'Ngāti Kahungunu', {
    ...IWI, short: 'Ngāti Kahungunu', adj: 'Kahungunu', alias: ['ngati kahungunu', 'hawkes bay', 'wairarapa'], ruler: ['Rangatira of Kahungunu', 1760, 3, 4, 4],
    cap: 'heretaunga', cul: 'Māori', pop: 0.012, gdp: 3, army: [0, 0, 0, 1.2], color: '#8a7f62',
    intro: 'A large iwi of the fertile east coast from Hawke\'s Bay to Wairarapa.',
  }),
  P('te_ati_awa', 'Te Āti Awa & Taranaki Iwi', {
    ...IWI, short: 'Taranaki', adj: 'Taranaki', alias: ['te ati awa', 'taranaki', 'whanganui'], ruler: ['Rangatira of Taranaki', 1760, 3, 4, 4],
    cap: 'taranaki', cul: 'Māori', pop: 0.012, gdp: 3, army: [0, 0, 0, 1.2], color: '#7a8a6a',
    intro: 'The iwi around Taranaki maunga and the Whanganui river.',
  }),
  P('ngai_tahu', 'Ngāi Tahu', {
    ...IWI, short: 'Ngāi Tahu', adj: 'Ngāi Tahu', alias: ['ngai tahu', 'kai tahu', 'south island', 'te waipounamu'], ruler: ['Rangatira of Ngāi Tahu', 1760, 3, 4, 4],
    cap: 'kaiapoi', cul: 'Māori', pop: 0.006, gdp: 3, army: [0, 0, 0, 0.8], color: '#6f8a7a',
    intro: 'The iwi of Te Waipounamu, guardians of the greenstone trade from their pā at Kaiapoi.',
  }),
  P('hawaii', 'Kingdom of Hawaiʻi', {
    ...OC, short: 'Hawaiʻi', adj: 'Hawaiian', alias: ['hawaii', 'hawaiian', 'sandwich islands', 'kamehameha'], type: 'monarchy', gov: 'Monarchy over the conquered islands', title: 'Mōʻī',
    ruler: ['Kamehameha I', 1758, 7, 6, 8, 'Keōua'], heir: ['Liholiho', 1797, 2, 2, 1], cap: 'hawaii_island', capName: 'Hilo', cul: 'Hawaiian', pop: 0.2, gdp: 4,
    army: [2, 0, 0, 4], navy: [0, 1, 20], color: '#c47a4a', flag: 'solid c8102e e=spiral/f6d200', por: 'council', diff: 3, pers: { aggression: 0.6, reform: 0.85 },
    intro: 'Kamehameha has united every island except Kauaʻi by conquest and is building the "Peleleu" fleet of war canoes and schooners at Hilo, with Western advisors like John Young, to finish the task.',
  }),
  P('kauai', 'Kauaʻi', {
    ...OC, short: 'Kauaʻi', adj: 'Kauaian', alias: ['kauai', 'niihau', 'kaumualii'], type: 'monarchy', gov: 'Independent chiefdom', title: 'Aliʻi Nui', ruler: ['Kaumualiʻi', 1778, 4, 5, 4],
    cap: 'kauai', cul: 'Hawaiian', pop: 0.03, gdp: 4, army: [0.3, 0, 0, 1], navy: [0, 0, 6], color: '#a8805a', por: 'council', diff: 5,
    intro: 'The last independent Hawaiian kingdom, protected by the treacherous channel that wrecked Kamehameha\'s invasion of 1796.',
  }),
  P('tahiti', 'Tahiti (Pōmare)', {
    ...OC, short: 'Tahiti', adj: 'Tahitian', alias: ['tahiti', 'pomare', 'society islands'], type: 'monarchy', gov: 'Paramount chiefdom of the Pōmare', title: 'Ariʻi Rahi', ruler: ['Pōmare I (Tu)', 1743, 4, 5, 4, 'Pōmare'],
    heir: ['Pōmare II', 1774, 3, 4, 4, 'Pōmare'], cap: 'tahiti', cul: 'Tahitian', pop: 0.02, gdp: 4, army: [0, 0, 0, 1], navy: [0, 0, 6], color: '#c48a6a', por: 'council', diff: 5,
    intro: 'The Pōmare family, backed by musket-armed mutineers and missionaries of the London Missionary Society, seek to rule all Tahiti.',
  }),
  P('tonga', 'Tongan Chiefdoms', {
    ...OC, short: 'Tonga', adj: 'Tongan', alias: ['tonga', 'tongan', 'friendly islands'], type: 'feudal', gov: 'Chiefly confederation in civil war', title: 'Tuʻi Kanokupolu', ruler: ['Tongan High Chiefs (civil war)', 1760, 3, 3, 5],
    cap: 'tonga', cul: 'Tongan', pop: 0.03, gdp: 4, army: [0, 0, 0, 1.5], navy: [0, 0, 6], color: '#a0605a', por: 'council', diff: 5, stab: 20,
    intro: 'The assassination of Tuʻi Kanokupolu Tukuʻaho in 1799 plunged the "Friendly Islands" into civil war.',
  }),
  P('samoa', 'Samoan Chiefdoms', {
    ...OC, short: 'Samoa', adj: 'Samoan', alias: ['samoa', 'samoan'], type: 'decentralized', gov: 'Fa\'amatai chiefly councils (fono)', title: 'Matai', ruler: ['Fono of Matai', 1760, 3, 4, 3],
    cap: 'samoa', cul: 'Samoan', pop: 0.04, gdp: 4, army: [0, 0, 0, 1.5], navy: [0, 0, 4], por: 'council', diff: 5,
    intro: 'Villages and districts governed by matai councils, with the paramount titles contested among great families.',
  }),
  P('fiji', 'Bau (Fiji)', {
    ...OC, cg: 'melanesian', short: 'Bau', adj: 'Fijian', alias: ['fiji', 'fijian', 'bau'], type: 'feudal', gov: 'Paramount chiefdom of Bau among Fijian matanitu', title: 'Vunivalu',
    ruler: ['Vunivalu of Bau', 1760, 3, 3, 5], cap: 'viti_levu', cul: 'Fijian', pop: 0.12, gdp: 4, army: [0, 0, 0, 3], navy: [0, 0, 8], color: '#8a6a5a', por: 'council', diff: 4,
    intro: 'The small island of Bau is building naval power among the rival chiefdoms of Fiji; sandalwood traders have just begun to arrive.',
  }),
  P('palau', 'Koror (Palau)', {
    ...OC, cg: 'melanesian', short: 'Palau', adj: 'Palauan', alias: ['palau', 'koror', 'belau'], type: 'monarchy', gov: 'Paramount chiefdom', title: 'Ibedul', ruler: ['Ibedul of Koror', 1760, 3, 4, 3],
    cap: 'palau', cul: 'Palauan', pop: 0.02, gdp: 4, army: [0, 0, 0, 0.5], navy: [0, 0, 3], color: '#6f8a8a', por: 'council', diff: 5,
    intro: 'Koror\'s Ibedul befriended the shipwrecked British crew of the Antelope and has used their guns against rival Melekeok.',
  }),
  P('pacific_peoples', 'Pacific Island Societies', {
    ...OC, cg: 'melanesian', short: 'Pacific islands', adj: 'Pacific', type: 'decentralized', agg: true, gov: 'Autonomous island chiefdoms and communities', title: 'Chiefs',
    ruler: ['Island Chiefs', 1760, 2, 3, 3], cap: 'new_caledonia', cul: 'Kanak', pop: 0.4, gdp: 3, army: [0, 0, 0, 3], navy: [0, 0, 6], por: 'council', diff: 5,
    intro: 'Kanak chiefdoms of New Caledonia, the peoples of Vanuatu and the Solomons, Marquesan valleys, Rapa Nui and the atolls of Micronesia.',
  }),
];

export const PROVINCES: ProvinceSeed[] = [
  ['sydney', 'Sydney & the Cumberland Plain', 151.0, -33.8, 'new_south_wales', 'hills', 'livestock', 1],
  ['central_australia', 'Aboriginal Australia', 133.0, -24.0, 'aboriginal_australia', 'desert', 'livestock', 1, [
    [144.0, -20.0], [122.0, -26.0], [131.0, -13.0], [145.0, -37.2], [138.6, -34.5], [116.0, -31.5], [125.5, -17.5], [148.5, -29.5], [143.0, -14.5],
    [139.0, -29.0], [128.0, -30.5], [150.2, -32.4], [149.4, -35.4], [151.6, -28.2], [146.0, -26.0], [118.0, -22.0], [136.5, -18.5], [141.0, -25.0]]],
  ['lutruwita', 'Lutruwita (Van Diemen\'s Land)', 146.6, -42.0, 'palawa', 'forest', 'fish', 1],
  ['tai_tokerau', 'Te Tai Tokerau', 173.8, -35.3, 'ngapuhi', 'forest', 'timber', 1, [[173.2, -34.8]]],
  ['kaipara', 'Kaipara & Tāmaki', 174.4, -36.5, 'ngati_whatua', 'forest', 'fish', 1],
  ['waikato', 'Waikato & Kāwhia', 175.2, -37.8, 'tainui', 'farmland', 'grain', 1, [[174.9, -38.2]]],
  ['rotorua', 'Rotorua Lakes & Bay of Plenty', 176.3, -38.2, 'te_arawa', 'forest', 'fish', 1],
  ['tairawhiti', 'Te Tairāwhiti (East Cape)', 177.9, -38.1, 'ngati_porou', 'hills', 'fish', 1],
  ['heretaunga', 'Heretaunga & Wairarapa', 176.7, -39.7, 'ngati_kahungunu', 'hills', 'grain', 1, [[175.6, -41.1]]],
  ['taranaki', 'Taranaki & Whanganui', 174.3, -39.3, 'te_ati_awa', 'forest', 'fish', 1, [[175.1, -40.0], [174.9, -41.2]]],
  ['kaiapoi', 'Te Waipounamu', 172.5, -43.4, 'ngai_tahu', 'hills', 'gems', 1, [[169.6, -45.6], [171.2, -42.4], [173.4, -41.4], [167.8, -46.6]]],
  ['hawaii_island', 'Hawaiʻi Island', -155.5, 19.6, 'hawaii', 'hills', 'livestock', 2],
  ['maui', 'Maui, Molokaʻi & Lānaʻi', -156.5, 20.85, 'hawaii', 'hills', 'livestock', 1],
  ['oahu', 'Oʻahu', -158.0, 21.45, 'hawaii', 'hills', 'livestock', 1],
  ['kauai', 'Kauaʻi & Niʻihau', -159.5, 22.05, 'kauai', 'hills', 'livestock', 1],
  ['tahiti', 'Tahiti & the Society Islands', -149.4, -17.65, 'tahiti', 'hills', 'fish', 1],
  ['tonga', 'Tonga', -175.2, -21.15, 'tonga', 'hills', 'fish', 1],
  ['samoa', 'Samoa', -172.2, -13.7, 'samoa', 'hills', 'fish', 1, [[-171.7, -13.95]]],
  ['viti_levu', 'Fiji', 178.2, -17.8, 'fiji', 'hills', 'timber', 1, [[179.2, -16.6]]],
  ['palau', 'Palau', 134.5, 7.4, 'palau', 'jungle', 'fish', 1],
  ['new_caledonia', 'New Caledonia', 165.6, -21.3, 'pacific_peoples', 'hills', 'timber', 1],
  ['vanuatu', 'Vanuatu', 167.6, -16.0, 'pacific_peoples', 'jungle', 'timber', 1],
  ['solomons', 'Solomon Islands', 159.6, -8.6, 'pacific_peoples', 'jungle', 'fish', 1, [[155.6, -6.4]]],
  ['marquesas', 'Marquesas', -140.0, -9.0, 'pacific_peoples', 'hills', 'fish', 0.5],
  ['rapa_nui', 'Rapa Nui', -109.35, -27.12, 'pacific_peoples', 'plains', 'fish', 0.2],
  ['carolines', 'Caroline Islands', 151.8, 7.4, 'pacific_peoples', 'jungle', 'fish', 0.5, [[158.2, 6.9], [138.1, 9.5]]],
  ['kerguelen', 'Kerguelen (uninhabited)', 69.5, -49.3, null, 'tundra', 'fish', 0.01],
  ['south_georgia', 'South Georgia (uninhabited)', -36.6, -54.3, null, 'tundra', 'fish', 0.01],
  ['galapagos', 'Galápagos (uninhabited)', -90.5, -0.6, null, 'desert', 'fish', 0.01],
];
