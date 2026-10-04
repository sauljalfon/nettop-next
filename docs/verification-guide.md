# Local verification and checkpoint handoff

This is the operational guide for the implementation agent. Commands validate the **current runnable baseline** unless a checkpoint explicitly updates its tests/contracts. Passing baseline tests alone does not prove the final network/BB/HDF product is implemented.

## 1. Environment

- Go 1.26 or compatible version matching `backend/go.mod`.
- Node compatible with the installed Vite version; the baseline README specifies Node 22.12+ or a supported current version.
- npm, Docker, Docker Compose, PostgreSQL from `compose.yaml`.
- Playwright Chromium for browser verification.

Default local ports:

| Service | Port |
| --- | --- |
| Development PostgreSQL | 55432 |
| Go development API | 8080 |
| Vite development UI | 5174 |
| Browser-test API | 18080 |
| Browser-test Vite | 5175 |

Use `HTTP_ADDR` and `API_PROXY_TARGET` together when changing development API location. The test server has separate configured ports; check for conflicts before starting it.

## 2. Bring up the current baseline

From the repository root:

```sh
docker compose up -d --wait
export DATABASE_URL='postgres://nettop:nettop-local@127.0.0.1:55432/nettop?sslmode=disable'
```

From `backend/`:

```sh
go run ./cmd/db migrate
go run ./cmd/db seed
go run ./cmd/api
```

**Run `seed` only on an empty development database.** It refuses to overwrite existing data. An initialized database only needs applicable explicit migrations and the API start. Go does not automatically load `.env`; export the variables deliberately. The example password belongs to local Compose development, not production credentials.

From `frontend/`, in another terminal:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5174`. The seed loads the fictional acceptance fixture (Networks A/B, 11 equipment, HDF-01/HDF-02, cables A01–B04) with no drafts; see the README for the smoke flow and for resetting a database seeded before M1. The browser tests use the smaller prototype fixture.

Do not reset Docker volumes, overwrite recorded inventory, or reseed real data as part of a migration test.

## 3. Backend checks

With Compose healthy, from `backend/`:

```sh
export TEST_DATABASE_URL='postgres://nettop:nettop-local@127.0.0.1:55432/nettop?sslmode=disable'
go test -race ./...
go vet ./...
```

Database integration tests use unique schemas and drop them afterward. They must not reset the shared development workspace. Without `TEST_DATABASE_URL`, PostgreSQL-specific cases explicitly skip; a green run with skipped DB tests is not equivalent to a verified migration/round trip.

Use targeted red/green package tests during a checkpoint. For example, M1 starts around `internal/topology`, `internal/planning`, persistence, and HTTP contracts; M2 adds `internal/pathfinding` behavior. After relevant checks pass, broaden only for new changes, regressions, or unresolved concerns.

## 4. Frontend checks

From `frontend/`:

```sh
npm test
npm run typecheck
npm run build
npm run format:check
```

`build` includes strict TypeScript checking. Running both separate typecheck and build can be useful while wiring contracts; do not repeatedly broaden checks without a reason.

Browser tests:

```sh
npx playwright install chromium
npm run test:e2e
```

`playwright.config.ts` starts an isolated test-only Go server and Vite. The test-only server creates an isolated schema, migrates/seeds it, and cleans it on shutdown. It can run alongside development. Its default test DSN can be overridden with `TEST_DATABASE_URL`.

Frontend unit tests cover the map projection (layout, edges, facets, networks, connections, focus, session store) and the results helpers; the browser specs run on the acceptance fixture plus a test-only Expansion draft. M4 must deliberately update the physical-view coverage while retaining valid regression coverage.

## 5. Contract and migration verification

- Confirm current OpenAPI matches actual routes, JSON shapes, status codes, and revision handling.
- Add meaningful negative cases: unknown membership, malformed HDF layout, duplicate side identity, occupied cable endpoints, placement collision, stale draft/base revision, and partial-creation rollback.
- Reconnect to PostgreSQL and trace the saved graph, not merely the in-memory object produced by a command.
- Test fresh migration replay and upgrade of populated installed inventory plus saved plans.
- Keep applied migrations immutable; the runner detects changed checksums.
- Preserve endpoint/cable IDs and verify old references after explicit backfill/remapping.

OpenAPI lint can be run when the contract changes:

```sh
npx --yes @redocly/cli lint ../api/openapi.yaml --extends minimal
```

Run that command from `frontend/`. It is an optional fetched CLI, not a runtime application dependency. Do not treat schema lint as a substitute for API behavior tests.

## 6. First complete browser acceptance

Use the real backend acceptance fixture, not mocked route responses:

1. Select Network A and EDGE-17.
2. Discover AGG-03, AGG-08, and BB-01; AGG-15 is not falsely returned.
3. Switch among all results; record that equipment coordinates, viewport, and other available results remain stable.
4. Observe the correct automatic HDF positions and independent manual expansion.
5. Open Physical → Main Campus → North Sub-main → Rack SM01 → HDF-01.
6. AGG-03 route: 3C/5 rear is cable A02; front is A03. Inspect the peer HDF and its exact position.
7. Return to the same conceptual result/context.
8. Select Network B; shared HDFs remain, and 3C/2 becomes its selected position while 3C/5 stays a separate A circuit in the physical grid.
9. Create a saved proposal, preview a route, reload, and verify it remains absent from Installed until an explicit later implementation workflow exists.

See [acceptance-tests.md](acceptance-tests.md) for cases and the [acceptance example](acceptance-example.md) for exact endpoint pairs.

## 7. Performance evidence

Measure separately: database/snapshot fetch, graph construction, traversal from one versus many source ports, result serialization, map projection, rendering, drag/pan/zoom, and route/detail refresh.

Use realistic generated HDF-heavy datasets, including inactive ports, many active networks, dense core racks, and large passive corridors. Record equipment/endpoint/cable counts, hardware/runtime, and measured budgets. No 60 FPS or sub-millisecond claim is approved merely because a small demo looks smooth. Rendering everything at once is not the product's scaling strategy.

## 8. Checkpoint report

Report:

- Checkpoint scope and any approved changes to it.
- Files, API/schema/migration changes, and compatibility handling.
- Red tests observed and relevant green checks.
- Browser behavior exercised and remaining limitations.
- Accurate status-document updates and next checkpoint.
- Pending user decisions that block subsequent work.

For a requested commit, inspect status/diff/history, stage only intended files, and exclude `.env`, local credentials, dependencies, generated demos, test output, and screenshots. Do not push, amend, skip hooks, or create additional commits without the appropriate user request.
