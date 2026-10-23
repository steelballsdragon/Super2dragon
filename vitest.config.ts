import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/cli/test/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
          testTimeout: 30_000,
          pool: 'forks',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/test/**/*.integration.test.ts', 'apps/cli/test/**/*.integration.test.ts'],
          testTimeout: 900_000,
          hookTimeout: 120_000,
          pool: 'forks',
          fileParallelism: false,
        },
      },
    ],
  },
});
