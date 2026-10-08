# Backend contract and migration notes

This distinguishes executable baseline facts from target design work. It supplements [architecture.md](architecture.md); it does not declare future schemas/endpoints implemented.

## 1. Current source map

| File/package | Baseline responsibility | Work relevant to M1/M2 |
| --- | --- | --- |
| `backend/internal/topology/model.go` | Snapshot, Site, LocationNode, Rack, Equipment, Endpoint, Link | Networks, membership, BB role, structured HDF identities/layout |
| `backend/internal/topology/validate.go` | Ownership, rack placement, endpoint-side/occupancy and bridge invariants | New network/HDF invariants without weakening current constraints |
| `backend/internal/pathfinding/` | Pure BFS over endpoint adjacency: `engine.go` (point-to-point) and `distribution.go` (Find AGG / BB). Implemented in M2 | Focused neighborhood/route-object fetch contracts (M6) |
| `backend/internal/planning/overlay.go` | Installed snapshot plus additions/placement updates | Network/HDF-aware overlay compatibility and validation |
| `backend/internal/planning/commands.go` | `add_equipment`, `add_cable`, `move_equipment` | Dedicated HDF creation and explicit membership in valid device payloads |
| `backend/internal/persistence/store.go` | Repeatable-read inventory snapshots, seed, plan reads | Normalized HDF/network loading and explicit data backfill |
| `backend/internal/persistence/plans.go` | Locked, revision-checked draft operations | Persist complete atomic network/HDF proposals |
| `backend/internal/httpapi/server.go` | HTTP repository boundary, JSON/error/revision handling | Updated request/response contracts and scoped fetches |
| `backend/migrations/` | Applied SQL plus embedded/checksummed runner | Append migrations and preserve existing checksums |
| `backend/internal/sample/network.go` | Explicit small development seed | New labeled acceptance fixtures after data policy is confirmed |
| `api/openapi.yaml` | Current executable API | Update together with completed schema/API checkpoints |
| `frontend/src/shared/types.ts`, `api.ts` | Current handwritten TS mirror/client | Sync with changed contracts; generation can follow when justified |

## 2. Executable API today

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Database/process health, PostgreSQL storage mode |
| `GET /api/topology` | Installed snapshot by default; `context=planned&planId=...` for an overlay. Includes `networks`, `subpanels`, and equipment `networkId` |
| `POST /api/traces` | `point_to_point` or `distribution` (Find AGG / BB); `context=installed` or `context=planned&planId=...`; optional `expectedRevision` query pin (409 when stale). `aggregation` was removed and returns 422 |
| `GET /api/plans` | Saved drafts (full drafts, including proposed `subpanels`) |
| `GET /api/plans/{id}` | One draft |
| `POST /api/plans` | Name and `expectedBaseRevision`; creates an empty saved draft |
| `POST /api/plans/{id}/commands` | Revision-checked command: `add_equipment`, `add_hdf`, `add_cable`, or `move_equipment` |
| `GET /api/sites/{siteId}/layout` | Saved node positions of a site: `{siteId, positions: [{nodeId, x, y}]}`; only moved nodes, `[]` when none; 404 for an unknown site (M4) |
| `PUT /api/sites/{siteId}/layout/nodes/{nodeId}` | Body `{x, y}` (finite numbers within ±1,000,000); upserts one node's position and returns it. **Last write wins per node**, no revision check. 404 unknown site; 422 for a node of another site, an unknown node, or a missing, non-numeric or out-of-range coordinate; 400 for unknown fields (M4) |
| `DELETE /api/sites/{siteId}/layout` | Removes that site's saved positions only; 204, also when there are none; 404 unknown site (M4) |
| `POST /api/networks` | Body `{name}`; `201 {id, name}` with a server-generated, permanent ID (`network-` + random). Name trimmed, 1–64 characters, unique ignoring case: 422 empty or too long, 409 duplicate, 400 unknown fields (M4) |
| `PATCH /api/networks/{id}` | Body `{name}`; renames only the display name; `200 {id, name}`; 404 unknown ID, plus the same 422, 409 and 400 as above (M4) |

The layout and network writes are presentation and reference data: none changes a topology revision, a saved plan, or a pinned trace's revision. Snapshots list `networks` in creation order. There is no endpoint to delete a network (switches reference networks; deleting needs the M5 editing rules). Permissions are M7: until then anyone can create or rename a network and move a node.

Snapshot fields relevant to M1: `networks: [{id, name}]`; `subpanels: [{id, equipmentId, row, column}]`; equipment `kind` is `switch`, `panel`, or `hdf`, `role` is `access`, `aggregation`, `backbone`, or `passive`, and `networkId` is present exactly for switches; endpoints carry `subpanelId` (HDF endpoints only), `position`, and `side`.

Commands (every command requires `expectedRevision` and exactly one payload; unknown fields are rejected with 400, an unsupported or mixed payload with 422, a stale revision with 409; a failed command persists nothing and leaves the draft revision unchanged):

```json
{"type":"add_equipment","expectedRevision":"1","equipment":{"name":"EDGE-03","kind":"switch","role":"backbone","networkId":"net-a","rackId":"rack-a03","unit":4,"height":1,"portCount":24}}
```

```json
{"type":"add_hdf","expectedRevision":"2","hdf":{"name":"HDF-03","rackId":"rack-sm01","unit":7,"height":3,"rows":4}}
```

- `add_equipment` creates a switch (1–48 ports, `networkId` required, roles `access`/`aggregation`/`backbone`) or a standard panel (1–48 positions, role `passive`, `networkId` rejected). It rejects kind `hdf`.
- `add_hdf` creates the chassis, 4N subpanels, 24N positions as 48N endpoints, and 24N bridges in one revision. `rows` 1–32; `unit` and `height` 1–100 and independent of each other; the placement must fit the rack without overlapping installed or proposed equipment. Child IDs derive from the allocated chassis ID and are opaque.
- Plans created before `subpanels` existed read as having none. An overlay with an HDF chassis but no complete grid is refused.

Trace bodies (unknown fields are rejected with 400; request errors below are 422 with a stable message):

```json
{"mode":"point_to_point","start":"edge-17:p1","end":"agg-03:p1"}
```

```json
{"mode":"distribution","device":"edge-17"}
```

```json
{"mode":"distribution","start":"edge-17:p3"}
```

```json
{"mode":"distribution","start":"hdf-01:sp-3C:5:r"}
```

These examples use the acceptance seed's IDs (`cmd/db seed`). The prototype `sample` fixture (browser tests, characterization tests) uses `edge-01`, `agg-02`, and similar.

`distribution` request rules: exactly one of `device` (every port of that switch is searched) or `start` (one exact device port, or one exact panel or HDF port); `end` is rejected; a `device` must be a switch. 422 messages: "distribution requires exactly one starting endpoint or device", "distribution search takes a starting device or endpoint only", "unknown starting device", "distribution search starts from an active device", "unknown start endpoint", and, for any other mode, "mode must be point_to_point or distribution".

Result fields (all modes return `context`, `revision` (the revision that was traced), `mode`, `status`, `reason`, `routes`, `mismatches`, `starts`, `truncated`; the last three are empty or false for point-to-point):

- `routes`: source-network destinations. Each has `start`, `end`, ordered `hops` (`linkId`, `from`, `to`, `kind` = `cable` or `internal`), and, for distribution, `destinationEquipmentId`, `destinationRole` (`aggregation` or `backbone`, never relabeled), `destinationNetworkId`, and `sourceNetworkId` (omitted when the source network is unresolved). Sorted by role (AGG first), start endpoint ID, destination endpoint ID.
- `mismatches`: reached AGG/BB on another network, same shape, never routes. Sorted by start then destination.
- `starts`: one `{endpoint, outcome}` per searched endpoint, sorted by endpoint: `reached`, `mismatch`, `no_destination`, `disconnected`, `unresolved_network`.
- `truncated`: true only when routes or mismatches were dropped at the 1,000-result limit (routes are kept first).
- `status` is `reached` when any route exists, otherwise `unreachable`; `reason` is derived from the start outcomes.

Source network: a device or device-port start uses the device's network. A panel or HDF start uses the network of the access device on the same circuit, in either direction; with no access device (or access devices on different networks) it is unresolved, every reached destination is a route with its own network, and the outcome is `unresolved_network`. A circuit with no external cable at all is `disconnected`. Rack, node, site, and HDF subpanel/position/side are resolved by the client from the snapshot it loads; the response carries stable IDs only. See `api/openapi.yaml` for the schemas.

Baseline errors: malformed request/context 400; missing plan, site or network 404; duplicate network name 409; revision conflict 409; invalid domain operation 422; persistence failure 500; unhealthy database 503. An unreachable valid physical trace is a result, not a fabricated missing-endpoint error. A stored plan whose overlay fails validation is refused, but currently surfaces as 500 (see [current-status.md](current-status.md)).

## 3. Schema facts and migration risks

Migrations `001`–`006` are applied in order, embedded, and checksummed. Never edit an applied migration; append a new one.

- Installed inventory is normalized into sites, physical nodes, racks, equipment, subpanels, endpoints, links, link endpoint records, and rack occupancy. The installed root stores the topology revision and old single-site/room compatibility labels. Explicit sites/nodes were added in migration 002 without relocating recorded racks.
- **Networks (003).** `networks(id, name)`. `equipment.network_id` references it; a check requires it for `switch` and forbids it for every other kind. Equipment `role` is still free text in the database; the domain's `Validate` enforces role by kind.
- **HDF (004).** Equipment kind accepts `hdf`. `subpanels(id, equipment_id, row_number 1–32, column_letter A–D)` is unique per `(equipment_id, row, column)` and references an `hdf` chassis. `endpoints.subpanel_id` replaces the old `subpanel` text column: a composite foreign key `(subpanel_id, equipment_id)` makes an endpoint's subpanel belong to its own chassis, and a shape check requires `subpanel_id` exactly for `hdf` endpoints (position 1–6) and forbids it for switch and panel endpoints. The unique index on `(equipment_id, COALESCE(subpanel_id,''), position, side)` for panels and HDFs scopes position identity to the subpanel.
- **Node layout (005).** `node_layouts(node_id PRIMARY KEY REFERENCES location_nodes ON DELETE CASCADE, x, y double precision NOT NULL, updated_at)`, with a check that both coordinates are within ±1,000,000 (NaN fails it). It is a separate presentation table: not part of the installed topology, the plans, or the revision, and plans do not overlay it.
- **Network order and unique names (006).** `networks.seq` (a `bigint` from a sequence, unique, not null) records the creation order; existing networks are numbered in ID order so their colors do not change, and snapshots list networks by `seq`. A unique index on `lower(btrim(name))` makes names unique ignoring case and surrounding spaces. The preflight refuses, naming the colliding names, if the existing data already collides; it never renames or merges networks and records nothing.
- **What the database does not enforce.** Grid completeness (every row has columns A–D, six positions, front/rear endpoints, one bridge per position) and bridge continuity are enforced by `topology.Validate` on every read and write path, not by SQL constraints.
- **Preflights.** `003` refuses to run if any switch or any saved plan switch exists; `004` refuses if any installed endpoint or saved plan endpoint has a non-empty legacy subpanel string; `006` refuses if two network names collide ignoring case. Each raises a clear error before altering anything and never guesses a network, parses a label, or renames anything.
- Cable records and internal links share the baseline link tables and are distinguished by kind. `UNIQUE(endpoint_id, kind)` gives independent external-cable and internal-bridge occupancy.
- Rack-slot records enforce installed placement uniqueness; domain validation also checks bounds/height/ownership and complete overlay validity.
- Saved plans use metadata and JSONB additions/updates, not installed rows for proposed equipment. The JSON now includes `subpanels`. A missing or `null` key reads as an empty list; the JSON must still evolve explicitly alongside the normalized installed schema.

Changing only a Go struct or SQL table leaves old plan payloads and client mirrors inconsistent. Both installed data and saved plans are exercised by reconnect, rollback, and migration upgrade tests.

### Representation properties (implemented in M1)

1. Stable Network identity and required single device membership; passive objects have no exclusive device-style network assignment.
2. Stable HDF chassis/subpanel references with row, column, and parent fields; no parsing of connectivity from `3C` or a formatted label.
3. Local position uniqueness scoped to a subpanel (or a standard panel when no subpanel applies).
4. Independent front/rear endpoint IDs and exactly scoped internal bridges.
5. Existing endpoint/cable identities retained during migration; legacy data that cannot be mapped is refused, not remapped.
6. HDF row count independent of configured rack height.
7. All proposal additions validated against a coherent installed/plan snapshot.

The chosen design is an explicit subpanel entity with position and side kept on the endpoint (no separate Position table); a position is the pair of endpoints that share a subpanel and position number and are joined by one internal bridge.

## 4. Contract items: resolved and still open

Resolved in M1, M2 and M4 (see §2, §3, and [current-status.md](current-status.md) for the exact behavior):

| Item | Resolution |
| --- | --- |
| Read explicit networks and membership | `networks` and equipment `networkId` in snapshots (M1) |
| Create network-aware equipment in a draft | `add_equipment` with required `networkId` for switches, `backbone` role (M1) |
| Atomic HDF creation | `add_hdf` with rows 1-32, independent rack height, one atomic revision (M1) |
| Missing/unknown membership in imported inventory | Migration preflights refuse and tell you to reset and reseed; no default network is ever assigned (M1) |
| HDF row limits and payload sizing | 1-32 rows; at most 128 subpanels, 768 positions, 1,536 endpoints per command, atomic (M1) |
| Cross-network wiring | Creation accepts such cables; Find AGG / BB reports reached destinations on another network as `mismatches`, never routes (M1 decision, M2 reporting) |
| Same-chassis external jumpers | Still rejected; an external jumper would be a cable, never a cross-position bridge |
| Discover AGG and BB with role/network metadata, exact hops, outcomes, mismatches, revision/context, limits | `distribution` mode (M2) |
| Replace or extend `aggregation` | `distribution` ("Find AGG / BB") replaced `aggregation`; the old mode returns 422 so BB results cannot be dropped by an AGG-first fallback (M2) |
| Starting discovery from a passive endpoint | Search starts from the exact port; source network from the access device on the same circuit; never from the panel or a name; otherwise `unresolved_network` with the destination's own network (M2) |
| Source already a distribution device; identical point-to-point endpoints | The starting device is never its own destination; identical endpoints still give a zero-hop route (M2) |
| Search/result limits and ordering | 1,000 routes plus mismatches; explicit `truncated`; a limit never means unreachable; deterministic role/start/destination ordering (M2) |
| Network provisioning | `POST /api/networks` and `PATCH /api/networks/{id}`: create and rename, no delete; stable server-generated IDs; creation order and unique names by migration 006; no topology revision change (M4) |
| Saved node layout for the Physical site screen | `node_layouts` (migration 005) with the layout endpoints, last write wins per node, separate from topology and plans (M4) |
| Authoritative physical references for navigation | The response carries stable endpoint/equipment IDs; clients resolve rack/node/site and HDF subpanel/position/side from the loaded snapshot (M2; no duplicate location payload) |

Still open:

- **Focused equipment/neighborhood, expanded HDF endpoint, location-summary, and missing-route-object fetches by stable ID.** Deferred to M6 (the M3 map does focus, collapse, and summaries on the client over full snapshots), to be designed against measured large-network data.
- **Network deletion and permissions.** Creating and renaming networks is done (M4); deleting needs the M5 editing rules, and permissions and audit are M7.
- **Pagination.** `GET /api/plans` returns full drafts (M6).

A new request shape still requires documented mandatory/optional fields, unknown-field behavior, error status, revision semantics, and backward compatibility in OpenAPI and tests. These items do not reopen the locked role, network, bridge, or two-view semantics.

## 5. Transaction discipline

Keep the current lock order: installed root `FOR SHARE` before draft `FOR UPDATE` for commands. Check draft revision and installed base, validate the whole overlay, persist, and increment the draft revision only on success. Future installed changes lock the root `FOR UPDATE` before mutating inventory.

Read topology consistently, including plan metadata and all required HDF identities. Do not query one endpoint at a time during BFS. Build adjacency from a validated snapshot. Cache by appropriate workspace/revision only after measurement and invalidate coherently with committed topology changes.

App startup verifies readiness. It must not run an undocumented `create_all`, reseed existing inventory, or fall back to fake memory data when PostgreSQL fails.

## 6. Keep graph truth separate from presentation

The graph's vertices are exact physical endpoints. Its edges are cables and same-position bridges. Network/circuit labels classify results; diagrams/bundles do not introduce adjacency.

Searching independently from eligible source ports is not the same as creating relay edges between sibling source ports. Intermediate active device endpoints terminate physical traversal. Network filters select valid destination scope but must not erase real passive continuity or suppress mismatch diagnostics.

The frontend can fetch a small view while the engine searches the complete relevant topology. A trace response must be sufficient to request/reveal every missing physical object needed to explain the result.
