package persistence

import (
	"context"
	"errors"
	"math"
	"reflect"
	"testing"

	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func mapPositions(t *testing.T, s *Store) map[string][2]float64 {
	t.Helper()
	l, err := s.MapLayout(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if l.Positions == nil {
		t.Fatal("the map layout must carry a non-nil list")
	}
	got := map[string][2]float64{}
	for _, p := range l.Positions {
		got[p.NodeID] = [2]float64{p.X, p.Y}
	}
	return got
}

// CM-01: a saved overview position round-trips, the last write wins, reset clears all.
func TestCM01MapPositionRoundTripLastWriteWinsAndReset(t *testing.T) {
	s, url := seededAcceptance(t)
	ctx := context.Background()
	if got := mapPositions(t, s); len(got) != 0 {
		t.Fatalf("seeding must save no positions: %v", got)
	}
	if err := s.SaveMapPosition(ctx, northSub, 120.5, -40.25); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveMapPosition(ctx, northSub, 300, 80); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveMapPosition(ctx, drAccess, 1, 2); err != nil {
		t.Fatal(err)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	want := map[string][2]float64{northSub: {300, 80}, drAccess: {1, 2}}
	if got := mapPositions(t, reopened); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	l, _ := reopened.MapLayout(ctx)
	if l.Positions[0].NodeID > l.Positions[1].NodeID {
		t.Fatalf("positions must be ordered by node ID: %+v", l.Positions)
	}
	if err = reopened.ResetMapLayout(ctx); err != nil {
		t.Fatal(err)
	}
	if got := mapPositions(t, reopened); len(got) != 0 {
		t.Fatalf("reset must clear every position: %v", got)
	}
	if err = reopened.ResetMapLayout(ctx); err != nil {
		t.Fatalf("resetting an empty layout is fine: %v", err)
	}
}

// CM-01: a deleted node takes its overview position with it.
func TestCM01MapPositionIsRemovedWithItsNode(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	if _, err := s.pool.Exec(ctx, `INSERT INTO location_nodes(id,site_id,name) VALUES('node-temp',$1,'Temp')`, mainCampus); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveMapPosition(ctx, "node-temp", 5, 5); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveMapPosition(ctx, northSub, 6, 6); err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM location_nodes WHERE id='node-temp'`); err != nil {
		t.Fatal(err)
	}
	if got := mapPositions(t, s); !reflect.DeepEqual(got, map[string][2]float64{northSub: {6, 6}}) {
		t.Fatalf("the deleted node's position must go with it: %v", got)
	}
}

// CM-01: unknown nodes and bad numbers are rejected and persist nothing.
func TestCM01InvalidMapWritesAreRejectedAndPersistNothing(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	if err := s.SaveMapPosition(ctx, "node-gone", 1, 1); !errors.Is(err, topology.ErrNodeNotFound) {
		t.Fatalf("unknown node: %v", err)
	}
	invalid := map[string][2]float64{
		"NaN x":         {math.NaN(), 1},
		"NaN y":         {1, math.NaN()},
		"+Inf":          {1, math.Inf(1)},
		"-Inf":          {math.Inf(-1), 1},
		"x above range": {1_000_001, 1},
		"y below range": {1, -1_000_001},
	}
	for name, c := range invalid {
		if err := s.SaveMapPosition(ctx, northSub, c[0], c[1]); !errors.Is(err, topology.ErrInvalidInput) {
			t.Errorf("%s: got %v, want ErrInvalidInput", name, err)
		}
	}
	if err := s.SaveMapPosition(ctx, "node-gone", math.NaN(), 1); !errors.Is(err, topology.ErrInvalidInput) {
		t.Errorf("a bad number is reported before an unknown node: %v", err)
	}
	if err := s.SaveMapPosition(ctx, northSub, 1_000_000, -1_000_000); err != nil {
		t.Fatalf("the range limits themselves are valid: %v", err)
	}
	if got := mapPositions(t, s); !reflect.DeepEqual(got, map[string][2]float64{northSub: {1_000_000, -1_000_000}}) {
		t.Fatalf("rejected writes persisted something: %v", got)
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO map_layouts(node_id,x,y) VALUES($1,'NaN',0)`, drAccess); err == nil {
		t.Error("the table accepted NaN")
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO map_layouts(node_id,x,y) VALUES($1,2000000,0)`, drAccess); err == nil {
		t.Error("the table accepted an out-of-range coordinate")
	}
}

// CM-01: map writes never change a revision or a plan, and are separate from the site screen.
func TestCM01MapWritesKeepRevisionsPlansAndSiteLayoutsUntouched(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	plan, err := s.CreatePlan(ctx, "Draft", "acceptance-1")
	if err != nil {
		t.Fatal(err)
	}
	plan, err = s.Command(ctx, plan.ID, planning.Command{Type: "add_equipment", ExpectedRevision: plan.Revision, Equipment: &planning.EquipmentInput{Name: "NEW-1", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 1, Height: 1, PortCount: 4}})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.SaveNodePosition(ctx, mainCampus, northSub, 11, 22); err != nil {
		t.Fatal(err)
	}
	before, _ := s.Installed(ctx)
	plansBefore, _ := s.Plans(ctx)
	plannedBefore, err := s.Snapshot(ctx, plan.ID)
	if err != nil {
		t.Fatal(err)
	}

	if err = s.SaveMapPosition(ctx, northSub, 9, 9); err != nil {
		t.Fatal(err)
	}
	if got := positions(t, s, mainCampus); !reflect.DeepEqual(got, map[string][2]float64{northSub: {11, 22}}) {
		t.Fatalf("a map write changed the site screen: %v", got)
	}
	if err = s.ResetMapLayout(ctx); err != nil {
		t.Fatal(err)
	}
	if got := positions(t, s, mainCampus); !reflect.DeepEqual(got, map[string][2]float64{northSub: {11, 22}}) {
		t.Fatalf("a map reset changed the site screen: %v", got)
	}
	if err = s.SaveMapPosition(ctx, northSub, 3, 4); err != nil {
		t.Fatal(err)
	}
	if err = s.ResetSiteLayout(ctx, mainCampus); err != nil {
		t.Fatal(err)
	}
	if got := mapPositions(t, s); !reflect.DeepEqual(got, map[string][2]float64{northSub: {3, 4}}) {
		t.Fatalf("a site reset changed the map: %v", got)
	}

	after, _ := s.Installed(ctx)
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("installed topology or revision changed: %q -> %q", before.Revision, after.Revision)
	}
	plansAfter, _ := s.Plans(ctx)
	if !reflect.DeepEqual(plansAfter, plansBefore) {
		t.Fatal("a saved plan changed")
	}
	plannedAfter, err := s.Snapshot(ctx, plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if plannedAfter.Revision != plannedBefore.Revision {
		t.Fatalf("planned revision changed: %q -> %q", plannedBefore.Revision, plannedAfter.Revision)
	}
}
