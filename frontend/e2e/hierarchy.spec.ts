import { expect, test, type Locator, type Page } from '@playwright/test'
import { fitted, hierarchyState, settledViewport, viewport } from './helpers'

// HI-09. The hierarchy of one network, from the acceptance fixture and the
// Expansion draft; nothing on it is saved, so no spec needs to clean up.
test.describe.configure({ mode: 'serial' })

const root = (page: Page) => page.locator('[data-view="hierarchy"]')
const card = (page: Page, key: string) =>
  page.locator(`[data-card-key="${key}"]`)
const line = (page: Page, key: string) => page.locator(`[data-line="${key}"]`)
const frame = (page: Page, groupKey: string) =>
  page.locator(`[data-frame-key="${groupKey}"]`)
const panel = (page: Page) => page.locator('.hierarchy-panel')
const drawer = (page: Page) => page.getByTestId('hierarchy-drawer')
const BUILDING_A = 'agg-03+agg-08|node-building-a'

async function toHierarchy(page: Page, path = '/') {
  await page.goto(path)
  await fitted(page)
  await expect(root(page)).toHaveAttribute('data-fitted', 'true')
}

async function chooseNetwork(page: Page, label: string) {
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label })
}

test('HI-09 Network A: the Backbone over three AGGs, Building A under AGG-03 + AGG-08, AGG-15 with no node', async ({
  page,
}) => {
  await toHierarchy(page)
  await expect(root(page)).toHaveAttribute('data-network', 'net-a')
  await expect(panel(page)).toContainText('Network A')
  await expect(panel(page)).toContainText('1 BB · 3 AGG · 1 node · 1 switch')
  for (const id of ['bb-01', 'agg-03', 'agg-08', 'agg-15'])
    await expect(card(page, id)).toBeVisible()
  await expect(card(page, 'bb-01')).toContainText('BB-01')
  // A closed card is one row: the name, the switch count; the site is its title.
  await expect(card(page, BUILDING_A)).toContainText('Building A')
  await expect(card(page, BUILDING_A)).toHaveAttribute('title', 'Main Campus')
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-open', 'false')
  await expect(card(page, BUILDING_A)).toContainText('1')
  // EDGE-17 has three uplinks (AGG-03, AGG-08, BB-01): the neutral "2↑ 1" badge, and no fault.
  await expect(card(page, BUILDING_A)).toContainText('2↑ 1')
  await expect(card(page, BUILDING_A)).not.toContainText('single')
  await expect(card(page, BUILDING_A)).not.toContainText('chained')
  await expect(page.locator('[data-card-key]')).toHaveCount(5)
  // The column heads, and the frames: the AGGs are buttons inside them.
  for (const label of ['Backbone', 'Aggregation', 'Nodes'])
    await expect(page.getByTestId(`rf__node-label:${label}`)).toBeVisible()
  await expect(frame(page, 'agg-03+agg-08')).toBeVisible()
  await expect(
    frame(page, 'agg-03+agg-08').locator('[data-card-key]'),
  ).toHaveCount(2)
  await expect(
    frame(page, 'agg-15').locator('[data-card-key="agg-15"]'),
  ).toBeVisible()
  // Three columns, left to right: the BB, the frames, the node cards.
  const box = async (loc: Locator) => (await loc.boundingBox())!
  const bb = await box(card(page, 'bb-01'))
  const f1 = await box(frame(page, 'agg-03+agg-08'))
  const f2 = await box(frame(page, 'agg-15'))
  const a = await box(card(page, BUILDING_A))
  expect(bb.x + bb.width).toBeLessThan(f1.x)
  expect(f1.x + f1.width).toBeLessThan(a.x)
  expect(f1.x).toBeCloseTo(f2.x, 0)
  expect(f2.y).toBeGreaterThan(f1.y + f1.height)
  // The frame is level with its card (centred on its row).
  expect(f1.y + f1.height / 2).toBeCloseTo(a.y + a.height / 2, 0)
  // One line from the frame to its card. No cable joins the AGGs and the BB here.
  await expect(line(page, `group:${BUILDING_A}`)).toHaveCount(1)
  await expect(page.locator('[data-line^="group:"]')).toHaveCount(1)
  await expect(page.locator('[data-line^="uplink:"]')).toHaveCount(0)
  await expect(page.locator('[data-weak]')).toHaveCount(0)
  // No cable joins an AGG to BB-01, so each of the three says so; the BB does not.
  for (const id of ['agg-03', 'agg-08', 'agg-15'])
    await expect(card(page, id)).toContainText('no BB')
  await expect(card(page, 'bb-01')).not.toContainText('no BB')
  // Nothing on it can be dragged, and the legend says what the lines are.
  await expect(panel(page)).toContainText('peers')
  await expect(panel(page)).toContainText('proposed')
})

test('OV-02 a click on Building A opens it and lists EDGE-17; “Building A ▴” closes it', async ({
  page,
}) => {
  await toHierarchy(page)
  const scaleBefore = /scale\(([\d.]+)\)/.exec((await viewport(page))!)![1]
  const closed = (await card(page, BUILDING_A).boundingBox())!
  const below = (await card(page, 'agg-15').boundingBox())!
  await card(page, BUILDING_A).click()
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-open', 'true')
  await expect(card(page, BUILDING_A)).toContainText('EDGE-17')
  await expect(card(page, BUILDING_A)).toContainText('2 uplinks')
  await expect(root(page)).toHaveAttribute('data-open-cards', BUILDING_A)
  await expect(drawer(page)).toBeVisible()
  const settled = await settledViewport(page) // a pan to the card has finished
  const opened = (await card(page, BUILDING_A).boundingBox())!
  expect(opened.height).toBeGreaterThan(closed.height + 30)
  // The selection may pan, never zoom.
  expect(/scale\(([\d.]+)\)/.exec(settled)![1]).toBe(scaleBefore)
  // The frame stays level with the card's rows, which moved.
  const f1 = (await frame(page, 'agg-03+agg-08').boundingBox())!
  expect(f1.y + f1.height / 2).toBeCloseTo(opened.y + opened.height / 2, 0)
  expect((await card(page, 'agg-15').boundingBox())!.y).toBeGreaterThan(below.y)
  await card(page, BUILDING_A)
    .getByRole('button', { name: /Building A ▴/ })
    .click()
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-open', 'false')
  await expect(card(page, BUILDING_A)).not.toContainText('EDGE-17')
  await expect(root(page)).toHaveAttribute('data-open-cards', '')
})

test('HI-09 Network B has no top row: AGG-12 over DR Access; the header redraws and fits once, and All networks keeps B', async ({
  page,
}) => {
  await toHierarchy(page)
  const before = await viewport(page)
  await chooseNetwork(page, 'Network B')
  await expect(root(page)).toHaveAttribute('data-network', 'net-b')
  await expect(root(page)).toHaveAttribute('data-fitted', 'true')
  await expect(panel(page)).toContainText('Network B')
  await expect(panel(page)).toContainText('1 AGG · 1 node · 1 switch')
  await expect(card(page, 'agg-12')).toBeVisible()
  await expect(card(page, 'agg-12|node-dr-access')).toContainText('DR Access')
  await expect(page.getByTestId('rf__node-label:Nodes')).toBeVisible()
  await expect(card(page, 'agg-03')).toHaveCount(0)
  await expect(page.getByTestId('rf__node-label:Backbone')).toHaveCount(0)
  await expect(page.getByTestId('rf__node-label:Top AGG')).toHaveCount(0)
  const fit = await settledViewport(page)
  expect(fit).not.toBe(before)
  // Fitted once: it stays where the fit put it.
  await page.waitForTimeout(300)
  expect(await viewport(page)).toBe(fit)

  // All networks changes the header's choice only; the map keeps Network B.
  await chooseNetwork(page, 'All networks')
  await expect(root(page)).toHaveAttribute('data-network', 'net-b')
  await expect(card(page, 'agg-12')).toBeVisible()
  expect(await viewport(page)).toBe(fit)
  await expect(
    page.getByRole('combobox', { name: 'Show network' }),
  ).toHaveValue('net-b')

  // Going back to A fits again.
  await chooseNetwork(page, 'Network A')
  await expect(root(page)).toHaveAttribute('data-network', 'net-a')
  await expect(card(page, 'bb-01')).toBeVisible()
  await expect.poll(() => viewport(page)).not.toBe(fit)
})

test('HI-09 the drawer of Building A: EDGE-17 reaches AGG-03, AGG-08 and BB-01, with AGG-03 through PANEL-A 1, HDF-01 3C/5, HDF-02 2B/3', async ({
  page,
}) => {
  await toHierarchy(page)
  await card(page, BUILDING_A).click()
  await expect(drawer(page)).toBeVisible()
  await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText(
    'Building A',
  )
  await expect(drawer(page)).toContainText('Main Campus · Network A · 1 switch')
  await expect(drawer(page)).toContainText(
    'Uplinks are the first active device each switch reaches over real cables',
  )
  // The selected card is amber, with the AGGs of its switches; the BB is not.
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-hot', 'true')
  await expect(card(page, 'agg-03')).toHaveAttribute('data-hot', 'true')
  await expect(card(page, 'agg-08')).toHaveAttribute('data-hot', 'true')
  await expect(card(page, 'bb-01')).toHaveAttribute('data-hot', 'false')
  await expect(card(page, 'agg-15')).toHaveAttribute('data-hot', 'false')

  const row = drawer(page).locator('[data-switch-id="edge-17"]')
  await expect(row).toContainText('EDGE-17')
  await expect(row).toContainText('→ AGG-03 + AGG-08 + BB-01')
  await row.click()
  const uplinks = drawer(page).locator('[data-uplink-to]')
  await expect(uplinks).toHaveCount(3)
  const toAgg03 = drawer(page).locator('[data-uplink-to="agg-03"]')
  await expect(toAgg03).toContainText('AGG-03')
  await expect(toAgg03).toContainText('PANEL-A 1')
  await expect(toAgg03).toContainText('HDF-01 3C/5')
  await expect(toAgg03).toContainText('HDF-02 2B/3')
  await expect(drawer(page).locator('[data-uplink-to="bb-01"]')).toContainText(
    'HDF-02 3A/1',
  )
  // Clicking it again folds the detail.
  await row.click()
  await expect(uplinks).toHaveCount(0)
  await row.click()

  // ✕ closes the drawer and clears the amber.
  await drawer(page).getByRole('button', { name: 'Close' }).click()
  await expect(drawer(page)).toHaveCount(0)
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-hot', 'false')
  await expect(card(page, 'agg-03')).toHaveAttribute('data-hot', 'false')
  // Escape closes it too.
  await card(page, BUILDING_A).click()
  await expect(drawer(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer(page)).toHaveCount(0)
})

test('HI-09 from the drawer: Inspector, Find AGG / BB, and Show in Physical', async ({
  page,
}) => {
  await toHierarchy(page)
  const open = async () => {
    await card(page, BUILDING_A).click()
    const row = drawer(page).locator('[data-switch-id="edge-17"]')
    await row.click()
    return drawer(page).locator('.hierarchy-switch-detail')
  }
  let detail = await open()
  await detail.getByRole('button', { name: 'Inspector' }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText('EDGE-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()

  await detail.getByRole('button', { name: 'Find AGG / BB' }).click()
  await expect(
    page.getByLabel('Map trace results').getByTestId('route-row'),
  ).toHaveCount(3)
  // The route lights the cards it touches, in place.
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-on-route', 'true')

  // Show in Physical (the node).
  await drawer(page).getByRole('button', { name: 'Show in Physical' }).click()
  await expect(page.locator('.physical-explorer')).toBeVisible()
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await fitted(page)
  await expect(root(page)).toBeVisible()
})

test('HI-09 the drawer of AGG-03: its sentence, no way up beyond a gap, who depends on it, its cable, Inspector', async ({
  page,
}) => {
  await toHierarchy(page)
  await card(page, 'agg-03').click()
  await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText(
    'AGG-03',
  )
  await expect(drawer(page)).toContainText('Main Campus')
  await expect(drawer(page)).toContainText('Main Distribution')
  await expect(drawer(page).getByTestId('hd-say')).toContainText('No BB uplink')
  await expect(drawer(page).getByTestId('hd-way')).toContainText('No BB uplink')
  await expect(drawer(page).getByTestId('hd-depends')).toContainText('EDGE-17')
  await expect(drawer(page).getByTestId('hd-cables')).toContainText(
    'HDF-02 2B/3',
  )
  await expect(card(page, 'agg-03')).toHaveAttribute('data-hot', 'true')
  await expect(card(page, 'agg-08')).toHaveAttribute('data-hot', 'false')
  // Another card replaces the drawer's content.
  await card(page, 'bb-01').click()
  await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText(
    'BB-01',
  )
  await expect(card(page, 'agg-03')).toHaveAttribute('data-hot', 'false')
  await expect(drawer(page).getByRole('button', { name: 'Focus' })).toHaveCount(
    0,
  )
  await drawer(page).getByRole('button', { name: 'Inspector' }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText('BB-01')
})

test('HI-09 Only nodes with problems hides every unmarked node and keeps the frames of AGGs with no BB; it never refits', async ({
  page,
}) => {
  await toHierarchy(page)
  const fit = await settledViewport(page)
  const before = await root(page).getAttribute('data-card-positions')
  await panel(page).getByLabel('Only nodes with problems').check()
  // The fixture's switches are clean: no node card is left. Every AGG has no BB,
  // so each frame stays, and so does the top.
  await expect(card(page, BUILDING_A)).toHaveCount(0)
  await expect(frame(page, 'agg-03+agg-08')).toBeVisible()
  await expect(frame(page, 'agg-15')).toBeVisible()
  await expect(card(page, 'agg-03')).toContainText('no BB')
  await expect(card(page, 'bb-01')).toBeVisible()
  expect(await viewport(page)).toBe(fit)
  expect(await root(page).getAttribute('data-card-positions')).not.toBe(before)
  await panel(page).getByLabel('Only nodes with problems').uncheck()
  await expect(card(page, BUILDING_A)).toBeVisible()
  expect(await root(page).getAttribute('data-card-positions')).toBe(before)
  expect(await viewport(page)).toBe(fit)
})

test('HI-09 the Expansion plan: EDGE-18 gives a dashed card and line under AGG-15; Installed does not', async ({
  page,
}) => {
  await toHierarchy(page)
  await expect(card(page, 'agg-15|node-building-a')).toHaveCount(0)
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await fitted(page)
  const proposed = card(page, 'agg-15|node-building-a')
  await expect(proposed).toBeVisible()
  await expect(proposed).toHaveAttribute('data-proposed', 'true')
  await expect(proposed).toContainText('Building A')
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-proposed', 'false')
  await expect(card(page, 'agg-15')).toHaveAttribute('data-proposed', 'false')
  await expect(
    page.locator(
      '.react-flow__edge.proposed [data-line="group:agg-15|node-building-a"]',
    ),
  ).toHaveCount(1)
  await expect(
    page.locator(
      `.react-flow__edge.proposed [data-line="group:${BUILDING_A}"]`,
    ),
  ).toHaveCount(0)
  const dash = await page
    .locator('.react-flow__edge.proposed')
    .first()
    .locator('path')
    .first()
    .evaluate((p) => getComputedStyle(p).strokeDasharray)
  expect(dash).not.toBe('none')
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await fitted(page)
  await expect(card(page, 'agg-15|node-building-a')).toHaveCount(0)
})

test('HI-09 the hierarchy names stay isolated and the state is readable from the page', async ({
  page,
}) => {
  await toHierarchy(page)
  await expect(card(page, BUILDING_A).locator('bdi').first()).toBeVisible()
  await expect(card(page, 'agg-03').locator('bdi').first()).toBeVisible()
  const state = await hierarchyState(page)
  expect(state.cards).toEqual([])
  expect(state.positions).toContain('agg-03')
})
