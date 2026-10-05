import { expect, test } from '@playwright/test'
import type { Plan } from '../src/shared/types'
import { fitted } from './helpers'

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
  await page.getByTestId('rf__node-edge-17').click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()

  // The map overlay: the same three routes, and the mismatch listed apart.
  const overlay = page.getByLabel('Map trace results')
  await expect(overlay.getByTestId('route-row')).toHaveCount(3)
  await expect(overlay.getByTestId('route-row')).toContainText([
    'AGG-03',
    'AGG-08',
    'BB-01',
  ])
  const mismatches = overlay.getByTestId('mismatches')
  await expect(mismatches).toContainText('On another network (not routes)')
  await expect(mismatches).toContainText('AGG-12')
  await expect(mismatches).toContainText('Network B')
  await expect(mismatches.locator('li')).toHaveCount(1)
  await expect(
    overlay.getByTestId('route-row').filter({ hasText: 'AGG-12' }),
  ).toHaveCount(0)

  // The Trace tool's results (the Physical view's drawer) say the same.
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  const panel = page.getByLabel('Trace results')
  await expect(panel.locator('select option')).toHaveCount(3)
  const apart = panel.getByTestId('mismatches')
  await expect(apart).toContainText('On another network (not routes)')
  await expect(apart).toContainText('AGG-12')
  await expect(apart).toContainText('EDGE-17 · Port 4')

  // The installed topology has no such cable: no mismatch there.
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await page.getByTestId('rf__node-edge-17').click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(
    page.getByLabel('Map trace results').getByTestId('route-row'),
  ).toHaveCount(3)
  await expect(
    page.getByLabel('Map trace results').getByTestId('mismatches'),
  ).toHaveCount(0)
})
