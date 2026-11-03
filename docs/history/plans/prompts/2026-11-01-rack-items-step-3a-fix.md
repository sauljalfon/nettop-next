# Sonnet prompt — Rack items, step 3a fix: patching skips rack items, Copy rack layout copies them

You are finishing **step 3a** of the "Rack items" item (branch `rack-items`). Your 3a work (the fixture, the Go tests, the spec counts, `docs/acceptance-example.md`) is reviewed and stays as it is, uncommitted. Seven e2e specs fail because the fixture now holds rack items; this prompt fixes their causes in the frontend. Work test-first. **Do not commit.**

## Read first

1. `docs/plans/2026-11-01-rack-items.md`: **Decisions taken in the plan** 4 and 5, **Review focus** 5.
2. `frontend/src/features/patching/patching.ts` (`locationTree`, `eligibleIn`, `offers`, `farDefault`) and `patching.test.ts`.
3. `frontend/src/features/planning/duplicate.ts` (`copyLayout`, `copyCommand`, `sizeProblem`, `sizes`) and `duplicate.test.ts`.
4. `frontend/src/features/planning/rackItemForm.ts` (`takenNames`, `placeOf`): **they read the same location tree**.

## 1. Patching never offers a rack item as a far end (decision 5)

Today the far-end picker and `farDefault` can land on a rack item (in the fixture `UPS-A03` is the first equipment of Rack A03), and `faceFor` throws for one (step 2, on purpose). The six failing specs (ED-09, PT-07, PG-03, three BK-02 in `range.spec.ts`) time out because of it.

- `eligibleIn`, in equipment mode: leave out rack items (`!hasPorts(e)` from `shared/equipment.ts`). Then `offers`, `firstRack` and `firstNode` follow: a rack holding only rack items offers nothing as a far end.
- `farDefault`: its `others` list leaves out rack items, so neither the near-node pick nor the "first other equipment" fallback is one. A `recent` target that is a rack item is skipped too.
- **`locationTree` itself is not changed**: the rack-item form takes its taken names (`takenNames`) and the node and rack names (`placeOf`) from it, and a rack item's name must still count as taken. Rack mode (the forms, Copy rack layout's target) is unchanged.

Tests (RI-12, patching part) in `patching.test.ts`: a rack with a switch and a UPS offers only the switch; a rack with only a UPS is not offered and the picker's start skips it; `farDefault` never returns a rack item (near-node pick and fallback); `locationTree` still lists the rack item.

## 2. Copy rack layout copies rack items too (owner, 2026-11-01)

A rack's layout includes its rack items: the copy gets each one at the same unit with a new name, like the switches and panels. Today `copyLayout` treats a UPS as a panel with 0 positions and refuses it ("port count must be between 1 and 48"), which fails BK-04.

- `sizeProblem`: no size problem for a rack item.
- `copyCommand`: for a rack item, one `add_equipment` with `kind: 'rack_item'`, `role: 'none'`, the name, rack, unit and height, and `details: { itemType, itemText }` (`itemText` only for an Other) — the same shape as `buildRackItemCommand` in `rackItemForm.ts`; no `portCount`, no `portGroups`, no `networkId`. Other details (manufacturer, serial…) are not copied, as for every kind.
- The preview line reads like the others (its new name and unit); if `CopyPreview` shows a kind or size for a line, a rack item shows its type through `rackItemPieces`, never "0 ports".
- **Duplicate… of a single rack item stays not offered** (decision 4, step 3b): do not touch `duplicateLines` beyond what the shared helpers need.

Tests in `duplicate.test.ts`: copying a rack with a switch, a UPS (2U) and an Other "KVM switch" gives three lines with no problem, and the rack items' commands are exactly the shape above; the name of the copy counts up as for the others.

Then fix **BK-04** in `duplicate.spec.ts` only as far as the fixture changed what it expects (the preview now lists the UPS as a line to copy); say each line you change.

## Rules

- If the design cannot work as written, **stop and report the exact problem**; do not invent another behaviour.
- Touch only `patching.ts`, `duplicate.ts`, `CopyPreview.tsx` if its line needs the type, their tests, and `duplicate.spec.ts` (BK-04). Keep your 3a changes as they are.
- **Do not commit.**

## Verify

- From `frontend/`: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
- The browser suite runs on the **test machine** now: `npm run test:e2e:remote` (the whole suite, about 3.5 minutes; `npm run test:e2e:remote -- e2e/range.spec.ts` for one file). It copies this folder, uncommitted changes included. The whole suite must be green: 273 passed plus 3 skipped, with the recording project run. If a failure's trace is needed, it is copied to `frontend/test-results-remote/`.
- The Go suite is unchanged by this prompt; no need to rerun it.

## Report

The red runs, the green runs (unit and the whole remote e2e suite, with counts and time), `git diff --stat` of this prompt's changes and their diff, every spec line you changed with old and new values, and anything you did differently from this prompt and why.
