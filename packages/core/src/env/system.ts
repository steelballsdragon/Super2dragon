import os from 'node:os';
import { statfsSync } from 'node:fs';
import { execFileText } from '../util/exec.js';

export interface GpuInfo {
  name: string;
  vendor: 'nvidia' | 'amd' | 'apple' | 'intel' | 'other';
  vramTotalBytes?: number;
  vramFreeBytes?: number;
  /** Apple Silicon shares system memory with the GPU. */
  unifiedMemory?: boolean;
}

export interface SystemInfo {
  platform: NodeJS.Platform;
  osRelease: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemBytes: number;
  freeMemBytes: number;
  gpus: GpuInfo[];
  diskFreeBytes?: number;
  nodeVersion: string;
}

async function nvidia(): Promise<GpuInfo[]> {
  try {
    const r = await execFileText('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits'], { timeoutMs: 5000 });
    if (r.code !== 0) return [];
    return r.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, total, free] = line.split(',').map((s) => s.trim());
        return { name, vendor: 'nvidia' as const, vramTotalBytes: Number(total) * 1024 * 1024, vramFreeBytes: Number(free) * 1024 * 1024 };
      });
  } catch {
    return [];
  }
}

async function amd(): Promise<GpuInfo[]> {
  try {
    const r = await execFileText('rocm-smi', ['--showmeminfo', 'vram', '--json'], { timeoutMs: 5000 });
    if (r.code !== 0) return [];
    const data = JSON.parse(r.stdout) as Record<string, Record<string, string>>;
    return Object.entries(data).map(([card, v]) => {
      const total = Number(v['VRAM Total Memory (B)'] ?? 0);
      const used = Number(v['VRAM Total Used Memory (B)'] ?? 0);
      return { name: `AMD ${card}`, vendor: 'amd' as const, vramTotalBytes: total || undefined, vramFreeBytes: total ? total - used : undefined };
    });
  } catch {
    return [];
  }
}

async function apple(): Promise<GpuInfo[]> {
  if (process.platform !== 'darwin') return [];
  const cpu = os.cpus()[0]?.model ?? '';
  if (os.arch() === 'arm64' || /Apple/.test(cpu)) {
    return [{ name: `${cpu || 'Apple Silicon'} GPU`, vendor: 'apple', vramTotalBytes: os.totalmem(), unifiedMemory: true }];
  }
  return [];
}

async function windowsGpus(): Promise<GpuInfo[]> {
  if (process.platform !== 'win32') return [];
  try {
    const r = await execFileText(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json'],
      { timeoutMs: 8000 },
    );
    const parsed = JSON.parse(r.stdout);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((g: { Name: string; AdapterRAM?: number }) => ({
      name: g.Name,
      vendor: /nvidia/i.test(g.Name) ? 'nvidia' : /amd|radeon/i.test(g.Name) ? 'amd' : /intel/i.test(g.Name) ? 'intel' : 'other',
      vramTotalBytes: g.AdapterRAM || undefined,
    }));
  } catch {
    return [];
  }
}

export async function getSystemInfo(diskPath = os.homedir()): Promise<SystemInfo> {
  const [nv, am, ap, win] = await Promise.all([nvidia(), amd(), apple(), windowsGpus()]);
  const gpus = nv.length ? [...nv, ...am] : [...am, ...ap, ...win.filter((g) => !nv.some((n) => n.name === g.name))];
  let diskFreeBytes: number | undefined;
  try {
    const s = statfsSync(diskPath);
    diskFreeBytes = s.bavail * s.bsize;
  } catch {
    /* unsupported */
  }
  return {
    platform: process.platform,
    osRelease: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    cpuCores: os.cpus().length,
    totalMemBytes: os.totalmem(),
    freeMemBytes: os.freemem(),
    gpus,
    diskFreeBytes,
    nodeVersion: process.version,
  };
}
