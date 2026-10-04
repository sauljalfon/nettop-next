import { afterEach, expect, it, vi } from 'vitest'
import { getSnapshot, trace, sendPlanCommand, APIError } from './api'

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
