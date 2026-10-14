import type { CableItem, PlaceItem, RowItem, Sheet } from './sheet'

export interface DiagramStep {
  /** 1-based, in path order. */
  n: number
  row: RowItem
  rack: string
}
export interface DiagramCable {
  item: CableItem
  /** Where the cable sits: inside a node, between nodes of one site, or between sites. */
  gap: 'in-node' | 'node-gap' | 'site-gap'
}
export interface DiagramNode {
  nodeId?: string
  name: string
  parts: (DiagramStep | DiagramCable)[]
}
export interface DiagramSite {
  siteId?: string
  name: string
  nodes: (DiagramNode | DiagramCable)[]
}

/**
 * The sheet as nested groups for the route picture: consecutive steps in one site
 * form a site frame, consecutive steps in one node a node box. The cable before a
 * step goes where that step's group starts. A step with no site or node ID gets a
 * group of its own (never merged by name), and an empty name.
 */
export function routeDiagram(sheet: Sheet): {
  sites: (DiagramSite | DiagramCable)[]
} {
  const sites: (DiagramSite | DiagramCable)[] = []
  let site: DiagramSite | undefined
  let node: DiagramNode | undefined
  let place: PlaceItem | undefined
  let cable: CableItem | undefined
  let n = 0

  for (const item of sheet.items) {
    if (item.type === 'place') {
      place = item
      continue
    }
    if (item.type === 'cable') {
      cable = item
      continue
    }
    const p: PlaceItem = place ?? {
      type: 'place',
      rackId: '',
      site: '',
      node: '',
      rack: '',
    }
    n++
    const newSite =
      !site || !p.siteId || !site.siteId || site.siteId !== p.siteId
    const newNode =
      newSite || !node || !p.nodeId || !node.nodeId || node.nodeId !== p.nodeId
    if (newSite) {
      if (cable) sites.push({ item: cable, gap: 'site-gap' })
      site = {
        ...(p.siteId ? { siteId: p.siteId } : {}),
        name: p.siteId ? p.site : '',
        nodes: [],
      }
      sites.push(site)
    }
    if (newNode) {
      if (cable && !newSite) site!.nodes.push({ item: cable, gap: 'node-gap' })
      node = {
        ...(p.nodeId ? { nodeId: p.nodeId } : {}),
        name: p.nodeId ? p.node : '',
        parts: [],
      }
      site!.nodes.push(node)
    } else if (cable) {
      node!.parts.push({ item: cable, gap: 'in-node' })
    }
    node!.parts.push({ n, row: item, rack: p.rack })
    cable = undefined
  }
  return { sites }
}
