# Design decisions and planning history

This records the useful conclusions from the design review, not a verbatim chat transcript. [architecture.md](architecture.md) and [ui-spec.md](ui-spec.md) are the current requirements; earlier ideas below are history where explicitly marked superseded.

## D01 — New project, Go backend, new frontend

The user found legacy NetTop architecturally inconsistent but wanted to retain its valuable network concepts. They chose a separate project with a Go backend and a new frontend. Legacy is a source of behavior/edge cases, not a structure to reproduce.

The baseline uses a modular Go monolith, `net/http`, PostgreSQL/pgx, and React/TypeScript/React Flow. Early mentions of other routers, sqlc, or external migration tools were recommendations, not a mandate to replace the working baseline. Keep the existing transaction and checksummed-migration discipline.

## D02 — Pathfinding is foundational

The user explicitly made pathfinding the most important feature. Both exact endpoint-to-endpoint tracing and AGG destination discovery were required from the start. Later decisions added BB as another accepted destination. Do not build an attractive diagram first and treat reliable physical tracing as an optional later feature.

The first working foundation therefore proved cable continuity, panel side bridges, multiple starting ports, disconnected endpoints, and installed/planned context before the later design review finished.

## D03 — Whiteboard plus physical rack experience

The user liked the initial freeform whiteboard and physical rack-builder directions. The assistant's first implementation introduced large permanent forms, tiny labels, nested inventory containers, and excessive drag-driven updates. The user rejected its usability, aesthetics, and lag.

The useful conclusions were full-page canvas, on-demand tools, contextual selection, readable controls, direct drag/placement feedback, and preserving viewport/state during saves. These do not authorize copying the early implementation's presentation.

## D04 — Two genuinely different views

**Final:** Conceptual explains connectivity; Physical locates the exact installation.

The conceptual map is freely arranged equipment connected by actual cables. The physical explorer is site → node → rack → equipment → endpoint. Switching views preserves selected equipment, endpoint, network, plan, and trace context.

**Superseded:** making Conceptual a nested site/node/rack inventory drawing. Ownership remains useful in labels, an explorer, optional grouping, and Physical; it must not replace cable adjacency.

## D05 — Map connectivity, not an ownership-only mind map

The user supplied a concept-map illustration to explain the intended conceptual feeling. A subsequent labeled ownership-tree study still did not explain the actual network adequately.

**Final:** connected equipment and cable references, visible branches/cross-links, optional location groups, compact metadata, and contextual detail. The initial image was guidance about approachable concept relationships, not a requirement for arbitrary free-text concepts to be traversable network objects.

Freeform note objects may be added as presentation features later. Notes, ownership arrows, layout proximity, and group membership never create physical continuity.

## D06 — Trace the existing map

The user demonstrated a multi-panel route alternating front/rear transitions. The assistant proposed a separate horizontal trace strip. The user rejected it because they wanted to see connections on the network map itself.

**Final:** selected path highlighting on the existing graph; retain equipment coordinates and viewport. A hop/detail panel can explain the same route but must not become the replacement visualization. Other connections remain visible, muted, summarized, or bundled.

*Amendment (2026-10-06, approved by the owner):* an opt-in **route view** (a toggle in the results overlay) may show only the active route in a left-to-right layout with node and rack outlines, as a reading and export aid (PNG and PDF). Tracing on the map itself still highlights in place and keeps positions and the viewport; turning the route view off restores the map exactly. See the amendments in [agent-handoff.md](agent-handoff.md).

## D07 — HDF: compact parent, selective subpanel detail

The user confirmed the legacy HDF has four columns and variable rows of mini subpanels. Inspection of legacy creation/rendering found six local positions per row/column block with front/rear endpoints.

The user explicitly approved:

> A compact HDF parent on the map, automatically revealing the subpanels and positions used by the selected trace. Manual expansion exposes more connections, and Physical shows the complete grid.

Thus neither thousands of detached subpanel cards nor a full cabinet grid belongs permanently in the conceptual overview. Preserve parent identity; reveal only relevant positions automatically. Do not conflate manual expansion with trace-driven expansion.

## D08 — Legacy site/node flow is worth retaining

The user asked how sites/nodes would appear in Physical and referenced the legacy experience. The approved physical direction keeps visual site exploration, a site with its nodes, a node's owned rack overview, rack elevation, and detailed port/HDF inspection.

Improve breadcrumbs, state restoration, consistent drill-down, and direct endpoint navigation. Avoid stacks of rack drawers/modals with overlapping paths. Site-membership diagrams are not cable graphs or measured floor plans. Actual facility images/coordinates were not supplied.

*Amendment (2026-10-06, M4 planning, requested by the owner after the clickable demo):* the site screen drops the central site card. It shows the site's nodes, **arranged freely by the user** (positions saved on the server as presentation data), joined by **cable summary lines** counted from real cable records between the nodes (each line lists its cable IDs). Membership is shown by the breadcrumb and the heading. It is still not a measured floor plan, and the lines are summaries, never traversal edges.

## D09 — Scale means focused exploration

The user expects hundreds of devices/panels and thousands to tens of thousands of connections. Rendering every object/endpoint/cable simultaneously is not the requirement.

Use summarized site/node/corridor overviews, dense-core focus, search, bounded neighborhoods, actual-cable bundles, selective HDF details, and missing-object loading for traces. Backend traversal remains independent of display filters and collapsed objects. Measure real graph build/search/render costs; static large-number illustrations are not benchmarks.

*Amendment (2026-10-06, approved by the owner):* the M3 location focus and boundary summaries were replaced in M3.1 by the **node/site highlight** (located equipment, the cables leaving it and their far-end cards; everything else faded). Bounded neighborhoods and scoped data are moved to M6 and need measured budgets: the default map currently draws every card and cable.

## D10 — Main campus, distribution center, sub-main/passive corridors

The user described a large main campus with a dense main distribution node containing BB and AGG equipment. Nodes may reach it directly, via sub-main nodes, or through multiple nodes. DR has a smaller LAN; small locations have limited nodes.

The overview can use the main distribution center as a recognizable anchor and open a focused core map. It must not infer a tree of cable paths from ownership, or force every path through that center. Intermediate physical locations normally contain passive panels; a location passage is not an active-switch relay.

## D11 — Multiple networks and multiple AGGs

The user stated that multiple networks exist and that networks have more than a fixed pair of AGGs. They clarified:

- A panel can carry multiple networks.
- An active device belongs to only one network.

Therefore network membership is explicit on active equipment and separate from physical ownership. Passive network context is circuit/position-specific and may be mixed inside one HDF subpanel. Filter by network without hiding shared infrastructure necessary for that network's trace. Do not infer membership from names, site, role, or a whole passive chassis.

The fictional acceptance example has three Network A AGGs: two reachable from EDGE-17 and one unconnected. Reachability is determined by actual cables, not membership. The small Network B fixture has one reachable AGG; that is not a product limit.

## D12 — BB is a valid destination, not an active-transit shortcut

The user chose to stop at AGG, or BB when the passive path terminates there, and agreed BB can serve as an aggregation destination.

They then explicitly selected **“Show both physical routes”** for the case where different source ports reach an AGG and a BB.

**Final:** accept both roles, return all matching reachable endpoint routes, list AGG before BB, retain actual inventory roles, and stop at active endpoints. Do not suppress BB results when AGGs exist. Do not jump from an AGG's reached port to its BB-facing uplink.

**Superseded:** global AGG-only priority that hides BB results, or an inferred continuation through active equipment toward BB.

## D13 — Installed, planned, and diagram state are distinct

The user needs both documentation of installed infrastructure and planning future equipment. The agreed model is a revisioned installed topology plus validated plan overlays, with diagram coordinates independent of both.

Unplaced canvas previews are local/unsaved and not traceable domain objects. Rack assignment, port connections, and physical moves are explicit plan commands. Approval and recording a completed physical installation remain separate later workflows. Layout undo cannot undo a recorded installation.

## D14 — Freeze design, retire mockups, hand off implementation

The final linked demo combined network filtering, all AGG/BB choices, shared HDF positions, physical site/node/rack/port navigation, and a separate scale study. It used precomputed fictional routes and native HTML navigation, not the actual backend. Its verification was evidence of internal design consistency, not shipped application behavior or production-scale performance.

The user declared the mockup phase finished and requested removal, documentation, and a commit. The mockup sources/generated pages/screenshots were retired. The runnable baseline and approved architecture were committed; the remaining pre-M1 input checklist was committed separately.

The user now wants the implementation handed to Opus 5.5. Preserve the complete design in these documents. Start implementation from the tested foundation rather than generating more alternatives or assuming the demo behavior already exists in the app.
