import { expect, test, type Page } from './fixtures'
import {
  fitted,
  leaveTrace,
  openRackInPhysical,
  selectEquipment,
  traceRoutes,
} from './helpers'

async function traceFromEdge17(page: Page) {
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await expect(traceRoutes(page)).toHaveCount(3)
  await leaveTrace(page)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

// WS-02: the selected switch port's path, in the Physical side panel.
const root = (page: Page) => page.locator('.physical-explorer')
const expectMark = (page: Page, name: string, value: string) =>
  expect
    .poll(() => root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name))
    .toBe(value)
const detail = (page: Page) => page.getByTestId('endpoint-detail')
const endpoint = (page: Page, id: string) =>
  page.locator(`[data-testid="face-endpoint"][data-endpoint-id="${id}"]`)

async function openEquipment(
  page: Page,
  site: string,
  node: string,
  rack: string,
  id: string,
) {
  await openRackInPhysical(page, site, node, rack)
  await page.locator(`.rack-block[data-equipment-id="${id}"]`).dblclick()
  await expectMark(page, 'data-physical-level', 'equipment')
}
const openEdge17 = (page: Page) =>
  openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')

const pathBar = (page: Page) => page.getByRole('region', { name: 'Path' })
const plates = (page: Page) => pathBar(page).getByTestId('path-plate')

test('WS-02 a selected switch port’s path is in the Path bar, not the panel', async ({
  page,
}) => {
  await openEdge17(page)
  await endpoint(page, 'edge-17:p1').click()
  await expect(pathBar(page).getByRole('heading')).toContainText('Port 1')
  await expect(plates(page)).toHaveCount(5)
  await expect(pathBar(page)).toContainText('4 cables')
  // It ends at AGG-03, Port 1, an AGG.
  const end = plates(page).last()
  await expect(end).toContainText('AGG-03')
  await expect(end).toContainText('Port 1')
  await expect(end).toHaveAttribute('data-destination', 'aggregation')
  await expect(end).toContainText('AGG')
  await expect(detail(page).getByTestId('chain')).toHaveCount(0)
  await expect(detail(page).getByTestId('walk-sheet')).toHaveCount(0)
  // The header and the Physical-only buttons stay.
  await expect(detail(page)).toContainText('Port 1')
  await expect(
    detail(page).getByRole('button', { name: 'Find AGG / BB from here' }),
  ).toBeVisible()
})

test('WS-02 (D50) a port with no cable leaves the path card as its one line, no plate', async ({
  page,
}) => {
  await openEdge17(page)
  await endpoint(page, 'edge-17:p4').click()
  await expect(plates(page)).toHaveCount(0)
  await expect(pathBar(page)).toContainText('Select a cabled jack on the face')
  await expect(pathBar(page).getByTestId('path-gap')).toHaveCount(0)
})

test('WS-02 a plate opens that equipment’s jack; the switch’s own plate stays on its port', async ({
  page,
}) => {
  await openEdge17(page)
  await endpoint(page, 'edge-17:p1').click()

  // The selected plate is not a button.
  await expect(plates(page).first().getByRole('button')).toHaveCount(0)
  await expectMark(page, 'data-selected-endpoint', 'edge-17:p1')

  await pathBar(page)
    .getByRole('button', { name: /^Open HDF-01/ })
    .click()
  await expectMark(page, 'data-physical-level', 'equipment')
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  await expectMark(page, 'data-side', 'rear')
})

test('WS-02 a panel or HDF position shows its path and no chain', async ({
  page,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  await endpoint(page, 'panel-a:1:f').click()
  await expect(pathBar(page)).toBeVisible()
  await expect(detail(page).getByTestId('chain')).toHaveCount(0)
  await expect(detail(page).getByTestId('walk-sheet')).toHaveCount(0)
})

// WS-03: the face marks the ports that reach an AGG or BB (the summary list is gone, D47).
const EDGE_UPLINK_PORTS = ['edge-17:p1', 'edge-17:p2', 'edge-17:p3']

test('WS-03 EDGE-17’s face marks its uplink ports and explains the mark', async ({
  page,
}) => {
  await openEdge17(page)
  for (const id of EDGE_UPLINK_PORTS)
    await expect(endpoint(page, id)).toHaveAttribute('data-uplink', 'true')
  await expect(endpoint(page, 'edge-17:p4')).not.toHaveAttribute(
    'data-uplink',
    'true',
  )
  await expect(page.locator('.face-legend')).toContainText(
    'reaches an AGG or BB',
  )
  // A click selects the port; the Path bar shows where it ends. The mark stays with the ring.
  await endpoint(page, 'edge-17:p2').click()
  await expectMark(page, 'data-selected-endpoint', 'edge-17:p2')
  const end = pathBar(page).getByTestId('path-plate').last()
  await expect(end).toContainText('AGG-08')
  await expect(end).toContainText('Port 1')
  await expect(end).toHaveAttribute('data-destination', 'aggregation')
  await expect(endpoint(page, 'edge-17:p2')).toHaveAttribute(
    'data-uplink',
    'true',
  )
  await expect(endpoint(page, 'edge-17:p2')).toHaveAttribute(
    'data-selected',
    'true',
  )
})

// D47: the route trail and the Uplinks summary are gone.
test('D47-02 with a route selected, EDGE-17’s page in Physical has no trail and no Uplinks block', async ({
  page,
}) => {
  await traceFromEdge17(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block[data-equipment-id="edge-17"]').dblclick()
  await expectMark(page, 'data-physical-level', 'equipment')
  await expect(root(page)).toHaveAttribute('data-route-steps', '5') // the route is still selected
  await expect(page.getByRole('region', { name: 'EDGE-17 face' })).toBeVisible()
  await expect(page.getByTestId('route-trail')).toHaveCount(0)
  await expect(
    page.getByRole('navigation', { name: 'Route trail' }),
  ).toHaveCount(0)
  await expect(page.getByTestId('trail-step')).toHaveCount(0)
  await expect(page.getByTestId('uplinks')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Uplinks' })).toHaveCount(0)
  await expect(page.getByTestId('uplink-line')).toHaveCount(0)
  // The teal route marks stay: the face's jacks on the route.
  await expect(endpoint(page, 'edge-17:p1')).toBeVisible()
})

test('D47-03 the inspector of EDGE-17 has no Uplinks block', async ({
  page,
}) => {
  await traceFromEdge17(page)
  await expect(page.getByTestId('route-chip')).toBeVisible()
  await selectEquipment(page, 'EDGE-17')
  await expect(
    page.getByRole('heading', { name: 'EDGE-17' }).first(),
  ).toBeVisible()
  await expect(page.getByTestId('uplinks')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Uplinks' })).toHaveCount(0)
  await expect(page.getByTestId('uplink-line')).toHaveCount(0)
})
