package planning_test

import (
	"errors"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func str(s string) *string { return &s }

// switchWith is an add_equipment of one 4-port switch in Rack SM01 with details.
func switchWith(name string, unit int, d *topology.Details) planning.Command {
	c := cmd("add_equipment", "1")
	c.Equipment = &planning.EquipmentInput{Name: name, Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-sm01", Unit: unit, Height: 1, PortCount: 4, Details: d}
	return c
}

func updateDetails(rev, id string, d topology.Details) planning.Command {
	c := cmd("update_details", rev)
	c.Target = &planning.TargetInput{ID: id}
	c.Details = &d
	return c
}

func proposed(t *testing.T, p planning.Plan) topology.Snapshot {
	t.Helper()
	s, err := planning.Apply(acceptance.Installed(), p)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func equipmentNamed(s topology.Snapshot, name string) topology.Equipment {
	for _, e := range s.Equipment {
		if e.Name == name {
			return e
		}
	}
	return topology.Equipment{}
}

// FD-01 (domain): every add command takes optional details, trimmed, and the
// proposed topology carries them.
func TestFD01AddCommandsTakeDetails(t *testing.T) {
	p := must(t, v2Plan(), switchWith("SW-NEW", 8, &topology.Details{
		Manufacturer: str("  Acme "), SerialNumber: str("SN-0042"), IPAddress: str("10.1.2.3"), Status: str("active"), Description: str("core"),
	}), "equipment-sw")
	e := equipmentNamed(proposed(t, p), "SW-NEW")
	if e.Manufacturer != "Acme" || e.SerialNumber != "SN-0042" || e.IPAddress != "10.1.2.3" || e.Status != "active" || e.Description != "core" {
		t.Fatalf("equipment details: %+v", e)
	}

	hdf := cmd("add_hdf", "2")
	hdf.HDF = &planning.HDFInput{Name: "HDF-NEW", RackID: "rack-sm01", Unit: 9, Height: 1, Rows: 1, Details: &topology.Details{Model: str("H-1")}}
	p = must(t, p, hdf, "equipment-hdf")
	if h := equipmentNamed(proposed(t, p), "HDF-NEW"); h.Model != "H-1" {
		t.Fatalf("an HDF's details apply to the HDF itself: %+v", h)
	}

	cable := cmd("add_cable", "3")
	cable.Cable = &planning.CableInput{A: "equipment-sw:p1", B: "agg-15:p2", Details: &topology.Details{Label: str("C-7"), Status: str("testing"), Notes: str("patched by hand")}}
	p = must(t, p, cable, "cable-x")
	var l topology.Link
	for _, x := range proposed(t, p).Links {
		if x.ID == "cable-x" {
			l = x
		}
	}
	if l.Label != "C-7" || l.Status != "testing" || l.Notes != "patched by hand" {
		t.Fatalf("cable details: %+v", l)
	}

	s := site("Annex")
	s.Site.Details = &topology.Details{Location: str("east"), Description: str("annex")}
	p = must(t, p, withRev(s, "4"), "site-annex")
	n := node("site-annex", "Hall")
	n.Node.Details = &topology.Details{Location: str("floor 1")}
	p = must(t, p, withRev(n, "5"), "node-hall")
	r := rack("node-hall", "R1", 12)
	r.Rack.Details = &topology.Details{RackType: str("wall-mount"), Location: str("corner")}
	p = must(t, p, withRev(r, "6"), "rack-r1")
	s2 := proposed(t, p)
	if s2.Sites[len(s2.Sites)-1].Location != "east" || s2.Nodes[len(s2.Nodes)-1].Location != "floor 1" || s2.Racks[len(s2.Racks)-1].RackType != "wall-mount" {
		t.Fatalf("container details: %+v %+v %+v", s2.Sites[len(s2.Sites)-1], s2.Nodes[len(s2.Nodes)-1], s2.Racks[len(s2.Racks)-1])
	}
}

func withRev(c planning.Command, rev string) planning.Command { c.ExpectedRevision = rev; return c }

// FD-02 (commands): invalid values, fields that do not apply and duplicate
// serials are refused in names, and nothing is saved.
func TestFD02CommandsRefuseBadDetailsInNames(t *testing.T) {
	withSerial := must(t, v2Plan(), switchWith("SW-A", 8, &topology.Details{SerialNumber: str("SN-0042")}), "equipment-a")
	cases := map[string]struct {
		plan planning.Plan
		c    planning.Command
		want string
	}{
		"status not in the set":   {v2Plan(), switchWith("SW-B", 8, &topology.Details{Status: str("broken")}), `SW-B: status must be active, inactive or maintenance, not "broken"`},
		"ip address":              {v2Plan(), switchWith("SW-B", 8, &topology.Details{IPAddress: str("10.0.0")}), `SW-B: ipAddress "10.0.0" is not an IPv4 or IPv6 address`},
		"too long":                {v2Plan(), switchWith("SW-B", 8, &topology.Details{Model: str(strings.Repeat("m", 201))}), "SW-B: model is longer than 200 characters"},
		"a field of another kind": {v2Plan(), switchWith("SW-B", 8, &topology.Details{RackType: str("standard")}), "rackType does not apply to equipment SW-B"},
		"duplicate serial":        {withSerial, withRev(switchWith("SW-B", 9, &topology.Details{SerialNumber: str("sn-0042")}), "2"), "sn-0042 is already the serial number of SW-A"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := run(t, c.plan, c.c, "equipment-b")
			if !errors.Is(err, planning.ErrInvalid) || err.Error() != "invalid plan command: "+c.want {
				t.Fatalf("got %v\nwant %s", err, c.want)
			}
		})
	}
	t.Run("details on a command that takes none", func(t *testing.T) {
		c := target("delete_equipment", "agg-03")
		c.Details = &topology.Details{Model: str("x")}
		if _, err := run(t, v2Plan(), c, ""); !errors.Is(err, planning.ErrInvalid) {
			t.Fatalf("got %v", err)
		}
	})
}

// update_details sets and clears fields on what the plan adds, including a
// proposed switch's ports; an empty string clears.
func TestUpdateDetailsSetsAndClearsOnProposedObjects(t *testing.T) {
	p := must(t, v2Plan(), switchWith("SW-NEW", 8, &topology.Details{Manufacturer: str("Acme")}), "equipment-sw")
	p = must(t, p, updateDetails("2", "equipment-sw", topology.Details{Model: str("M-9"), Manufacturer: str("")}), "")
	p = must(t, p, updateDetails("3", "equipment-sw:p1", topology.Details{PortType: str("fiber"), Connector: str("LC"), Speed: str("10G"), State: str("reserved")}), "")
	s := proposed(t, p)
	if e := equipmentNamed(s, "SW-NEW"); e.Model != "M-9" || e.Manufacturer != "" {
		t.Fatalf("equipment after update: %+v", e)
	}
	for _, ep := range s.Endpoints {
		if ep.ID == "equipment-sw:p1" && (ep.PortType != "fiber" || ep.Connector != "LC" || ep.Speed != "10G" || ep.State != "reserved") {
			t.Fatalf("port after update: %+v", ep)
		}
	}
	if p.Revision != "4" {
		t.Fatalf("revision %s, want 4", p.Revision)
	}
	if got := p.Labels["equipment-sw:p1"]; got != "SW-NEW · Port 1" {
		t.Fatalf("label %q", got)
	}
}

func TestUpdateDetailsRefusals(t *testing.T) {
	p := must(t, v2Plan(), switchWith("SW-NEW", 8, nil), "equipment-sw")
	for name, c := range map[string]struct {
		target string
		d      topology.Details
		want   string
	}{
		"installed equipment":   {"agg-03", topology.Details{Model: str("x")}, "Installed details are changed with a direct fix (M5b step 12), not in a plan"},
		"installed port":        {"agg-03:p1", topology.Details{State: str("faulty")}, "Installed details are changed with a direct fix (M5b step 12), not in a plan"},
		"unknown object":        {"nope", topology.Details{Model: str("x")}, "cannot update details of unknown object nope"},
		"field of another kind": {"equipment-sw", topology.Details{PortType: str("fiber")}, "portType does not apply to equipment SW-NEW"},
		"invalid value":         {"equipment-sw:p2", topology.Details{State: str("broken")}, `SW-NEW · Port 2: state must be available, reserved, disabled or faulty, not "broken"`},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := run(t, p, updateDetails("2", c.target, c.d), "")
			if !errors.Is(err, planning.ErrInvalid) || err.Error() != "invalid plan command: "+c.want {
				t.Fatalf("got %v\nwant %s", err, c.want)
			}
		})
	}
	t.Run("a bridge carries none", func(t *testing.T) {
		panel := cmd("add_equipment", "2")
		panel.Equipment = &planning.EquipmentInput{Name: "PNL-NEW", Kind: "panel", Role: "passive", RackID: "rack-sm01", Unit: 9, Height: 1, PortCount: 2}
		q := must(t, p, panel, "equipment-pnl")
		_, err := run(t, q, updateDetails("3", "equipment-pnl:p1:bridge", topology.Details{Label: str("x")}), "")
		if !errors.Is(err, planning.ErrInvalid) {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("a duplicate serial through an update", func(t *testing.T) {
		q := must(t, p, withRev(switchWith("SW-2", 9, &topology.Details{SerialNumber: str("SN-1")}), "2"), "equipment-2")
		_, err := run(t, q, updateDetails("3", "equipment-sw", topology.Details{SerialNumber: str("sn-1")}), "")
		if err == nil || err.Error() != "invalid plan command: sn-1 is already the serial number of SW-2" {
			t.Fatalf("got %v", err)
		}
	})
}

// An update appears as the change update_details:<id>; remove_change undoes it
// alone, and removing its object takes it along.
func TestUpdateDetailsIsUndoneAndDroppedWithItsObject(t *testing.T) {
	p := must(t, v2Plan(), switchWith("SW-NEW", 8, &topology.Details{Manufacturer: str("Acme")}), "equipment-sw")
	p = must(t, p, updateDetails("2", "equipment-sw", topology.Details{Model: str("M-9")}), "")
	p = must(t, p, updateDetails("3", "equipment-sw:p1", topology.Details{State: str("faulty")}), "")
	p = must(t, p, withRev(updateDetails("", "equipment-sw", topology.Details{Status: str("active")}), "4"), "")
	if len(p.Details) != 2 {
		t.Fatalf("two updates to one object are one change: %+v", p.Details)
	}

	rc := cmd("remove_change", "5")
	rc.Change = &planning.ChangeInput{Key: "update_details:equipment-sw"}
	undone, removed, err := planning.ExecuteRemoveChange(acceptance.Installed(), p, rc)
	if err != nil || len(removed) != 1 || removed[0] != "update_details:equipment-sw" {
		t.Fatalf("undo: %v %v", err, removed)
	}
	if e := equipmentNamed(proposed(t, undone), "SW-NEW"); e.Model != "" || e.Status != "" || e.Manufacturer != "Acme" {
		t.Fatalf("undoing the update leaves the addition's own details: %+v", e)
	}
	if len(undone.Details) != 1 {
		t.Fatalf("the port's update stays: %+v", undone.Details)
	}

	rc.Change = &planning.ChangeInput{Key: "add_equipment:equipment-sw"}
	gone, removed, err := planning.ExecuteRemoveChange(acceptance.Installed(), p, rc)
	if err != nil || len(gone.Details) != 0 {
		t.Fatalf("removing the equipment drops its updates: %v %+v", err, gone.Details)
	}
	want := map[string]bool{"add_equipment:equipment-sw": true, "update_details:equipment-sw": true, "update_details:equipment-sw:p1": true}
	for _, k := range removed {
		delete(want, k)
	}
	if len(want) != 0 {
		t.Fatalf("removed keys %v, missing %v", removed, want)
	}

	rc.Change = &planning.ChangeInput{Key: "update_details:nothing"}
	if _, _, err = planning.ExecuteRemoveChange(acceptance.Installed(), p, rc); !errors.Is(err, planning.ErrNotFound) {
		t.Fatalf("unknown key: %v", err)
	}

	// delete_equipment of a proposed switch drops its updates too.
	del, err := planning.Execute(acceptance.Installed(), p, withRev(target("delete_equipment", "equipment-sw"), "5"), "")
	if err != nil || len(del.Details) != 0 {
		t.Fatalf("delete leaves updates: %v %+v", err, del.Details)
	}
}

// Check names the change update_details:<id> when it cannot apply.
func TestCheckNamesAnUpdateThatCannotApply(t *testing.T) {
	p := v2Plan()
	p.Details = []planning.DetailUpdate{{ID: "ghost", Details: topology.Details{Model: str("x")}}}
	conflicts := planning.Check(acceptance.Installed(), p)
	if len(conflicts) != 1 || conflicts[0].Change != "update_details:ghost" {
		t.Fatalf("got %+v", conflicts)
	}
}

// update_details is allowed in a batch, and a bad one names its command.
func TestUpdateDetailsInABatch(t *testing.T) {
	base := acceptance.Installed()
	start := must(t, v2Plan(), switchWith("SW-NEW", 8, nil), "equipment-sw")
	ok := cmd("batch", "2")
	ok.Batch = &planning.BatchInput{Commands: []planning.Command{
		updateDetails("", "equipment-sw", topology.Details{Model: str("M-1")}),
		updateDetails("", "equipment-sw:p2", topology.Details{PortType: str("copper")}),
	}}
	got, err := planning.ExecuteBatch(base, start, ok, []string{"", ""})
	if err != nil || len(got.Details) != 2 || got.Revision != "3" {
		t.Fatalf("batch: %v %+v", err, got.Details)
	}
	bad := cmd("batch", "2")
	bad.Batch = &planning.BatchInput{Commands: []planning.Command{
		updateDetails("", "equipment-sw", topology.Details{Model: str("M-1")}),
		updateDetails("", "equipment-sw:p2", topology.Details{PortType: str("coax")}),
	}}
	_, err = planning.ExecuteBatch(base, start, bad, []string{"", ""})
	want := `invalid plan command: command 2 (update_details): SW-NEW · Port 2: portType must be copper or fiber, not "coax"`
	if err == nil || err.Error() != want {
		t.Fatalf("got %v\nwant %s", err, want)
	}
	dup := cmd("batch", "2")
	dup.Batch = &planning.BatchInput{Commands: []planning.Command{
		withRev(switchWith("SW-A", 9, &topology.Details{SerialNumber: str("SN-9")}), ""),
		withRev(switchWith("SW-B", 10, &topology.Details{SerialNumber: str("sn-9")}), ""),
	}}
	_, err = planning.ExecuteBatch(base, start, dup, []string{"equipment-a", "equipment-b"})
	want = "invalid plan command: command 2 (add_equipment): sn-9 is already the serial number of SW-A"
	if err == nil || err.Error() != want {
		t.Fatalf("got %v\nwant %s", err, want)
	}
}
