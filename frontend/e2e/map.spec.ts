import { expect, test } from '@playwright/test'
import { fitted, viewport } from './helpers'
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
  const building = page.locator('[data-node-id="node-building-a"]')
  const count = async () =>
    Number(/(\d+) equipment/.exec((await building.textContent()) ?? '')![1])
  const equipment = await count()
  await page.evaluate(() => {
    document.querySelector('.flow-surface')!.setAttribute('data-mounted', 'yes')
  })
  const port = await viewport(page)
  const positions = await page
    .locator('[data-view="overview"]')
    .getAttribute('data-node-positions')

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

  // The refetched plan shows the new equipment in its node, in the same mounted canvas.
  await expect.poll(count).toBe(equipment + 1)
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-mounted',
    'yes',
  )
  expect(await viewport(page)).toBe(port)
  await expect(page.locator('[data-view="overview"]')).toHaveAttribute(
    'data-node-positions',
    positions!,
  )
})
