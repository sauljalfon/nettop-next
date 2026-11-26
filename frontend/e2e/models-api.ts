import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { command } from './plan-api'

/** C9300-style model: 48 copper RJ45 1G + 4 fiber SFP+ 10G (52 ports, two groups). */
export const modelInput = (name: string, manufacturer = 'Cisco') => ({
  name,
  manufacturer,
  height: 1,
  portGroups: [
    {
      count: 48,
      names: 'Gi1/0/{n}',
      start: 1,
      details: { portType: 'copper', connector: 'RJ45', speed: '1G' },
    },
    {
      count: 4,
      names: 'Te1/1/{n}',
      start: 1,
      details: { portType: 'fiber', connector: 'SFP+', speed: '10G' },
    },
  ],
})

export async function createModel(
  request: APIRequestContext,
  input: ReturnType<typeof modelInput>,
) {
  const response = await request.post('/api/switch-models', { data: input })
  expect(response.status(), await response.text()).toBe(201)
  return (await response.json()) as { id: string; name: string }
}

/** A switch the plan adds with `count` ports "Port n" at positions 1…count, in one group. */
export async function addPositionedSwitch(
  request: APIRequestContext,
  planId: string,
  rackId: string,
  name: string,
  unit: number,
  count = 52,
) {
  const plan = await command(request, planId, {
    type: 'add_equipment',
    equipment: {
      name,
      kind: 'switch',
      role: 'access',
      networkId: 'net-a',
      rackId,
      unit,
      height: 1,
      portGroups: [{ count, names: 'Port {n}' }],
    },
  })
  return plan.equipment.find((e: { name: string }) => e.name === name)
    .id as string
}

/** Direct fixes on Installed, in one request (kinds as the API names them: equipment, endpoints). */
export async function fixes(
  request: APIRequestContext,
  list: Record<string, unknown>[],
  note?: string,
) {
  const response = await request.post('/api/installed/fixes', {
    data: { fixes: list, ...(note ? { note } : {}) },
  })
  expect(response.status(), await response.text()).toBe(200)
}

export async function installedPorts(
  request: APIRequestContext,
  equipmentId: string,
) {
  const snapshot = await (
    await request.get('/api/topology?context=installed')
  ).json()
  return (
    snapshot.endpoints as {
      id: string
      equipmentId: string
      label: string
      position?: number
      portGroup?: number
      portType?: string
      speed?: string
    }[]
  )
    .filter((p) => p.equipmentId === equipmentId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

export const changeLog = async (
  request: APIRequestContext,
  kind: 'equipment' | 'endpoint',
  id: string,
) =>
  (await (
    await request.get(`/api/change-log?entityKind=${kind}&entityId=${id}`)
  ).json()) as {
    field: string
    oldValue: string
    newValue: string
    note?: string
  }[]

/** The Switch models page from a plan: the Add tab's Manage models… link. */
export async function openModelsFromPlan(page: Page, planId: string) {
  await page.goto(`/?plan=${planId}`)
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Manage models…' }).click()
  await expect(page.getByTestId('models-page')).toBeVisible()
}
