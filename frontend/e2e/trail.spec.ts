import { expect, test, type Page } from './fixtures'
import { expandResults, fitted, findAggBb } from './helpers'

const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)
const results = (page: Page) => page.getByLabel('Trace results')
const physical = (page: Page) =>
  page.getByRole('button', { name: 'Physical', exact: true })

async function traceAgg03(page: Page) {
  await findAggBb(page)
  await expect(page.getByTestId('route-row')).toHaveCount(3)
}

/** Each walk row's name stays on one line, with its icon beside it and not stretched. */
async function expectHopLayout(page: Page) {
  const rows = await page.getByTestId('walk-row').count()
  expect(rows).toBe(5)
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="walk-row"]')].map((row) => {
      const item = row.closest('li')!
      const name = row.querySelector('.walk-name')!.getBoundingClientRect()
      const icon = item.querySelector('.row-action')!.getBoundingClientRect()
      const r = row.getBoundingClientRect()
      return {
        text: row.querySelector('.walk-name')!.textContent,
        nameHeight: name.height,
        nameWidth: name.width,
        iconWidth: icon.width,
        iconHeight: icon.height,
        rowWidth: r.width,
        iconLeftOfRowEnd: icon.left < r.right - 1,
        sameLine: icon.top < r.bottom && icon.bottom > r.top,
      }
    }),
  )
  for (const b of boxes) {
    expect(b.nameHeight, `${b.text} wraps`).toBeLessThan(30)
    expect(b.nameWidth, `${b.text} is squeezed`).toBeGreaterThan(40)
    expect(b.iconWidth, `${b.text}'s icon is stretched`).toBeLessThanOrEqual(30)
    expect(b.iconHeight).toBeLessThanOrEqual(30)
    expect(b.rowWidth).toBeGreaterThan(b.iconWidth * 5)
    expect(b.iconLeftOfRowEnd, `${b.text}: icon over the row`).toBe(false)
    expect(b.sameLine, `${b.text}: icon not beside the row`).toBe(true)
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('TR-01 the walk rows keep their name on one line with the icon beside it, in both views', async ({
  page,
}) => {
  await traceAgg03(page)
  await expectHopLayout(page) // Conceptual: the panel is open
  await physical(page).click()
  await expectHopLayout(page)
})

test('TR-03 in Physical the results are in the Trace tab beside the page, and the walk sheet is inside the scrolling dock', async ({
  page,
}) => {
  await traceAgg03(page)
  // Conceptual: the routes are in the dock.
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await physical(page).click()
  const dock = page.locator('.dock:not([hidden])')
  await expect(results(page)).toBeVisible()
  await expect(dock.getByTestId('route-row')).toHaveCount(3)
  await expect(results(page)).toContainText('Find AGG / BB')
  await expect(results(page)).toContainText('3 routes')
  await expect(results(page)).toContainText('AGG-03')
  // The equipment page is not covered: its right edge is at or left of the dock's left edge.
  const dockBox = (await dock.boundingBox())!
  const pageBox = (await page.locator('.physical-explorer').boundingBox())!
  expect(pageBox.x + pageBox.width).toBeLessThanOrEqual(dockBox.x + 1)

  // The walk sheet is inside the dock, whose body scrolls.
  const sheet = results(page).getByTestId('walk-sheet')
  const sheetBox = (await sheet.boundingBox())!
  expect(sheetBox.x).toBeGreaterThanOrEqual(dockBox.x - 1)
  expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(
    dockBox.x + dockBox.width + 1,
  )
  const overflowY = await dock
    .locator('.dock-body:not([hidden])')
    .evaluate((el) => getComputedStyle(el).overflowY)
  expect(['auto', 'scroll']).toContain(overflowY)
  // The page itself does not scroll.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1,
    ),
  ).toBe(false)

  // Closing the trace clears it.
  await results(page).getByRole('button', { name: 'Clear trace' }).click()
  await expect(results(page)).toHaveCount(0)
})
