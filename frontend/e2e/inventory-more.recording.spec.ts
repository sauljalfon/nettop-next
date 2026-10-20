// INV-12 and INV-13 write to shared data: direct fixes on Installed (restored
// at the end, though History keeps their lines) and drafts of their own. They
// run in the "recording" project, after every other spec, and build on the
// revision they find (see changes.recording.spec.ts).
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Request,
} from '@playwright/test'
import { fitted } from './helpers'
import { addRoom, addSwitch, getPlan, newPlan, unique } from './plan-api'

const root = (page: Page) => page.locator('[data-inventory-list]')
const table = (page: Page) => page.getByRole('table')
const lists = (page: Page) =>
  page.getByRole('navigation', { name: 'Inventory lists' })
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Commands' })
const drawer = (page: Page) =>
  page.getByRole('complementary', { name: 'Changes & plans' })
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/inv-more-${name}.png` })

async function openInventory(page: Page, planId?: string) {
  await page.goto(planId ? `/?plan=${planId}` : '/')
  await fitted(page)
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
const total = async (page: Page) =>
  Number(await root(page).getAttribute('data-inventory-total'))

/** The requests of the page that match, counted as they happen. */
function watch(page: Page, match: (r: Request) => boolean) {
  const seen: Request[] = []
  page.on('request', (r) => match(r) && seen.push(r))
  return seen
}
const isFixes = (r: Request) =>
  r.method() === 'POST' && r.url().endsWith('/api/installed/fixes')
const isBatch = (r: Request) =>
  r.method() === 'POST' &&
  /\/api\/plans\/[^/]+\/commands$/.test(r.url()) &&
  (r.postData() ?? '').includes('"type":"batch"')

const log = async (request: APIRequestContext, id: string) =>
  (await (
    await request.get(`/api/change-log?entityKind=equipment&entityId=${id}`)
  ).json()) as { field: string; newValue: string; note?: string }[]

const SWITCHES = ['edge-17', 'edge-22', 'agg-12']
const NAMES = ['EDGE-17', 'EDGE-22', 'AGG-12']

// ---------------------------------------------------------------- INV-12

interface Equipment {
  id: string
  kind: string
  status?: string
  model?: string
  ipAddress?: string
}
const equipment = async (request: APIRequestContext) =>
  (
    (await (await request.get('/api/topology?context=installed')).json()) as {
      equipment: Equipment[]
    }
  ).equipment

test('INV-12 the Missing pill finds what lacks a detail', async ({ page }) => {
  // Recorded plans of other specs may have added switches: count what is there.
  const lacking = (await equipment(page.request)).filter(
    (e) => e.kind === 'switch' && !e.ipAddress,
  ).length
  await openInventory(page)
  await page.getByRole('button', { name: /^Missing == / }).click()
  const picker = page.getByRole('dialog', { name: 'Filter Missing' })
  await picker.getByLabel('Select all').uncheck()
  await picker.getByLabel('IP address', { exact: true }).check()
  await picker.getByRole('button', { name: 'Apply' }).click()
  // Only switches are asked for an address.
  await expect(root(page)).toHaveAttribute(
    'data-inventory-total',
    String(lacking),
  )
})

test('INV-12 on Installed one request fixes every selected row, and each History has the note', async ({
  page,
}) => {
  const requests = watch(page, isFixes)
  // What the rows have now: a row that already has the value is not sent.
  const originals = new Map(
    (await equipment(page.request)).map((e) => [e.id, e]),
  )
  await openInventory(page)
  const edit = bar(page).getByRole('button', { name: 'Edit details…' })
  await expect(edit).toBeDisabled()
  await expect(edit).toHaveAttribute('title', 'Select rows to edit')
  for (const name of NAMES)
    await table(page).getByLabel(`Select ${name}`).check()
  await expect(edit).toBeEnabled()
  await edit.click()
  const pane = page.getByRole('dialog', { name: 'Edit details of 3 equipment' })
  await expect(pane).toHaveAttribute('data-inventory-pane', 'edit')
  const save = pane.getByRole('button', { name: /^Save/ })
  await expect(save).toBeDisabled()
  await expect(pane.getByTestId('what-changes')).toContainText('Nothing yet')
  await pane.getByLabel('Model', { exact: true }).fill('C9500-TEST')
  await pane.getByLabel('Status').selectOption('maintenance')
  await pane.getByLabel(/^Why/).fill('Models checked on site')
  const changes = pane.getByTestId('what-changes')
  await expect(changes).toContainText('Model → C9500-TEST')
  await expect(changes).toContainText('3 of 3')
  await expect(changes).toContainText('Status → maintenance')
  await expect(save).toHaveText('Save 3 fixes')
  await shot(page, 'edit')
  try {
    await save.click()
    await expect(pane).toHaveCount(0)
    expect(requests).toHaveLength(1)
    const body = JSON.parse(requests[0].postData() ?? '{}')
    expect(body.note).toBe('Models checked on site')
    // One fix per row, in the order of the rows listed.
    expect(
      [...body.fixes].sort((x: { id: string }, y: { id: string }) =>
        x.id.localeCompare(y.id),
      ),
    ).toEqual(
      [...SWITCHES].sort().map((id) => ({
        kind: 'equipment',
        id,
        details:
          originals.get(id)?.status === 'maintenance'
            ? { model: 'C9500-TEST' }
            : { model: 'C9500-TEST', status: 'maintenance' },
      })),
    )
    for (const id of SWITCHES) {
      const lines = await log(page.request, id)
      const fields = lines
        .filter((l) => l.note === 'Models checked on site')
        .map((l) => l.field)
      expect(fields).toContain('model')
      expect(lines.find((l) => l.field === 'model' && l.note)?.newValue).toBe(
        'C9500-TEST',
      )
    }
    // The page shows the new value (the fix refetched it).
    await page.getByLabel('Filter for any field').fill('C9500-TEST')
    await expect.poll(() => total(page)).toBe(3)
    // A second pass with the same value changes no row: Save is off.
    await page.getByLabel('Filter for any field').fill('')
    await expect.poll(() => total(page)).toBeGreaterThan(3)
    for (const name of NAMES)
      await table(page).getByLabel(`Select ${name}`).check()
    await edit.click()
    await pane.getByLabel('Model', { exact: true }).fill('C9500-TEST')
    await expect(pane.getByTestId('what-changes')).toContainText('0 of 3')
    await expect(save).toBeDisabled()
  } finally {
    for (const id of SWITCHES)
      await page.request.patch(`/api/installed/equipment/${id}`, {
        data: {
          details: {
            model: originals.get(id)?.model ?? '',
            status: originals.get(id)?.status ?? '',
          },
        },
      })
  }
})

test('INV-12 a refused batch shows the server’s words and writes nothing', async ({
  page,
}) => {
  const before = await Promise.all(SWITCHES.map((id) => log(page.request, id)))
  await openInventory(page)
  for (const name of NAMES)
    await table(page).getByLabel(`Select ${name}`).check()
  await bar(page).getByRole('button', { name: 'Edit details…' }).click()
  const pane = page.getByRole('dialog', { name: 'Edit details of 3 equipment' })
  await pane.getByLabel('Model', { exact: true }).fill('x'.repeat(201))
  await pane.getByRole('button', { name: /^Save/ }).click()
  // The server's own refusal names the first fix.
  await expect(pane.getByRole('alert')).toContainText('fix 1 (')
  await expect(pane.getByRole('alert')).toContainText(
    'longer than 200 characters',
  )
  await expect(pane).toBeVisible()
  // And a 422 of any kind is shown as it comes.
  await page.route('**/api/installed/fixes', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'fix 2 (EDGE-22): invalid input: refused',
      }),
    }),
  )
  await pane.getByLabel('Model', { exact: true }).fill('C9500')
  await pane.getByRole('button', { name: /^Save/ }).click()
  await expect(pane.getByRole('alert')).toHaveText(
    'fix 2 (EDGE-22): invalid input: refused',
  )
  await page.unroute('**/api/installed/fixes')
  await pane.getByRole('button', { name: 'Cancel' }).click()
  await expect(pane).toHaveCount(0)
  const after = await Promise.all(SWITCHES.map((id) => log(page.request, id)))
  expect(after).toEqual(before)
})

test('INV-12 Ports are edited the same way, with their own fields', async ({
  page,
}) => {
  await openInventory(page)
  await chooseList(page, 'Ports and positions', 'ports')
  await page.getByLabel('Filter for any field').fill('agg-15')
  await expect.poll(() => total(page)).toBe(24)
  await table(page).getByLabel('Select Port 1', { exact: true }).check()
  await bar(page).getByRole('button', { name: 'Edit details…' }).click()
  const pane = page.getByRole('dialog', { name: 'Edit details of 1 port' })
  await expect(pane.locator('.inv-field > label')).toContainText([
    'Port type',
    'Connector',
    'Speed',
    'State',
  ])
  await expect(pane.getByLabel('Speed').locator('option')).toContainText([
    'Keep as is',
    '100M',
    '10G',
    '— (clear)',
  ])
})

test('INV-12 in a plan an installed row turns the command off; editing what the plan adds sends one batch', async ({
  page,
}) => {
  const id = await newPlan(page.request, unique('Bulk edit'))
  const room = await addRoom(page.request, id, 'BE')
  const name = unique('SW-BE')
  const a = await addSwitch(page.request, id, room.rackId, name, 1)
  const b = await addSwitch(page.request, id, room.rackId, `${name}-2`, 2)
  const batches = watch(page, isBatch)
  await openInventory(page, id)
  const edit = bar(page).getByRole('button', { name: 'Edit details…' })
  await table(page).getByLabel(`Select ${name}`, { exact: true }).check()
  await table(page).getByLabel('Select AGG-03').check()
  await expect(edit).toBeDisabled()
  await expect(edit).toHaveAttribute(
    'title',
    'In a plan only what it adds is edited; installed details are fixed on Installed',
  )
  await table(page).getByLabel('Select AGG-03').uncheck()
  await table(page).getByLabel(`Select ${name}-2`, { exact: true }).check()
  await expect(edit).toBeEnabled()
  await edit.click()
  const pane = page.getByRole('dialog', { name: 'Edit details of 2 equipment' })
  // No note in a plan: each row is a line in Changes.
  await expect(pane.getByLabel(/^Why/)).toHaveCount(0)
  await pane.getByLabel('Manufacturer').fill('Acme')
  await expect(pane.getByRole('button', { name: /^Save/ })).toHaveText(
    'Save 2 in plan',
  )
  await pane.getByRole('button', { name: /^Save/ }).click()
  await expect(pane).toHaveCount(0)
  expect(batches).toHaveLength(1)
  const body = JSON.parse(batches[0].postData() ?? '{}')
  expect(body.batch.commands).toEqual([
    {
      type: 'update_details',
      target: { id: a },
      details: { manufacturer: 'Acme' },
    },
    {
      type: 'update_details',
      target: { id: b },
      details: { manufacturer: 'Acme' },
    },
  ])
  const plan = await getPlan(page.request, id)
  expect(plan.details.map((d: { id: string }) => d.id).sort()).toEqual(
    [a, b].sort(),
  )
})

// ---------------------------------------------------------------- INV-13

const openChanges = async (page: Page) => {
  if (await drawer(page).count()) return
  await page.getByRole('button', { name: /^Changes/ }).click()
  await expect(drawer(page)).toBeVisible()
}

test('INV-13 Delete 2… and Disconnect N… are one batch each, listed in the Work list and Changes, and undone one by one', async ({
  page,
}) => {
  const id = await newPlan(page.request, unique('Bulk delete'))
  const batches = watch(page, isBatch)
  await openInventory(page, id)

  // One row keeps today's confirm; the many-row command is for two or more.
  await table(page).getByLabel('Select AGG-12').check()
  await expect(bar(page).getByRole('button', { name: 'Delete…' })).toBeEnabled()
  await expect(
    bar(page).getByRole('button', { name: /^Delete \d/ }),
  ).toHaveCount(0)
  await table(page).getByLabel('Select EDGE-22').check()
  await expect(bar(page).getByRole('button', { name: 'Delete…' })).toHaveCount(
    0,
  )
  await bar(page).getByRole('button', { name: 'Delete 2…' }).click()
  const pane = page.getByRole('dialog', { name: 'Delete 2 equipment' })
  await expect(pane).toHaveAttribute('data-inventory-pane', 'delete')
  await expect(pane.locator('.inv-list-box > div')).toHaveCount(2)
  await expect(pane).toContainText('48 ports or positions')
  await expect(pane).toContainText('2 cables')
  await expect(pane).toContainText('cuts 1 circuit')
  await expect(pane.locator('.inv-list-box')).toContainText(
    'DR Access › Rack DR01 · U8',
  )
  await shot(page, 'delete')

  // A refusal shows in the pane, in the server's words, and changes nothing.
  await page.route(/\/api\/plans\/[^/]+\/commands$/, (route) =>
    route.request().postData()?.includes('"type":"batch"')
      ? route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'invalid plan command: EDGE-22 cannot be deleted just now',
          }),
        })
      : route.continue(),
  )
  await pane.getByRole('button', { name: 'Delete 2 in plan' }).click()
  await expect(pane.getByRole('alert')).toHaveText(
    'EDGE-22 cannot be deleted just now',
  )
  expect((await getPlan(page.request, id)).removals?.equipment ?? []).toEqual(
    [],
  )
  await page.unroute(/\/api\/plans\/[^/]+\/commands$/)
  batches.length = 0

  await pane.getByRole('button', { name: 'Delete 2 in plan' }).click()
  await expect(pane).toHaveCount(0)
  expect(batches).toHaveLength(1)
  const sent = JSON.parse(batches[0].postData() ?? '{}').batch.commands
  expect(sent).toEqual([
    { type: 'delete_equipment', target: { id: 'agg-12' } },
    { type: 'delete_equipment', target: { id: 'edge-22' } },
  ])
  // The selection is cleared.
  await expect(page.getByText(/\d+ selected\./)).toHaveCount(0)

  // The Work list and Changes list them.
  await chooseList(page, 'Work list', 'work')
  await expect(root(page)).toHaveAttribute('data-inventory-total', '2')
  const removes = table(page).locator('tbody tr', { hasText: 'Remove' })
  await expect(removes).toHaveCount(2)
  await openChanges(page)
  const undo = drawer(page).getByRole('button', { name: /^Undo: / })
  await expect(undo).toHaveCount(2)
  await expect(undo.first()).toHaveAccessibleName(/AGG-12|EDGE-22/)
  // Undo of each change works.
  await undo.first().click()
  await expect(undo).toHaveCount(1)
  await undo.first().click()
  await expect(undo).toHaveCount(0)
  await expect(root(page)).toHaveAttribute('data-inventory-total', '0')
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()

  // Disconnect: the distinct cables of the selected rows.
  await chooseList(page, 'Cables', 'cables')
  await table(page).getByLabel('Select cable-a01').check()
  await expect(
    bar(page).getByRole('button', { name: 'Disconnect…' }),
  ).toBeEnabled()
  await table(page).getByLabel('Select cable-a05').check()
  await bar(page).getByRole('button', { name: 'Disconnect 2…' }).click()
  const dpane = page.getByRole('dialog', { name: 'Disconnect 2 cables' })
  await expect(dpane).toHaveAttribute('data-inventory-pane', 'disconnect')
  await expect(dpane.locator('.inv-list-box > div')).toHaveCount(2)
  await expect(dpane.locator('.inv-list-box')).toContainText('cable-a01')
  await expect(dpane).toContainText('cuts 2 circuits')
  await shot(page, 'disconnect')
  batches.length = 0
  await dpane.getByRole('button', { name: 'Disconnect 2 in plan' }).click()
  await expect(dpane).toHaveCount(0)
  expect(batches).toHaveLength(1)
  expect(JSON.parse(batches[0].postData() ?? '{}').batch.commands).toEqual([
    { type: 'disconnect_cable', target: { id: 'cable-a01' } },
    { type: 'disconnect_cable', target: { id: 'cable-a05' } },
  ])
  await chooseList(page, 'Work list', 'work')
  await expect(
    table(page).locator('tbody tr', { hasText: 'Disconnect' }),
  ).toHaveCount(2)
  await openChanges(page)
  await expect(undo).toHaveCount(2)
  await undo.first().click()
  await undo.first().click()
  await expect(undo).toHaveCount(0)
})

test('INV-13 Ports rows disconnect their distinct cables: two ends of one cable are one', async ({
  page,
}) => {
  const id = await newPlan(page.request, unique('Bulk disconnect'))
  await openInventory(page, id)
  await chooseList(page, 'Ports and positions', 'ports')
  await page.getByLabel('Filter for any field').fill('cable-a01')
  await expect.poll(() => total(page)).toBe(2)
  await page.getByLabel('Select all on this page').check()
  // Both ends of cable-a01 are selected, and one cable goes.
  await expect(
    bar(page).getByRole('button', { name: 'Disconnect 1…' }),
  ).toBeEnabled()
})

test('INV-13 Delete N… is off when a row the plan adds is selected', async ({
  page,
}) => {
  const id = await newPlan(page.request, unique('Bulk off'))
  const room = await addRoom(page.request, id, 'BO')
  const name = unique('SW-BO')
  await addSwitch(page.request, id, room.rackId, name, 1)
  await openInventory(page, id)
  await table(page).getByLabel('Select AGG-12').check()
  await table(page).getByLabel(`Select ${name}`, { exact: true }).check()
  const del = bar(page).getByRole('button', { name: 'Delete 2…' })
  await expect(del).toBeDisabled()
  await expect(del).toHaveAttribute(
    'title',
    'Use Changes to undo a proposed item',
  )
})
