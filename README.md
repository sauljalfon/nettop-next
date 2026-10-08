# Net-Top Next

**A pathfinding-centered network manager with a connected conceptual map and a realistic physical explorer.**

Go + React/TypeScript + PostgreSQL. This repository is the new implementation, independent of legacy NetTop.

## Start here

Design review and mockup exploration are complete. The agreed behavior is now the implementation contract:

**For Opus 5.5 / the next implementation agent:** start with the [documentation index](docs/README.md) and the [self-contained handoff](docs/agent-handoff.md). They contain the reading order and a copyable task brief; the original conversation is not required.

- [Architecture and network rules](docs/architecture.md)
- [Approved UI and workflow](docs/ui-spec.md)
- [Implementation plan](docs/implementation-plan.md)
- [Current executable status](docs/current-status.md)
- [Design decisions and planning history](docs/design-decisions.md)
- [Visual reconstruction brief](docs/visual-brief.md)
- [Complete acceptance inventory and cable routes](docs/acceptance-example.md)
- [Acceptance/regression test matrix](docs/acceptance-tests.md)
- [Current backend contracts and migration notes](docs/backend-contract-notes.md)
- [Verification and checkpoint handoff guide](docs/verification-guide.md)
- [Legacy behavior and source references](docs/legacy-reference.md)

The code is a tested foundation plus the completed **M1** domain contract (network membership, the explicit backbone role, stable HDF subpanel structure with atomic `add_hdf` creation, the acceptance fixture as the development seed), **M2** discovery (**Find AGG / BB** returns every reachable AGG and BB route from an active device or any exact port, reports destinations on another network as mismatches), and **M3**, the connected conceptual map: a layered, freely arrangeable equipment-and-cable map with a network filter, Find AGG / BB results highlighted in place, automatic and pinned HDF positions, then **M3.1**, its polish: node and site highlight, cable lines with network colors and split/join, a redesigned inspector with a compact port table, the hop list, a searchable trace picker, a **route view** that shows one route in hop order inside node and rack outlines, and PNG/PDF export of it. **M4**, the physical explorer: Sites → site (node cards arranged by drag and saved on the server, joined by cable lines) → node (rack previews) → rack (the full elevation, with drops in a plan) → equipment page (port bank, panel sides or the HDF grid, Front/Rear, endpoint detail, Go to peer), with breadcrumbs, an in-app Back, **Show in Physical** from the inspector and the hops, and networks that can be created and renamed. Static mockup files have been removed. [current-status.md](docs/current-status.md) is the exact list of what runs.

**Next checkpoint: M5 — editing, recording installed changes, and inventory.**

The [pre-implementation checklist](docs/implementation-plan.md#decisions-to-confirm-before-coding) is answered: read/trace/inspect first slice, development fixtures only (dev database reset and reseeded), and user-assigned HDF row count (1–32) and rack height. Legacy data import is planned as a later, separate checkpoint. The agreed map, physical explorer, and tracing semantics remain the contract.

## Approved product

- Active devices belong to exactly one network; passive panels/HDFs can carry multiple networks.
- Trace exact physical cables and same-position front/rear bridges. Never jump through switch sibling ports or across HDF positions.
- Find all reachable AGG **and** BB destination routes. List AGG first, retain BB results, and preserve actual roles.
- Conceptual is a full-page connected map. Trace selection highlights it in place and reveals relevant HDF positions; pinned detail stays independent.
- Physical follows site → node → rack → equipment → exact ports, including complete four-column variable-row HDF grids.
- Installed infrastructure, proposed plans, and diagram layout are separate state models.

## Run the current foundation

Requirements: Docker with Compose, Go 1.26+, Node 22.12+ (or a supported current version), npm.

From the repository root:

```sh
docker compose up -d --wait
cp .env.example .env    # once; holds DATABASE_URL and TEST_DATABASE_URL
cd backend
go run ./cmd/db migrate
go run ./cmd/db seed
go run ./cmd/api
```

`migrate` is repeatable. **Run `seed` only on an empty database:** it refuses to overwrite initialized data. The seed loads the fictional [acceptance fixture](docs/acceptance-example.md) (Networks A/B, 11 equipment, HDF-01 and HDF-02, cables A01–B04) and creates no draft plans. The development database binds to loopback on port 55432 and uses a named volume.

### Upgrading a database seeded before M1

Migration 003 (networks) refuses to run on a database that already contains switches or saved plans with switches, because their network membership is unknown and no default network is ever assigned. Migration 004 likewise refuses legacy free-text HDF subpanel values. Both stop before changing anything and tell you to reset the development database and reseed. For a development database that holds only prototype data, reset it yourself, which **deletes all data in the development volume**:

```sh
docker compose down -v
docker compose up -d --wait
cd backend
go run ./cmd/db migrate
go run ./cmd/db seed
```

Do not do this to a database that holds anything you need. Automated tests never need it; they use isolated schemas.

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5174**. Vite proxies `/api` to Go at `127.0.0.1:8080`.

On later starts, bring up Compose and run the API/frontend (the `.env` is read automatically). Apply explicit new migrations when needed; do not reseed existing data. Startup never migrates, reseeds, or falls back to in-memory storage. `.env.example` documents the variables; the Go commands, Go database tests, and Playwright load `.env` from the repository root, and a variable already set in the environment wins.

If port 8080 is occupied, change `HTTP_ADDR` for Go and `API_PROXY_TARGET` for Vite together. Authentication is not implemented yet; the default servers bind to loopback for local development.

## Smoke flow (acceptance seed)

With the API and frontend running on a freshly seeded database (the seed creates no drafts):

1. **Open the map.** At http://127.0.0.1:5174 the Conceptual map shows all 11 equipment as cards (EDGE-17, EDGE-22 on the left; panels and the two HDFs in the middle; AGG-03, AGG-08, BB-01, AGG-12 on the right; AGG-15, uncabled, parked below). Each card shows its site / node / rack and "N of M cabled" (EDGE-17: 3 of 24). HDF-01 shows **Network A** and **Network B** badges, in the two networks' colors. Parallel cables are one line per card pair and network, with a count pill ("3") and a width that grows with the count; all 16 cables are represented.
2. **Filter Network A.** Choose **Network A** in the header. EDGE-22, PANEL-DR, and AGG-12 disappear; HDF-01 and HDF-02 stay, and the B03 line between them is captioned **Network B**. Positions and zoom do not change. Switching back to All networks restores everything.
3. **Highlight Building A.** Open **Explore** (the tool rail) and click **Building A** (a highlighter icon shows on hover). EDGE-17 and PANEL-A and every cable leaving them turn amber, HDF-01 (the far end) a lighter amber, and the rest fades; the view fits them once. **Clear highlight** (or Esc) restores everything. Clicking **EDGE-17** in the tree instead selects it, opens the inspector and centers on it, with no highlight.
4. **Split a cable line.** Hover the **3** pill between EDGE-17 and PANEL-A: the tooltip lists cable-a01, cable-a05 and cable-a09. Click the pill: three lines fan out, each labeled with its cable ID. Click a line or **join** to put them back.
5. **Inspect HDF-01.** Click the HDF-01 card; the inspector opens with a sticky header ("4 of 96 cabled", the breadcrumb Main Campus / North Sub-main / Rack SM01). On the **Positions** tab only the four cabled positions show by default, under collapsible subpanels 1A, 2D and 3C, each with its far end, cable ID and network. Choose **All** to see all 96, and search `3C/5`. **Pin** a row (the pin icon): the position appears on the card tagged "pinned".
6. **Find AGG / BB from a row.** Click the route icon on the **3C / 5** row: the results overlay lists one route to **AGG-03 · AGG · Network A** ("2 cables · 2 internal bridges"). The source network (A) comes from EDGE-17 on the same circuit, not from the panel. For the whole device, select EDGE-17 and use **Find AGG / BB** in its inspector header: AGG first, **EDGE-17 Port 1 → AGG-03**, **Port 2 → AGG-08**, **Port 3 → BB-01**, each "4 cables · 3 internal bridges"; AGG-15 is never a result. The AGG-03 route is selected: its cables A01–A04 are teal, and the facets **3C / 5** and **2B / 3** appear tagged "route".
7. **Hop list.** In the results overlay the selected route is expanded to its ordered hops (start, then CABLE and PANEL BRIDGE rows). Click one: its card is selected and centered at the same zoom. Click **BB-01**'s row to switch the route in place; the highlight and facets change, nothing moves.
8. **Route view.** Select the **AGG-03** route again, then click **Route view** above the hop list: only the route's five cards and four cables remain, laid out left to right in hop order, inside dashed node boxes (Main Campus / Building A, / North Sub-main, / Main Distribution) with lighter rack boxes (Rack A03, Rack Core 01). Click it again: the full map returns exactly as it was, including the pin, the split state and the viewport.
9. **Export.** With Route view on, click **PNG** and then **PDF**: `route-EDGE-17-Port-1-AGG-03-Port-1.png` and `.pdf` download, each showing the route and its boxes under a header (start → end, Find AGG / BB · Network A, Installed · date). The buttons are disabled with Route view off. The libraries load on the first export.
10. **Passive start (Trace drawer).** Open **Trace**, choose **HDF-01 · 3C/5 rear** as the Start (type to search), and find AGG / BB. One route to **AGG-03 (Network A)**. **HDF-01 · 3C/2** resolves Network B and reaches AGG-12 instead; the two circuits share the subpanel but never connect.
11. **Reset layout.** Drag a card, then use **Reset layout** in the map controls and confirm: the first layout returns and the view fits once; pins, highlight, filter and trace are kept.
12. **Plan and mismatch.** Open Changes & plans, create a named draft, add a switch (the **Network** field starts empty and must be chosen) and cables, and trace the proposed topology. For a mismatch, add a cable from **EDGE-17 Port 4** to **AGG-12 Port 2**: Find AGG / BB from EDGE-17 in the draft still lists three routes and shows AGG-12 under **On another network (not routes)**. Exporting in a plan says "Proposed: <plan name>" in the header. Reload to verify the saved draft; switch to Installed to confirm isolation. Card positions, zoom, pins, and split pairs carry across Installed and Plan within the session but are lost on reload.
13. **Physical, Sites.** Select the **AGG-03** route again, then switch to **Physical**: two site cards, **DR Site** and **Main Campus** ("3 nodes · 5 racks · 8 equipment", Network A, a teal "on route · 5 equipment"). The route's results overlay stays; the line under the breadcrumbs says the complete inventory is shown.
14. **A site.** Click **Main Campus**: three node cards (Building A, Main Distribution, North Sub-main) joined by lines with count circles, **3** (Building A to North Sub-main: cable-a02, cable-a06, cable-a10) and **4** (North Sub-main to Main Distribution: cable-a03, cable-a07, cable-a11 and cable-b03). Both lines are teal while the AGG-03 route is selected (it uses cable-a02 and cable-a03); without a route the 3 is Network A's color and the 4 is grey, because it mixes Networks A and B. Drag a card: one save is sent when you drop it, and after a reload it is where you left it. Click a **3** or **4** circle for the list of cables with both ends and their racks; **Reset layout** (confirm) puts the default arrangement back.
15. **Node and rack.** Click **Open racks →** on North Sub-main, then **Rack SM01**: a 12U cabinet with HDF-01 as one block over U4–U6, teal because the route uses it, and the other units "Available". Use the breadcrumbs (Sites › Main Campus › North Sub-main › Rack SM01) or **Back** to move between levels.
16. **HDF-01.** Click the HDF-01 block: the equipment page shows its rack on the left, the grid (16 blocks A–D × 4 rows, six positions each) in the middle and the endpoint detail on the right. Choose **Rear** and click position **5** of block **3C**: the detail shows the circuit (Network A), the external cable **cable-a02** to PANEL-A 1 rear and its location, and the internal peer (the front side, carrying **cable-a03**). **Switch to front** keeps the position and selects its front side; **Go to peer** opens HDF-02 2B/3 front, whose rear carries **cable-a04** to AGG-03 port 1. **Back** returns to HDF-01 3C/5 front exactly. Position **2** of the same block is Network B's circuit, drawn in its own color beside Network A's 5.
17. **Back to the map.** Click **Conceptual**: the same route is selected, the cards are where they were, and the zoom is unchanged. In the inspector, **Show in Physical** on a header, a position row or a hop opens the exact place again.
18. **Networks.** Open the Show network selector and choose **Manage networks…**: a drawer lists the networks with their colors and device counts. Rename one in place (Enter saves) or add a network: it takes the next palette color; renaming never changes a color. There is no delete.

HDFs appear as one compact card each. `add_hdf` is available through the API: see [backend-contract-notes.md](docs/backend-contract-notes.md). Browser tests run on the acceptance fixture plus one test-only draft named Expansion. See [current-status.md](docs/current-status.md) for limits.

## Checks

With Compose running, from `backend/`:

```sh
go test -race ./...     # TEST_DATABASE_URL comes from .env
go vet ./...
```

PostgreSQL integration tests create unique schemas and clean them afterward. They do not reset development inventory. Without `TEST_DATABASE_URL` (in `.env` or the environment), database-specific tests explicitly skip.

From `frontend/`:

```sh
npm test
npm run typecheck
npm run build
npm run format:check
npx playwright install chromium
npm run test:e2e
```

Browser tests start a test-only Go API and Vite on **18080 / 5175**, using an isolated database schema. They can run alongside the development app. Override `TEST_DATABASE_URL` when using a database other than the local Compose instance. Test output/screenshots remain ignored.

## Repository structure

```text
backend/cmd/api/                HTTP server
backend/cmd/db/                 Explicit migration/seed CLI
backend/cmd/testserver/         Isolated API for browser tests (acceptance fixture + Expansion draft)
backend/migrations/            Versioned, checksummed SQL migrations
backend/internal/topology/     Domain types and invariants
backend/internal/pathfinding/  Pure physical traversal
backend/internal/planning/     Revision-checked plan overlays/commands
backend/internal/persistence/  PostgreSQL repositories and transactions
backend/internal/httpapi/      HTTP boundary and repository interface
backend/internal/acceptance/   Acceptance fixture used by `cmd/db seed`
backend/internal/sample/       Prototype fixture for Go characterization tests
frontend/src/features/map/     Conceptual map: pure projection modules, ConceptualMap, route view, export
frontend/src/features/inspector/ Equipment inspector (header, Overview, port table)
frontend/src/features/physical/ Physical explorer: sites, site canvas, node previews, rack elevation, equipment page, session
frontend/src/features/networks/ Manage networks drawer
frontend/src/features/         Also pathfinding and the trace picker, Explore, planning forms
api/openapi.yaml               Current executable API contract
docs/                          Approved architecture/UI, roadmap, status
compose.yaml                   Local PostgreSQL
```

Implement one checkpoint at a time, API-first and test-first. Do not reintroduce a competing visual/semantic model while implementing the approved workflow.
