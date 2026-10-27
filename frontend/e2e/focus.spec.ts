import { expect, test, type Page } from '@playwright/test'
import { fitted, selectEdge17, settledViewport } from './helpers'

// CM-10. Ids are the test server's (the acceptance example): equipment ids are
// the lower-case names.
test.describe.configure({ mode: 'serial' })

const focusRoot = (page: Page) => page.locator('[data-view="focus"]')
const hierarchyRoot = (page: Page) => page.locator('[data-view="hierarchy"]')
const equipmentCard = (page: Page, id: string) =>
  page.locator(`[data-equipment-id="${id}"]`)
// A line carries no text: its via row is inside the card the line leads to.
const line = (page: Page, from: string, to: string) =>
  equipmentCard(page, to).locator(`[data-line="${from}|${to}"]`)
const viewport = (page: Page) =>
  page.locator('.react-flow__viewport').getAttribute('style')

async function toHierarchy(page: Page) {
  await page.goto('/')
  await fitted(page)
  await expect(hierarchyRoot(page)).toHaveAttribute('data-fitted', 'true')
}

async function focusEdge17(page: Page) {
  await toHierarchy(page)
  await selectEdge17(page)
  await page.getByRole('button', { name: 'Focus on EDGE-17' }).click()
  await expect(focusRoot(page)).toHaveAttribute('data-focus-id', 'edge-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(equipmentCard(page, 'agg-03')).toBeVisible()
}

async function exploreChoose(page: Page, query: string) {
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  const search = page.getByLabel('Find equipment')
  await search.fill(query)
  await search.press('Enter')
}

test('CM-10 Focus on EDGE-17: the AGGs and BB on the right, the AGG-03 line through PANEL-A, HDF-01 and HDF-02', async ({
  page,
}) => {
  await focusEdge17(page)
  await expect(focusRoot(page)).toHaveAttribute('data-hops', '1')
  await expect(equipmentCard(page, 'edge-17')).toContainText('EDGE-17')
  for (const id of ['agg-03', 'agg-08', 'bb-01'])
    await expect(equipmentCard(page, id)).toHaveAttribute('data-side', 'right')
  // AGG-15 is not cabled: it is not here.
  await expect(equipmentCard(page, 'agg-15')).toHaveCount(0)
  // docs/acceptance-example.md section 3: PANEL-A 1, HDF-01 3C/5, HDF-02 2B/3.
  const steps = (to: string) => line(page, 'edge-17', to).locator('.focus-step')
  await expect(line(page, 'edge-17', 'agg-03')).toContainText('via')
  await expect(steps('agg-03')).toHaveText([
    'PANEL-A 1',
    'HDF-01 3C/5',
    'HDF-02 2B/3',
  ])
  await expect(steps('agg-08')).toHaveText([
    'PANEL-A 2',
    'HDF-01 1A/2',
    'HDF-02 1D/2',
  ])
  await expect(steps('bb-01')).toHaveText([
    'PANEL-A 3',
    'HDF-01 2D/4',
    'HDF-02 3A/1',
  ])
  // Nothing is written on the lines, and the old pill is gone.
  await expect(page.locator('.focus-pill')).toHaveCount(0)
  await expect(
    focusRoot(page).locator('.react-flow__edgelabel-renderer [data-line]'),
  ).toHaveCount(0)
})

test('CM-10 +1 hop and −1 hop; a ring that comes back empty says "Nothing further"', async ({
  page,
}) => {
  await focusEdge17(page)
  const plus = page.getByRole('button', { name: '+1 hop' })
  const minus = page.getByRole('button', { name: '−1 hop' })
  await expect(minus).toBeDisabled()
  await expect(page.getByText('Nothing further')).toHaveCount(0)
  await plus.click()
  await expect(focusRoot(page)).toHaveAttribute('data-hops', '2')
  // In the acceptance example every AGG and BB only leads back to EDGE-17.
  await expect(page.getByText('Nothing further')).toBeVisible()
  await expect(plus).toBeDisabled()
  await minus.click()
  await expect(focusRoot(page)).toHaveAttribute('data-hops', '1')
  await expect(page.getByText('Nothing further')).toHaveCount(0)
  await expect(plus).toBeEnabled()
})

test('CM-10 clicking a neighbour moves the focus to it', async ({ page }) => {
  await focusEdge17(page)
  await equipmentCard(page, 'agg-03').click()
  await expect(focusRoot(page)).toHaveAttribute('data-focus-id', 'agg-03')
  await expect(equipmentCard(page, 'edge-17')).toHaveAttribute(
    'data-side',
    'left',
  )
})

test('CM-10 Focus on PANEL-A: EDGE-17 on the left, the AGGs and BB on the right', async ({
  page,
}) => {
  await focusEdge17(page)
  await exploreChoose(page, 'PANEL-A') // in Focus, choosing in Explore moves the focus
  await expect(focusRoot(page)).toHaveAttribute('data-focus-id', 'panel-a')
  await expect(equipmentCard(page, 'edge-17')).toHaveAttribute(
    'data-side',
    'left',
  )
  for (const id of ['agg-03', 'agg-08', 'bb-01'])
    await expect(equipmentCard(page, id)).toHaveAttribute('data-side', 'right')
})

test('CM-10 a line opens its circuits; Find AGG / BB from the port runs the trace; Escape closes and returns to the line', async ({
  page,
}) => {
  await focusEdge17(page)
  const pill = line(page, 'edge-17', 'agg-03')
  await pill.click()
  const panel = page.getByRole('dialog', { name: /circuits/i })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Port 1')
  await expect(panel).toContainText('AGG-03')
  await expect(panel).toContainText('HDF-01')
  await panel.getByRole('button', { name: 'Find AGG / BB from Port 1' }).click()
  const rows = page.getByTestId('route-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('AGG-03')

  await pill.click()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(pill).toBeFocused()
})

test('CM-10 ‹ Hierarchy returns to the hierarchy with the same cards and viewport', async ({
  page,
}) => {
  await toHierarchy(page)
  const marks = await hierarchyRoot(page).getAttribute('data-card-positions')
  const view = await viewport(page)
  await selectEdge17(page)
  await page.getByRole('button', { name: 'Focus on EDGE-17' }).click()
  await expect(focusRoot(page)).toBeVisible()
  await page.getByRole('button', { name: '‹ Hierarchy' }).click()
  await expect(hierarchyRoot(page)).toHaveAttribute('data-fitted', 'true')
  expect(await hierarchyRoot(page).getAttribute('data-card-positions')).toBe(
    marks,
  )
  await expect.poll(() => viewport(page)).toBe(view)
})

test('CM-10 from the hierarchy, Explore → EDGE-17 opens Focus, and ‹ Hierarchy returns to the hierarchy', async ({
  page,
}) => {
  await toHierarchy(page)
  await exploreChoose(page, 'EDGE-17')
  await expect(focusRoot(page)).toHaveAttribute('data-focus-id', 'edge-17')
  await page.getByRole('button', { name: '‹ Hierarchy' }).click()
  await expect(hierarchyRoot(page)).toBeVisible()
})

test('CM-10 a card the plan adds is Proposed; in Installed the same focus says it is not in this topology', async ({
  page,
}) => {
  await toHierarchy(page)
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await exploreChoose(page, 'EDGE-18')
  await expect(focusRoot(page)).toHaveAttribute('data-focus-id', 'edge-18')
  await expect(equipmentCard(page, 'edge-18')).toContainText('Proposed')
  await expect(equipmentCard(page, 'agg-15')).toHaveAttribute(
    'data-side',
    'right',
  )
  await expect(line(page, 'edge-18', 'agg-15')).toContainText('direct')
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(page.getByText('edge-18 is not in this topology.')).toBeVisible()
  await expect(page.getByRole('button', { name: '‹ Hierarchy' })).toBeVisible()
})

test('CM-10 readability: with the inspector open on Focus on PANEL-A, no text in the canvas renders below 11px', async ({
  page,
}) => {
  await focusEdge17(page)
  await exploreChoose(page, 'PANEL-A') // choosing in Explore also opens the inspector
  await expect(focusRoot(page)).toHaveAttribute('data-focus-id', 'panel-a')
  await expect(page.locator('.inspector-header h2')).toHaveText('PANEL-A')
  await expect(equipmentCard(page, 'bb-01')).toBeVisible()
  await settledViewport(page) // the fit for this focus has finished
  const small = await page.evaluate(() => {
    const surface = document.querySelector(
      '[data-view="focus"] .react-flow__viewport',
    )!
    const zoom = new DOMMatrix(getComputedStyle(surface).transform).a
    const found: string[] = []
    for (const el of surface.querySelectorAll<HTMLElement>('*')) {
      const own = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '',
      )
      if (!own) continue
      const px = parseFloat(getComputedStyle(el).fontSize) * zoom
      if (px < 11)
        found.push(
          `${el.className || el.tagName}: ${px.toFixed(1)}px "${el.textContent!.trim().slice(0, 24)}"`,
        )
    }
    return { zoom, found }
  })
  console.log(
    'ZOOM',
    small.zoom,
    await page.locator('.react-flow__viewport').getAttribute('style'),
  )
  expect(small.found).toEqual([])
})

test('CM-10 a via row never covers another card', async ({ page }) => {
  await focusEdge17(page)
  await page.getByRole('button', { name: '+1 hop' }).click()
  await expect(focusRoot(page)).toHaveAttribute('data-hops', '2')
  await settledViewport(page)
  const rows = await focusRoot(page).evaluate((root) => {
    const cards = [
      ...root.querySelectorAll<HTMLElement>(
        '[data-equipment-id], [data-group-node]',
      ),
    ]
    const hits: string[] = []
    const lines = [...root.querySelectorAll<HTMLElement>('[data-line]')]
    for (const row of lines) {
      const r = row.getBoundingClientRect()
      const own = row.closest('[data-equipment-id], [data-group-node]')
      for (const card of cards) {
        if (card === own) continue
        const c = card.getBoundingClientRect()
        if (
          r.left < c.right &&
          c.left < r.right &&
          r.top < c.bottom &&
          c.top < r.bottom
        )
          hits.push(
            `${row.dataset.line} on ${card.dataset.equipmentId ?? card.dataset.groupNode}`,
          )
      }
    }
    return { count: lines.length, hits }
  })
  expect(rows.count).toBeGreaterThanOrEqual(3)
  expect(rows.hits).toEqual([])
})
