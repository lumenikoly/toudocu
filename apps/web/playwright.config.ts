import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.browser.ts',
  use: { baseURL: 'http://127.0.0.1:4174/project/docs/' },
  webServer: [
    {
      command: 'node tests/serve-built.mjs',
      url: 'http://127.0.0.1:4174/project/docs/',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/serve-live.mjs',
      url: 'http://127.0.0.1:4175/_toudocu/api/state',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/serve-live.mjs --canonical',
      url: 'http://127.0.0.1:4177/_toudocu/api/state',
      reuseExistingServer: false,
    },
  ],
});
