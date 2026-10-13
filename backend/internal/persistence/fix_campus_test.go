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
