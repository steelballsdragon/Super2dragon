import type { SystemInfo } from '../env/system.js';
import { formatBytes } from '../util/text.js';
import type { LoadedModel, ModelDetails } from './types.js';

export interface MemoryEstimate {
  weightsBytes: number;
  kvCacheBytes: number;
  overheadBytes: number;
  totalBytes: number;
  numCtx: number;
  /** True when the KV-cache figure is derived from model metadata (otherwise a rough guess). */
  precise: boolean;
}

export type FitLevel = 'gpu' | 'partial' | 'cpu' | 'tight' | 'insufficient' | 'unknown';

export interface FitAssessment {
  level: FitLevel;
  message: string;
  suggestedNumCtx?: number;
}

/**
 * Estimate memory needed to run a model with a given context window.
 * weights ~ file size; KV cache = 2 (K,V) * layers * ctx * kvHeads * headDim * 2 bytes (f16).
 */
export function estimateMemory(details: Pick<ModelDetails, 'sizeBytes' | 'layers' | 'kvHeads' | 'kvDimPerHead' | 'parameterSize'>, numCtx: number): MemoryEstimate {
  let weights = details.sizeBytes ?? 0;
  if (!weights && details.parameterSize) {
    const m = /([\d.]+)\s*([BM])/i.exec(details.parameterSize);
    if (m) weights = Number(m[1]) * (m[2].toUpperCase() === 'B' ? 1e9 : 1e6) * 0.6; // ~4.5-bit quantization
  }
  let kv = 0;
  let precise = false;
  if (details.layers && details.kvHeads && details.kvDimPerHead) {
    // kvDimPerHead already sums key + value dimensions.
    kv = details.layers * numCtx * details.kvHeads * details.kvDimPerHead * 2;
    precise = true;
  } else if (weights) {
    // Rough heuristic for GQA models: ~15 MB per 1k tokens of context per GB of weights.
    kv = (weights / 1e9) * (numCtx / 1000) * 15e6;
  }
  const overhead = 350 * 1024 * 1024 + weights * 0.05;
  return { weightsBytes: weights, kvCacheBytes: kv, overheadBytes: overhead, totalBytes: weights + kv + overhead, numCtx, precise };
}

export function assessFit(est: MemoryEstimate, sys: Pick<SystemInfo, 'totalMemBytes' | 'freeMemBytes' | 'gpus'>, loaded: LoadedModel[] = []): FitAssessment {
  if (!est.totalBytes) return { level: 'unknown', message: 'Model size unknown; memory requirement cannot be estimated.' };
  const need = est.totalBytes;
  // Memory already held by loaded models will be released if this model replaces them.
  const reclaimable = loaded.reduce((s, m) => s + (m.sizeBytes ?? 0), 0);
  const available = sys.freeMemBytes + reclaimable;
  const gpu = sys.gpus.find((g) => !g.unifiedMemory && g.vramTotalBytes);
  const unified = sys.gpus.find((g) => g.unifiedMemory);
  const ratioPerCtx = est.kvCacheBytes / est.numCtx;
  const suggest = (budget: number) => {
    if (!ratioPerCtx) return undefined;
    const ctx = Math.floor((budget - est.weightsBytes - est.overheadBytes) / ratioPerCtx);
    return ctx >= 2048 ? Math.min(est.numCtx, 2 ** Math.floor(Math.log2(ctx))) : undefined;
  };
  if (gpu?.vramTotalBytes) {
    const vram = gpu.vramFreeBytes ?? gpu.vramTotalBytes;
    if (need <= vram * 0.95) return { level: 'gpu', message: `Fits in GPU memory (${formatBytes(need)} of ${formatBytes(vram)} free on ${gpu.name}).` };
    if (need <= vram + available * 0.85) {
      return { level: 'partial', message: `Needs ${formatBytes(need)}: partly offloaded to ${gpu.name} (${formatBytes(vram)} free), the rest runs on CPU (slower).` };
    }
  }
  if (unified) {
    // macOS limits GPU-wired memory to roughly 2/3-3/4 of RAM by default.
    const usable = Math.min(available, sys.totalMemBytes * 0.7);
    if (need <= usable) return { level: 'gpu', message: `Fits in unified memory (${formatBytes(need)} of ~${formatBytes(usable)} usable).` };
  }
  if (need <= available * 0.8) {
    return { level: 'cpu', message: `Runs on CPU/RAM: needs ~${formatBytes(need)}, ${formatBytes(available)} available.${gpu ? '' : ' No dedicated GPU detected, so generation will be slower.'}` };
  }
  if (need <= available) {
    return { level: 'tight', message: `Tight fit: needs ~${formatBytes(need)} of ${formatBytes(available)} available memory. Close other apps or lower the context length.`, suggestedNumCtx: suggest(available * 0.8) };
  }
  return {
    level: 'insufficient',
    message: `Not enough memory: needs ~${formatBytes(need)} but only ${formatBytes(available)} is available. Choose a smaller model/quantization or lower the context length.`,
    suggestedNumCtx: suggest(available * 0.8),
  };
}
