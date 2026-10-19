import { expect, test, type Page } from '@playwright/test'
import {
  expectCenteredInVisibleArea,
  expectInsideVisibleArea,
  expectMarks,
  fitted,
  selectEquipment,
  useDevices,
} from './helpers'

const units = (page: Page) => page.getByTestId('inspector-unit')
const filter = (page: Page, name: 'Cabled' | 'Free' | 'All') =>
  page
    .getByRole('group', { name: 'Show endpoints' })
    .getByRole('button', { name, exact: true })
const unit = (page: Page, key: string) =>
  page.locator(`[data-testid="inspector-unit"][data-unit="${key}"]`)
const portsTab = (page: Page) =>
  page.getByRole('tab', { name: /^(Ports|Positions)$/ })

/** Choose equipment through Explore, which opens Focus and the inspector on it. */
async function inspect(page: Page, card: string) {
  await selectEquipment(page, card.toUpperCase())
}

/** Select an equipment from its overview node card, which opens the inspector and leaves the overview. */
async function inspectOnOverview(page: Page, nodeId: string, name: string) {
  const node = page.locator(`[data-node-id="${nodeId}"]`)
  await node.locator('.overview-card-head').click()
  await node.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText(name)
}

test('POL-09 HDF-01 lists its 4 cabled positions by default, grouped by subpanel, with far ends, cable IDs and networks', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'hdf-01')

  // Header.
  await expect(page.locator('.inspector-header')).toContainText('Installed')
  await expect(
    page.locator('.inspector-header').getByText('4 of 96 cabled'),
  ).toBeVisible()
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'Main Campus › North Sub-main › Rack SM01 › HDF-01',
  )

  // More than 48 positions: Cabled is the default, and only the 4 cabled ones show.
  await portsTab(page).click()
  await expect(filter(page, 'Cabled')).toHaveAttribute('aria-pressed', 'true')
  await expect(units(page)).toHaveCount(4)
  const keys = await units(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-unit')),
  )
  expect(keys).toEqual(['1A/2', '2D/4', '3C/2', '3C/5'])
  // Grouped by subpanel, in row-then-column order.
  await expect(page.locator('.port-group')).toHaveText([
    'Subpanel 1A 1',
    'Subpanel 2D 1',
    'Subpanel 3C 2',
  ])

  // Each cabled side: far end, cable ID and circuit network.
  const p35 = unit(page, '3C/5')
  const side = (u: ReturnType<typeof unit>, col: string, s: string) =>
    u.locator(`.${col} [data-side="${s}"]`)
  await expect(side(p35, 'col-far', 'front')).toContainText('→ HDF-02 · 2B/3')
  await expect(side(p35, 'col-cable', 'front')).toHaveText('cable-a03')
  await expect(side(p35, 'col-network', 'front')).toHaveText('Network A')
  await expect(side(p35, 'col-far', 'rear')).toContainText('→ PANEL-A · 1')
  await expect(side(p35, 'col-cable', 'rear')).toHaveText('cable-a02')
  // Network B's circuit on the same subpanel is told apart.
  const b = unit(page, '3C/2')
  await expect(side(b, 'col-network', 'front')).toHaveText('Network B')
  await expect(side(b, 'col-cable', 'front')).toHaveText('cable-b03')
  await expect(side(b, 'col-cable', 'rear')).toHaveText('cable-b02')
  await expect(side(b, 'col-far', 'rear')).toContainText('→ PANEL-DR · 1')

  // Subpanel group rows collapse and expand.
  const group = page.locator('.port-group').filter({ hasText: 'Subpanel 1A' })
  await group.getByRole('button').click()
  await expect(group.getByRole('button')).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(unit(page, '1A/2')).toHaveCount(0)
  await group.getByRole('button').click()
  await expect(unit(page, '1A/2')).toBeVisible()

  // All shows the rest (96 positions in 16 subpanels).
  await filter(page, 'All').click()
  await expect(units(page)).toHaveCount(96)
  await expect(page.locator('.port-group')).toHaveCount(16)
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
    page.locator('.inspector-header').getByText('3 of 24 cabled'),
  ).toBeVisible()
  await portsTab(page).click()
  await expect(filter(page, 'All')).toHaveAttribute('aria-pressed', 'true')
  await expect(units(page)).toHaveCount(24)
  await filter(page, 'Cabled').click()
  await expect(units(page)).toHaveCount(3)
  await expect(unit(page, 'edge-17:p1')).toContainText('→ PANEL-A · 1')
  await expect(unit(page, 'edge-17:p1').locator('.col-cable')).toHaveText(
    'cable-a01',
  )
})

test('POL-10 Find AGG / BB from an inspector entry, and Show on map opens Focus', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'hdf-01')
  await portsTab(page).click()

  // Find AGG / BB from here starts at the front side of the position.
  await page
    .getByRole('button', { name: 'Find AGG / BB from here: HDF-01 3C / 5' })
    .click()
  const results = page.getByLabel('Map trace results')
  await expect(results.getByTestId('route-row')).toHaveCount(1)
  await expect(results.getByTestId('route-row')).toContainText('3C/5 front')
  await expect(results.getByTestId('route-row')).toContainText('AGG-03')

  // Show on map (header): Focus on this equipment, nothing highlighted, the route kept.
  await page.getByRole('button', { name: 'Show on map: HDF-01' }).click()
  const focus = page.locator('[data-view="focus"]')
  await expect(focus).toHaveAttribute('data-focus-id', 'hdf-01')
  await expect(
    focus.locator('[data-equipment-id="hdf-01"][data-side="center"]'),
  ).toHaveClass(/selected/)
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0)
  await expect(results.getByTestId('route-row')).toHaveCount(1)
})

// Retired with the device map (D35): Pin on map and the pins on the device card, and Show on map centering a card.
// Successor for the rest of this test: 'POL-10 Find AGG / BB from an inspector entry, and Show on map opens Focus' (above).
test('POL-10 Find AGG / BB, Pin and Show on map from an inspector entry, with pins showing on the card', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await useDevices(page)
  await page.getByTestId('rf__node-hdf-01').click()
  await expect(page.locator('.inspector-header h2')).toHaveText('HDF-01')
  await portsTab(page).click()

  // Find AGG / BB from here starts at the front side of the position.
  await page
    .getByRole('button', { name: 'Find AGG / BB from here: HDF-01 3C / 5' })
    .click()
  const results = page.getByLabel('Map trace results')
  await expect(results.getByTestId('route-row')).toHaveCount(1)
  await expect(results.getByTestId('route-row')).toContainText('3C/5 front')
  await expect(results.getByTestId('route-row')).toContainText('AGG-03')

  // Pin on map: the position shows on the card.
  const pin = (label: string, state: 'Pin' | 'Unpin' = 'Pin') =>
    page.getByRole('button', { name: `${state} on map: HDF-01 ${label}` })
  await pin('2D / 4').click()
  await expect(pin('2D / 4', 'Unpin')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(
    page
      .getByLabel('HDF-01 shown connections')
      .locator('li')
      .filter({ hasText: '2D / 4' }),
  ).toContainText('pinned')

  // Unpinning in the inspector removes it from the card again.
  await page.getByTestId('rf__node-hdf-01').click()
  await portsTab(page).click()
  await pin('2D / 4', 'Unpin').click()
  await expect(pin('2D / 4')).toHaveAttribute('aria-pressed', 'false')
  await pin('3C / 5').click()
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(
    page.getByLabel('HDF-01 shown connections').locator('li'),
  ).toHaveCount(1) // only the pinned 3C / 5 remains

  // Show on map (header): select the card and center it in the visible area, with no highlight.
  await page.getByRole('button', { name: 'Show on map: HDF-01' }).click()
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
  await inspectOnOverview(page, 'node-building-a', 'EDGE-17')
  const highlighted = () =>
    page
      .locator('[data-node-id][data-highlighted="true"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-node-id')))

  // Node and site highlight their node cards, and fit the view to them.
  await page
    .getByRole('button', { name: 'Highlight node Building A on the map' })
    .click()
  await expect.poll(highlighted).toEqual(['node-building-a'])
  await expectInsideVisibleArea(page, ['node-building-a'])
  await expect(
    page.getByRole('button', { name: 'Clear highlight' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Highlight site Main Campus on the map' })
    .click()
  await expect
    .poll(async () => (await highlighted()).sort())
    .toEqual([
      'node-building-a',
      'node-main-distribution',
      'node-north-sub-main',
    ])

  // The rack opens in Physical.
  await page.getByRole('button', { name: 'Open Rack A03 in Physical' }).click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-location',
    /rack:rack-a03/,
  )
  await expect(page.getByTestId('rack-slot-rack-a03-8')).toContainText(
    'EDGE-17',
  )
  await expect(page.getByTestId('rack-slot-rack-core-01-8')).toHaveCount(0) // only that rack

  // From Physical, a location link switches back to the map and highlights there.
  await page
    .getByRole('button', { name: 'Highlight node Building A on the map' })
    .click()
  await expect(page.locator('.flow-surface')).toBeVisible()
  await expect.poll(highlighted).toEqual(['node-building-a'])
})

// Retired with the device map (D35): the equipment and cable highlight, with its neighbors, on device cards.
// Successor: 'POL-11' above and CM-11 (e2e/overview-trace.spec.ts) for the node highlight.
test('POL-11 the location links highlight equipment and cables on the device map', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await useDevices(page)
  await page.getByTestId('rf__node-edge-17').click()
  await expect(page.locator('.inspector-header h2')).toHaveText('EDGE-17')

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
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-location',
    /rack:rack-a03/,
  )
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
    await portsTab(page).click()
    await expect(
      page.getByRole('button', { name: /^Find AGG \/ BB from here:/ }).first(),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Close Equipment inspector' })
      .click()
  }
})

test('POL-20 the inspector has Overview and Ports tabs, a compact port table, always-visible row actions and a sticky header', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'panel-a')

  // Tabs: Overview first, then Positions for a passive panel (Ports for a switch).
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveText(['Overview', 'Positions', 'History'])
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  const overview = page.getByRole('tabpanel')
  const overviewBadge = overview
    .getByTestId('network-count')
    .locator('.network-badge', { hasText: 'Network A' })
  const overviewColor = await overviewBadge.evaluate(
    (e) => (e.querySelector('.dot') as HTMLElement).style.backgroundColor,
  )
  await expect(overview).toContainText('Rack A03')
  await expect(overview).toContainText('U11')
  await expect(overview.getByTestId('network-count')).toHaveText([
    /Network A.*3 cabled/,
  ])

  // Positions: one compact row per position, front and rear as two lines in it.
  await portsTab(page).click()
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('columnheader')).toHaveText([
    'Position',
    'Far end',
    'Cable',
    'Network',
    '',
  ])
  await expect(units(page)).toHaveCount(24)
  const p1 = unit(page, '1')
  await expect(p1.locator('.col-far [data-side]')).toHaveCount(2)
  await expect(p1.locator('.col-cable [data-side]')).toHaveCount(2)

  // The table's network badge is colored like the same network's badge on the Overview tab.
  const tableBadge = p1.locator('.col-network .network-badge').first()
  await expect(tableBadge).toHaveText('Network A')
  expect(
    await tableBadge.evaluate(
      (e) => (e.querySelector('.dot') as HTMLElement).style.backgroundColor,
    ),
  ).toBe(overviewColor)

  // Row actions are always visible (no hover), small, with tooltips and names.
  const trace = p1.getByRole('button', {
    name: 'Find AGG / BB from here: PANEL-A 1',
  })
  const pin = p1.getByRole('button', { name: 'Pin on map: PANEL-A 1' })
  await expect(trace).toBeVisible()
  await expect(pin).toBeVisible()
  await expect(trace).toHaveAttribute('title', 'Find AGG / BB from here')
  await expect(pin).toHaveAttribute('title', 'Pin on map')
  expect((await pin.boundingBox())!.width).toBeLessThanOrEqual(28)

  // Clicking a row selects it.
  await p1.click({ position: { x: 4, y: 4 } })
  await expect(p1).toHaveAttribute('data-selected', 'true')
  await unit(page, '2').click({ position: { x: 4, y: 4 } })
  await expect(p1).not.toHaveAttribute('data-selected', 'true')

  // A switch port is a single compact line.
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await inspect(page, 'edge-17')
  await portsTab(page).click()
  expect((await unit(page, 'edge-17:p1').boundingBox())!.height).toBeLessThan(
    40,
  )

  // The header stays visible while a long table scrolls under it.
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await inspect(page, 'hdf-01')
  await portsTab(page).click()
  await filter(page, 'All').click()
  const content = page.locator('.studio-drawer .drawer-content')
  await content.evaluate((el) => (el.scrollTop = el.scrollHeight))
  const header = page.locator('.inspector-header')
  await expect(header).toBeInViewport()
  const top = (await content.boundingBox())!.y
  expect(Math.abs((await header.boundingBox())!.y - top)).toBeLessThanOrEqual(2)
  await expect(units(page).last()).toBeInViewport()
  await expect(
    header.getByRole('button', { name: 'Show on map: HDF-01' }),
  ).toBeVisible()
})

test('POL-21 the inspector has no trace form: one Find AGG / BB button, and its result still shows', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'edge-17')
  await expect(page.getByRole('combobox', { name: 'Trace mode' })).toHaveCount(
    0,
  )
  await expect(page.getByText('Pathfinding')).toHaveCount(0)
  const find = page.getByRole('button', { name: /Find AGG \/ BB/ })
  await expect(find).toHaveCount(1)
  await find.click()
  await expect(
    page.getByLabel('Map trace results').getByTestId('route-row'),
  ).toHaveCount(3)
  // The trace tools still have the form.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await expect(page.getByRole('combobox', { name: 'Trace mode' })).toBeVisible()
})

test('POL-20 the tabs follow the WAI-ARIA pattern: roving tabindex and arrow keys', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'edge-17')
  const overview = page.getByRole('tab', { name: 'Overview' })
  const ports = page.getByRole('tab', { name: 'Ports' })
  await expect(overview).toHaveAttribute('tabindex', '0')
  await expect(ports).toHaveAttribute('tabindex', '-1')
  await overview.focus()
  await page.keyboard.press('ArrowRight')
  await expect(ports).toBeFocused()
  await expect(ports).toHaveAttribute('aria-selected', 'true')
  await expect(ports).toHaveAttribute('tabindex', '0')
  await expect(overview).toHaveAttribute('tabindex', '-1')
  await expect(page.getByRole('tabpanel')).toContainText('24 of 24 ports')
  const history = page.getByRole('tab', { name: 'History' })
  await page.keyboard.press('ArrowRight') // History is the third tab
  await expect(history).toBeFocused()
  await expect(history).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight') // wraps around
  await expect(overview).toBeFocused()
  await expect(overview).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft') // and back
  await expect(history).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(ports).toBeFocused()
  await expect(ports).toHaveAttribute('aria-selected', 'true')
})

test('POL-35 Enter or Space on a focused node card opens it, and on a focused row selects it and opens the inspector, like a click', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(page.locator('.studio-drawer')).toHaveCount(0)
  const building = page.locator('[data-node-id="node-building-a"]')
  const head = building.locator('.overview-card-head')
  await head.focus()
  await page.keyboard.press('Enter')
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  const edge = building.getByRole('button', { name: /EDGE-17/ })
  await edge.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.inspector-header h2')).toHaveText('EDGE-17')
  // Space on another row replaces it, and does not scroll the page.
  const panel = building.getByRole('button', { name: /PANEL-A/ })
  await panel.focus()
  await page.keyboard.press('Space')
  await expect(page.locator('.inspector-header h2')).toHaveText('PANEL-A')
  // Space closes the card the same way it opened it.
  await head.focus()
  await page.keyboard.press('Space')
  await expect(head).toHaveAttribute('aria-expanded', 'false')
})
