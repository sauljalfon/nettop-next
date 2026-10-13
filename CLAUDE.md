# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

`AGENTS.md` holds the binding project rules (domain invariants, test-first, no auto-commits). The docs in `docs/` are the implementation contract; start at `docs/README.md` → `docs/agent-handoff.md`, which lists the reading order and the **locked decisions that must not be reopened**. `docs/current-status.md` says what the code actually does today. **M1, M2, M3, M3.1, M4, and M4.1 are complete**: networks, `backbone` role, HDF subpanel structure, `add_hdf`, the acceptance seed, **Find AGG / BB**, the connected conceptual map (`frontend/src/features/map/`), the M3.1 polish (node/site highlight, cable lines, the inspector, the route view, PNG/PDF export), and the M4 physical explorer (`frontend/src/features/physical/`), the saved node layout, and network create/rename (`frontend/src/features/networks/`). M4.1 added the physical polish (trail, cabinet, faceplates, search, sheets, the layered site layout) and the campus fixture. **M5a is complete** (editing and recording installed changes: overlay v2, Check, delete/disconnect/connect, containers, the HDF form, the library's Add… forms, the Changes drawer with Record as installed, Update draft, Drop and Undo). **M5c is complete** (the `batch` command, Connect a range, Duplicate, Copy rack layout; the data-entry rehearsal in `docs/verification-guide.md` §6b is prepared and pending the owner's run). P1 (production readiness: `db init` and the environment label) is done. M5b steps 11, 11b, 12 and 13 are done (detail fields, interface names, direct fixes with the change log, the details UI). The next checkpoint is **P2, the data-entry fixes** (rack picker in every form, Duplicate overrides, renaming in a plan, "No networks yet", step 13 review notes); then the **explanatory paths** (walk sheet, switch uplinks) and the **conceptual map for real data**, then M5b step 14 (inventory). All are written up under "P2 scope" in `docs/implementation-plan.md`, with the owner's answers. Work one step at a time and stop for review after each.

## Commands

Local Postgres (from repo root): `docker compose up -d --wait` (port 55432). Settings live in a gitignored `.env` at the repo root: create it once with `cp .env.example .env`. The Go commands (`cmd/api`, `cmd/db`, `cmd/testserver`), the Go database tests (through `internal/dotenv`), and Playwright load it automatically; a variable already set in the environment wins. Don't `export` the variables; put new settings in `.env` and document them in `.env.example`.

Backend (`backend/`):

```sh
go run ./cmd/db migrate      # repeatable
go run ./cmd/db init         # empty installed root, safe to repeat (production start: migrate, then init)
go run ./cmd/db seed         # only on an empty DB; refuses to overwrite (-fixture acceptance|campus|empty)
go run ./cmd/api             # :8080 (HTTP_ADDR to change); needs APP_ENV=dev|test|prod (in .env)
go test -race ./...
go vet ./...
go test ./internal/pathfinding -run TestName   # single test
```

Without `TEST_DATABASE_URL`, PostgreSQL tests skip. A green run with skipped DB tests does not verify migrations or round trips. DB tests use unique schemas and drop them afterward.

Frontend (`frontend/`):

```sh
npm ci
npm run dev                  # http://127.0.0.1:5174, proxies /api to :8080 (API_PROXY_TARGET)
npm test                     # vitest
npx vitest run src/features/pathfinding/projection.test.ts -t "name"   # single test
npm run typecheck
npm run build                # tsc --noEmit + vite build
npm run format:check         # prettier; `npm run format` to fix
npm run test:e2e             # Playwright (project `main`, then `recording`: specs named *.recording.spec.ts record plans and make drafts stale, so they run last); `npx playwright test e2e/planning.spec.ts` for one file
```

`go run ./cmd/testserver -fixture campus` and `go run ./cmd/db seed -fixture campus` use the generated campus fixture (development only); `SCALE=1 npx playwright test -c playwright.scale.config.ts` runs the opt-in scale spec against it. Playwright starts `backend/cmd/testserver` (isolated schema, migrate+acceptance seed plus an "Expansion" draft, cleaned on shutdown) on 18080 and Vite on 5175, so it can run alongside dev. Before handoff, run Go tests, frontend tests, typecheck, and build.

When `api/openapi.yaml` changes, lint it from `frontend/` with `npx --yes @redocly/cli lint ../api/openapi.yaml --extends minimal`.

## Architecture

Data flow: PostgreSQL → `persistence` loads a `topology.Snapshot` (installed, or installed + plan overlay) → pure domain packages operate on the snapshot → `httpapi` serializes. The frontend fetches via `src/shared/api.ts` (TanStack Query) and projects results onto React Flow.

- `internal/topology`: domain types (`Snapshot` of equipment, endpoints, links with context/revision) and `Validate`. Roles are explicit fields (`access`, `aggregation`, `backbone`, `passive`). Never infer roles from names.
- `internal/pathfinding`: pure BFS over physical continuity only. Edges are external cables plus internal front/rear bridges at the same position. Sibling ports on a device never create edges. It has no dependencies on HTTP, storage, or canvas.
- `internal/fixes`: pure direct fixes of installed names and details (`Apply`), used by `persistence.Store.Fix`; never topology, never the revision.
- `internal/planning`: plans are revisioned overlays. `Apply(base, plan)` produces a proposed snapshot without mutating installed; a plan is overlay v2: container additions, equipment additions, placements (IDs only; the old full-equipment `updates` are still read), removals (equipment cascades to its endpoints, bridges and cables; a rack, node or site only when empty) and cable additions. `Check` collects every change that does not apply, keyed `<kind>:<id>`. `Execute` applies commands (`add_equipment`, `add_hdf`, `add_cable`, `move_equipment`, `add_site|node|rack`, `delete_equipment|rack|node|site`, `disconnect_cable`, `remove_change`) with named-error occupancy/cable validation; `remove_change` is the one command allowed on a stale draft. `Diff` compares installed and proposed by ID for recording, and `Plan.Labels` keeps object names so drafts and recorded plans read in names. Installed topology, proposed topology, and visual layout are separate models.
- `internal/persistence`: pgx repositories with transaction discipline and draft/base revision conflict checks. `Record` (installed `FOR UPDATE`, then the plan) writes the Diff in a foreign-key-safe order, fills `plan_objects` and the labels, and sets a new installed revision; `Rebase` is Update draft. `httpapi.Repository` is the interface boundary, so HTTP tests can use fakes.
- `migrations/`: embedded and checksummed SQL. Append new files and never edit applied ones; the runner rejects changed checksums. Startup never migrates or seeds automatically.
- `internal/acceptance`: the fictional acceptance fixture (`docs/acceptance-example.md`) used by `cmd/db seed` and `cmd/testserver`. `internal/sample`: the older prototype fixture, now only for Go characterization tests. Neither is real inventory.
- Frontend: `src/app/App.tsx` is a large shell (header, drawers, Trace drawer, wiring); put new UI in feature-scoped folders under `src/features/`, not in `App.tsx`. `src/features/map/` is the conceptual map: pure, unit-tested projection modules (`layout`, `edges` with `lineWidth`/`pairKey`, `facets`, `networks`, `networkColors` with the `NetworkBadge` component, `connections` (label matching), `highlight` (node/site highlight, built from the index), `location`, `routeList`, `snapshotIndex`, `mapGraph`/`projectMap`, `splitPath`, `routeView` (the route-view layout, node/rack runs and outline boxes), `exportRoute` (header text, file names, capture size, and the lazy `html-to-image`/`jspdf` capture), `center`) and a thin `ConceptualMap` component, with `mapSession` as the session-only store: card positions by equipment ID, the viewport, pinned facets, the node/site highlight, split cable pairs, the route-view state with its own viewport, and pending center/fit requests (shared by Installed and Plan, never persisted). `features/inspector/` is the equipment inspector (`model` is pure; `Inspector`, `Overview`, `PortTable`); pins are made only there. Compute snapshot-only work once per snapshot (`indexSnapshot`) and keep route/filter/facet work separate. Map lines, bundles, anchors, and route-view outline boxes are drawing aids and never feed traversal. Keep drag state local to the canvas: no per-pointer HTTP calls or app-wide re-renders; refetches reconcile by ID and never remount or refit. The route view never writes to the full map's session state. `features/physical/` is the physical explorer: pure, unit-tested modules (`location` with `resolveLocation` fallback, `history`, `inventory` (counts and route marks, once per snapshot), `connections`, `layout`, `elevation`, `faces`, `detail`, `explorerModel`, `equipmentModel`, `drops`) plus thin components (`PhysicalExplorer`, `SitesGrid`, `SiteCanvas`, `NodeLevel`, `RackElevation`, `EquipmentPage`), and `physicalSession` as the session-only store (location, Back history, per-site fit and viewport) outside the Workspace like `mapSession`. Node positions are the one thing saved on the server (`GET`/`PUT`/`DELETE` layout, last write wins, saved once at drag stop, optimistic with rollback); lines between nodes are a summary of real cables and never feed traversal. Colors follow state, never the network ID. The explorer's root carries `data-*` marks that the specs assert. `features/details/` is the details UI: pure `model` (field specs, value lists, `changedFix`, history lines) and thin `DetailsEditor`, `EquipmentDetails`, `PortDetails`, `HistoryTab`; a direct fix calls App's `onFixed`, which refetches topology and history because the revision does not change. `features/networks/` is the Manage networks drawer (`model` is pure); networks can be created and renamed through the API, never deleted. `features/planning/` is the editing UI and the Changes drawer: pure modules (`deletePreview` with the cut-circuit walk, `summary` (the grouped change lines, names only), `changes`, `containers`, `goTo`, `rebaseSession`) and thin components (confirms, forms, `LibraryItems`, `ChangesDrawer`, `ReviewStep`, `StaleChanges`, `StaleCard`); every edit goes through one `PlanEdit` function that App provides only for a current draft (it also takes `batch` and `remove_change`). `features/patching/` is the patching screen (Connect… and Connect a range…): pure `patching.ts` (location tree, far default and side, next free, pair marks), `patchingSession` (open request, recent far targets, side per equipment; session-only), `LocationPicker` (Site › Node › Rack › Equipment), `PatchingScreen`, `ConnectPopover` (at a free jack in a plan) and `PatchingHost` (mounted once in the Workspace), and `useInlineDialog` gives every inline confirm and form Escape and focus return. A stale draft is never drawn (a card replaces the map and Physical).

## Keeping things in sync

With each completed checkpoint, update `api/openapi.yaml` (current executable API only, not future features), `frontend/src/shared/types.ts`, and `docs/current-status.md`. Don't claim behavior that isn't runnable.
