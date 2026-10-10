import { expect, test, type Page } from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'
import {
  addRoom,
  addSwitch,
  command,
  getPlan,
  newPlan,
  unique,
} from './plan-api'

const box = (page: Page, name: string) =>
  page.getByRole('group', { name, exact: true })
const lines = (page: Page, name: string) =>
  box(page, name).getByTestId('copy-preview').locator('li')
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/bk-03-${name}.png` })

test('BK-03 "3 more like EDGE-18" fills the next free units with EDGE-19…EDGE-21 and one port each', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Dup'))
  await addSwitch(request, id, 'rack-a03', 'EDGE-18', 6, 1)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block', { hasText: 'EDGE-18' }).click()
  await page.getByRole('button', { name: 'Duplicate EDGE-18…' }).click()
  const dup = box(page, 'Duplicate')
  await expect(dup.getByLabel('Count')).toBeFocused()
  await dup.getByLabel('Count').fill('3')
  await expect(lines(page, 'Duplicate')).toHaveText([
    /✓\s*1\s+EDGE-19 · Rack A03 U7/,
    /✓\s*2\s+EDGE-20 · Rack A03 U9/,
    /✓\s*3\s+EDGE-21 · Rack A03 U10/,
  ])
  await shot(page, 'duplicate-valid')
  await dup.getByRole('button', { name: 'Duplicate 3' }).click()
  await expect(dup).toHaveCount(0)

  const plan = await getPlan(request, id)
  expect(plan.revision).toBe('3')
  const added = plan.equipment.filter(
    (e: { name: string }) => e.name !== 'EDGE-18',
  )
  expect(
    added.map((e: { name: string; unit: number }) => [e.name, e.unit]),
  ).toEqual([
    ['EDGE-19', 7],
    ['EDGE-20', 9],
    ['EDGE-21', 10],
  ])
  for (const e of added)
    expect(
      plan.endpoints.filter(
        (p: { equipmentId: string }) => p.equipmentId === e.id,
      ),
    ).toHaveLength(1)
  expect(plan.links).toEqual([])

  await page.getByRole('button', { name: /^Changes/ }).click()
  await expect(
    page.getByTestId('change-group').filter({ hasText: 'Equipment added · 4' }),
  ).toBeVisible()
  await shot(page, 'changes-drawer')
})

test('BK-03 a duplicate that runs out of free units is blocked, from the inspector, and the count or rack changes it', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Dup'))
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await page.getByTestId('rf__node-edge-17').click()
  await page.getByRole('button', { name: 'Duplicate EDGE-17…' }).click()
  const dup = box(page, 'Duplicate')
  await dup.getByLabel('Count').fill('5')
  // Rack A03 has 12 units: EDGE-17 at U8 and PANEL-A at U11 leave U9, U10 and U12
  // above it, then U1 and U2 below it: nothing is blocked while the rack has room.
  const rows = lines(page, 'Duplicate')
  await expect(rows).toHaveCount(5)
  await expect(rows.nth(2)).toContainText('U12')
  await expect(rows.nth(3)).toContainText('U1')
  await expect(rows.nth(4)).toContainText('U2')
  await expect(
    box(page, 'Duplicate').locator('[data-blocked="true"]'),
  ).toHaveCount(0)
  await expect(dup.getByRole('button', { name: 'Duplicate 5' })).toBeEnabled()
  await shot(page, 'duplicate-wraps')
  // Ten units are free; the eleventh copy finds none.
  await dup.getByLabel('Count').fill('11')
  await expect(rows).toHaveCount(11)
  await expect(rows.nth(10)).toContainText(
    'Rack A03 has no free unit for EDGE-29',
  )
  await expect(dup.getByRole('button', { name: 'Duplicate 11' })).toBeDisabled()
  await shot(page, 'duplicate-blocked')
  await dup.getByLabel('Count').fill('3')
  await expect(dup.getByRole('button', { name: 'Duplicate 3' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(dup).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Duplicate EDGE-17…' }),
  ).toBeFocused()
})

test('BK-04 copying Rack A03 into a new empty rack places the same kinds at the same units, with new names and no cables', async ({
  page,
  request,
}) => {
  const label = unique('Cp')
  const id = await newPlan(request, `Copy ${label}`)
  const room = await addRoom(request, id, label)
  await command(request, id, {
    type: 'add_rack',
    rack: { nodeId: room.nodeId, name: `${label} Tiny`, units: 4 },
  })
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  const sites = page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('button', { name: 'Sites', exact: true })
  if (await sites.count()) await sites.click()
  await page
    .getByRole('button', { name: `Open ${label} Site`, exact: true })
    .click()
  await page
    .getByRole('button', { name: `Open racks of ${label} Hall` })
    .click()

  // The small rack cannot take Rack A03's layout.
  await page
    .getByRole('button', { name: `Copy rack layout into ${label} Tiny…` })
    .click()
  const tiny = box(page, 'Copy rack layout')
  await tiny.getByRole('combobox').fill('rack a03')
  await page.getByRole('option', { name: 'Rack A03 · Building A' }).click()
  await expect(lines(page, 'Copy rack layout').first()).toContainText(
    `${label} Tiny has units 1–4; 1 unit from U8 does not fit`,
  )
  await expect(
    tiny.getByRole('button', { name: /^Copy/ }).first(),
  ).toBeDisabled()
  const popover = await tiny.boundingBox()
  expect(popover!.width).toBeGreaterThanOrEqual(300)
  expect(popover!.x + popover!.width).toBeLessThanOrEqual(1440)
  expect(popover!.y + popover!.height).toBeLessThanOrEqual(1050)
  await shot(page, 'copy-blocked')
  await page.keyboard.press('Escape')
  await expect(tiny).toHaveCount(0)

  await page
    .getByRole('button', { name: `Copy rack layout into ${label} R1…` })
    .click()
  const copy = box(page, 'Copy rack layout')
  await copy.getByRole('combobox').fill('rack a03')
  await page.getByRole('option', { name: 'Rack A03 · Building A' }).click()
  await expect(lines(page, 'Copy rack layout')).toHaveText([
    /✓\s*1\s+U8\s+EDGE-17 → EDGE-18/,
    /✓\s*2\s+U11\s+PANEL-A → PANEL-A-2/,
  ])
  await shot(page, 'copy-valid')
  await copy.getByRole('button', { name: 'Copy 2' }).click()
  await expect(copy).toHaveCount(0)

  const plan = await getPlan(request, id)
  const added = plan.equipment.map(
    (e: { name: string; unit: number; kind: string; rackId: string }) => [
      e.name,
      e.kind,
      e.unit,
      e.rackId === room.rackId,
    ],
  )
  expect(added).toEqual([
    ['EDGE-18', 'switch', 8, true],
    ['PANEL-A-2', 'panel', 11, true],
  ])
  expect(
    plan.links.filter((l: { kind?: string }) => l.kind !== 'internal'),
  ).toEqual([])
  expect(plan.equipment.every((e: { height: number }) => e.height === 1)).toBe(
    true,
  )

  await page.getByRole('button', { name: /^Changes/ }).click()
  await expect(
    page.getByTestId('change-group').filter({ hasText: 'Equipment added · 2' }),
  ).toBeVisible()
  await shot(page, 'copy-changes-drawer')
})
