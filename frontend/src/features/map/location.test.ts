import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { cabledSummary, locationLabel, locationPath } from './location'

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
