import { expect, test } from './fixtures'
import {
  openEquipmentPage,
  fitted,
  openRackInPhysical,
  viewport,
  settledViewport,
  hierarchyState,
  findAggBb,
  leaveTrace,
  oneRoute,
  traceRoutes,
} from './helpers'

test('trace physical continuity on the map and in rack elevations', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await fitted(page)
  await expect(page.locator('.dock:not([hidden])')).toHaveCount(0)
  await findAggBb(page)
  await expect(traceRoutes(page)).toHaveCount(3)
  // The walk of the selected route names the exact positions.
  await oneRoute(page)
  const walk = page.getByTestId('trace-walk')
  await expect(walk).toContainText('3C/5')
  await expect(walk).toContainText('2B/3')
  await leaveTrace(page)
  // The selected route lights its cards and lines.
  await expect
    .poll(async () => (await hierarchyState(page)).cards)
    .toEqual(['agg-03', 'agg-03+agg-08|node-building-a'])
  expect((await hierarchyState(page)).lines).toEqual([
    'group:agg-03+agg-08|node-building-a',
  ])
  await page.screenshot({
    path: testInfo.outputPath('map.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  // The explorer marks the route's equipment; the racks show them one at a time.
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-route-equipment',
    'agg-03 edge-17 hdf-01 hdf-02 panel-a',
  )
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  // EDGE-17 and PANEL-A are the route's equipment in this rack, one unit each.
  for (const id of ['edge-17', 'panel-a'])
    await expect(
      page.locator(`.rack-block[data-equipment-id="${id}"]`),
    ).toHaveAttribute('data-on-route', 'true')
  await page.screenshot({
    path: testInfo.outputPath('racks.png'),
    fullPage: true,
  })
  // Start from EDGE-17 Port 2 only (its jack on its page): Find AGG / BB from here.
  await openEquipmentPage(page, 'EDGE-17')
  await page.locator('[data-endpoint-id="edge-17:p2"]').click()
  await page.getByRole('button', { name: 'Find AGG / BB from here' }).click()
  await expect(traceRoutes(page)).toHaveCount(1)
  await expect(traceRoutes(page).first()).toContainText('4 cables')
  await expect(traceRoutes(page).first()).toContainText('AGG-08 · Port 1')
  await expect(traceRoutes(page).first()).toContainText('AGG')
  await leaveTrace(page)
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await expect(page.locator('.results-drawer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await findAggBb(page, 'EDGE-18')
  await expect(traceRoutes(page).first()).toContainText('1 cable')
  await leaveTrace(page)
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(page.locator('.results-drawer')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the dock sits beside the map (the map’s right edge is the dock’s left edge) and panning does not render the shell', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const bounds = await page.locator('.flow-surface').boundingBox()
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await page.getByLabel('Find equipment').fill('agg-12')
  await expect(page.locator('.tree-equipment')).toHaveCount(1)
  await page.locator('.tree-equipment').click()
  // Choosing equipment in Explore opens the inspector on it (and selects it on the tree).
  await expect(page.locator('.inspector-header h2')).toHaveText('AGG-12')
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'DR Site › DR Distribution › Rack DR02 · U8',
  )
  const surface = (await page.locator('.flow-surface').boundingBox())!
  const dock = (await page.locator('.dock:not([hidden])').boundingBox())!
  expect(Math.abs(surface.x + surface.width - dock.x)).toBeLessThanOrEqual(1)
  expect([surface.x, surface.y, surface.height]).toEqual([
    bounds!.x,
    bounds!.y,
    bounds!.height,
  ])
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  // The tree shows AGG-12 selected: panning it must not touch the shell.
  await fitted(page)
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
  const view = await settledViewport(page)
  const box = (await page.locator('[data-view="hierarchy"]').boundingBox())!
  // Empty canvas, clear of the selection's drawer on the right.
  const from = { x: box.x + box.width / 2, y: box.y + box.height - 160 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - 60, from.y - 30, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => viewport(page)).not.toBe(view)
  expect(
    await page.evaluate(
      () => (window as unknown as { shellMutations: number }).shellMutations,
    ),
  ).toBe(0)
})
