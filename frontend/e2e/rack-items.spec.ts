import { expect, test, type Page } from './fixtures'
import { fitted, openRackInPhysical, selectEquipment } from './helpers'
import { newPlan, unique } from './plan-api'
import { patching, toHalf } from './patching-helpers'

// The fixture's rack items: UPS-A03 (U1–U2) and CM-A03 (U12) in Rack A03,
// KVM-CORE-01 (Other, "KVM switch") in Rack Core 01. See acceptance-example.md.

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/ri-${name}.png` })
const level = (page: Page) => page.locator('[data-physical-level]')
const inventory = (page: Page) => page.locator('[data-inventory-list]')

test('RI-14 the fixture’s UPS opens in the inspector and on its page with "No ports", and Duplicate is not offered', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await selectEquipment(page, 'UPS-A03')
  const inspector = page.locator('aside.studio-drawer')
  await expect(inspector.getByTestId('no-ports')).toHaveText('No ports')
  await expect(inspector.getByTestId('equipment-details')).toContainText('Type')
  await expect(inspector.getByTestId('equipment-details')).toContainText('UPS')
  // Never a start for Find AGG / BB.
  await expect(
    page.getByRole('button', { name: 'Find AGG / BB from UPS-A03' }),
  ).toHaveCount(0)
  await shot(page, 'inspector')

  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  const block = page.locator('.rack-block[data-equipment-id="ups-a03"]')
  await expect(block).toHaveAttribute('data-kind', 'rack_item')
  await expect(block).toHaveAttribute('data-height', '2')
  await expect(block.locator('[data-plate="rack-item"]')).toHaveAttribute(
    'data-item-type',
    'ups',
  )
  await block.click()
  await expect(level(page)).toHaveAttribute('data-physical-level', 'equipment')
  await expect(page.getByTestId('no-ports').first()).toBeVisible()
  await shot(page, 'page')
})

test('RI-14 in a plan, Duplicate is not offered for a rack item', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('RiDup'))
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block[data-equipment-id="ups-a03"]').click()
  await expect(level(page)).toHaveAttribute('data-physical-level', 'equipment')
  await expect(
    page.getByRole('button', { name: 'Delete UPS-A03…' }).first(),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /^Duplicate/ })).toHaveCount(0)
})

test('RI-14 the Inventory’s Type column and pill list the rack items', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await expect(inventory(page)).toBeVisible()
  await expect(
    page.getByRole('table').getByRole('columnheader', { name: /^Type/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: /^Type == / }).click()
  const picker = page.getByRole('dialog', { name: 'Filter Type' })
  await picker.getByLabel('Select all').uncheck()
  await picker.getByLabel('UPS', { exact: true }).check()
  await picker.getByRole('button', { name: 'Apply' }).click()
  await expect(inventory(page)).toHaveAttribute('data-inventory-total', '1')
  await expect(page.getByRole('table')).toContainText('UPS-A03')
  await shot(page, 'inventory-type')
  // An Other shows its text beside the type.
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await page.getByLabel('Filter for any field').fill('KVM-CORE-01')
  await expect(inventory(page)).toHaveAttribute('data-inventory-total', '1')
  await expect(page.getByRole('table')).toContainText('Other · KVM switch')
})

test('RI-15 a rack item is never a trace start, on the tree, or a patching far end', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await fitted(page)
  // Not on the tree.
  await expect(page.locator('[data-card-key]').first()).toBeVisible()
  await expect(page.locator('[data-card-key*="ups-a03"]')).toHaveCount(0)
  await expect(page.locator('[data-card-key*="kvm-core-01"]')).toHaveCount(0)

  // Not in the trace picker.
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
  const start = page.getByRole('combobox', { name: 'Start', exact: true })
  await start.fill('UPS-A03')
  await expect(page.getByText('No match.')).toBeVisible()
  await start.fill('KVM-CORE')
  await expect(page.getByText('No match.')).toBeVisible()
  await page.getByRole('button', { name: 'Close Trace tools' }).click()

  // Not a far end in the patching screen: Rack A03 offers EDGE-17 and PANEL-A only.
  const id = await newPlan(request, unique('RiPatch'))
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block[data-equipment-id="edge-17"]').click()
  await page.locator('[data-endpoint-id="edge-17:p4"]').click()
  await page
    .getByTestId('connect-popover')
    .getByRole('button', { name: 'Choose far end…' })
    .click()
  await expect(patching(page)).toBeVisible()
  const far = toHalf(page).getByRole('group', { name: 'Far end' })
  await expect(far.getByLabel('Rack').locator('option:checked')).toContainText(
    'Rack A03',
  )
  const options = await far
    .getByLabel('Equipment')
    .locator('option')
    .allTextContents()
  expect(options.some((o) => o.startsWith('PANEL-A'))).toBe(true)
  expect(options.some((o) => /UPS-A03|CM-A03/.test(o))).toBe(false)
  await shot(page, 'patching')
})
