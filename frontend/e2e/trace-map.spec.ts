import { expect, test, type Page } from '@playwright/test'
import type { Plan } from '../src/shared/types'
import { expectMarks, fitted, pick, useDevices, viewport } from './helpers'

/** Every card's transform, keyed by equipment ID. */
const layout = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.react-flow__node-equipment')].map((n) => [
        n.getAttribute('data-id'),
        (n as HTMLElement).style.transform,
      ]),
    ),
  )
const facets = (page: Page, name: string) =>
  page.getByLabel(`${name} shown connections`).locator('.map-facet-label')
const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')

async function traceFromEdge17(page: Page) {
  await page.getByTestId('rf__node-edge-17').click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(rows(page)).toHaveCount(3)
}

// Retired with the device map (D35): route facets and marks on device cards. Successor: CM-11 "the route lights its node cards and lines in place; choosing another route moves nothing" (e2e/overview-trace.spec.ts).

test('C02 selecting AGG-03, AGG-08 then BB-01 changes the highlight in place', async ({
  page,
}) => {
  await page.goto('/')
  await useDevices(page)
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(11)
  await fitted(page)
  const port = await viewport(page)
  const cards = await layout(page)
  await traceFromEdge17(page)

  const expected = [
    ['AGG-03', '3C / 5', ['1A / 2', '2D / 4'], ['a01', 'a02', 'a03', 'a04']],
    ['AGG-08', '1A / 2', ['3C / 5', '2D / 4'], ['a05', 'a06', 'a07', 'a08']],
    ['BB-01', '2D / 4', ['3C / 5', '1A / 2'], ['a09', 'a10', 'a11', 'a12']],
  ] as const
  for (const [
    i,
    [destination, position, absent, cables],
  ] of expected.entries()) {
    await rows(page).nth(i).click()
    await expect(rows(page).nth(i)).toContainText(destination)
    await expect(rows(page).nth(i)).toHaveAttribute('aria-pressed', 'true')
    await expect(facets(page, 'HDF-01')).toHaveText([position])
    for (const other of absent)
      await expect(
        page.getByLabel('HDF-01 shown connections'),
      ).not.toContainText(other)
    // The route's cables as the projection has them, not as many lines as are on screen.
    await expectMarks(page, { routeLinks: cables.map((c) => `cable-${c}`) })
    // All results stay listed; nothing moved; no refit.
    await expect(rows(page)).toHaveCount(3)
    expect(await layout(page)).toEqual(cards)
    expect(await viewport(page)).toBe(port)
  }
})

// Retired with the device map (D35): automatic facets on the HDF cards. No successor: an HDF is not expanded on the map; the route's positions are in the walk sheet (WS-01).

test('C04 the AGG-03 route reveals only 3C/5 and 2B/3 on the HDFs', async ({
  page,
}) => {
  await page.goto('/')
  await useDevices(page)
  await traceFromEdge17(page)
  await expect(facets(page, 'HDF-01')).toHaveText(['3C / 5'])
  await expect(facets(page, 'HDF-02')).toHaveText(['2B / 3'])
  await expect(facets(page, 'PANEL-A')).toHaveText(['1'])
  // Only the five cards on the route reveal anything; every other position stays hidden.
  await expect(page.locator('.map-facets')).toHaveCount(5)
  await expect(page.getByLabel('HDF-01 shown connections')).not.toContainText(
    '3C / 2',
  )
  await expect(page.getByTestId('rf__node-hdf-01')).toContainText('HDF-01')
})

// Retired with the device map (D35): several positions of one HDF as facets under one parent. No successor: same reason as C04.

test('C06 a route through several positions of one HDF shows each under the same parent', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/plans', {
    data: { name: 'Two positions', expectedBaseRevision: 'acceptance-1' },
  })
  let plan = (await created.json()) as Plan
  const send = async (data: object) => {
    const response = await request.post(`/api/plans/${plan.id}/commands`, {
      data,
    })
    expect(response.status(), await response.text()).toBe(200)
    plan = (await response.json()) as Plan
  }
  await send({
    type: 'add_hdf',
    expectedRevision: plan.revision,
    hdf: { name: 'HDF-X', rackId: 'rack-sm01', unit: 8, height: 3, rows: 1 },
  })
  const side = (column: string, position: number, s: 'front' | 'rear') => {
    const sub = plan.subpanels!.find((x) => x.row === 1 && x.column === column)!
    return plan.endpoints.find(
      (e) => e.subpanelId === sub.id && e.position === position && e.side === s,
    )!.id
  }
  for (const [a, b] of [
    ['edge-17:p5', side('A', 1, 'front')],
    // Out through the HDF and back in at a different position via PANEL-A 10.
    [side('A', 1, 'rear'), 'panel-a:10:f'],
    ['panel-a:10:r', side('B', 1, 'rear')],
    [side('B', 1, 'front'), 'agg-15:p1'],
  ])
    await send({
      type: 'add_cable',
      expectedRevision: plan.revision,
      cable: { a, b },
    })

  await page.goto(`/?plan=${plan.id}`)
  await useDevices(page)
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(12)
  await page.getByTestId('rf__node-edge-17').click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await rows(page).filter({ hasText: 'AGG-15' }).click()
  const hdfX = page.locator('.react-flow__node-equipment', { hasText: 'HDF-X' })
  await expect(hdfX.getByRole('heading', { name: 'HDF-X' })).toBeVisible()
  await expect(hdfX.locator('.map-facet-label')).toHaveText([
    '1A / 1',
    '1B / 1',
  ])
  await expect(hdfX.locator('.map-facet-label')).toHaveCount(2)
})

// The trace from the Trace tools, so the overview stays the view.
async function traceFromTools(page: Page) {
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await pick(page, 'Start', 'edge-17 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}
const overview = (page: Page) => page.locator('[data-view="overview"]')
const positions = (page: Page) =>
  overview(page).getAttribute('data-node-positions')

test('P18 a route through equipment the network filter dims is still found and shown', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const all = await positions(page)
  const port = await viewport(page)
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  // Building A is Network A only: dimmed by the filter.
  const building = page.locator('[data-node-id="node-building-a"]')
  await expect(building).toHaveClass(/dimmed/)

  await traceFromTools(page)
  // The backend result is complete even though Building A is dimmed.
  await expect(rows(page)).toHaveCount(3)
  // The route's nodes are lit in place and no longer dimmed.
  for (const id of [
    'node-building-a',
    'node-north-sub-main',
    'node-main-distribution',
  ]) {
    const node = page.locator(`[data-node-id="${id}"]`)
    await expect(node).toHaveAttribute('data-on-route', 'true')
    await expect(node).not.toHaveClass(/dimmed/)
  }
  expect(await positions(page)).toBe(all)
  expect(await viewport(page)).toBe(port)

  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(building).toHaveClass(/dimmed/)
  await expect(building).toHaveAttribute('data-on-route', 'false')
  expect(await positions(page)).toBe(all)
  expect(await viewport(page)).toBe(port)
})

test('Clear trace removes the route marks only', async ({ page }) => {
  await page.goto('/')
  await fitted(page)
  const port = await viewport(page)
  const all = await positions(page)
  await traceFromTools(page)
  await expect(
    overview(page).locator('[data-on-route="true"]'),
  ).not.toHaveCount(0)
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(page.getByLabel('Map trace results')).toHaveCount(0)
  await expect(overview(page).locator('[data-on-route="true"]')).toHaveCount(0)
  await expectMarks(page, { routeLinks: [] })
  expect(await positions(page)).toBe(all)
  expect(await viewport(page)).toBe(port)
})

// Retired with the device map (D35): a facet button starting Find AGG / BB. Successor: Find AGG / BB from a Focus line's circuit panel (CM-10) and from the inspector (POL-10).

test('a clicked facet starts Find AGG / BB from that exact position', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await useDevices(page)
  const port = await viewport(page)
  await traceFromEdge17(page)
  const cards = await layout(page)
  await page
    .getByRole('button', {
      name: 'HDF-02 2B / 3, find AGG / BB from here',
    })
    .click()
  await expect(rows(page)).toContainText(['AGG-03'])
  await expect(rows(page)).toHaveCount(1)
  await expect(facets(page, 'HDF-02')).toHaveText(['2B / 3'])
  expect(await layout(page)).toEqual(cards)
  expect(await viewport(page)).toBe(port)
})
