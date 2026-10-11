package httpapi

import (
	"encoding/json"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

// FD-02 over HTTP: an unknown field name is 400; a field that does not apply,
// an invalid value and an installed target are 422, in names; nothing changes.
func TestFD02DetailsContractOverHTTP(t *testing.T) {
	repo := &memoryRepo{plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1"}}
	call := newCaller(t, New(repo, "dev"))
	path := "/api/plans/p/commands"
	add := `{"type":"add_equipment","expectedRevision":"1","equipment":{"name":"EDGE-30","kind":"switch","role":"access","networkId":"net-a","rackId":"rack-a03","unit":3,"height":1,"portCount":2,"details":%s}}`
	for _, c := range []struct {
		name, body string
		status     int
		message    string
	}{
		{"unknown detail field", strings.Replace(add, "%s", `{"colour":"red"}`, 1), 400, "Invalid request JSON"},
		{"unknown field in update_details", `{"type":"update_details","expectedRevision":"1","target":{"id":"edge-17"},"details":{"colour":"red"}}`, 400, "Invalid request JSON"},
		{"field of another kind", strings.Replace(add, "%s", `{"rackType":"standard"}`, 1), 422, "rackType does not apply to equipment EDGE-30"},
		{"invalid value", strings.Replace(add, "%s", `{"status":"broken"}`, 1), 422, "EDGE-30: status must be active, inactive or maintenance, not"},
		{"installed object", `{"type":"update_details","expectedRevision":"1","target":{"id":"agg-03"},"details":{"model":"x"}}`, 422, "Installed details are changed with a direct fix (M5b step 12), not in a plan"},
		{"details on another command", `{"type":"add_site","expectedRevision":"1","site":{"name":"X"},"details":{"location":"x"}}`, 422, "add_site takes its details inside its payload"},
	} {
		t.Run(c.name, func(t *testing.T) {
			before, _ := json.Marshal(repo.plan)
			w := call("POST", path, c.body, c.status)
			if !strings.Contains(w.Body.String(), c.message) {
				t.Fatalf("body %s, want %q", w.Body.String(), c.message)
			}
			if after, _ := json.Marshal(repo.plan); string(before) != string(after) {
				t.Fatal("a refused command changed the draft")
			}
		})
	}
	// A good one: the fields come back on the plan and on the proposed snapshot, camelCase.
	call("POST", path, strings.Replace(add, "%s", `{"serialNumber":" SN-0042 ","ipAddress":"10.0.0.9","description":"core"}`, 1), 200)
	w := call("GET", "/api/topology?context=planned&planId=p", "", 200)
	var snap topology.Snapshot
	if err := json.Unmarshal(w.Body.Bytes(), &snap); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, e := range snap.Equipment {
		if e.Name == "EDGE-30" {
			found = e.SerialNumber == "SN-0042" && e.IPAddress == "10.0.0.9" && e.Description == "core"
		}
	}
	if !found || !strings.Contains(w.Body.String(), `"serialNumber":"SN-0042"`) {
		t.Fatalf("details missing from the snapshot: %s", w.Body.String()[:300])
	}
	// update_details on that new equipment, through a batch too.
	id := repo.plan.Equipment[0].ID
	call("POST", path, `{"type":"update_details","expectedRevision":"2","target":{"id":"`+id+`:p1"},"details":{"portType":"fiber","state":"reserved"}}`, 200)
	call("POST", path, `{"type":"batch","expectedRevision":"3","batch":{"commands":[{"type":"update_details","target":{"id":"`+id+`"},"details":{"model":"M-1"}}]}}`, 200)
	if len(repo.plan.Details) != 2 {
		t.Fatalf("details of the plan: %+v", repo.plan.Details)
	}
}

// FD-03 over HTTP: marking ports faulty or disabled changes no trace.
func TestFD03TraceIgnoresPortState(t *testing.T) {
	trace := func(repo *memoryRepo) string {
		call := newCaller(t, New(repo, "dev"))
		a := call("POST", "/api/traces?context=installed", `{"mode":"distribution","device":"edge-17"}`, 200).Body.String()
		b := call("POST", "/api/traces?context=installed", `{"mode":"point_to_point","start":"edge-17:p1","end":"agg-03:p1"}`, 200).Body.String()
		return a + b
	}
	want := trace(&memoryRepo{})
	marked := acceptance.Installed()
	for i := range marked.Endpoints {
		marked.Endpoints[i].State = []string{"faulty", "disabled"}[i%2]
	}
	if got := trace(&memoryRepo{installed: &marked}); got != want {
		t.Fatalf("port state changed a trace:\n%s\nvs\n%s", got, want)
	}
}
