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
	"nettop.local/backend/internal/persistence"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/sample"
)

func TestSavedPlanAPI(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires TEST_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	schema := fmt.Sprintf("api_test_%d", time.Now().UnixNano())
	if _, err = pool.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	store, err := persistence.Open(ctx, url+sep+"search_path="+schema)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = store.Seed(ctx, sample.Installed(), sample.Expansion()); err != nil {
		t.Fatal(err)
	}
	h := New(store)
	call := func(method, path, body string, status int) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(method, path, strings.NewReader(body)))
		if w.Code != status {
			t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body.String())
		}
		return w
	}
	call("POST", "/api/plans", `{"name":" ","expectedBaseRevision":"sample-1"}`, 422)
	call("POST", "/api/plans", `{"name":"Install","expectedBaseRevision":"old"}`, 409)
	w := call("POST", "/api/plans", `{"name":"Install","expectedBaseRevision":"sample-1"}`, 201)
	var p planning.Plan
	if err = json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	path := "/api/plans/" + p.ID + "/commands"
	body := `{"type":"add_equipment","expectedRevision":"1","equipment":{"name":"EDGE-03","kind":"switch","role":"access","rackId":"rack-03","unit":4,"height":1,"portCount":2}}`
	w = call("POST", path, body, 200)
	if err = json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	call("POST", path, body, 409)
	call("POST", path, `{"type":"add_cable","expectedRevision":"2","cable":{"a":"edge-01:p1","b":"agg-02:p2"}}`, 422)
	cable := fmt.Sprintf(`{"type":"add_cable","expectedRevision":"2","cable":{"a":%q,"b":"agg-02:p2"}}`, p.Endpoints[0].ID)
	call("POST", path, cable, 200)
	call("GET", "/api/plans/"+p.ID, "", 200)
	call("GET", "/api/plans", "", 200)
	call("GET", "/api/topology?context=planned&planId="+p.ID, "", 200)
	call(http.MethodPost, "/api/traces?context=planned&planId="+p.ID, fmt.Sprintf(`{"mode":"aggregation","device":%q}`, p.Equipment[0].ID), 200)
	call(http.MethodPost, "/api/traces?context=installed", fmt.Sprintf(`{"mode":"aggregation","device":%q}`, p.Equipment[0].ID), 422)
	call("POST", path, `{"type":"add_cable","expectedRevision":"3","extra":true}`, 400)
	call("POST", "/api/plans/missing/commands", `{"type":"add_cable","expectedRevision":"1"}`, 404)
}
