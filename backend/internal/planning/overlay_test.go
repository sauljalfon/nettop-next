package planning

import (
	"nettop.local/backend/internal/topology"
	"testing"
)

func TestOverlayDoesNotMutateInstalled(t *testing.T) {
	base := topology.Snapshot{Revision: "1", Context: "installed", Sites: []topology.Site{{ID: "site", Name: "Campus"}}, Nodes: []topology.LocationNode{{ID: "node", Name: "Room", SiteID: "site"}}, Networks: []topology.Network{{ID: "n", Name: "N"}}, Racks: []topology.Rack{{ID: "r", NodeID: "node", Units: 12}}, Equipment: []topology.Equipment{}}
	plan := Plan{ID: "p", BaseRevision: "1", Revision: "1", Equipment: []topology.Equipment{{ID: "new", Kind: "switch", Role: "access", NetworkID: "n", RackID: "r", Unit: 1, Height: 1}}}
	got, err := Apply(base, plan)
	if err != nil {
		t.Fatal(err)
	}
	if len(base.Equipment) != 0 || len(got.Equipment) != 1 || got.Context != "planned" {
		t.Fatal("incorrect overlay isolation")
	}
	got.Racks[0].Name = "changed"
	if base.Racks[0].Name == "changed" {
		t.Fatal("shared rack backing slice")
	}
	got.Nodes[0].Name = "changed node"
	got.Sites[0].Name = "changed site"
	if base.Nodes[0].Name == "changed node" || base.Sites[0].Name == "changed site" {
		t.Fatal("shared hierarchy backing slices")
	}
	plan.BaseRevision = "stale"
	if _, err := Apply(base, plan); err == nil {
		t.Fatal("stale plan accepted")
	}
}

func TestOverlayRejectsRackConflict(t *testing.T) {
	base := topology.Snapshot{Revision: "1", Sites: []topology.Site{{ID: "site", Name: "Campus"}}, Nodes: []topology.LocationNode{{ID: "node", Name: "Room", SiteID: "site"}}, Racks: []topology.Rack{{ID: "r", NodeID: "node", Units: 12}}, Equipment: []topology.Equipment{{ID: "old", Kind: "switch", RackID: "r", Unit: 1, Height: 1}}}
	_, err := Apply(base, Plan{BaseRevision: "1", Equipment: []topology.Equipment{{ID: "new", Kind: "switch", Role: "access", NetworkID: "n", RackID: "r", Unit: 1, Height: 1}}})
	if err == nil {
		t.Fatal("conflicting plan accepted")
	}
}
