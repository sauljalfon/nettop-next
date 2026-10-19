import { expect, test, type Page } from '@playwright/test'
import { fitted, pick, selectEquipment } from './helpers'

const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')

// The trace from the Trace tools, so the overview stays the view and its own buttons are on screen.
async function traceFromTools(page: Page) {
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await pick(page, 'Start', 'edge-17 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await expect(rows(page)).toHaveCount(3)
}

test('POL-02 every overlay button stays clickable with each drawer open', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromTools(page)
  const overlay = [
    page.getByRole('button', { name: 'Collapse results' }),
    page.getByRole('button', { name: 'Clear trace' }),
    rows(page).nth(0),
    rows(page).nth(1),
    rows(page).nth(2),
    page.getByRole('button', { name: 'Zoom In' }),
    page.getByRole('button', { name: 'Zoom Out' }),
    page.getByRole('button', { name: 'Fit View' }),
    page.getByRole('button', { name: 'Reset arrangement' }),
  ]
  const check = async () => {
    // A trial click runs every actionability check, including that nothing covers the button.
    for (const button of overlay) await button.click({ trial: true })
  }
  await check() // no drawer
  const drawers: [string, string][] = [
    ['Add equipment library', 'left'],
    ['Open explorer', 'left'],
    ['Open trace tools', 'right'],
    ['Open inspector', 'right'],
    ['Changes', 'right'],
  ]
  for (const [opener, side] of drawers) {
    const toggle = page.getByRole('button', {
      name: opener === 'Changes' ? /^Changes/ : opener,
      exact: opener !== 'Changes',
    })
    await toggle.click()
    await expect(page.locator('.studio')).toHaveClass(
      new RegExp(`drawer-${side}`),
    )
    await check()
    await toggle.click() // close it again
    await expect(page.locator('.studio-drawer')).toHaveCount(0)
  }
})

test('POL-32 a trace that fails with every drawer closed shows its error on the map, once', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  // Focus on EDGE-17 with every drawer closed; the trace starts from a line's circuit panel.
  await selectEquipment(page, 'EDGE-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(page.locator('.studio-drawer')).toHaveCount(0)
  await page.route('**/api/traces*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Trace engine unavailable' }),
    }),
  )
  await page.locator('[data-line="edge-17|agg-03"]').click()
  await page
    .getByRole('dialog', { name: /circuits/i })
    .getByRole('button', { name: 'Find AGG / BB from Port 1' })
    .click()
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'Trace engine unavailable' })
  await expect(alert).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(1)
  // With the Trace drawer open the error shows there instead, never twice.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(page.locator('.studio-drawer').getByRole('alert')).toContainText(
    'Trace engine unavailable',
  )
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  // It can be dismissed.
  await page.getByRole('button', { name: 'Dismiss trace error' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
