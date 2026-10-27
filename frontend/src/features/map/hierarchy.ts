import { equipmentWalks, type FocusStep } from './focus'
import type { SnapshotIndex } from './snapshotIndex'

/** Why an access switch is marked; one mark per switch, the first that holds. */
export type UplinkMark = 'single' | 'chained' | 'no-uplink' | 'other-network'

/** One walk between two switches, over stored cables and bridges only. */
export interface Circuit {
  /** The endpoint it starts from, on the first switch. */
  start: string
  /** The far switch port. */
  end: string
  /** The switch the walk reaches. */
  farId: string
  via: FocusStep[]
  /** Every cable and bridge of the walk, in order. */
  linkIds: string[]
}

export interface SwitchUplinks {
  switchId: string
  /** To an AGG or BB of its network. */
  uplinks: Circuit[]
  /** To a switch of another network. */
  otherNetwork: Circuit[]
  /** Chained: the switches it hangs under. */
  parents: string[]
  /** Mid AGGs reached, directly or through its parents. */
  aggIds: string[]
  mark?: UplinkMark
}

export interface HierarchyNodeCard {
  /** `<groupKey>|<nodeId>`; a switch with no node is on `<groupKey>|`. */
  key: string
  groupKey: string
  nodeId?: string
  siteId?: string
  switchIds: string[]
  single: number
  chained: number
  /** Any of its switches has a mark. */
  problem: boolean
  proposed: boolean
}

export interface HierarchyGroup {
  /** The sorted AGG IDs joined by "+", or "top", or "none". */
  key: string
  kind: 'aggs' | 'top' | 'none'
  aggIds: string[]
  /** Kind 'top' only: the tops its switches reach. */
  topIds: string[]
  nodes: HierarchyNodeCard[]
  switches: number
  problemNodes: number
  /**
   * The AGGs (or tops) whose line to this frame is proposed: every uplink of the
   * group's switches to it uses a cable the plan adds.
   */
  proposedFrom: string[]
}

/** One line between two equipment cards, one per pair, with each circuit's links. */
export interface TierLine {
  key: string
  kind: 'uplink' | 'peer'
  /** The top of an uplink; the first by name of a peer link. */
  a: string
  b: string
  circuits: Circuit[]
  /** Drawn dashed: the AGG reaches fewer of the tops than there are. */
  weak: boolean
  proposed: boolean
}

export interface NetworkHierarchy {
  networkId: string
  topKind: 'backbone' | 'aggregation' | 'none'
  topIds: string[]
  /** The mid AGGs. */
  aggIds: string[]
  /** Mid AGG -> how many distinct tops it reaches. */
  topsReached: ReadonlyMap<string, number>
  lines: TierLine[]
  groups: HierarchyGroup[]
  switches: ReadonlyMap<string, SwitchUplinks>
  /** Tier equipment the plan adds. */
  proposed: ReadonlySet<string>
  counts: {
    bb: number
    agg: number
    nodes: number
    switches: number
    marked: number
  }
}

/** What the installed topology has, so a plan's additions can be told apart. */
export interface InstalledSets {
  equipment: ReadonlySet<string>
  links: ReadonlySet<string>
  containers: ReadonlySet<string>
}

const byKey = (a: { key: string }, b: { key: string }) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0

/**
 * The hierarchy of every network, built once per snapshot (the map and the
 * Inventory both read it). Roles only, never names; every line and mark comes
 * from the walks of `followPort` over stored cables and bridges. A pure
 * reading: it never feeds a trace, and a port's state changes nothing.
 */
export function buildHierarchies(
  index: SnapshotIndex,
  installed?: InstalledSets,
): ReadonlyMap<string, NetworkHierarchy> {
  const nameOf = (id: string) => index.equipment.get(id)?.name ?? id
  const byName = (a: string, b: string) =>
    nameOf(a).localeCompare(nameOf(b)) || a.localeCompare(b)

  const networks = new Map<string, string[]>()
  for (const e of index.equipment.values()) {
    if (e.kind !== 'switch' || !e.networkId) continue
    const list = networks.get(e.networkId)
    if (list) list.push(e.id)
    else networks.set(e.networkId, [e.id])
  }

  const result = new Map<string, NetworkHierarchy>()
  for (const id of [...networks.keys()].sort())
    result.set(
      id,
      buildNetwork(index, id, networks.get(id)!, byName, installed),
    )
  return result
}

function buildNetwork(
  index: SnapshotIndex,
  networkId: string,
  members: string[],
  byName: (a: string, b: string) => number,
  installed?: InstalledSets,
): NetworkHierarchy {
  const role = (id: string) => index.equipment.get(id)?.role
  const access = members.filter((id) => role(id) === 'access').sort(byName)
  const bbs = members.filter((id) => role(id) === 'backbone').sort(byName)
  const aggs = members.filter((id) => role(id) === 'aggregation').sort(byName)
  const isTier = (id: string) =>
    role(id) === 'aggregation' || role(id) === 'backbone'
  const own = (id: string) => index.equipment.get(id)?.networkId === networkId

  // The walks of every switch of the network, once.
  const walksOf = new Map(
    members.map((id) => [id, equipmentWalks(index, id)] as const),
  )
  const circuitOf = (
    w: ReturnType<typeof equipmentWalks>[number],
  ): Circuit => ({
    start: w.start,
    end: w.end.endpointId,
    farId: w.farId!,
    via: w.via,
    linkIds: w.linkIds,
  })

  // Uplinks, other-network walks and chain walks of each access switch.
  const info = new Map<string, SwitchUplinks>()
  const chain = new Map<string, Set<string>>(
    access.map((id) => [id, new Set()]),
  )
  const reachedByAccess = new Set<string>()
  for (const id of access) {
    const uplinks: Circuit[] = []
    const otherNetwork: Circuit[] = []
    for (const w of walksOf.get(id)!) {
      if (w.farId === undefined || w.farId === id) continue
      const far = index.equipment.get(w.farId)
      if (!far) continue
      if (isTier(far.id) && own(far.id)) {
        uplinks.push(circuitOf(w))
        reachedByAccess.add(far.id)
      } else if (far.networkId !== undefined && far.networkId !== networkId)
        otherNetwork.push(circuitOf(w))
      else if (far.role === 'access' && own(far.id)) {
        chain.get(id)!.add(far.id)
        chain.get(far.id)?.add(id)
      }
    }
    info.set(id, {
      switchId: id,
      uplinks,
      otherNetwork,
      parents: [],
      aggIds: [],
    })
  }

  // The tops: the BBs; else the AGGs joined to another AGG that no access switch reaches.
  const tierWalks = new Map<string, Circuit[]>()
  const joinedAggs = new Set<string>()
  for (const id of [...bbs, ...aggs]) {
    const list: Circuit[] = []
    for (const w of walksOf.get(id)!) {
      if (w.farId === undefined || w.farId === id) continue
      if (!isTier(w.farId) || !own(w.farId)) continue
      list.push(circuitOf(w))
      if (role(id) === 'aggregation' && role(w.farId) === 'aggregation')
        joinedAggs.add(id)
    }
    tierWalks.set(id, list)
  }
  let topKind: NetworkHierarchy['topKind'] = 'none'
  let topIds: string[] = []
  if (bbs.length > 0) {
    topKind = 'backbone'
    topIds = bbs
  } else {
    topIds = aggs.filter((id) => joinedAggs.has(id) && !reachedByAccess.has(id))
    if (topIds.length > 0) topKind = 'aggregation'
  }
  const tops = new Set(topIds)
  const midIds = aggs.filter((id) => !tops.has(id))
  const mids = new Set(midIds)

  // Chains: depth 0 where there is an uplink, else one more than the nearest neighbour.
  const depth = new Map<string, number>()
  let frontier = access.filter((id) => info.get(id)!.uplinks.length > 0)
  for (const id of frontier) depth.set(id, 0)
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier)
      for (const n of [...chain.get(id)!].sort(byName))
        if (!depth.has(n)) {
          depth.set(n, depth.get(id)! + 1)
          next.push(n)
        }
    frontier = next
  }
  // AGG sets and tops reached, shallowest first, so a parent is ready before its child.
  const topsOf = new Map<string, Set<string>>()
  const ordered = [...depth].sort((a, b) => a[1] - b[1] || byName(a[0], b[0]))
  for (const [id, d] of ordered) {
    const s = info.get(id)!
    const aggSet = new Set<string>()
    const topSet = new Set<string>()
    if (d === 0)
      for (const u of s.uplinks)
        (mids.has(u.farId) ? aggSet : topSet).add(u.farId)
    else {
      s.parents = [...chain.get(id)!]
        .filter((n) => depth.get(n) === d - 1)
        .sort(byName)
      for (const p of s.parents) {
        for (const a of info.get(p)!.aggIds) aggSet.add(a)
        for (const t of topsOf.get(p) ?? []) topSet.add(t)
      }
    }
    s.aggIds = [...aggSet].sort(byName)
    topsOf.set(id, topSet)
    if (d === 0)
      for (const u of s.uplinks) if (tops.has(u.farId)) topSet.add(u.farId)
  }

  // Marks, in order: no uplink, other network, chained, single.
  const joined = groupsOf(midIds, tierWalks, info, depth, tops, byName)
  for (const id of access) {
    const s = info.get(id)!
    const d = depth.get(id)
    let mark: UplinkMark | undefined
    if (d === undefined)
      mark = s.otherNetwork.length > 0 ? 'other-network' : 'no-uplink'
    else if (d >= 1) mark = 'chained'
    else if (
      s.uplinks.length === 1 &&
      (joined.placed.get(id)?.aggIds.length ?? 0) >= 2
    )
      mark = 'single'
    if (mark) s.mark = mark
  }

  // Lines between equipment cards: one per pair, each circuit once.
  const lines = new Map<string, TierLine>()
  for (const id of [...bbs, ...aggs]) {
    for (const c of tierWalks.get(id)!) {
      const far = c.farId
      const kind = tops.has(id) !== tops.has(far) ? 'uplink' : 'peer'
      const [a, b] =
        kind === 'uplink'
          ? tops.has(id)
            ? [id, far]
            : [far, id]
          : byName(id, far) <= 0
            ? [id, far]
            : [far, id]
      const key = `${kind}:${a}|${b}`
      let line = lines.get(key)
      if (!line)
        lines.set(
          key,
          (line = {
            key,
            kind,
            a,
            b,
            circuits: [],
            weak: false,
            proposed: false,
          }),
        )
      // The same circuit is seen from both ends: keep one, started on `a`.
      const same = [...c.linkIds].sort().join('|')
      const at = line.circuits.findIndex(
        (x) => [...x.linkIds].sort().join('|') === same,
      )
      if (at < 0) line.circuits.push(c)
      else if (id === a) line.circuits[at] = c
    }
  }
  const topsReached = new Map<string, number>()
  for (const id of midIds) topsReached.set(id, 0)
  for (const l of lines.values())
    if (l.kind === 'uplink')
      topsReached.set(l.b, (topsReached.get(l.b) ?? 0) + 1)
  for (const l of lines.values()) {
    if (l.kind === 'uplink')
      l.weak =
        tops.size > 1 &&
        (topsReached.get(l.b) ?? 0) > 0 &&
        (topsReached.get(l.b) ?? 0) < tops.size
    if (installed)
      l.proposed = l.circuits.every((c) =>
        c.linkIds.some((link) => !installed.links.has(link)),
      )
  }

  const groups = buildGroups(index, tops, joined, info, byName, installed)
  const cards = groups.flatMap((g) => g.nodes)
  const marked = access.filter((id) => info.get(id)!.mark).length
  return {
    networkId,
    topKind,
    topIds,
    aggIds: midIds,
    topsReached,
    lines: [...lines.values()].sort(byKey),
    groups,
    switches: info,
    proposed: new Set(
      installed
        ? [...topIds, ...midIds].filter((id) => !installed.equipment.has(id))
        : [],
    ),
    counts: {
      bb: bbs.length,
      agg: aggs.length,
      nodes: cards.length,
      switches: access.length,
      marked,
    },
  }
}

interface Joined {
  key: string
  kind: 'aggs' | 'top' | 'none'
  aggIds: string[]
}

interface JoinedGroups {
  /** The groups of joined mid AGGs, in order. */
  sets: Joined[]
  /** Each access switch's group. */
  placed: ReadonlyMap<string, Joined>
}

/**
 * Which group each access switch belongs to. Mid AGGs are joined (union-find) by
 * a peer link or by being in one switch's AGG set; a switch with an AGG set sits
 * in that group, else under the top when its chain reaches a top, else under No AGG.
 */
function groupsOf(
  midIds: string[],
  tierWalks: ReadonlyMap<string, Circuit[]>,
  info: ReadonlyMap<string, SwitchUplinks>,
  depth: ReadonlyMap<string, number>,
  tops: ReadonlySet<string>,
  byName: (a: string, b: string) => number,
): JoinedGroups {
  const parent = new Map(midIds.map((id) => [id, id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(id, root)
    return root
  }
  const join = (a: string, b: string) => {
    if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b))
  }
  for (const id of midIds)
    for (const c of tierWalks.get(id)!)
      if (!tops.has(c.farId)) join(id, c.farId)
  for (const s of info.values())
    for (const a of s.aggIds.slice(1)) join(s.aggIds[0], a)

  const members = new Map<string, string[]>()
  for (const id of midIds) {
    const root = find(id)
    const list = members.get(root)
    if (list) list.push(id)
    else members.set(root, [id])
  }
  const sets: Joined[] = [...members.values()]
    .map((ids) => ({
      key: [...ids].sort().join('+'),
      kind: 'aggs' as const,
      aggIds: [...ids].sort(byName),
    }))
    .sort((a, b) => byName(a.aggIds[0], b.aggIds[0]))
  const ofAgg = new Map(
    sets.flatMap((g) => g.aggIds.map((a) => [a, g] as const)),
  )
  const top: Joined = { key: 'top', kind: 'top', aggIds: [] }
  const none: Joined = { key: 'none', kind: 'none', aggIds: [] }
  const placed = new Map<string, Joined>()
  for (const s of info.values()) {
    if (s.aggIds.length > 0) placed.set(s.switchId, ofAgg.get(s.aggIds[0])!)
    else placed.set(s.switchId, depth.has(s.switchId) ? top : none)
  }
  return { sets, placed }
}

function buildGroups(
  index: SnapshotIndex,
  tops: ReadonlySet<string>,
  joined: JoinedGroups,
  info: ReadonlyMap<string, SwitchUplinks>,
  byName: (a: string, b: string) => number,
  installed?: InstalledSets,
): HierarchyGroup[] {
  const switchesOf = new Map<string, string[]>()
  for (const [id, g] of joined.placed) {
    const list = switchesOf.get(g.key)
    if (list) list.push(id)
    else switchesOf.set(g.key, [id])
  }
  const topOf = (ids: string[]) => {
    const found = new Set<string>()
    for (const id of ids) {
      const stack = [id]
      const seen = new Set<string>()
      while (stack.length > 0) {
        const s = info.get(stack.pop()!)!
        if (seen.has(s.switchId)) continue
        seen.add(s.switchId)
        for (const u of s.uplinks) if (tops.has(u.farId)) found.add(u.farId)
        stack.push(...s.parents)
      }
    }
    return [...found].sort(byName)
  }
  const siteName = (id?: string) =>
    id ? (index.sites.get(id)?.name ?? '') : ''
  const nodeName = (id?: string) =>
    id ? (index.nodes.get(id)?.name ?? '') : ''

  const make = (g: Joined): HierarchyGroup => {
    const ids = (switchesOf.get(g.key) ?? []).sort(byName)
    const byNode = new Map<string, string[]>()
    for (const id of ids) {
      const nodeId = index.places.get(id)?.nodeId ?? ''
      const list = byNode.get(nodeId)
      if (list) list.push(id)
      else byNode.set(nodeId, [id])
    }
    const nodes = [...byNode].map(([nodeId, switchIds]): HierarchyNodeCard => {
      const siteId = nodeId ? index.places.get(switchIds[0])?.siteId : undefined
      const marks = switchIds.map((s) => info.get(s)!.mark)
      return {
        key: `${g.key}|${nodeId}`,
        groupKey: g.key,
        ...(nodeId ? { nodeId } : {}),
        ...(siteId ? { siteId } : {}),
        switchIds,
        single: marks.filter((m) => m === 'single').length,
        chained: marks.filter((m) => m === 'chained').length,
        problem: marks.some((m) => m !== undefined),
        proposed:
          !!installed &&
          ((nodeId !== '' && !installed.containers.has(nodeId)) ||
            switchIds.every((s) => !installed.equipment.has(s))),
      }
    })
    // A card with no node comes after every node.
    nodes.sort(
      (a, b) =>
        Number(!a.nodeId) - Number(!b.nodeId) ||
        siteName(a.siteId).localeCompare(siteName(b.siteId)) ||
        nodeName(a.nodeId).localeCompare(nodeName(b.nodeId)) ||
        (a.nodeId ?? '').localeCompare(b.nodeId ?? ''),
    )
    const topIds = g.kind === 'top' ? topOf(ids) : []
    const proposedFrom = installed
      ? [...g.aggIds, ...topIds].filter((tier) => {
          const circuits = ids.flatMap((s) =>
            info.get(s)!.uplinks.filter((u) => u.farId === tier),
          )
          return (
            circuits.length > 0 &&
            circuits.every((c) =>
              c.linkIds.some((link) => !installed.links.has(link)),
            )
          )
        })
      : []
    return {
      key: g.key,
      kind: g.kind,
      aggIds: g.aggIds,
      topIds,
      nodes,
      switches: ids.length,
      problemNodes: nodes.filter((n) => n.problem).length,
      proposedFrom,
    }
  }

  const groups = joined.sets.map(make)
  const top = [...joined.placed.values()].find((g) => g.kind === 'top')
  const none = [...joined.placed.values()].find((g) => g.kind === 'none')
  // Under the top and No AGG exist only when they have switches.
  if (top) groups.push(make(top))
  if (none) groups.push(make(none))
  return groups
}
