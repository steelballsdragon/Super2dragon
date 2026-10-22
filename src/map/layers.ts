// Province colouring for each map layer, and the matching legends.
// Sequential layers use one hue dark→light (near-zero recedes into the dark surface); the
// diplomacy layer uses the three all-pairs-validated categorical slots plus neutrals.
import { TERRAIN } from '../game/constants';
import { provinceOutput, provinceTradeValue } from '../game/economy';
import { alliesOf, atWar, topOverlord } from '../game/state';
import { GEO, POLITIES, PROVINCE_DEFS } from '../game/static';
import type { WorldState } from '../game/types';
import type { MapLayer } from '../store/game';

export const RAMPS = {
  economy: ['#1d4434', '#255a43', '#2e7153', '#388a64', '#4aa377', '#67bb8e', '#8fd1aa', '#b8e4c8'],
  population: ['#43311a', '#5b4420', '#765826', '#936d2e', '#b0853b', '#c9a052', '#ddbd77', '#ecd39b'],
  trade: ['#3d2033', '#552c47', '#6f3a5c', '#894872', '#a35b89', '#bb76a2', '#d197bb', '#e6bdd5'],
  fort: ['#46535f', '#5a6b7b', '#718598', '#8ea2b5', '#b0c1d1'],
};

/** Diplomatic relation categories (validated all-pairs on the dark surface). */
export const DIPLO = {
  self: '#cfc3a6',
  ally: '#3987e5',
  war: '#d95926',
  subject: '#199e70',
  other: '#3d4349',
  unclaimed: '#2a2f33',
};

export const UNCLAIMED = '#2c3236';

function rampColor(ramp: string[], t: number): string {
  const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)));
  return ramp[i];
}

function logScale(v: number, lo: number, hi: number): number {
  if (v <= lo) return 0;
  return Math.max(0, Math.min(0.999, Math.log(v / lo) / Math.log(hi / lo)));
}

export interface LayerResult {
  fill: Record<string, string>;
  /** Provinces drawn with the rival hatch (diplomacy) or occupation hatch. */
  hatch: Record<string, string>;
}

export function layerColors(w: WorldState, layer: MapLayer, viewer: string): LayerResult {
  const fill: Record<string, string> = {};
  const hatch: Record<string, string> = {};
  const viewerTop = topOverlord(w, viewer);
  const allies = new Set(alliesOf(w, viewer));
  const rivals = new Set(w.countries[viewer]?.rivals ?? []);
  const relCache = new Map<string, string>();
  const relation = (o: string): string => {
    let r = relCache.get(o);
    if (r) return r;
    if (o === viewer) r = DIPLO.self;
    else if (atWar(w, viewer, o)) r = DIPLO.war;
    else if (topOverlord(w, o) === viewerTop || w.countries[o]?.overlord === viewer || w.countries[viewer]?.overlord === o) r = DIPLO.subject;
    else if (allies.has(o)) r = DIPLO.ally;
    else r = DIPLO.other;
    relCache.set(o, r);
    return r;
  };
  for (const p of Object.values(w.provinces)) {
    const owner = p.owner;
    const g = GEO.provinces[p.id];
    if (!g) continue;
    if (!owner) { fill[p.id] = UNCLAIMED; continue; }
    switch (layer) {
      case 'political':
        fill[p.id] = POLITIES[owner]?.color ?? '#777';
        break;
      case 'terrain':
        fill[p.id] = TERRAIN[PROVINCE_DEFS[p.id].terrain].color;
        break;
      case 'economy':
        fill[p.id] = rampColor(RAMPS.economy, logScale(provinceOutput(w, p.id), 4, 1500));
        break;
      case 'trade':
        fill[p.id] = rampColor(RAMPS.trade, logScale(provinceTradeValue(w, p.id), 1, 160));
        break;
      case 'population':
        fill[p.id] = rampColor(RAMPS.population, logScale(p.pop / Math.max(0.5, g.area), 0.05, 60));
        break;
      case 'military':
        fill[p.id] = RAMPS.fort[Math.max(0, Math.min(4, p.fort))];
        break;
      case 'diplomacy': {
        fill[p.id] = relation(owner);
        if (rivals.has(owner) && fill[p.id] === DIPLO.other) hatch[p.id] = DIPLO.war;
        break;
      }
    }
    // Occupation is shown on every layer.
    const ctl = p.controller;
    if (ctl && ctl !== owner) hatch[p.id] = ctl === 'rebels' ? '#1a1a1a' : POLITIES[ctl]?.color ?? '#111';
  }
  return { fill, hatch };
}

export interface LegendItem { color: string; label: string; hatch?: string }
export interface Legend { title: string; kind: 'swatches' | 'ramp'; items?: LegendItem[]; ramp?: string[]; low?: string; high?: string; note?: string }

export function legendFor(layer: MapLayer, viewerName: string): Legend {
  switch (layer) {
    case 'political': return { title: 'Political', kind: 'swatches', items: [{ color: '#888', label: 'Polity colours (named on the map)' }, { color: UNCLAIMED, label: 'Unclaimed / uninhabited' }, { color: '#555', hatch: '#111', label: 'Occupied (hatched in occupier colour)' }] };
    case 'terrain': return { title: 'Terrain', kind: 'swatches', items: Object.values(TERRAIN).map((t) => ({ color: t.color, label: t.name })) };
    case 'economy': return { title: 'Economic output', kind: 'ramp', ramp: RAMPS.economy, low: '£4k', high: '£1.5M / month', note: 'Log scale; hover a province for exact figures.' };
    case 'trade': return { title: 'Trade value', kind: 'ramp', ramp: RAMPS.trade, low: 'low', high: 'high', note: 'Gold lines show trade flowing between markets.' };
    case 'population': return { title: 'Population density', kind: 'ramp', ramp: RAMPS.population, low: 'sparse', high: 'dense', note: 'Log scale.' };
    case 'military': return { title: 'Fortifications', kind: 'swatches', items: RAMPS.fort.map((c, i) => ({ color: c, label: i === 0 ? 'No fort' : i === 4 ? 'Fort level 4+' : `Fort level ${i}` })), note: 'Army and fleet counters show regiments and ships.' };
    case 'diplomacy': return {
      title: `Relations of ${viewerName}`, kind: 'swatches', items: [
        { color: DIPLO.self, label: viewerName },
        { color: DIPLO.ally, label: 'Allies' },
        { color: DIPLO.subject, label: 'Overlord, subjects & fellow subjects' },
        { color: DIPLO.war, label: 'At war' },
        { color: DIPLO.other, hatch: DIPLO.war, label: 'Rivals' },
        { color: DIPLO.other, label: 'Others (opinion in tooltip)' },
      ],
    };
  }
}

