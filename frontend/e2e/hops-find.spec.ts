import { expect, test, type Page } from '@playwright/test'
import { fitted, viewport } from './helpers'

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
const find = (page: Page) => page.getByRole('combobox', { name: 'Find on map' })
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

/** The card's center is where the canvas center is (the pan has settled). */
async function expectCentered(page: Page, id: string) {
  await expect
    .poll(async () => {
      const card = await page.getByTestId(`rf__node-${id}`).boundingBox()
      const surface = await page.locator('.flow-surface').boundingBox()
      return Math.hypot(
        card!.x + card!.width / 2 - (surface!.x + surface!.width / 2),
        card!.y + card!.height / 2 - (surface!.y + surface!.height / 2),
      )
    })
    .toBeLessThan(4)
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
  await expectCentered(page, 'hdf-02')
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
  await expect(page.getByTestId('rf__node-edge-18')).toBeVisible()
  expect(await settledViewport(page)).toBe(after)
})

test('POL-06 find "edge-17" centers on EDGE-17 and shows it, PANEL-A and its cables in amber', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const positions = await layout(page)

  await find(page).fill('edge-17')
  await expect(
    page
      .getByRole('listbox', { name: 'Matching equipment' })
      .getByRole('option'),
  ).toHaveText(['EDGE-17access'])
  await find(page).press('Enter')

  await expect(
    page.getByTestId('rf__node-edge-17').locator('.equipment-card'),
  ).toHaveClass(/found-card/)
  await expect(
    page.getByTestId('rf__node-panel-a').locator('.equipment-card'),
  ).toHaveClass(/found-neighbor/)
  await expect(page.locator('.equipment-card.found')).toHaveCount(2)
  await expectCentered(page, 'edge-17')
  await expect(page.locator('.inspector-hero h2')).toHaveText('EDGE-17')

  // Exactly the three EDGE-17 cables are found, drawn in amber.
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
  // Centering pans, so cards that scroll offscreen are not drawn; the rest have not moved.
  for (const [id, transform] of Object.entries(await layout(page)))
    expect(transform).toBe(positions[id])
})

test('POL-06 keyboard: arrows move through matches, Enter chooses, Esc clears', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await find(page).fill('ag')
  const options = page
    .getByRole('listbox', { name: 'Matching equipment' })
    .getByRole('option')
  await expect(options).toHaveText([
    'AGG-03aggregation',
    'AGG-08aggregation',
    'AGG-12aggregation',
    'AGG-15aggregation',
  ])
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')
  await find(page).press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await find(page).press('ArrowUp')
  await find(page).press('ArrowUp') // wraps to the last
  await expect(options.nth(3)).toHaveAttribute('aria-selected', 'true')
  await find(page).press('ArrowDown') // and back to the first
  await find(page).press('ArrowDown')
  await find(page).press('Enter')
  await expect(page.locator('.equipment-card.found-card')).toContainText(
    'AGG-08',
  )
  await expect(find(page)).toHaveValue('AGG-08')

  // Esc clears the find and the field.
  await find(page).press('Escape')
  await expect(page.locator('.equipment-card.found')).toHaveCount(0)
  await expect(find(page)).toHaveValue('')

  // A new search clears the previous find; × clears too.
  await find(page).fill('agg-03')
  await find(page).press('Enter')
  await expect(page.locator('.equipment-card.found-card')).toContainText(
    'AGG-03',
  )
  await find(page).fill('b')
  await expect(page.locator('.equipment-card.found')).toHaveCount(0)
  await find(page).fill('agg-03')
  await find(page).press('Enter')
  await expect(page.locator('.equipment-card.found-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear find' }).click()
  await expect(page.locator('.equipment-card.found')).toHaveCount(0)
})

test('POL-07 found and trace highlights coexist and clear independently', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page) // AGG-03 route selected
  await find(page).fill('edge-17')
  await find(page).press('Enter')

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
  // The route still lists its three results and expands its hops.
  await expect(rows(page)).toHaveCount(3)
  await expect(page.locator('.equipment-card.found-card')).toContainText(
    'EDGE-17',
  )

  // Clearing the find leaves the trace alone…
  await page.getByRole('button', { name: 'Clear find' }).click()
  await expect(page.locator('.equipment-card.found')).toHaveCount(0)
  await expect(outline).toHaveCount(0)
  await expect(page.locator('.react-flow__edge.animated')).toHaveCount(4)
  await expect(rows(page)).toHaveCount(3)

  // …and clearing the trace leaves the find alone.
  await find(page).fill('edge-17')
  await find(page).press('Enter')
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(page.locator('.react-flow__edge.animated')).toHaveCount(0)
  await expect(page.getByLabel('Map trace results')).toHaveCount(0)
  await expect(page.locator('.equipment-card.found-card')).toContainText(
    'EDGE-17',
  )
  await expect(page.locator('.react-flow__edge.found')).toHaveCount(1)
})

test('POL-08 a found card hidden by the filter or focus is shown while found', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const positions = await layout(page)
  const caption = page.locator('.board-caption')

  // Network filter: EDGE-17 and PANEL-A are Network A, hidden under Network B.
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  await expect(caption).toContainText('5 of 11')
  await find(page).fill('edge-17')
  await find(page).press('Enter')
  await expect(caption).toContainText('7 of 11')
  await expect(page.getByTestId('rf__node-edge-17')).toBeVisible()
  await expect(page.getByTestId('rf__node-panel-a')).toBeVisible()
  const shown = await layout(page)
  for (const [id, transform] of Object.entries(shown))
    expect(transform).toBe(positions[id])
  await page.getByRole('button', { name: 'Clear find' }).click()
  await expect(caption).toContainText('5 of 11')
  await expect(page.getByTestId('rf__node-edge-17')).toHaveCount(0)

  // Focus: Building A shows two cards; finding HDF-01 reveals it and its neighbors.
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'All networks' })
  await expect(caption).toContainText('11 of 11')
  await page
    .getByTestId('rf__node-edge-17')
    .getByRole('button', { name: 'Focus Building A' })
    .click()
  await expect(caption).toContainText('2 of 11')
  await find(page).fill('hdf-01')
  await find(page).press('Enter')
  await expect(caption).toContainText('5 of 11') // + HDF-01, HDF-02, PANEL-DR
  await expect(page.getByTestId('rf__node-hdf-01')).toBeVisible()
  await expect(page.getByTestId('rf__node-panel-dr')).toBeVisible()
  await find(page).press('Escape')
  await expect(caption).toContainText('2 of 11')
  await expect(page.locator('.focus-chip')).toContainText('Building A')
})
