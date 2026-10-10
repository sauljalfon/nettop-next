package persistence

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
)

// ED-06 with the database: every new command persists atomically with a fresh
// ID, survives a reconnect, and a refused command persists nothing.
func TestED06NewCommandsPersistAtomically(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	if err := s.Seed(ctx, acceptance.Installed()); err != nil {
		t.Fatal(err)
	}
	p, err := s.CreatePlan(ctx, "Editing", "acceptance-1")
	if err != nil {
		t.Fatal(err)
	}
	send := func(c planning.Command) (planning.Plan, error) {
		c.ExpectedRevision = p.Revision
		next, err := s.Command(ctx, p.ID, c)
		if err == nil {
			p = next
		}
		return next, err
	}
	if _, err := send(planning.Command{Type: "add_site", Site: &planning.SiteInput{Name: "Annex"}}); err != nil {
		t.Fatal(err)
	}
	siteID := p.Sites[0].ID
	if _, err := send(planning.Command{Type: "add_node", Node: &planning.NodeInput{SiteID: siteID, Name: "Hall"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := send(planning.Command{Type: "add_rack", Rack: &planning.RackInput{NodeID: p.Nodes[0].ID, Name: "R1", Units: 24}}); err != nil {
		t.Fatal(err)
	}
	if _, err := send(planning.Command{Type: "delete_equipment", Target: &planning.TargetInput{ID: "panel-a"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := send(planning.Command{Type: "disconnect_cable", Target: &planning.TargetInput{ID: "cable-b01"}}); err != nil {
		t.Fatal(err)
	}
	// A refused command: 422-class error, revision and stored plan unchanged.
	stored, _ := s.Plan(ctx, p.ID)
	if _, err := send(planning.Command{Type: "delete_rack", Target: &planning.TargetInput{ID: "rack-a03"}}); !errors.Is(err, planning.ErrInvalid) {
		t.Fatalf("want ErrInvalid, got %v", err)
	}
	if again, _ := s.Plan(ctx, p.ID); !reflect.DeepEqual(stored, again) {
		t.Fatal("a refused command changed the stored plan")
	}
	// A proposed empty container can be deleted again.
	if _, err := send(planning.Command{Type: "delete_rack", Target: &planning.TargetInput{ID: p.Racks[0].ID}}); err != nil {
		t.Fatal(err)
	}
	if p.Revision != "7" || len(p.Racks) != 0 {
		t.Fatalf("unexpected final plan: %+v", p)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	loaded, err := reopened.Plan(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Revision != "7" || len(loaded.Sites) != 1 || len(loaded.Nodes) != 1 || len(loaded.Racks) != 0 ||
		!reflect.DeepEqual(loaded.Removals, planning.Removals{Equipment: []string{"panel-a"}, Links: []string{"cable-b01"}}) {
		t.Fatalf("plan changed through PostgreSQL: %+v", loaded)
	}
	planned, err := reopened.Snapshot(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(planned.Sites) != 3 || len(planned.Equipment) != len(acceptance.Installed().Equipment)-1 {
		t.Fatal("the proposed snapshot does not reflect the plan")
	}
}

// BK-01 with the database: a batch persists atomically with one revision bump and
// its allocated IDs; a failing one persists nothing.
func TestBK01BatchPersistsAtomically(t *testing.T) {
	s, url := testStore(t)
	ctx := context.Background()
	if err := s.Seed(ctx, acceptance.Installed()); err != nil {
		t.Fatal(err)
	}
	p, err := s.CreatePlan(ctx, "Batch", "acceptance-1")
	if err != nil {
		t.Fatal(err)
	}
	batch := func(rev string, commands ...planning.Command) planning.Command {
		return planning.Command{Type: "batch", ExpectedRevision: rev, Batch: &planning.BatchInput{Commands: commands}}
	}
	cable := func(a, b string) planning.Command {
		return planning.Command{Type: "add_cable", Cable: &planning.CableInput{A: a, B: b}}
	}
	site := planning.Command{Type: "add_site", Site: &planning.SiteInput{Name: "Depot"}}
	del := planning.Command{Type: "delete_equipment", Target: &planning.TargetInput{ID: "panel-dr"}}
	saved, ids, err := s.Batch(ctx, p.ID, batch("1", site, del, cable("agg-15:p2", "edge-17:p4")))
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision != "2" || len(ids) != 3 || !strings.HasPrefix(ids[0], "site-") || ids[1] != "" || !strings.HasPrefix(ids[2], "cable-") || ids[0] == ids[2] {
		t.Fatalf("revision %s, ids %v", saved.Revision, ids)
	}
	if saved.Sites[0].ID != ids[0] || saved.Links[0].ID != ids[2] || saved.Labels["panel-dr"] != "PANEL-DR" {
		t.Fatalf("saved plan: %+v", saved)
	}
	// A failing command anywhere persists nothing, and names its position.
	stored := mustPlan(t, s, p.ID)
	other := planning.Command{Type: "add_site", Site: &planning.SiteInput{Name: "Other depot"}}
	_, _, err = s.Batch(ctx, p.ID, batch("2", other, cable("agg-03:p1", "agg-15:p5")))
	if !errors.Is(err, planning.ErrInvalid) || !strings.Contains(err.Error(), "command 2 (add_cable): AGG-03 · Port 1 is already cabled (cable-a04)") {
		t.Fatalf("got %v", err)
	}
	if !reflect.DeepEqual(stored, mustPlan(t, s, p.ID)) {
		t.Fatal("a failed batch changed the stored plan")
	}
	if _, _, err := s.Batch(ctx, p.ID, batch("1", other)); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("a stale revision is a conflict: %v", err)
	}
	if _, _, err := s.Batch(ctx, p.ID, planning.Command{Type: "add_site", ExpectedRevision: "2", Site: site.Site}); !errors.Is(err, planning.ErrInvalid) {
		t.Fatalf("Batch runs batches only: %v", err)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if !reflect.DeepEqual(stored, mustPlan(t, reopened, p.ID)) {
		t.Fatal("the batch did not survive a reconnect")
	}
}
