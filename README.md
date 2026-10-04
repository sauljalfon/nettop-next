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

The code is a tested foundation plus the completed **M1** domain contract: network membership, the explicit backbone (BB) role, stable HDF subpanel structure with atomic `add_hdf` creation, and the acceptance fixture as the development seed. It does **not yet implement** AGG/BB route discovery (M2), the final connected map (M3), or the physical explorer (M4). The previous nested ownership canvas is superseded as the conceptual design. Static mockup files have been removed. [current-status.md](docs/current-status.md) is the exact list of what runs.

**Next checkpoint: M2 — network-aware AGG/BB destination discovery.**

The [pre-implementation checklist](docs/implementation-plan.md#decisions-to-confirm-before-coding) is answered: read/trace/inspect first slice, development fixtures only (dev database reset and reseeded), and user-assigned HDF row count (1–32) and rack height. Legacy data import is planned as a later, separate checkpoint. The agreed map, physical explorer, and tracing semantics remain the contract.

## Approved product

- Active devices belong to exactly one network; passive panels/HDFs can carry multiple networks.
- Trace exact physical cables and same-position front/rear bridges. Never jump through switch sibling ports or across HDF positions.
- Find all reachable AGG **and** BB destination routes. List AGG first, retain BB results, and preserve actual roles.
- Conceptual is a full-page connected map. Trace selection highlights it in place and reveals relevant HDF positions; optional manual detail stays independent.
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

With the API and frontend running on a freshly seeded database:

1. In Installed, open Trace, choose **Find aggregation**, start from **EDGE-17 · all ports**, and trace. Two routes are listed: **EDGE-17 Port 1 → AGG-03 Port 1** and **EDGE-17 Port 2 → AGG-08 Port 1**.
2. Select the AGG-03 route: seven hops, four cables and three bridges: A01 → PANEL-A 1 front/rear → A02 → HDF-01 3C/5 rear/front → A03 → HDF-02 2B/3 front/rear → A04 → AGG-03 Port 1. The AGG-08 route is A05–A08 through PANEL-A 2, HDF-01 1A/2, and HDF-02 1D/2.
3. AGG-15 (Network A, no cable) is not a result. EDGE-17 Port 3 is cabled to BB-01 (A09–A12), but "Find aggregation" does not return BB destinations yet (M2); use exact port-to-port mode from EDGE-17 Port 3 to BB-01 Port 1 to see that route.
4. Trace from **EDGE-22 · all ports**: one route to AGG-12 Port 1 (B01–B04) through HDF-01 3C/2 and HDF-02 2B/6, different positions of the same subpanels as the Network A route. The two circuits never connect.
5. Open Changes & plans, create a named draft, add a switch (the **Network** field starts empty and must be chosen) and cables, and trace the proposed topology. Reload to verify the saved draft; switch to Installed to confirm isolation.

HDFs appear as passive cards. There is no HDF grid, creation form, or BB result UI yet (M3/M4/M5). `add_hdf` is available through the API: see [backend-contract-notes.md](docs/backend-contract-notes.md). The browser tests still use the smaller prototype fixture. See [current-status.md](docs/current-status.md) for limitations.

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
backend/cmd/testserver/         Isolated API for browser tests
backend/migrations/            Versioned, checksummed SQL migrations
backend/internal/topology/     Domain types and invariants
backend/internal/pathfinding/  Pure physical traversal
backend/internal/planning/     Revision-checked plan overlays/commands
backend/internal/persistence/  PostgreSQL repositories and transactions
backend/internal/httpapi/      HTTP boundary and repository interface
backend/internal/acceptance/   Acceptance fixture used by `cmd/db seed`
backend/internal/sample/       Prototype fixture for characterization/browser tests
frontend/src/features/         Current canvas, racks, traces, planning
api/openapi.yaml               Current executable API contract
docs/                          Approved architecture/UI, roadmap, status
compose.yaml                   Local PostgreSQL
```

Implement one checkpoint at a time, API-first and test-first. Do not reintroduce a competing visual/semantic model while implementing the approved workflow.
