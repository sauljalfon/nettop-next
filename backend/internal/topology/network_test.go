package topology

import "testing"

// D01–D03: active equipment belongs to exactly one existing network; passive
// equipment has no exclusive membership; roles are fixed by kind.
func TestNetworkMembershipAndRoles(t *testing.T) {
	withPanel := func() Snapshot {
		s := validSnapshot()
		s.Equipment = append(s.Equipment, Equipment{ID: "p", Kind: "panel", Role: "passive", RackID: "r", Unit: 3, Height: 1})
		return s
	}
	if err := Validate(withPanel()); err != nil {
		t.Fatalf("valid network snapshot rejected: %v", err)
	}
	for _, role := range []string{"access", "aggregation", "backbone"} {
		s := withPanel()
		s.Equipment[0].Role = role
		if err := Validate(s); err != nil {
			t.Errorf("switch role %s rejected: %v", role, err)
		}
	}
	cases := map[string]func(*Snapshot){
		"switch without network":         func(s *Snapshot) { s.Equipment[0].NetworkID = "" },
		"switch with unknown network":    func(s *Snapshot) { s.Equipment[0].NetworkID = "missing" },
		"panel with network":             func(s *Snapshot) { s.Equipment[2].NetworkID = "net" },
		"duplicate network":              func(s *Snapshot) { s.Networks = append(s.Networks, s.Networks[0]) },
		"empty network id":               func(s *Snapshot) { s.Networks[0].ID = "" },
		"blank network name":             func(s *Snapshot) { s.Networks[0].Name = " " },
		"switch with passive role":       func(s *Snapshot) { s.Equipment[0].Role = "passive" },
		"switch with empty role":         func(s *Snapshot) { s.Equipment[0].Role = "" },
		"switch with unknown role":       func(s *Snapshot) { s.Equipment[0].Role = "core" },
		"panel with active role":         func(s *Snapshot) { s.Equipment[2].Role = "aggregation" },
		"panel with backbone role":       func(s *Snapshot) { s.Equipment[2].Role = "backbone" },
		"no networks defined for switch": func(s *Snapshot) { s.Networks = nil },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			s := withPanel()
			s.Networks = append([]Network{}, s.Networks...)
			s.Equipment = append([]Equipment{}, s.Equipment...)
			mutate(&s)
			if Validate(s) == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestRolesAreNeverInferredFromNames(t *testing.T) {
	s := validSnapshot()
	s.Equipment[0].Name = "AGG-99"
	s.Equipment[0].Role = "access"
	if err := Validate(s); err != nil {
		t.Fatalf("name must not influence role validation: %v", err)
	}
}

func TestSharedNetworkAcrossDevicesIsOneMembershipEach(t *testing.T) {
	s := validSnapshot()
	s.Networks = append(s.Networks, Network{ID: "other", Name: "Other"})
	s.Equipment[1].NetworkID = "other"
	if err := Validate(s); err != nil {
		t.Fatalf("devices in different networks must validate: %v", err)
	}
}
