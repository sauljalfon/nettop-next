# Net-Top Next

**A pathfinding-centered network manager with a connected conceptual map and a realistic physical explorer.**

Go + React/TypeScript + PostgreSQL. A new implementation, independent of legacy NetTop.

- **Where the project is and what runs:** [docs/status.md](docs/status.md)
- **What comes next:** [docs/roadmap.md](docs/roadmap.md)
- **How we work:** [docs/way-of-work.md](docs/way-of-work.md)
- **All documents:** [docs/README.md](docs/README.md)
- **Deploying the test server:** [infra/compose/README.md](infra/compose/README.md)

## The product in short

- Active devices belong to exactly one network; passive panels and HDFs can carry several.
- Traces follow exact physical cables and same-position front/rear bridges, never sibling switch ports or other HDF positions.
- **Find AGG / BB** returns every reachable AGG and BB route, AGG first, keeping the actual roles.
- **Conceptual** is a full-page connected map; a trace highlights it in place. **Physical** goes site → node → rack → equipment → exact port, including full HDF grids.
- Installed infrastructure, proposed plans and diagram layout are separate. Changes are made in a plan and recorded as installed; corrections are direct fixes with a change log.

The rules are in [docs/architecture.md](docs/architecture.md), [docs/ui-spec.md](docs/ui-spec.md) and [docs/decisions.md](docs/decisions.md).

## Run it locally

Requirements: Docker with Compose, Go 1.26+, Node 22.12+, npm.

```sh
docker compose up -d --wait          # PostgreSQL on 127.0.0.1:55432
cp .env.example .env                 # once; DATABASE_URL, TEST_DATABASE_URL, APP_ENV
cd backend
go run ./cmd/db migrate              # repeatable
go run ./cmd/db seed                 # the fictional acceptance fixture; empty database only
go run ./cmd/api                     # :8080
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev                          # http://127.0.0.1:5174, proxies /api to :8080
```

- A database for **real data** is started with `go run ./cmd/db migrate` then `go run ./cmd/db init` (an empty installed root, safe to repeat), never `seed`. `seed` refuses an initialized database.
- `.env` is read by the Go commands, the Go database tests and Playwright; a variable already set in the environment wins. Document new settings in `.env.example`.
- Startup never migrates or seeds. If port 8080 is taken, change `HTTP_ADDR` and `API_PROXY_TARGET` together.
- **A database seeded before M1** is refused by migrations 003/004 (switch network membership and HDF subpanels are unknown). Only for a development database you do not need: `docker compose down -v` (this **deletes all its data**), then `up`, `migrate`, `seed`.
- **The campus fixture** (development only, about 1,500 switches and 5,500 cables): `go run ./cmd/db seed -fixture campus` on an empty database, or `go run ./cmd/testserver -fixture campus`; `SCALE=1 npx playwright test -c playwright.scale.config.ts` from `frontend/` records timings.

Tests, the smoke flow and the browser test setup are in [docs/testing.md](docs/testing.md).

## Repository structure

```text
backend/cmd/api/                 HTTP server
backend/cmd/db/                  migrate, init and seed
backend/cmd/testserver/          Isolated API for browser tests
backend/migrations/              Versioned, checksummed SQL migrations
backend/internal/topology/       Domain types and invariants
backend/internal/pathfinding/    Pure physical traversal
backend/internal/planning/       Revisioned plan overlays and commands
backend/internal/fixes/          Direct fixes of installed names and details
backend/internal/persistence/    PostgreSQL repositories and transactions
backend/internal/httpapi/        HTTP boundary
backend/internal/acceptance/     The fictional acceptance fixture (seed)
backend/internal/scalefixture/   The generated campus fixture
frontend/src/features/           map, inspector, physical, patching, planning, details, networks, …
api/openapi.yaml                 The current API contract
docs/                            Status, roadmap, decisions, architecture, UI, testing
infra/compose/                   The single test server (Docker Compose)
compose.yaml                     Local PostgreSQL
```
