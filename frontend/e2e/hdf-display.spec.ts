import { expect, test } from '@playwright/test'
import type { Plan } from '../src/shared/types'
import { marks } from './helpers'

// Minimal handling only: an HDF must never present as an active device. Real HDF
// UI arrives with M4.
test('a proposed HDF renders as passive equipment, not an active switch', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/plans', {
    data: { name: 'HDF display', expectedBaseRevision: 'acceptance-1' },
  })
  let plan = (await created.json()) as Plan
  const saved = await request.post(`/api/plans/${plan.id}/commands`, {
    data: {
      type: 'add_hdf',
      expectedRevision: plan.revision,
      hdf: {
        name: 'HDF-DISPLAY',
        rackId: 'rack-a03',
        unit: 3,
        height: 3,
        rows: 1,
      },
    },
  })
  expect(saved.status()).toBe(200)
  plan = (await saved.json()) as Plan
  const hdf = plan.equipment[0].id

  await page.goto('/')
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByLabel('Saved plan').selectOption(plan.id)
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  // The map shows the new card (the projection says so)…
  await expect.poll(async () => (await marks(page)).cards).toContain(hdf)
  // …but it is a proposed, unconnected card, parked below the rest. React Flow
  // only draws what is inside the viewport, so whether it is drawn depends on how
  // the view happens to be fitted. Bring it into view the way a user would.
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await page
    .locator('.tree-equipment')
    .filter({ hasText: 'HDF-DISPLAY' })
    .click()
  const card = page
    .locator('.equipment-card')
    .filter({ hasText: 'HDF-DISPLAY' })
  await expect(card).toBeVisible()
  await expect(card.locator('svg.lucide-panel-top')).toBeVisible()
  await expect(card.locator('svg.lucide-network')).toHaveCount(0)
  await expect(card.locator('svg.lucide-git-fork')).toHaveCount(0)
})
