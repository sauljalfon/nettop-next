package persistence

import (
	"context"
	"reflect"
	"sort"
	"strings"
	"testing"

	"nettop.local/backend/internal/sample"
	"nettop.local/backend/internal/topology"
)

// hdfBase is the prototype installed topology plus two HDFs whose row counts
// and rack heights deliberately differ (D13): 4 rows in 1U and 1 row in 6U.
func hdfBase() topology.Snapshot {
	s := sample.Installed()
	s.Racks = append(s.Racks, topology.Rack{ID: "rack-05", NodeID: "node-server", Name: "Rack 05", Units: 42})
	sample.HDF("hdf-01", "HDF-01", "rack-05", 4, 1, 4).AddTo(&s)
	sample.HDF("hdf-02", "HDF-02", "rack-05", 10, 6, 1).AddTo(&s)
	return s
}

func sortSnapshot(s *topology.Snapshot) {
	sort.Slice(s.Networks, func(i, j int) bool { return s.Networks[i].ID < s.Networks[j].ID })
	sort.Slice(s.Sites, func(i, j int) bool { return s.Sites[i].ID < s.Sites[j].ID })
	sort.Slice(s.Nodes, func(i, j int) bool { return s.Nodes[i].ID < s.Nodes[j].ID })
	sort.Slice(s.Racks, func(i, j int) bool { return s.Racks[i].ID < s.Racks[j].ID })
	sort.Slice(s.Subpanels, func(i, j int) bool { return s.Subpanels[i].ID < s.Subpanels[j].ID })
	sort.Slice(s.Equipment, func(i, j int) bool { return s.Equipment[i].ID < s.Equipment[j].ID })
	sort.Slice(s.Endpoints, func(i, j int) bool { return s.Endpoints[i].ID < s.Endpoints[j].ID })
	sort.Slice(s.Links, func(i, j int) bool { return s.Links[i].ID < s.Links[j].ID })
}

// D14 (+D04/D05/D13): HDF identities, structured layout, endpoints, and
// bridges survive a reconnect with row count independent of rack height.
func TestHDFRoundTripSurvivesReconnect(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	base := hdfBase()
	if err := s.Seed(ctx, base, sample.Expansion()); err != nil {
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
	want := base
	sortSnapshot(&got)
	sortSnapshot(&want)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("HDF round trip changed the topology")
	}
	counts := map[string][3]int{}
	for _, sp := range got.Subpanels {
		c := counts[sp.EquipmentID]
		c[0]++
		counts[sp.EquipmentID] = c
	}
	for _, e := range got.Endpoints {
		c := counts[e.EquipmentID]
		c[1]++
		counts[e.EquipmentID] = c
	}
	for _, l := range got.Links {
		if strings.HasPrefix(l.A, "hdf-0") {
			c := counts[l.A[:6]]
			c[2]++
			counts[l.A[:6]] = c
		}
	}
	if counts["hdf-01"] != [3]int{16, 192, 96} || counts["hdf-02"] != [3]int{4, 48, 24} {
		t.Fatalf("persisted capacity wrong (subpanels, endpoints, bridges): %v", counts)
	}
	heights := map[string]int{}
	for _, e := range got.Equipment {
		heights[e.ID] = e.Height
	}
	if heights["hdf-01"] != 1 || heights["hdf-02"] != 6 {
		t.Fatalf("rack height was derived from rows: %v", heights)
	}
	planned, err := reopened.Snapshot(ctx, sample.Expansion().ID)
	if err != nil || len(planned.Subpanels) != 20 {
		t.Fatalf("planned snapshot lost subpanels: %d %v", len(planned.Subpanels), err)
	}
}

func seededHDFStore(t *testing.T) *Store {
	t.Helper()
	s, _ := testStore(t)
	if err := s.Seed(context.Background(), hdfBase(), sample.Expansion()); err != nil {
		t.Fatal(err)
	}
	return s
}

// The database independently protects HDF structure and subpanel-scoped identity.
func TestDatabaseEnforcesHDFStructure(t *testing.T) {
	s := seededHDFStore(t)
	ctx := context.Background()
	var one int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM endpoints WHERE equipment_id='hdf-01' AND position=1 AND side='front'`).Scan(&one); err != nil || one != 16 {
		t.Fatalf("position 1 must exist once per subpanel (D06): %d %v", one, err)
	}
	rejected := map[string]string{
		"row zero":               `INSERT INTO subpanels(id,equipment_id,row_number,column_letter) VALUES('x','hdf-02',0,'A')`,
		"row 33":                 `INSERT INTO subpanels(id,equipment_id,row_number,column_letter) VALUES('x','hdf-02',33,'A')`,
		"column E":               `INSERT INTO subpanels(id,equipment_id,row_number,column_letter) VALUES('x','hdf-02',2,'E')`,
		"duplicate row/column":   `INSERT INTO subpanels(id,equipment_id,row_number,column_letter) VALUES('x','hdf-02',1,'A')`,
		"subpanel on a switch":   `INSERT INTO subpanels(id,equipment_id,row_number,column_letter) VALUES('x','edge-01',1,'A')`,
		"subpanel on a panel":    `INSERT INTO subpanels(id,equipment_id,row_number,column_letter) VALUES('x','panel-a',1,'A')`,
		"unknown subpanel owner": `INSERT INTO subpanels(id,equipment_id,row_number,column_letter) VALUES('x','missing',1,'A')`,
		"HDF endpoint without subpanel": `INSERT INTO endpoints(id,equipment_id,equipment_kind,label,position,side,subpanel_id)
			VALUES('x','hdf-02','hdf','x',1,'front',NULL)`,
		"HDF endpoint position 7": `INSERT INTO endpoints(id,equipment_id,equipment_kind,label,position,side,subpanel_id)
			VALUES('x','hdf-02','hdf','x',7,'front','hdf-02:sp-1A')`,
		"panel endpoint with subpanel": `INSERT INTO endpoints(id,equipment_id,equipment_kind,label,position,side,subpanel_id)
			VALUES('x','panel-a','panel','x',2,'front','hdf-02:sp-1A')`,
		"switch endpoint with subpanel": `INSERT INTO endpoints(id,equipment_id,equipment_kind,label,position,side,subpanel_id)
			VALUES('x','edge-01','switch','x',0,'','hdf-02:sp-1A')`,
		"endpoint in another chassis' subpanel": `INSERT INTO endpoints(id,equipment_id,equipment_kind,label,position,side,subpanel_id)
			VALUES('x','hdf-01','hdf','x',1,'front','hdf-02:sp-1A')`,
		"duplicate position/side in one subpanel": `INSERT INTO endpoints(id,equipment_id,equipment_kind,label,position,side,subpanel_id)
			VALUES('x','hdf-02','hdf','x',1,'front','hdf-02:sp-1A')`,
		"HDF with a network":     `UPDATE equipment SET network_id='net-prototype' WHERE id='hdf-02'`,
		"unknown equipment kind": `INSERT INTO equipment(id,name,kind,role,rack_id,unit,height) VALUES('x','X','odd','passive','rack-05',30,1)`,
	}
	for name, statement := range rejected {
		if _, err := s.pool.Exec(ctx, statement); err == nil {
			t.Errorf("database accepted: %s", name)
		}
	}
}

// D16: replay is a no-op, and a modified applied migration is detected.
func TestMigrationReapplyIsIdempotentAndChecksumIsEnforced(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	for range 2 {
		if err := s.Migrate(ctx); err != nil {
			t.Fatalf("replay failed: %v", err)
		}
	}
	var applied int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations WHERE name='004_hdf_structure.sql'`).Scan(&applied); err != nil || applied != 1 {
		t.Fatalf("migration 004 must be recorded exactly once: %d %v", applied, err)
	}
	if _, err := s.pool.Exec(ctx, `UPDATE schema_migrations SET checksum='tampered' WHERE name='004_hdf_structure.sql'`); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err == nil || !strings.Contains(err.Error(), "modified after application") {
		t.Fatalf("modified checksum not detected: %v", err)
	}
}

// rewindToBeforeHDF restores the schema produced by migrations 001–003.
func rewindToBeforeHDF(t *testing.T, s *Store) {
	t.Helper()
	_, err := s.pool.Exec(context.Background(), `
ALTER TABLE endpoints DROP COLUMN subpanel_id;
DROP TABLE subpanels;
ALTER TABLE endpoints ADD COLUMN subpanel text NOT NULL DEFAULT '';
ALTER TABLE endpoints ADD CONSTRAINT endpoints_check CHECK ((equipment_kind = 'switch' AND position = 0 AND side = '' AND subpanel = '')
    OR (equipment_kind = 'panel' AND position > 0 AND side IN ('front','rear')));
CREATE UNIQUE INDEX panel_endpoint_identity ON endpoints(equipment_id,subpanel,position,side) WHERE equipment_kind = 'panel';
ALTER TABLE equipment DROP CONSTRAINT equipment_kind_check;
ALTER TABLE equipment ADD CONSTRAINT equipment_kind_check CHECK (kind IN ('switch','panel'));
DELETE FROM schema_migrations WHERE name='004_hdf_structure.sql'`)
	if err != nil {
		t.Fatal(err)
	}
}

const legacyPanel = `INSERT INTO sites VALUES('s','Site'); INSERT INTO location_nodes VALUES('node-server','s','Room');
INSERT INTO installed_topology VALUES(true,'r1','Site','Room'); INSERT INTO racks VALUES('rk','Rack',12,'node-server');
INSERT INTO equipment(id,name,kind,role,rack_id,unit,height) VALUES('pn','PN','panel','passive','rk',1,1);
INSERT INTO rack_occupancy VALUES('pn','rk',1);
INSERT INTO links VALUES('br','internal');`

func legacyEndpoints(subpanel string) string {
	return `INSERT INTO endpoints(id,equipment_id,equipment_kind,label,subpanel,position,side) VALUES
 ('pn:f','pn','panel','1 front','` + subpanel + `',1,'front'),('pn:r','pn','panel','1 rear','` + subpanel + `',1,'rear');
INSERT INTO link_endpoints(link_id,endpoint_id,kind,slot) VALUES('br','pn:f','internal',1),('br','pn:r','internal',2);`
}

// D15: a legacy free-text subpanel cannot be reinterpreted as a stable ID.
func TestHDFMigrationPreflightRefusesLegacySubpanelStrings(t *testing.T) {
	cases := map[string]string{
		"installed endpoint": legacyPanel + legacyEndpoints("3C"),
		"saved plan endpoint": `INSERT INTO plans(id,name,base_revision,revision,additions) VALUES('p','Plan','r1',1,
			'{"equipment":[],"updates":[],"links":[],"endpoints":[{"id":"e","equipmentId":"x","label":"l","subpanel":"3C","position":1,"side":"front"}]}')`,
	}
	for name, statements := range cases {
		t.Run(name, func(t *testing.T) {
			s, _ := testStore(t)
			ctx := context.Background()
			rewindToBeforeHDF(t, s)
			if _, err := s.pool.Exec(ctx, statements); err != nil {
				t.Fatal(err)
			}
			err := s.Migrate(ctx)
			if err == nil || !strings.Contains(err.Error(), "reset the development database and reseed") {
				t.Fatalf("expected a clear preflight error, got %v", err)
			}
			var subpanels, legacyColumn bool
			if err := s.pool.QueryRow(ctx, `SELECT to_regclass('subpanels') IS NOT NULL, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='endpoints' AND column_name='subpanel')`).Scan(&subpanels, &legacyColumn); err != nil || subpanels || !legacyColumn {
				t.Fatalf("preflight failure altered the schema (subpanels=%v legacyColumn=%v err=%v)", subpanels, legacyColumn, err)
			}
			var n int
			if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations WHERE name='004_hdf_structure.sql'`).Scan(&n); err != nil || n != 0 {
				t.Fatal("failed migration was recorded as applied")
			}
		})
	}
}

// Empty legacy strings carry no information: panel identities are preserved,
// and plan JSON with null/missing endpoint arrays passes the preflight.
func TestHDFMigrationPreservesStandardPanelEndpoints(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	rewindToBeforeHDF(t, s)
	if _, err := s.pool.Exec(ctx, legacyPanel+legacyEndpoints("")+`
INSERT INTO plans(id,name,base_revision,revision,additions) VALUES
 ('p1','null endpoints','r1',1,'{"equipment":[],"updates":[],"endpoints":null,"links":[]}'),
 ('p2','missing endpoints','r1',1,'{"equipment":[],"updates":[],"links":[]}'),
 ('p3','empty subpanel','r1',1,'{"equipment":[],"updates":[],"links":[],"endpoints":[{"id":"e","equipmentId":"x","label":"l","subpanel":"","position":1,"side":"front"}]}')`); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("upgrade failed: %v", err)
	}
	got, err := s.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Subpanels) != 0 || len(got.Endpoints) != 2 {
		t.Fatalf("unexpected topology after upgrade: %+v", got)
	}
	for _, e := range got.Endpoints {
		if (e.ID != "pn:f" && e.ID != "pn:r") || e.SubpanelID != "" || e.Position != 1 || e.EquipmentID != "pn" {
			t.Fatalf("panel endpoint identity changed: %+v", e)
		}
	}
	if len(got.Links) != 1 || got.Links[0].ID != "br" {
		t.Fatalf("bridge identity changed: %+v", got.Links)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("not repeatable: %v", err)
	}
}
