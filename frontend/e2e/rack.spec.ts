import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'

// The explorer writes its state on its root; these specs assert that model.
const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)
const slot = (page: Page, rack: string, unit: number) =>
  page.getByTestId(`rack-slot-${rack}-${unit}`)
const block = (page: Page, id: string) =>
  page.locator(`.rack-block[data-equipment-id="${id}"]`)
/** A fresh draft, so moves never leak into the shared Expansion plan other specs read. */
async function newPlan(request: APIRequestContext, name: string) {
  const response = await request.post('/api/plans', {
    data: { name, expectedBaseRevision: 'acceptance-1' },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}
const inspector = (page: Page) => page.locator('aside.studio-drawer')

async function openMainDistribution(page: Page) {
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  const sites = page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('button', { name: 'Sites', exact: true })
  if (await sites.count()) await sites.click()
  await page
    .getByRole('button', { name: 'Open Main Campus', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: 'Open racks of Main Distribution',
      exact: true,
    })
    .click()
  await expectMark(page, 'data-physical-level', 'node')
}

async function traceAgg03(page: Page) {
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
}

test('F04 a 3U HDF is one object over U4–U6, with real unit numbers and free units marked', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await expectMark(page, 'data-physical-level', 'rack')
  await expectMark(page, 'data-rack-equipment', 'hdf-01')
  await expectMark(page, 'data-rack-free-units', '12 11 10 9 8 7 3 2 1')
  const hdf = block(page, 'hdf-01')
  await expect(hdf).toHaveCount(1)
  await expect(hdf).toHaveAttribute('data-unit', '4')
  await expect(hdf).toHaveAttribute('data-height', '3')
  await expect(hdf).toContainText('HDF-01')
  await expect(hdf).toContainText('passive · 3U at U4–U6')
  // Unit labels run from the top down; free units say Available.
  await expect(page.locator('.rack-cabinet .unit-label')).toHaveText(
    Array.from({ length: 12 }, (_, i) => `U${12 - i}`),
  )
  await expect(slot(page, 'rack-sm01', 12)).toContainText('Available')
  await expect(slot(page, 'rack-sm01', 4)).toContainText('HDF-01')
  // Only this rack.
  await expect(slot(page, 'rack-core-01', 8)).toHaveCount(0)
})

test('clicking equipment opens its page without the inspector; Back returns to the rack with that equipment ringed', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 01',
  )
  await block(page, 'agg-03').click()
  await expectMark(page, 'data-physical-level', 'equipment')
  await expectMark(page, 'data-selected-equipment', 'agg-03')
  await expect(inspector(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectMark(page, 'data-physical-level', 'rack')
  await expect(block(page, 'agg-03')).toHaveAttribute('data-selected', 'true')
  await expect(block(page, 'hdf-02')).toHaveAttribute('data-selected', 'false')
  // The Inspect button opens the inspector for the same equipment.
  await page.getByRole('button', { name: 'Open inspector' }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText('AGG-03')
})

test('equipment on the selected route is teal, in the rack that holds it', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceAgg03(page)
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 01',
  )
  await expect(block(page, 'hdf-02')).toHaveAttribute('data-on-route', 'true')
  await expect(block(page, 'agg-03')).toHaveAttribute('data-on-route', 'true')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page
    .getByRole('button', { name: 'Open Rack Core 02', exact: true })
    .click()
  await expect(block(page, 'agg-08')).toHaveAttribute('data-on-route', 'false')
})

test('PHY-05 a chosen network mutes other networks’ equipment in the rack and never hides it', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network A' })
  await openRackInPhysical(page, 'DR Site', 'DR Access', 'Rack DR01')
  await expectMark(page, 'data-rack-equipment', 'panel-dr edge-22')
  await expect(block(page, 'edge-22')).toHaveAttribute('data-muted', 'true')
  await expect(block(page, 'panel-dr')).toHaveAttribute('data-muted', 'false')
})

test('PHY-06 a library drop and a move between two racks of Main Distribution propose placements; Installed is unchanged', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'Rack moves between racks')
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openMainDistribution(page)
  const preview = (rack: string) =>
    page.locator(`[data-testid="rack-preview"][data-rack-id="${rack}"]`)
  const inPreview = (rack: string, id: string) =>
    preview(rack).locator(`[data-equipment-id="${id}"]`)
  await expect(inPreview('rack-core-02', 'agg-15')).toHaveCount(1)

  // A move between two racks of the node: drag AGG-15 onto the other rack's preview.
  await inPreview('rack-core-02', 'agg-15').dragTo(preview('rack-core-03'))
  await expect(inPreview('rack-core-03', 'agg-15')).toHaveCount(1)
  await expect(inPreview('rack-core-02', 'agg-15')).toHaveCount(0)
  const plan = await (await request.get(`/api/plans/${id}`)).json()
  expect(plan.placements).toEqual([
    expect.objectContaining({ equipmentId: 'agg-15', rackId: 'rack-core-03' }),
  ])

  // A library item dropped on a preview starts a new item in that rack.
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Access switch' })
    .dragTo(preview('rack-core-01'))
  const form = page.getByTestId('equipment-form')
  await expect(form.getByLabel('Rack', { exact: true })).toHaveValue(
    'rack-core-01',
  )
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()

  // Installed is unchanged: by the API, and in the explorer after switching.
  const installed = await (
    await request.get('/api/topology?context=installed')
  ).json()
  expect(
    installed.equipment.find((e: { id: string }) => e.id === 'agg-15'),
  ).toMatchObject({ rackId: 'rack-core-02', unit: 6 })
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(inPreview('rack-core-02', 'agg-15')).toHaveCount(1)
  await expect(inPreview('rack-core-03', 'agg-15')).toHaveCount(0)
})

test('PHY-06 at rack level a drop on a free unit moves equipment inside the rack, and installed drops are refused', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'Rack moves inside a rack')
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 02',
  )
  await expect(slot(page, 'rack-core-02', 3)).toContainText('Available')
  await block(page, 'agg-15').dragTo(slot(page, 'rack-core-02', 3))
  await expect(slot(page, 'rack-core-02', 3)).toContainText('AGG-15')
  await expect(slot(page, 'rack-core-02', 6)).toContainText('Available')
  await expectMark(page, 'data-rack-equipment', 'agg-08 agg-15')
  const plan = await (await request.get(`/api/plans/${id}`)).json()
  expect(plan.placements).toEqual([
    expect.objectContaining({
      equipmentId: 'agg-15',
      rackId: 'rack-core-02',
      unit: 3,
    }),
  ])
  // Installed: the same rack, same equipment, nothing moved and no drop targets.
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 02',
  )
  await expect(slot(page, 'rack-core-02', 6)).toContainText('AGG-15')
  await expect(slot(page, 'rack-core-02', 3)).toHaveAttribute(
    'data-drop-target',
    'false',
  )
})

test('PHY-07 proposed equipment is marked PROPOSED at node and rack level, and absent from Installed', async ({
  page,
}) => {
  await page.goto('/?plan=expansion')
  await fitted(page)
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await page
    .getByRole('button', { name: 'Open Main Campus', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Open racks of Building A', exact: true })
    .click()
  const edge18 = page.locator(
    '[data-testid="rack-preview"][data-rack-id="rack-a03"] [data-equipment-id="edge-18"]',
  )
  await expect(edge18).toHaveAttribute('data-proposed', 'true')
  await expect(
    page.locator(
      '[data-testid="rack-preview"][data-rack-id="rack-a03"] [data-equipment-id="edge-17"]',
    ),
  ).toHaveAttribute('data-proposed', 'false')
  await expect(page.getByTestId('rack-preview')).toContainText(
    /[1-9]\d* proposed/,
  )
  await page.getByRole('button', { name: 'Open Rack A03', exact: true }).click()
  await expect(block(page, 'edge-18')).toHaveAttribute('data-proposed', 'true')
  await expect(block(page, 'edge-18')).toContainText('PROPOSED')
  await expect(block(page, 'edge-17')).toHaveAttribute('data-proposed', 'false')
  await expect(block(page, 'edge-17')).not.toContainText('PROPOSED')
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(block(page, 'edge-18')).toHaveCount(0)
  await expectMark(page, 'data-rack-equipment', 'panel-a edge-17')
})
