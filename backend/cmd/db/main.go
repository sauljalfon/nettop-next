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

// usage: go run ./cmd/db migrate | seed [-fixture acceptance|campus]
//
// seed refuses a database that already holds data. The campus fixture is the
// generated scale campus (internal/scalefixture): development data for size
// checks only, never for a shared or real database. The default stays the
// acceptance fixture.
func main() {
	if len(os.Args) < 2 || (os.Args[1] != "migrate" && os.Args[1] != "seed") {
		log.Fatal("usage: go run ./cmd/db migrate | seed [-fixture acceptance|campus]")
	}
	command := os.Args[1]
	flags := flag.NewFlagSet(command, flag.ExitOnError)
	fixture := flags.String("fixture", "acceptance", "seed only: acceptance, or campus (generated scale fixture, development only)")
	if err := flags.Parse(os.Args[2:]); err != nil {
		log.Fatal(err)
	}
	if command == "migrate" && flags.NFlag() > 0 {
		log.Fatal("migrate takes no flags")
	}
	if *fixture != "acceptance" && *fixture != "campus" {
		log.Fatalf("unknown fixture %q: use acceptance or campus", *fixture)
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
	case command == "migrate":
		err = s.Migrate(ctx)
	case *fixture == "campus":
		err = s.Seed(ctx, scalefixture.Campus())
	default:
		err = s.Seed(ctx, acceptance.Installed())
	}
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%s completed", command)
}
