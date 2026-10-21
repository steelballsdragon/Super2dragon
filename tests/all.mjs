#!/usr/bin/env node
// Runs every Age of Conquest test against the current build: node tests/all.mjs (after node build.mjs).
// conquest-engine: the rules and the simulation in Node; conquest-demo: the Coalition War campaign;
// conquest-ui: a first session through the interface; conquest-dev: developer mode; conquest-robust: damaged saves,
// blocked storage and a long run.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const failed = [];
for (const t of ['conquest-engine', 'conquest-demo', 'conquest-ui', 'conquest-dev', 'conquest-robust']) {
  console.log(`\n== ${t}`);
  const r = spawnSync(process.execPath, [join(HERE, `${t}.mjs`), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(t);
}
console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nall test suites passed');
process.exit(failed.length ? 1 : 0);
