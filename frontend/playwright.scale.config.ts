import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// Opt-in scale run (SC-02): `SCALE=1 npx playwright test -c playwright.scale.config.ts`.
// It serves the generated campus fixture on its own ports, so it can run beside
// the default suite and the dev server.
const dotenv = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(dotenv)) process.loadEnvFile(dotenv)

export default defineConfig({
  testDir: './e2e',
  testMatch: 'scale.spec.ts',
  outputDir: 'test-results-scale',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  use: {
    baseURL: 'http://127.0.0.1:5176',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'go run ./cmd/testserver -fixture campus -addr 127.0.0.1:18081',
      cwd: '../backend',
      url: 'http://127.0.0.1:18081/api/health',
      env: {
        TEST_DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          'postgres://nettop:nettop-local@127.0.0.1:55432/nettop?sslmode=disable',
      },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15000 },
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      command: 'npm run dev -- --port 5176',
      url: 'http://127.0.0.1:5176',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:18081' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
