package planning

import (
	"slices"
	"strings"

	"nettop.local/backend/internal/topology"
)

// DetailUpdate is the details update_details gives one object the plan adds.
// Several updates to one object are one change, update_details:<id>; the
// later fields win. It is layered over the addition after every addition, so
// undoing it brings back what the addition itself said.
type DetailUpdate struct {
	ID      string           `json:"id"`
	Details topology.Details `json:"details"`
}

// installedDetails is why an installed object's details cannot change in a plan.
const installedDetails = "Installed details are changed with a direct fix (M5b step 12), not in a plan"

// setDetails sets the given fields on a new object with `set`; a field that does
// not apply to that kind of object is refused in names ("rackType does not
// apply to equipment SW-NEW"). who is how the user knows the object.
func setDetails(d *topology.Details, who string, set func(topology.DetailField) bool) error {
	if d == nil {
		return nil
	}
	for _, f := range d.Fields() {
		if !set(f) {
			return invalidf("%s does not apply to %s", topology.DetailWord(f.Name), who)
		}
	}
	return nil
}

// addedDetailsProblem says in names why the detail values of what a command
// added are not allowed, or "" when they are: the value sets and lengths, and
// a serial number already in use in `current` (or twice among the additions).
func addedDetailsProblem(current topology.Snapshot, added Plan) string {
	for _, x := range added.Sites {
		if p := x.DetailProblem(); p != "" {
			return p
		}
	}
	for _, x := range added.Nodes {
		if p := x.DetailProblem(); p != "" {
			return p
		}
	}
	for _, x := range added.Racks {
		if p := x.DetailProblem(); p != "" {
			return p
		}
	}
	for _, l := range added.Links {
		if p := l.DetailProblem(); p != "" {
			return p
		}
	}
	if len(added.Equipment) > 0 {
		owners := serialOwners(current)
		for _, e := range added.Equipment {
			if p := e.DetailProblem(); p != "" {
				return p
			}
			if p := topology.SerialProblem(e.SerialNumber, owners); p != "" {
				return p
			}
			if e.SerialNumber != "" {
				owners[strings.ToLower(e.SerialNumber)] = e.Name
			}
		}
	}
	return ""
}

// serialOwners maps each serial number in use (lower-cased) to its equipment's name.
func serialOwners(s topology.Snapshot) map[string]string {
	owners := map[string]string{}
	for _, e := range s.Equipment {
		if e.SerialNumber != "" {
			owners[strings.ToLower(e.SerialNumber)] = e.Name
		}
	}
	return owners
}

// updateDetails is the update_details command: it validates the new values
// against the proposed topology `current` and records them in next.Details (and
// in delta, the change this command made).
func updateDetails(next *Plan, current topology.Snapshot, target TargetInput, d topology.Details, delta *Plan) error {
	id := target.ID
	names := map[string]string{}
	for _, e := range current.Equipment {
		names[e.ID] = e.Name
	}
	apply := func(who string, set func(topology.DetailField) bool) error {
		for _, f := range d.Fields() {
			if !set(f) {
				return invalidf("%s does not apply to %s", topology.DetailWord(f.Name), who)
			}
		}
		return nil
	}
	check := func(problem string) error {
		if problem != "" {
			return invalidf("%s", problem)
		}
		return nil
	}
	var err error
	switch {
	case slices.ContainsFunc(next.Equipment, func(e topology.Equipment) bool { return e.ID == id }):
		e := current.Equipment[slices.IndexFunc(current.Equipment, func(e topology.Equipment) bool { return e.ID == id })]
		owners := serialOwners(current)
		delete(owners, strings.ToLower(e.SerialNumber)) // its own current serial is not a clash
		if err = apply("equipment "+e.Name, e.SetDetail); err == nil {
			if err = check(e.DetailProblem()); err == nil {
				err = check(topology.SerialProblem(e.SerialNumber, owners))
			}
		}
	case slices.ContainsFunc(next.Endpoints, func(p topology.Endpoint) bool { return p.ID == id }):
		p := current.Endpoints[slices.IndexFunc(current.Endpoints, func(p topology.Endpoint) bool { return p.ID == id })]
		who := names[p.EquipmentID] + " · " + p.Label
		if err = apply("port "+who, p.SetDetail); err == nil {
			err = check(p.DetailProblem(who))
		}
	case slices.ContainsFunc(next.Links, func(l topology.Link) bool { return l.ID == id }):
		l := current.Links[slices.IndexFunc(current.Links, func(l topology.Link) bool { return l.ID == id })]
		if l.Kind != "cable" {
			return invalidf("bridge %s carries no details", id)
		}
		if err = apply("a cable", l.SetDetail); err == nil {
			err = check(l.DetailProblem())
		}
	case slices.ContainsFunc(next.Sites, func(x topology.Site) bool { return x.ID == id }):
		x := current.Sites[slices.IndexFunc(current.Sites, func(x topology.Site) bool { return x.ID == id })]
		if err = apply("site "+x.Name, x.SetDetail); err == nil {
			err = check(x.DetailProblem())
		}
	case slices.ContainsFunc(next.Nodes, func(x topology.LocationNode) bool { return x.ID == id }):
		x := current.Nodes[slices.IndexFunc(current.Nodes, func(x topology.LocationNode) bool { return x.ID == id })]
		if err = apply("node "+x.Name, x.SetDetail); err == nil {
			err = check(x.DetailProblem())
		}
	case slices.ContainsFunc(next.Racks, func(x topology.Rack) bool { return x.ID == id }):
		x := current.Racks[slices.IndexFunc(current.Racks, func(x topology.Rack) bool { return x.ID == id })]
		if err = apply("rack "+x.Name, x.SetDetail); err == nil {
			err = check(x.DetailProblem())
		}
	case existsIn(current, id):
		return invalidf(installedDetails)
	default:
		return invalidf("cannot update details of unknown object %s", id)
	}
	if err != nil {
		return err
	}
	if i := slices.IndexFunc(next.Details, func(u DetailUpdate) bool { return u.ID == id }); i >= 0 {
		next.Details[i].Details = next.Details[i].Details.Merge(d)
	} else {
		next.Details = append(next.Details, DetailUpdate{ID: id, Details: d})
	}
	delta.Details = []DetailUpdate{{ID: id, Details: d}}
	return nil
}

// existsIn reports whether the snapshot has an object (of a kind that can carry
// details) with this ID.
func existsIn(s topology.Snapshot, id string) bool {
	return slices.ContainsFunc(s.Equipment, func(x topology.Equipment) bool { return x.ID == id }) ||
		slices.ContainsFunc(s.Endpoints, func(x topology.Endpoint) bool { return x.ID == id }) ||
		slices.ContainsFunc(s.Links, func(x topology.Link) bool { return x.ID == id }) ||
		slices.ContainsFunc(s.Sites, func(x topology.Site) bool { return x.ID == id }) ||
		slices.ContainsFunc(s.Nodes, func(x topology.LocationNode) bool { return x.ID == id }) ||
		slices.ContainsFunc(s.Racks, func(x topology.Rack) bool { return x.ID == id })
}

// detailsStep is the Apply/Check step of one update: it sets the fields on the
// object in the snapshot (an object that is gone, or a field that does not
// apply, fails the change).
func detailsStep(plan Plan, u DetailUpdate) step {
	return step{"update_details:" + u.ID, func(s *topology.Snapshot) error {
		id := u.ID
		fields := u.Details.Fields()
		doSet := func(who string, set func(topology.DetailField) bool) error {
			for _, f := range fields {
				if !set(f) {
					return invalidf("%s does not apply to %s", topology.DetailWord(f.Name), who)
				}
			}
			return nil
		}
		if i := slices.IndexFunc(s.Equipment, func(x topology.Equipment) bool { return x.ID == id }); i >= 0 {
			return doSet("equipment "+s.Equipment[i].Name, s.Equipment[i].SetDetail)
		}
		if i := slices.IndexFunc(s.Endpoints, func(x topology.Endpoint) bool { return x.ID == id }); i >= 0 {
			owner := ""
			for _, e := range s.Equipment {
				if e.ID == s.Endpoints[i].EquipmentID {
					owner = e.Name
				}
			}
			return doSet("port "+owner+" · "+s.Endpoints[i].Label, s.Endpoints[i].SetDetail)
		}
		if i := slices.IndexFunc(s.Links, func(x topology.Link) bool { return x.ID == id }); i >= 0 {
			return doSet("a cable", s.Links[i].SetDetail)
		}
		if i := slices.IndexFunc(s.Sites, func(x topology.Site) bool { return x.ID == id }); i >= 0 {
			return doSet("site "+s.Sites[i].Name, s.Sites[i].SetDetail)
		}
		if i := slices.IndexFunc(s.Nodes, func(x topology.LocationNode) bool { return x.ID == id }); i >= 0 {
			return doSet("node "+s.Nodes[i].Name, s.Nodes[i].SetDetail)
		}
		if i := slices.IndexFunc(s.Racks, func(x topology.Rack) bool { return x.ID == id }); i >= 0 {
			return doSet("rack "+s.Racks[i].Name, s.Racks[i].SetDetail)
		}
		return invalidf("%s", gone(plan.Labels, id, "cannot update details of unknown object "+id))
	}}
}

// dropDetails removes the updates of the given objects and reports each one's key.
func dropDetails(p *Plan, ids map[string]bool, drop func(string)) {
	p.Details = slices.DeleteFunc(p.Details, func(u DetailUpdate) bool {
		if ids[u.ID] {
			drop("update_details:" + u.ID)
			return true
		}
		return false
	})
	if len(p.Details) == 0 {
		p.Details = nil
	}
}
