// testserver is ONLY for browser tests. It creates an isolated PostgreSQL schema,
// applies migrations, seeds it explicitly, and drops that schema on shutdown.
package main

import (
	"context"
	"flag"
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
	"nettop.local/backend/internal/scalefixture"
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
	fixture := flag.String("fixture", "acceptance", "acceptance (with the browser-test additions and the Expansion draft) or campus (the generated scale fixture, no drafts)")
	addr := flag.String("addr", "127.0.0.1:18080", "listen address")
	flag.Parse()
	if *fixture != "acceptance" && *fixture != "campus" {
		return fmt.Errorf("unknown fixture %q: use acceptance or campus", *fixture)
	}
	if _, err := dotenv.Load(); err != nil {
		return err
	}
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("TEST_DATABASE_URL is required")
	}
	setup, cancel := context.WithTimeout(ctx, 5*time.Minute)
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
	if *fixture == "campus" {
		err = store.Seed(setup, scalefixture.Campus())
	} else {
		err = store.Seed(setup, browserBase(), expansion())
	}
	if err != nil {
		return err
	}
	server := &http.Server{Addr: *addr, Handler: httpapi.New(store), ReadHeaderTimeout: 5 * time.Second}
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

// browserBase is the acceptance fixture plus one empty 42U rack in its own
// site and node ("Annex"), so browser tests can check a tall cabinet. It holds
// no equipment, so every count and map in the acceptance example is unchanged.
func browserBase() topology.Snapshot {
	s := acceptance.Installed()
	s.Sites = append(s.Sites, topology.Site{ID: "site-annex", Name: "Annex"})
	s.Nodes = append(s.Nodes, topology.LocationNode{ID: "node-annex", SiteID: "site-annex", Name: "Annex Hall"})
	s.Racks = append(s.Racks, topology.Rack{ID: "rack-t42", NodeID: "node-annex", Name: "Rack T42", Units: 42})
	return s
}
