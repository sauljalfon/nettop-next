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
		return s, fmt.Errorf("installed topology is not initialized; run the explicit seed command")
	}
	if err != nil {
		return s, err
	}
	rows, err := tx.Query(ctx, `SELECT id,name FROM networks ORDER BY id`)
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
	rows, err = tx.Query(ctx, `SELECT id,name FROM sites ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var site topology.Site
		if err = rows.Scan(&site.ID, &site.Name); err != nil {
			rows.Close()
			return s, err
		}
		s.Sites = append(s.Sites, site)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT id,name,site_id FROM location_nodes ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var node topology.LocationNode
		if err = rows.Scan(&node.ID, &node.Name, &node.SiteID); err != nil {
			rows.Close()
			return s, err
		}
		s.Nodes = append(s.Nodes, node)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT id,name,units,node_id FROM racks ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var r topology.Rack
		if err = rows.Scan(&r.ID, &r.Name, &r.Units, &r.NodeID); err != nil {
			rows.Close()
			return s, err
		}
		s.Racks = append(s.Racks, r)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT id,name,kind,role,COALESCE(network_id,''),rack_id,unit,height FROM equipment ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var e topology.Equipment
		if err = rows.Scan(&e.ID, &e.Name, &e.Kind, &e.Role, &e.NetworkID, &e.RackID, &e.Unit, &e.Height); err != nil {
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
	rows, err = tx.Query(ctx, `SELECT id,equipment_id,label,COALESCE(subpanel_id,''),position,side FROM endpoints ORDER BY id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var p topology.Endpoint
		if err = rows.Scan(&p.ID, &p.EquipmentID, &p.Label, &p.SubpanelID, &p.Position, &p.Side); err != nil {
			rows.Close()
			return s, err
		}
		s.Endpoints = append(s.Endpoints, p)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	rows, err = tx.Query(ctx, `SELECT l.id,l.kind,a.endpoint_id,b.endpoint_id FROM links l JOIN link_endpoints a ON a.link_id=l.id AND a.slot=1 JOIN link_endpoints b ON b.link_id=l.id AND b.slot=2 ORDER BY l.id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var l topology.Link
		if err = rows.Scan(&l.ID, &l.Kind, &l.A, &l.B); err != nil {
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

func (s *Store) Seed(ctx context.Context, base topology.Snapshot, plan planning.Plan) error {
	if err := topology.Validate(base); err != nil {
		return err
	}
	if _, err := planning.Apply(base, plan); err != nil {
		return err
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
		if _, err = tx.Exec(ctx, `INSERT INTO sites(id,name) VALUES($1,$2)`, site.ID, site.Name); err != nil {
			return err
		}
	}
	for _, node := range base.Nodes {
		if _, err = tx.Exec(ctx, `INSERT INTO location_nodes(id,name,site_id) VALUES($1,$2,$3)`, node.ID, node.Name, node.SiteID); err != nil {
			return err
		}
	}
	for _, r := range base.Racks {
		if _, err = tx.Exec(ctx, `INSERT INTO racks(id,name,units,node_id) VALUES ($1,$2,$3,$4)`, r.ID, r.Name, r.Units, r.NodeID); err != nil {
			return err
		}
	}
	for _, e := range base.Equipment {
		if _, err = tx.Exec(ctx, `INSERT INTO equipment(id,name,kind,role,rack_id,unit,height,network_id) VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''))`, e.ID, e.Name, e.Kind, e.Role, e.RackID, e.Unit, e.Height, e.NetworkID); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO rack_occupancy SELECT $1,$2,generate_series($3::integer,$4::integer)`, e.ID, e.RackID, e.Unit, e.Unit+e.Height-1); err != nil {
			return err
		}
	}
	for _, sp := range base.Subpanels {
		if _, err = tx.Exec(ctx, `INSERT INTO subpanels(id,equipment_id,row_number,column_letter) VALUES($1,$2,$3,$4)`, sp.ID, sp.EquipmentID, sp.Row, sp.Column); err != nil {
			return err
		}
	}
	for _, p := range base.Endpoints {
		if _, err = tx.Exec(ctx, `INSERT INTO endpoints(id,equipment_id,equipment_kind,label,position,side,subpanel_id) SELECT $1,$2,kind,$3,$4,$5,NULLIF($6,'') FROM equipment WHERE id=$2`, p.ID, p.EquipmentID, p.Label, p.Position, p.Side, p.SubpanelID); err != nil {
			return err
		}
	}
	for _, l := range base.Links {
		if _, err = tx.Exec(ctx, `INSERT INTO links VALUES ($1,$2)`, l.ID, l.Kind); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO link_endpoints(link_id,endpoint_id,kind,slot) VALUES ($1,$2,$4,1),($1,$3,$4,2)`, l.ID, l.A, l.B, l.Kind); err != nil {
			return err
		}
	}
	if plan.Name == "" {
		plan.Name = "Expansion"
	}
	if err = insertPlan(ctx, tx, plan); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func insertPlan(ctx context.Context, tx pgx.Tx, p planning.Plan) error {
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
	query := `SELECT id,name,base_revision,revision::text,additions FROM plans WHERE id=$1`
	if lock {
		query += " FOR UPDATE"
	}
	err := tx.QueryRow(ctx, query, id).Scan(&p.ID, &p.Name, &p.BaseRevision, &p.Revision, &body)
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
	p.Equipment = additions.Equipment
	p.Updates = additions.Updates
	if p.Updates == nil {
		p.Updates = []topology.Equipment{}
	}
	p.Endpoints = additions.Endpoints
	p.Links = additions.Links
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
