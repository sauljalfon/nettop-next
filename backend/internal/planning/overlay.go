package planning

import (
	"errors"
	"fmt"
	"nettop.local/backend/internal/topology"
	"slices"
)

var ErrConflict = errors.New("revision conflict")
var ErrNotFound = errors.New("not found")

// Plan records equipment/cable additions and explicit placement updates.
type Plan struct {
	ID           string               `json:"id"`
	Name         string               `json:"name"`
	BaseRevision string               `json:"baseRevision"`
	Revision     string               `json:"revision"`
	Equipment    []topology.Equipment `json:"equipment"`
	Updates      []topology.Equipment `json:"updates"`
	Endpoints    []topology.Endpoint  `json:"endpoints"`
	Links        []topology.Link      `json:"links"`
}

func Apply(base topology.Snapshot, plan Plan) (topology.Snapshot, error) {
	if base.Revision != plan.BaseRevision {
		return topology.Snapshot{}, fmt.Errorf("%w: installed topology changed; review the plan against its new base", ErrConflict)
	}
	if err := topology.Validate(base); err != nil {
		return topology.Snapshot{}, err
	}
	next := base
	next.Networks = slices.Clone(base.Networks)
	next.Subpanels = slices.Clone(base.Subpanels)
	next.Sites = slices.Clone(base.Sites)
	next.Nodes = slices.Clone(base.Nodes)
	next.Racks = slices.Clone(base.Racks)
	next.Equipment = slices.Clone(base.Equipment)
	seenUpdates := map[string]bool{}
	for _, update := range plan.Updates {
		if seenUpdates[update.ID] {
			return topology.Snapshot{}, fmt.Errorf("%w: duplicate equipment update", ErrInvalid)
		}
		seenUpdates[update.ID] = true
		found := false
		for i, equipment := range next.Equipment {
			if equipment.ID == update.ID {
				if equipment.Name != update.Name || equipment.Kind != update.Kind || equipment.Role != update.Role || equipment.NetworkID != update.NetworkID || equipment.Height != update.Height {
					return topology.Snapshot{}, fmt.Errorf("%w: placement updates cannot change equipment properties", ErrInvalid)
				}
				next.Equipment[i] = update
				found = true
				break
			}
		}
		if !found {
			return topology.Snapshot{}, fmt.Errorf("%w: plan update references unknown equipment %s", ErrInvalid, update.ID)
		}
	}
	next.Equipment = append(next.Equipment, plan.Equipment...)
	next.Endpoints = append(slices.Clone(base.Endpoints), plan.Endpoints...)
	next.Links = append(slices.Clone(base.Links), plan.Links...)
	next.Context = "planned"
	next.Revision = base.Revision + "/" + plan.ID + "@" + plan.Revision
	return next, topology.Validate(next)
}
