import { expect, test, type APIRequestContext } from './fixtures'
import {
  chooseMore,
  findAggBb,
  openRackInPhysical,
  traceRoutes,
} from './helpers'
import { chooseRack } from './patching-helpers'
import { getPlan, unique } from './plan-api'
import {
  addBox,
  boxAdd,
  dragAndOpenBox,
  libraryEntry,
  openLibrary,
} from './add-box'
import { createModel, modelInput } from './models-api'

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
  const model = await createModel(request, modelInput(unique('PLACE')))
  await dragAndOpenBox(page, model.name, 'rack-a03', 4)
  const form = addBox(page)
  await expect(form).toContainText('at U4')
  await expect(form.getByLabel('Network')).toHaveValue('net-a')
  await form.getByLabel('Name').fill('DRAG-EDGE')
  await boxAdd(page).click()
  await expect(page.getByTestId('rack-slot-rack-a03-4')).toContainText(
    'DRAG-EDGE',
  )
  // A rack shows one rack at a time, so moves to other nodes use the equipment page's
  // ⋯ Move to another rack… (the same command a drag sends).
  const moveWithForm = async (
    from: string,
    where: { site: string; node: string; rack: string },
    unit: string,
    back = true,
  ) => {
    if (back) await page.getByTestId(from).locator('.rack-block').dblclick() // opens its page
    await chooseMore(page, 'Move to another rack…')
    const box = page.getByTestId('move-equipment')
    await chooseRack(box, 'Move to', where)
    await box.getByLabel('Unit', { exact: true }).fill(unit)
    await box.getByRole('button', { name: 'Move', exact: true }).click()
    // Selecting opened the equipment page; Back returns to the rack.
    if (back)
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
  // EDGE-17 is now in Rack Core 02 at U4: U8 there is AGG-08's.
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 02',
  )
  await page
    .getByTestId('rack-slot-rack-core-02-4')
    .locator('.rack-block')
    .dblclick()
  await moveWithForm(
    '',
    { site: 'Main Campus', node: 'Main Distribution', rack: 'Rack Core 02' },
    '8',
    false,
  )
  await expect(page.getByRole('alert')).toContainText(
    'U8 in Rack Core 02 is taken by AGG-08',
  )
  const draft = await (await request.get(`/api/plans/${id}`)).json()
  expect(draft.revision).toBe('4')
  expect(draft.equipment[0]).toMatchObject({ rackId: 'rack-dr02', unit: 3 })
  // The collision message is still on screen over the bottom of the page.
  await page.getByRole('button', { name: 'Dismiss placement error' }).click()
  // Selecting a switch is done from the map: the rack view has no inspector to pick from.
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await findAggBb(page)
  await expect(traceRoutes(page).first()).toContainText('4 cables')
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

test('P2-1 a pick with the rack shown needs no rack; the free units are its targets', async ({
  page,
  request,
}) => {
  const model = await createModel(request, modelInput(unique('PICK')))
  const id = await newPlan(request, 'Picker check')
  await page.goto(`/?plan=${id}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await openLibrary(page)
  await libraryEntry(page, model.name).click()
  const note = page.getByTestId('pick-note')
  await expect(note).toContainText('click a free unit in the rack')
  await expect(note.getByRole('group', { name: 'Rack' })).toHaveCount(0)
  await expect(page.getByTestId('rack-slot-rack-a03-4')).toHaveAttribute(
    'data-pick-target',
    'true',
  )
  // Cancel lets it go.
  await note.getByRole('button', { name: 'Cancel' }).click()
  await expect(note).toHaveCount(0)
  await expect(page.getByTestId('rack-slot-rack-a03-4')).toHaveAttribute(
    'data-pick-target',
    'false',
  )
})

test('P2-1 a pick at node level asks for Site › Node › Rack, starting in that node, then opens the rack', async ({
  page,
  request,
}) => {
  const model = await createModel(request, modelInput(unique('NODEPICK')))
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
  await openLibrary(page)
  await libraryEntry(page, model.name).click()
  const note = page.getByTestId('pick-note')
  const place = note.getByRole('group', { name: 'Rack', exact: true })
  const level = (name: string) => place.getByLabel(name, { exact: true })
  await expect(level('Site')).toHaveValue('site-main-campus')
  await expect(level('Node')).toHaveValue('node-main-distribution')
  await expect(level('Rack')).toHaveValue('')
  await expect(note.getByRole('button', { name: 'Show rack' })).toBeDisabled()
  // A site change moves Node and Rack to that site's first; a left-to-right mark
  // after "· " keeps a Hebrew rack name in place (optionText).
  await level('Site').selectOption('site-dr')
  await expect(level('Node')).toHaveValue('node-dr-access')
  await expect(level('Rack')).toHaveValue('rack-dr01')
  await expect(level('Rack').locator('option:checked')).toHaveText(
    'Rack DR01 · \u200E12U',
  )
  await chooseRack(note, 'Rack', {
    site: 'Main Campus',
    node: 'Main Distribution',
    rack: 'Rack Core 03',
  })
  await note.getByRole('button', { name: 'Show rack' }).click()
  // The rack is shown; its free units take the pick.
  await expect(page.getByTestId('rack-slot-rack-core-03-1')).toHaveAttribute(
    'data-pick-target',
    'true',
  )
  await page.getByTestId('rack-slot-rack-core-03-1').click()
  const box = addBox(page)
  await box.getByLabel('Name').fill('PICK-EDGE')
  await box.getByLabel('Network').selectOption('net-a')
  await boxAdd(page).click()
  await expect(box).toHaveCount(0)
  const plan = await getPlan(request, id)
  expect(
    plan.equipment.find((e: { name: string }) => e.name === 'PICK-EDGE'),
  ).toMatchObject({ rackId: 'rack-core-03', unit: 1 })
})
