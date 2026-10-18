import { expect, test, type Page } from '@playwright/test'
import { fitted, highlightLocation, settledViewport } from './helpers'

// CM-11. A new file: trace-map.spec.ts is about the device map only. A trace
// highlights in place (locked 3): nothing moves.
test.describe.configure({ mode: 'serial' })
test.afterEach(async ({ request }) => {
  await request.delete('/api/map-layout')
})

const overviewRoot = (page: Page) => page.locator('[data-view="overview"]')
const focusRoot = (page: Page) => page.locator('[data-view="focus"]')
const card = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const equipmentCard = (page: Page, id: string) =>
  page.locator(`[data-equipment-id="${id}"]`)
const pair = (page: Page, a: string, b: string) =>
  page.locator(`[data-pair="${[a, b].sort().join('|')}"]`)
const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')
const viewport = (page: Page) =>
  page.locator('.react-flow__viewport').getAttribute('style')
const mapView = (page: Page, name: 'Overview' | 'Devices') =>
  page
    .getByRole('group', { name: 'Map view' })
    .getByRole('button', { name, exact: true })
const positions = (page: Page) =>
  overviewRoot(page).getAttribute('data-node-positions')
/** Every drawn Focus card's transform. */
const transforms = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.react-flow__node')].map((n) => [
        n.getAttribute('data-id'),
        (n as HTMLElement).style.transform,
      ]),
    ),
  )

const ROUTE_NODES = [
  'node-building-a',
  'node-north-sub-main',
  'node-main-distribution',
]
const OTHER_NODES = ['node-dr-access', 'node-dr-distribution', 'node-annex']

async function toOverview(page: Page) {
  await page.goto('/')
  await fitted(page)
  await mapView(page, 'Overview').click()
  await expect(overviewRoot(page)).toHaveAttribute('data-fitted', 'true')
}

/** Selects EDGE-17 from its overview card, which leaves the card open and the inspector on it. */
async function selectEdge17(page: Page) {
  const building = card(page, 'node-building-a')
  if ((await building.locator('.overview-row').count()) === 0)
    await building.locator('.overview-card-head').click()
  await building.getByRole('button', { name: /EDGE-17/ }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText('EDGE-17')
}

async function findFromEdge17(page: Page) {
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(rows(page)).toHaveCount(3)
}

test('CM-11 the route lights its node cards and lines in place; choosing another route moves nothing', async ({
  page,
}) => {
  await toOverview(page)
  await selectEdge17(page)
  // Open Main Distribution too, to see the route's equipment rows.
  // (the inspector covers it: open it with the keyboard)
  await card(page, 'node-main-distribution')
    .locator('.overview-card-head')
    .focus()
  await page.keyboard.press('Enter')
  await settledViewport(page)
  const before = { marks: await positions(page), view: await viewport(page) }
  await findFromEdge17(page)

  for (const id of ROUTE_NODES)
    await expect(card(page, id)).toHaveAttribute('data-on-route', 'true')
  for (const id of OTHER_NODES)
    await expect(card(page, id)).toHaveAttribute('data-on-route', 'false')
  await expect(
    pair(page, 'node-building-a', 'node-north-sub-main'),
  ).toHaveAttribute('data-on-route', 'true')
  await expect(
    pair(page, 'node-north-sub-main', 'node-main-distribution'),
  ).toHaveAttribute('data-on-route', 'true')
  await expect(
    pair(page, 'node-dr-access', 'node-north-sub-main'),
  ).toHaveAttribute('data-on-route', 'false')
  const core = card(page, 'node-main-distribution')
  await expect(core.locator('[data-equipment-id="agg-03"]')).toHaveAttribute(
    'data-on-route',
    'true',
  )
  await expect(core.locator('[data-equipment-id="bb-01"]')).toHaveAttribute(
    'data-on-route',
    'false',
  )
  expect(await positions(page)).toBe(before.marks)
  expect(await viewport(page)).toBe(before.view)

  // The BB-01 route: the rows change, nothing moves.
  await rows(page).nth(2).click()
  await expect(rows(page).nth(2)).toContainText('BB-01')
  await expect(core.locator('[data-equipment-id="bb-01"]')).toHaveAttribute(
    'data-on-route',
    'true',
  )
  await expect(core.locator('[data-equipment-id="agg-03"]')).toHaveAttribute(
    'data-on-route',
    'false',
  )
  expect(await positions(page)).toBe(before.marks)
  expect(await viewport(page)).toBe(before.view)
})

test('CM-11 with Network B selected the route’s nodes stay undimmed', async ({
  page,
}) => {
  await toOverview(page)
  await selectEdge17(page)
  await findFromEdge17(page)
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  // Building A is Network A only: dimmed without a route, lit with it.
  for (const id of ROUTE_NODES) {
    await expect(card(page, id)).toHaveAttribute('data-on-route', 'true')
    await expect(card(page, id)).not.toHaveClass(/dimmed/)
  }
  await expect(
    pair(page, 'node-building-a', 'node-north-sub-main'),
  ).not.toHaveClass(/dimmed/)
  // The empty Annex is still dimmed: only the route is exempt.
  await expect(card(page, 'node-annex')).toHaveClass(/dimmed/)
})

test('CM-11 the Route view covers the overview, and turning it off restores it exactly', async ({
  page,
}) => {
  await toOverview(page)
  await selectEdge17(page)
  await findFromEdge17(page)
  await settledViewport(page)
  const before = { marks: await positions(page), view: await viewport(page) }
  const toggle = page.getByRole('button', { name: 'Route view' })
  await toggle.click()
  await expect(page.getByTestId('route-layer')).toBeVisible()
  await toggle.click()
  await expect(page.getByTestId('route-layer')).toHaveCount(0)
  expect(await positions(page)).toBe(before.marks)
  expect(await viewport(page)).toBe(before.view)
  await expect(card(page, 'node-building-a')).toHaveAttribute(
    'data-on-route',
    'true',
  )
})

test('CM-11 Focus on EDGE-17 lights the AGG-03 card and line, and choosing another route moves nothing', async ({
  page,
}) => {
  await toOverview(page)
  await selectEdge17(page)
  await findFromEdge17(page)
  await selectEdge17(page)
  await page.getByRole('button', { name: 'Focus on EDGE-17' }).click()
  await expect(focusRoot(page)).toHaveAttribute('data-focus-id', 'edge-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(equipmentCard(page, 'agg-03')).toBeVisible()
  await expect(equipmentCard(page, 'edge-17')).toHaveAttribute(
    'data-on-route',
    'true',
  )
  await expect(equipmentCard(page, 'agg-03')).toHaveAttribute(
    'data-on-route',
    'true',
  )
  await expect(equipmentCard(page, 'agg-08')).toHaveAttribute(
    'data-on-route',
    'false',
  )
  await expect(equipmentCard(page, 'bb-01')).toHaveAttribute(
    'data-on-route',
    'false',
  )
  const line = (to: string) => page.locator(`[data-line="edge-17|${to}"]`)
  await expect(line('agg-03')).toHaveAttribute('data-on-route', 'true')
  await expect(line('agg-08')).toHaveAttribute('data-on-route', 'false')
  await settledViewport(page)
  const before = { cards: await transforms(page), view: await viewport(page) }

  await rows(page).nth(2).click()
  await expect(equipmentCard(page, 'bb-01')).toHaveAttribute(
    'data-on-route',
    'true',
  )
  await expect(equipmentCard(page, 'agg-03')).toHaveAttribute(
    'data-on-route',
    'false',
  )
  await expect(line('bb-01')).toHaveAttribute('data-on-route', 'true')
  expect(await transforms(page)).toEqual(before.cards)
  expect(await viewport(page)).toBe(before.view)
})

test('CM-11 Explore’s highlight marks the node amber and fits it into view once; coming back does not fit again', async ({
  page,
}) => {
  await toOverview(page)
  await highlightLocation(page, 'North Sub-main')
  const target = card(page, 'node-north-sub-main')
  await expect(target).toHaveAttribute('data-highlighted', 'true')
  await expect(card(page, 'node-building-a')).toHaveAttribute(
    'data-highlighted',
    'false',
  )
  // Fitted into the part of the canvas the Explore drawer leaves free.
  const drawer = (await page.locator('.studio-drawer.left').boundingBox())!
  await expect
    .poll(async () => {
      const b = (await target.boundingBox())!
      return b.x >= drawer.x + drawer.width && b.y >= 0
    })
    .toBe(true)
  const fitView = await settledViewport(page)
  // Once: a drag of the view is not undone, and leaving and coming back keeps it.
  await mapView(page, 'Devices').click()
  await expect(
    page.locator('.react-flow__node-equipment').first(),
  ).toBeVisible()
  await mapView(page, 'Overview').click()
  await expect(overviewRoot(page)).toHaveAttribute('data-fitted', 'true')
  await expect.poll(() => viewport(page)).toBe(fitView)
  await expect(target).toHaveAttribute('data-highlighted', 'true')
})

test('CM-11 Clear highlight and Escape clear the overview highlight, never the trace', async ({
  page,
}) => {
  await toOverview(page)
  const target = card(page, 'node-north-sub-main')
  await highlightLocation(page, 'North Sub-main')
  await expect(target).toHaveAttribute('data-highlighted', 'true')
  await page.getByRole('button', { name: 'Clear highlight' }).click()
  await expect(target).toHaveAttribute('data-highlighted', 'false')
  await expect(
    page.getByRole('button', { name: 'Clear highlight' }),
  ).toHaveCount(0)

  await highlightLocation(page, 'North Sub-main')
  await expect(target).toHaveAttribute('data-highlighted', 'true')
  await page.locator('body').click({ position: { x: 5, y: 600 } })
  await page.keyboard.press('Escape')
  await expect(target).toHaveAttribute('data-highlighted', 'false')
})

test('CM-11 an open card is above the count pills: its list is never covered', async ({
  page,
}) => {
  await toOverview(page)
  await selectEdge17(page) // leaves Building A open
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const open = card(page, 'node-building-a')
  const box = (await open.boundingBox())!
  const underCard = await page.evaluate((b) => {
    const result: { covered: boolean }[] = []
    for (const pill of document.querySelectorAll('.overview-pill')) {
      const r = pill.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height)
        continue
      const top = document.elementFromPoint(x, y)
      result.push({ covered: !!top?.closest('.overview-pill') })
    }
    return result
  }, box)
  // The open card reaches over at least one pill in this fixture (Building A ↔ North Sub-main).
  expect(underCard.length).toBeGreaterThan(0)
  expect(underCard.every((p) => !p.covered)).toBe(true)
})

test('CM-11 a highlight of a whole site marks each of its nodes', async ({
  page,
}) => {
  await toOverview(page)
  await highlightLocation(page, 'DR Site')
  await expect(card(page, 'node-dr-access')).toHaveAttribute(
    'data-highlighted',
    'true',
  )
  await expect(card(page, 'node-dr-distribution')).toHaveAttribute(
    'data-highlighted',
    'true',
  )
  await expect(card(page, 'node-building-a')).toHaveAttribute(
    'data-highlighted',
    'false',
  )
})
