import { expect, test, type Page } from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'

const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)
const block = (page: Page, id: string) =>
  page.locator(`.rack-block[data-equipment-id="${id}"]`)
const endpoint = (page: Page, id: string) =>
  page.locator(`[data-testid="face-endpoint"][data-endpoint-id="${id}"]`)
const focused = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.getAttribute('data-endpoint-id') ?? '',
  )
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

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('RK-01 a 12U rack labels every unit with every fifth bold, and a node preview of a 42U rack is a small fixed drawing', async ({
  page,
}) => {
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  const cabinet = page.locator('.rack-cabinet')
  await expect(cabinet).toHaveAttribute('data-unit-px', '30')
  await expect(cabinet.locator('.unit-label')).toHaveText(
    Array.from({ length: 12 }, (_, i) => `U${12 - i}`),
  )
  await expect(cabinet.locator('.unit-label.strong')).toHaveText(['U10', 'U5'])

  // The annex has an empty 42U rack.
  await page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('button', { name: 'Sites', exact: true })
    .click()
  await page.getByRole('button', { name: 'Open Annex', exact: true }).click()
  // A node preview of a 42U rack is a fixed small drawing, about 260 px.
  await page
    .getByRole('button', { name: 'Open racks of Annex Hall', exact: true })
    .click()
  const mini = await page.locator('.mini-rack').boundingBox()
  expect(mini!.height).toBeGreaterThanOrEqual(255)
  expect(mini!.height).toBeLessThanOrEqual(275)
  // The 42U rack itself is VP-03 (visual-pass.spec.ts).
})

test('RK-02 each kind of equipment has its own faceplate; the name and the small line show when there is room', async ({
  page,
}) => {
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 01',
  )
  await expect(block(page, 'agg-03')).toHaveAttribute('data-kind', 'switch')
  await expect(
    block(page, 'agg-03').locator('.plate[data-plate="switch"]'),
  ).toHaveCount(1)
  await expect(block(page, 'hdf-02')).toHaveAttribute('data-kind', 'hdf')
  await expect(
    block(page, 'hdf-02').locator('.plate[data-plate="hdf"]'),
  ).toContainText('3 rows')
  await expect(block(page, 'agg-03')).toContainText('AGG-03')
  await expect(block(page, 'agg-03')).toContainText(
    'AGG · Network A · 1U at U8',
  )
  await expect(block(page, 'hdf-02')).toContainText('passive · 3U at U4–U6')
  await page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('button', { name: 'Main Distribution', exact: true })
    .click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await expect(block(page, 'panel-a')).toHaveAttribute('data-kind', 'panel')
  await expect(
    block(page, 'panel-a').locator('.plate[data-plate="panel"]'),
  ).toHaveCount(1)

  // Short of room, the small line moves to the tooltip.
  await page.setViewportSize({ width: 1440, height: 430 })
  await expect(page.locator('.rack-cabinet')).toHaveAttribute(
    'data-unit-px',
    '26',
  )
  const edge = block(page, 'edge-17')
  await expect(edge).toContainText('EDGE-17')
  await expect(edge).not.toContainText('Network A')
  await expect(edge).toHaveAttribute('title', /access · Network A · 1U at U8/)
})

test('RK-02 states: route teal, selected paper ring, proposed dashed with a tag, other networks muted', async ({
  page,
}) => {
  await traceAgg03(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await expect(block(page, 'edge-17')).toHaveCSS(
    'border-top-color',
    'rgb(15, 139, 122)',
  )
  await expect(block(page, 'panel-a')).toHaveCSS(
    'border-top-color',
    'rgb(15, 139, 122)',
  )
  await block(page, 'edge-17').click() // opens its page; Back returns with it selected
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(block(page, 'edge-17')).toHaveAttribute('data-selected', 'true')
  await expect(block(page, 'edge-17')).toHaveCSS(
    'outline-color',
    'rgb(255, 255, 255)',
  )

  await page.goto('/?plan=expansion')
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await expect(block(page, 'edge-18')).toHaveCSS('border-top-style', 'dashed')
  await expect(block(page, 'edge-18')).toContainText('Proposed')
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  await expect(block(page, 'edge-17')).toHaveCSS('opacity', '0.45')
  await expect(block(page, 'edge-17')).toBeVisible() // muted, not hidden
})

test('PB-01 EDGE-17’s faceplate puts ports 1,3,5… on top and 2,4,6… below, with a link dot on cabled ports and the cable in the tooltip', async ({
  page,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  const plate = page.locator('.faceplate[data-kind="switch"]')
  await expect(plate).toHaveCSS('background-color', 'rgb(31, 39, 49)')
  const [p1, p2, p3, p4] = await Promise.all(
    [1, 2, 3, 4].map((n) => box(page, `edge-17:p${n}`)),
  )
  expect(Math.abs(p1.x - p2.x)).toBeLessThan(1.5) // the same column
  expect(p2.y).toBeGreaterThan(p1.y + 10) // 2 below 1
  expect(Math.abs(p3.y - p1.y)).toBeLessThan(1.5) // 3 on the top row
  expect(p3.x).toBeGreaterThan(p1.x + 10)
  expect(Math.abs(p4.y - p2.y)).toBeLessThan(1.5)
  for (const [n, row] of [
    [1, '0'],
    [2, '1'],
    [12, '1'],
    [13, '0'],
    [24, '1'],
  ] as const)
    await expect(endpoint(page, `edge-17:p${n}`)).toHaveAttribute(
      'data-row',
      row,
    )
  await expect(endpoint(page, 'edge-17:p1').locator('.link-dot')).toHaveCount(1)
  await expect(endpoint(page, 'edge-17:p4').locator('.link-dot')).toHaveCount(0)
  await expect(endpoint(page, 'edge-17:p3')).toHaveAttribute(
    'title',
    'port 3 · cable-a09 → PANEL-A 3 front',
  )
  await expect(endpoint(page, 'edge-17:p4')).toHaveAttribute(
    'title',
    'port 4 · free',
  )
  // States are as before: cabled in the circuit network's color, a ring on the selected one.
  await expect(endpoint(page, 'edge-17:p1')).toHaveAttribute(
    'data-state',
    'cabled',
  )
  await endpoint(page, 'edge-17:p1').click()
  await expect(endpoint(page, 'edge-17:p1')).toHaveAttribute(
    'data-selected',
    'true',
  )
  await expect(endpoint(page, 'edge-17:p1')).toHaveAccessibleName(
    'EDGE-17 port 1, cabled, Network A, selected',
  )
})

test('PB-01 a standard panel is a strip in the same style, rows of 12, with Front and Rear unchanged', async ({
  page,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'panel-a')
  await expect(page.locator('.faceplate[data-kind="panel"]')).toHaveCSS(
    'background-color',
    'rgb(31, 39, 49)',
  )
  await expect(endpoint(page, 'panel-a:1:f')).toHaveAttribute('data-row', '0')
  await expect(endpoint(page, 'panel-a:13:f')).toHaveAttribute('data-row', '1')
  await expect(endpoint(page, 'panel-a:1:f')).toHaveAttribute(
    'title',
    'position 1 front · cable-a01 → EDGE-17 Port 1',
  )
  await page
    .getByRole('group', { name: 'Side' })
    .getByRole('button', { name: 'Rear' })
    .click()
  await expect(endpoint(page, 'panel-a:1:r')).toHaveAttribute(
    'title',
    /^position 1 rear · cable-a02 → HDF-01 3C\/5 rear/,
  )
})

test('PB-02 the legend has one swatch per network present on the face, plus free, route and selected', async ({
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
  await page
    .getByRole('group', { name: 'Side' })
    .getByRole('button', { name: 'Rear' })
    .click()
  const legend = page.getByLabel('Legend')
  await expect(legend.getByTestId('legend-network')).toHaveText([
    'Network A',
    'Network B',
  ])
  const ids = await legend
    .getByTestId('legend-network')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-network')))
  expect(ids).toEqual(['net-a', 'net-b'])
  await expect(legend).toContainText('free')
  await expect(legend).toContainText('on the selected route')
  await expect(legend).toContainText('selected')
  // A switch with only Network A cables has one network swatch.
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  await expect(
    page.getByLabel('Legend').getByTestId('legend-network'),
  ).toHaveText(['Network A'])
})

test('PB-03 a switch face is one tab stop; arrows, Home, End, Enter and Space move and select', async ({
  page,
}) => {
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')
  const stops = page.locator('[data-testid="face-endpoint"][tabindex="0"]')
  await expect(stops).toHaveCount(1)
  await stops.focus()
  expect(await focused(page)).toBe('edge-17:p1')
  const press = async (key: string, expected: string) => {
    await page.keyboard.press(key)
    expect(await focused(page)).toBe(expected)
    await expect(stops).toHaveCount(1) // the one tab stop travels with the focus
    expect(await stops.getAttribute('data-endpoint-id')).toBe(expected)
  }
  await press('ArrowRight', 'edge-17:p3')
  await press('ArrowDown', 'edge-17:p4')
  await press('ArrowLeft', 'edge-17:p2')
  await press('ArrowUp', 'edge-17:p1')
  await press('End', 'edge-17:p24')
  await press('Home', 'edge-17:p1')
  await press('ArrowRight', 'edge-17:p3')
  await page.keyboard.press('Enter')
  await expectMark(page, 'data-selected-endpoint', 'edge-17:p3')
  await press('ArrowRight', 'edge-17:p5')
  await page.keyboard.press(' ')
  await expectMark(page, 'data-selected-endpoint', 'edge-17:p5')
  // Tab leaves the face.
  await page.keyboard.press('Tab')
  expect(await focused(page)).not.toMatch(/^edge-17:p/)
})

test('PB-03 on an HDF the arrows cross blocks, and the whole grid is one tab stop', async ({
  page,
}) => {
  await openEquipment(
    page,
    'Main Campus',
    'North Sub-main',
    'Rack SM01',
    'hdf-01',
  )
  const stops = page.locator('[data-testid="face-endpoint"][tabindex="0"]')
  await expect(stops).toHaveCount(1)
  await stops.focus()
  expect(await focused(page)).toBe('hdf-01:sp-1A:1:f')
  const press = async (key: string, expected: string) => {
    await page.keyboard.press(key)
    expect(await focused(page)).toBe(expected)
  }
  await press('ArrowRight', 'hdf-01:sp-1A:2:f')
  await press('ArrowRight', 'hdf-01:sp-1A:3:f')
  await press('ArrowRight', 'hdf-01:sp-1B:1:f') // into the next block
  await press('ArrowDown', 'hdf-01:sp-1B:4:f')
  await press('ArrowDown', 'hdf-01:sp-2B:1:f') // into the next block row
  await press('ArrowUp', 'hdf-01:sp-1B:4:f')
  await press('End', 'hdf-01:sp-4D:6:f')
  await press('Home', 'hdf-01:sp-1A:1:f')
  // After selecting, the tab stop is the selected endpoint.
  await page
    .getByRole('group', { name: 'Side' })
    .getByRole('button', { name: 'Rear' })
    .click()
  await endpoint(page, 'hdf-01:sp-3C:5:r').click()
  await expect(stops).toHaveCount(1)
  expect(await stops.getAttribute('data-endpoint-id')).toBe('hdf-01:sp-3C:5:r')
})

test('RK-01 a 42U cabinet scrolls clear of the results panel at the bottom of the page', async ({
  page,
}) => {
  await traceAgg03(page)
  await openRackInPhysical(page, 'Annex', 'Annex Hall', 'Rack T42')
  await expectMark(page, 'data-physical-level', 'rack')
  const panel = page.getByLabel('Map trace results')
  await expect(panel).toBeVisible()
  // Scrolled to the bottom, every unit, the lowest included, is above the panel's top edge.
  const bottomClear = async () => {
    await page
      .locator('.rack-level')
      .evaluate((el) => (el.scrollTop = el.scrollHeight))
    const panelTop = (await panel.boundingBox())!.y
    let worst = 0
    for (const unit of [1, 2, 3, 4, 20, 42]) {
      const slot = (await page
        .getByTestId(`rack-slot-rack-t42-${unit}`)
        .boundingBox())!
      worst = Math.max(worst, slot.y + slot.height)
    }
    return worst <= panelTop + 1
  }
  await expect.poll(bottomClear).toBe(true)
  // Expanding the panel leaves U1 clear once the rack level is scrolled again.
  await panel.getByRole('button', { name: 'Expand results' }).click()
  await expect.poll(bottomClear).toBe(true)
})

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`RK-01 at ${size.width}×${size.height} U1 of the 42U rack ends above the results panel once scrolled to the bottom`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await page.goto('/')
    await fitted(page)
    await traceAgg03(page) // the panel is open in Conceptual
    await openRackInPhysical(page, 'Annex', 'Annex Hall', 'Rack T42')
    await expectMark(page, 'data-physical-level', 'rack')
    const panel = page.getByLabel('Map trace results')
    await expect(
      panel.getByRole('button', { name: 'Expand results' }),
    ).toBeVisible() // collapsed in Physical
    const check = async () => {
      await page
        .locator('.rack-level')
        .evaluate((el) => (el.scrollTop = el.scrollHeight))
      const panelTop = (await panel.boundingBox())!.y
      const slot = (await page
        .getByTestId('rack-slot-rack-t42-1')
        .boundingBox())!
      // The rack level scrolls, never the page around it.
      const pageScrolls = await page.evaluate(
        () => document.documentElement.scrollHeight > window.innerHeight + 1,
      )
      return slot.y + slot.height <= panelTop + 1 && !pageScrolls
    }
    await expect.poll(check).toBe(true)
    // Resizing the window keeps it so.
    await page.setViewportSize({ width: size.width, height: size.height - 60 })
    await expect.poll(check).toBe(true)
  })
}
