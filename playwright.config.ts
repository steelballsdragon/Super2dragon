import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// End-to-end UI tests drive the real UI, the real engine and a real local model
// (Ollama). They are skipped automatically when no model server is available.
const home = process.env.LOCALCODE_E2E_HOME ?? mkdtempSync(path.join(os.tmpdir(), 'localcode-e2e-'));
const port = Number(process.env.LOCALCODE_E2E_PORT ?? 4399);

export default defineConfig({
  testDir: 'e2e',
  timeout: 20 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `node apps/cli/dist/localcode.mjs serve --port ${port} --token e2e-token`,
    url: `http://127.0.0.1:${port}/health`,
    env: { LOCALCODE_HOME: home },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
