import { expect, test, type Page } from './fixtures'
import {
  expectNear,
  fitted,
  openRackInPhysical,
  hierarchyState,
  selectEquipment,
  settledViewport,
  viewport,
  expandResults,
  openExplore,
  findAggBb,
  leaveTrace,
  openInspector,
  oneRoute,
  traceRoutes,
} from './helpers'

// The explorer and the map write their state as data marks; these specs assert them.
const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)
const endpoint = (page: Page, id: string) =>
  page.locator(`[data-testid="face-endpoint"][data-endpoint-id="${id}"]`)
const peers = (page: Page) => page.getByTestId('peer-actions')
const side = (page: Page) => page.getByRole('group', { name: 'Side' })
const select = (page: Page) =>
  page.getByRole('combobox', { name: 'Show network' })

async function findFromEdge17(page: Page, route: number) {
  await findAggBb(page)
  await expect(traceRoutes(page)).toHaveCount(3)
  await traceRoutes(page).nth(route).click()
  await leaveTrace(page)
}

/** Pan the hierarchy by dragging empty canvas, so the viewport is not just the first fit. */
async function pan(page: Page) {
  const start = await viewport(page)
  const box = (await page.locator('[data-view="hierarchy"]').boundingBox())!
  const from = { x: box.x + box.width - 120, y: box.y + 100 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - 120, from.y - 40, { steps: 10 })
  await page.mouse.up()
  await expect.poll(() => viewport(page)).not.toBe(start)
}

async function expectMapUnchanged(
  page: Page,
  before: {
    viewport: string | null
    state: Awaited<ReturnType<typeof hierarchyState>>
  },
) {
  await expect(page.locator('[data-view="hierarchy"]')).toBeVisible()
  await expect.poll(() => viewport(page)).toBe(before.viewport)
  expect(await hierarchyState(page)).toEqual(before.state)
  // No automatic fit or centering follows: still the same a moment later.
  await page.waitForTimeout(600)
  expect(await viewport(page)).toBe(before.viewport)
}

const WALKS = [
  {
    name: 'AGG-03',
    route: 0,
    lit: ['agg-03', 'agg-03+agg-08|node-building-a'],
    litLines: ['group:agg-03+agg-08|node-building-a'],
    position: '3C/5',
    block: '3C',
    rear: 'hdf-01:sp-3C:5:r',
    front: 'hdf-01:sp-3C:5:f',
    cableRear: 'cable-a02',
    farRear: 'PANEL-A',
    cableFront: 'cable-a03',
    peer: 'hdf-02:sp-2B:3:f',
    peerPos: '2B / 3',
    cablePeerRear: 'cable-a04',
    dest: 'AGG-03',
    links: ['cable-a01', 'cable-a02', 'cable-a03', 'cable-a04'],
  },
  {
    name: 'BB-01',
    route: 2,
    lit: ['agg-03+agg-08|node-building-a', 'bb-01'],
    litLines: [],
    position: '2D/4',
    block: '2D',
    rear: 'hdf-01:sp-2D:4:r',
    front: 'hdf-01:sp-2D:4:f',
    cableRear: 'cable-a10',
    farRear: 'PANEL-A',
    cableFront: 'cable-a11',
    peer: 'hdf-02:sp-3A:1:f',
    peerPos: '3A / 1',
    cablePeerRear: 'cable-a12',
    dest: 'BB-01',
    links: ['cable-a09', 'cable-a10', 'cable-a11', 'cable-a12'],
  },
]

for (const w of WALKS)
  test(`PHY-10 the acceptance walkthrough for the ${w.name} route: HDF-01 ${w.position}, its peer and back to the same map`, async ({
    page,
  }) => {
    await page.goto('/')
    await fitted(page)
    await findFromEdge17(page, w.route)
    await pan(page)
    const before = {
      viewport: await settledViewport(page),
      state: await hierarchyState(page),
    }
    // The route lights the cards it touches and their lines.
    expect(before.state.cards).toEqual(w.lit)
    expect(before.state.lines).toEqual(w.litLines)

    // a. Physical → Main Campus → North Sub-main → SM01 → HDF-01.
    await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
    await page.locator('.rack-block[data-equipment-id="hdf-01"]').dblclick()
    await expectMark(page, 'data-physical-level', 'equipment')
    await expect(root(page)).toHaveAttribute(
      'data-location',
      'site:site-main-campus/node:node-north-sub-main/rack:rack-sm01/equipment:hdf-01',
    )

    // b. The rear position and its cable; then the same position's front.
    await side(page).getByRole('button', { name: 'Rear' }).click()
    await endpoint(page, w.rear).click()
    await expectMark(page, 'data-selected-endpoint', w.rear)
    await expect(endpoint(page, w.rear)).toHaveAttribute('data-state', 'route')
    await expect(
      page.locator(`[data-testid="face-block"][data-block="${w.block}"]`),
    ).toHaveAttribute('data-on-route', 'true')
    await expectNear(page, 'left', w.cableRear)
    await expectNear(page, 'left', w.farRear)
    await expectNear(page, 'left', 'rear')
    await peers(page).getByRole('button', { name: 'Switch to front' }).click()
    await expectMark(page, 'data-selected-endpoint', w.front)
    await expectMark(page, 'data-side', 'front')
    await expectNear(page, 'left', w.cableFront)
    await expectNear(page, 'left', 'HDF-02')

    // c. Go to peer: HDF-02's front, whose rear carries the cable to the destination.
    await peers(page).getByRole('button', { name: 'Go to peer' }).click()
    await expectMark(page, 'data-selected-endpoint', w.peer)
    await expectMark(page, 'data-side', 'front')
    await expect(root(page)).toHaveAttribute(
      'data-location',
      /equipment:hdf-02\//,
    )
    await expectNear(page, 'right', w.cablePeerRear)
    await expectNear(page, 'right', w.dest)
    await expectNear(page, 'right', 'Port 1')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expectMark(page, 'data-selected-endpoint', w.front)
    await expectMark(page, 'data-side', 'front')
    await expectMark(page, 'data-selected-equipment', 'hdf-01')

    // d. Back on the map: the same route, positions and viewport; no centering.
    await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
    await expectMapUnchanged(page, before)
    await expandResults(page)
    await expect(traceRoutes(page).nth(w.route)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await leaveTrace(page)
    // Selected equipment is shared: the inspector shows the last physical one.
    await openInspector(page)
    await expect(page.locator('.inspector-header h2')).toHaveText('HDF-01')
  })

test('PHY-11 the same walkthrough with Network B and AGG-12: 3C/2 is selected, and 3C/5 is visible as Network A', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await select(page).selectOption({ label: 'Network B' })
  await findAggBb(page, 'EDGE-22')
  await expect(traceRoutes(page)).toHaveCount(1)
  await leaveTrace(page)
  await pan(page)
  const before = {
    viewport: await settledViewport(page),
    state: await hierarchyState(page),
  }
  // The Network B route lights AGG-12, DR Access and the line between them.
  expect(before.state.cards).toEqual(['agg-12', 'agg-12|node-dr-access'])
  expect(before.state.lines).toEqual(['group:agg-12|node-dr-access'])

  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').dblclick()
  await side(page).getByRole('button', { name: 'Rear' }).click()
  await endpoint(page, 'hdf-01:sp-3C:2:r').click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:2:r')
  await expect(endpoint(page, 'hdf-01:sp-3C:2:r')).toHaveAttribute(
    'data-network',
    'net-b',
  )
  await expect(endpoint(page, 'hdf-01:sp-3C:2:r')).toHaveAttribute(
    'data-state',
    'route',
  )
  // The same block's 3C/5 is shown, as Network A's separate circuit.
  await expect(endpoint(page, 'hdf-01:sp-3C:5:r')).toBeVisible()
  await expect(endpoint(page, 'hdf-01:sp-3C:5:r')).toHaveAttribute(
    'data-network',
    'net-a',
  )
  await expect(endpoint(page, 'hdf-01:sp-3C:5:r')).toHaveAttribute(
    'data-state',
    'cabled',
  )
  await expectNear(page, 'left', 'cable-b02')
  await expectNear(page, 'left', 'PANEL-DR')
  await peers(page).getByRole('button', { name: 'Switch to front' }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:2:f')
  await expectNear(page, 'left', 'cable-b03')
  await expectNear(page, 'left', 'HDF-02')
  await peers(page).getByRole('button', { name: 'Go to peer' }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-02:sp-2B:6:f')
  await expectNear(page, 'right', 'cable-b04')
  await expectNear(page, 'right', 'AGG-12')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:2:f')

  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await expectMapUnchanged(page, before)
  await expect(select(page)).toHaveValue('net-b') // the filter is the one chosen
})

test('F05 a conceptual endpoint opens the exact place in Physical: from the inspector card and a hop', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await selectEquipment(page, 'HDF-01')

  // The card's button opens the equipment page.
  await page.getByRole('button', { name: 'Open in Physical: HDF-01' }).click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    'site:site-main-campus/node:node-north-sub-main/rack:rack-sm01/equipment:hdf-01',
  )
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()

  // A hop: in Conceptual it switches to Physical and opens that endpoint.
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await findAggBb(page)
  await oneRoute(page)
  await page
    .getByTestId('walk-row')
    .filter({ hasText: 'HDF-02' })
    .getByRole('button', { name: 'Open', exact: true })
    .click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-02:sp-2B:3:f')
  await expectMark(page, 'data-side', 'front')
  // In Physical the icon is there too, and does the same as clicking the row.
  await expandResults(page)
  await page
    .getByTestId('walk-row')
    .filter({ hasText: 'HDF-01' })
    .getByRole('button', { name: 'Open', exact: true })
    .click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  await expectMark(page, 'data-side', 'rear')
})

test('F11 Installed/Plan keeps the physical location, falling back to the nearest place that exists', async ({
  page,
}) => {
  await page.goto('/?plan=expansion')
  await fitted(page)
  // EDGE-18 is proposed in the plan, in Rack A03.
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block[data-equipment-id="edge-18"]').dblclick()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /rack:rack-a03\/equipment:edge-18$/,
  )
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  // It does not exist as installed equipment: the explorer shows its rack, not Sites.
  await expectMark(page, 'data-physical-level', 'rack')
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /node:node-building-a\/rack:rack-a03$/,
  )
  // Where it exists in both, the place is kept.
  await page.locator('.rack-block[data-equipment-id="edge-17"]').dblclick()
  await expectMark(page, 'data-physical-level', 'equipment')
  await page.getByRole('button', { name: /^Plan: / }).click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /rack:rack-a03\/equipment:edge-17$/,
  )
  await expect(
    page.getByRole('button', { name: 'Back', exact: true }),
  ).toBeEnabled()
})

test('D47-01 a site or node name opens it in Physical: from Explore on Conceptual, and from the inspector place line', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(page.locator('.flow-surface')).toBeVisible()
  // Explore on Conceptual: the site name, then (back on Conceptual) the node name.
  await openExplore(page)
  await page
    .getByRole('button', { name: 'Open Main Campus in Physical' })
    .click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await expectMark(page, 'data-physical-level', 'site')
  await expectMark(page, 'data-location', 'site:site-main-campus')
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await page
    .getByRole('button', { name: 'Open Building A in Physical' })
    .click()
  await expectMark(page, 'data-physical-level', 'node')
  await expectMark(
    page,
    'data-location',
    'site:site-main-campus/node:node-building-a',
  )

  // The inspector of EDGE-17: its site and node links do the same.
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await page.locator('[data-card-key="agg-03+agg-08|node-building-a"]').click()
  const drawer = page.getByTestId('hierarchy-drawer')
  await drawer.locator('[data-switch-id="edge-17"]').click()
  await drawer.getByRole('button', { name: 'Inspector' }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText('EDGE-17')
  await page
    .getByRole('button', { name: 'Open site Main Campus in Physical' })
    .click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await expectMark(page, 'data-physical-level', 'site')
  await expectMark(page, 'data-location', 'site:site-main-campus')
  await expect(
    page.getByRole('complementary', { name: 'Equipment inspector' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Open node Building A in Physical' })
    .click()
  await expectMark(page, 'data-physical-level', 'node')
  await expectMark(
    page,
    'data-location',
    'site:site-main-campus/node:node-building-a',
  )
})
