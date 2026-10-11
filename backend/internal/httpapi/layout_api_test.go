package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/topology"
)

func decodeBody[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("%v: %s", err, w.Body.String())
	}
	return v
}

func errorOf(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	return decodeBody[map[string]string](t, w)["error"]
}

// PHY-14 over HTTP: a saved position is returned by the next read.
func TestPHY14LayoutRoundTripOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	empty := decodeBody[topology.SiteLayout](t, call("GET", "/api/sites/site-main-campus/layout", "", 200))
	if empty.SiteID != "site-main-campus" || empty.Positions == nil || len(empty.Positions) != 0 {
		t.Fatalf("an unsaved site has an empty list: %+v", empty)
	}
	w := call("PUT", "/api/sites/site-main-campus/layout/nodes/node-north-sub-main", `{"x":120.5,"y":-3}`, 200)
	if got := decodeBody[topology.NodePosition](t, w); got != (topology.NodePosition{NodeID: "node-north-sub-main", X: 120.5, Y: -3}) {
		t.Fatalf("PUT echoes the saved position: %+v", got)
	}
	call("PUT", "/api/sites/site-main-campus/layout/nodes/node-north-sub-main", `{"x":1,"y":2}`, 200) // last write wins
	got := decodeBody[topology.SiteLayout](t, call("GET", "/api/sites/site-main-campus/layout", "", 200))
	want := []topology.NodePosition{{NodeID: "node-north-sub-main", X: 1, Y: 2}}
	if !reflect.DeepEqual(got.Positions, want) {
		t.Fatalf("got %+v, want %+v", got.Positions, want)
	}
	if other := decodeBody[topology.SiteLayout](t, call("GET", "/api/sites/site-dr/layout", "", 200)); len(other.Positions) != 0 {
		t.Fatalf("another site is unaffected: %+v", other)
	}
}

// PHY-15 over HTTP: documented statuses, nothing persisted.
func TestPHY15LayoutRejectionsOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	node := "/api/sites/site-main-campus/layout/nodes/node-north-sub-main"
	for _, c := range []struct{ method, path, body string }{
		{"GET", "/api/sites/site-gone/layout", ""},
		{"PUT", "/api/sites/site-gone/layout/nodes/node-north-sub-main", `{"x":1,"y":1}`},
		{"DELETE", "/api/sites/site-gone/layout", ""},
	} {
		if msg := errorOf(t, call(c.method, c.path, c.body, 404)); !strings.Contains(msg, "Site not found") {
			t.Errorf("%s %s: %q", c.method, c.path, msg)
		}
	}
	for name, c := range map[string]struct{ path, body string }{
		"node of another site": {"/api/sites/site-main-campus/layout/nodes/node-dr-access", `{"x":1,"y":1}`},
		"unknown node":         {"/api/sites/site-main-campus/layout/nodes/node-gone", `{"x":1,"y":1}`},
		"missing y":            {node, `{"x":1}`},
		"missing both":         {node, `{}`},
		"x not a number":       {node, `{"x":"5","y":1}`},
		"null":                 {node, `{"x":null,"y":1}`},
		"overflow":             {node, `{"x":1e999,"y":1}`},
		"above range":          {node, `{"x":1000001,"y":0}`},
		"below range":          {node, `{"x":0,"y":-1000001}`},
	} {
		call("PUT", c.path, c.body, 422)
		_ = name
	}
	call("PUT", node, `{"x":1,"y":1,"z":1}`, 400)
	call("PUT", node, `{"x":1,"y":`, 400)
	call("PUT", node, `{"x":1,"y":1} {}`, 400)
	call("PUT", node, `{"x":1000000,"y":-1000000}`, 200)
	got := decodeBody[topology.SiteLayout](t, call("GET", "/api/sites/site-main-campus/layout", "", 200))
	if !reflect.DeepEqual(got.Positions, []topology.NodePosition{{NodeID: "node-north-sub-main", X: 1_000_000, Y: -1_000_000}}) {
		t.Fatalf("rejected requests persisted something: %+v", got)
	}
}

// PHY-16 over HTTP: no revision or plan changes.
func TestPHY16LayoutAndNetworkWritesKeepRevisionsAndPlansOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	plan := string(call("POST", "/api/plans", `{"name":"Draft","expectedBaseRevision":"acceptance-1"}`, 201).Body.Bytes())
	var p struct{ ID string }
	_ = json.Unmarshal([]byte(plan), &p)
	revisions := func() [3]string {
		installed := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200))
		planned := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=planned&planId="+p.ID, "", 200))
		return [3]string{installed.Revision, planned.Revision, string(call("GET", "/api/plans", "", 200).Body.Bytes())}
	}
	before := revisions()
	call("PUT", "/api/sites/site-main-campus/layout/nodes/node-building-a", `{"x":5,"y":6}`, 200)
	call("DELETE", "/api/sites/site-main-campus/layout", "", 204)
	created := decodeBody[topology.Network](t, call("POST", "/api/networks", `{"name":"Network C"}`, 201))
	call("PATCH", "/api/networks/"+created.ID, `{"name":"Network Z"}`, 200)
	if after := revisions(); after != before {
		t.Fatalf("revisions or plans changed:\n%v\n%v", before, after)
	}
	// An older pinned trace revision still matches.
	call("POST", "/api/traces?expectedRevision=acceptance-1", `{"mode":"distribution","device":"edge-17"}`, 200)
}

// PHY-17 over HTTP.
func TestPHY17ResetOverHTTPRemovesOnlyThatSite(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	call("PUT", "/api/sites/site-main-campus/layout/nodes/node-building-a", `{"x":5,"y":6}`, 200)
	call("PUT", "/api/sites/site-dr/layout/nodes/node-dr-access", `{"x":7,"y":8}`, 200)
	if w := call("DELETE", "/api/sites/site-main-campus/layout", "", 204); w.Body.Len() != 0 {
		t.Fatalf("204 has no body: %q", w.Body.String())
	}
	if got := decodeBody[topology.SiteLayout](t, call("GET", "/api/sites/site-main-campus/layout", "", 200)); len(got.Positions) != 0 {
		t.Fatalf("not reset: %+v", got)
	}
	if got := decodeBody[topology.SiteLayout](t, call("GET", "/api/sites/site-dr/layout", "", 200)); len(got.Positions) != 1 {
		t.Fatalf("DR lost its position: %+v", got)
	}
}

func TestNET01CreateNetworkOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	created := decodeBody[topology.Network](t, call("POST", "/api/networks", `{"name":" Network C "}`, 201))
	if created.Name != "Network C" || !strings.HasPrefix(created.ID, "network-") {
		t.Fatalf("%+v", created)
	}
	s := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200))
	ids := []string{}
	for _, n := range s.Networks {
		ids = append(ids, n.ID)
	}
	if !reflect.DeepEqual(ids, []string{"net-a", "net-b", created.ID}) {
		t.Fatalf("snapshot networks in creation order: %v", ids)
	}
}

func TestNET02RenameNetworkOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	got := decodeBody[topology.Network](t, call("PATCH", "/api/networks/net-a", `{"name":"Campus A"}`, 200))
	if got != (topology.Network{ID: "net-a", Name: "Campus A"}) {
		t.Fatalf("%+v", got)
	}
	s := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200))
	if s.Networks[0] != (topology.Network{ID: "net-a", Name: "Campus A"}) || s.Networks[1].ID != "net-b" {
		t.Fatalf("%+v", s.Networks)
	}
	for _, e := range s.Equipment {
		if e.ID == "edge-17" && e.NetworkID != "net-a" {
			t.Fatalf("membership changed: %+v", e)
		}
	}
}

func TestNET03NetworkRejectionsOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	long := fmt.Sprintf(`{"name":%q}`, strings.Repeat("x", 65))
	for _, c := range []struct {
		method, path, body string
		status             int
	}{
		{"POST", "/api/networks", `{"name":""}`, 422},
		{"POST", "/api/networks", `{"name":"   "}`, 422},
		{"POST", "/api/networks", `{}`, 422},
		{"POST", "/api/networks", long, 422},
		{"POST", "/api/networks", `{"name":"network A"}`, 409},
		{"POST", "/api/networks", `{"name":"Network C","color":"red"}`, 400},
		{"POST", "/api/networks", `not json`, 400},
		{"PATCH", "/api/networks/net-b", `{"name":" NETWORK a "}`, 409},
		{"PATCH", "/api/networks/net-b", `{"name":""}`, 422},
		{"PATCH", "/api/networks/net-b", long, 422},
		{"PATCH", "/api/networks/net-b", `{"name":"B","id":"x"}`, 400},
		{"PATCH", "/api/networks/net-gone", `{"name":"Whatever"}`, 404},
	} {
		w := call(c.method, c.path, c.body, c.status)
		if msg := errorOf(t, w); msg == "" {
			t.Errorf("%s %s %s: no error message", c.method, c.path, c.body)
		}
	}
	s := decodeBody[topology.Snapshot](t, call("GET", "/api/topology?context=installed", "", 200))
	if len(s.Networks) != 2 || s.Networks[0].Name != "Network A" || s.Networks[1].Name != "Network B" {
		t.Fatalf("rejected requests changed networks: %+v", s.Networks)
	}
	// Delete is not part of this API.
	call("DELETE", "/api/networks/net-a", "", 405)
}

// layoutFake records what the handlers pass to the repository.
type layoutFake struct {
	Repository
	err                  error
	siteID, nodeID, name string
	x, y                 float64
}

func (f *layoutFake) SiteLayout(_ context.Context, site string) (topology.SiteLayout, error) {
	f.siteID = site
	return topology.SiteLayout{SiteID: site, Positions: []topology.NodePosition{}}, f.err
}
func (f *layoutFake) SaveNodePosition(_ context.Context, site, node string, x, y float64) error {
	f.siteID, f.nodeID, f.x, f.y = site, node, x, y
	return f.err
}
func (f *layoutFake) ResetSiteLayout(_ context.Context, site string) error {
	f.siteID = site
	return f.err
}
func (f *layoutFake) CreateNetwork(_ context.Context, name string) (topology.Network, error) {
	f.name = name
	return topology.Network{ID: "network-x", Name: name}, f.err
}
func (f *layoutFake) RenameNetwork(_ context.Context, id, name string) (topology.Network, error) {
	f.nodeID, f.name = id, name
	return topology.Network{ID: id, Name: name}, f.err
}

func TestLayoutAndNetworkHandlersMapRepositoryErrorsWithoutADatabase(t *testing.T) {
	f := &layoutFake{}
	call := newCaller(t, New(f, "dev"))
	call("PUT", "/api/sites/s1/layout/nodes/n1", `{"x":1.5,"y":-2}`, 200)
	if f.siteID != "s1" || f.nodeID != "n1" || f.x != 1.5 || f.y != -2 {
		t.Fatalf("handler passed %+v", f)
	}
	call("PATCH", "/api/networks/n9", `{"name":"  X "}`, 200)
	if f.nodeID != "n9" || f.name != "  X " && f.name != "X" {
		t.Fatalf("handler passed %+v", f)
	}
	for _, c := range []struct {
		err    error
		status int
	}{
		{fmt.Errorf("%w: s", topology.ErrSiteNotFound), 404},
		{fmt.Errorf("%w: n", topology.ErrNetworkNotFound), 404},
		{fmt.Errorf("%w: dup", topology.ErrDuplicateName), 409},
		{fmt.Errorf("%w: bad", topology.ErrInvalidInput), 422},
		{fmt.Errorf("connection reset"), 500},
	} {
		f.err = c.err
		call("PUT", "/api/sites/s1/layout/nodes/n1", `{"x":1,"y":1}`, c.status)
		call("POST", "/api/networks", `{"name":"N"}`, c.status)
	}
	var _ http.Handler = New(f, "dev")
}
