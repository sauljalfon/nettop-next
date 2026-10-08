/** Drawers that open on the left (Explore, library) or the right (Trace tool, inspector, plans, networks). */
const LEFT = new Set(['explorer', 'library'])
const RIGHT = new Set(['trace', 'inspector', 'plans', 'networks'])

/** Which side of the map an open drawer covers, so overlays can keep clear of it. */
export function drawerSides(drawer: string | null) {
  return {
    left: drawer !== null && LEFT.has(drawer),
    right: drawer !== null && RIGHT.has(drawer),
  }
}
