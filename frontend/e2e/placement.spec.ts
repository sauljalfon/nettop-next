import { expect, test } from '@playwright/test'
import { openRackInPhysical, expandResults } from './helpers'

test('rack drops, persisted moves, collisions, and tracing through the rack view', async ({
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
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Access switch' })
    .dragTo(page.getByTestId('rack-slot-rack-a03-4'))
  await expect(page.getByLabel('Starting unit', { exact: true })).toHaveValue(
    '4',
  )
  await expect(page.getByRole('combobox', { name: /^Network/ })).toHaveValue('')
  await page.getByLabel('Equipment name', { exact: true }).fill('DRAG-EDGE')
  await page.getByRole('combobox', { name: /^Network/ }).selectOption('net-a')
  await page.getByLabel('Port count', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Save equipment to plan' }).click()
  await expect(page.getByTestId('rack-slot-rack-a03-4')).toContainText(
    'DRAG-EDGE',
  )
  // A rack shows one rack at a time, so moves to other nodes use the placement
  // form in the inspector (the same command a drag sends).
  const moveWithForm = async (from: string, rack: string, unit: string) => {
    await page.getByTestId(from).locator('.rack-block').click() // opens its page
    if ((await page.locator('aside.studio-drawer').count()) === 0)
      await page.getByRole('button', { name: 'Open inspector' }).click()
    await page.getByLabel('Placement rack').selectOption(rack)
    await page.getByLabel('Placement unit', { exact: true }).fill(unit)
    await page
      .getByRole('button', { name: 'Save planned placement', exact: true })
      .click()
    // Selecting opened the equipment page; Back returns to the rack.
    await page.getByRole('button', { name: 'Back', exact: true }).click()
  }
  await moveWithForm('rack-slot-rack-a03-4', 'rack-dr02', '3')
  await expect(page.getByTestId('rack-slot-rack-a03-4')).not.toContainText(
    'DRAG-EDGE',
  )
  await moveWithForm('rack-slot-rack-a03-8', 'rack-core-02', '4')
  await expect(page.getByTestId('rack-slot-rack-a03-8')).not.toContainText(
    'EDGE-17',
  )
  await page.getByLabel('Placement unit', { exact: true }).fill('8')
  await page
    .getByRole('button', { name: 'Save planned placement', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('rack collision')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const draft = await (await request.get(`/api/plans/${id}`)).json()
  expect(draft.revision).toBe('4')
  expect(draft.equipment[0]).toMatchObject({ rackId: 'rack-dr02', unit: 3 })
  // The collision message is still on screen over the bottom of the page.
  await page.getByRole('button', { name: 'Dismiss placement error' }).click()
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expandResults(page)
  await expect(
    page.getByText(/4 cables · 3 internal bridges/).first(),
  ).toBeVisible()
  await page.reload()
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 02',
  )
  await expect(page.getByTestId('rack-slot-rack-core-02-4')).toContainText(
    'EDGE-17',
  )
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await expect(page.getByTestId('rack-slot-rack-a03-8')).toContainText(
    'EDGE-17',
  )
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
  await page.getByLabel('New plan name').fill('Map creation check')
  await page.getByRole('button', { name: 'Create plan', exact: true }).click()
  await expect(page.getByLabel('Saved plan')).toContainText(
    'Map creation check',
  )
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page
    .locator('.library-item')
    .filter({ hasText: 'Access switch' })
    .dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 1300, y: 850 },
    })
  await page.getByLabel('Equipment name', { exact: true }).fill('BOARD-EDGE')
  await page.getByRole('combobox', { name: /^Network/ }).selectOption('net-a')
  await page
    .getByRole('combobox', { name: 'Target rack', exact: true })
    .selectOption('rack-a03')
  await page.getByLabel('Port count', { exact: true }).fill('2')
  await page
    .getByRole('button', { name: 'Save equipment to plan', exact: true })
    .click()
  await expect(page.locator('.unplaced-card')).toHaveCount(0)
  await expect(
    page.locator('.equipment-card').filter({ hasText: 'BOARD-EDGE' }),
  ).toBeVisible()
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await expect(page.getByTestId('rack-slot-rack-a03-1')).toContainText(
    'BOARD-EDGE',
  )
})
