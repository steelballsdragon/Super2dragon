// Builds the Age of Conquest engine as one plain script (used by build.mjs and by the Node tests).
// The script defines AOC on the global object (self in a Web Worker, window on the page, the context in Node).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ENGINE_FILES = ['data.js', 'world.js', 'rules.js', 'sim.js', 'ai.js', 'api.js'];
const EXPORTS = [
  // data
  'RES', 'RES_NAME', 'RES_VALUE', 'UNITS', 'UNIT_KEYS', 'COUNTER', 'TERRAIN', 'T', 'BUILDINGS', 'BUILDING_KEYS', 'TECHS', 'TECH_KEYS', 'TECH_MAX', 'CIVS', 'CIV',
  'COMMANDERS', 'CMD', 'SYNERGY', 'TALENT_STATS', 'TALENT_NAME', 'RECRUIT', 'ARCHETYPES', 'SERVER', 'GUILD_MAX', 'GUILD_COUNT', 'GOVERNORS', 'OFFICERS_MAX',
  'THRONE_OPENS', 'THRONE_HOLD', 'EXCHANGE', 'SHIELD', 'NEWCOMER_SHIELD', 'MAP_N', 'HOUR', 'DAY', 'MAX_LEVEL', 'CMD_MAX_LEVEL', 'ULTIMATE_LEVEL', 'GUILD_TECH',
  'QUESTS', 'CHAPTERS', 'ACHIEVEMENTS', 'PLAYER', 'SCHEMA', 'EVENTS', 'ROLE_NAME', 'FREE_FINISH', 'CRATE', 'ZONES', 'REGIONS', 'PASS_LEVELS', 'SITES', 'BLESSINGS', 'GATES', 'ALL_GATES',
  // formulas
  'buildingCost', 'buildingMinutes', 'buildingReq', 'productionAt', 'BASE_PRODUCTION', 'protectedAmount', 'protectedStock', 'affordable', 'hospitalCap', 'wallDurability', 'visionRadius',
  'marchCapacity', 'marchSlots', 'techCost', 'techMinutes', 'cmdXpToNext', 'skillCost', 'clock', 'roman', 'troopsTotal', 'troopPower',
  // engine
  'createWorld', 'createServer', 'step', 'advance', 'serialize', 'deserialize', 'validateWorld', 'playerCommand', 'frameView', 'inspect', 'guildDetail',
  'rankings', 'chronicleView', 'historyView', 'tileView', 'diagnostics', 'fight', 'explainBattle', 'findPath', 'pathCost', 'settle', 'production',
  'cityMods', 'upkeepPerHour', 'computePower', 'armySide', 'neutralSide', 'startMarch', 'startRally', 'joinRally', 'actBuild', 'buildCheck', 'actFree', 'freeCheck', 'actCollect', 'crateCheck',
  'actResearch', 'researchCheck', 'actTrain', 'trainCheck', 'actHeal', 'actTrade', 'actShield', 'actRelocate', 'actContribute', 'applyToGuild',
  'joinGuild', 'leaveGuild', 'declareWar', 'makePeace', 'treaty', 'setTreaty', 'succession', 'collapseGuild', 'refoundGuild', 'thinkGuild', 'think',
  'scoutAccuracy', 'intelOn', 'garrisonOf', 'marchPos', 'makeRng', 'hash32', 'generateTerrain', 'recomputeTerritory', 'updatePlayerVision', 'idx', 'tx', 'ty',
  'rleEncode', 'rleDecode', 'PF', 'projectRes', 'tierOf', 'marchCap', 'marchSpeed', 'checkRecruits', 'giveXp', 'endAge', 'dist', 'tileTarget', 'busyCommanders',
  'regionAt', 'zoneAt', 'zoneOfRegion', 'regionCenter', 'edgeDist', 'gateAccess', 'regionsReachable', 'canReach', 'reachMaskOf', 'inReach', 'blessingMods', 'planObjective',
];
export function engineSource() {
  const parts = ENGINE_FILES.map(f => `/* ----- conquest/${f} ----- */\n` + readFileSync(join(HERE, f), 'utf8'));
  // builtins bound as locals: global lookups are slow inside Node's vm contexts (tests), and free in browsers
  const LOCALS = "const Infinity = 1 / 0, NaN = 0 / 0, Math = root.Math, JSON = root.JSON, Number = root.Number, Object = root.Object, Array = root.Array, String = root.String, Set = root.Set, Map = root.Map, Float32Array = root.Float32Array, Int32Array = root.Int32Array, Uint8Array = root.Uint8Array, Uint32Array = root.Uint32Array, Int8Array = root.Int8Array, Float64Array = root.Float64Array, Boolean = root.Boolean;";
  return `(function (root) {\n'use strict';\n${LOCALS}\n${parts.join('\n')}\nroot.AOC = { ${EXPORTS.join(', ')} };\n})(typeof self !== 'undefined' ? self : globalThis);\n`;
}
// the Web Worker's message loop, appended to the engine source when the page starts the worker
export const WORKER_GLUE = `
;(function () {
  let server = null, last = Date.now();
  self.onmessage = e => {
    const msg = e.data || {};
    if (msg.type === 'init') { server = AOC.createServer({ post: m => self.postMessage(m), dev: !!msg.dev, budgetMs: 35 }); self.postMessage({ type: 'up' }); return; }
    if (server) server.handle(msg);
  };
  setInterval(() => { const t = Date.now(); if (server) server.tick(Math.min(1000, t - last)); last = t; }, 50);
})();
`;
