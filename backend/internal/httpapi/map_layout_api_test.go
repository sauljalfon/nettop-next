package httpapi

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/topology"
)

// CM-01 over HTTP: a saved position is returned by the next read; reset gives 204.
func TestCM01MapLayoutRoundTripOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	empty := decodeBody[topology.MapLayout](t, call("GET", "/api/map-layout", "", 200))
	if empty.Positions == nil || len(empty.Positions) != 0 {
		t.Fatalf("an unsaved map has an empty list: %+v", empty)
	}
	w := call("PUT", "/api/map-layout/nodes/node-north-sub-main", `{"x":120.5,"y":-3}`, 200)
	if got := decodeBody[topology.NodePosition](t, w); got != (topology.NodePosition{NodeID: "node-north-sub-main", X: 120.5, Y: -3}) {
		t.Fatalf("PUT echoes the saved position: %+v", got)
	}
	call("PUT", "/api/map-layout/nodes/node-north-sub-main", `{"x":1,"y":2}`, 200) // last write wins
	got := decodeBody[topology.MapLayout](t, call("GET", "/api/map-layout", "", 200))
	if want := []topology.NodePosition{{NodeID: "node-north-sub-main", X: 1, Y: 2}}; !reflect.DeepEqual(got.Positions, want) {
		t.Fatalf("got %+v, want %+v", got.Positions, want)
	}
	site := decodeBody[topology.SiteLayout](t, call("GET", "/api/sites/site-main-campus/layout", "", 200))
	if len(site.Positions) != 0 {
		t.Fatalf("the site screen is separate: %+v", site)
	}
	if w = call("DELETE", "/api/map-layout", "", 204); w.Body.Len() != 0 {
		t.Fatalf("204 has no body: %q", w.Body.String())
	}
	if got = decodeBody[topology.MapLayout](t, call("GET", "/api/map-layout", "", 200)); len(got.Positions) != 0 {
		t.Fatalf("not reset: %+v", got)
	}
	call("DELETE", "/api/map-layout", "", 204) // empty reset is fine
}

// CM-01 over HTTP: documented statuses, nothing persisted.
func TestCM01MapLayoutRejectionsOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	node := "/api/map-layout/nodes/node-north-sub-main"
	if msg := errorOf(t, call("PUT", "/api/map-layout/nodes/node-gone", `{"x":1,"y":1}`, 404)); !strings.Contains(msg, "Node not found") {
		t.Errorf("unknown node: %q", msg)
	}
	for name, body := range map[string]string{
		"missing y":      `{"x":1}`,
		"missing both":   `{}`,
		"x not a number": `{"x":"5","y":1}`,
		"null":           `{"x":null,"y":1}`,
		"overflow":       `{"x":1e999,"y":1}`,
		"above range":    `{"x":1000001,"y":0}`,
		"below range":    `{"x":0,"y":-1000001}`,
	} {
		if msg := errorOf(t, call("PUT", node, body, 422)); name != "above range" && name != "below range" && !strings.Contains(msg, "x and y are required finite numbers") {
			t.Errorf("%s: %q", name, msg)
		}
	}
	call("PUT", node, `{"x":1,"y":1,"z":1}`, 400)
	call("PUT", node, `{"x":1,"y":`, 400)
	call("PUT", node, `{"x":1,"y":1} {}`, 400)
	call("PUT", node, `{"x":1000000,"y":-1000000}`, 200)
	got := decodeBody[topology.MapLayout](t, call("GET", "/api/map-layout", "", 200))
	if !reflect.DeepEqual(got.Positions, []topology.NodePosition{{NodeID: "node-north-sub-main", X: 1_000_000, Y: -1_000_000}}) {
		t.Fatalf("rejected requests persisted something: %+v", got)
	}
}

// CM-01: no map write changes a topology revision or a plan.
func TestCM01MapLayoutWritesKeepRevisionsOverHTTP(t *testing.T) {
	call := newCaller(t, handlerFor(t, acceptance.Installed()))
	before := string(call("GET", "/api/topology?context=installed", "", 200).Body.Bytes()) + string(call("GET", "/api/plans", "", 200).Body.Bytes())
	call("PUT", "/api/map-layout/nodes/node-building-a", `{"x":5,"y":6}`, 200)
	call("DELETE", "/api/map-layout", "", 204)
	after := string(call("GET", "/api/topology?context=installed", "", 200).Body.Bytes()) + string(call("GET", "/api/plans", "", 200).Body.Bytes())
	if before != after {
		t.Fatal("topology or plans changed")
	}
}

type mapFake struct {
	Repository
	err    error
	nodeID string
	x, y   float64
}

func (f *mapFake) MapLayout(context.Context) (topology.MapLayout, error) {
	return topology.MapLayout{Positions: []topology.NodePosition{}}, f.err
}
func (f *mapFake) SaveMapPosition(_ context.Context, node string, x, y float64) error {
	f.nodeID, f.x, f.y = node, x, y
	return f.err
}
func (f *mapFake) ResetMapLayout(context.Context) error { return f.err }

func TestCM01MapHandlersMapRepositoryErrorsWithoutADatabase(t *testing.T) {
	f := &mapFake{}
	call := newCaller(t, New(f, "dev"))
	call("PUT", "/api/map-layout/nodes/n1", `{"x":1.5,"y":-2}`, 200)
	if f.nodeID != "n1" || f.x != 1.5 || f.y != -2 {
		t.Fatalf("handler passed %+v", f)
	}
	for _, c := range []struct {
		err    error
		status int
	}{
		{fmt.Errorf("%w: n", topology.ErrNodeNotFound), 404},
		{fmt.Errorf("%w: bad", topology.ErrInvalidInput), 422},
		{fmt.Errorf("connection reset"), 500},
	} {
		f.err = c.err
		call("GET", "/api/map-layout", "", c.status)
		call("PUT", "/api/map-layout/nodes/n1", `{"x":1,"y":1}`, c.status)
		call("DELETE", "/api/map-layout", "", c.status)
	}
}
