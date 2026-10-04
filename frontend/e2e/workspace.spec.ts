import { expect, test } from '@playwright/test'

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
  await expect(page.getByText(/4 cables · 3 internal bridges/)).toBeVisible()
  // The selected route's four cables are highlighted and reveal exact positions.
  await expect(page.locator('.react-flow__edge.animated')).toHaveCount(4)
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
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByText(/4 cables · 3 internal bridges/)).toBeVisible()
  await expect(page.getByTestId('route-destination')).toHaveText(
    'AGG-08 · AGG · Network A',
  )
  await page
    .getByRole('combobox', { name: 'Trace mode', exact: true })
    .selectOption('point_to_point')
  await page
    .getByRole('combobox', { name: 'Start', exact: true })
    .selectOption('edge-17:p1')
  await page
    .getByRole('combobox', { name: 'Destination', exact: true })
    .selectOption('agg-03:p1')
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
  await page
    .getByRole('combobox', { name: 'Start', exact: true })
    .selectOption('device:edge-18')
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
  await expect(page.locator('.inspector-hero h2')).toHaveText('AGG-12')
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'DR Site / DR Distribution / Rack DR02 / AGG-12',
  )
  expect(await page.locator('.flow-surface').boundingBox()).toEqual(bounds)
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const item = page.getByTestId('rf__node-edge-17')
  await item.click()
  await expect(page.locator('.inspector-hero h2')).toHaveText('EDGE-17')
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
