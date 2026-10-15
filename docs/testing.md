# Testing and verification

How to set up, run and check the project. Every review runs the checks in §3–§4 ([way-of-work.md](way-of-work.md)).

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

## 2. Run it locally

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

Open `http://127.0.0.1:5174`. The seed loads the fictional acceptance fixture (Networks A/B, 11 equipment, HDF-01/HDF-02, cables A01–B04) with no drafts; §2a is the smoke flow, and the README says how to reset a database seeded before M1. The browser tests use the same acceptance fixture plus one draft named Expansion (`cmd/testserver`).

Do not reset Docker volumes, overwrite recorded inventory, or reseed real data as part of a migration test.

## 2a. Smoke flow (acceptance seed)

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

HDFs appear as one compact card each. `add_hdf` is available through the API: see `api/openapi.yaml`. Browser tests run on the acceptance fixture plus one test-only draft named Expansion. See [status.md](status.md) for limits.

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

`src/shared/theme.test.ts` is the look's rule test (D33): colours, font sizes under 11px and uppercase transforms are allowed in `theme.css` only (its allowlist of unconverted files is empty), the retired names (`--purple`, `--line`, `--muted`, `--green`, `.button`, `.outline-button`) are gone, and every token has its planned value. It runs with `npm test`.

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

Recording changes installed data: use a seeded development database, never one you want to keep. Then, in the browser:

1. **Make a draft.** Header **Plan: …** → Changes → **New draft** → name it. The drawer now shows the draft picker and "No changes yet".
2. **Delete PANEL-A and read the preview.** In Physical open Building A → Rack A03 → PANEL-A (or select it on the map and use the inspector). Choose **Delete…**: the confirm must read "Removes PANEL-A, its 48 positions and their front/rear bridges and 6 cables (…)" and "Cuts 3 circuits": EDGE-17 port 1 → AGG-03 port 1, port 2 → AGG-08 port 1, port 3 → BB-01 port 1. **Delete in plan**; Installed still has PANEL-A.
3. **Add something.** In the library (**Add**), **Add Access switch…**: a name, Network A, Rack A03, a free unit. Trace in the plan; Installed is unchanged.
4. **Undo.** In the Changes drawer each line links to its object and has **Undo**; undo the delete and PANEL-A is back with its six cables; undo the new switch and anything that depended on it goes too (the toast says so).
5. **Record.** **Record as installed…**: the review step runs the check first; Record stays off until there is a note and Recorded by. Record; the workspace switches to Installed with the same location, the change is there, and the drawer lists the plan as recorded (read-only, with who, when and why).
6. **Make another draft stale.** Make two drafts from the same Installed, record one, then open the other in Plan view: a card says "Installed changed since this draft". **Update draft** either moves it or lists each change that no longer fits, with a link and a reason; **Drop** a conflicting change, then **Update draft** again.

Recorded plans stay in the database as the record of the change; reset the development database and reseed to get back to the acceptance fixture.

## 6b. Data-entry rehearsal

Not run: the owner's real data entry replaced it (2026-10-13). The prepared procedure is in [history/data-entry-rehearsal-2026-10-11.md](history/data-entry-rehearsal-2026-10-11.md).

## 7. Performance evidence

Measure separately: database/snapshot fetch, graph construction, traversal from one versus many source ports, result serialization, map projection, rendering, drag/pan/zoom, and route/detail refresh.

Use realistic generated HDF-heavy datasets, including inactive ports, many active networks, dense core racks, and large passive corridors. Record equipment/endpoint/cable counts, hardware/runtime, and measured budgets. No 60 FPS or sub-millisecond claim is approved merely because a small demo looks smooth. Rendering everything at once is not the product's scaling strategy.

## 8. Reporting

What a Sonnet report contains, how Opus reviews it, and what a commit may include are in [way-of-work.md](way-of-work.md). Never stage `.env`, credentials, dependencies, test output or screenshots.
