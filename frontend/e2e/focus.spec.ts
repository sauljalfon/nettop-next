import { expect, test, type Page } from '@playwright/test'
import { fitted, viewport, selectCard } from './helpers'

/** Every card's transform, keyed by node ID (equipment and boundary cards). */
const layout = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.react-flow__node')].map((n) => [
        n.getAttribute('data-id'),
        (n as HTMLElement).style.transform,
      ]),
    ),
  )
const cards = (page: Page) => page.locator('.react-flow__node-equipment')
const boundaries = (page: Page) => page.locator('.react-flow__node-boundary')
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

test('C09 a boundary bundle keeps real cable IDs, expands to real cards, and a trace still works through it', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(cards(page)).toHaveCount(11)
  const full = await layout(page)
  const port = await viewport(page)

  // Focus Building A from the card's location label.
  await page
    .getByRole('button', { name: 'Focus Main Campus / Building A / Rack A03' })
    .first()
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Building A' }),
  ).toBeVisible()
  await expect(cards(page)).toHaveCount(2)
  await expect(boundaries(page)).toHaveCount(1)
  const bundle = boundaries(page).locator('.boundary-card')
  await expect(bundle).toContainText('3 cables to North Sub-main')
  await expect(bundle).toHaveAttribute(
    'data-cable-ids',
    'cable-a02 cable-a06 cable-a10',
  )
  await expect(bundle).toContainText('cable-a02 · cable-a06 · cable-a10')

  // Expanding reveals the real neighbor at its session position, with real edges.
  await page
    .getByRole('button', { name: 'Expand 3 cables to North Sub-main' })
    .click()
  await expect(cards(page)).toHaveCount(3)
  await expect(page.getByTestId('rf__node-hdf-01')).toBeVisible()
  const expanded = await layout(page)
  expect(expanded['hdf-01']).toBe(full['hdf-01'])
  expect(expanded['edge-17']).toBe(full['edge-17'])
  // Real lines: EDGE-17 ↔ PANEL-A and now PANEL-A ↔ HDF-01.
  await expect(page.getByText('3 cables', { exact: true })).toHaveCount(2)
  await expect(bundle).toHaveAttribute(
    'data-cable-ids',
    'cable-a02 cable-a06 cable-a10',
  )

  // Collapsing folds the neighbor back.
  await page
    .getByRole('button', { name: 'Collapse 3 cables to North Sub-main' })
    .click()
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByText('3 cables', { exact: true })).toHaveCount(1)

  // A trace still works through the bundle; it never touches the backend graph.
  await traceFromEdge17(page)
  await expect(cards(page)).toHaveCount(5) // EDGE-17, PANEL-A, HDF-01, HDF-02, AGG-03
  await expect(boundaries(page)).toHaveCount(0) // HDF-01 is on screen: real edges, no summary
  await expect(page.locator('.react-flow__edge.animated')).toHaveCount(4)
  expect(await viewport(page)).toBe(port)
})

test('C13 focus Building A, trace from EDGE-17: distant cards appear, then hide again on clear', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(cards(page)).toHaveCount(11)
  const full = await layout(page)
  const port = await viewport(page)

  // Focus from the Explore drawer.
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await page.getByRole('button', { name: 'Focus Building A' }).click()
  await page
    .getByRole('button', { name: 'Close Explore infrastructure' })
    .click()
  await expect(cards(page)).toHaveCount(2)

  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/'))
      requests.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  await traceFromEdge17(page)

  // Select AGG-03, then BB-01: the distant card follows the route.
  await rows(page).nth(0).click()
  await expect(page.getByTestId('rf__node-agg-03')).toBeVisible()
  await expect(page.getByTestId('rf__node-hdf-02')).toBeVisible()
  await expect(cards(page)).toHaveCount(5)
  await rows(page).nth(2).click()
  await expect(page.getByTestId('rf__node-bb-01')).toBeVisible()
  await expect(page.getByTestId('rf__node-agg-03')).toHaveCount(0)
  // Positions and viewport are exactly where the full map had them.
  const during = await layout(page)
  for (const [id, transform] of Object.entries(during))
    if (id in full) expect(transform).toBe(full[id])
  expect(await viewport(page)).toBe(port)

  // Clear trace: the revealed cards hide again, the focus stays.
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByTestId('rf__node-bb-01')).toHaveCount(0)
  await expect(boundaries(page)).toHaveCount(1)
  // Only the trace itself went to the backend: no per-port or per-location loading.
  expect(requests).toEqual(['POST /api/traces'])

  // Clearing the focus restores the full map with positions intact.
  await page.getByRole('button', { name: 'Clear focus' }).click()
  await expect(cards(page)).toHaveCount(11)
  await expect(boundaries(page)).toHaveCount(0)
  expect(await layout(page)).toEqual(full)
  expect(await viewport(page)).toBe(port)
})
