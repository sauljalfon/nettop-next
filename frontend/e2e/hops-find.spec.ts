import { expect, test, type Page } from '@playwright/test'
import { expectCenteredInVisibleArea, fitted, viewport } from './helpers'

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
const scaleOf = (style: string | null) =>
  Number(/scale\(([\d.]+)\)/.exec(style ?? '')?.[1])

async function traceFromEdge17(page: Page) {
  await page.getByTestId('rf__node-edge-17').click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await page
    .getByRole('button', { name: 'Find AGG / BB from all ports of EDGE-17' })
    .click()
  await expect(rows(page)).toHaveCount(3)
}

/** The viewport once two reads in a row agree, so an animation has finished. */
async function settledViewport(page: Page) {
  let previous = ''
  await expect
    .poll(async () => {
      const current = (await viewport(page)) ?? ''
      const same = current === previous
      previous = current
      return same
    })
    .toBe(true)
  return previous
}

test('POL-04 the map overlay lists the same hop rows as TracePanel, in order', async ({
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

  // The Physical view's results drawer (TracePanel) shows the same rows.
  await rows(page).nth(0).click()
  const mapRows = await hops.evaluateAll((els) =>
    els.map((el) => ({
      title: el.querySelector('small')!.textContent,
      label: el.querySelector('span')!.textContent,
      link: el.querySelector('em')?.textContent ?? null,
    })),
  )
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  const traceRows = await page
    .locator('.hop-list [data-testid="hop-row"]')
    .evaluateAll((els) =>
      els.map((el) => {
        const link = el.querySelector('span')
        const title = el.querySelector('small')!.textContent
        const label = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent)
          .join('')
        return { title, label, link: link?.textContent ?? null }
      }),
    )
  expect(traceRows).toEqual(mapRows)
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
  await expect(page.locator('.inspector-hero h2')).toHaveText('HDF-02')
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

/** Choose equipment in the Explore drawer (opening it first if needed). */
async function chooseInExplore(page: Page, name: string) {
  if ((await page.locator('.studio-drawer.left').count()) === 0)
    await page
      .getByRole('button', { name: 'Open explorer', exact: true })
      .click()
  await page.locator('.tree-equipment').filter({ hasText: name }).click()
}
const found = (page: Page) => page.locator('.equipment-card.found-card')

test('POL-06 choosing EDGE-17 in Explore selects it, centers it in the visible area and shows it, PANEL-A and its cables in amber', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const positions = await layout(page)

  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await page.getByLabel('Find equipment').fill('edge')
  await chooseInExplore(page, 'EDGE-17')

  await expect(found(page)).toContainText('EDGE-17')
  await expect(
    page.getByTestId('rf__node-panel-a').locator('.equipment-card'),
  ).toHaveClass(/found-neighbor/)
  await expect(page.locator('.equipment-card.found')).toHaveCount(2)
  await expect(
    page.getByTestId('rf__node-edge-17').locator('.equipment-card'),
  ).toHaveClass(/selected/)
  // Explore stays open, so the card is centered in what remains visible.
  await expect(page.locator('.studio-drawer')).toHaveCount(1)
  await expectCenteredInVisibleArea(page, 'edge-17')

  const lit = page.locator('.react-flow__edge.found')
  await expect(lit).toHaveCount(1)
  await expect(lit.locator('[data-cable-ids]')).toHaveAttribute(
    'data-cable-ids',
    'cable-a01 cable-a05 cable-a09',
  )
  const stroke = await lit
    .locator('path.react-flow__edge-path')
    .evaluate((p) => getComputedStyle(p).stroke)
  expect(stroke).toBe('rgb(224, 154, 0)')
  // The found card itself has a stronger ring than its neighbor.
  const ring = (id: string) =>
    page
      .getByTestId(`rf__node-${id}`)
      .locator('.equipment-card')
      .evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))
  expect(await ring('edge-17')).toBeGreaterThan(await ring('panel-a'))
  // Centering pans, so offscreen cards are not drawn; the rest have not moved.
  for (const [id, transform] of Object.entries(await layout(page)))
    expect(transform).toBe(positions[id])
})

test('POL-06 Enter chooses the first match, another choice replaces it, Esc and Clear highlight clear it', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  const search = page.getByLabel('Find equipment')
  await expect(
    page.getByRole('button', { name: 'Clear highlight' }),
  ).toHaveCount(0)

  await search.fill('agg')
  await search.press('Enter') // AGG-03: prefix matches first, then by name
  await expect(found(page)).toContainText('AGG-03')
  await expect(
    page.getByRole('button', { name: 'Clear highlight' }),
  ).toBeVisible()

  // Choosing other equipment replaces the highlight.
  await chooseInExplore(page, 'AGG-08')
  await expect(found(page)).toHaveCount(1)
  await expect(found(page)).toContainText('AGG-08')

  // Esc clears it.
  await page.keyboard.press('Escape')
  await expect(page.locator('.equipment-card.found')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Clear highlight' }),
  ).toHaveCount(0)

  // So does the Clear highlight control.
  await chooseInExplore(page, 'AGG-12')
  await expect(found(page)).toContainText('AGG-12')
  await page.getByRole('button', { name: 'Clear highlight' }).click()
  await expect(page.locator('.equipment-card.found')).toHaveCount(0)

  // From the Physical view, choosing switches to the map and highlights there.
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await search.fill('')
  await chooseInExplore(page, 'EDGE-22')
  await expect(page.locator('.flow-surface')).toBeVisible()
  await expect(found(page)).toContainText('EDGE-22')
  await expectCenteredInVisibleArea(page, 'edge-22')
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

test('POL-07 found and trace highlights coexist and clear independently', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page) // AGG-03 route selected
  await chooseInExplore(page, 'EDGE-17')

  // Cable A01 is both: teal route line with an amber outline.
  const outline = page.locator('path.found-outline')
  await expect(outline).toHaveCount(1)
  await expect(page.locator('.react-flow__edge.animated')).toHaveCount(4)
  const colors = await page.evaluate(() => {
    const edge = document.querySelector('.react-flow__edge.found.animated')!
    return {
      main: getComputedStyle(edge.querySelector('path.react-flow__edge-path')!)
        .stroke,
      outline: getComputedStyle(edge.querySelector('path.found-outline')!)
        .stroke,
    }
  })
  expect(colors).toEqual({
    main: 'rgb(16, 139, 121)',
    outline: 'rgb(242, 177, 52)',
  })
  await expect(rows(page)).toHaveCount(3)
  await expect(found(page)).toContainText('EDGE-17')

  // Clearing the highlight leaves the trace alone…
  await page.getByRole('button', { name: 'Clear highlight' }).click()
  await expect(page.locator('.equipment-card.found')).toHaveCount(0)
  await expect(outline).toHaveCount(0)
  await expect(page.locator('.react-flow__edge.animated')).toHaveCount(4)
  await expect(rows(page)).toHaveCount(3)

  // …and clearing the trace leaves the highlight alone.
  await chooseInExplore(page, 'EDGE-17')
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(page.locator('.react-flow__edge.animated')).toHaveCount(0)
  await expect(page.getByLabel('Map trace results')).toHaveCount(0)
  await expect(found(page)).toContainText('EDGE-17')
  await expect(page.locator('.react-flow__edge.found')).toHaveCount(1)
})

test('POL-08 a found card hidden by the filter or focus is shown while found', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const positions = await layout(page)
  const caption = page.locator('.board-caption')

  // Focus first (the Explore drawer would cover the card's button): Building A shows two cards.
  await page
    .getByTestId('rf__node-edge-17')
    .getByRole('button', { name: 'Focus Building A' })
    .click()
  await expect(caption).toContainText('2 of 11')
  await chooseInExplore(page, 'HDF-01')
  await expect(caption).toContainText('5 of 11') // + HDF-01, HDF-02, PANEL-DR
  await expect(page.getByTestId('rf__node-hdf-01')).toBeVisible()
  await expect(page.getByTestId('rf__node-panel-dr')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(caption).toContainText('2 of 11')
  await expect(page.locator('.focus-chip')).toContainText('Building A')
  await page.getByRole('button', { name: 'Clear focus' }).click()
  await expect(caption).toContainText('11 of 11')

  // Network filter: EDGE-17 and PANEL-A are Network A, hidden under Network B.
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  await expect(caption).toContainText('5 of 11')
  await chooseInExplore(page, 'EDGE-17')
  await expect(caption).toContainText('7 of 11')
  await expect(page.getByTestId('rf__node-edge-17')).toBeVisible()
  await expect(page.getByTestId('rf__node-panel-a')).toBeVisible()
  for (const [id, transform] of Object.entries(await layout(page)))
    expect(transform).toBe(positions[id])
  await page.getByRole('button', { name: 'Clear highlight' }).click()
  await expect(caption).toContainText('5 of 11')
  await expect(page.getByTestId('rf__node-edge-17')).toHaveCount(0)
})
