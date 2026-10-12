import { expect, test, type Page } from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'
import { addSwitch, getPlan, newPlan, unique } from './plan-api'
import {
  chooseFar,
  farJack,
  madeCount,
  pairs,
  patching,
  useRange,
} from './patching-helpers'

// The explorer writes its state on its root; these specs assert that model.
const root = (page: Page) => page.locator('.physical-explorer')
const expectMark = (page: Page, name: string, value: string) =>
  expect
    .poll(() => root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name))
    .toBe(value)
const box = patching
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/bk-02-${name}.png` })

/** A draft with EDGE-19 (24 ports) in Rack A03, opened in Physical on its face. */
async function openEdge19(
  page: Page,
  request: Parameters<typeof newPlan>[0],
  port: number,
) {
  const id = await newPlan(request, unique('Range'))
  const edge = await addSwitch(request, id, 'rack-a03', 'EDGE-19', 3, 24)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator(`.rack-block[data-equipment-id="${edge}"]`).click()
  await page.locator(`[data-endpoint-id="${edge}:p${port}"]`).click()
  await expectMark(page, 'data-selected-endpoint', `${edge}:p${port}`)
  await page.getByRole('button', { name: 'Connect a range…' }).click()
  await expect(box(page)).toBeVisible()
  return { id, edge }
}

const BUILDING_A = {
  site: 'Main Campus',
  node: 'Building A',
  rack: 'Rack A03',
}

test('BK-02 ports 1–6 of EDGE-19 connect to PANEL-A front 4–9 in one action', async ({
  page,
  request,
}) => {
  const { id } = await openEdge19(page, request, 1)
  await useRange(page, 6)
  await chooseFar(page, { ...BUILDING_A, equipment: 'PANEL-A' }, 'Front')
  await farJack(page, 'panel-a:4:f').click()
  await expect(pairs(page)).toHaveCount(6)
  await expect(pairs(page).first()).toContainText('Port 1 →')
  await expect(pairs(page).first()).toContainText('PANEL-A · 4 · Front')
  await expect(pairs(page).last()).toContainText('PANEL-A · 9 · Front')
  await box(page).getByRole('button', { name: 'Connect 6' }).click()
  // The screen stays open for the next run; what it made is listed.
  await madeCount(page, 6)
  await expect(pairs(page)).toHaveCount(0)
  expect((await getPlan(request, id)).revision).toBe('3')
  expect((await getPlan(request, id)).links).toHaveLength(6)
  await box(page).getByRole('button', { name: 'Done' }).click()
  await expect(box(page)).toHaveCount(0)

  await page.getByRole('button', { name: /^Changes/ }).click()
  const lines = page.getByTestId('change-line')
  await expect(
    page
      .getByTestId('change-group')
      .filter({ hasText: 'Cables connected · 6' }),
  ).toBeVisible()
  await expect(lines.filter({ hasText: 'EDGE-19 · Port 6' })).toContainText(
    'PANEL-A · 9 · Front',
  )
  await shot(page, 'changes-drawer')
})

test('BK-02 a range past the last port is blocked until Skip is ticked, then connects the rest', async ({
  page,
  request,
}) => {
  const { id } = await openEdge19(page, request, 20)
  await useRange(page, 8)
  await chooseFar(
    page,
    {
      site: 'DR Site',
      node: 'DR Access',
      rack: 'Rack DR01',
      equipment: 'PANEL-DR',
    },
    'Front',
  )
  await farJack(page, 'panel-dr:10:f').click()
  await expect(pairs(page)).toHaveCount(8)
  const connect = box(page).getByRole('button', { name: /^Connect/ })
  await expect(connect).toBeDisabled()
  await expect(pairs(page).nth(5)).toContainText('past the last position')
  await expect(pairs(page).nth(7)).toContainText('past the last position')
  await expect(
    box(page).getByTestId('range-pairs').locator('[data-blocked="true"]'),
  ).toHaveCount(3)
  await shot(page, 'blocked')
  await box(page)
    .getByLabel(/^Skip the 3 pairs/)
    .check()
  await expect(connect).toHaveText('Connect 5')
  await expect(connect).toBeEnabled()
  await shot(page, 'skip-ticked')
  await connect.click()
  await madeCount(page, 5)
  expect((await getPlan(request, id)).links).toHaveLength(5)
})

test('BK-02 into HDF-01 from 1A/1 front, 1A/2 is marked as already cabled', async ({
  page,
  request,
}) => {
  await openEdge19(page, request, 1)
  await useRange(page, 3)
  await chooseFar(
    page,
    {
      site: 'Main Campus',
      node: 'North Sub-main',
      rack: 'Rack SM01',
      equipment: 'HDF-01',
    },
    'Front',
  )
  await farJack(page, 'hdf-01:sp-1A:1:f').click()
  await expect(pairs(page).nth(1)).toContainText(
    'HDF-01 · 1A/2 front is already cabled (cable-a07)',
  )
  await expect(
    box(page).getByRole('button', { name: /^Connect/ }),
  ).toBeDisabled()
})

test('BK-02 an HDF range continues from 1D/6 to 2A/1', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Range'))
  const edge = await addSwitch(request, id, 'rack-a03', 'EDGE-19', 3, 24)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
  await page.locator('[data-endpoint-id="hdf-01:sp-1D:1:f"]').click()
  await page.getByRole('button', { name: 'Connect a range…' }).click()
  await useRange(page, 8)
  await chooseFar(page, { ...BUILDING_A, equipment: 'EDGE-19' })
  await farJack(page, `${edge}:p1`).click()
  await expect(pairs(page)).toHaveCount(8)
  const names = await pairs(page).allInnerTexts()
  expect(names.map((n) => n.match(/(\d[A-D]\/\d) front →/)?.[1])).toEqual([
    '1D/1',
    '1D/2',
    '1D/3',
    '1D/4',
    '1D/5',
    '1D/6',
    '2A/1',
    '2A/2',
  ])
})

test('BK-02 the server refuses a cable between two endpoints of one piece of equipment, in names', async ({
  request,
}) => {
  const id = await newPlan(request, unique('Range'))
  const edge = await addSwitch(request, id, 'rack-a03', 'EDGE-19', 3, 24)
  const plan = await getPlan(request, id)
  const response = await request.post(`/api/plans/${id}/commands`, {
    data: {
      type: 'batch',
      expectedRevision: plan.revision,
      batch: {
        commands: [
          { type: 'add_cable', cable: { a: `${edge}:p1`, b: 'agg-15:p4' } },
          { type: 'add_cable', cable: { a: `${edge}:p2`, b: `${edge}:p3` } },
        ],
      },
    },
  })
  expect(response.status()).toBe(422)
  expect((await response.json()).error).toContain(
    'command 2 (add_cable): EDGE-19 · Port 2 and EDGE-19 · Port 3 are on the same equipment',
  )
})
