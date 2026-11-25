# A trace is the Trace page; the Inspector is a short card — Implementation Plan

> **For agentic workers:** process in [way-of-work.md](../way-of-work.md): a Sonnet subagent implements one task at a time, test first, never commits; Opus reviews each task.

**Goal:** D49 and [roadmap.md, "The inspector as a short card"](../roadmap.md). Frontend only; the API is unchanged.

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
