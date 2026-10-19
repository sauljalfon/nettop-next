import { expect, test, type Page } from '@playwright/test'
import type { Plan } from '../src/shared/types'
import {
  expectMarks,
  fitted,
  highlightLocation,
  pick,
  selectEquipment,
  settledViewport,
} from './helpers'

const ORDER = ['EDGE-17', 'PANEL-A', 'HDF-01', 'HDF-02', 'AGG-03']
const toggle = (page: Page) => page.getByRole('button', { name: 'Route view' })
const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')
const diagram = (page: Page) => page.getByTestId('route-diagram')
const steps = (page: Page) => diagram(page).getByTestId('rd-step')
const cables = (page: Page) => diagram(page).getByTestId('rd-cable')

/** Find AGG / BB from a switch; the first route is the active one. */
async function traceFrom(page: Page, name: string, count: number) {
  await selectEquipment(page, name)
  await page
    .getByRole('button', { name: `Find AGG / BB from ${name}`, exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(rows(page)).toHaveCount(count)
}
const traceFromEdge17 = (page: Page) => traceFrom(page, 'EDGE-17', 3)

/** The step names in drawing order, read from the cards' own names. */
const stepNames = (page: Page) =>
  steps(page).evaluateAll((els) =>
    els.map((el) => el.querySelector('.rd-name')!.textContent),
  )

// POL-22 (kept, rewritten for the overview): the map under the picture is not touched while the
// picture is on. Everything about restoring the map is kept as it was.
test('POL-22 the toggle covers the map with the route, and turning it off leaves the same map', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const overview = page.locator('[data-view="overview"]')
  // State on the overview: a highlight and a network filter, then a trace from the tools.
  await highlightLocation(page, 'Building A')
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click() // close Explore
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network A' })
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await pick(page, 'Start', 'edge-17 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await expect(rows(page)).toHaveCount(3)
  const mapState = () =>
    overview.evaluate((el) => ({
      positions: el.getAttribute('data-node-positions'),
      highlighted: [...el.querySelectorAll('[data-highlighted="true"]')].map(
        (n) => n.getAttribute('data-node-id'),
      ),
      onRoute: [...el.querySelectorAll('[data-on-route="true"]')].map((n) =>
        n.getAttribute('data-node-id'),
      ),
    }))
  const before = await mapState()
  expect(before.highlighted).toEqual(['node-building-a'])
  expect(before.onRoute.length).toBeGreaterThan(0)
  const port = await settledViewport(page)

  await expect(diagram(page)).toHaveCount(0)
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  await expectMarks(page, { routeView: true })
  await expect(diagram(page)).toBeVisible()
  // The map underneath is untouched: same highlight, route marks, positions and view.
  expect(await mapState()).toEqual(before)
  expect(await settledViewport(page)).toBe(port)
  // The map's own controls are not offered over the picture.
  await expect(page.locator('.react-flow__controls')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Reset arrangement' }),
  ).toHaveCount(0)

  await toggle(page).click()
  await expectMarks(page, { routeView: false })
  await expect(diagram(page)).toHaveCount(0)
  expect(await mapState()).toEqual(before)
  expect(await settledViewport(page)).toBe(port)
  await expect(page.locator('.react-flow__controls')).toHaveCount(1)
  await expect(
    page.getByRole('combobox', { name: 'Show network' }),
  ).toHaveValue('net-a')
})

// POL-23 (rewritten): was "cards on one row, left to right". Now the steps are numbered in
// route order and drawn left to right.
test('POL-23 the steps are in route order, numbered, and drawn left to right', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  await expect(steps(page)).toHaveCount(5)
  expect(await stepNames(page)).toEqual(ORDER)
  expect(
    await steps(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-n')),
    ),
  ).toEqual(['1', '2', '3', '4', '5'])
  const boxes = await steps(page).evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().toJSON()),
  )
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width - 1)
    expect(Math.abs(boxes[i].y - boxes[0].y)).toBeLessThan(2)
  }
  // Every name is in a bdi, and the ports are pins.
  await expect(steps(page).first().locator('.rd-name > bdi')).toHaveText(
    'EDGE-17',
  )
  await expect(steps(page).nth(1).locator('.pin.in')).toHaveText('front 1')
  await expect(steps(page).nth(1).locator('.pin.out')).toHaveText('rear 1')
  await expect(steps(page).first().locator('.pin.out')).toHaveText('Port 1')
  await expect(steps(page).last().locator('.pin.in')).toHaveText('Port 1')
})

// POL-24 (rewritten): was "dashed node and rack outline boxes on the map". Now sites and nodes
// are the picture's own frames and boxes, and each cable says how far it goes.
test('POL-24 EDGE-17 → AGG-03: one site, three nodes, cables by gap, leave notes on the long ones', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  const sites = diagram(page).getByTestId('rd-site')
  await expect(sites).toHaveCount(1)
  await expect(sites.locator('.rd-site-head bdi')).toHaveText(['Main Campus'])
  const nodes = diagram(page).getByTestId('rd-node')
  await expect(nodes.locator('.rd-node-head bdi')).toHaveText([
    'Building A',
    'North Sub-main',
    'Main Distribution',
  ])
  await expect(sites.first()).toHaveCSS('border-top-style', 'dashed')
  // Which steps each node holds.
  expect(
    await nodes.evaluateAll((els) =>
      els.map((n) =>
        [...n.querySelectorAll('[data-testid="rd-step"] .rd-name')].map(
          (s) => s.textContent,
        ),
      ),
    ),
  ).toEqual([['EDGE-17', 'PANEL-A'], ['HDF-01'], ['HDF-02', 'AGG-03']])
  // The rack is on its step.
  await expect(steps(page).locator('.rd-rack')).toHaveText([
    'Rack A03',
    'Rack A03',
    'Rack SM01',
    'Rack Core 01',
    'Rack Core 01',
  ])
  // Cables, in order, with their gap kind and (long ones) the place they leave.
  await expect(cables(page)).toHaveCount(4)
  expect(
    await cables(page).evaluateAll((els) =>
      els.map((e) => [e.getAttribute('data-link'), e.getAttribute('data-gap')]),
    ),
  ).toEqual([
    ['cable-a01', 'in-node'],
    ['cable-a02', 'node-gap'],
    ['cable-a03', 'node-gap'],
    ['cable-a04', 'in-node'],
  ])
  // These cables have no label: the short ID (… and the last six characters).
  await expect(cables(page).locator('.clabel')).toHaveText([
    '…le-a01',
    '…le-a02',
    '…le-a03',
    '…le-a04',
  ])
  await expect(cables(page).first().locator('.clabel')).toHaveAttribute(
    'title',
    'cable-a01',
  )
  await expect(cables(page).nth(1).locator('.cleave')).toHaveText(
    'leaves Building A',
  )
  await expect(cables(page).nth(2).locator('.cleave')).toHaveText(
    'leaves North Sub-main',
  )
  await expect(cables(page).nth(0).locator('.cleave')).toHaveCount(0)
  // The first step has the teal border, the destination is AGG purple.
  await expect(steps(page).first()).toHaveClass(/first/)
  await expect(steps(page).last()).toHaveClass(/dest/)
})

test('POL-24 a path across sites has a site-gap cable that says it leaves DR Site', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFrom(page, 'EDGE-22', 1)
  await toggle(page).click()
  const sites = diagram(page).getByTestId('rd-site')
  // DR Site, Main Campus, then DR Site again: two frames of the same name, kept apart.
  await expect(sites.locator('.rd-site-head bdi')).toHaveText([
    'DR Site',
    'Main Campus',
    'DR Site',
  ])
  expect(
    await cables(page).evaluateAll((els) =>
      els.map((e) => [e.getAttribute('data-link'), e.getAttribute('data-gap')]),
    ),
  ).toEqual([
    ['cable-b01', 'in-node'],
    ['cable-b02', 'site-gap'],
    ['cable-b03', 'node-gap'],
    ['cable-b04', 'site-gap'],
  ])
  await expect(cables(page).nth(1).locator('.cleave')).toHaveText(
    'leaves DR Site',
  )
  await expect(cables(page).nth(3).locator('.cleave')).toHaveText(
    'leaves Main Campus',
  )
  await expect(
    cables(page).nth(1).locator('.cleave bdi', { hasText: 'DR Site' }),
  ).toHaveCount(1)
})

test('a step click opens that endpoint in Physical', async ({ page }) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  const step = steps(page).nth(2) // HDF-01
  const endpoint = await step.getAttribute('data-endpoint')
  expect(endpoint).toBeTruthy()
  await step.click()
  const root = page.locator('.physical-explorer')
  await expect(root).toBeVisible()
  await expect(root).toHaveAttribute('data-physical-level', 'equipment')
  await expect(root).toHaveAttribute('data-selected-endpoint', endpoint!)
})

// POL-25 (rewritten): was "two outline boxes for a route that leaves a node and returns".
test('POL-25 a route that leaves a node and returns gets two node boxes for it', async ({
  page,
  request,
}) => {
  // In a draft, AGG-03 moves into Rack A03: Building A → North Sub-main → Main Distribution → Building A.
  const created = await request.post('/api/plans', {
    data: { name: 'Back to A', expectedBaseRevision: 'acceptance-1' },
  })
  let plan = (await created.json()) as Plan
  const saved = await request.post(`/api/plans/${plan.id}/commands`, {
    data: {
      type: 'move_equipment',
      expectedRevision: plan.revision,
      placement: { equipmentId: 'agg-03', rackId: 'rack-a03', unit: 2 },
    },
  })
  expect(saved.status()).toBe(200)
  plan = (await saved.json()) as Plan
  await page.goto(`/?plan=${plan.id}`)
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  const nodes = diagram(page).getByTestId('rd-node')
  await expect(nodes.locator('.rd-node-head bdi')).toHaveText([
    'Building A',
    'North Sub-main',
    'Main Distribution',
    'Building A',
  ])
  // One site frame; the same node is not merged across the trip.
  await expect(diagram(page).getByTestId('rd-site')).toHaveCount(1)
  await expect(steps(page).locator('.rd-rack')).toHaveText([
    'Rack A03',
    'Rack A03',
    'Rack SM01',
    'Rack Core 01',
    'Rack A03',
  ])
})

// POL-31 (rewritten): was "the route fits the visible area". The picture is not fitted; it
// starts at the left, clear of the tool rail and open drawers, and scrolls sideways.
test('POL-31 the picture starts at the left, clear of the drawers, and scrolls sideways', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  const clear = (id: string) =>
    page.evaluate((selector) => {
      const first = document.querySelector(selector)!.getBoundingClientRect()
      const covers = [
        ...document.querySelectorAll('.studio-drawer, .tool-rail'),
      ].map((el) => el.getBoundingClientRect())
      return covers.every(
        (c) =>
          first.right <= c.left + 1 ||
          c.right <= first.left + 1 ||
          first.bottom <= c.top + 1 ||
          c.bottom <= first.top + 1,
      )
    }, id)

  // With Trace tools open.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await toggle(page).click()
  await expect(diagram(page)).toBeVisible()
  expect(await clear('[data-testid="rd-step"][data-n="1"]')).toBe(true)
  expect(await page.locator('.rd-scroll').evaluate((el) => el.scrollLeft)).toBe(
    0,
  )

  // With the inspector open instead.
  await toggle(page).click()
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await selectEquipment(page, 'EDGE-17')
  await expect(page.locator('.studio-drawer.right')).toBeVisible()
  await toggle(page).click()
  await expect(diagram(page)).toBeVisible()
  expect(await clear('[data-testid="rd-step"][data-n="1"]')).toBe(true)
  // The scroll box scrolls: the diagram is wider than what is shown.
  const scroll = page.locator('.rd-scroll')
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  )
  await scroll.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
})

// POL-34 (rewritten): was "another route is laid out afresh and fitted, whatever was dragged".
// Cards are no longer draggable in the route view, so the picture is simply redrawn.
test('POL-34 choosing another route while it is on redraws the picture, from the left', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  expect(await stepNames(page)).toEqual(ORDER)
  await page.locator('.rd-scroll').evaluate((el) => (el.scrollLeft = 300))

  // The third route (BB-01) takes the same five places, in its own order.
  await rows(page).nth(2).click()
  await expect(steps(page).last().locator('.rd-name')).toHaveText('BB-01')
  expect(await stepNames(page)).toEqual([
    'EDGE-17',
    'PANEL-A',
    'HDF-01',
    'HDF-02',
    'BB-01',
  ])
  await expect(steps(page).last()).toHaveClass(/bbdest/)
  await expect(steps(page).first().locator('.pin.out')).toHaveText('Port 3')
  expect(await page.locator('.rd-scroll').evaluate((el) => el.scrollLeft)).toBe(
    0,
  )
  await expectMarks(page, { routeView: true })
})

test('clearing the trace turns the route view off', async ({ page }) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  await expect(diagram(page)).toBeVisible()
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(diagram(page)).toHaveCount(0)
  await expectMarks(page, { routeView: false })
  // A new trace starts on the full map again.
  await traceFromEdge17(page)
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(diagram(page)).toHaveCount(0)
})
