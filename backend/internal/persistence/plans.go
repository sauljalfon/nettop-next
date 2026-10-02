package persistence

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strings"

	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func (s *Store) Plans(ctx context.Context) ([]planning.Plan, error) {
	// List full drafts for this small workspace; pagination can be added later.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id FROM plans ORDER BY created_at,id`)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	items := []planning.Plan{}
	for _, id := range ids {
		p, err := loadPlan(ctx, tx, id, false)
		if err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, tx.Commit(ctx)
}

func (s *Store) CreatePlan(ctx context.Context, name, expectedBase string) (planning.Plan, error) {
	name = strings.TrimSpace(name)
	if len(name) < 1 || len(name) > 100 || expectedBase == "" {
		return planning.Plan{}, fmt.Errorf("%w: name (1–100 characters) and expectedBaseRevision are required", planning.ErrInvalid)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return planning.Plan{}, err
	}
	defer tx.Rollback(ctx)
	var base string
	if err = tx.QueryRow(ctx, `SELECT revision FROM installed_topology WHERE singleton=true FOR SHARE`).Scan(&base); err != nil {
		return planning.Plan{}, err
	}
	if base != expectedBase {
		return planning.Plan{}, fmt.Errorf("%w: installed topology changed", planning.ErrConflict)
	}
	p := planning.Plan{ID: "plan-" + rand.Text(), Name: name, BaseRevision: base, Revision: "1", Equipment: []topology.Equipment{}, Updates: []topology.Equipment{}, Endpoints: []topology.Endpoint{}, Links: []topology.Link{}}
	if err = insertPlan(ctx, tx, p); err != nil {
		return p, err
	}
	return p, tx.Commit(ctx)
}

func (s *Store) Command(ctx context.Context, id string, command planning.Command) (planning.Plan, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return planning.Plan{}, err
	}
	defer tx.Rollback(ctx)
	// Lock order is topology then draft. Future installed writes must acquire
	// the topology row FOR UPDATE before changing any installed inventory.
	if _, err = tx.Exec(ctx, `SELECT revision FROM installed_topology WHERE singleton=true FOR SHARE`); err != nil {
		return planning.Plan{}, err
	}
	p, err := loadPlan(ctx, tx, id, true)
	if err != nil {
		return p, err
	}
	base, err := loadInstalled(ctx, tx)
	if err != nil {
		return p, err
	}
	prefix := "equipment-"
	if command.Type == "add_cable" {
		prefix = "cable-"
	}
	next, err := planning.Execute(base, p, command, prefix+rand.Text())
	if err != nil {
		return p, err
	}
	body, err := json.Marshal(next)
	if err != nil {
		return p, err
	}
	if _, err = tx.Exec(ctx, `UPDATE plans SET revision=$2,additions=$3,updated_at=now() WHERE id=$1`, id, next.Revision, body); err != nil {
		return p, err
	}
	return next, tx.Commit(ctx)
}
