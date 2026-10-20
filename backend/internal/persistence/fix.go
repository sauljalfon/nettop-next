package persistence

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/topology"
)

// Fix applies one direct fix to installed data in one transaction: it locks
// the installed root FOR UPDATE (as Record does, so the two never interleave),
// checks the fix on the whole installed snapshot, writes the object's row and
// one change_log row per changed field. The topology revision never changes,
// so drafts stay current. It returns the rows written ([] when nothing changed).
func (s *Store) Fix(ctx context.Context, f fixes.Fix) ([]fixes.Entry, error) {
	return s.writeFixes(ctx, []fixes.Fix{f}, f.Note, func(current topology.Snapshot) (topology.Snapshot, [][]fixes.Change, error) {
		next, changes, err := fixes.Apply(current, f)
		return next, [][]fixes.Change{changes}, err
	})
}

// FixMany applies the fixes in order in one transaction, like Fix does for one:
// the installed root is locked once, the whole list is checked on the installed
// snapshot (fixes.ApplyMany), and each fix with changes writes its object and
// its change_log rows, all with the same note. Any refusal writes nothing. It
// returns every row written, in the order of the fixes.
func (s *Store) FixMany(ctx context.Context, list []fixes.Fix, note string) ([]fixes.Entry, error) {
	list = slices.Clone(list)
	for i := range list {
		list[i].Note = note
	}
	return s.writeFixes(ctx, list, note, func(current topology.Snapshot) (topology.Snapshot, [][]fixes.Change, error) {
		return fixes.ApplyMany(current, list)
	})
}

// writeFixes is the transaction both share: lock, load, apply, write.
func (s *Store) writeFixes(ctx context.Context, list []fixes.Fix, note string, apply func(topology.Snapshot) (topology.Snapshot, [][]fixes.Change, error)) ([]fixes.Entry, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var revision string
	err = tx.QueryRow(ctx, `SELECT revision FROM installed_topology WHERE singleton=true FOR UPDATE`).Scan(&revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("installed topology is not initialized; run `go run ./cmd/db init`")
	}
	if err != nil {
		return nil, err
	}
	current, err := loadInstalled(ctx, tx)
	if err != nil {
		return nil, err
	}
	next, changes, err := apply(current)
	if err != nil {
		return nil, err
	}
	entries := []fixes.Entry{}
	note = strings.TrimSpace(note)
	for i, f := range list {
		if len(changes[i]) == 0 {
			continue
		}
		if err = writeFixed(ctx, tx, next, f); err != nil {
			return nil, err
		}
		for _, c := range changes[i] {
			e := fixes.Entry{EntityKind: f.Kind, EntityID: f.ID, Field: c.Field, OldValue: c.OldValue, NewValue: c.NewValue, Note: note}
			if err = tx.QueryRow(ctx, `INSERT INTO change_log(entity_kind,entity_id,field,old_value,new_value,note)
				VALUES ($1,$2,$3,$4,$5,NULLIF($6,'')) RETURNING id, at`,
				e.EntityKind, e.EntityID, e.Field, e.OldValue, e.NewValue, e.Note).Scan(&e.ID, &e.At); err != nil {
				return nil, err
			}
			entries = append(entries, e)
		}
	}
	return entries, tx.Commit(ctx)
}

// writeFixed writes the fixable columns of the one object the fix changed,
// from the snapshot `next` (empty strings become NULL, like the inserts).
func writeFixed(ctx context.Context, tx pgx.Tx, next topology.Snapshot, f fixes.Fix) error {
	var tag pgconn.CommandTag
	var err error
	switch f.Kind {
	case fixes.Equipment:
		e := next.Equipment[slices.IndexFunc(next.Equipment, func(x topology.Equipment) bool { return x.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE equipment SET name=$2, manufacturer=NULLIF($3,''), model=NULLIF($4,''), serial_number=NULLIF($5,''),
			ip_address=NULLIF($6,''), status=NULLIF($7,''), description=NULLIF($8,'') WHERE id=$1`,
			e.ID, e.Name, e.Manufacturer, e.Model, e.SerialNumber, e.IPAddress, e.Status, e.Description)
	case fixes.Endpoint:
		p := next.Endpoints[slices.IndexFunc(next.Endpoints, func(x topology.Endpoint) bool { return x.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE endpoints SET label=$2, port_type=NULLIF($3,''), connector=NULLIF($4,''), speed=NULLIF($5,''),
			state=NULLIF($6,''), description=NULLIF($7,'') WHERE id=$1`,
			p.ID, p.Label, p.PortType, p.Connector, p.Speed, p.State, p.Description)
	case fixes.Link:
		l := next.Links[slices.IndexFunc(next.Links, func(x topology.Link) bool { return x.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE links SET label=NULLIF($2,''), status=NULLIF($3,''), notes=NULLIF($4,'') WHERE id=$1`,
			l.ID, l.Label, l.Status, l.Notes)
	case fixes.Site:
		x := next.Sites[slices.IndexFunc(next.Sites, func(o topology.Site) bool { return o.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE sites SET name=$2, location=NULLIF($3,''), description=NULLIF($4,'') WHERE id=$1`,
			x.ID, x.Name, x.Location, x.Description)
	case fixes.Node:
		x := next.Nodes[slices.IndexFunc(next.Nodes, func(o topology.LocationNode) bool { return o.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE location_nodes SET name=$2, location=NULLIF($3,''), description=NULLIF($4,'') WHERE id=$1`,
			x.ID, x.Name, x.Location, x.Description)
	case fixes.Rack:
		x := next.Racks[slices.IndexFunc(next.Racks, func(o topology.Rack) bool { return o.ID == f.ID })]
		tag, err = tx.Exec(ctx, `UPDATE racks SET name=$2, location=NULLIF($3,''), rack_type=NULLIF($4,''), description=NULLIF($5,'') WHERE id=$1`,
			x.ID, x.Name, x.Location, x.RackType, x.Description)
	default:
		return fmt.Errorf("%w: %s", fixes.ErrNotFound, f.Kind)
	}
	if err == nil && tag.RowsAffected() != 1 {
		err = fmt.Errorf("fix of %s %s updated %d rows", f.Kind, f.ID, tag.RowsAffected())
	}
	return err
}

// ChangeLog lists the direct fixes of one object, newest first.
func (s *Store) ChangeLog(ctx context.Context, entityKind, entityID string) ([]fixes.Entry, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, at, entity_kind, entity_id, field, COALESCE(old_value,''), COALESCE(new_value,''), COALESCE(note,'')
		FROM change_log WHERE entity_kind=$1 AND entity_id=$2 ORDER BY at DESC, id DESC`, entityKind, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []fixes.Entry{}
	for rows.Next() {
		var e fixes.Entry
		if err = rows.Scan(&e.ID, &e.At, &e.EntityKind, &e.EntityID, &e.Field, &e.OldValue, &e.NewValue, &e.Note); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
