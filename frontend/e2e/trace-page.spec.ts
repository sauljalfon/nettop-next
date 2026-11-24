import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from './fixtures'
import type { TraceResult } from '../src/shared/types'
import { captureLayout, stackSize } from '../src/features/map/exportRoute'
import {
  BUILDING_A,
  fitted,
  hierarchyState,
  openRackInPhysical,
  selectEquipment,
  settledViewport,
  showNodeDetails,
} from './helpers'
import { newPlan, command } from './plan-api'

// Workbench part 3, task 5: the Trace page (D46).
test.use({ viewport: { width: 1536, height: 864 } })

const tp = (page: Page) => page.getByTestId('trace-page')
const drawing = (page: Page) => tp(page).getByTestId('trace-drawing')
const frames = (page: Page) => drawing(page).getByTestId('trace-frame')
const plates = (page: Page) => drawing(page).getByTestId('path-plate')
const list = (page: Page) =>
  tp(page).getByRole('complementary', { name: 'Results' })
const items = (page: Page) => list(page).getByTestId('trace-item')
const walk = (page: Page) => tp(page).getByTestId('trace-walk')
const canvas = (page: Page) => tp(page).getByTestId('trace-canvas')
const bar = (page: Page) => tp(page).getByTestId('trace-bar')
const zoomOf = async (page: Page) =>
  Number(await canvas(page).getAttribute('data-zoom'))
const dockOpen = (page: Page) => page.locator('.dock:not([hidden])')
const exportButton = (page: Page, name: 'PNG' | 'PDF') =>
  bar(page).getByRole('button', { name, exact: true })
const backButton = (page: Page) =>
  tp(page).getByRole('button', { name: '← Back', exact: true })

async function findFrom(page: Page, name: string, routes: number) {
  await selectEquipment(page, name)
  await page
    .getByRole('button', { name: `Find AGG / BB from ${name}`, exact: true })
    .click()
  await expect(
    page.getByLabel('Trace results').getByTestId('route-row'),
  ).toHaveCount(routes)
}

/** Find AGG / BB from a switch, then Open full page ⤢ in the dock's Trace tab. */
async function openPage(page: Page, name = 'EDGE-17', routes = 3) {
  await findFrom(page, name, routes)
  await page.getByRole('button', { name: 'Open full page ⤢' }).click()
  await expect(tp(page)).toBeVisible()
  await expect(plates(page).first()).toBeVisible()
}

async function crossNetworkPlan(request: Parameters<typeof newPlan>[0]) {
  const id = await newPlan(request, 'Cross network')
  await command(request, id, {
    type: 'add_cable',
    cable: { a: 'edge-17:p4', b: 'agg-12:p2' },
  })
  return id
}

const sideways = (page: Page) =>
  page.evaluate(
    () =>
      [
        document.documentElement,
        document.body,
        ...document.querySelectorAll('.studio, .workspace-canvas, .trace-page'),
      ].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
  )

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('TP-01 Open full page shows the trace on its own page', async ({
  page,
}) => {
  await openPage(page)
  // No dock; the rail's Trace shows on; the view switch has none pressed.
  await expect(dockOpen(page)).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Open trace tools', exact: true }),
  ).toHaveClass(/active/)
  for (const v of ['Conceptual', 'Physical', 'Inventory'])
    await expect(
      page.getByRole('button', { name: v, exact: true }),
    ).toHaveAttribute('aria-pressed', 'false')
  // The bar.
  await expect(backButton(page)).toBeVisible()
  await expect(bar(page)).toContainText('Trace')
  await expect(
    bar(page).getByRole('button', { name: 'One route', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    bar(page).getByRole('button', { name: 'All routes', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  for (const name of ['Show on map', 'PNG', 'PDF'])
    await expect(
      bar(page).getByRole('button', { name, exact: true }),
    ).toBeVisible()
  await expect(bar(page)).toContainText('Export')
  // The list: counts, AGG first, then BB, and what each port found.
  await expect(list(page)).toContainText('3 routes · 0 mismatches')
  await expect(list(page)).toContainText(/from \d+ of \d+ ports/)
  await expect(items(page)).toHaveCount(3)
  await expect(items(page).nth(0)).toContainText('AGG-03')
  await expect(items(page).nth(1)).toContainText('AGG-08')
  await expect(items(page).nth(2)).toContainText('BB-01')
  await expect(items(page).first()).toHaveAttribute('aria-pressed', 'true')
  await expect(list(page).getByTestId('trace-group')).toHaveText([
    /^AGG\s*2$/,
    /^BB\s*1$/,
  ])
  await expect(list(page)).toContainText(/What each port found · \d+ searched/)
  // The title, the counts and the drawing.
  await expect(tp(page).getByTestId('trace-title')).toHaveText(
    'EDGE-17 · Port 1 → AGG-03 · Port 1',
  )
  await expect(tp(page).getByTestId('trace-counts')).toContainText('4 cables')
  await expect(tp(page).getByTestId('trace-counts')).toContainText(
    '5 equipment',
  )
  await expect(plates(page)).toHaveCount(5)
  await expect(plates(page).last()).toHaveAttribute(
    'data-destination',
    'aggregation',
  )
  // The page is one screen wide.
  expect(await sideways(page)).toBe(0)
})

test('TP-02 node frames show where the route leaves a node', async ({
  page,
}) => {
  await openPage(page)
  await expect(frames(page)).toHaveCount(3)
  await expect(frames(page).locator('.nlabel')).toHaveText([
    'Main Campus › Building A',
    'Main Campus › North Sub-main',
    'Main Campus › Main Distribution',
  ])
  await expect(frames(page).first()).toHaveCSS('border-top-style', 'dashed')
  const names = (f: Locator) =>
    f
      .getByTestId('path-plate')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-equipment-id')))
  expect(await names(frames(page).nth(0))).toEqual(['edge-17', 'panel-a'])
  expect(await names(frames(page).nth(1))).toEqual(['hdf-01'])
  expect(await names(frames(page).nth(2))).toEqual(['hdf-02', 'agg-03'])
  // The cable between two nodes stands between the frames; the others are inside.
  const between = drawing(page).locator(
    ':scope > .trace-line > [data-testid="path-cable"]',
  )
  await expect(between).toHaveCount(2)
  expect(
    await between.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-link')),
    ),
  ).toEqual(['cable-a02', 'cable-a03'])
  await expect(frames(page).first().getByTestId('path-cable')).toHaveAttribute(
    'data-link',
    'cable-a01',
  )
  // The frames and the cables between them are in route order, left to right.
  const boxes = await drawing(page)
    .locator(
      '[data-testid="trace-frame"], :scope > .trace-line > [data-testid="path-cable"]',
    )
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
  for (let i = 1; i < boxes.length; i++)
    expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x)
})

test('TP-03 the walk has a row per equipment with Open', async ({ page }) => {
  await openPage(page)
  await expect(tp(page)).toContainText('Walk, step by step')
  await expect(walk(page).locator('thead th')).toHaveText([
    '#',
    'Equipment',
    'Where',
    'Arrives at',
    'Leaves from',
    '',
    '',
  ])
  const rows = walk(page).getByTestId('walk-row')
  await expect(rows).toHaveCount(5)
  await expect(rows.locator('.walk-name bdi')).toHaveText([
    'EDGE-17',
    'PANEL-A',
    'HDF-01',
    'HDF-02',
    'AGG-03',
  ])
  await expect(rows.locator('.walk-note')).toHaveText([
    'start',
    'bridge',
    'bridge',
    'bridge',
    'end',
  ])
  await expect(rows.nth(0).locator('.walk-where')).toHaveText(
    'Main Campus › Building A › Rack A03',
  )
  await expect(rows.nth(0).locator('.walk-arrives')).toHaveText('—')
  await expect(rows.nth(0).locator('.walk-leaves')).toHaveText('Port 1')
  await expect(rows.nth(1).locator('.walk-arrives')).toContainText('front')
  await expect(rows.nth(1).locator('.walk-leaves')).toContainText('rear')
  await expect(rows.nth(4).locator('.walk-arrives')).toHaveText('Port 1')
  // A thin row per cable between the steps.
  await expect(walk(page).getByTestId('walk-cable')).toHaveCount(4)
  await expect(walk(page).getByTestId('walk-cable').first()).toContainText(
    'cable-a01',
  )
  // Open lands on that equipment's page, on that jack.
  const row = rows.nth(2)
  const endpoint = await row.getAttribute('data-endpoint')
  expect(endpoint).toBeTruthy()
  await row.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(tp(page)).toHaveCount(0)
  const root = page.locator('.physical-explorer')
  await expect(root).toBeVisible()
  await expect(root).toHaveAttribute('data-physical-level', 'equipment')
  await expect(root).toHaveAttribute('data-selected-endpoint', endpoint!)
  await expect(page.getByTestId('equipment-bar')).toContainText('HDF-01')
  await expect(
    page.getByRole('button', { name: 'Physical', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('TP-04 a mismatch is explained', async ({ page, request }) => {
  await page.goto(`/?plan=${await crossNetworkPlan(request)}`)
  await fitted(page)
  await findFrom(page, 'EDGE-17', 3)
  await page.getByRole('button', { name: 'Open full page ⤢' }).click()
  await expect(list(page)).toContainText('3 routes · 1 mismatch')
  const mm = list(page).locator('[data-kind="mismatch"]')
  await expect(mm).toHaveCount(1)
  await expect(list(page).getByTestId('trace-group').last()).toContainText(
    'Mismatch · another network',
  )
  await expect(mm).toContainText('AGG-12')
  await expect(mm).toContainText('Network B')
  // The routes are still the routes.
  await expect(tp(page).getByTestId('trace-note')).toHaveCount(0)
  await mm.click()
  await expect(mm).toHaveAttribute('aria-pressed', 'true')
  await expect(tp(page).getByTestId('trace-title')).toHaveText(
    'EDGE-17 · Port 4 → AGG-12 · Port 2',
  )
  const note = tp(page).getByTestId('trace-note')
  await expect(note).toContainText('A mismatch, not a route.')
  await expect(note).toContainText('Network A')
  await expect(note).toContainText('Network B')
  await expect(plates(page).last()).toContainText('AGG-12')
  await expect(plates(page).last()).toHaveAttribute(
    'data-destination',
    'aggregation',
  )
  // The walk is still there; the first route comes back with a click.
  await expect(walk(page).getByTestId('walk-row').last()).toContainText(
    'AGG-12',
  )
  await items(page).first().click()
  await expect(tp(page).getByTestId('trace-note')).toHaveCount(0)
  await expect(tp(page).getByTestId('trace-title')).toContainText('AGG-03')
})

test('TP-04 a trace with only mismatches opens, says so, and draws the first one', async ({
  page,
}) => {
  await page.route('**/api/traces*', async (route) => {
    const response = await route.fetch()
    const result = (await response.json()) as TraceResult
    await route.fulfill({
      response,
      json: {
        ...result,
        status: 'unreachable',
        mismatches: result.routes.slice(0, 1),
        routes: [],
      },
    })
  })
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Open full page ⤢' }).click()
  await expect(list(page)).toContainText('0 routes · 1 mismatch')
  await expect(items(page)).toHaveCount(1)
  await expect(items(page).first()).toHaveAttribute('data-kind', 'mismatch')
  await expect(tp(page).getByTestId('trace-note')).toContainText(
    'A mismatch, not a route.',
  )
  await expect(plates(page)).toHaveCount(5)
  await expect(exportButton(page, 'PNG')).toBeEnabled()
  await expect(exportButton(page, 'PDF')).toBeEnabled()
  await expect(canvas(page)).toHaveAttribute('data-zoom', /.+/)
})

test('TP-05 All routes outlines the shared equipment in amber', async ({
  page,
}) => {
  await openPage(page)
  await bar(page)
    .getByRole('button', { name: 'All routes', exact: true })
    .click()
  const routes = drawing(page).getByTestId('trace-route')
  await expect(routes).toHaveCount(3)
  const note = tp(page).getByTestId('trace-shared')
  await expect(note).toContainText('Every route passes')
  await expect(note).toContainText(
    'Different jacks, the same equipment: a problem there cuts all 3.',
  )
  const named = await note.locator('b bdi').allTextContents()
  expect(named.length).toBeGreaterThan(0)
  expect(named).not.toContain('EDGE-17')
  expect(named).not.toContain('AGG-03')
  // Every route outlines exactly those, and never its ends.
  for (let i = 0; i < 3; i++) {
    const shared = routes.nth(i).locator('[data-shared="true"]')
    expect(await shared.locator('.tape bdi').allTextContents()).toEqual(named)
  }
  await expect(
    routes.first().locator('[data-shared="true"]').first(),
  ).toHaveCSS('box-shadow', /rgb\(217, 154, 11\)/)
  // A label per route, and Open this route.
  await expect(routes.nth(0)).toContainText('AGG-03')
  await expect(routes.nth(2)).toContainText('BB-01')
  await expect(
    routes.first().getByRole('button', { name: 'Open this route' }),
  ).toBeVisible()
  expect(await sideways(page)).toBe(0)
  await routes.nth(2).getByRole('button', { name: 'Open this route' }).click()
  await expect(
    bar(page).getByRole('button', { name: 'One route', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(tp(page).getByTestId('trace-title')).toContainText('BB-01')
  await expect(items(page).nth(2)).toHaveAttribute('aria-pressed', 'true')
})

test('TP-06 zoom: + and − change the percentage, Fit returns, ⌘/Ctrl + wheel zooms, drag scrolls', async ({
  page,
}) => {
  await openPage(page)
  const box = tp(page).getByRole('group', { name: 'Zoom' })
  const percent = box.getByTestId('trace-zoom')
  const fit = await zoomOf(page)
  expect(fit).toBeGreaterThan(0.29)
  expect(fit).toBeLessThanOrEqual(1)
  await expect(percent).toHaveText(`${Math.round(fit * 100)}%`)
  await box.getByRole('button', { name: 'Zoom in' }).click()
  expect(await zoomOf(page)).toBeCloseTo(fit * 1.25, 2)
  await box.getByRole('button', { name: 'Zoom out' }).click()
  await box.getByRole('button', { name: 'Zoom out' }).click()
  expect(await zoomOf(page)).toBeCloseTo(fit / 1.25, 2)
  await box.getByRole('button', { name: 'Fit' }).click()
  expect(await zoomOf(page)).toBeCloseTo(fit, 2)

  // ⌘/Ctrl + wheel zooms; a plain wheel does not.
  const at = (await canvas(page).boundingBox())!
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
  await page.mouse.wheel(0, -100)
  expect(await zoomOf(page)).toBeCloseTo(fit, 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(fit * 1.2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 100)
  await page.keyboard.up('Control')
  await expect.poll(() => zoomOf(page)).toBeCloseTo(fit, 1)

  // A zoom that overflows scrolls; dragging the empty canvas moves it.
  for (let i = 0; i < 4; i++)
    await box.getByRole('button', { name: 'Zoom in' }).click()
  const scroller = canvas(page)
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  )
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(0)
  // Dragging to the left scrolls the picture to the right.
  await page.mouse.move(at.x + 300, at.y + 12)
  await page.mouse.down()
  await page.mouse.move(at.x + 100, at.y + 12, { steps: 5 })
  await page.mouse.up()
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50)
  // The zoom stays until Fit, another route, or One / All.
  const zoomed = await zoomOf(page)
  expect(zoomed).toBeGreaterThan(fit * 2)
  await items(page).nth(1).click()
  expect(await zoomOf(page)).toBeCloseTo(fit, 2)
  await box.getByRole('button', { name: 'Zoom in' }).click()
  await bar(page)
    .getByRole('button', { name: 'All routes', exact: true })
    .click()
  await expect(canvas(page)).toHaveAttribute('data-zoom', /./)
  const all = await zoomOf(page)
  await box.getByRole('button', { name: 'Zoom in' }).click()
  await bar(page)
    .getByRole('button', { name: 'One route', exact: true })
    .click()
  expect(await zoomOf(page)).toBeLessThanOrEqual(1)
  expect(all).toBeGreaterThan(0.29)
})

test('TP-07 Picture only hides the list and the walk; Esc returns', async ({
  page,
}) => {
  await openPage(page)
  await expect(list(page)).toBeVisible()
  await expect(walk(page)).toBeVisible()
  const pic = tp(page).getByRole('button', { name: '⛶ Picture only' })
  await pic.click()
  await expect(tp(page)).toHaveAttribute('data-picture', 'true')
  await expect(list(page)).toHaveCount(0)
  await expect(walk(page)).toHaveCount(0)
  await expect(tp(page).getByTestId('trace-counts')).toHaveCount(0)
  await expect(tp(page).getByTestId('trace-pic-title')).toContainText(
    'EDGE-17 · Port 1 → AGG-03 · Port 1',
  )
  await expect(
    tp(page).getByRole('button', { name: 'Exit picture' }),
  ).toHaveAttribute('aria-pressed', 'true')
  // The drawing has the whole page: the canvas spans the page's width and fits whole.
  const page_ = (await tp(page).boundingBox())!
  const c = (await canvas(page).boundingBox())!
  expect(c.width).toBeGreaterThan(page_.width - 4)
  const d = (await drawing(page).boundingBox())!
  expect(d.x + d.width).toBeLessThanOrEqual(c.x + c.width + 1)
  expect(d.y + d.height).toBeLessThanOrEqual(c.y + c.height + 1)
  expect(await zoomOf(page)).toBeLessThanOrEqual(2.5)
  expect(await zoomOf(page)).toBeGreaterThan(1)
  await page.keyboard.press('Escape')
  await expect(tp(page)).toHaveAttribute('data-picture', 'false')
  await expect(list(page)).toBeVisible()
  await expect(walk(page)).toBeVisible()
  // Esc on the page itself leaves it only from Picture only.
  await page.keyboard.press('Escape')
  await expect(tp(page)).toBeVisible()
  // Exit picture works the same.
  await pic.click()
  await tp(page).getByRole('button', { name: 'Exit picture' }).click()
  await expect(list(page)).toBeVisible()
})

test('TP-08 Esc on the Trace page (Picture only or not) leaves the tree’s selection alone', async ({
  page,
}) => {
  await findFrom(page, 'EDGE-17', 3)
  const card = page.locator(`[data-card-key="${BUILDING_A}"]`)
  await card.click()
  await expect(card).toHaveAttribute('data-selected', 'true')
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await page.getByRole('button', { name: 'Open full page ⤢' }).click()
  await expect(tp(page)).toBeVisible()
  // Esc with nothing to close on the page, then Esc to leave Picture only.
  await page.keyboard.press('Escape')
  await tp(page)
    .getByRole('button', { name: /Picture only/ })
    .click()
  await expect(
    tp(page).getByRole('button', { name: 'Exit picture' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(
    tp(page).getByRole('button', { name: 'Exit picture' }),
  ).toHaveCount(0)
  await backButton(page).click()
  await expect(tp(page)).toHaveCount(0)
  await expect(card).toHaveAttribute('data-selected', 'true')
})

test('TP-08 ← Back returns to the tree with its viewport and selection, and to the equipment page with its jack', async ({
  page,
}) => {
  await findFrom(page, 'EDGE-17', 3)
  const card = page.locator(`[data-card-key="${BUILDING_A}"]`)
  await card.click()
  await expect(card).toHaveAttribute('data-selected', 'true')
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await expect(page.getByLabel('Trace results')).toBeVisible()
  const before = await hierarchyState(page)
  const port = await settledViewport(page)
  await page.getByRole('button', { name: 'Open full page ⤢' }).click()
  await expect(tp(page)).toBeVisible()
  // The tree is under the page, untouched, and not drawn.
  await expect(page.locator('[data-view="hierarchy"]')).toBeHidden()
  await backButton(page).click()
  await expect(tp(page)).toHaveCount(0)
  await fitted(page)
  // The dock is as it was before the page: the Trace tab.
  await expect(
    dockOpen(page).getByRole('tab', { name: 'Trace', selected: true }),
  ).toBeVisible()
  await expect(card).toHaveAttribute('data-selected', 'true')
  expect(await hierarchyState(page)).toEqual(before)
  expect(await settledViewport(page)).toBe(port)
  await expect(
    page.getByRole('button', { name: 'Conceptual', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')

  // The equipment page and its jack.
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
  const jack = page.locator(
    '[data-testid="face-endpoint"][data-endpoint-id="hdf-01:sp-3C:5:f"]',
  )
  await jack.click()
  const root = page.locator('.physical-explorer')
  await expect(root).toHaveAttribute(
    'data-selected-endpoint',
    'hdf-01:sp-3C:5:f',
  )
  await expect(
    dockOpen(page).getByRole('tab', { name: 'Port', selected: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Full page ⤢', exact: true }).click()
  await expect(tp(page)).toBeVisible()
  await backButton(page).click()
  await expect(tp(page)).toHaveCount(0)
  // Not the Trace tab the new trace opened: the Port tab it came from.
  await expect(
    dockOpen(page).getByRole('tab', { name: 'Port', selected: true }),
  ).toBeVisible()
  await expect(root).toHaveAttribute('data-physical-level', 'equipment')
  await expect(root).toHaveAttribute(
    'data-selected-endpoint',
    'hdf-01:sp-3C:5:f',
  )
  await expect(
    page.getByRole('button', { name: 'Physical', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('TP-09 Full page from a jack’s path traces from that jack and opens the page', async ({
  page,
}) => {
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
  // No jack, no path, no button.
  await expect(
    page.getByRole('button', { name: 'Full page ⤢', exact: true }),
  ).toHaveCount(0)
  await page
    .locator(
      '[data-testid="face-endpoint"][data-endpoint-id="hdf-01:sp-3C:5:f"]',
    )
    .click()
  const full = page.getByRole('button', { name: 'Full page ⤢', exact: true })
  await expect(full).toBeVisible()
  await full.click()
  await expect(tp(page)).toBeVisible()
  await expect(dockOpen(page)).toHaveCount(0)
  await expect(items(page).first()).toBeVisible()
  await expect(tp(page).getByTestId('trace-title')).toContainText('HDF-01')
  await expect(plates(page).first()).toHaveAttribute(
    'data-equipment-id',
    'hdf-01',
  )
  // A cable-less jack has no Full page.
  await backButton(page).click()
  await expect(page.locator('.physical-explorer')).toBeVisible()
})

test('TP-10 a passive chip in the drawer’s Way up opens the page on that jack', async ({
  page,
}) => {
  await selectEquipment(page, 'EDGE-17')
  await showNodeDetails(page)
  const way = page.getByTestId('hierarchy-drawer').getByTestId('hd-way')
  await way
    .getByRole('button', { name: /^HDF-01/ })
    .first()
    .click()
  await expect(tp(page)).toBeVisible()
  await expect(dockOpen(page)).toHaveCount(0)
  await expect(tp(page).getByTestId('trace-title')).toContainText('HDF-01')
  await expect(plates(page).first()).toHaveAttribute(
    'data-equipment-id',
    'hdf-01',
  )
  await backButton(page).click()
  await fitted(page)
  await expect(page.locator('.flow-surface')).toBeVisible()
  await expect(tp(page)).toHaveCount(0)
})

const download = async (page: Page, format: 'PNG' | 'PDF') => {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    exportButton(page, format).click(),
  ])
  return {
    name: file.suggestedFilename(),
    bytes: await readFile((await file.path())!),
  }
}
const size = (el: Locator) =>
  el.evaluate((e) => ({ width: e.scrollWidth, height: e.scrollHeight }))

test('TP-11 PNG is the drawing, PDF the drawing and the walk, named for the route', async ({
  page,
}) => {
  await openPage(page)
  const port = await zoomOf(page)
  const png = captureLayout(await size(drawing(page)))
  const shot = await download(page, 'PNG')
  expect(shot.name).toBe('route-EDGE-17-Port-1-AGG-03-Port-1.png')
  expect(shot.bytes.length).toBeGreaterThan(20_000)
  expect(shot.bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(shot.bytes.readUInt32BE(16)).toBe(png.pixelWidth)
  expect(shot.bytes.readUInt32BE(20)).toBe(png.pixelHeight)
  expect(png.ratio).toBe(2)
  // Exporting leaves the page as it was: the same zoom, no leftover header.
  expect(await zoomOf(page)).toBe(port)
  await expect(page.getByText('Installed ·')).toHaveCount(0)

  const pdf = await download(page, 'PDF')
  expect(pdf.name).toBe('route-EDGE-17-Port-1-AGG-03-Port-1.pdf')
  expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF')
  expect(pdf.bytes.length).toBeLessThan(2_000_000)
  const text = pdf.bytes.toString('latin1')
  expect(text.match(/\/Type\s*\/Page(?![s\w])/g)).toHaveLength(1)
  const both = captureLayout(
    stackSize([await size(drawing(page)), await size(walk(page))]),
  )
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text)!
  expect(Number(box[1]) / Number(box[2])).toBeCloseTo(
    both.width / both.height,
    2,
  )
  // Taller than the picture alone: the walk is under it.
  expect(both.height).toBeGreaterThan(png.height)
})

test('TP-11 the export is the whole drawing whatever the zoom, and All routes is one picture', async ({
  page,
}) => {
  await openPage(page)
  const natural = captureLayout(await size(drawing(page)))
  for (let i = 0; i < 3; i++)
    await tp(page).getByRole('button', { name: 'Zoom in' }).click()
  const zoomed = await zoomOf(page)
  const shot = await download(page, 'PNG')
  expect(shot.bytes.readUInt32BE(16)).toBe(natural.pixelWidth)
  expect(shot.bytes.readUInt32BE(20)).toBe(natural.pixelHeight)
  expect(await zoomOf(page)).toBe(zoomed)

  await bar(page)
    .getByRole('button', { name: 'All routes', exact: true })
    .click()
  const all = captureLayout(await size(drawing(page)))
  const picture = await download(page, 'PNG')
  expect(picture.bytes.readUInt32BE(16)).toBe(all.pixelWidth)
  expect(picture.bytes.readUInt32BE(20)).toBe(all.pixelHeight)
  // Three routes stacked: taller than one.
  expect(all.height).toBeGreaterThan(natural.height * 2)
  // With All routes the PDF is the picture alone: there is no walk.
  const pdf = (await download(page, 'PDF')).bytes.toString('latin1')
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf)!
  expect(Number(box[1]) / Number(box[2])).toBeCloseTo(all.width / all.height, 2)
})

test('TP-12 at 1280×720 Fit shows the whole route and the page does not scroll sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  // EDGE-22 crosses DR Site, Main Campus and DR Site again: the longest route.
  await openPage(page, 'EDGE-22', 1)
  expect(await frames(page).count()).toBeGreaterThanOrEqual(3)
  expect(await sideways(page)).toBe(0)
  const c = (await canvas(page).boundingBox())!
  for (const plate of await plates(page).all()) {
    const b = (await plate.boundingBox())!
    expect(b.x).toBeGreaterThanOrEqual(c.x - 1)
    expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 1)
  }
  const d = (await drawing(page).boundingBox())!
  expect(d.x + d.width).toBeLessThanOrEqual(c.x + c.width + 1)
  // The walk is below the picture and reachable by scrolling the page's body only.
  await expect(walk(page)).toBeAttached()
  // At 1280 the list is still beside the body and the whole page fits the window.
  const t = (await tp(page).boundingBox())!
  expect(t.x + t.width).toBeLessThanOrEqual(1280 + 1)
  expect(t.y + t.height).toBeLessThanOrEqual(720 + 1)
  await page.screenshot({ path: 'test-results/trace-page/1280x720.png' })
})

test('TP-13 a cleared trace shows “No trace” with ← Back', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'Cleared')
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openPage(page)
  // The remembered trace is forgotten, then the Workspace reruns what it remembers: nothing.
  await page.evaluate(async () => {
    const mod = await import('/src/features/pathfinding/traceSession.ts')
    mod.traceSession.clear()
  })
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(tp(page)).toContainText('No trace')
  await expect(items(page)).toHaveCount(0)
  await expect(exportButton(page, 'PNG')).toHaveCount(0)
  await expect(exportButton(page, 'PDF')).toHaveCount(0)
  await expect(drawing(page)).toHaveCount(0)
  await backButton(page).click()
  await expect(tp(page)).toHaveCount(0)
  await fitted(page)
})

test('TP-14 screenshots', async ({ page, request }) => {
  const shots = 'test-results/trace-page'
  await openPage(page)
  await page.screenshot({ path: `${shots}/one-route.png` })
  await bar(page)
    .getByRole('button', { name: 'All routes', exact: true })
    .click()
  await expect(drawing(page).getByTestId('trace-route')).toHaveCount(3)
  await page.screenshot({ path: `${shots}/all-routes.png` })
  await bar(page)
    .getByRole('button', { name: 'One route', exact: true })
    .click()
  await tp(page).getByRole('button', { name: '⛶ Picture only' }).click()
  for (let i = 0; i < 2; i++)
    await tp(page).getByRole('button', { name: 'Zoom in' }).click()
  await page.screenshot({ path: `${shots}/picture-only-zoomed.png` })

  await page.goto(`/?plan=${await crossNetworkPlan(request)}`)
  await fitted(page)
  await findFrom(page, 'EDGE-17', 3)
  await page.getByRole('button', { name: 'Open full page ⤢' }).click()
  await page.screenshot({ path: `${shots}/plan.png` })
  await list(page).locator('[data-kind="mismatch"]').click()
  await expect(tp(page).getByTestId('trace-note')).toBeVisible()
  await page.screenshot({ path: `${shots}/mismatch.png` })
})
