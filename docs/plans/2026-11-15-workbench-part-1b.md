# The workbench, part 1b: HDF faces — Implementation Plan

> **For agentic workers:** this project's process is [way-of-work.md](../way-of-work.md): a Sonnet subagent started by Opus implements one task at a time, test first, and never commits; Opus reviews each task before the next. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HDF jacks at 32px, every HDF drawn with its highest row at the top, and a Pairs | Pigtails choice per person, on the HDF page and in patching.

**Architecture:** frontend only; no API, schema or domain change. The row order is a drawing rule in `FaceView` and `faceNav` (data, labels and range order are untouched). Pairs | Pigtails is a small browser-remembered store (like `inventory/savedViews`), read by `FaceView` for the jack text and by patching for the jack names it lists; the fibers come from `fiberPair` in `faces.ts` and the subpanel's row and column, never from parsing a label.

**Tech Stack:** React + TypeScript, plain CSS with tokens (`src/shared/theme.css`, D33), Vitest, Playwright on lanes (`npm run test:e2e:remote`).

**Spec:** D44 in [decisions.md](../decisions.md), part 1b in [roadmap.md, "The workbench"](../roadmap.md#the-workbench-current-before-2b), and [the demo](../history/demos/workbench-demo.html) (HDF page and Patching; sizes and look come from it).

## Global Constraints

- Screens fit **1536×864**; 1280×720 stays usable. Specs set `page.setViewportSize({ width: 1536, height: 864 })` unless they say otherwise.
- HDF jacks **32×32**, number **13px** mono (`var(--t-sm)`); token `--jack-hdf: 32px`. Switch and panel jacks stay 28×30. Nothing under 11px.
- **Highest row at the top**, always, on every HDF face (equipment page, patching, anywhere `FaceView` draws an HDF). Only the drawing: a block keeps its label ("3C"), its endpoints, its cables and its place in range order (`range.ts` unchanged).
- **Pairs | Pigtails**: a segmented control (group aria-label "Numbers", buttons "Pairs" and "Pigtails"), remembered in `localStorage` under `net-top-next.hdf-numbering` (`'pairs'` | `'pigtails'`, default `'pairs'`; every read and write in try/catch; with storage blocked it lasts for the session). Pigtails: position p shows `2p-1` over `2p` in the same jack; a jack is named "3C / 9,10" where patching lists it (the pairs list, the status line, Made here).
- Feature CSS uses `var(--…)` only (`theme.test.ts`). Names are `<Name>`/`PlacePath` pieces. Specs import `test`/`expect` from `e2e/fixtures.ts`. Do not commit.

## Review Focus

1. **Keyboard after the flip:** ArrowUp moves to the row drawn above (a higher row number), ArrowDown to the one below; Home is the first jack drawn (top-left), End the last (Task 1).
2. **Patching still fits:** HDF-01 → HDF-02 at 1536×864 with no sideways scroll in either pane body, and Connect, Undo last, Done reachable at 1280×720 (Task 1; PT-02 and PT-03 keep passing).
3. **A 32-row HDF** starts scrolled to its top (row 32 visible first) and keeps its sticky letters and row numbers (Task 1, PB-05b).
4. **Storage blocked** (private window): the switch still works for the session and nothing throws (Task 2 unit test).
5. **Range order is unchanged by the flip:** a range from 2B/1 still runs 2B/1…2B/6 then 2C/1 (Task 1, BK specs keep passing).

---

### Task 1: 32px jacks and the highest row on top

**Files:**
- Modify: `frontend/src/shared/theme.css` (`--jack-hdf: 32px`), `frontend/src/features/physical/physical.css` (HDF jack number `var(--t-sm)`; the HDF grid's first column wide enough for "32")
- Modify: `frontend/src/features/physical/FaceView.tsx` (rows drawn from `face.face.rows` down to 1)
- Modify: `frontend/src/features/physical/faceNav.ts` (`navCells` for an HDF: the drawn row index is `(rows - block.row) * 2 + …`)
- Test: `frontend/src/features/physical/faceNav.test.ts`, `frontend/e2e/hdfplate.spec.ts` (PB-05, PB-05b), `frontend/e2e/patching.spec.ts`

- [ ] **Step 1: Failing tests.**
  - `faceNav.test.ts`: `it('draws the highest HDF row at the top: ArrowUp from row 1 goes to row 2')` and `it('Home is the first jack of the highest row')` on the full-HDF fixture (`withFullHdf`).
  - `hdfplate.spec.ts` PB-05: `hdf-01:sp-3C:5:f` within 1px of 32×32, its number's font-size 13px.
  - `hdfplate.spec.ts` new `PB-06 every HDF draws its highest row at the top`: on HDF-01 the first `.hdf-row` reads its row count and the last reads "1"; block "1A" is below block "2A" on screen; the 32-row draft (`planWith32RowHdf`) shows "32" first.
  - PB-05b keeps its checks (sticky letters and row numbers while the face scrolls, the page does not scroll); adjust only what it assumed about row 1 being first.
  - `patching.spec.ts` new `PT-08 both HDFs fit their panes at 32px`: HDF-01 → HDF-02 at 1536×864, each pane body `scrollWidth <= clientWidth`.
- [ ] **Step 2: Run** `npx vitest run src/features/physical/faceNav.test.ts` and `npm run test:e2e:remote -- e2e/hdfplate.spec.ts e2e/patching.spec.ts`. Expected: the new tests FAIL (22px, row 1 first).
- [ ] **Step 3: Implement** as in Files. The DOM order follows the drawing (highest row first), so tab order and screen readers read what is seen.
- [ ] **Step 4: Run** the same, then `npm run test:e2e:remote` (the whole suite: range, editing, visual-pass and scale specs also draw HDFs; change a spec only where it assumed row 1 on top or the 22px size, never what it checks about behaviour), `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
- [ ] **Step 5: Screenshots** at 1536×864 into `test-results/workbench-1b/`: HDF-01 page, the 32-row HDF, patching HDF-01 → HDF-02 with a range of 6.

### Task 2: Pairs | Pigtails

**Files:**
- Create: `frontend/src/features/physical/hdfNumbering.ts` (the store) and `hdfNumbering.test.ts`
- Modify: `frontend/src/features/physical/faces.ts` (a pure `hdfJackText(position, numbering)` and `hdfJackName(blockLabel, position, numbering)`), `faces.test.ts`
- Modify: `frontend/src/features/physical/FaceView.tsx` (the jack text), `EquipmentPage.tsx` (the control next to Front / Rear, HDF only), `physical.css` (stacked numbers)
- Modify: `frontend/src/features/patching/PatchingScreen.tsx` (the control in the top bar; HDF jack names in the pairs list, status line and Made here), `patching.css`
- Test: `frontend/e2e/hdfplate.spec.ts`, `frontend/e2e/patching.spec.ts`

**Interfaces:**
- `type HdfNumbering = 'pairs' | 'pigtails'`; `hdfNumbering(): HdfNumbering`, `setHdfNumbering(n: HdfNumbering): void`, `useHdfNumbering(): HdfNumbering` (`useSyncExternalStore`), storage key `net-top-next.hdf-numbering`.
- `hdfJackText(position: number, n: HdfNumbering): string[]` → `['5']` or `['9', '10']`; `hdfJackName(block: string, position: number, n: HdfNumbering): string` → `'3C / 5'` or `'3C / 9,10'` (from `fiberPair`). Patching uses `hdfJackName` only for HDF endpoints (found through the subpanel), and the label as today for switches and panels.

- [ ] **Step 1: Failing tests.**
  - `hdfNumbering.test.ts`: default `'pairs'`; set and read back; a stored `'pigtails'` is read on start; with `localStorage` throwing, set still changes the value for the session and nothing throws; an unknown stored value reads as `'pairs'`.
  - `faces.test.ts`: `hdfJackText(5, 'pigtails')` is `['9', '10']`, `hdfJackText(5, 'pairs')` is `['5']`; `hdfJackName('3C', 5, 'pigtails')` is `'3C / 9,10'`.
  - `hdfplate.spec.ts` new `PB-07 Pairs | Pigtails changes the numbers and is remembered`: on HDF-01 "Pigtails" makes `hdf-01:sp-3C:5:f` read "9" and "10" stacked within its 32px box (both lines inside the jack's box) while its accessible name keeps the block and position; a reload keeps Pigtails; "Pairs" brings back "5"; a switch page shows no Numbers group.
  - `patching.spec.ts` new `PT-09 Pigtails names HDF jacks by their fibers in patching`: with Pigtails on (set on the HDF page first, so it is remembered), a range of 2 from HDF-01 2B/1 rear lists "2B / 1,2" and "2B / 3,4" on the near side, and the status line names the start the same way; the top bar's Numbers group changes it back to pairs.
- [ ] **Step 2: Run** `npx vitest run src/features/physical/hdfNumbering.test.ts src/features/physical/faces.test.ts` and `npm run test:e2e:remote -- e2e/hdfplate.spec.ts e2e/patching.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Stacked numbers: two lines at 13px inside the 32px jack, the same mono and colours as Pairs; the hatch pill of a reserved/disabled/faulty jack wraps both lines.
- [ ] **Step 4: Run** the same, then the whole e2e suite, `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
- [ ] **Step 5: Screenshots** at 1536×864 into `test-results/workbench-1b/`: HDF-01 with Pigtails, patching with Pigtails and a range of 6.

### Task 3: Docs, the full run, and the owner's check

- [ ] **Step 1:** The whole suite and the checks, as above; report the counts.
- [ ] **Step 2:** `docs/status.md` ("The workbench, part 1" gains part 1b: the 32px jacks, the row order, Pairs | Pigtails; the Now / Next box), `docs/ui-spec.md` (the HDF face), the roadmap's part 1b marked built.
- [ ] **Step 3:** Opus reviews; the owner says when to commit, merge, push and deploy (no migration), then checks the HDFs on their real data before part 2.

### Task 2b: The printed sheet follows (owner, 2026-11-15)

The owner answered that the printed HDF sheet also puts the highest row on top. After Task 2, the HDF print sheet (Print sheet on the HDF page) lists or draws its rows from the highest down to row 1, the same rule as the face; cables, labels and what the sheet says about each position are unchanged. A failing test first (the sheet's first row is the highest), then the change, then the sheet's existing specs.
