# The frame on the left (A1) — Implementation Plan

> **For agentic workers:** process in [way-of-work.md](../way-of-work.md): a Sonnet subagent implements one task at a time, test first, never commits; Opus reviews each task.

**Goal:** the first half of D52 and [roadmap.md, "Queue after switch models", A](../roadmap.md) (the spec; read it with this plan), as in [the demo](../history/demos/frame-and-look-demo.html) (the reference for layout, wording and behaviour): the rail, the dock and Changes on the left, one heading on every page, and three small fixes. **A2** (the look's tokens, Plex files, the type and spacing scales, the dark theme) is a separate plan after this one ships; A1 keeps today's tokens.

**Architecture:** frontend, plus one API call (Task 4: delete a draft; no migration). The `.studio` grid becomes rail | dock | page; Changes moves from the header to the rail; a shared `PageHead` component gives every page the same heading; the path card's cable lines lose their IDs and open a small cable card; the node level and the site screen open by a click.

**Tech stack:** React + TypeScript; Vitest; Playwright on lanes (`npm run test:e2e:remote`).

## Global constraints

- Feature CSS uses only `var(--…)` (D33, `theme.test.ts`); names are `<Name>` pieces, never joined.
- Wording as in the demo: "Changes" (rail, with its count), "Go to cable", the cable card's fields; no "Open racks →".
- The Trace page and the models page stay full pages with no dock (D46); the trace's content does not change in A1 except that its cable lines share the path card's (no IDs, a click opens the cable card).
- Session stores, the tree's fit and Physical's face fit keep working with the dock on the left (the page still narrows; nothing covers it).
- Specs import from `e2e/fixtures.ts`. Do not commit.

## Review focus

- The dock open on the left at 1536×864: the tree, the rack level and the equipment page fit the narrower page (no horizontal scroll, the path card in the window).
- A popover (AddBox, ConnectPopover, CopyRackLayout, RowMenu) opened next to the dock stays inside the page and never under the dock (Task 1 test for AddBox and RowMenu).
- A site node card dragged 3px opens its racks; dragged 10px moves and saves once (Task 3 test).
- A mini rack block in a plan is still draggable to another rack (Task 3 test).
- Changes on the rail in Installed: hidden; in a stale draft: still opens Changes (Task 1 test).

---

### Task 1: the rail, the dock and Changes on the left

**Files:** `frontend/src/app/styles.css` (`.studio` grid 13–32, the header action 117–142, ≤600px 649–652), `frontend/src/features/frame/frame.css` (dock 2–12, ≤760px 122–128), `frontend/src/app/App.tsx` (header 318–372, rail 373–401), `features/frame/dock.ts` (+ test, if the tab order changes), `features/map/viewArea.ts` / `center.ts` (only if a test shows the dock is now read wrongly), the popovers' placement (`planning/AddBox.tsx:300`, `patching/ConnectPopover.tsx:60`, `planning/CopyRackLayout.tsx:70`, `inventory/RowMenu.tsx:67`) if they can land under the dock.

**What changes:**
- Grid `48px auto minmax(0,1fr)`: rail, dock, page. The dock's border moves to its right; its width becomes a token `--dock-w: 380px` in `theme.css`. Below 760px the fixed dock opens from the left (`inset: 0 auto 0 48px` or similar, never covering the rail).
- The rail: Add (plan only), Explore, Inspector, **Changes** (Layers icon; plan only, hidden in Installed; its count as a small badge on the icon; `aria-label` "Changes, N"; opens `dockSession.rail('changes')`, active when the Changes tab is open). The header loses its Changes button; its order is brand, views, network, Installed | Plan, environment.
- Every check that treats the dock as a right-side cover now treats it as left (`e2e/helpers.ts:140-160` already has a `left` branch).

- [ ] **Step 1: failing tests.** Update/extend `e2e/frame.spec.ts`: FR-01 (the rail has 4 buttons in a plan, 3 in Installed), FR-02 (the dock is between the rail and the page: `dock.x == rail.right`, `page.x == dock.right`), FR-06 (Changes is a rail button with the count; no Changes in the header), FR-08 (the surface's left = the dock's right), line 94 (closed: the page starts at the rail); `map.spec.ts:12-26`, `faceplates.spec.ts:364, 397`, `add-box.spec.ts:92, 204`, `polish.spec.ts:37-41`, `trace-page.spec.ts:84-95` (still no dock); new `D52-01` (at 1536×864 with the dock open: the tree, the rack level with a chosen unit and the equipment page have no horizontal scroll and the path card is in the window), `D52-02` (the AddBox and a RowMenu opened beside the open dock lie inside the page), `D52-03` (Changes on the rail: hidden in Installed, the count in a plan, opens in a stale draft).
- [ ] **Steps 2–4:** run them on the remote and see them fail; implement; `npm test`, typecheck, build, format:check, the whole suite on the remote.

### Task 2: one heading on every page

**Files:** create `frontend/src/shared/ui/PageHead.tsx` (+ the shared classes in `shared/theme.css`, `.page-head`); use it in `physical/EquipmentBar.tsx` (54–107), `physical/PhysicalExplorer.tsx` (455–484: sites, site), `physical/NodeLevel.tsx` (61–76), `physical/RackElevation.tsx` (210–213) and `RackLevel.tsx` (241, the chosen unit's head stays a card head), `trace/TracePage.tsx` (834, 482–496), `models/ModelsPage.tsx` (66–71), `inventory/InventoryPage.tsx` (384–390); dock panels keep `.dock-head` as the one panel heading (`frame/DockView.tsx:56-75`); remove the duplicates inside panels where the demo has none (e.g. ChangesDrawer's "Changes in this draft" label if the dock head says the same).

**Interfaces — produces:** `PageHead({ crumbs?: Crumb[]; back?: { label: string; onClick(): void }; title: ReactNode; meta?: ReactNode; actions?: ReactNode; testId?: string })` where `Crumb = { pieces: TextPiece[]; onClick?: () => void }`; renders a `header.page-head` with `nav.crumbs` (the current one `aria-current="page"`), `h1.page-title`, `p.page-meta` and `.page-actions`. One `h1` per page. Sizes from today's tokens (`--t-xs` crumbs, `--t-xl` title, `--t-sm` meta); A2 retunes them.

- [ ] **Step 1: failing tests:** a unit/DOM test for `PageHead` (crumbs, `aria-current`, one `h1`); `D52-04` browser: on the sites grid, a site, a node, a rack, an equipment page, the Trace page, the models page and Inventory, there is exactly one `h1.page-title` with the page's name, its breadcrumb above it and its actions on the right, all at the same font size and left position. Existing specs that select the old classes (`.crumb-here`, `[data-testid=trace-title]`, `.inv-title h1`, `.mp-title`, `.rack-heading h2`, `.node-level-head h2`) move to the new heading or keep their test IDs on it.
- [ ] **Steps 2–4:** as above.

### Task 3: the path card's cables, the node level, rack only by default and the site screen

**Files:** `paths/PathPlates.tsx` (`PathStepCell` 89–117; it is shared with `trace/TraceDrawing.tsx`), create `paths/CableCard.tsx` (+ CSS in `pathBar.css`), `paths/pathLine.ts` if the step needs the link's details, `physical/NodeLevel.tsx` (127–176), `physical/PhysicalExplorer.tsx` (547, 567), `physical/physicalSession.ts` (`chooseUnit`, `chosenUnit`; + test), `physical/RackLevel.tsx`, `RackElevation.tsx`, `physical/SiteCanvas.tsx` (99–169, 436, 677–691); specs.

**What changes:**
- **Cable lines:** the `span.cable-id` goes from the path card and the Trace drawing; the cable line becomes a button (`aria-label` "Cable <id>") that opens a small **cable card** beside it (`useInlineDialog`: Esc and focus return): its label or ID, network, status, notes, the two ends (equipment · port as `<Name>` pieces) and **Go to cable**, which opens Inventory's Cables list filtered to it (use Inventory's existing query/selection session; if a "go to cable" exists in `planning/goTo` or Inventory, reuse it).
- **Node level:** a click on a device block in a mini rack no longer opens its page: it calls `physicalSession.chooseUnit(rackId, equipmentId)` and opens the rack (the rack level shows that unit chosen). A click elsewhere on the mini rack opens the rack as today. In a plan the blocks stay draggable.
- **Rack only by default** (owner, 2026-11-26: "an option to see only the rack, without an equipment on the right"; then "rack only by default"; amends D50's chosen unit): opening a rack (from the node level, Explore, a breadcrumb or a search) shows **only the rack**, centred and wider (up to about 400px, so names read; units 12–26px as the room allows), with no unit beside it and no path card. **A click on a unit** shows it beside the rack with its face, its column and the path card as today; a click on the rack's empty space or Esc hides it again (rack only). A double-click or Open page opens its page. Coming **Back** from that page shows the rack with the same unit chosen; a mini rack's device click (above) opens the rack with that device chosen. `physicalSession`'s fallback to "the topmost unit with ports" goes: no unit is chosen unless one was clicked. In a plan every free unit stays a drop target and the add box opens beside the unit as now.
- **Site screen:** "Open racks →" goes. A click on a node card opens its racks (React Flow `onNodeClick`, with `nodeDragThreshold` 5 so a move under 5px is a click); a drag moves it and saves once at drag stop as today. The group links on the card keep their own clicks.

- [ ] **Step 1: failing tests:** a unit test for any pure helper (e.g. the cable card's rows); `D52-05` (the path card shows no cable IDs; a click on a cable line opens its card with the network and both ends; Go to cable opens Inventory's Cables with that cable; Esc closes and focus returns; the Trace drawing behaves the same), `D52-06` (node level: a click on EDGE-17's block opens Rack A03 with EDGE-17 chosen, not its page; in a plan the block still drags to another rack), `D52-09` (rack only by default: opening Rack A03 from the node level shows the rack alone, wider, with no unit and no path card; a click on EDGE-17 shows it beside the rack with the path card; Esc hides it; Back from EDGE-17's page shows it chosen again; a drop on a free unit in a plan opens the box), `D52-07` (site: a click on a node card opens its racks; a 3px drag opens them; a 10px drag moves the card and saves once; no "Open racks →"). Update the specs that use "Open racks of …" (11 specs and `e2e/helpers.ts:225`) to click the card, and `equipment.spec.ts:97` (block click now opens the rack). Specs that rely on a unit being chosen when a rack opens (`rack-level.spec.ts`'s topmost fallback, D50-07/08, and any that read a face or the path card right after opening a rack) click the unit first.
- [ ] **Steps 2–4:** as above.

### Task 4: delete a draft (backend and frontend)

The owner (2026-11-26): "I want the feature on the next version that we can remove drafts." Today a draft can only be recorded or left; nothing removes it.

**Files:** backend `internal/persistence` (plans: delete), `internal/httpapi/server.go` (route; + test), `api/openapi.yaml` (`DELETE /plans/{id}`), `frontend/src/shared/api.ts` (+ test), the plan chooser and the Changes panel (`app/App.tsx` wiring, `features/planning/ChangesDrawer.tsx` or where the plans are listed), specs.

**What it is (builder's proposal, to confirm with the owner):**
- `DELETE /api/plans/{id}` removes a **draft** and everything it holds (its commands, overlay and labels) in one transaction: `204`; `404` unknown; `409` for a **recorded plan** ("A recorded plan is history and is never deleted"). Installed and its revision never change; other drafts are untouched.
- **Delete draft…** in the plan chooser beside each draft and at the foot of the Changes panel; an inline confirm: "Delete the draft <name>? Its N changes are lost. Installed does not change." with Delete draft / Cancel (`useInlineDialog`). A stale draft can be deleted too.
- Deleting the draft you are in returns you to Installed. Someone else still in it gets "This draft was deleted" on their next edit or refetch (404) and goes back to Installed.

- [ ] **Step 1: failing tests:** persistence (DB): delete a draft with commands → gone with its rows, the installed revision and another draft unchanged; a recorded plan → refused. httpapi: 204, 404, 409. `api.test.ts`: the call. Playwright `D52-08`: in a fresh draft with two changes, Delete draft… from the Changes panel, confirm → back in Installed, the draft is gone from the chooser; a recorded plan has no Delete draft….
- [ ] **Steps 2–4:** as above, with `go test -race ./...` (DB tests on) and the OpenAPI lint.

### Task 5 (Opus): review at the owner's sizes, the docs

- Screenshots at 1536×864 and 1920×1080 with the dock closed and open on every view; a long Hebrew name in each page heading.
- Docs: `status.md`, `ui-spec.md` (§2 Shell, §4 Physical, the path card), `acceptance-tests.md` (D52-01…09), `CLAUDE.md` (the frame: rail | dock | page, Changes on the rail, `PageHead`, `CableCard`), `architecture.md` (a draft can be deleted; a recorded plan never). No migration.
