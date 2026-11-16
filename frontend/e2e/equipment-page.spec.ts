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

test('EP-03 the ⋯ menu: Installed has Print sheet and Show on map; a plan adds Duplicate… and Delete…', async ({
  page,
  request,
}) => {
  await openEdge17(page)
  await expect(more(page)).toHaveAttribute('aria-haspopup', 'menu')
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  await more(page).click()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'Print sheet',
    'Show on map',
  ])
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

test('EP-06 the port panel opens only for a selected jack', async ({
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

  const close = panel(page).getByRole('button', { name: 'Close port' })
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
  const cableSection = panel(page).locator('.chain')
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

test('EP-08 a switch uplinks are under its face', async ({ page }) => {
  await openEdge17(page)
  const uplinks = page.getByTestId('uplinks')
  await expect(page.getByTestId('uplink-line').first()).toBeVisible()
  const face = (await page
    .getByRole('region', { name: 'EDGE-17 face' })
    .boundingBox())!
  expect((await uplinks.boundingBox())!.y).toBeGreaterThanOrEqual(
    face.y + face.height - 1,
  )
  await expect(panel(page)).toHaveCount(0)
  const row = page.getByTestId('uplink-line').first()
  const endpoint = await row.getAttribute('data-endpoint')
  await row.click()
  await expect(panel(page)).toBeVisible()
  await expect(jack(page, endpoint!)).toHaveAttribute('data-selected', 'true')
  await page.screenshot({
    path: 'test-results/workbench-2/edge-17-port-selected.png',
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
  // Installed: nothing to put in the menu.
  await expect(more(page)).toHaveCount(0)
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
  await expect(menu(page).getByRole('menuitem')).toHaveText(['Delete…'])
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

test('EP-10 the port panel sits next to the face', async ({ page }) => {
  await openHdf01(page)
  await jack(page, 'hdf-01:sp-1D:1:f').click()
  await expect(panel(page)).toBeVisible()
  const card = (await faceCard(page, 'HDF-01').boundingBox())!
  const side = (await panel(page).boundingBox())!
  expect(side.x - (card.x + card.width)).toBeLessThan(40)
  expect(side.x).toBeGreaterThanOrEqual(card.x + card.width - 1)
  expect(side.x + side.width).toBeLessThanOrEqual(1536)
  const grid = (await page.locator('.hdf-grid').boundingBox())!
  expect(Math.abs(card.width - grid.width)).toBeLessThan(80) // card and plate padding
  const plate = (await page
    .locator('.faceplate[data-kind="hdf"]')
    .boundingBox())!
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

test('EP-11 a tall HDF uses the window’s height', async ({ page, request }) => {
  const id = await planWith32RowHdf(request)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page
    .locator('.rack-block[data-kind="hdf"]', { hasText: 'HDF-BIG' })
    .click()
  await expect(root(page)).toHaveAttribute('data-physical-level', 'equipment')
  const card = (await faceCard(page, 'HDF-BIG').boundingBox())!
  const gap = 864 - (card.y + card.height)
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(gap).toBeLessThanOrEqual(40)
  const rows = await page.evaluate(() => {
    const area = document.querySelector('.hdf-scroll')!.getBoundingClientRect()
    return [...document.querySelectorAll('.hdf-row')].filter((e) => {
      const r = e.getBoundingClientRect()
      return r.top >= area.top && r.bottom <= area.bottom
    }).length
  })
  expect(rows).toBeGreaterThanOrEqual(7)
  const scroll = await page.evaluate(() => ({
    top: document.scrollingElement!.scrollTop,
    over:
      document.scrollingElement!.scrollHeight -
      document.scrollingElement!.clientHeight,
  }))
  expect(scroll.top).toBe(0)
  expect(scroll.over).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'test-results/space/hdf-32-1536.png' })
})

test('EP-12 a switch page with a port selected', async ({ page }) => {
  await openEdge17(page)
  await page.locator('[data-testid="face-endpoint"]').first().click()
  await expect(panel(page)).toBeVisible()
  await page.screenshot({ path: 'test-results/space/edge-17-1536.png' })
})
