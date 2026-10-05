import { expect, test } from '@playwright/test'
import { ROUTE_AGG_03, expectMarks, pick } from './helpers'

test('trace physical continuity on the map and in rack elevations', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Connected infrastructure.' }),
  ).toBeVisible()
  await expect(page.locator('.studio-drawer')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  // The selected route's four cables are highlighted and reveal exact positions.
  await expectMarks(page, { routeLinks: ROUTE_AGG_03 })
  await expect(page.getByLabel('HDF-01 shown connections')).toContainText(
    '3C / 5',
  )
  await expect(page.getByLabel('HDF-02 shown connections')).toContainText(
    '2B / 3',
  )
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await page.screenshot({
    path: testInfo.outputPath('map.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  // EDGE-17, PANEL-A and AGG-03 take one unit each; HDF-01 and HDF-02 three each.
  await expect(page.locator('.rack-device.traced')).toHaveCount(9)
  await page.screenshot({
    path: testInfo.outputPath('racks.png'),
    fullPage: true,
  })
  await page
    .getByRole('button', { name: 'EDGE-17 Port 2, set trace start' })
    .click()
  // The trace form lives in the trace tools only; the chosen start is kept.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByText(/4 cables · 3 internal bridges/)).toBeVisible()
  await expect(page.getByTestId('route-destination')).toHaveText(
    'AGG-08 · AGG · Network A',
  )
  await page
    .getByRole('combobox', { name: 'Trace mode', exact: true })
    .selectOption('point_to_point')
  await pick(page, 'Start', 'edge-17 port 1', 'EDGE-17 · Port 1')
  await pick(page, 'Destination', 'agg-03 port 1', 'AGG-03 · Port 1')
  await page
    .getByRole('button', { name: 'Trace physical path', exact: true })
    .click()
  await expect(page.getByText(/4 cables · 3 internal bridges/)).toBeVisible()
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await expect(page.locator('.results-drawer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Trace mode', exact: true })
    .selectOption('distribution')
  await pick(page, 'Start', 'edge-18 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByText(/1 cables · 0 internal bridges/)).toBeVisible()
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(page.locator('.results-drawer')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('panels overlay the full-page map and dragging does not render the shell', async ({
  page,
}) => {
  await page.goto('/')
  const bounds = await page.locator('.flow-surface').boundingBox()
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await page.getByLabel('Find equipment').fill('agg-12')
  await expect(page.locator('.tree-equipment')).toHaveCount(1)
  await page.locator('.tree-equipment').click()
  // Choosing equipment in Explore opens the inspector on it, with no highlight.
  await expect(page.locator('.inspector-header h2')).toHaveText('AGG-12')
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'DR Site / DR Distribution / Rack DR02 / AGG-12',
  )
  expect(await page.locator('.flow-surface').boundingBox()).toEqual(bounds)
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  // Explore centered AGG-12, so it is the card in view.
  const item = page.getByTestId('rf__node-agg-12')
  await item.click()
  await expect(page.locator('.inspector-header h2')).toHaveText('AGG-12')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await page.evaluate(() => {
    ;(window as unknown as { shellMutations: number }).shellMutations = 0
    new MutationObserver(() => {
      ;(window as unknown as { shellMutations: number }).shellMutations++
    }).observe(document.querySelector('.studio-header')!, {
      childList: true,
      subtree: true,
      attributes: true,
    })
  })
  const before = await item.boundingBox()
  if (!before) throw new Error('Node not visible')
  await page.mouse.move(before.x + 60, before.y + 20)
  await page.mouse.down()
  await page.mouse.move(before.x + 75, before.y + 40, { steps: 12 })
  await page.mouse.up()
  const after = await item.boundingBox()
  expect(after?.y).toBeGreaterThan(before.y + 8)
  expect(
    await page.evaluate(
      () => (window as unknown as { shellMutations: number }).shellMutations,
    ),
  ).toBe(0)
})
