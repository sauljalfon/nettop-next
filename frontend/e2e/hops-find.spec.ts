import { expect, test, type Page } from '@playwright/test'
import {
  expectCenteredInVisibleArea,
  fitted,
  layout,
  settledViewport,
  viewport,
  expandResults,
} from './helpers'

const cards = (page: Page) => page.locator('.react-flow__node-equipment')
const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')
const scaleOf = (style: string | null) =>
  Number(/scale\(([\d.]+)\)/.exec(style ?? '')?.[1])

async function traceFromEdge17(page: Page) {
  await page.getByTestId('rf__node-edge-17').click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(rows(page)).toHaveCount(3)
}

async function hopTexts(rows: import('@playwright/test').Locator) {
  return rows.evaluateAll((els) =>
    els.map((el) => ({
      title: el.querySelector('small')!.textContent,
      label: el.querySelector('span')!.textContent,
      link: el.querySelector('em')?.textContent ?? null,
    })),
  )
}

test('POL-04 the map overlay lists the same hop rows in Physical, in order', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)

  // Only the selected route is expanded: START plus seven hops for AGG-03.
  const hops = page.getByTestId('map-hop-row')
  await expect(hops).toHaveCount(8)
  const onMap = await hops.evaluateAll((els) =>
    els.map((el) => ({
      title: el.querySelector('small')!.textContent,
      label: el.querySelector('span')!.textContent,
      link: el.querySelector('em')?.textContent ?? null,
    })),
  )
  expect(onMap[0]).toEqual({
    title: 'START',
    label: 'EDGE-17 · Port 1',
    link: null,
  })
  expect(onMap.slice(1).map((r) => r.title)).toEqual([
    '1 · CABLE',
    '2 · PANEL BRIDGE',
    '3 · CABLE',
    '4 · PANEL BRIDGE',
    '5 · CABLE',
    '6 · PANEL BRIDGE',
    '7 · CABLE',
  ])
  // Cables carry their IDs; the start and panel bridges are told apart by kind.
  expect(
    onMap.filter((_, i) => [1, 3, 5, 7].includes(i)).map((r) => r.link),
  ).toEqual(['cable-a01', 'cable-a02', 'cable-a03', 'cable-a04'])
  expect(
    onMap.filter((_, i) => [2, 4, 6].includes(i)).every((r) => r.link),
  ).toBe(true)

  // Selecting another route moves the expansion; the others stay collapsed.
  await rows(page).nth(1).click()
  await expect(hops).toHaveCount(8)
  await expect(hops.nth(1)).toContainText('cable-a05')

  // The Physical view uses the same overlay and shows the same rows.
  await rows(page).nth(0).click()
  const mapRows = await hopTexts(hops)
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expandResults(page)
  expect(await hopTexts(page.getByTestId('map-hop-row'))).toEqual(mapRows)
  // Without the route view toggle or export, which belong to the map.
  await expect(page.getByRole('button', { name: 'Route view' })).toHaveCount(0)
})

test('POL-05 clicking a hop selects its equipment and centers without changing zoom', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  const before = await viewport(page)
  const positions = await layout(page)

  await page
    .getByTestId('map-hop-row')
    .filter({ hasText: 'HDF-02 · 2B/3 front' })
    .click()
  await expect(page.locator('.inspector-header h2')).toHaveText('HDF-02')
  await expectCenteredInVisibleArea(page, 'hdf-02')
  const after = await settledViewport(page)
  expect(scaleOf(after)).toBeCloseTo(scaleOf(before), 3)
  expect(after).not.toBe(before) // panned, not refit
  // Panning hides cards that scroll offscreen; every card still drawn is where it was.
  const afterLayout = await layout(page)
  for (const [id, transform] of Object.entries(afterLayout))
    expect(transform).toBe(positions[id])

  // The new viewport is recorded in the session: it survives a context switch.
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await expect(page.locator('.board-caption')).toContainText('12 of 12') // the plan's EDGE-18 too; it may be offscreen after the pan
  expect(await settledViewport(page)).toBe(after)
})

test('there is exactly one search field labelled "Find equipment" in the whole app', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  for (const opener of [
    'Add equipment library',
    'Open explorer',
    'Open trace tools',
    'Open inspector',
  ]) {
    const toggle = page.getByRole('button', { name: opener, exact: true })
    await toggle.click()
    const total =
      (await page.getByLabel('Find equipment').count()) +
      (await page.getByPlaceholder('Find equipment…').count())
    expect(total).toBe(opener === 'Open explorer' ? 2 : 0) // one field: its label and its placeholder
    expect(await page.getByLabel('Find equipment').count()).toBe(
      opener === 'Open explorer' ? 1 : 0,
    )
    await toggle.click()
  }
  await expect(page.getByLabel('Find on map')).toHaveCount(0)
})

test('Explore hides sites, nodes and racks without a match while the search has text', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await expect(page.locator('.explorer-site')).toHaveCount(3)
  await expect(page.locator('.tree-rack')).toHaveCount(8) // 7 acceptance racks and the Annex's empty 42U rack

  const search = page.getByLabel('Find equipment')
  await search.fill('edge-17')
  await expect(page.locator('.explorer-site')).toHaveCount(1)
  await expect(page.locator('.explorer-node')).toHaveCount(1)
  await expect(page.locator('.tree-rack')).toHaveCount(1)
  await expect(page.locator('.tree-equipment')).toHaveText(['EDGE-17U8'])
  await expect(page.locator('.studio-drawer').getByText('DR Site')).toHaveCount(
    0,
  )

  await search.fill('agg')
  await expect(page.locator('.explorer-site')).toHaveCount(2)
  await expect(page.locator('.tree-rack')).toHaveCount(3) // Core 01, Core 02 and DR02, not Core 03
  await expect(
    page.locator('.studio-drawer').getByText('Rack Core 03'),
  ).toHaveCount(0)

  await search.fill('zzz')
  await expect(page.locator('.explorer-site')).toHaveCount(0)
  await expect(page.getByText('No equipment matches.')).toBeVisible()

  await search.fill('')
  await expect(page.locator('.explorer-site')).toHaveCount(3)
  await expect(page.locator('.tree-rack')).toHaveCount(8)
})
