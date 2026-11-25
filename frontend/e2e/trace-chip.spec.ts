import { expect, test, type Page } from './fixtures'
import { fitted, openRackInPhysical, selectEquipment } from './helpers'

// D49: a trace is the Trace page; after ← Back a route chip reopens it or clears it.
test.use({ viewport: { width: 1536, height: 864 } })

const tp = (page: Page) => page.getByTestId('trace-page')
const chip = (page: Page) => page.getByTestId('route-chip')
const back = (page: Page) =>
  tp(page).getByRole('button', { name: '← Back', exact: true })
const lit = (page: Page) => page.locator('[data-on-route="true"]')

async function findFromInspector(page: Page) {
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('D49-01 Find AGG / BB from a switch opens the Trace page on All routes', async ({
  page,
}) => {
  await findFromInspector(page)
  await expect(tp(page)).toBeVisible()
  await expect(tp(page)).toHaveAttribute('data-view', 'all')
  await expect(
    tp(page).getByRole('button', { name: 'All routes', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(tp(page).getByTestId('trace-route')).toHaveCount(3)
  await expect(page.locator('.dock:not([hidden])')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Trace' })).toHaveCount(0)
  await expect(chip(page)).toHaveCount(0)
  await page.screenshot({ path: 'test-results/d49/trace-page.png' })
})

test('D49-02 ← Back keeps the route lit and shows the route chip; the chip reopens the page; × clears the trace and the teal', async ({
  page,
}) => {
  await findFromInspector(page)
  await expect(tp(page).getByTestId('trace-route')).toHaveCount(3)
  await back(page).click()
  await expect(tp(page)).toHaveCount(0)
  await expect(lit(page).first()).toBeAttached()
  await expect(chip(page)).toHaveText(/^Route: EDGE-17 · .* → AGG-03 · /)
  await page.screenshot({ path: 'test-results/d49/tree-chip.png' })
  // The chip reopens the page.
  await chip(page).getByRole('button').first().click()
  await expect(tp(page)).toBeVisible()
  await expect(chip(page)).toHaveCount(0)
  await back(page).click()
  // × clears: the teal and the chip go.
  await chip(page).getByRole('button', { name: 'Clear trace' }).click()
  await expect(chip(page)).toHaveCount(0)
  await expect(lit(page)).toHaveCount(0)
  // Show on map from the page also leaves the chip.
  await findFromInspector(page)
  await tp(page)
    .getByRole('button', { name: 'Show on map', exact: true })
    .click()
  await expect(tp(page)).toHaveCount(0)
  await expect(chip(page)).toBeVisible()
})

test('D49-03 a failed trace shows on the Trace page with Refresh topology', async ({
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
  await expect(tp(page)).toBeVisible()
  await expect(tp(page).getByRole('alert')).toContainText(
    'Trace engine unavailable',
  )
  await expect(
    tp(page).getByRole('button', { name: 'Refresh topology' }),
  ).toBeVisible()
  await expect(back(page)).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Trace' })).toHaveCount(0)
})

test('D49-04 Find AGG / BB from a jack in Physical opens the page; ← Back returns to the jack’s page with the chip', async ({
  page,
}) => {
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').dblclick()
  await page
    .locator(
      '[data-testid="face-endpoint"][data-endpoint-id="hdf-01:sp-3C:5:f"]',
    )
    .click()
  await page
    .getByRole('button', { name: 'Open the Trace page', exact: true })
    .click()
  await expect(tp(page)).toBeVisible()
  await expect(tp(page)).toHaveAttribute('data-view', 'all')
  await back(page).click()
  await expect(tp(page)).toHaveCount(0)
  const root = page.locator('.physical-explorer')
  await expect(root).toHaveAttribute('data-physical-level', 'equipment')
  await expect(root).toHaveAttribute(
    'data-selected-endpoint',
    'hdf-01:sp-3C:5:f',
  )
  await expect(chip(page)).toBeVisible()
  await expect(chip(page)).toContainText('HDF-01')
  await page.screenshot({ path: 'test-results/d49/physical-chip.png' })
})
