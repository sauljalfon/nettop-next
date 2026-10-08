import { expect, test, type Page } from '@playwright/test'
import { fitted } from './helpers'

const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)
const results = (page: Page) => page.getByLabel('Map trace results')
const physical = (page: Page) =>
  page.getByRole('button', { name: 'Physical', exact: true })
const trail = (page: Page) => page.getByTestId('route-trail')
const steps = (page: Page) => page.getByTestId('trail-step')

async function traceAgg03(page: Page) {
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}

/** Each hop's label stays on one line, with its icon beside it and not stretched. */
async function expectHopLayout(page: Page) {
  const rows = await page.getByTestId('map-hop-row').count()
  expect(rows).toBeGreaterThanOrEqual(8)
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="map-hop-row"]')].map((row) => {
      const item = row.closest('li')!
      const label = row.querySelector('span')!.getBoundingClientRect()
      const icon = item.querySelector('.row-action')!.getBoundingClientRect()
      const r = row.getBoundingClientRect()
      return {
        text: row.querySelector('span')!.textContent,
        labelHeight: label.height,
        labelWidth: label.width,
        iconWidth: icon.width,
        iconHeight: icon.height,
        rowWidth: r.width,
        iconLeftOfLabelEnd: icon.left < label.right - 1,
        sameLine:
          Math.abs(icon.top + icon.height / 2 - (r.top + r.height / 2)) < 12,
      }
    }),
  )
  for (const b of boxes) {
    expect(b.labelHeight, `${b.text} wraps`).toBeLessThan(20)
    expect(b.labelWidth, `${b.text} is squeezed`).toBeGreaterThan(70)
    expect(b.iconWidth, `${b.text}'s icon is stretched`).toBeLessThanOrEqual(30)
    expect(b.iconHeight).toBeLessThanOrEqual(30)
    expect(b.rowWidth).toBeGreaterThan(b.iconWidth * 5)
    expect(b.iconLeftOfLabelEnd, `${b.text}: icon over the label`).toBe(false)
    expect(b.sameLine, `${b.text}: icon not beside the row`).toBe(true)
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('TR-01 the hop rows keep their label on one line with the icon beside it, in both views', async ({
  page,
}) => {
  await traceAgg03(page)
  await expectHopLayout(page) // Conceptual: the panel is open
  await physical(page).click()
  await results(page).getByRole('button', { name: 'Expand results' }).click()
  await expectHopLayout(page)
})

test('TR-03 in Physical the results panel opens as one line and its expanded hop list scrolls', async ({
  page,
}) => {
  await traceAgg03(page)
  // Conceptual keeps today's open panel.
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await physical(page).click()
  await expect(results(page)).toBeVisible()
  await expect(page.getByTestId('route-row')).toHaveCount(0)
  await expect(results(page)).toContainText('Find AGG / BB')
  await expect(results(page)).toContainText('3 routes')
  await expect(results(page)).toContainText('AGG-03')
  const one = await results(page).boundingBox()
  expect(one!.height).toBeLessThan(70)

  await results(page).getByRole('button', { name: 'Expand results' }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  const hops = results(page).getByRole('list', { name: 'Route hops' })
  const metrics = await hops.evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
    overflowY: getComputedStyle(el).overflowY,
  }))
  expect(metrics.client).toBeLessThanOrEqual(200) // about six rows
  expect(metrics.scroll).toBeGreaterThan(metrics.client)
  expect(['auto', 'scroll']).toContain(metrics.overflowY)

  // It collapses again, and closing clears the trace.
  await results(page).getByRole('button', { name: 'Collapse results' }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(0)
  await results(page).getByRole('button', { name: 'Clear trace' }).click()
  await expect(results(page)).toHaveCount(0)
})

test('TR-04 the trail shows the route as steps; chips, Prev and Next open the exact endpoint, and Back returns', async ({
  page,
}) => {
  // No route, no trail.
  await physical(page).click()
  await expect(trail(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()

  await traceAgg03(page)
  await physical(page).click()
  await expect(trail(page)).toContainText('Route AGG-03:')
  await expect(steps(page)).toHaveText([
    'EDGE-17 Port 1',
    'PANEL-A 1 F→R',
    'HDF-01 3C/5 R→F',
    'HDF-02 2B/3 F→R',
    'AGG-03 Port 1',
  ])
  await expectMark(page, 'data-route-steps', '5')
  // Above the equipment level none is current.
  await expectMark(page, 'data-route-step', '')
  await expect(
    page.locator('[data-testid="trail-step"][data-current="true"]'),
  ).toHaveCount(0)
  await expect(trail(page)).toContainText('5 steps')

  // A chip opens its endpoint; that step is current and the label says so.
  await steps(page).nth(0).click()
  await expectMark(page, 'data-selected-endpoint', 'edge-17:p1')
  await expectMark(page, 'data-route-step', '1')
  await expect(steps(page).nth(0)).toHaveAttribute('data-current', 'true')
  await expect(trail(page)).toContainText('step 1 of 5')

  // Next from EDGE-17 opens PANEL-A position 1, front.
  await trail(page).getByRole('button', { name: /Next/ }).click()
  await expectMark(page, 'data-selected-endpoint', 'panel-a:1:f')
  await expectMark(page, 'data-side', 'front')
  await expectMark(page, 'data-route-step', '2')
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /equipment:panel-a\/endpoint:panel-a:1:f\/front$/,
  )

  // A chip opens where the route enters: HDF-01's rear. Switching sides on the
  // page keeps the same step, because both sides are the route's.
  await steps(page).nth(2).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  await expectMark(page, 'data-route-step', '3')
  await page.getByRole('button', { name: 'Switch to front' }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:f')
  await expectMark(page, 'data-route-step', '3')

  // Prev goes back one step; Back returns to where we were before it.
  await trail(page).getByRole('button', { name: /Prev/ }).click()
  await expectMark(page, 'data-route-step', '2')
  await expectMark(page, 'data-selected-endpoint', 'panel-a:1:f')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:f')
  await expectMark(page, 'data-route-step', '3')

  // The ends stop: Prev is off on the first step, Next on the last.
  await steps(page).nth(0).click()
  await expect(trail(page).getByRole('button', { name: /Prev/ })).toBeDisabled()
  await steps(page).nth(4).click()
  await expect(trail(page).getByRole('button', { name: /Next/ })).toBeDisabled()
  await expectMark(page, 'data-selected-endpoint', 'agg-03:p1')

  // Clearing the trace removes the trail only.
  await results(page).getByRole('button', { name: 'Clear trace' }).click()
  await expect(trail(page)).toHaveCount(0)
  await expectMark(page, 'data-physical-level', 'equipment')
})

test('TR-04 a long trail stays one line high and scrolls sideways', async ({
  page,
}) => {
  await traceAgg03(page)
  await page.setViewportSize({ width: 700, height: 900 })
  await physical(page).click()
  const metrics = await trail(page).evaluate((el) => {
    const scroller = el.querySelector('.trail-steps') as HTMLElement
    return {
      height: el.getBoundingClientRect().height,
      client: scroller.clientWidth,
      scroll: scroller.scrollWidth,
      overflowX: getComputedStyle(scroller).overflowX,
    }
  })
  expect(metrics.height).toBeLessThan(44)
  expect(metrics.scroll).toBeGreaterThan(metrics.client)
  expect(['auto', 'scroll']).toContain(metrics.overflowX)
})
