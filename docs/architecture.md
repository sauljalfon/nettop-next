# Architecture

The rules the domain, pathfinding, plans and persistence must keep. How each part is built today, with its exact endpoints, messages and limits, is in [status.md](status.md); the API contract is `api/openapi.yaml`; the decisions and their dates are in [decisions.md](decisions.md) (locked 1–11 are referred to as "locked N").

## 1. Product and network context

Net-Top Next is a pathfinding-centered physical infrastructure manager with **two views of the same network** (locked 1–4):

- **Conceptual:** an overview of nodes connected by real cables, freely arranged, and a Focus on one device with the active equipment it reaches (D35). A trace highlights it in place.
- **Physical:** site → node → rack → equipment → exact ports, following the useful drill-down of legacy NetTop.
- **Inventory:** a table of the same inventory (equipment, ports and positions, cables, racks, the problems the data shows and, in a plan, its work list), not a third drawing, that also acts on many rows at once (D37, D38).

The real network has a large main campus with a dense main distribution node (BB and AGG switches), nodes connected directly, through sub-main nodes or through passive routes that cross many nodes, a DR site with a smaller LAN, and small sites with one or two nodes. It is entered by hand in the app (D16).

Physical ownership and connectivity are separate. A sub-main node is not a parent of the nodes that connect through it. Location diagrams describe membership and cable summaries, never traversal or measured floor plans.

## 2. Domain

### Networks and roles

- Every **active device belongs to exactly one network** (locked 5). Membership is independent of site, node and rack.
- Panels, HDF chassis and subpanels are **passive** and can carry several networks; a circuit's network comes from the active endpoints on it. Unknown circuits stay unclassified; conflicting endpoints are reported as mismatches.
- Roles are explicit data: `access`, `aggregation`, `backbone` (BB) for switches, `passive` for panels and HDFs. Never inferred from names. BB is a valid destination and is never relabeled AGG.
- Networks are created and renamed, never deleted (D27).

### Ownership and placement

```text
Site
  Node
    Rack
      Switch → ports (1–96, in 1–8 port groups)
      Panel → positions → front/rear endpoints
      HDF → subpanels (rows × A–D) → positions 1–6 → front/rear endpoints
```

A node needs a site, a rack a node, equipment a rack. Equipment has a starting unit and a height and never exceeds its rack or overlaps other equipment. Rack height is independent of HDF row count.

### HDF and endpoint identity

- Columns are fixed **A–D**; rows are 1–32, set by the user (locked 8). Each row/column block is a stable-ID subpanel (1A … 32D) with **six local positions**; each position has independent front and rear endpoints and exactly one internal bridge between them. N rows: 4N subpanels, 24N positions, 48N endpoints.
- Fiber-pair labels are display text. Nothing is ever parsed from a label: identity, layout and order come from stored fields (subpanel, row, column, position, side; for switch ports `position` and `portGroup`, D24).

### Cables and continuity

- A cable is an **unordered pair of distinct endpoints** on different equipment. A switch port and a panel/HDF side endpoint take at most one cable; the opposite side of the same position can take another.
- Front/rear continuity is an internal bridge, not a cable.
- Cables between different networks are allowed; traces report them as mismatches.
- The graph is exact endpoints, cables and same-position bridges. Coordinates, ownership, bundles, summary lines and outline boxes are never edges.

### Detail fields

Optional descriptive data on every physical object (D23): manufacturer, model, serial number (unique among filled values), IP address, status, description on equipment; port type, connector, speed, state, description on ports; label, status, notes on cables; location, description (and rack type) on containers. **Details are data: a port's state or any other detail never changes a trace** (locked 6).

## 3. Pathfinding (locked 6, 7)

### Exact port to port

Follow cables and passive same-position bridges; return ordered, explained hops. Never transit an active device to its sibling ports. Identical endpoints give a zero-hop route.

### Find AGG / BB

1. Start independently from one exact port, or from every port of one switch. A panel or HDF port can be a start; its source network is that of the access device on the same circuit (never the panel or a name), otherwise it is unresolved.
2. Traverse cables and passive bridges (BFS, each endpoint once, so loops end).
3. Stop each branch at the first active endpoint. AGG and BB endpoints (other than the starting device) are destinations; any other active endpoint ends the branch. Never continue from an AGG into a BB uplink.
4. Return **every** reachable destination route with its actual role; a reached AGG never hides a BB from another start. Destinations on another network are **mismatches**, returned separately, never routes.
5. Order deterministically: AGG before BB, then start, then destination. Report each start's outcome (`reached`, `mismatch`, `no_destination`, `disconnected`, `unresolved_network`).
6. Bound results explicitly (1,000 routes plus mismatches) and say when results were dropped; a limit is never reported as unreachable.

```text
EDGE-17 / Network A / port 1 → passive infrastructure → AGG-03
EDGE-17 / Network A / port 2 → passive infrastructure → AGG-08
EDGE-17 / Network A / port 3 → passive infrastructure → BB-01
```

All three stay selectable; an unconnected AGG of Network A is never a result.

### Trace results

A result carries the context (Installed or a plan), the traced revision, start and destination endpoints, the destination's actual role and network, the ordered hops (cable IDs, bridges), mismatches, start outcomes and truncation. It carries stable IDs only; clients resolve site, node, rack and HDF position from the snapshot they loaded. Tracing always runs on the complete topology of its context, whatever the UI has loaded, filtered or collapsed.

## 4. Installed, plans and layout (locked 10, D17–D21)

- **Installed** is the revisioned physical truth. It changes in exactly two ways:
  - **Record as installed:** a plan, checked against the current installed revision, written atomically with a note and a Recorded by name; the revision moves once. The only path for topology changes.
  - **Direct fixes:** names and detail fields of installed objects, each changed field written to the change log; the topology revision never moves, so drafts stay valid. Never topology fields.
- **A plan** is a revisioned overlay on a known installed base revision: container additions, equipment additions, placements (IDs only), removals, cable additions, detail updates and renames of what the plan adds. `Apply(base, plan)` builds the proposed topology without touching the base and validates it with the same rules as Installed. `Check` lists every change that does not apply, keyed `<kind>:<id>`.
- **Changes are explicit and reversible inside a draft:** each change can be removed (`remove_change`, with its dependents), also on a stale draft. A draft behind Installed is never rebased automatically: Update draft moves it or lists the conflicts.
- **A recorded plan** is read-only and keeps its labels (names) and the objects it changed, for History.
- **IDs are stable** from proposal to installation; removing something a plan added deletes the addition.
- **Layout is presentation:** map card positions, the viewport, the site screen's node positions and the route view's boxes are separate from placement and from plans. An unplaced canvas preview is local and untraceable. Layout undo and plan undo are different things; layout undo never reverses an installation.

## 5. Backend

A Go modular monolith on `net/http`, PostgreSQL through pgx, explicit SQL migrations and an OpenAPI contract.

| Package | Responsibility |
| --- | --- |
| `internal/topology` | Domain types and `Validate` (ownership, placement, occupancy, bridges, HDF grids, details) |
| `internal/pathfinding` | Pure traversal: point to point and Find AGG / BB |
| `internal/planning` | Plan overlays, `Apply`, `Check`, `Diff`, commands, `batch`, `remove_change`, labels |
| `internal/fixes` | Pure direct fixes of installed names and details |
| `internal/persistence` | Repositories, transactions, Record, Update draft, fixes, layout, networks |
| `internal/httpapi` | HTTP boundary; talks to a `Repository` interface |
| `migrations/` | Embedded, checksummed, append-only SQL |

Traversal and planning never depend on SQL, HTTP, the canvas or names. Handlers call the repository, never other handlers.

### Transactions

- Snapshot reads are repeatable-read and consistent (plan metadata and every HDF identity included); BFS never queries per endpoint.
- Plan commands lock the installed root `FOR SHARE`, then the draft `FOR UPDATE`; check the draft revision and its base; validate the whole overlay; save atomically and bump the draft revision only on success.
- Writes to Installed (Record, direct fixes) lock the root `FOR UPDATE` first, so they never interleave.
- Status codes: 400 malformed or unknown fields, 404 missing, 409 revision conflict or duplicate, 422 invalid domain operation, 500 persistence failure, 503 unhealthy database. Errors are written in names ("U4–6 in Rack SM01 is taken by HDF-01"). A failed write changes nothing. An unreachable trace is a result, not an error.
- A trace request can pin the revision the UI loaded; a stale pin is 409.

### Schema rules

- Migrations are an explicit CLI step (`db migrate`), never run at startup. Never edit an applied migration; append a new one. A migration that cannot map existing data refuses with a clear error before changing anything; it never guesses a network, parses a label or renames.
- Startup never creates tables, seeds or falls back to fake data. A new database is `migrate` then `init`; `seed` is development-only (D26).
- Installed data is normalized (sites, nodes, racks, equipment, subpanels, endpoints, links, occupancy, networks, change log, recorded plan objects). The database enforces identity, uniqueness and value sets; grid completeness and bridge continuity are enforced by `topology.Validate` on every read and write path.
- Plans are stored as JSON overlays. A new overlay field must load from older plans (a missing key reads as empty) and must be loaded explicitly by the persistence layer; changing only a Go struct or a table leaves plans and the TypeScript mirror inconsistent.
- Presentation tables (saved node layout) are never part of a topology, a plan or a revision.

## 6. Scale

The network may have hundreds of active devices and panels and tens of thousands of cables, with 32-row HDFs.

- Overviews summarize (sites, nodes, cable counts); detail opens on demand. Summaries keep the real cable IDs behind them and never act as transit.
- A trace reveals the objects and HDF positions it needs; tracing is never limited to what is drawn.
- Detailed port controls mount only when needed; live drag state stays local; projections are computed once per snapshot and reused by ID.
- Scoped fetch APIs, bounded neighbourhoods and caching come only with measured budgets (M6, [roadmap.md](roadmap.md)). Measurements on fixtures are not budgets.
