import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot, withFullHdf } from './testFixture'
import {
  blockOnRoute,
  connectionChain,
  cellLook,
  detailModel,
  endpointAria,
  endpointTooltip,
  legendNetworks,
  faceFor,
  faceMarks,
  faceMeta,
} from './equipmentModel'
import { hdfFace, panelFace, switchBank } from './faces'
import { routeMarks } from './inventory'
import { agg03Route } from '../map/acceptanceFixture'

const s = withFullHdf(physicalSnapshot(), 'HDF-01', 4)
const index = indexSnapshot(s)
const names = new Map(s.networks.map((n) => [n.id, n.name]))
const marks = routeMarks(index, agg03Route())

describe('F09 color follows state, never the network ID', () => {
  const face = hdfFace(index, 'HDF-01', 'rear', { marks })
  const pos = (label: string, n: number) =>
    face.blocks.find((b) => b.label === label)!.positions[n - 1]

  it('a free side stays free even though its position carries a circuit', () => {
    // 3C/5 front is cabled; but 1A/3 has no cable on either side and no circuit.
    // Build a free side whose bridge side is cabled: 3C/5 rear is cabled, so use
    // the front of 1A/2 after removing its front cable.
    const cut = indexSnapshot({
      ...s,
      links: s.links.filter((l) => l.id !== 'A07'),
    })
    const cell = hdfFace(cut, 'HDF-01', 'front').blocks.find(
      (b) => b.label === '1A',
    )!.positions[1]
    expect(cell.cabled).toBe(false)
    expect(cell.networkId).toBe('A') // the circuit still reaches it through the bridge
    expect(cellLook(cell)).toEqual({ fill: 'free', selected: false })
  })

  it('a cabled side is filled; the route wins; selection is a separate ring', () => {
    expect(cellLook(pos('1A', 2))).toEqual({ fill: 'cabled', selected: false })
    expect(cellLook(pos('3C', 5))).toEqual({ fill: 'route', selected: false })
    const selected = hdfFace(index, 'HDF-01', 'rear', {
      marks,
      selectedEndpointId: 'HDF-01:3C/5:r',
    })
    expect(
      cellLook(selected.blocks.find((b) => b.label === '3C')!.positions[4]),
    ).toEqual({ fill: 'route', selected: true })
    expect(cellLook(pos('1A', 1))).toEqual({ fill: 'free', selected: false })
  })

  it('a position the equipment has no endpoint for is free', () => {
    const bare = hdfFace(indexSnapshot(physicalSnapshot()), 'HDF-02', 'front')
    expect(cellLook(bare.blocks[1].positions[0])).toEqual({
      fill: 'free',
      selected: false,
    })
  })

  it('a block holding a route position is on the route', () => {
    expect(blockOnRoute(face.blocks.find((b) => b.label === '3C')!)).toBe(true)
    expect(blockOnRoute(face.blocks.find((b) => b.label === '1A')!)).toBe(false)
  })
})

describe('F10 every endpoint has a spoken name', () => {
  const hdf = { name: 'HDF-01', kind: 'hdf' as const, side: 'rear' as const }

  it('HDF positions: label, side, state, network and route', () => {
    const face = hdfFace(index, 'HDF-01', 'rear', { marks })
    const cell = face.blocks.find((b) => b.label === '3C')!.positions[4]
    expect(endpointAria(hdf, cell, names.get('A'))).toBe(
      'HDF-01 3C / 5 rear, cabled, Network A, on selected route',
    )
    const free = face.blocks.find((b) => b.label === '1A')!.positions[0]
    expect(endpointAria(hdf, free, undefined)).toBe('HDF-01 1A / 1 rear, free')
    const other = face.blocks.find((b) => b.label === '3C')!.positions[1]
    expect(endpointAria(hdf, other, names.get('B'))).toBe(
      'HDF-01 3C / 2 rear, cabled, Network B',
    )
  })

  it('says selected last', () => {
    const face = hdfFace(index, 'HDF-01', 'rear', {
      marks,
      selectedEndpointId: 'HDF-01:3C/5:r',
    })
    const cell = face.blocks.find((b) => b.label === '3C')!.positions[4]
    expect(endpointAria(hdf, cell, 'Network A')).toBe(
      'HDF-01 3C / 5 rear, cabled, Network A, on selected route, selected',
    )
  })

  it('switch ports and panel positions', () => {
    const port = switchBank(index, 'EDGE-17').rows[0][0]
    expect(
      endpointAria({ name: 'EDGE-17', kind: 'switch' }, port, 'Network A'),
    ).toBe('EDGE-17 port 1, cabled, Network A')
    const pos = panelFace(index, 'PANEL-A', 'front').positions[0]
    expect(
      endpointAria(
        { name: 'PANEL-A', kind: 'panel', side: 'front' },
        pos,
        'Network A',
      ),
    ).toBe('PANEL-A 1 front, cabled, Network A')
  })
})

describe('the face header says what the equipment is', () => {
  const eq = (id: string) => s.equipment.find((e) => e.id === id)!

  it('HDF', () => {
    expect(
      faceMeta(eq('HDF-01'), {
        rows: 4,
        side: 'rear',
        location: 'Main Campus / North Sub-main / Rack SM01',
        networks: s.networks,
      }),
    ).toBe(
      'HDF · 4 rows × A–D · 96 positions · 3U · showing rear · Main Campus / North Sub-main / Rack SM01',
    )
  })

  it('panel and switch', () => {
    expect(
      faceMeta(eq('PANEL-A'), {
        count: 24,
        side: 'front',
        location: 'Main Campus / Building A / Rack A03',
        networks: s.networks,
      }),
    ).toBe(
      'Panel · 24 positions · 1U · showing front · Main Campus / Building A / Rack A03',
    )
    expect(
      faceMeta(eq('EDGE-17'), {
        count: 24,
        location: 'Main Campus / Building A / Rack A03',
        networks: s.networks,
      }),
    ).toBe(
      'Switch · 24 ports · 1U · access · Network A · Main Campus / Building A / Rack A03',
    )
  })
})

describe('F06 / F07 the endpoint detail', () => {
  it('HDF-01 3C/5 rear: its cable, its far end and location, and the same position’s front', () => {
    const d = detailModel(index, s.networks, 'HDF-01:3C/5:r')!
    expect(d).toMatchObject({
      equipmentName: 'HDF-01',
      title: 'HDF-01 3C/5 rear',
      side: 'rear',
      networkName: 'Network A',
      fiberPair: '9,10',
    })
    expect(d.external).toMatchObject({
      linkId: 'A02',
      farEndpointId: 'PANEL-A:1:r',
      farTitle: 'PANEL-A · 1 rear',
      farEquipmentName: 'PANEL-A',
      farLocation: 'Main Campus / Building A / Rack A03',
    })
    expect(d.internal).toMatchObject({
      endpointId: 'HDF-01:3C/5:f',
      side: 'front',
      action: 'Switch to front',
      linkId: 'A03',
      farTitle: 'HDF-02 · 2B/3 front',
    })
  })

  it('HDF-02 2B/3 front: A03, and the rear goes to AGG-03 port 1', () => {
    const front = detailModel(index, s.networks, 'HDF-02:2B/3:f')!
    expect(front.external).toMatchObject({
      linkId: 'A03',
      farEndpointId: 'HDF-01:3C/5:f',
    })
    expect(front.internal).toMatchObject({
      action: 'Switch to rear',
      linkId: 'A04',
      farTitle: 'AGG-03 · 1',
    })
  })

  it('a switch port has no internal peer and no fiber pair', () => {
    const d = detailModel(index, s.networks, 'EDGE-17:p1')!
    expect(d.internal).toBeUndefined()
    expect(d.fiberPair).toBeUndefined()
    expect(d.external).toMatchObject({
      linkId: 'A01',
      farEquipmentName: 'PANEL-A',
    })
  })

  it('a free position still names its other side; a free side has no external cable', () => {
    const d = detailModel(index, s.networks, 'PANEL-A:10:f')!
    expect(d.external).toBeUndefined()
    expect(d.internal).toMatchObject({
      endpointId: 'PANEL-A:10:r',
      linkId: undefined,
    })
  })

  it('an unknown endpoint has none', () => {
    expect(detailModel(index, s.networks, 'nope')).toBeUndefined()
  })
})

describe('PHY-08 the face and its marks for each kind of equipment', () => {
  const eq = (id: string) => s.equipment.find((e) => e.id === id)!

  it('an HDF face lists blocks row-major and counts its positions', () => {
    const face = faceFor(index, eq('HDF-01'), 'rear', {})
    expect(face.kind).toBe('hdf')
    expect(faceMarks(face)).toEqual({
      kind: 'hdf',
      blocks: '1A 1B 1C 1D 2A 2B 2C 2D 3A 3B 3C 3D 4A 4B 4C 4D',
      positions: 96,
    })
  })

  it('a switch bank and a panel face count ports and positions', () => {
    expect(faceMarks(faceFor(index, eq('EDGE-17'), undefined, {}))).toEqual({
      kind: 'switch',
      blocks: '',
      positions: 24,
    })
    expect(faceMarks(faceFor(index, eq('PANEL-A'), 'front', {}))).toEqual({
      kind: 'panel',
      blocks: '',
      positions: 24,
    })
  })

  it('passes the route and selection through to the cells', () => {
    const face = faceFor(index, eq('HDF-01'), 'rear', {
      marks,
      selectedEndpointId: 'HDF-01:3C/5:r',
    })
    if (face.kind !== 'hdf') throw new Error('expected an HDF face')
    const cell = face.face.blocks.find((b) => b.label === '3C')!.positions[4]
    expect(cell).toMatchObject({ onRoute: true, selected: true })
  })
})

describe('PB-02 the legend names the networks present on the face', () => {
  it('HDF-01’s rear face has Network A and Network B, in network order', () => {
    const face = faceFor(
      index,
      s.equipment.find((e) => e.id === 'HDF-01')!,
      'rear',
      {},
    )
    expect(legendNetworks(face, s.networks)).toEqual(['A', 'B'])
  })

  it('EDGE-17’s ports are Network A only; a free port adds nothing', () => {
    const face = faceFor(
      index,
      s.equipment.find((e) => e.id === 'EDGE-17')!,
      undefined,
      {},
    )
    expect(legendNetworks(face, s.networks)).toEqual(['A'])
  })

  it('a face with no cabled endpoint has no network swatch', () => {
    const face = faceFor(
      index,
      s.equipment.find((e) => e.id === 'AGG-15')!,
      undefined,
      {},
    )
    expect(legendNetworks(face, s.networks)).toEqual([])
  })

  it('lists networks in the snapshot order, not the order cells appear', () => {
    const face = faceFor(
      index,
      s.equipment.find((e) => e.id === 'HDF-01')!,
      'rear',
      {},
    )
    expect(legendNetworks(face, [...s.networks].reverse())).toEqual(['B', 'A'])
  })
})

describe('PB-01 the tooltip says the port, its cable and the far end', () => {
  const eq = (id: string) => s.equipment.find((e) => e.id === id)!
  const cell = (id: string, n: number) => {
    const face = faceFor(index, eq(id), 'front', {})
    if (face.kind !== 'switch') throw new Error('switch expected')
    return face.rows.flat()[n - 1]
  }

  it('port 3 · cable-a09 → PANEL-A 3 front', () => {
    expect(
      endpointTooltip(index, eq('EDGE-17'), cell('EDGE-17', 3), 3, undefined),
    ).toBe('port 3 · A09 → PANEL-A 3 front')
  })

  it('a free port says so', () => {
    expect(
      endpointTooltip(index, eq('EDGE-17'), cell('EDGE-17', 4), 4, undefined),
    ).toBe('port 4 · free')
  })

  it('a position names its side and its far end', () => {
    const face = faceFor(index, eq('HDF-01'), 'rear', {})
    if (face.kind !== 'hdf') throw new Error('hdf expected')
    const p = face.face.blocks.find((b) => b.label === '3C')!.positions[4]
    expect(endpointTooltip(index, eq('HDF-01'), p, undefined, 'rear')).toBe(
      '3C / 5 rear · A02 → PANEL-A 1 rear · fiber pair 9,10',
    )
  })
})

describe('PD-01 the connection drawn top to bottom, for a position', () => {
  const texts = (items: ReturnType<typeof connectionChain>) =>
    items.map((i) => (i.kind === 'box' ? i.title : i.label))

  it('HDF-01 3C/5 rear: far end, cable, this side, bridge, the other side, cable, its far end', () => {
    const items = connectionChain(index, s.networks, 'HDF-01:3C/5:r')
    expect(texts(items)).toEqual([
      'PANEL-A · 1 rear',
      'A02',
      '3C / 5 rear',
      'bridge',
      '3C / 5 front',
      'A03',
      'HDF-02 · 2B/3 front',
    ])
    expect(items.map((i) => (i.kind === 'box' ? i.role : i.link))).toEqual([
      'far',
      'cable',
      'self',
      'bridge',
      'other',
      'cable',
      'otherFar',
    ])
  })

  it('each box says where it goes: Go to peer, nowhere, Switch side, Go there', () => {
    const boxes = connectionChain(index, s.networks, 'HDF-01:3C/5:r').flatMap(
      (i) => (i.kind === 'box' ? [i] : []),
    )
    expect(boxes.map((b) => [b.role, b.endpointId, b.action])).toEqual([
      ['far', 'PANEL-A:1:r', 'go'],
      ['self', 'HDF-01:3C/5:r', undefined],
      ['other', 'HDF-01:3C/5:f', 'switch'],
      ['otherFar', 'HDF-02:2B/3:f', 'go'],
    ])
  })

  it('the far ends carry their Site / Node / Rack', () => {
    const [far] = connectionChain(index, s.networks, 'HDF-01:3C/5:r')
    expect(far).toMatchObject({ sub: 'Main Campus / Building A / Rack A03' })
  })

  it('route hops along the chain are marked, and nothing else', () => {
    const items = connectionChain(index, s.networks, 'HDF-01:3C/5:r', marks)
    expect(items.every((i) => i.onRoute)).toBe(true)
    const other = connectionChain(index, s.networks, 'HDF-01:1A/2:r', marks)
    expect(other.some((i) => i.onRoute)).toBe(false)
  })

  it('a side that is not on the route, in a position that is, is not marked', () => {
    // Cut the route's data to the rear side only.
    const rearOnly = routeMarks(index, {
      start: 'EDGE-17:p1',
      end: 'HDF-01:3C/5:r',
      hops: agg03Route().hops.slice(0, 3),
    })
    const items = connectionChain(index, s.networks, 'HDF-01:3C/5:r', rearOnly)
    expect(
      items
        .filter((i) => i.onRoute)
        .map((i) => (i.kind === 'box' ? i.title : i.label)),
    ).toEqual(['PANEL-A · 1 rear', 'A02', '3C / 5 rear'])
  })
})

describe('PD-02 a port, and a side with no cable', () => {
  const texts = (items: ReturnType<typeof connectionChain>) =>
    items.map((i) => (i.kind === 'box' ? i.title : i.label))

  it('a switch port is port → cable → far end only', () => {
    expect(texts(connectionChain(index, s.networks, 'EDGE-17:p1'))).toEqual([
      'PANEL-A · 1 front',
      'A01',
      '1',
    ])
  })

  it('a free port is a "no cable" box above the port', () => {
    const items = connectionChain(index, s.networks, 'EDGE-17:p4')
    expect(texts(items)).toEqual(['no cable', '4'])
    expect(items[0]).toMatchObject({ kind: 'box', role: 'none' })
  })

  it('a free position: no cable, this side, bridge, the other side, no cable', () => {
    const items = connectionChain(index, s.networks, 'PANEL-A:10:f')
    expect(texts(items)).toEqual([
      'no cable',
      '10 front',
      'bridge',
      '10 rear',
      'no cable',
    ])
    expect(items.map((i) => (i.kind === 'box' ? i.role : i.link))).toEqual([
      'none',
      'self',
      'bridge',
      'other',
      'none',
    ])
  })

  it('a position cabled only on the far side shows the cable after the bridge', () => {
    const cut = indexSnapshot({
      ...s,
      links: s.links.filter((l) => l.id !== 'A03'),
    })
    expect(texts(connectionChain(cut, s.networks, 'HDF-01:3C/5:r'))).toEqual([
      'PANEL-A · 1 rear',
      'A02',
      '3C / 5 rear',
      'bridge',
      '3C / 5 front',
      'no cable',
    ])
  })

  it('an unknown endpoint has no chain', () => {
    expect(connectionChain(index, s.networks, 'nope')).toEqual([])
  })
})
