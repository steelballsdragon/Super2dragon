import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { execFileText } from '../util/exec.js';
import { truncateMiddle } from '../util/text.js';
import { boolArg } from './args.js';
import { defineTool, type ToolContext } from './types.js';

export async function git(ctx: { guard: { root: string }; signal?: AbortSignal }, args: string[], timeoutMs = 60_000) {
  return execFileText('git', ['-c', 'core.pager=cat', '-c', 'color.ui=false', ...args], {
    cwd: ctx.guard.root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' },
    timeoutMs,
    signal: ctx.signal,
  });
}

export async function isGitRepo(root: string): Promise<boolean> {
  if (existsSync(path.join(root, '.git'))) return true;
  try {
    const r = await execFileText('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, timeoutMs: 5000 });
    return r.code === 0 && r.stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export const gitStatusTool = defineTool({
  name: 'git_status',
  description: 'Show the git branch and changed/untracked files in the workspace repository.',
  category: 'git',
  schema: z.object({}),
  mutates: false,
  assess: () => ({ risk: 'read', summary: 'git status', reasons: [] }),
  async execute(_a, ctx) {
    if (!(await isGitRepo(ctx.guard.root))) {
      return { ok: true, output: 'Not a git repository. Changes are still tracked by LocalCode checkpoints; use git_diff to review changes since the task started.' };
    }
    const r = await git(ctx, ['status', '--porcelain=v1', '--branch', '--untracked-files=all']);
    if (r.code !== 0) return { ok: false, output: r.stderr.trim() };
    const lines = r.stdout.trim().split('\n');
    const branch = lines[0]?.replace(/^## /, '') ?? '';
    const files = lines.slice(1).filter(Boolean);
    return {
      ok: true,
      output: `Branch: ${branch}\n${files.length ? files.slice(0, 300).join('\n') : 'Working tree clean.'}${files.length > 300 ? `\n... ${files.length - 300} more` : ''}`,
      data: { branch, changed: files.length },
    };
  },
});

export const gitDiffTool = defineTool({
  name: 'git_diff',
  description:
    'Review changes as a unified diff. since="task" (default) shows everything changed since this task started (works without git); since="head" shows uncommitted changes vs the last git commit; staged=true shows staged changes.',
  category: 'git',
  schema: z.object({
    path: z.string().optional().describe('Limit to this file or folder'),
    since: z.enum(['task', 'head']).default('task').describe('Baseline for the diff'),
    staged: boolArg('Show staged changes only (git)').optional(),
  }),
  mutates: false,
  assess: (a) => ({ risk: 'read', summary: `Diff${a.path ? ` ${a.path}` : ''} (since ${a.since})`, reasons: [] }),
  async execute(a, ctx: ToolContext) {
    const paths = a.path ? [ctx.guard.resolve(a.path).rel] : [];
    const max = ctx.settings.agent.toolOutputMaxChars;
    if (a.since === 'task' && !a.staged && ctx.checkpoints && ctx.taskCheckpoint) {
      const changes = await ctx.checkpoints.changes(ctx.taskCheckpoint);
      const filtered = paths.length ? changes.filter((c) => c.path.startsWith(paths[0])) : changes;
      if (!filtered.length) return { ok: true, output: 'No changes since the task started.' };
      const diff = await ctx.checkpoints.diff(ctx.taskCheckpoint, undefined, paths);
      const stat = filtered.map((c) => `${c.status.padEnd(8)} ${c.path} (+${c.additions} -${c.deletions})`).join('\n');
      return { ok: true, output: `Changes since task start:\n${stat}\n\n${truncateMiddle(ctx.redactor.redact(diff).text, max, 'chars')}`, data: { files: filtered.length } };
    }
    if (!(await isGitRepo(ctx.guard.root))) return { ok: false, output: 'Not a git repository and no task checkpoint available.' };
    const args = ['diff', '--stat', '--patch', '-M'];
    if (a.staged) args.push('--cached');
    const r = await git(ctx, [...args, '--', ...paths]);
    if (r.code !== 0) return { ok: false, output: r.stderr.trim() };
    const untracked = await git(ctx, ['ls-files', '--others', '--exclude-standard', '--', ...paths]);
    const extra = untracked.stdout.trim() ? `\nUntracked files:\n${untracked.stdout.trim()}` : '';
    const out = r.stdout.trim() || 'No uncommitted changes to tracked files.';
    return { ok: true, output: truncateMiddle(ctx.redactor.redact(out + extra).text, max, 'chars') };
  },
});

export const gitCommitTool = defineTool({
  name: 'git_commit',
  description: 'Commit changes to the workspace git repository. Always requires user approval. Stages the given paths (or all changes).',
  category: 'git',
  schema: z.object({
    message: z.string().min(1).describe('Commit message'),
    paths: z.array(z.string()).optional().describe('Files to stage; omit to stage all changes'),
  }),
  mutates: false,
  assess: (a) => ({ risk: 'write', summary: `git commit: ${a.message.split('\n')[0].slice(0, 80)}`, reasons: ['creates a commit in your repository'], alwaysAsk: true, ruleKey: 'git_commit' }),
  async execute(a, ctx) {
    if (!(await isGitRepo(ctx.guard.root))) return { ok: false, output: 'Not a git repository.' };
    const paths = (a.paths ?? []).map((p) => ctx.guard.resolve(p).rel);
    const add = await git(ctx, paths.length ? ['add', '--', ...paths] : ['add', '-A']);
    if (add.code !== 0) return { ok: false, output: `git add failed: ${add.stderr.trim()}` };
    const r = await git(ctx, ['commit', '-m', a.message]);
    if (r.code !== 0) return { ok: false, output: `git commit failed (exit ${r.code}):\n${(r.stdout + r.stderr).trim()}` };
    const hash = (await git(ctx, ['rev-parse', '--short', 'HEAD'])).stdout.trim();
    ctx.recordCommand({ command: `git commit -m ${JSON.stringify(a.message)}`, exitCode: 0, durationMs: 0, timedOut: false, tool: 'git_commit' });
    return { ok: true, output: `Committed ${hash}: ${a.message.split('\n')[0]}\n${r.stdout.trim()}`, data: { hash } };
  },
});
