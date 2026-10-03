package pathfinding_test

import (
	"testing"

	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/sample"
	"nettop.local/backend/internal/topology"
)

// D08/D11 at the engine: a shared subpanel never bridges different positions.
func TestSharedSubpanelDoesNotBridgeDifferentPositions(t *testing.T) {
	s := topology.Snapshot{Context: "installed", Revision: "1", Sites: []topology.Site{{ID: "s", Name: "S"}}, Nodes: []topology.LocationNode{{ID: "n", Name: "N", SiteID: "s"}}, Racks: []topology.Rack{{ID: "r", NodeID: "n", Units: 40}},
		Networks:  []topology.Network{{ID: "a", Name: "A"}, {ID: "b", Name: "B"}},
		Subpanels: []topology.Subpanel{},
		Equipment: []topology.Equipment{
			{ID: "edge-a", Kind: "switch", Role: "access", NetworkID: "a", RackID: "r", Unit: 1, Height: 1},
			{ID: "agg-a", Kind: "switch", Role: "aggregation", NetworkID: "a", RackID: "r", Unit: 2, Height: 1},
			{ID: "edge-b", Kind: "switch", Role: "access", NetworkID: "b", RackID: "r", Unit: 3, Height: 1},
			{ID: "agg-b", Kind: "switch", Role: "aggregation", NetworkID: "b", RackID: "r", Unit: 4, Height: 1},
		},
		Endpoints: []topology.Endpoint{{ID: "ea", EquipmentID: "edge-a"}, {ID: "aa", EquipmentID: "agg-a"}, {ID: "eb", EquipmentID: "edge-b"}, {ID: "ab", EquipmentID: "agg-b"}},
	}
	sample.HDF("hdf", "HDF-01", "r", 10, 3, 3).AddTo(&s)
	s.Links = append(s.Links,
		topology.Link{ID: "a1", A: "ea", B: "hdf:sp-3C:5:f", Kind: "cable"},
		topology.Link{ID: "a2", A: "hdf:sp-3C:5:r", B: "aa", Kind: "cable"},
		topology.Link{ID: "b1", A: "eb", B: "hdf:sp-3C:2:f", Kind: "cable"},
		topology.Link{ID: "b2", A: "hdf:sp-3C:2:r", B: "ab", Kind: "cable"})
	r, err := pathfinding.Trace(s, pathfinding.Request{Mode: "aggregation", Device: "edge-a"})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Routes) != 1 || r.Routes[0].End != "aa" || len(r.Routes[0].Hops) != 3 || r.Routes[0].Hops[1].Kind != "internal" {
		t.Fatalf("network A must reach only AGG-A through its own position: %+v", r)
	}
	r, err = pathfinding.Trace(s, pathfinding.Request{Mode: "aggregation", Device: "edge-b"})
	if err != nil || len(r.Routes) != 1 || r.Routes[0].End != "ab" {
		t.Fatalf("network B must reach only AGG-B: %+v %v", r, err)
	}
	// Reverse point-to-point sees the same continuity.
	r, err = pathfinding.Trace(s, pathfinding.Request{Mode: "point_to_point", Start: "aa", End: "ea"})
	if err != nil || len(r.Routes) != 1 || len(r.Routes[0].Hops) != 3 {
		t.Fatalf("reverse trace differs: %+v %v", r, err)
	}
	// Different position of the same subpanel is not adjacent.
	r, err = pathfinding.Trace(s, pathfinding.Request{Mode: "point_to_point", Start: "ea", End: "ab"})
	if err != nil || len(r.Routes) != 0 {
		t.Fatalf("positions 5 and 2 must not be connected: %+v %v", r, err)
	}
}
