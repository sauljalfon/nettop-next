import { expect, test, type Page } from './fixtures'
import { BUILDING_A, fitted, openRackInPhysical } from './helpers'
import { newPlan } from './plan-api'

const header = (page: Page) => page.locator('.studio-header')
const rail = (page: Page) =>
  page.getByRole('navigation', { name: 'Workspace tools' })
const canvas = (page: Page) => page.locator('.workspace-canvas')
const dock = (page: Page, name: string) =>
  page.getByRole('complementary', { name, exact: true })
const open = (page: Page, rail: string) =>
  page.getByRole('button', { name: rail, exact: true })

const sidewaysScroll = (page: Page) =>
  page.evaluate(() => {
    const els = [
      document.documentElement,
      document.body,
      ...document.querySelectorAll('.studio, .workspace-canvas'),
    ]
    return els
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className || el.tagName)
  })

test.use({ viewport: { width: 1536, height: 864 } })

test('FR-01 the header is 44px and the rail 48px', async ({ page }) => {
  await page.goto('/')
  await expect(canvas(page)).toBeVisible()
  expect((await header(page).boundingBox())!.height).toBe(44)
  expect((await rail(page).boundingBox())!.width).toBe(48)
  await expect(rail(page).locator('button')).toHaveCount(3)
  await expect(open(page, 'Open trace tools')).toHaveCount(0)
  // Icons only: no text under them.
  await expect(rail(page)).toHaveText('')
})

test('FR-02 a rail icon opens its dock tab and narrows the page', async ({
  page,
}) => {
  await page.goto('/')
  await expect(canvas(page)).toBeVisible()
  const wide = (await canvas(page).boundingBox())!
  await open(page, 'Open inspector').click()
  const inspector = dock(page, 'Equipment inspector')
  await expect(inspector).toBeVisible()
  const d = (await inspector.boundingBox())!
  const c = (await canvas(page).boundingBox())!
  expect(d.width).toBe(380)
  expect(d.x).toBeGreaterThan(c.x)
  expect(Math.abs(c.x + c.width - d.x)).toBeLessThanOrEqual(1)
  expect(c.width).toBeLessThan(wide.width - 370)
  expect(await sidewaysScroll(page)).toEqual([])
  await expect(open(page, 'Open inspector')).toHaveAttribute(
    'aria-expanded',
    'true',
  )
})

test('FR-03 one tab at a time', async ({ page }) => {
  await page.goto('/')
  await open(page, 'Open explorer').click()
  await expect(dock(page, 'Explore infrastructure')).toBeVisible()
  await open(page, 'Open inspector').click()
  await expect(dock(page, 'Equipment inspector')).toBeVisible()
  await expect(page.getByRole('complementary')).toHaveCount(1)
  await expect(page.getByRole('tab', { name: 'Inspector' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('tab', { name: 'Trace' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Explore' }).click()
  await expect(dock(page, 'Explore infrastructure')).toBeVisible()
  await expect(page.getByRole('complementary')).toHaveCount(1)
})

test('FR-04 the same icon again, ×, and Esc close it', async ({ page }) => {
  await page.goto('/')
  await open(page, 'Open inspector').click()
  await expect(dock(page, 'Equipment inspector')).toBeVisible()
  await open(page, 'Open inspector').click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await open(page, 'Open inspector').click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await open(page, 'Open explorer').click()
  await expect(dock(page, 'Explore infrastructure')).toBeVisible()
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary')).toHaveCount(0)
  // The page widens again.
  const c = (await canvas(page).boundingBox())!
  expect(c.x + c.width).toBeGreaterThanOrEqual(1535)
})

test('FR-05 Add is only in a plan', async ({ page }) => {
  await page.goto('/')
  const add = open(page, 'Add equipment library')
  await expect(add).toBeDisabled()
  await expect(add).toHaveAttribute('title', 'Add: open a plan first')
  await open(page, 'Open explorer').click()
  await expect(page.getByRole('tab', { name: 'Add' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await expect(add).toBeEnabled()
  await add.click()
  await expect(dock(page, 'Equipment library')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Add' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('FR-06 Changes in the header opens the Changes tab', async ({ page }) => {
  await page.goto('/')
  const changes = header(page).getByRole('button', { name: /Changes/ })
  await changes.click()
  await expect(dock(page, 'Changes & plans')).toBeVisible()
  await expect(changes).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('tab', { name: 'Changes' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await changes.click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
})

test.describe('1280×720', () => {
  test.use({ viewport: { width: 1280, height: 720 } })
  test('FR-07 at 1280×720 nothing scrolls sideways', async ({ page }) => {
    await page.goto('/')
    await expect(canvas(page)).toBeVisible()
    expect(await sidewaysScroll(page)).toEqual([])
    for (const name of ['Open inspector', 'Open explorer']) {
      await open(page, name).click()
      await expect(page.getByRole('complementary')).toBeVisible()
      expect(await sidewaysScroll(page)).toEqual([])
    }
    await page.getByRole('button', { name: 'Plan: Expansion' }).click()
    await open(page, 'Add equipment library').click()
    expect(await sidewaysScroll(page)).toEqual([])
  })
})

test('FR-07b in a plan the header is amber and shows the plan name; in Installed it is paper', async ({
  page,
}) => {
  await page.goto('/')
  const bg = () =>
    header(page).evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await bg()).toBe('rgb(255, 255, 255)')
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await expect(
    header(page).getByRole('button', { name: /Plan:.*Expansion/ }),
  ).toBeVisible()
  expect(await bg()).toBe('rgb(251, 241, 214)')
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  expect(await bg()).toBe('rgb(255, 255, 255)')
})

test('FR-07c switching Installed ↔ Plan keeps the dock', async ({ page }) => {
  await page.goto('/')
  await expect(canvas(page)).toBeVisible()
  // Entering a plan still opens Changes.
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await expect(dock(page, 'Changes & plans')).toBeVisible()
  // Inspector open → back to Installed → still the Inspector.
  await open(page, 'Open inspector').click()
  await expect(dock(page, 'Equipment inspector')).toBeVisible()
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(dock(page, 'Equipment inspector')).toBeVisible()
  // Add open in a plan → Installed → Changes.
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await open(page, 'Add equipment library').click()
  await expect(dock(page, 'Equipment library')).toBeVisible()
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(dock(page, 'Changes & plans')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Add' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Changes' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test.describe('1280×720 tabs', () => {
  test.use({ viewport: { width: 1280, height: 720 } })
  // No details tab and no trace, so this has five tabs:
  // Inspector, Explore, Add, Changes and Networks.
  test('FR-07d five or six tabs fit or scroll inside the tab row', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Plan: Expansion' }).click()
    await page
      .getByRole('combobox', { name: 'Show network' })
      .selectOption({ label: 'Manage networks…' })
    const dockEl = dock(page, 'Manage networks')
    await expect(dockEl).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(5)
    const d = (await dockEl.boundingBox())!
    const x = page.getByRole('button', { name: 'Close Manage networks' })
    await expect(x).toBeVisible()
    const xb = (await x.boundingBox())!
    expect(xb.x + xb.width).toBeLessThanOrEqual(d.x + d.width + 1)
    // Every tab can be reached: it is inside the dock after scrolling it into view.
    for (const tab of await page.getByRole('tab').all()) {
      await tab.scrollIntoViewIfNeeded()
      const b = (await tab.boundingBox())!
      expect(b.x).toBeGreaterThanOrEqual(d.x - 1)
      expect(b.x + b.width).toBeLessThanOrEqual(xb.x + 1)
    }
    expect(await sidewaysScroll(page)).toEqual([])
    // The row itself must not push the dock wider than 380px.
    expect(d.width).toBe(380)
    // On a narrow phone the five tabs no longer fit: the row scrolls inside itself, the x stays put.
    await page.setViewportSize({ width: 300, height: 640 })
    const list = page.getByRole('tablist', { name: 'Dock' })
    expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    )
    await expect(x).toBeInViewport()
    await page.getByRole('tab', { name: 'Networks' }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('tab', { name: 'Networks' })).toBeInViewport()
    const xs = (await x.boundingBox())!
    expect(xs.x + xs.width).toBeLessThanOrEqual(300)
    // (The page itself never scrolls; the phone header is not this task's concern.)
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true)
  })
})

// Task 2: the details tab (Node on the tree, Port on an equipment page) and the Key.
const card = (page: Page) => page.locator(`[data-card-key="${BUILDING_A}"]`)
const surface = (page: Page) => page.locator('.flow-surface')

test('FR-08 a node card opens Node in the dock and the tree narrows', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const wide = (await surface(page).boundingBox())!
  await card(page).click()
  const node = dock(page, 'Node details')
  await expect(node).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Node' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(node.getByTestId('hierarchy-drawer')).toBeVisible()
  const d = (await node.boundingBox())!
  await expect
    .poll(async () => {
      const s = (await surface(page).boundingBox())!
      return Math.abs(s.x + s.width - d.x)
    })
    .toBeLessThanOrEqual(1)
  expect((await surface(page).boundingBox())!.width).toBeLessThan(
    wide.width - 370,
  )
  // Nothing floats over the tree any more.
  await expect(page.locator('.hierarchy-drawer')).toHaveCount(0)
  // The selected card is visible in the narrowed canvas after the pan.
  await expect
    .poll(async () => {
      const c = (await card(page).boundingBox())!
      const s = (await surface(page).boundingBox())!
      return (
        c.x >= s.x - 1 &&
        c.y >= s.y - 1 &&
        c.x + c.width <= s.x + s.width + 1 &&
        c.y + c.height <= s.y + s.height + 1
      )
    })
    .toBe(true)
})

test('FR-09 × and Esc clear the selection', async ({ page }) => {
  await page.goto('/')
  await fitted(page)
  await card(page).click()
  await expect(dock(page, 'Node details')).toBeVisible()
  await page.getByRole('button', { name: 'Close Node details' }).click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
  await card(page).click()
  await expect(dock(page, 'Node details')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
  await expect(page.getByTestId('hierarchy-drawer')).toHaveCount(0)
})

test('FR-10 (D50) a jack opens its card beside the face, not a Port tab in the dock', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'FR-10 jack')
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').dblclick()
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-physical-level',
    'equipment',
  )
  const faceCard = page.locator('.face-card')
  const before = (await faceCard.boundingBox())!
  const free = page.locator(
    '[data-testid="face-endpoint"][data-endpoint-id="hdf-01:sp-1D:1:f"]',
  )
  await free.click()
  // The dock stays closed: no Port tab, no dock.
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Port' })).toHaveCount(0)
  const panel = page.getByTestId('work-side').getByTestId('endpoint-detail')
  await expect(panel.getByRole('button', { name: 'Connect…' })).toBeVisible()
  await expect(
    panel.getByRole('button', { name: 'Connect a range…' }),
  ).toBeVisible()
  // The face does not move sideways: nothing opened beside the page.
  const after = (await faceCard.boundingBox())!
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Close Port details' }).click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
})

test('FR-11 selecting nothing closes the details tab, not the dock’s other tab', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await open(page, 'Open explorer').click()
  await expect(dock(page, 'Explore infrastructure')).toBeVisible()
  await card(page).click()
  await expect(dock(page, 'Node details')).toBeVisible()
  await page.getByRole('button', { name: 'Close Node details' }).click()
  await expect(dock(page, 'Explore infrastructure')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Node' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('FR-11b (D50) a jack opened from the Changes list keeps Changes and adds no Port tab', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await expect(dock(page, 'Changes & plans')).toBeVisible()
  await page
    .getByTestId('change-line')
    .filter({ hasText: /Port/ })
    .getByRole('button')
    .first()
    .click()
  await expect(page.locator('.physical-explorer')).toBeVisible()
  // No Port tab (D50); the dock stays on Changes with its list, and the card is on the page.
  await expect(page.getByRole('tab', { name: 'Port' })).toHaveCount(0)
  await expect(dock(page, 'Changes & plans')).toBeVisible()
  await expect(page.getByTestId('change-line').first()).toBeVisible()
  await expect(
    page.getByTestId('work-side').getByTestId('endpoint-detail'),
  ).toBeVisible()
})

test('FR-12 Key shows and hides the legend', async ({ page }) => {
  await page.goto('/')
  await fitted(page)
  const legend = page.locator('.hierarchy-legend')
  await expect(legend).toHaveCount(0)
  await page.getByRole('button', { name: 'Key', exact: true }).click()
  await expect(legend).toBeVisible()
  await expect(legend).toContainText('peers')
  await page.getByRole('button', { name: 'Hide key', exact: true }).click()
  await expect(legend).toHaveCount(0)
})

test.describe('1280×720 with details', () => {
  test.use({ viewport: { width: 1280, height: 720 } })
  test('FR-07e six tabs (Node, Add and Networks) fit or scroll inside the row', async ({
    page,
    request,
  }) => {
    const id = await newPlan(request, 'FR-07e tabs')
    await page.goto(`/?plan=${id}`)
    await fitted(page)
    await card(page).click()
    await page
      .getByRole('combobox', { name: 'Show network' })
      .selectOption({ label: 'Manage networks…' })
    const dockEl = dock(page, 'Manage networks')
    await expect(dockEl).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(6)
    await expect(page.getByRole('tab', { name: 'Node' })).toBeVisible()
    const d = (await dockEl.boundingBox())!
    const x = page.getByRole('button', { name: 'Close Manage networks' })
    const xb = (await x.boundingBox())!
    expect(xb.x + xb.width).toBeLessThanOrEqual(d.x + d.width + 1)
    expect(d.width).toBe(380)
    for (const tab of await page.getByRole('tab').all()) {
      await tab.scrollIntoViewIfNeeded()
      const b = (await tab.boundingBox())!
      expect(b.x).toBeGreaterThanOrEqual(d.x - 1)
      expect(b.x + b.width).toBeLessThanOrEqual(xb.x + 1)
    }
    expect(await sidewaysScroll(page)).toEqual([])
    // The selected tab is fully inside the tab row's visible box, and the row says it scrolls.
    const row = page.getByRole('tablist', { name: 'Dock' })
    const inside = async () => {
      const r = (await row.boundingBox())!
      const t = (await page.getByRole('tab', { selected: true }).boundingBox())!
      return t.x >= r.x - 1 && t.x + t.width <= r.x + r.width + 1
    }
    await expect.poll(inside).toBe(true)
    await expect(row).toHaveAttribute('data-more-before', /true|false/)
    await page.getByRole('tab', { name: 'Node' }).click()
    await expect.poll(inside).toBe(true)
    await expect(dock(page, 'Node details')).toBeVisible()
    await page.getByRole('tab', { name: 'Changes' }).click()
    await expect.poll(inside).toBe(true)
    await page.screenshot({
      path: 'test-results/frame/node-add-networks-1280.png',
    })
  })
})
