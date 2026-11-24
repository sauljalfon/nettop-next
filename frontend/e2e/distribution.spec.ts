import { expect, test } from './fixtures'
import { findAggBb } from './helpers'

// Find AGG / BB in the UI against the acceptance fixture: EDGE-17 reaches two
// AGGs and one BB, listed AGG first, each naming destination, role and network.
// Mismatch and truncation rendering are unit-tested.
test('Find AGG / BB lists AGG then BB results with destination, role and network', async ({
  page,
}) => {
  await page.goto('/')
  await findAggBb(page, 'EDGE-17')

  const results = page.getByLabel('Trace results')
  await expect(results).toContainText('Physical path found')
  await expect(results.getByTestId('route-row')).toContainText([
    'EDGE-17 · Port 1 → AGG-03 · Port 1 · AGG · Network A',
    'EDGE-17 · Port 2 → AGG-08 · Port 1 · AGG · Network A',
    'EDGE-17 · Port 3 → BB-01 · Port 1 · BB · Network A',
  ])
  await expect(results.getByTestId('route-row')).toHaveCount(3)
  await expect(results.getByTestId('route-row').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await results.getByTestId('route-row').nth(2).click()
  await expect(results.getByTestId('route-row').nth(2)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(results.getByTestId('mismatches')).toHaveCount(0)
  await expect(results.getByTestId('truncation')).toHaveCount(0)
  // The summary line sits above the route rows, and all three rows are visible at once.
  await expect(results).toContainText('3 routes · BB-01 · BB · Network A')
  await expect(results.getByTestId('route-row')).toHaveCount(3)
  for (const i of [0, 1, 2])
    await expect(results.getByTestId('route-row').nth(i)).toBeVisible()
  const summary = (await results.locator('.trace-summary').boundingBox())!
  const first = (await results.getByTestId('route-row').first().boundingBox())!
  expect(summary.y).toBeLessThan(first.y)
})
