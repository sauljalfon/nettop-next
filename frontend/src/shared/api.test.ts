import { afterEach, expect, it, vi } from 'vitest'
import {
  getHealth,
  getSnapshot,
  trace,
  sendPlanCommand,
  recordPlan,
  rebasePlan,
  removeChange,
  checkPlan,
  sendBatch,
  recordedPlansFor,
  APIError,
  createNetwork,
  fixInstalled,
  getChangeLog,
  getMapLayout,
  getSiteLayout,
  renameNetwork,
  resetMapLayout,
  resetSiteLayout,
  saveMapPosition,
  saveNodePosition,
} from './api'

afterEach(() => vi.unstubAllGlobals())

it('pins planned reads and traces to an explicit plan and topology revision', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
  await getSnapshot('planned', undefined, 'plan-123')
  expect(fetchMock.mock.calls[0][0]).toBe(
    '/api/topology?context=planned&planId=plan-123',
  )
  await trace(
    'planned',
    { mode: 'distribution', device: 'edge-01' },
    'plan-123',
    'base/plan-123@2',
  )
  expect(fetchMock.mock.calls[1][0]).toContain(
    'expectedRevision=base%2Fplan-123%402',
  )
})

it('exposes conflicts without retrying or changing the expected revision', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ error: 'Draft changed' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const command = {
    type: 'add_cable' as const,
    expectedRevision: '2',
    cable: { a: 'a', b: 'b' },
  }
  await expect(sendPlanCommand('p', command)).rejects.toMatchObject({
    status: 409,
    message: 'Draft changed',
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(command)
  expect(new APIError(409, 'conflict')).toBeInstanceOf(Error)
})

it('sends add_hdf with rows and rack height as independent fields', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ subpanels: [] }) })
  vi.stubGlobal('fetch', fetchMock)
  const command = {
    type: 'add_hdf' as const,
    expectedRevision: '1',
    hdf: { name: 'HDF-NEW', rackId: 'rack-03', unit: 3, height: 3, rows: 4 },
  }
  const plan = await sendPlanCommand('p', command)
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(command)
  expect(plan.subpanels).toEqual([])
})

it('PHY-14 client: reads a site layout and saves one node position by IDs', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ siteId: 's/1', positions: [] }),
  })
  vi.stubGlobal('fetch', fetchMock)
  await getSiteLayout('s/1')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/sites/s%2F1/layout')
  await saveNodePosition('s/1', 'n 2', { x: 1.5, y: -2 })
  const [url, init] = fetchMock.mock.calls[1]
  expect(url).toBe('/api/sites/s%2F1/layout/nodes/n%202')
  expect(init.method).toBe('PUT')
  expect(JSON.parse(init.body)).toEqual({ x: 1.5, y: -2 })
})

it('PHY-17 client: reset sends DELETE and surfaces the server error', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
  vi.stubGlobal('fetch', fetchMock)
  await resetSiteLayout('site-1')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/sites/site-1/layout')
  expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  fetchMock.mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ error: 'Site not found' }),
  })
  await expect(resetSiteLayout('gone')).rejects.toMatchObject({
    status: 404,
    message: 'Site not found',
  })
})

it('CM-01 client: reads the map layout, saves one node position by ID and resets', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ positions: [] }),
  })
  vi.stubGlobal('fetch', fetchMock)
  await getMapLayout()
  expect(fetchMock.mock.calls[0][0]).toBe('/api/map-layout')
  await saveMapPosition('n 2/x', { x: 1.5, y: -2 })
  const [url, init] = fetchMock.mock.calls[1]
  expect(url).toBe('/api/map-layout/nodes/n%202%2Fx')
  expect(init.method).toBe('PUT')
  expect(JSON.parse(init.body)).toEqual({ x: 1.5, y: -2 })
  fetchMock.mockResolvedValue({ ok: true, status: 204 })
  await resetMapLayout()
  expect(fetchMock.mock.calls[2][0]).toBe('/api/map-layout')
  expect(fetchMock.mock.calls[2][1].method).toBe('DELETE')
  fetchMock.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ error: 'boom' }),
  })
  await expect(resetMapLayout()).rejects.toMatchObject({
    status: 500,
    message: 'boom',
  })
})

it('NET-01/02/03 client: creates and renames networks and keeps the status on errors', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'network-x', name: 'C' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  await createNetwork('C')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/networks')
  expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: 'C' })
  await renameNetwork('net/a', 'Campus')
  expect(fetchMock.mock.calls[1][0]).toBe('/api/networks/net%2Fa')
  expect(fetchMock.mock.calls[1][1].method).toBe('PATCH')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    name: 'Campus',
  })
  fetchMock.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ error: 'duplicate name' }),
  })
  await expect(createNetwork('Network A')).rejects.toMatchObject({
    status: 409,
    message: 'duplicate name',
  })
})

it('ED-06 client: sends the new container and delete commands unchanged', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ id: 'p' }) })
  vi.stubGlobal('fetch', fetchMock)
  const commands = [
    {
      type: 'add_site' as const,
      expectedRevision: '1',
      site: { name: 'Annex' },
    },
    {
      type: 'add_rack' as const,
      expectedRevision: '2',
      rack: { nodeId: 'n', name: 'R1', units: 24 },
    },
    {
      type: 'disconnect_cable' as const,
      expectedRevision: '3',
      target: { id: 'cable-a03' },
    },
  ]
  for (const c of commands) await sendPlanCommand('p', c)
  expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body))).toEqual(
    commands,
  )
})

it('RC-01 client: records a plan with the expected revision and a note', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ plan: { id: 'p/1' }, installedRevision: 'rec-2' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const result = await recordPlan('p/1', '3', 'Installed on site', 'Dana Cohen')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/plans/p%2F1/record')
  expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    expectedRevision: '3',
    note: 'Installed on site',
    recordedBy: 'Dana Cohen',
  })
  expect(result.installedRevision).toBe('rec-2')
})

it('RC-02 client: a stale record is an APIError with the server message', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'Installed changed since this draft; update the draft first',
      }),
    }),
  )
  await expect(recordPlan('p', '1', 'x', 'Dana')).rejects.toMatchObject({
    status: 409,
    message: 'Installed changed since this draft; update the draft first',
  })
})

it('RB-01 client: updates a draft with the expected revision only', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'p', revision: '2' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  await rebasePlan('p', '1')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/plans/p/rebase')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    expectedRevision: '1',
  })
})

it('RB-02 client: a conflicting update carries the conflict list on the error', async () => {
  const conflicts = [
    { change: 'place_equipment:panel-a', reason: 'unknown equipment panel-a' },
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: '1 change(s) conflict', conflicts }),
    }),
  )
  const error = await rebasePlan('p', '1').catch((e) => e)
  expect(error).toBeInstanceOf(APIError)
  expect(error.status).toBe(409)
  expect(error.conflicts).toEqual(conflicts)
})

it('ED-12 client: remove_change goes to the commands endpoint and returns the removed keys', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      plan: { id: 'p', revision: '2' },
      removed: ['add_equipment:edge-18', 'add_cable:planned-cable-18'],
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const result = await removeChange('p', '1', 'add_equipment:edge-18')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/plans/p/commands')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    type: 'remove_change',
    expectedRevision: '1',
    change: { key: 'add_equipment:edge-18' },
  })
  expect(result.removed).toEqual([
    'add_equipment:edge-18',
    'add_cable:planned-cable-18',
  ])
})

it('ED-12 client: an unknown key is a 404 APIError', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'this draft has no change "x:y"' }),
    }),
  )
  await expect(removeChange('p', '1', 'x:y')).rejects.toMatchObject({
    status: 404,
  })
})

it('RC-06 client: check posts nothing and returns stale and the conflicts', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      stale: true,
      conflicts: [{ change: 'place_equipment:panel-a', reason: 'unknown' }],
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const result = await checkPlan('p/1')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/plans/p%2F1/check')
  expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  expect(result.stale).toBe(true)
  expect(result.conflicts[0].change).toBe('place_equipment:panel-a')
})

it('RC-08 client: lists recorded plans for an object by its ID', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => [{ id: 'expansion' }] })
  vi.stubGlobal('fetch', fetchMock)
  const plans = await recordedPlansFor('edge/18')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/plans?objectId=edge%2F18')
  expect(plans).toHaveLength(1)
})

it('BK-01 client: a batch goes to the commands endpoint with one revision and returns the IDs', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      plan: { id: 'p', revision: '4' },
      ids: ['cable-1', '', 'site-2'],
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const result = await sendBatch('p/1', '3', [
    { type: 'add_cable', cable: { a: 'a:p1', b: 'b:p1' } },
    { type: 'delete_equipment', target: { id: 'panel-a' } },
    { type: 'add_site', site: { name: 'Depot' } },
  ])
  expect(fetchMock.mock.calls[0][0]).toBe('/api/plans/p%2F1/commands')
  expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    type: 'batch',
    expectedRevision: '3',
    batch: {
      commands: [
        { type: 'add_cable', cable: { a: 'a:p1', b: 'b:p1' } },
        { type: 'delete_equipment', target: { id: 'panel-a' } },
        { type: 'add_site', site: { name: 'Depot' } },
      ],
    },
  })
  expect(result.ids).toEqual(['cable-1', '', 'site-2'])
})

it('BK-01 client: a failing command is a 422 APIError that names its position', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error:
          'invalid plan command: command 7 (add_cable): HDF-02 · 2B/3 rear is already cabled (cable-a04)',
      }),
    }),
  )
  await expect(
    sendBatch('p', '1', [{ type: 'add_site', site: { name: 'X' } }]),
  ).rejects.toMatchObject({
    status: 422,
    message: expect.stringContaining('command 7 (add_cable)'),
  })
})

it('reads the health answer, with the environment the API reports', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 'ok',
      storage: 'postgresql',
      environment: 'test',
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
  expect(await getHealth()).toEqual({
    status: 'ok',
    storage: 'postgresql',
    environment: 'test',
  })
  expect(fetchMock.mock.calls[0][0]).toBe('/api/health')
})

it('FX client: a direct fix PATCHes the plural path with only name, details and note', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ changes: [{ id: 1, field: 'name' }] }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const answer = await fixInstalled('endpoint', 'sw/1:p1', {
    name: 'Gi1/0/9',
    details: { state: 'faulty' },
    note: 'relabelled',
  })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/installed/endpoints/sw%2F1%3Ap1')
  expect(init.method).toBe('PATCH')
  expect(JSON.parse(init.body)).toEqual({
    name: 'Gi1/0/9',
    details: { state: 'faulty' },
    note: 'relabelled',
  })
  expect(answer.changes).toHaveLength(1)
})

it('FX client: history asks for one object by kind and ID', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => [] })
  vi.stubGlobal('fetch', fetchMock)
  await getChangeLog('rack', 'rack a03')
  expect(fetchMock.mock.calls[0][0]).toBe(
    '/api/change-log?entityKind=rack&entityId=rack%20a03',
  )
})
