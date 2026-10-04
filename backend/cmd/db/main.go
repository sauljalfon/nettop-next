package main

import (
	"context"
	"log"
	"os"
	"time"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/persistence"
)

func main() {
	if len(os.Args) != 2 || (os.Args[1] != "migrate" && os.Args[1] != "seed") {
		log.Fatal("usage: go run ./cmd/db migrate|seed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	s, err := persistence.Open(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer s.Close()
	if os.Args[1] == "migrate" {
		err = s.Migrate(ctx)
	} else {
		err = s.Seed(ctx, acceptance.Installed())
	}
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%s completed", os.Args[1])
}
