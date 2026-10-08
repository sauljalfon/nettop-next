package persistence

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"nettop.local/backend/internal/topology"
)

// Node layout and networks are presentation and reference data. None of these
// methods touches installed_topology or plans, so no revision ever changes.

func (s *Store) requireSite(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, siteID string) error {
	var found bool
	if err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM sites WHERE id=$1)`, siteID).Scan(&found); err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("%w: %s", topology.ErrSiteNotFound, siteID)
	}
	return nil
}

// SiteLayout returns the saved positions of the site's nodes; nodes never moved
// have none.
func (s *Store) SiteLayout(ctx context.Context, siteID string) (topology.SiteLayout, error) {
	layout := topology.SiteLayout{SiteID: siteID, Positions: []topology.NodePosition{}}
	if err := s.requireSite(ctx, s.pool, siteID); err != nil {
		return layout, err
	}
	rows, err := s.pool.Query(ctx, `SELECT l.node_id,l.x,l.y FROM node_layouts l JOIN location_nodes n ON n.id=l.node_id WHERE n.site_id=$1 ORDER BY l.node_id`, siteID)
	if err != nil {
		return layout, err
	}
	defer rows.Close()
	for rows.Next() {
		var p topology.NodePosition
		if err = rows.Scan(&p.NodeID, &p.X, &p.Y); err != nil {
			return layout, err
		}
		layout.Positions = append(layout.Positions, p)
	}
	return layout, rows.Err()
}

// SaveNodePosition upserts one node's position; the last write wins.
func (s *Store) SaveNodePosition(ctx context.Context, siteID, nodeID string, x, y float64) error {
	if err := s.requireSite(ctx, s.pool, siteID); err != nil {
		return err
	}
	if math.IsNaN(x) || math.IsNaN(y) || math.Abs(x) > topology.MaxLayoutCoordinate || math.Abs(y) > topology.MaxLayoutCoordinate {
		return fmt.Errorf("%w: x and y must be numbers between -%d and %d", topology.ErrInvalidInput, topology.MaxLayoutCoordinate, topology.MaxLayoutCoordinate)
	}
	tag, err := s.pool.Exec(ctx, `INSERT INTO node_layouts(node_id,x,y) SELECT id,$3,$4 FROM location_nodes WHERE id=$2 AND site_id=$1
		ON CONFLICT (node_id) DO UPDATE SET x=EXCLUDED.x, y=EXCLUDED.y, updated_at=now()`, siteID, nodeID, x, y)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: node %s does not belong to site %s", topology.ErrInvalidInput, nodeID, siteID)
	}
	return nil
}

// ResetSiteLayout removes the saved positions of this site's nodes only.
func (s *Store) ResetSiteLayout(ctx context.Context, siteID string) error {
	if err := s.requireSite(ctx, s.pool, siteID); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM node_layouts WHERE node_id IN (SELECT id FROM location_nodes WHERE site_id=$1)`, siteID)
	return err
}

// networkName trims and validates a display name: 1–64 characters.
func networkName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if n := utf8.RuneCountInString(name); n < 1 || n > topology.MaxNetworkNameLength {
		return "", fmt.Errorf("%w: a network name must be 1–%d characters", topology.ErrInvalidInput, topology.MaxNetworkNameLength)
	}
	return name, nil
}

func duplicateName(err error) error {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" && pg.ConstraintName == "networks_name_unique" {
		return fmt.Errorf("%w: a network with this name already exists (ignoring case)", topology.ErrDuplicateName)
	}
	return err
}

// CreateNetwork adds a network with a server-generated, permanent ID. It takes
// the next place in the creation order.
func (s *Store) CreateNetwork(ctx context.Context, name string) (topology.Network, error) {
	name, err := networkName(name)
	if err != nil {
		return topology.Network{}, err
	}
	n := topology.Network{ID: "network-" + rand.Text(), Name: name}
	if _, err = s.pool.Exec(ctx, `INSERT INTO networks(id,name) VALUES($1,$2)`, n.ID, n.Name); err != nil {
		return topology.Network{}, duplicateName(err)
	}
	return n, nil
}

// RenameNetwork changes only the display name.
func (s *Store) RenameNetwork(ctx context.Context, id, name string) (topology.Network, error) {
	name, err := networkName(name)
	if err != nil {
		return topology.Network{}, err
	}
	n := topology.Network{ID: id}
	err = s.pool.QueryRow(ctx, `UPDATE networks SET name=$2 WHERE id=$1 RETURNING name`, id, name).Scan(&n.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return topology.Network{}, fmt.Errorf("%w: %s", topology.ErrNetworkNotFound, id)
	}
	if err != nil {
		return topology.Network{}, duplicateName(err)
	}
	return n, nil
}
