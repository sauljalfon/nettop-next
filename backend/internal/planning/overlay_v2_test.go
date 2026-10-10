package planning_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/scalefixture"
	"nettop.local/backend/internal/topology"
)

func v2Plan() planning.Plan {
	return planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1"}
}

// removeAll applies Remove calls in order; every one must be accepted.
func removeAll(t *testing.T, base topology.Snapshot, plan planning.Plan, steps ...[2]string) planning.Plan {
	t.Helper()
	for _, st := range steps {
		var err error
		if plan, err = plan.Remove(base, planning.RemovalKind(st[0]), st[1]); err != nil {
			t.Fatalf("Remove %s %s: %v", st[0], st[1], err)
		}
	}
	return plan
}

func hasEquipment(s topology.Snapshot, id string) bool {
	return slices.ContainsFunc(s.Equipment, func(e topology.Equipment) bool { return e.ID == id })
}

func hasLink(s topology.Snapshot, id string) bool {
	return slices.ContainsFunc(s.Links, func(l topology.Link) bool { return l.ID == id })
}

func equipmentByID(t *testing.T, s topology.Snapshot, id string) topology.Equipment {
	t.Helper()
	i := slices.IndexFunc(s.Equipment, func(e topology.Equipment) bool { return e.ID == id })
	if i < 0 {
		t.Fatalf("equipment %s missing", id)
	}
	return s.Equipment[i]
}

// ED-01: deleting PANEL-A in a plan cascades to its endpoints, bridges and the
// six cables on them; EDGE-17 loses its routes in the plan only.
func TestED01DeletingPanelACascadesInThePlanOnly(t *testing.T) {
	base := acceptance.Installed()
	pristine := acceptance.Installed()
	plan := removeAll(t, base, v2Plan(), [2]string{"equipment", "panel-a"})
	got, err := planning.Apply(base, plan)
	if err != nil {
		t.Fatal(err)
	}
	if hasEquipment(got, "panel-a") {
		t.Fatal("PANEL-A still present")
	}
	if n := len(base.Endpoints) - len(got.Endpoints); n != 48 {
		t.Fatalf("removed %d endpoints, want 48", n)
	}
	for _, e := range got.Endpoints {
		if e.EquipmentID == "panel-a" {
			t.Fatalf("endpoint %s of PANEL-A survived", e.ID)
		}
	}
	bridges := 0
	for _, l := range base.Links {
		if !hasLink(got, l.ID) && l.Kind == "internal" {
			bridges++
		}
	}
	if bridges != 24 {
		t.Fatalf("removed %d bridges, want 24", bridges)
	}
	for _, id := range []string{"cable-a01", "cable-a02", "cable-a05", "cable-a06", "cable-a09", "cable-a10"} {
		if hasLink(got, id) {
			t.Fatalf("%s survived", id)
		}
	}
	if n := len(base.Links) - len(got.Links); n != 30 {
		t.Fatalf("removed %d links, want 24 bridges + 6 cables", n)
	}
	for _, l := range got.Links { // no dangling endpoints
		ids := map[string]bool{}
		for _, e := range got.Endpoints {
			ids[e.ID] = true
		}
		if !ids[l.A] || !ids[l.B] {
			t.Fatalf("link %s dangles", l.ID)
		}
	}
	trace := func(s topology.Snapshot) pathfinding.Result {
		r, err := pathfinding.Trace(s, pathfinding.Request{Mode: "distribution", Device: "edge-17"})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	if r := trace(base); r.Status != "reached" || len(r.Routes) == 0 {
		t.Fatalf("installed EDGE-17 should have routes: %+v", r)
	}
	if r := trace(got); len(r.Routes) != 0 || r.Status == "reached" {
		t.Fatalf("EDGE-17 must be unreachable in the plan: %+v", r)
	}
	if !reflect.DeepEqual(base, pristine) {
		t.Fatal("Apply mutated the installed snapshot")
	}
}

// ED-02: removing something the plan itself added deletes the addition and
// records no removal.
func TestED02RemovingAPlansOwnAdditionDropsIt(t *testing.T) {
	base := acceptance.Installed()
	p, err := planning.Execute(base, v2Plan(), planning.Command{Type: "add_equipment", ExpectedRevision: "1", Equipment: &planning.EquipmentInput{Name: "NEW-SW", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-core-03", Unit: 2, Height: 1, PortCount: 4}}, "eq-new")
	if err != nil {
		t.Fatal(err)
	}
	p, err = planning.Execute(base, p, planning.Command{Type: "add_cable", ExpectedRevision: "2", Cable: &planning.CableInput{A: "eq-new:p1", B: "agg-15:p1"}}, "cable-new")
	if err != nil {
		t.Fatal(err)
	}
	p, err = planning.Execute(base, p, planning.Command{Type: "add_cable", ExpectedRevision: "3", Cable: &planning.CableInput{A: "edge-17:p4", B: "agg-15:p2"}}, "cable-keep")
	if err != nil {
		t.Fatal(err)
	}
	t.Run("cable", func(t *testing.T) {
		got, err := p.Remove(base, planning.RemoveLink, "cable-keep")
		if err != nil {
			t.Fatal(err)
		}
		if slices.ContainsFunc(got.Links, func(l topology.Link) bool { return l.ID == "cable-keep" }) || !reflect.DeepEqual(got.Removals, planning.Removals{}) {
			t.Fatalf("cable addition not dropped cleanly: %+v", got)
		}
		if !slices.ContainsFunc(p.Links, func(l topology.Link) bool { return l.ID == "cable-keep" }) {
			t.Fatal("Remove mutated its input plan")
		}
	})
	t.Run("equipment with its endpoints and cables", func(t *testing.T) {
		got, err := p.Remove(base, planning.RemoveEquipment, "eq-new")
		if err != nil {
			t.Fatal(err)
		}
		if len(got.Equipment) != 0 || len(got.Endpoints) != 0 || !reflect.DeepEqual(got.Removals, planning.Removals{}) {
			t.Fatalf("equipment addition not dropped: %+v", got)
		}
		if len(got.Links) != 1 || got.Links[0].ID != "cable-keep" {
			t.Fatalf("only the cable that touched the dropped equipment goes: %+v", got.Links)
		}
		if _, err := planning.Apply(base, got); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("installed objects record a removal", func(t *testing.T) {
		got := removeAll(t, base, p, [2]string{"link", "cable-a04"})
		if _, err := got.Remove(base, planning.RemoveLink, "cable-a04"); !errors.Is(err, planning.ErrInvalid) {
			t.Fatalf("a cable already removed in the plan is unknown to it: %v", err)
		}
		if !reflect.DeepEqual(got.Removals.Links, []string{"cable-a04"}) {
			t.Fatalf("removal recorded once: %+v", got.Removals)
		}
	})
}

// ED-03: a rack, node or site can be removed only when it is empty after the plan.
func TestED03NonEmptyContainersAreRefused(t *testing.T) {
	base := acceptance.Installed()
	removal := func(r planning.Removals) planning.Plan { p := v2Plan(); p.Removals = r; return p }
	for name, plan := range map[string]planning.Plan{
		"rack with equipment": removal(planning.Removals{Racks: []string{"rack-a03"}}),
		"node with racks":     removal(planning.Removals{Nodes: []string{"node-building-a"}}),
		"site with nodes":     removal(planning.Removals{Sites: []string{"site-dr"}}),
		"rack that gains kit": func() planning.Plan {
			p := addEquipmentTo(removal(planning.Removals{Equipment: []string{"edge-22", "panel-dr"}, Racks: []string{"rack-dr01"}}), "rack-dr01")
			return p
		}(),
		"node left with rack": removal(planning.Removals{Equipment: []string{"edge-22", "panel-dr"}, Nodes: []string{"node-dr-access"}}),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := planning.Apply(base, plan); !errors.Is(err, planning.ErrInvalid) {
				t.Fatalf("want ErrInvalid, got %v", err)
			}
		})
	}
	t.Run("empty after the plan", func(t *testing.T) {
		plan := removeAll(t, base, v2Plan(), [2]string{"equipment", "edge-22"}, [2]string{"equipment", "panel-dr"},
			[2]string{"rack", "rack-dr01"}, [2]string{"node", "node-dr-access"})
		got, err := planning.Apply(base, plan)
		if err != nil {
			t.Fatal(err)
		}
		if slices.ContainsFunc(got.Racks, func(r topology.Rack) bool { return r.ID == "rack-dr01" }) || slices.ContainsFunc(got.Nodes, func(n topology.LocationNode) bool { return n.ID == "node-dr-access" }) {
			t.Fatal("empty containers were not removed")
		}
		if len(base.Racks) != 7 || len(base.Nodes) != 5 {
			t.Fatal("installed containers changed")
		}
	})
	t.Run("emptied by a placement", func(t *testing.T) {
		plan := v2Plan()
		plan.Placements = []planning.PlacementInput{{EquipmentID: "edge-22", RackID: "rack-dr02", Unit: 1}, {EquipmentID: "panel-dr", RackID: "rack-dr02", Unit: 2}}
		plan = removeAll(t, base, plan, [2]string{"rack", "rack-dr01"})
		if _, err := planning.Apply(base, plan); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("container added and removed in the same plan", func(t *testing.T) {
		plan := v2Plan()
		plan.Sites = []topology.Site{{ID: "site-x", Name: "X"}}
		plan.Nodes = []topology.LocationNode{{ID: "node-x", Name: "NX", SiteID: "site-x"}}
		plan.Racks = []topology.Rack{{ID: "rack-x", NodeID: "node-x", Name: "RX", Units: 12}}
		got, err := planning.Apply(base, plan)
		if err != nil || len(got.Racks) != 8 || len(got.Nodes) != 6 || len(got.Sites) != 3 {
			t.Fatalf("container additions not applied: %v", err)
		}
		plan = removeAll(t, base, plan, [2]string{"rack", "rack-x"}, [2]string{"node", "node-x"}, [2]string{"site", "site-x"})
		if len(plan.Sites)+len(plan.Nodes)+len(plan.Racks) != 0 || !reflect.DeepEqual(plan.Removals, planning.Removals{}) {
			t.Fatalf("own container additions must just disappear: %+v", plan)
		}
	})
}

func addEquipmentTo(p planning.Plan, rackID string) planning.Plan {
	p.Equipment = append(p.Equipment, topology.Equipment{ID: "eq-extra", Name: "EXTRA", Kind: "panel", Role: "passive", RackID: rackID, Unit: 1, Height: 1})
	return p
}

// ED-04: a plan saved with the old full-equipment "updates" still loads and
// places the equipment exactly like a placement; new commands write placements.
func TestED04LegacyUpdatesApplyAsPlacements(t *testing.T) {
	base := acceptance.Installed()
	moved := equipmentByID(t, base, "edge-17")
	moved.RackID, moved.Unit = "rack-core-03", 2
	legacyJSON, err := json.Marshal(map[string]any{"id": "p", "baseRevision": "acceptance-1", "revision": "1", "equipment": []any{}, "updates": []topology.Equipment{moved}, "subpanels": []any{}, "endpoints": []any{}, "links": []any{}})
	if err != nil {
		t.Fatal(err)
	}
	var legacy planning.Plan
	if err := json.Unmarshal(legacyJSON, &legacy); err != nil {
		t.Fatal(err)
	}
	modern := v2Plan()
	modern.Placements = []planning.PlacementInput{{EquipmentID: "edge-17", RackID: "rack-core-03", Unit: 2}}
	fromLegacy, err := planning.Apply(base, legacy)
	if err != nil {
		t.Fatal(err)
	}
	fromModern, err := planning.Apply(base, modern)
	if err != nil {
		t.Fatal(err)
	}
	if got := equipmentByID(t, fromLegacy, "edge-17"); got.RackID != "rack-core-03" || got.Unit != 2 {
		t.Fatalf("legacy update not applied: %+v", got)
	}
	if !reflect.DeepEqual(fromLegacy, fromModern) {
		t.Fatal("legacy updates and placements must give the same snapshot")
	}
	next, err := planning.Execute(base, legacy, planning.Command{Type: "move_equipment", ExpectedRevision: "1", Placement: &planning.PlacementInput{EquipmentID: "agg-15", RackID: "rack-core-03", Unit: 3}}, "x")
	if err != nil {
		t.Fatal(err)
	}
	if len(next.Updates) != 0 || len(next.Placements) != 2 {
		t.Fatalf("Execute must write placements and fold legacy updates in: updates=%d placements=%+v", len(next.Updates), next.Placements)
	}
	if p, _ := planning.Apply(base, next); equipmentByID(t, p, "edge-17").Unit != 2 || equipmentByID(t, p, "agg-15").Unit != 3 {
		t.Fatal("folded plan lost a placement")
	}
}

func TestPlanV2FieldsRoundTripThroughJSON(t *testing.T) {
	p := v2Plan()
	p.Sites = []topology.Site{{ID: "s", Name: "S"}}
	p.Nodes = []topology.LocationNode{{ID: "n", Name: "N", SiteID: "s"}}
	p.Racks = []topology.Rack{{ID: "r", NodeID: "n", Name: "R", Units: 12}}
	p.Placements = []planning.PlacementInput{{EquipmentID: "edge-17", RackID: "r", Unit: 1}}
	p.Removals = planning.Removals{Equipment: []string{"a"}, Links: []string{"b"}, Racks: []string{"c"}, Nodes: []string{"d"}, Sites: []string{"e"}}
	body, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"sites"`, `"nodes"`, `"racks"`, `"placements"`, `"removals"`, `"equipmentId"`} {
		if !strings.Contains(string(body), key) {
			t.Fatalf("missing %s in %s", key, body)
		}
	}
	var back planning.Plan
	if err := json.Unmarshal(body, &back); err != nil || !reflect.DeepEqual(back, p) {
		t.Fatalf("round trip changed the plan: %v\n%+v\n%+v", err, back, p)
	}
}

// ED-05: Check reports every failing change, identified as "<kind>:<id>".
func TestED05CheckCollectsEveryConflict(t *testing.T) {
	base := acceptance.Installed()
	plan := v2Plan()
	plan.BaseRevision = "an-older-revision" // Check re-checks against a newer base: the stale revision is not a conflict
	plan.Placements = []planning.PlacementInput{{EquipmentID: "ghost", RackID: "rack-a03", Unit: 1}, {EquipmentID: "agg-15", RackID: "rack-core-03", Unit: 3}}
	plan.Equipment = []topology.Equipment{{ID: "eq-lost", Name: "LOST", Kind: "panel", Role: "passive", RackID: "no-such-rack", Unit: 1, Height: 1}}
	plan.Links = []topology.Link{{ID: "cable-bad", A: "edge-17:p9", B: "no-such-endpoint", Kind: "cable"}}
	plan.Removals = planning.Removals{Equipment: []string{"nope"}, Racks: []string{"rack-a03"}, Links: []string{"cable-zzz"}}
	conflicts := planning.Check(base, plan)
	got := map[string]string{}
	for _, c := range conflicts {
		got[c.Change] = c.Reason
		if c.Reason == "" {
			t.Fatalf("conflict %s has no reason", c.Change)
		}
	}
	for _, want := range []string{"place_equipment:ghost", "add_equipment:eq-lost", "add_cable:cable-bad", "remove_equipment:nope", "remove_rack:rack-a03", "remove_cable:cable-zzz"} {
		if _, ok := got[want]; !ok {
			t.Errorf("missing conflict %s; have %v", want, got)
		}
	}
	if _, ok := got["place_equipment:agg-15"]; ok || len(conflicts) != 6 {
		t.Errorf("the valid placement must not conflict, and nothing else: %v", got)
	}
	if conflicts := planning.Check(base, removeAll(t, base, v2Plan(), [2]string{"equipment", "panel-a"})); len(conflicts) != 0 {
		t.Fatalf("a clean plan has no conflicts: %v", conflicts)
	}
}

// Review fix a: removing installed equipment also drops the plan's own cables
// on its endpoints, its placement, and redundant cable removals.
func TestRemovingInstalledEquipmentDropsPlanCablesAndPlacementOnIt(t *testing.T) {
	base := acceptance.Installed()
	p := v2Plan()
	var err error
	// A free AGG-15 port to a free PANEL-A front position (positions 4+ are uncabled).
	if p, err = planning.Execute(base, p, planning.Command{Type: "add_cable", ExpectedRevision: "1", Cable: &planning.CableInput{A: "agg-15:p1", B: "panel-a:4:f"}}, "cable-plan"); err != nil {
		t.Fatal(err)
	}
	if p, err = planning.Execute(base, p, planning.Command{Type: "move_equipment", ExpectedRevision: "2", Placement: &planning.PlacementInput{EquipmentID: "panel-a", RackID: "rack-a03", Unit: 10}}, "x"); err != nil {
		t.Fatal(err)
	}
	p = removeAll(t, base, p, [2]string{"link", "cable-a01"}) // a removal the equipment removal makes redundant
	p = removeAll(t, base, p, [2]string{"equipment", "panel-a"})
	got, err := planning.Apply(base, p)
	if err != nil {
		t.Fatalf("the plan must stay valid: %v", err)
	}
	if hasLink(got, "cable-plan") || slices.ContainsFunc(p.Links, func(l topology.Link) bool { return l.ID == "cable-plan" }) {
		t.Fatal("the plan's cable on PANEL-A survived")
	}
	if len(p.Placements) != 0 {
		t.Fatalf("placement of the removed equipment survived: %+v", p.Placements)
	}
	if !reflect.DeepEqual(p.Removals, planning.Removals{Equipment: []string{"panel-a"}}) {
		t.Fatalf("only the equipment removal is recorded: %+v", p.Removals)
	}
}

// Review fix c: a non-empty container is refused when the removal is requested,
// with the same reason an installed one gets, whether installed or proposed.
func TestRemoveRefusesNonEmptyContainersWithAClearReason(t *testing.T) {
	base := acceptance.Installed()
	p := v2Plan()
	p.Sites = []topology.Site{{ID: "site-x", Name: "X"}}
	p.Nodes = []topology.LocationNode{{ID: "node-x", Name: "NX", SiteID: "site-x"}}
	p.Racks = []topology.Rack{{ID: "rack-x", NodeID: "node-x", Name: "RX", Units: 12}}
	p.Equipment = []topology.Equipment{{ID: "eq-x", Name: "PX", Kind: "panel", Role: "passive", RackID: "rack-x", Unit: 1, Height: 1}}
	for _, c := range []struct {
		kind planning.RemovalKind
		id   string
		want string
	}{
		{planning.RemoveRack, "rack-x", "rack rack-x still holds equipment"},
		{planning.RemoveNode, "node-x", "node node-x still has racks"},
		{planning.RemoveSite, "site-x", "site site-x still has nodes"},
		{planning.RemoveRack, "rack-a03", "rack rack-a03 still holds equipment"},
		{planning.RemoveEquipment, "no-such", "unknown equipment"},
		{planning.RemoveLink, "edge-17:p1", "unknown cable"},
		{planning.RemoveLink, "panel-a:1:bridge", "bridge"},
	} {
		got, err := p.Remove(base, c.kind, c.id)
		if !errors.Is(err, planning.ErrInvalid) || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s %s: want ErrInvalid containing %q, got %v", c.kind, c.id, c.want, err)
		}
		if !reflect.DeepEqual(got, planning.Plan{}) {
			t.Errorf("%s %s: a refused removal returns no plan", c.kind, c.id)
		}
	}
}

// Review fix b: Check stays fast at campus size (it was 6.1 s when it
// validated after every change). 200 good placements and 1 bad one give
// exactly one conflict, in well under half a second.
func TestCheckIsFastOnCampusWithOneBadChange(t *testing.T) {
	base := scalefixture.Campus()
	occupied := map[string]bool{}
	for _, e := range base.Equipment {
		for u := e.Unit; u < e.Unit+e.Height; u++ {
			occupied[fmt.Sprintf("%s:%d", e.RackID, u)] = true
		}
	}
	rackUnits := map[string]int{}
	for _, r := range base.Racks {
		rackUnits[r.ID] = r.Units
	}
	plan := planning.Plan{ID: "p", BaseRevision: base.Revision, Revision: "1"}
	moved := map[string]bool{}
	var switches []topology.Equipment
	for _, e := range base.Equipment {
		if e.Kind == "switch" && e.Role == "access" {
			switches = append(switches, e)
		}
	}
	for _, e := range switches {
		if len(plan.Placements) == 200 {
			break
		}
		for u := rackUnits[e.RackID]; u > e.Unit; u-- { // a free unit in the same rack
			if key := fmt.Sprintf("%s:%d", e.RackID, u); !occupied[key] {
				occupied[key] = true
				moved[e.ID] = true
				plan.Placements = append(plan.Placements, planning.PlacementInput{EquipmentID: e.ID, RackID: e.RackID, Unit: u})
				break
			}
		}
	}
	if len(plan.Placements) != 200 {
		t.Fatalf("fixture gave %d placements, want 200", len(plan.Placements))
	}
	// The bad change: put an unmoved switch on top of another switch's unit.
	var victim, mover topology.Equipment
	for _, e := range switches {
		if moved[e.ID] {
			continue
		}
		if mover.ID == "" {
			mover = e
		} else if victim.ID == "" && e.RackID != mover.RackID {
			victim = e
		}
	}
	bad := planning.PlacementInput{EquipmentID: mover.ID, RackID: victim.RackID, Unit: victim.Unit}
	plan.Placements = slices.Insert(plan.Placements, 100, bad)

	start := time.Now()
	conflicts := planning.Check(base, plan)
	elapsed := time.Since(start)
	t.Logf("Check on Campus(): %d placements, %d conflict(s), %s", len(plan.Placements), len(conflicts), elapsed)
	if len(conflicts) != 1 || conflicts[0].Change != "place_equipment:"+mover.ID {
		t.Fatalf("want exactly the bad placement, got %+v", conflicts)
	}
	if limit := 500 * time.Millisecond * raceSlowdown; elapsed > limit { // 0.5 s; the race detector gets 6x
		t.Fatalf("Check took %s, want under %s", elapsed, limit)
	}
}

type topologyEdit struct{ s topology.Snapshot }

func cloneForEdit(s topology.Snapshot) topology.Snapshot {
	s.Sites = slices.Clone(s.Sites)
	s.Racks = slices.Clone(s.Racks)
	s.Equipment = slices.Clone(s.Equipment)
	s.Endpoints = slices.Clone(s.Endpoints)
	s.Links = slices.Clone(s.Links)
	return s
}
