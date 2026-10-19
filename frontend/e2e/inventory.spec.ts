import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  fitted,
  highlightLocation,
  openExplore,
  selectEquipment,
} from './helpers'

interface Topology {
  equipment: { id: string; name: string; role: string }[]
  endpoints: { id: string; equipmentId: string; label: string }[]
  links: { id: string; kind: 'cable' | 'internal'; a: string; b: string }[]
}

const topology = async (page: Page, query = 'context=installed') =>
  (await (await page.request.get(`/api/topology?${query}`)).json()) as Topology

const root = (page: Page) => page.locator('[data-inventory-list]')
const mark = (page: Page, name: string) => root(page).getAttribute(name)
const table = (page: Page) => page.getByRole('table')
const lists = (page: Page) =>
  page.getByRole('navigation', { name: 'Inventory lists' })
const headerNetwork = (page: Page) =>
  page.getByRole('combobox', { name: 'Show network' })

async function openInventory(page: Page) {
  await page.goto('/')
  await fitted(page)
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await expect(root(page)).toBeVisible()
}

const chooseList = (page: Page, name: string) =>
  lists(page)
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click()

const total = async (page: Page) =>
  Number(await mark(page, 'data-inventory-total'))

test('INV-01 the Inventory view lists equipment, ports and cables as the snapshot has them', async ({
  page,
}) => {
  const snapshot = await topology(page)
  await openInventory(page)
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'equipment')
  const count = (name: string) =>
    lists(page)
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .locator('.count')
  await expect(count('Equipment')).toHaveText(
    snapshot.equipment.length.toLocaleString('en'),
  )
  await expect(count('Ports and positions')).toHaveText(
    snapshot.endpoints.length.toLocaleString('en'),
  )
  await expect(count('Cables')).toHaveText(
    snapshot.links
      .filter((l) => l.kind === 'cable')
      .length.toLocaleString('en'),
  )
  await expect(root(page)).toHaveAttribute(
    'data-inventory-total',
    String(snapshot.equipment.length),
  )
  await expect(page.getByText('Showing 1 to 11 of 11 records.')).toBeVisible()
  await expect(page.locator('[data-view]')).toHaveCount(0)
})

test('INV-01 a pill narrows the rows, and Reset filters clears it', async ({
  page,
}) => {
  await openInventory(page)
  await page.getByRole('button', { name: /^Role == / }).click()
  const picker = page.getByRole('dialog', { name: 'Filter Role' })
  await expect(picker.getByLabel('Find a value')).toHaveCount(0)
  await picker.getByLabel('Select all').uncheck()
  await picker.getByLabel('Backbone').check()
  await picker.getByRole('button', { name: 'Apply' }).click()
  await expect(picker).toHaveCount(0)
  await expect(root(page)).toHaveAttribute('data-inventory-total', '1')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-filters',
    JSON.stringify({ role: ['Backbone'] }),
  )
  await expect(
    page.getByRole('button', { name: 'Role == Backbone' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(root(page)).toHaveAttribute('data-inventory-total', '11')
  await expect(root(page)).toHaveAttribute('data-inventory-filters', '{}')
  await expect(page.getByRole('button', { name: 'Reset filters' })).toHaveCount(
    0,
  )
})

test('INV-01 the search finds a value in a hidden column', async ({ page }) => {
  await openInventory(page)
  // Rack is shown; the IP address is hidden by default, so search a hidden one.
  await expect(
    table(page).getByRole('columnheader', { name: /IP address/ }),
  ).toHaveCount(0)
  await page.getByLabel('Filter for any field').fill('10.99.99.99')
  await expect(root(page)).toHaveAttribute('data-inventory-total', '0')
  await expect(page.getByText('No records.').first()).toBeVisible()
  await page.getByLabel('Filter for any field').fill('agg-')
  await expect(root(page)).toHaveAttribute('data-inventory-total', '4')
})

test('INV-01 sorting flips and the mark follows', async ({ page }) => {
  await openInventory(page)
  await expect(root(page)).toHaveAttribute('data-inventory-sort', 'name:asc')
  const names = () =>
    table(page).locator('tbody tr td:nth-child(2) bdi').allTextContents()
  const up = await names()
  expect(up).toEqual(
    [...up].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  )
  await table(page).getByRole('button', { name: /^Name/ }).click()
  await expect(root(page)).toHaveAttribute('data-inventory-sort', 'name:desc')
  await expect(
    table(page).getByRole('columnheader', { name: /^Name/ }),
  ).toHaveAttribute('aria-sort', 'descending')
  expect(await names()).toEqual([...up].reverse())
  await table(page).getByRole('button', { name: /^Role/ }).click()
  await expect(root(page)).toHaveAttribute('data-inventory-sort', 'role:asc')
})

test('INV-01 Group by gives groups whose counts add up, and a group folds', async ({
  page,
}) => {
  await openInventory(page)
  await page.getByLabel('Group by').selectOption({ label: 'Network' })
  await expect(root(page)).toHaveAttribute('data-inventory-group', 'net')
  const heads = table(page).locator('tr.group-row')
  await expect(heads).toHaveCount(3)
  const counts = (await heads.locator('.n').allTextContents()).map((t) =>
    Number(t.replace(/\D/g, '')),
  )
  expect(counts.reduce((a, b) => a + b, 0)).toBe(await total(page))
  await expect(page.getByText(/Grouped: every record is listed/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Previous/ })).toHaveCount(0)
  await heads.first().getByRole('button').click()
  await expect(heads.first().getByRole('button')).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  const shown = Number(await mark(page, 'data-inventory-shown'))
  expect(shown).toBe((await total(page)) - counts[0])
  await page.getByLabel('Group by').selectOption({ label: 'No grouping' })
  await expect(root(page)).toHaveAttribute('data-inventory-group', '')
})

test('INV-01 paging moves through the 50-row pages', async ({ page }) => {
  const snapshot = await topology(page)
  expect(snapshot.endpoints.length).toBeGreaterThan(50)
  await openInventory(page)
  await chooseList(page, 'Ports and positions')
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'ports')
  const pages = Math.ceil(snapshot.endpoints.length / 50)
  await expect(page.getByText(`Page 1 of ${pages}`)).toBeVisible()
  // Only the rows in view are drawn: a few dozen, never the whole page.
  const drawn = Number(await mark(page, 'data-inventory-shown'))
  expect(drawn).toBeGreaterThan(10)
  expect(drawn).toBeLessThanOrEqual(50)
  expect(await table(page).locator('tbody tr:not(.inv-spacer)').count()).toBe(
    drawn,
  )
  await expect(page.getByRole('button', { name: /Previous/ })).toBeDisabled()
  await page.getByRole('button', { name: /Next/ }).click()
  await expect(root(page)).toHaveAttribute('data-inventory-page', '2')
  await expect(page.getByText(`Page 2 of ${pages}`)).toBeVisible()
  await expect(page.getByText('Showing 51 to 100 of')).toBeVisible()
  await page.getByRole('button', { name: /Previous/ }).click()
  await expect(root(page)).toHaveAttribute('data-inventory-page', '1')
})

test('INV-01 a Hebrew name stays one isolated name', async ({ page }) => {
  const name = 'ארון בדיקה 7'
  const rack = 'rack-dr01'
  const old = (
    await (await page.request.get('/api/topology?context=installed')).json()
  ).racks.find((r: { id: string }) => r.id === rack).name as string
  const fix = (n: string) =>
    page.request.patch(`/api/installed/racks/${rack}`, { data: { name: n } })
  expect((await fix(name)).ok()).toBe(true)
  try {
    await openInventory(page)
    await page.getByLabel('Filter for any field').fill('EDGE-22')
    await expect(root(page)).toHaveAttribute('data-inventory-total', '1')
    const cell = table(page).locator('tbody tr bdi', { hasText: name })
    await expect(cell).toHaveCount(1)
    await expect(cell).toHaveText(name)
    await page.getByLabel('Filter for any field').fill('בדיקה')
    await expect(root(page)).toHaveAttribute('data-inventory-total', '2')
  } finally {
    await fix(old)
  }
})

async function downloadCsv(page: Page) {
  await page.getByRole('button', { name: 'Export to CSV' }).click()
  const pane = page.getByRole('dialog', { name: 'Export to CSV' })
  await expect(pane).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    pane.getByRole('button', { name: 'Download' }).click(),
  ])
  const text = readFileSync((await download.path())!, 'utf8')
  return { text, name: download.suggestedFilename(), pane }
}

test('INV-02 the CSV holds the visible columns and every filtered record', async ({
  page,
}) => {
  await openInventory(page)
  await chooseList(page, 'Ports and positions')
  // More than one page of records (4 aggregation switches, 24 ports each, and their far ends).
  await page.getByLabel('Filter for any field').fill('agg-')
  await expect(root(page)).not.toHaveAttribute('data-inventory-total', '600')
  await expect.poll(() => total(page)).toBeGreaterThan(50)
  const count = await total(page)
  await page.getByRole('button', { name: 'Export to CSV' }).click()
  const pane = page.getByRole('dialog', { name: 'Export to CSV' })
  await expect(pane).toContainText(`${count} records`)
  await expect(pane).toContainText(/inventory-ports-\d{4}-\d{2}-\d{2}\.csv/)
  await expect(pane.getByRole('textbox')).toHaveValue(/^\uFEFFPort,Equipment/)
  await pane.getByRole('button', { name: 'Close' }).first().click()
  const { text, name } = await downloadCsv(page)
  expect(name).toMatch(/^inventory-ports-\d{4}-\d{2}-\d{2}\.csv$/)
  expect(text.charCodeAt(0)).toBe(0xfeff)
  const lines = text.slice(1).split('\r\n')
  const headers = await table(page).getByRole('columnheader').allTextContents()
  // The first header is the checkbox column, the last the ⋯ column: neither is in the CSV.
  const labels = headers
    .slice(1, -1)
    .map((h) => h.replace(/↑↓|↑|↓/g, '').trim())
  expect(lines[0].split(',')).toEqual(labels)
  // Every filtered record, not just the page; the hidden Site and Node are absent.
  expect(lines).toHaveLength(count + 1)
  expect(lines[0]).not.toContain('Site')
  expect(lines[1].split(',')[1]).toBe('AGG-03')
})

test('INV-05 Edit columns hides a column in the table and the CSV, and the first cannot be hidden', async ({
  page,
}) => {
  await openInventory(page)
  await chooseList(page, 'Cables')
  await expect(
    table(page).getByRole('columnheader', { name: /^Label/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Edit columns' }).click()
  const pane = page.getByRole('dialog', { name: 'Edit columns' })
  await expect(pane.getByLabel('Cable', { exact: true })).toBeDisabled()
  await expect(pane.getByLabel('Cable', { exact: true })).toBeChecked()
  await pane.getByLabel('Label').uncheck()
  await expect(
    table(page).getByRole('columnheader', { name: /^Label/ }),
  ).toHaveCount(0)
  await pane.getByRole('button', { name: 'Done' }).click()
  await expect(pane).toHaveCount(0)

  const { text, pane: csvPane } = await downloadCsv(page)
  expect(text.slice(1).split('\r\n')[0]).toBe(
    'Cable,A end,B end,Network,Status',
  )
  await csvPane.getByRole('button', { name: 'Close' }).first().click()

  // The choice survives a list change.
  await chooseList(page, 'Equipment')
  await chooseList(page, 'Cables')
  await expect(
    table(page).getByRole('columnheader', { name: /^Label/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit columns' }).click()
  await page
    .getByRole('dialog', { name: 'Edit columns' })
    .getByLabel('Label')
    .check()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(
    table(page).getByRole('columnheader', { name: /^Label/ }),
  ).toBeVisible()
})

test('INV-06 the header network and the Network pill follow each other', async ({
  page,
}) => {
  await openInventory(page)
  const pill = (text: RegExp | string) =>
    page.getByRole('button', { name: text })
  // Header → pill.
  await headerNetwork(page).selectOption({ label: 'Network B' })
  await expect(pill('Network == Network B')).toBeVisible()
  await expect(root(page)).toHaveAttribute('data-inventory-total', '2')
  await headerNetwork(page).selectOption({ label: 'All networks' })
  await expect(pill('Network == all')).toBeVisible()
  await expect(root(page)).toHaveAttribute('data-inventory-total', '11')

  // Pill (one network) → header.
  await pill(/^Network == /).click()
  let picker = page.getByRole('dialog', { name: 'Filter Network' })
  await picker.getByLabel('Select all').uncheck()
  await picker.getByLabel('Network A').check()
  await picker.getByRole('button', { name: 'Apply' }).click()
  await expect(headerNetwork(page)).toHaveValue('net-a')

  // Pill (two networks) → "2 networks", header untouched.
  await pill(/^Network == /).click()
  picker = page.getByRole('dialog', { name: 'Filter Network' })
  await picker.getByLabel('Network B').check()
  await picker.getByRole('button', { name: 'Apply' }).click()
  await expect(headerNetwork(page).locator('option:checked')).toHaveText(
    '2 networks',
  )
  await expect(pill('Network == 2 selected')).toBeVisible()

  // Reset filters clears both.
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(headerNetwork(page)).toHaveValue('')
  await expect(root(page)).toHaveAttribute('data-inventory-filters', '{}')

  // Choosing in the header again leaves "2 networks".
  await pill(/^Network == /).click()
  picker = page.getByRole('dialog', { name: 'Filter Network' })
  await picker.getByLabel('Select all').uncheck()
  await picker.getByLabel('Network A').check()
  await picker.getByLabel('Network B').check()
  await picker.getByRole('button', { name: 'Apply' }).click()
  await expect(headerNetwork(page).locator('option:checked')).toHaveText(
    '2 networks',
  )
  await headerNetwork(page).selectOption({ label: 'Network A' })
  await expect(pill('Network == Network A')).toBeVisible()

  // Conceptual keeps its usual network behaviour.
  await headerNetwork(page).selectOption({ label: 'Network B' })
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Conceptual', exact: true })
    .click()
  await fitted(page)
  await expect(headerNetwork(page)).toHaveValue('net-b')
  await expect(page.locator('[data-node-id="node-building-a"]')).toHaveClass(
    /dimmed/,
  )
  await expect(
    headerNetwork(page).locator('option', { hasText: /^\d+ networks$/ }),
  ).toHaveCount(0)
})

test('Plan: the Expansion draft marks its proposed rows', async ({ page }) => {
  await page.goto('/')
  await fitted(page)
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await expect(root(page)).toBeVisible()
  await expect(page.getByText('proposed items are marked')).toBeVisible()
  await expect(table(page).locator('.chip.proposed').first()).toBeVisible()
  const planned = await topology(page, 'context=installed')
  expect(Number(await mark(page, 'data-inventory-total'))).toBeGreaterThan(
    planned.equipment.length,
  )
  await expect(
    page.getByRole('button', { name: 'Add in a plan' }),
  ).toBeEnabled()
})

test('Add in a plan is disabled in Installed, with its reason', async ({
  page,
}) => {
  await openInventory(page)
  const add = page.getByRole('button', { name: 'Add in a plan' })
  await expect(add).toBeDisabled()
  await expect(add).toHaveAttribute(
    'title',
    'Switch to a plan to add equipment',
  )
})

test('The inspector opens from a name and the page narrows', async ({
  page,
}) => {
  await openInventory(page)
  const box = async () => (await table(page).locator('xpath=..').boundingBox())!
  const before = await box()
  await table(page).getByRole('button', { name: 'AGG-03', exact: true }).click()
  const inspector = page.getByRole('complementary', {
    name: /Equipment inspector/,
  })
  await expect(inspector.locator('.inspector-header h2')).toHaveText('AGG-03')
  await expect(root(page)).toBeVisible()
  const drawer = (await inspector.boundingBox())!
  await expect
    .poll(async () => {
      const b = await box()
      return b.x + b.width
    })
    .toBeLessThan(drawer.x)
  expect((await box()).width).toBeLessThan(before.width)
})

test('INV-01 a port row opens the inspector on its port', async ({ page }) => {
  await openInventory(page)
  await chooseList(page, 'Ports and positions')
  await page.getByLabel('Filter for any field').fill('agg-03')
  await table(page).getByRole('button', { name: 'AGG-03' }).first().click()
  await expect(page.locator('.inspector-header h2')).toHaveText('AGG-03')
})

// ---------------------------------------------------------------- Step 3: actions

const focusRoot = (page: Page) => page.locator('[data-view="focus"]')
const physicalRoot = (page: Page) => page.locator('[data-physical-level]')
const inspectorHeading = (page: Page) => page.locator('.inspector-header h2')
const plansNow = async (page: Page) =>
  (await page.request.get('/api/plans')).text()

/** The first cabled port of an equipment, with the cable on it. */
async function cabledPort(page: Page, equipmentId: string) {
  const t = await topology(page)
  const cables = t.links.filter((l) => l.kind === 'cable')
  for (const endpoint of t.endpoints) {
    if (endpoint.equipmentId !== equipmentId) continue
    const cable = cables.find((l) => l.a === endpoint.id || l.b === endpoint.id)
    if (cable) return { endpoint, cable }
  }
  throw new Error(`no cabled port on ${equipmentId}`)
}

/** The Ports row of one equipment's port: found by the equipment button and the exact label. */
function portRow(page: Page, equipment: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return table(page)
    .locator('tbody tr')
    .filter({ has: page.getByRole('button', { name: equipment, exact: true }) })
    .filter({
      has: page.locator('td', { hasText: new RegExp(`^${escaped}$`) }),
    })
}

async function inExpansionPlan(page: Page) {
  await page.goto('/')
  await fitted(page)
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await expect(root(page)).toBeVisible()
}

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Commands' })

test('INV-03 Open details on a port row opens the inspector with that port found', async ({
  page,
}) => {
  const { endpoint } = await cabledPort(page, 'agg-03')
  await openInventory(page)
  await chooseList(page, 'Ports and positions')
  await page.getByLabel('Filter for any field').fill('agg-03')
  const row = portRow(page, 'AGG-03', endpoint.label)
  await expect(row).toHaveCount(1)
  // Nothing is selected: the one-row commands are off, with their reason.
  const open = bar(page).getByRole('button', { name: 'Open details' })
  await expect(open).toBeDisabled()
  await expect(open).toHaveAttribute('title', 'Select one row')
  await row.getByRole('checkbox').check()
  await expect(open).toBeEnabled()
  await open.click()
  await expect(inspectorHeading(page)).toHaveText('AGG-03')
  await expect(page.getByRole('tab', { name: 'Ports' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByLabel('Search endpoints')).toHaveValue(endpoint.label)
  // The search is the label (as Explore's port hits make it): its row is listed.
  await expect(page.getByTestId('inspector-unit').first()).toBeVisible()
  await expect(root(page)).toBeVisible()
})

test('INV-03 two selected rows turn the one-row commands off', async ({
  page,
}) => {
  await openInventory(page)
  const open = bar(page).getByRole('button', { name: 'Open details' })
  await table(page).getByLabel('Select AGG-03').check()
  await expect(open).toBeEnabled()
  await table(page).getByLabel('Select EDGE-17').check()
  await expect(open).toBeDisabled()
  await expect(open).toHaveAttribute('title', 'Select one row')
})

test('INV-03 Show on map opens Focus on the equipment', async ({ page }) => {
  await openInventory(page)
  await table(page).getByLabel('Select AGG-03').check()
  await bar(page).getByRole('button', { name: 'Show on map' }).click()
  await expect(focusRoot(page)).toHaveAttribute('data-focus-id', 'agg-03')
})

test('INV-03 Show in Physical opens the equipment page at the port', async ({
  page,
}) => {
  const { endpoint } = await cabledPort(page, 'agg-03')
  await openInventory(page)
  await chooseList(page, 'Ports and positions')
  await page.getByLabel('Filter for any field').fill('agg-03')
  await portRow(page, 'AGG-03', endpoint.label).getByRole('checkbox').check()
  await bar(page).getByRole('button', { name: 'Show in Physical' }).click()
  await expect(physicalRoot(page)).toHaveAttribute(
    'data-physical-level',
    'equipment',
  )
  await expect(physicalRoot(page)).toHaveAttribute(
    'data-selected-endpoint',
    endpoint.id,
  )
})

test('INV-03 in a plan, Delete… shows the inspector confirm and Cancel changes nothing', async ({
  page,
}) => {
  await inExpansionPlan(page)
  const before = await plansNow(page)
  const del = bar(page).getByRole('button', { name: 'Delete…' })
  await expect(del).toBeDisabled()
  await table(page).getByLabel('Select AGG-03').check()
  await expect(del).toBeEnabled()
  await del.click()
  await expect(inspectorHeading(page)).toHaveText('AGG-03')
  const confirm = page
    .getByTestId('delete-equipment-inspector')
    .getByRole('group', { name: 'Confirm delete' })
  await expect(confirm).toBeVisible()
  await expect(root(page)).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toHaveCount(0)
  expect(await plansNow(page)).toBe(before)
  // The same row can ask again.
  await del.click()
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
})

test('INV-03 Delete… is off for a proposed row, with the reason', async ({
  page,
}) => {
  await inExpansionPlan(page)
  await table(page).getByLabel('Select EDGE-18').check()
  const del = bar(page).getByRole('button', { name: 'Delete…' })
  await expect(del).toBeDisabled()
  await expect(del).toHaveAttribute(
    'title',
    'Use Changes to undo a proposed item',
  )
  await page.getByRole('button', { name: 'More actions for EDGE-18' }).click()
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Open details' }),
  ).toBeVisible()
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Delete…' }),
  ).toHaveCount(0)
})

test('INV-03 in a plan, Disconnect… shows the confirm on that port and Cancel changes nothing', async ({
  page,
}) => {
  const { endpoint, cable } = await cabledPort(page, 'agg-03')
  await inExpansionPlan(page)
  await chooseList(page, 'Ports and positions')
  await page.getByLabel('Filter for any field').fill('agg-03')
  const before = await plansNow(page)
  const disconnect = bar(page).getByRole('button', { name: 'Disconnect…' })
  await expect(disconnect).toBeDisabled()
  await portRow(page, 'AGG-03', endpoint.label).getByRole('checkbox').check()
  await expect(disconnect).toBeEnabled()
  await disconnect.click()
  await expect(inspectorHeading(page)).toHaveText('AGG-03')
  const confirm = page.getByRole('group', { name: 'Confirm disconnect' })
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText(cable.id)
  await expect(page.getByLabel('Search endpoints')).toHaveValue(endpoint.label)
  await expect(root(page)).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toHaveCount(0)
  expect(await plansNow(page)).toBe(before)
})

test('INV-03 Disconnect… is off for a free port', async ({ page }) => {
  const t = await topology(page)
  const used = new Set(t.links.flatMap((l) => [l.a, l.b]))
  const free = t.endpoints.find(
    (e) => e.equipmentId === 'agg-03' && !used.has(e.id),
  )
  test.skip(!free, 'agg-03 has no free port in the fixture')
  await inExpansionPlan(page)
  await chooseList(page, 'Ports and positions')
  await page.getByLabel('Filter for any field').fill('agg-03')
  await portRow(page, 'AGG-03', free!.label).getByRole('checkbox').check()
  const disconnect = bar(page).getByRole('button', { name: 'Disconnect…' })
  await expect(disconnect).toBeDisabled()
  await expect(disconnect).toHaveAttribute('title', 'Select one connected row')
})

test('INV-03 in Installed, nothing that edits is offered', async ({ page }) => {
  await openInventory(page)
  for (const list of ['Equipment', 'Ports and positions', 'Cables']) {
    await chooseList(page, list)
    await table(page)
      .getByLabel(/^Select (?!all)/)
      .first()
      .check()
    await expect(
      bar(page).getByRole('button', { name: 'Open details' }),
    ).toBeEnabled()
    await expect(
      bar(page).getByRole('button', { name: 'Delete…' }),
    ).toHaveCount(0)
    await expect(
      bar(page).getByRole('button', { name: 'Disconnect…' }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: /^More actions for / })
      .first()
      .click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Delete…' })).toHaveCount(0)
    await expect(
      menu.getByRole('menuitem', { name: 'Disconnect…' }),
    ).toHaveCount(0)
    if (list === 'Ports and positions')
      await expect(
        menu.getByRole('menuitem', { name: 'Edit port details' }),
      ).toBeVisible()
    await page.keyboard.press('Escape')
  }
})

test('INV-03 the ⋯ menu works by keyboard and Escape returns focus to its button', async ({
  page,
}) => {
  await openInventory(page)
  const more = page.getByRole('button', { name: 'More actions for AGG-03' })
  await more.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  const item = (name: string) => menu.getByRole('menuitem', { name })
  await expect(item('Open details')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(item('Show on map')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(item('Open details')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(item('View its ports')).toBeFocused() // wraps
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(more).toBeFocused()
  // Enter on an item runs it.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(inspectorHeading(page)).toHaveText('AGG-03')
  await expect(menu).toHaveCount(0)
})

test('INV-03 one menu at a time, a click outside closes it, Escape goes menu then picker', async ({
  page,
}) => {
  await openInventory(page)
  const menus = page.getByRole('menu')
  await page.getByRole('button', { name: 'More actions for AGG-03' }).click()
  await page.getByRole('button', { name: 'More actions for EDGE-17' }).click()
  await expect(menus).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'More actions for EDGE-17' }),
  ).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('heading', { name: 'Inventory', level: 1 }).click()
  await expect(menus).toHaveCount(0)

  // With a picker open too (the menu was opened by keyboard), Escape closes the menu first.
  await page.getByRole('button', { name: /^Role == / }).click()
  const picker = page.getByRole('dialog', { name: 'Filter Role' })
  await expect(picker).toBeVisible()
  const more = page.getByRole('button', { name: 'More actions for AGG-03' })
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(menus).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(menus).toHaveCount(0)
  await expect(picker).toBeVisible()
  await picker.getByLabel('Select all').focus()
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)
})

test('INV-03 the menu on a Cables row opens the A end', async ({ page }) => {
  const { cable, endpoint } = await cabledPort(page, 'agg-03')
  await openInventory(page)
  await chooseList(page, 'Cables')
  await page.getByLabel('Filter for any field').fill(cable.id)
  // The search settles after about 150 ms; a result that changes closes the menu.
  await expect
    .poll(async () => Number(await mark(page, 'data-inventory-total')))
    .toBeLessThan(
      (await topology(page)).links.filter((l) => l.kind === 'cable').length,
    )
  await page
    .getByRole('button', { name: `More actions for ${cable.id}` })
    .click()
  const menu = page.getByRole('menu')
  await expect(
    menu.getByRole('menuitem', { name: 'Show A end in Physical' }),
  ).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Show A end in Physical' }).click()
  await expect(physicalRoot(page)).toHaveAttribute(
    'data-physical-level',
    'equipment',
  )
  await expect(physicalRoot(page)).toHaveAttribute(
    'data-selected-endpoint',
    cable.a,
  )
  expect(endpoint.id).toBeTruthy()
})

test('INV-03 View its ports opens Ports with that equipment only and clears the header network', async ({
  page,
}) => {
  await openInventory(page)
  await headerNetwork(page).selectOption('net-a')
  await page.getByRole('button', { name: 'More actions for AGG-03' }).click()
  await page.getByRole('menuitem', { name: 'View its ports' }).click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'ports')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-filters',
    JSON.stringify({ equipment: ['AGG-03'] }),
  )
  await expect(headerNetwork(page)).toHaveValue('')
})

test('INV-04 Open in inventory from the inspector shows only that equipment’s ports', async ({
  page,
}) => {
  const t = await topology(page)
  const agg = t.equipment.find((e) => e.id === 'agg-03')!
  const ports = t.endpoints.filter((e) => e.equipmentId === agg.id).length
  await page.goto('/')
  await fitted(page)
  await headerNetwork(page).selectOption('net-a')
  await selectEquipment(page, 'AGG-03')
  await page
    .locator('.inspector-actions')
    .getByRole('button', { name: 'Open in inventory' })
    .click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'ports')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-filters',
    JSON.stringify({ equipment: ['AGG-03'] }),
  )
  await expect(root(page)).toHaveAttribute(
    'data-inventory-total',
    String(ports),
  )
  await expect(headerNetwork(page)).toHaveValue('')
  await expect(
    page.getByRole('button', { name: /^Equipment == / }),
  ).toContainText('AGG-03')
})

test('INV-04 Open in inventory from the equipment page shows only that equipment’s ports', async ({
  page,
}) => {
  const t = await topology(page)
  const ports = t.endpoints.filter((e) => e.equipmentId === 'edge-17').length
  await page.goto('/')
  await fitted(page)
  await selectEquipment(page, 'EDGE-17')
  await page.getByRole('button', { name: 'Show in Physical: EDGE-17' }).click()
  await expect(physicalRoot(page)).toHaveAttribute(
    'data-physical-level',
    'equipment',
  )
  await physicalRoot(page)
    .getByRole('button', { name: 'Open in inventory' })
    .click()
  await expect(root(page)).toHaveAttribute('data-inventory-list', 'ports')
  await expect(root(page)).toHaveAttribute(
    'data-inventory-filters',
    JSON.stringify({ equipment: ['EDGE-17'] }),
  )
  await expect(root(page)).toHaveAttribute(
    'data-inventory-total',
    String(ports),
  )
  await expect(headerNetwork(page)).toHaveValue('')
})

test('Explore while the Inventory is shown: equipment and port hits open the inspector and the page stays', async ({
  page,
}) => {
  const { endpoint } = await cabledPort(page, 'agg-03')
  await openInventory(page)
  await openExplore(page)
  const search = page.getByLabel('Find equipment')
  await search.fill('agg-03')
  await search.press('Enter')
  await expect(inspectorHeading(page)).toHaveText('AGG-03')
  await expect(root(page)).toBeVisible()
  await expect(focusRoot(page)).toHaveCount(0)

  await openExplore(page)
  await search.fill(`agg-03 ${endpoint.label}`)
  await page.getByTestId('search-port').first().click()
  await expect(inspectorHeading(page)).toHaveText('AGG-03')
  await expect(page.getByRole('tab', { name: 'Ports' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(root(page)).toBeVisible()
  await expect(focusRoot(page)).toHaveCount(0)
})

test('Explore while the Inventory is shown: a site highlights it on the map, as today', async ({
  page,
}) => {
  await openInventory(page)
  await highlightLocation(page, 'Main Campus')
  await expect(root(page)).toHaveCount(0)
  await expect(page.locator('[data-view]')).toBeVisible()
})
