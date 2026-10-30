# Plan: One conceptual view (2026-10-28)

The item is phase 2 of [roadmap.md §1](../../roadmap.md#1-the-network-hierarchy-the-conceptual-views-new-purpose); the design and the owner's answers (2026-10-28) are there, and the rules are D39 and D40 in [decisions.md](../../decisions.md). The look is the approved demo [history/demos/conceptual-demo.html](../demos/conceptual-demo.html): the columns, the frames, the open node as a list of names, the lit and dimmed selection, the drawer's sections and their wording. Where this plan and the demo differ, this plan wins and says so.

**Frontend only. No new API, no migration, no backend change.** Phase 1 (the top-to-bottom hierarchy, D39) is merged and not deployed; phases 1 and 2 are deployed together.

## What the user gets

1. Conceptual is **one tree per network, left to right**: BBs, then frames of AGGs (a pair, a single AGG, Direct to BB, No AGG), then node cards. An open node lists its switch names.
2. **Show on map** from the Inspector, Inventory, Physical and Explore lands on the tree with the device **selected**:
   - its node is open and the device is marked;
   - its way up and what depends on it are lit, and the rest is dimmed;
   - Esc or ✕ clears the selection.
3. **The drawer** of the selection gives:
   - the way up through every panel and HDF;
   - what depends on it, with **cut off**;
   - its cables.
4. **Marks:**
   - "single" is gone;
   - "2 uplinks" is a neutral badge;
   - an AGG with no BB is marked;
   - "N problems" equals Inventory's Problems.
5. **The Focus view is gone:** its Inspector button, the hops and the Hierarchy / Focus switch.

## Global constraints

- **Roles only, never names** (D04, locked 5). Every line, mark and "cut off" comes from `followPort` walks over stored cables and bridges.
- **Map lines are a drawing aid** and never feed a trace (D05, D11).
- **Names:** every name goes through `Name`, `PlacePath` or pieces; never join names into one string for display (D32, D33).
- **Colours** come only from `theme.css` tokens (`theme.test.ts`). The lit path is the route colour (teal); a fault uses the existing warning tokens.
- **Positions** are computed and never saved. Nothing new is persisted.
- **Plans:** a stale draft is never drawn. In a plan, the tree shows the proposed snapshot with its additions dashed, as phase 1 does.
- **Tests first:** each step's tests are written and seen failing before the code.

## Decisions taken in the plan

These fill gaps that the design and the demo left open. They go to the owner with the plan.

1. **A cable between two access switches when both have their own way up** counts as a second uplink for **both**. Neither is chained. The data has no direction, so nothing is guessed. The demo showed the badge on one end only.
2. **"Chained"** means the switch's only ways up go through other access switches. This is phase 1's rule restricted to "no own uplink".
3. **"Cut off" when X fails:** the switch has no walk to a top (a BB, or the Top AGG rule) that avoids X. X is a device, or a passive anywhere on the walk. A switch that already has no way up is not listed under anything.
4. **Find:** the demo's "Find…" field in the panel is **not built**. Explore already finds equipment, and picking a result selects it on the tree.
5. **Selecting a panel or HDF:**
   - the tree shows the network most of its circuits are on, ties going to the network listed first;
   - it opens the nodes it serves when there are at most 3.
6. **Scrolling:** selecting scrolls the tree so the selected card is visible, at the current zoom. It never refits. Changing the network fits once, as phase 1 does.
7. **Hierarchy marks** keep one definition shared with Inventory's Problems. The Problems rows lose `single` and gain "AGG with no BB" (one row per such AGG).

## Tests (IDs)

New IDs, added to `docs/acceptance-tests.md` in step 5.

| ID | What | Where |
|---|---|---|
| OV-01 | Marks: no "single"; the "2 uplinks" count (an AGG pair, AGG + BB, AGG + an access switch counted on both ends); "chained" only with no own way up; "AGG with no BB" | `hierarchy.test.ts` |
| OV-02 | Layout, left to right: deterministic; no overlaps; each frame is centred on its rows; an open node's height holds every row and the quiet line; Only problems keeps frames with an AGG that has no BB | `hierarchyLayout.test.ts` |
| OV-03 | Selection: an access switch (its card, frame, AGGs and BBs), a chained switch (through its parent), a split node (both cards), an AGG (its cards and BBs), a BB (the frames cabled to it), a panel or HDF (the switches through it; its nodes opened when there are at most 3), the network chosen | `hierarchySelection.test.ts` |
| OV-04 | Cut off: one uplink is cut by its AGG; two uplinks are not cut by one of them; a passive cuts every switch whose every circuit runs through it; a chained child is cut by its parent; one access switch cabled to another, both with an own uplink: neither cut | `hierarchySelection.test.ts` |
| OV-05 | Drawer rows: the way up as steps (port, each passive with its position, device, the tops, faults, the gap texts), what depends on it, and the cables | `hierarchyDetails.test.ts` |
| OV-06 | Session: select and clear; the open nodes; nothing left of the view, focus, hops or groups | `mapSession.test.ts` |
| OV-07 | Browser, acceptance fixture: Show on map EDGE-17 from the Inspector lands on the tree with Building A open, EDGE-17 marked, AGG-03, AGG-08 and BB-01 lit, the rest dimmed; Esc clears; the viewport is not refitted | `one-view.spec.ts` |
| OV-08 | Browser: Show on map from Inventory, Physical and Explore selects the same way; HDF-01 selected lights the switches through it, and its drawer lists what depends on it | `one-view.spec.ts` |
| OV-09 | Browser: a passive chip in the way up opens the route view on that jack; a device chip selects that device | `one-view.spec.ts` |
| OV-10 | No Focus anywhere: the Inspector has no Focus button, and no element has `data-view="focus"` | `one-view.spec.ts`, `inspector.spec.ts` |
| OV-11 | Problems: one `uplink:` row per marked switch and one per AGG with no BB; the count equals the map's | `problems.test.ts` (HI-08 amended) |
| OV-12 | Campus measurement: the first draw (fitted), a selection to lit, opening the busiest node, the drawer of an AGG; screenshots of Building 16, AGG-60 and SM1-HDF | `scale.spec.ts` (HI-12 amended) |

**Retired, with their successors:**

| Retired | Successor |
|---|---|
| CM-06 | OV-03, OV-05 |
| CM-07 | OV-04, OV-05 |
| CM-08 | none: the hops are gone |
| CM-10 | OV-07, OV-08 |

**Amended:**
- **HI-04:** the marks.
- **HI-06:** becomes OV-02.
- **HI-07:** `back()` goes.
- **HI-08:** becomes OV-11.
- **HI-12:** becomes OV-12.

## Review focus

- No mark, line or "cut off" comes from a name, and no selection feeds a trace.
- Building the up-graph and the hierarchy is once per snapshot. The selection is computed per selection, never per render.
- The marks on the map and Inventory's Problems agree, on the acceptance and the campus fixtures.
- Selecting never refits, and a refetch never remounts or refits (phase 1's rule).
- No stray Focus code is left: `focus.ts`'s remains live in `walks.ts` only.

## Steps

Stop for review after each step.

### 1. Marks and the up-graph (pure)

**Files:**
- **Modify:**
  - `frontend/src/features/map/hierarchy.ts` and `hierarchy.test.ts`;
  - `hierarchyFixture.ts` if a builder is missing;
  - `hierarchyDetails.ts` (`MARK_TEXT`) and its test;
  - `frontend/src/features/inventory/problems.ts` and `problems.test.ts`;
  - only what the type changes force on the screen, in phase 1's look: `hierarchyFlow.ts` and its test, `HierarchyNodeCard.tsx` ("2↑ N" instead of "N single"), `HierarchyCanvas.tsx` and `TierCard.tsx` (no `weak`; an AGG in `noTop` says "No BB uplink"), and `e2e/hierarchy.spec.ts` (its `single` and `data-weak` checks).

**Interfaces:**
- **Marks:** `UplinkMark` becomes `'chained' | 'no-uplink' | 'other-network'`.
- **`SwitchUplinks`:**
  - gains `peers: string[]`, the access switches of its network it is cabled to while both have an own way up;
  - gains `twoUplinks: boolean`, true for two or more ways up: its uplink circuits plus its `peers` (two cables to the same AGG count as two).
- **`HierarchyNodeCard`:** `single` is replaced by `twoUplinks: number`.
- **`NetworkHierarchy`:**
  - gains `noTop: ReadonlySet<string>`: the mid AGGs that reach no top while the network has one;
  - `counts.marked` includes them.
- **`TierLine.weak`** goes.
- **`ups`:** `NetworkHierarchy` gains `ups: ReadonlyMap<string, Circuit[]>`. It holds every active device's circuits toward the top: access switches to an AGG, BB or parent; AGGs to tops. It is built once, in `buildHierarchies`, from the walks it already makes. It is the graph that steps 3 and 4 read.

**Tests first:** OV-01, then HI-04 and HI-08 amended (OV-11), on `hierarchyFixture` snapshots and the acceptance fixture.

**Checks:** `npm test`, `npm run typecheck`, `npm run format:check`.

### 2. Left to right on the screen

**Files:**
- **Modify:**
  - `hierarchyLayout.ts`, `hierarchyFlow.ts` and `hierarchyFit.ts`, with their tests;
  - `HierarchyCanvas.tsx`, `HierarchyNodeCard.tsx`, `TierCard.tsx` (it becomes the frame of one or two AGG buttons, plus the BB card), `HierarchyPanel.tsx` and `map.css`;
  - the hierarchy e2e specs that read positions or the old marks (`hierarchy.spec.ts`, `hierarchy-trace.spec.ts`, `hierarchy.recording.spec.ts`).

**What it draws:**
- **Columns:** tops, frames, nodes, with the column heads.
- **Lines:** a line from each top to every frame whose AGGs it is cabled to (from `lines`), and one line from a frame to each of its cards.
- **Cards:** one row each: the name, the fault count, "2↑ N" and the switch count.
- **An open card** lists its switches (name, then the fault or the "2 uplinks" badge) and one quiet line for the node's switches on another frame or network.
- **"No BB"** shows on a frame's AGG.
- **Unchanged:** Only problems, plans (dashed) and the route lighting (`highlightedCards`, `hotCards`).

**Tests first:** OV-02, plus the projection tests for the frame, line and card shapes. The e2e specs are updated to the new layout.

**Checks:** `npm test`, `npm run typecheck`, `npm run format:check`, `npm run build`, and the hierarchy e2e specs. Screenshots: Network A and B on the acceptance fixture, the campus Network B.

### 3. The selection (pure)

**Files:**
- **Create:** `frontend/src/features/map/hierarchySelection.ts` and its test.
- **Modify:** `mapSession.ts` and `mapSession.test.ts`.

**Interfaces:**
- `type Selection = { kind: 'equipment'; id: string } | { kind: 'card'; key: string }`
- `litBy(hierarchies, index, selection): Lit`, where `Lit` holds:
  - `networkId`;
  - the sets `cards`, `frames`, `aggs`, `tops`, `switches` and `cutOff`;
  - `openCards: string[]`;
  - `scrollTo` (a card key).
- `dependents(hierarchies, index, id): { id: string; cutOff: boolean }[]`. It covers what hangs below a device through `ups`, and for a passive every switch with a circuit through it.
- `mapSession` **adds** `selection()`, `select(selection)` and `clear()`. Selecting opens nothing by itself: the canvas opens `Lit.openCards` through `toggleNode`, so the session stays free of hierarchy knowledge. `view`, `focusOn` and the rest stay until step 5, so the app keeps running.

**Tests first:** OV-03, OV-04, and the session part of OV-06.

**Checks:** as step 1.

### 4. Selection on the screen, and the drawer

**Files:**
- **Modify:**
  - `src/app/App.tsx`: `focusOnMap` becomes `showOnMap`, which calls `mapSession.select({ kind: 'equipment', id })`, still the one entry point;
  - `HierarchyCanvas.tsx` (lit and dim classes, open the cards, scroll to the selection, Esc, a click selects);
  - `HierarchyDrawer.tsx` and `hierarchyDetails.ts`, with its test;
  - `map.css`.
- **Create:** `frontend/e2e/one-view.spec.ts`.

**The drawer:**
- **Node:** keeps its summary, split, faults and two-uplink lists.
- **Equipment:**
  - one sentence;
  - **Way up:** one row per uplink, from `wayUp(hierarchies, index, id): WayStep[][]`. Its steps are port, passive (equipment and endpoint), device (with its fault), the tops, and a gap text.
  - **Depends on it:** from `dependents`.
  - **Cables (N):** each port and its far end, from `cables(index, id)`.
- **Actions:** Inspector, Find AGG / BB, Show in Physical. **No Focus.**
- **Chips:**
  - a passive chip opens the route view on that jack (the existing trace call for a passive start);
  - a device chip selects that device.

**Tests first:** OV-05; OV-07 to OV-09 seen failing, then the code.

**Checks:** everything in "Verifying" in way-of-work.md, with the whole e2e suite. Specs that still open Focus keep passing until step 5, because Focus still exists. Screenshots of EDGE-17 selected, HDF-01 selected, AGG-03's drawer, and Esc.

### 5. Focus retired, then measure and docs

**Files:**
- **Delete:** `FocusCanvas.tsx`, `focusLayout.ts`, `focusFlow.ts` and their tests.
- **Move:** `focus.ts`'s `equipmentWalks`, `EquipmentWalk` and `FocusStep` move to `walks.ts` as `WalkStep`. The rest of `focus.ts` and `focus.test.ts` goes, except the walk tests, which move to `walks.test.ts`.
- **Modify:**
  - `ConceptualMap.tsx`: no view switch;
  - `MapControls.tsx`;
  - `mapSession.ts`: remove the view, `MapMode`, the focus, the hops, `back` and the open groups;
  - `Inspector.tsx`: remove the Focus button and `onFocus`;
  - `App.tsx`;
  - the Inventory command labels if they still say Focus.
- **E2E:** every spec that reads `data-view="focus"`, "+1 hop" or the Focus button (grep `e2e/`); `focus.spec.ts` is deleted, and its still-valid cases move to `one-view.spec.ts`. `scale.spec.ts` follows OV-12.

**Tests first:** OV-10, and the session leftovers of OV-06.

**Then:**
1. **Measure:** the campus run (`SCALE=1 npx playwright test -c playwright.scale.config.ts`) for OV-12.
2. **Docs**, as in way-of-work.md:
   - `status.md` (the Conceptual map frontend text, the campus timings, the known limits);
   - `ui-spec.md` §3 and §5;
   - `acceptance-tests.md` (the OV rows, the retired and amended rows);
   - `testing.md`;
   - `architecture.md` if it names Focus;
   - `CLAUDE.md`'s map code map;
   - roadmap §1 (phase 2 done).
   - The plan moves to `docs/history/plans/`.

**Checks:** everything in "Verifying", with the whole e2e suite, plus `go test -race ./...` with the database (nothing changes there, but the fixture does).

## After the item

- **Commit:** phase 1, the realistic campus fixture, the batched seed and this item, when the owner says.
- **Deploy:** following `infra/compose/README.md`, "Update to a new version": back up first; no migration.
- **Check on real data:** the owner checks the tree on the test server before phase 3.
