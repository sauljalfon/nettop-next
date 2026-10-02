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
	"nettop.local/backend/internal/httpapi"
	"nettop.local/backend/internal/persistence"
	"nettop.local/backend/internal/sample"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
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
	if err = store.Seed(setup, sample.Installed(), sample.Expansion()); err != nil {
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
