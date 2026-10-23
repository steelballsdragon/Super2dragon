import type { z } from 'zod';
import type { ShadowGit } from '../checkpoints/shadow-git.js';
import type { Settings } from '../engine/settings.js';
import type { CommandRecord, PlanItem, TestRunRecord } from '../engine/types.js';
import type { ProcessManager } from '../exec/processes.js';
import type { CommandResult, PersistentShell } from '../exec/shell.js';
import type { RepoIndex } from '../repo/index.js';
import type { RiskLevel } from '../security/commands.js';
import type { WorkspaceGuard } from '../security/paths.js';
import type { SecretRedactor } from '../security/secrets.js';
import type { CodeSearch } from '../repo/search.js';

export type ToolCategory = 'read' | 'write' | 'execute' | 'git' | 'meta';

/** Tracks which files the agent has read (and their mtime) to enforce read-before-edit. */
export class FileStateTracker {
  private readonly reads = new Map<string, number>();
  private readonly created = new Set<string>();

  markRead(rel: string, mtimeMs: number): void {
    this.reads.set(rel, mtimeMs);
  }

  markWritten(rel: string, mtimeMs: number, created = false): void {
    this.reads.set(rel, mtimeMs);
    if (created) this.created.add(rel);
  }

  forget(rel: string): void {
    this.reads.delete(rel);
  }

  /** undefined = never read; otherwise the mtime observed at the last read/write. */
  lastSeen(rel: string): number | undefined {
    return this.reads.get(rel);
  }

  createdByAgent(rel: string): boolean {
    return this.created.has(rel);
  }
}

export interface ToolContext {
  workspaceId: string;
  taskId: string;
  guard: WorkspaceGuard;
  shell: PersistentShell;
  processes: ProcessManager;
  index: RepoIndex;
  checkpoints: ShadowGit | null;
  /** Checkpoint hash captured when the task started (target of "undo this task"). */
  taskCheckpoint?: string;
  fileState: FileStateTracker;
  redactor: SecretRedactor;
  settings: Settings;
  signal: AbortSignal;
  search: CodeSearch;
  /** Stream partial output of a running tool (e.g. command stdout) to the UI. */
  emitOutput(stream: 'stdout' | 'stderr', chunk: string): void;
  /** Facts for the final report. */
  recordCommand(rec: CommandRecord): void;
  recordTest(rec: TestRunRecord): void;
  /** Latest failing command output, for inspect_errors without arguments. */
  lastFailure?: CommandResult;
  setLastFailure(r: CommandResult | undefined): void;
  getPlan(): PlanItem[];
  setPlan(items: PlanItem[]): void;
  /** Map a checkpoint id (or 'task_start') to its commit hash. */
  resolveCheckpoint(id: string): string | undefined;
  /** Called after any file mutation (refresh index, invalidate caches). */
  onFilesChanged(paths: string[]): void;
}

export interface ToolResult {
  ok: boolean;
  /** Text returned to the model. */
  output: string;
  /** Structured data for the UI / report. */
  data?: Record<string, unknown>;
}

export interface RiskAssessment {
  risk: RiskLevel;
  summary: string;
  reasons: string[];
  ruleKey?: string;
  sensitive?: boolean;
  alwaysAsk?: boolean;
  blocked?: string;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  category: ToolCategory;
  schema: S;
  /** True if the tool can change files (a checkpoint is taken before it runs). */
  mutates: boolean | ((args: z.infer<S>) => boolean);
  assess(args: z.infer<S>, ctx: ToolContext): RiskAssessment;
  execute(args: z.infer<S>, ctx: ToolContext): Promise<ToolResult>;
}

export function defineTool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}
