package persistence

import (
	"context"
	"errors"
	"sync"
	"testing"

	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/sample"
)

func hdfCommand(name string, unit, height, rows int, revision string) planning.Command {
	return planning.Command{Type: "add_hdf", ExpectedRevision: revision, HDF: &planning.HDFInput{Name: name, RackID: "rack-03", Unit: unit, Height: height, Rows: rows}}
}

func seededStore(t *testing.T) (*Store, string) {
	t.Helper()
	s, url := testStore(t)
	if err := s.Seed(context.Background(), sample.Installed(), sample.Expansion()); err != nil {
		t.Fatal(err)
	}
	return s, url
}

func storedAdditions(t *testing.T, s *Store, id string) string {
	t.Helper()
	var body string
	if err := s.pool.QueryRow(context.Background(), `SELECT additions::text||'|'||revision::text FROM plans WHERE id=$1`, id).Scan(&body); err != nil {
		t.Fatal(err)
	}
	return body
}

// D14 for plans: the whole HDF proposal survives a reconnect as one revision.
func TestAddHDFPersistsAsOneRevisionAndSurvivesReconnect(t *testing.T) {
	s, url := seededStore(t)
	ctx := context.Background()
	p, err := s.CreatePlan(ctx, "HDF proposal", "sample-1")
	if err != nil {
		t.Fatal(err)
	}
	p, err = s.Command(ctx, p.ID, hdfCommand("HDF-NEW", 3, 3, 4, "1"))
	if err != nil {
		t.Fatal(err)
	}
	if p.Revision != "2" || len(p.Subpanels) != 16 || len(p.Endpoints) != 192 || len(p.Links) != 96 || len(p.Equipment) != 1 {
		t.Fatalf("unexpected saved draft: rev=%s %d/%d/%d", p.Revision, len(p.Subpanels), len(p.Endpoints), len(p.Links))
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	loaded, err := reopened.Plan(ctx, p.ID)
	if err != nil || len(loaded.Subpanels) != 16 || loaded.Revision != "2" || loaded.Equipment[0].Kind != "hdf" || loaded.Equipment[0].Height != 3 {
		t.Fatalf("reloaded draft differs: %v %+v", err, loaded.Equipment)
	}
	planned, err := reopened.Snapshot(ctx, p.ID)
	if err != nil || len(planned.Subpanels) != 16 {
		t.Fatalf("planned snapshot lost the grid: %d %v", len(planned.Subpanels), err)
	}
	installed, err := reopened.Installed(ctx)
	if err != nil || len(installed.Subpanels) != 0 || len(installed.Equipment) != 4 {
		t.Fatalf("a plan write changed installed topology: %v", err)
	}
}

// D12: a placement conflict leaves no chassis, subpanel, endpoint, bridge, or
// revision change behind: the stored draft is byte-for-byte unchanged.
func TestAddHDFPlacementConflictRollsBackEverything(t *testing.T) {
	s, _ := seededStore(t)
	ctx := context.Background()
	p, err := s.CreatePlan(ctx, "Conflicts", "sample-1")
	if err != nil {
		t.Fatal(err)
	}
	if p, err = s.Command(ctx, p.ID, hdfCommand("HDF-A", 3, 3, 2, "1")); err != nil {
		t.Fatal(err)
	}
	before := storedAdditions(t, s, p.ID)
	conflicts := map[string]planning.Command{
		"installed equipment": hdfCommand("HDF-B", 7, 2, 2, "2"),  // EDGE-01 at unit 8
		"earlier proposal":    hdfCommand("HDF-B", 4, 2, 2, "2"),  // HDF-A at 3-5
		"beyond the rack":     hdfCommand("HDF-B", 11, 3, 2, "2"), // rack has 12 units
		"rows out of range":   hdfCommand("HDF-B", 6, 2, 33, "2"),
		"duplicate name":      hdfCommand("hdf-a", 6, 2, 2, "2"),
	}
	for name, command := range conflicts {
		if _, err := s.Command(ctx, p.ID, command); !errors.Is(err, planning.ErrInvalid) {
			t.Fatalf("%s: expected ErrInvalid, got %v", name, err)
		}
		if after := storedAdditions(t, s, p.ID); after != before {
			t.Fatalf("%s: the stored draft changed", name)
		}
	}
	stale := hdfCommand("HDF-B", 6, 2, 2, "1")
	if _, err := s.Command(ctx, p.ID, stale); !errors.Is(err, planning.ErrConflict) || storedAdditions(t, s, p.ID) != before {
		t.Fatalf("stale write must conflict without changes: %v", err)
	}
	loaded, _ := s.Plan(ctx, p.ID)
	if loaded.Revision != "2" || len(loaded.Equipment) != 1 || len(loaded.Subpanels) != 8 || len(loaded.Endpoints) != 96 || len(loaded.Links) != 48 {
		t.Fatalf("partial HDF left in the draft: %+v", loaded)
	}
}

func TestConcurrentAddHDFOnlyOneWinsWithACompleteGrid(t *testing.T) {
	s, _ := seededStore(t)
	ctx := context.Background()
	p, err := s.CreatePlan(ctx, "Race", "sample-1")
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.Command(ctx, p.ID, hdfCommand("HDF-RACE", 3, 3, 2, "1"))
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	wins, conflicts := 0, 0
	for err := range results {
		switch {
		case err == nil:
			wins++
		case errors.Is(err, planning.ErrConflict):
			conflicts++
		default:
			t.Fatal(err)
		}
	}
	loaded, _ := s.Plan(ctx, p.ID)
	if wins != 1 || conflicts != 1 || len(loaded.Equipment) != 1 || len(loaded.Subpanels) != 8 {
		t.Fatalf("wins=%d conflicts=%d equipment=%d subpanels=%d", wins, conflicts, len(loaded.Equipment), len(loaded.Subpanels))
	}
}

// A09: plans saved before subpanels existed have no "subpanels" key. They load
// as "no subpanels", stay traceable, and accept add_hdf; a stored half-HDF is
// refused instead of being served as an overlay.
func TestOldPlanPayloadsLoadAndHalfValidHDFPlansAreRefused(t *testing.T) {
	s, _ := seededStore(t)
	ctx := context.Background()
	insert := func(id, additions string) {
		t.Helper()
		if _, err := s.pool.Exec(ctx, `INSERT INTO plans(id,name,base_revision,revision,additions) VALUES($1,$1,'sample-1',1,$2)`, id, additions); err != nil {
			t.Fatal(err)
		}
	}
	insert("old-missing", `{"equipment":[],"updates":[],"endpoints":[],"links":[]}`)
	insert("old-null", `{"equipment":[],"updates":[],"endpoints":[],"links":[],"subpanels":null}`)
	for _, id := range []string{"old-missing", "old-null"} {
		loaded, err := s.Plan(ctx, id)
		if err != nil || loaded.Subpanels == nil || len(loaded.Subpanels) != 0 {
			t.Fatalf("%s: subpanels must load as an empty list: %v %+v", id, err, loaded.Subpanels)
		}
		if _, err := s.Snapshot(ctx, id); err != nil {
			t.Fatalf("%s: old payload is not a valid overlay: %v", id, err)
		}
		updated, err := s.Command(ctx, id, hdfCommand("HDF-"+id, 3, 3, 1, "1"))
		if err != nil || len(updated.Subpanels) != 4 {
			t.Fatalf("%s: add_hdf on an old payload failed: %v", id, err)
		}
	}
	insert("half", `{"equipment":[{"id":"h","name":"H","kind":"hdf","role":"passive","rackId":"rack-03","unit":3,"height":3}],"updates":[],"endpoints":[],"links":[]}`)
	before := storedAdditions(t, s, "half")
	if _, err := s.Snapshot(ctx, "half"); err == nil {
		t.Fatal("a chassis without its grid was served as an overlay")
	}
	if _, err := s.Command(ctx, "half", hdfCommand("HDF-X", 6, 2, 1, "1")); err == nil {
		t.Fatal("a command was applied on top of a half-valid HDF draft")
	}
	if storedAdditions(t, s, "half") != before {
		t.Fatal("a refused command changed the stored draft")
	}
}
