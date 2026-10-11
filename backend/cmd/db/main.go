package main

import (
	"context"
	"flag"
	"log"
	"os"
	"time"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/dotenv"
	"nettop.local/backend/internal/persistence"
	"nettop.local/backend/internal/scalefixture"
)

// usage: go run ./cmd/db migrate | init | seed [-fixture acceptance|campus|empty]
//
// A new database is started with migrate, then init: init creates the empty
// installed root (no networks, sites or anything else) when there is none and
// otherwise prints "already initialized" and changes nothing, so a deployment
// can run both on every rollout. seed is development data only and refuses an
// initialized database. seed refuses a database that already holds data. The campus fixture is the
// generated scale campus (internal/scalefixture): development data for size
// checks only, never for a shared or real database. The default stays the
// acceptance fixture.
func main() {
	if len(os.Args) < 2 || (os.Args[1] != "migrate" && os.Args[1] != "init" && os.Args[1] != "seed") {
		log.Fatal("usage: go run ./cmd/db migrate | init | seed [-fixture acceptance|campus|empty]")
	}
	command := os.Args[1]
	flags := flag.NewFlagSet(command, flag.ExitOnError)
	fixture := flags.String("fixture", "acceptance", "seed only: acceptance, campus (generated scale fixture, development only) or empty (the three campus networks and nothing else, for the data-entry rehearsal)")
	if err := flags.Parse(os.Args[2:]); err != nil {
		log.Fatal(err)
	}
	if command != "seed" && flags.NFlag() > 0 {
		log.Fatalf("%s takes no flags", command)
	}
	if *fixture != "acceptance" && *fixture != "campus" && *fixture != "empty" {
		log.Fatalf("unknown fixture %q: use acceptance, campus or empty", *fixture)
	}
	if _, err := dotenv.Load(); err != nil {
		log.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	s, err := persistence.Open(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer s.Close()
	switch {
	case command == "init":
		var created bool
		if created, err = s.Init(ctx); err == nil && !created {
			log.Print("already initialized")
			return
		}
	case command == "migrate":
		err = s.Migrate(ctx)
	case *fixture == "campus":
		err = s.Seed(ctx, scalefixture.Campus())
	case *fixture == "empty":
		err = s.Seed(ctx, scalefixture.Empty())
	default:
		err = s.Seed(ctx, acceptance.Installed())
	}
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%s completed", command)
}
