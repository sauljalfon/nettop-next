import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { layeredLayout } from './layout'

const col = (s: ReturnType<typeof layeredLayout>, id: string) => s.get(id)!.x

describe('C01 deterministic layered default layout', () => {
  const s = acceptanceSnapshot()
  const layout = layeredLayout(s, new Map())

  it('places access left, passive by cable distance, AGG/BB right', () => {
    expect(col(layout, 'EDGE-17')).toBe(col(layout, 'EDGE-22'))
    const x = (id: string) => col(layout, id)
    expect(x('EDGE-17')).toBeLessThan(x('PANEL-A'))
    expect(x('PANEL-A')).toBe(x('PANEL-DR'))
    expect(x('PANEL-A')).toBeLessThan(x('HDF-01'))
    expect(x('HDF-01')).toBeLessThan(x('HDF-02'))
    expect(x('HDF-02')).toBeLessThan(x('AGG-03'))
    for (const id of ['AGG-08', 'BB-01', 'AGG-12'])
      expect(x(id)).toBe(x('AGG-03'))
  })

  it('gives every card a distinct position', () => {
    const keys = [...layout.values()].map((p) => `${p.x},${p.y}`)
    expect(new Set(keys).size).toBe(s.equipment.length)
  })

  it('parks equipment unreachable from any access switch below the map', () => {
    const parked = layout.get('AGG-15')!
    const maxY = Math.max(
      ...s.equipment
        .filter((e) => e.id !== 'AGG-15')
        .map((e) => layout.get(e.id)!.y),
    )
    expect(parked.y).toBeGreaterThan(maxY)
  })

  it('orders a column by the average row of cabled neighbors, then by name', () => {
    const y = (id: string) => layout.get(id)!.y
    // AGG-03/08/BB-01 all hang off HDF-02, which is one card: they fall back to name order.
    expect(y('AGG-03')).toBeLessThan(y('AGG-08'))
    expect(y('AGG-08')).toBeLessThan(y('BB-01'))
    expect(y('EDGE-17')).toBeLessThan(y('EDGE-22'))
  })

  it('is deterministic regardless of input order', () => {
    const shuffled = {
      ...s,
      equipment: [...s.equipment].reverse(),
      links: [...s.links].reverse(),
      endpoints: [...s.endpoints].reverse(),
    }
    expect([...layeredLayout(shuffled, new Map())].sort()).toEqual(
      [...layout].sort(),
    )
  })
})

describe('layout only places cards without a position', () => {
  it('never recomputes existing positions', () => {
    const s = acceptanceSnapshot()
    const existing = new Map([['EDGE-17', { x: 5, y: 7 }]])
    const layout = layeredLayout(s, existing)
    expect(layout.has('EDGE-17')).toBe(false)
    expect(layout.size).toBe(s.equipment.length - 1)
  })

  it('does not collide with an existing card when placing a new one', () => {
    const s = acceptanceSnapshot()
    const full = layeredLayout(s, new Map())
    const existing = new Map(full)
    existing.delete('AGG-15')
    existing.set('AGG-12', full.get('AGG-15')!)
    const placed = layeredLayout(s, existing).get('AGG-15')!
    expect(placed).not.toEqual(existing.get('AGG-12'))
  })
})
