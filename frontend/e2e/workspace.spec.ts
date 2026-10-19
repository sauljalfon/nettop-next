import { expect, test } from '@playwright/test'
import {
  fitted,
  openRackInPhysical,
  overviewState,
  pick,
  expandResults,
} from './helpers'

test('trace physical continuity on the map and in rack elevations', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await fitted(page)
  await expect(page.locator('.studio-drawer')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  // The selected route lights its node cards and lines, and its walk sheet names the exact positions.
  await expect
    .poll(async () => (await overviewState(page)).nodes)
    .toEqual([
      'node-building-a',
      'node-main-distribution',
      'node-north-sub-main',
    ])
  expect((await overviewState(page)).pairs.length).toBeGreaterThan(0)
  const sheet = page.getByTestId('walk-sheet')
  await expect(sheet).toContainText('3C/5')
  await expect(sheet).toContainText('2B/3')
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
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
  // Choose EDGE-17 Port 2 as the trace start in the Trace tools.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await pick(page, 'Start', 'edge-17 port 2', 'EDGE-17 · Port 2')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expandResults(page)
  await expect(
    page.getByText(/4 cables · 3 internal bridges/).first(),
  ).toBeVisible()
  await expect(page.getByTestId('route-row')).toContainText(
    'AGG-08 · Port 1 · AGG · Network A',
  )
  await page
    .getByRole('combobox', { name: 'Trace mode', exact: true })
    .selectOption('point_to_point')
  await pick(page, 'Start', 'edge-17 port 1', 'EDGE-17 · Port 1')
  await pick(page, 'Destination', 'agg-03 port 1', 'AGG-03 · Port 1')
  await page
    .getByRole('button', { name: 'Trace physical path', exact: true })
    .click()
  await expandResults(page)
  await expect(
    page.getByText(/4 cables · 3 internal bridges/).first(),
  ).toBeVisible()
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
  await expandResults(page)
  await expect(
    page.getByText(/1 cables · 0 internal bridges/).first(),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(page.locator('.results-drawer')).toHaveCount(0)
  expect(errors).toEqual([])
})

// Dragging a node card saves the shared arrangement on the server: clear it after the test.
test.afterEach(async ({ request }) => {
  await request.delete('/api/map-layout')
})

test('panels overlay the full-page map and dragging does not render the shell', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const bounds = await page.locator('.flow-surface').boundingBox()
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await page.getByLabel('Find equipment').fill('agg-12')
  await expect(page.locator('.tree-equipment')).toHaveCount(1)
  await page.locator('.tree-equipment').click()
  // Choosing equipment in Explore opens the inspector on it (and Focus), with no highlight.
  await expect(page.locator('.inspector-header h2')).toHaveText('AGG-12')
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'DR Site › DR Distribution › Rack DR02 › AGG-12',
  )
  expect(await page.locator('.flow-surface').boundingBox()).toEqual(bounds)
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  // Back on the overview, DR Distribution holds AGG-12: that is the card to drag.
  await page.getByRole('button', { name: '‹ Overview' }).click()
  await fitted(page)
  const item = page.locator('[data-node-id="node-dr-distribution"]')
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
  await page.mouse.move(before.x + 30, before.y + 14)
  await page.mouse.down()
  await page.mouse.move(before.x + 45, before.y + 44, { steps: 12 })
  await page.mouse.up()
  const after = await item.boundingBox()
  expect(after?.y).toBeGreaterThan(before.y + 8)
  expect(
    await page.evaluate(
      () => (window as unknown as { shellMutations: number }).shellMutations,
    ),
  ).toBe(0)
})
