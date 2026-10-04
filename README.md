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

The code is a tested foundation plus the completed **M1** domain contract (network membership, the explicit backbone role, stable HDF subpanel structure with atomic `add_hdf` creation, the acceptance fixture as the development seed), **M2** discovery (**Find AGG / BB** returns every reachable AGG and BB route from an active device or any exact port, reports destinations on another network as mismatches), and **M3**, the connected conceptual map: a layered, freely arrangeable equipment-and-cable map with a network filter, Find AGG / BB results highlighted in place, automatic and pinned HDF positions, and location focus with boundary bundles. Physical still shows the existing rack view; the site/node/rack/HDF explorer (M4) is **not yet implemented**. Static mockup files have been removed. [current-status.md](docs/current-status.md) is the exact list of what runs.

**Next checkpoint: M4 — approved physical explorer.**

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
export DATABASE_URL='postgres://nettop:nettop-local@127.0.0.1:55432/nettop?sslmode=disable'
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

On later starts, bring up Compose, export `DATABASE_URL`, and run the API/frontend. Apply explicit new migrations when needed; do not reseed existing data. Startup never migrates, reseeds, or falls back to in-memory storage. `.env.example` documents the variable; Go does not automatically load `.env`.

If port 8080 is occupied, change `HTTP_ADDR` for Go and `API_PROXY_TARGET` for Vite together. Authentication is not implemented yet; the default servers bind to loopback for local development.

## Smoke flow (acceptance seed)

With the API and frontend running on a freshly seeded database (the seed creates no drafts):

1. **Open the map.** At http://127.0.0.1:5174 the Conceptual map shows all 11 equipment as cards (EDGE-17, EDGE-22 on the left; panels and the two HDFs in the middle; AGG-03, AGG-08, BB-01, AGG-12 on the right; AGG-15, uncabled, parked below). Each card shows its site / node / rack and "N of M cabled" (EDGE-17: 3 of 24). HDF-01 shows **Network A** and **Network B** badges. Parallel summary cables are bundled ("3 cables"); all 16 cables are represented.
2. **Filter Network A.** Choose **Network A** in the header. EDGE-22, PANEL-DR, and AGG-12 disappear; HDF-01 and HDF-02 stay, and the B03 line between them is captioned **Network B**. Positions and zoom do not change. Switching back to All networks restores everything.
3. **Trace from EDGE-17.** Click the EDGE-17 card, then **Find AGG / BB** on the card. The results overlay lists, AGG first: **EDGE-17 Port 1 → AGG-03 Port 1 · AGG · Network A**, **Port 2 → AGG-08 · AGG · Network A**, and **Port 3 → BB-01 · BB · Network A**, each "4 cables · 3 internal bridges". The AGG-03 route is selected: its four cables (A01–A04) are highlighted and the facets **3C / 5** (HDF-01) and **2B / 3** (HDF-02) appear tagged "route"; nothing moves.
4. **Select BB-01.** Click the BB-01 row: the highlight and facets switch in place to A09–A12 (**2D / 4**, **3A / 1**). All three results stay listed. AGG-15 is never a result.
5. **Pin a position.** On the HDF-01 card click **Show connections**, type `1A/2`, and tick it: **1A / 2** appears tagged "pinned". Select the AGG-08 route: the position is shown once, tagged both "route" and "pinned". Click **Clear trace**: the route facets and highlights go, **1A / 2** stays. The list offers only HDF-01's four cabled positions, and with Network A selected **3C / 2** is labeled Network B.
6. **Focus Building A.** Click the focus button next to a card's location (or **Focus** on Building A in Explore). Only EDGE-17 and PANEL-A remain, plus a boundary card **3 cables to North Sub-main** listing cable-a02 · cable-a06 · cable-a10. **Expand** shows HDF-01 at its usual place with real lines; **Collapse** folds it back. Trace from EDGE-17 again: the route's cards (HDF-01, HDF-02, AGG-03) appear while it is selected and hide again on **Clear trace**.
7. **Clear.** Click **Clear focus** in the header chip: the full map returns with every card where it was.
8. **Passive start (Trace tool).** Open Trace, choose **HDF-01 · 3C/5 rear** as the Start, and find AGG / BB. One route to **AGG-03 (Network A)**, "2 cables · 2 internal bridges". The source network (A) comes from EDGE-17 on the same circuit, not from the panel. **HDF-01 · 3C/2** resolves Network B and reaches AGG-12 instead; the two circuits share the subpanel but never connect.
9. **Plan and mismatch.** Open Changes & plans, create a named draft, add a switch (the **Network** field starts empty and must be chosen) and cables, and trace the proposed topology. For a mismatch, add a cable from **EDGE-17 Port 4** to **AGG-12 Port 2**: Find AGG / BB from EDGE-17 in the draft still lists three routes and shows AGG-12 under **On another network (not routes)**. Reload to verify the saved draft; switch to Installed to confirm isolation. Card positions, zoom, pinned facets, and focus carry across Installed and Plan within the session but are lost on reload.
10. **Physical.** Switch to **Physical** for the rack elevations (the ordered hop list of a selected route is in its results drawer). There is no site/node explorer or HDF grid yet (M4).

HDFs appear as one compact card each. `add_hdf` is available through the API: see [backend-contract-notes.md](docs/backend-contract-notes.md). Browser tests run on the acceptance fixture plus one test-only draft named Expansion. See [current-status.md](docs/current-status.md) for limits.

## Checks

With Compose running, from `backend/`:

```sh
export TEST_DATABASE_URL='postgres://nettop:nettop-local@127.0.0.1:55432/nettop?sslmode=disable'
go test -race ./...
go vet ./...
```

PostgreSQL integration tests create unique schemas and clean them afterward. They do not reset development inventory. Without `TEST_DATABASE_URL`, database-specific tests explicitly skip.

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
frontend/src/features/map/     Conceptual map: pure projection modules + ConceptualMap
frontend/src/features/         Also pathfinding results, rack view, planning forms
api/openapi.yaml               Current executable API contract
docs/                          Approved architecture/UI, roadmap, status
compose.yaml                   Local PostgreSQL
```

Implement one checkpoint at a time, API-first and test-first. Do not reintroduce a competing visual/semantic model while implementing the approved workflow.
