import { expect, test, type APIRequestContext, type Page } from './fixtures'
import { fitted, openRackInPhysical } from './helpers'
import { planWith32RowHdf } from './plan-api'

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
const chain = (page: Page) =>
  page.locator('[data-testid="chain"] [data-testid^="chain-"]')
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
  await block(page, id).click()
  await expectMark(page, 'data-physical-level', 'equipment')
}
async function traceAgg03(page: Page) {
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}
/** Role of each item of the chain: a box's role, or a connector's kind. */
const roles = (page: Page) =>
  chain(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-role') ?? e.getAttribute('data-link')),
  )

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

test('PB-05 jacks are 28×30 on a switch and a panel and 32×32 on an HDF, numbers at least 11px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 })
  const fontOf = (id: string) =>
    endpoint(page, id).evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  const port = await box(page, 'edge-17:p1')
  expect(Math.abs(port.width - 28)).toBeLessThanOrEqual(1)
  expect(Math.abs(port.height - 30)).toBeLessThanOrEqual(1)
  expect(await fontOf('edge-17:p1')).toBeGreaterThanOrEqual(11)
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  expect(
    Math.abs((await box(page, 'panel-a:1:f')).width - 28),
  ).toBeLessThanOrEqual(1)
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  const jack = await box(page, 'hdf-01:sp-3C:5:f')
  expect(Math.abs(jack.width - 32)).toBeLessThanOrEqual(1)
  expect(Math.abs(jack.height - 32)).toBeLessThanOrEqual(1)
  expect(await fontOf('hdf-01:sp-3C:5:f')).toBe(13)
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
    .click()
  await expectMark(page, 'data-face-positions', '768')
  await expect(page.locator('.hdf-row').first()).toHaveText('32')
  expect(await page.locator('.hdf-scroll').evaluate((e) => e.scrollTop)).toBe(0)
  await page.screenshot({
    path: 'test-results/workbench-1b/hdf-32-rows.png',
  })
})

test('PB-05b a 32-row HDF scrolls inside its face and keeps its letters and row numbers in view', async ({
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
    .click()
  await expectMark(page, 'data-face-positions', '768')
  const scroller = page.locator('.hdf-scroll')
  expect(
    await scroller.evaluate((e) => e.scrollHeight > e.clientHeight + 1),
  ).toBe(true)
  await scroller.evaluate((e) => {
    e.scrollTop = 600
  })
  await expect
    .poll(() => scroller.evaluate((e) => e.scrollTop))
    .toBeGreaterThan(500)
  const area = (await scroller.boundingBox())!
  const letter = (await page
    .locator('.hdf-col', { hasText: 'A' })
    .boundingBox())!
  expect(letter.y).toBeGreaterThanOrEqual(area.y - 1)
  expect(letter.y).toBeLessThan(area.y + 40)
  const visible = await page.evaluate(() => {
    const area = document.querySelector('.hdf-scroll')!.getBoundingClientRect()
    const rows = [...document.querySelectorAll('.hdf-row')]
    const shown = (n: number) => {
      const r = rows
        .find((e) => e.textContent === String(n))!
        .getBoundingClientRect()
      // Below the sticky letters (about 20px) and inside the scroller.
      return r.bottom > area.top + 24 && r.top < area.bottom
    }
    return {
      first: shown(32),
      later: rows.some(
        (e) => Number(e.textContent) <= 22 && shown(Number(e.textContent)),
      ),
      pageScroll: document.scrollingElement!.scrollTop,
    }
  })
  expect(visible).toEqual({ first: false, later: true, pageScroll: 0 })
  const metrics = await page.evaluate(() => {
    const s = document.querySelector('.hdf-scroll') as HTMLElement
    const pageEl = document.querySelector('.equipment-page') as HTMLElement
    return {
      overflowY: getComputedStyle(s).overflowY,
      pageScrolls: pageEl.scrollHeight > pageEl.clientHeight + 1,
      windowScrolls:
        document.documentElement.scrollHeight > window.innerHeight + 1,
    }
  })
  expect(metrics).toEqual({
    overflowY: expect.stringMatching(/auto|scroll/),
    pageScrolls: false,
    windowScrolls: false,
  })
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

  // The chain, top to bottom.
  await expect(chain(page)).toHaveCount(7)
  expect(await roles(page)).toEqual([
    'far',
    'cable',
    'self',
    'bridge',
    'other',
    'cable',
    'otherFar',
  ])
  const want: string[][] = [
    ['PANEL-A', '1', 'rear', 'Main Campus › Building A › Rack A03'],
    ['cable-a02'],
    ['3C / 5 rear'],
    ['bridge'],
    ['3C / 5 front'],
    ['cable-a03'],
    ['HDF-02', '2B/3 front', 'Main Campus › Main Distribution › Rack Core 01'],
  ]
  for (const [i, parts] of want.entries())
    for (const part of parts)
      await expect(chain(page).nth(i)).toContainText(part)
  // The route runs through every hop of it.
  for (let i = 0; i < 7; i++)
    await expect(chain(page).nth(i)).toHaveAttribute('data-on-route', 'true')
  // The cables are solid lines, the bridge is dashed; this endpoint is the highlighted box.
  await expect(chain(page).nth(1).locator('.chain-line')).toHaveCSS(
    'border-left-style',
    'solid',
  )
  await expect(chain(page).nth(3).locator('.chain-line')).toHaveCSS(
    'border-left-style',
    'dashed',
  )
  await expect(chain(page).nth(2)).toHaveAttribute('data-self', 'true')

  const depth = Number(await mark(page, 'data-history-depth'))
  // The far end opens that place (a step in the history), and Back returns.
  await chain(page).nth(0).getByRole('button').click()
  await expectMark(page, 'data-selected-endpoint', 'panel-a:1:r')
  await expectMark(page, 'data-history-depth', String(depth + 1))
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  // The other side switches (no history entry), and the chain is that side's.
  await chain(page).nth(4).getByRole('button').click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:f')
  await expectMark(page, 'data-history-depth', String(depth))
  expect(await roles(page)).toEqual([
    'far',
    'cable',
    'self',
    'bridge',
    'other',
    'cable',
    'otherFar',
  ])
  await expect(chain(page).nth(0)).toContainText('HDF-02')
  await chain(page).nth(4).getByRole('button').click() // back to the rear
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  // The last box goes there.
  await chain(page).nth(6).getByRole('button').click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-02:sp-2B:3:f')
  await expectMark(page, 'data-selected-equipment', 'hdf-02')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  // The selected endpoint itself is not a link.
  await expect(chain(page).nth(2).getByRole('button')).toHaveCount(0)
})

test('PD-02 a switch port is port → cable → far end; a side with no cable is a dashed "no cable" box', async ({
  page,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  await endpoint(page, 'edge-17:p1').click()
  await expect(detail(page)).toContainText('Port 1')
  await expect(detail(page)).toContainText('EDGE-17')
  await expect(detail(page)).toContainText('Network A')
  await expect(detail(page)).not.toContainText('Fiber pair')
  // A switch port shows its walk sheet, not the chain.
  const walk = detail(page).getByTestId('walk-sheet')
  await expect(detail(page).getByTestId('chain')).toHaveCount(0)
  await expect(walk.getByTestId('walk-row').nth(1)).toContainText('PANEL-A')
  await expect(walk.getByTestId('walk-cable').first()).toHaveAttribute(
    'data-link',
    'cable-a01',
  )
  await walk.getByTestId('walk-row').nth(1).click() // opens PANEL-A's front
  await expectMark(page, 'data-selected-endpoint', 'panel-a:1:f')

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await endpoint(page, 'edge-17:p4').click()
  await expect(walk.getByTestId('walk-end')).toHaveAttribute('data-end', 'none')
  await expect(walk.getByTestId('walk-row')).toHaveCount(1)

  // A free position: no cable on either side, the bridge between them.
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  await endpoint(page, 'panel-a:10:f').click()
  expect(await roles(page)).toEqual(['none', 'self', 'bridge', 'other', 'none'])
  await expect(chain(page).nth(3)).toContainText('10 rear')
  await chain(page).nth(3).getByRole('button').click()
  await expectMark(page, 'data-selected-endpoint', 'panel-a:10:r')
  await expectMark(page, 'data-side', 'rear')
})
