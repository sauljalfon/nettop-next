package acceptance_test

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/topology"
)

// Everything below restates docs/acceptance-example.md independently of the
// fixture: equipment is found by display name, panel/HDF endpoints by their
// structured owner/subpanel/position/side fields, never by parsing IDs.

type end struct {
	equipment string
	port      int    // device port (switches)
	subpanel  string // "3C" = row 3, column C (HDF only; test data, not parsed from the fixture)
	position  int
	side      string
}

func dev(equipment string, port int) end { return end{equipment: equipment, port: port} }
func pnl(equipment string, position int, side string) end {
	return end{equipment: equipment, position: position, side: side}
}
func hdf(equipment, subpanel string, position int, side string) end {
	return end{equipment: equipment, subpanel: subpanel, position: position, side: side}
}

type index struct {
	t *testing.T
	s topology.Snapshot
}

func newIndex(t *testing.T) index {
	t.Helper()
	s := acceptance.Installed()
	if err := topology.Validate(s); err != nil {
		t.Fatalf("the acceptance fixture must validate: %v", err)
	}
	return index{t, s}
}

func (x index) equipment(name string) topology.Equipment {
	x.t.Helper()
	for _, e := range x.s.Equipment {
		if e.Name == name {
			return e
		}
	}
	x.t.Fatalf("no equipment named %s", name)
	return topology.Equipment{}
}

func (x index) endpoint(e end) string {
	x.t.Helper()
	owner := x.equipment(e.equipment)
	switch {
	case e.port > 0:
		id := fmt.Sprintf("%s:p%d", owner.ID, e.port)
		for _, p := range x.s.Endpoints {
			if p.ID == id && p.EquipmentID == owner.ID {
				return p.ID
			}
		}
	default:
		subpanel := ""
		if e.subpanel != "" {
			var row int
			fmt.Sscanf(e.subpanel[:len(e.subpanel)-1], "%d", &row)
			column := e.subpanel[len(e.subpanel)-1:]
			for _, sp := range x.s.Subpanels {
				if sp.EquipmentID == owner.ID && sp.Row == row && sp.Column == column {
					subpanel = sp.ID
				}
			}
			if subpanel == "" {
				x.t.Fatalf("%s has no subpanel %s", e.equipment, e.subpanel)
			}
		}
		for _, p := range x.s.Endpoints {
			if p.EquipmentID == owner.ID && p.SubpanelID == subpanel && p.Position == e.position && p.Side == e.side {
				return p.ID
			}
		}
	}
	x.t.Fatalf("endpoint not found: %+v", e)
	return ""
}

func (x index) count(kind string, match func(topology.Link) bool) int {
	n := 0
	for _, l := range x.s.Links {
		if l.Kind == kind && (match == nil || match(l)) {
			n++
		}
	}
	return n
}

func TestFixtureCounts(t *testing.T) {
	x := newIndex(t)
	s := x.s
	if len(s.Sites) != 2 || len(s.Nodes) != 5 || len(s.Racks) != 7 || len(s.Networks) != 2 {
		t.Fatalf("sites/nodes/racks/networks = %d/%d/%d/%d", len(s.Sites), len(s.Nodes), len(s.Racks), len(s.Networks))
	}
	if len(s.Equipment) != 11 {
		t.Fatalf("%d equipment, want 11", len(s.Equipment))
	}
	active, passive := 0, 0
	for _, e := range s.Equipment {
		if e.Kind == "switch" {
			active++
		} else {
			passive++
		}
	}
	if active != 7 || passive != 4 {
		t.Fatalf("active/passive = %d/%d, want 7/4", active, passive)
	}
	if got := x.count("cable", nil); got != 16 {
		t.Fatalf("%d external cables, want 16", got)
	}
	occupied := map[string]bool{}
	for _, l := range s.Links {
		if l.Kind == "cable" {
			occupied[l.A], occupied[l.B] = true, true
		}
	}
	if len(occupied) != 32 {
		t.Fatalf("%d distinct external-cable endpoints, want 32", len(occupied))
	}
	owned := func(id string) (subpanels, endpoints, bridges int) {
		for _, sp := range s.Subpanels {
			if sp.EquipmentID == id {
				subpanels++
			}
		}
		ownerOf := map[string]string{}
		for _, p := range s.Endpoints {
			ownerOf[p.ID] = p.EquipmentID
			if p.EquipmentID == id {
				endpoints++
			}
		}
		for _, l := range s.Links {
			if l.Kind == "internal" && ownerOf[l.A] == id {
				bridges++
			}
		}
		return
	}
	for _, tc := range []struct {
		name                          string
		subpanels, endpoints, bridges int
	}{
		{"HDF-01", 16, 192, 96}, {"HDF-02", 12, 144, 72}, {"PANEL-A", 0, 48, 24}, {"PANEL-DR", 0, 48, 24},
		{"EDGE-17", 0, 24, 0}, {"AGG-03", 0, 24, 0}, {"AGG-08", 0, 24, 0}, {"AGG-15", 0, 24, 0}, {"BB-01", 0, 24, 0}, {"EDGE-22", 0, 24, 0}, {"AGG-12", 0, 24, 0},
	} {
		a, b, c := owned(x.equipment(tc.name).ID)
		if a != tc.subpanels || b != tc.endpoints || c != tc.bridges {
			t.Errorf("%s: subpanels/endpoints/bridges = %d/%d/%d, want %d/%d/%d", tc.name, a, b, c, tc.subpanels, tc.endpoints, tc.bridges)
		}
	}
	if len(s.Subpanels) != 28 {
		t.Fatalf("%d subpanels, want 28", len(s.Subpanels))
	}
}

func TestInventoryAndLocations(t *testing.T) {
	x := newIndex(t)
	networks := map[string]string{}
	for _, n := range x.s.Networks {
		networks[n.ID] = n.Name
	}
	if !slices.Contains(mapValues(networks), "Network A") || !slices.Contains(mapValues(networks), "Network B") {
		t.Fatalf("networks = %v", networks)
	}
	racks := map[string]topology.Rack{}
	for _, r := range x.s.Racks {
		racks[r.Name] = r
		if r.Units != 12 {
			t.Errorf("%s has %dU, want 12U", r.Name, r.Units)
		}
	}
	nodeName := map[string]topology.LocationNode{}
	for _, n := range x.s.Nodes {
		nodeName[n.ID] = n
	}
	siteName := map[string]string{}
	for _, s := range x.s.Sites {
		siteName[s.ID] = s.Name
	}
	for _, tc := range []struct{ rack, node, site string }{
		{"Rack A03", "Building A", "Main Campus"}, {"Rack SM01", "North Sub-main", "Main Campus"},
		{"Rack Core 01", "Main Distribution", "Main Campus"}, {"Rack Core 02", "Main Distribution", "Main Campus"}, {"Rack Core 03", "Main Distribution", "Main Campus"},
		{"Rack DR01", "DR Access", "DR Site"}, {"Rack DR02", "DR Distribution", "DR Site"},
	} {
		r, ok := racks[tc.rack]
		if !ok {
			t.Fatalf("missing %s", tc.rack)
		}
		n := nodeName[r.NodeID]
		if n.Name != tc.node || siteName[n.SiteID] != tc.site {
			t.Errorf("%s is in %s / %s, want %s / %s", tc.rack, n.Name, siteName[n.SiteID], tc.node, tc.site)
		}
	}
	rackName := map[string]string{}
	for _, r := range x.s.Racks {
		rackName[r.ID] = r.Name
	}
	for _, tc := range []struct {
		name, kind, role, network, rack string
		unit, height                    int
	}{
		{"EDGE-17", "switch", "access", "Network A", "Rack A03", 8, 1},
		{"PANEL-A", "panel", "passive", "", "Rack A03", 11, 1},
		{"HDF-01", "hdf", "passive", "", "Rack SM01", 4, 3},
		{"HDF-02", "hdf", "passive", "", "Rack Core 01", 4, 3},
		{"AGG-03", "switch", "aggregation", "Network A", "Rack Core 01", 8, 1},
		{"AGG-08", "switch", "aggregation", "Network A", "Rack Core 02", 8, 1},
		{"AGG-15", "switch", "aggregation", "Network A", "Rack Core 02", 6, 1},
		{"BB-01", "switch", "backbone", "Network A", "Rack Core 03", 8, 1},
		{"EDGE-22", "switch", "access", "Network B", "Rack DR01", 8, 1},
		{"PANEL-DR", "panel", "passive", "", "Rack DR01", 11, 1},
		{"AGG-12", "switch", "aggregation", "Network B", "Rack DR02", 8, 1},
	} {
		e := x.equipment(tc.name)
		if e.Kind != tc.kind || e.Role != tc.role || networks[e.NetworkID] != tc.network || rackName[e.RackID] != tc.rack || e.Unit != tc.unit || e.Height != tc.height {
			t.Errorf("%s = %s/%s/net %q/%s U%d %dU, want %s/%s/net %q/%s U%d %dU", tc.name, e.Kind, e.Role, networks[e.NetworkID], rackName[e.RackID], e.Unit, e.Height, tc.kind, tc.role, tc.network, tc.rack, tc.unit, tc.height)
		}
	}
}

func mapValues(m map[string]string) []string {
	var out []string
	for _, v := range m {
		out = append(out, v)
	}
	return out
}

var cables = []struct {
	id   string
	a, b end
}{
	{"cable-a01", dev("EDGE-17", 1), pnl("PANEL-A", 1, "front")},
	{"cable-a02", pnl("PANEL-A", 1, "rear"), hdf("HDF-01", "3C", 5, "rear")},
	{"cable-a03", hdf("HDF-01", "3C", 5, "front"), hdf("HDF-02", "2B", 3, "front")},
	{"cable-a04", hdf("HDF-02", "2B", 3, "rear"), dev("AGG-03", 1)},
	{"cable-a05", dev("EDGE-17", 2), pnl("PANEL-A", 2, "front")},
	{"cable-a06", pnl("PANEL-A", 2, "rear"), hdf("HDF-01", "1A", 2, "rear")},
	{"cable-a07", hdf("HDF-01", "1A", 2, "front"), hdf("HDF-02", "1D", 2, "front")},
	{"cable-a08", hdf("HDF-02", "1D", 2, "rear"), dev("AGG-08", 1)},
	{"cable-a09", dev("EDGE-17", 3), pnl("PANEL-A", 3, "front")},
	{"cable-a10", pnl("PANEL-A", 3, "rear"), hdf("HDF-01", "2D", 4, "rear")},
	{"cable-a11", hdf("HDF-01", "2D", 4, "front"), hdf("HDF-02", "3A", 1, "front")},
	{"cable-a12", hdf("HDF-02", "3A", 1, "rear"), dev("BB-01", 1)},
	{"cable-b01", dev("EDGE-22", 1), pnl("PANEL-DR", 1, "front")},
	{"cable-b02", pnl("PANEL-DR", 1, "rear"), hdf("HDF-01", "3C", 2, "rear")},
	{"cable-b03", hdf("HDF-01", "3C", 2, "front"), hdf("HDF-02", "2B", 6, "front")},
	{"cable-b04", hdf("HDF-02", "2B", 6, "rear"), dev("AGG-12", 1)},
}

// Every cable endpoint matches the cable table, unordered, with no extra cables.
func TestCablesMatchTheTable(t *testing.T) {
	x := newIndex(t)
	byID := map[string]topology.Link{}
	for _, l := range x.s.Links {
		if l.Kind == "cable" {
			byID[l.ID] = l
		}
	}
	if len(byID) != len(cables) {
		t.Fatalf("%d cables, want %d", len(byID), len(cables))
	}
	for _, c := range cables {
		l, ok := byID[c.id]
		if !ok {
			t.Errorf("missing cable %s", c.id)
			continue
		}
		got := []string{l.A, l.B}
		want := []string{x.endpoint(c.a), x.endpoint(c.b)}
		slices.Sort(got)
		slices.Sort(want)
		if !slices.Equal(got, want) {
			t.Errorf("%s joins %v, want %v", c.id, got, want)
		}
	}
}

// Passive positions never connect circuits: bridges are exact, unused positions
// stay free, and Networks A/B share subpanels on different positions only.
func TestNetworksShareSubpanelsOnDifferentPositions(t *testing.T) {
	x := newIndex(t)
	a5, b2 := x.endpoint(hdf("HDF-01", "3C", 5, "front")), x.endpoint(hdf("HDF-01", "3C", 2, "front"))
	var sa, sb string
	for _, p := range x.s.Endpoints {
		if p.ID == a5 {
			sa = p.SubpanelID
		}
		if p.ID == b2 {
			sb = p.SubpanelID
		}
	}
	if sa == "" || sa != sb || a5 == b2 {
		t.Fatalf("3C/5 and 3C/2 must be different positions of one subpanel: %q %q", sa, sb)
	}
	occupied := 0
	for _, l := range x.s.Links {
		if l.Kind == "cable" {
			occupied++
		}
	}
	free := x.endpoint(hdf("HDF-01", "4D", 6, "front"))
	for _, l := range x.s.Links {
		if l.Kind == "cable" && (l.A == free || l.B == free) {
			t.Fatal("an unused configured position must not be cabled")
		}
	}
	if occupied != 16 {
		t.Fatal("unexpected cable count")
	}
}

type step struct {
	cable string // empty for an internal bridge
	to    end
}

func route(steps ...step) []step { return steps }

var (
	routeAGG03 = route(
		step{"cable-a01", pnl("PANEL-A", 1, "front")}, step{"", pnl("PANEL-A", 1, "rear")},
		step{"cable-a02", hdf("HDF-01", "3C", 5, "rear")}, step{"", hdf("HDF-01", "3C", 5, "front")},
		step{"cable-a03", hdf("HDF-02", "2B", 3, "front")}, step{"", hdf("HDF-02", "2B", 3, "rear")},
		step{"cable-a04", dev("AGG-03", 1)})
	routeAGG08 = route(
		step{"cable-a05", pnl("PANEL-A", 2, "front")}, step{"", pnl("PANEL-A", 2, "rear")},
		step{"cable-a06", hdf("HDF-01", "1A", 2, "rear")}, step{"", hdf("HDF-01", "1A", 2, "front")},
		step{"cable-a07", hdf("HDF-02", "1D", 2, "front")}, step{"", hdf("HDF-02", "1D", 2, "rear")},
		step{"cable-a08", dev("AGG-08", 1)})
	routeBB01 = route(
		step{"cable-a09", pnl("PANEL-A", 3, "front")}, step{"", pnl("PANEL-A", 3, "rear")},
		step{"cable-a10", hdf("HDF-01", "2D", 4, "rear")}, step{"", hdf("HDF-01", "2D", 4, "front")},
		step{"cable-a11", hdf("HDF-02", "3A", 1, "front")}, step{"", hdf("HDF-02", "3A", 1, "rear")},
		step{"cable-a12", dev("BB-01", 1)})
	routeAGG12 = route(
		step{"cable-b01", pnl("PANEL-DR", 1, "front")}, step{"", pnl("PANEL-DR", 1, "rear")},
		step{"cable-b02", hdf("HDF-01", "3C", 2, "rear")}, step{"", hdf("HDF-01", "3C", 2, "front")},
		step{"cable-b03", hdf("HDF-02", "2B", 6, "front")}, step{"", hdf("HDF-02", "2B", 6, "rear")},
		step{"cable-b04", dev("AGG-12", 1)})
)

// assertRoute compares the exact ordered hop sequence: 4 cables and 3 bridges.
func assertRoute(t *testing.T, x index, got pathfinding.Route, start end, want []step) {
	t.Helper()
	from := x.endpoint(start)
	if got.Start != from || got.End != x.endpoint(want[len(want)-1].to) {
		t.Fatalf("route runs %s → %s, want %s → %s", got.Start, got.End, from, x.endpoint(want[len(want)-1].to))
	}
	if len(got.Hops) != len(want) || len(want) != 7 {
		t.Fatalf("%d hops, want 7 (4 cables + 3 bridges)", len(got.Hops))
	}
	cableHops, bridgeHops := 0, 0
	for i, hop := range got.Hops {
		to := x.endpoint(want[i].to)
		if hop.From != from || hop.To != to {
			t.Fatalf("hop %d goes %s → %s, want %s → %s", i, hop.From, hop.To, from, to)
		}
		if want[i].cable == "" {
			if hop.Kind != "internal" {
				t.Fatalf("hop %d must be an internal bridge, got %s", i, hop.Kind)
			}
			bridgeHops++
		} else {
			if hop.Kind != "cable" || hop.LinkID != want[i].cable {
				t.Fatalf("hop %d is %s %s, want cable %s", i, hop.Kind, hop.LinkID, want[i].cable)
			}
			cableHops++
		}
		from = to
	}
	if cableHops != 4 || bridgeHops != 3 {
		t.Fatalf("%d cables / %d bridges, want 4 / 3", cableHops, bridgeHops)
	}
}

func trace(t *testing.T, x index, req pathfinding.Request) pathfinding.Result {
	t.Helper()
	r, err := pathfinding.Trace(x.s, req)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

// Find AGG / BB from EDGE-17 returns AGG-03, AGG-08, and BB-01 with the exact
// hop sequences from the doc (4 cables and 3 bridges each).
func TestDistributionFromEDGE17ReachesAGG03AGG08AndBB01(t *testing.T) {
	x := newIndex(t)
	r := trace(t, x, pathfinding.Request{Mode: "distribution", Device: x.equipment("EDGE-17").ID})
	if r.Status != "reached" || len(r.Routes) != 3 {
		t.Fatalf("want 3 routes, got %d (%s)", len(r.Routes), r.Status)
	}
	assertRoute(t, x, r.Routes[0], dev("EDGE-17", 1), routeAGG03)
	assertRoute(t, x, r.Routes[1], dev("EDGE-17", 2), routeAGG08)
	assertRoute(t, x, r.Routes[2], dev("EDGE-17", 3), routeBB01)
	for i, role := range []string{"aggregation", "aggregation", "backbone"} {
		if r.Routes[i].DestinationRole != role {
			t.Fatalf("route %d role = %s, want %s", i, r.Routes[i].DestinationRole, role)
		}
	}
}

func TestExactStartingPortSearchesOnlyItsOwnRoute(t *testing.T) {
	x := newIndex(t)
	r := trace(t, x, pathfinding.Request{Mode: "distribution", Start: x.endpoint(dev("EDGE-17", 1))})
	if len(r.Routes) != 1 {
		t.Fatalf("port 1 alone must return its own route only, got %d", len(r.Routes))
	}
	assertRoute(t, x, r.Routes[0], dev("EDGE-17", 1), routeAGG03)
}

func TestReverseTraceFromAGG03ToEDGE17(t *testing.T) {
	x := newIndex(t)
	r := trace(t, x, pathfinding.Request{Mode: "point_to_point", Start: x.endpoint(dev("AGG-03", 1)), End: x.endpoint(dev("EDGE-17", 1))})
	if len(r.Routes) != 1 || len(r.Routes[0].Hops) != 7 {
		t.Fatalf("unexpected reverse route: %+v", r.Routes)
	}
	forward := trace(t, x, pathfinding.Request{Mode: "point_to_point", Start: x.endpoint(dev("EDGE-17", 1)), End: x.endpoint(dev("AGG-03", 1))})
	for i, hop := range r.Routes[0].Hops {
		f := forward.Routes[0].Hops[6-i]
		if hop.LinkID != f.LinkID || hop.From != f.To || hop.To != f.From || hop.Kind != f.Kind {
			t.Fatalf("hop %d is not the mirror of the forward route", i)
		}
	}
}

// The BB route is physically continuous with the exact doc sequence, by exact
// port-to-port trace (distribution discovery of it is tested above).
func TestEDGE17Port3IsPhysicallyContinuousToBB01(t *testing.T) {
	x := newIndex(t)
	r := trace(t, x, pathfinding.Request{Mode: "point_to_point", Start: x.endpoint(dev("EDGE-17", 3)), End: x.endpoint(dev("BB-01", 1))})
	if len(r.Routes) != 1 {
		t.Fatalf("got %d routes", len(r.Routes))
	}
	assertRoute(t, x, r.Routes[0], dev("EDGE-17", 3), routeBB01)
}

func TestEDGE22ReachesAGG12OverDifferentPositionsOfTheSameSubpanels(t *testing.T) {
	x := newIndex(t)
	r := trace(t, x, pathfinding.Request{Mode: "distribution", Device: x.equipment("EDGE-22").ID})
	if len(r.Routes) != 1 {
		t.Fatalf("want exactly the AGG-12 route, got %d", len(r.Routes))
	}
	assertRoute(t, x, r.Routes[0], dev("EDGE-22", 1), routeAGG12)
	// The circuits never become internally adjacent: no endpoint is shared.
	seen := map[string]bool{}
	for _, hop := range r.Routes[0].Hops {
		seen[hop.From], seen[hop.To] = true, true
	}
	a := trace(t, x, pathfinding.Request{Mode: "distribution", Device: x.equipment("EDGE-17").ID})
	for _, route := range a.Routes {
		for _, hop := range route.Hops {
			if seen[hop.From] || seen[hop.To] {
				t.Fatalf("Network A and B routes share endpoint %s/%s", hop.From, hop.To)
			}
		}
	}
}

func TestAGG15IsNeverReached(t *testing.T) {
	x := newIndex(t)
	agg15 := x.equipment("AGG-15")
	ports := map[string]bool{}
	for _, p := range x.s.Endpoints {
		if p.EquipmentID == agg15.ID {
			ports[p.ID] = true
		}
	}
	for _, l := range x.s.Links {
		if ports[l.A] || ports[l.B] {
			t.Fatalf("AGG-15 must have no cable: %+v", l)
		}
	}
	for _, e := range x.s.Equipment {
		if e.Kind != "switch" {
			continue
		}
		r := trace(t, x, pathfinding.Request{Mode: "distribution", Device: e.ID})
		for _, route := range r.Routes {
			if ports[route.End] {
				t.Fatalf("%s reached AGG-15 via %+v", e.Name, route)
			}
		}
	}
}

func TestFixtureIDsAreStableAndIndependentOfLabels(t *testing.T) {
	a, b := acceptance.Installed(), acceptance.Installed()
	if fmt.Sprint(a) != fmt.Sprint(b) {
		t.Fatal("the fixture must be deterministic")
	}
	seen := map[string]bool{}
	ids := func(kind string, id string) {
		key := kind + "/" + id
		if id == "" || seen[key] {
			t.Fatalf("empty or duplicate %s ID %q", kind, id)
		}
		seen[key] = true
	}
	for _, e := range a.Equipment {
		ids("equipment", e.ID)
		if strings.TrimSpace(e.Name) == "" {
			t.Fatal("equipment needs a display name")
		}
	}
}
