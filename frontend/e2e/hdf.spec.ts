import { expect, test } from '@playwright/test'
import type { Plan, Snapshot, TraceResult } from '../src/shared/types'

// API-level browser-suite check of atomic HDF creation against the real test
// server. There is no HDF creation UI until a later checkpoint.
test('add_hdf creates a complete proposed grid, rejects bad rows, and traces', async ({
  request,
}) => {
  const created = await request.post('/api/plans', {
    data: { name: 'HDF via API', expectedBaseRevision: 'acceptance-1' },
  })
  expect(created.status()).toBe(201)
  let plan = (await created.json()) as Plan
  const commands = `/api/plans/${plan.id}/commands`
  const hdf = (rows: number, unit = 3) => ({
    type: 'add_hdf',
    expectedRevision: plan.revision,
    hdf: { name: 'HDF-E2E', rackId: 'rack-a03', unit, height: 3, rows },
  })

  for (const rows of [0, 33]) {
    expect((await request.post(commands, { data: hdf(rows) })).status()).toBe(
      422,
    )
  }
  expect((await request.post(commands, { data: hdf(2, 7) })).status()).toBe(422) // collides with EDGE-17
  plan = await (await request.get(`/api/plans/${plan.id}`)).json()
  expect(plan.revision).toBe('1')
  expect(plan.subpanels ?? []).toHaveLength(0)

  const saved = await request.post(commands, { data: hdf(4) })
  expect(saved.status()).toBe(200)
  plan = (await saved.json()) as Plan
  expect([
    plan.subpanels?.length,
    plan.endpoints.length,
    plan.links.length,
  ]).toEqual([16, 192, 96])

  const planned = (await (
    await request.get(`/api/topology?context=planned&planId=${plan.id}`)
  ).json()) as Snapshot
  const installed = (await (
    await request.get('/api/topology')
  ).json()) as Snapshot
  // HDF-01 (16) and HDF-02 (12) are installed; the plan adds 16 more.
  expect(planned.subpanels).toHaveLength(44)
  expect(installed.subpanels).toHaveLength(28)
  expect(planned.equipment.find((e) => e.name === 'HDF-E2E')).toMatchObject({
    role: 'passive',
    height: 3,
  })

  const endpoint = (side: 'front' | 'rear') => {
    const subpanel = plan.subpanels!.find(
      (s) => s.row === 3 && s.column === 'C',
    )!
    return plan.endpoints.find(
      (e) =>
        e.subpanelId === subpanel.id && e.position === 5 && e.side === side,
    )!.id
  }
  for (const cable of [
    { a: 'edge-17:p5', b: endpoint('front') },
    { a: endpoint('rear'), b: 'agg-03:p2' },
  ]) {
    const response = await request.post(commands, {
      data: { type: 'add_cable', expectedRevision: plan.revision, cable },
    })
    expect(response.status()).toBe(200)
    plan = (await response.json()) as Plan
  }
  const trace = (await (
    await request.post(`/api/traces?context=planned&planId=${plan.id}`, {
      data: { mode: 'distribution', start: 'edge-17:p5' },
    })
  ).json()) as TraceResult
  expect(trace.routes).toHaveLength(1)
  expect(trace.routes[0].hops.map((h) => h.kind)).toEqual([
    'cable',
    'internal',
    'cable',
  ])
})
