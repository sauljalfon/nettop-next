package planning_test

import (
	"errors"
	"testing"

	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/sample"
	"nettop.local/backend/internal/topology"
)

func baseWithHDF() topology.Snapshot {
	s := sample.Installed()
	sample.HDF("hdf-01", "HDF-01", "rack-04", 2, 3, 2).AddTo(&s)
	s.Endpoints = append(s.Endpoints,
		topology.Endpoint{ID: "edge-01:p3", EquipmentID: "edge-01", Label: "SFP+ 3"},
		topology.Endpoint{ID: "edge-01:p4", EquipmentID: "edge-01", Label: "SFP+ 4"})
	return s
}

// Plans can cable to installed HDF endpoints, occupancy is checked on the exact
// subpanel position/side, and the overlay never mutates installed subpanels.
func TestPlanCablesToInstalledHDFEndpoints(t *testing.T) {
	base, p := baseWithHDF(), sample.Expansion()
	front, rear := "hdf-01:sp-2C:5:f", "hdf-01:sp-2C:5:r"
	next, err := planning.Execute(base, p, planning.Command{Type: "add_cable", ExpectedRevision: "1", Cable: &planning.CableInput{A: front, B: "edge-01:p2"}}, "c-new")
	if err != nil {
		t.Fatal(err)
	}
	planned, err := planning.Apply(base, next)
	if err != nil || len(planned.Subpanels) != 8 || len(base.Subpanels) != 8 {
		t.Fatalf("overlay changed subpanels: %v %d %d", err, len(planned.Subpanels), len(base.Subpanels))
	}
	again := planning.Command{Type: "add_cable", ExpectedRevision: next.Revision, Cable: &planning.CableInput{A: "edge-01:p3", B: front}}
	if _, err := planning.Execute(base, next, again, "c-2"); !errors.Is(err, planning.ErrInvalid) {
		t.Fatalf("occupied HDF side accepted: %v", err)
	}
	other := planning.Command{Type: "add_cable", ExpectedRevision: next.Revision, Cable: &planning.CableInput{A: "edge-01:p4", B: rear}}
	if _, err := planning.Execute(base, next, other, "c-3"); err != nil {
		t.Fatalf("opposite side of the same position must stay free: %v", err)
	}
}

// Atomic HDF creation arrives with add_hdf (step 3); the generic command cannot
// create a chassis without a grid.
func TestAddEquipmentStillRejectsHDFKind(t *testing.T) {
	c := planning.Command{Type: "add_equipment", ExpectedRevision: "1", Equipment: &planning.EquipmentInput{Name: "HDF-X", Kind: "hdf", Role: "passive", RackID: "rack-03", Unit: 4, Height: 3, PortCount: 24}}
	if _, err := planning.Execute(sample.Installed(), sample.Expansion(), c, "x"); !errors.Is(err, planning.ErrInvalid) {
		t.Fatalf("generic add_equipment created an HDF: %v", err)
	}
}
