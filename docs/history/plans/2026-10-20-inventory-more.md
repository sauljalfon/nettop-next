# Plan: A more useful inventory (2026-10-20)

The item is the roadmap entry (moved below, at the end of this file). Its approved design and the owner's answers are there, and the rules are D38 in [decisions.md](../../decisions.md). The approved demo is [history/demos/inventory-plus-demo.html](../demos/inventory-plus-demo.html): the lists, columns, pills, panes and wording are as in the demo. It builds on the inventory view (D37, [2026-10-19-inventory.md](2026-10-19-inventory.md)).

**One backend change:** a request that applies many direct fixes at once. Everything else is frontend and uses commands that exist (`batch`, `update_details`, `delete_equipment`, `disconnect_cable`) and the existing print code.

## What the user gets

1. In a plan, a **Work list**: what to remove, move, add, connect and disconnect, in order, with where, exportable.
2. **Racks** with their free units and largest free block; **free and used ports** on equipment, ports and group rows.
3. **Problems** the data shows, with a count.
4. **Missing** details found with a pill, and fixed for many rows at once.
5. **Delete** and **Disconnect** of many rows in a plan, in one step.
6. **Cable labels** to print.
7. **Saved views** in the browser.

## Decisions taken in the plan

- **Lists.** `InventoryList` becomes `'equipment' | 'ports' | 'cables' | 'racks' | 'problems' | 'work'`. The left menu shows Work list first in a plan only (in Installed it is not offered; a session on `work` falls back to Equipment when the context changes to Installed). Problems shows its count in `--danger` when above zero.
- **Columns** (as in the demo):
  - Equipment adds `used` "Ports used" and `free` "Ports free" (numeric, after U); Manufacturer is hidden by default (IP address stays hidden).
  - Ports adds no column; its pills gain Node and Connected (`Yes` / `No`).
  - Racks: Rack (first, name), Site, Node, Height, Used, Free (numeric, shown with "U"), Largest free block, Equipment (numeric).
  - Problems: Object (first), Problem, Detail (endpoint and network pieces, never one joined string), Site, Node.
  - Work list: Object (first), Step (numeric, the default sort), Action (a chip with its icon), Where (place pieces or both cable ends), Detail, Node (hidden).
- **List-valued fields.** `missing` (Equipment) and `fits` (Racks) hold several values: a row matches a pill when any of its values is chosen, an empty list matches the empty value ("Nothing missing", "Full"). Search and the CSV read them joined with ", ". Not sortable or groupable.
- **Ports used and free.** A switch counts its ports with a cable; a panel or HDF counts its positions cabled on either side (bridges are not cables). Group rows on Ports say "N used · M free", on Equipment "N ports used · M free", on Racks "N U free", counted over the rows listed.
- **Racks.** From the snapshot index: each rack's height, the units its equipment covers (unit to unit + height − 1, in the current context), the free units, the largest free run and Fits (1U, 2U, 4U, 8U when the largest run is at least that). Show in Physical opens the rack (`openLocation`).
- **Problems** (`features/inventory/problems.ts`, pure, once per snapshot):
  - a cable whose two ends carry different circuit networks (`endpointNetwork`), reported on its A end's equipment, at any role (D38);
  - a port whose state is faulty or disabled and that has a cable;
  - an IP address on two or more equipment (each one listed, naming the others);
  - a switch with no serial number.
  Each problem has a stable key (`<rule>:<id>`), so selection survives a refetch. Nothing is guessed from names.
- **Work list** (`features/inventory/workList.ts`, pure): one row per `planSummary` line (the Changes drawer's own lines, so the two never disagree), in the order removals, moves, additions (containers, then equipment), cables connected, cables disconnected, numbered. Its place comes from the installed index for removals and disconnects and from the proposed index for the rest; a move says "From U3 to U8" (or the other rack). A line whose object has no place (a stale draft is never shown) has an empty Where. Renames and details changes are listed with the equipment they change, when `planSummary` has a line for them.
- **Edit details of many rows** (`bulkEdit.ts`, pure, and `BulkEditPane.tsx`):
  - Fields: Equipment manufacturer, model, status; Ports port type, connector, speed, state (the value lists of `features/details/model.ts`). Empty means keep; "— (clear)" clears.
  - "What changes" counts, per field, the rows whose value really changes; only those rows are sent.
  - On Installed: one `POST /api/installed/fixes` with the note. In a plan: one `batch` of `update_details` for the rows the plan adds; when any selected row is installed the command is disabled, titled "In a plan only what it adds is edited; installed details are fixed on Installed".
  - At most 500 rows a request: above that the Save button is off with "Select at most 500 rows".
  - After Installed fixes, App's `onFixed` refetches (the revision does not change); after a plan batch, `PlanEdit` refreshes as today.
- **Delete N… and Disconnect N…** (a plan): one `batch` of `delete_equipment` (Equipment; off when a proposed row is selected) or `disconnect_cable` (Ports and Cables; the selected rows' distinct cables). The pane lists each object with its place, and for Delete the ports or positions, the cables and the circuits cut (from `deletePreview`). The server's 422 is shown in the pane in its words. One row keeps today's Delete… and Disconnect… (the inspector's confirm).
- **Connect…** on a free port row in a plan opens the patching screen with that endpoint as the near end (`patchingSession.open`).
- **Cable labels** (`labels.ts`, pure, and `LabelsPane.tsx`): sources Selected (rows with a cable), Listed (every filtered row with a cable), New in this plan (cables the plan adds); a label is the cable ID, its label (or "No label") and both ends as pieces; pages of 16 (2 × 8 on A4). The PDF draws each page as a sheet and captures it like `exportSheet` (html-to-image, then jspdf with one page per sheet and the ASCII text layer), so Hebrew names print. File name `cable-labels[-plan-<slug>]-YYYY-MM-DD.pdf`.
- **Saved views** (`savedViews.ts`, pure, and the session): `{ name, list, search, filters, sort, group, hidden }` in `localStorage` under one key, every read and write in try/catch (a blocked storage keeps them for the session only). Saving a name that exists replaces it. Opening a view sets the list and its query and columns and the header network from its Network pill (D37); a view of the Work list in Installed says to switch to a plan. No examples are seeded in the app.
- **The command bar** (as in the demo): list actions; then one-row actions (Racks: Show in Physical only; Problems and Work list: Open details and Show in Physical); then the many-row actions (Edit details…, Delete N…, Disconnect N…, Print labels…). Add in a plan is not shown on Problems and the Work list.
- **Styles, a11y and data marks** as in the inventory view. The panes use `useInlineDialog`. `data-inventory-list` takes the new list names.

## Tests (IDs)

| ID | What | Where |
| --- | --- | --- |
| INV-08 | Racks: units used and free, largest free block and Fits from the snapshot (a 4U HDF covers 4 units, a move in a plan changes them); Show in Physical opens the rack | `rows.test.ts` or `racks.test.ts`; `e2e/inventory-more.spec.ts` |
| INV-09 | Problems: each rule on a fixture made to break it, none on the clean acceptance fixture except what it really has; keys stable; a row opens its object | `problems.test.ts`; `e2e/inventory-more.spec.ts` |
| INV-10 | Free capacity: used and free per equipment (switch ports; panel and HDF positions by either side), the Connected pill, group counts; Connect… on a free port in a plan opens the patching screen on it | `rows.test.ts`, `model.test.ts`; `e2e/inventory-more.spec.ts` |
| INV-11 | Work list: one row per `planSummary` line in order with its place (the Expansion draft: EDGE-18 added in Rack A03 and its cable to AGG-15); the CSV of it | `workList.test.ts`; `e2e/inventory-more.spec.ts` |
| INV-12 | Edit details of many rows: the Missing pill; "What changes" counts; on Installed one request writes each fix and its History line, all or nothing, 500 at most; in a plan one batch of `update_details`, off with an installed row | `bulkEdit.test.ts`; Go `fixes`, `persistence` and `httpapi` tests; `src/shared/api.test.ts`; `e2e/inventory-more.recording.spec.ts` |
| INV-13 | Delete N… and Disconnect N… send one batch; the Work list and Changes list them; Undo per change; a 422 shows in the pane | `model.test.ts`; `e2e/inventory-more.recording.spec.ts` |
| INV-14 | Saved views: save, replace, open (list, query, columns, header network), delete; storage that throws keeps them for the session | `savedViews.test.ts`; `e2e/inventory-more.spec.ts` |
| INV-15 | Cable labels: sources, label pieces, 16 a page, file name; the download is a PDF with the right page count | `labels.test.ts`; `e2e/inventory-more.spec.ts` |
| INV-16 | Campus: the time to build Problems and Racks, and 500 direct fixes in one request (measurements, not budgets) | `e2e/scale.spec.ts`; Go `TestFixManyOnCampusIsMeasured` |

Specs that change shared data (installed details, the Expansion draft) run in the `recording` project and restore or build what they change, as `details.recording.spec.ts` and `changes.recording.spec.ts` do.

Edge cases to try in review: an empty installed root (empty lists, no problems); a stale draft (the card, never the Work list); Hebrew names in every new column, the labels and the CSV; 501 selected rows; a fix that one row refuses (nothing is written); a saved view whose columns or pill values no longer exist; storage blocked.

## Steps

Each step is one Sonnet prompt, reviewed before the next. Every step ends green.

### 1. Backend: many direct fixes in one request

- **Domain** (`internal/fixes`): `ApplyMany(snapshot, []Fix)` applies each fix in order to the result of the one before, returning the next snapshot and the changes per fix; any refusal stops it with the fix's position ("fix 3 (ACC-F1-02): status must be active, inactive or maintenance, not \"x\"", the object's name when it has one, else its ID). No name changes in this request: a fix with a name is refused (names are unique; rename one at a time).
- **Persistence** (`Store.FixMany(ctx, fixes, note)`): one transaction, the installed root `FOR UPDATE` once, `loadInstalled` once, `ApplyMany`, then for each fix with changes `writeFixed` and its `change_log` rows (the same note on each). Nothing is written on any refusal. The revision does not change.
- **HTTP:** `POST /api/installed/fixes` with `{note?, fixes: [{kind, id, details}]}` (kind as in the single fix URL: `equipment`, `endpoints`, `links`, `sites`, `nodes`, `racks`) answers `{changes: Entry[]}`. 1–500 fixes (else 422), a topology field or a name 422, an unknown kind or object 404 with the position, unknown fields 400, a note over 500 characters 422. Add `FixMany` to `httpapi.Repository`.
- **Contract:** `api/openapi.yaml`, `frontend/src/shared/types.ts` (`DirectFixMany`), `frontend/src/shared/api.ts` (`fixInstalledMany`) with its client test.
- **Tests first:** INV-12's backend part (domain, persistence with `TEST_DATABASE_URL`, HTTP, client) and `TestFixManyOnCampusIsMeasured` (500 equipment fixes on the campus). Checks: `go test -race ./...` (say whether DB tests ran), `go vet ./...`, `npm test`, `npm run typecheck`, the Redocly lint.

### 2. Frontend pure modules

`columns.ts` (the new lists, columns, pills and groups), `rows.ts` (Ports used and free, Missing, Connected, Racks), `query.ts` (list-valued pills), `problems.ts`, `workList.ts`, `bulkEdit.ts`, `labels.ts`, `savedViews.ts`, the group counts and the many-row command builders in `model.ts`, and `inventorySession` (saved views, the Work list falling back in Installed), with INV-08 to INV-15's unit parts first. No component changes. Checks: `npm test`, `npm run typecheck`, `npm run format:check`.

### 3. The new lists and saved views on the page

- The menu (Work list in a plan, Racks, Problems with its count, Saved views with Save view…), the new pills and columns, the group counts, Connect… on a free port, Show in Physical on a rack.
- Tests: `e2e/inventory-more.spec.ts` with INV-08, INV-09, INV-10, INV-11 and INV-14. Screenshots of each new list, a grouped Ports list with its counts, and Save view.
- Checks: everything in "Verifying" in way-of-work.md, with the whole e2e suite.

### 4. Commands on many rows and labels

- Edit details… (Installed and plan), Delete N…, Disconnect N…, Print labels… with their panes, and the command bar of each list.
- Tests: INV-12 and INV-13 in `e2e/inventory-more.recording.spec.ts`, INV-15 in `inventory-more.spec.ts`. Screenshots of each pane.
- Checks as in step 3.

### 5. Campus measurement, then docs

- INV-16 in `e2e/scale.spec.ts` (`SCALE=1`). If anything blocks noticeably, report it before changing the design.
- Then Opus updates the docs (way-of-work.md, "Keeping the docs true"): status.md, ui-spec.md §5, acceptance-tests.md, CLAUDE.md, testing.md, architecture.md if needed; `api/openapi.yaml` is done in step 1. The item closes: the roadmap entry and this plan move to history.

## Done (2026-10-20)

Built on the branch `inventory` after the inventory view, each step reviewed by Opus with the whole Playwright suite run before approval, then the docs.

- **Speed of many fixes (step 1 review).** `Apply` runs the full `topology.Validate` after each fix, about 40 ms on the campus, so 500 fixes took about 20 s. `ApplyMany` now applies them all and validates once; only when that fails does it apply them one by one with validation to name the first fix that breaks it. 500 equipment fixes on the campus take about 1.2 s in one request.
- **Changes from the plan.**
  - Missing reads the design's fields (Manufacturer, Model, Serial number not on panels, IP address on switches only), not only those Edit details offers; serial numbers and IP addresses are unique, so they are filled one at a time.
  - Missing and Fits are columns, hidden by default, so the search, the CSV and Edit columns handle them; Manufacturer is hidden by default.
  - Units read "12U" and a Racks group row "29U free", as in the demo.
  - A Work row of an added site, node or rack opens that place (Open details and Show in Physical); a removed object has both off with "Removed in this plan: nothing to open". The Work list is built only in a plan.
  - Edit details… keeps its name; the pane's title is "Edit details of N equipment". Manufacturer and Model have a Clear checkbox; the selects have "— (clear)".
  - Delete N… and Disconnect N… take the place of the one-row Delete… and Disconnect… from two selected rows.
  - The label PDF has its own multi-page capture (`exportLabels.ts`) with the same libraries as `exportSheet`. Its default source is Selected, else New in this plan, else Listed.
  - The recording specs make their own drafts and restore the details they change (History keeps the lines).
- **Campus (INV-16).** Racks, Problems, Group by with counts, the Missing pill, Edit details of 500 rows and the label preview each take under 0.25 s; building Racks and Problems takes under 10 ms. **A PDF of every cable's label (5,544 labels, 347 pages) takes about 4.4 minutes**; the owner chose to leave it (normal use is a selection or a plan's new cables). The Work list is not measured on the campus (its setup has no draft).
- **Checked by hand:** the label PDF renders Hebrew names (one page rendered from the INV-15 download).

## The roadmap entry (moved here when the item closed, 2026-10-20)


Raised by the owner on 2026-10-19, after the inventory view, which mostly showed as a table what other screens already show. **The look is the approved demo** [history/demos/inventory-plus-demo.html](../demos/inventory-plus-demo.html) (approved by the owner 2026-10-20); the rules are D38. The plan is [plans/2026-10-20-inventory-more.md](2026-10-20-inventory-more.md).

**Design (approved 2026-10-20):**
- **Work list** (a plan only, first in the left menu): the plan's changes in the order to do them (removals, moves, additions, cables to connect, cables to disconnect), each with its object, where it is (site › node › rack · U, or both cable ends) and a detail; the same changes as the Changes drawer (`planSummary`), with their places. Filters, Group by and Export to CSV as on any list.
- **Free capacity:** Equipment gets **Ports used** and **Ports free** (a panel or HDF counts positions cabled on either side); Ports gets a **Connected** pill (Yes / No) and a Node pill; a group row says "N used · M free" (Ports, Equipment) or "N U free" (Racks). In a plan, a free port's ⋯ menu offers **Connect…** (the patching screen).
- **Racks:** one row per rack: Rack, Site, Node, Height, Used, Free, Largest free block ("U6–U24 (19U)"), Equipment; a **Fits** pill (1U, 2U, 4U, 8U); Show in Physical opens the rack.
- **Problems:** one row per problem, with its object, the problem, a detail in names, site and node, and its count in the left menu: a circuit joins two networks (a cable whose ends carry different circuit networks), a faulty or disabled port has a cable, the same IP address twice, a switch has no serial number. A row opens the object.
- **Missing pill** on Equipment: Manufacturer, Model, Serial number (not panels), IP address (switches only); "Nothing missing" for the rest.
- **Edit details of many rows** (Equipment: manufacturer, model, status; Ports: type, connector, speed, state): a side pane where only filled fields change and "What changes" counts the rows that really change. On Installed: one direct-fix request for all of them, with the optional note in each History. In a plan: `update_details` for rows the plan adds, as one `batch`; with an installed row selected the command is off with its reason.
- **Delete N… and Disconnect N…** (a plan): a side pane lists what goes (ports, cables, circuits cut) and sends one `batch`; Undo per change in Changes. Delete is off when a proposed row is selected ("Use Changes to undo a proposed item").
- **Print labels…** (Cables and the Work list): Selected, Listed, or New in this plan; one label per cable (the cable ID, its label, both ends); A4, 2 × 8 labels a page; a preview, then Download PDF.
- **Saved views:** Save view… keeps the list, search, pills, sort, group and hidden columns under a name, in this browser only; they are listed under the lists, open in one click, and can be deleted.

**Tests:** INV-08 to INV-15 in the plan, and a campus check of the Problems and Racks lists.
