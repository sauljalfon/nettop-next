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
