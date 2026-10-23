import path from 'node:path';
import type { ToolCall } from '../models/types.js';
import type { PermissionRule } from '../security/permissions.js';
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '../engine/settings.js';
import type {
  CheckpointRecord,
  ConversationRecord,
  MessageRecord,
  PlanItem,
  StoredEvent,
  TaskRecord,
  TaskReport,
  TaskStatus,
  UsageTotals,
  WorkspaceRecord,
} from '../engine/types.js';
import { newId } from '../util/ids.js';
import { openDatabase, type Database } from './db.js';

const now = () => new Date().toISOString();
const parse = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

type Row = Record<string, unknown>;

/** Persistence for conversations, tasks, activity, checkpoints, settings and model profiles. */
export class Store {
  readonly db: Database;

  constructor(file: string) {
    this.db = openDatabase(file);
  }

  close(): void {
    this.db.close();
  }

  // ---- settings ---------------------------------------------------------------

  getSettings(): Settings {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'settings'`).get() as Row | undefined;
    const stored = parse<Partial<Settings>>(row?.value, {});
    const merged = mergeSettings(DEFAULT_SETTINGS, stored);
    // Keep providers the user removed removed, but add new defaults only on first run.
    if (stored.providers) merged.providers = stored.providers;
    return merged;
  }

  updateSettings(patch: Partial<Settings> | Record<string, unknown>): Settings {
    const next = mergeSettings(this.getSettings(), patch);
    this.db
      .prepare(`INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(JSON.stringify(next));
    return next;
  }

  // ---- workspaces -------------------------------------------------------------

  upsertWorkspace(absPath: string): WorkspaceRecord {
    const existing = this.db.prepare(`SELECT * FROM workspaces WHERE path = ?`).get(absPath) as Row | undefined;
    if (existing) {
      this.db.prepare(`UPDATE workspaces SET last_opened_at = ? WHERE id = ?`).run(now(), existing.id as string);
      return this.mapWorkspace({ ...existing, last_opened_at: now() });
    }
    const rec: WorkspaceRecord = {
      id: newId('ws_'),
      path: absPath,
      name: path.basename(absPath) || absPath,
      config: {},
      createdAt: now(),
      lastOpenedAt: now(),
    };
    this.db
      .prepare(`INSERT INTO workspaces (id, path, name, config, created_at, last_opened_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(rec.id, rec.path, rec.name, '{}', rec.createdAt, rec.lastOpenedAt);
    return rec;
  }

  getWorkspace(id: string): WorkspaceRecord | undefined {
    const r = this.db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id) as Row | undefined;
    return r ? this.mapWorkspace(r) : undefined;
  }

  listWorkspaces(): WorkspaceRecord[] {
    return (this.db.prepare(`SELECT * FROM workspaces ORDER BY last_opened_at DESC`).all() as Row[]).map((r) => this.mapWorkspace(r));
  }

  updateWorkspaceConfig(id: string, config: WorkspaceRecord['config']): void {
    this.db.prepare(`UPDATE workspaces SET config = ? WHERE id = ?`).run(JSON.stringify(config), id);
  }

  private mapWorkspace(r: Row): WorkspaceRecord {
    return {
      id: r.id as string,
      path: r.path as string,
      name: r.name as string,
      config: parse(r.config, {}),
      createdAt: r.created_at as string,
      lastOpenedAt: r.last_opened_at as string,
    };
  }

  // ---- conversations ----------------------------------------------------------

  createConversation(workspaceId: string, title = 'New conversation', model?: { providerId: string; model: string }): ConversationRecord {
    const rec: ConversationRecord = {
      id: newId('conv_'),
      workspaceId,
      title,
      providerId: model?.providerId,
      model: model?.model,
      summaryUptoSeq: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db
      .prepare(
        `INSERT INTO conversations (id, workspace_id, title, provider_id, model, summary_upto_seq, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(rec.id, workspaceId, title, rec.providerId ?? null, rec.model ?? null, rec.createdAt, rec.updatedAt);
    return rec;
  }

  getConversation(id: string): ConversationRecord | undefined {
    const r = this.db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as Row | undefined;
    return r ? this.mapConversation(r) : undefined;
  }

  listConversations(workspaceId: string, limit = 100): ConversationRecord[] {
    return (
      this.db.prepare(`SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ?`).all(workspaceId, limit) as Row[]
    ).map((r) => this.mapConversation(r));
  }

  updateConversation(id: string, patch: Partial<Pick<ConversationRecord, 'title' | 'providerId' | 'model' | 'summary' | 'summaryUptoSeq'>>): void {
    const cur = this.getConversation(id);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: now() };
    this.db
      .prepare(`UPDATE conversations SET title = ?, provider_id = ?, model = ?, summary = ?, summary_upto_seq = ?, updated_at = ? WHERE id = ?`)
      .run(next.title, next.providerId ?? null, next.model ?? null, next.summary ?? null, next.summaryUptoSeq, next.updatedAt, id);
  }

  touchConversation(id: string): void {
    this.db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now(), id);
  }

  deleteConversation(id: string): void {
    this.db.prepare(`DELETE FROM events WHERE conversation_id = ?`).run(id);
    this.db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
  }

  private mapConversation(r: Row): ConversationRecord {
    return {
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      title: r.title as string,
      providerId: (r.provider_id as string) ?? undefined,
      model: (r.model as string) ?? undefined,
      summary: (r.summary as string) ?? undefined,
      summaryUptoSeq: Number(r.summary_upto_seq ?? 0),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  // ---- messages ---------------------------------------------------------------

  appendMessage(
    conversationId: string,
    msg: { role: MessageRecord['role']; content: string; toolCalls?: ToolCall[]; toolCallId?: string; toolName?: string; meta?: Record<string, unknown> },
    taskId?: string,
  ): MessageRecord {
    const seqRow = this.db.prepare(`SELECT COALESCE(MAX(seq), 0) AS s FROM messages WHERE conversation_id = ?`).get(conversationId) as Row;
    const rec: MessageRecord = {
      id: newId('msg_'),
      conversationId,
      taskId,
      seq: Number(seqRow.s) + 1,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls?.length ? msg.toolCalls : undefined,
      toolCallId: msg.toolCallId,
      toolName: msg.toolName,
      meta: msg.meta,
      createdAt: now(),
    };
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, task_id, seq, role, content, tool_calls, tool_call_id, tool_name, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rec.id,
        conversationId,
        taskId ?? null,
        rec.seq,
        rec.role,
        rec.content,
        rec.toolCalls ? JSON.stringify(rec.toolCalls) : null,
        rec.toolCallId ?? null,
        rec.toolName ?? null,
        rec.meta ? JSON.stringify(rec.meta) : null,
        rec.createdAt,
      );
    this.touchConversation(conversationId);
    return rec;
  }

  listMessages(conversationId: string, opts: { afterSeq?: number } = {}): MessageRecord[] {
    return (
      this.db
        .prepare(`SELECT * FROM messages WHERE conversation_id = ? AND seq > ? ORDER BY seq ASC`)
        .all(conversationId, opts.afterSeq ?? 0) as Row[]
    ).map((r) => ({
      id: r.id as string,
      conversationId: r.conversation_id as string,
      taskId: (r.task_id as string) ?? undefined,
      seq: Number(r.seq),
      role: r.role as MessageRecord['role'],
      content: r.content as string,
      toolCalls: parse<ToolCall[] | undefined>(r.tool_calls, undefined),
      toolCallId: (r.tool_call_id as string) ?? undefined,
      toolName: (r.tool_name as string) ?? undefined,
      meta: parse<Record<string, unknown> | undefined>(r.meta, undefined),
      createdAt: r.created_at as string,
    }));
  }

  // ---- tasks ------------------------------------------------------------------

  createTask(t: { conversationId: string; workspaceId: string; prompt: string; providerId?: string; model?: string }): TaskRecord {
    const rec: TaskRecord = {
      id: newId('task_'),
      conversationId: t.conversationId,
      workspaceId: t.workspaceId,
      prompt: t.prompt,
      status: 'running',
      plan: [],
      steps: 0,
      usage: { promptTokens: 0, completionTokens: 0, modelCalls: 0, modelMs: 0 },
      providerId: t.providerId,
      model: t.model,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db
      .prepare(
        `INSERT INTO tasks (id, conversation_id, workspace_id, prompt, status, plan, steps, usage, provider_id, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', 0, ?, ?, ?, ?, ?)`,
      )
      .run(rec.id, rec.conversationId, rec.workspaceId, rec.prompt, rec.status, JSON.stringify(rec.usage), rec.providerId ?? null, rec.model ?? null, rec.createdAt, rec.updatedAt);
    return rec;
  }

  updateTask(
    id: string,
    patch: Partial<{
      status: TaskStatus;
      plan: PlanItem[];
      report: TaskReport;
      error: string | null;
      checkpointBefore: string;
      steps: number;
      usage: UsageTotals;
      providerId: string;
      model: string;
      finishedAt: string | null;
    }>,
  ): void {
    const sets: string[] = ['updated_at = ?'];
    const vals: (string | number | null)[] = [now()];
    const map: Record<string, [string, (v: unknown) => string | number | null]> = {
      status: ['status', (v) => v as string],
      plan: ['plan', (v) => JSON.stringify(v)],
      report: ['report', (v) => JSON.stringify(v)],
      error: ['error', (v) => (v as string | null) ?? null],
      checkpointBefore: ['checkpoint_before', (v) => v as string],
      steps: ['steps', (v) => v as number],
      usage: ['usage', (v) => JSON.stringify(v)],
      providerId: ['provider_id', (v) => v as string],
      model: ['model', (v) => v as string],
      finishedAt: ['finished_at', (v) => (v as string | null) ?? null],
    };
    for (const [k, v] of Object.entries(patch)) {
      const m = map[k];
      if (!m || v === undefined) continue;
      sets.push(`${m[0]} = ?`);
      vals.push(m[1](v));
    }
    vals.push(id);
    this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  getTask(id: string): TaskRecord | undefined {
    const r = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as Row | undefined;
    return r ? this.mapTask(r) : undefined;
  }

  listTasks(conversationId: string): TaskRecord[] {
    return (this.db.prepare(`SELECT * FROM tasks WHERE conversation_id = ? ORDER BY created_at ASC`).all(conversationId) as Row[]).map((r) =>
      this.mapTask(r),
    );
  }

  recentTasks(workspaceId: string, limit = 5): TaskRecord[] {
    return (
      this.db.prepare(`SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`).all(workspaceId, limit) as Row[]
    ).map((r) => this.mapTask(r));
  }

  /** Tasks left 'running' by a previous process that crashed or was closed. */
  markOrphanedTasksInterrupted(): number {
    const r = this.db
      .prepare(`UPDATE tasks SET status = 'interrupted', updated_at = ? WHERE status IN ('running', 'awaiting_approval')`)
      .run(now());
    return Number(r.changes);
  }

  private mapTask(r: Row): TaskRecord {
    return {
      id: r.id as string,
      conversationId: r.conversation_id as string,
      workspaceId: r.workspace_id as string,
      prompt: r.prompt as string,
      status: r.status as TaskStatus,
      plan: parse(r.plan, []),
      report: parse<TaskReport | undefined>(r.report, undefined),
      error: (r.error as string) ?? undefined,
      checkpointBefore: (r.checkpoint_before as string) ?? undefined,
      steps: Number(r.steps ?? 0),
      usage: parse(r.usage, { promptTokens: 0, completionTokens: 0, modelCalls: 0, modelMs: 0 }),
      providerId: (r.provider_id as string) ?? undefined,
      model: (r.model as string) ?? undefined,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      finishedAt: (r.finished_at as string) ?? undefined,
    };
  }

  // ---- activity events --------------------------------------------------------

  appendEvent(e: { taskId?: string; conversationId?: string; type: string; data: Record<string, unknown> }): number {
    const r = this.db
      .prepare(`INSERT INTO events (task_id, conversation_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(e.taskId ?? null, e.conversationId ?? null, e.type, JSON.stringify(e.data), now());
    return Number(r.lastInsertRowid);
  }

  listEvents(filter: { taskId?: string; conversationId?: string; afterId?: number; limit?: number }): StoredEvent[] {
    const where: string[] = ['id > ?'];
    const vals: (string | number)[] = [filter.afterId ?? 0];
    if (filter.taskId) {
      where.push('task_id = ?');
      vals.push(filter.taskId);
    }
    if (filter.conversationId) {
      where.push('conversation_id = ?');
      vals.push(filter.conversationId);
    }
    vals.push(filter.limit ?? 2000);
    return (this.db.prepare(`SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY id ASC LIMIT ?`).all(...vals) as Row[]).map((r) => ({
      id: Number(r.id),
      taskId: (r.task_id as string) ?? undefined,
      conversationId: (r.conversation_id as string) ?? undefined,
      type: r.type as string,
      data: parse(r.data, {}),
      createdAt: r.created_at as string,
    }));
  }

  // ---- checkpoints ------------------------------------------------------------

  addCheckpoint(c: Omit<CheckpointRecord, 'id' | 'createdAt'>): CheckpointRecord {
    const rec: CheckpointRecord = { ...c, id: newId('cp_'), createdAt: now() };
    this.db
      .prepare(`INSERT INTO checkpoints (id, workspace_id, task_id, commit_hash, label, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(rec.id, rec.workspaceId, rec.taskId ?? null, rec.commitHash, rec.label, rec.createdAt);
    return rec;
  }

  listCheckpoints(workspaceId: string, limit = 200): CheckpointRecord[] {
    return (
      this.db.prepare(`SELECT * FROM checkpoints WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(workspaceId, limit) as Row[]
    ).map((r) => this.mapCheckpoint(r));
  }

  getCheckpoint(id: string): CheckpointRecord | undefined {
    const r = this.db.prepare(`SELECT * FROM checkpoints WHERE id = ?`).get(id) as Row | undefined;
    return r ? this.mapCheckpoint(r) : undefined;
  }

  private mapCheckpoint(r: Row): CheckpointRecord {
    return {
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      taskId: (r.task_id as string) ?? undefined,
      commitHash: r.commit_hash as string,
      label: r.label as string,
      createdAt: r.created_at as string,
    };
  }

  // ---- permission rules -------------------------------------------------------

  addRule(workspaceId: string, tool: string, pattern: string): PermissionRule {
    const rec: PermissionRule = { id: newId('rule_'), workspaceId, tool, pattern, createdAt: now() };
    this.db
      .prepare(`INSERT OR IGNORE INTO permission_rules (id, workspace_id, tool, pattern, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(rec.id, workspaceId, tool, pattern, rec.createdAt);
    return rec;
  }

  listRules(workspaceId: string): PermissionRule[] {
    return (this.db.prepare(`SELECT * FROM permission_rules WHERE workspace_id = ? ORDER BY created_at`).all(workspaceId) as Row[]).map((r) => ({
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      tool: r.tool as string,
      pattern: r.pattern as string,
      createdAt: r.created_at as string,
    }));
  }

  deleteRule(id: string): void {
    this.db.prepare(`DELETE FROM permission_rules WHERE id = ?`).run(id);
  }

  // ---- model profiles ---------------------------------------------------------

  getModelProfile(providerId: string, model: string): { toolMode?: string; probe?: unknown; benchmark?: unknown; updatedAt: string } | undefined {
    const r = this.db.prepare(`SELECT * FROM model_profiles WHERE provider_id = ? AND model = ?`).get(providerId, model) as Row | undefined;
    if (!r) return undefined;
    return {
      toolMode: (r.tool_mode as string) ?? undefined,
      probe: parse(r.probe, undefined),
      benchmark: parse(r.benchmark, undefined),
      updatedAt: r.updated_at as string,
    };
  }

  upsertModelProfile(providerId: string, model: string, patch: { toolMode?: string; probe?: unknown; benchmark?: unknown }): void {
    const cur = this.getModelProfile(providerId, model);
    const next = { ...cur, ...patch };
    this.db
      .prepare(
        `INSERT INTO model_profiles (provider_id, model, tool_mode, probe, benchmark, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider_id, model) DO UPDATE SET tool_mode = excluded.tool_mode, probe = excluded.probe, benchmark = excluded.benchmark, updated_at = excluded.updated_at`,
      )
      .run(
        providerId,
        model,
        next.toolMode ?? null,
        next.probe !== undefined ? JSON.stringify(next.probe) : null,
        next.benchmark !== undefined ? JSON.stringify(next.benchmark) : null,
        now(),
      );
  }

  listModelProfiles(): { providerId: string; model: string; toolMode?: string; probe?: unknown; benchmark?: unknown }[] {
    return (this.db.prepare(`SELECT * FROM model_profiles`).all() as Row[]).map((r) => ({
      providerId: r.provider_id as string,
      model: r.model as string,
      toolMode: (r.tool_mode as string) ?? undefined,
      probe: parse(r.probe, undefined),
      benchmark: parse(r.benchmark, undefined),
    }));
  }
}
