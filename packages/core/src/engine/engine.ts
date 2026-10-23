import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { AgentEvent, ApprovalHandler, ApprovalRequest, ApprovalResponse } from '../agent/events.js';
import { TRANSIENT_EVENTS } from '../agent/events.js';
import { AgentRunner } from '../agent/runner.js';
import { getSystemInfo, type SystemInfo } from '../env/system.js';
import { ModelClient, type ToolMode } from '../models/adapter.js';
import { assessFit, estimateMemory, type FitAssessment, type MemoryEstimate } from '../models/memory.js';
import { OllamaProvider } from '../models/ollama.js';
import { OpenAICompatProvider } from '../models/openai.js';
import { probeToolCalling, type ProbeResult } from '../models/probe.js';
import type { LoadedModel, ModelDetails, ModelInfo, ModelProvider, ModelRef, ProviderConfig, ProviderHealth, PullProgress } from '../models/types.js';
import type { PermissionMode } from '../security/permissions.js';
import { defaultDataDir } from '../storage/db.js';
import { Store } from '../storage/store.js';
import { ToolRegistry } from '../tools/registry.js';
import { LocalCodeError, errorMessage } from '../util/errors.js';
import { isProbablyBinary, stripAnsi } from '../util/text.js';
import { WorkspaceSession } from './session.js';
import type { Settings } from './settings.js';
import type { CheckpointRecord, ConversationRecord, FileChange, TaskRecord, TaskStatus } from './types.js';

export interface EngineOptions {
  dataDir?: string;
  /** Use ':memory:' for an ephemeral store (benchmarks, tests). */
  dbFile?: string;
  /** Do not mark tasks from a previous process as interrupted (e.g. secondary engines). */
  skipRecovery?: boolean;
  /** Construct providers for configs (defaults to Ollama / OpenAI-compatible clients). */
  providerFactory?: (cfg: ProviderConfig) => ModelProvider;
}

export type EngineEvent =
  | (AgentEvent & { workspaceId?: string })
  | { type: 'terminal.output'; workspaceId: string; stream: 'stdout' | 'stderr'; chunk: string }
  | { type: 'terminal.exit'; workspaceId: string; exitCode: number | null; cwd: string }
  | { type: 'process.output'; workspaceId: string; processId: string; chunk: string }
  | { type: 'pull.progress'; providerId: string; model: string; progress: PullProgress }
  | { type: 'index.updated'; workspaceId: string; files: number }
  | { type: 'files.changed'; workspaceId: string };

export interface ModelListing {
  provider: ProviderConfig;
  health: ProviderHealth;
  models: (ModelInfo & {
    details?: ModelDetails;
    toolMode?: ToolMode;
    toolModeSource?: 'override' | 'probe' | 'capabilities' | 'default';
    probe?: ProbeResult;
    benchmark?: unknown;
    memory?: MemoryEstimate;
    fit?: FitAssessment;
    chatCapable: boolean;
  })[];
  loaded: LoadedModel[];
}

interface RunningTask {
  controller: AbortController;
  promise: Promise<TaskRecord>;
  workspaceId: string;
}

export interface FileDiff {
  path: string;
  status: FileChange['status'];
  oldPath?: string;
  additions: number;
  deletions: number;
  before: string | null;
  after: string | null;
  binary: boolean;
}

/**
 * The LocalCode engine: owns persistence, model providers, workspace sessions
 * and running tasks. The CLI, the local server (desktop UI) and tests all
 * drive the agent through this class.
 */
export class Engine extends EventEmitter {
  readonly store: Store;
  readonly dataDir: string;
  readonly tools = new ToolRegistry();
  private readonly sessions = new Map<string, WorkspaceSession>();
  private readonly running = new Map<string, RunningTask>();
  private readonly pending = new Map<string, { request: ApprovalRequest; resolve: (r: ApprovalResponse) => void }>();
  private providerCache = new Map<string, { key: string; provider: ModelProvider }>();
  private detailsCache = new Map<string, { at: number; details: ModelDetails }>();
  /** Override how approvals are obtained (the CLI prompts on the terminal). Default: wait for respondApproval(). */
  approvalHandler: ApprovalHandler | undefined;
  private readonly providerFactory: (cfg: ProviderConfig) => ModelProvider;

  constructor(opts: EngineOptions = {}) {
    super();
    this.providerFactory = opts.providerFactory ?? ((cfg) => (cfg.kind === 'ollama' ? new OllamaProvider(cfg) : new OpenAICompatProvider(cfg)));
    this.setMaxListeners(100);
    this.dataDir = opts.dataDir ?? defaultDataDir();
    this.store = new Store(opts.dbFile ?? path.join(this.dataDir, 'localcode.db'));
    if (!opts.skipRecovery) this.store.markOrphanedTasksInterrupted();
  }

  // ---- events -----------------------------------------------------------------

  private publish(e: EngineEvent): void {
    if (!TRANSIENT_EVENTS.has(e.type as AgentEvent['type']) && 'taskId' in e && e.taskId) {
      const task = this.store.getTask(e.taskId);
      try {
        this.store.appendEvent({ taskId: e.taskId, conversationId: task?.conversationId, type: e.type, data: e as unknown as Record<string, unknown> });
      } catch {
        /* activity log is best-effort */
      }
    }
    this.emit('event', e);
  }

  // ---- settings & providers ------------------------------------------------------

  settings(): Settings {
    return this.store.getSettings();
  }

  updateSettings(patch: Partial<Settings> | Record<string, unknown>): Settings {
    const s = this.store.updateSettings(patch);
    for (const session of this.sessions.values()) session.index.setOptions({ ...s.index });
    return s;
  }

  providers(): ModelProvider[] {
    return this.settings()
      .providers.filter((p) => p.enabled)
      .map((cfg) => this.providerFor(cfg));
  }

  private providerFor(cfg: ProviderConfig): ModelProvider {
    const key = JSON.stringify(cfg);
    const cached = this.providerCache.get(cfg.id);
    if (cached && cached.key === key) return cached.provider;
    const provider = this.providerFactory(cfg);
    this.providerCache.set(cfg.id, { key, provider });
    return provider;
  }

  provider(id: string): ModelProvider {
    const cfg = this.settings().providers.find((p) => p.id === id);
    if (!cfg) throw new LocalCodeError('not_found', `Unknown inference provider "${id}"`);
    return this.providerFor(cfg);
  }

  async modelDetails(ref: ModelRef, refresh = false): Promise<ModelDetails> {
    const key = `${ref.providerId}/${ref.model}`;
    const c = this.detailsCache.get(key);
    if (c && !refresh && Date.now() - c.at < 5 * 60_000) return c.details;
    const details = await this.provider(ref.providerId).showModel(ref.model);
    this.detailsCache.set(key, { at: Date.now(), details });
    return details;
  }

  /** Decide how tools are exposed to a model: user override > probe result > reported capabilities. */
  toolModeFor(ref: ModelRef, details?: ModelDetails): { mode: ToolMode; source: 'override' | 'probe' | 'capabilities' | 'default' } {
    const override = this.settings().toolModeOverrides[`${ref.providerId}/${ref.model}`];
    if (override && override !== 'auto') return { mode: override, source: 'override' };
    const profile = this.store.getModelProfile(ref.providerId, ref.model);
    const probe = profile?.probe as ProbeResult | undefined;
    if (probe?.recommended) return { mode: probe.recommended, source: 'probe' };
    if (details?.capabilitiesReported) return { mode: details.capabilities.includes('tools') ? 'native' : 'prompted', source: 'capabilities' };
    // Unknown server capabilities: try native first; the adapter falls back to prompted on "unsupported" errors.
    return { mode: 'native', source: 'default' };
  }

  async listModels(): Promise<ModelListing[]> {
    const settings = this.settings();
    const sys = await getSystemInfo(this.dataDir);
    const out: ModelListing[] = [];
    for (const cfg of settings.providers.filter((p) => p.enabled)) {
      const provider = this.providerFor(cfg);
      const health = await provider.health();
      if (!health.ok) {
        out.push({ provider: cfg, health, models: [], loaded: [] });
        continue;
      }
      let models: ModelInfo[] = [];
      let loaded: LoadedModel[] = [];
      try {
        models = await provider.listModels();
        loaded = (await provider.listLoaded?.().catch(() => [])) ?? [];
      } catch (err) {
        out.push({ provider: cfg, health: { ...health, ok: false, error: errorMessage(err) }, models: [], loaded: [] });
        continue;
      }
      const enriched: ModelListing['models'] = [];
      for (const m of models) {
        let details: ModelDetails | undefined;
        try {
          details = await this.modelDetails({ providerId: cfg.id, model: m.name });
        } catch {
          /* details optional */
        }
        const ref = { providerId: cfg.id, model: m.name };
        const tm = this.toolModeFor(ref, details);
        const profile = this.store.getModelProfile(cfg.id, m.name);
        const chatCapable = !details || !(details.capabilities.length === 1 && details.capabilities[0] === 'embedding');
        const memory = details ? estimateMemory({ ...details, sizeBytes: details.sizeBytes ?? m.sizeBytes }, Math.min(settings.generation.numCtx, details.contextLength ?? settings.generation.numCtx)) : undefined;
        enriched.push({
          ...m,
          details,
          toolMode: chatCapable ? tm.mode : undefined,
          toolModeSource: chatCapable ? tm.source : undefined,
          probe: profile?.probe as ProbeResult | undefined,
          benchmark: profile?.benchmark,
          memory,
          fit: memory ? assessFit(memory, sys, loaded) : undefined,
          chatCapable,
        });
      }
      out.push({ provider: cfg, health, models: enriched, loaded });
    }
    return out;
  }

  /** Pick the model for a conversation: conversation choice > coding role > first healthy chat model. */
  async resolveModel(ref?: ModelRef): Promise<ModelRef> {
    if (ref?.providerId && ref.model) return ref;
    const coding = this.settings().models.coding;
    if (coding) return coding;
    for (const provider of this.providers()) {
      const h = await provider.health();
      if (!h.ok) continue;
      const models = await provider.listModels().catch(() => [] as ModelInfo[]);
      const chat = models.filter((m) => !/embed/i.test(m.name));
      if (chat.length) return { providerId: provider.config.id, model: chat[0].name };
    }
    throw new LocalCodeError(
      'unreachable',
      'No local model is available. Start Ollama (https://ollama.com) or a llama.cpp server and install a model, e.g. "ollama pull qwen2.5-coder:7b".',
    );
  }

  async createClient(ref: ModelRef): Promise<ModelClient> {
    const provider = this.provider(ref.providerId);
    let details: ModelDetails | undefined;
    try {
      details = await this.modelDetails(ref);
    } catch (err) {
      if (err instanceof LocalCodeError && err.code === 'model_not_found') throw err;
      /* unknown details: continue with defaults */
    }
    if (details && details.capabilities.length === 1 && details.capabilities[0] === 'embedding') {
      throw new LocalCodeError('unsupported', `${ref.model} is an embedding model and cannot chat. Choose a chat/coding model.`);
    }
    const s = this.settings();
    const { mode } = this.toolModeFor(ref, details);
    const numCtx = Math.min(s.generation.numCtx, details?.contextLength ?? s.generation.numCtx);
    return new ModelClient({
      provider,
      model: ref.model,
      toolMode: mode,
      capabilities: details?.capabilities ?? [],
      generation: {
        temperature: s.generation.temperature,
        topP: s.generation.topP,
        numCtx,
        maxTokens: s.generation.maxTokens,
        numGpu: s.generation.numGpu ?? undefined,
        keepAlive: s.generation.keepAlive,
        think: s.generation.thinking,
      },
      idleTimeoutSec: s.agent.modelIdleTimeoutSec,
    });
  }

  /**
   * Make sure a model is loaded before use, reporting progress. Cold loads of
   * multi-GB weights can take minutes; load failures (e.g. out of memory)
   * surface here with a clear message instead of as a stalled request.
   */
  async ensureLoaded(ref: ModelRef, opts: { signal?: AbortSignal; onStatus?: (msg: string) => void; numCtx?: number } = {}): Promise<void> {
    const provider = this.provider(ref.providerId);
    if (!provider.preload) return;
    const loaded = (await provider.listLoaded?.().catch(() => [] as LoadedModel[])) ?? [];
    if (loaded.some((m) => m.name === ref.model)) return;
    const s = this.settings();
    const t0 = Date.now();
    opts.onStatus?.(`Loading ${ref.model} into memory (the first load can take several minutes on slow disks)…`);
    await provider.preload(ref.model, { keepAlive: s.generation.keepAlive, numCtx: opts.numCtx, numGpu: s.generation.numGpu ?? undefined, signal: opts.signal });
    opts.onStatus?.(`${ref.model} loaded in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
  }

  async probeModel(ref: ModelRef, signal?: AbortSignal, onStatus?: (msg: string) => void): Promise<ProbeResult> {
    const details = await this.modelDetails(ref, true);
    const s = this.settings();
    await this.ensureLoaded(ref, { signal, onStatus, numCtx: Math.min(4096, details.contextLength ?? 4096) });
    const result = await probeToolCalling(
      this.provider(ref.providerId),
      ref.model,
      details.capabilities,
      { numCtx: Math.min(4096, details.contextLength ?? 4096), keepAlive: s.generation.keepAlive, numGpu: s.generation.numGpu ?? undefined, think: false },
      signal,
    );
    this.store.upsertModelProfile(ref.providerId, ref.model, { probe: result, toolMode: result.recommended });
    return result;
  }

  async pullModel(providerId: string, model: string, signal?: AbortSignal): Promise<void> {
    const provider = this.provider(providerId);
    if (!provider.pull) throw new LocalCodeError('unsupported', `${provider.config.label} does not support downloading models from LocalCode.`);
    await provider.pull(model, (progress) => this.publish({ type: 'pull.progress', providerId, model, progress }), signal);
    this.detailsCache.delete(`${providerId}/${model}`);
  }

  async systemInfo(): Promise<SystemInfo> {
    return getSystemInfo(this.dataDir);
  }

  // ---- workspaces & conversations ---------------------------------------------

  openWorkspace(dir: string): WorkspaceSession {
    const abs = path.resolve(dir);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new LocalCodeError('not_found', `Not a directory: ${abs}`);
    const rec = this.store.upsertWorkspace(abs);
    const existing = this.sessions.get(rec.id);
    if (existing) return existing;
    const session = new WorkspaceSession(rec, this.store, () => this.settings(), this.dataDir, (id, chunk) =>
      this.publish({ type: 'process.output', workspaceId: rec.id, processId: id, chunk }),
    );
    session.index.on('updated', (st: { files: number }) => this.publish({ type: 'index.updated', workspaceId: rec.id, files: st.files }));
    session.index.on('changed', () => this.publish({ type: 'files.changed', workspaceId: rec.id }));
    this.sessions.set(rec.id, session);
    return session;
  }

  session(workspaceId: string): WorkspaceSession {
    const s = this.sessions.get(workspaceId);
    if (s) return s;
    const rec = this.store.getWorkspace(workspaceId);
    if (!rec) throw new LocalCodeError('not_found', `Unknown workspace ${workspaceId}`);
    return this.openWorkspace(rec.path);
  }

  createConversation(workspaceId: string, opts: { title?: string; model?: ModelRef } = {}): ConversationRecord {
    this.session(workspaceId);
    return this.store.createConversation(workspaceId, opts.title ?? 'New conversation', opts.model);
  }

  /** Switch the model used by a conversation; history is preserved. */
  setConversationModel(conversationId: string, ref: ModelRef): void {
    this.store.updateConversation(conversationId, { providerId: ref.providerId, model: ref.model });
  }

  setPermissionMode(workspaceId: string, mode: PermissionMode | undefined): void {
    this.session(workspaceId).setPermissionMode(mode);
  }

  // ---- tasks ------------------------------------------------------------------

  isRunning(taskId: string): boolean {
    return this.running.has(taskId);
  }

  runningTaskFor(workspaceId: string): string | undefined {
    for (const [id, r] of this.running) if (r.workspaceId === workspaceId) return id;
    return undefined;
  }

  /** Start a task in the background; returns immediately with the task id. */
  async startTask(params: { conversationId: string; prompt: string; model?: ModelRef }): Promise<TaskRecord> {
    const conv = this.store.getConversation(params.conversationId);
    if (!conv) throw new LocalCodeError('not_found', `Conversation ${params.conversationId} not found`);
    const busy = this.runningTaskFor(conv.workspaceId);
    if (busy) throw new LocalCodeError('conflict', 'Another task is already running in this workspace. Stop it or wait for it to finish.');
    const ref = await this.resolveModel(params.model ?? (conv.providerId && conv.model ? { providerId: conv.providerId, model: conv.model } : undefined));
    if (conv.providerId !== ref.providerId || conv.model !== ref.model) this.setConversationModel(conv.id, ref);
    const task = this.store.createTask({ conversationId: conv.id, workspaceId: conv.workspaceId, prompt: params.prompt, providerId: ref.providerId, model: ref.model });
    this.launch(task, ref);
    return task;
  }

  /** Start a task and wait until it finishes. */
  async runTask(params: { conversationId: string; prompt: string; model?: ModelRef }): Promise<TaskRecord> {
    const task = await this.startTask(params);
    return this.waitForTask(task.id);
  }

  waitForTask(taskId: string): Promise<TaskRecord> {
    const r = this.running.get(taskId);
    if (r) return r.promise;
    const t = this.store.getTask(taskId);
    if (!t) return Promise.reject(new LocalCodeError('not_found', `Task ${taskId} not found`));
    return Promise.resolve(t);
  }

  /** Continue an interrupted, failed, blocked or cancelled task with its full history. */
  async resumeTask(taskId: string, opts: { model?: ModelRef; reason?: string } = {}): Promise<TaskRecord> {
    const task = this.store.getTask(taskId);
    if (!task) throw new LocalCodeError('not_found', `Task ${taskId} not found`);
    if (this.running.has(taskId)) throw new LocalCodeError('conflict', 'Task is already running.');
    if (task.status === 'completed') throw new LocalCodeError('conflict', 'Task already completed. Send a new message to continue the conversation.');
    const busy = this.runningTaskFor(task.workspaceId);
    if (busy) throw new LocalCodeError('conflict', 'Another task is running in this workspace.');
    const conv = this.store.getConversation(task.conversationId)!;
    const ref = await this.resolveModel(opts.model ?? (conv.providerId && conv.model ? { providerId: conv.providerId, model: conv.model } : undefined));
    const reason =
      opts.reason ??
      (task.status === 'failed' ? `Retrying after failure: ${task.error ?? 'unknown error'}` : task.status === 'interrupted' ? 'Resumed after the application was restarted' : 'Resumed by the user');
    this.launch(task, ref, reason);
    return this.store.getTask(taskId)!;
  }

  private launch(task: TaskRecord, ref: ModelRef, resumeReason?: string): void {
    const controller = new AbortController();
    const session = this.session(task.workspaceId);
    const promise = (async () => {
      try {
        const client = await this.createClient(ref);
        const s = this.settings();
        await this.ensureLoaded(ref, {
          signal: controller.signal,
          numCtx: client.generation.numCtx,
          onStatus: (message) => this.publish({ type: 'log', taskId: task.id, level: 'info', message, workspaceId: task.workspaceId } as EngineEvent),
        });
        const planningClient = s.models.planning && !sameRef(s.models.planning, ref) ? await this.createClient(s.models.planning).catch(() => undefined) : undefined;
        const lightClient = s.models.light && !sameRef(s.models.light, ref) ? await this.createClient(s.models.light).catch(() => undefined) : undefined;
        const embedding = s.models.embedding;
        session.search.embeddings.configure(embedding ? this.provider(embedding.providerId) : undefined, embedding?.model);
        const runner = new AgentRunner({
          store: this.store,
          tools: this.tools,
          settings: () => this.settings(),
          client,
          planningClient,
          lightClient,
          workspace: session.record,
          resources: session,
          permissionMode: () => session.permissionMode(),
          approvals: (req, signal) => this.requestApproval(req, signal),
          emit: (e) => this.publish({ ...e, workspaceId: task.workspaceId } as EngineEvent),
          context: session.context,
          buildSystemPrompt: (a) => session.systemPrompt(a),
        });
        return await runner.run(task.id, { signal: controller.signal, resumeReason });
      } catch (err) {
        const error = errorMessage(err);
        this.store.updateTask(task.id, { status: 'failed', error, finishedAt: new Date().toISOString() });
        this.publish({ type: 'task.status', taskId: task.id, status: 'failed', error, workspaceId: task.workspaceId });
        return this.store.getTask(task.id)!;
      } finally {
        this.running.delete(task.id);
        for (const [id, p] of this.pending) if (p.request.taskId === task.id) this.pending.delete(id);
        session.index.markDirty();
      }
    })();
    this.running.set(task.id, { controller, promise, workspaceId: task.workspaceId });
  }

  cancelTask(taskId: string): boolean {
    const r = this.running.get(taskId);
    if (!r) return false;
    r.controller.abort();
    return true;
  }

  // ---- approvals --------------------------------------------------------------

  private requestApproval(req: ApprovalRequest, signal: AbortSignal): Promise<ApprovalResponse> {
    if (this.approvalHandler) return this.approvalHandler(req, signal);
    return new Promise((resolve, reject) => {
      this.pending.set(req.id, { request: req, resolve });
      signal.addEventListener(
        'abort',
        () => {
          this.pending.delete(req.id);
          reject(new LocalCodeError('aborted', 'Cancelled while waiting for approval'));
        },
        { once: true },
      );
    });
  }

  pendingApprovals(): ApprovalRequest[] {
    return [...this.pending.values()].map((p) => p.request);
  }

  respondApproval(requestId: string, response: ApprovalResponse): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    this.pending.delete(requestId);
    p.resolve(response);
    return true;
  }

  // ---- checkpoints / undo -----------------------------------------------------

  listCheckpoints(workspaceId: string): CheckpointRecord[] {
    return this.store.listCheckpoints(workspaceId);
  }

  /** Changed files with before/after content between a checkpoint and now (for the diff viewer). */
  async diffSince(workspaceId: string, commitHash: string, maxFiles = 50): Promise<FileDiff[]> {
    const session = this.session(workspaceId);
    const changes = await session.checkpoints.changes(commitHash);
    const out: FileDiff[] = [];
    for (const c of changes.slice(0, maxFiles)) {
      const before = c.status === 'added' ? null : ((await session.checkpoints.fileAt(commitHash, c.oldPath ?? c.path)) ?? null);
      let after: string | null = null;
      let binary = false;
      const abs = path.join(session.guard.root, c.path);
      if (c.status !== 'deleted' && existsSync(abs)) {
        const buf = readFileSync(abs);
        binary = isProbablyBinary(buf);
        after = binary ? null : buf.toString('utf8');
      }
      if (before && before.includes('\0')) binary = true;
      out.push({
        path: c.path,
        status: c.status,
        oldPath: c.oldPath,
        additions: c.additions,
        deletions: c.deletions,
        before: binary ? null : before === null ? null : session.redactor.redact(before).text,
        after: binary ? null : after === null ? null : session.redactor.redact(after).text,
        binary,
      });
    }
    return out;
  }

  async taskDiff(taskId: string): Promise<FileDiff[]> {
    const task = this.store.getTask(taskId);
    if (!task?.checkpointBefore) return [];
    return this.diffSince(task.workspaceId, task.checkpointBefore);
  }

  async restoreCheckpoint(workspaceId: string, checkpointIdOrHash: string, paths?: string[]): Promise<{ restored: string[]; removed: string[] }> {
    if (this.runningTaskFor(workspaceId)) throw new LocalCodeError('conflict', 'Stop the running task before restoring a checkpoint.');
    const session = this.session(workspaceId);
    const rec = this.store.getCheckpoint(checkpointIdOrHash);
    const hash = rec?.commitHash ?? checkpointIdOrHash;
    const r = await session.checkpoints.restore(hash, paths);
    const safety = this.store.addCheckpoint({ workspaceId, commitHash: r.safetyCheckpoint, label: `Before restoring "${rec?.label ?? hash.slice(0, 8)}"` });
    this.publish({ type: 'checkpoint.created', checkpoint: safety, workspaceId } as EngineEvent);
    for (const p of [...r.restored, ...r.removed]) session.fileState.forget(p);
    session.index.markDirty();
    this.publish({ type: 'files.changed', workspaceId });
    return { restored: r.restored, removed: r.removed };
  }

  /** Revert everything a task changed. */
  async undoTask(taskId: string): Promise<{ restored: string[]; removed: string[] }> {
    const task = this.store.getTask(taskId);
    if (!task?.checkpointBefore) throw new LocalCodeError('not_found', 'This task has no checkpoint to undo to.');
    return this.restoreCheckpoint(task.workspaceId, task.checkpointBefore);
  }

  // ---- terminal ---------------------------------------------------------------

  /** Run a command typed by the user in the terminal panel (the user's own action: no agent permission checks). */
  async runTerminalCommand(workspaceId: string, command: string, signal?: AbortSignal) {
    const session = this.session(workspaceId);
    const r = await session.userShell.run(command, {
      timeoutMs: 30 * 60_000,
      signal,
      onOutput: (stream, chunk) => this.publish({ type: 'terminal.output', workspaceId, stream, chunk }),
    });
    session.index.markDirty();
    this.publish({ type: 'terminal.exit', workspaceId, exitCode: r.exitCode, cwd: r.cwd });
    return { exitCode: r.exitCode, cwd: r.cwd, output: stripAnsi(r.output), timedOut: r.timedOut };
  }

  // ---- lifecycle --------------------------------------------------------------

  async dispose(): Promise<void> {
    for (const r of this.running.values()) r.controller.abort();
    await Promise.allSettled([...this.running.values()].map((r) => r.promise));
    for (const s of this.sessions.values()) s.dispose();
    this.sessions.clear();
    this.store.close();
  }
}

function sameRef(a: ModelRef, b: ModelRef): boolean {
  return a.providerId === b.providerId && a.model === b.model;
}

export type { TaskStatus };
