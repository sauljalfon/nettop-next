import { expect, type APIRequestContext } from '@playwright/test'

/** Draft setup straight through the API, on whatever installed revision the server has now. */
export async function installedRevision(request: APIRequestContext) {
  return (await (await request.get('/api/topology?context=installed')).json())
    .revision as string
}

export async function newPlan(request: APIRequestContext, name: string) {
  const response = await request.post('/api/plans', {
    data: { name, expectedBaseRevision: await installedRevision(request) },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

export const getPlan = async (request: APIRequestContext, id: string) =>
  (await request.get(`/api/plans/${id}`)).json()

/** Sends one command with the draft's current revision; returns the saved plan. */
export async function command(
  request: APIRequestContext,
  planId: string,
  body: Record<string, unknown>,
) {
  const plan = await getPlan(request, planId)
  const response = await request.post(`/api/plans/${planId}/commands`, {
    data: { ...body, expectedRevision: plan.revision },
  })
  expect(response.status(), await response.text()).toBe(200)
  const saved = await response.json()
  return saved.plan ?? saved
}

export async function record(
  request: APIRequestContext,
  planId: string,
  note = 'Recorded through the API',
  recordedBy = 'API test',
) {
  const plan = await getPlan(request, planId)
  const response = await request.post(`/api/plans/${planId}/record`, {
    data: { expectedRevision: plan.revision, note, recordedBy },
  })
  expect(response.status(), await response.text()).toBe(200)
  return response.json()
}

/** A name no other spec uses. */
export const unique = (word: string) =>
  `${word} ${Math.random().toString(36).slice(2, 7).toUpperCase()}`

/** A site, node and 24U rack that only this draft knows; returns their IDs. */
export async function addRoom(
  request: APIRequestContext,
  planId: string,
  label: string,
) {
  const site = (
    await command(request, planId, {
      type: 'add_site',
      site: { name: `${label} Site` },
    })
  ).sites.at(-1)
  const node = (
    await command(request, planId, {
      type: 'add_node',
      node: { siteId: site.id, name: `${label} Hall` },
    })
  ).nodes.at(-1)
  const rack = (
    await command(request, planId, {
      type: 'add_rack',
      rack: { nodeId: node.id, name: `${label} R1`, units: 24 },
    })
  ).racks.at(-1)
  return {
    siteId: site.id as string,
    nodeId: node.id as string,
    rackId: rack.id as string,
  }
}

export async function addSwitch(
  request: APIRequestContext,
  planId: string,
  rackId: string,
  name: string,
  unit: number,
  portCount = 4,
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
      portCount,
    },
  })
  return plan.equipment.find((e: { name: string }) => e.name === name)
    .id as string
}
