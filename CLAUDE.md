# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

`AGENTS.md` holds the binding project rules (domain invariants, test-first, no auto-commits). Start at `docs/README.md`. **Where the project is and what to work on is only in `docs/status.md`** (its Now / Next box); `docs/roadmap.md` holds the approved design of the current item; `docs/decisions.md` holds the locked decisions (never reopen them without the owner) and every later decision; `docs/way-of-work.md` is the process (design and approval, plan, Sonnet prompts, review, commit, deploy) and the list of docs each finished item updates. `docs/history/` is reference only. Work one step at a time and stop for review after each.

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
- `internal/planning`: plans are revisioned overlays. `Apply(base, plan)` produces a proposed snapshot without mutating installed; a plan is overlay v2: container additions, equipment additions, placements (IDs only; the old full-equipment `updates` are still read), renames of the equipment the plan adds, removals (equipment cascades to its endpoints, bridges and cables; a rack, node or site only when empty) and cable additions. `Check` collects every change that does not apply, keyed `<kind>:<id>`. `Execute` applies commands (`add_equipment`, `add_hdf`, `add_cable`, `move_equipment`, `add_site|node|rack`, `rename_equipment`, `delete_equipment|rack|node|site`, `disconnect_cable`, `remove_change`) with named-error occupancy/cable validation; `remove_change` is the one command allowed on a stale draft. `Diff` compares installed and proposed by ID for recording, and `Plan.Labels` keeps object names so drafts and recorded plans read in names. Installed topology, proposed topology, and visual layout are separate models.
- `internal/persistence`: pgx repositories with transaction discipline and draft/base revision conflict checks. `Record` (installed `FOR UPDATE`, then the plan) writes the Diff in a foreign-key-safe order, fills `plan_objects` and the labels, and sets a new installed revision; `Rebase` is Update draft. `httpapi.Repository` is the interface boundary, so HTTP tests can use fakes.
- `migrations/`: embedded and checksummed SQL. Append new files and never edit applied ones; the runner rejects changed checksums. Startup never migrates or seeds automatically.
- `internal/acceptance`: the fictional acceptance fixture (`docs/acceptance-example.md`) used by `cmd/db seed` and `cmd/testserver`. `internal/sample`: the older prototype fixture, now only for Go characterization tests. Neither is real inventory.
- Frontend look (D33): `src/shared/theme.css` holds every colour, font and size and the shared classes (`.btn`, `.chip`, `.field`, `.seg`, `.drawer`, `.tape`); feature CSS uses only `var(--…)`, guarded by `theme.test.ts`. `src/shared/ui/` has `Name` (bdi), `PlacePath`, `Pieces`, `Chip` and `Field`; `src/shared/textPieces.ts` has `TextPiece`, `piecesText` and `optionText` (an option cannot hold markup). Never join names into one string for display.
- Frontend: `src/app/App.tsx` is a large shell (header, drawers, Trace drawer, wiring); put new UI in feature-scoped folders under `src/features/`, not in `App.tsx`. `src/features/map/` is the conceptual map (D35, D36): two views, the **overview** of nodes in site frames (the default) and **Focus** on one device. Pure, unit-tested modules: `overview` (`buildOverview`: node cards, pairs with real-cable counts), `overviewLayout` (default arrangement, site frames), `overviewFlow` (`projectOverview`, `pillPoint`, `panIntoView`), `overviewFit`, `focus` (`buildFocus` over `followPort`: the active equipment reached through passive chains, grouped per node above 24, up to 3 hops), `focusLayout` (rings, columns, `focusCardHeight`), `focusFlow` (`projectFocus`; the via rows sit in the card a line leads to), `circuitNetwork`, `facets` (only `endpointLookup`, `facetKey`, `facetLabel`, used by the inspector, Physical and Explore), `networks`, `networkColors` with the `NetworkBadge` component, `connections` (label matching), `highlight` (node/site highlight), `location`, `routeList`, `snapshotIndex`, `exportRoute` (header text, file names, capture size, and the lazy `html-to-image`/`jspdf` capture), `center` (fit options and `fitViewport`), `cardRole`; thin components `ConceptualMap` (picks the view), `OverviewCanvas`, `FocusCanvas`, `NodeCard`, `MapControls`, `MapResults`; and `mapSession` as the session-only store: the view, the overview viewport and open cards, proposed nodes' positions, the focus with its hops and open groups, the node/site highlight, the route view's on/off switch and the pending fit request (shared by Installed and Plan, never persisted). Overview node positions are saved on the server (`/api/map-layout`, once at drag stop, optimistic with rollback). Compute snapshot-only work once per snapshot (`indexSnapshot`) and keep route/filter work separate. Map lines and pills are drawing aids and never feed traversal. Keep drag state local to the canvas: no per-pointer HTTP calls or app-wide re-renders; refetches reconcile by ID and never remount or refit. The route view is `paths/RouteDiagram` laid over the map; the map under it stays mounted and untouched. `features/inspector/` is the equipment inspector (`model` is pure; `Inspector`, `Overview`, `PortTable`); its Focus and Show on map open Focus. `features/physical/` is the physical explorer: pure, unit-tested modules (`location` with `resolveLocation` fallback, `history`, `inventory` (counts and route marks, once per snapshot), `connections`, `layout`, `elevation`, `faces`, `detail`, `explorerModel`, `equipmentModel`, `drops`) plus thin components (`PhysicalExplorer`, `SitesGrid`, `SiteCanvas`, `NodeLevel`, `RackElevation`, `EquipmentPage`), and `physicalSession` as the session-only store (location, Back history, per-site fit and viewport) outside the Workspace like `mapSession`. The site screen's node positions are saved on the server like the overview's (`GET`/`PUT`/`DELETE` site layout, last write wins, saved once at drag stop, optimistic with rollback); lines between nodes are a summary of real cables and never feed traversal. Colors follow state, never the network ID. The explorer's root carries `data-*` marks that the specs assert. `features/paths/` explains a path: pure `follow` (`followPort` over stored links only, `walkOfRoute` for a server route), `sheet` (`buildSheet`, names kept apart as `{text} | {name}` pieces), `uplinks`, `diagram`, and thin `WalkSheet`, `UplinksSummary` (`useUplinks`: Find AGG / BB per access switch, its own query) and `RouteDiagram` (the route view). `features/details/` is the details UI: pure `model` (field specs, value lists, `changedFix`, history lines) and thin `DetailsEditor`, `EquipmentDetails`, `PortDetails`, `HistoryTab`; a direct fix calls App's `onFixed`, which refetches topology and history because the revision does not change. `features/networks/` is the Manage networks drawer (`model` is pure); networks can be created and renamed through the API, never deleted. `features/planning/` is the editing UI and the Changes drawer: pure modules (`deletePreview` with the cut-circuit walk, `summary` (the grouped change lines, names only), `changes`, `containers`, `goTo`, `rebaseSession`) and thin components (confirms, forms, `LibraryItems`, `ChangesDrawer`, `ReviewStep`, `StaleChanges`, `StaleCard`); every edit goes through one `PlanEdit` function that App provides only for a current draft (it also takes `batch` and `remove_change`). `features/patching/` is the patching screen (Connect… and Connect a range…): pure `patching.ts` (location tree, far default and side, next free, pair marks), `patchingSession` (open request, recent far targets, side per equipment; session-only), `LocationPicker` (Site › Node › Rack › Equipment), `PatchingScreen`, `ConnectPopover` (at a free jack in a plan) and `PatchingHost` (mounted once in the Workspace), and `useInlineDialog` gives every inline confirm and form Escape and focus return. A stale draft is never drawn (a card replaces the map and Physical).

## Keeping things in sync

With each finished item, update `api/openapi.yaml` (current executable API only, not future features), `frontend/src/shared/types.ts`, `docs/status.md` and the other docs listed in `docs/way-of-work.md` ("Keeping the docs true"). Don't claim behavior that isn't runnable, and never write the same fact in two docs.
