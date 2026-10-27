// Package scalefixture builds a generated, clearly fictional campus for the
// realistic-size check (M4.1 design 10): about 40 nodes in one main site and two
// small sites, about 300 racks of 42U, about 1,500 switches on three networks,
// ten 32-row HDFs, and thousands of cables in passive corridors from access
// nodes through sub-main HDFs to AGG and BB switches in Main Distribution.
// It is wired like a real network: each network has ten AGG pairs and two BBs,
// every AGG uplinks to both BBs and to its pair, a building has a main network
// (racks 1–5) and a second one (racks 6–7), and every access switch has two
// uplinks, one to each AGG of its building's pair. A few deliberate faults
// (single uplinks, chains, no uplink, another network, a split building and an
// AGG missing a BB) give the hierarchy and the Problems list something to show.
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
	panelPositions = 48  // each of a building's two patch panels
	mdRacks        = 40  // racks in Main Distribution
	mdHDFs         = 4   // 32-row HDFs in Main Distribution
	aggs           = 60  // aggregation switches: 20 per network, in pairs
	bbs            = 6   // backbone switches: 2 per network
	pairs          = 10  // AGG pairs per network
	tierPorts      = 96  // device ports of an AGG or BB
	mainRacks      = 5   // a building's racks on its main network; the rest are on its second
	hdfRows        = 32  // rows of every HDF
	hdfPositions   = 768 // positions of a 32-row HDF: 4 columns × 6 positions × 32 rows
)

type builder struct {
	s     topology.Snapshot
	cable int
	// next is each AGG's or BB's next free access port.
	next map[string]int
}

// The deliberate faults, by access switch.
var (
	singleUplink = map[string]bool{"acc-b04-r2-s1": true, "acc-b04-r2-s2": true, "acc-b05-r3-s4": true, "acc-b06-r1-s6": true}
	// chainedUnder: the switch has no uplink and hangs under the other one (port 24, or 23 for a second link).
	chainedUnder = map[string]string{
		"acc-b07-r4-s6": "acc-b07-r4-s5", "acc-b08-r2-s3": "acc-b08-r2-s2",
		"acc-b09-r1-s5": "acc-b09-r1-s4", "acc-b09-r1-s6": "acc-b09-r1-s5",
	}
	noUplink     = map[string]bool{"acc-b10-r5-s6": true, "acc-b11-r1-s1": true}
	otherNetwork = "acc-b13-r3-s2" // one uplink, to an AGG of the next network
	splitRack    = "rack-b16-r5"   // wired to the next pair of its network
	missingBB    = "agg-60"        // uplinks to the first BB of its network only
)

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
	}, next: map[string]int{}}

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

	// Main Distribution: four HDFs, then the AGG and BB switches, two to a rack.
	for i := 1; i <= mdHDFs; i++ {
		topology.NewHDF(fmt.Sprintf("hdf-md%d", i), fmt.Sprintf("MD-HDF-%d", i), fmt.Sprintf("rack-md-%02d", (i+1)/2), 4+4*((i+1)%2), 3, hdfRows).AddTo(&b.s)
	}
	for d := 0; d < aggs+bbs; d++ {
		role, id, name, network := "aggregation", agg(d), fmt.Sprintf("AGG-%02d", d+1), networkOf(d/(2*pairs))
		if d >= aggs {
			role, id, name, network = "backbone", fmt.Sprintf("bb-%02d", d-aggs+1), fmt.Sprintf("BB-%02d", d-aggs+1), networkOf((d-aggs)/2)
		}
		b.switchAt(id, name, role, network, fmt.Sprintf("rack-md-%02d", 3+d/2), 8+4*(d%2), tierPorts)
	}
	// Each AGG: a peer link to its pair, then one uplink to each BB of its network.
	for d := 0; d < aggs; d += 2 {
		b.cableBetween(port(agg(d), tierPorts), port(agg(d+1), tierPorts))
	}
	for d := 0; d < aggs; d++ {
		net := d / (2 * pairs)
		for k := 0; k < 2; k++ {
			if agg(d) == missingBB && k == 1 {
				continue
			}
			bb := fmt.Sprintf("bb-%02d", 2*net+k+1)
			b.cableBetween(port(agg(d), tierPorts-2+k), port(bb, b.take(bb)))
		}
	}
	for net := 0; net < 3; net++ {
		b.cableBetween(port(fmt.Sprintf("bb-%02d", 2*net+1), tierPorts), port(fmt.Sprintf("bb-%02d", 2*net+2), tierPorts))
	}
	// Each sub-main node has one 32-row HDF.
	for m := 1; m <= subMains; m++ {
		topology.NewHDF(fmt.Sprintf("hdf-sm%d", m), fmt.Sprintf("SM%d-HDF", m), fmt.Sprintf("rack-sm%d-r1", m), 4, 3, hdfRows).AddTo(&b.s)
	}

	// Access buildings: two patch panels and 42 access switches each. Each switch
	// has two circuits, port 1 and port 2, each through a building panel, the
	// building's sub-main HDF and a Main Distribution HDF to one AGG of the pair.
	perBuilding := racksPerBuild * switchesPerRck
	for n := 1; n <= buildings; n++ {
		panels := [2]string{fmt.Sprintf("panel-b%02d", n), fmt.Sprintf("panel-b%02d-2", n)}
		b.panel(panels[0], fmt.Sprintf("PANEL-B%02d", n), fmt.Sprintf("rack-b%02d-r1", n), 40)
		b.panel(panels[1], fmt.Sprintf("PANEL-B%02d-2", n), fmt.Sprintf("rack-b%02d-r1", n), 41)
		smHDF := fmt.Sprintf("hdf-sm%d", (n-1)%subMains+1)
		for j := 0; j < perBuilding; j++ {
			rack, slot := j/switchesPerRck+1, j%switchesPerRck+1
			id := fmt.Sprintf("acc-b%02d-r%d-s%d", n, rack, slot)
			rackID := fmt.Sprintf("rack-b%02d-r%d", n, rack)
			// The main network is the building's; the second is the next one.
			net, pair := (n-1)%3, (n-1)/3%pairs
			if rack > mainRacks {
				net, pair = n%3, ((n-1)/3+pairs/2)%pairs
			}
			if rackID == splitRack {
				pair = (pair + 1) % pairs
			}
			b.switchAt(id, fmt.Sprintf("ACC-B%02d-R%d-S%d", n, rack, slot), "access", networkOf(net), rackID, 2*slot, portsPerSwitch)
			if parent, ok := chainedUnder[id]; ok {
				p := portsPerSwitch
				if _, down := chainedUnder[parent]; down {
					p--
				}
				b.cableBetween(port(id, p), port(parent, p))
				continue
			}
			if noUplink[id] {
				continue
			}
			for u := 0; u < 2; u++ {
				if u == 1 && (singleUplink[id] || id == otherNetwork) {
					continue
				}
				dest := agg(2*pairs*net + 2*pair + u)
				if id == otherNetwork {
					dest = agg(2*pairs*((net+1)%3) + 2*pair)
				}
				c := 2*j + u                            // the circuit in the building
				m := ((n-1)/subMains)*2*perBuilding + c // its sub-main HDF position
				k := (n-1)*2*perBuilding + c            // its number across the campus
				md := fmt.Sprintf("hdf-md%d", k/hdfPositions+1)
				b.cableBetween(port(id, u+1), panelSide(panels[c/panelPositions], c%panelPositions+1, "f"))
				b.cableBetween(panelSide(panels[c/panelPositions], c%panelPositions+1, "r"), hdfSide(smHDF, m, "r"))
				b.cableBetween(hdfSide(smHDF, m, "f"), hdfSide(md, k%hdfPositions, "f"))
				b.cableBetween(hdfSide(md, k%hdfPositions, "r"), port(dest, b.take(dest)))
			}
		}
	}

	// The two small sites: a few switches each, each cabled straight to the last
	// pair of its network (a long fiber, no corridor).
	for _, site := range []struct{ tag, name string }{{"e", "EAST"}, {"w", "WEST"}} {
		for n := 1; n <= 2; n++ {
			for r := 1; r <= 2; r++ {
				for slot := 1; slot <= switchesPerRck; slot++ {
					id := fmt.Sprintf("acc-%s%d-r%d-s%d", site.tag, n, r, slot)
					net := (n + r + slot) % 3
					b.switchAt(id, fmt.Sprintf("ACC-%s%d-R%d-S%d", site.name, n, r, slot), "access", networkOf(net),
						fmt.Sprintf("rack-%s%d-r%d", site.tag, n, r), 2*slot, portsPerSwitch)
					for u := 0; u < 2; u++ {
						dest := agg(2*pairs*net + 2*(pairs-1) + u)
						b.cableBetween(port(id, u+1), port(dest, b.take(dest)))
					}
				}
			}
		}
	}
	return b.s
}

func networkOf(i int) string { return fmt.Sprintf("net-%c", 'a'+rune(i%3)) }

func agg(d int) string { return fmt.Sprintf("agg-%02d", d+1) }

// take returns the next free access port of an AGG or BB; the last three
// ports are kept for its BB uplinks and its peer link.
func (b *builder) take(id string) int {
	b.next[id]++
	if b.next[id] > tierPorts-3 {
		panic(fmt.Sprintf("scalefixture: %s has no free port", id))
	}
	return b.next[id]
}

func (b *builder) node(id, site, name string) {
	b.s.Nodes = append(b.s.Nodes, topology.LocationNode{ID: id, SiteID: site, Name: name})
}

func (b *builder) rack(id, node, name string) {
	b.s.Racks = append(b.s.Racks, topology.Rack{ID: id, NodeID: node, Name: name, Units: 42})
}

func (b *builder) switchAt(id, name, role, network, rack string, unit, ports int) {
	b.s.Equipment = append(b.s.Equipment, topology.Equipment{ID: id, Name: name, Kind: "switch", Role: role, NetworkID: network, RackID: rack, Unit: unit, Height: 1})
	for n := 1; n <= ports; n++ {
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
