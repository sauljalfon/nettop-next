import { expect, type Page, test } from './fixtures'
import { fitted, openRackInPhysical } from './helpers'

const box = async (page: Page, selector: string) =>
  (await page.locator(selector).boundingBox())!

/** EDGE-17's page by the rack, so the dock stays closed. */
async function openEdge17(page: Page) {
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block[data-equipment-id="edge-17"]').click()
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-physical-level',
    'equipment',
  )
}

test('D50-04 (a) a cabled jack’s card is in the side column beside the face, Connects to above it, and the dock stays closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await fitted(page)
  await openEdge17(page)
  const side = page.getByTestId('work-side')
  await expect(side.getByTestId('endpoint-empty')).toHaveText(
    'Select a jack on the face to see where it goes.',
  )
  await expect(page.getByTestId('endpoint-detail')).toHaveCount(0)
  await expect(side.getByTestId('connects-to')).toBeVisible()

  await page.locator('[data-endpoint-id="edge-17:p1"]').click()
  const card = page.getByTestId('endpoint-detail')
  await expect(card).toBeVisible()
  await expect(side.getByTestId('endpoint-detail')).toBeVisible()
  await expect(side.getByTestId('endpoint-empty')).toHaveCount(0)
  const face = await box(page, '.face-card')
  const c = (await card.boundingBox())!
  const connects = await box(page, '[data-testid="connects-to"]')
  expect(c.x).toBeGreaterThanOrEqual(face.x + face.width - 1)
  expect(Math.abs(connects.y - face.y)).toBeLessThan(30)
  expect(connects.y + connects.height).toBeLessThanOrEqual(c.y + 1)
  // The dock never opens for a jack.
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Port' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Close Port details' }).click()
  await expect(card).toHaveCount(0)
  await expect(side.getByTestId('endpoint-empty')).toBeVisible()
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
})

test('D50-04 (a) the side column is 340px wide, 400px from 1700px of page width, and under the face below 1080px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await fitted(page)
  await openEdge17(page)
  expect(Math.round((await box(page, '[data-testid="work-side"]')).width)).toBe(
    400,
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect
    .poll(async () =>
      Math.round((await box(page, '[data-testid="work-side"]')).width),
    )
    .toBe(340)
  await page.setViewportSize({ width: 1000, height: 900 })
  await expect
    .poll(async () => {
      const face = await box(page, '.face-card')
      const side = await box(page, '[data-testid="work-side"]')
      return side.y >= face.y + face.height - 1
    })
    .toBe(true)
  // The two cards sit side by side under the face.
  await page.locator('[data-endpoint-id="edge-17:p1"]').click()
  const connects = await box(page, '[data-testid="connects-to"]')
  const card = (await page.getByTestId('endpoint-detail').boundingBox())!
  expect(card.x).toBeGreaterThanOrEqual(connects.x + connects.width - 1)
  expect(Math.abs(card.y - connects.y)).toBeLessThan(2)
})

const pathCard = (page: Page) => page.getByTestId('path-bar')
const emptyLine =
  'Select a cabled jack on the face to draw its path to the AGG or BB.'

async function openHdf01(page: Page) {
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-physical-level',
    'equipment',
  )
}

test('D50-04 (rest) the path card is under the face and the side column, spanning both, and its × clears the jack, its card and the path', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await fitted(page)
  await openEdge17(page)
  // No jack: the card is there as one line.
  await expect(pathCard(page)).toContainText(emptyLine)
  await page.locator('[data-endpoint-id="edge-17:p1"]').click()
  await expect(pathCard(page).getByTestId('path-plate').first()).toBeVisible()
  const face = await box(page, '.face-card')
  const side = await box(page, '[data-testid="work-side"]')
  const card = (await pathCard(page).boundingBox())!
  expect(card.y).toBeGreaterThanOrEqual(face.y + face.height - 1)
  expect(card.y).toBeGreaterThanOrEqual(side.y + side.height - 1)
  expect(Math.abs(card.x - face.x)).toBeLessThanOrEqual(2)
  expect(
    Math.abs(card.x + card.width - (side.x + side.width)),
  ).toBeLessThanOrEqual(2)
  await expect(pathCard(page)).not.toHaveCSS('position', 'fixed')
  await expect(page.getByRole('complementary')).toHaveCount(0)

  await pathCard(page).getByRole('button', { name: 'Close path' }).click()
  await expect(page.getByTestId('endpoint-detail')).toHaveCount(0)
  await expect(page.getByTestId('endpoint-empty')).toBeVisible()
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
  await expect(pathCard(page)).toContainText(emptyLine)
  await expect(pathCard(page).getByTestId('path-plate')).toHaveCount(0)
})

/** A jack of the path card: its width, and whether the last plate is inside the card (scrolled into view first). */
async function pathMetrics(page: Page) {
  const jack = pathCard(page).locator('.pn-jacks .pj').first()
  const w = (await jack.boundingBox())!.width
  const last = pathCard(page).getByTestId('path-plate').last()
  await last.scrollIntoViewIfNeeded()
  const inside = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="path-bar"]')!
    const lastPlate = [
      ...card.querySelectorAll('[data-testid="path-plate"]'),
    ].at(-1)!
    const c = card.getBoundingClientRect()
    const p = lastPlate.getBoundingClientRect()
    return p.left >= c.left - 0.5 && p.right <= c.right + 0.5
  })
  return { w, inside }
}

test('D50-05 the path card’s jacks scale with the card: larger at 1920×1080 than at 1230×760, and the last plate is fully visible inside the card (scrolled into view inside the card if needed)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await fitted(page)
  await openEdge17(page)
  await page.locator('[data-endpoint-id="edge-17:p1"]').click()
  await expect(pathCard(page).getByTestId('path-plate').first()).toBeVisible()
  const big = await pathMetrics(page)
  await page.setViewportSize({ width: 1230, height: 760 })
  await expect
    .poll(async () => (await pathMetrics(page)).w)
    .toBeLessThan(big.w - 4)
  const small = await pathMetrics(page)
  expect(big.w).toBeGreaterThan(small.w)
  expect(small.inside).toBe(true)
  expect(big.inside).toBe(true)
})

test('D50-06 Open the Trace page from the path card opens the Trace page', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openEdge17(page)
  await page.locator('[data-endpoint-id="edge-17:p1"]').click()
  await pathCard(page)
    .getByRole('button', { name: 'Open the Trace page' })
    .click()
  await expect(page.getByTestId('trace-page')).toBeVisible()
})

test('D50-04 (rest) at 1230×760 HDF-01 with a jack selected keeps every jack inside its plate and the path card is under it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1230, height: 760 })
  await page.goto('/')
  await fitted(page)
  await openHdf01(page)
  await page.locator('[data-endpoint-id="hdf-01:sp-3C:5:f"]').click()
  await expect(pathCard(page).getByTestId('path-plate').first()).toBeVisible()
  const m = await page.locator('.faceplate[data-fit]').evaluate((plate) => {
    const p = plate.getBoundingClientRect()
    const jacks = [
      ...plate.querySelectorAll('[data-testid="face-endpoint"]'),
    ].map((j) => j.getBoundingClientRect())
    return {
      count: jacks.length,
      small: jacks.filter((r) => r.width < 17.5).length,
      outside: jacks.filter(
        (r) =>
          r.left < p.left - 0.5 ||
          r.right > p.right + 0.5 ||
          r.top < p.top - 0.5 ||
          r.bottom > p.bottom + 0.5,
      ).length,
    }
  })
  expect(m.count).toBeGreaterThan(0)
  expect(m.small).toBe(0)
  expect(m.outside).toBe(0)
  const face = await box(page, '.face-card')
  const card = (await pathCard(page).boundingBox())!
  expect(card.y).toBeGreaterThanOrEqual(face.y + face.height - 1)
})

test('D50-04 (rest) at 1536×864 the side column is as tall as its content up to the room above the path card: Edit port details is visible without scrolling, and the column ends above the path card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 })
  await page.goto('/')
  await fitted(page)
  await openEdge17(page)
  await page.locator('[data-endpoint-id="edge-17:p1"]').click()
  await expect(pathCard(page).getByTestId('path-plate').first()).toBeVisible()
  const edit = page.getByRole('button', { name: 'Edit port details' })
  await expect(edit).toBeVisible()
  const sideEl = page.getByTestId('work-side')
  const m = await sideEl.evaluate((el) => ({ top: el.scrollTop }))
  expect(m.top).toBe(0)
  const e = (await edit.boundingBox())!
  const side = (await sideEl.boundingBox())!
  const card = (await pathCard(page).boundingBox())!
  expect(e.y + e.height).toBeLessThanOrEqual(side.y + side.height + 1)
  expect(side.y + side.height).toBeLessThanOrEqual(card.y + 1)
  expect(card.y + card.height).toBeLessThanOrEqual(864)
})

test('D50-04 (rest) at 1230×760 HDF-01 with a jack selected: the path card is inside the window, no jack is outside its plate, and the column scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1230, height: 760 })
  await page.goto('/')
  await fitted(page)
  await openHdf01(page)
  await page.locator('[data-endpoint-id="hdf-01:sp-3C:5:f"]').click()
  await expect(pathCard(page).getByTestId('path-plate').first()).toBeVisible()
  const card = (await pathCard(page).boundingBox())!
  expect(card.y + card.height).toBeLessThanOrEqual(760)
  const outside = await page
    .locator('.faceplate[data-fit]')
    .evaluate((plate) => {
      const p = plate.getBoundingClientRect()
      return [
        ...plate.querySelectorAll('[data-testid="face-endpoint"]'),
      ].filter((j) => {
        const r = j.getBoundingClientRect()
        return (
          r.left < p.left - 0.5 ||
          r.right > p.right + 0.5 ||
          r.top < p.top - 0.5 ||
          r.bottom > p.bottom + 0.5
        )
      }).length
    })
  expect(outside).toBe(0)
  const side = page.getByTestId('work-side')
  const sb = (await side.boundingBox())!
  expect(sb.y + sb.height).toBeLessThanOrEqual(card.y + 1)
  expect(
    await side.evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBeGreaterThan(0)
})

test('D50-04 (rest) under 1080px the column is not capped', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 900 })
  await page.goto('/')
  await fitted(page)
  await openEdge17(page)
  await page.locator('[data-endpoint-id="edge-17:p1"]').click()
  const over = await page
    .getByTestId('work-side')
    .evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(over).toBeLessThanOrEqual(1)
})
