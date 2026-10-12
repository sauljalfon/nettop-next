import { expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import {
  childCounts,
  containerIds,
  hdfPositions,
  installedHint,
  isProposed,
  parseHdfForm,
} from './containers'

const snapshot = acceptanceSnapshot()

it('counts what each container holds, so empty ones can offer Delete', () => {
  const counts = childCounts(snapshot)
  expect(counts.get('site-main')).toBe(3)
  expect(counts.get('node-core')).toBe(3)
  expect(counts.get('rack-a03')).toBe(2)
  expect(counts.get('rack-nothing')).toBeUndefined()
})

it('a container is PROPOSED only in a plan and only when not installed', () => {
  const installed = containerIds(snapshot)
  const plan = { context: 'planned' as const }
  expect(isProposed(plan, installed, 'site-new')).toBe(true)
  expect(isProposed(plan, installed, 'site-main')).toBe(false)
  expect(isProposed({ context: 'installed' }, installed, 'site-new')).toBe(
    false,
  )
})

it('the Installed hint names what a plan would allow', () => {
  expect(installedHint('add a site, node or rack')).toBe(
    'Installed is read-only. Open a plan to add a site, node or rack.',
  )
})

it('ED-11 checks the HDF form before sending and reports positions per side', () => {
  const ok = parseHdfForm({
    name: ' HDF-03 ',
    rows: '4',
    height: '3',
    rackId: 'rack-sm01',
    unit: '8',
  })
  expect(ok).toEqual({
    hdf: { name: 'HDF-03', rackId: 'rack-sm01', unit: 8, height: 3, rows: 4 },
  })
  const base = { name: 'H', rows: '4', height: '3', rackId: 'r', unit: '1' }
  expect(parseHdfForm({ ...base, name: ' ' })).toHaveProperty('error')
  expect(parseHdfForm({ ...base, rows: '0' })).toHaveProperty('error')
  expect(parseHdfForm({ ...base, rows: '33' })).toHaveProperty('error')
  expect(parseHdfForm({ ...base, rows: '2.5' })).toHaveProperty('error')
  expect(parseHdfForm({ ...base, height: '' })).toHaveProperty('error')
  expect(parseHdfForm({ ...base, rackId: '' })).toHaveProperty('error')
  expect(parseHdfForm({ ...base, unit: '0' })).toHaveProperty('error')
  expect(parseHdfForm({ ...base, rows: '32' })).toHaveProperty('hdf')
  expect(hdfPositions(4)).toBe(96)
})

it('shows the server’s reason without its technical prefix', async () => {
  const { errorMessage } = await import('./editing')
  expect(
    errorMessage(new Error('invalid plan command: site name already exists')),
  ).toBe('site name already exists')
  expect(
    errorMessage(new Error('this draft changed; refresh before trying again')),
  ).toBe('this draft changed; refresh before trying again')
  expect(errorMessage('boom')).toBe('Could not save. Check the API logs.')
})
