import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { rangePairs } from '../planning/range'
import {
  chooseNode,
  chooseSite,
  eligibleIn,
  farDefault,
  farSide,
  findRack,
  follow,
  freeCount,
  locationTree,
  nextFree,
  pairMarks,
  startPlace,
  type SiteBranch,
} from './patching'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)
const none = new Map<string, 'front' | 'rear'>()

describe('PT-01 the location tree for the far-end dropdowns', () => {
  it('lists sites, nodes, racks and equipment by name, numbers in order', () => {
    const tree = locationTree(s)
    expect(tree.map((x) => x.name)).toEqual(['DR Site', 'Main Campus'])
    const main = tree[1]
    expect(main.nodes.map((n) => n.name)).toEqual([
      'Building A',
      'Main Distribution',
      'North Sub-main',
    ])
    expect(main.nodes[0].racks[0].equipment.map((e) => e.name)).toEqual([
      'EDGE-17',
      'PANEL-A',
    ])
    expect(
      main.nodes[1].racks.map((r) => [r.name, r.equipment.length]),
    ).toEqual([
      ['Rack Core 01', 2],
      ['Rack Core 02', 2],
      ['Rack Core 03', 1],
    ])
  })

  it('counts the free endpoints of an equipment', () => {
    expect(freeCount(index, 'EDGE-17')).toBe(21)
    expect(freeCount(index, 'PANEL-A')).toBe(48 - 6)
  })
})

describe('PT-02 the far end the screen starts on', () => {
  it('starts on passive equipment in the near end node, on the front for a switch', () => {
    expect(farDefault(s, index, 'EDGE-17:p5', [], none)).toEqual({
      equipmentId: 'PANEL-A',
      side: 'front',
    })
  })

  it('starts on the last far target of the session, never the near equipment', () => {
    const recent = [
      { equipmentId: 'EDGE-17', side: undefined },
      { equipmentId: 'HDF-01', side: 'rear' as const },
    ]
    expect(farDefault(s, index, 'EDGE-17:p5', recent, none)).toEqual({
      equipmentId: 'HDF-01',
      side: 'rear',
    })
  })

  it('falls back to other equipment when the near end is alone in its node', () => {
    const far = farDefault(s, index, 'AGG-12:p2', [], none)
    expect(far?.equipmentId).toBeDefined()
    expect(far?.equipmentId).not.toBe('AGG-12')
  })

  it('a rear jack starts a passive far end on its rear', () => {
    expect(farSide(index, 'PANEL-A:4:r', 'HDF-01', none)).toBe('rear')
    expect(farSide(index, 'PANEL-A:4:f', 'HDF-01', none)).toBe('front')
  })

  it('from a switch, a panel starts on the side last used for it, else the front', () => {
    expect(farSide(index, 'EDGE-17:p5', 'HDF-01', none)).toBe('front')
    expect(
      farSide(index, 'EDGE-17:p5', 'HDF-01', new Map([['HDF-01', 'rear']])),
    ).toBe('rear')
  })

  it('a switch has no side', () => {
    expect(farSide(index, 'PANEL-A:4:r', 'AGG-03', none)).toBeUndefined()
  })
})

describe('PT-03 the next free jack after a cable', () => {
  const taken = (extra: string[] = []) => {
    const all = new Set([...index.cabled, ...extra])
    return (id: string) => all.has(id)
  }

  it('skips cabled ports, in port order', () => {
    expect(nextFree(s, 'EDGE-17', undefined, taken())).toBe('EDGE-17:p4')
    expect(nextFree(s, 'EDGE-17', undefined, taken(), 'EDGE-17:p4')).toBe(
      'EDGE-17:p5',
    )
  })

  it('treats endpoints cabled moments ago as taken', () => {
    expect(nextFree(s, 'EDGE-17', undefined, taken(['EDGE-17:p4']))).toBe(
      'EDGE-17:p5',
    )
  })

  it('stays on one side of a panel', () => {
    expect(nextFree(s, 'PANEL-A', 'rear', taken())).toBe('PANEL-A:4:r')
  })

  it('is undefined past the last free jack', () => {
    expect(
      nextFree(s, 'EDGE-17', undefined, taken(), 'EDGE-17:p24'),
    ).toBeUndefined()
  })
})

describe('PT-04 pair marks on both faceplates', () => {
  it('numbers each pair and carries the reason a pair is blocked', () => {
    const pairs = rangePairs(s, index, 'EDGE-17:p4', 'PANEL-A:2:f', 3)
    const marks = pairMarks(pairs)
    expect(marks.near.get('EDGE-17:p4')).toEqual({
      n: 1,
      problem: 'PANEL-A · 2 front is already cabled (A05)',
    })
    expect(marks.far.get('PANEL-A:4:f')).toEqual({ n: 3, problem: undefined })
    expect(marks.near.size).toBe(3)
  })
})

const RACK = { level: 'rack' } as const
const EQUIPMENT = { level: 'equipment' } as const
const tree = locationTree(s)

describe('P2-1 the rack picker: where it starts and how it moves', () => {
  it('carries each rack’s height for the "Rack A03 · 12U" option', () => {
    expect(tree[1].nodes[0].racks[0]).toMatchObject({
      id: 'rack-a03',
      units: 12,
    })
  })

  it('starts at the rack it is given', () => {
    expect(startPlace(tree, 'rack-core-02', RACK)).toEqual({
      siteId: 'site-main',
      nodeId: 'node-core',
      rackId: 'rack-core-02',
    })
  })

  it('with no rack, or one that no longer exists, starts at the first site and node with no rack chosen', () => {
    const first = { siteId: 'site-dr', nodeId: 'node-dr1', rackId: '' }
    expect(startPlace(tree, undefined, RACK)).toEqual(first)
    expect(startPlace(tree, 'rack-gone', RACK)).toEqual(first)
  })

  it('a site change selects its first node and that node’s first rack, empty or not', () => {
    expect(chooseSite(tree, 'site-main', RACK)).toEqual({
      siteId: 'site-main',
      nodeId: 'node-a',
      rackId: 'rack-a03',
    })
  })

  it('a node change selects its first rack', () => {
    expect(chooseNode(tree, 'site-main', 'node-core', RACK)).toEqual({
      siteId: 'site-main',
      nodeId: 'node-core',
      rackId: 'rack-core-01',
    })
  })

  it('a node with no racks leaves the rack empty', () => {
    const bare: SiteBranch[] = [
      {
        id: 's',
        name: 'Site',
        nodes: [
          { id: 'n1', name: 'Hall 1', racks: [] },
          {
            id: 'n2',
            name: 'Hall 2',
            racks: [{ id: 'r', name: 'R1', units: 42, equipment: [] }],
          },
        ],
      },
    ]
    expect(chooseNode(bare, 's', 'n1', RACK)).toEqual({
      siteId: 's',
      nodeId: 'n1',
      rackId: '',
    })
    // A site change prefers a node that has a rack.
    expect(chooseSite(bare, 's', RACK)).toEqual({
      siteId: 's',
      nodeId: 'n2',
      rackId: 'r',
    })
  })

  it('never offers the excluded rack (Copy rack layout’s own target)', () => {
    const own = { level: 'rack', exclude: 'rack-a03' } as const
    expect(chooseNode(tree, 'site-main', 'node-a', own)).toEqual({
      siteId: 'site-main',
      nodeId: 'node-a',
      rackId: '',
    })
    expect(chooseSite(tree, 'site-main', own).rackId).not.toBe('rack-a03')
  })

  it('an empty database gives an empty place and does not throw', () => {
    expect(startPlace([], undefined, RACK)).toEqual({
      siteId: '',
      nodeId: '',
      rackId: '',
    })
    expect(chooseSite([], 'x', RACK)).toEqual({
      siteId: '',
      nodeId: '',
      rackId: '',
    })
  })

  it('keeps the shown place when the value it reports comes back (a refetch, its own "")', () => {
    const chosen = chooseNode(tree, 'site-main', 'node-core', RACK)
    expect(follow(tree, chosen, 'rack-core-01', RACK)).toBe(chosen)
    const bare = { ...chosen, rackId: '' }
    expect(follow(tree, bare, '', RACK)).toBe(bare)
  })

  it('moves to a value set from elsewhere', () => {
    const chosen = startPlace(tree, 'rack-a03', RACK)
    expect(follow(tree, chosen, 'rack-dr02', RACK)).toEqual({
      siteId: 'site-dr',
      nodeId: 'node-dr2',
      rackId: 'rack-dr02',
    })
  })
  describe('with no rack, it starts where the user is (near)', () => {
    const first = { siteId: 'site-dr', nodeId: 'node-dr1', rackId: '' }

    it('starts in the near node with no rack chosen', () => {
      expect(
        startPlace(tree, undefined, RACK, { nodeId: 'node-core' }),
      ).toEqual({ siteId: 'site-main', nodeId: 'node-core', rackId: '' })
    })

    it('with only a site, starts at its first node', () => {
      expect(
        startPlace(tree, undefined, RACK, { siteId: 'site-main' }),
      ).toEqual({ siteId: 'site-main', nodeId: 'node-a', rackId: '' })
    })

    it('a near node that does not exist falls back to the near site', () => {
      expect(
        startPlace(tree, undefined, RACK, {
          siteId: 'site-main',
          nodeId: 'node-gone',
        }),
      ).toEqual({ siteId: 'site-main', nodeId: 'node-a', rackId: '' })
    })

    it('a near that does not exist falls back to the first site and node', () => {
      expect(
        startPlace(tree, undefined, RACK, {
          siteId: 'site-gone',
          nodeId: 'node-gone',
        }),
      ).toEqual(first)
      expect(startPlace(tree, undefined, RACK, {})).toEqual(first)
    })

    it('a rack that is found wins over near', () => {
      expect(
        startPlace(tree, 'rack-core-02', RACK, { nodeId: 'node-dr1' }),
      ).toEqual({
        siteId: 'site-main',
        nodeId: 'node-core',
        rackId: 'rack-core-02',
      })
    })

    it('equipment mode ignores near', () => {
      expect(
        startPlace(tree, undefined, EQUIPMENT, { nodeId: 'node-core' }),
      ).toEqual(startPlace(tree, undefined, EQUIPMENT))
    })

    it('follow lands on near’s node for a value that is not in the tree', () => {
      const chosen = startPlace(tree, 'rack-a03', RACK)
      expect(
        follow(tree, chosen, 'unknown', RACK, { nodeId: 'node-core' }),
      ).toEqual({ siteId: 'site-main', nodeId: 'node-core', rackId: '' })
    })
  })
})

describe('P2-1 the far-end picker keeps its behaviour', () => {
  it('starts at the equipment’s rack, else the first site, node and rack', () => {
    expect(startPlace(tree, 'PANEL-A', EQUIPMENT)).toEqual({
      siteId: 'site-main',
      nodeId: 'node-a',
      rackId: 'rack-a03',
    })
    expect(startPlace(tree, undefined, EQUIPMENT)).toEqual({
      siteId: tree[0].id,
      nodeId: tree[0].nodes[0].id,
      rackId: tree[0].nodes[0].racks[0].id,
    })
  })

  it('never offers the excluded near end', () => {
    const near = { level: 'equipment', exclude: 'BB-01' } as const
    const core03 = findRack(tree, {
      siteId: 'site-main',
      nodeId: 'node-core',
      rackId: 'rack-core-03',
    })
    expect(core03?.equipment.map((e) => e.id)).toEqual(['BB-01'])
    expect(eligibleIn(core03, near)).toEqual([])
    // A node change skips the rack that offers nothing.
    expect(chooseNode(tree, 'site-main', 'node-core', near).rackId).toBe(
      'rack-core-01',
    )
  })
})
