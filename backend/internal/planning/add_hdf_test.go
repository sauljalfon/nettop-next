package planning_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/sample"
	"nettop.local/backend/internal/topology"
)

func addHDF(name string, unit, height, rows int) planning.Command {
	return planning.Command{Type: "add_hdf", ExpectedRevision: "1", HDF: &planning.HDFInput{Name: name, RackID: "rack-03", Unit: unit, Height: height, Rows: rows}}
}

// emptyPlan is a draft with no additions (the Expansion fixture occupies
// rack-03 unit 6 and agg-02:p2, which several cases below need free).
func emptyPlan() planning.Plan {
	return planning.Plan{ID: "p", BaseRevision: "sample-1", Revision: "1", Equipment: []topology.Equipment{}, Updates: []topology.Equipment{}, Subpanels: []topology.Subpanel{}, Endpoints: []topology.Endpoint{}, Links: []topology.Link{}}
}

// D04/D05 through the command: one atomic addition creates the chassis, 4N
// subpanels, 24N positions as 48N endpoints, and 24N bridges.
func TestAddHDFCreatesCompleteGridAtomically(t *testing.T) {
	for _, rows := range []int{1, 2, 4, 17, 32} {
		t.Run(fmt.Sprintf("%d rows", rows), func(t *testing.T) {
			base, p := sample.Installed(), emptyPlan()
			next, err := planning.Execute(base, p, addHDF("HDF-NEW", 3, 3, rows), "eq-hdf")
			if err != nil {
				t.Fatal(err)
			}
			if got := [3]int{len(next.Subpanels), len(next.Endpoints), len(next.Links)}; got != [3]int{4 * rows, 48 * rows, 24 * rows} {
				t.Fatalf("capacity (subpanels, endpoints, bridges) = %v", got)
			}
			if next.Revision != "2" || len(next.Equipment) != 1 {
				t.Fatalf("revision or chassis wrong: %+v", next)
			}
			chassis := next.Equipment[0]
			if chassis.ID != "eq-hdf" || chassis.Kind != "hdf" || chassis.Role != "passive" || chassis.NetworkID != "" || chassis.Name != "HDF-NEW" {
				t.Fatalf("chassis wrong: %+v", chassis)
			}
			if chassis.RackID != "rack-03" || chassis.Unit != 3 || chassis.Height != 3 {
				t.Fatalf("placement/height must be the configured values, independent of rows: %+v", chassis)
			}
			planned, err := planning.Apply(base, next)
			if err != nil {
				t.Fatalf("the overlay must be valid: %v", err)
			}
			if len(planned.Subpanels) != 4*rows || len(base.Subpanels) != 0 {
				t.Fatalf("overlay must add subpanels without touching installed: %d/%d", len(planned.Subpanels), len(base.Subpanels))
			}
		})
	}
}

// The safety cap per atomic command (128 subpanels, 768 positions, 1,536 side
// endpoints) is exactly what 32 rows produces.
func TestAddHDFSafetyCapMatchesThirtyTwoRows(t *testing.T) {
	next, err := planning.Execute(sample.Installed(), emptyPlan(), addHDF("HDF-MAX", 3, 3, 32), "eq")
	if err != nil {
		t.Fatal(err)
	}
	if len(next.Subpanels) != 128 || len(next.Links) != 768 || len(next.Endpoints) != 1536 {
		t.Fatalf("cap mismatch: %d/%d/%d", len(next.Subpanels), len(next.Links), len(next.Endpoints))
	}
}

func TestAddHDFIDsDeriveFromTheAllocatedChassisID(t *testing.T) {
	next, err := planning.Execute(sample.Installed(), emptyPlan(), addHDF("HDF-NEW", 3, 1, 2), "eq-hdf")
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{"eq-hdf": true}
	for _, sp := range next.Subpanels {
		if !strings.HasPrefix(sp.ID, "eq-hdf") || sp.EquipmentID != "eq-hdf" || seen[sp.ID] {
			t.Fatalf("bad subpanel identity %+v", sp)
		}
		seen[sp.ID] = true
	}
	for _, e := range next.Endpoints {
		if e.EquipmentID != "eq-hdf" || !strings.HasPrefix(e.ID, "eq-hdf") || seen[e.ID] {
			t.Fatalf("bad endpoint identity %+v", e)
		}
		seen[e.ID] = true
	}
	for _, l := range next.Links {
		if l.Kind != "internal" || seen[l.ID] {
			t.Fatalf("bad bridge %+v", l)
		}
		seen[l.ID] = true
	}
}

// add_hdf shares one grid builder with fixtures: same structure, same IDs.
func TestAddHDFUsesTheSharedDomainBuilder(t *testing.T) {
	next, err := planning.Execute(sample.Installed(), emptyPlan(), addHDF("HDF-NEW", 3, 3, 3), "eq-hdf")
	if err != nil {
		t.Fatal(err)
	}
	want := topology.NewHDF("eq-hdf", "HDF-NEW", "rack-03", 3, 3, 3)
	if !reflect.DeepEqual(next.Equipment[0], want.Equipment) || !reflect.DeepEqual(next.Subpanels, want.Subpanels) || !reflect.DeepEqual(next.Endpoints, want.Endpoints) || !reflect.DeepEqual(next.Links, want.Links) {
		t.Fatal("add_hdf diverged from topology.NewHDF")
	}
	if !reflect.DeepEqual(sample.HDF("eq-hdf", "HDF-NEW", "rack-03", 3, 3, 3), want) {
		t.Fatal("sample.HDF diverged from topology.NewHDF")
	}
}

// D12: any validation or placement failure changes nothing, and the original
// draft is never mutated.
func TestAddHDFRejectsInvalidInputWithoutChangingTheDraft(t *testing.T) {
	cases := map[string]func(*planning.Command){
		"zero rows":           func(c *planning.Command) { c.HDF.Rows = 0 },
		"negative rows":       func(c *planning.Command) { c.HDF.Rows = -4 },
		"33 rows":             func(c *planning.Command) { c.HDF.Rows = 33 },
		"huge rows":           func(c *planning.Command) { c.HDF.Rows = 1 << 40 },
		"blank name":          func(c *planning.Command) { c.HDF.Name = "   " },
		"long name":           func(c *planning.Command) { c.HDF.Name = strings.Repeat("x", 101) },
		"duplicate name":      func(c *planning.Command) { c.HDF.Name = "edge-01" },
		"unit zero":           func(c *planning.Command) { c.HDF.Unit = 0 },
		"unit above range":    func(c *planning.Command) { c.HDF.Unit = 101 },
		"height zero":         func(c *planning.Command) { c.HDF.Height = 0 },
		"height above range":  func(c *planning.Command) { c.HDF.Height = 101 },
		"overflowing height":  func(c *planning.Command) { c.HDF.Height = 1 << 62 },
		"unknown rack":        func(c *planning.Command) { c.HDF.RackID = "missing" },
		"empty rack":          func(c *planning.Command) { c.HDF.RackID = "" },
		"beyond rack top":     func(c *planning.Command) { c.HDF.Unit, c.HDF.Height = 11, 3 },
		"collides installed":  func(c *planning.Command) { c.HDF.Unit, c.HDF.Height = 7, 2 },
		"collides proposal":   func(c *planning.Command) { c.HDF.Unit, c.HDF.Height = 5, 2 },
		"missing payload":     func(c *planning.Command) { c.HDF = nil },
		"with equipment":      func(c *planning.Command) { c.Equipment = &planning.EquipmentInput{Name: "x"} },
		"with cable":          func(c *planning.Command) { c.Cable = &planning.CableInput{A: "a", B: "b"} },
		"with placement":      func(c *planning.Command) { c.Placement = &planning.PlacementInput{EquipmentID: "edge-01"} },
		"missing expectation": func(c *planning.Command) { c.ExpectedRevision = "" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			base, p := sample.Installed(), sample.Expansion() // EDGE-02 is proposed at rack-03 unit 6
			before, _ := json.Marshal(p)
			c := addHDF("HDF-NEW", 3, 3, 2)
			mutate(&c)
			got, err := planning.Execute(base, p, c, "eq-hdf")
			if !errors.Is(err, planning.ErrInvalid) {
				t.Fatalf("expected ErrInvalid, got %v", err)
			}
			if !reflect.DeepEqual(got, planning.Plan{}) {
				t.Fatalf("a failed command must return no plan: %+v", got)
			}
			if after, _ := json.Marshal(p); string(after) != string(before) {
				t.Fatal("a failed command mutated the draft")
			}
		})
	}
	// The same input without the fault is valid, so each case above fails for its own reason.
	if _, err := planning.Execute(sample.Installed(), sample.Expansion(), addHDF("HDF-NEW", 3, 3, 2), "eq-hdf"); err != nil {
		t.Fatalf("baseline command must be valid: %v", err)
	}
	stale := addHDF("HDF-NEW", 3, 3, 2)
	stale.ExpectedRevision = "old"
	if _, err := planning.Execute(sample.Installed(), sample.Expansion(), stale, "eq-hdf"); !errors.Is(err, planning.ErrConflict) {
		t.Fatal("stale add_hdf accepted")
	}
}

func TestAddHDFConflictWithAnEarlierHDFLeavesOnlyTheFirst(t *testing.T) {
	base := sample.Installed()
	first, err := planning.Execute(base, emptyPlan(), addHDF("HDF-A", 3, 3, 2), "eq-a")
	if err != nil {
		t.Fatal(err)
	}
	second := addHDF("HDF-B", 4, 2, 2) // units 4-5 overlap HDF-A at 3-5
	second.ExpectedRevision = first.Revision
	if _, err := planning.Execute(base, first, second, "eq-b"); !errors.Is(err, planning.ErrInvalid) {
		t.Fatalf("overlapping HDFs accepted: %v", err)
	}
	if len(first.Equipment) != 1 || len(first.Subpanels) != 8 || first.Revision != "2" {
		t.Fatalf("the saved draft changed: %+v", first)
	}
	second.HDF.Unit = 6 // units 6-7 are free
	both, err := planning.Execute(base, first, second, "eq-b")
	if err != nil || len(both.Subpanels) != 16 || both.Revision != "3" {
		t.Fatalf("non-overlapping HDFs must coexist: %v", err)
	}
}

func TestProposedHDFCanBeMovedAndMoveConflictsAreRejected(t *testing.T) {
	base := sample.Installed()
	p, err := planning.Execute(base, emptyPlan(), addHDF("HDF-A", 3, 3, 2), "eq-a")
	if err != nil {
		t.Fatal(err)
	}
	move := func(unit int) (planning.Plan, error) {
		return planning.Execute(base, p, planning.Command{Type: "move_equipment", ExpectedRevision: p.Revision, Placement: &planning.PlacementInput{EquipmentID: "eq-a", RackID: "rack-03", Unit: unit}}, "ignored")
	}
	moved, err := move(1)
	if err != nil || moved.Equipment[0].Unit != 1 || len(moved.Subpanels) != 8 || len(moved.Endpoints) != 96 {
		t.Fatalf("moving a proposed HDF must keep its grid: %v", err)
	}
	if _, err := move(8); !errors.Is(err, planning.ErrInvalid) {
		t.Fatal("move onto EDGE-01 accepted")
	}
}

// A proposed HDF is fully traceable through the shared engine.
func TestProposedHDFIsTraceableThroughExactPositions(t *testing.T) {
	base := sample.Installed()
	p, err := planning.Execute(base, emptyPlan(), addHDF("HDF-NEW", 3, 3, 3), "eq-hdf")
	if err != nil {
		t.Fatal(err)
	}
	endpoint := func(row int, column string, position int, side string) string {
		var subpanel string
		for _, sp := range p.Subpanels {
			if sp.Row == row && sp.Column == column {
				subpanel = sp.ID
			}
		}
		for _, e := range p.Endpoints {
			if e.SubpanelID == subpanel && e.Position == position && e.Side == side {
				return e.ID
			}
		}
		t.Fatalf("no endpoint %d%s/%d %s", row, column, position, side)
		return ""
	}
	for _, link := range []planning.CableInput{{A: "edge-01:p2", B: endpoint(3, "C", 5, "front")}, {A: endpoint(3, "C", 5, "rear"), B: "agg-02:p2"}} {
		p, err = planning.Execute(base, p, planning.Command{Type: "add_cable", ExpectedRevision: p.Revision, Cable: &link}, fmt.Sprintf("cable-%s", link.A))
		if err != nil {
			t.Fatal(err)
		}
	}
	planned, err := planning.Apply(base, p)
	if err != nil {
		t.Fatal(err)
	}
	r, err := pathfinding.Trace(planned, pathfinding.Request{Mode: "distribution", Start: "edge-01:p2"})
	if err != nil || len(r.Routes) != 1 || r.Routes[0].End != "agg-02:p2" || len(r.Routes[0].Hops) != 3 || r.Routes[0].Hops[1].Kind != "internal" {
		t.Fatalf("expected one route through the HDF position: %+v %v", r, err)
	}
	if installed, _ := pathfinding.Trace(base, pathfinding.Request{Mode: "distribution", Start: "edge-01:p2"}); len(installed.Routes) != 0 {
		t.Fatal("the proposal leaked into the installed topology")
	}
}

// A09: plan payload compatibility. A payload saved before subpanels existed has
// no "subpanels" key; that means "no subpanels". A payload that is only half of
// an HDF is never accepted as an overlay.
func TestPlanPayloadCompatibilityAndHalfValidHDFOverlays(t *testing.T) {
	old := `{"id":"p","name":"Old","baseRevision":"sample-1","revision":"1","equipment":[],"updates":[],"endpoints":[],"links":[]}`
	for _, payload := range []string{old, strings.Replace(old, `"links":[]`, `"links":[],"subpanels":null`, 1)} {
		var p planning.Plan
		if err := json.Unmarshal([]byte(payload), &p); err != nil {
			t.Fatal(err)
		}
		if _, err := planning.Apply(sample.Installed(), p); err != nil {
			t.Fatalf("an old payload must remain a valid empty overlay: %v", err)
		}
		if _, err := planning.Execute(sample.Installed(), p, addHDF("HDF-NEW", 3, 3, 1), "eq-hdf"); err != nil {
			t.Fatalf("an old payload must accept add_hdf: %v", err)
		}
	}
	complete, err := planning.Execute(sample.Installed(), emptyPlan(), addHDF("HDF-NEW", 3, 3, 2), "eq-hdf")
	if err != nil {
		t.Fatal(err)
	}
	half := map[string]func(*planning.Plan){
		"chassis without subpanels": func(p *planning.Plan) { p.Subpanels = nil },
		"missing subpanel":          func(p *planning.Plan) { p.Subpanels = p.Subpanels[1:] },
		"missing endpoints":         func(p *planning.Plan) { p.Endpoints = p.Endpoints[:len(p.Endpoints)-1] },
		"missing bridges":           func(p *planning.Plan) { p.Links = p.Links[1:] },
	}
	for name, mutate := range half {
		t.Run(name, func(t *testing.T) {
			p := complete
			p.Subpanels = append([]topology.Subpanel{}, complete.Subpanels...)
			p.Endpoints = append([]topology.Endpoint{}, complete.Endpoints...)
			p.Links = append([]topology.Link{}, complete.Links...)
			mutate(&p)
			if _, err := planning.Apply(sample.Installed(), p); err == nil {
				t.Fatal("a half-valid HDF overlay was accepted")
			}
		})
	}
	encoded, _ := json.Marshal(complete)
	if !strings.Contains(string(encoded), `"subpanels":[{"id":"eq-hdf:sp-1A"`) {
		t.Fatalf("subpanels must be part of the persisted plan document: %.200s", encoded)
	}
}
