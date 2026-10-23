import type { ToolMode } from '../models/adapter.js';
import type { Usage } from '../models/types.js';
import type { RiskLevel } from '../security/commands.js';
import type { ApprovalAnswer } from '../security/permissions.js';
import type { CheckpointRecord, MessageRecord, PlanItem, TaskReport, TaskStatus } from '../engine/types.js';

export interface ApprovalRequest {
  id: string;
  taskId: string;
  workspaceId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  risk: RiskLevel;
  reasons: string[];
  /** Why the permission engine asked. */
  decisionReason: string;
  /** Key an "always allow" answer would store (e.g. "npm install"). */
  ruleKey?: string;
}

export interface ApprovalResponse {
  answer: ApprovalAnswer;
  /** Optional guidance for the agent (e.g. "use pnpm instead"). */
  message?: string;
}

export type ApprovalHandler = (req: ApprovalRequest, signal: AbortSignal) => Promise<ApprovalResponse>;

export type AgentEvent =
  | { type: 'task.started'; taskId: string; conversationId: string; workspaceId: string; prompt: string; resumed: boolean }
  | { type: 'task.status'; taskId: string; status: TaskStatus; error?: string }
  | { type: 'model.call'; taskId: string; step: number; model: string; mode: ToolMode; estimatedPromptTokens: number }
  | { type: 'model.result'; taskId: string; step: number; usage: Usage; modeUsed: ToolMode; fellBack?: boolean; salvaged?: boolean }
  | { type: 'assistant.delta'; taskId: string; channel: 'text' | 'thinking'; text: string }
  | { type: 'assistant.message'; taskId: string; message: MessageRecord }
  | { type: 'tool.start'; taskId: string; callId: string; tool: string; args: Record<string, unknown>; summary: string; risk: RiskLevel }
  | { type: 'tool.output'; taskId: string; callId: string; stream: 'stdout' | 'stderr'; chunk: string }
  | { type: 'tool.end'; taskId: string; callId: string; tool: string; ok: boolean; output: string; durationMs: number; data?: Record<string, unknown> }
  | { type: 'approval.request'; request: ApprovalRequest }
  | { type: 'approval.resolved'; requestId: string; taskId: string; answer: ApprovalAnswer }
  | { type: 'plan.update'; taskId: string; plan: PlanItem[] }
  | { type: 'checkpoint.created'; checkpoint: CheckpointRecord }
  | { type: 'context.summarized'; conversationId: string; uptoSeq: number; summary: string }
  | { type: 'task.finished'; taskId: string; status: TaskStatus; report: TaskReport }
  | { type: 'log'; taskId?: string; level: 'info' | 'warn' | 'error'; message: string };

/** Events too chatty to persist individually (their content is captured by later events). */
export const TRANSIENT_EVENTS = new Set<AgentEvent['type']>(['assistant.delta', 'tool.output']);
