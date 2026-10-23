import type { ShadowGit } from '../checkpoints/shadow-git.js';
import type { Settings } from '../engine/settings.js';
import type {
  CommandRecord,
  ConversationRecord,
  FileChange,
  PlanItem,
  TaskRecord,
  TaskReport,
  TaskStatus,
  TestRunRecord,
  UsageTotals,
  WorkspaceRecord,
} from '../engine/types.js';
import type { ProcessManager } from '../exec/processes.js';
import type { CommandResult, PersistentShell } from '../exec/shell.js';
import type { ModelClient } from '../models/adapter.js';
import type { ToolCall } from '../models/types.js';
import type { RepoIndex } from '../repo/index.js';
import type { CodeSearch } from '../repo/search.js';
import { decide, type PermissionMode } from '../security/permissions.js';
import type { WorkspaceGuard } from '../security/paths.js';
import type { SecretRedactor } from '../security/secrets.js';
import type { Store } from '../storage/store.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { FileStateTracker, ToolContext } from '../tools/types.js';
import { LocalCodeError, errorMessage, isAbortError } from '../util/errors.js';
import { newId } from '../util/ids.js';
import { truncateMiddle } from '../util/text.js';
import type { ContextManager } from './context.js';
import type { AgentEvent, ApprovalHandler } from './events.js';
import { LoopGuard } from './guard.js';
import { NUDGE_EMPTY, nudgeIncompletePlan, resumeMessage } from './prompts.js';

export interface WorkspaceResources {
  guard: WorkspaceGuard;
  shell: PersistentShell;
  processes: ProcessManager;
  index: RepoIndex;
  checkpoints: ShadowGit | null;
  fileState: FileStateTracker;
  redactor: SecretRedactor;
  search: CodeSearch;
}

export interface RunnerDeps {
  store: Store;
  tools: ToolRegistry;
  settings: () => Settings;
  client: ModelClient;
  /** Optional model used for the first (planning) step of a new task. */
  planningClient?: ModelClient;
  /** Optional lightweight model used for summarization. */
  lightClient?: ModelClient;
  workspace: WorkspaceRecord;
  resources: WorkspaceResources;
  permissionMode: () => PermissionMode;
  approvals: ApprovalHandler;
  emit: (e: AgentEvent) => void;
  context: ContextManager;
  buildSystemPrompt: (args: { conversation: ConversationRecord; task: TaskRecord; plan: PlanItem[]; chatOnly: boolean }) => Promise<string>;
}

interface CallOutcome {
  ok: boolean;
  content: string;
  cancelled?: boolean;
}

const MAX_EVENT_OUTPUT = 200_000;

export class AgentRunner {
  private currentCallId = '';
  private lastCheckpointHash: string | undefined;
  private lastFailure: CommandResult | undefined;
  private readonly commands: CommandRecord[] = [];
  private readonly tests: TestRunRecord[] = [];
  private readonly warnings: string[] = [];

  constructor(private readonly deps: RunnerDeps) {}

  async run(taskId: string, opts: { signal: AbortSignal; resumeReason?: string }): Promise<TaskRecord> {
    const { store, emit, client } = this.deps;
    let task = store.getTask(taskId);
    if (!task) throw new LocalCodeError('not_found', `Task ${taskId} not found`);
    const conversation = store.getConversation(task.conversationId);
    if (!conversation) throw new LocalCodeError('not_found', `Conversation ${task.conversationId} not found`);
    const settings = () => this.deps.settings();
    const started = Date.now();
    let plan: PlanItem[] = task.plan;
    let steps = task.steps;
    const usage: UsageTotals = { ...task.usage };
    const signal = opts.signal;

    const setStatus = (status: TaskStatus, error?: string) => {
      store.updateTask(taskId, { status, ...(error !== undefined ? { error } : {}) });
      emit({ type: 'task.status', taskId, status, ...(error ? { error } : {}) });
    };

    emit({ type: 'task.started', taskId, conversationId: conversation.id, workspaceId: this.deps.workspace.id, prompt: task.prompt, resumed: !!opts.resumeReason });
    store.updateTask(taskId, { status: 'running', error: null, finishedAt: null, providerId: client.provider.config.id, model: client.model });
    emit({ type: 'task.status', taskId, status: 'running' });

    if (opts.resumeReason) {
      store.appendMessage(conversation.id, { role: 'user', content: resumeMessage(task, opts.resumeReason), meta: { synthetic: true } }, taskId);
    } else {
      const m = store.appendMessage(conversation.id, { role: 'user', content: task.prompt }, taskId);
      if (conversation.title === 'New conversation') store.updateConversation(conversation.id, { title: task.prompt.replace(/\s+/g, ' ').slice(0, 80) });
      void m;
    }

    const cp = this.deps.resources.checkpoints;
    if (cp && settings().storage.checkpoints) {
      try {
        if (!task.checkpointBefore) {
          const hash = await cp.snapshot(`Before task: ${task.prompt.slice(0, 120)}`);
          const rec = store.addCheckpoint({ workspaceId: this.deps.workspace.id, taskId, commitHash: hash, label: `Before task: ${task.prompt.slice(0, 80)}` });
          store.updateTask(taskId, { checkpointBefore: hash });
          task = { ...task, checkpointBefore: hash };
          emit({ type: 'checkpoint.created', checkpoint: rec });
        }
        this.lastCheckpointHash = task.checkpointBefore;
      } catch (err) {
        this.warn(taskId, `Checkpointing failed (undo unavailable for this task): ${errorMessage(err)}`);
      }
    }

    const toolCtx = this.makeToolContext(task, signal, () => plan, (p) => {
      plan = p;
      store.updateTask(taskId, { plan });
      emit({ type: 'plan.update', taskId, plan });
    });

    const guard = new LoopGuard();
    let nudges = 0;
    let emptyReplies = 0;
    let overflowRetries = 0;
    let finalText = '';
    let outcome: { status: TaskStatus; error?: string } | undefined;
    const chatOnly = client.toolMode === 'none';

    try {
      while (!outcome) {
        if (signal.aborted) {
          outcome = { status: 'cancelled' };
          break;
        }
        const s = settings();
        if (steps >= task.steps + s.agent.maxSteps) {
          outcome = { status: 'blocked', error: `Step limit reached (${s.agent.maxSteps} model calls). Use Resume to continue.` };
          break;
        }
        if (Date.now() - started > s.agent.maxTaskMinutes * 60_000) {
          outcome = { status: 'blocked', error: `Time limit reached (${s.agent.maxTaskMinutes} minutes). Use Resume to continue.` };
          break;
        }
        steps++;
        const tools = chatOnly ? [] : this.deps.tools.toolSpecs();
        const conv = store.getConversation(conversation.id)!;
        const systemPrompt = await this.deps.buildSystemPrompt({ conversation: conv, task, plan, chatOnly });
        let built = this.deps.context.build(conv, systemPrompt, tools, client.toolMode === 'native');
        if (built.needsSummary || built.estimatedTokens > built.budgetTokens) {
          await this.summarize(conv, taskId, signal, built.estimatedTokens > built.budgetTokens);
          built = this.deps.context.build(store.getConversation(conversation.id)!, systemPrompt, tools, client.toolMode === 'native');
          if (built.estimatedTokens > built.budgetTokens) {
            this.warn(taskId, `Prompt (~${built.estimatedTokens} tokens) exceeds the context budget (${built.budgetTokens}). Consider a larger context length.`);
          }
        }
        const planningStep = steps === task.steps + 1 && !opts.resumeReason && !!this.deps.planningClient && !chatOnly;
        const active = planningStep ? this.deps.planningClient! : client;
        emit({ type: 'model.call', taskId, step: steps, model: active.model, mode: active.toolMode, estimatedPromptTokens: built.estimatedTokens });
        let res;
        try {
          res = await active.complete({
            messages: built.messages,
            tools,
            signal,
            onEvent: (e) => emit({ type: 'assistant.delta', taskId, channel: e.type, text: e.text }),
          });
        } catch (err) {
          if (isAbortError(err) || signal.aborted) {
            outcome = { status: 'cancelled' };
            break;
          }
          if (err instanceof LocalCodeError && err.code === 'context_overflow' && overflowRetries < 2) {
            overflowRetries++;
            steps--;
            await this.summarize(store.getConversation(conversation.id)!, taskId, signal, true);
            continue;
          }
          outcome = { status: 'failed', error: describeModelError(err) };
          break;
        }

        usage.modelCalls++;
        usage.promptTokens += res.usage.promptTokens ?? 0;
        usage.completionTokens += res.usage.completionTokens ?? 0;
        usage.modelMs += res.usage.totalDurationMs ?? 0;
        store.updateTask(taskId, { steps, usage });
        emit({
          type: 'model.result',
          taskId,
          step: steps,
          usage: res.usage,
          modeUsed: res.modeUsed,
          fellBack: res.fellBack,
          salvaged: res.toolCalls.some((c) => c.salvaged),
        });
        if (res.fellBack) this.warn(taskId, 'Native tool calling failed for this model; switched to prompted tool calling (fallback).');

        if (res.toolCalls.length === 0) {
          const text = res.content.trim();
          if (!text) {
            if (emptyReplies++ < 2) {
              store.appendMessage(conversation.id, { role: 'user', content: NUDGE_EMPTY, meta: { synthetic: true } }, taskId);
              continue;
            }
            outcome = { status: 'failed', error: 'The model returned empty replies repeatedly.' };
            break;
          }
          const msg = store.appendMessage(conversation.id, { role: 'assistant', content: text, meta: { thinking: res.thinking } }, taskId);
          emit({ type: 'assistant.message', taskId, message: msg });
          const open = plan.filter((p) => p.status === 'pending' || p.status === 'in_progress');
          if (!chatOnly && settings().agent.nudgeOnIncompletePlan && open.length && nudges < 2) {
            nudges++;
            store.appendMessage(conversation.id, { role: 'user', content: nudgeIncompletePlan(plan), meta: { synthetic: true } }, taskId);
            continue;
          }
          const g = guard.recordFinalText(text);
          finalText = text;
          if (open.length) this.warn(taskId, `Finished with ${open.length} plan step(s) not marked done.`);
          outcome = g.action === 'stop' ? { status: 'blocked', error: g.reason } : { status: 'completed' };
          break;
        }

        const assistant = store.appendMessage(
          conversation.id,
          { role: 'assistant', content: res.content, toolCalls: res.toolCalls, meta: { thinking: res.thinking, salvaged: res.toolCalls.some((c) => c.salvaged) } },
          taskId,
        );
        emit({ type: 'assistant.message', taskId, message: assistant });

        for (const call of res.toolCalls) {
          if (outcome || signal.aborted) {
            store.appendMessage(
              conversation.id,
              { role: 'tool', content: 'Skipped: the task was stopped before this call ran.', toolCallId: call.id, toolName: call.name },
              taskId,
            );
            continue;
          }
          const r = await this.executeCall(call, toolCtx, task, setStatus, signal);
          let content = r.content;
          const verdict = guard.recordTool(call.name, call.arguments, r.ok);
          if (verdict.action === 'warn') content += `\n\nNOTE: ${verdict.message}`;
          store.appendMessage(conversation.id, { role: 'tool', content, toolCallId: call.id, toolName: call.name }, taskId);
          if (r.cancelled) outcome = { status: 'cancelled' };
          else if (verdict.action === 'stop') outcome = { status: 'blocked', error: `Stopped to avoid a loop: ${verdict.reason}` };
        }
      }
    } catch (err) {
      outcome = isAbortError(err) || signal.aborted ? { status: 'cancelled' } : { status: 'failed', error: `Internal error: ${errorMessage(err)}` };
    }

    const report = await this.buildReport(task, outcome!.status, finalText, plan, steps - task.steps, Date.now() - started, usage);
    store.updateTask(taskId, {
      status: outcome!.status,
      error: outcome!.error ?? null,
      report,
      steps,
      usage,
      plan,
      finishedAt: new Date().toISOString(),
    });
    emit({ type: 'task.status', taskId, status: outcome!.status, ...(outcome!.error ? { error: outcome!.error } : {}) });
    emit({ type: 'task.finished', taskId, status: outcome!.status, report });
    return store.getTask(taskId)!;
  }

  private warn(taskId: string, message: string) {
    this.warnings.push(message);
    this.deps.emit({ type: 'log', taskId, level: 'warn', message });
  }

  private async summarize(conv: ConversationRecord, taskId: string, signal: AbortSignal, aggressive: boolean) {
    const r = await this.deps.context.summarize(conv, this.deps.lightClient ?? this.deps.client, signal, aggressive);
    if (r.ok) {
      this.deps.emit({ type: 'context.summarized', conversationId: conv.id, uptoSeq: r.uptoSeq!, summary: r.summary! });
      if (r.usedFallback) this.warn(taskId, 'The model could not summarize older messages; used an automatic summary instead.');
    }
  }

  private makeToolContext(task: TaskRecord, signal: AbortSignal, getPlan: () => PlanItem[], setPlan: (p: PlanItem[]) => void): ToolContext {
    const r = this.deps.resources;
    const store = this.deps.store;
    const runner = this;
    return {
      workspaceId: this.deps.workspace.id,
      taskId: task.id,
      guard: r.guard,
      shell: r.shell,
      processes: r.processes,
      index: r.index,
      checkpoints: this.deps.settings().storage.checkpoints ? r.checkpoints : null,
      get taskCheckpoint() {
        return store.getTask(task.id)?.checkpointBefore;
      },
      fileState: r.fileState,
      redactor: r.redactor,
      get settings() {
        return runner.deps.settings();
      },
      signal,
      search: r.search,
      emitOutput: (stream, chunk) => this.deps.emit({ type: 'tool.output', taskId: task.id, callId: this.currentCallId, stream, chunk }),
      recordCommand: (rec) => this.commands.push(rec),
      recordTest: (rec) => this.tests.push(rec),
      get lastFailure() {
        return runner.lastFailure;
      },
      setLastFailure: (res) => {
        this.lastFailure = res;
      },
      getPlan,
      setPlan,
      resolveCheckpoint: (id) => {
        if (id === 'task_start' || id === 'task') return store.getTask(task.id)?.checkpointBefore;
        const rec = store.getCheckpoint(id);
        if (rec) return rec.commitHash;
        return /^[0-9a-f]{7,40}$/i.test(id) ? id : undefined;
      },
      onFilesChanged: () => r.index.markDirty(),
    };
  }

  private async executeCall(
    call: ToolCall,
    ctx: ToolContext,
    task: TaskRecord,
    setStatus: (s: TaskStatus, e?: string) => void,
    signal: AbortSignal,
  ): Promise<CallOutcome> {
    const { emit, store, tools } = this.deps;
    const started = Date.now();
    this.currentCallId = call.id;
    const finish = (ok: boolean, output: string, data?: Record<string, unknown>, cancelled = false): CallOutcome => {
      const redacted = this.deps.resources.redactor.redact(output).text;
      emit({
        type: 'tool.end',
        taskId: task.id,
        callId: call.id,
        tool: call.name,
        ok,
        output: redacted.slice(0, MAX_EVENT_OUTPUT),
        durationMs: Date.now() - started,
        ...(data ? { data } : {}),
      });
      const forModel = truncateMiddle(redacted, this.deps.settings().agent.toolOutputMaxChars, 'chars');
      return { ok, content: ok ? forModel : `ERROR: ${forModel}`, cancelled };
    };

    const tool = tools.get(call.name);
    if (call.parseError) {
      emit({ type: 'tool.start', taskId: task.id, callId: call.id, tool: call.name, args: {}, summary: call.name, risk: 'read' });
      return finish(false, `Could not parse the arguments for ${call.name} as JSON: ${call.parseError.slice(0, 300)}. Send a valid JSON object.`);
    }
    const v = tools.validate(call.name, call.arguments);
    if (!v.ok || !tool) {
      emit({ type: 'tool.start', taskId: task.id, callId: call.id, tool: call.name, args: call.arguments, summary: call.name, risk: 'read' });
      return finish(false, v.ok ? `Unknown tool ${call.name}` : v.error);
    }
    const args = v.args as Record<string, unknown>;
    let assessment;
    try {
      assessment = tool.assess(args, ctx);
    } catch (err) {
      emit({ type: 'tool.start', taskId: task.id, callId: call.id, tool: call.name, args, summary: call.name, risk: 'read' });
      return finish(false, errorMessage(err));
    }
    emit({ type: 'tool.start', taskId: task.id, callId: call.id, tool: call.name, args, summary: assessment.summary, risk: assessment.risk });

    const verdict = decide(this.deps.permissionMode(), { tool: call.name, ...assessment }, store.listRules(this.deps.workspace.id));
    let userNote = '';
    if (verdict.decision === 'deny') return finish(false, `Not allowed: ${verdict.reason}. Do not retry this; find another approach.`);
    if (verdict.decision === 'ask') {
      const request = {
        id: newId('appr_'),
        taskId: task.id,
        workspaceId: this.deps.workspace.id,
        tool: call.name,
        args,
        summary: assessment.summary,
        risk: assessment.risk,
        reasons: assessment.reasons,
        decisionReason: verdict.reason,
        ruleKey: assessment.ruleKey,
      };
      setStatus('awaiting_approval');
      emit({ type: 'approval.request', request });
      let response;
      try {
        response = await this.deps.approvals(request, signal);
      } catch (err) {
        if (isAbortError(err) || signal.aborted) return finish(false, 'Cancelled while waiting for approval.', undefined, true);
        throw err;
      }
      emit({ type: 'approval.resolved', requestId: request.id, taskId: task.id, answer: response.answer });
      setStatus('running');
      if (response.answer === 'deny') {
        return finish(
          false,
          `The user denied this action.${response.message ? ` The user said: "${response.message}"` : ''} Do not retry it unchanged; adapt your approach or explain what you need.`,
        );
      }
      if (response.answer === 'allow_always') store.addRule(this.deps.workspace.id, call.name, assessment.ruleKey || '*');
      if (response.message) userNote = `\nUser note: ${response.message}`;
    }

    const mutates = typeof tool.mutates === 'function' ? tool.mutates(args) : tool.mutates;
    if (mutates && ctx.checkpoints) {
      try {
        const hash = await ctx.checkpoints.snapshot(`Before ${assessment.summary.slice(0, 120)}`);
        if (hash !== this.lastCheckpointHash) {
          const rec = store.addCheckpoint({ workspaceId: this.deps.workspace.id, taskId: task.id, commitHash: hash, label: `Before ${assessment.summary.slice(0, 80)}` });
          emit({ type: 'checkpoint.created', checkpoint: rec });
          this.lastCheckpointHash = hash;
        }
      } catch (err) {
        this.warn(task.id, `Checkpoint before ${call.name} failed: ${errorMessage(err)}`);
      }
    }

    try {
      const result = await tool.execute(args, ctx);
      if (signal.aborted && call.name === 'run_command') return finish(false, `${result.output}\nCancelled by the user.`, result.data, true);
      return finish(result.ok, result.output + userNote, result.data);
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return finish(false, 'Cancelled by the user.', undefined, true);
      if (err instanceof LocalCodeError && ['permission_denied', 'invalid_argument', 'not_found'].includes(err.code)) {
        return finish(false, err.message);
      }
      return finish(false, `Tool ${call.name} failed: ${errorMessage(err)}`);
    }
  }

  private async buildReport(
    task: TaskRecord,
    status: TaskStatus,
    summary: string,
    plan: PlanItem[],
    steps: number,
    durationMs: number,
    usage: UsageTotals,
  ): Promise<TaskReport> {
    let filesChanged: FileChange[] = [];
    const cp = this.deps.resources.checkpoints;
    const fresh = this.deps.store.getTask(task.id);
    const before = fresh?.checkpointBefore ?? task.checkpointBefore;
    if (cp && before && this.deps.settings().storage.checkpoints) {
      try {
        filesChanged = await cp.changes(before);
      } catch (err) {
        this.warnings.push(`Could not compute changed files: ${errorMessage(err)}`);
      }
    }
    const warnings = [...this.warnings];
    const lastTest = this.tests[this.tests.length - 1];
    if (lastTest && !lastTest.ok) warnings.push(`The last test run failed (exit code ${lastTest.exitCode}).`);
    if (filesChanged.length && !this.tests.length && !this.commands.length && status === 'completed') {
      warnings.push('Files were changed but no tests or commands were run to verify them.');
    }
    // Only failures that were not followed by a successful run of the same command matter.
    const latest = new Map<string, CommandRecord>();
    for (const cmd of this.commands) latest.set(cmd.command, cmd);
    const stillFailing = [...latest.values()].filter((c) => c.exitCode !== 0 && c.exitCode !== null);
    if (stillFailing.length && status === 'completed') {
      warnings.push(`${stillFailing.length} command(s) still failing at the end: ${stillFailing.map((c) => c.command).slice(0, 3).join('; ')}`);
    }
    return {
      status,
      summary,
      filesChanged,
      commands: this.commands.slice(-50),
      tests: this.tests,
      plan,
      steps,
      durationMs,
      usage,
      warnings: [...new Set(warnings)],
      checkpointBefore: before,
    };
  }
}

function describeModelError(err: unknown): string {
  if (err instanceof LocalCodeError) {
    switch (err.code) {
      case 'out_of_memory':
        return `${err.message}\nTry a smaller model or quantization, reduce the context length in Settings, or close other applications.`;
      case 'unreachable':
        return `${err.message}\nStart the inference server (e.g. "ollama serve") and press Retry.`;
      case 'model_not_found':
        return `${err.message}\nPick an installed model in the model selector.`;
      case 'timeout':
        return `${err.message}\nThe model may be too slow on this hardware; try a smaller model or raise the idle timeout.`;
      default:
        return err.message;
    }
  }
  return errorMessage(err);
}
