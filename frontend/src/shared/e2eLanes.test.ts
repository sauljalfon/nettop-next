import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The browser specs run on lanes, one test server per worker (playwright.config.ts).
// Only e2e/fixtures.ts points a worker at its lane: a spec that takes `test` from
// '@playwright/test' would send every worker to lane 0 and share its data.
const E2E = join(process.cwd(), 'e2e')

describe('browser specs use the lane fixture', () => {
  it('no spec imports @playwright/test directly', () => {
    const direct = readdirSync(E2E)
      .filter((f) => f.endsWith('.spec.ts'))
      .filter((f) =>
        /from '@playwright\/test'/.test(readFileSync(join(E2E, f), 'utf8')),
      )
    expect(direct).toEqual([])
  })
})
