// Package sample supplies explicit demo fixtures, not production storage.
package sample

import (
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func Installed() topology.Snapshot {
	return topology.Snapshot{Context: "installed", Revision: "sample-1", Site: "North Campus", Room: "Server Room", Networks: []topology.Network{{ID: "net-prototype", Name: "Prototype network"}}, Subpanels: []topology.Subpanel{}, Sites: []topology.Site{{ID: "site-north", Name: "North Campus"}}, Nodes: []topology.LocationNode{{ID: "node-server", SiteID: "site-north", Name: "Server Room"}, {ID: "node-distribution", SiteID: "site-north", Name: "Distribution Room"}}, Racks: []topology.Rack{{ID: "rack-03", NodeID: "node-server", Name: "Rack 03", Units: 12}, {ID: "rack-04", NodeID: "node-distribution", Name: "Rack 04", Units: 12}}, Equipment: []topology.Equipment{
		{ID: "edge-01", Name: "EDGE-01", Kind: "switch", Role: "access", NetworkID: "net-prototype", RackID: "rack-03", Unit: 8, Height: 1},
		{ID: "panel-a", Name: "PANEL-A", Kind: "panel", Role: "passive", RackID: "rack-03", Unit: 11, Height: 1},
		{ID: "panel-b", Name: "PANEL-B", Kind: "panel", Role: "passive", RackID: "rack-04", Unit: 11, Height: 1},
		{ID: "agg-02", Name: "AGG-02", Kind: "switch", Role: "aggregation", NetworkID: "net-prototype", RackID: "rack-04", Unit: 8, Height: 1},
	}, Endpoints: []topology.Endpoint{
		{ID: "edge-01:p1", EquipmentID: "edge-01", Label: "SFP+ 1"},
		{ID: "edge-01:p2", EquipmentID: "edge-01", Label: "SFP+ 2"},
		{ID: "panel-a:1:f", EquipmentID: "panel-a", Label: "1 · Front", Position: 1, Side: "front"},
		{ID: "panel-a:1:r", EquipmentID: "panel-a", Label: "1 · Rear", Position: 1, Side: "rear"},
		{ID: "panel-b:1:f", EquipmentID: "panel-b", Label: "1 · Front", Position: 1, Side: "front"},
		{ID: "panel-b:1:r", EquipmentID: "panel-b", Label: "1 · Rear", Position: 1, Side: "rear"},
		{ID: "agg-02:p1", EquipmentID: "agg-02", Label: "SFP+ 1"},
		{ID: "agg-02:p2", EquipmentID: "agg-02", Label: "SFP+ 2"},
	}, Links: []topology.Link{
		{ID: "cable-01", A: "edge-01:p1", B: "panel-a:1:f", Kind: "cable"},
		{ID: "bridge-a", A: "panel-a:1:f", B: "panel-a:1:r", Kind: "internal"},
		{ID: "cable-02", A: "panel-a:1:r", B: "panel-b:1:r", Kind: "cable"},
		{ID: "bridge-b", A: "panel-b:1:r", B: "panel-b:1:f", Kind: "internal"},
		{ID: "cable-03", A: "panel-b:1:f", B: "agg-02:p1", Kind: "cable"},
	}}
}

func Expansion() planning.Plan {
	return planning.Plan{ID: "expansion", Revision: "1", BaseRevision: "sample-1", Equipment: []topology.Equipment{{ID: "edge-02", Name: "EDGE-02", Kind: "switch", Role: "access", NetworkID: "net-prototype", RackID: "rack-03", Unit: 6, Height: 1}}, Endpoints: []topology.Endpoint{{ID: "edge-02:p1", EquipmentID: "edge-02", Label: "SFP+ 1"}}, Links: []topology.Link{{ID: "planned-cable-04", A: "edge-02:p1", B: "agg-02:p2", Kind: "cable"}}}
}
