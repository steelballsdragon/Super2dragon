import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NON_CODE_LANGUAGES, languageOf, type FileEntry } from './files.js';

export interface ProjectInfo {
  languages: { name: string; files: number; percent: number }[];
  frameworks: string[];
  packageManagers: string[];
  manifests: string[];
  entryPoints: string[];
  testCommand?: string;
  checkCommands: string[];
  buildCommand?: string;
  devCommand?: string;
  isGitRepo: boolean;
  fileCount: number;
  instructionsFile?: string;
}

const JS_FRAMEWORKS: Record<string, string> = {
  react: 'React', next: 'Next.js', vue: 'Vue', nuxt: 'Nuxt', svelte: 'Svelte', '@sveltejs/kit': 'SvelteKit',
  '@angular/core': 'Angular', 'solid-js': 'Solid', astro: 'Astro', express: 'Express', fastify: 'Fastify', koa: 'Koa',
  hono: 'Hono', '@nestjs/core': 'NestJS', electron: 'Electron', 'react-native': 'React Native', expo: 'Expo',
  vite: 'Vite', webpack: 'Webpack', jest: 'Jest', vitest: 'Vitest', mocha: 'Mocha', '@playwright/test': 'Playwright',
  typescript: 'TypeScript', tailwindcss: 'Tailwind CSS', prisma: 'Prisma', '@tauri-apps/api': 'Tauri', three: 'Three.js',
  phaser: 'Phaser', 'socket.io': 'Socket.IO', graphql: 'GraphQL', mongoose: 'Mongoose', sequelize: 'Sequelize',
};
const PY_FRAMEWORKS: Record<string, string> = {
  django: 'Django', flask: 'Flask', fastapi: 'FastAPI', pytest: 'pytest', numpy: 'NumPy', pandas: 'pandas',
  torch: 'PyTorch', tensorflow: 'TensorFlow', pygame: 'Pygame', sqlalchemy: 'SQLAlchemy', pydantic: 'Pydantic',
  streamlit: 'Streamlit', scrapy: 'Scrapy', celery: 'Celery',
};
const RUST_FRAMEWORKS: Record<string, string> = { tokio: 'Tokio', axum: 'Axum', 'actix-web': 'Actix Web', bevy: 'Bevy', tauri: 'Tauri', rocket: 'Rocket', serde: 'Serde' };
const GO_FRAMEWORKS: Record<string, string> = { 'gin-gonic/gin': 'Gin', 'labstack/echo': 'Echo', 'gofiber/fiber': 'Fiber', 'go-chi/chi': 'chi' };

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** Identify languages, frameworks, entry points and the commands to build and test a project. */
export function detectProject(root: string, files: FileEntry[]): ProjectInfo {
  const has = (rel: string) => existsSync(path.join(root, rel));
  const counts = new Map<string, number>();
  for (const f of files) {
    const lang = languageOf(f.path);
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const codeTotal = [...counts.entries()].filter(([l]) => !NON_CODE_LANGUAGES.has(l)).reduce((s, [, n]) => s + n, 0) || 1;
  const languages = [...counts.entries()]
    .filter(([l]) => !NON_CODE_LANGUAGES.has(l))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, n]) => ({ name, files: n, percent: Math.round((n / codeTotal) * 100) }));

  const frameworks = new Set<string>();
  const packageManagers: string[] = [];
  const manifests: string[] = [];
  const entryPoints = new Set<string>();
  const checkCommands: string[] = [];
  let testCommand: string | undefined;
  let buildCommand: string | undefined;
  let devCommand: string | undefined;

  // JavaScript / TypeScript
  if (has('package.json')) {
    manifests.push('package.json');
    const pkg = readJson(path.join(root, 'package.json')) ?? {};
    const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : 'npm';
    packageManagers.push(pm);
    const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object), ...(pkg.peerDependencies as object) } as Record<string, string>;
    for (const [dep, name] of Object.entries(JS_FRAMEWORKS)) if (dep in deps) frameworks.add(name);
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    const run = (s: string) => (pm === 'npm' ? (s === 'test' ? 'npm test' : `npm run ${s}`) : `${pm} ${s === 'test' ? 'test' : `run ${s}`}`);
    if (scripts.test && !/no test specified/.test(scripts.test)) testCommand = run('test');
    for (const s of ['typecheck', 'type-check', 'check', 'lint']) if (scripts[s]) checkCommands.push(run(s));
    if (!checkCommands.some((c) => /typecheck|type-check|check/.test(c)) && has('tsconfig.json') && 'typescript' in deps) {
      checkCommands.unshift('npx tsc --noEmit');
    }
    if (scripts.build) buildCommand = run('build');
    if (scripts.dev) devCommand = run('dev');
    else if (scripts.start) devCommand = run('start');
    for (const k of ['main', 'module']) if (typeof pkg[k] === 'string') entryPoints.add(String(pkg[k]).replace(/^\.\//, ''));
    if (typeof pkg.bin === 'string') entryPoints.add(String(pkg.bin).replace(/^\.\//, ''));
    else if (pkg.bin && typeof pkg.bin === 'object') for (const v of Object.values(pkg.bin as object)) entryPoints.add(String(v).replace(/^\.\//, ''));
  }

  // Python
  const pyManifests = ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'].filter(has);
  if (pyManifests.length) {
    manifests.push(...pyManifests);
    const text = pyManifests.map((m) => readText(path.join(root, m))).join('\n').toLowerCase();
    for (const [dep, name] of Object.entries(PY_FRAMEWORKS)) if (new RegExp(`(^|[^a-z0-9_-])${dep}([^a-z0-9_-]|$)`, 'm').test(text)) frameworks.add(name);
    packageManagers.push(has('uv.lock') ? 'uv' : has('poetry.lock') ? 'poetry' : has('Pipfile') ? 'pipenv' : 'pip');
  }
  const hasPyTests = files.some((f) => /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(f.path));
  if (!testCommand && (hasPyTests || frameworks.has('pytest'))) testCommand = 'python -m pytest -q';
  if (counts.get('Python') && !checkCommands.length && !has('package.json')) {
    if (/mypy/.test(readText(path.join(root, 'pyproject.toml')))) checkCommands.push('python -m mypy .');
  }

  // Rust
  if (has('Cargo.toml')) {
    manifests.push('Cargo.toml');
    packageManagers.push('cargo');
    const text = readText(path.join(root, 'Cargo.toml'));
    for (const [dep, name] of Object.entries(RUST_FRAMEWORKS)) if (new RegExp(`^\\s*${dep}\\s*=`, 'm').test(text)) frameworks.add(name);
    testCommand ??= 'cargo test';
    checkCommands.push('cargo check');
    buildCommand ??= 'cargo build';
  }

  // Go
  if (has('go.mod')) {
    manifests.push('go.mod');
    packageManagers.push('go modules');
    const text = readText(path.join(root, 'go.mod'));
    for (const [dep, name] of Object.entries(GO_FRAMEWORKS)) if (text.includes(dep)) frameworks.add(name);
    testCommand ??= 'go test ./...';
    checkCommands.push('go vet ./...');
    buildCommand ??= 'go build ./...';
  }

  // JVM / .NET / others
  if (has('pom.xml')) {
    manifests.push('pom.xml');
    packageManagers.push('maven');
    if (/spring-boot/.test(readText(path.join(root, 'pom.xml')))) frameworks.add('Spring Boot');
    testCommand ??= 'mvn -q test';
  }
  if (has('build.gradle') || has('build.gradle.kts')) {
    manifests.push(has('build.gradle') ? 'build.gradle' : 'build.gradle.kts');
    packageManagers.push('gradle');
    testCommand ??= has('gradlew') ? './gradlew test' : 'gradle test';
  }
  const csproj = files.find((f) => f.path.endsWith('.csproj') || f.path.endsWith('.sln'));
  if (csproj) {
    manifests.push(csproj.path);
    packageManagers.push('dotnet');
    testCommand ??= 'dotnet test';
  }
  if (has('Gemfile')) {
    manifests.push('Gemfile');
    packageManagers.push('bundler');
    if (/rails/.test(readText(path.join(root, 'Gemfile')))) frameworks.add('Rails');
  }
  if (has('composer.json')) {
    manifests.push('composer.json');
    packageManagers.push('composer');
    if (/laravel/.test(readText(path.join(root, 'composer.json')))) frameworks.add('Laravel');
  }
  if (has('pubspec.yaml')) {
    manifests.push('pubspec.yaml');
    frameworks.add('Flutter/Dart');
    testCommand ??= 'flutter test';
  }
  if (has('CMakeLists.txt')) manifests.push('CMakeLists.txt');
  if (has('Makefile')) {
    manifests.push('Makefile');
    if (!testCommand && /^test:/m.test(readText(path.join(root, 'Makefile')))) testCommand = 'make test';
  }

  const ENTRY_CANDIDATES = [
    'src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx', 'src/main.js', 'src/index.js', 'src/App.tsx', 'src/app.ts',
    'index.ts', 'index.js', 'main.js', 'server.js', 'server.ts', 'app.js', 'app.py', 'main.py', 'manage.py', 'src/main.py',
    'src/main.rs', 'src/lib.rs', 'main.go', 'cmd/main.go', 'index.html', 'src/main/java', 'Program.cs', 'lib/main.dart',
  ];
  for (const c of ENTRY_CANDIDATES) if (has(c)) entryPoints.add(c);
  for (const f of files) if (/^cmd\/[^/]+\/main\.go$/.test(f.path)) entryPoints.add(f.path);

  const instructionsFile = ['LOCALCODE.md', 'AGENTS.md', 'CLAUDE.md', '.localcode/instructions.md'].find(has);

  return {
    languages,
    frameworks: [...frameworks],
    packageManagers: [...new Set(packageManagers)],
    manifests,
    entryPoints: [...entryPoints].slice(0, 12),
    testCommand,
    checkCommands: [...new Set(checkCommands)],
    buildCommand,
    devCommand,
    isGitRepo: has('.git'),
    fileCount: files.length,
    instructionsFile,
  };
}
