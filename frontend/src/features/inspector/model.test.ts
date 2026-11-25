import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { buildHierarchies } from '../map/hierarchy'
import { indexSnapshot } from '../map/snapshotIndex'
import { piecesText } from '../../shared/textPieces'
import {
  canFindFromDevice,
  inspectorHeader,
  inspectorLocation,
  modelLine,
  wayUpLine,
} from './model'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)

describe('POL-09 header and location', () => {
  const installed = new Set(s.equipment.map((e) => e.id))

  it('names the equipment, role, network, state and cabling', () => {
    expect(
      inspectorHeader(
        s,
        index,
        s.equipment.find((e) => e.id === 'EDGE-17')!,
        installed,
      ),
    ).toEqual({
      name: 'EDGE-17',
      role: 'access',
      network: 'Network A',
      proposed: false,
      summary: '3 of 24 cabled',
    })
  })

  it('has no network for a panel and flags proposed equipment', () => {
    const header = inspectorHeader(
      s,
      index,
      s.equipment.find((e) => e.id === 'HDF-01')!,
      new Set(),
    )
    expect(header).toMatchObject({
      network: undefined,
      proposed: true,
      summary: '4 of 6 cabled',
    })
  })

  it('names the site, node and rack, each with the ID that acts on it', () => {
    expect(inspectorLocation(index, 'EDGE-17')).toEqual({
      site: { id: 'site-main', name: 'Main Campus' },
      node: { id: 'node-a', name: 'Building A' },
      rack: { id: 'rack-a03', name: 'Rack A03' },
    })
  })

  it('leaves out what is unknown', () => {
    const doctored = acceptanceSnapshot()
    doctored.equipment.find((e) => e.id === 'AGG-12')!.rackId = 'gone'
    expect(inspectorLocation(indexSnapshot(doctored), 'AGG-12')).toEqual({})
  })
})

describe('whole-device Find AGG / BB is for switches only', () => {
  const byId = (id: string) => s.equipment.find((e) => e.id === id)!
  it('is offered for a switch', () => {
    expect(canFindFromDevice(byId('EDGE-17'))).toBe(true)
    expect(canFindFromDevice(byId('BB-01'))).toBe(true)
  })

  it('is not offered for a panel or an HDF: the backend rejects it', () => {
    expect(canFindFromDevice(byId('PANEL-A'))).toBe(false)
    expect(canFindFromDevice(byId('HDF-01'))).toBe(false)
  })
})

describe('RI-09 a rack item has no ports to show', () => {
  const item = {
    id: 'ri-1',
    name: 'UPS 1',
    kind: 'rack_item' as const,
    role: 'none',
    rackId: s.racks[0].id,
    unit: 1,
    height: 2,
    itemType: 'ups' as const,
  }
  const withItem = { ...s, equipment: [...s.equipment, item] }
  const idx = indexSnapshot(withItem)

  it('has no sections, no network and nothing to find from', () => {
    expect(
      inspectorHeader(withItem, idx, item, new Set()).network,
    ).toBeUndefined()
    expect(canFindFromDevice(item)).toBe(false)
  })
})

describe('D49 the card’s way up and model lines', () => {
  const hs = buildHierarchies(index)
  const way = (id: string) => {
    const line = wayUpLine(hs, index, id)
    return line && piecesText(line)
  }
  it('an access switch lists its circuits and the devices they reach', () => {
    expect(way('EDGE-17')).toBe('3 uplinks: AGG-03, AGG-08, BB-01')
  })
  it('an AGG with no BB uplink says so; a BB has no line', () => {
    expect(way('AGG-03')).toBe('No BB uplink')
    expect(way('BB-01')).toBeUndefined()
  })
  it('a passive says how many circuits run through it, or nothing', () => {
    expect(way('PANEL-A')).toMatch(
      /circuits? of Network A (runs|run) through it/,
    )
    expect(way('nothing')).toBeUndefined()
  })
  it('the model line joins manufacturer, model and serial, and is empty when none is set', () => {
    expect(modelLine({})).toBeUndefined()
    expect(modelLine({ model: ' ' })).toBeUndefined()
    expect(
      piecesText(
        modelLine({
          manufacturer: 'Cisco',
          model: 'C9200',
          serialNumber: 'X1',
        })!,
      ),
    ).toBe('Cisco C9200 · SN X1')
    expect(piecesText(modelLine({ serialNumber: 'X1' })!)).toBe('SN X1')
  })
})
