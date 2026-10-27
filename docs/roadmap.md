# Roadmap

Only work that is **not done yet**, in order. What runs today is in [status.md](status.md) (its "Now / Next" box says which item below is current); decisions are in [decisions.md](decisions.md); how an item is designed, built and reviewed is in [way-of-work.md](way-of-work.md). When an item is finished, its entry moves to [history/](history/) and status.md describes what shipped.

Finished milestones (M1–M5c, M5b steps 11–13, P1, P2) and their designs, recorded answers and step tables are in [history/implementation-plan-m1-to-p2.md](history/implementation-plan-m1-to-p2.md). Explanatory paths (2026-10-14) and its design are in [history/plans/2026-10-14-explanatory-paths.md](history/plans/2026-10-14-explanatory-paths.md). The visual pass (2026-10-15) and its design are in [history/plans/2026-10-15-visual-pass.md](history/plans/2026-10-15-visual-pass.md). The conceptual map for real data (2026-10-19) and its design are in [history/plans/2026-10-18-conceptual-map.md](history/plans/2026-10-18-conceptual-map.md). The inventory view (2026-10-19) and its design are in [history/plans/2026-10-19-inventory.md](history/plans/2026-10-19-inventory.md). A more useful inventory (2026-10-20) and its design are in [history/plans/2026-10-20-inventory-more.md](history/plans/2026-10-20-inventory-more.md).

## 1. The network hierarchy (the conceptual view's new purpose)

The conceptual map's overview was "only a worse version than Physical"; the owner chose to give the view a purpose instead of removing it: **the network hierarchy**, top to bottom, from the cables. Approved 2026-10-25 from [the demo](history/demos/hierarchy-demo.html) and the owner's answers; the lasting rules are D39 in [decisions.md](decisions.md).

**Owner's answers (2026-10-25).** Purpose: the network hierarchy. Size: some BB, 10–20 AGG and a few hundred access switches per network, up to about 50 nodes under one AGG. Wiring: mostly direct, a minority chained, many uplinks through long passive chains (front › rear › … › AGG). The node overview is replaced; **Focus stays as it is**. With no BB, the top is found **from the cables**. Choose networks with chips; **no "All networks" chip**. A node opens in place and shows its racks and equipment. Accepted all seven of Opus's proposals (below: peer links only, three phases, one rack drawing, one problem definition, plans, remove the overview's layout API, session memory and measuring).

### What the user sees

- **Levels, per network:** the top row, then Aggregation, then Nodes.
  - The top is the network's **BB** (role `backbone`).
  - With no BB, the top is every AGG that is joined to another AGG and that no access switch reaches ("Top AGG").
  - With neither, there is no top row.
- **Lines:**
  - an uplink from a top to an AGG, dashed when that AGG has fewer uplinks to the top than there are tops ("1 uplink to the top");
  - a **peer link** bar between two AGGs (or two tops) of the same level;
  - one line from each AGG to its group of nodes.

  No stack is drawn: the data does not say which cable is a stack, and nothing is guessed. A "stack" mark set by the user is in the backlog.
- **Groups of AGGs:** AGGs joined by a peer link, or sharing access switches, sit side by side over one frame of nodes. A node can appear under two groups, or in two networks.
- **Nodes:** a card per node (site › node, the number of switches, and marks only when something is wrong: "N single", "N chained").
  - Above 12 nodes under one group, the nodes are a **row per site** with small tiles (up to 6 per row).
  - Switches with no uplink, or with uplinks only into another network, go in a **No AGG** group.
- **The uplink of an access switch:** the first active equipment its ports reach over real cables through any passive chain (the walk of `followPort`). A switch reaching another access switch is **chained** and hangs under that switch. A switch with one uplink where its group has more is **single**.
- **Opening a node:** a click opens the node in place as a larger square.
  - It shows each rack of the node top to bottom, with the same rows as Physical's rack: switch, panel and HDF, U numbers and free runs folded.
  - Every network's equipment in the room is shown; another network's switches are quieter with their network's tag.
  - Clicking a switch opens the drawer with its uplinks (ports and the via path, Focus, Inspector, Find AGG / BB). A panel or HDF opens its positions, front and rear.
  - "Uplinks ›" lists every switch of the node; "Close ▴" folds it. Several nodes can be open.
- **Choosing networks:** a row of chips above the map, one per network, with its colour and switch count.
  - A click shows that network only; **+ add** (or Ctrl/⌘-click) shows it too; **✕** removes it (never the last one).
  - Several networks are stacked bands, each with Fold, plus Fold all / Open all.
  - A closed node card shows dots for the other networks in the same room.
  - Find searches every network; a hit in a hidden network adds it.
  - The header's network follows the chips: one network, or "Several networks". The header's "All networks" (Inventory's choice) leaves the map's choice as it was.
- **Only nodes with problems:** a switch in the left panel that hides every node with no mark. A frame says "N nodes · M switches · K with problems".
- **In a plan,** the hierarchy is drawn from the proposed snapshot; equipment and cables the plan adds are dashed (D33). A stale draft is never drawn (as today).
- **Focus** is unchanged, and its Hierarchy / Focus switch replaces Overview / Focus.

### How it is built

- **Frontend only. No new API and no migration.**
  - A pure module, `features/map/hierarchy`, works out the levels, groups, nodes, uplinks and marks once per snapshot.
  - Thin components draw it. Positions are computed and never saved.
- **One rack drawing.** The open node uses `physical/elevation` (`rackElevation`, its free, proposed and muted rows) and Physical's row look, not a second drawing.
- **One problem definition.**
  - The uplink marks (single, chained, no uplink, only into another network) come from the hierarchy module.
  - Inventory's **Problems** list gains these rules from the same module, so "K with problems" on the map and the Problems rows agree. This amends D38's "the uplink check of every access switch is not part of it".
- **The overview goes:**
  - its modules and components;
  - its saved node positions: the `/api/map-layout` endpoints and the frontend calls, removed from `api/openapi.yaml`.
  
  The table stays (no migration) until a later cleanup, so nothing is lost.
- **Session memory** (`mapSession`): the chosen networks, the open nodes, folded bands and Only problems, for the session only, like Focus today.
- **Measure** on the campus fixture before merging: the first draw is no slower than the overview's (about 2 s, see status.md).

### Phases, each deployed and checked on real data before the next

1. **The hierarchy replaces the overview:** done 2026-10-27 ([plan](history/plans/2026-10-26-network-hierarchy-phase-1.md); what runs is in [status.md](status.md)).
   - levels, groups, node cards, the drawer and Only problems;
   - the shared problem rules and the Inventory rows;
   - the layout API removed.

   On the rewired campus the owner asked for **one map** next (Focus inside the hierarchy, a left-to-right tree, a node opened as a list of its switches); its demo, [history/demos/one-map-demo.html](history/demos/one-map-demo.html), awaits approval and, once approved, replaces phases 2 and 3 below.
2. **Opening a node:** racks and equipment in place, through `rackElevation`.
3. **Networks and size:** the chips with + add and ✕, stacked bands with Fold, other-network dots, and a row per site above 12 nodes.

**Acceptance:**
- Every line and mark maps to real cables. Nothing is guessed from names (roles only, D04).
- The counts on the map equal the Problems rows.
- A node opens to the same racks as Physical.
- In a plan, added items are dashed.
- On the campus fixture, the first draw is at most the overview's measured time.

## 2. More equipment

Today equipment is a switch, a panel or an HDF. **Owner's answers (2026-10-25):** the real network also has
- **rack items with no ports** (UPS, PDU, shelves, cable managers, blanks): they take units and have details, never cables, never in a trace;
- **active devices with ports** (servers, firewalls, routers, controllers): cabled like a switch, a trace can end there, shown in Focus and the hierarchy.

Equipment outside a rack (wall outlets, access points, cameras) is not wanted now. **Order:** after phase 1 of the network hierarchy, as its own item; rack items first, then active devices. Not designed yet: it starts with a demo (D30) and the owner's answers on the roles of active devices and where a trace stops.

## 3. M6 — Layout, undo and measured scale

- **Measure on real data** before go-live and agree budgets. Starting point (campus fixture, development machine; measurements, not budgets): see the campus timings in [status.md](status.md) (the overview's first render is about 2 s, Focus on an access switch about 1.6 s). Reduce what the first render draws.
- Scoped APIs: neighbourhood and route-object fetch, summaries and bundles, pagination of `GET /api/plans` (large drafts); bounded neighbourhoods; detailed-port virtualization. Revision-keyed graph caching only when measurements justify it.
- Persist workspace preferences (open node cards, the viewport, the last Focus) if wanted; separate layout undo and plan undo.
- Drag-to-rack on the map (dropped from M5) may return here.
- The Copy rack layout popover is positioned once when it opens and does not follow page scroll or resize.

**Acceptance:** reload restores layout and context without changing physical placement; summary counts map to real cables; search, focus and trace work on hundreds of equipment and tens of thousands of cables, including large HDFs; measured costs are recorded with agreed budgets.

## 4. M7 — Identity and governance

Authentication and permissions (who may create or rename networks, record plans as installed, make direct fixes), review/approval, an audit trail (direct fixes and recorded plans get a user), HTTPS with the login (see [infrastructure.md](infrastructure.md) §2.3). Approval never implies installation; conflicts stay explicit; commands are never rebased or retried automatically.

## 5. Production servers

The three-server cluster (k3s, CloudNativePG, Garage) is designed in [infrastructure.md](infrastructure.md). The owner builds it by hand with Claude as helper (see [way-of-work.md](way-of-work.md)). Until then the single test server runs [infra/compose](../infra/compose/README.md) and holds real data.

## Backlog (small, not scheduled)

- The Changes drawer lists no line for `update_details` entries (details edited in a plan); only renames get one.
- Editing cable, site, node and rack details in the UI (the direct-fix API already supports them).
- Saved switch models; bulk port rename; renaming a port in a plan.
- A **stack** mark on a cable between two AGGs, set by the user, so the hierarchy can draw stacks (D39: the data alone cannot tell a stack from a peer link).
- A spreadsheet import, through the same draft and record path, only if the real network turns out much larger than a few thousand cables (decided 2026-10-10: entry by hand with the bulk tools).
