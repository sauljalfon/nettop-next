# Sonnet prompt — Rack items, step 2: frontend (add one, draw it, open it)

You are implementing **step 2 of 4** of the "Rack items" item in the Net-Top repository (branch `rack-items`; step 1, the backend, is committed). Work test-first. **Do not commit.**

## Read first

1. `AGENTS.md` and `CLAUDE.md` (rules, commands, the frontend code map; colours only through `var(--…)`, names never joined into one string).
2. `docs/roadmap.md` §2a "Rack items".
3. `docs/plans/2026-11-01-rack-items.md`: **The model**, **Decisions taken in the plan** (1, 2), **Review focus** (2, 3, 4), the **Tests (IDs)** rows RI-07, RI-08, RI-09, and **Step 2**.
4. The approved demo `docs/history/demos/rack-items-demo.html`: open it in a browser. Its library entry and form, its faceplates (`.plate.ups`, `.pdu`, `.shelf`, `.cable-manager`, `.other`) and its inspector card are the look to follow.
5. What step 1 added: `git show 459fb5b -- frontend/src/shared/types.ts` (`RackItemType`, `itemType`, `itemText`, kind `rack_item`, role `none`).
6. The code you change (below), and how a library item is added today: `features/planning/LibraryItems.tsx` (the `ITEMS` list, `PendingEquipment`, the form opened under its entry), `AddEquipmentForm.tsx` (the `LocationPicker` for the rack, the unit field, `PlanEdit`, server errors in the form), `features/physical/drops.ts` (`parseDrop`, `DropHandlers`), `features/physical/RackElevation.tsx` (`Plate`, the drop on a unit), and in `app/App.tsx` `requestEquipment` / `setPending` (how a drop opens the form).

## What to build

### 1. `src/shared/rackItems.ts` (new, pure) with `rackItems.test.ts`

- `RACK_ITEM_TYPES: readonly RackItemType[]` in the order `ups`, `pdu`, `shelf`, `cable-manager`, `other`.
- `rackItemTypeLabel(t: RackItemType): string`: UPS, PDU, Shelf, Cable manager, Other.
- `defaultRackItemHeight(t: RackItemType): number`: `ups` 2, the rest 1.
- `rackItemPieces(e: Pick<Equipment, 'itemType' | 'itemText'>): TextPiece[]`: `[{ text: 'UPS' }]`, or for Other `[{ text: 'Other · ' }, { name: itemText }]` (the text is user text, possibly Hebrew: a name piece, never joined).
- `suggestedRackItemName(input: { type: RackItemType; text?: string; nodeName: string; rackName: string; unit: number }, taken: (name: string) => boolean): string`:
  - `"<label> <node> <rack> U<unit>"`, e.g. `"Cable manager Building A Rack A03 U10"`; an Other uses its trimmed text instead of the label (`"KVM switch Building A Rack A03 U10"`; with no text yet, `"Other …"`).
  - Over 100 characters: leave the node out (`"<label> <rack> U<unit>"`).
  - When `taken(name)` (the caller compares ignoring case): add `" 2"`, `" 3"`… until free.

### 2. `src/shared/equipment.ts`

- `kindLabel(e: Pick<Equipment, 'kind'>): 'Switch' | 'Panel' | 'HDF' | 'Rack item'`.
- `hasPorts(e: Pick<Equipment, 'kind'>): boolean`: false only for `rack_item`.
- `isPassiveEquipment` becomes **panel or HDF only** (today it is "not a switch", which would call a rack item passive). Check its two callers (`inspector/Inspector.tsx`, `planning/deletePreview.ts`) still read right.
- Replace the inventory `KIND` maps step 1 added (`inventory/rows.ts`, `inventory/workList.ts`) with `kindLabel`.

### 3. The library entry and the form

- `LibraryItems`: a fourth item **"Rack item"**, description "UPS, PDU, shelf, cable manager or other: takes units, no ports", a lucide icon that reads as a plain box, between Patch panel and the HDF form. Drag payload `new:rack_item:::`; its Add… opens `RackItemForm` under it, like the others. `PendingEquipment.kind` gains `'rack_item'`, and `itemFor` maps it.
- `drops.ts`: `parseDrop` accepts `rack_item`; `Drop` and `DropHandlers.onCreateEquipment` take `'switch' | 'panel' | 'rack_item'`. Follow the type through `RackElevation` and `App.tsx` (`requestEquipment`) with no other change of behaviour.
- `features/planning/rackItemForm.ts` (pure, tested) and `RackItemForm.tsx` (thin):
  - fields: **Type** (select, default Shelf), **What it is** (only for Other; required, trimmed, at most 100 characters), the **rack** (the same `LocationPicker` as `AddEquipmentForm`) and **Unit**, **Height** (`defaultRackItemHeight(type)` until the user edits it), **Name** (`suggestedRackItemName(...)` until the user edits it; the node and rack names come from the location tree, `taken` from every equipment name in it, ignoring case);
  - a drop fills the rack and unit (`initial`), exactly as `AddEquipmentForm`;
  - Add to plan sends one `add_equipment` through `PlanEdit`: `{ kind: 'rack_item', role: 'none', name, rackId, unit, height, details: { itemType, itemText? } }` (no `portCount`, no `networkId`);
  - client checks (pure, with exact texts): "Choose a rack.", "Unit must be 1 or more.", "Say what it is: an Other needs a short text.", "A name is required."; the server's refusals (a taken unit, a taken name) show in the form as `AddEquipmentForm` shows them;
  - Escape and focus return through `useInlineDialog`, like the other inline forms.

### 4. Drawing it

- `RackElevation`: a rack item's block uses the no-network stripe, its subtitle pieces are the type (`rackItemPieces`) and its height (`"2U"`), and `Plate` draws `data-plate="rack-item"` with `data-item-type="<type>"` (no port dots; `count` is not used). Add the five faceplates to `physical.css` from the demo, **using only `var(--…)` tokens** (`theme.test.ts` guards this; add no new colour unless a token is truly missing, and then only in `theme.css`).
- `equipmentModel.ts`: `equipmentSubtitle` gives `[type label (as pieces where the caller takes pieces), '<h>U']` for a rack item; `faceFor` is **never called** for a rack item (callers check `hasPorts` first). Every ternary in `equipmentModel.ts`, `FaceView.tsx`, `EquipmentFaceStatic.tsx` and `EquipmentPage.tsx` that falls through to "HDF" must not be reached by a rack item.
- `EquipmentPage.tsx`: for a rack item, the header (name, place, type, height), its details, and a quiet line **"No ports"** where the face and legend would be; no Print-sheet face, no port table.
- `explorerModel.ts`, `physical/inventory.ts` (the counts: a rack item is neither active nor passive), `sheets.ts` (the rack sheet lists it with its type as the kind): check each and handle `rack_item` explicitly.

### 5. The inspector

- `inspector/model.ts`: a rack item has **no sections** (no Ports / Positions); its overview shows the type (`rackItemPieces`) and no network.
- `Inspector.tsx` / `Overview.tsx`: render it; where the ports table would be, "No ports". Show on map is not offered for a rack item (it is never on the tree).

Not in this step (step 3 does them): the details editor's Type field, the Inventory's Type column and pill, the Changes lines, the delete confirm, Duplicate, patching, the fixture and the browser specs.

## Tests first (write them, run them, see them fail, then the code)

- **RI-07** `shared/rackItems.test.ts`: the format; an Other's text; `" 2"` and `" 3"` when taken (case-insensitive through the caller's `taken`); over 100 characters the node is left out; a Hebrew node name kept as it is; `rackItemPieces` for UPS and for Other; `defaultRackItemHeight`.
- **RI-08** `planning/rackItemForm.test.ts`: Other needs a text; the default height follows the type until edited; the name follows type, text, rack and unit until edited; the command built is exactly the one above (no `portCount`, no `networkId`).
- **RI-09** `physical/equipmentModel.test.ts` (subtitle for each type), `inspector/model.test.ts` (no sections), `shared/equipment.test.ts` (`kindLabel`, `hasPorts`, `isPassiveEquipment` false for a rack item), `physical/drops.test.ts` (`new:rack_item:::`), and a component or model test that a rack item's page model has no face.

## Rules

- If the design cannot work as written, **stop and report the exact problem**; do not invent another behaviour.
- Touch only the files named in this prompt and their tests (plus `App.tsx` only to carry the widened drop type).
- **Do not commit.**

## Verify

From `frontend/`: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`; then the e2e specs this step touches: `npx playwright test e2e/planning.spec.ts e2e/placement.spec.ts e2e/rack.spec.ts e2e/equipment.spec.ts e2e/inspector.spec.ts e2e/physical.spec.ts e2e/faceplates.spec.ts`.

Then look at it running (`npm run dev` with the API on `:8080`, or the Playwright test server): in a plan, drag Rack item onto a free unit of Rack A03, add a UPS, and screenshot the rack elevation and the rack item's equipment page and inspector. Save the screenshots in the scratchpad, not in the repository.

## Report

The red runs, the green runs, `git diff --stat` and the full diff, what the screenshots show (with their paths), every ternary or kind check you changed and why, and anything you did differently from this prompt and why.
