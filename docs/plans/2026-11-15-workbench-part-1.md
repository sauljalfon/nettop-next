# The workbench, part 1: compact faceplates and the patching page — Implementation Plan

> **For agentic workers:** this project's process is [way-of-work.md](../way-of-work.md): a Sonnet subagent started by Opus implements one task at a time, test first, and never commits; Opus reviews each task before the next. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** jacks drawn at the compact sizes of D43 on every face (equipment page and patching), switch port groups on one line with uplinks marked ↑, and the patching screen turned into a full page whose Connect, Undo last and Done are always reachable.

**Architecture:** frontend only; no API, schema or domain change. `faces.ts`/`faceNav.ts` get a column count so the same bank layout drives drawing and keyboard; `FaceView` gets compact CSS, sticky HDF labels, an ↑ mark and a `bare` mode for patching; `PatchingScreen` is restructured into a full-window page (top bar, two panes, a pairs column, one bottom bar), with the far end collapsed into a button and Done asking when pairs are waiting.

**Tech Stack:** React + TypeScript, plain CSS with tokens (`src/shared/theme.css`, D33), Vitest, Playwright on lanes (`npm run test:e2e:remote` runs on the test machine).

**Spec:** [roadmap.md, "The workbench"](../roadmap.md#the-workbench-current-before-2b), D43 in [decisions.md](../decisions.md), and [the demo](../history/demos/workbench-demo.html) (open it beside this plan: sizes and copy come from it).

## Global Constraints

- The size every screen must fit is **1536×864**; 1280×720 stays usable. Browser tests of this part set `page.setViewportSize({ width: 1536, height: 864 })` unless they say otherwise.
- Jack sizes: **HDF 22×22, 2px gaps, 11px mono number; switch and panel 28×30.** Numbers never below 11px (D33).
- Colours, fonts and sizes live only in `src/shared/theme.css`; feature CSS uses `var(--…)` only (`theme.test.ts` guards it). New tokens: `--jack-hdf: 22px`, `--jack-w: 28px`, `--jack-h: 30px`, `--jack-gap: 2px`.
- Names are always `<Name>`/`PlacePath` pieces, never joined strings (D32, D33).
- Specs import `test`/`expect` from `e2e/fixtures.ts`. Do not commit.
- Copy, exactly: "Close without connecting", "Connect {N} and close", "{N} pairs are not connected yet." ("1 pair is not connected yet."), "The numbered pairs are a preview. Nothing is saved until you connect them.", "in plan {plan name} · each cable is saved to the plan at once", aria-label "Change far end", aria-label "Pairs and made here".

## Review Focus

1. **A 32-row HDF in patching**: one scroll per pane, the A–D letters and row numbers stay visible while scrolling, no scrollbar inside a scrollbar (Task 2 test PB-05b, Task 3 test PT-03).
2. **Long Hebrew far-end names** in the collapsed far-end button: it truncates with an ellipsis inside the pane head and never pushes Front/Rear off (Task 4, PT-05 asserts the Front/Rear group stays inside the pane).
3. **Escape** while the Done question or the far-end picker is open closes only that, not the page (Tasks 4 and 5).
4. **Keyboard on the faces** after the layout change: arrows follow what is seen across banks on one line (Task 1 unit tests, Task 2 PG-04).
5. **1280×720**: the bottom bar's buttons stay reachable (Task 3, PT-02 runs at both sizes).

---

### Task 1: Bank layout and keyboard by column count

**Files:**
- Modify: `frontend/src/features/physical/faces.ts` (`FACE_COLUMNS`, `layoutPlate`)
- Modify: `frontend/src/features/physical/faceNav.ts` (`navCells`)
- Test: `frontend/src/features/physical/faces.test.ts`, `frontend/src/features/physical/faceNav.test.ts`

**Interfaces:**
- Produces: `export const FACE_COLUMNS = 28` (was 15); `export const PATCHING_COLUMNS = 14`; `layoutPlate(banks: readonly SwitchBankGroup[], columns: number = FACE_COLUMNS): PlateUnit[][]`; `navCells(face: Face, columns: number = FACE_COLUMNS)`. Everything else in these files is unchanged.

- [ ] **Step 1: Write the failing tests** in `faces.test.ts`, next to "puts 24 + 4 in one row…", with the file's existing `shape` helper and grouped-switch fixture:
  - `it('puts 48 + 4 on one row at the default width')`: `shape(layoutPlate(banks48plus4))` has one row with three units of 24, 24 and 4 ports.
  - `it('wraps 48 + 4 at the patching width')`: `layoutPlate(banks48plus4, PATCHING_COLUMNS)` gives three rows of one unit each (24, 24, 4).
  - `it('keeps a switch without groups as one strip')`: unchanged result for EDGE-17 at both widths.
  In `faceNav.test.ts`: `it('moves right from Gi1/0/47 to Te1/1/1 across the gap on one row')` and `it('moves right from the last top jack of the first block to the first of the second')` (p23 → p25), both at the default width.
- [ ] **Step 2: Run** `npx vitest run src/features/physical/faces.test.ts src/features/physical/faceNav.test.ts`. Expected: the new tests FAIL (48 + 4 wraps at 15 columns).
- [ ] **Step 3: Implement** the `columns` parameter in `layoutPlate` (replace `FACE_COLUMNS` in the fit check with it) and pass it through `navCells` to `layoutPlate`.
- [ ] **Step 4: Run** the same command. Expected: PASS; then `npm test` all green.

### Task 2: Compact faces on every page

**Files:**
- Modify: `frontend/src/shared/theme.css` (the four tokens above)
- Modify: `frontend/src/features/physical/physical.css` (`.plate-ports`, `.plate-strip`, `.face-cell.jack`, `.hdf-*`)
- Modify: `frontend/src/features/physical/FaceView.tsx`
- Test: `frontend/e2e/hdfplate.spec.ts` (PB-05 rewritten, PB-05b new; the `.link-dot` assertions at lines 87–90), `frontend/e2e/faceplates.spec.ts` (`.link-dot` at 173–174), `frontend/e2e/portgroups.spec.ts` (PG-04 rewritten)

**Interfaces:**
- Consumes: Task 1's `layoutPlate(banks, columns)`, `navCells(face, columns)`.
- Produces: `FaceView` props `columns?: number` (default `FACE_COLUMNS`, passed to both `layoutPlate` and `navCells`) and `bare?: boolean` (no `face-card` header, no legend, no own HDF scroll: the parent scrolls). A jack whose endpoint is in `uplinkIds` renders `<span className="uplink-arrow" aria-hidden="true">↑</span>`; the `.link-dot` and the slot bar (`::before`) are gone (the fill already says cabled).

- [ ] **Step 1: Write the failing tests.**
  - `PB-05 jacks are 28×30 on a switch and a panel and 22×22 on an HDF, numbers at least 11px` at 1536×864: `edge-17:p1` width and height within 1px of 28 and 30; `panel-a:1:f` width within 1px of 28; `hdf-01:sp-3C:5:f` width and height within 1px of 22; font-size ≥ 11 on both.
  - `PB-05b a 32-row HDF scrolls inside its face and keeps its letters and row numbers in view`: on the 32-row draft (existing `planWith32RowHdf`), scroll `.hdf-scroll` down 600px; the `.hdf-col` "A" box's top is within the scroller's visible top 40px, and the `.hdf-row` "1" is no longer visible while a row ≥ 10 is; the page itself does not scroll (`document.scrollingElement.scrollTop === 0`).
  - `PG-04 48 + 4 sits on one row with the uplinks to the right` (replaces the wrap test): `bank-row` count 1; three `port-bank`s with the uplinks' x right of the second block; captions unchanged; ArrowRight from p47 focuses p49; ArrowRight from p23 focuses p25.
  - In `faceplates.spec.ts` and `hdfplate.spec.ts`, replace the `.link-dot` checks with `data-state` checks (`cabled` / `free`) and add: `edge-17:p1` contains `.uplink-arrow`, `edge-17:p4` does not.
- [ ] **Step 2: Run** `npm run test:e2e:remote -- e2e/hdfplate.spec.ts e2e/faceplates.spec.ts e2e/portgroups.spec.ts`. Expected: the new and changed tests FAIL on size, wrap and the arrow.
- [ ] **Step 3: Implement.** Sizes from the tokens. HDF: `.hdf-grid` columns `22px repeat(4, max-content)`, gaps `5px 6px`; `.hdf-module` padding 3px with no `<code>` caption (keep the block's `data-block` and title); `.hdf-positions` `repeat(3, var(--jack-hdf))` with `var(--jack-gap)`; `.hdf-col` `position: sticky; top: 0` and `.hdf-row` `position: sticky; left: 0`, both with the steel background so jacks pass under them; the HDF faceplate's `overflow: hidden` becomes `visible` so sticky follows `.hdf-scroll`. `.hdf-scroll` max-height becomes `calc(100vh - 330px)` (the page above the grid at 864). Occupied jack: network fill (already) with `color: var(--paper)`. In `bare` mode `.hdf-scroll` has no max-height and no overflow.
- [ ] **Step 4: Run** the step 2 command, then the whole suite `npm run test:e2e:remote`. Expected: all PASS. Fix every other spec that measured the old sizes only where it asserted a size; never change what a spec checks about behaviour.
- [ ] **Step 5: Screenshots** at 1536×864 into `test-results/workbench-1/`: EDGE-17, PANEL-A, HDF-01, the 32-row HDF scrolled, a 48 + 4 switch. Report what they show.

### Task 3: Patching as a full page

**Files:**
- Modify: `frontend/src/features/patching/PatchingScreen.tsx`, `frontend/src/features/patching/patching.css`
- Modify: `frontend/src/features/patching/PatchingHost.tsx`, `frontend/src/app/App.tsx:1098` (pass `planName={plan?.name}`)
- Test: `frontend/e2e/patching.spec.ts` (new PT-01…PT-03), `frontend/e2e/patching-helpers.ts`

**Interfaces:**
- Consumes: `FaceView` `bare` and `columns={PATCHING_COLUMNS}` (Tasks 1–2).
- Produces: `PatchingHost` and `PatchingScreen` take `planName?: string`. DOM kept for the specs: `data-testid="patching"` on the page root (role `dialog`, aria-modal, as today), regions `From` and `To`, `range-pairs`, `patching-made`, groups `Mode` and the count input `Count`. New: `aside` with aria-label "Pairs and made here" holding `range-pairs` and `patching-made`, a toggle button "Collapse" / "Expand" in it.

Layout (from the demo): the root covers the whole window (`position: fixed; inset: 0`, paper, no scrim, no radius); rows `44px minmax(0,1fr) 52px`; the top bar holds "Patching", "in plan {name} · each cable is saved to the plan at once" and the existing × (aria-label "Close patching"); the middle is `minmax(0,1fr) minmax(0,1fr) auto` (From pane, To pane, the 270px pairs column, 36px when collapsed); each pane is a 40px head (From/To, the equipment name, its place, Front/Rear for a panel or HDF) over a body that is the only scroll (`overflow: auto`) holding the bare face; the bottom bar holds Mode, Count (range), Skip (when blocked), the status line (today's hint or "From …, N pairs."), Undo last, Done, and Connect / Connect N at the right as the primary. One at a time keeps its "Next: … → …" in the status line with its Connect.

- [ ] **Step 1: Write the failing tests** in `patching.spec.ts` (open the screen as `range.spec.ts`'s `openEdge19` does, via a helper moved to `patching-helpers.ts` as `openPatching(page, request, {equipment, endpoint, mode})`):
  - `PT-01 patching fills the window and names the plan`: the `patching` box equals the viewport (0, 0, 1536, 864 within 1px); its text contains "in plan" and the draft's name.
  - `PT-02 Connect, Undo last and Done are on the bottom bar and reachable` at 1536×864 and again at 1280×720, HDF-01 → HDF-02 range of 6: for each of `Connect 6`, `Undo last`, `Done`, `elementFromPoint` at its centre is inside it (the check `range.spec.ts` already uses); the three share one `y` within 2px.
  - `PT-03 each face scrolls in its own pane and the page does not`: in the From pane on HDF-01, the pane body scrolls (`scrollHeight > clientHeight`), `.hdf-scroll` does not, and the root does not.
  - Update `chooseFar` and every spec that opened the screen differently only where a selector changed.
- [ ] **Step 2: Run** `npm run test:e2e:remote -- e2e/patching.spec.ts e2e/range.spec.ts`. Expected: PT-01…03 FAIL.
- [ ] **Step 3: Implement** the layout above in `PatchingScreen.tsx` and `patching.css` (rewrite `.patching-scrim`, `.patching`, `.patching-cols`, `.patching-foot`; jack tones keep their look at the new size: pair amber fill with the number badge, blocked red ring, made-here teal ring, next dashed paper outline).
- [ ] **Step 4: Run** `npm run test:e2e:remote -- e2e/patching.spec.ts e2e/range.spec.ts e2e/portgroups.spec.ts e2e/rack-items.spec.ts`. Expected: PASS.

### Task 4: The far end as one button

**Files:**
- Modify: `frontend/src/features/patching/PatchingScreen.tsx`, `frontend/src/features/patching/patching.css`
- Test: `frontend/e2e/patching.spec.ts` (PT-04, PT-05), `frontend/e2e/patching-helpers.ts` (`chooseFar`)

**Interfaces:**
- Consumes: Task 3's pane head. `LocationPicker` unchanged (group "Far end").
- Produces: in the To head, a button with aria-label "Change far end" showing `<Name>` of the far equipment and its `PlacePath`, and its free count; clicking toggles a popover under the head that holds the `LocationPicker`. `chooseFar` clicks "Change far end" first when the "Far end" group is not visible.

- [ ] **Step 1: Write the failing tests.**
  - `PT-04 the far end is one button; the picker opens from it and closes on a choice`: with a far default, the "Far end" group is hidden and "Change far end" shows the far name; clicking it shows the group; choosing equipment hides it and the head shows the new name; Escape with it open closes only the picker (`patching` still visible). With no far default the group is visible when the page opens: find a near jack in the acceptance fixture for which `farDefault` returns undefined (check with a unit test in `patching.test.ts` first); if there is none, say so in the report instead of inventing one.
  - `PT-05 a long Hebrew far name truncates and keeps Front/Rear in the pane`: add a panel named `לוח-ניתוב-ראשי-בניין-שתים-עשרה-קומה-שלישית` through `plan-api` in Rack A03, choose it as the far end; the "Change far end" button's `scrollWidth > clientWidth` (truncated) and the To pane's Side group's right edge ≤ the pane's right edge.
- [ ] **Step 2: Run** `npm run test:e2e:remote -- e2e/patching.spec.ts`. Expected: PT-04, PT-05 FAIL.
- [ ] **Step 3: Implement.** The popover is anchored under the To head (absolute, `--shadow-pop`), closes on a choice, on Escape (handled before the page's own Escape) and on a click outside it.
- [ ] **Step 4: Run** `npm run test:e2e:remote -- e2e/patching.spec.ts e2e/range.spec.ts`. Expected: PASS.

### Task 5: Done asks when pairs are waiting

**Files:**
- Modify: `frontend/src/features/patching/PatchingScreen.tsx`, `frontend/src/features/patching/patching.css`
- Test: `frontend/e2e/range.spec.ts` (BK-07, BK-08)

**Interfaces:**
- Consumes: `connectRange()` and `onClose` in `PatchingScreen`.
- Produces: a confirm (role `dialog`, aria-label "Pairs not connected") above the bottom bar's right end, through the existing `useInlineDialog` (Escape and focus return).

- [ ] **Step 1: Write the failing tests.**
  - `BK-07 Done with pairs waiting asks; Close without connecting saves nothing`: range of 6 on EDGE-19 → PANEL-A front 4; click Done; the dialog says "6 pairs are not connected yet." and the preview sentence; "Close without connecting" closes the page and the plan has 0 links.
  - `BK-08 Connect 6 and close makes the cables and closes`: same set-up; "Connect 6 and close" closes the page and the plan has 6 links; Escape on the dialog (a second run) closes only the dialog and Done gets focus back; Done with no pairs (no far start) closes at once.
- [ ] **Step 2: Run** `npm run test:e2e:remote -- e2e/range.spec.ts`. Expected: BK-07, BK-08 FAIL.
- [ ] **Step 3: Implement.** Done opens the confirm only when the bottom bar's Connect N is enabled (Range, `makeable > 0`, and Skip ticked if some are blocked); otherwise Done closes as today. "Connect N and close" runs `connectRange()` and closes only if it saved (a server refusal stays on the page with its message); N is `makeable`.
- [ ] **Step 4: Run** `npm run test:e2e:remote -- e2e/range.spec.ts e2e/patching.spec.ts`. Expected: PASS.

### Task 6: Docs, the full run, and the owner's check

**Files:**
- Modify: `docs/status.md` (Physical faces and the patching screen; the Now / Next box), `docs/ui-spec.md` (the patching screen and the faceplate sizes), `CLAUDE.md` only if the code map changed (it should not), `docs/roadmap.md` (part 1 marked done, its plan moving to `docs/history/plans/` when the owner has checked it)

- [ ] **Step 1:** From `frontend/`: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`, `npm run test:e2e:remote` (the whole suite). Expected: all green; report the counts.
- [ ] **Step 2:** Update the docs above in the same change; one fact in one place.
- [ ] **Step 3:** Opus reviews the whole diff and the Task 2 screenshots, then the owner says when to commit, merge, push and deploy (no migration). **The owner then checks the compact HDF on their real HDFs** in patching and on the HDF page before part 2 is designed in detail.
