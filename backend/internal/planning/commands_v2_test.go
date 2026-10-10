package planning_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
)

func run(t *testing.T, p planning.Plan, c planning.Command, id string) (planning.Plan, error) {
	t.Helper()
	return planning.Execute(acceptance.Installed(), p, c, id)
}

func must(t *testing.T, p planning.Plan, c planning.Command, id string) planning.Plan {
	t.Helper()
	next, err := run(t, p, c, id)
	if err != nil {
		t.Fatalf("%s: %v", c.Type, err)
	}
	return next
}

func cmd(kind string, rev string) planning.Command {
	return planning.Command{Type: kind, ExpectedRevision: rev}
}

func site(name string) planning.Command {
	c := cmd("add_site", "1")
	c.Site = &planning.SiteInput{Name: name}
	return c
}
func node(siteID, name string) planning.Command {
	c := cmd("add_node", "1")
	c.Node = &planning.NodeInput{SiteID: siteID, Name: name}
	return c
}
func rack(nodeID, name string, units int) planning.Command {
	c := cmd("add_rack", "1")
	c.Rack = &planning.RackInput{NodeID: nodeID, Name: name, Units: units}
	return c
}
func target(kind, id string) planning.Command {
	c := cmd(kind, "1")
	c.Target = &planning.TargetInput{ID: id}
	return c
}

// ED-06: each new command appends to the draft, advances its revision by one,
// and refuses invalid input with ErrInvalid, leaving the draft as it was.
func TestED06NewCommandsApplyAndRefuseInvalidInput(t *testing.T) {
	t.Run("add_site, add_node, add_rack build a hierarchy", func(t *testing.T) {
		p := must(t, v2Plan(), site("  Annex  "), "site-annex")
		if len(p.Sites) != 1 || p.Sites[0].ID != "site-annex" || p.Sites[0].Name != "Annex" || p.Revision != "2" {
			t.Fatalf("site not added: %+v", p)
		}
		c := node("site-annex", "Hall")
		c.ExpectedRevision = "2"
		p = must(t, p, c, "node-hall")
		c = rack("node-hall", "R1", 42)
		c.ExpectedRevision = "3"
		p = must(t, p, c, "rack-r1")
		if len(p.Nodes) != 1 || p.Nodes[0].SiteID != "site-annex" || len(p.Racks) != 1 || p.Racks[0].NodeID != "node-hall" || p.Racks[0].Units != 42 || p.Revision != "4" {
			t.Fatalf("hierarchy wrong: %+v", p)
		}
		applied, err := planning.Apply(acceptance.Installed(), p)
		if err != nil || len(applied.Racks) != 8 {
			t.Fatalf("the proposed snapshot must contain the rack: %v", err)
		}
	})
	rev := func(c planning.Command, r string) planning.Command { c.ExpectedRevision = r; return c }
	withSite := must(t, v2Plan(), site("Annex"), "site-annex")
	withNode := must(t, withSite, rev(node("site-annex", "Hall"), "2"), "node-hall")
	invalid := map[string]struct {
		plan planning.Plan
		c    planning.Command
		want string
	}{
		"empty site name":               {v2Plan(), site("  "), "1–100"},
		"long site name":                {v2Plan(), site(strings.Repeat("x", 101)), "1–100"},
		"duplicate site name":           {v2Plan(), site("main campus"), "already exists"},
		"node in unknown site":          {v2Plan(), node("nope", "Hall"), "unknown site"},
		"duplicate node name in a site": {v2Plan(), node("site-main-campus", "building a"), "already exists"},
		"rack in unknown node":          {v2Plan(), rack("nope", "R", 12), "unknown node"},
		"rack with 0 units":             {withNode, rev(rack("node-hall", "R", 0), "3"), "1–60"},
		"rack with 61 units":            {withNode, rev(rack("node-hall", "R", 61), "3"), "1–60"},
		"duplicate rack name in a node": {v2Plan(), rack("node-main-distribution", "rack core 01", 12), "already exists"},
		"delete unknown equipment":      {v2Plan(), target("delete_equipment", "nope"), "unknown equipment"},
		"disconnect a bridge":           {v2Plan(), target("disconnect_cable", "panel-a:1:bridge"), "bridge"},
		"disconnect unknown cable":      {v2Plan(), target("disconnect_cable", "nope"), "unknown cable"},
		"delete non-empty rack":         {v2Plan(), target("delete_rack", "rack-a03"), "still holds equipment"},
		"delete non-empty node":         {v2Plan(), target("delete_node", "node-building-a"), "still has racks"},
		"delete non-empty site":         {v2Plan(), target("delete_site", "site-dr"), "still has nodes"},
		"missing revision":              {v2Plan(), planning.Command{Type: "add_site", Site: &planning.SiteInput{Name: "X"}}, "expectedRevision"},
		"two payloads":                  {v2Plan(), planning.Command{Type: "add_site", ExpectedRevision: "1", Site: &planning.SiteInput{Name: "X"}, Target: &planning.TargetInput{ID: "y"}}, "only"},
		"wrong payload":                 {v2Plan(), planning.Command{Type: "delete_rack", ExpectedRevision: "1", Site: &planning.SiteInput{Name: "X"}}, "target"},
		"no payload":                    {v2Plan(), cmd("disconnect_cable", "1"), "target"},
		"payload on a legacy command":   {v2Plan(), planning.Command{Type: "add_cable", ExpectedRevision: "1", Cable: &planning.CableInput{A: "a", B: "b"}, Site: &planning.SiteInput{Name: "X"}}, "only"},
	}
	for name, c := range invalid {
		t.Run(name, func(t *testing.T) {
			before := c.plan.Revision
			got, err := run(t, c.plan, c.c, "id-x")
			if !errors.Is(err, planning.ErrInvalid) || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want ErrInvalid containing %q, got %v", c.want, err)
			}
			if !reflect.DeepEqual(got, planning.Plan{}) || c.plan.Revision != before {
				t.Fatal("a refused command must return no plan and leave the input alone")
			}
		})
	}
	t.Run("a stale revision is a conflict", func(t *testing.T) {
		if _, err := run(t, v2Plan(), rev(site("X"), "9"), "s"); !errors.Is(err, planning.ErrConflict) {
			t.Fatalf("want ErrConflict, got %v", err)
		}
	})
	t.Run("the same node name is allowed in another site", func(t *testing.T) {
		must(t, withSite, rev(node("site-annex", "Building A"), "2"), "n2")
	})
	t.Run("delete_equipment and disconnect_cable record removals", func(t *testing.T) {
		p := must(t, v2Plan(), target("delete_equipment", "panel-a"), "x")
		p = must(t, p, rev(target("disconnect_cable", "cable-b01"), "2"), "x")
		if !reflect.DeepEqual(p.Removals, planning.Removals{Equipment: []string{"panel-a"}, Links: []string{"cable-b01"}}) || p.Revision != "3" {
			t.Fatalf("removals wrong: %+v", p)
		}
	})
	t.Run("delete_rack, delete_node, delete_site work once empty", func(t *testing.T) {
		p := must(t, v2Plan(), target("delete_equipment", "edge-22"), "x")
		p = must(t, p, rev(target("delete_equipment", "panel-dr"), "2"), "x")
		p = must(t, p, rev(target("delete_rack", "rack-dr01"), "3"), "x")
		p = must(t, p, rev(target("delete_node", "node-dr-access"), "4"), "x")
		if !reflect.DeepEqual(p.Removals.Racks, []string{"rack-dr01"}) || !reflect.DeepEqual(p.Removals.Nodes, []string{"node-dr-access"}) {
			t.Fatalf("container removals wrong: %+v", p.Removals)
		}
		if _, err := run(t, p, rev(target("delete_site", "site-dr"), "5"), "x"); !errors.Is(err, planning.ErrInvalid) {
			t.Fatal("site-dr still has node-dr-distribution")
		}
	})
	t.Run("deleting a proposed container drops it", func(t *testing.T) {
		p := must(t, withNode, rev(target("delete_node", "node-hall"), "3"), "x")
		if len(p.Nodes) != 0 || len(p.Sites) != 1 || len(p.Removals.Nodes) != 0 {
			t.Fatalf("proposed node should vanish without a removal: %+v", p)
		}
	})
}

// ED-07: disconnecting cable A03 cuts the AGG-03 route in the plan only.
func TestED07DisconnectCableA03CutsTheRouteInThePlanOnly(t *testing.T) {
	base := acceptance.Installed()
	p := must(t, v2Plan(), target("disconnect_cable", "cable-a03"), "x")
	planned, err := planning.Apply(base, p)
	if err != nil {
		t.Fatal(err)
	}
	req := pathfinding.Request{Mode: "point_to_point", Start: "edge-17:p1", End: "agg-03:p1"}
	installed, err := pathfinding.Trace(base, req)
	if err != nil || installed.Status != "reached" {
		t.Fatalf("installed route to AGG-03 must exist: %v %+v", err, installed)
	}
	cut, err := pathfinding.Trace(planned, req)
	if err != nil || cut.Status == "reached" {
		t.Fatalf("the AGG-03 route must be cut in the plan: %v %+v", err, cut)
	}
	// The other routes of EDGE-17 survive.
	other, _ := pathfinding.Trace(planned, pathfinding.Request{Mode: "point_to_point", Start: "edge-17:p2", End: "agg-08:p1"})
	if other.Status != "reached" {
		t.Fatal("cutting A03 must not cut the AGG-08 route")
	}
	if !hasLink(base, "cable-a03") {
		t.Fatal("the installed snapshot lost the cable")
	}
}
