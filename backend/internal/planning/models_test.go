package planning_test

import (
	"errors"
	"strings"
	"testing"

	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func goodModel() planning.SwitchModel {
	one := 1
	return planning.SwitchModel{Name: " C9300-48P ", Manufacturer: "Cisco", Height: 1, PortGroups: []planning.PortGroupInput{
		{Count: 48, Names: "Gi1/0/{n}", Start: &one, Details: &planning.PortGroupDetails{PortType: "copper", Connector: "RJ45", Speed: "1G"}},
		{Count: 4, Names: "Te1/1/{n}", Start: &one, Details: &planning.PortGroupDetails{PortType: "fiber", Connector: "SFP+", Speed: "10G"}},
	}}
}

func TestValidateSwitchModelAcceptsAndTrims(t *testing.T) {
	m := goodModel()
	if err := planning.ValidateSwitchModel(&m); err != nil {
		t.Fatal(err)
	}
	if m.Name != "C9300-48P" {
		t.Fatalf("name must be trimmed: %q", m.Name)
	}
}

func TestValidateSwitchModelRefusesWithAddEquipmentMessages(t *testing.T) {
	for _, c := range []struct {
		label string
		edit  func(*planning.SwitchModel)
		want  string
	}{
		{"empty name", func(m *planning.SwitchModel) { m.Name = "  " }, "model name must contain 1–100 characters"},
		{"101 characters", func(m *planning.SwitchModel) { m.Name = strings.Repeat("é", 101) }, "model name must contain 1–100 characters"},
		{"long manufacturer", func(m *planning.SwitchModel) { m.Manufacturer = strings.Repeat("x", 201) }, "manufacturer must contain 0–200 characters"},
		{"height 0", func(m *planning.SwitchModel) { m.Height = 0 }, "C9300-48P: height must be 1–10 U"},
		{"height 11", func(m *planning.SwitchModel) { m.Height = 11 }, "C9300-48P: height must be 1–10 U"},
		{"no groups", func(m *planning.SwitchModel) { m.PortGroups = nil }, "C9300-48P: 1–8 port groups, not 0"},
		{"9 groups", func(m *planning.SwitchModel) {
			m.PortGroups = nil
			for range 9 {
				m.PortGroups = append(m.PortGroups, planning.PortGroupInput{Count: 1, Names: "P{n}"})
			}
		}, "C9300-48P: 1–8 port groups, not 9"},
		{"97 ports", func(m *planning.SwitchModel) { m.PortGroups = []planning.PortGroupInput{{Count: 97, Names: "P{n}"}} }, "C9300-48P: a switch has 1–96 ports, not 97"},
		{"no {n}", func(m *planning.SwitchModel) { m.PortGroups[1].Names = "Te1/1/" }, "C9300-48P: port group 2: Names must contain {n} once"},
		{"labels", func(m *planning.SwitchModel) {
			m.PortGroups = []planning.PortGroupInput{{Labels: []string{"A", "B"}}}
		}, "C9300-48P: port group 1: a model's groups use Count and Names, not Labels"},
	} {
		t.Run(c.label, func(t *testing.T) {
			m := goodModel()
			c.edit(&m)
			err := planning.ValidateSwitchModel(&m)
			if !errors.Is(err, topology.ErrInvalidInput) || err.Error() != c.want {
				t.Fatalf("got %v, want invalid input %q", err, c.want)
			}
		})
	}
}
