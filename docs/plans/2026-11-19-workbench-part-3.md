# The workbench, part 3: the frame, the one dock and the Trace page — Implementation Plan

> **For agentic workers:** this project's process is [way-of-work.md](../way-of-work.md): a Sonnet subagent started by Opus implements one task at a time, test first, and never commits; Opus reviews each task before the next. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one frame for every view (a 44px header, a 48px rail, one right dock with tabs that narrows the page instead of covering it) and a Trace page of its own that replaces the route view over the map.

**Architecture:** frontend only; no API, schema or domain change. The floating drawers (`DrawerPanel`, the `drawer` state, `drawerSides` and every `.studio.drawer-left/right` clearance rule) give way to a CSS grid frame and a session store `dockSession` (pure transitions, unit-tested) that App and the features read. What belongs to a view and is shown in the dock (the tree's node or device, the equipment page's port) is rendered by its feature through a portal into the dock's details slot, so its state stays where it is. The Trace page is a fourth value of the view (`'trace'`), drawn from pure modules in a new `features/trace/` and the path plates of D45; the route view (`RouteDiagram`, `diagram.ts`, `mapSession.routeView`) is removed.

**Tech Stack:** React + TypeScript, plain CSS with tokens (D33), Vitest, Playwright on lanes (`npm run test:e2e:remote`).

**Spec:** part 3 and its Trace page in [roadmap.md, "The workbench"](../roadmap.md#the-workbench-current-before-2b), D43 and D46 in [decisions.md](../decisions.md), and [the demo](../history/demos/workbench-demo.html) ("Conceptual + dock" and "Trace page"; the look, sizes and copy come from it: `.top`, `.rail`, `.dock`, `.dock-tabs`, `.dock-body`, `.tp`, `.tp-list`, `.tp-canvas`, `.tp-zoom`, `.nframe`, `.walk`, `.callout`).

## Global Constraints

- Fits **1536×864**; 1280×720 usable. The dock is 380px; the page beside it narrows (never covered, never a horizontal page scroll). Below 760px wide the dock overlays the page, as in the demo.
- The dock shows one tab at a time; tab order: details (**Node** on Conceptual, **Port** on Physical; only while something is selected), **Inspector**, **Trace**, **Explore**, **Add** (only in a plan), **Changes**, and **Networks** only while Manage networks is open. Esc closes it (unless a dialog, menu or text field handled the key first: `event.defaultPrevented` or focus in an input/select/textarea).
- Keep the accessible names specs rely on: rail buttons "Add equipment library", "Open explorer", "Open trace tools", "Open inspector"; the dock is a `complementary` region named for its tab ("Equipment inspector", "Trace tools", "Explore infrastructure", "Equipment library", "Changes & plans", "Manage networks"); its × is "Close {that name}". The visible tab labels are the demo's short ones.
- Traversal truth: the Trace page draws only the server's routes and the stored walk (`walkOfRoute`, `followPort`); frames, bands and amber marks are drawing aids and never feed traversal.
- Feature CSS uses `var(--…)` only; names are `<Name>` / `PlacePath` pieces, never joined strings; specs import from `e2e/fixtures.ts`. Do not commit.
- Copy (from the demo): dock Trace "Open full page ⤢"; a jack's path "Full page ⤢"; the page's bar "← Back", "Trace", "One route", "All routes", "Show on map", "Export", "PNG", "PDF"; the list "{N} routes · {M} mismatches", "from {X} of {Y} ports", groups "AGG", "BB", "Mismatch · another network", "What each port found · {N} searched"; "Walk, step by step" with columns "#", "Equipment", "Where", "Arrives at", "Leaves from"; "start", "bridge", "end", "Open"; All routes "Every route passes {names}." + "Different jacks, the same equipment: a problem there cuts all {N}.", "Open this route"; zoom "Zoom out", "Zoom in", "Fit", "⛶ Picture only", "Exit picture"; a mismatch "A mismatch, not a route."

## Review Focus

1. **Installed ↔ Plan and a refetch with the dock open:** the tab stays (Add falls back to Changes in Installed); a Node or Port tab whose selection is gone closes to the last other tab, never an empty dock (Task 1, Task 2).
2. **Esc inside the dock's forms and confirms** (Add form, Disconnect… confirm, a picker): only the form or confirm closes; a second Esc closes the dock (Task 1, Task 2).
3. **A trace with no routes, only mismatches, or truncated:** the Trace page opens, says so in the list and draws the first mismatch; Fit and export still work; a page whose trace was cleared (or whose revision changed and the rerun found nothing) shows "No trace" with ← Back (Task 5).
4. **A long route at 1280×720 and Hebrew names:** Fit makes the whole route visible without a page scroll; node frame labels keep Hebrew isolated (Task 4, Task 5).
5. **Leaving and returning:** ← Back returns to the view and place it came from (the tree's viewport, the equipment page and its jack); the map stays untouched (Task 5).

---

### Task 1: The frame and the dock

**Files:** create `frontend/src/features/frame/dock.ts` (+ `dock.test.ts`), `Dock.tsx`, `frame.css`; modify `src/app/App.tsx` (header, rail, `drawer` → `dockSession`; the Explore, Inspector, trace form, Library, Changes and Networks bodies move into dock tabs unchanged), `src/app/styles.css` (frame grid: header 44px, rail 48px, `.workspace-canvas` a relative grid cell; floating drawer rules removed), every feature CSS rule `.studio.drawer-left|right …` (removed: `physical.css`, `map.css`, `inventory.css`); delete `features/map/drawers.ts` (+ test); e2e: update locators only where a spec read drawer geometry, and add `e2e/frame.spec.ts`.

**Interfaces:**
- `type DockTab = 'details' | 'inspector' | 'trace' | 'explore' | 'add' | 'changes' | 'networks'`
- `type DockState = { open: boolean; tab: DockTab; details?: 'Node' | 'Port' }`
- pure: `railClick(s, tab): DockState` (opens on that tab; the same open tab closes), `openTab(s, tab)`, `close(s)`, `detailsShown(s, label)` (opens on details), `detailsGone(s)` (on details → the last other tab, else closed), `forContext(s, planned: boolean)` (`add` in Installed → `changes`), `tabsFor(s, planned): DockTab[]` (the order above).
- `dockSession`: `subscribe`, `get()`, `rail(tab)`, `open(tab)`, `close()`, `showDetails(label)`, `hideDetails()`, `setPlanned(b)`; `useDock()` hook. Session-only (like `mapSession`).
- `<Dock tabs bodies onCloseDetails>`: renders the tablist and the body; exports `DockDetailsSlot` context giving the details body element (used by Task 2).

- [ ] **Step 1: Failing tests.** Unit (`dock.test.ts`): each transition above, including rail twice closes, details gone returns to the previous tab, Installed hides Add. E2E (`frame.spec.ts`, 1536×864): `FR-01 the header is 44px and the rail 48px`; `FR-02 a rail icon opens its dock tab and narrows the page` (Open inspector: region "Equipment inspector" right of the page, the tree's/page's right edge = the dock's left edge, `scrollWidth <= clientWidth`); `FR-03 one tab at a time` (Explore then Trace: one region); `FR-04 the same icon again, ×, and Esc close it`; `FR-05 Add is only in a plan` (rail Add disabled with title "Add: open a plan first" in Installed; tab absent); `FR-06 Changes in the header opens the Changes tab`; `FR-07 at 1280×720 nothing scrolls sideways`; `FR-07b in a plan the header is amber and shows the plan's name; in Installed it is paper`.
- [ ] **Step 2:** run `npx vitest run src/features/frame` and `npx playwright test e2e/frame.spec.ts` (FAIL).
- [ ] **Step 3:** implement as in the demo. The page's view, the trace, the selection and every query stay in App/Workspace; only where a body is drawn changes.
- [ ] **Step 4:** run the new tests, then `npm test`, `npm run typecheck`, `npm run format:check`, and the whole e2e suite on lanes (`npm run test:e2e:remote`). Fix specs that relied on drawers floating over the page (a click now lands beside the dock) by changing only how they reach the element, never what they check.
- [ ] **Step 5: Screenshots** into `test-results/frame/`: each tab at 1536×864 on Conceptual and on an equipment page, a plan (amber header), 1280×720.

### Task 2: The details tab: Node and Port

**Files:** modify `features/map/HierarchyCanvas.tsx` and `HierarchyDrawer.tsx` (the drawer's body is portalled into `DockDetailsSlot`; its own floating box, header and ✕ go; Close = the dock's ×), `features/map/HierarchyPanel.tsx` (the legend behind a **Key** button on the tree's toolbar, "Key" / "Hide key"), `features/physical/EquipmentPage.tsx` and `EndpointDetail.tsx` (the port panel's body is portalled into the slot; "Close port" becomes the dock's ×), `map.css`, `physical.css`; e2e: `hierarchy.spec.ts`, `one-view.spec.ts`, `equipment-page.spec.ts` locators; add cases to `frame.spec.ts`.

**Interfaces:** consumes `dockSession.showDetails('Node' | 'Port')`, `hideDetails()`, `DockDetailsSlot`. The dock's × on the details tab calls the feature's existing close (the tree's `clear()`, the page's close-port), registered through `Dock`'s `onCloseDetails`.

- [ ] **Step 1: Failing tests.** `FR-08 a node card opens Node in the dock and the tree narrows` (the tree's right edge = the dock's left edge; the card stays visible after the pan); `FR-09 × and Esc clear the selection` (no card selected after); `FR-10 a jack opens Port in the dock` (Connect… first in a plan; the face does not move horizontally more than the dock's width); `FR-11 selecting nothing closes the details tab, not the dock's other tab` (open Explore, select a card, clear it: Explore is back); `FR-12 Key shows and hides the legend`. Existing hierarchy and equipment-page specs keep passing with changed locators only.
- [ ] **Steps 2–4:** run (FAIL), implement, run the specs, the whole suite and the checks after the last change.
- [ ] **Step 5: Screenshots** into `test-results/frame/`: a node, a device on the tree, an HDF jack, a switch port, each at 1536×864.

### Task 3: The trace results in the dock

**Files:** create `features/frame/TraceTab.tsx` (the trace form from App, then the results that were `MapResults`: summary, routes AGG first, mismatches, truncation, the selected route's walk sheet, Clear trace, and the heading's **Open full page ⤢**); modify `App.tsx` (the trace form moves; `MapResults` and `MapTraceError` are no longer drawn over the map or Physical: the error is shown in the tab), `features/map/MapResults.tsx` (becomes the tab's results part, without the Route view toggle, PNG and PDF); e2e: `distribution.spec.ts`, `trace-map.spec.ts`, `trace-switch.spec.ts`, `walk-sheet.spec.ts`, `mismatch.spec.ts`, `hops-find.spec.ts` (locators only).

**Interfaces:** `TraceTab` props: the existing trace form state and handlers from Workspace, `result?: TraceResult`, `routeIndex`, `onRoute(i)`, `sheet?`, `onHop`, `onShowInPhysical`, `onClear`, `onOpenPage(): void` (Task 5 wires it; until then it is absent and the button hidden).

- [ ] **Step 1: Failing tests.** `TR-01 Find AGG / BB from the inspector opens the Trace tab with the routes` (EDGE-17: AGG-03 first; the tree beside lights the route; nothing drawn over the map); `TR-02 choosing a route lights it in place and never moves the view`; `TR-03 a trace error shows in the tab with Refresh topology`; `TR-04 in Physical the same tab, and a row opens that endpoint`.
- [ ] **Steps 2–4:** run (FAIL), implement, run the specs, the whole suite and the checks.

### Task 4: The Trace page, as data

**Files:** create `features/trace/model.ts` (+ `model.test.ts`), `features/trace/zoom.ts` (+ `zoom.test.ts`); modify `features/paths/pathLine.ts` (export `stepsOfWalk`, used by `pathLine` and by `routeLine`; `pathLine`'s behaviour unchanged).

**Interfaces:**
- `stepsOfWalk(index, walk: Walk, start: PathPlate, installed?): { steps: PathStep[]; cables: number }` in `pathLine.ts`.
- `routeLine(index, route: Route, installed?): { steps: PathStep[]; cables: number }` — the start plate (its jack selected), then `walkOfRoute`'s cables and plates; the last plate carries `destination`.
- `type Frame = { siteId?: string; nodeId?: string; place: string[] /* site, node */; steps: PathStep[] }`; `nodeFrames(index, steps): (Frame | PathCable)[]` — consecutive plates of one node, with the cables between them, in one frame; a cable between two nodes stands between frames.
- `resultGroups(result)`: `{ aggregation: Item[]; backbone: Item[]; mismatches: Item[] }` with `Item = { kind: 'route' | 'mismatch'; index: number; route: Route }`; `resultCounts(result)`: `{ routes, mismatches, reachedPorts, searchedPorts }`; `portOutcomes(index, result)`: one line per reached/mismatch port, then counts of `no_destination`, `disconnected`, `unresolved_network`.
- `sharedEquipment(lines: PathStep[][]): Set<string>` — equipment ids on every line except each line's first and last plate; empty for fewer than two lines.
- `walkRows(index, steps): WalkRow[]` with `WalkRow = { kind: 'step'; n: number; plate: PathPlate; arrives?: PathJack; leaves?: PathJack; note: 'start' | 'bridge' | 'end' } | { kind: 'cable'; linkId: string; networkId?: string }`.
- `zoom.ts`: `fitZoom(content: {w,h}, box: {w,h}, picture: boolean): number` (width only and at most 1 on the page; width and height and at most 2.5 in Picture only; never below 0.3); `stepZoom(z, direction: 1 | -1): number` (×1.25 or ÷1.25, clamped 0.3–4); `wheelZoom(z, deltaY): number` (`z × exp(−clamp(deltaY, −50, 50) × 0.005)`, clamped).

- [ ] **Step 1: Failing tests** on the acceptance fixture: EDGE-17's trace to AGG-03 → `routeLine` plates EDGE-17, PANEL-A, HDF-01, HDF-02, AGG-03 with the stored cable IDs and `destination: 'aggregation'`; `nodeFrames` splits it where the node changes; `walkRows` gives start / bridge… / end with arrives and leaves; groups AGG before BB; a mismatch goes to `mismatches`; `sharedEquipment` of two routes through the same panel; counts of a truncated result; each `zoom.ts` bound.
- [ ] **Steps 2–4:** run `npx vitest run src/features/trace src/features/paths` (FAIL), implement, run them, then `npm test`, `npm run typecheck`, `npm run format:check`.

### Task 5: The Trace page

**Files:** create `features/trace/TracePage.tsx`, `TraceDrawing.tsx` (frames and plates), `TraceCanvas.tsx` (zoom box, ⌘/Ctrl + wheel, drag, Picture only), `trace.css`; extract `features/paths/PathPlates.tsx` from `PathBar.tsx` (one plate and one cable, drawn the same in both); modify `MapControls.tsx` (`MapView` gains `'trace'`; the header's view switch shows none pressed on it), `App.tsx` (the page replaces the view while open; remembers the view to return to; the rail's Trace shows on), `TraceTab.tsx` (Open full page ⤢), `PathBar.tsx` (Full page ⤢ on a cabled jack: runs Find AGG / BB from that jack and opens the page), `HierarchyDrawer.tsx` (a passive chip in Way up opens the page on that jack instead of the route view), `exportRoute.ts` (the capture takes the page's drawing element, or the drawing and the walk for the PDF; the header unchanged); e2e: create `e2e/trace-page.spec.ts`, delete `e2e/route-view.spec.ts` once its export cases are moved, `export.spec.ts` follows.

**Interfaces:** consumes Task 4's functions and Task 3's `onOpenPage`. `TracePage` props: `snapshot`, `index`, `installed`, `result`, `routeIndex`, `onRoute`, `onBack()`, `onOpen(equipmentId, endpointId?)` (Show in Physical), `onShowOnMap()` (the tree, with the chosen route lit in place: the same as ← Back to Conceptual), `planName?`. Session-only state in `traceSession`: `pageView: 'one' | 'all'`, `picture: boolean` (zoom is component state; it resets to Fit on another route or One/All).

- [ ] **Step 1: Failing tests** (1536×864 unless said): `TP-01 Open full page shows the trace on its own page` (no dock; list groups; the title "EDGE-17 · {port} → AGG-03 · {port}"); `TP-02 node frames show where the route leaves a node` (one frame per node, labelled Site › Node; a cable between frames); `TP-03 the walk has a row per equipment with Open` (Open lands on that equipment page and jack); `TP-04 a mismatch is explained`; `TP-05 All routes outlines the shared equipment in amber` (and the note names it); `TP-06 zoom: + and − change the percentage, Fit returns, ⌘/Ctrl + wheel zooms, drag scrolls`; `TP-07 Picture only hides the list and the walk; Esc returns`; `TP-08 ← Back returns to the tree with its viewport and selection, and to the equipment page with its jack`; `TP-09 Full page from a jack's path`; `TP-10 a passive chip in the drawer's Way up opens the page`; `TP-11 PNG and PDF download with the route's file name` (moved from route-view.spec); `TP-12 at 1280×720 Fit shows the whole route and the page does not scroll sideways`; `TP-13 a cleared trace shows "No trace" with ← Back`.
- [ ] **Steps 2–4:** run (FAIL), implement as in the demo, run the specs, the whole suite and the checks after the last change.
- [ ] **Step 5: Screenshots** into `test-results/trace-page/`: One route, a mismatch, All routes, Picture only zoomed, 1280×720, a plan.

### Task 6: The route view goes; the docs

**Files:** delete `features/paths/RouteDiagram.tsx`, `routeDiagram.css`, `diagram.ts` (+ test); remove `routeView` / `setRouteView` from `mapSession` (+ tests) and their use in `HierarchyCanvas.tsx`; update `docs/status.md` (the frame, the dock, the Trace page; Route view and export move under it; the "long route wider than the screen" limit goes), `docs/ui-spec.md`, `docs/architecture.md` where it names drawers or the route view, `api` none, and `CLAUDE.md`'s Architecture (the frame and `features/frame/`, `features/trace/`, no `RouteDiagram`, no route view in `mapSession`).

- [ ] **Step 1:** `rg -n "RouteDiagram|routeView|setRouteView|route-view|DrawerPanel|drawerSides" src e2e ../docs ../CLAUDE.md` lists only history files.
- [ ] **Step 2:** `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`, the whole e2e suite on lanes; the Go tests are untouched (say so).
