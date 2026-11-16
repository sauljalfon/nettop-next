# The workbench, part 2b: where things go on the equipment page — Implementation Plan

> **For agentic workers:** this project's process is [way-of-work.md](../way-of-work.md): a Sonnet subagent started by Opus implements one task at a time, test first, and never commits; Opus reviews each task before the next. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** on the Physical equipment page, the selected jack's whole path drawn along the bottom as a line of hardware, and a compact "Connects to" summary beside the face.

**Architecture:** frontend only; no API, schema or domain change. A pure `pathLine(index, networks, endpointId)` in `features/paths/` builds the line from `followPort` (stored cables and bridges only; from a panel or HDF position, one walk per side); a thin `PathBar` draws it. A pure `connectsTo(index, equipmentId)` in `features/physical/` groups the equipment's cables by the equipment at their other end; a thin `ConnectsTo` draws it and tells `FaceView` which jacks to light through its existing `decorate`.

**Tech Stack:** React + TypeScript, plain CSS with tokens (D33), Vitest, Playwright on lanes (`npm run test:e2e:remote`).

**Spec:** D45 in [decisions.md](../decisions.md), part 2b in [roadmap.md, "The workbench"](../roadmap.md#the-workbench-current-before-2b), and [the demo](../history/demos/workbench-demo.html) (HDF page and Switch 48 + 4: click a jack; the look, sizes and copy come from it: `.pathbar`, `.pathline`, `.pn`, `.links`, `.link-row`).

## Global Constraints

- Fits **1536×864**; 1280×720 usable. The path is one line that never wraps; a path too long for the width scrolls sideways inside the bar. The face does not move when the bar appears or goes (the area above it gets shorter).
- Traversal truth: the path uses `followPort` over stored links only; nothing is inferred from names, positions or roles; the drawing never feeds traversal.
- Feature CSS uses `var(--…)` only; names are `<Name>` / `PlacePath` pieces; Hebrew names truncate at their end; specs import from `e2e/fixtures.ts`. Do not commit.
- Copy: the bar's region aria-label "Path", heading "Path of {jack name}", "{N} cables · {first equipment} → {last equipment}" ("1 cable"), "No cable on this jack", "nothing connected", close button aria-label "Close path" (it clears the selection, like Close port); the summary's region aria-label "Connects to", heading "Connects to", "{places} · {N} cables", "Show all", "No cables yet."
- With Pigtails chosen (D44), an HDF jack in the path is named by its fibers, as in patching.

## Review Focus

1. **A panel or HDF position cabled on one side only, or on neither:** the empty side reads "nothing connected"; the plate still shows both sides and the bridge (Task 1).
2. **A long path** (six or more plates) at 1280×720: the bar scrolls sideways, the page does not; the selected plate is scrolled into view (Task 2).
3. **A loop or a revisit** in bad data: `followPort` already stops before revisiting; the line ends there and does not repeat (Task 1 unit test).
4. **A plan:** proposed cables and equipment are in the path, drawn dashed like elsewhere (Task 2).
5. **Connects to with many places** (20+): it scrolls inside its card and the page does not; one place with one cable reads "1 cable" (Task 3).

---

### Task 1: The path as data

**Files:** create `frontend/src/features/paths/pathLine.ts` and `pathLine.test.ts`.

**Interfaces:**
- `type PathJack = { endpointId: string; label: string; side?: 'front' | 'rear'; selected: boolean }`
- `type PathPlate = { kind: 'plate'; equipmentId: string; name: string; equipmentKind: Equipment['kind']; role: Equipment['role']; rackId?: string; place: string[]; jacks: PathJack[] /* one, or two for a panel or HDF: in path order */; here: boolean; destination?: 'aggregation' | 'backbone'; proposed: boolean }`
- `type PathCable = { kind: 'cable'; linkId: string; networkId?: string; proposed: boolean }`, `type PathGap = { kind: 'gap' }` (nothing connected on that side)
- `pathLine(index: SnapshotIndex, endpointId: string, installed?: { equipment: ReadonlySet<string>; links: ReadonlySet<string> }): { steps: (PathPlate | PathCable | PathGap)[]; cables: number }` — plates and cables alternate; a gap only at an end. From a switch port: that port's plate first, then its walk. From a panel or HDF position: the walk from the selected side reversed, the position's own plate (both sides), then the walk from its bridge peer.

- [ ] **Step 1: Failing tests** on the acceptance fixture (and `physical/testFixture`): EDGE-17 port 1 → PANEL-A (both sides) → HDF-01 → HDF-02 → AGG-03 with the stored cable IDs, `cables` 4 and the last plate's `destination: 'aggregation'`; the same path from HDF-01's position on it has the same plates in the same order with HDF-01 `here`; a free switch port is one plate and a gap; a panel position cabled only at the rear has a gap on its front side; a revisit stops the line; a proposed cable is `proposed` when `installed` is given.
- [ ] **Step 2:** run `npx vitest run src/features/paths/pathLine.test.ts` (FAIL). **Step 3:** implement. **Step 4:** run it, then `npm test`, `npm run typecheck`, `npm run format:check`.

### Task 2: The path bar on the page

**Files:** create `frontend/src/features/paths/PathBar.tsx` (and its CSS in `paths` or `physical.css`); modify `EquipmentPage.tsx` / `PhysicalExplorer.tsx` (the bar is the last row of the equipment page's area, shown for a selected jack), `EndpointDetail.tsx` (the port panel no longer shows the chain or walk sheet: the bar replaces them; everything else stays); e2e in `equipment-page.spec.ts`.

- [ ] **Step 1: Failing tests** (1536×864 unless said): `EP-13 a selected jack's path is drawn along the bottom` (EDGE-17 port 1: region "Path", plates EDGE-17, PANEL-A, HDF-01, HDF-02, AGG-03 on one `y`, "4 cables · EDGE-17 → AGG-03", the bar's bottom at the window's bottom, the face's top unchanged by selecting); `EP-14 from an HDF position the path runs both ways` (HDF-01 3C/5: HDF-01's plate is marked here and has plates on both sides); `EP-15 a free jack says so` ("No cable on this jack", "nothing connected"); `EP-16 a plate opens that equipment on that jack`; `EP-17 Close path clears the selection`; `EP-18 at 1280×720 a long path scrolls inside the bar` (page `scrollWidth <= clientWidth`); the port panel has no chain. Update specs that read the chain or walk sheet in the port panel only where they looked there (they look in the bar now); never what they check.
- [ ] **Step 2–4:** run (FAIL), implement as in the demo (plates as steel with a tape label, jacks at 28px in the network's colour, the bridge dotted, cables 3px in the network's colour with the ID on a tag, one band per rack with its name, the selected plate ringed, AGG/BB tagged), run the specs, then the whole suite and the checks after the last change.
- [ ] **Step 5: Screenshots** into `test-results/path/`: EDGE-17 port 1, HDF-01 3C/5, a free jack, a plan with a proposed cable, 1280×720.

### Task 3: Connects to

**Files:** create `frontend/src/features/physical/connectsTo.ts` (+ test) and `ConnectsTo.tsx`; modify `EquipmentPage.tsx`, `physical.css`; e2e in `equipment-page.spec.ts`.

**Interfaces:** `connectsTo(index, equipmentId): { equipmentId: string; name: string; place: string[]; networkIds: string[]; cables: number; endpointIds: string[] /* this equipment's jacks */ }[]`, most cables first, then by name; an HDF or panel counts both sides.

- [ ] **Step 1: Failing tests.** Unit: counts per far equipment on the acceptance fixture, order, both sides counted, nothing for an uncabled equipment. E2E: `EP-19 Connects to lists the far equipment` (EDGE-17: its lines and counts; the card is at most 300px wide and as tall as its lines); `EP-20 a line lights its jacks` (those jacks marked, the others dimmed; the line again or Show all clears); `EP-21 it sits beside an HDF's face and under a switch's` and is absent on a rack item.
- [ ] **Step 2–4:** run (FAIL), implement as in the demo (30px lines: network dots, name, rack, count; a thin share line), run the specs, the whole suite and the checks after the last change.
- [ ] **Step 5: Screenshots** into `test-results/path/`.

### Task 4: Docs, the full run, the owner's check

- [ ] The whole suite and the checks; `docs/status.md` (part 2b; the Now / Next box), `docs/ui-spec.md` (Equipment and Endpoint detail), the roadmap's part 2b marked built; the owner reviews, then merge, push and deploy (no migration).
