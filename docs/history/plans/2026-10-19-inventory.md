# Plan: Inventory view (2026-10-19)

The item is the roadmap entry (M5b step 14; moved below, at the end of this file). Its approved design and the owner's answers are there, and the new rules are D37 in [decisions.md](../../decisions.md). The approved demo is [history/demos/inventory-demo.html](../demos/inventory-demo.html): the layout, the columns, the pills, the menus and the panes are as in the demo. **Frontend only**: no API, migration or `types.ts` change. Everything the table shows is already in the snapshot.

## What the user gets

1. A third header choice, **Inventory**, with three lists: Equipment, Ports and positions, and Cables. Each list can be searched, filtered with pills, sorted, grouped and paged.
2. **Export to CSV** of exactly what is on screen, which opens in Excel with Hebrew intact. **Edit columns** changes both the table and the CSV.
3. From any row: the inspector, Focus on the map, the equipment page in Physical, and in a plan Delete… and Disconnect….
4. **Open in inventory** from the inspector and from the Physical equipment page lists that equipment's ports.

## Decisions taken in the plan

- **The view.** `MapView` (in `features/map/MapControls.tsx`) becomes `'conceptual' | 'physical' | 'inventory'`, and `ViewSwitch` gets a third button, **Inventory**. Workspace renders `InventoryPage` for `view === 'inventory'`, as it does `ConceptualMap` and `PhysicalExplorer`. The map is not mounted while the inventory is shown, just as Physical works today. A stale draft keeps showing `StaleCard`, which App already does for every view.
- **Rows** (`features/inventory/rows.ts`, pure):
  - `buildRows(snapshot, index, installedIDs, installedLinkIDs)` returns `{ equipment, ports, cables }`. It runs once per snapshot, memoized on the snapshot in the page.
  - Every row has a stable `key` (the object ID), the IDs it acts on (`equipmentId`, `endpointId?`, `cableId?`), `proposed` (in a plan: not in the installed IDs; installed snapshots never have proposed rows), its natural index `i`, and a `values` record of **plain text per column**. That text is the single value that search, the pills, sorting and the CSV all use.
  - Names stay separate pieces for display. A Far end, A end or B end cell carries `{ equipmentName, label }`, and its text is `"<equipment> <label>"` (a position's label already names its side, "3 · Front"). The component renders the pieces with `Name` and never joins names into one display string.
  - A port's network comes from `endpointNetwork(index, id)` (`features/map/circuitNetwork.ts`). A cable's network is its A end's network, else its B end's. Network values hold the network ID, and the text is its name. Equipment network: the `networkId` of an active device; passive equipment has none.
  - Site, Node and Rack come from `index.places` / `index.racks`. A missing part is empty.
  - Port text: the endpoint `label`. Side: `Front`, `Rear` or empty.
  - The natural order of the Ports list: equipment name, then `comparePorts` from `shared/ports.ts` (the order used everywhere else).
- **Columns** (`features/inventory/columns.ts`, pure):
  - The column specs per list: key, label, width, kind (`text | mono | name | network | status | endpoint | equipmentLink`), and whether it is first (always shown).
  - The pills per list, the Group by choices and the default hidden columns, all exactly as in the demo's `COLS`, `PILLS` and `GROUPS`.
  - The default sort: Equipment by Name, Ports by Equipment, Cables by Cable.
  - The empty text per column: `No network`, `Not set` (status and state), `No side (switch ports)` (side), else `(empty)`.
- **Query** (`features/inventory/query.ts`, pure). `applyQuery(rows, columns, query)`:
  - Pills (value in the chosen set; an empty set means all).
  - Search: case-insensitive "contains" over every column's text, hidden columns included.
  - Sort: one `Intl.Collator(undefined, { numeric: true })`; the U column compares as a number; ties fall back to the natural index `i`; the order flips on a second click.
  - Then either **groups** (sorted by their text, empty last, each with its count, all rows), or the **page** (50 rows; the page number is clamped when the rows shrink).
  - `valueOptions(rows, key)` gives a pill's distinct values with their texts, sorted the same way, with the empty value last.
- **CSV** (`features/inventory/csv.ts`, pure):
  - `toCsv(rows, visibleColumns)` starts with `﻿`, then the header of column labels, then the rows' texts.
  - Separator `,`, line end `\r\n`; a cell with `"`, `,`, CR or LF is quoted and its `"` doubled.
  - A CSV is never grouped.
  - `csvFileName(list, planName?, date)` gives `inventory-<list>[-plan-<slug>]-YYYY-MM-DD.csv`.
- **Session** (`features/inventory/inventorySession.ts`, session-only, outside the Workspace like `physicalSession`):
  - Holds the current list; per list the search text, pills, sort, group, collapsed groups, page and selected keys; hidden columns per list (kept when the list changes).
  - Changing list (or choosing the same list again) resets that list's query, as in the demo; its Network pill starts as the header's network, which the session remembers from `setHeaderNetwork`.
  - `openPorts(equipmentName)` sets the Ports list with only `Equipment == name`, so Open in inventory also clears the header's network (`onNetworkChange(undefined)`) and the two still agree.
  - Selection is kept by key across a refetch. A key that no longer exists is not counted.
- **The header's network (D37).**
  - The page reads App's `networkId` and keeps the Network pill equal to it: a header choice replaces the pill, and All networks clears it.
  - Applying the Network pill with exactly one network calls a new Workspace prop `onNetworkChange(id)` (App's `setNetworkChoice`). With none, it calls it with `undefined`. With several, the header shows "N networks" as a disabled selected option, and the selector keeps it until the user chooses again.
  - Reset filters also clears the header's choice.
  - Nothing changes for the map or Physical.
- **Windowed table** (`InventoryTable.tsx`, no new dependency):
  - Fixed row height (34 px), `table-layout: fixed` with column widths from the specs, and a sticky header.
  - Only the rows in view, plus a margin, are rendered, with top and bottom spacer rows, exactly as the demo's `drawRows`.
  - It scrolls inside its own box (D34: the page never scrolls sideways), and the header scrolls with it horizontally.
  - Group rows are items in the same windowed list. The header checkbox selects the current page (all rows when grouped).
- **Actions.** Every action calls a function App already has. None is duplicated.

  | Action | Calls |
  | --- | --- |
  | First-column link, Open details | Select the equipment and open the inspector. For a port or cable row, also pass the inspector the existing `searchRequest` with `inspectorQuery(index, endpointId)` (as Explore's port hits do), so the port is found. |
  | Show on map | `focusOnMap(equipmentId)`, which opens Focus. |
  | Show in Physical | `showInPhysical(equipmentId, endpointId?)`. A cable uses its A end. |
  | View its ports | `inventorySession.openPorts(name)`. |
  | Edit port details (Installed only) | `showInPhysical(equipmentId, endpointId)`. The details form is on that page. |
  | Delete… (a plan, an installed equipment row) | Open the inspector on it with its `DeleteEquipment` confirm already open. Add an `openDelete` request prop to `Inspector`, passed to `DeleteEquipment` as its initial state. |
  | Disconnect… (a plan, a row with a cable) | Open the inspector on the port's equipment (a cable uses its A end) with the port found (`searchRequest`) and that row's `DisconnectConfirm` already open, through the same kind of request prop. The page stays. |
  | Add in a plan | Opens the Add drawer, as the tool rail does. It is disabled in Installed, with the title "Switch to a plan to add equipment". |
  | Refresh | App's `onRefresh`. It keeps the query and the selection. |
  | Open in inventory | In the inspector's action row after Show in Physical, and on the equipment page next to Print sheet (`FaceView`'s title row): `inventorySession.openPorts(name)`, then switch the view to Inventory. |

  If a confirm cannot be opened from outside without restructuring its component, stop and report. The fallback is to open the place and let the user click, and the owner decides.
- **Explore while the inventory is shown.** Choosing equipment, or a port or cable hit, selects it and opens the inspector, and the page stays. Choosing a site or node highlights it on the map as it does today (which switches to Conceptual). There are no route marks in the table.
- **Drawers (D34).** Any open left or right drawer narrows the page: the same `padding` from `--clear-of-left-drawer` and `--clear-of-right-drawer` as `.physical-top` and `.equipment-page` use. The page's left edge already clears the tool rail.
- **Styles.** `features/inventory/inventory.css` uses only `var(--…)` (`theme.test.ts` guards this). Use the shared `.btn`, `.chip`, `.seg` and `.drawer` classes. Port the status shapes and type icons from the demo to `lucide-react` icons already in use where one fits, else small inline SVGs in `currentColor`. Only Faulty uses `--danger`.
- **Keyboard and a11y** (as in the demo and today's drawers):
  - Escape closes, in order, the row menu, the value picker, a pane, then the inspector, and focus returns to the opener (`useInlineDialog` or the same pattern).
  - Sort headers carry `aria-sort`; the row menu is `role="menu"`; the panes are `role="dialog"`.
  - The meta line is `aria-live="polite"`.
- **Data marks for the specs** on the page root: `data-inventory-list`, `data-inventory-total` (filtered count), `data-inventory-shown` (rows rendered), `data-inventory-page`, `data-inventory-group`, `data-inventory-sort` (`key:asc|desc`), `data-inventory-filters` (JSON of the pills).

## Tests (IDs)

| ID | What | Where |
| --- | --- | --- |
| INV-01 | Rows equal the snapshot: equipment count; one port row per endpoint (both sides of each position); one cable row per cable link (no internal bridges); Far end and A/B pieces; port network from the circuit; proposed only in a plan. Pills, search over hidden columns, sort (numeric, ties by natural order, flip), Group by (counts, empty last), paging and clamping | `rows.test.ts`, `query.test.ts`; `e2e/inventory.spec.ts` on the acceptance fixture |
| INV-02 | The CSV: BOM, header, quoting (`"`, `,`, newline, Hebrew), CRLF, exactly the visible columns and all filtered records (not the page); the downloaded file equals it | `csv.test.ts`; `e2e/inventory.spec.ts` (Playwright download) |
| INV-03 | Row menu and command bar: Open details opens the inspector (a port row finds its port), Show on map opens Focus on it, Show in Physical opens its page at the port; in a plan Delete… shows the delete confirm and Disconnect… the disconnect confirm; none are offered in Installed | `e2e/inventory.spec.ts`, `e2e/inventory.recording.spec.ts` if a command is sent |
| INV-04 | Open in inventory from the inspector and from the equipment page shows Ports and positions with `Equipment == <name>` and only its ports | `e2e/inventory.spec.ts` |
| INV-05 | Edit columns hides a column in the table and in the CSV; the first column cannot be hidden; the choice survives a list change | `inventorySession.test.ts`, `e2e/inventory.spec.ts` |
| INV-06 | The header's network and the Network pill follow each other (D37); Reset filters clears both; the map and Physical are unchanged by the pill | `inventorySession.test.ts`, `e2e/inventory.spec.ts` |
| INV-07 | Campus: build the rows, then time opening Ports and positions (about 51,000 rows), a search, a sort, a Group by, and scrolling a 10,000-row grouped list; record the timings (measurements, not budgets) and the number of rendered rows (a few dozen) | `e2e/scale.spec.ts` |

Edge cases to try in review: an empty installed root (three empty lists, "No records."); Hebrew names in every column and in the CSV; a stale draft (the card, never the table); Installed↔Plan with filters and a selection set; a refetch after a direct fix while the inventory is open (the selection and the page stay); a plan that deletes equipment (its rows disappear, the selection drops it); a list with every column hidden but the first.

## Steps

Each step is one Sonnet prompt, reviewed before the next. Every step ends green.

### 1. Pure modules

Write `rows.ts`, `columns.ts`, `query.ts`, `csv.ts` and `inventorySession.ts` in `features/inventory/`, with their unit tests first (INV-01, INV-02 and INV-05 unit parts, INV-06 session part). No component changes. Checks: `npm test`, `npm run typecheck`, `npm run format:check`.

### 2. The page

- The third view switch.
- `InventoryPage` with the menu, command bar (list actions only), search, pills with the value picker, meta line and Group by.
- `InventoryTable` (windowed), the pager, and the Export to CSV and Edit columns panes.
- The header network link (D37) and drawer narrowing.
- First-column links open the inspector. The row menu and the one-row commands come in step 3; in step 2 the menu is not drawn and the one-row commands are not shown.
- Tests: `e2e/inventory.spec.ts` with INV-01, INV-02, INV-05 and INV-06. Screenshots of each list, a pill open, grouped, the inspector open, Plan, and both panes.
- Checks: everything in "Verifying" in way-of-work.md, with the whole e2e suite.

### 3. Actions and Open in inventory

- The row menu and the one-row commands, as in the table above.
- The open-confirm request props for Delete… and Disconnect….
- Open in inventory in the inspector and on the equipment page.
- Explore while the inventory is shown.
- Tests: INV-03 and INV-04. Checks as in step 2.

### 4. Campus measurement, then docs

- INV-07 in `e2e/scale.spec.ts`, run with `SCALE=1`.
- If anything blocks noticeably (for example a sort of 51,000 rows over 300 ms), report it before changing the design. Possible fixes are precomputed collation keys or sorting off the typing path.
- Then Opus updates the docs (way-of-work.md, "Keeping the docs true"):
  - status.md: the inventory, the timings and the limits;
  - ui-spec.md: the header and an Inventory section;
  - acceptance-tests.md: INV-01 to INV-07;
  - CLAUDE.md: the code map;
  - testing.md: the smoke step;
  - architecture.md if needed.
- Then the item closes: the roadmap entry and this plan move to history.

## Done (2026-10-19)

Built on the branch `inventory`, each step reviewed by Opus with the whole Playwright suite run before approval: c72c0b8 (the approved design, the demo and this plan), bc13c0c (steps 1–3: the pure modules, the page, the actions and Open in inventory), d23f3ff (step 4: INV-07 and the speed fix), then the docs.

- **Changes from the plan.**
  - A position's label already names its side ("3 · Front"), so endpoint cells and their text are the equipment and the label, with no side added.
  - The session remembers the header's network, so a list shown afresh, or the same list chosen again, starts with it in its Network pill; the page only follows the header's changes. Open in inventory and View its ports also clear the header's network, since they list one equipment's ports from every network.
  - Workspace also takes `onOpenAdd` (Add in a plan opens the Add drawer); the header's own change also sets the pill, so choosing the network already chosen replaces "N networks".
  - The ⋯ column sticks to the right edge, since at 1280 px the table is wider than its box. A changed result closes an open row menu.
  - The one-row commands and the "N selected" count use only the rows still listed.
  - `FaceView` took an optional `onOpenInventory` for the button next to Print sheet.
  - Escape closes the row menu before the value picker when both are open (only by keyboard); there is no page-wide Escape.
- **Speed (step 4).** The first campus run took 1.5–3.6 s to open the Inventory in the dev server: building the rows took about 0.8 s, almost all in sorting the 51,456 ports, because `comparePorts` (`shared/ports.ts`) made a collator per comparison. One shared collator, and ranking equipment names once, made it about 0.12 s with the same order (a test pins it).
- **Not tested in the browser:** confirming a Delete or Disconnect started from the Inventory (the confirms are today's, covered by their own specs).

## The roadmap entry (moved here when the item closed, 2026-10-19)

A third header choice next to Conceptual and Physical (an amendment to locked decision 1, see [decisions.md](../../decisions.md)): a table of the same inventory, not a third drawing. The network selector and Installed/Plan apply to it. **The look is the approved demo** [history/demos/inventory-demo.html](../demos/inventory-demo.html) (approved by the owner 2026-10-19; it replaces the M5 demo's inventory). The rules that are new are D37. The plan is [plans/2026-10-19-inventory.md](2026-10-19-inventory.md).

**Design (agreed 2026-10-08 and 2026-10-10, reviewed against today's app and approved 2026-10-19):**
- **Layout: a resource list** (layout only, no vendor names or logos):
  - breadcrumb and title (Installed, or the plan's name with "proposed items are marked");
  - a left menu of lists (Equipment, Ports and positions, Cables) with counts;
  - a command bar: Add in a plan, Refresh, Export to CSV, Edit columns, then actions on one selected row: Open details, Show on map, Show in Physical, and in a plan Delete… (equipment) or Disconnect… (a connected port or a cable);
  - a "Filter for any field..." box and `Field == value` pills, each opening a value picker (Operator, Find a value above 10 values, checkboxes, Select all, Apply/Cancel), and Reset filters;
  - "Showing 1 to N of M records", the selected count and **Group by** (collapsible groups listing every record);
  - a dense table: row checkboxes, ↑↓ sort headers, the first column as a link with a type icon, status as a shape plus the word, network as a coloured dot plus its name, a "⋯" menu per row;
  - paging (50 per page) when not grouped;
  - **Export to CSV** and **Edit columns** as side panes. The CSV holds exactly the visible records and columns.
- **Lists and columns** (as in the demo):
  - Equipment: Name, Kind, Role, Network, Site, Node, Rack, U, Manufacturer, Model, Serial number, IP address (hidden by default), Status.
  - Ports and positions: Port, Equipment, Side, Network, Type, Connector, Speed, State, Cable, Far end, Site and Node (both hidden by default). Default sort: by equipment, then the natural order of its ports.
  - Cables: Cable, A end, B end, Network, Label, Status.
  - A port's network is its circuit's network (the map's rule); a cable's is its A end's, else its B end's.
- **Behaviour:**
  - Names open the existing inspector (a port or cable opens its equipment, with that port found in the inspector). There is no second details screen.
  - Show on map opens Focus.
  - Show in Physical opens the equipment page (at the port for a port or cable row).
  - Delete… and Disconnect… open today's confirms in the inspector, so the page stays.
  - The inspector narrows the page (D34).
  - A stale draft shows its card, as on the map and in Physical.
  - **Open in inventory** in the inspector and on the Physical equipment page opens Ports and positions with `Equipment == <name>`.
- **Owner's answers (2026-10-19, D37):**
  - The header's network choice filters the table: it is the Network pill, and the two follow each other.
  - Status is shown in ink, and only Faulty is red.
  - Ports have a Side column.
  - The CSV starts with a UTF-8 mark.
- **Built as:**
  - `features/inventory/`: pure row builders per list, built once per snapshot from the snapshot index; filter, sort, group and page helpers; a CSV builder (all unit-tested).
  - A windowed table component (no new dependency unless measured necessary).
  - A session-only `inventorySession`.
  - Styles only from `src/shared/theme.css` tokens (D33).
- **Scale:** rows are built once per snapshot, and the search waits briefly while typing.

**Tests:**
- INV-01: the lists, pills, search, sort and Group by match the snapshot.
- INV-02: the CSV equals the visible records and columns.
- INV-03: row actions and the command bar open the same equipment on the map and in Physical.
- INV-04: Open in inventory sets the `Equipment ==` pill.
- INV-05: Edit columns hides a column in both the table and the CSV.
- Campus fixture: the Ports list (about 51,000 rows) filters and sorts without blocking, and a 10,000-row table stays responsive. Both are measured.
