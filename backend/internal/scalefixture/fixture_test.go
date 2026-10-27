package scalefixture

import (
	"encoding/json"
	"fmt"
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
		t.Errorf("sites: %d, want a main site and two small ones", len(s.Sites))
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
	between("racks", len(s.Racks), 280, 330)
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
	between("switches", switches, 1400, 1600)
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

// isPair: two AGGs of one pair, agg-(2p+1) and agg-(2p+2), on one network.
func isPair(s topology.Snapshot, ids []string) bool {
	if len(ids) != 2 {
		return false
	}
	var a, b int
	if _, err := fmt.Sscanf(ids[0], "agg-%d", &a); err != nil {
		return false
	}
	if _, err := fmt.Sscanf(ids[1], "agg-%d", &b); err != nil {
		return false
	}
	return a%2 == 1 && b == a+1 && networkOfEquipment(s, ids[0]) == networkOfEquipment(s, ids[1])
}

func networkOfEquipment(s topology.Snapshot, id string) string {
	for _, e := range s.Equipment {
		if e.ID == id {
			return e.NetworkID
		}
	}
	return ""
}

// faulty are the deliberate faults; every other access switch is dual-homed.
var faulty = map[string]bool{
	"acc-b04-r2-s1": true, "acc-b04-r2-s2": true, "acc-b05-r3-s4": true, "acc-b06-r1-s6": true,
	"acc-b07-r4-s6": true, "acc-b08-r2-s3": true, "acc-b09-r1-s5": true, "acc-b09-r1-s6": true,
	"acc-b10-r5-s6": true, "acc-b11-r1-s1": true, "acc-b13-r3-s2": true,
}

// Every access switch has two uplinks, to the two AGGs of one pair of its own
// network, and a building's switches on one network share that pair (one rack
// of Building 16 is the deliberate exception).
func TestAccessSwitchesAreDualHomedToOnePairPerBuilding(t *testing.T) {
	s := Campus()
	pairOf := map[string]string{} // building and network → the pair
	checked := 0
	for i, e := range s.Equipment {
		if e.Kind != "switch" || e.Role != "access" || faulty[e.ID] || i%17 != 0 {
			continue
		}
		own, other := uplinks(t, s, e.ID)
		if !isPair(s, own) || len(other) != 0 {
			t.Fatalf("%s: own %v, other %v, want one AGG pair", e.ID, own, other)
		}
		if networkOfEquipment(s, own[0]) != e.NetworkID {
			t.Fatalf("%s on %s reaches %v of another network", e.ID, e.NetworkID, own)
		}
		if strings.HasPrefix(e.ID, "acc-b16-r5-") {
			continue
		}
		key := e.RackID[:len("rack-b00")] + e.NetworkID
		if p, ok := pairOf[key]; ok && p != own[0] {
			t.Fatalf("%s: pair of %s, its building's other switches use %s", e.ID, own[0], p)
		}
		pairOf[key] = own[0]
		checked++
	}
	if checked < 60 {
		t.Fatalf("only %d access switches checked", checked)
	}
}

// A building has one main network (racks 1–5) and a second one (racks 6–7).
func TestABuildingHoldsTwoNetworks(t *testing.T) {
	s := Campus()
	networks := map[string]map[string]bool{}
	for _, e := range s.Equipment {
		if e.Role != "access" || !strings.HasPrefix(e.ID, "acc-b") {
			continue
		}
		b := e.ID[:len("acc-b00")]
		if networks[b] == nil {
			networks[b] = map[string]bool{}
		}
		networks[b][e.NetworkID] = true
	}
	for b, n := range networks {
		if len(n) != 2 {
			t.Errorf("%s: %d networks, want 2", b, len(n))
		}
	}
}

// Every AGG is cabled to both BBs of its network and to the other AGG of its
// pair; AGG-60 misses its second BB (a deliberate fault).
func TestEveryAggUplinksToBothBackbonesAndItsPair(t *testing.T) {
	s := Campus()
	owner := map[string]string{}
	for _, ep := range s.Endpoints {
		owner[ep.ID] = ep.EquipmentID
	}
	peers := map[string]map[string]bool{}
	for _, l := range s.Links {
		a, b := owner[l.A], owner[l.B]
		if l.Kind != "cable" || a == "" || b == "" {
			continue
		}
		for _, x := range [][2]string{{a, b}, {b, a}} {
			if peers[x[0]] == nil {
				peers[x[0]] = map[string]bool{}
			}
			peers[x[0]][x[1]] = true
		}
	}
	aggs := 0
	for _, e := range s.Equipment {
		if e.Role != "aggregation" {
			continue
		}
		aggs++
		var n int
		fmt.Sscanf(e.ID, "agg-%d", &n)
		pair := fmt.Sprintf("agg-%02d", n+1)
		if n%2 == 0 {
			pair = fmt.Sprintf("agg-%02d", n-1)
		}
		if !peers[e.ID][pair] {
			t.Errorf("%s: no cable to %s", e.ID, pair)
		}
		bbs := 0
		for p := range peers[e.ID] {
			if strings.HasPrefix(p, "bb-") {
				if networkOfEquipment(s, p) != e.NetworkID {
					t.Errorf("%s: cabled to %s of another network", e.ID, p)
				}
				bbs++
			}
		}
		want := 2
		if e.ID == "agg-60" {
			want = 1
		}
		if bbs != want {
			t.Errorf("%s: %d BBs, want %d", e.ID, bbs, want)
		}
	}
	if aggs != 60 {
		t.Errorf("AGGs: %d, want 60", aggs)
	}
}

// A few deliberate faults, so the hierarchy and the Problems list show some.
func TestTheCampusHasAFewDeliberateFaults(t *testing.T) {
	s := Campus()
	for _, id := range []string{"acc-b04-r2-s1", "acc-b04-r2-s2", "acc-b05-r3-s4", "acc-b06-r1-s6"} {
		if own, other := uplinks(t, s, id); len(own) != 1 || len(other) != 0 {
			t.Errorf("single %s: own %v, other %v", id, own, other)
		}
	}
	for _, id := range []string{"acc-b07-r4-s6", "acc-b08-r2-s3", "acc-b09-r1-s5", "acc-b09-r1-s6", "acc-b10-r5-s6", "acc-b11-r1-s1"} {
		if own, other := uplinks(t, s, id); len(own) != 0 || len(other) != 0 {
			t.Errorf("chained or no uplink %s: own %v, other %v", id, own, other)
		}
	}
	if own, other := uplinks(t, s, "acc-b13-r3-s2"); len(own) != 0 || len(other) != 1 {
		t.Errorf("other network: own %v, other %v", own, other)
	}
	// Chained: a cable to a sibling switch in the same rack; no uplink: no cable at all.
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
	for child, parent := range map[string]string{
		"acc-b07-r4-s6": "acc-b07-r4-s5", "acc-b08-r2-s3": "acc-b08-r2-s2",
		"acc-b09-r1-s6": "acc-b09-r1-s5", "acc-b09-r1-s5": "acc-b09-r1-s4",
	} {
		if !slices.Contains(cabled[child], parent) {
			t.Errorf("%s is not chained under %s: %v", child, parent, cabled[child])
		}
	}
	for _, id := range []string{"acc-b10-r5-s6", "acc-b11-r1-s1"} {
		if len(cabled[id]) != 0 {
			t.Errorf("%s has cables %v, want none", id, cabled[id])
		}
	}
	// Split: one rack of Building 16 goes to another pair than the rest.
	a, _ := uplinks(t, s, "acc-b16-r1-s1")
	b, _ := uplinks(t, s, "acc-b16-r5-s1")
	if !isPair(s, a) || !isPair(s, b) || a[0] == b[0] {
		t.Errorf("Building 16 split: %v and %v, want two different pairs", a, b)
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
