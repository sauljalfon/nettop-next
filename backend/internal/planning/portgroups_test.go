package planning_test

import (
	"errors"
	"strconv"
	"strings"
	"testing"

	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func intp(n int) *int { return &n }

func grouped(name string, groups ...planning.PortGroupInput) planning.Command {
	c := cmd("add_equipment", "1")
	c.Equipment = &planning.EquipmentInput{Name: name, Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-sm01", Unit: 8, Height: 1, PortGroups: groups}
	return c
}

func portsOf(s topology.Snapshot, name string) []topology.Endpoint {
	var id string
	for _, e := range s.Equipment {
		if e.Name == name {
			id = e.ID
		}
	}
	var out []topology.Endpoint
	for _, p := range s.Endpoints {
		if p.EquipmentID == id {
			out = append(out, p)
		}
	}
	return out
}

// PG-01 (domain): 24 copper ports Gi1/0/n and 4 SFP+ uplinks Te1/1/n are one
// switch with positions 1–28 and groups 1–2; endpoint IDs stay <equipment>:p<n>.
func TestPG01AGroupedSwitchGetsPositionsGroupsAndLabels(t *testing.T) {
	p := must(t, v2Plan(), grouped("SW-NEW",
		planning.PortGroupInput{Count: 24, Names: "Gi1/0/{n}", Details: &planning.PortGroupDetails{PortType: "copper", Connector: "RJ45", Speed: "1G"}},
		planning.PortGroupInput{Count: 4, Names: "Te1/1/{n}", Details: &planning.PortGroupDetails{PortType: "fiber", Connector: "SFP+", Speed: "10G"}},
	), "equipment-sw")
	ports := portsOf(proposed(t, p), "SW-NEW")
	if len(ports) != 28 {
		t.Fatalf("%d ports, want 28", len(ports))
	}
	for i, port := range ports {
		wantID := "equipment-sw:p" + itoa(i+1)
		group, label, kind, conn, speed := 1, "Gi1/0/"+itoa(i+1), "copper", "RJ45", "1G"
		if i >= 24 {
			group, label, kind, conn, speed = 2, "Te1/1/"+itoa(i-23), "fiber", "SFP+", "10G"
		}
		if port.ID != wantID || port.Position != i+1 || port.PortGroup != group || port.Label != label || port.PortType != kind || port.Connector != conn || port.Speed != speed {
			t.Fatalf("port %d: %+v", i+1, port)
		}
	}
}

func TestPG01WithoutGroupsItIsOneGroupPortN(t *testing.T) {
	c := cmd("add_equipment", "1")
	c.Equipment = &planning.EquipmentInput{Name: "SW-NEW", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-sm01", Unit: 8, Height: 1, PortCount: 3}
	ports := portsOf(proposed(t, must(t, v2Plan(), c, "equipment-sw")), "SW-NEW")
	if len(ports) != 3 || ports[2].Label != "Port 3" || ports[2].Position != 3 || ports[2].PortGroup != 1 {
		t.Fatalf("%+v", ports)
	}
}

// A group may list its labels as they are instead of a pattern: Duplicate copies
// a switch's ports this way, because a label is display text and is never parsed
// back into a pattern.
func TestPG01AGroupMayListItsLabels(t *testing.T) {
	p := must(t, v2Plan(), grouped("SW-NEW",
		planning.PortGroupInput{Labels: []string{"  Gi1/0/1 ", "Gi1/0/3", "uplink-a"}, Details: &planning.PortGroupDetails{PortType: "copper"}},
		planning.PortGroupInput{Count: 1, Names: "Te{n}"},
	), "equipment-sw")
	var got []string
	for _, port := range portsOf(proposed(t, p), "SW-NEW") {
		got = append(got, port.Label+"@"+itoa(port.Position)+"/"+itoa(port.PortGroup))
	}
	if strings.Join(got, " ") != "Gi1/0/1@1/1 Gi1/0/3@2/1 uplink-a@3/1 Te1@4/2" {
		t.Fatalf("%v", got)
	}
}

func TestPG02LabelListRefusals(t *testing.T) {
	for name, c := range map[string]struct {
		g    planning.PortGroupInput
		want string
	}{
		"labels with a pattern":    {planning.PortGroupInput{Labels: []string{"A"}, Names: "B{n}", Count: 1}, "SW-NEW: port group 1: give Names with Count, or Labels, not both"},
		"an empty label":           {planning.PortGroupInput{Labels: []string{"A", "  "}}, "SW-NEW: port group 1: a port name must have 1–64 characters"},
		"a duplicate label":        {planning.PortGroupInput{Labels: []string{"A", "a"}}, `SW-NEW: port name "a" is used twice`},
		"a label that is too long": {planning.PortGroupInput{Labels: []string{strings.Repeat("x", 65)}}, "SW-NEW: port group 1: port name \"" + strings.Repeat("x", 65) + "\" is longer than 64 characters"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := run(t, v2Plan(), grouped("SW-NEW", c.g), "equipment-sw")
			if !errors.Is(err, planning.ErrInvalid) || err.Error() != "invalid plan command: "+c.want {
				t.Fatalf("got %v\nwant %s", err, c.want)
			}
		})
	}
}

func TestPG01StartDefaultsToOneAndMayBeZero(t *testing.T) {
	p := must(t, v2Plan(), grouped("SW-NEW",
		planning.PortGroupInput{Count: 2, Names: "Eth{n}", Start: intp(0)},
		planning.PortGroupInput{Count: 2, Names: "Mgmt{n}"},
	), "equipment-sw")
	var labels []string
	for _, port := range portsOf(proposed(t, p), "SW-NEW") {
		labels = append(labels, port.Label)
	}
	if strings.Join(labels, ",") != "Eth0,Eth1,Mgmt1,Mgmt2" {
		t.Fatalf("%v", labels)
	}
}

// PG-02: refusals in names; nothing is saved.
func TestPG02PortGroupRefusalsAreInNames(t *testing.T) {
	long := strings.Repeat("x", 64) + "{n}"
	many := make([]planning.PortGroupInput, 9)
	for i := range many {
		many[i] = planning.PortGroupInput{Count: 1, Names: "G" + itoa(i) + "-{n}"}
	}
	cases := map[string]struct {
		c    planning.Command
		want string
	}{
		"duplicate labels across groups, ignoring case": {grouped("SW-NEW", planning.PortGroupInput{Count: 2, Names: "Gi1/{n}"}, planning.PortGroupInput{Count: 1, Names: "GI1/{n}"}),
			`SW-NEW: port name "GI1/1" is used twice`},
		"no {n}":          {grouped("SW-NEW", planning.PortGroupInput{Count: 2, Names: "Gi1/0/1"}), "SW-NEW: port group 1: Names must contain {n} once"},
		"two {n}":         {grouped("SW-NEW", planning.PortGroupInput{Count: 2, Names: "Gi{n}/{n}"}), "SW-NEW: port group 1: Names must contain {n} once"},
		"count of zero":   {grouped("SW-NEW", planning.PortGroupInput{Count: 0, Names: "Gi{n}"}), "SW-NEW: port group 1: Count must be at least 1"},
		"too many ports":  {grouped("SW-NEW", planning.PortGroupInput{Count: 90, Names: "A{n}"}, planning.PortGroupInput{Count: 7, Names: "B{n}"}), "SW-NEW: a switch has 1–96 ports, not 97"},
		"too many groups": {grouped("SW-NEW", many...), "SW-NEW: 1–8 port groups, not 9"},
		"no groups at all": {func() planning.Command {
			c := grouped("SW-NEW")
			c.Equipment.PortGroups = []planning.PortGroupInput{}
			c.Equipment.PortCount = 0
			return c
		}(), "port count must be between 1 and 96"},
		"a label too long": {grouped("SW-NEW", planning.PortGroupInput{Count: 1, Names: long}), "SW-NEW: port group 1: port name \"" + strings.Repeat("x", 64) + "1\" is longer than 64 characters"},
		"a negative start": {grouped("SW-NEW", planning.PortGroupInput{Count: 1, Names: "A{n}", Start: intp(-1)}), "SW-NEW: port group 1: Start must be 0 or more"},
		"a bad port type":  {grouped("SW-NEW", planning.PortGroupInput{Count: 1, Names: "A{n}", Details: &planning.PortGroupDetails{PortType: "coax"}}), `SW-NEW: port group 1: port type must be copper or fiber, not "coax"`},
		"port count that disagrees": {func() planning.Command {
			c := grouped("SW-NEW", planning.PortGroupInput{Count: 2, Names: "A{n}"})
			c.Equipment.PortCount = 5
			return c
		}(), "SW-NEW: portCount 5 disagrees with the 2 ports of its port groups; give one or the other"},
		"groups on a panel": {func() planning.Command {
			c := grouped("PNL-NEW", planning.PortGroupInput{Count: 2, Names: "A{n}"})
			c.Equipment.Kind, c.Equipment.Role, c.Equipment.NetworkID = "panel", "passive", ""
			return c
		}(), "PNL-NEW: port groups are for switches"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := run(t, v2Plan(), c.c, "equipment-sw")
			if !errors.Is(err, planning.ErrInvalid) || err.Error() != "invalid plan command: "+c.want {
				t.Fatalf("got %v\nwant %s", err, c.want)
			}
		})
	}
	t.Run("96 ports in 8 groups is the most", func(t *testing.T) {
		groups := make([]planning.PortGroupInput, 8)
		for i := range groups {
			groups[i] = planning.PortGroupInput{Count: 12, Names: "G" + itoa(i) + "/{n}"}
		}
		if _, err := run(t, v2Plan(), grouped("SW-NEW", groups...), "equipment-sw"); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("a plain switch may have 96 ports now", func(t *testing.T) {
		c := cmd("add_equipment", "1")
		c.Equipment = &planning.EquipmentInput{Name: "SW-NEW", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-sm01", Unit: 8, Height: 1, PortCount: 96}
		if _, err := run(t, v2Plan(), c, "equipment-sw"); err != nil {
			t.Fatal(err)
		}
		c.Equipment.PortCount = 97
		if _, err := run(t, v2Plan(), c, "equipment-sw"); err == nil || err.Error() != "invalid plan command: port count must be between 1 and 96" {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("a panel keeps 48 positions", func(t *testing.T) {
		c := cmd("add_equipment", "1")
		c.Equipment = &planning.EquipmentInput{Name: "PNL-NEW", Kind: "panel", Role: "passive", RackID: "rack-sm01", Unit: 8, Height: 1, PortCount: 49}
		if _, err := run(t, v2Plan(), c, "equipment-pnl"); err == nil || err.Error() != "invalid plan command: port count must be between 1 and 48" {
			t.Fatalf("got %v", err)
		}
	})
}

func itoa(n int) string { return strconv.Itoa(n) }
