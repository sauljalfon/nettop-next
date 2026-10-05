import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { filterTree } from './tree'

const s = acceptanceSnapshot()
const summary = (query: string) =>
  filterTree(s, query).map((site) => ({
    site: site.site.name,
    nodes: site.nodes.map((n) => ({
      node: n.node.name,
      racks: n.racks.map((r) => ({
        rack: r.rack.name,
        equipment: r.equipment.map((e) => e.name),
      })),
    })),
  }))

describe('Explore tree filtered by the search text', () => {
  it('shows every site, node and rack when there is no search text', () => {
    expect(filterTree(s, '')).toHaveLength(2)
    const nodes = filterTree(s, '').flatMap((x) => x.nodes)
    expect(nodes).toHaveLength(5)
    expect(nodes.flatMap((n) => n.racks)).toHaveLength(7)
    expect(filterTree(s, '   ')).toEqual(filterTree(s, ''))
  })

  it('hides sites, nodes and racks that contain no match', () => {
    expect(summary('edge-17')).toEqual([
      {
        site: 'Main Campus',
        nodes: [
          {
            node: 'Building A',
            racks: [{ rack: 'Rack A03', equipment: ['EDGE-17'] }],
          },
        ],
      },
    ])
  })

  it('keeps every branch that has a match, and only the matching equipment', () => {
    expect(summary('agg')).toEqual([
      {
        site: 'Main Campus',
        nodes: [
          {
            node: 'Main Distribution',
            racks: [
              { rack: 'Rack Core 01', equipment: ['AGG-03'] },
              { rack: 'Rack Core 02', equipment: ['AGG-08', 'AGG-15'] },
            ],
          },
        ],
      },
      {
        site: 'DR Site',
        nodes: [
          {
            node: 'DR Distribution',
            racks: [{ rack: 'Rack DR02', equipment: ['AGG-12'] }],
          },
        ],
      },
    ])
  })

  it('matches by role as well as name, ignoring case', () => {
    expect(summary('BACKBONE')[0].nodes[0].racks[0].equipment).toEqual([
      'BB-01',
    ])
  })

  it('shows nothing when nothing matches', () => {
    expect(filterTree(s, 'zzz')).toEqual([])
  })

  it('leaves equipment whose rack is unknown out of the filtered tree', () => {
    const doctored = acceptanceSnapshot()
    doctored.equipment.find((e) => e.id === 'AGG-12')!.rackId = 'gone'
    expect(filterTree(doctored, 'agg-12')).toEqual([])
  })
})
