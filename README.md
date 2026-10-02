# Net-Top Next

**A pathfinding-centered network manager with a connected conceptual map and a realistic physical explorer.**

Go + React/TypeScript + PostgreSQL. This repository is the new implementation, independent of legacy NetTop.

## Start here

Design review and mockup exploration are complete. The agreed behavior is now the implementation contract:

- [Architecture and network rules](docs/architecture.md)
- [Approved UI and workflow](docs/ui-spec.md)
- [Implementation plan](docs/implementation-plan.md)
- [Current executable status](docs/current-status.md)

The existing code is a tested foundation/prototype. It does **not yet implement** network membership, BB discovery, explicit HDF subpanels, or the final connected-map/physical-navigation experience. The previous nested ownership canvas is superseded as the conceptual design. Static mockup files have been removed.

**Next checkpoint: M1 — network membership, explicit BB roles, and HDF identity/layout contracts.**

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

`migrate` is repeatable. **Run `seed` only on an empty database:** it refuses to overwrite initialized data. The development database binds to loopback on port 55432 and uses a named volume.

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5174**. Vite proxies `/api` to Go at `127.0.0.1:8080`.

On later starts, bring up Compose, export `DATABASE_URL`, and run the API/frontend. Apply explicit new migrations when needed; do not reseed existing data. Startup never migrates, reseeds, or falls back to in-memory storage. `.env.example` documents the variable; Go does not automatically load `.env`.

If port 8080 is occupied, change `HTTP_ADDR` for Go and `API_PROXY_TARGET` for Vite together. Authentication is not implemented yet; the default servers bind to loopback for local development.

## Baseline smoke flow

1. In Installed, open Trace and find aggregation from EDGE-01.
2. Inspect EDGE-01 → PANEL-A front/rear → PANEL-B rear/front → AGG-02 (three cables, two internal bridges).
3. Use exact port-to-port mode for EDGE-01 SFP+ 1 → AGG-02 SFP+ 1; EDGE-01 SFP+ 2 is disconnected.
4. Open the Expansion draft or create a named draft, add equipment/cables, and trace the proposed topology.
5. Reload to verify saved proposals; switch to Installed to confirm isolation.

The current seed and browser tests characterize this prototype, not the final AGG/BB/multi-network workflow. See [current-status.md](docs/current-status.md) for limitations and migration compatibility considerations.

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
backend/internal/sample/       Explicit development seed fixtures
frontend/src/features/         Current canvas, racks, traces, planning
api/openapi.yaml               Current prototype API contract
docs/                          Approved architecture/UI, roadmap, status
compose.yaml                   Local PostgreSQL
```

Implement one checkpoint at a time, API-first and test-first. Do not reintroduce a competing visual/semantic model while implementing the approved workflow.
