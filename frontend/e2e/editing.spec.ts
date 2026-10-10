import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'

// The explorer writes its state on its root; these specs assert that model.
const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)
const block = (page: Page, id: string) =>
  page.locator(`.rack-block[data-equipment-id="${id}"]`)
const confirm = (page: Page, name: string) =>
  page.getByRole('group', { name, exact: true })

/** A fresh draft, so edits never leak into the shared Expansion plan other specs read. */
async function newPlan(request: APIRequestContext, name: string) {
  const response = await request.post('/api/plans', {
    data: { name, expectedBaseRevision: 'acceptance-1' },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}
const getPlan = async (request: APIRequestContext, id: string) =>
  (await request.get(`/api/plans/${id}`)).json()
/** The save toast lingers for several seconds, so wait on the draft's own revision. */
const expectRevision = (
  request: APIRequestContext,
  id: string,
  revision: string,
) =>
  expect.poll(async () => (await getPlan(request, id)).revision).toBe(revision)

async function openPlan(page: Page, id: string) {
  await page.goto(`/?plan=${id}`)
  await fitted(page)
}
/** Select a card on the map, which opens the inspector on it. */
async function inspect(page: Page, card: string) {
  await page.getByTestId(`rf__node-${card}`).click()
  await expect(page.locator('.inspector-header h2')).toHaveText(
    card.toUpperCase(),
  )
}
async function toSites(page: Page) {
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  const sites = page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('button', { name: 'Sites', exact: true })
  if (await sites.count()) await sites.click()
  await expectMark(page, 'data-physical-level', 'sites')
}

test('ED-08 deleting PANEL-A: the confirm lists what goes and the three circuits it cuts; the plan removes it, Installed keeps it', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'ED-08 delete')
  await openPlan(page, id)
  await inspect(page, 'panel-a')
  await page.getByRole('button', { name: 'Delete PANEL-A…' }).click()
  const dialog = confirm(page, 'Confirm delete')
  await expect(dialog).toBeFocused()
  await expect(dialog).toContainText(
    'Removes PANEL-A, its 48 positions and their front/rear bridges and 6 cables (cable-a01, cable-a02, cable-a05, cable-a06, cable-a09, cable-a10).',
  )
  await expect(dialog).toContainText('Cuts 3 circuits:')
  await expect(dialog.getByTestId('cut-circuits').locator('li')).toHaveText([
    'EDGE-17 port 1 → AGG-03 port 1',
    'EDGE-17 port 2 → AGG-08 port 1',
    'EDGE-17 port 3 → BB-01 port 1',
  ])
  await expect(dialog).toContainText(
    'Installed is unchanged until the plan is recorded.',
  )
  await dialog.getByRole('button', { name: 'Delete in plan' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
  await expect(dialog).toHaveCount(0)
  expect((await getPlan(request, id)).removals.equipment).toEqual(['panel-a'])
  const installed = await (
    await request.get('/api/topology?context=installed')
  ).json()
  expect(installed.equipment.map((e: { id: string }) => e.id)).toContain(
    'panel-a',
  )
})

test('ED-08 deleting proposed equipment says its addition is dropped; the equipment page has the same Delete…', async ({
  page,
}) => {
  await page.goto('/?plan=expansion')
  await fitted(page)
  await inspect(page, 'edge-18')
  await page.getByRole('button', { name: 'Delete EDGE-18…' }).click()
  const dialog = confirm(page, 'Confirm delete')
  await expect(dialog).toContainText(
    'EDGE-18 is only in this plan, so its addition is dropped, with its 1 port and 1 cable (planned-cable-18).',
  )
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)

  // The equipment page of EDGE-17 offers it too, with that switch's three circuits.
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await block(page, 'edge-17').click()
  await expectMark(page, 'data-physical-level', 'equipment')
  await page.getByRole('button', { name: 'Delete EDGE-17…' }).click()
  await expect(confirm(page, 'Confirm delete')).toContainText(
    'its 24 ports and 3 cables',
  )
  await expect(
    confirm(page, 'Confirm delete').getByTestId('cut-circuits').locator('li'),
  ).toHaveCount(3)
})

test('ED-09 disconnect from the inspector, connect and disconnect from the endpoint detail', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'ED-09 cables')
  await openPlan(page, id)
  // Inspector, Ports tab of AGG-03: Disconnect cable-a04 names the circuit it cuts.
  await inspect(page, 'agg-03')
  await page.getByRole('tab', { name: 'Ports' }).click()
  await page.getByRole('button', { name: /^Disconnect cable-a04/ }).click()
  const dialog = confirm(page, 'Confirm disconnect')
  await expect(dialog).toContainText('Disconnect cable-a04?')
  await expect(dialog).toContainText('Cuts EDGE-17 port 1 → AGG-03 port 1.')
  await dialog.getByRole('button', { name: 'Disconnect in plan' }).click()
  await expectRevision(request, id, '2')
  expect((await getPlan(request, id)).removals.links).toEqual(['cable-a04'])

  // Endpoint detail of the now free AGG-03 port 1: Connect… offers free far ends only.
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 01',
  )
  await block(page, 'agg-03').click()
  await page.locator('[data-endpoint-id="agg-03:p1"]').click()
  await expectMark(page, 'data-selected-endpoint', 'agg-03:p1')
  await page.getByRole('button', { name: 'Connect…' }).click()
  const connect = confirm(page, 'Connect')
  await expect(connect).toBeVisible()
  const far = connect.getByRole('combobox')
  await far.fill('agg-03')
  // A sibling port on the same equipment is never offered.
  await expect(page.getByRole('option', { name: /^AGG-03/ })).toHaveCount(0)
  await far.fill('hdf-02 2b/3 rear')
  await page.getByRole('option', { name: 'HDF-02 · 2B/3 rear' }).click()
  await connect.getByRole('button', { name: /^Connect to HDF-02/ }).click()
  await expectRevision(request, id, '3')
  const connected = await getPlan(request, id)
  expect(connected.links).toHaveLength(1)
  expect([connected.links[0].a, connected.links[0].b].sort()).toEqual([
    'agg-03:p1',
    'hdf-02:sp-2B:3:r',
  ])

  // The proposed cable can be disconnected again from the endpoint detail.
  await page.getByRole('button', { name: 'Disconnect…' }).click()
  const again = confirm(page, 'Confirm disconnect')
  await expect(again).toContainText(
    'only in this plan, so the proposed cable is dropped',
  )
  await again.getByRole('button', { name: 'Disconnect in plan' }).click()
  await expectRevision(request, id, '4')
  expect((await getPlan(request, id)).links).toEqual([])
})

test('ED-10 add a site, a node and a rack (dashed, PROPOSED), see the server refuse bad input, and delete empty containers', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'ED-10 containers')
  await openPlan(page, id)
  await toSites(page)
  await expectMark(page, 'data-can-edit', 'true')

  // The server's refusal shows in the form, in its own words.
  await page.getByTestId('add-site').click()
  const siteForm = page.getByTestId('site-form')
  await siteForm.getByLabel('Name').fill('main campus')
  await siteForm.getByRole('button', { name: 'Add site to plan' }).click()
  await expect(siteForm.getByTestId('edit-error')).toContainText(
    'already exists',
  )
  await siteForm.getByLabel('Name').fill('North Annex')
  await siteForm.getByRole('button', { name: 'Add site to plan' }).click()
  await expectRevision(request, id, '2')
  const plan = await getPlan(request, id)
  const siteId = plan.sites[0].id
  await expect(page.getByTestId('site-form')).toHaveCount(0)
  await expectMark(page, 'data-proposed-containers', siteId)
  const card = page.locator(
    `[data-testid="site-card"][data-site-id="${siteId}"]`,
  )
  await expect(card).toHaveAttribute('data-proposed', 'true')
  await expect(card).toContainText('PROPOSED')
  // The card's frame is its wrapper (the foot sits inside it).
  expect(
    await card.evaluate(
      (el) => getComputedStyle(el.parentElement!).borderStyle,
    ),
  ).toBe('dashed')

  // An empty proposed site can be dropped again; this one is kept for its node.
  await expect(page.getByTestId(`container-foot-${siteId}`)).toContainText(
    'Delete',
  )

  // Node on the site screen: it gets a place, can be dragged, and is PROPOSED.
  await card.click()
  await expectMark(page, 'data-physical-level', 'site')
  await page.getByTestId('add-node').click()
  await page.getByTestId('node-form').getByLabel('Name').fill('Hall')
  await page
    .getByTestId('node-form')
    .getByRole('button', { name: 'Add node to plan' })
    .click()
  await expectRevision(request, id, '3')
  const nodeId = (await getPlan(request, id)).nodes[0].id
  await expectMark(page, 'data-site-nodes', nodeId)
  const nodeCard = page.locator(
    `[data-testid="node-card"][data-node-id="${nodeId}"]`,
  )
  await expect(nodeCard).toHaveAttribute('data-proposed', 'true')
  await expect(nodeCard).toContainText('PROPOSED')
  const placed = await mark(page, 'data-node-positions')
  expect(placed).toContain(`${nodeId}:`)
  const box = (await nodeCard.boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, box.y + 140, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => mark(page, 'data-node-positions')).not.toBe(placed)

  // Rack on the node level; units are checked by the server.
  await nodeCard.getByRole('button', { name: 'Open racks of Hall' }).click()
  await expectMark(page, 'data-physical-level', 'node')
  await page.getByTestId('add-rack').click()
  const rackForm = page.getByTestId('rack-form')
  await expect(rackForm.getByLabel(/^Height/)).toHaveValue('42')
  await rackForm.getByLabel('Name').fill('R1')
  await rackForm.getByLabel(/^Height/).fill('61')
  await rackForm.getByRole('button', { name: 'Add rack to plan' }).click()
  await expect(rackForm.getByTestId('edit-error')).toContainText('1–60')
  await rackForm.getByLabel(/^Height/).fill('24')
  await rackForm.getByRole('button', { name: 'Add rack to plan' }).click()
  await expectRevision(request, id, '4')
  const rackId = (await getPlan(request, id)).racks[0].id
  const rack = page.locator(
    `[data-testid="rack-preview"][data-rack-id="${rackId}"]`,
  )
  await expect(rack).toHaveAttribute('data-proposed-rack', 'true')
  await expect(rack).toContainText('PROPOSED')
  await expect(rack).toContainText('0 equipment · 0 of 24U used')

  // Delete the empty proposed rack: its addition is dropped.
  await rack.getByRole('button', { name: 'Delete rack R1' }).click()
  await confirm(page, 'Confirm delete rack')
    .getByRole('button', { name: 'Drop from plan' })
    .click()
  await expectRevision(request, id, '5')
  await expect(rack).toHaveCount(0)
  expect((await getPlan(request, id)).racks ?? []).toEqual([])
})

test('ED-10 an installed empty rack can be deleted in a plan; a rack with equipment says it must be emptied first; Installed only shows a hint', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'ED-10 delete')
  // Installed: read-only, with one hint line and no controls.
  await page.goto('/')
  await fitted(page)
  await toSites(page)
  await expect(page.getByTestId('installed-hint')).toHaveText(
    'Installed is read-only. Open a plan to add a site, node or rack.',
  )
  await expect(page.getByTestId('add-site')).toHaveCount(0)
  await expectMark(page, 'data-can-edit', 'false')

  await openPlan(page, id)
  await toSites(page)
  await page.getByRole('button', { name: 'Open Annex', exact: true }).click()
  await page.getByRole('button', { name: 'Open racks of Annex Hall' }).click()
  await expectMark(page, 'data-physical-level', 'node')
  const empty = page.locator(
    '[data-testid="rack-preview"][data-rack-id="rack-t42"]',
  )
  await empty.getByRole('button', { name: 'Delete rack Rack T42' }).click()
  await confirm(page, 'Confirm delete rack')
    .getByRole('button', { name: 'Remove in plan' })
    .click()
  await expectRevision(request, id, '2')
  expect((await getPlan(request, id)).removals.racks).toEqual(['rack-t42'])

  // A rack that holds equipment cannot be deleted, and says why.
  await page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('button', { name: 'Sites' })
    .click()
  await page
    .getByRole('button', { name: 'Open Main Campus', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Open racks of Main Distribution' })
    .click()
  const full = page.locator(
    '[data-testid="rack-preview"][data-rack-id="rack-core-01"]',
  )
  await expect(full.getByTestId('not-empty-hint')).toHaveText(
    'Delete is available once it is empty',
  )
  await expect(full.getByRole('button', { name: /^Delete rack/ })).toHaveCount(
    0,
  )
})

test('ED-11 the HDF form adds a 4-row HDF in a rack, shows the server refusing a clash, and opens the new HDF in Physical', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'ED-11 hdf')
  await openPlan(page, id)
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add HDF…' }).click()
  const form = page.getByTestId('hdf-form')
  await form.getByLabel('Name').fill('HDF-NEW')
  await form.getByLabel(/^Rows/).fill('4')
  await form.getByLabel('Height (U)').fill('3')
  await form.locator('select').selectOption({ label: 'Rack SM01' })
  await expect(form).toContainText('96 positions per side')
  // U4–U6 are HDF-01's: the server says so and nothing is saved.
  await form.getByLabel('Lowest unit').fill('4')
  await form.getByRole('button', { name: 'Add HDF to plan' }).click()
  await expect(form.getByTestId('edit-error')).toHaveText(
    'U4–6 in Rack SM01 is taken by HDF-01',
  )
  expect((await getPlan(request, id)).revision).toBe('1')
  await form.getByLabel('Lowest unit').fill('8')
  await form.getByRole('button', { name: 'Add HDF to plan' }).click()
  await expectRevision(request, id, '2')

  const plan = await getPlan(request, id)
  expect(plan.equipment).toHaveLength(1)
  expect(plan.equipment[0]).toMatchObject({
    name: 'HDF-NEW',
    kind: 'hdf',
    rackId: 'rack-sm01',
    unit: 8,
    height: 3,
  })
  expect(plan.subpanels).toHaveLength(16)
  expect(plan.endpoints).toHaveLength(192)

  // Opened in Physical, on its own page; the rack shows it in U8–U10.
  const newId = plan.equipment[0].id
  await expectMark(page, 'data-physical-level', 'equipment')
  await expectMark(page, 'data-location', await mark(page, 'data-location'))
  await expect(root(page)).toHaveAttribute('data-face-kind', 'hdf')
  await expect(root(page)).toHaveAttribute(
    'data-face-blocks',
    ['1', '2', '3', '4']
      .flatMap((r) => ['A', 'B', 'C', 'D'].map((c) => `${r}${c}`))
      .join(' '),
  )
  await expect(root(page)).toHaveAttribute('data-selected-equipment', newId)
  // The library closes before the HDF opens, and the page marks it PROPOSED.
  await expect(page.getByRole('button', { name: 'Add HDF…' })).toHaveCount(0)
  await expect(page.getByTestId('proposed-tag')).toHaveText('PROPOSED')
  await page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('button', { name: 'Rack SM01' })
    .click()
  await expectMark(page, 'data-physical-level', 'rack')
  await expect.poll(() => mark(page, 'data-rack-equipment')).toContain(newId)
  await expect(block(page, newId)).toHaveAttribute('data-unit', '8')
  await expect(block(page, newId)).toHaveAttribute('data-proposed', 'true')
})

test('ED-11 without a plan the library offers the HDF item disabled, with a reason', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await expect(page.getByRole('button', { name: 'Add HDF…' })).toBeDisabled()
  await expect(page.getByTestId('hdf-disabled-hint')).toHaveText(
    'Open a plan to add an HDF.',
  )
})

test('ED-14 Escape closes each inline confirm and form, and focus returns to the button that opened it', async ({
  page,
}) => {
  await page.goto('/?plan=expansion')
  await fitted(page)

  // Inspector: Delete… confirm and a port's Disconnect confirm.
  await inspect(page, 'agg-03')
  const delete_ = page.getByRole('button', { name: 'Delete AGG-03…' })
  await delete_.click()
  await expect(confirm(page, 'Confirm delete')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm(page, 'Confirm delete')).toHaveCount(0)
  await expect(delete_).toBeFocused()

  await page.getByRole('tab', { name: 'Ports' }).click()
  const disconnect = page.getByRole('button', { name: /^Disconnect cable-a04/ })
  await disconnect.click()
  await expect(confirm(page, 'Confirm disconnect')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm(page, 'Confirm disconnect')).toHaveCount(0)
  await expect(disconnect).toBeFocused()

  // Physical: the sites form, a container's delete confirm, the endpoint's Connect….
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await toSites(page)
  const add = page.getByTestId('add-site')
  await add.click()
  await expect(page.getByTestId('site-form').getByLabel('Name')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('site-form')).toHaveCount(0)
  await expect(add).toBeFocused()

  await page.getByRole('button', { name: 'Open Annex', exact: true }).click()
  await page.getByRole('button', { name: 'Open racks of Annex Hall' }).click()
  const del = page.getByRole('button', { name: 'Delete rack Rack T42' })
  await del.click()
  await expect(confirm(page, 'Confirm delete rack')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm(page, 'Confirm delete rack')).toHaveCount(0)
  await expect(del).toBeFocused()

  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 02',
  )
  await block(page, 'agg-15').click()
  await page.locator('[data-endpoint-id="agg-15:p3"]').click()
  const connect = page.getByRole('button', { name: 'Connect…' })
  await connect.click()
  const box = confirm(page, 'Connect')
  const combo = box.getByRole('combobox')
  await expect(combo).toBeFocused()
  // The first Escape closes the open list, the second the connect box.
  await combo.fill('agg')
  await expect(box.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(box.getByRole('listbox')).toHaveCount(0)
  await expect(box).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)
  await expect(connect).toBeFocused()

  // The library's HDF form.
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  const hdf = page.getByRole('button', { name: 'Add HDF…' })
  await hdf.click()
  await expect(page.getByTestId('hdf-form').getByLabel('Name')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('hdf-form')).toHaveCount(0)
  await expect(hdf).toBeFocused()
})

test('a wide HDF face scrolls sideways, with a visible scrollbar, when the page is narrow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 })
  await page.goto('/')
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await block(page, 'hdf-01').click()
  await expectMark(page, 'data-physical-level', 'equipment')
  const scroller = page.locator('.hdf-scroll')
  const sizes = await scroller.evaluate((el) => ({
    wide: el.scrollWidth > el.clientWidth,
    // Playwright hides native scrollbars, so ask for the styled one.
    bar: getComputedStyle(el, '::-webkit-scrollbar').height,
  }))
  expect(sizes.wide).toBe(true)
  expect(sizes.bar).toBe('12px')
  await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  // Blocks C–D come into view: the last column's block is inside the visible box.
  const last = page.locator('[data-testid="face-block"][data-block="4D"]')
  await expect(last).toBeVisible()
  const inside = await last.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const area = el.closest('.hdf-scroll')!.getBoundingClientRect()
    return box.right <= area.right + 1 && box.left >= area.left
  })
  expect(inside).toBe(true)
})

test('ED-16 the library Add… form adds a patch panel, and answers a clash in names', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'ED-16 library')
  await openPlan(page, id)
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Patch panel…' }).click()
  const form = page.getByTestId('equipment-form')
  await expect(form.getByLabel('Network')).toHaveCount(0) // a panel has no network
  await form.getByLabel('Name').fill('PANEL-LIB')
  await form.getByLabel('Rack', { exact: true }).selectOption('rack-sm01')
  // U4–U6 are HDF-01's: the server says so, in names, and nothing is saved.
  await form.getByLabel('Unit', { exact: true }).fill('5')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(form.getByTestId('edit-error')).toHaveText(
    'U5 in Rack SM01 is taken by HDF-01',
  )
  expect((await getPlan(request, id)).revision).toBe('1')
  await form.getByLabel('Unit', { exact: true }).fill('8')
  await form.getByLabel('Positions').fill('12')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expectRevision(request, id, '2')
  const plan = await getPlan(request, id)
  expect(plan.equipment[0]).toMatchObject({
    name: 'PANEL-LIB',
    kind: 'panel',
    role: 'passive',
    rackId: 'rack-sm01',
    unit: 8,
  })
  expect(plan.endpoints).toHaveLength(24)
  // Escape closes the form and returns focus to its Add… button.
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Aggregation…' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('equipment-form')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Add Aggregation…' }),
  ).toBeFocused()
})
