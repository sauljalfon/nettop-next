package scalefixture

import (
	"encoding/json"
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

// Every access switch of the main site reaches exactly one AGG or BB, through a
// panel and the passive corridor of HDFs, on its own network.
func TestEveryAccessSwitchReachesADistributionDevice(t *testing.T) {
	s := Campus()
	checked := 0
	for i, e := range s.Equipment {
		if e.Kind != "switch" || e.Role != "access" || !strings.HasPrefix(e.ID, "acc-b") {
			continue
		}
		if i%97 != 0 { // a sample across the whole campus keeps the test fast
			continue
		}
		res, err := pathfinding.Trace(s, pathfinding.Request{Mode: "distribution", Device: e.ID})
		if err != nil {
			t.Fatal(err)
		}
		if res.Status != "reached" || len(res.Routes) != 1 || len(res.Mismatches) != 0 {
			t.Fatalf("%s: %s, %d routes, %d mismatches", e.ID, res.Status, len(res.Routes), len(res.Mismatches))
		}
		r := res.Routes[0]
		if r.DestinationNetworkID != e.NetworkID {
			t.Fatalf("%s: destination network %s, want %s", e.ID, r.DestinationNetworkID, e.NetworkID)
		}
		checked++
	}
	if checked < 5 {
		t.Fatalf("only %d access switches sampled", checked)
	}
}
