# Fewer trace tools — Implementation Plan

> **For agentic workers:** this project's process is [way-of-work.md](../../way-of-work.md): a Sonnet subagent started by Opus implements one task at a time, test first, and never commits; Opus reviews each task before the next.

**Goal:** the design in [roadmap.md, "Fewer trace tools"](../../roadmap.md#fewer-trace-tools-current-approved-2026-11-24-d47) and D47 in [decisions.md](../../decisions.md): no rail Trace icon, no Trace form (and so no exact port → port in the app), no node/site highlight; site and node names open Physical. The teal route on the tree and in Physical stays.

**Architecture:** frontend only. The API, `api/openapi.yaml` and the `TraceRequest` type in `shared/types.ts` keep `point_to_point` (the server still runs it); the screen stops offering it.

## Global constraints

- Keep the teal route marks (tree cards and lines, Physical racks, sites and jacks), Find AGG / BB from every place that offers it now, the Trace page, the walk sheet, Clear trace, Open full page ⤢, the trace error with Refresh topology, and the rerun across Installed ↔ Plan (`traceSession`).
- Keep the dock's accessible names: the Trace tab's region stays "Trace tools" and its × "Close Trace tools".
- Feature CSS uses `var(--…)` only; specs import from `e2e/fixtures.ts`; names are `<Name>`/`PlacePath` pieces. Do not commit.

### Task 1: The rail's Trace icon and the Trace form go

**Files:** `src/app/App.tsx` (the rail entry `['trace', 'Open trace tools', …]`; the `mode`, `end`, `setEnd` state and the `startItems`/`endItems` lists; what is passed to `TraceTab`); `src/features/frame/TraceTab.tsx` (the form section goes; the results stay); `src/features/frame/dock.ts` (+ test: the Trace tab is listed only while there is a trace; Clear trace closes it to the last other tab, or closes the dock); delete `src/features/pathfinding/TracePicker.tsx` and `picker.ts` (+ test) if nothing else uses them; `routeList.ts` / `exportRoute.ts` may keep their `point_to_point` labels (a stored trace request type still has it) or drop them if unused; e2e: every spec that opens the rail's Trace or fills Start/Destination starts from a switch (inspector Find AGG / BB) or a port/position row (Find AGG / BB from here) instead; exact port → port specs and `picker.spec.ts` are deleted; `frame.spec.ts` FR tests follow the three-icon rail.

- [ ] **Step 1: Failing tests:** `dock.test.ts`: no trace → `tabsFor` has no `trace`; a trace → it does; clearing it from the Trace tab leaves the dock on the last other tab or closed. Playwright: `FR-02`/`FR-03` with three rail icons (Add, Explore, Inspector) and no "Open trace tools"; a new `TT-05 the Trace tab has no form: Find AGG / BB from a switch shows the routes, Clear trace removes the tab`.
- [ ] **Steps 2–4:** run (FAIL), implement, run the touched specs, then `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`, the whole e2e suite.

### Task 2: The node/site highlight goes; place names open Physical

**Files:** `src/app/App.tsx` (`highlightLocation` goes; Explore's site and node names call the existing `openPlace` on every view, labelled "Open {name} in Physical"; the inspector's `onHighlight` becomes `onOpenPlace`); `src/features/inspector/Inspector.tsx` (the site and node links open Physical, aria-label "Open site {name} in Physical" / "Open node {name} in Physical"); `src/features/map/mapSession.ts` (+ test: `highlight`/`setHighlight` go; `requestFit` stays only if something else uses it); `HierarchyCanvas.tsx` (the highlight, `ClearHighlight`, its Esc handler, its fit); `hierarchyFlow.ts` (+ test: `highlightedCards` and the highlight mark go); `MapControls.tsx` (`ClearHighlight`); `features/map/highlight.ts` (+ test) if nothing else uses it; the Highlighter icon and its CSS; e2e: `highlight.spec.ts` and the HI-10 highlight tests go; a new test that a site and a node name in Explore (on Conceptual) and in the inspector's place line open Physical at that site and node.

- [ ] **Step 1: Failing tests** as above.
- [ ] **Steps 2–4:** run (FAIL), implement, run the touched specs, then all the checks and the whole e2e suite.

### Task 3: The route trail and the Uplinks summary go

**Files:** delete `features/physical/RouteTrail.tsx`, `trail.ts` (+ test) and its CSS, and its use in `PhysicalExplorer.tsx`; delete `features/paths/UplinksSummary.tsx`, `useUplinks.ts` and `uplinks.ts` (+ test) if nothing else uses them, and their use in `Inspector.tsx` and `EquipmentPage.tsx`; e2e: `trail.spec.ts` tests of the trail and the Uplinks tests go (keep the walk-row tests that are not about the trail); the equipment page and inspector specs no longer expect the Uplinks block.

- [ ] **Step 1: Failing tests:** an equipment page of a switch with a route selected has no trail region and no "Uplinks" block; the inspector of EDGE-17 has no "Uplinks" block.
- [ ] **Steps 2–4:** run (FAIL), implement, all the checks and the whole e2e suite.

### Task 4 (Opus): the docs

`docs/status.md`, `docs/ui-spec.md`, `docs/testing.md`, `docs/acceptance-tests.md`, `CLAUDE.md` Architecture (`highlight` module, `mapSession`'s highlight, the Trace tab form); nothing in `api/`.


## Design (from the roadmap): Fewer trace tools (done; approved 2026-11-24, D47)

From the owner after part 3 of the workbench: the jack's path and Find AGG / BB from a switch cover what the trace form was for. Owner's answers (2026-11-24): remove the rail's Trace icon; remove the form ("Remove the form"), and so exact port → port; Explore's amber highlight "go"; keep the teal route on the tree and in Physical; a site or node name opens Physical. Frontend only; the API is unchanged.

- **Rail:** Add, Explore, Inspector. No Trace icon.
- **The dock's Trace tab:** only while there is a trace (Find AGG / BB from the inspector's switch, a port or position row, a jack, a passive chip in Way up, or Full page ⤢ on a jack's path). It shows the results (AGG first, mismatches, truncation), the selected route's walk, **Clear trace** (which also removes the tab) and **Open full page ⤢**; a failed trace shows its error there. No mode, Start, Destination or Find AGG / BB button; no Start/Destination search lists.
- **The Trace page:** unchanged; its bar names the trace as text ("Find AGG / BB", the start).
- **Place names:** a site or node name in Explore (on every view) and in the inspector's place line opens that site or node in Physical, as the rack link already does. The amber highlight, its Clear highlight button, its Esc and its one-time fit are removed.
- **Route trail in Physical:** the one-line strip of the route's steps under the breadcrumbs (‹ Prev / Next ›) goes; the teal marks stay.
- **Uplinks summary:** "Uplinks · N of M ports reach an AGG or BB" goes from a switch's equipment page and the inspector; Find AGG / BB from the switch gives the routes.
- **Kept:** the teal route on the tree and in Physical; the rerun of a trace across Installed ↔ Plan.
- **Tests:** specs that used the form start from a switch or a port instead; the exact port → port and highlight specs are deleted; a spec checks that a site and a node name open Physical.
