package persistence

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

// expansionDraft is the testserver draft: a new access switch cabled to AGG-15.
func expansionDraft() planning.Plan {
	return planning.Plan{
		ID: "expansion", Name: "Expansion", Revision: "1", BaseRevision: "acceptance-1",
		Equipment: []topology.Equipment{{ID: "edge-18", Name: "EDGE-18", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 6, Height: 1}},
		Endpoints: []topology.Endpoint{{ID: "edge-18:p1", EquipmentID: "edge-18", Label: "Port 1"}},
		Links:     []topology.Link{{ID: "planned-cable-18", A: "edge-18:p1", B: "agg-15:p1", Kind: "cable"}},
	}
}

// otherDraft is a second, independent draft on the same base.
func otherDraft() planning.Plan {
	return planning.Plan{
		ID: "other", Name: "Other", Revision: "1", BaseRevision: "acceptance-1",
		Equipment: []topology.Equipment{{ID: "edge-19", Name: "EDGE-19", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 7, Height: 1}},
		Endpoints: []topology.Endpoint{{ID: "edge-19:p1", EquipmentID: "edge-19", Label: "Port 1"}},
	}
}

func seeded(t *testing.T, plans ...planning.Plan) (*Store, string) {
	t.Helper()
	s, url := testStore(t)
	if err := s.Seed(context.Background(), acceptance.Installed(), plans...); err != nil {
		t.Fatal(err)
	}
	return s, url
}

func installedRevision(t *testing.T, s *Store) string {
	t.Helper()
	snap, err := s.Installed(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return snap.Revision
}

// sameTopology compares two snapshots by content, ignoring context and revision.
func sameTopology(t *testing.T, got, want topology.Snapshot) {
	t.Helper()
	got.Context, want.Context, got.Revision, want.Revision = "", "", "", ""
	sortSnapshot(&got)
	sortSnapshot(&want)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("installed differs from the proposed snapshot:\nequipment %d/%d endpoints %d/%d links %d/%d racks %d/%d nodes %d/%d sites %d/%d",
			len(got.Equipment), len(want.Equipment), len(got.Endpoints), len(want.Endpoints), len(got.Links), len(want.Links),
			len(got.Racks), len(want.Racks), len(got.Nodes), len(want.Nodes), len(got.Sites), len(want.Sites))
	}
}

// occupancyIsConsistent: rack_occupancy holds exactly the units of every piece
// of installed equipment, in its current rack.
func occupancyIsConsistent(t *testing.T, s *Store) {
	t.Helper()
	var total, expected, wrong int
	if err := s.pool.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM rack_occupancy), (SELECT COALESCE(sum(height),0) FROM equipment),
		(SELECT count(*) FROM rack_occupancy o JOIN equipment e ON e.id=o.equipment_id WHERE o.rack_id<>e.rack_id OR o.unit<e.unit OR o.unit>=e.unit+e.height)`).Scan(&total, &expected, &wrong); err != nil {
		t.Fatal(err)
	}
	if total != expected || wrong != 0 {
		t.Fatalf("rack_occupancy out of step: %d rows, want %d, %d misplaced", total, expected, wrong)
	}
}

func snapshotOf(t *testing.T, s *Store, planID string) topology.Snapshot {
	t.Helper()
	snap, err := s.Snapshot(context.Background(), planID)
	if err != nil {
		t.Fatal(err)
	}
	return snap
}

// RC-01: recording the Expansion draft installs EDGE-18 and its cable; installed
// equals what Apply proposed, the revision moves once, the plan keeps the note.
func TestRC01RecordingTheExpansionDraftMakesItInstalled(t *testing.T) {
	s, url := seeded(t, expansionDraft())
	ctx := context.Background()
	proposed := snapshotOf(t, s, "expansion")
	recorded, revision, err := s.Record(ctx, "expansion", "1", "  Installed EDGE-18 on 9 Oct  ", "Tester")
	if err != nil {
		t.Fatal(err)
	}
	if revision == "acceptance-1" || revision != installedRevision(t, s) {
		t.Fatalf("installed revision must change once and be returned: %q", revision)
	}
	if recorded.Status != "recorded" || recorded.RecordNote != "Installed EDGE-18 on 9 Oct" || recorded.RecordedAt == nil || recorded.Revision != "2" {
		t.Fatalf("plan not marked recorded: %+v", recorded)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	got, err := reopened.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	sameTopology(t, got, proposed)
	occupancyIsConsistent(t, reopened)
	for _, id := range []string{"edge-18", "planned-cable-18"} {
		found := false
		for _, e := range got.Equipment {
			found = found || e.ID == id
		}
		for _, l := range got.Links {
			found = found || l.ID == id
		}
		if !found {
			t.Fatalf("%s is not installed", id)
		}
	}
	plans, err := reopened.Plans(ctx)
	if err != nil || len(plans) != 1 || plans[0].Status != "recorded" || plans[0].RecordedAt == nil {
		t.Fatalf("a recorded plan stays listed with its record: %v %+v", err, plans)
	}
}

// mixedPlan builds, through the commands, a draft with every kind of change: a
// deletion, moves (one into a new rack), new containers, a disconnect, and a new
// cable on the port that was disconnected.
func mixedPlan(t *testing.T, s *Store) planning.Plan {
	t.Helper()
	ctx := context.Background()
	p, err := s.CreatePlan(ctx, "Mixed", "acceptance-1")
	if err != nil {
		t.Fatal(err)
	}
	send := func(c planning.Command) {
		t.Helper()
		c.ExpectedRevision = p.Revision
		next, err := s.Command(ctx, p.ID, c)
		if err != nil {
			t.Fatalf("%s: %v", c.Type, err)
		}
		p = next
	}
	target := func(kind, id string) planning.Command {
		return planning.Command{Type: kind, Target: &planning.TargetInput{ID: id}}
	}
	send(target("delete_equipment", "panel-a"))
	send(planning.Command{Type: "add_site", Site: &planning.SiteInput{Name: "New site"}})
	send(planning.Command{Type: "add_node", Node: &planning.NodeInput{SiteID: p.Sites[0].ID, Name: "New node"}})
	send(planning.Command{Type: "add_rack", Rack: &planning.RackInput{NodeID: p.Nodes[0].ID, Name: "New rack", Units: 12}})
	send(planning.Command{Type: "move_equipment", Placement: &planning.PlacementInput{EquipmentID: "agg-15", RackID: p.Racks[0].ID, Unit: 3}})
	send(planning.Command{Type: "move_equipment", Placement: &planning.PlacementInput{EquipmentID: "agg-08", RackID: "rack-core-03", Unit: 1}})
	send(target("delete_equipment", "edge-22"))
	send(target("delete_equipment", "panel-dr"))
	send(target("delete_rack", "rack-dr01"))
	send(target("delete_node", "node-dr-access"))
	send(target("disconnect_cable", "cable-a12")) // hdf-02 3A/1 rear — bb-01:p1
	send(planning.Command{Type: "add_cable", Cable: &planning.CableInput{A: "bb-01:p1", B: "agg-15:p3"}})
	return p
}

// RC-01 (every kind of change): the database matches what Apply proposed.
func TestRC01RecordingMixedChangesMatchesApply(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	p := mixedPlan(t, s)
	proposed := snapshotOf(t, s, p.ID)
	if _, _, err := s.Record(ctx, p.ID, p.Revision, "Mixed work", "Tester"); err != nil {
		t.Fatal(err)
	}
	got, err := s.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	sameTopology(t, got, proposed)
	occupancyIsConsistent(t, s)
	for _, gone := range []string{"panel-a", "edge-22", "panel-dr"} {
		for _, e := range got.Equipment {
			if e.ID == gone {
				t.Fatalf("%s is still installed", gone)
			}
		}
	}
}

// RC-02: a stale base is a 409 that changes nothing; a missing note is a 422.
func TestRC02StaleBaseAndMissingNoteChangeNothing(t *testing.T) {
	s, _ := seeded(t, expansionDraft(), otherDraft())
	ctx := context.Background()
	if _, _, err := s.Record(ctx, "other", "1", "first", "Tester"); err != nil {
		t.Fatal(err)
	}
	after := installedRevision(t, s)
	before, _ := s.Plan(ctx, "expansion")
	_, _, err := s.Record(ctx, "expansion", "1", "late", "Tester")
	if !errors.Is(err, planning.ErrConflict) || !strings.Contains(err.Error(), "Installed changed since this draft; update the draft first") {
		t.Fatalf("want the stale-base conflict, got %v", err)
	}
	if again, _ := s.Plan(ctx, "expansion"); !reflect.DeepEqual(before, again) || installedRevision(t, s) != after {
		t.Fatal("a refused record changed something")
	}
	if _, _, err := s.Record(ctx, "missing", "1", "x", "Tester"); !errors.Is(err, planning.ErrNotFound) {
		t.Fatalf("unknown plan: %v", err)
	}

	s2, _ := seeded(t, expansionDraft())
	rev := installedRevision(t, s2)
	for name, c := range map[string]struct{ revision, note string }{
		"no note": {"1", ""}, "blank note": {"1", "  \n "}, "501 characters": {"1", strings.Repeat("x", 501)},
	} {
		if _, _, err := s2.Record(ctx, "expansion", c.revision, c.note, "Tester"); !errors.Is(err, planning.ErrInvalid) {
			t.Fatalf("%s: want ErrInvalid, got %v", name, err)
		}
	}
	if _, _, err := s2.Record(ctx, "expansion", "9", "stale plan revision", "Tester"); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("wrong plan revision: %v", err)
	}
	if plan, _ := s2.Plan(ctx, "expansion"); plan.Status != "draft" || installedRevision(t, s2) != rev {
		t.Fatal("a refused record changed something")
	}
}

// RC-02: two drafts on the same base recorded at once — exactly one wins.
func TestRC02ConcurrentRecordsOnlyOneWins(t *testing.T) {
	s, _ := seeded(t, expansionDraft(), otherDraft())
	ctx := context.Background()
	start := make(chan struct{})
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i, id := range []string{"expansion", "other"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, _, errs[i] = s.Record(ctx, id, "1", "concurrent", "Tester")
		}()
	}
	close(start)
	wg.Wait()
	wins := 0
	for i, err := range errs {
		if err == nil {
			wins++
		} else if !errors.Is(err, planning.ErrConflict) {
			t.Fatalf("the loser must get a conflict, got %v (draft %d)", err, i)
		}
	}
	if wins != 1 {
		t.Fatalf("exactly one record must win, got %v", errs)
	}
	recorded, drafts := 0, 0
	plans, _ := s.Plans(ctx)
	for _, p := range plans {
		if p.Status == "recorded" {
			recorded++
		} else {
			drafts++
		}
	}
	snap, _ := s.Installed(ctx)
	if recorded != 1 || drafts != 1 || len(snap.Equipment) != len(acceptance.Installed().Equipment)+1 {
		t.Fatalf("one plan recorded, one untouched, one new switch installed: %d/%d/%d", recorded, drafts, len(snap.Equipment))
	}
	occupancyIsConsistent(t, s)
}

// RC-03: a recorded plan refuses commands, record and rebase with a conflict.
func TestRC03RecordedPlanIsReadOnly(t *testing.T) {
	s, _ := seeded(t, expansionDraft())
	ctx := context.Background()
	if _, _, err := s.Record(ctx, "expansion", "1", "done", "Tester"); err != nil {
		t.Fatal(err)
	}
	before, _ := s.Plan(ctx, "expansion")
	if _, err := s.Command(ctx, "expansion", planning.Command{Type: "add_site", ExpectedRevision: before.Revision, Site: &planning.SiteInput{Name: "X"}}); !errors.Is(err, planning.ErrConflict) || !strings.Contains(err.Error(), "recorded and read-only") {
		t.Fatalf("command: %v", err)
	}
	if _, _, err := s.Record(ctx, "expansion", before.Revision, "again", "Tester"); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("record: %v", err)
	}
	if _, err := s.Rebase(ctx, "expansion", before.Revision); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("rebase: %v", err)
	}
	if after, _ := s.Plan(ctx, "expansion"); !reflect.DeepEqual(before, after) {
		t.Fatal("a recorded plan changed")
	}
}

// RB-01: once another draft is recorded, a clean draft rebases and applies.
func TestRB01CleanDraftRebasesToTheNewRevision(t *testing.T) {
	s, _ := seeded(t, expansionDraft(), otherDraft())
	ctx := context.Background()
	if _, _, err := s.Record(ctx, "other", "1", "first", "Tester"); err != nil {
		t.Fatal(err)
	}
	current := installedRevision(t, s)
	if _, err := s.Snapshot(ctx, "expansion"); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("the stale draft cannot be applied yet: %v", err)
	}
	if _, err := s.Rebase(ctx, "expansion", "7"); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("wrong draft revision: %v", err)
	}
	p, err := s.Rebase(ctx, "expansion", "1")
	if err != nil {
		t.Fatal(err)
	}
	if p.BaseRevision != current || p.Revision != "2" || p.Status != "draft" {
		t.Fatalf("rebase result: %+v", p)
	}
	if _, err := s.Snapshot(ctx, "expansion"); err != nil {
		t.Fatalf("the rebased draft must apply: %v", err)
	}
	again, err := s.Rebase(ctx, "expansion", "2") // already current: a no-op
	if err != nil || again.Revision != "2" || again.BaseRevision != current {
		t.Fatalf("rebasing a current draft is a no-op: %v %+v", err, again)
	}
	if _, err := s.Command(ctx, "expansion", planning.Command{Type: "add_site", ExpectedRevision: "2", Site: &planning.SiteInput{Name: "After rebase"}}); err != nil {
		t.Fatal(err)
	}
}

// RB-02: a draft that touches PANEL-A cannot move to a base that deleted it; the
// 409 lists the conflicting changes and the draft is unchanged.
func TestRB02ConflictingDraftGetsItsConflictListAndIsUnchanged(t *testing.T) {
	deleter := planning.Plan{ID: "deleter", Name: "Delete", Revision: "1", BaseRevision: "acceptance-1", Removals: planning.Removals{Equipment: []string{"panel-a"}}}
	toucher := planning.Plan{ID: "toucher", Name: "Touch", Revision: "1", BaseRevision: "acceptance-1",
		Placements: []planning.PlacementInput{{EquipmentID: "panel-a", RackID: "rack-a03", Unit: 10}},
		Links:      []topology.Link{{ID: "cable-new", A: "panel-a:5:f", B: "agg-15:p2", Kind: "cable"}},
		Sites:      []topology.Site{{ID: "site-fine", Name: "Fine"}},
	}
	s, _ := seeded(t, deleter, toucher)
	ctx := context.Background()
	if _, _, err := s.Record(ctx, "deleter", "1", "PANEL-A removed", "Tester"); err != nil {
		t.Fatal(err)
	}
	before, _ := s.Plan(ctx, "toucher")
	_, err := s.Rebase(ctx, "toucher", "1")
	var conflicts *planning.ConflictsError
	if !errors.As(err, &conflicts) || !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("want ConflictsError, got %v", err)
	}
	changes := map[string]bool{}
	for _, c := range conflicts.Conflicts {
		changes[c.Change] = true
	}
	if !changes["place_equipment:panel-a"] || !changes["add_cable:cable-new"] || changes["add_site:site-fine"] || len(changes) != 2 {
		t.Fatalf("conflicts should name exactly the two PANEL-A changes: %+v", conflicts.Conflicts)
	}
	if after, _ := s.Plan(ctx, "toucher"); !reflect.DeepEqual(before, after) {
		t.Fatal("a conflicting rebase changed the draft")
	}
}

// Migration 007 constraint: a recorded plan has a time and a non-blank note.
func TestMigration007PlanRecordStateConstraint(t *testing.T) {
	s, _ := seeded(t, expansionDraft())
	ctx := context.Background()
	for name, sql := range map[string]string{
		"recorded without a note": `UPDATE plans SET status='recorded', recorded_at=now()`,
		"recorded blank note":     `UPDATE plans SET status='recorded', recorded_at=now(), record_note='  ', recorded_by='A'`,
		"recorded without a name": `UPDATE plans SET status='recorded', recorded_at=now(), record_note='x'`,
		"recorded blank name":     `UPDATE plans SET status='recorded', recorded_at=now(), record_note='x', recorded_by=' '`,
		"recorded 101-char name":  `UPDATE plans SET status='recorded', recorded_at=now(), record_note='x', recorded_by=repeat('n',101)`,
		"draft with a name":       `UPDATE plans SET recorded_by='A'`,
		"recorded without a time": `UPDATE plans SET status='recorded', record_note='x', recorded_by='A'`,
		"draft with a note":       `UPDATE plans SET record_note='x'`,
		"unknown status":          `UPDATE plans SET status='deleted'`,
	} {
		if _, err := s.pool.Exec(ctx, sql); err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO change_log(entity_kind,entity_id,field,old_value,new_value) VALUES('equipment','agg-03','name','AGG-03','AGG-03A')`); err != nil {
		t.Fatalf("change_log: %v", err)
	}
}
