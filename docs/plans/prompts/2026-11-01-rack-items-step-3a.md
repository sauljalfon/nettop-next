# Sonnet prompt — Rack items, step 3a: the acceptance fixture gains three rack items

You are implementing **step 3a** of the "Rack items" item in the Net-Top repository (branch `rack-items`; steps 1 and 2 are committed). Work test-first. **Do not commit.**

## Read first

1. `AGENTS.md` and `CLAUDE.md` (rules, commands; Playwright starts `backend/cmd/testserver`, which seeds this fixture plus an "Expansion" draft).
2. `docs/plans/2026-11-01-rack-items.md`: **The model**, **Decisions taken in the plan** (7) and **Step 3** (this is its first prompt, 3a).
3. `backend/internal/acceptance/fixture.go` and `fixture_test.go` (`TestFixtureCounts`, `TestInventoryAndLocations`, `TestFixtureIDsAreStableAndIndependentOfLabels`).
4. `docs/acceptance-example.md` §1 (the inventory table) and §5 (cross-view expectations).
5. `backend/cmd/testserver/main.go`: the Expansion draft adds **EDGE-18 at Rack A03 U6**, so U6 of Rack A03 is not free in the specs.

## What to build

Three installed rack items in `acceptance.Installed()`, with stable IDs, added in their own small loop or literal after the panels (no endpoints, no links):

| ID | Name | Kind / role | Type | Text | Rack | Height |
| --- | --- | --- | --- | --- | --- | --- |
| `ups-a03` | `UPS-A03` | `rack_item` / `none` | `ups` | | `rack-a03` | 2 |
| `cm-a03` | `CM-A03` | `rack_item` / `none` | `cable-manager` | | `rack-a03` | 1 |
| `kvm-core-01` | `KVM-CORE-01` | `rack_item` / `none` | `other` | `KVM switch` | `rack-core-01` | 1 |

**The units are yours to choose**, on units free today, under these rules:

- Rack A03 today: EDGE-17 U8, PANEL-A U11, and EDGE-18 U6 in the Expansion draft. Rack Core 01: HDF-02 U4–U6, AGG-03 U8.
- Prefer units the browser specs do not drop on, move to or count. Before choosing, grep `frontend/e2e/` for the rack (`rack-a03`, `rack-core-01`, `Rack A03`, `Rack Core 01`) and its units (`rack-slot-rack-a03-<n>`, `U<n>`, `data-unit`), and run the **whole** e2e suite once **before** your change so you know what was green.
- Put the chosen units in the table in your report, with the reason for each.

## Tests first (write them, run them, see them fail, then the code)

In `backend/internal/acceptance/fixture_test.go`:

- `TestFixtureCounts`: 14 equipment (was 11); the endpoint and link counts are **unchanged**.
- A new `TestRackItems`: the three exist with the kind, role, type, text, rack, unit and height above; none owns an endpoint; none is an end of any link; `topology.Validate` of the whole fixture passes.
- `TestFixtureIDsAreStableAndIndependentOfLabels` (or the test that lists IDs) includes the three IDs.

Then `go test -race ./...` **with `TEST_DATABASE_URL` set** (say that the DB tests ran): other packages use this fixture (`fixes`, `pathfinding`, `planning`, `cmd/db`, `cmd/testserver`), so fix any count they assert, and say which ones you fixed and why. **No pathfinding result may change**; if one does, stop and report it.

## The browser specs

The fixture is shared with Playwright, so this step keeps the e2e suite green:

- Run `npm run test:e2e` (from `frontend/`) after the change.
- A spec that fails **only because the fixture now has these three items** (a count of equipment rows, of available units, of rack previews' blocks, a unit that is no longer free) is updated in that spec, the smallest change that keeps what it tests. List every such line in your report with its old and new value.
- A spec that fails for any other reason (a crash, a rack item shown where it must not be, a page that breaks on one) is **not** fixed here: stop and report it with the error. Step 3b handles rack items in the patching screen, the Changes lines, the details editor and the Inventory, so a failure there may be expected; say which.

## Docs

`docs/acceptance-example.md`:
- §1: the three rows in the inventory table (Kind "Rack item / `none`", Network "—", the rack, the units, Capacity "No ports; type UPS" / "type Cable manager" / "type Other, KVM switch").
- One sentence under the table: rack items take units, have no ports and are never in a trace.
- §5 only where a stated count or a rack's contents changes.

## Rules

- If the design cannot work as written, **stop and report the exact problem**; do not invent another behaviour.
- Touch only `backend/internal/acceptance/`, the Go tests that assert fixture counts, `docs/acceptance-example.md` and the e2e spec lines described above. No frontend source.
- **Do not commit.**

## Verify

- From `backend/`: `go test -race ./...` with `TEST_DATABASE_URL`, `go vet ./...`.
- Postgres must be running (`docker compose up -d --wait` from the repo root); Playwright's `cmd/testserver` seeds the fixture itself.
- From `frontend/`: `npm run test:e2e` (the whole suite), before and after.

## Report

The red run, the green runs (Go and e2e, with counts), the chosen units and why, every Go test and e2e line you changed with old and new values, `git diff --stat` and the full diff, and anything you did differently from this prompt and why.
