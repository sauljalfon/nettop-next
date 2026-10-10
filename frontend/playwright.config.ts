import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// The repository's .env (see .env.example) supplies TEST_DATABASE_URL; a variable
// already set in the environment is kept.
const dotenv = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(dotenv)) process.loadEnvFile(dotenv)

// Recording a plan changes the shared test server's installed revision, which
// makes every other draft (the Expansion draft included) stale. Specs that record
// or make drafts stale are named *.recording.spec.ts and run in their own project
// after every other spec (`dependencies`), one worker, each creating its own
// drafts on the revision it finds, so they do not depend on each other's order.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  projects: [
    { name: 'main', testIgnore: /\.recording\.spec\.ts$/ },
    {
      name: 'recording',
      testMatch: /\.recording\.spec\.ts$/,
      dependencies: ['main'],
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:5175',
    viewport: { width: 1440, height: 1050 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'go run ./cmd/testserver',
      cwd: '../backend',
      url: 'http://127.0.0.1:18080/api/health',
      env: {
        TEST_DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          'postgres://nettop:nettop-local@127.0.0.1:55432/nettop?sslmode=disable',
      },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15000 },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --port 5175',
      url: 'http://127.0.0.1:5175',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:18080' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
