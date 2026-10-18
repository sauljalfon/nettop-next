# Plan: Conceptual map for real data (2026-10-18)

The item is [roadmap §1](../roadmap.md#1-conceptual-map-for-real-data-next); its approved design and the owner's answers are there, and the rule is D35 in [decisions.md](../decisions.md) (locked 2 and 9 amended). The approved demo is [history/demos/conceptual-map-demo.html](../history/demos/conceptual-map-demo.html), restyled to the paper look (D33). One backend change (migration 009 and three layout endpoints); the rest is frontend.

## What the user gets

1. The map opens on **nodes** in site frames, readable at real size, with one line per node pair (also between sites) and its cable count.
2. Dragging a node arranges the map for everyone; it is still there after a reload.
3. **Focus** on a device shows the active equipment it reaches, with the panels and HDF positions in between written on each line; +1 hop widens it.
4. A trace lights up the route's nodes and lines (overview) or devices (Focus) without moving anything; the Route view is unchanged.
5. "Show on map" opens Focus on that equipment.

## Decisions taken in the plan

- **Build beside, then remove.** Steps 3–5 build Overview and Focus while the old map still works, behind a session switch (`mapSession.view: 'overview' | 'focus' | 'devices'`) with a temporary **Overview / Devices** control on the map. The default stays `devices` until step 6 (the 34 specs that click device cards keep passing); step 6 makes `overview` the default and step 7 removes `devices` and the control. Step 6 moves the Playwright helpers and specs off the old map; step 7 deletes it. Every step ends green.
- **Overview positions are absolute per node**, in one coordinate space for the whole network; site frames are computed (the bounding box of the site's cards plus padding, the site name at the top left). Nothing about sites is saved.
- **Default arrangement:** per site, `defaultNodeLayout` from `features/physical/layout.ts` over that site's node graph; sites placed left to right in a deterministic order (the site with the most AGG/BB nodes last, then by name), with a fixed gap. Saved positions always win and are never recomputed.
- **Pair counts** are a new whole-network function in `features/map/overview.ts`. It uses the same network-of-circuit rule as `physical/connections.ts` (move that rule to a shared helper rather than copy it). A cable with an end in no known node is not counted (as in Physical).
- **Focus** is a pure module `features/map/focus.ts` over `followPort` (`features/paths/follow.ts`). For a switch: `followPort` from every port. For a panel or HDF: from both sides of every position. A walk ending at another switch gives a neighbour; `free`/`none` ends are listed as "where its circuits end". Neighbours are keyed by equipment ID; circuits to the same neighbour are merged into one line ("N circuits"). The side of a neighbour: AGG/BB right, access left, anything else by the side its first circuit leaves from (front left, rear right; a switch's own ports right). Cap **24**: above it, neighbours are grouped per node (`{nodeId, count}` cards), opened on click. **+1 hop**: the same walk from every equipment of the previous ring (grouped or not), excluding equipment already shown, with the same cap per ring. Pure, unit-tested, and never used by a trace.
- **View state** in `mapSession`: `view`, `focusId`, `hops` (1–3; +1 hop is disabled at 3), `openNodes`, the overview viewport (restored on Back from Focus) and session-only positions for proposed nodes. Never persisted.
- **Show on map** calls one session request `focus(equipmentId)` (switches the header to Conceptual, `view = 'focus'`). The inspector's "Show on map", the Physical endpoint detail and walk-sheet rows use it.
- **Removed in step 7:** `layout`, `mapGraph`, `edges` (keep `lineWidth` if the overview uses it), `facets`, `splitPath`, `stacking`, `reuse`, `reconcile`, `keys`, `drawers` and `viewArea` **only after a grep shows no other user**; the inspector's Pin on map column; the preview node and `onCreateEquipment`'s canvas position in `App.tsx`. Kept: `snapshotIndex`, `highlight`, `networks`, `networkColors`/`NetworkBadge`, `cardRole`, `routeList`, `exportRoute`, `MapResults`, `MapTraceError`, `search`, `center` if still used, `location`.

## Tests (IDs)

| ID | What | Where |
| --- | --- | --- |
| CM-01 | `GET`/`PUT`/`DELETE /api/map-layout`: round trip, last write wins, reset, a deleted node's position goes (cascade), 404 unknown node, 422 out of range or missing, 400 unknown field; no write changes the topology revision | `persistence/map_layout_test.go`, `httpapi/map_layout_api_test.go`, `src/shared/api.test.ts` |
| CM-02 | Overview cards: one per node, equipment count, tags from explicit roles, proposed dashed | `overview.test.ts` |
| CM-03 | Pair counts equal the real cables, within and between sites; a cable inside one node is not a line | `overview.test.ts` |
| CM-04 | The network selector dims nodes without that network and never hides shared passive equipment | `overview.test.ts` |
| CM-05 | Default arrangement is deterministic, cards never overlap, saved positions win | `overviewLayout.test.ts` |
| CM-06 | Focus on EDGE-17 (the acceptance fixture) shows AGG-03, AGG-08 and BB-01 on the right, AGG-03's line "via PANEL-A 1, HDF-01 3C/5, HDF-02 2B/3"; AGG-15 (unconnected) is absent; several circuits to one neighbour merge with their count; a dead end is listed; a loop terminates | `focus.test.ts` |
| CM-07 | Focus on a panel and on an HDF walks both sides; a reserved/faulty port changes nothing (locked 6) | `focus.test.ts` |
| CM-08 | More than 24 neighbours group per node; +1 hop adds the next ring, never repeats, stops at 3 | `focus.test.ts` (campus-shaped fixture) |
| CM-09 | The map opens on node cards and lines with counts; a node opens its equipment; a drag survives a reload; Reset arrangement | `e2e/overview.spec.ts` |
| CM-10 | Focus from the inspector, from search and from Show on map; a card moves the focus; Back restores the overview viewport | `e2e/focus.spec.ts` |
| CM-11 | A trace lights the route's nodes and lines (overview) and devices (Focus); no card moves; the Route view still opens and restores | `e2e/trace-map.spec.ts` (rewritten) |
| CM-12 | Campus: overview render and Focus open timings recorded (measurements, not budgets) | `e2e/scale.spec.ts` |

Edge cases tried in review: an empty installed root, a network with no equipment, a Hebrew node and site name, a node with no cables, a stale draft (still never drawn), a refetch during a drag, a plan that adds a node.

## Steps

Each step is one Sonnet prompt (backend and frontend separately), reviewed before the next. Steps 1 and 2 are independent.

### 1. Backend: saved overview arrangement

- **Migration** `backend/migrations/009_map_layouts.sql`: `map_layouts(node_id text PRIMARY KEY REFERENCES location_nodes(id) ON DELETE CASCADE, x, y double precision NOT NULL CHECK (… BETWEEN -1000000 AND 1000000), updated_at timestamptz NOT NULL DEFAULT now())`, with a header comment like 005's (presentation only, separate from `node_layouts`).
- **Topology:** `ErrNodeNotFound` in `topology/errors.go`; `MapLayout{Positions []NodePosition}` (reuse `NodePosition`).
- **Persistence** `internal/persistence/map_layout.go`: `MapLayout(ctx)` (ordered by node ID, `[]` when none), `SaveMapPosition(ctx, nodeID, x, y)` (NaN/range → `ErrInvalidInput`; unknown node → `ErrNodeNotFound`), `ResetMapLayout(ctx)`. Never touches `installed_topology` or `plans`.
- **HTTP:** `GET /api/map-layout` → `200 {positions}`; `PUT /api/map-layout/nodes/{nodeId}` `{x, y}` → `200 {nodeId, x, y}`; `DELETE /api/map-layout` → `204`. Same decoding as the site layout handler (`coordinate`, unknown fields 400). `repositoryError` maps `ErrNodeNotFound` → 404 "Node not found". Add the three methods to `httpapi.Repository`.
- **Contract:** `api/openapi.yaml` (the three operations and `MapLayout`), `frontend/src/shared/types.ts` (`MapLayout`), `frontend/src/shared/api.ts` (`getMapLayout`, `saveMapPosition`, `resetMapLayout`) with their client test.
- **Tests first:** CM-01. Checks: `go test -race ./...` with `TEST_DATABASE_URL` (say whether DB tests ran), `go vet ./...`, `npm test`, `npm run typecheck`, the Redocly lint.

### 2. Frontend pure modules

`features/map/overview.ts`, `overviewLayout.ts`, `focus.ts` and the shared network-of-circuit helper, with CM-02 – CM-08 first. No component changes.

### 3. Overview UI

`OverviewCanvas.tsx` and `NodeCard.tsx` on React Flow; `ConceptualMap` switches on `mapSession.view`. Saved positions via TanStack Query (`getMapLayout`), drag saved once at drag stop, optimistic with rollback; proposed nodes held in the session; Reset arrangement in the map controls. Refetches reconcile by ID, never remount or refit. Styles only through `theme.css` tokens. CM-09.

### 4. Focus UI

`FocusCanvas.tsx`: centre card, neighbours left/right, group cards, line labels, "N circuits" list, +1 hop, Back. The inspector's **Focus** button and Explore search's Focus action; `focus(equipmentId)` request; Show on map rewired to it. CM-10.

### 5. Traces on the new views

Route marks (`routeList`, `highlight`) on nodes and pair lines (overview) and devices and lines (Focus); `MapResults` and the Route view unchanged. CM-11.

### 6. Tests off the old map

`e2e/helpers.ts`: select equipment through Explore search / the inspector instead of `rf__node-…`; `fitted`, `expectMarks`, `openPorts`, `pinFromInspector` replaced or removed. Each of the 34 specs that use them is moved, or deleted when it only tested the old map (listed in the step's report: kept, rewritten, deleted, with the reason). `docs/acceptance-tests.md` updated in the same step.

### 7. Remove the old map

Delete the `devices` view and the modules listed above after grepping each; Pin on map; the canvas preview and drop. `npm run build` and the whole Playwright suite green.

### 8. Docs and scale

CM-12 on the campus fixture; status.md (what runs, the timings, Now / Next), ui-spec.md §3, CLAUDE.md's code map, testing.md, acceptance-tests.md; roadmap §1 and this plan move to `docs/history/`.
