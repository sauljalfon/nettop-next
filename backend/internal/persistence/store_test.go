package persistence

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/sample"
	"nettop.local/backend/internal/topology"
)

func testStore(t *testing.T) (*Store, string) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run isolated PostgreSQL integration tests")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); admin.Close() })
	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	scoped := url + sep + "search_path=" + schema
	store, err := Open(ctx, scoped)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Close)
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	return store, scoped
}

func TestRoundTripSurvivesReconnectAndSeedIsNonDestructive(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	base := sample.Installed()
	plan := sample.Expansion()
	if err := s.Seed(ctx, base, plan); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
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
	sort.Slice(base.Sites, func(i, j int) bool { return base.Sites[i].ID < base.Sites[j].ID })
	sort.Slice(base.Nodes, func(i, j int) bool { return base.Nodes[i].ID < base.Nodes[j].ID })
	sort.Slice(base.Racks, func(i, j int) bool { return base.Racks[i].ID < base.Racks[j].ID })
	sort.Slice(base.Equipment, func(i, j int) bool { return base.Equipment[i].ID < base.Equipment[j].ID })
	sort.Slice(base.Endpoints, func(i, j int) bool { return base.Endpoints[i].ID < base.Endpoints[j].ID })
	sort.Slice(base.Links, func(i, j int) bool { return base.Links[i].ID < base.Links[j].ID })
	if !reflect.DeepEqual(got, base) {
		t.Fatalf("round trip changed installed topology:\n got %+v\nwant %+v", got, base)
	}
	if err := reopened.Seed(ctx, base, plan); err == nil {
		t.Fatal("seed must refuse to overwrite an initialized database")
	}
	loaded, err := reopened.Plan(ctx, plan.ID)
	if err != nil || loaded.BaseRevision != base.Revision {
		t.Fatalf("lost plan %+v %v", loaded, err)
	}
}

func TestSavedPanelPlanTracesAfterReconnect(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	if err := s.Seed(ctx, sample.Installed(), sample.Expansion()); err != nil {
		t.Fatal(err)
	}
	p, err := s.CreatePlan(ctx, "Panel installation", "sample-1")
	if err != nil {
		t.Fatal(err)
	}
	apply := func(c planning.Command) {
		t.Helper()
		c.ExpectedRevision = p.Revision
		p, err = s.Command(ctx, p.ID, c)
		if err != nil {
			t.Fatal(err)
		}
	}
	apply(planning.Command{Type: "add_equipment", Equipment: &planning.EquipmentInput{Name: "NEW-EDGE", Kind: "switch", Role: "access", RackID: "rack-03", Unit: 4, Height: 1, PortCount: 1}})
	edgeID := p.Equipment[0].ID
	start := p.Endpoints[0].ID
	apply(planning.Command{Type: "add_equipment", Equipment: &planning.EquipmentInput{Name: "NEW-PANEL", Kind: "panel", Role: "passive", RackID: "rack-04", Unit: 4, Height: 1, PortCount: 1}})
	front, rear := p.Endpoints[1].ID, p.Endpoints[2].ID
	apply(planning.Command{Type: "add_cable", Cable: &planning.CableInput{A: start, B: front}})
	apply(planning.Command{Type: "add_cable", Cable: &planning.CableInput{A: rear, B: "agg-02:p2"}})
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	graph, err := reopened.Snapshot(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range []pathfinding.Request{{Mode: "aggregation", Device: edgeID}, {Mode: "point_to_point", Start: start, End: "agg-02:p2"}} {
		r, err := pathfinding.Trace(graph, req)
		if err != nil {
			t.Fatal(err)
		}
		if r.Status != "reached" || len(r.Routes) != 1 || len(r.Routes[0].Hops) != 3 || r.Routes[0].Hops[1].Kind != "internal" {
			t.Fatalf("persisted planned panel path incorrect: %+v", r)
		}
	}
}

func TestDatabaseRejectsDuplicateEndpointOccupancy(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	if err := s.Seed(ctx, sample.Installed(), sample.Expansion()); err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO links VALUES ('another-cable','cable')`); err != nil {
		t.Fatal(err)
	}
	_, err := s.pool.Exec(ctx, `INSERT INTO link_endpoints(link_id,endpoint_id,kind) VALUES ('another-cable','edge-01:p1','cable')`)
	if err == nil {
		t.Fatal("database accepted a second cable on an occupied endpoint")
	}
}

func TestConcurrentCommandsOnlyOneWinsAndPersists(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	if err := s.Seed(ctx, sample.Installed(), sample.Expansion()); err != nil {
		t.Fatal(err)
	}
	p, err := s.CreatePlan(ctx, "New installation", "sample-1")
	if err != nil {
		t.Fatal(err)
	}
	c := planning.Command{Type: "add_equipment", ExpectedRevision: p.Revision, Equipment: &planning.EquipmentInput{Name: "EDGE-03", Kind: "switch", Role: "access", RackID: "rack-03", Unit: 4, Height: 1, PortCount: 2}}
	errorsCh := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := s.Command(ctx, p.ID, c); errorsCh <- err }()
	}
	wg.Wait()
	close(errorsCh)
	wins, conflicts := 0, 0
	for err := range errorsCh {
		if err == nil {
			wins++
		} else if errors.Is(err, planning.ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("wins=%d conflicts=%d", wins, conflicts)
	}
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	loaded, err := reopened.Plan(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Revision != "2" || len(loaded.Equipment) != 1 {
		t.Fatal("accepted command did not persist")
	}
	c.ExpectedRevision = "2"
	c.Equipment.Name = "Other" // same rack unit must fail without incrementing revision
	if _, err := s.Command(ctx, p.ID, c); !errors.Is(err, planning.ErrInvalid) {
		t.Fatal("placement collision accepted")
	}
	loaded, _ = s.Plan(ctx, p.ID)
	if loaded.Revision != "2" {
		t.Fatal("failed command changed revision")
	}
	base, err := s.Installed(ctx)
	if err != nil || len(base.Equipment) != 4 {
		t.Fatal("plan write changed installed topology")
	}
	if _, err := s.pool.Exec(ctx, `UPDATE installed_topology SET revision='changed'`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Command(ctx, p.ID, c); !errors.Is(err, planning.ErrConflict) {
		t.Fatal("stale base accepted")
	}
	if _, err := s.Snapshot(ctx, p.ID); !errors.Is(err, planning.ErrConflict) {
		t.Fatal("stale plan trace snapshot accepted")
	}
}

func TestPlacementUpdateSurvivesReconnectWithoutMutatingInstalled(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	if err := s.Seed(ctx, sample.Installed(), sample.Expansion()); err != nil {
		t.Fatal(err)
	}
	p, err := s.CreatePlan(ctx, "Move equipment", "sample-1")
	if err != nil {
		t.Fatal(err)
	}
	p, err = s.Command(ctx, p.ID, planning.Command{Type: "move_equipment", ExpectedRevision: "1", Placement: &planning.PlacementInput{EquipmentID: "edge-01", RackID: "rack-04", Unit: 4}})
	if err != nil {
		t.Fatal(err)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	planned, err := reopened.Snapshot(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	installed, err := reopened.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	find := func(s topology.Snapshot, id string) topology.Equipment {
		for _, e := range s.Equipment {
			if e.ID == id {
				return e
			}
		}
		return topology.Equipment{}
	}
	if got := find(planned, "edge-01"); got.RackID != "rack-04" || got.Unit != 4 {
		t.Fatalf("placement did not survive: %+v", got)
	}
	if got := find(installed, "edge-01"); got.RackID != "rack-03" || got.Unit != 8 {
		t.Fatalf("move escaped the draft: %+v", got)
	}
}

func TestHierarchyMigrationPreservesExistingLocations(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	_, err := s.pool.Exec(ctx, `ALTER TABLE racks DROP COLUMN node_id; DROP TABLE location_nodes; DROP TABLE sites; DELETE FROM schema_migrations WHERE name='002_location_hierarchy.sql'; INSERT INTO installed_topology VALUES(true,'existing-revision','Original site','Original room'); INSERT INTO racks VALUES('existing-rack','Existing rack',12);`)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	got, err := s.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got.Revision != "existing-revision" || got.Sites[0].Name != "Original site" || got.Nodes[0].Name != "Original room" || got.Racks[0].NodeID != got.Nodes[0].ID {
		t.Fatalf("migration changed location or identity: %+v", got)
	}
	if _, err = s.pool.Exec(ctx, `UPDATE racks SET node_id='missing'`); err == nil {
		t.Fatal("database accepted an orphan rack")
	}
}

func TestSeedValidationRollsBack(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	bad := sample.Installed()
	bad.Links[0].B = "missing"
	if err := s.Seed(ctx, bad, sample.Expansion()); err == nil {
		t.Fatal("invalid seed accepted")
	}
	if err := s.Seed(ctx, sample.Installed(), sample.Expansion()); err != nil {
		t.Fatalf("failed seed left partial records: %v", err)
	}
}
