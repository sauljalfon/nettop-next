# Implementation plan

Status: approved direction; implementation proceeds from the tested foundation described in [current-status.md](current-status.md). Mockup exploration is complete. This plan replaces the earlier prototype-first roadmap.

## Execution rules

- One semantic model: [architecture.md](architecture.md). UI acceptance: [ui-spec.md](ui-spec.md).
- Implement in small, runnable checkpoints. Add meaningful failing tests, make minimal changes, and verify green before proceeding.
- Define API/schema behavior before wiring the frontend. `api/openapi.yaml` describes the current prototype until a checkpoint updates it together with implementation.
- Keep migrations explicit and preserve recorded inventory/endpoint identity. Do not silently assign unknown production networks or reinterpret stored plans.
- Each checkpoint reports changed files, relevant test/build results, and the next step. Update current-status as behavior actually ships.
- No automatic commits or remote publishing. The baseline commit does not authorize subsequent commits.

## M1 — Network, role, and HDF domain contract (start here)

### Decisions to confirm before coding

The conceptual/physical split, shared passive equipment, and AGG/BB stopping rules are settled. The remaining discussion should resolve implementation inputs rather than reopen the visual direction:

1. **First-release workflow:** confirm that the first complete vertical slice is network selection → find all reachable AGG/BB routes → inspect the same HDF endpoint physically. Use this to prioritize the M1–M4 acceptance flow; editing and governance remain later checkpoints.
2. **Development data versus imported inventory:** decide whether M1 uses only explicitly labeled Network A/B development fixtures or must migrate existing real inventory. For imported data, provide an explicit active-device → network mapping; never infer membership from names or assign every device to a default network.
3. **HDF creation limits and physical dimensions:** confirm the supported row range and how users specify rack height. The approved shape remains four columns and six local positions per subpanel. Preserve the distinction between row count and actual equipment height.

Record the answers here before beginning schema/API changes. The build does not imply that these input decisions have already been made.

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

## M2 — Network-aware physical destination discovery

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

## M3 — Approved conceptual map

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
