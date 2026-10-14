# M5b Step 12: Direct Fixes and Change Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user correct installed data that is not topology (names and detail fields) directly, without a plan, with every changed field written to `change_log`, and read an object's history back.

**Architecture:** A new pure package `internal/fixes` applies one fix to an installed `topology.Snapshot` and returns the field changes (no SQL, no HTTP). `persistence.Store.Fix` locks the installed root `FOR UPDATE` (same lock as Record), loads the snapshot, calls `fixes.Apply`, writes only the fixed object's row and one `change_log` row per changed field, in one transaction, and **never changes the topology revision**. `httpapi` exposes `PATCH /api/installed/{kind}/{id}` and `GET /api/change-log`. The frontend gets typed client functions only; the UI is step 13 (a separate plan).

**Tech Stack:** Go 1.26 (`net/http`, pgx v5), PostgreSQL 17, TypeScript client in `frontend/src/shared/`, Vitest.

**Spec:** `docs/implementation-plan.md`, section "M5 design", item **10. Direct fixes (M5b)**, and the M5 steps table row **12**. Also read answer **3** ("Edit path: plans plus direct fixes") in "Recorded answers (2026-10-08)".

## Read first (in this order)

1. `AGENTS.md` and `CLAUDE.md` (repo root): binding rules.
2. `docs/implementation-plan.md` → "M5 design" item 10, M5 steps row 12.
3. `backend/internal/topology/details.go` (detail fields, `SetDetail`, `DetailWord`, value sets).
4. `backend/internal/persistence/layout.go` (the style for a small write path and sentinel errors) and `backend/internal/persistence/record.go` lines 35–60 (the installed lock).
5. `backend/internal/httpapi/server.go` (`Repository`, `repositoryError`, `decode`).

## Global Constraints

- **No automatic commits** (AGENTS.md). Do not run `git commit` or `git push`. When all tasks are done, stop and report to the owner, who reviews and commits.
- **Test-first** for every domain rule: write the failing test, run it, see it fail, then implement.
- **No new dependencies** (Go or npm). **No new migration**: `change_log` already exists (migration 007, columns `id bigserial, at timestamptz default now(), entity_kind text, entity_id text, field text, old_value text, new_value text, note text`, index `(entity_kind, entity_id, at)`). Never edit an applied migration.
- **A direct fix never changes topology** (locked decision 10): only names and detail fields. It never changes `installed_topology.revision`, so drafts stay current and pinned traces stay valid.
- **Fixable fields per kind** (exact):
  - `equipment`: `name`; details `manufacturer`, `model`, `serialNumber`, `ipAddress`, `status`, `description`
  - `endpoint`: `name` (the port label; **switch ports with a position only**); details `portType`, `connector`, `speed`, `state`, `description`
  - `link` (cables only): details `label`, `status`, `notes` (a cable has no name)
  - `site`, `node`: `name`; details `location`, `description`
  - `rack`: `name`; details `location`, `rackType`, `description`
- **Name rules** (same as the plan commands in `internal/planning/commands.go`): trimmed; equipment, site, node and rack names 1–100 characters; equipment names unique in the installed topology ignoring case; site names unique ignoring case; node names unique within their site; rack names unique within their node; switch port labels 1–64 characters and unique on their switch ignoring case.
- **Status codes:** 400 malformed JSON or unknown field; 404 unknown object or unknown kind; 409 duplicate name; 422 invalid value, a field that does not apply, a topology field (`rackId`, `unit`, …), or a note over 500 characters. Nothing is written on any failure.
- **Messages are in names**, never JSON field names or IDs where a name exists (use `topology.DetailWord`): `"AGG-08 already exists"`, `"PANEL-A · 4 · Front: positions of panels and HDFs are named by their place"`.
- **One deliberate refinement of design 10:** the design says `GET /api/change-log?entityId=`; this plan requires `entityKind` **and** `entityId`, so the query uses the existing index `change_log_entity (entity_kind, entity_id, at)` without a new migration. Record this in current-status (Task 5).
- **Keep in sync** (CLAUDE.md "Keeping things in sync"): `api/openapi.yaml` (lint it), `frontend/src/shared/types.ts`, `frontend/src/shared/api.ts`, `docs/current-status.md`, `docs/implementation-plan.md` (mark step 12 done). Do not describe UI that does not exist yet.
- **Commands** (run from the right folder; Postgres must be up: `docker compose up -d --wait` at the repo root; `.env` holds `TEST_DATABASE_URL`):
  - backend: `cd backend && go test -race ./... && go vet ./...`; one test: `go test ./internal/fixes -run TestName -v`
  - frontend: `cd frontend && npm test && npm run typecheck && npm run build && npm run format:check`
  - OpenAPI lint: `cd frontend && npx --yes @redocly/cli lint ../api/openapi.yaml --extends minimal`
  - Without `TEST_DATABASE_URL`, database tests **skip**: a green run with skips proves nothing about persistence. Make sure they run.

## Review Focus

1. **A fix that changes nothing** (same value, or only surrounding spaces) → 200 with `changes: []`, no `change_log` row. Pinned in Task 1 (`TestNoChangeWhenValuesAreTheSame`) and Task 2 (`TestFX01…` checks the row count).
2. **A fix, then Record of an existing draft** → Record still succeeds (it locks the same root and diffs by ID), and the fixed name survives. Pinned in Task 2 (`TestFixThenRecordKeepsTheFix`).
3. **Clearing a detail with `""`** → the column becomes NULL, the snapshot shows it empty, and the log row reads old → `""`. Pinned in Task 2 (`TestClearingADetailWritesNullAndLogsIt`).
4. **A topology field in the body** (`{"rackId":"rack-dr01"}`) → 422 "rackId changes the topology: use a plan", not 400, and nothing written. Pinned in Task 3 (`TestFX02…`).
5. **A serial number that another installed equipment already has, in another case** (`sn-1` vs `SN-1`) → 422 in names before the database's unique index is reached. Pinned in Task 1 (`TestSerialNumberMustStayUnique`).

**Known limit, write it into current-status (Task 5):** a fix checks names against **Installed** only. A draft that adds equipment with the same name is not checked (plans do not check names at record time either).

---

## File Structure

| File | Responsibility |
| --- | --- |
| Create `backend/internal/fixes/fixes.go` | Pure: `Fix`, `Change`, `Entry`, `ErrNotFound`, `Apply(snapshot, fix)` |
| Create `backend/internal/fixes/fixes_test.go` | Unit tests for `Apply` on the acceptance fixture |
| Create `backend/internal/persistence/fix.go` | `Store.Fix`, `Store.ChangeLog`, `writeFixed` |
| Create `backend/internal/persistence/fix_test.go` | FX-01 and the Review Focus database tests |
| Modify `backend/internal/httpapi/server.go` | `Repository` gains `Fix` and `ChangeLog`; two routes; `fixes.ErrNotFound` → 404 |
| Create `backend/internal/httpapi/fix_api_test.go` | FX-02, FX-03 over HTTP |
| Modify `api/openapi.yaml` | The two paths and their schemas |
| Modify `frontend/src/shared/types.ts`, `frontend/src/shared/api.ts`, `frontend/src/shared/api.test.ts` | `ChangeLogEntry`, `DirectFix`, `fixInstalled`, `getChangeLog` |
| Modify `docs/current-status.md`, `docs/implementation-plan.md`, `CLAUDE.md`, `AGENTS.md` | Status and next checkpoint |

---

### Task 1: The pure `fixes` package

**Files:**
- Create: `backend/internal/fixes/fixes.go`
- Test: `backend/internal/fixes/fixes_test.go`

**Interfaces:**
- Consumes: `topology.Snapshot`, `topology.Validate`, `topology.Details` (+ `.Fields()`), the `SetDetail` methods, `topology.DetailWord`, `topology.ErrInvalidInput`, `topology.ErrDuplicateName` (all exist).
- Produces (used by Tasks 2–3):
  - `const Equipment, Endpoint, Link, Site, Node, Rack = "equipment", "endpoint", "link", "site", "node", "rack"`
  - `type Fix struct { Kind, ID string; Name *string; Details topology.Details; Note string }`
  - `type Change struct { Field, OldValue, NewValue string }` (JSON `field`, `oldValue`, `newValue`)
  - `type Entry struct { ID int64; At time.Time; EntityKind, EntityID, Field, OldValue, NewValue, Note string }` (JSON camelCase, `note` omitempty)
  - `const MaxNote = 500`
  - `var ErrNotFound = errors.New("not found")`
  - `func Apply(s topology.Snapshot, f Fix) (topology.Snapshot, []Change, error)` — never mutates `s`; on error the returned snapshot must not be used.

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/fixes/fixes_test.go`:

```go
package fixes

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/topology"
)

func ptr(s string) *string { return &s }

func mustApply(t *testing.T, s topology.Snapshot, f Fix) (topology.Snapshot, []Change) {
	t.Helper()
	next, changes, err := Apply(s, f)
	if err != nil {
		t.Fatalf("Apply(%+v): %v", f, err)
	}
	return next, changes
}

func equipmentNamed(s topology.Snapshot, id string) topology.Equipment {
	for _, e := range s.Equipment {
		if e.ID == id {
			return e
		}
	}
	return topology.Equipment{}
}

func TestRenameEquipmentReturnsOneChangeAndLeavesTheInputAlone(t *testing.T) {
	s := acceptance.Installed()
	next, changes := mustApply(t, s, Fix{Kind: Equipment, ID: "agg-03", Name: ptr("  AGG-03A ")})
	want := []Change{{Field: "name", OldValue: "AGG-03", NewValue: "AGG-03A"}}
	if !reflect.DeepEqual(changes, want) {
		t.Fatalf("changes = %+v, want %+v", changes, want)
	}
	if got := equipmentNamed(next, "agg-03").Name; got != "AGG-03A" {
		t.Fatalf("new name = %q", got)
	}
	if got := equipmentNamed(s, "agg-03").Name; got != "AGG-03" {
		t.Fatalf("the input snapshot changed: %q", got)
	}
	if next.Revision != s.Revision {
		t.Fatalf("a fix must not change the revision")
	}
}

func TestNoChangeWhenValuesAreTheSame(t *testing.T) {
	_, changes := mustApply(t, acceptance.Installed(), Fix{Kind: Equipment, ID: "agg-03", Name: ptr(" AGG-03 "), Details: topology.Details{Description: ptr("")}})
	if len(changes) != 0 {
		t.Fatalf("same values must give no changes, got %+v", changes)
	}
}

func TestDuplicateEquipmentNameIgnoringCaseIsRefused(t *testing.T) {
	_, _, err := Apply(acceptance.Installed(), Fix{Kind: Equipment, ID: "agg-03", Name: ptr("agg-08")})
	if !errors.Is(err, topology.ErrDuplicateName) || !strings.Contains(err.Error(), "agg-08 already exists") {
		t.Fatalf("err = %v", err)
	}
}

func TestNameLengthIsChecked(t *testing.T) {
	for _, name := range []string{"   ", strings.Repeat("x", 101)} {
		if _, _, err := Apply(acceptance.Installed(), Fix{Kind: Rack, ID: "rack-a03", Name: ptr(name)}); !errors.Is(err, topology.ErrInvalidInput) {
			t.Fatalf("name %q: err = %v", name, err)
		}
	}
}

func TestEquipmentDetailsAreSetAndValidatedInNames(t *testing.T) {
	s := acceptance.Installed()
	next, changes := mustApply(t, s, Fix{Kind: Equipment, ID: "agg-03", Details: topology.Details{Manufacturer: ptr("Cisco"), Status: ptr("maintenance")}})
	if len(changes) != 2 || changes[0].Field != "manufacturer" || changes[1].Field != "status" {
		t.Fatalf("changes = %+v", changes)
	}
	if e := equipmentNamed(next, "agg-03"); e.Manufacturer != "Cisco" || e.Status != "maintenance" {
		t.Fatalf("equipment = %+v", e)
	}
	_, _, err := Apply(s, Fix{Kind: Equipment, ID: "agg-03", Details: topology.Details{Status: ptr("broken")}})
	if !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "AGG-03: status must be") {
		t.Fatalf("err = %v", err)
	}
}

func TestSerialNumberMustStayUnique(t *testing.T) {
	s, _ := mustApply(t, acceptance.Installed(), Fix{Kind: Equipment, ID: "agg-08", Details: topology.Details{SerialNumber: ptr("SN-1")}})
	_, _, err := Apply(s, Fix{Kind: Equipment, ID: "agg-03", Details: topology.Details{SerialNumber: ptr("sn-1")}})
	// Validate walks equipment in snapshot order, so either one may be named as the owner.
	if !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "is already the serial number of AGG-0") {
		t.Fatalf("err = %v", err)
	}
}

func TestADetailThatDoesNotApplyIsRefusedInWords(t *testing.T) {
	_, _, err := Apply(acceptance.Installed(), Fix{Kind: Equipment, ID: "agg-03", Details: topology.Details{RackType: ptr("standard")}})
	if !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "rack type does not apply") {
		t.Fatalf("err = %v", err)
	}
}

func TestPanelPositionsAndPortsWithoutAPositionCannotBeRenamed(t *testing.T) {
	s := acceptance.Installed()
	if _, _, err := Apply(s, Fix{Kind: Endpoint, ID: "panel-a:4:f", Name: ptr("X")}); !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "named by their place") {
		t.Fatalf("panel position: err = %v", err)
	}
	// The acceptance fixture's switch ports were saved before port positions (position 0).
	if _, _, err := Apply(s, Fix{Kind: Endpoint, ID: "agg-03:p2", Name: ptr("Gi1/0/2")}); !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "saved before port positions") {
		t.Fatalf("port without a position: err = %v", err)
	}
}

// withGroupedSwitch adds SW-G (two ports with positions) to Rack A03 at U3.
func withGroupedSwitch(s topology.Snapshot) topology.Snapshot {
	s.Equipment = append(append([]topology.Equipment{}, s.Equipment...), topology.Equipment{ID: "sw-g", Name: "SW-G", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 3, Height: 1})
	s.Endpoints = append(append([]topology.Endpoint{}, s.Endpoints...),
		topology.Endpoint{ID: "sw-g:p1", EquipmentID: "sw-g", Label: "Gi1/0/1", Position: 1, PortGroup: 1},
		topology.Endpoint{ID: "sw-g:p2", EquipmentID: "sw-g", Label: "Gi1/0/2", Position: 2, PortGroup: 1})
	return s
}

func TestASwitchPortWithAPositionCanBeRenamedOnceOnItsSwitch(t *testing.T) {
	s := withGroupedSwitch(acceptance.Installed())
	if err := topology.Validate(s); err != nil {
		t.Fatalf("fixture: %v", err)
	}
	_, changes := mustApply(t, s, Fix{Kind: Endpoint, ID: "sw-g:p1", Name: ptr("Gi1/0/9"), Details: topology.Details{State: ptr("faulty")}})
	want := []Change{{"name", "Gi1/0/1", "Gi1/0/9"}, {"state", "", "faulty"}}
	if !reflect.DeepEqual(changes, want) {
		t.Fatalf("changes = %+v", changes)
	}
	if _, _, err := Apply(s, Fix{Kind: Endpoint, ID: "sw-g:p1", Name: ptr("gi1/0/2")}); !errors.Is(err, topology.ErrDuplicateName) || !strings.Contains(err.Error(), "SW-G already has a port named gi1/0/2") {
		t.Fatalf("duplicate label: err = %v", err)
	}
	if _, _, err := Apply(s, Fix{Kind: Endpoint, ID: "sw-g:p1", Name: ptr(strings.Repeat("x", 65))}); !errors.Is(err, topology.ErrInvalidInput) {
		t.Fatalf("label over 64: err = %v", err)
	}
}

func TestACableTakesDetailsButNoName(t *testing.T) {
	s := acceptance.Installed()
	_, changes := mustApply(t, s, Fix{Kind: Link, ID: "cable-a01", Details: topology.Details{Label: ptr("A01 patch"), Status: ptr("testing")}})
	if len(changes) != 2 {
		t.Fatalf("changes = %+v", changes)
	}
	if _, _, err := Apply(s, Fix{Kind: Link, ID: "cable-a01", Name: ptr("x")}); !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "a cable has no name") {
		t.Fatalf("name on a cable: err = %v", err)
	}
	var bridge string
	for _, l := range s.Links {
		if l.Kind != "cable" {
			bridge = l.ID
			break
		}
	}
	if _, _, err := Apply(s, Fix{Kind: Link, ID: bridge, Details: topology.Details{Label: ptr("x")}}); !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "internal bridge") {
		t.Fatalf("bridge: err = %v", err)
	}
}

func TestContainerNamesAreUniqueAmongSiblingsOnly(t *testing.T) {
	s := acceptance.Installed()
	if _, _, err := Apply(s, Fix{Kind: Node, ID: "node-north-sub-main", Name: ptr("building a")}); !errors.Is(err, topology.ErrDuplicateName) {
		t.Fatalf("same site: err = %v", err)
	}
	// Another site may have a node of that name.
	mustApply(t, s, Fix{Kind: Node, ID: "node-dr-access", Name: ptr("Building A")})
	if _, _, err := Apply(s, Fix{Kind: Site, ID: "site-dr", Name: ptr("MAIN CAMPUS")}); !errors.Is(err, topology.ErrDuplicateName) {
		t.Fatalf("site: err = %v", err)
	}
	_, changes := mustApply(t, s, Fix{Kind: Rack, ID: "rack-a03", Name: ptr("Rack A03 (old)"), Details: topology.Details{RackType: ptr("wall-mount")}})
	if len(changes) != 2 {
		t.Fatalf("rack changes = %+v", changes)
	}
}

func TestUnknownObjectKindAndLongNote(t *testing.T) {
	s := acceptance.Installed()
	if _, _, err := Apply(s, Fix{Kind: Equipment, ID: "nope", Name: ptr("X")}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown id: err = %v", err)
	}
	if _, _, err := Apply(s, Fix{Kind: "plan", ID: "agg-03"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown kind: err = %v", err)
	}
	if _, _, err := Apply(s, Fix{Kind: Equipment, ID: "agg-03", Name: ptr("AGG-03A"), Note: strings.Repeat("n", MaxNote+1)}); !errors.Is(err, topology.ErrInvalidInput) {
		t.Fatalf("long note: err = %v", err)
	}
}
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `cd backend && go test ./internal/fixes -v`
Expected: FAIL to compile (`undefined: Apply`, `Fix`, …).

- [ ] **Step 3: Implement `fixes.go`**

Create `backend/internal/fixes/fixes.go`:

```go
// Package fixes applies direct fixes to installed data: names and detail
// fields, never topology (locked decision 10). It is pure: the caller loads
// the installed snapshot, applies the fix, and writes the result and the
// change log in one transaction. A fix never changes the topology revision.
package fixes

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"nettop.local/backend/internal/topology"
)

// Kinds of installed objects a fix can change; change_log.entity_kind uses them.
const (
	Equipment = "equipment"
	Endpoint  = "endpoint"
	Link      = "link"
	Site      = "site"
	Node      = "node"
	Rack      = "rack"
)

// MaxNote is the longest note on a fix, in characters.
const MaxNote = 500

// ErrNotFound: no installed object of that kind has that ID (404).
var ErrNotFound = errors.New("not found")

// Fix is one correction to one installed object. Name is the display name (a
// switch port's label for an endpoint); nil leaves it. Details sets the given
// fields; an empty string clears one.
type Fix struct {
	Kind    string
	ID      string
	Name    *string
	Details topology.Details
	Note    string
}

// Change is one field whose value the fix changed.
type Change struct {
	Field    string `json:"field"`
	OldValue string `json:"oldValue"`
	NewValue string `json:"newValue"`
}

// Entry is one change_log row.
type Entry struct {
	ID         int64     `json:"id"`
	At         time.Time `json:"at"`
	EntityKind string    `json:"entityKind"`
	EntityID   string    `json:"entityId"`
	Field      string    `json:"field"`
	OldValue   string    `json:"oldValue"`
	NewValue   string    `json:"newValue"`
	Note       string    `json:"note,omitempty"`
}

// order is the order changes are listed in: the name, then the detail fields
// in the order of topology.Details.Fields.
var order = []string{"name", "manufacturer", "model", "serialNumber", "ipAddress", "status", "description",
	"portType", "connector", "speed", "state", "label", "notes", "location", "rackType"}

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", topology.ErrInvalidInput, fmt.Sprintf(format, args...))
}
func duplicate(format string, args ...any) error {
	return fmt.Errorf("%w: %s", topology.ErrDuplicateName, fmt.Sprintf(format, args...))
}

// checkName reports whether a trimmed name has 1–max characters.
func checkName(name string, max int) error {
	if n := utf8.RuneCountInString(name); n < 1 || n > max {
		return invalid("a name must be 1–%d characters", max)
	}
	return nil
}

func setDetails(d topology.Details, set func(topology.DetailField) bool, who string) error {
	for _, f := range d.Fields() {
		if !set(f) {
			return invalid("%s: %s does not apply here", who, topology.DetailWord(f.Name))
		}
	}
	return nil
}

func diff(before, after map[string]string) []Change {
	var out []Change
	for _, k := range order {
		if b, ok := before[k]; ok && b != after[k] {
			out = append(out, Change{Field: k, OldValue: b, NewValue: after[k]})
		}
	}
	return out
}

func equipmentValues(e topology.Equipment) map[string]string {
	return map[string]string{"name": e.Name, "manufacturer": e.Manufacturer, "model": e.Model, "serialNumber": e.SerialNumber,
		"ipAddress": e.IPAddress, "status": e.Status, "description": e.Description}
}
func endpointValues(p topology.Endpoint) map[string]string {
	return map[string]string{"name": p.Label, "portType": p.PortType, "connector": p.Connector, "speed": p.Speed,
		"state": p.State, "description": p.Description}
}
func linkValues(l topology.Link) map[string]string {
	return map[string]string{"label": l.Label, "status": l.Status, "notes": l.Notes}
}
func placeValues(name, location, description string) map[string]string {
	return map[string]string{"name": name, "location": location, "description": description}
}

// Apply returns s with the fix applied and the fields it changed, in a fixed
// order (none when every value is already the one asked for). It never
// mutates s. Errors wrap ErrNotFound, topology.ErrDuplicateName or
// topology.ErrInvalidInput and are written in names.
func Apply(s topology.Snapshot, f Fix) (topology.Snapshot, []Change, error) {
	if utf8.RuneCountInString(strings.TrimSpace(f.Note)) > MaxNote {
		return s, nil, invalid("a note has at most %d characters", MaxNote)
	}
	var name string
	if f.Name != nil {
		name = strings.TrimSpace(*f.Name)
	}
	notFound := fmt.Errorf("%w: %s %s", ErrNotFound, f.Kind, f.ID)
	var before, after map[string]string

	switch f.Kind {
	case Equipment:
		i := slices.IndexFunc(s.Equipment, func(e topology.Equipment) bool { return e.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Equipment = slices.Clone(s.Equipment)
		e := &s.Equipment[i]
		before = equipmentValues(*e)
		if f.Name != nil {
			if err := checkName(name, 100); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Equipment, func(x topology.Equipment) bool { return x.ID != f.ID && strings.EqualFold(x.Name, name) }) {
				return s, nil, duplicate("%s already exists", name)
			}
			e.Name = name
		}
		if err := setDetails(f.Details, e.SetDetail, e.Name); err != nil {
			return s, nil, err
		}
		after = equipmentValues(*e)

	case Endpoint:
		i := slices.IndexFunc(s.Endpoints, func(p topology.Endpoint) bool { return p.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Endpoints = slices.Clone(s.Endpoints)
		p := &s.Endpoints[i]
		owner := topology.Equipment{}
		if j := slices.IndexFunc(s.Equipment, func(e topology.Equipment) bool { return e.ID == p.EquipmentID }); j >= 0 {
			owner = s.Equipment[j]
		}
		who := owner.Name + " · " + p.Label
		before = endpointValues(*p)
		if f.Name != nil {
			if owner.Kind != "switch" {
				return s, nil, invalid("%s: positions of panels and HDFs are named by their place", who)
			}
			if p.Position == 0 {
				return s, nil, invalid("%s was saved before port positions; its order comes from its label, so it cannot be renamed", who)
			}
			if err := checkName(name, 64); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Endpoints, func(x topology.Endpoint) bool {
				return x.ID != f.ID && x.EquipmentID == p.EquipmentID && strings.EqualFold(x.Label, name)
			}) {
				return s, nil, duplicate("%s already has a port named %s", owner.Name, name)
			}
			p.Label = name
		}
		if err := setDetails(f.Details, p.SetDetail, who); err != nil {
			return s, nil, err
		}
		after = endpointValues(*p)

	case Link:
		i := slices.IndexFunc(s.Links, func(l topology.Link) bool { return l.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		if s.Links[i].Kind != "cable" {
			return s, nil, invalid("%s is an internal bridge; it has no details", f.ID)
		}
		if f.Name != nil {
			return s, nil, invalid("a cable has no name; set its label instead")
		}
		s.Links = slices.Clone(s.Links)
		l := &s.Links[i]
		before = linkValues(*l)
		if err := setDetails(f.Details, l.SetDetail, "cable "+l.ID); err != nil {
			return s, nil, err
		}
		after = linkValues(*l)

	case Site:
		i := slices.IndexFunc(s.Sites, func(x topology.Site) bool { return x.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Sites = slices.Clone(s.Sites)
		x := &s.Sites[i]
		before = placeValues(x.Name, x.Location, x.Description)
		if f.Name != nil {
			if err := checkName(name, 100); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Sites, func(o topology.Site) bool { return o.ID != f.ID && strings.EqualFold(o.Name, name) }) {
				return s, nil, duplicate("a site named %s already exists", name)
			}
			x.Name = name
		}
		if err := setDetails(f.Details, x.SetDetail, x.Name); err != nil {
			return s, nil, err
		}
		after = placeValues(x.Name, x.Location, x.Description)

	case Node:
		i := slices.IndexFunc(s.Nodes, func(x topology.LocationNode) bool { return x.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Nodes = slices.Clone(s.Nodes)
		x := &s.Nodes[i]
		before = placeValues(x.Name, x.Location, x.Description)
		if f.Name != nil {
			if err := checkName(name, 100); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Nodes, func(o topology.LocationNode) bool {
				return o.ID != f.ID && o.SiteID == x.SiteID && strings.EqualFold(o.Name, name)
			}) {
				return s, nil, duplicate("this site already has a node named %s", name)
			}
			x.Name = name
		}
		if err := setDetails(f.Details, x.SetDetail, x.Name); err != nil {
			return s, nil, err
		}
		after = placeValues(x.Name, x.Location, x.Description)

	case Rack:
		i := slices.IndexFunc(s.Racks, func(x topology.Rack) bool { return x.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Racks = slices.Clone(s.Racks)
		x := &s.Racks[i]
		before = placeValues(x.Name, x.Location, x.Description)
		before["rackType"] = x.RackType
		if f.Name != nil {
			if err := checkName(name, 100); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Racks, func(o topology.Rack) bool {
				return o.ID != f.ID && o.NodeID == x.NodeID && strings.EqualFold(o.Name, name)
			}) {
				return s, nil, duplicate("this node already has a rack named %s", name)
			}
			x.Name = name
		}
		if err := setDetails(f.Details, x.SetDetail, x.Name); err != nil {
			return s, nil, err
		}
		after = placeValues(x.Name, x.Location, x.Description)
		after["rackType"] = x.RackType

	default:
		return s, nil, notFound
	}

	// The safety net: value sets, lengths, IP addresses and unique serial
	// numbers are checked by Validate, as for every installed or proposed topology.
	if err := topology.Validate(s); err != nil {
		return s, nil, invalid("%v", err)
	}
	return s, diff(before, after), nil
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd backend && go test ./internal/fixes -v`
Expected: PASS, every test. If `TestEquipmentDetailsAreSetAndValidatedInNames` or `TestSerialNumberMustStayUnique` fails on the message only, print `err` and adjust the **test's** expected substring to the exact text `topology.Validate` produces (do not change `details.go`); the message must still name the equipment.

- [ ] **Step 5: Vet**

Run: `cd backend && go vet ./internal/fixes`
Expected: no output. Do not commit.

---

### Task 2: Persistence — `Store.Fix` and `Store.ChangeLog`

**Files:**
- Create: `backend/internal/persistence/fix.go`
- Test: `backend/internal/persistence/fix_test.go`

**Interfaces:**
- Consumes: `fixes.Apply`, `fixes.Fix`, `fixes.Entry`, `loadInstalled(ctx, tx)` (exists in `store.go`), the test helpers `seeded(t, plans...)` and `installedRevision(t, s)` and `expansionDraft()` (exist in `record_test.go`, same package).
- Produces (used by Task 3):
  - `func (s *Store) Fix(ctx context.Context, f fixes.Fix) ([]fixes.Entry, error)` — returns the change_log rows it wrote (`[]`, never nil, when nothing changed).
  - `func (s *Store) ChangeLog(ctx context.Context, entityKind, entityID string) ([]fixes.Entry, error)` — newest first (`at DESC, id DESC`), `[]` when none.

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/persistence/fix_test.go`:

```go
package persistence

import (
	"context"
	"errors"
	"testing"

	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/topology"
)

// ptr is already defined in details_test.go (same package); do not redefine it.

func installedEquipment(t *testing.T, s *Store, id string) topology.Equipment {
	t.Helper()
	snap, err := s.Installed(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range snap.Equipment {
		if e.ID == id {
			return e
		}
	}
	t.Fatalf("no installed %s", id)
	return topology.Equipment{}
}

// FX-01: renaming installed AGG-03 writes one change-log row and leaves the
// topology revision and drafts valid.
func TestFX01RenameWritesOneLogRowAndKeepsRevisionAndDrafts(t *testing.T) {
	s, _ := seeded(t, expansionDraft())
	ctx := context.Background()
	revision := installedRevision(t, s)

	entries, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Name: ptr("AGG-03A"), Note: " relabelled on site "})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Field != "name" || entries[0].OldValue != "AGG-03" || entries[0].NewValue != "AGG-03A" ||
		entries[0].Note != "relabelled on site" || entries[0].ID == 0 || entries[0].At.IsZero() {
		t.Fatalf("entries = %+v", entries)
	}
	if got := installedEquipment(t, s, "agg-03").Name; got != "AGG-03A" {
		t.Fatalf("installed name = %q", got)
	}
	if got := installedRevision(t, s); got != revision {
		t.Fatalf("revision changed: %s -> %s", revision, got)
	}
	stale, conflicts, err := s.CheckPlan(ctx, "expansion")
	if err != nil || stale || len(conflicts) != 0 {
		t.Fatalf("the draft must stay current: stale=%v conflicts=%v err=%v", stale, conflicts, err)
	}
	if _, err = s.Snapshot(ctx, "expansion"); err != nil {
		t.Fatalf("the draft's proposed topology must still build: %v", err)
	}
	// The same fix again changes nothing and writes no row.
	again, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Name: ptr("AGG-03A")})
	if err != nil || again == nil || len(again) != 0 {
		t.Fatalf("again = %v, err = %v", again, err)
	}
	log, err := s.ChangeLog(ctx, fixes.Equipment, "agg-03")
	if err != nil || len(log) != 1 {
		t.Fatalf("log = %+v, err = %v", log, err)
	}
}

// FX-03 at the store: history lists every change, newest first, and only the asked object's.
func TestFX03ChangeLogListsNewestFirst(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Details: topology.Details{Manufacturer: ptr("Cisco")}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Details: topology.Details{Model: ptr("C9500")}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-08", Name: ptr("AGG-08B")}); err != nil {
		t.Fatal(err)
	}
	log, err := s.ChangeLog(ctx, fixes.Equipment, "agg-03")
	if err != nil {
		t.Fatal(err)
	}
	if len(log) != 2 || log[0].Field != "model" || log[1].Field != "manufacturer" {
		t.Fatalf("log = %+v", log)
	}
	none, err := s.ChangeLog(ctx, fixes.Rack, "rack-a03")
	if err != nil || none == nil || len(none) != 0 {
		t.Fatalf("none = %v, err = %v", none, err)
	}
}

func TestClearingADetailWritesNullAndLogsIt(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Link, ID: "cable-a01", Details: topology.Details{Label: ptr("A01")}}); err != nil {
		t.Fatal(err)
	}
	entries, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Link, ID: "cable-a01", Details: topology.Details{Label: ptr("")}})
	if err != nil || len(entries) != 1 || entries[0].OldValue != "A01" || entries[0].NewValue != "" {
		t.Fatalf("entries = %+v, err = %v", entries, err)
	}
	var isNull bool
	if err = s.pool.QueryRow(ctx, `SELECT label IS NULL FROM links WHERE id='cable-a01'`).Scan(&isNull); err != nil || !isNull {
		t.Fatalf("label must be NULL: %v %v", isNull, err)
	}
}

func TestARefusedFixWritesNothing(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Name: ptr("AGG-08")}); !errors.Is(err, topology.ErrDuplicateName) {
		t.Fatalf("err = %v", err)
	}
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "gone", Name: ptr("X")}); !errors.Is(err, fixes.ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
	var rows int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM change_log`).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("rows = %d, err = %v", rows, err)
	}
	if got := installedEquipment(t, s, "agg-03").Name; got != "AGG-03" {
		t.Fatalf("name = %q", got)
	}
}

// Review focus 2: a fix and then Record of a draft made before it.
func TestFixThenRecordKeepsTheFix(t *testing.T) {
	s, _ := seeded(t, expansionDraft())
	ctx := context.Background()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-15", Name: ptr("AGG-15X")}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Record(ctx, "expansion", "1", "EDGE-18 installed", "Tester"); err != nil {
		t.Fatalf("record after a fix: %v", err)
	}
	if got := installedEquipment(t, s, "agg-15").Name; got != "AGG-15X" {
		t.Fatalf("the fix was lost by Record: %q", got)
	}
}
```

Check before running: `expansionDraft()` in `record_test.go` cables `edge-18:p1` to `agg-15:p1`, so `TestFixThenRecordKeepsTheFix` fixes the equipment the draft touches. If `s.pool` is not accessible as a field in tests, look at how other `_test.go` files in the package query the database and use the same.

- [ ] **Step 2: Run the tests and see them fail**

Run: `cd backend && go test ./internal/persistence -run 'TestFX0|TestClearing|TestARefused|TestFixThen' -v`
Expected: FAIL to compile (`s.Fix undefined`). Confirm the tests are **not** skipped (they need `TEST_DATABASE_URL` from `.env`).

- [ ] **Step 3: Implement `fix.go`**

Create `backend/internal/persistence/fix.go`:

```go
package persistence

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/topology"
)

// Fix applies one direct fix to installed data in one transaction: it locks
// the installed root FOR UPDATE (as Record does, so the two never interleave),
// checks the fix on the whole installed snapshot, writes the object's row and
// one change_log row per changed field. The topology revision never changes,
// so drafts stay current. It returns the rows written ([] when nothing changed).
func (s *Store) Fix(ctx context.Context, f fixes.Fix) ([]fixes.Entry, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var revision string
	err = tx.QueryRow(ctx, `SELECT revision FROM installed_topology WHERE singleton=true FOR UPDATE`).Scan(&revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("installed topology is not initialized; run `go run ./cmd/db init`")
	}
	if err != nil {
		return nil, err
	}
	current, err := loadInstalled(ctx, tx)
	if err != nil {
		return nil, err
	}
	next, changes, err := fixes.Apply(current, f)
	if err != nil {
		return nil, err
	}
	entries := []fixes.Entry{}
	if len(changes) == 0 {
		return entries, tx.Commit(ctx)
	}
	if err = writeFixed(ctx, tx, next, f); err != nil {
		return nil, err
	}
	note := strings.TrimSpace(f.Note)
	for _, c := range changes {
		e := fixes.Entry{EntityKind: f.Kind, EntityID: f.ID, Field: c.Field, OldValue: c.OldValue, NewValue: c.NewValue, Note: note}
		if err = tx.QueryRow(ctx, `INSERT INTO change_log(entity_kind,entity_id,field,old_value,new_value,note)
			VALUES ($1,$2,$3,$4,$5,NULLIF($6,'')) RETURNING id, at`,
			e.EntityKind, e.EntityID, e.Field, e.OldValue, e.NewValue, e.Note).Scan(&e.ID, &e.At); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, tx.Commit(ctx)
}

// writeFixed writes the fixable columns of the one object the fix changed,
// from the snapshot `next` (empty strings become NULL, like the inserts).
func writeFixed(ctx context.Context, tx pgx.Tx, next topology.Snapshot, f fixes.Fix) error {
	var tag pgconn.CommandTag
	var err error
	switch f.Kind {
	case fixes.Equipment:
		e := next.Equipment[slices.IndexFunc(next.Equipment, func(x topology.Equipment) bool { return x.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE equipment SET name=$2, manufacturer=NULLIF($3,''), model=NULLIF($4,''), serial_number=NULLIF($5,''),
			ip_address=NULLIF($6,''), status=NULLIF($7,''), description=NULLIF($8,'') WHERE id=$1`,
			e.ID, e.Name, e.Manufacturer, e.Model, e.SerialNumber, e.IPAddress, e.Status, e.Description)
	case fixes.Endpoint:
		p := next.Endpoints[slices.IndexFunc(next.Endpoints, func(x topology.Endpoint) bool { return x.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE endpoints SET label=$2, port_type=NULLIF($3,''), connector=NULLIF($4,''), speed=NULLIF($5,''),
			state=NULLIF($6,''), description=NULLIF($7,'') WHERE id=$1`,
			p.ID, p.Label, p.PortType, p.Connector, p.Speed, p.State, p.Description)
	case fixes.Link:
		l := next.Links[slices.IndexFunc(next.Links, func(x topology.Link) bool { return x.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE links SET label=NULLIF($2,''), status=NULLIF($3,''), notes=NULLIF($4,'') WHERE id=$1`,
			l.ID, l.Label, l.Status, l.Notes)
	case fixes.Site:
		x := next.Sites[slices.IndexFunc(next.Sites, func(o topology.Site) bool { return o.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE sites SET name=$2, location=NULLIF($3,''), description=NULLIF($4,'') WHERE id=$1`,
			x.ID, x.Name, x.Location, x.Description)
	case fixes.Node:
		x := next.Nodes[slices.IndexFunc(next.Nodes, func(o topology.LocationNode) bool { return o.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE location_nodes SET name=$2, location=NULLIF($3,''), description=NULLIF($4,'') WHERE id=$1`,
			x.ID, x.Name, x.Location, x.Description)
	case fixes.Rack:
		x := next.Racks[slices.IndexFunc(next.Racks, func(o topology.Rack) bool { return o.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE racks SET name=$2, location=NULLIF($3,''), rack_type=NULLIF($4,''), description=NULLIF($5,'') WHERE id=$1`,
			x.ID, x.Name, x.Location, x.RackType, x.Description)
	default:
		return fmt.Errorf("%w: %s", fixes.ErrNotFound, f.Kind)
	}
	if err == nil && tag.RowsAffected() != 1 {
		err = fmt.Errorf("fix of %s %s updated %d rows", f.Kind, f.ID, tag.RowsAffected())
	}
	return err
}

// ChangeLog lists the direct fixes of one object, newest first.
func (s *Store) ChangeLog(ctx context.Context, entityKind, entityID string) ([]fixes.Entry, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, at, entity_kind, entity_id, field, COALESCE(old_value,''), COALESCE(new_value,''), COALESCE(note,'')
		FROM change_log WHERE entity_kind=$1 AND entity_id=$2 ORDER BY at DESC, id DESC`, entityKind, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []fixes.Entry{}
	for rows.Next() {
		var e fixes.Entry
		if err = rows.Scan(&e.ID, &e.At, &e.EntityKind, &e.EntityID, &e.Field, &e.OldValue, &e.NewValue, &e.Note); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
```

Note: two fixes in one transaction get the same `now()`; `ORDER BY at DESC, id DESC` keeps the newest first anyway. The fixes in `TestFX03` run in separate transactions.

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd backend && go test ./internal/persistence -run 'TestFX0|TestClearing|TestARefused|TestFixThen' -v`
Expected: PASS (not SKIP).

- [ ] **Step 5: Run the whole persistence package**

Run: `cd backend && go test -race ./internal/persistence ./internal/fixes`
Expected: PASS. Do not commit.

---

### Task 3: HTTP — `PATCH /api/installed/{kind}/{id}` and `GET /api/change-log`

**Files:**
- Modify: `backend/internal/httpapi/server.go` (the `Repository` interface, `repositoryError`, two routes)
- Test: `backend/internal/httpapi/fix_api_test.go`

**Interfaces:**
- Consumes: `Store.Fix`, `Store.ChangeLog` (Task 2), `fixes.*` (Task 1); test helpers `handlerFor(t, base, plans...)` (in `add_hdf_api_test.go`, real Postgres schema), `newCaller` (in `trace_api_test.go`), `decodeBody[T]` and `errorOf` (in `layout_api_test.go`), `acceptance.Installed()`.
- Produces (used by Task 4 — the HTTP contract):
  - `PATCH /api/installed/{kind}/{id}` where `kind` ∈ `equipment | endpoints | links | sites | nodes | racks`. Body: `{"name"?: string, "details"?: Details, "note"?: string}`. 200 `{"changes": Entry[]}`.
  - `GET /api/change-log?entityKind=<equipment|endpoint|link|site|node|rack>&entityId=<id>` → 200 `Entry[]` newest first. Missing parameter → 400.

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/httpapi/fix_api_test.go`:

```go
package httpapi

import (
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/topology"
)

type fixAnswer struct {
	Changes []fixes.Entry `json:"changes"`
}

func TestFixRenamesOverHTTPWithoutChangingTheRevision(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	before := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200)).Revision
	got := decodeBody[fixAnswer](t, call("PATCH", "/api/installed/equipment/agg-03", `{"name":"AGG-03A","note":"new label"}`, 200))
	if len(got.Changes) != 1 || got.Changes[0].Field != "name" || got.Changes[0].NewValue != "AGG-03A" || got.Changes[0].EntityKind != "equipment" {
		t.Fatalf("changes = %+v", got.Changes)
	}
	after := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200))
	if after.Revision != before {
		t.Fatalf("revision changed: %s -> %s", before, after.Revision)
	}
	same := decodeBody[fixAnswer](t, call("PATCH", "/api/installed/equipment/agg-03", `{"name":"AGG-03A"}`, 200))
	if same.Changes == nil || len(same.Changes) != 0 {
		t.Fatalf("no change must answer an empty list: %+v", same.Changes)
	}
}

// FX-02: topology fields are rejected; nothing is written.
func TestFX02TopologyFieldsAndBadInputAreRejected(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	for _, body := range []string{`{"rackId":"rack-dr01"}`, `{"unit":3}`, `{"networkId":"net-b","name":"X"}`, `{"role":"backbone"}`} {
		msg := errorOf(t, call("PATCH", "/api/installed/equipment/agg-03", body, 422))
		if !strings.Contains(msg, "changes the topology: use a plan") {
			t.Errorf("%s: %q", body, msg)
		}
	}
	call("PATCH", "/api/installed/equipment/agg-03", `{"colour":"red"}`, 400)
	call("PATCH", "/api/installed/equipment/agg-03", `{"details":{"colour":"red"}}`, 400)
	call("PATCH", "/api/installed/equipment/agg-03", `not json`, 400)
	call("PATCH", "/api/installed/equipment/gone", `{"name":"X"}`, 404)
	call("PATCH", "/api/installed/plans/expansion", `{"name":"X"}`, 404)
	call("PATCH", "/api/installed/equipment/agg-03", `{"name":"AGG-08"}`, 409)
	call("PATCH", "/api/installed/equipment/agg-03", `{"details":{"status":"broken"}}`, 422)
	call("PATCH", "/api/installed/equipment/agg-03", `{"details":{"rackType":"standard"}}`, 422)
	call("PATCH", "/api/installed/endpoints/panel-a:4:f", `{"name":"X"}`, 422)
	call("PATCH", "/api/installed/equipment/agg-03", `{"name":"AGG-03A","note":"`+strings.Repeat("n", 501)+`"}`, 422)
	log := decodeBody[[]fixes.Entry](t, call("GET", "/api/change-log?entityKind=equipment&entityId=agg-03", "", 200))
	if len(log) != 0 {
		t.Fatalf("a refused fix must write nothing: %+v", log)
	}
}

// FX-03: history lists the changes, newest first.
func TestFX03HistoryOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	call("PATCH", "/api/installed/links/cable-a01", `{"details":{"label":"A01 patch"}}`, 200)
	call("PATCH", "/api/installed/links/cable-a01", `{"details":{"status":"testing"},"note":"fluke test"}`, 200)
	log := decodeBody[[]fixes.Entry](t, call("GET", "/api/change-log?entityKind=link&entityId=cable-a01", "", 200))
	if len(log) != 2 || log[0].Field != "status" || log[0].Note != "fluke test" || log[1].Field != "label" {
		t.Fatalf("log = %+v", log)
	}
	call("GET", "/api/change-log?entityId=cable-a01", "", 400)
	call("GET", "/api/change-log?entityKind=link", "", 400)
}
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `cd backend && go test ./internal/httpapi -run 'TestFix|TestFX0' -v`
Expected: FAIL (404s for the unknown routes, or compile error once `fixes` is imported into the test only). Confirm they are not skipped.

- [ ] **Step 3: Extend the `Repository` interface**

In `backend/internal/httpapi/server.go`, add the import `"nettop.local/backend/internal/fixes"` and these methods at the end of `Repository` (after `RenameNetwork`):

```go
	// Direct fixes of installed names and details (never topology): one
	// change_log row per changed field; the topology revision never changes.
	Fix(ctx context.Context, f fixes.Fix) ([]fixes.Entry, error)
	ChangeLog(ctx context.Context, entityKind, entityID string) ([]fixes.Entry, error)
```

In `repositoryError`, add a case before `default`:

```go
	case errors.Is(err, fixes.ErrNotFound):
		problem(w, 404, "Not found: "+strings.TrimPrefix(err.Error(), "not found: "))
```

(add `"strings"` to the imports if it is not there).

- [ ] **Step 4: Add the routes**

In `server.go`, before `return mux`, add:

```go
	// Direct fixes: names and details of installed objects, never topology.
	mux.HandleFunc("PATCH /api/installed/{kind}/{id}", func(w http.ResponseWriter, r *http.Request) {
		kind, ok := fixKinds[r.PathValue("kind")]
		if !ok {
			problem(w, 404, "Not found: "+r.PathValue("kind"))
			return
		}
		var body map[string]json.RawMessage
		if !decode(w, r, &body) {
			return
		}
		f := fixes.Fix{Kind: kind, ID: r.PathValue("id")}
		for key, raw := range body {
			switch {
			case key == "name":
				var name string
				if json.Unmarshal(raw, &name) != nil {
					problem(w, 400, "Invalid request JSON")
					return
				}
				f.Name = &name
			case key == "note":
				if json.Unmarshal(raw, &f.Note) != nil {
					problem(w, 400, "Invalid request JSON")
					return
				}
			case key == "details":
				decoder := json.NewDecoder(bytes.NewReader(raw))
				decoder.DisallowUnknownFields()
				if decoder.Decode(&f.Details) != nil {
					problem(w, 400, "Invalid request JSON")
					return
				}
			case topologyFields[key]:
				problem(w, 422, key+" changes the topology: use a plan")
				return
			default:
				problem(w, 400, "Invalid request JSON")
				return
			}
		}
		entries, err := repo.Fix(r.Context(), f)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, map[string]any{"changes": entries})
	})
	mux.HandleFunc("GET /api/change-log", func(w http.ResponseWriter, r *http.Request) {
		kind, id := r.URL.Query().Get("entityKind"), r.URL.Query().Get("entityId")
		if kind == "" || id == "" {
			problem(w, 400, "entityKind and entityId are required")
			return
		}
		entries, err := repo.ChangeLog(r.Context(), kind, id)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, entries)
	})
```

And at package level (outside `func New(repo Repository, environment string) http.Handler`, which builds `mux`):

```go
// fixKinds maps the PATCH path's plural to change_log's entity kind.
var fixKinds = map[string]string{
	"equipment": fixes.Equipment, "endpoints": fixes.Endpoint, "links": fixes.Link,
	"sites": fixes.Site, "nodes": fixes.Node, "racks": fixes.Rack,
}

// topologyFields are the fields a direct fix refuses with 422 (they change
// topology, so they go through a plan), as opposed to unknown fields (400).
var topologyFields = map[string]bool{
	"id": true, "kind": true, "role": true, "networkId": true, "rackId": true, "unit": true, "height": true,
	"siteId": true, "nodeId": true, "units": true, "equipmentId": true, "subpanelId": true,
	"position": true, "side": true, "portGroup": true, "a": true, "b": true,
}
```

Add `"bytes"` to the imports. Check how `decode` handles a JSON object into `map[string]json.RawMessage` (it does; `DisallowUnknownFields` does not affect maps), and that a JSON `null` body is still refused: if `body == nil` after decoding, answer 400.

- [ ] **Step 5: Make the real store satisfy the interface**

Run: `cd backend && go build ./...`
Expected: success (`*persistence.Store` now has `Fix` and `ChangeLog`). If any other type in tests implements `Repository` (search: `grep -rn "Repository" backend/internal/httpapi/*_test.go backend/cmd`), add the two methods to it.

- [ ] **Step 6: Run the tests and see them pass**

Run: `cd backend && go test ./internal/httpapi -run 'TestFix|TestFX0' -v`
Expected: PASS (not SKIP). Then `cd backend && go test -race ./... && go vet ./...` → all PASS. Do not commit.

---

### Task 4: Contract and client — OpenAPI, `types.ts`, `api.ts`

**Files:**
- Modify: `api/openapi.yaml`
- Modify: `frontend/src/shared/types.ts`
- Modify: `frontend/src/shared/api.ts`
- Test: `frontend/src/shared/api.test.ts`

**Interfaces:**
- Consumes: the HTTP contract from Task 3.
- Produces (used by step 13's UI):
  - `export type ChangeLogKind = 'equipment' | 'endpoint' | 'link' | 'site' | 'node' | 'rack'`
  - `export interface ChangeLogEntry { id: number; at: string; entityKind: ChangeLogKind; entityId: string; field: string; oldValue: string; newValue: string; note?: string }`
  - `export interface DirectFix { name?: string; details?: Details; note?: string }`
  - `export const fixInstalled = (kind: ChangeLogKind, id: string, fix: DirectFix) => Promise<{ changes: ChangeLogEntry[] }>`
  - `export const getChangeLog = (kind: ChangeLogKind, id: string, signal?: AbortSignal) => Promise<ChangeLogEntry[]>`

- [ ] **Step 1: Write the failing client tests**

Append to `frontend/src/shared/api.test.ts` (and add `fixInstalled, getChangeLog` to its import list from `./api`):

```ts
it('FX client: a direct fix PATCHes the plural path with only name, details and note', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ changes: [{ id: 1, field: 'name' }] }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const answer = await fixInstalled('endpoint', 'sw/1:p1', {
    name: 'Gi1/0/9',
    details: { state: 'faulty' },
    note: 'relabelled',
  })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/installed/endpoints/sw%2F1%3Ap1')
  expect(init.method).toBe('PATCH')
  expect(JSON.parse(init.body)).toEqual({
    name: 'Gi1/0/9',
    details: { state: 'faulty' },
    note: 'relabelled',
  })
  expect(answer.changes).toHaveLength(1)
})

it('FX client: history asks for one object by kind and ID', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => [] })
  vi.stubGlobal('fetch', fetchMock)
  await getChangeLog('rack', 'rack a03')
  expect(fetchMock.mock.calls[0][0]).toBe(
    '/api/change-log?entityKind=rack&entityId=rack%20a03',
  )
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd frontend && npx vitest run src/shared/api.test.ts -t "FX client"`
Expected: FAIL (`fixInstalled is not a function` / not exported).

- [ ] **Step 3: Add the types**

In `frontend/src/shared/types.ts`, after the `Details` type:

```ts
/** change_log's entity kinds (singular); the PATCH path uses the plural. */
export type ChangeLogKind =
  | 'equipment'
  | 'endpoint'
  | 'link'
  | 'site'
  | 'node'
  | 'rack'

/** One field changed by a direct fix (GET /change-log, PATCH /installed/...). */
export interface ChangeLogEntry {
  id: number
  at: string
  entityKind: ChangeLogKind
  entityId: string
  field: string
  oldValue: string
  newValue: string
  note?: string
}

/**
 * A direct fix of an installed object: its name (a switch port's label) and
 * detail fields only, never topology. An empty string clears a detail.
 */
export interface DirectFix {
  name?: string
  details?: Details
  note?: string
}
```

- [ ] **Step 4: Add the client functions**

In `frontend/src/shared/api.ts`, add `ChangeLogEntry`, `ChangeLogKind`, `DirectFix` to the type import, and after `renameNetwork`:

```ts
const FIX_PATH: Record<ChangeLogKind, string> = {
  equipment: 'equipment',
  endpoint: 'endpoints',
  link: 'links',
  site: 'sites',
  node: 'nodes',
  rack: 'racks',
}
/**
 * A direct fix of installed names and details (never topology): the server
 * writes one change-log row per changed field and keeps the topology revision,
 * so drafts stay current. 404 unknown object, 409 duplicate name, 422 invalid.
 */
export const fixInstalled = (kind: ChangeLogKind, id: string, fix: DirectFix) =>
  request<{ changes: ChangeLogEntry[] }>(
    `/installed/${FIX_PATH[kind]}/${encodeURIComponent(id)}`,
    json('PATCH', fix),
  )
/** An object's direct fixes, newest first. */
export const getChangeLog = (
  kind: ChangeLogKind,
  id: string,
  signal?: AbortSignal,
) =>
  request<ChangeLogEntry[]>(
    `/change-log?entityKind=${kind}&entityId=${encodeURIComponent(id)}`,
    { signal },
  )
```

(`json(method, body)` already exists in `api.ts`; it sets the method, the JSON header and the body.)

- [ ] **Step 5: Run the client tests and see them pass**

Run: `cd frontend && npx vitest run src/shared/api.test.ts`
Expected: PASS.

- [ ] **Step 6: OpenAPI**

In `api/openapi.yaml`:

1. In `info.description`, replace the last sentence "The only way installed topology changes is recording a draft (POST /plans/{id}/record); there are no direct edit endpoints yet." with: "The only way installed topology changes is recording a draft (POST /plans/{id}/record). Names and detail fields of installed objects can be corrected directly (PATCH /installed/{kind}/{id}); each changed field is written to the change log, and the topology revision does not change."
2. Under `paths:`, after `/networks/{id}`, add:

```yaml
  /installed/{kind}/{id}:
    parameters:
      - in: path
        name: kind
        required: true
        schema: {type: string, enum: [equipment, endpoints, links, sites, nodes, racks]}
      - in: path
        name: id
        required: true
        schema: {type: string}
    patch:
      operationId: fixInstalled
      summary: Correct an installed object's name or details (a direct fix)
      description: "Changes only names and detail fields, never topology: a field such as rackId, unit, networkId or role is 422 (use a plan); an unknown field is 400. Fixable: equipment name and details; a switch port's label (only ports with a position; panel and HDF positions are named by their place) and port details; a cable's label, status and notes (a cable has no name; an internal bridge has no details); site and node name, location and description; rack name, location, rack type and description. Names follow the plan commands' rules (1–100 characters, a port label 1–64; equipment unique in Installed, nodes within their site, racks within their node, port labels on their switch, all ignoring case: 409). One change-log row is written per changed field, in one transaction; the topology revision does not change, so drafts stay current. Same values answer an empty list."
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: '#/components/schemas/DirectFix'}
      responses:
        '200':
          description: The change-log rows written, in field order
          content:
            application/json:
              schema:
                type: object
                required: [changes]
                properties:
                  changes:
                    type: array
                    items: {$ref: '#/components/schemas/ChangeLogEntry'}
        '400': {$ref: '#/components/responses/Error'}
        '404': {$ref: '#/components/responses/Error'}
        '409': {$ref: '#/components/responses/Error'}
        '422': {$ref: '#/components/responses/Error'}
        '500': {$ref: '#/components/responses/Error'}
  /change-log:
    get:
      operationId: getChangeLog
      summary: An installed object's direct fixes, newest first
      parameters:
        - in: query
          name: entityKind
          required: true
          schema: {type: string, enum: [equipment, endpoint, link, site, node, rack]}
        - in: query
          name: entityId
          required: true
          schema: {type: string}
      responses:
        '200':
          description: Newest first; empty when the object has none
          content:
            application/json:
              schema:
                type: array
                items: {$ref: '#/components/schemas/ChangeLogEntry'}
        '400': {$ref: '#/components/responses/Error'}
        '500': {$ref: '#/components/responses/Error'}
```

3. Under `components: schemas:`, add:

```yaml
    DirectFix:
      type: object
      additionalProperties: false
      properties:
        name: {type: string, description: The display name; a switch port's label for an endpoint.}
        details: {$ref: '#/components/schemas/Details'}
        note: {type: string, maxLength: 500}
    ChangeLogEntry:
      type: object
      required: [id, at, entityKind, entityId, field, oldValue, newValue]
      properties:
        id: {type: integer}
        at: {type: string, format: date-time}
        entityKind: {type: string, enum: [equipment, endpoint, link, site, node, rack]}
        entityId: {type: string}
        field: {type: string, description: '"name" or a detail field name.'}
        oldValue: {type: string}
        newValue: {type: string, description: Empty when the field was cleared.}
        note: {type: string}
```

4. In `components.responses.Error.description`, add "unknown installed object or kind" to the 404 list, "duplicate name" stays under 409, and "a topology field in a direct fix" to the 422 list.
5. Bump `info.version` from `0.5.0` to `0.6.0`.

Run: `cd frontend && npx --yes @redocly/cli lint ../api/openapi.yaml --extends minimal`
Expected: no errors.

- [ ] **Step 7: Frontend checks**

Run: `cd frontend && npm test && npm run typecheck && npm run build && npm run format` then `npm run format:check`
Expected: all pass. Do not commit.

---

### Task 5: Docs, full check run, stop for review

**Files:**
- Modify: `docs/current-status.md`, `docs/implementation-plan.md`, `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1: `docs/implementation-plan.md`**

In the M5 steps table, row **12**, append to the Work cell: ` *Done 2026-10-13 (backend and client; the UI is step 13).*` Also fix the stale notes on rows 11 and 11b: migration 008 **has run on the development database** (applied 2026-10-12, checksum `ff6789cf…` matches the file), so replace "(migration 008 not yet run on the development database: review first)" with "(migration 008 applied to the development database on 2026-10-12)" in both rows.

- [ ] **Step 2: `docs/current-status.md`**

1. In the first paragraph, after the M5c sentence, add that M5b steps 11, 11b and 12 are done, and that the patching screen (data-entry fix 1) shipped.
2. Add a section **"### Direct fixes and change log (M5b step 12)"** before "### Seeds and fixtures", describing exactly what runs: the two endpoints, the fixable fields per kind, the name rules, the status codes, "the topology revision never changes; drafts stay current", "a fix locks the installed root like Record, so the two never interleave", the change_log rows (one per changed field, `note` optional, no user until M7), and the test IDs (FX-01 `persistence/fix_test.go`; FX-02, FX-03 `httpapi/fix_api_test.go`; the pure rules `fixes/fixes_test.go`; the client in `src/shared/api.test.ts`).
3. Under it, **Known limits:** names are checked against Installed only (a draft adding the same name is not checked); ports saved before port positions (position 0) cannot be renamed; no UI yet (step 13); no user on change-log rows (M7).
4. In the Detail fields (step 11) section, change "**It has been run only in test schemas; review it before it runs on the development database.**" to say it was applied to the development database on 2026-10-12. Replace "direct fixes of installed details (step 12)" under "Not yet" with "the UI for details and direct fixes (step 13)". Same edit in the 11b section's sentence about migration 008.

- [ ] **Step 3: `CLAUDE.md` and `AGENTS.md`**

- `CLAUDE.md`: in the long status paragraph, replace "The next checkpoint is **M5b step 11 (detail fields, migration 008; see "Step 11 design")** in `docs/implementation-plan.md`, with P2 planned from the data-entry rehearsal; review migration 008 before it runs on the development database." with "M5b steps 11, 11b and 12 are done (detail fields, interface names, direct fixes with the change log). The next checkpoint is **M5b step 13 (the details UI)** in `docs/implementation-plan.md`, with P2 planned from the data-entry rehearsal." In the Architecture list add one bullet: "`internal/fixes`: pure direct fixes of installed names and details (`Apply`), used by `persistence.Store.Fix`; never topology, never the revision."
- `AGENTS.md`: replace "(currently M5b step 11, with the production-readiness step P2 planned from the data-entry rehearsal)" with "(currently M5b step 13, with the production-readiness step P2 planned from the data-entry rehearsal)".

- [ ] **Step 4: Full check run**

```bash
cd backend && go test -race ./... && go vet ./...
cd ../frontend && npm test && npm run typecheck && npm run build && npm run format:check
npx --yes @redocly/cli lint ../api/openapi.yaml --extends minimal
npm run test:e2e
```

Expected: everything passes; Go database tests **ran** (not skipped); Playwright reports 0 failed (1 skipped is the opt-in scale spec). The browser tests do not exercise fixes yet (no UI); they must simply stay green.

- [ ] **Step 5: Stop for review**

Do **not** commit or push. Report to the owner: the files changed, the test results (with counts), the known limits, and that the next step is M5b step 13 (the details UI), which gets its own plan.
