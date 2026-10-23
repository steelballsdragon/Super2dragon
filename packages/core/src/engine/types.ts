import type { ChatMessage } from '../models/types.js';
import type { PermissionMode } from '../security/permissions.js';

export type TaskStatus =
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'interrupted';

export const TERMINAL_STATUSES: TaskStatus[] = ['completed', 'failed', 'blocked', 'cancelled', 'interrupted'];

export type PlanStatus = 'pending' | 'in_progress' | 'done' | 'blocked' | 'skipped';

export interface PlanItem {
  id: string;
  title: string;
  status: PlanStatus;
  /** How we will know this step is done (explicit acceptance criterion). */
  acceptance?: string;
  note?: string;
}

export interface WorkspaceRecord {
  id: string;
  path: string;
  name: string;
  config: { permissionMode?: PermissionMode };
  createdAt: string;
  lastOpenedAt: string;
}

export interface ConversationRecord {
  id: string;
  workspaceId: string;
  title: string;
  providerId?: string;
  model?: string;
  summary?: string;
  summaryUptoSeq: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord extends ChatMessage {
  id: string;
  conversationId: string;
  taskId?: string;
  seq: number;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  modelCalls: number;
  modelMs: number;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  oldPath?: string;
}

export interface CommandRecord {
  command: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  tool: string;
}

export interface TestRunRecord {
  command: string;
  ok: boolean;
  exitCode: number | null;
  passed?: number;
  failed?: number;
  skipped?: number;
}

export interface TaskReport {
  status: TaskStatus;
  /** The model's own final message. */
  summary: string;
  /** Facts collected by the application from real tool results. */
  filesChanged: FileChange[];
  commands: CommandRecord[];
  tests: TestRunRecord[];
  plan: PlanItem[];
  steps: number;
  durationMs: number;
  usage: UsageTotals;
  warnings: string[];
  checkpointBefore?: string;
}

export interface TaskRecord {
  id: string;
  conversationId: string;
  workspaceId: string;
  prompt: string;
  status: TaskStatus;
  plan: PlanItem[];
  report?: TaskReport;
  error?: string;
  checkpointBefore?: string;
  steps: number;
  usage: UsageTotals;
  providerId?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface CheckpointRecord {
  id: string;
  workspaceId: string;
  taskId?: string;
  commitHash: string;
  label: string;
  createdAt: string;
}

export interface StoredEvent {
  id: number;
  taskId?: string;
  conversationId?: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}
