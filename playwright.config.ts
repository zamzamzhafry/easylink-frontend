import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // Only run Playwright specs, not the node:test .test.mjs unit files that
  // share the tests/ dir (those fail under Playwright's runner with
  // "Cannot use import statement outside a module").
  testMatch: '**/*.spec.ts',
  // Next.js dev compiles each route on first hit; the SSR dashboard after
  // login can exceed the 30s default on a cold server. Give headroom.
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use system Google Chrome — the bundled chromium download fails on
        // ubuntu 26.04 ("Playwright does not support chromium on
        // ubuntu26.04-x64"). Remove this channel if a bundled browser
        // becomes available.
        channel: 'chrome',
      },
    },
  ],
});
