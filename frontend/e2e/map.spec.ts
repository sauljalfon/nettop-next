import { expect, test, type Page } from './fixtures'
import { cardPositions, fitted, viewport } from './helpers'
import { chooseRack } from './patching-helpers'

/** Opens each tool in turn; the dock sits beside the canvas and the map is neither refit nor panned. */
async function expectToolsBesideTheMap(page: Page, openers: string[]) {
  await fitted(page) // read the viewport only after the one-time fit has settled
  const bounds = (await page.locator('.flow-surface').boundingBox())!
  const port = await viewport(page)
  const card = page.locator('[data-card-key]').first()
  const cardBefore = (await card.boundingBox())!
  for (const name of openers) {
    await page.getByRole('button', { name, exact: true }).click()
    const dock = page.locator('.dock:not([hidden])')
    await expect(dock).toBeVisible()
    const d = (await dock.boundingBox())!
    const surface = (await page.locator('.flow-surface').boundingBox())!
    // The map's right edge is the dock's left edge; its other edges stay.
    expect(Math.abs(surface.x + surface.width - d.x)).toBeLessThanOrEqual(1)
    expect(surface.x).toBe(bounds.x)
    expect(surface.y).toBe(bounds.y)
    expect(surface.height).toBe(bounds.height)
    // Nothing scrolls sideways.
    expect(
      await page.evaluate(() =>
        [
          document.documentElement,
          ...document.querySelectorAll('.studio, .workspace-canvas'),
        ].some((el) => el.scrollWidth > el.clientWidth + 1),
      ),
    ).toBe(false)
    // The tree is not refit: the viewport and a card's place on the screen stay.
    expect(await viewport(page)).toBe(port)
    expect(await card.boundingBox()).toEqual(cardBefore)
    await page.getByRole('button', { name, exact: true }).click()
    await expect(dock).toHaveCount(0)
    expect(await page.locator('.flow-surface').boundingBox()).toEqual(bounds)
  }
}

test('C10 a tool opens the dock beside the canvas and the map is neither refit nor moved', async ({
  page,
}) => {
  await page.goto('/')
  await expectToolsBesideTheMap(page, ['Open explorer', 'Open inspector'])
  // Add is for plans only: disabled in Installed, and the dock never shows it there.
  await expect(
    page.getByRole('button', { name: 'Add equipment library', exact: true }),
  ).toBeDisabled()
  await expect(page.locator('.dock:not([hidden])')).toHaveCount(0)
})

test('C10b Add, in a plan, opens the dock beside the canvas and the map is neither refit nor moved', async ({
  page,
}) => {
  await page.goto('/?plan=expansion')
  await expectToolsBesideTheMap(page, ['Add equipment library'])
})

test('C12 saving and refetching reconcile by ID without remounting or resetting', async ({
  page,
}) => {
  await page.goto('/?plan=expansion')
  await fitted(page) // read the viewport only after the one-time fit has settled
  // A switch with no cable goes under No AGG: that card is not there yet.
  const added = page.locator('[data-card-key="none|node-building-a"]')
  await expect(added).toHaveCount(0)
  await page.evaluate(() => {
    document.querySelector('.flow-surface')!.setAttribute('data-mounted', 'yes')
  })
  const port = await viewport(page)
  const before = await cardPositions(page)

  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Access switch…' }).click()
  const form = page.getByTestId('equipment-form')
  await form.getByLabel('Name').fill('EDGE-SAVED')
  await form.getByLabel('Network').selectOption('net-a')
  await chooseRack(form, 'Place', {
    site: 'Main Campus',
    node: 'Building A',
    rack: 'Rack A03',
  })
  await form.getByLabel('Unit', { exact: true }).fill('4')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(page.getByRole('status')).toContainText('revision 2')

  // The refetched plan shows the new switch under No AGG, in the same mounted canvas.
  await expect(added).toContainText('1')
  await expect(added).toContainText('Building A')
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-mounted',
    'yes',
  )
  expect(await viewport(page)).toBe(port)
  // Cards that were there stay where they were; only the top row recentres over the new group.
  const after = await cardPositions(page)
  for (const [key, at] of Object.entries(before))
    if (key !== 'bb-01') expect(after[key]).toBe(at)
})
