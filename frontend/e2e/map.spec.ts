import { expect, test, type Page } from '@playwright/test'

const viewport = (page: Page) =>
  page.locator('.react-flow__viewport').getAttribute('style')
// Only the position: the style attribute also carries React Flow's
// visibility: hidden until a card has been measured.
const transform = (page: Page, id: string) =>
  page
    .getByTestId(`rf__node-${id}`)
    .evaluate((n) => (n as HTMLElement).style.transform)

test('C01 default map shows equipment and actual cable references, not an inventory tree', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(11)
  await expect(page.locator('.canvas-container')).toHaveCount(0)
  const edge17 = page.getByTestId('rf__node-edge-17')
  await expect(edge17).toContainText('Main Campus / Building A / Rack A03')
  await expect(edge17).toContainText('3 of 24 cabled')
  await expect(page.getByTestId('rf__node-agg-15')).toContainText(
    '0 of 24 cabled',
  )
  // Sixteen cables: three bundles of three, and ten single lines.
  await expect(page.locator('.react-flow__edge')).toHaveCount(10)
  await expect(page.getByText('3 cables', { exact: true })).toHaveCount(3)
  const hdf = page.getByTestId('rf__node-hdf-01')
  await expect(hdf).toContainText('Network A')
  await expect(hdf).toContainText('Network B')
})

test('C07/C08 network filter retains shared HDFs and leaves positions alone', async ({
  page,
}) => {
  await page.goto('/')
  const before = await transform(page, 'hdf-01')
  const filter = page.getByRole('combobox', { name: 'Show network' })
  await filter.selectOption({ label: 'Network A' })
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(8)
  await expect(page.getByTestId('rf__node-edge-22')).toHaveCount(0)
  expect(await transform(page, 'hdf-01')).toBe(before)
  await filter.selectOption({ label: 'Network B' })
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(5)
  await expect(page.getByTestId('rf__node-hdf-01')).toBeVisible()
  await expect(page.getByTestId('rf__node-hdf-02')).toBeVisible()
  expect(await transform(page, 'hdf-01')).toBe(before)
  await expect(page.getByText('3 cables · Network A')).toBeVisible()
})

test('C10 opening and closing tools keeps the full-page canvas and viewport', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(11)
  const bounds = await page.locator('.flow-surface').boundingBox()
  const port = await viewport(page)
  for (const name of [
    'Open explorer',
    'Open trace tools',
    'Open inspector',
    'Add equipment library',
  ]) {
    await page.getByRole('button', { name, exact: true }).click()
    expect(await page.locator('.flow-surface').boundingBox()).toEqual(bounds)
    expect(await viewport(page)).toBe(port)
    await page.getByRole('button', { name, exact: true }).click()
  }
  await expect(page.locator('.studio-drawer')).toHaveCount(0)
})

test('C11 dragging a card is local: no requests, no viewport change, kept across context', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(11)
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/')) requests.push(r.url())
  })
  const planBefore = await (await request.get('/api/plans/expansion')).json()
  const port = await viewport(page)
  const item = page.getByTestId('rf__node-edge-17')
  const before = await item.boundingBox()
  if (!before) throw new Error('Node not visible')
  await page.mouse.move(before.x + 60, before.y + 20)
  await page.mouse.down()
  await page.mouse.move(before.x + 90, before.y + 70, { steps: 15 })
  await page.mouse.up()
  const moved = await transform(page, 'edge-17')
  expect((await item.boundingBox())!.y).toBeGreaterThan(before.y + 30)
  expect(await viewport(page)).toBe(port)
  expect(requests).toEqual([])
  expect(await (await request.get('/api/plans/expansion')).json()).toEqual(
    planBefore,
  )
  // The layout is shared by Installed and Plan and survives switching.
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await expect(page.getByTestId('rf__node-edge-18')).toBeVisible()
  expect(await transform(page, 'edge-17')).toBe(moved)
  expect(await viewport(page)).toBe(port)
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(page.getByTestId('rf__node-edge-18')).toHaveCount(0)
  expect(await transform(page, 'edge-17')).toBe(moved)
  expect(await viewport(page)).toBe(port)
})

test('C12 saving and refetching reconcile by ID without remounting or resetting', async ({
  page,
}) => {
  await page.goto('/?plan=expansion')
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(12)
  await page.evaluate(() => {
    document.querySelector('.flow-surface')!.setAttribute('data-mounted', 'yes')
  })
  const port = await viewport(page)
  const edge17 = await transform(page, 'edge-17')
  const agg03 = await transform(page, 'agg-03')

  await page.getByRole('button', { name: 'Changes', exact: false }).click()
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click()
  await page.getByLabel('Equipment name', { exact: true }).fill('EDGE-SAVED')
  await page.getByRole('combobox', { name: /^Network/ }).selectOption('net-a')
  await page.getByLabel('Starting unit', { exact: true }).fill('4')
  await page.getByRole('button', { name: 'Save equipment to plan' }).click()
  await expect(page.getByRole('status')).toContainText('revision 2')

  await expect(
    page.locator('.equipment-card').filter({ hasText: 'EDGE-SAVED' }),
  ).toHaveCount(1)
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(13)
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-mounted',
    'yes',
  )
  expect(await viewport(page)).toBe(port)
  expect(await transform(page, 'edge-17')).toBe(edge17)
  expect(await transform(page, 'agg-03')).toBe(agg03)
})
