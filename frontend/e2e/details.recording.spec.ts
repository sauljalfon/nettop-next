import { expect, test, type Page } from '@playwright/test'
import { fitted, openRackInPhysical, selectEquipment } from './helpers'
import {
  addSwitch,
  getPlan,
  installedRevision,
  newPlan,
  record,
  unique,
} from './plan-api'

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/fd-${name}.png` })
const details = (page: Page) => page.getByTestId('equipment-details')
const form = (page: Page) => page.getByTestId('details-form')

/** Select equipment by its name through Explore; the inspector opens with it. */
async function inspect(page: Page, id: string, name = id.toUpperCase()) {
  await selectEquipment(page, name)
}
test('FD-04 a direct fix on Installed: Edit details saves, the Overview shows it at once, and History lists it with its note', async ({
  page,
  request,
}) => {
  const revision = await installedRevision(request)
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'agg-12')
  await expect(details(page)).toContainText('Manufacturer')
  await details(page).getByRole('button', { name: 'Edit details' }).click()
  await expect(form(page).getByLabel('Name')).toBeFocused()
  await form(page).getByLabel('Manufacturer').fill('Cisco')
  await form(page).getByLabel('Serial number').fill('FD-SN-15')
  await form(page).getByLabel('Status').selectOption('maintenance')
  await form(page)
    .getByLabel('Why (optional, kept in history)')
    .fill('Asset audit')
  await shot(page, 'edit-form')
  await form(page).getByRole('button', { name: 'Save fix' }).click()
  await expect(form(page)).toHaveCount(0)
  // Shown at once, without a reload (the revision did not change).
  await expect(details(page)).toContainText('Cisco')
  await expect(details(page)).toContainText('FD-SN-15')
  await expect(details(page)).toContainText('maintenance')
  expect(await installedRevision(request)).toBe(revision)

  await page.getByRole('tab', { name: 'History' }).click()
  const fixes = page.getByTestId('history-fixes').locator('li')
  await expect(fixes).toHaveCount(3)
  await expect(page.getByTestId('history-fixes')).toContainText('Manufacturer')
  await expect(page.getByTestId('history-fixes')).toContainText('Asset audit')
  await shot(page, 'history')
})

test('FD-04 a refused fix keeps the form open with the reason; Escape closes it and returns focus', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'agg-12')
  const button = details(page).getByRole('button', { name: 'Edit details' })
  await button.click()
  await form(page).getByLabel('Name').fill('AGG-08')
  await form(page).getByRole('button', { name: 'Save fix' }).click()
  await expect(form(page).getByTestId('edit-error')).toContainText(
    'AGG-08 already exists',
  )
  await expect(form(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(form(page)).toHaveCount(0)
  await expect(button).toBeFocused()
})

test('FD-04 in a plan: a proposed switch is edited with update_details (and its Name with rename_equipment); installed equipment only shows a hint', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Details'))
  const sw = await addSwitch(request, id, 'rack-a03', 'EDGE-40', 3, 24)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await inspect(page, sw, 'EDGE-40')
  await details(page).getByRole('button', { name: 'Edit details' }).click()
  await expect(form(page).getByLabel('Name')).toHaveValue('EDGE-40')
  await form(page).getByLabel('Model').fill('C9300-48P')
  await form(page).getByRole('button', { name: 'Save in plan' }).click()
  await expect(form(page)).toHaveCount(0)
  await expect(details(page)).toContainText('C9300-48P')
  const plan = await getPlan(request, id)
  expect(JSON.stringify(plan.details)).toContain('C9300-48P')

  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await inspect(page, 'agg-03')
  await expect(
    details(page).getByRole('button', { name: 'Edit details' }),
  ).toHaveCount(0)
  await expect(details(page)).toContainText(
    'Details of installed equipment are fixed on Installed',
  )
})

test('P2-3 rename equipment the plan adds: the name saves in the plan, shows on the page, undoes from Changes, and is recorded', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Rename'))
  const sw = await addSwitch(request, id, 'rack-a03', 'REN-1', 3, 4)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  const title = () => page.locator('.face-head h2')
  const changes = page.getByRole('complementary', { name: 'Changes & plans' })
  const edit = async () => {
    await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
    await selectEquipment(page, 'REN-1')
    await details(page).getByRole('button', { name: 'Edit details' }).click()
  }
  const showPage = async () => {
    const close = page.getByRole('button', {
      name: 'Close Equipment inspector',
    })
    if (await close.count()) await close.click()
    await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
    await page.locator(`.rack-block[data-equipment-id="${sw}"]`).click()
  }

  // Only the name: rename_equipment, no details.
  await edit()
  await form(page).getByLabel('Name').fill('Lab switch')
  await form(page).getByRole('button', { name: 'Save in plan' }).click()
  await expect(form(page)).toHaveCount(0)
  let plan = await getPlan(request, id)
  expect(plan.renames).toEqual([{ id: sw, name: 'Lab switch' }])
  expect(plan.details ?? []).toHaveLength(0)
  await showPage()
  await expect(title()).toContainText('Lab switch')

  // The Changes drawer has the line, and Undo brings the name back.
  await page.getByRole('button', { name: /^Changes/ }).click()
  await expect(changes).toContainText('Rename REN-1 → Lab switch')
  await expect(changes).toContainText('REN-1 · access switch')
  await changes
    .getByRole('button', { name: 'Undo: Rename REN-1 → Lab switch' })
    .click()
  await expect(changes).not.toContainText('Rename REN-1')
  await expect(title()).toContainText('REN-1')
  expect((await getPlan(request, id)).renames ?? []).toHaveLength(0)

  // The name and a detail in one save.
  await edit()
  await form(page).getByLabel('Name').fill('Lab switch')
  await form(page).getByLabel('Model').fill('C9300')
  await page.screenshot({ path: 'test-results/p2-3-rename.png' })
  await form(page).getByRole('button', { name: 'Save in plan' }).click()
  await expect(form(page)).toHaveCount(0)
  plan = await getPlan(request, id)
  expect(plan.renames).toEqual([{ id: sw, name: 'Lab switch' }])
  expect(JSON.stringify(plan.details)).toContain('C9300')
  const revision = plan.revision

  // A taken name is refused in the server's words and changes nothing.
  await details(page).getByRole('button', { name: 'Edit details' }).click()
  await form(page).getByLabel('Name').fill('EDGE-17')
  await form(page).getByRole('button', { name: 'Save in plan' }).click()
  await expect(form(page).getByTestId('edit-error')).toContainText(
    'equipment name already exists in this topology',
  )
  await expect(form(page)).toBeVisible()
  expect((await getPlan(request, id)).revision).toBe(revision)
  await page.keyboard.press('Escape')

  // Recording writes the new name to Installed.
  await record(request, id)
  const installed = await (
    await request.get('/api/topology?context=installed')
  ).json()
  const names = installed.equipment.map((e: { name: string }) => e.name)
  expect(names).toContain('Lab switch')
  expect(names).not.toContain('REN-1')
})

test('FD-05 a faulty port: Edit port details in Physical, the jack is hatched, and the detail says faulty', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 02',
  )
  await page.locator('.rack-block[data-equipment-id="agg-15"]').click()
  const jack = page.locator('[data-endpoint-id="agg-15:p3"]')
  await jack.click()
  const port = page.getByTestId('port-details')
  await port.getByRole('button', { name: 'Edit port details' }).click()
  await form(page).getByLabel('State').selectOption('faulty')
  await form(page).getByLabel('Speed').selectOption('10G')
  await form(page)
    .getByLabel('Why (optional, kept in history)')
    .fill('Bent pins, module to replace')
  await form(page).getByRole('button', { name: 'Save fix' }).click()
  await expect(form(page)).toHaveCount(0)
  await expect(port).toContainText('faulty')
  await expect(port).toContainText('10G')
  await expect(jack).toHaveAttribute('data-port-state', 'faulty')
  await expect(jack).toHaveClass(/port-state-faulty/)
  await expect(page.getByTestId('legend-state')).toContainText('faulty')
  await shot(page, 'faulty-port')
})
