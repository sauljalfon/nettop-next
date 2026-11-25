import { expect, test } from './fixtures'
import type { Plan } from '../src/shared/types'
import {
  expandResults,
  fitted,
  leaveTrace,
  oneRoute,
  selectEquipment,
  traceRoutes,
} from './helpers'

// A cable from EDGE-17 (Network A) to AGG-12 (Network B) is physically valid. Find
// AGG / BB reports the Network B destination apart from the routes.
test('POL-13 a cross-network cable gives three routes plus AGG-12 as a mismatch, in the map overlay and the Trace tool', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/plans', {
    data: { name: 'Cross network', expectedBaseRevision: 'acceptance-1' },
  })
  let plan = (await created.json()) as Plan
  const saved = await request.post(`/api/plans/${plan.id}/commands`, {
    data: {
      type: 'add_cable',
      expectedRevision: plan.revision,
      cable: { a: 'edge-17:p4', b: 'agg-12:p2' },
    },
  })
  expect(saved.status()).toBe(200)
  plan = (await saved.json()) as Plan

  await page.goto(`/?plan=${plan.id}`)
  await fitted(page)
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()

  // The Trace page: the three routes, and the mismatch listed apart.
  const items = page.getByTestId('trace-list').getByTestId('trace-item')
  const mismatches = page
    .getByTestId('trace-list')
    .locator('[data-testid="trace-item"][data-kind="mismatch"]')
  await expect(traceRoutes(page)).toHaveCount(3)
  await expect(traceRoutes(page)).toContainText(['AGG-03', 'AGG-08', 'BB-01'])
  await expect(page.getByTestId('trace-list')).toContainText(
    '3 routes · 1 mismatch',
  )
  await expect(mismatches).toHaveCount(1)
  await expect(mismatches).toContainText('AGG-12')
  await expect(mismatches).toContainText('Network B')
  await expect(items).toHaveCount(4)
  await expect(traceRoutes(page).filter({ hasText: 'AGG-12' })).toHaveCount(0)

  // The same trace, reopened from the chip in Physical, says the same.
  await leaveTrace(page)
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expandResults(page)
  await expect(traceRoutes(page)).toHaveCount(3)
  await expect(mismatches).toHaveCount(1)
  await expect(mismatches).toContainText('AGG-12')
  await oneRoute(page)
  await mismatches.click()
  await expect(page.getByTestId('trace-note')).toContainText('Network B')
  await leaveTrace(page)

  // The installed topology has no such cable: no mismatch there.
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await expect(traceRoutes(page)).toHaveCount(3)
  await expect(mismatches).toHaveCount(0)
})
