package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func ptr(s string) *string { return &s }

// withDetails is the acceptance fixture with every kind of detail filled in.
func withDetails() topology.Snapshot {
	s := acceptance.Installed()
	s.Sites[0].Location, s.Sites[0].Description = "north", "main site"
	s.Nodes[0].Location, s.Nodes[0].Description = "floor 1", "building A"
	s.Racks[0].Location, s.Racks[0].RackType, s.Racks[0].Description = "corner", "wall-mount", "small rack"
	for i := range s.Equipment {
		if s.Equipment[i].ID == "edge-17" {
			s.Equipment[i].Manufacturer, s.Equipment[i].Model, s.Equipment[i].SerialNumber = "Acme", "X1", "SN-0001"
			s.Equipment[i].IPAddress, s.Equipment[i].Status, s.Equipment[i].Description = "10.0.0.17", "maintenance", "edge switch"
		}
	}
	for i := range s.Endpoints {
		if s.Endpoints[i].ID == "edge-17:p1" {
			s.Endpoints[i].PortType, s.Endpoints[i].Connector, s.Endpoints[i].Speed, s.Endpoints[i].State, s.Endpoints[i].Description = "fiber", "LC", "10G", "reserved", "uplink"
		}
	}
	for i := range s.Links {
		if s.Links[i].ID == "cable-a01" {
			s.Links[i].Label, s.Links[i].Status, s.Links[i].Notes = "A-01", "testing", "new patch"
		}
	}
	return s
}

// traceOf is the answer of the two trace modes from EDGE-17, as text.
func traceOf(t *testing.T, s topology.Snapshot) string {
	t.Helper()
	var out strings.Builder
	for _, req := range []pathfinding.Request{
		{Mode: "distribution", Device: "edge-17"},
		{Mode: "point_to_point", Start: "edge-17:p1", End: "agg-03:p1"},
	} {
		r, err := pathfinding.Trace(s, req)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := json.Marshal(r)
		out.Write(b)
	}
	return out.String()
}

func sameDetails(t *testing.T, got, want topology.Snapshot) {
	t.Helper()
	byID := func(s topology.Snapshot) (map[string]topology.Site, map[string]topology.LocationNode, map[string]topology.Rack) {
		a, b, c := map[string]topology.Site{}, map[string]topology.LocationNode{}, map[string]topology.Rack{}
		for _, x := range s.Sites {
			a[x.ID] = x
		}
		for _, x := range s.Nodes {
			b[x.ID] = x
		}
		for _, x := range s.Racks {
			c[x.ID] = x
		}
		return a, b, c
	}
	gs, gn, gr := byID(got)
	ws, wn, wr := byID(want)
	if !reflect.DeepEqual(gs, ws) || !reflect.DeepEqual(gn, wn) || !reflect.DeepEqual(gr, wr) {
		t.Errorf("containers differ:\n got %+v %+v %+v\nwant %+v %+v %+v", gs, gn, gr, ws, wn, wr)
	}
	index := func(s topology.Snapshot) (map[string]topology.Equipment, map[string]topology.Endpoint, map[string]topology.Link) {
		e, p, l := map[string]topology.Equipment{}, map[string]topology.Endpoint{}, map[string]topology.Link{}
		for _, x := range s.Equipment {
			e[x.ID] = x
		}
		for _, x := range s.Endpoints {
			p[x.ID] = x
		}
		for _, x := range s.Links {
			l[x.ID] = x
		}
		return e, p, l
	}
	ge, gp, gl := index(got)
	we, wp, wl := index(want)
	for id, w := range we {
		if ge[id] != w {
			t.Errorf("equipment %s: got %+v want %+v", id, ge[id], w)
		}
	}
	for id, w := range wp {
		if gp[id] != w {
			t.Errorf("endpoint %s: got %+v want %+v", id, gp[id], w)
		}
	}
	for id, w := range wl {
		if gl[id] != w {
			t.Errorf("link %s: got %+v want %+v", id, gl[id], w)
		}
	}
}

// FD-01: the fields round-trip in Installed (Seed → load), in plans (commands →
// stored JSON → proposed snapshot) and through Record.
func TestFD01DetailFieldsRoundTripInInstalledPlansAndRecord(t *testing.T) {
	ctx := context.Background()
	s, url := testStore(t)
	want := withDetails()
	if err := s.Seed(ctx, want); err != nil {
		t.Fatal(err)
	}
	got, err := s.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	sameDetails(t, got, want)

	// A plan adds equipment with details and updates a port's details.
	plan, err := s.CreatePlan(ctx, "Details", got.Revision)
	if err != nil {
		t.Fatal(err)
	}
	add := planning.Command{Type: "add_equipment", ExpectedRevision: plan.Revision, Equipment: &planning.EquipmentInput{
		Name: "EDGE-30", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 3, Height: 1, PortCount: 2,
		Details: &topology.Details{Manufacturer: ptr("Acme"), SerialNumber: ptr("SN-0030"), Status: ptr("active")},
	}}
	if plan, err = s.Command(ctx, plan.ID, add); err != nil {
		t.Fatal(err)
	}
	newID := plan.Equipment[0].ID
	upd := planning.Command{Type: "update_details", ExpectedRevision: plan.Revision, Target: &planning.TargetInput{ID: newID + ":p1"},
		Details: &topology.Details{PortType: ptr("copper"), Speed: ptr("1G"), State: ptr("faulty")}}
	if plan, err = s.Command(ctx, plan.ID, upd); err != nil {
		t.Fatal(err)
	}
	reloaded, err := s.Plan(ctx, plan.ID)
	if err != nil || len(reloaded.Details) != 1 || reloaded.Equipment[0].SerialNumber != "SN-0030" {
		t.Fatalf("the plan keeps its details: %v %+v", err, reloaded)
	}
	proposed := snapshotOf(t, s, plan.ID)

	// Record writes them into Installed.
	if _, _, err = s.Record(ctx, plan.ID, plan.Revision, "details", "Tester"); err != nil {
		t.Fatal(err)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	after, err := reopened.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	sameTopology(t, after, proposed)
	sameDetails(t, after, proposed)
	var port topology.Endpoint
	for _, p := range after.Endpoints {
		if p.ID == newID+":p1" {
			port = p
		}
	}
	if port.PortType != "copper" || port.Speed != "1G" || port.State != "faulty" {
		t.Fatalf("recorded port details: %+v", port)
	}
}

// FD-02: invalid values and duplicate serial numbers are refused in commands,
// batches and record, and the database constraints are the safety net.
func TestFD02RefusalsInCommandsBatchesRecordAndTheDatabase(t *testing.T) {
	ctx := context.Background()
	s, _ := testStore(t)
	if err := s.Seed(ctx, withDetails()); err != nil {
		t.Fatal(err)
	}
	snap, _ := s.Installed(ctx)
	plan, _ := s.CreatePlan(ctx, "Refusals", snap.Revision)
	add := func(name string, unit int, d *topology.Details) planning.Command {
		return planning.Command{Type: "add_equipment", ExpectedRevision: plan.Revision, Equipment: &planning.EquipmentInput{
			Name: name, Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: unit, Height: 1, PortCount: 1, Details: d}}
	}
	// Single command: the serial of EDGE-17 is taken (ignoring case).
	_, err := s.Command(ctx, plan.ID, add("EDGE-30", 3, &topology.Details{SerialNumber: ptr("sn-0001")}))
	if !errors.Is(err, planning.ErrInvalid) || !strings.Contains(err.Error(), "sn-0001 is already the serial number of EDGE-17") {
		t.Fatalf("command: %v", err)
	}
	// Batch: names the command.
	batch := planning.Command{Type: "batch", ExpectedRevision: plan.Revision, Batch: &planning.BatchInput{Commands: []planning.Command{
		{Type: "add_equipment", Equipment: add("EDGE-31", 3, nil).Equipment},
		{Type: "add_equipment", Equipment: add("EDGE-32", 4, &topology.Details{Status: ptr("broken")}).Equipment},
	}}}
	_, _, err = s.Batch(ctx, plan.ID, batch)
	if !errors.Is(err, planning.ErrInvalid) || !strings.Contains(err.Error(), "command 2 (add_equipment): EDGE-32: status must be active, inactive or maintenance") {
		t.Fatalf("batch: %v", err)
	}
	if again, _ := s.Plan(ctx, plan.ID); again.Revision != plan.Revision {
		t.Fatal("a refused command or batch changed the draft")
	}
	// Record: a draft valid when written becomes invalid when Installed gains the
	// same serial number elsewhere; recording refuses it and changes nothing.
	ok, err := s.Command(ctx, plan.ID, add("EDGE-33", 3, &topology.Details{SerialNumber: ptr("SN-0033")}))
	if err != nil {
		t.Fatal(err)
	}
	other, _ := s.CreatePlan(ctx, "Other", snap.Revision)
	o, err := s.Command(ctx, other.ID, planning.Command{Type: "add_equipment", ExpectedRevision: other.Revision, Equipment: &planning.EquipmentInput{
		Name: "EDGE-40", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 5, Height: 1, PortCount: 1,
		Details: &topology.Details{SerialNumber: ptr("SN-0033")}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.Record(ctx, o.ID, o.Revision, "first", "Tester"); err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.Record(ctx, ok.ID, ok.Revision, "second", "Tester"); !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("recording on a stale base must be refused: %v", err)
	}
	_, err = s.Rebase(ctx, ok.ID, ok.Revision)
	var conflicts *planning.ConflictsError
	if !errors.As(err, &conflicts) || len(conflicts.Conflicts) != 1 || conflicts.Conflicts[0].Reason != "SN-0033 is already the serial number of EDGE-40" {
		t.Fatalf("Update draft must list the serial clash in names: %v %+v", err, conflicts)
	}
	// The database is the safety net behind all of it.
	for name, sql := range map[string]string{
		"status outside the set":  `UPDATE equipment SET status='broken' WHERE id='edge-17'`,
		"port state outside":      `UPDATE endpoints SET state='broken' WHERE id='edge-17:p2'`,
		"port type outside":       `UPDATE endpoints SET port_type='coax' WHERE id='edge-17:p2'`,
		"cable status outside":    `UPDATE links SET status='broken' WHERE id='cable-a01'`,
		"rack type outside":       `UPDATE racks SET rack_type='tower' WHERE id='rack-a03'`,
		"text too long":           `UPDATE equipment SET model=repeat('x',201) WHERE id='edge-17'`,
		"long description":        `UPDATE sites SET description=repeat('x',1001)`,
		"empty string":            `UPDATE equipment SET model='' WHERE id='edge-17'`,
		"duplicate serial (case)": `UPDATE equipment SET serial_number='sn-0001' WHERE id='agg-03'`,
		"details on a bridge":     `UPDATE links SET label='x' WHERE kind='internal'`,
	} {
		if _, err := s.pool.Exec(ctx, sql); err == nil {
			t.Errorf("%s: the database accepted it", name)
		}
	}
}

// FD-03: a port's state is data; faulty or disabled never changes a trace.
func TestFD03APortStateNeverChangesATrace(t *testing.T) {
	ctx := context.Background()
	s, _ := testStore(t)
	base := acceptance.Installed()
	if err := s.Seed(ctx, base); err != nil {
		t.Fatal(err)
	}
	before, _ := s.Installed(ctx)
	plan, _ := s.CreatePlan(ctx, "Faulty", before.Revision)
	// The draft owns no installed port, so mark the state on a proposed switch... and
	// directly in the installed rows, which is what a direct fix will do.
	for _, state := range []string{"faulty", "disabled", "reserved"} {
		if _, err := s.pool.Exec(ctx, `UPDATE endpoints SET state=$1 WHERE id IN ('edge-17:p1','agg-03:p1')`, state); err != nil {
			t.Fatal(err)
		}
		after, err := s.Installed(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if a, b := traceOf(t, before), traceOf(t, after); a != b {
			t.Fatalf("state %s changed the trace:\n%s\nvs\n%s", state, a, b)
		}
	}
	_ = plan
}

// PG-01 (persistence): a switch with grouped ports round-trips through a plan,
// Record and the database with positions 1–28 and groups 1–2, and the database
// keeps the order unique per switch.
func TestPG01GroupedSwitchRoundTripsThroughRecord(t *testing.T) {
	ctx := context.Background()
	s, url := testStore(t)
	if err := s.Seed(ctx, acceptance.Installed()); err != nil {
		t.Fatal(err)
	}
	base, _ := s.Installed(ctx)
	plan, _ := s.CreatePlan(ctx, "Groups", base.Revision)
	plan, err := s.Command(ctx, plan.ID, planning.Command{Type: "add_equipment", ExpectedRevision: plan.Revision, Equipment: &planning.EquipmentInput{
		Name: "EDGE-30", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 3, Height: 1,
		PortGroups: []planning.PortGroupInput{
			{Count: 24, Names: "Gi1/0/{n}", Details: &planning.PortGroupDetails{PortType: "copper", Connector: "RJ45", Speed: "1G"}},
			{Count: 4, Names: "Te1/1/{n}", Details: &planning.PortGroupDetails{PortType: "fiber", Connector: "SFP+", Speed: "10G"}},
		}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.Record(ctx, plan.ID, plan.Revision, "grouped", "Tester"); err != nil {
		t.Fatal(err)
	}
	s.Close()
	reopened, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	after, err := reopened.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var id string
	for _, e := range after.Equipment {
		if e.Name == "EDGE-30" {
			id = e.ID
		}
	}
	var ports []topology.Endpoint
	for _, p := range after.Endpoints {
		if p.EquipmentID == id {
			ports = append(ports, p)
		}
	}
	if len(ports) != 28 {
		t.Fatalf("%d ports", len(ports))
	}
	byPosition := map[int]topology.Endpoint{}
	for _, p := range ports {
		byPosition[p.Position] = p
	}
	first, last, up := byPosition[1], byPosition[24], byPosition[25]
	if first.Label != "Gi1/0/1" || first.PortGroup != 1 || first.PortType != "copper" || first.Connector != "RJ45" || first.Speed != "1G" ||
		last.Label != "Gi1/0/24" || up.Label != "Te1/1/1" || up.PortGroup != 2 || up.PortType != "fiber" || byPosition[28].Label != "Te1/1/4" {
		t.Fatalf("ports after record: %+v %+v %+v", first, last, up)
	}
	// The database keeps the order unique per switch, and ports before groups stay at 0.
	if _, err := reopened.pool.Exec(ctx, `UPDATE endpoints SET position=1 WHERE id=$1`, id+":p2"); err == nil {
		t.Error("the database accepted two ports at one position")
	}
	if _, err := reopened.pool.Exec(ctx, `UPDATE endpoints SET port_group=3, position=0 WHERE id=$1`, "edge-17:p1"); err == nil {
		t.Error("the database accepted a group without a position")
	}
	for _, p := range after.Endpoints {
		if p.EquipmentID == "edge-17" && (p.Position != 0 || p.PortGroup != 0) {
			t.Fatalf("a port saved before groups changed: %+v", p)
		}
	}
}
