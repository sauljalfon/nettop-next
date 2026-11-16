# The workbench, part 2: the equipment page — Implementation Plan

> **For agentic workers:** this project's process is [way-of-work.md](../way-of-work.md): a Sonnet subagent started by Opus implements one task at a time, test first, and never commits; Opus reviews each task before the next. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Physical equipment page (switch, panel, HDF, rack item) as in the approved demo: one bar, one details line, the face right under it, the uplinks under a switch's face, and a port panel that opens only for a selected jack with its Connect / Disconnect actions first.

**Architecture:** frontend only; no API, schema or domain change. The equipment level of `PhysicalExplorer` draws one bar (`EquipmentBar`) instead of the Back + breadcrumb row, the scope note and the face card's header; a pure `rackNeighbours` gives ‹ ›; a small `MoreMenu` holds the rare actions and opens the existing confirms and forms. `RackStrip` leaves the page. `EndpointDetail` is shown only with a selection and puts `EndpointEdit` first.

**Tech Stack:** React + TypeScript, plain CSS with tokens (D33), Vitest, Playwright on lanes (`npm run test:e2e:remote`).

**Spec:** D43 and D44 in [decisions.md](../decisions.md), part 2 in [roadmap.md, "The workbench"](../roadmap.md#the-workbench-current-before-2b), and [the demo](../history/demos/workbench-demo.html) (HDF page and Switch 48 + 4: the bar, the "⋯" menu, the meta line, the uplinks strip under the face, the port in the dock).

## Global Constraints

- Screens fit **1536×864**; 1280×720 stays usable; at both, the bar never wraps onto two lines (long Hebrew names truncate with an ellipsis at their end).
- Feature CSS uses `var(--…)` only (`theme.test.ts`); names are `<Name>` / `PlacePath` pieces, never joined strings; specs import `test`/`expect` from `e2e/fixtures.ts`. Do not commit.
- Nothing the page can do today is lost: every action moves, none disappears. The keyboard on the face, the jack popover (Connect at a free jack in a plan) and Back history stay as they are.
- Copy, exactly: the menu button's aria-label "More actions"; menu items "Print sheet", "Duplicate…", "Show on map", "Delete…"; ‹ › aria-labels "Previous in this rack" and "Next in this rack" with the neighbour's name as their visible text; the port panel's close button aria-label "Close port".
- Other Physical levels (sites, a site, a node, a rack) keep their Back + breadcrumb row and scope note; only the equipment level changes.

## Review Focus

1. **A long Hebrew equipment, rack or neighbour name** in the bar: it truncates at its end, and Front/Rear, Pairs | Pigtails, Open in inventory and ⋯ stay on the bar's one line at 1280×720 (Task 1).
2. **The menu's keyboard**: ⋯ opens it, the arrow keys move between items, Escape closes it and focus returns to ⋯; Delete… and Duplicate… open the same confirm and form as before, and their Escape returns focus to ⋯ (Task 1).
3. **‹ › at the ends of a rack**: the first equipment has no ‹, the last no ›; a rack with one equipment has neither; rack items count as neighbours (they have pages); in a plan, proposed equipment counts (Task 1).
4. **Selecting and clearing a jack**: the page narrows when the port panel opens and widens when it closes (× or Escape on the panel); Back after closing still works (Task 2).
5. **A rack item's page** gets the same bar (no Front/Rear, no Pairs | Pigtails, no Print sheet if it has none today) and keeps "No ports" and its details (Task 3).

---

### Task 1: The bar, the details line and the "⋯" menu

**Files:**
- Create: `frontend/src/features/physical/EquipmentBar.tsx`, `frontend/src/features/physical/MoreMenu.tsx`
- Modify: `frontend/src/features/physical/elevation.ts` (or a new pure module): `rackNeighbours(inv: Inventory, rackId: string, equipmentId: string): { previous?: string; next?: string }` — previous is the equipment drawn just above in the rack (the next higher unit), next the one just below; with its unit test
- Modify: `PhysicalExplorer.tsx` (the equipment level draws `EquipmentBar` instead of the Back + breadcrumb row and the scope note), `EquipmentPage.tsx` (no `RackStrip`; the details line; the face without its card header), `FaceView.tsx` (a `headless` prop: no face-card header and no buttons, legend kept), `physical.css`
- Test: the pure module's test, `frontend/e2e/physical.spec.ts` or a new `frontend/e2e/equipment-page.spec.ts`

**Interfaces:**
- `EquipmentBar` props: the breadcrumb pieces (as today), `onBack`, the neighbours (ids and names) and `onOpen(id)`, the side (or none), `onSide`, `numbering` controls for an HDF (the existing `NumberingSwitch`), `onOpenInventory`, the menu items, and `proposed` (the Proposed chip next to the name).
- `MoreMenu`: a button (aria-label "More actions", aria-haspopup "menu", aria-expanded) and a `role="menu"` list of `role="menuitem"` buttons; closes on a choice, Escape and a click outside, focus back to the button (the `useInlineDialog` pattern). Items: Print sheet (when printable), Duplicate… (plan, switch/panel/HDF as today), Show on map, Delete… (plan). Duplicate… and Delete… open the existing `DuplicateEquipment` / `DeleteEquipment` box (rendered under the bar, `where="page"` unchanged).
- The details line: the existing `faceMeta` pieces (kind, size, height and unit, role and network, free count) and the place as `PlacePath`.

- [ ] **Step 1: Failing tests.** Unit: `rackNeighbours` (middle, first, last, alone, a rack item between, proposed equipment in a plan). E2E at 1536×864 (EP-01…EP-05):
  - `EP-01 one bar`: on HDF-01 the bar holds Back, the breadcrumb, Front/Rear, Pairs | Pigtails, Open in inventory and More actions, all with the same `y` (one line); no `scope-note`, no `RackStrip`, no face-card header; the details line shows "HDF" and the place.
  - `EP-02 ‹ › step through the rack`: on EDGE-17 in Rack A03, "Next in this rack" names and opens the equipment below, "Previous in this rack" the one above; the first and last have only one of them.
  - `EP-03 the ⋯ menu`: Installed shows Print sheet and Show on map only; in a plan also Duplicate… and Delete…; Delete… opens the same confirm as before; Escape in the menu closes it with focus on More actions; Print sheet still produces the sheet (as its existing spec checks).
  - `EP-04 the bar fits at 1280×720 with a long Hebrew name`: a proposed HDF named `לוח-ניתוב-ראשי-בניין-שתים-עשרה-קומה-שלישית` in Rack A03: the bar's controls share one `y` and none is outside the viewport.
  - `EP-05 the face is right under the details line`: on EDGE-17 the face's top is within 60px of the bar's bottom.
  Update existing specs only where a selector moved (the Print sheet and Open in inventory buttons, Duplicate/Delete on the page, the breadcrumb at the equipment level, the rack strip); never what they check about behaviour.
- [ ] **Step 2: Run** the unit test and `npm run test:e2e:remote -- e2e/<new spec>.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, then the whole suite, `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
- [ ] **Step 5: Screenshots** at 1536×864 and 1280×720 into `test-results/workbench-2/`: HDF-01, EDGE-17, the menu open in a plan, the long Hebrew name.

### Task 2: The port panel and the uplinks under the face

**Files:**
- Modify: `EquipmentPage.tsx`, `EndpointDetail.tsx`, `UplinksSummary` (placement only), `physical.css`
- Test: the Task 1 e2e spec (EP-06…EP-08)

- [ ] **Step 1: Failing tests.**
  - `EP-06 the port panel opens only for a selected jack`: on HDF-01 with nothing selected there is no `endpoint-detail`; a click on a jack opens it and the face's area narrows; "Close port" (and Escape inside the panel) closes it, clears the selection and the face widens back.
  - `EP-07 the port's actions come first`: in a plan, a free jack's panel starts with Connect… and Connect a range…, a cabled one with Disconnect…, above the cable, far end and details.
  - `EP-08 a switch's uplinks are under its face`: on EDGE-17 the Uplinks list's top is below the face's bottom; a row still selects its port.
- [ ] **Step 2–4:** run (FAIL), implement, run the specs and the whole suite and the checks.
- [ ] **Step 5: Screenshots**: EDGE-17 with a port selected, HDF-01 with a cabled position selected in a plan.

### Task 3: A rack item's page

- [ ] The same bar (no Front/Rear, no Pairs | Pigtails; the menu has what applies today) and details line; "No ports", the details and Delete… stay reachable. A failing e2e first (`EP-09`), then the change, then the rack-items spec and the whole suite.

### Task 4: Docs, the full run, the owner's check

- [ ] The whole suite and the checks; `docs/status.md` (the equipment page; the Now / Next box), `docs/ui-spec.md` (Equipment), the roadmap's part 2 marked built; the owner reviews, then merge, push and deploy (no migration).
