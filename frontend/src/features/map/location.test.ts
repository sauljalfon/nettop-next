import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import type { Snapshot } from '../../shared/types'
import { cabledSummaries, locationLabel, locationPath } from './location'

const cabledSummary = (s: Snapshot, id: string) =>
  cabledSummaries(s).get(id) ?? { cabled: 0, total: 0 }

// The original per-equipment algorithm, kept as the reference for the one-pass version.
function referenceSummary(s: Snapshot, equipmentId: string) {
  const cabled = new Set<string>()
  for (const l of s.links) {
    if (l.kind !== 'cable') continue
    cabled.add(l.a)
    cabled.add(l.b)
  }
  const units = new Map<string, boolean>()
  for (const p of s.endpoints) {
    if (p.equipmentId !== equipmentId) continue
    const unit =
      p.position === undefined ? p.id : `${p.subpanelId ?? ''}/${p.position}`
    units.set(unit, (units.get(unit) ?? false) || cabled.has(p.id))
  }
  return {
    cabled: [...units.values()].filter(Boolean).length,
    total: units.size,
  }
}

describe('C01 every card carries its location and cabling summary', () => {
  const s = acceptanceSnapshot()

  it('labels the site / node / rack of each equipment', () => {
    expect(locationLabel(s, 'EDGE-17')).toBe(
      'Main Campus / Building A / Rack A03',
    )
    expect(locationLabel(s, 'AGG-12')).toBe(
      'DR Site / DR Distribution / Rack DR02',
    )
    expect(locationPath(s, 'HDF-01')).toBe(
      'Main Campus / North Sub-main / Rack SM01 / HDF-01',
    )
  })

  it('reports "N of M cabled" in device ports', () => {
    expect(cabledSummary(s, 'EDGE-17')).toEqual({ cabled: 3, total: 24 })
    expect(cabledSummary(s, 'AGG-15')).toEqual({ cabled: 0, total: 24 })
  })

  it('counts a panel or HDF position once, cabled on either side', () => {
    expect(cabledSummary(s, 'PANEL-A')).toEqual({ cabled: 3, total: 24 })
    expect(cabledSummary(s, 'HDF-01')).toEqual({ cabled: 4, total: 6 })
  })

  it('is empty for unknown or unplaced equipment', () => {
    expect(locationLabel(s, 'nope')).toBe('')
    expect(cabledSummary(s, 'nope')).toEqual({ cabled: 0, total: 0 })
  })
})

describe('cabledSummaries computes every equipment in one pass', () => {
  it('matches the per-equipment reference for every equipment', () => {
    const s = acceptanceSnapshot()
    const all = cabledSummaries(s)
    for (const e of s.equipment)
      expect(all.get(e.id)).toEqual(referenceSummary(s, e.id))
  })

  it('has no entry for equipment without endpoints', () => {
    const s = acceptanceSnapshot()
    s.equipment.push({ ...s.equipment[0], id: 'EMPTY', name: 'EMPTY' })
    expect(cabledSummaries(s).has('EMPTY')).toBe(false)
  })

  it('scales linearly: a large snapshot summarizes quickly', () => {
    const s = acceptanceSnapshot()
    for (let i = 0; i < 400; i++) {
      const id = `BULK-${i}`
      s.equipment.push({ ...s.equipment[0], id, name: id })
      for (let n = 1; n <= 24; n++)
        s.endpoints.push({
          id: `${id}:p${n}`,
          equipmentId: id,
          label: String(n),
        })
      s.links.push({
        id: `bulk-${i}`,
        kind: 'cable',
        a: `${id}:p1`,
        b: `${id}:p2`,
      })
    }
    const started = performance.now()
    const all = cabledSummaries(s)
    expect(performance.now() - started).toBeLessThan(500)
    expect(all.get('BULK-7')).toEqual({ cabled: 2, total: 24 })
  })
})
