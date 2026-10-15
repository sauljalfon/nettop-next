import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { agg03Route } from '../map/acceptanceFixture'
import { followPort, walkOfRoute } from './follow'
import {
  buildSheet,
  endPieces,
  metaPieces,
  notePieces,
  type Sheet,
} from './sheet'
import type { TextPiece } from '../../shared/textPieces'
import { indexOf, withLinks, withoutLink } from './testSnapshots'

const NETWORKS = [
  { id: 'A', name: 'Network A' },
  { id: 'B', name: 'Network B' },
]

const joined = (pieces: TextPiece[]) =>
  pieces.map((p) => ('text' in p ? p.text : p.name)).join('')
const names = (pieces: TextPiece[]) =>
  pieces.flatMap((p) => ('name' in p ? [p.name] : []))
const endText = (s: Sheet) => joined(endPieces(s))

/** One short line per item, to compare whole sheets at a glance. */
function lines(sheet: Sheet) {
  return sheet.items.map((it) => {
    if (it.type === 'place') return `${it.site} › ${it.node} › ${it.rack}`
    if (it.type === 'cable')
      return `cable ${it.label ?? it.shortId}${it.note ? ` | ${joined(notePieces(it.note))}` : ''}`
    return `${it.name} [${it.tag}] U${it.unit}: ${it.text}`
  })
}

const sheetFrom = (
  edit: ((s: Snapshot) => Snapshot) | undefined,
  start: string,
) => {
  const index = indexOf(edit)
  return buildSheet(index, NETWORKS, followPort(index, start))
}

const A01_A04 = [
  'Main Campus › Building A › Rack A03',
  'EDGE-17 [Access] U1: start · out 1',
  'cable A01',
  'PANEL-A [Panel] U1: in front 1 → out rear 1',
  'cable A02 | leaves Building A',
  'Main Campus › North Sub-main › Rack SM01',
  'HDF-01 [HDF] U1: in rear 3C/5 → out front 3C/5',
  'cable A03 | leaves North Sub-main',
  'Main Campus › Main Distribution › Rack Core 01',
  'HDF-02 [HDF] U1: in front 2B/3 → out rear 2B/3',
  'cable A04',
  'AGG-03 [AGG] U1: in 1',
]

describe('buildSheet for the acceptance path A01–A04', () => {
  it('reads the same from a server route and from followPort', () => {
    const index = indexOf()
    const fromRoute = buildSheet(
      index,
      NETWORKS,
      walkOfRoute(index, agg03Route()),
    )
    const fromWalk = buildSheet(
      index,
      NETWORKS,
      followPort(index, 'EDGE-17:p1'),
    )
    expect(lines(fromRoute)).toEqual(A01_A04)
    expect(fromWalk).toEqual(fromRoute)
  })

  it('has the title, counts, network and end line', () => {
    const sheet = sheetFrom(undefined, 'EDGE-17:p1')
    expect(sheet.title).toEqual({
      from: { equipmentId: 'EDGE-17', name: 'EDGE-17', port: '1' },
      to: { equipmentId: 'AGG-03', name: 'AGG-03', port: '1' },
    })
    expect(sheet.counts).toEqual({ cables: 4, passives: 3, racks: 3 })
    expect(sheet.network).toBe('Network A')
    expect(sheet.end.kind).toBe('destination')
    expect(endText(sheet)).toBe('Ends at AGG-03 · 1, an AGG.')
  })

  it('says a BB for a backbone destination', () => {
    const sheet = sheetFrom(undefined, 'EDGE-17:p3')
    expect(endText(sheet)).toBe('Ends at BB-01 · 1, a BB.')
  })

  it('gives each row the endpoint to open and marks nothing as a stop', () => {
    const rows = sheetFrom(undefined, 'EDGE-17:p1').items.flatMap((it) =>
      it.type === 'row' ? [it] : [],
    )
    expect(rows.map((r) => r.equipmentId)).toEqual([
      'EDGE-17',
      'PANEL-A',
      'HDF-01',
      'HDF-02',
      'AGG-03',
    ])
    expect(rows.map((r) => r.endpointId)).toEqual([
      'EDGE-17:p1',
      'PANEL-A:1:f',
      'HDF-01:3C/5:r',
      'HDF-02:2B/3:f',
      'AGG-03:p1',
    ])
    expect(rows.some((r) => r.stop)).toBe(false)
  })
})

describe('buildSheet: how a path ends', () => {
  it('no cable: only the start row and a line saying so', () => {
    const sheet = sheetFrom(undefined, 'EDGE-17:p4')
    expect(lines(sheet)).toEqual([
      'Main Campus › Building A › Rack A03',
      'EDGE-17 [Access] U1: start · out 4',
    ])
    expect(sheet.end.kind).toBe('none')
    expect(endText(sheet)).toBe('No cable is connected to this port.')
    expect(sheet.counts).toEqual({ cables: 0, passives: 0, racks: 1 })
  })

  it('a free end at a panel rear: last passive says nothing is connected', () => {
    const sheet = sheetFrom(withoutLink('A02'), 'EDGE-17:p1')
    expect(lines(sheet).slice(-1)).toEqual([
      'PANEL-A [Panel] U1: in front 1 → out rear 1 · nothing connected',
    ])
    const last = sheet.items[sheet.items.length - 1]
    expect(last.type === 'row' && last.stop).toBe(true)
    expect(sheet.end.kind).toBe('free')
    expect(endText(sheet)).toBe(
      'Ends at a free position: nothing is connected to PANEL-A · rear 1.',
    )
  })

  it('a panel position with no stored bridge: the walk stops at its front', () => {
    const sheet = sheetFrom(withoutLink('PANEL-A:1:bridge'), 'EDGE-17:p1')
    expect(lines(sheet).slice(-1)).toEqual([
      'PANEL-A [Panel] U1: in front 1 · nothing connected',
    ])
    expect(endText(sheet)).toBe(
      'Ends at a free position: nothing is connected to PANEL-A · front 1.',
    )
  })

  it('another access switch: names it and says it does not reach an AGG or BB', () => {
    const sheet = sheetFrom(
      withLinks({
        id: 'X1',
        kind: 'cable',
        a: 'EDGE-17:p5',
        b: 'EDGE-22:p5',
        label: 'Uplink-1',
      }),
      'EDGE-17:p5',
    )
    expect(lines(sheet)).toEqual([
      'Main Campus › Building A › Rack A03',
      'EDGE-17 [Access] U1: start · out 5',
      'cable Uplink-1 | leaves Main Campus',
      'DR Site › DR Access › Rack DR01',
      'EDGE-22 [Access] U1: in 5',
    ])
    expect(sheet.end.kind).toBe('switch')
    expect(endText(sheet)).toBe(
      'Ends at another switch, EDGE-22 · 5. It does not reach an AGG or BB from here.',
    )
  })

  it('a point-to-point route ends with the plain line', () => {
    const index = indexOf()
    const route = {
      ...agg03Route(),
      destinationRole: undefined,
      destinationEquipmentId: undefined,
    }
    const sheet = buildSheet(index, NETWORKS, walkOfRoute(index, route))
    expect(sheet.end.kind).toBe('endpoint')
    expect(endText(sheet)).toBe('Ends at AGG-03 · 1.')
    expect(lines(sheet).slice(-1)).toEqual(['AGG-03 [AGG] U1: in 1'])
  })

  it('a loop through two panels ends free at the last endpoint', () => {
    const sheet = sheetFrom(
      withLinks(
        { id: 'L1', kind: 'cable', a: 'PANEL-A:10:f', b: 'PANEL-A:11:f' },
        { id: 'L2', kind: 'cable', a: 'PANEL-A:11:r', b: 'PANEL-A:10:r' },
      ),
      'PANEL-A:10:f',
    )
    expect(lines(sheet)).toEqual([
      'Main Campus › Building A › Rack A03',
      'PANEL-A [Panel] U1: start · out front 10',
      'cable L1',
      'PANEL-A [Panel] U1: in front 11 → out rear 11',
      'cable L2',
      'PANEL-A [Panel] U1: in rear 10 · nothing connected',
    ])
    expect(endText(sheet)).toBe(
      'Ends at a free position: nothing is connected to PANEL-A · rear 10.',
    )
  })
})

describe('buildSheet: leave notes', () => {
  it('names the site left, then the node left, never both', () => {
    const sheet = sheetFrom(undefined, 'EDGE-22:p1')
    expect(lines(sheet).filter((l) => l.startsWith('cable'))).toEqual([
      'cable B01',
      'cable B02 | leaves DR Site',
      'cable B03 | leaves North Sub-main',
      'cable B04 | leaves Main Campus',
    ])
  })

  it('says "to {rack}, same node" when only the rack changes', () => {
    const sheet = sheetFrom((s) => {
      return {
        ...s,
        racks: [
          ...s.racks,
          { id: 'rack-a04', nodeId: 'node-a', name: 'Rack A04', units: 12 },
        ],
        equipment: s.equipment.map((e) =>
          e.id === 'PANEL-A' ? { ...e, rackId: 'rack-a04' } : e,
        ),
      }
    }, 'EDGE-17:p1')
    expect(lines(sheet).slice(0, 5)).toEqual([
      'Main Campus › Building A › Rack A03',
      'EDGE-17 [Access] U1: start · out 1',
      'cable A01 | to Rack A04, same node',
      'Main Campus › Building A › Rack A04',
      'PANEL-A [Panel] U1: in front 1 → out rear 1',
    ])
  })
})

describe('buildSheet: cable label or short ID', () => {
  const cableItems = (edit: (s: Snapshot) => Snapshot) =>
    sheetFrom(edit, 'EDGE-17:p1').items.flatMap((it) =>
      it.type === 'cable' ? [it] : [],
    )

  it('shows the label when there is one, and keeps the IDs', () => {
    const [first] = cableItems((s) => ({
      ...s,
      links: s.links.map((l) =>
        l.id === 'A01' ? { ...l, label: 'RJ-0042' } : l,
      ),
    }))
    expect(first.linkId).toBe('A01')
    expect(first.label).toBe('RJ-0042')
    expect(first.fullId).toBe('A01')
  })

  it('has no label when the stored one is empty', () => {
    const [first] = cableItems((s) => ({
      ...s,
      links: s.links.map((l) => (l.id === 'A01' ? { ...l, label: '  ' } : l)),
    }))
    expect(first.label).toBeUndefined()
  })

  it('keeps an ID of 8 characters or fewer whole', () => {
    const [first] = cableItems((s) => s)
    expect(first.shortId).toBe('A01')
    const [eight] = cableItems(renameLink('A01', '12345678'))
    expect(eight.shortId).toBe('12345678')
  })

  it('shortens a longer ID to … and its last 6 characters', () => {
    const [nine] = cableItems(renameLink('A01', '123456789'))
    expect(nine.shortId).toBe('…456789')
    expect(nine.fullId).toBe('123456789')
    const [uuid] = cableItems(
      renameLink('A01', '3f2a9c1e-5b7d-4e08-9a31-0c8d2b6e41f7'),
    )
    expect(uuid.shortId).toBe('…6e41f7')
  })
})

function renameLink(from: string, to: string) {
  return (s: Snapshot): Snapshot => ({
    ...s,
    links: s.links.map((l) => (l.id === from ? { ...l, id: to } : l)),
  })
}

describe('buildSheet: counts', () => {
  it('uses singular forms for one of each', () => {
    // EDGE-17 → PANEL-A (free rear): 1 cable, 1 passive, 1 rack.
    const sheet = sheetFrom(withoutLink('A02'), 'EDGE-17:p1')
    expect(sheet.counts).toEqual({ cables: 1, passives: 1, racks: 1 })
    expect(joined(metaPieces(sheet))).toBe(
      '1 cable · 1 passive · 1 rack · network Network A',
    )
  })

  it('uses plurals, and leaves the network out when it is unknown', () => {
    const index = indexOf()
    const walk = { ...followPort(index, 'EDGE-17:p1'), networkId: undefined }
    const sheet = buildSheet(index, NETWORKS, walk)
    expect(sheet.network).toBeUndefined()
    expect(joined(metaPieces(sheet))).toBe('4 cables · 3 passives · 3 racks')
    const unknownId = buildSheet(index, NETWORKS, { ...walk, networkId: 'Z' })
    expect(unknownId.network).toBeUndefined()
  })
})

describe('buildSheet: Hebrew names', () => {
  const hebrew = (s: Snapshot): Snapshot => ({
    ...s,
    sites: s.sites.map((x) =>
      x.id === 'site-main' ? { ...x, name: 'קמפוס ראשי' } : x,
    ),
    nodes: s.nodes.map((n) =>
      n.id === 'node-a' ? { ...n, name: 'בניין א׳' } : n,
    ),
    racks: s.racks.map((r) =>
      r.id === 'rack-a03' ? { ...r, name: 'ארון A03' } : r,
    ),
    equipment: s.equipment.map((e) =>
      e.id === 'EDGE-17' ? { ...e, name: 'מתג-17' } : e,
    ),
    links: s.links.map((l) => (l.id === 'A01' ? { ...l, label: 'כבל 1' } : l)),
  })

  it('returns every name whole', () => {
    const sheet = sheetFrom(hebrew, 'EDGE-17:p1')
    expect(lines(sheet).slice(0, 4)).toEqual([
      'קמפוס ראשי › בניין א׳ › ארון A03',
      'מתג-17 [Access] U1: start · out 1',
      'cable כבל 1',
      'PANEL-A [Panel] U1: in front 1 → out rear 1',
    ])
    expect(sheet.title.from).toEqual({
      equipmentId: 'EDGE-17',
      name: 'מתג-17',
      port: '1',
    })
    expect(lines(sheet)).toContain('cable A02 | leaves בניין א׳')
  })
})

describe('buildSheet: names and ports stay separate fields', () => {
  it('gives panel and HDF ports as side and place, never the stored label', () => {
    const sheet = sheetFrom(withoutLink('A02'), 'EDGE-17:p1')
    expect(sheet.end.at).toEqual({
      equipmentId: 'PANEL-A',
      name: 'PANEL-A',
      port: 'rear 1',
    })
    const hdf = sheetFrom(withoutLink('A04'), 'EDGE-17:p1')
    expect(hdf.end.at?.port).toBe('rear 2B/3')
  })

  it('has no end spot and no title.to when the port has no cable', () => {
    const sheet = sheetFrom(undefined, 'EDGE-17:p4')
    expect(sheet.end).toEqual({ kind: 'none' })
    expect(sheet.title.to).toBeUndefined()
  })

  it('carries the role of an AGG or BB destination', () => {
    expect(sheetFrom(undefined, 'EDGE-17:p1').end.role).toBe('aggregation')
    expect(sheetFrom(undefined, 'EDGE-17:p3').end.role).toBe('backbone')
  })

  it('gives a cable note a kind and the name: left place, or reached rack', () => {
    const notes = sheetFrom(undefined, 'EDGE-22:p1').items.flatMap((it) =>
      it.type === 'cable' ? [it.note] : [],
    )
    expect(notes).toEqual([
      undefined,
      { kind: 'site', name: 'DR Site' },
      { kind: 'node', name: 'North Sub-main' },
      { kind: 'site', name: 'Main Campus' },
    ])
  })
})

describe('text pieces: the plan texts, with every name its own piece', () => {
  it('writes the end lines and keeps equipment names apart', () => {
    const dest = sheetFrom(undefined, 'EDGE-17:p1')
    expect(endPieces(dest)).toEqual([
      { text: 'Ends at ' },
      { name: 'AGG-03' },
      { text: ' · 1, an AGG.' },
    ])
    expect(endText(sheetFrom(undefined, 'EDGE-17:p3'))).toBe(
      'Ends at BB-01 · 1, a BB.',
    )
    const free = sheetFrom(
      (s) =>
        withoutLink('A02')({
          ...s,
          equipment: s.equipment.map((e) =>
            e.id === 'PANEL-A' ? { ...e, name: 'פאנל א' } : e,
          ),
        }),
      'EDGE-17:p1',
    )
    expect(names(endPieces(free))).toEqual(['פאנל א'])
    expect(endPieces(free)).toEqual([
      { text: 'Ends at a free position: nothing is connected to ' },
      { name: 'פאנל א' },
      { text: ' · rear 1.' },
    ])
  })

  it('writes the other kinds of end line', () => {
    const none = sheetFrom(undefined, 'EDGE-17:p4')
    expect(endPieces(none)).toEqual([
      { text: 'No cable is connected to this port.' },
    ])
    const other = sheetFrom(
      withLinks({ id: 'X1', kind: 'cable', a: 'EDGE-17:p5', b: 'EDGE-22:p5' }),
      'EDGE-17:p5',
    )
    expect(endPieces(other)).toEqual([
      { text: 'Ends at another switch, ' },
      { name: 'EDGE-22' },
      { text: ' · 5. It does not reach an AGG or BB from here.' },
    ])
    const index = indexOf()
    const point = buildSheet(index, NETWORKS, {
      ...followPort(index, 'EDGE-17:p1'),
      end: { kind: 'endpoint', endpointId: 'AGG-03:p1' },
    })
    expect(endPieces(point)).toEqual([
      { text: 'Ends at ' },
      { name: 'AGG-03' },
      { text: ' · 1.' },
    ])
  })

  it('writes the leave notes', () => {
    expect(notePieces({ kind: 'site', name: 'DR Site' })).toEqual([
      { text: 'leaves ' },
      { name: 'DR Site' },
    ])
    expect(notePieces({ kind: 'node', name: 'בניין א׳' })).toEqual([
      { text: 'leaves ' },
      { name: 'בניין א׳' },
    ])
    expect(notePieces({ kind: 'rack', name: 'Rack A04' })).toEqual([
      { text: 'to ' },
      { name: 'Rack A04' },
      { text: ', same node' },
    ])
  })

  it('writes the meta line with the network name as its own piece', () => {
    const sheet = sheetFrom(undefined, 'EDGE-17:p1')
    expect(metaPieces(sheet)).toEqual([
      { text: '4 cables · 3 passives · 3 racks · network ' },
      { name: 'Network A' },
    ])
  })
})

describe('buildSheet: ports and place IDs for the route picture', () => {
  const rowsOf = (sheet: Sheet) =>
    sheet.items.flatMap((it) => (it.type === 'row' ? [it] : []))
  const ports = (sheet: Sheet) =>
    rowsOf(sheet).map((r) => [r.inPort, r.outPort])

  it('gives each row its in and out port, as the row text says them', () => {
    expect(ports(sheetFrom(undefined, 'EDGE-17:p1'))).toEqual([
      [undefined, '1'],
      ['front 1', 'rear 1'],
      ['rear 3C/5', 'front 3C/5'],
      ['front 2B/3', 'rear 2B/3'],
      ['1', undefined],
    ])
  })

  it('a single-endpoint passive has only the port its text names', () => {
    // Stops at PANEL-A's front: entered, never left.
    expect(
      ports(sheetFrom(withoutLink('PANEL-A:1:bridge'), 'EDGE-17:p1')).slice(-1),
    ).toEqual([['front 1', undefined]])
    // Starts at a panel: only an out port.
    const loop = sheetFrom(
      withLinks({ id: 'L1', kind: 'cable', a: 'PANEL-A:10:f', b: 'X:1' }),
      'PANEL-A:10:f',
    )
    expect(ports(loop)[0]).toEqual([undefined, 'front 10'])
  })

  it('a start with no cable has only an out port', () => {
    expect(ports(sheetFrom(undefined, 'EDGE-17:p4'))).toEqual([
      [undefined, '4'],
    ])
  })

  it('puts the site and node IDs on each place', () => {
    const places = sheetFrom(undefined, 'EDGE-17:p1').items.flatMap((it) =>
      it.type === 'place' ? [[it.siteId, it.nodeId]] : [],
    )
    expect(places).toEqual([
      ['site-main', 'node-a'],
      ['site-main', 'node-sm'],
      ['site-main', 'node-core'],
    ])
  })
})
