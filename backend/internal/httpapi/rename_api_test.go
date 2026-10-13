package httpapi

import (
	"encoding/json"
	"strings"
	"testing"

	"nettop.local/backend/internal/planning"
)

// rename_equipment over HTTP: 200 with the plan, renaming installed equipment
// is 422 in words, and a name on another command is refused like details are.
func TestRenameEquipmentContractOverHTTP(t *testing.T) {
	repo := &memoryRepo{plan: planning.Plan{ID: "p", BaseRevision: "acceptance-1", Revision: "1"}}
	call := newCaller(t, New(repo, "dev"))
	path := "/api/plans/p/commands"
	call("POST", path, `{"type":"add_equipment","expectedRevision":"1","equipment":{"name":"EDGE-30","kind":"switch","role":"access","networkId":"net-a","rackId":"rack-a03","unit":3,"height":1,"portCount":2}}`, 200)
	id := repo.plan.Equipment[0].ID

	w := call("POST", path, `{"type":"rename_equipment","expectedRevision":"2","target":{"id":"`+id+`"},"name":"EDGE-31"}`, 200)
	var got planning.Plan
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Renames) != 1 || got.Renames[0].Name != "EDGE-31" || !strings.Contains(w.Body.String(), `"renames":[{"id":"`+id+`","name":"EDGE-31"}]`) {
		t.Fatalf("renames missing from the plan: %s", w.Body.String())
	}
	snap := call("GET", "/api/topology?context=planned&planId=p", "", 200).Body.String()
	if !strings.Contains(snap, `"name":"EDGE-31"`) || strings.Contains(snap, `"name":"EDGE-30"`) {
		t.Fatal("the proposed topology does not carry the new name")
	}

	for _, c := range []struct{ name, body, message string }{
		{"installed", `{"type":"rename_equipment","expectedRevision":"3","target":{"id":"agg-03"},"name":"X"}`, "Installed equipment is renamed with a direct fix, not in a plan"},
		{"name on another command", `{"type":"add_site","expectedRevision":"3","site":{"name":"X"},"name":"Y"}`, "add_site takes its name inside its payload"},
	} {
		t.Run(c.name, func(t *testing.T) {
			before, _ := json.Marshal(repo.plan)
			w := call("POST", path, c.body, 422)
			if !strings.Contains(w.Body.String(), c.message) {
				t.Fatalf("body %s, want %q", w.Body.String(), c.message)
			}
			if after, _ := json.Marshal(repo.plan); string(before) != string(after) {
				t.Fatal("a refused command changed the draft")
			}
		})
	}
	call("POST", path, `{"type":"batch","expectedRevision":"3","batch":{"commands":[{"type":"rename_equipment","target":{"id":"`+id+`"},"name":"EDGE-32"}]}}`, 200)
	if repo.plan.Renames[0].Name != "EDGE-32" {
		t.Fatalf("batch rename: %+v", repo.plan.Renames)
	}
}
