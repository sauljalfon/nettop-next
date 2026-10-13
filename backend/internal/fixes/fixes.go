// Package fixes applies direct fixes to installed data: names and detail
// fields, never topology (locked decision 10). It is pure: the caller loads
// the installed snapshot, applies the fix, and writes the result and the
// change log in one transaction. A fix never changes the topology revision.
package fixes

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"nettop.local/backend/internal/topology"
)

// Kinds of installed objects a fix can change; change_log.entity_kind uses them.
const (
	Equipment = "equipment"
	Endpoint  = "endpoint"
	Link      = "link"
	Site      = "site"
	Node      = "node"
	Rack      = "rack"
)

// MaxNote is the longest note on a fix, in characters.
const MaxNote = 500

// ErrNotFound: no installed object of that kind has that ID (404).
var ErrNotFound = errors.New("not found")

// Fix is one correction to one installed object. Name is the display name (a
// switch port's label for an endpoint); nil leaves it. Details sets the given
// fields; an empty string clears one.
type Fix struct {
	Kind    string
	ID      string
	Name    *string
	Details topology.Details
	Note    string
}

// Change is one field whose value the fix changed.
type Change struct {
	Field    string `json:"field"`
	OldValue string `json:"oldValue"`
	NewValue string `json:"newValue"`
}

// Entry is one change_log row.
type Entry struct {
	ID         int64     `json:"id"`
	At         time.Time `json:"at"`
	EntityKind string    `json:"entityKind"`
	EntityID   string    `json:"entityId"`
	Field      string    `json:"field"`
	OldValue   string    `json:"oldValue"`
	NewValue   string    `json:"newValue"`
	Note       string    `json:"note,omitempty"`
}

// order is the order changes are listed in: the name, then the detail fields
// in the order of topology.Details.Fields.
var order = []string{"name", "manufacturer", "model", "serialNumber", "ipAddress", "status", "description",
	"portType", "connector", "speed", "state", "label", "notes", "location", "rackType"}

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", topology.ErrInvalidInput, fmt.Sprintf(format, args...))
}
func duplicate(format string, args ...any) error {
	return fmt.Errorf("%w: %s", topology.ErrDuplicateName, fmt.Sprintf(format, args...))
}

// checkName reports whether a trimmed name has 1–max characters.
func checkName(name string, max int) error {
	if n := utf8.RuneCountInString(name); n < 1 || n > max {
		return invalid("a name must be 1–%d characters", max)
	}
	return nil
}

func setDetails(d topology.Details, set func(topology.DetailField) bool, who string) error {
	for _, f := range d.Fields() {
		if !set(f) {
			return invalid("%s: %s does not apply here", who, topology.DetailWord(f.Name))
		}
	}
	return nil
}

func diff(before, after map[string]string) []Change {
	var out []Change
	for _, k := range order {
		if b, ok := before[k]; ok && b != after[k] {
			out = append(out, Change{Field: k, OldValue: b, NewValue: after[k]})
		}
	}
	return out
}

func equipmentValues(e topology.Equipment) map[string]string {
	return map[string]string{"name": e.Name, "manufacturer": e.Manufacturer, "model": e.Model, "serialNumber": e.SerialNumber,
		"ipAddress": e.IPAddress, "status": e.Status, "description": e.Description}
}
func endpointValues(p topology.Endpoint) map[string]string {
	return map[string]string{"name": p.Label, "portType": p.PortType, "connector": p.Connector, "speed": p.Speed,
		"state": p.State, "description": p.Description}
}
func linkValues(l topology.Link) map[string]string {
	return map[string]string{"label": l.Label, "status": l.Status, "notes": l.Notes}
}
func placeValues(name, location, description string) map[string]string {
	return map[string]string{"name": name, "location": location, "description": description}
}

// Apply returns s with the fix applied and the fields it changed, in a fixed
// order (none when every value is already the one asked for). It never
// mutates s. Errors wrap ErrNotFound, topology.ErrDuplicateName or
// topology.ErrInvalidInput and are written in names.
func Apply(s topology.Snapshot, f Fix) (topology.Snapshot, []Change, error) {
	if utf8.RuneCountInString(strings.TrimSpace(f.Note)) > MaxNote {
		return s, nil, invalid("a note has at most %d characters", MaxNote)
	}
	var name string
	if f.Name != nil {
		name = strings.TrimSpace(*f.Name)
	}
	notFound := fmt.Errorf("%w: %s %s", ErrNotFound, f.Kind, f.ID)
	var before, after map[string]string

	switch f.Kind {
	case Equipment:
		i := slices.IndexFunc(s.Equipment, func(e topology.Equipment) bool { return e.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Equipment = slices.Clone(s.Equipment)
		e := &s.Equipment[i]
		before = equipmentValues(*e)
		if f.Name != nil {
			if err := checkName(name, 100); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Equipment, func(x topology.Equipment) bool { return x.ID != f.ID && strings.EqualFold(x.Name, name) }) {
				return s, nil, duplicate("%s already exists", name)
			}
			e.Name = name
		}
		if err := setDetails(f.Details, e.SetDetail, e.Name); err != nil {
			return s, nil, err
		}
		after = equipmentValues(*e)

	case Endpoint:
		i := slices.IndexFunc(s.Endpoints, func(p topology.Endpoint) bool { return p.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Endpoints = slices.Clone(s.Endpoints)
		p := &s.Endpoints[i]
		owner := topology.Equipment{}
		if j := slices.IndexFunc(s.Equipment, func(e topology.Equipment) bool { return e.ID == p.EquipmentID }); j >= 0 {
			owner = s.Equipment[j]
		}
		who := owner.Name + " · " + p.Label
		before = endpointValues(*p)
		if f.Name != nil {
			if owner.Kind != "switch" {
				return s, nil, invalid("%s: positions of panels and HDFs are named by their place", who)
			}
			if p.Position == 0 {
				return s, nil, invalid("%s was saved before port positions; its order comes from its label, so it cannot be renamed", who)
			}
			if err := checkName(name, 64); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Endpoints, func(x topology.Endpoint) bool {
				return x.ID != f.ID && x.EquipmentID == p.EquipmentID && strings.EqualFold(x.Label, name)
			}) {
				return s, nil, duplicate("%s already has a port named %s", owner.Name, name)
			}
			p.Label = name
		}
		if err := setDetails(f.Details, p.SetDetail, who); err != nil {
			return s, nil, err
		}
		after = endpointValues(*p)

	case Link:
		i := slices.IndexFunc(s.Links, func(l topology.Link) bool { return l.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		if s.Links[i].Kind != "cable" {
			return s, nil, invalid("%s is an internal bridge; it has no details", f.ID)
		}
		if f.Name != nil {
			return s, nil, invalid("a cable has no name; set its label instead")
		}
		s.Links = slices.Clone(s.Links)
		l := &s.Links[i]
		before = linkValues(*l)
		if err := setDetails(f.Details, l.SetDetail, "cable "+l.ID); err != nil {
			return s, nil, err
		}
		after = linkValues(*l)

	case Site:
		i := slices.IndexFunc(s.Sites, func(x topology.Site) bool { return x.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Sites = slices.Clone(s.Sites)
		x := &s.Sites[i]
		before = placeValues(x.Name, x.Location, x.Description)
		if f.Name != nil {
			if err := checkName(name, 100); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Sites, func(o topology.Site) bool { return o.ID != f.ID && strings.EqualFold(o.Name, name) }) {
				return s, nil, duplicate("a site named %s already exists", name)
			}
			x.Name = name
		}
		if err := setDetails(f.Details, x.SetDetail, x.Name); err != nil {
			return s, nil, err
		}
		after = placeValues(x.Name, x.Location, x.Description)

	case Node:
		i := slices.IndexFunc(s.Nodes, func(x topology.LocationNode) bool { return x.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Nodes = slices.Clone(s.Nodes)
		x := &s.Nodes[i]
		before = placeValues(x.Name, x.Location, x.Description)
		if f.Name != nil {
			if err := checkName(name, 100); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Nodes, func(o topology.LocationNode) bool {
				return o.ID != f.ID && o.SiteID == x.SiteID && strings.EqualFold(o.Name, name)
			}) {
				return s, nil, duplicate("this site already has a node named %s", name)
			}
			x.Name = name
		}
		if err := setDetails(f.Details, x.SetDetail, x.Name); err != nil {
			return s, nil, err
		}
		after = placeValues(x.Name, x.Location, x.Description)

	case Rack:
		i := slices.IndexFunc(s.Racks, func(x topology.Rack) bool { return x.ID == f.ID })
		if i < 0 {
			return s, nil, notFound
		}
		s.Racks = slices.Clone(s.Racks)
		x := &s.Racks[i]
		before = placeValues(x.Name, x.Location, x.Description)
		before["rackType"] = x.RackType
		if f.Name != nil {
			if err := checkName(name, 100); err != nil {
				return s, nil, err
			}
			if slices.ContainsFunc(s.Racks, func(o topology.Rack) bool {
				return o.ID != f.ID && o.NodeID == x.NodeID && strings.EqualFold(o.Name, name)
			}) {
				return s, nil, duplicate("this node already has a rack named %s", name)
			}
			x.Name = name
		}
		if err := setDetails(f.Details, x.SetDetail, x.Name); err != nil {
			return s, nil, err
		}
		after = placeValues(x.Name, x.Location, x.Description)
		after["rackType"] = x.RackType

	default:
		return s, nil, notFound
	}

	// The safety net: value sets, lengths, IP addresses and unique serial
	// numbers are checked by Validate, as for every installed or proposed topology.
	if err := topology.Validate(s); err != nil {
		return s, nil, invalid("%v", err)
	}
	return s, diff(before, after), nil
}
