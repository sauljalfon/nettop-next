package persistence

import (
	"context"
	"errors"
	"strings"
	"testing"

	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/topology"
)

func TestFixManyWritesEveryFixAndItsLogRowsWithTheNote(t *testing.T) {
	s, _ := seeded(t, expansionDraft())
	ctx := context.Background()
	revision := installedRevision(t, s)

	entries, err := s.FixMany(ctx, []fixes.Fix{
		{Kind: fixes.Equipment, ID: "agg-03", Details: topology.Details{Manufacturer: ptr("Cisco"), Model: ptr("C9500")}},
		{Kind: fixes.Equipment, ID: "agg-08", Details: topology.Details{Manufacturer: ptr("Cisco")}},
		{Kind: fixes.Equipment, ID: "agg-03", Details: topology.Details{Model: ptr("C9600")}},
	}, "  audit 2026  ")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 4 {
		t.Fatalf("entries = %+v", entries)
	}
	for _, e := range entries {
		if e.Note != "audit 2026" || e.ID == 0 || e.At.IsZero() || e.EntityKind != fixes.Equipment {
			t.Fatalf("entry = %+v", e)
		}
	}
	if entries[0].EntityID != "agg-03" || entries[0].Field != "manufacturer" || entries[1].Field != "model" ||
		entries[2].EntityID != "agg-08" || entries[3].EntityID != "agg-03" || entries[3].OldValue != "C9500" || entries[3].NewValue != "C9600" {
		t.Fatalf("entries are not in the order of the fixes: %+v", entries)
	}
	if e := installedEquipment(t, s, "agg-03"); e.Manufacturer != "Cisco" || e.Model != "C9600" {
		t.Fatalf("agg-03 = %+v", e)
	}
	if e := installedEquipment(t, s, "agg-08"); e.Manufacturer != "Cisco" {
		t.Fatalf("agg-08 = %+v", e)
	}
	log, err := s.ChangeLog(ctx, fixes.Equipment, "agg-03")
	if err != nil || len(log) != 3 {
		t.Fatalf("log = %+v, err = %v", log, err)
	}
	if got := installedRevision(t, s); got != revision {
		t.Fatalf("revision changed: %s -> %s", revision, got)
	}
	stale, conflicts, err := s.CheckPlan(ctx, "expansion")
	if err != nil || stale || len(conflicts) != 0 {
		t.Fatalf("the draft must stay current: stale=%v conflicts=%v err=%v", stale, conflicts, err)
	}
}

func TestFixManyWithOneBadFixWritesNothing(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	revision := installedRevision(t, s)
	_, err := s.FixMany(ctx, []fixes.Fix{
		{Kind: fixes.Equipment, ID: "agg-03", Details: topology.Details{Manufacturer: ptr("Cisco")}},
		{Kind: fixes.Equipment, ID: "agg-08", Details: topology.Details{Manufacturer: ptr("Cisco")}},
		{Kind: fixes.Equipment, ID: "agg-15", Details: topology.Details{Status: ptr("broken")}},
	}, "x")
	if !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "fix 3 (AGG-15)") {
		t.Fatalf("err = %v", err)
	}
	var rows int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM change_log`).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("rows = %d, err = %v", rows, err)
	}
	if got := installedEquipment(t, s, "agg-03").Manufacturer; got == "Cisco" {
		t.Fatal("an earlier fix was written")
	}
	if got := installedRevision(t, s); got != revision {
		t.Fatalf("revision changed")
	}
	if _, err = s.FixMany(ctx, []fixes.Fix{{Kind: fixes.Equipment, ID: "gone"}}, ""); !errors.Is(err, fixes.ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
	if _, err = s.FixMany(ctx, []fixes.Fix{{Kind: fixes.Equipment, ID: "agg-03", Name: ptr("X")}}, ""); !errors.Is(err, topology.ErrInvalidInput) {
		t.Fatalf("a name must be refused: %v", err)
	}
}

func TestFixManyThatChangesNothingWritesNoRow(t *testing.T) {
	s, _ := seeded(t)
	ctx := context.Background()
	entries, err := s.FixMany(ctx, []fixes.Fix{
		{Kind: fixes.Equipment, ID: "agg-03", Details: topology.Details{Description: ptr("")}},
	}, "nothing")
	if err != nil || entries == nil || len(entries) != 0 {
		t.Fatalf("entries = %v, err = %v", entries, err)
	}
	// One that changes and one that does not: only the first writes.
	entries, err = s.FixMany(ctx, []fixes.Fix{
		{Kind: fixes.Equipment, ID: "agg-03", Details: topology.Details{Description: ptr("")}},
		{Kind: fixes.Equipment, ID: "agg-08", Details: topology.Details{Model: ptr("M")}},
	}, "")
	if err != nil || len(entries) != 1 || entries[0].EntityID != "agg-08" || entries[0].Note != "" {
		t.Fatalf("entries = %+v, err = %v", entries, err)
	}
	var rows int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM change_log`).Scan(&rows); err != nil || rows != 1 {
		t.Fatalf("rows = %d, err = %v", rows, err)
	}
}

func TestFixManyThenRecordKeepsTheFixes(t *testing.T) {
	s, _ := seeded(t, expansionDraft())
	ctx := context.Background()
	if _, err := s.FixMany(ctx, []fixes.Fix{
		{Kind: fixes.Equipment, ID: "agg-15", Details: topology.Details{Model: ptr("M1")}},
		{Kind: fixes.Equipment, ID: "agg-08", Details: topology.Details{Model: ptr("M2")}},
	}, "before recording"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Record(ctx, "expansion", "1", "EDGE-18 installed", "Tester"); err != nil {
		t.Fatalf("record after fixes: %v", err)
	}
	if got := installedEquipment(t, s, "agg-15").Model; got != "M1" {
		t.Fatalf("agg-15 model = %q", got)
	}
	if got := installedEquipment(t, s, "agg-08").Model; got != "M2" {
		t.Fatalf("agg-08 model = %q", got)
	}
}
