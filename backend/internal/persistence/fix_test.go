package persistence

import (
	"context"
	"errors"
	"testing"

	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/topology"
)

// ptr is already defined in details_test.go (same package); do not redefine it.

func installedEquipment(t *testing.T, s *Store, id string) topology.Equipment {
	t.Helper()
	snap, err := s.Installed(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range snap.Equipment {
		if e.ID == id {
			return e
		}
	}
	t.Fatalf("no installed %s", id)
	return topology.Equipment{}
}

// FX-01: renaming installed AGG-03 writes one change-log row and leaves the
// topology revision and drafts valid.
func TestFX01RenameWritesOneLogRowAndKeepsRevisionAndDrafts(t *testing.T) {
	s, _ := seeded(t, expansionDraft())
	ctx := context.Background()
	revision := installedRevision(t, s)

	entries, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Name: ptr("AGG-03A"), Note: " relabelled on site "})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Field != "name" || entries[0].OldValue != "AGG-03" || entries[0].NewValue != "AGG-03A" ||
		entries[0].Note != "relabelled on site" || entries[0].ID == 0 || entries[0].At.IsZero() {
		t.Fatalf("entries = %+v", entries)
	}
	if got := installedEquipment(t, s, "agg-03").Name; got != "AGG-03A" {
		t.Fatalf("installed name = %q", got)
	}
	if got := installedRevision(t, s); got != revision {
		t.Fatalf("revision changed: %s -> %s", revision, got)
	}
	stale, conflicts, err := s.CheckPlan(ctx, "expansion")
	if err != nil || stale || len(conflicts) != 0 {
		t.Fatalf("the draft must stay current: stale=%v conflicts=%v err=%v", stale, conflicts, err)
	}
	if _, err = s.Snapshot(ctx, "expansion"); err != nil {
		t.Fatalf("the draft's proposed topology must still build: %v", err)
	}
	// The same fix again changes nothing and writes no row.
	again, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Name: ptr("AGG-03A")})
	if err != nil || again == nil || len(again) != 0 {
		t.Fatalf("again = %v, err = %v", again, err)
	}
	log, err := s.ChangeLog(ctx, fixes.Equipment, "agg-03")
	if err != nil || len(log) != 1 {
		t.Fatalf("log = %+v, err = %v", log, err)
	}
}

// FX-03 at the store: history lists every change, newest first, and only the asked object's.
func TestFX03ChangeLogListsNewestFirst(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Details: topology.Details{Manufacturer: ptr("Cisco")}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Details: topology.Details{Model: ptr("C9500")}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-08", Name: ptr("AGG-08B")}); err != nil {
		t.Fatal(err)
	}
	log, err := s.ChangeLog(ctx, fixes.Equipment, "agg-03")
	if err != nil {
		t.Fatal(err)
	}
	if len(log) != 2 || log[0].Field != "model" || log[1].Field != "manufacturer" {
		t.Fatalf("log = %+v", log)
	}
	none, err := s.ChangeLog(ctx, fixes.Rack, "rack-a03")
	if err != nil || none == nil || len(none) != 0 {
		t.Fatalf("none = %v, err = %v", none, err)
	}
}

func TestClearingADetailWritesNullAndLogsIt(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Link, ID: "cable-a01", Details: topology.Details{Label: ptr("A01")}}); err != nil {
		t.Fatal(err)
	}
	entries, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Link, ID: "cable-a01", Details: topology.Details{Label: ptr("")}})
	if err != nil || len(entries) != 1 || entries[0].OldValue != "A01" || entries[0].NewValue != "" {
		t.Fatalf("entries = %+v, err = %v", entries, err)
	}
	var isNull bool
	if err = s.pool.QueryRow(ctx, `SELECT label IS NULL FROM links WHERE id='cable-a01'`).Scan(&isNull); err != nil || !isNull {
		t.Fatalf("label must be NULL: %v %v", isNull, err)
	}
}

func TestARefusedFixWritesNothing(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-03", Name: ptr("AGG-08")}); !errors.Is(err, topology.ErrDuplicateName) {
		t.Fatalf("err = %v", err)
	}
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "gone", Name: ptr("X")}); !errors.Is(err, fixes.ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
	var rows int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM change_log`).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("rows = %d, err = %v", rows, err)
	}
	if got := installedEquipment(t, s, "agg-03").Name; got != "AGG-03" {
		t.Fatalf("name = %q", got)
	}
}

// Review focus 2: a fix and then Record of a draft made before it.
func TestFixThenRecordKeepsTheFix(t *testing.T) {
	s, _ := seeded(t, expansionDraft())
	ctx := context.Background()
	if _, err := s.Fix(ctx, fixes.Fix{Kind: fixes.Equipment, ID: "agg-15", Name: ptr("AGG-15X")}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Record(ctx, "expansion", "1", "EDGE-18 installed", "Tester"); err != nil {
		t.Fatalf("record after a fix: %v", err)
	}
	if got := installedEquipment(t, s, "agg-15").Name; got != "AGG-15X" {
		t.Fatalf("the fix was lost by Record: %q", got)
	}
}
