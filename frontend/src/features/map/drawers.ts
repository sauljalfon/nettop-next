/** Drawers that open on the left (Explore, library) or the right (Trace tool, inspector, plans). */
const LEFT = new Set(['explorer', 'library'])
const RIGHT = new Set(['trace', 'inspector', 'plans'])

/** Which side of the map an open drawer covers, so overlays can keep clear of it. */
export function drawerSides(drawer: string | null) {
  return {
    left: drawer !== null && LEFT.has(drawer),
    right: drawer !== null && RIGHT.has(drawer),
  }
}
