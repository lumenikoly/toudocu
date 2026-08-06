import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
});
