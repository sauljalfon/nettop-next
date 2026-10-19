# Roadmap

Only work that is **not done yet**, in order. What runs today is in [status.md](status.md) (its "Now / Next" box says which item below is current); decisions are in [decisions.md](decisions.md); how an item is designed, built and reviewed is in [way-of-work.md](way-of-work.md). When an item is finished, its entry moves to [history/](history/) and status.md describes what shipped.

Finished milestones (M1–M5c, M5b steps 11–13, P1, P2) and their designs, recorded answers and step tables are in [history/implementation-plan-m1-to-p2.md](history/implementation-plan-m1-to-p2.md). Explanatory paths (2026-10-14) and its design are in [history/plans/2026-10-14-explanatory-paths.md](history/plans/2026-10-14-explanatory-paths.md). The visual pass (2026-10-15) and its design are in [history/plans/2026-10-15-visual-pass.md](history/plans/2026-10-15-visual-pass.md). The conceptual map for real data (2026-10-19) and its design are in [history/plans/2026-10-18-conceptual-map.md](history/plans/2026-10-18-conceptual-map.md).

## 1. Inventory view (M5b step 14)

A third header choice next to Conceptual and Physical (an amendment to locked decision 1, see [decisions.md](decisions.md)): a table of the same inventory, not a third drawing. The network selector and Installed/Plan apply to it. **The look is the approved demo** [history/demos/inventory-demo.html](history/demos/inventory-demo.html) (approved by the owner 2026-10-19; it replaces the M5 demo's inventory). The rules that are new are D37. The plan is [plans/2026-10-19-inventory.md](plans/2026-10-19-inventory.md).

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

## 2. M6 — Layout, undo and measured scale

- **Measure on real data** before go-live and agree budgets. Starting point (campus fixture, development machine; measurements, not budgets): see the campus timings in [status.md](status.md) (the overview's first render is about 2 s, Focus on an access switch about 1.6 s). Reduce what the first render draws.
- Scoped APIs: neighbourhood and route-object fetch, summaries and bundles, pagination of `GET /api/plans` (large drafts); bounded neighbourhoods; detailed-port virtualization. Revision-keyed graph caching only when measurements justify it.
- Persist workspace preferences (open node cards, the viewport, the last Focus) if wanted; separate layout undo and plan undo.
- Drag-to-rack on the map (dropped from M5) may return here.
- The Copy rack layout popover is positioned once when it opens and does not follow page scroll or resize.

**Acceptance:** reload restores layout and context without changing physical placement; summary counts map to real cables; search, focus and trace work on hundreds of equipment and tens of thousands of cables, including large HDFs; measured costs are recorded with agreed budgets.

## 3. M7 — Identity and governance

Authentication and permissions (who may create or rename networks, record plans as installed, make direct fixes), review/approval, an audit trail (direct fixes and recorded plans get a user), HTTPS with the login (see [infrastructure.md](infrastructure.md) §2.3). Approval never implies installation; conflicts stay explicit; commands are never rebased or retried automatically.

## 4. Production servers

The three-server cluster (k3s, CloudNativePG, Garage) is designed in [infrastructure.md](infrastructure.md). The owner builds it by hand with Claude as helper (see [way-of-work.md](way-of-work.md)). Until then the single test server runs [infra/compose](../infra/compose/README.md) and holds real data.

## Backlog (small, not scheduled)

- The Changes drawer lists no line for `update_details` entries (details edited in a plan); only renames get one.
- Editing cable, site, node and rack details in the UI (the direct-fix API already supports them).
- Saved switch models; bulk port rename; renaming a port in a plan.
- A spreadsheet import, through the same draft and record path, only if the real network turns out much larger than a few thousand cables (decided 2026-10-10: entry by hand with the bulk tools).
