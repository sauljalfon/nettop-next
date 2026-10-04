import { expect, test } from '@playwright/test'

test('direct canvas drag proposes a rack move without resetting the viewport', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByLabel('New plan name').fill('Nested canvas move')
  await page.getByRole('button', { name: 'Create plan', exact: true }).click()
  await expect(page.getByLabel('Saved plan')).toContainText(
    'Nested canvas move',
  )
  const planID = await page.getByLabel('Saved plan').inputValue()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  const item = page.getByTestId('rf__node-edge-01'),
    target = page.getByTestId('rf__node-rack:rack-04')
  await expect(item).toBeVisible()
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click()
  const original = await page
    .locator('.react-flow__viewport')
    .getAttribute('style')
  const sourceBounds = await item.boundingBox(),
    targetBounds = await target.boundingBox()
  if (!sourceBounds || !targetBounds)
    throw new Error('Missing visible containers')
  await page.mouse.move(sourceBounds.x + 50, sourceBounds.y + 20)
  await page.mouse.down()
  await page.mouse.move(targetBounds.x + 60, targetBounds.y + 40, { steps: 20 })
  await page.mouse.up()
  await expect(page.getByRole('status')).toContainText('revision 2')
  expect(
    await page.locator('.react-flow__viewport').getAttribute('style'),
  ).toBe(original)
  const plan = await (await request.get(`/api/plans/${planID}`)).json()
  expect(plan.updates[0].rackId).toBe('rack-04')
  await item.click()
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'Distribution Room / Rack 04 / EDGE-01',
  )
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-01', exact: true })
    .click()
  await expect(page.getByText(/3 cables · 2 internal bridges/)).toBeVisible()
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await page.getByTestId('rf__node-edge-01').click()
  await expect(page.locator('.location-breadcrumb')).toContainText(
    'Server Room / Rack 03 / EDGE-01',
  )
})
