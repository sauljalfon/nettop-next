import { expect, test } from './fixtures'
import { findAggBb, traceRoutes } from './helpers'

// Find AGG / BB in the UI against the acceptance fixture: EDGE-17 reaches two
// AGGs and one BB, listed AGG first, each naming destination, role and network.
// Mismatch and truncation rendering are unit-tested.
test('Find AGG / BB lists AGG then BB results with destination, role and network', async ({
  page,
}) => {
  await page.goto('/')
  await findAggBb(page, 'EDGE-17')

  const rows = traceRoutes(page)
  const list = page.getByTestId('trace-list')
  await expect(rows).toHaveCount(3)
  await expect(rows).toContainText([
    'AGG-03 · Port 1',
    'AGG-08 · Port 1',
    'BB-01 · Port 1',
  ])
  await expect(rows.nth(0)).toContainText('AGG')
  await expect(rows.nth(2)).toContainText('BB')
  await expect(rows.first()).toHaveAttribute('aria-pressed', 'true')
  await rows.nth(2).click()
  await expect(rows.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect(list).toContainText('3 routes · 0 mismatches')
  await expect(list.getByTestId('truncation')).toHaveCount(0)
  // The counts sit above the route rows, and all three rows are visible at once.
  for (const i of [0, 1, 2]) await expect(rows.nth(i)).toBeVisible()
  const summary = (await list.locator('.tp-summary').boundingBox())!
  const first = (await rows.first().boundingBox())!
  expect(summary.y).toBeLessThan(first.y)
})
