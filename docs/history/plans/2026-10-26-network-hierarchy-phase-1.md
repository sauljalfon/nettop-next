# Plan: The network hierarchy, phase 1 (2026-10-26)

The item is [roadmap.md §1](../../roadmap.md#1-the-network-hierarchy-the-conceptual-views-new-purpose); its approved design and the owner's answers (2026-10-25) are there, and the rules are D39 in [decisions.md](../../decisions.md). The look is the approved demo [history/demos/hierarchy-demo.html](../demos/hierarchy-demo.html): card sizes, wording, legend and drawer are as in the demo, without what the demo shows for phases 2 and 3 (open nodes, chips, bands, Find, site rows) and without the stack line (D39).

**Phase 1 is:** the hierarchy replaces the overview (levels, groups, node cards, the drawer and Only problems); the shared uplink rules and their Inventory Problems rows; the `/api/map-layout` endpoints removed. Phases 2 and 3 are not in scope; where this plan leaves a hook for them it says so.

**Frontend, plus one backend removal. No new API, no migration** (the `map_layouts` table stays, D39).

## What the user gets

1. Conceptual opens on the **hierarchy** of one network: the top row (Backbone, or Top AGG), Aggregation, then Nodes, drawn from real cables only.
2. **Groups** of AGGs side by side over a frame of node cards; a node card says how many switches and marks only what is wrong ("1 single", "2 chained").
3. A click on a card opens a **drawer**: a node's switches with their uplinks (ports and the via path), or an AGG's or top's links; Focus, Inspector, Find AGG / BB and Show in Physical from there.
4. **Only nodes with problems** hides every node with no mark.
5. Inventory's **Problems** lists the same uplink problems, so the two counts agree.
6. The overview, its drag and Reset arrangement, and its saved positions are gone.

## Global constraints

- Roles only, never names (D04, locked 5); every line and mark comes from `followPort` walks over stored cables and bridges.
- Lines and cards are a drawing aid; they never feed a trace (D05, D11).
- Every name through `Name` / `PlacePath` / pieces; never join names into one string for display (D32, D33).
- Colours only from `theme.css` tokens (`theme.test.ts`); networks by `networkColors`; teal route, amber highlight, `--proposed` dashed (D33).
- Positions are computed and never saved; nothing new is persisted (D39).
- A stale draft is never drawn (as today).
- Tests first: each step's tests are written and seen failing before the code.

## Decisions taken in the plan

These fill gaps the design left. Opus proposed them; the owner approved the plan as written on 2026-10-26, including the three answers below ("Owner's answers").

### The hierarchy of one network (`features/map/hierarchy.ts`, pure)

- **Walks.** Every rule reads the walks of `followPort` from each port of an equipment. Move Focus's private `walks` helper out of `buildFocus` as an exported `equipmentWalks(index, equipmentId): EquipmentWalk[]` in `focus.ts` (`{ start, end: WalkEnd, via: FocusStep[], linkIds, farId? }`, behaviour unchanged), and use it in both. A walk *reaches* `farId` when it ends at a switch port.
- **Uplinks of an access switch:** its walks that reach an AGG or BB **of its own network**. Walks that reach a switch of another network are its *other-network* walks. Walks that reach an access switch of its own network are its *chain* walks.
- **Chains.** Access switches of one network joined by chain walks form chains. A switch with at least one uplink is depth 0; otherwise its depth is one more than the smallest depth among its chain neighbours, and those neighbours are its **parents** (it "hangs under" them). Its AGG set is the union of its parents' AGG sets. A chain that never reaches an uplink has no depth.
- **The top** (D39): the network's BBs. With none, the AGGs that have an AGG-to-AGG walk to another AGG of the network and that no access switch of the network has an uplink to ("Top AGG"). With neither, no top row. Every other AGG is a **mid AGG**.
- **Lines between equipment cards,** one per pair, keeping each circuit's `linkIds`:
  - **uplink**: a walk between a top and a mid AGG;
  - **peer link**: a walk between two tops, or between two mid AGGs.
  - A walk from a top or AGG to an access switch is that switch's uplink, never a tier line.
- **"N uplink to the top"** on a mid AGG card, and its uplink lines dashed (`weak`), when there is more than one top and the AGG reaches fewer distinct tops than there are (and at least one). An AGG that reaches no top shows no line and no mark (D39 names no such problem).
- **Groups.** Mid AGGs are joined (union-find) by a peer link, or by both being in one switch's AGG set. Each set of joined AGGs is one group; an AGG with no switch is still a group (its frame says "0 nodes"). Two more groups exist only when they have switches:
  - **Under the top**: switches with uplinks that reach only tops (a BB-only switch). Its frame's line comes from each top it reaches.
  - **No AGG**: switches with no uplink (and no chain to one), or whose walks reach only another network.
- **Node cards.** In a group, one card per node of its switches: key `<groupKey>|<nodeId>`, where `groupKey` is the group's sorted AGG IDs joined by `+`, or `top`, or `none`. A switch with no node is on a card "Not in a node" (key `<groupKey>|`). A node can be in several groups.
- **Marks** (one per access switch, the first that holds): `no-uplink` (no uplink and no chain to one, and no other-network walk) · `other-network` (no uplink and no chain to one, and at least one other-network walk) · `chained` (depth ≥ 1) · `single` (exactly one uplink, and its group has two or more AGGs). The node card shows "N single" and "N chained"; a card in the No AGG group needs no mark (its frame says why).
- **A node has a problem** when any of its switches has a mark. The frame reads "N nodes · M switches · K with problems", and "(only these shown)" when Only problems is on. The No AGG frame starts with "Reach no AGG · ", the top group's with "Under the top · ".
- **Order.** Groups by the name of their first AGG (by name, then ID), then Under the top, then No AGG. AGGs in a group by name. Node cards by site name, node name, then ID (`localeCompare`).
- **In a plan** (`installedIDs`, `installedLinkIDs`, `installedContainerIds` of the installed snapshot): an equipment card is proposed when its equipment is not installed; a node card when its node is not installed or every switch on it is proposed; a line when each of its circuits uses at least one cable the plan adds. Proposed is drawn in `--proposed`, dashed, so it reads apart from the grey `weak` dash.
- **Once per snapshot:** `buildHierarchies(index, installed?)` builds every network's hierarchy at once (the map and the Inventory both read it). The chosen network, Only problems, the route and the highlight never rebuild it.

### The canvas

- **React Flow, not draggable** (`nodesDraggable={false}`): it gives pan, zoom, Controls, the measured fit (`visibleArea`, `fitViewport`) and the route view overlay as today. `hierarchyLayout.ts` (pure) gives every card, frame and tier label its box from the demo's sizes (tier card 140 × 58, node card 178 × 86; 40 px between AGGs, 10 between node cards, 48 between groups; node columns `max(1, min(max(AGGs, 2), nodes))`, the top row centred over all groups). `hierarchyFlow.ts` (pure) projects it: node types `hierarchyTier`, `hierarchyNode`, `hierarchyFrame`, `hierarchyLabel`; one edge type `hierarchyLine` (bezier top-to-bottom; a peer link straight between the cards' sides).
- **The fit** happens once per session as the overview's did (`overviewFit` is renamed `hierarchyFit`, same rule: above 12 node cards zoom ≥ 0.6 from the top). Changing the network fits once again; a refetch, the trace, Only problems and the highlight never refit or move a card.
- **Trace (locked 3, kept):** the selected route lights in place, nothing moves: a tier card whose equipment the route touches, a node card holding a switch the route touches (`routeMarks`), an uplink or peer line sharing a link with the route, and a group line whose AGG and one of whose node cards are lit. The route is never dimmed. The route view covers the map and restores it exactly, as today.
- **Explore's highlight (kept):** node cards of the highlighted site or node, and tier cards placed there, are amber; one fit to them per request; Clear highlight and Esc clear it.
- **The drawer** (`HierarchyDrawer.tsx`, the shared `.drawer` class, over the canvas per D34, closed by ✕ or Esc through `useInlineDialog`):
  - **A node card:** "<node>", Node chip, "<site> · <network> · N switches"; "Switches and their uplinks": each switch of the card, chained ones indented under their parent, "→ AGG-03 + AGG-08", or "no uplink", or "<far switch> (<network>)", and its mark ("one uplink", "chained", "no uplink", "other network"). A click opens the switch's uplinks: each as "<port> → <far equipment> <far port>" and "via" each passive step (`FocusStep`, as Focus reads it) or "direct", with **Focus**, **Inspector** and **Find AGG / BB**. The note "Uplinks are the first active device each switch reaches over real cables, through any panels and HDFs." Action: **Show in Physical** (the node).
  - **A tier card:** its links (chip "up", "down" or "peer link", the other card's name, the ports at both ends); "Under it": N nodes, M switches, "shared with …" the other AGGs of its group; **Focus**, **Inspector**, **Show in Physical**.
  - Selecting a card marks it amber like the demo (`hot`); a node card also marks the AGGs of its switches. Closing the drawer clears it. The drawer is local to the canvas (gone after Focus and back).
  - *Open in Inventory* (in the demo) is left out of phase 1: the Inventory has no "open on a node" request yet.
- **The left panel** (a top-left React Flow `Panel`, moved right when the left drawer is open, like today's note): the network's name, "1 BB · 3 AGG · 2 nodes · 1 switch" (BB only when there is one), **Only nodes with problems** (checkbox), and the legend (uplink; one uplink where the others have more; peer link; proposed; "1 single"). No Find (phase 3), no stack row.
- **Empty states:** no network yet: "No networks yet. Create one with Manage networks."; a network with no switch: "Network A has no switches yet."; Only problems with none: each frame shows its head and "No problems here".
- **Focus is unchanged** except its back button: "‹ Hierarchy". `MapMode` is `'hierarchy' | 'focus'`.

### Which network the map shows (phase 1 of D39's choice)

- `mapSession` keeps the map's own choice, `networks(): readonly string[]` (phase 3 adds more than one); phase 1 has `showNetwork(id)` (the list becomes `[id]`).
- The shown network is the first of that list that exists in the snapshot, else the snapshot's first network (`shownNetworks(session list, snapshot.networks)`, pure, in `mapSession.ts`).
- **The header on Conceptual shows the map's network.** Choosing a network there calls `showNetwork(id)` and sets App's choice as today (so Inventory follows, D37). Choosing **All networks** there changes only App's choice; the map keeps its network (D39). On Physical and Inventory nothing changes.
- Focus gets the map's network for its dimming (it still only dims).

### Session memory (`mapSession`)

- Renamed: `overviewViewport` → `hierarchyViewport`, `setOverviewViewport` → `setHierarchyViewport`, `overviewNeedsFit` → `hierarchyNeedsFit`.
- Added: `networks()`, `showNetwork(id)`, `onlyProblems()`, `setOnlyProblems(on)`.
- Removed: `proposedPositions`, `proposedPosition`, `setProposedPosition`, `resetOverview`, `overviewVersion` (nothing is dragged).
- Kept unused until phase 2: `openNodes`, `toggleNode` (phase 2 opens nodes; it is tested already).

### Inventory's Problems (amends D38, as D39 says)

`buildProblems` adds one row per access switch with a mark, from `buildHierarchies`, key `uplink:<switchId>`, its object the switch:

| Mark | Problem | Detail (pieces) |
| --- | --- | --- |
| `single` | A switch has one uplink | "<port> → <AGG>; its group has N AGGs" |
| `chained` | A switch is chained behind another | "Behind " and its parents' names |
| `no-uplink` | A switch has no uplink | "No cable reaches an AGG or BB" |
| `other-network` | A switch reaches only another network | "<far switch> on <network>" for each, ", " between |

A switch's other-network cable is still also the existing "A circuit joins two networks" row (a cable rule, not a switch rule). The Problems count in the left menu includes the new rows.

### The layout API goes

- Backend: the three `/api/map-layout` routes, `Repository.MapLayout`, `SaveMapPosition`, `ResetMapLayout`, `persistence/map_layout.go`, `topology.MapLayout`, and their tests. A request to `/api/map-layout` answers what any unknown `/api` path answers (404).
- Frontend: `getMapLayout`, `saveMapPosition`, `resetMapLayout`, the `MapLayout` type and their client tests. `NodePosition` stays (the site layout uses it).
- `api/openapi.yaml`: the two `/map-layout` paths and their schemas.
- Migration 009 and the `map_layouts` table stay (no migration, D39).

## Owner's answers (2026-10-26, the plan approved as proposed)

1. **A switch cabled straight to a BB, with no AGG** sits in a group "Under the top", whose frame hangs from the BB. (The acceptance fixture's EDGE-17 reaches AGG-03, AGG-08 *and* BB-01; it sits under the two AGGs, and its BB cable counts as an uplink.)
2. **An AGG with no cable to the top, where the network has a top,** shows no line and no mark (AGG-03 and AGG-08 in the acceptance fixture have no cable to BB-01). A mark "No uplink to the top" was not chosen.
3. **Clicking a node card in phase 1** opens the drawer with its switches and uplinks; in phase 2 a click opens the node in place and "Uplinks ›" opens the drawer, as in the demo.

## Tests (IDs)

| ID | What | Where |
| --- | --- | --- |
| HI-01 | Levels: BB as the top; with no BB the Top AGG rule (joined to another AGG, no access uplink); with neither no top row; roles only (a switch named "BB-x" with role `aggregation` is an AGG) | `hierarchy.test.ts` |
| HI-02 | Lines: uplink top↔mid, peer link top↔top and mid↔mid, one per pair with each circuit's links; through passive chains (front › rear › … ); "N uplink to the top" and `weak` with two tops and one reached | `hierarchy.test.ts` |
| HI-03 | Groups: joined by a peer link, or by a shared switch; an AGG with no switch is its own group; Under the top; No AGG; a node under two groups (the Expansion draft: Building A under AGG-03 + AGG-08 and under AGG-15); order | `hierarchy.test.ts` |
| HI-04 | Marks: single (one uplink, group of two), chained (depth and parents, a chain of three, a loop of access switches terminates), no uplink, other network; one mark per switch in the stated order; a reserved or faulty port changes nothing (locked 6) | `hierarchy.test.ts` |
| HI-05 | In a plan: proposed equipment card, node card and line; installed ones not proposed | `hierarchy.test.ts` |
| HI-06 | Layout: deterministic, no two cards overlap, frames hold their cards, the top row centred; projection: types, classes (`weak`, `peer`, `proposed`, `on-route`, `highlighted`, `hot`), the route lights the cards and lines it touches and nothing moves | `hierarchyLayout.test.ts`, `hierarchyFlow.test.ts` |
| HI-07 | Session: the shown network (fallback to the first, to the first existing), Only problems, the renamed viewport, `back()` to the hierarchy | `mapSession.test.ts` |
| HI-08 | Problems: one `uplink:` row per marked switch with its text and detail pieces; the number of `uplink:` rows equals the hierarchy's marked switches over every network; none on the clean acceptance fixture | `problems.test.ts` |
| HI-09 | In the browser: the acceptance hierarchy for Network A (Backbone: BB-01; AGG-03 + AGG-08 over Building A, 1 switch; AGG-15 with 0 nodes; "1 BB · 3 AGG · 1 node · 1 switch") and Network B (no top row; AGG-12 over DR Access); the header choosing B redraws and fits once, All networks keeps B; the drawer of Building A lists EDGE-17 → AGG-03 + AGG-08 + BB-01 with AGG-03's via PANEL-A 1, HDF-01 3C/5, HDF-02 2B/3; Focus, Inspector and Find AGG / BB from it; Only problems; the Expansion plan's dashed EDGE-18 line and card under AGG-15; Hebrew names render isolated | `e2e/hierarchy.spec.ts` |
| HI-10 | Trace and highlight on the hierarchy (the old CM-11, rewritten): the route lights its cards and lines, choosing another route moves nothing, with Network B the route is undimmed, the Route view covers and restores, Explore's highlight marks and fits once, Clear highlight and Esc | `e2e/hierarchy-trace.spec.ts` |
| HI-11 | `/api/map-layout` answers 404; the client has no map-layout calls | `httpapi` test; `src/shared/api.test.ts` |
| HI-12 | Campus: the first hierarchy draw (fitted), the drawer of the busiest node, Problems with the uplink rows; measured against the overview's 2.1 s (status.md) | `e2e/scale.spec.ts` (`SCALE=1`) |
| HI-13 | A direct fix renames Building A to a long Hebrew name while its drawer is open: the card, the frame and the drawer show it isolated and cut with an ellipsis, the drawer stays open on the same card, no card moves; the name is restored after | `e2e/hierarchy.recording.spec.ts` |

Retired with the overview (each noted in acceptance-tests.md with its successor): CM-01 (→ HI-11), CM-02 to CM-05 and CM-09 (→ HI-01 to HI-09), CM-11 (→ HI-10); CM-12 becomes HI-12. CM-06 to CM-08 and CM-10 (Focus) stay; CM-10's "‹ Overview" reads "‹ Hierarchy".

## Review focus

The inputs most likely to bite a user that the design does not spell out, each with the test that pins it:

1. **Loops.** A ring of access switches cabled to each other, and two AGGs cabled twice: walks stop (`followPort` visits once), chain depth terminates, one line per pair. Pinned in HI-04 and HI-02.
2. **Real-size groups.** 50 nodes under one pair of AGGs (the owner's size) stays readable without the phase 3 site rows: the frame grows downward, the fit keeps zoom ≥ 0.6 from the top. Pinned in HI-06 (a 50-node group lays out without overlap) and HI-12.
3. **A network with nothing in it, or a context switch to a plan where the shown network does not exist.** Falls back to the first network, or the empty state, never a blank canvas. Pinned in HI-07 (the fallback) and HI-06 (a network with no switch projects its empty state). Not in the browser: a network can never be deleted, so a spec must not create one.
4. **Hebrew and long names** in node cards, frame heads and the drawer: isolated, ellipsised, never reordered. Pinned in HI-13.
5. **A refetch while the drawer is open** (a direct fix of a name): the drawer stays on the same card key and shows the new name; nothing moves. Pinned in HI-13.

Also to try by hand in review: a stale draft (the card, never the hierarchy); the left drawer open (the panel moves); a switch with no node; a switch whose only cable goes to a panel with nothing behind it (no uplink).

## Steps

Each step is one Sonnet prompt, reviewed before the next. Every step ends green.

### 1. The hierarchy module

**Files:** create `frontend/src/features/map/hierarchy.ts`, `hierarchy.test.ts` and a test-only builder `hierarchyFixture.ts` (sites, nodes, racks, switches with roles and networks, panels, cables; nothing else); modify `focus.ts` (export `equipmentWalks`, `buildFocus` uses it).

**Interfaces (produced):**

```ts
export type UplinkMark = 'single' | 'chained' | 'no-uplink' | 'other-network'
export interface Circuit { start: string; end: string; farId: string; via: FocusStep[]; linkIds: string[] }
export interface SwitchUplinks {
  switchId: string
  uplinks: Circuit[]        // to an AGG or BB of its network
  otherNetwork: Circuit[]   // to a switch of another network
  parents: string[]         // chained: the switches it hangs under
  aggIds: string[]          // mid AGGs reached, directly or through its parents
  mark?: UplinkMark
}
export interface HierarchyNodeCard {
  key: string; groupKey: string; nodeId?: string; siteId?: string
  switchIds: string[]; single: number; chained: number; problem: boolean; proposed: boolean
}
export interface HierarchyGroup {
  key: string; kind: 'aggs' | 'top' | 'none'; aggIds: string[]; topIds: string[]  // topIds: kind 'top' only
  nodes: HierarchyNodeCard[]; switches: number; problemNodes: number
  proposedFrom: string[]                      // AGGs or tops whose line to the frame is proposed (step 1 review)
}
export interface TierLine { key: string; kind: 'uplink' | 'peer'; a: string; b: string; circuits: Circuit[]; weak: boolean; proposed: boolean }
export interface NetworkHierarchy {
  networkId: string
  topKind: 'backbone' | 'aggregation' | 'none'
  topIds: string[]; aggIds: string[]          // mid AGGs
  topsReached: ReadonlyMap<string, number>    // mid AGG -> distinct tops it reaches
  lines: TierLine[]; groups: HierarchyGroup[]
  switches: ReadonlyMap<string, SwitchUplinks>
  proposed: ReadonlySet<string>               // proposed tier equipment
  counts: { bb: number; agg: number; nodes: number; switches: number; marked: number }
}
export interface InstalledSets { equipment: ReadonlySet<string>; links: ReadonlySet<string>; containers: ReadonlySet<string> }
export function buildHierarchies(index: SnapshotIndex, installed?: InstalledSets): ReadonlyMap<string, NetworkHierarchy>
```

`counts.nodes` counts distinct node cards; `counts.marked` the switches with a mark. A network with no switch has no entry: the screen (step 4) takes its empty state from `snapshot.networks`. A card with no node ("Not in a node") comes after every node.

**Tests first:** HI-01 to HI-05 on `hierarchyFixture` snapshots, plus the acceptance fixture (`acceptanceSnapshot()`: Network A and B as in HI-09) and its Expansion shape (EDGE-18 cabled to AGG-15, given as installed sets). The existing `focus.test.ts` stays green unchanged.

**Checks:** `npm test`, `npm run typecheck`, `npm run format:check`.

### 2. Shared problems in the Inventory

**Files:** modify `frontend/src/features/inventory/problems.ts`, `problems.test.ts`.

**Interfaces:** consumes `buildHierarchies` (step 1); `buildProblems(snapshot, index, installedIDs)` keeps its signature and calls `buildHierarchies(index)`.

**Tests first:** HI-08. No new browser test: the acceptance fixture has no uplink problem, and INV-09 must stay green as it is.

**Checks:** as step 1.

### 3. Layout, projection and session (pure)

**Files:** create in `frontend/src/features/map/`: `hierarchyLayout.ts`, `hierarchyFlow.ts`, `hierarchyFit.ts` (from `overviewFit.ts`, same rule) and their tests; modify `mapSession.ts` and `mapSession.test.ts`. No component changes; the overview still runs. This step only **adds** to `mapSession` (the hierarchy's viewport, `networks`, `showNetwork`, `onlyProblems`); the renames and removals happen in step 4, with the overview.

**Interfaces (produced):**
- `hierarchyLayout(h: NetworkHierarchy, opts: { onlyProblems: boolean }): HierarchyLayout` with `boxes: Map<string, {x, y, w, h}>` (by tier equipment ID and node card key), `frames: Map<groupKey, box>`, `labels: {text: 'Backbone' | 'Top AGG' | 'Aggregation' | 'Nodes', x, y}[]`, `size: {width, height}`.
- `projectHierarchy({ h, layout, index, colors, marks: RouteMarks, highlighted: ReadonlySet<string>, hot: ReadonlySet<string> }): { nodes, edges }` with node types `hierarchyTier`, `hierarchyNode`, `hierarchyFrame`, `hierarchyLabel` and edge type `hierarchyLine`; `highlightedCards(h, index, location: LocationRef | undefined): ReadonlySet<string>`; `hotCards(h, selected: string | undefined): ReadonlySet<string>`.
- `mapSession` as in "Session memory" above, and `shownNetworks(chosen: readonly string[], networks: readonly Network[]): string[]`.

**Tests first:** HI-06 (with a 50-node group and a network with no switch), HI-07.

**Checks:** `npm test`, `npm run typecheck`, `npm run format:check`.

### 4. The hierarchy on the screen

**Files:**
- Create in `frontend/src/features/map/`: `HierarchyCanvas.tsx`, `HierarchyPanel.tsx`, `HierarchyDrawer.tsx`, `TierCard.tsx`, `HierarchyNodeCard.tsx`; styles in `map.css` (tokens only).
- Delete: `overview.ts`, `overviewLayout.ts`, `overviewFlow.ts`, `overviewFit.ts`, `OverviewCanvas.tsx`, `NodeCard.tsx`, their tests and the overview's CSS. `ResetLayout` in `MapControls.tsx` stays if the site screen still uses it.
- Modify: `mapSession.ts` (the overview's members go, `MapMode` becomes `'hierarchy' | 'focus'`; as in "Session memory"), `ConceptualMap.tsx` (picks `HierarchyCanvas` or `FocusCanvas`), `FocusCanvas.tsx` ("‹ Hierarchy"), `src/app/App.tsx` (wiring only: the header on Conceptual, the new props), `src/shared/api.ts`, `src/shared/types.ts`, `src/shared/api.test.ts` (the three layout calls and `MapLayout` go).
- E2E: `e2e/helpers.ts` (`fitted` waits for `[data-view="hierarchy"][data-fitted="true"]`; `overviewState` becomes `hierarchyState`: `{ positions, cards, lines }` from `data-card-positions`, `[data-card-key][data-on-route="true"]`, `[data-line][data-on-route="true"]`); `e2e/overview.spec.ts` → `e2e/hierarchy.spec.ts` (HI-09); `e2e/overview-trace.spec.ts` → `e2e/hierarchy-trace.spec.ts` (HI-10); new `e2e/hierarchy.recording.spec.ts` (HI-13); every other spec that used an overview card (`inspector`, `map`, `views`, `workspace`, `trace-map`, `trace-switch`, `route-view`, `focus`, `planning`, `polish`, `physical`, `details.recording`, `visual-pass.recording`): keep the spec's intent, reach equipment through Explore's `selectEquipment` or the hierarchy's drawer, and replace a card drag with a pan of the hierarchy (the "no shell re-render" check of `workspace.spec.ts`). A spec that only tested the overview's drag, saved positions or Reset arrangement is deleted and named in the report.

**Interfaces:**
- Consumes steps 1 and 3.
- `ConceptualMap` gains `installedLinkIDs: ReadonlySet<string>`, `onFindDevice(equipmentId)` (App: the inspector's Find AGG / BB for that ID, as `traceSelectedDevice` does), `onShowInPhysical(equipmentId)` and `onShowPlace({ nodeId })` (App's existing functions), `onFocus(equipmentId)` (`focusOnMap`). Its `networkId` is now the map's shown network: App passes `shownNetworks(mapSession.networks(), networks)[0]` on Conceptual.
- Surface marks: `data-view="hierarchy"`, `data-fitted`, `data-network`, `data-card-positions` (the projected boxes, stable text); a card `data-card-key`, `data-on-route`, `data-proposed`; a line `data-line` (its key), `data-on-route`, `data-weak`.

**Tests first:** the `api.test.ts` part of HI-11; HI-09, HI-10 and HI-13 seen failing, then the code. Screenshots: Network A and B on the acceptance fixture, the drawer of Building A with AGG-03's uplink open, the tier drawer of AGG-03, Only problems, the Expansion plan, the left drawer open.

**Checks:** everything in "Verifying" in way-of-work.md, with the whole e2e suite.

### 5. The layout API goes (backend and contract)

**Files:** `backend/internal/httpapi/server.go` (routes, `Repository`), `backend/internal/persistence/map_layout.go` (delete), `backend/internal/topology/errors.go` (`MapLayout`), delete `httpapi/map_layout_api_test.go` and `persistence/map_layout_test.go`, any fake repository's three methods; `api/openapi.yaml`.

**Tests first:** HI-11's backend part: `GET`, `PUT /api/map-layout/nodes/x` and `DELETE /api/map-layout` answer 404 (in an existing `httpapi` routing test file).

**Checks:** `go test -race ./...` (say whether the DB tests ran), `go vet ./...`, the Redocly lint, `npm run typecheck`.

### 6. Campus measurement, then docs

- HI-12 in `e2e/scale.spec.ts` (`SCALE=1`): replace the overview's steps (first overview render, busiest node card, ‹ Overview back) with the hierarchy's (first draw fitted, the busiest node's drawer, ‹ Hierarchy back) and add the Problems list. If the first draw is slower than the overview's 2.1 s, report it before changing the design.
- Then Opus updates the docs (way-of-work.md, "Keeping the docs true"): status.md (what runs, Now / Next: phase 2 next, known limits, the timings), ui-spec.md §3 and §5, architecture.md if a rule changed, acceptance-tests.md (HI-01 to HI-13, the retired CM rows), testing.md, CLAUDE.md (the map's code map, `mapSession`), roadmap.md §1 (phase 1 marked done in one line; the design stays for phases 2 and 3). `api/openapi.yaml` and `types.ts` are done in steps 4 and 5. The item stays open until phase 3; this plan moves to `docs/history/plans/` when phase 1 is committed.
- **Deploy and check on real data** (the phase rule): after the owner's commit, merge and deploy; the owner checks the hierarchy of the real network before phase 2 is designed in detail.
