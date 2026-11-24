import { expect, test, type Page } from './fixtures'
import {
  expandResults,
  fitted,
  hierarchyState,
  settledViewport,
  viewport,
} from './helpers'

// HI-10. A trace marks in place (locked 3): nothing moves, nothing is dimmed.
test.describe.configure({ mode: 'serial' })

const root = (page: Page) => page.locator('[data-view="hierarchy"]')
const card = (page: Page, key: string) =>
  page.locator(`[data-card-key="${key}"]`)
const line = (page: Page, key: string) => page.locator(`[data-line="${key}"]`)
const equipmentCard = (page: Page, id: string) =>
  page.locator(`[data-equipment-id="${id}"]`)
const rows = (page: Page) =>
  page.getByLabel('Trace results').getByTestId('route-row')
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
  // The results are in the Trace tab, which stays open beside the tree.
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
  // Clear the selection (the Node tab's ×); the dock goes back to the Trace tab.
  await page.getByRole('tab', { name: 'Node' }).click()
  await page.getByRole('button', { name: 'Close Node details' }).click()
  await expect(rows(page)).toHaveCount(3)
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

test('HI-10 the route of EDGE-17 lights the AGG-03 card, and choosing another route moves nothing', async ({
  page,
}) => {
  await toHierarchy(page)
  await findFromEdge17(page)
  await card(page, BUILDING_A).click()
  await expandResults(page) // the click opened the Node tab; back to Trace
  await expect(card(page, 'agg-03')).toHaveAttribute('data-on-route', 'true')
  await expect(card(page, 'agg-08')).toHaveAttribute('data-on-route', 'false')
  await settledViewport(page)
  const view = await viewport(page)
  await rows(page).nth(2).click()
  await expect(card(page, 'bb-01')).toHaveAttribute('data-on-route', 'true')
  await expect(card(page, 'agg-03')).toHaveAttribute('data-on-route', 'false')
  expect(await viewport(page)).toBe(view)
})
