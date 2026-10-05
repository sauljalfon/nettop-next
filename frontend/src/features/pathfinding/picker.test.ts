import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { matchPicker, pickerItems } from './picker'

const s = acceptanceSnapshot()
const withDevices = pickerItems(s, { devices: true })
const endpointsOnly = pickerItems(s, { devices: false })
const labels = (query: string, limit?: number, items = withDevices) =>
  matchPicker(items, query, limit).matches.map((m) => m.label)

describe("POL-12 the trace picker's per-snapshot list", () => {
  it('offers switches as "<name> · all ports" in distribution mode, and no panel or HDF', () => {
    const devices = withDevices.filter((i) => i.value.startsWith('device:'))
    expect(devices.map((d) => d.label).sort()).toEqual([
      'AGG-03 · all ports',
      'AGG-08 · all ports',
      'AGG-12 · all ports',
      'AGG-15 · all ports',
      'BB-01 · all ports',
      'EDGE-17 · all ports',
      'EDGE-22 · all ports',
    ])
    expect(devices[0].value).toBe(`device:${devices[0].value.slice(7)}`)
  })

  it('lists every endpoint, labeled "equipment · label", after the devices', () => {
    const endpoints = withDevices.filter((i) => !i.value.startsWith('device:'))
    expect(endpoints).toHaveLength(s.endpoints.length)
    expect(withDevices[0].value.startsWith('device:')).toBe(true)
    const hdf = endpoints.find((i) => i.value === 'HDF-01:3C/5:f')!
    expect(hdf.label).toBe('HDF-01 · 3C/5 front')
  })

  it('has endpoints only for the other trace modes and for Destination', () => {
    expect(endpointsOnly).toHaveLength(s.endpoints.length)
    expect(endpointsOnly.some((i) => i.value.startsWith('device:'))).toBe(false)
  })
})

describe('POL-12 matching by space-separated words', () => {
  it('"edge-17 3" finds EDGE-17 port 3 first', () => {
    const [first] = labels('edge-17 3', undefined, endpointsOnly)
    expect(first).toBe('EDGE-17 · 3')
  })

  it('"hdf-01 3c/5" finds both sides of that position and nothing else', () => {
    expect(labels('hdf-01 3c/5').sort()).toEqual([
      'HDF-01 · 3C/5 front',
      'HDF-01 · 3C/5 rear',
    ])
  })

  it('"panel-a 1 rear" finds that position\'s rear side first', () => {
    expect(labels('panel-a 1 rear')[0]).toBe('PANEL-A · 1 rear')
  })

  it('ignores case and the order of the words', () => {
    expect(labels('EDGE-17 ALL PORTS')).toEqual(['EDGE-17 · all ports'])
    expect(labels('3 edge-17', undefined, endpointsOnly)[0]).toBe('EDGE-17 · 3')
    expect(labels('  hdf-01   3C/5  ').sort()).toEqual([
      'HDF-01 · 3C/5 front',
      'HDF-01 · 3C/5 rear',
    ])
  })

  it('matches words anywhere in the label, and ranks whole-word matches first', () => {
    const result = labels('edge-17 1', undefined, endpointsOnly)
    expect(result[0]).toBe('EDGE-17 · 1')
    expect(result).toContain('EDGE-17 · 10')
    expect(result.indexOf('EDGE-17 · 10')).toBeGreaterThan(0)
  })

  it('does not offer a panel as a whole-device start', () => {
    expect(labels('panel-a all ports')).toEqual([])
  })

  it('finds a device by name in distribution mode', () => {
    expect(labels('agg').slice(0, 4)).toEqual([
      'AGG-03 · all ports',
      'AGG-08 · all ports',
      'AGG-12 · all ports',
      'AGG-15 · all ports',
    ])
  })

  it('returns nothing when a word matches nothing', () => {
    expect(matchPicker(withDevices, 'edge-17 zzz')).toEqual({
      matches: [],
      more: 0,
    })
  })

  it('offers everything for an empty query', () => {
    expect(
      matchPicker(withDevices, '   ').matches[0].value.startsWith('device:'),
    ).toBe(true)
  })
})

describe('POL-12 at most 50 matches, with a count of the rest', () => {
  it('caps the list at 50 and reports how many more there are', () => {
    const result = matchPicker(withDevices, 'agg')
    expect(result.matches).toHaveLength(50)
    expect(result.more).toBe(
      withDevices.filter((i) => /agg/i.test(i.search)).length - 50,
    )
    expect(result.more).toBeGreaterThan(0)
  })

  it('has nothing more when everything fits', () => {
    expect(matchPicker(withDevices, 'hdf-01 3c/5').more).toBe(0)
  })

  it('honours a smaller limit', () => {
    const result = matchPicker(withDevices, 'agg', 2)
    expect(result.matches).toHaveLength(2)
    expect(result.more).toBeGreaterThan(0)
  })
})
