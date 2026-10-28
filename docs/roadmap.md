# Roadmap

Only work that is **not done yet**, in order. What runs today is in [status.md](status.md) (its "Now / Next" box says which item below is current); decisions are in [decisions.md](decisions.md); how an item is designed, built and reviewed is in [way-of-work.md](way-of-work.md). When an item is finished, its entry moves to [history/](history/) and status.md describes what shipped.

Finished milestones (M1–M5c, M5b steps 11–13, P1, P2) and their designs, recorded answers and step tables are in [history/implementation-plan-m1-to-p2.md](history/implementation-plan-m1-to-p2.md). Explanatory paths (2026-10-14) and its design are in [history/plans/2026-10-14-explanatory-paths.md](history/plans/2026-10-14-explanatory-paths.md). The visual pass (2026-10-15) and its design are in [history/plans/2026-10-15-visual-pass.md](history/plans/2026-10-15-visual-pass.md). The conceptual map for real data (2026-10-19) and its design are in [history/plans/2026-10-18-conceptual-map.md](history/plans/2026-10-18-conceptual-map.md). The inventory view (2026-10-19) and its design are in [history/plans/2026-10-19-inventory.md](history/plans/2026-10-19-inventory.md). A more useful inventory (2026-10-20) and its design are in [history/plans/2026-10-20-inventory-more.md](history/plans/2026-10-20-inventory-more.md).

## 1. The network hierarchy (the conceptual view's new purpose)

The conceptual map's overview was "only a worse version than Physical"; the owner gave the view a purpose instead: **the network hierarchy**, from the cables. Phase 1 (top to bottom, with Focus beside it) was approved on 2026-10-25 (D39) and is merged. On the realistic campus the owner then chose **one conceptual view**: a left-to-right tree where Show on map lands, with no separate Focus view. Approved 2026-10-28 from [the demo](history/demos/conceptual-demo.html); the lasting rules are D39 and D40 in [decisions.md](decisions.md).

**Owner's answers.**
- **2026-10-25:** some BB, 10–20 AGG and a few hundred access switches per network, up to about 50 nodes under one AGG. Wiring is mostly direct, a minority chained, many uplinks through long passive chains. With no BB, the top is found from the cables. Networks are chosen with chips, with no "All networks" chip.
- **2026-10-28:**
  - **Node size:** a node holds at most 12 switches, except Main Distribution, which holds the AGGs and BBs and a few access switches.
  - **AGGs:** some nodes hang under one AGG, others under a pair.
  - **Uplinks:** an access switch normally has **one** uplink. A few have a second one, to the other AGG of the pair, to a BB or to another switch.
  - **AGG to BB:** varies; one BB or both.
  - **Faults:** the marks are no uplink, chained only, another network, an AGG with no BB, and a split node.
  - **What the view answers,** in order: where a device sits, then what depends on it, then what is around it, then one port.
  - **Focus:** the separate view adds nothing the tree and its drawer cannot show, so it goes.

### What the user sees

- **One tree per network, left to right:**
  - **Top:** the network's **BBs**. With no BB, the Top AGG rule of phase 1 applies.
  - **Aggregation:** frames of AGGs, all from the cables:
    - a **pair**: two AGGs joined by a peer link, drawn as one frame "AGG-01 — AGG-02";
    - a **single AGG**, marked "no BB" when it has no BB uplink;
    - **Direct to BB**: access switches whose only way up is a BB;
    - **No AGG**: no uplink, or uplinks only into another network.
  - **Nodes:** a card per node under its frame, with the number of switches, a fault count and a neutral "2↑ N" for switches with two uplinks. A node whose switches go to two frames appears under each (a **split**).
- **Lines:** a line from each BB to every frame whose AGGs it is cabled to, and one line from a frame to each of its node cards. Lines are drawing aids and never feed traversal.
- **A node opens in place** to a list of its switch names. Each switch shows its fault or its "2 uplinks" badge, and one quiet line counts the node's switches on another frame or network. Several nodes can be open; "▴" folds one.
- **Selecting** a switch, node, AGG, BB, panel or HDF, by a click on the tree, Find in the panel, or **Show on map** from the Inspector, Inventory, Physical or Explore:
  - **The right network:** the tree switches to the device's network, or for a panel to the network most of its circuits are on.
  - **The open node:** the device's node opens and the device is marked. For a panel or HDF, the nodes it serves open when there are at most 3.
  - **The way up:** the path to the AGGs and BBs is lit, through the parent for a chained switch.
  - **What depends on it:** that is lit as well:
    - an AGG lights its nodes;
    - a panel or HDF lights every switch whose uplink runs through it;
    - a switch lights the switches chained under it.

    In the open nodes, a switch with no other way to a BB is marked **cut off**.
  - **The rest dims.** The view scrolls to the selection and never refits the whole tree. Esc or ✕ clears.
- **The drawer** opens on the selection:
  - **Node:** a summary ("9 switches → AGG-23 + AGG-24"), the split, the faults and the two-uplink switches.
  - **Equipment:** one sentence (for example "One uplink: AGG-21", "Chained only: …", "No BB uplink"), then:
    - **Way up:** one row per uplink: Port → each panel and HDF with its position → AGG → BBs, faults in red. A panel's chip traces that jack (the route view); a device selects it.
    - **Depends on it:** how many would be cut off and how many have another way up, with a list that selects.
    - **Cables (N):** each port and its far end.
  - **Actions:** Inspector, Find AGG / BB, Show in Physical.
- **Only problems** in the panel hides every node with no fault.
- **Kept as they are:** the header's network, Find AGG / BB with the route drawn over the tree, the route view and its export, and plans: the tree is drawn from the proposed snapshot with additions dashed, and a stale draft is never drawn.
- **Gone:** the Focus view, its button in the Inspector, the hops, the Hierarchy / Focus switch, and the "single uplink" mark.

### How it is built

- **Frontend only. No new API and no migration.** Everything comes from the loaded snapshot, as in phase 1.
- **`features/map/hierarchy`** keeps the levels, frames, cards and marks, built once per snapshot. Its marks change: "single" goes, a two-uplink count is added, and the "weak" line (fewer BBs than there are) becomes "no BB" (none at all).
- **A new pure module, `hierarchySelection`**, maps a selected ID to what is lit: cards, frames, AGGs, BBs, switches, cut-off switches and the network. It is unit-tested and computed per selection.
- **A new pure module for the drawer** (in `hierarchyDetails`): the way up as rows of steps, what depends on it with **cut off** (no other way to a BB without that device or passive), and the cables.
- **The walks come from `followPort` and `equipmentWalks`.** These move from `focus.ts` into `walks.ts`, and the rest of `focus.ts`, `focusLayout`, `focusFlow` and `FocusCanvas` are deleted.
- **`mapSession`:**
  - the selection replaces the view, the focus, the hops and the open groups;
  - `focusOn` becomes `select`;
  - App's `focusOnMap` becomes "show on map" and is still the one entry point.
- **One problem definition:** Inventory's Problems reads the same marks, so "N problems" on the map equals the Problems rows.
- **Measure on the campus fixture:** the first draw, a selection to lit, and opening the busiest node.

### Phases, each deployed and checked on real data before the next

1. **The hierarchy replaces the overview:** done 2026-10-27 ([plan](history/plans/2026-10-26-network-hierarchy-phase-1.md); what runs is in [status.md](status.md)). It is deployed together with phase 2.
2. **One conceptual view:** the left-to-right tree, selection and the drawer, Focus retired ([plan](plans/2026-10-28-one-conceptual-view.md)).
3. **Networks and size:** the network chips with + add and ✕, several networks as stacked bands with Fold, and other-network dots on closed cards.

**Acceptance:**
- Every line, mark and "cut off" maps to real cables. Nothing is guessed from names (roles only, D04).
- The counts on the map equal the Problems rows.
- Show on map from every screen lands on the tree with the device selected.
- In a plan, added items are dashed.
- On the campus fixture, the first draw is at most phase 1's measured time.

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
