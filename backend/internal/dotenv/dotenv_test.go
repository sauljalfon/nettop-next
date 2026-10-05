package dotenv

import (
	"os"
	"path/filepath"
	"testing"
)

func write(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestParseSkipsCommentsAndBlankLinesAndStripsQuotes(t *testing.T) {
	got, err := parse([]byte("# comment\n\nA=1\n  B = two words  \nC=\"quoted # not a comment\"\nD='single'\nexport E=5\nF=x=y\n"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"A": "1", "B": "two words", "C": "quoted # not a comment", "D": "single", "E": "5", "F": "x=y"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %q, want %q", k, got[k], v)
		}
	}
}

func TestParseRejectsALineWithoutKey(t *testing.T) {
	if _, err := parse([]byte("JUSTTEXT\n")); err == nil {
		t.Fatal("expected an error for a line without '='")
	}
}

func TestLoadFromFindsTheFileInAParentAndKeepsRealEnvironment(t *testing.T) {
	root := t.TempDir()
	write(t, root, "DOTENV_TEST_NEW=from-file\nDOTENV_TEST_SET=from-file\n")
	nested := filepath.Join(root, "backend", "internal", "pkg")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DOTENV_TEST_SET", "from-environment")
	t.Setenv("DOTENV_TEST_NEW", "")
	os.Unsetenv("DOTENV_TEST_NEW")

	path, err := LoadFrom(nested)
	if err != nil {
		t.Fatal(err)
	}
	if path != filepath.Join(root, ".env") {
		t.Errorf("loaded %q, want the root .env", path)
	}
	if got := os.Getenv("DOTENV_TEST_NEW"); got != "from-file" {
		t.Errorf("DOTENV_TEST_NEW = %q, want from-file", got)
	}
	if got := os.Getenv("DOTENV_TEST_SET"); got != "from-environment" {
		t.Errorf("a real environment variable was overwritten: %q", got)
	}
}

func TestLoadFromWithoutAFileIsNotAnError(t *testing.T) {
	path, err := LoadFrom(t.TempDir())
	if err != nil || path != "" {
		t.Fatalf("got %q, %v; want no file and no error", path, err)
	}
}
