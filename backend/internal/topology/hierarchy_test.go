package topology

import "testing"

func TestHierarchyOwnership(t *testing.T) {
	s := validSnapshot()
	s.Sites = []Site{{ID: "site", Name: "Campus"}}
	s.Nodes = []LocationNode{{ID: "node", Name: "Room", SiteID: "site"}}
	s.Racks[0].NodeID = "node"
	if err := Validate(s); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		change func(*Snapshot)
	}{
		{"orphan rack", func(s *Snapshot) { s.Racks[0].NodeID = "missing" }},
		{"orphan node", func(s *Snapshot) { s.Nodes[0].SiteID = "missing" }},
		{"duplicate node", func(s *Snapshot) { s.Nodes = append(s.Nodes, s.Nodes[0]) }},
		{"duplicate site", func(s *Snapshot) { s.Sites = append(s.Sites, s.Sites[0]) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			copy := s
			copy.Sites = append([]Site{}, s.Sites...)
			copy.Nodes = append([]LocationNode{}, s.Nodes...)
			copy.Racks = append([]Rack{}, s.Racks...)
			tc.change(&copy)
			if Validate(copy) == nil {
				t.Fatal("invalid hierarchy accepted")
			}
		})
	}
}
