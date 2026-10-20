package fixes

import (
	"fmt"
	"slices"

	"nettop.local/backend/internal/topology"
)

// ManyError is the first refusal of ApplyMany: the fix's position (1-based)
// and its object, with the single fix's own error kept for errors.Is.
type ManyError struct {
	Position int
	Object   string
	Err      error
}

func (e *ManyError) Error() string {
	return fmt.Sprintf("fix %d (%s): %s", e.Position, e.Object, e.Err)
}
func (e *ManyError) Unwrap() error { return e.Err }

// objectName is the name of the fix's object in s, else its ID.
func objectName(s topology.Snapshot, f Fix) string {
	var name string
	switch f.Kind {
	case Equipment:
		if i := slices.IndexFunc(s.Equipment, func(x topology.Equipment) bool { return x.ID == f.ID }); i >= 0 {
			name = s.Equipment[i].Name
		}
	case Site:
		if i := slices.IndexFunc(s.Sites, func(x topology.Site) bool { return x.ID == f.ID }); i >= 0 {
			name = s.Sites[i].Name
		}
	case Node:
		if i := slices.IndexFunc(s.Nodes, func(x topology.LocationNode) bool { return x.ID == f.ID }); i >= 0 {
			name = s.Nodes[i].Name
		}
	case Rack:
		if i := slices.IndexFunc(s.Racks, func(x topology.Rack) bool { return x.ID == f.ID }); i >= 0 {
			name = s.Racks[i].Name
		}
	}
	if name == "" {
		return f.ID
	}
	return name
}

// ApplyMany applies the fixes in order, each to the result of the one before,
// and returns the final snapshot and the changes of each fix (same order). The
// first refusal stops it with a *ManyError that names the fix; s is never
// mutated and the caller writes nothing. Names are unique, so a fix with a
// name is refused: they are changed one at a time.
//
// Validate runs once on the final snapshot (it is the slow part on a large
// site); only when it fails are the fixes validated one by one to name the
// first that breaks it.
func ApplyMany(s topology.Snapshot, list []Fix) (topology.Snapshot, [][]Change, error) {
	next, changes, err := applyEach(s, list, apply)
	if err != nil {
		return s, nil, err
	}
	if err := topology.Validate(next); err != nil {
		if _, _, located := applyEach(s, list, Apply); located != nil {
			return s, nil, located
		}
		return s, nil, invalid("%v", err)
	}
	return next, changes, nil
}

func applyEach(s topology.Snapshot, list []Fix, one func(topology.Snapshot, Fix) (topology.Snapshot, []Change, error)) (topology.Snapshot, [][]Change, error) {
	changes := make([][]Change, 0, len(list))
	next := s
	for i, f := range list {
		if f.Name != nil {
			err := invalid("names are changed one at a time")
			return s, nil, &ManyError{Position: i + 1, Object: objectName(next, f), Err: err}
		}
		after, c, err := one(next, f)
		if err != nil {
			return s, nil, &ManyError{Position: i + 1, Object: objectName(next, f), Err: err}
		}
		next = after
		changes = append(changes, c)
	}
	return next, changes, nil
}
