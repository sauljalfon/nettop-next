package persistence

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

// Switch models are library data like networks: no method here touches
// installed_topology or a plan, so no revision changes and no draft goes stale.

func duplicateModelName(err error) error {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" && pg.ConstraintName == "switch_models_name_unique" {
		return fmt.Errorf("%w: a switch model with this name already exists (ignoring case)", topology.ErrDuplicateName)
	}
	return err
}

// SwitchModels lists every model by name, ignoring case.
func (s *Store) SwitchModels(ctx context.Context) ([]planning.SwitchModel, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,name,manufacturer,height,port_groups FROM switch_models ORDER BY lower(btrim(name)), id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []planning.SwitchModel{}
	for rows.Next() {
		var m planning.SwitchModel
		var groups []byte
		if err = rows.Scan(&m.ID, &m.Name, &m.Manufacturer, &m.Height, &groups); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(groups, &m.PortGroups); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, rows.Err()
}

// CreateSwitchModel validates and stores a model under a server-generated ID.
func (s *Store) CreateSwitchModel(ctx context.Context, m planning.SwitchModel) (planning.SwitchModel, error) {
	if err := planning.ValidateSwitchModel(&m); err != nil {
		return planning.SwitchModel{}, err
	}
	groups, err := json.Marshal(m.PortGroups)
	if err != nil {
		return planning.SwitchModel{}, err
	}
	m.ID = "model-" + rand.Text()
	if _, err = s.pool.Exec(ctx, `INSERT INTO switch_models(id,name,manufacturer,height,port_groups) VALUES($1,$2,$3,$4,$5)`, m.ID, m.Name, m.Manufacturer, m.Height, groups); err != nil {
		return planning.SwitchModel{}, duplicateModelName(err)
	}
	return m, nil
}

// UpdateSwitchModel replaces a model's name, manufacturer, height and groups.
// Switches already added are never touched.
func (s *Store) UpdateSwitchModel(ctx context.Context, id string, m planning.SwitchModel) (planning.SwitchModel, error) {
	if err := planning.ValidateSwitchModel(&m); err != nil {
		return planning.SwitchModel{}, err
	}
	groups, err := json.Marshal(m.PortGroups)
	if err != nil {
		return planning.SwitchModel{}, err
	}
	m.ID = id
	tag, err := s.pool.Exec(ctx, `UPDATE switch_models SET name=$2, manufacturer=$3, height=$4, port_groups=$5, updated_at=now() WHERE id=$1`, id, m.Name, m.Manufacturer, m.Height, groups)
	if err != nil {
		return planning.SwitchModel{}, duplicateModelName(err)
	}
	if tag.RowsAffected() == 0 {
		return planning.SwitchModel{}, fmt.Errorf("%w: %s", topology.ErrModelNotFound, id)
	}
	return m, nil
}

// DeleteSwitchModel removes a model; the switches that copied it keep their ports.
func (s *Store) DeleteSwitchModel(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM switch_models WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: %s", topology.ErrModelNotFound, id)
	}
	return nil
}
