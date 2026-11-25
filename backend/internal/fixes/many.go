package fixes

import (
	"fmt"
	"slices"
	"strings"

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
// mutated and the caller writes nothing. A fix of kind endpoint (a switch
// port) may carry a name, one change each; a name on any other kind is
// refused, those are changed one at a time. A port's name is unique within its
// switch, checked on the final names, so two ports can swap names in one
// batch and two ports given the same name are refused naming the later fix.
//
// Validate runs once on the final snapshot (it is the slow part on a large
// site); only when it fails are the fixes validated one by one to name the
// first that breaks it.
func ApplyMany(s topology.Snapshot, list []Fix) (topology.Snapshot, [][]Change, error) {
	next, changes, err := applyEach(s, list, applyInBatch)
	if err != nil {
		return s, nil, err
	}
	if err := portNamesUnique(next, list); err != nil {
		return s, nil, err
	}
	if err := topology.Validate(next); err != nil {
		if _, _, located := applyEach(s, list, applyChecked); located != nil {
			return s, nil, located
		}
		return s, nil, invalid("%v", err)
	}
	return next, changes, nil
}

func applyInBatch(s topology.Snapshot, f Fix) (topology.Snapshot, []Change, error) {
	return applyFix(s, f, false)
}

// applyChecked is Apply without the port-name uniqueness, which is checked
// separately in a batch.
func applyChecked(s topology.Snapshot, f Fix) (topology.Snapshot, []Change, error) {
	after, changes, err := applyFix(s, f, false)
	if err != nil {
		return s, nil, err
	}
	if err := topology.Validate(after); err != nil {
		return s, nil, invalid("%v", err)
	}
	return after, changes, nil
}

// portNamesUnique refuses the first fix (in order) that leaves its port with
// the name of another port of the same switch: one that the batch does not
// rename, or one renamed by an earlier fix.
func portNamesUnique(final topology.Snapshot, list []Fix) error {
	byID := map[string]topology.Endpoint{}
	byOwner := map[string][]topology.Endpoint{}
	for _, p := range final.Endpoints {
		byID[p.ID] = p
		byOwner[p.EquipmentID] = append(byOwner[p.EquipmentID], p)
	}
	renamedAt := map[string]int{}
	for i, f := range list {
		if f.Kind == Endpoint && f.Name != nil {
			if _, ok := renamedAt[f.ID]; !ok {
				renamedAt[f.ID] = i
			}
		}
	}
	for i, f := range list {
		if f.Kind != Endpoint || f.Name == nil {
			continue
		}
		p, ok := byID[f.ID]
		if !ok {
			continue
		}
		for _, o := range byOwner[p.EquipmentID] {
			if o.ID == p.ID || !strings.EqualFold(o.Label, p.Label) {
				continue
			}
			if j, renamed := renamedAt[o.ID]; renamed && j > i {
				continue
			}
			owner := ""
			for _, e := range final.Equipment {
				if e.ID == p.EquipmentID {
					owner = e.Name
				}
			}
			err := duplicate("%s already has a port named %s", owner, p.Label)
			return &ManyError{Position: i + 1, Object: objectName(final, f), Err: err}
		}
	}
	return nil
}

func applyEach(s topology.Snapshot, list []Fix, one func(topology.Snapshot, Fix) (topology.Snapshot, []Change, error)) (topology.Snapshot, [][]Change, error) {
	changes := make([][]Change, 0, len(list))
	next := s
	for i, f := range list {
		if f.Name != nil && f.Kind != Endpoint {
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
