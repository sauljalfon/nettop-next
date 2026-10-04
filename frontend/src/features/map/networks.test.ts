import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { circuitNetworks, passiveNetworks, visibleEquipment } from './networks'

const names = (s: Set<string>) => [...s].sort()

describe('circuit network classification', () => {
  it('takes a passive position network from the access device on its circuit', () => {
    const networks = circuitNetworks(acceptanceSnapshot())
    expect(networks.get('HDF-01:3C/5:f')).toBe('A')
    expect(networks.get('HDF-01:3C/5:r')).toBe('A')
    expect(networks.get('HDF-01:3C/2:f')).toBe('B')
    expect(networks.get('HDF-02:2B/6:r')).toBe('B')
    expect(networks.get('PANEL-DR:1:f')).toBe('B')
  })

  it('leaves a circuit unresolved when access devices disagree or are absent', () => {
    const s = acceptanceSnapshot()
    // Join EDGE-22 onto A's circuit at HDF-02 3A/1 rear (BB-01 end becomes a second access end).
    s.endpoints.push({ id: 'EDGE-22:p9', equipmentId: 'EDGE-22', label: '9' })
    s.links = s.links.filter((l) => l.id !== 'A12')
    s.links.push({
      id: 'X1',
      kind: 'cable',
      a: 'HDF-02:3A/1:r',
      b: 'EDGE-22:p9',
    })
    const networks = circuitNetworks(s)
    expect(networks.has('HDF-01:2D/4:f')).toBe(false)
    expect(networks.get('HDF-01:3C/5:f')).toBe('A')
  })

  it('never derives a network from a name or a panel', () => {
    const s = acceptanceSnapshot()
    s.equipment.find((e) => e.id === 'PANEL-A')!.networkId = 'B'
    expect(circuitNetworks(s).get('PANEL-A:1:f')).toBe('A')
  })
})

describe('C07 Network A filter', () => {
  it('shows A active devices plus the passive infrastructure carrying A circuits', () => {
    const s = acceptanceSnapshot()
    expect(names(visibleEquipment(s, 'A'))).toEqual([
      'AGG-03',
      'AGG-08',
      'AGG-15',
      'BB-01',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
  })

  it('keeps B circuits distinguishable on shared chassis through badges', () => {
    const badges = passiveNetworks(acceptanceSnapshot())
    expect(badges.get('HDF-01')).toEqual(['A', 'B'])
    expect(badges.get('HDF-02')).toEqual(['A', 'B'])
    expect(badges.get('PANEL-A')).toEqual(['A'])
    expect(badges.get('PANEL-DR')).toEqual(['B'])
  })

  it('does not change the snapshot or its connectivity', () => {
    const s = acceptanceSnapshot()
    const before = JSON.stringify(s)
    visibleEquipment(s, 'A')
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('C08 Network B filter', () => {
  it('shows the same shared chassis with B devices only', () => {
    expect(names(visibleEquipment(acceptanceSnapshot(), 'B'))).toEqual([
      'AGG-12',
      'EDGE-22',
      'HDF-01',
      'HDF-02',
      'PANEL-DR',
    ])
  })

  it('has no active equipment with two memberships', () => {
    const s = acceptanceSnapshot()
    const a = visibleEquipment(s, 'A')
    const b = visibleEquipment(s, 'B')
    const active = (id: string) =>
      s.equipment.find((e) => e.id === id)!.role !== 'passive'
    expect([...a].filter((id) => active(id) && b.has(id))).toEqual([])
  })

  it('shows every equipment when no network is selected', () => {
    const s = acceptanceSnapshot()
    expect(visibleEquipment(s, undefined).size).toBe(s.equipment.length)
  })

  it('reveals hidden equipment on a selected route', () => {
    const shown = visibleEquipment(acceptanceSnapshot(), 'B', ['AGG-03'])
    expect(shown.has('AGG-03')).toBe(true)
  })
})
