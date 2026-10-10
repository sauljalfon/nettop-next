package planning_test

import (
	"errors"
	"reflect"
	"slices"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

// expansion is the browser-test draft: EDGE-18 in rack A03 cabled to AGG-15.
func expansion() planning.Plan {
	p := v2Plan()
	p.Equipment = []topology.Equipment{{ID: "edge-18", Name: "EDGE-18", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 6, Height: 1}}
	p.Endpoints = []topology.Endpoint{{ID: "edge-18:p1", EquipmentID: "edge-18", Label: "Port 1"}}
	p.Links = []topology.Link{{ID: "planned-cable-18", A: "edge-18:p1", B: "agg-15:p1", Kind: "cable"}}
	return p
}

// A plan with a new site > node > rack holding new equipment with a cable, and a
// placement of installed EDGE-22 into the new rack.
func nested() planning.Plan {
	p := v2Plan()
	p.Sites = []topology.Site{{ID: "site-n", Name: "N"}}
	p.Nodes = []topology.LocationNode{{ID: "node-n", Name: "NN", SiteID: "site-n"}}
	p.Racks = []topology.Rack{{ID: "rack-n", NodeID: "node-n", Name: "RN", Units: 12}}
	p.Equipment = []topology.Equipment{{ID: "eq-n", Name: "SW-N", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-n", Unit: 1, Height: 1}}
	p.Endpoints = []topology.Endpoint{{ID: "eq-n:p1", EquipmentID: "eq-n", Label: "Port 1"}}
	p.Links = []topology.Link{{ID: "cable-n", A: "eq-n:p1", B: "agg-15:p1", Kind: "cable"}}
	p.Placements = []planning.PlacementInput{{EquipmentID: "edge-22", RackID: "rack-n", Unit: 5}}
	return p
}

func sorted(keys []string) []string { return slices.Sorted(slices.Values(keys)) }

// ED-12: remove_change removes one change and its structural dependents.
func TestED12RemoveChangeRemovesTheChangeAndItsDependents(t *testing.T) {
	base := acceptance.Installed()
	cases := []struct {
		name, key string
		plan      planning.Plan
		removed   []string
		check     func(t *testing.T, p planning.Plan)
	}{
		{"equipment takes its cable", "add_equipment:edge-18", expansion(), []string{"add_cable:planned-cable-18", "add_equipment:edge-18"},
			func(t *testing.T, p planning.Plan) {
				if len(p.Equipment)+len(p.Endpoints)+len(p.Links) != 0 {
					t.Fatalf("equipment, endpoints and cable should all go: %+v", p)
				}
			}},
		{"equipment takes its placement too", "add_equipment:eq-n", func() planning.Plan {
			p := nested()
			p.Placements = append(p.Placements, planning.PlacementInput{EquipmentID: "eq-n", RackID: "rack-n", Unit: 2})
			return p
		}(), []string{"add_cable:cable-n", "add_equipment:eq-n", "place_equipment:eq-n"}, nil},
		{"rack takes equipment inside, its cable and placements into it", "add_rack:rack-n", nested(),
			[]string{"add_cable:cable-n", "add_equipment:eq-n", "add_rack:rack-n", "place_equipment:edge-22"},
			func(t *testing.T, p planning.Plan) {
				if len(p.Racks)+len(p.Equipment)+len(p.Placements)+len(p.Links) != 0 || len(p.Nodes) != 1 || len(p.Sites) != 1 {
					t.Fatalf("only the rack and what is inside it go: %+v", p)
				}
			}},
		{"node takes its racks", "add_node:node-n", nested(),
			[]string{"add_cable:cable-n", "add_equipment:eq-n", "add_node:node-n", "add_rack:rack-n", "place_equipment:edge-22"},
			func(t *testing.T, p planning.Plan) {
				if len(p.Nodes)+len(p.Racks)+len(p.Equipment) != 0 || len(p.Sites) != 1 {
					t.Fatalf("%+v", p)
				}
			}},
		{"site takes its nodes", "add_site:site-n", nested(),
			[]string{"add_cable:cable-n", "add_equipment:eq-n", "add_node:node-n", "add_rack:rack-n", "add_site:site-n", "place_equipment:edge-22"},
			func(t *testing.T, p planning.Plan) {
				if len(p.Sites)+len(p.Nodes)+len(p.Racks)+len(p.Equipment)+len(p.Placements)+len(p.Links) != 0 {
					t.Fatalf("%+v", p)
				}
			}},
		{"placement only", "place_equipment:edge-22", nested(), []string{"place_equipment:edge-22"},
			func(t *testing.T, p planning.Plan) {
				if len(p.Placements) != 0 || len(p.Equipment) != 1 {
					t.Fatalf("%+v", p)
				}
			}},
		{"added cable only", "add_cable:cable-n", nested(), []string{"add_cable:cable-n"}, nil},
		{"removal of a cable", "remove_cable:cable-a03", removeAll(t, base, v2Plan(), [2]string{"link", "cable-a03"}), []string{"remove_cable:cable-a03"},
			func(t *testing.T, p planning.Plan) {
				if !reflect.DeepEqual(p.Removals, planning.Removals{}) {
					t.Fatalf("%+v", p.Removals)
				}
			}},
		{"removal of a rack", "remove_rack:rack-a03", func() planning.Plan {
			p := v2Plan()
			p.Removals = planning.Removals{Equipment: []string{"edge-17", "panel-a"}, Racks: []string{"rack-a03"}}
			return p
		}(), []string{"remove_rack:rack-a03"}, func(t *testing.T, p planning.Plan) {
			if len(p.Removals.Racks) != 0 || len(p.Removals.Equipment) != 2 {
				t.Fatalf("%+v", p.Removals)
			}
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			before := c.plan.Revision
			got, removed, err := planning.RemoveChange(c.plan, c.key)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(sorted(removed), c.removed) {
				t.Fatalf("removed keys = %v, want %v", removed, c.removed)
			}
			if removed[0] != c.key {
				t.Fatalf("the named change comes first: %v", removed)
			}
			if c.check != nil {
				c.check(t, got)
			}
			if c.plan.Revision != before || !hasKeyNamed(c.plan, c.key) {
				t.Fatal("RemoveChange must not mutate its input")
			}
		})
	}
}

func hasKeyNamed(p planning.Plan, key string) bool {
	_, _, err := planning.RemoveChange(p, key)
	return err == nil
}

// ED-12: an unknown or malformed key is ErrNotFound and returns no plan.
func TestED12RemoveChangeRefusesAnUnknownKey(t *testing.T) {
	for _, key := range []string{"add_equipment:nope", "place_equipment:edge-17", "remove_equipment:panel-a", "add_site:x", "nonsense", "", "add_cable:", "flip_table:edge-18"} {
		got, removed, err := planning.RemoveChange(expansion(), key)
		if !errors.Is(err, planning.ErrNotFound) || removed != nil || !reflect.DeepEqual(got, planning.Plan{}) {
			t.Errorf("%q: want ErrNotFound and nothing, got %v %v", key, err, removed)
		}
	}
}

func removeChangeCommand(rev, key string) planning.Command {
	return planning.Command{Type: "remove_change", ExpectedRevision: rev, Change: &planning.ChangeInput{Key: key}}
}

// ED-12: the command works on a stale draft (it can only shrink it), and
// follows the other commands' rules.
func TestED12RemoveChangeCommandWorksOnAStaleDraft(t *testing.T) {
	base := acceptance.Installed()
	stale := expansion()
	stale.BaseRevision = "an-older-revision"
	if _, err := planning.Apply(base, stale); !errors.Is(err, planning.ErrConflict) {
		t.Fatal("setup: the draft must be stale")
	}
	got, removed, err := planning.ExecuteRemoveChange(base, stale, removeChangeCommand("1", "add_cable:planned-cable-18"))
	if err != nil {
		t.Fatal(err)
	}
	if got.Revision != "2" || got.BaseRevision != "an-older-revision" || len(got.Links) != 0 || !slices.Equal(removed, []string{"add_cable:planned-cable-18"}) {
		t.Fatalf("stale result: %+v %v", got, removed)
	}
	viaExecute, err := planning.Execute(base, stale, removeChangeCommand("1", "add_cable:planned-cable-18"), "unused")
	if err != nil || !reflect.DeepEqual(viaExecute, got) {
		t.Fatalf("Execute must run the same command: %v", err)
	}
	// Other commands still refuse a stale base.
	if _, err := planning.Execute(base, stale, planning.Command{Type: "add_site", ExpectedRevision: "1", Site: &planning.SiteInput{Name: "X"}}, "s"); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("a stale draft must refuse other commands: %v", err)
	}
}

func TestED12RemoveChangeCommandRules(t *testing.T) {
	base := acceptance.Installed()
	recorded := expansion()
	recorded.Status = "recorded"
	twoPayloads := removeChangeCommand("1", "add_equipment:edge-18")
	twoPayloads.Site = &planning.SiteInput{Name: "x"}
	noRevision := removeChangeCommand("", "add_equipment:edge-18")
	noPayload := planning.Command{Type: "remove_change", ExpectedRevision: "1"}
	emptyKey := removeChangeCommand("1", "  ")
	// A current draft must still apply: undoing the rack's emptiness is refused.
	blocking := v2Plan()
	blocking.Removals = planning.Removals{Equipment: []string{"edge-22", "panel-dr"}, Racks: []string{"rack-dr01"}}
	for name, c := range map[string]struct {
		plan planning.Plan
		cmd  planning.Command
		want error
	}{
		"recorded plan":     {recorded, removeChangeCommand("1", "add_equipment:edge-18"), planning.ErrConflict},
		"stale revision":    {expansion(), removeChangeCommand("9", "add_equipment:edge-18"), planning.ErrConflict},
		"missing revision":  {expansion(), noRevision, planning.ErrInvalid},
		"no payload":        {expansion(), noPayload, planning.ErrInvalid},
		"two payloads":      {expansion(), twoPayloads, planning.ErrInvalid},
		"blank key":         {expansion(), emptyKey, planning.ErrNotFound},
		"unknown key":       {expansion(), removeChangeCommand("1", "add_equipment:ghost"), planning.ErrNotFound},
		"result must apply": {blocking, removeChangeCommand("1", "remove_equipment:edge-22"), planning.ErrInvalid},
	} {
		t.Run(name, func(t *testing.T) {
			got, removed, err := planning.ExecuteRemoveChange(base, c.plan, c.cmd)
			if !errors.Is(err, c.want) || removed != nil || !reflect.DeepEqual(got, planning.Plan{}) {
				t.Fatalf("want %v and nothing, got %v", c.want, err)
			}
		})
	}
}

// ED-13: undoing remove_equipment:panel-a brings PANEL-A and its 6 cables back.
func TestED13UndoingARemovalBringsTheEquipmentAndItsCablesBack(t *testing.T) {
	base := acceptance.Installed()
	p := removeAll(t, base, v2Plan(), [2]string{"equipment", "panel-a"})
	gone, err := planning.Apply(base, p)
	if err != nil || hasEquipment(gone, "panel-a") {
		t.Fatalf("setup: %v", err)
	}
	back, removed, err := planning.ExecuteRemoveChange(base, p, removeChangeCommand("1", "remove_equipment:panel-a"))
	if err != nil || !slices.Equal(removed, []string{"remove_equipment:panel-a"}) {
		t.Fatalf("%v %v", err, removed)
	}
	restored, err := planning.Apply(base, back)
	if err != nil {
		t.Fatal(err)
	}
	if !hasEquipment(restored, "panel-a") {
		t.Fatal("PANEL-A is not back")
	}
	for _, id := range []string{"cable-a01", "cable-a02", "cable-a05", "cable-a06", "cable-a09", "cable-a10"} {
		if !hasLink(restored, id) {
			t.Fatalf("%s is not back", id)
		}
	}
	if !reflect.DeepEqual(restored.Links, base.Links) && len(restored.Links) != len(base.Links) {
		t.Fatal("the proposed topology should equal installed again")
	}
	if len(restored.Endpoints) != len(base.Endpoints) {
		t.Fatalf("endpoints %d, want %d", len(restored.Endpoints), len(base.Endpoints))
	}
}
