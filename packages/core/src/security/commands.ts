import path from 'node:path';

/**
 * Risk levels, lowest to highest. The permission engine maps a level plus the
 * active permission mode to allow / ask / deny.
 */
export const RISK_LEVELS = ['read', 'build', 'write', 'execute', 'network', 'destructive', 'privileged'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_LEVELS.indexOf(a) >= RISK_LEVELS.indexOf(b) ? a : b;
}

export interface CommandAssessment {
  level: RiskLevel;
  reasons: string[];
  /** Hard-blocked: never run, regardless of mode or approval. */
  blocked?: string;
  /** Leading program + subcommand, used for "always allow" rules (e.g. "npm test"). */
  prefix: string;
  segments: string[][];
}

/** Split a command line into simple-command argv lists, honouring quotes. */
export function tokenizeCommand(command: string): { segments: string[][]; hasSubstitution: boolean; redirects: string[] } {
  const segments: string[][] = [];
  const redirects: string[] = [];
  let current: string[] = [];
  let word = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;
  let hasSubstitution = false;
  let pendingRedirect = false;

  const endWord = () => {
    if (inWord) {
      if (pendingRedirect) {
        redirects.push(word);
        pendingRedirect = false;
      } else current.push(word);
    }
    word = '';
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    if (current.length) segments.push(current);
    current = [];
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else {
        if (quote === '"' && (ch === '`' || (ch === '$' && command[i + 1] === '('))) hasSubstitution = true;
        word += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
      continue;
    }
    if (ch === '\\' && i + 1 < command.length) {
      word += command[++i];
      inWord = true;
      continue;
    }
    if (ch === '`' || (ch === '$' && command[i + 1] === '(')) {
      hasSubstitution = true;
      // Treat the substituted command as its own segment boundary.
      endSegment();
      if (ch === '$') i++;
      continue;
    }
    if (ch === ')') {
      endSegment();
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&' || ch === '(' || ch === '{' || ch === '}') {
      // `2>&1` and `&>` are redirections, not control operators.
      if (ch === '&' && (command[i - 1] === '>' || command[i + 1] === '>')) {
        word += ch;
        inWord = true;
        continue;
      }
      endSegment();
      continue;
    }
    if (ch === '>' || ch === '<') {
      const fdPrefix = /^\d*$/.test(word);
      if (fdPrefix) {
        word = '';
        inWord = false;
      } else endWord();
      if (ch === '>') {
        while (command[i + 1] === '>' || command[i + 1] === '|') i++;
        if (command[i + 1] === '&') {
          // >&2 duplicates a descriptor; nothing is written to disk.
          i++;
          while (/[0-9-]/.test(command[i + 1] ?? '')) i++;
          continue;
        }
        pendingRedirect = true;
      } else {
        while (command[i + 1] === '<') i++;
        pendingRedirect = false;
        // Input redirect target: consume as a normal word but ignore.
        current.push('<');
      }
      continue;
    }
    if (/\s/.test(ch)) {
      endWord();
      continue;
    }
    word += ch;
    inWord = true;
  }
  endSegment();
  return { segments: segments.map((s) => s.filter((w) => w !== '<')), hasSubstitution, redirects };
}

const PRIVILEGED = new Set(['sudo', 'su', 'doas', 'pkexec', 'runas', 'gsudo']);
const DESTRUCTIVE = new Set([
  'rm', 'rmdir', 'shred', 'dd', 'mkfs', 'fdisk', 'parted', 'wipefs', 'truncate', 'kill', 'pkill', 'killall',
  'shutdown', 'reboot', 'halt', 'poweroff', 'del', 'erase', 'rd', 'format', 'remove-item', 'diskpart', 'chown', 'crontab',
]);
const NETWORK = new Set([
  'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'nc', 'ncat', 'netcat', 'telnet', 'ftp', 'invoke-webrequest', 'iwr',
  'invoke-restmethod', 'irm', 'socat', 'aria2c',
]);
const READ_ONLY = new Set([
  'ls', 'dir', 'cat', 'head', 'tail', 'wc', 'pwd', 'echo', 'printf', 'which', 'whereis', 'type', 'file', 'stat', 'du', 'df',
  'tree', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'sort', 'uniq', 'cut', 'diff', 'cmp', 'date', 'uname', 'whoami', 'id',
  'hostname', 'true', 'false', 'test', '[', 'basename', 'dirname', 'realpath', 'readlink', 'less', 'more', 'jq', 'yq',
  'sha256sum', 'md5sum', 'shasum', 'nproc', 'free', 'uptime', 'ps', 'top', 'lscpu', 'get-childitem', 'get-content',
  'select-string', 'get-location', 'cd', 'sleep', 'column', 'tr', 'nl', 'od', 'hexdump', 'xxd', 'strings', 'awk', 'sed',
]);
/** Commands whose primary purpose is building, testing, linting or type-checking. */
const BUILD_TOOLS = new Set([
  'tsc', 'vitest', 'jest', 'mocha', 'eslint', 'prettier', 'pytest', 'mypy', 'ruff', 'flake8', 'pylint', 'black', 'tox',
  'make', 'cmake', 'ninja', 'gradle', 'gradlew', './gradlew', 'mvn', 'dotnet', 'rustc', 'gcc', 'g++', 'clang', 'clang++',
  'javac', 'swift', 'swiftc', 'xcodebuild', 'deno', 'biome', 'tsx', 'ts-node', 'phpunit', 'rspec', 'ctest', 'zig',
]);
const WRITE = new Set(['mkdir', 'touch', 'cp', 'mv', 'ln', 'tee', 'chmod', 'install', 'unzip', 'tar', 'patch', 'git-apply', 'new-item', 'set-content', 'copy-item', 'move-item']);
const INTERPRETERS = new Set(['node', 'python', 'python3', 'py', 'ruby', 'perl', 'php', 'bash', 'sh', 'zsh', 'pwsh', 'powershell', 'cmd', 'bun', 'java', 'lua', 'Rscript', 'go', 'cargo', 'npm', 'pnpm', 'yarn', 'npx', 'pip', 'pip3', 'uv', 'poetry', 'git', 'docker', 'ollama']);

const PKG_INSTALL = /^(install|i|add|ci|update|upgrade|up|remove|uninstall|rm|publish|link|dlx|create|init|exec|x)$/;

function base(prog: string): string {
  return path.basename(prog).toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
}

function classifySegment(argv: string[]): { level: RiskLevel; reason?: string; prefix: string } {
  // Drop leading VAR=value assignments and wrappers that do not change semantics.
  let i = 0;
  while (i < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i])) i++;
  while (i < argv.length && ['env', 'time', 'nice', 'nohup', 'timeout', 'command', 'exec'].includes(base(argv[i]))) {
    i++;
    if (base(argv[i - 1]) === 'timeout' && /^\d/.test(argv[i] ?? '')) i++;
    while (i < argv.length && /^-/.test(argv[i])) i++;
    while (i < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i])) i++;
  }
  const args = argv.slice(i);
  if (args.length === 0) return { level: 'read', prefix: '' };
  const prog = base(args[0]);
  const sub = (args[1] ?? '').toLowerCase();
  const prefix = [prog, sub && !sub.startsWith('-') ? sub : ''].filter(Boolean).join(' ');

  if (PRIVILEGED.has(prog)) return { level: 'privileged', reason: `${prog} runs with elevated privileges`, prefix };
  if (prog.startsWith('mkfs')) return { level: 'destructive', reason: 'formats a filesystem', prefix };
  if (DESTRUCTIVE.has(prog)) return { level: 'destructive', reason: `${prog} can delete data or stop processes`, prefix };
  if (NETWORK.has(prog)) return { level: 'network', reason: `${prog} accesses the network`, prefix };

  switch (prog) {
    case 'git': {
      if (['push', 'pull', 'fetch', 'clone', 'remote', 'submodule', 'ls-remote'].includes(sub)) {
        if (sub === 'push' && args.some((a) => a === '--force' || a === '-f' || a.startsWith('--force'))) {
          return { level: 'destructive', reason: 'force-push rewrites remote history', prefix };
        }
        if (sub === 'remote' && !['add', 'set-url', 'remove', 'rm', 'rename'].includes((args[2] ?? '').toLowerCase())) {
          return { level: 'read', prefix };
        }
        return { level: 'network', reason: `git ${sub} contacts a remote`, prefix };
      }
      if (sub === 'reset' && args.includes('--hard')) return { level: 'destructive', reason: 'git reset --hard discards changes', prefix };
      if (sub === 'clean') return { level: 'destructive', reason: 'git clean deletes untracked files', prefix };
      if ((sub === 'checkout' || sub === 'restore') && args.some((a) => a === '.' || a === '--' || a === '-f' || a === '--force')) {
        return { level: 'destructive', reason: `git ${sub} can discard working-tree changes`, prefix };
      }
      if (sub === 'branch' && args.some((a) => a === '-D' || a === '--delete' || a === '-d')) {
        return { level: 'destructive', reason: 'deletes a branch', prefix };
      }
      if (sub === 'stash' && ['drop', 'clear'].includes((args[2] ?? '').toLowerCase())) return { level: 'destructive', reason: 'drops stashed changes', prefix };
      if (['status', 'log', 'diff', 'show', 'branch', 'rev-parse', 'ls-files', 'blame', 'describe', 'shortlog', 'tag', 'config', 'grep', 'reflog', 'version', '--version'].includes(sub)) {
        return { level: 'read', prefix };
      }
      return { level: 'write', reason: `git ${sub} modifies the repository`, prefix };
    }
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun': {
      if (args.some((a) => a === '-v' || a === '--version')) return { level: 'read', prefix };
      if (prog === 'yarn' && args.length === 1) return { level: 'network', reason: 'yarn installs dependencies', prefix };
      if (PKG_INSTALL.test(sub)) return { level: 'network', reason: `${prog} ${sub} downloads or publishes packages`, prefix };
      if (['test', 't', 'run', 'run-script', 'start', 'build', 'lint', 'exec'].includes(sub) || sub === '') {
        return { level: 'build', prefix: `${prog} ${sub}${sub === 'run' && args[2] ? ` ${args[2]}` : ''}` };
      }
      if (['ls', 'list', 'view', 'info', 'outdated', 'why', 'config', 'pkg', 'audit'].includes(sub)) return { level: 'read', prefix };
      return { level: 'execute', prefix };
    }
    case 'npx':
    case 'bunx':
    case 'pnpx': {
      const tool = base(args.find((a, idx) => idx > 0 && !a.startsWith('-')) ?? '');
      if (BUILD_TOOLS.has(tool) || ['tsc', 'vitest', 'jest', 'eslint', 'prettier', 'playwright', 'vite', 'next'].includes(tool)) {
        return { level: 'build', prefix: `${prog} ${tool}` };
      }
      return { level: 'network', reason: `${prog} may download and run ${tool || 'a package'}`, prefix: `${prog} ${tool}` };
    }
    case 'pip':
    case 'pip3':
    case 'uv':
    case 'poetry':
    case 'pipenv':
    case 'conda':
    case 'mamba': {
      if (['install', 'add', 'sync', 'update', 'upgrade', 'remove', 'uninstall', 'lock', 'download'].includes(sub) || (sub === 'pip' && ['install', 'sync'].includes((args[2] ?? '').toLowerCase()))) {
        return { level: 'network', reason: `${prog} ${sub} downloads packages`, prefix };
      }
      if (sub === 'run') return { level: 'execute', prefix };
      return { level: 'read', prefix };
    }
    case 'cargo': {
      if (['install', 'add', 'update', 'publish', 'login', 'search'].includes(sub)) return { level: 'network', reason: `cargo ${sub} uses the network`, prefix };
      if (['build', 'check', 'test', 'clippy', 'fmt', 'bench', 'doc', 'tree', 'metadata'].includes(sub)) return { level: 'build', prefix };
      return { level: 'execute', prefix };
    }
    case 'go': {
      if (['get', 'install'].includes(sub) || (sub === 'mod' && ['download', 'tidy'].includes((args[2] ?? '').toLowerCase()))) {
        return { level: 'network', reason: `go ${sub} downloads modules`, prefix };
      }
      if (['build', 'test', 'vet', 'fmt', 'version', 'env', 'list', 'doc'].includes(sub)) return { level: 'build', prefix };
      return { level: 'execute', prefix };
    }
    case 'python':
    case 'python3':
    case 'py': {
      if (args.some((a) => a === '--version' || a === '-V')) return { level: 'read', prefix };
      const mIdx = args.indexOf('-m');
      if (mIdx >= 0) {
        const mod = (args[mIdx + 1] ?? '').toLowerCase();
        if (mod === 'pip' && ['install', 'download', 'uninstall'].includes((args[mIdx + 2] ?? '').toLowerCase())) {
          return { level: 'network', reason: 'pip installs packages', prefix: `${prog} -m pip` };
        }
        if (['pytest', 'unittest', 'mypy', 'py_compile', 'compileall', 'ruff', 'black', 'flake8', 'pylint', 'doctest'].includes(mod)) {
          return { level: 'build', prefix: `${prog} -m ${mod}` };
        }
        if (mod === 'venv') return { level: 'write', prefix: `${prog} -m venv` };
        if (mod === 'http.server') return { level: 'execute', prefix: `${prog} -m http.server` };
      }
      return { level: 'execute', prefix };
    }
    case 'docker':
    case 'podman': {
      if (['pull', 'push', 'login', 'build'].includes(sub)) return { level: 'network', reason: `${prog} ${sub} uses the network`, prefix };
      if (['rm', 'rmi', 'prune', 'kill', 'stop'].includes(sub) || (sub === 'system' && args[2] === 'prune')) {
        return { level: 'destructive', reason: `${prog} ${sub} removes containers or images`, prefix };
      }
      if (['ps', 'images', 'logs', 'inspect', 'version', 'info'].includes(sub)) return { level: 'read', prefix };
      return { level: 'execute', prefix };
    }
    case 'apt':
    case 'apt-get':
    case 'brew':
    case 'yum':
    case 'dnf':
    case 'pacman':
    case 'zypper':
    case 'choco':
    case 'winget':
    case 'scoop':
    case 'snap':
    case 'gem':
    case 'bundle':
    case 'composer':
      if (['list', 'search', 'info', 'show', '--version', '-v'].includes(sub)) return { level: 'read', prefix };
      return { level: 'network', reason: `${prog} installs system packages`, prefix };
    case 'ollama':
      if (['pull', 'push', 'cp'].includes(sub)) return { level: 'network', reason: `ollama ${sub} downloads models`, prefix };
      if (['rm'].includes(sub)) return { level: 'destructive', reason: 'deletes a model', prefix };
      return { level: 'read', prefix };
    case 'find':
      if (args.includes('-delete')) return { level: 'destructive', reason: 'find -delete removes files', prefix };
      if (args.some((a) => a === '-exec' || a === '-execdir' || a === '-ok')) return { level: 'execute', reason: 'find -exec runs commands', prefix };
      return { level: 'read', prefix };
    case 'sed':
      if (args.some((a) => /^-[a-zA-Z]*i/.test(a) || a === '--in-place')) return { level: 'write', prefix };
      return { level: 'read', prefix };
    case 'xargs':
    case 'eval':
    case 'source':
    case '.':
      return { level: 'execute', reason: `${prog} runs arbitrary commands`, prefix };
    case 'env':
    case 'printenv':
    case 'set':
    case 'export':
      return args.length > 1 && prog === 'export' ? { level: 'write', prefix } : { level: 'execute', reason: 'prints environment variables', prefix };
  }

  if (READ_ONLY.has(prog)) return { level: 'read', prefix };
  if (BUILD_TOOLS.has(prog) || BUILD_TOOLS.has(args[0])) return { level: 'build', prefix };
  if (WRITE.has(prog)) return { level: 'write', prefix };
  if (INTERPRETERS.has(prog)) return { level: 'execute', prefix };
  return { level: 'execute', reason: `unrecognised program "${prog}"`, prefix };
}

const BLOCKLIST: { re: RegExp; why: string }[] = [
  { re: /\brm\s+(-[a-zA-Z]*\s+)*(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\s+(-[a-zA-Z]*\s+)*(\/|\/\*|~\/?|\$HOME\/?|\*)(\s|$)/, why: 'recursive deletion of a root, home or wildcard path' },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, why: 'fork bomb' },
  { re: /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|hd|disk|mmcblk)/, why: 'raw write to a disk device' },
  { re: />\s*\/dev\/(sd|nvme|hd|disk|mmcblk)/, why: 'raw write to a disk device' },
  { re: /\bmkfs(\.\w+)?\s+\/dev\//, why: 'formatting a disk' },
  { re: /\bchmod\s+(-R\s+)?[0-7]*777\s+\/(\s|$)/, why: 'making the root filesystem world-writable' },
  { re: /\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/, why: 'piping a downloaded script into a shell' },
];

/**
 * Assess a shell command's risk. This is a heuristic, conservative classifier:
 * unknown programs are 'execute', and any dangerous keyword anywhere (including
 * inside substitutions) raises the level.
 */
export function assessCommand(command: string, workspaceRoot?: string): CommandAssessment {
  const reasons: string[] = [];
  for (const b of BLOCKLIST) {
    if (b.re.test(command)) {
      return { level: 'destructive', reasons: [b.why], blocked: b.why, prefix: '', segments: [] };
    }
  }
  const { segments, hasSubstitution, redirects } = tokenizeCommand(command);
  let level: RiskLevel = 'read';
  let prefix = '';
  for (const seg of segments) {
    const r = classifySegment(seg);
    if (!prefix && r.prefix) prefix = r.prefix;
    if (r.reason) reasons.push(r.reason);
    level = maxRisk(level, r.level);
  }
  if (hasSubstitution) {
    level = maxRisk(level, 'execute');
    reasons.push('uses command substitution');
  }
  for (const target of redirects) {
    if (/^\/dev\/(null|stdout|stderr|tty)$/.test(target) || /^&?\d$/.test(target)) continue;
    level = maxRisk(level, 'write');
    reasons.push(`writes to ${target}`);
    if (workspaceRoot && path.isAbsolute(target) && !path.resolve(target).startsWith(path.resolve(workspaceRoot))) {
      level = maxRisk(level, 'destructive');
      reasons.push(`writes outside the workspace (${target})`);
    }
  }
  // Absolute paths or parent traversal outside the workspace deserve a human look.
  if (workspaceRoot) {
    const root = path.resolve(workspaceRoot);
    for (const seg of segments) {
      for (const arg of seg.slice(1)) {
        const looksLikePath = /^(\/|[A-Za-z]:[\\/])/.test(arg) || /(^|[\\/])\.\.([\\/]|$)/.test(arg);
        if (!looksLikePath) continue;
        const abs = path.resolve(root, arg);
        if (abs === root || abs.startsWith(root + path.sep)) continue;
        if (/^\/(usr|bin|sbin|opt|tmp|dev\/null)(\/|$)/.test(abs)) continue;
        level = maxRisk(level, 'execute');
        reasons.push(`references a path outside the workspace (${arg})`);
      }
    }
  }
  // Keyword sweep over the raw text catches dangerous programs hidden in quotes or sub-shells (e.g. bash -c "sudo ...").
  const words = command.toLowerCase().split(/[^a-z0-9_.\-]+/);
  if (words.some((w) => PRIVILEGED.has(w))) {
    level = maxRisk(level, 'privileged');
    if (!reasons.some((r) => r.includes('elevated'))) reasons.push('mentions a privilege-escalation command');
  } else if (/(bash|sh|zsh|pwsh|powershell|cmd)(\.exe)?\s+(-c|\/c|-command)\b/i.test(command)) {
    if (words.some((w) => DESTRUCTIVE.has(w))) level = maxRisk(level, 'destructive');
    else if (words.some((w) => NETWORK.has(w))) level = maxRisk(level, 'network');
  }
  return { level, reasons: [...new Set(reasons)], prefix, segments };
}
