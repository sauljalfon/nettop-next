// Package acceptance holds the fictional development fixture defined in
// docs/acceptance-example.md: two networks, two sites, five physical nodes,
// seven 12U racks, eleven equipment objects, and cables A01–B04. It is explicit
// development seed data, not real inventory, and never a way to infer
// properties of imported equipment.
package acceptance

import (
	"fmt"

	"nettop.local/backend/internal/topology"
)

const portsPerDevice = 24 // device ports and standard-panel positions

// Installed returns the acceptance inventory with every cable and bridge. The
// HDF grids come from topology.NewHDF, the same builder add_hdf uses.
func Installed() topology.Snapshot {
	s := topology.Snapshot{
		Context:  "installed",
		Revision: "acceptance-1",
		// Legacy single-site/room compatibility labels on the installed root.
		Site: "Main Campus",
		Room: "Building A",
		Networks: []topology.Network{
			{ID: "net-a", Name: "Network A"},
			{ID: "net-b", Name: "Network B"},
		},
		Sites: []topology.Site{
			{ID: "site-main-campus", Name: "Main Campus"},
			{ID: "site-dr", Name: "DR Site"},
		},
		Nodes: []topology.LocationNode{
			{ID: "node-building-a", SiteID: "site-main-campus", Name: "Building A"},
			{ID: "node-north-sub-main", SiteID: "site-main-campus", Name: "North Sub-main"},
			{ID: "node-main-distribution", SiteID: "site-main-campus", Name: "Main Distribution"},
			{ID: "node-dr-access", SiteID: "site-dr", Name: "DR Access"},
			{ID: "node-dr-distribution", SiteID: "site-dr", Name: "DR Distribution"},
		},
		Racks: []topology.Rack{
			{ID: "rack-a03", NodeID: "node-building-a", Name: "Rack A03", Units: 12},
			{ID: "rack-sm01", NodeID: "node-north-sub-main", Name: "Rack SM01", Units: 12},
			{ID: "rack-core-01", NodeID: "node-main-distribution", Name: "Rack Core 01", Units: 12},
			{ID: "rack-core-02", NodeID: "node-main-distribution", Name: "Rack Core 02", Units: 12},
			{ID: "rack-core-03", NodeID: "node-main-distribution", Name: "Rack Core 03", Units: 12},
			{ID: "rack-dr01", NodeID: "node-dr-access", Name: "Rack DR01", Units: 12},
			{ID: "rack-dr02", NodeID: "node-dr-distribution", Name: "Rack DR02", Units: 12},
		},
		Subpanels: []topology.Subpanel{},
		Equipment: []topology.Equipment{},
		Endpoints: []topology.Endpoint{},
		Links:     []topology.Link{},
	}
	for _, d := range []struct {
		id, name, role, network, rack string
		unit                          int
	}{
		{"edge-17", "EDGE-17", "access", "net-a", "rack-a03", 8},
		{"agg-03", "AGG-03", "aggregation", "net-a", "rack-core-01", 8},
		{"agg-08", "AGG-08", "aggregation", "net-a", "rack-core-02", 8},
		{"agg-15", "AGG-15", "aggregation", "net-a", "rack-core-02", 6}, // intentionally uncabled
		{"bb-01", "BB-01", "backbone", "net-a", "rack-core-03", 8},
		{"edge-22", "EDGE-22", "access", "net-b", "rack-dr01", 8},
		{"agg-12", "AGG-12", "aggregation", "net-b", "rack-dr02", 8},
	} {
		s.Equipment = append(s.Equipment, topology.Equipment{ID: d.id, Name: d.name, Kind: "switch", Role: d.role, NetworkID: d.network, RackID: d.rack, Unit: d.unit, Height: 1})
		for n := 1; n <= portsPerDevice; n++ {
			s.Endpoints = append(s.Endpoints, topology.Endpoint{ID: devicePort(d.id, n), EquipmentID: d.id, Label: fmt.Sprintf("Port %d", n)})
		}
	}
	for _, p := range []struct{ id, name, rack string }{{"panel-a", "PANEL-A", "rack-a03"}, {"panel-dr", "PANEL-DR", "rack-dr01"}} {
		s.Equipment = append(s.Equipment, topology.Equipment{ID: p.id, Name: p.name, Kind: "panel", Role: "passive", RackID: p.rack, Unit: 11, Height: 1})
		for n := 1; n <= portsPerDevice; n++ {
			front, rear := panelPosition(p.id, n, "front"), panelPosition(p.id, n, "rear")
			s.Endpoints = append(s.Endpoints,
				topology.Endpoint{ID: front, EquipmentID: p.id, Label: fmt.Sprintf("%d · Front", n), Position: n, Side: "front"},
				topology.Endpoint{ID: rear, EquipmentID: p.id, Label: fmt.Sprintf("%d · Rear", n), Position: n, Side: "rear"})
			s.Links = append(s.Links, topology.Link{ID: fmt.Sprintf("%s:%d:bridge", p.id, n), A: front, B: rear, Kind: "internal"})
		}
	}
	// The 3U rack height is a fixture input, independent of the row count.
	hdf01 := topology.NewHDF("hdf-01", "HDF-01", "rack-sm01", 4, 3, 4)
	hdf02 := topology.NewHDF("hdf-02", "HDF-02", "rack-core-01", 4, 3, 3)
	hdf01.AddTo(&s)
	hdf02.AddTo(&s)

	port := devicePort
	pnl := func(id string, position int, side string) string { return panelPosition(id, position, side) }
	grid := func(h topology.HDF, row int, column string, position int, side string) string {
		for _, sp := range h.Subpanels {
			if sp.Row == row && sp.Column == column {
				for _, e := range h.Endpoints {
					if e.SubpanelID == sp.ID && e.Position == position && e.Side == side {
						return e.ID
					}
				}
			}
		}
		panic(fmt.Sprintf("acceptance fixture: %s has no %d%s/%d %s", h.Equipment.ID, row, column, position, side))
	}
	for _, c := range [][3]string{
		{"cable-a01", port("edge-17", 1), pnl("panel-a", 1, "front")},
		{"cable-a02", pnl("panel-a", 1, "rear"), grid(hdf01, 3, "C", 5, "rear")},
		{"cable-a03", grid(hdf01, 3, "C", 5, "front"), grid(hdf02, 2, "B", 3, "front")},
		{"cable-a04", grid(hdf02, 2, "B", 3, "rear"), port("agg-03", 1)},
		{"cable-a05", port("edge-17", 2), pnl("panel-a", 2, "front")},
		{"cable-a06", pnl("panel-a", 2, "rear"), grid(hdf01, 1, "A", 2, "rear")},
		{"cable-a07", grid(hdf01, 1, "A", 2, "front"), grid(hdf02, 1, "D", 2, "front")},
		{"cable-a08", grid(hdf02, 1, "D", 2, "rear"), port("agg-08", 1)},
		{"cable-a09", port("edge-17", 3), pnl("panel-a", 3, "front")},
		{"cable-a10", pnl("panel-a", 3, "rear"), grid(hdf01, 2, "D", 4, "rear")},
		{"cable-a11", grid(hdf01, 2, "D", 4, "front"), grid(hdf02, 3, "A", 1, "front")},
		{"cable-a12", grid(hdf02, 3, "A", 1, "rear"), port("bb-01", 1)},
		{"cable-b01", port("edge-22", 1), pnl("panel-dr", 1, "front")},
		{"cable-b02", pnl("panel-dr", 1, "rear"), grid(hdf01, 3, "C", 2, "rear")},
		{"cable-b03", grid(hdf01, 3, "C", 2, "front"), grid(hdf02, 2, "B", 6, "front")},
		{"cable-b04", grid(hdf02, 2, "B", 6, "rear"), port("agg-12", 1)},
	} {
		s.Links = append(s.Links, topology.Link{ID: c[0], A: c[1], B: c[2], Kind: "cable"})
	}
	return s
}

func devicePort(equipmentID string, n int) string { return fmt.Sprintf("%s:p%d", equipmentID, n) }

func panelPosition(equipmentID string, position int, side string) string {
	return fmt.Sprintf("%s:%d:%s", equipmentID, position, side[:1])
}
