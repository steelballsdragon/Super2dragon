import { z } from 'zod';
import { errorMessage } from '../util/errors.js';
import { boolArg, intArg } from './args.js';
import { defineTool } from './types.js';

export const searchCodeTool = defineTool({
  name: 'search_code',
  description:
    'Search the workspace. mode "text" (literal, default), "regex", "symbol" (find definitions of functions/classes/types by name), "files" (match file paths), or "semantic" (meaning-based, needs an embedding model).',
  category: 'read',
  schema: z.object({
    query: z.string().min(1).describe('Text, regex, symbol name, file name, or natural-language description'),
    mode: z.enum(['text', 'regex', 'symbol', 'files', 'semantic']).default('text').describe('Search mode'),
    path: z.string().optional().describe('Limit to this folder or file'),
    glob: z.string().optional().describe('Only files matching this glob, e.g. "*.ts"'),
    case_sensitive: boolArg('Case-sensitive match (default false)').optional(),
    max_results: intArg('Maximum results (default 40)').optional(),
    context_lines: intArg('Lines of context around each match (default 0)').optional(),
  }),
  mutates: false,
  assess: (a) => ({ risk: 'read', summary: `Search (${a.mode}) "${a.query.slice(0, 60)}"`, reasons: [] }),
  async execute(a, ctx) {
    const max = Math.min(a.max_results ?? 40, 200);
    const scope = a.path ? ctx.guard.resolve(a.path).rel : undefined;
    if (a.mode === 'symbol') {
      const syms = await ctx.index.findSymbols(a.query, max, scope === '.' ? undefined : scope);
      if (!syms.length) return { ok: true, output: `No symbol definitions matching "${a.query}". Try mode "text".` };
      return {
        ok: true,
        output: syms.map((s) => `${s.path}:${s.line}  ${s.kind} ${s.container ? `${s.container}.` : ''}${s.name}`).join('\n'),
        data: { count: syms.length },
      };
    }
    if (a.mode === 'files') {
      const files = await ctx.search.files(a.query, max);
      return { ok: true, output: files.length ? files.join('\n') : `No files matching "${a.query}".`, data: { count: files.length } };
    }
    if (a.mode === 'semantic') {
      if (!ctx.search.embeddings.configured) {
        return { ok: false, output: 'Semantic search is not configured (no embedding model selected). Use mode "text" or "symbol" instead.' };
      }
      try {
        const hits = await ctx.search.embeddings.query(a.query, Math.min(max, 15), ctx.signal);
        return {
          ok: true,
          output: hits.map((h) => `${h.path}:${h.startLine}-${h.endLine}  (score ${h.score.toFixed(3)})`).join('\n') || 'No results.',
          data: { count: hits.length },
        };
      } catch (err) {
        return { ok: false, output: `Semantic search failed: ${errorMessage(err)}` };
      }
    }
    const res = await ctx.search.text({
      query: a.query,
      regex: a.mode === 'regex',
      caseSensitive: a.case_sensitive,
      glob: a.glob,
      path: scope,
      maxResults: max,
      contextLines: a.context_lines,
      signal: ctx.signal,
    });
    if (!res.matches.length) return { ok: true, output: `No matches for "${a.query}"${scope ? ` in ${scope}` : ''}.`, data: { count: 0 } };
    const lines: string[] = [];
    for (const m of res.matches) {
      if (m.context?.length) {
        const all = [...m.context, { line: m.line, text: m.text }].sort((x, y) => x.line - y.line);
        lines.push(`${m.path}:`);
        for (const c of all) lines.push(`${String(c.line).padStart(6)}${c.line === m.line ? '>' : ' '} ${c.text}`);
      } else lines.push(`${m.path}:${m.line}: ${m.text.trim()}`);
    }
    if (res.truncated) lines.push(`... more results omitted (limit ${max}); narrow the search with path or glob.`);
    return { ok: true, output: lines.join('\n'), data: { count: res.matches.length, engine: res.engine } };
  },
});
