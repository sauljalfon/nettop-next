package planning_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

// Commands answer in names, never in raw IDs: the user reads these in a form.
func TestCommandErrorsAreWrittenInNames(t *testing.T) {
	hdf := func(unit, height int) planning.Command {
		c := cmd("add_hdf", "1")
		c.HDF = &planning.HDFInput{Name: "HDF-NEW", RackID: "rack-sm01", Unit: unit, Height: height, Rows: 2}
		return c
	}
	sw := func(unit int) planning.Command {
		c := cmd("add_equipment", "1")
		c.Equipment = &planning.EquipmentInput{Name: "SW-NEW", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-sm01", Unit: unit, Height: 1, PortCount: 4}
		return c
	}
	move := func(equipment, rack string, unit int) planning.Command {
		c := cmd("move_equipment", "1")
		c.Placement = &planning.PlacementInput{EquipmentID: equipment, RackID: rack, Unit: unit}
		return c
	}
	cable := func(a, b string) planning.Command {
		c := cmd("add_cable", "1")
		c.Cable = &planning.CableInput{A: a, B: b}
		return c
	}
	for name, c := range map[string]struct {
		command planning.Command
		want    string
	}{
		"hdf onto the same units":               {hdf(4, 3), "invalid plan command: U4–6 in Rack SM01 is taken by HDF-01"},
		"hdf overlapping two units":             {hdf(6, 3), "invalid plan command: U6 in Rack SM01 is taken by HDF-01"},
		"hdf that does not fit":                 {hdf(11, 3), "invalid plan command: Rack SM01 has units 1–12; 3 units from U11 do not fit"},
		"one unit past the top":                 {sw(13), "invalid plan command: Rack SM01 has units 1–12; 1 unit from U13 does not fit"},
		"switch on a taken unit":                {sw(5), "invalid plan command: U5 in Rack SM01 is taken by HDF-01"},
		"move onto a taken unit":                {move("edge-17", "rack-sm01", 5), "invalid plan command: U5 in Rack SM01 is taken by HDF-01"},
		"move past the top":                     {move("agg-03", "rack-sm01", 13), "invalid plan command: Rack SM01 has units 1–12; 1 unit from U13 does not fit"},
		"cable on a cabled port":                {cable("agg-03:p1", "agg-15:p2"), "invalid plan command: AGG-03 · Port 1 is already cabled (cable-a04)"},
		"cable on a cabled HDF side":            {cable("agg-15:p2", "hdf-02:sp-2B:3:r"), "invalid plan command: HDF-02 · 2B/3 rear is already cabled (cable-a04)"},
		"cable to itself":                       {cable("agg-15:p2", "agg-15:p2"), "invalid plan command: AGG-15 · Port 2 cannot be cabled to itself"},
		"cable between two ports of one switch": {cable("agg-15:p2", "agg-15:p3"), "invalid plan command: AGG-15 · Port 2 and AGG-15 · Port 3 are on the same equipment"},
		"cable to an unknown endpoint":          {cable("agg-15:p2", "nope"), "invalid plan command: endpoint nope does not exist"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := run(t, v2Plan(), c.command, "new-id")
			if !errors.Is(err, planning.ErrInvalid) || err.Error() != c.want {
				t.Fatalf("got %v\nwant %s", err, c.want)
			}
		})
	}
	t.Run("a unit freed by a move can be used, and a disconnected port can be cabled again", func(t *testing.T) {
		p := must(t, v2Plan(), move("hdf-01", "rack-sm01", 8), "x")
		sw5 := sw(5)
		sw5.ExpectedRevision = p.Revision
		must(t, p, sw5, "sw")
		q := must(t, v2Plan(), target("disconnect_cable", "cable-a04"), "x")
		c := cable("agg-03:p1", "agg-15:p2")
		c.ExpectedRevision = q.Revision
		must(t, q, c, "cable-x")
	})
	t.Run("moving equipment within its own rack ignores itself", func(t *testing.T) {
		must(t, v2Plan(), move("hdf-01", "rack-sm01", 5), "x")
	})
}

// Check and Apply say the same in names: a draft that stopped fitting after
// Installed changed is read by the user in the Changes drawer.
func TestCheckConflictReasonsAreWrittenInNames(t *testing.T) {
	base := acceptance.Installed()
	plan := v2Plan()
	plan.BaseRevision = "an-older-revision"
	plan.Placements = []planning.PlacementInput{{EquipmentID: "agg-15", RackID: "rack-sm01", Unit: 5}}
	plan.Equipment = nil
	plan.Links = []topology.Link{{ID: "cable-new", A: "agg-03:p1", B: "agg-15:p2", Kind: "cable"}}
	got := map[string]string{}
	for _, c := range planning.Check(base, plan) {
		got[c.Change] = c.Reason
	}
	want := map[string]string{
		"place_equipment:agg-15": "U5 in Rack SM01 is taken by HDF-01",
		"add_cable:cable-new":    "AGG-03 · Port 1 is already cabled (cable-a04)",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v\nwant %v", got, want)
	}
	if _, err := planning.Apply(base, func() planning.Plan { p := plan; p.BaseRevision = "acceptance-1"; return p }()); err == nil || strings.Contains(err.Error(), "agg-15") {
		t.Fatalf("Apply must also answer in names, got %v", err)
	}
}
