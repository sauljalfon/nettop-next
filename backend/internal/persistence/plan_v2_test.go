package persistence

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

// Plan overlay v2 lives in the existing additions JSON: containers, placements
// and removals survive a reconnect and apply on the loaded plan. No migration.
func TestPlanOverlayV2FieldsSurviveReconnectAndApply(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	if err := s.Seed(ctx, acceptance.Installed()); err != nil {
		t.Fatal(err)
	}
	p, err := s.CreatePlan(ctx, "Overlay v2", "acceptance-1")
	if err != nil {
		t.Fatal(err)
	}
	p, err = s.Command(ctx, p.ID, planning.Command{Type: "move_equipment", ExpectedRevision: "1", Placement: &planning.PlacementInput{EquipmentID: "edge-17", RackID: "rack-core-03", Unit: 2}})
	if err != nil {
		t.Fatal(err)
	}
	p.Sites = []topology.Site{{ID: "site-new", Name: "New site"}}
	p.Nodes = []topology.LocationNode{{ID: "node-new", Name: "New node", SiteID: "site-new"}}
	p.Racks = []topology.Rack{{ID: "rack-new", NodeID: "node-new", Name: "New rack", Units: 12}}
	if p, err = p.Remove(acceptance.Installed(), planning.RemoveEquipment, "panel-a"); err != nil {
		t.Fatal(err)
	}
	body, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(ctx, `UPDATE plans SET additions=$2 WHERE id=$1`, p.ID, body); err != nil {
		t.Fatal(err)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	loaded, err := reopened.Plan(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(loaded.Sites, p.Sites) || !reflect.DeepEqual(loaded.Nodes, p.Nodes) || !reflect.DeepEqual(loaded.Racks, p.Racks) ||
		!reflect.DeepEqual(loaded.Placements, p.Placements) || !reflect.DeepEqual(loaded.Removals, p.Removals) {
		t.Fatalf("overlay v2 fields changed through PostgreSQL: %+v", loaded)
	}
	planned, err := reopened.Snapshot(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	installed, err := reopened.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range planned.Equipment {
		if e.ID == "panel-a" {
			t.Fatal("the removal was not applied")
		}
	}
	found := false
	for _, e := range installed.Equipment {
		found = found || e.ID == "panel-a"
	}
	if !found || len(planned.Sites) != len(installed.Sites)+1 {
		t.Fatal("removal escaped the draft, or the container addition was lost")
	}
}
