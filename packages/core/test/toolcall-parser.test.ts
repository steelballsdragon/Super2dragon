import { describe, expect, it } from 'vitest';
import { ToolCallStreamFilter, extractToolCalls, looksLikeSchemaEcho, parseJsonLenient } from '../src/models/toolcall-parser.js';
import { renderToolInstructions, toPromptedMessages } from '../src/models/adapter.js';

const TOOLS = ['read_file', 'write_file', 'run_command', 'edit_file'];

describe('parseJsonLenient', () => {
  it('parses valid JSON', () => {
    expect(parseJsonLenient('{"a": 1}')).toEqual({ a: 1 });
  });
  it('repairs trailing commas, single quotes, python literals and raw newlines', () => {
    expect(parseJsonLenient("{'path': 'a.txt', 'force': True, 'x': None,}")).toEqual({ path: 'a.txt', force: true, x: null });
    expect(parseJsonLenient('{"content": "line1\nline2"}')).toEqual({ content: 'line1\nline2' });
  });
  it('closes unterminated objects (generation cut off)', () => {
    expect(parseJsonLenient('{"name": "read_file", "arguments": {"path": "a.js"')).toEqual({ name: 'read_file', arguments: { path: 'a.js' } });
  });
  it('keeps apostrophes inside double-quoted strings', () => {
    expect(parseJsonLenient('{"msg": "it\'s fine",}')).toEqual({ msg: "it's fine" });
  });
  it('returns undefined for garbage', () => {
    expect(parseJsonLenient('not json at all')).toBeUndefined();
  });
});

describe('extractToolCalls', () => {
  it('parses Hermes/Qwen <tool_call> blocks and strips them from text', () => {
    const text = 'Let me look.\n<tool_call>\n{"name": "read_file", "arguments": {"path": "src/a.ts"}}\n</tool_call>';
    const r = extractToolCalls(text, TOOLS);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toMatchObject({ name: 'read_file', arguments: { path: 'src/a.ts' }, salvaged: true });
    expect(r.cleanedText).toBe('Let me look.');
  });

  it('parses several calls and unterminated final block', () => {
    const text = '<tool_call>{"name":"read_file","arguments":{"path":"a"}}</tool_call>\n<tool_call>{"name":"read_file","arguments":{"path":"b"}}';
    expect(extractToolCalls(text, TOOLS).calls.map((c) => c.arguments.path)).toEqual(['a', 'b']);
  });

  it('parses fenced JSON blocks (what qwen2.5-coder:1.5b actually emits)', () => {
    const text = '```json\n{\n  "name": "run_command",\n  "arguments": {"command": "npm test"}\n}\n```';
    const r = extractToolCalls(text, TOOLS);
    expect(r.calls[0]).toMatchObject({ name: 'run_command', arguments: { command: 'npm test' } });
    expect(r.cleanedText).toBe('');
  });

  it('parses OpenAI-style nested function objects and stringified arguments', () => {
    const text = '{"type":"function","function":{"name":"read_file","arguments":"{\\"path\\": \\"x.py\\"}"}}';
    expect(extractToolCalls(text, TOOLS).calls[0]).toMatchObject({ name: 'read_file', arguments: { path: 'x.py' } });
  });

  it('parses Mistral [TOOL_CALLS] arrays and Llama python_tag', () => {
    expect(extractToolCalls('[TOOL_CALLS] [{"name": "read_file", "arguments": {"path": "m"}}]', TOOLS).calls[0].arguments.path).toBe('m');
    expect(extractToolCalls('<|python_tag|>{"name": "read_file", "parameters": {"path": "l"}}<|eom_id|>', TOOLS).calls[0].arguments.path).toBe('l');
  });

  it('parses <function=name> syntax', () => {
    const r = extractToolCalls('<function=run_command>{"command": "ls"}</function>', TOOLS);
    expect(r.calls[0]).toMatchObject({ name: 'run_command', arguments: { command: 'ls' } });
  });

  it('accepts inline arguments and alternative key names', () => {
    expect(extractToolCalls('{"tool": "read_file", "path": "inline.txt"}', TOOLS).calls[0].arguments).toEqual({ path: 'inline.txt' });
    expect(extractToolCalls('{"name": "read_file", "args": {"path": "z"}}', TOOLS).calls[0].arguments).toEqual({ path: 'z' });
  });

  it('ignores JSON that does not name a known tool', () => {
    const text = 'Here is the config:\n```json\n{"name": "my-package", "version": "1.0.0"}\n```';
    const r = extractToolCalls(text, TOOLS);
    expect(r.calls).toHaveLength(0);
    expect(r.cleanedText).toBe(text);
  });

  it('matches tool names case-insensitively', () => {
    expect(extractToolCalls('<tool_call>{"name": "Read_File", "arguments": {"path": "q"}}</tool_call>', TOOLS).calls[0].name).toBe('read_file');
  });

  it('records unparseable argument strings as parse errors', () => {
    const r = extractToolCalls('<tool_call>{"name": "read_file", "arguments": "path=oops"}</tool_call>', TOOLS);
    expect(r.calls[0].parseError).toBe('path=oops');
  });
});

describe('looksLikeSchemaEcho', () => {
  it('detects arguments that copy the JSON schema', () => {
    expect(looksLikeSchemaEcho({ path: { type: 'string', description: 'workspace-relative path' } })).toBe(true);
    expect(looksLikeSchemaEcho({ path: 'src/a.ts' })).toBe(false);
  });
});

describe('ToolCallStreamFilter', () => {
  it('passes normal text and hides tool-call markup even when split across chunks', () => {
    const f = new ToolCallStreamFilter();
    let out = '';
    for (const chunk of ['I will read ', 'the file.\n<to', 'ol_call>\n{"name": "read_file"', '}\n</tool_call>']) out += f.push(chunk);
    out += f.flush();
    expect(out).toBe('I will read the file.\n');
  });
  it('does not hold back text that merely starts with "<"', () => {
    const f = new ToolCallStreamFilter();
    expect(f.push('a < b and <div>')).toBe('a < b and <div>');
  });
});

describe('prompted mode conversion', () => {
  const specs = [
    {
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'file path' }, limit: { type: 'integer' } }, required: ['path'] },
    },
  ];
  it('renders compact signatures', () => {
    const text = renderToolInstructions(specs);
    expect(text).toContain('- read_file(path: string, limit?: integer): Read a file');
    expect(text).toContain('<tool_call>');
  });
  it('turns tool calls/results into plain text turns and merges consecutive user content', () => {
    const msgs = toPromptedMessages(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'go' },
        { role: 'assistant', content: 'ok', toolCalls: [{ id: '1', name: 'read_file', arguments: { path: 'a' } }] },
        { role: 'tool', content: 'A', toolCallId: '1', toolName: 'read_file' },
        { role: 'tool', content: 'B', toolCallId: '2', toolName: 'read_file' },
      ],
      specs,
    );
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[0].content).toContain('Available tools');
    expect(msgs[2].content).toContain('<tool_call>\n{"name":"read_file","arguments":{"path":"a"}}\n</tool_call>');
    expect(msgs[3].content).toContain('<tool_result name="read_file">\nA\n</tool_result>');
    expect(msgs[3].content).toContain('B');
  });
});
