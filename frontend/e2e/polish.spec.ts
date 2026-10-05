import { expect, test, type Page } from '@playwright/test'
import { expectMarks, fitted, highlightLocation, viewport } from './helpers'

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
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from all ports of EDGE-17' })
    .click()
  await expect(rows(page)).toHaveCount(3)
}

test('POL-01 opening the connections popover neither resizes the card nor moves any card', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(cards(page)).toHaveCount(11)
  const hdf = page.getByTestId('rf__node-hdf-01')
  const box = await hdf.boundingBox()
  const positions = await layout(page)
  const quiet = await zIndex(page, 'hdf-01')

  await page.getByRole('button', { name: 'Show connections of HDF-01' }).click()
  const popover = page.getByLabel('HDF-01 connections', { exact: true })
  await expect(popover).toBeVisible()
  await expect(popover.locator('li')).toHaveCount(4)

  // Same card size and position; no other card moved.
  expect(await hdf.boundingBox()).toEqual(box)
  expect(await layout(page)).toEqual(positions)
  // The popover floats beside the card, outside it, and below it.
  await expect(hdf.getByLabel('HDF-01 connections')).toHaveCount(0)
  const pop = await popover.boundingBox()
  expect(pop!.y).toBeGreaterThanOrEqual(box!.y + box!.height - 1)
  // The card is raised above every neighbor while it is open.
  const raised = await zIndex(page, 'hdf-01')
  expect(raised).toBeGreaterThan(quiet)
  for (const id of ['edge-17', 'panel-a', 'hdf-02', 'agg-03'])
    expect(await zIndex(page, id)).toBeLessThan(raised)

  // Searching and pinning inside it still changes nothing about size or place.
  await page.getByLabel('Search HDF-01 connections').fill('1A/2')
  await popover.getByRole('checkbox').first().check()
  await expect(
    page.getByLabel('HDF-01 shown connections').locator('.map-facet-label'),
  ).toHaveText(['1A / 2'])
  const after = await layout(page)
  for (const [id, transform] of Object.entries(positions))
    expect(after[id]).toBe(transform)
  // A card that carries a facet stays above ordinary cards after the popover closes.
  await page.getByRole('button', { name: 'Show connections of HDF-01' }).click()
  await expect(popover).toHaveCount(0)
  expect(await zIndex(page, 'hdf-01')).toBeGreaterThan(
    await zIndex(page, 'edge-22'),
  )
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
  await page.getByRole('button', { name: 'Show connections of HDF-01' }).click()
  await page.getByLabel('Search HDF-01 connections').fill('1A/2')
  await page
    .getByLabel('HDF-01 connections')
    .getByRole('checkbox')
    .first()
    .check()
  await page.getByRole('button', { name: 'Show connections of HDF-01' }).click()
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
