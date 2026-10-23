import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../src/engine/engine.js';
import type { ChatRequest, ChatResponse, ModelDetails, ModelInfo, ModelProvider, ProviderConfig, ProviderHealth, StreamEvent, ToolCall } from '../src/models/types.js';

export type ScriptStep =
  | { text?: string; calls?: { name: string; arguments: Record<string, unknown> }[] }
  | ((req: ChatRequest) => { text?: string; calls?: { name: string; arguments: Record<string, unknown> }[] });

/**
 * Test double for an inference server: replays a scripted sequence of model
 * turns and records every request it receives. Tools still execute for real.
 */
export class ScriptedProvider implements ModelProvider {
  readonly requests: ChatRequest[] = [];
  private i = 0;

  constructor(
    readonly config: ProviderConfig,
    private readonly script: ScriptStep[],
    private readonly opts: { capabilities?: string[]; textMode?: boolean } = {},
  ) {}

  async health(): Promise<ProviderHealth> {
    return { ok: true, version: 'scripted' };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ name: 'scripted-model', providerId: this.config.id, sizeBytes: 1e9 }];
  }

  async showModel(name: string): Promise<ModelDetails> {
    return { name, providerId: this.config.id, capabilities: this.opts.capabilities ?? ['completion', 'tools'], capabilitiesReported: true, contextLength: 32768 };
  }

  async chat(req: ChatRequest, onEvent?: (e: StreamEvent) => void): Promise<ChatResponse> {
    this.requests.push(req);
    if (req.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const step = this.script[this.i++] ?? { text: 'Done.' };
    const turn = typeof step === 'function' ? step(req) : step;
    let content = turn.text ?? '';
    let toolCalls: ToolCall[] = (turn.calls ?? []).map((c, n) => ({ id: `call_${this.i}_${n}`, name: c.name, arguments: c.arguments }));
    if (this.opts.textMode && toolCalls.length) {
      // Emulate a model that writes tool calls as text (prompted mode / weak native support).
      content += toolCalls.map((c) => `\n<tool_call>\n${JSON.stringify({ name: c.name, arguments: c.arguments })}\n</tool_call>`).join('');
      toolCalls = [];
    }
    if (content) onEvent?.({ type: 'text', text: content });
    return { content, toolCalls, usage: { promptTokens: 100, completionTokens: 20, totalDurationMs: 5 } };
  }
}

export function makeWorkspace(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lc-ws-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

export function makeEngine(script: ScriptStep[], opts: { capabilities?: string[]; textMode?: boolean } = {}) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'lc-data-'));
  const cfg: ProviderConfig = { id: 'test', kind: 'ollama', label: 'Scripted', baseUrl: 'http://127.0.0.1:1', enabled: true };
  const provider = new ScriptedProvider(cfg, script, opts);
  const engine = new Engine({ dataDir, dbFile: ':memory:', skipRecovery: true, providerFactory: () => provider });
  engine.updateSettings({
    providers: [cfg],
    models: { coding: { providerId: 'test', model: 'scripted-model' } },
    index: { watch: false },
  });
  return {
    engine,
    provider,
    cleanup: async () => {
      await engine.dispose();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
