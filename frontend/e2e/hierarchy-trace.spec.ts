import { expect, test, type Page } from './fixtures'
import {
  fitted,
  hierarchyState,
  highlightLocation,
  settledViewport,
  viewport,
} from './helpers'

// HI-10. A trace highlights in place (locked 3): nothing moves, nothing is dimmed.
test.describe.configure({ mode: 'serial' })

const root = (page: Page) => page.locator('[data-view="hierarchy"]')
const card = (page: Page, key: string) =>
  page.locator(`[data-card-key="${key}"]`)
const line = (page: Page, key: string) => page.locator(`[data-line="${key}"]`)
const equipmentCard = (page: Page, id: string) =>
  page.locator(`[data-equipment-id="${id}"]`)
const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')
const BUILDING_A = 'agg-03+agg-08|node-building-a'
const drawer = (page: Page) => page.getByTestId('hierarchy-drawer')

async function toHierarchy(page: Page) {
  await page.goto('/')
  await fitted(page)
  await expect(root(page)).toHaveAttribute('data-fitted', 'true')
}

/** Opens Building A's drawer on EDGE-17 and runs Find AGG / BB from it. */
async function findFromEdge17(page: Page) {
  await card(page, BUILDING_A).click()
  await drawer(page).locator('[data-switch-id="edge-17"]').click()
  await drawer(page).getByRole('button', { name: 'Find AGG / BB' }).click()
  await expect(rows(page)).toHaveCount(3)
  await drawer(page).getByRole('button', { name: 'Close' }).click()
}

test('HI-10 the route lights its cards and lines in place; choosing another route moves nothing', async ({
  page,
}) => {
  await toHierarchy(page)
  await findFromEdge17(page)
  await settledViewport(page)
  const first = await hierarchyState(page)
  const view = await viewport(page)
  // Route 1 is AGG-03: the node card, AGG-03 and the frame's line to the card.
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-on-route', 'true')
  await expect(card(page, 'agg-03')).toHaveAttribute('data-on-route', 'true')
  await expect(card(page, 'agg-08')).toHaveAttribute('data-on-route', 'false')
  await expect(card(page, 'bb-01')).toHaveAttribute('data-on-route', 'false')
  await expect(card(page, 'agg-15')).toHaveAttribute('data-on-route', 'false')
  await expect(line(page, `group:${BUILDING_A}`)).toHaveAttribute(
    'data-on-route',
    'true',
  )

  // The BB-01 route: the lit cards change, nothing moves.
  await rows(page).nth(2).click()
  await expect(rows(page).nth(2)).toContainText('BB-01')
  await expect(card(page, 'bb-01')).toHaveAttribute('data-on-route', 'true')
  await expect(card(page, 'agg-03')).toHaveAttribute('data-on-route', 'false')
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-on-route', 'true')
  // The route now goes straight to the BB, not through the frame's AGGs: the line stays unlit.
  await expect(line(page, `group:${BUILDING_A}`)).toHaveAttribute(
    'data-on-route',
    'false',
  )
  const second = await hierarchyState(page)
  expect(second.cards).not.toEqual(first.cards)
  expect(second.positions).toBe(first.positions)
  expect(await viewport(page)).toBe(view)
})

test('HI-10 nothing is dimmed: with Network B shown the A route is not drawn, and A shows it lit again', async ({
  page,
}) => {
  await toHierarchy(page)
  await findFromEdge17(page)
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  await expect(root(page)).toHaveAttribute('data-network', 'net-b')
  await expect(root(page)).toHaveAttribute('data-fitted', 'true')
  await expect(rows(page)).toHaveCount(3)
  await expect(card(page, 'agg-12')).toHaveAttribute('data-on-route', 'false')
  await expect(page.locator('.dimmed')).toHaveCount(0)
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network A' })
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-on-route', 'true')
  await expect(page.locator('.dimmed')).toHaveCount(0)
})

test('HI-10 the Route view covers the hierarchy, and turning it off restores it exactly', async ({
  page,
}) => {
  await toHierarchy(page)
  await findFromEdge17(page)
  await settledViewport(page)
  const before = await hierarchyState(page)
  const view = await viewport(page)
  const toggle = page.getByRole('button', { name: 'Route view' })
  await toggle.click()
  await expect(page.getByTestId('route-layer')).toBeVisible()
  await toggle.click()
  await expect(page.getByTestId('route-layer')).toHaveCount(0)
  expect(await hierarchyState(page)).toEqual(before)
  expect(await viewport(page)).toBe(view)
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-on-route', 'true')
})

test('HI-10 the route of EDGE-17 lights the AGG-03 card, and choosing another route moves nothing', async ({
  page,
}) => {
  await toHierarchy(page)
  await findFromEdge17(page)
  await card(page, BUILDING_A).click()
  await expect(card(page, 'agg-03')).toHaveAttribute('data-on-route', 'true')
  await expect(card(page, 'agg-08')).toHaveAttribute('data-on-route', 'false')
  await settledViewport(page)
  const view = await viewport(page)
  await rows(page).nth(2).click()
  await expect(card(page, 'bb-01')).toHaveAttribute('data-on-route', 'true')
  await expect(card(page, 'agg-03')).toHaveAttribute('data-on-route', 'false')
  expect(await viewport(page)).toBe(view)
})

test('HI-10 Explore’s highlight marks the node card amber and fits it into view once; coming back does not fit again', async ({
  page,
}) => {
  await toHierarchy(page)
  await highlightLocation(page, 'Building A')
  const target = card(page, BUILDING_A)
  await expect(target).toHaveAttribute('data-highlighted', 'true')
  await expect(card(page, 'agg-15')).toHaveAttribute(
    'data-highlighted',
    'false',
  )
  const area = (await page.locator('.studio-drawer.left').boundingBox())!
  await expect
    .poll(async () => {
      const b = (await target.boundingBox())!
      return b.x >= area.x + area.width - 1 && b.y >= 0
    })
    .toBe(true)
  const fit = await settledViewport(page)
  // Once: leaving and coming back keeps the view.
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expect(page.locator('.physical-explorer')).toBeVisible()
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await expect(root(page)).toHaveAttribute('data-fitted', 'true')
  await expect.poll(() => viewport(page)).toBe(fit)
  await expect(target).toHaveAttribute('data-highlighted', 'true')
})

test('HI-10 a highlight of a whole site marks its node cards and the tier cards placed there', async ({
  page,
}) => {
  await toHierarchy(page)
  await highlightLocation(page, 'Main Campus')
  await expect(card(page, BUILDING_A)).toHaveAttribute(
    'data-highlighted',
    'true',
  )
  for (const id of ['bb-01', 'agg-03', 'agg-08', 'agg-15'])
    await expect(card(page, id)).toHaveAttribute('data-highlighted', 'true')
})

test('HI-10 Clear highlight and Escape clear the highlight, never the trace', async ({
  page,
}) => {
  await toHierarchy(page)
  await findFromEdge17(page)
  const target = card(page, BUILDING_A)
  await highlightLocation(page, 'Building A')
  await expect(target).toHaveAttribute('data-highlighted', 'true')
  await page.getByRole('button', { name: 'Clear highlight' }).click()
  await expect(target).toHaveAttribute('data-highlighted', 'false')
  await expect(
    page.getByRole('button', { name: 'Clear highlight' }),
  ).toHaveCount(0)
  await expect(target).toHaveAttribute('data-on-route', 'true')

  await highlightLocation(page, 'Building A')
  await expect(target).toHaveAttribute('data-highlighted', 'true')
  await page.locator('body').click({ position: { x: 5, y: 600 } })
  await page.keyboard.press('Escape')
  await expect(target).toHaveAttribute('data-highlighted', 'false')
  await expect(target).toHaveAttribute('data-on-route', 'true')
  await expect(rows(page)).toHaveCount(3)
})
