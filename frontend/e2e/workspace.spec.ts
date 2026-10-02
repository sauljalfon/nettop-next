import { expect, test } from '@playwright/test'

test('trace physical continuity in nested containers and rack elevations', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Your network, in context.' }),
  ).toBeVisible()
  await expect(page.locator('.studio-drawer')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Trace physical path', exact: true })
    .click()
  await expect(page.getByText(/3 cables · 2 internal bridges/)).toBeVisible()
  await expect(page.locator('.react-flow__edge.animated')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await page.screenshot({
    path: testInfo.outputPath('whiteboard.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Collapse Server Room' }).click()
  await expect(page.getByTestId('rf__node-edge-01')).toHaveCount(0)
  await expect(
    page.getByTestId('rf__node-node:node-server').locator('.canvas-container'),
  ).toHaveClass(/traced/)
  await page.getByRole('button', { name: 'Expand Server Room' }).click()
  await page.getByRole('button', { name: 'Racks', exact: true }).click()
  await expect(page.locator('.rack-device.traced')).toHaveCount(4)
  await page.screenshot({
    path: testInfo.outputPath('racks.png'),
    fullPage: true,
  })
  await page
    .getByRole('button', { name: 'EDGE-01 SFP+ 2, set trace start' })
    .click()
  await page
    .getByRole('button', { name: 'Trace physical path', exact: true })
    .click()
  await expect(page.getByText('No route', { exact: true })).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Trace mode', exact: true })
    .selectOption('point_to_point')
  await page
    .getByRole('combobox', { name: 'Start', exact: true })
    .selectOption('edge-01:p1')
  await page
    .getByRole('combobox', { name: 'Destination', exact: true })
    .selectOption('agg-02:p1')
  await page
    .getByRole('button', { name: 'Trace physical path', exact: true })
    .click()
  await expect(page.getByText(/3 cables · 2 internal bridges/)).toBeVisible()
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await expect(page.locator('.results-drawer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Start', exact: true })
    .selectOption('device:edge-02')
  await page
    .getByRole('button', { name: 'Trace physical path', exact: true })
    .click()
  await expect(page.getByText(/1 cables · 0 internal bridges/)).toBeVisible()
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(page.locator('.results-drawer')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('panels overlay a full-page canvas and dragging does not render the shell', async ({
  page,
}) => {
  await page.goto('/')
  const bounds = await page.locator('.flow-surface').boundingBox()
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await page.getByLabel('Find equipment').fill('agg')
  await expect(page.locator('.tree-equipment')).toHaveCount(1)
  await page.locator('.tree-equipment').click()
  await expect(page.locator('.inspector-hero h2')).toHaveText('AGG-02')
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'Distribution Room / Rack 04 / AGG-02',
  )
  expect(await page.locator('.flow-surface').boundingBox()).toEqual(bounds)
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const item = page.getByTestId('rf__node-edge-01')
  await item.click()
  await expect(page.locator('.inspector-hero h2')).toHaveText('EDGE-01')
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
