import { expect, test, type Page } from './fixtures'
import { fitted, openRackInPhysical } from './helpers'
import { command, newPlan } from './plan-api'

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
