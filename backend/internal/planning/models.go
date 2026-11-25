package planning

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"nettop.local/backend/internal/topology"
)

// Limits of a switch model.
const (
	MaxModelNameLength         = 100
	MaxModelManufacturerLength = 200
	MaxModelHeight             = 10
)

// SwitchModel is library data (D51), never topology: what a switch copies when
// it is added. Nothing links a switch to its model.
type SwitchModel struct {
	ID           string           `json:"id"`
	Name         string           `json:"name"`
	Manufacturer string           `json:"manufacturer"`
	Height       int              `json:"height"`
	PortGroups   []PortGroupInput `json:"portGroups"`
}

// modelError is a refusal written for people: its text is the whole message and
// it counts as topology.ErrInvalidInput (HTTP 422).
type modelError string

func (e modelError) Error() string        { return string(e) }
func (e modelError) Is(target error) bool { return target == topology.ErrInvalidInput }

// ValidateSwitchModel trims the model's text and checks it: a name of 1–100
// characters, a manufacturer of 0–200, a height of 1–10 U and 1–8 port groups
// of 1–96 ports in all, checked by add_equipment's own port group checker (so
// the messages are its messages, prefixed by the model's name). A model never
// has the labels form of a group.
func ValidateSwitchModel(m *SwitchModel) error {
	m.Name = strings.TrimSpace(m.Name)
	m.Manufacturer = strings.TrimSpace(m.Manufacturer)
	if n := utf8.RuneCountInString(m.Name); n < 1 || n > MaxModelNameLength {
		return modelError(fmt.Sprintf("model name must contain 1–%d characters", MaxModelNameLength))
	}
	if utf8.RuneCountInString(m.Manufacturer) > MaxModelManufacturerLength {
		return modelError(fmt.Sprintf("manufacturer must contain 0–%d characters", MaxModelManufacturerLength))
	}
	if m.Height < 1 || m.Height > MaxModelHeight {
		return modelError(fmt.Sprintf("%s: height must be 1–%d U", m.Name, MaxModelHeight))
	}
	if len(m.PortGroups) == 0 {
		return modelError(fmt.Sprintf("%s: 1–%d port groups, not 0", m.Name, MaxPortGroups))
	}
	for g, group := range m.PortGroups {
		if len(group.Labels) > 0 && group.Names == "" && group.Count == 0 && group.Start == nil {
			return modelError(fmt.Sprintf("%s: port group %d: a model's groups use Count and Names, not Labels", m.Name, g+1))
		}
	}
	if _, err := CheckPortGroups(m.Name, m.PortGroups); err != nil {
		return modelError(strings.TrimPrefix(err.Error(), ErrInvalid.Error()+": "))
	}
	return nil
}
