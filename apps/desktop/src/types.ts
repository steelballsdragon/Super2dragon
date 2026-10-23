// Wire types for the LocalCode server API (mirrors @localcode/core shapes the UI uses).

export type ToolMode = 'native' | 'prompted' | 'none';
export type PermissionMode = 'strict' | 'standard' | 'autonomous';
export type RiskLevel = 'read' | 'build' | 'write' | 'execute' | 'network' | 'destructive' | 'privileged';
export type TaskStatus = 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'blocked' | 'cancelled' | 'interrupted';
export type PlanStatus = 'pending' | 'in_progress' | 'done' | 'blocked' | 'skipped';

export interface ModelRef {
  providerId: string;
  model: string;
}

export interface ProviderConfig {
  id: string;
  kind: 'ollama' | 'openai';
  label: string;
  baseUrl: string;
  enabled: boolean;
  apiKey?: string;
}

export interface Settings {
  providers: ProviderConfig[];
  models: { coding?: ModelRef; planning?: ModelRef; light?: ModelRef; embedding?: ModelRef };
  toolModeOverrides: Record<string, ToolMode | 'auto'>;
  generation: { temperature: number; topP?: number; numCtx: number; maxTokens: number; numGpu: number | null; keepAlive: string; thinking: boolean };
  agent: { maxSteps: number; maxTaskMinutes: number; commandTimeoutSec: number; toolOutputMaxChars: number; modelIdleTimeoutSec: number; nudgeOnIncompletePlan: boolean };
  permissions: { mode: PermissionMode; envPassthrough: string[] };
  context: { summarizeAtRatio: number; keepRecentMessages: number; includeRepoOverview: boolean; includeRecentTasks: boolean };
  index: { exclude: string[]; maxFileSizeKB: number; maxFiles: number; watch: boolean };
  storage: { checkpoints: boolean };
  firstRunComplete: boolean;
}

export interface ModeProbe {
  callOk: boolean;
  salvaged: boolean;
  roundTripOk: boolean;
  latencyMs: number;
  error?: string;
  detail?: string;
}

export interface ProbeResult {
  native?: ModeProbe;
  prompted?: ModeProbe;
  recommended: ToolMode;
  explanation: string;
  testedAt: string;
}

export interface BenchmarkResult {
  score: number;
  toolMode: string;
  tasks: { id: string; title: string; passed: boolean; steps: number; durationMs: number; status: string; detail: string }[];
  tokensPerSec?: number;
  totalMs: number;
  runAt: string;
}

export interface ModelEntry {
  name: string;
  providerId: string;
  sizeBytes?: number;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  details?: { capabilities: string[]; capabilitiesReported: boolean; contextLength?: number };
  toolMode?: ToolMode;
  toolModeSource?: 'override' | 'probe' | 'capabilities' | 'default';
  probe?: ProbeResult;
  benchmark?: BenchmarkResult;
  memory?: { totalBytes: number; weightsBytes: number; kvCacheBytes: number; numCtx: number; precise: boolean };
  fit?: { level: 'gpu' | 'partial' | 'cpu' | 'tight' | 'insufficient' | 'unknown'; message: string; suggestedNumCtx?: number };
  chatCapable: boolean;
}

export interface ModelListing {
  provider: ProviderConfig;
  health: { ok: boolean; version?: string; error?: string; latencyMs?: number };
  models: ModelEntry[];
  loaded: { name: string; sizeBytes?: number; vramBytes?: number; contextLength?: number }[];
}

export interface WorkspaceRecord {
  id: string;
  path: string;
  name: string;
  config: { permissionMode?: PermissionMode };
  lastOpenedAt: string;
}

export interface ProjectInfo {
  languages: { name: string; files: number; percent: number }[];
  frameworks: string[];
  packageManagers: string[];
  entryPoints: string[];
  testCommand?: string;
  checkCommands: string[];
  buildCommand?: string;
  devCommand?: string;
  isGitRepo: boolean;
  fileCount: number;
}

export interface ConversationRecord {
  id: string;
  workspaceId: string;
  title: string;
  providerId?: string;
  model?: string;
  summary?: string;
  updatedAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  salvaged?: boolean;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  taskId?: string;
  seq: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  meta?: { synthetic?: boolean; thinking?: string; salvaged?: boolean };
  createdAt: string;
}

export interface PlanItem {
  id: string;
  title: string;
  status: PlanStatus;
  acceptance?: string;
  note?: string;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  oldPath?: string;
}

export interface TaskReport {
  status: TaskStatus;
  summary: string;
  filesChanged: FileChange[];
  commands: { command: string; exitCode: number | null; durationMs: number; timedOut: boolean; tool: string }[];
  tests: { command: string; ok: boolean; exitCode: number | null; passed?: number; failed?: number; skipped?: number }[];
  plan: PlanItem[];
  steps: number;
  durationMs: number;
  usage: { promptTokens: number; completionTokens: number; modelCalls: number; modelMs: number };
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
  steps: number;
  model?: string;
  createdAt: string;
  running?: boolean;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  workspaceId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  risk: RiskLevel;
  reasons: string[];
  decisionReason: string;
  ruleKey?: string;
}

export interface CheckpointRecord {
  id: string;
  workspaceId: string;
  taskId?: string;
  commitHash: string;
  label: string;
  createdAt: string;
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

export interface DoctorCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  fix?: string;
}

export interface DoctorReport {
  system: {
    platform: string;
    osRelease: string;
    arch: string;
    cpuModel: string;
    cpuCores: number;
    totalMemBytes: number;
    freeMemBytes: number;
    gpus: { name: string; vramTotalBytes?: number; unifiedMemory?: boolean }[];
  };
  checks: DoctorCheck[];
  ok: boolean;
}

export interface StoredEvent {
  id: number;
  taskId?: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

/** Server-pushed events (subset of EngineEvent used by the UI). */
export type ServerEvent = { type: string; workspaceId?: string; taskId?: string } & Record<string, unknown>;
