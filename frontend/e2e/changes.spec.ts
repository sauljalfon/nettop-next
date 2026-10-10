import { expect, test, type Page } from '@playwright/test'
import { fitted } from './helpers'
import {
  addRoom,
  addSwitch,
  command,
  getPlan,
  newPlan,
  unique,
} from './plan-api'

// The explorer writes its state on its root; these specs assert that model.
const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)

const openChanges = async (page: Page) => {
  await page.getByRole('button', { name: /^Changes/ }).click()
  await expect(
    page.getByRole('complementary', { name: 'Changes & plans' }),
  ).toBeVisible()
}
const line = (page: Page, text: string) =>
  page.getByTestId('change-line').filter({ hasText: text })

/** A draft with every kind of change, made through the API. */
async function everything(request: Parameters<typeof newPlan>[0]) {
  const label = unique('Chg')
  const id = await newPlan(request, `Summary ${label}`)
  const room = await addRoom(request, id, label)
  const sw = await addSwitch(request, id, 'rack-a03', `SW-${label}`, 6)
  await command(request, id, {
    type: 'move_equipment',
    placement: { equipmentId: 'agg-15', rackId: 'rack-core-03', unit: 3 },
  })
  await command(request, id, {
    type: 'delete_equipment',
    target: { id: 'panel-a' },
  })
  await command(request, id, {
    type: 'add_cable',
    cable: { a: `${sw}:p1`, b: 'agg-15:p2' },
  })
  await command(request, id, {
    type: 'disconnect_cable',
    target: { id: 'cable-a12' },
  })
  return { id, label, sw, ...room }
}

test('RC-04 the Changes drawer groups the draft in names, and every line opens its object', async ({
  page,
  request,
}) => {
  const d = await everything(request)
  await page.goto(`/?plan=${d.id}`)
  await fitted(page)
  await openChanges(page)

  const groups = page.getByTestId('change-group')
  await expect(groups.locator('h3')).toHaveText([
    'Containers added · 3',
    'Equipment added · 1',
    'Moved · 1',
    'Removed · 1',
    'Cables connected · 1',
    'Cables disconnected · 1',
  ])
  const texts = await page
    .getByTestId('change-line')
    .locator('.what')
    .allInnerTexts()
  expect(texts).toEqual([
    `Site · ${d.label} Site`,
    `Node · ${d.label} Hall in ${d.label} Site`,
    `Rack · ${d.label} R1 (24U) in ${d.label} Hall`,
    `SW-${d.label} · access switch · Rack A03 U6`,
    'AGG-15 · Rack Core 02 U6 → Rack Core 03 U3',
    'PANEL-A with 6 cables',
    // The server keeps a cable's ends in ID order, so AGG-15 comes first.
    `AGG-15 · Port 2 ↔ SW-${d.label} · Port 1`,
    'HDF-02 · 3A/1 rear ↔ BB-01 · Port 1',
  ])
  // Names, never the IDs the server made up.
  for (const id of [d.sw, d.siteId, d.nodeId, d.rackId])
    for (const t of texts) expect(t).not.toContain(id)
  await expect(page.getByRole('button', { name: /^Undo:/ })).toHaveCount(8)

  // Links: equipment, endpoint and container lines open their object in Physical.
  await line(page, `SW-${d.label} · access switch`)
    .getByRole('button')
    .first()
    .click()
  await expectMark(page, 'data-physical-level', 'equipment')
  await expectMark(page, 'data-selected-equipment', d.sw)
  await line(page, 'AGG-15 · Port 2 ↔').getByRole('button').first().click()
  await expectMark(page, 'data-selected-endpoint', 'agg-15:p2')
  await line(page, `Rack · ${d.label} R1`).getByRole('button').first().click()
  await expectMark(page, 'data-physical-level', 'rack')
  await line(page, `Node · ${d.label} Hall`).getByRole('button').first().click()
  await expectMark(page, 'data-physical-level', 'node')
  await line(page, `Site · ${d.label} Site`).getByRole('button').first().click()
  await expectMark(page, 'data-physical-level', 'site')
  // A removal has nothing left to open: its line is plain text.
  await expect(
    line(page, 'PANEL-A with 6 cables').getByRole('button', {
      name: /^PANEL-A/,
    }),
  ).toHaveCount(0)
})

test('ED-15 Undo on a removal brings the object back; Undo on an added switch also undoes its cable', async ({
  page,
  request,
}) => {
  const d = await everything(request)
  await page.goto(`/?plan=${d.id}`)
  await fitted(page)
  await openChanges(page)

  // The removal: PANEL-A and its 6 cables come back in the plan.
  await page
    .getByRole('button', { name: 'Undo: PANEL-A with 6 cables' })
    .click()
  await expect(line(page, 'PANEL-A')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText(
    'Undid: PANEL-A with 6 cables',
  )
  const afterRemoval = await getPlan(request, d.id)
  expect(afterRemoval.removals.equipment ?? []).toEqual([])
  const planned = await (
    await request.get(`/api/topology?context=planned&planId=${d.id}`)
  ).json()
  expect(planned.equipment.map((e: { id: string }) => e.id)).toContain(
    'panel-a',
  )
  const links = planned.links.map((l: { id: string }) => l.id)
  for (const id of [
    'cable-a01',
    'cable-a02',
    'cable-a05',
    'cable-a06',
    'cable-a09',
    'cable-a10',
  ])
    expect(links).toContain(id)

  // The disconnect comes back the same way.
  await page.getByRole('button', { name: /^Undo: HDF-02 · 3A\/1 rear/ }).click()
  await expect(line(page, 'HDF-02')).toHaveCount(0)
  expect((await getPlan(request, d.id)).removals.links ?? []).toEqual([])

  // The added switch takes its cable with it, and the toast counts it.
  await page
    .getByRole('button', {
      name: new RegExp(`^Undo: SW-${d.label} · access switch`),
    })
    .click()
  await expect(page.getByRole('status')).toContainText(
    '(also undid 1 dependent change)',
  )
  await expect(line(page, `SW-${d.label}`)).toHaveCount(0)
  const last = await getPlan(request, d.id)
  expect(last.equipment).toEqual([])
  expect(
    last.links.filter((l: { kind: string }) => l.kind === 'cable'),
  ).toEqual([])
  // The rest is untouched.
  await expect(
    line(page, 'AGG-15 · Rack Core 02 U6 → Rack Core 03 U3'),
  ).toHaveCount(1)
})
