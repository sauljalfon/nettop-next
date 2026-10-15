import { expect, test, type Page } from '@playwright/test'
import {
  expectMarks,
  fitted,
  highlightLocation,
  pick,
  viewport,
} from './helpers'
import { chooseRack } from './patching-helpers'

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
  await expect(edge17).toContainText('Main Campus › Building A › Rack A03')
  await expect(edge17).toContainText('3 of 24 cabled')
  await expect(page.getByTestId('rf__node-agg-15')).toContainText(
    '0 of 24 cabled',
  )
  // Sixteen cables: three bundles of three, and ten single lines.
  await expect(page.locator('.react-flow__edge')).toHaveCount(10)
  await expect(page.locator('.map-pill')).toHaveCount(3)
  await expect(page.locator('.map-pill').first()).toHaveText('3')
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
  await expect(
    page.locator('.map-caption', { hasText: 'Network A' }),
  ).toBeVisible()
})

test('C10 opening and closing tools keeps the full-page canvas and viewport', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(11)
  const bounds = await page.locator('.flow-surface').boundingBox()
  await fitted(page) // read the viewport only after the one-time fit has settled
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
  await fitted(page) // read the viewport only after the one-time fit has settled
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
  await fitted(page) // read the viewport only after the one-time fit has settled
  const port = await viewport(page)
  const edge17 = await transform(page, 'edge-17')
  const agg03 = await transform(page, 'agg-03')

  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Access switch…' }).click()
  const form = page.getByTestId('equipment-form')
  await form.getByLabel('Name').fill('EDGE-SAVED')
  await form.getByLabel('Network').selectOption('net-a')
  await chooseRack(form, 'Place', {
    site: 'Main Campus',
    node: 'Building A',
    rack: 'Rack A03',
  })
  await form.getByLabel('Unit', { exact: true }).fill('4')
  await form.getByRole('button', { name: 'Add to plan' }).click()
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

test('C13 a route and a highlight reveal objects the network filter hides, and hide them again', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const underB = ['agg-12', 'edge-22', 'hdf-01', 'hdf-02', 'panel-dr']
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  await expectMarks(page, { cards: underB })

  // A Network A route (EDGE-17 → AGG-03) shows its cards under the Network B filter.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await pick(page, 'Start', 'edge-17 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expectMarks(page, {
    cards: [...underB, 'agg-03', 'edge-17', 'panel-a'].sort(),
    routeCards: ['agg-03', 'edge-17', 'hdf-01', 'hdf-02', 'panel-a'],
  })
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expectMarks(page, { cards: underB })

  // A highlight of Building A shows EDGE-17 and PANEL-A under the same filter.
  await highlightLocation(page, 'Building A')
  await expectMarks(page, {
    cards: [...underB, 'edge-17', 'panel-a'].sort(),
    highlightCards: ['edge-17', 'panel-a'],
  })
  await page.getByRole('button', { name: 'Clear highlight' }).click()
  await expectMarks(page, { cards: underB })
})

test('VP-06 a card reads role, network and state in the paper look', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(page.getByText('Connected infrastructure.')).toHaveCount(0)
  const edge17 = page.getByTestId('rf__node-edge-17')
  const panel = page.getByTestId('rf__node-panel-a')
  await expect(panel.locator('.card-role')).toHaveText('Patch panel')
  await expect(edge17.locator('.card-role')).toHaveText('Access')
  await expect(
    edge17.locator('.network-badge', { hasText: 'Network A' }),
  ).toBeVisible()

  // Selected: an ink ring.
  await edge17.locator('.map-card').click()
  await expect(edge17.locator('.map-card')).toHaveClass(/selected/)
  const ring = await edge17
    .locator('.map-card')
    .evaluate((c) => getComputedStyle(c).boxShadow)
  expect(ring).toContain('rgb(28, 43, 58)')

  // On the route: the route colour.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await pick(page, 'Start', 'edge-17 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expectMarks(page, {
    routeCards: ['agg-03', 'edge-17', 'hdf-01', 'hdf-02', 'panel-a'],
  })
  for (const id of ['agg-03', 'panel-a']) {
    const border = await page
      .getByTestId(`rf__node-${id}`)
      .locator('.map-card')
      .evaluate((c) => getComputedStyle(c).borderTopColor)
    expect(border).toBe('rgb(15, 139, 122)')
  }
})
