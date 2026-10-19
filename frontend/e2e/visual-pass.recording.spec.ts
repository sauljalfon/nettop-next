import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { fitted, selectEquipment } from './helpers'
import { addSwitch, newPlan, unique } from './plan-api'

// VP-01: Hebrew names read correctly everywhere. The renames are direct fixes
// of installed objects (change-log rows), so this spec runs in the recording
// project, and it renames everything back afterwards.
const BASE = 'http://127.0.0.1:5175'
const HEBREW = {
  equipment: { id: 'panel-a', was: 'PANEL-A', now: 'פאנל ראשי 1' },
  nodes: {
    id: 'node-north-sub-main',
    was: 'North Sub-main',
    now: 'מחסני קשר + מעבדה',
  },
  racks: { id: 'rack-a03', was: 'Rack A03', now: 'ארון 03' },
} as const

async function rename(
  request: APIRequestContext,
  to: 'was' | 'now',
): Promise<void> {
  for (const [kind, x] of Object.entries(HEBREW)) {
    const response = await request.patch(`/api/installed/${kind}/${x.id}`, {
      data: { name: x[to] },
    })
    expect(response.status(), await response.text()).toBe(200)
  }
}

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: BASE })
  await rename(request, 'now')
  await request.dispose()
})
test.afterAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: BASE })
  await rename(request, 'was')
  await request.dispose()
})

const texts = (locator: ReturnType<Page['locator']>) =>
  locator.evaluateAll((els) => els.map((e) => e.textContent))

test('VP-01 Hebrew names sit in their own bdi, and a location reads site › node › rack', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await fitted(page)

  // Overview node cards: the node's name sits in its own bdi.
  await expect(
    page
      .locator(`[data-node-id="${HEBREW.nodes.id}"]`)
      .locator('bdi', { hasText: HEBREW.nodes.now }),
  ).toBeVisible()

  // Focus card: the equipment's name and its place, each name in its own bdi.
  await selectEquipment(page, HEBREW.equipment.now)
  const panel = page.locator(`[data-equipment-id="${HEBREW.equipment.id}"]`)
  await expect(panel.locator('.focus-card-name bdi')).toHaveText(
    HEBREW.equipment.now,
  )
  expect(await texts(panel.locator('.place-path bdi'))).toEqual([
    'Main Campus',
    'Building A',
    HEBREW.racks.now,
  ])

  // Inspector.
  await expect(page.locator('.inspector-header h2 bdi')).toHaveText(
    HEBREW.equipment.now,
  )
  const crumb = page.locator('.location-breadcrumb')
  expect(await texts(crumb.locator('bdi'))).toEqual([
    'Main Campus',
    'Building A',
    HEBREW.racks.now,
    HEBREW.equipment.now,
  ])

  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()

  // Physical: the rack list, then the rack with its breadcrumbs.
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumbs' })
  const sites = crumbs.getByRole('button', { name: 'Sites', exact: true })
  if (await sites.count()) await sites.click()
  await page.getByRole('button', { name: 'Open Main Campus' }).click()
  await page.getByRole('button', { name: 'Open racks of Building A' }).click()
  const explorer = page.locator('.physical-explorer')
  await expect(
    explorer.locator('bdi', { hasText: HEBREW.racks.now }).first(),
  ).toBeVisible()
  await page
    .getByRole('button', { name: `Open ${HEBREW.racks.now}`, exact: true })
    .click()
  expect(await texts(crumbs.locator('bdi'))).toEqual([
    'Main Campus',
    'Building A',
    HEBREW.racks.now,
  ])
  const separators = crumbs.locator('.place-sep')
  await expect(separators).toHaveCount(3)
  for (const sep of await separators.all())
    await expect(sep).toHaveAttribute('aria-hidden', 'true')

  // The Changes drawer: a draft that adds a switch to the renamed rack.
  const label = unique('VP')
  const planId = await newPlan(request, `Names ${label}`)
  await addSwitch(request, planId, HEBREW.racks.id, `SW-${label}`, 6)
  await page.goto('/')
  await fitted(page)
  await page.getByRole('button', { name: /^Plan:/ }).click()
  const drawer = page.getByRole('complementary', { name: 'Changes & plans' })
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: /^Changes/ }).click()
  await drawer.getByLabel('Draft').selectOption(planId)
  const row = page.getByTestId('change-line').filter({ hasText: `SW-${label}` })
  await expect(row.locator('bdi', { hasText: `SW-${label}` })).toBeVisible()
  await expect(row.locator('bdi', { hasText: HEBREW.racks.now })).toBeVisible()
})
