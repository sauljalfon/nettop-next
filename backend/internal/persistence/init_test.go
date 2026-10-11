package persistence

import (
	"context"
	"regexp"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
)

// PR-01: init on a migrated empty database creates a root with a revision and
// nothing else, and a plan can be made on it.
func TestPR01InitCreatesAnEmptyRootAPlanCanBeMadeOn(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	if _, err := s.Installed(ctx); err == nil {
		t.Fatal("a migrated database has no installed root before init")
	}
	created, err := s.Init(ctx)
	if err != nil || !created {
		t.Fatalf("Init = %v, %v; want created", created, err)
	}
	snap, err := s.Installed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^init-\d{8}T\d{6}Z-[A-Z0-9]{6}$`).MatchString(snap.Revision) {
		t.Fatalf("revision %q does not look like init-<UTC time>-<6 characters>", snap.Revision)
	}
	if n := len(snap.Networks) + len(snap.Sites) + len(snap.Nodes) + len(snap.Racks) + len(snap.Equipment) + len(snap.Endpoints) + len(snap.Links) + len(snap.Subpanels); n != 0 {
		t.Fatalf("init loaded %d objects, want none", n)
	}
	if snap.Site != "" || snap.Room != "" {
		t.Fatalf("legacy site/room = %q/%q, want empty", snap.Site, snap.Room)
	}
	plan, err := s.CreatePlan(ctx, "First draft", snap.Revision)
	if err != nil {
		t.Fatalf("a plan on the empty root: %v", err)
	}
	if plan.BaseRevision != snap.Revision {
		t.Fatalf("plan base %q, want %q", plan.BaseRevision, snap.Revision)
	}
}

// PR-02: init is safe to repeat; seed refuses an initialized database; init
// after seed leaves the seeded data and revision alone.
func TestPR02InitIsRepeatableAndSeedAndInitDoNotOverwriteEachOther(t *testing.T) {
	ctx := context.Background()
	s, _ := testStore(t)
	if _, err := s.Init(ctx); err != nil {
		t.Fatal(err)
	}
	first, _ := s.Installed(ctx)
	created, err := s.Init(ctx)
	if err != nil || created {
		t.Fatalf("second Init = %v, %v; want a no-op", created, err)
	}
	if again, _ := s.Installed(ctx); again.Revision != first.Revision {
		t.Fatalf("second init changed the revision %q → %q", first.Revision, again.Revision)
	}
	if err := s.Seed(ctx, acceptance.Installed()); err == nil {
		t.Fatal("seed after init must be refused")
	}
	if after, _ := s.Installed(ctx); after.Revision != first.Revision || len(after.Equipment) != 0 {
		t.Fatal("a refused seed changed the database")
	}

	seeded, _ := testStore(t)
	if err := seeded.Seed(ctx, acceptance.Installed()); err != nil {
		t.Fatal(err)
	}
	before, _ := seeded.Installed(ctx)
	created, err = seeded.Init(ctx)
	if err != nil || created {
		t.Fatalf("Init on a seeded database = %v, %v; want a no-op", created, err)
	}
	after, _ := seeded.Installed(ctx)
	if after.Revision != before.Revision || len(after.Equipment) != len(before.Equipment) || len(after.Networks) != len(before.Networks) {
		t.Fatal("init after seed changed the seeded data")
	}
}

// Two inits at once create one root.
func TestInitRacesCreateOneRoot(t *testing.T) {
	ctx := context.Background()
	s, _ := testStore(t)
	results := make(chan bool, 4)
	for i := 0; i < 4; i++ {
		go func() {
			created, err := s.Init(ctx)
			if err != nil {
				t.Error(err)
			}
			results <- created
		}()
	}
	made := 0
	for i := 0; i < 4; i++ {
		if <-results {
			made++
		}
	}
	if made != 1 {
		t.Fatalf("%d inits created a root, want exactly 1", made)
	}
}

// PR-03: the error on an uninitialized database names init, never the seed.
func TestPR03UninitializedErrorNamesInitAndNotTheSeed(t *testing.T) {
	s, _ := testStore(t)
	_, err := s.Installed(context.Background())
	if err == nil {
		t.Fatal("want an error")
	}
	want := "installed topology is not initialized; run `go run ./cmd/db init`"
	if err.Error() != want {
		t.Fatalf("got %q, want %q", err, want)
	}
	if strings.Contains(strings.ToLower(err.Error()), "seed") {
		t.Fatal("the message must not mention the seed")
	}
}
