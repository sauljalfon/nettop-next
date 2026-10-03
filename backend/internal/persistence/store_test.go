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
	apply(planning.Command{Type: "add_equipment", Equipment: &planning.EquipmentInput{Name: "NEW-EDGE", Kind: "switch", Role: "access", NetworkID: "net-prototype", RackID: "rack-03", Unit: 4, Height: 1, PortCount: 1}})
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
	c := planning.Command{Type: "add_equipment", ExpectedRevision: p.Revision, Equipment: &planning.EquipmentInput{Name: "EDGE-03", Kind: "switch", Role: "access", NetworkID: "net-prototype", RackID: "rack-03", Unit: 4, Height: 1, PortCount: 2}}
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

func TestNetworksAndMembershipPersistAndAreEnforcedByDatabase(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	if err := s.Seed(ctx, sample.Installed(), sample.Expansion()); err != nil {
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
	if len(got.Networks) != 1 || got.Networks[0].ID != "net-prototype" {
		t.Fatalf("networks did not persist: %+v", got.Networks)
	}
	for _, e := range got.Equipment {
		if (e.Kind == "switch") != (e.NetworkID == "net-prototype") {
			t.Fatalf("membership wrong for %+v", e)
		}
	}
	rejected := map[string]string{
		"switch without network": `INSERT INTO equipment(id,name,kind,role,rack_id,unit,height,network_id) VALUES('x1','X1','switch','access','rack-03',1,1,NULL)`,
		"switch unknown network": `INSERT INTO equipment(id,name,kind,role,rack_id,unit,height,network_id) VALUES('x2','X2','switch','access','rack-03',1,1,'missing')`,
		"panel with network":     `INSERT INTO equipment(id,name,kind,role,rack_id,unit,height,network_id) VALUES('x3','X3','panel','passive','rack-03',1,1,'net-prototype')`,
	}
	for name, statement := range rejected {
		if _, err := reopened.pool.Exec(ctx, statement); err == nil {
			t.Errorf("database accepted %s", name)
		}
	}
}

func TestSavedPlanCarriesNetworkMembershipThroughPersistence(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	if err := s.Seed(ctx, sample.Installed(), sample.Expansion()); err != nil {
		t.Fatal(err)
	}
	p, err := s.CreatePlan(ctx, "Network plan", "sample-1")
	if err != nil {
		t.Fatal(err)
	}
	good := planning.Command{Type: "add_equipment", ExpectedRevision: "1", Equipment: &planning.EquipmentInput{Name: "BB-NEW", Kind: "switch", Role: "backbone", NetworkID: "net-prototype", RackID: "rack-03", Unit: 4, Height: 1, PortCount: 1}}
	bad := good
	badEquipment := *good.Equipment
	badEquipment.NetworkID = "missing"
	bad.Equipment = &badEquipment
	// A04: an invalid command leaves the persisted draft and revision unchanged.
	if _, err := s.Command(ctx, p.ID, bad); !errors.Is(err, planning.ErrInvalid) {
		t.Fatalf("unknown network accepted: %v", err)
	}
	if loaded, _ := s.Plan(ctx, p.ID); loaded.Revision != "1" || len(loaded.Equipment) != 0 {
		t.Fatalf("invalid command changed the draft: %+v", loaded)
	}
	if _, err := s.Command(ctx, p.ID, good); err != nil {
		t.Fatal(err)
	}
	planned, err := s.Snapshot(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range planned.Equipment {
		if e.Name == "BB-NEW" && (e.NetworkID != "net-prototype" || e.Role != "backbone") {
			t.Fatalf("plan lost membership/role: %+v", e)
		}
	}
	if len(planned.Networks) != 1 {
		t.Fatalf("planned snapshot lacks networks: %+v", planned.Networks)
	}
}

// D15: the upgrade never invents membership. It must fail with a clear
// preflight error before altering anything when membership is unknown.
func rewindToBeforeNetworks(t *testing.T, s *Store) {
	t.Helper()
	_, err := s.pool.Exec(context.Background(), `ALTER TABLE equipment DROP COLUMN network_id; DROP TABLE networks; DELETE FROM schema_migrations WHERE name='003_networks.sql'`)
	if err != nil {
		t.Fatal(err)
	}
}

func TestNetworkMigrationPreflightRefusesUnknownMembership(t *testing.T) {
	seedLegacy := map[string]string{
		"installed switch":  `INSERT INTO installed_topology VALUES(true,'r1','Site','Room'); INSERT INTO racks VALUES('rk','Rack',12,'node-server'); INSERT INTO equipment(id,name,kind,role,rack_id,unit,height) VALUES('sw','SW','switch','access','rk',1,1)`,
		"saved plan switch": `INSERT INTO plans(id,name,base_revision,revision,additions) VALUES('p','Plan','r1',1,'{"equipment":[{"id":"e","name":"E","kind":"switch","role":"access","rackId":"rk","unit":2,"height":1}],"updates":[],"endpoints":[],"links":[]}')`,
	}
	for name, statement := range seedLegacy {
		t.Run(name, func(t *testing.T) {
			s, _ := testStore(t)
			ctx := context.Background()
			rewindToBeforeNetworks(t, s)
			if _, err := s.pool.Exec(ctx, `INSERT INTO sites VALUES('s','Site'); INSERT INTO location_nodes VALUES('node-server','s','Room'); `+statement); err != nil {
				t.Fatal(err)
			}
			err := s.Migrate(ctx)
			if err == nil || !strings.Contains(err.Error(), "reset the development database and reseed") {
				t.Fatalf("expected a clear preflight error, got %v", err)
			}
			var exists bool
			if err := s.pool.QueryRow(ctx, `SELECT to_regclass('networks') IS NOT NULL`).Scan(&exists); err != nil || exists {
				t.Fatalf("preflight failure must not alter the schema (exists=%v err=%v)", exists, err)
			}
			var n int
			if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations WHERE name='003_networks.sql'`).Scan(&n); err != nil || n != 0 {
				t.Fatal("failed migration was recorded as applied")
			}
		})
	}
}

func TestNetworkMigrationUpgradesWithoutSwitchesAndAssignsNoDefaultNetwork(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	rewindToBeforeNetworks(t, s)
	_, err := s.pool.Exec(ctx, `INSERT INTO sites VALUES('s','Site'); INSERT INTO location_nodes VALUES('node-server','s','Room'); INSERT INTO installed_topology VALUES(true,'r1','Site','Room'); INSERT INTO racks VALUES('rk','Rack',12,'node-server'); INSERT INTO equipment(id,name,kind,role,rack_id,unit,height) VALUES('pn','PN','panel','passive','rk',1,1); INSERT INTO plans(id,name,base_revision,revision,additions) VALUES('p','Plan','r1',1,'{"equipment":[],"updates":[],"endpoints":[],"links":[]}')`)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	var networks int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM networks`).Scan(&networks); err != nil || networks != 0 {
		t.Fatalf("migration must not create a default network (count=%d err=%v)", networks, err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("migration is not repeatable: %v", err)
	}
}

// A plan whose additions store "equipment": null (or a non-array) holds no
// switches, so the preflight must pass instead of erroring in Postgres.
func TestNetworkMigrationPreflightToleratesNonArrayPlanEquipment(t *testing.T) {
	for name, additions := range map[string]string{
		"null equipment":    `{"equipment":null,"updates":[],"endpoints":[],"links":[]}`,
		"missing equipment": `{"updates":[],"endpoints":[],"links":[]}`,
		"object equipment":  `{"equipment":{},"updates":[],"endpoints":[],"links":[]}`,
	} {
		t.Run(name, func(t *testing.T) {
			s, _ := testStore(t)
			ctx := context.Background()
			rewindToBeforeNetworks(t, s)
			if _, err := s.pool.Exec(ctx, `INSERT INTO plans(id,name,base_revision,revision,additions) VALUES('p','Plan','r1',1,$1)`, additions); err != nil {
				t.Fatal(err)
			}
			if err := s.Migrate(ctx); err != nil {
				t.Fatalf("preflight failed on %s: %v", name, err)
			}
		})
	}
}
