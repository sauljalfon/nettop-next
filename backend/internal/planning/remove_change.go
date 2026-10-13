package planning

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"nettop.local/backend/internal/topology"
)

// RemoveChange removes one change of a draft, named by the key Check reports
// ("<kind>:<id>"), together with every change that no longer applies without it.
// It returns a copy of the plan and the keys removed, the named one first.
// A key the plan does not contain is ErrNotFound.
//
// Dependents are structural (they follow from what the plan contains, not from
// what Check would reject afterwards):
//
//	add_equipment:X  the plan's cables on X's endpoints (add_cable:*) and any placement of X
//	add_rack:R       the plan's equipment in R (each as add_equipment:X, with its
//	                 cables and placements) and placements of other equipment into R
//	add_node:N       the plan's racks in N (each as add_rack:R above)
//	add_site:S       the plan's nodes in S (each as add_node:N above)
//
// Every other key removes only its own entry: place_equipment:X (the placement),
// add_cable:L, and remove_equipment|cable|rack|node|site:ID (undoing a removal).
func RemoveChange(p Plan, key string) (Plan, []string, error) {
	kind, id, _ := strings.Cut(key, ":")
	unknown := func() (Plan, []string, error) {
		return Plan{}, nil, fmt.Errorf("%w: this draft has no change %q", ErrNotFound, key)
	}
	if id == "" {
		return unknown()
	}
	next := p.clone()
	var removed []string
	drop := func(k string) { removed = append(removed, k) }

	var dropEquipment func(id string)
	dropEquipment = func(id string) {
		drop("add_equipment:" + id)
		own := map[string]bool{}
		for _, e := range next.Endpoints {
			if e.EquipmentID == id {
				own[e.ID] = true
			}
		}
		dropped := map[string]bool{id: true}
		for ep := range own {
			dropped[ep] = true
		}
		next.Equipment = slices.DeleteFunc(next.Equipment, func(e topology.Equipment) bool { return e.ID == id })
		next.Endpoints = slices.DeleteFunc(next.Endpoints, func(e topology.Endpoint) bool { return e.EquipmentID == id })
		next.Subpanels = slices.DeleteFunc(next.Subpanels, func(s topology.Subpanel) bool { return s.EquipmentID == id })
		next.Links = slices.DeleteFunc(next.Links, func(l topology.Link) bool {
			if own[l.A] || own[l.B] {
				if l.Kind != "internal" { // bridges belong to the equipment
					drop("add_cable:" + l.ID)
					dropped[l.ID] = true
				}
				return true
			}
			return false
		})
		dropPlacement(&next, id, drop)
		dropDetails(&next, dropped, drop)
		dropRenames(&next, dropped, drop)
	}
	var dropRack func(id string)
	dropRack = func(id string) {
		drop("add_rack:" + id)
		next.Racks = slices.DeleteFunc(next.Racks, func(r topology.Rack) bool { return r.ID == id })
		dropDetails(&next, map[string]bool{id: true}, drop)
		for _, e := range slices.Clone(next.Equipment) {
			if e.RackID == id {
				dropEquipment(e.ID)
			}
		}
		for _, pl := range slices.Clone(next.effectivePlacements()) {
			if pl.RackID == id {
				dropPlacement(&next, pl.EquipmentID, drop)
			}
		}
	}
	dropNode := func(id string) {
		drop("add_node:" + id)
		next.Nodes = slices.DeleteFunc(next.Nodes, func(n topology.LocationNode) bool { return n.ID == id })
		dropDetails(&next, map[string]bool{id: true}, drop)
		for _, r := range slices.Clone(next.Racks) {
			if r.NodeID == id {
				dropRack(r.ID)
			}
		}
	}

	switch kind {
	case "add_equipment":
		if !slices.ContainsFunc(next.Equipment, func(e topology.Equipment) bool { return e.ID == id }) {
			return unknown()
		}
		dropEquipment(id)
	case "add_rack":
		if !slices.ContainsFunc(next.Racks, func(r topology.Rack) bool { return r.ID == id }) {
			return unknown()
		}
		dropRack(id)
	case "add_node":
		if !slices.ContainsFunc(next.Nodes, func(n topology.LocationNode) bool { return n.ID == id }) {
			return unknown()
		}
		dropNode(id)
	case "add_site":
		if !slices.ContainsFunc(next.Sites, func(s topology.Site) bool { return s.ID == id }) {
			return unknown()
		}
		drop("add_site:" + id)
		next.Sites = slices.DeleteFunc(next.Sites, func(s topology.Site) bool { return s.ID == id })
		dropDetails(&next, map[string]bool{id: true}, drop)
		for _, n := range slices.Clone(next.Nodes) {
			if n.SiteID == id {
				dropNode(n.ID)
			}
		}
	case "place_equipment":
		if !dropPlacement(&next, id, drop) {
			return unknown()
		}
	case "add_cable":
		if !slices.ContainsFunc(next.Links, func(l topology.Link) bool { return l.ID == id && l.Kind != "internal" }) {
			return unknown()
		}
		drop(key)
		next.Links = slices.DeleteFunc(next.Links, func(l topology.Link) bool { return l.ID == id })
		dropDetails(&next, map[string]bool{id: true}, drop)
	case "update_details":
		if !slices.ContainsFunc(next.Details, func(u DetailUpdate) bool { return u.ID == id }) {
			return unknown()
		}
		dropDetails(&next, map[string]bool{id: true}, drop)
	case "rename_equipment":
		if !slices.ContainsFunc(next.Renames, func(r Rename) bool { return r.ID == id }) {
			return unknown()
		}
		dropRenames(&next, map[string]bool{id: true}, drop)
	case "remove_equipment", "remove_cable", "remove_rack", "remove_node", "remove_site":
		list := map[string]*[]string{"remove_equipment": &next.Removals.Equipment, "remove_cable": &next.Removals.Links, "remove_rack": &next.Removals.Racks, "remove_node": &next.Removals.Nodes, "remove_site": &next.Removals.Sites}[kind]
		if !slices.Contains(*list, id) {
			return unknown()
		}
		drop(key)
		if *list = slices.DeleteFunc(*list, func(x string) bool { return x == id }); len(*list) == 0 {
			*list = nil
		}
	default:
		return unknown()
	}
	return next, removed, nil
}

// dropPlacement removes the placement (or legacy update) of equipment id and
// reports whether there was one.
func dropPlacement(p *Plan, id string, drop func(string)) bool {
	n := len(p.Placements) + len(p.Updates)
	p.Placements = slices.DeleteFunc(p.Placements, func(pl PlacementInput) bool { return pl.EquipmentID == id })
	p.Updates = slices.DeleteFunc(p.Updates, func(e topology.Equipment) bool { return e.ID == id })
	if len(p.Placements)+len(p.Updates) == n {
		return false
	}
	drop("place_equipment:" + id)
	return true
}

// ExecuteRemoveChange runs the remove_change command and also returns the keys
// removed. It is the one command allowed on a stale draft, because it can only
// shrink it: the base revision is not compared and a stale result is not
// applied (Update draft re-checks it later). On a current draft the result must
// still apply, otherwise the command is refused (ErrInvalid) and nothing changes.
func ExecuteRemoveChange(base topology.Snapshot, p Plan, c Command) (Plan, []string, error) {
	invalid := func(message string) (Plan, []string, error) {
		return Plan{}, nil, fmt.Errorf("%w: %s", ErrInvalid, message)
	}
	if p.Status == "recorded" {
		return Plan{}, nil, ErrRecorded
	}
	if c.ExpectedRevision == "" {
		return invalid("expectedRevision is required")
	}
	if c.ExpectedRevision != p.Revision {
		return Plan{}, nil, fmt.Errorf("%w: this draft changed; refresh before trying again", ErrConflict)
	}
	if c.Type != "remove_change" || c.Change == nil || c.payloads() != 1 {
		return invalid("remove_change requires only a change payload")
	}
	next, removed, err := RemoveChange(p, strings.TrimSpace(c.Change.Key))
	if err != nil {
		return Plan{}, nil, err
	}
	if p.BaseRevision == base.Revision {
		if _, err := Apply(base, next); err != nil {
			reason := err.Error()
			if conflicts := Check(base, next); len(conflicts) > 0 {
				reason = conflicts[0].Change + ": " + conflicts[0].Reason
			}
			return invalid("the draft would no longer apply without that change (" + reason + ")")
		}
	}
	revision, err := strconv.ParseInt(p.Revision, 10, 64)
	if err != nil {
		return Plan{}, nil, fmt.Errorf("invalid stored revision: %w", err)
	}
	next.Labels = pruneLabels(next)
	next.Revision = strconv.FormatInt(revision+1, 10)
	return next, removed, nil
}
