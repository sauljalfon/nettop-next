// Package scalefixture builds a generated, clearly fictional campus for the
// realistic-size check (M4.1 design 10): about 40 nodes in the main site and 50
// in each of two annexes, about 300 racks of 42U, about 1,300 switches on three
// networks, ten 32-row HDFs, and thousands of cables in passive corridors from
// access nodes through HDFs to AGG and BB switches in Main Distribution.
// It is wired like a real network, as the owner described it: a node holds 6 to
// 12 access switches; each network has 20 AGGs (six pairs and eight single
// AGGs) and two BBs; a node's switches on one network hang under one AGG or one
// pair, and most have one uplink. A few have a second one (to the other AGG of
// the pair, to a BB, or to a neighbouring switch), a few in Main Distribution go
// straight to a BB, and a pair's AGGs uplink to both BBs while a single AGG
// uplinks to one. A few deliberate faults (chains, no uplink, another network, a
// split building and an AGG with no BB) give the hierarchy and the Problems list
// something to show. It is deterministic (no randomness, no clock) and is
// development data only: never real inventory, and never a way to infer
// properties of imported equipment. Serve it with `cmd/testserver -fixture campus`.
package scalefixture

import (
	"fmt"

	"nettop.local/backend/internal/topology"
)

const (
	buildings      = 33  // access nodes in the main site
	annexNodes     = 50  // access nodes in each annex
	subMains       = 6   // sub-main nodes, each with one 32-row HDF
	switchesPerRck = 6   // 1U access switches per access rack
	portsPerSwitch = 24  // device ports
	panelPositions = 48  // each access node's patch panel
	mdRacks        = 40  // racks in Main Distribution
	mdHDFs         = 4   // 32-row HDFs in Main Distribution
	aggs           = 60  // aggregation switches: 20 per network
	bbs            = 6   // backbone switches: 2 per network
	perNetwork     = 20  // AGGs per network: six pairs, then eight single AGGs
	pairs          = 6   // AGG pairs per network
	groups         = 14  // AGG groups per network: the pairs, then the singles
	tierPorts      = 96  // device ports of an AGG or BB
	hdfRows        = 32  // rows of every HDF
	hdfPositions   = 768 // positions of a 32-row HDF: 4 columns × 6 positions × 32 rows
)

type builder struct {
	s     topology.Snapshot
	cable int
	// next is each AGG's or BB's next free access port, and each HDF's next
	// free position.
	next map[string]int
}

// The deliberate faults, by access switch.
var (
	// chainedUnder: the switch has no uplink and hangs under the other one (port 24, or 23 for a second link).
	chainedUnder = map[string]string{
		"acc-b07-s6": "acc-b07-s5", "acc-b08-s3": "acc-b08-s2",
		"acc-b09-s5": "acc-b09-s4", "acc-b09-s6": "acc-b09-s5",
	}
	noUplink     = map[string]bool{"acc-b10-s6": true, "acc-b11-s1": true}
	otherNetwork = "acc-b13-s2"       // one uplink, to an AGG of the next network
	splitNode    = "node-building-16" // its second rack hangs under the next group
	noBB         = "agg-60"           // a single AGG with no BB uplink
)

// accessNode is one node of access switches and where its corridor runs.
type accessNode struct {
	id, rackPrefix, idPrefix, namePrefix string
	subMain                              string // the sub-main HDF, or "" for an annex
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
	}, next: map[string]int{}}

	// Main Distribution and the sub-main nodes.
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

	// Main Distribution: four HDFs, then the AGG and BB switches, two to a rack.
	for i := 1; i <= mdHDFs; i++ {
		topology.NewHDF(fmt.Sprintf("hdf-md%d", i), fmt.Sprintf("MD-HDF-%d", i), fmt.Sprintf("rack-md-%02d", (i+1)/2), 4+4*((i+1)%2), 3, hdfRows).AddTo(&b.s)
	}
	for d := 0; d < aggs+bbs; d++ {
		role, id, name, network := "aggregation", agg(d), fmt.Sprintf("AGG-%02d", d+1), networkOf(d/perNetwork)
		if d >= aggs {
			role, id, name, network = "backbone", bb((d-aggs)/2, (d-aggs)%2), fmt.Sprintf("BB-%02d", d-aggs+1), networkOf((d-aggs)/2)
		}
		b.switchAt(id, name, role, network, fmt.Sprintf("rack-md-%02d", 3+d/2), 8+4*(d%2), tierPorts)
	}
	// A pair's AGGs: a peer link, then one uplink to each BB of the network.
	// A single AGG: one uplink, to the first or the second BB in turn.
	for net := 0; net < 3; net++ {
		for g := 0; g < pairs; g++ {
			a, z := agg(net*perNetwork+2*g), agg(net*perNetwork+2*g+1)
			b.cableBetween(port(a, tierPorts), port(z, tierPorts))
			for _, id := range []string{a, z} {
				for k := 0; k < 2; k++ {
					b.cableBetween(port(id, tierPorts-2+k), port(bb(net, k), b.take(bb(net, k))))
				}
			}
		}
		for g := pairs; g < groups; g++ {
			id := agg(net*perNetwork + pairs + g)
			if id != noBB {
				b.cableBetween(port(id, tierPorts-2), port(bb(net, g%2), b.take(bb(net, g%2))))
			}
		}
		b.cableBetween(port(bb(net, 0), tierPorts), port(bb(net, 1), tierPorts))
	}
	// Each sub-main node has one 32-row HDF.
	for m := 1; m <= subMains; m++ {
		topology.NewHDF(fmt.Sprintf("hdf-sm%d", m), fmt.Sprintf("SM%d-HDF", m), fmt.Sprintf("rack-sm%d-r1", m), 4, 3, hdfRows).AddTo(&b.s)
	}

	// A few access switches in Main Distribution, three per network: the first
	// on an AGG of the network's first pair, the other two straight to a BB.
	for net := 0; net < 3; net++ {
		for k := 0; k < 3; k++ {
			n := 3*net + k + 1
			id := fmt.Sprintf("acc-md-s%d", n)
			b.switchAt(id, fmt.Sprintf("ACC-MD-S%d", n), "access", networkOf(net), fmt.Sprintf("rack-md-%02d", 37+net), 2*k+2, portsPerSwitch)
			dest := agg(net * perNetwork)
			if k > 0 {
				dest = bb(net, k-1)
			}
			b.cableBetween(port(id, 1), port(dest, b.take(dest)))
		}
	}

	// The access nodes: the main site's buildings, each through its sub-main
	// HDF, then the two annexes, each straight to Main Distribution.
	var nodes []accessNode
	for n := 1; n <= buildings; n++ {
		id := fmt.Sprintf("node-building-%02d", n)
		b.node(id, "site-campus", fmt.Sprintf("Building %02d", n))
		nodes = append(nodes, accessNode{id, fmt.Sprintf("rack-b%02d", n), fmt.Sprintf("b%02d", n), fmt.Sprintf("B%02d", n), fmt.Sprintf("hdf-sm%d", (n-1)%subMains+1)})
	}
	for _, site := range []struct{ id, tag, name string }{{"site-east", "e", "East"}, {"site-west", "w", "West"}} {
		for n := 1; n <= annexNodes; n++ {
			id := fmt.Sprintf("node-%s-%d", site.tag, n)
			b.node(id, site.id, fmt.Sprintf("%s Annex %d", site.name, n))
			nodes = append(nodes, accessNode{id, fmt.Sprintf("rack-%s%d", site.tag, n), fmt.Sprintf("%s%d", site.tag, n), fmt.Sprintf("%c%02d", site.name[0], n), ""})
		}
	}
	for i, node := range nodes {
		b.accessNode(i, node)
	}
	return b.s
}

// accessNode builds the i-th access node: 6 to 12 switches, six to a rack, and
// one patch panel. Its switches are on network i%3, under group (i/3)%14 of it;
// every fourth node has its last two switches on the next network.
func (b *builder) accessNode(i int, node accessNode) {
	count := 6 + i*5%7
	for r := 1; r <= (count+switchesPerRck-1)/switchesPerRck; r++ {
		b.rack(fmt.Sprintf("%s-r%d", node.rackPrefix, r), node.id, fmt.Sprintf("%s-R%d", node.namePrefix, r))
	}
	panel := "panel-" + node.idPrefix
	b.panel(panel, "PANEL-"+node.namePrefix, node.rackPrefix+"-r1", 40)
	circuit := 0
	for k := 1; k <= count; k++ {
		id := fmt.Sprintf("acc-%s-s%d", node.idPrefix, k)
		rack := (k-1)/switchesPerRck + 1
		net, group := i%3, (i/3)%groups
		if i%4 == 3 && k > count-2 {
			net, group = (i+1)%3, (i/3+7)%groups
		}
		if node.id == splitNode && rack == 2 {
			group = (group + 1) % groups
		}
		b.switchAt(id, fmt.Sprintf("ACC-%s-S%d", node.namePrefix, k), "access", networkOf(net),
			fmt.Sprintf("%s-r%d", node.rackPrefix, rack), 2*((k-1)%switchesPerRck+1), portsPerSwitch)
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
		// The uplinks: one AGG of the group, alternating in a pair; the first
		// switch of a pair node also has the other AGG, and in every fourth
		// single group's node a BB.
		dests := []string{groupAgg(net, group, k)}
		switch {
		case id == otherNetwork:
			dests = []string{groupAgg((net+1)%3, group, k)}
		case k == 1 && group < pairs:
			dests = append(dests, groupAgg(net, group, k+1))
		case k == 1 && (i/3)%4 == 0:
			dests = append(dests, bb(net, 0))
		}
		for u, dest := range dests {
			b.corridor(port(id, u+1), panel, node.subMain, circuit, dest)
			circuit++
		}
		// In every fifth single group's node, the last switch also has a cable
		// to the switch before it.
		if k == count && group >= pairs && (i/3)%5 == 1 {
			b.cableBetween(port(id, 22), port(fmt.Sprintf("acc-%s-s%d", node.idPrefix, k-1), 22))
		}
	}
}

// corridor cables one circuit from a switch port through the node's panel,
// the sub-main HDF when there is one, and a Main Distribution HDF to the
// next free port of dest.
func (b *builder) corridor(from, panel, subMain string, circuit int, dest string) {
	b.cableBetween(from, panelSide(panel, circuit+1, "f"))
	up := panelSide(panel, circuit+1, "r")
	if subMain != "" {
		m := b.position(subMain)
		b.cableBetween(up, hdfSide(subMain, m, "r"))
		up = hdfSide(subMain, m, "f")
	}
	k := b.position("hdf-md")
	md := fmt.Sprintf("hdf-md%d", k/hdfPositions+1)
	b.cableBetween(up, hdfSide(md, k%hdfPositions, "f"))
	b.cableBetween(hdfSide(md, k%hdfPositions, "r"), port(dest, b.take(dest)))
}

// groupAgg is the AGG of a network's group that the k-th switch of a node
// uses: in a pair, the two AGGs in turn.
func groupAgg(net, group, k int) string {
	if group < pairs {
		return agg(net*perNetwork + 2*group + (k-1)%2)
	}
	return agg(net*perNetwork + pairs + group)
}

func bb(net, k int) string { return fmt.Sprintf("bb-%02d", 2*net+k+1) }

// position returns the next free position (0-based) of an HDF, or of the four
// Main Distribution HDFs counted together ("hdf-md").
func (b *builder) position(hdf string) int {
	b.next["pos:"+hdf]++
	return b.next["pos:"+hdf] - 1
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
