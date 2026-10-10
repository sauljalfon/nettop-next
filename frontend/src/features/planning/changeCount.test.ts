import { expect, it } from 'vitest'
import type { Plan } from '../../shared/types'
import { changeCount } from './changeCount'

const empty: Plan = {
  id: 'p',
  name: 'P',
  baseRevision: 'b',
  revision: '1',
  status: 'draft',
  equipment: [],
  subpanels: [],
  endpoints: [],
  links: [],
}

it('counts nothing for an empty draft, including plans without the v2 fields', () => {
  expect(changeCount(empty)).toBe(0)
  expect(changeCount(undefined)).toBe(0)
})

it('counts containers, equipment, placements, removals and cable additions', () => {
  const plan: Plan = {
    ...empty,
    sites: [{ id: 's', name: 'S' }],
    nodes: [{ id: 'n', name: 'N', siteId: 's' }],
    racks: [{ id: 'r', nodeId: 'n', name: 'R', units: 12 }],
    equipment: [
      {
        id: 'e',
        name: 'E',
        kind: 'switch',
        role: 'access',
        rackId: 'r',
        unit: 1,
        height: 1,
      },
    ],
    placements: [{ equipmentId: 'x', rackId: 'r', unit: 2 }],
    removals: {
      equipment: ['a', 'b'],
      links: ['c'],
      racks: ['d'],
      nodes: ['f'],
      sites: ['g'],
    },
    links: [
      { id: 'c1', a: '1', b: '2', kind: 'cable' },
      { id: 'br', a: '3', b: '4', kind: 'internal' }, // bridges belong to their equipment
    ],
  }
  // 3 containers + 1 equipment + 1 placement + 6 removals + 1 cable
  expect(changeCount(plan)).toBe(12)
})

it('still counts the legacy updates of a plan saved before placements', () => {
  const legacy: Plan = {
    ...empty,
    updates: [
      {
        id: 'x',
        name: 'X',
        kind: 'switch',
        role: 'access',
        rackId: 'r',
        unit: 1,
        height: 1,
      },
    ],
  }
  expect(changeCount(legacy)).toBe(1)
})
