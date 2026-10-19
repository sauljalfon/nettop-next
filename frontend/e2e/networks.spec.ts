import { expect, test, type Page } from '@playwright/test'
import { fitted, selectEquipment, viewport } from './helpers'

// The test database is shared by every spec in a run and networks cannot be
// deleted, so this spec uses unique names and puts Network A back.
const PALETTE = ['rgb(47, 111, 219)', 'rgb(154, 79, 199)', 'rgb(194, 84, 45)']

const select = (page: Page) =>
  page.getByRole('combobox', { name: 'Show network' })
const drawer = (page: Page) =>
  page.getByLabel('Manage networks', { exact: true })
const rows = (page: Page) => drawer(page).getByTestId('network-row')
const rename = (page: Page, name: string) =>
  rows(page)
    .filter({ hasText: name })
    .getByRole('button', { name: `Rename ${name}` })
const field = (page: Page) => drawer(page).getByLabel('Network name')
const errorLine = (page: Page) => drawer(page).getByRole('alert')

async function openDrawer(page: Page) {
  await select(page).selectOption({ label: 'Manage networks…' })
  await expect(drawer(page)).toBeVisible()
}

test.afterEach(async ({ request }) => {
  await request.patch('/api/networks/net-a', { data: { name: 'Network A' } })
})

test('NET-04 adding a network shows it in the selector, the drawer and the plan form, in the third palette color', async ({
  page,
  request,
}) => {
  const name = `Network C ${Date.now()}`
  await page.goto('/')
  await fitted(page)
  const before = await viewport(page)

  // Choosing the entry opens the drawer and leaves the filter choice alone.
  await select(page).selectOption('net-a')
  await openDrawer(page)
  await expect(select(page)).toHaveValue('net-a')
  await expect(drawer(page)).toContainText('Networks are shared by every view.')
  await expect(drawer(page)).toContainText(
    'Colors follow the order networks were added, so renaming never changes one.',
  )
  const existing = await rows(page).count()
  expect(existing).toBeGreaterThanOrEqual(2)
  await expect(rows(page).nth(0)).toHaveText(/Network A.*5 devices/)
  await expect(rows(page).nth(1)).toHaveText(/Network B.*2 devices/)
  const names = (
    await rows(page).locator('.network-name').allTextContents()
  ).map((n) => n.trim())
  const dot = (i: number) => rows(page).nth(i).getByTestId('network-swatch')
  for (let i = 0; i < existing; i++)
    await expect(dot(i)).toHaveCSS('background-color', PALETTE[i % 6])

  // A duplicate (ignoring case) is rejected on one line under the field; nothing is added.
  const addRow = drawer(page).getByTestId('network-add-row')
  await addRow.getByRole('button', { name: 'Add network' }).click()
  const newField = drawer(page).getByLabel('New network name')
  // The field shows the color the new network will get and lines up with the names.
  await expect(addRow.getByTestId('network-swatch')).toHaveCSS(
    'background-color',
    PALETTE[existing % 6],
  )
  const nameBox = await rows(page)
    .first()
    .locator('.network-name')
    .boundingBox()
  const fieldBox = await newField.boundingBox()
  expect(Math.abs(fieldBox!.x - nameBox!.x)).toBeLessThan(1.5)
  await newField.fill('network a')
  await newField.press('Enter')
  await expect(errorLine(page)).toContainText('already used by another network')
  await expect(rows(page)).toHaveCount(existing)

  await newField.fill(name)
  await newField.press('Enter')
  await expect(rows(page)).toHaveCount(existing + 1)
  await expect(rows(page).nth(existing)).toContainText(name)
  await expect(rows(page).nth(existing)).toContainText('0 devices')
  await expect(dot(existing)).toHaveCSS(
    'background-color',
    PALETTE[existing % 6],
  )
  await expect(drawer(page).getByLabel('New network name')).toHaveCount(0)
  const created = (await (await request.get('/api/topology')).json()).networks
  expect(created.map((n: { name: string }) => n.name)).toEqual([...names, name])

  // The selector lists it last (before the entry that opens this drawer), the
  // filter is still Network A, and the map did not move or refit.
  await expect(select(page).locator('option')).toHaveText([
    'All networks',
    ...names,
    name,
    'Manage networks…',
  ])
  await expect(select(page)).toHaveValue('net-a')
  expect(await viewport(page)).toBe(before)

  // The plan form's Network select offers it.
  await page.getByRole('button', { name: 'Close Manage networks' }).click()
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Access switch…' }).click()
  await expect(
    page.getByTestId('equipment-form').getByLabel('Network').locator('option'),
  ).toContainText(["Choose the device's network", ...names, name])
})

test('NET-05 renaming Network A updates the selector, badges and inspector; its color and the filter stay', async ({
  page,
}) => {
  const renamed = `Campus A ${Date.now()}`
  await page.goto('/')
  await fitted(page)
  await select(page).selectOption('net-a')
  // EDGE-17's Focus card carries its network's badge.
  await selectEquipment(page, 'EDGE-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await fitted(page)
  const badge = (text: string) =>
    page
      .locator('[data-equipment-id="edge-17"]')
      .locator('.network-badge', { hasText: text })
  const color = await badge('Network A').evaluate(
    (el) => (el.querySelector('.dot') as HTMLElement).style.backgroundColor,
  )
  const card = page.locator('[data-equipment-id="edge-17"]')
  const box = await card.boundingBox()
  const before = await viewport(page)

  await openDrawer(page)
  await rename(page, 'Network A').click()
  const input = field(page)
  await expect(input).toHaveValue('Network A')

  // Esc cancels; a duplicate and a blank name are rejected on a line under the row.
  await input.fill('Something else')
  await input.press('Escape')
  await expect(rows(page).first()).toContainText('Network A')
  await expect(field(page)).toHaveCount(0)
  await rename(page, 'Network A').click()
  await input.fill('network b')
  await input.press('Enter')
  await expect(errorLine(page)).toContainText('already used by another network')
  await input.fill('   ')
  await input.press('Enter')
  await expect(errorLine(page)).toContainText('Enter a name.')

  await input.fill(renamed)
  await input.press('Enter')
  await expect(rows(page).first()).toContainText(renamed)
  await expect(field(page)).toHaveCount(0)
  await expect(errorLine(page)).toHaveCount(0)

  // Selector: the same network (ID) is still chosen, under its new name.
  await expect(select(page)).toHaveValue('net-a')
  await expect(select(page).locator('option:checked')).toHaveText(renamed)
  // Badges: the new name in the same color.
  await expect(badge(renamed)).toBeVisible()
  await expect(badge('Network A')).toHaveCount(0)
  expect(
    await badge(renamed).evaluate(
      (el) => (el.querySelector('.dot') as HTMLElement).style.backgroundColor,
    ),
  ).toBe(color)
  await expect(rows(page).first().getByTestId('network-swatch')).toHaveCSS(
    'background-color',
    PALETTE[0],
  )
  // The map did not refit or move.
  expect(await viewport(page)).toBe(before)
  expect(await card.boundingBox()).toEqual(box)

  // Inspector.
  await page.getByRole('button', { name: 'Close Manage networks' }).click()
  await selectEquipment(page, 'EDGE-17')
  await expect(page.getByRole('tabpanel')).toContainText(renamed)
})

test('NET-06 renaming and adding work with the mouse alone (✓ and ✕)', async ({
  page,
}) => {
  const stamp = Date.now()
  const renamed = `Mouse A ${stamp}`
  const added = `Mouse C ${stamp}`
  await page.goto('/')
  await fitted(page)
  await openDrawer(page)
  const before = await rows(page).count()

  // ✕ cancels a rename; ✓ saves it.
  await rename(page, 'Network A').click()
  await field(page).fill('Never saved')
  await drawer(page).getByRole('button', { name: 'Cancel rename' }).click()
  await expect(field(page)).toHaveCount(0)
  await expect(rows(page).first()).toContainText('Network A')
  await rename(page, 'Network A').click()
  await field(page).fill(renamed)
  await drawer(page).getByRole('button', { name: 'Save name' }).click()
  await expect(rows(page).first()).toContainText(renamed)
  await expect(select(page).locator('option').nth(1)).toHaveText(renamed)

  // ✕ cancels adding; ✓ adds.
  const addRow = drawer(page).getByTestId('network-add-row')
  await addRow.getByRole('button', { name: 'Add network' }).click()
  await drawer(page).getByLabel('New network name').fill('Never added')
  await drawer(page).getByRole('button', { name: 'Cancel add' }).click()
  await expect(rows(page)).toHaveCount(before)
  await expect(
    addRow.getByRole('button', { name: 'Add network' }),
  ).toBeVisible()
  await addRow.getByRole('button', { name: 'Add network' }).click()
  await drawer(page).getByLabel('New network name').fill(added)
  await drawer(page).getByRole('button', { name: 'Save name' }).click()
  await expect(rows(page)).toHaveCount(before + 1)
  await expect(rows(page).last()).toContainText(added)
})
