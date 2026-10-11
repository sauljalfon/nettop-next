package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/persistence"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/sample"
	"nettop.local/backend/internal/topology"
)

func seededHandler(t *testing.T) http.Handler {
	t.Helper()
	return handlerFor(t, sample.Installed(), sample.Expansion())
}

// handlerFor serves a fresh isolated PostgreSQL schema seeded with base and any plans.
func handlerFor(t *testing.T, base topology.Snapshot, plans ...planning.Plan) http.Handler {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires TEST_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	schema := fmt.Sprintf("api_seeded_%d", time.Now().UnixNano())
	if _, err = pool.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pool.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE") })
	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	store, err := persistence.Open(ctx, url+sep+"search_path="+schema)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Close)
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = store.Seed(ctx, base, plans...); err != nil {
		t.Fatal(err)
	}
	return New(store, "dev")
}

// A05 plus the end-to-end add_hdf contract.
func TestAddHDFCommandContractOverHTTP(t *testing.T) {
	h := seededHandler(t)
	call := func(method, path, body string, status int) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(method, path, strings.NewReader(body)))
		if w.Code != status {
			t.Fatalf("%s %s %s: got %d, want %d: %.300s", method, path, body, w.Code, status, w.Body.String())
		}
		return w
	}
	var p planning.Plan
	if err := json.Unmarshal(call("POST", "/api/plans", `{"name":"HDF","expectedBaseRevision":"sample-1"}`, 201).Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	path := "/api/plans/" + p.ID + "/commands"
	good := `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"HDF-NEW","rackId":"rack-03","unit":3,"height":3,"rows":4}}`
	// A05: malformed JSON, unknown fields, wrong types, extra JSON values → 400.
	for name, body := range map[string]string{
		"malformed":             `{"type":"add_hdf",`,
		"unknown top-level":     `{"type":"add_hdf","expectedRevision":"1","extra":1}`,
		"unknown payload field": `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"H","rackId":"rack-03","unit":3,"height":3,"rows":4,"ports":24}}`,
		"rows as string":        `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"H","rackId":"rack-03","unit":3,"height":3,"rows":"4"}}`,
		"fractional rows":       `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"H","rackId":"rack-03","unit":3,"height":3,"rows":1.5}}`,
		"second JSON object":    good + `{"type":"add_cable"}`,
		"trailing garbage":      good + ` x`,
		"payload is not object": `{"type":"add_hdf","expectedRevision":"1","hdf":[1]}`,
		"oversized request body (over 1 MB, the limit for commands so a batch fits)": `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"` + strings.Repeat("x", 1<<20+1) + `"}}`,
	} {
		t.Run(name, func(t *testing.T) { call("POST", path, body, 400) })
	}
	// Domain validation → 422, with the draft untouched.
	for name, body := range map[string]string{
		"zero rows":                `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"H","rackId":"rack-03","unit":3,"height":3,"rows":0}}`,
		"33 rows":                  `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"H","rackId":"rack-03","unit":3,"height":3,"rows":33}}`,
		"missing rows":             `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"H","rackId":"rack-03","unit":3,"height":3}}`,
		"missing payload":          `{"type":"add_hdf","expectedRevision":"1"}`,
		"mixed payload":            `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"H","rackId":"rack-03","unit":3,"height":3,"rows":1},"cable":{"a":"x","b":"y"}}`,
		"rack collision":           `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"H","rackId":"rack-03","unit":7,"height":2,"rows":1}}`,
		"unknown rack":             `{"type":"add_hdf","expectedRevision":"1","hdf":{"name":"H","rackId":"nope","unit":3,"height":3,"rows":1}}`,
		"payload on wrong command": `{"type":"add_cable","expectedRevision":"1","hdf":{"name":"H","rackId":"rack-03","unit":3,"height":3,"rows":1}}`,
	} {
		t.Run(name, func(t *testing.T) {
			call("POST", path, body, 422)
			var cur planning.Plan
			json.Unmarshal(call("GET", "/api/plans/"+p.ID, "", 200).Body.Bytes(), &cur)
			if cur.Revision != "1" || len(cur.Equipment) != 0 || len(cur.Subpanels) != 0 {
				t.Fatalf("a rejected command changed the draft: %+v", cur)
			}
		})
	}
	// Success: one atomic revision, complete grid in the response and the overlay.
	if err := json.Unmarshal(call("POST", path, good, 200).Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	if p.Revision != "2" || len(p.Subpanels) != 16 || len(p.Endpoints) != 192 || len(p.Links) != 96 {
		t.Fatalf("unexpected plan: rev=%s %d/%d/%d", p.Revision, len(p.Subpanels), len(p.Endpoints), len(p.Links))
	}
	call("POST", path, good, 409) // stale revision conflicts, never replays
	w := call("GET", "/api/plans/"+p.ID, "", 200)
	if !strings.Contains(w.Body.String(), `"subpanels":[{"id":`) {
		t.Fatal("plan JSON lacks subpanels")
	}
	var planned, installed topology.Snapshot
	json.Unmarshal(call("GET", "/api/topology?context=planned&planId="+p.ID, "", 200).Body.Bytes(), &planned)
	json.Unmarshal(call("GET", "/api/topology", "", 200).Body.Bytes(), &installed)
	if len(planned.Subpanels) != 16 || len(installed.Subpanels) != 0 {
		t.Fatalf("planned/installed separation broken: %d/%d", len(planned.Subpanels), len(installed.Subpanels))
	}
	// Cable through exact structured positions and trace it.
	find := func(row int, column string, position int, side string) string {
		var sp string
		for _, s := range p.Subpanels {
			if s.Row == row && s.Column == column {
				sp = s.ID
			}
		}
		for _, e := range p.Endpoints {
			if e.SubpanelID == sp && e.Position == position && e.Side == side {
				return e.ID
			}
		}
		t.Fatal("endpoint not found")
		return ""
	}
	cable := func(a, b string, revision string) {
		call("POST", path, fmt.Sprintf(`{"type":"add_cable","expectedRevision":%q,"cable":{"a":%q,"b":%q}}`, revision, a, b), 200)
	}
	cable("edge-01:p2", find(3, "C", 5, "front"), "2")
	cable(find(3, "C", 5, "rear"), "agg-02:p2", "3")
	var result pathfinding.Result
	json.Unmarshal(call("POST", "/api/traces?context=planned&planId="+p.ID, `{"mode":"distribution","start":"edge-01:p2"}`, 200).Body.Bytes(), &result)
	if len(result.Routes) != 1 || len(result.Routes[0].Hops) != 3 || result.Routes[0].Hops[1].Kind != "internal" {
		t.Fatalf("proposed HDF route wrong: %+v", result)
	}
}
