import { expect, test, type Page } from '@playwright/test'
import type { Plan } from '../src/shared/types'
import { fitted, viewport, selectCard } from './helpers'

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
  await selectCard(page, 'edge-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from all ports of EDGE-17' })
    .click()
  await expect(rows(page)).toHaveCount(3)
}

test('C02 selecting AGG-03, AGG-08 then BB-01 changes the highlight in place', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(11)
  await fitted(page)
  const port = await viewport(page)
  const cards = await layout(page)
  await traceFromEdge17(page)

  const expected = [
    ['AGG-03', '3C / 5', ['1A / 2', '2D / 4']],
    ['AGG-08', '1A / 2', ['3C / 5', '2D / 4']],
    ['BB-01', '2D / 4', ['3C / 5', '1A / 2']],
  ] as const
  for (const [i, [destination, position, absent]] of expected.entries()) {
    await rows(page).nth(i).click()
    await expect(rows(page).nth(i)).toContainText(destination)
    await expect(rows(page).nth(i)).toHaveAttribute('aria-pressed', 'true')
    await expect(facets(page, 'HDF-01')).toHaveText([position])
    for (const other of absent)
      await expect(
        page.getByLabel('HDF-01 shown connections'),
      ).not.toContainText(other)
    await expect(page.locator('.react-flow__edge.animated')).toHaveCount(4)
    // All results stay listed; nothing moved; no refit.
    await expect(rows(page)).toHaveCount(3)
    expect(await layout(page)).toEqual(cards)
    expect(await viewport(page)).toBe(port)
  }
})

test('C04 the AGG-03 route reveals only 3C/5 and 2B/3 on the HDFs', async ({
  page,
}) => {
  await page.goto('/')
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
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(12)
  await selectCard(page, 'edge-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from all ports of EDGE-17' })
    .click()
  await rows(page).filter({ hasText: 'AGG-15' }).click()
  const hdfX = page.locator('.react-flow__node-equipment', { hasText: 'HDF-X' })
  await expect(hdfX.getByRole('heading', { name: 'HDF-X' })).toBeVisible()
  await expect(hdfX.locator('.map-facet-label')).toHaveText([
    '1A / 1',
    '1B / 1',
  ])
  await expect(hdfX.locator('.map-facet-label')).toHaveCount(2)
})

test('P18 a route through equipment the network filter hides is still found and shown', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(11)
  const all = await layout(page)
  await fitted(page)
  const port = await viewport(page)
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(5)
  await expect(page.getByTestId('rf__node-edge-17')).toHaveCount(0)

  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page
    .getByRole('combobox', { name: 'Start', exact: true })
    .selectOption({ label: 'EDGE-17 · all ports' })
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  // The backend result is complete even though EDGE-17 is not displayed.
  await expect(rows(page)).toHaveCount(3)
  // The route's hidden cards appear in place while it is selected.
  for (const id of ['edge-17', 'panel-a', 'agg-03'])
    await expect(page.getByTestId(`rf__node-${id}`)).toBeVisible()
  await expect(page.getByTestId('rf__node-agg-08')).toHaveCount(0)
  const shown = await layout(page)
  for (const [id, transform] of Object.entries(shown))
    expect(transform).toBe(all[id])
  expect(await viewport(page)).toBe(port)

  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(5)
  await expect(page.getByTestId('rf__node-edge-17')).toHaveCount(0)
  expect(await viewport(page)).toBe(port)
})

test('Clear trace removes the automatic facets and highlights only', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const port = await viewport(page)
  const cards = await layout(page)
  await traceFromEdge17(page)
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(page.getByLabel('Map trace results')).toHaveCount(0)
  await expect(page.locator('.map-facets')).toHaveCount(0)
  await expect(page.locator('.react-flow__edge.animated')).toHaveCount(0)
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(11)
  expect(await layout(page)).toEqual(cards)
  expect(await viewport(page)).toBe(port)
})

test('a clicked facet starts Find AGG / BB from that exact position', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
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
