package persistence

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"nettop.local/backend/internal/planning"
)

// MaxRecordNote is the longest note a recorded plan can carry, in characters.
const MaxRecordNote = 500

// MaxRecordedBy is the longest "recorded by" name, in characters.
const MaxRecordedBy = 100

// newInstalledRevision makes a unique installed revision: "rec-" + UTC time +
// a random suffix, e.g. rec-20261009T142530Z-K3QF7A. It is opaque to clients.
func newInstalledRevision() string {
	return "rec-" + time.Now().UTC().Format("20060102T150405Z") + "-" + rand.Text()[:6]
}

// Record writes a draft into the installed tables in one transaction, marks the
// plan recorded and returns it with the new installed revision. Lock order is
// installed (FOR UPDATE) then the plan, so concurrent records serialize and the
// second sees the first's new revision. Any failure rolls everything back.
func (s *Store) Record(ctx context.Context, id, expectedRevision, note, recordedBy string) (planning.Plan, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return planning.Plan{}, "", err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT revision FROM installed_topology WHERE singleton=true FOR UPDATE`); err != nil {
		return planning.Plan{}, "", err
	}
	p, err := loadPlan(ctx, tx, id, true)
	if err != nil {
		return planning.Plan{}, "", err
	}
	if p.Status == "recorded" {
		return planning.Plan{}, "", planning.ErrRecorded
	}
	if p.Revision != expectedRevision {
		return planning.Plan{}, "", fmt.Errorf("%w: this draft changed; refresh before trying again", planning.ErrConflict)
	}
	installed, err := loadInstalled(ctx, tx)
	if err != nil {
		return planning.Plan{}, "", err
	}
	if p.BaseRevision != installed.Revision {
		return planning.Plan{}, "", fmt.Errorf("%w: Installed changed since this draft; update the draft first", planning.ErrConflict)
	}
	note = strings.TrimSpace(note)
	if n := len([]rune(note)); n < 1 || n > MaxRecordNote {
		return planning.Plan{}, "", fmt.Errorf("%w: a note of 1–%d characters is required", planning.ErrInvalid, MaxRecordNote)
	}
	recordedBy = strings.TrimSpace(recordedBy)
	if n := len([]rune(recordedBy)); n < 1 || n > MaxRecordedBy {
		return planning.Plan{}, "", fmt.Errorf("%w: recordedBy of 1–%d characters is required", planning.ErrInvalid, MaxRecordedBy)
	}
	proposed, err := planning.Apply(installed, p)
	if err != nil {
		return planning.Plan{}, "", err
	}
	delta, err := planning.Diff(installed, proposed)
	if err != nil {
		return planning.Plan{}, "", fmt.Errorf("record refused: %w", err)
	}
	if err = writeDelta(ctx, tx, delta); err != nil {
		return planning.Plan{}, "", err
	}
	if err = writePlanObjects(ctx, tx, id, delta); err != nil {
		return planning.Plan{}, "", err
	}
	revision := newInstalledRevision()
	if _, err = tx.Exec(ctx, `UPDATE installed_topology SET revision=$1 WHERE singleton=true`, revision); err != nil {
		return planning.Plan{}, "", err
	}
	if _, err = tx.Exec(ctx, `UPDATE plans SET status='recorded', recorded_at=now(), record_note=$2, recorded_by=$3, revision=revision+1, updated_at=now() WHERE id=$1`, id, note, recordedBy); err != nil {
		return planning.Plan{}, "", err
	}
	// The plan keeps naming what it changed, including what Installed no longer has.
	labels, err := json.Marshal(planning.RecordLabels(installed, proposed, p, delta))
	if err != nil {
		return planning.Plan{}, "", err
	}
	if _, err = tx.Exec(ctx, `UPDATE plans SET additions = additions || jsonb_build_object('labels', $2::jsonb) WHERE id=$1`, id, labels); err != nil {
		return planning.Plan{}, "", err
	}
	// The result is what a reader will see: the stored plan, loaded back.
	recorded, err := loadPlan(ctx, tx, id, false)
	if err != nil {
		return planning.Plan{}, "", err
	}
	// The recorded snapshot must itself be valid and equal to the proposal.
	after, err := loadInstalled(ctx, tx)
	if err != nil {
		return planning.Plan{}, "", fmt.Errorf("recorded topology is invalid: %w", err)
	}
	if rest, err := planning.Diff(after, proposed); err != nil || len(rest.AddedEquipment)+len(rest.RemovedEquipment)+len(rest.AddedLinks)+len(rest.RemovedLinks)+len(rest.Moved)+len(rest.AddedEndpoints)+len(rest.RemovedEndpoints) != 0 {
		return planning.Plan{}, "", fmt.Errorf("recorded topology differs from the proposal: %v", err)
	}
	return recorded, revision, tx.Commit(ctx)
}

// writeDelta applies the delta in a foreign-key-safe order:
//  1. deletes of links, occupancy (removed and moved equipment), endpoints,
//     subpanels and equipment;
//  2. new sites, nodes and racks (so moves can target them);
//  3. placement moves (occupancy is rewritten around the equipment update);
//  4. deletes of racks, nodes and sites, now empty (moves had to leave first;
//     node layouts cascade);
//  5. new equipment with occupancy, subpanels, endpoints, links.
func writeDelta(ctx context.Context, tx pgx.Tx, d planning.Delta) error {
	exec := func(sql string, args ...any) error {
		_, err := tx.Exec(ctx, sql, args...)
		return err
	}
	if err := exec(`DELETE FROM link_endpoints WHERE link_id = ANY($1)`, d.RemovedLinks); err != nil {
		return err
	}
	if err := exec(`DELETE FROM links WHERE id = ANY($1)`, d.RemovedLinks); err != nil {
		return err
	}
	moved := make([]string, 0, len(d.Moved))
	for _, e := range d.Moved {
		moved = append(moved, e.ID)
	}
	if err := exec(`DELETE FROM rack_occupancy WHERE equipment_id = ANY($1) OR equipment_id = ANY($2)`, d.RemovedEquipment, moved); err != nil {
		return err
	}
	if err := exec(`DELETE FROM endpoints WHERE id = ANY($1)`, d.RemovedEndpoints); err != nil {
		return err
	}
	if err := exec(`DELETE FROM subpanels WHERE id = ANY($1)`, d.RemovedSubpanels); err != nil {
		return err
	}
	if err := exec(`DELETE FROM equipment WHERE id = ANY($1)`, d.RemovedEquipment); err != nil {
		return err
	}
	for _, site := range d.AddedSites {
		if err := insertSite(ctx, tx, site); err != nil {
			return err
		}
	}
	for _, node := range d.AddedNodes {
		if err := insertNode(ctx, tx, node); err != nil {
			return err
		}
	}
	for _, rack := range d.AddedRacks {
		if err := insertRack(ctx, tx, rack); err != nil {
			return err
		}
	}
	for _, e := range d.Moved {
		if err := exec(`UPDATE equipment SET rack_id=$2, unit=$3 WHERE id=$1`, e.ID, e.RackID, e.Unit); err != nil {
			return err
		}
	}
	for _, e := range d.Moved { // after all updates, so equipment swapping units never collides
		if err := insertOccupancy(ctx, tx, e); err != nil {
			return err
		}
	}
	if err := exec(`DELETE FROM racks WHERE id = ANY($1)`, d.RemovedRacks); err != nil {
		return err
	}
	if err := exec(`DELETE FROM location_nodes WHERE id = ANY($1)`, d.RemovedNodes); err != nil {
		return err
	}
	if err := exec(`DELETE FROM sites WHERE id = ANY($1)`, d.RemovedSites); err != nil {
		return err
	}
	for _, e := range d.AddedEquipment {
		if err := insertEquipment(ctx, tx, e); err != nil {
			return err
		}
	}
	for _, sp := range d.AddedSubpanels {
		if err := insertSubpanel(ctx, tx, sp); err != nil {
			return err
		}
	}
	for _, p := range d.AddedEndpoints {
		if err := insertEndpoint(ctx, tx, p); err != nil {
			return err
		}
	}
	for _, l := range d.AddedLinks {
		if err := insertLink(ctx, tx, l); err != nil {
			return err
		}
	}
	return nil
}

// Rebase moves a draft to the current installed revision ("Update draft") when
// planning.Check finds no conflicts; otherwise it returns a *planning.ConflictsError
// and changes nothing. Rebasing a draft that is already current is a no-op.
func (s *Store) Rebase(ctx context.Context, id, expectedRevision string) (planning.Plan, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return planning.Plan{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT revision FROM installed_topology WHERE singleton=true FOR SHARE`); err != nil {
		return planning.Plan{}, err
	}
	p, err := loadPlan(ctx, tx, id, true)
	if err != nil {
		return planning.Plan{}, err
	}
	if p.Status == "recorded" {
		return planning.Plan{}, planning.ErrRecorded
	}
	if p.Revision != expectedRevision {
		return planning.Plan{}, fmt.Errorf("%w: this draft changed; refresh before trying again", planning.ErrConflict)
	}
	installed, err := loadInstalled(ctx, tx)
	if err != nil {
		return planning.Plan{}, err
	}
	if p.BaseRevision == installed.Revision {
		return p, nil
	}
	if conflicts := planning.Check(installed, p); len(conflicts) > 0 {
		return planning.Plan{}, &planning.ConflictsError{Conflicts: conflicts}
	}
	if _, err = tx.Exec(ctx, `UPDATE plans SET base_revision=$2, revision=revision+1, updated_at=now() WHERE id=$1`, id, installed.Revision); err != nil {
		return planning.Plan{}, err
	}
	rebased, err := loadPlan(ctx, tx, id, false)
	if err != nil {
		return planning.Plan{}, err
	}
	if _, err := planning.Apply(installed, rebased); err != nil {
		return planning.Plan{}, errors.Join(errors.New("rebased draft does not apply"), err)
	}
	return rebased, tx.Commit(ctx)
}

// writePlanObjects lists what the plan changed, so an object's history can find
// the recorded plans that touched it. Endpoints, subpanels and bridges belong to
// their equipment and are not listed; links are listed only when they are cables.
func writePlanObjects(ctx context.Context, tx pgx.Tx, planID string, d planning.Delta) error {
	var kinds, ids, changes []string
	add := func(kind, change string, objectIDs ...string) {
		for _, id := range objectIDs {
			kinds, ids, changes = append(kinds, kind), append(ids, id), append(changes, change)
		}
	}
	for _, x := range d.AddedSites {
		add("site", "added", x.ID)
	}
	for _, x := range d.AddedNodes {
		add("node", "added", x.ID)
	}
	for _, x := range d.AddedRacks {
		add("rack", "added", x.ID)
	}
	for _, x := range d.AddedEquipment {
		add("equipment", "added", x.ID)
	}
	for _, x := range d.AddedLinks {
		if x.Kind == "cable" {
			add("cable", "added", x.ID)
		}
	}
	for _, x := range d.Moved {
		add("equipment", "moved", x.ID)
	}
	add("site", "removed", d.RemovedSites...)
	add("node", "removed", d.RemovedNodes...)
	add("rack", "removed", d.RemovedRacks...)
	add("equipment", "removed", d.RemovedEquipment...)
	add("cable", "removed", d.RemovedCables...)
	if len(ids) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `INSERT INTO plan_objects(plan_id,object_kind,object_id,change) SELECT $1, k, i, c FROM unnest($2::text[],$3::text[],$4::text[]) AS t(k,i,c)`, planID, kinds, ids, changes)
	return err
}

// RecordedPlansChanging lists the recorded plans that added, moved or removed
// the object, newest first (History). Drafts never appear.
func (s *Store) RecordedPlansChanging(ctx context.Context, objectID string) ([]planning.Plan, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT p.id FROM plans p WHERE p.status='recorded'
		AND EXISTS (SELECT 1 FROM plan_objects o WHERE o.plan_id=p.id AND o.object_id=$1)
		ORDER BY p.recorded_at DESC, p.id`, objectID)
	if err != nil {
		return nil, err
	}
	var ids []string
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
	plans := []planning.Plan{}
	for _, id := range ids {
		p, err := loadPlan(ctx, tx, id, false)
		if err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, tx.Commit(ctx)
}

// CheckPlan is the read-only check behind the review step: whether the draft's
// base is stale, and every change that cannot apply to the current installed
// topology. It changes nothing and takes no locks beyond a consistent read.
func (s *Store) CheckPlan(ctx context.Context, id string) (bool, []planning.Conflict, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return false, nil, err
	}
	defer tx.Rollback(ctx)
	p, err := loadPlan(ctx, tx, id, false)
	if err != nil {
		return false, nil, err
	}
	if p.Status == "recorded" {
		return false, nil, planning.ErrRecorded
	}
	installed, err := loadInstalled(ctx, tx)
	if err != nil {
		return false, nil, err
	}
	conflicts := planning.Check(installed, p)
	if conflicts == nil {
		conflicts = []planning.Conflict{}
	}
	return p.BaseRevision != installed.Revision, conflicts, tx.Commit(ctx)
}
