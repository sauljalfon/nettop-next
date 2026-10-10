package planning

import (
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"nettop.local/backend/internal/topology"
)

var ErrConflict = errors.New("revision conflict")
var ErrNotFound = errors.New("not found")

// Plan is a revisioned overlay on the installed topology (overlay v2). It holds
// additions (containers, equipment with its endpoints, cables), placements (IDs
// only, so a later rename of installed equipment cannot invalidate a draft) and
// removals. Installed IDs never change.
type Plan struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	BaseRevision string `json:"baseRevision"`
	Revision     string `json:"revision"`
	// Status is "draft" or "recorded" (empty means draft). A recorded plan is
	// read-only and keeps its note as the record of the change.
	Status     string     `json:"status,omitempty"`
	RecordedAt *time.Time `json:"recordedAt,omitempty"`
	RecordNote string     `json:"recordNote,omitempty"`
	// RecordedBy is a free-text name until identities exist (M7).
	RecordedBy string `json:"recordedBy,omitempty"`
	// Labels name every object the plan touches (equipment, racks, nodes, sites,
	// endpoints, removed cables) by ID, as the user knows them. Commands fill them,
	// so a draft whose objects were removed by someone else, and a recorded plan,
	// still read in names.
	Labels    map[string]string       `json:"labels,omitempty"`
	Sites     []topology.Site         `json:"sites,omitempty"`
	Nodes     []topology.LocationNode `json:"nodes,omitempty"`
	Racks     []topology.Rack         `json:"racks,omitempty"`
	Equipment []topology.Equipment    `json:"equipment"`
	// Updates is the pre-v2 full-equipment form. It is still read (each entry is
	// a placement) but never written by new code: Execute folds it into
	// Placements.
	Updates    []topology.Equipment `json:"updates"`
	Placements []PlacementInput     `json:"placements,omitempty"`
	Removals   Removals             `json:"removals"`
	Subpanels  []topology.Subpanel  `json:"subpanels"`
	Endpoints  []topology.Endpoint  `json:"endpoints"`
	Links      []topology.Link      `json:"links"`
}

// ErrRecorded is the reason a recorded plan refuses commands, record and rebase.
var ErrRecorded = fmt.Errorf("%w: this plan is recorded and read-only", ErrConflict)

// ConflictsError is a 409 that lists every change of a draft that cannot be
// applied to the current installed topology (Update draft).
type ConflictsError struct{ Conflicts []Conflict }

func (e *ConflictsError) Error() string {
	return fmt.Sprintf("%d change(s) of this draft conflict with the installed topology", len(e.Conflicts))
}
func (e *ConflictsError) Is(target error) bool { return target == ErrConflict }

// Removals lists IDs of installed objects the plan removes. Removing equipment
// cascades to its endpoints, bridges, subpanels and every cable on them. A rack,
// node or site can be removed only when it is empty after the plan.
type Removals struct {
	Equipment []string `json:"equipment,omitempty"`
	Links     []string `json:"links,omitempty"`
	Racks     []string `json:"racks,omitempty"`
	Nodes     []string `json:"nodes,omitempty"`
	Sites     []string `json:"sites,omitempty"`
}

// RemovalKind says what Plan.Remove removes.
type RemovalKind string

const (
	RemoveEquipment RemovalKind = "equipment"
	RemoveLink      RemovalKind = "link" // a cable; bridges go only with their equipment
	RemoveRack      RemovalKind = "rack"
	RemoveNode      RemovalKind = "node"
	RemoveSite      RemovalKind = "site"
)

// Conflict is one change of a plan that cannot be applied. Change identifies it
// as "<kind>:<id>" with the ID of the object the change is about, so the UI can
// link a conflict to its object. Kinds: add_site, add_node, add_rack,
// add_equipment (with its endpoints, subpanels and bridges), add_endpoint,
// add_subpanel, place_equipment, remove_cable, remove_equipment, remove_rack,
// remove_node, remove_site, add_cable. "installed:<revision>" means the base
// itself is invalid.
type Conflict struct {
	Change string `json:"change"`
	Reason string `json:"reason"`
}

// step is one change of the documented apply order. run is atomic: on error it
// leaves the snapshot untouched.
type step struct {
	change string
	run    func(*topology.Snapshot) error
}

func invalidf(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{ErrInvalid}, args...)...)
}

// Apply produces the proposed snapshot: base → container additions → equipment
// additions → placements → removals → cable additions → Validate. It is
// all-or-nothing and never mutates base.
func Apply(base topology.Snapshot, plan Plan) (topology.Snapshot, error) {
	if base.Revision != plan.BaseRevision {
		return topology.Snapshot{}, fmt.Errorf("%w: installed topology changed; review the plan against its new base", ErrConflict)
	}
	if err := topology.Validate(base); err != nil {
		return topology.Snapshot{}, err
	}
	next := cloneSnapshot(base)
	for _, s := range steps(plan) {
		if err := s.run(&next); err != nil {
			return topology.Snapshot{}, err
		}
	}
	next.Context = "planned"
	next.Revision = base.Revision + "/" + plan.ID + "@" + plan.Revision
	return next, topology.Validate(next)
}

// Check applies the plan's changes in Apply's order against base and collects
// every failing change instead of stopping at the first. It does not compare
// revisions: it is how a draft is re-checked against a newer installed topology.
// A failing change is left out, so later changes are judged without it. It
// returns nil exactly when Apply would succeed.
//
// The changes run in place on one copy of base (each is atomic on error) and
// Validate runs once. Only when that fails is the responsible change found, by
// binary search over prefixes of the applied changes (about log n Validates per
// such conflict). The search blames the first change after which the snapshot
// is invalid, so two changes that are valid only together, such as two pieces of
// equipment swapping units, can be blamed when another change has failed.
func Check(base topology.Snapshot, plan Plan) []Conflict {
	if err := topology.Validate(base); err != nil {
		return []Conflict{{Change: "installed:" + base.Revision, Reason: err.Error()}}
	}
	all := steps(plan)
	reasons := map[int]string{}
	reason := func(err error) string { return strings.TrimPrefix(err.Error(), ErrInvalid.Error()+": ") }
	for {
		work := cloneSnapshot(base)
		var applied []int
		for i, s := range all {
			if _, out := reasons[i]; out {
				continue
			}
			if err := s.run(&work); err != nil {
				reasons[i] = reason(err)
				continue
			}
			applied = append(applied, i)
		}
		if topology.Validate(work) == nil {
			break
		}
		// prefix[n] is valid for n = 0 (base) and invalid for n = len(applied).
		prefix := func(n int) error {
			w := cloneSnapshot(base)
			for _, i := range applied[:n] {
				_ = all[i].run(&w) // succeeded in the pass above, in the same order
			}
			return topology.Validate(w)
		}
		lo, hi := 0, len(applied)
		for hi-lo > 1 {
			if mid := (lo + hi) / 2; prefix(mid) == nil {
				lo = mid
			} else {
				hi = mid
			}
		}
		reasons[applied[hi-1]] = reason(prefix(hi))
	}
	var conflicts []Conflict
	for i, s := range all {
		if r, bad := reasons[i]; bad {
			conflicts = append(conflicts, Conflict{Change: s.change, Reason: r})
		}
	}
	return conflicts
}

// Remove returns a copy of the plan without the object, judged against the
// proposed snapshot (base plus the plan). The object must exist there, a cable
// must be a cable (bridges go only with their equipment), and a rack, node or
// site must be empty after the plan; otherwise the error wraps ErrInvalid and
// no plan is returned. When the plan itself added the object, its addition is
// deleted (an equipment addition takes its endpoints, subpanels, bridges and
// the plan's cables on them with it) and no removal is recorded. Otherwise the
// ID is recorded once in Removals, and for installed equipment the plan's own
// cables on its endpoints, its placement and any cable removals the cascade
// makes redundant are dropped, so the plan stays valid.
func (p Plan) Remove(base topology.Snapshot, kind RemovalKind, id string) (Plan, error) {
	current, err := Apply(base, p)
	if err != nil {
		return Plan{}, err
	}
	return p.remove(base, current, kind, id)
}

// remove is Remove with the proposed snapshot already computed.
func (p Plan) remove(base, current topology.Snapshot, kind RemovalKind, id string) (Plan, error) {
	next := p.clone()
	switch kind {
	case RemoveEquipment:
		if !slices.ContainsFunc(current.Equipment, func(e topology.Equipment) bool { return e.ID == id }) {
			return Plan{}, invalidf("cannot remove unknown equipment %s", id)
		}
		own := map[string]bool{}
		for _, e := range next.Endpoints {
			if e.EquipmentID == id {
				own[e.ID] = true
			}
		}
		next.Placements = slices.DeleteFunc(next.Placements, func(pl PlacementInput) bool { return pl.EquipmentID == id })
		next.Updates = slices.DeleteFunc(next.Updates, func(e topology.Equipment) bool { return e.ID == id })
		if slices.ContainsFunc(next.Equipment, func(e topology.Equipment) bool { return e.ID == id }) {
			next.Equipment = slices.DeleteFunc(next.Equipment, func(e topology.Equipment) bool { return e.ID == id })
			next.Endpoints = slices.DeleteFunc(next.Endpoints, func(e topology.Endpoint) bool { return e.EquipmentID == id })
			next.Subpanels = slices.DeleteFunc(next.Subpanels, func(s topology.Subpanel) bool { return s.EquipmentID == id })
			next.Links = slices.DeleteFunc(next.Links, func(l topology.Link) bool { return own[l.A] || own[l.B] })
			return next, nil
		}
		for _, e := range base.Endpoints {
			if e.EquipmentID == id {
				own[e.ID] = true
			}
		}
		next.Links = slices.DeleteFunc(next.Links, func(l topology.Link) bool { return own[l.A] || own[l.B] })
		next.Removals.Links = slices.DeleteFunc(next.Removals.Links, func(linkID string) bool {
			return slices.ContainsFunc(base.Links, func(l topology.Link) bool { return l.ID == linkID && (own[l.A] || own[l.B]) })
		})
		if len(next.Removals.Links) == 0 {
			next.Removals.Links = nil
		}
		next.Removals.Equipment = addOnce(next.Removals.Equipment, id)
	case RemoveLink:
		i := slices.IndexFunc(current.Links, func(l topology.Link) bool { return l.ID == id })
		if i < 0 {
			return Plan{}, invalidf("cannot remove unknown cable %s", id)
		}
		if current.Links[i].Kind != "cable" {
			return Plan{}, invalidf("%s is a bridge; it goes only with its equipment", id)
		}
		if slices.ContainsFunc(next.Links, func(l topology.Link) bool { return l.ID == id }) {
			next.Links = slices.DeleteFunc(next.Links, func(l topology.Link) bool { return l.ID == id })
			return next, nil
		}
		next.Removals.Links = addOnce(next.Removals.Links, id)
	case RemoveRack, RemoveNode, RemoveSite:
		if err := containerRemovable(current, kind, id, p.Labels); err != nil {
			return Plan{}, err
		}
		switch kind {
		case RemoveRack:
			if slices.ContainsFunc(next.Racks, func(r topology.Rack) bool { return r.ID == id }) {
				next.Racks = slices.DeleteFunc(next.Racks, func(r topology.Rack) bool { return r.ID == id })
				return next, nil
			}
			next.Removals.Racks = addOnce(next.Removals.Racks, id)
		case RemoveNode:
			if slices.ContainsFunc(next.Nodes, func(n topology.LocationNode) bool { return n.ID == id }) {
				next.Nodes = slices.DeleteFunc(next.Nodes, func(n topology.LocationNode) bool { return n.ID == id })
				return next, nil
			}
			next.Removals.Nodes = addOnce(next.Removals.Nodes, id)
		case RemoveSite:
			if slices.ContainsFunc(next.Sites, func(s topology.Site) bool { return s.ID == id }) {
				next.Sites = slices.DeleteFunc(next.Sites, func(s topology.Site) bool { return s.ID == id })
				return next, nil
			}
			next.Removals.Sites = addOnce(next.Removals.Sites, id)
		}
	default:
		return Plan{}, invalidf("unknown removal kind %q", kind)
	}
	return next, nil
}

// containerRemovable says why a rack, node or site cannot be removed from s: it
// does not exist, or it is not empty. Apply, Check and Remove share it, so the
// reason is the same everywhere.
func containerRemovable(s topology.Snapshot, kind RemovalKind, id string, labels map[string]string) error {
	switch kind {
	case RemoveRack:
		if !slices.ContainsFunc(s.Racks, func(r topology.Rack) bool { return r.ID == id }) {
			return invalidf("%s", gone(labels, id, "cannot remove unknown rack "+id))
		}
		if slices.ContainsFunc(s.Equipment, func(e topology.Equipment) bool { return e.RackID == id }) {
			return invalidf("rack %s still holds equipment; it can be removed only when empty", id)
		}
	case RemoveNode:
		if !slices.ContainsFunc(s.Nodes, func(n topology.LocationNode) bool { return n.ID == id }) {
			return invalidf("%s", gone(labels, id, "cannot remove unknown node "+id))
		}
		if slices.ContainsFunc(s.Racks, func(r topology.Rack) bool { return r.NodeID == id }) {
			return invalidf("node %s still has racks; it can be removed only when empty", id)
		}
	case RemoveSite:
		if !slices.ContainsFunc(s.Sites, func(site topology.Site) bool { return site.ID == id }) {
			return invalidf("%s", gone(labels, id, "cannot remove unknown site "+id))
		}
		if slices.ContainsFunc(s.Nodes, func(n topology.LocationNode) bool { return n.SiteID == id }) {
			return invalidf("site %s still has nodes; it can be removed only when empty", id)
		}
	}
	return nil
}

func addOnce(ids []string, id string) []string {
	if slices.Contains(ids, id) {
		return ids
	}
	return append(slices.Clone(ids), id)
}

// clone copies every slice a command may change.
func (p Plan) clone() Plan {
	p.Sites = slices.Clone(p.Sites)
	p.Nodes = slices.Clone(p.Nodes)
	p.Racks = slices.Clone(p.Racks)
	p.Equipment = slices.Clone(p.Equipment)
	p.Updates = slices.Clone(p.Updates)
	p.Placements = slices.Clone(p.Placements)
	p.Labels = maps.Clone(p.Labels)
	p.Removals = Removals{Equipment: slices.Clone(p.Removals.Equipment), Links: slices.Clone(p.Removals.Links), Racks: slices.Clone(p.Removals.Racks), Nodes: slices.Clone(p.Removals.Nodes), Sites: slices.Clone(p.Removals.Sites)}
	p.Subpanels = slices.Clone(p.Subpanels)
	p.Endpoints = slices.Clone(p.Endpoints)
	p.Links = slices.Clone(p.Links)
	return p
}

// effectivePlacements is Placements followed by the legacy Updates read as
// placements (only their rack and unit count).
func (p Plan) effectivePlacements() []PlacementInput {
	out := slices.Clone(p.Placements)
	for _, u := range p.Updates {
		out = append(out, PlacementInput{EquipmentID: u.ID, RackID: u.RackID, Unit: u.Unit})
	}
	return out
}

func cloneSnapshot(s topology.Snapshot) topology.Snapshot {
	s.Networks = append([]topology.Network{}, s.Networks...)
	s.Sites = append([]topology.Site{}, s.Sites...)
	s.Nodes = append([]topology.LocationNode{}, s.Nodes...)
	s.Racks = append([]topology.Rack{}, s.Racks...)
	s.Equipment = append([]topology.Equipment{}, s.Equipment...)
	s.Subpanels = append([]topology.Subpanel{}, s.Subpanels...)
	s.Endpoints = append([]topology.Endpoint{}, s.Endpoints...)
	s.Links = append([]topology.Link{}, s.Links...)
	return s
}

// steps lists the plan's changes in the apply order.
func steps(plan Plan) []step {
	var out []step
	// Equipment this plan moves or removes does not stand in the way of another
	// change at its old units: the steps run in a fixed order, not in the order
	// the user made them. A collision that remains is caught by Validate.
	leaving := map[string]bool{}
	for _, pl := range plan.effectivePlacements() {
		leaving[pl.EquipmentID] = true
	}
	for _, id := range plan.Removals.Equipment {
		leaving[id] = true
	}
	add := func(change string, run func(*topology.Snapshot) error) { out = append(out, step{change, run}) }

	for _, site := range plan.Sites {
		add("add_site:"+site.ID, func(s *topology.Snapshot) error { s.Sites = append(s.Sites, site); return nil })
	}
	for _, node := range plan.Nodes {
		add("add_node:"+node.ID, func(s *topology.Snapshot) error { s.Nodes = append(s.Nodes, node); return nil })
	}
	for _, rack := range plan.Racks {
		add("add_rack:"+rack.ID, func(s *topology.Snapshot) error { s.Racks = append(s.Racks, rack); return nil })
	}

	// An equipment addition owns its endpoints, subpanels and bridges (internal
	// links between its own endpoints), so a half-built HDF is one change.
	owner := map[string]string{}
	planEquipment := map[string]bool{}
	for _, e := range plan.Equipment {
		planEquipment[e.ID] = true
	}
	endpointsOf, subpanelsOf, bridgesOf := map[string][]topology.Endpoint{}, map[string][]topology.Subpanel{}, map[string][]topology.Link{}
	var strays []step
	for _, e := range plan.Endpoints {
		if planEquipment[e.EquipmentID] {
			owner[e.ID] = e.EquipmentID
			endpointsOf[e.EquipmentID] = append(endpointsOf[e.EquipmentID], e)
		} else {
			strays = append(strays, step{"add_endpoint:" + e.ID, func(s *topology.Snapshot) error { s.Endpoints = append(s.Endpoints, e); return nil }})
		}
	}
	for _, sp := range plan.Subpanels {
		if planEquipment[sp.EquipmentID] {
			subpanelsOf[sp.EquipmentID] = append(subpanelsOf[sp.EquipmentID], sp)
		} else {
			strays = append(strays, step{"add_subpanel:" + sp.ID, func(s *topology.Snapshot) error { s.Subpanels = append(s.Subpanels, sp); return nil }})
		}
	}
	var cables []topology.Link
	for _, l := range plan.Links {
		if eq := owner[l.A]; l.Kind == "internal" && eq != "" && eq == owner[l.B] {
			bridgesOf[eq] = append(bridgesOf[eq], l)
		} else {
			cables = append(cables, l)
		}
	}
	for _, e := range plan.Equipment {
		add("add_equipment:"+e.ID, func(s *topology.Snapshot) error {
			if problem := placementProblem(*s, e.RackID, e.Unit, e.Height, leaving, plan.Labels); problem != "" {
				return invalidf("%s", problem)
			}
			s.Equipment = append(s.Equipment, e)
			s.Subpanels = append(s.Subpanels, subpanelsOf[e.ID]...)
			s.Endpoints = append(s.Endpoints, endpointsOf[e.ID]...)
			s.Links = append(s.Links, bridgesOf[e.ID]...)
			return nil
		})
	}
	out = append(out, strays...)

	seen := map[string]bool{}
	for _, pl := range plan.effectivePlacements() {
		duplicate := seen[pl.EquipmentID]
		seen[pl.EquipmentID] = true
		add("place_equipment:"+pl.EquipmentID, func(s *topology.Snapshot) error {
			if duplicate {
				return invalidf("duplicate placement for equipment %s", pl.EquipmentID)
			}
			i := slices.IndexFunc(s.Equipment, func(e topology.Equipment) bool { return e.ID == pl.EquipmentID })
			if i < 0 {
				return invalidf("%s", gone(plan.Labels, pl.EquipmentID, "placement references unknown equipment "+pl.EquipmentID))
			}
			if problem := placementProblem(*s, pl.RackID, pl.Unit, s.Equipment[i].Height, withSelf(leaving, pl.EquipmentID), plan.Labels); problem != "" {
				return invalidf("%s", problem)
			}
			s.Equipment[i].RackID, s.Equipment[i].Unit = pl.RackID, pl.Unit
			return nil
		})
	}

	for _, id := range plan.Removals.Links {
		add("remove_cable:"+id, func(s *topology.Snapshot) error {
			i := slices.IndexFunc(s.Links, func(l topology.Link) bool { return l.ID == id })
			if i < 0 {
				return invalidf("%s", gone(plan.Labels, id, "cannot remove unknown cable "+id))
			}
			if s.Links[i].Kind != "cable" {
				return invalidf("%s is a bridge; it goes only with its equipment", id)
			}
			s.Links = slices.Delete(s.Links, i, i+1)
			return nil
		})
	}
	for _, id := range plan.Removals.Equipment {
		add("remove_equipment:"+id, func(s *topology.Snapshot) error {
			i := slices.IndexFunc(s.Equipment, func(e topology.Equipment) bool { return e.ID == id })
			if i < 0 {
				return invalidf("%s", gone(plan.Labels, id, "cannot remove unknown equipment "+id))
			}
			own := map[string]bool{}
			for _, e := range s.Endpoints {
				if e.EquipmentID == id {
					own[e.ID] = true
				}
			}
			s.Equipment = slices.Delete(s.Equipment, i, i+1)
			s.Endpoints = slices.DeleteFunc(s.Endpoints, func(e topology.Endpoint) bool { return e.EquipmentID == id })
			s.Subpanels = slices.DeleteFunc(s.Subpanels, func(sp topology.Subpanel) bool { return sp.EquipmentID == id })
			s.Links = slices.DeleteFunc(s.Links, func(l topology.Link) bool { return own[l.A] || own[l.B] })
			return nil
		})
	}
	for _, rm := range []struct {
		kind RemovalKind
		ids  []string
	}{{RemoveRack, plan.Removals.Racks}, {RemoveNode, plan.Removals.Nodes}, {RemoveSite, plan.Removals.Sites}} {
		for _, id := range rm.ids {
			add("remove_"+string(rm.kind)+":"+id, func(s *topology.Snapshot) error {
				if err := containerRemovable(*s, rm.kind, id, plan.Labels); err != nil {
					return err
				}
				switch rm.kind {
				case RemoveRack:
					s.Racks = slices.DeleteFunc(s.Racks, func(r topology.Rack) bool { return r.ID == id })
				case RemoveNode:
					s.Nodes = slices.DeleteFunc(s.Nodes, func(n topology.LocationNode) bool { return n.ID == id })
				case RemoveSite:
					s.Sites = slices.DeleteFunc(s.Sites, func(site topology.Site) bool { return site.ID == id })
				}
				return nil
			})
		}
	}

	for _, l := range cables {
		add("add_cable:"+l.ID, func(s *topology.Snapshot) error {
			if problem := cableProblem(*s, l.A, l.B, plan.Labels); problem != "" {
				return invalidf("%s", problem)
			}
			s.Links = append(s.Links, l)
			return nil
		})
	}
	return out
}

// withSelf is the set plus one more equipment, without changing the set.
func withSelf(set map[string]bool, id string) map[string]bool {
	out := make(map[string]bool, len(set)+1)
	for k := range set {
		out[k] = true
	}
	out[id] = true
	return out
}
