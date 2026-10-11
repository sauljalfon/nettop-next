package planning

import (
	"maps"
	"slices"

	"nettop.local/backend/internal/topology"
)

// refs are the IDs a plan names, by kind.
type refs struct {
	equipment, racks, nodes, sites, endpoints, links map[string]bool
}

func newRefs() refs {
	return refs{map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}}
}

// planRefs lists the objects the plan itself names: what it adds, moves, removes
// or cables (cables by their ends, a removed cable by its own ID).
func planRefs(p Plan) refs {
	r := newRefs()
	for _, s := range p.Sites {
		r.sites[s.ID] = true
	}
	for _, n := range p.Nodes {
		r.nodes[n.ID], r.sites[n.SiteID] = true, true
	}
	for _, k := range p.Racks {
		r.racks[k.ID], r.nodes[k.NodeID] = true, true
	}
	for _, e := range p.Equipment {
		r.equipment[e.ID], r.racks[e.RackID] = true, true
	}
	for _, pl := range p.effectivePlacements() {
		r.equipment[pl.EquipmentID], r.racks[pl.RackID] = true, true
	}
	for _, id := range p.Removals.Equipment {
		r.equipment[id] = true
	}
	for _, id := range p.Removals.Racks {
		r.racks[id] = true
	}
	for _, id := range p.Removals.Nodes {
		r.nodes[id] = true
	}
	for _, id := range p.Removals.Sites {
		r.sites[id] = true
	}
	for _, id := range p.Removals.Links {
		r.links[id] = true
	}
	for _, l := range p.Links {
		if l.Kind != "internal" {
			r.endpoints[l.A], r.endpoints[l.B] = true, true
		}
	}
	// An update names its object, whatever kind it is; the sets are matched
	// against real objects of the right kind, so naming all of them is harmless.
	for _, u := range p.Details {
		r.equipment[u.ID], r.racks[u.ID], r.nodes[u.ID], r.sites[u.ID], r.endpoints[u.ID], r.links[u.ID] = true, true, true, true, true, true
	}
	return r
}

func (r refs) has(id string) bool {
	return r.equipment[id] || r.racks[id] || r.nodes[id] || r.sites[id] || r.endpoints[id] || r.links[id]
}

// planLabels names the objects a plan touches, as the user knows them: equipment,
// racks, nodes and sites by name, an endpoint as "Equipment · label", a removed
// cable as "A ↔ B". Names come from the snapshots in order (the proposed one
// first, then Installed, which still has what the plan removes); a name already
// in p.Labels is kept when no snapshot knows the object any more.
func planLabels(p Plan, lookups ...topology.Snapshot) map[string]string {
	want := planRefs(p)
	// The racks things come from, and the ends of removed cables, are only in Installed.
	for _, s := range lookups {
		for _, e := range s.Equipment {
			if want.equipment[e.ID] {
				want.racks[e.RackID] = true
			}
		}
		for _, l := range s.Links {
			if want.links[l.ID] {
				want.endpoints[l.A], want.endpoints[l.B] = true, true
			}
		}
	}
	for _, s := range lookups {
		for _, r := range s.Racks {
			if want.racks[r.ID] {
				want.nodes[r.NodeID] = true
			}
		}
		for _, n := range s.Nodes {
			if want.nodes[n.ID] {
				want.sites[n.SiteID] = true
			}
		}
	}
	out := maps.Clone(p.Labels)
	if out == nil {
		out = map[string]string{}
	}
	names := map[string]string{}
	for _, s := range slices.Backward(lookups) { // earlier snapshots win
		for _, e := range s.Equipment {
			names[e.ID] = e.Name
		}
	}
	set := func(id, name string) {
		if name != "" {
			out[id] = name
		}
	}
	seen := map[string]bool{}
	for _, s := range lookups {
		for _, e := range s.Equipment {
			if want.equipment[e.ID] && !seen["e"+e.ID] {
				seen["e"+e.ID] = true
				set(e.ID, e.Name)
			}
		}
		for _, r := range s.Racks {
			if want.racks[r.ID] && !seen["r"+r.ID] {
				seen["r"+r.ID] = true
				set(r.ID, r.Name)
			}
		}
		for _, n := range s.Nodes {
			if want.nodes[n.ID] && !seen["n"+n.ID] {
				seen["n"+n.ID] = true
				set(n.ID, n.Name)
			}
		}
		for _, x := range s.Sites {
			if want.sites[x.ID] && !seen["s"+x.ID] {
				seen["s"+x.ID] = true
				set(x.ID, x.Name)
			}
		}
		for _, ep := range s.Endpoints {
			if want.endpoints[ep.ID] && !seen["p"+ep.ID] {
				seen["p"+ep.ID] = true
				set(ep.ID, names[ep.EquipmentID]+" · "+ep.Label)
			}
		}
	}
	for _, s := range lookups {
		for _, l := range s.Links {
			if want.links[l.ID] && !seen["l"+l.ID] {
				seen["l"+l.ID] = true
				a, b := out[l.A], out[l.B]
				if a != "" && b != "" {
					out[l.ID] = a + " ↔ " + b
				}
			}
		}
	}
	return out
}

// pruneLabels drops the labels no change of the plan names any more.
func pruneLabels(p Plan) map[string]string {
	want := planRefs(p)
	out := map[string]string{}
	for id, name := range p.Labels {
		if want.has(id) {
			out[id] = name
		}
	}
	return out
}

// RecordLabels are the labels a plan is saved with when recorded: everything its
// changes name, plus every object of the delta (what Installed lost, gained or
// moved), so a recorded plan keeps naming things that are no longer in Installed.
func RecordLabels(installed, proposed topology.Snapshot, p Plan, d Delta) map[string]string {
	out := planLabels(p, proposed, installed)
	// ID → name, built once; the proposed snapshot wins over Installed.
	names := map[string]string{}
	for _, s := range []topology.Snapshot{installed, proposed} {
		for _, e := range s.Equipment {
			names[e.ID] = e.Name
		}
		for _, r := range s.Racks {
			names[r.ID] = r.Name
		}
		for _, n := range s.Nodes {
			names[n.ID] = n.Name
		}
		for _, x := range s.Sites {
			names[x.ID] = x.Name
		}
	}
	name := func(id string) {
		if n, ok := names[id]; ok {
			out[id] = n
		}
	}
	for _, ids := range [][]string{d.RemovedEquipment, d.RemovedRacks, d.RemovedNodes, d.RemovedSites} {
		for _, id := range ids {
			name(id)
		}
	}
	for _, e := range d.AddedEquipment {
		out[e.ID] = e.Name
	}
	for _, e := range d.Moved {
		out[e.ID] = e.Name
		name(e.RackID)
	}
	for _, r := range d.AddedRacks {
		out[r.ID] = r.Name
	}
	for _, n := range d.AddedNodes {
		out[n.ID] = n.Name
	}
	for _, s := range d.AddedSites {
		out[s.ID] = s.Name
	}
	return out
}

// gone says an object a change depends on is no longer there, in its name when
// the plan kept one ("PANEL-A · 10 · Front no longer exists").
func gone(labels map[string]string, id, plain string) string {
	if name := labels[id]; name != "" {
		return name + " no longer exists"
	}
	return plain
}
