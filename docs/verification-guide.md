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
cp .env.example .env    # once; DATABASE_URL and TEST_DATABASE_URL
```

From `backend/`:

```sh
go run ./cmd/db migrate
go run ./cmd/db seed
go run ./cmd/api
```

**How a new database is started.** `go run ./cmd/db migrate` creates the tables, then `go run ./cmd/db init` creates the empty installed root (no networks, sites or equipment; networks are created in the app). `init` is safe to repeat: on an initialized database it prints "already initialized" and changes nothing. This is the production start. `seed` is for development data only: it loads the fictional fixture, and it is refused by an initialized database (so `init` then `seed` is refused, and `init` after `seed` leaves the seeded data alone). `cmd/api` also needs `APP_ENV` (`dev`, `test` or `prod`); `.env.example` has `APP_ENV=dev`, so add that line to an existing `.env`.

**Run `seed` only on an empty development database.** It refuses to overwrite existing data. An initialized database only needs applicable explicit migrations and the API start. The Go commands, Go database tests, and Playwright read `.env` at the repository root (a variable already set in the environment wins); keep `.env` out of commits. The example password belongs to local Compose development, not production credentials.

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
go test -race ./...     # TEST_DATABASE_URL comes from .env
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

The Playwright config has two projects: `main` (every spec except `*.recording.spec.ts`) and `recording` (`changes.recording.spec.ts`), which depends on `main` and runs after it with one worker. Recording a plan changes the shared test server's installed revision and makes every other draft stale, so specs that record or make drafts stale must be named `*.recording.spec.ts`, build their own drafts, and not depend on each other's order. If a `main` spec fails, `recording` does not run.

Frontend unit tests cover the map projection (layout, edges, facets, networks, cables and colors, highlight, session store, route view, export, center) and the inspector, picker and results helpers; the browser specs run on the acceptance fixture plus a test-only Expansion draft. M4 must deliberately update the physical-view coverage while retaining valid regression coverage.

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
9. Create a saved proposal, preview a route, reload, and verify it remains absent from Installed until it is recorded (see 6a).

See [acceptance-tests.md](acceptance-tests.md) for cases and the [acceptance example](acceptance-example.md) for exact endpoint pairs.

## 6a. Editing and recording installed changes (M5a)

On a development database, review `backend/migrations/007_record_installed.sql` before `go run ./cmd/db migrate`. Recording changes installed data: use a seeded development database, never one you want to keep. Then, in the browser:

1. **Make a draft.** Header **Plan: …** → Changes → **New draft** → name it. The drawer now shows the draft picker and "No changes yet".
2. **Delete PANEL-A and read the preview.** In Physical open Building A → Rack A03 → PANEL-A (or select it on the map and use the inspector). Choose **Delete…**: the confirm must read "Removes PANEL-A, its 48 positions and their front/rear bridges and 6 cables (…)" and "Cuts 3 circuits": EDGE-17 port 1 → AGG-03 port 1, port 2 → AGG-08 port 1, port 3 → BB-01 port 1. **Delete in plan**; Installed still has PANEL-A.
3. **Add something.** In the library (**Add**), **Add Access switch…**: a name, Network A, Rack A03, a free unit. Trace in the plan; Installed is unchanged.
4. **Undo.** In the Changes drawer each line links to its object and has **Undo**; undo the delete and PANEL-A is back with its six cables; undo the new switch and anything that depended on it goes too (the toast says so).
5. **Record.** **Record as installed…**: the review step runs the check first; Record stays off until there is a note and Recorded by. Record; the workspace switches to Installed with the same location, the change is there, and the drawer lists the plan as recorded (read-only, with who, when and why).
6. **Make another draft stale.** Make two drafts from the same Installed, record one, then open the other in Plan view: a card says "Installed changed since this draft". **Update draft** either moves it or lists each change that no longer fits, with a link and a reason; **Drop** a conflicting change, then **Update draft** again.

Recorded plans stay in the database as the record of the change; reset the development database and reseed to get back to the acceptance fixture.

## 6b. Data-entry rehearsal (M5c step 10, design 18)

The owner runs this by hand, once, before the real network is entered. It enters one typical node of the campus fixture with the bulk tools, times it, and lists every friction point; the fixes go into M5b or M6. Nothing here is automated, and the results table at the end is left empty until it has been run.

**Use a database of its own, never the development database and never one with real data.** The rehearsal records plans as installed, and a recorded plan cannot be reverted.

### Start an empty database

From the repository root (Compose running, `docker compose up -d --wait`). Put `DATABASE_URL` in front of each command, as below: a variable already set in the environment wins over `.env`, and nothing is exported or written to `.env`.

```sh
docker compose exec db psql -U nettop -d nettop -c 'CREATE DATABASE nettop_rehearsal'
cd backend
REH='postgres://nettop:nettop-local@127.0.0.1:55432/nettop_rehearsal?sslmode=disable'
DATABASE_URL=$REH go run ./cmd/db migrate
DATABASE_URL=$REH go run ./cmd/db seed -fixture empty   # the three campus networks (A, B, C) and nothing else
DATABASE_URL=$REH HTTP_ADDR=127.0.0.1:8081 go run ./cmd/api
```

In another terminal (`frontend/`): `API_PROXY_TARGET=http://127.0.0.1:8081 npm run dev -- --port 5177`, then open `http://127.0.0.1:5177`. Installed is empty. To start over, drop and recreate the database: `docker compose exec db psql -U nettop -d nettop -c 'DROP DATABASE nettop_rehearsal' -c 'CREATE DATABASE nettop_rehearsal'`, then migrate and seed again.

### The node: Building 01 (and the sub-main HDF it ends on)

Building 01 is a typical access node of `backend/internal/scalefixture`: 7 racks, 42 access switches, one patch panel, and one circuit per switch. The campus has 33 of them, so the time per node is the time of the real job in miniature. The circuit ends on the sub-main HDF, so that is entered too; the rest of the campus (Main Distribution) is not.

| What | Contents |
| --- | --- |
| Site | Campus |
| Node | **Building 01** and **Sub-main 1**, both in Campus |
| Racks | **B01-R1 … B01-R7** in Building 01, 42 units each; **SM1-R1** in Sub-main 1, 42 units |
| Switches | 6 per rack in B01-R1 … B01-R7 (42 in all): kind switch, role **access**, height 1 U, **24 ports**. Names **ACC-B01-R1-S1 … ACC-B01-R7-S6**. Networks by position in the rack: S1 A, S2 B, S3 C, S4 A, S5 B, S6 C (the same in every rack). The fixture puts them at U2, U4 … U12; see "Expect these differences" |
| Patch panel | **PANEL-B01** in B01-R1 at U40: kind panel (passive), height 1 U, **48 positions** |
| HDF | **SM1-HDF** in SM1-R1 at U4: height 3 U, **32 rows** |

Cable runs (84 cables):

| Run | From | To | Shape |
| --- | --- | --- | --- |
| 1 | PANEL-B01 position 1 **rear** (…42) | SM1-HDF **1A/1 rear** (…2C/6 rear) | **one range of 42**: the HDF fills 1A–1D (24), then 2A, 2B and 2C (18) |
| 2 | each of the 42 switches, **port 1** | PANEL-B01 **front**, position 1 for the first switch in the rack order B01-R1-S1 … B01-R7-S6, then 2, 3 … 42 | **42 single cables**: the pairs are on different switches, so no range covers them |

The cables from the HDF's front to Main Distribution are not part of the rehearsal; the circuits stop at SM1-HDF's front positions.

Totals to check in the Changes drawer before recording: **1 site, 2 nodes, 8 racks**; **44 equipment** (42 switches, PANEL-B01, SM1-HDF); **84 cables connected**.

### Order, with the bulk tools

Make a draft first (Changes → **New draft**, "Rehearsal Building 01"), then:

1. **Add site, node, rack.** Physical → Sites → **Add site** (Campus); on the site screen **Add node** twice (Building 01, Sub-main 1); in each node **Add rack** (B01-R1 … B01-R7, SM1-R1; 42 units). Record the time per rack: a rack is one small form.
2. **Add… (library).** SM1-HDF with **Add HDF…** (SM1-R1, U4, height 3, 32 rows). In **B01-R2** only, add three switches with **Add Access switch…**: S1 Network A, S2 Network B, S3 Network C (24 ports each, units of your choice).
3. **Duplicate…** each of those three once ("1 more like ACC-B01-R2-S1", and likewise S2 and S3), so the rack holds two switches of each network.
4. **Copy rack layout…** into B01-R1, B01-R3 … B01-R7 (the target must be empty), choosing B01-R2 as the source each time. Panel not yet: it would be copied too.
5. **Add…** PANEL-B01 (Add Patch panel…, 48 positions) into B01-R1 at U40.
6. **Connect a range…** from PANEL-B01 position 1 rear, count 42, far start SM1-HDF 1A/1 rear. Check the preview before sending: 2A/1 must follow 1D/6, and nothing is marked.
7. The 42 switch-to-panel cables with **Connect…** (switch port 1 → the next free PANEL-B01 front position), in the order you would walk the building.
8. **Check** the totals (Changes drawer), open the Physical view of one rack and the conceptual map once, then **Record as installed…** (note "Rehearsal Building 01", Recorded by your name).
9. In Installed, trace from port 1 of the switch you cabled to PANEL-B01 front position 1 to SM1-HDF 1A/1 front: the circuit must run switch → PANEL-B01 front → rear → SM1-HDF rear → front.

### Expect these differences from the fixture (they are results, not failures)

- **Names.** Duplicate and Copy rack layout name new equipment by counting the trailing number up past every name already taken, so the copies of ACC-B01-R2-S1 in the other racks come out as -S7, -S8 … rather than ACC-B01-R3-S1. Proposed equipment cannot be renamed until M5b. Write down how many names would have needed fixing, and decide whether that matters for the real network.
- **Units.** The fixture's switches sit at U2, U4 … U12 (a free unit between each); Duplicate takes the next free unit, so the copies sit at consecutive units.
- **Single cables.** Run 2 is 42 separate Connect… actions. Note the time per cable and what would make it faster.

### What to time

Use a stopwatch and note the lap at the end of each step:

| Lap | From → to |
| --- | --- |
| A | step 1 (site, 2 nodes, 8 racks) |
| B | step 2 (SM1-HDF and the three switches of B01-R2) |
| C | step 3 (Duplicate ×3) |
| D | step 4 (Copy rack layout ×6) |
| E | step 5 (PANEL-B01) |
| F | step 6 (the range of 42) |
| G | step 7 (42 single cables) |
| H | steps 8–9 (check, record, trace) |
| Total | start to the recorded plan |

Also note any wait longer than a second (a batch, a refetch, the Changes drawer), and any time the draft would not take a change. **Time Record as installed on its own:** it writes one statement per added row, and in the step 10 review a plan with SM1-HDF alone (about 1,600 endpoints) took 4.3 s to record, and 36 switches plus 42 cables took 1 s, so the whole node may take several seconds. Write the time down; if it is too slow, batching the writes goes to M6.

### Results (empty until the owner has run it)

| Lap | Time | Notes |
| --- | --- | --- |
| A site, nodes, racks | | |
| B SM1-HDF and R2 switches | | |
| C Duplicate ×3 | | |
| D Copy rack layout ×6 | | |
| E PANEL-B01 | | |
| F range of 42 | | |
| G 42 single cables | | |
| H check, record, trace | | |
| **Total** | | |

| # | Where | What got in the way | Severity (blocks / slows / annoys) | Fix goes to (M5b / M6) |
| --- | --- | --- | --- | --- |
| | | | | |

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
