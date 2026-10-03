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

### Physical explorer

```text
Sites → selected site → physical node → rack elevation → equipment → exact ports
```

- Sites have visual cards with name/location and inventory counts.
- Opening a site shows a legacy-inspired location navigator: site centered with its physical nodes around it, explicit site-membership relationships, and actions to open each node's racks.
- Node views show only their owned rack previews, equipment/occupancy counts, and active-trace highlights.
- Rack views show real units and configured equipment height; one 3U asset is one object spanning three units.
- Equipment inspection shows a device port bank, standard panel positions, or the complete HDF grid.
- Provide clickable breadcrumbs and a persistent/expandable navigator. Back navigation restores the prior selection/view, not a stack of nested modals.
- Physical inventory may include other networks. Make the difference between complete physical inventory and selected trace/network scope explicit.
- A location navigator is not a geographic map or measured floor plan. Optional actual photos/floor plans require real layout data.

## 2. Workspace shell

- Compact header and tool rail; the conceptual whiteboard takes the remaining page.
- Add/library, Explorer/search, Inspector, Trace results, and Changes open on demand.
- Tools overlay the conceptual canvas instead of repeatedly shrinking or pushing it down.
- Open the inspector on equipment/endpoint selection; allow it to close independently.
- Trace results are expandable and list all matching AGG/BB destinations.
- Use readable controls and clear text contrast. Avoid miniature forms or exposing every backend operation permanently around the board.
- The physical work area can use the navigator + main detail + contextual inspector layout appropriate to its level.

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

### Physical grid

- Four fixed columns A–D, configurable rows, one labeled subpanel per block.
- Six local positions per block, front/rear inspection, occupancy and circuit-network context.
- Selecting the conceptual endpoint opens its exact physical subpanel/position/side.
- Front/rear switching preserves position and shows the appropriate external cable and its peer endpoint.
- The matching bridge connects only the opposite side of that position. No implicit cross-subpanel or sibling-position links.
- An HDF block can contain Network A on position 5 and Network B on position 2. Do not assign one exclusive network to the entire block.
- Fiber-pair display labels remain secondary to the local position identity.

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
