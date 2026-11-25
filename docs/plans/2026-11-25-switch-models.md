# Switch models and adding devices — Implementation Plan

> **For agentic workers:** process in [way-of-work.md](../way-of-work.md): a Sonnet subagent implements one task at a time, test first, never commits; Opus reviews each task. Backend and frontend tasks are separate subagents.

**Goal:** D51 and [roadmap.md, "Switch models and adding devices"](../roadmap.md) (the spec; read it with this plan), as in [the demo](../history/demos/switch-models-demo.html) (the reference for look, wording and behaviour).

**Architecture:** Switch models are library data in a new table with a small CRUD API (like networks: no revision, no plan). Adding a switch stays `add_equipment` with `portGroups`, `height` and details copied from the model on the client. Set model is a batch of direct fixes (`POST /api/installed/fixes`) that gains one field, an endpoint's `portGroup`. The add box replaces the three add forms on the rack level.

**Tech stack:** Go `net/http` + pgx + embedded migrations; React + TypeScript + TanStack Query; Vitest; Playwright on lanes.

## Global constraints

- A model: `name` 1–100 characters, trimmed, unique ignoring case; `manufacturer` 0–200; `height` 1–10; `portGroups` 1–8 groups, 1–96 ports, each `{count, names, start, details{portType, connector, speed}}` checked by **the same code and messages** as `add_equipment`'s port groups (no `labels` form in a model).
- A model is never topology: no revision change, no draft goes stale, never in a plan, a trace or the snapshot.
- A switch copies its model; nothing links a switch to a model except its `model` detail (the model's name).
- Set model always sets the `manufacturer` and `model` details; for the ports it fills only what is empty (blank port fields; a port name equal to `Port {position}`); it offers only models with the same port count and, when the switch has more than one group, the same group sizes in order; it sets groups only when the switch has one group today, and it never changes ports, positions, IDs, cables, network, role, height or place. Installed only.
- Renaming a model offers to update the `model` detail of every installed switch whose detail equals the old name (trimmed, ignoring case): one direct-fix batch, Installed only.
- Wording as in the demo: "Manage models…", "+ New model…", "Ports, in order", "How it will look", "How many", "like the other switches in this rack", "Set model…", "What changes", "Left as typed", "Set model in Installed", "Models are shared; they are not part of the plan", "Update their Model detail too?", "Update them from Installed".
- Migrations are append-only (`011_switch_models.sql`); `api/openapi.yaml`, `frontend/src/shared/types.ts` change with the API. Feature CSS uses `var(--…)` only. Names are `<Name>` pieces. Specs import from `e2e/fixtures.ts`. Do not commit.

## Review focus

- A model renamed to a name another model has with different case → 409, the editor says so.
- A model deleted while its card is dragged or the add box is open → the box says the model is gone, nothing is added (Task 5 test).
- How many larger than the free units below → the box refuses in words, Add disabled (Task 5 test).
- Set model on a switch whose ports were renamed by hand ("Gi0/1") → names kept and listed under Left as typed (Task 4 test).
- Set model on a 24 + 24 + 4 switch with a 48 + 4 model → the model is not offered and says why; nothing is written by position onto the wrong ports (Task 3 test).
- Hebrew and long model and switch names → isolated (`<Name>`), cut at the end in cards (Task 5 test).

---

### Task 1 (backend): switch models in the database and the API

**Files:** create `backend/migrations/011_switch_models.sql`, `backend/internal/persistence/models.go` (+ `models_test.go`, database tests); modify `backend/internal/httpapi/server.go` (Repository, routes; + `models_api_test.go` with a fake), `api/openapi.yaml`, `frontend/src/shared/types.ts`, `frontend/src/shared/api.ts` (+ `api.test.ts`).

**Interfaces — produces:**
- Table `switch_models(id text PK, seq bigserial, name text NOT NULL, manufacturer text NOT NULL DEFAULT '', height int NOT NULL CHECK 1..10, port_groups jsonb NOT NULL, created_at, updated_at)`, unique index on `lower(btrim(name))`.
- Go `planning.SwitchModel{ID, Name, Manufacturer string; Height int; PortGroups []planning.PortGroupInput}` (or the type `add_equipment` already uses for groups — reuse it), and `Repository`: `SwitchModels(ctx) ([]SwitchModel, error)` (by name, ignoring case), `CreateSwitchModel(ctx, SwitchModel) (SwitchModel, error)`, `UpdateSwitchModel(ctx, id string, SwitchModel) (SwitchModel, error)`, `DeleteSwitchModel(ctx, id string) error`.
- HTTP: `GET /api/switch-models` → `200 [{id,name,manufacturer,height,portGroups}]`; `POST /api/switch-models` → `201`; `PUT /api/switch-models/{id}` → `200`; `DELETE /api/switch-models/{id}` → `204`. IDs `model-<random>`. 422 for an invalid model (the port group messages prefixed by the model's name, e.g. `C9300-48P: port group 2: Names must contain {n} once`), 409 duplicate name, 404 unknown ID, 400 unknown fields or a `labels` group.
- TS: `SwitchModel`, `SwitchModelInput`; `api.switchModels()`, `api.createSwitchModel(input)`, `api.updateSwitchModel(id, input)`, `api.deleteSwitchModel(id)`.

- [ ] **Step 1: failing tests.** Persistence (DB): create, list sorted by name, update, delete, duplicate name ignoring case and spaces → conflict, the topology revision and every draft unchanged after each write. Validation (pure): an empty name, 101 characters, height 0 and 11, 9 groups, 97 ports, a pattern without `{n}`, a `labels` group → `ErrInvalidInput` with the add_equipment message. HTTP with a fake: each status above; `GET` of an empty list is `[]`. `api.test.ts`: the four calls' URLs, methods and bodies.
- [ ] **Step 2:** run (`go test ./internal/persistence ./internal/httpapi -run SwitchModel`, `npx vitest run src/shared/api.test.ts`) and see them fail.
- [ ] **Step 3:** implement. Reuse the port-group checker of `add_equipment` (find it from `planning.Execute`'s `add_equipment` case) rather than a copy.
- [ ] **Step 4:** `go test -race ./...` with `TEST_DATABASE_URL`, `go vet ./...`, `npm test`, `npm run typecheck`, the OpenAPI lint; say whether the DB tests ran.

### Task 2 (backend): an endpoint's port group as a direct fix

**Files:** modify `backend/internal/fixes/fixes.go`, `many.go` (+ tests), `backend/internal/httpapi/server.go` (`fixFields`; + `fix_many_api_test.go`), `api/openapi.yaml`, `frontend/src/shared/types.ts`.

**Interfaces — produces:** `fixes.Fix.PortGroup *int` (nil leaves it); in a fix body `"portGroup": n` for kind `endpoint`. Accepted only on a switch port, 1–8; refused (422) on anything else. The change log field is `portGroup`. `ApplyMany` validates once at the end, so a batch that regroups all 52 ports in one request is accepted.

- [ ] **Step 1: failing tests.** `fixes`: a switch port's group 1 → 2 gives one Change `portGroup 1 → 2` and leaves position, label and ID; on a panel position, an HDF endpoint or a switch with no positions (`Position == 0`) → invalid; 0 and 9 → invalid. `httpapi`: `POST /api/installed/fixes` with 52 fixes (names, details and `portGroup`) is one 200; `portGroup` on a cable → 422. The revision is unchanged.
- [ ] **Steps 2–4:** run (fail), implement, `go test -race ./...` (DB tests on), `go vet`, the OpenAPI lint.

### Task 3 (frontend, pure): the models' logic

**Files:** create `frontend/src/features/models/model.ts` + `model.test.ts`; reuse `features/planning/portGroups.ts` (`GroupRow`, `checkGroups`).

**Interfaces — produces:**
- `modelRows(m: SwitchModel): GroupRow[]`, `modelFromRows(name, manufacturer, height, rows): { input: SwitchModelInput } | { error: string }` (the editor; `checkGroups` for the groups).
- `modelPortCount(m): number`; `modelLabels(m): string[]` (port names in order, `names` with `{n}` from `start`).
- `addSwitchCommands(m, place: {rackId, units: number[]}, names: string[], role, networkId): PlanCommand[]` — one `add_equipment` per name with the model's `portGroups`, `height` and `details: {manufacturer, model: m.name}`.
- `stackUnits(occupied: Set<number>, rackUnits: number, top: number, height: number, count: number): number[] | null` — the lowest unit of each device, stacked down from `top`; null when they do not fit.
- `suggestName(names: string[]): string` — the highest trailing number among `names` plus one, keeping prefix and padding (`['EDGE-31','EDGE-32'] → 'EDGE-33'`, `['AGG-9'] → 'AGG-10'`, none → `''`); `seriesNames(first: string, count: number): string[]` (`EDGE-33 ×3 → EDGE-33, EDGE-34, EDGE-35`; no trailing number → `X, X 2, X 3`).
- `defaultNetwork(rackSwitchNetworks: string[], headerNetwork?: string): { id?: string; why?: 'rack' | 'header' }`.
- `setModelPlan(sw: Equipment, ports: Endpoint[], m: SwitchModel): { fixes: FixInput[]; filled: Line[]; kept: Line[] } | { error: 'ports' | 'groups'; why: string }` — by position; always sets `manufacturer` and `model` (a changed value is a `filled` line `old → new`); fills blank port fields and names equal to `Port {position}`; `portGroup` for every port only when all ports are in one group today; `kept` lists each differing port value left alone; `{error:'ports'}` when the counts differ, `{error:'groups'}` when the switch has more than one group and their sizes in order differ from the model's (`why`: "its groups are 48 + 4; this switch's are 24 + 24 + 4").
- Ports saved before 2026-10-11 (migration 008) have position 0 and group 0 (the acceptance fixture's switches too). For them `setModelPlan` goes by the face's order (`switchBank`'s order: the number in the label) and sends no `portGroup` (the server refuses a group without a position); the dialog says "This switch's ports have no positions, so its face stays one group". Task 4's D51-02 uses a switch added in the spec (positions 1…52), not an acceptance switch.
- `renameTargets(equipment: Equipment[], oldName: string): Equipment[]` — the switches whose `model` detail equals `oldName`, trimmed and ignoring case.

- [ ] **Step 1: failing tests** for each function with the demo's values (C9300-48P: 48 × `Gi1/0/{n}` copper RJ45 1G + 4 × `Te1/1/{n}` fiber SFP+ 10G = 52; EDGE-31 with Port 1 speed `100M` → kept; a port named `Gi0/1` → kept; a switch already in 48 + 4 groups → no `portGroup` fixes; a switch in 24 + 24 + 4 → `error: 'groups'` with its `why`; a Model detail `9300` → set to `C9300-48P` and shown `9300 → C9300-48P`; 24 ports vs 52 → `error: 'ports'`); `renameTargets` with ` c9300-48p ` (matches) and `9300` (does not); `stackUnits` with a taken unit in the way and at U1; `suggestName` with Hebrew prefixes and padding `EDGE-09 → EDGE-10`.
- [ ] **Steps 2–4:** run (fail), implement, `npm test`, typecheck.

### Task 4 (frontend): the Switch models page and Set model…

**Files:** create `features/models/ModelsPage.tsx`, `ModelEditor.tsx`, `SetModelDialog.tsx`, `models.css`, `useSwitchModels.ts` (TanStack query + mutations); modify `app/App.tsx` (a page `MapView` `'models'` with ← Back to where it came from, like the Trace page), `features/physical/EquipmentPage.tsx` (⋯ menu: Set model…, switches only; disabled in a plan with "Set model in Installed"), `features/inventory/` (Set model… for selected switches: the same dialog for many, mismatched switches listed and skipped), `shared/theme.css` if a size is new.

- **Page:** list (name; manufacturer · height · N ports) and `+ New model`; the editor (Model name, Manufacturer, Height (U); Ports, in order: Count, Names, From, Type, Connector, Speed, ×; + Add a group of ports; "N ports in G groups"); **How it will look** drawn with the real faceplate (`FaceView` of a face built from the rows, `layoutPlate`), updating as you type; Save model (errors from `modelFromRows` or the server's 409/422 under the form), Delete… (confirm: "Switches added from it keep their ports."); empty: "No models yet." and the note "A switch copies its model's ports when it is added. Editing or deleting a model never changes switches already added."
- **Set model…:** the dialog of the demo (models `setModelPlan` accepts enabled, others disabled with "(this switch has N)" or the groups' `why`; What changes sections: Details, Port names (3 shown, "… and N more"), Type, connector and speed, Groups; Left as typed; Apply → one `POST /api/installed/fixes` with note `Set model <name>`; then refetch topology and history as `onFixed` does).
- **Rename offer:** after saving a model whose name changed, when `renameTargets` finds switches: "N switches say <old>. Update their Model detail too?" with Update (one `POST /api/installed/fixes`, note `Model renamed to <new>`) and Not now; in a plan the same line without the button, ending "Update them from Installed". The page shows "Models are shared; they are not part of the plan" while a plan is open.
- [ ] **Step 1: failing tests:** Playwright `D51-01` make a model with two groups, see the preview's 52 jacks and two captions, rename to an existing name differing in case → the 409 message, delete it; rename a model two acceptance switches carry in their Model detail (set through the API in the spec) → the offer says 2, Update, both switches' History shows it; in a plan the offer has no button; `D51-02` Set model on a 52-port acceptance switch (create the model through the API in the spec) shows What changes, Apply, the face is two banks, History lists the changes, a hand-typed speed is kept; disabled in a plan; `D51-03` Inventory: two switches selected, one with another port count → one set, one listed as skipped.
- [ ] **Steps 2–4:** run (fail), implement, `npm test`, typecheck, build, format:check, the new specs on the remote.

### Task 5 (frontend): the library and the small box at the unit

**Files:** modify `features/planning/LibraryItems.tsx` (the Add tab's library: Switches by model with + New model… and Manage models…, Passive: Patch panel, HDF; Rack items: one per type from `shared/rackItems.ts`; click to pick with the note and Esc), `features/physical/drops.ts` (+ test: payloads `new:model:<id>`, `new:panel`, `new:hdf`, `new:rack_item:<type>`; the old `new:switch…` payloads go), `features/physical/RackLevel.tsx` / `RackElevation.tsx` (the box anchored at the unit; the units it will take marked; in a plan only), create `features/planning/AddBox.tsx` (+ `addBox.ts` pure state if needed); delete `AddEquipmentForm.tsx`, `HdfForm.tsx`, `AddRackItemForm.tsx` and their now-unused helpers and tests (keep `portGroups.ts`, used by the editor); modify `app/App.tsx` wiring (`PendingEquipment` becomes the box's request; a drop on a rack without a unit opens the rack level with the box at the first unit that fits; picking with no rack shown opens the Site › Node › Rack picker, `patching/LocationPicker`).
- **The box** (Enter adds, Esc cancels, focus returns to the unit; `useInlineDialog`): switch — Name (`suggestName` over the node's switches of the chosen role, re-suggested when the role changes until the name is edited), Role Access | AGG | BB, Network (`defaultNetwork`; "like the other switches in this rack"), How many (1–12, `seriesNames` listed); panel — Name, Positions 3 · 6 · 12 · 24 · Other… (1–48), How many, starting with the session's last count; HDF — Name, Rows, Height (U), starting with the session's last HDF else 12 and 4; rack item — Name (`suggestedRackItemName`), Height (the type's default), What it is for Other. Add sends one `batch` through `PlanEdit` (several `add_equipment`, or `add_hdf`); the server's refusal shows in the box.
- [ ] **Step 1: failing tests:** `drops.test.ts`; Playwright `D51-04` drag C9300-48P (made in the spec) onto a free unit of Rack A03 in the Expansion draft, the box suggests the next EDGE name and Network A "like the other switches in this rack", How many 2 adds two with the model's 52 ports and the Model detail, Changes lists both; `D51-05` click-to-pick a 12-position panel (Other… 12 is also fine via 12) and an HDF with 12 rows and 4U; `D51-06` How many beyond the free units → the refusal, Add disabled; a deleted model → "This model is gone"; `D51-07` a long Hebrew model name in the library card. Existing specs that used the Add forms (`editing`, `planning`, `rack-items`, `rack-items.recording`, `portgroups`, `placement`, `duplicate`, …) move to the box; `portgroups` specs about the Add form's groups move to the model editor or are retired (say which).
- [ ] **Steps 2–4:** run (fail), implement, all checks, then the whole suite on the remote (`npm run test:e2e:remote`).

### Task 6 (Opus): review at the owner's sizes, the docs

- Screenshots at 1536×864 and 1920×1080: the library, the box for each kind, the models page, Set model's dialog, a switch before and after Set model.
- Docs: `status.md`, `ui-spec.md` (the Add tab, the box, the models page, Set model), `architecture.md` (switch models as library data), `acceptance-tests.md` (D51-01…), `testing.md` if needed, `CLAUDE.md` (`features/models/`, the removed forms, migration 011), README if the migration needs a word. The deploy has a **migration (011)**.
