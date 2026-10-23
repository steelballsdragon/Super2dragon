import { z } from 'zod';
import type { PlanItem, PlanStatus } from '../engine/types.js';
import { defineTool } from './types.js';

const STATUS_ALIASES: Record<string, PlanStatus> = {
  todo: 'pending', pending: 'pending', open: 'pending', not_started: 'pending',
  in_progress: 'in_progress', 'in-progress': 'in_progress', doing: 'in_progress', active: 'in_progress', started: 'in_progress', current: 'in_progress',
  done: 'done', complete: 'done', completed: 'done', finished: 'done', ok: 'done',
  blocked: 'blocked', failed: 'blocked', skipped: 'skipped', cancelled: 'skipped', canceled: 'skipped',
};

const statusSchema = z.preprocess(
  (v) => (typeof v === 'string' ? (STATUS_ALIASES[v.toLowerCase().replace(/\s+/g, '_')] ?? v) : v),
  z.enum(['pending', 'in_progress', 'done', 'blocked', 'skipped']),
);

export function renderPlan(items: PlanItem[]): string {
  const mark: Record<PlanStatus, string> = { pending: '[ ]', in_progress: '[~]', done: '[x]', blocked: '[!]', skipped: '[-]' };
  return items.map((i) => `${mark[i.status]} ${i.id}. ${i.title}${i.acceptance ? `  (done when: ${i.acceptance})` : ''}${i.note ? `  - ${i.note}` : ''}`).join('\n');
}

export const updatePlanTool = defineTool({
  name: 'update_plan',
  description:
    'Create or update the task plan: a checklist of concrete steps, each with an acceptance criterion. Send the full list each time with current statuses (pending, in_progress, done, blocked).',
  category: 'meta',
  schema: z.object({
    items: z
      .array(
        z.preprocess(
          (v) => (typeof v === 'string' ? { title: v } : v),
          z.object({
            title: z.string().min(1).describe('What this step does'),
            status: statusSchema.default('pending').describe('pending | in_progress | done | blocked'),
            acceptance: z.string().optional().describe('How we know the step is complete'),
            note: z.string().optional(),
          }),
        ),
      )
      .min(1)
      .max(30)
      .describe('The full plan, in order'),
  }),
  mutates: false,
  assess: (a) => ({ risk: 'read', summary: `Update plan (${a.items.length} steps)`, reasons: [] }),
  async execute(a, ctx) {
    const items: PlanItem[] = a.items.map((it, i) => ({
      id: String(i + 1),
      title: it.title,
      status: it.status,
      ...(it.acceptance ? { acceptance: it.acceptance } : {}),
      ...(it.note ? { note: it.note } : {}),
    }));
    ctx.setPlan(items);
    const done = items.filter((i) => i.status === 'done').length;
    return { ok: true, output: `Plan updated (${done}/${items.length} done):\n${renderPlan(items)}`, data: { items } };
  },
});

export const undoChangesTool = defineTool({
  name: 'undo_changes',
  description:
    'Restore files to a checkpoint. checkpoint="task_start" (default) reverts this task\'s changes. Optionally limit to specific paths. The current state is saved first, so this is itself undoable.',
  category: 'write',
  schema: z.object({
    checkpoint: z.string().default('task_start').describe('"task_start" or a checkpoint id'),
    paths: z.array(z.string()).optional().describe('Only restore these files/folders'),
  }),
  mutates: true,
  assess: (a) => ({ risk: 'write', summary: `Undo changes to ${a.checkpoint}${a.paths?.length ? ` (${a.paths.join(', ')})` : ''}`, reasons: ['reverts files'] }),
  async execute(a, ctx) {
    if (!ctx.checkpoints) return { ok: false, output: 'Checkpoints are disabled in settings, so changes cannot be undone automatically.' };
    const hash = ctx.resolveCheckpoint(a.checkpoint);
    if (!hash) return { ok: false, output: `Unknown checkpoint "${a.checkpoint}".` };
    const paths = a.paths?.map((p) => ctx.guard.resolve(p, { write: true }).rel);
    const r = await ctx.checkpoints.restore(hash, paths);
    for (const p of [...r.restored, ...r.removed]) ctx.fileState.forget(p);
    ctx.onFilesChanged([...r.restored, ...r.removed]);
    const lines = [
      ...r.restored.map((p) => `restored ${p}`),
      ...r.removed.map((p) => `removed  ${p}`),
    ];
    return {
      ok: true,
      output: lines.length ? `Restored ${lines.length} file(s):\n${lines.join('\n')}` : 'Nothing to restore; files already match the checkpoint.',
      data: { restored: r.restored, removed: r.removed, safetyCheckpoint: r.safetyCheckpoint },
    };
  },
});
