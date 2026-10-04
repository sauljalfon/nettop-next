# Current implementation status

This describes what the code in this repository runs today, at the end of **M3 (the connected conceptual map)**, which follows **M2 (network-aware AGG / BB discovery)** and **M1 (network, role, and HDF domain contract)**. It does not imply that the approved product is finished: the physical explorer (M4), complete editing (M5), saved layout and scale work (M6), and governance (M7) are not implemented. The implementation authority is [architecture.md](architecture.md) and [ui-spec.md](ui-spec.md).

The implementation handoff is indexed in [README.md](README.md). [agent-handoff.md](agent-handoff.md) summarizes the planning, and [acceptance-example.md](acceptance-example.md) is the source of the seed fixture described below.

## Implemented

### Domain and persistence (M1)

- **Networks and membership.** `topology.Network{ID, Name}` and `Snapshot.Networks`. Every `switch` has exactly one `networkId` that references an existing network; `panel` and `hdf` have none (they are shared). No default network exists anywhere. Networks are read-only through the API (`networks` in the snapshot) and are created only by seed/fixtures. Provisioning and renaming are not implemented.
- **Roles.** `Validate` enforces role by kind: `switch` is `access`, `aggregation`, or `backbone`; `panel` and `hdf` are `passive`. Roles are never inferred from names.
- **HDF structure.** Equipment kind `hdf` with `topology.Subpanel{ID, EquipmentID, Row, Column}` (`Snapshot.Subpanels`). Rows are 1–32, columns A–D, six local positions per subpanel. `Endpoint.SubpanelID` (a stable ID) replaces the old free-text subpanel; labels are display text and are never parsed. `Validate` requires every HDF to have a complete grid: rows 1..N with all four columns, a front and rear endpoint at each of six positions per subpanel, and exactly one internal bridge per position. An N-row HDF therefore has 4N subpanels, 24N positions, and 48N side endpoints. Row count is derived from the stored subpanels and is independent of rack height (the equipment's own `height`).
- **Bridges and occupancy.** An internal bridge is valid only between opposite sides of the same position of the same subpanel (or the same standard-panel position). Endpoint identity and occupancy are scoped to the owning subpanel, so local numbering restarts per subpanel. Same-chassis external cables remain rejected. Cables between devices on different networks are accepted, not rejected; Find AGG / BB reports them as mismatches (below).
- **`add_hdf` plan command.** `{name, rackId, unit, height, rows}` creates the chassis, subpanels, positions, endpoints, and bridges in one revision using `topology.NewHDF`, the same builder the fixtures use. `rows` must be 1–32 (checked before anything is built, so a command creates at most 128 subpanels, 768 positions, and 1,536 side endpoints); `unit` and `height` must be 1–100 and fit the rack without overlapping installed or proposed equipment. Any validation, placement, or revision failure persists nothing and leaves the draft revision unchanged. `add_equipment` still creates only switches and standard panels (1–48 positions); it rejects kind `hdf`.
- **Plans.** `add_equipment` takes `networkId` (required for switches, rejected for panels) and accepts the `backbone` role. `planning.Plan` carries `Subpanels` in the same JSON document. Plans saved without a `subpanels` key (or `null`) are read as an empty list. A stored plan that contains an HDF chassis without its complete grid is refused as an overlay instead of being served half-valid.
- **Migrations 001–004** (embedded, checksummed, append-only):
  - `003_networks.sql` creates `networks`, adds `equipment.network_id`, and requires it exactly for switches. Its preflight raises an error telling you to reset the development database and reseed if any switch exists, or any saved plan's `additions.equipment` array contains a switch, because no membership is known. It never assigns a default network.
  - `004_hdf_structure.sql` creates `subpanels`, adds `hdf` to the equipment kinds, and replaces `endpoints.subpanel` with a `subpanel_id` foreign key and an equivalent uniqueness rule. Its preflight raises the same kind of error if any installed endpoint or any saved plan endpoint has a non-empty legacy `subpanel` string. Empty strings are dropped and existing endpoint IDs are unchanged.
  - Both preflights run before anything is altered. A database that was seeded before M1 contains switches, so `migrate` refuses it: reset the development database and reseed (see the README).
- **Traversal:** pure physical BFS over external cables and same-position front/rear bridges; sibling device ports never create edges; HDF endpoints traverse like any other endpoint. Exact point-to-point is unchanged (identical endpoints give a zero-hop route; cable order carries no direction).
- Go `net/http` API, pgx repositories with the existing lock order (installed `FOR SHARE`, then draft `FOR UPDATE`), draft/base revision conflicts, atomic validation and rollback, consistent installed reads.

### Find AGG / BB (M2)

`distribution` mode of `POST /api/traces` replaces the removed `aggregation` mode, which now returns 422, so no path can silently drop BB results.

- **Starts.** `device` searches every port of one switch; `start` searches one exact device port, or one exact panel or HDF port. Exactly one of the two; `end` is rejected; a `device` must be a switch. Each starting endpoint is searched independently (BFS, each endpoint visited once, so loops terminate) and stops at the first active endpoint it reaches: no transit through sibling ports, including AGG to BB.
- **Destinations.** Endpoints of `aggregation` or `backbone` devices other than the starting device. The actual role is preserved (BB is never relabeled AGG); AGG routes are listed before BB; BB routes are retained when AGGs are reachable. AGG-15 (unconnected) is never a result.
- **Source network and mismatches.** A device or device-port start uses the device's network. A destination in that network is a **route**; one in another network is a **mismatch**, returned separately in `mismatches` and never as a route.
- **Passive starts.** A panel or HDF port searches from that exact port (hops are counted from it, including its own bridge), in both directions. Its source network is the network of the access device found on the same circuit, never the panel or a name. With no access device (or access devices on different networks) the source network is **unresolved**: every reached destination is a route carrying its own network, `sourceNetworkId` is omitted, and the start outcome is `unresolved_network`. HDF-01 3C/5 resolves Network A and reaches AGG-03; 3C/2 resolves Network B and reaches AGG-12.
- **Start outcomes** (`starts`, one per searched endpoint): `reached`, `mismatch`, `no_destination` (connected, but the circuit ends at a non-destination endpoint or a passive dead end), `disconnected` (the circuit has no external cable), `unresolved_network`.
- **Result.** Each route and mismatch carries `destinationEquipmentId`, `destinationRole`, `destinationNetworkId`, `sourceNetworkId`, and ordered `hops`. Routes sort by role (AGG first), start endpoint, then destination endpoint; mismatches by start then destination; `starts` by endpoint; input order never matters. `status` is `reached` when any route exists, otherwise `unreachable`, with a `reason` derived from the start outcomes ("from N of M searched port(s)" counts ports that produced a route).
- **Limit.** At most 1,000 routes plus mismatches (routes kept first). `truncated` is true only when results were dropped, and the reason says so; a limit is never reported as unreachable.
- **Location and HDF identity.** The response carries stable endpoint and equipment IDs only. Clients resolve rack, node, site, and HDF subpanel row/column, position, and side from the snapshot they already load; no duplicate location payload exists.
- **Deferred to M6, as recorded in the M3 plan:** focused equipment/neighborhood fetch and route-object fetch APIs. M3 loads full snapshots and does focus, collapse, and summaries on the client; scoped contracts are designed against measured large-network data.

### Seeds and fixtures

- **`cmd/db seed` loads the acceptance fixture** (`internal/acceptance`, built from [acceptance-example.md](acceptance-example.md)): Networks A and B, 2 sites, 5 physical nodes, 7 racks (12U), 11 equipment (7 active, 4 passive), HDF-01 (4 rows: 16 subpanels, 96 positions, 192 endpoints) and HDF-02 (3 rows: 72 positions, 144 endpoints), and cables A01–B04. AGG-15 is intentionally uncabled. The seed creates **no draft plans**; create one in the UI or through the API. The revision is `acceptance-1`. The fixture is fictional development data, not imported inventory.
- **The prototype `internal/sample` fixture** (one labeled "Prototype network") now backs only the Go characterization tests.
- **`cmd/testserver` (browser tests only) seeds the acceptance fixture** plus one draft named **Expansion** (EDGE-18 in Rack A03, cabled to the otherwise uncabled AGG-15). It is not part of `cmd/db seed`, which still creates no drafts.
- Legacy NetTop import is not implemented; it is a separate, later checkpoint.

### API

`GET /api/topology` returns `networks`, `subpanels`, and equipment with `networkId`. Plans return `subpanels`. `POST /api/plans/{id}/commands` supports `add_equipment`, `add_hdf`, `add_cable`, and `move_equipment`. `POST /api/traces` supports `point_to_point` and `distribution`; `aggregation` is removed. See [backend-contract-notes.md](backend-contract-notes.md) and `api/openapi.yaml`.

### Frontend

React/TypeScript, TanStack Query, React Flow. Installed/Plan switching, the inspector, plan forms, the Trace tool, and the physical rack view are unchanged from before M3. The map lives in `frontend/src/features/map/`; `App.tsx` only wires it in.

**Shell.** The header holds the **Conceptual / Physical** switch, a **Show network** selector ("All networks" or one network), a focus chip when a focus is active, and the **Installed / Plan** control. They are independent. Tools and drawers overlay the full-page map. The view, network choice, and focus are not part of the URL.

**Conceptual map.** One card per equipment (each HDF is one card), one line per cable.
- **First layout.** Deterministic and layered, with no new dependency: access switches in column 0, passive equipment in the column equal to its cable distance from an access switch, AGG/BB in the column after the last passive one, and equipment not reachable from an access switch parked in a row below. Columns are ordered by the average row of cabled neighbors, then name. Only cards without a recorded position are laid out; existing positions are never recomputed.
- **Positions and viewport are session-only.** Dragging a card changes this map only. Positions are recorded at drag stop in `mapSession`, keyed by equipment ID and shared by Installed and Plan, and the viewport is kept in the same store. The map fits once per session. Refetches, saves, trace and filter changes, and context switches never refit or reset them, and saving does not remount the map. Nothing is persisted to the server, so a reload starts again from the first layout.
- **Cards** show the equipment name, role (or PROPOSED), a plain site / node / rack label with a small button beside it that focuses the node, an "N of M cabled" summary (device ports, or panel/HDF positions counted once), and badges naming the networks of the circuits through a passive card. Clicking the card selects it and opens the inspector.
- **Cables.** Parallel cables between the same two cards that both attach to summary anchors and share a circuit network are drawn as one line labeled "N cables" that keeps every cable ID; a bundle never mixes networks. Proposed cables are dashed. Lines, bundles, and anchors are drawing aids and never feed traversal.
- **Network filter.** One network shows that network's active devices plus passive equipment carrying at least one of its circuits, and the cables between shown cards. A circuit's network is the network of its access device, computed by the same rule as the engine's passive start; an unresolved circuit has none. A cable on another network than the filter is captioned with that network. The filter is presentation only: it never changes what a trace finds.
- **Find AGG / BB.** Start from the selected switch card (**Find AGG / BB**, all ports) or by clicking a port or position facet (a position starts from its front endpoint, falling back to its rear one). Exact port-to-port tracing stays in the Trace tool. An expandable results overlay on the map lists every route, AGG first, with destination, role, network, and "N cables · M internal bridges", plus mismatches ("On another network (not routes)") and the truncation notice, with **Clear trace**. Selecting a result highlights its cables in place (animated lines), reveals its automatic facets, and never moves a card or the viewport. The ordered hop list with endpoint labels is in the results drawer of the Physical view; the map overlay lists routes only.
- **Facets** are exact endpoint detail on a card: one switch port, or one panel/HDF position with its front and rear endpoints and bridge ("3C / 5", with the parent HDF name always visible). *Automatic* facets come from the selected route and are tagged "route"; they are replaced when the route changes and removed by Clear trace. *Manual* facets are tagged "pinned": **Show connections** on a card lists only its cabled ports or positions, with search by label ("3C/5" and "3C / 5" both match); toggling an entry pins or unpins it. Entries whose circuit is on another network than the active filter carry that network's badge. Manual facets survive route selection, route changes, and Clear trace; a position that is both shows once with both tags. Pinned state is session-only, shared by Installed and Plan.
- **Hidden route cards.** Cards on the selected route that the network filter or focus would hide are shown while the route is selected and hidden again when it is cleared. The backend result is always complete; display scope is not graph scope.
- **Location focus.** Choose a site or node with a **Focus** action in the Explore drawer, or with the focus button on a card. The map then shows only equipment located there (and passing the network filter). Every cable from focused equipment to equipment outside is summarized by a **boundary card** per outside location (node, or site when the node is unknown), labeled "N cables to <location>", listing its real cable IDs. **Expand** shows the real neighbor cards at their session positions with real lines; **Collapse** folds them back. Boundary cards are drawing aids: never a traversal vertex, never sent to the backend. Focusing, expanding, and clearing never move a card or refit the view. The focus chip in the header has **Clear focus**. Focus and expanded bundles are session-only.
- **Library drops.** Dropping a library item on empty map space still creates an unplaced, unsaved preview; its rack is chosen in the plan form.
- **Drag-to-rack is removed from the map.** Placement proposals go through the inspector's placement form and the rack view.

**Physical.** The Physical tab shows the existing rack view (rack elevations, rack drops, placement) until M4 replaces it. Selecting a rack from the Explore drawer opens it; **Back to map** returns. There is no site/node explorer and no HDF grid yet.

**Find AGG / BB elsewhere.** The Trace tool and the inspector button (**Find AGG / BB from EDGE-17**) work as in M2, including passive starts from any panel or HDF endpoint in the Start list. Display logic is in unit-tested helpers (`features/pathfinding/results.ts`, `features/map/routeList.ts`).

**Plan form.** The **Network** select for switches (empty by default; saving is disabled until one is chosen) and the **Backbone** role are unchanged. There is no HDF creation UI. Equipment of kind `hdf` is passive (panel icon), never an active device.

**Pure projection modules** (`features/map/`, unit-tested): `layout`, `edges`, `facets`, `networks`, `connections`, `focus`, `location`, `routeList`, `snapshotIndex` (route-independent results computed once per snapshot), `mapGraph` (`projectMap`), and `mapSession`.

### Verification and tooling

- Go domain/engine/API/database tests with `-race`; PostgreSQL tests use unique schemas and skip without `TEST_DATABASE_URL`.
- Frontend unit tests (map projection, focus, facets, connections, session store, results helpers), strict TypeScript/build, formatting, and OpenAPI lint (`npx --yes @redocly/cli lint ../api/openapi.yaml --extends minimal`).
- Playwright against a test-only API (`cmd/testserver`, acceptance fixture plus the Expansion draft) and an isolated schema on ports 18080/5175. Specs: `map` (C01, C07/C08, C10, C11, C12), `trace-map` (C02, C04, C06, P18), `manual-expansion` (C03, C05), `focus` (C09, C13), `distribution`, `workspace`, `placement`, `planning`, `hdf`, `hdf-display`. The acceptance fixture has two networks, but mismatch rendering is covered by unit tests rather than a browser spec.

## Pending approved behavior

| Requirement | Today | Planned checkpoint |
| --- | --- | --- |
| Physical site/node/rack/port workflow with HDF grids | The existing rack elevation view; no site/node explorer and no HDF grid | M4 |
| Selecting a conceptual endpoint opens its exact physical position, with the same trace carried across views | Switching view keeps the selection and trace state, but Physical does not navigate to the exact position | M4 |
| Scoped neighborhood and route-object fetch APIs; summaries and scaling for large networks | Not implemented; the client loads full snapshots and does focus, collapse, and summaries itself. A 32-row HDF adds 1,536 endpoints to a snapshot | M6 |
| Saved layout and undo | Positions, viewport, pinned facets, and focus last only for the browser session | M6 |
| HDF-aware creation UI, container creation, delete/disconnect commands, drag-to-rack on the map | `add_hdf` exists in the API only; sites/nodes/racks cannot be created; no delete or disconnect; map drag is layout-only | M5 |
| Network provisioning and renaming | Networks are seed-only and read-only | Not scheduled |
| Legacy NetTop import with explicit ID/network/HDF mapping | Not implemented | Separate later checkpoint |
| Authentication, approval, explicit installation recording | Not implemented | M7 |

## Known limits

- **Nothing from the map is persisted to the server.** Card positions, the viewport, pinned facets, the network choice, and the focus are browser-session state and are lost on reload.
- **The full snapshot is loaded on the client.** Focus, collapse, and summaries are client-side; large-network scoping and measured performance are deferred to M6. No render or drag benchmark has been taken on a large network.
- **Cards can overlap.** The first layout spaces cards 200 px apart vertically, so a card that grows (pinned facets, an open connections list, a long route) can cover the one below it. An open list is brought to the front; there is no automatic re-layout.
- **Boundary lines carry no per-line count.** The count and the cable IDs are on the boundary card.
- **The results overlay sits under the right-hand drawers.** With the Trace tool or inspector open, its right-hand buttons are covered; close the drawer first.
- **Exact hops on the map.** The conceptual overlay lists routes and highlights their cables; the ordered hop list is in the Physical view's results drawer.
- **Unreproduced flake.** One full Playwright run during M3 step 5 failed `hdf-display.spec.ts` (the new HDF card not visible); it passed in 12 isolated repeats and in every later run, and the cause was not found.
- **Long Start list.** The Trace tool's Start select lists every endpoint (about 600 with the acceptance seed). No scoped search is implemented.
- **Half-valid stored plans return 500.** An overlay that fails validation (for example, a stored plan with an HDF chassis but no grid) is refused, but `repositoryError` maps the plain validation error to a generic 500 "Database operation failed". Plans created through the API cannot reach this state.
- **Large drafts.** `GET /api/plans` returns full drafts, so a plan with a 32-row HDF carries about 2,400 additional records per plan listed. Pagination and scoped summaries are M6.

## Retired artifacts

The static `conceptual-preview`, `network-workspace-mockups`, and `workflow-demo` directories, including generators, HTML, screenshots, and mock-only tests, have been removed. The agreed behavior is preserved in the architecture/UI documents. The nested whiteboard (`features/whiteboard/`) and its specs were replaced by the map in M3.
