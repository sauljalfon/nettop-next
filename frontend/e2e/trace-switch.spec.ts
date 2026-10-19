import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import {
  expandResults,
  fitted,
  openRackInPhysical,
  overviewState,
  pick,
  viewport,
} from './helpers'

const rows = (page: Page) => page.getByTestId('route-row')
const root = (page: Page) => page.locator('.physical-explorer')
const note = (page: Page) => page.getByTestId('route-note')
const NOTE = 'The selected route is not in this context; showing the first.'

async function toPlan(page: Page) {
  await page.getByRole('button', { name: /^Plan: / }).click()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
}
async function toInstalled(page: Page) {
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
}
async function findFromEdge17(page: Page) {
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(rows(page).first()).toBeVisible()
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}
/** A fresh draft with one extra cable: EDGE-17 port 4 to AGG-15 port 2 adds a fourth route. */
async function planWithRoute(request: APIRequestContext) {
  const created = await request.post('/api/plans', {
    data: { name: 'Fourth route', expectedBaseRevision: 'acceptance-1' },
  })
  const id = (await created.json()).id as string
  const added = await request.post(`/api/plans/${id}/commands`, {
    data: {
      type: 'add_cable',
      expectedRevision: '1',
      cable: { a: 'edge-17:p4', b: 'agg-15:p2' },
    },
  })
  expect(added.status()).toBe(200)
  return id
}

test('TR-05 the same Find AGG / BB is rerun in the plan with AGG-08 still selected, and the map does not move', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await findFromEdge17(page)
  await rows(page).nth(1).click() // AGG-08
  const lit = await overviewState(page)
  expect(lit.nodes).toEqual([
    'node-building-a',
    'node-main-distribution',
    'node-north-sub-main',
  ])
  expect(lit.pairs.length).toBeGreaterThan(0)
  const before = { viewport: await viewport(page), state: lit }

  await toPlan(page)
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => overviewState(page)).toEqual(before.state)
  await expect(note(page)).toHaveCount(0)
  expect(await viewport(page)).toBe(before.viewport)

  // And back: the trace follows the switch both ways.
  await toInstalled(page)
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
  expect(await overviewState(page)).toEqual(before.state)
  expect(await viewport(page)).toBe(before.viewport)
})

test('TR-05 the physical location is kept, and the route trail follows the rerun route', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await findFromEdge17(page) // AGG-03
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
  await page
    .getByRole('group', { name: 'Side' })
    .getByRole('button', { name: 'Rear' })
    .click()
  await page.locator('[data-endpoint-id="hdf-01:sp-3C:5:r"]').click()
  await expect(root(page)).toHaveAttribute('data-route-step', '3')
  const location = await root(page).getAttribute('data-location')

  await toPlan(page)
  await expect(root(page)).toHaveAttribute('data-route-steps', '5') // the rerun landed
  await expect(root(page)).toHaveAttribute('data-route-step', '3')
  await expect(root(page)).toHaveAttribute('data-location', location!)
  await expect(root(page)).toHaveAttribute(
    'data-selected-endpoint',
    'hdf-01:sp-3C:5:r',
  )
  await expect(root(page)).toHaveAttribute(
    'data-route-equipment',
    'agg-03 edge-17 hdf-01 hdf-02 panel-a',
  )
  await expandResults(page)
  await expect(rows(page)).toHaveCount(3)
})

test('TR-06 a route that is not in the other context falls back to the first, saying so', async ({
  page,
  request,
}) => {
  const id = await planWithRoute(request)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await findFromEdge17(page)
  await expect(rows(page)).toHaveCount(4)
  await rows(page).nth(2).click() // AGG-15, only in this plan
  await expect(rows(page).nth(2)).toContainText('AGG-15')
  await expect(note(page)).toHaveCount(0)

  await toInstalled(page)
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(note(page)).toHaveText(NOTE)

  // Choosing a route is a choice again: the note goes.
  await rows(page).nth(1).click()
  await expect(note(page)).toHaveCount(0)
})

test('TR-06 an error shows as usual and the trace comes back with its context; Clear trace stops any rerun', async ({
  page,
}) => {
  const traces: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/traces'))
      traces.push(r.url())
  })
  await page.goto('/?plan=expansion')
  await fitted(page)
  // EDGE-18 exists only in the plan: its route to AGG-15 does too.
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await pick(page, 'Start', 'edge-18 all ports')
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('AGG-15')
  await page.getByRole('button', { name: 'Close Trace tools' }).click()

  await toInstalled(page)
  await expect(page.getByRole('alert')).toContainText(
    /unknown starting device/i,
  )
  await expect(rows(page)).toHaveCount(0)
  // Back in the plan the same trace is there again.
  await toPlan(page)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('AGG-15')

  // Clear trace forgets the request: switching sends nothing and shows nothing.
  await page.getByRole('button', { name: 'Clear trace' }).click()
  const sent = traces.length
  await toInstalled(page)
  await toPlan(page)
  await page.waitForTimeout(500)
  expect(traces.length).toBe(sent)
  await expect(page.getByLabel('Map trace results')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
