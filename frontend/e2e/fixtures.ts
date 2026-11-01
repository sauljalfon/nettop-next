import { test as base } from '@playwright/test'

export * from '@playwright/test'

/**
 * The specs' `test`: every worker talks to its own lane (playwright.config.ts),
 * so the configured base URL's port is moved up by the worker's index. `laneURL`
 * is worker-scoped, for `beforeAll` / `afterAll` that make their own request
 * context.
 */
export const test = base.extend<object, { laneURL: string }>({
  laneURL: [
    async ({}, use, workerInfo) => {
      const url = new URL(workerInfo.project.use.baseURL!)
      url.port = String(Number(url.port) + workerInfo.parallelIndex)
      await use(url.origin)
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ laneURL }, use) => use(laneURL),
})
