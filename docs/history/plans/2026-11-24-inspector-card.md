# A trace is the Trace page; the Inspector is a short card — Implementation Plan

> **For agentic workers:** process in [way-of-work.md](../../way-of-work.md): a Sonnet subagent implements one task at a time, test first, never commits; Opus reviews each task.

**Goal:** D49 and [roadmap.md, "The inspector as a short card"](../../roadmap.md). Frontend only; the API is unchanged.

## Global constraints

- Reuse what exists: the Trace page (`features/trace/`) as built, `PlacementEditor`, `HistoryTab`, `EquipmentDetails`, the ⋯ `MoreMenu` and its box under the bar (Duplicate…), `LocationPicker`.
- Keep: the teal route on the tree and in Physical, the rerun across Installed ↔ Plan (`traceSession`), every place that starts Find AGG / BB, Inventory's Delete… / Disconnect… confirms (`OpenRequest`), D47 and D48.
- Feature CSS uses `var(--…)` only; specs import from `e2e/fixtures.ts`; names are `<Name>`/`PlacePath` pieces. Do not commit.

### Task 1: A trace is the Trace page

**Files:** `App.tsx` (every trace start opens the Trace page on All routes; no Trace tab; the route chip), `features/frame/dock.ts` (+ test: no `trace` tab; D47's trace state goes), `features/frame/TraceTab.tsx` deleted (what still matters moves to the page: a failed trace's error with Refresh topology), `features/trace/TracePage.tsx` (opens on All routes when started by Find AGG / BB), a new `RouteChip` (e.g. `features/trace/RouteChip.tsx`) shown at the top of the tree and of Physical while a route is chosen and the page is closed; e2e: `trace-tab.spec.ts` goes or becomes the chip's spec; specs that read the Trace tab read the Trace page instead.

- [ ] **Step 1: Failing tests:** `dock.test.ts` (no trace tab); Playwright `D49-01 Find AGG / BB from a switch opens the Trace page on All routes`, `D49-02 ← Back keeps the route lit and shows the route chip; the chip reopens the page; × clears the trace and the teal`, `D49-03 a failed trace shows on the Trace page with Refresh topology`, `D49-04 Find AGG / BB from a jack in Physical opens the page; Back returns to the jack with the chip`.
- [ ] **Steps 2–4:** run (FAIL), implement, all checks and the whole e2e suite.

### Task 2: The Inspector is a short card; History and Move… go to the equipment page

**Files:** `features/inspector/Inspector.tsx` (the card; no tabs, port table, details editor, placement form, history; keeps the `OpenRequest` confirms), `Overview.tsx`/`PortTable.tsx` (deleted if unused), `features/physical/PhysicalExplorer.tsx` / `EquipmentBar.tsx` (⋯ menu: History, Move to another rack… in a plan), `features/frame/dock.ts` (+ test: a `history` tab while open), `App.tsx` (Explore port/cable hits open the jack on its equipment page); e2e: the inspector specs follow the card; History and Move… specs move to the equipment page.

- [ ] **Step 1: Failing tests:** Playwright `D49-05 the Inspector of EDGE-17 is a card: name, role, network, where, 3 of 24 cabled, way up, model, four actions; no tabs`, `D49-06 ⋯ History opens the History tab with the direct fixes and recorded plans`, `D49-07 in a plan ⋯ Move to another rack… moves EDGE-17 to Rack SM01 (Installed: disabled, "Open a plan first")`, `D49-08 Inventory's Delete… and Disconnect… still confirm`, `D49-09 an Explore port hit opens that jack on its page`.
- [ ] **Steps 2–4:** run (FAIL), implement, all checks and the whole e2e suite.

### Task 3 (Opus): the docs


## Design (from the roadmap): The inspector as a short card (done; approved 2026-11-24 from [the demo](../demos/inspector-card-demo.html), D49)

Owner, 2026-11-24, from the demo: the card "I like"; Find AGG / BB should "open the tracing thing with all the traces" (the real Trace page, "what we had", not a new drawing) and the dock's Trace tab goes; answers: the page opens on All routes; after Back a route chip reopens it or clears it; History a dock tab; Move… in the ⋯ menu; the card keeps Way up and Model; the Inspector stays on Physical ("we shouldn't remove every useful feature"). [Plan](2026-11-24-inspector-card.md).

- **Trace:** Find AGG / BB opens the Trace page on All routes; no Trace tab. ← Back / Show on map: the route stays lit, a route chip at the top of the tree and of Physical ("Route: … → …"; click reopens the page, × clears). A failed trace shows on the Trace page with Refresh topology.
- **The card** (dock Inspector, every view): name, role, network, where (site, node and rack open Physical), "N of M cabled", way up, model; Find AGG / BB (switches), Open in Physical, Show on map, Open in inventory. Inventory's Delete… / Disconnect… confirm in it as today.
- **Equipment page ⋯ menu:** History (a dock tab: direct fixes and recorded plans), Move to another rack… (a plan only; Site › Node › Rack and the lowest unit, under the bar), Print sheet, Duplicate…, Show on map, Delete….
- **Explore:** a port or cable hit opens that jack on its equipment page.
