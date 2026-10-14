# Plan: Explanatory paths (2026-10-14)

The item is the roadmap entry (moved below, at the end of this file). The approved demo is [history/demos/explanatory-paths-demo.html](../demos/explanatory-paths-demo.html), and the owner's answers are recorded in the roadmap entry. This work is frontend only: no API change, no migration.

## What the user gets

1. **Walk sheet** in place of the hop list in the trace results (map and Physical). It has one row per equipment, grouped by place (Site › Node › Rack), with the unit and where the signal enters and leaves. Cables show their label, or a short ID when there is no label. Notes say when a cable leaves a node or site, and an end line says how the path ends.
2. **Selected switch port's path:** on a switch's equipment page in Physical, the side panel shows the selected port's walk sheet wherever it ends. It replaces the chain for switch ports. Panel and HDF positions keep today's chain.
3. **Uplinks summary** at the top of an access switch's equipment page and in the inspector. It has one line per port that reaches an AGG/BB, built from Find AGG / BB for that switch. The ports it lists are marked on the faceplate.

## Decisions taken in the plan (from the approved demo and the code)

- **The walk** (`followPort`) only follows stored links: the port's one cable, then the far endpoint's one stored internal bridge, then that endpoint's cable, and so on. It stops at a switch port, at an endpoint with no further cable or bridge, or when it would revisit an endpoint. The validator allows at most one cable and one bridge per endpoint, so the walk is a single line with no branches. It never infers a link from positions, names or roles.
- **Server routes stay authoritative.** A route from `/traces` is turned into a sheet from its own hops (`walkOfRoute`) and is never walked again in the browser. `followPort` is used only for the port selected on a switch page.
- **Classification of the end:** a switch with role `aggregation` or `backbone` is a destination (AGG/BB); any other switch is "another switch". The uplinks summary uses only the server's routes, so network matching and mismatches stay the server's job.
- **Short ID:** `…` plus the last six characters, or the whole ID when it has 8 characters or fewer. The full ID goes in `title`.
- **Names** (equipment, rack, node, site, network, cable label) are always rendered inside `<bdi>`.
- The demo's **Compare with today** is design material only. It is not built.
- The results' route rows and their counts ("N cables · M internal bridges") stay as they are. Route view and PNG/PDF stay.
- **Clicking a sheet row:** on the map it does what a hop row does today (`onHop`: select and center), and its Server button keeps "Show in Physical". In Physical it opens that endpoint (`onGoToPeer`).
- **Clicking an uplink line:** in Physical it selects that port, so the side panel shows its sheet. In the inspector it runs Find AGG / BB from that port (`onFindFromHere`), so the results show its sheet.
- **Fetching the uplinks summary:** one `useQuery` per open access switch, `trace(context, {mode:'distribution', device}, planID, revision)`, keyed by context, plan, revision and equipment ID. It is separate from the map's selected trace and never changes it.
- **The summary for an AGG or BB switch:** a muted line, "{name} is an AGG: paths from access switches end here." ("a BB" for a BB). There is no request.

## Exact texts

| Where | Text |
| --- | --- |
| Row, start | `start · out {port}` |
| Row, passive | `in {side} {place} → out {side} {place}` (`place` is `3C/5` for an HDF, `2` for a panel) |
| Row, last passive with nothing after | the passive text, then ` · nothing connected` |
| Row, switch end | `in {port}` |
| Cable, labelled | `cable {label}` |
| Cable, no label | `cable, no label · {shortId}` |
| Cable leaves a site / node / rack | `leaves {site}` / `leaves {node}` / `to {rack}, same node` |
| Meta | `{n} cable(s) · {n} passive(s) · {n} rack(s) · network {name}` (the network part only when known) |
| End, AGG / BB | `Ends at {name} · {port}, an AGG.` / `…, a BB.` |
| End, another switch | `Ends at another switch, {name} · {port}. It does not reach an AGG or BB from here.` |
| End, free | `Ends at a free position: nothing is connected to {name} · {side} {place}.` |
| End, no cable | `No cable is connected to this port.` |
| End, point-to-point | `Ends at {name} · {port}.` |
| Uplinks head | `Uplinks` · `{n} of {total} ports reach an AGG or BB` |
| Uplinks, none | `No port of {name} reaches an AGG or BB.` |
| Uplinks, mismatches | `{n} port(s) reach an AGG or BB on another network.` (muted, only when > 0) |
| Uplink line | `{port}` · `→ {dest} · {destPort}` + AGG/BB tag · `{n} cables` · `via {passive names joined by " › "}` |

`{port}` is a switch port's label. `{name}` is an equipment name.

## Tasks

Each task is one Sonnet prompt, done test-first. Opus reviews after each one. No task commits.

### Task 1: the pure model (`features/paths/`)

Files: `src/features/paths/follow.ts`, `follow.test.ts`, `sheet.ts`, `sheet.test.ts`; `src/features/map/snapshotIndex.ts` (+ test).

- `SnapshotIndex.bridgeByEndpoint: ReadonlyMap<string, { linkId: string; otherEndpointId: string }>`, built next to `cableByEndpoint`.
- `follow.ts`:
  ```ts
  export type WalkEnd =
    | { kind: 'destination'; endpointId: string; role: 'aggregation' | 'backbone' }
    | { kind: 'switch'; endpointId: string }
    | { kind: 'free'; endpointId: string }
    | { kind: 'none'; endpointId: string }
    | { kind: 'endpoint'; endpointId: string }
  export interface Walk { start: string; hops: Hop[]; end: WalkEnd; networkId?: string }
  export function followPort(index: SnapshotIndex, endpointId: string): Walk
  export function walkOfRoute(index: SnapshotIndex, route: Route): Walk
  ```
  `walkOfRoute`: the end is `destination` when the route has `destinationRole`, otherwise `endpoint`. `networkId` is `route.sourceNetworkId`. For `followPort`, it is the start equipment's `networkId`.
- `sheet.ts`: `buildSheet(index, networks, walk): Sheet`. It has the title parts, the counts, the network name, `items` (`place | row | cable` in order, a `place` item whenever the rack changes), and the end line. It returns data only. The texts are in the table above.
- Tests, failing first:
  - acceptance fixture A01–A04 as a route and as `followPort` from EDGE-17 port 1: the same rows;
  - no cable; a free end at a panel rear; a panel position with no stored bridge (the walk stops there);
  - another access switch; a revisit guard (a hand-made loop through two panels);
  - the leave notes for a site, a node, and a rack in the same node;
  - label vs short ID, including an ID of 8 characters or fewer;
  - counts and their singular forms;
  - Hebrew names returned whole.
- **Review (2026-10-14):** the model is approved except that names were baked into sentences. A fix is pending: the sheet returns names and ports as separate parts (`Spot`, `end.at`, `note: {kind, name}`), plus `endPieces` / `notePieces` / `metaPieces` (`{text} | {name}` pieces, which task 2 renders with `<bdi>` around every name), and `SnapshotIndex.cableById` replaces the cable map built on every call. **Fix reviewed and approved the same day; Task 1 is done.**

### Task 2: `WalkSheet` in the trace results

Files: `src/features/paths/WalkSheet.tsx`, `paths.css`; `src/features/map/MapResults.tsx`; `src/features/pathfinding/hops.ts` (remove `hopRows` and its tests, keep `readableEndpoint`); e2e specs that use `map-hop-row` (`hops-find`, `equipment`, `physical`, `trail`); a new `e2e/walk-sheet.spec.ts`.

- The look follows the demo: the place header, then rows (unit, name with a kind tag, the in/out line), cable connectors with notes, and the end line. All names go in `<bdi>`.
- Test IDs: `walk-sheet`, `walk-place`, `walk-row` (with `data-endpoint`), `walk-cable`, `walk-end` (with `data-end` = the end kind).
- MapResults shows `WalkSheet` for the selected route in both views. On the map, a row click calls `onHop` and its Server button calls `onShowInPhysical`. Physical uses the same handlers it has today.
- e2e WS-01: Find AGG / BB from EDGE-17 shows the sheet for the selected route: the place headers in order, PANEL-A's row `in front 1 → out rear 1`, the end `Ends at AGG-03 · …, an AGG.`, and every name inside a `bdi`. The existing specs are updated deliberately (same behaviour, new rows).

- **Review (2026-10-14): approved.** Unit tests, typecheck, build, format and the whole e2e suite (180 passed, the opt-in scale spec skipped) are green; the changed specs keep their behaviour with one row per equipment.

### Task 3: the selected switch port's path in Physical

Files: `src/features/physical/EndpointDetail.tsx`, `EquipmentPage.tsx` (pass the walk sheet), e2e.

- When the selected endpoint belongs to a switch, `EndpointDetail` renders `WalkSheet(followPort(...))` where the chain was. The header, chips, details and plan edits stay. Panel and HDF positions keep the chain.
- A row click calls `onGoToPeer(endpointId)`.
- e2e WS-02: EDGE-17 port 1 shows the sheet ending at AGG-03. A port with no cable shows `No cable is connected to this port.` A free end shows `Ends at a free position…` (built in a plan if the fixture has none, or covered by a unit test only, whichever the fixture allows; say which). A switch row opens that switch's page.
- e2e: the chain specs for panel and HDF positions (`hdfplate`) stay green and unchanged.

- **Review (2026-10-14): approved.** Unit, typecheck, build, format and the whole e2e suite are green. The fixture has no switch-to-switch path or free end from a switch port, so those two ends are covered by the Task 1 unit tests only.

### Task 4: the uplinks summary

Files: `src/features/paths/uplinks.ts` (+ test), `UplinksSummary.tsx`, `useUplinks.ts`; `EquipmentPage.tsx`; `src/features/inspector/Overview.tsx` or `Inspector.tsx`; `src/features/physical/FaceView.tsx` (an optional `uplinkIds` set: those jacks get a `data-uplink` mark and the purple style); e2e.

- `uplinkLines(index, result): UplinkLine[]` returns the routes in engine order (AGG first), plus the mismatch count and the truncation notice (`truncationNotice`). `via` lists the passive equipment names in order, with consecutive repeats collapsed.
- A query is made only for a switch with role `access`. While it loads, show `Finding uplinks…`. On an error, show the error message with **Retry**.
- e2e WS-03: EDGE-17's page lists its uplink lines, AGG first, with the counts and `via` as in the acceptance example. A click selects the port and the side panel shows its sheet. Those ports carry `data-uplink`.
- e2e WS-04: in the inspector on the map, the same lines appear. A click runs Find AGG / BB from that port, and the results show its sheet.
- WS-05: an AGG's page shows the AGG line and makes no `/traces` request (checked with `page.on('request')`).

- **Review (2026-10-14): approved.** Unit (812), typecheck, build, format and the whole e2e suite are green. Opening an access switch in the inspector or in Physical now makes one Find AGG / BB request (cached per revision); `highlight.spec` was updated for that extra request. The fixture has no mismatch from a switch, so the mismatch line is covered by the unit test only.

### Task 5: the Route view, redrawn

Added 2026-10-14. The owner approved the new Route view and asked for a bigger separation between places and a clearer trace; the demo was updated the same day (version 3, Conceptual › Route view) and **approved by the owner on 2026-10-14**.

- The same opt-in Route view (locked 3, amended 2026-10-06): only the active route, left to right; turning it off restores the map exactly; PNG and PDF export this picture with its header.
- Each **node** is a box with its name, holding its steps close together; nodes are far apart inside a **site** frame. A cable inside a node is short; one that leaves a node or a site is long and carries "leaves {node}" / "leaves {site}".
- Each **step**: number, kind tag, unit, large name, its rack, and the ports used as pins (in on the left, out on the right).
- The **trace**: one thick line with arrowheads and a moving flow (still when reduced motion is set), joining the pins; the cable's label (or short ID) on the line.
- Built from the same `Sheet` (no second walk). Two prompts:
  - **5a, the picture:** `RowItem` gains `inPort`/`outPort` and `PlaceItem` gains `siteId`/`nodeId` (additive); a pure `routeDiagram.ts` groups the steps into sites › nodes with each cable's gap kind (`in-node`, `node-gap`, `site-gap`); `RouteDiagram.tsx` draws the demo's look. Nothing is wired yet.
  - **5b, the swap:** with Route view on, `RouteDiagram` covers the map area (the map stays mounted and untouched underneath, so turning it off restores it exactly); the React Flow route-view layout, outlines and route viewport are removed where nothing else uses them; PNG/PDF capture the diagram; the route-view, export and other affected specs are rewritten on purpose.
- **Review 5a (2026-10-14): approved with fixes by Opus.** The model file was renamed `routeDiagram.ts` → `diagram.ts` (+ test): on a case-insensitive disk (macOS) `./RouteDiagram` resolved to the model and the component could not load. `RouteDiagram.tsx` now imports `paths.css` (its kind tags) and hides an empty site or node header. A static render of the acceptance and cross-site paths matches the demo; 823 unit tests, typecheck, build and format are green.
- **Review 5b (2026-10-14): approved.** The diagram is a layer over the map (the React Flow map stays mounted, made inert, controls hidden); turning it off leaves the map exactly as it was. The React Flow route view (`routeView.ts`, outlines, the route viewport, the node/rack box marks) is removed. PNG/PDF capture the diagram at its full size. Unit (799), typecheck, build, format and the whole e2e suite (192 passed, the opt-in scale spec skipped) are green. Opus removed one unused import.
- **Decision to record at close:** locked 3 (amended 2026-10-06) said "node and rack outlines"; the approved picture has site frames and node boxes, and shows the rack on each step.

### Task 6: docs and close (Opus)

`docs/acceptance-tests.md` (a new "Explanatory paths" section with WS-01…WS-05), `docs/ui-spec.md` (trace results, the equipment page), `docs/status.md`, `CLAUDE.md` (the code map: `features/paths/`), and the roadmap entry moves to history. There is no change to `openapi.yaml` or `types.ts`.

## Checks for every task

From `frontend/`: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`, the e2e specs the task touches, then `npm run test:e2e` before approval. Backend: `go test -race ./...` and `go vet ./...` (unchanged code, run once at the end). Screenshots: the results panel on the map, an EDGE-17 page with the uplinks summary and a selected port, and the inspector of EDGE-17.

## The roadmap entry (moved here when the item closed, 2026-10-14)

Recorded 2026-10-13, from photos of real data. A trace is hard to follow: tiny cards in the route view, server cable IDs (`cable-LTICTBBMVKJJAO6KNXFWG35XJ2`), "PANEL BRIDGE … bridge" rows, no physical place per step, and Hebrew names mixed with left-to-right labels.

**Owner's answers:** (1) on a switch, **both** an uplinks summary and the full path of a selected port; (2) a path is explained as a **walk sheet**.

**Design (frontend only, no API change):**
- **Walk sheet:** one pure path model built from a trace result: steps grouped by place (Site › Node › Rack, with the unit), one row per equipment with where the signal enters and leaves ("in front 2 → out rear 2"; the bridge is folded into the row, never its own row), cables between rows shown by their **label** when set and otherwise a short form of the ID (full ID on hover), and a note when the path changes place ("leaves Building A"); the destination row marked; right-to-left names kept readable (bidi isolation). It replaces the hop list in the results panel; Route view and PNG/PDF stay.
- **Switch uplinks summary:** at the top of a switch's equipment page in Physical (and in the inspector), one line per port that reaches an AGG/BB, from the existing Find AGG / BB result for that switch: "Te1/1/1 → AGG-03 · Te1/1/1 · 4 cables · via PANEL-A › HDF-01 › HDF-02"; a line opens its walk sheet.
- **Selected port's path:** a click on any port of the faceplate shows that port's walk sheet in the side panel, wherever the path ends (an AGG/BB, another switch, a free end).

**Demo approved 2026-10-14:** [history/demos/explanatory-paths-demo.html](../demos/explanatory-paths-demo.html). It shows the uplinks summary, the faceplate click, the walk sheet in Physical and in the Find AGG / BB results, cables named by their label or the last six characters of the ID, "leaves …" notes, and an end line for an AGG/BB, another switch, a free end, or no cable.

**Owner's answer (2026-10-14):** the path of a port that does not end at an AGG/BB is followed **in the browser**: a pure walk over the stored links of the loaded snapshot (a cable, then the stored internal bridge, until a switch port or an end with no further link). No API change.
