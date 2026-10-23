import { useSyncExternalStore } from 'react';
import { backend } from './api';
import type {
  ApprovalRequest,
  ConversationRecord,
  MessageRecord,
  ModelListing,
  ModelRef,
  PermissionMode,
  PlanItem,
  ProjectInfo,
  ServerEvent,
  Settings,
  StoredEvent,
  TaskRecord,
  TaskReport,
  WorkspaceRecord,
} from './types';

export type TimelineItem =
  | { kind: 'user'; id: string; text: string; taskId?: string }
  | { kind: 'note'; id: string; text: string; level?: 'info' | 'warn' | 'error' }
  | { kind: 'assistant'; id: string; text: string; thinking?: string; streaming?: boolean; taskId?: string }
  | {
      kind: 'tool';
      id: string;
      taskId?: string;
      name: string;
      args: Record<string, unknown>;
      summary?: string;
      risk?: string;
      status: 'pending' | 'running' | 'ok' | 'error';
      output?: string;
      live?: string;
      durationMs?: number;
      salvaged?: boolean;
    }
  | { kind: 'approval'; id: string; request: ApprovalRequest; resolved?: string }
  | { kind: 'report'; id: string; taskId: string; report: TaskReport; error?: string };

export interface ActivityEntry {
  id: string;
  time: string;
  type: string;
  text: string;
  level: 'info' | 'warn' | 'error' | 'ok';
}

export type RightTab = 'plan' | 'diff' | 'terminal' | 'activity';
export type Modal = 'settings' | 'models' | 'wizard' | 'file' | null;

export interface AppState {
  conn: 'connecting' | 'open' | 'closed';
  connError?: string;
  info?: { version: string; dataDir: string; platform: string; node: string };
  settings?: Settings;
  models: ModelListing[];
  modelsLoading: boolean;
  workspaces: WorkspaceRecord[];
  workspace?: { record: WorkspaceRecord; project: ProjectInfo; permissionMode: PermissionMode };
  conversations: ConversationRecord[];
  conversationId?: string;
  conversation?: ConversationRecord;
  timeline: TimelineItem[];
  tasks: TaskRecord[];
  activeTaskId?: string;
  plan: PlanItem[];
  activity: ActivityEntry[];
  terminal: string;
  terminalBusy: boolean;
  rightTab: RightTab;
  modal: Modal;
  filePath?: string;
  explorerVersion: number;
  toasts: { id: number; text: string; level: 'info' | 'error' | 'ok' }[];
  pulls: Record<string, { status: string; completed?: number; total?: number }>;
  diffTaskId?: string;
  busy: Record<string, boolean>;
}

const initial: AppState = {
  conn: 'connecting',
  models: [],
  modelsLoading: false,
  workspaces: [],
  conversations: [],
  timeline: [],
  tasks: [],
  plan: [],
  activity: [],
  terminal: '',
  terminalBusy: false,
  rightTab: 'plan',
  modal: null,
  explorerVersion: 0,
  toasts: [],
  pulls: {},
  busy: {},
};

let state: AppState = initial;
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
  );
}

let toastId = 1;
export function toast(text: string, level: 'info' | 'error' | 'ok' = 'info') {
  const id = toastId++;
  setState((s) => ({ toasts: [...s.toasts, { id, text, level }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), level === 'error' ? 8000 : 4000);
}

async function guarded<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  setState((s) => ({ busy: { ...s.busy, [key]: true } }));
  try {
    return await fn();
  } catch (err) {
    toast((err as Error).message, 'error');
    return undefined;
  } finally {
    setState((s) => ({ busy: { ...s.busy, [key]: false } }));
  }
}

const LAST_WS = 'localcode.lastWorkspace';
const MAX_TERMINAL = 300_000;

function appendTerminal(text: string) {
  setState((s) => {
    const t = s.terminal + text;
    return { terminal: t.length > MAX_TERMINAL ? t.slice(t.length - MAX_TERMINAL) : t };
  });
}

function activity(type: string, text: string, level: ActivityEntry['level'] = 'info', time = new Date().toISOString()) {
  setState((s) => ({ activity: [...s.activity.slice(-1500), { id: `${Date.now()}-${Math.random()}`, time, type, text, level }] }));
}

// ---------------------------------------------------------------------------
// Timeline reconstruction
// ---------------------------------------------------------------------------

export function buildTimeline(messages: MessageRecord[], tasks: TaskRecord[], events: StoredEvent[], pending: ApprovalRequest[]): TimelineItem[] {
  const toolStart = new Map<string, Record<string, unknown>>();
  const toolEnd = new Map<string, Record<string, unknown>>();
  for (const e of events) {
    const callId = e.data.callId as string | undefined;
    if (!callId) continue;
    if (e.type === 'tool.start') toolStart.set(callId, e.data);
    if (e.type === 'tool.end') toolEnd.set(callId, e.data);
  }
  const items: TimelineItem[] = [];
  const toolItems = new Map<string, Extract<TimelineItem, { kind: 'tool' }>>();
  const lastIndexForTask = new Map<string, number>();
  for (const m of messages) {
    if (m.role === 'user') {
      if (m.meta?.synthetic) items.push({ kind: 'note', id: m.id, text: m.content });
      else items.push({ kind: 'user', id: m.id, text: m.content, taskId: m.taskId });
    } else if (m.role === 'assistant') {
      if (m.content.trim()) items.push({ kind: 'assistant', id: m.id, text: m.content, thinking: m.meta?.thinking, taskId: m.taskId });
      for (const c of m.toolCalls ?? []) {
        const st = toolStart.get(c.id);
        const en = toolEnd.get(c.id);
        const item: Extract<TimelineItem, { kind: 'tool' }> = {
          kind: 'tool',
          id: c.id,
          taskId: m.taskId,
          name: c.name,
          args: c.arguments,
          summary: st?.summary as string | undefined,
          risk: st?.risk as string | undefined,
          status: en ? (en.ok ? 'ok' : 'error') : 'pending',
          output: en?.output as string | undefined,
          durationMs: en?.durationMs as number | undefined,
          salvaged: c.salvaged,
        };
        toolItems.set(c.id, item);
        items.push(item);
      }
    } else if (m.role === 'tool' && m.toolCallId) {
      const item = toolItems.get(m.toolCallId);
      if (item && item.status === 'pending') {
        item.status = m.content.startsWith('ERROR:') ? 'error' : m.content.startsWith('Skipped') ? 'error' : 'ok';
        item.output ??= m.content;
      }
    }
    if (m.taskId) lastIndexForTask.set(m.taskId, items.length);
  }
  // Insert task reports after each task's last item (iterate from the end so indexes stay valid).
  const reports = tasks
    .filter((t) => t.report && !t.running)
    .map((t) => ({ t, at: lastIndexForTask.get(t.id) ?? items.length }))
    .sort((a, b) => b.at - a.at);
  for (const { t, at } of reports) items.splice(at, 0, { kind: 'report', id: `report-${t.id}`, taskId: t.id, report: t.report!, error: t.error });
  for (const t of tasks) if (!t.report && t.error && !t.running) items.push({ kind: 'note', id: `err-${t.id}`, text: `Task failed: ${t.error}`, level: 'error' });
  for (const p of pending) items.push({ kind: 'approval', id: p.id, request: p });
  return items;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const actions = {
  async init() {
    backend.onStatus((conn, err) => {
      setState({ conn, connError: err });
      if (conn === 'open') void actions.loadInitial();
    });
    backend.onEvent(handleEvent);
    await backend.connect();
  },

  async loadInitial() {
    const [info, settings, workspaces] = await Promise.all([
      backend.call<AppState['info']>('app.info'),
      backend.call<Settings>('settings.get'),
      backend.call<WorkspaceRecord[]>('workspaces.list'),
    ]);
    setState({ info, settings, workspaces });
    void actions.refreshModels();
    const last = localStorage.getItem(LAST_WS);
    const ws = workspaces.find((w) => w.path === last) ?? (state.workspace ? workspaces.find((w) => w.id === state.workspace!.record.id) : undefined);
    if (ws) await actions.openWorkspace(ws.path, true);
    if (!settings.firstRunComplete) setState({ modal: 'wizard' });
  },

  async refreshModels() {
    setState({ modelsLoading: true });
    try {
      const models = await backend.call<ModelListing[]>('models.list');
      setState({ models });
    } catch (err) {
      toast(`Could not list models: ${(err as Error).message}`, 'error');
    } finally {
      setState({ modelsLoading: false });
    }
  },

  async updateSettings(patch: Record<string, unknown>) {
    const settings = await guarded('settings', () => backend.call<Settings>('settings.update', { patch }));
    if (settings) setState({ settings });
    return settings;
  },

  async openWorkspace(path: string, quiet = false) {
    const r = await guarded('workspace', () =>
      backend.call<{ workspace: WorkspaceRecord; project: ProjectInfo; permissionMode: PermissionMode }>('workspaces.open', { path }),
    );
    if (!r) return;
    localStorage.setItem(LAST_WS, r.workspace.path);
    setState((s) => ({
      workspace: { record: r.workspace, project: r.project, permissionMode: r.permissionMode },
      workspaces: [r.workspace, ...s.workspaces.filter((w) => w.id !== r.workspace.id)],
      conversationId: undefined,
      conversation: undefined,
      timeline: [],
      tasks: [],
      plan: [],
      activity: [],
      explorerVersion: s.explorerVersion + 1,
    }));
    const conversations = await backend.call<ConversationRecord[]>('conversations.list', { workspaceId: r.workspace.id });
    setState({ conversations });
    if (conversations[0]) await actions.selectConversation(conversations[0].id);
    if (!quiet) toast(`Opened ${r.workspace.name}`, 'ok');
  },

  async setPermissionMode(mode: PermissionMode) {
    const ws = state.workspace;
    if (!ws) return;
    const r = await guarded('mode', () => backend.call<{ mode: PermissionMode }>('workspace.setPermissionMode', { workspaceId: ws.record.id, mode }));
    if (r) setState({ workspace: { ...ws, permissionMode: r.mode } });
  },

  async selectConversation(id: string) {
    const r = await guarded('conversation', () =>
      Promise.all([
        backend.call<{ conversation: ConversationRecord; messages: MessageRecord[]; tasks: TaskRecord[]; pendingApprovals: ApprovalRequest[] }>('conversations.get', { conversationId: id }),
        backend.call<StoredEvent[]>('activity.list', { conversationId: id }),
      ]),
    );
    if (!r) return;
    const [conv, events] = r;
    const running = conv.tasks.find((t) => t.running);
    const lastTask = conv.tasks[conv.tasks.length - 1];
    setState({
      conversationId: id,
      conversation: conv.conversation,
      tasks: conv.tasks,
      timeline: buildTimeline(conv.messages, conv.tasks, events, conv.pendingApprovals),
      activeTaskId: running?.id,
      plan: lastTask?.plan ?? [],
      diffTaskId: lastTask?.id,
      activity: events.map(eventToActivity).filter((a): a is ActivityEntry => !!a),
    });
  },

  async newConversation() {
    const ws = state.workspace;
    if (!ws) return;
    const conv = await guarded('conversation', () => backend.call<ConversationRecord>('conversations.create', { workspaceId: ws.record.id }));
    if (!conv) return;
    setState((s) => ({ conversations: [conv, ...s.conversations], conversationId: conv.id, conversation: conv, timeline: [], tasks: [], plan: [], activeTaskId: undefined, activity: [] }));
  },

  async deleteConversation(id: string) {
    await guarded('conversation', () => backend.call('conversations.delete', { conversationId: id }));
    setState((s) => ({ conversations: s.conversations.filter((c) => c.id !== id), ...(s.conversationId === id ? { conversationId: undefined, conversation: undefined, timeline: [], tasks: [] } : {}) }));
  },

  async setModel(ref: ModelRef) {
    const conv = state.conversation;
    if (conv) {
      await guarded('model', () => backend.call('conversations.setModel', { conversationId: conv.id, model: ref }));
      setState({ conversation: { ...conv, providerId: ref.providerId, model: ref.model } });
    }
    await actions.updateSettings({ models: { ...state.settings?.models, coding: ref } });
  },

  async send(prompt: string) {
    if (!state.workspace) return toast('Open a workspace folder first.', 'error');
    if (!state.conversationId) await actions.newConversation();
    const conversationId = state.conversationId!;
    const model = state.conversation?.providerId && state.conversation.model ? { providerId: state.conversation.providerId, model: state.conversation.model } : state.settings?.models.coding;
    setState((s) => ({ timeline: [...s.timeline, { kind: 'user', id: `local-${Date.now()}`, text: prompt }] }));
    const task = await guarded('send', () => backend.call<TaskRecord>('tasks.start', { conversationId, prompt, ...(model ? { model } : {}) }));
    if (!task) {
      setState((s) => ({ timeline: s.timeline.slice(0, -1) }));
      return;
    }
    setState((s) => ({ activeTaskId: task.id, tasks: [...s.tasks.filter((t) => t.id !== task.id), { ...task, running: true }], plan: [], diffTaskId: task.id }));
    setState((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId && c.title === 'New conversation' ? { ...c, title: prompt.slice(0, 80) } : c)) }));
  },

  async stop() {
    if (state.activeTaskId) await guarded('stop', () => backend.call('tasks.cancel', { taskId: state.activeTaskId }));
  },

  async resume(taskId: string) {
    const t = await guarded('resume', () => backend.call<TaskRecord>('tasks.resume', { taskId }));
    if (t) setState((s) => ({ activeTaskId: t.id, tasks: s.tasks.map((x) => (x.id === t.id ? { ...t, running: true } : x)) }));
  },

  async undo(taskId: string) {
    const r = await guarded('undo', () => backend.call<{ restored: string[]; removed: string[] }>('tasks.undo', { taskId }));
    if (r) {
      toast(`Undone: restored ${r.restored.length} file(s), removed ${r.removed.length}.`, 'ok');
      setState((s) => ({
        explorerVersion: s.explorerVersion + 1,
        timeline: [...s.timeline, { kind: 'note', id: `undo-${Date.now()}`, text: `Changes from the task were undone (${r.restored.length} restored, ${r.removed.length} removed). A checkpoint of the previous state was kept.` }],
      }));
    }
  },

  async respondApproval(requestId: string, answer: 'allow_once' | 'allow_always' | 'deny', message?: string) {
    await guarded('approval', () => backend.call('approvals.respond', { requestId, answer, message }));
  },

  async runTerminal(command: string) {
    const ws = state.workspace;
    if (!ws) return;
    appendTerminal(`\n\u001b[36m$ ${command}\u001b[0m\n`);
    setState({ terminalBusy: true });
    try {
      await backend.call('terminal.run', { workspaceId: ws.record.id, command, opId: 'terminal' });
    } catch (err) {
      appendTerminal(`\n${(err as Error).message}\n`);
    } finally {
      setState({ terminalBusy: false });
    }
  },

  async cancelTerminal() {
    await backend.call('ops.cancel', { opId: 'terminal' }).catch(() => {});
  },

  openFile(path: string) {
    setState({ modal: 'file', filePath: path });
  },
};

// ---------------------------------------------------------------------------
// Live event handling
// ---------------------------------------------------------------------------

function inConversation(taskId?: string): boolean {
  return !!taskId && state.tasks.some((t) => t.id === taskId);
}

function updateTool(callId: string, fn: (t: Extract<TimelineItem, { kind: 'tool' }>) => Extract<TimelineItem, { kind: 'tool' }>) {
  setState((s) => ({ timeline: s.timeline.map((i) => (i.kind === 'tool' && i.id === callId ? fn(i) : i)) }));
}

function eventToActivity(e: StoredEvent | (ServerEvent & { createdAt?: string })): ActivityEntry | undefined {
  const d = ('data' in e && e.data ? e.data : e) as Record<string, unknown>;
  const type = e.type;
  const time = ('createdAt' in e && e.createdAt) || new Date().toISOString();
  const base = { id: `${type}-${String(d.callId ?? d.taskId ?? '')}-${time}-${Math.random()}`, time, type };
  switch (type) {
    case 'task.started':
      return { ...base, text: `${d.resumed ? 'Resumed' : 'Started'} task: ${String(d.prompt).slice(0, 120)}`, level: 'info' };
    case 'model.call':
      return { ...base, text: `Model call #${d.step}: ${d.model} (${d.mode} tools, ~${d.estimatedPromptTokens} prompt tokens)`, level: 'info' };
    case 'model.result': {
      const u = d.usage as { completionTokens?: number; evalTokensPerSec?: number; timeToFirstTokenMs?: number };
      return {
        ...base,
        text: `Model replied: ${u.completionTokens ?? '?'} tokens${u.evalTokensPerSec ? ` at ${u.evalTokensPerSec.toFixed(1)} tok/s` : ''}${u.timeToFirstTokenMs ? `, first token after ${(u.timeToFirstTokenMs / 1000).toFixed(1)}s` : ''}${d.salvaged ? ' (tool call recovered from text)' : ''}${d.fellBack ? ' (fell back to prompted tools)' : ''}`,
        level: 'info',
      };
    }
    case 'tool.start':
      return { ...base, text: `→ ${d.tool}: ${d.summary} [${d.risk}]`, level: 'info' };
    case 'tool.end':
      return { ...base, text: `${d.ok ? '✓' : '✗'} ${d.tool} (${(Number(d.durationMs) / 1000).toFixed(1)}s): ${String(d.output ?? '').split('\n')[0].slice(0, 160)}`, level: d.ok ? 'ok' : 'error' };
    case 'approval.request': {
      const r = d.request as ApprovalRequest;
      return { ...base, text: `Approval requested (${r.risk}): ${r.summary}`, level: 'warn' };
    }
    case 'approval.resolved':
      return { ...base, text: `Approval ${d.answer === 'deny' ? 'denied' : 'granted'} (${d.answer})`, level: d.answer === 'deny' ? 'warn' : 'ok' };
    case 'checkpoint.created': {
      const c = d.checkpoint as { commitHash: string; label: string };
      return { ...base, text: `Checkpoint ${c.commitHash.slice(0, 8)}: ${c.label}`, level: 'info' };
    }
    case 'plan.update':
      return { ...base, text: `Plan updated (${(d.plan as PlanItem[]).filter((p) => p.status === 'done').length}/${(d.plan as PlanItem[]).length} done)`, level: 'info' };
    case 'context.summarized':
      return { ...base, text: 'Older conversation summarized to fit the context window', level: 'info' };
    case 'task.status':
      return d.status === 'running' || d.status === 'awaiting_approval' ? undefined : { ...base, text: `Task ${d.status}${d.error ? `: ${d.error}` : ''}`, level: d.status === 'completed' ? 'ok' : 'warn' };
    case 'log':
      return { ...base, text: String(d.message), level: (d.level as ActivityEntry['level']) ?? 'info' };
    default:
      return undefined;
  }
}

function handleEvent(e: ServerEvent) {
  const taskId = e.taskId as string | undefined;
  switch (e.type) {
    case 'terminal.output':
      if (e.workspaceId === state.workspace?.record.id) appendTerminal(String(e.chunk));
      return;
    case 'terminal.exit':
      if (e.workspaceId === state.workspace?.record.id) appendTerminal(`\u001b[90m[exit ${e.exitCode ?? 'killed'}]\u001b[0m\n`);
      return;
    case 'pull.progress': {
      const p = e.progress as { status: string; completed?: number; total?: number };
      setState((s) => ({ pulls: { ...s.pulls, [String(e.model)]: p } }));
      return;
    }
    case 'files.changed':
    case 'index.updated':
      if (e.workspaceId === state.workspace?.record.id) setState((s) => ({ explorerVersion: s.explorerVersion + 1 }));
      return;
    case 'log':
      if (!taskId) {
        activity('log', String(e.message), (e.level as ActivityEntry['level']) ?? 'info');
        return;
      }
      break;
    case 'task.started':
      if (e.conversationId === state.conversationId && !state.tasks.some((t) => t.id === taskId)) {
        setState((s) => ({ tasks: [...s.tasks, { id: taskId!, conversationId: String(e.conversationId), workspaceId: String(e.workspaceId), prompt: String(e.prompt), status: 'running', plan: [], steps: 0, createdAt: new Date().toISOString(), running: true }], activeTaskId: taskId }));
      }
      break;
  }
  if (!inConversation(taskId) && e.type !== 'approval.request') return;

  const act = eventToActivity(e);
  if (act) setState((s) => ({ activity: [...s.activity.slice(-1500), act] }));

  switch (e.type) {
    case 'assistant.delta': {
      const channel = e.channel as 'text' | 'thinking';
      const text = String(e.text);
      setState((s) => {
        const tl = [...s.timeline];
        const last = tl[tl.length - 1];
        if (last && last.kind === 'assistant' && last.streaming && last.taskId === taskId) {
          tl[tl.length - 1] = channel === 'text' ? { ...last, text: last.text + text } : { ...last, thinking: (last.thinking ?? '') + text };
        } else {
          tl.push({ kind: 'assistant', id: `stream-${Date.now()}`, text: channel === 'text' ? text : '', thinking: channel === 'thinking' ? text : undefined, streaming: true, taskId });
        }
        return { timeline: tl };
      });
      break;
    }
    case 'assistant.message': {
      const m = e.message as MessageRecord;
      setState((s) => {
        const tl = [...s.timeline];
        const last = tl[tl.length - 1];
        if (last && last.kind === 'assistant' && last.streaming) tl.pop();
        if (m.content.trim()) tl.push({ kind: 'assistant', id: m.id, text: m.content, thinking: m.meta?.thinking, taskId });
        for (const c of m.toolCalls ?? []) {
          tl.push({ kind: 'tool', id: c.id, taskId, name: c.name, args: c.arguments, status: 'pending', salvaged: c.salvaged });
        }
        return { timeline: tl };
      });
      break;
    }
    case 'tool.start': {
      const callId = String(e.callId);
      if (!state.timeline.some((i) => i.kind === 'tool' && i.id === callId)) {
        setState((s) => ({ timeline: [...s.timeline, { kind: 'tool', id: callId, taskId, name: String(e.tool), args: (e.args as Record<string, unknown>) ?? {}, status: 'running' }] }));
      }
      updateTool(callId, (t) => ({ ...t, status: 'running', summary: String(e.summary), risk: String(e.risk) }));
      if (['run_command', 'run_tests', 'inspect_errors'].includes(String(e.tool))) appendTerminal(`\n\u001b[35m[agent] ${String(e.summary)}\u001b[0m\n`);
      break;
    }
    case 'tool.output': {
      const chunk = String(e.chunk);
      appendTerminal(chunk);
      updateTool(String(e.callId), (t) => ({ ...t, live: ((t.live ?? '') + chunk).slice(-20000) }));
      break;
    }
    case 'tool.end':
      updateTool(String(e.callId), (t) => ({ ...t, status: e.ok ? 'ok' : 'error', output: String(e.output), durationMs: Number(e.durationMs), live: undefined }));
      break;
    case 'approval.request': {
      const req = e.request as ApprovalRequest;
      if (!inConversation(req.taskId)) return;
      setState((s) => ({ timeline: [...s.timeline, { kind: 'approval', id: req.id, request: req }] }));
      notifyAttention(`Approval needed: ${req.summary}`);
      break;
    }
    case 'approval.resolved':
      setState((s) => ({ timeline: s.timeline.map((i) => (i.kind === 'approval' && i.id === e.requestId ? { ...i, resolved: String(e.answer) } : i)) }));
      break;
    case 'plan.update':
      setState({ plan: e.plan as PlanItem[] });
      break;
    case 'context.summarized':
      setState((s) => ({ timeline: [...s.timeline, { kind: 'note', id: `sum-${Date.now()}`, text: 'Older messages were summarized to fit the model context window.' }] }));
      break;
    case 'log':
      if (e.level === 'warn' || e.level === 'error') {
        setState((s) => ({ timeline: [...s.timeline, { kind: 'note', id: `log-${Date.now()}-${Math.random()}`, text: String(e.message), level: e.level as 'warn' }] }));
      }
      break;
    case 'task.status':
      setState((s) => ({
        tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status: e.status as TaskRecord['status'], error: e.error as string | undefined } : t)),
      }));
      break;
    case 'task.finished': {
      const report = e.report as TaskReport;
      setState((s) => ({
        activeTaskId: s.activeTaskId === taskId ? undefined : s.activeTaskId,
        tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status: report.status, report, running: false } : t)),
        timeline: [...s.timeline.filter((i) => !(i.kind === 'assistant' && i.streaming)), { kind: 'report', id: `report-${taskId}`, taskId: taskId!, report, error: s.tasks.find((t) => t.id === taskId)?.error }],
        explorerVersion: s.explorerVersion + 1,
        plan: report.plan.length ? report.plan : s.plan,
      }));
      notifyAttention(`Task ${report.status}`);
      break;
    }
  }
}

function notifyAttention(text: string) {
  if (document.hasFocus()) return;
  document.title = `● ${text} — LocalCode AI`;
  const reset = () => {
    document.title = 'LocalCode AI';
    window.removeEventListener('focus', reset);
  };
  window.addEventListener('focus', reset);
}
