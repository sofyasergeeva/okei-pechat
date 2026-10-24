const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['browser.smoke.cjs', 'server.browser.cjs'],
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    browserName: 'chromium',
    channel: 'msedge',
    baseURL: 'http://127.0.0.1:18087',
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    timezoneId: 'Asia/Yekaterinburg',
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true },
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/serve-local.cjs',
      url: 'http://127.0.0.1:18087',
      env: { PORT: '18087' },
      reuseExistingServer: false,
      timeout: 15000,
    },
    {
      command: 'node tests/server-fixture.cjs',
      url: 'http://127.0.0.1:18088',
      reuseExistingServer: false,
      timeout: 15000,
    },
  ],
});
