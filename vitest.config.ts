import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'workspace',
    environment: 'node',
    setupFiles: ['./scripts/test-platform-paths.mjs'],
    include: [
      'apps/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'packages/integrations/bb/tests/**/*.test.ts',
    ],
    projects: [
      {
        extends: true,
        test: {
          name: 'workspace',
          environment: 'node',
          include: [
            'apps/*/src/**/*.test.ts',
            'packages/*/src/**/*.test.ts',
            'packages/integrations/bb/tests/**/*.test.ts',
          ],
        },
      },
    ],
  },
});
