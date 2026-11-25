package httpapi

import (
	"fmt"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/topology"
)

func TestFixManyOverHTTPAnswersEveryRowAndKeepsTheRevision(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	before := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200)).Revision
	got := decodeBody[fixAnswer](t, call("POST", "/api/installed/fixes", `{"note":" audit ","fixes":[
		{"kind":"equipment","id":"agg-03","details":{"manufacturer":"Cisco","model":"C9500"}},
		{"kind":"equipment","id":"agg-08","details":{"manufacturer":"Cisco"}},
		{"kind":"links","id":"cable-a01","details":{"label":"A01 patch"}},
		{"kind":"equipment","id":"agg-15","details":null}]}`, 200))
	if len(got.Changes) != 4 {
		t.Fatalf("changes = %+v", got.Changes)
	}
	for _, c := range got.Changes {
		if c.Note != "audit" || c.ID == 0 {
			t.Fatalf("change = %+v", c)
		}
	}
	if got.Changes[3].EntityKind != "link" || got.Changes[3].EntityID != "cable-a01" || got.Changes[3].NewValue != "A01 patch" {
		t.Fatalf("changes = %+v", got.Changes)
	}
	after := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200)).Revision
	if after != before {
		t.Fatalf("revision changed: %s -> %s", before, after)
	}
	log := decodeBody[[]fixes.Entry](t, call("GET", "/api/change-log?entityKind=equipment&entityId=agg-03", "", 200))
	if len(log) != 2 {
		t.Fatalf("log = %+v", log)
	}
	// The same again, and an empty detail set: nothing changes, [] answers.
	same := decodeBody[fixAnswer](t, call("POST", "/api/installed/fixes", `{"fixes":[{"kind":"equipment","id":"agg-03","details":{"manufacturer":"Cisco"}}]}`, 200))
	if same.Changes == nil || len(same.Changes) != 0 {
		t.Fatalf("no change must answer an empty list: %+v", same.Changes)
	}
}

func TestFixManyRefusalsNameThePositionAndWriteNothing(t *testing.T) {
	handler := handlerFor(t, acceptance.Installed())
	call := newCaller(t, handler)
	ok := `{"kind":"equipment","id":"agg-03","details":{"model":"M"}}`
	cases := []struct {
		name string
		body string
		code int
		want string
	}{
		{"no fixes", `{"fixes":[]}`, 422, "1–500"},
		{"fixes missing", `{}`, 422, "1–500"},
		{"501 fixes", `{"fixes":[` + strings.Repeat(ok+",", 500) + ok + `]}`, 422, "1–500"},
		{"note too long", `{"note":"` + strings.Repeat("n", 501) + `","fixes":[` + ok + `]}`, 422, "note"},
		{"unknown kind", `{"fixes":[` + ok + `,{"kind":"plans","id":"x","details":{}}]}`, 404, "fix 2"},
		{"missing kind", `{"fixes":[{"id":"x"}]}`, 404, "fix 1"},
		{"unknown object", `{"fixes":[` + ok + `,` + ok + `,{"kind":"equipment","id":"gone","details":{"model":"M"}}]}`, 404, "fix 3 (gone)"},
		{"topology field", `{"fixes":[` + ok + `,{"kind":"equipment","id":"agg-08","rackId":"rack-dr01"}]}`, 422, "fix 2: rackId changes the topology: use a plan"},
		{"a name", `{"fixes":[` + ok + `,{"kind":"equipment","id":"agg-08","name":"AGG-08B"}]}`, 422, "fix 2 (AGG-08)"},
		{"invalid value", `{"fixes":[` + ok + `,{"kind":"equipment","id":"agg-08","details":{"status":"broken"}}]}`, 422, "fix 2 (AGG-08)"},
		{"unknown field in a fix", `{"fixes":[{"kind":"equipment","id":"agg-03","colour":"red"}]}`, 400, ""},
		{"unknown detail", `{"fixes":[{"kind":"equipment","id":"agg-03","details":{"colour":"red"}}]}`, 400, ""},
		{"a note inside a fix", `{"fixes":[{"kind":"equipment","id":"agg-03","note":"x"}]}`, 400, ""},
		{"unknown top-level field", `{"fixes":[` + ok + `],"colour":"red"}`, 400, ""},
		{"malformed JSON", `not json`, 400, ""},
		{"a fix that is not an object", `{"fixes":[1]}`, 400, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			call := newCaller(t, handler)
			msg := errorOf(t, call("POST", "/api/installed/fixes", c.body, c.code))
			if !strings.Contains(msg, c.want) {
				t.Fatalf("message = %q, want it to contain %q", msg, c.want)
			}
		})
	}
	for _, id := range []string{"agg-03", "agg-08"} {
		log := decodeBody[[]fixes.Entry](t, call("GET", "/api/change-log?entityKind=equipment&entityId="+id, "", 200))
		if len(log) != 0 {
			t.Fatalf("a refused request must write nothing: %+v", log)
		}
	}
}

func TestFixManyAcceptsFiveHundred(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	var parts []string
	for i := 0; i < 500; i++ {
		parts = append(parts, fmt.Sprintf(`{"kind":"equipment","id":"agg-03","details":{"description":"d%d"}}`, i))
	}
	got := decodeBody[fixAnswer](t, call("POST", "/api/installed/fixes", `{"fixes":[`+strings.Join(parts, ",")+`]}`, 200))
	if len(got.Changes) != 500 {
		t.Fatalf("changes = %d", len(got.Changes))
	}
}

// D51: one request regroups all 52 ports of a switch (names, details and portGroup).
func TestFixManyRegroupsAll52PortsInOneRequest(t *testing.T) {
	base := acceptance.Installed()
	base.Equipment = append(base.Equipment, topology.Equipment{ID: "sw-52", Name: "SW-52", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 3, Height: 1})
	var parts []string
	for n := 1; n <= 52; n++ {
		base.Endpoints = append(base.Endpoints, topology.Endpoint{ID: fmt.Sprintf("sw-52:p%d", n), EquipmentID: "sw-52", Label: fmt.Sprintf("Port %d", n), Position: n, PortGroup: 1})
		group := 1
		if n > 48 {
			group = 2
		}
		parts = append(parts, fmt.Sprintf(`{"kind":"endpoints","id":"sw-52:p%d","portGroup":%d,"details":{"speed":"1G"}}`, n, group))
	}
	call := newCaller(t, handlerFor(t, base))
	before := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200)).Revision
	got := decodeBody[fixAnswer](t, call("POST", "/api/installed/fixes", `{"note":"Set model","fixes":[`+strings.Join(parts, ",")+`]}`, 200))
	if len(got.Changes) != 52+4 {
		t.Fatalf("changes = %d", len(got.Changes))
	}
	snap := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200))
	if snap.Revision != before {
		t.Fatal("revision changed")
	}
	groups := map[int]int{}
	for _, p := range snap.Endpoints {
		if p.EquipmentID == "sw-52" {
			groups[p.PortGroup]++
			if p.Position == 0 || p.Label == "" {
				t.Fatalf("port = %+v", p)
			}
		}
	}
	if groups[1] != 48 || groups[2] != 4 {
		t.Fatalf("groups = %v", groups)
	}
	log := decodeBody[[]fixes.Entry](t, call("GET", "/api/change-log?entityKind=endpoint&entityId=sw-52:p49", "", 200))
	if len(log) != 2 || (log[0].Field != "speed" && log[1].Field != "speed") {
		t.Fatalf("log = %+v", log)
	}
	// A group on a cable, and a group out of range, are 422.
	if msg := errorOf(t, call("POST", "/api/installed/fixes", `{"fixes":[{"kind":"links","id":"cable-a01","portGroup":2}]}`, 422)); !strings.Contains(msg, "port group") {
		t.Fatalf("message = %q", msg)
	}
	call("POST", "/api/installed/fixes", `{"fixes":[{"kind":"endpoints","id":"sw-52:p1","portGroup":9}]}`, 422)
	call("POST", "/api/installed/fixes", `{"fixes":[{"kind":"endpoints","id":"sw-52:p1","portGroup":"x"}]}`, 400)
	call("PATCH", "/api/installed/endpoints/sw-52:p1", `{"portGroup":3}`, 200)
}
