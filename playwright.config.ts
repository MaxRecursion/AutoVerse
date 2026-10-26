import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * Browser tests run against the production build (`vite preview`), the same
 * artefact that ships to GitHub Pages — prerendered pages included.
 * `npm run test:e2e` builds first; locally an already-running preview is reused.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // Headless Chromium renders the 3D scenes in software, several cores per page; at the default (half the cores) the
  // WebGL-heavy tests starve each other past their timeouts. The two longest tests set the suite's length anyway.
  workers: '30%',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
