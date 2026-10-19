# Roadmap

Only work that is **not done yet**, in order. What runs today is in [status.md](status.md) (its "Now / Next" box says which item below is current); decisions are in [decisions.md](decisions.md); how an item is designed, built and reviewed is in [way-of-work.md](way-of-work.md). When an item is finished, its entry moves to [history/](history/) and status.md describes what shipped.

Finished milestones (M1–M5c, M5b steps 11–13, P1, P2) and their designs, recorded answers and step tables are in [history/implementation-plan-m1-to-p2.md](history/implementation-plan-m1-to-p2.md). Explanatory paths (2026-10-14) and its design are in [history/plans/2026-10-14-explanatory-paths.md](history/plans/2026-10-14-explanatory-paths.md). The visual pass (2026-10-15) and its design are in [history/plans/2026-10-15-visual-pass.md](history/plans/2026-10-15-visual-pass.md). The conceptual map for real data (2026-10-19) and its design are in [history/plans/2026-10-18-conceptual-map.md](history/plans/2026-10-18-conceptual-map.md). The inventory view (2026-10-19) and its design are in [history/plans/2026-10-19-inventory.md](history/plans/2026-10-19-inventory.md).

## 1. A more useful inventory

Raised by the owner on 2026-10-19, after the inventory view: as built it mostly shows, as a table, what other screens already show, and its row selection feeds nothing beyond one row. Three additions, to be shown first as a clickable demo for the owner to approve (D30):

- **A plan's work list.** In a plan, "Changes only" lists what the plan adds, moves and removes (equipment, cables), exportable as CSV for the people doing the work.
- **Free capacity.** A "Connected: yes / no" pill on Ports and used / free counts on the group rows ("Building A: 212 used, 76 free"); in a plan, Connect… from a free row opens the patching screen.
- **Editing details of many rows.** Select rows and set manufacturer, model or status at once (a direct fix on Installed), with a "Missing details" filter. This one needs a server command that applies many fixes in one transaction.

The first two read data the app already has; the third changes the API.

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
