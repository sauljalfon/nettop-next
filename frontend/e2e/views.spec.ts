import { expect, test, type Page } from '@playwright/test'
import {
  expectMarks,
  fitted,
  openRackInPhysical,
  pick,
  viewport,
  expandResults,
} from './helpers'

// The explorer and the map write their state as data marks; these specs assert them.
const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)
const endpoint = (page: Page, id: string) =>
  page.locator(`[data-testid="face-endpoint"][data-endpoint-id="${id}"]`)
const external = (page: Page) => page.getByTestId('external-cable')
const internal = (page: Page) => page.getByTestId('internal-peer')
const side = (page: Page) => page.getByRole('group', { name: 'Side' })
const select = (page: Page) =>
  page.getByRole('combobox', { name: 'Show network' })

const layout = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.react-flow__node')].map((n) => [
        n.getAttribute('data-id'),
        (n as HTMLElement).style.transform,
      ]),
    ),
  )

async function findFromEdge17(page: Page, route: number) {
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await page.getByTestId('route-row').nth(route).click()
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}

/** Drag EDGE-17 so the saved positions are not just the first layout. */
async function rearrange(page: Page, id = 'edge-17') {
  const card = page.getByTestId(`rf__node-${id}`)
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + 60, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, box.y + 120, { steps: 10 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Zoom Out' }).click()
}

async function expectMapUnchanged(
  page: Page,
  before: { viewport: string | null; layout: Record<string, string> },
) {
  await expect(page.locator('.flow-surface')).toBeVisible()
  await expect.poll(() => viewport(page)).toBe(before.viewport)
  expect(await layout(page)).toEqual(before.layout)
  // No automatic centering follows: still the same a moment later.
  await page.waitForTimeout(600)
  expect(await viewport(page)).toBe(before.viewport)
}

const WALKS = [
  {
    name: 'AGG-03',
    route: 0,
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
    await expectMarks(page, { routeLinks: w.links })
    await rearrange(page)
    const before = {
      viewport: await viewport(page),
      layout: await layout(page),
    }

    // a. Physical → Main Campus → North Sub-main → SM01 → HDF-01.
    await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
    await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
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
    await expect(external(page)).toContainText(w.cableRear)
    await expect(external(page)).toContainText(w.farRear)
    await expect(external(page)).toContainText('rear')
    await internal(page)
      .getByRole('button', { name: 'Switch to front' })
      .click()
    await expectMark(page, 'data-selected-endpoint', w.front)
    await expectMark(page, 'data-side', 'front')
    await expect(external(page)).toContainText(w.cableFront)
    await expect(external(page)).toContainText('HDF-02')

    // c. Go to peer: HDF-02's front, whose rear carries the cable to the destination.
    await external(page).getByRole('button', { name: 'Go to peer' }).click()
    await expectMark(page, 'data-selected-endpoint', w.peer)
    await expectMark(page, 'data-side', 'front')
    await expect(root(page)).toHaveAttribute(
      'data-location',
      /equipment:hdf-02\//,
    )
    await expect(internal(page)).toContainText(w.cablePeerRear)
    await expect(internal(page)).toContainText(w.dest)
    await expect(internal(page)).toContainText('Port 1')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expectMark(page, 'data-selected-endpoint', w.front)
    await expectMark(page, 'data-side', 'front')
    await expectMark(page, 'data-selected-equipment', 'hdf-01')

    // d. Back on the map: the same route, positions and viewport; no centering.
    await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
    await expectMarks(page, { routeLinks: w.links })
    await expectMapUnchanged(page, before)
    await expect(page.getByTestId('route-row').nth(w.route)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Selected equipment is shared: the inspector shows the last physical one.
    await page.getByRole('button', { name: 'Open inspector' }).click()
    await expect(page.locator('.inspector-header h2')).toHaveText('HDF-01')
  })

test('PHY-11 the same walkthrough with Network B and AGG-12: 3C/2 is selected, and 3C/5 is visible as Network A', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await select(page).selectOption({ label: 'Network B' })
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await pick(page, 'Start', 'edge-22 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await expectMarks(page, {
    routeLinks: ['cable-b01', 'cable-b02', 'cable-b03', 'cable-b04'],
  })
  await rearrange(page, 'edge-22')
  const before = { viewport: await viewport(page), layout: await layout(page) }

  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
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
  await expect(external(page)).toContainText('cable-b02')
  await expect(external(page)).toContainText('PANEL-DR')
  await internal(page).getByRole('button', { name: 'Switch to front' }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:2:f')
  await expect(external(page)).toContainText('cable-b03')
  await expect(external(page)).toContainText('HDF-02')
  await external(page).getByRole('button', { name: 'Go to peer' }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-02:sp-2B:6:f')
  await expect(internal(page)).toContainText('cable-b04')
  await expect(internal(page)).toContainText('AGG-12')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:2:f')

  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await expectMarks(page, {
    routeLinks: ['cable-b01', 'cable-b02', 'cable-b03', 'cable-b04'],
  })
  await expectMapUnchanged(page, before)
  await expect(select(page)).toHaveValue('net-b') // the filter is the one chosen
})

test('F05 a conceptual endpoint opens the exact place in Physical: from the inspector header, a Positions row, and a hop', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await page.getByTestId('rf__node-hdf-01').click()
  await expect(page.locator('.inspector-header h2')).toHaveText('HDF-01')

  // The header button opens the equipment page.
  await page.getByRole('button', { name: 'Show in Physical: HDF-01' }).click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    'site:site-main-campus/node:node-north-sub-main/rack:rack-sm01/equipment:hdf-01',
  )
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()

  // A Positions row opens its endpoint, on the first cabled side (front sorts first).
  await page.getByRole('tab', { name: 'Positions' }).click()
  await page
    .getByRole('button', { name: 'Show in Physical: HDF-01 3C / 5' })
    .click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    'site:site-main-campus/node:node-north-sub-main/rack:rack-sm01/equipment:hdf-01/endpoint:hdf-01:sp-3C:5:f/front',
  )
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:f')
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()

  // A hop: in Conceptual it switches to Physical and opens that endpoint.
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await page
    .getByRole('button', { name: 'Show in Physical: HDF-02', exact: true })
    .first()
    .click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-02:sp-2B:3:f')
  await expectMark(page, 'data-side', 'front')
  // In Physical the icon is there too, and does the same as clicking the row.
  await expandResults(page)
  await page
    .getByRole('button', { name: 'Show in Physical: HDF-01', exact: true })
    .first()
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
  await page.locator('.rack-block[data-equipment-id="edge-18"]').click()
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
  await page.locator('.rack-block[data-equipment-id="edge-17"]').click()
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
