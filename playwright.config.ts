import { defineConfig, devices } from '@playwright/test';

/**
 * Engine strategy:
 *  - axe / structure / adaptation checks are DOM-level and engine-agnostic, so they run once (chromium).
 *  - keyboard + component behaviour genuinely differs by engine, so it runs on all three.
 *    (On macOS, WebKit only tabs to links when "Press Tab to highlight each item" is on —
 *    run the webkit project on Linux CI for meaningful results.)
 */
const INTERACTION_TESTS = /tests\/(keyboard|components|forms)\//;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A flaky a11y test is a finding to investigate, not noise to retry away.
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./src/reporters/wcag-coverage-reporter.ts', { outputDir: 'reports' }],
    ['./src/reporters/browser-results-reporter.ts', { outputDir: 'reports' }],
  ],
  expect: { timeout: 5_000 },
  // No {platform} in the path: tab-order baselines are per browser, and must match on macOS and Linux CI.
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Removes animation timing as a source of false positives in focus/visual checks.
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: INTERACTION_TESTS },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: INTERACTION_TESTS },
  ],
});
