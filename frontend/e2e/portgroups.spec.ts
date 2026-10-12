import { expect, test, type Page } from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'
import { command, getPlan, newPlan, unique } from './plan-api'

// Step 11b: real interface names (Gi1/0/1, Te1/1/1) and mixed port types.
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/pg-${name}.png` })
const box = (page: Page, name: string) =>
  page.getByRole('group', { name, exact: true })

/** A draft with SW-G (24 × Gi1/0/{n} copper 1G + 4 × Te1/1/{n} fiber 10G) at U3 of Rack A03. */
async function draftWithGroupedSwitch(
  request: Parameters<typeof newPlan>[0],
  extra: Record<string, unknown> = {},
  accessPorts = 24,
) {
  const id = await newPlan(request, unique('Groups'))
  const plan = await command(request, id, {
    type: 'add_equipment',
    equipment: {
      name: 'SW-G',
      kind: 'switch',
      role: 'access',
      networkId: 'net-a',
      rackId: 'rack-a03',
      unit: 3,
      height: 1,
      portGroups: [
        {
          count: accessPorts,
          names: 'Gi1/0/{n}',
          details: { portType: 'copper', connector: 'RJ45', speed: '1G' },
        },
        {
          count: 4,
          names: 'Te1/1/{n}',
          details: { portType: 'fiber', connector: 'SFP+', speed: '10G' },
        },
      ],
      ...extra,
    },
  })
  const equipment = plan.equipment.find(
    (e: { name: string }) => e.name === 'SW-G',
  )
  return { id, switchId: equipment.id as string }
}

async function openSwitch(page: Page, planId: string, switchId: string) {
  await page.goto(`/?plan=${planId}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator(`.rack-block[data-equipment-id="${switchId}"]`).click()
}

test('PG-06 the Add form: port group rows, a one-line summary, and the ports it makes', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Form'))
  await page.goto(`/?plan=${id}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Access switch…' }).click()
  const form = page.getByTestId('equipment-form')
  await form.getByLabel('Name', { exact: true }).fill('SW-FORM')
  await form.getByLabel('Network').selectOption('net-a')
  await form.getByLabel('Rack', { exact: true }).selectOption('rack-a03')
  await form.getByLabel('Unit', { exact: true }).fill('3')

  // The plain Ports count turns into groups: the same ports as "Port {n}", plus an empty row.
  await form.getByLabel('Ports', { exact: true }).fill('24')
  await form.getByRole('button', { name: '+ Add port group' }).click()
  await expect(form.getByLabel('Ports', { exact: true })).toHaveCount(0)
  const rows = form.getByTestId('port-group-row')
  await expect(rows).toHaveCount(2)
  await expect(form.getByTestId('port-summary')).toHaveText(
    '24 ports: Port 1 … Port 24',
  )

  const first = box(page, 'Port group 1')
  await first.getByLabel('Names', { exact: true }).fill('Gi1/0/{n}')
  await first.getByLabel('Type').selectOption('copper')
  await first.getByLabel('Connector').fill('RJ45')
  await first.getByLabel('Speed').fill('1G')
  const second = box(page, 'Port group 2')
  await second.getByLabel('Count').fill('4')
  await second.getByLabel('Names', { exact: true }).fill('Te1/1/{n}')
  await second.getByLabel('Type').selectOption('fiber')
  await second.getByLabel('Connector').fill('SFP+')
  await second.getByLabel('Speed').fill('10G')
  await expect(form.getByTestId('port-summary')).toHaveText(
    '28 ports: Gi1/0/1 … Gi1/0/24, Te1/1/1 … Te1/1/4',
  )
  await shot(page, 'form')

  // A mistake is said in words, before anything is sent.
  await second.getByLabel('Names', { exact: true }).fill('Te1/1/')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(form.getByTestId('edit-error')).toHaveText(
    'Port group 2: Names must contain {n} once.',
  )
  await second.getByLabel('Names', { exact: true }).fill('Te1/1/{n}')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(form).toHaveCount(0)

  const plan = await getPlan(request, id)
  const ports = plan.endpoints.filter(
    (p: { equipmentId: string }) => p.equipmentId === plan.equipment[0].id,
  )
  expect(ports).toHaveLength(28)
  expect(ports[0]).toMatchObject({
    label: 'Gi1/0/1',
    position: 1,
    portGroup: 1,
    portType: 'copper',
    connector: 'RJ45',
    speed: '1G',
  })
  expect(ports[27]).toMatchObject({
    label: 'Te1/1/4',
    position: 28,
    portGroup: 2,
    portType: 'fiber',
    connector: 'SFP+',
    speed: '10G',
  })
})

test('PG-04 the faceplate draws one bank per group with its caption; a switch without groups is one bank', async ({
  page,
  request,
}) => {
  const { id, switchId } = await draftWithGroupedSwitch(request)
  await openSwitch(page, id, switchId)
  const banks = page.getByTestId('port-bank')
  await expect(banks).toHaveCount(2)
  await expect(page.getByTestId('bank-caption')).toHaveText([
    'Gi1/0/1–Gi1/0/24 · copper · 1G',
    'Te1/1/1–Te1/1/4 · fiber · 10G',
  ])
  await expect(banks.nth(0).getByTestId('face-endpoint')).toHaveCount(24)
  await expect(banks.nth(1).getByTestId('face-endpoint')).toHaveCount(4)
  // The jack is named by its label, not by a number.
  await expect(
    banks.nth(1).getByTestId('face-endpoint').first(),
  ).toHaveAttribute('title', /port Te1\/1\/1/)
  // Side by side: the uplinks to the right of the access ports, captions above.
  const first = (await banks.nth(0).boundingBox())!
  const uplinks = (await banks.nth(1).boundingBox())!
  expect(uplinks.x).toBeGreaterThan(first.x + first.width + 8)
  // Their jacks line up, whatever the captions take.
  const jack = async (i: number) =>
    (await banks.nth(i).getByTestId('face-endpoint').first().boundingBox())!
  expect(Math.abs((await jack(1)).y - (await jack(0)).y)).toBeLessThan(2)
  await shot(page, 'faceplate')

  // An installed switch made before groups is one bank, with no caption.
  await page.goto(`/?plan=${id}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block[data-equipment-id="edge-17"]').click()
  await expect(page.getByTestId('port-bank')).toHaveCount(1)
  await expect(page.getByTestId('bank-caption')).toHaveCount(0)
  await shot(page, 'faceplate-plain')
})

test('PG-04 banks that do not fit the face wrap onto the next row: 48 + 4', async ({
  page,
  request,
}) => {
  const { id, switchId } = await draftWithGroupedSwitch(request, {}, 48)
  await openSwitch(page, id, switchId)
  const banks = page.getByTestId('port-bank')
  // The 48 access ports are two blocks of 24 (one caption); the uplinks are the third block.
  await expect(banks).toHaveCount(3)
  await expect(page.getByTestId('bank-caption')).toHaveText([
    'Gi1/0/1–Gi1/0/48 · copper · 1G',
    'Te1/1/1–Te1/1/4 · fiber · 10G',
  ])
  const [one, two, up] = await Promise.all(
    [0, 1, 2].map((i) => banks.nth(i).boundingBox()),
  )
  expect(two!.y).toBeGreaterThan(one!.y + one!.height - 2) // wrapped below the first block
  expect(up!.x).toBeGreaterThan(two!.x + two!.width + 8) // uplinks to the right of the second block
  const jack = async (i: number) =>
    (await banks.nth(i).getByTestId('face-endpoint').first().boundingBox())!
  expect(Math.abs((await jack(2)).y - (await jack(1)).y)).toBeLessThan(2)
  await expect(page.getByTestId('bank-row')).toHaveCount(2)
  await shot(page, 'faceplate-wrap')

  // Keyboard follows what is seen: along the second row of banks across the gap,
  // and down from the first block into the next row of banks.
  await page.locator(`[data-endpoint-id="${switchId}:p47"]`).focus()
  await page.keyboard.press('ArrowRight')
  await expect(
    page.locator(`[data-endpoint-id="${switchId}:p49"]`),
  ).toBeFocused()
  await page.locator(`[data-endpoint-id="${switchId}:p24"]`).focus()
  await page.keyboard.press('ArrowDown')
  await expect(
    page.locator(`[data-endpoint-id="${switchId}:p47"]`),
  ).toBeFocused()
})

test('PG-03 Connect a range from Gi1/0/23 with count 4 runs Gi1/0/23, Gi1/0/24, Te1/1/1, Te1/1/2', async ({
  page,
  request,
}) => {
  const { id, switchId } = await draftWithGroupedSwitch(request)
  await openSwitch(page, id, switchId)
  await page.locator(`[data-endpoint-id="${switchId}:p23"]`).click()
  await page.getByRole('button', { name: 'Connect a range…' }).click()
  const range = box(page, 'Connect a range')
  await range.getByLabel('Count').fill('4')
  const combo = range.getByRole('combobox')
  await combo.fill('panel-a 4 front')
  await page
    .getByRole('option', { name: 'PANEL-A · 4 · Front', exact: true })
    .click()
  const pairs = range.getByTestId('range-pairs').locator('li')
  await expect(pairs).toHaveCount(4)
  await expect(pairs).toHaveText([
    /Gi1\/0\/23 →/,
    /Gi1\/0\/24 →/,
    /Te1\/1\/1 →/,
    /Te1\/1\/2 →/,
  ])
  await shot(page, 'range')
  await range.getByRole('button', { name: 'Connect 4' }).click()
  await expect(range).toHaveCount(0)
  const plan = await getPlan(request, id)
  const ends = plan.links
    .filter((l: { kind: string }) => l.kind === 'cable')
    .map((l: { a: string; b: string }) =>
      [l.a, l.b].find((x) => x.startsWith(switchId)),
    )
    .sort()
  expect(ends).toEqual([23, 24, 25, 26].map((n) => `${switchId}:p${n}`).sort())
})

test('PG-05 Duplicate keeps the groups and their port types, and never a serial number', async ({
  page,
  request,
}) => {
  const { id, switchId } = await draftWithGroupedSwitch(request, {
    details: {
      serialNumber: 'SN-PG-5',
      ipAddress: '10.9.9.9',
      description: 'the original',
    },
  })
  await openSwitch(page, id, switchId)
  await page.getByRole('button', { name: 'Duplicate SW-G…' }).click()
  const dup = box(page, 'Duplicate')
  await expect(dup.getByTestId('copy-preview').locator('li')).toHaveCount(1)
  await dup.getByRole('button', { name: 'Duplicate 1' }).click()
  await expect(dup).toHaveCount(0)

  const plan = await getPlan(request, id)
  const copy = plan.equipment.find((e: { name: string }) => e.name === 'SW-G-2')
  expect(copy).toBeTruthy()
  expect(copy.serialNumber).toBeUndefined()
  expect(copy.ipAddress).toBeUndefined()
  expect(copy.description).toBeUndefined()
  const ports = plan.endpoints.filter(
    (p: { equipmentId: string }) => p.equipmentId === copy.id,
  )
  expect(ports).toHaveLength(28)
  expect(ports[0]).toMatchObject({
    label: 'Gi1/0/1',
    position: 1,
    portGroup: 1,
    portType: 'copper',
    connector: 'RJ45',
    speed: '1G',
  })
  expect(ports[24]).toMatchObject({
    label: 'Te1/1/1',
    position: 25,
    portGroup: 2,
    portType: 'fiber',
    connector: 'SFP+',
    speed: '10G',
  })
  for (const p of ports) {
    expect(p.state).toBeUndefined()
    expect(p.description).toBeUndefined()
  }
  // Both banks show on the copy's faceplate.
  await page.goto(`/?plan=${id}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator(`.rack-block[data-equipment-id="${copy.id}"]`).click()
  await expect(page.getByTestId('bank-caption')).toHaveText([
    'Gi1/0/1–Gi1/0/24 · copper · 1G',
    'Te1/1/1–Te1/1/4 · fiber · 10G',
  ])
})
