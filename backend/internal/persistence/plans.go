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
	p := planning.Plan{ID: "plan-" + rand.Text(), Name: name, BaseRevision: base, Revision: "1", Equipment: []topology.Equipment{}, Updates: []topology.Equipment{}, Subpanels: []topology.Subpanel{}, Endpoints: []topology.Endpoint{}, Links: []topology.Link{}}
	if err = insertPlan(ctx, tx, p); err != nil {
		return p, err
	}
	return p, tx.Commit(ctx)
}

func (s *Store) Command(ctx context.Context, id string, command planning.Command) (planning.Plan, error) {
	p, _, err := s.command(ctx, id, command)
	return p, err
}

// Batch runs a batch command and also returns the IDs it allocated, in command
// order ("" for a command that creates nothing).
func (s *Store) Batch(ctx context.Context, id string, command planning.Command) (planning.Plan, []string, error) {
	if command.Type != "batch" {
		return planning.Plan{}, nil, fmt.Errorf("%w: Batch runs batch commands", planning.ErrInvalid)
	}
	return s.command(ctx, id, command)
}

// RemoveChange runs a remove_change command and also returns the keys removed.
func (s *Store) RemoveChange(ctx context.Context, id string, command planning.Command) (planning.Plan, []string, error) {
	if command.Type != "remove_change" {
		return planning.Plan{}, nil, fmt.Errorf("%w: RemoveChange runs remove_change commands", planning.ErrInvalid)
	}
	return s.command(ctx, id, command)
}

func (s *Store) command(ctx context.Context, id string, command planning.Command) (planning.Plan, []string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return planning.Plan{}, nil, err
	}
	defer tx.Rollback(ctx)
	// Lock order is topology then draft. Future installed writes must acquire
	// the topology row FOR UPDATE before changing any installed inventory.
	if _, err = tx.Exec(ctx, `SELECT revision FROM installed_topology WHERE singleton=true FOR SHARE`); err != nil {
		return planning.Plan{}, nil, err
	}
	p, err := loadPlan(ctx, tx, id, true)
	if err != nil {
		return p, nil, err
	}
	base, err := loadInstalled(ctx, tx)
	if err != nil {
		return p, nil, err
	}
	var next planning.Plan
	var removed []string // the keys remove_change removed, or the IDs a batch allocated
	switch command.Type {
	case "remove_change":
		next, removed, err = planning.ExecuteRemoveChange(base, p, command)
	case "batch":
		// One ID per command that creates something, in command order ("" for the rest).
		if command.Batch != nil {
			for _, inner := range command.Batch.Commands {
				id := ""
				if prefix := planning.IDPrefix(inner.Type); prefix != "" {
					id = prefix + rand.Text()
				}
				removed = append(removed, id)
			}
		}
		next, err = planning.ExecuteBatch(base, p, command, removed)
	default:
		prefix := planning.IDPrefix(command.Type)
		if prefix == "" {
			prefix = "equipment-" // commands that create nothing ignore the ID
		}
		next, err = planning.Execute(base, p, command, prefix+rand.Text())
	}
	if err != nil {
		return p, nil, err
	}
	body, err := json.Marshal(next)
	if err != nil {
		return p, nil, err
	}
	if _, err = tx.Exec(ctx, `UPDATE plans SET revision=$2,additions=$3,updated_at=now() WHERE id=$1`, id, next.Revision, body); err != nil {
		return p, nil, err
	}
	return next, removed, tx.Commit(ctx)
}
