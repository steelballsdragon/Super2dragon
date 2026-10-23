import { RISK_LEVELS, type RiskLevel } from './commands.js';

/**
 * strict:      read-only by default - every write, command, test run or commit needs approval.
 * standard:    reads, in-workspace file edits (checkpointed) and build/test commands run freely;
 *              other commands, network, destructive and privileged operations ask.
 * autonomous:  everything inside the workspace runs, but network access (e.g. installing
 *              dependencies), destructive and privileged operations still ask.
 */
export type PermissionMode = 'strict' | 'standard' | 'autonomous';
export const PERMISSION_MODES: PermissionMode[] = ['strict', 'standard', 'autonomous'];

export type Decision = 'allow' | 'ask' | 'deny';
export type ApprovalAnswer = 'allow_once' | 'allow_always' | 'deny';

export interface PermissionRequest {
  tool: string;
  risk: RiskLevel;
  summary: string;
  reasons: string[];
  /** Command prefix or path used to match "always allow" rules. */
  ruleKey?: string;
  /** Reading a credentials-like file. */
  sensitive?: boolean;
  /** Tool always asks (delete, commit) unless an explicit rule allows it. */
  alwaysAsk?: boolean;
  /** Never allowed. */
  blocked?: string;
}

export interface PermissionRule {
  id: string;
  workspaceId: string;
  tool: string;
  /** Command prefix for run_command/run_tests, '*' for any invocation of the tool. */
  pattern: string;
  createdAt: string;
}

export interface PermissionVerdict {
  decision: Decision;
  reason: string;
}

const rank = (r: RiskLevel) => RISK_LEVELS.indexOf(r);

export function ruleMatches(rule: PermissionRule, req: PermissionRequest): boolean {
  if (rule.tool !== req.tool && rule.tool !== '*') return false;
  if (rule.pattern === '*') return true;
  const key = (req.ruleKey ?? '').trim();
  return key === rule.pattern || key.startsWith(`${rule.pattern} `);
}

export function decide(mode: PermissionMode, req: PermissionRequest, rules: PermissionRule[] = []): PermissionVerdict {
  if (req.blocked) return { decision: 'deny', reason: `Blocked: ${req.blocked}` };
  const ruled = rules.find((r) => ruleMatches(r, req));
  if (ruled && req.risk !== 'privileged') return { decision: 'allow', reason: `Allowed by rule "${ruled.tool}: ${ruled.pattern}"` };
  if (req.sensitive) return { decision: 'ask', reason: 'Accesses a file that may contain credentials' };
  if (req.alwaysAsk) return { decision: 'ask', reason: `${req.tool} always requires confirmation` };
  if (req.risk === 'privileged') return { decision: 'ask', reason: 'Privileged operation' };

  switch (mode) {
    case 'strict':
      return req.risk === 'read'
        ? { decision: 'allow', reason: 'Read-only operation' }
        : { decision: 'ask', reason: 'Strict mode: approval required for every write or command' };
    case 'standard':
      if (rank(req.risk) <= rank('write')) return { decision: 'allow', reason: `Standard mode allows ${req.risk} operations` };
      return { decision: 'ask', reason: describe(req.risk) };
    case 'autonomous':
      if (rank(req.risk) <= rank('execute')) return { decision: 'allow', reason: `Autonomous mode allows ${req.risk} operations` };
      return { decision: 'ask', reason: describe(req.risk) };
  }
}

function describe(risk: RiskLevel): string {
  switch (risk) {
    case 'execute':
      return 'Runs a program that is not a known read-only, build or test command';
    case 'network':
      return 'Uses the network (downloads, installs or contacts a remote)';
    case 'destructive':
      return 'Potentially destructive operation';
    case 'privileged':
      return 'Privileged operation';
    default:
      return `${risk} operation`;
  }
}
