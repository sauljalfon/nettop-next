import { expect, test } from './fixtures'
import {
  addBox,
  boxAdd,
  BUILDING_A_RACK,
  dragAndOpenBox,
  libraryEntry,
  openLibrary,
  pickAndOpenBox,
} from './add-box'
import { openRackInPhysical } from './helpers'
import { createModel, modelInput } from './models-api'
import { getPlan, newPlan, unique } from './plan-api'

const names = (plan: { equipment: { name: string }[] }) =>
  plan.equipment.map((e) => e.name)

test('D51-04 drag a model onto a free unit: the box suggests the next name and the rack’s network, How many 2 adds two with the model’s ports', async ({
  page,
  request,
}) => {
  const model = await createModel(request, modelInput(unique('C9300-48P')))
  const plan = await newPlan(request, unique('Box drag'))
  await page.goto(`/?plan=${plan}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await dragAndOpenBox(page, model.name, 'rack-a03', 6)
  const box = addBox(page)
  await expect(box).toContainText(`Add ${model.name}`)
  await expect(box).toContainText('at U6')
  // EDGE-17 is the node's only access switch, on Network A.
  await expect(box.getByLabel('Name')).toHaveValue('EDGE-18')
  await expect(box.getByLabel('Network')).toHaveValue('net-a')
  await expect(box).toContainText('like the other switches in this rack')
  await box.getByLabel('How many').fill('2')
  await expect(box).toContainText('EDGE-18 · EDGE-19')
  // The units it will take are marked in the rack.
  await expect(page.getByTestId('rack-slot-rack-a03-6')).toHaveAttribute(
    'data-preview',
    'true',
  )
  await expect(page.getByTestId('rack-slot-rack-a03-5')).toHaveAttribute(
    'data-preview',
    'true',
  )
  await boxAdd(page).click()
  await expect(addBox(page)).toHaveCount(0)
  const saved = await getPlan(request, plan)
  expect(names(saved)).toEqual(['EDGE-18', 'EDGE-19'])
  expect(saved.equipment[0]).toMatchObject({
    networkId: 'net-a',
    rackId: 'rack-a03',
    unit: 6,
    model: model.name,
    manufacturer: 'Cisco',
  })
  expect(saved.equipment[1]).toMatchObject({ unit: 5, model: model.name })
  const topology = await (
    await request.get(`/api/topology?context=planned&planId=${plan}`)
  ).json()
  const edge = topology.equipment.find(
    (e: { name: string }) => e.name === 'EDGE-18',
  )
  const ports = topology.endpoints
    .filter((p: { equipmentId: string }) => p.equipmentId === edge.id)
    .sort(
      (a: { position: number }, b: { position: number }) =>
        a.position - b.position,
    )
  expect(ports).toHaveLength(52)
  expect(ports[0]).toMatchObject({
    label: 'Gi1/0/1',
    position: 1,
    portGroup: 1,
    portType: 'copper',
    connector: 'RJ45',
    speed: '1G',
  })
  expect(ports[51]).toMatchObject({
    label: 'Te1/1/4',
    position: 52,
    portGroup: 2,
    portType: 'fiber',
    connector: 'SFP+',
    speed: '10G',
  })
  // Changes lists both.
  await page
    .getByRole('banner')
    .getByRole('button', { name: /Changes/ })
    .click()
  const summary = page.getByTestId('draft-summary')
  await expect(summary).toContainText('EDGE-18')
  await expect(summary).toContainText('EDGE-19')
})

test('D51-05 click to pick a 12-position panel and an HDF with 12 rows and 4U', async ({
  page,
  request,
}) => {
  const plan = await newPlan(request, unique('Box pick'))
  await page.goto(`/?plan=${plan}`)
  await pickAndOpenBox(page, 'Patch panel', BUILDING_A_RACK, 9)
  let box = addBox(page)
  await expect(box.getByLabel('Name')).toHaveValue('')
  await box.getByLabel('Name').fill('PNL-12')
  await box.getByRole('button', { name: '12', exact: true }).click()
  await boxAdd(page).click()
  await expect(addBox(page)).toHaveCount(0)
  let saved = await getPlan(request, plan)
  expect(saved.equipment[0]).toMatchObject({
    name: 'PNL-12',
    kind: 'panel',
    unit: 9,
    height: 1,
  })
  const topology = await (
    await request.get(`/api/topology?context=planned&planId=${plan}`)
  ).json()
  const panel = topology.equipment.find(
    (e: { name: string }) => e.name === 'PNL-12',
  )
  expect(
    topology.endpoints.filter(
      (p: { equipmentId: string }) => p.equipmentId === panel.id,
    ),
  ).toHaveLength(24)

  // The HDF: rows and height typed, placed from the unit clicked downwards.
  await openLibrary(page)
  await libraryEntry(page, 'HDF').click()
  await page.getByTestId('rack-slot-rack-a03-7').click()
  box = addBox(page)
  await expect(box).toContainText('12 rows')
  await box.getByLabel('Name').fill('HDF-NEW')
  await box.getByLabel('Rows').fill('12')
  await box.getByLabel('Height (U)').fill('4')
  await expect(box).toContainText('at U7 down to U4')
  await boxAdd(page).click()
  await expect(addBox(page)).toHaveCount(0)
  saved = await getPlan(request, plan)
  expect(names(saved)).toContain('HDF-NEW')
  const hdf = (
    await (
      await request.get(`/api/topology?context=planned&planId=${plan}`)
    ).json()
  ).equipment.find((e: { name: string }) => e.name === 'HDF-NEW')
  expect(hdf).toMatchObject({ kind: 'hdf', unit: 4, height: 4 })
})

test('D51-06 refusals in words: more than the free units below, a model that is gone', async ({
  page,
  request,
}) => {
  const model = await createModel(request, modelInput(unique('Gone model')))
  const plan = await newPlan(request, unique('Box refuse'))
  await page.goto(`/?plan=${plan}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await dragAndOpenBox(page, model.name, 'rack-a03', 10)
  const box = addBox(page)
  // U10 and U9 are free, U8 is EDGE-17.
  await box.getByLabel('How many').fill('3')
  await expect(box).toContainText(
    'Not enough free units below U10 for 3 × 1U. Choose fewer or a higher unit.',
  )
  await expect(boxAdd(page)).toBeDisabled()
  await box.getByLabel('How many').fill('2')
  await expect(boxAdd(page)).toBeEnabled()

  // The model is deleted while the box is open: nothing is added.
  const gone = await request.delete(`/api/switch-models/${model.id}`)
  expect(gone.status()).toBe(204)
  await boxAdd(page).click()
  await expect(box).toContainText('This model is gone')
  expect(names(await getPlan(request, plan))).toEqual([])
})

test('D51-07 a long Hebrew model name is isolated and cut at the end in its library card', async ({
  page,
  request,
}) => {
  const name = `${unique('מתג')} ${'גישה ארוך מאוד '.repeat(5)}C9300`
  await createModel(request, modelInput(name.slice(0, 100)))
  const plan = await newPlan(request, unique('Box hebrew'))
  await page.goto(`/?plan=${plan}`)
  await openLibrary(page)
  const card = libraryEntry(page, 'מתג')
  await expect(card).toBeVisible()
  await expect(card.locator('bdi')).toHaveCount(1)
  const title = card.locator('strong')
  const cut = await title.evaluate((el) => ({
    over: el.scrollWidth > el.clientWidth,
    overflow: getComputedStyle(el).textOverflow,
  }))
  expect(cut).toEqual({ over: true, overflow: 'ellipsis' })
  const dock = await page.locator('.dock').boundingBox()
  const box = await card.boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(dock!.x + dock!.width)
})
