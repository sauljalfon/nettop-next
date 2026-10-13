package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
	"nettop.local/backend/migrations"
)

type Store struct{ pool *pgxpool.Pool }

func Open(ctx context.Context, url string) (*Store, error) {
	if url == "" {
		return nil, fmt.Errorf("DATABASE_URL is required; see .env.example")
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool}, nil
}
func (s *Store) Close()                            { s.pool.Close() }
func (s *Store) Ping(ctx context.Context) error    { return s.pool.Ping(ctx) }
func (s *Store) Migrate(ctx context.Context) error { return migrations.Up(ctx, s.pool) }

func (s *Store) Installed(ctx context.Context) (topology.Snapshot, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return topology.Snapshot{}, err
	}
	defer tx.Rollback(ctx)
	snapshot, err := loadInstalled(ctx, tx)
	if err != nil {
		return snapshot, err
	}
	return snapshot, tx.Commit(ctx)
}

func loadInstalled(ctx context.Context, tx pgx.Tx) (topology.Snapshot, error) {
	s := topology.Snapshot{Context: "installed", Networks: []topology.Network{}, Subpanels: []topology.Subpanel{}, Sites: []topology.Site{}, Nodes: []topology.LocationNode{}, Racks: []topology.Rack{}, Equipment: []topology.Equipment{}, Endpoints: []topology.Endpoint{}, Links: []topology.Link{}}
	err := tx.QueryRow(ctx, `SELECT revision,site,room FROM installed_topology WHERE singleton=true`).Scan(&s.Revision, &s.Site, &s.Room)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, fmt.Errorf("installed topology is not initialized; run `go run ./cmd/db init`")
	}
	if err != nil {
		return s, err
	}
	rows, err := tx.Query(ctx, `SELECT id,name FROM networks ORDER BY seq`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var n topology.Network
		if err = rows.Scan(&n.ID, &n.Name); err != nil {
			rows.Close()
			return s, err
		}
		s.Networks = append(s.Networks, n)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT id,name,COALESCE(location,''),COALESCE(description,'') FROM sites ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var site topology.Site
		if err = rows.Scan(&site.ID, &site.Name, &site.Location, &site.Description); err != nil {
			rows.Close()
			return s, err
		}
		s.Sites = append(s.Sites, site)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT id,name,site_id,COALESCE(location,''),COALESCE(description,'') FROM location_nodes ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var node topology.LocationNode
		if err = rows.Scan(&node.ID, &node.Name, &node.SiteID, &node.Location, &node.Description); err != nil {
			rows.Close()
			return s, err
		}
		s.Nodes = append(s.Nodes, node)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT id,name,units,node_id,COALESCE(location,''),COALESCE(rack_type,''),COALESCE(description,'') FROM racks ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var r topology.Rack
		if err = rows.Scan(&r.ID, &r.Name, &r.Units, &r.NodeID, &r.Location, &r.RackType, &r.Description); err != nil {
			rows.Close()
			return s, err
		}
		s.Racks = append(s.Racks, r)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT id,name,kind,role,COALESCE(network_id,''),rack_id,unit,height,COALESCE(manufacturer,''),COALESCE(model,''),COALESCE(serial_number,''),COALESCE(ip_address,''),COALESCE(status,''),COALESCE(description,'') FROM equipment ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var e topology.Equipment
		if err = rows.Scan(&e.ID, &e.Name, &e.Kind, &e.Role, &e.NetworkID, &e.RackID, &e.Unit, &e.Height, &e.Manufacturer, &e.Model, &e.SerialNumber, &e.IPAddress, &e.Status, &e.Description); err != nil {
			rows.Close()
			return s, err
		}
		s.Equipment = append(s.Equipment, e)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT id,equipment_id,row_number,column_letter FROM subpanels ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var sp topology.Subpanel
		if err = rows.Scan(&sp.ID, &sp.EquipmentID, &sp.Row, &sp.Column); err != nil {
			rows.Close()
			return s, err
		}
		s.Subpanels = append(s.Subpanels, sp)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT id,equipment_id,label,COALESCE(subpanel_id,''),position,side,port_group,COALESCE(port_type,''),COALESCE(connector,''),COALESCE(speed,''),COALESCE(state,''),COALESCE(description,'') FROM endpoints ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var p topology.Endpoint
		if err = rows.Scan(&p.ID, &p.EquipmentID, &p.Label, &p.SubpanelID, &p.Position, &p.Side, &p.PortGroup, &p.PortType, &p.Connector, &p.Speed, &p.State, &p.Description); err != nil {
			rows.Close()
			return s, err
		}
		s.Endpoints = append(s.Endpoints, p)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT l.id,l.kind,a.endpoint_id,b.endpoint_id,COALESCE(l.label,''),COALESCE(l.status,''),COALESCE(l.notes,'') FROM links l JOIN link_endpoints a ON a.link_id=l.id AND a.slot=1 JOIN link_endpoints b ON b.link_id=l.id AND b.slot=2 ORDER BY l.id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var l topology.Link
		if err = rows.Scan(&l.ID, &l.Kind, &l.A, &l.B, &l.Label, &l.Status, &l.Notes); err != nil {
			rows.Close()
			return s, err
		}
		s.Links = append(s.Links, l)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	return s, topology.Validate(s)
}

// Seed initializes an empty database with installed inventory and any explicit
// draft plans. Fixtures without drafts (the acceptance fixture) pass none.
func (s *Store) Seed(ctx context.Context, base topology.Snapshot, plans ...planning.Plan) error {
	if err := topology.Validate(base); err != nil {
		return err
	}
	for _, plan := range plans {
		if _, err := planning.Apply(base, plan); err != nil {
			return err
		}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `INSERT INTO installed_topology(singleton,revision,site,room) VALUES (true,$1,$2,$3)`, base.Revision, base.Site, base.Room); err != nil {
		return fmt.Errorf("seed refused (database may already be initialized): %w", err)
	}
	for _, n := range base.Networks {
		if _, err = tx.Exec(ctx, `INSERT INTO networks(id,name) VALUES($1,$2)`, n.ID, n.Name); err != nil {
			return err
		}
	}
	for _, site := range base.Sites {
		if err = insertSite(ctx, tx, site); err != nil {
			return err
		}
	}
	for _, node := range base.Nodes {
		if err = insertNode(ctx, tx, node); err != nil {
			return err
		}
	}
	for _, r := range base.Racks {
		if err = insertRack(ctx, tx, r); err != nil {
			return err
		}
	}
	for _, e := range base.Equipment {
		if err = insertEquipment(ctx, tx, e); err != nil {
			return err
		}
	}
	for _, sp := range base.Subpanels {
		if err = insertSubpanel(ctx, tx, sp); err != nil {
			return err
		}
	}
	for _, p := range base.Endpoints {
		if err = insertEndpoint(ctx, tx, p); err != nil {
			return err
		}
	}
	for _, l := range base.Links {
		if err = insertLink(ctx, tx, l); err != nil {
			return err
		}
	}
	for _, plan := range plans {
		if plan.Name == "" {
			plan.Name = "Expansion"
		}
		if err = insertPlan(ctx, tx, plan); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func insertPlan(ctx context.Context, tx pgx.Tx, p planning.Plan) error {
	if p.Subpanels == nil {
		p.Subpanels = []topology.Subpanel{} // stored plans always carry the list
	}
	body, err := json.Marshal(p)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO plans(id,name,base_revision,revision,additions) VALUES($1,$2,$3,$4,$5)`, p.ID, p.Name, p.BaseRevision, p.Revision, body)
	return err
}

func loadPlan(ctx context.Context, tx pgx.Tx, id string, lock bool) (planning.Plan, error) {
	p := planning.Plan{}
	var body []byte
	query := `SELECT id,name,base_revision,revision::text,additions,status,recorded_at,record_note,recorded_by FROM plans WHERE id=$1`
	if lock {
		query += " FOR UPDATE"
	}
	var note, by *string
	err := tx.QueryRow(ctx, query, id).Scan(&p.ID, &p.Name, &p.BaseRevision, &p.Revision, &body, &p.Status, &p.RecordedAt, &note, &by)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, planning.ErrNotFound
	}
	if err != nil {
		return p, err
	}
	var additions planning.Plan
	if err = json.Unmarshal(body, &additions); err != nil {
		return p, err
	}
	if note != nil {
		p.RecordNote = *note
	}
	if by != nil {
		p.RecordedBy = *by
	}
	p.Labels = additions.Labels
	if p.Labels == nil {
		p.Labels = map[string]string{} // plans saved before labels have none
	}
	p.Sites, p.Nodes, p.Racks = additions.Sites, additions.Nodes, additions.Racks
	p.Placements, p.Removals = additions.Placements, additions.Removals
	p.Equipment = additions.Equipment
	p.Updates = additions.Updates
	if p.Updates == nil {
		p.Updates = []topology.Equipment{}
	}
	p.Subpanels = additions.Subpanels
	if p.Subpanels == nil {
		// Plans saved before subpanels existed have no "subpanels" key: that
		// means "no subpanels", never a half-built HDF (Apply rejects those).
		p.Subpanels = []topology.Subpanel{}
	}
	p.Endpoints = additions.Endpoints
	p.Links = additions.Links
	p.Details = additions.Details
	p.Renames = additions.Renames
	return p, nil
}

func (s *Store) Plan(ctx context.Context, id string) (planning.Plan, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return planning.Plan{}, err
	}
	defer tx.Rollback(ctx)
	p, err := loadPlan(ctx, tx, id, false)
	if err != nil {
		return p, err
	}
	return p, tx.Commit(ctx)
}

func (s *Store) Snapshot(ctx context.Context, planID string) (topology.Snapshot, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return topology.Snapshot{}, err
	}
	defer tx.Rollback(ctx)
	base, err := loadInstalled(ctx, tx)
	if err != nil {
		return base, err
	}
	if planID != "" {
		p, err := loadPlan(ctx, tx, planID, false)
		if err != nil {
			return base, err
		}
		base, err = planning.Apply(base, p)
		if err != nil {
			return base, err
		}
	}
	return base, tx.Commit(ctx)
}

// The insert helpers are shared by Seed and Record, so both write installed
// rows the same way.
func insertSite(ctx context.Context, tx pgx.Tx, site topology.Site) error {
	_, err := tx.Exec(ctx, `INSERT INTO sites(id,name,location,description) VALUES($1,$2,NULLIF($3,''),NULLIF($4,''))`, site.ID, site.Name, site.Location, site.Description)
	return err
}
func insertNode(ctx context.Context, tx pgx.Tx, node topology.LocationNode) error {
	_, err := tx.Exec(ctx, `INSERT INTO location_nodes(id,name,site_id,location,description) VALUES($1,$2,$3,NULLIF($4,''),NULLIF($5,''))`, node.ID, node.Name, node.SiteID, node.Location, node.Description)
	return err
}
func insertRack(ctx context.Context, tx pgx.Tx, r topology.Rack) error {
	_, err := tx.Exec(ctx, `INSERT INTO racks(id,name,units,node_id,location,rack_type,description) VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,''))`, r.ID, r.Name, r.Units, r.NodeID, r.Location, r.RackType, r.Description)
	return err
}

// insertEquipment writes the equipment row and its rack occupancy.
func insertEquipment(ctx context.Context, tx pgx.Tx, e topology.Equipment) error {
	if _, err := tx.Exec(ctx, `INSERT INTO equipment(id,name,kind,role,rack_id,unit,height,network_id,manufacturer,model,serial_number,ip_address,status,description) VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,''),NULLIF($12,''),NULLIF($13,''),NULLIF($14,''))`, e.ID, e.Name, e.Kind, e.Role, e.RackID, e.Unit, e.Height, e.NetworkID, e.Manufacturer, e.Model, e.SerialNumber, e.IPAddress, e.Status, e.Description); err != nil {
		return err
	}
	return insertOccupancy(ctx, tx, e)
}
func insertOccupancy(ctx context.Context, tx pgx.Tx, e topology.Equipment) error {
	_, err := tx.Exec(ctx, `INSERT INTO rack_occupancy SELECT $1,$2,generate_series($3::integer,$4::integer)`, e.ID, e.RackID, e.Unit, e.Unit+e.Height-1)
	return err
}
func insertSubpanel(ctx context.Context, tx pgx.Tx, sp topology.Subpanel) error {
	_, err := tx.Exec(ctx, `INSERT INTO subpanels(id,equipment_id,row_number,column_letter) VALUES($1,$2,$3,$4)`, sp.ID, sp.EquipmentID, sp.Row, sp.Column)
	return err
}
func insertEndpoint(ctx context.Context, tx pgx.Tx, p topology.Endpoint) error {
	_, err := tx.Exec(ctx, `INSERT INTO endpoints(id,equipment_id,equipment_kind,label,position,side,subpanel_id,port_group,port_type,connector,speed,state,description) SELECT $1,$2,kind,$3,$4,$5,NULLIF($6,''),$7,NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,''),NULLIF($12,'') FROM equipment WHERE id=$2`, p.ID, p.EquipmentID, p.Label, p.Position, p.Side, p.SubpanelID, p.PortGroup, p.PortType, p.Connector, p.Speed, p.State, p.Description)
	return err
}
func insertLink(ctx context.Context, tx pgx.Tx, l topology.Link) error {
	if _, err := tx.Exec(ctx, `INSERT INTO links(id,kind,label,status,notes) VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''))`, l.ID, l.Kind, l.Label, l.Status, l.Notes); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO link_endpoints(link_id,endpoint_id,kind,slot) VALUES ($1,$2,$4,1),($1,$3,$4,2)`, l.ID, l.A, l.B, l.Kind)
	return err
}

// Init creates the empty installed root (no networks, sites or anything else)
// when the database has none, in one transaction, and reports whether it did.
// On an initialized database it changes nothing. It is the production start
// (`cmd/db migrate`, then `cmd/db init`); Seed stays development-only and is
// refused by an initialized database.
func (s *Store) Init(ctx context.Context) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `INSERT INTO installed_topology(singleton,revision,site,room) VALUES (true,$1,'','') ON CONFLICT (singleton) DO NOTHING`, newRevision("init-"))
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, tx.Commit(ctx)
}
