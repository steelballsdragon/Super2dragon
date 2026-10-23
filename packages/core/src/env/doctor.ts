import { accessSync, constants, mkdirSync } from 'node:fs';
import type { Settings } from '../engine/settings.js';
import type { ModelProvider } from '../models/types.js';
import { ripgrepAvailable } from '../repo/search.js';
import { treeSitterAvailable } from '../repo/symbols.js';
import { probeProgram } from '../util/exec.js';
import { formatBytes } from '../util/text.js';
import { getSystemInfo, type SystemInfo } from './system.js';

export interface DoctorCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  fix?: string;
}

export interface DoctorReport {
  system: SystemInfo;
  checks: DoctorCheck[];
  ok: boolean;
}

const INSTALL_HINTS: Record<string, Record<string, string>> = {
  git: { linux: 'sudo apt install git  (or your distro package manager)', darwin: 'xcode-select --install  or  brew install git', win32: 'winget install Git.Git' },
  rg: { linux: 'sudo apt install ripgrep', darwin: 'brew install ripgrep', win32: 'winget install BurntSushi.ripgrep.MSVC' },
  ollama: { linux: 'curl -fsSL https://ollama.com/install.sh | sh', darwin: 'brew install ollama  or download from https://ollama.com/download', win32: 'Download from https://ollama.com/download' },
};

const hint = (tool: string) => INSTALL_HINTS[tool]?.[process.platform] ?? INSTALL_HINTS[tool]?.linux;

/** Detect missing dependencies and summarize the machine's capabilities. */
export async function runDoctor(opts: { dataDir: string; settings: Settings; providers: ModelProvider[] }): Promise<DoctorReport> {
  const system = await getSystemInfo(opts.dataDir);
  const checks: DoctorCheck[] = [];

  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = major > 22 || (major === 22 && minor >= 13);
  checks.push({
    id: 'node',
    label: 'Node.js',
    status: nodeOk ? 'ok' : 'error',
    detail: `v${process.versions.node}${nodeOk ? '' : ' (22.13+ required for built-in SQLite)'}`,
    fix: nodeOk ? undefined : 'Install Node.js 22 LTS or newer from https://nodejs.org',
  });

  const gitP = await probeProgram('git');
  checks.push({
    id: 'git',
    label: 'git',
    status: gitP.found ? 'ok' : 'error',
    detail: gitP.found ? gitP.version! : 'not found - checkpoints/undo and git tools are unavailable',
    fix: gitP.found ? undefined : hint('git'),
  });

  const rg = await ripgrepAvailable();
  checks.push({
    id: 'ripgrep',
    label: 'ripgrep (fast search)',
    status: rg ? 'ok' : 'warn',
    detail: rg ? 'available' : 'not found - using the slower built-in search',
    fix: rg ? undefined : hint('rg'),
  });

  const ts = await treeSitterAvailable();
  checks.push({
    id: 'tree-sitter',
    label: 'Tree-sitter (symbol index)',
    status: ts ? 'ok' : 'warn',
    detail: ts ? 'grammars loaded' : 'not available - symbol search falls back to regular expressions',
  });

  try {
    mkdirSync(opts.dataDir, { recursive: true });
    accessSync(opts.dataDir, constants.W_OK);
    checks.push({ id: 'storage', label: 'Data directory', status: 'ok', detail: opts.dataDir });
  } catch (err) {
    checks.push({ id: 'storage', label: 'Data directory', status: 'error', detail: `${opts.dataDir} is not writable: ${(err as Error).message}`, fix: 'Set LOCALCODE_HOME to a writable folder.' });
  }

  const ollamaBin = await probeProgram('ollama', ['--version']);
  let anyServer = false;
  let anyModel = false;
  for (const p of opts.providers) {
    const h = await p.health();
    if (!h.ok) {
      const isOllama = p.config.kind === 'ollama';
      checks.push({
        id: `provider:${p.config.id}`,
        label: p.config.label,
        status: 'warn',
        detail: `not reachable at ${p.config.baseUrl}`,
        fix: isOllama
          ? ollamaBin.found
            ? 'Start it with: ollama serve'
            : `Install Ollama: ${hint('ollama')}`
          : p.config.id === 'llamacpp'
            ? 'Optional. Start with: llama-server -m <model.gguf> --jinja --port 8080'
            : 'Optional. Start the server or disable this provider in Settings.',
      });
      continue;
    }
    anyServer = true;
    const models = await p.listModels().catch(() => []);
    const chat = models.filter((m) => !/embed/i.test(m.name));
    if (chat.length) anyModel = true;
    checks.push({
      id: `provider:${p.config.id}`,
      label: p.config.label,
      status: chat.length ? 'ok' : 'warn',
      detail: `running${h.version ? ` (${h.version})` : ''}; ${models.length} model(s) installed${chat.length ? `: ${chat.slice(0, 5).map((m) => m.name).join(', ')}` : ''}`,
      fix: chat.length ? undefined : p.config.kind === 'ollama' ? suggestModel(system) : 'Load a model in the server.',
    });
  }
  if (!anyServer) {
    checks.push({
      id: 'inference',
      label: 'Local inference',
      status: 'error',
      detail: 'No local inference server is running, so the agent cannot work.',
      fix: ollamaBin.found ? 'Run: ollama serve' : `Install Ollama (${hint('ollama')}) or run llama.cpp's llama-server.`,
    });
  } else if (!anyModel) {
    checks.push({ id: 'models', label: 'Models', status: 'error', detail: 'No chat/coding model installed.', fix: suggestModel(system) });
  }

  const gpu = system.gpus[0];
  checks.push({
    id: 'hardware',
    label: 'Hardware',
    status: 'ok',
    detail: `${system.cpuCores} CPU threads, ${formatBytes(system.totalMemBytes)} RAM (${formatBytes(system.freeMemBytes)} free), ${gpu ? `GPU: ${gpu.name}${gpu.vramTotalBytes ? ` ${formatBytes(gpu.vramTotalBytes)}` : ''}` : 'no GPU detected (CPU inference)'}`,
  });

  return { system, checks, ok: !checks.some((c) => c.status === 'error') };
}

/** Recommend a model size for the detected hardware. */
export function suggestModel(sys: Pick<SystemInfo, 'totalMemBytes' | 'gpus'>): string {
  const gpuMem = sys.gpus.find((g) => g.vramTotalBytes)?.vramTotalBytes ?? 0;
  const budget = Math.max(gpuMem, sys.totalMemBytes * 0.6);
  const gb = budget / 1024 ** 3;
  if (gb >= 24) return 'Install a model, e.g.: ollama pull qwen3-coder:30b   (or qwen2.5-coder:32b)';
  if (gb >= 12) return 'Install a model, e.g.: ollama pull qwen2.5-coder:14b   (or qwen3:14b)';
  if (gb >= 6) return 'Install a model, e.g.: ollama pull qwen2.5-coder:7b   (or qwen3:8b)';
  return 'Install a small model, e.g.: ollama pull qwen3.5:4b   (or qwen2.5-coder:3b)';
}
