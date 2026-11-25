import { expect, test, type Page } from './fixtures'
import {
  BUILDING_A,
  expandResults,
  openEquipmentPage,
  fitted,
  leaveTrace,
  selectEquipment,
  traceRoutes,
} from './helpers'

/** Choose equipment through Explore, which selects it on the tree and opens the inspector. */
async function inspect(page: Page, card: string) {
  await selectEquipment(page, card.toUpperCase())
}

/** Select an equipment from the hierarchy's drawer: it opens the inspector and stays on the hierarchy. */
async function inspectOnHierarchy(page: Page, switchId: string, name: string) {
  await page.locator(`[data-card-key="${BUILDING_A}"]`).click()
  const drawer = page.getByTestId('hierarchy-drawer')
  await drawer.locator(`[data-switch-id="${switchId}"]`).click()
  await drawer.getByRole('button', { name: 'Inspector' }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText(name)
}

test('POL-09 the card of HDF-01: Installed, 4 of 96 cabled, where it sits, and what runs through it', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'hdf-01')

  const card = page.getByTestId('inspector-card')
  await expect(card).toContainText('Installed')
  await expect(card.getByText('4 of 96 cabled')).toBeVisible()
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'Main Campus › North Sub-main › Rack SM01 · U4',
  )
  // A passive has no Find AGG / BB of its own, and says how many circuits run through it.
  await expect(
    card.getByRole('button', { name: 'Find AGG / BB from HDF-01' }),
  ).toHaveCount(0)
  await expect(card.getByTestId('inspector-way-up')).toContainText(
    /circuits? of Network [AB].* through it/,
  )

  // A switch with 24 ports.
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await inspect(page, 'edge-17')
  await expect(card.getByText('3 of 24 cabled')).toBeVisible()
})

test('POL-10 Find AGG / BB from a jack on the equipment page, and Show on map from the card selects it on the tree', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openEquipmentPage(page, 'HDF-01')
  await page.locator('[data-endpoint-id="hdf-01:sp-3C:5:f"]').click()

  // Find AGG / BB from here starts at the front side of the position.
  await page.getByRole('button', { name: 'Find AGG / BB from here' }).click()
  await expect(traceRoutes(page)).toHaveCount(1)
  await expect(traceRoutes(page)).toContainText('AGG-03')
  await expect(page.getByTestId('trace-title')).toContainText('HDF-01')
  await leaveTrace(page)

  // Show on map (the card): selected on the tree, the route kept.
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await page.getByRole('button', { name: 'Show on map: HDF-01' }).click()
  await expect(page.locator(`[data-card-key="${BUILDING_A}"]`)).toHaveAttribute(
    'data-lit',
    'true',
  )
  await expect(page.getByTestId('hierarchy-drawer').locator('h2')).toHaveText(
    'HDF-01',
  )
  await expandResults(page)
  await expect(traceRoutes(page)).toHaveCount(1)
})

test('POL-11 the location links open the site or node in Physical, and the rack opens in Physical', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspectOnHierarchy(page, 'edge-17', 'EDGE-17')
  const explorer = page.locator('.physical-explorer')

  await page
    .getByRole('button', { name: 'Open node Building A in Physical' })
    .click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await expect(explorer).toHaveAttribute(
    'data-location',
    'site:site-main-campus/node:node-building-a',
  )
  await page
    .getByRole('button', { name: 'Open site Main Campus in Physical' })
    .click()
  await expect(explorer).toHaveAttribute(
    'data-location',
    'site:site-main-campus',
  )

  // The rack opens in Physical.
  await page.getByRole('button', { name: 'Open Rack A03 in Physical' }).click()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await expect(explorer).toHaveAttribute('data-location', /rack:rack-a03/)
  await expect(page.getByTestId('rack-slot-rack-a03-8')).toContainText(
    'EDGE-17',
  )
  await expect(page.getByTestId('rack-slot-rack-core-01-8')).toHaveCount(0) // only that rack
})

test('whole-device Find AGG / BB is offered for switches only', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const device = (name: string) =>
    page.getByRole('button', {
      name: `Find AGG / BB from ${name}`,
      exact: true,
    })
  await inspect(page, 'edge-17')
  await expect(device('EDGE-17')).toBeVisible()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  for (const card of ['panel-a', 'hdf-01']) {
    await inspect(page, card)
    await expect(device(card.toUpperCase())).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Close Equipment inspector' })
      .click()
  }
})

test('POL-21 the inspector has no trace form: one Find AGG / BB button, and its result opens the Trace page, with no form', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'edge-17')
  await expect(page.getByRole('combobox', { name: 'Trace mode' })).toHaveCount(
    0,
  )
  await expect(page.getByText('Pathfinding')).toHaveCount(0)
  const find = page
    .getByLabel('Equipment inspector')
    .getByRole('button', { name: /Find AGG \/ BB/ })
  await expect(find).toHaveCount(1)
  await find.click()
  await expect(traceRoutes(page)).toHaveCount(3)
  // The Trace page, which the trace opened, has no form.
  await expect(page.getByRole('combobox', { name: 'Trace mode' })).toHaveCount(
    0,
  )
})

test('POL-35 Enter or Space on a focused card opens its drawer, Enter on a switch and on Inspector works like a click, and Escape closes the drawer and returns focus', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(page.locator('.dock:not([hidden])')).toHaveCount(0)
  const drawer = page.getByTestId('hierarchy-drawer')
  const building = page.locator(`[data-card-key="${BUILDING_A}"]`)
  await building.focus()
  await page.keyboard.press('Enter')
  await expect(drawer.getByRole('heading', { level: 2 })).toHaveText(
    'Building A',
  )
  const row = drawer.locator('[data-switch-id="edge-17"]')
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(row).toHaveAttribute('aria-expanded', 'true')
  await drawer.getByRole('button', { name: 'Inspector' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.inspector-header h2')).toHaveText('EDGE-17')
  // Space on another card replaces the drawer, and does not scroll the page.
  const agg = page.locator('[data-card-key="agg-03"]')
  await agg.focus()
  await page.keyboard.press('Space')
  await expect(drawer.getByRole('heading', { level: 2 })).toHaveText('AGG-03')
  // Escape closes it, and focus returns to the card that opened it.
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(agg).toBeFocused()
})
