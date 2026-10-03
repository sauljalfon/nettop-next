import { expect, test } from '@playwright/test'

test('rack drops, persisted moves, collisions, and tracing share one hierarchy', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByLabel('New plan name').fill('Drag placement check')
  await page.getByRole('button', { name: 'Create plan', exact: true }).click()
  await expect(page.getByLabel('Saved plan')).toContainText(
    'Drag placement check',
  )
  const id = await page.getByLabel('Saved plan').inputValue()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page.getByRole('button', { name: 'Racks', exact: true }).click()
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Access switch' })
    .dragTo(page.getByTestId('rack-slot-rack-03-4'))
  await expect(page.getByLabel('Starting unit', { exact: true })).toHaveValue(
    '4',
  )
  await expect(page.getByRole('combobox', { name: /^Network/ })).toHaveValue('')
  await page.getByLabel('Equipment name', { exact: true }).fill('DRAG-EDGE')
  await page
    .getByRole('combobox', { name: /^Network/ })
    .selectOption('net-prototype')
  await page.getByLabel('Port count', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Save equipment to plan' }).click()
  await expect(page.getByTestId('rack-slot-rack-03-4')).toContainText(
    'DRAG-EDGE',
  )
  await page
    .getByTestId('rack-slot-rack-03-4')
    .locator('.rack-device-name')
    .dragTo(page.getByTestId('rack-slot-rack-04-3'))
  await expect(page.getByTestId('rack-slot-rack-04-3')).toContainText(
    'DRAG-EDGE',
  )
  await page
    .getByTestId('rack-slot-rack-03-8')
    .locator('.rack-device-name')
    .dragTo(page.getByTestId('rack-slot-rack-04-4'))
  await expect(page.getByTestId('rack-slot-rack-04-4')).toContainText('EDGE-01')
  await page
    .getByTestId('rack-slot-rack-04-4')
    .locator('.rack-device-name')
    .click()
  await page.getByLabel('Placement unit', { exact: true }).fill('8')
  await page
    .getByRole('button', { name: 'Save planned placement', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('rack collision')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const draft = await (await request.get(`/api/plans/${id}`)).json()
  expect(draft.revision).toBe('4')
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page
    .getByRole('button', { name: 'Trace physical path', exact: true })
    .click()
  await expect(page.getByText(/3 cables · 2 internal bridges/)).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Racks', exact: true }).click()
  await expect(page.getByTestId('rack-slot-rack-04-4')).toContainText('EDGE-01')
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await page.getByRole('button', { name: 'Racks', exact: true }).click()
  await expect(page.getByTestId('rack-slot-rack-03-8')).toContainText('EDGE-01')
})

test('empty canvas creates an unplaced preview and saves only after rack assignment', async ({
  page,
  request,
}) => {
  await page.goto('/?plan=expansion')
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  const before = await (await request.get('/api/plans/expansion')).json()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Aggregation' })
    .dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 1300, y: 850 },
    })
  await expect(
    page.getByRole('combobox', { name: 'Equipment role', exact: true }),
  ).toHaveValue('aggregation')
  await expect(
    page.getByRole('combobox', { name: 'Target rack', exact: true }),
  ).toHaveValue('')
  await expect(
    page.getByText('Unplaced equipment preview', { exact: true }),
  ).toBeVisible()
  const after = await (await request.get('/api/plans/expansion')).json()
  expect(after.revision).toBe(before.revision)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.unplaced-card')).toHaveCount(0)
  await page.getByLabel('New plan name').fill('Whiteboard creation check')
  await page.getByRole('button', { name: 'Create plan', exact: true }).click()
  await expect(page.getByLabel('Saved plan')).toContainText(
    'Whiteboard creation check',
  )
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Access switch' })
    .dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 1300, y: 850 },
    })
  await page.getByLabel('Equipment name', { exact: true }).fill('BOARD-EDGE')
  await page
    .getByRole('combobox', { name: /^Network/ })
    .selectOption('net-prototype')
  await page
    .getByRole('combobox', { name: 'Target rack', exact: true })
    .selectOption('rack-03')
  await page.getByLabel('Port count', { exact: true }).fill('2')
  await page
    .getByRole('button', { name: 'Save equipment to plan', exact: true })
    .click()
  await expect(page.locator('.unplaced-card')).toHaveCount(0)
  await expect(
    page.locator('.equipment-card').filter({ hasText: 'BOARD-EDGE' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Racks', exact: true }).click()
  await expect(page.getByTestId('rack-slot-rack-03-1')).toContainText(
    'BOARD-EDGE',
  )
})
