import { expect, test, type Page } from './fixtures'
import { fitted, pick, viewport } from './helpers'

const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')

// The trace from the Trace tools, so the hierarchy stays the view.
async function traceFromTools(page: Page) {
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await pick(page, 'Start', 'edge-17 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}
const hierarchy = (page: Page) => page.locator('[data-view="hierarchy"]')
const positions = (page: Page) =>
  hierarchy(page).getAttribute('data-card-positions')
const choose = (page: Page, label: string) =>
  page.getByRole('combobox', { name: 'Show network' }).selectOption({ label })

test('P18 a route found while the map shows another network is still complete, and shows lit when its network is drawn', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await choose(page, 'Network B')
  await expect(hierarchy(page)).toHaveAttribute('data-network', 'net-b')
  await expect(hierarchy(page)).toHaveAttribute('data-fitted', 'true')
  const all = await positions(page)
  const port = await viewport(page)

  await traceFromTools(page)
  // The backend result is complete (three routes) though the map draws Network B:
  // none of its cards is on the route, and nothing is dimmed or moved.
  await expect(rows(page)).toHaveCount(3)
  await expect(hierarchy(page).locator('[data-on-route="true"]')).toHaveCount(0)
  await expect(page.locator('.dimmed')).toHaveCount(0)
  expect(await positions(page)).toBe(all)
  expect(await viewport(page)).toBe(port)

  // Network A draws the route lit in place.
  await choose(page, 'Network A')
  await expect(hierarchy(page)).toHaveAttribute('data-network', 'net-a')
  const building = page.locator(
    '[data-card-key="agg-03+agg-08|node-building-a"]',
  )
  await expect(building).toHaveAttribute('data-on-route', 'true')
  await expect(page.locator('[data-card-key="agg-03"]')).toHaveAttribute(
    'data-on-route',
    'true',
  )
  await expect(page.locator('.dimmed')).toHaveCount(0)

  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(building).toHaveAttribute('data-on-route', 'false')
})

test('Clear trace removes the route marks only', async ({ page }) => {
  await page.goto('/')
  await fitted(page)
  const port = await viewport(page)
  const all = await positions(page)
  await traceFromTools(page)
  await expect(
    hierarchy(page).locator('[data-on-route="true"]'),
  ).not.toHaveCount(0)
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(page.getByLabel('Map trace results')).toHaveCount(0)
  await expect(hierarchy(page).locator('[data-on-route="true"]')).toHaveCount(0)
  expect(await positions(page)).toBe(all)
  expect(await viewport(page)).toBe(port)
})
