import { newId } from '../util/ids.js';
import type { ToolCall } from './types.js';

/**
 * Parses tool calls that a model wrote as text. Many local models (or chat
 * templates) do not emit structured tool calls even when the server says the
 * model "supports tools", so the adapter recovers calls from the common text
 * formats instead of silently dropping them.
 */

export interface ParsedToolCalls {
  calls: ToolCall[];
  /** The text with the recognised tool-call spans removed. */
  cleanedText: string;
}

/** Repair common JSON mistakes made by small models and parse. Returns undefined if hopeless. */
export function parseJsonLenient(input: string): unknown {
  const text = input.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    /* try repairs */
  }
  let s = text
    .replace(/^```[a-zA-Z_]*\s*/, '')
    .replace(/```\s*$/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  s = repairStrings(s);
  s = s.replace(/,\s*([}\]])/g, '$1');
  s = replaceOutsideStrings(s, /\bTrue\b/g, 'true');
  s = replaceOutsideStrings(s, /\bFalse\b/g, 'false');
  s = replaceOutsideStrings(s, /\bNone\b/g, 'null');
  s = balanceBrackets(s);
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * Walk the text converting single-quoted strings to double-quoted ones and
 * escaping raw control characters inside strings.
 */
function repairStrings(s: string): string {
  let out = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\' && i + 1 < s.length) {
        const next = s[i + 1];
        if (quote === "'" && next === "'") {
          out += "'";
        } else {
          out += ch + next;
        }
        i++;
        continue;
      }
      if (ch === quote) {
        out += '"';
        quote = null;
        continue;
      }
      if (ch === '"' && quote === "'") {
        out += '\\"';
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      // Only treat ' as a quote when it plausibly starts a JSON string/key.
      if (ch === "'") {
        const prev = out.trimEnd().slice(-1);
        if (!['{', '[', ',', ':', ''].includes(prev)) {
          out += ch;
          continue;
        }
      }
      quote = ch;
      out += '"';
      continue;
    }
    out += ch;
  }
  if (quote) out += '"';
  return out;
}

function replaceOutsideStrings(s: string, re: RegExp, replacement: string): string {
  const parts: string[] = [];
  let inStr = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && inStr) {
      i++;
      continue;
    }
    if (s[i] === '"') {
      if (!inStr) {
        parts.push(s.slice(start, i).replace(re, replacement));
        start = i;
      } else {
        parts.push(s.slice(start, i + 1));
        start = i + 1;
      }
      inStr = !inStr;
    }
  }
  const rest = s.slice(start);
  parts.push(inStr ? rest : rest.replace(re, replacement));
  return parts.join('');
}

function balanceBrackets(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack[stack.length - 1] === ch) stack.pop();
  }
  return s + stack.reverse().join('');
}

/** Find top-level balanced JSON objects/arrays in free text. */
export function findJsonSpans(text: string, open: '{' | '[' = '{'): { start: number; end: number }[] {
  const close = open === '{' ? '}' : ']';
  const spans: { start: number; end: number }[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(open, i);
    if (start < 0) break;
    let depth = 0;
    let inStr = false;
    let end = -1;
    for (let j = start; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (ch === '\\') j++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end < 0) {
      // Unterminated (e.g. generation hit the token limit): take the rest.
      spans.push({ start, end: text.length });
      break;
    }
    spans.push({ start, end });
    i = end;
  }
  return spans;
}

const NAME_KEYS = ['name', 'tool', 'tool_name', 'function', 'action'];
const ARG_KEYS = ['arguments', 'parameters', 'args', 'input', 'tool_input', 'action_input', 'params'];

function normalizeCall(raw: unknown, toolNames: Map<string, string>): ToolCall | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let obj = raw as Record<string, unknown>;
  if (obj.function && typeof obj.function === 'object') {
    obj = obj.function as Record<string, unknown>;
  }
  let name: string | undefined;
  for (const k of NAME_KEYS) {
    if (typeof obj[k] === 'string') {
      name = obj[k] as string;
      break;
    }
  }
  if (!name) return null;
  const canonical = toolNames.get(name.toLowerCase()) ?? toolNames.get(name.toLowerCase().replace(/[-\s]/g, '_'));
  if (!canonical) return null;
  let args: unknown;
  for (const k of ARG_KEYS) {
    if (k in obj) {
      args = obj[k];
      break;
    }
  }
  if (args === undefined) {
    // {"name": "read_file", "path": "x"} - arguments written inline.
    args = Object.fromEntries(Object.entries(obj).filter(([k]) => !NAME_KEYS.includes(k) && k !== 'id' && k !== 'type'));
  }
  let parseError: string | undefined;
  if (typeof args === 'string') {
    const parsed = args.trim() ? parseJsonLenient(args) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed;
    else {
      parseError = args;
      args = {};
    }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
  return {
    id: newId('call_'),
    name: canonical,
    arguments: args as Record<string, unknown>,
    salvaged: true,
    ...(parseError ? { parseError } : {}),
  };
}

function callsFromJsonText(jsonText: string, toolNames: Map<string, string>): ToolCall[] {
  const parsed = parseJsonLenient(jsonText);
  if (parsed === undefined) return [];
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const calls: ToolCall[] = [];
  for (const item of list) {
    const c = normalizeCall(item, toolNames);
    if (c) calls.push(c);
  }
  return calls;
}

export function extractToolCalls(text: string, toolNamesList: Iterable<string>): ParsedToolCalls {
  const toolNames = new Map<string, string>();
  for (const n of toolNamesList) toolNames.set(n.toLowerCase(), n);
  if (!text || toolNames.size === 0) return { calls: [], cleanedText: text ?? '' };

  const calls: ToolCall[] = [];
  const removed: { start: number; end: number }[] = [];
  const take = (start: number, end: number, found: ToolCall[]) => {
    if (found.length === 0) return;
    calls.push(...found);
    removed.push({ start, end });
  };

  // 1. Explicit markers.
  const markerPatterns: RegExp[] = [
    /<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g,
    /<\|tool_call\|>\s*([\s\S]*?)\s*(?:<\|\/tool_call\|>|<\|end\|>|$)/g,
    /<tools>\s*([\s\S]*?)\s*(?:<\/tools>|$)/g,
    /\[TOOL_CALLS\]\s*(\[[\s\S]*?\])(?=\s*$|\s*\n\n)/g,
    /<\|python_tag\|>\s*([\s\S]*?)\s*(?:<\|eom_id\|>|<\|eot_id\|>|$)/g,
  ];
  for (const re of markerPatterns) {
    for (const m of text.matchAll(re)) {
      const inner = m[1];
      let found = callsFromJsonText(inner, toolNames);
      if (found.length === 0) {
        // Several JSON objects inside one marker.
        found = findJsonSpans(inner).flatMap((s) => callsFromJsonText(inner.slice(s.start, s.end), toolNames));
      }
      take(m.index!, m.index! + m[0].length, found);
    }
  }
  // <function=name>{...}</function>
  for (const m of text.matchAll(/<function=([\w.-]+)>\s*([\s\S]*?)\s*(?:<\/function>|$)/g)) {
    const found = callsFromJsonText(JSON.stringify({ name: m[1], arguments: parseJsonLenient(m[2]) ?? {} }), toolNames);
    take(m.index!, m.index! + m[0].length, found);
  }

  // 2. Fenced code blocks containing a JSON tool call.
  if (calls.length === 0) {
    for (const m of text.matchAll(/```[ \t]*([a-zA-Z_]*)[ \t]*\n([\s\S]*?)(?:```|$)/g)) {
      const lang = m[1].toLowerCase();
      if (lang && !['json', 'json5', 'tool_call', 'tool', 'tool_code', 'javascript', 'js'].includes(lang)) continue;
      take(m.index!, m.index! + m[0].length, callsFromJsonText(m[2], toolNames));
    }
  }

  // 3. The whole message is JSON, or contains bare JSON objects naming a tool.
  if (calls.length === 0) {
    const trimmed = text.trim();
    if (trimmed.startsWith('[')) {
      const offset = text.indexOf(trimmed);
      take(offset, offset + trimmed.length, callsFromJsonText(trimmed, toolNames));
    }
  }
  if (calls.length === 0) {
    for (const span of findJsonSpans(text)) {
      const slice = text.slice(span.start, span.end);
      if (!/"(name|tool|function|action)"\s*:/.test(slice) && !/'(name|tool|function)'\s*:/.test(slice)) continue;
      take(span.start, span.end, callsFromJsonText(slice, toolNames));
    }
  }

  if (calls.length === 0) return { calls: [], cleanedText: text };
  removed.sort((a, b) => a.start - b.start);
  let cleaned = '';
  let pos = 0;
  for (const r of removed) {
    if (r.start < pos) continue;
    cleaned += text.slice(pos, r.start);
    pos = r.end;
  }
  cleaned += text.slice(pos);
  return { calls, cleanedText: cleaned.replace(/\n{3,}/g, '\n\n').trim() };
}

/**
 * Detects whether arguments look like the model echoed the JSON schema instead
 * of providing values (e.g. {"path": {"type": "string", ...}}).
 */
export function looksLikeSchemaEcho(args: Record<string, unknown>): boolean {
  const values = Object.values(args);
  if (values.length === 0) return false;
  return values.every(
    (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && 'type' in (v as object) && ('description' in (v as object) || Object.keys(v as object).length <= 3),
  );
}

/**
 * Streaming filter used in prompted mode: passes ordinary text through and
 * withholds anything from a tool-call marker onwards, so the UI does not show
 * raw tool-call JSON while it streams.
 */
export class ToolCallStreamFilter {
  private buffer = '';
  private suppressed = false;
  private static readonly MARKERS = ['<tool_call>', '<function=', '<|python_tag|>', '[TOOL_CALLS]'];

  push(text: string): string {
    if (this.suppressed) return '';
    this.buffer += text;
    for (const marker of ToolCallStreamFilter.MARKERS) {
      const idx = this.buffer.indexOf(marker);
      if (idx >= 0) {
        const out = this.buffer.slice(0, idx);
        this.buffer = '';
        this.suppressed = true;
        return out;
      }
    }
    // Hold back a possible partial marker at the end of the buffer.
    let hold = 0;
    for (const marker of ToolCallStreamFilter.MARKERS) {
      for (let len = Math.min(marker.length - 1, this.buffer.length); len > 0; len--) {
        if (this.buffer.endsWith(marker.slice(0, len))) {
          hold = Math.max(hold, len);
          break;
        }
      }
    }
    const out = this.buffer.slice(0, this.buffer.length - hold);
    this.buffer = this.buffer.slice(this.buffer.length - hold);
    return out;
  }

  flush(): string {
    if (this.suppressed) return '';
    const out = this.buffer;
    this.buffer = '';
    return out;
  }
}
