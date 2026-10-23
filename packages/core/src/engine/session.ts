import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ContextManager } from '../agent/context.js';
import { buildSystemPrompt } from '../agent/prompts.js';
import { ShadowGit } from '../checkpoints/shadow-git.js';
import { ProcessManager } from '../exec/processes.js';
import { PersistentShell } from '../exec/shell.js';
import { RepoIndex } from '../repo/index.js';
import { CodeSearch } from '../repo/search.js';
import { WorkspaceGuard } from '../security/paths.js';
import type { PermissionMode } from '../security/permissions.js';
import { SecretRedactor, scrubEnv } from '../security/secrets.js';
import type { Store } from '../storage/store.js';
import { FileStateTracker } from '../tools/types.js';
import { truncateEnd } from '../util/text.js';
import type { Settings } from './settings.js';
import type { ConversationRecord, PlanItem, TaskRecord, WorkspaceRecord } from './types.js';

/** All per-workspace resources: path guard, shells, index, search, checkpoints. */
export class WorkspaceSession {
  readonly guard: WorkspaceGuard;
  readonly shell: PersistentShell;
  /** Separate shell for commands typed by the user in the terminal panel. */
  readonly userShell: PersistentShell;
  readonly processes: ProcessManager;
  readonly index: RepoIndex;
  readonly checkpoints: ShadowGit;
  readonly fileState = new FileStateTracker();
  readonly redactor: SecretRedactor;
  readonly search: CodeSearch;
  readonly context: ContextManager;

  constructor(
    readonly record: WorkspaceRecord,
    private readonly store: Store,
    private readonly getSettings: () => Settings,
    dataDir: string,
    onProcessOutput?: (id: string, chunk: string) => void,
  ) {
    const settings = getSettings();
    this.guard = new WorkspaceGuard(record.path);
    const env = scrubEnv(process.env, settings.permissions.envPassthrough);
    this.shell = new PersistentShell({ cwd: this.guard.root, env, root: this.guard.root });
    this.userShell = new PersistentShell({ cwd: this.guard.root, env, root: this.guard.root });
    this.processes = new ProcessManager({ env, onOutput: onProcessOutput });
    this.index = new RepoIndex(this.guard.root, { ...settings.index });
    this.checkpoints = new ShadowGit(this.guard.root, dataDir);
    this.redactor = new SecretRedactor(process.env);
    this.search = new CodeSearch(this.guard.root, this.index, () => this.getSettings().index.exclude, store, record.id);
    this.context = new ContextManager(store, getSettings);
    if (settings.index.watch) this.index.startWatching();
  }

  get id(): string {
    return this.record.id;
  }

  permissionMode(): PermissionMode {
    const ws = this.store.getWorkspace(this.record.id);
    return ws?.config.permissionMode ?? this.getSettings().permissions.mode;
  }

  setPermissionMode(mode: PermissionMode | undefined): void {
    const ws = this.store.getWorkspace(this.record.id);
    this.store.updateWorkspaceConfig(this.record.id, { ...(ws?.config ?? {}), permissionMode: mode });
  }

  projectInstructions(file: string | undefined): string | undefined {
    if (!file) return undefined;
    const abs = path.join(this.guard.root, file);
    if (!existsSync(abs)) return undefined;
    try {
      return this.redactor.redact(truncateEnd(readFileSync(abs, 'utf8'), 4000)).text;
    } catch {
      return undefined;
    }
  }

  async systemPrompt(args: { conversation: ConversationRecord; task: TaskRecord; plan: PlanItem[]; chatOnly: boolean }): Promise<string> {
    const settings = this.getSettings();
    const project = await this.index.project();
    const tree = settings.context.includeRepoOverview ? (await this.index.tree('.', 1, 60)).text : undefined;
    const recentTasks = settings.context.includeRecentTasks
      ? this.store
          .recentTasks(this.record.id, 8)
          .filter((t) => t.conversationId !== args.conversation.id)
          .slice(0, 4)
      : [];
    const relevantFiles = args.chatOnly ? [] : await this.index.relevantFiles(args.task.prompt, 8);
    return buildSystemPrompt({
      workspaceRoot: this.guard.root,
      shell: this.shell.kind,
      permissionMode: this.permissionMode(),
      project: settings.context.includeRepoOverview ? project : undefined,
      tree,
      projectInstructions: this.projectInstructions(project.instructionsFile),
      recentTasks,
      plan: args.plan,
      summary: args.conversation.summary,
      relevantFiles,
      chatOnly: args.chatOnly,
    });
  }

  dispose(): void {
    this.shell.dispose();
    this.userShell.dispose();
    this.processes.disposeAll();
    this.index.dispose();
  }
}
