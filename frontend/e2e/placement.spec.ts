import { expect, test, type APIRequestContext } from '@playwright/test'
import { openRackInPhysical, expandResults } from './helpers'
import { chooseRack } from './patching-helpers'
import { getPlan } from './plan-api'

/** A fresh draft on the current Installed. */
async function newPlan(request: APIRequestContext, name: string) {
  const base = (
    await (await request.get('/api/topology?context=installed')).json()
  ).revision
  const response = await request.post('/api/plans', {
    data: { name, expectedBaseRevision: base },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

test('rack drops, persisted moves, collisions, and tracing through the rack view', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'Drag placement check')
  await page.goto(`/?plan=${id}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Access switch' })
    .dragTo(page.getByTestId('rack-slot-rack-a03-4'))
  const form = page.getByTestId('equipment-form')
  await expect(form.getByLabel('Unit', { exact: true })).toHaveValue('4')
  await expect(form.getByLabel('Rack', { exact: true })).toHaveValue('rack-a03')
  await expect(form.getByLabel('Network')).toHaveValue('')
  await form.getByLabel('Name').fill('DRAG-EDGE')
  await form.getByLabel('Network').selectOption('net-a')
  await form.getByLabel('Ports').fill('2')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(page.getByTestId('rack-slot-rack-a03-4')).toContainText(
    'DRAG-EDGE',
  )
  // A rack shows one rack at a time, so moves to other nodes use the placement
  // form in the inspector (the same command a drag sends).
  const moveWithForm = async (
    from: string,
    where: { site: string; node: string; rack: string },
    unit: string,
  ) => {
    await page.getByTestId(from).locator('.rack-block').click() // opens its page
    if ((await page.locator('aside.studio-drawer').count()) === 0)
      await page.getByRole('button', { name: 'Open inspector' }).click()
    await chooseRack(page, 'Placement', where)
    await page.getByLabel('Placement unit', { exact: true }).fill(unit)
    await page
      .getByRole('button', { name: 'Save planned placement', exact: true })
      .click()
    // Selecting opened the equipment page; Back returns to the rack.
    await page.getByRole('button', { name: 'Back', exact: true }).click()
  }
  await moveWithForm(
    'rack-slot-rack-a03-4',
    { site: 'DR Site', node: 'DR Distribution', rack: 'Rack DR02' },
    '3',
  )
  await expect(page.getByTestId('rack-slot-rack-a03-4')).not.toContainText(
    'DRAG-EDGE',
  )
  await moveWithForm(
    'rack-slot-rack-a03-8',
    { site: 'Main Campus', node: 'Main Distribution', rack: 'Rack Core 02' },
    '4',
  )
  await expect(page.getByTestId('rack-slot-rack-a03-8')).not.toContainText(
    'EDGE-17',
  )
  await page.getByLabel('Placement unit', { exact: true }).fill('8')
  await page
    .getByRole('button', { name: 'Save planned placement', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'U8 in Rack Core 02 is taken by AGG-08',
  )
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const draft = await (await request.get(`/api/plans/${id}`)).json()
  expect(draft.revision).toBe('4')
  expect(draft.equipment[0]).toMatchObject({ rackId: 'rack-dr02', unit: 3 })
  // The collision message is still on screen over the bottom of the page.
  await page.getByRole('button', { name: 'Dismiss placement error' }).click()
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expandResults(page)
  await expect(
    page.getByText(/4 cables · 3 internal bridges/).first(),
  ).toBeVisible()
  await page.reload()
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 02',
  )
  await expect(page.getByTestId('rack-slot-rack-core-02-4')).toContainText(
    'EDGE-17',
  )
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await expect(page.getByTestId('rack-slot-rack-a03-8')).toContainText(
    'EDGE-17',
  )
})

test('empty canvas creates an unplaced preview and saves only after rack assignment', async ({
  page,
  request,
}) => {
  await page.goto('/?plan=expansion')
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  const before = await (await request.get('/api/plans/expansion')).json()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Aggregation' })
    .dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 1300, y: 850 },
    })
  const form = page.getByTestId('equipment-form')
  await expect(form).toHaveAccessibleName('Add Aggregation')
  await expect(form.getByLabel('Rack', { exact: true })).toHaveValue('')
  await expect(
    page.getByText('Unplaced equipment preview', { exact: true }),
  ).toBeVisible()
  const after = await (await request.get('/api/plans/expansion')).json()
  expect(after.revision).toBe(before.revision)
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.unplaced-card')).toHaveCount(0)
  // A fresh draft takes the next one, which is saved after its rack is chosen.
  const id = await newPlan(request, 'Map creation check')
  await page.goto(`/?plan=${id}`)
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Access switch' })
    .dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 1300, y: 850 },
    })
  const next = page.getByTestId('equipment-form')
  await next.getByLabel('Name').fill('BOARD-EDGE')
  await next.getByLabel('Network').selectOption('net-a')
  await chooseRack(next, 'Place', {
    site: 'Main Campus',
    node: 'Building A',
    rack: 'Rack A03',
  })
  await next.getByLabel('Ports').fill('2')
  await next.getByRole('button', { name: 'Add to plan' }).click()
  await expect(page.locator('.unplaced-card')).toHaveCount(0)
  await expect(
    page.locator('.equipment-card').filter({ hasText: 'BOARD-EDGE' }),
  ).toBeVisible()
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await expect(page.getByTestId('rack-slot-rack-a03-1')).toContainText(
    'BOARD-EDGE',
  )
})

test('P2-1 the Add form picks its rack as Site › Node › Rack, starting at the open rack', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'Picker check')
  await page.goto(`/?plan=${id}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Access switch…' }).click()
  const form = page.getByTestId('equipment-form')
  const place = form.getByRole('group', { name: 'Place', exact: true })
  const level = (name: string) => place.getByLabel(name, { exact: true })
  await expect(level('Site')).toHaveValue('site-main-campus')
  await expect(level('Node')).toHaveValue('node-building-a')
  await expect(level('Rack')).toHaveValue('rack-a03')
  // A left-to-right mark after "· " keeps a Hebrew rack name in place (optionText).
  await expect(level('Rack').locator('option:checked')).toHaveText(
    'Rack A03 · \u200E12U',
  )
  // A site change moves Node and Rack to that site's first.
  await level('Site').selectOption('site-dr')
  await expect(level('Node')).toHaveValue('node-dr-access')
  await expect(level('Rack')).toHaveValue('rack-dr01')
  await chooseRack(form, 'Place', {
    site: 'Main Campus',
    node: 'Main Distribution',
    rack: 'Rack Core 03',
  })
  await page.screenshot({ path: 'test-results/p2-1-add-form.png' })
  await form.getByLabel('Name').fill('PICK-EDGE')
  await form.getByLabel('Network').selectOption('net-a')
  await form.getByLabel('Ports').fill('2')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(form).toHaveCount(0)
  const plan = await getPlan(request, id)
  expect(
    plan.equipment.find((e: { name: string }) => e.name === 'PICK-EDGE'),
  ).toMatchObject({ rackId: 'rack-core-03', unit: 1 })
})

test('P2-1 at node level the Add form starts in that node', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'Node level check')
  await page.goto(`/?plan=${id}`)
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
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Access switch…' }).click()
  const form = page.getByTestId('equipment-form')
  const place = form.getByRole('group', { name: 'Place', exact: true })
  const level = (name: string) => place.getByLabel(name, { exact: true })
  await expect(level('Site')).toHaveValue('site-main-campus')
  await expect(level('Node')).toHaveValue('node-main-distribution')
  await expect(level('Rack')).toHaveValue('')
  await form.getByLabel('Name').fill('NODE-EDGE')
  await form.getByLabel('Network').selectOption('net-a')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(form.getByTestId('edit-error')).toContainText('Choose a rack.')
})
