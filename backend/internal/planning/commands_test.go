package planning_test

import (
	"errors"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/sample"
	"testing"
)

func TestAddEquipmentCreatesStablePanelEndpointsAndBridges(t *testing.T) {
	base := sample.Installed()
	p := sample.Expansion()
	next, err := planning.Execute(base, p, planning.Command{Type: "add_equipment", ExpectedRevision: "1", Equipment: &planning.EquipmentInput{Name: "PANEL-C", Kind: "panel", Role: "passive", RackID: "rack-03", Unit: 4, Height: 1, PortCount: 2}}, "eq-new")
	if err != nil {
		t.Fatal(err)
	}
	if next.Revision != "2" || next.Equipment[len(next.Equipment)-1].ID != "eq-new" {
		t.Fatal("revision or stable identity missing")
	}
	if len(next.Endpoints)-len(p.Endpoints) != 4 || len(next.Links)-len(p.Links) != 2 {
		t.Fatal("panel sides and bridges must be created atomically")
	}
	if p.Revision != "1" || len(p.Equipment) != 1 {
		t.Fatal("mutated original plan")
	}
	if _, err := planning.Apply(base, next); err != nil {
		t.Fatal(err)
	}
}

func TestCommandValidation(t *testing.T) {
	valid := func() planning.Command {
		return planning.Command{Type: "add_equipment", ExpectedRevision: "1", Equipment: &planning.EquipmentInput{Name: "EDGE-03", Kind: "switch", Role: "access", NetworkID: "net-prototype", RackID: "rack-03", Unit: 4, Height: 1, PortCount: 2}}
	}
	cases := map[string]func(*planning.Command){
		"collision":          func(c *planning.Command) { c.Equipment.Unit = 8 },
		"role":               func(c *planning.Command) { c.Equipment.Role = "passive" },
		"blank name":         func(c *planning.Command) { c.Equipment.Name = "  " },
		"duplicate name":     func(c *planning.Command) { c.Equipment.Name = "edge-01" },
		"port count":         func(c *planning.Command) { c.Equipment.PortCount = 0 },
		"overflow placement": func(c *planning.Command) { c.Equipment.Height = 1000000000 },
		"unknown command":    func(c *planning.Command) { c.Type = "publish" },
		"mixed payload":      func(c *planning.Command) { c.Cable = &planning.CableInput{A: "a", B: "b"} },
		"missing network":    func(c *planning.Command) { c.Equipment.NetworkID = "" },
		"unknown network":    func(c *planning.Command) { c.Equipment.NetworkID = "missing" },
		"network on panel": func(c *planning.Command) {
			c.Equipment.Kind, c.Equipment.Role = "panel", "passive"
		},
		"unknown role": func(c *planning.Command) { c.Equipment.Role = "core" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			c := valid()
			mutate(&c)
			_, err := planning.Execute(sample.Installed(), sample.Expansion(), c, "new")
			if !errors.Is(err, planning.ErrInvalid) {
				t.Fatalf("expected validation error, got %v", err)
			}
		})
	}
	c := valid()
	c.ExpectedRevision = "old"
	if _, err := planning.Execute(sample.Installed(), sample.Expansion(), c, "new"); !errors.Is(err, planning.ErrConflict) {
		t.Fatal("stale write accepted")
	}
}

func TestCableCommandsValidateOccupancy(t *testing.T) {
	c := planning.Command{Type: "add_cable", ExpectedRevision: "1", Cable: &planning.CableInput{A: "edge-01:p2", B: "agg-02:p2"}}
	p := sample.Expansion() // agg-02:p2 is occupied by this plan, even though free installed
	if _, err := planning.Execute(sample.Installed(), p, c, "c-new"); !errors.Is(err, planning.ErrInvalid) {
		t.Fatal("planned occupancy ignored")
	}
	p.Links = nil
	p.Equipment = nil
	p.Endpoints = nil
	next, err := planning.Execute(sample.Installed(), p, c, "c-new")
	if err != nil {
		t.Fatal(err)
	}
	if next.Links[0].ID != "c-new" || len(p.Links) != 0 {
		t.Fatal("invalid cable addition")
	}
}

func TestMoveEquipmentCreatesPlanOverlayWithoutChangingInstalled(t *testing.T) {
	base := sample.Installed()
	p := sample.Expansion()
	next, err := planning.Execute(base, p, planning.Command{Type: "move_equipment", ExpectedRevision: "1", Placement: &planning.PlacementInput{EquipmentID: "edge-01", RackID: "rack-04", Unit: 4}}, "ignored")
	if err != nil {
		t.Fatal(err)
	}
	if base.Equipment[0].RackID != "rack-03" || base.Equipment[0].Unit != 8 {
		t.Fatal("installed equipment mutated")
	}
	planned, err := planning.Apply(base, next)
	if err != nil {
		t.Fatal(err)
	}
	var moved bool
	for _, e := range planned.Equipment {
		if e.ID == "edge-01" {
			moved = e.RackID == "rack-04" && e.Unit == 4
		}
	}
	if !moved {
		t.Fatal("planned location was not applied to the overlay")
	}
	if len(next.Updates) != 0 || len(next.Placements) != 1 || next.Placements[0] != (planning.PlacementInput{EquipmentID: "edge-01", RackID: "rack-04", Unit: 4}) {
		t.Fatal("move is not represented as an explicit placement")
	}
	if next.Revision != "2" {
		t.Fatal("move did not advance draft revision")
	}
}

func TestMoveProposedEquipmentAndRejectInvalidMoves(t *testing.T) {
	base, p := sample.Installed(), sample.Expansion()
	next, err := planning.Execute(base, p, planning.Command{Type: "move_equipment", ExpectedRevision: "1", Placement: &planning.PlacementInput{EquipmentID: "edge-02", RackID: "rack-03", Unit: 5}}, "ignored")
	if err != nil {
		t.Fatal(err)
	}
	if next.Equipment[0].Unit != 5 {
		t.Fatal("proposed equipment move not saved")
	}
	cases := map[string]planning.PlacementInput{
		"unknown equipment": {EquipmentID: "missing", RackID: "rack-03", Unit: 5},
		"occupied":          {EquipmentID: "edge-02", RackID: "rack-03", Unit: 8},
		"outside rack":      {EquipmentID: "edge-02", RackID: "rack-03", Unit: 13},
	}
	for name, input := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := planning.Execute(base, p, planning.Command{Type: "move_equipment", ExpectedRevision: "1", Placement: &input}, "ignored")
			if !errors.Is(err, planning.ErrInvalid) {
				t.Fatalf("expected invalid move, got %v", err)
			}
		})
	}
}

func TestAddEquipmentRecordsNetworkAndAcceptsBackbone(t *testing.T) {
	base, p := sample.Installed(), sample.Expansion()
	next, err := planning.Execute(base, p, planning.Command{Type: "add_equipment", ExpectedRevision: "1", Equipment: &planning.EquipmentInput{Name: "BB-NEW", Kind: "switch", Role: "backbone", NetworkID: "net-prototype", RackID: "rack-03", Unit: 4, Height: 1, PortCount: 2}}, "eq-bb")
	if err != nil {
		t.Fatal(err)
	}
	added := next.Equipment[len(next.Equipment)-1]
	if added.Role != "backbone" || added.NetworkID != "net-prototype" {
		t.Fatalf("role/network not recorded: %+v", added)
	}
	planned, err := planning.Apply(base, next)
	if err != nil || len(planned.Networks) != 1 {
		t.Fatalf("overlay must carry installed networks: %v %+v", err, planned.Networks)
	}
}

func TestPanelAdditionHasNoNetwork(t *testing.T) {
	next, err := planning.Execute(sample.Installed(), sample.Expansion(), planning.Command{Type: "add_equipment", ExpectedRevision: "1", Equipment: &planning.EquipmentInput{Name: "PANEL-C", Kind: "panel", Role: "passive", RackID: "rack-03", Unit: 4, Height: 1, PortCount: 1}}, "eq-p")
	if err != nil {
		t.Fatal(err)
	}
	if got := next.Equipment[len(next.Equipment)-1].NetworkID; got != "" {
		t.Fatalf("panel received network %q", got)
	}
}

func TestSamplePrototypeNetworkIsExplicitlyLabeled(t *testing.T) {
	n := sample.Installed().Networks
	if len(n) != 1 || n[0].ID != "net-prototype" || n[0].Name != "Prototype network" {
		t.Fatalf("unexpected sample networks %+v", n)
	}
}
