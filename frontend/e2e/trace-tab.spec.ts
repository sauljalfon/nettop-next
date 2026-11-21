import { expect, test } from './fixtures'
import { fitted, selectEquipment, settledViewport, viewport } from './helpers'

const dock = (page: import('./fixtures').Page) =>
  page.locator('.dock:not([hidden])')

async function findFromInspector(page: import('./fixtures').Page) {
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
}

test.use({ viewport: { width: 1536, height: 864 } })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('TR-01 Find AGG / BB from the inspector opens the Trace tab with the routes', async ({
  page,
}) => {
  await findFromInspector(page)
  await expect(
    dock(page).getByRole('tab', { name: 'Trace', selected: true }),
  ).toBeVisible()
  const rows = dock(page).getByTestId('route-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('AGG-03')
  await expect(rows.first()).toHaveAttribute('aria-pressed', 'true')
  // The tree beside lights the route; nothing is drawn over the map.
  await expect(
    page.locator('[data-view="hierarchy"] [data-on-route="true"]').first(),
  ).toBeAttached()
  await expect(page.locator('.map-results')).toHaveCount(0)
  await expect(
    page.locator('.flow-surface').getByTestId('route-row'),
  ).toHaveCount(0)
  await expect(
    dock(page).getByRole('button', { name: 'Clear trace' }),
  ).toBeVisible()
  // At 1536x864 all three routes are inside the dock's visible box, without scrolling.
  const box = (await dock(page)
    .locator('.dock-body:not([hidden])')
    .boundingBox())!
  for (const i of [0, 1, 2]) {
    const r = (await rows.nth(i).boundingBox())!
    expect(r.y).toBeGreaterThanOrEqual(box.y)
    expect(r.y + r.height).toBeLessThanOrEqual(box.y + box.height)
  }
  // Open full page ⤢ is in the tab; the Route view toggle and the export went to the page.
  await expect(
    dock(page).getByRole('button', { name: 'Open full page ⤢' }),
  ).toBeVisible()
  await expect(
    dock(page).getByRole('button', { name: 'Route view' }),
  ).toHaveCount(0)
  await expect(dock(page).getByRole('button', { name: /^Export/ })).toHaveCount(
    0,
  )
})

test('TR-02 choosing a route lights it in place and never moves the view', async ({
  page,
}) => {
  await findFromInspector(page)
  const rows = dock(page).getByTestId('route-row')
  await expect(rows).toHaveCount(3)
  const lit = () =>
    page
      .locator('[data-view="hierarchy"] [data-line][data-on-route="true"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-line')).sort())
  const before = await lit()
  const port = await settledViewport(page)
  await rows.nth(2).click()
  await expect(rows.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(lit).not.toEqual(before)
  expect(await viewport(page)).toBe(port)
})

test('TR-03 a trace error shows in the tab with Refresh topology', async ({
  page,
}) => {
  await page.route('**/api/traces*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Trace engine unavailable' }),
    }),
  )
  await findFromInspector(page)
  await expect(
    dock(page).getByRole('tab', { name: 'Trace', selected: true }),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(dock(page).getByRole('alert')).toContainText(
    'Trace engine unavailable',
  )
  await expect(
    dock(page).getByRole('button', { name: 'Refresh topology' }),
  ).toBeVisible()
  await expect(page.locator('.map-results')).toHaveCount(0)
})

test('TR-04 in Physical the same tab, and a row opens that endpoint', async ({
  page,
}) => {
  await findFromInspector(page)
  await expect(dock(page).getByTestId('route-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expect(dock(page).getByTestId('route-row')).toHaveCount(3)
  await expect(page.locator('.map-results')).toHaveCount(0)
  await dock(page).getByTestId('route-row').nth(1).click()
  await dock(page)
    .getByTestId('walk-row')
    .filter({ hasText: 'in front 1D/2' })
    .click()
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-location',
    /rack:rack-core-01/,
  )
})
