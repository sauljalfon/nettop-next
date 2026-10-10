// Package scalefixture builds a generated, clearly fictional campus for the
// realistic-size check (M4.1 design 10): about 40 nodes in one main site and two
// small sites, about 300 racks of 42U, about 1,500 switches on three networks,
// eight 32-row HDFs, and thousands of cables in passive corridors from access
// nodes through sub-main HDFs to AGG and BB switches in Main Distribution.
// It is deterministic (no randomness, no clock) and is development data only:
// never real inventory, and never a way to infer properties of imported
// equipment. Serve it with `cmd/testserver -fixture campus`.
package scalefixture

import (
	"fmt"

	"nettop.local/backend/internal/topology"
)

const (
	buildings      = 33  // access nodes
	subMains       = 6   // sub-main nodes, each with one 32-row HDF
	racksPerBuild  = 7   // 42U racks in each access node
	switchesPerRck = 6   // 1U access switches per access rack
	portsPerSwitch = 24  // device ports
	panelPositions = 48  // each building's patch panel
	mdRacks        = 40  // racks in Main Distribution
	aggs           = 60  // aggregation switches
	bbs            = 6   // backbone switches
	hdfRows        = 32  // rows of every HDF
	hdfPositions   = 768 // positions of a 32-row HDF: 4 columns × 6 positions × 32 rows
)

type builder struct {
	s     topology.Snapshot
	cable int
}

// Campus returns the campus inventory.
func Campus() topology.Snapshot {
	b := &builder{s: topology.Snapshot{
		Context:  "installed",
		Revision: "campus-1",
		Site:     "Campus",
		Room:     "Main Distribution",
		Networks: []topology.Network{
			{ID: "net-a", Name: "Network A"},
			{ID: "net-b", Name: "Network B"},
			{ID: "net-c", Name: "Network C"},
		},
		Sites: []topology.Site{
			{ID: "site-campus", Name: "Campus"},
			{ID: "site-east", Name: "East Annex"},
			{ID: "site-west", Name: "West Annex"},
		},
		Nodes:     []topology.LocationNode{},
		Racks:     []topology.Rack{},
		Subpanels: []topology.Subpanel{},
		Equipment: []topology.Equipment{},
		Endpoints: []topology.Endpoint{},
		Links:     []topology.Link{},
	}}

	// Nodes and racks.
	b.node("node-main-distribution", "site-campus", "Main Distribution")
	for r := 1; r <= mdRacks; r++ {
		b.rack(fmt.Sprintf("rack-md-%02d", r), "node-main-distribution", fmt.Sprintf("MD-R%02d", r))
	}
	for m := 1; m <= subMains; m++ {
		id := fmt.Sprintf("node-sub-main-%d", m)
		b.node(id, "site-campus", fmt.Sprintf("Sub-main %d", m))
		for r := 1; r <= 2; r++ {
			b.rack(fmt.Sprintf("rack-sm%d-r%d", m, r), id, fmt.Sprintf("SM%d-R%d", m, r))
		}
	}
	for n := 1; n <= buildings; n++ {
		id := fmt.Sprintf("node-building-%02d", n)
		b.node(id, "site-campus", fmt.Sprintf("Building %02d", n))
		for r := 1; r <= racksPerBuild; r++ {
			b.rack(fmt.Sprintf("rack-b%02d-r%d", n, r), id, fmt.Sprintf("B%02d-R%d", n, r))
		}
	}
	for _, site := range []struct{ id, tag, name string }{{"site-east", "e", "East"}, {"site-west", "w", "West"}} {
		for n := 1; n <= 2; n++ {
			id := fmt.Sprintf("node-%s-%d", site.tag, n)
			b.node(id, site.id, fmt.Sprintf("%s Annex %d", site.name, n))
			for r := 1; r <= 2; r++ {
				b.rack(fmt.Sprintf("rack-%s%d-r%d", site.tag, n, r), id, fmt.Sprintf("%s%d-R%d", site.tag, n, r))
			}
		}
	}

	// Main Distribution: two HDFs, then the AGG and BB switches, two to a rack.
	for i := 1; i <= 2; i++ {
		topology.NewHDF(fmt.Sprintf("hdf-md%d", i), fmt.Sprintf("MD-HDF-%d", i), fmt.Sprintf("rack-md-%02d", i), 4, 3, hdfRows).AddTo(&b.s)
	}
	distribution := aggs + bbs
	for d := 0; d < distribution; d++ {
		role, id, name := "aggregation", fmt.Sprintf("agg-%02d", d+1), fmt.Sprintf("AGG-%02d", d+1)
		if d >= aggs {
			role, id, name = "backbone", fmt.Sprintf("bb-%02d", d-aggs+1), fmt.Sprintf("BB-%02d", d-aggs+1)
		}
		b.switchAt(id, name, role, networkOf(d), fmt.Sprintf("rack-md-%02d", 3+d/2), 8+4*(d%2))
	}
	// Each sub-main node has one 32-row HDF.
	for m := 1; m <= subMains; m++ {
		topology.NewHDF(fmt.Sprintf("hdf-sm%d", m), fmt.Sprintf("SM%d-HDF", m), fmt.Sprintf("rack-sm%d-r1", m), 4, 3, hdfRows).AddTo(&b.s)
	}

	// Access buildings: a patch panel and 42 access switches each, one circuit
	// per switch through the building's panel, its sub-main HDF and a Main
	// Distribution HDF to one AGG or BB switch, always on that device's network.
	perBuilding := racksPerBuild * switchesPerRck
	for n := 1; n <= buildings; n++ {
		panel := fmt.Sprintf("panel-b%02d", n)
		b.panel(panel, fmt.Sprintf("PANEL-B%02d", n), fmt.Sprintf("rack-b%02d-r1", n), 40)
		sm := (n - 1) % subMains
		for j := 0; j < perBuilding; j++ {
			k := (n-1)*perBuilding + j // the circuit's number across the campus
			d := k % distribution
			rack, slot := j/switchesPerRck+1, j%switchesPerRck+1
			id := fmt.Sprintf("acc-b%02d-r%d-s%d", n, rack, slot)
			b.switchAt(id, fmt.Sprintf("ACC-B%02d-R%d-S%d", n, rack, slot), "access", networkOf(d), fmt.Sprintf("rack-b%02d-r%d", n, rack), 2*slot)

			m := ((n-1)/subMains)*perBuilding + j // the next free position of the sub-main HDF
			smHDF := fmt.Sprintf("hdf-sm%d", sm+1)
			md := fmt.Sprintf("hdf-md%d", k/hdfPositions+1)
			b.cableBetween(port(id, 1), panelSide(panel, j+1, "f"))
			b.cableBetween(panelSide(panel, j+1, "r"), hdfSide(smHDF, m, "r"))
			b.cableBetween(hdfSide(smHDF, m, "f"), hdfSide(md, k%hdfPositions, "f"))
			var destID string
			if d < aggs {
				destID = fmt.Sprintf("agg-%02d", d+1)
			} else {
				destID = fmt.Sprintf("bb-%02d", d-aggs+1)
			}
			b.cableBetween(hdfSide(md, k%hdfPositions, "r"), port(destID, k/distribution+1))
		}
	}

	// The two small sites: a few switches each, not cabled (their own screens only).
	for _, site := range []struct{ tag, name string }{{"e", "EAST"}, {"w", "WEST"}} {
		for n := 1; n <= 2; n++ {
			for r := 1; r <= 2; r++ {
				for slot := 1; slot <= switchesPerRck; slot++ {
					b.switchAt(fmt.Sprintf("acc-%s%d-r%d-s%d", site.tag, n, r, slot),
						fmt.Sprintf("ACC-%s%d-R%d-S%d", site.name, n, r, slot), "access", networkOf(n+r+slot),
						fmt.Sprintf("rack-%s%d-r%d", site.tag, n, r), 2*slot)
				}
			}
		}
	}
	return b.s
}

func networkOf(i int) string { return fmt.Sprintf("net-%c", 'a'+rune(i%3)) }

func (b *builder) node(id, site, name string) {
	b.s.Nodes = append(b.s.Nodes, topology.LocationNode{ID: id, SiteID: site, Name: name})
}

func (b *builder) rack(id, node, name string) {
	b.s.Racks = append(b.s.Racks, topology.Rack{ID: id, NodeID: node, Name: name, Units: 42})
}

func (b *builder) switchAt(id, name, role, network, rack string, unit int) {
	b.s.Equipment = append(b.s.Equipment, topology.Equipment{ID: id, Name: name, Kind: "switch", Role: role, NetworkID: network, RackID: rack, Unit: unit, Height: 1})
	for n := 1; n <= portsPerSwitch; n++ {
		b.s.Endpoints = append(b.s.Endpoints, topology.Endpoint{ID: port(id, n), EquipmentID: id, Label: fmt.Sprintf("Port %d", n)})
	}
}

func (b *builder) panel(id, name, rack string, unit int) {
	b.s.Equipment = append(b.s.Equipment, topology.Equipment{ID: id, Name: name, Kind: "panel", Role: "passive", RackID: rack, Unit: unit, Height: 1})
	for n := 1; n <= panelPositions; n++ {
		front, rear := panelSide(id, n, "f"), panelSide(id, n, "r")
		b.s.Endpoints = append(b.s.Endpoints,
			topology.Endpoint{ID: front, EquipmentID: id, Label: fmt.Sprintf("%d · Front", n), Position: n, Side: "front"},
			topology.Endpoint{ID: rear, EquipmentID: id, Label: fmt.Sprintf("%d · Rear", n), Position: n, Side: "rear"})
		b.s.Links = append(b.s.Links, topology.Link{ID: fmt.Sprintf("%s:%d:bridge", id, n), A: front, B: rear, Kind: "internal"})
	}
}

func (b *builder) cableBetween(a, z string) {
	b.cable++
	b.s.Links = append(b.s.Links, topology.Link{ID: fmt.Sprintf("cable-%05d", b.cable), A: a, B: z, Kind: "cable"})
}

func port(equipment string, n int) string { return fmt.Sprintf("%s:p%d", equipment, n) }

func panelSide(panel string, position int, side string) string {
	return fmt.Sprintf("%s:%d:%s", panel, position, side)
}

// hdfSide is the endpoint of the m-th position (0-based, row by row, columns A
// to D, six positions each) on one side of an HDF built by topology.NewHDF.
func hdfSide(hdf string, m int, side string) string {
	row, column, position := m/24+1, "ABCD"[(m%24)/6], m%6+1
	return fmt.Sprintf("%s:sp-%d%c:%d:%s", hdf, row, column, position, side)
}

// Empty is the installed root of the data-entry rehearsal (M5c step 10): the
// campus's three networks and nothing else, so a node can be entered by hand
// with the bulk tools. Seed it with `cmd/db seed -fixture empty` into a
// database that holds no real data.
func Empty() topology.Snapshot {
	return topology.Snapshot{
		Context:  "installed",
		Revision: "empty-1",
		Site:     "Rehearsal",
		Room:     "",
		Networks: []topology.Network{
			{ID: "net-a", Name: "Network A"},
			{ID: "net-b", Name: "Network B"},
			{ID: "net-c", Name: "Network C"},
		},
		Sites:     []topology.Site{},
		Nodes:     []topology.LocationNode{},
		Racks:     []topology.Rack{},
		Subpanels: []topology.Subpanel{},
		Equipment: []topology.Equipment{},
		Endpoints: []topology.Endpoint{},
		Links:     []topology.Link{},
	}
}
