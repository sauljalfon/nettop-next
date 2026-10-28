package scalefixture

import (
	"encoding/json"
	"maps"
	"slices"
	"sort"
	"strings"
	"testing"

	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/topology"
)

// SC-01: the campus fixture is valid and deterministic, and has the shape the
// realistic-size check needs.
func TestCampusIsValid(t *testing.T) {
	if err := topology.Validate(Campus()); err != nil {
		t.Fatal(err)
	}
}

func TestCampusIsDeterministic(t *testing.T) {
	a, err := json.Marshal(Campus())
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(Campus())
	if string(a) != string(b) {
		t.Fatal("two builds of the campus differ")
	}
}

func TestCampusHasTheRealisticShape(t *testing.T) {
	s := Campus()
	between := func(name string, got, lo, hi int) {
		t.Helper()
		if got < lo || got > hi {
			t.Errorf("%s: %d, want %d–%d", name, got, lo, hi)
		}
	}
	if len(s.Networks) != 3 {
		t.Errorf("networks: %d, want 3", len(s.Networks))
	}
	nodesBySite := map[string]int{}
	for _, n := range s.Nodes {
		nodesBySite[n.SiteID]++
	}
	if len(s.Sites) != 3 {
		t.Errorf("sites: %d, want a main site and two annexes", len(s.Sites))
	}
	between("nodes in the main site", nodesBySite["site-campus"], 38, 42)
	racksByNode := map[string]int{}
	tall := 0
	for _, r := range s.Racks {
		racksByNode[r.NodeID]++
		if r.Units == 42 {
			tall++
		}
	}
	between("racks", len(s.Racks), 250, 330)
	if tall != len(s.Racks) {
		t.Errorf("every rack is 42U: %d of %d", tall, len(s.Racks))
	}
	between("racks in Main Distribution", racksByNode["node-main-distribution"], 38, 42)
	switches, hdf32 := 0, 0
	for _, e := range s.Equipment {
		if e.Kind == "switch" {
			switches++
		}
	}
	rows := map[string]int{}
	for _, sp := range s.Subpanels {
		rows[sp.EquipmentID] = max(rows[sp.EquipmentID], sp.Row)
	}
	for _, r := range rows {
		if r == 32 {
			hdf32++
		}
	}
	between("switches", switches, 1150, 1450)
	between("32-row HDFs", hdf32, 4, 12)
	cables := 0
	for _, l := range s.Links {
		if l.Kind == "cable" {
			cables++
		}
	}
	between("cables", cables, 3000, 12000)
}

func TestCampusNamesAreReadableAndClearlyFictional(t *testing.T) {
	s := Campus()
	if s.Revision != "campus-1" {
		t.Errorf("revision %q", s.Revision)
	}
	seen := map[string]bool{}
	for _, e := range s.Equipment {
		if seen[e.Name] {
			t.Fatalf("duplicate equipment name %s", e.Name)
		}
		seen[e.Name] = true
	}
	for _, n := range s.Nodes {
		if !strings.HasPrefix(n.ID, "node-") {
			t.Errorf("node ID %s", n.ID)
		}
	}
}

// uplinks is where a distribution search from the switch ends: the AGG or BB
// switches of its own network, and those of another network.
func uplinks(t *testing.T, s topology.Snapshot, id string) (own, other []string) {
	t.Helper()
	res, err := pathfinding.Trace(s, pathfinding.Request{Mode: "distribution", Device: id})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range res.Routes {
		own = append(own, r.DestinationEquipmentID)
	}
	for _, r := range res.Mismatches {
		other = append(other, r.DestinationEquipmentID)
	}
	sort.Strings(own)
	sort.Strings(other)
	return own, other
}

func networkOfEquipment(s topology.Snapshot, id string) string {
	for _, e := range s.Equipment {
		if e.ID == id {
			return e.NetworkID
		}
	}
	return ""
}

// cabledTo is, for every equipment, the equipment its cables reach directly.
func cabledTo(s topology.Snapshot) map[string][]string {
	owner := map[string]string{}
	for _, ep := range s.Endpoints {
		owner[ep.ID] = ep.EquipmentID
	}
	cabled := map[string][]string{}
	for _, l := range s.Links {
		if l.Kind == "cable" {
			cabled[owner[l.A]] = append(cabled[owner[l.A]], owner[l.B])
			cabled[owner[l.B]] = append(cabled[owner[l.B]], owner[l.A])
		}
	}
	return cabled
}

// accessByNode lists each node's access switches.
func accessByNode(s topology.Snapshot) map[string][]topology.Equipment {
	nodeOf := map[string]string{}
	for _, r := range s.Racks {
		nodeOf[r.ID] = r.NodeID
	}
	out := map[string][]topology.Equipment{}
	for _, e := range s.Equipment {
		if e.Role == "access" {
			out[nodeOf[e.RackID]] = append(out[nodeOf[e.RackID]], e)
		}
	}
	return out
}

// faulty are the deliberate faults and the switches with a second uplink.
var faulty = map[string]bool{
	"acc-b07-s6": true, "acc-b08-s3": true, "acc-b09-s5": true, "acc-b09-s6": true,
	"acc-b10-s6": true, "acc-b11-s1": true, "acc-b13-s2": true,
}

// A node outside Main Distribution holds 6 to 12 access switches; Main
// Distribution holds a few besides the AGGs and BBs.
func TestAccessNodesHoldSixToTwelveSwitches(t *testing.T) {
	s := Campus()
	for node, sw := range accessByNode(s) {
		lo, hi := 6, 12
		if node == "node-main-distribution" {
			lo, hi = 3, 12
		}
		if len(sw) < lo || len(sw) > hi {
			t.Errorf("%s: %d access switches, want %d–%d", node, len(sw), lo, hi)
		}
	}
}

// Most access switches have one uplink, to one AGG of their own network; a few
// have a second one; none has more.
func TestMostAccessSwitchesHaveOneUplink(t *testing.T) {
	s := Campus()
	one, sampled := 0, 0
	for i, e := range s.Equipment {
		if e.Role != "access" || faulty[e.ID] || i%11 != 0 {
			continue
		}
		sampled++
		own, other := uplinks(t, s, e.ID)
		if len(other) != 0 || len(own) == 0 || len(own) > 2 {
			t.Fatalf("%s: own %v, other %v", e.ID, own, other)
		}
		if networkOfEquipment(s, own[0]) != e.NetworkID {
			t.Fatalf("%s on %s reaches %v of another network", e.ID, e.NetworkID, own)
		}
		if len(own) == 1 {
			one++
		}
	}
	if sampled < 80 || one*10 < sampled*8 {
		t.Fatalf("%d of %d sampled switches have one uplink, want at least 80%%", one, sampled)
	}
}

// A node's switches on one network hang under one AGG, or under two AGGs cabled
// to each other (a pair); Building 16 is the deliberate split.
func TestANodeHangsUnderOneAggOrOnePair(t *testing.T) {
	s := Campus()
	cabled := cabledTo(s)
	pairs, singles := 0, 0
	byNode := accessByNode(s)
	for i, node := range slices.Sorted(maps.Keys(byNode)) {
		if i%3 != 0 || node == "node-building-16" || node == "node-main-distribution" {
			continue // a sample: a trace per switch is slow
		}
		sw := byNode[node]
		aggsOf := map[string]map[string]bool{}
		for _, e := range sw {
			if faulty[e.ID] {
				continue
			}
			own, _ := uplinks(t, s, e.ID)
			if aggsOf[e.NetworkID] == nil {
				aggsOf[e.NetworkID] = map[string]bool{}
			}
			for _, id := range own {
				if strings.HasPrefix(id, "agg-") {
					aggsOf[e.NetworkID][id] = true
				}
			}
		}
		for network, set := range aggsOf {
			ids := slices.Sorted(maps.Keys(set))
			switch {
			case len(ids) == 1:
				singles++
			case len(ids) == 2 && slices.Contains(cabled[ids[0]], ids[1]):
				pairs++
			default:
				t.Errorf("%s on %s hangs under %v", node, network, ids)
			}
		}
	}
	if pairs < 8 || singles < 8 {
		t.Errorf("%d nodes under a pair, %d under one AGG: want a mix", pairs, singles)
	}
	a, _ := uplinks(t, s, "acc-b16-s1")
	b, _ := uplinks(t, s, "acc-b16-s8")
	if len(a) == 0 || len(b) == 0 || slices.Equal(a, b) {
		t.Errorf("Building 16 split: %v and %v, want two different groups", a, b)
	}
}

// A few switches have a second uplink: to the other AGG of their pair, to a BB,
// or to a neighbouring switch. A few in Main Distribution go straight to a BB.
func TestSomeSwitchesHaveASecondUplink(t *testing.T) {
	s := Campus()
	cabled := cabledTo(s)
	if own, _ := uplinks(t, s, "acc-b01-s1"); len(own) != 2 || !slices.Contains(cabled[own[0]], own[1]) {
		t.Errorf("acc-b01-s1: %v, want both AGGs of its pair", own)
	}
	if own, _ := uplinks(t, s, "acc-b25-s1"); len(own) != 2 || !strings.HasPrefix(own[0], "agg-") || !strings.HasPrefix(own[1], "bb-") {
		t.Errorf("acc-b25-s1: %v, want an AGG and a BB", own)
	}
	if !slices.Contains(cabled["acc-b19-s12"], "acc-b19-s11") || !slices.ContainsFunc(cabled["acc-b19-s12"], func(id string) bool { return id != "acc-b19-s11" }) {
		t.Errorf("acc-b19-s12: cabled to %v, want its own corridor and acc-b19-s11", cabled["acc-b19-s12"])
	}
	for id, bb := range map[string]string{"acc-md-s2": "bb-01", "acc-md-s3": "bb-02", "acc-md-s5": "bb-03"} {
		if own, other := uplinks(t, s, id); !slices.Equal(own, []string{bb}) || len(other) != 0 {
			t.Errorf("%s: own %v, other %v, want only %s", id, own, other, bb)
		}
	}
}

// Some nodes hold a second network on their last switches (Main Distribution
// holds all three).
func TestSomeNodesHoldTwoNetworks(t *testing.T) {
	two := 0
	for node, sw := range accessByNode(Campus()) {
		if node == "node-main-distribution" {
			continue
		}
		networks := map[string]bool{}
		for _, e := range sw {
			networks[e.NetworkID] = true
		}
		if len(networks) > 2 {
			t.Errorf("%s: %d networks", node, len(networks))
		}
		if len(networks) == 2 {
			two++
		}
	}
	if two < 20 {
		t.Errorf("%d nodes hold two networks, want at least 20", two)
	}
}

// An AGG of a pair is cabled to its partner and to both BBs of its network; a
// single AGG to one BB; AGG-60 to none (a deliberate fault).
func TestAggsUplinkToTheirBackbones(t *testing.T) {
	s := Campus()
	cabled := cabledTo(s)
	aggs, inPairs := 0, 0
	for _, e := range s.Equipment {
		if e.Role != "aggregation" {
			continue
		}
		aggs++
		bbs, partner := 0, false
		for _, p := range cabled[e.ID] {
			if strings.HasPrefix(p, "bb-") {
				if networkOfEquipment(s, p) != e.NetworkID {
					t.Errorf("%s: cabled to %s of another network", e.ID, p)
				}
				bbs++
			}
			if strings.HasPrefix(p, "agg-") {
				partner = true
			}
		}
		want := 1
		if partner {
			want = 2
			inPairs++
		}
		if e.ID == "agg-60" {
			want = 0
		}
		if bbs != want {
			t.Errorf("%s: %d BBs, want %d", e.ID, bbs, want)
		}
	}
	if aggs != 60 || inPairs != 36 {
		t.Errorf("AGGs: %d, %d in pairs; want 60, 36", aggs, inPairs)
	}
}

// A few deliberate faults, so the hierarchy and the Problems list show some.
func TestTheCampusHasAFewDeliberateFaults(t *testing.T) {
	s := Campus()
	for _, id := range []string{"acc-b07-s6", "acc-b08-s3", "acc-b09-s5", "acc-b09-s6", "acc-b10-s6", "acc-b11-s1"} {
		if own, other := uplinks(t, s, id); len(own) != 0 || len(other) != 0 {
			t.Errorf("chained or no uplink %s: own %v, other %v", id, own, other)
		}
	}
	if own, other := uplinks(t, s, "acc-b13-s2"); len(own) != 0 || len(other) != 1 {
		t.Errorf("other network: own %v, other %v", own, other)
	}
	// Chained: a cable to a sibling switch; no uplink: no cable at all.
	cabled := cabledTo(s)
	for child, parent := range map[string]string{
		"acc-b07-s6": "acc-b07-s5", "acc-b08-s3": "acc-b08-s2",
		"acc-b09-s6": "acc-b09-s5", "acc-b09-s5": "acc-b09-s4",
	} {
		if !slices.Contains(cabled[child], parent) {
			t.Errorf("%s is not chained under %s: %v", child, parent, cabled[child])
		}
	}
	for _, id := range []string{"acc-b10-s6", "acc-b11-s1"} {
		if len(cabled[id]) != 0 {
			t.Errorf("%s has cables %v, want none", id, cabled[id])
		}
	}
}

// The data-entry rehearsal starts from an installed root that holds only the
// campus's three networks.
func TestEmptyIsValidAndHoldsOnlyTheNetworks(t *testing.T) {
	s := Empty()
	if err := topology.Validate(s); err != nil {
		t.Fatal(err)
	}
	if len(s.Networks) != 3 {
		t.Errorf("networks: %d, want 3", len(s.Networks))
	}
	if n := len(s.Sites) + len(s.Nodes) + len(s.Racks) + len(s.Equipment) + len(s.Endpoints) + len(s.Links) + len(s.Subpanels); n != 0 {
		t.Errorf("%d objects, want none", n)
	}
}
