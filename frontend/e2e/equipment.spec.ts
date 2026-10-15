import { expect, test, type Page } from '@playwright/test'
import { fitted, openRackInPhysical, expandResults } from './helpers'

// The explorer writes its state on its root; these specs assert that model.
const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)

const endpoint = (page: Page, id: string) =>
  page.locator(`[data-testid="face-endpoint"][data-endpoint-id="${id}"]`)
const detail = (page: Page) => page.getByTestId('endpoint-detail')
const external = (page: Page) => page.getByTestId('external-cable')
const internal = (page: Page) => page.getByTestId('internal-peer')
const sideControl = (page: Page) => page.getByRole('group', { name: 'Side' })

const HDF01_3C5_REAR = 'hdf-01:sp-3C:5:r'
const HDF01_3C5_FRONT = 'hdf-01:sp-3C:5:f'
const HDF02_2B3_FRONT = 'hdf-02:sp-2B:3:f'

async function traceAgg03(page: Page) {
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}

/** Opens an equipment's page by clicking it in its rack. */
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
const openHdf01 = (page: Page) =>
  openEquipment(page, 'Main Campus', 'North Sub-main', 'Rack SM01', 'hdf-01')
const openHdf02 = (page: Page) =>
  openEquipment(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 01',
    'hdf-02',
  )

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('clicking equipment in the rack opens its page, with the equipment marked in the rack strip', async ({
  page,
}) => {
  await openHdf01(page)
  await expectMark(page, 'data-selected-equipment', 'hdf-01')
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /rack:rack-sm01\/equipment:hdf-01$/,
  )
  await expect(page.locator('aside.studio-drawer')).toHaveCount(0) // the inspector stays closed
  const strip = page.getByTestId('rack-strip')
  await expect(strip.locator('[data-equipment-id="hdf-01"]')).toHaveAttribute(
    'data-selected',
    'true',
  )
  await expect(
    page
      .getByRole('navigation', { name: 'Breadcrumbs' })
      .locator('[aria-current="page"]'),
  ).toHaveText('HDF-01')
})

test('a block in a node preview opens the equipment page, and the rack strip navigates to other equipment', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await page
    .getByRole('button', { name: 'Open Main Campus', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: 'Open racks of Main Distribution',
      exact: true,
    })
    .click()
  await page
    .locator(
      '[data-testid="rack-preview"][data-rack-id="rack-core-01"] [data-equipment-id="agg-03"]',
    )
    .click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /rack:rack-core-01\/equipment:agg-03$/,
  )
  // Clicking another equipment in the strip navigates (and Back returns).
  await page
    .getByTestId('rack-strip')
    .locator('[data-equipment-id="hdf-02"]')
    .click()
  await expect(root(page)).toHaveAttribute('data-location', /equipment:hdf-02$/)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(root(page)).toHaveAttribute('data-location', /equipment:agg-03$/)
})

test('F06 HDF-01 3C/5 rear: its cable and peer, then the same position on the front', async ({
  page,
}) => {
  await traceAgg03(page)
  await openHdf01(page)
  await expectMark(page, 'data-face-kind', 'hdf')
  await sideControl(page).getByRole('button', { name: 'Rear' }).click()
  await expectMark(page, 'data-side', 'rear')
  await endpoint(page, HDF01_3C5_REAR).click()
  await expectMark(page, 'data-selected-endpoint', HDF01_3C5_REAR)
  await expect(endpoint(page, HDF01_3C5_REAR)).toHaveAttribute(
    'data-state',
    'route',
  )
  await expect(endpoint(page, HDF01_3C5_REAR)).toHaveAttribute(
    'data-selected',
    'true',
  )
  await expect(endpoint(page, HDF01_3C5_REAR)).toHaveAccessibleName(
    'HDF-01 3C / 5 rear, cabled, Network A, on selected route, selected',
  )
  await expect(
    page.locator('[data-testid="face-block"][data-block="3C"]'),
  ).toHaveAttribute('data-on-route', 'true')
  await expect(detail(page)).toContainText('3C / 5')
  await expect(detail(page)).toContainText('rear')
  await expect(detail(page)).toContainText('Network A')
  await expect(detail(page)).toContainText('9,10') // the fiber pair, as secondary text
  await expect(external(page)).toContainText('cable-a02')
  await expect(external(page)).toContainText('PANEL-A')
  await expect(external(page)).toContainText(
    'Main Campus › Building A › Rack A03',
  )
  await expect(internal(page)).toContainText('front')

  // Switching keeps the position, selects its other side, and adds no history.
  const depth = await mark(page, 'data-history-depth')
  await internal(page).getByRole('button', { name: 'Switch to front' }).click()
  await expectMark(page, 'data-selected-endpoint', HDF01_3C5_FRONT)
  await expectMark(page, 'data-side', 'front')
  await expectMark(page, 'data-history-depth', depth)
  await expect(external(page)).toContainText('cable-a03')
  await expect(external(page)).toContainText('HDF-02')
  await expect(internal(page)).toContainText('cable-a02')
  await expect(
    sideControl(page).getByRole('button', { name: 'Front' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('F07 HDF-02 2B/3 front: A03 to HDF-01, and the rear goes to AGG-03 port 1', async ({
  page,
}) => {
  await openHdf02(page)
  await endpoint(page, HDF02_2B3_FRONT).click()
  await expectMark(page, 'data-selected-endpoint', HDF02_2B3_FRONT)
  await expect(external(page)).toContainText('cable-a03')
  await expect(external(page)).toContainText('HDF-01')
  await internal(page).getByRole('button', { name: 'Switch to rear' }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-02:sp-2B:3:r')
  await expectMark(page, 'data-side', 'rear')
  await expect(external(page)).toContainText('cable-a04')
  await expect(external(page)).toContainText('AGG-03')
  await expect(external(page)).toContainText('Port 1')
  await expect(external(page)).toContainText(
    'Main Campus › Main Distribution › Rack Core 01',
  )
})

test('F08 Go to peer opens the far equipment with its endpoint; Back restores the exact endpoint and side', async ({
  page,
}) => {
  await openHdf01(page)
  await sideControl(page).getByRole('button', { name: 'Front' }).click()
  await endpoint(page, HDF01_3C5_FRONT).click()
  await expectMark(page, 'data-selected-endpoint', HDF01_3C5_FRONT)
  const depth = Number(await mark(page, 'data-history-depth'))

  await external(page).getByRole('button', { name: 'Go to peer' }).click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /equipment:hdf-02\/endpoint:hdf-02:sp-2B:3:f\/front$/,
  )
  await expectMark(page, 'data-selected-endpoint', HDF02_2B3_FRONT)
  await expectMark(page, 'data-side', 'front')
  await expectMark(page, 'data-selected-equipment', 'hdf-02')
  await expectMark(page, 'data-history-depth', String(depth + 1))

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /equipment:hdf-01\/endpoint:hdf-01:sp-3C:5:f\/front$/,
  )
  await expectMark(page, 'data-selected-endpoint', HDF01_3C5_FRONT)
  await expectMark(page, 'data-side', 'front')
  await expectMark(page, 'data-history-depth', String(depth))
})

test('PHY-08 / F09 the HDF-01 face has 16 blocks and 96 positions per side; 3C/2 and 3C/5 are separate circuits of different networks', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  await openHdf01(page)
  await expectMark(
    page,
    'data-face-blocks',
    '1A 1B 1C 1D 2A 2B 2C 2D 3A 3B 3C 3D 4A 4B 4C 4D',
  )
  await expectMark(page, 'data-face-positions', '96')
  await sideControl(page).getByRole('button', { name: 'Rear' }).click()
  await endpoint(page, 'hdf-01:sp-3C:2:r').click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:2:r')
  await expect(endpoint(page, 'hdf-01:sp-3C:2:r')).toHaveAttribute(
    'data-network',
    'net-b',
  )
  await expect(endpoint(page, 'hdf-01:sp-3C:2:r')).toHaveAttribute(
    'data-selected',
    'true',
  )
  // Network A's circuit in the same block is still there, cabled, and not selected.
  await expect(endpoint(page, HDF01_3C5_REAR)).toBeVisible()
  await expect(endpoint(page, HDF01_3C5_REAR)).toHaveAttribute(
    'data-network',
    'net-a',
  )
  await expect(endpoint(page, HDF01_3C5_REAR)).toHaveAttribute(
    'data-state',
    'cabled',
  )
  await expect(endpoint(page, HDF01_3C5_REAR)).toHaveAttribute(
    'data-selected',
    'false',
  )
  await expect(detail(page)).toContainText('Network B')
  // Free positions are white: color follows the state, not the network.
  await expect(endpoint(page, 'hdf-01:sp-1A:1:r')).toHaveAttribute(
    'data-state',
    'free',
  )
})

test('PHY-09 Find AGG / BB from an HDF position shows the routes in the overlay and keeps the page', async ({
  page,
}) => {
  await openHdf01(page)
  await sideControl(page).getByRole('button', { name: 'Rear' }).click()
  await endpoint(page, HDF01_3C5_REAR).click()
  await page.getByRole('button', { name: 'Find AGG / BB from here' }).click()
  const results = page.getByLabel('Map trace results')
  await expandResults(page)
  await expect(results).toBeVisible()
  await expect(page.getByTestId('route-row').first()).toContainText('AGG-03')
  await expectMark(page, 'data-physical-level', 'equipment')
  await expectMark(page, 'data-selected-endpoint', HDF01_3C5_REAR)
  await expect(root(page)).toHaveAttribute('data-route-equipment', /agg-03/)
  // The route's position is teal on the face.
  await expect(endpoint(page, HDF01_3C5_REAR)).toHaveAttribute(
    'data-state',
    'route',
  )
})

test('F10 a switch shows its port bank in rows of 12, with cabled and free ports and each cable’s peer', async ({
  page,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  await expectMark(page, 'data-face-kind', 'switch')
  await expectMark(page, 'data-face-positions', '24')
  await expect(sideControl(page)).toHaveCount(0) // a switch has no sides
  const port = (n: number) => endpoint(page, `edge-17:p${n}`)
  await expect(port(1)).toHaveAttribute('data-state', 'cabled')
  await expect(port(1)).toHaveAttribute('data-network', 'net-a')
  await expect(port(4)).toHaveAttribute('data-state', 'free')
  await expect(port(12)).toHaveAttribute('data-row', '1') // even ports are on the lower row
  await expect(port(13)).toHaveAttribute('data-row', '0') // odd ports on the upper row
  await expect(port(1)).toHaveAccessibleName(
    'EDGE-17 port 1, cabled, Network A',
  )
  await port(1).click()
  await expectMark(page, 'data-selected-endpoint', 'edge-17:p1')
  // A switch port shows its walk sheet: the cable, PANEL-A in Rack A03, and on.
  const walk = detail(page).getByTestId('walk-sheet')
  await expect(walk.getByTestId('walk-cable').first()).toHaveAttribute(
    'data-link',
    'cable-a01',
  )
  await expect(walk.getByTestId('walk-row').nth(1)).toContainText('PANEL-A')
  await expect(walk.getByTestId('walk-place').first()).toContainText('Rack A03')
  await expect(detail(page).getByTestId('chain')).toHaveCount(0)
  await port(4).click()
  await expect(walk.getByTestId('walk-end')).toHaveAttribute('data-end', 'none') // a free port has no cable
})

test('F10 a standard panel shows positions 1..N on the chosen side, and switching keeps the position', async ({
  page,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  await expectMark(page, 'data-face-kind', 'panel')
  await expectMark(page, 'data-face-positions', '24')
  const front = (n: number) => endpoint(page, `panel-a:${n}:f`)
  await expect(front(1)).toHaveAttribute('data-state', 'cabled')
  await expect(front(4)).toHaveAttribute('data-state', 'free')
  await front(1).click()
  await expect(external(page)).toContainText('cable-a01')
  await expect(external(page)).toContainText('EDGE-17')
  await internal(page).getByRole('button', { name: 'Switch to rear' }).click()
  await expectMark(page, 'data-selected-endpoint', 'panel-a:1:r')
  await expect(external(page)).toContainText('cable-a02')
  await expect(external(page)).toContainText('HDF-01')
  // The position number is the identity: position 1 on the rear face.
  await expect(endpoint(page, 'panel-a:1:r')).toHaveAttribute(
    'data-selected',
    'true',
  )
})

test('Show on map returns to the conceptual map with this equipment selected', async ({
  page,
}) => {
  await openHdf01(page)
  await sideControl(page).getByRole('button', { name: 'Rear' }).click()
  await endpoint(page, HDF01_3C5_REAR).click()
  await page.getByRole('button', { name: 'Show on map' }).click()
  await expect(root(page)).toHaveCount(0)
  await expect(page.locator('.flow-surface')).toBeVisible()
  await expect(
    page.getByTestId('rf__node-hdf-01').locator('.equipment-card'),
  ).toHaveClass(/selected/)
})

test('a walk row opens the exact endpoint', async ({ page }) => {
  await traceAgg03(page)
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expandResults(page)
  await page
    .getByTestId('walk-row')
    .filter({ hasText: 'in front 2B/3' })
    .click()
  await expectMark(page, 'data-physical-level', 'equipment')
  await expectMark(page, 'data-selected-endpoint', HDF02_2B3_FRONT)
  await expectMark(page, 'data-side', 'front')
})
