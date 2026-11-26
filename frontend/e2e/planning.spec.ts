import { expect, test, type APIRequestContext, type Page } from './fixtures'
import { findAggBb, leaveTrace, traceRoutes } from './helpers'
import { addBox, boxAdd, BUILDING_A_RACK, pickAndOpenBox } from './add-box'
import { createModel, modelInput } from './models-api'
import { unique } from './plan-api'

const getPlan = async (request: APIRequestContext, id: string) =>
  (await request.get(`/api/plans/${id}`)).json()

test('save a plan, add equipment through the box at a unit, reload, and reject stale edits', async ({
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

  const model = await createModel(request, modelInput(unique('PLAN')))
  await pickAndOpenBox(page, model.name, BUILDING_A_RACK, 4)
  const box = addBox(page)
  await box.getByLabel('Name').fill('EDGE-BROWSER')
  // The rack's other switch is on Network A: the box starts there.
  await expect(box.getByLabel('Network')).toHaveValue('net-a')
  await boxAdd(page).click()
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
  await findAggBb(page, 'EDGE-BROWSER')
  await expect(traceRoutes(page)).toHaveCount(1)
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
  await leaveTrace(page)
  await pickAndOpenBox(page, model.name, BUILDING_A_RACK, 5)
  const stale = addBox(page)
  await stale.getByLabel('Name').fill('STALE-EDIT')
  await boxAdd(page).click()
  // The server says the draft changed (in its own words); the edit is not retried.
  await expect(stale.getByTestId('edit-error')).toContainText('draft changed')
  const current = await (await request.get(`/api/plans/${planID}`)).json()
  expect(
    current.equipment.some((e: { name: string }) => e.name === 'STALE-EDIT'),
  ).toBe(false)
  // Back on the map: the box was a Physical thing.
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  // The plan's switch is cabled to AGG-15, so Building A has a card under AGG-15; Installed does not have it.
  const building = page.locator('[data-card-key="agg-15|node-building-a"]')
  await expect(building).toContainText('Building A')
  await building.click()
  const added = page
    .getByTestId('hierarchy-drawer')
    .getByRole('button', { name: /EDGE-BROWSER/ })
  await expect(added).toHaveCount(1)
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(building).toHaveCount(0)
  await expect(
    page.locator('[data-card-key="agg-03+agg-08|node-building-a"]'),
  ).toBeVisible()
})
