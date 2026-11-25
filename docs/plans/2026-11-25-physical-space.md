# Physical uses the screen — Implementation Plan

> **For agentic workers:** process in [way-of-work.md](../way-of-work.md): a Sonnet subagent implements one task at a time, test first, never commits; Opus reviews each task.

**Goal:** D50 and [roadmap.md, "Physical uses the screen"](../roadmap.md), as in [the demo](../history/demos/physical-space-demo.html) (its `fitFaces`, `hdfBody`, `cabinet` and `.route` CSS are the reference). Frontend only; the API is unchanged.

## Global constraints

- **The patching screen keeps its faces as they are:** the new sizing is opt-in on `FaceView` (a `fit` prop); without it nothing changes.
- **The Trace page keeps its drawing:** `PathPlates` is shared with it; the path card's larger plates are scoped to the card (a class or a CSS variable set by the card), never by changing `PathPlates`' defaults.
- Keep: the teal route marks, Pairs | Pigtails (D44, D48), Front | Rear, the ⋯ menu, Connect… / Disconnect… in a plan, the face's keyboard (one tab stop, roving focus; arrows keep the face's **logical** order: Up/Down by row, Left/Right by column, also across bands), every `data-*` mark and test ID the specs use (`path-bar`, `endpoint-detail`, `connects-to`, `face-endpoint`, `rack-slot-<rack>-<unit>`, …) unless a task says otherwise.
- Feature CSS uses `var(--…)` only (`theme.test.ts`); new sizes go in `theme.css`. Names are `<Name>` / `PlacePath` pieces. Specs import from `e2e/fixtures.ts`. Do not commit.

### Task 1: The fit and the compact rack, as pure modules

**Files:** new `features/physical/faceFit.ts` + `faceFit.test.ts`; `features/physical/elevation.ts` (or a new `rackRuns.ts`) + test.

- `bandCounts(rows: number): number[]` → `[1, 2, 3, 4, 6, 8]` keeping 1 and every count ≤ rows / 2.
- `bandRows(rows: number, bands: number): number[][]` → the row numbers highest first, split into `bands` runs of ⌈rows / bands⌉ (band 1 holds the highest rows; no empty band).
- `chooseFit(trials, room, max, readable = 18)`: each trial is `{ bands, w20, h20, w40, h40 }` (the plate's size measured with a 20px and a 40px jack; size is linear in the jack). For each: `jw = (room.w − (w20 − 20·bw)) / bw` with `bw = (w40 − w20) / 20`, `jh` the same in height; `jack = min(jw, max, max(min(jh, jw), readable))`. The trial with the biggest jack wins (ties: fewer bands). Returns `{ bands, jack }` with `jack` floored.
- `compactRack(rows: ElevationRow[], collapse: boolean)`: with `collapse`, every run of **3 or more** consecutive free units becomes one `{ kind: 'run', top, bottom }` row; shorter runs and every equipment row stay as they are. Without `collapse` the rows are unchanged.
- [ ] **Step 1: Failing tests:** band counts for 1, 3, 12, 32 rows; `bandRows(12, 2)` = `[[12..7], [6..1]]`, `bandRows(32, 3)` = 11/11/10; `chooseFit` picks width-limited, height-limited, the readable floor, the tie rule and never returns a jack wider than `jw`; `compactRack` on R-12-like rows (`44`, a 4U block at 43–40, `39`, singles, `25–1` as one run), with `collapse: false` unchanged.
- [ ] **Steps 2–4:** run (FAIL), implement, `npm test`, typecheck.

### Task 2: Faces fit their card

**Files:** `features/physical/FaceView.tsx` (a `fit?: { maxJack: number }` prop), a new hook `features/physical/useFaceFit.ts`, `features/physical/physical.css`, `shared/theme.css` (the maxima: `--jack-max-hdf: 60px`, `--jack-max: 56px`, `--jack-readable: 18px`), `features/physical/faceNav.ts` only if arrows depend on the drawing (keep the logical order).

- With `fit`, the faceplate gets `data-fit` and a `--j` set by `useFaceFit`: a `ResizeObserver` on the face's card measures the room (the card's inner width; the height from the card's top to the bottom of the page's scroll area, less the legend and, when it is beside, nothing else: the page passes the height it wants kept free below, e.g. the path card's height), measures the plate at `--j: 20px` and `40px` for each `bandCounts(rows)` (HDF) or `[1]`, and applies `chooseFit`. Measuring is done in a layout effect so nothing flickers; it reruns when the room, the face, the side or the numbering changes.
- With `fit`, jacks of every kind are `var(--j)` square (switch and panel jacks too), numbers `calc(var(--j) * .38)`; the plate is `width: max-content` inside a card that scrolls only as a last resort; an HDF draws `bandRows` as side-by-side `hdf-grid`s with a steel line between them and the head says `front · rows 12–1, left to right` when banded; a switch's group captions are `width: 0; min-width: 100%` with an ellipsis.
- [ ] **Step 1: Failing tests:** vitest for the hook's pure part if any; Playwright `D50-01` on an HDF page and a switch page at 1230×760, 1440×900, 1920×1080 and 2560×1440: no jack outside its plate and no plate outside its card (the demo's check), and the HDF's jack is larger at 1920 than at 1230; `D50-02` a 12-row HDF (added with `add_hdf` in a plan in the spec) is drawn in 2 bands at 1920×1080 with row 12 top-left, and ArrowDown from 7A/1 goes to 6A/1; `D50-03` the patching screen's faces keep their sizes (32px HDF jacks).
- [ ] **Steps 2–4:** run (FAIL), implement, all checks and the specs touched.

### Task 3: The equipment page: the face, the cards beside it, the path card under both

Split in two (owner, 2026-11-25), each reviewed on its own; the files and tests below are shared out as:
- **3a, the cards beside the face:** `EquipmentWork`, `EndpointDetail` in the side column, `dock.ts` (no Port details), the page grid (face | side column), `D50-04`'s card beside the face with the dock closed, and the specs that opened the Port tab moved to the page's card. The path stays the fixed strip for now.
- **3b, the path card:** `PathBar` → the path card and `pathBar.css`, the card under the face and the column, the face's `keepBelow`, removing `--links-h`, `links-under`, `--pathbar-h` and the fixed strip, the rest of `D50-04` (the path card's place, × clears both), `D50-05` and `D50-06`.

**Files:** `features/physical/EquipmentPage.tsx` (split out a thin `EquipmentWork` used by the page and by the rack level in Task 4), `features/physical/EndpointDetail.tsx` (rendered in the page's side column, not portalled to the dock; no `useDetailsTab('Port')`), `features/frame/dock.ts` (+ test: `details` is only `'Node'`; a jack no longer opens the dock), `features/paths/PathBar.tsx` → the path card (same `data-testid="path-bar"`; its header: "Path of …", the network chip, "N cables · M places", start → end, Open the Trace page (`onFullPage`), ×; without a cabled jack one line "Select a cabled jack on the face to draw its path to the AGG or BB."), `features/paths/pathBar.css` (scoped: the plates and jacks scale with the card, `--pj: clamp(24px, 2.6cqw, 52px)`, cables as a line with a connector at each end and the ID above, the end ringed teal with "↑ reaches the AGG" / "BB" when the path ends at one), `features/physical/physical.css` (the grid: face | 340px side, 400px from 1700px of page width, one column under 1080px with the side's two cards side by side; remove `--links-h`, `links-under`, `--pathbar-h` and the fixed strip), `shared/theme.css`.
- The side column: Connects to, then the selected jack's card (what the Port tab showed, with its actions and port details), or "Select a jack on the face to see where it goes."
- The face's `fit` gets the path card's height to keep free when the card is under it.
- [ ] **Step 1: Failing tests:** `dock.test.ts` (no Port details); Playwright `D50-04` selecting a jack on EDGE-17 shows its card beside the face and the path card under the face and the column, full width, the dock stays closed; × clears both; `D50-05` the path card's plates are larger at 1920×1080 than at 1230×760 and the last plate is fully visible at 1230; `D50-06` Open the Trace page from the path card opens the Trace page. Specs that open the Port tab (`equipment-page`, `equipment`, `frame`, `hdfplate`, `visual-pass`, `walk-sheet`, `trace-page`) read the page's card instead.
- [ ] **Steps 2–4:** run (FAIL), implement, all checks and the whole e2e suite.

### Task 4: The rack level: a slim rack, the chosen unit beside it, the path across

**Files:** `features/physical/RackElevation.tsx` (a `compact` mode: 190–250px wide, the unit height fitted to the room above the path card (12–26px), `compactRack(rows, !canEdit)`, a run drawn as one dashed row "25–1 · 25U free", unit numbers without "U", no "Available" text, the hint box replaced by one line "Double-click a unit to open its page."; a click calls `onPick`, a double-click `onOpen`), `features/physical/PhysicalExplorer.tsx` (the rack level's grid: rack | the chosen unit's head (name, meta, U, **Open page**) and `EquipmentWork`; the path card across both), `features/physical/physicalSession.ts` (+ test: the chosen unit and its jack per rack, session-only; default: the equipment last opened from this rack, else the topmost with ports), `features/physical/physical.css`. Print sheet keeps the full elevation (`fixedUnitPx`, no compact).
- In a plan every free unit stays its own drop target (no runs); drag and drop as before.
- A rack item (no ports) shown beside the rack: its name, meta and "No ports".
- [ ] **Step 1: Failing tests:** `physicalSession.test.ts`; Playwright `D50-07` at 1920×1080 the rack is at most 250px wide, every unit fits without scrolling, a free run shows as one row, a click on AGG-03's unit shows its face beside the rack and the URL / level stays the rack; Open page and a double-click open the equipment page; `D50-08` a jack chosen beside the rack draws the path card under the rack and the device; `D50-09` in a plan the free units are separate drop targets (an existing drop spec still passes).
- [ ] **Steps 2–4:** run (FAIL), implement, all checks and the whole e2e suite on the test machine (`npm run test:e2e:remote`).

### Task 5 (Opus): review at the owner's sizes, the docs

- Screenshots at 1230×760, 1536×864 (the owner's 1920×1080 at 125%), 1920×1080 and 2560×1440 of: the rack level, a 3-row and a 12-row HDF, a panel, a switch, each with and without a jack.
- Docs: `status.md` (what runs), `ui-spec.md` (the equipment page, the rack level, the path card), `acceptance-tests.md` (D50-01…), `testing.md` if the spec list changes, `CLAUDE.md` (the `features/physical/` and `features/paths/` lines: `faceFit`, `useFaceFit`, `EquipmentWork`, the path card, no Port tab).
