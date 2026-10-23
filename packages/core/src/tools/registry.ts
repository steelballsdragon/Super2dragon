import { z } from 'zod';
import { looksLikeSchemaEcho } from '../models/toolcall-parser.js';
import type { ToolSpec } from '../models/types.js';
import { normalizeArgs } from './args.js';
import { editFileTool, deleteFileTool, listFilesTool, moveFileTool, readFileTool, writeFileTool } from './fs-tools.js';
import { gitCommitTool, gitDiffTool, gitStatusTool } from './git-tools.js';
import { inspectErrorsTool, processTool, runCommandTool, runTestsTool } from './exec-tools.js';
import { undoChangesTool, updatePlanTool } from './meta-tools.js';
import { searchCodeTool } from './search-tools.js';
import type { ToolDefinition } from './types.js';

export const ALL_TOOLS: ToolDefinition[] = [
  listFilesTool,
  readFileTool,
  searchCodeTool,
  writeFileTool,
  editFileTool,
  moveFileTool,
  deleteFileTool,
  runCommandTool,
  runTestsTool,
  inspectErrorsTool,
  processTool,
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  undoChangesTool,
  updatePlanTool,
] as ToolDefinition[];

function cleanSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(cleanSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === '$schema' || k === 'additionalProperties' || k === 'minimum' && v === Number.MIN_SAFE_INTEGER || k === 'maximum' && v === Number.MAX_SAFE_INTEGER) continue;
    out[k] = cleanSchema(v);
  }
  return out;
}

export function toolSpec(tool: ToolDefinition): ToolSpec {
  const schema = cleanSchema(z.toJSONSchema(tool.schema, { io: 'input', unrepresentable: 'any' })) as Record<string, unknown>;
  if (schema.type !== 'object') schema.type = 'object';
  schema.properties ??= {};
  return { name: tool.name, description: tool.description, parameters: schema };
}

export class ToolRegistry {
  private readonly byName = new Map<string, ToolDefinition>();
  private readonly specs = new Map<string, ToolSpec>();

  constructor(tools: ToolDefinition[] = ALL_TOOLS) {
    for (const t of tools) {
      this.byName.set(t.name, t);
      this.specs.set(t.name, toolSpec(t));
    }
  }

  get names(): string[] {
    return [...this.byName.keys()];
  }

  get(name: string): ToolDefinition | undefined {
    return this.byName.get(name);
  }

  toolSpecs(filter?: (t: ToolDefinition) => boolean): ToolSpec[] {
    return [...this.byName.values()].filter((t) => !filter || filter(t)).map((t) => this.specs.get(t.name)!);
  }

  /**
   * Validate and coerce model-supplied arguments. Errors are phrased so the
   * model can correct its next call.
   */
  validate(name: string, rawArgs: Record<string, unknown>): { ok: true; args: unknown } | { ok: false; error: string } {
    const tool = this.byName.get(name);
    if (!tool) {
      return { ok: false, error: `Unknown tool "${name}". Available tools: ${this.names.join(', ')}.` };
    }
    const spec = this.specs.get(name)!;
    const keys = Object.keys((spec.parameters.properties ?? {}) as object);
    const args = normalizeArgs(rawArgs ?? {}, keys);
    const parsed = tool.schema.safeParse(args);
    if (parsed.success) return { ok: true, args: parsed.data };
    if (looksLikeSchemaEcho(args)) {
      return {
        ok: false,
        error: `Invalid arguments for ${name}: you sent the parameter schema instead of values. Call it like {"name": "${name}", "arguments": {${keys
          .slice(0, 2)
          .map((k) => `"${k}": <value>`)
          .join(', ')}}}.`,
      };
    }
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.length ? i.path.join('.') : '(arguments)'}: ${i.message}`)
      .join('; ');
    const required = ((spec.parameters.required as string[]) ?? []).join(', ');
    return { ok: false, error: `Invalid arguments for ${name}: ${issues}. Required: ${required || 'none'}. Received keys: ${Object.keys(rawArgs ?? {}).join(', ') || 'none'}.` };
  }
}
