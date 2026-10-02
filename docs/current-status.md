# Current implementation status

This document describes the runnable baseline at the first repository commit. It does not imply that the approved product is finished. The implementation authority is [architecture.md](architecture.md) and [ui-spec.md](ui-spec.md).

## Implemented foundation

### Backend

- Go `net/http` API, PostgreSQL, pgx repositories.
- Explicit, embedded/checksummed SQL migrations and a separate non-overwriting seed command.
- Stable site/node/rack ownership and equipment placement.
- Standard panel endpoint-side validation, explicit internal bridges, and external cable occupancy.
- Pure physical traversal for exact endpoint-to-endpoint paths and **aggregation-only** discovery.
- Ordered cable/internal-bridge hops with context and revision.
- Consistent installed reads and validated plan overlays.
- Saved plan creation and `add_equipment`, `add_cable`, `move_equipment` commands.
- Draft/base revision conflicts, atomic validation, and rollback.

### Frontend

- React/TypeScript, TanStack Query, React Flow.
- Installed/planned switching, equipment/port selection, exact/aggregation tracing.
- Prototype nested site/node/rack canvas, physical rack elevation, overlay tools, inspector, plan forms, and trace highlighting.
- Drag-to-create previews, rack assignment/placement proposals, and a non-drag placement editor.
- Canvas-local dragging, session-only coordinates, memoized projections, and viewport-preserving saves.

### Verification and tooling

- Go domain/API/database tests and race checks.
- Frontend API and graph-projection tests, strict TypeScript/build, formatting.
- Browser integration tests use a test-only API and isolated PostgreSQL schema on ports 18080/5175.
- Development database/API/UI are separate from the legacy repository.

## Pending approved behavior

| Requirement | Baseline limitation | Planned checkpoint |
| --- | --- | --- |
| Active device network membership | No explicit network entities or membership yet | M1 |
| BB destinations alongside AGGs | Engine/API only recognize aggregation discovery | M1/M2 |
| Explicit HDF subpanels and local positions | Generic panel creation; string subpanel metadata is not a full HDF inventory model | M1 |
| Connected conceptual network map | Current canvas is a superseded nested ownership prototype | M3 |
| Network-scoped exploration and all AGG/BB results | Not implemented | M2/M3 |
| Compact/auto/manual HDF expansion | Not implemented in the app | M3 |
| Complete physical site/node/rack/port workflow | Rack elevation exists; full visual explorer and HDF grid are pending | M4 |
| Scoped summaries/neighborhood APIs and scaling | Full snapshots are still used for the small baseline | M2/M3/M6 |
| Saved layout and undo | Coordinates last only for the browser session | M6 |
| Full infrastructure/container creation | API installed reads plus limited draft additions | M5 |
| Delete/disconnect plan commands | Not implemented | M5 |
| Authentication, approval, explicit installation recording | Not implemented | M7 |

The prototype's generic 1–48 port creation limit does not support larger HDF layouts. Add a specific atomic HDF creation contract instead of claiming that generic panel creation already satisfies the requirement.

## Existing seed

Installed:

```text
EDGE-01 → PANEL-A front/rear → PANEL-B rear/front → AGG-02
```

The Expansion draft adds EDGE-02 and a direct cable to AGG-02. Fresh seed data has two physical nodes. Migration 002 preserves an existing database's originally recorded node instead of relocating equipment to match the newer seed.

These are development fixtures, not imported production inventory. Their roles, ownership, endpoints, and plans need explicit compatibility/backfill handling when the network/HDF contract is implemented.

## Retired artifacts

The static `conceptual-preview`, `network-workspace-mockups`, and `workflow-demo` directories—including generators, HTML, screenshots, and mock-only tests—have been removed. The agreed behavior is preserved in the architecture/UI documents. Existing application tests remain valuable characterization tests until replaced or extended by approved-behavior tests at the appropriate checkpoint.
