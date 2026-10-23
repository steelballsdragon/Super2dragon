import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { isSensitivePath } from '../security/paths.js';
import { isProbablyBinary } from '../util/text.js';
import { boolArg, intArg } from './args.js';
import { defineTool, type ToolContext } from './types.js';

const MAX_READ_LINES = 600;
const MAX_READ_CHARS = 40_000;

export function numberLines(lines: string[], startLine: number): string {
  return lines.map((l, i) => `${String(startLine + i).padStart(5)}\t${l}`).join('\n');
}

function relMtime(abs: string): number {
  try {
    return statSync(abs).mtimeMs;
  } catch {
    return 0;
  }
}

export const listFilesTool = defineTool({
  name: 'list_files',
  description: 'List files and folders in the workspace as a tree (respects .gitignore). Use to explore project structure.',
  category: 'read',
  schema: z.object({
    path: z.string().default('.').describe('Directory relative to the workspace root (default ".")'),
    depth: intArg('How many directory levels to expand (default 3)').default(3),
  }),
  mutates: false,
  assess: (a) => ({ risk: 'read', summary: `List ${a.path}`, reasons: [] }),
  async execute(a, ctx) {
    const { rel, abs } = ctx.guard.resolve(a.path);
    if (!existsSync(abs)) return { ok: false, output: `Directory not found: ${rel}` };
    if (!statSync(abs).isDirectory()) return { ok: false, output: `${rel} is a file, not a directory. Use read_file.` };
    const t = await ctx.index.tree(rel, Math.max(1, Math.min(a.depth, 8)), 400);
    if (t.total === 0) return { ok: true, output: `${rel}/ has no (non-ignored) files.` };
    return { ok: true, output: `${rel === '.' ? 'Workspace' : rel}/ (${t.total} files)\n${t.text}`, data: { total: t.total } };
  },
});

export const readFileTool = defineTool({
  name: 'read_file',
  description: 'Read a text file. Returns numbered lines ("  12<TAB>code"); the numbers are NOT part of the file. Use offset/limit for large files.',
  category: 'read',
  schema: z.object({
    path: z.string().describe('File path relative to the workspace root'),
    offset: intArg('First line to read, 1-based (default 1)').optional(),
    limit: intArg(`Maximum number of lines (default ${MAX_READ_LINES})`).optional(),
  }),
  mutates: false,
  assess: (a, ctx) => {
    let rel = a.path;
    try {
      rel = ctx.guard.resolve(a.path).rel;
    } catch {
      /* reported on execute */
    }
    const sensitive = isSensitivePath(rel);
    return { risk: 'read', summary: `Read ${rel}`, reasons: sensitive ? ['file may contain credentials'] : [], sensitive, ruleKey: rel };
  },
  async execute(a, ctx) {
    const { abs, rel } = ctx.guard.resolve(a.path);
    if (!existsSync(abs)) {
      const similar = await ctx.search.files(path.basename(rel), 5);
      return { ok: false, output: `File not found: ${rel}${similar.length ? `\nDid you mean: ${similar.join(', ')}` : ''}` };
    }
    const st = statSync(abs);
    if (st.isDirectory()) return { ok: false, output: `${rel} is a directory. Use list_files.` };
    if (st.size > 20 * 1024 * 1024) return { ok: false, output: `${rel} is too large to read (${st.size} bytes).` };
    const buf = readFileSync(abs);
    if (isProbablyBinary(buf)) return { ok: true, output: `${rel} is a binary file (${st.size} bytes); contents not shown.` };
    const text = buf.toString('utf8');
    const lines = text.split(/\r?\n/);
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const start = Math.max(1, a.offset ?? 1);
    let end = Math.min(lines.length, start - 1 + Math.max(1, Math.min(a.limit ?? MAX_READ_LINES, 2000)));
    let slice = lines.slice(start - 1, end);
    let body = numberLines(slice, start);
    while (body.length > MAX_READ_CHARS && slice.length > 20) {
      slice = slice.slice(0, Math.floor(slice.length * 0.7));
      end = start - 1 + slice.length;
      body = numberLines(slice, start);
    }
    ctx.fileState.markRead(rel, st.mtimeMs);
    const header =
      lines.length === 0
        ? `${rel} (empty file)`
        : `${rel} (lines ${start}-${end} of ${lines.length})${end < lines.length ? ` - more available, use offset=${end + 1}` : ''}`;
    return { ok: true, output: `${header}\n${body}`, data: { path: rel, lines: lines.length } };
  },
});

export const writeFileTool = defineTool({
  name: 'write_file',
  description: 'Create a new file, or completely replace an existing file you have read. Parent folders are created. Prefer edit_file for small changes.',
  category: 'write',
  schema: z.object({
    path: z.string().describe('File path relative to the workspace root'),
    content: z.string().describe('The complete file content'),
  }),
  mutates: true,
  assess: (a, ctx) => {
    let rel = a.path;
    try {
      rel = ctx.guard.resolve(a.path, { write: true }).rel;
    } catch {
      /* reported on execute */
    }
    return { risk: 'write', summary: `Write ${rel} (${a.content.split('\n').length} lines)`, reasons: [], ruleKey: rel };
  },
  async execute(a, ctx) {
    const { abs, rel } = ctx.guard.resolve(a.path, { write: true });
    if (/\[REDACTED(:[\w-]+)?\]/.test(a.content)) {
      return { ok: false, output: 'Refusing to write "[REDACTED]" placeholders: secrets are hidden from you, so preserve those lines with edit_file instead of rewriting them.' };
    }
    const exists = existsSync(abs);
    if (exists && statSync(abs).isDirectory()) return { ok: false, output: `${rel} is a directory.` };
    if (exists) {
      const seen = ctx.fileState.lastSeen(rel);
      if (seen === undefined) return { ok: false, output: `${rel} already exists. Read it first with read_file (or use edit_file for targeted changes).` };
      if (Math.abs(relMtime(abs) - seen) > 1) return { ok: false, output: `${rel} changed since you last read it. Read it again before overwriting.` };
    }
    mkdirSync(path.dirname(abs), { recursive: true });
    const before = exists ? readFileSync(abs, 'utf8') : '';
    writeFileSync(abs, a.content);
    ctx.fileState.markWritten(rel, relMtime(abs), !exists);
    ctx.onFilesChanged([rel]);
    const lines = a.content.split('\n').length;
    return {
      ok: true,
      output: `${exists ? 'Overwrote' : 'Created'} ${rel} (${lines} lines).`,
      data: { path: rel, created: !exists, beforeLength: before.length, afterLength: a.content.length },
    };
  },
});

function countOccurrences(hay: string, needle: string): number[] {
  const idx: number[] = [];
  if (!needle) return idx;
  let i = hay.indexOf(needle);
  while (i >= 0) {
    idx.push(i);
    i = hay.indexOf(needle, i + needle.length);
  }
  return idx;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** "  12\tcode" or "12| code" prefixes copied from read_file output. */
function stripLineNumbers(s: string): string | undefined {
  const lines = s.split('\n');
  const re = /^\s*\d+(\t|\s?[|│:]\s?)/;
  if (!lines.filter((l) => l.trim()).every((l) => re.test(l))) return undefined;
  return lines.map((l) => l.replace(re, '')).join('\n');
}

/** Locate oldLines in fileLines comparing trimmed content. Returns start indexes. */
function fuzzyLineMatches(fileLines: string[], oldLines: string[]): number[] {
  const target = oldLines.map((l) => l.trim());
  while (target.length && target[0] === '') target.shift();
  while (target.length && target[target.length - 1] === '') target.pop();
  if (!target.length) return [];
  const out: number[] = [];
  for (let i = 0; i + target.length <= fileLines.length; i++) {
    let ok = true;
    for (let j = 0; j < target.length; j++) {
      if (fileLines[i + j].trim() !== target[j]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

function indentOf(line: string): string {
  return /^\s*/.exec(line)?.[0] ?? '';
}

function closestHint(fileLines: string[], old: string): string {
  const first = old.split('\n').find((l) => l.trim())?.trim();
  if (!first) return '';
  const words = new Set(first.split(/\W+/).filter((w) => w.length > 2));
  let best = -1;
  let bestScore = 0;
  fileLines.forEach((l, i) => {
    const lw = l.split(/\W+/);
    const score = lw.filter((w) => words.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  if (best < 0) return '';
  const s = Math.max(0, best - 3);
  return `\nClosest match is around line ${best + 1}:\n${numberLines(fileLines.slice(s, best + 6), s + 1)}`;
}

export const editFileTool = defineTool({
  name: 'edit_file',
  description:
    'Replace an exact snippet in an existing file. old_string must match the file text exactly (without line-number prefixes) and be unique unless replace_all is true. Read the file first.',
  category: 'write',
  schema: z.object({
    path: z.string().describe('File path relative to the workspace root'),
    old_string: z.string().describe('Exact existing text to replace (include enough surrounding lines to be unique)'),
    new_string: z.string().describe('Replacement text'),
    replace_all: boolArg('Replace every occurrence (default false)').optional(),
  }),
  mutates: true,
  assess: (a, ctx) => {
    let rel = a.path;
    try {
      rel = ctx.guard.resolve(a.path, { write: true }).rel;
    } catch {
      /* reported on execute */
    }
    return { risk: 'write', summary: `Edit ${rel}`, reasons: [], ruleKey: rel };
  },
  async execute(a, ctx) {
    const { abs, rel } = ctx.guard.resolve(a.path, { write: true });
    if (!existsSync(abs)) {
      if (a.old_string === '') {
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, a.new_string);
        ctx.fileState.markWritten(rel, relMtime(abs), true);
        ctx.onFilesChanged([rel]);
        return { ok: true, output: `Created ${rel}.`, data: { path: rel, created: true } };
      }
      return { ok: false, output: `File not found: ${rel}. Use write_file to create it.` };
    }
    const seen = ctx.fileState.lastSeen(rel);
    if (seen === undefined) return { ok: false, output: `Read ${rel} with read_file before editing it.` };
    if (Math.abs(relMtime(abs) - seen) > 1) return { ok: false, output: `${rel} changed since you last read it (possibly by a command). Read it again, then retry the edit.` };
    if (/\[REDACTED(:[\w-]+)?\]/.test(a.new_string)) return { ok: false, output: 'new_string contains a "[REDACTED]" placeholder; secrets are hidden from you and must not be overwritten.' };
    if (a.old_string === '') return { ok: false, output: 'old_string is empty. Provide the exact text to replace, or use write_file to replace the whole file.' };
    if (a.old_string === a.new_string) return { ok: false, output: 'old_string and new_string are identical; nothing to change.' };

    const raw = readFileSync(abs, 'utf8');
    const crlf = raw.includes('\r\n');
    const content = crlf ? raw.replace(/\r\n/g, '\n') : raw;
    let oldStr = a.old_string.replace(/\r\n/g, '\n');
    let newStr = a.new_string.replace(/\r\n/g, '\n');
    let note = '';
    let positions = countOccurrences(content, oldStr);
    if (positions.length === 0) {
      const stripped = stripLineNumbers(oldStr);
      if (stripped !== undefined) {
        const p = countOccurrences(content, stripped);
        if (p.length) {
          oldStr = stripped;
          newStr = stripLineNumbers(newStr) ?? newStr;
          positions = p;
          note = ' (line-number prefixes removed from old_string)';
        }
      }
    }
    let updated: string;
    let firstLine: number;
    if (positions.length > 0) {
      if (positions.length > 1 && !a.replace_all) {
        const lines = positions.map((p) => lineOf(content, p)).join(', ');
        return { ok: false, output: `old_string matches ${positions.length} places (lines ${lines}). Include more surrounding context to make it unique, or set replace_all=true.` };
      }
      firstLine = lineOf(content, positions[0]);
      updated = a.replace_all ? content.split(oldStr).join(newStr) : content.slice(0, positions[0]) + newStr + content.slice(positions[0] + oldStr.length);
    } else {
      // Whitespace-insensitive line match as a last resort.
      const fileLines = content.split('\n');
      const oldLines = oldStr.split('\n');
      const matches = fuzzyLineMatches(fileLines, oldLines);
      if (matches.length !== 1) {
        const why = matches.length > 1 ? `matches ${matches.length} places when ignoring whitespace` : 'was not found in the file';
        return { ok: false, output: `old_string ${why}. Re-read the file and copy the exact text.${matches.length ? '' : closestHint(fileLines, oldStr)}` };
      }
      const start = matches[0];
      const trimmedOld = oldLines.filter((_, i, arr) => {
        const firstNonEmpty = arr.findIndex((l) => l.trim());
        let lastNonEmpty = arr.length - 1;
        while (lastNonEmpty > 0 && !arr[lastNonEmpty].trim()) lastNonEmpty--;
        return i >= firstNonEmpty && i <= lastNonEmpty;
      });
      const count = trimmedOld.length;
      const fileIndent = indentOf(fileLines[start]);
      const oldIndent = indentOf(trimmedOld[0] ?? '');
      const newLines = newStr.split('\n').map((l) => {
        if (!l.trim()) return l;
        if (oldIndent && l.startsWith(oldIndent)) return fileIndent + l.slice(oldIndent.length);
        if (!oldIndent) return fileIndent + l;
        return l;
      });
      fileLines.splice(start, count, ...newLines);
      updated = fileLines.join('\n');
      firstLine = start + 1;
      note = ' (matched ignoring indentation/whitespace differences)';
    }
    const finalText = crlf ? updated.replace(/\n/g, '\r\n') : updated;
    writeFileSync(abs, finalText);
    ctx.fileState.markWritten(rel, relMtime(abs));
    ctx.onFilesChanged([rel]);
    const updatedLines = updated.split('\n');
    const span = newStr.split('\n').length;
    const s = Math.max(1, firstLine - 2);
    const e = Math.min(updatedLines.length, firstLine + span + 1);
    const replacements = a.replace_all ? positions.length || 1 : 1;
    return {
      ok: true,
      output: `Edited ${rel}: ${replacements} replacement${replacements > 1 ? 's' : ''}${note}. Lines ${s}-${e} now:\n${numberLines(updatedLines.slice(s - 1, e), s)}`,
      data: { path: rel, replacements },
    };
  },
});

export const moveFileTool = defineTool({
  name: 'move_file',
  description: 'Rename or move a file or folder within the workspace.',
  category: 'write',
  schema: z.object({
    from: z.string().describe('Existing path'),
    to: z.string().describe('New path'),
    overwrite: boolArg('Replace the destination if it exists (default false)').optional(),
  }),
  mutates: true,
  assess: (a) => ({ risk: a.overwrite ? 'destructive' : 'write', summary: `Move ${a.from} -> ${a.to}`, reasons: a.overwrite ? ['may overwrite the destination'] : [] }),
  async execute(a, ctx) {
    const src = ctx.guard.resolve(a.from, { write: true });
    const dst = ctx.guard.resolve(a.to, { write: true });
    if (src.rel === '.') return { ok: false, output: 'Cannot move the workspace root.' };
    if (!existsSync(src.abs)) return { ok: false, output: `Source not found: ${src.rel}` };
    if (existsSync(dst.abs) && !a.overwrite) return { ok: false, output: `Destination exists: ${dst.rel}. Set overwrite=true to replace it.` };
    mkdirSync(path.dirname(dst.abs), { recursive: true });
    try {
      renameSync(src.abs, dst.abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
      cpSync(src.abs, dst.abs, { recursive: true });
      rmSync(src.abs, { recursive: true, force: true });
    }
    ctx.fileState.forget(src.rel);
    ctx.onFilesChanged([src.rel, dst.rel]);
    return { ok: true, output: `Moved ${src.rel} -> ${dst.rel}.`, data: { from: src.rel, to: dst.rel } };
  },
});

export const deleteFileTool = defineTool({
  name: 'delete_file',
  description: 'Delete a file (or a folder with recursive=true). Always requires user confirmation; changes can be undone from checkpoints.',
  category: 'write',
  schema: z.object({
    path: z.string().describe('Path relative to the workspace root'),
    recursive: boolArg('Required to delete a folder').optional(),
  }),
  mutates: true,
  assess: (a) => ({ risk: 'destructive', summary: `Delete ${a.path}${a.recursive ? ' (recursive)' : ''}`, reasons: ['deletes files'], alwaysAsk: true, ruleKey: a.path }),
  async execute(a, ctx: ToolContext) {
    const { abs, rel } = ctx.guard.resolve(a.path, { write: true });
    if (rel === '.') return { ok: false, output: 'Refusing to delete the workspace root.' };
    if (!existsSync(abs)) return { ok: false, output: `Not found: ${rel}` };
    const isDir = statSync(abs).isDirectory();
    if (isDir && !a.recursive) return { ok: false, output: `${rel} is a folder; set recursive=true to delete it.` };
    rmSync(abs, { recursive: isDir, force: true });
    ctx.fileState.forget(rel);
    ctx.onFilesChanged([rel]);
    return { ok: true, output: `Deleted ${rel}${isDir ? '/' : ''}.`, data: { path: rel, directory: isDir } };
  },
});
