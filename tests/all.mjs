#!/usr/bin/env node
// Runs every Last Furnace test against the current build: node tests/all.mjs (after node build.mjs).
// smoke: a first session through the UI; cloud: cloud saves; dev: the developer panel; soak: Furnace 1-30, saves damaged on purpose.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const failed = [];
for (const t of ['smoke', 'cloud', 'dev', 'soak']) {
  console.log(`\n== ${t}`);
  const r = spawnSync(process.execPath, [join(HERE, `${t}.mjs`), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(t);
}
console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nall test suites passed');
process.exit(failed.length ? 1 : 0);
