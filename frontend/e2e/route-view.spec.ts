import { expect, test, type Page } from '@playwright/test'
import type { Plan } from '../src/shared/types'
import {
  expectMarks,
  fitted,
  highlightLocation,
  layout,
  pinFromInspector,
  settledViewport,
} from './helpers'

const ROUTE_CARDS = ['agg-03', 'edge-17', 'hdf-01', 'hdf-02', 'panel-a']
const ORDER = ['edge-17', 'panel-a', 'hdf-01', 'hdf-02', 'agg-03']
const toggle = (page: Page) => page.getByRole('button', { name: 'Route view' })
const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')

/** Find AGG / BB from EDGE-17; the first route is AGG-03, so it is the active one. */
async function traceFromEdge17(page: Page) {
  await page.getByTestId('rf__node-edge-17').click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(rows(page)).toHaveCount(3)
}

const box = async (page: Page, selector: string) =>
  (await page.locator(selector).boundingBox())!
interface Rect {
  x: number
  y: number
  width: number
  height: number
}
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 1 &&
  inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 &&
  inner.y + inner.height <= outer.y + outer.height + 1
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height

test('POL-22 the toggle shows only the route, and turning it off restores the same map', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  // State on the full map: a pin, a highlight, a filter, a split pair.
  await pinFromInspector(page, 'hdf-01', '1A/2')
  await highlightLocation(page, 'Building A')
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click() // close Explore
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network A' })
  // EDGE-17–PANEL-A (a05, a09 stay bundled when a01 becomes the route's).
  await page.locator('.map-pill[data-cable-ids~="cable-a05"]').click()
  await traceFromEdge17(page)
  const marksBefore = await page.locator('.flow-surface').evaluate((el) => ({
    highlight: el.getAttribute('data-highlight-cards'),
    split: el.getAttribute('data-split-pairs'),
    cards: el.getAttribute('data-cards'),
  }))
  expect(marksBefore.split).not.toBe('')
  const positions = await layout(page)
  const port = await settledViewport(page)

  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  await expectMarks(page, {
    routeView: true,
    cards: ROUTE_CARDS,
    routeLinks: ['cable-a01', 'cable-a02', 'cable-a03', 'cable-a04'],
    highlightCards: [],
    dimmedCards: [],
    splitPairs: [],
  })
  // Only the route's exact positions show, not the pin.
  await expect(
    page.getByLabel('HDF-01 shown connections').locator('.map-facet-label'),
  ).toHaveText(['3C / 5'])
  await expect(page.getByTestId('rf__node-agg-15')).toHaveCount(0)

  await toggle(page).click()
  await expectMarks(page, { routeView: false })
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-cards',
    marksBefore.cards!,
  )
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-highlight-cards',
    marksBefore.highlight!,
  )
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-split-pairs',
    marksBefore.split!,
  )
  expect(await layout(page)).toEqual(positions)
  expect(await settledViewport(page)).toBe(port)
  await expect(
    page.getByRole('combobox', { name: 'Show network' }),
  ).toHaveValue('net-a')
  await expect(
    page.getByLabel('HDF-01 shown connections').locator('.map-facet-label'),
  ).toHaveText(['1A / 2', '3C / 5'])
})

test('POL-23 the route lays out left to right in hop order, on one row', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  await expectMarks(page, { routeView: true })
  await settledViewport(page) // the fit animates for a moment
  const boxes = []
  for (const id of ORDER)
    boxes.push(await box(page, `[data-testid="rf__node-${id}"]`))
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width - 1)
    expect(Math.abs(boxes[i].y - boxes[0].y)).toBeLessThan(2)
  }
})

test('POL-24 EDGE-17 → AGG-03 shows a dashed node box per run with its label, and a rack box only where two or more cards share a rack', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  await expectMarks(page, { routeView: true })
  await settledViewport(page)
  const marks = await page.locator('.flow-surface').evaluate((el) => ({
    node: el.getAttribute('data-node-boxes')!.split(' ').length,
    rack: el.getAttribute('data-rack-boxes')!.split(' ').length,
  }))
  expect(marks).toEqual({ node: 3, rack: 2 })
  const nodes = page.locator('.route-outline.node')
  const racks = page.locator('.route-outline.rack')
  await expect(nodes).toHaveCount(3)
  await expect(racks).toHaveCount(2)
  await expect(nodes.locator('.route-outline-label')).toHaveText([
    'Main Campus / Building A',
    'Main Campus / North Sub-main',
    'Main Campus / Main Distribution',
  ])
  await expect(racks.locator('.route-outline-label')).toHaveText([
    'Rack A03',
    'Rack Core 01',
  ])
  await expect(nodes.first()).toHaveCSS('border-top-style', 'dashed')
  await expect(racks.first()).toHaveCSS('border-top-style', 'dashed')

  // Each node box encloses exactly its cards, and a rack box sits inside its node box.
  const card = (id: string) => box(page, `[data-testid="rf__node-${id}"]`)
  const nodeBoxes = await nodes.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().toJSON()),
  )
  const rackBoxes = await racks.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().toJSON()),
  )
  const members = [['edge-17', 'panel-a'], ['hdf-01'], ['hdf-02', 'agg-03']]
  for (const [i, ids] of members.entries())
    for (const id of ORDER) {
      const c = await card(id)
      expect(inside(c, nodeBoxes[i])).toBe(ids.includes(id))
    }
  expect(inside(rackBoxes[0], nodeBoxes[0])).toBe(true)
  expect(inside(rackBoxes[1], nodeBoxes[2])).toBe(true)
  // Labels never sit on a card.
  const labels = await page
    .locator('.route-outline-label')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
  for (const label of labels)
    for (const id of ORDER) expect(overlaps(label, await card(id))).toBe(false)
})

test('POL-25 a route that leaves a node and returns gets two boxes for it', async ({
  page,
  request,
}) => {
  // In a draft, AGG-03 moves into Rack A03: the route goes Building A → North Sub-main → Main Distribution → Building A.
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
  await expectMarks(page, { routeView: true })
  const nodes = page.locator('.route-outline.node')
  await expect(nodes).toHaveCount(4)
  await expect(nodes.locator('.route-outline-label')).toHaveText([
    'Main Campus / Building A',
    'Main Campus / North Sub-main',
    'Main Campus / Main Distribution',
    'Main Campus / Building A',
  ])
  // Rack A03 is boxed once, around EDGE-17 and PANEL-A; AGG-03 alone gets no rack box.
  await expect(page.locator('.route-outline.rack')).toHaveCount(1)
})

/** Every route card and node box lies fully inside the canvas, clear of every drawer, the tool rail and the results overlay. */
async function expectRouteInVisibleArea(page: Page) {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const surface = document
          .querySelector('.flow-surface')!
          .getBoundingClientRect()
        const covers = [
          ...document.querySelectorAll(
            '.studio-drawer, .map-results, .tool-rail',
          ),
        ].map((el) => el.getBoundingClientRect())
        const things = [
          ...document.querySelectorAll('.react-flow__node-equipment'),
          ...document.querySelectorAll('.route-outline.node'),
        ]
        if (things.length !== 5 + 3) return `drawn: ${things.length}`
        const bad = things.filter((el) => {
          const r = el.getBoundingClientRect()
          const inCanvas =
            r.left >= surface.left - 1 &&
            r.top >= surface.top - 1 &&
            r.right <= surface.right + 1 &&
            r.bottom <= surface.bottom + 1
          const underCover = covers.some(
            (c) =>
              r.left < c.right - 1 &&
              c.left < r.right - 1 &&
              r.top < c.bottom - 1 &&
              c.top < r.bottom - 1,
          )
          return !inCanvas || underCover
        })
        return bad.length ? `outside: ${bad.length}` : 'ok'
      })
    })
    .toBe('ok')
}

test('POL-31 entering the route view fits the route and its boxes into the visible area, clear of the drawers and the overlay', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)

  // With Trace tools open.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await toggle(page).click()
  await expectMarks(page, { routeView: true })
  await expectRouteInVisibleArea(page)

  // With the inspector open instead.
  await toggle(page).click()
  await expectMarks(page, { routeView: false })
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await page.getByTestId('rf__node-edge-17').click()
  await expect(page.locator('.studio-drawer.right')).toBeVisible()
  await toggle(page).click()
  await expectMarks(page, { routeView: true })
  await expectRouteInVisibleArea(page)
})

test('POL-34 choosing another route in the route view lays it out afresh and fits it, whatever was dragged', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  await expectMarks(page, { routeView: true })
  await settledViewport(page)
  // Drag HDF-01 away: local to the route view.
  const hdf = page.getByTestId('rf__node-hdf-01')
  const at = (await hdf.boundingBox())!
  await page.mouse.move(at.x + 60, at.y + 20)
  await page.mouse.down()
  await page.mouse.move(at.x + 60, at.y + 160, { steps: 8 })
  await page.mouse.up()
  expect((await hdf.boundingBox())!.y).toBeGreaterThan(at.y + 80)

  // The third route (BB-01) takes the same five places, in its own order.
  await page
    .getByLabel('Map trace results')
    .getByTestId('route-row')
    .nth(2)
    .click()
  await expectMarks(page, {
    cards: ['bb-01', 'edge-17', 'hdf-01', 'hdf-02', 'panel-a'],
  })
  await settledViewport(page)
  // Every card is where the route-view model puts it: one row, one card per 360 px.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll('.react-flow__node-equipment')].map(
            (n) => {
              const [x, y] = (n as HTMLElement).style.transform
                .match(/-?[\d.]+/g)!
                .map(Number)
              return [n.getAttribute('data-id'), [x, y]]
            },
          ),
        ),
      ),
    )
    .toEqual(
      Object.fromEntries(
        ['edge-17', 'panel-a', 'hdf-01', 'hdf-02', 'bb-01'].map((id, i) => [
          id,
          [i * 360, 0],
        ]),
      ),
    )
  await expectRouteInVisibleArea(page)
})
