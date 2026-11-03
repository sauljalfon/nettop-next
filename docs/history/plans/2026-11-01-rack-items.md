# Plan: Rack items (2026-11-01)

The item is part 2a of [roadmap.md §2](../roadmap.md#2-more-equipment); the design and the owner's answers (2026-11-01) are there. The look is the approved demo [history/demos/rack-items-demo.html](../history/demos/rack-items-demo.html): the faceplates, the library entry with its form, the type in the inspector and the Inventory's Type column. Where this plan and the demo differ, this plan wins and says so.

**Backend, one migration (010), API and frontend.** No change to traversal, Find AGG / BB, the tree or Problems: a rack item has no endpoints, so those never see it, and the plan checks that nothing breaks when they meet one.

## What the user gets

1. A **rack item** is equipment with a type: **UPS, PDU, shelf, cable manager or Other**. An Other carries a short "what it is" text ("KVM switch").
2. In a plan, **Rack item** is one more entry in the library on the left: drag it onto a free unit or press its Add…; its form opens under it with the type, "what it is" (Other only), rack and unit, height (UPS 2U, the rest 1U) and a suggested name. It is placed, moved, deleted and recorded like any equipment.
3. The **rack elevation** draws it with its own faceplate and its type. Its **equipment page** and the **inspector** show its type and details, with no ports.
4. On Installed its **type is fixed directly** in the details editor, like any detail: no plan, no new revision, and History lists it.
5. The **Inventory** has a **Type** column (and so a Type pill) on Equipment; rack items count as used units in Racks.
6. A rack item is **never** cabled, in a trace, in Find AGG / BB, on the tree or in Problems.

## Global constraints

- **Roles only, never names** (D04). A rack item's kind is `rack_item` and its role is `none`; nothing is ever inferred from a name. Existing placeholders are not converted.
- **Installed changes only by recording a plan** (locked decision 10); the type is a detail, so a direct fix may change it, never the kind, units or rack.
- **Names:** every name and every "what it is" text goes through `Name`, `PlacePath` or pieces; never join them into one string for display (D32, D33). "what it is" is user text and may be Hebrew.
- **Colours** only from `theme.css` tokens (`theme.test.ts`). A rack item's stripe is the existing no-network edge.
- **Equipment names stay unique** (case-insensitive) across the topology, as `add_equipment` and `rename_equipment` already enforce.
- **Migrations are append-only**; 001–009 are never edited.
- **Tests first:** each step's tests are written and seen failing before the code.

## The model

| | Value |
| --- | --- |
| Kind | `rack_item` (equipment, takes units, no endpoints, no subpanels, no links) |
| Role | `none` (validated: a rack item has exactly this role, and only a rack item has it) |
| Network | none (`networkId` must be empty, as for panels) |
| Detail `itemType` | `ups`, `pdu`, `shelf`, `cable-manager`, `other`. Required on a rack item; must be empty on every other kind |
| Detail `itemText` | "what it is", 1–100 characters, trimmed. Required when `itemType` is `other`; must be empty otherwise (and on every other kind) |
| Labels | `ups` UPS, `pdu` PDU, `shelf` Shelf, `cable-manager` Cable manager, `other` Other |
| Default height | UPS 2, the rest 1 (the form only; the server takes any 1–100 like all equipment) |
| Messages (in names) | "<name>: a rack item needs a type: UPS, PDU, shelf, cable manager or other"; "<name>: say what it is (an Other needs a short text)"; "<name>: what it is is only for an Other"; "<name>: only a rack item has a type"; "<name> is a rack item and has no ports" (a cable or endpoint on one) |

`itemType` and `itemText` are **detail fields** (in `topology.Details`, JSON `itemType`, `itemText`), so the existing direct fix, its `change_log` History, `update_details` in a plan and the Details payload of `add_equipment` carry them with no new command. `DetailWord`: `itemType` → "type", `itemText` → "what it is".

**Changing the type away from Other** must send `itemText: ""` in the same fix; the server refuses a non-Other type that keeps a text (the client always sends both).

## Decisions taken in the plan

These fill gaps the design and the demo left open. They go to the owner with the plan.

1. **Suggested name** (the owner chose to add the node, 2026-11-01; the order and the fallbacks are the plan's): the type, the node, the rack and the unit, e.g. "Cable manager Building A Rack A03 U10"; an Other uses its text instead of "Other" ("KVM switch Building A Rack A03 U10"). When that name is taken, " 2", " 3"… is added; when it is over 100 characters, the node is left out first. It follows the type, text, rack and unit until the user edits the name.
2. **No port table and no face:** the equipment page and the inspector say "No ports" where the face or the port table would be. Explore finds rack items by name and opens their page.
3. **Inventory's Missing pill** lists nothing for a rack item (a cable manager has no serial number to give). Bulk edit (Edit details of N rows) does not offer the type; it is changed one item at a time.
4. **Duplicate** is not offered for a rack item; adding another from the library is as quick.
5. **Patching** never offers a rack item as a far end (it has no jacks): the location picker leaves it out and the default far equipment skips it.
6. **The plan's Changes lines** read "Added UPS · UPS Building A Rack A03 U1" (type, then the name as a name piece), not the role and kind.
7. **The acceptance fixture** gains three rack items (step 3) so Installed can be tested: a 2U UPS and a cable manager in Rack A03 and an Other ("KVM switch") in Rack Core 01, on units that are free today. The implementer picks the free units, records them in `docs/acceptance-example.md`, and updates the specs whose counts change.

## Tests (IDs)

New IDs, added to `docs/acceptance-tests.md` in step 4 under "Rack items (2026-11-01)".

| ID | What | Where |
| --- | --- | --- |
| RI-01 | `Validate`: a rack item with each type is valid; refused: no type, an unknown type, Other with no text, a text on a non-Other, a type on a switch/panel/HDF, a role other than `none`, `none` on a switch, a network, an endpoint on a rack item; it collides on units like any equipment | `topology/validate_test.go` (or a new `rack_item_test.go`) |
| RI-02 | `add_equipment` with kind `rack_item`: adds it with its details and no endpoints; refused with a port count, port groups, a network, a missing type; a taken unit gives the existing "U4–5 in Rack … is taken by …" message; the label is filled | `planning/commands_test.go` |
| RI-03 | Move, delete and `remove_change` of a rack item in a plan; Check keys `add_equipment:` / `place_equipment:` / `remove_equipment:` work unchanged | `planning/commands_v2_test.go` |
| RI-04 | Direct fix of `itemType` and `itemText`: Shelf → Other with a text; Other → UPS with `itemText: ""`; Other → UPS keeping the text refused; `itemType` on a switch refused; the revision unchanged; `change_log` rows `itemType` / `itemText` | `fixes/fixes_test.go`, `persistence/fix_test.go` |
| RI-05 | Persistence round trip (DB): a recorded plan adding a rack item reads back with kind, role, type and text; migration 010 refuses a rack item without a type at the database too | `persistence/record_test.go`, `persistence/store_test.go` |
| RI-06 | HTTP: `add_equipment` rack item 200; a cable to it 422 with the message; `PATCH` fix of its type 200 | `httpapi/commands_v2_api_test.go`, `httpapi/fix_api_test.go` |
| RI-07 | `suggestedRackItemName`: the format, Other's text, " 2" when taken (case-insensitive), node left out over 100 characters, Hebrew names kept as they are | `shared/rackItems.test.ts` |
| RI-08 | `AddRackItemForm` validation: Other needs a text; default height follows the type until edited; the name follows until edited; a taken unit shows the server's message | `planning/rackItemForm.test.ts` (pure part) |
| RI-09 | Models: the rack elevation's subtitle and plate for each type; `equipmentSubtitle` ("UPS · 2U"); the inspector's sections are none; `kindLabel` | `physical/equipmentModel.test.ts`, `inspector/model.test.ts`, `shared/equipment.test.ts` |
| RI-10 | Details model: a rack item's fields include Type (select) and, for Other, What it is; `changedFix` sends `itemText: ""` when leaving Other; History lines read "Type: Shelf → Other" | `details/model.test.ts` |
| RI-11 | Inventory rows: Kind "Rack item", Type "UPS" / "Other" with its text piece, Role and Ports empty, Missing empty; Racks used counts their units; Problems has no row for them | `inventory/rows.test.ts`, `inventory/racks.test.ts`, `inventory/problems.test.ts` |
| RI-12 | Planning texts: the Changes line, the delete confirm ("It has no ports or cables."), the work list; patching's picker and default skip rack items | `planning/summary.test.ts`, `planning/deletePreview.test.ts`, `patching/patching.test.ts` |
| RI-13 | Browser, plan: drag Rack item onto a free unit of Rack A03, choose UPS, add; the elevation shows it dashed with its plate; move it; Delete; Record shows it on Installed | `rack-items.recording.spec.ts` |
| RI-14 | Browser, Installed: the fixture's UPS opens in the inspector and on its equipment page with "No ports"; Fix the type of the cable manager to Other "Fan tray", History lists it; Inventory's Type pill "UPS" lists the UPS | `rack-items.spec.ts` (the fix in `rack-items.recording.spec.ts`) |
| RI-15 | Browser: a rack item is not in the trace picker, the patching location picker, the tree, or Find AGG / BB's starts | `rack-items.spec.ts` |

## Review focus

The inputs no task's happy path covers that are most likely to bite, each pinned by a test in the step that owns the code:

1. **Leaving Other** keeps a stale text unless both fields go together: RI-04 (server) and RI-10 (client always sends `itemText: ""`).
2. **Code that assumes "not a switch or panel means HDF"** (ternaries in `equipmentModel`, `FaceView`, `EquipmentPage`, `inspector/model`, `sheet`, `summary`, `manyPreview`) crashes or mislabels a rack item: RI-09, RI-12 and RI-14 open every screen on one. Step 2 lists each file.
3. **"Passive" means "not a switch"** in `shared/equipment.ts` (`isPassiveEquipment`) and in `physical/inventory.ts`'s counts: a rack item must be neither active nor passive. RI-09 and RI-11.
4. **The suggested name clashes** (two racks called R01 in two buildings, a name already used, a very long Hebrew node name): RI-07.
5. **A rack item as a cable end** through patching, Connect a range or a hand-made command: RI-02/RI-06 (server refuses) and RI-12/RI-15 (never offered).

## Steps

Each step is one Sonnet prompt (way-of-work.md §6), reviewed before the next. Backend and frontend are separate prompts.

### 1. Backend: the kind, its details, migration 010 and the API

**Files:** `backend/migrations/010_rack_items.sql` (new); `internal/topology/model.go`, `validate.go`, `details.go`; `internal/planning/commands.go`; `internal/persistence/store.go` (read and insert), `fix.go` (update); the tests named in RI-01–RI-06; `api/openapi.yaml`; `frontend/src/shared/types.ts` (types only).

**Interfaces produced:**
- `topology.Equipment` gains `ItemType string \`json:"itemType,omitempty"\`` and `ItemText string \`json:"itemText,omitempty"\``.
- `topology.Details` gains `ItemType`, `ItemText *string` (JSON `itemType`, `itemText`), in `Fields` and `Merge`; `Equipment.SetDetail` accepts them only when `Kind == "rack_item"` (returns false otherwise, which the callers already turn into "does not apply").
- `topology.RackItemTypes = []string{"ups", "pdu", "shelf", "cable-manager", "other"}`.
- `Equipment.DetailProblem` checks `itemType` (one of the list) and `itemText` (≤ 100 characters); `Validate` checks the kind rules in the Model table (required type, Other's text, role `none`, no network, no endpoints).
- `add_equipment` accepts `kind: "rack_item"`, `role: "none"`, `portCount` 0 or absent, no `portGroups`, no `networkId`, and the type in `details`.
- Migration 010: the kind check gains `rack_item`; `equipment` gains `item_type text` and `item_text text` with one check: a rack item has `role = 'none'`, an `item_type` in the list and an `item_text` exactly when `item_type = 'other'` (1–100 characters); every other kind has both NULL. No preflight is needed (no existing row can be a rack item).
- OpenAPI: `Equipment.kind` enum gains `rack_item`, `role` documents `none`, `Equipment` and `Details` gain `itemType` (enum) and `itemText`; `EquipmentInput.kind` gains `rack_item`. Lint with redocly.
- `types.ts`: `Equipment['kind']` gains `'rack_item'`; `RackItemType = 'ups' | 'pdu' | 'shelf' | 'cable-manager' | 'other'`; `itemType?: RackItemType`, `itemText?: string` on `EquipmentDetails` and `Details`; `EquipmentInput.kind` gains `'rack_item'` and `role` gains `'none'`.

**Checks:** `go test -race ./...` with `TEST_DATABASE_URL` (say that the DB tests ran), `go vet ./...`, the redocly lint, `npm run typecheck` (types only; fix any exhaustive switch the new kind breaks by adding the case the later steps fill, never by a cast).

### 2. Frontend: adding one, drawing it, opening it

**Files:** `src/shared/rackItems.ts` (new: `RACK_ITEM_TYPES`, `rackItemTypeLabel`, `rackItemPieces`, `defaultRackItemHeight`, `suggestedRackItemName`) with `rackItems.test.ts`; `src/shared/equipment.ts` (`kindLabel`, `hasPorts`; `isPassiveEquipment` becomes panel or HDF only); `features/planning/LibraryItems.tsx`, `AddRackItemForm.tsx` (new, with its pure validation in `rackItemForm.ts`; not `RackItemForm.tsx`, which clashes with `rackItemForm.ts` on a case-insensitive disk), `features/physical/drops.ts`; `features/physical/RackElevation.tsx`, `equipmentModel.ts`, `EquipmentPage.tsx`, `FaceView.tsx`, `EquipmentFaceStatic.tsx`, `explorerModel.ts`, `inventory.ts`, `sheets.ts`, `physical.css`; `features/inspector/model.ts`, `Inspector.tsx`, `Overview.tsx`.

**Interfaces produced:**
- `suggestedRackItemName(input: { type: RackItemType; text?: string; nodeName: string; rackName: string; unit: number }, taken: (name: string) => boolean): string` (decision 1).
- `rackItemPieces(e: Pick<Equipment, 'itemType' | 'itemText'>): TextPiece[]`: `[{text: 'UPS'}]`, or `[{text: 'Other · '}, {name: itemText}]`.
- `kindLabel(e): 'Switch' | 'Panel' | 'HDF' | 'Rack item'`; `hasPorts(e): boolean` (false only for `rack_item`).
- The library's `PendingEquipment.kind` gains `'rack_item'`; the drag payload `new:rack_item:::`.
- `Plate` takes `itemType` and draws `data-plate="rack-item"` with `data-item-type`, CSS from the demo's plates using only `var(--…)`.
- `faceFor` is never called for a rack item: `EquipmentPage` and `FaceView` check `hasPorts` first and show "No ports"; `equipmentSubtitle` gives `[type, '<h>U']`.

**The form** (from the demo, inside the library like `AddEquipmentForm`): Type (select, default Shelf), What it is (Other only, required), the rack and unit the same way `AddEquipmentForm` picks them (a drop fills them), Height (default from the type until edited), Name (suggested until edited), Add to plan → one `add_equipment` command through `PlanEdit`. Server errors show in the form as today.

**Tests first:** RI-07, RI-08, RI-09.

**Checks:** `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`; the e2e specs that touch the library, the rack and the equipment page (`planning`, `placement`, `rack`, `equipment`, `inspector`, `physical`) still pass.

### 3. Frontend: the type fix, the Inventory, the texts, the fixture and the browser specs

Two prompts, as way-of-work.md asks when both sides change: **3a** the fixture (Go, `internal/acceptance` and `docs/acceptance-example.md`, `go test -race ./...`), then **3b** the frontend and the specs below.

**Files:** `features/details/model.ts`, `DetailsEditor.tsx`, `EquipmentDetails.tsx`, `HistoryTab.tsx`; `features/inventory/columns.ts`, `rows.ts`, `problems.ts`, `manyPreview.ts`, `bulkEdit.ts`; `features/planning/summary.ts`, `deletePreview.ts`, `DuplicateEquipment.tsx` (not offered), `features/inventory/workList.ts`; `features/patching/patching.ts`, `PatchingScreen.tsx`; `backend/internal/acceptance` (the three rack items) and `docs/acceptance-example.md`; `frontend/e2e/rack-items.spec.ts`, `rack-items.recording.spec.ts` (new) and the specs whose counts change.

**Interfaces produced:**
- `FieldKey` gains `itemType` and `itemText`; `equipmentFields(e: Equipment): readonly FieldSpec[]` (the list for that equipment: rack items get Type, and What it is when the value is `other`, after Name); `changedFix` adds `itemText: ''` whenever `itemType` changes away from `other`.
- Inventory column `type` on Equipment (label "Type", value the type label, its text as a piece); the pill comes from the column.

**Tests first:** RI-10, RI-11, RI-12; then RI-13, RI-14, RI-15 in the browser.

**Checks:** `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`, the whole `npm run test:e2e`; `go test -race ./...` for the fixture.

### 4. Docs and close

- `docs/acceptance-tests.md`: the RI rows.
- `docs/status.md`: what now runs (a "Rack items" area), the Now / Next box (next: 2b active devices).
- `docs/ui-spec.md` and `docs/architecture.md`: the kind, its role `none`, the library entry, the faceplate, "No ports".
- `docs/decisions.md`: D42 "Rack items" (the kind, role `none`, type as a detail, never in traversal).
- `CLAUDE.md`: `shared/rackItems.ts` and the migration count in the code map.
- `docs/roadmap.md`: 2a moves to history; the plan moves to `docs/history/plans/`.
- Deploy note for the owner: **this update has a migration (010)**; back up first.

## After the item

The owner deploys and enters real rack items. 2b, active devices, starts with its own questions and demo.

## Appendix: the roadmap entry (moved here when the item closed, 2026-11-03)

**2a. Rack items** (approved 2026-11-01 from [the demo](../demos/rack-items-demo.html))

**Owner's answers (2026-11-01).**
- **One new kind, "rack item",** with a type: **UPS, PDU, shelf, cable manager, Other**. An Other needs a short "what it is" text (e.g. "KVM"), shown wherever the type is. No blanks.
- **Units:** a rack item takes its units like any equipment, with no overlap. 0U vertical PDUs are not modelled; a shelf is its own units (what sits on it can go in its description).
- **Default height** UPS 2U, the rest 1U, editable. **Name** suggested from the type and unit ("Shelf U12"), editable; a name is still required.
- **Details** as every equipment (manufacturer, model, serial, IP, status, description). The **type** (and Other's text) is fixed directly like details: no plan, no new revision.
- **Entered through a plan** like all equipment (placed, moved, deleted, recorded). It is **one more entry in the plan's library** on the left ("Rack item"): drag it onto a free unit or press its Add…, and its form opens under it like the other items; no button above the rack.
- **Other's suggested name** uses its text ("Fan tray U10").
- **Shown** in the rack elevation (its own faceplate), the equipment page, the inspector and the Inventory (type as a column and a pill); the Racks list counts them as **used** units, with no separate count of them. **Never** in cables, traces, Find AGG / BB, the tree or Problems.
- **Not now:** converting placeholders already entered (the owner fixes them by hand in a plan; never guessed from names, D04).

**Calls left to Opus (the owner may overrule):** a rack item has no port table on its equipment page; the printable rack sheet lists it like any equipment; Explore search finds it by name.

**Suggested name** (owner, 2026-11-01): it includes the node, so names stay unique; the format is in [the plan](2026-11-01-rack-items.md).

**Plan** approved 2026-11-01: [plans/2026-11-01-rack-items.md](2026-11-01-rack-items.md); the build is in progress.
