import { z } from 'zod';

/** Small models often send numbers and booleans as strings; accept both. */
export const intArg = (desc: string) =>
  z.preprocess((v) => (typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v), z.number().int()).describe(desc);

export const boolArg = (desc: string) =>
  z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean()).describe(desc);

/** Common alternative argument names used by models, mapped to our canonical names. */
const ALIASES: Record<string, string[]> = {
  path: ['file_path', 'filepath', 'filename', 'file', 'file_name', 'target', 'dir', 'directory', 'folder'],
  command: ['cmd', 'shell_command', 'script', 'commandLine'],
  old_string: ['old_str', 'old', 'search', 'find', 'old_text', 'original', 'before'],
  new_string: ['new_str', 'new', 'replace', 'replacement', 'new_text', 'after'],
  content: ['contents', 'text', 'code', 'data', 'body', 'file_content'],
  query: ['pattern', 'search', 'term', 'q', 'keyword', 'text'],
  from: ['source', 'src', 'old_path', 'from_path'],
  to: ['destination', 'dest', 'dst', 'new_path', 'to_path'],
  message: ['msg', 'commit_message'],
  items: ['plan', 'steps', 'tasks', 'todos'],
};

/** Rename aliased argument keys to the names the schema expects (only when the canonical key is absent). */
export function normalizeArgs(args: Record<string, unknown>, schemaKeys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  for (const key of schemaKeys) {
    if (key in out) continue;
    for (const alias of ALIASES[key] ?? []) {
      if (alias in out && !schemaKeys.includes(alias)) {
        out[key] = out[alias];
        delete out[alias];
        break;
      }
    }
  }
  return out;
}
