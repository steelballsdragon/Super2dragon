import type { ModelClient } from '../models/adapter.js';
import type { ChatMessage, ToolSpec } from '../models/types.js';
import type { Store } from '../storage/store.js';
import type { ConversationRecord, MessageRecord } from '../engine/types.js';
import type { Settings } from '../engine/settings.js';
import { errorMessage } from '../util/errors.js';
import { estimateTokens, truncateMiddle } from '../util/text.js';
import { SUMMARY_SYSTEM_PROMPT } from './prompts.js';

const KEEP_FULL_TOOL_RESULTS = 6;
const OLD_TOOL_RESULT_CHARS = 1500;

export interface BuiltContext {
  messages: ChatMessage[];
  estimatedTokens: number;
  budgetTokens: number;
  needsSummary: boolean;
}

function messageTokens(m: ChatMessage): number {
  return estimateTokens(m.content) + (m.toolCalls ? estimateTokens(JSON.stringify(m.toolCalls)) : 0) + 4;
}

/** Tokens available for the prompt once room for the model's reply is reserved. */
export function promptBudget(settings: Settings): number {
  const numCtx = settings.generation.numCtx;
  const reserve = Math.min(settings.generation.maxTokens, Math.floor(numCtx / 4));
  return Math.floor((numCtx - reserve) * 0.95);
}

/**
 * Builds what the model sees each turn: system prompt + (summary of older
 * history) + recent messages, with older large tool outputs compacted. When
 * the estimate approaches the context window, older messages are summarized.
 */
export class ContextManager {
  constructor(
    private readonly store: Store,
    private readonly getSettings: () => Settings,
  ) {}

  history(conv: ConversationRecord): MessageRecord[] {
    const msgs = this.store.listMessages(conv.id, { afterSeq: conv.summaryUptoSeq });
    // A cut point never starts with orphaned tool results.
    let i = 0;
    while (i < msgs.length && msgs[i].role === 'tool') i++;
    return msgs.slice(i);
  }

  build(conv: ConversationRecord, systemPrompt: string, tools: ToolSpec[], nativeTools: boolean): BuiltContext {
    const settings = this.getSettings();
    const history = this.history(conv);
    const toolIdx = history.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
    const keepFull = new Set(toolIdx.slice(-KEEP_FULL_TOOL_RESULTS));
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
    history.forEach((m, i) => {
      let content = m.content;
      if (m.role === 'tool' && !keepFull.has(i) && content.length > OLD_TOOL_RESULT_CHARS) {
        content = `${truncateMiddle(content, OLD_TOOL_RESULT_CHARS, 'chars')}\n[older output compacted]`;
      }
      messages.push({
        role: m.role,
        content,
        ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
        ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
        ...(m.toolName ? { toolName: m.toolName } : {}),
      });
    });
    const toolTokens = estimateTokens(nativeTools ? JSON.stringify(tools) : tools.map((t) => `${t.name} ${t.description} ${JSON.stringify(t.parameters.properties)}`).join('\n'));
    const estimatedTokens = messages.reduce((s, m) => s + messageTokens(m), 0) + toolTokens;
    const budgetTokens = promptBudget(settings);
    return {
      messages,
      estimatedTokens,
      budgetTokens,
      needsSummary: estimatedTokens > budgetTokens * settings.context.summarizeAtRatio && history.length > settings.context.keepRecentMessages + 2,
    };
  }

  /**
   * Summarize older messages into the conversation summary. Returns false if
   * there was nothing that could be summarized.
   */
  async summarize(conv: ConversationRecord, client: ModelClient, signal?: AbortSignal, aggressive = false): Promise<{ ok: boolean; summary?: string; uptoSeq?: number; usedFallback?: boolean }> {
    const settings = this.getSettings();
    const all = this.history(conv);
    const keep = aggressive ? Math.max(2, Math.floor(settings.context.keepRecentMessages / 2)) : settings.context.keepRecentMessages;
    if (all.length <= keep + 1) return { ok: false };
    let cut = all.length - keep;
    while (cut < all.length && all[cut].role === 'tool') cut++;
    if (cut <= 0 || cut >= all.length) return { ok: false };
    const older = all.slice(0, cut);
    const budgetChars = Math.floor(promptBudget(settings) * 3.2 * 0.7);
    const rendered = older.map(renderForTranscript);
    let transcript = rendered.join('\n');
    if (transcript.length > budgetChars) transcript = truncateMiddle(transcript, budgetChars, 'chars of transcript');
    const previous = conv.summary ? `Previous summary:\n${conv.summary}\n\n` : '';
    let summary: string;
    let usedFallback = false;
    try {
      const res = await client.complete({
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `${previous}Transcript to condense:\n<transcript>\n${transcript}\n</transcript>` },
        ],
        tools: [],
        signal,
        options: { temperature: 0.1, maxTokens: 800 },
      });
      summary = res.content.trim();
      if (summary.length < 40) throw new Error('summary too short');
    } catch (err) {
      if (signal?.aborted) throw err;
      summary = mechanicalSummary(conv.summary, older, errorMessage(err));
      usedFallback = true;
    }
    const uptoSeq = older[older.length - 1].seq;
    this.store.updateConversation(conv.id, { summary, summaryUptoSeq: uptoSeq });
    conv.summary = summary;
    conv.summaryUptoSeq = uptoSeq;
    return { ok: true, summary, uptoSeq, usedFallback };
  }
}

function renderForTranscript(m: MessageRecord): string {
  if (m.role === 'user') return `USER: ${truncateMiddle(m.content, 3000, 'chars')}`;
  if (m.role === 'assistant') {
    const calls = (m.toolCalls ?? []).map((c) => `[tool call ${c.name} ${truncateMiddle(JSON.stringify(c.arguments), 400, 'chars')}]`).join(' ');
    return `ASSISTANT: ${truncateMiddle(m.content, 2000, 'chars')} ${calls}`.trim();
  }
  if (m.role === 'tool') return `TOOL RESULT (${m.toolName}): ${truncateMiddle(m.content, 700, 'chars')}`;
  return `${m.role.toUpperCase()}: ${truncateMiddle(m.content, 1000, 'chars')}`;
}

/** Deterministic fallback used when the model cannot produce a summary. */
function mechanicalSummary(previous: string | undefined, older: MessageRecord[], why: string): string {
  const requests = older.filter((m) => m.role === 'user').map((m) => `- ${m.content.slice(0, 300).replace(/\s+/g, ' ')}`);
  const touched = new Set<string>();
  const commands: string[] = [];
  for (const m of older) {
    for (const c of m.toolCalls ?? []) {
      const p = (c.arguments.path ?? c.arguments.to) as string | undefined;
      if (p && ['write_file', 'edit_file', 'move_file', 'delete_file'].includes(c.name)) touched.add(p);
      if (c.name === 'run_command' || c.name === 'run_tests') commands.push(String(c.arguments.command ?? c.name));
    }
  }
  return [
    previous ? `${previous}\n` : '',
    `(Automatic summary; model summarization failed: ${why})`,
    '## Task requirements',
    ...requests.slice(-6),
    '## Files and code references',
    touched.size ? [...touched].map((p) => `- modified ${p}`).join('\n') : '- none recorded',
    '## Work done and verified results',
    commands.length ? commands.slice(-8).map((c) => `- ran: ${c}`).join('\n') : '- no commands recorded',
  ]
    .filter(Boolean)
    .join('\n');
}
