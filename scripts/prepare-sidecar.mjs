// Copies the bundled engine (apps/cli/dist) into the Tauri resources folder so
// the desktop app can start it without the source tree. Builds it if needed.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliDist = path.join(root, 'apps/cli/dist');
const target = path.join(root, 'apps/desktop/src-tauri/resources/engine');

if (!existsSync(path.join(cliDist, 'localcode.mjs'))) {
  console.log('Building the LocalCode engine...');
  execFileSync(process.execPath, [path.join(root, 'apps/cli/build.mjs')], { stdio: 'inherit', cwd: root });
}
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(path.join(cliDist, 'localcode.mjs'), path.join(target, 'localcode.mjs'));
cpSync(path.join(cliDist, 'tree-sitter'), path.join(target, 'tree-sitter'), { recursive: true });
console.log(`Engine copied to ${path.relative(root, target)}`);
