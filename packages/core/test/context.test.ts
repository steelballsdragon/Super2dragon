import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { makeEngine, makeWorkspace } from './helpers.js';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe('context management', () => {
  it('summarizes older history when the context window fills up and keeps working', async () => {
    const big = 'x'.repeat(6000);
    let reads = 0;
    let summaries = 0;
    // One stateful responder: summarization requests carry no tools.
    const respond = (req: { tools?: unknown[] }) => {
      if (!req.tools?.length) {
        summaries++;
        return { text: '## Task requirements\nRead the files.\n## Decisions\nNone.\n## Files and code references\nf0..f5\n## Work done and verified results\nread all\n## Outstanding work\nnone' };
      }
      if (reads < 6) return { calls: [{ name: 'read_file', arguments: { path: `f${reads++}.txt` } }] };
      return { text: 'All files read.' };
    };
    const files: Record<string, string> = {};
    for (let i = 0; i < 6; i++) files[`f${i}.txt`] = big;
    const dir = makeWorkspace(files);
    const t = makeEngine(Array.from({ length: 30 }, () => respond));
    cleanups.push(t.cleanup, () => rmSync(dir, { recursive: true, force: true }));
    // A tiny context window forces summarization.
    t.engine.updateSettings({ generation: { numCtx: 8192, maxTokens: 1024 }, context: { keepRecentMessages: 4, summarizeAtRatio: 0.6 } });
    const ws = t.engine.openWorkspace(dir);
    const conv = t.engine.createConversation(ws.id);
    const events: string[] = [];
    t.engine.on('event', (e: { type: string }) => events.push(e.type));
    const task = await t.engine.runTask({ conversationId: conv.id, prompt: 'read every file' });
    expect(task.status).toBe('completed');
    expect(summaries).toBeGreaterThan(0);
    expect(events).toContain('context.summarized');
    const updated = t.engine.store.getConversation(conv.id)!;
    expect(updated.summary).toContain('## Task requirements');
    expect(updated.summaryUptoSeq).toBeGreaterThan(0);
    // After summarization the summary is in the system prompt and old messages are no longer sent verbatim.
    const last = t.provider.requests.at(-1)!;
    expect(last.messages[0].content).toContain('Summary of earlier conversation');
    expect(last.messages.length).toBeLessThan(10);
    // The first kept message is never an orphaned tool result.
    expect(last.messages[1].role).not.toBe('tool');
    // Full history (user + 6 call/result pairs + final answer) is still stored for the UI.
    expect(t.engine.store.listMessages(conv.id)).toHaveLength(14);
  });

  it('falls back to a mechanical summary if the model cannot summarize', async () => {
    const big = 'y'.repeat(6000);
    const script = [
      ...Array.from({ length: 6 }, (_, i) => ({ calls: [{ name: 'read_file', arguments: { path: `g${i}.txt` } }] })),
      { text: '' }, // empty summary -> fallback
      { text: 'done' },
    ];
    const files: Record<string, string> = {};
    for (let i = 0; i < 6; i++) files[`g${i}.txt`] = big;
    const dir = makeWorkspace(files);
    const t = makeEngine(script);
    cleanups.push(t.cleanup, () => rmSync(dir, { recursive: true, force: true }));
    t.engine.updateSettings({ generation: { numCtx: 8192, maxTokens: 1024 }, context: { keepRecentMessages: 4, summarizeAtRatio: 0.6 } });
    const ws = t.engine.openWorkspace(dir);
    const conv = t.engine.createConversation(ws.id);
    const task = await t.engine.runTask({ conversationId: conv.id, prompt: 'read the g files' });
    expect(task.status).toBe('completed');
    expect(t.engine.store.getConversation(conv.id)!.summary).toContain('Automatic summary');
    expect(task.report!.warnings.join(' ')).toMatch(/automatic summary/);
  });

  it('includes recent tasks from other conversations as workspace memory', async () => {
    const dir = makeWorkspace({ 'a.txt': '' });
    const t = makeEngine([{ text: 'first done' }, { text: 'second done' }]);
    cleanups.push(t.cleanup, () => rmSync(dir, { recursive: true, force: true }));
    const ws = t.engine.openWorkspace(dir);
    const c1 = t.engine.createConversation(ws.id);
    await t.engine.runTask({ conversationId: c1.id, prompt: 'Refactor the payment module' });
    const c2 = t.engine.createConversation(ws.id);
    await t.engine.runTask({ conversationId: c2.id, prompt: 'Next thing' });
    const sys = t.provider.requests.at(-1)!.messages[0].content;
    expect(sys).toContain('Recent work in this workspace');
    expect(sys).toContain('Refactor the payment module');
  });
});
