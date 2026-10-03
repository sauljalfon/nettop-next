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
| `GET /api/topology` | Installed snapshot by default; `context=planned&planId=...` for an overlay |
| `POST /api/traces` | Current `point_to_point` or `aggregation` request; same context parameters; optional `expectedRevision` query pin |
| `GET /api/plans` | Saved drafts |
| `GET /api/plans/{id}` | One draft |
| `POST /api/plans` | Name and `expectedBaseRevision`; creates an empty saved draft |
| `POST /api/plans/{id}/commands` | Revision-checked supported command |

Current trace bodies:

```json
{"mode":"point_to_point","start":"edge-01:p1","end":"agg-02:p1"}
```

```json
{"mode":"aggregation","device":"edge-01"}
```

```json
{"mode":"aggregation","start":"edge-01:p1"}
```

These examples use baseline seed IDs, not the final acceptance fixture. The existing aggregation action does not discover BB and has no network scope. The UI already pins the loaded revision on trace requests.

Baseline errors: malformed request/context 400; missing plan 404; revision conflict 409; invalid domain operation 422; persistence failure 500; unhealthy database 503. An unreachable valid physical trace is a result, not a fabricated missing-endpoint error.

## 3. Schema facts and migration risks

- Installed inventory is normalized into sites, physical nodes, racks, equipment, endpoints, links, link endpoint records, and rack occupancy.
- The installed root stores the topology revision and old single-site/room compatibility labels. Explicit sites/nodes were added in migration 002 without relocating recorded racks.
- Equipment currently supports `switch` and `panel` kinds, free-text stored role, rack placement, and no network foreign key.
- Endpoint identity includes equipment owner plus string subpanel, position, and side. The string is not a stable SubPanel entity.
- Cable records and internal links share the baseline link tables but are distinguished by kind. `UNIQUE(endpoint_id, kind)` gives independent external-cable and internal-bridge occupancy.
- Rack-slot records enforce installed placement uniqueness; domain validation also checks bounds/height/ownership and complete overlay validity.
- Saved plans use metadata and JSONB additions/updates, not installed rows for proposed equipment. That JSON must evolve explicitly alongside the normalized installed schema.

Changing only a Go struct or SQL table will leave old plan payloads and client mirrors inconsistent. M1 must exercise both installed data and saved plans, including reconnect/rollback cases.

### Target representation properties

Exact table/Go type choices are implementation work. Preserve these properties:

1. Stable Network identity and required single device membership; passive objects have no exclusive device-style network assignment.
2. Stable HDF chassis/subpanel references with row, column, and parent fields; no parsing of connectivity from `3C` or a formatted label.
3. Local position uniqueness scoped to a subpanel (or a standard panel when no subpanel applies).
4. Independent front/rear endpoint IDs and exactly scoped internal bridges.
5. Existing endpoint/cable identities retained during migration; record any explicit necessary remapping rather than silently recreating assets.
6. HDF row count independent of configured rack height.
7. All proposal additions validated against a coherent installed/plan snapshot.

A possible design is an explicit SubPanel entity plus a logical Position entity with two endpoints. Another can retain position metadata on endpoints with suitable constraints. Choose one, write its API/DB invariants, and implement it fully; do not mix global panel positions and local subpanel positions inconsistently.

## 4. New contracts to define before frontend wiring

The following are **required capabilities**, not preapproved literal URL or command names:

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
