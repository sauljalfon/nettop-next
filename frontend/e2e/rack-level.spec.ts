import { expect, type Page, test } from './fixtures'
import { fitted, openRackInPhysical } from './helpers'
import { newPlan } from './plan-api'

const level = (page: Page) => page.locator('.physical-explorer')
const slot = (page: Page, rack: string, unit: number) =>
  page.getByTestId(`rack-slot-${rack}-${unit}`)
const block = (page: Page, id: string) =>
  page.locator(`.rack-block[data-equipment-id="${id}"]`)
const cabinet = (page: Page) => page.locator('.rack-cabinet')

async function openCore01(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await fitted(page)
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 01',
  )
  await expect(level(page)).toHaveAttribute('data-physical-level', 'rack')
}

test('D50-07 the rack is a slim cabinet, every unit fits, a free run is one row, and a click shows the unit beside it', async ({
  page,
}) => {
  await openCore01(page)
  const box = (await cabinet(page).boundingBox())!
  expect(box.width).toBeLessThanOrEqual(250)
  expect(box.width).toBeGreaterThanOrEqual(190)
  // Every unit fits: nothing scrolls, the cabinet ends above the page's bottom.
  const scrolls = await page
    .locator('.rack-screen')
    .evaluate((el) => el.scrollHeight > el.clientHeight)
  expect(scrolls).toBe(false)
  // A free run of three or more is one dashed row; the hint is one line.
  const run = page.getByTestId('rack-run-rack-core-01-11-9')
  await expect(run).toContainText('11–9 · 3U free')
  await expect(slot(page, 'rack-core-01', 10)).toHaveCount(0)
  await expect(cabinet(page)).not.toContainText('Available')
  await expect(page.locator('.unit-label').first()).toHaveText('12')
  await expect(page.getByTestId('rack-hint')).toHaveText(
    'Double-click a unit to open its page.',
  )
  // Nothing chosen yet: the topmost equipment with ports is shown beside the rack.
  const chosen = page.getByTestId('rack-chosen')
  await expect(chosen).toHaveAttribute('data-equipment-id', /.+/)
  // A click on AGG-03 shows its face beside the rack; the level stays the rack.
  await block(page, 'agg-03').click()
  await expect(chosen).toHaveAttribute('data-equipment-id', 'agg-03')
  await expect(chosen.getByRole('heading', { name: 'AGG-03' })).toBeVisible()
  const face = (await chosen.locator('.face-card').boundingBox())!
  const rack = (await cabinet(page).boundingBox())!
  expect(face.x).toBeGreaterThanOrEqual(rack.x + rack.width - 1)
  await expect(level(page)).toHaveAttribute('data-physical-level', 'rack')
  await expect(
    page
      .getByRole('navigation', { name: 'Breadcrumbs' })
      .getByText('Rack Core 01'),
  ).toBeVisible()
  // Open page, and a double-click, each open the equipment page.
  await chosen.getByRole('button', { name: 'Open page' }).click()
  await expect(level(page)).toHaveAttribute('data-physical-level', 'equipment')
  await expect(level(page)).toHaveAttribute('data-selected-equipment', 'agg-03')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(level(page)).toHaveAttribute('data-physical-level', 'rack')
  await expect(chosen).toHaveAttribute('data-equipment-id', 'agg-03')
  await block(page, 'hdf-02').dblclick()
  await expect(level(page)).toHaveAttribute('data-physical-level', 'equipment')
  await expect(level(page)).toHaveAttribute('data-selected-equipment', 'hdf-02')
})

test('D50-08 a jack chosen beside the rack draws the path card under the rack and the device', async ({
  page,
}) => {
  await openCore01(page)
  await block(page, 'agg-03').click()
  const chosen = page.getByTestId('rack-chosen')
  const pathCard = page.getByTestId('path-bar')
  await expect(pathCard).toContainText('Select a cabled jack')
  await chosen.locator('[data-endpoint-id="agg-03:p1"]').click()
  await expect(pathCard.getByTestId('path-plate').first()).toBeVisible()
  const rack = (await cabinet(page).boundingBox())!
  const work = (await chosen.boundingBox())!
  const card = (await pathCard.boundingBox())!
  expect(card.y).toBeGreaterThanOrEqual(rack.y + rack.height - 1)
  expect(card.y).toBeGreaterThanOrEqual(work.y + work.height - 1)
  expect(Math.abs(card.x - rack.x)).toBeLessThanOrEqual(2)
  expect(card.x + card.width).toBeGreaterThanOrEqual(work.x + work.width - 2)
  await expect(level(page)).toHaveAttribute('data-physical-level', 'rack')
  // The rack still fits without scrolling with the card drawn.
  expect(
    await page
      .locator('.rack-screen')
      .evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(false)
  // The jack stays chosen after a round trip to the page.
  await chosen.getByRole('button', { name: 'Open page' }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(pathCard.getByTestId('path-plate').first()).toBeVisible()
})

test('D50-09 in a plan the free units are separate drop targets', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'Rack level drops')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 01',
  )
  await expect(level(page)).toHaveAttribute('data-physical-level', 'rack')
  for (const unit of [11, 10, 9, 3, 2, 1])
    await expect(slot(page, 'rack-core-01', unit)).toHaveAttribute(
      'data-drop-target',
      'true',
    )
  await expect(page.locator('[data-testid^="rack-run-"]')).toHaveCount(0)
})
