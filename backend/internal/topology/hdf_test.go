package topology_test

import (
	"fmt"
	"strings"
	"testing"

	"nettop.local/backend/internal/sample"
	"nettop.local/backend/internal/topology"
)

// base has a 100U rack, two switches on one network, and room for HDFs.
func base() topology.Snapshot {
	return topology.Snapshot{
		Sites:     []topology.Site{{ID: "s", Name: "Campus"}},
		Nodes:     []topology.LocationNode{{ID: "n", Name: "Room", SiteID: "s"}},
		Racks:     []topology.Rack{{ID: "r", NodeID: "n", Units: 100}},
		Networks:  []topology.Network{{ID: "net", Name: "Net"}},
		Subpanels: []topology.Subpanel{},
		Equipment: []topology.Equipment{
			{ID: "sw1", Name: "SW1", Kind: "switch", Role: "access", NetworkID: "net", RackID: "r", Unit: 1, Height: 1},
			{ID: "sw2", Name: "SW2", Kind: "switch", Role: "aggregation", NetworkID: "net", RackID: "r", Unit: 2, Height: 1},
		},
		Endpoints: []topology.Endpoint{{ID: "sw1:p1", EquipmentID: "sw1"}, {ID: "sw1:p2", EquipmentID: "sw1"}, {ID: "sw2:p1", EquipmentID: "sw2"}},
		Links:     []topology.Link{},
	}
}

func withHDF(rows, height int) (topology.Snapshot, sample.HDFParts) {
	s := base()
	h := sample.HDF("hdf", "HDF-01", "r", 10, height, rows)
	h.AddTo(&s)
	return s, h
}

func mustValid(t *testing.T, s topology.Snapshot) {
	t.Helper()
	if err := topology.Validate(s); err != nil {
		t.Fatalf("expected a valid snapshot: %v", err)
	}
}

func mustReject(t *testing.T, s topology.Snapshot, why string) {
	t.Helper()
	if topology.Validate(s) == nil {
		t.Fatalf("accepted invalid snapshot: %s", why)
	}
}

func mustRejectWith(t *testing.T, s topology.Snapshot, substring, why string) {
	t.Helper()
	err := topology.Validate(s)
	if err == nil || !strings.Contains(err.Error(), substring) {
		t.Fatalf("%s: want an error mentioning %q, got %v", why, substring, err)
	}
}

// clone copies the slices a test may mutate.
func clone(s topology.Snapshot) topology.Snapshot {
	s.Equipment = append([]topology.Equipment{}, s.Equipment...)
	s.Subpanels = append([]topology.Subpanel{}, s.Subpanels...)
	s.Endpoints = append([]topology.Endpoint{}, s.Endpoints...)
	s.Links = append([]topology.Link{}, s.Links...)
	return s
}

func find[T any](items []T, match func(T) bool) int {
	for i, item := range items {
		if match(item) {
			return i
		}
	}
	panic("not found")
}

// D04: an N-row HDF has exactly 4N subpanels, 24N positions, 48N side endpoints.
func TestHDFCapacityScalesWithRows(t *testing.T) {
	for _, rows := range []int{1, 2, 4, 17, 32} {
		t.Run(fmt.Sprintf("%d rows", rows), func(t *testing.T) {
			s, h := withHDF(rows, 3)
			if len(h.Subpanels) != 4*rows || len(h.Endpoints) != 48*rows || len(h.Links) != 24*rows {
				t.Fatalf("builder capacity wrong: %d/%d/%d", len(h.Subpanels), len(h.Endpoints), len(h.Links))
			}
			mustValid(t, s)
		})
	}
}

func TestHDFRowAndColumnAreStructuredAndBounded(t *testing.T) {
	cases := map[string]func(*topology.Snapshot){
		"33 rows": func(s *topology.Snapshot) {
			*s, _ = withHDF(33, 3)
		},
		"row zero":         func(s *topology.Snapshot) { s.Subpanels[0].Row = 0 },
		"negative row":     func(s *topology.Snapshot) { s.Subpanels[0].Row = -1 },
		"column E":         func(s *topology.Snapshot) { s.Subpanels[3].Column = "E" },
		"lowercase column": func(s *topology.Snapshot) { s.Subpanels[0].Column = "a" },
		"empty column":     func(s *topology.Snapshot) { s.Subpanels[0].Column = "" },
		"duplicate row/column": func(s *topology.Snapshot) {
			s.Subpanels[1].Row, s.Subpanels[1].Column = s.Subpanels[0].Row, s.Subpanels[0].Column
		},
		"duplicate subpanel id": func(s *topology.Snapshot) { s.Subpanels[1].ID = s.Subpanels[0].ID },
		"empty subpanel id":     func(s *topology.Snapshot) { s.Subpanels[0].ID = "" },
		"missing column": func(s *topology.Snapshot) {
			s.Subpanels = s.Subpanels[:len(s.Subpanels)-1]
		},
		"row gap": func(s *topology.Snapshot) {
			for i := range s.Subpanels {
				if s.Subpanels[i].Row == 2 {
					s.Subpanels[i].Row = 3 // rows 1,3 without 2 (and a duplicate 3)
				}
			}
		},
		"subpanel on non-HDF equipment": func(s *topology.Snapshot) { s.Subpanels[0].EquipmentID = "sw1" },
		"subpanel with unknown owner":   func(s *topology.Snapshot) { s.Subpanels[0].EquipmentID = "missing" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			s, _ := withHDF(2, 3)
			mustValid(t, s) // the unmutated baseline must be valid
			s = clone(s)
			mutate(&s)
			mustReject(t, s, name)
		})
	}
}

func TestHDFWithoutSubpanelsIsIncomplete(t *testing.T) {
	s, _ := withHDF(1, 3)
	s = clone(s)
	s.Subpanels = nil
	mustReject(t, s, "HDF chassis with no grid")
}

func TestHDFEveryPositionNeedsBothSidesAndOneBridge(t *testing.T) {
	cases := map[string]func(*topology.Snapshot){
		"missing front endpoint": func(s *topology.Snapshot) {
			i := find(s.Endpoints, func(e topology.Endpoint) bool { return e.EquipmentID == "hdf" && e.Side == "front" })
			s.Endpoints = append(s.Endpoints[:i], s.Endpoints[i+1:]...)
		},
		"missing bridge": func(s *topology.Snapshot) {
			i := find(s.Links, func(l topology.Link) bool { return l.Kind == "internal" })
			s.Links = append(s.Links[:i], s.Links[i+1:]...)
		},
		"position seven": func(s *topology.Snapshot) {
			i := find(s.Endpoints, func(e topology.Endpoint) bool { return e.EquipmentID == "hdf" && e.Position == 6 })
			s.Endpoints[i].Position = 7
		},
		"position zero": func(s *topology.Snapshot) {
			i := find(s.Endpoints, func(e topology.Endpoint) bool { return e.EquipmentID == "hdf" && e.Position == 1 })
			s.Endpoints[i].Position = 0
		},
		"HDF endpoint without subpanel": func(s *topology.Snapshot) {
			i := find(s.Endpoints, func(e topology.Endpoint) bool { return e.EquipmentID == "hdf" })
			s.Endpoints[i].SubpanelID = ""
		},
		"HDF endpoint in unknown subpanel": func(s *topology.Snapshot) {
			i := find(s.Endpoints, func(e topology.Endpoint) bool { return e.EquipmentID == "hdf" })
			s.Endpoints[i].SubpanelID = "missing"
		},
		"switch endpoint with subpanel": func(s *topology.Snapshot) {
			s.Endpoints[0].SubpanelID = s.Subpanels[0].ID
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			s, _ := withHDF(1, 3)
			mustValid(t, s) // the unmutated baseline must be valid
			s = clone(s)
			mutate(&s)
			mustReject(t, s, name)
		})
	}
}

func TestHDFEndpointCannotBelongToAnotherChassisSubpanel(t *testing.T) {
	s, _ := withHDF(1, 3)
	other := sample.HDF("hdf2", "HDF-02", "r", 20, 3, 1)
	other.AddTo(&s)
	mustValid(t, s)
	s = clone(s)
	i := find(s.Endpoints, func(e topology.Endpoint) bool { return e.EquipmentID == "hdf2" })
	s.Endpoints[i].SubpanelID = s.Subpanels[0].ID // hdf's subpanel
	mustReject(t, s, "endpoint owned by hdf2 in an hdf subpanel")
}

func TestHDFIsPassiveAndSharedNotNetworkOwned(t *testing.T) {
	for name, mutate := range map[string]func(*topology.Equipment){
		"network membership": func(e *topology.Equipment) { e.NetworkID = "net" },
		"active role":        func(e *topology.Equipment) { e.Role = "aggregation" },
		"empty role":         func(e *topology.Equipment) { e.Role = "" },
	} {
		t.Run(name, func(t *testing.T) {
			s, _ := withHDF(1, 3)
			mustValid(t, s) // the unmutated baseline must be valid
			s = clone(s)
			mutate(&s.Equipment[find(s.Equipment, func(e topology.Equipment) bool { return e.ID == "hdf" })])
			mustReject(t, s, name)
		})
	}
}

// D05: a four-row HDF is 16 blocks, 96 positions, 192 endpoints, and is not
// truncated by the generic 48-position panel limit.
func TestFourRowHDFIsNotTruncatedByGenericPanelLimit(t *testing.T) {
	s, h := withHDF(4, 3)
	if len(h.Subpanels) != 16 || len(h.Endpoints) != 192 || len(h.Links) != 96 {
		t.Fatalf("four-row HDF has %d blocks / %d endpoints / %d positions", len(h.Subpanels), len(h.Endpoints), len(h.Links))
	}
	mustValid(t, s)
}

// D06: local numbering restarts per subpanel; uniqueness is scoped to the owner.
func TestLocalPositionNumberingRestartsPerSubpanel(t *testing.T) {
	s, h := withHDF(1, 3)
	mustValid(t, s)
	position1 := map[string]string{}
	for _, e := range h.Endpoints {
		if e.Position == 1 && e.Side == "front" {
			position1[e.SubpanelID] = e.ID
		}
	}
	if len(position1) != 4 {
		t.Fatalf("position 1 must exist once in each of the four subpanels, got %v", position1)
	}
	seen := map[string]bool{}
	for _, id := range position1 {
		if seen[id] {
			t.Fatal("endpoint identity shared across subpanels")
		}
		seen[id] = true
	}
	s = clone(s)
	i := find(s.Endpoints, func(e topology.Endpoint) bool {
		return e.SubpanelID == s.Subpanels[1].ID && e.Position == 1 && e.Side == "front"
	})
	s.Endpoints[i].SubpanelID = s.Subpanels[0].ID // now two front/1 endpoints in one subpanel
	mustReject(t, s, "duplicate position within one subpanel")
}

// D07: renaming display text changes no identity, cable, bridge, or validity.
func TestRenamingChassisAndLabelsDoesNotChangeIdentity(t *testing.T) {
	s, _ := withHDF(1, 3)
	s.Links = append(s.Links, topology.Link{ID: "c1", A: "sw1:p1", B: "hdf:sp-1C:5:f", Kind: "cable"})
	mustValid(t, s)
	renamed := clone(s)
	renamed.Equipment[find(renamed.Equipment, func(e topology.Equipment) bool { return e.ID == "hdf" })].Name = "Renamed"
	for i := range renamed.Endpoints {
		if renamed.Endpoints[i].EquipmentID == "hdf" {
			renamed.Endpoints[i].Label = "3C/5 renamed" // a misleading label must never be parsed
		}
	}
	mustValid(t, renamed)
	for i := range s.Subpanels {
		if s.Subpanels[i] != renamed.Subpanels[i] {
			t.Fatal("subpanel identity changed by a rename")
		}
	}
}

// D08: two circuits share one subpanel on different positions.
func TestNetworksShareOneSubpanelOnDifferentPositions(t *testing.T) {
	s, _ := withHDF(3, 3)
	s.Networks = append(s.Networks, topology.Network{ID: "other", Name: "Other"})
	s.Equipment = append(s.Equipment, topology.Equipment{ID: "swb", Name: "SWB", Kind: "switch", Role: "access", NetworkID: "other", RackID: "r", Unit: 3, Height: 1})
	s.Endpoints = append(s.Endpoints, topology.Endpoint{ID: "swb:p1", EquipmentID: "swb"})
	s.Links = append(s.Links,
		topology.Link{ID: "a-in", A: "sw1:p1", B: "hdf:sp-3C:5:f", Kind: "cable"},
		topology.Link{ID: "a-out", A: "hdf:sp-3C:5:r", B: "sw2:p1", Kind: "cable"},
		topology.Link{ID: "b-in", A: "swb:p1", B: "hdf:sp-3C:2:f", Kind: "cable"},
	)
	mustValid(t, s)
}

// D09: occupancy.
func TestHDFOccupancyRules(t *testing.T) {
	s, _ := withHDF(1, 3)
	front, rear := "hdf:sp-1A:1:f", "hdf:sp-1A:1:r"
	s.Links = append(s.Links, topology.Link{ID: "c1", A: "sw1:p1", B: front, Kind: "cable"})
	mustValid(t, s)

	opposite := clone(s)
	opposite.Links = append(opposite.Links, topology.Link{ID: "c2", A: "sw2:p1", B: rear, Kind: "cable"})
	mustValid(t, opposite) // the opposite side of the same position is independent

	second := clone(s)
	second.Links = append(second.Links, topology.Link{ID: "c2", A: "sw1:p2", B: front, Kind: "cable"})
	mustReject(t, second, "second external cable on an occupied side")

	duplicateSide := clone(s)
	duplicateSide.Endpoints = append(duplicateSide.Endpoints, topology.Endpoint{ID: "dup", EquipmentID: "hdf", SubpanelID: "hdf:sp-1A", Position: 1, Side: "front"})
	mustReject(t, duplicateSide, "duplicate same-side endpoint in one subpanel position")

	secondBridge := clone(s)
	secondBridge.Links = append(secondBridge.Links, topology.Link{ID: "b2", A: front, B: rear, Kind: "internal"})
	mustReject(t, secondBridge, "second bridge on one position")
}

// D10: identity of endpoints and cables is independent of argument order.
func TestSameEndpointAndDuplicateCableRejectedRegardlessOfOrder(t *testing.T) {
	s, _ := withHDF(1, 3)
	front := "hdf:sp-1A:1:f"
	same := clone(s)
	same.Links = append(same.Links, topology.Link{ID: "c", A: front, B: front, Kind: "cable"})
	mustReject(t, same, "cable with the same endpoint twice")
	for _, order := range [][2]string{{"sw1:p1", front}, {front, "sw1:p1"}} {
		dup := clone(s)
		dup.Links = append(dup.Links,
			topology.Link{ID: "c1", A: "sw1:p1", B: front, Kind: "cable"},
			topology.Link{ID: "c2", A: order[0], B: order[1], Kind: "cable"})
		mustReject(t, dup, fmt.Sprintf("duplicate unordered cable %v", order))
	}
}

// D11: internal continuity only between opposite sides of one position.
func TestInternalEdgeRequiresSamePositionAndSubpanel(t *testing.T) {
	cases := map[string][2]string{
		"different positions, same subpanel": {"hdf:sp-1A:1:f", "hdf:sp-1A:2:r"},
		"different subpanels, same position": {"hdf:sp-1A:1:f", "hdf:sp-1B:1:r"},
		"same side":                          {"hdf:sp-1A:1:f", "hdf:sp-1A:2:f"},
		"switch ports":                       {"sw1:p1", "sw1:p2"},
		"switch to HDF":                      {"sw1:p1", "hdf:sp-1A:1:f"},
	}
	for name, ends := range cases {
		t.Run(name, func(t *testing.T) {
			s, _ := withHDF(1, 3)
			mustValid(t, s) // the unmutated baseline must be valid
			s = clone(s)
			i := find(s.Links, func(l topology.Link) bool { return l.A == "hdf:sp-1A:1:f" })
			s.Links = append(s.Links[:i], s.Links[i+1:]...) // free the position so only continuity is under test
			s.Links = append(s.Links, topology.Link{ID: "bad", A: ends[0], B: ends[1], Kind: "internal"})
			mustRejectWith(t, s, "bridge", name)
		})
	}
	// Bridges across two different HDF chassis at the same position are invalid too.
	s, _ := withHDF(1, 3)
	other := sample.HDF("hdf2", "HDF-02", "r", 20, 3, 1)
	other.AddTo(&s)
	s = clone(s)
	s.Links = append(s.Links, topology.Link{ID: "x", A: "hdf:sp-1A:1:f", B: "hdf2:sp-1A:1:r", Kind: "internal"})
	mustRejectWith(t, s, "bridge", "bridge across chassis")

	// Isolated on a standard panel, where no grid-completeness rule applies.
	for name, ends := range map[string][2]string{
		"panel different positions": {"p:1:f", "p:2:r"},
		"panel same side":           {"p:1:f", "p:2:f"},
	} {
		t.Run(name, func(t *testing.T) {
			s := base()
			s.Equipment = append(s.Equipment, topology.Equipment{ID: "p", Name: "P", Kind: "panel", Role: "passive", RackID: "r", Unit: 5, Height: 1})
			s.Endpoints = append(s.Endpoints,
				topology.Endpoint{ID: "p:1:f", EquipmentID: "p", Position: 1, Side: "front"},
				topology.Endpoint{ID: "p:2:f", EquipmentID: "p", Position: 2, Side: "front"},
				topology.Endpoint{ID: "p:2:r", EquipmentID: "p", Position: 2, Side: "rear"})
			s.Links = append(s.Links, topology.Link{ID: "bad", A: ends[0], B: ends[1], Kind: "internal"})
			mustRejectWith(t, s, "bridge", name)
		})
	}
}

func TestStandardPanelsKeepWorkingWithoutSubpanels(t *testing.T) {
	s := base()
	s.Equipment = append(s.Equipment, topology.Equipment{ID: "p", Name: "P", Kind: "panel", Role: "passive", RackID: "r", Unit: 5, Height: 1})
	s.Endpoints = append(s.Endpoints,
		topology.Endpoint{ID: "p:1:f", EquipmentID: "p", Position: 1, Side: "front"},
		topology.Endpoint{ID: "p:1:r", EquipmentID: "p", Position: 1, Side: "rear"},
		topology.Endpoint{ID: "p:60:f", EquipmentID: "p", Position: 60, Side: "front"})
	s.Links = append(s.Links, topology.Link{ID: "b", A: "p:1:f", B: "p:1:r", Kind: "internal"})
	mustValid(t, s)
	withSubpanel := clone(s)
	withSubpanel.Endpoints[len(withSubpanel.Endpoints)-1].SubpanelID = "anything"
	mustReject(t, withSubpanel, "standard panel endpoint with a subpanel")
}

// D13: row count and rack height are independent fields.
func TestRowCountIsIndependentOfRackHeight(t *testing.T) {
	for _, tc := range []struct{ rows, height int }{{4, 1}, {1, 6}, {32, 2}, {2, 2}, {3, 100 - 9}} {
		t.Run(fmt.Sprintf("%d rows in %dU", tc.rows, tc.height), func(t *testing.T) {
			s, _ := withHDF(tc.rows, tc.height)
			mustValid(t, s)
			if got := s.Equipment[len(s.Equipment)-1].Height; got != tc.height {
				t.Fatalf("height changed to %d", got)
			}
		})
	}
	for name, mutate := range map[string]func(*topology.Equipment){
		"zero height":      func(e *topology.Equipment) { e.Height = 0 },
		"beyond rack top":  func(e *topology.Equipment) { e.Unit, e.Height = 99, 3 },
		"unit zero":        func(e *topology.Equipment) { e.Unit = 0 },
		"overlaps switch":  func(e *topology.Equipment) { e.Unit, e.Height = 1, 3 },
		"overflowing size": func(e *topology.Equipment) { e.Height = 1 << 62 },
	} {
		t.Run(name, func(t *testing.T) {
			s, _ := withHDF(2, 3)
			mustValid(t, s) // the unmutated baseline must be valid
			s = clone(s)
			mutate(&s.Equipment[find(s.Equipment, func(e topology.Equipment) bool { return e.ID == "hdf" })])
			mustReject(t, s, name)
		})
	}
}
