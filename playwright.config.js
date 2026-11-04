// Browser tests for the interactive pages. Run with: npm run test:e2e
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node tests/e2e/serve.js ${PORT}`,
    url: `http://localhost:${PORT}/identify.html`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1200, height: 900 } } },
    // Phone layout and touch input, on Chromium so CI only needs one browser
    { name: 'iphone', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
  ],
});
