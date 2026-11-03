import { expect, test, type Page } from './fixtures'
import { fitted, openRackInPhysical, selectEquipment } from './helpers'
import { getPlan, installedRevision, newPlan, record, unique } from './plan-api'

// Rack A03 (12U) in the fixture: UPS-A03 U1–U2, EDGE-17 U8, PANEL-A U11,
// CM-A03 U12; U3–U7 and U9–U10 are free.

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/ri-${name}.png` })
const block = (page: Page, id: string) =>
  page.locator(`.rack-block[data-equipment-id="${id}"]`)

test('RI-13 a rack item is dragged in from the library, moved, recorded, and deleted in a later plan', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('RiAdd'))
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Rack item' })
    .dragTo(page.getByTestId('rack-slot-rack-a03-4'))
  const form = page.getByTestId('equipment-form')
  await expect(form.getByLabel('Unit', { exact: true })).toHaveValue('4')
  await form.getByLabel('Type').selectOption('ups')
  await expect(form.getByLabel('Height')).toHaveValue('2')
  await expect(form.getByLabel('Name')).toHaveValue(
    'UPS Building A Rack A03 U4',
  )
  await form.getByLabel('Name').fill('UPS-RI13')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(page.getByTestId('rack-slot-rack-a03-4')).toContainText(
    'UPS-RI13',
  )

  const plan = await getPlan(request, id)
  const added = plan.equipment.find(
    (e: { name: string }) => e.name === 'UPS-RI13',
  )
  expect(added).toMatchObject({
    kind: 'rack_item',
    role: 'none',
    rackId: 'rack-a03',
    unit: 4,
    height: 2,
    itemType: 'ups',
  })
  const ups = block(page, added.id)
  await expect(ups).toHaveAttribute('data-proposed', 'true')
  await expect(ups.locator('[data-plate="rack-item"]')).toHaveAttribute(
    'data-item-type',
    'ups',
  )
  await shot(page, 'added')

  // Moved by a drag, like any equipment.
  await ups.dragTo(page.getByTestId('rack-slot-rack-a03-6'))
  await expect(ups).toHaveAttribute('data-unit', '6')
  expect(
    (await getPlan(request, id)).equipment.find(
      (e: { id: string }) => e.id === added.id,
    ),
  ).toMatchObject({ unit: 6 })

  // The Changes line reads its type, then its name.
  await page.getByRole('button', { name: /^Changes/ }).click()
  await expect(
    page.getByTestId('change-group').filter({ hasText: 'Equipment added · 1' }),
  ).toContainText('Added UPS · UPS-RI13 · Rack A03 U6–7')
  await page.keyboard.press('Escape')

  await record(request, id, 'RI-13 UPS installed')
  await page.goto('/')
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await expect(block(page, added.id)).toHaveAttribute('data-unit', '6')
  await expect(block(page, added.id)).toHaveAttribute('data-proposed', 'false')

  // Deleted in a later plan: the confirm says it has no ports or cables.
  const later = await newPlan(request, unique('RiDelete'))
  await page.goto(`/?plan=${later}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await block(page, added.id).click()
  await page.getByRole('button', { name: 'Delete UPS-RI13…' }).first().click()
  await expect(
    page.getByText('Removes UPS-RI13. It has no ports or cables.'),
  ).toBeVisible()
  await shot(page, 'delete-confirm')
  await page.getByRole('button', { name: 'Delete in plan' }).click()
  await expect
    .poll(async () => (await getPlan(request, later)).removals?.equipment)
    .toEqual([added.id])
})

test('RI-14 the cable manager’s type is fixed to Other "Fan tray" on Installed, and History lists it', async ({
  page,
  request,
}) => {
  const revision = await installedRevision(request)
  await page.goto('/')
  await fitted(page)
  await selectEquipment(page, 'CM-A03')
  const details = page.getByTestId('equipment-details')
  await expect(details).toContainText('Cable manager')
  await details.getByRole('button', { name: 'Edit details' }).click()
  const form = page.getByTestId('details-form')
  await expect(form.getByLabel('What it is')).toHaveCount(0)
  await form.getByLabel('Type').selectOption('other')
  await form.getByLabel('What it is').fill('Fan tray')
  await form.getByLabel('Why (optional, kept in history)').fill('Audit')
  await shot(page, 'fix-form')
  await form.getByRole('button', { name: 'Save fix' }).click()
  await expect(form).toHaveCount(0)
  await expect(details).toContainText('Other')
  await expect(details).toContainText('Fan tray')
  expect(await installedRevision(request)).toBe(revision)

  await page.getByRole('tab', { name: 'History' }).click()
  const fixes = page.getByTestId('history-fixes')
  await expect(fixes).toContainText('Type: Cable manager → Other')
  await expect(fixes).toContainText('What it is: (empty) → Fan tray')
  await shot(page, 'history')
})
