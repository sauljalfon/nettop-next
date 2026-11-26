import { expect, test, type Page } from './fixtures'
import {
  fitted,
  openEquipmentPage,
  openExplore,
  openInspector,
  selectEdge17,
  selectEquipment,
} from './helpers'
import { addSwitch, command, getPlan, newPlan, unique } from './plan-api'

const card = (page: Page) => page.getByTestId('inspector-card')
const equipmentBar = (page: Page) => page.getByTestId('equipment-bar')
const moreMenu = (page: Page) =>
  equipmentBar(page).getByRole('button', { name: 'More actions' })

async function expectCard(page: Page) {
  const c = card(page)
  await expect(c.locator('h2')).toHaveText('EDGE-17')
  await expect(c).toContainText('Access')
  await expect(c).toContainText('Network A')
  await expect(c).toContainText('Installed')
  await expect(c.locator('.location-breadcrumb')).toContainText(
    'Main Campus › Building A › Rack A03',
  )
  await expect(c.locator('.location-breadcrumb')).toContainText('U8')
  await expect(c).toContainText('3 of 24 cabled')
  await expect(c.getByTestId('inspector-way-up')).toContainText(
    /\d uplinks?: .*AGG-/,
  )
  // No model is set on EDGE-17: no Model line.
  await expect(c.getByTestId('inspector-model')).toHaveCount(0)
  for (const name of [
    'Find AGG / BB from EDGE-17',
    'Open in Physical: EDGE-17',
    'Show on map: EDGE-17',
    'Open in inventory: EDGE-17',
  ])
    await expect(c.getByRole('button', { name, exact: true })).toBeVisible()
  // A short card: no tabs, no port table, no details editor, no placement form.
  await expect(
    page.getByRole('tab', { name: /^(Overview|Ports|Positions|History)$/ }),
  ).toHaveCount(0)
  await expect(c.getByTestId('inspector-unit')).toHaveCount(0)
  await expect(c.getByRole('button', { name: 'Edit details' })).toHaveCount(0)
  await expect(c.getByLabel('Placement unit')).toHaveCount(0)
}

test('D49-05 the Inspector of EDGE-17 is a card: name, role, network, where, 3 of 24 cabled, way up, model (when set), four actions; no tabs', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await fitted(page)
  await selectEdge17(page)
  await expectCard(page)
  await page.screenshot({ path: 'test-results/d49/card-conceptual.png' })

  // The same card on Physical.
  await card(page)
    .getByRole('button', { name: 'Open in Physical: EDGE-17' })
    .click()
  await expect(equipmentBar(page)).toBeVisible()
  await openInspector(page)
  await expect(page.getByRole('tab', { name: 'Inspector' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expectCard(page)
  await page.screenshot({ path: 'test-results/d49/card-physical.png' })

  // The model line shows when the details have one.
  const id = await newPlan(request, unique('Card'))
  const sw = await addSwitch(request, id, 'rack-a03', 'CARD-1', 3, 4)
  await command(request, id, {
    type: 'update_details',
    target: { id: sw },
    details: {
      manufacturer: 'Cisco',
      model: 'C9200-24T',
      serialNumber: 'FOC1',
    },
  })
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await selectEquipment(page, 'CARD-1')
  await expect(card(page).getByTestId('inspector-model')).toContainText(
    'Cisco C9200-24T',
  )
  await expect(card(page).getByTestId('inspector-model')).toContainText('FOC1')
})

test('D49-06 ⋯ History opens the History tab with the direct fixes and recorded plans', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await selectEdge17(page)
  await card(page)
    .getByRole('button', { name: 'Open in Physical: EDGE-17' })
    .click()
  await moreMenu(page).click()
  const items = page.getByRole('menu').getByRole('menuitem')
  await expect(items).toHaveText([
    'History',
    'Set model…',
    // Installed: no plan open, so moving is off and says why.
    /^Move to another rack…\s*Open a plan first$/,
    'Print sheet',
    'Show on map',
  ])
  await page.screenshot({ path: 'test-results/d49/more-menu-installed.png' })
  await items.filter({ hasText: 'History' }).click()
  const tab = page.getByRole('tab', { name: 'History' })
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const history = page.getByTestId('history')
  await expect(history).toContainText('Direct fixes')
  await expect(history).toContainText('Recorded plans')
  await page.screenshot({ path: 'test-results/d49/history-tab.png' })
  // Switching to another tab drops the History tab.
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await expect(page.getByRole('tab', { name: 'History' })).toHaveCount(0)
})

test('D49-07 in a plan ⋯ Move to another rack… moves EDGE-17 to another node’s rack (Installed: disabled, "Open a plan first")', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await fitted(page)
  await selectEdge17(page)
  await card(page)
    .getByRole('button', { name: 'Open in Physical: EDGE-17' })
    .click()
  await moreMenu(page).click()
  const move = page.getByRole('menuitem', { name: /Move to another rack/ })
  await expect(move).toBeDisabled()
  await expect(move).toContainText('Open a plan first')
  await page.keyboard.press('Escape')

  const id = await newPlan(request, unique('Move'))
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await openExplore(page)
  const search = page.getByLabel('Find equipment')
  await search.fill('EDGE-17')
  await search.press('Enter')
  await expect(equipmentBar(page)).toBeVisible()
  await moreMenu(page).click()
  await page.screenshot({ path: 'test-results/d49/more-menu-plan.png' })
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
    'History',
    /^Set model…\s*Set model in Installed$/,
    'Move to another rack…',
    'Print sheet',
    'Duplicate…',
    'Show on map',
    'Delete…',
  ])
  await page.getByRole('menuitem', { name: 'Move to another rack…' }).click()
  const box = page.getByTestId('move-equipment')
  await expect(box).toBeVisible()
  const place = box.getByRole('group', { name: 'Move to', exact: true })
  await place.getByLabel('Site', { exact: true }).selectOption({
    label: 'Main Campus',
  })
  await place.getByLabel('Node', { exact: true }).selectOption({
    label: 'North Sub-main',
  })
  await place
    .getByLabel('Rack', { exact: true })
    .selectOption({ value: 'rack-sm01' })
  // The lowest free unit of that rack (HDF-01 holds U4-U6).
  await expect(box.getByLabel('Unit', { exact: true })).toHaveValue('1')
  await page.screenshot({ path: 'test-results/d49/move-box.png' })
  await box.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(box).toHaveCount(0)
  await expect
    .poll(async () => {
      const plan = await getPlan(request, id)
      return plan.placements?.find(
        (p: { equipmentId: string }) => p.equipmentId === 'edge-17',
      )
    })
    .toEqual({ equipmentId: 'edge-17', rackId: 'rack-sm01', unit: 1 })
})

test('D49-08 Inventory’s Delete… and Disconnect… still confirm', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Confirms'))
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await page.getByRole('button', { name: 'Inventory', exact: true }).click()
  const bar = page.getByRole('toolbar', { name: 'Commands' })
  await expect(page.locator('[data-inventory-list]')).toBeVisible()
  await page.getByLabel('Select EDGE-17').check()
  await bar.getByRole('button', { name: 'Delete…' }).click()
  await expect(card(page).locator('h2')).toHaveText('EDGE-17')
  const confirm = card(page).getByRole('group', { name: 'Confirm delete' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toHaveCount(0)

  await page.getByLabel('Select EDGE-17').uncheck()
  await page
    .getByRole('navigation', { name: 'Inventory lists' })
    .getByRole('button', { name: /^Ports and positions/ })
    .click()
  await page.getByLabel('Filter for any field').fill('edge-17')
  await page
    .getByRole('table')
    .locator('tbody tr')
    .filter({ hasText: 'cable-a01' })
    .first()
    .getByRole('checkbox')
    .check()
  await bar.getByRole('button', { name: 'Disconnect…' }).click()
  const disconnect = card(page).getByRole('group', {
    name: 'Confirm disconnect',
  })
  await expect(disconnect).toBeVisible()
  await expect(disconnect).toContainText('cable-a01')
  await disconnect.getByRole('button', { name: 'Cancel' }).click()
  await expect(disconnect).toHaveCount(0)
})

test('D49-09 an Explore port hit opens that jack on its page', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openExplore(page)
  const search = page.getByLabel('Find equipment')
  await search.fill('hdf-01 3c/5')
  await page.getByTestId('search-port').filter({ hasText: '3C/5 rear' }).click()
  const root = page.locator('.physical-explorer')
  await expect(root).toHaveAttribute('data-physical-level', 'equipment')
  await expect(root).toHaveAttribute(
    'data-selected-endpoint',
    'hdf-01:sp-3C:5:r',
  )
  await expect(root).toHaveAttribute('data-side', 'rear')
  await expect(equipmentBar(page)).toContainText('HDF-01')
})

test('D49-10 a switch’s page has Edit details at the end of its details line: a box under the bar that closes on Escape', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openEquipmentPage(page, 'EDGE-17')
  const link = page
    .locator('p[data-testid="equipment-details"]')
    .getByRole('button', { name: 'Edit details' })
  await link.click()
  const form = page.getByTestId('details-form')
  await expect(form.getByLabel('Name')).toBeFocused()
  await expect(form.getByLabel('Manufacturer')).toBeVisible()
  await page.screenshot({ path: 'test-results/d49/edit-details-box.png' })
  await page.keyboard.press('Escape')
  await expect(form).toHaveCount(0)
  await expect(link).toBeFocused()
})
