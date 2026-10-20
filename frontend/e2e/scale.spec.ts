import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { settledViewport } from './helpers'

// SC-02 / CM-12, opt-in: `SCALE=1 npx playwright test -c playwright.scale.config.ts`.
// Runs against the generated campus (backend/internal/scalefixture) and records
// how long each step takes. Timings are measurements, not assertions; only
// "the page froze" (a step that never settles) fails.
test.skip(!process.env.SCALE, 'scale run: set SCALE=1')

const out = 'test-results-scale/'
const timings: [string, number][] = []
async function timed<T>(name: string, step: () => Promise<T>): Promise<T> {
  const start = Date.now()
  const result = await step()
  timings.push([name, Date.now() - start])
  return result
}

const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name), { timeout: 30_000 }).toBe(value)
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${out}${name}.png` })

test.afterAll(async () => {
  await mkdir(out, { recursive: true })
  const lines = timings.map(([n, ms]) => `${String(ms).padStart(7)} ms  ${n}`)
  await writeFile(`${out}timings.txt`, lines.join('\n') + '\n')
  console.log('\nSC-02 / CM-12 timings\n' + lines.join('\n'))
})

test('SC-02 / CM-12 the campus at realistic size', async ({ page }) => {
  await mkdir(out, { recursive: true })

  const snapshot = await timed(
    'topology load (GET /api/topology)',
    async () => {
      const response = await page.request.get('/api/topology?context=installed')
      const body = await response.json()
      return body
    },
  )
  expect(snapshot.racks.length).toBeGreaterThan(280)

  const overview = page.locator('[data-view="overview"]')
  const focus = page.locator('[data-view="focus"]')
  const scale = (page: Page) =>
    page
      .locator('.react-flow__viewport')
      .getAttribute('style')
      .then((v) => Number(/scale\(([\d.]+)\)/.exec(v ?? '')?.[1]))

  await timed('first map render (overview fitted)', async () => {
    await page.goto('/')
    await expect(overview).toHaveAttribute('data-fitted', 'true', {
      timeout: 60_000,
    })
  })
  timings.push([`  (overview fit zoom: ${(await scale(page)).toFixed(2)})`, 0])
  await page.waitForTimeout(1500)
  await shot(page, '0-campus-overview')

  // The busiest node: the one with the most equipment.
  const nodeOfRack = new Map<string, string>(
    snapshot.racks.map((r: { id: string; nodeId: string }) => [r.id, r.nodeId]),
  )
  const perNode = new Map<string, number>()
  for (const e of snapshot.equipment as { rackId?: string }[]) {
    const node = e.rackId && nodeOfRack.get(e.rackId)
    if (node) perNode.set(node, (perNode.get(node) ?? 0) + 1)
  }
  const [busiest, busiestCount] = [...perNode].sort((a, b) => b[1] - a[1])[0]
  await timed('open a node card (~40 racks)', async () => {
    const card = page.locator(`[data-node-id="${busiest}"]`)
    await card.locator('.overview-card-head').click()
    await expect(card.locator('.overview-row').first()).toBeVisible({
      timeout: 30_000,
    })
  })
  timings.push([
    `  (node ${busiest}: ${busiestCount} equipment, ${await page
      .locator(`[data-node-id="${busiest}"] .overview-rack`)
      .count()} racks, ${await page
      .locator(`[data-node-id="${busiest}"] .overview-row`)
      .count()} rows)`,
    0,
  ])
  await page.waitForTimeout(1000)
  await shot(page, '0-campus-overview-open-card')

  await timed('Focus opens on an access switch', async () => {
    await page
      .getByRole('button', { name: 'Open explorer', exact: true })
      .click()
    const search = page.getByLabel('Find equipment')
    await search.fill('ACC-B17')
    await search.press('Enter')
    await expect(focus.locator('[data-equipment-id]').first()).toBeVisible({
      timeout: 60_000,
    })
    await settledViewport(page)
  })
  const focusCards = () =>
    focus.locator('[data-equipment-id]:not([data-side="center"])').count()
  const neighbours = await focusCards()
  const groups = await focus.locator('.focus-group').count()
  timings.push([
    `  (Focus: ${neighbours} neighbour cards, grouped: ${groups > 0 ? `yes, ${groups} groups` : 'no'})`,
    0,
  ])
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const explorer = page.getByRole('button', {
    name: 'Close Explore infrastructure',
  })
  if (await explorer.count()) await explorer.click()
  await expect(page.locator('.studio-drawer')).toHaveCount(0)
  await page.waitForTimeout(1000)
  await shot(page, '0-campus-focus')

  await timed('+1 hop', async () => {
    await page.getByRole('button', { name: '+1 hop' }).click()
    await expect(focus).toHaveAttribute('data-hops', '2')
    await expect
      .poll(
        async () =>
          (await focusCards()) > neighbours ||
          (await page.locator('.focus-nothing').count()) > 0,
        { timeout: 60_000 },
      )
      .toBe(true)
    await settledViewport(page)
  })
  timings.push([
    `  (Focus at 2 hops: ${await focusCards()} neighbour cards)`,
    0,
  ])
  await shot(page, '0-campus-focus-2-hops')
  // How many lines end at one card (its via rows), at 2 and then 3 hops: info, not an assertion.
  const mostRows = () =>
    focus.evaluate((root) =>
      Math.max(
        0,
        ...[
          ...root.querySelectorAll('[data-equipment-id], [data-group-node]'),
        ].map((c) => c.querySelectorAll('[data-line]').length),
      ),
    )
  timings.push([
    `  (Focus at 2 hops: most via rows on one card: ${await mostRows()})`,
    0,
  ])
  await page.getByRole('button', { name: '+1 hop' }).click()
  await expect(focus).toHaveAttribute('data-hops', '3')
  await settledViewport(page)
  timings.push([
    `  (Focus at 3 hops: ${await focusCards()} neighbour cards, most via rows on one card: ${await mostRows()})`,
    0,
  ])

  await timed('‹ Overview back', async () => {
    await page.getByRole('button', { name: '‹ Overview' }).click()
    await expect(overview).toHaveAttribute('data-fitted', 'true', {
      timeout: 60_000,
    })
  })

  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expect(root(page)).toBeVisible()

  await timed('open the campus site screen (~40 nodes, grid)', async () => {
    await page.getByRole('button', { name: 'Open Campus', exact: true }).click()
    await expectMark(page, 'data-physical-level', 'site')
    await expectMark(page, 'data-site-fitted', 'true')
    await expect(
      page.getByTestId('rf__node-node-main-distribution'),
    ).toBeVisible()
  })
  const cards = await page.locator('.react-flow__node').count()
  const pills = await page.locator('.site-pill').count()
  timings.push([
    `  (site screen: ${cards} node cards, ${pills} cable counts)`,
    0,
  ])
  const zoom = await page
    .locator('.react-flow__viewport')
    .getAttribute('style')
    .then((v) => Number(/scale\(([\d.]+)\)/.exec(v ?? '')?.[1]))
  timings.push([`  (site screen zoom: ${zoom.toFixed(2)})`, 0])
  expect(zoom).toBeGreaterThanOrEqual(0.59) // cards stay readable
  await shot(page, '1-campus-site')
  // Readable lines: every drawn line has a count, and cards do not overlap.
  const overlaps = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.react-flow__node')].map((n) =>
      n.getBoundingClientRect(),
    )
    let count = 0
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (
          a.left < b.right &&
          b.left < a.right &&
          a.top < b.bottom &&
          b.top < a.bottom
        )
          count++
      }
    return count
  })
  timings.push([`  (overlapping card pairs: ${overlaps})`, 0])
  expect(overlaps).toBe(0)

  await timed('node drag and its save', async () => {
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' && r.url().includes('/layout/nodes/'),
      { timeout: 30_000 },
    )
    const card = page.getByTestId('rf__node-node-building-01')
    const box = (await card.boundingBox())!
    await page.mouse.move(box.x + 24, box.y + 14)
    await page.mouse.down()
    await page.mouse.move(box.x + 24 + 40, box.y + 14 + 30, { steps: 12 })
    await page.mouse.up()
    expect((await saved).ok()).toBe(true)
  })

  await timed('open the node with ~40 racks', async () => {
    await page
      .getByRole('button', {
        name: 'Open racks of Main Distribution',
        exact: true,
      })
      .click()
    await expectMark(page, 'data-physical-level', 'node')
    await expect(page.getByTestId('rack-preview')).toHaveCount(40)
  })
  await shot(page, '2-node-40-racks')

  await timed('rack search in the 40-rack node', async () => {
    await page.getByLabel('Search racks').fill('AGG-30')
    await expect(page.getByTestId('rack-preview')).toHaveCount(1)
  })
  await page.getByLabel('Search racks').fill('')

  await timed('open a 42U rack', async () => {
    await page.getByRole('button', { name: 'Open MD-R03', exact: true }).click()
    await expectMark(page, 'data-physical-level', 'rack')
    await expect(page.locator('.rack-block').first()).toBeVisible()
  })
  await shot(page, '3-rack-42u')

  // A 32-row HDF page, reached through the Sites breadcrumb.
  await timed('open a 32-row HDF page', async () => {
    await page
      .getByRole('navigation', { name: 'Breadcrumbs' })
      .getByRole('button', { name: 'Campus', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Open racks of Sub-main 1', exact: true })
      .dispatchEvent('click') // the card may be outside the visible part of the canvas
    await page.getByRole('button', { name: 'Open SM1-R1', exact: true }).click()
    await page.locator('.rack-block[data-equipment-id="hdf-sm1"]').click()
    await expectMark(page, 'data-physical-level', 'equipment')
    await expect(
      page.locator('[data-testid="face-block"]').first(),
    ).toBeVisible()
  })
  expect(await mark(page, 'data-face-blocks')).not.toBe('')
  await shot(page, '4-hdf-32-rows')
  // The face scrolls inside its card (.hdf-scroll); the page does not.
  const scrolls = await page.evaluate(() => {
    const face = document.querySelector('.hdf-scroll')!
    return {
      inner: face.scrollHeight > face.clientHeight + 1,
      page: document.documentElement.scrollHeight > window.innerHeight + 1,
    }
  })
  timings.push([
    `  (HDF face scrolls inside: ${scrolls.inner}, page scrolls: ${scrolls.page})`,
    0,
  ])
  expect(scrolls.inner).toBe(true)
  expect(scrolls.page).toBe(false)

  // The trace drawer, a search in it, and the trace itself on the full map.
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  // The pickers' lists are built when the browser is idle; give it a moment, as a user would.
  await page.waitForTimeout(4000)
  await timed('Trace drawer opens (picker visible)', async () => {
    await page.getByRole('button', { name: 'Open trace tools' }).click()
    await expect(page.getByRole('combobox', { name: 'Start' })).toBeVisible({
      timeout: 30_000,
    })
  })
  await timed('picker search answers ("acc-b17")', async () => {
    const start = page.getByRole('combobox', { name: 'Start' })
    await start.fill('acc-b17')
    await expect(
      page
        .getByRole('listbox', { name: 'Start matches' })
        .getByRole('option')
        .first(),
    ).toBeVisible({
      timeout: 30_000,
    })
    await start.press('Escape')
  })
  await page.getByRole('combobox', { name: 'Start' }).blur()
  const find = page.getByRole('button', { name: 'Find AGG / BB', exact: true })
  const clicked = Date.now()
  const response = page.waitForResponse(
    (r) => r.url().includes('/api/traces') && r.request().method() === 'POST',
    { timeout: 60_000 },
  )
  await find.click()
  await response
  timings.push(['trace response (server + network)', Date.now() - clicked])
  await expect(page.getByTestId('route-row').first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(
    page.locator('[data-view="overview"] [data-on-route="true"]').first(),
  ).toBeVisible({ timeout: 30_000 })
  timings.push(['Find AGG / BB, click to route drawn', Date.now() - clicked])
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await page.waitForTimeout(1000)
  await shot(page, '6-trace-on-campus-overview')

  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await timed('trail step (chip opens its endpoint)', async () => {
    const steps = page.getByTestId('trail-step')
    await expect(steps.first()).toBeVisible({ timeout: 30_000 })
    await steps.nth(1).click()
    await expectMark(page, 'data-route-step', '2')
  })

  await timed('Explore opens', async () => {
    if ((await page.locator('.studio-drawer.left').count()) === 0)
      await page
        .getByRole('button', { name: 'Open explorer', exact: true })
        .click()
    await expect(page.getByLabel('Find equipment')).toBeVisible()
  })
  await timed('Explore search for a cable ID', async () => {
    await page.getByLabel('Find equipment').fill('cable-04321')
    await expect(page.getByTestId('search-cable').first()).toBeVisible({
      timeout: 30_000,
    })
  })
  await shot(page, '5-explore-cable-search')
})

// INV-07: the Inventory at campus size. Each step runs from the user's action
// until the page's data-inventory-* marks show the result (no fixed sleeps).
test('INV-07 the inventory at campus size', async ({ page }) => {
  await mkdir(out, { recursive: true })
  const topology = await (
    await page.request.get('/api/topology?context=installed')
  ).json()
  const equipmentCount: number = topology.equipment.length
  const portCount: number = topology.endpoints.length
  timings.push([
    `INV-07 (campus: ${equipmentCount} equipment, ${portCount} ports)`,
    0,
  ])

  const inv = page.locator('[data-inventory-list]')
  const attr = (name: string) => inv.getAttribute(name)
  const waitFor = (name: string, expected: string) =>
    page.waitForFunction(
      ([n, e]) =>
        document.querySelector('[data-inventory-list]')?.getAttribute(n) === e,
      [name, expected],
      { polling: 'raf', timeout: 60_000 },
    )
  const waitChanged = (name: string, from: string) =>
    page.waitForFunction(
      ([n, f]) => {
        const v = document
          .querySelector('[data-inventory-list]')
          ?.getAttribute(n)
        return v != null && v !== f
      },
      [name, from],
      { polling: 'raf', timeout: 60_000 },
    )
  const drawn = () =>
    page.evaluate(() => ({
      shown: Number(
        document
          .querySelector('[data-inventory-list]')
          ?.getAttribute('data-inventory-shown'),
      ),
      rows: document.querySelectorAll('.inv-scroll tbody tr').length,
    }))
  const recordDrawn = async (label: string) => {
    const d = await drawn()
    timings.push([
      `  (${label}: ${d.shown} rows rendered, ${d.rows} <tr> in the body)`,
      0,
    ])
    expect(d.shown).toBeLessThan(100)
    expect(d.rows).toBeLessThan(100)
  }

  await page.goto('/')
  await expect(page.locator('[data-view="overview"]')).toHaveAttribute(
    'data-fitted',
    'true',
    { timeout: 60_000 },
  )

  await timed(
    'INV-07 open Inventory from Conceptual (Equipment drawn)',
    async () => {
      await page
        .getByRole('group', { name: 'View' })
        .getByRole('button', { name: 'Inventory', exact: true })
        .click()
      await waitFor('data-inventory-total', String(equipmentCount))
    },
  )
  await recordDrawn('Equipment list')

  await timed('INV-07 open Ports and positions', async () => {
    await page
      .getByRole('navigation', { name: 'Inventory lists' })
      .getByRole('button', { name: /^Ports and positions/ })
      .click()
    await waitFor('data-inventory-list', 'ports')
    await waitFor('data-inventory-total', String(portCount))
  })
  await recordDrawn('Ports list opened')
  await shot(page, 'inv-1-ports')

  // One node name whose ports run to a few hundred rows (a search reads the
  // hidden columns too, and the name may also match other nodes).
  const nodeOfRack = new Map<string, string>(
    topology.racks.map((r: { id: string; nodeId: string }) => [r.id, r.nodeId]),
  )
  const nodeOfEquipment = new Map<string, string>()
  for (const e of topology.equipment as { id: string; rackId?: string }[]) {
    const node = e.rackId && nodeOfRack.get(e.rackId)
    if (node) nodeOfEquipment.set(e.id, node)
  }
  const perNode = new Map<string, number>()
  for (const p of topology.endpoints as { equipmentId: string }[]) {
    const node = nodeOfEquipment.get(p.equipmentId)
    if (node) perNode.set(node, (perNode.get(node) ?? 0) + 1)
  }
  const nodeNames = new Map<string, string>(
    topology.nodes.map((n: { id: string; name: string }) => [n.id, n.name]),
  )
  const term = [...perNode]
    .filter(([, n]) => n >= 150 && n <= 600)
    .map(([id]) => nodeNames.get(id)!)
    .sort((a, b) => b.length - a.length)[0]
  expect(term, 'campus has a node with 150–600 ports').toBeTruthy()
  const search = page.getByLabel('Filter for any field')
  await search.pressSequentially(term, { delay: 20 })
  let found = 0
  await timed(
    `INV-07 search "${term}", last keystroke to result (includes the 150 ms debounce)`,
    async () => {
      await waitChanged('data-inventory-total', String(portCount))
      found = Number(await attr('data-inventory-total'))
    },
  )
  timings.push([`  (the search matched ${found} rows)`, 0])
  await search.fill('')
  await waitFor('data-inventory-total', String(portCount))

  await timed('INV-07 sort Ports by Speed', async () => {
    await page.getByRole('button', { name: /^Speed/ }).click()
    await waitFor('data-inventory-sort', 'speed:asc')
  })
  await timed('INV-07 flip the sort', async () => {
    await page.getByRole('button', { name: /^Speed/ }).click()
    await waitFor('data-inventory-sort', 'speed:desc')
  })
  await page.getByRole('button', { name: /^Port/ }).first().click() // sort by the first column again

  await timed('INV-07 Group by Node on Ports', async () => {
    await page.getByLabel('Group by').selectOption({ label: 'Node' })
    await waitFor('data-inventory-group', 'node')
    await page.locator('.inv-scroll tr.group-row').first().waitFor()
  })
  await recordDrawn('Ports grouped by Node')

  // Scroll the grouped list (every port is an item) from top to bottom.
  const box = page.locator('.inv-scroll')
  const firstDrawn = () =>
    page.evaluate(
      () =>
        document.querySelector('.inv-scroll tbody tr:not(.inv-spacer)')
          ?.textContent ?? '',
    )
  const height = await box.evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(height).toBeGreaterThan(10_000 * 34)
  const STEPS = 20
  const steps: number[] = []
  let mostShown = 0
  let mostRows = 0
  for (let i = 1; i <= STEPS; i++) {
    const before = await firstDrawn()
    const start = Date.now()
    await box.evaluate(
      (el, top) => (el.scrollTop = top),
      Math.round((height * i) / STEPS),
    )
    await page.waitForFunction(
      (b) =>
        (document.querySelector('.inv-scroll tbody tr:not(.inv-spacer)')
          ?.textContent ?? '') !== b,
      before,
      { polling: 'raf', timeout: 60_000 },
    )
    steps.push(Date.now() - start)
    const d = await drawn()
    mostShown = Math.max(mostShown, d.shown)
    mostRows = Math.max(mostRows, d.rows)
  }
  timings.push([
    `INV-07 scroll the grouped list top to bottom (${STEPS} steps, ${portCount} rows): total`,
    steps.reduce((a, b) => a + b, 0),
  ])
  timings.push([`INV-07 scroll step, slowest of ${STEPS}`, Math.max(...steps)])
  timings.push([
    `  (scroll steps: ${steps.join(' ')} ms; at most ${mostShown} rows rendered, ${mostRows} <tr> in the body)`,
    0,
  ])
  expect(mostShown).toBeLessThan(100)
  expect(mostRows).toBeLessThan(100)

  await page.getByLabel('Group by').selectOption({ label: 'No grouping' })
  await waitFor('data-inventory-group', '')

  let afterPill = 0
  await timed(
    'INV-07 Network pill applied on Ports (one network)',
    async () => {
      await page.getByRole('button', { name: /^Network == / }).click()
      const picker = page.getByRole('dialog', { name: 'Filter Network' })
      await picker.getByLabel('Select all').uncheck()
      await picker.getByRole('checkbox').nth(1).check()
      const start = Date.now()
      await picker.getByRole('button', { name: 'Apply' }).click()
      await waitChanged('data-inventory-total', String(portCount))
      timings.push([
        `INV-07   (Apply to result only: ${Date.now() - start} ms)`,
        0,
      ])
      afterPill = Number(await attr('data-inventory-total'))
    },
  )
  timings.push([`  (the pill left ${afterPill} rows)`, 0])
  expect(afterPill).toBeLessThan(portCount)

  await page.getByRole('button', { name: 'Export to CSV' }).click()
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await timed(
    'INV-07 Export to CSV, Download to the download event',
    async () => {
      await page.getByRole('button', { name: 'Download', exact: true }).click()
      await download
    },
  )
  await page.keyboard.press('Escape')
  await shot(page, 'inv-2-filtered-ports')
})

// INV-16: the lists and commands added to the Inventory, at campus size. The
// same rules as INV-07: from the user's action until the data-inventory-* marks
// (or the pane) show the result, no fixed sleeps, measurements and not budgets.
// Nothing is saved: the 500 direct fixes are measured in Go.
test('INV-16 the new lists and commands at campus size', async ({ page }) => {
  test.setTimeout(900_000)
  await mkdir(out, { recursive: true })
  const topology = await (
    await page.request.get('/api/topology?context=installed')
  ).json()
  const equipmentCount: number = topology.equipment.length
  const cableCount: number = topology.links.filter(
    (l: { kind: string }) => l.kind === 'cable',
  ).length
  timings.push([
    `INV-16 (campus: ${equipmentCount} equipment, ${topology.racks.length} racks, ${cableCount} cables)`,
    0,
  ])

  const inv = page.locator('[data-inventory-list]')
  const attr = (name: string) => inv.getAttribute(name)
  const raf = { polling: 'raf' as const, timeout: 120_000 }
  const waitFor = (name: string, expected: string) =>
    page.waitForFunction(
      ([n, e]) =>
        document.querySelector('[data-inventory-list]')?.getAttribute(n) === e,
      [name, expected],
      raf,
    )
  const waitChanged = (name: string, from: string) =>
    page.waitForFunction(
      ([n, f]) => {
        const v = document
          .querySelector('[data-inventory-list]')
          ?.getAttribute(n)
        return v != null && v !== f
      },
      [name, from],
      raf,
    )
  const lists = page.getByRole('navigation', { name: 'Inventory lists' })
  const chooseList = (name: RegExp) =>
    lists.getByRole('button', { name }).click()
  const drawn = () =>
    page.evaluate(() => ({
      shown: Number(
        document
          .querySelector('[data-inventory-list]')
          ?.getAttribute('data-inventory-shown'),
      ),
      rows: document.querySelectorAll('.inv-scroll tbody tr').length,
    }))
  const recordDrawn = async (label: string) => {
    const d = await drawn()
    timings.push([
      `  (${label}: ${d.shown} rows rendered, ${d.rows} <tr> in the body)`,
      0,
    ])
    expect(d.shown).toBeLessThan(100)
    expect(d.rows).toBeLessThan(100)
  }

  await page.goto('/')
  await expect(page.locator('[data-view="overview"]')).toHaveAttribute(
    'data-fitted',
    'true',
    { timeout: 60_000 },
  )
  await timed(
    'INV-16 open Inventory from Conceptual (Equipment drawn)',
    async () => {
      await page
        .getByRole('group', { name: 'View' })
        .getByRole('button', { name: 'Inventory', exact: true })
        .click()
      await waitFor('data-inventory-total', String(equipmentCount))
    },
  )

  // Building Racks and Problems, read apart from the page: the same modules
  // the page calls, on the same snapshot, in the page's own JavaScript.
  const build = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const [index, racks, problems] = await Promise.all([
      load('/src/features/map/snapshotIndex.ts'),
      load('/src/features/inventory/racks.ts'),
      load('/src/features/inventory/problems.ts'),
    ])
    const snapshot = await (
      await fetch('/api/topology?context=installed')
    ).json()
    const ids = new Set<string>(
      snapshot.equipment.map((e: { id: string }) => e.id),
    )
    const time = <T>(f: () => T): [number, T] => {
      const start = performance.now()
      const result = f()
      return [Math.round((performance.now() - start) * 10) / 10, result]
    }
    const [indexMs, built] = time(() => index.indexSnapshot(snapshot))
    const [racksMs, rackRows] = time(() => racks.buildRackRows(snapshot, built))
    const [problemsMs, problemRows] = time(() =>
      problems.buildProblems(snapshot, built, ids),
    )
    const [racksWarm] = time(() => racks.buildRackRows(snapshot, built))
    const [problemsWarm] = time(() =>
      problems.buildProblems(snapshot, built, ids),
    )
    return {
      indexMs,
      racksMs,
      problemsMs,
      racksWarm,
      problemsWarm,
      racks: rackRows.length as number,
      problems: problemRows.length as number,
    }
  })
  timings.push([
    'INV-16 build Racks (buildRackRows), first call',
    build.racksMs,
  ])
  timings.push(['INV-16 build Racks, second call', build.racksWarm])
  timings.push([
    'INV-16 build Problems (buildProblems), first call',
    build.problemsMs,
  ])
  timings.push(['INV-16 build Problems, second call', build.problemsWarm])
  timings.push([
    `  (for scale: indexSnapshot of the campus ${build.indexMs} ms; the build lines are in ms to one decimal; ${build.racks} rack rows, ${build.problems} problems; dev build, no StrictMode here)`,
    0,
  ])

  const problemCount = Number(
    (
      await lists
        .getByRole('button', { name: /^Problems/ })
        .locator('.count')
        .innerText()
    ).replace(/,/g, ''),
  )
  expect(problemCount).toBe(build.problems)

  await timed('INV-16 open Racks (list drawn)', async () => {
    await chooseList(/^Racks/)
    await waitFor('data-inventory-list', 'racks')
    await waitFor('data-inventory-total', String(topology.racks.length))
    await page
      .locator('.inv-scroll tbody tr:not(.inv-spacer)')
      .first()
      .waitFor()
  })
  await recordDrawn(`Racks list: ${topology.racks.length} rows in the list`)
  await shot(page, 'inv16-1-racks')

  await timed('INV-16 open Problems (list drawn)', async () => {
    await chooseList(/^Problems/)
    await waitFor('data-inventory-list', 'problems')
    await waitFor('data-inventory-total', String(problemCount))
    if (problemCount > 0)
      await page
        .locator('.inv-scroll tbody tr:not(.inv-spacer)')
        .first()
        .waitFor()
  })
  await recordDrawn(`Problems list: ${problemCount} rows in the list`)
  await shot(page, 'inv16-2-problems')

  await chooseList(/^Ports and positions/)
  await waitFor('data-inventory-list', 'ports')
  await timed('INV-16 Group by Node on Ports, group counts shown', async () => {
    await page.getByLabel('Group by').selectOption({ label: 'Node' })
    await waitFor('data-inventory-group', 'node')
    await page.locator('.inv-scroll tr.group-row .inv-use').first().waitFor()
  })
  timings.push([
    `  (first group row says: ${await page.locator('.inv-scroll tr.group-row').first().innerText()})`,
    0,
  ])
  await recordDrawn('Ports grouped by Node')
  await shot(page, 'inv16-3-ports-grouped')
  await page.getByLabel('Group by').selectOption({ label: 'No grouping' })
  await waitFor('data-inventory-group', '')

  // Equipment with the Missing pill: one value.
  await chooseList(/^Equipment/)
  await waitFor('data-inventory-list', 'equipment')
  await waitFor('data-inventory-total', String(equipmentCount))
  await page.getByRole('button', { name: /^Missing == / }).click()
  const picker = page.getByRole('dialog', { name: 'Filter Missing' })
  await picker.getByLabel('Select all').uncheck()
  await picker.getByLabel('IP address', { exact: true }).check()
  let missing = 0
  await timed(
    'INV-16 Missing pill, one value (IP address): Apply to result',
    async () => {
      await picker.getByRole('button', { name: 'Apply' }).click()
      await waitChanged('data-inventory-total', String(equipmentCount))
      missing = Number(await attr('data-inventory-total'))
    },
  )
  timings.push([
    `  (the Missing pill left ${missing} of ${equipmentCount} rows)`,
    0,
  ])
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await waitFor('data-inventory-total', String(equipmentCount))

  // Select the first 500 equipment rows (through the session, as a click on
  // 500 boxes would), open Edit details…, set a model, time What changes.
  const ids = (topology.equipment as { id: string }[])
    .slice(0, 500)
    .map((e) => e.id)
  await page.evaluate(async (keys) => {
    const m = await import(
      /* @vite-ignore */ '/src/features/inventory/inventorySession.ts'
    )
    m.inventorySession.setSelected(keys, true)
  }, ids)
  await page.getByText('500 selected.').waitFor()
  const edit = page.getByRole('button', { name: 'Edit details…' })
  await timed('INV-16 open Edit details… with 500 rows selected', async () => {
    await edit.click()
    await page
      .getByRole('dialog', { name: 'Edit details of 500 equipment' })
      .waitFor()
  })
  const pane = page.getByRole('dialog', {
    name: 'Edit details of 500 equipment',
  })
  await timed(
    'INV-16 set a model: What changes updated (500 rows)',
    async () => {
      await pane.getByLabel('Model', { exact: true }).fill('C9500-SCALE')
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="what-changes"]')
            ?.textContent?.includes('500') ?? false,
        undefined,
        raf,
      )
    },
  )
  timings.push([
    `  (What changes: ${(await pane.getByTestId('what-changes').innerText()).replace(/\s+/g, ' ')}; Save is not pressed)`,
    0,
  ])
  await shot(page, 'inv16-4-edit-500')
  await pane.getByRole('button', { name: 'Cancel' }).click()
  await page.evaluate(async (keys) => {
    const m = await import(
      /* @vite-ignore */ '/src/features/inventory/inventorySession.ts'
    )
    m.inventorySession.setSelected(keys, false)
  }, ids)

  // Print labels… with Listed on Cables.
  await chooseList(/^Cables/)
  await waitFor('data-inventory-list', 'cables')
  await waitFor('data-inventory-total', String(cableCount))
  const labels = page.getByRole('dialog', { name: 'Print cable labels' })
  await timed(
    'INV-16 Print labels… (Listed): click to the preview',
    async () => {
      await page.getByRole('button', { name: 'Print labels…' }).click()
      await expect(labels.locator('.inv-label')).toHaveCount(16, {
        timeout: 120_000,
      })
    },
  )
  const pagesText = (
    await labels.getByText(/labels a page:/).innerText()
  ).replace(/\s+/g, ' ')
  timings.push([`  (${pagesText}; ${cableCount} cables listed)`, 0])
  await shot(page, 'inv16-5-labels')
  const download = page.waitForEvent('download', { timeout: 840_000 })
  await timed('INV-16 labels: Download PDF to the download event', async () => {
    await labels.getByRole('button', { name: 'Download PDF' }).click()
    await download
  })
  await labels.getByRole('button', { name: 'Close' }).first().click()

  // The Work list is for a plan: measure it only if the campus setup has one.
  const plans = await (await page.request.get('/api/plans')).json()
  if (Array.isArray(plans) && plans.length > 0) {
    timings.push([`INV-16 Work list: ${plans.length} draft(s) found`, 0])
  } else {
    timings.push([
      'INV-16 Work list: not measured (the campus setup has no draft)',
      0,
    ])
  }
})
