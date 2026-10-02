package planning

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"nettop.local/backend/internal/topology"
)

var ErrInvalid = errors.New("invalid plan command")

type EquipmentInput struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Role      string `json:"role"`
	RackID    string `json:"rackId"`
	Unit      int    `json:"unit"`
	Height    int    `json:"height"`
	PortCount int    `json:"portCount"`
}
type CableInput struct {
	A string `json:"a"`
	B string `json:"b"`
}
type PlacementInput struct {
	EquipmentID string `json:"equipmentId"`
	RackID      string `json:"rackId"`
	Unit        int    `json:"unit"`
}
type Command struct {
	Type             string          `json:"type"`
	ExpectedRevision string          `json:"expectedRevision"`
	Equipment        *EquipmentInput `json:"equipment,omitempty"`
	Cable            *CableInput     `json:"cable,omitempty"`
	Placement        *PlacementInput `json:"placement,omitempty"`
}

// Execute is independent of storage. id is allocated by the application boundary
// and shared by all endpoints of an equipment addition before it is persisted.
func Execute(base topology.Snapshot, p Plan, c Command, id string) (Plan, error) {
	invalid := func(message string) (Plan, error) { return Plan{}, fmt.Errorf("%w: %s", ErrInvalid, message) }
	if c.ExpectedRevision == "" {
		return invalid("expectedRevision is required")
	}
	if c.ExpectedRevision != p.Revision {
		return Plan{}, fmt.Errorf("%w: this draft changed; refresh before trying again", ErrConflict)
	}
	current, err := Apply(base, p)
	if err != nil {
		return Plan{}, err
	}
	next := p
	next.Equipment = slices.Clone(p.Equipment)
	next.Updates = slices.Clone(p.Updates)
	next.Endpoints = slices.Clone(p.Endpoints)
	next.Links = slices.Clone(p.Links)
	switch c.Type {
	case "add_equipment":
		if c.Equipment == nil || c.Cable != nil || c.Placement != nil {
			return invalid("add_equipment requires only an equipment payload")
		}
		e := *c.Equipment
		e.Name = strings.TrimSpace(e.Name)
		if len(e.Name) < 1 || len(e.Name) > 100 {
			return invalid("equipment name must contain 1–100 characters")
		}
		if e.PortCount < 1 || e.PortCount > 48 {
			return invalid("port count must be between 1 and 48")
		}
		if e.Unit < 1 || e.Unit > 100 || e.Height < 1 || e.Height > 100 {
			return invalid("rack unit and height must be between 1 and 100")
		}
		if (e.Kind == "switch" && e.Role != "access" && e.Role != "aggregation") || (e.Kind == "panel" && e.Role != "passive") || (e.Kind != "panel" && e.Kind != "switch") {
			return invalid("choose access/aggregation for a switch or passive for a panel")
		}
		for _, existing := range current.Equipment {
			if strings.EqualFold(existing.Name, e.Name) {
				return invalid("equipment name already exists in this topology")
			}
		}
		next.Equipment = append(next.Equipment, topology.Equipment{ID: id, Name: e.Name, Kind: e.Kind, Role: e.Role, RackID: e.RackID, Unit: e.Unit, Height: e.Height})
		for n := 1; n <= e.PortCount; n++ {
			portID := fmt.Sprintf("%s:p%d", id, n)
			if e.Kind == "switch" {
				next.Endpoints = append(next.Endpoints, topology.Endpoint{ID: portID, EquipmentID: id, Label: fmt.Sprintf("Port %d", n)})
				continue
			}
			for _, side := range []string{"front", "rear"} {
				next.Endpoints = append(next.Endpoints, topology.Endpoint{ID: portID + ":" + side, EquipmentID: id, Label: fmt.Sprintf("%d · %s", n, side), Position: n, Side: side})
			}
			next.Links = append(next.Links, topology.Link{ID: portID + ":bridge", A: portID + ":front", B: portID + ":rear", Kind: "internal"})
		}
	case "add_cable":
		if c.Cable == nil || c.Equipment != nil || c.Placement != nil {
			return invalid("add_cable requires only a cable payload")
		}
		a, b := c.Cable.A, c.Cable.B
		if a > b {
			a, b = b, a
		}
		next.Links = append(next.Links, topology.Link{ID: id, A: a, B: b, Kind: "cable"})
	case "move_equipment":
		if c.Placement == nil || c.Equipment != nil || c.Cable != nil {
			return invalid("move_equipment requires only a placement payload")
		}
		input := c.Placement
		if input.Unit < 1 || input.Unit > 100 {
			return invalid("starting rack unit must be between 1 and 100")
		}
		var updated topology.Equipment
		found := false
		for _, e := range current.Equipment {
			if e.ID == input.EquipmentID {
				updated = e
				found = true
				break
			}
		}
		if !found {
			return invalid("unknown equipment")
		}
		updated.RackID, updated.Unit = input.RackID, input.Unit
		if i := slices.IndexFunc(next.Equipment, func(e topology.Equipment) bool { return e.ID == input.EquipmentID }); i >= 0 {
			next.Equipment[i] = updated
		} else if i := slices.IndexFunc(next.Updates, func(e topology.Equipment) bool { return e.ID == input.EquipmentID }); i >= 0 {
			next.Updates[i] = updated
		} else {
			next.Updates = append(next.Updates, updated)
		}
	default:
		return invalid("supported commands are add_equipment, add_cable, and move_equipment")
	}
	if _, err := Apply(base, next); err != nil {
		return invalid(err.Error())
	}
	revision, err := strconv.ParseInt(p.Revision, 10, 64)
	if err != nil {
		return Plan{}, fmt.Errorf("invalid stored revision: %w", err)
	}
	next.Revision = strconv.FormatInt(revision+1, 10)
	return next, nil
}
