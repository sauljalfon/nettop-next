import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { readableEndpoint } from './hops'

describe('TR-02 endpoint labels are readable', () => {
  const s = acceptanceSnapshot()

  it('a position reads equipment, position and side from the structure, not from the stored label', () => {
    const odd = {
      ...s,
      endpoints: s.endpoints.map((e) =>
        e.id === 'PANEL-A:1:f'
          ? { ...e, label: '1 · Front' }
          : e.id === 'HDF-01:3C/5:r'
            ? { ...e, label: 'sp 3C pos 5 (rear)' }
            : e,
      ),
    }
    const index = indexSnapshot(odd)
    expect(readableEndpoint(index, 'PANEL-A:1:f')).toBe('PANEL-A · 1 front')
    expect(readableEndpoint(index, 'HDF-01:3C/5:r')).toBe('HDF-01 · 3C/5 rear')
  })

  it('a device port reads equipment and its own label', () => {
    expect(readableEndpoint(indexSnapshot(s), 'EDGE-17:p1')).toBe('EDGE-17 · 1')
  })

  it('an unknown endpoint reads as its ID', () => {
    expect(readableEndpoint(indexSnapshot(s), 'nope')).toBe('nope')
  })
})
