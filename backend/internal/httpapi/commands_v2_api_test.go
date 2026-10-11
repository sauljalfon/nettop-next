package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

// memoryRepo is an in-memory repository over the acceptance fixture with one
// draft. Command runs the real planning.Execute and keeps the plan only on success.
type memoryRepo struct {
	Repository
	plan      planning.Plan
	n         int
	installed *topology.Snapshot // starts as the acceptance fixture
}

func (m *memoryRepo) base() topology.Snapshot {
	if m.installed == nil {
		s := acceptance.Installed()
		m.installed = &s
	}
	return *m.installed
}

func (m *memoryRepo) Ping(context.Context) error { return nil }
func (m *memoryRepo) Plan(_ context.Context, id string) (planning.Plan, error) {
	if id != m.plan.ID {
		return planning.Plan{}, planning.ErrNotFound
	}
	return m.plan, nil
}
func (m *memoryRepo) Snapshot(_ context.Context, id string) (topology.Snapshot, error) {
	if id == "" {
		return m.base(), nil
	}
	if id != m.plan.ID {
		return topology.Snapshot{}, planning.ErrNotFound
	}
	return planning.Apply(m.base(), m.plan)
}
func (m *memoryRepo) Command(_ context.Context, id string, c planning.Command) (planning.Plan, error) {
	if id != m.plan.ID {
		return planning.Plan{}, planning.ErrNotFound
	}
	next, err := planning.Execute(m.base(), m.plan, c, fmt.Sprintf("new-%d", m.n+1))
	if err != nil {
		return m.plan, err
	}
	m.n++ // IDs are consumed by successful commands only
	m.plan = next
	return next, nil
}

// ED-06 over HTTP: the documented status for every outcome, and a failed
// command leaves the draft exactly as it was.
func TestED06NewCommandContractOverHTTP(t *testing.T) {
	repo := &memoryRepo{plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1"}}
	call := newCaller(t, New(repo, "dev"))
	path := "/api/plans/p/commands"
	revision := func() string { return repo.plan.Revision }

	for _, c := range []struct {
		name, body string
		status     int
	}{
		{"malformed JSON", `{"type":`, 400},
		{"unknown field", `{"type":"add_site","expectedRevision":"1","site":{"name":"X"},"extra":1}`, 400},
		{"unknown payload field", `{"type":"add_site","expectedRevision":"1","site":{"name":"X","units":3}}`, 400},
		{"missing expectedRevision", `{"type":"add_site","site":{"name":"X"}}`, 422},
		{"missing payload", `{"type":"add_site","expectedRevision":"1"}`, 422},
		{"two payloads", `{"type":"add_site","expectedRevision":"1","site":{"name":"X"},"target":{"id":"a"}}`, 422},
		{"duplicate site name", `{"type":"add_site","expectedRevision":"1","site":{"name":"DR SITE"}}`, 422},
		{"rack too large", `{"type":"add_rack","expectedRevision":"1","rack":{"nodeId":"node-dr-access","name":"Big","units":61}}`, 422},
		{"disconnect a bridge", `{"type":"disconnect_cable","expectedRevision":"1","target":{"id":"panel-a:1:bridge"}}`, 422},
		{"delete a non-empty rack", `{"type":"delete_rack","expectedRevision":"1","target":{"id":"rack-a03"}}`, 422},
		{"stale revision", `{"type":"add_site","expectedRevision":"7","site":{"name":"X"}}`, 409},
	} {
		t.Run(c.name, func(t *testing.T) {
			before, _ := json.Marshal(repo.plan)
			call("POST", path, c.body, c.status)
			if after, _ := json.Marshal(repo.plan); string(before) != string(after) {
				t.Fatalf("a failed command changed the draft:\n%s\n%s", before, after)
			}
		})
	}
	call("POST", "/api/plans/missing/commands", `{"type":"add_site","expectedRevision":"1","site":{"name":"X"}}`, 404)

	var got planning.Plan
	for i, body := range []string{
		`{"type":"add_site","expectedRevision":"%s","site":{"name":"Annex"}}`,
		`{"type":"add_node","expectedRevision":"%s","node":{"siteId":"new-1","name":"Hall"}}`,
		`{"type":"add_rack","expectedRevision":"%s","rack":{"nodeId":"new-2","name":"R1","units":24}}`,
		`{"type":"delete_equipment","expectedRevision":"%s","target":{"id":"panel-a"}}`,
		`{"type":"disconnect_cable","expectedRevision":"%s","target":{"id":"cable-b01"}}`,
	} {
		w := call("POST", path, fmt.Sprintf(body, revision()), 200)
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got.Revision != fmt.Sprint(i+2) {
			t.Fatalf("command %d: revision %q, %v", i, got.Revision, err)
		}
	}
	if len(got.Sites) != 1 || len(got.Nodes) != 1 || len(got.Racks) != 1 || got.Racks[0].NodeID != "new-2" || got.Removals.Equipment[0] != "panel-a" || got.Removals.Links[0] != "cable-b01" {
		t.Fatalf("plan JSON wrong: %+v", got)
	}
	if !strings.Contains(call("GET", "/api/plans/p", "", 200).Body.String(), `"removals"`) {
		t.Fatal("the plan response must carry removals")
	}
}

// ED-07 over HTTP: the trace in the plan context loses the AGG-03 route; the
// installed trace keeps it.
func TestED07DisconnectA03CutsTheTraceInThePlanContextOnly(t *testing.T) {
	repo := &memoryRepo{plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1"}}
	call := newCaller(t, New(repo, "dev"))
	trace := func(path string) pathfinding.Result {
		return decodeResult(t, call("POST", path, `{"mode":"point_to_point","start":"edge-17:p1","end":"agg-03:p1"}`, 200))
	}
	call("POST", "/api/plans/p/commands", `{"type":"disconnect_cable","expectedRevision":"1","target":{"id":"cable-a03"}}`, 200)
	if r := trace("/api/traces?context=planned&planId=p"); r.Status == "reached" {
		t.Fatalf("the plan must cut the route: %+v", r)
	}
	if r := trace("/api/traces"); r.Status != "reached" {
		t.Fatalf("Installed must keep the route: %+v", r)
	}
}

// Record and Rebase run the real planning code on the in-memory topology.
func (m *memoryRepo) Record(_ context.Context, id, expectedRevision, note, recordedBy string) (planning.Plan, string, error) {
	if id != m.plan.ID {
		return planning.Plan{}, "", planning.ErrNotFound
	}
	switch {
	case m.plan.Status == "recorded":
		return planning.Plan{}, "", planning.ErrRecorded
	case m.plan.Revision != expectedRevision:
		return planning.Plan{}, "", fmt.Errorf("%w: this draft changed; refresh before trying again", planning.ErrConflict)
	case m.plan.BaseRevision != m.base().Revision:
		return planning.Plan{}, "", fmt.Errorf("%w: Installed changed since this draft; update the draft first", planning.ErrConflict)
	case strings.TrimSpace(note) == "" || strings.TrimSpace(recordedBy) == "":
		return planning.Plan{}, "", fmt.Errorf("%w: a note and recordedBy are required", planning.ErrInvalid)
	}
	proposed, err := planning.Apply(m.base(), m.plan)
	if err != nil {
		return planning.Plan{}, "", err
	}
	proposed.Context, proposed.Revision = "installed", "rec-1"
	m.installed = &proposed
	now := time.Now()
	m.plan.Status, m.plan.RecordedAt, m.plan.RecordNote, m.plan.RecordedBy, m.plan.Revision = "recorded", &now, strings.TrimSpace(note), strings.TrimSpace(recordedBy), "2"
	return m.plan, "rec-1", nil
}
func (m *memoryRepo) Rebase(_ context.Context, id, expectedRevision string) (planning.Plan, error) {
	if id != m.plan.ID {
		return planning.Plan{}, planning.ErrNotFound
	}
	switch {
	case m.plan.Status == "recorded":
		return planning.Plan{}, planning.ErrRecorded
	case m.plan.Revision != expectedRevision:
		return planning.Plan{}, fmt.Errorf("%w: this draft changed; refresh before trying again", planning.ErrConflict)
	case m.plan.BaseRevision == m.base().Revision:
		return m.plan, nil
	}
	if conflicts := planning.Check(m.base(), m.plan); len(conflicts) > 0 {
		return planning.Plan{}, &planning.ConflictsError{Conflicts: conflicts}
	}
	m.plan.BaseRevision, m.plan.Revision = m.base().Revision, "2"
	return m.plan, nil
}

// RC-01/RC-02/RC-03 over HTTP: the record endpoint's shape and statuses.
func TestRecordEndpointContractOverHTTP(t *testing.T) {
	repo := &memoryRepo{plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1",
		Sites: []topology.Site{{ID: "site-new", Name: "New"}}}}
	call := newCaller(t, New(repo, "dev"))
	path := "/api/plans/p/record"
	call("POST", path, `{"expectedRevision":"1"}`, 422)
	call("POST", path, `{"expectedRevision":"1","note":"  ","recordedBy":"Dana"}`, 422)
	call("POST", path, `{"expectedRevision":"1","note":"done"}`, 422) // RC-07: recordedBy is required
	call("POST", path, `{"expectedRevision":"1","note":"done","recordedBy":" "}`, 422)
	call("POST", path, `{"expectedRevision":"1","note":"x","recordedBy":"D","extra":1}`, 400)
	call("POST", path, `{"note":`, 400)
	call("POST", path, `{"expectedRevision":"5","note":"done","recordedBy":"Dana"}`, 409)
	call("POST", "/api/plans/missing/record", `{"expectedRevision":"1","note":"done","recordedBy":"Dana"}`, 404)
	var out struct {
		Plan              planning.Plan `json:"plan"`
		InstalledRevision string        `json:"installedRevision"`
	}
	w := call("POST", path, `{"expectedRevision":"1","note":"Installed the annex","recordedBy":"Dana Cohen"}`, 200)
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Plan.Status != "recorded" || out.Plan.RecordNote != "Installed the annex" || out.Plan.RecordedBy != "Dana Cohen" || out.Plan.RecordedAt == nil || out.InstalledRevision != "rec-1" {
		t.Fatalf("record response wrong: %s", w.Body.String())
	}
	// Recorded: read-only for commands, record and rebase.
	call("POST", "/api/plans/p/commands", `{"type":"add_site","expectedRevision":"2","site":{"name":"More"}}`, 409)
	call("POST", path, `{"expectedRevision":"2","note":"again","recordedBy":"Dana"}`, 409)
	call("POST", "/api/plans/p/rebase", `{"expectedRevision":"2"}`, 409)
	got := call("GET", "/api/plans/p", "", 200).Body.String()
	for _, key := range []string{`"status":"recorded"`, `"recordedAt"`, `"recordNote":"Installed the annex"`, `"recordedBy":"Dana Cohen"`} {
		if !strings.Contains(got, key) {
			t.Fatalf("GET plan lacks %s: %s", key, got)
		}
	}
}

// RB-01/RB-02 over HTTP: Update draft succeeds with the plan, or answers 409
// with the conflict list.
func TestRebaseEndpointContractOverHTTP(t *testing.T) {
	stale := func() *memoryRepo {
		s := acceptance.Installed()
		s.Revision = "rec-9" // installed moved on since the draft's base
		return &memoryRepo{installed: &s}
	}
	t.Run("a clean draft moves to the new base", func(t *testing.T) {
		repo := stale()
		repo.plan = planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1", Sites: []topology.Site{{ID: "site-new", Name: "New"}}}
		call := newCaller(t, New(repo, "dev"))
		call("POST", "/api/plans/p/rebase", `{"expectedRevision":"9"}`, 409)
		call("POST", "/api/plans/p/rebase", `{"expectedRevision":"1","x":1}`, 400)
		var p planning.Plan
		if err := json.Unmarshal(call("POST", "/api/plans/p/rebase", `{"expectedRevision":"1"}`, 200).Body.Bytes(), &p); err != nil || p.BaseRevision != "rec-9" || p.Revision != "2" {
			t.Fatalf("rebase result: %v %+v", err, p)
		}
		var again planning.Plan
		if err := json.Unmarshal(call("POST", "/api/plans/p/rebase", `{"expectedRevision":"2"}`, 200).Body.Bytes(), &again); err != nil || again.Revision != "2" {
			t.Fatalf("a current draft is a no-op: %v %+v", err, again)
		}
		call("POST", "/api/plans/missing/rebase", `{"expectedRevision":"1"}`, 404)
	})
	t.Run("a conflicting draft gets 409 with its conflict list", func(t *testing.T) {
		repo := stale()
		repo.plan = planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1",
			Placements: []planning.PlacementInput{{EquipmentID: "gone-equipment", RackID: "rack-a03", Unit: 3}}}
		before, _ := json.Marshal(repo.plan)
		w := newCaller(t, New(repo, "dev"))("POST", "/api/plans/p/rebase", `{"expectedRevision":"1"}`, 409)
		var body struct {
			Error     string              `json:"error"`
			Conflicts []planning.Conflict `json:"conflicts"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Error == "" || len(body.Conflicts) != 1 || body.Conflicts[0].Change != "place_equipment:gone-equipment" || body.Conflicts[0].Reason == "" {
			t.Fatalf("conflict body wrong: %v %s", err, w.Body.String())
		}
		if after, _ := json.Marshal(repo.plan); string(before) != string(after) {
			t.Fatal("a conflicting rebase changed the draft")
		}
	})
}

// RemoveChange, CheckPlan and RecordedPlansChanging on the in-memory topology.
func (m *memoryRepo) RemoveChange(_ context.Context, id string, c planning.Command) (planning.Plan, []string, error) {
	if id != m.plan.ID {
		return planning.Plan{}, nil, planning.ErrNotFound
	}
	next, removed, err := planning.ExecuteRemoveChange(m.base(), m.plan, c)
	if err != nil {
		return planning.Plan{}, nil, err
	}
	m.plan = next
	return next, removed, nil
}
func (m *memoryRepo) CheckPlan(_ context.Context, id string) (bool, []planning.Conflict, error) {
	if id != m.plan.ID {
		return false, nil, planning.ErrNotFound
	}
	if m.plan.Status == "recorded" {
		return false, nil, planning.ErrRecorded
	}
	conflicts := planning.Check(m.base(), m.plan)
	if conflicts == nil {
		conflicts = []planning.Conflict{}
	}
	return m.plan.BaseRevision != m.base().Revision, conflicts, nil
}
func (m *memoryRepo) Plans(context.Context) ([]planning.Plan, error) {
	return []planning.Plan{m.plan}, nil
}
func (m *memoryRepo) RecordedPlansChanging(_ context.Context, objectID string) ([]planning.Plan, error) {
	if m.plan.Status == "recorded" && objectID == "site-new" {
		return []planning.Plan{m.plan}, nil
	}
	return []planning.Plan{}, nil
}

// ED-12 over HTTP: remove_change answers {plan, removed}; other commands keep
// answering with the plan alone.
func TestED12RemoveChangeEndpointContractOverHTTP(t *testing.T) {
	s := acceptance.Installed()
	s.Revision = "rec-9"
	repo := &memoryRepo{installed: &s, plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1", // stale
		Equipment: []topology.Equipment{{ID: "edge-18", Name: "EDGE-18", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 6, Height: 1}},
		Endpoints: []topology.Endpoint{{ID: "edge-18:p1", EquipmentID: "edge-18", Label: "Port 1"}},
		Links:     []topology.Link{{ID: "planned-cable-18", A: "edge-18:p1", B: "agg-15:p1", Kind: "cable"}},
	}}
	call := newCaller(t, New(repo, "dev"))
	path := "/api/plans/p/commands"
	call("POST", path, `{"type":"add_site","expectedRevision":"1","site":{"name":"X"}}`, 409) // other commands still refuse a stale draft
	call("POST", path, `{"type":"remove_change","expectedRevision":"1"}`, 422)
	call("POST", path, `{"type":"remove_change","expectedRevision":"1","change":{"key":"add_equipment:ghost"}}`, 404)
	call("POST", path, `{"type":"remove_change","expectedRevision":"1","change":{"key":"x","extra":1}}`, 400)
	call("POST", path, `{"type":"remove_change","expectedRevision":"7","change":{"key":"add_equipment:edge-18"}}`, 409)
	call("POST", "/api/plans/nope/commands", `{"type":"remove_change","expectedRevision":"1","change":{"key":"add_equipment:edge-18"}}`, 404)
	w := call("POST", path, `{"type":"remove_change","expectedRevision":"1","change":{"key":"add_equipment:edge-18"}}`, 200)
	var out struct {
		Plan    planning.Plan `json:"plan"`
		Removed []string      `json:"removed"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Plan.Revision != "2" || len(out.Plan.Equipment)+len(out.Plan.Links) != 0 || strings.Join(out.Removed, ",") != "add_equipment:edge-18,add_cable:planned-cable-18" {
		t.Fatalf("response wrong: %s", w.Body.String())
	}
}

// RC-06 over HTTP: check is read-only and answers {stale, conflicts}.
func TestRC06CheckEndpointContractOverHTTP(t *testing.T) {
	s := acceptance.Installed()
	s.Revision = "rec-9"
	repo := &memoryRepo{installed: &s, plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1",
		Placements: []planning.PlacementInput{{EquipmentID: "gone", RackID: "rack-a03", Unit: 3}}}}
	call := newCaller(t, New(repo, "dev"))
	before, _ := json.Marshal(repo.plan)
	var out struct {
		Stale     bool                `json:"stale"`
		Conflicts []planning.Conflict `json:"conflicts"`
	}
	w := call("POST", "/api/plans/p/check", "", 200)
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || !out.Stale || len(out.Conflicts) != 1 || out.Conflicts[0].Change != "place_equipment:gone" {
		t.Fatalf("check body: %v %s", err, w.Body.String())
	}
	if after, _ := json.Marshal(repo.plan); string(before) != string(after) {
		t.Fatal("check changed the draft")
	}
	call("POST", "/api/plans/nope/check", "", 404)
	clean := &memoryRepo{plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1"}}
	if body := newCaller(t, New(clean, "dev"))("POST", "/api/plans/p/check", "", 200).Body.String(); !strings.Contains(body, `"conflicts":[]`) || !strings.Contains(body, `"stale":false`) {
		t.Fatalf("a clean draft: %s", body)
	}
	clean.plan.Status = "recorded"
	newCaller(t, New(clean, "dev"))("POST", "/api/plans/p/check", "", 409)
}

// RC-08 over HTTP: ?objectId= lists the recorded plans for the object; the
// plain list is unchanged.
func TestRC08PlansByObjectOverHTTP(t *testing.T) {
	repo := &memoryRepo{plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1",
		Sites: []topology.Site{{ID: "site-new", Name: "New"}}}}
	call := newCaller(t, New(repo, "dev"))
	call("GET", "/api/plans?objectId=", "", 400)
	if body := call("GET", "/api/plans?objectId=site-new", "", 200).Body.String(); strings.TrimSpace(body) != "[]" {
		t.Fatalf("a draft is not history: %s", body)
	}
	call("POST", "/api/plans/p/record", `{"expectedRevision":"1","note":"n","recordedBy":"Dana"}`, 200)
	var plans []planning.Plan
	if err := json.Unmarshal(call("GET", "/api/plans?objectId=site-new", "", 200).Body.Bytes(), &plans); err != nil || len(plans) != 1 || plans[0].RecordedBy != "Dana" {
		t.Fatalf("history: %v %+v", err, plans)
	}
	if body := call("GET", "/api/plans?objectId=other", "", 200).Body.String(); strings.TrimSpace(body) != "[]" {
		t.Fatalf("%s", body)
	}
	if err := json.Unmarshal(call("GET", "/api/plans", "", 200).Body.Bytes(), &plans); err != nil || len(plans) != 1 {
		t.Fatalf("the plain list is unchanged: %v", err)
	}
}

// Batch on the in-memory topology: the real planning code, IDs allocated here.
func (m *memoryRepo) Batch(_ context.Context, id string, c planning.Command) (planning.Plan, []string, error) {
	if id != m.plan.ID {
		return planning.Plan{}, nil, planning.ErrNotFound
	}
	var ids []string
	if c.Batch != nil {
		for _, inner := range c.Batch.Commands {
			made := ""
			if prefix := planning.IDPrefix(inner.Type); prefix != "" {
				m.n++
				made = fmt.Sprintf("%s%d", prefix, m.n)
			}
			ids = append(ids, made)
		}
	}
	next, err := planning.ExecuteBatch(m.base(), m.plan, c, ids)
	if err != nil {
		return planning.Plan{}, nil, err
	}
	m.plan = next
	return next, ids, nil
}

// BK-01 over HTTP: the batch answers {plan, ids}; a failing command is a 422 that
// names its position and changes nothing; the size and kind limits, 400 and 409.
func TestBK01BatchEndpointContractOverHTTP(t *testing.T) {
	repo := &memoryRepo{plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1"}}
	call := newCaller(t, New(repo, "dev"))
	path := "/api/plans/p/commands"
	good := `{"type":"batch","expectedRevision":"1","batch":{"commands":[
		{"type":"add_site","site":{"name":"Depot"}},
		{"type":"delete_equipment","target":{"id":"panel-dr"}},
		{"type":"add_cable","cable":{"a":"agg-15:p2","b":"edge-17:p4"}}]}}`
	var out struct {
		Plan planning.Plan `json:"plan"`
		IDs  []string      `json:"ids"`
	}
	w := call("POST", path, good, 200)
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Plan.Revision != "2" || len(out.IDs) != 3 || !strings.HasPrefix(out.IDs[0], "site-") || out.IDs[1] != "" || !strings.HasPrefix(out.IDs[2], "cable-") {
		t.Fatalf("response wrong: %s", w.Body.String())
	}
	if len(out.Plan.Sites) != 1 || out.Plan.Sites[0].ID != out.IDs[0] || out.Plan.Removals.Equipment[0] != "panel-dr" || out.Plan.Links[0].ID != out.IDs[2] {
		t.Fatalf("plan wrong: %+v", out.Plan)
	}
	// The bare plan is still what other commands answer.
	if body := call("POST", path, `{"type":"add_site","expectedRevision":"2","site":{"name":"Other"}}`, 200).Body.String(); strings.Contains(body, `"ids"`) {
		t.Fatalf("other commands answer the plan alone: %s", body)
	}

	before, _ := json.Marshal(repo.plan)
	rev := repo.plan.Revision
	body := func(commands string) string {
		return `{"type":"batch","expectedRevision":"` + rev + `","batch":{"commands":` + commands + `}}`
	}
	var many []string
	for i := 0; i < 501; i++ {
		many = append(many, fmt.Sprintf(`{"type":"add_site","site":{"name":"S%d"}}`, i))
	}
	for _, c := range []struct {
		name, body string
		status     int
	}{
		{"failing command names its position", body(`[{"type":"add_site","site":{"name":"Fine"}},{"type":"add_cable","cable":{"a":"agg-03:p1","b":"agg-15:p5"}}]`), 422},
		{"empty", body(`[]`), 422},
		{"501 commands (a body over 16 KB is fine)", body("[" + strings.Join(many, ",") + "]"), 422},
		{"nested batch", body(`[{"type":"batch","batch":{"commands":[]}}]`), 422},
		{"remove_change inside", body(`[{"type":"remove_change","change":{"key":"add_site:x"}}]`), 422},
		{"an inner expectedRevision", body(`[{"type":"add_site","expectedRevision":"1","site":{"name":"X"}}]`), 422},
		{"an unknown inner field", body(`[{"type":"add_site","site":{"name":"X"},"extra":1}]`), 400},
		{"stale revision", `{"type":"batch","expectedRevision":"99","batch":{"commands":[{"type":"add_site","site":{"name":"X"}}]}}`, 409},
		{"no batch payload", `{"type":"batch","expectedRevision":"` + rev + `"}`, 422},
	} {
		t.Run(c.name, func(t *testing.T) {
			w := call("POST", path, c.body, c.status)
			if c.name == "failing command names its position" && !strings.Contains(w.Body.String(), "command 2 (add_cable): AGG-03 · Port 1 is already cabled (cable-a04)") {
				t.Fatalf("message: %s", w.Body.String())
			}
			if after, _ := json.Marshal(repo.plan); string(after) != string(before) {
				t.Fatal("a failed batch changed the draft")
			}
		})
	}
	call("POST", "/api/plans/missing/commands", good, 404)
	repo.plan.Status = "recorded"
	call("POST", path, body(`[{"type":"add_site","site":{"name":"X"}}]`), 409)
}
