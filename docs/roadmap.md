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

### Phase 2, done

The one conceptual view (the left-to-right tree, selection and drawer, no Focus) is built; what runs is in [status.md](status.md), its design and steps are in [history/plans/2026-10-28-one-conceptual-view.md](history/plans/2026-10-28-one-conceptual-view.md), and the lasting rules are D39 and D40 in [decisions.md](decisions.md).

### Phases

1. **The hierarchy replaces the overview:** done 2026-10-27 ([plan](history/plans/2026-10-26-network-hierarchy-phase-1.md); what runs is in [status.md](status.md)). It is deployed together with phase 2.
2. **One conceptual view:** done 2026-10-30 ([plan](history/plans/2026-10-28-one-conceptual-view.md); what runs is in [status.md](status.md)). Phases 1 and 2 are deployed together.
3. **Networks and size:** dropped 2026-11-01 (D41); the tree keeps showing one network. The other-network dots on closed cards are in the backlog.

## 2. More equipment

Today equipment is a switch, a panel or an HDF. **Owner's answers (2026-10-25):** the real network also has
- **rack items with no ports** (UPS, PDU, shelves, cable managers, blanks): they take units and have details, never cables, never in a trace;
- **active devices with ports** (servers, firewalls, routers, controllers): cabled like a switch, a trace can end there, shown on the tree.

Equipment outside a rack (wall outlets, access points, cameras) is not wanted now. **Order:** after phase 1 of the network hierarchy, as its own item; rack items first, then active devices. Not designed yet: it starts with a demo (D30) and the owner's answers on the roles of active devices and where a trace stops.

## 3. M6 — Layout, undo and measured scale

- **Measure on real data** before go-live and agree budgets. Starting point (campus fixture, development machine; measurements, not budgets): see the campus timings in [status.md](status.md) (the tree's first draw and a selection to lit). Reduce what the first render draws.
- Scoped APIs: neighbourhood and route-object fetch, summaries and bundles, pagination of `GET /api/plans` (large drafts); bounded neighbourhoods; detailed-port virtualization. Revision-keyed graph caching only when measurements justify it.
- Persist workspace preferences (open node cards, the viewport, the selection) if wanted; separate layout undo and plan undo.
- Drag-to-rack on the map (dropped from M5) may return here.
- The Copy rack layout popover is positioned once when it opens and does not follow page scroll or resize.

**Acceptance:** reload restores layout and context without changing physical placement; summary counts map to real cables; search, selection and trace work on hundreds of equipment and tens of thousands of cables, including large HDFs; measured costs are recorded with agreed budgets.

## 4. M7 — Identity and governance

Authentication and permissions (who may create or rename networks, record plans as installed, make direct fixes), review/approval, an audit trail (direct fixes and recorded plans get a user), HTTPS with the login (see [infrastructure.md](infrastructure.md) §2.3). Approval never implies installation; conflicts stay explicit; commands are never rebased or retried automatically.

## 5. Production servers

The three-server cluster (k3s, CloudNativePG, Garage) is designed in [infrastructure.md](infrastructure.md). The owner builds it by hand with Claude as helper (see [way-of-work.md](way-of-work.md)). Until then the single test server runs [infra/compose](../infra/compose/README.md) and holds real data.

## Backlog (small, not scheduled)

- The Changes drawer lists no line for `update_details` entries (details edited in a plan); only renames get one.
- Editing cable, site, node and rack details in the UI (the direct-fix API already supports them).
- Saved switch models; bulk port rename; renaming a port in a plan.
- **Other-network dots on closed node cards** in the tree: a node that also holds switches of another network shows it without being opened (today only an open card's "+ N on Network B" line does).
- A **stack** mark on a cable between two AGGs, set by the user, so the hierarchy can draw stacks (D39: the data alone cannot tell a stack from a peer link).
- A spreadsheet import, through the same draft and record path, only if the real network turns out much larger than a few thousand cables (decided 2026-10-10: entry by hand with the bulk tools).
