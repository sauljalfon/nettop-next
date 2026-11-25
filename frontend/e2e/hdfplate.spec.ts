import { expect, test, type APIRequestContext, type Page } from './fixtures'
import {
  expectNear,
  expectNearPlace,
  fitted,
  openRackInPhysical,
  findAggBb,
  leaveTrace,
  traceRoutes,
} from './helpers'
import { planWith32RowHdf } from './plan-api'
import { openPatching, patching } from './patching-helpers'

const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)
const endpoint = (page: Page, id: string) =>
  page.locator(`[data-testid="face-endpoint"][data-endpoint-id="${id}"]`)
const block = (page: Page, id: string) =>
  page.locator(`.rack-block[data-equipment-id="${id}"]`)
const detail = (page: Page) => page.getByTestId('endpoint-detail')
const peers = (page: Page) => page.getByTestId('peer-actions')
const pathBar = (page: Page) => page.getByRole('region', { name: 'Path' })
const plates = (page: Page) => pathBar(page).getByTestId('path-plate')
const plateNames = (page: Page) =>
  plates(page).evaluateAll((els) =>
    els.map((e) => e.querySelector('.pn-top bdi')?.textContent),
  )
const side = (page: Page) => page.getByRole('group', { name: 'Side' })
const box = async (page: Page, id: string) =>
  (await endpoint(page, id).boundingBox())!

async function openEquipment(
  page: Page,
  site: string,
  node: string,
  rack: string,
  id: string,
) {
  await openRackInPhysical(page, site, node, rack)
  await block(page, id).dblclick()
  await expectMark(page, 'data-physical-level', 'equipment')
}
async function traceAgg03(page: Page) {
  await findAggBb(page)
  await expect(traceRoutes(page)).toHaveCount(3)
  await leaveTrace(page)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('PB-04 the HDF is one steel chassis: letters above, row numbers at the left, a recessed module per block', async ({
  page,
}) => {
  await traceAgg03(page)
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  const plate = page.locator('.faceplate[data-kind="hdf"]')
  await expect(plate).toHaveCSS('background-color', 'rgb(31, 39, 49)')
  const first = page.locator('[data-testid="face-block"][data-block="1A"]')
  const firstBox = (await first.boundingBox())!
  const a = (await page.locator('.hdf-col', { hasText: 'A' }).boundingBox())!
  const row1 = (await page
    .locator('.hdf-row', { hasText: '1' })
    .first()
    .boundingBox())!
  expect(a.y + a.height).toBeLessThanOrEqual(firstBox.y + 1) // letters above the modules
  expect(row1.x + row1.width).toBeLessThanOrEqual(firstBox.x + 1) // row numbers at the left
  await expect(page.locator('.hdf-col')).toHaveText(['A', 'B', 'C', 'D'])
  // A recessed module: darker than the chassis, and a teal border where the route is.
  await expect(first).toHaveCSS('background-color', 'rgb(42, 52, 64)')
  const route = page.locator('[data-testid="face-block"][data-block="3C"]')
  await expect(route).toHaveAttribute('data-on-route', 'true')
  await expect(route).toHaveCSS('border-top-color', 'rgb(15, 139, 122)')
  await expect(first).toHaveAttribute('data-on-route', 'false')
  // Six jack-shaped positions in 3 × 2, with the link dot on cabled ones.
  const [p1, p2, p3, p4] = await Promise.all(
    [1, 2, 3, 4].map((n) => box(page, `hdf-01:sp-3C:${n}:f`)),
  )
  expect(Math.abs(p1.y - p2.y)).toBeLessThan(1.5)
  expect(Math.abs(p2.y - p3.y)).toBeLessThan(1.5)
  expect(p4.y).toBeGreaterThan(p1.y + 10)
  expect(Math.abs(p4.x - p1.x)).toBeLessThan(1.5)
  await expect(endpoint(page, 'hdf-01:sp-3C:5:f')).toHaveAttribute(
    'data-state',
    'route',
  )
  await expect(endpoint(page, 'hdf-01:sp-3C:2:f')).toHaveAttribute(
    'data-state',
    'cabled',
  )
  await expect(endpoint(page, 'hdf-01:sp-3C:4:f')).toHaveAttribute(
    'data-state',
    'free',
  )
  // States: cabled in the network's color, route teal, free white; selected ring.
  await expect(endpoint(page, 'hdf-01:sp-3C:2:f')).toHaveCSS(
    'background-color',
    'rgb(154, 79, 199)',
  ) // Network B
  await expect(endpoint(page, 'hdf-01:sp-3C:5:f')).toHaveCSS(
    'background-color',
    'rgb(15, 139, 122)',
  ) // route
  await expect(endpoint(page, 'hdf-01:sp-3C:4:f')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  )
  await endpoint(page, 'hdf-01:sp-3C:5:f').click()
  await expect(endpoint(page, 'hdf-01:sp-3C:5:f')).toHaveAttribute(
    'data-selected',
    'true',
  )
  await expect(endpoint(page, 'hdf-01:sp-3C:5:f')).toHaveCSS(
    'box-shadow',
    /rgb\(255, 255, 255\)/,
  )
  // Front / Rear and the accessible names are as before.
  await side(page).getByRole('button', { name: 'Rear' }).click()
  await expect(endpoint(page, 'hdf-01:sp-3C:5:r')).toHaveAccessibleName(
    'HDF-01 3C / 5 rear, cabled, Network A, on selected route, selected',
  )
})

test('PB-07 Pairs | Pigtails changes the numbers and is remembered', async ({
  page,
}) => {
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  const jack = endpoint(page, 'hdf-01:sp-3C:5:f')
  const numbers = page.getByRole('group', { name: 'Numbers' })
  await expect(jack).toHaveText('5')
  await expect(numbers.getByRole('button', { name: 'Pairs' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await numbers.getByRole('button', { name: 'Pigtails' }).click()
  await expect(jack.locator('.jack-line')).toHaveText(['9', '10'])
  const j = (await jack.boundingBox())!
  const lines = jack.locator('.jack-line')
  for (let i = 0; i < 2; i++) {
    const l = (await lines.nth(i).boundingBox())!
    expect(l.y).toBeGreaterThanOrEqual(j.y - 0.5)
    expect(l.y + l.height).toBeLessThanOrEqual(j.y + j.height + 0.5)
    expect(l.x).toBeGreaterThanOrEqual(j.x - 0.5)
    expect(l.x + l.width).toBeLessThanOrEqual(j.x + j.width + 0.5)
  }
  const lowerTop = (await lines.nth(1).boundingBox())!.y
  expect(lowerTop).toBeGreaterThan((await lines.nth(0).boundingBox())!.y)
  const name = (await jack.getAttribute('aria-label')) ?? ''
  expect(name).toContain('3C')
  expect(name).toContain('5')
  await page.reload()
  await fitted(page)
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  await expect(jack.locator('.jack-line')).toHaveText(['9', '10'])
  await numbers.getByRole('button', { name: 'Pairs' }).click()
  await expect(jack).toHaveText('5')

  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  await expect(page.getByRole('group', { name: 'Numbers' })).toHaveCount(0)
})

/** Every jack of the face is square, at least `min` and at most `max` wide, inside its plate. */
const fittedJacks = (page: Page, max: number, min = 18) =>
  page.locator('.faceplate[data-fit]').evaluate(
    (plate, [lo, hi]) => {
      const p = plate.getBoundingClientRect()
      const jacks = [
        ...plate.querySelectorAll<HTMLElement>('[data-testid="face-endpoint"]'),
      ].map((j) => j.getBoundingClientRect())
      return {
        count: jacks.length,
        square: jacks.every((r) => Math.abs(r.width - r.height) <= 1),
        small: jacks.filter((r) => r.width < lo - 0.5).length,
        big: jacks.filter((r) => r.width > hi + 0.5).length,
        outside: jacks.filter(
          (r) =>
            r.left < p.left - 0.5 ||
            r.right > p.right + 0.5 ||
            r.top < p.top - 0.5 ||
            r.bottom > p.bottom + 0.5,
        ).length,
      }
    },
    [min, max],
  )
const fittedOk = { square: true, small: 0, big: 0, outside: 0 }

test('PB-05 (D50) fitted jacks are square, 18px up to 56 (switch, panel) or 60 (HDF), inside their plate, numbers at least 11px; a switch on the patching screen keeps 28×30', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 })
  const fontOf = (id: string) =>
    endpoint(page, id).evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  expect(await fittedJacks(page, 56)).toMatchObject({ ...fittedOk })
  expect(await fontOf('edge-17:p1')).toBeGreaterThanOrEqual(11)
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  expect(await fittedJacks(page, 56)).toMatchObject({ ...fittedOk })
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  expect(await fittedJacks(page, 60)).toMatchObject({ ...fittedOk })
  expect(await fontOf('hdf-01:sp-3C:5:f')).toBeGreaterThanOrEqual(11)
  // Unfitted places keep the fixed sizes (the HDF's 32px is D50-03's).
  await openPatching(page, request, {
    equipment: 'EDGE-19',
    endpoint: '1',
    mode: 'range',
  })
  const sizes = await patching(page)
    .locator('.face-cell.jack')
    .evaluateAll((els) => [
      ...new Set(
        els.map((e) => {
          const r = e.getBoundingClientRect()
          return `${Math.round(r.width)}×${Math.round(r.height)}`
        }),
      ),
    ])
  expect(sizes).toEqual(['28×30'])
})

test('PB-06 every HDF draws its highest row at the top', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 })
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  const rows = await page.locator('.hdf-row').allTextContents()
  expect(rows.length).toBeGreaterThan(1)
  expect(rows[rows.length - 1]).toBe('1')
  expect(rows[0]).toBe(String(rows.length))
  const b1 = (await page
    .locator('[data-testid="face-block"][data-block="1A"]')
    .boundingBox())!
  const b2 = (await page
    .locator('[data-testid="face-block"][data-block="2A"]')
    .boundingBox())!
  expect(b1.y).toBeGreaterThan(b2.y)
  await page.screenshot({
    path: 'test-results/workbench-1b/hdf-01.png',
  })

  const id = await planWith32RowHdf(request)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page
    .locator('.rack-block[data-kind="hdf"]', { hasText: 'HDF-BIG' })
    .dblclick()
  await expectMark(page, 'data-face-positions', '768')
  await expect(page.locator('.hdf-row').first()).toHaveText('32')
  expect(await page.locator('.hdf-scroll').evaluate((e) => e.scrollTop)).toBe(0)
  await page.screenshot({
    path: 'test-results/workbench-1b/hdf-32-rows.png',
  })
})

test('PB-05b (D50) a 32-row HDF is drawn in bands, its jacks are at least 18px inside the plate, and the page scrolls, not the plate', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 })
  const id = await planWith32RowHdf(request)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page
    .locator('.rack-block[data-kind="hdf"]', { hasText: 'HDF-BIG' })
    .dblclick()
  await expectMark(page, 'data-face-positions', '768')
  const plate = page.locator('.faceplate[data-fit]')
  await expect
    .poll(async () => Number(await plate.getAttribute('data-fit')))
    .toBeGreaterThan(1)
  await expect(plate.locator('.hdf-grid')).toHaveCount(
    Number(await plate.getAttribute('data-fit')),
  )
  expect(await fittedJacks(page, 60)).toMatchObject({ ...fittedOk })
  // The plate does not scroll inside itself; when it is taller than the window the page does.
  expect(
    await page
      .locator('.hdf-scroll')
      .evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
  ).toBe(true)
  const over = await page.evaluate(() => {
    const area = document.querySelector('.equipment-page')!
    return { tall: area.scrollHeight - area.clientHeight, top: area.scrollTop }
  })
  expect(over.top).toBe(0)
  if (over.tall > 1) {
    const scrolled = await page.evaluate(() => {
      const area = document.querySelector('.equipment-page')!
      area.scrollTop = 200
      return area.scrollTop
    })
    expect(scrolled).toBeGreaterThan(0)
  }
})

test('PD-01 the HDF-01 3C/5 rear card draws the connection top to bottom, and each box opens its place', async ({
  page,
}) => {
  await traceAgg03(page)
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  await side(page).getByRole('button', { name: 'Rear' }).click()
  await endpoint(page, 'hdf-01:sp-3C:5:r').click()

  // The header.
  await expect(detail(page)).toContainText('3C / 5')
  await expect(detail(page)).toContainText('HDF-01 · rear')
  await expect(detail(page)).toContainText('Network A')
  await expect(detail(page)).toContainText('on route AGG-03')
  await expect(detail(page)).toContainText('9,10')
  await expect(detail(page)).not.toContainText('EXTERNAL CABLE')
  await expect(detail(page)).not.toContainText('INTERNAL PEER')
  await expect(
    detail(page).getByRole('button', { name: 'Find AGG / BB from here' }),
  ).toHaveAttribute('title', /Find AGG/)
  await expect(
    detail(page).getByRole('button', { name: 'Show on map' }),
  ).toHaveAttribute('title', /map/)

  // The path, left to right in the Path bar: the panel's side first, this position in the middle.
  expect(await plateNames(page)).toEqual([
    'EDGE-17',
    'PANEL-A',
    'HDF-01',
    'HDF-02',
    'AGG-03',
  ])
  await expect(pathBar(page).getByTestId('path-cable')).toHaveCount(4)
  await expectNear(page, 'left', 'PANEL-A', '1', 'rear', 'cable-a02')
  await expectNearPlace(page, 'left', 'Main Campus › Building A › Rack A03')
  await expectNear(page, 'right', '3C/5 rear', 'front', 'cable-a03', 'HDF-02')
  await expectNear(page, 'right', '2B/3', 'front')
  await expectNearPlace(
    page,
    'right',
    'Main Campus › Main Distribution › Rack Core 01',
  )
  // The cables are solid lines, the bridge is dotted; this position is the ringed plate.
  await expect(
    pathBar(page).getByTestId('path-cable').nth(1).locator('.cable-line'),
  ).toHaveCSS('border-top-style', 'solid')
  await expect(plates(page).nth(2).locator('.bridge')).toHaveCSS(
    'border-top-style',
    'dotted',
  )
  await expect(plates(page).nth(2)).toHaveAttribute('data-here', 'true')

  const depth = Number(await mark(page, 'data-history-depth'))
  // The far end opens that place (a step in the history), and Back returns.
  await pathBar(page)
    .getByRole('button', { name: /^Open PANEL-A/ })
    .click()
  await expectMark(page, 'data-selected-endpoint', 'panel-a:1:r')
  await expectMark(page, 'data-history-depth', String(depth + 1))
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  // The other side switches (no history entry), and the path is that side's.
  await peers(page)
    .getByRole('button', { name: /^Switch to front/ })
    .click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:f')
  await expectMark(page, 'data-history-depth', String(depth))
  await expectNear(page, 'left', 'HDF-02', 'cable-a03')
  await peers(page)
    .getByRole('button', { name: /^Switch to rear/ })
    .click() // back to the rear
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  // The plate on the other side goes there.
  await pathBar(page)
    .getByRole('button', { name: /^Open HDF-02/ })
    .click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-02:sp-2B:3:f')
  await expectMark(page, 'data-selected-equipment', 'hdf-02')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  // The selected plate itself is not a link.
  await expect(plates(page).nth(2).getByRole('button')).toHaveCount(0)
  // The panel keeps no chain.
  await expect(detail(page).getByTestId('chain')).toHaveCount(0)
})

test('PD-02 (D50) a switch port is port → cable → far end; a side with no cable is a dashed "no cable" box', async ({
  page,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  await endpoint(page, 'edge-17:p1').click()
  await expect(detail(page)).toContainText('Port 1')
  await expect(detail(page)).toContainText('EDGE-17')
  await expect(detail(page)).toContainText('Network A')
  await expect(detail(page)).not.toContainText('Fiber pair')
  // A switch port's path is the Path bar's, not a chain or a walk sheet in the panel.
  await expect(detail(page).getByTestId('chain')).toHaveCount(0)
  await expect(detail(page).getByTestId('walk-sheet')).toHaveCount(0)
  await expectNear(page, 'right', 'cable-a01', 'PANEL-A')
  await pathBar(page)
    .getByRole('button', { name: /^Open PANEL-A/ })
    .click() // opens PANEL-A's front
  await expectMark(page, 'data-selected-endpoint', 'panel-a:1:f')

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await endpoint(page, 'edge-17:p4').click()
  await expect(pathBar(page)).toContainText('Select a cabled jack on the face')
  await expect(plates(page)).toHaveCount(0)

  // A free position: no cable on either side, the path card is its one line.
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  await endpoint(page, 'panel-a:10:f').click()
  await expect(pathBar(page)).toContainText('Select a cabled jack on the face')
  await expect(plates(page)).toHaveCount(0)
  await peers(page)
    .getByRole('button', { name: /^Switch to rear/ })
    .click()
  await expectMark(page, 'data-selected-endpoint', 'panel-a:10:r')
  await expectMark(page, 'data-side', 'rear')
})

test('D48-01 Pairs | Pigtails is on every panel and is the same choice as the HDF', async ({
  page,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  const numbers = page.getByRole('group', { name: 'Numbers' })
  await expect(numbers).toHaveCount(1)
  const jack = endpoint(page, 'panel-a:1:f')
  await expect(jack).toHaveText('1')
  await expect(numbers.getByRole('button', { name: 'Pairs' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await numbers.getByRole('button', { name: 'Pigtails' }).click()
  await expect(jack.locator('.jack-line')).toHaveText(['1', '2'])
  expect((await jack.getAttribute('aria-label')) ?? '').toContain(
    'pigtails 1,2',
  )
  await expect(endpoint(page, 'panel-a:3:f').locator('.jack-line')).toHaveText([
    '5',
    '6',
  ])
  const j = (await jack.boundingBox())!
  expect(Math.abs(j.width - j.height)).toBeLessThanOrEqual(1) // fitted: square (D50)
  expect(j.width).toBeGreaterThanOrEqual(18)
  const lines = jack.locator('.jack-line')
  for (let i = 0; i < 2; i++) {
    const l = (await lines.nth(i).boundingBox())!
    expect(l.y).toBeGreaterThanOrEqual(j.y - 0.5)
    expect(l.y + l.height).toBeLessThanOrEqual(j.y + j.height + 0.5)
    expect(l.x).toBeGreaterThanOrEqual(j.x - 0.5)
    expect(l.x + l.width).toBeLessThanOrEqual(j.x + j.width + 0.5)
  }
  await page.screenshot({ path: 'test-results/d48/panel-a-pigtails.png' })

  // The same choice: the HDF is already on Pigtails, and Pairs there puts the panel back.
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  await expect(
    numbers.getByRole('button', { name: 'Pigtails' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    endpoint(page, 'hdf-01:sp-3C:5:f').locator('.jack-line'),
  ).toHaveText(['9', '10'])
  await numbers.getByRole('button', { name: 'Pairs' }).click()
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  await expect(numbers.getByRole('button', { name: 'Pairs' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(jack).toHaveText('1')
})
