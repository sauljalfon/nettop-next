import { expect, test, type Page } from './fixtures'
import {
  fitted,
  viewport,
  findAggBb,
  leaveTrace,
  settledViewport,
  traceRoutes,
} from './helpers'

// The trace from a switch's inspector, so the hierarchy stays the view.
async function traceFromTools(page: Page) {
  await findAggBb(page, 'EDGE-17')
  await expect(traceRoutes(page)).toHaveCount(3)
  await leaveTrace(page)
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
  await traceFromTools(page)
  // Clear the selection (the Node tab's ×), or it would pull its own network back.
  await page.getByRole('tab', { name: 'Node' }).click()
  await page.getByRole('button', { name: 'Close Node details' }).click()
  await choose(page, 'Network B')
  await expect(hierarchy(page)).toHaveAttribute('data-network', 'net-b')
  await expect(hierarchy(page)).toHaveAttribute('data-fitted', 'true')
  const all = await positions(page)
  const port = await viewport(page)

  // The backend result is complete (three routes) though the map draws Network B:
  // none of its cards is on the route, and nothing is dimmed or moved.
  await expect(page.getByTestId('route-chip')).toBeVisible()
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
  await traceFromTools(page)
  await expect(
    hierarchy(page).locator('[data-on-route="true"]'),
  ).not.toHaveCount(0)
  // The selection pans the tree once; Clear trace must not move it again.
  const port = await settledViewport(page)
  const all = await positions(page)
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(page.getByTestId('route-chip')).toHaveCount(0)
  await expect(hierarchy(page).locator('[data-on-route="true"]')).toHaveCount(0)
  expect(await positions(page)).toBe(all)
  expect(await settledViewport(page)).toBe(port)
})
