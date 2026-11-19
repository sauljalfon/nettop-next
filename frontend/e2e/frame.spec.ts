import { expect, test, type Page } from './fixtures'

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
  await expect(rail(page).locator('button')).toHaveCount(4)
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
  await open(page, 'Open trace tools').click()
  await expect(dock(page, 'Trace tools')).toBeVisible()
  await expect(page.getByRole('complementary')).toHaveCount(1)
  await expect(page.getByRole('tab', { name: 'Trace' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('tab', { name: 'Explore' }).click()
  await expect(dock(page, 'Explore infrastructure')).toBeVisible()
  await expect(page.getByRole('complementary')).toHaveCount(1)
})

test('FR-04 the same icon again, ×, and Esc close it', async ({ page }) => {
  await page.goto('/')
  await open(page, 'Open trace tools').click()
  await expect(dock(page, 'Trace tools')).toBeVisible()
  await open(page, 'Open trace tools').click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await open(page, 'Open trace tools').click()
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
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
  await open(page, 'Open trace tools').click()
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
    for (const name of [
      'Open inspector',
      'Open trace tools',
      'Open explorer',
    ]) {
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
  // No test hook opens the details tab before Task 2, so this has six tabs:
  // Inspector, Trace, Explore, Add, Changes and Networks.
  test('FR-07d six or seven tabs fit or scroll inside the tab row', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Plan: Expansion' }).click()
    await page
      .getByRole('combobox', { name: 'Show network' })
      .selectOption({ label: 'Manage networks…' })
    const dockEl = dock(page, 'Manage networks')
    await expect(dockEl).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(6)
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
    // On a phone the six tabs no longer fit: the row scrolls inside itself, the x stays put.
    await page.setViewportSize({ width: 360, height: 640 })
    const list = page.getByRole('tablist', { name: 'Dock' })
    expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    )
    await expect(x).toBeInViewport()
    await page.getByRole('tab', { name: 'Networks' }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('tab', { name: 'Networks' })).toBeInViewport()
    const xs = (await x.boundingBox())!
    expect(xs.x + xs.width).toBeLessThanOrEqual(360)
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
