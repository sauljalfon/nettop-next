import { expect, test } from '@playwright/test'

// Find AGG / BB in the UI against the acceptance fixture: EDGE-17 reaches two
// AGGs and one BB, listed AGG first, each naming destination, role and network.
// Mismatch and truncation rendering are unit-tested.
test('Find AGG / BB lists AGG then BB results with destination, role and network', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page
    .getByRole('combobox', { name: 'Start', exact: true })
    .selectOption({ label: 'EDGE-17 · all ports' })
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()

  const results = page.getByLabel('Trace results')
  await expect(results).toContainText('Physical path found')
  const options = results.locator('select option')
  await expect(options).toHaveText([
    'EDGE-17 · Port 1 → AGG-03 · Port 1 · AGG · Network A',
    'EDGE-17 · Port 2 → AGG-08 · Port 1 · AGG · Network A',
    'EDGE-17 · Port 3 → BB-01 · Port 1 · BB · Network A',
  ])
  await expect(results.getByTestId('route-destination')).toHaveText(
    'AGG-03 · AGG · Network A',
  )
  await results.locator('select').selectOption({ index: 2 })
  await expect(results.getByTestId('route-destination')).toHaveText(
    'BB-01 · BB · Network A',
  )
  await expect(results.getByTestId('mismatches')).toHaveCount(0)
  await expect(results.getByTestId('truncation')).toHaveCount(0)
})
