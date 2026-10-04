package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

type caller func(method, path, body string, status int) *httptest.ResponseRecorder

func newCaller(t *testing.T, h http.Handler) caller {
	return func(method, path, body string, status int) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(method, path, strings.NewReader(body)))
		if w.Code != status {
			t.Fatalf("%s %s %s: got %d, want %d: %.300s", method, path, body, w.Code, status, w.Body.String())
		}
		return w
	}
}

func decodeResult(t *testing.T, w *httptest.ResponseRecorder) pathfinding.Result {
	t.Helper()
	var r pathfinding.Result
	if err := json.Unmarshal(w.Body.Bytes(), &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func destinations(r pathfinding.Result) []string {
	out := []string{}
	for _, route := range r.Routes {
		out = append(out, route.DestinationRole+" "+route.DestinationEquipmentID+"<-"+route.Start)
	}
	return out
}

// The distribution request/response contract over HTTP, including A05-style
// request validation. "aggregation" no longer exists.
func TestDistributionContractOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	w := call("POST", "/api/traces", `{"mode":"distribution","device":"edge-17"}`, 200)
	for _, field := range []string{`"mode":"distribution"`, `"mismatches":[]`, `"truncated":false`, `"destinationRole":"backbone"`, `"destinationEquipmentId":"bb-01"`, `"destinationNetworkId":"net-a"`, `"sourceNetworkId":"net-a"`, `"starts":[{"endpoint":"edge-17:p1","outcome":"reached"}`} {
		if !strings.Contains(w.Body.String(), field) {
			t.Fatalf("response lacks %s: %.400s", field, w.Body.String())
		}
	}
	r := decodeResult(t, w)
	if want := []string{"aggregation agg-03<-edge-17:p1", "aggregation agg-08<-edge-17:p2", "backbone bb-01<-edge-17:p3"}; !reflect.DeepEqual(destinations(r), want) || r.Status != "reached" || len(r.Starts) != 24 {
		t.Fatalf("routes = %v status %s starts %d", destinations(r), r.Status, len(r.Starts))
	}
	// An exact device port, and an exact passive HDF port (source network from the circuit).
	if r := decodeResult(t, call("POST", "/api/traces", `{"mode":"distribution","start":"edge-17:p3"}`, 200)); !reflect.DeepEqual(destinations(r), []string{"backbone bb-01<-edge-17:p3"}) {
		t.Fatalf("exact port: %v", destinations(r))
	}
	r = decodeResult(t, call("POST", "/api/traces", `{"mode":"distribution","start":"hdf-01:sp-3C:5:r"}`, 200))
	if len(r.Routes) != 1 || r.Routes[0].DestinationEquipmentID != "agg-03" || r.Routes[0].SourceNetworkID != "net-a" {
		t.Fatalf("passive start: %+v", r)
	}
	// An unreachable valid search is a result, not an HTTP error.
	if r := decodeResult(t, call("POST", "/api/traces", `{"mode":"distribution","device":"agg-15"}`, 200)); r.Status != "unreachable" || len(r.Routes) != 0 || !strings.Contains(r.Reason, "disconnected") {
		t.Fatalf("agg-15: %+v", r)
	}
	// Malformed, unknown fields, and extra JSON values are 400.
	for name, body := range map[string]string{
		"malformed":      `{"mode":"distribution",`,
		"unknown field":  `{"mode":"distribution","device":"edge-17","extra":1}`,
		"wrong type":     `{"mode":"distribution","device":7}`,
		"second object":  `{"mode":"distribution","device":"edge-17"}{"mode":"distribution","device":"edge-17"}`,
		"unknown member": `{"mode":"distribution","network":"net-a","device":"edge-17"}`,
	} {
		t.Run(name, func(t *testing.T) { call("POST", "/api/traces", body, 400) })
	}
	// Domain validation is 422 with a stable message.
	for body, message := range map[string]string{
		`{"mode":"distribution"}`: "distribution requires exactly one starting endpoint or device",
		`{"mode":"distribution","device":"edge-17","start":"edge-17:p1"}`:            "distribution requires exactly one starting endpoint or device",
		`{"mode":"distribution","device":"edge-17","end":"agg-03:p1"}`:               "distribution search takes a starting device or endpoint only",
		`{"mode":"distribution","device":"missing"}`:                                 "unknown starting device",
		`{"mode":"distribution","device":"hdf-01"}`:                                  "distribution search starts from an active device",
		`{"mode":"distribution","start":"missing"}`:                                  "unknown start endpoint",
		`{"mode":"aggregation","device":"edge-17"}`:                                  "mode must be point_to_point or distribution",
		`{"mode":"point_to_point","start":"edge-17:p1","end":"missing"}`:             "unknown destination endpoint",
		`{"mode":"point_to_point","device":"edge-17","start":"x","end":"agg-03:p1"}`: "point-to-point requires endpoints only",
	} {
		body, message := body, message
		t.Run(body, func(t *testing.T) {
			w := call("POST", "/api/traces", body, 422)
			if !strings.Contains(w.Body.String(), message) {
				t.Fatalf("body %s lacks %q", w.Body.String(), message)
			}
		})
	}
}

// P19: the planned context uses the same engine rules over the installed base
// plus a validated overlay; a proposal never appears in Installed.
func TestInstalledAndPlannedDistributionParity(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	var p planning.Plan
	if err := json.Unmarshal(call("POST", "/api/plans", `{"name":"Parity","expectedBaseRevision":"acceptance-1"}`, 201).Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	plannedPath := "/api/traces?context=planned&planId=" + p.ID
	requests := []string{
		`{"mode":"distribution","device":"edge-17"}`,
		`{"mode":"distribution","device":"edge-22"}`,
		`{"mode":"distribution","device":"agg-15"}`,
		`{"mode":"distribution","start":"hdf-01:sp-3C:5:r"}`,
		`{"mode":"distribution","start":"hdf-01:sp-3C:2:f"}`,
	}
	comparable := func(r pathfinding.Result) pathfinding.Result { r.Context, r.Revision = "", ""; return r }
	for _, body := range requests[:3] { // device searches
		installed, planned := decodeResult(t, call("POST", "/api/traces", body, 200)), decodeResult(t, call("POST", plannedPath, body, 200))
		if installed.Context != "installed" || planned.Context != "planned" || planned.Revision == installed.Revision {
			t.Fatalf("contexts/revisions: %s %s / %s %s", installed.Context, installed.Revision, planned.Context, planned.Revision)
		}
		if !reflect.DeepEqual(comparable(installed), comparable(planned)) {
			t.Fatalf("an empty plan must trace exactly like the installed topology for %s", body)
		}
	}
	for _, body := range requests[3:] { // passive starts
		if !reflect.DeepEqual(comparable(decodeResult(t, call("POST", "/api/traces", body, 200))), comparable(decodeResult(t, call("POST", plannedPath, body, 200)))) {
			t.Fatalf("passive start parity broken for %s", body)
		}
	}
	// Propose a cable from EDGE-17 to the otherwise unreachable AGG-15, and one to a Network B AGG.
	revision := "1"
	for _, c := range [][2]string{{"edge-17:p4", "agg-15:p1"}, {"edge-17:p5", "agg-12:p3"}} {
		var next planning.Plan
		body := fmt.Sprintf(`{"type":"add_cable","expectedRevision":%q,"cable":{"a":%q,"b":%q}}`, revision, c[0], c[1])
		if err := json.Unmarshal(call("POST", "/api/plans/"+p.ID+"/commands", body, 200).Body.Bytes(), &next); err != nil {
			t.Fatal(err)
		}
		revision = next.Revision
	}
	req := `{"mode":"distribution","device":"edge-17"}`
	planned, installed := decodeResult(t, call("POST", plannedPath, req, 200)), decodeResult(t, call("POST", "/api/traces", req, 200))
	if want := []string{"aggregation agg-03<-edge-17:p1", "aggregation agg-08<-edge-17:p2", "aggregation agg-15<-edge-17:p4", "backbone bb-01<-edge-17:p3"}; !reflect.DeepEqual(destinations(planned), want) {
		t.Fatalf("planned routes = %v, want %v", destinations(planned), want)
	}
	if len(planned.Mismatches) != 1 || planned.Mismatches[0].DestinationEquipmentID != "agg-12" || planned.Mismatches[0].SourceNetworkID != "net-a" || planned.Mismatches[0].DestinationNetworkID != "net-b" {
		t.Fatalf("planned mismatches = %+v", planned.Mismatches)
	}
	if len(installed.Routes) != 3 || len(installed.Mismatches) != 0 || strings.Contains(strings.Join(destinations(installed), " "), "agg-15") {
		t.Fatalf("the proposal leaked into Installed: %v", destinations(installed))
	}
}

// A01: a trace describes the revision it loaded, and a stale pin conflicts
// instead of showing edits the client has not seen.
func TestTraceRevisionPinning(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	var snap topology.Snapshot
	json.Unmarshal(call("GET", "/api/topology", "", 200).Body.Bytes(), &snap)
	req := `{"mode":"distribution","device":"edge-17"}`
	if r := decodeResult(t, call("POST", "/api/traces?expectedRevision="+snap.Revision, req, 200)); r.Revision != snap.Revision || r.Context != "installed" {
		t.Fatalf("installed result describes %s %s", r.Context, r.Revision)
	}
	call("POST", "/api/traces?expectedRevision=not-the-revision", req, 409)

	var p planning.Plan
	json.Unmarshal(call("POST", "/api/plans", `{"name":"Pins","expectedBaseRevision":"acceptance-1"}`, 201).Body.Bytes(), &p)
	planned := func() topology.Snapshot {
		var s topology.Snapshot
		json.Unmarshal(call("GET", "/api/topology?context=planned&planId="+p.ID, "", 200).Body.Bytes(), &s)
		return s
	}
	before := planned()
	path := "/api/traces?context=planned&planId=" + p.ID
	if r := decodeResult(t, call("POST", path+"&expectedRevision="+before.Revision, req, 200)); r.Revision != before.Revision || r.Context != "planned" || len(r.Routes) != 3 {
		t.Fatalf("planned result: %s %s %d routes", r.Context, r.Revision, len(r.Routes))
	}
	// Another writer edits the draft after the client loaded `before`.
	call("POST", "/api/plans/"+p.ID+"/commands", `{"type":"add_cable","expectedRevision":"1","cable":{"a":"edge-17:p4","b":"agg-15:p1"}}`, 200)
	if w := call("POST", path+"&expectedRevision="+url(before.Revision), req, 409); strings.Contains(w.Body.String(), "routes") {
		t.Fatalf("a conflict must not carry a trace result: %s", w.Body.String())
	}
	after := planned()
	if after.Revision == before.Revision {
		t.Fatal("the draft revision did not change")
	}
	if r := decodeResult(t, call("POST", path+"&expectedRevision="+url(after.Revision), req, 200)); r.Revision != after.Revision || len(r.Routes) != 4 {
		t.Fatalf("a current pin must see the new route: %s %d", r.Revision, len(r.Routes))
	}
	// Unpinned, the result still describes exactly the revision it loaded.
	if r := decodeResult(t, call("POST", path, req, 200)); r.Revision != after.Revision {
		t.Fatalf("unpinned result describes %s, loaded %s", r.Revision, after.Revision)
	}
}

// url escapes the "/" and "@" in planned revisions for a query string.
func url(revision string) string {
	return strings.NewReplacer("/", "%2F", "@", "%40").Replace(revision)
}
