# Current implementation status

This describes what the code in this repository runs today, at the end of **M1 (network, role, and HDF domain contract)**. It does not imply that the approved product is finished: BB discovery (M2), the connected conceptual map (M3), and the physical explorer (M4) are not implemented. The implementation authority is [architecture.md](architecture.md) and [ui-spec.md](ui-spec.md).

The implementation handoff is indexed in [README.md](README.md). [agent-handoff.md](agent-handoff.md) summarizes the planning, and [acceptance-example.md](acceptance-example.md) is the source of the seed fixture described below.

## Implemented

### Domain and persistence (M1)

- **Networks and membership.** `topology.Network{ID, Name}` and `Snapshot.Networks`. Every `switch` has exactly one `networkId` that references an existing network; `panel` and `hdf` have none (they are shared). No default network exists anywhere. Networks are read-only through the API (`networks` in the snapshot) and are created only by seed/fixtures. Provisioning and renaming are not implemented.
- **Roles.** `Validate` enforces role by kind: `switch` is `access`, `aggregation`, or `backbone`; `panel` and `hdf` are `passive`. Roles are never inferred from names.
- **HDF structure.** Equipment kind `hdf` with `topology.Subpanel{ID, EquipmentID, Row, Column}` (`Snapshot.Subpanels`). Rows are 1–32, columns A–D, six local positions per subpanel. `Endpoint.SubpanelID` (a stable ID) replaces the old free-text subpanel; labels are display text and are never parsed. `Validate` requires every HDF to have a complete grid: rows 1..N with all four columns, a front and rear endpoint at each of six positions per subpanel, and exactly one internal bridge per position. An N-row HDF therefore has 4N subpanels, 24N positions, and 48N side endpoints. Row count is derived from the stored subpanels and is independent of rack height (the equipment's own `height`).
- **Bridges and occupancy.** An internal bridge is valid only between opposite sides of the same position of the same subpanel (or the same standard-panel position). Endpoint identity and occupancy are scoped to the owning subpanel, so local numbering restarts per subpanel. Same-chassis external cables remain rejected. Cables between devices on different networks are accepted; mismatch diagnostics are not implemented (M2).
- **`add_hdf` plan command.** `{name, rackId, unit, height, rows}` creates the chassis, subpanels, positions, endpoints, and bridges in one revision using `topology.NewHDF`, the same builder the fixtures use. `rows` must be 1–32 (checked before anything is built, so a command creates at most 128 subpanels, 768 positions, and 1,536 side endpoints); `unit` and `height` must be 1–100 and fit the rack without overlapping installed or proposed equipment. Any validation, placement, or revision failure persists nothing and leaves the draft revision unchanged. `add_equipment` still creates only switches and standard panels (1–48 positions); it rejects kind `hdf`.
- **Plans.** `add_equipment` takes `networkId` (required for switches, rejected for panels) and accepts the `backbone` role. `planning.Plan` carries `Subpanels` in the same JSON document. Plans saved without a `subpanels` key (or `null`) are read as an empty list. A stored plan that contains an HDF chassis without its complete grid is refused as an overlay instead of being served half-valid.
- **Migrations 001–004** (embedded, checksummed, append-only):
  - `003_networks.sql` creates `networks`, adds `equipment.network_id`, and requires it exactly for switches. Its preflight raises an error telling you to reset the development database and reseed if any switch exists, or any saved plan's `additions.equipment` array contains a switch, because no membership is known. It never assigns a default network.
  - `004_hdf_structure.sql` creates `subpanels`, adds `hdf` to the equipment kinds, and replaces `endpoints.subpanel` with a `subpanel_id` foreign key and an equivalent uniqueness rule. Its preflight raises the same kind of error if any installed endpoint or any saved plan endpoint has a non-empty legacy `subpanel` string. Empty strings are dropped and existing endpoint IDs are unchanged.
  - Both preflights run before anything is altered. A database that was seeded before M1 contains switches, so `migrate` refuses it: reset the development database and reseed (see the README).
- **Traversal** (unchanged by M1): pure physical BFS over external cables and same-position front/rear bridges; sibling device ports never create edges; HDF endpoints traverse like any other endpoint. Discovery is still **aggregation-only** plus exact point-to-point.
- Go `net/http` API, pgx repositories with the existing lock order (installed `FOR SHARE`, then draft `FOR UPDATE`), draft/base revision conflicts, atomic validation and rollback, consistent installed reads.

### Seeds and fixtures

- **`cmd/db seed` loads the acceptance fixture** (`internal/acceptance`, built from [acceptance-example.md](acceptance-example.md)): Networks A and B, 2 sites, 5 physical nodes, 7 racks (12U), 11 equipment (7 active, 4 passive), HDF-01 (4 rows: 16 subpanels, 96 positions, 192 endpoints) and HDF-02 (3 rows: 72 positions, 144 endpoints), and cables A01–B04. AGG-15 is intentionally uncabled. The seed creates **no draft plans**; create one in the UI or through the API. The revision is `acceptance-1`. The fixture is fictional development data, not imported inventory.
- **The prototype `internal/sample` fixture** (with one labeled "Prototype network") still backs the Go characterization tests, `cmd/testserver`, and the Playwright specs until M3 replaces the UI they characterize.
- Legacy NetTop import is not implemented; it is a separate, later checkpoint.

### API

`GET /api/topology` returns `networks`, `subpanels`, and equipment with `networkId`. Plans return `subpanels`. `POST /api/plans/{id}/commands` supports `add_equipment`, `add_hdf`, `add_cable`, and `move_equipment`. `POST /api/traces` supports `point_to_point` and `aggregation` only. See [backend-contract-notes.md](backend-contract-notes.md) and `api/openapi.yaml`.

### Frontend

- React/TypeScript, TanStack Query, React Flow.
- Installed/planned switching, equipment/port selection, exact/aggregation tracing.
- Prototype nested site/node/rack canvas, physical rack elevation, overlay tools, inspector, plan forms, and trace highlighting. With the acceptance seed it renders all 11 equipment, and the Trace panel lists EDGE-17 → AGG-03 and AGG-08 with the exact hop sequence.
- The plan form has a **Network** select for switches (empty by default; saving is disabled until one is chosen) and a **Backbone** role. There is no HDF creation UI.
- Equipment of kind `hdf` is treated as passive equipment (panel icon), never as an active device. There is no HDF grid, subpanel, or position UI.
- Drag-to-create previews, rack assignment/placement proposals, a non-drag placement editor, canvas-local dragging, session-only coordinates, memoized projections, and viewport-preserving saves.

### Verification and tooling

- Go domain/engine/API/database tests with `-race`; PostgreSQL tests use unique schemas and skip without `TEST_DATABASE_URL`.
- Frontend unit tests, strict TypeScript/build, formatting.
- Playwright against a test-only API (`cmd/testserver`, sample fixture) and an isolated schema on ports 18080/5175. One spec drives `add_hdf` through the real API.

## Pending approved behavior

| Requirement | Today | Planned checkpoint |
| --- | --- | --- |
| BB destinations alongside AGGs; network-scoped results | The engine and API discover aggregation only. BB-01 is reachable by exact point-to-point trace, but "Find AGG / BB" does not exist | M2 |
| Mismatch diagnostics for cross-network endpoints; passive-source scope; result limits | Cross-network cables are accepted without diagnostics; not implemented | M2 |
| Connected conceptual network map | The canvas is the superseded nested ownership prototype | M3 |
| Network-scoped exploration and all AGG/BB result interaction | Not implemented | M2/M3 |
| Compact/auto/manual HDF expansion | HDF is a passive card; no expansion UI | M3 |
| Physical site/node/rack/port workflow with HDF grids | Rack elevation exists; no site/node explorer and no HDF grid | M4 |
| Scoped summaries/neighborhood APIs and scaling | Full snapshots are still used. A 32-row HDF adds 1,536 endpoints to a snapshot | M2/M3/M6 |
| Saved layout and undo | Coordinates last only for the browser session | M6 |
| HDF-aware creation UI, container creation, delete/disconnect commands | `add_hdf` exists in the API only; sites/nodes/racks cannot be created; no delete or disconnect | M5 |
| Network provisioning and renaming | Networks are seed-only and read-only | Not scheduled |
| Legacy NetTop import with explicit ID/network/HDF mapping | Not implemented | Separate later checkpoint |
| Authentication, approval, explicit installation recording | Not implemented | M7 |

## Known issues

- **Flaky Playwright check.** `e2e/hierarchy.spec.ts` ("direct canvas drag proposes a rack move without resetting the viewport") failed once in one full Playwright run during M1 step 2. It passed when run alone and in every full run since, including with unrelated changes. The cause was not diagnosed. If it fails, rerun that spec alone and then the full suite before treating it as a regression.
- **Half-valid stored plans return 500.** An overlay that fails validation (for example, a stored plan with an HDF chassis but no grid) is refused, but `repositoryError` maps the plain validation error to a generic 500 "Database operation failed". Plans created through the API cannot reach this state.
- **Large drafts.** `GET /api/plans` returns full drafts, so a plan with a 32-row HDF carries about 2,400 additional records per plan listed. Pagination and scoped summaries are M6.

## Retired artifacts

The static `conceptual-preview`, `network-workspace-mockups`, and `workflow-demo` directories, including generators, HTML, screenshots, and mock-only tests, have been removed. The agreed behavior is preserved in the architecture/UI documents. Existing application tests remain valuable characterization tests until replaced or extended by approved-behavior tests at the appropriate checkpoint.
