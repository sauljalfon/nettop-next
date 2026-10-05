// testserver is ONLY for browser tests. It creates an isolated PostgreSQL schema,
// applies migrations, seeds it explicitly, and drops that schema on shutdown.
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/dotenv"
	"nettop.local/backend/internal/httpapi"
	"nettop.local/backend/internal/persistence"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if _, err := dotenv.Load(); err != nil {
		return err
	}
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("TEST_DATABASE_URL is required")
	}
	setup, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	admin, err := pgxpool.New(setup, dsn)
	if err != nil {
		return err
	}
	defer admin.Close()
	schema := fmt.Sprintf("e2e_%d", time.Now().UnixNano())
	if _, err = admin.Exec(setup, "CREATE SCHEMA "+schema); err != nil {
		return err
	}
	defer func() {
		cleanup, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		if _, err := admin.Exec(cleanup, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			log.Printf("cleanup %s: %v", schema, err)
		}
	}()
	u, err := url.Parse(dsn)
	if err != nil {
		return err
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	store, err := persistence.Open(setup, u.String())
	if err != nil {
		return err
	}
	defer store.Close()
	if err = store.Migrate(setup); err != nil {
		return err
	}
	if err = store.Seed(setup, acceptance.Installed(), expansion()); err != nil {
		return err
	}
	server := &http.Server{Addr: "127.0.0.1:18080", Handler: httpapi.New(store), ReadHeaderTimeout: 5 * time.Second}
	finished := make(chan error, 1)
	go func() { finished <- server.ListenAndServe() }()
	select {
	case err := <-finished:
		return err
	case <-ctx.Done():
		shutdown, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		return server.Shutdown(shutdown)
	}
}

// expansion is the browser-test draft on the acceptance fixture: a new access
// switch in Rack A03 cabled to the otherwise uncabled AGG-15.
func expansion() planning.Plan {
	return planning.Plan{
		ID: "expansion", Name: "Expansion", Revision: "1", BaseRevision: "acceptance-1",
		Equipment: []topology.Equipment{{ID: "edge-18", Name: "EDGE-18", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 6, Height: 1}},
		Endpoints: []topology.Endpoint{{ID: "edge-18:p1", EquipmentID: "edge-18", Label: "Port 1"}},
		Links:     []topology.Link{{ID: "planned-cable-18", A: "edge-18:p1", B: "agg-15:p1", Kind: "cable"}},
	}
}
