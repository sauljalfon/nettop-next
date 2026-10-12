package topology_test

import (
	"testing"

	"nettop.local/backend/internal/topology"
)

// PG (domain): a switch port may carry a position (its order) and a port group;
// ports saved before keep position 0 and group 0.
func TestSwitchPortsMayCarryPositionAndGroup(t *testing.T) {
	s := base()
	s.Endpoints = []topology.Endpoint{
		{ID: "sw1:p1", EquipmentID: "sw1", Label: "Gi1/0/1", Position: 1, PortGroup: 1},
		{ID: "sw1:p2", EquipmentID: "sw1", Label: "Te1/1/1", Position: 2, PortGroup: 2},
		{ID: "sw2:p1", EquipmentID: "sw2", Label: "Port 1"}, // saved before: position 0, group 0
	}
	mustValid(t, s)
}

func TestSwitchPortPositionRules(t *testing.T) {
	for name, c := range map[string]struct {
		change func(*topology.Snapshot)
		want   string
	}{
		"two ports at one position": {func(s *topology.Snapshot) {
			s.Endpoints = []topology.Endpoint{
				{ID: "sw1:p1", EquipmentID: "sw1", Label: "A", Position: 1, PortGroup: 1},
				{ID: "sw1:p2", EquipmentID: "sw1", Label: "B", Position: 1, PortGroup: 1},
			}
		}, "SW1 has two ports at position 1"},
		"a negative position": {func(s *topology.Snapshot) {
			s.Endpoints[0].Position = -1
		}, "device endpoint has panel metadata"},
		"a group without a position": {func(s *topology.Snapshot) {
			s.Endpoints[0].PortGroup = 1
		}, "device endpoint has panel metadata"},
		"a side on a switch port": {func(s *topology.Snapshot) {
			s.Endpoints[0].Position, s.Endpoints[0].Side = 1, "front"
		}, "device endpoint has panel metadata"},
	} {
		t.Run(name, func(t *testing.T) {
			s := base()
			c.change(&s)
			err := topology.Validate(s)
			if err == nil || err.Error() != c.want {
				t.Fatalf("got %v, want %s", err, c.want)
			}
		})
	}
	// The same position on two different switches is fine.
	s := base()
	s.Endpoints = []topology.Endpoint{
		{ID: "sw1:p1", EquipmentID: "sw1", Label: "A", Position: 1, PortGroup: 1},
		{ID: "sw2:p1", EquipmentID: "sw2", Label: "A", Position: 1, PortGroup: 1},
	}
	mustValid(t, s)
}
