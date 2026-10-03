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
	"nettop.local/backend/internal/sample"
	"nettop.local/backend/internal/topology"
)

// The snapshot contract exposes structured HDF identities; labels are display only.
func TestTopologyExposesHDFSubpanelsAndEndpointIdentity(t *testing.T) {
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
	schema := fmt.Sprintf("api_hdf_%d", time.Now().UnixNano())
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
	base := sample.Installed()
	sample.HDF("hdf-01", "HDF-01", "rack-04", 2, 3, 2).AddTo(&base)
	if err = store.Seed(ctx, base, sample.Expansion()); err != nil {
		t.Fatal(err)
	}
	h := New(store)
	for _, path := range []string{"/api/topology", "/api/topology?context=planned&planId=expansion"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
		var s topology.Snapshot
		if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil {
			t.Fatal(err)
		}
		if len(s.Subpanels) != 8 || len(s.Endpoints) < 96 {
			t.Fatalf("%s: subpanels=%d endpoints=%d", path, len(s.Subpanels), len(s.Endpoints))
		}
		if !strings.Contains(w.Body.String(), `"row":2,"column":"D"`) || !strings.Contains(w.Body.String(), `"subpanelId":"hdf-01:sp-2D"`) || strings.Contains(w.Body.String(), `"subpanel":`) {
			t.Fatalf("%s: missing structured subpanel fields", path)
		}
	}
}
