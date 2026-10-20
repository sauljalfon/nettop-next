import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fitted } from './helpers'
import { patching, nearJack } from './patching-helpers'

/**
 * INV-08 to INV-11 and INV-14: the Racks, Problems and Work lists, free
 * capacity, and saved views, on the acceptance fixture and the Expansion draft.
 * Nothing here records a plan or saves a connection.
 */

interface Topology {
  networks: { id: string; name: string }[]
  equipment: { id: string; name: string }[]
  endpoints: { id: string; equipmentId: string; label: string }[]
  links: { id: string; kind: 'cable' | 'internal'; a: string; b: string }[]
}
const topology = async (page: Page, query = 'context=installed') =>
  (await (await page.request.get(`/api/topology?${query}`)).json()) as Topology

const root = (page: Page) => page.locator('[data-inventory-list]')
const table = (page: Page) => page.getByRole('table')
const lists = (page: Page) =>
  page.getByRole('navigation', { name: 'Inventory lists' })
const views = (page: Page) =>
  page.getByRole('navigation', { name: 'Saved views' })
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Commands' })
const headerNetwork = (page: Page) =>
  page.getByRole('combobox', { name: 'Show network' })
const inspectorHeading = (page: Page) => page.locator('.inspector-header h2')
const physicalRoot = (page: Page) => page.locator('[data-physical-level]')
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/inv-more-${name}.png` })

async function openInventory(page: Page, plan = false) {
  await page.goto('/')
  await fitted(page)
  if (plan) {
    await page.getByRole('button', { name: 'Plan: Expansion' }).click()
    await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  }
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await expect(root(page)).toBeVisible()
}

const chooseList = async (page: Page, name: string, list: string) => {
  await lists(page)
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', list)
}

/** The text of each cell of every drawn data row (not the checkbox or ⋯ cells). */
const rowTexts = async (page: Page): Promise<string[][]> =>
  table(page)
    .locator('tbody tr:not(.inv-spacer):not(.group-row)')
    .evaluateAll((trs) =>
      trs.map((tr) =>
        [...tr.querySelectorAll('td:not(.inv-check):not(.inv-more)')].map(
          (td) =>
            // The first cell is the name; a Proposed chip beside it is not part of it.
            (
              td.querySelector('.inv-first .inv-link')?.textContent ??
              td.textContent ??
              ''
            )
              .replace(/\s+/g, ' ')
              .trim(),
        ),
      ),
    )
const rowOf = async (page: Page, first: string) =>
  (await rowTexts(page)).find((r) => r[0].startsWith(first))!

const total = async (page: Page) =>
  Number(await root(page).getAttribute('data-inventory-total'))

async function pick(page: Page, pill: RegExp, label: string) {
  await page.getByRole('button', { name: pill }).click()
  const picker = page.getByRole('dialog', { name: /^Filter / })
  await picker.getByLabel('Select all').uncheck()
  await picker.getByLabel(label, { exact: true }).check()
  await picker.getByRole('button', { name: 'Apply' }).click()
  await expect(picker).toHaveCount(0)
}

async function downloadCsv(page: Page) {
  await page.getByRole('button', { name: 'Export to CSV' }).click()
  const pane = page.getByRole('dialog', { name: 'Export to CSV' })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    pane.getByRole('button', { name: 'Download' }).click(),
  ])
  return {
    text: readFileSync((await download.path())!, 'utf8'),
    name: download.suggestedFilename(),
  }
}

// ---------------------------------------------------------------- INV-08

test('INV-08 Racks: used, free, the largest block and Fits, from the snapshot', async ({
  page,
}) => {
  const t = await topology(page)
  await openInventory(page)
  await chooseList(page, 'Racks', 'racks')
  await expect(lists(page).getByRole('button', { name: /^Racks/ })).toHaveText(
    /8$/,
  )
  await expect(root(page)).toHaveAttribute('data-inventory-total', '8')
  expect(t.equipment).toHaveLength(11)
  await expect(
    table(page).getByRole('columnheader', { name: /^Largest free block/ }),
  ).toBeVisible()
  // Fits is a hidden column; its pill is there.
  await expect(
    table(page).getByRole('columnheader', { name: /^Fits/ }),
  ).toHaveCount(0)
  // AGG-03 at U8 and the 3U HDF-02 at U4–U6 in a 12U rack.
  expect(await rowOf(page, 'Rack Core 01')).toEqual([
    'Rack Core 01',
    'Main Campus',
    'Main Distribution',
    '12U',
    '4U',
    '8U',
    'U9–U12 (4U)',
    '2',
  ])
  expect(await rowOf(page, 'Rack T42')).toEqual([
    'Rack T42',
    'Annex',
    'Annex Hall',
    '42U',
    '0U',
    '42U',
    'U1–U42 (42U)',
    '0',
  ])
  await shot(page, 'racks')

  // Fits: only the empty 42U rack has room for 8U.
  await pick(page, /^Fits == /, '8U')
  await expect(root(page)).toHaveAttribute('data-inventory-total', '1')
  expect((await rowTexts(page))[0][0]).toBe('Rack T42')
  await page.getByRole('button', { name: 'Reset filters' }).click()

  // Sorting the largest block sorts by its size.
  await table(page)
    .getByRole('button', { name: /^Largest free block/ })
    .click()
  await table(page)
    .getByRole('button', { name: /^Largest free block/ })
    .click()
  expect((await rowTexts(page))[0][0]).toBe('Rack T42')

  // A group says how many units are free, counted over the racks listed.
  await page.getByLabel('Group by').selectOption({ label: 'Node' })
  const main = table(page)
    .locator('tr.group-row')
    .filter({ hasText: 'Main Distribution' })
  await expect(main.locator('.inv-use')).toHaveText('29U free')
})

test('INV-08 Show in Physical opens the rack', async ({ page }) => {
  await openInventory(page)
  await chooseList(page, 'Racks', 'racks')
  await expect(
    bar(page).getByRole('button', { name: 'Show in Physical' }),
  ).toBeDisabled()
  await table(page).getByLabel('Select Rack Core 01').check()
  await bar(page).getByRole('button', { name: 'Show in Physical' }).click()
  await expect(physicalRoot(page)).toHaveAttribute(
    'data-physical-level',
    'rack',
  )
  await expect(physicalRoot(page)).toHaveAttribute(
    'data-location',
    /rack-core-01/,
  )
  // The row's ⋯ menu offers the same, and nothing else.
  await openInventory(page)
  await chooseList(page, 'Racks', 'racks')
  await page.getByLabel('More actions for Rack T42').click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem')).toHaveText(['Show in Physical'])
  await menu.getByRole('menuitem', { name: 'Show in Physical' }).click()
  await expect(physicalRoot(page)).toHaveAttribute('data-location', /rack-t42/)
})

// ---------------------------------------------------------------- INV-09

test('INV-09 Problems shows its count and its rows, and a row opens its object', async ({
  page,
}) => {
  const t = await topology(page)
  // The acceptance fixture gives no serial number to any switch; it has no
  // joined networks, faulty ports or shared addresses (those rules are in the
  // unit tests).
  const switches = 7
  expect(t.equipment.length).toBeGreaterThan(switches)
  await openInventory(page)
  const entry = lists(page).getByRole('button', { name: /^Problems/ })
  await expect(entry.locator('.count')).toHaveText(String(switches))
  await expect(entry.locator('.count')).toHaveClass(/warn/)
  await expect(
    lists(page)
      .getByRole('button', { name: /^Racks/ })
      .locator('.count'),
  ).not.toHaveClass(/warn/)
  await entry.click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'problems')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-total',
    String(switches),
  )
  const rows = await rowTexts(page)
  expect(rows.map((r) => r[1])).toEqual(
    Array(switches).fill('A switch has no serial number'),
  )
  expect(rows[0][2]).toBe('Fill it in with Edit details')
  expect(rows.map((r) => r[0]).sort()).toEqual(
    [
      'AGG-03',
      'AGG-08',
      'AGG-12',
      'AGG-15',
      'BB-01',
      'EDGE-17',
      'EDGE-22',
    ].sort(),
  )
  await shot(page, 'problems')
  // No Add on a list that only reports.
  await expect(
    bar(page).getByRole('button', { name: 'Add in a plan' }),
  ).toHaveCount(0)

  // Open details and Show in Physical open the row's equipment.
  await table(page).getByLabel('Select AGG-03').check()
  await expect(
    bar(page).getByRole('button', { name: 'Show on map' }),
  ).toHaveCount(0)
  await bar(page).getByRole('button', { name: 'Open details' }).click()
  await expect(inspectorHeading(page)).toHaveText('AGG-03')
  await bar(page).getByRole('button', { name: 'Show in Physical' }).click()
  await expect(physicalRoot(page)).toHaveAttribute(
    'data-physical-level',
    'equipment',
  )
  await expect(physicalRoot(page)).toHaveAttribute('data-location', /agg-03/)
})

// ---------------------------------------------------------------- INV-10

test('INV-10 Equipment and Ports say what is used and free', async ({
  page,
}) => {
  const t = await topology(page)
  await openInventory(page)
  const eq = async (name: string) => {
    const header = await table(page).getByRole('columnheader').allTextContents()
    const labels = header.map((h) => h.replace(/↑↓|↑|↓/g, '').trim())
    const row = await rowOf(page, name)
    const at = (label: string) => row[labels.indexOf(label) - 1]
    return [at('Ports used'), at('Ports free')]
  }
  // A switch counts its ports with a cable; a panel or HDF its positions
  // cabled on either side.
  expect(await eq('EDGE-17')).toEqual(['3', '21'])
  expect(await eq('AGG-15')).toEqual(['0', '24'])
  expect(await eq('PANEL-A')).toEqual(['3', '21'])
  expect(await eq('HDF-01')).toEqual(['4', '92'])
  await expect(
    table(page).getByRole('columnheader', { name: /^Manufacturer/ }),
  ).toHaveCount(0)

  await chooseList(page, 'Ports and positions', 'ports')
  const cabled = new Set(
    t.links.filter((l) => l.kind === 'cable').flatMap((l) => [l.a, l.b]),
  ).size
  await pick(page, /^Connected == /, 'Yes')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-total',
    String(cabled),
  )
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await pick(page, /^Connected == /, 'No')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-total',
    String(t.endpoints.length - cabled),
  )
  // The Node pill is offered on Ports.
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(page.getByRole('button', { name: /^Node == / })).toBeVisible()
})

test('INV-10 grouped Ports say "N used · M free" over the rows listed', async ({
  page,
}) => {
  const t = await topology(page)
  await openInventory(page)
  await chooseList(page, 'Ports and positions', 'ports')
  await page.getByLabel('Group by').selectOption({ label: 'Equipment' })
  const group = (name: string) =>
    table(page).locator('tr.group-row').filter({ hasText: name })
  await expect(group('AGG-03').locator('.inv-use')).toHaveText(
    '1 used · 23 free',
  )
  await shot(page, 'ports-grouped')
  // A filter changes what is counted.
  await pick(page, /^Connected == /, 'No')
  await expect(group('AGG-03').locator('.inv-use')).toHaveText(
    '0 used · 23 free',
  )
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await pick(page, /^Equipment == /, 'EDGE-17')
  await expect(group('EDGE-17').locator('.inv-use')).toHaveText(
    '3 used · 21 free',
  )
  await page.getByRole('button', { name: 'Reset filters' }).click()
  // Grouped by Connected, the groups add up to the endpoints; fold No to see Yes.
  await page.getByLabel('Group by').selectOption({ label: 'Connected' })
  await group('No').getByRole('button').click()
  await expect(group('Yes').locator('.inv-use')).toHaveText(
    /^32 used · 0 free$/,
  )
  expect(t.endpoints.length).toBeGreaterThan(32)
  // Equipment groups say ports used and free.
  await chooseList(page, 'Equipment', 'equipment')
  await page.getByLabel('Group by').selectOption({ label: 'Role' })
  await expect(group('Access').locator('.inv-use')).toHaveText(
    '4 ports used · 44 free',
  )
})

test('INV-10 Connect… on a free port in a plan opens the patching screen on that port', async ({
  page,
}) => {
  await openInventory(page, true)
  await chooseList(page, 'Ports and positions', 'ports')
  await page.getByLabel('Filter for any field').fill('agg-15')
  const row = table(page)
    .locator('tbody tr')
    .filter({ has: page.getByRole('button', { name: 'AGG-15', exact: true }) })
    .filter({ has: page.locator('td', { hasText: /^Port 2$/ }) })
  await expect(row).toHaveCount(1)
  await row.getByLabel('More actions for Port 2').click()
  const items = page.getByRole('menu').getByRole('menuitem')
  await expect(items).toContainText(['Connect…'])
  await page.getByRole('menuitem', { name: 'Connect…' }).click()
  await expect(patching(page)).toBeVisible()
  await expect(nearJack(page, 'agg-15:p2')).toBeVisible()
  // Nothing is connected: leave.
  const before = await (await page.request.get('/api/plans')).text()
  await patching(page).getByRole('button', { name: 'Close patching' }).click()
  await expect(patching(page)).toHaveCount(0)
  expect(await (await page.request.get('/api/plans')).text()).toBe(before)
  // Focus returns to the row's ⋯ button.
  await expect(row.getByLabel('More actions for Port 2')).toBeFocused()

  // A cabled port (EDGE-18's, in this plan) does not offer it.
  await page.getByLabel('Filter for any field').fill('edge-18')
  await page.getByLabel('More actions for Port 1').first().click()
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Connect…' }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('INV-10 Installed does not offer Connect…', async ({ page }) => {
  await openInventory(page)
  await chooseList(page, 'Ports and positions', 'ports')
  await page.getByLabel('Filter for any field').fill('agg-15')
  await page.getByLabel('More actions for Port 2').first().click()
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Connect…' }),
  ).toHaveCount(0)
})

// ---------------------------------------------------------------- INV-11

test('INV-11 the Work list is for a plan, first in the menu', async ({
  page,
}) => {
  await openInventory(page)
  await expect(
    lists(page).getByRole('button', { name: /^Work list/ }),
  ).toHaveCount(0)
  await page.goto('/')
  await fitted(page)
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  const names = await lists(page).getByRole('button').allTextContents()
  expect(names.map((n) => n.replace(/[\d,]+$/, ''))).toEqual([
    'Work list',
    'Equipment',
    'Ports and positions',
    'Cables',
    'Racks',
    'Problems',
  ])
  await expect(
    lists(page)
      .getByRole('button', { name: /^Work list/ })
      .locator('.count'),
  ).toHaveText('2')
})

test('INV-11 the Expansion draft’s Work list: EDGE-18 in Rack A03 and its cable to AGG-15', async ({
  page,
}) => {
  const planned = await topology(page, 'context=planned&planId=expansion')
  const network = planned.networks.find((n) => n.id === 'net-a')!.name
  await openInventory(page, true)
  await chooseList(page, 'Work list', 'work')
  await expect(root(page)).toHaveAttribute('data-inventory-total', '2')
  await expect(root(page)).toHaveAttribute('data-inventory-sort', 'n:asc')
  expect(await rowTexts(page)).toEqual([
    [
      'EDGE-18',
      '1',
      'Add',
      'Main Campus › Building A › Rack A03 · U6',
      `1 port, ${network}`,
    ],
    [
      'planned-cable-18',
      '2',
      'Connect',
      'EDGE-18 Port 1 ↔ AGG-15 Port 1',
      'No label',
    ],
  ])
  // Where is made of pieces: each name in its own isolating element.
  const where = table(page).locator('tbody tr').first().locator('td').nth(4)
  await expect(where.locator('bdi')).toHaveText([
    'Main Campus',
    'Building A',
    'Rack A03',
  ])
  // Add in a plan is not shown here; the Node column is hidden by default.
  await expect(
    bar(page).getByRole('button', { name: 'Add in a plan' }),
  ).toHaveCount(0)
  await expect(
    table(page).getByRole('columnheader', { name: /^Node/ }),
  ).toHaveCount(0)
  await shot(page, 'work')

  // Its CSV: the visible columns, in the order of the steps.
  const { text, name } = await downloadCsv(page)
  expect(name).toMatch(/^inventory-work-plan-expansion-\d{4}-\d{2}-\d{2}\.csv$/)
  expect(text.slice(1).split('\r\n')).toEqual([
    'Object,Step,Action,Where,Detail',
    `EDGE-18,1,Add,Main Campus › Building A › Rack A03 · U6,"1 port, ${network}"`,
    'planned-cable-18,2,Connect,EDGE-18 Port 1 ↔ AGG-15 Port 1,No label',
  ])
})

test('INV-11 Work list rows open their object', async ({ page }) => {
  await openInventory(page, true)
  await chooseList(page, 'Work list', 'work')
  await table(page).getByLabel('Select EDGE-18').check()
  await bar(page).getByRole('button', { name: 'Open details' }).click()
  await expect(inspectorHeading(page)).toHaveText('EDGE-18')
  await bar(page).getByRole('button', { name: 'Show in Physical' }).click()
  await expect(physicalRoot(page)).toHaveAttribute('data-location', /edge-18/)
  // The cable opens its A end, the port, in Physical.
  await openInventory(page, true)
  await chooseList(page, 'Work list', 'work')
  await page.getByLabel('More actions for planned-cable-18').click()
  await page.getByRole('menuitem', { name: 'Show in Physical' }).click()
  await expect(physicalRoot(page)).toHaveAttribute('data-location', /edge-18/)
})

test('INV-11 a session on the Work list falls back to Equipment on Installed', async ({
  page,
}) => {
  await openInventory(page, true)
  await chooseList(page, 'Work list', 'work')
  await page.getByRole('button', { name: 'Installed' }).click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'equipment')
  await expect(
    lists(page).getByRole('button', { name: /^Work list/ }),
  ).toHaveCount(0)
})

// ---------------------------------------------------------------- INV-14

const KEY = 'net-top-next.inventory-views'
const seed = (page: Page, value: unknown) =>
  page.addInitScript(
    ([key, data]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key as string, JSON.stringify(data))
        sessionStorage.setItem('seeded', '1')
      }
    },
    [KEY, value],
  )
const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), KEY)

async function saveView(page: Page, name: string) {
  await page.getByRole('button', { name: 'Save view…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save view' })
  await expect(dialog.getByLabel('View name')).toBeFocused()
  await expect(
    dialog.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await dialog.getByLabel('View name').fill(name)
  return dialog
}

test('INV-14 save, replace, open and delete a view', async ({ page }) => {
  await openInventory(page)
  await expect(views(page)).toContainText('None yet.')
  await expect(views(page)).toContainText('Kept in this browser only.')
  await chooseList(page, 'Ports and positions', 'ports')
  await pick(page, /^Network == /, 'Network A')
  await expect(headerNetwork(page)).toHaveValue('net-a')
  await pick(page, /^Connected == /, 'No')
  await page.getByLabel('Group by').selectOption({ label: 'Equipment' })
  await page.getByRole('button', { name: 'Edit columns' }).click()
  await page
    .getByRole('dialog', { name: 'Edit columns' })
    .getByLabel('Speed')
    .uncheck()
  await page.keyboard.press('Escape')
  const unsearched = await total(page)
  await page.getByLabel('Filter for any field').fill('agg')
  await expect.poll(() => total(page)).toBeLessThan(unsearched)
  const matching = await total(page)

  const dialog = await saveView(page, 'Free ports on aggs')
  await shot(page, 'save-view')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const entry = views(page).getByRole('button', {
    name: 'Free ports on aggs',
    exact: true,
  })
  await expect(entry).toBeVisible()
  await expect(entry).toHaveAttribute('aria-current', 'page')
  expect((await stored(page)).map((v: { name: string }) => v.name)).toEqual([
    'Free ports on aggs',
  ])

  // Elsewhere, with another network chosen, opening it brings everything back.
  await chooseList(page, 'Cables', 'cables')
  await headerNetwork(page).selectOption({ label: 'All networks' })
  await entry.click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'ports')
  await expect(root(page)).toHaveAttribute('data-inventory-group', 'equipment')
  await expect
    .poll(async () =>
      JSON.parse((await root(page).getAttribute('data-inventory-filters'))!),
    )
    .toEqual({ net: ['net-a'], connected: ['No'] })
  await expect(page.getByLabel('Filter for any field')).toHaveValue('agg')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-total',
    String(matching),
  )
  await expect(headerNetwork(page)).toHaveValue('net-a')
  await expect(
    table(page).getByRole('columnheader', { name: /^Speed/ }),
  ).toHaveCount(0)
  await expect(entry).toHaveAttribute('aria-current', 'page')

  // Saving the same name replaces it.
  await page.getByLabel('Filter for any field').fill('edge')
  await expect.poll(() => total(page)).not.toBe(matching)
  const again = await saveView(page, 'Free ports on aggs')
  await again.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    views(page).getByRole('button', {
      name: 'Free ports on aggs',
      exact: true,
    }),
  ).toHaveCount(1)
  const saved = await stored(page)
  expect(saved).toHaveLength(1)
  expect(saved[0].search).toBe('edge')

  // Delete.
  await views(page)
    .getByRole('button', { name: 'Delete the view Free ports on aggs' })
    .click()
  await expect(views(page)).toContainText('None yet.')
  expect(await stored(page)).toEqual([])
})

test('INV-14 a view whose column or value no longer exists opens without it, and says so', async ({
  page,
}) => {
  await seed(page, [
    {
      name: 'Old view',
      list: 'ports',
      search: '',
      filters: { connected: ['No', 'Maybe'], colour: ['red'] },
      sort: { key: 'gone', dir: -1 },
      group: 'gone',
      hidden: ['speed', 'gone'],
    },
  ])
  await openInventory(page)
  await views(page)
    .getByRole('button', { name: 'Old view', exact: true })
    .click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'ports')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-filters',
    JSON.stringify({ connected: ['No'] }),
  )
  await expect(root(page)).toHaveAttribute('data-inventory-group', '')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-sort',
    'equipment:asc',
  )
  await expect(
    table(page).getByRole('columnheader', { name: /^Speed/ }),
  ).toHaveCount(0)
  const note = page.getByRole('status').filter({ hasText: 'no longer exist' })
  await expect(note).toContainText('column gone')
  await expect(note).toContainText('connected Maybe')
  await expect(note).toContainText('filter colour')
})

test('INV-14 a view of the Work list says to switch to a plan on Installed', async ({
  page,
}) => {
  await seed(page, [
    {
      name: 'My steps',
      list: 'work',
      search: '',
      filters: {},
      sort: { key: 'n', dir: 1 },
      hidden: [],
    },
  ])
  await openInventory(page)
  await views(page)
    .getByRole('button', { name: 'My steps', exact: true })
    .click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'equipment')
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Switch to a plan to open the Work list' }),
  ).toBeVisible()
  // In the plan it opens.
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await views(page)
    .getByRole('button', { name: 'My steps', exact: true })
    .click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'work')
})

test('INV-14 views survive a reload; Hebrew names and a long name stay inside the box', async ({
  page,
}) => {
  await openInventory(page)
  const hebrew = 'פורטים פנויים בקומה 2'
  const long =
    'A very long name for a saved view that would run out of its box '.repeat(2)
  for (const name of [hebrew, long]) {
    const dialog = await saveView(page, name)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  }
  await page.reload()
  await fitted(page)
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await expect(views(page).locator('bdi', { hasText: hebrew })).toHaveText(
    hebrew,
  )
  const fits = (loc: Locator) =>
    loc.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
  expect(await fits(views(page))).toBe(true)
  // At a narrow width nothing makes the page scroll sideways.
  await page.setViewportSize({ width: 390, height: 800 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await shot(page, 'views-narrow')
  await views(page)
    .getByRole('button', { name: 'Delete the view', exact: false })
    .first()
    .click()
  await views(page)
    .getByRole('button', { name: 'Delete the view', exact: false })
    .first()
    .click()
  await expect(views(page)).toContainText('None yet.')
})

test('INV-14 with the storage blocked the views live for the session only', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    Storage.prototype.getItem = blocked
    Storage.prototype.setItem = blocked
    Storage.prototype.removeItem = blocked
  })
  await openInventory(page)
  const dialog = await saveView(page, 'Only this session')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  const entry = views(page).getByRole('button', {
    name: 'Only this session',
    exact: true,
  })
  await expect(entry).toBeVisible()
  await chooseList(page, 'Cables', 'cables')
  await entry.click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'equipment')
  // Switching to Physical and back keeps it (the session store lives on).
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Physical', exact: true })
    .click()
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await expect(entry).toBeVisible()
  await views(page)
    .getByRole('button', { name: 'Delete the view Only this session' })
    .click()
  await expect(views(page)).toContainText('None yet.')
})

// ---------------------------------------------------------------- INV-15

/** How many pages a PDF has: its page objects, not the /Pages tree. */
const pdfPages = (path: string) =>
  (readFileSync(path, 'latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length

const labelsPane = (page: Page) =>
  page.getByRole('dialog', { name: 'Print cable labels' })
const cards = (page: Page) => labelsPane(page).locator('.inv-label')

async function downloadPdf(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    labelsPane(page).getByRole('button', { name: 'Download PDF' }).click(),
  ])
  return { name: download.suggestedFilename(), path: (await download.path())! }
}

test('INV-15 labels for Selected and Listed cables, with a Hebrew name kept apart, and a PDF', async ({
  page,
}) => {
  const old = (await topology(page)).equipment.find(
    (e) => e.id === 'agg-03',
  )!.name
  const rename = (name: string) =>
    page.request.patch('/api/installed/equipment/agg-03', { data: { name } })
  const hebrew = 'מתג ליבה 3'
  expect((await rename(hebrew)).ok()).toBe(true)
  try {
    await openInventory(page)
    await chooseList(page, 'Cables', 'cables')
    await expect(
      bar(page).getByRole('button', { name: 'Print labels…' }),
    ).toBeEnabled()
    await table(page).getByLabel('Select cable-a04').check()
    await table(page).getByLabel('Select cable-a01').check()
    await bar(page).getByRole('button', { name: 'Print labels…' }).click()
    const pane = labelsPane(page)
    await expect(pane).toHaveAttribute('data-inventory-pane', 'labels')
    const sources = pane.getByRole('group', { name: 'Which cables' })
    await expect(sources.getByRole('button')).toHaveText([
      'Selected (2)',
      'Listed (16)',
    ])
    await expect(
      sources.getByRole('button', { name: /^Selected/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(pane).toContainText('A4, 2 × 8 labels a page: 1 page')
    await expect(cards(page)).toHaveCount(2)
    // The labels are in the order of the rows; each card holds the ID, the
    // label and both ends, each name in its own bdi.
    const a04 = cards(page).filter({ hasText: 'cable-a04' })
    await expect(a04.locator('bdi')).toHaveCount(4)
    await expect(a04.locator('bdi').nth(0)).toHaveText('HDF-02')
    await expect(a04.locator('bdi').nth(2)).toHaveText(hebrew)
    await expect(a04.locator('bdi').nth(3)).toHaveText('Port 1')
    await expect(a04).toContainText('No label')
    await shot(page, 'labels')

    await sources.getByRole('button', { name: /^Listed/ }).click()
    await expect(cards(page)).toHaveCount(16)
    await expect(pane).toContainText('1 page')
    const { name, path } = await downloadPdf(page)
    expect(name).toMatch(/^cable-labels-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdfPages(path)).toBe(1)
  } finally {
    await rename(old)
  }
})

test('INV-15 in a plan: Listed is two pages, New in this plan is the one cable', async ({
  page,
}) => {
  await openInventory(page, true)
  await chooseList(page, 'Cables', 'cables')
  await bar(page).getByRole('button', { name: 'Print labels…' }).click()
  const pane = labelsPane(page)
  const sources = pane.getByRole('group', { name: 'Which cables' })
  // Nothing is selected: Listed and New in this plan.
  await expect(sources.getByRole('button')).toHaveText([
    'Listed (17)',
    'New in this plan (1)',
  ])
  await expect(pane).toContainText('2 pages')
  // The preview is the first page.
  await expect(cards(page)).toHaveCount(16)
  const { name, path } = await downloadPdf(page)
  expect(name).toMatch(/^cable-labels-plan-expansion-\d{4}-\d{2}-\d{2}\.pdf$/)
  expect(pdfPages(path)).toBe(2)

  await sources.getByRole('button', { name: /^New in this plan/ }).click()
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).first()).toContainText('planned-cable-18')
  await expect(cards(page).first().locator('bdi')).toHaveText([
    'EDGE-18',
    'Port 1',
    'AGG-15',
    'Port 1',
  ])
  expect(pdfPages((await downloadPdf(page)).path)).toBe(1)
  await pane.getByRole('button', { name: 'Close' }).first().click()
  await expect(pane).toHaveCount(0)

  // The Work list offers it too, with New in this plan chosen first.
  await chooseList(page, 'Work list', 'work')
  await bar(page).getByRole('button', { name: 'Print labels…' }).click()
  await expect(
    sources.getByRole('button', { name: /^New in this plan/ }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('INV-15 Installed has no "New in this plan", and no cable means no download', async ({
  page,
}) => {
  await openInventory(page)
  await chooseList(page, 'Cables', 'cables')
  await page.getByLabel('Filter for any field').fill('no-such-cable')
  await expect(root(page)).toHaveAttribute('data-inventory-total', '0')
  await bar(page).getByRole('button', { name: 'Print labels…' }).click()
  const pane = labelsPane(page)
  await expect(
    pane.getByRole('button', { name: /^New in this plan/ }),
  ).toHaveCount(0)
  await expect(
    pane.getByRole('button', { name: 'Download PDF' }),
  ).toBeDisabled()
  await expect(pane).toContainText('No cables')
})
