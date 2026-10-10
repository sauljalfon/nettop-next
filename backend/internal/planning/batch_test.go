package planning_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/scalefixture"
	"nettop.local/backend/internal/topology"
)

func inner(c planning.Command) planning.Command { c.ExpectedRevision = ""; return c }

func batchOf(rev string, commands ...planning.Command) planning.Command {
	return planning.Command{Type: "batch", ExpectedRevision: rev, Batch: &planning.BatchInput{Commands: commands}}
}

func switchAt(name, rack string, unit int) planning.Command {
	return planning.Command{Type: "add_equipment", Equipment: &planning.EquipmentInput{Name: name, Kind: "switch", Role: "access", NetworkID: "net-a", RackID: rack, Unit: unit, Height: 1, PortCount: 4}}
}

func cableOf(a, b string) planning.Command {
	return planning.Command{Type: "add_cable", Cable: &planning.CableInput{A: a, B: b}}
}

func moveOf(equipment, rack string, unit int) planning.Command {
	return planning.Command{Type: "move_equipment", Placement: &planning.PlacementInput{EquipmentID: equipment, RackID: rack, Unit: unit}}
}

func plain(c planning.Command) planning.Command { return inner(c) }

// BK-01: a batch applies in order with one revision bump and returns the IDs it
// allocated; later commands see the effect of earlier ones.
func TestBK01BatchAppliesInOrderWithOneRevisionBump(t *testing.T) {
	base := acceptance.Installed()
	commands := []planning.Command{
		plain(site("Depot")),
		plain(switchAt("SW-ONE", "rack-sm01", 8)),
		plain(target("delete_equipment", "panel-dr")),
		plain(switchAt("SW-TWO", "rack-dr01", 11)), // the unit PANEL-DR frees in this batch
		plain(moveOf("agg-08", "rack-core-03", 1)),
		plain(target("disconnect_cable", "cable-a12")),
		plain(cableOf("bb-01:p1", "agg-15:p3")), // the port the previous command freed
		plain(cableOf("agg-15:p2", "edge-17:p4")),
	}
	ids := []string{"site-d", "eq-1", "", "eq-2", "", "", "cable-1", "cable-2"}
	got, err := planning.ExecuteBatch(base, v2Plan(), batchOf("1", commands...), ids)
	if err != nil {
		t.Fatal(err)
	}
	if got.Revision != "2" {
		t.Fatalf("one revision bump, got %s", got.Revision)
	}
	if len(got.Sites) != 1 || len(got.Equipment) != 2 || len(got.Links) != 2 || got.Removals.Equipment[0] != "panel-dr" || got.Removals.Links[0] != "cable-a12" || got.Placements[0].EquipmentID != "agg-08" {
		t.Fatalf("batch result wrong: %+v", got)
	}
	if got.Labels["panel-dr"] != "PANEL-DR" || got.Labels["agg-08"] != "AGG-08" || got.Labels["bb-01:p1"] != "BB-01 · Port 1" {
		t.Fatalf("labels filled as for single commands: %v", got.Labels)
	}
	proposed, err := planning.Apply(base, got)
	if err != nil {
		t.Fatalf("the result must apply: %v", err)
	}
	// The same commands one by one give the same plan (apart from the revision).
	seq := v2Plan()
	for i, c := range commands {
		c.ExpectedRevision = seq.Revision
		if seq, err = planning.Execute(base, seq, c, ids[i]); err != nil {
			t.Fatalf("command %d: %v", i+1, err)
		}
	}
	seq.Revision = got.Revision
	a, _ := json.Marshal(got)
	b, _ := json.Marshal(seq)
	if string(a) != string(b) {
		t.Fatalf("a batch must equal the same commands one by one:\n%s\n%s", a, b)
	}
	_ = proposed
}

func TestBK01APlanCommandsInABatchSeeEachOtherForClashes(t *testing.T) {
	base := acceptance.Installed()
	_, err := planning.ExecuteBatch(base, v2Plan(), batchOf("1", plain(switchAt("A", "rack-sm01", 8)), plain(switchAt("B", "rack-sm01", 8))), []string{"e1", "e2"})
	want := "invalid plan command: command 2 (add_equipment): U8 in Rack SM01 is taken by A"
	if !errors.Is(err, planning.ErrInvalid) || err.Error() != want {
		t.Fatalf("got %v\nwant %s", err, want)
	}
}

// BK-01: any failing command leaves the draft unchanged and names its index and why, in names.
func TestBK01AFailingCommandLeavesTheDraftUnchangedAndNamesItsIndex(t *testing.T) {
	base := acceptance.Installed()
	start := must(t, v2Plan(), site("Existing"), "site-e")
	before, _ := json.Marshal(start)
	commands := []planning.Command{
		plain(site("New")),
		plain(cableOf("agg-15:p2", "edge-17:p4")),
		plain(cableOf("agg-03:p1", "agg-15:p5")), // AGG-03 port 1 carries cable-a04
		plain(site("Never")),
	}
	got, err := planning.ExecuteBatch(base, start, batchOf(start.Revision, commands...), []string{"s", "c1", "c2", "s2"})
	want := "invalid plan command: command 3 (add_cable): AGG-03 · Port 1 is already cabled (cable-a04)"
	if !errors.Is(err, planning.ErrInvalid) || err.Error() != want {
		t.Fatalf("got %v\nwant %s", err, want)
	}
	if !reflect.DeepEqual(got, planning.Plan{}) {
		t.Fatal("a failed batch returns no plan")
	}
	if after, _ := json.Marshal(start); string(after) != string(before) {
		t.Fatalf("the draft changed:\n%s\n%s", before, after)
	}
}

func TestBK01BatchSizeAndKindsAreChecked(t *testing.T) {
	base := acceptance.Installed()
	many := func(n int) []planning.Command {
		out := make([]planning.Command, n)
		ids := make([]string, n)
		for i := range out {
			out[i] = plain(site(fmt.Sprintf("Site %d", i)))
			ids[i] = fmt.Sprintf("s%d", i)
		}
		return out
	}
	idsFor := func(n int) []string {
		ids := make([]string, n)
		for i := range ids {
			ids[i] = fmt.Sprintf("s%d", i)
		}
		return ids
	}
	for name, c := range map[string]struct {
		cmd  planning.Command
		ids  []string
		want string
	}{
		"empty":                {batchOf("1"), nil, "1–500"},
		"501 commands":         {batchOf("1", many(501)...), idsFor(501), "1–500"},
		"nested batch":         {batchOf("1", plain(batchOf("", plain(site("X"))))), []string{""}, "command 1 (batch)"},
		"remove_change inside": {batchOf("1", plain(removeChangeCommand("", "add_site:x"))), []string{""}, "command 1 (remove_change)"},
		"unknown type":         {batchOf("1", plain(planning.Command{Type: "flip"})), []string{""}, "command 1 (flip)"},
		"own expectedRevision": {batchOf("1", planning.Command{Type: "add_site", ExpectedRevision: "1", Site: &planning.SiteInput{Name: "X"}}), []string{"s"}, "no expectedRevision"},
		"no payload":           {planning.Command{Type: "batch", ExpectedRevision: "1"}, nil, "batch"},
		"two payloads": {func() planning.Command {
			c := batchOf("1", plain(site("X")))
			c.Site = &planning.SiteInput{Name: "Y"}
			return c
		}(), []string{"s"}, "only"},
	} {
		t.Run(name, func(t *testing.T) {
			got, err := planning.ExecuteBatch(base, v2Plan(), c.cmd, c.ids)
			if !errors.Is(err, planning.ErrInvalid) || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want ErrInvalid containing %q, got %v", c.want, err)
			}
			if !reflect.DeepEqual(got, planning.Plan{}) {
				t.Fatal("no plan on failure")
			}
		})
	}
	t.Run("500 commands are allowed", func(t *testing.T) {
		got, err := planning.ExecuteBatch(base, v2Plan(), batchOf("1", many(500)...), idsFor(500))
		if err != nil || len(got.Sites) != 500 || got.Revision != "2" {
			t.Fatalf("%v", err)
		}
	})
}

func TestBK01AStaleOrRecordedDraftIsAConflictLikeOtherCommands(t *testing.T) {
	base := acceptance.Installed()
	stale := v2Plan()
	stale.BaseRevision = "an-older-revision"
	recorded := v2Plan()
	recorded.Status = "recorded"
	for name, c := range map[string]struct {
		plan planning.Plan
		cmd  planning.Command
	}{
		"stale base":     {stale, batchOf("1", plain(site("X")))},
		"recorded":       {recorded, batchOf("1", plain(site("X")))},
		"wrong revision": {v2Plan(), batchOf("9", plain(site("X")))},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := planning.ExecuteBatch(base, c.plan, c.cmd, []string{"s"}); !errors.Is(err, planning.ErrConflict) {
				t.Fatalf("want ErrConflict, got %v", err)
			}
		})
	}
	if _, err := planning.ExecuteBatch(base, v2Plan(), batchOf("", plain(site("X"))), []string{"s"}); !errors.Is(err, planning.ErrInvalid) {
		t.Fatal("expectedRevision is required")
	}
}

// A command cannot refer to an object created earlier in the same batch.
func TestBK01ACommandCannotReferToAnObjectTheBatchCreates(t *testing.T) {
	base := acceptance.Installed()
	node := plain(planning.Command{Type: "add_node", Node: &planning.NodeInput{SiteID: "site-made", Name: "Hall"}})
	_, err := planning.ExecuteBatch(base, v2Plan(), batchOf("1", plain(site("Made")), node), []string{"site-made", "node-1"})
	if !errors.Is(err, planning.ErrInvalid) || !strings.Contains(err.Error(), "command 2 (add_node): site-made is created earlier in this batch; a batch cannot refer to objects it creates") {
		t.Fatalf("got %v", err)
	}
	// Its endpoints count as created too.
	_, err = planning.ExecuteBatch(base, v2Plan(), batchOf("1", plain(switchAt("SW", "rack-sm01", 8)), plain(cableOf("eq-new:p1", "agg-15:p2"))), []string{"eq-new", "c"})
	if err == nil || !strings.Contains(err.Error(), "created earlier in this batch") {
		t.Fatalf("got %v", err)
	}
}

func TestIDPrefixSaysWhichCommandsCreateSomething(t *testing.T) {
	for kind, want := range map[string]string{"add_cable": "cable-", "add_site": "site-", "add_node": "node-", "add_rack": "rack-", "add_equipment": "equipment-", "add_hdf": "equipment-", "move_equipment": "", "delete_rack": "", "disconnect_cable": ""} {
		if got := planning.IDPrefix(kind); got != want {
			t.Errorf("%s: %q, want %q", kind, got, want)
		}
	}
}

// BK-01 (budget): 500 cables between free endpoints of the campus fixture in under
// 2 s (6× under -race): each command is checked against a working snapshot that is
// updated incrementally, and Apply and Validate run once at the end.
func TestBK01CampusBatchOf500CablesIsFast(t *testing.T) {
	base := scalefixture.Campus()
	cabled := map[string]bool{}
	for _, l := range base.Links {
		if l.Kind == "cable" {
			cabled[l.A], cabled[l.B] = true, true
		}
	}
	var free []topology.Endpoint
	for _, p := range base.Endpoints {
		if p.Side == "" && !cabled[p.ID] { // switch ports
			free = append(free, p)
		}
	}
	if len(free) < 1000 {
		t.Fatalf("fixture has %d free ports", len(free))
	}
	var commands []planning.Command
	var ids []string
	used := map[string]bool{}
	for i := 0; len(commands) < 500; i++ {
		a := free[i*2]
		b := free[len(free)-1-i*2]
		if a.EquipmentID == b.EquipmentID || used[a.ID] || used[b.ID] {
			continue
		}
		used[a.ID], used[b.ID] = true, true
		commands = append(commands, plain(cableOf(a.ID, b.ID)))
		ids = append(ids, fmt.Sprintf("cable-batch-%d", len(commands)))
	}
	plan := planning.Plan{ID: "p", BaseRevision: base.Revision, Revision: "1"}
	start := time.Now()
	got, err := planning.ExecuteBatch(base, plan, batchOf("1", commands...), ids)
	elapsed := time.Since(start)
	t.Logf("batch of %d add_cable on Campus(): %s", len(commands), elapsed)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Links) != 500 || got.Revision != "2" {
		t.Fatalf("links %d revision %s", len(got.Links), got.Revision)
	}
	if limit := 2 * time.Second * raceSlowdown; elapsed > limit {
		t.Fatalf("took %s, want under %s", elapsed, limit)
	}
	// And the result is a valid, traceable topology.
	proposed, err := planning.Apply(base, got)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pathfinding.Trace(proposed, pathfinding.Request{Mode: "point_to_point", Start: commands[0].Cable.A, End: commands[0].Cable.B}); err != nil {
		t.Fatal(err)
	}
}

func TestBatchNamesASameEquipmentCable(t *testing.T) {
	start := v2Plan()
	got, err := planning.ExecuteBatch(acceptance.Installed(), start, batchOf(start.Revision,
		plain(cableOf("agg-15:p2", "edge-17:p4")),
		plain(cableOf("agg-15:p5", "agg-15:p6")),
	), []string{"c1", "c2"})
	want := "invalid plan command: command 2 (add_cable): AGG-15 · Port 5 and AGG-15 · Port 6 are on the same equipment"
	if !errors.Is(err, planning.ErrInvalid) || err.Error() != want {
		t.Fatalf("got %v (%v)\nwant %s", err, got.Revision, want)
	}
}
