# Approved UI and workflow specification

Status: target experience agreed during design review. Static mockups have been retired; the existing application is a foundation, not a finished implementation of this specification.

For the design evolution and why previous layouts were rejected, see [design-decisions.md](design-decisions.md). Use [acceptance-example.md](acceptance-example.md) for the exact shared-HDF/multiple-destination walkthrough and [acceptance-tests.md](acceptance-tests.md) for cross-view acceptance cases.

## 1. Two views, one selected network and trace

The primary switch is **Conceptual / Physical**. The independent context controls are **Network selection** and **Installed / Plan**.

Both views share stable equipment/endpoint IDs, physical ownership, network context, and selected trace results. Switching views must preserve the relevant equipment, port, plan, and route. Diagram coordinates do not affect physical placement.

### Conceptual map

- A full-page, connected equipment-and-cable map with free arrangement.
- Default objects: active devices, standard panels, and compact HDF parents. Actual cable connections join equipment at real endpoint references.
- It is not a fixed ownership tree, nested physical inventory drawing, or separate horizontal route strip.
- Use small type/role badges and site/node/rack location labels. Optional light location grouping can help organization without forcing the graph into hierarchy layout.
- Network selection filters active devices while retaining the passive equipment/circuits needed to explain their physical routes. Shared passive equipment may show several network badges.
- A trace changes highlighting and relevant detail **on the existing map**. Equipment positions and viewport remain stable; other connections remain visible, bundled, or visually quieter.
- Core/main-distribution views can be anchored and focused. An anchor does not imply that every cable route must pass through it.

*Built (M3.1):*
- **Cables.** One line per card pair and network, in that network's color (one stable palette color per network, grey when unresolved). Its width grows with the number of parallel cables, and a count pill at its midpoint shows the count. Hovering the line or the pill lists the cable IDs; clicking splits it into one line per cable, each labeled with its ID, and clicking again joins it. The route's teal and the highlight's amber override the network color. Lines attached to specific positions stay one per cable.
- **Cards** are compact (icon, name, role, location, "N of M cabled", network badges, route and pinned facets); selecting one never changes its size.
- **Route view.** A toggle in the map results overlay shows only the active route, laid out left to right in hop order, inside dashed node boxes ("Site / Node") and lighter rack boxes where two or more consecutive cards share a rack. It has its own viewport; turning it off restores the full map exactly. The outlines are drawing aids and never part of a trace.
- **Export.** PNG and PDF of the route view (enabled only while it is on), at twice the size, under a header with start → end, the mode, the network, and Installed or the plan's name, plus the date.

### Physical explorer

```text
Sites → selected site → physical node → rack elevation → equipment → exact ports
```

- Sites have visual cards with name/location and inventory counts.
- Opening a site shows its physical nodes as cards the user **arranges freely by drag** (positions saved on the server, shared, never physical coordinates), joined by **cable summary lines**: one line per pair of nodes with cables between them, with a count, the cable IDs on hover and a list of the cables on click. Each node card opens its racks. *(Amended 2026-10-06: replaces "site centered with its nodes around it"; see [agent-handoff.md](agent-handoff.md).)*
- Node views show only their owned rack previews, equipment/occupancy counts, and active-trace highlights.
- Rack views show real units and configured equipment height; one 3U asset is one object spanning three units.
- Equipment inspection shows a device port bank, standard panel positions, or the complete HDF grid.
- Provide clickable breadcrumbs and a persistent/expandable navigator. Back navigation restores the prior selection/view, not a stack of nested modals.
- Physical inventory may include other networks. Make the difference between complete physical inventory and selected trace/network scope explicit.
- A location navigator is not a geographic map or measured floor plan. Optional actual photos/floor plans require real layout data.

*Built (M4):*
- **Navigation.** Sites → site → node → rack → equipment, with clickable breadcrumbs and an in-app **Back** over a session-only history (no router, nothing in the URL; a reload starts at Sites). A one-line scope note under the breadcrumbs says the inventory is complete and which network, if any, is only marked: other networks' devices are muted, never hidden. Explore navigates Physical while it is shown. The results overlay is the map's, without the route view and export. **Show in Physical** is on the inspector header and rows and on every hop; **Conceptual** returns to the map exactly as it was.
- **Sites** are a card grid (name, "N nodes · N racks · N equipment", network badges, a teal "on route" pill). **A site** shows only its node cards, dragged freely and saved on the server (once per drop), joined by cable lines with a count circle, a hover list of cable IDs and a click list of the cables whose ends open the equipment; "N cables inside" and "N cables to <site>" are on the card; Reset layout (inline confirm); the screen fits into the visible area once per site per session. **A node** shows 200 px rack previews with a mini elevation, a search above 12 racks, and drops in a plan.
- **A rack** is the full elevation (a 420 px dark cabinet, U12…U1, "Available" for free units, one block per equipment spanning its height, teal route, an amber ring for the selected one, a dashed PROPOSED block, muted other networks). In a plan, free units accept library and existing-equipment drops.
- **The equipment page** has a rack strip on the left, the face in the middle and the endpoint detail on the right. The face is a port bank (rows of 12), a panel's positions, or the HDF grid with a Front | Rear control. Endpoints are buttons named by state; fill follows the state (white free, the circuit network's color cabled, teal on the route, a dark ring when selected).

## 2. Workspace shell

- Compact header and tool rail; the conceptual map takes the remaining page.
- Add/library, Explorer/search, Inspector, Trace results, and Changes open on demand.
- Tools overlay the conceptual canvas instead of repeatedly shrinking or pushing it down.
- Open the inspector on equipment/endpoint selection; allow it to close independently.
- Trace results are expandable and list all matching AGG/BB destinations.
- Use readable controls and clear text contrast. Avoid miniature forms or exposing every backend operation permanently around the board.
- The physical work area can use the navigator + main detail + contextual inspector layout appropriate to its level.

*Built (M3.1):* the inspector has a sticky header (identity, cabling meter, location breadcrumb, **Show on map**, **Find AGG / BB** for switches), an **Overview** tab (placement, cabled counts per network, the placement form in a plan) and a **Ports / Positions** tab: a compact table of far end, cable ID and network per row, collapsible HDF subpanels, and always-visible row actions (find AGG / BB from here, pin). The Pathfinding form (trace mode, Start, Destination) is only in the Trace drawer; its Start and Destination are searchable. The results overlay lists each route's ordered hops, and clicking a hop centers its card.

## 3. AGG / BB interaction

Action: **Find AGG / BB**, from selected active equipment or an exact port.

- Display all reachable matching physical endpoint routes; AGG first, BB still available.
- Each result shows destination name/actual role/network, starting port, hop/cable/bridge information, and stopping outcome.
- Several AGGs in one network do not imply several reachable routes from every device. Unreachable equipment must not be presented as a result.
- Selecting another result changes route highlighting, starting endpoint focus, and HDF detail, not the overall map layout.
- Physical traversal stops at the selected AGG/BB endpoint, with no continuation through its other ports.
- Exact port-to-port tracing remains available as a separate action.
- Show cross-network mismatch diagnostics and traversal truncation clearly.

Example acceptance flow:

```text
EDGE-17 / Network A
  port 1 → AGG-03
  port 2 → AGG-08
  port 3 → BB-01
```

All results remain available while switching among them.

## 4. HDF display states

### Overview

One compact HDF object identifies its parent chassis, physical location, row/column capacity, and connection summary. Do not populate the whole canvas with hundreds of detached subpanels. Any summary anchors retain references to exact endpoints/cables; they are not graph vertices that permit arbitrary transit.

### Selected trace

- Automatically reveal only the subpanels, local positions, and front/rear endpoints used by the selected route.
- Keep the parent HDF name visible.
- Do not rearrange other equipment or pretend front/rear are separate panels.
- If the route uses several positions on the same HDF, show each independently.
- Clearing/changing a trace removes only automatically revealed detail. Preserve manually expanded detail.

### Manual expansion

Reveal additional connected subpanels/positions, with search/filtering when needed. Preserve cable identity and endpoint occupancy. Other networks' circuits must be recognizable as such; they are not connected internally to the selected circuit.

*Built (M3, M3.1):* a facet is tagged "route" when it comes from the selected route and "pinned" when the user chose it; a position that is both shows once with both tags. Cards have no connections list: pins are made only in the inspector, whose **Positions** table lists a panel's or HDF's positions (cabled ones by default above 48, with a Cabled / Free / All filter and label search that ignores case and the spacing around the slash) and pins one with the pin icon on its row.

### Physical grid

- Four fixed columns A–D, configurable rows, one labeled subpanel per block.
- Six local positions per block, front/rear inspection, occupancy and circuit-network context.
- Selecting the conceptual endpoint opens its exact physical subpanel/position/side.
- Front/rear switching preserves position and shows the appropriate external cable and its peer endpoint.
- The matching bridge connects only the opposite side of that position. No implicit cross-subpanel or sibling-position links.
- An HDF block can contain Network A on position 5 and Network B on position 2. Do not assign one exclusive network to the entire block.
- Fiber-pair display labels remain secondary to the local position identity.

*Built (M4):* the HDF face shows columns A–D and every configured row in row-major order, each block labeled ("3C") with its six positions in a 3 × 2 layout and a 2 px teal border on a block that holds a route position. The Front | Rear control keeps the position and selects its other-side endpoint (through the per-snapshot bridge lookup, not a mirror of the letters). The endpoint detail shows the label, side, circuit network and the fiber pair as secondary text, the external cable (cable ID, far endpoint, far equipment and its "Site / Node / Rack", **Go to peer**), the internal peer (the other side and its cable, **Switch to front/rear**), **Find AGG / BB from here** and **Show on map**. Selecting an endpoint and switching sides replace the location; **Go to peer** adds a history entry, so Back restores the exact endpoint and side. Network A's 3C/5 and Network B's 3C/2 are separate positions of one block, both always drawn.

## 5. Editing and drag/drop

- Moving equipment within the conceptual map changes presentation coordinates.
- Dropping new equipment on empty canvas creates an unsaved, unplaced preview. It is excluded from backend tracing until configured and saved.
- Dropping onto a rack/explicit assignment target proposes physical ownership/placement. Show destination context and distinguish this from a diagram move.
- Rack-unit drops preview the full equipment height, valid targets, collision/capacity feedback, and the proposed destination.
- Dropping existing equipment onto another rack proposes a revision-checked placement change; installed data remains unchanged.
- Always provide a non-drag equivalent for creation, assignment, connection, and placement.
- Live dragging must not update root application state or call the API per pointer movement. Persist positions at an appropriate completed/debounced boundary.
- Saving changes keeps zoom/pan and selection. Route/detail refresh must reconcile objects by stable IDs rather than remount the workspace.
- Undo diagram layout separately from plan commands. Undoing layout cannot reverse a recorded installation.

## 6. Exploration at scale

- Whole-network overview: summarize locations/corridors and boundary cable bundles.
- Focused view: selected node/rack/equipment and bounded neighbors.
- Exact detail: selected equipment endpoints or the active trace.
- Search is a primary entry point for equipment, HDF subpanel, and endpoint identities.
- “Show how this node reaches distribution” reveals the actual passive corridor rather than expanding every campus device.
- Summary links must identify what they count (physical boundary cables, not inferred reachability). Expand to real detail.

*Built (M3.1):* there is no location focus and there are no boundary cards. Clicking a **site or node name in the Explore drawer** (or the site or node link in the inspector) **highlights** the equipment located there, every cable leaving it, and the far-end cards (lighter), fading everything else to about 30% and fitting the view once, with **Clear highlight** and Esc to clear it. It is independent of the trace and of the network filter (the highlighted part is shown even where the filter would hide it). Cards on a selected route are shown even outside the network filter or the highlight, and hide again when the trace is cleared.
- Hidden/collapsed/filtered equipment remains part of backend physical tracing. Load the exact objects needed to explain results.
- Large-network visuals are not proof of performance; measure real datasets and rendering costs.

## 7. Review and acceptance

The final flow must allow a user to:

1. Choose a network and find equipment.
2. Inspect every reachable AGG and BB route.
3. Understand the exact passive panels/HDF positions on the map.
4. Locate the same endpoint physically through site/node/rack navigation or a direct contextual action.
5. Switch sides, inspect the correct cable peer, and return to the selected conceptual route.
6. Plan a change, preview its physical trace, and keep installed infrastructure distinct.

Prefer one complete, tested workflow over isolated CRUD screens or another cycle of alternative mockups.
