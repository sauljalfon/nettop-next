import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'

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

test('PB-04 the HDF is one dark chassis: letters above, row numbers at the left, a recessed module per block', async ({
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
  await expect(plate).toHaveCSS('background-color', 'rgb(31, 39, 53)')
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
  await expect(first.locator('code')).toHaveText('1A')
  // A recessed module: darker than the chassis, and a teal border where the route is.
  await expect(first).toHaveCSS('background-color', 'rgb(21, 27, 39)')
  const route = page.locator('[data-testid="face-block"][data-block="3C"]')
  await expect(route).toHaveAttribute('data-on-route', 'true')
  await expect(route).toHaveCSS('border-top-color', 'rgb(16, 139, 121)')
  await expect(first).toHaveAttribute('data-on-route', 'false')
  // Six jack-shaped positions in 3 × 2, with the link dot on cabled ones.
  const [p1, p2, p3, p4] = await Promise.all(
    [1, 2, 3, 4].map((n) => box(page, `hdf-01:sp-3C:${n}:f`)),
  )
  expect(Math.abs(p1.y - p2.y)).toBeLessThan(1.5)
  expect(Math.abs(p2.y - p3.y)).toBeLessThan(1.5)
  expect(p4.y).toBeGreaterThan(p1.y + 10)
  expect(Math.abs(p4.x - p1.x)).toBeLessThan(1.5)
  await expect(
    endpoint(page, 'hdf-01:sp-3C:5:f').locator('.link-dot'),
  ).toHaveCount(1)
  await expect(
    endpoint(page, 'hdf-01:sp-3C:4:f').locator('.link-dot'),
  ).toHaveCount(0)
  // States: cabled in the network's color, route teal, free white; selected ring.
  await expect(endpoint(page, 'hdf-01:sp-3C:2:f')).toHaveCSS(
    'background-color',
    'rgb(154, 79, 199)',
  ) // Network B
  await expect(endpoint(page, 'hdf-01:sp-3C:5:f')).toHaveCSS(
    'background-color',
    'rgb(16, 139, 121)',
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

test('PB-05 jacks are about 44 px on a switch and a panel and 34 px on an HDF, with readable numbers; a 32-row HDF scrolls inside its card', async ({
  page,
  request,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  const port = await box(page, 'edge-17:p1')
  expect(Math.abs(port.width - 44)).toBeLessThanOrEqual(1.5)
  expect(
    Number(
      await endpoint(page, 'edge-17:p1').evaluate((e) =>
        parseFloat(getComputedStyle(e).fontSize),
      ),
    ),
  ).toBeGreaterThanOrEqual(11)
  // Twelve columns fit the face card without a scrollbar.
  const fits = await page
    .locator('.faceplate[data-kind="switch"]')
    .evaluate((e) => e.scrollWidth <= e.clientWidth + 1)
  expect(fits).toBe(true)
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  expect(
    Math.abs((await box(page, 'panel-a:1:f')).width - 44),
  ).toBeLessThanOrEqual(1.5)
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  const jack = await box(page, 'hdf-01:sp-3C:5:f')
  expect(Math.abs(jack.width - 34)).toBeLessThanOrEqual(1.5)
  expect(
    Number(
      await endpoint(page, 'hdf-01:sp-3C:5:f').evaluate((e) =>
        parseFloat(getComputedStyle(e).fontSize),
      ),
    ),
  ).toBeGreaterThanOrEqual(11)

  // A 32-row HDF scrolls inside the face card, not the page.
  const id = await planWith32RowHdf(request)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page
    .locator('.rack-block[data-kind="hdf"]', { hasText: 'HDF-BIG' })
    .click()
  await expectMark(page, 'data-face-positions', '768')
  const metrics = await page.evaluate(() => {
    const scroller = document.querySelector('.hdf-scroll') as HTMLElement
    const pageEl = document.querySelector('.equipment-page') as HTMLElement
    return {
      inner: scroller.scrollHeight > scroller.clientHeight + 1,
      overflowY: getComputedStyle(scroller).overflowY,
      pageScrolls: pageEl.scrollHeight > pageEl.clientHeight + 1,
      windowScrolls:
        document.documentElement.scrollHeight > window.innerHeight + 1,
    }
  })
  expect(metrics).toEqual({
    inner: true,
    overflowY: expect.stringMatching(/auto|scroll/),
    pageScrolls: false,
    windowScrolls: false,
  })
})

async function planWith32RowHdf(request: APIRequestContext) {
  const created = await request.post('/api/plans', {
    data: { name: 'Big HDF', expectedBaseRevision: 'acceptance-1' },
  })
  const id = (await created.json()).id as string
  const added = await request.post(`/api/plans/${id}/commands`, {
    data: {
      type: 'add_hdf',
      expectedRevision: '1',
      hdf: {
        name: 'HDF-BIG',
        rackId: 'rack-sm01',
        unit: 7,
        height: 3,
        rows: 32,
      },
    },
  })
  expect(added.status()).toBe(200)
  return id
}

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
    ['PANEL-A', '1', 'rear', 'Main Campus / Building A / Rack A03'],
    ['cable-a02'],
    ['3C / 5 rear'],
    ['bridge'],
    ['3C / 5 front'],
    ['cable-a03'],
    ['HDF-02', '2B/3 front', 'Main Campus / Main Distribution / Rack Core 01'],
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
  expect(await roles(page)).toEqual(['far', 'cable', 'self'])
  await expect(chain(page).nth(0)).toContainText('PANEL-A')
  await expect(chain(page).nth(1)).toContainText('cable-a01')
  await chain(page).nth(0).getByRole('button').click() // Go to peer
  await expectMark(page, 'data-selected-endpoint', 'panel-a:1:f')

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await endpoint(page, 'edge-17:p4').click()
  expect(await roles(page)).toEqual(['none', 'self'])
  await expect(chain(page).nth(0)).toContainText('no cable')
  await expect(chain(page).nth(0)).toHaveCSS('border-top-style', 'dashed')
  await expect(chain(page).nth(0).getByRole('button')).toHaveCount(0)

  // A free position: no cable on either side, the bridge between them.
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  await endpoint(page, 'panel-a:10:f').click()
  expect(await roles(page)).toEqual(['none', 'self', 'bridge', 'other', 'none'])
  await expect(chain(page).nth(3)).toContainText('10 rear')
  await chain(page).nth(3).getByRole('button').click()
  await expectMark(page, 'data-selected-endpoint', 'panel-a:10:r')
  await expectMark(page, 'data-side', 'rear')
})
