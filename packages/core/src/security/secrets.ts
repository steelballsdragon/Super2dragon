/**
 * Keeps credentials away from the model: environment scrubbing for spawned
 * processes and redaction of secret-looking values in any text we send back.
 */

const SECRET_ENV_NAME = /(SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|API[_-]?KEY|APIKEY|PRIVATE[_-]?KEY|CREDENTIAL|ACCESS[_-]?KEY|AUTH|SESSION[_-]?KEY|CLIENT[_-]?SECRET|COOKIE|DSN|CONNECTION[_-]?STRING|DATABASE_URL|WEBHOOK)/i;
/** Variables that look sensitive by name but are needed by common tooling and hold no secrets. */
const ENV_NAME_ALLOW = new Set(['SSH_AUTH_SOCK', 'GPG_TTY', 'XAUTHORITY', 'COLORTERM']);

export function isSecretEnvName(name: string): boolean {
  return SECRET_ENV_NAME.test(name) && !ENV_NAME_ALLOW.has(name);
}

/** Copy of the environment with secret-looking variables removed. */
export function scrubEnv(env: NodeJS.ProcessEnv, passthrough: string[] = []): NodeJS.ProcessEnv {
  const keep = new Set(passthrough);
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (isSecretEnvName(k) && !keep.has(k)) continue;
    out[k] = v;
  }
  return out;
}

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'private-key', re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g },
  { name: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { name: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'openai-key', re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'stripe-key', re: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{20,}\b/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'url-credentials', re: /\b([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]+):([^@/\s]{3,})@/gi },
];

const SECRET_KEY = String.raw`(?:[A-Za-z_][A-Za-z0-9_.-]*?)?(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|APIKEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET)[A-Za-z0-9_]*`;
/** .env style lines: `API_KEY=abc123` (optionally prefixed with export). */
const ENV_LINE = new RegExp(String.raw`^(\s*(?:export\s+)?${SECRET_KEY}\s*=\s*)(["']?)([^\s"'#$][^\s"'#]{3,})\2`, 'gim');
/** Quoted string literals assigned to secret-looking keys: `password: "hunter22"`. */
const QUOTED_LITERAL = new RegExp(String.raw`(\b${SECRET_KEY}["']?\s*[:=]\s*)(["'])([^\s"'$]{8,})\2`, 'gi');

export class SecretRedactor {
  private literals: string[] = [];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    for (const [k, v] of Object.entries(env)) {
      if (v && v.length >= 8 && isSecretEnvName(k)) this.literals.push(v);
    }
    // Longest first so overlapping values are fully replaced.
    this.literals.sort((a, b) => b.length - a.length);
  }

  redact(text: string): { text: string; count: number } {
    if (!text) return { text, count: 0 };
    let count = 0;
    let out = text;
    for (const lit of this.literals) {
      if (out.includes(lit)) {
        out = out.split(lit).join('[REDACTED]');
        count++;
      }
    }
    for (const { name, re } of PATTERNS) {
      out = out.replace(re, (...m: string[]) => {
        count++;
        if (name === 'url-credentials') return `${m[1]}${m[2]}:[REDACTED]@`;
        return `[REDACTED:${name}]`;
      });
    }
    out = out.replace(ENV_LINE, (_m, prefix: string, q: string) => {
      count++;
      return `${prefix}${q}[REDACTED]${q}`;
    });
    out = out.replace(QUOTED_LITERAL, (m, prefix: string, q: string, value: string) => {
      if (/^\[REDACTED|^(x+|\*+|<.*>|changeme|placeholder|your[-_].*)$/i.test(value)) return m;
      count++;
      return `${prefix}${q}[REDACTED]${q}`;
    });
    return { text: out, count };
  }
}
