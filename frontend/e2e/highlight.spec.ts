import { expect, test, type Page } from '@playwright/test'
import {
  expectInsideVisibleArea,
  expectMarks,
  fitted,
  highlightLocation,
  layout,
  openExplore,
  settledViewport,
  useDevices,
  viewport,
} from './helpers'

const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')
const caption = (page: Page) => page.locator('.board-caption')
const clear = (page: Page) =>
  page.getByRole('button', { name: 'Clear highlight' })
const BUILDING_A = {
  highlightCards: ['edge-17', 'panel-a'],
  highlightNeighbors: ['hdf-01'],
  highlightLinks: [
    'cable-a01',
    'cable-a02',
    'cable-a05',
    'cable-a06',
    'cable-a09',
    'cable-a10',
  ],
}

async function traceFromEdge17(page: Page) {
  await page.getByTestId('rf__node-edge-17').click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(rows(page)).toHaveCount(3)
}

// Retired with the device map (D35): the equipment, neighbor and cable highlight on device cards. Successor: CM-11 (e2e/overview-trace.spec.ts), the node highlight on the overview.
test('POL-14 clicking "Building A" in Explore highlights its equipment and cables, marks the neighbor, dims the rest and fits them in view', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await useDevices(page)
  await expect(caption(page)).toContainText('11 of 11')
  const positions = await layout(page)
  const before = await viewport(page)
  await expect(clear(page)).toHaveCount(0)

  await highlightLocation(page, 'Building A')

  // What the projection highlights, whatever is on screen.
  await expectMarks(page, {
    ...BUILDING_A,
    dimmedCards: [
      'agg-03',
      'agg-08',
      'agg-12',
      'agg-15',
      'bb-01',
      'edge-22',
      'hdf-02',
      'panel-dr',
    ],
  })
  // The highlighted cards and the neighbor are fitted into what is visible (Explore stays open on the left).
  const after = await settledViewport(page)
  expect(after).not.toBe(before)
  await expectInsideVisibleArea(page, ['edge-17', 'panel-a', 'hdf-01'])
  // How they are drawn: amber, the neighbor lighter, everything else faded.
  await expect(page.locator('.equipment-card.hl')).toHaveCount(2)
  await expect(page.locator('.equipment-card.hl-neighbor')).toHaveCount(1)
  await expect(
    page.getByTestId('rf__node-hdf-01').locator('.equipment-card'),
  ).toHaveClass(/hl-neighbor/)
  const opacity = (id: string) =>
    page
      .getByTestId(`rf__node-${id}`)
      .locator('.equipment-card')
      .evaluate((el) => getComputedStyle(el).opacity)
  expect(await opacity('edge-22')).toBe('0.3')
  expect(await opacity('edge-17')).toBe('1')
  expect(await opacity('hdf-01')).toBe('1')
  // The amber lines are the ones leaving Building A; others fade.
  await expect(page.locator('.react-flow__edge.hl')).not.toHaveCount(0)
  const amber = await page
    .locator('.react-flow__edge.hl path.react-flow__edge-path')
    .first()
    .evaluate((p) => getComputedStyle(p).stroke)
  expect(amber).toBe('rgb(217, 154, 11)')
  // Every card is still where it was.
  for (const [id, transform] of Object.entries(await layout(page)))
    expect(transform).toBe(positions[id])
  await expect(clear(page)).toBeVisible()
})

// Retired with the device map (D35): the equipment, neighbor and cable highlight on device cards. Successor: CM-11 (e2e/overview-trace.spec.ts), the node highlight on the overview.
test('POL-14 another location replaces the highlight; a site covers its nodes; Clear highlight and Esc clear it', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await useDevices(page)
  await highlightLocation(page, 'Building A')
  await expectMarks(page, BUILDING_A)

  await highlightLocation(page, 'Main Distribution')
  await expectMarks(page, {
    highlightCards: ['agg-03', 'agg-08', 'agg-15', 'bb-01', 'hdf-02'],
    highlightNeighbors: ['agg-12', 'hdf-01'],
  })
  await highlightLocation(page, 'Main Campus')
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
    dimmedCards: ['edge-22'],
  })

  await clear(page).click()
  await expectMarks(page, {
    highlightCards: [],
    highlightNeighbors: [],
    highlightLinks: [],
    dimmedCards: [],
  })
  await expect(clear(page)).toHaveCount(0)

  // Esc, outside a text field.
  await highlightLocation(page, 'Building A')
  await expectMarks(page, BUILDING_A)
  await page.getByRole('button', { name: 'Reset layout' }).focus()
  await page.keyboard.press('Escape')
  await expectMarks(page, { highlightCards: [], dimmedCards: [] })
})

// Retired with the device map (D35): the equipment, neighbor and cable highlight on device cards. Successor: CM-11 (e2e/overview-trace.spec.ts), the node highlight on the overview.
test('Esc does not clear the highlight while a text field has focus', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await useDevices(page)
  await highlightLocation(page, 'Building A')
  await expectMarks(page, BUILDING_A)
  const search = page.getByLabel('Find equipment')
  await search.focus()
  await search.press('Escape')
  await expectMarks(page, BUILDING_A)
  await page.getByRole('button', { name: 'Reset layout' }).focus()
  await page.keyboard.press('Escape')
  await expectMarks(page, { highlightCards: [] })
})

test('POL-15 equipment in Explore is selected, opens the inspector and Focus on it, with no highlight', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openExplore(page)
  await page.locator('.tree-equipment').filter({ hasText: 'AGG-08' }).click()

  await expect(page.locator('.inspector-header h2')).toHaveText('AGG-08')
  const focus = page.locator('[data-view="focus"]')
  await expect(focus).toHaveAttribute('data-focus-id', 'agg-08')
  await expect(
    focus.locator('[data-equipment-id="agg-08"][data-side="center"]'),
  ).toHaveClass(/selected/)
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0)
  await expect(clear(page)).toHaveCount(0)
  await expect(page.locator('.focus-card.dimmed')).toHaveCount(0)

  // Enter in the search chooses the first match the same way.
  await openExplore(page)
  const search = page.getByLabel('Find equipment')
  await search.fill('bb')
  await search.press('Enter')
  await expect(page.locator('.inspector-header h2')).toHaveText('BB-01')
  await expect(focus).toHaveAttribute('data-focus-id', 'bb-01')
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0)

  // In Physical, Explore follows the view: equipment opens its rack there, and
  // neither the map nor the inspector is touched.
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await openExplore(page)
  await page.locator('.tree-equipment').filter({ hasText: 'EDGE-22' }).click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-location',
    /rack:rack-dr01/,
  )
  await expect(page.getByLabel('Equipment inspector')).toHaveCount(0)
})

// Retired with the device map (D35): the equipment, neighbor and cable highlight on device cards. Successor: CM-11 (e2e/overview-trace.spec.ts), the node highlight on the overview.
test('POL-16 highlight, route and network filter combine and clear independently', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await useDevices(page)
  const positions = await layout(page)

  // The network filter hides Network A; the highlighted part is shown anyway.
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  await expect(caption(page)).toContainText('5 of 11')
  await highlightLocation(page, 'Building A')
  await expectMarks(page, BUILDING_A)
  await expect(caption(page)).toContainText('7 of 11') // + EDGE-17, PANEL-A (HDF-01 is Network B's too)
  await expectMarks(page, {
    cards: [
      'agg-12',
      'edge-17',
      'edge-22',
      'hdf-01',
      'hdf-02',
      'panel-a',
      'panel-dr',
    ],
    dimmedCards: ['agg-12', 'edge-22', 'hdf-02', 'panel-dr'],
  })

  // A route outside the highlight is teal and never dimmed, whatever the filter says.
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click() // close Explore
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/'))
      requests.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  await traceFromEdge17(page)
  await expectMarks(page, {
    routeLinks: ['cable-a01', 'cable-a02', 'cable-a03', 'cable-a04'],
    routeCards: ['agg-03', 'edge-17', 'hdf-01', 'hdf-02', 'panel-a'],
  })
  // AGG-03 is Network A and far from Building A: shown for the route, not dimmed.
  await expectMarks(page, {
    cards: [
      'agg-03',
      'agg-12',
      'edge-17',
      'edge-22',
      'hdf-01',
      'hdf-02',
      'panel-a',
      'panel-dr',
    ],
    dimmedCards: ['agg-12', 'edge-22', 'panel-dr'],
  })
  // Only traces went to the backend: the uplinks summary of EDGE-17's inspector, then the
  // user's trace. No extra data was loaded for those cards.
  expect(requests).toEqual(['POST /api/traces', 'POST /api/traces'])
  // Cable a01 is on the route and highlighted: teal, with the amber outline beneath.
  const colors = await page.evaluate(() => {
    const edge = document.querySelector('.react-flow__edge.hl.animated')
    return (
      edge && {
        main: getComputedStyle(
          edge.querySelector('path.react-flow__edge-path')!,
        ).stroke,
        outline: getComputedStyle(edge.querySelector('path.hl-outline')!)
          .stroke,
      }
    )
  })
  expect(colors).toEqual({
    main: 'rgb(15, 139, 122)',
    outline: 'rgb(242, 177, 52)',
  })

  // Clearing the highlight leaves route and filter alone…
  await clear(page).click()
  await expectMarks(page, {
    highlightCards: [],
    dimmedCards: [],
    routeLinks: ['cable-a01', 'cable-a02', 'cable-a03', 'cable-a04'],
  })
  await expect(rows(page)).toHaveCount(3)
  await expect(
    page.getByRole('combobox', { name: 'Show network' }),
  ).toHaveValue('net-b')

  // …and clearing the route leaves the highlight and the filter alone.
  await highlightLocation(page, 'Building A')
  await expectMarks(page, BUILDING_A)
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expectMarks(page, { routeLinks: [], routeCards: [], ...BUILDING_A })
  await expect(
    page.getByRole('combobox', { name: 'Show network' }),
  ).toHaveValue('net-b')

  // Clearing the filter leaves the highlight; clearing the highlight then restores the full map.
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'All networks' })
  await expectMarks(page, BUILDING_A)
  await expect(caption(page)).toContainText('11 of 11')
  await clear(page).click()
  await expectMarks(page, { highlightCards: [], dimmedCards: [] })
  // Nothing was ever moved by any of it (some cards are offscreen after the fit, so compare what is drawn).
  for (const [id, transform] of Object.entries(await layout(page)))
    expect(transform).toBe(positions[id])
})
