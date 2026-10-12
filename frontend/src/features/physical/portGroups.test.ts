import { describe, expect, it } from 'vitest'
import { facetKey, facetLabel } from '../map/facets'
import { cabledSummaries } from '../map/location'
import { indexSnapshot } from '../map/snapshotIndex'
import { inspectorGroups } from '../inspector/model'
import { pickerItems } from '../pathfinding/picker'
import { moveFocus, navCells } from './faceNav'
import { faceFor } from './equipmentModel'
import { physicalSnapshot, withGroupedSwitch } from './testFixture'

// Step 11b: a switch port may carry `position` (its order) and `portGroup`. Only
// `side` marks a panel position, so nothing may read "has a position" as "is a
// panel position".
const s = withGroupedSwitch(physicalSnapshot(), 'SW-G', 'rack-a03', 3, [
  { count: 2, prefix: 'Te1/1/', portType: 'fiber', speed: '10G' },
  { count: 3, prefix: 'Gi1/0/', portType: 'copper', speed: '1G' },
])
const index = indexSnapshot(s)
const port = (n: number) => s.endpoints.find((p) => p.id === `SW-G:p${n}`)!

describe('PG-04 a positioned switch port is still a device port', () => {
  it('keeps the endpoint ID as its facet key and its label as its name', () => {
    expect(facetKey(index.lookup, port(3))).toBe('SW-G:p3')
    expect(facetLabel(index.lookup, port(3))).toBe('Gi1/0/1')
  })

  it('counts each port as one unit in the cabled summary', () => {
    expect(cabledSummaries(s).get('SW-G')).toEqual({ cabled: 0, total: 5 })
  })

  it('lists the inspector Ports by position, even where the label order differs', () => {
    const [group] = inspectorGroups(s, index, 'SW-G')
    expect(group.id).toBe('ports')
    expect(group.units.map((u) => u.label)).toEqual([
      'Te1/1/1',
      'Te1/1/2',
      'Gi1/0/1',
      'Gi1/0/2',
      'Gi1/0/3',
    ])
  })

  it('lists a switch saved before groups in numeric label order, as before', () => {
    const [group] = inspectorGroups(s, index, 'EDGE-17')
    expect(group.units.slice(0, 3).map((u) => u.label)).toEqual(['1', '2', '3'])
    expect(group.units[9].label).toBe('10')
  })

  it("offers a switch's ports in the trace picker by position", () => {
    // The snapshot lists endpoints by ID (p1, p10, p2…), not in port order.
    const shuffled = { ...s, endpoints: [...s.endpoints].reverse() }
    const labels = pickerItems(shuffled, { devices: false })
      .filter((i) => i.value.startsWith('SW-G:'))
      .map((i) => i.label)
    expect(labels).toEqual([
      'SW-G · Te1/1/1',
      'SW-G · Te1/1/2',
      'SW-G · Gi1/0/1',
      'SW-G · Gi1/0/2',
      'SW-G · Gi1/0/3',
    ])
  })

  it('navigates the banks left to right, odd above even in each', () => {
    const face = faceFor(index, { id: 'SW-G', kind: 'switch' }, undefined, {})
    const cells = navCells(face)
    const at = (n: number) => cells.find((c) => c.id === `SW-G:p${n}`)!
    // Bank 1 (2 ports, one column); a one-column gap; bank 2 (3 ports) to its right.
    expect([at(1).row, at(1).col, at(2).row, at(2).col]).toEqual([0, 0, 1, 0])
    expect([
      at(3).row,
      at(3).col,
      at(4).row,
      at(4).col,
      at(5).row,
      at(5).col,
    ]).toEqual([0, 2, 1, 2, 0, 3])
  })

  it('moves focus across the gap into the next bank', () => {
    const cells = navCells(
      faceFor(index, { id: 'SW-G', kind: 'switch' }, undefined, {}),
    )
    expect(moveFocus(cells, 'SW-G:p1', 'ArrowRight')).toBe('SW-G:p3')
    expect(moveFocus(cells, 'SW-G:p3', 'ArrowLeft')).toBe('SW-G:p1')
    expect(moveFocus(cells, 'SW-G:p1', 'End')).toBe('SW-G:p4')
  })
})
