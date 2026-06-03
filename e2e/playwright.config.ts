import { defineConfig } from '@playwright/test';

import { env } from '@ibf-e2e/env';

export default defineConfig({
  tsconfig: './tsconfig.json',
  testDir: './nrw/tests',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: env.CI, // Fail the build on CI if you accidentally left test.only in the source code.
  retries: 1,
  reporter: [['list']],
  workers: 1,
  outputDir: './test-results',
  timeout: 60_000,
  use: {
    baseURL: env.BASE_URL,
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
    acceptDownloads: true,
    actionTimeout: 20_000,
    launchOptions: {
      args: ['--window-size=1920,1024'],
    },
    viewport: null,
    ignoreHTTPSErrors: true,
    bypassCSP: false,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { channel: 'chromium' },
    },
  ],
});
