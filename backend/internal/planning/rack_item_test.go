package planning_test

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func addRackItem(rack string, unit int, d topology.Details, mutate func(*planning.EquipmentInput)) planning.Command {
	c := cmd("add_equipment", "1")
	in := &planning.EquipmentInput{Name: "Shelf A", Kind: "rack_item", Role: "none", RackID: rack, Unit: unit, Height: 1, Details: &d}
	if mutate != nil {
		mutate(in)
	}
	c.Equipment = in
	return c
}

// RI-02: add_equipment adds a rack item with its details and no endpoints.
func TestRI02AddRackItem(t *testing.T) {
	p := must(t, v2Plan(), addRackItem("rack-a03", 3, topology.Details{ItemType: str("ups")}, nil), "ri-1")
	if len(p.Equipment) != 1 || len(p.Endpoints) != 0 || len(p.Links) != 0 {
		t.Fatalf("a rack item has no endpoints or links: %+v", p)
	}
	e := p.Equipment[0]
	if e.Kind != "rack_item" || e.Role != "none" || e.NetworkID != "" || e.ItemType != "ups" || e.ItemText != "" {
		t.Fatalf("rack item %+v", e)
	}
	if p.Labels == nil || !slices.Contains(labelValues(p.Labels), "Shelf A") {
		t.Fatalf("labels: %v", p.Labels)
	}
	if _, err := planning.Apply(acceptance.Installed(), p); err != nil {
		t.Fatal(err)
	}

	other := must(t, v2Plan(), addRackItem("rack-a03", 3, topology.Details{ItemType: str("other"), ItemText: str("  KVM switch ")}, func(in *planning.EquipmentInput) { in.PortCount = 0 }), "ri-2")
	if e := other.Equipment[0]; e.ItemType != "other" || e.ItemText != "KVM switch" {
		t.Fatalf("other %+v", e)
	}
}

func labelValues(m map[string]string) []string {
	var out []string
	for _, v := range m {
		out = append(out, v)
	}
	return out
}

func TestRI02RefusesInvalidRackItems(t *testing.T) {
	ups := topology.Details{ItemType: str("ups")}
	cases := map[string]struct {
		command planning.Command
		want    string
	}{
		"port count": {addRackItem("rack-a03", 3, ups, func(in *planning.EquipmentInput) { in.PortCount = 4 }), ""},
		"port groups": {addRackItem("rack-a03", 3, ups, func(in *planning.EquipmentInput) {
			in.PortGroups = []planning.PortGroupInput{{Count: 4, Names: "Gi{n}"}}
		}), ""},
		"network": {addRackItem("rack-a03", 3, ups, func(in *planning.EquipmentInput) { in.NetworkID = "net-a" }), ""},
		"no type": {addRackItem("rack-a03", 3, topology.Details{}, nil), "Shelf A: a rack item needs a type: UPS, PDU, shelf, cable manager or other"},
		"role":    {addRackItem("rack-a03", 3, ups, func(in *planning.EquipmentInput) { in.Role = "passive" }), "or none for a rack item"},
		"other, no text": {addRackItem("rack-a03", 3, topology.Details{ItemType: str("other")}, nil),
			"Shelf A: say what it is (an Other needs a short text)"},
		"taken unit": {addRackItem("rack-a03", 8, ups, nil), "invalid plan command: U8 in Rack A03 is taken by EDGE-17"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := run(t, v2Plan(), c.command, "ri-x")
			if !errors.Is(err, planning.ErrInvalid) {
				t.Fatalf("want ErrInvalid, got %v", err)
			}
			if c.want != "" && !strings.Contains(err.Error(), c.want) {
				t.Fatalf("got %q, want it to contain %q", err.Error(), c.want)
			}
		})
	}
}

// RI-03: a rack item moves, is deleted and is removed from a plan like any equipment.
func TestRI03MoveDeleteAndRemoveChange(t *testing.T) {
	base := acceptance.Installed()
	base.Equipment = append(base.Equipment, topology.Equipment{ID: "ri-inst", Name: "UPS 1", Kind: "rack_item", Role: "none", RackID: "rack-a03", Unit: 9, Height: 2, ItemType: "ups"})
	if err := topology.Validate(base); err != nil {
		t.Fatal(err)
	}
	exec := func(p planning.Plan, c planning.Command, id string) planning.Plan {
		t.Helper()
		c.ExpectedRevision = p.Revision
		next, err := planning.Execute(base, p, c, id)
		if err != nil {
			t.Fatalf("%s: %v", c.Type, err)
		}
		return next
	}

	move := cmd("move_equipment", "1")
	move.Placement = &planning.PlacementInput{EquipmentID: "ri-inst", RackID: "rack-a03", Unit: 3}
	moved := exec(v2Plan(), move, "x")
	if conflicts := planning.Check(base, moved); len(conflicts) != 0 {
		t.Fatalf("conflicts %v", conflicts)
	}
	if len(moved.Placements) != 1 || moved.Placements[0].EquipmentID != "ri-inst" {
		t.Fatalf("placements %+v", moved.Placements)
	}
	if got, _, err := planning.RemoveChange(moved, "place_equipment:ri-inst"); err != nil || len(got.Placements) != 0 {
		t.Fatalf("remove placement: %v %+v", err, got)
	}

	deleted := exec(v2Plan(), target("delete_equipment", "ri-inst"), "y")
	if conflicts := planning.Check(base, deleted); len(conflicts) != 0 {
		t.Fatalf("conflicts %v", conflicts)
	}
	proposed, err := planning.Apply(base, deleted)
	if err != nil || slices.ContainsFunc(proposed.Equipment, func(e topology.Equipment) bool { return e.ID == "ri-inst" }) {
		t.Fatalf("delete: %v", err)
	}
	if got, removed, err := planning.RemoveChange(deleted, "remove_equipment:ri-inst"); err != nil || len(removed) != 1 || len(got.Removals.Equipment) != 0 {
		t.Fatalf("remove delete: %v %v", err, removed)
	}

	added := exec(v2Plan(), addRackItem("rack-a03", 7, topology.Details{ItemType: str("pdu")}, nil), "ri-new")
	got, removed, err := planning.RemoveChange(added, "add_equipment:ri-new")
	if err != nil || len(removed) != 1 || len(got.Equipment) != 0 {
		t.Fatalf("remove add: %v %v", err, removed)
	}
}
