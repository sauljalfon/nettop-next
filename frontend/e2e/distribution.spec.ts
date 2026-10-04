import { expect, test } from '@playwright/test'
import type { Plan } from '../src/shared/types'

// Find AGG / BB in the UI: a proposed BB shows next to the installed AGG, each
// result names its destination, role (AGG/BB), and network. Mismatch and
// truncation rendering are unit-tested (the browser fixture has one network).
test('Find AGG / BB lists AGG then BB results with destination, role and network', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/plans', {
    data: { name: 'AGG and BB', expectedBaseRevision: 'sample-1' },
  })
  let plan = (await created.json()) as Plan
  const commands = `/api/plans/${plan.id}/commands`
  const send = async (data: object) => {
    const response = await request.post(commands, { data })
    expect(response.status()).toBe(200)
    plan = (await response.json()) as Plan
  }
  await send({
    type: 'add_equipment',
    expectedRevision: plan.revision,
    equipment: {
      name: 'BB-PROPOSED',
      kind: 'switch',
      role: 'backbone',
      networkId: 'net-prototype',
      rackId: 'rack-04',
      unit: 4,
      height: 1,
      portCount: 2,
    },
  })
  const bb = plan.equipment[0].id
  await send({
    type: 'add_cable',
    expectedRevision: plan.revision,
    cable: { a: 'edge-01:p2', b: `${bb}:p1` },
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByLabel('Saved plan').selectOption(plan.id)
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page
    .getByRole('combobox', { name: 'Start', exact: true })
    .selectOption({ label: 'EDGE-01 · all ports' })
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()

  const results = page.getByLabel('Trace results')
  await expect(results).toContainText('Physical path found')
  const options = results.locator('select option')
  await expect(options).toHaveText([
    'EDGE-01 · SFP+ 1 → AGG-02 · SFP+ 1 · AGG · Prototype network',
    'EDGE-01 · SFP+ 2 → BB-PROPOSED · Port 1 · BB · Prototype network',
  ])
  // The selected (first) route is the AGG; its destination card says so.
  await expect(results.getByTestId('route-destination')).toHaveText(
    'AGG-02 · AGG · Prototype network',
  )
  await results.locator('select').selectOption({ index: 1 })
  await expect(results.getByTestId('route-destination')).toHaveText(
    'BB-PROPOSED · BB · Prototype network',
  )
  await expect(results.getByTestId('mismatches')).toHaveCount(0)
  await expect(results.getByTestId('truncation')).toHaveCount(0)
})
