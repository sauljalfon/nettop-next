import { expect, test, type Page } from '@playwright/test'
import {
  expectMarks,
  fitted,
  highlightLocation,
  pinFromInspector,
  viewport,
} from './helpers'

/** Every card's transform, keyed by node ID. */
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
const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')
const zIndex = (page: Page, id: string) =>
  page
    .getByTestId(`rf__node-${id}`)
    .evaluate((n) => Number((n as HTMLElement).style.zIndex || 0))

async function traceFromEdge17(page: Page) {
  await page.getByTestId('rf__node-edge-17').click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(rows(page)).toHaveCount(3)
}

test('POL-19 cards have no connections popover, and pins and route facets still show on them', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(cards(page)).toHaveCount(11)
  await expect(
    page.getByRole('button', { name: /Show connections/ }),
  ).toHaveCount(0)
  // A pin made in the inspector shows on the card, without resizing any other card.
  const positions = await layout(page)
  await pinFromInspector(page, 'hdf-01', '2D/4')
  await expect(
    page.getByLabel('HDF-01 shown connections').locator('.map-facet-label'),
  ).toHaveText(['2D / 4'])
  await expect(
    page.getByLabel('HDF-01 shown connections').getByRole('button'),
  ).toHaveAttribute('data-source', 'manual')
  expect(await layout(page)).toEqual(positions)
  // A route facet shows beside it.
  await traceFromEdge17(page)
  await expect(
    page.getByLabel('HDF-01 shown connections').locator('.map-facet-label'),
  ).toHaveText(['2D / 4', '3C / 5'])
  // A card carrying facets stays above ordinary cards.
  expect(await zIndex(page, 'hdf-01')).toBeGreaterThan(
    await zIndex(page, 'edge-22'),
  )
})

test('a selected card keeps its size and does not cover the card below it', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const upper = page.getByTestId('rf__node-edge-17')
  const lower = page.getByTestId('rf__node-edge-22')
  const before = await upper.boundingBox()
  await upper.click()
  await expect(upper.locator('.equipment-card')).toHaveClass(/selected/)
  const after = await upper.boundingBox()
  const below = await lower.boundingBox()
  expect(after!.height).toBe(before!.height)
  expect(after!.y + after!.height).toBeLessThanOrEqual(below!.y)
})

test('POL-02 every overlay button stays clickable with each drawer open', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)
  const overlay = [
    page.getByRole('button', { name: 'Collapse results' }),
    page.getByRole('button', { name: 'Clear trace' }),
    rows(page).nth(0),
    rows(page).nth(1),
    rows(page).nth(2),
    page.getByRole('button', { name: 'Zoom In' }),
    page.getByRole('button', { name: 'Zoom Out' }),
    page.getByRole('button', { name: 'Fit View' }),
    page.getByRole('button', { name: 'Reset layout' }),
  ]
  const check = async () => {
    // A trial click runs every actionability check, including that nothing covers the button.
    for (const button of overlay) await button.click({ trial: true })
  }
  await check() // no drawer
  const drawers: [string, string][] = [
    ['Add equipment library', 'left'],
    ['Open explorer', 'left'],
    ['Open trace tools', 'right'],
    ['Open inspector', 'right'],
    ['Changes', 'right'],
  ]
  for (const [opener, side] of drawers) {
    const toggle = page.getByRole('button', {
      name: opener === 'Changes' ? /^Changes/ : opener,
      exact: opener !== 'Changes',
    })
    await toggle.click()
    await expect(page.locator('.studio')).toHaveClass(
      new RegExp(`drawer-${side}`),
    )
    await check()
    await toggle.click() // close it again
    await expect(page.locator('.studio-drawer')).toHaveCount(0)
  }
})

test('POL-03 reset recomputes the first layout and keeps pins, highlight, filter and trace', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(cards(page)).toHaveCount(11)
  const first = await layout(page)

  // Build up state: filter, a pinned position, a highlight, and a selected trace.
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network A' })
  await expect(cards(page)).toHaveCount(8)
  await pinFromInspector(page, 'hdf-01', '1A/2')
  await highlightLocation(page, 'Building A')
  await expectMarks(page, { highlightCards: ['edge-17', 'panel-a'] })
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click() // close Explore
  await traceFromEdge17(page)
  await rows(page).nth(1).click() // AGG-08, which uses 1A/2
  await expect(page.locator('.board-caption')).toContainText('8 of 11')
  await expectMarks(page, { dimmedCards: ['agg-03', 'agg-15', 'bb-01'] })
  await expect(
    page.getByLabel('HDF-01 shown connections').getByRole('button'),
  ).toHaveAttribute('data-source', 'auto manual')

  // Rearrange: drag EDGE-17 away and zoom out.
  const card = page.getByTestId('rf__node-edge-17')
  const before = await card.boundingBox()
  await page.mouse.move(before!.x + 60, before!.y + 20)
  await page.mouse.down()
  await page.mouse.move(before!.x + 330, before!.y + 190, { steps: 12 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Zoom Out' }).click()
  const dragged = await layout(page)
  expect(dragged['edge-17']).not.toBe(first['edge-17'])
  const arranged = await viewport(page)

  // Cancel changes nothing.
  await page.getByRole('button', { name: 'Reset layout' }).click()
  await expect(page.getByText('Reset layout?')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel reset' }).click()
  expect(await layout(page)).toEqual(dragged)

  // Reset: first layered layout again, fitted once.
  await page.getByRole('button', { name: 'Reset layout' }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect
    .poll(async () => (await layout(page))['edge-17'])
    .toBe(first['edge-17'])
  const reset = await layout(page)
  for (const [id, transform] of Object.entries(reset))
    expect(transform).toBe(first[id])
  await expect.poll(() => viewport(page)).not.toBe(arranged)
  for (const id of await cards(page).evaluateAll((n) =>
    n.map((x) => x.getAttribute('data-id')),
  )) {
    const b = await page.getByTestId(`rf__node-${id}`).boundingBox()
    expect(b!.x).toBeGreaterThanOrEqual(0)
    expect(b!.y).toBeGreaterThanOrEqual(0)
    expect(b!.x + b!.width).toBeLessThanOrEqual(1440)
    expect(b!.y + b!.height).toBeLessThanOrEqual(1050)
  }

  // Everything else is untouched.
  await expect(
    page.getByRole('combobox', { name: 'Show network' }),
  ).toHaveValue('net-a')
  await expectMarks(page, {
    highlightCards: ['edge-17', 'panel-a'],
    dimmedCards: ['agg-03', 'agg-15', 'bb-01'],
  })
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.board-caption')).toContainText('8 of 11')
  await expect(
    page.getByLabel('HDF-01 shown connections').getByRole('button'),
  ).toHaveAttribute('data-source', 'auto manual')
})

const pill = (page: Page, cable: string) =>
  page.locator(`.map-pill[data-cable-ids~="${cable}"]`)

test('POL-17 EDGE-17–PANEL-A is one line with a "3" pill in Network A\'s color whose tooltip lists the cables', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const p = pill(page, 'cable-a01')
  await expect(p).toHaveText('3')
  await expect(p).toHaveAttribute(
    'data-cable-ids',
    'cable-a01 cable-a05 cable-a09',
  )
  // Network A's color, the same as its badge on the PANEL-A card.
  const badge = page
    .getByTestId('rf__node-panel-a')
    .locator('.network-badge', { hasText: 'Network A' })
  const color = await badge.evaluate((el) => (el as HTMLElement).style.color)
  await expect(p).toHaveCSS('background-color', color)
  await expect(page.locator('.map-tooltip')).toHaveCount(0)
  await p.hover()
  const tip = page.getByRole('tooltip')
  for (const id of ['cable-a01', 'cable-a05', 'cable-a09'])
    await expect(tip).toContainText(id)
  // Hovering the line shows it too.
  await page.mouse.move(0, 0)
  await expect(tip).toHaveCount(0)
  await page
    .locator('.react-flow__edge[data-id]')
    .filter({ has: page.locator('[data-cable-ids~="cable-a01"]') })
    .locator('.react-flow__edge-interaction')
    // Near its start: the pill covers the middle.
    .hover({ position: { x: 6, y: 2 } })
  await expect(tip).toContainText('cable-a05')
  // No "N cables" text on any line.
  await expect(page.locator('.map-caption', { hasText: /cables/ })).toHaveCount(
    0,
  )
})

test('POL-18 clicking the pill splits the line into labeled cables, clicking again joins them, and width grows with the count', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const widthOf = (id: string) =>
    page
      .locator(`g[data-cable-ids~="${id}"] path.react-flow__edge-path`)
      .first()
      .evaluate((el) =>
        Number(getComputedStyle(el).strokeWidth.replace('px', '')),
      )
  const single = await widthOf('cable-b03')
  const bundled = await widthOf('cable-a01')
  expect(bundled).toBeGreaterThan(single)
  const startOf = (id: string) =>
    page
      .locator(`g[data-cable-ids~="${id}"] path.react-flow__edge-path`)
      .first()
      .getAttribute('d')
      .then((d) =>
        d!
          .match(/^M\s*([\d.-]+)[ ,]([\d.-]+)/)!
          .slice(1)
          .join(','),
      )
  const joinedStart = await startOf('cable-a01')
  // Only a line that can be split looks clickable.
  await expect(
    page.locator('.react-flow__edge.map-edge-splittable'),
  ).toHaveCount(3)
  await expect(
    page.locator('.react-flow__edge:not(.map-edge-splittable)').first(),
  ).toHaveCSS('cursor', 'default')
  await pill(page, 'cable-a01').click()
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-split-pairs',
    'edge-17|panel-a|net-a',
  )
  await expect(pill(page, 'cable-a01')).toHaveCount(0)
  for (const id of ['cable-a01', 'cable-a05', 'cable-a09'])
    await expect(
      page.locator(`.map-cable-label[data-cable-id="${id}"]`),
    ).toBeVisible()
  // The labels never overlap, and every split line fans out from the same
  // point the joined line started at.
  const boxes = await page.locator('.map-cable-label').evaluateAll((els) =>
    els.map((e) => {
      const b = e.getBoundingClientRect()
      return { l: b.left, r: b.right, t: b.top, b: b.bottom }
    }),
  )
  expect(boxes).toHaveLength(3)
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]]
      expect(a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b).toBe(false)
    }
  for (const id of ['cable-a01', 'cable-a05', 'cable-a09'])
    expect(await startOf(id)).toBe(joinedStart)
  // The map stays at one line per cable, each as thin as a single cable.
  expect(await widthOf('cable-a05')).toBe(single)
  await page.getByRole('button', { name: 'Join 3 cables' }).click()
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-split-pairs',
    '',
  )
  await expect(pill(page, 'cable-a01')).toHaveText('3')
  // Clicking a split line joins it, too: at its middle, where the lines are apart.
  await pill(page, 'cable-a01').click()
  const label = await page
    .locator('.map-cable-label[data-cable-id="cable-a05"]')
    .boundingBox()
  await page.mouse.click(
    label!.x + label!.width / 2,
    label!.y + label!.height / 2,
  )
  await expect(pill(page, 'cable-a01')).toHaveText('3')
})

test('POL-32 a trace that fails with every drawer closed shows its error on the map, once', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await pinFromInspector(page, 'edge-17', '1')
  await expect(page.locator('.studio-drawer')).toHaveCount(0)
  await page.route('**/api/traces*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Trace engine unavailable' }),
    }),
  )
  await page
    .getByRole('button', { name: 'EDGE-17 Port 1, find AGG / BB from here' })
    .click()
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'Trace engine unavailable' })
  await expect(alert).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(1)
  // With the Trace drawer open the error shows there instead, never twice.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(page.locator('.studio-drawer').getByRole('alert')).toContainText(
    'Trace engine unavailable',
  )
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  // It can be dismissed.
  await page.getByRole('button', { name: 'Dismiss trace error' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
