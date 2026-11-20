import { expect, test, type Page } from './fixtures'
import {
  expandResults,
  fitted,
  openRackInPhysical,
  selectEquipment,
} from './helpers'

const results = (page: Page) => page.getByLabel('Trace results')
const sheet = (page: Page) => page.getByTestId('walk-sheet')

async function traceFromEdge17(page: Page) {
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('WS-01 the selected route reads as a walk sheet: places, rows, cables and an end line', async ({
  page,
}) => {
  await traceFromEdge17(page)
  await expect(sheet(page)).toHaveCount(1)

  // The place headers, in order, each part inside a bdi.
  const places = await sheet(page)
    .getByTestId('walk-place')
    .evaluateAll((els) =>
      els.map((el) =>
        [...el.querySelectorAll('bdi')].map((b) => b.textContent),
      ),
    )
  expect(places).toEqual([
    ['Main Campus', 'Building A', 'Rack A03'],
    ['Main Campus', 'North Sub-main', 'Rack SM01'],
    ['Main Campus', 'Main Distribution', 'Rack Core 01'],
  ])

  // PANEL-A reads "in front 1 → out rear 1".
  const panel = sheet(page)
    .getByTestId('walk-row')
    .filter({ has: page.locator('bdi', { hasText: /^PANEL-A$/ }) })
  await expect(panel).toHaveCount(1)
  await expect(panel.locator('.walk-io')).toHaveText('in front 1 → out rear 1')

  // Every row's name is inside a bdi, and each row knows its endpoint.
  const rows = sheet(page).getByTestId('walk-row')
  await expect(rows).toHaveCount(5)
  expect(
    await rows.evaluateAll((els) =>
      els.map((el) => el.querySelector('.walk-name > bdi')?.textContent),
    ),
  ).toEqual(['EDGE-17', 'PANEL-A', 'HDF-01', 'HDF-02', 'AGG-03'])
  await expect(rows.nth(1)).toHaveAttribute('data-endpoint', /.+/)

  // Leave notes name the place that was left, inside a bdi.
  const cables = sheet(page).getByTestId('walk-cable')
  await expect(cables).toHaveCount(4)
  await expect(cables.nth(1)).toContainText('leaves Building A')
  await expect(
    cables.nth(1).locator('bdi', { hasText: 'Building A' }),
  ).toHaveCount(1)

  // The end line.
  const end = sheet(page).getByTestId('walk-end')
  await expect(end).toHaveAttribute('data-end', 'destination')
  await expect(end).toHaveText('Ends at AGG-03 · Port 1, an AGG.')
  await expect(end.locator('bdi')).toHaveText(['AGG-03'])
})

test('WS-01 a row click selects that equipment on the map; the Server button opens Physical', async ({
  page,
}) => {
  await traceFromEdge17(page)
  await sheet(page)
    .getByTestId('walk-row')
    .filter({ hasText: 'in front 2B/3' })
    .click()
  // The row selected its equipment; the inspector is its own tab beside Trace.
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText('HDF-02')
  await page.getByRole('tab', { name: 'Trace' }).click()
  await sheet(page)
    .getByRole('button', { name: 'Show in Physical: HDF-02' })
    .click()
  await expect(page.locator('.physical-explorer')).toBeVisible()
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-location',
    /rack:rack-core-01/,
  )
})

test('WS-01 the same sheet shows in Physical', async ({ page }) => {
  await traceFromEdge17(page)
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expandResults(page)
  await expect(results(page).getByTestId('walk-row')).toHaveCount(5)
  await expect(results(page).getByTestId('walk-end')).toContainText(
    'Ends at AGG-03 · Port 1, an AGG.',
  )
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
  await page.locator(`.rack-block[data-equipment-id="${id}"]`).click()
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

test('WS-02 a port with no cable says so and shows only its own plate', async ({
  page,
}) => {
  await openEdge17(page)
  await endpoint(page, 'edge-17:p4').click()
  await expect(plates(page)).toHaveCount(1)
  await expect(pathBar(page)).toContainText('No cable on this jack')
  await expect(pathBar(page).getByTestId('path-gap')).toHaveCount(1)
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

// WS-03…05: the uplinks summary.
const uplinks = (page: Page) => page.getByTestId('uplinks')
const lines = (page: Page) => uplinks(page).getByTestId('uplink-line')

const EDGE_LINES = [
  ['edge-17:p1', 'Port 1', 'AGG-03', 'AGG'],
  ['edge-17:p2', 'Port 2', 'AGG-08', 'AGG'],
  ['edge-17:p3', 'Port 3', 'BB-01', 'BB'],
]

test('WS-03 EDGE-17’s page lists its uplinks, AGG first; a line selects its port', async ({
  page,
}) => {
  await openEdge17(page)
  await expect(lines(page)).toHaveCount(3)
  await expect(uplinks(page)).toContainText('3 of 24 ports reach an AGG or BB')
  for (const [i, [id, port, dest, role]] of EDGE_LINES.entries()) {
    const line = lines(page).nth(i)
    await expect(line).toHaveAttribute('data-endpoint', id)
    await expect(line).toContainText(port)
    await expect(line).toContainText(`→ ${dest} · Port 1${role}`)
    await expect(line).toContainText('4 cables')
    await expect(line.locator('.uplink-via')).toHaveText(
      'via PANEL-A › HDF-01 › HDF-02',
    )
    await expect(line.locator('bdi', { hasText: dest })).toHaveCount(1)
  }
  await expect(uplinks(page).getByTestId('uplinks-mismatch')).toHaveCount(0)

  // The listed ports carry the mark; a free one does not.
  for (const id of ['edge-17:p1', 'edge-17:p2', 'edge-17:p3'])
    await expect(endpoint(page, id)).toHaveAttribute('data-uplink', 'true')
  await expect(endpoint(page, 'edge-17:p4')).not.toHaveAttribute(
    'data-uplink',
    'true',
  )
  await expect(page.locator('.face-legend')).toContainText(
    'reaches an AGG or BB',
  )

  // A click selects the port; the Path bar shows where it ends.
  await lines(page).nth(1).click()
  await expectMark(page, 'data-selected-endpoint', 'edge-17:p2')
  await expect(lines(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(lines(page).nth(0)).toHaveAttribute('aria-pressed', 'false')
  const end = pathBar(page).getByTestId('path-plate').last()
  await expect(end).toContainText('AGG-08')
  await expect(end).toContainText('Port 1')
  await expect(end).toHaveAttribute('data-destination', 'aggregation')
  // The uplink mark stays together with the selected ring.
  await expect(endpoint(page, 'edge-17:p2')).toHaveAttribute(
    'data-uplink',
    'true',
  )
  await expect(endpoint(page, 'edge-17:p2')).toHaveAttribute(
    'data-selected',
    'true',
  )
})

test('WS-04 the inspector lists the same lines; a click finds AGG / BB from that port', async ({
  page,
}) => {
  await selectEquipment(page, 'EDGE-17')
  await expect(lines(page)).toHaveCount(3)
  await expect(uplinks(page)).toContainText('3 of 24 ports reach an AGG or BB')
  await expect(lines(page).nth(0)).toContainText('→ AGG-03 · Port 1AGG')
  await expect(lines(page).nth(2)).toContainText('BB')
  await expect(lines(page).nth(1).locator('.uplink-via')).toHaveText(
    'via PANEL-A › HDF-01 › HDF-02',
  )

  await lines(page).nth(1).click()
  await expect(page.getByTestId('route-row')).toHaveCount(1)
  await expect(sheet(page).getByTestId('walk-end')).toHaveText(
    'Ends at AGG-08 · Port 1, an AGG.',
  )
  await expect(sheet(page).getByTestId('walk-row').first()).toContainText(
    'start · out Port 2',
  )
})

test('WS-05 an AGG’s page says paths end there and makes no trace request', async ({
  page,
}) => {
  const traces: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/traces')) traces.push(r.url())
  })
  await openEquipment(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 01',
    'agg-03',
  )
  await expect(uplinks(page)).toContainText(
    'AGG-03 is an AGG: paths from access switches end here.',
  )
  await expect(lines(page)).toHaveCount(0)
  await page.waitForTimeout(500)
  expect(traces).toEqual([])
})

test('WS-03 a port that reaches an AGG on another network is counted apart', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/plans', {
    data: { name: 'Cross network', expectedBaseRevision: 'acceptance-1' },
  })
  const plan = await created.json()
  const saved = await request.post(`/api/plans/${plan.id}/commands`, {
    data: {
      type: 'add_cable',
      expectedRevision: plan.revision,
      cable: { a: 'edge-17:p4', b: 'agg-12:p2' },
    },
  })
  expect(saved.status()).toBe(200)
  await page.goto(`/?plan=${plan.id}`)
  await fitted(page)
  await openEdge17(page)
  await expect(lines(page)).toHaveCount(3)
  await expect(uplinks(page).getByTestId('uplinks-mismatch')).toHaveText(
    '1 port reaches an AGG or BB on another network.',
  )
})
