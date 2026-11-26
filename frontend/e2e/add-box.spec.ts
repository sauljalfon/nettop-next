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

/** The body of a browser function (el): true when the first character of the element's text is inside its box, that is, the cut took the end of the name, not the start. */
const START_SHOWN = `const t = el.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 1); const c = r.getBoundingClientRect(); const o = el.getBoundingClientRect(); return c.left >= o.left - 1 && c.right <= o.right + 1`

/** A long model name in Hebrew only (digits aside), unique: its start is at the right edge, so a cut from the wrong side takes it. */
const hebrewName = () => {
  const id = [...Math.random().toString(36).slice(2, 7)]
    .map((c) => String.fromCharCode(0x5d0 + (Number.parseInt(c, 36) % 27)))
    .join('')
  return `מתג ${id} ${'גישה ארוך מאוד '.repeat(5)}9300`.slice(0, 100)
}

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
  const name = hebrewName()
  await createModel(request, modelInput(name))
  const plan = await newPlan(request, unique('Box hebrew'))
  await page.goto(`/?plan=${plan}`)
  await openLibrary(page)
  const card = libraryEntry(page, 'מתג')
  await expect(card).toBeVisible()
  await expect(card.locator('bdi')).toHaveCount(1)
  // The bdi (dir=auto) is itself the element that cuts the name: a Hebrew name loses its end, never its start.
  const title = card.locator('bdi')
  await expect(title).toHaveAttribute('dir', 'auto')
  const cut = await title.evaluate((el, src) => {
    const startShown = new Function('el', src) as (e: Element) => boolean
    return {
      over: el.scrollWidth > el.clientWidth,
      overflow: getComputedStyle(el).textOverflow,
      startShown: startShown(el),
    }
  }, START_SHOWN)
  expect(cut).toEqual({ over: true, overflow: 'ellipsis', startShown: true })
  const dock = await page.locator('.dock').boundingBox()
  const box = await card.boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(dock!.x + dock!.width)
})

test('D51-07b a long Hebrew model name keeps the add box whole: the title and the model line are cut at the end, nothing leaves the box', async ({
  page,
  request,
}) => {
  const name = hebrewName()
  const model = await createModel(request, modelInput(name))
  const plan = await newPlan(request, unique('Box hebrew 2'))
  await page.goto(`/?plan=${plan}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await dragAndOpenBox(page, model.name, 'rack-a03', 6)
  const box = addBox(page)
  await expect(box.getByLabel('Name')).toBeVisible()
  const result = await box.evaluate((el, src) => {
    const startShown = new Function('el', src) as (e: Element) => boolean
    const outer = el.getBoundingClientRect()
    const cut = [...el.querySelectorAll('bdi')].map((b) => ({
      dir: b.getAttribute('dir'),
      over: b.scrollWidth > b.clientWidth,
      ellipsis: getComputedStyle(b).textOverflow,
      startShown: startShown(b),
    }))
    const outside = [...el.querySelectorAll('*')]
      .filter((c) => c.getBoundingClientRect().width > 0)
      .filter((c) => {
        const r = c.getBoundingClientRect()
        return r.right > outer.right + 1 || r.left < outer.left - 1
      })
      .map((c) => c.tagName + ':' + (c.textContent ?? '').slice(0, 20))
    return { cut, outside, horizontal: el.scrollWidth > el.clientWidth }
  }, START_SHOWN)
  expect(result.outside).toEqual([])
  expect(result.horizontal).toBe(false)
  expect(result.cut.length).toBe(2) // the title and the model line
  for (const c of result.cut)
    expect(c).toMatchObject({
      dir: 'auto',
      over: true,
      ellipsis: 'ellipsis',
      startShown: true,
    })
  await expect(box).toContainText('at U6')
  await expect(box.getByText('Proposed')).toBeVisible()
})

test('D51-08 the Add tab says how to add once: one line under its title, no second card repeating it', async ({
  page,
  request,
}) => {
  const plan = await newPlan(request, unique('Box note'))
  await page.goto(`/?plan=${plan}`)
  await openLibrary(page)
  const dock = page.getByRole('complementary', { name: 'Equipment library' })
  await expect(dock).toContainText(
    'Drag onto a free unit, or click an item and then a unit.',
  )
  await expect(dock.getByText(/Drag onto/)).toHaveCount(1)
  await expect(dock.getByText('Build your planned network')).toHaveCount(0)
  await expect(dock).not.toContainText('add an HDF with its form')
})

test('D51-09 an HDF opens at the height that fits its unit, refuses in words about its height only, and the marks of every unit it takes are the same', async ({
  page,
  request,
}) => {
  const plan = await newPlan(request, unique('Box hdf'))
  await page.goto(`/?plan=${plan}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  // U5 has U4 and U3 free below it, then the UPS: the default 4U does not fit, 3U does.
  await dragAndOpenBox(page, 'HDF', 'rack-a03', 5)
  const box = addBox(page)
  await expect(box.getByLabel('Height (U)')).toHaveValue('3')
  await expect(box.getByTestId('add-box-refusal')).toHaveCount(0)
  await expect(box).toContainText('at U5 down to U3')
  await box.getByLabel('Height (U)').fill('4')
  await expect(box.getByTestId('add-box-refusal')).toHaveText(
    'Not enough free units below U5 for 4U. Choose a lower height or a higher unit.',
  )
  await expect(box).toContainText('at U5')
  await expect(boxAdd(page)).toBeDisabled()
  await box.getByLabel('Height (U)').fill('3')
  // The clicked unit is marked like the others even while the mouse stays on it.
  const look = (unit: number) =>
    page.getByTestId(`rack-slot-rack-a03-${unit}`).evaluate((el) => {
      const s = getComputedStyle(el)
      return [s.backgroundColor, s.borderTopStyle, s.borderTopColor]
    })
  await page.getByTestId('rack-slot-rack-a03-5').hover()
  const [five, four, three] = [await look(5), await look(4), await look(3)]
  expect(five).toEqual(four)
  expect(four).toEqual(three)
})
