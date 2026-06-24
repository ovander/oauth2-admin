import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for OAuth2 Admin SPA.
 *
 * The webServer block starts the Vite dev server automatically before the
 * test run and tears it down afterward.  VITE_ADMIN_API_URL is pointed at
 * localhost:8081 so that page.route() can intercept those requests at the
 * network layer — no real backend is needed during tests.
 */
export default defineConfig({
  testDir: './e2e',

  /* Write test-results and reports to /tmp to avoid EPERM issues in sandboxed environments */
  outputDir: '/tmp/playwright-results',

  /* Run test files in parallel */
  fullyParallel: true,

  /* Fail CI on test.only or focused tests left in the codebase */
  forbidOnly: !!process.env.CI,

  /* Retry flaky tests once in CI */
  retries: process.env.CI ? 2 : 0,

  /* Single worker in CI to avoid port conflicts; unlimited locally */
  workers: process.env.CI ? 1 : undefined,

  /* Reporters */
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: '/tmp/playwright-report' }]]
    : [['list'],   ['html', { open: 'never', outputFolder: '/tmp/playwright-report' }]],

  use: {
    /* Base URL so tests can use relative paths: await page.goto('/auth/login') */
    baseURL: 'http://localhost:5174',

    /* Capture trace on first retry to simplify debugging CI failures */
    trace: 'on-first-retry',

    /* Short action timeout — fast feedback on broken selectors */
    actionTimeout:     10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start the Vite dev server before running E2E tests */
  webServer: {
    command: 'npm run dev -- --port 5174',
    url:     'http://localhost:5174',
    /* In CI always start fresh; locally re-use a running server if available */
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      /* Point axios at localhost:8081 so page.route() can intercept calls */
      VITE_ADMIN_API_URL: 'http://localhost:8081',
    },
  },
})
