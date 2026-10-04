import { expect, test } from '@playwright/test'
import type { Plan } from '../src/shared/types'

// Minimal handling only: an HDF must never present as an active device. Real HDF
// UI arrives with M4.
test('a proposed HDF renders as passive equipment, not an active switch', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/plans', {
    data: { name: 'HDF display', expectedBaseRevision: 'acceptance-1' },
  })
  const plan = (await created.json()) as Plan
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

  await page.goto('/')
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByLabel('Saved plan').selectOption(plan.id)
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  const card = page
    .locator('.equipment-card')
    .filter({ hasText: 'HDF-DISPLAY' })
  await expect(card).toBeVisible()
  await expect(card.locator('svg.lucide-panel-top')).toBeVisible()
  await expect(card.locator('svg.lucide-network')).toHaveCount(0)
  await expect(card.locator('svg.lucide-git-fork')).toHaveCount(0)
})
