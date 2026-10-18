package persistence

import (
	"context"
	"fmt"
	"math"

	"nettop.local/backend/internal/topology"
)

// The overview arrangement is presentation data like the site layout: none of
// these methods touches installed_topology or plans, so no revision changes.

// MapLayout returns every saved overview position; nodes never moved have none.
func (s *Store) MapLayout(ctx context.Context) (topology.MapLayout, error) {
	layout := topology.MapLayout{Positions: []topology.NodePosition{}}
	rows, err := s.pool.Query(ctx, `SELECT node_id,x,y FROM map_layouts ORDER BY node_id`)
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

// SaveMapPosition upserts one node's overview position; the last write wins.
func (s *Store) SaveMapPosition(ctx context.Context, nodeID string, x, y float64) error {
	if math.IsNaN(x) || math.IsNaN(y) || math.Abs(x) > topology.MaxLayoutCoordinate || math.Abs(y) > topology.MaxLayoutCoordinate {
		return fmt.Errorf("%w: x and y must be numbers between -%d and %d", topology.ErrInvalidInput, topology.MaxLayoutCoordinate, topology.MaxLayoutCoordinate)
	}
	tag, err := s.pool.Exec(ctx, `INSERT INTO map_layouts(node_id,x,y) SELECT id,$2,$3 FROM location_nodes WHERE id=$1
		ON CONFLICT (node_id) DO UPDATE SET x=EXCLUDED.x, y=EXCLUDED.y, updated_at=now()`, nodeID, x, y)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: %s", topology.ErrNodeNotFound, nodeID)
	}
	return nil
}

// ResetMapLayout removes every saved overview position.
func (s *Store) ResetMapLayout(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM map_layouts`)
	return err
}
