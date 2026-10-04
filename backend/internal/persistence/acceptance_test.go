package persistence

import (
	"context"
	"reflect"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
)

// The acceptance fixture has no draft plans: seeding it creates only installed
// inventory, and everything survives a reconnect and traces from PostgreSQL.
func TestAcceptanceFixtureSeedsWithoutPlansAndRoundTrips(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	base := acceptance.Installed()
	if err := s.Seed(ctx, base); err != nil {
		t.Fatal(err)
	}
	if err := s.Seed(ctx, base); err == nil {
		t.Fatal("seed must refuse to overwrite an initialized database")
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	got, err := reopened.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := base
	sortSnapshot(&got)
	sortSnapshot(&want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("the acceptance fixture changed through PostgreSQL")
	}
	if plans, err := reopened.Plans(ctx); err != nil || len(plans) != 0 {
		t.Fatalf("seeding the acceptance fixture must not invent a draft: %d %v", len(plans), err)
	}
	if len(got.Equipment) != 11 || len(got.Subpanels) != 28 || len(got.Networks) != 2 {
		t.Fatalf("unexpected counts: %d equipment, %d subpanels, %d networks", len(got.Equipment), len(got.Subpanels), len(got.Networks))
	}
	var edge17 string
	for _, e := range got.Equipment {
		if e.Name == "EDGE-17" {
			edge17 = e.ID
		}
	}
	r, err := pathfinding.Trace(got, pathfinding.Request{Mode: "distribution", Device: edge17})
	if err != nil || len(r.Routes) != 3 || r.Routes[2].DestinationRole != "backbone" {
		t.Fatalf("loaded fixture must find AGG-03, AGG-08, and BB-01: %+v %v", r, err)
	}
	for _, route := range r.Routes {
		if len(route.Hops) != 7 {
			t.Fatalf("every acceptance route has 7 hops: %+v", route)
		}
	}
}
