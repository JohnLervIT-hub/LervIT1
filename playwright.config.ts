import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:5000',
    trace: 'on-first-retry',
    // Accept all cookies and bypass CSP for Stripe mock injection
    bypassCSP: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — tests run against the already-running dev server
});
