import { BUILDING_BY_ID } from '../data/buildings';
import { defaultLaws, lawOption } from '../data/laws';
import {
  ARMY_DEPLOYMENTS, EXTRA_CORES, FLEET_DEPLOYMENTS, FORT_LEVELS, NEUTRAL_SUBJECTS, OCCUPATIONS, START_FLAGS, START_REBELS,
  START_RELATIONS, START_SIEGES, START_TREATIES, START_WARS,
} from '../data/scenario';
import { TECH_BY_ID, TECH_PROFILES } from '../data/technologies';
import { appointCouncil, generateGeneral, makeCharacter, rulerTraits } from './characters';
import { GOODS, REBELS, SCHEMA_VERSION, SUBJECT_TYPES } from './constants';
import { calibrateRevenue, emptyLedger } from './economy';
import { maxManpower } from './military';
import { randInt, seedRng } from './rng';
import { addOpinion, chronicle, def, forcesChanged, newId, relKey } from './state';
import { coastalSeas, isCoastal, OUTPOST_DEFS, POLITY_LIST, PROVINCE_DEFS, PROVINCE_IDS } from './static';
import type {
  Army, BuildingId, CountryState, Difficulty, FactionId, Fleet, LawCategory, PolityDef, ProvinceState, Religion, ShipCounts, TradeGoodId, UnitCounts, WorldState,
} from './types';

export interface NewGameOptions {
  playerId: string;
  seed?: number;
  name?: string;
  difficulty?: Difficulty;
}

// Where a province's population differs in culture or faith from its rulers.
const POP_BY_OWNER: Record<string, { culture?: string; religion?: Religion }> = {
  british_east_india_company: { culture: 'Indian', religion: 'hindu' },
  hyderabad: { culture: 'Telugu', religion: 'hindu' },
  awadh: { religion: 'hindu' },
  carnatic: { culture: 'Tamil', religion: 'hindu' },
  dutch_east_indies: { religion: 'sunni' },
  sikh_misls: { religion: 'sunni' },
  mughal: { religion: 'hindu' },
  saint_domingue: { religion: 'catholic' },
};

const POP_BY_PROVINCE: Record<string, { culture?: string; religion?: Religion }> = {
  bulgaria: { culture: 'Bulgarian', religion: 'orthodox' }, thrace: { culture: 'Bulgarian', religion: 'orthodox' }, macedonia: { culture: 'Greek', religion: 'orthodox' },
  serbia: { culture: 'Serb', religion: 'orthodox' }, bosnia: { culture: 'Bosniak' }, morea: { culture: 'Greek', religion: 'orthodox' }, livadia: { culture: 'Greek', religion: 'orthodox' },
  crete: { culture: 'Greek', religion: 'orthodox' }, cyprus: { culture: 'Greek', religion: 'orthodox' }, thessaly: { culture: 'Greek', religion: 'orthodox' }, epirus: { culture: 'Greek', religion: 'orthodox' },
  cairo: { culture: 'Egyptian Arab' }, delta: { culture: 'Egyptian Arab' }, upper_egypt: { culture: 'Egyptian Arab' }, aleppo: { culture: 'Syrian Arab' }, damascus: { culture: 'Syrian Arab' },
  acre: { culture: 'Syrian Arab' }, palestine: { culture: 'Syrian Arab' }, mosul: { culture: 'Kurdish' }, van: { culture: 'Kurdish' }, diyarbakir: { culture: 'Kurdish' }, massawa: { culture: 'Tigre' },
  zanzibar: { culture: 'Swahili', religion: 'sunni' }, kilwa: { culture: 'Swahili', religion: 'sunni' },
  dzungaria: { culture: 'Mongol', religion: 'vajrayana' }, kashgaria: { culture: 'Uyghur', religion: 'sunni' }, inner_mongolia: { culture: 'Mongol', religion: 'vajrayana' },
  qinghai: { culture: 'Tibetan', religion: 'vajrayana' }, jilin: { culture: 'Manchu' }, heilongjiang: { culture: 'Manchu' }, shengjing: { culture: 'Manchu' },
  lithuania: { culture: 'Lithuanian', religion: 'catholic' }, minsk: { culture: 'Belarusian' }, volhynia: { culture: 'Ukrainian' }, podolia: { culture: 'Ukrainian' },
  kiev: { culture: 'Ukrainian' }, chernigov: { culture: 'Ukrainian' }, kharkov: { culture: 'Ukrainian' }, livonia: { culture: 'Estonian', religion: 'protestant' },
  courland: { culture: 'Latvian', religion: 'protestant' }, kazan: { culture: 'Tatar', religion: 'sunni' }, ufa: { culture: 'Bashkir', religion: 'sunni' },
  crimea: { culture: 'Crimean Tatar', religion: 'sunni' }, astrakhan: { culture: 'Tatar', religion: 'sunni' }, tobolsk: { culture: 'Siberian Tatar' },
  yakutsk: { culture: 'Sakha', religion: 'traditional' }, kamchatka: { culture: 'Itelmen', religion: 'traditional' }, turukhansk: { culture: 'Evenki', religion: 'traditional' },
  berezov: { culture: 'Nenets', religion: 'traditional' }, kolyma: { culture: 'Yukaghir', religion: 'traditional' }, okhotsk: { culture: 'Even', religion: 'traditional' },
  hungary: { culture: 'Hungarian' }, upper_hungary: { culture: 'Slovak' }, banat: { culture: 'Serb', religion: 'orthodox' }, transylvania: { culture: 'Romanian', religion: 'orthodox' },
  bohemia: { culture: 'Czech' }, moravia: { culture: 'Czech' }, galicia: { culture: 'Polish' }, west_galicia: { culture: 'Polish' }, bukovina: { culture: 'Romanian', religion: 'orthodox' },
  croatia: { culture: 'Croat' }, slavonia: { culture: 'Croat' }, dalmatia: { culture: 'Croat' }, lombardy: { culture: 'Lombard' }, venetia: { culture: 'Venetian' }, legations: { culture: 'Emilian' },
  south_prussia: { culture: 'Polish', religion: 'catholic' }, masovia: { culture: 'Polish', religion: 'catholic' }, new_east_prussia: { culture: 'Polish', religion: 'catholic' },
  west_prussia: { culture: 'Polish', religion: 'catholic' }, silesia: { religion: 'catholic' },
  brabant: { culture: 'Belgian' }, flanders: { culture: 'Flemish' }, liege: { culture: 'Walloon' }, roer: { culture: 'Rhinelander' }, saar_moselle: { culture: 'Rhinelander' },
  mont_tonnerre: { culture: 'Rhinelander' }, corsica: { culture: 'Corsican' }, nice: { culture: 'Niçard' }, malta: { culture: 'Maltese' },
  lahore: { religion: 'sikh' }, jalandhar: { religion: 'sikh' }, delhi: { religion: 'sunni' }, kashmir: { culture: 'Kashmiri' }, multan: { culture: 'Punjabi' },
  peshawar: { culture: 'Pashtun' }, cape: { culture: 'Cape Dutch', religion: 'protestant' }, graaff_reinet: { culture: 'Cape Dutch', religion: 'protestant' },
  colombo: { culture: 'Sinhalese', religion: 'theravada' }, jaffna: { culture: 'Tamil', religion: 'hindu' }, trincomalee: { culture: 'Tamil', religion: 'hindu' },
  goa: { culture: 'Konkani', religion: 'catholic' }, luanda: { culture: 'Mbundu', religion: 'catholic' }, mozambique: { culture: 'Makua', religion: 'traditional' },
  timor_east: { culture: 'Timorese' }, guine: { culture: 'Papel', religion: 'traditional' }, suriname: { culture: 'Surinamese' }, demerara: { culture: 'Guyanese' },
  yucatan: { culture: 'Maya' }, oaxaca: { culture: 'Zapotec' }, guatemala: { culture: 'Maya' }, chiapas: { culture: 'Maya' }, cuzco: { culture: 'Quechua' }, puno: { culture: 'Aymara' },
  la_paz: { culture: 'Aymara' }, charcas: { culture: 'Quechua' }, quito: { culture: 'Quechua' }, paraguay: { culture: 'Guaraní' },
};

function initialFactions(p: PolityDef, laws: Record<LawCategory, string>): CountryState['factions'] {
  const t = p.polityType;
  const raw: Record<FactionId, number> = {
    nobility: t === 'republic' || t === 'city_state' ? 10 : t === 'decentralized' || t === 'nomadic' ? 20 : 32,
    clergy: t === 'theocracy' ? 40 : 14,
    military: 12 + p.personality.aggression * 12,
    merchants: t === 'city_state' ? 40 : 8 + p.personality.mercantile * 16,
    commons: t === 'decentralized' || t === 'confederation' ? 35 : 15,
    reformers: t === 'republic' ? 20 : ['britain', 'western_europe', 'usa'].includes(p.techProfile) ? 10 : 4,
  };
  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  const out = {} as CountryState['factions'];
  for (const f of Object.keys(raw) as FactionId[]) {
    let loyalty = 60;
    for (const [cat, opt] of Object.entries(laws)) loyalty += (lawOption(cat as LawCategory, opt)?.factions[f] ?? 0) * 0.6;
    out[f] = { influence: Math.round((raw[f] / total) * 100), loyalty: Math.max(15, Math.min(90, Math.round(loyalty))) };
  }
  return out;
}

function startingBuildings(p: PolityDef | undefined, id: string, weight: number, capital: boolean): Partial<Record<BuildingId, number>> {
  const b: Partial<Record<BuildingId, number>> = {};
  if (!p) return b;
  const western = ['britain', 'western_europe', 'central_europe', 'usa'].includes(p.techProfile);
  const settled = !['decentralized', 'nomadic'].includes(p.polityType);
  if (!settled) return b;
  if (p.gdpPc >= 9 && weight >= 2) b.road = 1;
  if (p.gdpPc >= 14 && weight >= 4) b.road = 2;
  if (weight >= 4 || capital) b.market = 1;
  if (isCoastal(id) && (weight >= 2 || capital)) b.port = 1;
  if (weight >= 3) b.temple = 1;
  if (western && weight >= 3) b.school = 1;
  if (western && weight >= 5) b.workshop = 1;
  if (capital) { b.courthouse = 1; b.barracks = 1; if (p.techProfile !== 'pacific' && p.techProfile !== 'indigenous') b.temple = Math.max(1, b.temple ?? 0); }
  if (capital && western && p.population > 2_000_000) b.university = 1;
  return b;
}

const SPECIAL_BUILDINGS: Record<string, Partial<Record<BuildingId, number>>> = {
  lancashire: { textile_mill: 2, workshop: 2, canal: 1 }, midlands: { ironworks: 1, steam_works: 1, workshop: 2, canal: 1 },
  lowlands: { ironworks: 1, university: 1 }, london: { shipyard: 1, port: 2, workshop: 2, arsenal: 1, university: 1 }, yorkshire: { workshop: 1, textile_mill: 1 },
  wales: { ironworks: 1, mine: 1 }, northumbria: { mine: 1 }, west_country: { shipyard: 1 }, brittany: { shipyard: 1 }, provence: { shipyard: 1 },
  ile_de_france: { arsenal: 1, workshop: 2, university: 1 }, lyonnais: { workshop: 2 }, picardy: { workshop: 1 }, flanders: { workshop: 1 }, liege: { mine: 1, workshop: 1 },
  holland: { shipyard: 1, port: 2, market: 2, university: 1 }, andalusia: { shipyard: 1 }, galicia_es: { shipyard: 1 }, catalonia: { workshop: 1 },
  st_petersburg: { shipyard: 1, arsenal: 1 }, perm: { ironworks: 1, mine: 1 }, crimea: { shipyard: 1 }, constantinople: { shipyard: 1, arsenal: 1 },
  silesia: { workshop: 1, mine: 1 }, bohemia: { workshop: 1 }, lower_austria: { arsenal: 1 }, brandenburg: { arsenal: 1 }, dresden: { mine: 1, workshop: 1 },
  calcutta: { workshop: 2, port: 2, arsenal: 1 }, dacca: { workshop: 2 }, bombay: { shipyard: 1, port: 2 }, madras: { port: 2 }, surat: { workshop: 1 },
  ahmedabad: { workshop: 1 }, agra: { arsenal: 1 }, mysore: { arsenal: 1 }, jiangsu: { workshop: 2, canal: 1, market: 2 }, zhejiang: { workshop: 2, canal: 1 },
  jiangxi: { workshop: 2 }, guangdong: { workshop: 1, port: 2, market: 2 }, zhili: { canal: 1, arsenal: 1 }, shandong: { canal: 1 },
  kinai: { workshop: 2, market: 2 }, edo: { workshop: 1, market: 2 }, havana: { shipyard: 1 }, veracruz: { port: 2 }, guanajuato: { mine: 2 },
  zacatecas: { mine: 2 }, charcas: { mine: 2 }, minas_gerais: { mine: 2 }, massachusetts: { shipyard: 1, workshop: 1 }, pennsylvania: { workshop: 1 },
  new_york: { port: 2 }, cape: { port: 1 }, gia_dinh: { shipyard: 1 },
};

export function createWorld(opts: NewGameOptions): WorldState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const w: WorldState = {
    schemaVersion: SCHEMA_VERSION,
    campaign: { id: `c${Date.now().toString(36)}`, name: opts.name ?? `${def(opts.playerId).short} 1800`, created: Date.now(), seed, difficulty: opts.difficulty ?? 'normal' },
    rng: seedRng(seed),
    turn: 0,
    playerId: opts.playerId,
    countries: {}, provinces: {}, outposts: {}, characters: {}, armies: {}, fleets: {}, wars: {}, treaties: [], relations: {},
    construction: [], recruitment: [], pendingEvents: [], eventMemory: {}, offers: [], chronicle: [], battles: [], notifications: [],
    prices: Object.fromEntries(Object.entries(GOODS).map(([g, d]) => [g, d.price])) as Record<TradeGoodId, number>,
    playerHistory: [], decisions: [], nextId: 0, flags: { ...START_FLAGS, ver: 0 },
    settings: { pauseOnEvents: true, autosaveMonths: 3 },
  };

  // Provinces
  const weightSum = new Map<string, number>();
  for (const id of PROVINCE_IDS) {
    const o = PROVINCE_DEFS[id].startOwner;
    if (o) weightSum.set(o, (weightSum.get(o) ?? 0) + PROVINCE_DEFS[id].weight);
  }
  for (const id of PROVINCE_IDS) {
    const pd = PROVINCE_DEFS[id];
    const owner = pd.startOwner;
    const od = owner ? def(owner) : undefined;
    const popK = od ? (od.population / 1000) * (pd.weight / (weightSum.get(owner!) ?? 1)) : pd.weight * 2;
    const over = { ...(owner ? POP_BY_OWNER[owner] : {}), ...POP_BY_PROVINCE[id] };
    const buildings = { ...startingBuildings(od, id, pd.weight, od?.capital === id), ...(SPECIAL_BUILDINGS[id] ?? {}) };
    for (const b of Object.keys(buildings) as BuildingId[]) {
      const bd = BUILDING_BY_ID[b];
      if (bd.coastal && !isCoastal(id)) delete buildings[b];
    }
    const prov: ProvinceState = {
      id, owner, controller: OCCUPATIONS[id] ?? owner,
      pop: Math.max(1, Math.round(popK * 10) / 10),
      gdpPc: od ? od.gdpPc : 2,
      buildings,
      fort: FORT_LEVELS[id] ?? (od?.capital === id ? (od.population > 1_000_000 ? 2 : 1) : 0),
      unrest: 5,
      cores: owner ? [owner, ...(EXTRA_CORES[id] ?? [])] : [...(EXTRA_CORES[id] ?? [])],
      devastation: 0,
      culture: over.culture ?? od?.culture ?? 'Unknown',
      religion: over.religion ?? od?.religion ?? 'traditional',
    };
    w.provinces[id] = prov;
  }

  // Countries
  for (const p of POLITY_LIST) {
    const laws = defaultLaws(p);
    const techs = [...new Set([...TECH_PROFILES[p.techProfile], ...p.extraTechs])].filter((t) => TECH_BY_ID[t]);
    const c: CountryState = {
      id: p.id, alive: !p.dormant, treasury: p.treasury, loans: [], inflation: 0, taxRate: p.taxRate,
      tariff: laws.economy === 'free_trade' ? 0.04 : laws.economy === 'mercantilism' ? 0.12 : 0.08,
      budget: { research: 1, espionage: 0.5, administration: 1 },
      stability: p.stability, legitimacy: p.legitimacy, prestige: p.prestige, corruption: p.corruption, warExhaustion: 0, manpower: 0,
      rulerId: '', ministers: {}, techs, research: { tech: null, progress: 0 }, laws, factions: initialFactions(p, laws),
      overlord: p.overlord, subjectType: p.subjectType, liberty: p.subjectType ? SUBJECT_TYPES[p.subjectType].liberty : 0,
      capital: p.capital, foodStock: 3, cycle: 0, spy: {}, counterIntel: 10, envoys: [], rivals: [...p.rivals], infamy: 0, claims: [],
      revenueMod: 1, modifiers: [], last: emptyLedger(), ai: { nextWarCheck: randInt(w, 6, 30), stance: 'consolidate', lastPeaceOffer: -99 },
      stats: { battlesWon: 0, battlesLost: 0, provincesGained: 0, provincesLost: 0 },
    };
    if (p.debt > 0) {
      c.loans.push({ id: newId(w, 'l'), principal: p.debt, rate: p.id === 'great_britain' ? 0.035 : 0.05, monthsLeft: null, lender: 'Funded national debt' });
    }
    const [name, born, adm, dip, mil, dynasty, female] = p.ruler;
    const ruler = makeCharacter(w, { country: p.id, role: 'ruler', name, born, adm, dip, mil, dynasty, female: !!female, traits: rulerTraits(adm, dip, mil), health: born < 1740 ? 45 : 75, loyalty: 100 });
    c.rulerId = ruler.id;
    if (p.heir) {
      const [hn, hb, ha, hd, hm, hdyn, hf] = p.heir;
      c.heirId = makeCharacter(w, { country: p.id, role: 'heir', name: hn, born: hb, adm: ha, dip: hd, mil: hm, dynasty: hdyn, female: !!hf, traits: rulerTraits(ha, hd, hm), loyalty: 80 }).id;
    }
    w.countries[p.id] = c;
    c.manpower = Math.round(maxManpower(w, p.id) * 0.6);
  }

  // Outposts
  for (const o of Object.values(OUTPOST_DEFS)) w.outposts[o.id] = { id: o.id, owner: o.owner, controller: o.controller ?? o.owner };

  // Armies
  for (const p of POLITY_LIST) {
    if (p.dormant || !p.army) continue;
    const [inf, cav, art, irr] = p.army;
    const deploy = ARMY_DEPLOYMENTS[p.id] ?? [{ at: firstHeld(w, p.id), share: 1, name: `Army of ${p.short}` }];
    for (const d of deploy) {
      const at = w.provinces[d.at] ? d.at : firstHeld(w, p.id);
      const units: UnitCounts = { infantry: r1(inf * d.share), cavalry: r1(cav * d.share), artillery: r1(art * d.share), irregulars: r1(irr * d.share) };
      if (units.infantry + units.cavalry + units.artillery + units.irregulars < 0.1) continue;
      const army: Army = {
        id: newId(w, 'a'), owner: p.id, name: d.name, location: at, units, morale: 1,
        experience: ['britain', 'western_europe', 'central_europe', 'eastern_europe'].includes(p.techProfile) ? 0.35 : 0.15,
        path: [], progress: 0, status: 'idle',
      };
      if (d.general) army.general = generateGeneral(w, p.id, d.general[0], d.general[1]).id;
      else if (units.infantry + units.cavalry > 25) army.general = generateGeneral(w, p.id).id;
      w.armies[army.id] = army;
    }
  }
  // France's First Consul leads the Consular Guard himself.
  const guard = Object.values(w.armies).find((a) => a.owner === 'france' && a.name === 'Garde des Consuls');
  if (guard) guard.general = w.countries.france.rulerId;

  // Fleets
  for (const p of POLITY_LIST) {
    if (p.dormant || !p.navy) continue;
    const [line, frig, trans] = p.navy;
    const homeSea = homeSeaOf(w, p.id);
    if (!homeSea) continue;
    const deploy = FLEET_DEPLOYMENTS[p.id] ?? [{ at: homeSea, share: 1, name: `${p.adjective} Navy` }];
    for (const d of deploy) {
      const ships: ShipCounts = { line: r1(line * d.share), frigate: r1(frig * d.share), transport: r1(trans * d.share) };
      if (ships.line + ships.frigate + ships.transport < 0.3) continue;
      const fleet: Fleet = { id: newId(w, 'f'), owner: p.id, name: d.name, location: d.at, ships, morale: 1, path: [], progress: 0, mission: 'idle', carrying: [] };
      if (d.general) fleet.admiral = makeCharacter(w, { country: p.id, role: 'admiral', name: d.general[0], mil: d.general[1] }).id;
      w.fleets[fleet.id] = fleet;
    }
  }

  // Rebellions in progress
  for (const r of START_REBELS) {
    const army: Army = {
      id: newId(w, 'a'), owner: REBELS, name: r.name, location: r.province,
      units: { infantry: r.infantry, cavalry: 0, artillery: 0, irregulars: r.irregulars }, morale: 0.9, experience: 0.2,
      path: [], progress: 0, status: 'idle', rebel: { against: r.against, cause: r.cause },
    };
    w.armies[army.id] = army;
    if (r.control) w.provinces[r.province].controller = REBELS;
    w.provinces[r.province].unrest = 70;
  }

  // Wars
  for (const sw of START_WARS) {
    const withSubjects = (list: string[]) => {
      const out = [...list];
      for (const c of list) {
        for (const s of Object.values(w.countries)) {
          if (s.alive && s.overlord === c && s.subjectType && SUBJECT_TYPES[s.subjectType].joinsWars && !NEUTRAL_SUBJECTS.includes(s.id) && !out.includes(s.id)) out.push(s.id);
        }
      }
      return out;
    };
    w.wars[sw.id] = {
      id: sw.id, name: sw.name, attackers: withSubjects(sw.attackers), defenders: withSubjects(sw.defenders),
      attackerLeader: sw.attackers[0], defenderLeader: sw.defenders[0], goal: sw.goal, start: -6, battleScore: 0, score: 0, lastScoreChange: 0,
    };
  }
  for (const s of START_SIEGES) w.provinces[s.province].siege = { by: s.by, progress: s.progress };

  // Treaties & relations
  for (const t of START_TREATIES) w.treaties.push({ id: newId(w, 't'), type: t.type, a: t.a, b: t.b, start: -12, amount: t.amount });
  for (const [a, b, v] of START_RELATIONS) w.relations[relKey(a, b)] = v;
  for (const c of Object.values(w.countries)) if (c.overlord) addOpinion(w, c.id, c.overlord, 40);

  // The player's royal council
  appointCouncil(w, opts.playerId);

  calibrateRevenue(w);
  chronicle(w, { text: 'The nineteenth century dawns. Bonaparte rules France as First Consul; the Second Coalition fights on; the Maratha chiefs, the Qing court and the young American republic face an uncertain age.', category: 'court', countries: [], importance: 3 });
  chronicle(w, { text: `The chronicle of ${def(opts.playerId).name} begins under ${w.characters[w.countries[opts.playerId].rulerId].name}.`, category: 'player', countries: [opts.playerId], importance: 2 });
  forcesChanged(w);
  return w;
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function firstHeld(w: WorldState, c: string): string {
  const cap = w.countries[c]?.capital ?? def(c).capital;
  if (w.provinces[cap]?.controller === c) return cap;
  const own = Object.values(w.provinces).find((p) => p.owner === c && p.controller === c);
  return own?.id ?? cap;
}

export function homeSeaOf(w: WorldState, c: string): string | undefined {
  const cap = w.countries[c]?.capital ?? def(c).capital;
  const s = coastalSeas(cap)[0];
  if (s) return s;
  for (const p of Object.values(w.provinces)) {
    if (p.owner === c && isCoastal(p.id)) return coastalSeas(p.id)[0];
  }
  return undefined;
}
