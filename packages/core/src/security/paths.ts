import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { LocalCodeError } from '../util/errors.js';

const SENSITIVE_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.[^/]*)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks|asc|gpg|ppk)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/)\.(npmrc|pypirc|netrc|git-credentials|htpasswd|pgpass)$/i,
  /(^|\/)(credentials|secrets?)(\.[a-z0-9]+)?$/i,
  /(^|\/)\.aws\/|(^|\/)\.ssh\/|(^|\/)\.gnupg\//i,
  /(^|\/)(service[-_]?account|gcloud|firebase-adminsdk)[^/]*\.json$/i,
];
const SAFE_ENV_TEMPLATES = /(^|\/)\.env\.(example|sample|template|dist|defaults)$/i;

export function isSensitivePath(rel: string): boolean {
  const p = rel.replace(/\\/g, '/');
  if (SAFE_ENV_TEMPLATES.test(p)) return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(p));
}

const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
const norm = (p: string) => (caseInsensitive ? p.toLowerCase() : p);

/** True when `child` equals `parent` or is inside it. */
export function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(norm(parent), norm(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export interface ResolvedPath {
  abs: string;
  /** Workspace-relative path using forward slashes ('.' for the root). */
  rel: string;
}

/**
 * Validates every path the agent touches against the selected workspace:
 * prevents traversal (../), absolute paths elsewhere, symlink escapes, and
 * writes into version-control internals.
 */
export class WorkspaceGuard {
  readonly root: string;

  constructor(root: string) {
    const abs = path.resolve(root);
    if (!existsSync(abs)) throw new LocalCodeError('not_found', `Workspace does not exist: ${abs}`);
    this.root = realpathSync(abs);
  }

  resolve(input: string, opts: { write?: boolean } = {}): ResolvedPath {
    if (typeof input !== 'string' || input.trim() === '') throw new LocalCodeError('invalid_argument', 'Path must be a non-empty string');
    if (input.includes('\0')) throw new LocalCodeError('invalid_argument', 'Path contains a null byte');
    let p = input.trim();
    // Models sometimes write "./x", "/x" meaning workspace-relative, or prefix with the workspace name.
    if (p.startsWith('~')) throw new LocalCodeError('permission_denied', `Path "${input}" is outside the workspace`);
    const abs = path.isAbsolute(p) ? path.normalize(p) : path.resolve(this.root, p);
    if (!isWithin(this.root, abs)) {
      // Treat "/src/x.ts" as workspace-relative when it does not exist as an absolute path.
      if (path.isAbsolute(p) && !existsSync(abs)) {
        const alt = path.resolve(this.root, p.replace(/^[/\\]+/, ''));
        if (isWithin(this.root, alt)) return this.check(alt, input, opts);
      }
      throw new LocalCodeError('permission_denied', `Path "${input}" is outside the workspace (${this.root})`);
    }
    return this.check(abs, input, opts);
  }

  private check(abs: string, input: string, opts: { write?: boolean }): ResolvedPath {
    // Resolve symlinks on the nearest existing ancestor so links cannot escape the workspace.
    let probe = abs;
    while (!existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
    let real: string;
    try {
      real = realpathSync(probe);
    } catch {
      real = probe;
    }
    if (!isWithin(this.root, real)) {
      throw new LocalCodeError('permission_denied', `Path "${input}" resolves outside the workspace via a symbolic link`);
    }
    const rel = this.toRel(abs);
    if (opts.write) {
      const segments = rel.split('/');
      if (segments.includes('.git')) {
        throw new LocalCodeError('permission_denied', `Refusing to modify version-control internals: ${rel}`);
      }
    }
    return { abs, rel };
  }

  toRel(abs: string): string {
    const rel = path.relative(this.root, abs).split(path.sep).join('/');
    return rel === '' ? '.' : rel;
  }
}
