# Sonnet prompt — Rack items, step 1: backend

You are implementing **step 1 of 4** of the "Rack items" item in the Net-Top repository (branch `rack-items`). Work test-first. **Do not commit.**

## Read first

1. `AGENTS.md` and `CLAUDE.md` (rules, commands).
2. `docs/roadmap.md` §2a "Rack items" (the owner's answers).
3. `docs/plans/2026-11-01-rack-items.md`: the whole plan, especially **The model**, **Review focus**, the **Tests (IDs)** rows RI-01 to RI-06, and **Step 1**. The plan is the spec; this prompt does not repeat everything in it.
4. The code you change: `backend/internal/topology/model.go`, `validate.go`, `details.go`; `backend/internal/planning/commands.go` (the `add_equipment` case); `backend/internal/persistence/store.go` (equipment read around line 123, `insertEquipment` around line 410), `fix.go` (the equipment `UPDATE` around line 96); `backend/internal/fixes/fixes.go`; migrations `001`, `003`, `004`, `008` (the existing equipment checks); `api/openapi.yaml`; `frontend/src/shared/types.ts`.

## What to build

A new equipment kind **`rack_item`**, role **`none`**, with two new **detail fields**:

- `itemType`: one of `ups`, `pdu`, `shelf`, `cable-manager`, `other`. Required on a rack item; must be empty on every other kind.
- `itemText` ("what it is"): trimmed, 1–100 characters. Required when `itemType` is `other`; must be empty otherwise and on every other kind.

A rack item takes rack units like any equipment (the existing collision rules), has **no endpoints, subpanels or links**, and **no network**.

### Exact changes

1. **`topology`**
   - `Equipment` gains `ItemType string \`json:"itemType,omitempty"\`` and `ItemText string \`json:"itemText,omitempty"\``.
   - `var RackItemTypes = []string{"ups", "pdu", "shelf", "cable-manager", "other"}`.
   - `Details` gains `ItemType, ItemText *string` (JSON `itemType`, `itemText`), included in `Fields()` and `Merge()`.
   - `Equipment.SetDetail` accepts `itemType` / `itemText` **only when `e.Kind == "rack_item"`**; otherwise it returns false (the callers already turn that into "does not apply").
   - `DetailWord`: `itemType` → `"type"`, `itemText` → `"what it is"`.
   - `Equipment.DetailProblem`: `itemType` one of `RackItemTypes` (when set), `itemText` at most 100 characters.
   - `Validate`: accept kind `rack_item`; enforce, with these exact messages (`<name>` is the equipment's name):
     - role must be `none` (and `none` is refused on every other kind);
     - no `networkId`;
     - `"<name>: a rack item needs a type: UPS, PDU, shelf, cable manager or other"` (missing or unknown type);
     - `"<name>: say what it is (an Other needs a short text)"`;
     - `"<name>: what it is is only for an Other"`;
     - `"<name>: only a rack item has a type"` (a type or text on a switch, panel or HDF);
     - `"<name> is a rack item and has no ports"` (any endpoint owned by a rack item).
2. **`planning` `add_equipment`**: accept `kind: "rack_item"` with `role: "none"`, `portCount` 0 or absent, no `portGroups`, no `networkId`; the type and text come in `details`. Create no endpoints. Update the role/kind error so it also names the rack item ("…or none for a rack item"). The name uniqueness and `placementProblem` checks are unchanged. A missing type must be refused (the `Validate` message above is fine).
3. **Migration `backend/migrations/010_rack_items.sql`** (new; never edit 001–009): the equipment kind check gains `rack_item`; add `item_type text` and `item_text text`; one check constraint: a `rack_item` has `role = 'none'`, `item_type IN (...)`, and `item_text` NOT NULL with length 1–100 exactly when `item_type = 'other'` (NULL otherwise); every other kind has both NULL. Follow the style of 008. No preflight.
4. **`persistence`**: read the two columns (`COALESCE(…,'')`), insert them (`NULLIF(…,'')`), and include them in the direct-fix `UPDATE` in `fix.go`.
5. **`api/openapi.yaml`**: `Equipment.kind` enum gains `rack_item`; document role `none`; `Equipment` and `Details` gain `itemType` (enum) and `itemText`; `EquipmentInput.kind` gains `rack_item`. Lint from `frontend/`: `npx --yes @redocly/cli lint ../api/openapi.yaml --extends minimal`.
6. **`frontend/src/shared/types.ts`** (types only): `Equipment['kind']` gains `'rack_item'`; export `RackItemType = 'ups' | 'pdu' | 'shelf' | 'cable-manager' | 'other'`; `itemType?: RackItemType` and `itemText?: string` on `EquipmentDetails` and `Details`; `EquipmentInput.kind` gains `'rack_item'` and its `role` gains `'none'`. If `npm run typecheck` then fails on an exhaustive switch or a `Record` keyed by kind, add the `rack_item` case with the plainest value (e.g. a label `'Rack item'`) and list each such place in your report; **never cast**. Do no other frontend work.

## Tests first (write them, run them, see them fail, then the code)

Cover RI-01 to RI-06 from the plan:

- **RI-01** `Validate` (a new `internal/topology/rack_item_test.go` is fine): each of the five types valid; each message above for its case; a rack item colliding on units with a switch is the existing collision error.
- **RI-02** `add_equipment` rack item: added with its details and **no endpoints**, label filled; refused with a port count, port groups, a network, no type; a taken unit gives the existing "… is taken by …" message.
- **RI-03** move, delete and `remove_change` of a rack item in a plan (`add_equipment:`, `place_equipment:`, `remove_equipment:` keys).
- **RI-04** direct fix: Shelf → Other with a text; Other → UPS with `itemText: ""`; Other → UPS **keeping** the text refused; `itemType` on a switch refused; revision unchanged; `change_log` rows with fields `itemType` / `itemText` (`fixes` unit test and the `persistence` DB test).
- **RI-05** DB round trip: record a plan that adds a rack item; it reads back with kind, role, type and text. Inserting a rack item without a type directly in SQL fails on the 010 constraint.
- **RI-06** HTTP: `add_equipment` rack item 200; `add_cable` to an endpoint ID on it 422 (there is none, so use a hand-made endpoint ID and expect the existing unknown-endpoint 422, or build the snapshot so the "has no ports" message is reachable; say which); the fix `PATCH` of its type 200.

## Rules

- If the design cannot work as written, **stop and report the exact problem**; do not invent another behaviour.
- Touch only the files named above and their tests.
- **Do not commit.**

## Verify

- From `backend/`: `go test -race ./...` **with `TEST_DATABASE_URL` set** (local Postgres: `docker compose up -d --wait` from the repo root; say whether the DB tests ran), and `go vet ./...`.
- The redocly lint.
- From `frontend/`: `npm run typecheck` and `npm test`.

## Report

The red runs (the failing test output before the code), the green runs, `git diff --stat` and the full diff, every place you added a `rack_item` case in the frontend, and anything you did differently from this prompt and why.
