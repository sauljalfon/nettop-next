package persistence

import (
	"context"
	"testing"
	"time"

	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/scalefixture"
	"nettop.local/backend/internal/topology"
)

// A direct fix loads and validates the whole installed topology while it holds
// the installed lock. This measures it on the campus fixture (a measurement,
// not a budget; the bound only catches a pathological slowdown).
func TestFixOnCampusIsMeasured(t *testing.T) {
	if testing.Short() {
		t.Skip("seeding the campus takes a while")
	}
	s, _ := testStore(t)
	ctx := context.Background()
	campus := scalefixture.Campus()
	if err := s.Seed(ctx, campus); err != nil {
		t.Fatal(err)
	}
	id := campus.Equipment[0].ID
	start := time.Now()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: id, Details: topology.Details{Description: ptr("timed")}}); err != nil {
		t.Fatal(err)
	}
	took := time.Since(start)
	t.Logf("one direct fix on the campus (%d equipment, %d endpoints, %d links): %v",
		len(campus.Equipment), len(campus.Endpoints), len(campus.Links), took)
	if took > 5*time.Second {
		t.Fatalf("a fix took %v", took)
	}
}

// 500 equipment fixes (a model on 500 switches) in one request: ApplyMany
// validates the whole installed topology after each fix, inside the one
// transaction. A measurement, not a budget: there is no time limit.
func TestFixManyOnCampusIsMeasured(t *testing.T) {
	if testing.Short() {
		t.Skip("seeding the campus takes a while")
	}
	s, _ := testStore(t)
	ctx := context.Background()
	campus := scalefixture.Campus()
	if err := s.Seed(ctx, campus); err != nil {
		t.Fatal(err)
	}
	var list []fixes.Fix
	for _, e := range campus.Equipment {
		if e.Kind == "switch" && len(list) < 500 {
			list = append(list, fixes.Fix{Kind: fixes.Equipment, ID: e.ID, Details: topology.Details{Model: ptr("C9300-48P")}})
		}
	}
	if len(list) != 500 {
		t.Fatalf("the campus has only %d switches", len(list))
	}
	start := time.Now()
	entries, err := s.FixMany(ctx, list, "model audit")
	if err != nil {
		t.Fatal(err)
	}
	took := time.Since(start)
	t.Logf("%d direct fixes in one request on the campus (%d equipment, %d endpoints, %d links): %d log rows in %v",
		len(list), len(campus.Equipment), len(campus.Endpoints), len(campus.Links), len(entries), took)
	if len(entries) == 0 {
		t.Fatal("no fix changed anything")
	}
}
