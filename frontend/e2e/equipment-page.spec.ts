import { expect, test, type Page } from './fixtures'
import { fitted, openRackInPhysical } from './helpers'
import { command, newPlan, planWith32RowHdf } from './plan-api'

// Workbench part 2, task 1: the equipment page's bar, details line and ⋯ menu.
test.use({ viewport: { width: 1536, height: 864 } })

const root = (page: Page) => page.locator('.physical-explorer')
const bar = (page: Page) => page.getByTestId('equipment-bar')
const more = (page: Page) => page.getByRole('button', { name: 'More actions' })
const menu = (page: Page) => page.getByRole('menu')

async function openEquipment(
  page: Page,
  site: string,
  node: string,
  rack: string,
  id: string,
) {
  await openRackInPhysical(page, site, node, rack)
  await page.locator(`.rack-block[data-equipment-id="${id}"]`).click()
  await expect(root(page)).toHaveAttribute('data-physical-level', 'equipment')
}
const openHdf01 = (page: Page) =>
  openEquipment(page, 'Main Campus', 'North Sub-main', 'Rack SM01', 'hdf-01')
const openEdge17 = (page: Page) =>
  openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'edge-17')

/** The middle of a control, vertically. */
async function centreY(loc: ReturnType<Page['locator']>) {
  const box = await loc.boundingBox()
  expect(box).not.toBeNull()
  return box!.y + box!.height / 2
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('EP-01 one bar: Back, the breadcrumb and the controls on one line, no strip, no card header', async ({
  page,
}) => {
  await openHdf01(page)
  const controls = [
    page.getByRole('button', { name: 'Back', exact: true }),
    page.getByRole('navigation', { name: 'Breadcrumbs' }),
    page.getByRole('group', { name: 'Side' }),
    page.getByRole('group', { name: 'Numbers' }),
    page.getByRole('button', { name: 'Open in inventory' }),
    more(page),
  ]
  const ys = []
  for (const c of controls) {
    await expect(bar(page).locator(c)).toBeVisible()
    ys.push(Math.round(await centreY(c)))
  }
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(2)
  await expect(page.getByTestId('scope-note')).toHaveCount(0)
  await expect(page.getByTestId('rack-strip')).toHaveCount(0)
  await expect(page.locator('.face-head')).toHaveCount(0)
  const details = page.getByTestId('equipment-details')
  await expect(details).toContainText('HDF')
  await expect(details).toContainText('Main Campus')
  await expect(details).toContainText('North Sub-main')
  await expect(details).toContainText('Rack SM01')
})

test('EP-02 ‹ › step through the rack', async ({ page }) => {
  await openEdge17(page)
  // Rack A03 top to bottom: CM-A03, PANEL-A, EDGE-17, UPS-A03.
  const previous = page.getByRole('button', { name: 'Previous in this rack' })
  const next = page.getByRole('button', { name: 'Next in this rack' })
  await expect(previous).toHaveText(/PANEL-A/)
  await expect(next).toHaveText(/UPS-A03/)
  await next.click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /equipment:ups-a03$/,
  )
  // The last one has no next.
  await expect(next).toHaveCount(0)
  await expect(previous).toHaveText(/EDGE-17/)
  await previous.click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /equipment:edge-17$/,
  )
  await previous.click()
  await expect(root(page)).toHaveAttribute(
    'data-location',
    /equipment:panel-a$/,
  )
  await previous.click()
  await expect(root(page)).toHaveAttribute('data-location', /equipment:cm-a03$/)
  // The first one has no previous.
  await expect(previous).toHaveCount(0)
  await expect(next).toHaveText(/PANEL-A/)
})

test('EP-03 the ⋯ menu: Installed has History, a disabled Move, Print sheet and Show on map; a plan enables Move and adds Duplicate… and Delete…', async ({
  page,
  request,
}) => {
  await openEdge17(page)
  await expect(more(page)).toHaveAttribute('aria-haspopup', 'menu')
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  await more(page).click()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'History',
    /^Move to another rack…\s*Open a plan first$/,
    'Print sheet',
    'Show on map',
  ])
  await expect(
    menu(page).getByRole('menuitem', { name: /Move to another rack/ }),
  ).toBeDisabled()
  // Escape closes it with focus back on the button.
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  await expect(more(page)).toBeFocused()
  // Print sheet still produces the sheet.
  await more(page).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    menu(page).getByRole('menuitem', { name: 'Print sheet' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  await expect(menu(page)).toHaveCount(0)

  // In a plan: all four, and Delete… opens the same confirm.
  const id = await newPlan(request, 'EP-03 menu')
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openEdge17(page)
  await more(page).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'History',
    'Move to another rack…',
    'Print sheet',
    'Duplicate…',
    'Show on map',
    'Delete…',
  ])
  await menu(page).getByRole('menuitem', { name: 'Delete…' }).click()
  await expect(menu(page)).toHaveCount(0)
  const confirm = page.getByRole('group', { name: 'Confirm delete' })
  await expect(confirm).toContainText('its 24 ports and 3 cables')
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(more(page)).toBeFocused()
})

test('EP-04 the bar fits at 1280×720 with a long Hebrew name', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const id = await newPlan(request, 'EP-04 long name')
  await command(request, id, {
    type: 'add_hdf',
    hdf: {
      name: 'לוח-ניתוב-ראשי-בניין-שתים-עשרה-קומה-שלישית',
      rackId: 'rack-a03',
      unit: 3,
      height: 3,
      rows: 2,
    },
  })
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block', { hasText: 'לוח-ניתוב-ראשי' }).click()
  await expect(root(page)).toHaveAttribute('data-physical-level', 'equipment')
  const controls = [
    page.getByRole('group', { name: 'Side' }),
    page.getByRole('group', { name: 'Numbers' }),
    page.getByRole('button', { name: 'Open in inventory' }),
    more(page),
  ]
  const ys = []
  for (const c of controls) {
    await expect(c).toBeVisible()
    const box = (await c.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(1280)
    ys.push(Math.round(box.y + box.height / 2))
  }
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(2)
  // The bar is one line high.
  const barBox = (await bar(page).boundingBox())!
  expect(barBox.height).toBeLessThan(60)
  // The name of this page gives way last, and a Hebrew name is cut at its end, keeping its start.
  const name = await bar(page)
    .locator('[aria-current="page"] bdi')
    .evaluate((e) => ({
      shown: e.clientWidth / e.scrollWidth,
      direction: getComputedStyle(e).direction,
    }))
  expect(name.shown).toBeGreaterThanOrEqual(0.5)
  expect(name.direction).toBe('rtl')
  await page.screenshot({ path: 'test-results/workbench-2/hebrew-1280.png' })
})

test('EP-05 the face is right under the details line', async ({ page }) => {
  await openEdge17(page)
  const barBox = (await bar(page).boundingBox())!
  const faceBox = (await page
    .getByRole('region', { name: 'EDGE-17 face' })
    .boundingBox())!
  expect(faceBox.y - (barBox.y + barBox.height)).toBeLessThan(60)
})

const panel = (page: Page) => page.getByTestId('endpoint-detail')
const jack = (page: Page, id: string) =>
  page.locator(`[data-testid="face-endpoint"][data-endpoint-id="${id}"]`)
const faceCard = (page: Page, name: string) =>
  page.getByRole('region', { name: `${name} face` })
const cardOrigin = async (page: Page) => {
  const b = (await page.locator('.face-card').boundingBox())!
  return { x: b.x, y: b.y }
}

test('EP-06 (D50) the port panel opens only for a selected jack', async ({
  page,
}) => {
  await openHdf01(page)
  await expect(panel(page)).toHaveCount(0)
  const before = await cardOrigin(page)
  await page.screenshot({
    path: 'test-results/workbench-2/hdf-01-nothing-selected.png',
  })

  const free = jack(page, 'hdf-01:sp-1D:1:f')
  await free.click()
  await expect(panel(page)).toBeVisible()
  await expect(free).toHaveAttribute('data-selected', 'true')
  // Beside the face, not over it, and the face does not move.
  const face = (await page.locator('.face-card').boundingBox())!
  const side = (await panel(page).boundingBox())!
  expect(side.x).toBeGreaterThanOrEqual(face.x + face.width - 1)
  expect(await cardOrigin(page)).toEqual(before)

  const close = page.getByRole('button', { name: 'Close Port details' })
  await close.click()
  await expect(panel(page)).toHaveCount(0)
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
  await expect.poll(() => cardOrigin(page)).toEqual(before)

  // Escape from inside the panel does the same, and focus goes to the jack.
  await free.click()
  await expect(panel(page)).toBeVisible()
  await panel(page).getByRole('button', { name: 'Show on map' }).focus()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
  await expect.poll(() => cardOrigin(page)).toEqual(before)
  await expect(free).toBeFocused()

  // Back still works after closing.
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(root(page)).toHaveAttribute('data-physical-level', /./)
})

test('EP-07 the port actions come first', async ({ page, request }) => {
  const id = await newPlan(request, 'EP-07 actions')
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openHdf01(page)

  await jack(page, 'hdf-01:sp-1D:1:f').click()
  await expect(panel(page)).toBeVisible()
  // The connect popover may open at a free jack; the panel's own buttons count.
  const connect = panel(page).getByRole('button', { name: 'Connect…' })
  const range = panel(page).getByRole('button', { name: 'Connect a range…' })
  const label = panel(page).locator('.detail-head')
  const cableSection = panel(page).getByTestId('peer-actions')
  const y = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!.y
  expect(await y(connect)).toBeLessThan(await y(label))
  expect(await y(range)).toBeLessThan(await y(label))
  expect(await y(range)).toBeLessThan(await y(cableSection))

  await page.keyboard.press('Escape')
  await jack(page, 'hdf-01:sp-3C:5:f').click()
  const disconnect = panel(page).getByRole('button', { name: /^Disconnect/ })
  await expect(disconnect).toBeVisible()
  expect(await y(disconnect)).toBeLessThan(await y(label))
  expect(await y(disconnect)).toBeLessThan(await y(cableSection))
  await page.screenshot({
    path: 'test-results/workbench-2/hdf-01-cabled-in-plan.png',
  })
})

const openUps = (page: Page) =>
  openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'ups-a03')

test('EP-09 a rack item’s page has the same bar and details line', async ({
  page,
  request,
}) => {
  await openUps(page)
  await expect(bar(page)).toBeVisible()
  await expect(
    bar(page).getByRole('navigation', { name: 'Breadcrumbs' }),
  ).toBeVisible()
  // Last in Rack A03: a previous, no next.
  await expect(
    bar(page).getByRole('button', { name: 'Previous in this rack' }),
  ).toHaveText(/EDGE-17/)
  await expect(page.getByRole('group', { name: 'Side' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Numbers' })).toHaveCount(0)
  const details = page.locator('p[data-testid="equipment-details"]')
  await expect(details).toContainText('UPS')
  await expect(details).toContainText('2U')
  await expect(details).toContainText('Building A')
  await expect(details).toContainText('Rack A03')
  await expect(page.getByTestId('no-ports').first()).toHaveText('No ports')
  await expect(page.locator('.equipment-page')).toContainText('Type')
  await expect(page.getByTestId('rack-strip')).toHaveCount(0)
  await expect(page.locator('.face-head')).toHaveCount(0)
  // Installed: History, and a Move that says a plan is needed (no sheet, no map).
  await more(page).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'History',
    /^Move to another rack…\s*Open a plan first$/,
  ])
  await page.keyboard.press('Escape')
  await expect(
    page.locator('.equipment-page').getByRole('button', { name: /^Delete/ }),
  ).toHaveCount(0)
  await page.screenshot({
    path: 'test-results/workbench-2/rack-item-installed.png',
  })

  const id = await newPlan(request, 'EP-09 rack item')
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openUps(page)
  await expect(
    page.locator('.equipment-page').getByRole('button', { name: /^Delete/ }),
  ).toHaveCount(0)
  await more(page).click()
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'History',
    'Move to another rack…',
    'Delete…',
  ])
  await page.screenshot({
    path: 'test-results/workbench-2/rack-item-plan-menu.png',
  })
  await menu(page).getByRole('menuitem', { name: 'Delete…' }).click()
  const confirm = page.getByRole('group', { name: 'Confirm delete' })
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(more(page)).toBeFocused()
})

test('EP-10 (D50) the port panel opens in the side column right of the face, not in the dock; the face and the column fill the page and the card holds the plate', async ({
  page,
}) => {
  await openHdf01(page)
  const dockWas = await page.locator('.dock:not([hidden])').count()
  await jack(page, 'hdf-01:sp-1D:1:f').click()
  await expect(panel(page)).toBeVisible()
  const card = (await faceCard(page, 'HDF-01').boundingBox())!
  const side = (await panel(page).boundingBox())!
  const column = (await page.getByTestId('work-side').boundingBox())!
  // The card is in the work area's side column, not in the dock, and the dock did not open for it.
  expect(await page.locator('.dock:not([hidden])').count()).toBe(dockWas)
  expect(await page.getByRole('tab', { name: 'Port' }).count()).toBe(0)
  expect(side.x).toBeGreaterThanOrEqual(column.x - 1)
  expect(side.x + side.width).toBeLessThanOrEqual(column.x + column.width + 1)
  expect(side.x).toBeGreaterThanOrEqual(card.x + card.width - 1)
  expect(side.x + side.width).toBeLessThanOrEqual(1536)
  const plate = (await page
    .locator('.faceplate[data-kind="hdf"]')
    .boundingBox())!
  // The face card and the side column fill the page's column; the plate lies inside the card.
  const main = (await page.locator('.equipment-main').boundingBox())!
  expect(
    Math.abs(column.x + column.width - (main.x + main.width)),
  ).toBeLessThanOrEqual(1)
  expect(Math.abs(card.x - main.x)).toBeLessThanOrEqual(1)
  expect(plate.x).toBeGreaterThanOrEqual(card.x)
  expect(plate.x + plate.width).toBeLessThanOrEqual(card.x + card.width + 0.5)
  const blockD = (await page
    .locator('[data-testid="face-block"][data-block$="D"]')
    .last()
    .boundingBox())!
  expect(plate.x + plate.width - (blockD.x + blockD.width)).toBeLessThan(24)
  await page.screenshot({ path: 'test-results/space/hdf-01-1536.png' })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect(panel(page)).toBeVisible()
  await page.screenshot({ path: 'test-results/space/hdf-01-1920.png' })
})

test('EP-11 (D50) a tall HDF keeps readable jacks inside its plate; the page may scroll', async ({
  page,
  request,
}) => {
  const id = await planWith32RowHdf(request)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page
    .locator('.rack-block[data-kind="hdf"]', { hasText: 'HDF-BIG' })
    .click()
  await expect(root(page)).toHaveAttribute('data-physical-level', 'equipment')
  await expect(page.locator('.faceplate[data-fit]')).toHaveCount(1)
  const m = await page.locator('.faceplate[data-fit]').evaluate((plate) => {
    const p = plate.getBoundingClientRect()
    const jacks = [
      ...plate.querySelectorAll('[data-testid="face-endpoint"]'),
    ].map((j) => j.getBoundingClientRect())
    return {
      count: jacks.length,
      small: jacks.filter((r) => r.width < 17.5).length,
      outside: jacks.filter(
        (r) =>
          r.left < p.left - 0.5 ||
          r.right > p.right + 0.5 ||
          r.top < p.top - 0.5 ||
          r.bottom > p.bottom + 0.5,
      ).length,
    }
  })
  expect(m.count).toBe(768)
  expect(m.small).toBe(0)
  expect(m.outside).toBe(0)
  await page.screenshot({ path: 'test-results/space/hdf-32-1536.png' })
})

test('EP-12 a switch page with a port selected', async ({ page }) => {
  await openEdge17(page)
  await page.locator('[data-testid="face-endpoint"]').first().click()
  await expect(panel(page)).toBeVisible()
  await page.screenshot({ path: 'test-results/space/edge-17-1536.png' })
})

// Workbench part 2b, task 2 (D50: the path card under the face and the column).
const pathBar = (page: Page) => page.getByRole('region', { name: 'Path' })
const plates = (page: Page) => pathBar(page).getByTestId('path-plate')
const plateNames = (page: Page) =>
  plates(page).evaluateAll((els) =>
    els.map((e) => e.querySelector('.pn-top bdi')?.textContent),
  )
const documentScrolls = (page: Page) =>
  page.evaluate(() => {
    const el = document.scrollingElement!
    return {
      top: el.scrollTop,
      over: el.scrollHeight - el.clientHeight,
      left: el.scrollLeft,
      wide: el.scrollWidth - el.clientWidth,
    }
  })

test('EP-13 (D50) a selected jack’s path is drawn in the path card under the face', async ({
  page,
}) => {
  await openEdge17(page)
  await expect(pathBar(page)).toContainText('Select a cabled jack')
  await expect(plates(page)).toHaveCount(0)

  await jack(page, 'edge-17:p1').click()
  await expect(pathBar(page)).toBeVisible()
  await expect(
    pathBar(page).getByRole('heading', { name: /^Path of/ }),
  ).toContainText('Port 1')
  expect(await plateNames(page)).toEqual([
    'EDGE-17',
    'PANEL-A',
    'HDF-01',
    'HDF-02',
    'AGG-03',
  ])
  // One line: the plates share a y.
  const ys = await plates(page).evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().y)),
  )
  expect(new Set(ys).size).toBe(1)
  await expect(pathBar(page)).toContainText('4 cables')
  await expect(pathBar(page).getByTestId('path-summary')).toHaveText(
    /4 cables · 5 places · EDGE-17 → AGG-03/,
  )
  await expect(plates(page).last()).toContainText('AGG')
  await expect(pathBar(page).getByTestId('path-cable')).toHaveCount(4)
  // The card is in the page, under the face (not fixed to the window); the document does not scroll.
  await expect(pathBar(page)).not.toHaveCSS('position', 'fixed')
  const bar = (await pathBar(page).boundingBox())!
  const face = (await page.locator('.face-card').boundingBox())!
  expect(bar.y).toBeGreaterThanOrEqual(face.y + face.height - 1)
  expect(await documentScrolls(page)).toEqual({
    top: 0,
    over: 0,
    left: 0,
    wide: 0,
  })
  await page.screenshot({ path: 'test-results/path/edge-17-port-1.png' })
  // The port panel no longer draws the chain or the walk sheet.
  await expect(panel(page).getByTestId('chain')).toHaveCount(0)
  await expect(panel(page).getByTestId('walk-sheet')).toHaveCount(0)
})

test('EP-14 from an HDF position the path runs both ways', async ({ page }) => {
  await openHdf01(page)
  await jack(page, 'hdf-01:sp-3C:5:f').click()
  await expect(pathBar(page)).toBeVisible()
  const names = await plateNames(page)
  const here = await plates(page).evaluateAll((els) =>
    els.findIndex((e) => e.getAttribute('data-here') === 'true'),
  )
  expect(names[here]).toBe('HDF-01')
  expect(here).toBeGreaterThan(0)
  expect(here).toBeLessThan(names.length - 1)
  // The selected plate is the only one that is not a button.
  await expect(
    pathBar(page).getByTestId('path-plate').nth(here),
  ).toHaveJSProperty('tagName', 'DIV')
  await expect(
    pathBar(page).getByRole('button', { name: /^Open (?!the Trace page)/ }),
  ).toHaveCount(names.length - 1)
  await page.screenshot({ path: 'test-results/path/hdf-01-3c5.png' })
})

test('EP-15 (D50) a free jack leaves the path card as its one line; the jack card says it is free', async ({
  page,
}) => {
  await openEdge17(page)
  await jack(page, 'edge-17:p4').click()
  await expect(pathBar(page)).toContainText(
    'Select a cabled jack on the face to draw its path to the AGG or BB.',
  )
  await expect(plates(page)).toHaveCount(0)
  await expect(pathBar(page)).not.toContainText('No cable on this jack')
  await expect(panel(page)).toBeVisible()
  await page.screenshot({ path: 'test-results/path/free-jack.png' })
})

test('EP-16 a plate opens that equipment on that jack', async ({ page }) => {
  await openEdge17(page)
  await jack(page, 'edge-17:p1').click()
  await pathBar(page)
    .getByRole('button', { name: /^Open HDF-02/ })
    .click()
  await expect(root(page)).toHaveAttribute('data-location', /equipment:hdf-02/)
  await expect
    .poll(() => root(page).getAttribute('data-selected-endpoint'))
    .toBe('hdf-02:sp-2B:3:f')
  await expect(jack(page, 'hdf-02:sp-2B:3:f')).toHaveAttribute(
    'data-selected',
    'true',
  )
  // Its own path shows, with HDF-02 as the selected plate.
  await expect(pathBar(page)).toBeVisible()
  await expect(
    pathBar(page).locator('[data-testid="path-plate"][data-here="true"]'),
  ).toContainText('HDF-02')
})

test('EP-17 (D50) Close path on the path card clears the selection', async ({
  page,
}) => {
  await openEdge17(page)
  await jack(page, 'edge-17:p1').click()
  await expect(pathBar(page)).toBeVisible()
  await pathBar(page).getByRole('button', { name: 'Close path' }).click()
  await expect(plates(page)).toHaveCount(0)
  await expect(pathBar(page)).toContainText('Select a cabled jack')
  await expect(panel(page)).toHaveCount(0)
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
  await expect(jack(page, 'edge-17:p1')).toBeFocused()
})

test('EP-18 (D50) at 1280×720 a long path fits the card or scrolls inside it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openEdge17(page)
  await jack(page, 'edge-17:p1').click()
  await expect(pathBar(page)).toBeVisible()
  expect(await documentScrolls(page)).toEqual({
    top: 0,
    over: 0,
    left: 0,
    wide: 0,
  })
  const line = pathBar(page).getByTestId('path-line')
  // Either all of it fits, or the line scrolls on its own; the page never does.
  const m = await line.evaluate((el) => ({
    scrolls: el.scrollWidth > el.clientWidth,
    overflowX: getComputedStyle(el).overflowX,
  }))
  expect(m.overflowX).toMatch(/auto|scroll/)
  const here = (await pathBar(page)
    .locator('[data-testid="path-plate"][data-here="true"]')
    .boundingBox())!
  expect(here.x).toBeGreaterThanOrEqual(0)
  expect(here.x + here.width).toBeLessThanOrEqual(1280)
  await page.screenshot({ path: 'test-results/path/edge-17-1280.png' })
})

test('EP-18a a plan’s proposed cable is dashed in the path', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'EP-19 path')
  await command(request, id, {
    type: 'add_cable',
    cable: { a: 'edge-17:p4', b: 'panel-a:10:f' },
  })
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openEdge17(page)
  await jack(page, 'edge-17:p4').click()
  await expect(pathBar(page)).toContainText('1 cable')
  const cable = pathBar(page).getByTestId('path-cable')
  await expect(cable).toHaveAttribute('data-proposed', 'true')
  await expect(cable.locator('.cable-line')).toHaveCSS(
    'border-top-style',
    'dashed',
  )
  await page.screenshot({ path: 'test-results/path/plan-proposed.png' })
})

test('EP-18b with Pigtails an HDF jack in the path is named by its fibers', async ({
  page,
}) => {
  await openHdf01(page)
  await page
    .getByRole('group', { name: 'Numbers' })
    .getByRole('button', { name: 'Pigtails' })
    .click()
  await jack(page, 'hdf-01:sp-3C:5:f').click()
  await expect(pathBar(page)).toContainText('3C/9,10')
  await expect(
    pathBar(page).getByRole('heading', { name: /^Path of/ }),
  ).toContainText('3C/9,10')
  await page.screenshot({ path: 'test-results/path/hdf-pigtails.png' })
})

test('EP-18c (D50) a tall HDF with a jack selected keeps every jack inside its plate and the path card is under it; the page may scroll', async ({
  page,
  request,
}) => {
  const id = await planWith32RowHdf(request)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page
    .locator('.rack-block[data-kind="hdf"]', { hasText: 'HDF-BIG' })
    .click()
  await expect(root(page)).toHaveAttribute('data-physical-level', 'equipment')
  await page
    .locator('.faceplate[data-fit] [data-testid="face-endpoint"]')
    .first()
    .click()
  await expect(pathBar(page)).toBeVisible()
  const m = await page.locator('.faceplate[data-fit]').evaluate((plate) => {
    const p = plate.getBoundingClientRect()
    const jacks = [
      ...plate.querySelectorAll('[data-testid="face-endpoint"]'),
    ].map((j) => j.getBoundingClientRect())
    return {
      small: jacks.filter((r) => r.width < 17.5).length,
      outside: jacks.filter(
        (r) =>
          r.left < p.left - 0.5 ||
          r.right > p.right + 0.5 ||
          r.top < p.top - 0.5 ||
          r.bottom > p.bottom + 0.5,
      ).length,
    }
  })
  expect(m.small).toBe(0)
  expect(m.outside).toBe(0)
  const bar = (await pathBar(page).boundingBox())!
  const card = (await faceCard(page, 'HDF-BIG').boundingBox())!
  expect(bar.y).toBeGreaterThanOrEqual(card.y + card.height - 1)
  await page.screenshot({ path: 'test-results/path/hdf-32-path.png' })
})

// Workbench part 2b, task 3: Connects to.
const connects = (page: Page) =>
  page.getByRole('region', { name: 'Connects to' })
const lines = (page: Page) => connects(page).getByTestId('connects-line')

test('EP-19 Connects to lists the far equipment', async ({ page }) => {
  await openEdge17(page)
  await expect(connects(page)).toBeVisible()
  await expect(lines(page)).toHaveCount(1)
  await expect(lines(page).first()).toContainText('PANEL-A')
  await expect(lines(page).first()).toContainText('Rack A03')
  await expect(lines(page).first().getByTestId('connects-count')).toHaveText(
    '3',
  )
  await expect(connects(page)).toContainText('1 place · 3 cables')
  await expect(
    connects(page).getByRole('button', { name: 'Show all' }),
  ).toHaveCount(0)
  const box = (await connects(page).boundingBox())!
  expect(box.width).toBeLessThanOrEqual(340)
  const head = (await connects(page)
    .getByTestId('connects-head')
    .boundingBox())!
  const body = await connects(page)
    .getByTestId('connects-body')
    .evaluate((el) => el.scrollHeight)
  expect(Math.abs(box.height - (head.height + body))).toBeLessThanOrEqual(4)
  await page.screenshot({ path: 'test-results/connects/edge-17.png' })
  await openHdf01(page)
  await expect(lines(page)).toHaveCount(3)
  expect(
    await lines(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-far')),
    ),
  ).toEqual(['hdf-02', 'panel-a', 'panel-dr'])
  await expect(connects(page)).toContainText('3 places · 8 cables')
})

test('EP-20 a line lights its jacks', async ({ page }) => {
  await openHdf01(page)
  await expect(page.locator('[data-picking]')).toHaveCount(0)
  const toHdf2 = lines(page).filter({ hasText: 'HDF-02' })
  await page.screenshot({ path: 'test-results/connects/hdf-01.png' })
  await toHdf2.click()
  await expect(toHdf2).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-picking="true"]')).toHaveCount(1)
  await expect(
    page.locator('[data-testid="face-endpoint"][data-lit="true"]'),
  ).toHaveCount(4)
  expect(
    await page
      .locator('[data-testid="face-endpoint"][data-lit="false"]')
      .count(),
  ).toBeGreaterThan(0)
  await expect(jack(page, 'hdf-01:sp-3C:5:f')).toHaveAttribute(
    'data-lit',
    'true',
  )
  await expect(jack(page, 'hdf-01:sp-3C:5:f')).toHaveCSS('opacity', '1')
  await expect(jack(page, 'hdf-01:sp-4A:1:f')).toHaveAttribute(
    'data-lit',
    'false',
  )
  await expect(jack(page, 'hdf-01:sp-4A:1:f')).not.toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/connects/hdf-01-line.png' })
  // Selecting a jack still works while a line is chosen.
  await jack(page, 'hdf-01:sp-3C:5:f').click()
  await expect(panel(page)).toBeVisible()
  await expect(jack(page, 'hdf-01:sp-3C:5:f')).toHaveAttribute(
    'data-selected',
    'true',
  )
  await expect(toHdf2).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'test-results/connects/hdf-01-jack.png' })
  // Choosing the line again clears.
  await toHdf2.click()
  await expect(toHdf2).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-picking]')).toHaveCount(0)
  // Show all clears too.
  await toHdf2.click()
  await connects(page).getByRole('button', { name: 'Show all' }).click()
  await expect(page.locator('[data-picking]')).toHaveCount(0)
  await expect(
    connects(page).getByRole('button', { name: 'Show all' }),
  ).toHaveCount(0)
  // A line on the other side: nothing lit here, the head says where they are.
  await lines(page).filter({ hasText: 'PANEL-A' }).click()
  await expect(
    page.locator('[data-testid="face-endpoint"][data-lit="true"]'),
  ).toHaveCount(0)
  await expect(connects(page).getByTestId('connects-hint')).toHaveText(
    '3 on the rear',
  )
  // The choice is a view state: it clears when the equipment changes.
  await page.getByRole('button', { name: 'Rear', exact: true }).click()
  await expect(
    page.locator('[data-testid="face-endpoint"][data-lit="true"]'),
  ).toHaveCount(3)
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await toHdf2.click()
  await expect(page.locator('[data-picking="true"]')).toHaveCount(1)
  await jack(page, 'hdf-01:sp-3C:5:f').click()
  await pathBar(page)
    .getByRole('button', { name: /^Open HDF-02/ })
    .click()
  await expect(root(page)).toHaveAttribute('data-location', /equipment:hdf-02/)
  await expect(page.locator('[data-picking]')).toHaveCount(0)
  // And coming back does not bring the choice back.
  await pathBar(page)
    .getByRole('button', { name: /^Open HDF-01/ })
    .click()
  await expect(root(page)).toHaveAttribute('data-location', /equipment:hdf-01/)
  await expect(page.locator('[data-picking]')).toHaveCount(0)
})

test('EP-21 (D50) it sits in the side column beside the face, above the jack’s card', async ({
  page,
}) => {
  await openHdf01(page)
  let face = (await faceCard(page, 'HDF-01').boundingBox())!
  let card = (await connects(page).boundingBox())!
  expect(card.x).toBeGreaterThanOrEqual(face.x + face.width)
  expect(card.y).toBeLessThan(face.y + face.height)
  // With a jack selected its card is under Connects to, in the same column.
  await jack(page, 'hdf-01:sp-3C:5:f').click()
  const port = (await panel(page).boundingBox())!
  face = (await faceCard(page, 'HDF-01').boundingBox())!
  card = (await connects(page).boundingBox())!
  expect(port.x).toBeGreaterThanOrEqual(face.x + face.width)
  expect(card.y + card.height).toBeLessThanOrEqual(port.y + 1)
  expect(Math.abs(card.x - port.x)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/connects/hdf-01-jack-1536.png' })
  // A switch's too: beside the face now, not under it.
  await openEdge17(page)
  face = (await faceCard(page, 'EDGE-17').boundingBox())!
  card = (await connects(page).boundingBox())!
  expect(card.x).toBeGreaterThanOrEqual(face.x + face.width)
  // Absent on a rack item.
  await openEquipment(page, 'Main Campus', 'Building A', 'Rack A03', 'ups-a03')
  await expect(connects(page)).toHaveCount(0)
  // 1280×720: nothing sideways.
  await page.setViewportSize({ width: 1280, height: 720 })
  await openHdf01(page)
  await expect(connects(page)).toBeVisible()
  face = (await faceCard(page, 'HDF-01').boundingBox())!
  card = (await connects(page).boundingBox())!
  expect(card.x).toBeGreaterThanOrEqual(face.x + face.width)
  const sideways = await page.evaluate(() => {
    const el = document.querySelector('.equipment-page')!
    return {
      page: el.scrollWidth - el.clientWidth,
      doc:
        document.scrollingElement!.scrollWidth -
        document.scrollingElement!.clientWidth,
    }
  })
  expect(sideways.page).toBeLessThanOrEqual(1)
  expect(sideways.doc).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'test-results/connects/hdf-01-1280.png' })
})
