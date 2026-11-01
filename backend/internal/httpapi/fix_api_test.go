package httpapi

import (
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/topology"
)

type fixAnswer struct {
	Changes []fixes.Entry `json:"changes"`
}

func TestFixRenamesOverHTTPWithoutChangingTheRevision(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	before := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200)).Revision
	got := decodeBody[fixAnswer](t, call("PATCH", "/api/installed/equipment/agg-03", `{"name":"AGG-03A","note":"new label"}`, 200))
	if len(got.Changes) != 1 || got.Changes[0].Field != "name" || got.Changes[0].NewValue != "AGG-03A" || got.Changes[0].EntityKind != "equipment" {
		t.Fatalf("changes = %+v", got.Changes)
	}
	after := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200))
	if after.Revision != before {
		t.Fatalf("revision changed: %s -> %s", before, after.Revision)
	}
	same := decodeBody[fixAnswer](t, call("PATCH", "/api/installed/equipment/agg-03", `{"name":"AGG-03A"}`, 200))
	if same.Changes == nil || len(same.Changes) != 0 {
		t.Fatalf("no change must answer an empty list: %+v", same.Changes)
	}
}

// FX-02: topology fields are rejected; nothing is written.
func TestFX02TopologyFieldsAndBadInputAreRejected(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	for _, body := range []string{`{"rackId":"rack-dr01"}`, `{"unit":3}`, `{"networkId":"net-b","name":"X"}`, `{"role":"backbone"}`} {
		msg := errorOf(t, call("PATCH", "/api/installed/equipment/agg-03", body, 422))
		if !strings.Contains(msg, "changes the topology: use a plan") {
			t.Errorf("%s: %q", body, msg)
		}
	}
	call("PATCH", "/api/installed/equipment/agg-03", `{"colour":"red"}`, 400)
	call("PATCH", "/api/installed/equipment/agg-03", `{"details":{"colour":"red"}}`, 400)
	call("PATCH", "/api/installed/equipment/agg-03", `not json`, 400)
	call("PATCH", "/api/installed/equipment/gone", `{"name":"X"}`, 404)
	call("PATCH", "/api/installed/plans/expansion", `{"name":"X"}`, 404)
	call("PATCH", "/api/installed/equipment/agg-03", `{"name":"AGG-08"}`, 409)
	call("PATCH", "/api/installed/equipment/agg-03", `{"details":{"status":"broken"}}`, 422)
	call("PATCH", "/api/installed/equipment/agg-03", `{"details":{"rackType":"standard"}}`, 422)
	call("PATCH", "/api/installed/endpoints/panel-a:4:f", `{"name":"X"}`, 422)
	call("PATCH", "/api/installed/equipment/agg-03", `{"name":"AGG-03A","note":"`+strings.Repeat("n", 501)+`"}`, 422)
	log := decodeBody[[]fixes.Entry](t, call("GET", "/api/change-log?entityKind=equipment&entityId=agg-03", "", 200))
	if len(log) != 0 {
		t.Fatalf("a refused fix must write nothing: %+v", log)
	}
}

// FX-03: history lists the changes, newest first.
func TestFX03HistoryOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	call("PATCH", "/api/installed/links/cable-a01", `{"details":{"label":"A01 patch"}}`, 200)
	call("PATCH", "/api/installed/links/cable-a01", `{"details":{"status":"testing"},"note":"fluke test"}`, 200)
	log := decodeBody[[]fixes.Entry](t, call("GET", "/api/change-log?entityKind=link&entityId=cable-a01", "", 200))
	if len(log) != 2 || log[0].Field != "status" || log[0].Note != "fluke test" || log[1].Field != "label" {
		t.Fatalf("log = %+v", log)
	}
	call("GET", "/api/change-log?entityId=cable-a01", "", 400)
	call("GET", "/api/change-log?entityKind=link", "", 400)
}

// Review fix 1 and 2: the answer never depends on map order, and null means "not given".
func TestFixAnswersAreDeterministicAndNullMeansNotGiven(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	for i := 0; i < 25; i++ {
		msg := errorOf(t, call("PATCH", "/api/installed/equipment/agg-03", `{"zeta":1,"unit":3,"colour":"red","rackId":"rack-dr01"}`, 422))
		if msg != "rackId changes the topology: use a plan" {
			t.Fatalf("try %d: %q", i, msg)
		}
	}
	got := decodeBody[fixAnswer](t, call("PATCH", "/api/installed/equipment/agg-03", `{"name":null,"details":null,"note":null}`, 200))
	if got.Changes == nil || len(got.Changes) != 0 {
		t.Fatalf("null fields must change nothing: %+v", got.Changes)
	}
}

// RI-06: the type of an installed rack item is fixed over PATCH.
func TestRI06FixRackItemTypeOverHTTP(t *testing.T) {
	base := acceptance.Installed()
	base.Equipment = append(base.Equipment, topology.Equipment{ID: "ri", Name: "Shelf 1", Kind: "rack_item", Role: "none", RackID: "rack-a03", Unit: 1, Height: 1, ItemType: "shelf"})
	call := newCaller(t, handlerFor(t, base))
	got := decodeBody[fixAnswer](t, call("PATCH", "/api/installed/equipment/ri", `{"details":{"itemType":"other","itemText":"KVM switch"}}`, 200))
	if len(got.Changes) != 2 || got.Changes[0].Field != "itemType" || got.Changes[1].NewValue != "KVM switch" {
		t.Fatalf("changes = %+v", got.Changes)
	}
	call("PATCH", "/api/installed/equipment/ri", `{"details":{"itemType":"ups"}}`, 422)
	call("PATCH", "/api/installed/equipment/agg-03", `{"details":{"itemType":"ups"}}`, 422)
}
