import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

// SC-02, opt-in: `SCALE=1 npx playwright test -c playwright.scale.config.ts`.
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
  console.log('\nSC-02 timings\n' + lines.join('\n'))
})

test('SC-02 the campus at realistic size', async ({ page }) => {
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

  await timed('first map render (cards drawn and fitted)', async () => {
    await page.goto('/')
    await expect(
      page.locator('.react-flow__node-equipment').first(),
    ).toBeVisible({ timeout: 60_000 })
    await expect
      .poll(() => page.locator('.react-flow__viewport').getAttribute('style'), {
        timeout: 60_000,
      })
      .not.toBe('transform: translate(0px, 0px) scale(1);')
  })
  // LY-05: the first fit is readable (zoom 0.5 or more) and shows the top-left of the map.
  const mapZoom = await page
    .locator('.react-flow__viewport')
    .getAttribute('style')
    .then((v) => Number(/scale\(([\d.]+)\)/.exec(v ?? '')?.[1]))
  timings.push([`  (first map fit zoom: ${mapZoom.toFixed(2)})`, 0])
  expect(mapZoom).toBeGreaterThanOrEqual(0.49)
  await page.waitForTimeout(1500)
  await shot(page, '0-campus-conceptual-map')

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
  await expect
    .poll(
      () =>
        page
          .locator('.flow-surface')
          .getAttribute('data-route-cards')
          .then((v) => (v ?? '').length > 0),
      { timeout: 30_000 },
    )
    .toBe(true)
  timings.push(['Find AGG / BB, click to route drawn', Date.now() - clicked])
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await page.waitForTimeout(1000)
  await shot(page, '6-trace-on-campus-map')

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
