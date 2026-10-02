package topology

import "testing"

func validSnapshot() Snapshot {
	return Snapshot{Sites: []Site{{ID: "site", Name: "Campus"}}, Nodes: []LocationNode{{ID: "node", Name: "Room", SiteID: "site"}}, Racks: []Rack{{ID: "r", NodeID: "node", Units: 12}}, Equipment: []Equipment{{ID: "a", Kind: "switch", RackID: "r", Unit: 1, Height: 1}, {ID: "b", Kind: "switch", RackID: "r", Unit: 2, Height: 1}}, Endpoints: []Endpoint{{ID: "a1", EquipmentID: "a"}, {ID: "b1", EquipmentID: "b"}}, Links: []Link{{ID: "c", A: "a1", B: "b1", Kind: "cable"}}}
}

func TestValidate(t *testing.T) {
	if err := Validate(validSnapshot()); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*Snapshot){
		"duplicate equipment": func(s *Snapshot) { s.Equipment = append(s.Equipment, s.Equipment[0]) },
		"unknown endpoint":    func(s *Snapshot) { s.Links[0].B = "missing" },
		"self link":           func(s *Snapshot) { s.Links[0].B = "a1" },
		"occupied endpoint": func(s *Snapshot) {
			s.Endpoints = append(s.Endpoints, Endpoint{ID: "b2", EquipmentID: "b"})
			s.Links = append(s.Links, Link{ID: "c2", A: "a1", B: "b2", Kind: "cable"})
		},
		"switch internal bridge":     func(s *Snapshot) { s.Links[0].Kind = "internal" },
		"overlapping rack placement": func(s *Snapshot) { s.Equipment[1].Unit = 1 },
		"outside rack":               func(s *Snapshot) { s.Equipment[1].Unit = 13 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			s := validSnapshot()
			mutate(&s)
			if Validate(s) == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}
