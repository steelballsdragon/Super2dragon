import type { ToolMode } from '../models/adapter.js';
import type { ModelRef, ProviderConfig } from '../models/types.js';
import type { PermissionMode } from '../security/permissions.js';

export interface Settings {
  providers: ProviderConfig[];
  /** Model roles: coding runs the agent, planning/light are optional alternates, embedding enables semantic search. */
  models: {
    coding?: ModelRef;
    planning?: ModelRef;
    light?: ModelRef;
    embedding?: ModelRef;
  };
  /** Per-model tool-mode override, keyed "providerId/model". 'auto' uses probe results. */
  toolModeOverrides: Record<string, ToolMode | 'auto'>;
  generation: {
    temperature: number;
    topP?: number;
    numCtx: number;
    maxTokens: number;
    /** GPU layers to offload (Ollama num_gpu). null = let the server decide. 0 = CPU only. */
    numGpu: number | null;
    keepAlive: string;
    /** Enable reasoning output for models that support it (slower on CPU). */
    thinking: boolean;
  };
  agent: {
    maxSteps: number;
    maxTaskMinutes: number;
    commandTimeoutSec: number;
    toolOutputMaxChars: number;
    /** Seconds of silence from the model server before a request is retried. */
    modelIdleTimeoutSec: number;
    /** Ask the model to continue if it stops with unfinished plan items. */
    nudgeOnIncompletePlan: boolean;
  };
  permissions: {
    mode: PermissionMode;
    /** Environment variable names passed to commands even though they look secret. */
    envPassthrough: string[];
  };
  context: {
    /** Summarize older history once the prompt reaches this fraction of the context window. */
    summarizeAtRatio: number;
    keepRecentMessages: number;
    includeRepoOverview: boolean;
    /** Include notes from recent tasks in this workspace in new conversations. */
    includeRecentTasks: boolean;
  };
  index: {
    exclude: string[];
    maxFileSizeKB: number;
    maxFiles: number;
    watch: boolean;
  };
  storage: {
    checkpoints: boolean;
  };
  firstRunComplete: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  providers: [
    { id: 'ollama', kind: 'ollama', label: 'Ollama', baseUrl: 'http://127.0.0.1:11434', enabled: true },
    { id: 'llamacpp', kind: 'openai', label: 'llama.cpp server', baseUrl: 'http://127.0.0.1:8080/v1', enabled: true },
    { id: 'lmstudio', kind: 'openai', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', enabled: false },
  ],
  models: {},
  toolModeOverrides: {},
  generation: {
    temperature: 0.2,
    numCtx: 16384,
    maxTokens: 4096,
    numGpu: null,
    keepAlive: '30m',
    thinking: false,
  },
  agent: {
    maxSteps: 60,
    maxTaskMinutes: 90,
    commandTimeoutSec: 300,
    toolOutputMaxChars: 12000,
    modelIdleTimeoutSec: 600,
    nudgeOnIncompletePlan: true,
  },
  permissions: {
    mode: 'standard',
    envPassthrough: [],
  },
  context: {
    summarizeAtRatio: 0.75,
    keepRecentMessages: 10,
    includeRepoOverview: true,
    includeRecentTasks: true,
  },
  index: {
    exclude: [],
    maxFileSizeKB: 1024,
    maxFiles: 50000,
    watch: true,
  },
  storage: {
    checkpoints: true,
  },
  firstRunComplete: false,
};

type Plain = Record<string, unknown>;

function isPlain(v: unknown): v is Plain {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge for settings patches. Arrays are replaced, not merged. */
export function mergeSettings<T>(base: T, patch: unknown): T {
  if (!isPlain(patch)) return base;
  const out: Plain = { ...(base as Plain) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = out[k];
    out[k] = isPlain(cur) && isPlain(v) ? mergeSettings(cur, v) : v;
  }
  return out as T;
}
