# Approved architecture

Status: implementation contract following the completed design review. This document describes the target product. See [current-status.md](current-status.md) for what the executable prototype actually implements, and [implementation-plan.md](implementation-plan.md) for the next checkpoints.

## 1. Product and network context

Net-Top Next is a pathfinding-centered physical infrastructure manager with **two views of the same network**:

- **Conceptual:** a connected equipment-and-cable map, freely arranged. A selected trace highlights that map in place; it does not replace it with a hierarchy tree or a separate route strip.
- **Physical:** site → physical node → rack → equipment → exact ports. Visual site/node exploration follows the useful drill-down flow of legacy NetTop.

The real network has a large main campus, a dense main distribution node containing BB and AGG switches, directly connected nodes, sub-main nodes, and passive routes that can cross many nodes. A DR site has a smaller LAN; other locations may have only one or two nodes.

Physical ownership and connectivity are separate. A sub-main node is not automatically a parent of every node that connects through it. Core-node roles guide navigation; they do not determine cable traversal. Site/node diagrams describe location membership, not physical cable links or measured floor-plan coordinates.

## 2. Domain contract

### Network membership and equipment roles

- Every **active device belongs to exactly one network**.
- Network membership is independent of site, node, and rack ownership.
- Panels, HDF chassis, and subpanels are **passive infrastructure** and can carry multiple networks. They do not exclusively own a network.
- Positions and cables remain independently identifiable. Their circuit's network context is derived from explicit active-endpoint membership where known; unknown circuits remain unclassified and conflicting endpoints are reported as mismatches.
- Roles are explicit data, never inferred from equipment names. Retain the baseline role values `access`, `aggregation`, and `passive`; add `backbone` for the BB role. UI labels are Access, AGG, and BB. BB is a valid distribution destination without being relabeled AGG.

### Physical ownership

```text
Site
  Physical node
    Rack
      Active device → device ports
      Standard panel → local positions → front/rear endpoints
      HDF panel → subpanels → local positions → front/rear endpoints
```

A node requires a site, a rack requires a node, and mounted equipment requires a rack. Equipment has a positive configured height and starting unit; placement cannot exceed the rack or overlap other mounted equipment. Actual rack height is independent of HDF row count.

### HDF layout and endpoint identity

- HDF columns are fixed: **A, B, C, D**. Row count is configurable.
- Each row/column block is an explicit, stable-ID subpanel: 1A, 1B, …, 3C, etc.
- Each HDF subpanel has **six local logical positions**, numbered 1–6.
- Each position has independent front and rear endpoint IDs.
- One front/rear bridge exists for the same position on the same subpanel. There is no implicit continuity between positions or subpanels.
- For N rows: 4N subpanels, 24N logical positions, and 48N side endpoints.
- Fiber-pair labels (`1,2`, `3,4`, …) are display labels only. They do not identify endpoints or create adjacency.
- Use structured row/column/local-position fields and stable IDs. Do not parse connectivity or layout from display names. Migrate the prototype's string subpanel reference explicitly.

### Cables and internal continuity

- A cable is an **unordered pair of distinct endpoints**.
- A device port supports at most one external cable.
- A panel-side endpoint supports at most one external cable. The opposite side of the same position can support another cable.
- Front/rear continuity is an internal bridge, not an external cable record.
- Preserve the existing rejection of same-equipment external cables for supported panel operations.
- A graph contains exact endpoints, external cable edges, and explicit/derived position bridge edges. Rendering coordinates, ownership edges, and cable bundles never become graph edges.

## 3. Pathfinding rules — locked

### Exact port-to-port

Follow external cables and passive same-position bridges. Return ordered, explained hops. Do not transit through an active device to its sibling ports.

### Find AGG / BB

1. Start independently from the selected exact port or the eligible ports of the selected active device.
2. Traverse physical cables and passive bridges.
3. Stop each physical route at an active equipment endpoint. AGG and BB are accepted destination roles; access/non-target endpoints terminate that branch without switch transit.
4. Return **both AGG and BB routes** when reachable. An AGG result must not suppress a BB connection from another starting port.
5. Return all reachable matching start/destination endpoint routes, with actual destination roles intact. Do not assume two aggregation switches per network or equate network membership with reachability.
6. List AGG results before BB results; any further ordering must be deterministic. Do not merge distinct starting ports or destination ports into a single unexplained result.
7. Matching destinations belong to the starting device's network. Report physically encountered cross-network endpoints separately; do not silently erase cables from the topology.

The physical engine may use BFS to produce a shortest path per reachable endpoint pair. In the side-aware passive model, a position does not introduce arbitrary fan-out. This is not an enumeration of every possible simple path through active equipment. Bound searches/results explicitly; return truncation information if limits apply.

Examples:

```text
EDGE-17 / Network A / port 1 → passive infrastructure → AGG-03
EDGE-17 / Network A / port 2 → passive infrastructure → AGG-08
EDGE-17 / Network A / port 3 → passive infrastructure → BB-01
```

All three results remain selectable. An unconnected AGG in Network A is not a reachable result. No continuation from an AGG into a BB uplink is permitted by this contract.

### Trace response

Include context (installed/plan), topology revision, network scope, start endpoint, destination equipment/endpoint and actual role, ordered hops, external cable IDs, bridge position identities, physical location references, outcome/stopping reason, mismatch diagnostics, and any truncation.

Tracing uses a consistent **complete relevant physical topology**, regardless of which objects are currently loaded, filtered, or collapsed in the UI. Display scope does not redefine connectivity.

## 4. Installed infrastructure, plans, and layout

- Installed topology is revisioned physical truth.
- A plan records proposed changes against a known installed base revision. Validate the overlay with the same connectivity and pathfinding rules as installed topology.
- Adding equipment or changing its rack assignment in a plan does not record an installation.
- Approval and physically implemented status are distinct future operations.
- Stable IDs survive proposal → implementation.
- An unplaced canvas preview is local, unsaved state. It has no traceable domain identity; saving requires valid ownership/placement.
- Diagram coordinates are presentation state, separate from rack unit/node/site ownership. Moving within the map changes layout. Explicit drop targets/actions create validated placement proposals.
- Save and refresh must not reset the viewport or selection. Undo for layout and undo for plan commands have separate meanings.

## 5. Backend boundaries

Use a Go modular monolith, PostgreSQL, pgx, explicit SQL migrations, and a versioned OpenAPI contract. The present `net/http` router is sufficient; avoid unnecessary framework changes.

| Boundary | Responsibility |
| --- | --- |
| Inventory / topology types | Network membership, sites/nodes/racks, equipment, HDF structure, endpoint identity |
| Connectivity validation | Occupancy, position bridges, cable and placement invariants |
| Topology snapshots | Consistent installed graph and validated plan overlays |
| Pathfinding | Pure traversal, terminal policies, explained routes and mismatches |
| Planning | Revision-checked commands, proposal lifecycle, future implementation |
| Persistence | Queries, explicit transactions, migrations |
| Workspaces | Saved views, object references, diagram layout; never owns connectivity |
| Identity | Future authentication/permissions; not part of physical traversal |

Use the existing small packages until a boundary needs its own package. HTTP handlers call services/repositories, never other handlers. Keep traversal independent of SQL, HTTP, canvas components, and names.

### Existing transaction discipline to preserve

- Migrations are an explicit CLI operation; startup checks readiness and does not create tables or reseed.
- Seeds are separate and refuse to overwrite initialized data.
- Snapshot reads use repeatable-read transactions.
- Plan commands lock the installed root `FOR SHARE`, then the draft `FOR UPDATE`, check installed base/draft revisions, validate the complete overlay, and save atomically.
- Future installed mutations acquire the same root `FOR UPDATE` before changing inventory.
- Missing records return 404, revision conflicts 409, invalid domain commands 422. Failed writes do not increment revisions.
- UI trace requests pin the loaded topology revision; stale requests cannot describe unseen changes.
- Backfill network membership/HDF structure deliberately. Do not silently infer a real device's network or reinterpret an existing draft during migration.

## 6. Scale

The intended network may have hundreds of active devices and panels and thousands to tens of thousands of cable records.

- Whole-network views summarize sites/nodes or connection corridors; dense core equipment opens in a focused scope.
- Fetch summaries, selected-location equipment, bounded neighborhoods, and expanded endpoint detail through scoped APIs.
- Keep exact cable IDs behind summaries; expansion resolves real endpoints. Never treat a summary edge as physical transit.
- A selected trace loads/reveals its own missing equipment and HDF positions while retaining useful surrounding context.
- Only mount detailed port controls when needed. Keep live drag state local; memoize graph projections and preserve references.
- Add graph caching by workspace/topology revision only after measurement. Benchmark HDF-heavy data and multiple starting ports, not only small fixtures.
- React Flow is the starting renderer for focused scopes. A different renderer may follow evidence, not an assumption that drawing every cable simultaneously is desirable.

## 7. Implementation authority

The approved behavior is recorded here and in [ui-spec.md](ui-spec.md). The prototype's nested hierarchy canvas and aggregation-only API are historical implementation state, not the final product contract. Mockup source, generated pages, screenshots, and generators have been removed. Use [implementation-plan.md](implementation-plan.md) to progress through small test-first checkpoints.
