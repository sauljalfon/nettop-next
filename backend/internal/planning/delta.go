package planning

import (
	"fmt"
	"slices"

	"nettop.local/backend/internal/topology"
)

// Delta is the difference between the installed snapshot and a proposed one,
// found by object ID. Recording writes exactly this; it never replays plan
// fields, so Apply stays the single source of truth.
type Delta struct {
	// RemovedCables are the removed links of kind "cable" (a subset of
	// RemovedLinks; bridges go with their equipment and are not listed).
	RemovedCables []string

	RemovedLinks, RemovedEndpoints, RemovedSubpanels, RemovedEquipment, RemovedRacks, RemovedNodes, RemovedSites []string

	AddedSites     []topology.Site
	AddedNodes     []topology.LocationNode
	AddedRacks     []topology.Rack
	AddedEquipment []topology.Equipment
	AddedSubpanels []topology.Subpanel
	AddedEndpoints []topology.Endpoint
	AddedLinks     []topology.Link
	// Moved holds the new rack and unit of equipment present in both.
	Moved []topology.Equipment
}

// Diff compares installed with proposed. Any change to an existing object other
// than an equipment placement (rack and unit) is a bug in the plan or in Apply,
// so it returns an error instead of silently ignoring it.
func Diff(installed, proposed topology.Snapshot) (Delta, error) {
	var d Delta
	if !slices.Equal(installed.Networks, proposed.Networks) {
		return d, fmt.Errorf("networks changed between installed and proposed")
	}
	var err error
	d.RemovedSites, d.AddedSites, err = byID("site", installed.Sites, proposed.Sites, func(s topology.Site) string { return s.ID }, func(a, b topology.Site) bool { return a == b })
	if err != nil {
		return d, err
	}
	d.RemovedNodes, d.AddedNodes, err = byID("node", installed.Nodes, proposed.Nodes, func(n topology.LocationNode) string { return n.ID }, func(a, b topology.LocationNode) bool { return a == b })
	if err != nil {
		return d, err
	}
	d.RemovedRacks, d.AddedRacks, err = byID("rack", installed.Racks, proposed.Racks, func(r topology.Rack) string { return r.ID }, func(a, b topology.Rack) bool { return a == b })
	if err != nil {
		return d, err
	}
	d.RemovedEquipment, d.AddedEquipment, err = byID("equipment", installed.Equipment, proposed.Equipment, func(e topology.Equipment) string { return e.ID }, func(a, b topology.Equipment) bool {
		if a != b {
			a.RackID, a.Unit = b.RackID, b.Unit // a placement is the one allowed change
			return a == b
		}
		return true
	})
	if err != nil {
		return d, err
	}
	was := map[string]topology.Equipment{}
	for _, e := range installed.Equipment {
		was[e.ID] = e
	}
	for _, e := range proposed.Equipment {
		if old, ok := was[e.ID]; ok && (old.RackID != e.RackID || old.Unit != e.Unit) {
			d.Moved = append(d.Moved, e)
		}
	}
	d.RemovedSubpanels, d.AddedSubpanels, err = byID("subpanel", installed.Subpanels, proposed.Subpanels, func(s topology.Subpanel) string { return s.ID }, func(a, b topology.Subpanel) bool { return a == b })
	if err != nil {
		return d, err
	}
	d.RemovedEndpoints, d.AddedEndpoints, err = byID("endpoint", installed.Endpoints, proposed.Endpoints, func(e topology.Endpoint) string { return e.ID }, func(a, b topology.Endpoint) bool { return a == b })
	if err != nil {
		return d, err
	}
	d.RemovedLinks, d.AddedLinks, err = byID("link", installed.Links, proposed.Links, func(l topology.Link) string { return l.ID }, func(a, b topology.Link) bool { return a == b })
	if err != nil {
		return d, err
	}
	kind := map[string]string{}
	for _, l := range installed.Links {
		kind[l.ID] = l.Kind
	}
	for _, id := range d.RemovedLinks {
		if kind[id] == "cable" {
			d.RemovedCables = append(d.RemovedCables, id)
		}
	}
	return d, nil
}

// byID returns the IDs only in old, the items only in new, and an error when an
// item in both differs (according to same).
func byID[T any](kind string, old, new []T, id func(T) string, same func(a, b T) bool) (removed []string, added []T, err error) {
	was := make(map[string]T, len(old))
	for _, item := range old {
		was[id(item)] = item
	}
	now := make(map[string]bool, len(new))
	for _, item := range new {
		now[id(item)] = true
		prev, ok := was[id(item)]
		if !ok {
			added = append(added, item)
		} else if !same(prev, item) {
			return nil, nil, fmt.Errorf("%s %s changed in place; only placements may change", kind, id(item))
		}
	}
	for _, item := range old {
		if !now[id(item)] {
			removed = append(removed, id(item))
		}
	}
	return removed, added, nil
}
