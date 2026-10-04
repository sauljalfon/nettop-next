# Backend contract and migration notes

This distinguishes executable baseline facts from target design work. It supplements [architecture.md](architecture.md); it does not declare future schemas/endpoints implemented.

## 1. Current source map

| File/package | Baseline responsibility | Work relevant to M1/M2 |
| --- | --- | --- |
| `backend/internal/topology/model.go` | Snapshot, Site, LocationNode, Rack, Equipment, Endpoint, Link | Networks, membership, BB role, structured HDF identities/layout |
| `backend/internal/topology/validate.go` | Ownership, rack placement, endpoint-side/occupancy and bridge invariants | New network/HDF invariants without weakening current constraints |
| `backend/internal/pathfinding/engine.go` | Pure point-to-point and aggregation BFS over endpoint adjacency | AGG/BB collection, terminal/mismatch/limit explanations, network-aware result selection |
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
| `POST /api/traces` | `point_to_point` or `aggregation` request; same context parameters; optional `expectedRevision` query pin. No BB discovery yet (M2) |
| `GET /api/plans` | Saved drafts (full drafts, including proposed `subpanels`) |
| `GET /api/plans/{id}` | One draft |
| `POST /api/plans` | Name and `expectedBaseRevision`; creates an empty saved draft |
| `POST /api/plans/{id}/commands` | Revision-checked command: `add_equipment`, `add_hdf`, `add_cable`, or `move_equipment` |

There is no endpoint to create or rename networks; they exist only through seed/fixtures and are read in snapshots.

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

Current trace bodies:

```json
{"mode":"point_to_point","start":"edge-17:p1","end":"agg-03:p1"}
```

```json
{"mode":"aggregation","device":"edge-17"}
```

```json
{"mode":"aggregation","start":"edge-17:p1"}
```

These examples use the acceptance seed's IDs (`cmd/db seed`). The prototype `sample` fixture (browser tests, characterization tests) uses `edge-01`, `agg-02`, and similar. The aggregation action discovers AGG destinations only and has no network scope. BB-01 is reachable by exact `point_to_point`. The UI pins the loaded revision on trace requests.

Baseline errors: malformed request/context 400; missing plan 404; revision conflict 409; invalid domain operation 422; persistence failure 500; unhealthy database 503. An unreachable valid physical trace is a result, not a fabricated missing-endpoint error. A stored plan whose overlay fails validation is refused, but currently surfaces as 500 (see [current-status.md](current-status.md)).

## 3. Schema facts and migration risks

Migrations `001`–`004` are applied in order, embedded, and checksummed. Never edit an applied migration; append a new one.

- Installed inventory is normalized into sites, physical nodes, racks, equipment, subpanels, endpoints, links, link endpoint records, and rack occupancy. The installed root stores the topology revision and old single-site/room compatibility labels. Explicit sites/nodes were added in migration 002 without relocating recorded racks.
- **Networks (003).** `networks(id, name)`. `equipment.network_id` references it; a check requires it for `switch` and forbids it for every other kind. Equipment `role` is still free text in the database; the domain's `Validate` enforces role by kind.
- **HDF (004).** Equipment kind accepts `hdf`. `subpanels(id, equipment_id, row_number 1–32, column_letter A–D)` is unique per `(equipment_id, row, column)` and references an `hdf` chassis. `endpoints.subpanel_id` replaces the old `subpanel` text column: a composite foreign key `(subpanel_id, equipment_id)` makes an endpoint's subpanel belong to its own chassis, and a shape check requires `subpanel_id` exactly for `hdf` endpoints (position 1–6) and forbids it for switch and panel endpoints. The unique index on `(equipment_id, COALESCE(subpanel_id,''), position, side)` for panels and HDFs scopes position identity to the subpanel.
- **What the database does not enforce.** Grid completeness (every row has columns A–D, six positions, front/rear endpoints, one bridge per position) and bridge continuity are enforced by `topology.Validate` on every read and write path, not by SQL constraints.
- **Preflights.** `003` refuses to run if any switch or any saved plan switch exists; `004` refuses if any installed endpoint or saved plan endpoint has a non-empty legacy subpanel string. Both raise a clear error before altering anything and never guess a network or parse a label.
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

## 4. New contracts to define before frontend wiring

The following are **required capabilities**, not preapproved literal URL or command names. As of M1, reading networks and membership, creating network-aware equipment in a draft, and atomic HDF creation are implemented as described in §2; the rest are M2 and later:

- Read explicit networks and equipment membership.
- Create valid active equipment with a network reference in a draft.
- Atomically create an HDF with rows, parent rack, starting unit, independently configured height, subpanels, positions, endpoints, and bridges.
- Discover AGG/BB targets with source/target role and network metadata, exact hops, stopping outcomes, mismatch diagnostics, revision/context, and limits.
- Fetch location summaries, equipment neighborhoods, expanded HDF endpoints, and missing trace objects by stable IDs.
- Return authoritative physical references that let the frontend navigate to the same endpoint.

Decide how the current `aggregation` mode is extended/versioned or replaced by a distribution-destination mode. The user-facing action is **Find AGG / BB**. Do not remove BB results through an old AGG-first fallback or infer a role by display name.

Before coding a request shape, document mandatory/optional fields, unknown-field behavior, error status, revision semantics, and backward compatibility in OpenAPI and tests.

### Specific edge cases still needing an explicit contract

- Starting discovery from a passive endpoint: its chassis is shared, so choose explicit network scope, safe inference from known terminal membership, or a documented unclassified result behavior. Do not guess from the panel.
- Missing/unknown membership in imported inventory: handle via explicit backfill/preflight, not a silent default Network A.
- Cross-network wiring: detection/reporting is required; whether a creation command rejects every such proposal or permits documenting it with diagnostics was not settled by the design conversation.
- Network provisioning and renaming: define the smallest endpoint/seed capability needed by M1; broad administration/governance is later scope.
- HDF row limits and payload/schema sizing: confirm bounds, account for 48N side endpoints, and make failures atomic.
- Same-chassis external jumpers between different positions: the baseline rejects same-equipment cables. Preserve that behavior unless real operational requirements explicitly change it; an external jumper would still be a cable, never an implicit cross-position bridge.
- Search/result limits, pagination, and deterministic result ordering: choose explicit contracts and expose truncation. Limits must not manufacture an “unreachable” claim.
- Source already being a distribution device, or identical point-to-point endpoints: preserve existing exclusions/zero-hop behavior or document a deliberate compatibility change.

These implementation edge cases do not reopen the locked role, network, bridge, or two-view semantics.

## 5. Transaction discipline

Keep the current lock order: installed root `FOR SHARE` before draft `FOR UPDATE` for commands. Check draft revision and installed base, validate the whole overlay, persist, and increment the draft revision only on success. Future installed changes lock the root `FOR UPDATE` before mutating inventory.

Read topology consistently, including plan metadata and all required HDF identities. Do not query one endpoint at a time during BFS. Build adjacency from a validated snapshot. Cache by appropriate workspace/revision only after measurement and invalidate coherently with committed topology changes.

App startup verifies readiness. It must not run an undocumented `create_all`, reseed existing inventory, or fall back to fake memory data when PostgreSQL fails.

## 6. Keep graph truth separate from presentation

The graph's vertices are exact physical endpoints. Its edges are cables and same-position bridges. Network/circuit labels classify results; diagrams/bundles do not introduce adjacency.

Searching independently from eligible source ports is not the same as creating relay edges between sibling source ports. Intermediate active device endpoints terminate physical traversal. Network filters select valid destination scope but must not erase real passive continuity or suppress mismatch diagnostics.

The frontend can fetch a small view while the engine searches the complete relevant topology. A trace response must be sufficient to request/reveal every missing physical object needed to explain the result.
