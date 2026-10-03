package pathfinding

import (
	"nettop.local/backend/internal/topology"
	"testing"
)

func network() topology.Snapshot {
	return topology.Snapshot{Context: "installed", Revision: "1", Sites: []topology.Site{{ID: "site", Name: "Campus"}}, Nodes: []topology.LocationNode{{ID: "node", Name: "Room", SiteID: "site"}}, Racks: []topology.Rack{{ID: "r", NodeID: "node", Units: 12}}, Networks: []topology.Network{{ID: "n", Name: "N"}}, Equipment: []topology.Equipment{
		{ID: "edge", Kind: "switch", Role: "access", NetworkID: "n", RackID: "r", Unit: 1, Height: 1},
		{ID: "panel", Kind: "panel", Role: "passive", RackID: "r", Unit: 2, Height: 1},
		{ID: "agg", Kind: "switch", Role: "aggregation", NetworkID: "n", RackID: "r", Unit: 3, Height: 1},
	}, Endpoints: []topology.Endpoint{
		{ID: "e1", EquipmentID: "edge"}, {ID: "e2", EquipmentID: "edge"},
		{ID: "pf", EquipmentID: "panel", Position: 1, Side: "front"}, {ID: "pr", EquipmentID: "panel", Position: 1, Side: "rear"},
		{ID: "a1", EquipmentID: "agg"}, {ID: "a2", EquipmentID: "agg"},
	}, Links: []topology.Link{{ID: "c1", A: "e1", B: "pf", Kind: "cable"}, {ID: "bridge", A: "pf", B: "pr", Kind: "internal"}, {ID: "c2", A: "pr", B: "a1", Kind: "cable"}}}
}

func TestPhysicalTraceBothDirections(t *testing.T) {
	for _, pair := range [][2]string{{"e1", "a1"}, {"a1", "e1"}} {
		result, err := Trace(network(), Request{Mode: "point_to_point", Start: pair[0], End: pair[1]})
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Routes) != 1 || len(result.Routes[0].Hops) != 3 {
			t.Fatalf("unexpected routes: %+v", result)
		}
		if result.Routes[0].Hops[1].Kind != "internal" {
			t.Fatal("internal bridge missing")
		}
		if result.Revision != "1" {
			t.Fatal("missing revision")
		}
	}
}

func TestNoImplicitSwitchTransit(t *testing.T) {
	result, err := Trace(network(), Request{Mode: "point_to_point", Start: "e1", End: "a2"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "unreachable" || len(result.Routes) != 0 {
		t.Fatal("must not transit through sibling switch ports")
	}
}

func TestFindAggregationFromDeviceAndPort(t *testing.T) {
	for _, req := range []Request{{Mode: "aggregation", Device: "edge"}, {Mode: "aggregation", Start: "e1"}} {
		result, err := Trace(network(), req)
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Routes) != 1 || result.Routes[0].End != "a1" {
			t.Fatalf("unexpected: %+v", result)
		}
	}
}

func TestDisconnectedAndUnknown(t *testing.T) {
	s := network()
	s.Links = s.Links[:2]
	r, err := Trace(s, Request{Mode: "aggregation", Device: "edge"})
	if err != nil || r.Status != "unreachable" {
		t.Fatalf("%+v %v", r, err)
	}
	if _, err := Trace(s, Request{Mode: "point_to_point", Start: "missing", End: "a1"}); err == nil {
		t.Fatal("unknown start accepted")
	}
	if _, err := Trace(s, Request{Mode: "invalid"}); err == nil {
		t.Fatal("invalid mode accepted")
	}
}

func TestMultipleAggregationRoutes(t *testing.T) {
	s := network()
	s.Links = append(s.Links, topology.Link{ID: "c3", A: "e2", B: "a2", Kind: "cable"})
	r, err := Trace(s, Request{Mode: "aggregation", Device: "edge"})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Routes) != 2 {
		t.Fatalf("expected both routes, got %+v", r)
	}
}
