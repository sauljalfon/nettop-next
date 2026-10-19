import { expect, test, type Page } from '@playwright/test'
import { fitted, openExplore } from './helpers'

const clear = (page: Page) =>
  page.getByRole('button', { name: 'Clear highlight' })

test('POL-15 equipment in Explore is selected, opens the inspector and Focus on it, with no highlight', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openExplore(page)
  await page.locator('.tree-equipment').filter({ hasText: 'AGG-08' }).click()

  await expect(page.locator('.inspector-header h2')).toHaveText('AGG-08')
  const focus = page.locator('[data-view="focus"]')
  await expect(focus).toHaveAttribute('data-focus-id', 'agg-08')
  await expect(
    focus.locator('[data-equipment-id="agg-08"][data-side="center"]'),
  ).toHaveClass(/selected/)
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0)
  await expect(clear(page)).toHaveCount(0)
  await expect(page.locator('.focus-card.dimmed')).toHaveCount(0)

  // Enter in the search chooses the first match the same way.
  await openExplore(page)
  const search = page.getByLabel('Find equipment')
  await search.fill('bb')
  await search.press('Enter')
  await expect(page.locator('.inspector-header h2')).toHaveText('BB-01')
  await expect(focus).toHaveAttribute('data-focus-id', 'bb-01')
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0)

  // In Physical, Explore follows the view: equipment opens its rack there, and
  // neither the map nor the inspector is touched.
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await openExplore(page)
  await page.locator('.tree-equipment').filter({ hasText: 'EDGE-22' }).click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-location',
    /rack:rack-dr01/,
  )
  await expect(page.getByLabel('Equipment inspector')).toHaveCount(0)
})
