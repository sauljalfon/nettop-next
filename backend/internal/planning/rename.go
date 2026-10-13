package planning

import (
	"slices"
	"strings"

	"nettop.local/backend/internal/topology"
)

// installedRename is why installed equipment cannot be renamed in a plan.
const installedRename = "Installed equipment is renamed with a direct fix, not in a plan"

// nameTaken is the message when equipment is named like other equipment.
const nameTaken = "equipment name already exists in this topology"

// renameEquipment is the rename_equipment command: it validates the new name
// against the proposed topology `current` and records it in next.Renames (and
// in delta, the change this command made). Only equipment the plan adds can be
// renamed; renaming to the name it was added with removes the entry.
func renameEquipment(next *Plan, current topology.Snapshot, id, name string, delta *Plan) error {
	i := slices.IndexFunc(next.Equipment, func(e topology.Equipment) bool { return e.ID == id })
	if i < 0 {
		if slices.ContainsFunc(current.Equipment, func(e topology.Equipment) bool { return e.ID == id }) {
			return invalidf(installedRename)
		}
		return invalidf("cannot rename unknown equipment %s", id)
	}
	name, ok := validName(name)
	if !ok {
		return invalidf("equipment name must contain 1–100 characters")
	}
	for _, e := range current.Equipment {
		switch {
		case e.ID == id:
			if strings.EqualFold(e.Name, name) {
				return invalidf("%s is already called %s", name, e.Name)
			}
		case strings.EqualFold(e.Name, name):
			return invalidf(nameTaken)
		}
	}
	added := next.Equipment[i].Name
	next.Renames = slices.DeleteFunc(next.Renames, func(r Rename) bool { return r.ID == id })
	if strings.EqualFold(added, name) {
		name = added // back to the name it was added with: no entry
		if len(next.Renames) == 0 {
			next.Renames = nil
		}
	} else {
		next.Renames = append(next.Renames, Rename{ID: id, Name: name})
	}
	delta.Renames = []Rename{{ID: id, Name: name}}
	return nil
}

// renameStep is the Apply/Check step of one rename: it sets the name on the
// equipment in the snapshot. Renames are judged as a set, whatever the order of
// the entries: the name clashes only with another equipment's final name (its
// rename if the plan has one, else its name in the snapshot), so a name that
// another rename frees is free. final is built once per Apply. Equipment that is
// gone fails the change; Validate still catches a real duplicate at the end.
func renameStep(plan Plan, r Rename, final map[string]string) step {
	return step{"rename_equipment:" + r.ID, func(s *topology.Snapshot) error {
		i := slices.IndexFunc(s.Equipment, func(e topology.Equipment) bool { return e.ID == r.ID })
		if i < 0 {
			return invalidf("%s", gone(plan.Labels, r.ID, "cannot rename unknown equipment "+r.ID))
		}
		if slices.ContainsFunc(s.Equipment, func(e topology.Equipment) bool {
			name, renamed := final[e.ID]
			if !renamed {
				name = e.Name
			}
			return e.ID != r.ID && strings.EqualFold(name, r.Name)
		}) {
			return invalidf(nameTaken)
		}
		s.Equipment[i].Name = r.Name
		return nil
	}}
}

// dropRenames removes the renames of the given objects and reports each one's key.
func dropRenames(p *Plan, ids map[string]bool, drop func(string)) {
	p.Renames = slices.DeleteFunc(p.Renames, func(r Rename) bool {
		if ids[r.ID] {
			drop("rename_equipment:" + r.ID)
			return true
		}
		return false
	})
	if len(p.Renames) == 0 {
		p.Renames = nil
	}
}
