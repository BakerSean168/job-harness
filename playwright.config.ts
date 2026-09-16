import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const apiToken = 'e2e-api-token';
const webPassword = 'e2e-web-password';
const e2eDb = resolve('.tmp/e2e/career.db');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:3201',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @job-harness/server exec tsx e2e/start-server.ts',
      url: 'http://127.0.0.1:3200/healthz',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...inheritedEnv,
        JOB_HARNESS_E2E_DB: e2eDb,
        JOB_HARNESS_HOST: '127.0.0.1',
        JOB_HARNESS_PORT: '3200',
        JOB_HARNESS_AUTH_TOKEN: apiToken,
      },
    },
    {
      command: 'pnpm --filter @job-harness/web exec next start -H 127.0.0.1 -p 3201',
      url: 'http://127.0.0.1:3201/login',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...inheritedEnv,
        NODE_ENV: 'production',
        JOB_HARNESS_API_URL: 'http://127.0.0.1:3200/api/v1',
        JOB_HARNESS_AUTH_TOKEN: apiToken,
        JOB_HARNESS_WEB_PASSWORD: webPassword,
        JOB_HARNESS_WEB_SESSION_SECRET: 'e2e-session-secret-0123456789abcdef0123456789',
        JOB_HARNESS_WEB_SESSION_TTL_HOURS: '1',
        JOB_HARNESS_WEB_COOKIE_SECURE: 'false',
      },
    },
  ],
});
