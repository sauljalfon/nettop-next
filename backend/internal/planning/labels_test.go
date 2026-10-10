package planning_test

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func labelsAfter(t *testing.T, p planning.Plan, c planning.Command) planning.Plan {
	t.Helper()
	c.ExpectedRevision = p.Revision
	return must(t, p, c, "new-id")
}

// Labels name every object a command adds, removes, moves or cables, so a recorded
// plan, or a draft whose objects were deleted by someone else, still reads in names.
func TestExecuteFillsLabelsForEveryObjectACommandTouches(t *testing.T) {
	cases := map[string]struct {
		command planning.Command
		want    map[string]string
	}{
		"add_cable names both ends": {
			func() planning.Command {
				c := cmd("add_cable", "1")
				c.Cable = &planning.CableInput{A: "agg-15:p2", B: "edge-17:p4"}
				return c
			}(),
			map[string]string{"agg-15:p2": "AGG-15 · Port 2", "edge-17:p4": "EDGE-17 · Port 4"},
		},
		"disconnect_cable names the cable and both ends": {
			target("disconnect_cable", "cable-a12"),
			map[string]string{
				"cable-a12": "HDF-02 · 3A/1 rear ↔ BB-01 · Port 1",
				"bb-01:p1":  "BB-01 · Port 1",
			},
		},
		"delete_equipment names it and its rack": {
			target("delete_equipment", "panel-a"),
			map[string]string{"panel-a": "PANEL-A", "rack-a03": "Rack A03"},
		},
		"move_equipment names it and both racks": {
			func() planning.Command {
				c := cmd("move_equipment", "1")
				c.Placement = &planning.PlacementInput{EquipmentID: "agg-15", RackID: "rack-core-03", Unit: 3}
				return c
			}(),
			map[string]string{"agg-15": "AGG-15", "rack-core-02": "Rack Core 02", "rack-core-03": "Rack Core 03"},
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			got := labelsAfter(t, v2Plan(), c.command).Labels
			for id, want := range c.want {
				if got[id] != want {
					t.Errorf("label[%s] = %q, want %q (all: %v)", id, got[id], want, got)
				}
			}
		})
	}
	t.Run("containers and their parents", func(t *testing.T) {
		base := acceptance.Installed()
		step := func(p planning.Plan, c planning.Command, id string) planning.Plan {
			c.ExpectedRevision = p.Revision
			next, err := planning.Execute(base, p, c, id)
			if err != nil {
				t.Fatal(err)
			}
			return next
		}
		p := step(v2Plan(), site("Depot"), "site-d")
		p = step(p, node("site-d", "Hall"), "node-h")
		p = step(p, rack("node-h", "R1", 12), "rack-r")
		want := map[string]string{"site-d": "Depot", "node-h": "Hall", "rack-r": "R1"}
		for id, name := range want {
			if p.Labels[id] != name {
				t.Errorf("label[%s] = %q, want %q (all: %v)", id, p.Labels[id], name, p.Labels)
			}
		}
	})
}

func TestRemoveChangeDropsLabelsNoChangeUsesAnymore(t *testing.T) {
	base := acceptance.Installed()
	p := labelsAfter(t, v2Plan(), target("delete_equipment", "panel-a"))
	p = labelsAfter(t, p, target("delete_equipment", "edge-22"))
	if p.Labels["panel-a"] == "" || p.Labels["edge-22"] == "" {
		t.Fatalf("labels: %v", p.Labels)
	}
	next, _, err := planning.ExecuteRemoveChange(base, p, removeChangeCommand(p.Revision, "remove_equipment:panel-a"))
	if err != nil {
		t.Fatal(err)
	}
	if _, kept := next.Labels["panel-a"]; kept {
		t.Fatalf("the label of an undone removal stays: %v", next.Labels)
	}
	if next.Labels["edge-22"] != "EDGE-22" {
		t.Fatalf("the other change keeps its label: %v", next.Labels)
	}
}

func TestPlansWithoutLabelsStillLoadAndGetThemFromTheNextCommand(t *testing.T) {
	var old planning.Plan
	if err := json.Unmarshal([]byte(`{"id":"p","baseRevision":"acceptance-1","revision":"1","equipment":[],"updates":[],"subpanels":[],"endpoints":[],"links":[]}`), &old); err != nil {
		t.Fatal(err)
	}
	if len(old.Labels) != 0 {
		t.Fatal("an old plan has no labels")
	}
	next := labelsAfter(t, old, target("delete_equipment", "panel-a"))
	if next.Labels["panel-a"] != "PANEL-A" {
		t.Fatalf("labels: %v", next.Labels)
	}
}

// A stale draft whose objects another plan removed is judged in names.
func TestCheckSaysNoLongerExistsInNames(t *testing.T) {
	base := acceptance.Installed()
	base.Equipment = base.Equipment[:0:0]
	plan := v2Plan()
	plan.BaseRevision = "an-older-revision"
	plan.Labels = map[string]string{
		"panel-a:10:f": "PANEL-A · 10 · Front",
		"panel-a":      "PANEL-A",
		"rack-gone":    "Rack DR03",
	}
	plan.Placements = []planning.PlacementInput{{EquipmentID: "panel-a", RackID: "rack-a03", Unit: 3}}
	plan.Links = []topology.Link{{ID: "cable-x", A: "agg-15:p2", B: "panel-a:10:f", Kind: "cable"}}
	plan.Removals = planning.Removals{Equipment: []string{"panel-a"}}
	// The base keeps AGG-15's port so only PANEL-A's end is missing.
	full := acceptance.Installed()
	var keep []topology.Equipment
	for _, e := range full.Equipment {
		if e.ID != "panel-a" {
			keep = append(keep, e)
		}
	}
	base = full
	base.Equipment = keep
	var eps []topology.Endpoint
	for _, e := range full.Endpoints {
		if e.EquipmentID != "panel-a" {
			eps = append(eps, e)
		}
	}
	base.Endpoints = eps
	var links []topology.Link
	for _, l := range full.Links {
		if !strings.HasPrefix(l.A, "panel-a") && !strings.HasPrefix(l.B, "panel-a") {
			links = append(links, l)
		}
	}
	base.Links = links
	got := map[string]string{}
	for _, c := range planning.Check(base, plan) {
		got[c.Change] = c.Reason
	}
	want := map[string]string{
		"place_equipment:panel-a":  "PANEL-A no longer exists",
		"remove_equipment:panel-a": "PANEL-A no longer exists",
		"add_cable:cable-x":        "PANEL-A · 10 · Front no longer exists",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v\nwant %v", got, want)
	}
	// Without labels the old wording stays, so nothing is hidden.
	plan.Labels = nil
	for _, c := range planning.Check(base, plan) {
		if c.Change == "add_cable:cable-x" && c.Reason != "endpoint panel-a:10:f does not exist" {
			t.Fatalf("unlabelled: %q", c.Reason)
		}
	}
	_ = errors.New
}
