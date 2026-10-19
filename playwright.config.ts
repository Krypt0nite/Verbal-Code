import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build (`vite preview`).
 * Locally: `npx playwright install chromium` once, then `npm run test:e2e`.
 * PW_CHROMIUM_PATH can point at an existing Chromium binary (used in restricted CI sandboxes).
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const extraArgs = (process.env.PW_CHROMIUM_ARGS ?? '').split(' ').filter(Boolean);
const launchOptions = executablePath ? { executablePath, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', ...extraArgs] } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // A custom single-process Chromium cannot run pages in parallel.
  workers: executablePath ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions,
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        launchOptions,
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
