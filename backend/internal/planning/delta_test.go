package planning_test

import (
	"slices"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
)

// RC-01 (domain): the delta between installed and the proposed snapshot is
// computed by ID, not by replaying plan fields.
func TestRC01DeltaBetweenInstalledAndProposedByID(t *testing.T) {
	base := acceptance.Installed()
	p := removeAll(t, base, v2Plan(), [2]string{"equipment", "panel-dr"}, [2]string{"link", "cable-a04"})
	p.Placements = []planning.PlacementInput{{EquipmentID: "edge-17", RackID: "rack-core-03", Unit: 2}}
	proposed, err := planning.Apply(base, p)
	if err != nil {
		t.Fatal(err)
	}
	d, err := planning.Diff(base, proposed)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(d.RemovedEquipment, []string{"panel-dr"}) || len(d.RemovedEndpoints) != 48 || len(d.RemovedLinks) != 24+2+1 { // bridges + cable-b01, cable-b02 + cable-a04
		t.Fatalf("removals wrong: %d endpoints, %d links, %v", len(d.RemovedEndpoints), len(d.RemovedLinks), d.RemovedEquipment)
	}
	if len(d.Moved) != 1 || d.Moved[0].ID != "edge-17" || d.Moved[0].RackID != "rack-core-03" || d.Moved[0].Unit != 2 {
		t.Fatalf("moves wrong: %+v", d.Moved)
	}
	if got := slices.Sorted(slices.Values(d.RemovedCables)); !slices.Equal(got, []string{"cable-a04", "cable-b01", "cable-b02"}) {
		t.Fatalf("removed cables (bridges excluded): %v", d.RemovedCables)
	}
	if len(d.AddedEquipment)+len(d.AddedLinks)+len(d.AddedEndpoints)+len(d.AddedRacks) != 0 {
		t.Fatalf("nothing was added: %+v", d)
	}
}

func TestDeltaRefusesAnyOtherChangeToAnExistingObject(t *testing.T) {
	base := acceptance.Installed()
	for name, mutate := range map[string]func(*topologyEdit){
		"equipment renamed": func(e *topologyEdit) { e.s.Equipment[0].Name = "RENAMED" },
		"site renamed":      func(e *topologyEdit) { e.s.Sites[0].Name = "RENAMED" },
		"rack resized":      func(e *topologyEdit) { e.s.Racks[0].Units = 20 },
		"link rewired":      func(e *topologyEdit) { e.s.Links[len(e.s.Links)-1].A = "agg-15:p1" },
		"endpoint relabel":  func(e *topologyEdit) { e.s.Endpoints[0].Label = "X" },
	} {
		t.Run(name, func(t *testing.T) {
			e := &topologyEdit{s: cloneForEdit(base)}
			mutate(e)
			if _, err := planning.Diff(base, e.s); err == nil || !strings.Contains(err.Error(), "changed") {
				t.Fatalf("want an error naming the change, got %v", err)
			}
		})
	}
}
