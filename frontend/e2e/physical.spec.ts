import { expect, test, type Page } from '@playwright/test'
import { fitted, expandResults } from './helpers'

// The explorer writes its state on its root, so these specs assert the model
// (level, location, route marks, positions) rather than counting drawn elements.
const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const list = async (page: Page, name: string) =>
  (await mark(page, name)).split(' ').filter(Boolean)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)

const physical = (page: Page) =>
  page.getByRole('button', { name: 'Physical', exact: true })

async function toPhysical(page: Page) {
  await page.goto('/')
  await fitted(page)
  await physical(page).click()
  await expect(root(page)).toBeVisible()
}

/** Find AGG / BB from EDGE-17; the first route (AGG-03) is selected. */
async function traceAgg03(page: Page) {
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}

const nodeCard = (page: Page, id: string) => page.getByTestId(`rf__node-${id}`)
const positions = async (page: Page) =>
  Object.fromEntries(
    (await list(page, 'data-node-positions')).map((p) => {
      const [id, xy] = p.split(':')
      return [id, xy.split(',').map(Number)]
    }),
  )

async function openMainCampus(page: Page) {
  await page.getByRole('button', { name: 'Open Main Campus' }).click()
  await expectMark(page, 'data-physical-level', 'site')
  // Cards move until the first fit is done; measure and drag only after it.
  await expectMark(page, 'data-site-fitted', 'true')
  await expect(nodeCard(page, 'node-north-sub-main')).toBeVisible()
}

test('the header title is neutral', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.workspace-title strong')).toHaveText(
    'Network Studio',
  )
})

test('F01 Sites shows names, counts and the route, with no coordinates', async ({
  page,
}) => {
  await toPhysical(page)
  await expectMark(page, 'data-physical-level', 'sites')
  await expectMark(page, 'data-location', 'sites')
  await expectMark(page, 'data-history-depth', '0')
  await expect(page.getByTestId('scope-note')).toHaveText(
    'Complete physical inventory. All networks are shown.',
  )
  const main = page.locator(
    '[data-testid="site-card"][data-site-id="site-main-campus"]',
  )
  const dr = page.locator('[data-testid="site-card"][data-site-id="site-dr"]')
  await expect(main).toContainText('Main Campus')
  await expect(main).toContainText('3 nodes · 5 racks · 8 equipment')
  await expect(main).toContainText('Network A · 5 active')
  await expect(dr).toContainText('2 nodes · 2 racks · 3 equipment')
  await expect(dr).toContainText('Network B · 2 active')
  await expect(main).not.toContainText('on route')
  // A site card is a card in a grid: no canvas, no positions.
  await expect(page.locator('.react-flow')).toHaveCount(0)
  await expectMark(page, 'data-route-equipment', '')

  // With a route selected, the sites it crosses say so.
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await traceAgg03(page)
  await physical(page).click()
  await expectMark(
    page,
    'data-route-equipment',
    'agg-03 edge-17 hdf-01 hdf-02 panel-a',
  )
  await expect(main).toContainText('on route · 5 equipment')
  await expect(main).toHaveAttribute('data-on-route', 'true')
  await expect(dr).not.toContainText('on route')
  await expect(dr).toHaveAttribute('data-on-route', 'false')
})

test('F02 a site shows only its nodes, arranged freely, joined by real cable counts', async ({
  page,
}) => {
  await toPhysical(page)
  await openMainCampus(page)
  await expectMark(page, 'data-location', 'site:site-main-campus')
  expect(Object.keys(await positions(page)).sort()).toEqual([
    'node-building-a',
    'node-main-distribution',
    'node-north-sub-main',
  ])
  // No site card in the center.
  await expect(page.getByTestId('site-card')).toHaveCount(0)
  await expect(
    page.getByText(
      'Lines are cables between nodes, counted from real cable records.',
    ),
  ).toBeVisible()

  const pill = (cable: string) =>
    page.locator(`.site-pill[data-cable-ids~="${cable}"]`)
  await expect(pill('cable-a02')).toHaveText('3')
  await expect(pill('cable-a02')).toHaveAttribute(
    'data-cable-ids',
    'cable-a02 cable-a06 cable-a10',
  )
  await expect(pill('cable-a03')).toHaveText('4')
  await expect(pill('cable-a03')).toHaveAttribute(
    'data-cable-ids',
    'cable-a03 cable-a07 cable-a11 cable-b03',
  )
  await expect(page.locator('.site-pill')).toHaveCount(2)
  // The 4-cable line mixes Network A and B, so it is grey, not a network color.
  await expect(pill('cable-a03')).toHaveAttribute('data-color', 'mixed')
  await expect(pill('cable-a02')).toHaveAttribute('data-color', 'network')

  // Card facts.
  const sm = nodeCard(page, 'node-north-sub-main')
  await expect(sm).toContainText('North Sub-main')
  await expect(sm).toContainText('1 rack · 1 equipment')
  await expect(sm).toContainText('0 cables inside')
  await expect(sm).toContainText('1 cable to DR Site')
  await expect(nodeCard(page, 'node-building-a')).toContainText(
    '3 cables inside',
  )
})

test('F03 a node shows only its own racks, and the route marks the racks it uses', async ({
  page,
}) => {
  await toPhysical(page)
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await traceAgg03(page)
  await physical(page).click()
  await openMainCampus(page)
  await page
    .getByRole('button', { name: 'Open racks of Main Distribution' })
    .click()
  await expectMark(page, 'data-physical-level', 'node')
  await expectMark(
    page,
    'data-location',
    'site:site-main-campus/node:node-main-distribution',
  )
  await expectMark(
    page,
    'data-shown-racks',
    'rack-core-01 rack-core-02 rack-core-03',
  )
  const rack = (id: string) =>
    page.locator(`[data-testid="rack-preview"][data-rack-id="${id}"]`)
  await expect(rack('rack-core-01')).toHaveAttribute('data-on-route', 'true')
  await expect(rack('rack-core-02')).toHaveAttribute('data-on-route', 'false')
  await expect(rack('rack-core-03')).toHaveAttribute('data-on-route', 'false')
  await expect(rack('rack-core-01')).toContainText(
    '2 equipment · 4 of 12U used',
  )
  // The 3U HDF is one block spanning three units, not three blocks.
  const hdf = rack('rack-core-01').locator('[data-equipment-id="hdf-02"]')
  await expect(hdf).toHaveCount(1)
  await expect(hdf).toHaveAttribute('data-height', '3')
  // Only twelve racks or fewer: no search box.
  await expect(page.getByLabel('Search racks')).toHaveCount(0)
  // Opening a rack shows today's single-rack elevation.
  await rack('rack-core-01')
    .getByRole('button', { name: 'Open Rack Core 01' })
    .click()
  await expectMark(page, 'data-physical-level', 'rack')
  await expect(page.getByTestId('rack-slot-rack-core-01-4')).toBeVisible()
  await expect(page.getByTestId('rack-slot-rack-core-02-4')).toHaveCount(0)
})

test('F11 breadcrumbs and Back restore the previous location, with no modal stack', async ({
  page,
}) => {
  await toPhysical(page)
  await openMainCampus(page)
  await page
    .getByRole('button', { name: 'Open racks of Main Distribution' })
    .click()
  await expectMark(page, 'data-history-depth', '2')
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumbs' })
  await expect(crumbs).toContainText('Sites')
  await expect(crumbs).toContainText('Main Campus')
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText(
    'Main Distribution',
  )

  // A breadcrumb navigates to its ancestor; Back returns to where we were.
  await crumbs.getByRole('button', { name: 'Main Campus' }).click()
  await expectMark(page, 'data-location', 'site:site-main-campus')
  await expectMark(page, 'data-history-depth', '3')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(
    page,
    'data-location',
    'site:site-main-campus/node:node-main-distribution',
  )
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-location', 'site:site-main-campus')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-location', 'sites')
  await expect(
    page.getByRole('button', { name: 'Back', exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // The header's Physical switch returns to where we left, not to Sites.
  await page.getByRole('button', { name: 'Open Main Campus' }).click()
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await expect(root(page)).toHaveCount(0)
  await physical(page).click()
  await expectMark(page, 'data-location', 'site:site-main-campus')
})

test('PHY-04 Explore navigates Physical, and keeps its behavior in Conceptual', async ({
  page,
}) => {
  await toPhysical(page)
  await page.getByRole('button', { name: 'Open explorer' }).click()
  await page
    .getByRole('button', { name: 'Open Main Distribution in Physical' })
    .click()
  await expectMark(
    page,
    'data-location',
    'site:site-main-campus/node:node-main-distribution',
  )
  await page
    .getByRole('button', { name: 'Open Main Campus in Physical' })
    .click()
  await expectMark(page, 'data-location', 'site:site-main-campus')
  await page.getByRole('button', { name: /^Rack Core 02/ }).click()
  await expectMark(
    page,
    'data-location',
    'site:site-main-campus/node:node-main-distribution/rack:rack-core-02',
  )
  // Equipment opens its rack, with that equipment selected.
  await page.getByRole('button', { name: /^AGG-03/ }).click()
  await expect(root(page)).toHaveAttribute('data-location', /rack:rack-core-01/)
  await expect(
    page.getByRole('button', { name: 'Close Explore infrastructure' }),
  ).toBeVisible()
  // The inspector is not opened by navigating in Physical.
  await expect(page.getByLabel('Equipment inspector')).toHaveCount(0)

  // In Conceptual the same drawer highlights on the map, as before.
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await page
    .getByRole('button', { name: 'Highlight Building A on the map' })
    .click()
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-highlight-cards',
    'edge-17 panel-a',
  )
  await physical(page).click()
  await expect(root(page)).toHaveAttribute('data-location', /rack:rack-core-01/)
})

test('PHY-05 the scope note names the network and other networks stay visible but muted', async ({
  page,
}) => {
  await toPhysical(page)
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network A' })
  await expect(page.getByTestId('scope-note')).toHaveText(
    'Complete physical inventory. Network A selected: its devices are marked; other networks stay visible.',
  )
  // Nothing is hidden: DR Site still shows its Network B devices.
  await expect(
    page.locator('[data-testid="site-card"][data-site-id="site-dr"]'),
  ).toContainText('Network B · 2 active')
  await page.getByRole('button', { name: 'Open DR Site' }).click()
  await page.getByRole('button', { name: 'Open racks of DR Access' }).click()
  const rack = page.locator(
    '[data-testid="rack-preview"][data-rack-id="rack-dr01"]',
  )
  await expect(rack.locator('[data-equipment-id="edge-22"]')).toHaveAttribute(
    'data-muted',
    'true',
  )
  await expect(rack.locator('[data-equipment-id="panel-dr"]')).toHaveAttribute(
    'data-muted',
    'false',
  )
  // Back to All networks: nothing muted.
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'All networks' })
  await expect(rack.locator('[data-equipment-id="edge-22"]')).toHaveAttribute(
    'data-muted',
    'false',
  )
  await expect(page.getByTestId('scope-note')).toHaveText(
    'Complete physical inventory. All networks are shown.',
  )
})

test('PHY-18 dragging a node saves once at the drop, and it stays there after a reload', async ({
  page,
}) => {
  const puts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/layout/nodes/'))
      puts.push(r.url())
  })
  await toPhysical(page)
  await openMainCampus(page)
  const before = await positions(page)
  const card = nodeCard(page, 'node-north-sub-main')
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + 24, box.y + 14)
  await page.mouse.down()
  await page.mouse.move(box.x + 24 + 180, box.y + 14 + 120, { steps: 15 })
  expect(puts).toHaveLength(0) // nothing is sent while dragging
  await page.mouse.up()
  await expect.poll(() => puts.length).toBe(1)
  expect(puts[0]).toContain(
    '/api/sites/site-main-campus/layout/nodes/node-north-sub-main',
  )
  const moved = await positions(page)
  expect(moved['node-north-sub-main']).not.toEqual(
    before['node-north-sub-main'],
  )
  expect(moved['node-building-a']).toEqual(before['node-building-a'])
  // The server holds it.
  const saved = await (
    await page.request.get('/api/sites/site-main-campus/layout')
  ).json()
  expect(saved.positions).toEqual([
    {
      nodeId: 'node-north-sub-main',
      x: expect.closeTo(moved['node-north-sub-main'][0], 0),
      y: expect.closeTo(moved['node-north-sub-main'][1], 0),
    },
  ])
  // After a reload, the node is where it was dropped.
  await page.reload()
  await physical(page).click()
  await openMainCampus(page)
  expect((await positions(page))['node-north-sub-main']).toEqual(
    moved['node-north-sub-main'],
  )
  expect(puts).toHaveLength(1) // reading never writes

  // Reset layout asks first, then removes the saved positions and refits.
  await page.getByRole('button', { name: 'Reset layout' }).click()
  await page.getByRole('button', { name: 'Cancel reset' }).click()
  expect((await positions(page))['node-north-sub-main']).toEqual(
    moved['node-north-sub-main'],
  )
  await page.getByRole('button', { name: 'Reset layout' }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect
    .poll(async () => (await positions(page))['node-north-sub-main'])
    .toEqual(before['node-north-sub-main'])
  const after = await (
    await page.request.get('/api/sites/site-main-campus/layout')
  ).json()
  expect(after.positions).toEqual([])
})

test('PHY-18 a failed save rolls the node back and says so', async ({
  page,
}) => {
  await page.route('**/layout/nodes/**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":"Database operation failed. Check the API logs."}',
    }),
  )
  await toPhysical(page)
  await openMainCampus(page)
  const before = await positions(page)
  const box = (await nodeCard(page, 'node-north-sub-main').boundingBox())!
  await page.mouse.move(box.x + 24, box.y + 14)
  await page.mouse.down()
  await page.mouse.move(box.x + 24 + 150, box.y + 14 + 90, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('alert')).toContainText(
    'Could not save the node position',
  )
  await expect
    .poll(async () => (await positions(page))['node-north-sub-main'])
    .toEqual(before['node-north-sub-main'])
})

test('PHY-19 the Building A to North Sub-main line says 3, lists its cables, is on the route, and a row opens its endpoint', async ({
  page,
}) => {
  const moves: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET') moves.push(`${r.method()} ${r.url()}`)
  })
  await toPhysical(page)
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await traceAgg03(page)
  await physical(page).click()
  moves.length = 0 // the trace above is a POST; from here on, only reading
  await openMainCampus(page)
  const a = page.locator('.site-pill[data-cable-ids~="cable-a02"]')
  const b = page.locator('.site-pill[data-cable-ids~="cable-a03"]')
  await expect(a).toHaveText('3')
  await expect(a).toHaveAttribute('data-on-route', 'true')
  await expect(b).toHaveAttribute('data-on-route', 'true') // A03 is on the AGG-03 route too

  // Hover lists the cable IDs.
  await a.hover()
  const tip = page.getByRole('tooltip')
  for (const id of ['cable-a02', 'cable-a06', 'cable-a10'])
    await expect(tip).toContainText(id)

  // Click opens the list: each cable with both ends and their racks.
  await a.click()
  const cables = page.getByLabel('Cables between Building A and North Sub-main')
  await expect(cables.getByTestId('cable-row')).toHaveText([
    /cable-a02.*PANEL-A.*Rack A03.*HDF-01.*Rack SM01/,
    /cable-a06.*PANEL-A.*Rack A03.*HDF-01.*Rack SM01/,
    /cable-a10.*PANEL-A.*Rack A03.*HDF-01.*Rack SM01/,
  ])
  // A row opens that endpoint: its equipment page, with the endpoint and side selected.
  await cables
    .locator('[data-link-id="cable-a02"]')
    .getByRole('button', { name: /^Open HDF-01/ })
    .click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /node:node-north-sub-main\/rack:rack-sm01/,
  )
  await expectMark(page, 'data-physical-level', 'equipment')
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  await expectMark(page, 'data-side', 'rear')
  expect(moves).toEqual([]) // no write of any kind while reading and navigating
})

test('PHY-19 the cables to other sites open as a list too', async ({
  page,
}) => {
  await toPhysical(page)
  await openMainCampus(page)
  await nodeCard(page, 'node-north-sub-main')
    .getByRole('button', { name: '1 cable to DR Site' })
    .click()
  const cables = page.getByLabel('Cables from North Sub-main to DR Site')
  await expect(cables.getByTestId('cable-row')).toHaveText([
    /cable-b02.*PANEL-DR.*Rack DR01.*HDF-01.*Rack SM01/,
  ])
})

test('results in Physical use the map overlay, without route view or export, and a hop opens its rack', async ({
  page,
}) => {
  await toPhysical(page)
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await traceAgg03(page)
  await physical(page).click()
  const results = page.getByLabel('Map trace results')
  await expandResults(page)
  await expect(results).toBeVisible()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await expect(results.getByRole('button', { name: 'Route view' })).toHaveCount(
    0,
  )
  await expect(results.getByRole('button', { name: /^Export/ })).toHaveCount(0)
  // Selecting another route changes the marks and never navigates.
  await page.getByTestId('route-row').nth(1).click()
  await expectMark(
    page,
    'data-route-equipment',
    'agg-08 edge-17 hdf-01 hdf-02 panel-a',
  )
  await expectMark(page, 'data-location', 'sites')
  // A hop opens the endpoint's equipment in Physical.
  await results
    .getByTestId('map-hop-row')
    .filter({ hasText: 'HDF-02 · 1D/2 front' })
    .first()
    .click()
  await expect(root(page)).toHaveAttribute('data-location', /rack:rack-core-01/)
  // Clear trace removes the marks only.
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expectMark(page, 'data-route-equipment', '')
  await expect(root(page)).toHaveAttribute('data-location', /rack:rack-core-01/)
})

/** Every node card lies inside the canvas and clear of the drawers, overlay and tool rail. */
async function cardsClearOfCovers(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element) => el.getBoundingClientRect()
    const flow = rect(document.querySelector('.site-flow')!)
    const covers = [
      ...document.querySelectorAll('.studio-drawer, .map-results, .tool-rail'),
    ].map(rect)
    const problems: string[] = []
    for (const card of document.querySelectorAll('.react-flow__node')) {
      const c = rect(card)
      const id = card.getAttribute('data-id')
      if (
        c.left < flow.left - 0.5 ||
        c.right > flow.right + 0.5 ||
        c.top < flow.top - 0.5 ||
        c.bottom > flow.bottom + 0.5
      )
        problems.push(`${id} outside the canvas`)
      covers.forEach((o, i) => {
        if (
          c.left < o.right &&
          c.right > o.left &&
          c.top < o.bottom &&
          c.bottom > o.top
        )
          problems.push(`${id} under cover ${i}`)
      })
    }
    return {
      cards: document.querySelectorAll('.react-flow__node').length,
      problems,
    }
  })
}

test('PHY-20 the site screen fits into the visible area, on entering and after Reset layout', async ({
  page,
}) => {
  await toPhysical(page)
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await traceAgg03(page) // results overlay expanded
  await physical(page).click()
  await expect(page.getByLabel('Map trace results')).toBeVisible()
  await page.getByRole('button', { name: 'Open inspector' }).click()
  await expect(page.locator('aside.studio-drawer')).toBeVisible()

  await openMainCampus(page)
  await expect
    .poll(() => cardsClearOfCovers(page))
    .toEqual({ cards: 3, problems: [] })

  // Drag a card far away, then Reset layout: the refit uses the visible area too.
  const card = nodeCard(page, 'node-north-sub-main')
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + 24, box.y + 14)
  await page.mouse.down()
  await page.mouse.move(box.x + 24 - 120, box.y + 14 - 60, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Reset layout' }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect
    .poll(() => cardsClearOfCovers(page))
    .toEqual({ cards: 3, problems: [] })
})

test('the count pill is a filled circle in the line color with a white border and white text', async ({
  page,
}) => {
  await toPhysical(page)
  await openMainCampus(page)
  const pill = page.locator('.site-pill[data-cable-ids~="cable-a02"]')
  await expect(pill).toHaveCSS('background-color', 'rgb(47, 111, 219)') // Network A
  await expect(pill).toHaveCSS('border-top-color', 'rgb(255, 255, 255)')
  await expect(pill).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(pill).toHaveCSS('border-radius', '50%')
  const mixed = page.locator('.site-pill[data-cable-ids~="cable-a03"]')
  await expect(mixed).toHaveCSS('background-color', 'rgb(138, 151, 171)') // #8a97ab
})

test('the site canvas stays hidden until its fit is done, and says so on the root', async ({
  page,
}) => {
  await toPhysical(page)
  await expectMark(page, 'data-site-fitted', 'false') // not a site screen
  await openMainCampus(page)
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(page.locator('.react-flow')).toHaveCSS('visibility', 'visible')
  // Another site starts unfitted, then fits on its own; Main Campus's fit is not reused.
  await page.getByRole('button', { name: 'Sites', exact: true }).click()
  await expectMark(page, 'data-site-fitted', 'false')
  await page.getByRole('button', { name: 'Open DR Site' }).click()
  await expectMark(page, 'data-site-fitted', 'true')
  // Returning to a site fitted earlier in the session shows it again, restored.
  await page.getByRole('button', { name: 'Sites', exact: true }).click()
  await openMainCampus(page)
  await expect(page.locator('.react-flow')).toHaveCSS('visibility', 'visible')
  // The caption is a small panel in the canvas, not a bar the results could cover.
  const note = page.getByTestId('site-note')
  await expect(note).toContainText('Lines are cables between nodes')
  await expect(page.locator('.site-caption')).toHaveCount(0)
})
