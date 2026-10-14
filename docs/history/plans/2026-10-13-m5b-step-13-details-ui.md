# M5b Step 13: Details UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user see and edit detail fields and see history in the app: the inspector's Overview shows the equipment's details with **Edit details**, a new **History** tab lists direct fixes and recorded plans, the Physical endpoint detail shows **Port details** with **Edit port details**, and reserved / disabled / faulty ports are drawn hatched on the faceplate.

**Architecture:** A new feature folder `frontend/src/features/details/` holds a pure, unit-tested model (field specs, value lists, `changedFix`, history lines) and thin components (`DetailsEditor`, `EquipmentDetails`, `PortDetails`, `HistoryTab`). On **Installed**, saving calls the step 12 API (`fixInstalled`), then App's new `onFixed` refetches every topology query and the history (a fix does not change the revision, so nothing refetches by itself). In a **plan**, details of **proposed** objects are saved with the existing `update_details` command through `PlanEdit`; installed objects show a hint instead. The faceplate gets a `portState` per jack and three CSS patterns. Task 1 first fixes three small issues found in the step 12 review.

**Tech Stack:** React 19 + TypeScript, TanStack Query 5, Vitest, Playwright; Go 1.26 for Task 1.

**Spec:** `docs/implementation-plan.md` → "M5 design" item **11. Details UI (M5b)**, the M5 steps row **13** (tests FD-04, FD-05), answers **3** and **19**. The approved look is the M5 demo, `docs/demos/m5-demo.html` (open it in a browser; inspector **Overview / Ports / History**, "Details" with **Edit details**, "Why (optional, kept in history)", endpoint **Port details** with **Edit port details**, the hatched `.st-reserved`, `.st-disabled`, `.st-faulty` jacks around line 143). The step 12 API is in `api/openapi.yaml` (`/installed/{kind}/{id}`, `/change-log`).

## Read first (in this order)

1. `AGENTS.md`, `CLAUDE.md`.
2. `docs/implementation-plan.md` → item 11 and row 13; `docs/current-status.md` → "Direct fixes and change log (M5b step 12)".
3. `frontend/src/shared/api.ts` (`fixInstalled`, `getChangeLog`, `recordedPlansFor`) and `frontend/src/shared/types.ts` (`DirectFix`, `ChangeLogEntry`, `Details`, `Equipment`, `Endpoint`, `Plan`).
4. `frontend/src/features/inspector/Inspector.tsx` and `Overview.tsx`; `frontend/src/features/physical/EquipmentPage.tsx`, `EndpointDetail.tsx`, `FaceView.tsx`, `faces.ts`.
5. `frontend/src/features/planning/useInlineDialog.ts`, `useAsyncAction.ts`, `ConfirmShell.tsx` (`EditError`), `editing.ts` (`PlanEdit`).

## Global Constraints

- **No automatic commits.** Do not `git commit` or `git push`. Stop for review at the end of Task 7.
- **Test-first** for the pure model and the Go change. Components are covered by Playwright.
- **No new dependencies, no migration, no new API endpoint.** Step 12 already provides `PATCH /api/installed/{kind}/{id}` and `GET /api/change-log`; plans already accept `update_details`.
- **Locked decision 6:** a port state is data. It never changes a trace. The faceplate only draws it.
- **Locked decision 10:** a direct fix changes no topology and never records a plan.
- **Where editing happens:**
  - Installed → **direct fix** (`fixInstalled`), with an optional note "Why (optional, kept in history)", for any installed equipment or port.
  - A current plan, **proposed** object → `update_details` through the one `PlanEdit` (no name change: `update_details` has no name; renaming a proposed object stays out of scope).
  - A current plan, **installed** object → no edit button; the hint "Details of installed equipment are fixed on Installed, without a plan."
  - A stale draft or a recorded plan → `edit` is undefined; treat as the installed-object case (hint only).
- **Port rename:** only a switch port with a position (`position > 0`); panel/HDF positions and ports saved before positions show no Name field.
- **Value lists in the forms are dropdowns** (this also answers the owner's request for dropdowns): status `active | inactive | maintenance`; port type `copper | fiber`; state `available | reserved | disabled | faulty`; connector `RJ45, LC, SC, ST, SFP, SFP+, QSFP`; speed `100M, 1G, 2.5G, 5G, 10G, 25G, 40G, 100G`. Each select also has "—" (empty, clears the field) and keeps a current value that is not in its list (shown as is), so nothing saved earlier is lost.
- **After every successful fix** call `onFixed(message)` (Task 3): it refetches `['topology']`, `['plans']` and `['history']` and shows the green toast. After a plan save, `PlanEdit` already refreshes and toasts.
- **Accessibility:** every form opens through `useInlineDialog` (focus in, Escape closes, focus back to its button marked `data-opener`), as every inline form in the app does (answer 19).
- **Keep in sync:** `docs/current-status.md`, `docs/implementation-plan.md` (row 13 done), `CLAUDE.md`, `AGENTS.md` (next is step 14). No OpenAPI change except Task 1's wording (none needed).
- **Commands** (Postgres up: `docker compose up -d --wait` at the repo root; `.env` holds `TEST_DATABASE_URL`):
  - backend: `cd backend && go test -race ./... && go vet ./...`
  - frontend: `cd frontend && npm test && npm run typecheck && npm run build && npm run format:check` (`npm run format` to fix)
  - one Vitest file: `cd frontend && npx vitest run src/features/details/model.test.ts`
  - one Playwright file: `cd frontend && npx playwright test e2e/details.recording.spec.ts`
  - all browser tests: `cd frontend && npm run test:e2e`
  - **Use `npm test`, never a bare `npx vitest run` at `frontend/`**: the bare command also picks up the Playwright files and fails.

## Review Focus

1. **The screen after a fix shows the new value without a reload.** A fix keeps the topology revision, so the cached snapshots must be refetched explicitly (Installed and every plan, because a plan is drawn on Installed). Pinned in Task 6 (FD-04 checks the Overview right after Save fix, and that the revision did not change).
2. **A value saved before that is not in a dropdown list** (connector "MPO", speed "800G") stays selected and is not cleared by an unrelated save. Pinned in Task 2 (`optionsFor` keeps it; `changedFix` sends only changed fields).
3. **Saving an unchanged form** sends nothing and just closes. Pinned in Task 2 (`hasChanges` false) and used by `DetailsEditor`.
4. **A refused save** (duplicate name, duplicate serial) keeps the form open with the server's words and writes nothing. Pinned in Task 6 (FD-04, the refused-fix test).
5. **A cabled jack with a state** shows both: the network color **and** the hatch. The current inline `background` shorthand would erase the pattern. Pinned in Task 5 (the inline style becomes `backgroundColor`) and Task 6 (FD-05 checks the class on a jack).

---

## File Structure

| File | Responsibility |
| --- | --- |
| Modify `backend/internal/httpapi/server.go`, `backend/internal/httpapi/fix_api_test.go` | Task 1: deterministic 422, `null` means not given |
| Create `backend/internal/persistence/fix_campus_test.go` | Task 1: one fix timed on the campus fixture |
| Create `frontend/src/features/details/model.ts`, `model.test.ts` | Pure: field specs, value lists, `optionsFor`, values of an object, `changedFix`, `hasChanges`, `editMode`, history lines |
| Create `frontend/src/features/details/DetailsEditor.tsx`, `details.css` | The one inline form for any field list |
| Create `frontend/src/features/details/EquipmentDetails.tsx` | Overview's Details block (view + Edit details) |
| Create `frontend/src/features/details/PortDetails.tsx` | Endpoint detail's Port details block |
| Create `frontend/src/features/details/HistoryTab.tsx` | The inspector's History tab |
| Modify `frontend/src/app/App.tsx` | `onFixed` (refetch + toast) passed down |
| Modify `frontend/src/features/inspector/Inspector.tsx`, `Overview.tsx` | Details block and History tab |
| Modify `frontend/src/features/physical/PhysicalExplorer.tsx`, `EquipmentPage.tsx` | Port details, `onFixed` |
| Modify `frontend/src/features/physical/faces.ts`, `FaceView.tsx`, `physical.css`, `faces.test.ts` | `portState` on jacks, hatch, legend |
| Create `frontend/e2e/details.recording.spec.ts` | FD-04, FD-05 |
| Modify docs | Task 7 |

---

### Task 1: Step 12 review fixes and the campus timing

**Files:**
- Modify: `backend/internal/httpapi/server.go` (the `PATCH /api/installed/{kind}/{id}` handler)
- Modify: `backend/internal/httpapi/fix_api_test.go`
- Create: `backend/internal/persistence/fix_campus_test.go`
- Modify: `docs/current-status.md` (two wording slips)

**Interfaces:** none new. The HTTP contract is unchanged except: a body with both a topology field and an unknown field now always answers 422 (naming the first topology field in sorted order), and a JSON `null` for `name`, `details` or `note` means "not given".

- [ ] **Step 1: Write the failing HTTP test**

Append to `backend/internal/httpapi/fix_api_test.go`:

```go
// Review fix 1 and 2: the answer never depends on map order, and null means "not given".
func TestFixAnswersAreDeterministicAndNullMeansNotGiven(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	for i := 0; i < 25; i++ {
		msg := errorOf(t, call("PATCH", "/api/installed/equipment/agg-03", `{"zeta":1,"unit":3,"colour":"red","rackId":"rack-dr01"}`, 422))
		if msg != "rackId changes the topology: use a plan" {
			t.Fatalf("try %d: %q", i, msg)
		}
	}
	got := decodeBody[fixAnswer](t, call("PATCH", "/api/installed/equipment/agg-03", `{"name":null,"details":null,"note":null}`, 200))
	if got.Changes == nil || len(got.Changes) != 0 {
		t.Fatalf("null fields must change nothing: %+v", got.Changes)
	}
}
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd backend && go test ./internal/httpapi -run TestFixAnswersAreDeterministic -v`
Expected: FAIL (either a 400 on some try, or a 422 "a name must be 1–100 characters" for `"name":null`). It must not SKIP.

- [ ] **Step 3: Fix the handler**

In `server.go`, add `"maps"` and `"slices"` to the imports. In the `PATCH /api/installed/{kind}/{id}` handler, replace the block from `f := fixes.Fix{Kind: kind, ID: r.PathValue("id")}` through the end of the `for key, raw := range body { … }` loop with:

```go
		f := fixes.Fix{Kind: kind, ID: r.PathValue("id")}
		keys := slices.Sorted(maps.Keys(body))
		// Topology fields first, in sorted order, so a body that also has an
		// unknown field always gets the same answer.
		for _, key := range keys {
			if topologyFields[key] {
				problem(w, 422, key+" changes the topology: use a plan")
				return
			}
		}
		for _, key := range keys {
			raw := body[key]
			if string(bytes.TrimSpace(raw)) == "null" {
				continue // null means "not given"
			}
			switch key {
			case "name":
				var name string
				if json.Unmarshal(raw, &name) != nil {
					problem(w, 400, "Invalid request JSON")
					return
				}
				f.Name = &name
			case "note":
				if json.Unmarshal(raw, &f.Note) != nil {
					problem(w, 400, "Invalid request JSON")
					return
				}
			case "details":
				decoder := json.NewDecoder(bytes.NewReader(raw))
				decoder.DisallowUnknownFields()
				if decoder.Decode(&f.Details) != nil {
					problem(w, 400, "Invalid request JSON")
					return
				}
			default:
				problem(w, 400, "Invalid request JSON")
				return
			}
		}
```

- [ ] **Step 4: Run the HTTP tests**

Run: `cd backend && go test ./internal/httpapi -run 'TestFix|TestFX0' -v`
Expected: PASS (the new test and the step 12 tests).

- [ ] **Step 5: Add the campus timing test**

Create `backend/internal/persistence/fix_campus_test.go`:

```go
package persistence

import (
	"context"
	"testing"
	"time"

	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/scalefixture"
	"nettop.local/backend/internal/topology"
)

// A direct fix loads and validates the whole installed topology while it holds
// the installed lock. This measures it on the campus fixture (a measurement,
// not a budget; the bound only catches a pathological slowdown).
func TestFixOnCampusIsMeasured(t *testing.T) {
	if testing.Short() {
		t.Skip("seeding the campus takes a while")
	}
	s, _ := testStore(t)
	ctx := context.Background()
	campus := scalefixture.Campus()
	if err := s.Seed(ctx, campus); err != nil {
		t.Fatal(err)
	}
	id := campus.Equipment[0].ID
	start := time.Now()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: id, Details: topology.Details{Description: ptr("timed")}}); err != nil {
		t.Fatal(err)
	}
	took := time.Since(start)
	t.Logf("one direct fix on the campus (%d equipment, %d endpoints, %d links): %v",
		len(campus.Equipment), len(campus.Endpoints), len(campus.Links), took)
	if took > 5*time.Second {
		t.Fatalf("a fix took %v", took)
	}
}
```

(`ptr` is defined in `details_test.go` in the same package.)

Run: `cd backend && go test ./internal/persistence -run TestFixOnCampusIsMeasured -v`
Expected: PASS, and a log line with the time. **Write the time down**; Task 7 records it in current-status.

- [ ] **Step 6: Fix the two doc slips**

In `docs/current-status.md`:
- First paragraph: change "It does not imply that the approved product is finished: detail fields, direct fixes and the inventory view (M5b), …" to "It does not imply that the approved product is finished: the details UI and the inventory view (M5b), …".
- Detail fields (step 11) section, the "**Not yet:**" line: change "any UI for details (the Overview fields, Edit details and History are step 13), the UI for details and direct fixes (step 13), the inventory view." to "the UI for details and direct fixes (the Overview fields, Edit details and History; step 13), the inventory view."

- [ ] **Step 7: Backend green**

Run: `cd backend && go test -race ./... && go vet ./...`
Expected: PASS. Do not commit.

---

### Task 2: The pure details model

**Files:**
- Create: `frontend/src/features/details/model.ts`
- Test: `frontend/src/features/details/model.test.ts`

**Interfaces:**
- Consumes: types `Equipment`, `Endpoint`, `DirectFix`, `Details`, `ChangeLogEntry`, `Plan` from `../../shared/types`.
- Produces (used by Tasks 3–6):
  - `type FieldKey = 'name' | 'manufacturer' | 'model' | 'serialNumber' | 'ipAddress' | 'status' | 'description' | 'portType' | 'connector' | 'speed' | 'state'`
  - `interface FieldSpec { key: FieldKey; label: string; kind: 'text' | 'textarea' | 'select'; options?: readonly string[]; mono?: boolean }`
  - `type Values = Partial<Record<FieldKey, string>>`
  - `type EditMode = 'fix' | 'plan' | 'none'`
  - consts `EQUIPMENT_STATUSES`, `PORT_TYPES`, `PORT_STATES`, `CONNECTORS`, `SPEEDS`, `EQUIPMENT_FIELDS`, `PORT_FIELDS`, `FIELD_LABELS`
  - `editMode(context: 'installed' | 'planned', proposed: boolean, canEdit: boolean): EditMode`
  - `equipmentFields(mode: EditMode): readonly FieldSpec[]`
  - `portFields(mode: EditMode, canRename: boolean): readonly FieldSpec[]`
  - `canRenamePort(equipment: Pick<Equipment,'kind'>, endpoint: Pick<Endpoint,'position'>): boolean`
  - `equipmentValues(e: Equipment): Values`, `portValues(p: Endpoint): Values`
  - `optionsFor(spec: FieldSpec, current: string): string[]` (always starts with `''`)
  - `changedFix(fields: readonly FieldSpec[], before: Values, after: Values, note?: string): DirectFix`
  - `hasChanges(fix: DirectFix): boolean`
  - `fixLine(e: ChangeLogEntry): { id: number; at: string; field: string; from: string; to: string; note?: string }`
  - `recordedLine(p: Plan): { id: string; at: string; name: string; note: string; by: string }`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/details/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ChangeLogEntry, Endpoint, Equipment, Plan } from '../../shared/types'
import {
  EQUIPMENT_FIELDS,
  PORT_FIELDS,
  canRenamePort,
  changedFix,
  editMode,
  equipmentFields,
  equipmentValues,
  fixLine,
  hasChanges,
  optionsFor,
  portFields,
  portValues,
  recordedLine,
} from './model'

const agg: Equipment = {
  id: 'agg-03',
  name: 'AGG-03',
  kind: 'switch',
  role: 'aggregation',
  networkId: 'net-a',
  rackId: 'rack-core-01',
  unit: 8,
  height: 1,
  manufacturer: 'Cisco',
  status: 'active',
}

describe('FD-model where details are edited', () => {
  it('fixes on Installed, saves in a plan only for proposed objects, and otherwise only shows', () => {
    expect(editMode('installed', false, false)).toBe('fix')
    expect(editMode('planned', true, true)).toBe('plan')
    expect(editMode('planned', false, true)).toBe('none')
    expect(editMode('planned', true, false)).toBe('none') // stale or recorded
  })

  it('a plan cannot rename (update_details has no name)', () => {
    expect(equipmentFields('fix').map((f) => f.key)).toContain('name')
    expect(equipmentFields('plan').map((f) => f.key)).not.toContain('name')
  })

  it('only a switch port with a position can be renamed, and only by a fix', () => {
    expect(canRenamePort({ kind: 'switch' }, { position: 3 })).toBe(true)
    expect(canRenamePort({ kind: 'switch' }, {})).toBe(false)
    expect(canRenamePort({ kind: 'panel' }, { position: 3 })).toBe(false)
    expect(portFields('fix', true).map((f) => f.key)).toContain('name')
    expect(portFields('fix', false).map((f) => f.key)).not.toContain('name')
    expect(portFields('plan', true).map((f) => f.key)).not.toContain('name')
  })
})

describe('FD-model values and dropdowns', () => {
  it('reads every field, empty when not set', () => {
    expect(equipmentValues(agg)).toEqual({
      name: 'AGG-03',
      manufacturer: 'Cisco',
      model: '',
      serialNumber: '',
      ipAddress: '',
      status: 'active',
      description: '',
    })
    const port: Endpoint = {
      id: 'agg-03:p2',
      equipmentId: 'agg-03',
      label: 'Te1/1/2',
      position: 2,
      connector: 'MPO',
    }
    expect(portValues(port)).toEqual({
      name: 'Te1/1/2',
      portType: '',
      connector: 'MPO',
      speed: '',
      state: '',
      description: '',
    })
  })

  it('a dropdown starts with the empty choice and keeps a saved value that is not in its list', () => {
    const connector = PORT_FIELDS.find((f) => f.key === 'connector')!
    expect(optionsFor(connector, '')).toEqual([
      '',
      'RJ45',
      'LC',
      'SC',
      'ST',
      'SFP',
      'SFP+',
      'QSFP',
    ])
    expect(optionsFor(connector, 'MPO')).toEqual([
      '',
      'RJ45',
      'LC',
      'SC',
      'ST',
      'SFP',
      'SFP+',
      'QSFP',
      'MPO',
    ])
    const status = EQUIPMENT_FIELDS.find((f) => f.key === 'status')!
    expect(optionsFor(status, 'active')).toEqual([
      '',
      'active',
      'inactive',
      'maintenance',
    ])
  })
})

describe('FD-model what a save sends', () => {
  const fields = equipmentFields('fix')
  const before = equipmentValues(agg)

  it('sends only the changed fields, trimmed; the name separately; an emptied field as ""', () => {
    const fix = changedFix(
      fields,
      before,
      { ...before, name: ' AGG-03A ', model: 'C9500 ', manufacturer: '' },
      ' Asset audit ',
    )
    expect(fix).toEqual({
      name: 'AGG-03A',
      details: { manufacturer: '', model: 'C9500' },
      note: 'Asset audit',
    })
    expect(hasChanges(fix)).toBe(true)
  })

  it('an unchanged form sends nothing, and a note alone is not a change', () => {
    const fix = changedFix(fields, before, { ...before, model: '  ' }, 'why')
    expect(fix).toEqual({ note: 'why' })
    expect(hasChanges(fix)).toBe(false)
  })
})

describe('FD-model history lines', () => {
  it('says the field in words and shows an empty value as (empty)', () => {
    const entry: ChangeLogEntry = {
      id: 7,
      at: '2026-10-13T09:10:00Z',
      entityKind: 'equipment',
      entityId: 'agg-03',
      field: 'serialNumber',
      oldValue: '',
      newValue: 'SN-1',
      note: 'Asset audit',
    }
    expect(fixLine(entry)).toEqual({
      id: 7,
      at: '2026-10-13T09:10:00Z',
      field: 'Serial number',
      from: '(empty)',
      to: 'SN-1',
      note: 'Asset audit',
    })
  })

  it('a recorded plan reads with its name, note and who recorded it', () => {
    const plan = {
      id: 'p1',
      name: 'Expansion',
      status: 'recorded',
      recordedAt: '2026-10-10T08:00:00Z',
      recordNote: 'EDGE-18 installed',
      recordedBy: 'Saul',
    } as Plan
    expect(recordedLine(plan)).toEqual({
      id: 'p1',
      at: '2026-10-10T08:00:00Z',
      name: 'Expansion',
      note: 'EDGE-18 installed',
      by: 'Saul',
    })
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd frontend && npx vitest run src/features/details/model.test.ts`
Expected: FAIL (`Failed to resolve import "./model"`).

- [ ] **Step 3: Implement `model.ts`**

Create `frontend/src/features/details/model.ts`:

```ts
import type {
  ChangeLogEntry,
  Details,
  DirectFix,
  Endpoint,
  Equipment,
  Plan,
} from '../../shared/types'

export type FieldKey =
  | 'name'
  | 'manufacturer'
  | 'model'
  | 'serialNumber'
  | 'ipAddress'
  | 'status'
  | 'description'
  | 'portType'
  | 'connector'
  | 'speed'
  | 'state'

export interface FieldSpec {
  key: FieldKey
  label: string
  kind: 'text' | 'textarea' | 'select'
  /** For a select: the values offered (besides "—" and a saved value not in the list). */
  options?: readonly string[]
  /** Monospace text (serial numbers, addresses, port names). */
  mono?: boolean
}

/** Field values as typed; a missing or empty value is "not set". */
export type Values = Partial<Record<FieldKey, string>>

/** fix: a direct fix on Installed; plan: update_details on a proposed object; none: shown only. */
export type EditMode = 'fix' | 'plan' | 'none'

export const EQUIPMENT_STATUSES = ['active', 'inactive', 'maintenance'] as const
export const PORT_TYPES = ['copper', 'fiber'] as const
export const PORT_STATES = ['available', 'reserved', 'disabled', 'faulty'] as const
export const CONNECTORS = ['RJ45', 'LC', 'SC', 'ST', 'SFP', 'SFP+', 'QSFP'] as const
export const SPEEDS = ['100M', '1G', '2.5G', '5G', '10G', '25G', '40G', '100G'] as const

export const EQUIPMENT_FIELDS: readonly FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'manufacturer', label: 'Manufacturer', kind: 'text' },
  { key: 'model', label: 'Model', kind: 'text' },
  { key: 'serialNumber', label: 'Serial number', kind: 'text', mono: true },
  { key: 'ipAddress', label: 'IP address', kind: 'text', mono: true },
  { key: 'status', label: 'Status', kind: 'select', options: EQUIPMENT_STATUSES },
  { key: 'description', label: 'Description', kind: 'textarea' },
]

export const PORT_FIELDS: readonly FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text', mono: true },
  { key: 'portType', label: 'Port type', kind: 'select', options: PORT_TYPES },
  { key: 'connector', label: 'Connector', kind: 'select', options: CONNECTORS },
  { key: 'speed', label: 'Speed', kind: 'select', options: SPEEDS },
  { key: 'state', label: 'State', kind: 'select', options: PORT_STATES },
  { key: 'description', label: 'Description', kind: 'textarea' },
]

/** Change-log field names in words. */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  manufacturer: 'Manufacturer',
  model: 'Model',
  serialNumber: 'Serial number',
  ipAddress: 'IP address',
  status: 'Status',
  description: 'Description',
  portType: 'Port type',
  connector: 'Connector',
  speed: 'Speed',
  state: 'State',
  label: 'Label',
  notes: 'Notes',
  location: 'Location',
  rackType: 'Rack type',
}

export function editMode(
  context: 'installed' | 'planned',
  proposed: boolean,
  canEdit: boolean,
): EditMode {
  if (context === 'installed') return 'fix'
  return proposed && canEdit ? 'plan' : 'none'
}

/** update_details carries no name, so a plan edits everything but the name. */
export const equipmentFields = (mode: EditMode): readonly FieldSpec[] =>
  mode === 'fix'
    ? EQUIPMENT_FIELDS
    : EQUIPMENT_FIELDS.filter((f) => f.key !== 'name')

export const canRenamePort = (
  equipment: Pick<Equipment, 'kind'>,
  endpoint: Pick<Endpoint, 'position'>,
) => equipment.kind === 'switch' && (endpoint.position ?? 0) > 0

export const portFields = (
  mode: EditMode,
  canRename: boolean,
): readonly FieldSpec[] =>
  mode === 'fix' && canRename
    ? PORT_FIELDS
    : PORT_FIELDS.filter((f) => f.key !== 'name')

export const equipmentValues = (e: Equipment): Values => ({
  name: e.name,
  manufacturer: e.manufacturer ?? '',
  model: e.model ?? '',
  serialNumber: e.serialNumber ?? '',
  ipAddress: e.ipAddress ?? '',
  status: e.status ?? '',
  description: e.description ?? '',
})

export const portValues = (p: Endpoint): Values => ({
  name: p.label,
  portType: p.portType ?? '',
  connector: p.connector ?? '',
  speed: p.speed ?? '',
  state: p.state ?? '',
  description: p.description ?? '',
})

/** A select's choices: "" (—) first, the list, then a saved value that is not in the list. */
export function optionsFor(spec: FieldSpec, current: string): string[] {
  const list = [...(spec.options ?? [])]
  return ['', ...list, ...(current && !list.includes(current) ? [current] : [])]
}

/**
 * What a save sends: only the fields whose trimmed value changed (the name on
 * its own, the rest as details; an emptied field as "", which clears it), and
 * the trimmed note when there is one.
 */
export function changedFix(
  fields: readonly FieldSpec[],
  before: Values,
  after: Values,
  note = '',
): DirectFix {
  const fix: DirectFix = {}
  const details: Record<string, string> = {}
  for (const f of fields) {
    const was = (before[f.key] ?? '').trim()
    const now = (after[f.key] ?? '').trim()
    if (was === now) continue
    if (f.key === 'name') fix.name = now
    else details[f.key] = now
  }
  if (Object.keys(details).length) fix.details = details as Details
  if (note.trim()) fix.note = note.trim()
  return fix
}

/** A note alone changes nothing. */
export const hasChanges = (fix: DirectFix) =>
  fix.name !== undefined || fix.details !== undefined

export function fixLine(e: ChangeLogEntry) {
  return {
    id: e.id,
    at: e.at,
    field: FIELD_LABELS[e.field] ?? e.field,
    from: e.oldValue || '(empty)',
    to: e.newValue || '(empty)',
    ...(e.note ? { note: e.note } : {}),
  }
}

export function recordedLine(p: Plan) {
  return {
    id: p.id,
    at: p.recordedAt ?? '',
    name: p.name,
    note: p.recordNote ?? '',
    by: p.recordedBy ?? '',
  }
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd frontend && npx vitest run src/features/details/model.test.ts`
Expected: PASS. Then `npm run typecheck`: PASS. Do not commit.

---

### Task 3: The editor, the Details block, and `onFixed`

**Files:**
- Create: `frontend/src/features/details/DetailsEditor.tsx`, `frontend/src/features/details/details.css`, `frontend/src/features/details/EquipmentDetails.tsx`
- Modify: `frontend/src/app/App.tsx`, `frontend/src/features/inspector/Inspector.tsx`, `frontend/src/features/inspector/Overview.tsx`

**Interfaces:**
- Consumes: Task 2's model; `fixInstalled` (`shared/api.ts`); `PlanEdit`; `useInlineDialog`, `useAsyncAction`, `EditError`.
- Produces:
  - `DetailsEditor` props `{ title: string; fields: readonly FieldSpec[]; before: Values; withNote: boolean; hint: string; saveLabel: string; openerKey: string; onSave: (fix: DirectFix) => Promise<void>; onClose: () => void }`
  - `DetailList` (exported from `DetailsEditor.tsx`) props `{ fields: readonly FieldSpec[]; values: Values }`
  - `EquipmentDetails` props `{ equipment: Equipment; mode: EditMode; edit?: PlanEdit; onFixed: (message: string) => Promise<void> }`
  - App → Workspace prop `onFixed: (message: string) => Promise<void>` (refetches `['topology']`, `['plans']`, `['history']`, then toasts). Workspace passes it to `Inspector` and `PhysicalExplorer` (Task 5).

- [ ] **Step 1: `DetailsEditor.tsx` and `details.css`**

Create `frontend/src/features/details/DetailsEditor.tsx`:

```tsx
import { useId, useState } from 'react'
import type { DirectFix } from '../../shared/types'
import { EditError } from '../planning/ConfirmShell'
import { useAsyncAction } from '../planning/useAsyncAction'
import { useInlineDialog } from '../planning/useInlineDialog'
import '../planning/editing.css'
import './details.css'
import {
  changedFix,
  hasChanges,
  optionsFor,
  type FieldSpec,
  type Values,
} from './model'

/** Read-only details: every field, "—" when not set. */
export function DetailList({
  fields,
  values,
}: {
  fields: readonly FieldSpec[]
  values: Values
}) {
  return (
    <dl className="detail-list details-values">
      {fields.map((f) => (
        <div key={f.key}>
          <dt>{f.label}</dt>
          <dd className={f.mono ? 'mono' : undefined}>
            {values[f.key] || '—'}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The one inline form for details: a direct fix (with the optional note) or a
 * plan save. It sends only what changed; an unchanged form just closes. The
 * server's refusal stays in the form, in its words. Escape closes it and
 * focus returns to the button that opened it (answer 19).
 */
export default function DetailsEditor({
  title,
  fields,
  before,
  withNote,
  hint,
  saveLabel,
  openerKey,
  onSave,
  onClose,
}: {
  title: string
  fields: readonly FieldSpec[]
  before: Values
  withNote: boolean
  hint: string
  saveLabel: string
  openerKey: string
  onSave: (fix: DirectFix) => Promise<void>
  onClose: () => void
}) {
  const id = useId()
  const [values, setValues] = useState<Values>(before)
  const [note, setNote] = useState('')
  const action = useAsyncAction()
  const dialog = useInlineDialog<HTMLFormElement>(onClose, openerKey)
  const fix = changedFix(fields, before, values, withNote ? note : '')
  return (
    <form
      {...dialog}
      className="inline-form details-form"
      aria-label={title}
      data-testid="details-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!hasChanges(fix)) {
          onClose()
          return
        }
        void action
          .run(async () => {
            await onSave(fix)
            return true
          })
          .then((saved) => saved && onClose())
      }}
    >
      <span className="eyebrow">{title}</span>
      {fields.map((f) => {
        const fieldId = `${id}-${f.key}`
        const value = values[f.key] ?? ''
        const set = (v: string) => {
          setValues((old) => ({ ...old, [f.key]: v }))
          action.clear()
        }
        return (
          <label key={f.key} htmlFor={fieldId}>
            {f.label}
            {f.kind === 'select' ? (
              <select
                id={fieldId}
                value={value}
                onChange={(e) => set(e.target.value)}
              >
                {optionsFor(f, value).map((o) => (
                  <option key={o} value={o}>
                    {o || '—'}
                  </option>
                ))}
              </select>
            ) : f.kind === 'textarea' ? (
              <textarea
                id={fieldId}
                value={value}
                rows={2}
                onChange={(e) => set(e.target.value)}
              />
            ) : (
              <input
                id={fieldId}
                className={f.mono ? 'mono' : undefined}
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            )}
          </label>
        )
      })}
      {withNote && (
        <label htmlFor={`${id}-note`}>
          Why (optional, kept in history)
          <input
            id={`${id}-note`}
            value={note}
            maxLength={500}
            placeholder="e.g. Asset audit"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      )}
      <span className="quiet">{hint}</span>
      <EditError message={action.error} />
      <div className="inline-row">
        <button
          className="button primary"
          type="submit"
          disabled={action.pending}
        >
          {saveLabel}
        </button>
        <button className="button" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
```

Create `frontend/src/features/details/details.css`:

```css
/* Details blocks (inspector Overview, endpoint detail) and their inline form. */
.details-section {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}
.details-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.details-head .button {
  width: auto;
  margin-top: 0;
  padding: 4px 11px;
  line-height: 1.4;
}
.details-values .mono,
.details-form .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.details-form label {
  display: grid;
  gap: 3px;
  font-size: 11px;
  color: #4b5a72;
}
.details-form input,
.details-form select,
.details-form textarea {
  padding: 5px 8px;
  font-size: 12px;
  border: 1px solid #d5dce7;
  border-radius: 6px;
  background: #fff;
}
.details-hint {
  font-size: 11px;
  color: #77849a;
}
.history-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.history-list li {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  font-size: 12px;
  border: 1px solid #e1e7ee;
  border-radius: 8px;
}
.history-list time,
.history-list .who {
  font-size: 11px;
  color: #77849a;
}
.history-list del {
  color: #a4262c;
}
.history-list ins {
  text-decoration: none;
  color: #0b5c50;
}
.tag-recorded {
  margin-left: 6px;
  padding: 1px 5px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: #4b5a72;
  background: #eef2f7;
  border-radius: 4px;
}
```

- [ ] **Step 2: `EquipmentDetails.tsx`**

Create `frontend/src/features/details/EquipmentDetails.tsx`:

```tsx
import { useState } from 'react'
import { fixInstalled } from '../../shared/api'
import type { Equipment } from '../../shared/types'
import type { PlanEdit } from '../planning/editing'
import DetailsEditor, { DetailList } from './DetailsEditor'
import {
  EQUIPMENT_FIELDS,
  equipmentFields,
  equipmentValues,
  type EditMode,
} from './model'

/** The Overview's Details: the fields, and Edit details where this context allows it. */
export default function EquipmentDetails({
  equipment,
  mode,
  edit,
  onFixed,
}: {
  equipment: Equipment
  mode: EditMode
  edit?: PlanEdit
  onFixed: (message: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const opener = `details:${equipment.id}`
  const before = equipmentValues(equipment)
  return (
    <section className="details-section" data-testid="equipment-details">
      <div className="details-head">
        <h3 className="inspector-section">Details</h3>
        {mode !== 'none' && !open && (
          <button
            className="button"
            data-opener={opener}
            onClick={() => setOpen(true)}
          >
            Edit details
          </button>
        )}
      </div>
      {open ? (
        <DetailsEditor
          title={
            mode === 'fix'
              ? `Fix details of ${equipment.name}`
              : `Details of the proposed ${equipment.name}`
          }
          fields={equipmentFields(mode)}
          before={before}
          withNote={mode === 'fix'}
          hint={
            mode === 'fix'
              ? 'A fix changes no topology. Drafts stay valid, and each changed field is written to the history.'
              : 'Saved in this plan with the proposed equipment.'
          }
          saveLabel={mode === 'fix' ? 'Save fix' : 'Save in plan'}
          openerKey={opener}
          onClose={() => setOpen(false)}
          onSave={async (fix) => {
            if (mode === 'fix') {
              const answer = await fixInstalled('equipment', equipment.id, fix)
              await onFixed(
                `Fixed ${fix.name ?? equipment.name}: ${answer.changes.length} field${answer.changes.length === 1 ? '' : 's'}`,
              )
            } else if (edit) {
              await edit({
                type: 'update_details',
                target: { id: equipment.id },
                details: fix.details ?? {},
              })
            }
          }}
        />
      ) : (
        <DetailList
          fields={EQUIPMENT_FIELDS.filter((f) => f.key !== 'name')}
          values={before}
        />
      )}
      {mode === 'none' && (
        <p className="details-hint">
          Details of installed equipment are fixed on Installed, without a
          plan.
        </p>
      )}
    </section>
  )
}
```

Check the `update_details` command type in `frontend/src/shared/types.ts` (`type: 'update_details'; target: { id: string }; details: Details`): the call above must typecheck against `EditCommand`.

- [ ] **Step 3: Put it in the Overview**

In `frontend/src/features/inspector/Overview.tsx`: add a prop `details?: ReactNode` to `Props` (comment: `/** The Details block (fields, Edit details). */`), destructure it, and render `{details}` right after the closing `</dl>` and before `<h3 className="inspector-section">Cabled by network</h3>`.

In `frontend/src/features/inspector/Inspector.tsx`:
- import `EquipmentDetails from '../details/EquipmentDetails'` and `{ editMode } from '../details/model'`;
- add the prop `onFixed: (message: string) => Promise<void>` to `Props` (comment: `/** After a direct fix: refetch and toast. */`) and destructure it;
- pass to `<Overview …>`:

```tsx
            details={
              <EquipmentDetails
                key={equipment.id}
                equipment={equipment}
                mode={editMode(snapshot.context, header.proposed, !!edit)}
                edit={edit}
                onFixed={onFixed}
              />
            }
```

(`snapshot.context` is `'installed' | 'planned'`; if its type is wider, narrow it with `snapshot.context === 'installed' ? 'installed' : 'planned'`.)

- [ ] **Step 4: `onFixed` in App**

In `frontend/src/app/App.tsx`:
- In `App`, after `const refresh = useCallback(…)`, add:

```tsx
  // A direct fix keeps the topology revision, so nothing refetches by itself:
  // Installed, every plan (drawn on Installed) and the history are refetched.
  const fixed = useCallback(
    async (message: string) => {
      await Promise.all([
        refresh(),
        client.invalidateQueries({ queryKey: ['history'] }),
      ])
      notify(message)
    },
    [refresh, client, notify],
  )
```

- Add `onFixed={fixed}` where `<Workspace` is rendered.
- In `WorkspaceProps` add `onFixed: (message: string) => Promise<void>`; destructure `onFixed` in `Workspace`; pass `onFixed={onFixed}` to `<Inspector` (in `drawerEquipment`) and to `<PhysicalExplorer` (Task 5 adds the prop there; until then, add only the Inspector one so this step typechecks).

- [ ] **Step 5: Check**

Run: `cd frontend && npm run typecheck && npm test`
Expected: PASS. Then start the app (`npm run dev` with the API running on a seeded dev DB, or rely on Task 6's browser tests) and look: Installed → click a card → Overview shows Details with Edit details. Do not commit.

---

### Task 4: The History tab

**Files:**
- Create: `frontend/src/features/details/HistoryTab.tsx`
- Modify: `frontend/src/features/inspector/Inspector.tsx`

**Interfaces:**
- Consumes: `getChangeLog`, `recordedPlansFor` (`shared/api.ts`), `fixLine`, `recordedLine` (Task 2).
- Produces: `HistoryTab` props `{ equipmentId: string }`; query key `['history', equipmentId]` (invalidated by App's `fixed`).

- [ ] **Step 1: `HistoryTab.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query'
import { getChangeLog, recordedPlansFor } from '../../shared/api'
import './details.css'
import { fixLine, recordedLine } from './model'

const when = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : ''

/**
 * An equipment's history: its direct fixes (newest first) and the recorded
 * plans that added, moved or removed it. Its ports' fixes are not listed here.
 */
export default function HistoryTab({ equipmentId }: { equipmentId: string }) {
  const history = useQuery({
    queryKey: ['history', equipmentId],
    queryFn: async ({ signal }) => {
      const [fixes, plans] = await Promise.all([
        getChangeLog('equipment', equipmentId, signal),
        recordedPlansFor(equipmentId, signal),
      ])
      return { fixes: fixes.map(fixLine), plans: plans.map(recordedLine) }
    },
  })
  if (history.isPending) return <p className="muted">Loading the history…</p>
  if (history.isError)
    return (
      <p className="muted" role="alert">
        Could not load the history: {history.error.message}
      </p>
    )
  const { fixes, plans } = history.data
  return (
    <div className="inspector-history" data-testid="history">
      <h3 className="inspector-section">Direct fixes</h3>
      {fixes.length ? (
        <ul className="history-list" data-testid="history-fixes">
          {fixes.map((f) => (
            <li key={f.id}>
              <time dateTime={f.at}>{when(f.at)}</time>
              <span>
                <b>{f.field}</b>: <del>{f.from}</del> → <ins>{f.to}</ins>
              </span>
              {f.note && <span className="who">“{f.note}”</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No direct fixes yet.</p>
      )}
      <h3 className="inspector-section">Recorded plans</h3>
      {plans.length ? (
        <ul className="history-list" data-testid="history-plans">
          {plans.map((p) => (
            <li key={p.id}>
              <time dateTime={p.at}>{when(p.at)}</time>
              <span>
                <b>{p.name}</b>
                <span className="tag-recorded">RECORDED</span>
              </span>
              <span className="who">
                {p.by} · “{p.note}”
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No recorded plan has changed it.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: The third tab**

In `Inspector.tsx`:
- `type Tab = 'overview' | 'ports' | 'history'` and `const TABS: readonly Tab[] = ['overview', 'ports', 'history']`;
- the tab label: replace `{id === 'overview' ? 'Overview' : portsLabel}` with `{id === 'overview' ? 'Overview' : id === 'ports' ? portsLabel : 'History'}`;
- the panel: replace the `tab === 'overview' ? (<Overview …/>) : (<PortTable …/>)` conditional with three branches: Overview, PortTable for `'ports'`, and `<HistoryTab key={equipment.id} equipmentId={equipment.id} />` for `'history'` (import it from `../details/HistoryTab`).

The arrow keys on the tab list already walk `TABS`, so the new tab joins them.

- [ ] **Step 3: Check**

Run: `cd frontend && npm run typecheck && npm test`
Expected: PASS. Do not commit.

---

### Task 5: Port details in Physical and the hatched faceplate

**Files:**
- Create: `frontend/src/features/details/PortDetails.tsx`
- Modify: `frontend/src/features/physical/faces.ts`, `frontend/src/features/physical/faces.test.ts`, `frontend/src/features/physical/FaceView.tsx`, `frontend/src/features/physical/physical.css`, `frontend/src/features/physical/EquipmentPage.tsx`, `frontend/src/features/physical/PhysicalExplorer.tsx`, `frontend/src/app/App.tsx` (pass `onFixed` to `PhysicalExplorer`)

**Interfaces:**
- Consumes: Task 2's model, `DetailsEditor`/`DetailList` (Task 3), `fixInstalled`.
- Produces:
  - `FaceEndpoint.portState?: 'reserved' | 'disabled' | 'faulty'` (absent for available or not set)
  - jack attributes: class `port-state-<state>`, `data-port-state="<state>"`
  - `PortDetails` props `{ snapshot: Snapshot; index: SnapshotIndex; endpointId: string; proposed: boolean; edit?: PlanEdit; onFixed: (message: string) => Promise<void> }`
  - `PhysicalExplorer` and `EquipmentPage` prop `onFixed: (message: string) => Promise<void>`

- [ ] **Step 1: Write the failing face test**

Append to `frontend/src/features/physical/faces.test.ts` (it already imports `indexSnapshot`, `acceptanceSnapshot` and `switchBank`; add any missing import):

```ts
it('FD-05 a port state other than available is carried to its jack', () => {
  const s = acceptanceSnapshot()
  s.endpoints = s.endpoints.map((p) =>
    p.id === 'AGG-15:p3'
      ? { ...p, state: 'faulty' as const }
      : p.id === 'AGG-15:p4'
        ? { ...p, state: 'available' as const }
        : p,
  )
  const cells = switchBank(indexSnapshot(s), 'AGG-15').rows.flat()
  expect(cells.find((c) => c.endpointId === 'AGG-15:p3')?.portState).toBe(
    'faulty',
  )
  expect(cells.find((c) => c.endpointId === 'AGG-15:p4')?.portState).toBe(
    undefined,
  )
})
```

Run: `cd frontend && npx vitest run src/features/physical/faces.test.ts -t "FD-05"` → FAIL (`portState` is undefined for p3).

- [ ] **Step 2: Carry the state**

In `faces.ts`:
- add to `FaceEndpoint`:

```ts
  /** A state other than available (reserved, disabled, faulty): drawn hatched, never a trace change. */
  portState?: 'reserved' | 'disabled' | 'faulty'
```

- in `cell(...)`, in the returned object for an existing endpoint, add:

```ts
    portState:
      p.state && p.state !== 'available' ? p.state : undefined,
```

Run the test again → PASS. Run `npx vitest run src/features/physical` → PASS (the existing `toEqual` checks ignore an `undefined` property).

- [ ] **Step 3: Draw it**

In `FaceView.tsx`, in the `button(...)` helper:
- the inline style for a cabled jack: change `background: colorOf(colors, cell.networkId ?? '')` to `backgroundColor: colorOf(colors, cell.networkId ?? '')` (the shorthand would erase the hatch, Review Focus 5);
- the class list: add `${cell.portState ? `port-state-${cell.portState}` : ''}` to the `className` template;
- add `data-port-state={cell.portState}` next to `data-tone`;
- in the `aria-label` array, add `cell.portState` after the `endpointAria(...)` item (so it reads "… , faulty").

In the legend (`showLegend && (<footer …>)`), before the "on the selected route" item, add one swatch per state present on the face:

```tsx
          {faceStates(face).map((s) => (
            <span key={s} data-testid="legend-state">
              <i className={`port-state-${s}`} /> {s}
            </span>
          ))}
```

and above the component:

```tsx
/** The port states drawn on a face, in a fixed order, for the legend. */
function faceStates(face: Face) {
  const cells =
    face.kind === 'switch'
      ? face.rows.flat()
      : face.kind === 'panel'
        ? face.face.positions
        : face.face.blocks.flatMap((b) => b.positions)
  const present = new Set(cells.map((c) => c.portState))
  return (['reserved', 'disabled', 'faulty'] as const).filter((s) =>
    present.has(s),
  )
}
```

At the **end** of `physical.css` (so it wins over the fill rules):

```css
/* Port state (locked 6: data only, never a trace): a pattern over the fill. */
.face-cell.port-state-reserved,
.face-legend i.port-state-reserved {
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 4px,
    rgba(180, 110, 9, 0.55) 4px 6px
  );
}
.face-cell.port-state-disabled,
.face-legend i.port-state-disabled {
  background-image: repeating-linear-gradient(
    90deg,
    transparent 0 5px,
    rgba(95, 107, 128, 0.55) 5px 6px
  );
}
.face-cell.port-state-faulty,
.face-legend i.port-state-faulty {
  background-image: repeating-linear-gradient(
    -45deg,
    transparent 0 3px,
    rgba(180, 35, 24, 0.7) 3px 5px
  );
}
```

- [ ] **Step 4: `PortDetails.tsx`**

```tsx
import { useState } from 'react'
import { fixInstalled } from '../../shared/api'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { PlanEdit } from '../planning/editing'
import DetailsEditor, { DetailList } from './DetailsEditor'
import {
  PORT_FIELDS,
  canRenamePort,
  editMode,
  portFields,
  portValues,
} from './model'

/**
 * The endpoint detail's Port details: type, connector, speed, state and
 * description, and Edit port details where this context allows it. A state is
 * data: it never changes a trace.
 */
export default function PortDetails({
  snapshot,
  index,
  endpointId,
  proposed,
  edit,
  onFixed,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  endpointId: string
  /** The port's equipment exists only in this plan. */
  proposed: boolean
  edit?: PlanEdit
  onFixed: (message: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const endpoint = index.lookup.endpoints.get(endpointId)
  const equipment = endpoint && index.equipment.get(endpoint.equipmentId)
  if (!endpoint || !equipment) return null
  const mode = editMode(
    snapshot.context === 'installed' ? 'installed' : 'planned',
    proposed,
    !!edit,
  )
  const opener = `port-details:${endpointId}`
  const before = portValues(endpoint)
  const who = `${equipment.name} · ${endpoint.label}`
  return (
    <section className="details-section" data-testid="port-details">
      <div className="details-head">
        <span className="section-label">PORT DETAILS</span>
        {mode !== 'none' && !open && (
          <button
            className="button"
            data-opener={opener}
            onClick={() => setOpen(true)}
          >
            Edit port details
          </button>
        )}
      </div>
      {open ? (
        <DetailsEditor
          title={mode === 'fix' ? `Fix ${who}` : `Details of the proposed ${who}`}
          fields={portFields(mode, canRenamePort(equipment, endpoint))}
          before={before}
          withNote={mode === 'fix'}
          hint="A port state is data: it never changes a trace."
          saveLabel={mode === 'fix' ? 'Save fix' : 'Save in plan'}
          openerKey={opener}
          onClose={() => setOpen(false)}
          onSave={async (fix) => {
            if (mode === 'fix') {
              const answer = await fixInstalled('endpoint', endpointId, fix)
              await onFixed(
                `Fixed ${who}: ${answer.changes.length} field${answer.changes.length === 1 ? '' : 's'}`,
              )
            } else if (edit) {
              await edit({
                type: 'update_details',
                target: { id: endpointId },
                details: fix.details ?? {},
              })
            }
          }}
        />
      ) : (
        <DetailList
          fields={PORT_FIELDS.filter((f) => f.key !== 'name')}
          values={before}
        />
      )}
      {mode === 'none' && (
        <p className="details-hint">
          Port details are fixed on Installed; they never change topology.
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Wire it into the equipment page**

- `EquipmentPage.tsx`: add the prop `onFixed: (message: string) => Promise<void>` (comment: `/** After a direct fix: refetch and toast. */`); import `PortDetails`; inside `<EndpointDetail …>`'s children, render **before** `<EndpointEdit …/>`:

```tsx
        {detail && (
          <PortDetails
            key={`details:${detail.endpointId}`}
            snapshot={snapshot}
            index={index}
            endpointId={detail.endpointId}
            proposed={
              snapshot.context === 'planned' &&
              !installedIds.has(detail.equipmentId)
            }
            edit={edit}
            onFixed={onFixed}
          />
        )}
```

(wrap both children in a fragment if needed).
- `PhysicalExplorer.tsx`: add `onFixed: (message: string) => Promise<void>` to `Props` (comment as above), destructure it, pass `onFixed={onFixed}` to `<EquipmentPage`.
- `App.tsx`: pass `onFixed={onFixed}` to `<PhysicalExplorer` in `Workspace`.

- [ ] **Step 6: Check**

Run: `cd frontend && npm run typecheck && npm test`
Expected: PASS. Do not commit.

---

### Task 6: Browser tests FD-04 and FD-05

**Files:**
- Create: `frontend/e2e/details.recording.spec.ts`

Why `*.recording.spec.ts`: direct fixes change the **shared** test server's installed data. The `recording` project runs after every other spec, with one worker (see `playwright.config.ts`), so these changes cannot affect the `main` specs. Only details of **AGG-15** (no cables, no routes) and one AGG-15 port are changed; nothing is renamed on Installed.

**Interfaces:** uses `fitted`, `openRackInPhysical` (`e2e/helpers.ts`), `newPlan`, `getPlan`, `addSwitch`, `unique` (`e2e/plan-api.ts`). Check `addSwitch`'s signature in `plan-api.ts` (`(request, planId, rackId, name, unit, ports)` → equipment ID) and the plan JSON field for `update_details` entries (`Plan.details` in `shared/types.ts`) before running; adjust only those two names if they differ.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test, type Page } from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'
import { addSwitch, getPlan, newPlan, unique } from './plan-api'

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/fd-${name}.png` })
const details = (page: Page) => page.getByTestId('equipment-details')
const form = (page: Page) => page.getByTestId('details-form')

/** Select a map card by equipment ID; the inspector opens with its name. */
async function inspect(page: Page, id: string, name = id.toUpperCase()) {
  await page.getByTestId(`rf__node-${id}`).click()
  await expect(page.locator('.inspector-header h2')).toHaveText(name)
}
const installedRevision = async (
  request: Parameters<typeof newPlan>[0],
) =>
  (await (await request.get('/api/topology?context=installed')).json())
    .revision as string

test('FD-04 a direct fix on Installed: Edit details saves, the Overview shows it at once, and History lists it with its note', async ({
  page,
  request,
}) => {
  const revision = await installedRevision(request)
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'agg-15')
  await expect(details(page)).toContainText('Manufacturer')
  await details(page).getByRole('button', { name: 'Edit details' }).click()
  await expect(form(page).getByLabel('Name')).toBeFocused()
  await form(page).getByLabel('Manufacturer').fill('Cisco')
  await form(page).getByLabel('Serial number').fill('FD-SN-15')
  await form(page).getByLabel('Status').selectOption('maintenance')
  await form(page)
    .getByLabel('Why (optional, kept in history)')
    .fill('Asset audit')
  await shot(page, 'edit-form')
  await form(page).getByRole('button', { name: 'Save fix' }).click()
  await expect(form(page)).toHaveCount(0)
  // Shown at once, without a reload (the revision did not change).
  await expect(details(page)).toContainText('Cisco')
  await expect(details(page)).toContainText('FD-SN-15')
  await expect(details(page)).toContainText('maintenance')
  expect(await installedRevision(request)).toBe(revision)

  await page.getByRole('tab', { name: 'History' }).click()
  const fixes = page.getByTestId('history-fixes').locator('li')
  await expect(fixes).toHaveCount(3)
  await expect(page.getByTestId('history-fixes')).toContainText('Manufacturer')
  await expect(page.getByTestId('history-fixes')).toContainText('Asset audit')
  await shot(page, 'history')
})

test('FD-04 a refused fix keeps the form open with the reason; Escape closes it and returns focus', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await inspect(page, 'agg-15')
  const button = details(page).getByRole('button', { name: 'Edit details' })
  await button.click()
  await form(page).getByLabel('Name').fill('AGG-08')
  await form(page).getByRole('button', { name: 'Save fix' }).click()
  await expect(form(page).getByTestId('edit-error')).toContainText(
    'AGG-08 already exists',
  )
  await expect(form(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(form(page)).toHaveCount(0)
  await expect(button).toBeFocused()
})

test('FD-04 in a plan: a proposed switch is edited with update_details; installed equipment only shows a hint', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Details'))
  const sw = await addSwitch(request, id, 'rack-a03', 'EDGE-40', 3, 24)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await inspect(page, sw, 'EDGE-40')
  await details(page).getByRole('button', { name: 'Edit details' }).click()
  await expect(form(page).getByLabel('Name')).toHaveCount(0)
  await form(page).getByLabel('Model').fill('C9300-48P')
  await form(page).getByRole('button', { name: 'Save in plan' }).click()
  await expect(form(page)).toHaveCount(0)
  await expect(details(page)).toContainText('C9300-48P')
  const plan = await getPlan(request, id)
  expect(JSON.stringify(plan.details)).toContain('C9300-48P')

  await inspect(page, 'agg-03')
  await expect(
    details(page).getByRole('button', { name: 'Edit details' }),
  ).toHaveCount(0)
  await expect(details(page)).toContainText(
    'Details of installed equipment are fixed on Installed',
  )
})

test('FD-05 a faulty port: Edit port details in Physical, the jack is hatched, and the detail says faulty', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await openRackInPhysical(
    page,
    'Main Campus',
    'Main Distribution',
    'Rack Core 02',
  )
  await page.locator('.rack-block[data-equipment-id="agg-15"]').click()
  const jack = page.locator('[data-endpoint-id="agg-15:p3"]')
  await jack.click()
  const port = page.getByTestId('port-details')
  await port.getByRole('button', { name: 'Edit port details' }).click()
  await form(page).getByLabel('State').selectOption('faulty')
  await form(page).getByLabel('Speed').selectOption('10G')
  await form(page)
    .getByLabel('Why (optional, kept in history)')
    .fill('Bent pins, module to replace')
  await form(page).getByRole('button', { name: 'Save fix' }).click()
  await expect(form(page)).toHaveCount(0)
  await expect(port).toContainText('faulty')
  await expect(port).toContainText('10G')
  await expect(jack).toHaveAttribute('data-port-state', 'faulty')
  await expect(jack).toHaveClass(/port-state-faulty/)
  await expect(page.getByTestId('legend-state')).toContainText('faulty')
  await shot(page, 'faulty-port')
})
```

- [ ] **Step 2: Run it**

Run: `cd frontend && npx playwright test e2e/details.recording.spec.ts`
Expected: 4 passed. If a locator does not match the real markup (for example the inspector header or the rack block selector), read the existing specs (`e2e/editing.spec.ts`, `e2e/equipment.spec.ts`) and use what they use; do **not** weaken an assertion about behavior.

- [ ] **Step 3: Look at the screenshots**

Open `frontend/test-results/fd-edit-form.png`, `fd-history.png`, `fd-faulty-port.png`. Check: the form fits the inspector without horizontal scroll; the hatch is visible on the jack; the History lines read "Manufacturer: (empty) → Cisco". Fix CSS if something overflows. Do not commit.

---

### Task 7: Docs, full check run, stop for review

**Files:** `docs/current-status.md`, `docs/implementation-plan.md`, `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1: `docs/implementation-plan.md`** — row 13: append ` *Done 2026-10-13.*` (use the real date if later).

- [ ] **Step 2: `docs/current-status.md`** — add **"### Details UI (M5b step 13)"** after the step 12 section, describing what runs:
  - the Overview's **Details** block and **Edit details** (Installed: a direct fix with the optional note; a plan: `update_details` for proposed equipment, no Name field; installed equipment in a plan: the hint);
  - the **History** tab (the equipment's direct fixes, newest first, and the recorded plans that changed it; its ports' fixes are not listed there);
  - **Port details** in the Physical endpoint detail and **Edit port details** (port rename only for switch ports with a position);
  - the dropdowns (the value lists from Global Constraints; a saved value outside a list is kept);
  - the hatched reserved/disabled/faulty jacks and legend (locked 6);
  - after a fix the app refetches Installed, every plan and the history (`onFixed`), because the revision does not change;
  - Task 1's fixes (sorted 422; `null` means not given) and **the campus measurement from Task 1 Step 5** ("one direct fix on the campus: N ms; a measurement, not a budget");
  - tests: the model tests (`features/details/model.test.ts`), FD-05 in `faces.test.ts`, FD-04/FD-05 in `e2e/details.recording.spec.ts`, `TestFixAnswersAreDeterministicAndNullMeansNotGiven`, `TestFixOnCampusIsMeasured`;
  - **Not yet:** editing cable, site, node and rack details in the UI (the API supports them); renaming proposed objects in a plan; the inventory view (step 14).

- [ ] **Step 3: `CLAUDE.md` / `AGENTS.md`** — next checkpoint is **M5b step 14 (the inventory view)**. In `CLAUDE.md`'s status paragraph change "M5b steps 11, 11b and 12 are done (…)" to include step 13 (the details UI), and in the frontend architecture paragraph add: "`features/details/` is the details UI: pure `model` (field specs, value lists, `changedFix`, history lines) and thin `DetailsEditor`, `EquipmentDetails`, `PortDetails`, `HistoryTab`; a direct fix calls App's `onFixed`, which refetches topology and history because the revision does not change."

- [ ] **Step 4: Full check run**

```bash
cd backend && go test -race ./... && go vet ./...
cd ../frontend && npm test && npm run typecheck && npm run build && npm run format:check
npm run test:e2e
```

Expected: everything passes; the Go database tests **ran**; Playwright 0 failed (1 skipped is the scale spec). Run Playwright **once more** if anything was flaky and report it.

- [ ] **Step 5: Stop for review**

Do **not** commit or push. Report: files changed, test counts, the campus timing, the screenshots' paths, and anything you had to adjust from this plan (with the reason).
