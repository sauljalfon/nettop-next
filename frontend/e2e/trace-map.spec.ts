import { expect, test, type Page } from '@playwright/test'
import { fitted, pick, viewport } from './helpers'

const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')

// The trace from the Trace tools, so the overview stays the view.
async function traceFromTools(page: Page) {
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await pick(page, 'Start', 'edge-17 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}
const overview = (page: Page) => page.locator('[data-view="overview"]')
const positions = (page: Page) =>
  overview(page).getAttribute('data-node-positions')

test('P18 a route through equipment the network filter dims is still found and shown', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const all = await positions(page)
  const port = await viewport(page)
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  // Building A is Network A only: dimmed by the filter.
  const building = page.locator('[data-node-id="node-building-a"]')
  await expect(building).toHaveClass(/dimmed/)

  await traceFromTools(page)
  // The backend result is complete even though Building A is dimmed.
  await expect(rows(page)).toHaveCount(3)
  // The route's nodes are lit in place and no longer dimmed.
  for (const id of [
    'node-building-a',
    'node-north-sub-main',
    'node-main-distribution',
  ]) {
    const node = page.locator(`[data-node-id="${id}"]`)
    await expect(node).toHaveAttribute('data-on-route', 'true')
    await expect(node).not.toHaveClass(/dimmed/)
  }
  expect(await positions(page)).toBe(all)
  expect(await viewport(page)).toBe(port)

  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(building).toHaveClass(/dimmed/)
  await expect(building).toHaveAttribute('data-on-route', 'false')
  expect(await positions(page)).toBe(all)
  expect(await viewport(page)).toBe(port)
})

test('Clear trace removes the route marks only', async ({ page }) => {
  await page.goto('/')
  await fitted(page)
  const port = await viewport(page)
  const all = await positions(page)
  await traceFromTools(page)
  await expect(
    overview(page).locator('[data-on-route="true"]'),
  ).not.toHaveCount(0)
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(page.getByLabel('Map trace results')).toHaveCount(0)
  await expect(overview(page).locator('[data-on-route="true"]')).toHaveCount(0)
  expect(await positions(page)).toBe(all)
  expect(await viewport(page)).toBe(port)
})
