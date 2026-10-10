import { expect, test, type APIRequestContext } from '@playwright/test'
import { openRackInPhysical, expandResults } from './helpers'

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
  const moveWithForm = async (from: string, rack: string, unit: string) => {
    await page.getByTestId(from).locator('.rack-block').click() // opens its page
    if ((await page.locator('aside.studio-drawer').count()) === 0)
      await page.getByRole('button', { name: 'Open inspector' }).click()
    await page.getByLabel('Placement rack').selectOption(rack)
    await page.getByLabel('Placement unit', { exact: true }).fill(unit)
    await page
      .getByRole('button', { name: 'Save planned placement', exact: true })
      .click()
    // Selecting opened the equipment page; Back returns to the rack.
    await page.getByRole('button', { name: 'Back', exact: true }).click()
  }
  await moveWithForm('rack-slot-rack-a03-4', 'rack-dr02', '3')
  await expect(page.getByTestId('rack-slot-rack-a03-4')).not.toContainText(
    'DRAG-EDGE',
  )
  await moveWithForm('rack-slot-rack-a03-8', 'rack-core-02', '4')
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
  await next.getByLabel('Rack', { exact: true }).selectOption('rack-a03')
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
