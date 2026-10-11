package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/sample"
	"nettop.local/backend/internal/topology"
	"strings"
	"testing"
)

type fixture struct{ Repository }

func (fixture) Ping(context.Context) error { return nil }
func (fixture) Snapshot(_ context.Context, id string) (topology.Snapshot, error) {
	if id == "" {
		return sample.Installed(), nil
	}
	if id != "expansion" {
		return topology.Snapshot{}, planning.ErrNotFound
	}
	return planning.Apply(sample.Installed(), sample.Expansion())
}

func TestAPI(t *testing.T) {
	h := New(fixture{}, "dev")
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{
		{"GET", "/api/health", "", 200},
		{"GET", "/api/topology?context=installed", "", 200},
		{"GET", "/api/topology?context=planned&planId=expansion", "", 200},
		{"GET", "/api/topology?context=planned", "", 400},
		{"GET", "/api/topology?context=planned&planId=missing", "", 404},
		{"GET", "/api/topology?context=bad", "", 400},
		{"POST", "/api/traces?context=installed", `{"mode":"distribution","device":"edge-01"}`, 200},
		{"POST", "/api/traces?context=installed", `{"mode":"distribution","device":"edge-02"}`, 422},
		{"POST", "/api/traces?context=planned&planId=expansion", `{"mode":"distribution","device":"edge-02"}`, 200},
		{"POST", "/api/traces?expectedRevision=stale", `{"mode":"distribution","device":"edge-01"}`, 409},
		{"POST", "/api/traces", `{"mode":"distribution","unknown":true}`, 400},
		{"POST", "/api/traces", `{} {}`, 400},
		{"POST", "/api/traces", `not json`, 400},
	} {
		t.Run(tc.path+tc.body, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status %d: %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestInstalledTraceContract(t *testing.T) {
	w := httptest.NewRecorder()
	New(fixture{}, "dev").ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/traces?context=installed", strings.NewReader(`{"mode":"point_to_point","start":"edge-01:p1","end":"agg-02:p1"}`)))
	var result pathfinding.Result
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Context != "installed" || len(result.Routes) != 1 || len(result.Routes[0].Hops) != 5 {
		t.Fatalf("invalid trace contract %+v", result)
	}
}

// PR-04: the health answer carries the environment the API was started with.
func TestPR04HealthReportsTheEnvironment(t *testing.T) {
	for _, env := range []string{"dev", "test", "prod"} {
		rec := httptest.NewRecorder()
		New(fixture{}, env).ServeHTTP(rec, httptest.NewRequest("GET", "/api/health", nil))
		var got map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		if rec.Code != 200 || got["status"] != "ok" || got["storage"] != "postgresql" || got["environment"] != env {
			t.Fatalf("%s: %d %v", env, rec.Code, got)
		}
	}
}
