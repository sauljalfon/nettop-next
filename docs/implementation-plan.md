# Implementation plan

Status: approved direction; implementation proceeds from the tested foundation described in [current-status.md](current-status.md). Mockup exploration is complete. This plan replaces the earlier prototype-first roadmap.

For the next-agent briefing and reading order, see [agent-handoff.md](agent-handoff.md) and [README.md](README.md). The full fictional inventory/cable definitions are in [acceptance-example.md](acceptance-example.md); behavior cases are in [acceptance-tests.md](acceptance-tests.md). Use [backend-contract-notes.md](backend-contract-notes.md) to distinguish current API/schema facts from target contract design.

## Execution rules

- One semantic model: [architecture.md](architecture.md). UI acceptance: [ui-spec.md](ui-spec.md).
- Implement in small, runnable checkpoints. Add meaningful failing tests, make minimal changes, and verify green before proceeding.
- Define API/schema behavior before wiring the frontend. `api/openapi.yaml` describes the current prototype until a checkpoint updates it together with implementation.
- Keep migrations explicit and preserve recorded inventory/endpoint identity. Do not silently assign unknown production networks or reinterpret stored plans.
- Each checkpoint reports changed files, relevant test/build results, and the next step. Update current-status as behavior actually ships.
- No automatic commits or remote publishing. The baseline commit does not authorize subsequent commits.

## M1 — Network, role, and HDF domain contract (complete)

### Decisions to confirm before coding

The conceptual/physical split, shared passive equipment, and AGG/BB stopping rules are settled. The remaining discussion should resolve implementation inputs rather than reopen the visual direction:

1. **First-release workflow:** confirm that the first complete vertical slice is network selection → find all reachable AGG/BB routes → inspect the same HDF endpoint physically. Use this to prioritize the M1–M4 acceptance flow; editing and governance remain later checkpoints.
2. **Development data versus imported inventory:** decide whether M1 uses only explicitly labeled Network A/B development fixtures or must migrate existing real inventory. For imported data, provide an explicit active-device → network mapping; never infer membership from names or assign every device to a default network.
3. **HDF creation limits and physical dimensions:** confirm the supported row range and how users specify rack height. The approved shape remains four columns and six local positions per subpanel. Preserve the distinction between row count and actual equipment height.

Record the answers here before beginning schema/API changes. The build does not imply that these input decisions have already been made.

#### Recorded answers (2026-10-03)

1. **First-release workflow:** confirmed. The first vertical slice is read/trace/inspect: network selection → all reachable AGG/BB routes → the same HDF endpoint in Physical. Editing and governance remain later checkpoints.
2. **Data:** M1 uses only explicitly labeled development fixtures (Network A/B from [acceptance-example.md](acceptance-example.md)). No real inventory import in M1. See answer 4 for how existing prototype data is handled.
3. **HDF dimensions:** both row count and rack height are variable and assigned by the user when creating the HDF. Neither is derived from the other, and there is no fixed list of HDF models. Validation requires 1–32 rows (a safety cap: at most 128 subpanels, 768 positions, and 1,536 side endpoints per atomic command; it can be raised later), at least 1U, and a rack placement that fits without overlap.
4. **Existing prototype data:** the development database is reset and reseeded with the acceptance fixtures; it is not backfilled. Migrations must not assign a default network. If active equipment or saved plan additions lack membership, the upgrade fails with a clear preflight error instead of guessing.
5. **Contract edge cases:** cross-network cables in a plan are allowed and reported as mismatch diagnostics, not rejected. M1 creates networks only through seed/fixtures and exposes them read-only through the API. Same-chassis external cables remain rejected. Passive-source discovery scope stays open until M2.
6. **Future legacy import (not M1 scope):** the user intends to import data from legacy NetTop later. It needs its own checkpoint with an explicit legacy-ID, network, and HDF mapping (see [legacy-reference.md](legacy-reference.md)). M1 should keep stable IDs and structured HDF fields that such a mapping can target, without building the importer.
7. **Browser tests during M1:** Playwright specs and `cmd/testserver` keep using the prototype `sample` fixture (with network membership added) until M3 replaces the UI they characterize. The development seed (`cmd/db seed`) switches to the acceptance fixture.

### Scope

1. Add explicit Network identities and exactly-one membership for active devices. Passive chassis/subpanels remain shared.
2. Add explicit `backbone` role (UI BB) alongside `access`, `aggregation`, and `passive`.
3. Add stable HDF subpanel identities with structured row/column fields, six local positions, and independent front/rear endpoint IDs.
4. Preserve standard panels and existing endpoints. Define rack height independently of row count.
5. Add atomic plan HDF creation and network-aware equipment payloads. Keep the existing plan revision/transaction model.
6. Update seed, plan JSON compatibility/backfill, migrations, validation, response serialization, and OpenAPI together.

### Acceptance

- Active devices cannot have zero/multiple network memberships; passive equipment has no exclusive membership.
- Multiple circuits/networks can share one HDF and even one subpanel on different positions.
- N-row HDF capacity is 4N subpanels / 24N positions / 48N side endpoints. A four-row fixture creates 96 positions, not 48 ports.
- Local numbering restarts per subpanel. Graph identity never comes from a rendered label.
- Opposite sides bridge only within the same local position/subpanel. Occupancy and placement conflicts roll back the complete command.
- New migrations replay cleanly, upgrade existing installed/plan fixtures explicitly, and do not silently change cable identities or ownership.

### Verification

Domain red/green tests, real PostgreSQL migration/round-trip/rollback tests, API contract tests, relevant frontend type/build checks if schemas change.

### M1 implementation design (agreed 2026-10-03)

This fixes the representation choices left open in [backend-contract-notes.md](backend-contract-notes.md) §3. Follow it; flag a genuine conflict with the code or docs instead of choosing a different model mid-checkpoint.

**Baseline facts this builds on:** `topology.Equipment` has `kind` (`switch`/`panel`) and free-text `role`; `Validate` does not check roles. `Endpoint.Subpanel` is a string. Plans persist as JSON in `plans.additions` (`Equipment`, `Updates`, `Endpoints`, `Links`). `add_equipment` caps ports at 48 and allows only `access`/`aggregation` switches. The `endpoints` table has a `subpanel text` column with a partial unique index on `(equipment_id, subpanel, position, side)`.

1. **Networks.** Add `topology.Network{ID, Name}` and `Snapshot.Networks`. Add `Equipment.NetworkID` (`networkId`). It is required and must reference an existing network for `switch`. It must be empty for `panel` and `hdf`. No default network exists anywhere.
2. **Roles.** `Validate` enforces role by kind: `switch` → `access` | `aggregation` | `backbone`; `panel` and `hdf` → `passive`. Roles are never derived from names.
3. **HDF structure.** Add equipment kind `hdf` and `topology.Subpanel{ID, EquipmentID, Row, Column}` with `Snapshot.Subpanels`. Column is `A`–`D`; row is 1–32. Replace `Endpoint.Subpanel` (string) with `Endpoint.SubpanelID` (stable ID; empty for standard panels and switches). Endpoint position is local to its subpanel (1–6 for HDFs). Labels are display text only and are never parsed.
4. **HDF completeness.** `Validate` requires every `hdf` to have a complete grid: rows 1..N with all four columns, each subpanel with positions 1–6, a front and rear endpoint per position, and exactly one internal bridge per position. N is derived from the stored subpanels; it is not duplicated as a separate field. Rack height is the equipment's own `height`, independent of N.
5. **Bridges.** An internal link is valid only between opposite sides of the same position on the same subpanel (or the same standard-panel position). Same-chassis external cables remain rejected.
6. **Plan commands.** `add_equipment` takes `networkId` (required for switches; rejected for panels) and accepts the `backbone` role. A new `add_hdf` command takes `{name, rackId, unit, height, rows}` and creates the chassis, 4N subpanels, 24N positions, 48N endpoints, and 24N bridges atomically. `planning.Plan` gains `Subpanels`, persisted in the same JSON document. Generated IDs are opaque and allocated at the application boundary, as today.
7. **Migrations.** Two append-only migrations, each shipped in the step that needs it. **`003` (networks):** create `networks`; add `equipment.network_id` with a check that it is present exactly for `switch`. Before altering anything, it raises a clear error telling the user to reset the development database and reseed if any switch exists or any saved plan's additions contain switch equipment, because no membership is known. It never assigns a default network. **`004` (HDF):** create `subpanels`; add `hdf` to the kind constraints; replace `endpoints.subpanel` with a nullable `subpanel_id` foreign key and an equivalent uniqueness rule. It raises the same kind of error if any endpoint has a non-empty legacy `subpanel` string.
8. **Fixtures.** Add an acceptance fixture (Networks A/B and all inventory and cables from [acceptance-example.md](acceptance-example.md)) and make it the `cmd/db seed` data. The prototype `sample` fixture gains one explicitly labeled prototype network and stays in use for Go characterization tests, `cmd/testserver`, and Playwright until M3.

### M1 steps

Each step changes the domain, persistence, and contracts together so the whole repository is green at the end of the step (Go tests with `TEST_DATABASE_URL`, frontend tests, typecheck, build, and Playwright when the API changed). Each step starts with failing tests and is reviewed before the next begins. Test IDs refer to [acceptance-tests.md](acceptance-tests.md).

| Step | Work | Tests |
| --- | --- | --- |
| 1 | **Networks and roles.** `Network`, `NetworkID`, `backbone`, membership and role-by-kind validation; `add_equipment` takes `networkId`; `sample` gains a labeled prototype network; migration `003`; persistence load/seed; snapshot JSON, OpenAPI, `types.ts`/`api.ts`, and the plan form's network/BB fields (the Playwright planning spec creates a switch). **Review migration `003` before it runs on the development database.** | D01–D03, D14 (networks), D15 preflight, A04 |
| 2 | **HDF structure.** `Subpanel`, `hdf` kind, `SubpanelID`, grid completeness, subpanel-scoped bridges and occupancy; migration `004`; persistence; snapshot JSON, OpenAPI, frontend types. **Review migration `004` before it runs.** | D04–D11, D13, D14, D16 |
| 3 | **Atomic HDF creation.** `add_hdf` command; `Plan.Subpanels` in overlay and plan JSON; OpenAPI and client types | D12, A05, A09 |
| 4 | **Acceptance fixture.** Fixture package: validates; HDF-01 96/192 and HDF-02 72/144; existing aggregation trace from EDGE-17 reaches AGG-03 and AGG-08 (BB discovery is M2); `cmd/db seed` uses it | D04, D05, D08 |
| 5 | **Status and handoff.** Update [current-status.md](current-status.md), README smoke flow, and verification notes; full check run including `go vet`, `-race`, and format | Full check run |

Resetting the development database (needed once migration `003` exists) deletes local data. Ask the user before running it.

## M2 — Network-aware physical destination discovery (complete)

### Scope

1. Extend the engine/API to discover both AGG and BB as terminal destinations.
2. Search independently from starting ports; collect matching endpoint routes instead of returning one preferred switch.
3. Preserve actual roles, list AGG before BB, and retain BB routes when AGGs are reachable.
4. Restrict accepted destinations to the source network; report encountered cross-network endpoints separately.
5. Explain disconnected/non-target terminals, cycles, and search/result limits. Do not transit through active equipment.
6. Add response location references and exact HDF identities for both views.
7. Define focused equipment/neighborhood and route-object fetch contracts so later UI visibility is independent of tracing.

### Acceptance fixture

```text
EDGE-17 / Network A:
  port 1 → standard panel + HDF positions → AGG-03
  port 2 → independent passive positions → AGG-08
  port 3 → independent passive positions → BB-01

AGG-15 / Network A exists but is not physically reachable.
EDGE-22 / Network B uses another position on the same HDF subpanel.
```

All three Network A routes are returned. BB remains BB. Network B shares passive infrastructure without bridging into Network A. Exact port-to-port behavior remains correct in both directions.

### Verification

Pure engine tests, API contracts, PostgreSQL snapshot/revision tests, installed/planned parity, mismatch/termination/limit cases.

### Recorded answers (2026-10-04)

1. **API mode:** a new `distribution` mode ("Find AGG / BB") **replaces** `aggregation`. The old mode is removed in the same checkpoint, and the UI and tests move to the new mode, so no path silently drops BB results.
2. **Passive starting port:** the search starts from the exact panel/HDF port, not from the panel. The source network comes from the active device found on that port's own circuit (one or more hops away, through cables and same-position bridges). The panel itself never supplies a network, and nothing is inferred from names.

### M2 implementation design (agreed 2026-10-04)

**Baseline facts:** `pathfinding.Trace` builds a bidirectional adjacency list from cables and internal bridges, then runs one BFS per starting endpoint and returns the shortest route to each reachable target. `aggregation` mode targets every endpoint whose equipment role is `aggregation`, excluding the starting device, with no network scope. Because an endpoint holds at most one external cable and one internal bridge, a physical circuit is a chain (or a loop) with at most two ends, and BFS already stops at switch ports because they have no internal links.

1. **Request.** `{"mode":"distribution","device":"<equipment>"}` searches every port of an active device. `{"mode":"distribution","start":"<endpoint>"}` searches one exact port, which may be a device port or a panel/HDF port. Exactly one of `device`/`start`; `end` is rejected. A `device` must be a switch. `point_to_point` is unchanged.
2. **Source network.** For a device or device-port start, it is the device's `networkId`. For a passive start, it is the `networkId` of the non-destination active endpoint (role `access`) on the same circuit. If the circuit has no such endpoint (for example, a dead end on one side), the source network is unresolved: results are still returned, each with the destination's own network and `sourceNetworkId` empty, and the start outcome says so. It is never guessed.
3. **Destinations.** Endpoints whose equipment role is `aggregation` or `backbone`, excluding the starting device. A destination in the source network is a **route**. A reached `aggregation`/`backbone` endpoint in a different network is a **mismatch**, reported separately and never as a route. With an unresolved source network, every reached destination is a route.
4. **Result fields** (added to the existing `context`, `revision`, `mode`, `status`, `reason`, `routes`):
   - each route and mismatch: `start`, `end`, `hops` (unchanged), plus `destinationEquipmentId`, `destinationRole` (actual role: `aggregation` or `backbone`), `destinationNetworkId`, and `sourceNetworkId`;
   - `mismatches`: the same shape as routes;
   - `starts`: one entry per searched endpoint, `{endpoint, outcome}`, where outcome is `reached` (at least one route), `mismatch` (only mismatches), `no_destination` (connected, but the circuit ends at a non-destination endpoint or a passive dead end), `disconnected` (no external cable), or `unresolved_network` (passive start with no source device on the circuit);
   - `truncated`: true when the route limit was hit.
   Location references (rack, node, site) and HDF identity (subpanel row/column, position, side) are resolved by the client from stable endpoint/equipment IDs in the snapshot it already loads. No duplicate location payload is added in M2.
5. **Ordering.** Routes are sorted by destination role (`aggregation` before `backbone`), then start endpoint ID, then destination endpoint ID. Mismatches and starts are sorted by endpoint ID. Distinct start/destination endpoint pairs are never merged.
6. **Limits.** BFS visits each endpoint at most once per start, so loops terminate. A fixed `MaxRoutes` (1,000) caps routes plus mismatches; when it is reached, `truncated` is true and the reason says so. A limit never produces an "unreachable" claim.
7. **Status.** `reached` if any route exists, otherwise `unreachable`, with a reason derived from the start outcomes.
8. **Deferred to M3 (scope item 7):** focused equipment/neighborhood and route-object fetch APIs. The frontend still loads full snapshots, so these contracts are designed when M3 starts, against the real map's needs.

### M2 steps

Same rules as M1: each step is test-first, ends with the whole repository green (Go with `TEST_DATABASE_URL`, frontend tests, typecheck, build, Playwright), and is reviewed before the next. Test IDs refer to [acceptance-tests.md](acceptance-tests.md); engine tests use the acceptance fixture plus small purpose-built snapshots.

| Step | Work | Tests |
| --- | --- | --- |
| 1 | **Engine: distribution mode for active starts.** New mode in `pathfinding`, AGG and BB destinations, source-network filter, mismatches, result fields, ordering, `starts` outcomes, `MaxRoutes`/`truncated`. `aggregation` stays in the engine until step 3. | P01–P08, P13, P15, P16, P20 |
| 2 | **Engine: passive starting ports.** Source network from the circuit's active endpoint; `unresolved_network` outcome; extended fixture with four alternating passive positions | P09–P12, P14, P17 |
| 3 | **API and UI switch-over.** Remove `aggregation` from engine and API; OpenAPI; installed/planned parity through PostgreSQL; `types.ts`/`api.ts`; Trace panel and inspector action renamed **Find AGG / BB**, each result showing destination name, role (AGG/BB), and network, with mismatches and truncation listed separately; update the Playwright specs that used `aggregation` | P18, P19, A01, frontend tests, Playwright |
| 4 | **Status and handoff.** `current-status.md`, README smoke flow (EDGE-17 → AGG-03, AGG-08, **and BB-01**), `backend-contract-notes.md` | Full check run |

## M3 — Approved conceptual map (complete)

### Scope

1. Replace the nested ownership canvas with connected equipment and actual cable references. Keep location labels and optional groups.
2. Full-page shell with expandable overlay tools; network and installed/plan context independent of view mode.
3. Route-result selection for all AGG/BB candidates, exact hop highlighting, and missing-object loading.
4. Compact HDF parents; automatic selected-trace positions and independently controlled manual expansion.
5. Implement scoped overview/location/neighborhood presentation. Dense core and distant locations stay summarized until focused.
6. Keep drag state local, graph references stable, and save/trace changes incremental. Do not remount by revision.

### Acceptance

- AGG/BB result changes do not rearrange equipment or reset zoom/pan.
- Network filtering retains relevant shared panels/HDF positions and does not change backend connectivity.
- Clearing a trace removes only automatic detail; manual expansion survives.
- HDF parent identity stays visible; multiple used positions stay distinct.
- Exact trace objects can be revealed across collapsed/previously unloaded locations.
- Current prototype characterization tests are updated to the approved map semantics, not deleted to conceal regressions.

### Verification

Projection/unit tests, component interactions, browser tests against the real API, TypeScript/build, representative render/drag measurements.

### Recorded answers (2026-10-04)

1. **First layout:** layered by role. Access switches on the left, passive equipment in the middle ordered by cable distance from access, AGG/BB on the right. Unconnected equipment is parked aside. Every card carries its site/node/rack label. Users can drag freely afterwards.
2. **Map drag:** dragging only changes map layout. Rack placement proposals go through the inspector's placement form and the rack view. Drag-to-rack on the map returns with M5 editing.
3. **Scoped backend APIs:** deferred to M6, designed against measured large-network data. M3 keeps loading the full snapshot and does focus, collapse, and summaries on the client.
4. **Physical tab:** M3 adds the Conceptual / Physical switch. Physical shows the existing rack view until M4 replaces it.

### M3 implementation design (agreed 2026-10-04)

**Baseline facts:** `features/whiteboard/hierarchy.ts` nests every equipment card inside site → node → rack containers and draws cables between cards (bundled when a container is collapsed). `Whiteboard.tsx` keeps drag state local, remembers positions for the session in an App-level ref, memoizes the projection, fits the view once, and implements drag-to-rack through rack containers. `App.tsx` (about 1,050 lines) holds the shell, drawers, trace tool, and inspector, and remounts the workspace when Installed/Plan context changes. Playwright runs on the single-network prototype `sample` fixture, which has no HDF.

1. **New feature folder.** The map lives in `frontend/src/features/map/`: pure projection modules plus a `ConceptualMap` component. `App.tsx` only wires it in. `features/whiteboard/` is deleted once the map replaces it; its tests are replaced, not silently dropped.
2. **Nodes and edges.** One card per equipment, including one card per HDF, never one per circuit. One edge per cable record, carrying the cable ID and both endpoint IDs. An edge attaches to an endpoint handle when that endpoint is shown as a facet (below); otherwise it attaches to the card's summary anchor. Parallel cables between the same two cards that both attach to summary anchors are drawn as one bundle labeled "N cables" that keeps every cable ID. Bundles and anchors are drawing aids only and never feed traversal.
3. **First layout (deterministic, no new dependency).** Column 0 holds access switches. Passive equipment goes in column 1 + its minimum cable distance in equipment hops from any access switch. AGG/BB go in the column after the last passive column. Equipment not reachable from any access switch goes in a parked row below. Within a column, cards are ordered by the average row of their cabled neighbors in the previous column, then by name. The layout is computed only for cards that have no position yet. Existing positions are never recomputed when data changes.
4. **Positions and viewport.** Drags stay local to the canvas and are recorded at drag stop in a session-level store keyed by equipment ID, shared by Installed and Plan. Viewport (pan/zoom) is kept in the same store. Refetches, trace changes, network changes, and context switches never refit or reset it; the map fits once per session. Nothing is persisted to the server (M6).
5. **Facets (exact endpoint detail on a card).** A facet is one switch port, or one standard-panel/HDF position showing its front and rear endpoints and the bridge between them. A card shows a summary ("N of M cabled") plus two independent facet sets:
   - **automatic:** the endpoints of the selected route on that equipment, derived from the route and replaced when the route changes or clears;
   - **manual:** positions or ports the user chose to show, kept in map state per equipment, unaffected by route changes.
   HDF facets read "3C / 5" with the parent HDF name always visible. Several positions on one HDF show as separate facets under the same card.
6. **Network filter.** The header gets a network selector: "All networks" or one network. With one network selected, the map shows that network's active devices, plus passive equipment that carries at least one circuit of that network, plus the cables between shown cards. A passive card shows badges for the networks of the circuits through it. A circuit's network is the network of its access device, computed by the same rule as the engine's passive start, in a pure tested function. The filter is presentation only and never changes what a trace finds.
7. **Trace on the map.** Find AGG / BB starts from the selected card (all ports) or a selected port facet; exact port-to-port stays in the Trace tool. An expandable results overlay lists every route, AGG first, with destination, role, and network, plus mismatches and truncation as today. Selecting a result highlights its cables and bridges on the existing map, reveals its automatic facets, and leaves every card position and the viewport unchanged. "Clear trace" removes only automatic facets and highlights. If a route touches a card that the current network filter or focus hides, that card is shown while the route is selected.
8. **Focus and summaries.** A location focus (site or node, chosen in the Explore drawer or from a card's location label) limits the map to that location's equipment plus their direct cable neighbors. Cables that leave the focus are summarized as boundary bundles ("N cables to Main Distribution") that keep cable IDs and can be expanded into the real cards. Clearing focus restores the full map with positions intact.
9. **Shell.** The header holds Conceptual / Physical, the network selector, and Installed / Plan, which are independent controls. Physical shows the existing `RackView` until M4. Tool rail and drawers stay overlays on the full-page map.
10. **Editing kept as-is.** Dropping a library item on empty map space still creates an unplaced, unsaved preview. Drag-to-rack on the map is removed (answer 2); the inspector's placement form and the rack view still propose placements.
11. **Browser tests.** `cmd/testserver` switches to the acceptance fixture, so Playwright covers Networks A/B and the HDFs. Specs that characterize the nested canvas (`hierarchy.spec.ts`, the canvas parts of `workspace.spec.ts` and `placement.spec.ts`) are rewritten for the map; placement and planning behavior stays covered through the inspector and rack view. The `sample` fixture remains for Go characterization tests.

### M3 steps

Same rules as M1/M2: test-first, the whole repository green at the end of each step (Go with `TEST_DATABASE_URL`, frontend tests, typecheck, build, format, Playwright), reviewed before the next. Test IDs refer to [acceptance-tests.md](acceptance-tests.md).

| Step | Work | Tests |
| --- | --- | --- |
| 1 | **Pure projection** in `features/map/`: deterministic layered layout, one edge per cable with summary bundling, facet model (automatic and manual), circuit network classification and network filter. No UI change yet | C01, C06, C07, C08, C09 (unit) |
| 2 | **Map replaces the whiteboard.** `ConceptualMap` component; header with Conceptual / Physical and network selector; layout-only drag; session positions and viewport preserved across refetch, filter, and context switch; library preview kept; `cmd/testserver` on the acceptance fixture; nested-canvas specs rewritten; `features/whiteboard/` removed | C01, C10, C11, C12 |
| 3 | **Trace on the map.** Find AGG / BB from a card or port facet; results overlay with all routes; in-place highlighting with automatic facets; clear trace; hidden route cards revealed while selected | C02, C04, C06, P18 (UI) |
| 4 | **Manual expansion.** "Show connections" on a card lists its cabled positions/ports with search and toggles manual facets; route changes and clearing never remove them; other networks' circuits are labeled | C03, C05 |
| 5 | **Focus and summaries.** Location focus with boundary bundles that keep cable IDs and expand to real cards; selected routes reveal objects outside the focus | C09, C13 |
| 6 | **Status and handoff.** `current-status.md`, README smoke flow on the new map, `ui-spec`-relevant notes, `CLAUDE.md` | Full check run |

## M3.1 — Map polish and small features

A short checkpoint between M3 and M4, requested by the user on 2026-10-05. It refines the M3 map and inspector and adds no API, migration, or backend behavior. Nothing in it pulls M5 or M6 work forward: no saved layout, no undo, no drag-to-rack, no delete/disconnect, no HDF creation UI.

### Recorded answers (2026-10-05)

1. **Scope.** Polish: card overlap, results overlay under drawers, hop list on the map, searchable trace picker, the unexplained `hdf-display` flake plus a mismatch browser spec. Features: find on map, reset layout, and inspector improvements. The 500-for-half-valid-plans fix is not in scope.
2. **Find on map** finds equipment by name, centers on its card, and highlights the card, every card it is cabled to, and those cables in a distinct "found" color (amber), independent of the teal trace highlight. Both can show at once.
3. **Inspector** gets all four improvements: connection details per cabled endpoint, a grouped and filterable list, per-endpoint actions, and location actions.

### M3.1 implementation design (agreed 2026-10-05)

1. **Card growth never moves other cards.** "Show connections" opens as a floating popover attached to the card (React Flow `NodeToolbar` or an equivalent portal), so it no longer changes the card's size. A card that is selected, has its popover open, or carries facets is raised above its neighbors. Positions are still only changed by the user's drag or by Reset layout.
2. **Overlay and drawers.** The map results overlay keeps clear of open drawers: its left and right edges follow the open left or right drawer, so every overlay button stays clickable with the Trace tool, inspector, Explore, or library open. Map controls (zoom, find, reset) follow the same rule.
3. **Hops on the map.** The selected route row in the map overlay expands to the ordered hop list (start, then each hop as CABLE or PANEL BRIDGE with the endpoint label and link ID), built by a pure helper shared with `TracePanel`. Clicking a hop selects its equipment and centers the view on its card at the current zoom.
4. **Centering is an explicit user action.** "Center on card" (used by find, hop clicks, and the inspector's Show on map) pans to the card at the current zoom, with a short animation, and records the new viewport in the session. It is not a refit. Automatic refits remain forbidden.
5. **Find on map.** A search field in the map controls matches equipment by name (case-insensitive substring, ranked by prefix match, then name), with keyboard navigation (arrows, Enter, Esc). Choosing a result selects the card, centers on it, and sets the **found** state: the card, its direct cable neighbors, and the cables between them get the amber found style. The found state is pure (`found.ts`: card ID → neighbor IDs and cable IDs) and kept in `mapSession`. When a line is both on the selected route and found, the teal route style wins and the amber is shown as an outline, so both stay readable. Found cards hidden by the network filter or focus are shown while found, exactly like route cards. A new search, the × button, or Esc clears it. Neither clearing the trace nor clearing the find affects the other.
6. **Reset layout.** A map control with an inline confirm ("Reset layout?" → "Reset"). It drops every recorded card and boundary position, recomputes the first layered layout for all cards, and fits once. Pinned facets, focus, filter, found state, and the trace are kept.
7. **Inspector.** It moves out of `App.tsx` into `frontend/src/features/inspector/` (pure helpers plus components). Header: name, role, network (switches), installed/proposed, and "N of M cabled". Location: site / node / rack, where the site and node focus the map and the rack opens it in Physical. Endpoint list:
   - grouped: switch ports, panel positions (front and rear together), and HDF positions by subpanel (1A, 1B, …), with subpanel groups collapsible;
   - filter **Cabled / Free / All** plus label search ("3C/5" and "3C / 5" alike). The default is Cabled when the equipment has more than 48 ports or positions, otherwise All;
   - each cabled side shows its far end ("→ HDF-01 · 3C/5 rear"), the cable ID, and the circuit network;
   - per endpoint or position: **Find AGG / BB from here**, **Pin on map** (the same manual facet as "Show connections"), and **Show on map** (select and center the card).

   Lookups come from a per-snapshot index (endpoint → cable, far end), never an endpoints × links scan as the current list does.
8. **Searchable trace picker.** The Trace tool's Start and Destination selects become comboboxes keeping the accessible names "Start" and "Destination". They match equipment ("EDGE-17 · all ports" in distribution mode) and endpoints by "equipment label" tokens, so "edge-17 3", "hdf-01 3c/5", and "panel-a 1 rear" all work. They show at most 50 matches with a "refine the search" note. Matching is a pure, unit-tested function over a per-snapshot list.
9. **Flake and mismatch coverage.** Find the cause of the `hdf-display.spec.ts` failure from M3 step 5 before changing the test. The working hypothesis is that a newly proposed, unconnected card is placed in the parked row outside the fitted view, and `onlyRenderVisibleElements` does not render it, so "visible" depends on timing. Fix the cause (or use find on map in the test if it is expected behavior) and document it. Add a browser spec for a cross-network cable (EDGE-17 Port 4 → AGG-12 Port 2 in a draft): three routes plus AGG-12 under "On another network (not routes)" in both the map overlay and the Trace tool.

### M3.1 steps

Same rules as M3: test-first, the whole repository green at the end of each step (Go with `TEST_DATABASE_URL`, frontend tests, typecheck, build, format, and Playwright three times in a row), reviewed before the next. Test names use the IDs below.

| Step | Work | Tests |
| --- | --- | --- |
| 1 | **Layout polish.** Connections popover, raised cards (design 1); overlay and controls clear of drawers (2); Reset layout (6) | POL-01 popover does not resize the card or move neighbors; POL-02 every overlay button is clickable with each drawer open; POL-03 reset recomputes the first layout and keeps pins, focus, filter, and trace |
| 2 | **Hops and find.** Hop list in the map overlay with center-on-click (3, 4); find on map with the amber found state (5) | POL-04 hop list order and labels match `TracePanel`; POL-05 clicking a hop selects and centers without changing zoom; POL-06 find centers on EDGE-17 and highlights EDGE-17, PANEL-A, and cable-a01/a05/a09 in amber; POL-07 found and trace highlights coexist and clear independently; POL-08 a found card hidden by the filter or focus is shown while found |
| 3 | **Inspector.** `features/inspector/` with header, location actions, grouped and filtered list, connection details, and per-endpoint actions (7) | POL-09 HDF-01 lists its 4 cabled positions by default, grouped by subpanel, with far ends, cable IDs, and networks; POL-10 Find AGG / BB, Pin, and Show on map from an inspector entry; POL-11 location actions focus the node and open the rack |
| 4 | **Trace picker and test hygiene.** Searchable Start/Destination (8); `hdf-display` flake cause and fix; mismatch browser spec (9) | POL-12 picker matching (unit) and keyboard use; POL-13 the mismatch spec; the flake explained in the commit message |
| 5 | **Status and handoff.** `current-status.md`, README smoke flow, `ui-spec` notes, `CLAUDE.md` | Full check run |

## M4 — Approved physical explorer

### Scope

1. Site cards and legacy-inspired site/node visual navigation with explicit ownership relationships.
2. Node-owned rack previews and full elevations with correct multi-unit equipment.
3. Device banks, standard panel sides, and four-column variable-row HDF grids.
4. Shared selection/trace context, clickable breadcrumbs, direct map-to-endpoint navigation, side switching, and peer-cable inspection.
5. Keep complete physical inventory distinguishable from selected network/trace scope.

### Acceptance

Select a route → Physical → site → node → rack → HDF → exact position/side → opposite side or connected equipment → return to the same conceptual route. All cable IDs, positions, networks, and highlights agree. No stacked modal navigation or invented floor-plan coordinates.

### Verification

Browser end-to-end walkthroughs for AGG and BB routes, shared-subpanel networks, front/rear identities, and route-preserving back navigation.

## M5 — Complete planned infrastructure editing

### Scope

Site/node/rack creation; HDF-aware equipment creation; explicit connection and placement actions; validated delete/disconnect/move commands. Unplaced previews and non-drag alternatives use the same services. Draft lifecycle remains separate from installed truth.

### Acceptance

Invalid assignment, capacity, height, occupancy, or stale-revision operations do not partially save. Deleting a board reference cannot delete equipment. Draft topology and installed topology are independently traceable. No creation UI implies that equipment is physically installed.

## M6 — Layout persistence, undo, and measured scale

### Scope

Persist workspace references/coordinates/expansion preferences; separate layout and plan undo; scoped summary/bundle APIs; bounded neighborhoods; detailed-port virtualization. Add revision-keyed graph caching only when justified by measurements.

### Acceptance

Reload restores layout/context without changing physical placement. Summary counts map to real cables. Search/focus/trace operate on representative hundreds-of-equipment and thousands-to-tens-of-thousands-of-cables datasets, including large HDFs. Record measured graph-build/search/render/drag costs and agreed budgets; do not cite static mockup counts as benchmarks.

## M7 — Identity, governance, and recorded implementation

Authentication/permissions, review/approval, explicit atomic recording of implemented plans, audit history, and data import/export. Approval does not imply installation. Concurrency conflicts remain explicit; user commands are not automatically rebased or retried.

## Handoff checklist per checkpoint

- Domain/API behavior matches the locked model and OpenAPI.
- Installed and planned snapshots agree with persistence and remain isolated.
- Relevant failing tests were observed and are now green.
- Frontend tests/type/build and browser checks appropriate to the change pass.
- No generated mockups, secrets, test artifacts, or dependencies are staged.
- Documentation reflects actual completed behavior, not the next checkpoint's intent.
