// Package dotenv loads the repository's .env file for local commands and tests.
//
// It looks for .env in the working directory and its parents (so `go test`,
// which runs in each package directory, finds the file at the repository root),
// and sets only variables that are not already in the environment: a real
// environment variable always wins. A missing file is not an error.
package dotenv

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Load loads the nearest .env from the working directory upward.
func Load() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return LoadFrom(dir)
}

// LoadFrom loads the nearest .env from dir upward and returns its path, or ""
// when there is none.
func LoadFrom(dir string) (string, error) {
	for {
		path := filepath.Join(dir, ".env")
		data, err := os.ReadFile(path)
		if err == nil {
			values, err := parse(data)
			if err != nil {
				return path, fmt.Errorf("%s: %w", path, err)
			}
			for k, v := range values {
				if _, set := os.LookupEnv(k); !set {
					os.Setenv(k, v)
				}
			}
			return path, nil
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return path, err
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", nil
		}
		dir = parent
	}
}

// parse reads KEY=VALUE lines. Blank lines and lines starting with # are
// skipped, an optional "export " prefix is allowed, a value wrapped in single
// or double quotes is taken literally (a comment may follow the closing quote),
// and an unquoted value ends at a " #" (a # with space or tab before it, or at
// the start of the value).
func parse(data []byte) (map[string]string, error) {
	values := map[string]string{}
	for i, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			return nil, fmt.Errorf("line %d: expected KEY=VALUE", i+1)
		}
		values[key] = parseValue(strings.TrimSpace(value))
	}
	return values, nil
}

// parseValue reads one trimmed value: quoted text literally, otherwise the text
// before an inline " # comment".
func parseValue(value string) string {
	if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') {
		if end := strings.IndexByte(value[1:], value[0]); end >= 0 {
			rest := strings.TrimSpace(value[end+2:])
			if rest == "" || strings.HasPrefix(rest, "#") {
				return value[1 : end+1]
			}
		}
		if value[len(value)-1] == value[0] {
			return value[1 : len(value)-1]
		}
	}
	if strings.HasPrefix(value, "#") {
		return ""
	}
	if i := strings.IndexAny(value, " \t"); i >= 0 {
		for j := i; j < len(value); j++ {
			if value[j] == '#' && (value[j-1] == ' ' || value[j-1] == '\t') {
				return strings.TrimSpace(value[:j])
			}
		}
	}
	return value
}
