import { expect, test, type Page } from '@playwright/test'
import {
  expectCenteredInVisibleArea,
  expectInsideVisibleArea,
  expectMarks,
  fitted,
} from './helpers'

const units = (page: Page) => page.getByTestId('inspector-unit')
const filter = (page: Page, name: 'Cabled' | 'Free' | 'All') =>
  page
    .getByRole('group', { name: 'Show endpoints' })
    .getByRole('button', { name, exact: true })
const unit = (page: Page, key: string) =>
  page.locator(`[data-testid="inspector-unit"][data-unit="${key}"]`)

async function inspect(page: Page, card: string) {
  await page.getByTestId(`rf__node-${card}`).click()
  await expect(page.locator('.inspector-hero h2')).toHaveText(
    card.toUpperCase(),
  )
}

test('POL-09 HDF-01 lists its 4 cabled positions by default, grouped by subpanel, with far ends, cable IDs and networks', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'hdf-01')

  // Header.
  await expect(page.locator('.inspector-hero')).toContainText(
    'Installed equipment',
  )
  await expect(
    page.locator('.studio-drawer').getByText('4 of 96 cabled'),
  ).toBeVisible()
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'Main Campus / North Sub-main / Rack SM01 / HDF-01',
  )

  // More than 48 positions: Cabled is the default, and only the 4 cabled ones show.
  await expect(filter(page, 'Cabled')).toHaveAttribute('aria-pressed', 'true')
  await expect(units(page)).toHaveCount(4)
  const keys = await units(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-unit')),
  )
  expect(keys).toEqual(['1A/2', '2D/4', '3C/2', '3C/5'])
  // Grouped by subpanel, in row-then-column order.
  await expect(page.locator('.endpoint-group summary')).toHaveText([
    'Subpanel 1A 1',
    'Subpanel 2D 1',
    'Subpanel 3C 2',
  ])

  // Each cabled side: far end, cable ID and circuit network.
  const p35 = unit(page, '3C/5')
  await expect(p35.locator('[data-side="front"]')).toContainText(
    '→ HDF-02 · 2B/3',
  )
  await expect(p35.locator('[data-side="front"] .cable-id')).toHaveText(
    'cable-a03',
  )
  await expect(p35.locator('[data-side="front"] .badge')).toHaveText(
    'Network A',
  )
  await expect(p35.locator('[data-side="rear"]')).toContainText('→ PANEL-A · 1')
  await expect(p35.locator('[data-side="rear"] .cable-id')).toHaveText(
    'cable-a02',
  )
  // Network B's circuit on the same subpanel is told apart.
  const b = unit(page, '3C/2')
  await expect(b.locator('[data-side="front"] .badge')).toHaveText('Network B')
  await expect(b.locator('[data-side="front"] .cable-id')).toHaveText(
    'cable-b03',
  )
  await expect(b.locator('[data-side="rear"] .cable-id')).toHaveText(
    'cable-b02',
  )
  await expect(b.locator('[data-side="rear"]')).toContainText('→ PANEL-DR · 1')

  // Subpanel groups collapse.
  const group = page
    .locator('.endpoint-group')
    .filter({ hasText: 'Subpanel 1A' })
  await group.locator('summary').click()
  await expect(group).not.toHaveAttribute('open', '')
  await group.locator('summary').click()
  await expect(group).toHaveAttribute('open', '')

  // All shows the rest (96 positions in 16 subpanels).
  await filter(page, 'All').click()
  await expect(units(page)).toHaveCount(96)
  await expect(page.locator('.endpoint-group')).toHaveCount(16)
  await filter(page, 'Free').click()
  await expect(units(page)).toHaveCount(92)
  await expect(unit(page, '4A/1')).toContainText('free')
  await filter(page, 'All').click()

  // Search: "3C/5" and "3C / 5" match the same single position.
  const search = page.getByLabel('Search endpoints')
  await search.fill('3C/5')
  await expect(units(page)).toHaveCount(1)
  await expect(unit(page, '3C/5')).toBeVisible()
  await search.fill('3C / 5')
  await expect(units(page)).toHaveCount(1)
  await expect(unit(page, '3C/5')).toBeVisible()
  await search.fill('3c')
  await expect(units(page)).toHaveCount(6) // 3C has six positions
  await filter(page, 'Cabled').click()
  await expect(units(page)).toHaveCount(2)
  await search.fill('zzz')
  await expect(page.getByText('Nothing matches.')).toBeVisible()

  // A switch with 24 ports defaults to All.
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await inspect(page, 'edge-17')
  await expect(
    page.locator('.studio-drawer').getByText('3 of 24 cabled'),
  ).toBeVisible()
  await expect(filter(page, 'All')).toHaveAttribute('aria-pressed', 'true')
  await expect(units(page)).toHaveCount(24)
  await filter(page, 'Cabled').click()
  await expect(units(page)).toHaveCount(3)
  await expect(unit(page, 'edge-17:p1')).toContainText('→ PANEL-A · 1')
  await expect(unit(page, 'edge-17:p1').locator('.cable-id')).toHaveText(
    'cable-a01',
  )
})

test('POL-10 Find AGG / BB, Pin and Show on map from an inspector entry, with pins in sync with the card popover', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'hdf-01')

  // Find AGG / BB from here starts at the front side of the position.
  await page
    .getByRole('button', { name: 'Find AGG / BB from here: HDF-01 3C / 5' })
    .click()
  const results = page.getByLabel('Map trace results')
  await expect(results.getByTestId('route-row')).toHaveCount(1)
  await expect(results.getByTestId('route-row')).toContainText('3C/5 front')
  await expect(results.getByTestId('route-row')).toContainText('AGG-03')

  // Pin on map: the same manual facet as Show connections.
  const pin = page.getByRole('button', {
    name: /^(Pin|Unpin) on map: HDF-01 2D \/ 4$/,
  })
  await expect(pin).toHaveText('Pin on map')
  await pin.click()
  await expect(pin).toHaveText('Pinned')
  await expect(pin).toHaveAttribute('aria-pressed', 'true')

  // …so the card's popover shows it ticked (the card sits under the inspector, so close it first).
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(
    page
      .getByLabel('HDF-01 shown connections')
      .locator('li')
      .filter({ hasText: '2D / 4' }),
  ).toContainText('pinned')
  await page.getByRole('button', { name: 'Show connections of HDF-01' }).click()
  const popover = page.getByLabel('HDF-01 connections', { exact: true })
  await expect(
    popover.locator('li').filter({ hasText: '2D / 4' }).getByRole('checkbox'),
  ).toBeChecked()

  // And the other way round: unpinning in the popover un-pins it in the inspector.
  await popover
    .locator('li')
    .filter({ hasText: '3C / 5' })
    .getByRole('checkbox')
    .check()
  await popover
    .locator('li')
    .filter({ hasText: '2D / 4' })
    .getByRole('checkbox')
    .uncheck()
  await page.getByRole('button', { name: 'Show connections of HDF-01' }).click()
  await page
    .getByRole('button', { name: 'Open inspector', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: /^(Pin|Unpin) on map: HDF-01 2D \/ 4$/ }),
  ).toHaveText('Pin on map')
  await expect(
    page
      .getByRole('button', { name: /^(Pin|Unpin) on map: HDF-01 3C \/ 5$/ })
      .first(),
  ).toHaveText('Pinned')
  // …and pinning from the inspector again shows in the popover with no route involved.
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(
    page.getByLabel('HDF-01 shown connections').locator('li'),
  ).toHaveCount(1) // only the pinned 3C / 5 remains

  // Show on map: select the card and center it in the visible area, with no highlight.
  await page.getByRole('button', { name: 'Show on map: HDF-01 3C / 5' }).click()
  await expectMarks(page, { highlightCards: [], dimmedCards: [] })
  await expect(
    page.getByTestId('rf__node-hdf-01').locator('.equipment-card'),
  ).toHaveClass(/selected/)
  await expectCenteredInVisibleArea(page, 'hdf-01')
})

test('POL-11 the location links highlight the site or node on the map, and the rack opens in Physical', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'edge-17')

  // Node and site highlight their equipment and cables, and fit the view to them.
  await page
    .getByRole('button', { name: 'Highlight node Building A on the map' })
    .click()
  await expectMarks(page, {
    highlightCards: ['edge-17', 'panel-a'],
    highlightNeighbors: ['hdf-01'],
  })
  await expectInsideVisibleArea(page, ['edge-17', 'panel-a', 'hdf-01'])
  await expect(
    page.getByRole('button', { name: 'Clear highlight' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Highlight site Main Campus on the map' })
    .click()
  await expectMarks(page, {
    highlightCards: [
      'agg-03',
      'agg-08',
      'agg-15',
      'bb-01',
      'edge-17',
      'hdf-01',
      'hdf-02',
      'panel-a',
    ],
    highlightNeighbors: ['agg-12', 'panel-dr'],
  })

  // The rack opens in Physical.
  await page.getByRole('button', { name: 'Open Rack A03 in Physical' }).click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await expect(page.locator('h1')).toHaveText('Rack A03')
  await expect(page.getByTestId('rack-slot-rack-a03-8')).toContainText(
    'EDGE-17',
  )
  await expect(page.getByTestId('rack-slot-rack-core-01-8')).toHaveCount(0) // only that rack

  // From Physical, a location link switches back to the map and highlights there.
  await page
    .getByRole('button', { name: 'Highlight node Building A on the map' })
    .click()
  await expect(page.locator('.flow-surface')).toBeVisible()
  await expectMarks(page, { highlightCards: ['edge-17', 'panel-a'] })
})

test('whole-device Find AGG / BB is offered for switches only', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const device = (name: string) =>
    page.getByRole('button', {
      name: `Find AGG / BB from ${name}`,
      exact: true,
    })
  await inspect(page, 'edge-17')
  await expect(device('EDGE-17')).toBeVisible()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  for (const card of ['panel-a', 'hdf-01']) {
    await inspect(page, card)
    await expect(device(card.toUpperCase())).toHaveCount(0)
    // Positions can still start a search from one exact endpoint.
    await expect(
      page.getByRole('button', { name: /^Find AGG \/ BB from here:/ }).first(),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Close Equipment inspector' })
      .click()
  }
})
