import { expect, test } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODEL = process.env.LOCALCODE_E2E_MODEL ?? 'qwen3.5:4b';
const OLLAMA = process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434';

async function modelAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const tags = (await r.json()) as { models: { name: string }[] };
    return tags.models.some((m) => m.name === MODEL || m.name === `${MODEL}:latest`);
  } catch {
    return false;
  }
}

test('runs a real task from the UI with an approval in strict mode', async ({ page }) => {
  test.skip(!(await modelAvailable()), `Ollama with ${MODEL} is not available`);
  const ws = mkdtempSync(path.join(os.tmpdir(), 'localcode-e2e-ws-'));
  cpSync(path.resolve('examples/sample-project'), ws, { recursive: true });
  const original = readFileSync(path.join(ws, 'src/cart.js'), 'utf8');

  await page.goto('/#token=e2e-token');
  await expect(page.getByText('Local model server online')).toBeVisible();
  // First-run wizard shows dependency checks; skip it.
  await expect(page.getByText('Set up LocalCode')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  await page.getByRole('button', { name: 'Open…' }).click();
  await page.getByPlaceholder('/path/to/project').fill(ws);
  await page.keyboard.press('Enter');
  await expect(page.getByText('tests: npm test')).toBeVisible();

  const modelSelect = page.locator('header select').first();
  await modelSelect.selectOption({ value: `ollama/${MODEL}` });
  await page.locator('header select').nth(1).selectOption('strict');

  await page.getByPlaceholder(/Describe a task/).fill('Run the test suite once and tell me how many tests pass and how many fail. Do not modify any files.');
  await page.getByRole('button', { name: /Send/ }).click();

  // Strict mode: running tests needs approval from the UI.
  const approval = page.getByRole('alertdialog', { name: 'Approval required' });
  await expect(approval).toBeVisible({ timeout: 10 * 60_000 });
  await page.screenshot({ path: 'test-results/e2e/approval.png' });
  await approval.getByRole('button', { name: 'Allow once' }).click();
  await expect(page.getByText(/✓ Approved/)).toBeVisible();

  // The task report is built from real results.
  const report = page.locator('.report');
  await expect(report).toBeVisible({ timeout: 15 * 60_000 });
  await expect(report).toContainText('Commands (actual exit codes)');
  await expect(report.locator('.exit.bad').first()).toBeVisible(); // the sample's test suite really fails
  await page.screenshot({ path: 'test-results/e2e/report.png' });

  // Terminal shows the streamed command output; activity log recorded the steps.
  await page.getByRole('button', { name: 'Terminal' }).click();
  await expect(page.locator('.term-out')).toContainText('fail 1');
  await page.getByRole('button', { name: 'Activity' }).first().click();
  await expect(page.locator('.activity-list')).toContainText('Approval granted');
  await page.screenshot({ path: 'test-results/e2e/activity.png' });

  // Nothing was modified.
  expect(readFileSync(path.join(ws, 'src/cart.js'), 'utf8')).toBe(original);
});
