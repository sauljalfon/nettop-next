package persistence

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"

	"nettop.local/backend/internal/planning"
)

func planObjectRows(t *testing.T, s *Store, planID string) []string {
	t.Helper()
	rows, err := s.pool.Query(context.Background(), `SELECT object_kind||':'||object_id||':'||change FROM plan_objects WHERE plan_id=$1`, planID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var row string
		if err := rows.Scan(&row); err != nil {
			t.Fatal(err)
		}
		out = append(out, row)
	}
	slices.Sort(out)
	return out
}

// RC-07: recording needs recordedBy; it is stored with the plan, and
// plan_objects holds exactly the objects the plan added, moved and removed.
func TestRC07RecordingRequiresRecordedByAndFillsPlanObjects(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	p := mixedPlan(t, s)
	for name, by := range map[string]string{"missing": "", "blank": "  ", "101 characters": strings.Repeat("n", 101)} {
		if _, _, err := s.Record(ctx, p.ID, p.Revision, "note", by); !errors.Is(err, planning.ErrInvalid) {
			t.Fatalf("%s recordedBy: want ErrInvalid, got %v", name, err)
		}
	}
	if rows := planObjectRows(t, s, p.ID); len(rows) != 0 {
		t.Fatalf("a refused record wrote plan_objects: %v", rows)
	}
	if again, _ := s.Plan(ctx, p.ID); again.Status != "draft" || again.RecordedBy != "" {
		t.Fatal("a refused record changed the plan")
	}
	recorded, _, err := s.Record(ctx, p.ID, p.Revision, "Mixed work", "  Dana Cohen  ")
	if err != nil {
		t.Fatal(err)
	}
	if recorded.RecordedBy != "Dana Cohen" {
		t.Fatalf("recordedBy = %q", recorded.RecordedBy)
	}
	if loaded, _ := s.Plan(ctx, p.ID); loaded.RecordedBy != "Dana Cohen" {
		t.Fatal("recordedBy was not stored")
	}
	want := []string{
		"site:" + p.Sites[0].ID + ":added", "node:" + p.Nodes[0].ID + ":added", "rack:" + p.Racks[0].ID + ":added",
		"equipment:panel-a:removed", "equipment:edge-22:removed", "equipment:panel-dr:removed",
		"equipment:agg-15:moved", "equipment:agg-08:moved",
		"rack:rack-dr01:removed", "node:node-dr-access:removed",
		"cable:cable-a01:removed", "cable:cable-a02:removed", "cable:cable-a05:removed", "cable:cable-a06:removed", "cable:cable-a09:removed", "cable:cable-a10:removed",
		"cable:cable-b01:removed", "cable:cable-b02:removed", "cable:cable-a12:removed",
		"cable:" + p.Links[0].ID + ":added",
	}
	slices.Sort(want)
	if got := planObjectRows(t, s, p.ID); !reflect.DeepEqual(got, want) {
		t.Fatalf("plan_objects wrong:\n got %v\nwant %v", got, want)
	}
	// Bridges, endpoints and subpanels are never listed.
	for _, row := range planObjectRows(t, s, p.ID) {
		if strings.Contains(row, "bridge") || strings.Contains(row, ":p1:") {
			t.Fatalf("unexpected row %s", row)
		}
	}
}

// RC-08: recorded plans that changed an object, newest first; drafts excluded.
func TestRC08RecordedPlansThatChangedAnObject(t *testing.T) {
	m := func(id, rack string, unit int) planning.Plan {
		return planning.Plan{ID: id, Name: id, Revision: "1", BaseRevision: "acceptance-1",
			Placements: []planning.PlacementInput{{EquipmentID: "agg-15", RackID: rack, Unit: unit}}}
	}
	s, _ := seeded(t, expansionDraft(), m("move-1", "rack-core-03", 1), m("move-2", "rack-core-03", 2), otherDraft())
	ctx := context.Background()
	ids := func(object string) []string {
		plans, err := s.RecordedPlansChanging(ctx, object)
		if err != nil {
			t.Fatal(err)
		}
		out := []string{}
		for _, p := range plans {
			if p.Status != "recorded" || p.RecordedBy == "" {
				t.Fatalf("only recorded plans, with their record: %+v", p)
			}
			out = append(out, p.ID)
		}
		return out
	}
	if got := ids("edge-18"); len(got) != 0 {
		t.Fatalf("a draft changes nothing yet: %v", got)
	}
	if _, _, err := s.Record(ctx, "expansion", "1", "EDGE-18", "Dana"); err != nil {
		t.Fatal(err)
	}
	if got := ids("edge-18"); !slices.Equal(got, []string{"expansion"}) {
		t.Fatalf("edge-18: %v", got)
	}
	if got := ids("planned-cable-18"); !slices.Equal(got, []string{"expansion"}) {
		t.Fatalf("its cable: %v", got)
	}
	if got := ids("agg-15"); len(got) != 0 {
		t.Fatalf("AGG-15 was only cabled to, not changed: %v", got)
	}
	// Two moves of AGG-15, the second rebased onto the first: newest first.
	if _, err := s.Rebase(ctx, "move-1", "1"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Record(ctx, "move-1", "2", "first move", "Dana"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Rebase(ctx, "move-2", "1"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Record(ctx, "move-2", "2", "second move", "Eli"); err != nil {
		t.Fatal(err)
	}
	if got := ids("agg-15"); !slices.Equal(got, []string{"move-2", "move-1"}) {
		t.Fatalf("newest first: %v", got)
	}
	if got := ids("nothing-has-this-id"); got == nil || len(got) != 0 {
		t.Fatalf("an unknown object has an empty history: %v", got)
	}
}

// RC-06: check lists the conflicts of a stale draft and changes nothing.
func TestRC06CheckListsConflictsOfAStaleDraftAndChangesNothing(t *testing.T) {
	deleter := planning.Plan{ID: "deleter", Name: "Delete", Revision: "1", BaseRevision: "acceptance-1", Removals: planning.Removals{Equipment: []string{"panel-a"}}}
	toucher := planning.Plan{ID: "toucher", Name: "Touch", Revision: "1", BaseRevision: "acceptance-1",
		Placements: []planning.PlacementInput{{EquipmentID: "panel-a", RackID: "rack-a03", Unit: 10}},
		Links:      nil,
	}
	s, _ := seeded(t, deleter, toucher)
	ctx := context.Background()
	if stale, conflicts, err := s.CheckPlan(ctx, "toucher"); err != nil || stale || len(conflicts) != 0 {
		t.Fatalf("a current, clean draft: stale=%v conflicts=%v err=%v", stale, conflicts, err)
	}
	if _, _, err := s.Record(ctx, "deleter", "1", "PANEL-A removed", "Dana"); err != nil {
		t.Fatal(err)
	}
	revision, before := installedRevision(t, s), mustPlan(t, s, "toucher")
	stale, conflicts, err := s.CheckPlan(ctx, "toucher")
	if err != nil || !stale || len(conflicts) != 1 || conflicts[0].Change != "place_equipment:panel-a" {
		t.Fatalf("stale=%v conflicts=%v err=%v", stale, conflicts, err)
	}
	if !reflect.DeepEqual(before, mustPlan(t, s, "toucher")) || installedRevision(t, s) != revision {
		t.Fatal("check changed something")
	}
	if _, _, err := s.CheckPlan(ctx, "deleter"); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("a recorded plan: %v", err)
	}
	if _, _, err := s.CheckPlan(ctx, "nope"); !errors.Is(err, planning.ErrNotFound) {
		t.Fatalf("an unknown plan: %v", err)
	}
}

func mustPlan(t *testing.T, s *Store, id string) planning.Plan {
	t.Helper()
	p, err := s.Plan(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// ED-12 with the database: remove_change persists, works on a stale draft, and
// an unknown key changes nothing.
func TestED12RemoveChangePersistsAndWorksOnAStaleDraft(t *testing.T) {
	s, url := seeded(t, expansionDraft(), otherDraft())
	ctx := context.Background()
	if _, _, err := s.Record(ctx, "other", "1", "first", "Dana"); err != nil {
		t.Fatal(err)
	}
	before := mustPlan(t, s, "expansion") // stale now
	cmd := func(rev, key string) planning.Command {
		return planning.Command{Type: "remove_change", ExpectedRevision: rev, Change: &planning.ChangeInput{Key: key}}
	}
	if _, _, err := s.RemoveChange(ctx, "expansion", cmd("1", "add_equipment:ghost")); !errors.Is(err, planning.ErrNotFound) {
		t.Fatalf("unknown key: %v", err)
	}
	if _, _, err := s.RemoveChange(ctx, "expansion", cmd("9", "add_equipment:edge-18")); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("stale plan revision: %v", err)
	}
	if !reflect.DeepEqual(before, mustPlan(t, s, "expansion")) {
		t.Fatal("a refused command changed the draft")
	}
	got, removed, err := s.RemoveChange(ctx, "expansion", cmd("1", "add_equipment:edge-18"))
	if err != nil {
		t.Fatal(err)
	}
	if got.Revision != "2" || len(got.Equipment)+len(got.Links) != 0 || !slices.Equal(removed, []string{"add_equipment:edge-18", "add_cable:planned-cable-18"}) {
		t.Fatalf("result: %+v %v", got, removed)
	}
	if got.BaseRevision != before.BaseRevision {
		t.Fatal("the base must not move; Update draft does that")
	}
	// The same command through the generic path.
	if _, err := s.Command(ctx, "other", cmd("1", "add_equipment:edge-19")); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("a recorded plan refuses it: %v", err)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if loaded := mustPlan(t, reopened, "expansion"); !reflect.DeepEqual(loaded, got) {
		t.Fatalf("not persisted: %+v", loaded)
	}
}

// Labels name what a plan touches. They are saved with the plan, a record adds
// the names of what Installed no longer has, and they survive a reconnect.
func TestLabelsSurvivePersistenceAndRecording(t *testing.T) {
	s, url := seeded(t)
	ctx := context.Background()
	p := mixedPlan(t, s)
	want := map[string]string{
		"panel-a": "PANEL-A", "rack-a03": "Rack A03", "edge-22": "EDGE-22", "panel-dr": "PANEL-DR",
		"rack-dr01": "Rack DR01", "node-dr-access": "DR Access", "agg-15": "AGG-15", "agg-08": "AGG-08",
		"rack-core-03": "Rack Core 03",
		"cable-a12":    "HDF-02 · 3A/1 rear ↔ BB-01 · Port 1",
		p.Sites[0].ID:  "New site",
		p.Nodes[0].ID:  "New node",
		p.Racks[0].ID:  "New rack",
		"bb-01:p1":     "BB-01 · Port 1",
		"agg-15:p3":    "AGG-15 · Port 3",
	}
	check := func(label string, got map[string]string) {
		t.Helper()
		for id, name := range want {
			if got[id] != name {
				t.Errorf("%s: label[%s] = %q, want %q", label, id, got[id], name)
			}
		}
	}
	check("draft", p.Labels)
	reloaded := mustPlan(t, s, p.ID)
	if !reflect.DeepEqual(reloaded.Labels, p.Labels) {
		t.Fatal("labels changed through PostgreSQL")
	}
	recorded, _, err := s.Record(ctx, p.ID, p.Revision, "Mixed", "Dana")
	if err != nil {
		t.Fatal(err)
	}
	check("recorded", recorded.Labels)
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	check("reloaded", mustPlan(t, reopened, p.ID).Labels)
	// What Installed lost is still named by the recorded plan.
	got, err := reopened.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range got.Equipment {
		if e.ID == "panel-a" {
			t.Fatal("PANEL-A should be gone from Installed")
		}
	}
}

func TestPlanWithoutLabelsLoadsWithAnEmptyMap(t *testing.T) {
	s, _ := seeded(t, expansionDraft())
	p := mustPlan(t, s, "expansion")
	if p.Labels == nil || len(p.Labels) != 0 {
		t.Fatalf("want an empty map, got %v", p.Labels)
	}
}

// A draft whose cable end was deleted by another recorded plan is judged in names.
func TestStaleDraftConflictIsInNames(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	mine, err := s.CreatePlan(ctx, "Mine", "acceptance-1")
	if err != nil {
		t.Fatal(err)
	}
	cable := planning.Command{Type: "add_cable", ExpectedRevision: "1", Cable: &planning.CableInput{A: "agg-15:p2", B: "panel-a:10:f"}}
	if mine, err = s.Command(ctx, mine.ID, cable); err != nil {
		t.Fatal(err)
	}
	theirs, err := s.CreatePlan(ctx, "Theirs", "acceptance-1")
	if err != nil {
		t.Fatal(err)
	}
	if theirs, err = s.Command(ctx, theirs.ID, planning.Command{Type: "delete_equipment", ExpectedRevision: "1", Target: &planning.TargetInput{ID: "panel-a"}}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Record(ctx, theirs.ID, theirs.Revision, "PANEL-A removed", "Eli"); err != nil {
		t.Fatal(err)
	}
	stale, conflicts, err := s.CheckPlan(ctx, mine.ID)
	if err != nil || !stale || len(conflicts) != 1 {
		t.Fatalf("stale=%v conflicts=%v err=%v", stale, conflicts, err)
	}
	if conflicts[0].Reason != "PANEL-A · 10 · Front no longer exists" {
		t.Fatalf("reason in names, got %q", conflicts[0].Reason)
	}
}
