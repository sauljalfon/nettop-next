import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { pick } from './helpers'

const getPlan = async (request: APIRequestContext, id: string) =>
  (await request.get(`/api/plans/${id}`)).json()

/** Opens the library's Access switch form. */
async function openSwitchForm(page: Page) {
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Access switch…' }).click()
  return page.getByTestId('equipment-form')
}

test('save a plan, add equipment through the library form, reload, and reject stale edits', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'New draft', exact: true }).click()
  await page.getByLabel('Draft name').fill('Browser persistence check')
  await page.getByRole('button', { name: 'Create draft', exact: true }).click()
  await expect(page.getByLabel('Draft', { exact: true })).toContainText(
    'Browser persistence check',
  )
  const planID = await page.getByLabel('Draft', { exact: true }).inputValue()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()

  const form = await openSwitchForm(page)
  await form.getByLabel('Name').fill('EDGE-BROWSER')
  // A switch needs its network: the form says so and sends nothing.
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(form.getByTestId('edit-error')).toContainText('network')
  expect((await getPlan(request, planID)).revision).toBe('1')
  await form.getByLabel('Network').selectOption('net-a')
  await form.getByLabel('Rack', { exact: true }).selectOption('rack-a03')
  await form.getByLabel('Unit', { exact: true }).fill('4')
  await form.getByLabel('Ports').fill('2')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(page.getByRole('status')).toContainText('revision 2')
  const saved = await getPlan(request, planID)
  expect(saved.equipment[0]).toMatchObject({
    name: 'EDGE-BROWSER',
    role: 'access',
    networkId: 'net-a',
    rackId: 'rack-a03',
    unit: 4,
  })
  // A cable (the endpoint detail's Connect… is covered by ED-09).
  const cabled = await request.post(`/api/plans/${planID}/commands`, {
    data: {
      type: 'add_cable',
      expectedRevision: '2',
      cable: { a: `${saved.equipment[0].id}:p1`, b: 'agg-15:p1' },
    },
  })
  expect(cabled.status()).toBe(200)
  await page.reload()
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await pick(page, 'Start', 'edge-browser all ports')
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
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  const stale = await openSwitchForm(page)
  await stale.getByLabel('Name').fill('STALE-EDIT')
  await stale.getByLabel('Network').selectOption('net-a')
  await stale.getByLabel('Rack', { exact: true }).selectOption('rack-a03')
  await stale.getByLabel('Unit', { exact: true }).fill('5')
  await stale.getByRole('button', { name: 'Add to plan' }).click()
  // The server says the draft changed (in its own words); the edit is not retried.
  await expect(stale.getByTestId('edit-error')).toContainText('draft changed')
  const current = await (await request.get(`/api/plans/${planID}`)).json()
  expect(
    current.equipment.some((e: { name: string }) => e.name === 'STALE-EDIT'),
  ).toBe(false)
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(
    page.locator('.equipment-card').filter({ hasText: 'EDGE-BROWSER' }),
  ).toHaveCount(0)
})
