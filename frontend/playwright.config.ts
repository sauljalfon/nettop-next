import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// The repository's .env (see .env.example) supplies TEST_DATABASE_URL; a variable
// already set in the environment is kept.
const dotenv = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(dotenv)) process.loadEnvFile(dotenv)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
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
