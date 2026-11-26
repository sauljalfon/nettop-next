// Set model and the rename offer need Installed switches with ports at positions 1…52,
// so these specs record a plan; they run after the others (changes.recording.spec.ts).
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Request,
} from './fixtures'
import { chooseMore, fitted, openEquipmentPage } from './helpers'
import {
  addPositionedSwitch,
  changeLog,
  createModel,
  fixes,
  installedPorts,
  modelInput,
  openModelsFromPlan,
} from './models-api'
import { addRoom, newPlan, record, unique } from './plan-api'

const isFixes = (r: Request) =>
  r.method() === 'POST' && r.url().endsWith('/api/installed/fixes')
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Set model' })
// A 48-port group is drawn as two blocks of 24, so banks are counted by group.
const group = (page: Page, n: number) =>
  page.locator(`[data-testid="port-bank"][data-group="${n}"]`)

/** Switches recorded into Installed in a room of their own; returns their IDs by name. */
async function recordSwitches(
  request: APIRequestContext,
  label: string,
  specs: { name: string; ports: number }[],
) {
  const plan = await newPlan(request, unique(`${label} setup`))
  const room = await addRoom(request, plan, label)
  const ids: Record<string, string> = {}
  let unit = 1
  for (const s of specs)
    ids[s.name] = await addPositionedSwitch(
      request,
      plan,
      room.rackId,
      s.name,
      unit++,
      s.ports,
    )
  await record(request, plan, `${label} switches`)
  return ids
}

test('D51-02 Set model on a 52-port switch: What changes, Apply, the face is two banks, History lists it, a hand-typed speed is kept; off in a plan', async ({
  page,
  request,
}) => {
  const name = unique('SM-A')
  const ids = await recordSwitches(request, 'SM', [{ name, ports: 52 }])
  const model = await createModel(request, modelInput(unique('C9300-48P')))
  const ports = await installedPorts(request, ids[name])
  expect(ports).toHaveLength(52)
  // A hand-typed speed, and a port renamed by hand.
  await fixes(request, [
    { kind: 'endpoints', id: ports[0].id, details: { speed: '100M' } },
    { kind: 'endpoints', id: ports[1].id, name: 'Gi0/2' },
  ])

  await page.goto('/')
  await fitted(page)
  await openEquipmentPage(page, name)
  await expect(group(page, 1)).toHaveCount(1)
  await expect(group(page, 2)).toHaveCount(0)
  await chooseMore(page, 'Set model…')
  const box = dialog(page)
  await expect(box).toBeVisible()
  await expect(box.getByLabel('Model')).toBeFocused()
  // Only models that fit are offered; Apply waits for a choice.
  await expect(box.getByRole('button', { name: 'Apply' })).toBeDisabled()
  await box.getByLabel('Model').selectOption(model.id)
  const changes = box.getByTestId('set-model-changes')
  await expect(changes.getByTestId('set-model-section')).toHaveText([
    /Details/,
    /Port names/,
    /Type, connector and speed/,
    /Groups/,
    /Left as typed/,
  ])
  await expect(changes).toContainText(`Model: empty → ${model.name}`)
  await expect(changes).toContainText('… and 48 more')
  await expect(changes).toContainText('Port 1: copper · RJ45')
  await expect(changes.locator('[data-section="kept"]')).toContainText(
    'speed is 100M',
  )
  await expect(changes.locator('[data-section="kept"]')).toContainText(
    'Gi0/2 is not renamed',
  )
  const sent: Request[] = []
  page.on('request', (r) => isFixes(r) && sent.push(r))
  await box.getByRole('button', { name: 'Apply' }).click()
  await expect(box).toHaveCount(0)
  expect(sent).toHaveLength(1)
  const body = JSON.parse(sent[0].postData() ?? '{}')
  expect(body.note).toBe(`Set model ${model.name}`)

  // The face is now two banks, and History lists the change with the note.
  await expect(group(page, 1)).toHaveCount(2)
  await expect(group(page, 2)).toHaveCount(1)
  await chooseMore(page, 'History')
  await expect(page.getByTestId('history-fixes')).toContainText('Model')
  await expect(page.getByTestId('history-fixes')).toContainText(model.name)
  await expect(page.getByTestId('history-fixes')).toContainText(
    `Set model ${model.name}`,
  )

  const after = await installedPorts(request, ids[name])
  expect(after[0].speed).toBe('100M') // typed by hand, kept
  expect(after[1].label).toBe('Gi0/2') // renamed by hand, kept
  expect(after[2].label).toBe('Gi1/0/3')
  expect(after[48].label).toBe('Te1/1/1')
  expect(after[0].portGroup).toBe(1)
  expect(after[51].portGroup).toBe(2)
  const portLog = await changeLog(request, 'endpoint', after[51].id)
  expect(portLog.map((c) => c.field)).toContain('portGroup')

  // In a plan Set model is off, and says where it works.
  const plan = await newPlan(request, unique('Set model off'))
  await page.goto(`/?plan=${plan}`)
  await fitted(page)
  await openEquipmentPage(page, name)
  await page.getByRole('button', { name: 'More actions' }).click()
  const item = page.getByRole('menuitem', { name: /Set model…/ })
  await expect(item).toBeDisabled()
  await expect(item).toContainText('Set model in Installed')
})

test('D51-03 Set model from the Inventory: two switches selected, the one with another port count is listed as skipped', async ({
  page,
  request,
}) => {
  const a = unique('SM-I')
  const b = unique('SM-J')
  const ids = await recordSwitches(request, 'SI', [
    { name: a, ports: 52 },
    { name: b, ports: 24 },
  ])
  const model = await createModel(request, modelInput(unique('C9300-48P')))
  await page.goto('/')
  await fitted(page)
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  const table = page.getByRole('table')
  await page
    .getByRole('searchbox', { name: 'Filter for any field' })
    .fill('SM-')
  await table.getByLabel(`Select ${a}`, { exact: true }).check()
  await table.getByLabel(`Select ${b}`, { exact: true }).check()
  const bar = page.getByRole('toolbar', { name: 'Commands' })
  await bar.getByRole('button', { name: 'Set model…' }).click()
  const box = dialog(page)
  await expect(box).toContainText('Set model of 2 switches')
  await box.getByLabel('Model').selectOption(model.id)
  const skipped = box.getByTestId('set-model-skipped')
  await expect(skipped).toContainText(b)
  await expect(skipped).toContainText('24 ports')
  await expect(skipped).not.toContainText(a)
  const sent: Request[] = []
  page.on('request', (r) => isFixes(r) && sent.push(r))
  await box.getByRole('button', { name: 'Apply' }).click()
  await expect(box).toHaveCount(0)
  expect(sent).toHaveLength(1)
  const snapshot = await (
    await request.get('/api/topology?context=installed')
  ).json()
  const by = (id: string) =>
    snapshot.equipment.find((e: { id: string }) => e.id === id)
  expect(by(ids[a]).model).toBe(model.name)
  expect(by(ids[b]).model ?? '').toBe('')
  expect((await installedPorts(request, ids[b]))[0].label).toBe('Port 1')

  // In a plan the command is off.
  const plan = await newPlan(request, unique('Inventory plan'))
  await page.goto(`/?plan=${plan}`)
  await fitted(page)
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await page
    .getByRole('table')
    .getByLabel(`Select ${a}`, { exact: true })
    .check()
  const off = page
    .getByRole('toolbar', { name: 'Commands' })
    .getByRole('button', { name: 'Set model…' })
  await expect(off).toBeDisabled()
  await expect(off).toHaveAttribute('title', 'Set model in Installed')
})

test('D51-01 renaming a model offers to update the switches that say its old name; in a plan only the words', async ({
  page,
  request,
}) => {
  const a = unique('SM-R')
  const b = unique('SM-S')
  const c = unique('SM-T')
  const ids = await recordSwitches(request, 'SR', [
    { name: a, ports: 4 },
    { name: b, ports: 4 },
    { name: c, ports: 4 },
  ])
  const old = unique('C9300-48P')
  const model = await createModel(request, modelInput(old))
  await fixes(request, [
    { kind: 'equipment', id: ids[a], details: { model: old } },
    {
      kind: 'equipment',
      id: ids[b],
      details: { model: ` ${old.toLowerCase()} ` },
    },
    { kind: 'equipment', id: ids[c], details: { model: 'Other 9300' } },
  ])

  // Installed: the Set model dialog's Manage models… link opens the page.
  await page.goto('/')
  await fitted(page)
  await openEquipmentPage(page, a)
  await chooseMore(page, 'Set model…')
  await dialog(page).getByRole('button', { name: 'Manage models…' }).click()
  const root = page.getByTestId('models-page')
  await expect(root).toBeVisible()
  await expect(root).not.toContainText('Models are shared')
  await root.getByTestId('model-item').filter({ hasText: old }).click()
  const renamed = unique('C9300-48P-R')
  const form = page.getByRole('form', { name: 'Model editor' })
  await form.getByLabel('Model name').fill(renamed)
  await form.getByRole('button', { name: 'Save model' }).click()
  const offer = root.getByTestId('rename-offer')
  await expect(offer).toContainText(
    `2 switches say ${old}. Update their Model detail too?`,
  )
  const sent: Request[] = []
  page.on('request', (r) => isFixes(r) && sent.push(r))
  await offer.getByRole('button', { name: 'Update' }).click()
  await expect(offer).toHaveCount(0)
  expect(sent).toHaveLength(1)
  const body = JSON.parse(sent[0].postData() ?? '{}')
  expect(body.note).toBe(`Model renamed to ${renamed}`)
  expect(body.fixes).toHaveLength(2)
  for (const id of [ids[a], ids[b]]) {
    const log = await changeLog(request, 'equipment', id)
    expect(log.find((l) => l.field === 'model')).toMatchObject({
      newValue: renamed,
      note: `Model renamed to ${renamed}`,
    })
  }
  const snapshot = await (
    await request.get('/api/topology?context=installed')
  ).json()
  expect(
    snapshot.equipment.find((e: { id: string }) => e.id === ids[c]).model,
  ).toBe('Other 9300')
  expect(model.id).toBeTruthy()

  // In a plan: the same line, no button.
  const plan = await newPlan(request, unique('Rename in plan'))
  await fixes(request, [
    { kind: 'equipment', id: ids[c], details: { model: renamed } },
  ])
  await openModelsFromPlan(page, plan)
  await expect(page.getByTestId('models-page')).toContainText(
    'Models are shared; they are not part of the plan',
  )
  await page.getByTestId('model-item').filter({ hasText: renamed }).click()
  const again = unique('C9300-48P-Q')
  await page
    .getByRole('form', { name: 'Model editor' })
    .getByLabel('Model name')
    .fill(again)
  await page
    .getByRole('form', { name: 'Model editor' })
    .getByRole('button', { name: 'Save model' })
    .click()
  const planOffer = page.getByTestId('rename-offer')
  await expect(planOffer).toContainText('3 switches say')
  await expect(planOffer).toContainText('Update them from Installed')
  await expect(planOffer.getByRole('button', { name: 'Update' })).toHaveCount(0)
})
