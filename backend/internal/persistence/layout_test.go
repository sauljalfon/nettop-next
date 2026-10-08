package persistence

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"os"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

const (
	mainCampus = "site-main-campus"
	drSite     = "site-dr"
	northSub   = "node-north-sub-main"
	mainDist   = "node-main-distribution"
	drAccess   = "node-dr-access"
)

func seededAcceptance(t *testing.T) (*Store, string) {
	t.Helper()
	s, url := testStore(t)
	if err := s.Seed(context.Background(), acceptance.Installed()); err != nil {
		t.Fatal(err)
	}
	return s, url
}

func positions(t *testing.T, s *Store, site string) map[string][2]float64 {
	t.Helper()
	l, err := s.SiteLayout(context.Background(), site)
	if err != nil {
		t.Fatal(err)
	}
	if l.SiteID != site || l.Positions == nil {
		t.Fatalf("layout must carry the site and a non-nil list: %+v", l)
	}
	got := map[string][2]float64{}
	for _, p := range l.Positions {
		got[p.NodeID] = [2]float64{p.X, p.Y}
	}
	return got
}

// PHY-14: a saved position round-trips and survives reconnect.
func TestPHY14SavedPositionRoundTripsAndSurvivesReconnect(t *testing.T) {
	s, url := seededAcceptance(t)
	ctx := context.Background()
	if got := positions(t, s, mainCampus); len(got) != 0 {
		t.Fatalf("seeding must save no positions: %v", got)
	}
	if err := s.SaveNodePosition(ctx, mainCampus, northSub, 120.5, -40.25); err != nil {
		t.Fatal(err)
	}
	// Last write wins per node; another node is independent.
	if err := s.SaveNodePosition(ctx, mainCampus, northSub, 300, 80); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveNodePosition(ctx, mainCampus, mainDist, 1, 2); err != nil {
		t.Fatal(err)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	want := map[string][2]float64{northSub: {300, 80}, mainDist: {1, 2}}
	if got := positions(t, reopened, mainCampus); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	if got := positions(t, reopened, drSite); len(got) != 0 {
		t.Fatalf("another site must have none: %v", got)
	}
}

func TestSavedPositionsAreRemovedWithTheirNode(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	if err := s.SaveNodePosition(ctx, drSite, drAccess, 5, 5); err != nil {
		t.Fatal(err)
	}
	// A node row is not deleted by any API yet; the foreign key still cascades.
	if _, err := s.pool.Exec(ctx, `DELETE FROM location_nodes WHERE id=$1`, drAccess); err == nil {
		// equipment rows reference the node through racks; deletion is allowed only if unreferenced.
		t.Fatal("a node with racks must not be deletable")
	}
	var onDelete string
	if err := s.pool.QueryRow(ctx, `SELECT confdeltype::text FROM pg_constraint WHERE conrelid='node_layouts'::regclass AND contype='f'`).Scan(&onDelete); err != nil || onDelete != "c" {
		t.Fatalf("node_layouts must cascade on node delete: %q %v", onDelete, err)
	}
}

// PHY-15: bad requests are rejected with the documented error and persist nothing.
func TestPHY15InvalidLayoutWritesAreRejectedAndPersistNothing(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	if err := s.SaveNodePosition(ctx, "site-gone", northSub, 1, 1); !errors.Is(err, topology.ErrSiteNotFound) {
		t.Fatalf("unknown site: %v", err)
	}
	if _, err := s.SiteLayout(ctx, "site-gone"); !errors.Is(err, topology.ErrSiteNotFound) {
		t.Fatalf("unknown site layout: %v", err)
	}
	if err := s.ResetSiteLayout(ctx, "site-gone"); !errors.Is(err, topology.ErrSiteNotFound) {
		t.Fatalf("unknown site reset: %v", err)
	}
	invalid := map[string]struct {
		node string
		x, y float64
	}{
		"node of another site": {drAccess, 1, 1},
		"unknown node":         {"node-gone", 1, 1},
		"NaN":                  {northSub, math.NaN(), 1},
		"+Inf":                 {northSub, 1, math.Inf(1)},
		"-Inf":                 {northSub, math.Inf(-1), 1},
		"x above range":        {northSub, 1_000_001, 1},
		"y below range":        {northSub, 1, -1_000_001},
	}
	for name, c := range invalid {
		if err := s.SaveNodePosition(ctx, mainCampus, c.node, c.x, c.y); !errors.Is(err, topology.ErrInvalidInput) {
			t.Errorf("%s: got %v, want ErrInvalidInput", name, err)
		}
	}
	if err := s.SaveNodePosition(ctx, mainCampus, northSub, 1_000_000, -1_000_000); err != nil {
		t.Fatalf("the range limits themselves are valid: %v", err)
	}
	if got := positions(t, s, mainCampus); !reflect.DeepEqual(got, map[string][2]float64{northSub: {1_000_000, -1_000_000}}) {
		t.Fatalf("rejected writes persisted something: %v", got)
	}
	if got := positions(t, s, drSite); len(got) != 0 {
		t.Fatalf("rejected writes persisted in DR: %v", got)
	}
	// The database refuses what the API would never send.
	if _, err := s.pool.Exec(ctx, `INSERT INTO node_layouts(node_id,x,y) VALUES($1,'NaN',0)`, drAccess); err == nil {
		t.Error("the table accepted NaN")
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO node_layouts(node_id,x,y) VALUES($1,2000000,0)`, drAccess); err == nil {
		t.Error("the table accepted an out-of-range coordinate")
	}
}

// PHY-16: presentation and reference data never change topology or plans.
func TestPHY16LayoutAndNetworkWritesDoNotChangeRevisionsOrPlans(t *testing.T) {
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
	before, _ := s.Installed(ctx)
	plansBefore, _ := s.Plans(ctx)
	plannedBefore, err := s.Snapshot(ctx, plan.ID)
	if err != nil {
		t.Fatal(err)
	}

	if err = s.SaveNodePosition(ctx, mainCampus, northSub, 9, 9); err != nil {
		t.Fatal(err)
	}
	created, err := s.CreateNetwork(ctx, "Network C")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.RenameNetwork(ctx, "net-a", "Campus A"); err != nil {
		t.Fatal(err)
	}
	if err = s.ResetSiteLayout(ctx, mainCampus); err != nil {
		t.Fatal(err)
	}

	after, _ := s.Installed(ctx)
	if after.Revision != before.Revision {
		t.Fatalf("installed revision changed: %q -> %q", before.Revision, after.Revision)
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
	// Only the networks list differs, and the plan still commands against it.
	after.Networks, before.Networks = nil, nil
	if !reflect.DeepEqual(after, before) {
		t.Fatal("installed topology changed beyond the networks list")
	}
	if _, err = s.Command(ctx, plan.ID, planning.Command{Type: "add_equipment", ExpectedRevision: plan.Revision, Equipment: &planning.EquipmentInput{Name: "NEW-2", Kind: "switch", Role: "access", NetworkID: created.ID, RackID: "rack-a03", Unit: 3, Height: 1, PortCount: 4}}); err != nil {
		t.Fatalf("a draft must stay usable after network writes: %v", err)
	}
}

// PHY-17: delete resets one site's positions only.
func TestPHY17ResetRemovesOnlyThatSitesPositions(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	for _, c := range []struct{ site, node string }{{mainCampus, northSub}, {mainCampus, mainDist}, {drSite, drAccess}} {
		if err := s.SaveNodePosition(ctx, c.site, c.node, 7, 8); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.ResetSiteLayout(ctx, mainCampus); err != nil {
		t.Fatal(err)
	}
	if got := positions(t, s, mainCampus); len(got) != 0 {
		t.Fatalf("Main Campus must be reset: %v", got)
	}
	if got := positions(t, s, drSite); !reflect.DeepEqual(got, map[string][2]float64{drAccess: {7, 8}}) {
		t.Fatalf("DR must keep its position: %v", got)
	}
	if err := s.ResetSiteLayout(ctx, mainCampus); err != nil {
		t.Fatalf("resetting an empty layout is fine: %v", err)
	}
}

func networkNames(t *testing.T, s *Store) []string {
	t.Helper()
	snap, err := s.Installed(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, n := range snap.Networks {
		names = append(names, n.ID+"="+n.Name)
	}
	return names
}

// NET-01: a created network follows the existing ones and takes a switch in a plan.
func TestNET01CreatedNetworkAppearsAfterExistingOnes(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	created, err := s.CreateNetwork(ctx, "  Network C ")
	if err != nil {
		t.Fatal(err)
	}
	if created.Name != "Network C" || !strings.HasPrefix(created.ID, "network-") || len(created.ID) <= len("network-") {
		t.Fatalf("name trimmed and ID server-generated: %+v", created)
	}
	other, err := s.CreateNetwork(ctx, "Network D")
	if err != nil || other.ID == created.ID {
		t.Fatalf("each network gets its own ID: %+v %v", other, err)
	}
	want := []string{"net-a=Network A", "net-b=Network B", created.ID + "=Network C", other.ID + "=Network D"}
	if got := networkNames(t, s); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	plan, err := s.CreatePlan(ctx, "Use C", "acceptance-1")
	if err != nil {
		t.Fatal(err)
	}
	plan, err = s.Command(ctx, plan.ID, planning.Command{Type: "add_equipment", ExpectedRevision: plan.Revision, Equipment: &planning.EquipmentInput{Name: "EDGE-C", Kind: "switch", Role: "access", NetworkID: created.ID, RackID: "rack-a03", Unit: 1, Height: 1, PortCount: 4}})
	if err != nil {
		t.Fatalf("a switch must be addable to the new network: %v", err)
	}
	planned, err := s.Snapshot(ctx, plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if planned.Networks[2].ID != created.ID {
		t.Fatalf("planned snapshots list networks in the same order: %+v", planned.Networks)
	}
}

// NET-02: renaming changes only the display name.
func TestNET02RenameKeepsIDMembershipAndOrder(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	c, err := s.CreateNetwork(ctx, "Network C")
	if err != nil {
		t.Fatal(err)
	}
	before, _ := s.Installed(ctx)
	got, err := s.RenameNetwork(ctx, "net-a", " Campus A ")
	if err != nil || got.ID != "net-a" || got.Name != "Campus A" {
		t.Fatalf("%+v %v", got, err)
	}
	// Renaming a network to its own name in another case is the same network.
	if _, err = s.RenameNetwork(ctx, "net-b", "NETWORK b"); err != nil {
		t.Fatalf("case-only rename of itself: %v", err)
	}
	after, _ := s.Installed(ctx)
	want := []string{"net-a=Campus A", "net-b=NETWORK b", c.ID + "=Network C"}
	if got := networkNames(t, s); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	if !reflect.DeepEqual(after.Equipment, before.Equipment) || !reflect.DeepEqual(after.Links, before.Links) {
		t.Fatal("membership or cables changed by a rename")
	}
	if after.Revision != before.Revision {
		t.Fatal("rename changed the revision")
	}
}

// NET-03: invalid names, unknown IDs.
func TestNET03NetworkNameAndIDRules(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	long := strings.Repeat("é", 65)
	for name, n := range map[string]string{"empty": "", "blank": "  \t", "too long": long} {
		if _, err := s.CreateNetwork(ctx, n); !errors.Is(err, topology.ErrInvalidInput) {
			t.Errorf("create %s: %v", name, err)
		}
		if _, err := s.RenameNetwork(ctx, "net-a", n); !errors.Is(err, topology.ErrInvalidInput) {
			t.Errorf("rename %s: %v", name, err)
		}
	}
	if _, err := s.CreateNetwork(ctx, strings.Repeat("é", 64)); err != nil {
		t.Fatalf("64 characters are allowed (counted as characters, not bytes): %v", err)
	}
	for _, dup := range []string{"network a", "NETWORK A", "  Network A  "} {
		if _, err := s.CreateNetwork(ctx, dup); !errors.Is(err, topology.ErrDuplicateName) {
			t.Errorf("create %q: %v", dup, err)
		}
		if _, err := s.RenameNetwork(ctx, "net-b", dup); !errors.Is(err, topology.ErrDuplicateName) {
			t.Errorf("rename %q: %v", dup, err)
		}
	}
	if _, err := s.RenameNetwork(ctx, "net-gone", "Whatever"); !errors.Is(err, topology.ErrNetworkNotFound) {
		t.Fatalf("unknown ID: %v", err)
	}
	if got := networkNames(t, s); len(got) != 3 || got[0] != "net-a=Network A" || got[1] != "net-b=Network B" {
		t.Fatalf("rejected writes changed networks: %v", got)
	}
}

func TestMigrations005And006AreRecordedOnceAndChecksummed(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	for range 2 {
		if err := s.Migrate(ctx); err != nil {
			t.Fatalf("replay failed: %v", err)
		}
	}
	for _, name := range []string{"005_site_layouts.sql", "006_network_order.sql"} {
		var applied int
		if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations WHERE name=$1`, name).Scan(&applied); err != nil || applied != 1 {
			t.Fatalf("%s must be recorded exactly once: %d %v", name, applied, err)
		}
		if _, err := s.pool.Exec(ctx, `UPDATE schema_migrations SET checksum='tampered' WHERE name=$1`, name); err != nil {
			t.Fatal(err)
		}
		if err := s.Migrate(ctx); err == nil || !strings.Contains(err.Error(), "modified after application") || !strings.Contains(err.Error(), name) {
			t.Fatalf("%s: modified checksum not detected: %v", name, err)
		}
		if _, err := s.pool.Exec(ctx, `UPDATE schema_migrations SET checksum=$2 WHERE name=$1`, name, checksumOf(t, name)); err != nil {
			t.Fatal(err)
		}
	}
}

// rewindToBeforeNetworkOrder restores the schema produced by migrations 001–005.
func rewindToBeforeNetworkOrder(t *testing.T, s *Store) {
	t.Helper()
	_, err := s.pool.Exec(context.Background(), `
DROP INDEX networks_name_unique;
ALTER TABLE networks DROP COLUMN seq;
DROP SEQUENCE IF EXISTS networks_seq;
DELETE FROM schema_migrations WHERE name='006_network_order.sql'`)
	if err != nil {
		t.Fatal(err)
	}
}

// Existing networks keep today's ID order when the creation order is added.
func TestMigration006ExistingNetworksKeepIDOrder(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	rewindToBeforeNetworkOrder(t, s)
	if _, err := s.pool.Exec(ctx, `INSERT INTO networks(id,name) VALUES('zeta','Zeta'),('alpha','Alpha'),('mid','Mid')`); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	rows, err := s.pool.Query(ctx, `SELECT id FROM networks ORDER BY seq`)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	rows.Close()
	if !reflect.DeepEqual(ids, []string{"alpha", "mid", "zeta"}) {
		t.Fatalf("creation order must follow today's ID order: %v", ids)
	}
	next, err := s.CreateNetwork(ctx, "Newest")
	if err != nil {
		t.Fatal(err)
	}
	var last string
	if err = s.pool.QueryRow(ctx, `SELECT id FROM networks ORDER BY seq DESC LIMIT 1`).Scan(&last); err != nil || last != next.ID {
		t.Fatalf("a new network must come last: %q %v", last, err)
	}
}

// The preflight refuses colliding names and never renames anything.
func TestMigration006PreflightRefusesCollidingNames(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	rewindToBeforeNetworkOrder(t, s)
	if _, err := s.pool.Exec(ctx, `INSERT INTO networks(id,name) VALUES('a','Campus'),('b','campus '),('c','Other')`); err != nil {
		t.Fatal(err)
	}
	err := s.Migrate(ctx)
	if err == nil || !strings.Contains(err.Error(), "migration 006") || !strings.Contains(err.Error(), "never renames") {
		t.Fatalf("collision must stop the migration with a clear error: %v", err)
	}
	rows, qerr := s.pool.Query(ctx, `SELECT name FROM networks ORDER BY id`)
	if qerr != nil {
		t.Fatal(qerr)
	}
	var names []string
	for rows.Next() {
		var n string
		if qerr = rows.Scan(&n); qerr != nil {
			t.Fatal(qerr)
		}
		names = append(names, n)
	}
	rows.Close()
	if !reflect.DeepEqual(names, []string{"Campus", "campus ", "Other"}) {
		t.Fatalf("nothing may be renamed: %q", names)
	}
	var recorded int
	if qerr = s.pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations WHERE name='006_network_order.sql'`).Scan(&recorded); qerr != nil || recorded != 0 {
		t.Fatalf("a refused migration must not be recorded: %d %v", recorded, qerr)
	}
	var column int
	if qerr = s.pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='networks' AND column_name='seq'`).Scan(&column); qerr != nil || column != 0 {
		t.Fatalf("a refused migration must change nothing: %d %v", column, qerr)
	}
}

// Migration 005 can be re-created from nothing and refuses nothing it should keep.
func TestMigration005CreatesLayoutTableAndReapplies(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	if _, err := s.pool.Exec(ctx, `DROP TABLE node_layouts; DELETE FROM schema_migrations WHERE name='005_site_layouts.sql'`); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(ctx, `SELECT node_id,x,y,updated_at FROM node_layouts`); err != nil {
		t.Fatal(err)
	}
}

// checksumOf is the checksum the runner stores: sha256 of the embedded file.
func checksumOf(t *testing.T, name string) string {
	t.Helper()
	body, err := os.ReadFile("../../migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return fmt.Sprintf("%x", sha256.Sum256(body))
}
