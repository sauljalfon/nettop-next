import { expect, test } from '@playwright/test'

test('save a plan, reconnect a proposed port, reload, and reject stale edits', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByLabel('New plan name').fill('Browser persistence check')
  await page.getByRole('button', { name: 'Create plan', exact: true }).click()
  await expect(page.getByLabel('Saved plan')).toContainText(
    'Browser persistence check',
  )
  const planID = await page.getByLabel('Saved plan').inputValue()
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click()
  await page.getByLabel('Equipment name', { exact: true }).fill('EDGE-BROWSER')
  await page.getByLabel('Equipment role').selectOption('backbone')
  const network = page.getByRole('combobox', { name: /^Network/ })
  await expect(network).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Save equipment to plan' }),
  ).toBeDisabled()
  await network.selectOption('net-a')
  await page.getByLabel('Starting unit', { exact: true }).fill('4')
  await page.getByLabel('Port count', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Save equipment to plan' }).click()
  await expect(page.getByRole('status')).toContainText('revision 2')
  const saved = await (await request.get(`/api/plans/${planID}`)).json()
  expect(saved.equipment[0]).toMatchObject({
    role: 'backbone',
    networkId: 'net-a',
  })
  await page.reload()
  await page.getByRole('button', { name: 'Changes', exact: false }).click()
  await expect(page.getByLabel('Saved plan')).toHaveValue(planID)
  await page.getByRole('button', { name: 'Add cable', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Cable endpoint A' })
    .selectOption({ label: 'EDGE-BROWSER · Port 1' })
  await page
    .getByRole('combobox', { name: 'Cable endpoint B' })
    .selectOption({ label: 'AGG-15 · Port 1' })
  await page.getByRole('button', { name: 'Save cable to plan' }).click()
  await expect(page.getByRole('status')).toContainText('revision 3')
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page
    .getByRole('combobox', { name: 'Start', exact: true })
    .selectOption({ label: 'EDGE-BROWSER · all ports' })
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(
    page.getByText('Physical path found', { exact: true }),
  ).toBeVisible()
  const response = await request.post(`/api/plans/${planID}/commands`, {
    data: {
      type: 'add_equipment',
      expectedRevision: '3',
      equipment: {
        name: 'OTHER-CLIENT',
        kind: 'switch',
        role: 'access',
        networkId: 'net-a',
        rackId: 'rack-dr02',
        unit: 4,
        height: 1,
        portCount: 2,
      },
    },
  })
  expect(response.status()).toBe(200)
  await page.getByRole('button', { name: 'Changes', exact: false }).click()
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click()
  await page.getByLabel('Equipment name', { exact: true }).fill('STALE-EDIT')
  await page.getByRole('combobox', { name: /^Network/ }).selectOption('net-a')
  await page.getByLabel('Starting unit', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Save equipment to plan' }).click()
  await expect(page.getByRole('alert')).toContainText('draft changed')
  await page.getByRole('button', { name: 'Refresh draft', exact: true }).click()
  const current = await (await request.get(`/api/plans/${planID}`)).json()
  expect(
    current.equipment.some((e: { name: string }) => e.name === 'STALE-EDIT'),
  ).toBe(false)
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(
    page.locator('.equipment-card').filter({ hasText: 'EDGE-BROWSER' }),
  ).toHaveCount(0)
})
