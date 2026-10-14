# Roadmap

Only work that is **not done yet**, in order. What runs today is in [status.md](status.md) (its "Now / Next" box says which item below is current); decisions are in [decisions.md](decisions.md); how an item is designed, built and reviewed is in [way-of-work.md](way-of-work.md). When an item is finished, its entry moves to [history/](history/) and status.md describes what shipped.

Finished milestones (M1–M5c, M5b steps 11–13, P1, P2) and their designs, recorded answers and step tables are in [history/implementation-plan-m1-to-p2.md](history/implementation-plan-m1-to-p2.md).

## 1. Explanatory paths (next)

Recorded 2026-10-13, from photos of real data. A trace is hard to follow: tiny cards in the route view, server cable IDs (`cable-LTICTBBMVKJJAO6KNXFWG35XJ2`), "PANEL BRIDGE … bridge" rows, no physical place per step, and Hebrew names mixed with left-to-right labels.

**Owner's answers:** (1) on a switch, **both** an uplinks summary and the full path of a selected port; (2) a path is explained as a **walk sheet**.

**Design (frontend only, no API change):**
- **Walk sheet:** one pure path model built from a trace result: steps grouped by place (Site › Node › Rack, with the unit), one row per equipment with where the signal enters and leaves ("in front 2 → out rear 2"; the bridge is folded into the row, never its own row), cables between rows shown by their **label** when set and otherwise a short form of the ID (full ID on hover), and a note when the path changes place ("leaves Building A"); the destination row marked; right-to-left names kept readable (bidi isolation). It replaces the hop list in the results panel; Route view and PNG/PDF stay.
- **Switch uplinks summary:** at the top of a switch's equipment page in Physical (and in the inspector), one line per port that reaches an AGG/BB, from the existing Find AGG / BB result for that switch: "Te1/1/1 → AGG-03 · Te1/1/1 · 4 cables · via PANEL-A › HDF-01 › HDF-02"; a line opens its walk sheet.
- **Selected port's path:** a click on any port of the faceplate shows that port's walk sheet in the side panel, wherever the path ends (an AGG/BB, another switch, a free end).

**First step:** a clickable demo on data like the owner's (Hebrew names, many HDFs), approved by the owner before any plan.

## 2. Conceptual map for real data

Recorded 2026-10-13; moves the map part of M6 forward. Photos showed the map unusable at real size: cards in long rows too small to read and lines crossing the whole screen (the layered layout places by role, so a building's switches and its panel end up far apart).

**Owner's answer:** the map is used for an **overview of the whole network**, the **neighbourhood of one device**, and **arranging it by hand** (kept).

**Design:**
- **Overview:** the map opens on **nodes** as cards grouped by site, one line per pair of nodes with the cable count, arranged by cable distance (access → passive corridors → AGG/BB, as the large-site layout in Physical); a node opens its equipment in place.
- **Neighbourhood (Focus):** a selected device shown with only what is cabled to it (one hop, "+1 hop" to widen), with large readable cards.
- **Saved arrangement:** dragged positions are saved on the server, shared and kept after reload, like the site screen's node positions (a new table and migration).

**First step:** a clickable demo, approved before any plan.

## 3. Inventory view (M5b step 14)

A third header choice next to Conceptual and Physical (an amendment to locked decision 1, see [decisions.md](decisions.md)): a table of the same inventory, not a third drawing. The network selector and Installed/Plan apply to it. The look was approved from the M5 demo ([history/demos/m5-demo.html](history/demos/m5-demo.html)).

**Design (agreed 2026-10-08 and 2026-10-10):**
- `features/inventory/`: pure row builders per list from the snapshot index, filter and sort helpers, a CSV builder (unit-tested); a windowed table component (no new dependency unless measured necessary); **Open in inventory** in the inspector header and on the Physical equipment page (the Ports list with the pill `Equipment == <name>` set).
- **Look: a cloud-portal resource list** (layout and style only, no vendor names or logos): breadcrumb and title; a left menu of lists (Equipment, Ports and positions, Cables) with counts; a command bar (Add in a plan, Refresh, Export to CSV, Edit columns, then actions on one selected row); a "Filter for any field..." box and `Field == value` pills, each opening a value picker (Operator, checkboxes, Select all, Apply/Cancel), and Reset filters; "Showing 1 to N of M records", the selected count and **Group by** (collapsible groups); a dense table with row checkboxes, ↑↓ sort headers, the name as a link with a type icon, status as icon plus text, network as a colored dot, and a "…" menu per row; paging (50 per page) when not grouped; **Export to CSV** and **Edit columns** as side panes (the CSV holds exactly the visible records and columns). Names open the existing inspector; there is no second details screen.
- **One design system:** the portal-style tokens (colors, spacing, control sizes) live in one shared stylesheet, not inside the inventory component.
- **Scale:** rows built once per snapshot, the search waits briefly while typing.

**Tests:** INV-01 lists, pills, search, sort and Group by match the snapshot; INV-02 the CSV equals the visible records and columns; INV-03 row actions and the command bar open the same equipment on the map and in Physical; INV-04 Open in inventory sets the `Equipment ==` pill; INV-05 Edit columns hides a column in the table and the CSV; on the campus fixture the Ports list (about 51,000 rows) filters and sorts without blocking, and a 10,000-row table stays responsive (measured).

## 4. M6 — Layout, undo and measured scale

- **Measure on real data** before go-live and agree budgets. Starting point (campus fixture, development machine; measurements, not budgets): topology load 0.36 s, first map render 3.6 s, Find AGG / BB 0.78 s, Trace drawer 0.33 s, picker search 0.29 s, Explore 0.77 s (search 0.56 s), a 32-row HDF page 0.59 s, the campus site screen 0.52 s. Reduce what the first render draws.
- Scoped APIs: neighbourhood and route-object fetch, summaries and bundles, pagination of `GET /api/plans` (large drafts); bounded neighbourhoods; detailed-port virtualization. Revision-keyed graph caching only when measurements justify it.
- Persist workspace preferences (expansion, pins) if wanted; separate layout undo and plan undo.
- Drag-to-rack on the map (dropped from M5) may return here.
- The Copy rack layout popover is positioned once when it opens and does not follow page scroll or resize.

**Acceptance:** reload restores layout and context without changing physical placement; summary counts map to real cables; search, focus and trace work on hundreds of equipment and tens of thousands of cables, including large HDFs; measured costs are recorded with agreed budgets.

## 5. M7 — Identity and governance

Authentication and permissions (who may create or rename networks, record plans as installed, make direct fixes), review/approval, an audit trail (direct fixes and recorded plans get a user), HTTPS with the login (see [infrastructure.md](infrastructure.md) §2.3). Approval never implies installation; conflicts stay explicit; commands are never rebased or retried automatically.

## 6. Production servers

The three-server cluster (k3s, CloudNativePG, Garage) is designed in [infrastructure.md](infrastructure.md). The owner builds it by hand with Claude as helper (see [way-of-work.md](way-of-work.md)). Until then the single test server runs [infra/compose](../infra/compose/README.md) and holds real data.

## Backlog (small, not scheduled)

- The Changes drawer lists no line for `update_details` entries (details edited in a plan); only renames get one.
- Editing cable, site, node and rack details in the UI (the direct-fix API already supports them).
- Saved switch models; bulk port rename; renaming a port in a plan.
- A spreadsheet import, through the same draft and record path, only if the real network turns out much larger than a few thousand cables (decided 2026-10-10: entry by hand with the bulk tools).
