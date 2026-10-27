import { expect, test } from '@playwright/test'
import { cardPositions, fitted, viewport } from './helpers'
import { chooseRack } from './patching-helpers'

test('C10 opening and closing tools keeps the full-page canvas and viewport', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page) // read the viewport only after the one-time fit has settled
  const bounds = await page.locator('.flow-surface').boundingBox()
  const port = await viewport(page)
  for (const name of [
    'Open explorer',
    'Open trace tools',
    'Open inspector',
    'Add equipment library',
  ]) {
    await page.getByRole('button', { name, exact: true }).click()
    expect(await page.locator('.flow-surface').boundingBox()).toEqual(bounds)
    expect(await viewport(page)).toBe(port)
    await page.getByRole('button', { name, exact: true }).click()
  }
  await expect(page.locator('.studio-drawer')).toHaveCount(0)
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
  await expect(added).toContainText('1 switch')
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
