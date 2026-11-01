import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'

// The repository's .env (see .env.example) supplies TEST_DATABASE_URL; a variable
// already set in the environment is kept.
const dotenv = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(dotenv)) process.loadEnvFile(dotenv)

// Every worker has its own lane: its own test server (its own schema, fixture
// and Expansion draft) and its own Vite pointing at it, so specs on different
// workers never share data. Worker N uses lane N (`e2e/fixtures.ts` turns the
// base URL below into lane N's). E2E_WORKERS sets how many lanes (default 4);
// E2E_API_PORT and E2E_WEB_PORT the first lane's ports (each lane adds 1).
//
// Recording a plan changes a server's installed revision, which makes every
// other draft on it (the Expansion draft included) stale. Specs that record or
// make drafts stale are named *.recording.spec.ts and run in their own project
// after every other spec (`dependencies`), each creating its own drafts on the
// revision it finds, so they do not depend on each other's order.
const lanes = Number(process.env.E2E_WORKERS ?? 4)
const apiPort = Number(process.env.E2E_API_PORT ?? 18090)
const webPort = Number(process.env.E2E_WEB_PORT ?? 5180)
const databaseURL =
  process.env.TEST_DATABASE_URL ??
  'postgres://nettop:nettop-local@127.0.0.1:55432/nettop?sslmode=disable'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: lanes,
  projects: [
    { name: 'main', testIgnore: /\.recording\.spec\.ts$/ },
    {
      name: 'recording',
      testMatch: /\.recording\.spec\.ts$/,
      dependencies: ['main'],
    },
  ],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    viewport: { width: 1440, height: 1050 },
    trace: 'retain-on-failure',
  },
  webServer: Array.from(
    { length: lanes },
    (_, lane): NonNullable<PlaywrightTestConfig['webServer']> => [
      {
        command: `go run ./cmd/testserver -addr 127.0.0.1:${apiPort + lane}`,
        cwd: '../backend',
        url: `http://127.0.0.1:${apiPort + lane}/api/health`,
        env: { TEST_DATABASE_URL: databaseURL },
        gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 15000 },
        reuseExistingServer: false,
        timeout: 120_000,
      },
      {
        command: `npm run dev -- --port ${webPort + lane}`,
        url: `http://127.0.0.1:${webPort + lane}`,
        env: {
          API_PROXY_TARGET: `http://127.0.0.1:${apiPort + lane}`,
          // Each lane's Vite optimizes dependencies into its own folder.
          VITE_CACHE_DIR: `node_modules/.vite-e2e-${lane}`,
        },
        reuseExistingServer: false,
        timeout: 60_000,
      },
    ],
  ).flat(),
})
