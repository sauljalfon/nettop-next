import { afterEach, expect, it, vi } from 'vitest'
import {
  getSnapshot,
  trace,
  sendPlanCommand,
  APIError,
  createNetwork,
  getSiteLayout,
  renameNetwork,
  resetSiteLayout,
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
